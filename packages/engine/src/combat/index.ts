/**
 * `@auvergne/engine` — combat tactique hexagonal.
 *
 * Baril conforme à `docs/02-API.md`. Les neuf signatures imposées sont
 * exportées telles quelles ; le reste est de l'outillage pour l'interface
 * (géométrie, descriptions, réglages) et pour l'intégration du contenu.
 */

/* ─────────────────────── Contrat imposé (docs/02-API.md) ────────────────── */

export { startCombat } from './start.js';
export { applyCombatAction } from './actions.js';
export { autoResolve } from './auto.js';
export { chooseCombatAction } from './ai.js';
export { resolveCombatOutcome } from './outcome.js';
export { damageRange } from './damage.js';
export { reachableHexes, hexPath } from './move.js';
export { stackPower } from './units.js';

/* ───────────────────────── Branchement du contenu ───────────────────────── */

export {
  setCombatContent,
  hasCombatContent,
  creatureDef,
  tryCreatureDef,
  spellDef,
  artifactDef,
  skillEffects,
  type CombatContentProvider,
} from './content.js';
export { FALLBACK_CREATURES, FALLBACK_CREATURE_IDS } from './creatures.js';

/* ──────────────────────────── Géométrie hexagonale ──────────────────────── */

export {
  HEX_DIRECTION_NAMES,
  HEX_DIRECTION_COUNT,
  allHexes,
  allNeighbors,
  areAdjacent,
  attackAngle,
  clampHex,
  directionDelta,
  directionTo,
  fromAxial,
  fromCube,
  hex,
  hexCorners,
  hexDistance,
  hexEquals,
  hexKey,
  hexLine,
  hexMetrics,
  hexRay,
  hexRing,
  hexToPixel,
  hexesInRange,
  inBounds,
  keyToHex,
  neighbor,
  neighbors,
  pixelToHex,
  toAxial,
  toCube,
  type AttackAngle,
  type CubeCoord,
  type HexDirection,
} from './hex.js';

/* ────────────────────────────── Déplacement ─────────────────────────────── */

export {
  advanceAlong,
  controlledHexes,
  fullPath,
  reachMap,
  reachableAttackHexes,
  type ReachNode,
} from './move.js';

/* ──────────────────────────── Piles et statistiques ─────────────────────── */

export {
  COMBAT_TUNING,
  FX,
  abilityOf,
  alliesOf,
  attackPositions,
  baseDefense,
  baseRetaliations,
  canStand,
  cleanseUnit,
  effectiveAttack,
  effectiveDefense,
  effectiveInitiative,
  effectiveSpeed,
  enemiesOf,
  findUnit,
  hasAbility,
  healStack,
  heroOfSide,
  hexBlocked,
  hexBlocksSight,
  isEngaged,
  livingUnits,
  movementPoints,
  obstacleAt,
  playerOfSide,
  sideHp,
  sidePower,
  unitAt,
  unitDef,
  unitDistance,
  unitHexes,
  unitLabel,
  unitMaxHp,
  unitTotalHp,
  unitValue,
  unitsAdjacent,
  type HealResult,
} from './units.js';

/* ────────────────────────────── Dégâts ──────────────────────────────────── */

export {
  applyDamage,
  applyFormula,
  attackDefenseMult,
  canRetaliate,
  clampInt,
  damageForRoll,
  killsFor,
  planDamage,
  rollDamageDie,
  rollFortune,
  rollMorale,
  sightObstacles,
  type DamageModifier,
  type DamageOptions,
  type DamagePlan,
  type DamageRangeResult,
  type KillResult,
  type MoraleOutcome,
} from './damage.js';

export { resolveAttack, targetsFor, type CombatActionResult } from './actions.js';

/* ──────────────────────────── File d'initiative ─────────────────────────── */

export {
  activeUnit,
  beginRound,
  buildInitiativeOrder,
  checkCombatEnd,
  endActivation,
  finishByAttrition,
  finishCombat,
  recomputeMoraleAndFortune,
  survivorsOf,
  unitWaits,
} from './order.js';

/* ────────────────────────────── Capacités ───────────────────────────────── */

export {
  abilityCounter,
  abilityTargets,
  activeAbilityOf,
  applyBreath,
  applyOnHitEffects,
  boulderUses,
  breathTargets,
  canBeShotAt,
  canUseAbility,
  describeAbility,
  knockback,
  previewFortune,
  useAbility,
  type AbilityCheck,
  type ActiveAbility,
} from './abilities.js';

/* ──────────────────────────────── Sorts ─────────────────────────────────── */

export {
  canCastSpell,
  castCombatSpell,
  raiseMagicWall,
  spellPowerOf,
  spellTargets,
  suggestSpell,
  summonStack,
  tickMagicWalls,
  type CastCheck,
  type CastResult,
  type SpellSuggestion,
  type SpellTarget,
} from './spells.js';

/* ──────────────────────────────── Sièges ────────────────────────────────── */

export {
  SIEGE_GATE_ROW,
  SIEGE_MOAT_COL,
  SIEGE_SEGMENT_NAMES,
  SIEGE_SEGMENT_ROWS,
  SIEGE_TOWERS,
  SIEGE_WALL_COL,
  buildSiegeField,
  damageFortification,
  fortificationAt,
  fortificationUid,
  hazardAt,
  hazardDamage,
  isFortification,
  isGateOpen,
  parseFortificationUid,
  segmentHexes,
  segmentOf,
  siegeTowerVolley,
  type FortificationHit,
} from './siege.js';

/* ────────────────────────────── Déploiement ─────────────────────────────── */

export {
  deployColumn,
  deploymentZone,
  scatterObstacles,
  terrainLabel,
  weatherLabel,
  type CombatDefenderSetup,
  type CombatSideSetup,
  type StartCombatParams,
} from './start.js';

export { deploymentRows, emptyHeroBonuses, heroCombatBonuses, type HeroCombatBonuses } from './hero.js';

/* ──────────────────────────────── IA ────────────────────────────────────── */

export { hasUsefulAction, sideThreat, suggestAbility, threatOf, unitPriority } from './ai.js';
export { previewAutoResolve } from './auto.js';

/* ──────────────────────────────── Issue ─────────────────────────────────── */

export {
  HERO_DOWN_DAYS,
  casualtiesOf,
  standingStacks,
  survivingArmy,
} from './outcome.js';

/* ──────────────────────────────── Journal ───────────────────────────────── */

export { plural, pushLog } from './log.js';
