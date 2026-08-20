/**
 * La coupe minimale entre deux capitales : combien de cases faut-il boucher
 * pour les séparer ?
 *
 * **Pourquoi cet instrument existe, et pourquoi le précédent ne suffisait pas.**
 * Le plan de passation demandait « au moins douze points d'articulation », et
 * l'on a cru la cible atteinte à vingt-trois. Elle ne l'était pas : aucun de ces
 * vingt-trois points ne détachait un morceau de carte valant le détour. On a
 * donc ajouté le compte des vrais goulets, qui a dit zéro — et c'était juste.
 *
 * Mais ce compte-là ne peut pas non plus servir de cible, et il faut le dire
 * clairement : **un point d'articulation exige un passage UNIQUE**. Or HMM3 ne
 * relie pas ses zones par un passage unique ; son générateur en pose « un à
 * trois ». Une frontière franchie par deux cols — exactement ce qu'on veut
 * construire — n'a aucun point d'articulation, et un objectif exprimé en points
 * d'articulation pousserait donc à bâtir un couloir unique, c'est-à-dire une
 * carte plus pauvre que celle qu'on imite.
 *
 * La grandeur qui dit vraiment « cette carte a un front » est la coupe : le
 * nombre minimal de cases à boucher pour couper une capitale d'une autre. Si
 * l'on peut séparer Arconsat de Cervières en bouchant trois cases, il y a trois
 * passages entre elles et il faudra les forcer. S'il en faut quarante, la carte
 * est une esplanade, quel que soit le nombre de culs-de-sac qu'elle contient.
 * C'est la traduction littérale du « un à trois passages » de HMM3.
 *
 * Le calcul est un flot maximal à capacités unitaires SUR LES CASES — d'où le
 * dédoublement de chaque case en une entrée et une sortie reliées par une arête
 * de capacité un. Le théorème de Menger fait le reste : le flot maximal vaut la
 * coupe minimale, donc le nombre de chemins case-disjoints.
 */
import { START_POSITIONS, type StartKey } from '@auvergne/map';

/** Capacité d'une arête qu'on ne coupe jamais : les liaisons entre voisins. */
const INFINI = 1 << 20;

/**
 * Réseau de flot en tableaux plats. Les arêtes vont par paires (i, i^1) :
 * l'aller et son retour, comme le veut la représentation classique.
 */
interface Reseau {
  /** Sommet d'arrivée de chaque arête. */
  vers: Int32Array;
  /** Capacité résiduelle de chaque arête. */
  cap: Int32Array;
  /** Première arête de chaque sommet, puis chaînage. */
  tete: Int32Array;
  suivant: Int32Array;
  aretes: number;
  sommets: number;
}

function reseau(sommets: number, aretesMax: number): Reseau {
  return {
    vers: new Int32Array(aretesMax * 2),
    cap: new Int32Array(aretesMax * 2),
    tete: new Int32Array(sommets).fill(-1),
    suivant: new Int32Array(aretesMax * 2).fill(-1),
    aretes: 0,
    sommets,
  };
}

function ajouter(r: Reseau, de: number, a: number, capacite: number): void {
  const i = r.aretes;
  r.vers[i] = a;
  r.cap[i] = capacite;
  r.suivant[i] = r.tete[de];
  r.tete[de] = i;
  r.vers[i + 1] = de;
  r.cap[i + 1] = 0;
  r.suivant[i + 1] = r.tete[a];
  r.tete[a] = i + 1;
  r.aretes += 2;
}

/**
 * Dinic. À capacités unitaires le nombre de phases est en O(√E), et la coupe
 * qui nous intéresse est petite — quelques unités — donc le calcul s'arrête
 * après une poignée de phases.
 */
function fluxMaximal(r: Reseau, source: number, puits: number, plafond: number): number {
  const niveau = new Int32Array(r.sommets);
  const iter = new Int32Array(r.sommets);
  const file = new Int32Array(r.sommets);
  let flot = 0;

  for (;;) {
    niveau.fill(-1);
    niveau[source] = 0;
    let tete = 0;
    let queue = 0;
    file[queue++] = source;
    while (tete < queue) {
      const u = file[tete++];
      for (let e = r.tete[u]; e !== -1; e = r.suivant[e]) {
        if (r.cap[e] <= 0) continue;
        const v = r.vers[e];
        if (niveau[v] !== -1) continue;
        niveau[v] = niveau[u] + 1;
        file[queue++] = v;
      }
    }
    if (niveau[puits] === -1) return flot;

    for (let i = 0; i < r.sommets; i++) iter[i] = r.tete[i];

    /* Recherche de chemins bloquants, en pile explicite : la récursion
       déborderait sur quarante mille sommets. */
    for (;;) {
      if (flot >= plafond) return flot;
      const chemin: number[] = [];
      let u = source;
      let trouve = false;
      for (;;) {
        if (u === puits) {
          trouve = true;
          break;
        }
        let avance = -1;
        for (let e = iter[u]; e !== -1; e = r.suivant[e]) {
          iter[u] = e;
          if (r.cap[e] <= 0) continue;
          const v = r.vers[e];
          if (niveau[v] !== niveau[u] + 1) continue;
          avance = e;
          break;
        }
        if (avance === -1) {
          /* Cul-de-sac : on retire ce sommet du graphe de niveaux et l'on
             remonte d'un cran, en faisant avancer l'itérateur du parent
             au-delà de l'arête qui n'a rien donné. */
          niveau[u] = -1;
          if (chemin.length === 0) break;
          const e = chemin.pop() as number;
          u = r.vers[e ^ 1];
          iter[u] = r.suivant[e];
          continue;
        }
        /* On NE fait PAS avancer `iter[u]` ici : l'arête choisie peut avoir
           encore de la capacité au prochain passage — les liaisons entre cases
           voisines sont de capacité infinie et servent plusieurs fois. C'est ce
           que l'avance hâtive faisait perdre, en sous-estimant la coupe. */
        chemin.push(avance);
        u = r.vers[avance];
      }
      if (!trouve) break;
      let mini = INFINI;
      for (const e of chemin) if (r.cap[e] < mini) mini = r.cap[e];
      /* Le chemin peut n'être fait que d'arêtes incoupables — deux capitales
         voisines, zones qui se touchent — et le flot vaudrait alors l'infini.
         On le borne au plafond : la réponse utile est « large », pas un nombre
         de dix chiffres. */
      if (mini > plafond - flot) mini = plafond - flot;
      if (mini <= 0) return plafond;
      for (const e of chemin) {
        r.cap[e] -= mini;
        r.cap[e ^ 1] += mini;
      }
      flot += mini;
    }
  }
}

/**
 * Nombre minimal de cases à boucher pour séparer `de` de `a`.
 *
 * Les deux extrémités ne comptent pas — on ne « boucherait » pas une capitale —
 * et pas seulement elles : tout un voisinage autour de chacune est déclaré
 * incoupable. Sans ce voisinage, la mesure ne dirait pas ce qu'on croit. Une
 * case n'a que huit voisins, donc huit chemins case-disjoints au plus peuvent
 * en sortir : la coupe depuis une case unique plafonne à huit, et une carte
 * grande ouverte rendrait « huit » comme une carte percée de huit cols. Éprouvé
 * sur une grille dessinée à la main, le calcul rendait 5 là où le mur laissait
 * six passages, tout simplement parce que la case de départ était dans un coin.
 * En prenant un disque de rayon trois, la mesure porte sur les vingt-quatre
 * cases de son pourtour et retrouve une plage utile.
 *
 * `plafond` arrête le calcul dès qu'on sait que la coupe est large : au-delà, la
 * valeur exacte ne nous apprend plus rien et le calcul coûterait cher.
 */
export function coupeMinimale(
  praticable: Uint8Array,
  cols: number,
  rows: number,
  de: { col: number; row: number },
  a: { col: number; row: number },
  plafond = 64,
  rayonZone = 3,
): number {
  const n = cols * rows;
  const iDe = de.row * cols + de.col;
  const iA = a.row * cols + a.col;
  if (!praticable[iDe] || !praticable[iA] || iDe === iA) return 0;

  /* Les deux zones incoupables : un disque de Tchebychev autour de chaque
     capitale. Une case revendiquée par les deux — capitales trop proches —
     rendrait la question vide ; on la laisse à la source, et le flot vaudra
     zéro puisque le puits sera vide, ce que l'appelant lira comme « pas de
     front entre elles ». */
  const ZONE_DE = 1;
  const ZONE_A = 2;
  const zone = new Uint8Array(n);
  const marquer = (centre: { col: number; row: number }, quoi: number): void => {
    for (let dr = -rayonZone; dr <= rayonZone; dr++) {
      for (let dc = -rayonZone; dc <= rayonZone; dc++) {
        const c = centre.col + dc;
        const r2 = centre.row + dr;
        if (c < 0 || r2 < 0 || c >= cols || r2 >= rows) continue;
        const i = r2 * cols + c;
        if (!praticable[i] || zone[i] !== 0) continue;
        zone[i] = quoi;
      }
    }
  };
  marquer(de, ZONE_DE);
  marquer(a, ZONE_A);

  /*
   * Chaque case praticable devient deux sommets : entrée `2i`, sortie `2i+1`,
   * reliés par une arête de capacité un — c'est elle qu'on coupe.
   *
   * Le dimensionnement doit être EXACT, et il compte les voisinages avec la
   * même double boucle que la construction. Une première version parcourait les
   * huit voisins par un indice unique de 0 à 7, ce qui saute le voisin (1, 1) :
   * le tableau d'arêtes se trouvait trop court d'une arête par case, les
   * écritures hors bornes d'un tableau typé disparaissent sans bruit en
   * JavaScript, et le calcul tournait pendant dix minutes sur un graphe troué.
   */
  let voisinages = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (!praticable[i]) continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const c = col + dc;
          const rr = row + dr;
          if (c < 0 || rr < 0 || c >= cols || rr >= rows) continue;
          if (praticable[rr * cols + c]) voisinages++;
        }
      }
    }
  }
  /* Deux sommets de plus : la source et le puits, branchés sur toutes les cases
     de leur zone. */
  const SOURCE = 2 * n;
  const PUITS = 2 * n + 1;
  const r = reseau(2 * n + 2, n + voisinages + 2 * n);
  for (let i = 0; i < n; i++) {
    if (!praticable[i]) continue;
    ajouter(r, 2 * i, 2 * i + 1, zone[i] !== 0 ? INFINI : 1);
    if (zone[i] === ZONE_DE) ajouter(r, SOURCE, 2 * i, INFINI);
    else if (zone[i] === ZONE_A) ajouter(r, 2 * i + 1, PUITS, INFINI);
  }
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const i = row * cols + col;
      if (!praticable[i]) continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dc && !dr) continue;
          const c = col + dc;
          const rr = row + dr;
          if (c < 0 || rr < 0 || c >= cols || rr >= rows) continue;
          const j = rr * cols + c;
          if (!praticable[j]) continue;
          ajouter(r, 2 * i + 1, 2 * j, INFINI);
        }
      }
    }
  }
  return fluxMaximal(r, SOURCE, PUITS, plafond);
}

/** Une coupe mesurée entre deux départs. */
export interface CoupeEntreCapitales {
  de: string;
  a: string;
  coupe: number;
}

/**
 * Les coupes entre toutes les paires de capitales. Dix paires pour cinq
 * bannières : c'est le tableau qui dit si la carte a des fronts ou une seule
 * esplanade.
 */
export function coupesEntreCapitales(
  praticable: Uint8Array,
  cols: number,
  rows: number,
  plafond = 64,
): CoupeEntreCapitales[] {
  const keys = Object.keys(START_POSITIONS).sort() as StartKey[];
  const out: CoupeEntreCapitales[] = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const de = START_POSITIONS[keys[i]];
      const a = START_POSITIONS[keys[j]];
      out.push({
        de: de.label,
        a: a.label,
        coupe: coupeMinimale(praticable, cols, rows, de.at, a.at, plafond),
      });
    }
  }
  return out;
}
