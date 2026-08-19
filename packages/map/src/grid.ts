/**
 * Primitives de grille partagées par tous les étages de la carte.
 *
 * Tout est entier et sans allocation par case : les champs sont des
 * `TypedArray` de longueur `COLS × ROWS`, indexés par `row * COLS + col`.
 */
import { MAP_COLS, MAP_ROWS, TERRAINS, type MapCoord } from '@auvergne/engine';

export const COLS = MAP_COLS;
export const ROWS = MAP_ROWS;
export const CELLS = COLS * ROWS;

/** Index des terrains dans `TERRAINS`, résolu une fois pour toutes. */
export const T = {
  route: TERRAINS.indexOf('route'),
  chemin: TERRAINS.indexOf('chemin'),
  prairie: TERRAINS.indexOf('prairie'),
  foret: TERRAINS.indexOf('foret'),
  pente: TERRAINS.indexOf('pente'),
  humide: TERRAINS.indexOf('humide'),
  rocher: TERRAINS.indexOf('rocher'),
  eau: TERRAINS.indexOf('eau'),
  falaise: TERRAINS.indexOf('falaise'),
} as const;

export function idx(col: number, row: number): number {
  return row * COLS + col;
}

export function inGrid(col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < COLS && row < ROWS;
}

/** Les huit voisins, dans l'ordre `facing` du moteur (0 = nord, sens horaire). */
export const NEIGHBOURS: readonly { dc: number; dr: number }[] = [
  { dc: 0, dr: -1 },
  { dc: 1, dr: -1 },
  { dc: 1, dr: 0 },
  { dc: 1, dr: 1 },
  { dc: 0, dr: 1 },
  { dc: -1, dr: 1 },
  { dc: -1, dr: 0 },
  { dc: -1, dr: -1 },
];

/** Décalages de colonne des huit voisins, pour les boucles chaudes. */
export const NDC = new Int8Array([0, 1, 1, 1, 0, -1, -1, -1]);
/** Décalages de ligne des huit voisins, pour les boucles chaudes. */
export const NDR = new Int8Array([-1, -1, 0, 1, 1, 1, 0, -1]);

/* ── Géométrie entière ──────────────────────────────────────────────────── */

/**
 * Tangentes × 10000 des angles entiers de 0° à 89°.
 * Table littérale : aucune dépendance à `Math.tan`, donc pente identique
 * partout, au bit près.
 */
const TAN_X10000: readonly number[] = [
  0, 175, 349, 524, 699, 875, 1051, 1228, 1405, 1584, 1763, 1944, 2126, 2309, 2493, 2679,
  2867, 3057, 3249, 3443, 3640, 3839, 4040, 4245, 4452, 4663, 4877, 5095, 5317, 5543, 5774,
  6009, 6249, 6494, 6745, 7002, 7265, 7536, 7813, 8098, 8391, 8693, 9004, 9325, 9657, 10000,
  10355, 10724, 11106, 11504, 11918, 12349, 12799, 13270, 13764, 14281, 14826, 15399, 16003,
  16643, 17321, 18040, 18807, 19626, 20503, 21445, 22460, 23559, 24751, 26051, 27475, 29042,
  30777, 32709, 34874, 37321, 40108, 43315, 47046, 51446, 56713, 63138, 71154, 81443, 95144,
  114301, 143007, 190811, 286363, 572900,
];

/**
 * Angle entier en degrés (0..90) d'une pente de `rise` mètres sur `run` mètres.
 * Recherche dichotomique dans la table des tangentes : purement entière.
 */
export function slopeDegrees(rise: number, run: number): number {
  if (run <= 0) return 90;
  const r = rise < 0 ? -rise : rise;
  const t = Math.trunc((r * 10000) / run);
  if (t >= TAN_X10000[89]) return 90;
  let lo = 0;
  let hi = 89;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (TAN_X10000[mid] <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** Racine carrée entière (méthode de Newton, jamais de flottant). */
export function isqrt(n: number): number {
  if (n <= 0) return 0;
  let x = n;
  let y = (x + 1) >> 1;
  while (y < x) {
    x = y;
    y = ((x + Math.trunc(n / x)) / 2) | 0;
  }
  return x;
}

/** Tracé de Bresenham entre deux cases, extrémités comprises. */
export function line(a: MapCoord, b: MapCoord): MapCoord[] {
  const out: MapCoord[] = [];
  let x = a.col;
  let y = a.row;
  const dx = Math.abs(b.col - x);
  const dy = -Math.abs(b.row - y);
  const sx = x < b.col ? 1 : -1;
  const sy = y < b.row ? 1 : -1;
  let err = dx + dy;
  for (let guard = 0; guard < COLS + ROWS + 8; guard++) {
    out.push({ col: x, row: y });
    if (x === b.col && y === b.row) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

/** Densification d'une polyligne de cases par tracés de Bresenham successifs. */
export function polyline(points: readonly MapCoord[]): MapCoord[] {
  const out: MapCoord[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const seg = line(points[i], points[i + 1]);
    for (let k = i === 0 ? 0 : 1; k < seg.length; k++) out.push(seg[k]);
  }
  if (out.length === 0 && points.length === 1) out.push({ col: points[0].col, row: points[0].row });
  return out;
}

/**
 * Distance au carré (en centièmes de case²) d'un point à un segment, en
 * arithmétique entière. Utilisée par les crêtes et les corridors.
 */
export function distToSegment2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return wx * wx + wy * wy;
  let t = wx * vx + wy * vy;
  if (t <= 0) return wx * wx + wy * wy;
  if (t >= len2) {
    const ex = px - bx;
    const ey = py - by;
    return ex * ex + ey * ey;
  }
  // projection : point le plus proche = a + (t / len2) · v, calculé en entiers.
  const qx = ax + Math.trunc((t * vx) / len2);
  const qy = ay + Math.trunc((t * vy) / len2);
  const dx = px - qx;
  const dy = py - qy;
  t = dx * dx + dy * dy;
  return t;
}

/* ── Tas binaire entier (A* et Dijkstra) ────────────────────────────────── */

/**
 * File de priorité minimale sur `Int32Array`, sans allocation pendant la
 * recherche. Les clefs sont des coûts entiers, les valeurs des index de case.
 */
export class IntHeap {
  private keys: Int32Array;
  private vals: Int32Array;
  private size = 0;

  constructor(capacity: number) {
    this.keys = new Int32Array(capacity);
    this.vals = new Int32Array(capacity);
  }

  get length(): number {
    return this.size;
  }

  clear(): void {
    this.size = 0;
  }

  push(key: number, value: number): void {
    if (this.size >= this.keys.length) this.grow();
    let i = this.size++;
    this.keys[i] = key;
    this.vals[i] = value;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.keys[parent] <= this.keys[i]) break;
      this.swap(parent, i);
      i = parent;
    }
  }

  /** Retire le minimum et retourne sa valeur, ou -1 si le tas est vide. */
  pop(): number {
    if (this.size === 0) return -1;
    const top = this.vals[0];
    this.size--;
    if (this.size > 0) {
      this.keys[0] = this.keys[this.size];
      this.vals[0] = this.vals[this.size];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
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
    const k = this.keys[a];
    this.keys[a] = this.keys[b];
    this.keys[b] = k;
    const v = this.vals[a];
    this.vals[a] = this.vals[b];
    this.vals[b] = v;
  }

  private grow(): void {
    const keys = new Int32Array(this.keys.length * 2);
    const vals = new Int32Array(this.vals.length * 2);
    keys.set(this.keys);
    vals.set(this.vals);
    this.keys = keys;
    this.vals = vals;
  }
}
