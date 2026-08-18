/**
 * L'envoi d'une commande : la clef d'idempotence et le 409.
 *
 * Ce sont les deux comportements qui font qu'une partie jouée depuis un
 * téléphone dans un train ne se corrompt pas :
 *
 *  - une coupure réseau est réessayée **avec la même clef**, pour que le
 *    serveur reconnaisse le doublon au lieu de déplacer le héros deux fois ;
 *  - un `409` rend la clef à l'appelant avec l'état à jour, pour que le geste
 *    du joueur soit rejouable plutôt que perdu.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { IdempotencyKeySchema } from '@auvergne/protocol';
import type { PartyStatePayload } from '@auvergne/protocol';
import type { Command } from '@auvergne/engine';
import { installerTransport } from './api.js';
import {
  ATTENTE_MAX_MS,
  attenteRetrait,
  envoyerCommandeFiable,
  nouvelleCleIdempotence,
} from './commandes.js';

const COMMANDE: Command = { type: 'EndTurn' };

/** Ce que le serveur renverrait pour une commande acceptée. */
function succes(seq: number): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      rejeu: false,
      seq,
      activePlayer: 'P2',
      monTour: false,
      journal: ['Le tour passe à la bannière suivante.'],
      toursIa: [],
      etat: { code: 'FOREZ-7K2P', seq, statut: 'en_cours', etat: 'x' },
    }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  );
}

/** Corps de commandes réellement envoyés au serveur. */
function corpsDe(init: RequestInit): { cleIdempotence: string; seqAttendu: number } {
  return JSON.parse(String(init.body)) as { cleIdempotence: string; seqAttendu: number };
}

const immediat = (): Promise<void> => Promise.resolve();

afterEach(() => {
  installerTransport(null);
});

describe('clef d’idempotence', () => {
  it('produit une clef que le protocole accepte', () => {
    for (let i = 0; i < 20; i++) {
      const cle = nouvelleCleIdempotence();
      expect(IdempotencyKeySchema.safeParse(cle).success).toBe(true);
    }
  });

  it('ne produit jamais deux fois la même', () => {
    const vues = new Set<string>();
    for (let i = 0; i < 200; i++) vues.add(nouvelleCleIdempotence());
    expect(vues.size).toBe(200);
  });
});

describe('retrait exponentiel', () => {
  it('double à chaque tentative et reste borné', () => {
    expect(attenteRetrait(1, 700, ATTENTE_MAX_MS)).toBe(700);
    expect(attenteRetrait(2, 700, ATTENTE_MAX_MS)).toBe(1400);
    expect(attenteRetrait(3, 700, ATTENTE_MAX_MS)).toBe(2800);
    expect(attenteRetrait(9, 700, ATTENTE_MAX_MS)).toBe(ATTENTE_MAX_MS);
  });
});

describe('envoi fiable', () => {
  it('réémet la MÊME clef d’idempotence après un échec réseau', async () => {
    const clefs: string[] = [];
    let appels = 0;
    installerTransport((_url, init) => {
      appels += 1;
      clefs.push(corpsDe(init).cleIdempotence);
      /* Deux coupures, puis le réseau revient. */
      if (appels < 3) return Promise.reject(new TypeError('Failed to fetch'));
      return Promise.resolve(succes(18));
    });

    const resultat = await envoyerCommandeFiable('FOREZ-7K2P', COMMANDE, 17, { dormir: immediat });

    expect(resultat.issue).toBe('applique');
    expect(resultat.tentatives).toBe(3);
    expect(clefs).toHaveLength(3);
    expect(new Set(clefs).size).toBe(1);
    expect(clefs[0]).toBe(resultat.cle);
  });

  it('réutilise la clef fournie par l’appelant, pour un renvoi après conflit', async () => {
    const clefs: string[] = [];
    installerTransport((_url, init) => {
      clefs.push(corpsDe(init).cleIdempotence);
      return Promise.resolve(succes(20));
    });

    const cle = nouvelleCleIdempotence();
    const resultat = await envoyerCommandeFiable('FOREZ-7K2P', COMMANDE, 19, {
      cle,
      dormir: immediat,
    });

    expect(resultat.cle).toBe(cle);
    expect(clefs).toEqual([cle]);
  });

  it('abandonne après le nombre de tentatives, sans perdre la clef', async () => {
    const clefs: string[] = [];
    installerTransport((_url, init) => {
      clefs.push(corpsDe(init).cleIdempotence);
      return Promise.reject(new TypeError('Failed to fetch'));
    });

    const resultat = await envoyerCommandeFiable('FOREZ-7K2P', COMMANDE, 3, {
      tentatives: 3,
      dormir: immediat,
    });

    expect(resultat.issue).toBe('echec');
    if (resultat.issue !== 'echec') throw new Error('issue inattendue');
    expect(resultat.temporaire).toBe(true);
    expect(resultat.tentatives).toBe(3);
    expect(new Set(clefs).size).toBe(1);
    expect(clefs[0]).toBe(resultat.cle);
  });

  it('annonce le seq attendu à chaque envoi', async () => {
    let vu = -1;
    installerTransport((_url, init) => {
      vu = corpsDe(init).seqAttendu;
      return Promise.resolve(succes(8));
    });
    await envoyerCommandeFiable('FOREZ-7K2P', COMMANDE, 7, { dormir: immediat });
    expect(vu).toBe(7);
  });
});

describe('conflit 409', () => {
  const etatAJour = {
    code: 'FOREZ-7K2P',
    seq: 42,
    statut: 'en_cours',
    activePlayer: 'P3',
    monSlot: 'P1',
    monTour: false,
    setup: {},
    etat: 'état-sérialisé',
    hash: 'abcd',
    brouillardMasque: true,
    joueurs: [],
    updatedAt: '2026-08-18T10:00:00Z',
    gagnant: null,
  } satisfies PartyStatePayload;

  it('rend l’état à jour, la clef, et ne réessaie pas', async () => {
    let appels = 0;
    installerTransport(() => {
      appels += 1;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            erreur: 'Votre partie était en retard de deux coups.',
            code: 'sequence_perimee',
            etat: etatAJour,
          }),
          { status: 409, headers: { 'content-type': 'application/json' } },
        ),
      );
    });

    const resultat = await envoyerCommandeFiable('FOREZ-7K2P', COMMANDE, 40, { dormir: immediat });

    expect(appels).toBe(1);
    expect(resultat.issue).toBe('conflit');
    if (resultat.issue !== 'conflit') throw new Error('issue inattendue');
    expect(resultat.etat?.seq).toBe(42);
    expect(resultat.message).toBe('Votre partie était en retard de deux coups.');
    expect(IdempotencyKeySchema.safeParse(resultat.cle).success).toBe(true);
  });

  it('permet de rejouer le geste avec la même clef une fois resynchronisé', async () => {
    const clefs: string[] = [];
    let appels = 0;
    installerTransport((_url, init) => {
      appels += 1;
      clefs.push(corpsDe(init).cleIdempotence);
      if (appels === 1) {
        return Promise.resolve(
          new Response(JSON.stringify({ erreur: 'En retard.', code: 'sequence_perimee', etat: etatAJour }), {
            status: 409,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(succes(43));
    });

    const premier = await envoyerCommandeFiable('FOREZ-7K2P', COMMANDE, 40, { dormir: immediat });
    if (premier.issue !== 'conflit') throw new Error('issue inattendue');

    const second = await envoyerCommandeFiable('FOREZ-7K2P', COMMANDE, premier.etat?.seq ?? 0, {
      cle: premier.cle,
      dormir: immediat,
    });

    expect(second.issue).toBe('applique');
    expect(clefs).toEqual([premier.cle, premier.cle]);
    expect(corpsDe({ body: JSON.stringify({ cleIdempotence: premier.cle, seqAttendu: 42 }) }).seqAttendu).toBe(42);
  });

  it('ne réessaie pas un refus définitif', async () => {
    let appels = 0;
    installerTransport(() => {
      appels += 1;
      return Promise.resolve(
        new Response(JSON.stringify({ erreur: "Ce n'est pas votre tour.", code: 'pas_votre_tour' }), {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
      );
    });

    const resultat = await envoyerCommandeFiable('FOREZ-7K2P', COMMANDE, 5, { dormir: immediat });
    expect(appels).toBe(1);
    expect(resultat.issue).toBe('echec');
    if (resultat.issue !== 'echec') throw new Error('issue inattendue');
    expect(resultat.temporaire).toBe(false);
    expect(resultat.message).toBe("Ce n'est pas votre tour.");
  });
});
