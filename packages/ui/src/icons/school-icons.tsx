/**
 * Les quatre écoles de magie : Braises, Sources, Brumes, Racines.
 * Clefs d'atlas : `ecole_<id>`.
 *
 * Chaque école possède un blason lisible en 20 px, repris en fond des trente-
 * deux icônes de sorts.
 */

import { contour, coolShade, hatch, keyLight, makeIcon, mat, matR } from './kit.js';

/** Braises — forge et feu : enclume rougie sous trois flammes. */
export const IconEcoleBraises = makeIcon({
  mats: ['braise', 'fer', 'or'],
  radial: ['braise'],
  seed: 121,
  draw: (id) => (
    <>
      <path
        d="M16 1.8 Q18.4 6.4 17.2 9.6 Q20 8.6 20.4 5.8 Q24 10 22.6 14.2 Q21.4 17.8 16 19.4 Q10.6 17.8 9.4 14.2 Q8 10 11.6 5.8 Q12 8.6 14.8 9.6 Q13.6 6.4 16 1.8 Z"
        fill={matR(id, 'braise')}
        {...contour('braise', 1)}
      />
      <path d="M16 8.4 Q18.2 11.4 18.2 14 Q18.2 16.6 16 18 Q13.8 16.6 13.8 14 Q13.8 11.4 16 8.4 Z" fill="#FFE9C2" fillOpacity="0.55" />
      {keyLight('M13 6 Q11 9.6 11.6 13', 0.42, 1)}
      <path
        d="M4.4 21.4 L27.6 21.4 L24.4 25.4 L7.6 25.4 Z"
        fill={mat(id, 'fer')}
        {...contour('fer', 1.05)}
      />
      <path d="M27.6 21.4 L31 19.4 L30 23.4 L24.4 25.4 Z" fill={mat(id, 'fer')} opacity="0.9" {...contour('fer', 0.9)} />
      {keyLight('M6.4 22.4 L26 22.4', 0.44, 1.1)}
      <path d="M12.4 25.4 L19.6 25.4 L21.4 29.6 L10.6 29.6 Z" fill={mat(id, 'fer')} {...contour('fer', 1)} />
      {coolShade('M20.4 26.4 L20.8 28.8', 0.3, 1)}
      <path d="M8.4 27.4 a1.2 1.2 0 1 0 0.1 0 Z M23.6 27.9 a1 1 0 1 0 0.1 0 Z" fill={mat(id, 'or')} opacity="0.7" className="hmm-scintille" />
    </>
  ),
});

/** Sources — eau vive : vasque de pierre et trois ondes. */
export const IconEcoleSources = makeIcon({
  mats: ['eau', 'pierre', 'brume'],
  radial: ['eau'],
  seed: 123,
  draw: (id) => (
    <>
      <path
        d="M16 1.8 Q22 9.4 23.6 14.4 Q25 19.6 20.6 22.6 Q18.4 24 16 24 Q13.6 24 11.4 22.6 Q7 19.6 8.4 14.4 Q10 9.4 16 1.8 Z"
        fill={matR(id, 'eau')}
        {...contour('eau', 1.05)}
      />
      {keyLight('M13.6 7.4 Q10.4 12.6 10.6 16.6', 0.48, 1.3)}
      {coolShade('M20.4 11.4 Q22.4 15.4 21.4 19.4', 0.3, 1.2)}
      <path d="M12.6 15.4 Q11.6 18.6 13.4 20.4" fill="none" stroke="#FFE9C2" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" />
      <path
        d="M3.4 24.4 Q7.4 22.4 11.4 24.4 Q15.4 26.4 19.4 24.4 Q23.4 22.4 28.6 24.6"
        fill="none"
        stroke={mat(id, 'brume')}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path
        d="M3.4 28 Q7.4 26 11.4 28 Q15.4 30 19.4 28 Q23.4 26 28.6 28.2"
        fill="none"
        stroke={mat(id, 'eau')}
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.8"
      />
      <path d="M2.6 20.4 L6.4 20.4 L6.4 22.4 L2.6 22.4 Z M25.6 20.4 L29.4 20.4 L29.4 22.4 L25.6 22.4 Z" fill={mat(id, 'pierre')} opacity="0.85" />
    </>
  ),
});

/** Brumes — dissimulation : hulotte estompée derrière trois bandes de brume. */
export const IconEcoleBrumes = makeIcon({
  mats: ['brume', 'sapin', 'or'],
  radial: ['or'],
  seed: 125,
  draw: (id) => (
    <>
      <path
        d="M16 4.4 Q21.6 4.4 23.4 9.4 Q25 13.8 23.4 18.4 Q21.6 23.4 16 23.4 Q10.4 23.4 8.6 18.4 Q7 13.8 8.6 9.4 Q10.4 4.4 16 4.4 Z"
        fill={mat(id, 'sapin')}
        {...contour('sapin', 1.05)}
      />
      <path d="M9.4 6.4 L12.6 4.4 L12.4 8.4 Z M22.6 6.4 L19.4 4.4 L19.6 8.4 Z" fill={mat(id, 'sapin')} {...contour('sapin', 0.85)} />
      {keyLight('M11.4 8.4 Q9.6 13.4 10.6 18.4', 0.34, 1.2)}
      <path d="M12.4 12.4 a3 3 0 1 0 0.1 0 Z M19.6 12.4 a3 3 0 1 0 0.1 0 Z" fill={matR(id, 'or')} {...contour('or', 0.8)} />
      <path d="M12.4 13.6 a1.4 1.4 0 1 0 0.1 0 Z M19.6 13.6 a1.4 1.4 0 1 0 0.1 0 Z" fill="#111E17" />
      <path d="M16 14.4 L18 17.4 L16 19 L14 17.4 Z" fill={mat(id, 'or')} opacity="0.85" />
      {hatch('M13.4 19.4 L16 21.4 L18.6 19.4', '#111E17', 0.4, 0.9)}
      <path
        d="M1.6 17.4 Q9 15 16 17.4 Q23 19.8 30.4 17"
        fill="none"
        stroke={mat(id, 'brume')}
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.72"
      />
      <path
        d="M1.6 22.4 Q9 20 16 22.4 Q23 24.8 30.4 22"
        fill="none"
        stroke={mat(id, 'brume')}
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M1.6 27 Q9 24.6 16 27 Q23 29.4 30.4 26.6"
        fill="none"
        stroke={mat(id, 'brume')}
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.6"
      />
      {coolShade('M4 19 Q10.6 17.4 15.4 19', 0.2, 1)}
    </>
  ),
});

/** Racines — forêt et pierre levée : souche, racines et menhir. */
export const IconEcoleRacines = makeIcon({
  mats: ['feuille', 'bois', 'pierre'],
  seed: 127,
  draw: (id) => (
    <>
      <path
        d="M13.4 3.4 Q16 1.6 18.6 3.4 L20.4 12.4 Q20.6 14.4 18.4 14.4 L13.6 14.4 Q11.4 14.4 11.6 12.4 Z"
        fill={mat(id, 'pierre')}
        {...contour('pierre', 1.05)}
      />
      {keyLight('M14.4 4 L12.8 12.4', 0.44, 1.1)}
      {hatch('M16.4 5.4 L16.8 12.4 M18.4 6.4 L19 12', '#25272A', 0.32, 0.8)}
      <path
        d="M10.4 14.4 L21.6 14.4 Q22.6 18.4 20.4 20.4 Q23.4 21.4 25.4 25.4 Q26.4 27.4 28.6 28.4 L28.6 30 Q23.4 29.4 20.6 25.4 Q18.6 22.4 16 22.4 Q13.4 22.4 11.4 25.4 Q8.6 29.4 3.4 30 L3.4 28.4 Q5.6 27.4 6.6 25.4 Q8.6 21.4 11.6 20.4 Q9.4 18.4 10.4 14.4 Z"
        fill={mat(id, 'bois')}
        {...contour('bois', 1.05)}
      />
      {keyLight('M11.6 15.4 Q11.2 18.4 12.6 20.2', 0.4, 1)}
      {hatch('M13.4 16.4 L13.4 19.4 M16 16.4 L16 19.6 M18.6 16.4 L18.6 19.4', '#3A2C1A', 0.34, 0.8)}
      <path d="M6.4 22.4 Q4.4 19.4 6.4 16.4 Q8.6 19.4 7.4 22.6 Z" fill={mat(id, 'feuille')} {...contour('feuille', 0.85)} />
      <path d="M25.6 22.4 Q27.6 19.4 25.6 16.4 Q23.4 19.4 24.6 22.6 Z" fill={mat(id, 'feuille')} opacity="0.85" {...contour('feuille', 0.85)} />
    </>
  ),
});
