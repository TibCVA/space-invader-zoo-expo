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
import { CELLS, COLS, IntHeap, ROWS, T } from './grid.js';

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

/**
 * Les chaînes qui partagent le pays en zones.
 *
 * Les cinq crêtes d'`elevation.ts` ne suffisent pas, et la mesure le dit : murs
 * posés, la coupe entre capitales tombait à neuf autour d'Arconsat mais restait
 * de seize à dix-neuf ailleurs, pour une cible de six. La raison n'est pas
 * algorithmique, elle est géographique : cinq lignes ne partagent pas un pays en
 * sept zones, et trois d'entre elles passent par une capitale — Arconsat,
 * Cervières et La Renaudie sont posées SUR leur crête, ce qui est fidèle (ce
 * sont des villes de hauteur) mais perce le mur par construction.
 *
 * On ajoute donc des chaînes dont on ne donne que les DEUX BOUTS. Le tracé se
 * fait par marche de crête : un plus-court-chemin qui paie le manque d'altitude,
 * donc qui suit le faîte local d'un bout à l'autre. C'est ce qui les distingue
 * d'un trait tiré à la règle — elles épousent le relief au lieu de le barrer, et
 * l'on n'a pas à placer trente nœuds à la main pour cela.
 *
 * Ces chaînes ne touchent PAS le champ d'élévation, à la différence des crêtes
 * d'`elevation.ts` qui le soulèvent. C'est un choix : soulever le terrain le
 * long de quatre lignes de plus aurait redessiné tous les biomes de la carte —
 * la classification lit l'altitude et la pente — et il n'y a aucune raison de
 * payer ce prix pour poser un mur. Le pays garde son relief ; la roche affleure
 * le long de son faîte, ce qui est exactement ce qu'elle fait dans la nature.
 */
interface ChaineDef {
  key: string;
  label: string;
  de: { col: number; row: number };
  a: { col: number; row: number };
}

const CHAINES: readonly ChaineDef[] = [
  {
    /* Ferme les Hauts d'Arconsat au sud : entre Chabreloche et les futaies,
       jusqu'à rejoindre la ligne de partage des eaux. */
    key: 'barre_nord',
    label: 'la barre du Nord',
    de: { col: 0, row: 32 },
    a: { col: 61, row: 34 },
  },
  {
    /* Ferme les Futaies de Viscomtat au nord ; la crête des Hautes-Futaies les
       ferme déjà à l'est. */
    key: 'barre_futaies_nord',
    label: 'la barre des Futaies',
    de: { col: 0, row: 57 },
    a: { col: 33, row: 62 },
  },
  {
    /* Et au sud, vers les hautes terres de Vollore. */
    key: 'barre_futaies_sud',
    label: 'la barre de Vollore',
    de: { col: 0, row: 94 },
    a: { col: 33, row: 88 },
  },
  {
    /* Sépare la Châtellenie de Cervières du pays de Noirétable. */
    key: 'barre_cervieres_sud',
    label: 'la barre des Farges',
    de: { col: 70, row: 73 },
    a: { col: 112, row: 66 },
  },
  {
    /* Sépare la Marche de La Renaudie de tout le reste. */
    key: 'barre_marche',
    label: 'la barre de la Marche',
    de: { col: 0, row: 136 },
    a: { col: 112, row: 128 },
  },
];

/**
 * Trace le faîte entre deux points : un plus-court-chemin qui paie le manque
 * d'altitude.
 *
 * Le coût d'un pas est un plancher plus l'écart à l'altitude maximale du pays.
 * Le chemin préfère donc le haut, tout en restant un chemin — il ne remonte pas
 * indéfiniment chercher un sommet, parce que chaque pas coûte. Dijkstra, sans
 * heuristique : la carte est petite et l'on veut le vrai optimum, pour que le
 * tracé soit reproductible au pas près.
 */
function marcheDeCrete(
  elevation: Int16Array,
  de: { col: number; row: number },
  a: { col: number; row: number },
): number[] {
  const depart = de.row * COLS + de.col;
  const arrivee = a.row * COLS + a.col;
  const cout = new Int32Array(CELLS).fill(0x7fffffff);
  const venuDe = new Int32Array(CELLS).fill(-1);
  const fait = new Uint8Array(CELLS);
  const tas = new IntHeap(1 << 14);
  cout[depart] = 0;
  tas.push(0, depart);

  while (tas.length > 0) {
    const i = tas.pop();
    if (i < 0) break;
    if (fait[i] === 1) continue;
    fait[i] = 1;
    if (i === arrivee) break;
    const col = i % COLS;
    const row = (i / COLS) | 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const c = col + dc;
        const r2 = row + dr;
        if (c < 0 || r2 < 0 || c >= COLS || r2 >= ROWS) continue;
        const j = r2 * COLS + c;
        if (fait[j] === 1) continue;
        /* Le plancher garde le tracé court ; l'écart à l'altitude maximale le
           tient sur le faîte. La diagonale ne coûte pas plus : un mur en
           diagonale est aussi étanche qu'un mur droit, dès lors qu'on l'épaissit
           d'une case. */
        const pas = PAS_CRETE + (ALTITUDE_REFERENCE - elevation[j]);
        const total = cout[i] + (pas < 1 ? 1 : pas);
        if (total >= cout[j]) continue;
        cout[j] = total;
        venuDe[j] = i;
        tas.push(total, j);
      }
    }
  }

  if (venuDe[arrivee] < 0 && arrivee !== depart) return [];
  const chemin: number[] = [];
  let cursor = arrivee;
  let garde = 0;
  while (cursor >= 0 && garde++ < CELLS) {
    chemin.push(cursor);
    if (cursor === depart) break;
    cursor = venuDe[cursor];
  }
  chemin.reverse();
  return chemin;
}

/** Plancher du coût d'un pas de marche de crête. */
const PAS_CRETE = 40;
/** Altitude de référence : l'écart à ce plafond est ce qu'on paie. */
const ALTITUDE_REFERENCE = 1265;

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

  for (const { key, label, axe } of axesDesBarrieres(elevation)) {
    for (const i of colsDe(axe, elevation)) {
      cols.push({
        crete: key,
        label,
        col: i % COLS,
        row: (i / COLS) | 0,
        altitude: elevation[i],
      });
    }
    /* Le mur est l'axe dilaté d'une case : trois de large, connexe par les
       côtés, donc étanche au déplacement diagonal. */
    for (const i of axe) {
      const col = i % COLS;
      const row = (i / COLS) | 0;
      for (let dr = -RAYON_MUR; dr <= RAYON_MUR; dr++) {
        for (let dc = -RAYON_MUR; dc <= RAYON_MUR; dc++) {
          const c = col + dc;
          const r2 = row + dr;
          if (c < 0 || r2 < 0 || c >= COLS || r2 >= ROWS) continue;
          mur[r2 * COLS + c] = 1;
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

/** Un axe de barrière : la ligne de faîte à murer, case par case. */
interface AxeBarriere {
  key: string;
  label: string;
  axe: number[];
}

/**
 * Tous les axes à murer : les crêtes du relief, puis les chaînes de partage.
 *
 * Le résultat est mis en cache — la géographie ne change jamais, et les marches
 * de crête sont cinq Dijkstra sur vingt mille cases qu'il n'y a aucune raison de
 * refaire à chaque appel.
 */
let axesCache: AxeBarriere[] | null = null;

function axesDesBarrieres(elevation: Int16Array): AxeBarriere[] {
  if (axesCache) return axesCache;
  const out: AxeBarriere[] = LIGNES_DE_CRETE.map((ligne) => ({
    key: ligne.key,
    label: ligne.label,
    axe: axeDe(ligne.nodes),
  }));
  for (const chaine of CHAINES) {
    out.push({
      key: chaine.key,
      label: chaine.label,
      axe: marcheDeCrete(elevation, chaine.de, chaine.a),
    });
  }
  axesCache = out;
  return out;
}

/** Réinitialise le cache des axes. Réservé aux tests et aux mesures. */
export function resetBarrieresCache(): void {
  axesCache = null;
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
export function integriteDesMurs(
  terrain: Uint8Array,
  flags: Uint16Array,
  elevation: Int16Array,
): MurMesure[] {
  const franchissable = (c: number): boolean => c !== T.eau && c !== T.falaise && c !== T.rocher;
  return axesDesBarrieres(elevation).map(({ key, label, axe }) => {
    const m: MurMesure = {
      crete: key,
      label,
      axe: 0,
      mur: 0,
      trousVoie: 0,
      trousEau: 0,
      trousAutres: 0,
    };
    for (const i of axe) {
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
