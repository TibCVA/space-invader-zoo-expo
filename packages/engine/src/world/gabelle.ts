/**
 * La gabelle — impôt du sel, et principal anti-emballement du jeu.
 *
 * Document maître §7.5 : le détenteur de la Maison du Trésor choisit une
 * politique. Plus elle rapporte, plus elle fabrique d'ennemis. Le mécanisme est
 * **public** : aucune aide secrète au joueur en retard, seulement un coût
 * croissant pour celui qui domine.
 *
 *  - `franchise`    : recettes nulles, faveur du pays, routes sûres ;
 *  - `mesure`       : recettes et agitation équilibrées ;
 *  - `forte`        : recettes élevées, contrebandiers, risque de révolte.
 *
 * Le rendement est **majoré** par la domination du détenteur (cités, sceaux,
 * gisements) — et l'agitation l'est davantage encore. Un joueur qui tient tout
 * gagne plus, mais son propre pays se met à gronder : c'est le frein.
 *
 * `gabelleIncome` est **pure** : elle ne consomme pas le PRNG, puisque le
 * noyau l'appelle chaque jour et que l'interface doit pouvoir l'afficher en
 * aperçu. Les tirages (contrebande, révolte) ont lieu une fois par semaine,
 * dans `resolveGabelleWeek`.
 */
import type {
  GabellePolicy,
  GameEvent,
  GameState,
  PlayerId,
  TownState,
} from '../types.js';
import { nextChance, nextInt } from '../rng.js';
import { MAX_UNREST as UNREST_CEILING, clampInt } from '../core/index.js';
import {
  allObjects,
  giveResources,
  heroesOf,
  joinFr,
  ledgerInt,
  notice,
  numberWord,
  resourceWords,
  setLedgerInt,
  treasuryHolder,
} from './common.js';
import { skillRank } from './hero-stats.js';

/* ── Réglages ───────────────────────────────────────────────────────────── */

/**
 * Les trois politiques et leurs conséquences quotidiennes.
 * `unrest` est ajouté chaque jour à l'agitation de **chaque** cité du
 * détenteur ; `reputation` est appliqué une fois par semaine.
 */
export const GABELLE_TUNING = {
  policies: {
    franchise: {
      label: 'Franchise',
      summary: 'Le sel circule libre. Le pays vous en sait gré ; le trésor, moins.',
      ecus: 0,
      sel: 2,
      unrest: -3,
      reputation: 2,
      /** Chance hebdomadaire de contrebande, en points de base. */
      smugglerBp: 0,
      /** Chance hebdomadaire de révolte d'une cité agitée, en BP. */
      revoltBp: 0,
    },
    mesure: {
      label: 'Droit mesuré',
      summary: 'Le droit se paie sans qu’on le maudisse. Les gabelous tiennent leurs registres.',
      ecus: 380,
      sel: 4,
      unrest: 1,
      reputation: 0,
      smugglerBp: 900,
      revoltBp: 400,
    },
    forte: {
      label: 'Forte gabelle',
      summary:
        'Chaque mesure de sel est pesée deux fois et taxée trois. Les faux-sauniers passent par les crêtes.',
      ecus: 950,
      sel: 8,
      unrest: 5,
      reputation: -2,
      smugglerBp: 3800,
      revoltBp: 1600,
    },
  } as const satisfies Record<
    GabellePolicy,
    {
      label: string;
      summary: string;
      ecus: number;
      sel: number;
      unrest: number;
      reputation: number;
      smugglerBp: number;
      revoltBp: number;
    }
  >,

  /* — Domination et anti-emballement — */

  /** Points de domination par cité tenue. */
  dominationPerTown: 2,
  /** Points de domination par Sceau des Marches détenu. */
  dominationPerSeal: 3,
  /** Points de domination par gisement tenu. */
  dominationPerMine: 1,
  /** Domination à partir de laquelle la majoration commence. */
  dominationFloor: 6,
  /** Majoration des recettes par point de domination au-delà du seuil, en BP. */
  incomePerDominationBp: 400,
  /** Majoration maximale des recettes, en BP. */
  incomeMaxBp: 16000,
  /** Majoration de l'agitation par point de domination au-delà du seuil, en BP. */
  unrestPerDominationBp: 900,
  /** Majoration maximale de l'agitation, en BP. */
  unrestMaxBp: 24000,

  /* — Contrebande — */

  /** Chance de contrebande ajoutée par point d'agitation moyenne, en BP. */
  smugglerPerUnrestBp: 42,
  /** Part des recettes du jour dérobée par les contrebandiers, en BP. */
  smugglerLootBp: 2600,
  /** Mesures de sel détournées, minimum et maximum. */
  smugglerSaltMin: 2,
  smugglerSaltMax: 7,
  /** Agitation ajoutée par un passage de contrebandiers. */
  smugglerUnrest: 3,
  /** Réputation perdue à laisser passer les faux-sauniers. */
  smugglerReputation: -1,

  /* — Révolte — */

  /** Agitation en deçà de laquelle aucune révolte n'est possible. */
  revoltThreshold: 60,
  /** Chance de révolte ajoutée par point d'agitation au-delà du seuil, en BP. */
  revoltPerUnrestBp: 120,
  /** Part de la garnison qui déserte lors d'une révolte, en BP. */
  revoltDesertionBp: 3000,
  /** Agitation retombée après une révolte : la colère se vide. */
  revoltUnrestAfter: 25,
  /** Une cité non capitale bascule hors bannière au-delà de cette agitation. */
  revoltSecessionUnrest: 90,
  /** Réputation perdue par révolte. */
  revoltReputation: -2,

  /* — Apaisement — */

  /** Agitation retirée par un héros doté de Diplomatie, par rang et par semaine. */
  diplomacyCalmPerRank: 4,
  /** Agitation retirée chaque semaine par une charte spirituelle. */
  charterCalm: 3,
  /** Identifiant de la compétence apaisante. */
  calmSkillId: 'diplomatie',

  /** Clef de comptabilité des révoltes dans la chronique. */
  ledgerRevoltKey: 'gabelle.revoltes',
  /** Clef de comptabilité des passages de contrebandiers. */
  ledgerSmugglerKey: 'gabelle.contrebande',
} as const;

/** Ordre canonique des trois politiques, pour l'interface. */
export const GABELLE_ORDER: readonly GabellePolicy[] = ['franchise', 'mesure', 'forte'];

/* ── Domination ─────────────────────────────────────────────────────────── */

/** Indice de domination d'une bannière : cités, sceaux, gisements. */
export function dominationOf(state: GameState, player: PlayerId): number {
  const p = state.players[player];
  if (!p) return 0;
  let score =
    p.towns.length * GABELLE_TUNING.dominationPerTown +
    p.seals.length * GABELLE_TUNING.dominationPerSeal;
  for (const obj of allObjects(state)) {
    if (obj.kind === 'mine' && obj.owner === player) {
      score += GABELLE_TUNING.dominationPerMine;
    }
  }
  return score;
}

/** Majoration des recettes due à la domination, en points de base. */
export function dominationIncomeBp(state: GameState, player: PlayerId): number {
  const over = Math.max(0, dominationOf(state, player) - GABELLE_TUNING.dominationFloor);
  return Math.min(
    GABELLE_TUNING.incomeMaxBp,
    10000 + over * GABELLE_TUNING.incomePerDominationBp,
  );
}

/** Majoration de l'agitation due à la domination, en points de base. */
export function dominationUnrestBp(state: GameState, player: PlayerId): number {
  const over = Math.max(0, dominationOf(state, player) - GABELLE_TUNING.dominationFloor);
  return Math.min(
    GABELLE_TUNING.unrestMaxBp,
    10000 + over * GABELLE_TUNING.unrestPerDominationBp,
  );
}

/* ── Recettes quotidiennes ──────────────────────────────────────────────── */

export interface GabelleReport {
  policy: GabellePolicy;
  holder: PlayerId | null;
  ecus: number;
  sel: number;
  unrest: number;
  domination: number;
  incomeBp: number;
  unrestBp: number;
  averageUnrest: number;
  smugglerBp: number;
  revoltBp: number;
  text: string;
}

/**
 * Rendement du jour, agitation comprise.
 * Signature imposée par `docs/02-API.md`. Fonction pure : aucun tirage.
 */
export function gabelleIncome(state: GameState): { ecus: number; sel: number; unrest: number } {
  const report = gabelleReport(state);
  return { ecus: report.ecus, sel: report.sel, unrest: report.unrest };
}

/** Rapport complet, pour l'interface, l'IA et le journal. */
export function gabelleReport(state: GameState): GabelleReport {
  const policy: GabellePolicy = GABELLE_TUNING.policies[state.gabelle]
    ? state.gabelle
    : 'mesure';
  const row = GABELLE_TUNING.policies[policy];
  const holder = treasuryHolder(state);

  if (!holder) {
    return {
      policy,
      holder: null,
      ecus: 0,
      sel: 0,
      unrest: 0,
      domination: 0,
      incomeBp: 10000,
      unrestBp: 10000,
      averageUnrest: 0,
      smugglerBp: 0,
      revoltBp: 0,
      text:
        'La Maison du Trésor n’a pas de maître : les greniers à sel restent scellés et nul ne perçoit la gabelle.',
    };
  }

  const incomeBp = dominationIncomeBp(state, holder);
  const unrestBp = dominationUnrestBp(state, holder);
  const ecus = Math.trunc((row.ecus * incomeBp) / 10000);
  const sel = Math.trunc((row.sel * incomeBp) / 10000);
  // Une politique apaisante n'est jamais aggravée par la domination.
  const unrest =
    row.unrest <= 0 ? row.unrest : Math.max(1, Math.trunc((row.unrest * unrestBp) / 10000));

  const average = averageUnrest(state, holder);
  const smugglerBp = clampInt(
    row.smugglerBp + average * GABELLE_TUNING.smugglerPerUnrestBp,
    0,
    9000,
  );
  const revoltBp = clampInt(
    row.revoltBp +
      Math.max(0, average - GABELLE_TUNING.revoltThreshold) * GABELLE_TUNING.revoltPerUnrestBp,
    0,
    7000,
  );

  return {
    policy,
    holder,
    ecus,
    sel,
    unrest,
    domination: dominationOf(state, holder),
    incomeBp,
    unrestBp,
    averageUnrest: average,
    smugglerBp,
    revoltBp,
    text: `${row.label} — ${row.summary} Recette du jour : ${joinFr([
      resourceWords('ecus', ecus),
      resourceWords('sel', sel),
    ])}.`,
  };
}

/** Agitation moyenne des cités d'une bannière, arrondie vers le bas. */
export function averageUnrest(state: GameState, player: PlayerId): number {
  const p = state.players[player];
  if (!p || p.towns.length === 0) return 0;
  let total = 0;
  let count = 0;
  for (const uid of p.towns.slice().sort()) {
    const town = state.towns[uid];
    if (!town) continue;
    total += clampInt(town.unrest, 0, UNREST_CEILING);
    count++;
  }
  return count === 0 ? 0 : Math.trunc(total / count);
}

/* ── Résolution hebdomadaire ────────────────────────────────────────────── */

/**
 * Conséquences hebdomadaires de la gabelle : réputation, apaisement,
 * contrebandiers et révoltes. **Consomme le PRNG** : appelée une seule fois par
 * semaine, depuis `weeklyEvent`.
 */
export function resolveGabelleWeek(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const report = gabelleReport(state);
  const holder = report.holder;

  // 1. Apaisement : chartes spirituelles et héros diplomates, pour tous.
  events.push(...calmTowns(state));

  if (!holder) return events;
  const p = state.players[holder];
  if (!p || !p.alive) return events;

  // 2. Réputation liée à la politique.
  const row = GABELLE_TUNING.policies[report.policy];
  if (row.reputation !== 0) {
    p.reputation += row.reputation;
    events.push(
      notice(
        holder,
        row.reputation > 0
          ? 'Le pays sait qui laisse passer le sel : votre faveur grandit.'
          : 'On maudit vos gabelous jusque sur les marchés de Noirétable.',
        row.reputation > 0 ? 'info' : 'warn',
      ),
    );
  }

  // 3. Contrebandiers.
  if (report.smugglerBp > 0 && nextChance(state.rng, report.smugglerBp)) {
    events.push(...runSmugglers(state, holder, report));
  }

  // 4. Révolte.
  if (report.revoltBp > 0 && nextChance(state.rng, report.revoltBp)) {
    events.push(...runRevolt(state, holder));
  }

  return events;
}

/** Passage de faux-sauniers : recettes dérobées, sel détourné, agitation. */
function runSmugglers(
  state: GameState,
  holder: PlayerId,
  report: GabelleReport,
): GameEvent[] {
  const events: GameEvent[] = [];
  const stolenEcus = Math.max(
    40,
    Math.trunc((report.ecus * 7 * GABELLE_TUNING.smugglerLootBp) / 10000),
  );
  const stolenSalt = nextInt(
    state.rng,
    GABELLE_TUNING.smugglerSaltMin,
    GABELLE_TUNING.smugglerSaltMax,
  );

  events.push(
    ...giveResources(state, holder, { ecus: -stolenEcus, sel: -stolenSalt }, 'contrebande du sel'),
  );

  const p = state.players[holder];
  if (p) {
    p.reputation += GABELLE_TUNING.smugglerReputation;
    for (const uid of p.towns.slice().sort()) {
      const town = state.towns[uid];
      if (town) {
        town.unrest = clampInt(town.unrest + GABELLE_TUNING.smugglerUnrest, 0, UNREST_CEILING);
      }
    }
  }

  setLedgerInt(
    state,
    GABELLE_TUNING.ledgerSmugglerKey,
    ledgerInt(state, GABELLE_TUNING.ledgerSmugglerKey, 0) + 1,
  );

  events.push(
    notice(
      holder,
      `Les faux-sauniers sont passés par les crêtes des Bois Noirs, de nuit, sans une lanterne. ` +
        `Manquent au grenier ${joinFr([
          resourceWords('sel', stolenSalt),
          resourceWords('ecus', stolenEcus),
        ])}, et les villages rient sous cape.`,
      'warn',
    ),
  );
  return events;
}

/** Révolte d'une cité : désertion, sécession éventuelle, réputation. */
function runRevolt(state: GameState, holder: PlayerId): GameEvent[] {
  const events: GameEvent[] = [];
  const p = state.players[holder];
  if (!p) return events;

  // La cité la plus agitée se soulève ; à égalité, la première par identifiant.
  let worst: TownState | null = null;
  for (const uid of p.towns.slice().sort()) {
    const town = state.towns[uid];
    if (!town) continue;
    if (town.unrest < GABELLE_TUNING.revoltThreshold) continue;
    if (!worst || town.unrest > worst.unrest) worst = town;
  }
  if (!worst) return events;

  const town = worst;
  let deserted = 0;
  for (let i = 0; i < town.garrison.length; i++) {
    const stack = town.garrison[i];
    if (!stack) continue;
    const loss = Math.trunc((stack.count * GABELLE_TUNING.revoltDesertionBp) / 10000);
    if (loss <= 0) continue;
    stack.count -= loss;
    deserted += loss;
    if (stack.count <= 0) town.garrison[i] = null;
  }

  p.reputation += GABELLE_TUNING.revoltReputation;
  setLedgerInt(
    state,
    GABELLE_TUNING.ledgerRevoltKey,
    ledgerInt(state, GABELLE_TUNING.ledgerRevoltKey, 0) + 1,
  );

  const secession =
    !town.isCapital && town.unrest >= GABELLE_TUNING.revoltSecessionUnrest;

  if (secession) {
    const at = p.towns.indexOf(town.uid);
    if (at >= 0) p.towns.splice(at, 1);
    town.owner = null;
    town.garrisonHero = null;
    town.visitingHero = null;
    town.charter = null;
    town.unrest = GABELLE_TUNING.revoltUnrestAfter;
    events.push(
      notice(
        null,
        `${town.name} se soulève. Les cloches ont sonné à l’envers toute la nuit ; au matin, ` +
          `la bannière avait disparu du beffroi et les portes étaient closes sur vous.`,
        'danger',
      ),
    );
  } else {
    town.unrest = clampInt(town.unrest - 20, GABELLE_TUNING.revoltUnrestAfter, UNREST_CEILING);
    events.push(
      notice(
        holder,
        `Émeute du sel à ${town.name} : ${
          deserted > 0 ? `${numberWord(deserted)} hommes de la garnison ont jeté la pique` : 'la milice a tenu de justesse'
        }. Les meneurs ont été pendus ; le pays s’en souviendra.`,
        'danger',
      ),
    );
  }
  return events;
}

/** Apaisement hebdomadaire : chartes spirituelles et héros diplomates. */
function calmTowns(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const player of state.turnOrder) {
    const p = state.players[player];
    if (!p || !p.alive) continue;

    let heroCalm = 0;
    for (const hero of heroesOf(state, player)) {
      const rank = skillRank(hero, GABELLE_TUNING.calmSkillId);
      if (rank > heroCalm) heroCalm = rank;
    }
    const calm = heroCalm * GABELLE_TUNING.diplomacyCalmPerRank;

    const soothed: string[] = [];
    for (const uid of p.towns.slice().sort()) {
      const town = state.towns[uid];
      if (!town || town.unrest <= 0) continue;
      const charter = town.charter === 'spirituelle' ? GABELLE_TUNING.charterCalm : 0;
      const total = calm + charter;
      if (total <= 0) continue;
      const before = town.unrest;
      town.unrest = clampInt(town.unrest - total, 0, UNREST_CEILING);
      if (town.unrest < before) soothed.push(town.name);
    }
    if (soothed.length > 0) {
      events.push(
        notice(
          player,
          `Les prêches et les paroles ont porté : l’agitation retombe à ${joinFr(soothed)}.`,
          'info',
        ),
      );
    }
  }
  return events;
}

/* ── Lecture ────────────────────────────────────────────────────────────── */

/** Libellé français d'une politique. */
export function gabelleLabel(policy: GabellePolicy): string {
  return (GABELLE_TUNING.policies[policy] ?? GABELLE_TUNING.policies.mesure).label;
}

/** Description d'une politique, pour l'écran de la Maison du Trésor. */
export function gabelleSummary(policy: GabellePolicy): string {
  return (GABELLE_TUNING.policies[policy] ?? GABELLE_TUNING.policies.mesure).summary;
}

/** Nombre de révoltes survenues depuis le début de la partie. */
export function revoltCount(state: GameState): number {
  return ledgerInt(state, GABELLE_TUNING.ledgerRevoltKey, 0);
}

/** Nombre de passages de contrebandiers depuis le début de la partie. */
export function smugglerCount(state: GameState): number {
  return ledgerInt(state, GABELLE_TUNING.ledgerSmugglerKey, 0);
}
