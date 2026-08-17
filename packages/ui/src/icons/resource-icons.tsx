/**
 * Les sept ressources du comté : écus, bois, granit, fer, sel, essence,
 * fil d'or. Clefs d'atlas : `ressource_<clef>`.
 *
 * Chaque ressource doit être identifiable **par la forme seule**, en 16 px et
 * en noir et blanc : la couleur ne porte jamais l'information à elle seule.
 */

import { contour, coolShade, hatch, keyLight, makeIcon, mat, matR } from './kit.js';

/** Écus — trois pièces frappées, empilées de biais. */
export const IconEcus = makeIcon({
  mats: ['or', 'orClair'],
  radial: ['or'],
  seed: 101,
  draw: (id) => (
    <>
      <path
        d="M6.4 20.4 C6.4 17.6 10.6 15.4 15.8 15.4 C21 15.4 25.2 17.6 25.2 20.4 L25.2 24 C25.2 26.8 21 29 15.8 29 C10.6 29 6.4 26.8 6.4 24 Z"
        fill={mat(id, 'or')}
        {...contour('or', 1.05)}
      />
      <path
        d="M6.4 20.4 C6.4 23.2 10.6 25.4 15.8 25.4 C21 25.4 25.2 23.2 25.2 20.4 C25.2 17.6 21 15.4 15.8 15.4 C10.6 15.4 6.4 17.6 6.4 20.4 Z"
        fill={matR(id, 'orClair')}
        {...contour('or', 0.9)}
      />
      {keyLight('M8.4 18.4 C10.4 16.8 13 16 15.6 16', 0.5, 1.2)}
      <path
        d="M12.6 3.4 C17.8 3.4 22 5.6 22 8.4 C22 11.2 17.8 13.4 12.6 13.4 C7.4 13.4 3.2 11.2 3.2 8.4 C3.2 5.6 7.4 3.4 12.6 3.4 Z"
        fill={matR(id, 'or')}
        {...contour('or', 1.05)}
      />
      <path d="M12.6 5.6 C15.4 5.6 17.6 6.9 17.6 8.4 C17.6 9.9 15.4 11.2 12.6 11.2 C9.8 11.2 7.6 9.9 7.6 8.4 C7.6 6.9 9.8 5.6 12.6 5.6 Z" fill="none" stroke="#7A6116" strokeOpacity="0.5" strokeWidth="0.8" />
      <path d="M11 6.8 L14.2 6.8 L14.2 8 L13.4 8 L13.4 10 L11.8 10 L11.8 8 L11 8 Z" fill="#7A6116" fillOpacity="0.6" />
      {hatch('M9 22.4 L9.6 26.4 M22.6 22.4 L22 26.4', '#7A6116', 0.4, 0.9)}
      {coolShade('M23.4 22 C22.4 24.4 19.4 26.4 15.8 26.8', 0.3, 1.2)}
    </>
  ),
});

/** Bois — trois rondins liés, cernes et écorce. */
export const IconBois = makeIcon({
  mats: ['bois', 'cuir'],
  radial: ['bois'],
  seed: 103,
  draw: (id) => (
    <>
      <path d="M3.4 17.4 L21.4 17.4 L21.4 24.6 L3.4 24.6 Z" fill={mat(id, 'bois')} {...contour('bois', 1)} />
      <path d="M21.4 17.4 C24.4 17.4 26.4 19 26.4 21 C26.4 23 24.4 24.6 21.4 24.6 Z" fill={mat(id, 'bois')} opacity="0.9" />
      <path d="M21.4 21 m -4.6 0 a 4.6 3.6 0 1 0 9.2 0 a 4.6 3.6 0 1 0 -9.2 0" fill={matR(id, 'bois')} {...contour('bois', 0.9)} />
      <path d="M21.4 21 m -2.6 0 a 2.6 2 0 1 0 5.2 0 a 2.6 2 0 1 0 -5.2 0" fill="none" stroke="#3A2C1A" strokeOpacity="0.5" strokeWidth="0.8" />
      <path d="M6.4 6.4 L18.6 6.4 L18.6 13.4 L6.4 13.4 Z" fill={mat(id, 'bois')} {...contour('bois', 1)} />
      <path d="M18.6 9.9 m -4.2 0 a 4.2 3.5 0 1 0 8.4 0 a 4.2 3.5 0 1 0 -8.4 0" fill={matR(id, 'bois')} {...contour('bois', 0.9)} />
      <path d="M18.6 9.9 m -2.2 0 a 2.2 1.8 0 1 0 4.4 0 a 2.2 1.8 0 1 0 -4.4 0" fill="none" stroke="#3A2C1A" strokeOpacity="0.5" strokeWidth="0.8" />
      {keyLight('M7.4 7.4 L17.4 7.4 M4.4 18.4 L20.4 18.4', 0.42, 1)}
      {hatch('M9.4 8.8 L9.4 12.4 M13.4 8.4 L13.4 12.6 M7 19.4 L7 23.6 M12 19 L12 23.8 M16.6 19.4 L16.6 23.6', '#3A2C1A', 0.34, 0.8)}
      <path d="M9.4 15.4 L9.4 26.4" stroke="#5A4128" strokeWidth="1.6" strokeOpacity="0.9" />
      <path d="M9.4 15.4 L9.4 26.4" stroke="#8E6C43" strokeWidth="0.6" strokeOpacity="0.6" />
    </>
  ),
});

/** Granit — bloc taillé de carrière, arêtes vives et éclats. */
export const IconGranit = makeIcon({
  mats: ['pierre'],
  seed: 105,
  draw: (id) => (
    <>
      <path d="M4.4 12.4 L15.4 6.4 L27.6 11.4 L27.6 22.6 L16.4 28.6 L4.4 23.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1.1)} />
      <path d="M4.4 12.4 L15.4 6.4 L27.6 11.4 L16.4 17.4 Z" fill="#6E767C" {...contour('pierre', 0.9)} />
      <path d="M16.4 17.4 L27.6 11.4 L27.6 22.6 L16.4 28.6 Z" fill="#3A3E42" opacity="0.92" />
      {keyLight('M6 12.4 L15.4 7.6 L25.4 11.6', 0.46, 1.2)}
      {coolShade('M17.4 18.4 L26.4 13.4 L26.4 21.6', 0.28, 1.2)}
      {hatch('M8.4 11.4 L12.4 13.4 M12.4 9.4 L17.4 11.6 M18.4 9 L23 11.2', '#25272A', 0.32, 0.8)}
      {hatch('M7 15.4 L7 21.4 M10.6 17 L10.6 23 M13.6 18.4 L13.6 24.4', '#25272A', 0.3, 0.8)}
      {hatch('M19.4 19.4 L19.4 25.4 M23 17.4 L23 23.4', '#161819', 0.34, 0.8)}
    </>
  ),
});

/** Fer — lingot brut et deux masselottes, éclat froid. */
export const IconFer = makeIcon({
  mats: ['acier', 'fer'],
  seed: 107,
  draw: (id) => (
    <>
      <path d="M4.4 18.4 L9.4 13.4 L23.6 13.4 L27.6 18.4 L27.6 24.4 L4.4 24.4 Z" fill={mat(id, 'fer')} {...contour('fer', 1.05)} />
      <path d="M4.4 18.4 L9.4 13.4 L23.6 13.4 L27.6 18.4 Z" fill={mat(id, 'acier')} {...contour('acier', 0.9)} />
      {keyLight('M6.4 17.6 L10 14.6 L22 14.6', 0.5, 1.2)}
      {coolShade('M26.4 19.4 L26.4 23.4 L6 23.4', 0.32, 1.2)}
      <path d="M9.4 6.4 L12.4 3.4 L20 3.4 L22.6 6.4 L22.6 10.4 L9.4 10.4 Z" fill={mat(id, 'fer')} opacity="0.9" {...contour('fer', 0.9)} />
      <path d="M9.4 6.4 L12.4 3.4 L20 3.4 L22.6 6.4 Z" fill={mat(id, 'acier')} opacity="0.85" />
      {hatch('M12.4 19.4 L12.4 23.4 M16 19.4 L16 23.4 M19.6 19.4 L19.6 23.4', '#31363B', 0.34, 0.8)}
      {hatch('M13.4 7.4 L13.4 9.6 M18.6 7.4 L18.6 9.6', '#31363B', 0.3, 0.7)}
    </>
  ),
});

/** Sel — pain de sel de la halle, cristaux et pelle de bois. */
export const IconSel = makeIcon({
  mats: ['sel', 'bois', 'ivoire'],
  seed: 109,
  draw: (id) => (
    <>
      <path
        d="M3.4 25.4 Q6.4 15.4 12.4 12.4 Q18.4 9.4 24.4 13.4 Q29.4 16.8 28.6 25.4 Z"
        fill={mat(id, 'sel')}
        {...contour('sel', 1.05)}
      />
      {keyLight('M6.4 23.4 Q8.6 16.4 13.4 14', 0.5, 1.3)}
      {coolShade('M26.4 22.4 Q26 17.4 22.4 14.4', 0.26, 1.2)}
      <path d="M11.4 4.4 L14.4 7.4 L11.4 10.4 L8.4 7.4 Z" fill={mat(id, 'ivoire')} {...contour('ivoire', 0.85)} />
      <path d="M19.4 6.4 L21.6 8.6 L19.4 10.8 L17.2 8.6 Z" fill={mat(id, 'ivoire')} opacity="0.88" {...contour('ivoire', 0.8)} />
      <path d="M15.6 1.6 L17.4 3.4 L15.6 5.2 L13.8 3.4 Z" fill={mat(id, 'ivoire')} opacity="0.75" />
      {hatch('M8.4 20.4 L11.4 18.4 M13.4 22.4 L16.4 19.4 M18.4 23.4 L21.4 20.4 M22.4 22 L24.4 19.6', '#A59A80', 0.5, 0.9)}
      <path d="M24.4 25.4 L29.4 25.4 L29.4 27.4 L24.4 27.4 Z" fill={mat(id, 'bois')} opacity="0.8" />
    </>
  ),
});

/** Essence — fiole de sève des Bois Noirs, bouchon de liège et vapeur. */
export const IconEssence = makeIcon({
  mats: ['eau', 'brume', 'cuir', 'feuille'],
  radial: ['eau'],
  seed: 111,
  draw: (id) => (
    <>
      <path d="M13 3.4 L19 3.4 L19 6.4 L13 6.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 0.85)} />
      <path
        d="M13.6 6.4 L18.4 6.4 L18.4 12.4 Q24.6 16.4 24.6 22.4 Q24.6 29.4 16 29.4 Q7.4 29.4 7.4 22.4 Q7.4 16.4 13.6 12.4 Z"
        fill={mat(id, 'brume')}
        fillOpacity="0.42"
        {...contour('brume', 1.05)}
      />
      <path
        d="M9.4 19.4 Q16 17.4 22.6 19.4 Q23.6 21 23.6 22.6 Q23.6 28 16 28 Q8.4 28 8.4 22.6 Q8.4 21 9.4 19.4 Z"
        fill={matR(id, 'eau')}
      />
      {keyLight('M11.4 14.4 Q9.4 17.4 9.2 21.4', 0.5, 1.2)}
      <path d="M13.4 22.4 a1.5 1.5 0 1 0 0.1 0 Z M18.4 24.4 a1.1 1.1 0 1 0 0.1 0 Z M16 20.4 a0.9 0.9 0 1 0 0.1 0 Z" fill="#FFE9C2" fillOpacity="0.5" />
      <path d="M20.6 8.4 Q23.6 5.4 21.4 2.4" fill="none" stroke={mat(id, 'feuille')} strokeWidth="1.1" strokeOpacity="0.8" strokeLinecap="round" />
      <path d="M22.6 6.4 Q25.4 6.4 25.4 3.6" fill="none" stroke={mat(id, 'feuille')} strokeWidth="0.9" strokeOpacity="0.6" strokeLinecap="round" />
    </>
  ),
});

/** Fil d'or — bobine des Grenadières, fil enroulé et aiguille. */
export const IconFilDor = makeIcon({
  mats: ['or', 'bois', 'acier'],
  seed: 113,
  draw: (id) => (
    <>
      <path d="M8.4 4.4 L20.6 4.4 L20.6 7.4 L8.4 7.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.9)} />
      <path d="M8.4 24.4 L20.6 24.4 L20.6 27.4 L8.4 27.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.9)} />
      <path d="M12.4 7.4 L16.6 7.4 L16.6 24.4 L12.4 24.4 Z" fill={mat(id, 'bois')} opacity="0.85" />
      <path
        d="M9.4 8.4 L19.6 8.4 L19.6 23.4 L9.4 23.4 Z"
        fill={mat(id, 'or')}
        {...contour('or', 1)}
      />
      {hatch('M9.4 10.4 L19.6 11.4 M9.4 12.4 L19.6 13.4 M9.4 14.4 L19.6 15.4 M9.4 16.4 L19.6 17.4 M9.4 18.4 L19.6 19.4 M9.4 20.4 L19.6 21.4', '#7A6116', 0.55, 0.9)}
      {keyLight('M10.4 9.4 L10.4 22.4', 0.5, 1.1)}
      <path d="M19.6 12.4 Q26.4 14.4 25.4 21.4" fill="none" stroke="#C9A227" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M25.6 19.4 L27.4 28.6 L24.4 28.6 Z" fill={mat(id, 'acier')} {...contour('acier', 0.85)} />
      <path d="M25.8 21 a0.7 0.7 0 1 0 0.1 0 Z" fill="#3F474F" />
    </>
  ),
});
