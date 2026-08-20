/**
 * Conditions de victoire — les quatre modes du document maître §13.
 *
 *  - `couronne`          : trois Sceaux des Marches, la Maison du Trésor prise,
 *                          puis la proclamation tenue `CLAIM_DURATION_TURNS`
 *                          jours (21). Le compte à rebours est **public** :
 *                          chaque palier est annoncé à toutes les bannières,
 *                          ce qui organise la coalition finale.
 *  - `derniere_banniere` : élimination totale.
 *  - `maitre_marches`    : tenir cinq centres majeurs sans discontinuer pendant
 *                          deux rondes (56 jours).
 *  - `chronique`         : au terme des semaines prévues, victoire au score —
 *                          sceaux, cités, armée, réputation, trésor.
 *
 * `checkVictory` est appelée par le noyau après chaque combat, chaque
 * reddition et chaque passage de jour. Elle doit donc être idempotente : deux
 * appels consécutifs sans changement d'état ne produisent aucun événement en
 * double, d'où la comptabilité des annonces déjà faites dans la chronique.
 */
import {
  RESOURCE_KEYS,
  weekOf,
  type ClaimState,
  type GameEvent,
  type GameState,
  type PlayerId,
} from '../types.js';
import {
  CLAIM_DURATION_TURNS,
  MASTER_CENTERS_REQUIRED,
  MASTER_HOLD_TURNS,
  SEALS_REQUIRED,
  content,
  gameConfig,
} from '../core/index.js';
/* Import direct plutôt que par le baril `core/index.js` : `abaisserPavois` est
   partagée entre la reddition et l'extinction, elle n'appartient pas au
   contrat public du noyau (docs/02-API.md). Le sens core → world reste, lui,
   interdit et passe toujours par le registre. */
import { abaisserPavois } from '../core/apply.js';
import {
  alivePlayers,
  ledgerInt,
  ledgerString,
  notice,
  numberWord,
  pluralize,
  playerName,
  setLedgerInt,
  setLedgerString,
  treasuryHolder,
} from './common.js';

/* ── Réglages ───────────────────────────────────────────────────────────── */

/**
 * Réglages de la victoire. Les pondérations du score de chronique sont
 * volontairement lisibles : un sceau vaut approximativement trois cités, une
 * cité approximativement dix niveaux de héros.
 */
export const VICTORY_TUNING = {
  /** Sceaux nécessaires pour ouvrir la Maison du Trésor (brief §6). */
  sealsRequired: SEALS_REQUIRED,
  /** Durée de la proclamation, en jours (brief §6). */
  claimTurns: CLAIM_DURATION_TURNS,
  /** Centres majeurs à tenir pour « Maître des Marches ». */
  masterCenters: MASTER_CENTERS_REQUIRED,
  /** Durée de tenue pour « Maître des Marches », en jours. */
  masterHold: MASTER_HOLD_TURNS,
  /** Jours restants auxquels la proclamation est réannoncée à tous. */
  claimAnnounceAt: [21, 14, 7, 3, 1] as const,

  /* — Score de chronique — */
  scoreSeal: 2600,
  scoreCapital: 1400,
  scoreTown: 900,
  scoreReputation: 55,
  scoreHeroLevel: 120,
  /** Puissance d'armée divisée par ce diviseur avant d'entrer au score. */
  scoreArmyDivisor: 10,
  /** Trésor cumulé divisé par ce diviseur avant d'entrer au score. */
  scoreTreasureDivisor: 40,
  /** Prime de score accordée à une proclamation en cours. */
  scoreClaim: 4000,
  /** Prime de score par gisement tenu. */
  scoreMine: 220,

  /* — Chronique — */
  ledgerMasterKey: 'victoire.maitre',
  ledgerClaimKey: 'victoire.proclamation',
  ledgerAnnounceKey: 'victoire.annonce',
} as const;

/* ── Élimination ────────────────────────────────────────────────────────── */

/** Jours de grâce d'une bannière sans cité avant que sa maison s'éteigne. */
export const JOURS_SANS_CITE = 7;

/**
 * Vrai si la bannière est hors de la partie.
 *
 * Deux façons de s'éteindre : ne plus avoir ni cité ni héros — il ne reste
 * rien à jouer — ou rester **sept jours sans cité**, même avec des héros en
 * campagne. C'est la règle de HMM3, et elle sert le mode unique de la partie :
 * la victoire est la prise de tous les châteaux adverses, un héros errant ne
 * doit pas pouvoir prolonger indéfiniment une partie déjà conclue.
 */
export function isEliminated(state: GameState, player: PlayerId): boolean {
  const p = state.players[player];
  if (!p) return true;
  if (p.towns.length > 0) return false;
  if (p.sansCiteDepuis !== undefined && state.turn - p.sansCiteDepuis >= JOURS_SANS_CITE) {
    return true;
  }
  for (const uid of p.heroes) {
    if (state.heroes[uid]) return false;
  }
  return true;
}

/* ── Proclamation ───────────────────────────────────────────────────────── */

/** Jours restants avant l'aboutissement d'une proclamation. */
export function claimRemaining(state: GameState): number {
  if (!state.claim) return 0;
  return Math.max(0, state.claim.endsAtTurn - state.turn);
}

/**
 * Ouvre une proclamation depuis la Maison du Trésor. Utilisée par
 * `visitObject`. Retourne les événements, dont l'annonce publique.
 */
export function startClaim(state: GameState, by: PlayerId): GameEvent[] {
  const events: GameEvent[] = [];
  const previous = state.claim;
  if (previous && previous.by !== by) {
    events.push({ type: 'ClaimBroken', by: previous.by });
    events.push(
      notice(
        null,
        `La proclamation de ${playerName(state, previous.by)} s’éteint : la Maison du Trésor a changé de mains.`,
        'danger',
      ),
    );
  }
  const claim: ClaimState = {
    by,
    startedTurn: state.turn,
    endsAtTurn: state.turn + VICTORY_TUNING.claimTurns,
  };
  state.claim = claim;
  setLedgerString(state, VICTORY_TUNING.ledgerClaimKey, `${by}:${claim.startedTurn}`);
  // Le palier d'ouverture est consommé par l'annonce ci-dessous : le prochain
  // rappel public tombera au palier suivant, jamais dès le lendemain.
  setLedgerInt(state, `${VICTORY_TUNING.ledgerAnnounceKey}.reste`, VICTORY_TUNING.claimTurns);

  events.push({ type: 'ClaimStarted', by, endsAtTurn: claim.endsAtTurn });
  events.push(
    notice(
      null,
      `Le Grand Livre est ouvert sur la table de pierre et la proclamation de ${playerName(
        state,
        by,
      )} est lue aux quatre portes. Il faudra tenir la Maison du Trésor ` +
        `${pluralize(VICTORY_TUNING.claimTurns, 'jour entier', 'jours entiers')} : le comté entier compte les jours.`,
      'danger',
    ),
  );
  return events;
}

/** Interrompt la proclamation en cours, si elle existe. */
export function breakClaim(state: GameState, reason: string): GameEvent[] {
  const claim = state.claim;
  if (!claim) return [];
  state.claim = null;
  setLedgerInt(state, `${VICTORY_TUNING.ledgerAnnounceKey}.reste`, VICTORY_TUNING.claimTurns + 1);
  return [
    { type: 'ClaimBroken', by: claim.by },
    notice(null, reason, 'danger'),
  ];
}

/**
 * Vérifie l'état de la proclamation et produit les annonces publiques.
 * Retourne `true` si la proclamation a abouti.
 */
function tickClaim(state: GameState, events: GameEvent[]): boolean {
  const claim = state.claim;
  if (!claim) return false;

  const holder = treasuryHolder(state);
  if (holder !== claim.by) {
    events.push(
      ...breakClaim(
        state,
        `La proclamation de ${playerName(state, claim.by)} tombe : la Maison du Trésor lui a échappé.`,
      ),
    );
    return false;
  }

  const p = state.players[claim.by];
  if (!p || !p.alive) {
    events.push(
      ...breakClaim(
        state,
        `Le prétendant a disparu : la proclamation lue à la Maison du Trésor n’a plus de voix.`,
      ),
    );
    return false;
  }

  if (state.turn >= claim.endsAtTurn) return true;

  // Annonces publiques aux paliers, une seule fois chacune.
  const remaining = claimRemaining(state);
  const lastAnnounced = ledgerInt(
    state,
    `${VICTORY_TUNING.ledgerAnnounceKey}.reste`,
    VICTORY_TUNING.claimTurns + 1,
  );
  for (const step of VICTORY_TUNING.claimAnnounceAt) {
    if (remaining <= step && lastAnnounced > step) {
      setLedgerInt(state, `${VICTORY_TUNING.ledgerAnnounceKey}.reste`, step);
      events.push(
        notice(
          null,
          step === 1
            ? `Dernier jour de la proclamation de ${playerName(state, claim.by)}. Demain, la Couronne du Forez est à elle si nul ne la déloge.`
            : `Proclamation de ${playerName(state, claim.by)} : ${pluralize(
                remaining,
                'jour restant',
                'jours restants',
              )} avant la Couronne du Forez.`,
          'danger',
        ),
      );
      break;
    }
  }
  return false;
}

/* ── Maître des Marches ─────────────────────────────────────────────────── */

/** Nombre de centres majeurs tenus : cités et villages sous bannière. */
export function centersHeld(state: GameState, player: PlayerId): number {
  return state.players[player]?.towns.length ?? 0;
}

/**
 * Jour depuis lequel la bannière tient sans discontinuer le nombre requis de
 * centres, ou `0` si le compte est rompu.
 */
export function masterSince(state: GameState, player: PlayerId): number {
  return ledgerInt(state, `${VICTORY_TUNING.ledgerMasterKey}.${player}`, 0);
}

function updateMasterHold(state: GameState, events: GameEvent[]): PlayerId | null {
  let winner: PlayerId | null = null;
  for (const player of state.turnOrder) {
    const p = state.players[player];
    const key = `${VICTORY_TUNING.ledgerMasterKey}.${player}`;
    if (!p || !p.alive || centersHeld(state, player) < VICTORY_TUNING.masterCenters) {
      if (ledgerInt(state, key, 0) !== 0) {
        setLedgerInt(state, key, 0);
        events.push(
          notice(
            null,
            `${playerName(state, player)} n’aligne plus ${numberWord(
              VICTORY_TUNING.masterCenters,
            )} centres : le décompte des Marches repart de zéro.`,
            'info',
          ),
        );
      }
      continue;
    }
    let since = ledgerInt(state, key, 0);
    if (since === 0) {
      since = state.turn;
      setLedgerInt(state, key, since);
      events.push(
        notice(
          null,
          `${playerName(state, player)} tient ${numberWord(
            VICTORY_TUNING.masterCenters,
          )} centres majeurs. Le décompte des Marches commence.`,
          'warn',
        ),
      );
    }
    if (state.turn - since >= VICTORY_TUNING.masterHold && !winner) winner = player;
  }
  return winner;
}

/* ── Score de chronique ─────────────────────────────────────────────────── */

export interface ScoreBreakdown {
  player: PlayerId;
  total: number;
  seals: number;
  towns: number;
  heroes: number;
  army: number;
  reputation: number;
  treasure: number;
  claim: number;
  mines: number;
}

/** Détail du score d'une bannière. Fonction pure. */
export function scoreBreakdown(state: GameState, player: PlayerId): ScoreBreakdown {
  const p = state.players[player];
  const empty: ScoreBreakdown = {
    player,
    total: 0,
    seals: 0,
    towns: 0,
    heroes: 0,
    army: 0,
    reputation: 0,
    treasure: 0,
    claim: 0,
    mines: 0,
  };
  if (!p) return empty;

  const creatures = content().CREATURES;
  const seals = p.seals.length * VICTORY_TUNING.scoreSeal;

  let towns = 0;
  for (const uid of p.towns.slice().sort()) {
    const town = state.towns[uid];
    if (!town) continue;
    towns += town.isCapital ? VICTORY_TUNING.scoreCapital : VICTORY_TUNING.scoreTown;
  }

  let heroes = 0;
  let army = 0;
  for (const uid of p.heroes.slice().sort()) {
    const hero = state.heroes[uid];
    if (!hero) continue;
    heroes += hero.level * VICTORY_TUNING.scoreHeroLevel;
    for (const stack of hero.army) {
      if (!stack) continue;
      const def = creatures[stack.creature];
      if (def) army += Math.trunc((def.power * stack.count) / VICTORY_TUNING.scoreArmyDivisor);
    }
  }
  for (const uid of p.towns.slice().sort()) {
    const town = state.towns[uid];
    if (!town) continue;
    for (const stack of town.garrison) {
      if (!stack) continue;
      const def = creatures[stack.creature];
      if (def) army += Math.trunc((def.power * stack.count) / VICTORY_TUNING.scoreArmyDivisor);
    }
  }

  let treasure = 0;
  for (const k of RESOURCE_KEYS) treasure += p.resources[k] | 0;
  treasure = Math.trunc(treasure / VICTORY_TUNING.scoreTreasureDivisor);

  let mines = 0;
  for (const uid of Object.keys(state.objects).sort()) {
    const obj = state.objects[uid];
    if (obj.kind === 'mine' && obj.owner === player) mines += VICTORY_TUNING.scoreMine;
  }

  const reputation = p.reputation * VICTORY_TUNING.scoreReputation;
  const claim = state.claim && state.claim.by === player ? VICTORY_TUNING.scoreClaim : 0;

  return {
    player,
    total: seals + towns + heroes + army + reputation + treasure + claim + mines,
    seals,
    towns,
    heroes,
    army,
    reputation,
    treasure,
    claim,
    mines,
  };
}

/** Score total d'une bannière. */
export function scoreOf(state: GameState, player: PlayerId): number {
  return scoreBreakdown(state, player).total;
}

/** Classement complet, du meilleur au moins bon ; à égalité, ordre du tour. */
export function standings(state: GameState): ScoreBreakdown[] {
  const rows = state.turnOrder.map((id) => scoreBreakdown(state, id));
  return rows.sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    return state.turnOrder.indexOf(a.player) - state.turnOrder.indexOf(b.player);
  });
}

/* ── Contrôle général ───────────────────────────────────────────────────── */

function endGame(state: GameState, winner: PlayerId | null, reason: string): GameEvent[] {
  state.phase = 'termine';
  state.winner = winner;
  state.endReason = reason;
  return [
    { type: 'GameEnded', winner, reason },
    notice(
      null,
      winner ? `${playerName(state, winner)} l’emporte. ${reason}` : reason,
      'danger',
    ),
  ];
}

/**
 * Contrôle complet des conditions de victoire.
 * Signature imposée par `docs/02-API.md`.
 */
export function checkVictory(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.phase === 'termine') return events;
  const config = gameConfig(state);

  // 1. Le compte des sept jours : perdre sa dernière cité ouvre un sursis.
  for (const id of state.turnOrder) {
    const p = state.players[id];
    if (!p || !p.alive) continue;
    if (p.towns.length === 0 && p.sansCiteDepuis === undefined) {
      p.sansCiteDepuis = state.turn;
      events.push(
        notice(
          null,
          `${p.name} n’a plus une seule cité. Sa maison a ${numberWord(JOURS_SANS_CITE)} jours pour en reprendre une, ou s’éteindre.`,
          'warn',
        ),
      );
    } else if (p.towns.length > 0 && p.sansCiteDepuis !== undefined) {
      delete p.sansCiteDepuis;
      events.push(notice(null, `${p.name} relève une cité : sa maison respire.`, 'info'));
    }
  }

  // 2. Éliminations.
  for (const id of state.turnOrder) {
    const p = state.players[id];
    if (!p || !p.alive) continue;
    if (!isEliminated(state, id)) continue;
    p.alive = false;
    p.defeatedAtTurn = state.turn;
    /* Une maison éteinte cesse de pavoiser. Sans cet appel, ses gisements
       gardaient son nom pour le reste de la partie : la carte montrait les
       couleurs d'un mort et `scoreBreakdown` lui comptait encore ses mines.
       C'est la fonction même qu'appelle la reddition, pour que les deux
       sorties de partie ne puissent pas diverger. */
    abaisserPavois(state, id);
    events.push({ type: 'PlayerDefeated', player: id });
    events.push(
      notice(
        null,
        `${p.name} n’a plus ni pierre ni bannière dans le Forez. Sa maison s’éteint au jour ${state.turn}.`,
        'danger',
      ),
    );
  }

  const alive = alivePlayers(state);
  if (alive.length === 0) {
    return [...events, ...endGame(state, null, 'Plus aucune bannière ne flotte sur le Forez.')];
  }
  if (alive.length === 1) {
    return [
      ...events,
      ...endGame(
        state,
        alive[0],
        'Dernière bannière debout : le comté n’a plus de rival à lui opposer.',
      ),
    ];
  }

  // 2. Proclamation de la Maison du Trésor (annoncée dans tous les modes).
  const claimed = tickClaim(state, events);
  if (claimed && state.claim) {
    /* La proclamation aboutie vaut prestige, jamais victoire : le seul mode de
       la partie est la prise de tous les châteaux adverses. L'ancien mode
       Couronne s'arrêtait ici ; la mesure montrait qu'on pouvait ainsi gagner
       sans conquérir, et c'est précisément ce qui est retiré. */
    const p = state.players[state.claim.by];
    if (p && ledgerString(state, `${VICTORY_TUNING.ledgerClaimKey}.honore`) !== state.claim.by) {
      p.reputation += 5;
      setLedgerString(state, `${VICTORY_TUNING.ledgerClaimKey}.honore`, state.claim.by);
      events.push(
        notice(
          null,
          `${p.name} tient la Maison du Trésor depuis trois semaines. Le Grand Livre porte désormais son nom, ` +
            `mais la règle de cette partie exige autre chose qu’un titre.`,
          'warn',
        ),
      );
    }
  }

  // 4. Le Maître des Marches reste un titre de prestige, jamais une fin.
  updateMasterHold(state, events);

  /* Il n'y a plus de terme de chronique : une partie ne s'achève que par la
     prise du dernier château adverse. Vingt parties mesurées se réglaient
     toutes au score des semaines écoulées, et le profil le plus immobile en
     gagnait quinze — un monde où l'on gagnait sans conquérir. `maxWeeks`
     subsiste dans la configuration comme information de rythme, plus comme
     couperet. */
  void config;

  return events;
}

/* ── Lecture ────────────────────────────────────────────────────────────── */

export interface VictoryProgress {
  mode: ReturnType<typeof gameConfig>['victory'];
  weeksLeft: number;
  claim: { by: PlayerId; remaining: number } | null;
  sealsRequired: number;
  perPlayer: {
    player: PlayerId;
    alive: boolean;
    seals: number;
    centers: number;
    masterDays: number;
    score: number;
  }[];
}

/** Avancement des objectifs, pour l'écran « Objectifs » et pour l'IA. */
export function victoryProgress(state: GameState): VictoryProgress {
  const config = gameConfig(state);
  return {
    mode: config.victory,
    weeksLeft: Math.max(0, config.maxWeeks - weekOf(state.turn) + 1),
    claim: state.claim ? { by: state.claim.by, remaining: claimRemaining(state) } : null,
    sealsRequired: VICTORY_TUNING.sealsRequired,
    perPlayer: state.turnOrder.map((player) => {
      const p = state.players[player];
      const since = masterSince(state, player);
      return {
        player,
        alive: p?.alive === true,
        seals: p?.seals.length ?? 0,
        centers: centersHeld(state, player),
        masterDays: since === 0 ? 0 : Math.max(0, state.turn - since),
        score: scoreOf(state, player),
      };
    }),
  };
}

/** Phrase publique décrivant l'objectif en cours. */
export function objectiveSentence(state: GameState): string {
  const config = gameConfig(state);
  switch (config.victory) {
    case 'couronne':
      return state.claim
        ? `Proclamation en cours : ${pluralize(claimRemaining(state), 'jour restant', 'jours restants')}.`
        : `Réunir ${numberWord(VICTORY_TUNING.sealsRequired)} Sceaux des Marches, forcer la Maison du Trésor, tenir la proclamation ${VICTORY_TUNING.claimTurns} jours.`;
    case 'derniere_banniere':
      return 'Abattre toutes les autres bannières du Forez.';
    case 'maitre_marches':
      return `Tenir ${numberWord(VICTORY_TUNING.masterCenters)} centres majeurs pendant ${VICTORY_TUNING.masterHold} jours sans les perdre.`;
    case 'chronique':
    default:
      return `Devancer au score au terme des ${config.maxWeeks} semaines : sceaux, cités, armée, réputation, trésor.`;
  }
}
