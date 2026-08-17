/**
 * Les vingt compétences secondaires. Clefs d'atlas imposées par
 * `packages/content` : `competence_<id>`.
 *
 * Ordre canonique : logistique, tactique, seigneurie, intendance, diplomatie,
 * reconnaissance, sylviculture, pèlerinage, forges, balistique, guérison,
 * érudition, occultisme, commandement, fortune, embuscade, commerce,
 * cartographie, résistance, invocation.
 */

import { contour, coolShade, hatch, keyLight, makeIcon, mat, matR } from './kit.js';
import type { IconComponent } from './kit.js';

/** Logistique — charroi de montagne, roue cerclée et ridelles. */
export const IconCompLogistique = makeIcon({
  mats: ['bois', 'fer', 'cuir'],
  seed: 201,
  draw: (id) => (
    <>
      <path d="M3.4 20.4 L27.6 20.4 L26.4 22.6 L4.6 22.6 Z" fill={mat(id, 'cuir')} opacity="0.7" />
      <path d="M5.4 9.4 L24.6 9.4 L26.4 18.4 L4.4 18.4 Z" fill={mat(id, 'bois')} {...contour('bois', 1.05)} />
      {hatch('M9.4 10.4 L9.4 17.4 M13.4 10.4 L13.4 17.4 M17.4 10.4 L17.4 17.4 M21.4 10.4 L21.4 17.4', '#3A2C1A', 0.36, 0.9)}
      {keyLight('M6.4 10.4 L23.6 10.4', 0.44, 1.1)}
      <path d="M24.6 9.4 L29.4 6.4 L30.4 8.4 L26 11.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 0.85)} />
      <path
        d="M9.4 18.4 C12.4 18.4 14.8 20.8 14.8 23.8 C14.8 26.8 12.4 29.2 9.4 29.2 C6.4 29.2 4 26.8 4 23.8 C4 20.8 6.4 18.4 9.4 18.4 Z M9.4 21.4 C8.1 21.4 7 22.5 7 23.8 C7 25.1 8.1 26.2 9.4 26.2 C10.7 26.2 11.8 25.1 11.8 23.8 C11.8 22.5 10.7 21.4 9.4 21.4 Z"
        fill={mat(id, 'fer')}
        {...contour('fer', 0.95)}
      />
      <path d="M9.4 18.6 L9.4 29 M4.2 23.8 L14.6 23.8 M5.7 20.1 L13.1 27.5 M13.1 20.1 L5.7 27.5" stroke="#5A6169" strokeWidth="0.9" strokeOpacity="0.9" />
      <path
        d="M22.4 20.4 C24.6 20.4 26.4 22.2 26.4 24.4 C26.4 26.6 24.6 28.4 22.4 28.4 C20.2 28.4 18.4 26.6 18.4 24.4 C18.4 22.2 20.2 20.4 22.4 20.4 Z"
        fill="none"
        stroke={mat(id, 'fer')}
        strokeWidth="1.8"
      />
      {coolShade('M25.4 26.4 A4 4 0 0 1 21.4 28.2', 0.3, 1)}
    </>
  ),
});

/** Tactique — trois hexagones de déploiement et un fanion d'ordre. */
export const IconCompTactique = makeIcon({
  mats: ['pierre', 'grenat', 'or'],
  seed: 203,
  draw: (id) => (
    <>
      <path d="M8.4 16.4 L12.4 14.2 L16.4 16.4 L16.4 21 L12.4 23.2 L8.4 21 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.95)} />
      <path d="M16.8 20.4 L20.8 18.2 L24.8 20.4 L24.8 25 L20.8 27.2 L16.8 25 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.95)} />
      <path d="M3.4 22.4 L7.4 20.2 L11.4 22.4 L11.4 27 L7.4 29.2 L3.4 27 Z" fill={mat(id, 'pierre')} opacity="0.85" {...contour('pierre', 0.9)} />
      {keyLight('M9 17 L12.4 15.2 L15.8 17', 0.44, 1)}
      <path d="M19.4 4.4 L21 4.4 L21 20 L19.4 20 Z" fill={mat(id, 'or')} {...contour('or', 0.75)} />
      <path d="M21 5 L29.4 7 L27 9.6 L29.4 12.2 L21 14.2 Z" fill={mat(id, 'grenat')} {...contour('grenat', 0.95)} />
      {hatch('M23.4 6.4 L23.4 13 M25.6 7 L25.6 12.4', '#3A0E15', 0.3, 0.75)}
      <path d="M12.4 16.6 L15.4 18.4 L12.4 20.2 L9.4 18.4 Z" fill={mat(id, 'or')} opacity="0.7" />
    </>
  ),
});

/** Seigneurie — couronne comtale à fleurons, coussin d'étoffe. */
export const IconCompSeigneurie = makeIcon({
  mats: ['or', 'grenat', 'etoffe'],
  radial: ['grenat'],
  seed: 205,
  draw: (id) => (
    <>
      <path d="M4.4 23.4 Q16 20.4 27.6 23.4 Q27.6 27.4 24.4 28.4 Q16 30.4 7.6 28.4 Q4.4 27.4 4.4 23.4 Z" fill={mat(id, 'etoffe')} {...contour('etoffe', 1)} />
      {hatch('M8.4 24.6 L8.4 28.4 M16 23.6 L16 29.4 M23.6 24.6 L23.6 28.4', '#241929', 0.34, 0.8)}
      <path
        d="M4.6 21.6 L3.4 9.4 L9.4 14.4 L12.6 5.4 L16 12.4 L19.4 5.4 L22.6 14.4 L28.6 9.4 L27.4 21.6 Q16 19 4.6 21.6 Z"
        fill={mat(id, 'or')}
        {...contour('or', 1.1)}
      />
      {keyLight('M5.4 11.4 L6 19.4 M12.8 7.4 L11 15.4', 0.46, 1.2)}
      {coolShade('M26.6 11.6 L26 19.6', 0.3, 1.1)}
      <path d="M16 15.4 a2.1 2.1 0 1 0 0.1 0 Z" fill={matR(id, 'grenat')} {...contour('grenat', 0.8)} />
      <path d="M8.4 17.4 a1.5 1.5 0 1 0 0.1 0 Z M23.6 17.4 a1.5 1.5 0 1 0 0.1 0 Z" fill={matR(id, 'grenat')} opacity="0.9" />
      <path d="M12.6 4 a1.4 1.4 0 1 0 0.1 0 Z M19.4 4 a1.4 1.4 0 1 0 0.1 0 Z M3.4 8 a1.3 1.3 0 1 0 0.1 0 Z M28.6 8 a1.3 1.3 0 1 0 0.1 0 Z" fill={mat(id, 'or')} />
    </>
  ),
});

/** Intendance — boisseau de grain, râteau à mesurer et registre. */
export const IconCompIntendance = makeIcon({
  mats: ['bois', 'or', 'parchemin'],
  seed: 207,
  draw: (id) => (
    <>
      <path d="M6.4 12.4 L25.6 12.4 L23.4 28.6 L8.6 28.6 Z" fill={mat(id, 'bois')} {...contour('bois', 1.05)} />
      <path d="M5.4 10.4 L26.6 10.4 L26.6 13.4 L5.4 13.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.95)} />
      {keyLight('M8.4 13.6 L10 27.4', 0.42, 1.1)}
      {hatch('M12.4 14.4 L11.4 27.6 M16 14.4 L16 27.6 M19.6 14.4 L20.6 27.6', '#3A2C1A', 0.3, 0.8)}
      <path d="M6.4 19.4 L25.6 19.4 L25.2 22.4 L6.8 22.4 Z" fill={mat(id, 'or')} opacity="0.55" />
      <path
        d="M9.4 10.4 Q10.4 5.4 14.4 4.4 Q13.4 8.4 15.4 10.4 Z M15.4 10.4 Q17.4 5.4 21.4 5.4 Q19.4 8 19.4 10.4 Z"
        fill={mat(id, 'or')}
        {...contour('or', 0.85)}
      />
      <path d="M21.4 3.4 L27.6 3.4 L27.6 9.4 L21.4 9.4 Z" fill={mat(id, 'parchemin')} {...contour('parchemin', 0.85)} />
      {hatch('M22.6 5 L26.4 5 M22.6 6.6 L26.4 6.6 M22.6 8 L25.4 8', '#B6A682', 0.6, 0.7)}
    </>
  ),
});

/** Diplomatie — charte scellée, ruban et rameau de conciliation. */
export const IconCompDiplomatie = makeIcon({
  mats: ['parchemin', 'grenat', 'feuille', 'or'],
  seed: 209,
  draw: (id) => (
    <>
      <path
        d="M5.4 4.4 L23.6 4.4 Q25.4 4.4 25.4 6.4 L25.4 21.4 Q25.4 23.4 23.6 23.4 L5.4 23.4 Q3.6 23.4 3.6 21.4 L3.6 6.4 Q3.6 4.4 5.4 4.4 Z"
        fill={mat(id, 'parchemin')}
        {...contour('parchemin', 1.05)}
      />
      {keyLight('M5.4 6 L5.4 22', 0.44, 1.1)}
      {hatch('M7.4 8.4 L21.4 8.4 M7.4 11.4 L21.6 11.4 M7.4 14.4 L19.4 14.4 M7.4 17.4 L21 17.4', '#B6A682', 0.6, 0.85)}
      <path d="M17.4 20.4 L22.6 20.4 L22.6 22.4 L17.4 22.4 Z" fill={mat(id, 'or')} opacity="0.7" />
      <path d="M19 23.4 L23.4 23.4 L22.4 27.4 L20 27.4 Z" fill={mat(id, 'grenat')} opacity="0.85" />
      <path d="M21.2 26.4 a3.2 3.2 0 1 0 0.1 0 Z" fill={mat(id, 'grenat')} {...contour('grenat', 0.9)} />
      {hatch('M19.6 28.4 L22.8 30 M22.8 28.4 L19.6 30', '#3A0E15', 0.5, 0.8)}
      <path
        d="M3.4 28.4 Q7.4 22.4 13.4 21.4 Q11.4 25.4 6.4 28.4 Z"
        fill={mat(id, 'feuille')}
        {...contour('feuille', 0.85)}
      />
      <path d="M6.4 26.4 Q8.4 23.4 11.4 22.6" fill="none" stroke="#26351F" strokeOpacity="0.4" strokeWidth="0.7" />
    </>
  ),
});

/** Reconnaissance — longue-vue de guetteur posée sur la crête. */
export const IconCompReconnaissance = makeIcon({
  mats: ['cuivre', 'brume', 'pierre', 'or'],
  seed: 211,
  draw: (id) => (
    <>
      <path d="M1.6 26.4 Q7.4 20.4 12.4 22.4 Q17.4 24.4 22.4 19.4 Q26.4 15.4 30.4 17.4 L30.4 30 L1.6 30 Z" fill={mat(id, 'pierre')} opacity="0.55" />
      <path
        d="M4.4 22.6 L9.4 17.4 L24.4 4.4 L28.6 8.6 L14.4 22.4 L9 26.6 Z"
        fill={mat(id, 'cuivre')}
        {...contour('cuivre', 1.05)}
      />
      {keyLight('M6.4 21.4 L24.6 6', 0.46, 1.2)}
      {coolShade('M10.6 26 L27.4 9.4', 0.3, 1.1)}
      <path d="M22.4 2.4 L30.6 10.6 L28 13 L20 5 Z" fill={mat(id, 'or')} {...contour('or', 0.95)} />
      <path d="M23.4 5.4 L27.4 9.4" stroke="#7A6116" strokeOpacity="0.5" strokeWidth="0.9" />
      <path d="M3.4 21.4 L10.6 28.4 L7.4 30.4 L1.4 24.4 Z" fill={mat(id, 'brume')} fillOpacity="0.72" {...contour('brume', 0.9)} />
      {hatch('M12.4 14.4 L16.4 18.4 M16.4 10.4 L20.4 14.4', '#4C2E18', 0.34, 0.8)}
    </>
  ),
});

/** Sylviculture — cognée de bûcheron et jeune sapin. */
export const IconCompSylviculture = makeIcon({
  mats: ['sapin', 'bois', 'fer'],
  seed: 213,
  draw: (id) => (
    <>
      <path d="M20.4 6.4 L24.4 14.4 L22 14.4 L26 22.4 L23 22.4 L26.4 28.4 L14.4 28.4 L17.8 22.4 L14.8 22.4 L18.8 14.4 L16.4 14.4 Z" fill={mat(id, 'sapin')} {...contour('sapin', 1.05)} />
      {keyLight('M19.4 8.4 L17.4 13.4 M18.4 16.4 L16.4 21.4', 0.36, 1)}
      <path d="M19.6 28.4 L21.2 28.4 L21.2 31 L19.6 31 Z" fill={mat(id, 'bois')} />
      <path d="M4.4 28.6 L6.6 26.4 L18.4 8.4 L20.4 10.4 L8.6 28.4 Z" fill={mat(id, 'bois')} {...contour('bois', 1)} />
      <path
        d="M13.4 3.4 Q7.4 1.6 3.4 6.4 Q1.6 8.6 3.4 11.4 L8.4 14.4 L12.4 8.4 Z"
        fill={mat(id, 'fer')}
        {...contour('fer', 1.05)}
      />
      {keyLight('M5.4 5.4 Q9.4 3.4 12.4 4.6', 0.48, 1.2)}
      {hatch('M5.4 8.4 L9.4 10.4 M7.4 6.4 L11 8.6', '#31363B', 0.3, 0.8)}
    </>
  ),
});

/** Pèlerinage — bourdon, gourde et coquille cousue. */
export const IconCompPelerinage = makeIcon({
  mats: ['bois', 'os', 'cuir', 'or'],
  seed: 215,
  draw: (id) => (
    <>
      <path d="M12.4 2.4 L15.6 2.4 L14.4 30 L11.6 30 Z" fill={mat(id, 'bois')} {...contour('bois', 1)} />
      {hatch('M12.4 8.4 L15.2 8.4 M12.2 15.4 L15 15.4 M12 22.4 L14.8 22.4', '#3A2C1A', 0.36, 0.8)}
      <path d="M11.4 1.4 Q14 -0.4 16.4 1.6 Q16.4 4 14 4.4 Q11.4 4 11.4 1.4 Z" fill={mat(id, 'or')} {...contour('or', 0.85)} />
      <path
        d="M17.4 12.4 Q24.6 12.4 25.4 19.4 Q26 25.4 21.4 26.4 Q17.4 27 16.4 22.4 Q15.6 17.4 17.4 12.4 Z"
        fill={mat(id, 'cuir')}
        {...contour('cuir', 1.05)}
      />
      {keyLight('M18.4 14.4 Q17.4 19.4 18.4 24.4', 0.36, 1.1)}
      <path
        d="M19.4 4.4 Q25.4 4.4 27.4 9.4 L19.4 12.4 Q17.4 8.4 19.4 4.4 Z"
        fill={mat(id, 'os')}
        {...contour('os', 1)}
      />
      {hatch('M20.4 5.4 L21.4 11.4 M22.6 4.8 L23.6 10.8 M24.6 5.8 L25.6 10.2', '#A2947A', 0.55, 0.8)}
      <path d="M17.4 12.6 L19.6 11.4" stroke="#C9A227" strokeWidth="1.1" strokeLinecap="round" />
    </>
  ),
});

/** Forges — enclume à bigorne et marteau levé. */
export const IconCompForges = makeIcon({
  mats: ['fer', 'bois', 'braise'],
  seed: 217,
  draw: (id) => (
    <>
      <path
        d="M3.4 13.4 L23.4 13.4 L27.6 10.4 L28.4 13.6 L24.4 17.4 L18.4 17.4 L19.4 21.4 L23.4 21.4 L24.4 25.4 L7.6 25.4 L8.6 21.4 L12.6 21.4 L13.6 17.4 L6.4 17.4 Q3.4 16.4 3.4 13.4 Z"
        fill={mat(id, 'fer')}
        {...contour('fer', 1.1)}
      />
      {keyLight('M5.4 14.4 L22.4 14.4 M9.6 22.4 L22.4 22.4', 0.44, 1.1)}
      {coolShade('M23.4 18.4 L20.4 20.4 M22.6 23.6 L9.4 23.6', 0.3, 1)}
      <path d="M10.4 4.4 L21.6 4.4 L21.6 8.4 L10.4 8.4 Z" fill={mat(id, 'fer')} {...contour('fer', 0.95)} />
      <path d="M15.4 8.4 L17 8.4 L17 12.4 L15.4 12.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.8)} />
      <path d="M6.4 27.4 a1.5 1.5 0 1 0 0.1 0 Z M25.4 27.4 a1.2 1.2 0 1 0 0.1 0 Z M16 28.4 a1 1 0 1 0 0.1 0 Z" fill={mat(id, 'braise')} className="hmm-scintille" />
    </>
  ),
});

/** Balistique — bras de trébuchet armé et boulet de granit. */
export const IconCompBalistique = makeIcon({
  mats: ['bois', 'pierre', 'cuir'],
  seed: 219,
  draw: (id) => (
    <>
      <path d="M4.4 28.4 L14.4 12.4 L16.6 13.8 L6.6 29.4 Z" fill={mat(id, 'bois')} {...contour('bois', 1)} />
      <path d="M27.6 28.4 L17.6 12.4 L15.4 13.8 L25.4 29.4 Z" fill={mat(id, 'bois')} {...contour('bois', 1)} />
      <path d="M6.4 22.4 L25.6 22.4 L25.6 24.4 L6.4 24.4 Z" fill={mat(id, 'bois')} opacity="0.9" />
      <path d="M26.4 3.4 L28.6 5.4 L8.4 20.4 L6.4 18.4 Z" fill={mat(id, 'bois')} {...contour('bois', 1.05)} />
      {keyLight('M26 4.6 L8.4 18.6', 0.42, 1.1)}
      <path d="M6.4 18.4 Q3.4 20.4 4.4 23.4 L8.6 21.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 0.9)} />
      <path
        d="M26 2.4 C28.5 2.4 30.4 4.3 30.4 6.8 C30.4 9.3 28.5 11.2 26 11.2 C23.5 11.2 21.6 9.3 21.6 6.8 C21.6 4.3 23.5 2.4 26 2.4 Z"
        fill={mat(id, 'pierre')}
        {...contour('pierre', 1)}
      />
      {keyLight('M23.4 5 A4.4 4.4 0 0 1 26.4 3.4', 0.5, 1.2)}
      {hatch('M24.4 8.4 L27.4 9.6 M25.4 6.4 L28.6 7.4', '#25272A', 0.3, 0.8)}
    </>
  ),
});

/** Guérison — mortier de pierre, pilon et brins d'herbes. */
export const IconCompGuerison = makeIcon({
  mats: ['pierre', 'feuille', 'bois', 'eau'],
  seed: 221,
  draw: (id) => (
    <>
      <path d="M6.4 15.4 L25.6 15.4 Q25.6 26.4 18.4 28.4 L13.6 28.4 Q6.4 26.4 6.4 15.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1.1)} />
      <path d="M4.4 13.4 L27.6 13.4 L27.6 16.4 L4.4 16.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.95)} />
      {keyLight('M8.4 17.4 Q8.6 24.4 13.4 27', 0.42, 1.2)}
      {coolShade('M23.6 17.4 Q23.4 24.4 18.6 27.2', 0.3, 1.1)}
      <path d="M20.4 3.4 L23.6 6.4 L14.4 15.4 L11.4 12.4 Z" fill={mat(id, 'bois')} {...contour('bois', 1)} />
      <path
        d="M9.4 12.4 Q6.4 6.4 10.4 2.4 Q13.4 6.4 11.4 12.6 Z"
        fill={mat(id, 'feuille')}
        {...contour('feuille', 0.95)}
      />
      <path d="M10.4 3.6 Q10.4 8 10.4 12" stroke="#26351F" strokeOpacity="0.5" strokeWidth="0.8" />
      <path d="M13.4 20.4 a1.6 1.6 0 1 0 0.1 0 Z M18.4 22.4 a1.2 1.2 0 1 0 0.1 0 Z" fill={mat(id, 'eau')} opacity="0.75" />
    </>
  ),
});

/** Érudition — codex ouvert, plume d'oie et encrier. */
export const IconCompErudition = makeIcon({
  mats: ['parchemin', 'cuir', 'ivoire', 'encre'],
  seed: 223,
  draw: (id) => (
    <>
      <path d="M2.6 9.4 Q9 7 15.4 9.4 L15.4 26.4 Q9 24 2.6 26.4 Z" fill={mat(id, 'parchemin')} {...contour('parchemin', 1.05)} />
      <path d="M16.6 9.4 Q23 7 29.4 9.4 L29.4 26.4 Q23 24 16.6 26.4 Z" fill={mat(id, 'parchemin')} {...contour('parchemin', 1.05)} />
      <path d="M15.4 9 L16.6 9 L16.6 26.8 L15.4 26.8 Z" fill={mat(id, 'cuir')} {...contour('cuir', 0.8)} />
      {keyLight('M4 10.4 Q9.4 8.8 14.4 10.6', 0.44, 1.1)}
      {hatch('M4.6 13.4 Q9.4 11.8 13.6 13.6 M4.6 16.4 Q9.4 14.8 13.6 16.6 M4.6 19.4 Q9.4 17.8 13.6 19.6', '#B6A682', 0.6, 0.85)}
      {hatch('M18.4 13.4 Q23 11.8 27.4 13.6 M18.4 16.4 Q23 14.8 27.4 16.6', '#B6A682', 0.55, 0.85)}
      <path d="M28.6 2.4 Q23.4 6.4 20.4 14.4 Q19.4 18.4 21.4 22.4 Q24.4 17.4 26.4 12.4 Q28.6 7.4 28.6 2.4 Z" fill={mat(id, 'ivoire')} {...contour('ivoire', 0.95)} />
      <path d="M27 5.4 Q23.4 11.4 21.4 20.4" stroke="#BCAE97" strokeOpacity="0.7" strokeWidth="0.8" />
      <path d="M20.4 22 L22.6 24.4 L20 26.4 Z" fill={mat(id, 'encre')} />
    </>
  ),
});

/** Occultisme — cercle de sceaux, chandelle et clef de mystère. */
export const IconCompOccultisme = makeIcon({
  mats: ['etoffe', 'or', 'braise', 'os'],
  radial: ['etoffe'],
  seed: 225,
  draw: (id) => (
    <>
      <path
        d="M16 3.4 C22.9 3.4 28.6 9.1 28.6 16 C28.6 22.9 22.9 28.6 16 28.6 C9.1 28.6 3.4 22.9 3.4 16 C3.4 9.1 9.1 3.4 16 3.4 Z"
        fill={matR(id, 'etoffe')}
        {...contour('etoffe', 1.1)}
      />
      <path
        d="M16 5.6 C21.7 5.6 26.4 10.3 26.4 16 C26.4 21.7 21.7 26.4 16 26.4 C10.3 26.4 5.6 21.7 5.6 16 C5.6 10.3 10.3 5.6 16 5.6 Z"
        fill="none"
        stroke={mat(id, 'or')}
        strokeWidth="1"
        strokeDasharray="2.6 1.6"
      />
      {keyLight('M7.4 9.4 A11 11 0 0 1 15.4 4.8', 0.34, 1.3)}
      <path
        d="M16 8.4 L22.4 12.6 L20 20.4 L12 20.4 L9.6 12.6 Z"
        fill="none"
        stroke={mat(id, 'or')}
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
      <path d="M14.6 15.4 L17.4 15.4 L17.4 24.4 L14.6 24.4 Z" fill={mat(id, 'os')} {...contour('os', 0.85)} />
      <path d="M16 10.4 Q17.8 12.6 16.9 14.6 Q16.4 15.6 16 15.6 Q15.6 15.6 15.1 14.6 Q14.2 12.6 16 10.4 Z" fill={mat(id, 'braise')} className="hmm-scintille" />
      {hatch('M15.2 17.4 L16.8 17.4 M15.2 20.4 L16.8 20.4', '#A2947A', 0.5, 0.7)}
    </>
  ),
});

/** Commandement — oliphant d'appel, cordons et embouchure d'or. */
export const IconCompCommandement = makeIcon({
  mats: ['os', 'or', 'grenat'],
  seed: 227,
  draw: (id) => (
    <>
      <path
        d="M3.4 9.4 Q3.4 5.4 7.4 5.4 Q16.4 5.4 22.4 12.4 Q28.4 19.4 28.4 26.4 L21.4 26.4 Q21.4 20.4 16.4 15.4 Q11.4 10.4 6.4 10.4 Q3.4 10.4 3.4 9.4 Z"
        fill={mat(id, 'os')}
        {...contour('os', 1.1)}
      />
      {keyLight('M5.4 7.4 Q13.4 7.4 19.4 14.4', 0.48, 1.3)}
      {coolShade('M23.4 17.4 Q26.6 22.4 26.6 25.4', 0.3, 1.2)}
      <path d="M20.4 24.4 L30 24.4 L30 29.4 L20.4 29.4 Z" fill={mat(id, 'or')} {...contour('or', 1)} />
      <path d="M2.6 4.4 L8.4 4.4 L8.4 11 L2.6 11 Z" fill={mat(id, 'or')} {...contour('or', 0.95)} />
      {hatch('M4.4 5.6 L4.4 9.8 M6.4 5.6 L6.4 9.8', '#7A6116', 0.4, 0.8)}
      <path d="M8.4 9.4 Q13.4 16.4 10.4 22.4 Q9.4 24.4 11.4 25.4" fill="none" stroke={mat(id, 'grenat')} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M11.4 25.4 L14.4 27.4 L10.4 29 Z" fill={mat(id, 'grenat')} {...contour('grenat', 0.8)} />
    </>
  ),
});

/** Fortune — trois osselets jetés et une pièce sur la tranche. */
export const IconCompFortune = makeIcon({
  mats: ['os', 'or', 'cuir'],
  radial: ['or'],
  seed: 229,
  draw: (id) => (
    <>
      <path d="M3.4 24.4 Q16 21.4 28.6 24.4 L28.6 26.4 Q16 29.4 3.4 26.4 Z" fill={mat(id, 'cuir')} opacity="0.6" />
      <path
        d="M5.4 14.4 Q8.4 12.4 11.4 14.4 Q13.4 15.8 12.6 18.4 Q14.4 20.4 12.4 22.4 Q9.4 24.4 6.4 22.4 Q4.4 21 5.2 18.4 Q3.4 16.4 5.4 14.4 Z"
        fill={mat(id, 'os')}
        {...contour('os', 1.05)}
      />
      {hatch('M7.4 17.4 L10.4 17.4 M7 20 L10.8 20', '#A2947A', 0.5, 0.8)}
      <path
        d="M13.4 8.4 Q16.4 6.4 19.4 8.4 Q21.4 9.8 20.6 12.4 Q22.4 14.4 20.4 16.4 Q17.4 18.4 14.4 16.4 Q12.4 15 13.2 12.4 Q11.4 10.4 13.4 8.4 Z"
        fill={mat(id, 'os')}
        opacity="0.94"
        {...contour('os', 1)}
      />
      {keyLight('M14.4 10.4 Q16.4 9.4 18.4 10.4', 0.44, 1)}
      <path
        d="M22.4 14.4 C25.5 14.4 28 16.9 28 20 C28 23.1 25.5 25.6 22.4 25.6 C19.3 25.6 16.8 23.1 16.8 20 C16.8 16.9 19.3 14.4 22.4 14.4 Z"
        fill={matR(id, 'or')}
        {...contour('or', 1)}
      />
      <path d="M22.4 17 L23.4 19.4 L26 19.4 L23.9 21 L24.7 23.4 L22.4 21.9 L20.1 23.4 L20.9 21 L18.8 19.4 L21.4 19.4 Z" fill="#7A6116" fillOpacity="0.55" />
    </>
  ),
});

/** Embuscade — dague tirée derrière un rideau de feuillage. */
export const IconCompEmbuscade = makeIcon({
  mats: ['sapin', 'acier', 'cuir', 'feuille'],
  seed: 231,
  draw: (id) => (
    <>
      <path d="M19.4 3.4 L22.4 4.4 L20.4 19.4 L17.4 19.4 Z" fill={mat(id, 'acier')} {...contour('acier', 1)} />
      {keyLight('M19.8 5.4 L18.4 18', 0.44, 0.9)}
      <path d="M15.4 19 L24.4 19 L24 21.4 L15.8 21.4 Z" fill={mat(id, 'acier')} opacity="0.9" {...contour('acier', 0.85)} />
      <path d="M18.4 21.4 L21.4 21.4 L20.8 27.4 L19 27.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 0.9)} />
      <path
        d="M1.6 30 Q1.6 20.4 6.4 15.4 Q4.4 21.4 6.4 26.4 Q8.4 19.4 13.4 16.4 Q11.4 22.4 12.4 27.4 Q15.4 21.4 19.4 20.4 Q16.4 24.4 16.4 30 Z"
        fill={mat(id, 'sapin')}
        {...contour('sapin', 1.05)}
      />
      <path d="M22.4 24.4 Q27.4 21.4 30.4 24.4 Q27.4 27.4 30.4 30 L20.4 30 Q22.4 27.4 22.4 24.4 Z" fill={mat(id, 'feuille')} {...contour('feuille', 1)} />
      {hatch('M4.4 22.4 L4.4 28 M9.4 21.4 L9.4 27.4 M25.4 26 L25.4 29', '#111E17', 0.32, 0.8)}
    </>
  ),
});

/** Commerce — balance de la halle, plateaux inégaux. */
export const IconCompCommerce = makeIcon({
  mats: ['or', 'bois', 'acier'],
  seed: 233,
  draw: (id) => (
    <>
      <path d="M15.2 3.4 L16.8 3.4 L16.8 26.4 L15.2 26.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.85)} />
      <path d="M9.4 26.4 L22.6 26.4 L24.4 29.6 L7.6 29.6 Z" fill={mat(id, 'bois')} {...contour('bois', 1)} />
      <path d="M4.4 7.4 L27.6 6.4 L27.6 8.4 L4.4 9.4 Z" fill={mat(id, 'acier')} {...contour('acier', 0.9)} />
      <path d="M16 2.4 a2 2 0 1 0 0.1 0 Z" fill={mat(id, 'or')} {...contour('or', 0.8)} />
      <path d="M6.4 8.6 L6.4 13.4 M25.6 7.6 L25.6 12.4" stroke="#7C8794" strokeWidth="0.9" />
      <path d="M1.4 13.4 L11.4 13.4 Q10.4 19.4 6.4 20.4 Q2.4 19.4 1.4 13.4 Z" fill={mat(id, 'or')} {...contour('or', 1.05)} />
      <path d="M20.6 12.4 L30.6 12.4 Q29.6 18.4 25.6 19.4 Q21.6 18.4 20.6 12.4 Z" fill={mat(id, 'or')} opacity="0.92" {...contour('or', 1)} />
      {keyLight('M2.6 14.4 Q4 18 6.4 19.2', 0.44, 1.1)}
      {hatch('M4.4 14.6 L4.4 17.4 M8.4 14.6 L8.4 17.4 M23.6 13.6 L23.6 16.4 M27.6 13.6 L27.6 16.4', '#7A6116', 0.34, 0.8)}
    </>
  ),
});

/** Cartographie — rose des vents et compas à pointes sèches. */
export const IconCompCartographie = makeIcon({
  mats: ['parchemin', 'or', 'acier', 'grenat'],
  seed: 235,
  draw: (id) => (
    <>
      <path
        d="M3.4 4.4 L28.6 4.4 L28.6 27.6 L3.4 27.6 Z"
        fill={mat(id, 'parchemin')}
        {...contour('parchemin', 1.05)}
      />
      {keyLight('M5 5.4 L5 26.4', 0.44, 1.1)}
      {hatch('M3.4 10.4 L28.6 10.4 M3.4 21.4 L28.6 21.4 M10.4 4.4 L10.4 27.6 M21.6 4.4 L21.6 27.6', '#B6A682', 0.4, 0.7)}
      <path
        d="M16 6.4 L18.4 13.6 L25.6 16 L18.4 18.4 L16 25.6 L13.6 18.4 L6.4 16 L13.6 13.6 Z"
        fill={mat(id, 'or')}
        {...contour('or', 1)}
      />
      <path d="M16 6.4 L17.4 14.6 L16 16 L14.6 14.6 Z" fill={mat(id, 'grenat')} opacity="0.9" />
      <path d="M16 16 a1.6 1.6 0 1 0 0.1 0 Z" fill={mat(id, 'acier')} {...contour('acier', 0.7)} />
      <path d="M24.4 22.4 L27.4 28.6 M24.4 22.4 L21.4 28.6" stroke={mat(id, 'acier')} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M24.4 21.4 a1.2 1.2 0 1 0 0.1 0 Z" fill={mat(id, 'acier')} />
    </>
  ),
});

/** Résistance — pan de courtine et écu adossé. */
export const IconCompResistance = makeIcon({
  mats: ['pierre', 'acier', 'or'],
  seed: 237,
  draw: (id) => (
    <>
      <path d="M2.6 8.4 L29.4 8.4 L29.4 29.4 L2.6 29.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1.05)} />
      <path d="M2.6 8.4 L2.6 4.4 L6.6 4.4 L6.6 8.4 M10.6 8.4 L10.6 4.4 L14.6 4.4 L14.6 8.4 M18.6 8.4 L18.6 4.4 L22.6 4.4 L22.6 8.4 M26.6 8.4 L26.6 4.4 L29.4 4.4 L29.4 8.4" fill={mat(id, 'pierre')} {...contour('pierre', 0.9)} />
      {hatch('M2.6 14.4 L29.4 14.4 M2.6 20.4 L29.4 20.4 M2.6 25.4 L29.4 25.4 M9.4 8.4 L9.4 14.4 M19.4 8.4 L19.4 14.4 M6.4 14.4 L6.4 20.4 M14.4 14.4 L14.4 20.4 M23.4 14.4 L23.4 20.4 M10.4 20.4 L10.4 25.4 M21.4 20.4 L21.4 25.4', '#25272A', 0.4, 0.9)}
      {keyLight('M3.6 9.4 L28.4 9.4', 0.4, 1)}
      <path
        d="M16 11.4 L23.4 13.8 V19.4 C23.4 24 19.8 27 16 28.4 C12.2 27 8.6 24 8.6 19.4 V13.8 Z"
        fill={mat(id, 'acier')}
        {...contour('acier', 1.1)}
      />
      {keyLight('M16 12.8 L10 14.8 V19.4 C10 22.6 12.6 25.2 15.4 26.6', 0.4, 1.2)}
      <path d="M16 15.4 L19.4 17.4 L16 19.4 L12.6 17.4 Z" fill={mat(id, 'or')} opacity="0.9" />
    </>
  ),
});

/** Invocation — cercle de bornes levées d'où monte une silhouette. */
export const IconCompInvocation = makeIcon({
  mats: ['pierre', 'eau', 'or', 'feuille'],
  radial: ['eau'],
  seed: 239,
  draw: (id) => (
    <>
      <path d="M2.6 24.4 Q16 20.4 29.4 24.4 Q16 28.6 2.6 24.4 Z" fill={mat(id, 'pierre')} opacity="0.55" />
      <path d="M3.4 15.4 Q5.4 13.4 7.4 15.4 L8.4 24.4 Q6 25.4 3.4 24.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1)} />
      <path d="M24.6 15.4 Q26.6 13.4 28.6 15.4 L29 24.4 Q26.4 25.4 23.6 24.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1)} />
      <path d="M10.4 20.4 Q11.6 18.4 13 20.4 L13.4 26 Q11.6 26.8 9.8 26 Z" fill={mat(id, 'pierre')} opacity="0.85" {...contour('pierre', 0.9)} />
      <path d="M19 20.4 Q20.4 18.4 21.6 20.4 L22.2 26 Q20.4 26.8 18.6 26 Z" fill={mat(id, 'pierre')} opacity="0.85" {...contour('pierre', 0.9)} />
      <path
        d="M16 2.4 Q20.4 7.4 20.4 13.4 Q20.4 19.4 16 23.4 Q11.6 19.4 11.6 13.4 Q11.6 7.4 16 2.4 Z"
        fill={matR(id, 'eau')}
        fillOpacity="0.82"
        {...contour('eau', 1)}
      />
      {keyLight('M14 6.4 Q12.6 11.4 13.4 17.4', 0.44, 1.2)}
      <path d="M16 8.4 L17.4 12.4 L21.4 13.4 L17.4 14.4 L16 18.4 L14.6 14.4 L10.6 13.4 L14.6 12.4 Z" fill={mat(id, 'or')} opacity="0.85" className="hmm-scintille" />
      <path d="M6.4 28.4 Q8.4 25.4 11.4 26.4 Q9.4 29 6.4 28.4 Z" fill={mat(id, 'feuille')} opacity="0.8" />
    </>
  ),
});

/** Registre des vingt icônes de compétence, clef `competence_<id>`. */
export const SKILL_ICONS: Readonly<Record<string, IconComponent>> = {
  logistique: IconCompLogistique,
  tactique: IconCompTactique,
  seigneurie: IconCompSeigneurie,
  intendance: IconCompIntendance,
  diplomatie: IconCompDiplomatie,
  reconnaissance: IconCompReconnaissance,
  sylviculture: IconCompSylviculture,
  pelerinage: IconCompPelerinage,
  forges: IconCompForges,
  balistique: IconCompBalistique,
  guerison: IconCompGuerison,
  erudition: IconCompErudition,
  occultisme: IconCompOccultisme,
  commandement: IconCompCommandement,
  fortune: IconCompFortune,
  embuscade: IconCompEmbuscade,
  commerce: IconCompCommerce,
  cartographie: IconCompCartographie,
  resistance: IconCompResistance,
  invocation: IconCompInvocation,
};

/** Libellés français des compétences, pour les info-bulles de la galerie. */
export const SKILL_LABELS: Readonly<Record<string, string>> = {
  logistique: 'Logistique',
  tactique: 'Tactique',
  seigneurie: 'Seigneurie',
  intendance: 'Intendance',
  diplomatie: 'Diplomatie',
  reconnaissance: 'Reconnaissance',
  sylviculture: 'Sylviculture',
  pelerinage: 'Pèlerinage',
  forges: 'Forges',
  balistique: 'Balistique',
  guerison: 'Guérison',
  erudition: 'Érudition',
  occultisme: 'Occultisme',
  commandement: 'Commandement',
  fortune: 'Fortune',
  embuscade: 'Embuscade',
  commerce: 'Commerce',
  cartographie: 'Cartographie',
  resistance: 'Résistance',
  invocation: 'Invocation',
};
