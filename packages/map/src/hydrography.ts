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
      c(51, 45),
      c(50, 42),
      c(49, 38),
      c(47, 34),
      c(45, 31),
      c(44, 27),
      c(42, 24),
      c(40, 22),
      c(37, 21),
      c(34, 20),
      c(29, 19),
      c(25, 19),
      c(20, 18),
      c(16, 17),
      c(12, 16),
      c(8, 15),
      c(4, 13),
      c(1, 12),
      c(0, 12),
    ],
  },
  {
    key: 'sagnes',
    label: 'le ruisseau des Sagnes',
    kind: 'ruisseau',
    depth: 34,
    valley: 5,
    points: [c(45, 50), c(46, 47), c(47, 44), c(48, 41), c(49, 38)],
  },
  {
    key: 'arconsat',
    label: "le ruisseau d'Arconsat",
    kind: 'ruisseau',
    depth: 40,
    valley: 6,
    points: [c(52, 12), c(50, 15), c(49, 18), c(46, 21), c(44, 23), c(42, 24)],
  },
  {
    key: 'palladuc',
    label: 'le ruisseau de Palladuc',
    kind: 'ruisseau',
    depth: 36,
    valley: 5,
    points: [c(26, 5), c(25, 9), c(25, 13), c(25, 16), c(25, 19)],
  },
  {
    key: 'combe_noire',
    label: 'le ruisseau de la Combe Noire',
    kind: 'ruisseau',
    depth: 38,
    valley: 5,
    points: [c(62, 41), c(58, 40), c(55, 40), c(53, 41), c(50, 42)],
  },
  {
    key: 'futaies',
    label: 'le ruisseau des Futaies',
    kind: 'ruisseau',
    depth: 44,
    valley: 7,
    points: [
      c(33, 65),
      c(30, 68),
      c(28, 71),
      c(26, 75),
      c(21, 76),
      c(15, 78),
      c(10, 80),
      c(4, 82),
      c(0, 84),
    ],
  },
  {
    key: 'faye',
    label: 'le ruisseau de la Faye',
    kind: 'ruisseau',
    depth: 30,
    valley: 4,
    points: [c(35, 80), c(31, 80), c(26, 78), c(23, 77), c(21, 76)],
  },
  {
    key: 'vollore',
    label: 'le ruisseau de Vollore',
    kind: 'ruisseau',
    depth: 42,
    valley: 6,
    points: [c(27, 118), c(22, 119), c(17, 122), c(11, 124), c(6, 126), c(0, 129)],
  },
  {
    key: 'pamole',
    label: 'le ruisseau de Pamole',
    kind: 'ruisseau',
    depth: 40,
    valley: 6,
    points: [c(37, 125), c(33, 128), c(27, 131), c(21, 133), c(15, 135), c(9, 138), c(0, 140)],
  },
  {
    key: 'credogne',
    label: 'la Credogne',
    kind: 'riviere',
    depth: 62,
    valley: 8,
    points: [
      c(56, 165),
      c(52, 162),
      c(47, 160),
      c(41, 158),
      c(34, 156),
      c(28, 154),
      c(22, 153),
      c(16, 151),
      c(10, 149),
      c(4, 147),
      c(0, 146),
    ],
  },
  {
    key: 'marche',
    label: 'le ruisseau de la Marche',
    kind: 'ruisseau',
    depth: 34,
    valley: 5,
    points: [c(60, 170), c(56, 174), c(53, 178), c(49, 182), c(48, 183)],
  },
  {
    key: 'anzon',
    label: "l'Anzon",
    kind: 'riviere',
    depth: 66,
    valley: 8,
    points: [
      c(86, 78),
      c(87, 83),
      c(90, 89),
      c(92, 96),
      c(94, 103),
      c(96, 111),
      c(98, 119),
      c(100, 129),
      c(102, 140),
      c(104, 151),
      c(106, 164),
      c(108, 176),
      c(109, 183),
    ],
  },
  {
    key: 'peyrotine',
    label: 'le ruisseau de la Peyrotine',
    kind: 'ruisseau',
    depth: 46,
    valley: 7,
    points: [
      c(58, 109),
      c(63, 113),
      c(68, 118),
      c(74, 124),
      c(80, 130),
      c(87, 134),
      c(93, 138),
      c(98, 139),
      c(102, 140),
    ],
  },
  {
    key: 'farges',
    label: 'le ruisseau des Farges',
    kind: 'ruisseau',
    depth: 44,
    valley: 6,
    points: [c(92, 49), c(95, 51), c(99, 54), c(104, 57), c(108, 61), c(111, 66), c(112, 69)],
  },
  {
    key: 'sagnes_hautes',
    label: 'le ruisseau des Hautes Sagnes',
    kind: 'ruisseau',
    depth: 36,
    valley: 5,
    points: [c(73, 27), c(78, 23), c(83, 19), c(88, 15), c(94, 12), c(99, 8), c(104, 4), c(108, 0)],
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
  { key: 'sagne_col', label: 'la Grande Sagne du col', at: c(44, 50), radius: 2 },
  { key: 'sagne_lac', label: 'la Sagne du Lac', at: c(51, 44), radius: 2 },
  { key: 'sagne_bois_noirs', label: 'la Sagne des Bois Noirs', at: c(66, 63), radius: 2 },
  { key: 'sagne_vouivre', label: 'la Sagne de la Vouivre', at: c(72, 73), radius: 2 },
  { key: 'sagne_tresor', label: 'la Sagne du Trésor', at: c(60, 56), radius: 2 },
  { key: 'sagne_peyrotine', label: 'la Sagne de la Peyrotine', at: c(59, 107), radius: 2 },
  { key: 'sagne_pamole', label: 'la Sagne de Pamole', at: c(39, 119), radius: 2 },
  { key: 'sagne_arconsat', label: "la Sagne haute d'Arconsat", at: c(57, 8), radius: 2 },
  { key: 'sagne_hermitage', label: "la Sagne de l'Hermitage", at: c(52, 105), radius: 2 },
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
  { key: 'pont_chabreloche', label: 'le Pont de Chabreloche', near: c(40, 22), kind: 'pont' },
  { key: 'gue_du_lac', label: 'le Gué du Lac', near: c(49, 41), kind: 'gue' },
  { key: 'gue_sagnes', label: 'le Gué des Sagnes', near: c(46, 46), kind: 'gue' },
  { key: 'pont_arconsat', label: "le Pont d'Arconsat", near: c(49, 16), kind: 'pont' },
  { key: 'gue_palladuc', label: 'le Gué de Palladuc', near: c(25, 15), kind: 'gue' },
  { key: 'pont_celles', label: 'le Pont de Celles', near: c(16, 17), kind: 'pont' },
  { key: 'gue_combe_noire', label: 'le Gué de la Combe Noire', near: c(55, 40), kind: 'gue' },
  { key: 'gue_futaies', label: 'le Gué des Futaies', near: c(26, 74), kind: 'gue' },
  { key: 'pont_viscomtat', label: 'le Pont de Viscomtat', near: c(21, 76), kind: 'pont' },
  { key: 'gue_faye', label: 'le Gué de la Faye', near: c(26, 78), kind: 'gue' },
  { key: 'gue_vollore', label: 'le Gué de Vollore', near: c(22, 119), kind: 'gue' },
  { key: 'gue_pamole', label: 'le Gué de Pamole', near: c(33, 128), kind: 'gue' },
  { key: 'pont_credogne', label: 'le Pont de la Credogne', near: c(47, 160), kind: 'pont' },
  { key: 'gue_marche', label: 'le Gué de la Marche', near: c(56, 174), kind: 'gue' },
  { key: 'pont_noiretable', label: "le Pont de l'Anzon", near: c(87, 83), kind: 'pont' },
  { key: 'gue_anzon', label: "le Gué de l'Anzon", near: c(94, 103), kind: 'gue' },
  { key: 'gue_peyrotine', label: 'le Gué de la Peyrotine', near: c(68, 118), kind: 'gue' },
  { key: 'pont_farges', label: 'le Pont des Farges', near: c(95, 51), kind: 'pont' },
  { key: 'gue_hautes_sagnes', label: 'le Gué des Hautes Sagnes', near: c(83, 19), kind: 'gue' },
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
