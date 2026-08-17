/**
 * Hydrographie du Forez.
 *
 * La **Durolle** naît sur le flanc ouest des Bois Noirs, entre le hameau du Lac
 * et le Col des Sagnes, puis coule vers le **nord-ouest** en traversant
 * Chabreloche avant de quitter l'emprise par la vallée de Celles-sur-Durolle et
 * de Saint-Rémy-sur-Durolle (document maître §3.4). C'est le seul cours d'eau
 * important du versant nord-ouest ; tout ce qui naît à l'est de la ligne de
 * partage descend au contraire vers le bassin du Lignon par l'**Anzon**, qui
 * prend sa source près de Noirétable. Le sud-ouest est drainé par la
 * **Credogne**, née sur la Marche de La Renaudie.
 *
 * Les tracés sont des polylignes de cases, figées et indépendantes du relief :
 * c'est au contraire le relief qui est creusé le long d'elles
 * (`elevation.ts`). Aucun cours d'eau n'est tiré au sort — la géographie ne
 * change jamais d'une partie à l'autre (document maître §4).
 *
 * Les **sagnes** sont les tourbières d'altitude du massif : terrain humide,
 * coûteux mais franchissable. Les **gués et ponts** sont les seuls points de
 * traversée : ils sont posés sur les axes nommés, puis complétés
 * automatiquement tous les douze cases pour qu'aucune vallée ne coupe la carte
 * en deux.
 */
import type { MapCoord } from '@auvergne/engine';
import { CELLS, COLS, ROWS, idx, inGrid, polyline } from './grid.js';

export interface RiverDef {
  key: string;
  label: string;
  kind: 'riviere' | 'ruisseau';
  /** Profondeur d'entaille de la vallée, en mètres. */
  depth: number;
  /** Demi-largeur de la vallée creusée, en cases. */
  valley: number;
  /** Polyligne amont → aval, en cases. */
  points: readonly MapCoord[];
}

const c = (col: number, row: number): MapCoord => ({ col, row });

/* ── Réseau ─────────────────────────────────────────────────────────────── */

export const RIVERS: readonly RiverDef[] = [
  {
    key: 'durolle',
    label: 'la Durolle',
    kind: 'riviere',
    depth: 78,
    valley: 9,
    points: [
      c(116, 101),
      c(114, 94),
      c(111, 86),
      c(107, 78),
      c(103, 70),
      c(99, 62),
      c(95, 55),
      c(91, 50),
      c(84, 47),
      c(76, 45),
      c(66, 44),
      c(56, 42),
      c(46, 41),
      c(36, 39),
      c(28, 36),
      c(19, 33),
      c(10, 30),
      c(2, 27),
      c(0, 26),
    ],
  },
  {
    key: 'sagnes',
    label: 'le ruisseau des Sagnes',
    kind: 'ruisseau',
    depth: 34,
    valley: 5,
    points: [c(103, 112), c(105, 106), c(107, 99), c(109, 93), c(111, 86)],
  },
  {
    key: 'arconsat',
    label: "le ruisseau d'Arconsat",
    kind: 'ruisseau',
    depth: 40,
    valley: 6,
    points: [c(118, 28), c(114, 34), c(110, 41), c(104, 47), c(99, 52), c(95, 55)],
  },
  {
    key: 'palladuc',
    label: 'le ruisseau de Palladuc',
    kind: 'ruisseau',
    depth: 36,
    valley: 5,
    points: [c(58, 12), c(57, 20), c(56, 29), c(56, 36), c(56, 42)],
  },
  {
    key: 'combe_noire',
    label: 'le ruisseau de la Combe Noire',
    kind: 'ruisseau',
    depth: 38,
    valley: 5,
    points: [c(140, 92), c(132, 90), c(124, 90), c(119, 92), c(114, 94)],
  },
  {
    key: 'futaies',
    label: 'le ruisseau des Futaies',
    kind: 'ruisseau',
    depth: 44,
    valley: 7,
    points: [
      c(74, 146),
      c(68, 153),
      c(63, 161),
      c(58, 169),
      c(48, 172),
      c(34, 176),
      c(22, 181),
      c(10, 186),
      c(0, 190),
    ],
  },
  {
    key: 'faye',
    label: 'le ruisseau de la Faye',
    kind: 'ruisseau',
    depth: 30,
    valley: 4,
    points: [c(80, 182), c(70, 180), c(60, 177), c(52, 174), c(48, 172)],
  },
  {
    key: 'vollore',
    label: 'le ruisseau de Vollore',
    kind: 'ruisseau',
    depth: 42,
    valley: 6,
    points: [c(62, 266), c(50, 270), c(38, 275), c(26, 280), c(14, 286), c(0, 292)],
  },
  {
    key: 'pamole',
    label: 'le ruisseau de Pamole',
    kind: 'ruisseau',
    depth: 40,
    valley: 6,
    points: [c(84, 282), c(74, 290), c(62, 296), c(48, 301), c(34, 306), c(20, 311), c(0, 317)],
  },
  {
    key: 'credogne',
    label: 'la Credogne',
    kind: 'riviere',
    depth: 62,
    valley: 8,
    points: [
      c(128, 372),
      c(118, 366),
      c(106, 361),
      c(92, 357),
      c(78, 353),
      c(64, 349),
      c(50, 345),
      c(36, 341),
      c(22, 337),
      c(8, 333),
      c(0, 331),
    ],
  },
  {
    key: 'marche',
    label: 'le ruisseau de la Marche',
    kind: 'ruisseau',
    depth: 34,
    valley: 5,
    points: [c(135, 384), c(128, 393), c(119, 402), c(110, 412), c(108, 415)],
  },
  {
    key: 'anzon',
    label: "l'Anzon",
    kind: 'riviere',
    depth: 66,
    valley: 8,
    points: [
      c(194, 176),
      c(198, 188),
      c(203, 201),
      c(208, 216),
      c(213, 232),
      c(217, 250),
      c(221, 270),
      c(226, 292),
      c(231, 316),
      c(236, 342),
      c(241, 370),
      c(245, 398),
      c(248, 415),
    ],
  },
  {
    key: 'peyrotine',
    label: 'le ruisseau de la Peyrotine',
    kind: 'ruisseau',
    depth: 46,
    valley: 7,
    points: [
      c(132, 246),
      c(142, 256),
      c(154, 267),
      c(168, 280),
      c(182, 293),
      c(196, 304),
      c(210, 311),
      c(222, 315),
      c(231, 316),
    ],
  },
  {
    key: 'farges',
    label: 'le ruisseau des Farges',
    kind: 'ruisseau',
    depth: 44,
    valley: 6,
    points: [c(208, 110), c(216, 115), c(225, 121), c(235, 129), c(244, 139), c(252, 150), c(255, 156)],
  },
  {
    key: 'sagnes_hautes',
    label: 'le ruisseau des Hautes Sagnes',
    kind: 'ruisseau',
    depth: 36,
    valley: 5,
    points: [c(166, 60), c(176, 52), c(188, 44), c(200, 35), c(212, 26), c(224, 17), c(236, 8), c(244, 0)],
  },
];

/* ── Sagnes d'altitude ──────────────────────────────────────────────────── */

export interface BogDef {
  key: string;
  label: string;
  at: MapCoord;
  radius: number;
}

export const SAGNES: readonly BogDef[] = [
  { key: 'sagne_col', label: 'la Grande Sagne du col', at: c(100, 113), radius: 5 },
  { key: 'sagne_lac', label: 'la Sagne du Lac', at: c(116, 100), radius: 3 },
  { key: 'sagne_bois_noirs', label: 'la Sagne des Bois Noirs', at: c(150, 142), radius: 4 },
  { key: 'sagne_vouivre', label: 'la Sagne de la Vouivre', at: c(162, 166), radius: 3 },
  { key: 'sagne_tresor', label: 'la Sagne du Trésor', at: c(137, 126), radius: 3 },
  { key: 'sagne_peyrotine', label: 'la Sagne de la Peyrotine', at: c(134, 241), radius: 3 },
  { key: 'sagne_pamole', label: 'la Sagne de Pamole', at: c(88, 269), radius: 3 },
  { key: 'sagne_arconsat', label: "la Sagne haute d'Arconsat", at: c(129, 17), radius: 3 },
  { key: 'sagne_hermitage', label: "la Sagne de l'Hermitage", at: c(118, 238), radius: 3 },
];

/* ── Franchissements ────────────────────────────────────────────────────── */

export interface CrossingDef {
  key: string;
  label: string;
  /** Point indicatif : le franchissement est posé sur la case d'eau la plus proche. */
  near: MapCoord;
  kind: 'gue' | 'pont';
}

export const CROSSINGS: readonly CrossingDef[] = [
  { key: 'pont_chabreloche', label: 'le Pont de Chabreloche', near: c(91, 50), kind: 'pont' },
  { key: 'gue_du_lac', label: 'le Gué du Lac', near: c(110, 93), kind: 'gue' },
  { key: 'gue_sagnes', label: 'le Gué des Sagnes', near: c(105, 103), kind: 'gue' },
  { key: 'pont_arconsat', label: "le Pont d'Arconsat", near: c(112, 37), kind: 'pont' },
  { key: 'gue_palladuc', label: 'le Gué de Palladuc', near: c(56, 33), kind: 'gue' },
  { key: 'pont_celles', label: 'le Pont de Celles', near: c(36, 39), kind: 'pont' },
  { key: 'gue_combe_noire', label: 'le Gué de la Combe Noire', near: c(124, 90), kind: 'gue' },
  { key: 'gue_futaies', label: 'le Gué des Futaies', near: c(59, 168), kind: 'gue' },
  { key: 'pont_viscomtat', label: 'le Pont de Viscomtat', near: c(48, 172), kind: 'pont' },
  { key: 'gue_faye', label: 'le Gué de la Faye', near: c(60, 177), kind: 'gue' },
  { key: 'gue_vollore', label: 'le Gué de Vollore', near: c(50, 270), kind: 'gue' },
  { key: 'gue_pamole', label: 'le Gué de Pamole', near: c(74, 290), kind: 'gue' },
  { key: 'pont_credogne', label: 'le Pont de la Credogne', near: c(106, 361), kind: 'pont' },
  { key: 'gue_marche', label: 'le Gué de la Marche', near: c(128, 393), kind: 'gue' },
  { key: 'pont_noiretable', label: "le Pont de l'Anzon", near: c(198, 188), kind: 'pont' },
  { key: 'gue_anzon', label: "le Gué de l'Anzon", near: c(213, 232), kind: 'gue' },
  { key: 'gue_peyrotine', label: 'le Gué de la Peyrotine', near: c(154, 267), kind: 'gue' },
  { key: 'pont_farges', label: 'le Pont des Farges', near: c(216, 115), kind: 'pont' },
  { key: 'gue_hautes_sagnes', label: 'le Gué des Hautes Sagnes', near: c(188, 44), kind: 'gue' },
];

/** Un franchissement automatique toutes les douze cases de cours d'eau. */
const AUTO_FORD_SPACING = 12;

/* ── Champ hydrographique ───────────────────────────────────────────────── */

export interface Hydrography {
  /** 1 si la case porte de l'eau courante. */
  water: Uint8Array;
  /** Profondeur d'entaille de la vallée associée à la case d'eau, en mètres. */
  depth: Uint8Array;
  /** Demi-largeur de la vallée associée, en cases. */
  valley: Uint8Array;
  /** 1 si la case est une sagne (tourbière d'altitude). */
  bog: Uint8Array;
  /** 1 si la case d'eau est franchissable (gué ou pont). */
  crossing: Uint8Array;
  /** Tracés densifiés, amont → aval, dans l'ordre de `RIVERS`. */
  courses: MapCoord[][];
  /** Franchissements nommés effectivement posés. */
  placed: { key: string; label: string; at: MapCoord; kind: 'gue' | 'pont' }[];
}

let cached: Hydrography | null = null;

/** Construit (et met en cache) le champ hydrographique. Purement géométrique. */
export function buildHydrography(): Hydrography {
  if (cached) return cached;

  const water = new Uint8Array(CELLS);
  const depth = new Uint8Array(CELLS);
  const valley = new Uint8Array(CELLS);
  const bog = new Uint8Array(CELLS);
  const crossing = new Uint8Array(CELLS);
  const courses: MapCoord[][] = [];

  for (const river of RIVERS) {
    const cells = polyline(river.points).filter((p) => inGrid(p.col, p.row));
    courses.push(cells);
    for (const p of cells) {
      const i = idx(p.col, p.row);
      water[i] = 1;
      if (river.depth > depth[i]) depth[i] = river.depth;
      if (river.valley > valley[i]) valley[i] = river.valley;
    }
  }

  for (const s of SAGNES) {
    const r = s.radius;
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (dc * dc + dr * dr > r * r) continue;
        const col = s.at.col + dc;
        const row = s.at.row + dr;
        if (!inGrid(col, row)) continue;
        bog[idx(col, row)] = 1;
      }
    }
  }

  // Franchissements automatiques : le long de chaque cours, tous les
  // AUTO_FORD_SPACING pas, en évitant les deux extrémités.
  for (const cells of courses) {
    for (let k = 4; k < cells.length - 3; k += AUTO_FORD_SPACING) {
      const p = cells[k];
      crossing[idx(p.col, p.row)] = 1;
    }
  }

  // Franchissements nommés : posés sur la case d'eau la plus proche du point
  // indicatif, dans un rayon de six cases.
  const placed: Hydrography['placed'] = [];
  for (const def of CROSSINGS) {
    const at = nearestWater(water, def.near, 6);
    if (!at) continue;
    crossing[idx(at.col, at.row)] = 1;
    // Un pont est plus large qu'un gué : les cases d'eau adjacentes le long du
    // cours sont ouvertes elles aussi, pour ne jamais laisser un pont borgne.
    if (def.kind === 'pont') {
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const col = at.col + dc;
          const row = at.row + dr;
          if (!inGrid(col, row)) continue;
          const j = idx(col, row);
          if (water[j] === 1) crossing[j] = 1;
        }
      }
    }
    placed.push({ key: def.key, label: def.label, at, kind: def.kind });
  }

  cached = { water, depth, valley, bog, crossing, courses, placed };
  return cached;
}

function nearestWater(water: Uint8Array, from: MapCoord, radius: number): MapCoord | null {
  let best: MapCoord | null = null;
  let bestD = Number.MAX_SAFE_INTEGER;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const col = from.col + dc;
      const row = from.row + dr;
      if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
      if (water[idx(col, row)] !== 1) continue;
      const d = dc * dc + dr * dr;
      if (d < bestD) {
        bestD = d;
        best = { col, row };
      }
    }
  }
  return best;
}

/** Réinitialise le cache. Réservé aux tests. */
export function resetHydrographyCache(): void {
  cached = null;
}
