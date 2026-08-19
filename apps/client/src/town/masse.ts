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
