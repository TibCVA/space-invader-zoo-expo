/**
 * Assemblage de la carte du Forez.
 *
 * `buildTerrain()` produit la partie **fixe** — altitude, pente, biomes,
 * hydrographie, régions, voies — et la mémorise au niveau du module : la
 * géographie ne change jamais d'une partie à l'autre (document maître §4).
 *
 * `buildWorld(seed)` reprend ce terrain, en copie les tableaux typés pour que
 * personne ne puisse abîmer le cache, puis y sème le contenu tiré de la
 * graine : gardes, artefacts, gisements secondaires, caravanes, quêtes.
 *
 * Ordre de construction, et raison de cet ordre :
 *
 *  1. **altitude et pente** — tout le reste en dépend ;
 *  2. **voies** — tracées sur le relief, avant les biomes, pour que le coût du
 *     tracé voie la vraie pente et non un terrain déjà classé ;
 *  3. **régions** — le corridor marchand suit les grandes chaussées ;
 *  4. **biomes** — altitude + pente + humidité + proximité de l'eau ;
 *  5. **emprises** — bourgs, sceaux et sites fixes sont aplanis ;
 *  6. **lisières** — recalculées en dernier, une fois le terrain définitif.
 */
import {
  CELL_BRIDGE,
  CELL_BUILDABLE,
  CELL_CACHE,
  CELL_PASSABLE,
  MAP_COLS,
  MAP_ROWS,
  type MapAnchor,
  type StartKey,
  type WorldMap,
} from '@auvergne/engine';
import { anchorList } from './anchors.js';
import { buildElevation } from './elevation.js';
import { CELLS, COLS, ROWS, T, idx } from './grid.js';
import { buildObjects, fixedPlots, type ObjectContext } from './objects.js';
import { assignRegions } from './regions.js';
import { buildRoads } from './roads.js';
import { classifyTerrain, markEdges } from './terrain.js';

/** Version de la carte, enregistrée dans chaque partie et chaque sauvegarde. */
export const MAP_VERSION = '1.0.0-forez';

export interface TerrainBuild {
  cols: number;
  rows: number;
  terrain: Uint8Array;
  region: Uint8Array;
  elevation: Int16Array;
  slope: Uint8Array;
  flags: Uint16Array;
}

/** Aplanit une emprise : plus de rocher ni de forte pente sur un site bâti. */
function clearPlot(
  terrain: Uint8Array,
  flags: Uint16Array,
  slope: Uint8Array,
  at: { col: number; row: number },
  radius: number,
): void {
  const r2 = radius * radius;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dc * dc + dr * dr > r2) continue;
      const col = at.col + dc;
      const row = at.row + dr;
      if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
      const i = row * COLS + col;
      const t = terrain[i];
      // L'eau garde son cours : un bourg de vallée reste un bourg de vallée.
      if (t === T.eau) continue;
      if (t === T.rocher || t === T.pente || t === T.humide) terrain[i] = T.prairie;
      flags[i] |= CELL_PASSABLE;
      if (slope[i] <= 16 && terrain[i] !== T.route && terrain[i] !== T.chemin) {
        flags[i] |= CELL_BUILDABLE;
      }
    }
  }
}

/** Force une case à être franchissable : réservé aux entrées et emprises bâties. */
function forceWalkable(terrain: Uint8Array, flags: Uint16Array, col: number, row: number): void {
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return;
  const i = row * COLS + col;
  if (terrain[i] === T.eau) terrain[i] = T.prairie;
  flags[i] |= CELL_PASSABLE;
}

/**
 * Rétablit les invariants des drapeaux après l'aplanissement des emprises.
 *
 * `clearPlot` transforme du rocher en prairie : la case ne peut plus abriter de
 * cache, et une case redevenue sèche doit être franchissable. On repasse donc
 * une fois sur toute la grille pour que `flags` ne mente jamais sur `terrain`.
 */
function normaliseFlags(terrain: Uint8Array, flags: Uint16Array): void {
  for (let i = 0; i < CELLS; i++) {
    const t = terrain[i];
    let f = flags[i];
    if (t === T.eau) {
      if ((f & CELL_BRIDGE) === 0) f &= ~CELL_PASSABLE;
      else f |= CELL_PASSABLE;
      f &= ~CELL_BUILDABLE;
    } else {
      f |= CELL_PASSABLE;
      f &= ~CELL_BRIDGE;
    }
    if (t === T.foret || t === T.rocher || t === T.humide) f |= CELL_CACHE;
    else f &= ~CELL_CACHE;
    if (t === T.route || t === T.chemin) f &= ~CELL_BUILDABLE;
    flags[i] = f;
  }
}

let terrainCache: TerrainBuild | null = null;

/** Contrat `docs/02-API.md` : le terrain fixe, mis en cache. */
export function buildTerrain(): TerrainBuild {
  if (terrainCache) return terrainCache;

  const { elevation, slope } = buildElevation();
  const roads = buildRoads(elevation, slope);
  const region = assignRegions(roads.road);
  const { terrain, flags } = classifyTerrain(elevation, slope, roads.road, roads.bridge);

  for (const plot of fixedPlots()) {
    clearPlot(terrain, flags, slope, plot.at, plot.radius);
    forceWalkable(terrain, flags, plot.at.col, plot.at.row);
  }
  // Emprises 2 × 2 des cités : les quatre cases doivent être bâties, donc sèches.
  for (const plot of fixedPlots()) {
    if (plot.radius < 3) continue;
    forceWalkable(terrain, flags, plot.at.col + 1, plot.at.row);
    forceWalkable(terrain, flags, plot.at.col, plot.at.row - 1);
    forceWalkable(terrain, flags, plot.at.col + 1, plot.at.row - 1);
  }

  normaliseFlags(terrain, flags);
  markEdges(terrain, flags);

  terrainCache = {
    cols: MAP_COLS,
    rows: MAP_ROWS,
    terrain,
    region,
    elevation,
    slope,
    flags,
  };
  return terrainCache;
}

/** Réinitialise le cache du terrain. Réservé aux tests et aux mesures. */
export function resetTerrainCache(): void {
  terrainCache = null;
  worldCache.clear();
  economyCache.clear();
}

/* ── Monde complet ──────────────────────────────────────────────────────── */

const worldCache = new Map<number, WorldMap>();
const economyCache = new Map<number, Record<StartKey, number>>();
/** Nombre de mondes conservés en cache (une partie en cours, quelques rejeux). */
const WORLD_CACHE_MAX = 4;

/** Contrat `docs/02-API.md` : terrain fixe + contenu tiré de la graine. */
export function buildWorld(seed: number): WorldMap {
  const key = seed >>> 0;
  const hit = worldCache.get(key);
  if (hit) return hit;

  const base = buildTerrain();

  // Copies défensives : `WorldMap` est manipulé par le moteur et le client.
  const terrain = Uint8Array.from(base.terrain);
  const region = Uint8Array.from(base.region);
  const elevation = Int16Array.from(base.elevation);
  const slope = Uint8Array.from(base.slope);
  const flags = Uint16Array.from(base.flags);

  const ctx: ObjectContext = { terrain, flags, elevation, slope, region };
  const built = buildObjects(ctx, key);

  const objectAt = new Uint32Array(CELLS);
  for (let k = 0; k < built.objects.length; k++) {
    for (const f of built.objects[k].footprint) {
      if (f.col < 0 || f.row < 0 || f.col >= COLS || f.row >= ROWS) continue;
      objectAt[idx(f.col, f.row)] = k + 1;
    }
  }

  const anchors: MapAnchor[] = anchorList();

  const world: WorldMap = {
    cols: MAP_COLS,
    rows: MAP_ROWS,
    terrain,
    region,
    elevation,
    slope,
    flags,
    objectAt,
    objects: built.objects,
    anchors,
  };

  if (worldCache.size >= WORLD_CACHE_MAX) {
    const oldest = worldCache.keys().next();
    if (!oldest.done) {
      worldCache.delete(oldest.value);
      economyCache.delete(oldest.value);
    }
  }
  worldCache.set(key, world);
  economyCache.set(key, built.startValues);
  return world;
}

/** Contrat `docs/02-API.md` : altitude d'une case, en mètres. */
export function elevationAt(world: WorldMap, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= world.cols || row >= world.rows) return 0;
  return world.elevation[row * world.cols + col] | 0;
}

/**
 * Valeur économique accessible en sept jours depuis chaque départ, telle que
 * mesurée par la passe d'équilibrage. Utile aux tests et à la télémétrie.
 */
export function startEconomy(seed: number): Record<StartKey, number> {
  const key = seed >>> 0;
  buildWorld(key);
  return economyCache.get(key) ?? ({} as Record<StartKey, number>);
}
