/**
 * Noyau déterministe — baril public.
 *
 * Contrat imposé par `docs/02-API.md` :
 *
 * ```ts
 * createGame(setup, world): GameState
 * applyCommand(state, cmd, world): CommandResult
 * computePath(world, state, hero, to): { path, costs } | null
 * pathDays(costs, movementNow, movementMax): number[]
 * revealFog(state, world, player, at, radius): number[]
 * townIncome(state, town): Partial<Resources>
 * playerIncome(state): Partial<Resources>
 * canBuild(state, town, building): { ok, reason? }
 * terrainCost(world, from, to, mods): number
 * ENGINE_VERSION: string
 * ```
 *
 * Les autres exports sont des compléments utiles au reste du moteur, aux bots
 * et à l'interface ; ils n'altèrent aucun contrat existant.
 */

/* ── Contrat imposé ─────────────────────────────────────────────────────── */

export { ENGINE_VERSION } from './constants.js';
export { createGame, validateSetup } from './create-game.js';
export { applyCommand } from './apply.js';
export { computePath, pathDays } from './pathfinding.js';
export { revealFog } from './fog.js';
export { townIncome, playerIncome, canBuild } from './economy.js';
export { terrainCost } from './movement.js';

/* ── Composition (branchement des paquets réels) ────────────────────────── */

export {
  linkEngineModules,
  registerContent,
  registerMapPack,
  registerWorldModule,
  registerCombatModule,
  resetEngineModules,
  hasLinkedContent,
  content,
  mapPack,
  worldModule,
  combatModule,
} from './registry.js';
export type {
  ContentPack,
  MapPack,
  WorldModulePack,
  CombatModulePack,
  EngineModules,
  FactionDef,
  WeekEventDef,
  GuardTemplate,
  StartKey,
  StartPosition,
} from './registry.js';

/* ── Compléments ────────────────────────────────────────────────────────── */

export * from './constants.js';
export {
  cloneState,
  cloneDeep,
  cloneFog,
  cloneHero,
  cloneTown,
  clonePlayer,
  cloneObject,
  cloneCombat,
  cloneArmy,
  cloneStacks,
  cloneCoord,
  cloneCoords,
} from './clone.js';
export { gameConfig, encodeGameId } from './config.js';
export {
  dimVisible,
  recomputeVisibility,
  reliefVisionBonus,
  hasLineOfSight,
  fogAt,
  isExplored,
} from './fog.js';
export {
  stepCost,
  weatherMods,
  objectAtCell,
  objectIndexAt,
  townAtCell,
  heroAtCell,
  isFootprintBlocked,
  executeMove,
  captureTown,
  terrainUnder,
  baseTerrainCost,
} from './movement.js';
export type { MoveOutcome } from './movement.js';
export {
  pathDayCount,
  invalidateWorldCache,
  invalidatePathCache,
  bumpPathRevision,
} from './pathfinding.js';
export {
  playerIncomeOf,
  upkeepOf,
  buildCost,
  canRecruit,
  canUpgrade,
  recruitCost,
  upgradeUnitCost,
  upgradesOf,
  applyUpgrade,
  applyBuildingGrants,
  addToArmy,
  armyPower,
  armySlotsFree,
  countInTown,
  marketBp,
  tradeOutcome,
  weeklyGrowth,
  townGrowthBp,
  townFortification,
  townHasGrant,
  mageGuildLevel,
  stablesBonus,
} from './economy.js';
export {
  startTurn,
  endTurn,
  advanceDay,
  applyIncome,
  applyWeeklyGrowth,
  processBuildQueues,
  initialReveal,
  dailyMovement,
  visionOf,
  journal,
  journalFromEvents,
} from './turn.js';
export * from './util.js';

/* ── Implémentations de repli (utiles aux tests et au mode autonome) ────── */

export { fallbackContent, FALLBACK_CONTENT_VERSION } from './fallback-content.js';
export {
  fallbackMapPack,
  buildFallbackWorld,
  FALLBACK_MAP_VERSION,
  FALLBACK_START_POSITIONS,
  FALLBACK_START_SETS,
} from './fallback-map.js';
export { fallbackWorldModule } from './fallback-world.js';
export { fallbackCombatModule } from './fallback-combat.js';
