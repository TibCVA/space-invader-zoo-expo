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

  /* Demi-largeur du canevas, en % de la largeur du cadre — indépendante des
     pixels : module (fraction de largeur) × échelle × perspective × canevas. */
  const demi =
    (MODULE_FRACTION *
      (portrait ? MODULE_FACTEUR_PORTRAIT : 1) *
      (def.scene.scale / 100) *
      perspectiveDe(def.scene.y) *
      SPRITE_FACTEUR *
      100) /
    2;

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
