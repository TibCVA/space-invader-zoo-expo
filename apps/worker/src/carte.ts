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
  ECART_MINIMAL,
  REGION_LABELS,
  ROWS,
  START_POSITIONS,
  cleEspacement,
  startEconomy,
  integriteDesMurs,
  objectValue,
  type MurMesure,
} from '@auvergne/map';
import { REGIONS } from '@auvergne/engine';
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
  repartition: Repartition;
  glanage: Glanage[];
  /**
   * Valeur économique accessible depuis chaque départ, telle que la passe
   * d'équilibrage la mesure, et l'écart relatif qui reste.
   *
   * Il fallait l'imprimer : la compensation pose des tas jusqu'à ramener
   * l'écart sous trois pour cent, et son plafond de tas est désormais un budget
   * par départ. Si le budget ne suffit pas, l'écart RESTE — et il vaut mieux le
   * lire ici que le découvrir dans un taux de victoire par capitale.
   */
  economie: { depart: string; valeur: number }[];
  ecartEconomique: number;
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
    objects: {
      kind: string;
      at: { col: number; row: number };
      entrance: { col: number; row: number };
      footprint?: { col: number; row: number }[];
      guard?: readonly { creature: string; count: number }[];
      data: Record<string, unknown>;
    }[];
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
      /*
       * **Un garde bloque désormais par sa seule présence**, et cette ligne
       * disait le contraire.
       *
       * Elle datait du temps où le calcul de chemin ignorait la case d'entrée
       * d'un lieu : un poste ne comptait alors comme bloquant que si son
       * empreinte débordait de cette case, d'où les deux cases de flanc que le
       * semis lui donne. Depuis que le moteur applique la règle de HMM3 — une
       * place gardée ne se traverse pas —, l'entrée bloque aussi le transit, et
       * les flancs ne servent plus qu'à élargir la porte. Le compte reste
       * imprimé parce qu'il dit quelque chose d'utile — combien de postes tiennent
       * plus d'une case — mais il ne dit plus « qui bloque ».
       */
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
   *
   * **Et depuis que le moteur applique la règle de HMM3 — une place gardée ne se
   * traverse pas —, ce ne sont plus les seuls postes qui ferment le passage :
   * TOUT lieu gardé le fait.** Un gisement tenu par une compagnie, un repaire,
   * un sceau bloquent le transit comme un monstre errant de HMM3. La mesure doit
   * dire la même chose que le jeu, sans quoi elle rassure à tort : c'est
   * exactement la faute qu'on a déjà payée avec la table d'espacement recopiée.
   */
  const librePar: { depart: string; libre: number }[] = [];
  {
    const mur = new Uint8Array(n);
    for (const o of w.objects) {
      const garde = (o as { guard?: readonly unknown[] }).guard;
      if (o.kind !== 'garde' && (!garde || garde.length === 0)) continue;
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

  /* L'équité économique des cinq départs, telle que la passe la laisse. */
  const eco = startEconomy(graine);
  const economie = Object.entries(START_POSITIONS).map(([key, s]) => ({
    depart: s.label,
    valeur: eco[key as keyof typeof eco] ?? 0,
  }));
  economie.sort((a, b) => b.valeur - a.valeur);
  const hautEco = economie.length ? economie[0].valeur : 0;
  const basEco = economie.length ? economie[economie.length - 1].valeur : 0;
  const ecart = hautEco > 0 ? Math.round((10000 * (hautEco - basEco)) / hautEco) : 0;

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
    /* `WorldMap` ne porte pas les cantons : on les reprend au terrain fixe, qui
       est le même pour toutes les graines. */
    repartition: mesurerRepartition(
      { objects: w.objects, region: buildTerrain().region },
      praticable,
      cols,
      rows,
    ),
    glanage,
    economie,
    ecartEconomique: ecart,
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

/** Noms des cantons dans l'ordre des index de `world.region`. */
const REGIONS_NOMS: readonly string[] = REGIONS.map((id) => REGION_LABELS[id]);

/* ──────────────────────── Répartition du semis ───────────────────────────── */

/**
 * Ce que le propriétaire demande, traduit en nombres.
 *
 * Trois exigences, textuellement : « je ne veux pas avoir 2 fois le même asset
 * trop proches les uns des autres » ; « assez par zone mais pas trop de la même
 * sorte au même endroit » ; « les assets les plus importants doivent être gardés
 * par des gardes assez forts ». Plus le dosage de la difficulté « en fonction
 * des événements qu'ils gardent et de la proximité du point de départ ».
 *
 * Aucune de ces quatre choses n'était mesurée. Le tableau de bord comptait les
 * objets par nature et par canton vide, ce qui ne dit rien de leur VOISINAGE :
 * quatre gisements de bois collés dans le même vallon et aucun ailleurs
 * passaient la mesure de densité sans broncher. On mesure donc, dans l'ordre du
 * texte du propriétaire.
 */
export interface Repartition {
  /** Par nature : la plus courte distance entre deux objets de cette nature. */
  voisinage: {
    nature: string;
    combien: number;
    minimum: number;
    /** Paires sous l'écart dont AU MOINS UN membre est semé — donc corrigibles. */
    paires: number;
    /** Paires sous l'écart dont les DEUX membres sont écrits à la main. */
    pairesEcrites: number;
    /** Les trois paires les plus rapprochées, pour savoir quoi corriger. */
    fautives: string[];
  }[];
  /** Par canton : combien d'objets, et la nature la plus représentée. */
  cantons: { canton: string; objets: number; gisements: number; dominante: string; part: number }[];
  /** Les objets de forte valeur et la garde qui les tient. */
  gardeParValeur: {
    tranche: string;
    combien: number;
    gardeMediane: number;
    sansGarde: number;
    /**
     * Le détail des non gardés, par nature, du plus nombreux au moins.
     *
     * Sans ce détail le compte ne dit pas quoi faire : « trente-trois lieux
     * sans garde entre six cents et mille cinq cents » se lit comme un défaut
     * grave si ce sont des artefacts, et comme la règle même de HMM3 si ce sont
     * des moulins et des fontaines — un lieu de service ne se garde pas.
     */
    sansGardeParNature: { nature: string; combien: number }[];
  }[];
  /** La garde en fonction de l'éloignement du départ le plus proche. */
  gardeParDistance: { tranche: string; combien: number; gardeMediane: number }[];
  /**
   * La garde des lieux QU'ON TIENT, nature par nature.
   *
   * Les tranches de valeur ne suffisent pas à répondre au propriétaire : « les
   * assets les plus importants doivent être gardés par des gardes assez forts ».
   * Un coffre de deux mille écus est de forte valeur et ne se garde pas — dans
   * HMM3 un coffre au trésor est un ramassage libre — tandis qu'un gisement de
   * cent écus se garde toujours, parce qu'on le POSSÈDE et qu'on le reprend. La
   * mesure suit donc la liste des natures qui se tiennent, et non la valeur
   * seule.
   */
  gardeParNature: {
    nature: string;
    combien: number;
    sansGarde: number;
    gardeMediane: number;
    gardeMin: number;
    gardeMax: number;
    valeurMediane: number;
  }[];
}

/** Distance minimale d'un objet à l'un des cinq départs, en cases. */
function distanceAuxDeparts(praticable: Uint8Array, cols: number, rows: number): Int32Array {
  const n = cols * rows;
  const d = new Int32Array(n).fill(-1);
  const file = new Int32Array(n);
  let tete = 0;
  let queue = 0;
  for (const s of Object.values(START_POSITIONS)) {
    const i = s.at.row * cols + s.at.col;
    if (i < 0 || i >= n || d[i] === 0) continue;
    d[i] = 0;
    file[queue++] = i;
  }
  while (tete < queue) {
    const i = file[tete++];
    const col = i % cols;
    const row = (i / cols) | 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const c = col + dc;
        const r2 = row + dr;
        if (c < 0 || r2 < 0 || c >= cols || r2 >= rows) continue;
        const j = r2 * cols + c;
        if (d[j] >= 0 || !praticable[j]) continue;
        d[j] = d[i] + 1;
        file[queue++] = j;
      }
    }
  }
  return d;
}

/** Puissance d'une garde, au barème du semeur. */
function forceDeGarde(obj: { guard?: readonly { creature: string; count: number }[] }): number {
  if (!obj.guard) return 0;
  let total = 0;
  for (const s of obj.guard) {
    const tier = Number(s.creature.slice(-1));
    total += (TIER_POWER_LOCAL[tier] ?? 100) * s.count;
  }
  return total;
}

/** Le barème du semeur, recopié pour que la mesure parle sa langue. */
const TIER_POWER_LOCAL: readonly number[] = [0, 10, 32, 85, 190, 420, 900, 2100];

/*
 * L'écart minimal voulu entre deux lieux qui se ressemblent vient de
 * `@auvergne/map` — la table du SEMEUR, pas une copie.
 *
 * Il y en avait une copie ici, et elle ne disait pas la même chose : neuf cases
 * entre deux gisements là où le semeur en veut douze entre deux gisements de la
 * MÊME ressource et cinq entre deux gisements différents. Une mesure qui juge
 * avec son propre barème ne mesure pas l'ouvrage, elle mesure sa copie ; c'est
 * ainsi qu'on se félicite d'un résultat que le jeu n'a pas. La copie est donc
 * supprimée, et le regroupement se fait sur la CLEF d'espacement du semeur —
 * `mine|bois`, `ressource|sel` — et non sur la seule nature.
 */

/** Le seuil du semeur pour une clef d'espacement, avec son propre repli. */
function seuilDe(cle: string): number {
  const nature = cle.split('|')[0];
  return ECART_MINIMAL[cle] ?? ECART_MINIMAL[nature] ?? 6;
}

function mediane2(xs: number[]): number {
  if (!xs.length) return 0;
  const t = [...xs].sort((a, b) => a - b);
  const m = t.length >> 1;
  return t.length % 2 ? t[m] : Math.round((t[m - 1] + t[m]) / 2);
}

function mesurerRepartition(
  w: { objects: readonly { kind: string; at: { col: number; row: number }; entrance: { col: number; row: number }; guard?: readonly { creature: string; count: number }[]; data: Record<string, unknown> }[]; region: ArrayLike<number> },
  praticable: Uint8Array,
  cols: number,
  rows: number,
): Repartition {
  /* — Voisinage : la plus courte distance entre deux lieux de MÊME CLEF — */
  const parNature = new Map<string, { col: number; row: number; ecrit: boolean }[]>();
  for (const o of w.objects) {
    const cle = cleEspacement(o.kind, o.data);
    const p = { col: o.at.col, row: o.at.row, ecrit: o.data.fixe === true };
    const l = parNature.get(cle);
    if (l) l.push(p);
    else parNature.set(cle, [p]);
  }
  const nomDe = new Map<string, string>();
  for (const o of w.objects) {
    const n = (o.data.name as string | undefined) ?? (o.data.resource as string | undefined) ?? o.kind;
    nomDe.set(`${cleEspacement(o.kind, o.data)}|${String(o.at.col)},${String(o.at.row)}`, n);
  }
  const voisinage: Repartition['voisinage'] = [];
  for (const [nature, ats] of parNature) {
    let minimum = Number.MAX_SAFE_INTEGER;
    let paires = 0;
    let pairesEcrites = 0;
    const seuil = seuilDe(nature);
    const proches: { d: number; texte: string }[] = [];
    for (let i = 0; i < ats.length; i++) {
      for (let j = i + 1; j < ats.length; j++) {
        const d = Math.max(Math.abs(ats[i].col - ats[j].col), Math.abs(ats[i].row - ats[j].row));
        if (d < minimum) minimum = d;
        if (d >= seuil) continue;
        /*
         * Deux lieux écrits à la main ne sont pas un défaut du semis : la
         * géographie est fixe (document maître §4), et le semeur n'a pas le
         * pouvoir de les écarter. On les compte à part plutôt que de baisser la
         * cible pour les faire disparaître.
         */
        if (ats[i].ecrit && ats[j].ecrit) {
          pairesEcrites++;
          continue;
        }
        paires++;
        const na = nomDe.get(`${nature}|${String(ats[i].col)},${String(ats[i].row)}`) ?? '?';
        const nb = nomDe.get(`${nature}|${String(ats[j].col)},${String(ats[j].row)}`) ?? '?';
        proches.push({
          d,
          texte: `${String(d)} : ${na} (${String(ats[i].col)},${String(ats[i].row)}) / ${nb} (${String(ats[j].col)},${String(ats[j].row)})`,
        });
      }
    }
    proches.sort((a, b) => a.d - b.d);
    voisinage.push({
      nature,
      combien: ats.length,
      minimum: ats.length > 1 ? minimum : 0,
      paires,
      pairesEcrites,
      fautives: proches.slice(0, 3).map((x) => x.texte),
    });
  }
  voisinage.sort(
    (a, b) => b.paires - a.paires || b.pairesEcrites - a.pairesEcrites || a.nature.localeCompare(b.nature),
  );

  /* — Cantons : combien d'objets, et la nature qui domine — */
  const parCanton = new Map<number, Map<string, number>>();
  for (const o of w.objects) {
    const reg = w.region[o.at.row * cols + o.at.col] | 0;
    let m = parCanton.get(reg);
    if (!m) {
      m = new Map();
      parCanton.set(reg, m);
    }
    m.set(o.kind, (m.get(o.kind) ?? 0) + 1);
  }
  const cantons: Repartition['cantons'] = [];
  for (const [reg, m] of parCanton) {
    let objets = 0;
    let dominante = '';
    let max = 0;
    for (const [k, v] of m) {
      objets += v;
      if (v > max) {
        max = v;
        dominante = k;
      }
    }
    cantons.push({
      canton: REGIONS_NOMS[reg] ?? `canton ${String(reg)}`,
      objets,
      gisements: m.get('mine') ?? 0,
      dominante,
      part: objets ? Math.round((100 * max) / objets) : 0,
    });
  }
  cantons.sort((a, b) => a.objets - b.objets);

  /* — La garde en fonction de la valeur gardée — */
  const tranchesValeur: { nom: string; min: number; max: number }[] = [
    { nom: 'valeur < 200', min: 0, max: 200 },
    { nom: '200 à 600', min: 200, max: 600 },
    { nom: '600 à 1 500', min: 600, max: 1500 },
    { nom: '1 500 et plus', min: 1500, max: Number.MAX_SAFE_INTEGER },
  ];
  const gardeParValeur: Repartition['gardeParValeur'] = tranchesValeur.map((t) => {
    const forces: number[] = [];
    let sansGarde = 0;
    const nues = new Map<string, number>();
    for (const o of w.objects) {
      if (o.kind === 'garde' || o.kind === 'ville') continue;
      const v = objectValue(o as never);
      if (v < t.min || v >= t.max) continue;
      const f = forceDeGarde(o);
      forces.push(f);
      if (f === 0) {
        sansGarde++;
        nues.set(o.kind, (nues.get(o.kind) ?? 0) + 1);
      }
    }
    return {
      tranche: t.nom,
      combien: forces.length,
      gardeMediane: mediane2(forces),
      sansGarde,
      sansGardeParNature: [...nues]
        .map(([nature, combien]) => ({ nature, combien }))
        .sort((a, b) => b.combien - a.combien || a.nature.localeCompare(b.nature)),
    };
  });

  /* — La garde en fonction de l'éloignement du départ le plus proche — */
  const dist = distanceAuxDeparts(praticable, cols, rows);
  const tranchesDist: { nom: string; min: number; max: number }[] = [
    { nom: 'à moins de 12 cases', min: 0, max: 12 },
    { nom: '12 à 25 cases', min: 12, max: 25 },
    { nom: '25 à 45 cases', min: 25, max: 45 },
    { nom: 'au-delà de 45', min: 45, max: Number.MAX_SAFE_INTEGER },
  ];
  const gardeParDistance: Repartition['gardeParDistance'] = tranchesDist.map((t) => {
    const forces: number[] = [];
    for (const o of w.objects) {
      const f = forceDeGarde(o);
      if (f === 0) continue;
      const d = dist[o.entrance.row * cols + o.entrance.col];
      if (d < 0 || d < t.min || d >= t.max) continue;
      forces.push(f);
    }
    return { tranche: t.nom, combien: forces.length, gardeMediane: mediane2(forces) };
  });

  /* — La garde des natures qu'on tient — */
  const NATURES_TENUES = [
    'ville',
    'maison_tresor',
    'sceau',
    'banque',
    'mine',
    'artefact',
    'demeure',
    'village',
  ] as const;
  const gardeParNature: Repartition['gardeParNature'] = [];
  for (const nature of NATURES_TENUES) {
    const forces: number[] = [];
    const valeurs: number[] = [];
    let sansGarde = 0;
    for (const o of w.objects) {
      if (o.kind !== nature) continue;
      const f = forceDeGarde(o);
      forces.push(f);
      valeurs.push(objectValue(o as never));
      if (f === 0) sansGarde++;
    }
    if (forces.length === 0) continue;
    gardeParNature.push({
      nature,
      combien: forces.length,
      sansGarde,
      gardeMediane: mediane2(forces),
      gardeMin: Math.min(...forces),
      gardeMax: Math.max(...forces),
      valeurMediane: mediane2(valeurs),
    });
  }

  return { voisinage, cantons, gardeParValeur, gardeParDistance, gardeParNature };
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

  console.log('\n▸ Équité économique des cinq départs');
  for (const e of r.economie) ligne(`  ${e.depart}`, `${String(e.valeur)} écus accessibles`);
  ligne(
    'écart entre le plus riche et le plus pauvre',
    `${(r.ecartEconomique / 100).toFixed(2)} %`,
    'cible ≤ 3.00 %',
  );

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

  console.log('\n▸ Répartition — deux fois la même chose, trop près');
  console.log(
    '    (écart voulu par CLEF d’espacement du semeur ; « paires » = celles qui y contreviennent,',
  );
  console.log('     « écrites à la main » = les deux membres viennent de la géographie fixe)');
  for (const v of r.repartition.voisinage) {
    if (v.combien < 2) continue;
    const seuil = seuilDe(v.nature);
    const l = `  ${v.nature}`.padEnd(28);
    console.log(
      `  ${l}${String(v.combien).padStart(4)} objets · plus proche ${String(v.minimum).padStart(3)} ` +
        `(voulu ${String(seuil).padStart(2)}) · ${String(v.paires).padStart(4)} paires trop près` +
        (v.pairesEcrites > 0 ? ` · ${String(v.pairesEcrites)} écrites à la main` : ''),
    );
    for (const f of v.fautives) console.log(`      ${f}`);
  }

  console.log('\n▸ Répartition — par canton');
  for (const c of r.repartition.cantons) {
    const l = `  ${c.canton}`.padEnd(28);
    console.log(
      `  ${l}${String(c.objets).padStart(4)} objets · ${String(c.gisements).padStart(2)} gisements · ` +
        `dominante ${c.dominante} à ${String(c.part)} %`,
    );
  }

  console.log('\n▸ Dosage de la garde');
  for (const g of r.repartition.gardeParValeur) {
    ligne(
      `  ${g.tranche}`,
      `${String(g.combien)} lieux`,
      `garde médiane ${String(g.gardeMediane)} · ${String(g.sansGarde)} sans garde`,
    );
    if (g.sansGardeParNature.length > 0) {
      console.log(
        `        nus : ${g.sansGardeParNature
          .map((n) => `${n.nature} ${String(n.combien)}`)
          .join(' · ')}`,
      );
    }
  }
  console.log('    les natures qu’on tient — valeur médiane, puis la garde qui la tient :');
  for (const g of r.repartition.gardeParNature) {
    ligne(
      `    ${g.nature}`,
      `${String(g.combien)} lieux · ${String(g.valeurMediane)} écus`,
      `garde ${String(g.gardeMin)} → ${String(g.gardeMediane)} → ${String(g.gardeMax)}` +
        (g.sansGarde > 0 ? ` · ${String(g.sansGarde)} SANS GARDE` : ''),
    );
  }
  for (const g of r.repartition.gardeParDistance) {
    ligne(`  ${g.tranche}`, `${String(g.combien)} gardes`, `médiane ${String(g.gardeMediane)}`);
  }

  ligne('gardes posés', String(r.gardes));
  /* Seule la compagnie des POSTES doit bloquer : les errantes protègent les
     trésors des lisières, pas les passages — leur case d'entrée suffit. */
  console.log('  terre libre depuis chaque capitale, sans livrer un combat :');
  for (const t of r.terreLibre) {
    const part = (100 * t.libre) / Math.max(1, r.praticables);
    ligne(`    ${t.depart}`, `${String(t.libre)} (${part.toFixed(0)} %)`);
  }
  ligne('postes à plus d’une case', `${String(r.gardesBloquants)} / ${String(r.gardes)}`,
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
