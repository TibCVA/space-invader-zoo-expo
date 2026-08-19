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
 *     120 à 150 cases praticables** ; nous en étions à une toutes les 370 ;
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
import { buildWorld, COLS, ROWS, START_POSITIONS } from '@auvergne/map';
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

const CIBLE_CASES_PAR_OBJET = 150; // borne haute de la fourchette 120–150
const CIBLE_ARTICULATIONS_MIN = 12; // au moins une douzaine de vrais goulets
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

interface Rapport {
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
  composantes: number;
  gardes: number;
  gardesBloquants: number;
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

function mesurer(graine: number): Rapport {
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

  /* Blocs de 32×32 sans le moindre objet : la mesure du « on marche mille cases
     sans rien rencontrer ». */
  const PAS = 32;
  let blocsVides = 0;
  let blocsTotal = 0;
  for (let br = 0; br < rows; br += PAS) {
    for (let bc = 0; bc < cols; bc += PAS) {
      let praticableDansBloc = false;
      let objetDansBloc = false;
      for (let r = br; r < Math.min(br + PAS, rows) && !objetDansBloc; r++) {
        for (let c = bc; c < Math.min(bc + PAS, cols); c++) {
          const i = r * cols + c;
          if (praticable[i]) praticableDansBloc = true;
          if (occupe[i]) {
            objetDansBloc = true;
            break;
          }
        }
      }
      if (!praticableDansBloc) continue;
      blocsTotal++;
      if (!objetDansBloc) blocsVides++;
    }
  }

  /* Composantes connexes et points d'articulation, par Tarjan itératif — la
     récursion déborde la pile sur cent mille sommets. Un point d'articulation
     est un goulet : le retirer coupe la carte en deux. HMM3 en vit. */
  const { composantes, articulations } = tarjan(praticable, cols, rows);

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
    composantes,
    gardes,
    gardesBloquants,
    glanage,
  };
}

/** Composantes connexes et points d'articulation, sans récursion. */
function tarjan(
  praticable: Uint8Array,
  cols: number,
  rows: number,
): { composantes: number; articulations: number } {
  const n = cols * rows;
  const num = new Int32Array(n).fill(-1);
  const bas = new Int32Array(n);
  const parent = new Int32Array(n).fill(-2);
  const estArticulation = new Uint8Array(n);
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
        if (i === depart) racineEnfants++;
        pile[sp++] = j;
        pile[sp++] = 0;
      } else {
        sp -= 2;
        if (sp > 0) {
          const p = pile[sp - 2];
          if (bas[i] < bas[p]) bas[p] = bas[i];
          if (p !== depart && bas[i] >= num[p]) estArticulation[p] = 1;
        }
      }
    }
    if (racineEnfants > 1) estArticulation[depart] = 1;
  }

  let articulations = 0;
  for (let i = 0; i < n; i++) if (estArticulation[i]) articulations++;
  return { composantes, articulations };
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
  ligne('blocs 32×32 sans aucun objet', `${String(r.blocsVides)} / ${String(r.blocsTotal)}`, '0');

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
  ligne('points d’articulation', String(r.articulations), `≥ ${String(CIBLE_ARTICULATIONS_MIN)}`);
  ligne('gardes posés', String(r.gardes));
  /* Seule la compagnie des POSTES doit bloquer : les errantes protègent les
     trésors des lisières, pas les passages — leur case d'entrée suffit. */
  ligne('postes qui bloquent vraiment', `${String(r.gardesBloquants)} / ${String(r.gardes)}`,
    '≥ 20 postes');

  console.log('\n▸ Rappel — pourquoi ces cibles');
  console.log('  Un objet toutes les 120 à 150 cases : densité d’une carte HMM3 de');
  console.log('  taille comparable. Des points d’articulation : HMM3 relie ses zones par');
  console.log('  des liaisons étroites et gardées, et son générateur pose en règle que');
  console.log('  les liaisons larges ne sont jamais gardées. Un garde qui ne déborde pas');
  console.log('  de sa case d’entrée ne bloque rien : le calcul de chemin l’ignore.');
  console.log('');
}

/* ──────────────────────────────────── Main ───────────────────────────────── */

const args = process.argv.slice(2);
const json = args.includes('--json');
const graine = Number(args.find((a) => /^\d+$/.test(a)) ?? GRAINE_DEMO);

const rapport = mesurer(graine);
if (json) console.log(JSON.stringify(rapport, null, 2));
else imprimer(rapport);
