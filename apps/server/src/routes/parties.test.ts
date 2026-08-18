/**
 * Parties en ligne asynchrones — parcours de bout en bout.
 *
 * Le serveur est **le vrai** : `buildServer()` monte Fastify, le stockage, le
 * moteur branché par `bootstrapEngine`, la carte réelle et le contenu réel.
 * Rien n'est simulé, rien n'est bouchonné ; seules les requêtes passent par
 * `app.inject()` au lieu d'un socket.
 *
 * Le scénario est exactement celui de `docs/04-MULTIJOUEUR.md` : Thibaut crée
 * la partie, deux cousins prennent une bannière, l'hôte lève les bannières,
 * le joueur actif envoie une commande, le joueur inactif se fait refuser la
 * même, un rejeu de la même clef d'idempotence ne l'applique pas deux fois, et
 * le pouls change de `seq`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { PARTIES_API, PLAYER_TOKEN_HEADER } from '@auvergne/protocol';
import type {
  PartyCommandPayload,
  PartyCreatedPayload,
  PartyJoinedPayload,
  PartyPulsePayload,
  PartySalonPayload,
  PartyStatePayload,
} from '@auvergne/protocol';
import { buildServer, type BuiltServer } from '../server.js';
import { setCookies } from '../testkit.js';

/* ── Un « navigateur » par cousin : son cookie, son jeton ───────────────── */

interface Navigateur {
  nom: string;
  cookie: string | null;
  jeton: string | null;
  appel(options: InjectOptions): Promise<LightMyRequestResponse>;
}

function navigateur(built: BuiltServer, nom: string): Navigateur {
  const nav: Navigateur = {
    nom,
    cookie: null,
    jeton: null,
    async appel(options: InjectOptions): Promise<LightMyRequestResponse> {
      const headers: Record<string, string> = {
        ...((options.headers as Record<string, string> | undefined) ?? {}),
      };
      if (nav.cookie !== null) headers.cookie = nav.cookie;
      if (nav.jeton !== null) headers[PLAYER_TOKEN_HEADER] = nav.jeton;
      const reponse = await built.app.inject({ ...options, headers });
      for (const brut of setCookies(reponse)) {
        const [paire] = brut.split(';');
        if (paire.startsWith('forez_identite=')) nav.cookie = paire;
      }
      return reponse;
    },
  };
  return nav;
}

function corps<T>(reponse: LightMyRequestResponse): T {
  return JSON.parse(reponse.body) as T;
}

/* ── Le scénario ────────────────────────────────────────────────────────── */

describe('parties en ligne asynchrones', () => {
  let built: BuiltServer;
  let thibaut: Navigateur;
  let jean: Navigateur;
  let code = '';

  beforeAll(async () => {
    built = await buildServer({
      silent: true,
      production: false,
      databaseUrl: null,
      forceMemoryStorage: true,
      dataDir: '/inutilise',
      clientDirOverride: null,
      commit: 'essai0000',
    });
    thibaut = navigateur(built, 'Thibaut');
    jean = navigateur(built, 'Jean');
  });

  afterAll(async () => {
    await built.app.close();
    await built.ctx.storage.close();
  });

  it("crée une partie et rend un code, un lien et un jeton d'hôte", async () => {
    const reponse = await thibaut.appel({
      method: 'POST',
      url: PARTIES_API.racine,
      payload: { bannieres: 2, duree: 'standard', victoire: 'couronne', graine: 20260818 },
    });
    expect(reponse.statusCode).toBe(201);

    const cree = corps<PartyCreatedPayload>(reponse);
    expect(cree.code).toMatch(/^[A-Z]{4,10}-[A-HJ-NP-Z2-9]{4}$/);
    expect(cree.jeton).toMatch(/^[0-9a-f]{32}$/);
    expect(cree.lien).toContain(`#/en-ligne/${cree.code}`);
    expect(cree.salon.statut).toBe('salon');
    expect(cree.salon.hote).toBe(true);
    expect(cree.salon.joueurs).toHaveLength(2);
    expect(cree.salon.joueurs.every((s) => s.kind === 'libre')).toBe(true);
    // Le salon dit en français ce qui manque encore.
    expect(cree.salon.obstacles.length).toBeGreaterThan(0);

    code = cree.code;
  });

  it('laisse deux cousins prendre chacun une bannière', async () => {
    const premier = await thibaut.appel({
      method: 'POST',
      url: PARTIES_API.rejoindre(code),
      payload: {
        slot: 'P1',
        nom: 'Thibaut',
        faction: 'granit',
        heros: 'thibaut',
        depart: 'arconsat',
      },
    });
    expect(premier.statusCode).toBe(201);
    const rejointA = corps<PartyJoinedPayload>(premier);
    expect(rejointA.jeton).toMatch(/^[0-9a-f]{32}$/);
    thibaut.jeton = rejointA.jeton;

    const second = await jean.appel({
      method: 'POST',
      url: PARTIES_API.rejoindre(code),
      payload: {
        slot: 'P2',
        nom: 'Jean',
        faction: 'ermitage',
        heros: 'agathe',
        depart: 'renaudie',
      },
    });
    expect(second.statusCode).toBe(201);
    const rejointB = corps<PartyJoinedPayload>(second);
    jean.jeton = rejointB.jeton;
    expect(rejointB.jeton).not.toBe(rejointA.jeton);

    // Deux navigateurs distincts : Jean n'est pas l'hôte.
    expect(rejointB.salon.hote).toBe(false);
    expect(rejointB.salon.monSlot).toBe('P2');

    // Le salon est complet : plus aucun obstacle au lancement.
    expect(rejointB.salon.obstacles).toEqual([]);

    // Une bannière déjà prise est refusée, avec un message français.
    const troisieme = await jean.appel({
      method: 'POST',
      url: PARTIES_API.rejoindre(code),
      payload: {
        slot: 'P1',
        nom: 'Loïc',
        faction: 'granit',
        heros: 'paul',
        depart: 'cervieres',
      },
    });
    expect(troisieme.statusCode).toBe(409);
    expect(corps<{ code: string }>(troisieme).code).toBe('banniere_prise');
  });

  it("réserve le lancement à l'hôte, puis lève les bannières", async () => {
    const refus = await jean.appel({ method: 'POST', url: PARTIES_API.lancer(code) });
    expect(refus.statusCode).toBe(403);
    expect(corps<{ code: string }>(refus).code).toBe('reserve_a_l_hote');

    const lancee = await thibaut.appel({ method: 'POST', url: PARTIES_API.lancer(code) });
    expect(lancee.statusCode).toBe(200);
    const salon = corps<PartySalonPayload>(lancee);
    expect(salon.statut).toBe('en_cours');
    expect(salon.activePlayer).toBe('P1');
  });

  it('ne montre à chacun que son propre brouillard', async () => {
    const reponse = await jean.appel({ method: 'GET', url: PARTIES_API.etat(code) });
    expect(reponse.statusCode).toBe(200);
    const etat = corps<PartyStatePayload>(reponse);
    expect(etat.monSlot).toBe('P2');
    expect(etat.monTour).toBe(false);
    expect(etat.brouillardMasque).toBe(true);

    // Le brouillard de P1 est remis à zéro dans la copie servie à Jean ; le
    // sien porte bien des cases explorées autour de son château.
    const brut = JSON.parse(etat.etat) as {
      players: Record<string, { fog: { b: string } }>;
    };
    const brouillardP1 = brut.players.P1.fog.b;
    const brouillardP2 = brut.players.P2.fog.b;
    expect(brouillardP2).not.toBe(brouillardP1);
    expect(Buffer.from(brouillardP1, 'base64').some((o) => o !== 0)).toBe(false);
    expect(Buffer.from(brouillardP2, 'base64').some((o) => o !== 0)).toBe(true);
  });

  it("n'accepte une commande que du joueur actif, une seule fois, et fait avancer le pouls", async () => {
    const avant = corps<PartyPulsePayload>(
      await thibaut.appel({ method: 'GET', url: PARTIES_API.pouls(code) }),
    );
    expect(avant.activePlayer).toBe('P1');

    const envoi = {
      commande: { type: 'EndTurn' },
      cleIdempotence: 'essai-fin-de-tour-1',
      seqAttendu: avant.seq,
    };

    /* — Jean n'est pas le joueur actif : refusé, rien n'a bougé. C'est une
         question d'autorisation, donc 403 (`docs/04-MULTIJOUEUR.md` §4). — */
    const refus = await jean.appel({
      method: 'POST',
      url: PARTIES_API.commande(code),
      payload: envoi,
    });
    expect(refus.statusCode).toBe(403);
    const detail = corps<{ code: string; erreur: string }>(refus);
    expect(detail.code).toBe('pas_ton_tour');
    expect(detail.erreur).toContain('En attente de Thibaut');
    const pendant = corps<PartyPulsePayload>(
      await jean.appel({ method: 'GET', url: PARTIES_API.pouls(code) }),
    );
    expect(pendant.seq).toBe(avant.seq);

    /* — Thibaut, lui, est le joueur actif. — */
    const accepte = await thibaut.appel({
      method: 'POST',
      url: PARTIES_API.commande(code),
      payload: envoi,
    });
    expect(accepte.statusCode).toBe(200);
    const applique = corps<PartyCommandPayload>(accepte);
    expect(applique.ok).toBe(true);
    expect(applique.rejeu).toBe(false);
    expect(applique.seq).toBe(avant.seq + 1);
    expect(applique.activePlayer).toBe('P2');
    expect(applique.monTour).toBe(false);

    /* — Rejeu de la même clef : le résultat déjà calculé, sans réappliquer. — */
    const rejeu = await thibaut.appel({
      method: 'POST',
      url: PARTIES_API.commande(code),
      payload: { ...envoi, seqAttendu: avant.seq },
    });
    expect(rejeu.statusCode).toBe(200);
    const rejoue = corps<PartyCommandPayload>(rejeu);
    expect(rejoue.rejeu).toBe(true);
    expect(rejoue.seq).toBe(applique.seq);
    expect(rejoue.activePlayer).toBe('P2');

    /* — Un client en retard reçoit 409 et l'état à jour, pas un écrasement. — */
    const enRetard = await jean.appel({
      method: 'POST',
      url: PARTIES_API.commande(code),
      payload: {
        commande: { type: 'EndTurn' },
        cleIdempotence: 'essai-fin-de-tour-2',
        seqAttendu: avant.seq,
      },
    });
    expect(enRetard.statusCode).toBe(409);
    const perime = corps<{
      code: string;
      details?: { seq: number };
      etat?: PartyStatePayload;
    }>(enRetard);
    expect(perime.code).toBe('sequence_perimee');
    expect(perime.details?.seq).toBe(applique.seq);
    // « Réponse 409 avec l'état à jour » : le retardataire n'a pas à
    // redemander l'état, et surtout il n'a rien écrasé.
    expect(perime.etat?.seq).toBe(applique.seq);
    expect(perime.etat?.monSlot).toBe('P2');
    expect(perime.etat?.monTour).toBe(true);

    /* — Le pouls a changé de `seq` : c'est ce que les clients interrogent. — */
    const apres = corps<PartyPulsePayload>(
      await jean.appel({ method: 'GET', url: PARTIES_API.pouls(code) }),
    );
    expect(apres.seq).toBe(applique.seq);
    expect(apres.seq).toBeGreaterThan(avant.seq);
    expect(apres.activePlayer).toBe('P2');
    expect(apres.updatedAt).not.toBe(avant.updatedAt);

    /* — Et Jean, maintenant que c'est son tour, est bien accepté. — */
    const tourDeJean = await jean.appel({
      method: 'POST',
      url: PARTIES_API.commande(code),
      payload: {
        commande: { type: 'EndTurn' },
        cleIdempotence: 'essai-fin-de-tour-3',
        seqAttendu: apres.seq,
      },
    });
    expect(tourDeJean.statusCode).toBe(200);
    expect(corps<PartyCommandPayload>(tourDeJean).activePlayer).toBe('P1');
  });

  it("renvoie 304 tant que le `seq` n'a pas bougé", async () => {
    const pouls = corps<PartyPulsePayload>(
      await thibaut.appel({ method: 'GET', url: PARTIES_API.pouls(code) }),
    );
    const inchange = await thibaut.appel({
      method: 'GET',
      url: `${PARTIES_API.etat(code)}?depuis=${String(pouls.seq)}`,
    });
    expect(inchange.statusCode).toBe(304);
  });

  it('liste les parties de ce navigateur et allume le bandeau du bon joueur', async () => {
    const mien = corps<{ parties: { code: string; monTour: boolean; attendu: string | null }[]; monTour: number; bandeau: string | null }>(
      await thibaut.appel({ method: 'GET', url: PARTIES_API.mesParties }),
    );
    const ligne = mien.parties.find((p) => p.code === code);
    expect(ligne).toBeDefined();
    expect(ligne?.monTour).toBe(true);
    expect(mien.bandeau).toBe("C'est ton tour dans une partie.");

    const sien = corps<{ parties: { code: string; monTour: boolean; attendu: string | null }[]; bandeau: string | null }>(
      await jean.appel({ method: 'GET', url: PARTIES_API.mesParties }),
    );
    const sienne = sien.parties.find((p) => p.code === code);
    expect(sienne?.monTour).toBe(false);
    expect(sienne?.attendu).toBe('Thibaut');
    expect(sien.bandeau).toBeNull();
  });

  it('ne laisse pas un cousin faire capituler la bannière du voisin', async () => {
    // `applyCommand` abaisse la bannière **active**, pas celle qui envoie :
    // accepter une reddition hors tour ferait capituler Thibaut sur ordre de
    // Jean. La route la refuse donc comme n'importe quel autre coup.
    const avant = corps<PartyPulsePayload>(
      await thibaut.appel({ method: 'GET', url: PARTIES_API.pouls(code) }),
    );
    expect(avant.activePlayer).toBe('P1');

    const reddition = await jean.appel({
      method: 'POST',
      url: PARTIES_API.commande(code),
      payload: {
        commande: { type: 'Surrender' },
        cleIdempotence: 'reddition-hors-tour-1',
        seqAttendu: avant.seq,
      },
    });
    expect(reddition.statusCode).toBe(403);
    expect(corps<{ code: string; erreur: string }>(reddition).code).toBe('pas_ton_tour');
    expect(corps<{ erreur: string }>(reddition).erreur).toContain('abandonner');

    // Thibaut est toujours en lice, et c'est toujours son tour.
    const apres = corps<PartyPulsePayload>(
      await thibaut.appel({ method: 'GET', url: PARTIES_API.pouls(code) }),
    );
    expect(apres.seq).toBe(avant.seq);
    expect(apres.activePlayer).toBe('P1');
    const etat = corps<PartyStatePayload>(
      await thibaut.appel({ method: 'GET', url: PARTIES_API.etat(code) }),
    );
    expect(etat.statut).toBe('en_cours');
    expect(etat.gagnant).toBeNull();
  });

  it("ne laisse jamais fuir le jeton d'un autre cousin", async () => {
    // Assertion volontairement brutale : on cherche la chaîne du secret dans
    // le **corps sérialisé** de chaque projection, sans interpréter le JSON.
    // Une fuite par un champ oublié, un objet imbriqué ou un journal en
    // français tomberait ici comme une fuite par un champ documenté.
    const mienJeton = thibaut.jeton;
    const sienJeton = jean.jeton;
    expect(mienJeton).not.toBeNull();
    expect(sienJeton).not.toBeNull();

    const reponses = [
      await thibaut.appel({ method: 'GET', url: PARTIES_API.partie(code) }),
      await thibaut.appel({ method: 'GET', url: PARTIES_API.etat(code) }),
      await thibaut.appel({ method: 'GET', url: PARTIES_API.pouls(code) }),
      await thibaut.appel({ method: 'GET', url: PARTIES_API.mesParties }),
      await jean.appel({ method: 'GET', url: PARTIES_API.partie(code) }),
      await jean.appel({ method: 'GET', url: PARTIES_API.etat(code) }),
      await jean.appel({ method: 'GET', url: PARTIES_API.mesParties }),
    ];

    for (const reponse of reponses) {
      expect(reponse.statusCode).toBe(200);
      // Ni celui du voisin, ni même le sien : seules la création et la prise
      // de bannière ont le droit de le prononcer.
      expect(reponse.body).not.toContain(sienJeton as string);
      expect(reponse.body).not.toContain(mienJeton as string);
    }
  });

  it('refuse un jeton illisible plutôt que de se rabattre sur le cookie', async () => {
    // Le cookie de Thibaut désignerait bien P1 ; le jeton présenté fait foi,
    // et un jeton illisible est une erreur de client, pas un repli. On passe
    // par `inject` sans le `navigateur`, qui imposerait le bon jeton.
    const cookie = thibaut.cookie ?? '';

    const illisible = await built.app.inject({
      method: 'GET',
      url: PARTIES_API.etat(code),
      headers: { cookie, [PLAYER_TOKEN_HEADER]: 'pas-un-jeton' },
    });
    expect(illisible.statusCode).toBe(403);
    expect(corps<{ code: string }>(illisible).code).toBe('jeton_invalide');

    // Bien formé mais inconnu de cette partie : refusé de la même façon.
    const inconnu = await built.app.inject({
      method: 'GET',
      url: PARTIES_API.etat(code),
      headers: { cookie, [PLAYER_TOKEN_HEADER]: 'a'.repeat(32) },
    });
    expect(inconnu.statusCode).toBe(403);
    expect(corps<{ code: string }>(inconnu).code).toBe('jeton_invalide');

    // Sans jeton du tout, le cookie signé suffit : c'est le repli légitime.
    const parCookie = await built.app.inject({
      method: 'GET',
      url: PARTIES_API.etat(code),
      headers: { cookie },
    });
    expect(parCookie.statusCode).toBe(200);
    expect(corps<PartyStatePayload>(parCookie).monSlot).toBe('P1');
  });

  it("refuse un code inconnu et un jeton étranger, en français", async () => {
    const inconnue = await thibaut.appel({ method: 'GET', url: PARTIES_API.partie('FOREZ-2222') });
    expect(inconnue.statusCode).toBe(404);
    expect(corps<{ code: string; erreur: string }>(inconnue).code).toBe('partie_introuvable');

    const etranger = await built.app.inject({
      method: 'GET',
      url: PARTIES_API.etat(code),
      headers: { [PLAYER_TOKEN_HEADER]: '0'.repeat(32) },
    });
    expect(etranger.statusCode).toBe(403);
    expect(corps<{ code: string }>(etranger).code).toBe('jeton_invalide');
  });
});
