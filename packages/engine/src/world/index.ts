/**
 * `@auvergne/engine` — progression des héros et systèmes de monde.
 *
 * Ce baril satisfait **exactement** l'interface `WorldModulePack` déclarée dans
 * `packages/engine/src/core/registry.ts` et la section
 * `packages/engine/src/world/index.ts` de `docs/02-API.md` :
 *
 * ```ts
 * heroStats(state, hero)            skillRank(hero, skill)
 * activeEffects(state, hero)        grantXp(state, hero, xp)
 * applyLevelChoice(state, hero, s)  xpForLevel(level)
 * visitObject(state, world, h, obj) castAdventureSpell(state, world, h, s, t?)
 * advanceWeather(state)             weatherModifiers(w)
 * gabelleIncome(state)              checkVictory(state)
 * weeklyEvent(state)
 * ```
 *
 * Le module importe librement `../core/index.js` : le noyau, lui, ne l'importe
 * jamais statiquement — il passe par le registre — donc aucun cycle n'est
 * possible.
 *
 * Branchement, depuis `packages/game/src/index.ts` :
 *
 * ```ts
 * import { worldModulePack, linkEngineModules } from '@auvergne/engine';
 * linkEngineModules({ world: worldModulePack() });
 * ```
 *
 * Le reste des exports est de l'outillage pour l'interface, les bots et les
 * tests : aperçus, libellés français, tables de réglage. Aucun n'altère un
 * contrat existant, et aucun ne porte un nom déjà exporté par `core/` ou
 * `combat/`, afin que le baril racine du moteur reste sans ambiguïté.
 */

import type { WorldModulePack } from '../core/index.js';

import { activeEffects, heroStats, skillRank } from './hero-stats.js';
import { applyLevelChoice, grantXp, xpForLevel } from './leveling.js';
import { drawTavernOffers, visitObject } from './objects.js';
import { castAdventureSpell } from './spells-adventure.js';
import { advanceWeather, weatherModifiers } from './weather.js';
import { gabelleIncome } from './gabelle.js';
import { checkVictory } from './victory.js';
import { weeklyEvent } from './week-events.js';

/* ── Contrat imposé (docs/02-API.md) ────────────────────────────────────── */

export { heroStats, skillRank, activeEffects } from './hero-stats.js';
export { grantXp, applyLevelChoice, xpForLevel } from './leveling.js';
export { visitObject } from './objects.js';
export { castAdventureSpell } from './spells-adventure.js';
export { advanceWeather, weatherModifiers } from './weather.js';
export { gabelleIncome } from './gabelle.js';
export { checkVictory } from './victory.js';
export { weeklyEvent } from './week-events.js';

/**
 * Le module monde, prêt à être injecté dans le registre du noyau.
 * L'objet est reconstruit à chaque appel : il ne retient aucun état.
 */
export function worldModulePack(): WorldModulePack {
  return {
    heroStats,
    skillRank,
    activeEffects,
    grantXp,
    applyLevelChoice,
    xpForLevel,
    visitObject,
    castAdventureSpell,
    advanceWeather,
    weatherModifiers,
    gabelleIncome,
    checkVictory,
    weeklyEvent,
    drawTavernOffers,
  };
}

/* ── Outillage partagé ──────────────────────────────────────────────────── */

export {
  COMMON_TUNING,
  LEDGER_UID,
  alivePlayers,
  allObjects,
  canPay,
  consumeDailyUsage,
  consumeWeeklyUsage,
  combineEffectBp,
  dailyUsesLeft,
  dataBag,
  dataInt,
  dataString,
  describeDelta,
  giveResources,
  hasVisited,
  heroFullName,
  heroName,
  heroesOf,
  joinFr,
  ledger,
  ledgerInt,
  ledgerString,
  markVisited,
  notice,
  numberWord,
  objectName,
  objectsOfKind,
  playerName,
  pluralize,
  resourceLabel,
  resourceWords,
  setLedgerInt,
  setLedgerString,
  sumEffect,
  treasuryHolder,
  treasuryObject,
  visited,
  weeklyUsageAvailable,
  weeklyUsesLeft,
} from './common.js';

/* ── Fiche de héros ─────────────────────────────────────────────────────── */

export {
  HERO_STATS_TUNING,
  PRIMARY_LABELS,
  PRIMARY_ORDER,
  SKILL_RANK_LABELS,
  buildingEffects,
  buildingFlatMana,
  climateOfBanner,
  effectBp,
  effectValue,
  hostTown,
  primaryStats,
  refreshDerived,
  skillEffectsAt,
  skillEffectsOf,
  skillRankLabel,
  specialtyEffects,
  spellPower,
} from './hero-stats.js';
export type { HeroStats } from './hero-stats.js';

/* ── Progression ────────────────────────────────────────────────────────── */

export {
  LEVELING_TUNING,
  XP_TABLE,
  describeOffer,
  effectiveXp,
  heroProgress,
  levelForXp,
  levelProgressBp,
  primaryWeights,
  progressSentence,
  rollPrimary,
  rollSkillOffers,
  skillCandidates,
  xpStep,
  xpToNextLevel,
} from './leveling.js';
export type { HeroProgress } from './leveling.js';

/* ── Artefacts ──────────────────────────────────────────────────────────── */

export {
  ARTIFACT_RARITY_LABELS,
  ARTIFACT_SET_BONUSES,
  ARTIFACT_SLOT_LABELS,
  ARTIFACT_SLOT_ORDER,
  ARTIFACT_TUNING,
  acquireArtifact,
  artifactDefOf,
  artifactEffects,
  artifactPrimary,
  artifactValue,
  canEquip,
  describeArtifact,
  describeEffect,
  describeEffectList,
  equipArtifact,
  freeSlotFor,
  isWorn,
  setProgress,
  slotsFor,
  stripArtifacts,
  unequipArtifact,
  wornArtifacts,
} from './artifacts.js';
export type { EquipVerdict, SetProgress, WornArtifact } from './artifacts.js';

/* ── Lieux de la carte et bornes armoriées ──────────────────────────────── */

export {
  BORNE_TUNING,
  OBJECT_KIND_LABELS,
  OBJECT_TUNING,
  borneKeeperFreeLeft,
  borneNetwork,
  borneSummary,
  borneUsesLeft,
  canUseBorne,
  charterLabel,
  describeObject,
  discoveredBornes,
  drawTavernOffers,
  heroAtEntrance,
  isBorneKeeper,
  neutralHeroUnlocked,
  pendingObjects,
  questSatisfied,
  questSentence,
  questTerms,
  questTermsIfKnown,
  useBorne,
} from './objects.js';
export type { BorneVerdict, QuestKind, QuestTerms } from './objects.js';

/* ── Magie d'aventure ───────────────────────────────────────────────────── */

export {
  ADVENTURE_SPELL_TUNING,
  adventureSpellCost,
  adventureSpellSentence,
  checkAdventureCast,
  checkFord,
  isAdventureSpell,
  listAdventureSpells,
  needsTarget,
  revealRadius,
  spellDefOf,
  teleportRange,
} from './spells-adventure.js';
export type { AdventureCastCheck, FordCheck } from './spells-adventure.js';

/* ── Météo ──────────────────────────────────────────────────────────────── */

export {
  WEATHER_ORDER,
  WEATHER_SYSTEM_TUNING,
  WEATHER_TUNING,
  canDelayFront,
  delayFront,
  drawWeather,
  forecastSentence,
  isAdverse,
  lastWeatherWeek,
  readsTheSky,
  shiftWeatherNow,
  weatherHeroModifiers,
  weatherName,
  weatherSchoolBp,
  weatherStory,
} from './weather.js';
export type { DelayVerdict } from './weather.js';

/* ── Gabelle ────────────────────────────────────────────────────────────── */

export {
  GABELLE_ORDER,
  GABELLE_TUNING,
  averageUnrest,
  dominationIncomeBp,
  dominationOf,
  dominationUnrestBp,
  gabelleLabel,
  gabelleReport,
  gabelleSummary,
  resolveGabelleWeek,
  revoltCount,
  smugglerCount,
} from './gabelle.js';
export type { GabelleReport } from './gabelle.js';

/* ── Victoire ───────────────────────────────────────────────────────────── */

export {
  VICTORY_TUNING,
  breakClaim,
  centersHeld,
  claimRemaining,
  isEliminated,
  masterSince,
  objectiveSentence,
  scoreBreakdown,
  scoreOf,
  standings,
  startClaim,
  victoryProgress,
} from './victory.js';
export type { ScoreBreakdown, VictoryProgress } from './victory.js';

/* ── Événements de semaine ──────────────────────────────────────────────── */

export {
  WEEK_EVENT_TUNING,
  applyWeekEffects,
  currentWeekEvent,
  drawWeekEvent,
  growNeutralGuards,
  weekEventOf,
  weekEventTable,
  weekGrowthBp,
  weekModifierBp,
  weekModifierValue,
  weekSummary,
} from './week-events.js';
export type { WeekSummary } from './week-events.js';

/* ── Diplomatie ─────────────────────────────────────────────────────────── */

export {
  DIPLOMACY_TUNING,
  applyParley,
  attemptParley,
  diplomacySpecialtyBp,
  guardPower,
  joiningStacks,
  parleyChance,
  parleySentence,
  powerRatioBp,
  resolveParley,
  stackNames,
} from './diplomacy.js';
export type { ParleyChance, ParleyKind, ParleyOutcome } from './diplomacy.js';
