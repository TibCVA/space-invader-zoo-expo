/**
 * Réseau viaire du Forez.
 *
 * La **Grande Chaussée des Marchands** est la relecture médiévale du grand
 * corridor commercial qui traverse le pays (document maître §3.5, région 12) :
 * elle entre par le nord-ouest en venant de Thiers, dessert Chabreloche, monte
 * au hameau du Lac, franchit la ligne de partage des eaux à la **Maison du
 * Trésor** — d'où le poste de contrôle du sel —, redescend sur Noirétable puis
 * file plein sud vers la Marche de La Renaudie. Corridor rapide du nord au
 * sud, avec péages, ponts et postes de garde.
 *
 * Autour d'elle, vingt-cinq chemins relient tous les villages, les cols, les
 * sanctuaires et les bordures de l'emprise.
 *
 * Les tracés ne sont **pas** des lignes droites : chaque segment est calculé
 * par un A* dont le coût pénalise la pente au carré, le dénivelé franchi, les
 * tourbières et surtout les cours d'eau hors gué. Une chaussée suit donc les
 * pentes faibles, contourne les combes, et traverse l'eau là où un gué ou un
 * pont l'attend. Les cases d'eau effectivement empruntées reçoivent un pont.
 */
import type { MapCoord } from '@auvergne/engine';
import { anchorCell } from './anchors.js';
import { CELLS, COLS, IntHeap, NDC, NDR, ROWS, idx } from './grid.js';
import { buildHydrography } from './hydrography.js';

/** Valeur de `road` : aucune voie. */
export const ROAD_NONE = 0;
/** Valeur de `road` : chemin (coût 85). */
export const ROAD_PATH = 1;
/** Valeur de `road` : grande chaussée (coût 70). */
export const ROAD_MAJOR = 2;

export interface RoadDef {
  key: string;
  label: string;
  major: boolean;
  /** Points de passage imposés, dans l'ordre. */
  waypoints: readonly MapCoord[];
}

const c = (col: number, row: number): MapCoord => ({ col, row });
const A = anchorCell;

/* ── Itinéraires ────────────────────────────────────────────────────────── */

function roadDefs(): RoadDef[] {
  return [
    {
      key: 'grande_chaussee',
      label: 'la Grande Chaussée des Marchands',
      major: true,
      waypoints: [
        c(43, 0),
        A('chabreloche'),
        c(46, 33),
        A('le_lac'),
        c(56, 46),
        A('maison_tresor'),
        c(74, 61),
        c(83, 73),
        A('noiretable'),
        c(90, 101),
        c(87, 119),
        c(80, 135),
        c(72, 150),
        A('renaudie'),
        c(56, 183),
      ],
    },
    {
      key: 'chaussee_thiers',
      label: 'la branche de Thiers',
      major: true,
      waypoints: [A('chabreloche'), c(26, 18), c(13, 15), c(0, 12)],
    },
    {
      key: 'chaussee_cervieres',
      label: 'la chaussée du Fil d’Or',
      major: true,
      waypoints: [A('maison_tresor'), c(79, 51), A('cervieres'), c(104, 50), c(112, 48)],
    },
    {
      key: 'arconsat_chabreloche',
      label: "le chemin d'Arconsat à Chabreloche",
      major: false,
      waypoints: [A('arconsat'), c(46, 15), A('chabreloche')],
    },
    {
      key: 'arconsat_lac',
      label: 'le chemin des Hauts au Lac',
      major: false,
      waypoints: [A('arconsat'), c(54, 23), c(53, 34), A('le_lac')],
    },
    {
      key: 'arconsat_bois_noirs',
      label: "le chemin de crête d'Arconsat",
      major: false,
      waypoints: [A('arconsat'), c(60, 19), c(64, 34), c(67, 50), A('bois_noirs_est')],
    },
    {
      /* La D 324 / D 1 d'aujourd'hui : le vieux passage Forez-Auvergne à la
         limite des deux pays, par le col Saint-Thomas (930 m). Sur la carte,
         c'est le second lien du nord — d'Arconsat vers Cervières par les
         hauteurs — et son col est un poste gardé (lot 1.7). */
      key: 'route_forez_auvergne',
      label: 'la vieille route Forez-Auvergne',
      major: false,
      waypoints: [A('arconsat'), c(66, 12), A('col_st_thomas'), c(88, 31), A('cervieres')],
    },
    {
      key: 'lac_sagnes',
      label: 'le chemin du Col des Sagnes',
      major: false,
      waypoints: [A('le_lac'), c(46, 46), A('col_sagnes')],
    },
    {
      key: 'sagnes_tresor',
      label: 'le chemin des Sagnes à la Maison du Trésor',
      major: false,
      waypoints: [A('col_sagnes'), c(53, 52), A('maison_tresor')],
    },
    {
      key: 'tresor_chemin',
      label: 'le Chemin du Trésor',
      major: false,
      waypoints: [A('maison_tresor'), A('chemin_tresor'), c(70, 51)],
    },
    {
      key: 'tresor_bois_noirs',
      label: 'le sentier des Bois Noirs',
      major: false,
      waypoints: [A('maison_tresor'), c(66, 58), A('bois_noirs')],
    },
    {
      key: 'bois_noirs_noiretable',
      label: 'le sentier de la Vouivre',
      major: false,
      waypoints: [A('bois_noirs'), c(74, 76), c(82, 80), A('noiretable')],
    },
    {
      key: 'bois_noirs_cervieres',
      label: 'le sentier des Brumes',
      major: false,
      waypoints: [A('bois_noirs'), c(79, 62), c(87, 58), A('cervieres')],
    },
    {
      key: 'cervieres_noiretable',
      label: 'le chemin de Cervières à Noirétable',
      major: false,
      waypoints: [A('cervieres'), c(94, 67), A('noiretable')],
    },
    {
      key: 'cervieres_farges',
      label: 'le chemin des Farges',
      major: false,
      waypoints: [A('porte_farges'), c(98, 59), c(104, 67), c(110, 74)],
    },
    {
      key: 'chabreloche_viscomtat',
      label: 'le chemin de Chabreloche à Viscomtat',
      major: false,
      waypoints: [A('chabreloche'), c(35, 36), c(31, 54), A('viscomtat')],
    },
    {
      key: 'viscomtat_sagnes',
      label: 'le chemin des Hautes-Futaies',
      major: false,
      waypoints: [A('viscomtat'), c(34, 65), c(40, 58), A('col_sagnes')],
    },
    {
      key: 'viscomtat_ouest',
      label: 'le chemin de la Dore',
      major: false,
      waypoints: [A('viscomtat'), c(15, 74), c(0, 72)],
    },
    {
      key: 'viscomtat_vollore',
      label: 'le chemin de Viscomtat à Vollore',
      major: false,
      waypoints: [A('viscomtat'), c(23, 92), A('vollore')],
    },
    {
      key: 'vollore_pamole',
      label: 'le chemin de Pierre Pamole',
      major: false,
      waypoints: [A('vollore'), c(30, 119), A('pamole')],
    },
    {
      key: 'vollore_ouest',
      label: 'le chemin des carrières',
      major: false,
      waypoints: [A('vollore'), c(13, 114), c(0, 111)],
    },
    {
      key: 'pamole_hermitage',
      label: "le chemin de Pamole à l'Hermitage",
      major: false,
      waypoints: [A('pamole'), c(44, 119), A('hermitage')],
    },
    {
      key: 'hermitage_peyrotine',
      label: 'le chemin de dévotion',
      major: false,
      waypoints: [A('hermitage'), c(59, 107), A('peyrotine')],
    },
    {
      key: 'peyrotine_noiretable',
      label: 'le chemin de la Peyrotine',
      major: false,
      waypoints: [A('peyrotine'), c(73, 99), c(82, 92), A('noiretable')],
    },
    {
      key: 'hermitage_viscomtat',
      label: "le chemin de l'Hermitage aux Futaies",
      major: false,
      waypoints: [A('hermitage'), c(42, 104), c(32, 88), A('viscomtat')],
    },
    {
      key: 'hermitage_renaudie',
      label: "le chemin de l'Hermitage à La Renaudie",
      major: false,
      waypoints: [A('hermitage'), c(55, 133), c(56, 150), A('renaudie')],
    },
    {
      key: 'vollore_renaudie',
      label: 'le chemin de Vollore à La Renaudie',
      major: false,
      waypoints: [A('vollore'), c(32, 140), c(44, 157), A('renaudie')],
    },
    {
      key: 'renaudie_ouest',
      label: 'le chemin des moulins',
      major: false,
      waypoints: [A('renaudie'), c(42, 165), c(26, 162), c(0, 158)],
    },
    {
      key: 'renaudie_est',
      label: 'le chemin de la Marche',
      major: false,
      waypoints: [A('renaudie'), c(78, 165), c(94, 168), c(112, 171)],
    },
    {
      key: 'noiretable_sud_est',
      label: 'le chemin du Lignon',
      major: false,
      waypoints: [A('noiretable'), c(100, 95), c(109, 102), c(112, 108)],
    },
  ];
}

/* ── Champ viaire ───────────────────────────────────────────────────────── */

export interface RoadField {
  /** ROAD_NONE | ROAD_PATH | ROAD_MAJOR */
  road: Uint8Array;
  /** 1 si la case d'eau porte un pont (ou un gué emprunté par une voie). */
  bridge: Uint8Array;
  /** Tracé complet de la Grande Chaussée, du nord au sud. */
  chausseeCourse: MapCoord[];
  /** Tracé de chaque itinéraire, par clef. */
  courses: Map<string, MapCoord[]>;
}

/** Coût de base d'un pas, avant pénalités. */
const STEP_BASE = 100;
/** Minorant du coût d'un pas, pour l'heuristique du A*. */
const STEP_MIN = 52;
/** Coût d'un pas sur l'eau, hors franchissement aménagé. */
const WATER_COST = 5200;
/** Coût d'un pas sur un gué ou un pont. */
const CROSSING_COST = 260;
/** Marge du corridor de recherche, en cases. */
const CORRIDOR_MARGIN = 64;

interface Tracer {
  elevation: Int16Array;
  slope: Uint8Array;
  water: Uint8Array;
  crossing: Uint8Array;
  bog: Uint8Array;
  road: Uint8Array;
  gScore: Int32Array;
  cameFrom: Int32Array;
  stamp: Int32Array;
  closed: Int32Array;
  generation: number;
  heap: IntHeap;
}

function stepCost(t: Tracer, from: number, to: number, diagonal: boolean): number {
  let cost = STEP_BASE;
  const s = t.slope[to];
  cost += Math.trunc((s * s) / 2);
  const dh = t.elevation[to] - t.elevation[from];
  cost += (dh < 0 ? -dh : dh) * 11;
  if (t.water[to] === 1) cost += t.crossing[to] === 1 ? CROSSING_COST : WATER_COST;
  else if (t.bog[to] === 1) cost += 220;
  if (t.road[to] !== ROAD_NONE) cost = Math.trunc((cost * 55) / 100);
  if (diagonal) cost = Math.trunc((cost * 141) / 100);
  return cost < 1 ? 1 : cost;
}

function octile(ac: number, ar: number, bc: number, br: number): number {
  const dc = ac > bc ? ac - bc : bc - ac;
  const dr = ar > br ? ar - br : br - ar;
  const diag = dc < dr ? dc : dr;
  const straight = (dc > dr ? dc : dr) - diag;
  return straight * STEP_MIN + Math.trunc((diag * STEP_MIN * 141) / 100);
}

/**
 * A* entre deux cases, restreint à un corridor rectangulaire autour du segment
 * droit. Retourne le tracé (extrémités comprises) ou `null`.
 */
function trace(t: Tracer, from: MapCoord, to: MapCoord, margin: number): MapCoord[] | null {
  const start = idx(from.col, from.row);
  const goal = idx(to.col, to.row);
  if (start === goal) return [{ col: from.col, row: from.row }];

  const minCol = Math.max(0, Math.min(from.col, to.col) - margin);
  const maxCol = Math.min(COLS - 1, Math.max(from.col, to.col) + margin);
  const minRow = Math.max(0, Math.min(from.row, to.row) - margin);
  const maxRow = Math.min(ROWS - 1, Math.max(from.row, to.row) + margin);

  t.generation++;
  const gen = t.generation;
  t.heap.clear();
  t.gScore[start] = 0;
  t.cameFrom[start] = -1;
  t.stamp[start] = gen;
  t.heap.push(octile(from.col, from.row, to.col, to.row), start);

  let guard = 0;
  const maxExpansions = CELLS * 4;
  while (t.heap.length > 0 && guard++ < maxExpansions) {
    const current = t.heap.pop();
    if (current < 0) break;
    if (t.closed[current] === gen) continue;
    t.closed[current] = gen;
    if (current === goal) break;
    const col = current % COLS;
    const row = (current / COLS) | 0;
    const g = t.gScore[current];

    for (let d = 0; d < 8; d++) {
      const dc = NDC[d];
      const dr = NDR[d];
      const nc = col + dc;
      const nr = row + dr;
      if (nc < minCol || nr < minRow || nc > maxCol || nr > maxRow) continue;

      const next = nr * COLS + nc;
      if (t.closed[next] === gen) continue;
      const cost = g + stepCost(t, current, next, dc !== 0 && dr !== 0);
      if (t.stamp[next] === gen && t.gScore[next] <= cost) continue;
      t.stamp[next] = gen;
      t.gScore[next] = cost;
      t.cameFrom[next] = current;
      t.heap.push(cost + octile(nc, nr, to.col, to.row), next);
    }
  }

  if (t.stamp[goal] !== gen) return null;

  const out: MapCoord[] = [];
  let cursor = goal;
  let safety = 0;
  while (cursor >= 0 && safety++ < CELLS) {
    out.push({ col: cursor % COLS, row: (cursor / COLS) | 0 });
    if (cursor === start) break;
    cursor = t.cameFrom[cursor];
  }
  out.reverse();
  return out;
}

/** Trace le réseau viaire complet. */
export function buildRoads(elevation: Int16Array, slope: Uint8Array): RoadField {
  const hydro = buildHydrography();
  const road = new Uint8Array(CELLS);
  const bridge = new Uint8Array(CELLS);

  const t: Tracer = {
    elevation,
    slope,
    water: hydro.water,
    crossing: hydro.crossing,
    bog: hydro.bog,
    road,
    gScore: new Int32Array(CELLS),
    cameFrom: new Int32Array(CELLS),
    stamp: new Int32Array(CELLS),
    closed: new Int32Array(CELLS),
    generation: 0,
    heap: new IntHeap(1 << 15),
  };

  const courses = new Map<string, MapCoord[]>();
  let chausseeCourse: MapCoord[] = [];

  for (const def of roadDefs()) {
    const full: MapCoord[] = [];
    for (let k = 0; k + 1 < def.waypoints.length; k++) {
      const a = def.waypoints[k];
      const b = def.waypoints[k + 1];
      let seg = trace(t, a, b, CORRIDOR_MARGIN);
      if (!seg) seg = trace(t, a, b, COLS + ROWS);
      if (!seg) continue;
      for (let i = full.length === 0 ? 0 : 1; i < seg.length; i++) full.push(seg[i]);
    }
    if (full.length === 0) continue;

    const value = def.major ? ROAD_MAJOR : ROAD_PATH;
    for (const p of full) {
      const i = idx(p.col, p.row);
      if (road[i] < value) road[i] = value;
      if (hydro.water[i] === 1) bridge[i] = 1;
    }
    courses.set(def.key, full);
    if (def.key === 'grande_chaussee') chausseeCourse = full;
  }

  return { road, bridge, chausseeCourse, courses };
}

/** Liste des itinéraires, exposée pour l'interface et les tests. */
export const ROADS: readonly RoadDef[] = roadDefs();
