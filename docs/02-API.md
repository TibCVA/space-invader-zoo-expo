# Contrats inter-modules

Signatures **imposées**. Un agent qui les modifie casse le travail des autres.
Tous les types viennent de `@auvergne/engine` (`packages/engine/src/types.ts`).

---

## `@auvergne/engine` — barils

Le baril racine `packages/engine/src/index.ts` est écrit en dernier par
l'intégrateur. Chaque sous-module expose son propre `index.ts`.

### `packages/engine/src/core/index.ts`

```ts
export function createGame(setup: GameSetup, world: WorldMap): GameState;
export function applyCommand(state: GameState, cmd: Command, world: WorldMap): CommandResult;

/** A* hiérarchique. Retourne null si inatteignable. */
export function computePath(
  world: WorldMap, state: GameState, hero: HeroInstance, to: MapCoord,
): { path: MapCoord[]; costs: number[] } | null;

/** Découpe un chemin en journées selon les points de marche disponibles. */
export function pathDays(costs: number[], movementNow: number, movementMax: number): number[];

export function revealFog(state: GameState, world: WorldMap, player: PlayerId, at: MapCoord, radius: number): number[];
export function townIncome(state: GameState, town: TownState): Partial<Resources>;
export function playerIncome(state: GameState): Partial<Resources>;
export function canBuild(state: GameState, town: TownState, building: BuildingId): { ok: boolean; reason?: string };
export function terrainCost(world: WorldMap, from: MapCoord, to: MapCoord, mods: SkillEffect[]): number;
export const ENGINE_VERSION: string;
```

`applyCommand` est la **seule** porte d'entrée de mutation. Elle :
1. valide la commande (retourne `{ ok:false, error }` en français si invalide) ;
2. clone l'état (structuredClone, sauf `Uint8Array` de brouillard qui est copié) ;
3. applique, collecte les `GameEvent[]` ;
4. recalcule `state.hash = hashState(state)` ;
5. n'utilise jamais `Math.random`.

### `packages/engine/src/combat/index.ts`

```ts
export function startCombat(state: GameState, params: {
  attacker: { player: PlayerId; hero: HeroUid | null; army: (ArmyStack|null)[] };
  defender: { player: PlayerId | null; hero: HeroUid | null; town: TownUid | null; army: (ArmyStack|null)[] };
  terrain: Terrain; region: RegionId; siege: boolean;
}): CombatState;

export function applyCombatAction(
  state: GameState, action: CombatAction,
): { events: GameEvent[]; ok: boolean; error?: string };

/** Joue le combat jusqu'à la fin avec l'IA tactique. Déterministe. */
export function autoResolve(state: GameState): GameEvent[];

/** Coup suivant recommandé pour la pile active. */
export function chooseCombatAction(state: GameState, combat: CombatState): CombatAction;

/** Applique le résultat au monde (pertes, XP, butin, capture). */
export function resolveCombatOutcome(state: GameState): GameEvent[];

export function damageRange(combat: CombatState, attacker: CombatUnit, target: CombatUnit, ranged: boolean): { min: number; max: number; kills: [number, number]; retaliation: boolean; modifiers: { label: string; bp: number }[] };
export function reachableHexes(combat: CombatState, unit: CombatUnit): HexCoord[];
export function hexPath(combat: CombatState, unit: CombatUnit, to: HexCoord): HexCoord[] | null;
export function stackPower(army: (ArmyStack|null)[]): number;
```

### `packages/engine/src/world/index.ts`

```ts
export function heroStats(state: GameState, hero: HeroInstance): {
  vaillance: number; garde: number; mystique: number; savoir: number;
  movementMax: number; vision: number; manaMax: number; morale: number; fortune: number;
};
export function skillRank(hero: HeroInstance, skill: SkillId): 0 | 1 | 2 | 3;
export function activeEffects(state: GameState, hero: HeroInstance): SkillEffect[];
export function grantXp(state: GameState, hero: HeroInstance, xp: number): GameEvent[];
export function applyLevelChoice(state: GameState, hero: HeroInstance, skill: SkillId): GameEvent[];
export function xpForLevel(level: number): number;

export function visitObject(state: GameState, world: WorldMap, hero: HeroInstance, obj: MapObject): GameEvent[];
export function castAdventureSpell(state: GameState, world: WorldMap, hero: HeroInstance, spell: SpellId, target?: MapCoord): GameEvent[];

export function advanceWeather(state: GameState): GameEvent[];
export function weatherModifiers(w: WeatherKind): { moveBp: number; visionBp: number; rangedBp: number; flyBp: number; flankBp: number };
export function gabelleIncome(state: GameState): { ecus: number; sel: number; unrest: number };
export function checkVictory(state: GameState): GameEvent[];
export function weeklyEvent(state: GameState): GameEvent[];
```

---

## `@auvergne/content`

```ts
export const CONTENT_VERSION: string;
export const CREATURES: Readonly<Record<CreatureId, CreatureDef>>;
export const HEROES:    Readonly<Record<HeroId, HeroDef>>;
export const SPELLS:    Readonly<Record<SpellId, SpellDef>>;
export const SKILLS:    Readonly<Record<SkillId, SkillDef>>;
export const ARTIFACTS: Readonly<Record<ArtifactId, ArtifactDef>>;
export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>>;
export const FACTIONS:  Readonly<Record<FactionId, FactionDef>>;
export const WEEK_EVENTS: readonly WeekEventDef[];
export const NEUTRAL_GUARDS: readonly GuardTemplate[];

export function creature(id: CreatureId): CreatureDef;   // lance si inconnu
export function hero(id: HeroId): HeroDef;
export function spell(id: SpellId): SpellDef;
export function skill(id: SkillId): SkillDef;
export function artifact(id: ArtifactId): ArtifactDef;
export function building(id: BuildingId): BuildingDef;
export function creaturesOf(faction: FactionId, tier?: number): CreatureDef[];
export function buildingsOf(faction: FactionId): BuildingDef[];
export function validateContent(): string[];   // liste d'erreurs, vide si tout va bien

export interface FactionDef {
  id: FactionId; name: string; motto: string; description: string;
  colors: { primary: string; secondary: string; accent: string; stone: string; light: string };
  capitalName: string; mechanic: { name: string; description: string };
  startingResources: Resources;
}
export interface WeekEventDef { key: string; name: string; text: string; weight: number; effects: SkillEffect[] | { kind: string; [k: string]: unknown }[] }
export interface GuardTemplate { ring: 1 | 2 | 3 | 4; tiers: number[]; powerMin: number; powerMax: number }
```

**Identifiants de créatures** (imposés) :
`granit_t1`…`granit_t7` et `granit_t1_up`…`granit_t7_up` ;
`ermitage_t1`…`ermitage_t7` et `ermitage_t1_up`…`ermitage_t7_up`.

**Identifiants de héros** (imposés) : `paul thibaut loic matthieu clotilde caroline
thomas georges auguste josephine anastasia mathilde agathe roxane jean alice ines
gustave come lise jules`.

**Écoles de sorts** : 8 sorts par école × 4 écoles = 32. Identifiants
`braises_1`…`braises_8`, `sources_1`…, `brumes_1`…, `racines_1`….

**Compétences** (20) : `logistique tactique seigneurie intendance diplomatie
reconnaissance sylviculture pelerinage forges balistique guerison erudition
occultisme commandement fortune embuscade commerce cartographie resistance invocation`.

---

## `@auvergne/map`

```ts
export const MAP_VERSION: string;
export const BOUNDS: { west: 3.640; east: 3.800; south: 45.720; north: 45.900 };
export const ANCHORS: readonly MapAnchor[];

/** Terrain fixe : altitude, pente, biome, hydrographie, routes. Mis en cache. */
export function buildTerrain(): {
  cols: number; rows: number;
  terrain: Uint8Array; region: Uint8Array; elevation: Int16Array;
  slope: Uint8Array; flags: Uint16Array;
};

/** Terrain fixe + contenu tiré de la graine (gardes, artefacts, quêtes…). */
export function buildWorld(seed: number): WorldMap;

export function latLonToCell(lat: number, lon: number): MapCoord;
export function cellToLatLon(col: number, row: number): { lat: number; lon: number };
export function elevationAt(world: WorldMap, col: number, row: number): number;

export const START_POSITIONS: Readonly<Record<StartKey, {
  key: StartKey; label: string; at: MapCoord; townUid: TownUid; region: RegionId;
}>>;
export type StartKey = 'arconsat' | 'viscomtat' | 'cervieres' | 'noiretable' | 'renaudie';

/** Combinaisons équilibrées prédéfinies pour 2, 3 et 4 joueurs. */
export const START_SETS: Readonly<Record<2 | 3 | 4 | 5, StartKey[][]>>;
```

Le relief est un **champ d'altitude réel** synthétisé depuis les altitudes connues
des ancrages (Arconsat 700 m, Chabreloche 780 m, Le Lac 900 m, Col des Sagnes 990 m,
Maison du Trésor 950 m, Cervières 880 m, Viscomtat 700 m, Noirétable 720 m,
Notre-Dame de l'Hermitage 1110 m, Vollore-Montagne 940 m, La Renaudie 800 m,
Pierre Pamole 1165 m, sommet des Bois Noirs 1200 m) : interpolation par distance
inverse pondérée, plus crêtes, vallées creusées le long de l'hydrographie
(la Durolle coule vers le nord-ouest depuis Le Lac), et bruit fractal de rugosité.

---

## `@auvergne/bots`

```ts
export interface BotProfile { id: 'prudent'|'equilibre'|'agressif'|'expert'; name: string }
/** Retourne la séquence de commandes du tour, à appliquer une par une. */
export function planTurn(state: GameState, world: WorldMap, player: PlayerId): Command[];
/** Un seul coup, pour un déroulé animé côté client. */
export function nextBotCommand(state: GameState, world: WorldMap, player: PlayerId): Command | null;
```

---

## `@auvergne/protocol`

Schémas Zod + types partagés client/serveur pour l'API de sauvegarde.

```ts
export const SaveSlotSchema, SaveBlobSchema, CreateGameSchema, ...
export type SaveSlot = { id: string; name: string; turn: number; week: number;
  players: { name: string; faction: FactionId; color: string }[];
  updatedAt: string; createdAt: string; thumbnail?: string; autosave: boolean; hash: string };
export type SaveBlob = { slot: SaveSlot; setup: GameSetup; state: unknown; commands: Command[] };
export const API = { health:'/health', saves:'/api/saves', save:(id:string)=>`/api/saves/${id}`, ... };
```

Sérialisation : `GameState` contient des `Uint8Array` (brouillard). Le protocole
définit `serializeState(state): string` (base64 pour les tableaux typés) et
`deserializeState(json): GameState`. Ces deux fonctions vivent dans
`packages/protocol/src/serialize.ts` et sont **testées aller-retour avec égalité de hash**.

---

## Client — modules autonomes de la vague 1

### `apps/client/src/art/index.ts`
```ts
import type { Renderer, Texture, Container } from 'pixi.js';
/** Fabrique et met en cache toutes les textures procédurales. */
export async function buildArtAtlas(renderer: Renderer): Promise<ArtAtlas>;
export interface ArtAtlas {
  creature(id: CreatureId): Texture;          // vignette statique
  creatureRig(id: CreatureId): CreatureRig;   // conteneur animable
  prop(key: PropKey, variant: number): Texture;
  terrainBrush(key: string): Texture;
  banner(color: string, pattern: number): Texture;
  icon(key: string): Texture;
}
export interface CreatureRig extends Container {
  play(anim: 'attente'|'marche'|'attaque'|'impact'|'riposte'|'defense'|'mort'|'capacite'): void;
  update(dt: number): void;
  setFacing(dir: 1 | -1): void;
}
export type PropKey = 'sapin'|'hetre'|'buisson'|'rocher'|'muret'|'borne'|'croix'|'moulin'|'pont'|'tour'|'ferme'|'chapelle'|'souche'|'fougere';
```

### `packages/ui/src/index.ts`
Composants React sans logique de jeu : `Panel`, `Button`, `IconButton`, `Tooltip`,
`ResourceBar`, `Sheet` (panneau mobile), `Dialog`, `Tabs`, `ScrollArea`,
`HeroPortrait`, `Frame`, `Divider`, `Stat`, `Badge`, `Icon`, plus
`tokens.ts` (couleurs, espacements, durées) et `styles.css`.
`HeroPortrait` reçoit `heroId` et dessine le portrait vectoriel correspondant.

### `apps/client/src/landing/index.tsx`
```tsx
export function LandingPage(props: {
  onNewGame(): void; onContinue(): void; onLoad(): void;
  onCodex(): void; onOptions(): void; hasSave: boolean;
}): JSX.Element;
```

### `apps/client/src/audio/index.ts`
```ts
export class AudioEngine {
  static get(): AudioEngine;
  init(): Promise<void>;               // doit être appelé sur un geste utilisateur
  setBus(bus: 'musique'|'effets'|'ambiance', volume0to100: number): void;
  playTheme(theme: 'accueil'|'aventure'|'cite_granit'|'cite_ermitage'|'combat'|'victoire'|'defaite', region?: RegionId): void;
  stopTheme(fadeMs?: number): void;
  sfx(key: SfxKey): void;
  ambience(key: 'foret'|'riviere'|'vent'|'foire'|'cloches'|'aucune'): void;
  get ready(): boolean;
}
export type SfxKey = 'clic'|'clic_lourd'|'page'|'piece'|'construction'|'recrutement'|'pas_terre'|'pas_pierre'|'epee'|'arc'|'impact'|'mort'|'sort'|'victoire'|'defaite'|'alerte'|'borne'|'niveau';
```

---

## Racine de composition — `@auvergne/game`

`packages/engine` est **pur** : il ne peut pas importer `@auvergne/content` ni
`@auvergne/map` (ce sont eux qui dépendent du moteur). Le moteur déclare donc des
contrats et les reçoit par **injection** :

- `linkEngineModules({ content, map, world, combat })` — `packages/engine/src/core/registry.ts`
- `setCombatContent({ creature, spell, skill, artifact })` — `packages/engine/src/combat/content.ts`

Tant que rien n'est branché, le moteur utilise des implémentations de repli
(`core/fallback-*.ts`, `combat/creatures.ts`) : il reste jouable et testable seul.
**Ces replis ne sont pas le contenu du jeu.**

`packages/game` est le SEUL endroit où le branchement a lieu :

```ts
import { bootstrapEngine } from '@auvergne/game';
bootstrapEngine();            // idempotent, à appeler une fois au démarrage
```

Tout consommateur (client, serveur, worker, bots, tests d'intégration) appelle
`bootstrapEngine()` avant le premier `createGame`, puis importe normalement depuis
`@auvergne/engine` (ou depuis `@auvergne/game`, qui le réexporte).

Un agent qui écrit du code consommant le moteur **doit** appeler `bootstrapEngine()`
et ne doit jamais importer `core/fallback-*.ts`.

### Baril du moteur

`@auvergne/engine` réexporte à plat `types`, `rng`, `hash`, `core/`, `combat/` et
`world/`. En cas de collision de noms entre sous-modules, la version de `core/`
fait autorité (levée d'ambiguïté explicite dans `packages/engine/src/index.ts`).
