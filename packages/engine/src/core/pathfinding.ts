/**
 * A* hiérarchique : graphe de blocs 32 × 32 pour la longue distance,
 * grille locale pour le trajet réel.
 *
 * Sur la carte du Forez (256 × 416 = 106 496 cases) un A* naïf explore trop de
 * cases pour tenir la cible de 150 ms du document maître (§19). La recherche
 * est donc menée en deux temps :
 *
 *  1. **graphe de blocs** — 8 × 13 = 104 nœuds, un par bloc de 32 × 32, reliés
 *     lorsqu'il existe une traversée franchissable le long de leur frontière.
 *     Un Dijkstra sur ce graphe donne un couloir en quelques microsecondes ;
 *  2. **grille locale** — un A* octile classique, restreint aux blocs du
 *     couloir dilatés d'un bloc. Si le couloir échoue (cas rare : passage
 *     étroit non détecté par la frontière), on retombe sur un A* complet.
 *
 * Les caches sont invalidés dès qu'un objet change (pont détruit, garde
 * vaincue, cité prise) par `invalidateWorldCache`, et le cache de trajets est
 * purgé à chaque commande par `bumpPathRevision` puisque les héros bougent.
 */
import {
  BLOCK_SIZE,
  type GameState,
  type HeroInstance,
  type MapCoord,
  type SkillEffect,
  type WorldMap,
} from '../types.js';
import { DIAGONAL_DEN, DIAGONAL_NUM, MIN_TERRAIN_COST } from './constants.js';
import { DIRECTIONS, sameCoord } from './util.js';
import { objectAtCell, stepCost } from './movement.js';
import { worldModule } from './registry.js';

/* ── Caches ─────────────────────────────────────────────────────────────── */

interface BlockGraph {
  bcols: number;
  brows: number;
  /** coût moyen d'une case franchissable du bloc (0 = bloc mort) */
  avgCost: Int32Array;
  /** 4 bits : 1 = nord, 2 = est, 4 = sud, 8 = ouest */
  links: Uint8Array;
}

interface WorldCache {
  graph: BlockGraph;
  /** cases interdites par l'empreinte d'un objet (hors case d'entrée) */
  staticBlocked: Uint8Array;
  gScore: Int32Array;
  cameFrom: Int32Array;
  stamp: Int32Array;
  closed: Int32Array;
  heapCell: Int32Array;
  heapKey: Int32Array;
  blockMask: Int32Array;
  generation: number;
  costTables: Map<string, Uint16Array>;
}

const caches = new WeakMap<WorldMap, WorldCache>();

/** Révision globale : toute commande appliquée invalide le cache de trajets. */
let pathRevision = 0;
const pathCache = new Map<string, { path: MapCoord[]; costs: number[] } | null>();
let pathCacheRevision = -1;

/** À appeler après chaque commande : les héros ont pu bouger. */
export function bumpPathRevision(): void {
  pathRevision++;
}

/** À appeler quand un objet de la carte change (pont, garde, cité, obstacle). */
export function invalidateWorldCache(world: WorldMap): void {
  caches.delete(world);
  bumpPathRevision();
}

/** Purge complète, réservée aux tests et aux changements de partie. */
export function invalidatePathCache(): void {
  pathCache.clear();
  pathRevision++;
}

function blockGraphOf(world: WorldMap, staticBlocked: Uint8Array): BlockGraph {
  const bcols = Math.ceil(world.cols / BLOCK_SIZE);
  const brows = Math.ceil(world.rows / BLOCK_SIZE);
  const avgCost = new Int32Array(bcols * brows);
  const links = new Uint8Array(bcols * brows);

  for (let br = 0; br < brows; br++) {
    for (let bc = 0; bc < bcols; bc++) {
      const c0 = bc * BLOCK_SIZE;
      const r0 = br * BLOCK_SIZE;
      const c1 = Math.min(world.cols, c0 + BLOCK_SIZE);
      const r1 = Math.min(world.rows, r0 + BLOCK_SIZE);
      let sum = 0;
      let count = 0;
      for (let row = r0; row < r1; row++) {
        for (let col = c0; col < c1; col++) {
          const i = row * world.cols + col;
          if (staticBlocked[i]) continue;
          const c = rawCost(world, i);
          if (c === 0) continue;
          sum += c;
          count++;
        }
      }
      avgCost[br * bcols + bc] = count === 0 ? 0 : Math.trunc(sum / count);
    }
  }

  const open = (i: number): boolean => staticBlocked[i] === 0 && rawCost(world, i) !== 0;

  for (let br = 0; br < brows; br++) {
    for (let bc = 0; bc < bcols; bc++) {
      const b = br * bcols + bc;
      const c0 = bc * BLOCK_SIZE;
      const r0 = br * BLOCK_SIZE;
      const c1 = Math.min(world.cols, c0 + BLOCK_SIZE);
      const r1 = Math.min(world.rows, r0 + BLOCK_SIZE);

      if (bc + 1 < bcols) {
        for (let row = r0; row < r1; row++) {
          if (open(row * world.cols + c1 - 1) && open(row * world.cols + c1)) {
            links[b] |= 2;
            links[b + 1] |= 8;
            break;
          }
        }
      }
      if (br + 1 < brows) {
        for (let col = c0; col < c1; col++) {
          if (open((r1 - 1) * world.cols + col) && open(r1 * world.cols + col)) {
            links[b] |= 4;
            links[b + bcols] |= 1;
            break;
          }
        }
      }
    }
  }
  return { bcols, brows, avgCost, links };
}

function rawCost(world: WorldMap, index: number): number {
  const f = world.flags[index] | 0;
  const terrainIndex = world.terrain[index] | 0;
  // 7 = 'eau' dans TERRAINS
  if (terrainIndex === 7) return (f & 4) !== 0 ? 85 : 0;
  if ((f & 1) === 0) return 0;
  const costs = [70, 85, 100, 125, 145, 160, 200, 0];
  return costs[terrainIndex] ?? 100;
}

function buildStaticBlocked(state: GameState, world: WorldMap): Uint8Array {
  const blocked = new Uint8Array(world.cols * world.rows);
  for (const template of world.objects) {
    const obj = state.objects[template.uid] ?? template;
    if (obj.kind === 'ressource' || obj.kind === 'borne') continue;
    for (const c of obj.footprint) {
      if (c.col < 0 || c.row < 0 || c.col >= world.cols || c.row >= world.rows) continue;
      if (sameCoord(c, obj.entrance)) continue;
      blocked[c.row * world.cols + c.col] = 1;
    }
  }
  return blocked;
}

function cacheOf(state: GameState, world: WorldMap): WorldCache {
  let cache = caches.get(world);
  if (!cache) {
    const size = world.cols * world.rows;
    const staticBlocked = buildStaticBlocked(state, world);
    cache = {
      graph: blockGraphOf(world, staticBlocked),
      staticBlocked,
      gScore: new Int32Array(size),
      cameFrom: new Int32Array(size),
      stamp: new Int32Array(size),
      closed: new Int32Array(size),
      heapCell: new Int32Array(4096),
      heapKey: new Int32Array(4096),
      blockMask: new Int32Array(1),
      generation: 0,
      costTables: new Map(),
    };
    const nblocks = cache.graph.bcols * cache.graph.brows;
    cache.blockMask = new Int32Array(nblocks);
    caches.set(world, cache);
  }
  return cache;
}

/* ── Table de coûts ─────────────────────────────────────────────────────── */

function modsKey(state: GameState, mods: SkillEffect[]): string {
  let key = state.weather.current;
  for (const m of mods) {
    if (m.kind === 'terrain_cost_bp') key += `|${m.terrain}:${m.bp}`;
  }
  return key;
}

/**
 * Coût d'entrée (non diagonal) de chaque case, terrain + compétences + météo.
 * 0 signifie « infranchissable ». Le coût ne dépendant que de la case
 * d'arrivée, cette table rend le A* purement arithmétique.
 */
function costTableFor(
  state: GameState,
  world: WorldMap,
  cache: WorldCache,
  mods: SkillEffect[],
): Uint16Array {
  const key = modsKey(state, mods);
  const found = cache.costTables.get(key);
  if (found) return found;

  const table = new Uint16Array(world.cols * world.rows);
  const from: MapCoord = { col: 0, row: 0 };
  const to: MapCoord = { col: 0, row: 0 };
  for (let row = 0; row < world.rows; row++) {
    for (let col = 0; col < world.cols; col++) {
      const i = row * world.cols + col;
      if (rawCost(world, i) === 0) {
        table[i] = 0;
        continue;
      }
      from.col = col;
      from.row = row === 0 ? 1 : row - 1;
      to.col = col;
      to.row = row;
      const c = stepCost(world, state, from, to, mods);
      table[i] = c >= 65535 ? 0 : c;
    }
  }
  if (cache.costTables.size > 8) cache.costTables.clear();
  cache.costTables.set(key, table);
  return table;
}

/* ── Tas binaire ────────────────────────────────────────────────────────── */

class Heap {
  private cells: Int32Array;
  private keys: Int32Array;
  private readonly cache: WorldCache;
  size = 0;

  constructor(cache: WorldCache) {
    this.cache = cache;
    this.cells = cache.heapCell;
    this.keys = cache.heapKey;
  }

  clear(): void {
    this.size = 0;
  }

  private grow(): void {
    const cells = new Int32Array(this.cells.length * 2);
    const keys = new Int32Array(this.keys.length * 2);
    cells.set(this.cells);
    keys.set(this.keys);
    this.cells = cells;
    this.keys = keys;
    // Le tas agrandi est conservé pour les recherches suivantes.
    this.cache.heapCell = cells;
    this.cache.heapKey = keys;
  }

  push(cell: number, key: number): void {
    if (this.size >= this.cells.length) this.grow();
    let i = this.size++;
    this.cells[i] = cell;
    this.keys[i] = key;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  pop(): number {
    const top = this.cells[0];
    this.size--;
    if (this.size > 0) {
      this.cells[0] = this.cells[this.size];
      this.keys[0] = this.keys[this.size];
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let best = i;
        if (l < this.size && this.keys[l] < this.keys[best]) best = l;
        if (r < this.size && this.keys[r] < this.keys[best]) best = r;
        if (best === i) break;
        this.swap(best, i);
        i = best;
      }
    }
    return top;
  }

  private swap(a: number, b: number): void {
    const c = this.cells[a];
    this.cells[a] = this.cells[b];
    this.cells[b] = c;
    const k = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = k;
  }
}

/* ── Couloir hiérarchique ───────────────────────────────────────────────── */

function blockOf(world: WorldMap, index: number, graph: BlockGraph): number {
  const col = index % world.cols;
  const row = (index - col) / world.cols;
  return Math.trunc(row / BLOCK_SIZE) * graph.bcols + Math.trunc(col / BLOCK_SIZE);
}

/** Dijkstra sur le graphe de blocs. Retourne les blocs traversés, ou null. */
function blockPath(graph: BlockGraph, start: number, goal: number): number[] | null {
  const n = graph.bcols * graph.brows;
  const dist = new Int32Array(n).fill(0x7fffffff);
  const prev = new Int32Array(n).fill(-1);
  const done = new Uint8Array(n);
  dist[start] = 0;

  for (;;) {
    let best = -1;
    let bestD = 0x7fffffff;
    for (let i = 0; i < n; i++) {
      if (!done[i] && dist[i] < bestD) {
        bestD = dist[i];
        best = i;
      }
    }
    if (best < 0) break;
    if (best === goal) break;
    done[best] = 1;
    const link = graph.links[best];
    const neighbours = [
      link & 1 ? best - graph.bcols : -1,
      link & 2 ? best + 1 : -1,
      link & 4 ? best + graph.bcols : -1,
      link & 8 ? best - 1 : -1,
    ];
    for (const nb of neighbours) {
      if (nb < 0 || nb >= n || done[nb]) continue;
      const step = Math.trunc(((graph.avgCost[best] + graph.avgCost[nb]) * BLOCK_SIZE) / 4);
      const nd = dist[best] + Math.max(1, step);
      if (nd < dist[nb]) {
        dist[nb] = nd;
        prev[nb] = best;
      }
    }
  }

  if (dist[goal] === 0x7fffffff) return null;
  const out: number[] = [];
  let cur = goal;
  while (cur !== -1) {
    out.push(cur);
    if (cur === start) break;
    cur = prev[cur];
  }
  return out.reverse();
}

function buildCorridor(cache: WorldCache, graph: BlockGraph, blocks: number[], stamp: number): void {
  for (const b of blocks) {
    const bc = b % graph.bcols;
    const br = (b - bc) / graph.bcols;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = bc + dc;
        const r = br + dr;
        if (c < 0 || r < 0 || c >= graph.bcols || r >= graph.brows) continue;
        cache.blockMask[r * graph.bcols + c] = stamp;
      }
    }
  }
}

/* ── A* local ───────────────────────────────────────────────────────────── */

interface SearchOptions {
  startIndex: number;
  goalIndex: number;
  costs: Uint16Array;
  dynamicBlocked: Set<number>;
  corridorStamp: number;
  /** limite d'expansion, garde-fou contre les cartes pathologiques */
  maxExpansions: number;
}

function search(
  world: WorldMap,
  cache: WorldCache,
  opt: SearchOptions,
): { path: MapCoord[]; costs: number[] } | null {
  const { startIndex, goalIndex, costs, dynamicBlocked } = opt;
  const cols = world.cols;
  const rows = world.rows;
  const graph = cache.graph;
  const gen = ++cache.generation;
  const heap = new Heap(cache);
  heap.clear();

  const goalCol = goalIndex % cols;
  const goalRow = (goalIndex - goalCol) / cols;

  cache.gScore[startIndex] = 0;
  cache.stamp[startIndex] = gen;
  cache.cameFrom[startIndex] = -1;
  heap.push(startIndex, 0);

  let expansions = 0;
  let found = false;

  while (heap.size > 0) {
    const cur = heap.pop();
    if (cache.closed[cur] === gen) continue;
    cache.closed[cur] = gen;
    if (cur === goalIndex) {
      found = true;
      break;
    }
    if (++expansions > opt.maxExpansions) break;

    const col = cur % cols;
    const row = (cur - col) / cols;
    const g = cache.gScore[cur];

    for (let d = 0; d < 8; d++) {
      const nc = col + DIRECTIONS[d].dc;
      const nr = row + DIRECTIONS[d].dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const nb = nr * cols + nc;
      if (cache.closed[nb] === gen) continue;
      if (opt.corridorStamp !== 0 && cache.blockMask[blockOf(world, nb, graph)] !== opt.corridorStamp) {
        continue;
      }
      const base = costs[nb];
      if (base === 0) continue;
      if (nb !== goalIndex && (cache.staticBlocked[nb] === 1 || dynamicBlocked.has(nb))) continue;

      const diagonal = DIRECTIONS[d].dc !== 0 && DIRECTIONS[d].dr !== 0;
      const step = diagonal ? Math.trunc((base * DIAGONAL_NUM) / DIAGONAL_DEN) : base;
      const ng = g + step;
      if (cache.stamp[nb] === gen && cache.gScore[nb] <= ng) continue;

      cache.stamp[nb] = gen;
      cache.gScore[nb] = ng;
      cache.cameFrom[nb] = cur;

      const dc = Math.abs(nc - goalCol);
      const dr = Math.abs(nr - goalRow);
      const diag = Math.min(dc, dr);
      const straight = Math.max(dc, dr) - diag;
      const h =
        straight * MIN_TERRAIN_COST + Math.trunc((diag * MIN_TERRAIN_COST * DIAGONAL_NUM) / DIAGONAL_DEN);
      heap.push(nb, ng + h);
    }
  }

  if (!found) return null;

  const cells: number[] = [];
  let cur = goalIndex;
  while (cur !== startIndex && cur !== -1) {
    cells.push(cur);
    cur = cache.cameFrom[cur];
  }
  if (cur === -1) return null;
  cells.reverse();

  const path: MapCoord[] = new Array(cells.length);
  const stepCosts: number[] = new Array(cells.length);
  let previous = startIndex;
  for (let i = 0; i < cells.length; i++) {
    const index = cells[i];
    const col = index % cols;
    const row = (index - col) / cols;
    const pcol = previous % cols;
    const prow = (previous - pcol) / cols;
    const diagonal = col !== pcol && row !== prow;
    const base = costs[index];
    stepCosts[i] = diagonal ? Math.trunc((base * DIAGONAL_NUM) / DIAGONAL_DEN) : base;
    path[i] = { col, row };
    previous = index;
  }
  return { path, costs: stepCosts };
}

/* ── API publique ───────────────────────────────────────────────────────── */

/**
 * Chemin d'un héros vers une case. Retourne `null` si la destination est
 * inatteignable. Le chemin **exclut** la case de départ ; `costs[i]` est le
 * coût en points de marche pour entrer dans `path[i]`.
 */
export function computePath(
  world: WorldMap,
  state: GameState,
  hero: HeroInstance,
  to: MapCoord,
): { path: MapCoord[]; costs: number[] } | null {
  if (to.col < 0 || to.row < 0 || to.col >= world.cols || to.row >= world.rows) return null;
  if (sameCoord(hero.at, to)) return { path: [], costs: [] };

  if (pathCacheRevision !== pathRevision) {
    pathCache.clear();
    pathCacheRevision = pathRevision;
  }
  const cacheKey = `${hero.uid}|${hero.at.col},${hero.at.row}|${to.col},${to.row}|${state.weather.current}`;
  if (pathCache.has(cacheKey)) {
    const hit = pathCache.get(cacheKey);
    return hit ? { path: hit.path.map((c) => ({ ...c })), costs: hit.costs.slice() } : null;
  }

  const result = computePathUncached(world, state, hero, to);
  pathCache.set(cacheKey, result);
  return result ? { path: result.path.map((c) => ({ ...c })), costs: result.costs.slice() } : null;
}

function computePathUncached(
  world: WorldMap,
  state: GameState,
  hero: HeroInstance,
  to: MapCoord,
): { path: MapCoord[]; costs: number[] } | null {
  const cache = cacheOf(state, world);
  const mods = safeEffects(state, hero);
  const costs = costTableFor(state, world, cache, mods);

  const startIndex = hero.at.row * world.cols + hero.at.col;
  const goalIndex = to.row * world.cols + to.col;

  if (costs[goalIndex] === 0) return null;
  if (cache.staticBlocked[goalIndex] === 1) {
    // On accepte la case d'entrée d'un objet, jamais le reste de son empreinte.
    const obj = objectAtCell(state, world, to);
    if (!obj || !sameCoord(obj.entrance, to)) return null;
  }

  const dynamicBlocked = new Set<number>();
  for (const uid of Object.keys(state.heroes)) {
    if (uid === hero.uid) continue;
    const other = state.heroes[uid];
    if (other.downUntilTurn > state.turn) continue;
    dynamicBlocked.add(other.at.row * world.cols + other.at.col);
  }

  const graph = cache.graph;
  const startBlock = blockOf(world, startIndex, graph);
  const goalBlock = blockOf(world, goalIndex, graph);

  // 1. Couloir hiérarchique.
  if (startBlock !== goalBlock) {
    const blocks = blockPath(graph, startBlock, goalBlock);
    if (blocks) {
      const stamp = ++cache.generation;
      buildCorridor(cache, graph, blocks, stamp);
      const restricted = search(world, cache, {
        startIndex,
        goalIndex,
        costs,
        dynamicBlocked,
        corridorStamp: stamp,
        maxExpansions: 120000,
      });
      if (restricted) return restricted;
    }
  }

  // 2. Repli : A* complet.
  return search(world, cache, {
    startIndex,
    goalIndex,
    costs,
    dynamicBlocked,
    corridorStamp: 0,
    maxExpansions: world.cols * world.rows,
  });
}

/**
 * Effets actifs du héros. Le module monde peut ne pas être branché pendant les
 * tests unitaires du noyau : dans ce cas, aucun modificateur de terrain.
 */
function safeEffects(state: GameState, hero: HeroInstance): SkillEffect[] {
  try {
    return worldModule().activeEffects(state, hero);
  } catch {
    return [];
  }
}

/**
 * Découpe un chemin en journées.
 *
 * Retourne, pour chaque pas, l'indice du jour où il sera effectué :
 * 0 = aujourd'hui, 1 = demain, etc. C'est ce tableau qui permet à l'interface
 * de planter un fanion de jour aux ruptures du chemin.
 */
export function pathDays(costs: number[], movementNow: number, movementMax: number): number[] {
  const out: number[] = new Array(costs.length);
  let day = 0;
  let left = Math.max(0, movementNow);
  const perDay = Math.max(1, movementMax);
  for (let i = 0; i < costs.length; i++) {
    const c = Math.max(0, costs[i]);
    if (c > left) {
      day++;
      left = perDay;
      // Un pas plus coûteux qu'une journée entière consomme la journée entière.
      if (c > left) left = c;
    }
    left -= c;
    out[i] = day;
  }
  return out;
}

/** Nombre de journées nécessaires pour parcourir un chemin. */
export function pathDayCount(costs: number[], movementNow: number, movementMax: number): number {
  if (costs.length === 0) return 0;
  const days = pathDays(costs, movementNow, movementMax);
  return days[days.length - 1] + 1;
}
