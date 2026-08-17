/**
 * Progression des héros : expérience, niveaux, caractéristiques et choix de
 * compétence.
 *
 * Document maître §11 : niveau maximal 30 ; à chaque niveau le joueur choisit
 * entre **deux** propositions et « ne doit jamais être forcé d'accepter une
 * compétence inutile ». Deux garanties concrètes en découlent, vérifiées par
 * les tests :
 *
 *  1. les deux propositions portent toujours sur des compétences **distinctes** ;
 *  2. dès qu'un rang supérieur est atteignable sur une compétence déjà connue,
 *     l'une au moins des deux propositions est une **montée de rang** — jamais
 *     deux compétences neuves imposées à un héros déjà spécialisé.
 *
 * La courbe d'expérience est entière, monotone et fermée : `xpForLevel(n)` ne
 * dépend que de `n`, jamais de l'état, ce qui la rend rejouable à l'identique.
 */
import {
  type GameEvent,
  type GameState,
  type HeroInstance,
  type PrimaryStat,
  type SkillId,
  type SkillOffer,
  type SkillRank,
} from '../types.js';
import { pickWeighted } from '../rng.js';
import { MAX_LEVEL, MAX_SKILLS, applyBp, content, sortedKeys } from '../core/index.js';
import { combineEffectBp, heroName, notice, numberWord } from './common.js';
import {
  PRIMARY_LABELS,
  PRIMARY_ORDER,
  SKILL_RANK_LABELS,
  activeEffects,
  refreshDerived,
  skillRank,
} from './hero-stats.js';

/* ── Réglages ───────────────────────────────────────────────────────────── */

/**
 * Réglages de la progression. Toute la courbe tient dans les trois premiers
 * nombres : l'incrément d'expérience entre deux niveaux vaut
 *
 *     inc(k) = base + lineaire × (k − 2) + quadratique × (k − 2)²
 *
 * et `xpForLevel(n)` est la somme des incréments de 2 à n. Avec les valeurs
 * ci-dessous, le niveau 10 demande 23 100 points, le niveau 20 en demande
 * 114 475 et le niveau 30 exactement 323 350 : une courbe lente en début de
 * partie, franchement exigeante ensuite, qui rend une capitale de rang 30
 * exceptionnelle sur douze semaines.
 */
export const LEVELING_TUNING = {
  /** Niveau maximal (document maître §11.2). */
  maxLevel: MAX_LEVEL,
  /** Compétences secondaires simultanées (document maître §11.2). */
  maxSkills: MAX_SKILLS,
  /** Incrément d'expérience du niveau 2. */
  xpBase: 1000,
  /** Part linéaire de l'incrément. */
  xpLinear: 250,
  /** Part quadratique de l'incrément. */
  xpQuadratic: 25,
  /** Poids de base d'une caractéristique primaire au tirage de montée. */
  primaryBaseWeight: 20,
  /** Poids ajouté par point de caractéristique de départ du héros. */
  primaryPerStartPoint: 22,
  /** Niveau à partir duquel la progression penche vers Mystique et Savoir. */
  primaryLateLevel: 11,
  /** Poids ajouté aux caractéristiques magiques à partir de ce niveau. */
  primaryLateMagicWeight: 18,
  /** Poids retiré aux caractéristiques martiales à partir de ce niveau. */
  primaryLateMightMalus: 8,
  /** Poids par défaut d'une compétence absente de `skillWeights`. */
  skillDefaultWeight: 20,
  /** Multiplicateur de poids appliqué à une montée de rang, en BP. */
  skillUpgradeBp: 13000,
  /** Multiplicateur de poids appliqué à une compétence neuve, en BP. */
  skillFreshBp: 10000,
  /**
   * Multiplicateur appliqué aux compétences neuves quand le héros approche du
   * plafond de huit : on évite les paniers de compétences dépareillées.
   */
  skillCrowdedBp: 6000,
  /** Nombre de compétences au-delà duquel ce malus s'applique. */
  skillCrowdedFrom: 6,
} as const;

/* ── Courbe d'expérience ────────────────────────────────────────────────── */

/** Incrément d'expérience à franchir pour atteindre le niveau `level`. */
export function xpStep(level: number): number {
  if (level <= 1) return 0;
  const j = level - 2;
  return (
    LEVELING_TUNING.xpBase +
    LEVELING_TUNING.xpLinear * j +
    LEVELING_TUNING.xpQuadratic * j * j
  );
}

/** Table close des seuils d'expérience, du niveau 1 au niveau 30. */
export const XP_TABLE: readonly number[] = (() => {
  const table: number[] = new Array(LEVELING_TUNING.maxLevel + 1).fill(0);
  for (let level = 2; level <= LEVELING_TUNING.maxLevel; level++) {
    table[level] = table[level - 1] + xpStep(level);
  }
  return Object.freeze(table);
})();

/**
 * Expérience cumulée nécessaire pour atteindre un niveau.
 * Signature imposée par `docs/02-API.md`. Au-delà du niveau 30 la courbe est
 * prolongée linéairement afin de rester strictement croissante, même si aucun
 * héros ne peut y accéder.
 */
export function xpForLevel(level: number): number {
  const n = Math.trunc(level);
  if (n <= 1) return 0;
  if (n <= LEVELING_TUNING.maxLevel) return XP_TABLE[n];
  const last = XP_TABLE[LEVELING_TUNING.maxLevel];
  return last + xpStep(LEVELING_TUNING.maxLevel) * (n - LEVELING_TUNING.maxLevel);
}

/** Niveau correspondant à un total d'expérience. */
export function levelForXp(xp: number): number {
  let level = 1;
  while (level < LEVELING_TUNING.maxLevel && xp >= xpForLevel(level + 1)) level++;
  return level;
}

/** Points d'expérience restants avant le prochain niveau (0 si plafonné). */
export function xpToNextLevel(hero: HeroInstance): number {
  if (hero.level >= LEVELING_TUNING.maxLevel) return 0;
  return Math.max(0, xpForLevel(hero.level + 1) - hero.xp);
}

/** Avancement dans le niveau courant, en points de base (0..10000). */
export function levelProgressBp(hero: HeroInstance): number {
  if (hero.level >= LEVELING_TUNING.maxLevel) return 10000;
  const floor = xpForLevel(hero.level);
  const ceiling = xpForLevel(hero.level + 1);
  const span = ceiling - floor;
  if (span <= 0) return 10000;
  const done = Math.max(0, Math.min(span, hero.xp - floor));
  return Math.trunc((done * 10000) / span);
}

/* ── Tirage de la caractéristique primaire ──────────────────────────────── */

/**
 * Poids de tirage des quatre caractéristiques pour ce héros, à ce niveau.
 * Exposé pour l'interface (aperçu des chances) et pour les tests.
 */
export function primaryWeights(
  hero: HeroInstance,
  level: number,
): { stat: PrimaryStat; weight: number }[] {
  const def = content().HEROES[hero.def];
  const late = level >= LEVELING_TUNING.primaryLateLevel;
  return PRIMARY_ORDER.map((stat) => {
    let weight = LEVELING_TUNING.primaryBaseWeight;
    if (def) weight += def.start[stat] * LEVELING_TUNING.primaryPerStartPoint;
    if (late) {
      weight +=
        stat === 'mystique' || stat === 'savoir'
          ? LEVELING_TUNING.primaryLateMagicWeight
          : -LEVELING_TUNING.primaryLateMightMalus;
    }
    return { stat, weight: Math.max(1, weight) };
  });
}

/** Tire la caractéristique qui monte d'un point. Consomme le PRNG de l'état. */
export function rollPrimary(state: GameState, hero: HeroInstance, level: number): PrimaryStat {
  const weights = primaryWeights(hero, level).map((w) => ({ item: w.stat, weight: w.weight }));
  return pickWeighted(state.rng, weights);
}

/* ── Tirage des deux propositions de compétence ─────────────────────────── */

interface SkillCandidate {
  offer: SkillOffer;
  weight: number;
  upgrade: boolean;
}

/**
 * Candidats à la proposition de niveau, avec leurs poids.
 * Une compétence de poids nul dans `HeroDef.skillWeights` n'est jamais
 * proposée : c'est le levier par lequel le contenu dessine l'identité d'un
 * héros (une Prieure n'apprendra pas la Balistique).
 */
export function skillCandidates(hero: HeroInstance): SkillCandidate[] {
  const def = content().HEROES[hero.def];
  const table = content().SKILLS;
  const crowded = hero.skills.length >= LEVELING_TUNING.skillCrowdedFrom;
  const full = hero.skills.length >= LEVELING_TUNING.maxSkills;
  const out: SkillCandidate[] = [];

  for (const id of sortedKeys(table)) {
    const rank = skillRank(hero, id);
    if (rank >= 3) continue;
    const upgrade = rank > 0;
    if (!upgrade && full) continue;

    const base = def?.skillWeights[id] ?? LEVELING_TUNING.skillDefaultWeight;
    if (base <= 0) continue;

    let bp: number = upgrade ? LEVELING_TUNING.skillUpgradeBp : LEVELING_TUNING.skillFreshBp;
    if (!upgrade && crowded) bp = LEVELING_TUNING.skillCrowdedBp;

    const weight = Math.max(1, applyBp(base, bp));
    out.push({ offer: { skill: id, rank: (rank + 1) as SkillRank }, weight, upgrade });
  }
  return out;
}

/**
 * Tire les deux propositions de compétence. Consomme le PRNG de l'état.
 *
 * Garanties : compétences distinctes ; au moins une montée de rang si une
 * montée est possible ; jamais de compétence exclue par le contenu.
 */
export function rollSkillOffers(state: GameState, hero: HeroInstance): [SkillOffer, SkillOffer] {
  const candidates = skillCandidates(hero);

  if (candidates.length === 0) {
    // Héros complet : les deux propositions retombent sur ce qu'il sait déjà.
    const known = hero.skills.slice().sort((a, b) => (a.skill < b.skill ? -1 : 1))[0];
    const fallback: SkillOffer = { skill: known?.skill ?? 'logistique', rank: known?.rank ?? 1 };
    return [{ ...fallback }, { ...fallback }];
  }
  if (candidates.length === 1) {
    const only = candidates[0].offer;
    return [{ ...only }, { ...only }];
  }

  const first = pickWeighted(
    state.rng,
    candidates.map((c) => ({ item: c, weight: c.weight })),
  );
  let rest = candidates.filter((c) => c.offer.skill !== first.offer.skill);

  // Garantie 2 : au moins une montée de rang si le héros peut en obtenir une.
  const upgradesExist = candidates.some((c) => c.upgrade);
  if (upgradesExist && !first.upgrade) {
    const upgrades = rest.filter((c) => c.upgrade);
    if (upgrades.length > 0) rest = upgrades;
  }

  const second = pickWeighted(
    state.rng,
    rest.map((c) => ({ item: c, weight: c.weight })),
  );
  return [{ ...first.offer }, { ...second.offer }];
}

/* ── Attribution de l'expérience ────────────────────────────────────────── */

/** Expérience réellement créditée après application des ratios `xp_bp`. */
export function effectiveXp(state: GameState, hero: HeroInstance, xp: number): number {
  if (xp <= 0) return 0;
  const bp = combineEffectBp(activeEffects(state, hero), 'xp_bp');
  return Math.max(1, applyBp(Math.trunc(xp), bp));
}

/**
 * Crédite de l'expérience et enchaîne les montées de niveau.
 * Signature imposée par `docs/02-API.md`.
 *
 * Si plusieurs niveaux tombent d'un coup (fin de siège, quête majeure), la
 * proposition en attente est résolue automatiquement sur son premier choix
 * avant d'en tirer une nouvelle : aucun niveau n'est perdu et l'état reste
 * conforme au type verrouillé, qui ne prévoit qu'une proposition à la fois.
 */
export function grantXp(state: GameState, hero: HeroInstance, xp: number): GameEvent[] {
  const events: GameEvent[] = [];
  const gain = effectiveXp(state, hero, xp);
  if (gain <= 0) return events;

  hero.xp += gain;

  while (
    hero.level < LEVELING_TUNING.maxLevel &&
    hero.xp >= xpForLevel(hero.level + 1)
  ) {
    if (hero.pendingLevelUp) {
      // Un choix dormait encore : on l'honore avant d'en offrir un nouveau.
      events.push(...applyLevelChoice(state, hero, hero.pendingLevelUp.choices[0].skill, true));
    }
    hero.level += 1;
    const primary = rollPrimary(state, hero, hero.level);
    hero[primary] += 1;
    hero.pendingLevelUp = { choices: rollSkillOffers(state, hero), primary };
    refreshDerived(state, hero);

    events.push({ type: 'HeroLeveled', hero: hero.uid, level: hero.level, primary });
    events.push(
      notice(
        hero.owner,
        `${heroName(hero)} atteint le niveau ${hero.level} : ${PRIMARY_LABELS[primary]} +1. ` +
          `Deux voies s’ouvrent — ${describeOffer(hero.pendingLevelUp.choices[0])} ou ${describeOffer(
            hero.pendingLevelUp.choices[1],
          )}.`,
        'info',
      ),
    );
  }

  if (hero.level >= LEVELING_TUNING.maxLevel && hero.xp > xpForLevel(LEVELING_TUNING.maxLevel)) {
    hero.xp = xpForLevel(LEVELING_TUNING.maxLevel);
  }
  return events;
}

/** « Logistique (Expert) » — libellé d'une proposition. */
export function describeOffer(offer: SkillOffer): string {
  const def = content().SKILLS[offer.skill];
  const rank = def ? def.ranks[offer.rank - 1] : SKILL_RANK_LABELS[offer.rank - 1];
  return `${def ? def.name : offer.skill} (${rank})`;
}

/**
 * Applique le choix de niveau.
 * Signature imposée par `docs/02-API.md`. Un choix hors des deux propositions
 * est refusé en amont par `core/applyCommand` ; par sûreté, on retombe ici sur
 * la première proposition plutôt que d'abandonner le niveau.
 */
export function applyLevelChoice(
  state: GameState,
  hero: HeroInstance,
  skill: SkillId,
  automatic = false,
): GameEvent[] {
  const pending = hero.pendingLevelUp;
  if (!pending) {
    return [notice(hero.owner, `${heroName(hero)} n’a aucun choix de niveau en attente.`, 'warn')];
  }
  const offer = pending.choices.find((c) => c.skill === skill) ?? pending.choices[0];
  const existing = hero.skills.find((s) => s.skill === offer.skill);
  if (existing) {
    if (offer.rank > existing.rank) existing.rank = offer.rank;
  } else if (hero.skills.length < LEVELING_TUNING.maxSkills) {
    hero.skills.push({ skill: offer.skill, rank: offer.rank });
  } else {
    // Plafond atteint depuis le tirage : on transforme le choix en montée.
    const upgradable = hero.skills
      .filter((s) => s.rank < 3)
      .sort((a, b) => (a.skill < b.skill ? -1 : 1))[0];
    if (upgradable) upgradable.rank = (upgradable.rank + 1) as SkillRank;
  }
  hero.skills.sort((a, b) => (a.skill < b.skill ? -1 : a.skill > b.skill ? 1 : 0));
  hero.pendingLevelUp = null;
  refreshDerived(state, hero);

  return [
    notice(
      hero.owner,
      automatic
        ? `Faute de réponse, ${heroName(hero)} suit la voie la plus évidente : ${describeOffer(offer)}.`
        : `${heroName(hero)} apprend ${describeOffer(offer)}.`,
      'info',
    ),
  ];
}

/* ── Lecture ────────────────────────────────────────────────────────────── */

export interface HeroProgress {
  level: number;
  xp: number;
  xpForLevel: number;
  xpForNext: number;
  toNext: number;
  progressBp: number;
  skills: { skill: SkillId; rank: SkillRank; name: string; rankName: string }[];
  pending: [SkillOffer, SkillOffer] | null;
  pendingPrimary: PrimaryStat | null;
}

/** Vue complète de la progression, prête pour la fiche de héros. */
export function heroProgress(hero: HeroInstance): HeroProgress {
  const table = content().SKILLS;
  return {
    level: hero.level,
    xp: hero.xp,
    xpForLevel: xpForLevel(hero.level),
    xpForNext: hero.level >= LEVELING_TUNING.maxLevel ? hero.xp : xpForLevel(hero.level + 1),
    toNext: xpToNextLevel(hero),
    progressBp: levelProgressBp(hero),
    skills: hero.skills
      .slice()
      .sort((a, b) => (a.skill < b.skill ? -1 : 1))
      .map((s) => {
        const def = table[s.skill];
        return {
          skill: s.skill,
          rank: s.rank,
          name: def ? def.name : s.skill,
          rankName: def ? def.ranks[s.rank - 1] : SKILL_RANK_LABELS[s.rank - 1],
        };
      }),
    pending: hero.pendingLevelUp ? hero.pendingLevelUp.choices : null,
    pendingPrimary: hero.pendingLevelUp ? hero.pendingLevelUp.primary : null,
  };
}

/** Phrase de bilan, pour le journal et l'écran de fin de partie. */
export function progressSentence(hero: HeroInstance): string {
  const known = hero.skills.length;
  return (
    `${heroName(hero)} — niveau ${hero.level}, ${hero.xp} points d’expérience, ` +
    `${numberWord(known, true)} compétence${known > 1 ? 's' : ''} au registre.`
  );
}
