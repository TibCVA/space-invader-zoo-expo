/**
 * Parties en ligne asynchrones — le serveur autoritaire.
 *
 * Spécification : `docs/04-MULTIJOUEUR.md`. Cinq cousins, chacun sur son
 * téléphone, une partie étalée sur des semaines. Aucun compte, aucun mot de
 * passe, un seul lien à partager.
 *
 * Ce fichier tient six promesses, et c'est tout ce qu'il fait :
 *
 *  1. **Le serveur décide.** Le client n'envoie qu'une `Command` ; c'est
 *     `applyCommand` qui juge, ici, sur l'état conservé côté serveur. Aucune
 *     règle de jeu n'est écrite dans ce fichier.
 *  2. **Seule la bannière active agit.** Un jeton qui n'est pas celui de
 *     `activePlayer` reçoit `403 pas_ton_tour`, `Surrender` compris : le
 *     moteur redde toujours la bannière active, pas l'expéditrice (voir le
 *     détail au point 3 de la route « commande »). Quitter hors de son tour,
 *     c'est `abandonner`.
 *  3. **Une commande ne s'applique qu'une fois.** La clef d'idempotence est
 *     consultée *avant* le contrôle de séquence : une reconnexion mobile qui
 *     rejoue son envoi retrouve le résultat déjà calculé.
 *  4. **Un client en retard ne casse rien.** `seqAttendu` inférieur au `seq`
 *     du serveur donne `409 sequence_perimee`, accompagné de l'état à jour.
 *  5. **Les IA jouent tout de suite après.** Dès qu'un tour humain se termine,
 *     le serveur déroule les bannières confiées à l'IA, dans la même
 *     opération, pour que le cousin suivant trouve son tour prêt.
 *  6. **Le brouillard reste privé.** L'état renvoyé à un joueur a le brouillard
 *     des autres bannières remis à zéro : personne ne lit la carte du voisin.
 *
 * Concurrence : une partie est un agrégat, lu-modifié-écrit d'un bloc. Deux
 * requêtes simultanées sur le même code sont sérialisées par `verrou()`, une
 * chaîne de promesses par code. Sur une seule instance Railway, cela suffit ;
 * la contrainte d'unicité `(code, cle_idempotence)` de PostgreSQL rattrape le
 * jour où il y en aura deux.
 */
import { randomBytes, randomInt } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  CreatePartySchema,
  GameSetupSchema,
  JoinPartySchema,
  MAX_PARTY_COMMANDS,
  ModifyPartySchema,
  PARTIES_API,
  PARTY_CODE_ALPHABET,
  PARTY_CODE_PREFIXES,
  PLAYER_TOKEN_HEADER,
  PartyCommandSchema,
  PartyParamsSchema,
  PartySeatAiSchema,
  PartyStateQuerySchema,
  PartyTokenSchema,
  apiError,
  bandeauMonTour,
  deserializeState,
  libelleAttente,
  parseOrMessages,
  partyLink,
  serializeState,
  type ApiError,
  type MyPartiesPayload,
  type MyPartyEntry,
  type PartyCommandPayload,
  type PartyCreatedPayload,
  type PartyJoinedPayload,
  type PartyPulsePayload,
  type PartySalonPayload,
  type PartySeatPublic,
  type PartyStatePayload,
} from '@auvergne/protocol';
import {
  applyCommand,
  createGame,
  type FactionId,
  type GameSetup,
  type GameState,
  type PlayerId,
  type StartKey,
  type WorldMap,
} from '@auvergne/engine';
import { HEROES, heroesOf } from '@auvergne/content';
import { START_KEYS, buildWorld } from '@auvergne/map';
import { runBotTurn } from '@auvergne/bots';
import type { ServerContext } from '../context.js';
import { journalServi } from '../chronique.js';
import { HttpError, fail } from '../errors.js';
import {
  MAX_SNAPSHOTS,
  SEAT_IDS,
  SNAPSHOT_EVERY,
  describe,
  emptySeat,
  seatOfToken,
  type AiProfile,
  type StoredParty,
  type StoredPartyCommand,
  type StoredSeat,
} from '../storage/index.js';

/* ── Réglages ───────────────────────────────────────────────────────────── */

/**
 * Garde-fou : au plus huit tours d'IA enchaînés après un coup humain. Quatre
 * bannières confiées à l'IA, deux journées de battement, et la boucle rend la
 * main — une partie ne peut pas se dérouler toute seule dans une requête HTTP.
 */
const MAX_TOURS_IA = 8;

/** Nombre d'essais pour tirer un code de partie libre. */
const ESSAIS_CODE = 24;

/**
 * Teintes des cinq bannières. Elles doublent la table privée de
 * `packages/engine/src/core/create-game.ts` : c'est un usage strictement
 * décoratif, le salon devant afficher une couleur **avant** que le moteur
 * n'existe. Les valeurs sont celles de `packages/ui/src/tokens.ts`.
 */
const COULEURS_BANNIERES: readonly string[] = [
  '#8C2230',
  '#2E5F8A',
  '#B8891F',
  '#2F6B45',
  '#5B3A6E',
];

/**
 * Sortie de `POST …/commande` : le résultat, ou le refus d'un client en
 * retard. Ce refus est le seul de tout le service à porter une charge utile en
 * plus de `{ erreur, code }` : la spécification veut que le retardataire
 * reparte avec l'état à jour, et non avec une seconde requête à faire.
 */
type Sortie =
  | { statut: 200; corps: PartyCommandPayload }
  | { statut: 409; corps: ApiError & { etat: PartyStatePayload } };

/* ── Enregistrement ─────────────────────────────────────────────────────── */

export function registerPartyRoutes(app: FastifyInstance, ctx: ServerContext): void {
  /* ── Création ─────────────────────────────────────────────────────────── */

  app.post(PARTIES_API.racine, async (request, reply) => {
    const body = parseOrMessages(CreatePartySchema, request.body);
    if (!body.ok) fail('requete_invalide', body.messages[0], { champs: body.champs });

    const now = new Date().toISOString();
    const jetonHote = jeton();
    const party: StoredParty = {
      code: '',
      hote: request.identity,
      jetonHote,
      setup: {
        bannieres: body.value.bannieres,
        duree: body.value.duree,
        victoire: body.value.victoire,
        graine: body.value.graine ?? randomInt(0, 1_000_000_000),
      },
      statut: 'salon',
      seq: 0,
      activePlayer: null,
      versions: {
        moteur: ctx.versions.moteur,
        contenu: ctx.versions.contenu,
        carte: ctx.versions.carte,
      },
      joueurs: SEAT_IDS.slice(0, body.value.bannieres).map((slot) => emptySeat(slot)),
      etat: null,
      hash: null,
      instantanes: [],
      commandes: [],
      creeLe: now,
      majLe: now,
      termineeLe: null,
      gagnant: null,
    };

    // Un code lisible au téléphone, tiré jusqu'à en trouver un libre.
    let cree = false;
    for (let essai = 0; essai < ESSAIS_CODE && !cree; essai++) {
      party.code = tirerCode();
      try {
        await ctx.storage.createParty(party);
        cree = true;
      } catch (err) {
        const existe = await ctx.storage.getParty(party.code).catch(() => null);
        if (existe === null) {
          request.log.error({ raison: describe(err) }, 'création de partie impossible');
          throw new HttpError('stockage_indisponible', MESSAGES_PARTIE.stockage);
        }
      }
    }
    if (!cree) {
      throw new HttpError('erreur_interne', MESSAGES_PARTIE.codeIntrouvable);
    }

    const payload: PartyCreatedPayload = {
      code: party.code,
      lien: lienDe(request, party.code),
      jeton: jetonHote,
      salon: salonPublic(party, request, jetonHote),
    };
    return reply.code(201).header('cache-control', 'no-store').send(payload);
  });

  /* ── Mes parties ──────────────────────────────────────────────────────── */

  app.get(PARTIES_API.mesParties, async (request, reply) => {
    const parties = await ctx.storage.listPartiesOf(request.identity).catch((err: unknown) => {
      request.log.error({ raison: describe(err) }, 'lecture de mes parties impossible');
      return [] as StoredParty[];
    });

    const entrees: MyPartyEntry[] = [];
    for (const party of parties) {
      const seat =
        party.joueurs.find((s) => s.identite === request.identity && s.kind === 'humain') ?? null;
      if (seat === null) continue;
      const monTour = party.statut === 'en_cours' && party.activePlayer === seat.slot;
      const actif =
        party.activePlayer === null
          ? null
          : (party.joueurs.find((s) => s.slot === party.activePlayer)?.nom ?? null);
      entrees.push({
        code: party.code,
        lien: lienDe(request, party.code),
        statut: party.statut,
        monSlot: seat.slot,
        monNom: seat.nom ?? seat.slot,
        avatar: seat.avatar,
        activePlayer: party.activePlayer,
        monTour,
        attendu: monTour ? null : actif,
        seq: party.seq,
        joueurs: party.joueurs.filter((s) => s.kind !== 'libre').length,
        majLe: party.majLe,
        hote: party.hote === request.identity,
      });
    }

    const compte = entrees.filter((e) => e.monTour).length;
    const payload: MyPartiesPayload = {
      parties: entrees,
      monTour: compte,
      bandeau: bandeauMonTour(compte),
    };
    return reply.header('cache-control', 'no-store').send(payload);
  });

  /* ── Salon ────────────────────────────────────────────────────────────── */

  app.get(`${PARTIES_API.racine}/:code`, async (request, reply) => {
    const party = await charger(ctx, request);
    return reply
      .header('cache-control', 'no-store')
      .send(salonPublic(party, request, jetonDe(request)));
  });

  /* ── Pouls ────────────────────────────────────────────────────────────── */

  // Quelques dizaines d'octets : c'est la route la plus appelée du service.
  app.get(`${PARTIES_API.racine}/:code/pouls`, async (request, reply) => {
    const party = await charger(ctx, request);
    const payload: PartyPulsePayload = {
      seq: party.seq,
      activePlayer: party.activePlayer,
      updatedAt: party.majLe,
    };
    return reply.header('cache-control', 'no-store').send(payload);
  });

  /* ── Rejoindre ────────────────────────────────────────────────────────── */

  app.post(`${PARTIES_API.racine}/:code/rejoindre`, async (request, reply) => {
    const body = parseOrMessages(JoinPartySchema, request.body);
    if (!body.ok) fail('requete_invalide', body.messages[0], { champs: body.champs });
    const code = codeDe(request);

    const resultat = await verrou(code, async () => {
      const party = await charger(ctx, request);
      if (party.statut !== 'salon') fail('partie_deja_lancee', MESSAGES_PARTIE.dejaLancee);

      const seat = party.joueurs.find((s) => s.slot === body.value.slot);
      if (seat === undefined) fail('requete_invalide', MESSAGES_PARTIE.banniereInconnue);
      if (seat.kind !== 'libre') fail('banniere_prise', MESSAGES_PARTIE.banniereOccupee);

      verifierChoix(party, body.value.slot, body.value.heros, body.value.depart, body.value.faction);

      const secret = jeton();
      seat.jeton = secret;
      seat.identite = request.identity;
      seat.nom = body.value.nom;
      seat.faction = body.value.faction;
      seat.heros = body.value.heros;
      seat.avatar = body.value.heros;
      seat.depart = body.value.depart;
      seat.kind = 'humain';
      seat.profilIa = null;
      seat.pret = true;
      seat.dernierVuLe = new Date().toISOString();

      party.majLe = seat.dernierVuLe;
      party.seq += 1;
      await ecrire(ctx, party, request);
      return { party, secret };
    });

    const payload: PartyJoinedPayload = {
      jeton: resultat.secret,
      slot: body.value.slot,
      salon: salonPublic(resultat.party, request, resultat.secret),
    };
    return reply.code(201).header('cache-control', 'no-store').send(payload);
  });

  /* ── Modifier son choix, avant le lancement ───────────────────────────── */

  app.post(`${PARTIES_API.racine}/:code/modifier`, async (request, reply) => {
    const body = parseOrMessages(ModifyPartySchema, request.body);
    if (!body.ok) fail('requete_invalide', body.messages[0], { champs: body.champs });
    const code = codeDe(request);

    const party = await verrou(code, async () => {
      const p = await charger(ctx, request);
      if (p.statut !== 'salon') fail('partie_deja_lancee', MESSAGES_PARTIE.dejaLancee);
      const seat = maBanniere(p, request);

      const patch = body.value;
      const heros = patch.heros ?? seat.heros;
      const depart = patch.depart ?? seat.depart;
      const faction = patch.faction ?? seat.faction;
      if (heros !== null && depart !== null && faction !== null) {
        verifierChoix(p, seat.slot, heros, depart, faction);
      }

      if (patch.nom !== undefined) seat.nom = patch.nom;
      if (patch.faction !== undefined) seat.faction = patch.faction;
      if (patch.heros !== undefined) {
        seat.heros = patch.heros;
        seat.avatar = patch.heros;
      }
      if (patch.depart !== undefined) seat.depart = patch.depart;
      if (patch.pret !== undefined) seat.pret = patch.pret;
      seat.dernierVuLe = new Date().toISOString();

      p.majLe = seat.dernierVuLe;
      p.seq += 1;
      await ecrire(ctx, p, request);
      return p;
    });

    return reply
      .header('cache-control', 'no-store')
      .send(salonPublic(party, request, jetonDe(request)));
  });

  /* ── Confier une bannière à l'IA, ou la retirer ───────────────────────── */

  app.post(`${PARTIES_API.racine}/:code/ia`, async (request, reply) => {
    const body = parseOrMessages(PartySeatAiSchema, request.body);
    if (!body.ok) fail('requete_invalide', body.messages[0], { champs: body.champs });
    const code = codeDe(request);

    const party = await verrou(code, async () => {
      const p = await charger(ctx, request);
      exigerHote(p, request);
      if (p.statut !== 'salon') fail('partie_deja_lancee', MESSAGES_PARTIE.dejaLancee);

      const seat = p.joueurs.find((s) => s.slot === body.value.slot);
      if (seat === undefined) fail('requete_invalide', MESSAGES_PARTIE.banniereInconnue);
      if (seat.kind === 'humain') fail('banniere_prise', MESSAGES_PARTIE.banniereHumaine);

      if (body.value.action === 'retirer') {
        Object.assign(seat, emptySeat(seat.slot));
      } else {
        remplirIa(p, seat, body.value.profil ?? 'equilibre');
      }

      p.majLe = new Date().toISOString();
      p.seq += 1;
      await ecrire(ctx, p, request);
      return p;
    });

    return reply
      .header('cache-control', 'no-store')
      .send(salonPublic(party, request, jetonDe(request)));
  });

  /* ── Lever les bannières ──────────────────────────────────────────────── */

  app.post(`${PARTIES_API.racine}/:code/lancer`, async (request, reply) => {
    const code = codeDe(request);

    const party = await verrou(code, async () => {
      const p = await charger(ctx, request);
      exigerHote(p, request);
      if (p.statut === 'en_cours') fail('partie_deja_lancee', MESSAGES_PARTIE.dejaLancee);
      if (p.statut === 'terminee') fail('partie_terminee', MESSAGES_PARTIE.terminee);

      const obstacles = obstaclesDe(p);
      if (obstacles.length > 0) {
        fail('salon_incomplet', obstacles[0], { obstacles });
      }

      const setup = setupDe(p);
      const verdict = parseOrMessages(GameSetupSchema, setup);
      if (!verdict.ok) fail('salon_incomplet', verdict.messages[0], { champs: verdict.champs });

      const world = mondeDe(p.setup.graine);
      let state = createGame(verdict.value, world);

      p.statut = 'en_cours';
      p.seq += 1;
      p.activePlayer = state.activePlayer;
      p.majLe = new Date().toISOString();

      // Si la première bannière est confiée à l'IA, elle joue immédiatement :
      // le premier cousin humain doit trouver son tour prêt en arrivant.
      const tours = deroulerIa(p, state, world);
      state = tours.state;

      enregistrerEtat(p, state, true);
      await ecrire(ctx, p, request);
      return p;
    });

    return reply
      .header('cache-control', 'no-store')
      .send(salonPublic(party, request, jetonDe(request)));
  });

  /* ── État complet ─────────────────────────────────────────────────────── */

  app.get(`${PARTIES_API.racine}/:code/etat`, async (request, reply) => {
    const query = parseOrMessages(PartyStateQuerySchema, request.query ?? {});
    if (!query.ok) fail('requete_invalide', query.messages[0]);

    const party = await charger(ctx, request);
    const seat = maBanniere(party, request);
    if (party.etat === null) fail('partie_non_lancee', MESSAGES_PARTIE.nonLancee);

    const depuis = query.value.depuis === undefined ? -1 : Number.parseInt(query.value.depuis, 10);
    if (depuis === party.seq) {
      // Rien n'a bougé : le client garde ce qu'il a déjà.
      return reply.code(304).header('cache-control', 'no-store').send();
    }

    return reply.header('cache-control', 'no-store').send(etatPublic(party, seat.slot));
  });

  /* ── Commande ─────────────────────────────────────────────────────────── */

  app.post(`${PARTIES_API.racine}/:code/commande`, async (request, reply) => {
    const body = parseOrMessages(PartyCommandSchema, request.body);
    if (!body.ok) fail('requete_invalide', body.messages[0], { champs: body.champs });
    const code = codeDe(request);
    const { commande, cleIdempotence, seqAttendu } = body.value;

    const sortie = await verrou(code, async (): Promise<Sortie> => {
      const p = await charger(ctx, request);
      const seat = maBanniere(p, request);
      if (p.statut === 'salon') fail('partie_non_lancee', MESSAGES_PARTIE.nonLancee);
      if (p.statut === 'terminee') fail('partie_terminee', MESSAGES_PARTIE.terminee);
      if (p.etat === null) fail('partie_non_lancee', MESSAGES_PARTIE.nonLancee);

      /* 1. Idempotence — avant tout le reste. Un mobile qui a perdu le réseau
            rejoue son envoi avec un `seqAttendu` désormais périmé : ce n'est
            pas une erreur, c'est le même coup. */
      const deja = p.commandes.find((c) => c.cleIdempotence === cleIdempotence);
      if (deja !== undefined) {
        if (deja.joueur !== seat.slot) fail('jeton_invalide', MESSAGES_PARTIE.cleAutreJoueur);
        return {
          statut: 200,
          corps: reponseCommande(p, seat.slot, true, deja.journal, deja.toursIa),
        };
      }

      /* 2. Fraîcheur du client. Le retardataire repart avec l'état à jour
            joint à son refus (`docs/04-MULTIJOUEUR.md` §4) : c'est une
            requête de moins, et il n'a rien écrasé. L'enveloppe garde le
            format français `{ erreur, code }`, augmentée du seul `etat`. */
      if (seqAttendu !== p.seq) {
        return {
          statut: 409,
          corps: {
            ...apiError('sequence_perimee', MESSAGES_PARTIE.enRetard(seqAttendu, p.seq), {
              seq: p.seq,
              seqAttendu,
            }),
            etat: etatPublic(p, seat.slot),
          },
        };
      }

      /* 3. Autorisation : seule la bannière active agit.

            `docs/04-MULTIJOUEUR.md` §4 excepte `Surrender`, « toujours
            autorisée ». Cette exception n'est **pas** implémentable telle
            quelle et ne l'est pas ici : `applyCommand` lit
            `state.activePlayer` avant d'entrer dans le `case 'Surrender'`
            (`packages/engine/src/core/apply.ts`), si bien qu'une reddition
            hors tour abaisserait la bannière de *l'autre* — Jean ferait
            capituler Thibaut. Quitter hors de son tour se fait par
            `POST …/abandonner`, qui confie la bannière à l'IA sans toucher à
            l'état du joueur actif. */
      if (p.activePlayer !== seat.slot) {
        const attendu = p.joueurs.find((s) => s.slot === p.activePlayer)?.nom ?? null;
        const conseil =
          commande.type === 'Surrender'
            ? ' Pour quitter la partie sans attendre votre tour, utilisez « abandonner ».'
            : '';
        throw new PasTonTour(
          `${libelleAttente(attendu)}. Votre coup n'a pas été appliqué.${conseil}`,
        );
      }

      /* 4. Le moteur juge. */
      const world = mondeDe(p.setup.graine);
      const avant = deserializeState(p.etat);
      const avantJournal = avant.journal.length;
      const resultat = applyCommand(avant, commande, world);
      if (!resultat.ok) {
        fail('commande_refusee', resultat.error ?? MESSAGES_PARTIE.refusee);
      }

      let state = resultat.state;
      const journal = state.journal.slice(avantJournal).map((l) => l.text);

      /* 5. Les IA enchaînent, dans la même opération. */
      p.seq += 1;
      const tours = deroulerIa(p, state, world);
      state = tours.state;
      for (const ligne of tours.journal) journal.push(ligne);

      const trace: StoredPartyCommand = {
        seq: p.seq,
        joueur: seat.slot,
        commande,
        cleIdempotence,
        appliqueLe: new Date().toISOString(),
        ok: true,
        erreur: null,
        journal,
        toursIa: tours.joues,
      };
      p.commandes.push(trace);
      if (p.commandes.length > MAX_PARTY_COMMANDS) {
        p.commandes = p.commandes.slice(-MAX_PARTY_COMMANDS);
      }

      seat.dernierVuLe = trace.appliqueLe;
      p.majLe = trace.appliqueLe;
      enregistrerEtat(p, state, commande.type === 'EndTurn' || tours.joues.length > 0);
      await ecrire(ctx, p, request);

      return {
        statut: 200,
        corps: reponseCommande(p, seat.slot, false, journal, tours.joues),
      };
    });

    return reply.code(sortie.statut).header('cache-control', 'no-store').send(sortie.corps);
  });

  /* ── Abandonner ───────────────────────────────────────────────────────── */

  app.post(`${PARTIES_API.racine}/:code/abandonner`, async (request, reply) => {
    const code = codeDe(request);

    const party = await verrou(code, async () => {
      const p = await charger(ctx, request);
      const seat = maBanniere(p, request);

      if (p.statut === 'salon') {
        // Avant le lancement, quitter libère simplement la bannière. Le `seq`
        // avance quand même : c'est lui que les autres salons interrogent.
        Object.assign(seat, emptySeat(seat.slot));
        p.seq += 1;
      } else {
        // En cours, la bannière passe à l'IA : la partie continue sans lui.
        seat.kind = 'ia';
        seat.identite = null;
        seat.jeton = null;
        seat.profilIa = seat.profilIa ?? 'equilibre';
        if (p.etat !== null) {
          const world = mondeDe(p.setup.graine);
          let state = deserializeState(p.etat);
          const joueur = state.players[seat.slot];
          if (joueur !== undefined) joueur.kind = 'ia';
          if (joueur !== undefined) joueur.aiProfile = seat.profilIa;
          const tours = deroulerIa(p, state, world);
          state = tours.state;
          p.seq += 1;
          enregistrerEtat(p, state, true);
        }
      }

      p.majLe = new Date().toISOString();
      await ecrire(ctx, p, request);
      return p;
    });

    return reply.header('cache-control', 'no-store').send(salonPublic(party, request, null));
  });
}

/* ══════════════════════════ Messages français ═════════════════════════════ */

const MESSAGES_PARTIE = {
  stockage:
    "Le stockage des parties en ligne est momentanément indisponible. Rien n'est perdu : réessayez dans un instant.",
  codeIntrouvable:
    "Impossible de tirer un code de partie libre. Réessayez : c'est très inhabituel.",
  introuvable:
    "Cette partie n'existe pas, ou son code a été mal recopié. Les codes ressemblent à « FOREZ-7K2P ».",
  dejaLancee: 'Les bannières sont déjà levées : le salon est clos.',
  nonLancee: "La partie n'a pas encore commencé : l'hôte n'a pas levé les bannières.",
  terminee: 'Cette partie est terminée.',
  banniereInconnue: "Cette bannière n'existe pas dans cette partie.",
  banniereOccupee: 'Cette bannière vient d’être prise par un autre cousin. Choisissez-en une autre.',
  banniereHumaine: "Cette bannière est tenue par un joueur : on ne la confie pas à l'IA.",
  jetonManquant:
    "Ce navigateur ne possède pas de bannière dans cette partie. Ouvrez le lien partagé et choisissez-en une.",
  jetonInconnu:
    "Ce jeton ne correspond à aucune bannière de cette partie. Le lien a peut-être changé de partie.",
  jetonMalforme:
    'Le jeton de joueur envoyé est illisible : trente-deux caractères hexadécimaux sont attendus.',
  reserveHote: "Seul l'hôte de la partie peut faire cela.",
  cleAutreJoueur: "Cette clef d'idempotence appartient à une autre bannière.",
  refusee: 'Le moteur a refusé cette action.',
  enRetard: (attendu: number, reel: number): string =>
    `Votre écran date du coup n° ${String(attendu)} ; la partie en est au n° ${String(
      reel,
    )}. L'état à jour est joint : rejouez votre coup si vous le souhaitez toujours.`,
} as const;

/* ══════════════════════════ Refus « pas ton tour » ════════════════════════ */

/**
 * `pas_ton_tour`, servi en **403**.
 *
 * Un seul endroit de tout le service s'écarte de `ERROR_STATUS` : celui-ci.
 * La table du contrat (`packages/protocol/src/api.ts`) est explicitement
 * intitulée « Statut HTTP **recommandé** » et propose `409` ; la règle de jeu,
 * elle, est une question d'autorisation — « seul le joueur actif peut jouer »
 * — et se dit `403`. Le **code** d'erreur reste celui du contrat gelé, qui est
 * ce sur quoi le client branche ; seul le statut change. Revenir à la
 * recommandation ne coûte qu'une ligne : supprimer cette classe et rétablir
 * `fail('pas_ton_tour', …)`.
 */
class PasTonTour extends HttpError {
  override readonly status: number = 403;

  constructor(message: string) {
    super('pas_ton_tour', message);
  }
}

/* ══════════════════════════ Verrou par partie ═════════════════════════════ */

/**
 * Sérialise les opérations d'une même partie. Chaque code porte une chaîne de
 * promesses : la suivante n'attaque le stockage qu'une fois la précédente
 * terminée, succès ou échec.
 */
const chaines = new Map<string, Promise<unknown>>();

async function verrou<T>(code: string, travail: () => Promise<T>): Promise<T> {
  const precedent = chaines.get(code) ?? Promise.resolve();
  // `then(travail, travail)` : l'échec du précédent ne bloque pas le suivant.
  const suivant = precedent.then(travail, travail);
  const silencieux = suivant.then(
    () => undefined,
    () => undefined,
  );
  chaines.set(code, silencieux);
  // La dernière opération de la file libère l'entrée : la carte ne gonfle pas
  // avec le nombre de parties ouvertes une seule fois.
  void silencieux.then(() => {
    if (chaines.get(code) === silencieux) chaines.delete(code);
  });
  return await suivant;
}

/* ══════════════════════════ Lecture / écriture ════════════════════════════ */

function codeDe(request: FastifyRequest): string {
  const params = parseOrMessages(PartyParamsSchema, request.params);
  if (!params.ok) fail('code_invalide', params.messages[0]);
  return params.value.code;
}

async function charger(ctx: ServerContext, request: FastifyRequest): Promise<StoredParty> {
  const code = codeDe(request);
  let party: StoredParty | null;
  try {
    party = await ctx.storage.getParty(code);
  } catch (err) {
    request.log.error({ raison: describe(err) }, 'lecture de partie impossible');
    throw new HttpError('stockage_indisponible', MESSAGES_PARTIE.stockage);
  }
  if (party === null) fail('partie_introuvable', MESSAGES_PARTIE.introuvable);
  return party;
}

async function ecrire(
  ctx: ServerContext,
  party: StoredParty,
  request: FastifyRequest,
): Promise<void> {
  try {
    await ctx.storage.putParty(party);
  } catch (err) {
    request.log.error({ raison: describe(err) }, 'écriture de partie impossible');
    throw new HttpError('stockage_indisponible', MESSAGES_PARTIE.stockage);
  }
}

/* ══════════════════════════ Jetons et identité ════════════════════════════ */

/** Secret de 32 caractères hexadécimaux. */
function jeton(): string {
  return randomBytes(16).toString('hex');
}

/** Jeton présenté par la requête, s'il est bien formé. */
function jetonDe(request: FastifyRequest): string | null {
  const brut = request.headers[PLAYER_TOKEN_HEADER];
  const valeur = Array.isArray(brut) ? brut[0] : brut;
  if (typeof valeur !== 'string') return null;
  const verdict = PartyTokenSchema.safeParse(valeur);
  return verdict.success ? verdict.data : null;
}

/**
 * La bannière du demandeur.
 *
 * Un jeton **présenté fait foi, et seul foi** : mal formé ou inconnu, il est
 * refusé sans repli sur le cookie (`docs/04-MULTIJOUEUR.md` §4, « le jeton
 * doit correspondre à une bannière de cette partie »). Se rabattre en silence
 * sur l'identité du navigateur ferait passer pour valide un jeton qui ne l'est
 * pas, et masquerait un client cassé.
 *
 * Sans en-tête du tout, l'identité anonyme du cookie suffit : c'est ce qui
 * permet de retrouver sa partie après avoir vidé le stockage local.
 */
function maBanniere(party: StoredParty, request: FastifyRequest): StoredSeat {
  const brut = request.headers[PLAYER_TOKEN_HEADER];
  const entete = Array.isArray(brut) ? brut[0] : brut;
  if (typeof entete === 'string' && entete.trim().length > 0) {
    const verdict = PartyTokenSchema.safeParse(entete);
    if (!verdict.success) fail('jeton_invalide', MESSAGES_PARTIE.jetonMalforme);
    const parJeton = seatOfToken(party, verdict.data);
    if (parJeton === null) fail('jeton_invalide', MESSAGES_PARTIE.jetonInconnu);
    return parJeton;
  }
  const parIdentite = party.joueurs.find(
    (s) => s.kind === 'humain' && s.identite === request.identity,
  );
  if (parIdentite !== undefined) return parIdentite;
  fail('jeton_invalide', MESSAGES_PARTIE.jetonManquant);
}

/** Vrai si le demandeur est l'hôte : par son jeton d'hôte ou par son identité. */
function estHote(party: StoredParty, request: FastifyRequest): boolean {
  const presente = jetonDe(request);
  if (presente !== null && presente === party.jetonHote) return true;
  return request.identity.length > 0 && request.identity === party.hote;
}

function exigerHote(party: StoredParty, request: FastifyRequest): void {
  if (!estHote(party, request)) fail('reserve_a_l_hote', MESSAGES_PARTIE.reserveHote);
}

/* ══════════════════════════ Codes et liens ════════════════════════════════ */

/** `FOREZ-7K2P` : un préfixe du pays, un suffixe sans caractère ambigu. */
function tirerCode(): string {
  const prefixe = PARTY_CODE_PREFIXES[randomInt(0, PARTY_CODE_PREFIXES.length)];
  let suffixe = '';
  for (let i = 0; i < 4; i++) {
    suffixe += PARTY_CODE_ALPHABET[randomInt(0, PARTY_CODE_ALPHABET.length)];
  }
  return `${prefixe}-${suffixe}`;
}

/** Origine réelle de la requête, proxy Railway compris. */
function lienDe(request: FastifyRequest, code: string): string {
  const proto = premier(request.headers['x-forwarded-proto']) ?? request.protocol;
  const hote = premier(request.headers['x-forwarded-host']) ?? request.headers.host ?? 'localhost';
  return partyLink(`${proto}://${hote}`, code);
}

function premier(valeur: string | string[] | undefined): string | null {
  if (valeur === undefined) return null;
  const texte = Array.isArray(valeur) ? valeur[0] : valeur;
  const coupe = texte.split(',')[0].trim();
  return coupe.length > 0 ? coupe : null;
}

/* ══════════════════════════ Le monde, par graine ══════════════════════════ */

/**
 * `buildWorld` coûte une seconde : on garde les mondes déjà construits. Cinq
 * suffisent — au-delà, la plus ancienne graine repart.
 */
const mondes = new Map<number, WorldMap>();
const MAX_MONDES = 5;

function mondeDe(graine: number): WorldMap {
  const connu = mondes.get(graine);
  if (connu !== undefined) return connu;
  const monde = buildWorld(graine);
  if (mondes.size >= MAX_MONDES) {
    const premiere = mondes.keys().next();
    if (!premiere.done) mondes.delete(premiere.value);
  }
  mondes.set(graine, monde);
  return monde;
}

/* ══════════════════════════ Salon : cohérence ═════════════════════════════ */

/** Refuse un héros, une position ou une faction incompatibles avec la bannière. */
function verifierChoix(
  party: StoredParty,
  slot: PlayerId,
  heros: string,
  depart: StartKey,
  faction: FactionId,
): void {
  const def = HEROES[heros];
  if (def === undefined) {
    fail('requete_invalide', `Le héros « ${heros} » n'existe pas dans ce jeu.`);
  }
  if (def.faction !== faction) {
    fail(
      'requete_invalide',
      `${def.name} ne sert pas cette maison : choisissez un héros de la maison retenue.`,
    );
  }
  for (const autre of party.joueurs) {
    if (autre.slot === slot || autre.kind === 'libre') continue;
    if (autre.heros === heros) {
      fail('banniere_prise', `${def.name} a déjà été choisi par ${autre.nom ?? 'une autre bannière'}.`);
    }
    if (autre.depart === depart) {
      fail(
        'banniere_prise',
        `Cette position de départ est déjà tenue par ${autre.nom ?? 'une autre bannière'}.`,
      );
    }
  }
}

/** Remplit une bannière libre avec une IA cohérente : maison, héros, départ. */
function remplirIa(party: StoredParty, seat: StoredSeat, profil: AiProfile): void {
  const index = party.joueurs.findIndex((s) => s.slot === seat.slot);
  const faction: FactionId = index % 2 === 0 ? 'granit' : 'ermitage';
  const prisHeros = new Set(
    party.joueurs.filter((s) => s.slot !== seat.slot).map((s) => s.heros ?? ''),
  );
  const prisDepart = new Set(
    party.joueurs.filter((s) => s.slot !== seat.slot).map((s) => s.depart ?? ''),
  );
  const heros = heroesOf(faction).find((h) => !prisHeros.has(h.id))?.id ?? heroesOf(faction)[0].id;
  const depart = START_KEYS.find((k) => !prisDepart.has(k)) ?? START_KEYS[index];

  seat.jeton = null;
  seat.identite = null;
  seat.nom = `Adversaire ${seat.slot}`;
  seat.faction = faction;
  seat.heros = heros;
  seat.avatar = heros;
  seat.depart = depart;
  seat.kind = 'ia';
  seat.profilIa = profil;
  seat.pret = true;
  seat.dernierVuLe = null;
}

/** Ce qui empêche encore de lever les bannières, en français. */
function obstaclesDe(party: StoredParty): string[] {
  const out: string[] = [];
  const occupees = party.joueurs.filter((s) => s.kind !== 'libre');
  if (occupees.length < 2) {
    out.push('Il faut au moins deux bannières tenues pour lancer la partie.');
  }
  if (!occupees.some((s) => s.kind === 'humain')) {
    out.push('Au moins une bannière doit être tenue par un joueur.');
  }
  const departs = new Set<string>();
  const heros = new Set<string>();
  for (const seat of occupees) {
    if (seat.faction === null || seat.heros === null || seat.depart === null || seat.nom === null) {
      out.push(`La bannière ${seat.slot} n'a pas fini de se composer.`);
      continue;
    }
    if (departs.has(seat.depart)) out.push('Deux bannières partent de la même position.');
    departs.add(seat.depart);
    if (heros.has(seat.heros)) out.push('Deux bannières ont choisi le même héros.');
    heros.add(seat.heros);
  }
  const enAttente = occupees.filter((s) => s.kind === 'humain' && !s.pret);
  for (const seat of enAttente) {
    out.push(`${seat.nom ?? seat.slot} n'a pas confirmé son choix.`);
  }
  return out;
}

/** Compose le `GameSetup` à partir des bannières tenues. */
function setupDe(party: StoredParty): GameSetup {
  const players: GameSetup['players'] = [];
  for (const seat of party.joueurs) {
    if (seat.kind === 'libre') continue;
    if (seat.faction === null || seat.heros === null || seat.depart === null) continue;
    players.push({
      id: seat.slot,
      name: seat.nom ?? seat.slot,
      faction: seat.faction,
      kind: seat.kind,
      ...(seat.kind === 'ia' ? { aiProfile: seat.profilIa ?? 'equilibre' } : {}),
      start: seat.depart,
      hero: seat.heros,
    });
  }
  return {
    seed: party.setup.graine,
    mapVersion: party.versions.carte,
    contentVersion: party.versions.contenu,
    duration: party.setup.duree,
    victory: party.setup.victoire,
    players,
  };
}

/* ══════════════════════════ Tours joués par le serveur ════════════════════ */

interface ToursIa {
  state: GameState;
  joues: PlayerId[];
  journal: string[];
}

/**
 * Déroule les bannières confiées à l'IA tant qu'elles sont actives. Chaque
 * tour est simulé par `runBotTurn`, qui rend l'état final et la suite exacte
 * des commandes : elles sont consignées au journal comme celles d'un humain.
 */
function deroulerIa(party: StoredParty, depart: GameState, world: WorldMap): ToursIa {
  let state = depart;
  const joues: PlayerId[] = [];
  const journal: string[] = [];

  for (let garde = 0; garde < MAX_TOURS_IA; garde++) {
    if (state.phase === 'termine') break;
    const actif = state.activePlayer;
    const seat = party.joueurs.find((s) => s.slot === actif);
    if (seat === undefined || seat.kind !== 'ia') break;

    const avant = state.journal.length;
    const tour = runBotTurn(state, world, actif);
    if (tour.commands.length === 0) {
      // Une IA qui n'a rien à jouer doit tout de même passer la main, sans
      // quoi la partie s'immobiliserait sur sa bannière.
      const fin = applyCommand(state, { type: 'EndTurn' }, world);
      if (!fin.ok) break;
      state = fin.state;
    } else {
      state = tour.state;
    }

    for (const ligne of state.journal.slice(avant)) journal.push(ligne.text);
    joues.push(actif);
  }

  return { state, joues, journal };
}

/**
 * Fixe l'état courant, l'`activePlayer`, le statut, et pose un instantané si
 * la spécification le demande : à chaque fin de tour, et toutes les vingt
 * commandes.
 */
function enregistrerEtat(party: StoredParty, state: GameState, finDeTour: boolean): void {
  const serialise = serializeState(state);
  party.etat = serialise;
  party.hash = state.hash;
  party.activePlayer = state.activePlayer;

  if (state.phase === 'termine') {
    party.statut = 'terminee';
    party.gagnant = state.winner;
    party.termineeLe = party.majLe;
  }

  const periodique = party.seq % SNAPSHOT_EVERY === 0;
  if (finDeTour || periodique) {
    party.instantanes.push({
      seq: party.seq,
      etat: serialise,
      hash: state.hash,
      creeLe: party.majLe,
    });
    if (party.instantanes.length > MAX_SNAPSHOTS) {
      party.instantanes = party.instantanes.slice(-MAX_SNAPSHOTS);
    }
  }
}

/* ══════════════════════════ Projections publiques ═════════════════════════ */

/** Une bannière, telle que tout le monde peut la voir. Jamais le jeton. */
function seatPublic(seat: StoredSeat, index: number, moi: boolean): PartySeatPublic {
  return {
    slot: seat.slot,
    couleur: COULEURS_BANNIERES[index] ?? COULEURS_BANNIERES[0],
    kind: seat.kind,
    nom: seat.nom,
    faction: seat.faction,
    heros: seat.heros,
    avatar: seat.avatar,
    depart: seat.depart,
    profilIa: seat.profilIa,
    pret: seat.pret,
    moi,
    dernierVuLe: seat.dernierVuLe,
  };
}

function salonPublic(
  party: StoredParty,
  request: FastifyRequest,
  jetonConnu: string | null,
): PartySalonPayload {
  const presente = jetonConnu ?? jetonDe(request);
  const mien =
    seatOfToken(party, presente) ??
    party.joueurs.find((s) => s.kind === 'humain' && s.identite === request.identity) ??
    null;

  return {
    code: party.code,
    lien: lienDe(request, party.code),
    statut: party.statut,
    seq: party.seq,
    activePlayer: party.activePlayer,
    bannieres: party.setup.bannieres,
    duree: party.setup.duree,
    victoire: party.setup.victoire,
    graine: party.setup.graine,
    joueurs: party.joueurs.map((s, i) => seatPublic(s, i, mien !== null && s.slot === mien.slot)),
    hote: estHote(party, request),
    monSlot: mien?.slot ?? null,
    creeLe: party.creeLe,
    majLe: party.majLe,
    gagnant: party.gagnant,
    obstacles: party.statut === 'salon' ? obstaclesDe(party) : [],
    versions: { ...party.versions },
  };
}

/**
 * L'état, vu par une bannière. Le brouillard des autres est remis à zéro :
 * la spécification (§5) exige que personne ne lise la carte du voisin.
 * L'empreinte renvoyée reste celle de l'état autoritaire : le client ne doit
 * pas la recalculer sur ce qu'il reçoit.
 */
function etatPublic(party: StoredParty, moi: PlayerId): PartyStatePayload {
  const state = deserializeState(party.etat ?? '{}');
  let masque = false;
  for (const id of Object.keys(state.players) as PlayerId[]) {
    if (id === moi) continue;
    const joueur = state.players[id];
    if (joueur === undefined) continue;
    joueur.fog = new Uint8Array(joueur.fog.length);
    joueur.buildQueue = [];
    joueur.tavernOffers = [];
    masque = true;
  }
  /* LE JOURNAL AUSSI se lit par bannière : sans ce filtre, chaque joueur
     recevait la chronique COMPLÈTE de l'adversaire — ses constructions, ses
     recrutements, ses sorts, dans des cités sous brouillard. La règle vit
     dans `chronique.ts`, où les tests la tiennent. */
  state.journal = journalServi(state.journal, moi);

  const mien = party.joueurs.find((s) => s.slot === moi) ?? null;
  return {
    code: party.code,
    seq: party.seq,
    statut: party.statut,
    activePlayer: party.activePlayer,
    monSlot: moi,
    monTour: party.statut === 'en_cours' && party.activePlayer === moi,
    setup: setupDe(party),
    etat: serializeState(state),
    hash: party.hash ?? state.hash,
    brouillardMasque: masque,
    joueurs: party.joueurs.map((s, i) => seatPublic(s, i, mien !== null && s.slot === mien.slot)),
    updatedAt: party.majLe,
    gagnant: party.gagnant,
  };
}

function reponseCommande(
  party: StoredParty,
  moi: PlayerId,
  rejeu: boolean,
  journal: string[],
  toursIa: PlayerId[],
): PartyCommandPayload {
  return {
    ok: true,
    rejeu,
    seq: party.seq,
    activePlayer: party.activePlayer,
    monTour: party.statut === 'en_cours' && party.activePlayer === moi,
    journal,
    toursIa,
    etat: etatPublic(party, moi),
  };
}
