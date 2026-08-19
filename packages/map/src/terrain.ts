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
/**
 * Altitude où l'arbre renonce : au-dessus, les hautes-chaumes.
 *
 * Le Forez porte sur ses crêtes une lande rase de callune et de myrtille,
 * sans un arbre debout. Le seuil se lit sur l'hypsométrie DE NOTRE MODÈLE,
 * pas sur les mètres du monde réel : le champ d'élévation va de 474 à
 * 1 263 m — médiane 851, neuvième décile 993 — là où Pierre-sur-Haute
 * culmine réellement à 1 634. Poser la limite aux 1 150 m réels ne prenait
 * que 0,2 % des cases, un liseré invisible. À mille mètres, on prend les
 * neuf pour cent les plus hauts, ce qui est bien la part des hautes-chaumes
 * dans le massif — et ce sont les bonnes cases : les crêtes des Bois Noirs,
 * l'Hermitage, Pamole.
 *
 * C'est aussi ce qui casse un duopole mesuré : prairie et forêt couvraient
 * 82 % de la carte, si bien qu'un versant ressemblait à tous les autres et
 * qu'aucune région ne se reconnaissait à sa matière.
 */
const MOOR_ALTITUDE = 1000;
/** Pente au-delà de laquelle la chaume cède la place à la roche. */
const MOOR_MAX_SLOPE = 20;
/** Pente à partir de laquelle une case est classée « forte pente ». */
const STEEP_SLOPE = 13;
/** Pente maximale d'un fond marécageux. */
const MARSH_SLOPE = 6;
/** Humidité au-delà de laquelle un fond plat devient zone humide. */
const MARSH_MOISTURE = 152;
/** Pente maximale d'une case constructible. */
const BUILDABLE_SLOPE = 10;

/**
 * Altitude à partir de laquelle l'eau ne s'en va plus : les tourbières.
 *
 * Une sagne est une tourbière — le mot le dit — et elles se forment sur les
 * replats mal drainés des hauteurs, là où la pluie stagne sur un socle
 * imperméable. Le seuil d'humidité y baisse donc : ce qui serait une prairie
 * à six cents mètres est une tourbière à mille. Sans cette règle, la région
 * du Lac des Sagnes n'avait pas plus d'eau au sol que les futaies de
 * Viscomtat, et son nom ne voulait rien dire.
 */
const BOG_ALTITUDE = 900;
/** Pente au-delà de laquelle l'eau s'écoule, même en altitude. */
const BOG_MAX_SLOPE = 8;
/** Humidité exigée d'un replat d'altitude pour devenir tourbière. */
const BOG_MOISTURE = 132;

/** Seuil d'humidité au-delà duquel un fond plat devient zone humide. */
function seuilTourbiere(alt: number, slope: number): number {
  if (alt >= BOG_ALTITUDE && slope <= BOG_MAX_SLOPE) return BOG_MOISTURE;
  return MARSH_MOISTURE;
}

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
      } else if (alt >= MOOR_ALTITUDE && s < MOOR_MAX_SLOPE) {
        /* Les hautes-chaumes : au-dessus de la limite de l'arbre, ce qui
           n'est ni roche ni tourbière est de la lande rase. Elle passe AVANT
           la forte pente parce qu'une croupe de crête à quinze degrés est une
           chaume, pas un versant boisé. */
        code = T.lande;
      } else if (s >= STEEP_SLOPE) {
        code = T.pente;
      } else if (s <= MARSH_SLOPE && wet >= seuilTourbiere(alt, s)) {
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
      /* Ce qui peut abriter quelque chose : le couvert des bois, le chaos
         rocheux, les gouilles d'une tourbière — et la lande, qui n'a pas
         d'arbre mais ses blocs erratiques, ses murets de pierre sèche et ses
         cairns de berger. Sans elle, les sept pour cent de hautes-chaumes
         devenaient un désert d'objets et le glaneur perdait deux dixièmes de
         prise par journée de marche. */
      if (code === T.foret || code === T.rocher || code === T.humide || code === T.lande) {
        f |= CELL_CACHE;
      }
      /* On bâtit sur l'herbe, sous le couvert — et sur la chaume : les
         hautes-chaumes du Forez portent les jasseries, ces burons d'estive
         où l'on montait faire la fourme tout l'été. Les en exclure retirait
         soixante-six lieux à la carte et faisait tomber le glaneur sous sa
         cible, pour un pays qui a toujours été habité l'été. */
      if (
        s <= BUILDABLE_SLOPE &&
        (code === T.prairie || code === T.foret || code === T.lande) &&
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
