/**
 * Le rythme d'interrogation — `docs/04-MULTIJOUEUR.md` §2.
 *
 * C'est la seule partie de la boucle qui décide quelque chose ; le reste n'est
 * que plomberie. On vérifie donc les quatre situations du document, leurs
 * frontières exactes, et surtout qu'aucune valeur n'a été réinventée : chaque
 * attente est comparée à `POLL_INTERVALS`, jamais à un nombre écrit à la main.
 */

import { afterEach, describe, expect, it } from 'vitest';
import { POLL_INTERVALS, TITRE_MON_TOUR } from '@auvergne/protocol';
import { SessionPartie, rythmePoll } from './session.js';
import { installerTransport } from './api.js';
import { partiesEnAttente, reinitialiserRappels, titreDocument } from './rappels.js';

describe('rythmePoll', () => {
  it("n'interroge pas quand c'est mon tour : rien ne peut changer sans moi", () => {
    expect(rythmePoll({ visible: true, monTour: true, inactiviteMs: 0 })).toBeNull();
    expect(rythmePoll({ visible: false, monTour: true, inactiviteMs: 0 })).toBeNull();
    expect(
      rythmePoll({ visible: true, monTour: true, inactiviteMs: POLL_INTERVALS.inactiviteMs * 3 }),
    ).toBeNull();
  });

  it('interroge toutes les cinq secondes, onglet actif, quand ce n’est pas mon tour', () => {
    expect(rythmePoll({ visible: true, monTour: false, inactiviteMs: 0 })).toBe(POLL_INTERVALS.actif);
  });

  it('ralentit en arrière-plan', () => {
    expect(rythmePoll({ visible: false, monTour: false, inactiviteMs: 0 })).toBe(
      POLL_INTERVALS.arrierePlan,
    );
  });

  it('s’assoupit après le délai d’inactivité, et l’assoupissement l’emporte', () => {
    const dort = POLL_INTERVALS.inactiviteMs;
    expect(rythmePoll({ visible: true, monTour: false, inactiviteMs: dort })).toBe(
      POLL_INTERVALS.assoupi,
    );
    expect(rythmePoll({ visible: false, monTour: false, inactiviteMs: dort })).toBe(
      POLL_INTERVALS.assoupi,
    );
  });

  it('reste vif une milliseconde avant le seuil d’inactivité', () => {
    expect(
      rythmePoll({ visible: true, monTour: false, inactiviteMs: POLL_INTERVALS.inactiviteMs - 1 }),
    ).toBe(POLL_INTERVALS.actif);
    expect(
      rythmePoll({ visible: false, monTour: false, inactiviteMs: POLL_INTERVALS.inactiviteMs - 1 }),
    ).toBe(POLL_INTERVALS.arrierePlan);
  });

  it('ordonne les rythmes du plus vif au plus économe', () => {
    expect(POLL_INTERVALS.actif).toBeLessThan(POLL_INTERVALS.arrierePlan);
    expect(POLL_INTERVALS.arrierePlan).toBeLessThan(POLL_INTERVALS.assoupi);
  });
});

/* ── L'économie de bande passante ────────────────────────────────────────── */

/** Un serveur de papier : un salon, un pouls réglable, un état. */
function serveurDePapier(): { vues: string[]; seq: () => number; avancer: () => void } {
  const vues: string[] = [];
  let seq = 4;

  const salon = (): unknown => ({
    code: 'FOREZ-7K2P',
    lien: 'https://exemple/#/en-ligne/FOREZ-7K2P',
    statut: 'en_cours',
    seq,
    activePlayer: 'P2',
    bannieres: 2,
    duree: 'standard',
    victoire: 'couronne',
    graine: 12,
    joueurs: [
      { slot: 'P1', couleur: '#c9a227', kind: 'humain', nom: 'Thibaut', faction: 'granit', heros: 'paul', avatar: 'paul', depart: null, profilIa: null, pret: true, moi: true, dernierVuLe: null },
      { slot: 'P2', couleur: '#6e1f2a', kind: 'humain', nom: 'Jean', faction: 'ermitage', heros: 'jules', avatar: 'jules', depart: null, profilIa: null, pret: true, moi: false, dernierVuLe: null },
    ],
    hote: true,
    monSlot: 'P1',
    creeLe: '2026-08-01T09:00:00Z',
    majLe: '2026-08-18T09:00:00Z',
    gagnant: null,
    obstacles: [],
    versions: { moteur: '1', contenu: '1', carte: '1' },
  });

  const etat = (): unknown => ({
    code: 'FOREZ-7K2P',
    seq,
    statut: 'en_cours',
    activePlayer: 'P2',
    monSlot: 'P1',
    monTour: false,
    setup: {},
    etat: 'état-sérialisé',
    hash: 'abcd',
    brouillardMasque: true,
    joueurs: [],
    updatedAt: '2026-08-18T09:00:00Z',
    gagnant: null,
  });

  installerTransport((url) => {
    vues.push(url);
    const corps = url.includes('/pouls')
      ? { seq, activePlayer: 'P2', updatedAt: '2026-08-18T09:00:00Z' }
      : url.includes('/etat')
        ? etat()
        : salon();
    return Promise.resolve(
      new Response(JSON.stringify(corps), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });

  return {
    vues,
    seq: () => seq,
    avancer: () => {
      seq += 1;
    },
  };
}

describe('boucle d’interrogation', () => {
  afterEach(() => {
    installerTransport(null);
    reinitialiserRappels();
  });

  it('n’interroge que le pouls tant que la séquence ne bouge pas', async () => {
    const serveur = serveurDePapier();
    const session = new SessionPartie('FOREZ-7K2P', { visible: () => true, maintenant: () => 0 });

    await session.rafraichir(true);
    expect(serveur.vues.filter((u) => u.includes('/etat'))).toHaveLength(1);

    serveur.vues.length = 0;
    await session.rafraichir(false);
    await session.rafraichir(false);
    await session.rafraichir(false);

    /* Trois tours de boucle, trois pouls, aucun téléchargement d'état. */
    expect(serveur.vues).toHaveLength(3);
    expect(serveur.vues.every((u) => u.includes('/pouls'))).toBe(true);
  });

  it('retélécharge l’état dès que la séquence change, en annonçant son retard', async () => {
    const serveur = serveurDePapier();
    const session = new SessionPartie('FOREZ-7K2P', { visible: () => true, maintenant: () => 0 });

    await session.rafraichir(true);
    serveur.vues.length = 0;
    serveur.avancer();
    await session.rafraichir(false);

    expect(serveur.vues.some((u) => u.includes('/pouls'))).toBe(true);
    expect(serveur.vues.some((u) => u.includes('/etat?depuis=4'))).toBe(true);
    expect(session.getSnapshot().seq).toBe(5);
  });

  it('tient l’attente, le rythme et le compte des rappels', async () => {
    const serveur = serveurDePapier();
    const session = new SessionPartie('FOREZ-7K2P', { visible: () => true, maintenant: () => 0 });

    await session.rafraichir(true);
    const instantane = session.getSnapshot();

    expect(instantane.statut).toBe('en_cours');
    expect(instantane.monTour).toBe(false);
    expect(instantane.attente).toBe('En attente de Jean');
    expect(instantane.horsLigne).toBe(false);
    /* Ce n'est pas mon tour et l'onglet est actif : rythme vif. */
    expect(session.rythmeCourant()).toBe(POLL_INTERVALS.actif);
    /* Et aucun rappel ne doit s'allumer : la main n'est pas à moi. */
    expect(partiesEnAttente()).toBe(0);
    expect(serveur.seq()).toBe(4);
  });

  it('passe hors ligne sans effacer ce qu’elle savait', async () => {
    serveurDePapier();
    const session = new SessionPartie('FOREZ-7K2P', { visible: () => true, maintenant: () => 0 });
    await session.rafraichir(true);

    installerTransport(() => Promise.reject(new TypeError('Failed to fetch')));
    await session.rafraichir(false);

    const instantane = session.getSnapshot();
    expect(instantane.horsLigne).toBe(true);
    expect(instantane.erreur).toBeNull();
    expect(instantane.salon?.code).toBe('FOREZ-7K2P');
    expect(instantane.seq).toBe(4);
  });
});

describe('titreDocument', () => {
  it('rend le titre de la route quand aucune partie n’attend', () => {
    expect(titreDocument('Accueil', 0)).toBe('Accueil');
  });

  it('bascule sur le titre du protocole dès qu’une partie attend', () => {
    expect(titreDocument('Accueil', 1)).toBe(TITRE_MON_TOUR);
    expect(titreDocument('Accueil', 4)).toBe(TITRE_MON_TOUR);
  });
});
