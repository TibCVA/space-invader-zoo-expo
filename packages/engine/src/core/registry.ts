/**
 * Pont de composition du moteur.
 *
 * `packages/engine` est une bibliothèque **pure** : elle ne peut pas importer
 * `@auvergne/content` ni `@auvergne/map`, qui dépendent eux-mêmes du moteur
 * (le cycle serait insoluble, et `packages/engine/package.json` ne déclare
 * aucune dépendance). De même, `engine/world` et `engine/combat` importeront
 * les utilitaires de `engine/core` : un import statique en sens inverse
 * créerait un second cycle.
 *
 * Le noyau déclare donc les **contrats** publiés dans `docs/02-API.md` sous
 * forme d'interfaces, et la racine de composition (client, serveur, worker,
 * bots — tous dépendent des trois paquets) les branche en une ligne :
 *
 * ```ts
 * import * as content from '@auvergne/content';
 * import * as map from '@auvergne/map';
 * import * as world from '@auvergne/engine/world/index.js';
 * import * as combat from '@auvergne/engine/combat/index.js';
 * linkEngineModules({ content, map, world, combat });
 * ```
 *
 * Tant que rien n'est branché, le noyau utilise des implémentations de repli
 * (`fallback-*.ts`) : la partie reste jouable, déterministe et testable.
 */
import type {
  ArmyStack,
  ArtifactDef,
  ArtifactId,
  BuildingDef,
  BuildingId,
  CombatAction,
  CombatState,
  CombatUnit,
  CreatureDef,
  CreatureId,
  FactionId,
  GameEvent,
  GameState,
  HeroDef,
  HeroId,
  HeroInstance,
  HeroUid,
  HexCoord,
  MapCoord,
  MapObject,
  PlayerId,
  RegionId,
  Resources,
  SkillDef,
  SkillEffect,
  SkillId,
  SpellDef,
  SpellId,
  Terrain,
  TownUid,
  WeatherKind,
  WorldMap,
} from '../types.js';
import { fallbackContent } from './fallback-content.js';
import { fallbackMapPack } from './fallback-map.js';
import { fallbackWorldModule } from './fallback-world.js';
import { fallbackCombatModule } from './fallback-combat.js';

/* ── Contrats ───────────────────────────────────────────────────────────── */

export interface FactionDef {
  id: FactionId;
  name: string;
  motto: string;
  description: string;
  colors: { primary: string; secondary: string; accent: string; stone: string; light: string };
  capitalName: string;
  mechanic: { name: string; description: string };
  startingResources: Resources;
}

export interface WeekEventDef {
  key: string;
  name: string;
  text: string;
  weight: number;
  effects: SkillEffect[] | { kind: string; [k: string]: unknown }[];
}

export interface GuardTemplate {
  ring: 1 | 2 | 3 | 4;
  tiers: number[];
  powerMin: number;
  powerMax: number;
}

/** Sous-ensemble de `@auvergne/content` réellement consommé par le noyau. */
export interface ContentPack {
  CONTENT_VERSION: string;
  CREATURES: Readonly<Record<CreatureId, CreatureDef>>;
  HEROES: Readonly<Record<HeroId, HeroDef>>;
  SPELLS: Readonly<Record<SpellId, SpellDef>>;
  SKILLS: Readonly<Record<SkillId, SkillDef>>;
  ARTIFACTS: Readonly<Record<ArtifactId, ArtifactDef>>;
  BUILDINGS: Readonly<Record<BuildingId, BuildingDef>>;
  FACTIONS: Readonly<Record<FactionId, FactionDef>>;
  WEEK_EVENTS: readonly WeekEventDef[];
  NEUTRAL_GUARDS: readonly GuardTemplate[];
  creature(id: CreatureId): CreatureDef;
  hero(id: HeroId): HeroDef;
  spell(id: SpellId): SpellDef;
  skill(id: SkillId): SkillDef;
  artifact(id: ArtifactId): ArtifactDef;
  building(id: BuildingId): BuildingDef;
  creaturesOf(faction: FactionId, tier?: number): CreatureDef[];
  buildingsOf(faction: FactionId): BuildingDef[];
}

export type StartKey = 'arconsat' | 'viscomtat' | 'cervieres' | 'noiretable' | 'renaudie';

export interface StartPosition {
  key: StartKey;
  label: string;
  at: MapCoord;
  townUid: TownUid;
  region: RegionId;
}

/** Sous-ensemble de `@auvergne/map` réellement consommé par le noyau. */
export interface MapPack {
  MAP_VERSION: string;
  START_POSITIONS: Readonly<Record<StartKey, StartPosition>>;
  START_SETS: Readonly<Record<2 | 3 | 4 | 5, StartKey[][]>>;
  buildWorld?(seed: number): WorldMap;
}

/** Contrat de `packages/engine/src/world/index.ts` (docs/02-API.md). */
export interface WorldModulePack {
  heroStats(
    state: GameState,
    hero: HeroInstance,
  ): {
    vaillance: number;
    garde: number;
    mystique: number;
    savoir: number;
    movementMax: number;
    vision: number;
    manaMax: number;
    morale: number;
    fortune: number;
  };
  skillRank(hero: HeroInstance, skill: SkillId): 0 | 1 | 2 | 3;
  activeEffects(state: GameState, hero: HeroInstance): SkillEffect[];
  grantXp(state: GameState, hero: HeroInstance, xp: number): GameEvent[];
  applyLevelChoice(state: GameState, hero: HeroInstance, skill: SkillId): GameEvent[];
  xpForLevel(level: number): number;
  visitObject(
    state: GameState,
    world: WorldMap,
    hero: HeroInstance,
    obj: MapObject,
  ): GameEvent[];
  castAdventureSpell(
    state: GameState,
    world: WorldMap,
    hero: HeroInstance,
    spell: SpellId,
    target?: MapCoord,
  ): GameEvent[];
  advanceWeather(state: GameState): GameEvent[];
  weatherModifiers(w: WeatherKind): {
    moveBp: number;
    visionBp: number;
    rangedBp: number;
    flyBp: number;
    flankBp: number;
  };
  gabelleIncome(state: GameState): { ecus: number; sel: number; unrest: number };
  checkVictory(state: GameState): GameEvent[];
  weeklyEvent(state: GameState): GameEvent[];
}

/** Contrat de `packages/engine/src/combat/index.ts` (docs/02-API.md). */
export interface CombatModulePack {
  startCombat(
    state: GameState,
    params: {
      attacker: { player: PlayerId; hero: HeroUid | null; army: (ArmyStack | null)[] };
      defender: {
        player: PlayerId | null;
        hero: HeroUid | null;
        town: TownUid | null;
        army: (ArmyStack | null)[];
        /** Tours de la place forte qui tirent au siège ; absent : le défaut. */
        towers?: number;
      };
      terrain: Terrain;
      region: RegionId;
      siege: boolean;
    },
  ): CombatState;
  applyCombatAction(
    state: GameState,
    action: CombatAction,
  ): { events: GameEvent[]; ok: boolean; error?: string };
  autoResolve(state: GameState): GameEvent[];
  chooseCombatAction(state: GameState, combat: CombatState): CombatAction;
  resolveCombatOutcome(state: GameState): GameEvent[];
  /**
   * `fromHex` et `chargeHexes` ne sont pas décoratifs : sans eux, l'angle de
   * flanc, l'angle de dos, la riposte conditionnelle et le bonus de charge se
   * calculent depuis la case OÙ SE TROUVE l'assaillant et non depuis celle d'où
   * le coup partira. Le joueur voyait un chiffre, avançait, et en obtenait un
   * autre — mesuré : le dos valait 2000 BP et la charge 2500 BP de plus que ce
   * que l'aperçu annonçait, et le coup réellement porté sortait au-dessus du
   * maximum affiché. Le contrat les porte donc, et toute implémentation qui les
   * ignore doit le DIRE (voir `fallback-combat.ts`).
   */
  damageRange(
    combat: CombatState,
    attacker: CombatUnit,
    target: CombatUnit,
    ranged: boolean,
    fromHex?: HexCoord,
    chargeHexes?: number,
  ): {
    min: number;
    max: number;
    kills: [number, number];
    retaliation: boolean;
    modifiers: { label: string; bp: number }[];
  };
  reachableHexes(combat: CombatState, unit: CombatUnit): HexCoord[];
  hexPath(combat: CombatState, unit: CombatUnit, to: HexCoord): HexCoord[] | null;
  stackPower(army: (ArmyStack | null)[]): number;
}

export interface EngineModules {
  content?: Partial<ContentPack>;
  map?: Partial<MapPack>;
  world?: Partial<WorldModulePack>;
  combat?: Partial<CombatModulePack>;
}

/* ── Registre ───────────────────────────────────────────────────────────── */

let contentOverride: Partial<ContentPack> | null = null;
let mapOverride: Partial<MapPack> | null = null;
let worldOverride: Partial<WorldModulePack> | null = null;
let combatOverride: Partial<CombatModulePack> | null = null;

let contentCache: ContentPack | null = null;
let mapCache: MapPack | null = null;
let worldCache: WorldModulePack | null = null;
let combatCache: CombatModulePack | null = null;

/** Branche les paquets réels. Peut être appelé plusieurs fois (le dernier gagne). */
export function linkEngineModules(mods: EngineModules): void {
  if (mods.content) contentOverride = mods.content;
  if (mods.map) mapOverride = mods.map;
  if (mods.world) worldOverride = mods.world;
  if (mods.combat) combatOverride = mods.combat;
  contentCache = null;
  mapCache = null;
  worldCache = null;
  combatCache = null;
}

export function registerContent(pack: Partial<ContentPack>): void {
  linkEngineModules({ content: pack });
}
export function registerMapPack(pack: Partial<MapPack>): void {
  linkEngineModules({ map: pack });
}
export function registerWorldModule(pack: Partial<WorldModulePack>): void {
  linkEngineModules({ world: pack });
}
export function registerCombatModule(pack: Partial<CombatModulePack>): void {
  linkEngineModules({ combat: pack });
}

/** Rétablit les implémentations de repli. Réservé aux tests. */
export function resetEngineModules(): void {
  contentOverride = null;
  mapOverride = null;
  worldOverride = null;
  combatOverride = null;
  contentCache = null;
  mapCache = null;
  worldCache = null;
  combatCache = null;
}

/** Vrai si un vrai paquet de contenu a été branché. */
export function hasLinkedContent(): boolean {
  return contentOverride !== null && contentOverride.CREATURES !== undefined;
}

/*
 * Implémentations de repli. Les modules `fallback-*` n'appellent le registre
 * qu'à l'exécution (jamais au chargement) : le cycle d'import est donc sûr.
 */
type Loader<T> = () => T;

let contentFallbackLoader: Loader<ContentPack> | null = fallbackContent;
let mapFallbackLoader: Loader<MapPack> | null = fallbackMapPack;
let worldFallbackLoader: Loader<WorldModulePack> | null = fallbackWorldModule;
let combatFallbackLoader: Loader<CombatModulePack> | null = fallbackCombatModule;

/** Remplace les implémentations de repli internes. Réservé aux tests. */
export function installFallbacks(f: {
  content?: Loader<ContentPack>;
  map?: Loader<MapPack>;
  world?: Loader<WorldModulePack>;
  combat?: Loader<CombatModulePack>;
}): void {
  if (f.content) contentFallbackLoader = f.content;
  if (f.map) mapFallbackLoader = f.map;
  if (f.world) worldFallbackLoader = f.world;
  if (f.combat) combatFallbackLoader = f.combat;
}

function merge<T extends object>(base: T, override: Partial<T> | null): T {
  if (!override) return base;
  const out = { ...base } as Record<string, unknown>;
  for (const k of Object.keys(override)) {
    const v = (override as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

export function content(): ContentPack {
  if (!contentCache) {
    if (!contentFallbackLoader) {
      throw new Error(
        'Contenu non branché : appelez linkEngineModules({ content }) avant de créer une partie.',
      );
    }
    contentCache = merge(contentFallbackLoader(), contentOverride);
  }
  return contentCache;
}

export function mapPack(): MapPack {
  if (!mapCache) {
    if (!mapFallbackLoader) {
      throw new Error(
        'Carte non branchée : appelez linkEngineModules({ map }) avant de créer une partie.',
      );
    }
    mapCache = merge(mapFallbackLoader(), mapOverride);
  }
  return mapCache;
}

export function worldModule(): WorldModulePack {
  if (!worldCache) {
    if (!worldFallbackLoader) {
      throw new Error('Module monde non branché.');
    }
    worldCache = merge(worldFallbackLoader(), worldOverride);
  }
  return worldCache;
}

export function combatModule(): CombatModulePack {
  if (!combatCache) {
    if (!combatFallbackLoader) {
      throw new Error('Module combat non branché.');
    }
    combatCache = merge(combatFallbackLoader(), combatOverride);
  }
  return combatCache;
}
