/**
 * Diplomatie : parlementer avec les gardes neutres.
 *
 * Dans le Forez, une bande armée qui garde un gué ou une mine n'est pas un
 * monstre : c'est une compagnie sans maître. Un héros doté de Diplomatie peut
 * lui parler avant de la combattre. Quatre issues, dans l'ordre de faveur :
 *
 *  - `ralliement`  : la compagnie rejoint la bannière sans rien demander ;
 *  - `engagement`  : elle rejoint contre une solde, payée sur-le-champ ;
 *  - `retrait`     : elle s'écarte et libère le passage, sans combattre ;
 *  - `combat`      : la parole n'a pas suffi.
 *
 * Les chances dépendent du rang de Diplomatie, de la spécialité du héros, de
 * la réputation de la bannière, du rapport de force et de la richesse de la
 * compagnie. Tout est entier ; le tirage passe par `state.rng`.
 */
import {
  RESOURCE_KEYS,
  type ArmyStack,
  type CreatureDef,
  type GameEvent,
  type GameState,
  type HeroInstance,
  type MapObject,
  type Resources,
} from '../types.js';
import { nextInt } from '../rng.js';
import { addToArmy, applyBp, armyPower, clampInt, content } from '../core/index.js';
import {
  canPay,
  describeDelta,
  giveResources,
  heroName,
  joinFr,
  notice,
  numberWord,
} from './common.js';
import { skillRank } from './hero-stats.js';

/* ── Réglages ───────────────────────────────────────────────────────────── */

/**
 * Réglages de la diplomatie. Les probabilités sont en points de base
 * (10000 = certitude) et bornées : une compagnie ne se rallie jamais
 * automatiquement, et une compagnie écrasée finit toujours par s'écarter.
 */
export const DIPLOMACY_TUNING = {
  /** Identifiant de la compétence de diplomatie dans le contenu. */
  skillId: 'diplomatie',
  /** Chance de base d'obtenir une issue pacifique, par rang (0 à 3), en BP. */
  baseByRank: [0, 1800, 3400, 5200] as const,
  /** Part de la chance convertie en ralliement gratuit, par rang, en BP. */
  freeShareByRank: [0, 2000, 3200, 4500] as const,
  /** Chance ajoutée par point de réputation de la bannière, en BP. */
  perReputation: 90,
  /** Bornes de la contribution de la réputation, en BP. */
  reputationMin: -1800,
  reputationMax: 2200,
  /** Chance ajoutée par niveau de héros, en BP. */
  perHeroLevel: 45,
  /**
   * Rapport de force : chance ajoutée quand l'armée du héros écrase la
   * compagnie. Calculée sur le ratio de puissance, bornée.
   */
  powerRatioCapBp: 40000,
  powerBonusMaxBp: 2600,
  /** Chance retirée quand la compagnie est la plus forte, en BP. */
  powerMalusMaxBp: 2400,
  /** Une compagnie plus puissante que ce ratio ne parlemente pas. */
  hopelessRatioBp: 4000,
  /** Chance maximale, tous bonus confondus : la parole n'est jamais sûre. */
  chanceCeiling: 8200,
  /** Solde exigée pour un engagement, en écus par point de puissance. */
  wagePerPower: 3,
  /** Solde minimale d'un engagement. */
  wageFloor: 120,
  /**
   * Une compagnie ne se rallie qu'en partie : part des effectifs qui suit,
   * en points de base, par rang de diplomatie.
   */
  joinShareByRank: [0, 5000, 7000, 10000] as const,
  /** Réputation gagnée à obtenir un ralliement. */
  reputationOnRally: 1,
  /** Réputation perdue à massacrer une compagnie qui voulait parler. */
  reputationOnRefusal: 0,
} as const;

/* ── Lecture ────────────────────────────────────────────────────────────── */

/** Puissance brute d'une garde neutre. */
export function guardPower(guard: readonly ArmyStack[] | undefined): number {
  if (!guard || guard.length === 0) return 0;
  const table = content().CREATURES;
  let total = 0;
  for (const stack of guard) {
    const def: CreatureDef | undefined = table[stack.creature];
    if (!def) continue;
    total += def.power * Math.max(0, stack.count);
  }
  return total;
}

/** Prime de spécialité diplomatique du héros, en points de base additionnels. */
export function diplomacySpecialtyBp(hero: HeroInstance): number {
  const def = content().HEROES[hero.def];
  if (!def || def.specialty.kind !== 'diplomacy') return 0;
  return Math.max(0, def.specialty.bp - 10000);
}

export interface ParleyChance {
  /** Chance totale d'une issue pacifique, en points de base. */
  totalBp: number;
  /** Part de cette chance qui donne un ralliement gratuit, en BP. */
  freeBp: number;
  /** Solde exigée si la compagnie s'engage plutôt qu'elle ne se rallie. */
  wage: number;
  /** Détail lisible, pour l'info-bulle. */
  factors: { label: string; bp: number }[];
  rank: 0 | 1 | 2 | 3;
}

/**
 * Chances de parlementer avec cette compagnie. Fonction **pure** : elle ne
 * consomme pas le PRNG et peut donc alimenter une info-bulle sans altérer la
 * partie.
 */
export function parleyChance(
  state: GameState,
  hero: HeroInstance,
  guard: readonly ArmyStack[] | undefined,
): ParleyChance {
  const rank = skillRank(hero, DIPLOMACY_TUNING.skillId);
  const factors: { label: string; bp: number }[] = [];
  const wageOf = (): number =>
    Math.max(DIPLOMACY_TUNING.wageFloor, guardPower(guard) * DIPLOMACY_TUNING.wagePerPower);

  // Sans Diplomatie, on ne parlemente pas : on charge ou l'on contourne.
  if (rank === 0) {
    return {
      totalBp: 0,
      freeBp: 0,
      wage: wageOf(),
      factors: [{ label: 'Aucune Diplomatie', bp: 0 }],
      rank,
    };
  }

  let total: number = DIPLOMACY_TUNING.baseByRank[rank];
  if (total > 0) factors.push({ label: `Diplomatie (rang ${rank})`, bp: total });

  const specialty = diplomacySpecialtyBp(hero);
  if (specialty > 0) {
    total += specialty;
    factors.push({ label: 'Pactes de village', bp: specialty });
  }

  const reputation = state.players[hero.owner]?.reputation ?? 0;
  const repBp = clampInt(
    reputation * DIPLOMACY_TUNING.perReputation,
    DIPLOMACY_TUNING.reputationMin,
    DIPLOMACY_TUNING.reputationMax,
  );
  if (repBp !== 0) {
    total += repBp;
    factors.push({ label: 'Réputation de la bannière', bp: repBp });
  }

  const levelBp = hero.level * DIPLOMACY_TUNING.perHeroLevel;
  if (levelBp !== 0) {
    total += levelBp;
    factors.push({ label: 'Renom du héros', bp: levelBp });
  }

  const mine = armyPower(hero.army);
  const theirs = guardPower(guard);
  let ratioBp = 10000;
  if (theirs > 0) ratioBp = clampInt(Math.trunc((mine * 10000) / theirs), 0, DIPLOMACY_TUNING.powerRatioCapBp);
  let powerBp = 0;
  if (theirs === 0) {
    powerBp = DIPLOMACY_TUNING.powerBonusMaxBp;
  } else if (ratioBp >= 10000) {
    const over = ratioBp - 10000;
    const span = DIPLOMACY_TUNING.powerRatioCapBp - 10000;
    powerBp = span > 0 ? Math.trunc((over * DIPLOMACY_TUNING.powerBonusMaxBp) / span) : 0;
  } else {
    powerBp = -Math.trunc(((10000 - ratioBp) * DIPLOMACY_TUNING.powerMalusMaxBp) / 10000);
  }
  if (powerBp !== 0) {
    total += powerBp;
    factors.push({ label: 'Rapport de force', bp: powerBp });
  }

  if (theirs > 0 && ratioBp < DIPLOMACY_TUNING.hopelessRatioBp) {
    // Une compagnie très supérieure n'écoute pas : elle attend le combat.
    total = 0;
    factors.push({ label: 'La compagnie ne daigne pas répondre', bp: 0 });
  }

  total = clampInt(total, 0, DIPLOMACY_TUNING.chanceCeiling);
  const freeBp = Math.trunc((total * DIPLOMACY_TUNING.freeShareByRank[rank]) / 10000);
  const wage = Math.max(
    DIPLOMACY_TUNING.wageFloor,
    theirs * DIPLOMACY_TUNING.wagePerPower,
  );

  return { totalBp: total, freeBp, wage, factors, rank };
}

/* ── Résolution ─────────────────────────────────────────────────────────── */

export type ParleyKind = 'ralliement' | 'engagement' | 'retrait' | 'combat';

export interface ParleyOutcome {
  kind: ParleyKind;
  /** Piles réellement proposées au héros (part des effectifs). */
  joining: ArmyStack[];
  /** Solde exigée si `kind === 'engagement'`. */
  wage: number;
  text: string;
}

/** Part des effectifs qui accepte de suivre, selon le rang de diplomatie. */
export function joiningStacks(
  guard: readonly ArmyStack[] | undefined,
  rank: 0 | 1 | 2 | 3,
): ArmyStack[] {
  if (!guard || guard.length === 0) return [];
  const share = DIPLOMACY_TUNING.joinShareByRank[rank];
  const out: ArmyStack[] = [];
  for (const stack of guard.slice().sort((a, b) => (a.creature < b.creature ? -1 : 1))) {
    const count = Math.trunc((stack.count * share) / 10000);
    if (count > 0) out.push({ creature: stack.creature, count });
  }
  return out;
}

/**
 * Résout la parole. **Consomme le PRNG** : à n'appeler qu'une fois par
 * rencontre, depuis `visitObject` ou depuis le noyau au moment d'engager une
 * garde neutre.
 */
export function resolveParley(
  state: GameState,
  hero: HeroInstance,
  guard: readonly ArmyStack[] | undefined,
): ParleyOutcome {
  const chance = parleyChance(state, hero, guard);
  const roll = nextInt(state.rng, 1, 10000);
  const names = stackNames(guard);

  if (roll > chance.totalBp) {
    return {
      kind: 'combat',
      joining: [],
      wage: chance.wage,
      text:
        names.length > 0
          ? `${names} n’ont que faire des belles paroles : les piques se baissent.`
          : 'La compagnie refuse de parlementer.',
    };
  }

  const joining = joiningStacks(guard, chance.rank);
  if (joining.length === 0) {
    return {
      kind: 'retrait',
      joining: [],
      wage: chance.wage,
      text: `${names || 'La compagnie'} s’écarte du chemin sans un mot et disparaît dans la futaie.`,
    };
  }

  if (roll <= chance.freeBp) {
    return {
      kind: 'ralliement',
      joining,
      wage: 0,
      text: `${names} plantent leur bannière derrière la vôtre : ils ne demandent rien.`,
    };
  }
  return {
    kind: 'engagement',
    joining,
    wage: chance.wage,
    text: `${names} veulent bien vous suivre, mais la solde d’abord : ${chance.wage} écus.`,
  };
}

/**
 * Applique une issue de parole à l'état : incorporation des piles, paiement de
 * la solde, disparition de la garde, réputation.
 */
export function applyParley(
  state: GameState,
  hero: HeroInstance,
  obj: MapObject,
  outcome: ParleyOutcome,
): GameEvent[] {
  const events: GameEvent[] = [];

  if (outcome.kind === 'combat') {
    events.push(notice(hero.owner, outcome.text, 'warn'));
    return events;
  }

  if (outcome.kind === 'engagement') {
    const cost: Partial<Resources> = { ecus: outcome.wage };
    if (!canPay(state, hero.owner, cost)) {
      events.push(
        notice(
          hero.owner,
          `${heroName(hero)} n’a pas les ${outcome.wage} écus de la solde : la compagnie tourne les talons.`,
          'warn',
        ),
      );
      return events;
    }
    const debit: Partial<Resources> = {};
    for (const k of RESOURCE_KEYS) {
      const c = cost[k];
      if (c) debit[k] = -c;
    }
    events.push(...giveResources(state, hero.owner, debit, 'solde de compagnie'));
  }

  let taken = 0;
  const refused: string[] = [];
  for (const stack of outcome.joining) {
    if (addToArmy(hero.army, stack.creature, stack.count)) taken += stack.count;
    else refused.push(creatureName(stack));
  }

  obj.guard = [];
  obj.spent = true;

  if (outcome.kind !== 'retrait') {
    const p = state.players[hero.owner];
    if (p) p.reputation += DIPLOMACY_TUNING.reputationOnRally;
  }

  events.push(notice(hero.owner, outcome.text, 'info'));
  if (taken > 0) {
    events.push(
      notice(
        hero.owner,
        `${numberWord(taken)} combattants rejoignent la colonne de ${heroName(hero)}.`,
        'info',
      ),
    );
  }
  if (refused.length > 0) {
    events.push(
      notice(
        hero.owner,
        `Faute d’emplacement libre, ${joinFr(refused)} restent sur place.`,
        'warn',
      ),
    );
  }
  return events;
}

/**
 * Tentative complète : parole puis application. Retourne les événements et
 * l'issue, afin que l'appelant sache s'il doit engager le combat.
 */
export function attemptParley(
  state: GameState,
  hero: HeroInstance,
  obj: MapObject,
): { events: GameEvent[]; outcome: ParleyOutcome } {
  const outcome = resolveParley(state, hero, obj.guard);
  return { events: applyParley(state, hero, obj, outcome), outcome };
}

/* ── Textes ─────────────────────────────────────────────────────────────── */

function creatureName(stack: ArmyStack): string {
  const def = content().CREATURES[stack.creature];
  if (!def) return stack.creature;
  return stack.count > 1 ? `${stack.count} ${def.namePlural}` : `${stack.count} ${def.name}`;
}

/** « douze Manants et trois Piqueurs ». */
export function stackNames(guard: readonly ArmyStack[] | undefined): string {
  if (!guard || guard.length === 0) return '';
  return joinFr(
    guard
      .slice()
      .sort((a, b) => (a.creature < b.creature ? -1 : 1))
      .map(creatureName),
  );
}

/** Phrase d'aperçu pour l'interface : chances et solde attendues. */
export function parleySentence(
  state: GameState,
  hero: HeroInstance,
  guard: readonly ArmyStack[] | undefined,
): string {
  const chance = parleyChance(state, hero, guard);
  if (chance.totalBp <= 0) {
    return 'Aucune parole ne portera : cette compagnie ne connaît que les armes.';
  }
  const pct = Math.trunc(chance.totalBp / 100);
  const free = Math.trunc(chance.freeBp / 100);
  const delta = describeDelta({ ecus: chance.wage });
  return (
    `Une chance sur ${Math.max(2, Math.trunc(10000 / Math.max(1, chance.totalBp)))} de s’entendre ` +
    `(${pct} %, dont ${free} % sans bourse délier). Solde attendue : ${delta}.`
  );
}

/** Ratio de puissance héros / garde, en points de base, pour l'IA. */
export function powerRatioBp(hero: HeroInstance, guard: readonly ArmyStack[] | undefined): number {
  const theirs = guardPower(guard);
  if (theirs <= 0) return DIPLOMACY_TUNING.powerRatioCapBp;
  return clampInt(
    Math.trunc((armyPower(hero.army) * 10000) / theirs),
    0,
    DIPLOMACY_TUNING.powerRatioCapBp,
  );
}
