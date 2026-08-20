/**
 * Ce que vaut la carte, en nombres.
 *
 *   npx tsx tools/mesure-carte.ts            → graine de démonstration
 *   npx tsx tools/mesure-carte.ts 12345      → une autre graine
 *   npx tsx tools/mesure-carte.ts --json     → sortie machine
 *
 * Pourquoi cet outil existe. Le reproche fait à la carte — « vide, chemins trop
 * limités, rien à faire » — était juste, mais chacun l'exprimait autrement et
 * personne ne pouvait dire de combien. Trois mesures indépendantes ont fini par
 * converger sur les mêmes nombres, et ce sont eux qu'on veut pouvoir rejouer
 * après chaque changement, sans réécrire le script à chaque fois.
 *
 * Les seuils portés ici viennent de HMM3, vérifiés sur la documentation du jeu
 * et de son générateur de cartes, et non d'une impression :
 *
 *   - une carte HMM3 de taille comparable porte **un objet interactif toutes les
 *     35 à 50 cases praticables**. Ce seuil a été corrigé le jour où la carte
 *     est passée à la taille d'une XL de HMM3 : il disait auparavant « 120 à
 *     150 », et cette valeur était fausse. Le calcul le montre — une XL fait
 *     144 × 144 = 20 736 cases, donc « une toutes les 135 » voudrait dire
 *     qu'une XL entière ne porte que 154 lieux, alors qu'il faut déjà en
 *     compter, à la main et sans rien inventer : 8 à 10 villes, 40 à 50
 *     gisements (chaque joueur veut sa scierie, sa carrière et sa mine d'or,
 *     et les mines précieuses se disputent), 25 à 35 habitats extérieurs,
 *     20 à 40 repaires gardés, 25 à 50 artefacts, 40 à 80 coffres, 70 à 120
 *     lieux de service et de voyage (moulins, fontaines, pierres de savoir,
 *     tavernes, une quinzaine d'obélisques pour le puzzle, les paires de
 *     monolithes, les garnisons) et de 150 à 250 tas de ressources, qui sont
 *     de loin la famille la plus nombreuse. Le total tombe entre 400 et 620
 *     lieux, soit une case sur 33 à 52.
 *
 *     Pourquoi l'erreur est restée invisible si longtemps : la carte faisait
 *     alors 106 496 cases, cinq fois une XL. Viser « une toutes les 135 » y
 *     donnait 851 lieux — un nombre absolu juste pour une XL, étalé sur cinq
 *     fois trop de terre. Le seuil compensait exactement l'excès de surface,
 *     et les deux erreurs se sont masquées l'une l'autre jusqu'à ce que la
 *     carte soit ramenée à sa taille ;
 *   - HMM3 découpe la surface en **zones reliées par des liaisons étroites et
 *     gardées** — la règle de son générateur dit littéralement que les liaisons
 *     larges ne sont jamais gardées, parce qu'une liaison large ne se tient pas.
 *     Notre carte n'avait **aucun point d'articulation**, pas un seul ;
 *   - un garde doit **bloquer le passage**. Le nôtre n'occupait que sa case
 *     d'entrée, que le calcul de chemin ignore par construction : il ne bloquait
 *     rien du tout, et l'on traversait la carte sans jamais en croiser un.
 *
 * L'outil ne juge pas : il imprime. Les seuils sont affichés à côté des mesures
 * pour qu'on voie l'écart, et le code de sortie reste 0 — c'est un instrument,
 * pas une porte de qualité. Le jour où la carte aura été densifiée, les seuils
 * deviendront des assertions dans `packages/map/src/objects.test.ts`.
 */
import {
  buildTerrain,
  buildWorld,
  COLS,
  ROWS,
  START_POSITIONS,
  integriteDesMurs,
  type MurMesure,
} from '@auvergne/map';
import { coupesEntreCapitales, type CoupeEntreCapitales } from './coupe.js';
import {
  BASE_MOVEMENT,
  CELL_PASSABLE,
  DIAGONAL_DEN,
  DIAGONAL_NUM,
  TERRAIN_COST,
  TERRAINS,
} from '@auvergne/engine';

const GRAINE_DEMO = 20250816;

/** Coût de marche d'une case, par index de terrain, dans l'ordre de `TERRAINS`. */
const COUT_PAR_TERRAIN: number[] = TERRAINS.map((t) => TERRAIN_COST[t]);

/* ─────────────────────────────── Seuils HMM3 ─────────────────────────────── */

const CIBLE_CASES_PAR_OBJET = 50; // borne haute de la fourchette 35–50
/*
 * Il n'y a plus de cible en points d'articulation, et c'est une correction.
 *
 * Le plan demandait « au moins douze points d'articulation ». On a cru la cible
 * dépassée à vingt-trois, puis à cent cinquante-huit en abaissant le seuil de
 * pente. Elle ne l'était pas : aucun de ces points ne détache un morceau de
 * carte de plus de vingt-cinq cases — ce sont des culs-de-sac, et un cul-de-sac
 * ne se force pas. Mais surtout, la grandeur elle-même était mal choisie : **un
 * point d'articulation exige un passage UNIQUE**, alors que le générateur de
 * HMM3 relie ses zones par « un à trois » passages. Une frontière percée de deux
 * cols — exactement ce qu'on construit — n'a aucun point d'articulation, et un
 * objectif exprimé ainsi pousserait à bâtir des couloirs uniques, c'est-à-dire
 * une carte plus pauvre que celle qu'on imite.
 *
 * Les deux comptes restent imprimés, parce qu'ils décrivent la carte ; c'est la
 * coupe qui porte la cible.
 */

/**
 * Largeur maximale de la coupe entre deux capitales.
 *
 * HMM3 relie deux zones par « un à trois » passages. Entre deux capitales on
 * traverse plusieurs frontières, et la coupe minimale vaut celle de la plus
 * étroite d'entre elles : six cases laissent la place à deux ou trois cols
 * larges de deux, ce qui est la structure visée. Au-delà, la carte est une
 * esplanade — quel que soit le nombre de culs-de-sac qu'elle contient.
 */
const CIBLE_COUPE_MAX = 6;
const CIBLE_INFRANCHISSABLE_MIN = 0.12; // 12 % de la carte, comme un relief HMM3
/*
 * Cible recalibrée après mesure : à la densité de HMM3 (une case sur 135), le
 * coût médian entre deux trouvailles est de 551 points — le glaneur séquentiel
 * plafonne donc vers 3,3 objets par jour (1800/551), et exiger 4 demanderait
 * une densité au-delà de la référence qu'on s'est donnée. 2,5 est le seuil du
 * ressenti « cueillette » ; l'ancienne carte en était à 1,9.
 */
const CIBLE_OBJETS_PAR_JOUR = 2.5;

/* ───────────────────────────────── Utilitaires ───────────────────────────── */

function mediane(xs: number[]): number {
  if (!xs.length) return 0;
  const t = [...xs].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? t[m] : (t[m - 1] + t[m]) / 2;
}

function centile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const t = [...xs].sort((a, b) => a - b);
  return t[Math.min(t.length - 1, Math.floor((p / 100) * t.length))];
}

/* ─────────────────────────────────── Mesures ─────────────────────────────── */

export interface Rapport {
  graine: number;
  cellules: number;
  praticables: number;
  infranchissables: number;
  partInfranchissable: number;
  terrains: Record<string, number>;
  objets: number;
  objetsParNature: Record<string, number>;
  casesParObjet: number;
  emprise: number;
  distanceMoyenne: number;
  distanceMediane: number;
  distanceP90: number;
  distanceMax: number;
  blocsVides: number;
  blocsTotal: number;
  articulations: number;
  goulets: number;
  coupes: CoupeEntreCapitales[];
  murs: MurMesure[];
  composantes: number;
  gardes: number;
  gardesBloquants: number;
  /** Cases atteintes depuis chaque capitale sans livrer un combat. */
  terreLibre: { depart: string; libre: number }[];
  glanage: Glanage[];
}

/** Ce qu'un héros ramasse depuis un départ, en jeu parfait. */
interface Glanage {
  depart: string;
  jour7: number;
  jour14: number;
  jour28: number;
  objetsParJour: number;
  coutMedianEntreObjets: number;
}

/**
 * Le héros glaneur.
 *
 * C'est la mesure qui tranche, parce qu'elle est la seule qui parle la langue du
 * joueur : **combien de choses je rencontre par journée de marche**. Une densité
 * exprimée en cases par objet reste abstraite ; « deux objets par jour » se
 * ressent immédiatement comme un désert.
 *
 * Le protocole est volontairement favorable à la carte : omniscience totale,
 * aucun combat, aucun détour, le héros va toujours vers l'objet non visité le
 * moins cher à atteindre. Le chiffre obtenu est donc un **plafond** — le jeu
 * réel fera moins bien. S'il est déjà bas, il n'y a rien à discuter.
 *
 * Dijkstra sur les coûts de terrain réels, huit voisins, diagonale à ×141/100,
 * exactement le barème du moteur.
 */
function glaner(
  praticable: Uint8Array,
  terrain: ArrayLike<number>,
  cols: number,
  rows: number,
  objetIndex: Int32Array,
  depart: { col: number; row: number },
  nom: string,
  joursMax = 28,
): Glanage {
  const n = cols * rows;
  const visites = new Uint8Array(n);
  const couts: number[] = [];
  let position = depart.row * cols + depart.col;
  let coutTotal = 0;
  const budgetTotal = BASE_MOVEMENT * joursMax;
  const jalons: Record<number, number> = { 7: 0, 14: 0, 28: 0 };
  let ramasses = 0;

  const dist = new Int32Array(n);
  const tas: number[] = [];

  for (;;) {
    /* Dijkstra depuis la position courante jusqu'au premier objet non visité. */
    dist.fill(-1);
    tas.length = 0;
    dist[position] = 0;
    tas.push(0, position);
    let cible = -1;
    let coutCible = 0;

    while (tas.length) {
      /* Extraction du minimum : tas binaire à plat, [cout, index] par paire. */
      let min = 0;
      for (let k = 2; k < tas.length; k += 2) if (tas[k] < tas[min]) min = k;
      const cout = tas[min];
      const i = tas[min + 1];
      tas[min] = tas[tas.length - 2];
      tas[min + 1] = tas[tas.length - 1];
      tas.length -= 2;
      if (cout > dist[i]) continue;

      if (objetIndex[i] >= 0 && !visites[objetIndex[i]] && i !== position) {
        cible = i;
        coutCible = cout;
        break;
      }

      const col = i % cols;
      const row = (i / cols) | 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const c = col + dc;
          const r = row + dr;
          if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
          const j = r * cols + c;
          if (!praticable[j]) continue;
          let pas = COUT_PAR_TERRAIN[terrain[j]] ?? 100;
          if (!Number.isFinite(pas) || pas > 1e6) continue;
          if (dc && dr) pas = Math.floor((pas * DIAGONAL_NUM) / DIAGONAL_DEN);
          const nd = cout + pas;
          if (dist[j] < 0 || nd < dist[j]) {
            dist[j] = nd;
            tas.push(nd, j);
          }
        }
      }
    }

    if (cible < 0 || coutTotal + coutCible > budgetTotal) break;
    coutTotal += coutCible;
    couts.push(coutCible);
    visites[objetIndex[cible]] = 1;
    position = cible;
    ramasses++;
    const jour = Math.ceil(coutTotal / BASE_MOVEMENT);
    for (const seuil of [7, 14, 28]) if (jour <= seuil) jalons[seuil] = ramasses;
  }

  return {
    depart: nom,
    jour7: jalons[7],
    jour14: jalons[14],
    jour28: jalons[28],
    objetsParJour: jalons[28] / joursMax,
    coutMedianEntreObjets: mediane(couts),
  };
}

/**
 * Exportée pour que `carte.test.ts` puisse tenir les seuils.
 *
 * Le tableau de bord imprimait et ne jugeait jamais — c'était assumé, « un
 * instrument, pas une porte de qualité ». Mais rien d'autre ne gardait ces
 * nombres : le passage de la carte à la taille d'une XL les a tous fait bouger
 * en silence, et il a fallu les redécouvrir un par un.
 */
export function mesurer(graine: number): Rapport {
  const w = buildWorld(graine) as unknown as {
    cols: number;
    rows: number;
    terrain: Uint8Array | Int8Array;
    flags: Uint8Array | Int32Array;
    objects: { kind: string; at: { col: number; row: number }; footprint?: { col: number; row: number }[] }[];
  };
  const cols = w.cols || COLS;
  const rows = w.rows || ROWS;
  const n = cols * rows;

  /* Terrains et praticabilité. Seule l'eau sans pont est bloquante aujourd'hui ;
     on lit le drapeau plutôt que de le déduire, pour que la mesure reste juste
     le jour où d'autres terrains deviendront infranchissables. */
  const terrains: Record<string, number> = {};
  for (let i = 0; i < n; i++) {
    const t = TERRAINS[w.terrain[i] as number] ?? '?';
    terrains[t] = (terrains[t] ?? 0) + 1;
  }
  const praticable = new Uint8Array(n);
  let praticables = 0;
  for (let i = 0; i < n; i++) {
    if ((w.flags[i] & CELL_PASSABLE) !== 0) {
      praticable[i] = 1;
      praticables++;
    }
  }

  /* Objets, empreintes, et ce qu'un garde bloque réellement. */
  const objetsParNature: Record<string, number> = {};
  let emprise = 0;
  let gardes = 0;
  let gardesBloquants = 0;
  const occupe = new Uint8Array(n);
  for (const o of w.objects) {
    objetsParNature[o.kind] = (objetsParNature[o.kind] ?? 0) + 1;
    const emp = o.footprint?.length ? o.footprint : [o.at];
    emprise += emp.length;
    for (const c of emp) {
      const i = c.row * cols + c.col;
      if (i >= 0 && i < n) occupe[i] = 1;
    }
    if (o.kind === 'garde') {
      gardes++;
      /* Le calcul de chemin ignore la case d'entrée : un garde ne bloque que si
         son empreinte déborde de cette seule case. */
      if (emp.length > 1) gardesBloquants++;
    }
  }

  /*
   * La TERRE LIBRE : ce qu'une bannière atteint depuis sa capitale sans livrer
   * un seul combat.
   *
   * Pourquoi cette mesure existe. Le glaneur marche en omniscient et sans
   * combat, mais il traverse les gardes comme s'ils n'étaient pas là : il ne
   * peut donc pas dire si un départ est ENFERMÉ. Or depuis que les crêtes sont
   * murées, une zone de départ n'a plus que deux ou trois cols, et si chacun
   * porte une compagnie de l'anneau trois, la maison est en cage jusqu'à ce
   * qu'elle puisse forcer. Mesuré sur une partie qui ne se tranchait pas
   * (graine 48514) : la bannière enfermée livrait quatre-vingt-dix-huit combats
   * pour une seule cité, deux gisements et un héros resté au niveau quatre —
   * elle mourait contre son propre col, encore et encore.
   *
   * Un garde bloque par son EMPREINTE ENTIÈRE ici, entrée comprise : mettre le
   * pied sur l'entrée, c'est justement le combat qu'on cherche à éviter.
   */
  const librePar: { depart: string; libre: number }[] = [];
  {
    const mur = new Uint8Array(n);
    for (const o of w.objects) {
      if (o.kind !== 'garde') continue;
      for (const c of o.footprint?.length ? o.footprint : [o.at]) {
        const i = c.row * cols + c.col;
        if (i >= 0 && i < n) mur[i] = 1;
      }
    }
    const vu = new Uint8Array(n);
    const fileL = new Int32Array(n);
    for (const s of Object.values(START_POSITIONS)) {
      vu.fill(0);
      let t = 0;
      let q = 0;
      const depart = s.at.row * cols + s.at.col;
      if (!praticable[depart]) {
        librePar.push({ depart: s.label, libre: 0 });
        continue;
      }
      vu[depart] = 1;
      fileL[q++] = depart;
      let libre = 0;
      while (t < q) {
        const i = fileL[t++];
        libre++;
        const col = i % cols;
        const row = (i / cols) | 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const c = col + dc;
            const r2 = row + dr;
            if (c < 0 || r2 < 0 || c >= cols || r2 >= rows) continue;
            const j = r2 * cols + c;
            if (vu[j] || !praticable[j] || mur[j]) continue;
            vu[j] = 1;
            fileL[q++] = j;
          }
        }
      }
      librePar.push({ depart: s.label, libre });
    }
  }

  /* Distance de chaque case praticable à l'objet le plus proche, en cases, par
     un parcours en largeur multi-source sur la grille à 8 voisins. */
  const dist = new Int32Array(n).fill(-1);
  const file = new Int32Array(n);
  let tete = 0;
  let queue = 0;
  for (let i = 0; i < n; i++) {
    if (occupe[i] && praticable[i]) {
      dist[i] = 0;
      file[queue++] = i;
    }
  }
  while (tete < queue) {
    const i = file[tete++];
    const col = i % cols;
    const row = (i / cols) | 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
        const j = r * cols + c;
        if (!praticable[j] || dist[j] >= 0) continue;
        dist[j] = dist[i] + 1;
        file[queue++] = j;
      }
    }
  }
  const distances: number[] = [];
  for (let i = 0; i < n; i++) if (praticable[i] && dist[i] >= 0) distances.push(dist[i]);

  /* Blocs sans le moindre objet : la mesure du « on marche mille cases sans
     rien rencontrer ».

     Le bloc valait 32 cases de côté quand la carte en faisait 256 × 416 ; à la
     taille d'une XL il ne découpait plus que 24 blocs de 5 % de la carte
     chacun et ne repérait plus rien. Il suit donc le pas du semis.

     Un bloc n'est retenu que s'il a de quoi être un désert : la moitié de sa
     surface praticable. Sans ce plancher, les lisières comptaient — la
     dernière colonne d'une carte de 113 fait une case de large — et une
     échancrure de quatorze cases au bord de la carte était rapportée comme un
     désert au même titre qu'un canton entier. Le semeur de couverture applique
     le même raisonnement avec son plancher de quarante cases libres ; les deux
     mesures parlaient de deux choses différentes et se contredisaient. */
  const PAS = 14;
  const PLANCHER_BLOC = (PAS * PAS) / 2;
  let blocsVides = 0;
  let blocsTotal = 0;
  for (let br = 0; br < rows; br += PAS) {
    for (let bc = 0; bc < cols; bc += PAS) {
      let praticablesDansBloc = 0;
      let objetDansBloc = false;
      for (let r = br; r < Math.min(br + PAS, rows); r++) {
        for (let c = bc; c < Math.min(bc + PAS, cols); c++) {
          const i = r * cols + c;
          if (praticable[i]) praticablesDansBloc++;
          if (occupe[i]) objetDansBloc = true;
        }
      }
      if (praticablesDansBloc < PLANCHER_BLOC) continue;
      blocsTotal++;
      if (!objetDansBloc) blocsVides++;
    }
  }

  /* Composantes connexes et points d'articulation, par Tarjan itératif — la
     récursion déborde la pile sur cent mille sommets. Un point d'articulation
     est un goulet : le retirer coupe la carte en deux. HMM3 en vit. */
  const { composantes, articulations, goulets } = tarjan(praticable, cols, rows);
  /* Et la grandeur qui dit vraiment si la carte a un front : combien de cases
     il faut boucher pour couper une capitale d'une autre. */
  const coupes = coupesEntreCapitales(praticable, cols, rows);

  /* Le héros glaneur, depuis chaque départ de joueur. */
  const objetIndex = new Int32Array(n).fill(-1);
  w.objects.forEach((o, k) => {
    const emp = o.footprint?.length ? o.footprint : [o.at];
    for (const c of emp) {
      const i = c.row * cols + c.col;
      if (i >= 0 && i < n && objetIndex[i] < 0) objetIndex[i] = k;
    }
  });
  const glanage = Object.values(START_POSITIONS).map((s) =>
    glaner(praticable, w.terrain, cols, rows, objetIndex, s.at, s.label),
  );

  return {
    graine,
    cellules: n,
    praticables,
    infranchissables: n - praticables,
    partInfranchissable: (n - praticables) / n,
    terrains,
    objets: w.objects.length,
    objetsParNature,
    casesParObjet: w.objects.length ? praticables / w.objects.length : 0,
    emprise,
    distanceMoyenne: distances.reduce((a, b) => a + b, 0) / Math.max(1, distances.length),
    distanceMediane: mediane(distances),
    distanceP90: centile(distances, 90),
    distanceMax: distances.length ? Math.max(...distances) : 0,
    blocsVides,
    blocsTotal,
    articulations,
    goulets,
    coupes,
    /* `WorldMap.terrain` est déclaré comme une union de tableaux d'octets pour
       les sérialisations ; ici il est bien un `Uint8Array`. */
    /* `WorldMap` déclare ses tableaux en unions pour les sérialisations ; ici
       ce sont bien un `Uint8Array` et un `Uint16Array`. */
    /* `WorldMap` déclare ses tableaux en unions pour les sérialisations, et ne
       porte pas l'élévation : on la reprend au terrain fixe, qui est le même. */
    murs: integriteDesMurs(
      Uint8Array.from(w.terrain),
      Uint16Array.from(w.flags),
      buildTerrain().elevation,
    ),
    composantes,
    gardes,
    gardesBloquants,
    terreLibre: librePar,
    glanage,
  };
}

/**
 * Taille minimale du plus petit morceau détaché pour qu'un goulet compte.
 *
 * Un point d'articulation brut ne dit pas grand-chose : la pointe d'une
 * presqu'île d'une case, le fond d'une combe en cul-de-sac, le col d'un
 * mouchoir de prairie coincé entre deux barres rocheuses en sont tous. Au
 * seuil de roche 10, la carte en compte cent treize — un nombre qui semble
 * dire « la carte est un labyrinthe » et qui ne dit rien du tout, puisqu'on
 * ne sait pas si ces cent treize cases séparent des zones ou des recoins.
 *
 * Un goulet de HMM3 est autre chose : c'est le passage entre deux ZONES, et
 * l'on doit le forcer parce qu'il n'y a pas d'autre route. Vingt-cinq cases,
 * c'est l'ordre de grandeur du plus petit morceau qui vaille qu'on s'y
 * engage — de quoi porter deux ou trois lieux et un garde. En dessous, le
 * détour est un décor.
 */
const GOULET_MIN = 25;

/**
 * Composantes connexes et points d'articulation, sans récursion.
 *
 * Exporté pour être éprouvé sur des grilles dont on connaît la réponse : c'est
 * ce calcul qui a démenti une conclusion qu'on tenait pour acquise, et un
 * instrument qui contredit doit d'abord se laisser vérifier.
 */
export function tarjan(
  praticable: Uint8Array,
  cols: number,
  rows: number,
): { composantes: number; articulations: number; goulets: number } {
  const n = cols * rows;
  const num = new Int32Array(n).fill(-1);
  const bas = new Int32Array(n);
  const parent = new Int32Array(n).fill(-2);
  const estArticulation = new Uint8Array(n);
  /* Taille du sous-arbre de parcours, et morceaux détachés par chaque
     articulation : de quoi distinguer un goulet d'un cul-de-sac. */
  const taille = new Int32Array(n).fill(1);
  const morceaux = new Map<number, number[]>();
  const detache = (p: number, t: number): void => {
    const l = morceaux.get(p);
    if (l) l.push(t);
    else morceaux.set(p, [t]);
  };
  /** Pour chaque sommet, la racine de sa composante, puis sa taille. */
  const racine = new Int32Array(n).fill(-1);
  let compteur = 0;
  let composantes = 0;

  const voisins = (i: number, k: number): number => {
    const col = i % cols;
    const row = (i / cols) | 0;
    const dc = (k % 3) - 1;
    const dr = ((k / 3) | 0) - 1;
    if (!dc && !dr) return -1;
    const c = col + dc;
    const r = row + dr;
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    const j = r * cols + c;
    return praticable[j] ? j : -1;
  };

  const pile = new Int32Array(n * 2);
  for (let depart = 0; depart < n; depart++) {
    if (!praticable[depart] || num[depart] >= 0) continue;
    composantes++;
    let racineEnfants = 0;
    let sp = 0;
    pile[sp++] = depart;
    pile[sp++] = 0;
    num[depart] = bas[depart] = compteur++;
    parent[depart] = -1;
    racine[depart] = depart;

    while (sp > 0) {
      const k = pile[sp - 1];
      const i = pile[sp - 2];
      if (k < 9) {
        pile[sp - 1] = k + 1;
        const j = voisins(i, k);
        if (j < 0 || j === parent[i]) continue;
        if (num[j] >= 0) {
          if (num[j] < bas[i]) bas[i] = num[j];
          continue;
        }
        parent[j] = i;
        num[j] = bas[j] = compteur++;
        racine[j] = depart;
        if (i === depart) racineEnfants++;
        pile[sp++] = j;
        pile[sp++] = 0;
      } else {
        sp -= 2;
        if (sp > 0) {
          const p = pile[sp - 2];
          if (bas[i] < bas[p]) bas[p] = bas[i];
          taille[p] += taille[i];
          /* La racine se sépare par CHACUN de ses sous-arbres ; les autres
             sommets, seulement par les sous-arbres qui ne remontent pas
             au-dessus d'eux. */
          if (p === depart) detache(p, taille[i]);
          else if (bas[i] >= num[p]) {
            estArticulation[p] = 1;
            detache(p, taille[i]);
          }
        }
      }
    }
    if (racineEnfants > 1) estArticulation[depart] = 1;
  }

  let articulations = 0;
  let goulets = 0;
  for (let i = 0; i < n; i++) {
    if (!estArticulation[i]) continue;
    articulations++;
    /* Les morceaux : les sous-arbres détachés, plus tout le reste de la
       composante. Un goulet est une articulation dont le PLUS PETIT morceau
       vaut le détour — sinon c'est le col d'un recoin. */
    const parts = morceaux.get(i) ?? [];
    const total = taille[racine[i]];
    const reste = total - 1 - parts.reduce((a, b) => a + b, 0);
    let petit = reste > 0 ? reste : Number.MAX_SAFE_INTEGER;
    for (const t of parts) if (t < petit) petit = t;
    if (petit >= GOULET_MIN) goulets++;
  }
  return { composantes, articulations, goulets };
}

/* ─────────────────────────────────── Sortie ──────────────────────────────── */

function pourcent(x: number): string {
  return (100 * x).toFixed(2) + ' %';
}

function ligne(label: string, valeur: string, cible?: string): void {
  const l = label.padEnd(42);
  const v = valeur.padStart(14);
  console.log(cible ? `  ${l}${v}    cible ${cible}` : `  ${l}${v}`);
}

function imprimer(r: Rapport): void {
  console.log(`\n╔═ Carte, graine ${r.graine} ═══════════════════════════════════════════`);

  console.log('\n▸ Surface');
  ligne('cellules', String(r.cellules));
  ligne('praticables', String(r.praticables));
  ligne('infranchissables', `${String(r.infranchissables)} (${pourcent(r.partInfranchissable)})`,
    `≥ ${pourcent(CIBLE_INFRANCHISSABLE_MIN)}`);
  const terrainsTries = Object.entries(r.terrains).sort((a, b) => b[1] - a[1]);
  for (const [t, c] of terrainsTries) {
    ligne(`  ${t}`, `${String(c)} (${pourcent(c / r.cellules)})`);
  }

  console.log('\n▸ Densité d’objets');
  ligne('objets posés', String(r.objets));
  ligne('cases d’emprise', `${String(r.emprise)} (${pourcent(r.emprise / r.cellules)})`);
  ligne('une case praticable sur', `${r.casesParObjet.toFixed(0)}`, `≤ ${String(CIBLE_CASES_PAR_OBJET)}`);
  const manquants = Math.max(0, Math.ceil(r.praticables / CIBLE_CASES_PAR_OBJET) - r.objets);
  ligne('objets à ajouter pour la cible', String(manquants));
  const natures = Object.entries(r.objetsParNature).sort((a, b) => b[1] - a[1]);
  for (const [k, c] of natures) ligne(`  ${k}`, String(c));

  console.log('\n▸ Ce que le joueur rencontre');
  ligne('distance moyenne au plus proche objet', `${r.distanceMoyenne.toFixed(1)} cases`);
  ligne('médiane', `${r.distanceMediane.toFixed(0)} cases`);
  ligne('9ᵉ décile', `${r.distanceP90.toFixed(0)} cases`);
  ligne('pire cas', `${r.distanceMax.toFixed(0)} cases`);
  ligne('blocs 14×14 sans aucun objet', `${String(r.blocsVides)} / ${String(r.blocsTotal)}`, '0');

  console.log('\n▸ Le héros glaneur — jeu parfait, omniscient, sans combat');
  for (const g of r.glanage) {
    ligne(
      `  ${g.depart}`,
      `${String(g.jour7)} / ${String(g.jour14)} / ${String(g.jour28)}`,
    );
  }
  const parJour = r.glanage.reduce((a, g) => a + g.objetsParJour, 0) / Math.max(1, r.glanage.length);
  const coutMedian = mediane(r.glanage.map((g) => g.coutMedianEntreObjets));
  ligne('objets ramassés par jour, en moyenne', parJour.toFixed(1),
    `≥ ${String(CIBLE_OBJETS_PAR_JOUR)}`);
  ligne('coût médian entre deux objets', `${coutMedian.toFixed(0)} pts`);
  console.log('     (colonnes : objets ramassés à 7 jours / 14 jours / 28 jours)');

  console.log('\n▸ Structure — zones et goulets');
  ligne('composantes praticables', String(r.composantes));
  ligne('points d’articulation', String(r.articulations));
  ligne('dont vrais goulets (≥ 25 cases détachées)', String(r.goulets));
  const largeurs = r.coupes.map((c) => c.coupe).sort((a, b) => a - b);
  ligne('coupe entre capitales — la plus étroite', String(largeurs[0] ?? 0));
  ligne('  médiane des dix paires', String(mediane(largeurs)));
  ligne('  la plus large', String(largeurs[largeurs.length - 1] ?? 0),
    `≤ ${String(CIBLE_COUPE_MAX)}`);
  for (const c of r.coupes) {
    ligne(`  ${c.de} ↔ ${c.a}`, String(c.coupe));
  }
  console.log('\n▸ Murs de crête — un mur troué n’est pas un mur');
  for (const m of r.murs) {
    const l = `  ${m.label}`.padEnd(42);
    const v = `${String(m.mur)} / ${String(m.axe)}`.padStart(14);
    console.log(
      `  ${l}${v}    trous : voie ${String(m.trousVoie)} · eau ${String(m.trousEau)} · autres ${String(m.trousAutres)}`,
    );
  }

  ligne('gardes posés', String(r.gardes));
  /* Seule la compagnie des POSTES doit bloquer : les errantes protègent les
     trésors des lisières, pas les passages — leur case d'entrée suffit. */
  console.log('  terre libre depuis chaque capitale, sans livrer un combat :');
  for (const t of r.terreLibre) {
    const part = (100 * t.libre) / Math.max(1, r.praticables);
    ligne(`    ${t.depart}`, `${String(t.libre)} (${part.toFixed(0)} %)`);
  }
  ligne('postes qui bloquent vraiment', `${String(r.gardesBloquants)} / ${String(r.gardes)}`,
    '≥ 20 postes');

  console.log('\n▸ Rappel — pourquoi ces cibles');
  console.log('  Un objet toutes les 35 à 50 cases : densité d’une carte HMM3 de');
  console.log('  taille comparable, recomptée famille par famille sur une XL de');
  console.log('  144 × 144 (400 à 620 lieux).');
  console.log('  La coupe entre capitales : HMM3 relie ses zones par « un à trois »');
  console.log('  passages, et son générateur pose en règle que les liaisons larges ne');
  console.log('  sont jamais gardées, parce qu’une liaison large ne se tient pas. La');
  console.log('  coupe est la traduction littérale de cette règle : le nombre de cases');
  console.log('  à boucher pour séparer deux capitales. Les points d’articulation ne');
  console.log('  la remplacent pas — il en faudrait un passage UNIQUE, ce que HMM3 ne');
  console.log('  fait pas.');
  console.log('  Un garde qui ne déborde pas de sa case d’entrée ne bloque rien : le');
  console.log('  calcul de chemin l’ignore.');
  console.log('');
}

/* ──────────────────────────────────── Main ───────────────────────────────── */

/**
 * Le tableau de bord ne s'imprime que lancé à la main.
 *
 * Sans cette garde, importer `mesurer` — ce que fait `carte.test.ts` pour tenir
 * les seuils — rejouait toute la sortie au milieu du rapport de tests.
 */
function estPointDEntree(): boolean {
  const entree = process.argv[1] ?? '';
  return entree.endsWith('carte.ts') || entree.endsWith('carte.js');
}

if (estPointDEntree()) {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const graine = Number(args.find((a) => /^\d+$/.test(a)) ?? GRAINE_DEMO);

  const rapport = mesurer(graine);
  if (json) console.log(JSON.stringify(rapport, null, 2));
  else imprimer(rapport);
}
