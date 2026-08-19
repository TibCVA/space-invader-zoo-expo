/**
 * Classification des biomes du Forez.
 *
 * Un biome se déduit de quatre grandeurs : **altitude**, **pente**,
 * **humidité** et **proximité de l'eau**.
 *
 *  - au-dessus de 1 000 m, sur pente forte, la roche affleure : **rocher** ;
 *  - les versants raides sont de la **pente** ;
 *  - les tourbières d'altitude et les fonds mal drainés sont **humides** ;
 *  - le manteau forestier couvre le massif : sapinière au-dessus de 950 m,
 *    hêtraie-sapinière entre 800 et 950 m, hêtraie en dessous ;
 *  - les fonds de vallée et les alentours des bourgs restent en **prairie**.
 *
 * Les voies tracées par `roads.ts` sont posées par-dessus : grande chaussée
 * (route) ou chemin. Une case d'eau empruntée par une voie garde son terrain
 * `eau` mais reçoit un pont, ce que le moteur lit comme franchissable au coût
 * d'un chemin.
 *
 * Invariant vérifié par les tests : `CELL_PASSABLE` est levé exactement sur
 * les cases dont le terrain n'est pas `eau`, plus les gués et les ponts.
 * Aucun passage visuellement ouvert n'est techniquement bloqué.
 */
import {
  CELL_BRIDGE,
  CELL_BUILDABLE,
  CELL_CACHE,
  CELL_EDGE,
  CELL_PASSABLE,
  CELL_ROAD,
} from '@auvergne/engine';
import { CELLS, COLS, NDC, NDR, ROWS, T, idx } from './grid.js';
import { buildHydrography } from './hydrography.js';
import { CANOPY_OCTAVES, MOISTURE_OCTAVES, fractalNoise } from './noise.js';
import { ROAD_MAJOR } from './roads.js';

/** Graine fixe des champs d'humidité et de couvert. */
const MOISTURE_SEED = 0x48756d69;
const CANOPY_SEED = 0x466f7265 ^ 0x5a5a5a5a;

/** Distance à l'eau au-delà de laquelle l'influence hydrique est nulle. */
export const WATER_INFLUENCE = 14;

export interface TerrainField {
  terrain: Uint8Array;
  flags: Uint16Array;
  /** Humidité relative, 0..200 (100 = moyenne). */
  moisture: Uint8Array;
  /** Distance de Tchebychev à l'eau la plus proche, plafonnée à 63. */
  distWater: Uint8Array;
}

/** Distance de Tchebychev à l'eau courante, plafonnée. */
export function distanceToWater(): Uint8Array {
  const hydro = buildHydrography();
  const dist = new Uint8Array(CELLS).fill(63);
  const queue = new Int32Array(CELLS);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < CELLS; i++) {
    if (hydro.water[i] === 1) {
      dist[i] = 0;
      queue[tail++] = i;
    }
  }
  while (head < tail) {
    const cur = queue[head++];
    const d = dist[cur];
    if (d >= 62) continue;
    const col = cur % COLS;
    const row = (cur / COLS) | 0;
    for (let k = 0; k < 8; k++) {
      const nc = col + NDC[k];
      const nr = row + NDR[k];
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const j = nr * COLS + nc;
      if (dist[j] <= d + 1) continue;
      dist[j] = d + 1;
      queue[tail++] = j;
    }
  }
  return dist;
}

/* ── Seuils ─────────────────────────────────────────────────────────────── */

/** Pente à partir de laquelle la roche affleure en altitude. */
const ROCK_SLOPE = 20;
/** Altitude à partir de laquelle une pente forte devient rocher. */
const ROCK_ALTITUDE = 950;
/** Pente qui devient rocher quelle que soit l'altitude (barre rocheuse). */
const CLIFF_SLOPE = 27;
/**
 * Pente au-delà de laquelle la barre devient **falaise**, infranchissable.
 *
 * Le rocher se traverse à 200 points ; la falaise ne se traverse pas, et c'est
 * toute la différence : sans terrain dur, la carte n'avait pas un seul point
 * d'articulation sur 105 349 cases praticables — une esplanade, là où HMM3
 * ferme ses zones par du relief et ne laisse que des cols gardés. Le seuil est
 * choisi sur la distribution mesurée des pentes (maximum 66, 0,37 % des cases
 * au-delà de 43) : à 38 il ne prend que les vrais escarpements — aiguilles,
 * gorges de la Durolle — sans jamais fermer un versant entier. Les voies
 * l'emportent toujours : une route tracée dans la gorge reste une route.
 */
const FALAISE_SLOPE = 38;
/** Pente à partir de laquelle une case est classée « forte pente ». */
const STEEP_SLOPE = 13;
/** Pente maximale d'un fond marécageux. */
const MARSH_SLOPE = 6;
/** Humidité au-delà de laquelle un fond plat devient zone humide. */
const MARSH_MOISTURE = 152;
/** Pente maximale d'une case constructible. */
const BUILDABLE_SLOPE = 10;

/** Classe les biomes et lève les drapeaux de case. */
export function classifyTerrain(
  elevation: Int16Array,
  slope: Uint8Array,
  road: Uint8Array,
  bridge: Uint8Array,
): TerrainField {
  const hydro = buildHydrography();
  const distWater = distanceToWater();
  const terrain = new Uint8Array(CELLS);
  const flags = new Uint16Array(CELLS);
  const moisture = new Uint8Array(CELLS);

  for (let row = 0; row < ROWS; row++) {
    const base = row * COLS;
    for (let col = 0; col < COLS; col++) {
      const i = base + col;
      const alt = elevation[i];
      const s = slope[i];

      /* Humidité : bruit lent, proximité de l'eau, platitude, altitude. */
      let wet = 100 + Math.trunc(fractalNoise(col, row, MOISTURE_SEED, MOISTURE_OCTAVES) / 2);
      const dw = distWater[i];
      if (dw < WATER_INFLUENCE) wet += (WATER_INFLUENCE - dw) * 4;
      if (s <= 4) wet += 14;
      else wet -= Math.min(40, s);
      if (alt > 1000) wet += 12;
      if (wet < 0) wet = 0;
      if (wet > 200) wet = 200;
      moisture[i] = wet;

      /* Biome. */
      let code: number;
      if (hydro.water[i] === 1) {
        code = T.eau;
      } else if (hydro.bog[i] === 1) {
        code = T.humide;
      } else if (s >= FALAISE_SLOPE) {
        code = T.falaise;
      } else if (s >= CLIFF_SLOPE || (s >= ROCK_SLOPE && alt >= ROCK_ALTITUDE)) {
        code = T.rocher;
      } else if (s >= STEEP_SLOPE) {
        code = T.pente;
      } else if (s <= MARSH_SLOPE && wet >= MARSH_MOISTURE) {
        code = T.humide;
      } else {
        let wood = Math.trunc(fractalNoise(col, row, CANOPY_SEED, CANOPY_OCTAVES) / 2);
        wood += Math.trunc((alt - 740) / 7);
        if (dw < 12) wood -= (12 - dw) * 5;
        if (s >= 18) wood -= 24;
        if (wet >= 140) wood -= 18;
        code = wood > 14 ? T.foret : T.prairie;
      }

      /* Voies : la chaussée et les chemins passent par-dessus le biome. */
      const r = road[i];
      if (r !== 0 && code !== T.eau) code = r === ROAD_MAJOR ? T.route : T.chemin;

      terrain[i] = code;

      /* Drapeaux. */
      let f = 0;
      const bridged = bridge[i] === 1 || (code === T.eau && hydro.crossing[i] === 1);
      if (code !== T.eau) f |= CELL_PASSABLE;
      if (bridged) f |= CELL_BRIDGE | CELL_PASSABLE;
      if (r !== 0) f |= CELL_ROAD;
      if (code === T.foret || code === T.rocher || code === T.humide) f |= CELL_CACHE;
      if (
        s <= BUILDABLE_SLOPE &&
        (code === T.prairie || code === T.foret) &&
        r === 0 &&
        dw >= 2
      ) {
        f |= CELL_BUILDABLE;
      }
      flags[i] = f;
    }
  }

  return { terrain, flags, moisture, distWater };
}

/** Marque les lisières : toute case dont un voisin orthogonal change de terrain. */
export function markEdges(terrain: Uint8Array, flags: Uint16Array): void {
  for (let row = 0; row < ROWS; row++) {
    const base = row * COLS;
    for (let col = 0; col < COLS; col++) {
      const i = base + col;
      const t = terrain[i];
      let edge = false;
      if (col > 0 && terrain[i - 1] !== t) edge = true;
      else if (col < COLS - 1 && terrain[i + 1] !== t) edge = true;
      else if (row > 0 && terrain[i - COLS] !== t) edge = true;
      else if (row < ROWS - 1 && terrain[i + COLS] !== t) edge = true;
      if (edge) flags[i] |= CELL_EDGE;
      else flags[i] &= ~CELL_EDGE;
    }
  }
}

export type ForestKind = 'sapiniere' | 'hetraie_sapiniere' | 'hetraie';

/** Nature du couvert forestier d'une case, pour le rendu et le codex. */
export function forestKindAt(elevation: Int16Array, col: number, row: number): ForestKind {
  const alt = elevation[idx(col, row)];
  if (alt >= 950) return 'sapiniere';
  if (alt >= 800) return 'hetraie_sapiniere';
  return 'hetraie';
}

/** Libellés français des couverts forestiers. */
export const FOREST_LABELS: Readonly<Record<ForestKind, string>> = {
  sapiniere: "sapinière d'altitude",
  hetraie_sapiniere: 'hêtraie-sapinière',
  hetraie: 'hêtraie',
};
