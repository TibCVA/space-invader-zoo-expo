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
export const WATER_INFLUENCE = 6;

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
const ROCK_SLOPE = 13;
/** Altitude à partir de laquelle une pente forte devient rocher. */
const ROCK_ALTITUDE = 950;
/** Pente qui devient rocher quelle que soit l'altitude (barre rocheuse). */
const CLIFF_SLOPE = 13;
/**
 * Pente au-delà de laquelle la barre devient **falaise**, infranchissable.
 *
 * Rocher et falaise sont désormais tous deux infranchissables ; ce qui les
 * sépare est visuel, et la distinction reste utile pour peindre une barre
 * blanche là où la roche est nue. Le seuil se lit sur la distribution mesurée
 * des pentes de NOTRE champ, une fois corrigé le facteur 2,27 qu'on trimballait
 * depuis le passage à la grille 113 × 184 : il prend les vrais escarpements —
 * aiguilles, gorges de la Durolle — sans fermer de versant entier. Les voies
 * l'emportent toujours : une route tracée dans la gorge reste une route.
 */
const FALAISE_SLOPE = 22;
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
const MOOR_MAX_SLOPE = 14;
/** Pente à partir de laquelle une case est classée « forte pente ». */
export const STEEP_SLOPE = 9;
/** Pente maximale d'un fond marécageux. */
const MARSH_SLOPE = 4;
/** Humidité au-delà de laquelle un fond plat devient zone humide. */
const MARSH_MOISTURE = 152;
/** Pente maximale d'une case constructible. */
const BUILDABLE_SLOPE = 7;

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
const BOG_MAX_SLOPE = 5;
/** Humidité exigée d'un replat d'altitude pour devenir tourbière. */
const BOG_MOISTURE = 132;

/** Seuil d'humidité au-delà duquel un fond plat devient zone humide. */
function seuilTourbiere(alt: number, slope: number): number {
  if (alt >= BOG_ALTITUDE && slope <= BOG_MAX_SLOPE) return BOG_MOISTURE;
  return MARSH_MOISTURE;
}

/**
 * Ce qui se franchit, et ce qui ferme.
 *
 * **Une seule fonction décide, et deux endroits la lisaient différemment.**
 * `build.ts` repasse sur toute la grille après l'aplanissement des emprises
 * pour que les drapeaux ne mentent pas sur le terrain — c'est nécessaire — mais
 * il réécrivait la règle au lieu de l'appeler. Les deux versions ont divergé :
 * la lande recevait son couvert ici et le perdait là-bas, si bien que les mille
 * cent quatre-vingt-trois cases de hautes-chaumes n'ont JAMAIS abrité un seul
 * objet, contrairement à ce que nos notes affirmaient.
 *
 * Le rocher ferme désormais, comme le « Rock » de HMM3 : c'est lui qui donne au
 * relief de quoi couper une zone, quand la falaise seule n'y suffisait pas. Un
 * col percé dans une barre n'est plus rendu en rocher franchissable mais en
 * forte pente — ce qu'est physiquement une brèche taillée dans un escarpement.
 */
export function franchissable(code: number): boolean {
  return code !== T.eau && code !== T.falaise && code !== T.rocher;
}

/**
 * Ce qui peut abriter quelque chose : le couvert des bois, les gouilles d'une
 * tourbière, et la lande — qui n'a pas d'arbre mais ses blocs erratiques, ses
 * murets de pierre sèche et ses cairns de berger.
 *
 * Le chaos rocheux en faisait partie ; il en sort avec le passage, puisqu'on ne
 * pose rien sur une case qu'on ne peut pas atteindre.
 */
export function couvre(code: number): boolean {
  return code === T.foret || code === T.humide || code === T.lande;
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
        if (dw < 5) wood -= (5 - dw) * 12;
        if (s >= 12) wood -= 24;
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
      if (franchissable(code)) f |= CELL_PASSABLE;
      if (bridged) f |= CELL_BRIDGE | CELL_PASSABLE;
      if (r !== 0) f |= CELL_ROAD;
      /* Ce qui peut abriter quelque chose : le couvert des bois, le chaos
         rocheux, les gouilles d'une tourbière — et la lande, qui n'a pas
         d'arbre mais ses blocs erratiques, ses murets de pierre sèche et ses
         cairns de berger. Sans elle, les sept pour cent de hautes-chaumes
         devenaient un désert d'objets et le glaneur perdait deux dixièmes de
         prise par journée de marche. */
      if (couvre(code)) f |= CELL_CACHE;
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

/**
 * Altitude au-dessous de laquelle on ne ferme aucune crête.
 *
 * La médiane du champ d'élévation est à 851 m, le neuvième décile à 993. Poser
 * la barre à 880 réserve la fermeture au tiers haut du pays : les plaines de
 * la Dore et les vallées habitées ne se referment jamais, et l'on ne mure que
 * là où le relief avait déjà commencé le travail.
 */
const CRETE_ALTITUDE = 880;

/**
 * Ferme les crêtes : les barres rocheuses brisées deviennent des murs continus.
 *
 * **Pourquoi cette passe existe.** Rendre le rocher infranchissable et
 * abaisser le seuil de pente avait fait monter les points d'articulation de
 * quatre à vingt-trois, puis à cent cinquante-huit — et pas un seul de ces
 * points ne détachait un morceau de carte de plus de vingt-cinq cases. Ce
 * n'étaient que des culs-de-sac, et un cul-de-sac ne se force pas : on n'y va
 * pas. Le balayage complet du seuil l'a montré sans appel : 0 vrai goulet à 13,
 * 7 à 11, 8 à 10, 7 à 9. Cela plafonne, et pour une raison de géométrie qu'on
 * ne corrige pas en semant plus de roche.
 *
 * La roche affleure là où la pente est forte, c'est-à-dire sur les FLANCS d'une
 * arête — jamais sur son fil, qui est justement le seul endroit plat. Le seuil
 * dessinait donc, de part et d'autre de chaque sommet, deux bandes brisées
 * séparées par une croupe restée marchable. On pouvait franchir toutes les
 * crêtes du Forez en marchant sur leur ligne de faîte.
 *
 * La passe comble ces brèches, et rien d'autre : une case ne se ferme que si
 * elle a de l'infranchissable **de part et d'autre**, sur l'une des quatre
 * paires de directions opposées. C'est une fermeture morphologique guidée par
 * la topologie du mur, pas un seuil de plus — elle n'ajoute pas de roche en
 * pleine plaine, elle achève celle qui est déjà là.
 *
 * Trois choses lui échappent toujours, et ce sont elles qui font les cols :
 * les voies, les ponts et les emprises bâties. Une route tracée dans la gorge
 * reste une route ; c'est ainsi que chaque mur se trouve percé exactement là
 * où l'on passe, et les postes de garde se calent déjà sur les transitions
 * d'anneau des voies. Ce que `desenclaver` rouvre ensuite, s'il reste une
 * poche scellée, est un col au sens propre.
 *
 * @param portee Distance à laquelle on cherche le mur de part et d'autre. À 1
 *   on ne comble que les brèches d'une case ; à 2, jusqu'à trois cases.
 * @returns Le nombre de cases fermées.
 */
export function fermerLesCretes(
  terrain: Uint8Array,
  flags: Uint16Array,
  elevation: Int16Array,
  portee = 2,
): number {
  /** Les quatre paires de directions opposées, en (dcol, drow). */
  const AXES: readonly (readonly [number, number])[] = [
    [1, 0],
    [0, 1],
    [1, 1],
    [1, -1],
  ];

  /* La lecture se fait sur une copie : sans elle, une case fermée servirait de
     mur à sa voisine dans la même passe et la fermeture se propagerait en
     travers du pays, dans l'ordre où l'on balaie la grille — c'est-à-dire ni
     déterministe au sens qui nous intéresse, ni géologique. */
  const avant = Uint8Array.from(terrain);
  const mur = (col: number, row: number): boolean => {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return true;
    return !franchissable(avant[row * COLS + col]);
  };

  let fermees = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const i = row * COLS + col;
      if (!franchissable(avant[i])) continue;
      if (elevation[i] < CRETE_ALTITUDE) continue;
      /* Ce qui fait le col : on ne mure ni une voie, ni un pont, ni une
         emprise dégagée pour bâtir. */
      if ((flags[i] & (CELL_ROAD | CELL_BRIDGE | CELL_BUILDABLE)) !== 0) continue;
      if (avant[i] === T.route || avant[i] === T.chemin || avant[i] === T.eau) continue;

      let ferme = false;
      for (const [dc, dr] of AXES) {
        let avantMur = false;
        let arriereMur = false;
        for (let k = 1; k <= portee; k++) {
          if (!avantMur && mur(col + dc * k, row + dr * k)) avantMur = true;
          if (!arriereMur && mur(col - dc * k, row - dr * k)) arriereMur = true;
        }
        if (avantMur && arriereMur) {
          ferme = true;
          break;
        }
      }
      if (!ferme) continue;

      terrain[i] = T.rocher;
      flags[i] &= ~(CELL_PASSABLE | CELL_BUILDABLE | CELL_CACHE);
      fermees++;
    }
  }
  return fermees;
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
