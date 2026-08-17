/**
 * Icônes générales de l'interface — grille 32 × 32, dessinées à la main.
 *
 * Chacune porte au moins trois strates : matière en dégradé, modelé
 * (haute lumière chaude au nord-ouest, ombre froide au sud-est) et texture
 * (hachures, rivets, grain). Aucun contour noir, aucun emoji.
 */

import { contour, coolShade, hatch, keyLight, makeIcon, mat, matR } from './kit.js';

/* ─────────────────────────────── Armement ───────────────────────────────── */

/** Épée de guerre, lame vers le haut, fusée de cuir et pommeau facetté. */
export const IconEpee = makeIcon({
  mats: ['acier', 'or', 'cuir'],
  seed: 3,
  draw: (id) => (
    <>
      <path
        d="M16 2.2 L19.1 8.4 L18.7 19.4 L16 21.6 L13.3 19.4 L12.9 8.4 Z"
        fill={mat(id, 'acier')}
        {...contour('acier', 1)}
      />
      {keyLight('M15.1 4.6 L14.1 9.2 L14.3 18.4', 0.5, 1)}
      {coolShade('M17.6 6.4 L18.1 12 L17.8 18.6', 0.3, 1)}
      <path
        d="M7.4 21.2 Q16 19.4 24.6 21.2 L24 24 Q16 22.4 8 24 Z"
        fill={mat(id, 'or')}
        {...contour('or', 0.9)}
      />
      {hatch('M10.4 21.9 L10.1 23.3 M13.4 21.5 L13.2 23 M18.7 21.5 L18.9 23 M21.7 21.9 L22 23.3', '#7A6116', 0.42, 0.8)}
      <path d="M14.4 24 L17.6 24 L17.1 28.1 L14.9 28.1 Z" fill={mat(id, 'cuir')} {...contour('cuir', 0.85)} />
      {hatch('M14.6 25.2 L17.4 25 M14.7 26.4 L17.3 26.2', '#8E6C43', 0.4, 0.7)}
      <path d="M16 28 L19 29.6 L16 31 L13 29.6 Z" fill={mat(id, 'or')} {...contour('or', 0.9)} />
    </>
  ),
});

/** Bouclier écu, umbo martelé et chevron de bannière. */
export const IconBouclier = makeIcon({
  mats: ['acier', 'grenat', 'or'],
  seed: 5,
  draw: (id) => (
    <>
      <path
        d="M16 2.4 L27.2 6.1 V15.2 C27.2 22.8 21.8 27.6 16 30 C10.2 27.6 4.8 22.8 4.8 15.2 V6.1 Z"
        fill={mat(id, 'acier')}
        {...contour('acier', 1.1)}
      />
      <path
        d="M16 4.4 L25.2 7.5 V15.2 C25.2 21.4 20.8 25.6 16 27.7 Z"
        fill={mat(id, 'grenat')}
        opacity="0.9"
      />
      {keyLight('M16 4.6 L7 7.6 V15 C7 20.6 10.8 24.6 15 26.8', 0.36, 1.2)}
      <path d="M16 9.2 L21.4 12 L16 14.6 L10.6 12 Z" fill={mat(id, 'or')} {...contour('or', 0.85)} />
      <path d="M16 15.6 L20.2 18 L16 20.4 L11.8 18 Z" fill={mat(id, 'or')} opacity="0.72" />
      {hatch('M9.4 9.6 L9.4 18.4 M22.6 9.6 L22.6 18.4', '#3F474F', 0.3, 0.8)}
      {coolShade('M25 8.4 V15.2 C25 21 21 25 16.4 27.4', 0.28, 1.1)}
    </>
  ),
});

/** Aile déployée, cinq rémiges et duvet — vol des créatures. */
export const IconAile = makeIcon({
  mats: ['ivoire', 'brume', 'or'],
  seed: 9,
  draw: (id) => (
    <>
      <path
        d="M3.6 8.4 Q11 5.2 18.4 8.2 Q25.4 11 28.6 18.4 Q22.6 17 18.6 19.4 Q14.4 15.6 9.6 14.6 Q6.2 11.6 3.6 8.4 Z"
        fill={mat(id, 'ivoire')}
        {...contour('ivoire', 1)}
      />
      <path
        d="M9.6 14.6 Q15 16 18.6 19.4 Q19.6 24 17.4 28.2 Q13.4 22.6 8.6 20.4 Q8.4 17.4 9.6 14.6 Z"
        fill={mat(id, 'brume')}
        {...contour('brume', 1)}
      />
      {hatch('M7 9.6 Q12 11.4 15.6 15.2 M11 8.2 Q16 10.4 20 15 M15.6 8.8 Q20.4 11.6 23.6 16.2', '#4B5E6D', 0.34, 0.85)}
      {hatch('M11 17.4 Q14 20.4 15.6 24.6 M13.6 18.6 Q16.2 21.8 17.2 26', '#4B5E6D', 0.3, 0.8)}
      {keyLight('M4.6 9 Q11.2 6.6 17.4 9.4', 0.46, 1.1)}
      <path d="M27.4 17.4 L30 18.8 L27.2 19.8 Z" fill={mat(id, 'or')} opacity="0.8" />
    </>
  ),
});

/** Arc de chasse, corde tendue et flèche encochée. */
export const IconArc = makeIcon({
  mats: ['bois', 'or', 'acier', 'ivoire'],
  seed: 11,
  draw: (id) => (
    <>
      <path
        d="M23.6 3 Q28.6 10.4 28 17.4 Q27.4 24.4 22.4 29.4"
        fill="none"
        stroke={mat(id, 'bois')}
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M23.6 3 Q28.6 10.4 28 17.4 Q27.4 24.4 22.4 29.4"
        fill="none"
        stroke="#3A2C1A"
        strokeOpacity="0.5"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
      {keyLight('M23.9 4.4 Q27.4 10.6 27 16.4', 0.4, 0.9)}
      <path d="M23.6 3 L22.4 29.4" fill="none" stroke="#EDE3CE" strokeOpacity="0.85" strokeWidth="0.9" />
      <path d="M3.2 16.2 L21.4 16.2" fill="none" stroke={mat(id, 'bois')} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M21.4 13.6 L26.2 16.2 L21.4 18.8 Z" fill={mat(id, 'acier')} {...contour('acier', 0.8)} />
      <path
        d="M3.2 16.2 L7 13.4 L6.4 16.2 L7 19 Z"
        fill={mat(id, 'ivoire')}
        {...contour('ivoire', 0.8)}
      />
      <path d="M22.6 2 L24.8 3.6 M21.4 30.4 L23.6 28.8" stroke={mat(id, 'or')} strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
});

/** Flèche isolée — tir, projectile, direction de trajectoire. */
export const IconFleche = makeIcon({
  mats: ['acier', 'bois', 'ivoire'],
  seed: 13,
  draw: (id) => (
    <>
      <path d="M4 28 L22 10" stroke={mat(id, 'bois')} strokeWidth="2.2" strokeLinecap="round" />
      {keyLight('M5 27.2 L21 11.4', 0.34, 0.8)}
      <path
        d="M29.4 2.6 L23.2 16.2 L21.4 12.4 L17.4 10.8 Z"
        fill={mat(id, 'acier')}
        {...contour('acier', 1)}
      />
      {keyLight('M28 4.4 L22.4 13.2', 0.44, 1)}
      <path
        d="M3.2 27.4 L7.6 26.2 L5.6 28.4 L6.6 30.4 Z"
        fill={mat(id, 'ivoire')}
        {...contour('ivoire', 0.8)}
      />
      <path
        d="M6 24.6 L9.8 23.4 L8.4 26 Z"
        fill={mat(id, 'ivoire')}
        opacity="0.82"
        {...contour('ivoire', 0.7)}
      />
    </>
  ),
});

/** Deux épées croisées — combat en cours. */
export const IconCombat = makeIcon({
  mats: ['acier', 'cuir', 'or'],
  seed: 15,
  draw: (id) => (
    <>
      <path d="M5.4 4.2 L8.4 4 L24.6 24.2 L21.8 27.6 Z" fill={mat(id, 'acier')} {...contour('acier', 0.95)} />
      <path d="M26.6 4.2 L23.6 4 L7.4 24.2 L10.2 27.6 Z" fill={mat(id, 'acier')} {...contour('acier', 0.95)} />
      {keyLight('M6.4 5.2 L20.6 23.4', 0.36, 0.9)}
      {coolShade('M25.4 5.4 L11 23.6', 0.3, 0.9)}
      <path d="M20 22.2 L27.6 21.4 L26.6 25.4 L22.6 25.8 Z" fill={mat(id, 'cuir')} {...contour('cuir', 0.85)} />
      <path d="M12 22.2 L4.4 21.4 L5.4 25.4 L9.4 25.8 Z" fill={mat(id, 'cuir')} {...contour('cuir', 0.85)} />
      <path d="M14.6 12.4 L17.4 12.4 L17.4 15.2 L14.6 15.2 Z" fill={mat(id, 'or')} opacity="0.9" transform="rotate(45 16 13.8)" />
    </>
  ),
});

/* ────────────────────────── Caractéristiques ────────────────────────────── */

/** Cœur — points de vie. Forme anatomique stylisée, jamais un cœur d'emoji. */
export const IconCoeur = makeIcon({
  mats: ['sang', 'grenat'],
  seed: 17,
  draw: (id) => (
    <>
      <path
        d="M16 28.4 C9.6 23.6 4.2 19.6 4.2 13.4 C4.2 8.6 7.8 5.4 11.6 5.4 C13.9 5.4 15.2 6.8 16 8.4 C16.8 6.8 18.1 5.4 20.4 5.4 C24.2 5.4 27.8 8.6 27.8 13.4 C27.8 19.6 22.4 23.6 16 28.4 Z"
        fill={mat(id, 'sang')}
        {...contour('sang', 1.1)}
      />
      {keyLight('M8.4 9.6 Q6.4 12.4 7 15.8 Q7.8 19.2 11 21.8', 0.34, 1.4)}
      {coolShade('M24 10.4 Q26 13.4 25 17 Q23.8 20.4 20 23.6', 0.32, 1.4)}
      <path
        d="M16 9.4 C16 13 14 14.4 14 17.4 C14 19.6 15 21 16 22.6"
        fill="none"
        stroke="#48111A"
        strokeOpacity="0.42"
        strokeWidth="0.9"
      />
      {hatch('M10.4 12 Q12.4 14.4 13.2 17.6 M20.6 12.6 Q19 15 18.4 18', '#48111A', 0.26, 0.75)}
    </>
  ),
});

/** Éperon de montagne — vitesse et points de marche. */
export const IconVitesse = makeIcon({
  mats: ['fer', 'cuir', 'or'],
  seed: 19,
  draw: (id) => (
    <>
      <path
        d="M6.4 7.2 Q4.6 16 6.6 24.8 L10.4 23.4 Q9 16 10.2 8.6 Z"
        fill={mat(id, 'cuir')}
        {...contour('cuir', 0.95)}
      />
      {hatch('M7.4 10.4 L9.4 10 M7 14.6 L9.2 14.4 M7.1 19 L9.4 18.8', '#8E6C43', 0.4, 0.7)}
      <path
        d="M10.2 12.4 L20.6 14.2 L20.6 17.8 L10.2 19.6 Z"
        fill={mat(id, 'fer')}
        {...contour('fer', 0.95)}
      />
      {keyLight('M11 13.6 L19.6 15.2', 0.4, 0.9)}
      <path
        d="M20.4 16 L26.4 12.6 L25.2 16 L26.4 19.4 Z"
        fill={mat(id, 'or')}
        {...contour('or', 0.9)}
      />
      <path d="M22.8 16 L28.4 15 M22.8 16 L28.4 17" stroke="#C9A227" strokeOpacity="0.55" strokeWidth="0.9" strokeLinecap="round" />
    </>
  ),
});

/** Moral — élan de la troupe : trois chevrons montant sous une bannerette. */
export const IconMoral = makeIcon({
  mats: ['or', 'grenat', 'bois'],
  seed: 21,
  draw: (id) => (
    <>
      <path d="M6.6 24.4 L16 15.6 L25.4 24.4 L21.6 24.4 L16 19.4 L10.4 24.4 Z" fill={mat(id, 'or')} {...contour('or', 0.95)} />
      <path d="M8.6 29.6 L16 22.6 L23.4 29.6 L20.2 29.6 L16 25.8 L11.8 29.6 Z" fill={mat(id, 'or')} opacity="0.7" />
      <path d="M15.2 2.4 L16.8 2.4 L16.8 15 L15.2 15 Z" fill={mat(id, 'bois')} {...contour('bois', 0.7)} />
      <path
        d="M16.8 3 L26 5.2 L23.4 8.2 L26 11.2 L16.8 13.4 Z"
        fill={mat(id, 'grenat')}
        {...contour('grenat', 0.95)}
      />
      {keyLight('M17.6 4.2 L24.2 5.8', 0.34, 0.9)}
      {hatch('M19 5 L19 12 M21.4 5.6 L21.4 11.4', '#3A0E15', 0.3, 0.7)}
    </>
  ),
});

/** Fortune — roue à six rais et étoile héraldique. */
export const IconFortune = makeIcon({
  mats: ['or', 'bois'],
  radial: ['or'],
  seed: 23,
  draw: (id) => (
    <>
      <path
        d="M16 2.6 C23.4 2.6 29.4 8.6 29.4 16 C29.4 23.4 23.4 29.4 16 29.4 C8.6 29.4 2.6 23.4 2.6 16 C2.6 8.6 8.6 2.6 16 2.6 Z M16 6.2 C10.6 6.2 6.2 10.6 6.2 16 C6.2 21.4 10.6 25.8 16 25.8 C21.4 25.8 25.8 21.4 25.8 16 C25.8 10.6 21.4 6.2 16 6.2 Z"
        fill={mat(id, 'bois')}
        {...contour('bois', 0.9)}
      />
      {keyLight('M7.4 8.6 A12 12 0 0 1 16 4.2', 0.42, 1.3)}
      <path
        d="M15.2 6.4 h1.6 v19.2 h-1.6 Z M6.6 15.2 h18.8 v1.6 h-18.8 Z"
        fill={mat(id, 'or')}
        opacity="0.85"
        transform="rotate(0 16 16)"
      />
      <path
        d="M15.2 6.4 h1.6 v19.2 h-1.6 Z M6.6 15.2 h18.8 v1.6 h-18.8 Z"
        fill={mat(id, 'or')}
        opacity="0.7"
        transform="rotate(45 16 16)"
      />
      <path
        d="M16 10.4 L17.7 14.2 L21.6 14.2 L18.4 16.6 L19.7 20.4 L16 18 L12.3 20.4 L13.6 16.6 L10.4 14.2 L14.3 14.2 Z"
        fill={matR(id, 'or')}
        {...contour('or', 0.85)}
      />
    </>
  ),
});

/** Œil — vision et reconnaissance. Iris en dégradé radial, cils dessinés. */
export const IconOeil = makeIcon({
  mats: ['ivoire', 'or', 'encre'],
  radial: ['eau'],
  seed: 25,
  draw: (id) => (
    <>
      <path
        d="M2.6 16.2 Q9 7.4 16 7.4 Q23 7.4 29.4 16.2 Q23 25 16 25 Q9 25 2.6 16.2 Z"
        fill={mat(id, 'ivoire')}
        {...contour('ivoire', 1)}
      />
      {coolShade('M4.6 15.4 Q10 9.6 16 9.4', 0.28, 1.1)}
      <path
        d="M16 9.6 C19.6 9.6 22.6 12.5 22.6 16.2 C22.6 19.9 19.6 22.8 16 22.8 C12.4 22.8 9.4 19.9 9.4 16.2 C9.4 12.5 12.4 9.6 16 9.6 Z"
        fill={matR(id, 'eau')}
        {...contour('eau', 0.9)}
      />
      <path
        d="M16 12.6 C18 12.6 19.6 14.2 19.6 16.2 C19.6 18.2 18 19.8 16 19.8 C14 19.8 12.4 18.2 12.4 16.2 C12.4 14.2 14 12.6 16 12.6 Z"
        fill={mat(id, 'encre')}
      />
      <path d="M13.6 13.6 a1.5 1.5 0 1 0 0.1 0 Z" fill="#FFE9C2" fillOpacity="0.85" />
      {hatch('M16 9.8 L16 12.4 M20.6 11.6 L19 13.4 M11.4 11.6 L13 13.4', '#22463E', 0.35, 0.7)}
      <path
        d="M2.6 16.2 Q9 7.4 16 7.4 Q23 7.4 29.4 16.2"
        fill="none"
        stroke={mat(id, 'or')}
        strokeWidth="1.1"
        strokeLinecap="round"
      />
      {hatch('M6.4 10.4 L4.8 8.4 M11.4 8 L10.6 5.6 M20.6 8 L21.4 5.6 M25.6 10.4 L27.2 8.4', '#7A6116', 0.5, 1)}
    </>
  ),
});

/* ──────────────────────────── Objets et lieux ───────────────────────────── */

/** Clef ancienne — panneton à trois dents, anneau ajouré. */
export const IconCle = makeIcon({
  mats: ['or', 'fer'],
  seed: 27,
  draw: (id) => (
    <>
      <path
        d="M9.4 3.4 C13.6 3.4 17 6.8 17 11 C17 14.4 14.8 17.3 11.7 18.3 L11.7 20.6 L14.6 20.6 L14.6 23.4 L11.7 23.4 L11.7 26 L15.4 26 L15.4 29 L8.2 29 L8.2 18.3 C5.1 17.3 2.9 14.4 2.9 11 C2.9 6.8 6.3 3.4 9.4 3.4 Z M9.9 7.2 C7.8 7.2 6.1 8.9 6.1 11 C6.1 13.1 7.8 14.8 9.9 14.8 C12 14.8 13.7 13.1 13.7 11 C13.7 8.9 12 7.2 9.9 7.2 Z"
        fill={mat(id, 'or')}
        {...contour('or', 1)}
        transform="rotate(-38 16 16)"
      />
      {keyLight('M6.4 7.6 A6 6 0 0 1 12.4 4.6', 0.4, 1.1)}
      {hatch('M20.4 20.4 L23.4 23.4 M18 22.6 L21 25.6', '#7A6116', 0.34, 0.8)}
    </>
  ),
});

/** Bannière de gonfanon, hampe de frêne et pointe de fer. */
export const IconBanniere = makeIcon({
  mats: ['grenat', 'bois', 'or', 'fer'],
  seed: 29,
  draw: (id) => (
    <>
      <path d="M7.4 3.2 L9 2.4 L9.9 29.4 L8.3 30 Z" fill={mat(id, 'bois')} {...contour('bois', 0.8)} />
      <path d="M7.2 3.4 L9.2 1.2 L11 3.6 Z" fill={mat(id, 'fer')} {...contour('fer', 0.8)} />
      <path
        d="M9.2 4 L27.4 6.4 L24.2 12.6 L27.4 18.8 L9.6 21.6 Z"
        fill={mat(id, 'grenat')}
        {...contour('grenat', 1.05)}
      />
      {keyLight('M10.4 5.4 L25 7.4', 0.36, 1.1)}
      {coolShade('M10.6 20 L25.4 17.6', 0.3, 1.1)}
      <path d="M16.4 9 L19.6 12.4 L16.4 15.8 L13.2 12.4 Z" fill={mat(id, 'or')} {...contour('or', 0.85)} />
      {hatch('M12.6 5.8 L12.9 20.9 M21.4 7 L21.8 19.2', '#3A0E15', 0.28, 0.75)}
    </>
  ),
});

/** Cloche de chapelle, joug de chêne et battant. */
export const IconCloche = makeIcon({
  mats: ['cuivre', 'bois', 'or'],
  seed: 31,
  draw: (id) => (
    <>
      <path d="M12.4 3.6 L19.6 3.6 L19.6 6 L12.4 6 Z" fill={mat(id, 'bois')} {...contour('bois', 0.8)} />
      <path
        d="M14.6 6 L17.4 6 Q17.4 9 19.8 11.6 Q23.8 16 24.4 23.4 L7.6 23.4 Q8.2 16 12.2 11.6 Q14.6 9 14.6 6 Z"
        fill={mat(id, 'cuivre')}
        {...contour('cuivre', 1.05)}
      />
      {keyLight('M14.2 8.4 Q11.4 13 10.4 21.6', 0.42, 1.3)}
      {coolShade('M18.6 9.4 Q21.8 13.6 22.4 21.8', 0.32, 1.3)}
      <path d="M6.4 23.4 L25.6 23.4 L25.6 26 L6.4 26 Z" fill={mat(id, 'cuivre')} {...contour('cuivre', 0.9)} />
      {hatch('M9.4 24 L9.4 25.4 M13 24 L13 25.4 M19 24 L19 25.4 M22.6 24 L22.6 25.4', '#4C2E18', 0.36, 0.8)}
      <path d="M15.2 26 L16.8 26 L16.8 28.4 L15.2 28.4 Z" fill={mat(id, 'or')} />
      <path d="M16 28 L18.2 29.6 L16 31.2 L13.8 29.6 Z" fill={mat(id, 'or')} {...contour('or', 0.8)} />
    </>
  ),
});

/** Marteau de forge, tête d'acier et manche de frêne cerclé. */
export const IconMarteau = makeIcon({
  mats: ['fer', 'bois', 'or'],
  seed: 33,
  draw: (id) => (
    <>
      <path d="M14.4 11.6 L18 11.6 L17 30 L15.4 30 Z" fill={mat(id, 'bois')} {...contour('bois', 0.85)} />
      {hatch('M15.4 15 L17.2 15 M15.4 19.4 L17.1 19.4 M15.4 24 L17 24', '#8E6C43', 0.34, 0.7)}
      <path
        d="M5.4 5.4 L26.6 4 L27.6 11.4 L5.8 12.8 Z"
        fill={mat(id, 'fer')}
        {...contour('fer', 1.05)}
      />
      {keyLight('M6.6 6.4 L25.4 5.2', 0.42, 1.2)}
      {coolShade('M6.4 11.6 L26.6 10.2', 0.32, 1.1)}
      <path d="M5.4 5.4 L2.6 6.6 L3 11.6 L5.8 12.8 Z" fill={mat(id, 'fer')} opacity="0.86" {...contour('fer', 0.85)} />
      <path d="M13.2 10.4 L19.4 10 L19.6 13.4 L13.4 13.8 Z" fill={mat(id, 'or')} opacity="0.85" {...contour('or', 0.8)} />
    </>
  ),
});

/** Parchemin roulé, cachet de cire et lacet. */
export const IconParchemin = makeIcon({
  mats: ['parchemin', 'grenat', 'bois'],
  seed: 35,
  draw: (id) => (
    <>
      <path
        d="M6.4 5.6 Q6.4 3 9 3 L24 3 Q26.6 3 26.6 5.6 L26.6 26.4 Q26.6 29 24 29 L9 29 Q6.4 29 6.4 26.4 Z"
        fill={mat(id, 'parchemin')}
        {...contour('parchemin', 1.05)}
      />
      {keyLight('M8.4 5 Q8.2 15 8.4 27', 0.44, 1.2)}
      {coolShade('M24.6 5.4 Q24.8 15.4 24.6 27', 0.24, 1.2)}
      {hatch('M10.4 8.4 L22 8.4 M10.4 11.6 L22.6 11.6 M10.4 14.8 L20.4 14.8 M10.4 18 L22.4 18', '#B6A682', 0.65, 0.9)}
      <path d="M4.6 3.4 Q9 2 9 5.6 Q9 8.4 4.6 7.4 Q3 5.4 4.6 3.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.85)} />
      <path d="M23 26.6 a2.9 2.9 0 1 0 0.1 0 Z" fill={mat(id, 'grenat')} {...contour('grenat', 0.85)} />
      {hatch('M21.8 27.4 L24.4 29 M24.4 27.4 L21.8 29', '#3A0E15', 0.5, 0.8)}
    </>
  ),
});

/** Engrenage forgé, dents inégales et moyeu à rivets — réglages. */
export const IconEngrenage = makeIcon({
  mats: ['fer', 'or'],
  seed: 37,
  draw: (id) => (
    <>
      <path
        d="M14.1 2.4 L17.9 2.4 L18.6 6 L21.6 7.3 L24.6 5.3 L27.3 8 L25.3 11 L26.6 14 L30.2 14.7 L30.2 18.5 L26.6 19.2 L25.3 22.2 L27.3 25.2 L24.6 27.9 L21.6 25.9 L18.6 27.2 L17.9 30.8 L14.1 30.8 L13.4 27.2 L10.4 25.9 L7.4 27.9 L4.7 25.2 L6.7 22.2 L5.4 19.2 L1.8 18.5 L1.8 14.7 L5.4 14 L6.7 11 L4.7 8 L7.4 5.3 L10.4 7.3 L13.4 6 Z"
        fill={mat(id, 'fer')}
        {...contour('fer', 1)}
        transform="translate(0 -0.6) scale(0.98) translate(0.32 0.32)"
      />
      {keyLight('M8 7.4 A11 11 0 0 1 15.6 3.6', 0.4, 1.3)}
      {coolShade('M24.6 25 A11 11 0 0 1 17 28.6', 0.3, 1.3)}
      <path
        d="M16 10.6 C19 10.6 21.4 13 21.4 16 C21.4 19 19 21.4 16 21.4 C13 21.4 10.6 19 10.6 16 C10.6 13 13 10.6 16 10.6 Z"
        fill={mat(id, 'or')}
        {...contour('or', 0.9)}
      />
      <path
        d="M16 13.4 C17.4 13.4 18.6 14.6 18.6 16 C18.6 17.4 17.4 18.6 16 18.6 C14.6 18.6 13.4 17.4 13.4 16 C13.4 14.6 14.6 13.4 16 13.4 Z"
        fill="#31363B"
        fillOpacity="0.75"
      />
    </>
  ),
});

/** Pavillon sonore et trois ondes — volume et son. */
export const IconSon = makeIcon({
  mats: ['cuivre', 'or'],
  seed: 39,
  draw: (id) => (
    <>
      <path
        d="M4 12.4 L9.4 12.4 L16.4 6.4 L16.4 25.6 L9.4 19.6 L4 19.6 Z"
        fill={mat(id, 'cuivre')}
        {...contour('cuivre', 1.05)}
      />
      {keyLight('M5.2 13.4 L9.4 13.4 L15.4 8.4', 0.42, 1.1)}
      {coolShade('M5.2 18.6 L9.6 18.6 L15.4 23.6', 0.3, 1.1)}
      <path
        d="M19.6 11.4 Q22.4 16 19.6 20.6"
        fill="none"
        stroke={mat(id, 'or')}
        strokeWidth="1.9"
        strokeLinecap="round"
      />
      <path
        d="M23 8.4 Q27.4 16 23 23.6"
        fill="none"
        stroke={mat(id, 'or')}
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.8"
      />
      <path
        d="M26.4 5.6 Q32 16 26.4 26.4"
        fill="none"
        stroke={mat(id, 'or')}
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.55"
      />
    </>
  ),
});

/** Croix de chemin sur son socle de granit — oratoires du Forez. */
export const IconCroix = makeIcon({
  mats: ['pierre', 'or', 'feuille'],
  seed: 41,
  draw: (id) => (
    <>
      <path d="M9.4 26.4 L22.6 26.4 L24.4 30.4 L7.6 30.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1)} />
      {hatch('M11.4 27.4 L10.8 29.6 M15.4 27.4 L15.2 29.6 M19.6 27.4 L19.8 29.6', '#25272A', 0.34, 0.8)}
      <path
        d="M14.2 2.4 L17.8 2.4 L17.8 9.4 L24.6 9.4 L24.6 13 L17.8 13 L17.8 26.4 L14.2 26.4 L14.2 13 L7.4 13 L7.4 9.4 L14.2 9.4 Z"
        fill={mat(id, 'pierre')}
        {...contour('pierre', 1.05)}
      />
      {keyLight('M15 3.6 L15 25.4 M8.6 10.4 L14 10.4', 0.4, 1)}
      <path d="M16 8.2 a2.4 2.4 0 1 0 0.1 0 Z" fill={mat(id, 'or')} opacity="0.7" />
      <path
        d="M8 26.4 Q6 23.4 8.6 21.4 Q10.4 23.6 9.6 26.4 Z"
        fill={mat(id, 'feuille')}
        {...contour('feuille', 0.8)}
      />
    </>
  ),
});

/** Sablier de tour, montants de chêne et sable ambré. */
export const IconSablier = makeIcon({
  mats: ['bois', 'or', 'ivoire'],
  seed: 43,
  draw: (id) => (
    <>
      <path d="M6.4 2.6 L25.6 2.6 L25.6 5.6 L6.4 5.6 Z" fill={mat(id, 'bois')} {...contour('bois', 0.9)} />
      <path d="M6.4 26.4 L25.6 26.4 L25.6 29.4 L6.4 29.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.9)} />
      <path d="M8.6 5.6 L10.2 5.6 L10.2 26.4 L8.6 26.4 Z M21.8 5.6 L23.4 5.6 L23.4 26.4 L21.8 26.4 Z" fill={mat(id, 'bois')} opacity="0.9" />
      <path
        d="M11 6.4 L21 6.4 L16.6 15.6 L21 25.6 L11 25.6 L15.4 15.6 Z"
        fill={mat(id, 'ivoire')}
        fillOpacity="0.5"
        {...contour('ivoire', 0.95)}
      />
      <path d="M11.6 7.2 L20.4 7.2 L16.5 15 Z" fill={mat(id, 'or')} opacity="0.9" />
      <path d="M12.6 24.8 L19.4 24.8 L16 19.6 Z" fill={mat(id, 'or')} />
      <path d="M15.8 15.6 L16.2 15.6 L16.2 22 L15.8 22 Z" fill="#C9A227" fillOpacity="0.8" />
      {keyLight('M12.2 7.4 L15.6 14.6', 0.4, 0.9)}
    </>
  ),
});

/* ──────────────────────────── Navigation ────────────────────────────────── */

/** Chevron d'orientation, taillé en biseau. */
export const IconChevron = makeIcon({
  mats: ['or'],
  seed: 45,
  draw: (id) => (
    <>
      <path
        d="M11.4 3.6 L14.4 3 L25.4 16 L14.4 29 L11.4 28.4 L21.4 16 Z"
        fill={mat(id, 'or')}
        {...contour('or', 1)}
      />
      {keyLight('M12.6 5 L22.4 16', 0.42, 1)}
      <path d="M6.6 8.6 L8.6 8.2 L15 16 L8.6 23.8 L6.6 23.4 L12.4 16 Z" fill={mat(id, 'or')} opacity="0.5" />
    </>
  ),
});

/** Croisillon de fermeture — deux clous forgés croisés. */
export const IconFermer = makeIcon({
  mats: ['fer', 'or'],
  seed: 47,
  draw: (id) => (
    <>
      <path d="M6.6 4.4 L9.4 5.4 L27.2 24.4 L25.4 27.4 Z" fill={mat(id, 'fer')} {...contour('fer', 1)} />
      <path d="M25.4 4.4 L22.6 5.4 L4.8 24.4 L6.6 27.4 Z" fill={mat(id, 'fer')} {...contour('fer', 1)} />
      {keyLight('M7.6 5.6 L24.4 24.4', 0.34, 0.9)}
      <path d="M16 14.2 a1.9 1.9 0 1 0 0.1 0 Z" fill={mat(id, 'or')} opacity="0.85" />
    </>
  ),
});

/** Trait de validation, tracé au burin. */
export const IconValider = makeIcon({
  mats: ['feuille', 'or'],
  seed: 49,
  draw: (id) => (
    <>
      <path
        d="M4.4 16.4 L8.4 13.4 L13.4 19.4 L24.4 5.4 L28.4 8.4 L13.8 27 Z"
        fill={mat(id, 'feuille')}
        {...contour('feuille', 1.05)}
      />
      {keyLight('M5.6 16.4 L13.4 25.4 L26.8 8.4', 0.36, 1.1)}
      <path d="M24.6 5.6 L28.2 8.4 L26.4 10.6 L23 7.8 Z" fill={mat(id, 'or')} opacity="0.65" />
    </>
  ),
});

/** Barre forgée horizontale et verticale — ajouter. */
export const IconPlus = makeIcon({
  mats: ['or'],
  seed: 51,
  draw: (id) => (
    <>
      <path d="M13.6 5 L18.4 5 L18.6 13.6 L27.2 13.8 L27.2 18.2 L18.6 18.4 L18.4 27 L13.6 27 L13.4 18.4 L4.8 18.2 L4.8 13.8 L13.4 13.6 Z" fill={mat(id, 'or')} {...contour('or', 1)} />
      {keyLight('M14.6 6.2 L14.6 14.6 L6 14.6', 0.44, 1)}
    </>
  ),
});

/** Barre forgée horizontale — retirer. */
export const IconMoins = makeIcon({
  mats: ['or'],
  seed: 53,
  draw: (id) => (
    <>
      <path d="M4.8 13.6 L27.2 13.4 L27.2 18.6 L4.8 18.4 Z" fill={mat(id, 'or')} {...contour('or', 1)} />
      {keyLight('M6 14.6 L26 14.4', 0.44, 1)}
    </>
  ),
});

/** Trois barres à rivets — menu. */
export const IconMenu = makeIcon({
  mats: ['fer', 'or'],
  seed: 55,
  draw: (id) => (
    <>
      <path d="M4.4 6.4 L27.6 5.8 L27.6 9.8 L4.4 9.2 Z" fill={mat(id, 'fer')} {...contour('fer', 0.9)} />
      <path d="M4.4 14.2 L27.6 13.8 L27.6 17.8 L4.4 17.4 Z" fill={mat(id, 'fer')} {...contour('fer', 0.9)} />
      <path d="M4.4 22.2 L27.6 21.8 L27.6 25.8 L4.4 25.4 Z" fill={mat(id, 'fer')} {...contour('fer', 0.9)} />
      <path d="M7 7.2 a1 1 0 1 0 0.1 0 Z M25 7 a1 1 0 1 0 0.1 0 Z M7 15 a1 1 0 1 0 0.1 0 Z M25 14.8 a1 1 0 1 0 0.1 0 Z M7 23 a1 1 0 1 0 0.1 0 Z M25 22.8 a1 1 0 1 0 0.1 0 Z" fill={mat(id, 'or')} opacity="0.8" />
    </>
  ),
});

/** Cartouche d'information : lettre capitale sur médaillon. */
export const IconInformation = makeIcon({
  mats: ['parchemin', 'or', 'encre'],
  seed: 57,
  draw: (id) => (
    <>
      <path
        d="M16 2.6 C23.4 2.6 29.4 8.6 29.4 16 C29.4 23.4 23.4 29.4 16 29.4 C8.6 29.4 2.6 23.4 2.6 16 C2.6 8.6 8.6 2.6 16 2.6 Z"
        fill={mat(id, 'parchemin')}
        {...contour('parchemin', 1.1)}
      />
      <path
        d="M16 4.6 C22.3 4.6 27.4 9.7 27.4 16 C27.4 22.3 22.3 27.4 16 27.4 C9.7 27.4 4.6 22.3 4.6 16 C4.6 9.7 9.7 4.6 16 4.6 Z"
        fill="none"
        stroke={mat(id, 'or')}
        strokeWidth="1.2"
      />
      {keyLight('M7.4 9.4 A11 11 0 0 1 15.4 4.8', 0.4, 1.3)}
      <path d="M14.2 12.6 L17.8 12.6 L17.8 23 L19.8 23 L19.8 25 L12.2 25 L12.2 23 L14.2 23 Z" fill={mat(id, 'encre')} />
      <path d="M16 6.8 L18.4 9.2 L16 11.6 L13.6 9.2 Z" fill={mat(id, 'encre')} />
    </>
  ),
});

/** Écu d'alerte, chevron et goutte de mise en garde. */
export const IconAlerte = makeIcon({
  mats: ['or', 'grenat', 'encre'],
  seed: 59,
  draw: (id) => (
    <>
      <path
        d="M16 2.6 Q17.6 2.6 18.4 4 L29.2 24.4 Q30.2 26.4 28.6 27.8 Q27.6 28.6 26 28.6 L6 28.6 Q4.4 28.6 3.4 27.8 Q1.8 26.4 2.8 24.4 L13.6 4 Q14.4 2.6 16 2.6 Z"
        fill={mat(id, 'or')}
        {...contour('or', 1.1)}
      />
      {keyLight('M15 5 L5 25', 0.4, 1.3)}
      {coolShade('M17.4 5.4 L27.2 25.4', 0.3, 1.3)}
      <path d="M14.4 10.4 L17.6 10.4 L17 20.4 L15 20.4 Z" fill={mat(id, 'grenat')} {...contour('grenat', 0.8)} />
      <path d="M16 22.4 a2.1 2.1 0 1 0 0.1 0 Z" fill={mat(id, 'grenat')} {...contour('grenat', 0.8)} />
    </>
  ),
});

/** Cadenas de coffre — verrou. */
export const IconVerrou = makeIcon({
  mats: ['fer', 'or', 'cuir'],
  seed: 61,
  draw: (id) => (
    <>
      <path
        d="M10 14.4 L10 10.4 C10 6.9 12.7 4.2 16 4.2 C19.3 4.2 22 6.9 22 10.4 L22 14.4 L19 14.4 L19 10.4 C19 8.6 17.7 7.2 16 7.2 C14.3 7.2 13 8.6 13 10.4 L13 14.4 Z"
        fill={mat(id, 'fer')}
        {...contour('fer', 1)}
      />
      {keyLight('M11.4 13.4 L11.4 10.2 A4.6 4.6 0 0 1 15.4 5.6', 0.4, 1.1)}
      <path
        d="M6.6 14.4 L25.4 14.4 Q26.6 14.4 26.6 15.8 L26.6 27.6 Q26.6 29 25.4 29 L6.6 29 Q5.4 29 5.4 27.6 L5.4 15.8 Q5.4 14.4 6.6 14.4 Z"
        fill={mat(id, 'cuir')}
        {...contour('cuir', 1.05)}
      />
      {hatch('M8.4 16.6 L8.4 26.8 M23.6 16.6 L23.6 26.8', '#2E2010', 0.4, 0.8)}
      <path d="M16 18.4 a2.6 2.6 0 1 0 0.1 0 Z" fill={mat(id, 'or')} {...contour('or', 0.8)} />
      <path d="M15.2 21 L16.8 21 L16.4 25.4 L15.6 25.4 Z" fill={mat(id, 'or')} />
    </>
  ),
});

/** Lorgnette de guetteur — recherche et examen. */
export const IconLoupe = makeIcon({
  mats: ['cuivre', 'brume', 'bois'],
  seed: 63,
  draw: (id) => (
    <>
      <path d="M17.4 19.6 L21.4 15.6 L29.4 23 L26 26.8 Z" fill={mat(id, 'bois')} {...contour('bois', 0.95)} />
      {hatch('M20.4 20.4 L24.4 24.4 M22.4 18.4 L26.4 22.4', '#3A2C1A', 0.4, 0.8)}
      <path
        d="M13.4 2.6 C19.4 2.6 24.2 7.4 24.2 13.4 C24.2 19.4 19.4 24.2 13.4 24.2 C7.4 24.2 2.6 19.4 2.6 13.4 C2.6 7.4 7.4 2.6 13.4 2.6 Z M13.4 5.8 C9.2 5.8 5.8 9.2 5.8 13.4 C5.8 17.6 9.2 21 13.4 21 C17.6 21 21 17.6 21 13.4 C21 9.2 17.6 5.8 13.4 5.8 Z"
        fill={mat(id, 'cuivre')}
        {...contour('cuivre', 1)}
      />
      <path d="M13.4 5.8 C17.6 5.8 21 9.2 21 13.4 C21 17.6 17.6 21 13.4 21 C9.2 21 5.8 17.6 5.8 13.4 C5.8 9.2 9.2 5.8 13.4 5.8 Z" fill={mat(id, 'brume')} fillOpacity="0.42" />
      {keyLight('M7.4 8 A8.6 8.6 0 0 1 13.4 5.4', 0.5, 1.2)}
    </>
  ),
});

/* ───────────────────────── Monde et royaume ─────────────────────────────── */

/** Codex relié — encyclopédie du jeu. */
export const IconLivre = makeIcon({
  mats: ['cuir', 'parchemin', 'or'],
  seed: 65,
  draw: (id) => (
    <>
      <path
        d="M4.4 5 Q4.4 3.4 6 3.4 L26 3.4 Q27.6 3.4 27.6 5 L27.6 27 Q27.6 28.6 26 28.6 L6 28.6 Q4.4 28.6 4.4 27 Z"
        fill={mat(id, 'cuir')}
        {...contour('cuir', 1.05)}
      />
      <path d="M8.6 5.4 L26 5.4 L26 26.6 L8.6 26.6 Z" fill={mat(id, 'parchemin')} />
      {hatch('M11.4 9.4 L23 9.4 M11.4 12.6 L23.4 12.6 M11.4 15.8 L21.4 15.8 M11.4 19 L23 19 M11.4 22.2 L20 22.2', '#B6A682', 0.62, 0.85)}
      <path d="M4.4 5 Q4.4 3.4 6 3.4 L9.4 3.4 L9.4 28.6 L6 28.6 Q4.4 28.6 4.4 27 Z" fill={mat(id, 'cuir')} {...contour('cuir', 0.9)} />
      {keyLight('M6.2 5 L6.2 27', 0.34, 1)}
      <path d="M18.4 3.4 L21.4 3.4 L21.4 12.4 L19.9 10.4 L18.4 12.4 Z" fill={mat(id, 'or')} {...contour('or', 0.8)} />
    </>
  ),
});

/** Carte pliée du comté, chemin et boussole. */
export const IconCarte = makeIcon({
  mats: ['parchemin', 'feuille', 'grenat', 'or'],
  seed: 67,
  draw: (id) => (
    <>
      <path
        d="M2.8 7.4 L11.4 4.4 L20.6 7.8 L29.2 4.6 L29.2 25 L20.6 28.2 L11.4 24.8 L2.8 27.8 Z"
        fill={mat(id, 'parchemin')}
        {...contour('parchemin', 1.05)}
      />
      <path d="M11.4 4.4 L11.4 24.8 M20.6 7.8 L20.6 28.2" fill="none" stroke="#B6A682" strokeOpacity="0.7" strokeWidth="0.9" />
      {keyLight('M4 8.4 L10.4 6', 0.42, 1)}
      <path
        d="M5.4 22.4 Q10 16.4 14.6 17.4 Q19.4 18.4 22.4 12.4 Q24.4 8.6 27 8.4"
        fill="none"
        stroke={mat(id, 'grenat')}
        strokeWidth="1.3"
        strokeDasharray="2.4 1.8"
        strokeLinecap="round"
      />
      <path d="M6.4 20.4 Q8.4 14.4 13 12.4" fill="none" stroke={mat(id, 'feuille')} strokeOpacity="0.7" strokeWidth="1.1" />
      <path d="M25.4 20 L26.8 23.2 L25.4 22.4 L24 23.2 Z" fill={mat(id, 'or')} {...contour('or', 0.7)} />
      <path d="M25.4 17.4 a3.4 3.4 0 1 0 0.1 0 Z" fill="none" stroke={mat(id, 'or')} strokeWidth="0.9" strokeOpacity="0.75" />
    </>
  ),
});

/** Coffre ferré — butin et sauvegardes. */
export const IconCoffre = makeIcon({
  mats: ['bois', 'fer', 'or'],
  seed: 69,
  draw: (id) => (
    <>
      <path
        d="M4.4 12.4 Q4.4 6.4 16 6.4 Q27.6 6.4 27.6 12.4 L27.6 14.4 L4.4 14.4 Z"
        fill={mat(id, 'bois')}
        {...contour('bois', 1.05)}
      />
      <path d="M4.4 14.4 L27.6 14.4 L27.6 26 Q27.6 27.6 26 27.6 L6 27.6 Q4.4 27.6 4.4 26 Z" fill={mat(id, 'bois')} {...contour('bois', 1.05)} />
      {keyLight('M6.4 11.4 Q8.4 8.4 14 7.8 M6 16.4 L6 26', 0.4, 1.1)}
      <path d="M9.4 6.8 L11.4 6.8 L11.4 27.6 L9.4 27.6 Z M20.6 6.8 L22.6 6.8 L22.6 27.6 L20.6 27.6 Z" fill={mat(id, 'fer')} opacity="0.92" />
      <path d="M4.4 13.4 L27.6 13.4 L27.6 15.6 L4.4 15.6 Z" fill={mat(id, 'fer')} {...contour('fer', 0.8)} />
      <path d="M14.4 15.6 L17.6 15.6 L17.6 21.4 L14.4 21.4 Z" fill={mat(id, 'or')} {...contour('or', 0.85)} />
      <path d="M16 17.4 a1.1 1.1 0 1 0 0.1 0 Z" fill="#3A2C1A" />
      {hatch('M12.6 18.4 L12.6 25.4 M19.4 18.4 L19.4 25.4', '#3A2C1A', 0.3, 0.8)}
    </>
  ),
});

/** Donjon carré du Forez, toit d'ardoise et bannerette. */
export const IconTour = makeIcon({
  mats: ['pierre', 'grenat', 'or', 'fer'],
  seed: 71,
  draw: (id) => (
    <>
      <path d="M8.4 12.4 L23.6 12.4 L23.6 29.4 L8.4 29.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1.05)} />
      <path d="M6.6 8.4 L25.4 8.4 L25.4 12.4 L6.6 12.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1)} />
      <path d="M6.6 8.4 L9.4 8.4 L9.4 5.4 L12.2 5.4 L12.2 8.4 L14.6 8.4 L14.6 5.4 L17.4 5.4 L17.4 8.4 L19.8 8.4 L19.8 5.4 L22.6 5.4 L22.6 8.4 L25.4 8.4" fill={mat(id, 'pierre')} {...contour('pierre', 0.95)} />
      {keyLight('M10 9.4 L10 28.4 M8 10 L24 10', 0.36, 1)}
      {hatch('M12.6 14.4 L12.6 28.4 M19.4 14.4 L19.4 28.4 M9 18.4 L23 18.4 M9 23.4 L23 23.4', '#25272A', 0.3, 0.8)}
      <path d="M13.6 22.4 L18.4 22.4 L18.4 29.4 L13.6 29.4 Z" fill={mat(id, 'fer')} {...contour('fer', 0.9)} />
      <path d="M16 22.6 L16 29.2" stroke="#C9A227" strokeOpacity="0.4" strokeWidth="0.8" />
      <path d="M15.4 1.4 L16.4 1.4 L16.4 5.6 L15.4 5.6 Z" fill={mat(id, 'or')} />
      <path d="M16.4 1.8 L21.4 2.8 L19.4 4.2 L21.4 5.6 L16.4 4.6 Z" fill={mat(id, 'grenat')} {...contour('grenat', 0.75)} />
    </>
  ),
});

/** Cité fortifiée — deux toits et une porte. */
export const IconCite = makeIcon({
  mats: ['pierre', 'grenat', 'bois'],
  seed: 73,
  draw: (id) => (
    <>
      <path d="M2.6 29.4 L29.4 29.4 L29.4 16.4 L16 8.4 L2.6 16.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1.05)} />
      <path d="M2.6 16.4 L16 8.4 L29.4 16.4 L27.4 18.4 L16 11.4 L4.6 18.4 Z" fill={mat(id, 'grenat')} {...contour('grenat', 0.9)} />
      {keyLight('M4.6 18 L4.6 28.4 M5 17 L15.4 11', 0.36, 1)}
      <path d="M12.6 20.4 L19.4 20.4 Q19.4 16.6 16 16.6 Q12.6 16.6 12.6 20.4 L12.6 29.4 L12.6 29.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.95)} />
      <path d="M16 16.8 L16 29.2" stroke="#3A2C1A" strokeOpacity="0.5" strokeWidth="0.8" />
      {hatch('M6.4 21.4 L9.6 21.4 M6.4 25.4 L9.6 25.4 M22.4 21.4 L25.6 21.4 M22.4 25.4 L25.6 25.4', '#25272A', 0.42, 1.6)}
      <path d="M8 12.6 L8 6.4 L10.4 6.4 L10.4 11 Z" fill={mat(id, 'pierre')} {...contour('pierre', 0.8)} />
    </>
  ),
});

/** Pics de mineur croisés — carrière et mine. */
export const IconMine = makeIcon({
  mats: ['fer', 'bois'],
  seed: 75,
  draw: (id) => (
    <>
      <path d="M6.4 6.4 L8.6 4.4 L26.4 24.6 L24.2 26.6 Z" fill={mat(id, 'bois')} {...contour('bois', 0.9)} />
      <path d="M25.6 6.4 L23.4 4.4 L5.6 24.6 L7.8 26.6 Z" fill={mat(id, 'bois')} {...contour('bois', 0.9)} />
      <path d="M3 8.4 Q8.4 2.4 15 3.6 L13.6 7.4 Q9 6.8 5.6 10.6 Z" fill={mat(id, 'fer')} {...contour('fer', 1)} />
      <path d="M29 8.4 Q23.6 2.4 17 3.6 L18.4 7.4 Q23 6.8 26.4 10.6 Z" fill={mat(id, 'fer')} {...contour('fer', 1)} />
      {keyLight('M4.4 8 Q9 3.8 14 4.6', 0.42, 1.1)}
      <path d="M14.4 12.4 L17.6 12.4 L17.6 15.6 L14.4 15.6 Z" fill={mat(id, 'fer')} opacity="0.8" transform="rotate(45 16 14)" />
    </>
  ),
});

/** Étoile héraldique à six rais — distinction, niveau. */
export const IconEtoile = makeIcon({
  mats: ['or'],
  radial: ['or'],
  seed: 77,
  draw: (id) => (
    <>
      <path
        d="M16 1.6 L18.8 11 L28.6 8.6 L21.8 16 L28.6 23.4 L18.8 21 L16 30.4 L13.2 21 L3.4 23.4 L10.2 16 L3.4 8.6 L13.2 11 Z"
        fill={matR(id, 'or')}
        {...contour('or', 1)}
      />
      {keyLight('M14.6 4.4 L12.6 12.4 L5.4 10.4', 0.44, 1.1)}
      {coolShade('M17.6 27.4 L19.4 20 L26.4 22', 0.3, 1.1)}
      <path d="M16 8.4 L17.4 13.6 L22.4 16 L17.4 18.4 L16 23.6 L14.6 18.4 L9.6 16 L14.6 13.6 Z" fill="#FFE9C2" fillOpacity="0.3" />
    </>
  ),
});

/** Empreinte de botte ferrée — points de marche restants. */
export const IconPas = makeIcon({
  mats: ['cuir', 'fer'],
  seed: 79,
  draw: (id) => (
    <>
      <path
        d="M10.6 3.4 Q18.4 3.4 19.4 9.4 Q20.2 14.4 17.6 18.4 Q15.6 21.4 16.4 24.4 Q17.2 28.6 12.6 29.4 Q8 30 7 25.6 Q6.2 21.4 8.4 17.4 Q10.6 13.4 9.6 9.4 Q8.8 5.4 10.6 3.4 Z"
        fill={mat(id, 'cuir')}
        {...contour('cuir', 1.05)}
      />
      {keyLight('M11 5.4 Q10.6 10 11.6 14', 0.4, 1.1)}
      {hatch('M9.4 22.4 L15.4 21.4 M9 25.4 L15.6 24.6', '#2E2010', 0.4, 0.9)}
      <path d="M21.6 6.4 a2.2 2.2 0 1 0 0.1 0 Z M25.4 10.4 a1.9 1.9 0 1 0 0.1 0 Z M26.4 15.6 a1.7 1.7 0 1 0 0.1 0 Z" fill={mat(id, 'fer')} {...contour('fer', 0.7)} />
    </>
  ),
});

/** Flamme de feu de camp — braise, chaleur, sort offensif générique. */
export const IconFeu = makeIcon({
  mats: ['braise', 'or'],
  radial: ['braise'],
  seed: 81,
  draw: (id) => (
    <>
      <path
        d="M16 1.8 Q19.4 7.4 18.4 11.4 Q22.4 9.4 22.6 5.6 Q27.6 12.4 26.4 19 Q25 27 16 30.2 Q7 27 5.6 19 Q4.6 13.4 8.4 8.4 Q8.8 12.4 11.4 13.4 Q10.4 7.4 16 1.8 Z"
        fill={mat(id, 'braise')}
        {...contour('braise', 1.05)}
      />
      <path
        d="M16 12.4 Q19.4 16.4 19.4 20.4 Q19.4 25.4 16 27.6 Q12.6 25.4 12.6 20.4 Q12.6 16.4 16 12.4 Z"
        fill={matR(id, 'braise')}
        opacity="0.9"
      />
      <path d="M16 17.4 Q17.8 20 17.8 22.4 Q17.8 25 16 26.4 Q14.2 25 14.2 22.4 Q14.2 20 16 17.4 Z" fill="#FFE9C2" fillOpacity="0.6" />
      {keyLight('M13.4 6.4 Q11.4 11.4 12.4 15.4', 0.4, 1)}
      <path d="M22.6 22.4 a1.5 1.5 0 1 0 0.1 0 Z" fill={mat(id, 'or')} opacity="0.55" className="hmm-scintille" />
    </>
  ),
});

/** Goutte de source — mana, eau, essence. */
export const IconGoutte = makeIcon({
  mats: ['eau'],
  radial: ['eau'],
  seed: 83,
  draw: (id) => (
    <>
      <path
        d="M16 2.4 Q23.4 11.4 25 17.4 Q26.6 24 21.4 27.8 Q18.8 29.6 16 29.6 Q13.2 29.6 10.6 27.8 Q5.4 24 7 17.4 Q8.6 11.4 16 2.4 Z"
        fill={matR(id, 'eau')}
        {...contour('eau', 1.05)}
      />
      {keyLight('M13.4 9.4 Q9.6 15.4 9.8 20.4', 0.44, 1.3)}
      {coolShade('M21.4 13.4 Q23.6 18.4 22.4 23.4', 0.3, 1.2)}
      <path d="M12.4 19.4 Q11.4 22.6 13 24.6" fill="none" stroke="#FFE9C2" strokeOpacity="0.55" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
});

/** Soleil de midi, huit rais inégaux — cycle du jour. */
export const IconSoleil = makeIcon({
  mats: ['or'],
  radial: ['or'],
  seed: 85,
  draw: (id) => (
    <>
      <path
        d="M16 1.6 L17.8 6.6 L22.4 4 L21.8 9.2 L27 8.6 L24.4 13.2 L29.4 15 L24.4 16.8 L27 21.4 L21.8 20.8 L22.4 26 L17.8 23.4 L16 28.4 L14.2 23.4 L9.6 26 L10.2 20.8 L5 21.4 L7.6 16.8 L2.6 15 L7.6 13.2 L5 8.6 L10.2 9.2 L9.6 4 L14.2 6.6 Z"
        fill={mat(id, 'or')}
        opacity="0.86"
        {...contour('or', 0.9)}
      />
      <path
        d="M16 8.2 C19.8 8.2 22.8 11.2 22.8 15 C22.8 18.8 19.8 21.8 16 21.8 C12.2 21.8 9.2 18.8 9.2 15 C9.2 11.2 12.2 8.2 16 8.2 Z"
        fill={matR(id, 'or')}
        {...contour('or', 1)}
      />
      {keyLight('M11.4 11 A6.6 6.6 0 0 1 16 9.4', 0.5, 1.2)}
    </>
  ),
});
