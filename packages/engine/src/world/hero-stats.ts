/**
 * Fiche de héros : caractéristiques dérivées et effets actifs.
 *
 * `heroStats` est la source unique de vérité pour les valeurs affichées et
 * pour celles que le noyau recopie dans l'instance (`movementMax`, `manaMax`).
 * Elle agrège, dans cet ordre strict et déterministe :
 *
 *   1. les caractéristiques primaires de l'instance (base + montées de niveau) ;
 *   2. les compétences secondaires, au rang atteint ;
 *   3. les artefacts portés, primes d'ensemble comprises ;
 *   4. la spécialité du héros ;
 *   5. les bâtiments de la cité où il se tient, s'il y séjourne ;
 *   6. la météo du jour ;
 *   7. l'agitation locale et la réputation de la bannière.
 *
 * **Aucun double comptage.** Le noyau applique déjà, de son côté :
 *   - `weatherModifiers().moveBp` sur le coût de chaque pas
 *     (`core/movement.stepCost`) ;
 *   - `weatherModifiers().visionBp` sur la portée de vue (`core/turn.visionOf`) ;
 *   - le bonus d'écuries de la cité (`core/turn.dailyMovement`).
 * Ces trois canaux sont donc volontairement absents d'ici. La météo n'agit
 * dans cette fiche que sur le moral affiché et sur la réserve de mana, deux
 * grandeurs que le noyau ne touche pas.
 */
import {
  type BuildingGrant,
  type GameState,
  type HeroInstance,
  type PrimaryStat,
  type SkillEffect,
  type SkillId,
  type SkillRank,
  type TownState,
} from '../types.js';
import {
  BASE_MOVEMENT,
  BASE_VISION,
  MAX_MOVEMENT,
  MAX_UNREST,
  applyBp,
  clampInt,
  content,
} from '../core/index.js';
import { artifactEffects, artifactPrimary } from './artifacts.js';
import { combineEffectBp, sumEffect } from './common.js';
import { weatherHeroModifiers } from './weather.js';

/* ── Réglages ───────────────────────────────────────────────────────────── */

/**
 * Réglages de la fiche de héros. Aucune constante nue ailleurs dans ce fichier.
 * Les bornes existent pour que l'interface n'ait jamais à afficher une valeur
 * absurde, même avec un contenu déséquilibré.
 */
export const HERO_STATS_TUNING = {
  /** Points de mana par point de Savoir. */
  manaPerSavoir: 10,
  /** Réserve de mana minimale, même à Savoir nul. */
  manaFloor: 10,
  /** Réserve de mana maximale. */
  manaCeiling: 600,
  /** Points de marche minimaux d'un héros, quels que soient ses malus. */
  movementFloor: 600,
  /** Portée de vue minimale et maximale, en cases. */
  visionFloor: 2,
  visionCeiling: 26,
  /** Moral et Fortune sont bornés à ±3 (document maître §12.4 et §12.5). */
  moraleBound: 3,
  fortuneBound: 3,
  /** Mana par niveau de Guilde des Arts de la cité où séjourne le héros. */
  manaPerGuildLevel: 4,
  /** Agitation à partir de laquelle la troupe gronde : −1 de moral. */
  unrestMoraleStep1: 45,
  /** Agitation à partir de laquelle elle gronde fort : −2 de moral. */
  unrestMoraleStep2: 80,
  /** Réputation au-delà de laquelle la bannière est aimée : +1 de moral. */
  reputationLoved: 12,
  /** Réputation en deçà de laquelle elle est crainte : −1 de moral. */
  reputationFeared: -12,
  /** Bonus d'expérience accordé par la spécialité « compétence », en BP. */
  specialtySkillFallbackBp: 11000,
} as const;

/** Les quatre caractéristiques primaires, dans l'ordre canonique. */
export const PRIMARY_ORDER: readonly PrimaryStat[] = ['vaillance', 'garde', 'mystique', 'savoir'];

/** Libellés français des caractéristiques primaires. */
export const PRIMARY_LABELS: Record<PrimaryStat, string> = {
  vaillance: 'Vaillance',
  garde: 'Garde',
  mystique: 'Mystique',
  savoir: 'Savoir',
};

/** Libellés français des trois rangs de compétence. */
export const SKILL_RANK_LABELS: readonly [string, string, string] = ['Novice', 'Expert', 'Maître'];

/* ── Compétences ────────────────────────────────────────────────────────── */

/**
 * Rang d'une compétence pour ce héros : 0 s'il ne la possède pas.
 * Signature imposée par `docs/02-API.md`.
 */
export function skillRank(hero: HeroInstance, skill: SkillId): 0 | 1 | 2 | 3 {
  for (const s of hero.skills) {
    if (s.skill === skill) return s.rank;
  }
  return 0;
}

/** Libellé du rang atteint : « Expert », ou `null` si la compétence manque. */
export function skillRankLabel(hero: HeroInstance, skill: SkillId): string | null {
  const rank = skillRank(hero, skill);
  if (rank === 0) return null;
  const def = content().SKILLS[skill];
  return def ? def.ranks[rank - 1] : SKILL_RANK_LABELS[rank - 1];
}

/** Effets d'une compétence à un rang donné. */
export function skillEffectsAt(skill: SkillId, rank: SkillRank): SkillEffect[] {
  const def = content().SKILLS[skill];
  if (!def) return [];
  const list = def.effects[rank - 1];
  return list ? list.map((e) => ({ ...e })) : [];
}

/** Effets apportés par toutes les compétences du héros, ordre stable. */
export function skillEffectsOf(hero: HeroInstance): SkillEffect[] {
  const out: SkillEffect[] = [];
  const ordered = hero.skills.slice().sort((a, b) => (a.skill < b.skill ? -1 : a.skill > b.skill ? 1 : 0));
  for (const s of ordered) out.push(...skillEffectsAt(s.skill, s.rank));
  return out;
}

/* ── Spécialité ─────────────────────────────────────────────────────────── */

/**
 * Effets de la spécialité du héros exprimables en `SkillEffect`.
 *
 * Les spécialités qui ne s'expriment pas ainsi (créature favorite, école de
 * magie, siège, diplomatie, ristourne de construction, ressource quotidienne,
 * lecture du ciel) sont consommées ailleurs : combat, économie, diplomatie,
 * météo. Elles ne sont pas oubliées, simplement traitées à leur place.
 */
export function specialtyEffects(hero: HeroInstance): SkillEffect[] {
  const def = content().HEROES[hero.def];
  if (!def) return [];
  const spec = def.specialty;
  switch (spec.kind) {
    case 'movement':
      return [{ kind: 'movement', value: spec.bonus }];
    case 'vision':
      return [{ kind: 'vision', value: spec.bonus }];
    case 'skill': {
      // Le héros progresse plus vite dans la voie qu'il incarne.
      if (skillRank(hero, spec.skill) === 0) return [];
      const bp = spec.bonusBp > 0 ? spec.bonusBp : HERO_STATS_TUNING.specialtySkillFallbackBp;
      return [{ kind: 'xp_bp', bp }];
    }
    default:
      return [];
  }
}

/* ── Bâtiments ──────────────────────────────────────────────────────────── */

/** Cité où séjourne le héros, si elle porte bien sa bannière. */
export function hostTown(state: GameState, hero: HeroInstance): TownState | null {
  if (!hero.inTown) return null;
  const town = state.towns[hero.inTown];
  if (!town || town.owner !== hero.owner) return null;
  return town;
}

/**
 * Effets accordés par les bâtiments de la cité d'accueil.
 *
 * On ne retient que les octrois que le noyau n'applique **pas** déjà aux héros :
 *  - `morale` : aucun autre système ne le lit ;
 *  - `mage_guild` : la guilde gonfle la réserve de mana du héros de passage ;
 *  - `mana` : source consacrée, réserve de mana également.
 * Les écuries (`stables`) sont exclues : `core/turn.dailyMovement` les ajoute
 * déjà aux points de marche du jour.
 */
export function buildingEffects(state: GameState, hero: HeroInstance): SkillEffect[] {
  const town = hostTown(state, hero);
  if (!town) return [];
  const buildings = content().BUILDINGS;
  const out: SkillEffect[] = [];
  let guildLevel = 0;
  for (const id of town.built.slice().sort()) {
    const def = buildings[id];
    if (!def) continue;
    for (const g of def.grants as BuildingGrant[]) {
      if (g.kind === 'morale') out.push({ kind: 'morale', value: g.value });
      else if (g.kind === 'mage_guild' && g.level > guildLevel) guildLevel = g.level;
    }
  }
  if (guildLevel > 0) {
    out.push({
      kind: 'mana_max_bp',
      bp: 10000 + guildLevel * HERO_STATS_TUNING.manaPerGuildLevel * 100,
    });
  }
  return out;
}

/** Mana forfaitaire accordé par les bâtiments (« Source consacrée »). */
export function buildingFlatMana(state: GameState, hero: HeroInstance): number {
  const town = hostTown(state, hero);
  if (!town) return 0;
  const buildings = content().BUILDINGS;
  let total = 0;
  for (const id of town.built.slice().sort()) {
    const def = buildings[id];
    if (!def) continue;
    for (const g of def.grants as BuildingGrant[]) {
      if (g.kind === 'mana') total += g.amount;
    }
  }
  return total;
}

/* ── Effets actifs ──────────────────────────────────────────────────────── */

/**
 * Liste complète et ordonnée des effets actifs d'un héros.
 * Signature imposée par `docs/02-API.md`. Consommée par le noyau
 * (`pathfinding` pour `terrain_cost_bp`, `economy` pour `income_bp`,
 * `build_cost_bp` et `trade_bp`, `turn` pour `mana_regen`) autant que par la
 * fiche ci-dessous.
 */
export function activeEffects(state: GameState, hero: HeroInstance): SkillEffect[] {
  const out: SkillEffect[] = [];
  out.push(...skillEffectsOf(hero));
  out.push(...artifactEffects(hero));
  out.push(...specialtyEffects(hero));
  out.push(...buildingEffects(state, hero));
  /* Les bénédictions de visite — oratoires, fontaines — encore en cours. Les
     expirées sont ignorées ici et balayées au changement de jour : la lecture
     ne mute jamais l'état, c'est la règle de toutes les fiches. */
  if (hero.benedictions) {
    for (const b of hero.benedictions) {
      if (state.turn <= b.jusquau) out.push({ kind: b.kind, value: b.value });
    }
  }
  return out;
}

/* ── Fiche complète ─────────────────────────────────────────────────────── */

export interface HeroStats {
  vaillance: number;
  garde: number;
  mystique: number;
  savoir: number;
  movementMax: number;
  vision: number;
  manaMax: number;
  morale: number;
  fortune: number;
}

/** Caractéristiques primaires, artefacts compris. */
export function primaryStats(hero: HeroInstance): Record<PrimaryStat, number> {
  const artifacts = artifactPrimary(hero);
  return {
    vaillance: Math.max(0, hero.vaillance + artifacts.vaillance),
    garde: Math.max(0, hero.garde + artifacts.garde),
    mystique: Math.max(0, hero.mystique + artifacts.mystique),
    savoir: Math.max(0, hero.savoir + artifacts.savoir),
  };
}

/**
 * Fiche dérivée complète d'un héros.
 * Signature imposée par `docs/02-API.md`.
 */
export function heroStats(state: GameState, hero: HeroInstance): HeroStats {
  const effects = activeEffects(state, hero);
  const primary = primaryStats(hero);
  const weather = weatherHeroModifiers(state.weather.current);

  const movementMax = clampInt(
    applyBp(
      BASE_MOVEMENT + sumEffect(effects, 'movement'),
      combineEffectBp(effects, 'movement_bp'),
    ),
    HERO_STATS_TUNING.movementFloor,
    MAX_MOVEMENT,
  );

  const vision = clampInt(
    BASE_VISION + sumEffect(effects, 'vision'),
    HERO_STATS_TUNING.visionFloor,
    HERO_STATS_TUNING.visionCeiling,
  );

  const manaBase =
    primary.savoir * HERO_STATS_TUNING.manaPerSavoir + buildingFlatMana(state, hero);
  const manaMax = clampInt(
    applyBp(
      applyBp(manaBase, combineEffectBp(effects, 'mana_max_bp')),
      weather.manaBp,
    ),
    HERO_STATS_TUNING.manaFloor,
    HERO_STATS_TUNING.manaCeiling,
  );

  const morale = clampInt(
    sumEffect(effects, 'morale') + weather.moraleDelta + climateOfBanner(state, hero),
    -HERO_STATS_TUNING.moraleBound,
    HERO_STATS_TUNING.moraleBound,
  );

  const fortune = clampInt(
    sumEffect(effects, 'fortune'),
    -HERO_STATS_TUNING.fortuneBound,
    HERO_STATS_TUNING.fortuneBound,
  );

  return {
    vaillance: primary.vaillance,
    garde: primary.garde,
    mystique: primary.mystique,
    savoir: primary.savoir,
    movementMax,
    vision,
    manaMax,
    morale,
    fortune,
  };
}

/**
 * Humeur du pays autour du héros : agitation de la cité d'accueil et
 * réputation de la bannière. C'est le versant « politique » du moral.
 */
export function climateOfBanner(state: GameState, hero: HeroInstance): number {
  let delta = 0;
  const town = hostTown(state, hero);
  if (town) {
    const unrest = clampInt(town.unrest, 0, MAX_UNREST);
    if (unrest >= HERO_STATS_TUNING.unrestMoraleStep2) delta -= 2;
    else if (unrest >= HERO_STATS_TUNING.unrestMoraleStep1) delta -= 1;
  }
  const p = state.players[hero.owner];
  if (p) {
    if (p.reputation >= HERO_STATS_TUNING.reputationLoved) delta += 1;
    else if (p.reputation <= HERO_STATS_TUNING.reputationFeared) delta -= 1;
  }
  return delta;
}

/**
 * Recopie dans l'instance les valeurs dérivées que le noyau y attend
 * (`movementMax`, `manaMax`), en bornant les réserves courantes.
 * Utilisé après tout changement d'équipement ou de compétence.
 */
export function refreshDerived(state: GameState, hero: HeroInstance): HeroStats {
  const stats = heroStats(state, hero);
  hero.movementMax = stats.movementMax;
  hero.manaMax = stats.manaMax;
  if (hero.movement > stats.movementMax) hero.movement = stats.movementMax;
  if (hero.mana > stats.manaMax) hero.mana = stats.manaMax;
  return stats;
}

/* ── Aides de lecture ───────────────────────────────────────────────────── */

/** Total en points de base d'un ratio donné, pour l'interface et les bots. */
export function effectBp(
  state: GameState,
  hero: HeroInstance,
  kind: Extract<SkillEffect, { bp: number }>['kind'],
): number {
  return combineEffectBp(activeEffects(state, hero), kind);
}

/** Total additif d'un effet donné, pour l'interface et les bots. */
export function effectValue(
  state: GameState,
  hero: HeroInstance,
  kind: Extract<SkillEffect, { value: number }>['kind'],
): number {
  return sumEffect(activeEffects(state, hero), kind);
}

/** Puissance magique effective, en points : Mystique et ratios d'occultisme. */
export function spellPower(state: GameState, hero: HeroInstance): number {
  const stats = heroStats(state, hero);
  return Math.max(0, applyBp(stats.mystique, effectBp(state, hero, 'spell_power_bp')));
}
