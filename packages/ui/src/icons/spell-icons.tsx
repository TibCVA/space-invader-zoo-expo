/**
 * Les trente-deux sorts, huit par école. Clefs d'atlas imposées par
 * `packages/content` : `sort_<ecole>_<degre>`.
 *
 * Construction commune, pour que la famille se lise d'un coup d'œil :
 *  1. cartouche hexagonal en matière de l'école (dégradé radial + contour teinté) ;
 *  2. modelé — haute lumière chaude au nord-ouest, ombre froide au sud-est ;
 *  3. glyphe propre au sort, dessiné à la main, unique parmi les trente-deux ;
 *  4. ferrure d'or dont la richesse indique le degré :
 *     degrés 1–2 filet simple, 3–4 filet et deux clous, 5–6 écoinçons,
 *     7–8 double filet et fleuron sommital.
 */

import type { ReactNode } from 'react';
import { contour, coolShade, hatch, keyLight, makeIcon, mat, matR } from './kit.js';
import type { IconComponent, MaterialKey } from './kit.js';

type School = 'braises' | 'sources' | 'brumes' | 'racines';

const SCHOOL_MAT: Readonly<Record<School, MaterialKey>> = {
  braises: 'braise',
  sources: 'eau',
  brumes: 'brume',
  racines: 'feuille',
};

const CARTOUCHE = 'M16 1.8 L28.2 8.6 L28.2 22.4 L16 30.2 L3.8 22.4 L3.8 8.6 Z';

/** Ferrure du cartouche : plus le degré est haut, plus l'orfèvrerie est riche. */
function frame(id: string, level: number): ReactNode {
  const rank = level <= 2 ? 0 : level <= 4 ? 1 : level <= 6 ? 2 : 3;
  return (
    <>
      <path
        d={CARTOUCHE}
        fill="none"
        stroke={mat(id, 'or')}
        strokeWidth={rank >= 3 ? 1.5 : 1.05}
        strokeLinejoin="round"
        opacity={0.9}
      />
      {rank >= 1 ? (
        <path
          d="M16 3.4 a0.95 0.95 0 1 0 0.1 0 Z M16 27.4 a0.95 0.95 0 1 0 0.1 0 Z"
          fill={mat(id, 'or')}
        />
      ) : null}
      {rank >= 2 ? (
        <path
          d="M4.6 9.6 L7.4 8 M27.4 9.6 L24.6 8 M4.6 21.4 L7.4 23 M27.4 21.4 L24.6 23"
          stroke={mat(id, 'or')}
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.85"
        />
      ) : null}
      {rank >= 3 ? (
        <>
          <path d={CARTOUCHE} fill="none" stroke={mat(id, 'or')} strokeWidth="0.6" opacity="0.55" transform="translate(16 16) scale(0.9) translate(-16 -16)" />
          <path d="M16 0.4 L18 2.6 L16 4.4 L14 2.6 Z" fill={mat(id, 'or')} {...contour('or', 0.6)} />
        </>
      ) : null}
    </>
  );
}

function spellIcon(school: School, level: number, seed: number, glyph: (id: string) => ReactNode): IconComponent {
  const m = SCHOOL_MAT[school];
  return makeIcon({
    mats: [m, 'or', 'pierre', 'ivoire', 'encre', 'os'],
    radial: [m, 'or'],
    seed,
    draw: (id) => (
      <>
        <path d={CARTOUCHE} fill={matR(id, m)} {...contour(m, 1.1)} />
        {keyLight('M4.6 9.4 L16 3 L26 8.6', 0.34, 1.3)}
        {coolShade('M27.4 21.6 L16 28.8 L5.4 22.2', 0.3, 1.3)}
        {glyph(id)}
        {frame(id, level)}
      </>
    ),
  });
}

/* ───────────────────────────────  Braises  ──────────────────────────────── */

/** Étincelle des Farges — gerbe arrachée à l'enclume. */
export const IconSortBraises1 = spellIcon('braises', 1, 301, (id) => (
  <>
    <path d="M8.4 21.4 L23.6 21.4 L21.6 24.4 L10.4 24.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.9)} />
    <path d="M16 6.4 L17.6 12.4 L23.4 10.4 L19 14.6 L24.4 17.4 L18.4 17.4 L19.4 21 L15.4 17.8 L11.4 20.4 L13 16.4 L8 15.4 L13.4 13.4 L10.4 8.4 L15 12.4 Z" fill={mat(id, 'or')} {...contour('or', 0.85)} />
    <path d="M16 12.4 L17 15 L19.4 15.4 L17.2 16.6 L17.6 19 L16 17.6 L14 18.4 L14.8 16.2 L13 14.8 L15.4 14.8 Z" fill="#FFE9C2" fillOpacity="0.65" />
  </>
));

/** Acier tempéré — lame retrempée en pleine bataille. */
export const IconSortBraises2 = spellIcon('braises', 2, 302, (id) => (
  <>
    <path d="M13.4 5.4 L18.4 5.4 L17.6 20.4 L16 22.4 L14.4 20.4 Z" fill={mat(id, 'ivoire')} {...contour('ivoire', 0.95)} />
    <path d="M17.4 6.4 L16.8 20 L16 21.4 Z" fill={mat(id, 'braise')} opacity="0.9" />
    {keyLight('M14.6 7 L14.2 19', 0.5, 0.9)}
    <path d="M10.4 20.4 L21.6 20.4 L21 22.6 L11 22.6 Z" fill={mat(id, 'or')} {...contour('or', 0.85)} />
    <path d="M14.8 22.6 L17.2 22.6 L16.8 26.4 L15.2 26.4 Z" fill={mat(id, 'os')} />
    {hatch('M11.4 8.4 L9.4 6.4 M20.6 8.4 L22.6 6.4', '#5A1D0B', 0.45, 1)}
  </>
));

/** Cendre aux yeux — tourbillon de cendre brûlante. */
export const IconSortBraises3 = spellIcon('braises', 3, 303, (id) => (
  <>
    <path
      d="M6.4 16.4 Q12.4 10.4 16 14.4 Q19.6 18.4 25.6 13.4"
      fill="none"
      stroke={mat(id, 'os')}
      strokeWidth="2.2"
      strokeLinecap="round"
      opacity="0.85"
    />
    <path
      d="M7.4 21.4 Q13.4 15.4 17 19.4 Q20.6 23.4 26.4 18.4"
      fill="none"
      stroke={mat(id, 'os')}
      strokeWidth="1.8"
      strokeLinecap="round"
      opacity="0.6"
    />
    <path d="M11.4 9.4 Q16 6.4 20.6 9.4 Q16 12.4 11.4 9.4 Z" fill={mat(id, 'ivoire')} {...contour('ivoire', 0.85)} />
    <path d="M16 8.2 a1.5 1.5 0 1 0 0.1 0 Z" fill={mat(id, 'encre')} />
    <path d="M9.4 12.4 a0.9 0.9 0 1 0 0.1 0 Z M22.6 11.4 a0.8 0.8 0 1 0 0.1 0 Z M13.4 24.4 a0.8 0.8 0 1 0 0.1 0 Z" fill={mat(id, 'os')} opacity="0.7" />
  </>
));

/** Trait incandescent — barre de métal en fusion tirée d'un bout à l'autre. */
export const IconSortBraises4 = spellIcon('braises', 4, 304, (id) => (
  <>
    <path d="M3.4 17.4 L28.6 13.4 L28.6 17 L3.4 21 Z" fill={mat(id, 'braise')} {...contour('braise', 0.95)} />
    <path d="M4.4 17.6 L27.6 14.2 L27.6 15.8 L4.4 19.2 Z" fill="#FFE9C2" fillOpacity="0.72" />
    <path d="M28.6 13.4 L31 15.4 L28.6 17 Z" fill={mat(id, 'or')} />
    {hatch('M8.4 12.4 L9.4 9.4 M15.4 11 L16.4 8 M22.4 9.6 L23.4 6.6', '#FFC873', 0.6, 1.1)}
    {hatch('M9.4 23.4 L8.4 26.4 M16.4 22 L15.4 25 M23.4 20.6 L22.4 23.6', '#B4491F', 0.5, 1)}
  </>
));

/** Mur de braises — lit de charbons ardents sur trois hexagones. */
export const IconSortBraises5 = spellIcon('braises', 5, 305, (id) => (
  <>
    <path d="M5.4 22.4 L11 19.4 L16 22.4 L21 19.4 L26.6 22.4 L26.6 25.4 L5.4 25.4 Z" fill={mat(id, 'encre')} opacity="0.55" />
    <path d="M6.4 22.4 L10.4 21 L14 22.4 L14 25 L6.4 25 Z M14.4 21.4 L18 20 L21.6 21.4 L21.6 25 L14.4 25 Z M22 22.4 L25.6 21.4 L26 25 L22 25 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.8)} />
    <path d="M9.4 21.4 Q11.4 15.4 9.4 11.4 Q14.4 13.4 13.4 19.4 Q14.4 15.4 17.4 13.4 Q17.4 18.4 15.4 21.4 Z" fill={mat(id, 'braise')} {...contour('braise', 0.9)} />
    <path d="M18.4 21.4 Q19.4 16.4 22.4 14.4 Q22.4 19.4 21.4 21.4 Z" fill={mat(id, 'braise')} opacity="0.9" />
    <path d="M11.4 19.4 Q12.4 16.4 11.6 14.4 Q13.6 16.4 13 19.6 Z" fill="#FFE9C2" fillOpacity="0.55" />
  </>
));

/** Marteau rouge — le geste du forgeron à l'échelle d'une bataille. */
export const IconSortBraises6 = spellIcon('braises', 6, 306, (id) => (
  <>
    <path d="M14.6 15.4 L17.4 15.4 L16.6 28 L15.4 28 Z" fill={mat(id, 'os')} {...contour('os', 0.85)} />
    <path d="M7.4 8.4 L24.6 6.4 L25.4 13.4 L8.2 15.4 Z" fill={mat(id, 'braise')} {...contour('braise', 1.05)} />
    {keyLight('M8.6 9.4 L23.4 7.6', 0.5, 1.2)}
    <path d="M9.4 10.4 L23.6 8.8 L23.9 11.2 L9.7 12.8 Z" fill="#FFE9C2" fillOpacity="0.4" />
    <path d="M7.4 8.4 L4.4 9.4 L5 14.4 L8.2 15.4 Z" fill={mat(id, 'braise')} opacity="0.9" {...contour('braise', 0.85)} />
    {hatch('M11.4 17.4 L9.4 20.4 M20.6 17.4 L22.6 20.4', '#FFC873', 0.55, 1)}
  </>
));

/** Fournaise du rempart — l'air entre les murs devient un four à chaux. */
export const IconSortBraises7 = spellIcon('braises', 7, 307, (id) => (
  <>
    <path d="M5.4 12.4 L5.4 8.4 L8.4 8.4 L8.4 12.4 L11.4 12.4 L11.4 8.4 L14.4 8.4 L14.4 12.4 L17.6 12.4 L17.6 8.4 L20.6 8.4 L20.6 12.4 L23.6 12.4 L23.6 8.4 L26.6 8.4 L26.6 12.4 L26.6 26.4 L5.4 26.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1.05)} />
    {keyLight('M6.4 9.4 L6.4 25.4', 0.42, 1.1)}
    {hatch('M5.4 16.4 L26.6 16.4 M5.4 21.4 L26.6 21.4 M11.4 12.4 L11.4 16.4 M20.6 12.4 L20.6 16.4 M8.4 16.4 L8.4 21.4 M16 16.4 L16 21.4 M23.6 16.4 L23.6 21.4', '#25272A', 0.34, 0.8)}
    <path d="M9.4 26.4 Q11.4 20.4 9.4 16.4 Q14.4 18.4 13.4 24.4 Q15.4 19.4 18.4 17.4 Q19.4 22.4 17.4 26.4 Z" fill={mat(id, 'braise')} opacity="0.92" {...contour('braise', 0.85)} />
    <path d="M19.4 26.4 Q21.4 21.4 23.6 19.4 Q23.6 24.4 22.4 26.4 Z" fill={mat(id, 'braise')} opacity="0.8" />
  </>
));

/** Couronne de feu ancien — le degré ultime des Braises. */
export const IconSortBraises8 = spellIcon('braises', 8, 308, (id) => (
  <>
    <path d="M7.4 22.4 L24.6 22.4 L23.6 26.4 L8.4 26.4 Z" fill={mat(id, 'or')} {...contour('or', 1)} />
    {hatch('M11.4 23.4 L11.4 25.4 M16 23.4 L16 25.4 M20.6 23.4 L20.6 25.4', '#7A6116', 0.4, 0.8)}
    <path
      d="M7.4 22.4 L6.4 10.4 Q9.4 14.4 11.4 13.4 Q10.4 7.4 13.4 5.4 Q13.4 10.4 16 12.4 Q18.6 10.4 18.6 5.4 Q21.6 7.4 20.6 13.4 Q22.6 14.4 25.6 10.4 L24.6 22.4 Z"
      fill={mat(id, 'braise')}
      {...contour('braise', 1.1)}
    />
    <path d="M13.4 21.4 Q13.4 16.4 16 13.4 Q18.6 16.4 18.6 21.4 Z" fill="#FFE9C2" fillOpacity="0.55" />
    {keyLight('M8 12.4 L8.6 20.4', 0.45, 1.1)}
  </>
));

/* ───────────────────────────────  Sources  ──────────────────────────────── */

/** Rosée vive — trois gouttes sur un brin. */
export const IconSortSources1 = spellIcon('sources', 1, 311, (id) => (
  <>
    <path d="M9.4 27.4 Q11.4 15.4 20.6 8.4" fill="none" stroke="#4A6138" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M13.4 19.4 Q18.4 16.4 21.6 18.4 Q17.4 21.4 13.4 19.4 Z" fill="#4A6138" opacity="0.85" />
    <path d="M11.6 12.4 Q13.4 15.4 13.4 17 Q13.4 18.9 11.6 18.9 Q9.8 18.9 9.8 17 Q9.8 15.4 11.6 12.4 Z" fill={matR(id, 'eau')} {...contour('eau', 0.85)} />
    <path d="M21.4 11.4 Q23.4 14.4 23.4 16 Q23.4 17.9 21.4 17.9 Q19.6 17.9 19.6 16 Q19.6 14.4 21.4 11.4 Z" fill={matR(id, 'eau')} opacity="0.92" />
    <path d="M16.4 22.4 Q17.8 24.6 17.8 25.8 Q17.8 27.3 16.4 27.3 Q15 27.3 15 25.8 Q15 24.6 16.4 22.4 Z" fill={matR(id, 'eau')} opacity="0.85" />
    {keyLight('M10.8 15.4 Q10.4 17 11 18', 0.6, 0.8)}
  </>
));

/** Gué clair — pierres de passage dans le courant. */
export const IconSortSources2 = spellIcon('sources', 2, 312, (id) => (
  <>
    <path d="M3.6 12.4 Q10 10.4 16 12.4 Q22 14.4 28.4 12.4" fill="none" stroke={mat(id, 'eau')} strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    <path d="M3.6 24.4 Q10 22.4 16 24.4 Q22 26.4 28.4 24.4" fill="none" stroke={mat(id, 'eau')} strokeWidth="2" strokeLinecap="round" opacity="0.8" />
    <path d="M6.4 17.4 Q9.4 15.4 12.4 17.4 Q12.4 20.4 9.4 20.4 Q6.4 20.4 6.4 17.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.9)} />
    <path d="M13.4 15.4 Q16.4 13.4 19.4 15.4 Q19.4 18.4 16.4 18.4 Q13.4 18.4 13.4 15.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.9)} />
    <path d="M20.4 18.4 Q23.4 16.4 26.4 18.4 Q26.4 21.4 23.4 21.4 Q20.4 21.4 20.4 18.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.9)} />
    {keyLight('M7.4 17 Q9.4 15.8 11.4 16.6 M14.4 15 Q16.4 13.8 18.4 14.6', 0.5, 1)}
  </>
));

/** Eau réparatrice — vasque et croix de soin. */
export const IconSortSources3 = spellIcon('sources', 3, 313, (id) => (
  <>
    <path d="M6.4 14.4 L25.6 14.4 Q25.6 24.4 18.4 26.4 L13.6 26.4 Q6.4 24.4 6.4 14.4 Z" fill={matR(id, 'eau')} {...contour('eau', 1.05)} />
    <path d="M5.4 12.4 L26.6 12.4 L26.6 15 L5.4 15 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.9)} />
    {keyLight('M8.4 16.4 Q8.6 22.4 13 25', 0.44, 1.2)}
    <path d="M14.4 4.4 L17.6 4.4 L17.6 7.4 L20.6 7.4 L20.6 10.4 L17.6 10.4 L17.6 12.2 L14.4 12.2 L14.4 10.4 L11.4 10.4 L11.4 7.4 L14.4 7.4 Z" fill="#FFE9C2" fillOpacity="0.85" {...contour('eau', 0.7)} />
    <path d="M11.4 18.4 a1.4 1.4 0 1 0 0.1 0 Z M19.4 20.4 a1.1 1.1 0 1 0 0.1 0 Z" fill="#FFE9C2" fillOpacity="0.5" />
  </>
));

/** Voile de pluie — averse serrée sur le champ. */
export const IconSortSources4 = spellIcon('sources', 4, 314, (id) => (
  <>
    <path d="M6.4 11.4 Q6.4 6.4 12.4 6.4 Q14.4 3.4 18.4 4.4 Q23.6 5.4 23.6 10.4 Q26.6 11.4 26.4 14.4 L6.6 14.4 Q5.4 12.6 6.4 11.4 Z" fill={mat(id, 'brume')} fillOpacity="0.8" {...contour('brume', 1)} />
    {keyLight('M8.4 10.4 Q9.4 7.4 13.4 7.4', 0.44, 1.1)}
    <path
      d="M8.4 16.4 L6.4 22.4 M12.4 17.4 L10.4 24.4 M16 16.4 L14 23.4 M19.6 17.4 L17.6 24.4 M23.6 16.4 L21.6 22.4"
      stroke={mat(id, 'eau')}
      strokeWidth="1.5"
      strokeLinecap="round"
    />
    <path d="M10.4 26.4 a1 1 0 1 0 0.1 0 Z M17.4 26.4 a1 1 0 1 0 0.1 0 Z M21.4 24.4 a0.9 0.9 0 1 0 0.1 0 Z" fill={mat(id, 'eau')} opacity="0.7" />
  </>
));

/** Source miraculeuse — jaillissement au flanc du rocher. */
export const IconSortSources5 = spellIcon('sources', 5, 315, (id) => (
  <>
    <path d="M3.6 6.4 L14.4 4.4 L18.4 12.4 L14.4 26.4 L3.6 26.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1.05)} />
    {keyLight('M5 7.6 L5 25.4 M5.4 7 L13.4 5.6', 0.42, 1.1)}
    {hatch('M7.4 10.4 L11.4 12.4 M7 15.4 L11 17.4 M7.4 20.4 L11 22.4', '#25272A', 0.34, 0.8)}
    <path
      d="M16.4 12.4 Q22.4 12.4 24.4 17.4 Q26.4 22.4 24.4 26.4 L14.4 26.4 Q13.4 19.4 16.4 12.4 Z"
      fill={matR(id, 'eau')}
      {...contour('eau', 1)}
    />
    <path d="M17.4 14.4 Q16.4 20.4 17.4 25.4" stroke="#FFE9C2" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" fill="none" />
    <path d="M20.4 8.4 Q23.4 10.4 22.4 13.4 Q19.4 11.4 20.4 8.4 Z" fill={mat(id, 'eau')} opacity="0.7" />
  </>
));

/** Courant de la Durolle — tourbillon qui emporte les rangs. */
export const IconSortSources6 = spellIcon('sources', 6, 316, (id) => (
  <>
    <path
      d="M25.4 8.4 Q18.4 4.4 12.4 9.4 Q6.4 14.4 10.4 20.4 Q13.4 24.4 18.4 22.4 Q22.4 20.4 20.4 16.4 Q18.4 13.4 15.4 15.4"
      fill="none"
      stroke={mat(id, 'eau')}
      strokeWidth="2.6"
      strokeLinecap="round"
    />
    {keyLight('M23.4 8.6 Q17.4 5.6 12.6 10', 0.5, 1.1)}
    <path d="M15.4 12.4 L15.4 18.4 L11.4 15.4 Z" fill={mat(id, 'eau')} {...contour('eau', 0.85)} />
    <path
      d="M4.4 25.4 Q10.4 22.4 16 25.4 Q21.6 28.4 27.6 25.4"
      fill="none"
      stroke={mat(id, 'eau')}
      strokeWidth="1.6"
      strokeLinecap="round"
      opacity="0.7"
    />
    <path d="M22.6 11.4 a1 1 0 1 0 0.1 0 Z M9.4 11.4 a0.9 0.9 0 1 0 0.1 0 Z" fill="#FFE9C2" fillOpacity="0.6" />
  </>
));

/** Lit de la Vierge — bassin de pierre sous une étoile. */
export const IconSortSources7 = spellIcon('sources', 7, 317, (id) => (
  <>
    <path d="M16 3.4 L17.8 8.4 L23 8.4 L18.8 11.6 L20.4 16.4 L16 13.4 L11.6 16.4 L13.2 11.6 L9 8.4 L14.2 8.4 Z" fill="#FFE9C2" fillOpacity="0.75" {...contour('eau', 0.7)} />
    <path d="M4.4 18.4 L27.6 18.4 L25.4 27.4 L6.6 27.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1.05)} />
    <path d="M6.4 19.6 L25.6 19.6 L24.4 22.4 Q16 24.4 7.6 22.4 Z" fill={matR(id, 'eau')} />
    {keyLight('M6.4 19.4 L7.4 26.4', 0.42, 1.1)}
    {hatch('M11.4 20.4 L11 26.4 M16 20.4 L16 26.6 M20.6 20.4 L21 26.4', '#25272A', 0.3, 0.8)}
    <path d="M12.4 21.4 a1 1 0 1 0 0.1 0 Z M19.4 21.6 a0.9 0.9 0 1 0 0.1 0 Z" fill="#FFE9C2" fillOpacity="0.6" />
  </>
));

/** Fontaine de l'Alliance — deux jets qui se rejoignent sous un anneau. */
export const IconSortSources8 = spellIcon('sources', 8, 318, (id) => (
  <>
    <path d="M16 3.4 C18.9 3.4 21.2 5.7 21.2 8.6 C21.2 11.5 18.9 13.8 16 13.8 C13.1 13.8 10.8 11.5 10.8 8.6 C10.8 5.7 13.1 3.4 16 3.4 Z M16 6 C14.6 6 13.4 7.2 13.4 8.6 C13.4 10 14.6 11.2 16 11.2 C17.4 11.2 18.6 10 18.6 8.6 C18.6 7.2 17.4 6 16 6 Z" fill={mat(id, 'or')} {...contour('or', 0.9)} />
    <path d="M13.4 13.4 Q9.4 17.4 8.4 23.4 M18.6 13.4 Q22.6 17.4 23.6 23.4" fill="none" stroke={mat(id, 'eau')} strokeWidth="2.2" strokeLinecap="round" />
    <path d="M5.4 23.4 L26.6 23.4 L24.6 27.6 L7.4 27.6 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1)} />
    <path d="M6.6 24.2 L25.4 24.2 L24.8 25.6 Q16 27 7.2 25.6 Z" fill={matR(id, 'eau')} />
    {keyLight('M7.4 24.4 L8.4 27', 0.42, 1)}
  </>
));

/* ────────────────────────────────  Brumes  ──────────────────────────────── */

/** Brume basse — trois bandes qui noient le sol. */
export const IconSortBrumes1 = spellIcon('brumes', 1, 321, (id) => (
  <>
    <path d="M6.4 9.4 L11.4 4.4 L16.4 9.4 L21.4 5.4 L26.4 11.4 L26.4 14.4 L6.4 14.4 Z" fill={mat(id, 'pierre')} opacity="0.72" {...contour('pierre', 0.9)} />
    <path d="M4.4 15.4 Q10.4 13.4 16 15.4 Q21.6 17.4 27.6 15.4" fill="none" stroke={mat(id, 'brume')} strokeWidth="2.8" strokeLinecap="round" />
    <path d="M4.4 20.4 Q10.4 18.4 16 20.4 Q21.6 22.4 27.6 20.4" fill="none" stroke={mat(id, 'brume')} strokeWidth="3" strokeLinecap="round" opacity="0.86" />
    <path d="M5.4 25.4 Q11 23.6 16 25.4 Q21 27.2 26.6 25.4" fill="none" stroke={mat(id, 'brume')} strokeWidth="2.4" strokeLinecap="round" opacity="0.62" />
    {keyLight('M6.4 15 Q10.6 13.8 14.4 14.8', 0.4, 1)}
  </>
));

/** Pas effacé — empreinte qui s'estompe. */
export const IconSortBrumes2 = spellIcon('brumes', 2, 322, (id) => (
  <>
    <path
      d="M11.4 6.4 Q17.4 6.4 18.4 11.4 Q19.4 15.4 17.4 18.4 Q16 20.6 16.6 22.6 Q17.4 26 13.6 26.6 Q9.8 27 9 23.4 Q8.4 20.4 10 17.4 Q11.6 14.4 10.6 11.4 Q9.8 8 11.4 6.4 Z"
      fill={mat(id, 'encre')}
      fillOpacity="0.72"
      {...contour('encre', 0.9)}
    />
    <path
      d="M21.4 8.4 Q25.4 8.4 26.2 12.4 Q27 15.4 25.4 17.6 Q24.4 19.4 24.8 20.8 Q25.4 23.4 22.6 23.8 Q19.8 24.2 19.4 21.6"
      fill="none"
      stroke={mat(id, 'brume')}
      strokeWidth="1.4"
      strokeDasharray="2.4 2"
      strokeLinecap="round"
    />
    <path d="M4.4 20.4 Q10 18.6 15 20.4" fill="none" stroke={mat(id, 'brume')} strokeWidth="2.2" strokeLinecap="round" opacity="0.7" />
    <path d="M17.4 24.4 Q22.6 22.6 27.6 24.4" fill="none" stroke={mat(id, 'brume')} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
  </>
));

/** Reflet du Lac — croissant doublé par sa surface. */
export const IconSortBrumes3 = spellIcon('brumes', 3, 323, (id) => (
  <>
    <path d="M19.4 4.4 Q13.4 6.4 13.4 11.4 Q13.4 16.4 19.4 18.4 Q12.4 20.4 9.4 15.4 Q6.4 10.4 10.4 6.4 Q13.4 3.4 19.4 4.4 Z" fill={mat(id, 'ivoire')} {...contour('ivoire', 0.95)} />
    {keyLight('M11.4 7.4 Q9.4 11.4 11 15', 0.5, 1)}
    <path d="M3.6 20.4 Q10 18.4 16 20.4 Q22 22.4 28.4 20.4" fill="none" stroke={mat(id, 'brume')} strokeWidth="2.4" strokeLinecap="round" />
    <path d="M19.4 22.4 Q13.4 24 13.4 26.4 Q13.4 28.4 18.4 29 Q12.4 29.4 10.4 26.4 Q8.4 23.4 12 22 Q15.4 21 19.4 22.4 Z" fill={mat(id, 'ivoire')} opacity="0.42" />
    <path d="M6.4 24.4 Q11 23.4 15 24.4 M18.4 26.4 Q22.4 25.4 26 26.4" fill="none" stroke={mat(id, 'brume')} strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
  </>
));

/** Chouette silencieuse — hulotte en vol plané. */
export const IconSortBrumes4 = spellIcon('brumes', 4, 324, (id) => (
  <>
    <path d="M16 9.4 Q20.4 9.4 21.4 14.4 Q22.4 20.4 16 24.4 Q9.6 20.4 10.6 14.4 Q11.6 9.4 16 9.4 Z" fill={mat(id, 'os')} {...contour('os', 1)} />
    <path d="M11.4 8.4 L14.4 6.4 L14.2 10.4 Z M20.6 8.4 L17.6 6.4 L17.8 10.4 Z" fill={mat(id, 'os')} {...contour('os', 0.8)} />
    <path d="M13.4 12.4 a2 2 0 1 0 0.1 0 Z M18.6 12.4 a2 2 0 1 0 0.1 0 Z" fill={mat(id, 'encre')} />
    <path d="M13.6 12 a0.7 0.7 0 1 0 0.1 0 Z M18.8 12 a0.7 0.7 0 1 0 0.1 0 Z" fill="#FFE9C2" fillOpacity="0.8" />
    <path d="M16 14.4 L17.4 16.6 L16 18 L14.6 16.6 Z" fill={mat(id, 'or')} />
    <path d="M10.6 13.4 Q4.4 14.4 2.6 19.4 Q8.4 18.4 11.4 20.4 Z M21.4 13.4 Q27.6 14.4 29.4 19.4 Q23.6 18.4 20.6 20.4 Z" fill={mat(id, 'brume')} {...contour('brume', 0.95)} />
    {hatch('M13.4 20.4 L13.4 23 M16 20.6 L16 23.4 M18.6 20.4 L18.6 23', '#A2947A', 0.4, 0.8)}
  </>
));

/** Brouillard de Pamole — le sommet avalé par la nuée. */
export const IconSortBrumes5 = spellIcon('brumes', 5, 325, (id) => (
  <>
    <path d="M4.4 24.4 L12.4 8.4 L18.4 18.4 L22.4 12.4 L27.6 24.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1.05)} />
    {keyLight('M6.4 23.4 L12.4 10.4', 0.44, 1.2)}
    {coolShade('M13 10.4 L18 19.4 M22.6 14.4 L26 23.4', 0.3, 1.1)}
    <path d="M2.6 15.4 Q8.4 12.4 14.4 15.4 Q20.4 18.4 29.4 14.4" fill="none" stroke={mat(id, 'brume')} strokeWidth="3.2" strokeLinecap="round" opacity="0.88" />
    <path d="M2.6 21.4 Q9.4 18.4 16 21.4 Q22.6 24.4 29.4 20.4" fill="none" stroke={mat(id, 'brume')} strokeWidth="3.4" strokeLinecap="round" opacity="0.75" />
    <path d="M3.6 26.4 Q10.4 24.4 16 26.4 Q21.6 28.4 28.4 26" fill="none" stroke={mat(id, 'brume')} strokeWidth="2.4" strokeLinecap="round" opacity="0.55" />
  </>
));

/** Échange des ombres — deux silhouettes qui permutent. */
export const IconSortBrumes6 = spellIcon('brumes', 6, 326, (id) => (
  <>
    <path d="M9.4 8.4 Q12.4 8.4 12.4 11.4 Q12.4 13 11.4 13.8 Q13.4 15 13.4 18.4 L13.4 22.4 L5.4 22.4 L5.4 18.4 Q5.4 15 7.4 13.8 Q6.4 13 6.4 11.4 Q6.4 8.4 9.4 8.4 Z" fill={mat(id, 'encre')} fillOpacity="0.78" {...contour('encre', 0.9)} />
    <path d="M22.6 8.4 Q25.6 8.4 25.6 11.4 Q25.6 13 24.6 13.8 Q26.6 15 26.6 18.4 L26.6 22.4 L18.6 22.4 L18.6 18.4 Q18.6 15 20.6 13.8 Q19.6 13 19.6 11.4 Q19.6 8.4 22.6 8.4 Z" fill={mat(id, 'brume')} fillOpacity="0.85" {...contour('brume', 0.9)} />
    <path d="M13.4 10.4 Q16 6.4 18.6 10.4 L16.6 10.4 L16.6 12 L15.4 12 L15.4 10.4 Z" fill={mat(id, 'or')} />
    <path
      d="M12.4 24.4 Q16 28.4 19.6 24.4"
      fill="none"
      stroke={mat(id, 'or')}
      strokeWidth="1.4"
      strokeLinecap="round"
    />
    <path d="M11.4 23 L14.4 24.6 L11.4 26 Z M20.6 23 L17.6 24.6 L20.6 26 Z" fill={mat(id, 'or')} />
  </>
));

/** Nuit des Bois Noirs — croissant entre deux futaies. */
export const IconSortBrumes7 = spellIcon('brumes', 7, 327, (id) => (
  <>
    <path d="M8.4 6.4 L11.4 13.4 L9.6 13.4 L12.4 19.4 L10.6 19.4 L13.4 25.4 L3.4 25.4 L6.2 19.4 L4.4 19.4 L7.2 13.4 L5.4 13.4 Z" fill="#111E17" {...contour('sapin', 0.95)} />
    <path d="M23.6 5.4 L26.6 12.4 L24.8 12.4 L27.6 18.4 L25.8 18.4 L28.6 25.4 L18.6 25.4 L21.4 18.4 L19.6 18.4 L22.4 12.4 L20.6 12.4 Z" fill="#111E17" {...contour('sapin', 0.95)} />
    <path d="M19.4 5.4 Q14.4 7.4 14.4 11.4 Q14.4 15.4 19.4 17.4 Q13.4 18.4 11.4 13.4 Q9.4 8.4 14.4 5.4 Q16.4 4.4 19.4 5.4 Z" fill={mat(id, 'ivoire')} {...contour('ivoire', 0.9)} />
    <path d="M15.4 20.4 a0.9 0.9 0 1 0 0.1 0 Z M17.4 23.4 a0.7 0.7 0 1 0 0.1 0 Z" fill={mat(id, 'or')} opacity="0.7" className="hmm-scintille" />
    <path d="M3.6 27.4 Q10.4 25.6 16 27.4 Q21.6 29.2 28.4 27.4" fill="none" stroke={mat(id, 'brume')} strokeWidth="2" strokeLinecap="round" opacity="0.6" />
  </>
));

/** Voile du Forez — le grand manteau posé sur les crêtes. */
export const IconSortBrumes8 = spellIcon('brumes', 8, 328, (id) => (
  <>
    <path d="M3.4 26.4 L9.4 15.4 L14.4 22.4 L19.4 12.4 L28.6 26.4 Z" fill={mat(id, 'pierre')} opacity="0.8" {...contour('pierre', 0.95)} />
    <path
      d="M2.6 10.4 Q8.4 5.4 16 8.4 Q23.6 11.4 29.4 7.4 L29.4 20.4 Q23.6 24.4 16 21.4 Q8.4 18.4 2.6 22.4 Z"
      fill={mat(id, 'brume')}
      fillOpacity="0.68"
      {...contour('brume', 1.05)}
    />
    {keyLight('M4.4 11.4 Q9.4 7.4 15.4 9.4', 0.44, 1.2)}
    {hatch('M6.4 14.4 Q12.4 12.4 18.4 14.4 M6.4 18 Q12.4 16 18.4 18 M20.4 13.4 Q24.4 12.4 27.4 11.4', '#4B5E6D', 0.34, 1)}
    <path d="M16 3.4 L17.2 6.4 L20.4 6.4 L17.8 8.4 L18.8 11.4 L16 9.6 L13.2 11.4 L14.2 8.4 L11.6 6.4 L14.8 6.4 Z" fill={mat(id, 'or')} opacity="0.85" />
  </>
));

/* ───────────────────────────────  Racines  ──────────────────────────────── */

/** Écorce du fayard — plaque d'écorce en guise d'écu. */
export const IconSortRacines1 = spellIcon('racines', 1, 331, (id) => (
  <>
    <path d="M16 4.4 L24.6 7.4 V16.4 C24.6 22.4 20.4 26.4 16 28.4 C11.6 26.4 7.4 22.4 7.4 16.4 V7.4 Z" fill="#6B5433" {...contour('bois', 1.1)} />
    {keyLight('M16 6 L9.4 8.4 V16.4 C9.4 20.6 12 23.8 15 25.8', 0.4, 1.3)}
    {hatch('M12.4 8.4 Q11.4 15.4 13 22.4 M16 7.4 Q15 15.4 16 25.4 M19.6 8.4 Q20.6 15.4 19 22.4', '#3A2C1A', 0.5, 1)}
    <path d="M22.4 11.4 Q20.4 15.4 21.4 20.4" stroke="#3A2C1A" strokeOpacity="0.4" strokeWidth="0.8" fill="none" />
    <path d="M16 12.4 Q19.4 14.4 18.4 18.4 Q16 17 16 12.4 Z" fill={mat(id, 'feuille')} opacity="0.7" />
  </>
));

/** Ronce vive — sarment épineux qui se referme. */
export const IconSortRacines2 = spellIcon('racines', 2, 332, (id) => (
  <>
    <path
      d="M5.4 26.4 Q6.4 16.4 13.4 12.4 Q20.4 8.4 26.6 12.4"
      fill="none"
      stroke="#4A6138"
      strokeWidth="2.4"
      strokeLinecap="round"
    />
    <path
      d="M7.4 27.4 Q13.4 24.4 15.4 18.4 Q17.4 12.4 24.6 10.4"
      fill="none"
      stroke="#3A5A2C"
      strokeWidth="1.8"
      strokeLinecap="round"
      opacity="0.85"
    />
    <path d="M9.4 20.4 L7.4 17.4 L11 18.4 Z M13.4 15.4 L12.4 11.4 L15.6 13.6 Z M18.4 12.4 L18.4 8.4 L21 11.4 Z M22.6 14.4 L25.6 16.4 L22 17.4 Z M11.4 24.4 L9.4 27.4 L8.6 23.6 Z" fill={mat(id, 'os')} {...contour('os', 0.75)} />
    {keyLight('M8 24.4 Q9.4 18.4 13.4 14.4', 0.4, 1)}
    <path d="M20.4 18.4 Q23.4 17.4 24.4 20.4 Q21.4 21.4 20.4 18.4 Z" fill={mat(id, 'feuille')} {...contour('feuille', 0.8)} />
  </>
));

/** Futaie vigilante — trois fûts et un œil qui veille. */
export const IconSortRacines3 = spellIcon('racines', 3, 333, (id) => (
  <>
    <path d="M6.4 6.4 L9.4 6.4 L10.4 27.4 L5.4 27.4 Z" fill="#6B5433" {...contour('bois', 0.95)} />
    <path d="M14.4 4.4 L18 4.4 L19 27.4 L13.4 27.4 Z" fill="#6B5433" {...contour('bois', 1)} />
    <path d="M22.6 7.4 L25.6 7.4 L26.6 27.4 L21.6 27.4 Z" fill="#6B5433" {...contour('bois', 0.95)} />
    {hatch('M7 9.4 L7 25.4 M15.4 7.4 L15.4 25.4 M23.4 10.4 L23.4 25.4', '#3A2C1A', 0.44, 0.9)}
    {keyLight('M6.8 8.4 L7.6 26 M14.8 6.4 L15.8 26', 0.36, 1)}
    <path d="M11.4 14.4 Q16 10.4 20.6 14.4 Q16 18.4 11.4 14.4 Z" fill={mat(id, 'ivoire')} {...contour('ivoire', 0.9)} />
    <path d="M16 12.2 a2.2 2.2 0 1 0 0.1 0 Z" fill={mat(id, 'feuille')} {...contour('feuille', 0.7)} />
    <path d="M16 13.2 a1 1 0 1 0 0.1 0 Z" fill="#111E17" />
  </>
));

/** Appel de la meute — hure de loup jetée vers le ciel. */
export const IconSortRacines4 = spellIcon('racines', 4, 334, (id) => (
  <>
    <path
      d="M11.4 26.4 Q8.4 20.4 10.4 14.4 L7.4 8.4 L13.4 11.4 Q16 10.4 18.6 11.4 L24.6 8.4 L21.6 14.4 Q23.6 20.4 20.6 26.4 Z"
      fill="#4A4E52"
      {...contour('pierre', 1.05)}
    />
    {keyLight('M11.4 13.4 Q9.6 19.4 11.4 24.4', 0.4, 1.2)}
    <path d="M13 16.4 a1.6 1.6 0 1 0 0.1 0 Z M19 16.4 a1.6 1.6 0 1 0 0.1 0 Z" fill={mat(id, 'or')} />
    <path d="M13.2 16.8 a0.6 0.6 0 1 0 0.1 0 Z M19.2 16.8 a0.6 0.6 0 1 0 0.1 0 Z" fill="#111E17" />
    <path d="M14.4 20.4 L17.6 20.4 L16 22.4 Z" fill={mat(id, 'encre')} />
    <path d="M13.4 23.4 L14.4 26.4 L15.4 23.4 M16.6 23.4 L17.6 26.4 L18.6 23.4" fill="none" stroke={mat(id, 'os')} strokeWidth="0.9" />
    <path d="M3.6 6.4 Q6.4 9.4 5.4 13.4 M28.4 6.4 Q25.6 9.4 26.6 13.4" fill="none" stroke={mat(id, 'feuille')} strokeWidth="1.2" strokeOpacity="0.7" strokeLinecap="round" />
  </>
));

/** Racines profondes — chevelu qui saisit le sol. */
export const IconSortRacines5 = spellIcon('racines', 5, 335, (id) => (
  <>
    <path d="M11.4 3.4 L20.6 3.4 L19.4 11.4 L12.6 11.4 Z" fill="#6B5433" {...contour('bois', 1)} />
    {keyLight('M12.4 4.4 L13.4 10.4', 0.42, 1)}
    <path
      d="M12.6 11.4 L19.4 11.4 Q20.4 16.4 24.4 18.4 Q28.4 20.4 28.6 26.4 Q25.4 21.4 21.4 20.4 Q17.4 19.4 16.6 26.4 Q15.4 19.4 11.4 20.4 Q7.4 21.4 4.4 26.4 Q4.6 20.4 8.4 18.4 Q12.4 16.4 12.6 11.4 Z"
      fill="#5A4128"
      {...contour('bois', 1.05)}
    />
    {hatch('M14.4 13.4 Q13.4 17.4 10.4 19.4 M17.6 13.4 Q18.6 17.4 21.6 19.4 M16 12.4 L16 22.4', '#3A2C1A', 0.44, 0.9)}
    <path d="M6.4 27.4 Q9.4 24.4 12.4 26.4 M20.6 26.4 Q23.6 24.4 26.4 27.4" fill="none" stroke="#3A2C1A" strokeOpacity="0.5" strokeWidth="1" strokeLinecap="round" />
    <path d="M8.4 8.4 Q11.4 6.4 12.4 9.4 Q9.4 11.4 8.4 8.4 Z M23.6 8.4 Q20.6 6.4 19.6 9.4 Q22.6 11.4 23.6 8.4 Z" fill={mat(id, 'feuille')} {...contour('feuille', 0.8)} />
  </>
));

/** Pierre levée — menhir dressé d'un coup. */
export const IconSortRacines6 = spellIcon('racines', 6, 336, (id) => (
  <>
    <path d="M4.4 26.4 Q16 22.4 27.6 26.4 Q16 29.6 4.4 26.4 Z" fill="#3A2C1A" opacity="0.5" />
    <path
      d="M12.4 3.4 Q16 1.6 19.6 3.4 L22.4 24.4 Q16 26.4 9.6 24.4 Z"
      fill={mat(id, 'pierre')}
      {...contour('pierre', 1.1)}
    />
    {keyLight('M13.4 4.4 L11.4 23.4', 0.46, 1.3)}
    {coolShade('M19.6 5.4 L21.4 23.4', 0.3, 1.2)}
    {hatch('M15.4 6.4 L15.8 22.4 M18 8.4 L18.6 21.4', '#25272A', 0.32, 0.8)}
    <path d="M6.4 21.4 Q8.4 18.4 11 20.4 Q9.4 23.4 6.4 21.4 Z M25.6 20.4 Q23.6 17.4 21.4 19.4 Q22.6 22.4 25.6 20.4 Z" fill={mat(id, 'feuille')} {...contour('feuille', 0.8)} />
    <path d="M16 8.4 L17.4 11.4 L16 14.4 L14.6 11.4 Z" fill={mat(id, 'or')} opacity="0.6" />
  </>
));

/** Cercle des bornes — les limites du comté se referment. */
export const IconSortRacines7 = spellIcon('racines', 7, 337, (id) => (
  <>
    <path
      d="M16 10.4 C21.6 10.4 26 13.2 26 16.8 C26 20.4 21.6 23.2 16 23.2 C10.4 23.2 6 20.4 6 16.8 C6 13.2 10.4 10.4 16 10.4 Z"
      fill="none"
      stroke={mat(id, 'or')}
      strokeWidth="1.2"
      strokeDasharray="3 2"
      opacity="0.85"
    />
    <path d="M14.6 4.4 Q16 3.2 17.4 4.4 L18.2 11.4 Q16 12.4 13.8 11.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.95)} />
    <path d="M4.6 15.4 Q6 14.2 7.4 15.4 L8 21.4 Q6 22.4 4 21.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.9)} />
    <path d="M24.6 15.4 Q26 14.2 27.4 15.4 L28 21.4 Q26 22.4 24 21.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.9)} />
    <path d="M14.6 21.4 Q16 20.2 17.4 21.4 L18.2 27.4 Q16 28.4 13.8 27.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.95)} />
    {keyLight('M15.2 5.4 L14.6 10.6 M5.2 16.4 L4.8 20.6', 0.42, 1)}
    <path d="M16 15.4 L17.4 18 L16 20.4 L14.6 18 Z" fill={mat(id, 'feuille')} opacity="0.85" />
  </>
));

/** Mémoire de la forêt — spirale de cernes dans une feuille. */
export const IconSortRacines8 = spellIcon('racines', 8, 338, (id) => (
  <>
    <path
      d="M6.4 25.4 Q6.4 10.4 16 5.4 Q25.6 10.4 25.6 25.4 Q16 29.4 6.4 25.4 Z"
      fill="#4A6138"
      {...contour('feuille', 1.1)}
    />
    {keyLight('M8.4 23.4 Q8.4 12.4 15.4 7.4', 0.42, 1.3)}
    <path d="M16 6.4 L16 28" stroke="#26351F" strokeOpacity="0.55" strokeWidth="1" />
    {hatch('M16 11.4 L10.4 14.4 M16 11.4 L21.6 14.4 M16 16.4 L9.4 19.4 M16 16.4 L22.6 19.4 M16 21.4 L10.4 23.6 M16 21.4 L21.6 23.6', '#26351F', 0.42, 0.85)}
    <path
      d="M16 13.4 Q19.4 13.4 19.4 16.8 Q19.4 20 16 20 Q13.2 20 13.2 17.6 Q13.2 15.6 15.4 15.6 Q17 15.6 17 17"
      fill="none"
      stroke={mat(id, 'or')}
      strokeWidth="1.3"
      strokeLinecap="round"
    />
  </>
));

/** Registre des trente-deux sorts, clef `sort_<ecole>_<degre>`. */
export const SPELL_ICONS: Readonly<Record<string, IconComponent>> = {
  braises_1: IconSortBraises1,
  braises_2: IconSortBraises2,
  braises_3: IconSortBraises3,
  braises_4: IconSortBraises4,
  braises_5: IconSortBraises5,
  braises_6: IconSortBraises6,
  braises_7: IconSortBraises7,
  braises_8: IconSortBraises8,
  sources_1: IconSortSources1,
  sources_2: IconSortSources2,
  sources_3: IconSortSources3,
  sources_4: IconSortSources4,
  sources_5: IconSortSources5,
  sources_6: IconSortSources6,
  sources_7: IconSortSources7,
  sources_8: IconSortSources8,
  brumes_1: IconSortBrumes1,
  brumes_2: IconSortBrumes2,
  brumes_3: IconSortBrumes3,
  brumes_4: IconSortBrumes4,
  brumes_5: IconSortBrumes5,
  brumes_6: IconSortBrumes6,
  brumes_7: IconSortBrumes7,
  brumes_8: IconSortBrumes8,
  racines_1: IconSortRacines1,
  racines_2: IconSortRacines2,
  racines_3: IconSortRacines3,
  racines_4: IconSortRacines4,
  racines_5: IconSortRacines5,
  racines_6: IconSortRacines6,
  racines_7: IconSortRacines7,
  racines_8: IconSortRacines8,
};

/** Noms français des sorts, repris du contenu, pour les info-bulles. */
export const SPELL_LABELS: Readonly<Record<string, string>> = {
  braises_1: 'Étincelle des Farges',
  braises_2: 'Acier tempéré',
  braises_3: 'Cendre aux yeux',
  braises_4: 'Trait incandescent',
  braises_5: 'Mur de braises',
  braises_6: 'Marteau rouge',
  braises_7: 'Fournaise du rempart',
  braises_8: 'Couronne de feu ancien',
  sources_1: 'Rosée vive',
  sources_2: 'Gué clair',
  sources_3: 'Eau réparatrice',
  sources_4: 'Voile de pluie',
  sources_5: 'Source miraculeuse',
  sources_6: 'Courant de la Durolle',
  sources_7: 'Lit de la Vierge',
  sources_8: "Fontaine de l'Alliance",
  brumes_1: 'Brume basse',
  brumes_2: 'Pas effacé',
  brumes_3: 'Reflet du Lac',
  brumes_4: 'Chouette silencieuse',
  brumes_5: 'Brouillard de Pamole',
  brumes_6: 'Échange des ombres',
  brumes_7: 'Nuit des Bois Noirs',
  brumes_8: 'Voile du Forez',
  racines_1: 'Écorce du fayard',
  racines_2: 'Ronce vive',
  racines_3: 'Futaie vigilante',
  racines_4: 'Appel de la meute',
  racines_5: 'Racines profondes',
  racines_6: 'Pierre levée',
  racines_7: 'Cercle des bornes',
  racines_8: 'Mémoire de la forêt',
};
