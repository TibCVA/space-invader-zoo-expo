/**
 * Champ d'altitude du Forez.
 *
 * Quatre étages, dans cet ordre :
 *
 *  1. **interpolation par distance inverse pondérée** (Shepard, puissance 2)
 *     sur les altitudes connues : les treize cotes du brief plus une
 *     soixantaine de cotes secondaires qui tiennent les fonds de vallée, les
 *     bordures d'emprise et les épaulements du massif ;
 *  2. **crêtes** : la ligne de partage des eaux entre la Durolle, qui descend
 *     au nord-ouest, et le bassin du Lignon au sud-est, plus quatre crêtes
 *     secondaires (Pamole, Cervières, Arconsat, Futaies) ;
 *  3. **creusement des vallées** le long de l'hydrographie, en U, avec une
 *     profondeur et une largeur propres à chaque cours d'eau ;
 *  4. **rugosité fractale à quatre octaves**, de 4,6 km à 240 m.
 *
 * Les cotes des ancrages sont enfin **rétablies exactement** : `elevationAt`
 * rend 700 m à Arconsat, 1 165 m à Pierre Pamole, 1 200 m au sommet des Bois
 * Noirs, etc.
 *
 * Tout est entier, sans `Math.random` ni fonction transcendante : le champ est
 * identique au bit près sur toutes les machines.
 */
import { FOREZ_ANCHORS } from './anchors.js';
import { CELLS, COLS, ROWS, distToSegment2, idx, isqrt, slopeDegrees } from './grid.js';
import { SAGNES, buildHydrography } from './hydrography.js';
import { RELIEF_OCTAVES, fractalNoise } from './noise.js';
import { CELL_SIZE_M } from './projection.js';

/** Altitude minimale admise sur l'emprise, en mètres. */
export const MIN_ALTITUDE = 460;
/** Altitude maximale admise sur l'emprise, en mètres. */
export const MAX_ALTITUDE = 1265;

/** Graine fixe de la rugosité : le relief ne dépend pas de la graine de partie. */
const RELIEF_SEED = 0x466f7265;

interface Spot {
  col: number;
  row: number;
  alt: number;
}

/**
 * Cotes secondaires.
 *
 * Elles ne prétendent pas au relevé topographique : ce sont les points de
 * contrôle qui donnent au champ interpolé la forme réelle du massif — vallée
 * de la Durolle descendant vers Thiers au nord-ouest, épaule des Bois Noirs au
 * centre-est, dépression de Viscomtat à l'ouest, plateau de Noirétable au
 * sud-est, hautes terres de Vollore et Pamole au sud-ouest.
 */
const SECONDARY_SPOTS: readonly Spot[] = [
  // Vallée de la Durolle et versant nord-ouest.
  { col: 16, row: 17, alt: 620 },
  { col: 3, row: 12, alt: 560 },
  { col: 0, row: 9, alt: 600 },
  { col: 0, row: 20, alt: 660 },
  { col: 9, row: 27, alt: 720 },
  { col: 23, row: 4, alt: 730 },
  { col: 31, row: 9, alt: 820 },
  { col: 33, row: 27, alt: 800 },
  { col: 26, row: 35, alt: 780 },
  { col: 18, row: 40, alt: 720 },
  { col: 9, row: 49, alt: 680 },
  { col: 0, row: 40, alt: 640 },
  { col: 0, row: 58, alt: 620 },
  // Bordure nord et crête sommitale.
  { col: 52, row: 0, alt: 900 },
  { col: 62, row: 9, alt: 1000 },
  { col: 71, row: 4, alt: 1060 },
  { col: 79, row: 13, alt: 1090 },
  { col: 88, row: 9, alt: 980 },
  { col: 97, row: 4, alt: 900 },
  { col: 112, row: 4, alt: 850 },
  { col: 106, row: 27, alt: 880 },
  { col: 112, row: 35, alt: 820 },
  // Cœur des Bois Noirs.
  { col: 71, row: 35, alt: 1090 },
  { col: 75, row: 49, alt: 1120 },
  { col: 66, row: 53, alt: 1080 },
  { col: 62, row: 66, alt: 1080 },
  { col: 75, row: 75, alt: 1120 },
  { col: 66, row: 80, alt: 1040 },
  { col: 82, row: 66, alt: 1000 },
  // Versant de la Loire, Cervières et Noirétable.
  { col: 102, row: 40, alt: 900 },
  { col: 106, row: 53, alt: 840 },
  { col: 112, row: 58, alt: 800 },
  { col: 102, row: 66, alt: 880 },
  { col: 110, row: 80, alt: 860 },
  { col: 111, row: 98, alt: 720 },
  { col: 112, row: 111, alt: 800 },
  // Dépression de Viscomtat et bordure ouest.
  { col: 13, row: 66, alt: 640 },
  { col: 0, row: 75, alt: 600 },
  { col: 9, row: 88, alt: 660 },
  { col: 18, row: 93, alt: 720 },
  { col: 33, row: 84, alt: 780 },
  { col: 40, row: 75, alt: 860 },
  { col: 44, row: 66, alt: 940 },
  // Centre-sud.
  { col: 49, row: 88, alt: 940 },
  { col: 57, row: 84, alt: 1000 },
  { col: 44, row: 102, alt: 960 },
  { col: 66, row: 93, alt: 1000 },
  { col: 75, row: 102, alt: 1000 },
  { col: 84, row: 106, alt: 900 },
  { col: 93, row: 111, alt: 880 },
  // Sud-est.
  { col: 102, row: 124, alt: 900 },
  { col: 111, row: 125, alt: 900 },
  { col: 112, row: 142, alt: 840 },
  { col: 106, row: 159, alt: 800 },
  { col: 112, row: 177, alt: 780 },
  { col: 95, row: 142, alt: 880 },
  { col: 88, row: 133, alt: 940 },
  // Sud-ouest, hautes terres de Vollore.
  { col: 13, row: 111, alt: 700 },
  { col: 0, row: 106, alt: 660 },
  { col: 9, row: 133, alt: 720 },
  { col: 0, row: 137, alt: 680 },
  { col: 18, row: 142, alt: 760 },
  { col: 26, row: 133, alt: 860 },
  { col: 44, row: 133, alt: 900 },
  { col: 31, row: 146, alt: 800 },
  { col: 0, row: 168, alt: 640 },
  { col: 13, row: 172, alt: 700 },
  { col: 26, row: 177, alt: 740 },
  // Marche de La Renaudie et bordure sud.
  { col: 44, row: 155, alt: 800 },
  { col: 53, row: 146, alt: 880 },
  { col: 66, row: 150, alt: 880 },
  { col: 75, row: 133, alt: 920 },
  { col: 49, row: 177, alt: 760 },
  { col: 58, row: 181, alt: 760 },
  { col: 71, row: 172, alt: 800 },
  { col: 84, row: 177, alt: 820 },
  { col: 112, row: 183, alt: 780 },
  { col: 0, row: 183, alt: 640 },
];

/** Toutes les cotes : ancrages du brief d'abord, cotes secondaires ensuite. */
function allSpots(): Spot[] {
  const out: Spot[] = [];
  for (const a of FOREZ_ANCHORS) out.push({ col: a.col, row: a.row, alt: a.alt });
  for (const s of SECONDARY_SPOTS) out.push(s);
  return out;
}

/* ── Crêtes ─────────────────────────────────────────────────────────────── */

interface RidgeNode {
  col: number;
  row: number;
  /** Rehaussement au faîte, en mètres — une grandeur du terrain, pas de la grille. */
  amp: number;
  /**
   * Demi-largeur d'influence, **en cases**.
   *
   * Donc une grandeur de la grille : elle a suivi le passage à la taille d'une
   * XL de HMM3. Une crête large de treize cases sur une carte de 113 aurait
   * couvert le quart de la largeur du pays au lieu du vingtième, et la ligne
   * de partage des eaux aurait cessé d'être une ligne.
   */
  width: number;
}

interface RidgeDef {
  key: string;
  label: string;
  nodes: readonly RidgeNode[];
}

/**
 * Les crêtes, pour qui veut leur GÉOMÉTRIE et non leur relief.
 *
 * `barrieres.ts` mure le fil de ces mêmes lignes : la barrière et le
 * rehaussement du terrain doivent suivre exactement la même polyligne, sans
 * quoi le mur ne serait pas sur la crête et l'on se retrouverait avec un
 * rempart en travers d'un versant. Une seule source, donc, et c'est celle-ci.
 */
export interface LigneDeCrete {
  key: string;
  label: string;
  nodes: readonly { col: number; row: number }[];
}

const r = (col: number, row: number, amp: number, width: number): RidgeNode => ({
  col,
  row,
  amp,
  width,
});

/**
 * Crêtes du massif.
 *
 * La première est la **ligne de partage des eaux** : tout ce qui tombe à
 * l'ouest rejoint la Durolle et file au nord-ouest, tout ce qui tombe à l'est
 * descend vers le Lignon par l'Anzon. Elle passe juste à l'ouest de la Maison
 * du Trésor — ce qui explique qu'un poste de contrôle du sel se soit installé
 * là, à la limite de deux pays de gabelle.
 */
const RIDGES: readonly RidgeDef[] = [
  {
    key: 'partage',
    label: 'la ligne de partage des eaux',
    nodes: [
      r(66, 0, 45, 6),
      r(64, 18, 52, 6),
      r(62, 32, 54, 5),
      r(58, 42, 48, 5),
      r(56, 50, 42, 4),
      r(62, 58, 52, 5),
      r(68, 67, 64, 6),
      r(70, 77, 58, 5),
      r(66, 88, 50, 5),
      r(61, 100, 46, 5),
      r(55, 111, 52, 5),
      r(49, 119, 44, 4),
      r(44, 126, 38, 4),
      r(48, 137, 34, 4),
      r(53, 150, 32, 4),
      r(58, 167, 28, 4),
      r(62, 183, 26, 4),
    ],
  },
  {
    key: 'pamole',
    label: 'la crête de Pamole',
    nodes: [r(26, 111, 34, 4), r(31, 117, 44, 4), r(35, 122, 56, 5), r(41, 129, 38, 4)],
  },
  {
    key: 'cervieres',
    label: 'la crête de Cervières',
    nodes: [r(82, 62, 34, 4), r(90, 57, 38, 4), r(98, 53, 30, 4), r(106, 51, 22, 4)],
  },
  {
    key: 'arconsat',
    label: "la crête d'Arconsat",
    nodes: [r(44, 4, 26, 4), r(52, 11, 34, 4), r(56, 20, 30, 4), r(59, 31, 28, 4)],
  },
  {
    key: 'futaies',
    label: 'la crête des Hautes-Futaies',
    nodes: [r(33, 62, 30, 4), r(36, 73, 28, 4), r(34, 86, 24, 4)],
  },
];

/** Les crêtes du massif, telles que les mure `barrieres.ts`. */
export const LIGNES_DE_CRETE: readonly LigneDeCrete[] = RIDGES.map((ridge) => ({
  key: ridge.key,
  label: ridge.label,
  nodes: ridge.nodes.map((node) => ({ col: node.col, row: node.row })),
}));

/* ── Construction ───────────────────────────────────────────────────────── */

export interface ElevationField {
  elevation: Int16Array;
  slope: Uint8Array;
}

/** Numérateur du poids IDW : `w = IDW_NUM / (d² + IDW_SOFT)`, puissance 2. */
const IDW_NUM = 1 << 22;
const IDW_SOFT = 8;

function interpolate(elevation: Int16Array): void {
  const spots = allSpots();
  const n = spots.length;
  const sc = new Int32Array(n);
  const sr = new Int32Array(n);
  const sa = new Int32Array(n);
  for (let k = 0; k < n; k++) {
    sc[k] = spots[k].col;
    sr[k] = spots[k].row;
    sa[k] = spots[k].alt;
  }

  for (let row = 0; row < ROWS; row++) {
    const base = row * COLS;
    for (let col = 0; col < COLS; col++) {
      let wsum = 0;
      let vsum = 0;
      for (let k = 0; k < n; k++) {
        const dc = sc[k] - col;
        const dr = sr[k] - row;
        const w = IDW_NUM / (dc * dc + dr * dr + IDW_SOFT);
        wsum += w;
        vsum += w * sa[k];
      }
      elevation[base + col] = Math.trunc(vsum / wsum);
    }
  }
}

function addRidges(elevation: Int16Array): void {
  for (const ridge of RIDGES) {
    const nodes = ridge.nodes;
    for (let s = 0; s + 1 < nodes.length; s++) {
      const a = nodes[s];
      const b = nodes[s + 1];
      const width = Math.max(a.width, b.width);
      const minCol = Math.max(0, Math.min(a.col, b.col) - width);
      const maxCol = Math.min(COLS - 1, Math.max(a.col, b.col) + width);
      const minRow = Math.max(0, Math.min(a.row, b.row) - width);
      const maxRow = Math.min(ROWS - 1, Math.max(a.row, b.row) + width);
      const seg2 = (b.col - a.col) * (b.col - a.col) + (b.row - a.row) * (b.row - a.row);
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const d2 = distToSegment2(col, row, a.col, a.row, b.col, b.row);
          const w2 = width * width;
          if (d2 >= w2) continue;
          // Interpolation linéaire de l'amplitude le long du segment.
          let amp = a.amp;
          if (seg2 > 0) {
            const t = (col - a.col) * (b.col - a.col) + (row - a.row) * (b.row - a.row);
            const tc = t < 0 ? 0 : t > seg2 ? seg2 : t;
            amp = a.amp + Math.trunc(((b.amp - a.amp) * tc) / seg2);
          }
          const falloff = w2 - d2;
          const bonus = Math.trunc((amp * falloff * falloff) / (w2 * w2));
          if (bonus <= 0) continue;
          const i = idx(col, row);
          elevation[i] = elevation[i] + bonus;
        }
      }
    }
  }
}

function carveValleys(elevation: Int16Array): void {
  const hydro = buildHydrography();
  const carve = new Int16Array(CELLS);

  for (let i = 0; i < CELLS; i++) {
    if (hydro.water[i] !== 1) continue;
    const depth = hydro.depth[i];
    const rad = hydro.valley[i];
    if (rad <= 0) continue;
    const col = i % COLS;
    const row = (i / COLS) | 0;
    const r2 = rad * rad;
    const minCol = Math.max(0, col - rad);
    const maxCol = Math.min(COLS - 1, col + rad);
    const minRow = Math.max(0, row - rad);
    const maxRow = Math.min(ROWS - 1, row + rad);
    for (let rr = minRow; rr <= maxRow; rr++) {
      const drr = rr - row;
      for (let cc = minCol; cc <= maxCol; cc++) {
        const dcc = cc - col;
        const d2 = dcc * dcc + drr * drr;
        if (d2 > r2) continue;
        const amount = Math.trunc((depth * (r2 - d2)) / r2);
        const j = rr * COLS + cc;
        if (amount > carve[j]) carve[j] = amount;
      }
    }
  }

  for (let i = 0; i < CELLS; i++) {
    if (carve[i] > 0) elevation[i] = elevation[i] - carve[i];
  }
}

function addRoughness(elevation: Int16Array): void {
  const hydro = buildHydrography();
  for (let row = 0; row < ROWS; row++) {
    const base = row * COLS;
    for (let col = 0; col < COLS; col++) {
      const i = base + col;
      if (hydro.bog[i] === 1) {
        // Une tourbière est plate : rugosité fortement atténuée.
        elevation[i] = elevation[i] + Math.trunc(fractalNoise(col, row, RELIEF_SEED, RELIEF_OCTAVES) / 6);
        continue;
      }
      elevation[i] = elevation[i] + fractalNoise(col, row, RELIEF_SEED, RELIEF_OCTAVES);
    }
  }
}

/** Largeur du raccord entre la cuvette d'une sagne et le versant, en cases. */
/**
 * Raccord d'une sagne à son versant, en cases — donc à l'échelle de la grille.
 * Il valait 4 quand la carte faisait 256 × 416.
 */
const BOG_APRON = 2;

/**
 * Cases portant un ancrage, pour que les passes tardives ne les défassent pas.
 *
 * `pinAnchors` promet la cote exacte de chaque lieu nommé, et trois passes
 * tournaient après lui sans le savoir. Mesuré : la Sagne du Lac, une fois
 * ramenée à l'échelle, tombait à deux cases du hameau du Lac et l'aplatissait
 * avec elle — 859 m au lieu des 900 relevés. Un marais se forme autour d'un
 * lieu habité, il ne l'avale pas.
 */
let anchorCellsCache: Set<number> | null = null;
function anchorCells(): Set<number> {
  if (!anchorCellsCache) {
    anchorCellsCache = new Set<number>();
    for (const a of FOREZ_ANCHORS) anchorCellsCache.add(idx(a.col, a.row));
  }
  return anchorCellsCache;
}

/**
 * Creuse les sagnes en cuvettes plates.
 *
 * Une tourbière d'altitude n'est pas un versant : c'est un replat mal drainé.
 * Chaque sagne reçoit donc un niveau unique — la cote de l'ancrage qui s'y
 * trouve s'il y en a un, la moyenne locale sinon — puis un raccord progressif
 * sur quatre cases vers le relief environnant.
 */
function flattenBogs(elevation: Int16Array): void {
  const fixes = anchorCells();
  for (const bog of SAGNES) {
    const radius = bog.radius;
    let level = 0;
    let pinnedLevel = -1;
    for (const a of FOREZ_ANCHORS) {
      const dc = a.col - bog.at.col;
      const dr = a.row - bog.at.row;
      if (dc * dc + dr * dr <= radius * radius) pinnedLevel = a.alt;
    }
    if (pinnedLevel >= 0) {
      level = pinnedLevel;
    } else {
      let sum = 0;
      let count = 0;
      for (let dr = -radius; dr <= radius; dr++) {
        for (let dc = -radius; dc <= radius; dc++) {
          if (dc * dc + dr * dr > radius * radius) continue;
          const col = bog.at.col + dc;
          const row = bog.at.row + dr;
          if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
          sum += elevation[row * COLS + col];
          count++;
        }
      }
      level = count === 0 ? 0 : Math.trunc(sum / count);
    }

    const outer = radius + BOG_APRON;
    for (let dr = -outer; dr <= outer; dr++) {
      for (let dc = -outer; dc <= outer; dc++) {
        const d2 = dc * dc + dr * dr;
        if (d2 > outer * outer) continue;
        const col = bog.at.col + dc;
        const row = bog.at.row + dr;
        if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
        const i = row * COLS + col;
        if (fixes.has(i)) continue;
        const d = isqrt(d2);
        if (d <= radius) {
          elevation[i] = level;
        } else {
          const t = d - radius;
          elevation[i] = level + Math.trunc(((elevation[i] - level) * t) / (BOG_APRON + 1));
        }
      }
    }
  }
}

/**
 * Un cours d'eau ne remonte jamais : altitude non croissante de l'amont vers
 * l'aval.
 *
 * La passe est répétée : deux cours qui confluent partagent des cases, et
 * abaisser un confluent peut créer une remontée en aval du cours principal. Le
 * traitement ne fait qu'abaisser, il converge donc en quelques itérations.
 */
function enforceDownhill(elevation: Int16Array): void {
  const hydro = buildHydrography();
  const fixes = anchorCells();
  for (let pass = 0; pass < 8; pass++) {
    let changed = false;
    for (const course of hydro.courses) {
      if (course.length === 0) continue;
      let previous = elevation[idx(course[0].col, course[0].row)];
      for (let k = 1; k < course.length; k++) {
        const i = idx(course[k].col, course[k].row);
        if (fixes.has(i)) {
          previous = elevation[i];
          continue;
        }
        if (elevation[i] > previous) {
          elevation[i] = previous;
          changed = true;
        }
        previous = elevation[i];
      }
    }
    if (!changed) break;
  }
}

/**
 * Rayon de raccord du rétablissement des cotes d'ancrage, en cases.
 *
 * Il valait 3 sur une case de 48 m, soit 144 m de raccord. Laissé tel quel sur
 * une case de 109 m, il étalait 327 m de terrain rigoureusement plat autour de
 * chaque lieu nommé : le Col des Sagnes présentait cinq cases à 990 m avant de
 * consentir à descendre, et n'était plus une selle mais une esplanade.
 */
const PIN_RADIUS = 1;

function pinAnchors(elevation: Int16Array): void {
  for (const a of FOREZ_ANCHORS) {
    for (let dr = -PIN_RADIUS; dr <= PIN_RADIUS; dr++) {
      for (let dc = -PIN_RADIUS; dc <= PIN_RADIUS; dc++) {
        const col = a.col + dc;
        const row = a.row + dr;
        if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
        const d = Math.max(Math.abs(dc), Math.abs(dr));
        const weight = PIN_RADIUS + 1 - d;
        const i = idx(col, row);
        const delta = a.alt - elevation[i];
        elevation[i] = elevation[i] + Math.trunc((delta * weight) / (PIN_RADIUS + 1));
      }
    }
  }
  // Seconde passe : deux ancrages voisins se raccordent l'un sur l'autre, la
  // cote exacte est donc rétablie en dernier sur la case même de l'ancrage.
  for (const a of FOREZ_ANCHORS) elevation[idx(a.col, a.row)] = a.alt;
}

function clampField(elevation: Int16Array): void {
  for (let i = 0; i < CELLS; i++) {
    const h = elevation[i];
    if (h < MIN_ALTITUDE) elevation[i] = MIN_ALTITUDE;
    else if (h > MAX_ALTITUDE) elevation[i] = MAX_ALTITUDE;
  }
}

/**
 * Pente en degrés entiers (0..90), calculée par différences centrées sur
 * 96 mètres (deux cases) et convertie sans trigonométrie flottante.
 */
/**
 * Longueur au sol séparant les deux cases comparées par le gradient, en mètres.
 *
 * Le gradient est pris entre la case ouest et la case est : deux cases d'écart,
 * donc deux largeurs de case. Cette longueur était écrite en dur à 96 — deux
 * fois les 48 m d'alors — et ne suivait pas `CELL_SIZE_M`. À la taille d'une XL
 * de HMM3 la case vaut 109 m : toutes les pentes étaient surestimées d'un
 * facteur 2,27, la carte passait à 23 % de versants raides et 7 % de rochers
 * contre 12 % et 2,4 % pour le même relief.
 */
const SPAN_M = 2 * CELL_SIZE_M;

export function computeSlope(elevation: Int16Array): Uint8Array {
  const slope = new Uint8Array(CELLS);
  for (let row = 0; row < ROWS; row++) {
    const base = row * COLS;
    const up = row > 0 ? base - COLS : base;
    const down = row < ROWS - 1 ? base + COLS : base;
    for (let col = 0; col < COLS; col++) {
      const west = col > 0 ? col - 1 : col;
      const east = col < COLS - 1 ? col + 1 : col;
      const gx = elevation[base + east] - elevation[base + west];
      const gy = elevation[down + col] - elevation[up + col];
      const g = isqrt(gx * gx + gy * gy);
      slope[base + col] = slopeDegrees(g, SPAN_M);
    }
  }
  return slope;
}

let cached: ElevationField | null = null;

/** Construit (et met en cache) le champ d'altitude et de pente. */
export function buildElevation(): ElevationField {
  if (cached) return cached;
  const elevation = new Int16Array(CELLS);
  interpolate(elevation);
  addRidges(elevation);
  carveValleys(elevation);
  addRoughness(elevation);
  pinAnchors(elevation);
  clampField(elevation);
  flattenBogs(elevation);
  enforceDownhill(elevation);
  cached = { elevation, slope: computeSlope(elevation) };
  return cached;
}

/** Réinitialise le cache. Réservé aux tests. */
export function resetElevationCache(): void {
  cached = null;
}
