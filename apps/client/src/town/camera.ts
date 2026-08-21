/**
 * `apps/client/src/town/camera.ts` — LA DÉRIVE DE CAMÉRA DU TABLEAU DE CITÉ.
 *
 * **Le défaut.** Le propriétaire, sur iPhone : « quand je zoome ou dézoome les
 * bâtiments bougent un peu ». Ils bougeaient, et pas tous pareil.
 *
 * **Pourquoi.** Le tableau a une dérive de caméra à six plans (bible
 * artistique §5) : chaque bâtiment se décale de `DERIVE_MAX × son plan`, un
 * facteur qui va de 0,34 au fond à 1 au premier plan. La cible de cette dérive
 * était lue sur la position du pointeur DANS LE REPÈRE DU TABLEAU, rapportée à
 * la largeur du tableau entier :
 *
 * ```
 *   cible.x = (p.x / largeur) × 2 − 1      où p = pointeur dans la racine
 * ```
 *
 * Or ce repère se dilate avec le grossissement. Pour un doigt IMMOBILE :
 *
 * ```
 *   p.x = largeur/2 + (écran.x − décalage.x) / zoom
 * ```
 *
 * — la cible change donc dès que `zoom` ou `décalage` changent, c'est-à-dire à
 * chaque cran de pincement. La dérive suit, et comme chaque bâtiment la
 * multiplie par SON plan, ils glissent les uns par rapport aux autres et par
 * rapport à la peinture. Jusqu'à quatorze pixels d'écart entre le fond et le
 * premier plan, sans que le doigt ait bougé.
 *
 * **Le correctif, en deux temps.**
 *
 *  - la dérive s'efface quand on entre dans le tableau. Elle est une
 *    respiration du panorama au repos ; une fois qu'on a zoomé pour regarder
 *    une demeure, ce n'est plus de la vie, c'est du flottement. `amplitude`
 *    la ramène à zéro, en fondu pour qu'elle ne s'éteigne pas d'un coup ;
 *  - pendant le pincement lui-même, la cible ne bouge plus du tout. Les deux
 *    doigts produisent des `pointermove` en rafale, chacun recalculant une
 *    cible dans un repère qui se dilate en même temps.
 *
 * Le fondu porte sur la CIBLE, pas sur la position : l'amortissement de la vue
 * (220 ms) fait le reste, donc les bâtiments reviennent à leur place au lieu
 * d'y sauter.
 */

/** Grossissement à partir duquel la dérive de caméra est éteinte. */
export const ZOOM_SANS_DERIVE = 1.35;

/**
 * Part de la dérive de caméra à appliquer, selon le grossissement.
 *
 * 1 au repos, 0 dès qu'on est entré dans le tableau, en fondu entre les deux.
 * Le fondu ne commence pas à 1 exactement : un pincement rend rarement une
 * échelle ronde, et une dérive qui s'éteindrait au premier centième de
 * grossissement serait un autre à-coup.
 */
export function amplitudeDerive(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 1.02) return 1;
  if (zoom >= ZOOM_SANS_DERIVE) return 0;
  return (ZOOM_SANS_DERIVE - zoom) / (ZOOM_SANS_DERIVE - 1.02);
}
