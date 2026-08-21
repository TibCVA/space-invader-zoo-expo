/**
 * `apps/client/src/town/masse.ts` — LA GÉOMÉTRIE DU PLAN DE MASSE.
 *
 * Exigence du propriétaire : « les bâtiments doivent être disposés de manière
 * logique dans tous les espaces, si bien que quand on a tout construit,
 * l'ensemble de la cité est recouverte par des bâtiments à la bonne taille. »
 *
 * Ce module tient d'un seul côté tout ce qui transforme la déclaration d'un
 * bâtiment (`BuildingDef.scene`, source de vérité du placement, en
 * pourcentages 0-100 d'un plan abstrait) en emprise à l'écran :
 *
 *  - les **rectangles de terrasses** par faction ET par orientation — le
 *    panorama portrait n'est pas un recadrage du panorama paysage mais une
 *    autre peinture, où la citadelle occupe une autre région du cadre ;
 *  - le **module** : la taille de référence d'un bâtiment. En paysage c'est
 *    5 % de la largeur du cadre ; en portrait le cadre est étroit et la
 *    citadelle deux fois plus petite en proportion — le module y est majoré,
 *    sans quoi les bâtiments deviennent des confettis (mesuré : 60 px sur un
 *    écran de 844, 13 % de la hauteur de la citadelle contre 30 % en paysage) ;
 *  - la **perspective** : un bâtiment du premier plan (y grand) est plus
 *    grand qu'un bâtiment du fond, comme sur les tableaux de ville de HMM3 ;
 *  - le facteur du canevas peint (les WebP sont des carrés dont l'occupation
 *    encode déjà l'échelle relative des rangs).
 *
 * La vue (`index.ts`) et le test de couverture (`plan-de-masse.test.ts`)
 * lisent LES MÊMES fonctions : le test mesure ce que la vue dessine.
 */
import type { BuildingDef, FactionId } from '@auvergne/engine';

/** Taille de référence d'un bâtiment : fraction de la largeur du cadre. */
export const MODULE_FRACTION = 0.05;
/** Majoration du module quand le panorama portrait est affiché. */
export const MODULE_FACTEUR_PORTRAIT = 1.8;
/** Côté du canevas peint d'un bâtiment, en multiples du module local. */
export const SPRITE_FACTEUR = 1.7;

/** Grossissement du premier plan : 0,78 au fond, 1,20 au pied du tableau. */
export function perspectiveDe(yPct: number): number {
  return 0.78 + (yPct / 100) * 0.42;
}

/** Région constructible d'un panorama, en pourcentages du cadre. */
export interface RectTerrain {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

/**
 * Les terrasses réellement peintes, relevées sur les huit panoramas (deux
 * factions × deux orientations ; les trois heures d'une même faction partagent
 * leur cadrage). Le plan abstrait 0-100 des `BuildingDef.scene` se pose sur ce
 * rectangle : aucun bâtiment ne tombe dans la vallée ni sur les falaises.
 */
export const TERRAIN_CITE: Readonly<
  Record<FactionId, { paysage: RectTerrain; portrait: RectTerrain }>
> = {
  granit: {
    paysage: { x0: 10, x1: 84, y0: 13, y1: 87 },
    portrait: { x0: 12, x1: 88, y0: 22, y1: 64 },
  },
  ermitage: {
    paysage: { x0: 12, x1: 86, y0: 26, y1: 88 },
    portrait: { x0: 10, x1: 88, y0: 32, y1: 62 },
  },
};

/**
 * Les TERRASSES : les sols réellement peints où un pied de bâtiment peut se
 * poser, relevés à l'œil sur chaque panorama (en pourcentages du cadre).
 * Le rectangle `TERRAIN_CITE` cadre le plan d'ensemble ; les terrasses
 * corrigent son mensonge — un rectangle uniforme ignore murets et falaises,
 * et un bâtiment posé près du bord tombait à cheval sur un muret ou à
 * moitié dans le vide (défaut vu sur iPhone par le propriétaire).
 * `basePct` ramène chaque pied dans la terrasse la plus proche.
 */
export const TERRASSES: Readonly<Record<FactionId, { paysage: RectTerrain[]; portrait: RectTerrain[] }>> = {
  granit: {
    paysage: [
      { x0: 34, x1: 50, y0: 20, y1: 27 }, // l'éperon du capitole
      { x0: 52, x1: 64, y0: 25, y1: 31 }, // l'éperon de la haute tour
      { x0: 62, x1: 80, y0: 28, y1: 42 }, // plateau haut, à droite
      { x0: 31, x1: 48, y0: 32, y1: 40 }, // terrasse haute, à gauche
      { x0: 20, x1: 34, y0: 41, y1: 49 }, // terrasse moyenne ouest
      { x0: 32, x1: 72, y0: 43, y1: 56 }, // le grand plateau central
      { x0: 72, x1: 84, y0: 50, y1: 62 }, // terrasse est
      { x0: 12, x1: 28, y0: 50, y1: 60 }, // terrasse des granges
      { x0: 26, x1: 76, y0: 59, y1: 73 }, // le plateau bas, devant la porte
      { x0: 7, x1: 36, y0: 63, y1: 83 },  // la grande basse-cour ouest
      { x0: 66, x1: 82, y0: 64, y1: 75 }, // terrasse basse est
    ],
    portrait: [
      { x0: 29, x1: 56, y0: 25, y1: 31 }, // l'éperon du capitole
      { x0: 55, x1: 87, y0: 29, y1: 40 }, // plateau haut droit
      { x0: 23, x1: 46, y0: 32, y1: 40 }, // terrasse haute gauche
      { x0: 15, x1: 40, y0: 41, y1: 48 }, // moyenne ouest
      { x0: 31, x1: 68, y0: 42, y1: 54 }, // grand plateau central
      { x0: 61, x1: 87, y0: 41, y1: 50 }, // moyenne est
      { x0: 11, x1: 42, y0: 50, y1: 61 }, // basse-cour ouest
      { x0: 47, x1: 79, y0: 50, y1: 59 }, // plateau bas est
    ],
  },
  ermitage: {
    paysage: [
      { x0: 33, x1: 56, y0: 33, y1: 44 }, // la butte du grand arbre
      { x0: 52, x1: 64, y0: 37, y1: 44 }, // la clairière de la grotte
      { x0: 64, x1: 83, y0: 37, y1: 52 }, // le plateau de la guilde
      { x0: 17, x1: 34, y0: 41, y1: 56 }, // les terrasses des sources
      { x0: 34, x1: 62, y0: 48, y1: 62 }, // la clairière centrale
      { x0: 60, x1: 83, y0: 55, y1: 71 }, // la rive droite du ruisseau
      { x0: 13, x1: 40, y0: 59, y1: 77 }, // la grande clairière basse
      { x0: 40, x1: 58, y0: 62, y1: 75 }, // devant la porte
    ],
    portrait: [
      { x0: 25, x1: 57, y0: 33, y1: 42 }, // la butte du grand arbre
      { x0: 60, x1: 87, y0: 34, y1: 42 }, // clairière haute droite
      { x0: 9, x1: 45, y0: 41, y1: 48 },  // clairière gauche
      { x0: 27, x1: 59, y0: 44, y1: 54 }, // clairière centrale
      { x0: 62, x1: 90, y0: 44, y1: 52 }, // rive droite
      { x0: 9, x1: 49, y0: 49, y1: 61 },  // grande clairière basse
      { x0: 57, x1: 86, y0: 52, y1: 60 }, // clairière basse droite
    ],
  },
};

/** Rapport hauteur/largeur du cadre, par orientation (panoramas 16:9 et 9:16). */
function aspectDe(portrait: boolean): number {
  return portrait ? 2048 / 1152 : 1152 / 2048;
}

/**
 * Le pied d'un bâtiment, en pourcentages du cadre : la position déclarée par
 * le contenu, posée sur le rectangle des terrasses, puis RAMENÉE dans la
 * terrasse la plus proche — avec une marge horizontale égale à sa
 * demi-largeur (bornée à la demi-terrasse) pour que le canevas ne déborde
 * pas dans le vide. La distance point-terrasse pèse l'axe vertical par le
 * rapport du cadre, pour que « le plus proche » soit vrai à l'écran.
 */
export function basePct(
  def: BuildingDef,
  faction: FactionId,
  portrait: boolean,
): { x: number; y: number } {
  const t = TERRAIN_CITE[faction][portrait ? 'portrait' : 'paysage'];
  const x = t.x0 + ((t.x1 - t.x0) * def.scene.x) / 100;
  const y = t.y0 + ((t.y1 - t.y0) * def.scene.y) / 100;

  return surLaTerrasse(x, y, demiPct(def, portrait), faction, portrait);
}

/**
 * Demi-largeur du canevas d'un bâtiment, en % de la largeur du cadre —
 * indépendante des pixels : module (fraction de largeur) × échelle ×
 * perspective × canevas. Exportée pour que le desserrage raisonne dans la
 * même unité que le placement.
 */
export function demiPct(def: BuildingDef, portrait: boolean): number {
  return (
    (MODULE_FRACTION *
      (portrait ? MODULE_FACTEUR_PORTRAIT : 1) *
      (def.scene.scale / 100) *
      perspectiveDe(def.scene.y) *
      SPRITE_FACTEUR *
      100) /
    2
  );
}

/**
 * Demi-largeur de la MASSE VISIBLE d'un bâtiment, en % de la largeur du cadre.
 *
 * `demiPct` mesure le canevas peint, qui est un carré dont les bords sont
 * transparents : `SPRITE_FACTEUR` est précisément la marge que le carré ajoute
 * autour de la maison. Espacer les bâtiments de leurs canevas revient donc à
 * les espacer de leur vide — mesuré, cela vidait la Châtellenie (couverture des
 * terrasses 81 % → 73 %) sans mieux les séparer. C'est cette demi-largeur-ci,
 * celle qu'on voit, que le desserrage doit respecter.
 */
export function demiVuePct(def: BuildingDef, portrait: boolean): number {
  return demiPct(def, portrait) / SPRITE_FACTEUR;
}

/**
 * Ramène un pied dans la terrasse la plus proche, avec une marge horizontale
 * égale à sa demi-largeur (bornée à la demi-terrasse) pour que le canevas ne
 * déborde pas dans le vide. La distance point-terrasse pèse l'axe vertical par
 * le rapport du cadre, pour que « le plus proche » soit vrai à l'écran.
 *
 * Extrait de `basePct` pour être réutilisé par le desserrage : un bâtiment
 * qu'on écarte de son voisin doit rester sur une terrasse, sinon il flotte
 * au-dessus du vide.
 */
function surLaTerrasse(
  x: number,
  y: number,
  demi: number,
  faction: FactionId,
  portrait: boolean,
): { x: number; y: number } {
  const aspect = aspectDe(portrait);
  let meilleure: RectTerrain | null = null;
  let meilleureDist = Infinity;
  for (const r of TERRASSES[faction][portrait ? 'portrait' : 'paysage']) {
    const dx = Math.max(r.x0 - x, 0, x - r.x1);
    const dy = Math.max(r.y0 - y, 0, y - r.y1) * aspect;
    const d = dx * dx + dy * dy;
    if (d < meilleureDist) {
      meilleureDist = d;
      meilleure = r;
    }
  }
  if (!meilleure) return { x, y };
  const margeX = Math.min(demi, (meilleure.x1 - meilleure.x0) / 2);
  return {
    x: Math.max(meilleure.x0 + margeX, Math.min(meilleure.x1 - margeX, x)),
    y: Math.max(meilleure.y0 + 1, Math.min(meilleure.y1 - 1, y)),
  };
}

/** Module local du tableau : la taille de référence en pixels. */
export function moduleDe(cadreLargeur: number, portrait: boolean): number {
  return cadreLargeur * MODULE_FRACTION * (portrait ? MODULE_FACTEUR_PORTRAIT : 1);
}

/** Taille d'un bâtiment en pixels du cadre, perspective comprise. */
export function tailleDe(def: BuildingDef, module: number): number {
  return module * (def.scene.scale / 100) * perspectiveDe(def.scene.y);
}

/**
 * Les bâtiments à peindre parmi ceux qui sont levés : une amélioration de
 * demeure remplace sa demeure sur la même emprise — on agrandit la maison,
 * on ne pose pas un cabanon à côté (sémantique HMM3).
 */
export function visiblesDe(
  catalogue: readonly BuildingDef[],
  batis: ReadonlySet<string>,
): BuildingDef[] {
  const remplaces = new Set<string>();
  for (const id of batis) {
    const i = id.indexOf('_amelioration_');
    if (i >= 0) remplaces.add(`${id.slice(0, i)}_demeure_${id.slice(i + '_amelioration_'.length)}`);
  }
  return catalogue.filter((d) => batis.has(d.id) && !remplaces.has(d.id));
}

/**
 * Clef d'atlas de la peinture d'un bâtiment. Les améliorations n'ont pas de
 * peinture propre : elles reprennent celle de leur demeure, que `visiblesDe`
 * retire du tableau — la demeure « grandit » d'un cran d'échelle.
 */
export function clefAssetBatiment(id: string): string | null {
  const i = id.indexOf('_amelioration_');
  if (i >= 0) return `bati_${id.slice(0, i)}_demeure_${id.slice(i + '_amelioration_'.length)}`;
  return `bati_${id}`;
}

/* ─────────────────────────── Desserrage du plan ──────────────────────────── */

/**
 * DEUX BÂTIMENTS NE DOIVENT PAS SE MARCHER DESSUS.
 *
 * **Le défaut, mesuré.** `basePct` place chaque bâtiment SEUL : il lit la
 * position déclarée par le contenu et la ramène sur une terrasse, sans jamais
 * regarder les voisins. Rien, nulle part, ne vérifiait un écart minimal — les
 * seize gardes du plan de masse tiennent les terrasses, l'axe de la porte et
 * les chaînes, mais aucune ne tient la distance entre deux bâtiments
 * distincts.
 *
 * Mesuré sur un cadre de 1536, tout construit, chaînes exclues :
 *
 *  - Châtellenie : 21 paires qui se chevauchent, dont « Écuries du Forez /
 *    Porte des Farges » à 18 pixels pour 160 de demi-largeurs cumulées —
 *    autrement dit l'une DANS l'autre ;
 *  - Ermitage : 70 paires, dont 22 très serrées ; « Forge comtale / Mur de
 *    racines » à 24 pixels pour 159.
 *
 * Le propriétaire l'a dit simplement : « les bâtiments sont trop proches les
 * uns des autres ».
 *
 * **Le correctif.** Une passe de desserrage, après le placement et avant le
 * dessin : les voisins trop serrés se repoussent, et chacun est aussitôt
 * ramené sur sa terrasse. Trois propriétés tiennent :
 *
 *  - **déterministe** : nombre d'itérations fixe, ordre fixe, aucun hasard.
 *    La même cité rend le même plan, ce dont dépendent les captures ;
 *  - **les chaînes ne se séparent JAMAIS** : une palissade qui devient
 *    rempart puis château occupe une seule emprise, c'est la sémantique de
 *    HMM3 et une garde l'exige. Les membres d'une chaîne sont donc un seul
 *    nœud, qui se déplace d'un bloc ;
 *  - **la terrasse l'emporte** : on préfère deux bâtiments encore un peu
 *    proches à un bâtiment qui flotte hors du sol.
 */

/** Ce que le desserrage a besoin de savoir de chaque bâtiment. */
export interface NoeudPlan {
  readonly id: string;
  /** clef d'emprise : la chaîne si le bâtiment en fait partie, sinon son id */
  readonly emprise: string;
  readonly x: number;
  readonly y: number;
  /** demi-largeur du canevas, en % de la largeur du cadre */
  readonly demi: number;
}

/**
 * Écart visé entre deux bâtiments, en part de la somme de leurs demi-largeurs.
 *
 * Un sur un veut dire « les deux masses visibles se touchent tout juste ».
 * Le balayage — sur les quatre panoramas, tout construit, en mesurant la
 * couverture des terrasses ET la profondeur du pire enfouissement — le donne
 * gagnant partout. Il n'y a pas de compromis à arbitrer : c'est le même
 * réglage qui sépare le mieux et qui remplit le mieux.
 *
 * ```
 *                        couverture   paires enfouies   pire rapport
 *   Châtellenie paysage    81 → 85 %        2 → 0         0,13 → 0,72
 *   Ermitage    paysage    90 → 90 %       15 → 0         0,19 → 0,72
 *   Châtellenie portrait  100 → 100 %      27 → 0         0,25 → 0,61
 *   Ermitage    portrait  100 → 100 %      39 → 4         0,07 → 0,49
 * ```
 *
 * (« enfouies » = les deux masses se recouvrent de plus de 40 % ; « pire
 * rapport » = la paire la plus imbriquée du tableau, 1 voulant dire qu'elles
 * se touchent sans se recouvrir.) Avant, un bâtiment pouvait disparaître à 93 %
 * dans son voisin ; après, aucun n'en perd plus de la moitié.
 *
 * Viser plus large ne sert à rien : au-delà, la terrasse refuse le surplus, le
 * plan se tasse contre ses bords et la cité se vide sans mieux se séparer
 * (à 1,5 la Châtellenie retombe à 73 % de couverture).
 */
const ECART_VISE = 1;

/**
 * Nombre de passes. La contrainte de terrasse, réappliquée après chaque
 * poussée, fait converger lentement : le plan travaille encore bien au-delà
 * de vingt-quatre passes.
 */
const PASSES_DESSERRAGE = 60;

/** Une emprise en cours de desserrage. */
interface Groupe {
  x: number;
  y: number;
  /** la plus grande demi-largeur de l'emprise : une chaîne tient sa place */
  demi: number;
  readonly ids: string[];
}

/**
 * Part de la poussée demandée qu'on accorde à chaque passe.
 *
 * Un bâtiment entouré reçoit la somme des exigences de tous ses voisins ;
 * appliquée telle quelle, elle le projette à l'autre bout du panorama, d'où
 * la terrasse le ramène — et le plan oscille. On en accorde la moitié,
 * plusieurs fois : c'est plus lent et cela converge.
 */
const RELAXATION = 0.5;

/**
 * PEINE d'un plan : la somme des recouvrements, pondérée par leur profondeur.
 *
 * Le carré n'est pas une coquetterie. Une paire qui s'enfonce de moitié est
 * bien pire que deux paires qui se frôlent : c'est elle qu'on voit. Mesurer
 * ainsi permet à `desserrerPlan` de GARDER LE MEILLEUR plan rencontré plutôt
 * que le dernier — sans quoi une cité trop chargée ressort plus emmêlée
 * qu'elle n'est entrée (mesuré : l'Ermitage en portrait passait de 193 paires
 * qui se chevauchent à 216).
 */
function peineDuPlan(liste: readonly Groupe[], aspect: number): number {
  let peine = 0;
  for (let i = 0; i < liste.length; i += 1) {
    for (let j = i + 1; j < liste.length; j += 1) {
      const a = liste[i];
      const b = liste[j];
      const vise = (a.demi + b.demi) * ECART_VISE;
      const d = Math.hypot(a.x - b.x, (a.y - b.y) * aspect);
      if (d >= vise) continue;
      const enfoncement = (vise - d) / vise;
      peine += enfoncement * enfoncement;
    }
  }
  return peine;
}

/**
 * Écarte les bâtiments trop proches. Rend la position corrigée par id.
 *
 * **Toutes les poussées d'une passe sont calculées avant d'être appliquées.**
 * La première version corrigeait chaque paire séparément et rappelait aussitôt
 * la terrasse : le troisième voisin défaisait ce que le deuxième venait de
 * faire, et sur un panorama chargé le plan oscillait au lieu de converger.
 * Ici chaque emprise reçoit la somme de ce que ses voisins lui demandent, se
 * déplace une fois, et n'est ramenée au sol qu'ensuite.
 *
 * **Le plan rendu est le MEILLEUR rencontré, jamais le dernier** — et le plan
 * d'entrée est le premier candidat. Une cité dont les terrasses ne peuvent
 * matériellement pas tenir tous ses bâtiments ressort donc inchangée, jamais
 * dégradée.
 */
export function desserrerPlan(
  noeuds: readonly NoeudPlan[],
  faction: FactionId,
  portrait: boolean,
): Map<string, { x: number; y: number }> {
  const aspect = aspectDe(portrait);

  /* Un nœud par EMPRISE : les membres d'une chaîne bougent ensemble. */
  const groupes = new Map<string, Groupe>();
  for (const n of noeuds) {
    const g = groupes.get(n.emprise);
    if (g) {
      g.demi = Math.max(g.demi, n.demi);
      g.ids.push(n.id);
    } else {
      groupes.set(n.emprise, { x: n.x, y: n.y, demi: n.demi, ids: [n.id] });
    }
  }

  const liste = [...groupes.values()];
  let meilleurePeine = peineDuPlan(liste, aspect);
  let meilleur = liste.map((g) => ({ x: g.x, y: g.y }));

  const dx = new Float64Array(liste.length);
  const dy = new Float64Array(liste.length);

  for (let passe = 0; passe < PASSES_DESSERRAGE && meilleurePeine > 0; passe += 1) {
    dx.fill(0);
    dy.fill(0);
    let bouge = false;

    for (let i = 0; i < liste.length; i += 1) {
      for (let j = i + 1; j < liste.length; j += 1) {
        const a = liste[i];
        const b = liste[j];
        const vise = (a.demi + b.demi) * ECART_VISE;
        const ex = a.x - b.x;
        /* L'écart vertical compte moins qu'il n'y paraît : le tableau est en
           perspective, un point de hauteur vaut moins qu'un point de largeur. */
        const ey = (a.y - b.y) * aspect;
        const d = Math.hypot(ex, ey);
        if (d >= vise) continue;
        bouge = true;
        /* Deux bâtiments exactement superposés : on les sépare sur l'axe
           horizontal, le seul où les terrasses ont de la place. */
        const ux = d < 1e-6 ? 1 : ex / d;
        const uy = d < 1e-6 ? 0 : ey / d;
        const pousse = (vise - d) / 2;
        dx[i] += ux * pousse;
        dy[i] += (uy * pousse) / aspect;
        dx[j] -= ux * pousse;
        dy[j] -= (uy * pousse) / aspect;
      }
    }
    if (!bouge) break;

    /* Sous-relaxation : un voisin encombré demande souvent plus de place qu'il
       n'en existe, et lui donner tout d'un coup projette le bâtiment à travers
       le panorama. On en accorde une part, plusieurs fois. */
    for (let i = 0; i < liste.length; i += 1) {
      const g = liste[i];
      const p = surLaTerrasse(
        g.x + dx[i] * RELAXATION,
        g.y + dy[i] * RELAXATION,
        g.demi,
        faction,
        portrait,
      );
      g.x = p.x;
      g.y = p.y;
    }

    const peine = peineDuPlan(liste, aspect);
    if (peine < meilleurePeine) {
      meilleurePeine = peine;
      meilleur = liste.map((g) => ({ x: g.x, y: g.y }));
    }
  }

  const sortie = new Map<string, { x: number; y: number }>();
  liste.forEach((g, i) => {
    const p = meilleur[i];
    for (const id of g.ids) sortie.set(id, { x: p.x, y: p.y });
  });
  return sortie;
}

/**
 * L'EMPRISE d'un bâtiment : sa place au sol dans le tableau.
 *
 * Deux bâtiments qui déclarent le même point de scène occupent la même place
 * et ne doivent jamais être écartés l'un de l'autre — c'est la sémantique de
 * HMM3, et deux gardes du plan de masse l'exigent : les maillons d'une chaîne
 * (palissade → rempart → château) montent sur une même emprise, et les sept
 * cercles de la guilde sont une seule guilde qui grandit.
 */
export function empriseDe(def: BuildingDef): string {
  return `${Math.round(def.scene.x)}:${Math.round(def.scene.y)}`;
}

/**
 * LE PLAN DE MASSE : où chaque bâtiment se pose, tout compris.
 *
 * Un seul point d'entrée pour la position d'un bâtiment dans le tableau —
 * position déclarée, accrochage aux terrasses, puis desserrage des voisins.
 * La vue (`index.ts`) et les gardes (`plan-de-masse.test.ts`) l'appellent
 * toutes deux : le test mesure ainsi ce que la vue dessine, ce qui n'était
 * plus vrai dès que le desserrage n'existait que dans la vue.
 *
 * Le desserrage regarde TOUT ce qui est posé — les bâtiments levés comme les
 * emplacements encore libres. Un chantier vide occupe la place qu'occupera le
 * bâtiment : le plan ne doit pas se réorganiser le jour où on le construit.
 */
export function planDeMasse(
  poses: readonly BuildingDef[],
  faction: FactionId,
  portrait: boolean,
): Map<string, { x: number; y: number }> {
  const noeuds: NoeudPlan[] = poses.map((def) => {
    const p = basePct(def, faction, portrait);
    return {
      id: def.id,
      emprise: empriseDe(def),
      x: p.x,
      y: p.y,
      demi: demiVuePct(def, portrait),
    };
  });
  return desserrerPlan(noeuds, faction, portrait);
}
