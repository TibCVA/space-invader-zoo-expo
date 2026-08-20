/**
 * Les barrières de crête : ce qui donne un front à la carte.
 *
 * **Le constat qui a rendu ce fichier nécessaire.** On a longtemps cru que le
 * relief fermerait les zones tout seul, en jouant sur les seuils de pente. Il
 * n'en fait rien. La roche affleure là où la pente est forte, donc sur les
 * FLANCS d'une arête, jamais sur son fil — qui est le seul endroit plat. Un
 * seuil de pente dessine ainsi, de part et d'autre de chaque sommet, deux
 * bandes brisées séparées par une croupe restée marchable : on franchissait
 * toutes les crêtes du Forez en marchant sur leur ligne de faîte. Le balayage
 * complet le dit sans appel — zéro vrai goulet au seuil de roche 13, sept à 11,
 * huit à 10, sept à 9, pendant que le compte brut d'articulations monte de
 * vingt-trois à cent cinquante-huit, c'est-à-dire pendant qu'on ne fabrique que
 * des culs-de-sac. Combler les brèches par morphologie ne suffit pas davantage :
 * la roche est trop clairsemée au milieu des quatorze mille cases hautes et
 * marchables, et la passe ferme cent trente-quatre cases sans produire un seul
 * goulet.
 *
 * **Ce que fait ce module.** Il mure le fil des crêtes, explicitement, en
 * suivant les polylignes qui servent déjà à les soulever dans `elevation.ts` —
 * une seule source pour le relief et pour le rempart, sans quoi le mur se
 * retrouverait en travers d'un versant.
 *
 * **L'ordre est le cœur de l'affaire.** Le masque se calcule à partir de la
 * seule élévation, donc AVANT le tracé des routes, et il est remis à
 * `buildRoads` comme une pénalité. Les montagnes existent d'abord ; les routes
 * cherchent ensuite leur passage et le trouvent aux cols, comme un muletier.
 * L'ordre inverse — mur posé sur un réseau déjà tracé — a été essayé et mesuré :
 * la grande chaussée courait sur quarante-quatre cases le long du faîte de la
 * ligne de partage des eaux, et un mur dont une route suit l'arête n'est pas un
 * mur. Le réseau doit connaître la montagne avant de choisir sa route.
 *
 * **Les cols.** Chaque crête est percée en deux ou trois points, choisis aux
 * minima d'altitude le long de son axe et espacés le long de la ligne : c'est
 * là qu'un chemin passerait de lui-même. Ce sont eux, et non le hasard d'un
 * seuil, qui font les « un à trois passages » entre zones du générateur de
 * HMM3 — et les postes de garde, qui se posent sur les transitions d'anneau des
 * voies, viennent s'y caler tout seuls.
 */
import { CELL_BRIDGE, CELL_BUILDABLE, CELL_CACHE, CELL_PASSABLE, CELL_ROAD } from '@auvergne/engine';

import { LIGNES_DE_CRETE } from './elevation.js';
import { CELLS, COLS, ROWS, T, distToSegment2 } from './grid.js';

/**
 * Demi-largeur du mur, en cases.
 *
 * À zéro le mur ne serait qu'une suite de cases parfois contiguës en diagonale,
 * et le déplacement à huit directions fuit par la diagonale d'un tel mur. À un,
 * la bande fait deux à trois cases et reste connexe par les côtés, ce qui la
 * rend étanche — c'est le minimum qui tient.
 */
const RAYON_MUR = 1;

/** Demi-largeur du col percé dans le mur, en cases. */
const RAYON_COL = 1;

/**
 * Nombre de cols par crête.
 *
 * Deux, et non un : un passage unique ferait de chaque frontière un point
 * d'articulation, ce qui est plus fermé que HMM3, dont le générateur pose « un
 * à trois » liaisons entre deux zones. Deux laisse le choix de l'itinéraire —
 * donc une décision à prendre — tout en gardant la coupe étroite.
 */
const COLS_PAR_CRETE = 2;

/**
 * Écart minimal entre deux cols, en pas le long de la polyligne.
 *
 * Deux cols voisins ne feraient qu'une seule large brèche. L'écart se compte le
 * long de la ligne et non à vol d'oiseau : c'est la longueur du détour qu'on
 * impose à celui qui se trompe de col.
 */
const ECART_COLS = 24;

/** Un col : le point bas d'une crête, par lequel on passe. */
export interface ColDeCrete {
  crete: string;
  label: string;
  col: number;
  row: number;
  altitude: number;
}

/** Le masque des murs et la liste des cols. */
export interface MasqueBarrieres {
  /** 1 sur les cases murées, cols exclus. */
  mur: Uint8Array;
  cols: ColDeCrete[];
}

/** Les cases de l'axe d'une crête, dans l'ordre du parcours de la polyligne. */
function axeDe(nodes: readonly { col: number; row: number }[]): number[] {
  const vus = new Set<number>();
  const axe: number[] = [];
  for (let s = 0; s + 1 < nodes.length; s++) {
    const a = nodes[s];
    const b = nodes[s + 1];
    const pas = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
    for (let k = 0; k <= pas; k++) {
      /* Interpolation entière : la case du milieu du segment à l'étape k. Les
         divisions se font en arrondi au plus proche pour que la ligne ne dérive
         pas d'un côté. */
      const col = a.col + Math.round(((b.col - a.col) * k) / Math.max(1, pas));
      const row = a.row + Math.round(((b.row - a.row) * k) / Math.max(1, pas));
      if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
      const i = row * COLS + col;
      if (vus.has(i)) continue;
      vus.add(i);
      axe.push(i);
    }
  }
  return axe;
}

/**
 * Choisit les cols d'une crête : les points les plus bas de son axe, espacés.
 *
 * On trie l'axe par altitude croissante et l'on prend gloutonnement, en
 * refusant tout candidat trop proche d'un col déjà retenu **le long de la
 * ligne**. Le procédé est déterministe et purement géographique : aucun tirage
 * n'entre dans la carte fixe.
 */
function colsDe(axe: number[], elevation: Int16Array): number[] {
  const rang = new Map<number, number>();
  axe.forEach((i, k) => rang.set(i, k));
  const tries = axe
    .slice()
    .sort((x, y) => elevation[x] - elevation[y] || x - y);
  const retenus: number[] = [];
  for (const i of tries) {
    if (retenus.length >= COLS_PAR_CRETE) break;
    const k = rang.get(i) ?? 0;
    let tropPres = false;
    for (const j of retenus) {
      if (Math.abs((rang.get(j) ?? 0) - k) < ECART_COLS) {
        tropPres = true;
        break;
      }
    }
    if (!tropPres) retenus.push(i);
  }
  return retenus;
}

/**
 * Le masque des murs de crête, calculé sur la seule élévation.
 *
 * @param protege Cases qu'aucun mur ne recouvre : emprises bâties et lieux
 *   fixes. Elles sont retirées du masque, donc franchissables — et un lieu fixe
 *   posé sur une crête devient de fait un passage, ce qui n'est pas gênant :
 *   c'est un sanctuaire de col.
 */
export function masqueBarrieres(elevation: Int16Array, protege: Uint8Array): MasqueBarrieres {
  const mur = new Uint8Array(CELLS);
  const cols: ColDeCrete[] = [];

  for (const ligne of LIGNES_DE_CRETE) {
    const axe = axeDe(ligne.nodes);
    const retenus = colsDe(axe, elevation);
    for (const i of retenus) {
      cols.push({
        crete: ligne.key,
        label: ligne.label,
        col: i % COLS,
        row: (i / COLS) | 0,
        altitude: elevation[i],
      });
    }

    const nodes = ligne.nodes;
    for (let s = 0; s + 1 < nodes.length; s++) {
      const a = nodes[s];
      const b = nodes[s + 1];
      const minCol = Math.max(0, Math.min(a.col, b.col) - RAYON_MUR);
      const maxCol = Math.min(COLS - 1, Math.max(a.col, b.col) + RAYON_MUR);
      const minRow = Math.max(0, Math.min(a.row, b.row) - RAYON_MUR);
      const maxRow = Math.min(ROWS - 1, Math.max(a.row, b.row) + RAYON_MUR);
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          if (distToSegment2(col, row, a.col, a.row, b.col, b.row) > RAYON_MUR * RAYON_MUR) continue;
          mur[row * COLS + col] = 1;
        }
      }
    }
  }

  /* Les cols se percent APRÈS que tous les murs sont posés : deux crêtes qui se
     croisent ne doivent pas refermer le col de l'autre. */
  for (const c of cols) {
    for (let dr = -RAYON_COL; dr <= RAYON_COL; dr++) {
      for (let dc = -RAYON_COL; dc <= RAYON_COL; dc++) {
        const col = c.col + dc;
        const row = c.row + dr;
        if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
        mur[row * COLS + col] = 0;
      }
    }
  }
  for (let i = 0; i < CELLS; i++) if (protege[i] === 1) mur[i] = 0;

  return { mur, cols };
}

/** L'état d'un mur, une fois le terrain définitif. */
export interface MurMesure {
  crete: string;
  label: string;
  /** Cases de l'axe de la crête. */
  axe: number;
  /** Cases de l'axe effectivement infranchissables. */
  mur: number;
  /** Trous portés par une voie ou un pont. */
  trousVoie: number;
  /** Trous dans le lit d'un cours d'eau. */
  trousEau: number;
  /** Trous d'une autre cause : emprise protégée, col percé, désenclavement. */
  trousAutres: number;
}

/**
 * Mesure l'intégrité des murs sur le terrain FINAL — après les cols, après le
 * désenclavement, après tout.
 *
 * C'est la seule façon de savoir si un mur est un mur. Le compte des cases
 * posées ne le dit pas : la pose peut réussir et le résultat fuir, parce qu'une
 * voie court le long du faîte, parce qu'une emprise protégée tombe dessus, ou
 * parce que le désenclavement a percé plus large qu'on ne croyait. Mesuré ainsi,
 * le premier essai — murs posés APRÈS le tracé des routes — montrait
 * quarante-quatre cases de voie et soixante-et-un autres trous dans le seul mur
 * de la ligne de partage des eaux. Un mur dont une route suit l'arête n'est pas
 * un mur, et aucun compte de cases posées ne l'aurait avoué.
 */
export function integriteDesMurs(terrain: Uint8Array, flags: Uint16Array): MurMesure[] {
  const franchissable = (c: number): boolean => c !== T.eau && c !== T.falaise && c !== T.rocher;
  return LIGNES_DE_CRETE.map((ligne) => {
    const m: MurMesure = {
      crete: ligne.key,
      label: ligne.label,
      axe: 0,
      mur: 0,
      trousVoie: 0,
      trousEau: 0,
      trousAutres: 0,
    };
    for (const i of axeDe(ligne.nodes)) {
      m.axe++;
      if (!franchissable(terrain[i])) {
        m.mur++;
        continue;
      }
      if ((flags[i] & (CELL_ROAD | CELL_BRIDGE)) !== 0) m.trousVoie++;
      else if (terrain[i] === T.eau) m.trousEau++;
      else m.trousAutres++;
    }
    return m;
  });
}

/** Ce qu'a fait la pose, pour le tableau de bord et les tests. */
export interface Barrieres {
  /** Cases effectivement murées. */
  total: number;
  /** Cases du masque épargnées parce qu'une voie ou un pont les occupait. */
  epargnees: number;
  cols: ColDeCrete[];
}

/**
 * Applique le masque au terrain classé.
 *
 * Les voies et les ponts l'emportent toujours : une route tracée dans la gorge
 * reste une route. Comme le masque a servi de pénalité au tracé, il n'en reste
 * normalement qu'une poignée — celles qu'aucun détour ne pouvait éviter.
 */
export function poserBarrieres(
  terrain: Uint8Array,
  flags: Uint16Array,
  masque: MasqueBarrieres,
): Barrieres {
  let total = 0;
  let epargnees = 0;
  for (let i = 0; i < CELLS; i++) {
    if (masque.mur[i] !== 1) continue;
    /*
     * L'eau et la tourbière restent ce qu'elles sont.
     *
     * L'eau, parce qu'un mur posé sur une rivière n'a aucun sens et que le lit
     * d'un torrent qui coupe une crête est justement un passage. La tourbière,
     * parce qu'une sagne est un replat gorgé d'eau sur un socle imperméable, et
     * que c'est précisément sur les replats de faîte qu'elle se forme : les
     * murer en rocher a fait tomber un tiers des tourbières de la carte, et
     * pour rien — le Col des Sagnes tire son nom de ce qu'on y passe, pas de ce
     * qu'on s'y heurte.
     */
    if (terrain[i] === T.eau || terrain[i] === T.humide) continue;
    if (terrain[i] === T.rocher || terrain[i] === T.falaise) continue;
    if ((flags[i] & (CELL_ROAD | CELL_BRIDGE)) !== 0) {
      epargnees++;
      continue;
    }
    terrain[i] = T.rocher;
    flags[i] &= ~(CELL_PASSABLE | CELL_BUILDABLE | CELL_CACHE);
    total++;
  }
  return { total, epargnees, cols: masque.cols };
}
