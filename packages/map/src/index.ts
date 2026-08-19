/**
 * `@auvergne/map` — la carte du Forez.
 *
 * Grille de 256 colonnes × 416 lignes, environ 48 mètres par case, entièrement
 * **générée par le code** : aucune tuile, aucune donnée téléchargée, aucun
 * asset externe. La géographie est fidèle — projection WGS84 → Lambert-93 →
 * grille, ancrages du brief à moins d'une case, hydrographie et reliefs réels
 * du massif des Bois Noirs — et le contenu, lui, dépend de la graine.
 *
 * Ce baril satisfait l'interface `MapPack` de
 * `packages/engine/src/core/registry.ts` (`MAP_VERSION`, `START_POSITIONS`,
 * `START_SETS`, `buildWorld`) ainsi que la section `@auvergne/map` de
 * `docs/02-API.md`. Le branchement dans le moteur se fait dans
 * `packages/game/src/index.ts` via `linkEngineModules({ map })`.
 */

/* ── Contrat docs/02-API.md ─────────────────────────────────────────────── */

export { MAP_VERSION, buildTerrain, buildWorld, elevationAt, startEconomy } from './build.js';
export type { TerrainBuild } from './build.js';

export { BOUNDS, latLonToCell, cellToLatLon } from './projection.js';

export { ANCHORS } from './anchors.js';

export { START_POSITIONS, START_SETS } from './starts.js';

/** Types de départ : ils appartiennent au moteur, la carte les réexporte. */
export type { StartKey, StartPosition } from '@auvergne/engine';

/* ── Compléments (interface, bots, tests) ───────────────────────────────── */

export {
  CELL_HEIGHT_M,
  CELL_SIZE_M,
  CELL_WIDTH_M,
  GRID_ORIGIN_X,
  GRID_ORIGIN_Y,
  MAP_HEIGHT_M,
  MAP_WIDTH_M,
  cellDistanceMeters,
  cellToLambert93,
  insideBounds,
  inverseLambert93,
  lambert93,
  projectToGrid,
} from './projection.js';
export type { GridPoint, Lambert93 } from './projection.js';

export {
  ANCHORS as MAP_ANCHORS,
  FOREZ_ANCHORS,
  anchor,
  anchorAltitude,
  anchorCell,
  anchorList,
} from './anchors.js';
export type { AnchorKey, ForezAnchor } from './anchors.js';

export { MAX_ALTITUDE, MIN_ALTITUDE, buildElevation, computeSlope } from './elevation.js';
export type { ElevationField } from './elevation.js';

export { CROSSINGS, RIVERS, SAGNES, buildHydrography } from './hydrography.js';
export type { BogDef, CrossingDef, Hydrography, RiverDef } from './hydrography.js';

export { ROADS, ROAD_MAJOR, ROAD_NONE, ROAD_PATH, buildRoads } from './roads.js';
export type { RoadDef, RoadField } from './roads.js';

export { REGION_LABELS, assignRegions, regionOf } from './regions.js';

export {
  FOREST_LABELS,
  WATER_INFLUENCE,
  classifyTerrain,
  distanceToWater,
  forestKindAt,
  markEdges,
} from './terrain.js';
export type { ForestKind, TerrainField } from './terrain.js';

export {
  WEEK_BUDGET,
  BALANCE_BUDGET,
  accessibleValue,
  buildObjects,
  costFieldFrom,
  fixedPlots,
  objectValue,
} from './objects.js';
export type { ObjectBuild, ObjectContext, Plot } from './objects.js';

export { NEUTRAL_CENTERS, START_KEYS } from './starts.js';
export type { NeutralCenter } from './starts.js';

export { COLS, ROWS, CELLS } from './grid.js';
