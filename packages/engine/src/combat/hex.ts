/**
 * Géométrie hexagonale du champ de bataille — 15 colonnes × 11 lignes.
 *
 * Convention : « odd-r offset », hexagones à sommet pointu (pointy-top),
 * les lignes impaires sont décalées d'un demi-hexagone vers la droite.
 *
 *   ligne 0 :  (0,0) (1,0) (2,0) …
 *   ligne 1 :    (0,1) (1,1) (2,1) …
 *
 * Toutes les fonctions sont pures et **entières** : aucun flottant n'intervient,
 * même dans la conversion pixel ↔ hexagone (approximations rationnelles).
 */

import { HEX_COLS, HEX_ROWS, type HexCoord } from '../types.js';

/* ─────────────────────────────── Directions ─────────────────────────────── */

/** Index de direction, sens horaire à partir de l'est. */
export type HexDirection = 0 | 1 | 2 | 3 | 4 | 5;

export const HEX_DIRECTION_COUNT = 6;

/** Noms français des six directions, indexés par `HexDirection`. */
export const HEX_DIRECTION_NAMES: readonly string[] = [
  'est',
  'nord-est',
  'nord-ouest',
  'ouest',
  'sud-ouest',
  'sud-est',
];

/** Décalages en coordonnées axiales (q, r) pour chaque direction. */
const AXIAL_DIRS: readonly (readonly [number, number])[] = [
  [1, 0], // 0 est
  [1, -1], // 1 nord-est
  [0, -1], // 2 nord-ouest
  [-1, 0], // 3 ouest
  [-1, 1], // 4 sud-ouest
  [0, 1], // 5 sud-est
];

/* ───────────────────────────── Coordonnées cube ─────────────────────────── */

export interface CubeCoord {
  x: number;
  y: number;
  z: number;
}

/** offset odd-r → cube. */
export function toCube(h: HexCoord): CubeCoord {
  const x = h.col - ((h.row - (h.row & 1)) >> 1);
  const z = h.row;
  return { x, y: -x - z, z };
}

/** cube → offset odd-r. */
export function fromCube(c: CubeCoord): HexCoord {
  return { col: c.x + ((c.z - (c.z & 1)) >> 1), row: c.z };
}

/** offset odd-r → axial (q, r). */
export function toAxial(h: HexCoord): { q: number; r: number } {
  return { q: h.col - ((h.row - (h.row & 1)) >> 1), r: h.row };
}

/** axial (q, r) → offset odd-r. */
export function fromAxial(q: number, r: number): HexCoord {
  return { col: q + ((r - (r & 1)) >> 1), row: r };
}

/* ─────────────────────────────── Primitives ─────────────────────────────── */

export function hex(col: number, row: number): HexCoord {
  return { col, row };
}

export function hexEquals(a: HexCoord, b: HexCoord): boolean {
  return a.col === b.col && a.row === b.row;
}

export function inBounds(h: HexCoord): boolean {
  return h.col >= 0 && h.col < HEX_COLS && h.row >= 0 && h.row < HEX_ROWS;
}

/** Index linéaire 0..164, utilisable comme clef de tableau dense. */
export function hexKey(h: HexCoord): number {
  return h.row * HEX_COLS + h.col;
}

export function keyToHex(key: number): HexCoord {
  return { col: key % HEX_COLS, row: (key / HEX_COLS) | 0 };
}

/** Le champ de bataille complet, ordre de lecture (ligne puis colonne). */
export function allHexes(): HexCoord[] {
  const out: HexCoord[] = [];
  for (let row = 0; row < HEX_ROWS; row++) {
    for (let col = 0; col < HEX_COLS; col++) out.push({ col, row });
  }
  return out;
}

export function clampHex(h: HexCoord): HexCoord {
  return {
    col: h.col < 0 ? 0 : h.col > HEX_COLS - 1 ? HEX_COLS - 1 : h.col,
    row: h.row < 0 ? 0 : h.row > HEX_ROWS - 1 ? HEX_ROWS - 1 : h.row,
  };
}

/* ───────────────────────────────── Voisins ──────────────────────────────── */

/** Voisin dans une direction donnée, éventuellement hors plateau. */
export function neighbor(h: HexCoord, dir: HexDirection): HexCoord {
  const a = toAxial(h);
  const d = AXIAL_DIRS[dir];
  return fromAxial(a.q + d[0], a.r + d[1]);
}

/** Les six voisins, y compris ceux qui sortent du plateau. */
export function allNeighbors(h: HexCoord): HexCoord[] {
  const out: HexCoord[] = [];
  for (let d = 0; d < 6; d++) out.push(neighbor(h, d as HexDirection));
  return out;
}

/** Les voisins situés sur le plateau. */
export function neighbors(h: HexCoord): HexCoord[] {
  const out: HexCoord[] = [];
  for (let d = 0; d < 6; d++) {
    const n = neighbor(h, d as HexDirection);
    if (inBounds(n)) out.push(n);
  }
  return out;
}

export function areAdjacent(a: HexCoord, b: HexCoord): boolean {
  return hexDistance(a, b) === 1;
}

/* ──────────────────────────────── Distance ──────────────────────────────── */

export function hexDistance(a: HexCoord, b: HexCoord): number {
  const ca = toCube(a);
  const cb = toCube(b);
  const dx = ca.x - cb.x;
  const dy = ca.y - cb.y;
  const dz = ca.z - cb.z;
  const ax = dx < 0 ? -dx : dx;
  const ay = dy < 0 ? -dy : dy;
  const az = dz < 0 ? -dz : dz;
  return (ax + ay + az) >> 1;
}

/* ──────────────────────────── Portée et couronnes ───────────────────────── */

/** Tous les hexagones du plateau à distance ≤ `range`, `center` inclus. */
export function hexesInRange(center: HexCoord, range: number): HexCoord[] {
  const out: HexCoord[] = [];
  if (range < 0) return out;
  const c = toCube(center);
  for (let dx = -range; dx <= range; dx++) {
    const lo = Math.max(-range, -dx - range);
    const hi = Math.min(range, -dx + range);
    for (let dy = lo; dy <= hi; dy++) {
      const dz = -dx - dy;
      const h = fromCube({ x: c.x + dx, y: c.y + dy, z: c.z + dz });
      if (inBounds(h)) out.push(h);
    }
  }
  out.sort((p, q) => (p.row - q.row) || (p.col - q.col));
  return out;
}

/** Couronne d'hexagones exactement à distance `radius`. */
export function hexRing(center: HexCoord, radius: number): HexCoord[] {
  if (radius <= 0) return inBounds(center) ? [center] : [];
  const out: HexCoord[] = [];
  let cur = center;
  for (let i = 0; i < radius; i++) cur = neighbor(cur, 4);
  for (let d = 0; d < 6; d++) {
    for (let i = 0; i < radius; i++) {
      if (inBounds(cur)) out.push(cur);
      cur = neighbor(cur, d as HexDirection);
    }
  }
  return out;
}

/* ─────────────────────────────── Ligne droite ───────────────────────────── */

/** Division entière arrondie au plus proche (b > 0), sûre pour a négatif. */
function roundDiv(a: number, b: number): number {
  const q = Math.floor(a / b);
  const r = a - q * b;
  return 2 * r >= b ? q + 1 : q;
}

/**
 * Arrondi cube à partir d'une fraction (num / den) par axe.
 * Purement entier : les écarts sont comparés sur les numérateurs.
 */
function cubeRoundFraction(nx: number, ny: number, nz: number, den: number): CubeCoord {
  let rx = roundDiv(nx, den);
  let ry = roundDiv(ny, den);
  let rz = roundDiv(nz, den);
  const dx = Math.abs(rx * den - nx);
  const dy = Math.abs(ry * den - ny);
  const dz = Math.abs(rz * den - nz);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { x: rx, y: ry, z: rz };
}

/**
 * Ligne d'hexagones de `a` à `b`, extrémités incluses.
 * Longueur = distance + 1. Utilisée pour la ligne de vue et le souffle.
 */
export function hexLine(a: HexCoord, b: HexCoord): HexCoord[] {
  const n = hexDistance(a, b);
  if (n === 0) return [{ col: a.col, row: a.row }];
  const ca = toCube(a);
  const cb = toCube(b);
  const out: HexCoord[] = [];
  for (let i = 0; i <= n; i++) {
    const nx = ca.x * (n - i) + cb.x * i;
    const ny = ca.y * (n - i) + cb.y * i;
    const nz = ca.z * (n - i) + cb.z * i;
    out.push(fromCube(cubeRoundFraction(nx, ny, nz, n)));
  }
  return out;
}

/**
 * Prolonge la ligne `from → through` sur `length` hexagones à partir de
 * `through` inclus (souffle de la Vouivre Couronnée).
 */
export function hexRay(from: HexCoord, through: HexCoord, length: number): HexCoord[] {
  const out: HexCoord[] = [];
  if (length <= 0) return out;
  const d = directionTo(from, through);
  let cur = through;
  for (let i = 0; i < length; i++) {
    if (!inBounds(cur)) break;
    out.push(cur);
    cur = neighbor(cur, d);
  }
  return out;
}

/* ─────────────────────────────── Orientation ────────────────────────────── */

/** Direction dominante de `a` vers `b` (par défaut l'est si `a === b`). */
export function directionTo(a: HexCoord, b: HexCoord): HexDirection {
  if (hexEquals(a, b)) return 0;
  const ca = toCube(a);
  const cb = toCube(b);
  const vx = cb.x - ca.x;
  const vy = cb.y - ca.y;
  const vz = cb.z - ca.z;
  let best: HexDirection = 0;
  let bestScore = -0x7fffffff;
  for (let d = 0; d < 6; d++) {
    const dir = AXIAL_DIRS[d];
    // vecteur direction en cube
    const dxx = dir[0];
    const dzz = dir[1];
    const dyy = -dxx - dzz;
    // produit scalaire cube : mesure de similarité entière
    const score = vx * dxx + vy * dyy + vz * dzz;
    if (score > bestScore) {
      bestScore = score;
      best = d as HexDirection;
    }
  }
  return best;
}

/** Écart angulaire (0 = même direction, 3 = opposée). */
export function directionDelta(a: HexDirection, b: HexDirection): number {
  const d = Math.abs(a - b) % 6;
  return d > 3 ? 6 - d : d;
}

export type AttackAngle = 'face' | 'flanc' | 'dos';

/**
 * Angle d'attaque subi par une unité orientée `facing` et frappée depuis `from`.
 * face : ±1 direction ; flanc : ±2 ; dos : direction opposée.
 */
export function attackAngle(targetAt: HexCoord, facing: number, from: HexCoord): AttackAngle {
  const incoming = directionTo(targetAt, from);
  const delta = directionDelta(((facing % 6) + 6) % 6 as HexDirection, incoming);
  if (delta <= 1) return 'face';
  if (delta === 2) return 'flanc';
  return 'dos';
}

/* ─────────────────────────── Conversion pixel ↔ hex ─────────────────────── */

/** √3 en fraction entière (7 décimales) : suffisant pour un rendu au pixel. */
const SQRT3_NUM = 17320508;
const SQRT3_DEN = 10000000;

/**
 * Centre en pixels d'un hexagone, `size` = rayon (centre → sommet), en pixels.
 * Repère : x vers l'est, y vers le sud, origine au centre de l'hexagone (0,0).
 */
export function hexToPixel(h: HexCoord, size: number): { x: number; y: number } {
  const odd = h.row & 1;
  const x = roundDiv(size * SQRT3_NUM * (2 * h.col + odd), 2 * SQRT3_DEN);
  const y = roundDiv(3 * size * h.row, 2);
  return { x, y };
}

/** Largeur / hauteur d'un hexagone et pas de grille, en pixels entiers. */
export function hexMetrics(size: number): {
  width: number;
  height: number;
  stepX: number;
  stepY: number;
  boardWidth: number;
  boardHeight: number;
} {
  const width = roundDiv(size * SQRT3_NUM, SQRT3_DEN);
  const height = 2 * size;
  const stepY = roundDiv(3 * size, 2);
  return {
    width,
    height,
    stepX: width,
    stepY,
    boardWidth: width * HEX_COLS + roundDiv(width, 2),
    boardHeight: stepY * (HEX_ROWS - 1) + height,
  };
}

/**
 * Hexagone contenant le point (x, y). Recherche exacte par comparaison de
 * distances entières entre le point et les centres candidats : aucun flottant,
 * aucune approximation d'arrondi cube.
 */
export function pixelToHex(x: number, y: number, size: number): HexCoord {
  const stepY = roundDiv(3 * size, 2);
  const approxRow = roundDiv(y, stepY);
  let best: HexCoord = { col: 0, row: 0 };
  let bestDist = Number.MAX_SAFE_INTEGER;
  for (let dr = -1; dr <= 1; dr++) {
    const row = approxRow + dr;
    const odd = ((row % 2) + 2) % 2;
    const width = roundDiv(size * SQRT3_NUM, SQRT3_DEN);
    const approxCol = roundDiv(2 * x - odd * width, 2 * width);
    for (let dc = -1; dc <= 1; dc++) {
      const cand: HexCoord = { col: approxCol + dc, row };
      const c = hexToPixel(cand, size);
      const ddx = c.x - x;
      const ddy = c.y - y;
      const dist = ddx * ddx + ddy * ddy;
      if (dist < bestDist) {
        bestDist = dist;
        best = cand;
      }
    }
  }
  return best;
}

/** Sommets d'un hexagone, en pixels entiers, pour le tracé du contour. */
export function hexCorners(h: HexCoord, size: number): { x: number; y: number }[] {
  const c = hexToPixel(h, size);
  const halfW = roundDiv(size * SQRT3_NUM, 2 * SQRT3_DEN);
  const halfH = roundDiv(size, 2);
  return [
    { x: c.x, y: c.y - size },
    { x: c.x + halfW, y: c.y - halfH },
    { x: c.x + halfW, y: c.y + halfH },
    { x: c.x, y: c.y + size },
    { x: c.x - halfW, y: c.y + halfH },
    { x: c.x - halfW, y: c.y - halfH },
  ];
}
