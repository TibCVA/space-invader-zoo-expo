/**
 * `screens/cible.ts` — ce que le joueur vient de cliquer sur la carte.
 *
 * Volontairement distinct de `AppState.selection`. La sélection dit **avec quoi
 * on agit** (le héros qu'on met en route, la case qu'on vise) ; la cible
 * d'inspection dit **ce qu'on regarde**. Les confondre revenait à perdre le
 * héros sélectionné dès qu'on cliquait sur une garde neutre pour en jauger la
 * force — c'est-à-dire à perdre l'armée qui sert justement de mesure à la
 * difficulté affichée. Dans HMM3 les deux cohabitent : le héros reste choisi,
 * la fiche s'ouvre par-dessus.
 *
 * Ce type vit donc dans la couche des écrans, jamais dans le magasin : rien de
 * ce qu'on regarde n'entre dans l'état du jeu ni dans son hachage.
 */

import type { HeroUid, MapCoord, ObjectUid, TownUid } from '@auvergne/engine';

export type Cible =
  | { readonly kind: 'objet'; readonly uid: ObjectUid }
  | { readonly kind: 'cite'; readonly uid: TownUid }
  | { readonly kind: 'heros'; readonly uid: HeroUid }
  /**
   * Une case nue. C'est le clic droit de HMM3 sur l'herbe : le terrain se
   * nomme et dit ce qu'il coûte à traverser. Le geste existait — l'appui long
   * appelait déjà `onInspect` avec cette forme — mais l'écran le jetait, et
   * neuf dixièmes de la carte restaient sans réponse.
   */
  | { readonly kind: 'case'; readonly at: MapCoord };
