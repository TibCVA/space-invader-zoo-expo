/**
 * Utilitaires entiers du noyau : géométrie de grille, accès au terrain,
 * arithmétique de ressources et libellés français.
 *
 * Aucune fonction de ce fichier n'utilise de nombre à virgule flottante pour
 * produire une valeur simulée : toutes les divisions sont tronquées.
 */
import {
  CELL_BRIDGE,
  CELL_PASSABLE,
  CELL_ROAD,
  MAP_COLS,
  RESOURCE_KEYS,
  TERRAINS,
  TERRAIN_COST,
  emptyResources,
  type MapCoord,
  type RegionId,
  type ResourceKey,
  type Resources,
  type Terrain,
  type WorldMap,
} from '../types.js';
import { REGIONS } from '../types.js';

/* ── Arithmétique ───────────────────────────────────────────────────────── */

export function clampInt(value: number, min: number, max: number): number {
  const v = value | 0;
  if (v < min) return min;
  if (v > max) return max;
  return v;
}

/** Division entière tronquée vers zéro. */
export function divTrunc(a: number, b: number): number {
  if (b === 0) return 0;
  return Math.trunc(a / b);
}

/** Division entière arrondie à l'entier le plus proche (demi vers le haut). */
export function divRound(a: number, b: number): number {
  if (b === 0) return 0;
  return Math.floor((a * 2 + (a >= 0 ? b : -b)) / (2 * b));
}

/** Applique un ratio en points de base : `value × bp / 10000`, tronqué. */
export function applyBp(value: number, bp: number): number {
  return Math.trunc((value * bp) / 10000);
}

/** Somme de deux ratios en BP autour de la neutralité (10000). */
export function combineBp(a: number, b: number): number {
  return a + b - 10000;
}

/* ── Géométrie de grille ────────────────────────────────────────────────── */

export interface Offset {
  dc: number;
  dr: number;
}

/** Les huit directions, dans l'ordre des `facing` (0 = nord, sens horaire). */
export const DIRECTIONS: readonly Offset[] = [
  { dc: 0, dr: -1 },
  { dc: 1, dr: -1 },
  { dc: 1, dr: 0 },
  { dc: 1, dr: 1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: -1, dr: -1 },
];

export function sameCoord(a: MapCoord, b: MapCoord): boolean {
  return a.col === b.col && a.row === b.row;
}

export function coordKey(c: MapCoord): string {
  return c.col + ',' + c.row;
}

export function cellIndexOf(world: WorldMap, col: number, row: number): number {
  return row * world.cols + col;
}

export function coordOfIndex(world: WorldMap, index: number): MapCoord {
  return { col: index % world.cols, row: Math.floor(index / world.cols) };
}

export function inBounds(world: WorldMap, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < world.cols && row < world.rows;
}

/** Distance de Tchebychev (nombre de pas en huit directions). */
export function chebyshev(a: MapCoord, b: MapCoord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

/** Distance octile en points de marche minimaux, utilisée comme heuristique. */
export function octileCost(
  ac: number,
  ar: number,
  bc: number,
  br: number,
  unit: number,
): number {
  const dc = Math.abs(ac - bc);
  const dr = Math.abs(ar - br);
  const diag = Math.min(dc, dr);
  const straight = Math.max(dc, dr) - diag;
  return straight * unit + Math.trunc((diag * unit * 141) / 100);
}

export function isDiagonal(from: MapCoord, to: MapCoord): boolean {
  return from.col !== to.col && from.row !== to.row;
}

export function areAdjacent(from: MapCoord, to: MapCoord): boolean {
  const dc = Math.abs(from.col - to.col);
  const dr = Math.abs(from.row - to.row);
  return (dc | dr) !== 0 && dc <= 1 && dr <= 1;
}

/** Direction 0..7 (0 = nord, sens horaire) menant de `from` vers `to`. */
export function facingOf(from: MapCoord, to: MapCoord): number {
  const dc = Math.sign(to.col - from.col);
  const dr = Math.sign(to.row - from.row);
  for (let i = 0; i < 8; i++) {
    const d = DIRECTIONS[i];
    if (d.dc === dc && d.dr === dr) return i;
  }
  return 0;
}

/* ── Accès au terrain ───────────────────────────────────────────────────── */

export function terrainAt(world: WorldMap, col: number, row: number): Terrain {
  return TERRAINS[world.terrain[row * world.cols + col]] ?? 'prairie';
}

export function terrainAtIndex(world: WorldMap, index: number): Terrain {
  return TERRAINS[world.terrain[index]] ?? 'prairie';
}

export function regionAt(world: WorldMap, col: number, row: number): RegionId {
  return REGIONS[world.region[row * world.cols + col]] ?? 'grande_chaussee';
}

export function elevationAtCell(world: WorldMap, col: number, row: number): number {
  return world.elevation[row * world.cols + col] | 0;
}

export function slopeAt(world: WorldMap, col: number, row: number): number {
  return world.slope[row * world.cols + col] | 0;
}

export function flagsAt(world: WorldMap, col: number, row: number): number {
  return world.flags[row * world.cols + col] | 0;
}

/** Une case est franchissable si le drapeau le dit, ou si un pont couvre l'eau. */
export function isPassableIndex(world: WorldMap, index: number): boolean {
  const f = world.flags[index] | 0;
  if ((f & CELL_BRIDGE) !== 0) return true;
  if ((f & CELL_PASSABLE) === 0) return false;
  return TERRAIN_COST[TERRAINS[world.terrain[index]] ?? 'prairie'] < Number.MAX_SAFE_INTEGER;
}

export function isPassable(world: WorldMap, col: number, row: number): boolean {
  if (!inBounds(world, col, row)) return false;
  return isPassableIndex(world, row * world.cols + col);
}

export function isRoadIndex(world: WorldMap, index: number): boolean {
  return ((world.flags[index] | 0) & CELL_ROAD) !== 0;
}

/** Coût de terrain brut d'une case, pont compris. */
export function rawTerrainCost(world: WorldMap, index: number): number {
  const f = world.flags[index] | 0;
  const t = TERRAINS[world.terrain[index]] ?? 'prairie';
  if (t === 'eau') return (f & CELL_BRIDGE) !== 0 ? TERRAIN_COST.chemin : Number.MAX_SAFE_INTEGER;
  return TERRAIN_COST[t];
}

/* ── Ressources ─────────────────────────────────────────────────────────── */

export function cloneResources(r: Resources): Resources {
  return {
    ecus: r.ecus | 0,
    bois: r.bois | 0,
    granit: r.granit | 0,
    fer: r.fer | 0,
    sel: r.sel | 0,
    essence: r.essence | 0,
    filDor: r.filDor | 0,
  };
}

export function addResources(target: Resources, delta: Partial<Resources>): Resources {
  for (const k of RESOURCE_KEYS) {
    const d = delta[k];
    if (d) target[k] = (target[k] | 0) + (d | 0);
  }
  return target;
}

export function subResources(target: Resources, cost: Partial<Resources>): Resources {
  for (const k of RESOURCE_KEYS) {
    const d = cost[k];
    if (d) target[k] = (target[k] | 0) - (d | 0);
  }
  return target;
}

export function mergeDelta(
  target: Partial<Resources>,
  delta: Partial<Resources>,
): Partial<Resources> {
  for (const k of RESOURCE_KEYS) {
    const d = delta[k];
    if (d) target[k] = (target[k] ?? 0) + (d | 0);
  }
  return target;
}

export function fullResources(partial: Partial<Resources>): Resources {
  const r = emptyResources();
  addResources(r, partial);
  return r;
}

export function canAfford(have: Resources, cost: Partial<Resources>): boolean {
  for (const k of RESOURCE_KEYS) {
    const c = cost[k];
    if (c && (have[k] | 0) < c) return false;
  }
  return true;
}

export function missingResources(
  have: Resources,
  cost: Partial<Resources>,
): { key: ResourceKey; amount: number }[] {
  const out: { key: ResourceKey; amount: number }[] = [];
  for (const k of RESOURCE_KEYS) {
    const c = cost[k];
    if (c && (have[k] | 0) < c) out.push({ key: k, amount: c - (have[k] | 0) });
  }
  return out;
}

export function scaleCost(cost: Partial<Resources>, count: number): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const k of RESOURCE_KEYS) {
    const c = cost[k];
    if (c) out[k] = c * count;
  }
  return out;
}

/** Applique une remise (ou une surtaxe) en BP à un coût, minimum zéro. */
export function costWithBp(cost: Partial<Resources>, bp: number): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const k of RESOURCE_KEYS) {
    const c = cost[k];
    if (c) out[k] = Math.max(0, applyBp(c, bp));
  }
  return out;
}

export function isCostEmpty(cost: Partial<Resources>): boolean {
  for (const k of RESOURCE_KEYS) {
    if (cost[k]) return false;
  }
  return true;
}

export function negate(delta: Partial<Resources>): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const k of RESOURCE_KEYS) {
    const c = delta[k];
    if (c) out[k] = -c;
  }
  return out;
}

/* ── Libellés français ──────────────────────────────────────────────────── */

export const RESOURCE_LABELS: Record<ResourceKey, string> = {
  ecus: 'écus',
  bois: 'bois',
  granit: 'granit',
  fer: 'fer',
  sel: 'sel',
  essence: 'essence sylvestre',
  filDor: "fil d'or",
};

export const TERRAIN_LABELS: Record<Terrain, string> = {
  route: 'grande chaussée',
  chemin: 'chemin',
  prairie: 'prairie',
  foret: 'forêt',
  pente: 'forte pente',
  lande: 'lande rase',
  humide: 'zone humide',
  rocher: 'chaos rocheux',
  eau: 'cours d’eau',
  falaise: 'falaise',
};

export const REGION_LABELS: Record<RegionId, string> = {
  hauts_arconsat: "les Hauts d'Arconsat",
  vallee_durolle: 'la Vallée de la Durolle',
  lac_sagnes: 'le Lac et les Sagnes',
  maison_tresor: 'la Maison du Trésor',
  chatellenie_cervieres: 'la Châtellenie de Cervières',
  futaies_viscomtat: 'les Futaies de Viscomtat',
  coeur_bois_noirs: 'le Cœur des Bois Noirs',
  pays_noiretable: 'le Pays de Noirétable',
  hermitage_peyrotine: "l'Hermitage et Peyrotine",
  vollore_pamole: 'Vollore et Pamole',
  marche_renaudie: 'la Marche de La Renaudie',
  grande_chaussee: 'la Grande Chaussée des Marchands',
};

/** « 120 écus, 5 bois et 2 fer ». */
export function formatCost(cost: Partial<Resources>): string {
  const parts: string[] = [];
  for (const k of RESOURCE_KEYS) {
    const c = cost[k];
    if (c) parts.push(`${c} ${RESOURCE_LABELS[k]}`);
  }
  if (parts.length === 0) return 'rien';
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' et ' + parts[parts.length - 1];
}

/** « il manque 40 écus et 2 bois ». */
export function formatMissing(missing: { key: ResourceKey; amount: number }[]): string {
  const parts = missing.map((m) => `${m.amount} ${RESOURCE_LABELS[m.key]}`);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(', ') + ' et ' + parts[parts.length - 1];
}

/** Accord simple : « 1 jour » / « 3 jours ». */
export function plural(n: number, one: string, many: string): string {
  return n > 1 ? `${n} ${many}` : `${n} ${one}`;
}

/* ── Itération déterministe ─────────────────────────────────────────────── */

/**
 * Clefs triées d'un enregistrement. Obligatoire dès qu'une itération influence
 * la simulation : l'ordre d'insertion ne doit jamais devenir une entrée cachée.
 */
export function sortedKeys<T extends string>(record: Record<T, unknown>): T[] {
  return (Object.keys(record) as T[]).sort();
}

export { MAP_COLS };
