/**
 * Les embranchements : chaque lieu qui se visite a son chemin.
 *
 * Exigence littérale du propriétaire : « tous les lieux d'intérêt (actifs)
 * doivent être disposés de manière logique et rattachés à une route secondaire
 * reliée soit à la route principale en jaune, soit à une autre route
 * secondaire. » C'est aussi la logique d'un pays habité — on ne bâtit pas un
 * moulin sans son chemin — et ce que fait une carte de HMM3 soignée : les
 * mines et les demeures se tiennent au bord des voies, pas au milieu des bois.
 *
 * Le tracé est un Dijkstra **multi-source** lancé une seule fois depuis toutes
 * les cases de voie (grande chaussée et chemins), sur les coûts de terrain
 * réels. Chaque lieu remonte ensuite l'arbre des parents depuis son entrée
 * jusqu'à la voie la plus proche, et les cases du parcours deviennent du
 * `chemin`. Deux lieux voisins partagent leur embranchement sans qu'on ait à
 * le demander : leurs remontées convergent dans le même arbre.
 *
 * Ne reçoivent PAS d'embranchement : les ramassages posés dans la nature
 * (tas de ressources, artefacts, coffres) — une carte où chaque pièce d'or a
 * sa voie carrossable serait un échangeur d'autoroute —, les gardes, qui
 * barrent des passages au lieu d'habiter des lieux, et les obstacles.
 * Mesure sur la carte de démonstration : 24 lieux sur 94 touchaient une voie
 * avant le tracé, 94 sur 94 après, pour 337 cases de chemin ajoutées et
 * environ 240 ms par graine.
 */
import {
  CELL_BUILDABLE,
  CELL_CACHE,
  CELL_PASSABLE,
  CELL_ROAD,
  TERRAIN_COST,
  TERRAINS,
  type MapObject,
  type MapObjectKind,
} from '@auvergne/engine';
import { CELLS, COLS, ROWS, T } from './grid.js';

/** Les natures qui méritent un chemin jusqu'à leur porte. */
const DESSERVIS: ReadonlySet<MapObjectKind> = new Set<MapObjectKind>([
  'ville',
  'village',
  'mine',
  'auberge',
  'sanctuaire',
  'sceau',
  'maison_tresor',
  'belvedere',
  'source',
  'borne',
  'quete',
  'caravane',
  'demeure',
  'moulin',
  'banque',
  'ecole',
  'temple',
  'fontaine',
  'cartographe',
  'marche_noir',
  'monolithe',
  'obelisque',
  'tente_clef',
]);

/** Coût de marche par indice de terrain, dérivé du contrat (jamais recopié). */
const COUT: readonly number[] = TERRAINS.map((t) => {
  const c = TERRAIN_COST[t];
  return Number.isFinite(c) && c <= 10_000 ? c : 0;
});

const DIAG_NUM = 141;
const DIAG_DEN = 100;

/** Vrai si la case porte une voie tracée. */
function estVoie(terrain: Uint8Array, i: number): boolean {
  return terrain[i] === T.route || terrain[i] === T.chemin;
}

/**
 * Trace les embranchements dans les tableaux du monde, en place.
 * Retourne le nombre de lieux desservis et le nombre de cases peintes.
 */
export function tracerEmbranchements(
  terrain: Uint8Array,
  flags: Uint16Array,
  objects: readonly MapObject[],
): { lieux: number; cases: number } {
  /*
   * Dijkstra multi-source depuis le réseau PORTEUR DE CHAUSSÉE, pas depuis
   * toute voie : le générateur de routes laisse parfois un îlot de chemins
   * séparé de la grande chaussée (mesuré : trois composantes de voie, dont
   * une sans route). Partir des seules composantes qui touchent une route
   * garantit que tout ce qu'on rattache est rattaché — transitivement — à la
   * chaussée jaune, comme l'exige la consigne. Les îlots eux-mêmes sont
   * soudés au réseau juste après, avant les lieux.
   *
   * Tas binaire sur tableaux typés, entrées périmées ignorées à l'extraction :
   * la première version, en tableaux JS avec échanges par déstructuration et
   * sans garde de péremption, coûtait 1,7 seconde sur les 106 496 cases —
   * six fois le budget de construction du monde.
   */
  /*
   * Les empreintes des lieux sont interdites au tracé, sauf leur entrée —
   * exactement la règle du moteur (`buildStaticBlocked`) : un chemin peint à
   * travers le flanc d'un poste de garde ou le corps d'une mine serait une
   * voie visible que personne ne peut emprunter.
   */
  const bloque = new Uint8Array(CELLS);
  for (const o of objects) {
    const e = o.entrance.row * COLS + o.entrance.col;
    for (const f of o.footprint) {
      const i = f.row * COLS + f.col;
      if (i !== e && i >= 0 && i < CELLS) bloque[i] = 1;
    }
  }

  const dist = new Int32Array(CELLS).fill(-1);
  const parent = new Int32Array(CELLS).fill(-1);
  const CAP = CELLS * 4;
  const heapCell = new Int32Array(CAP);
  const heapKey = new Int32Array(CAP);
  let taille = 0;

  const pousser = (cell: number, key: number): void => {
    if (taille >= CAP) return; // impossible en pratique : 8 voisins par case
    let i = taille++;
    heapCell[i] = cell;
    heapKey[i] = key;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heapKey[p] <= heapKey[i]) break;
      const kc = heapKey[p];
      heapKey[p] = heapKey[i];
      heapKey[i] = kc;
      const cc = heapCell[p];
      heapCell[p] = heapCell[i];
      heapCell[i] = cc;
      i = p;
    }
  };
  const extraire = (): number => {
    const cell = heapCell[0];
    taille--;
    if (taille > 0) {
      heapKey[0] = heapKey[taille];
      heapCell[0] = heapCell[taille];
      let i = 0;
      for (;;) {
        const g = 2 * i + 1;
        const d = g + 1;
        let m = i;
        if (g < taille && heapKey[g] < heapKey[m]) m = g;
        if (d < taille && heapKey[d] < heapKey[m]) m = d;
        if (m === i) break;
        const kc = heapKey[m];
        heapKey[m] = heapKey[i];
        heapKey[i] = kc;
        const cc = heapCell[m];
        heapCell[m] = heapCell[i];
        heapCell[i] = cc;
        i = m;
      }
    }
    return cell;
  };

  /* 1. Étiqueter les composantes de voie ; sources = celles qui ont une route. */
  const comp = new Int32Array(CELLS).fill(-1);
  const composanteARoute: boolean[] = [];
  const file = new Int32Array(CELLS);
  for (let sdep = 0; sdep < CELLS; sdep++) {
    if (!estVoie(terrain, sdep) || comp[sdep] >= 0) continue;
    const num = composanteARoute.length;
    let route = false;
    let tete = 0;
    let queue = 0;
    file[queue++] = sdep;
    comp[sdep] = num;
    while (tete < queue) {
      const i = file[tete++];
      if (terrain[i] === T.route) route = true;
      const col = i % COLS;
      const row = (i / COLS) | 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
          const j = r * COLS + c;
          if (!estVoie(terrain, j) || comp[j] >= 0) continue;
          comp[j] = num;
          file[queue++] = j;
        }
      }
    }
    composanteARoute.push(route);
  }

  for (let i = 0; i < CELLS; i++) {
    if (
      comp[i] >= 0 &&
      composanteARoute[comp[i]] &&
      (flags[i] & CELL_PASSABLE) !== 0 &&
      bloque[i] === 0
    ) {
      dist[i] = 0;
      pousser(i, 0);
    }
  }

  /*
   * Cibles de l'exploration : les entrées des lieux desservis, plus les voies
   * des composantes sans route (à souder). Le Dijkstra s'arrête quand toutes
   * sont réglées : la plupart des lieux sont à une douzaine de cases d'une
   * voie, le front n'a aucune raison de visiter les cent mille cases — la
   * version sans borne coûtait sept cents millisecondes à elle seule.
   */
  const cible = new Uint8Array(CELLS);
  let restantes = 0;
  for (const o of objects) {
    if (!DESSERVIS.has(o.kind)) continue;
    const e = o.entrance.row * COLS + o.entrance.col;
    if (e >= 0 && e < CELLS && cible[e] === 0 && dist[e] !== 0) {
      cible[e] = 1;
      restantes++;
    }
  }
  for (let i = 0; i < CELLS; i++) {
    if (comp[i] >= 0 && !composanteARoute[comp[i]] && cible[i] === 0) {
      cible[i] = 1;
      restantes++;
    }
  }

  while (taille > 0 && restantes > 0) {
    const key0 = heapKey[0];
    const i = extraire();
    if (key0 > dist[i]) continue; // entrée périmée : déjà mieux desservie
    if (cible[i] === 1) {
      cible[i] = 2; // réglée : son coût est final, son parent est définitif
      restantes--;
    }
    const d0 = dist[i];
    const col = i % COLS;
    const row = (i / COLS) | 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        const j = r * COLS + c;
        if ((flags[j] & CELL_PASSABLE) === 0 || bloque[j] === 1) continue;
        let pas = COUT[terrain[j]] || TERRAIN_COST.chemin;
        if (dc && dr) pas = Math.trunc((pas * DIAG_NUM) / DIAG_DEN);
        const nd = d0 + pas;
        if (dist[j] >= 0 && dist[j] <= nd) continue;
        dist[j] = nd;
        parent[j] = i;
        pousser(j, nd);
      }
    }
  }

  /* Peint la remontée de l'arbre depuis `depuis` jusqu'à la première voie. */
  let peintes = 0;
  const peindreVers = (depuis: number): void => {
    let i = depuis;
    for (let garde = 0; garde < 1024 && i >= 0; garde++) {
      if (estVoie(terrain, i)) break;
      /* L'eau pontée reste de l'eau : le pont est déjà le chemin. La falaise
         ne peut pas être sur le parcours, elle n'est pas praticable. */
      if (terrain[i] !== T.eau) {
        terrain[i] = T.chemin;
        flags[i] = (flags[i] | CELL_PASSABLE | CELL_ROAD) & ~(CELL_BUILDABLE | CELL_CACHE);
        peintes++;
      }
      i = parent[i];
    }
  };

  /* 2. Souder les îlots de voie sans route : leur case la mieux desservie
     rejoint le réseau porteur. Avant les lieux, pour qu'une remontée qui
     s'arrête sur un îlot s'arrête sur un îlot déjà soudé. */
  const meilleure = new Map<number, number>();
  for (let i = 0; i < CELLS; i++) {
    const c = comp[i];
    if (c < 0 || composanteARoute[c] || dist[i] < 0) continue;
    const b = meilleure.get(c);
    if (b === undefined || dist[i] < dist[b]) meilleure.set(c, i);
  }
  for (const [, cellule] of [...meilleure.entries()].sort((a, b) => a[0] - b[0])) {
    peindreVers(parent[cellule]);
  }

  /* 3. Les lieux. */
  let lieux = 0;
  for (const o of objects) {
    if (!DESSERVIS.has(o.kind)) continue;
    const e = o.entrance.row * COLS + o.entrance.col;
    if (e < 0 || e >= CELLS || dist[e] < 0) continue;
    lieux++;
    peindreVers(e);
  }
  return { lieux, cases: peintes };
}

/* Réexporté pour les tests : la liste fait partie du contrat de la carte. */
export { DESSERVIS };
