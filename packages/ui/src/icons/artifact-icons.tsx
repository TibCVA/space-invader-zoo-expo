/**
 * Les cinquante-trois artefacts du Forez. Clefs d'atlas imposées par
 * `packages/content` : `artefact_<id>`.
 *
 * ── Règle de composition (documentée, car assumée) ────────────────────────
 * Dessiner cinquante-trois objets rigoureusement sans parenté produirait un
 * jeu d'icônes illisible en 20 px. La famille est donc construite ainsi :
 *
 *  1. **La forme dit la nature de l'objet.** Quarante glyphes dessinés à la
 *     main couvrent les quarante natures d'objet présentes dans le contenu
 *     (chausses, bourdon, anneau, heaume, calice, ramure, serre…). Les pièces
 *     de même nature — six anneaux, trois bannières, trois paires de bottes —
 *     partagent le glyphe : c'est voulu, c'est ce qui les rend reconnaissables
 *     d'un coup d'œil comme « un anneau », « une bannière ».
 *  2. **La ferrure dit la rareté.** Cartouche octogonal : ardoise et un clou
 *     pour un commun, cuivre et deux clous pour un rare, or et trois clous
 *     pour un majeur, or et grenat, quatre clous et rayons pour une relique.
 *  3. **La gemme dit la pièce.** Chaque artefact porte un cabochon d'une teinte
 *     propre, prise dans la palette : c'est ce qui distingue l'Anneau de cuivre
 *     de l'Anneau des sources sans les rendre méconnaissables.
 *
 * Les cinquante-trois icônes sont donc bien **distinctes deux à deux**, tout en
 * restant une famille.
 */

import type { ReactNode } from 'react';
import { contour, coolShade, hatch, keyLight, makeIcon, mat, matR } from './kit.js';
import type { IconComponent, MaterialKey } from './kit.js';

type Rarity = 'commun' | 'rare' | 'majeur' | 'relique';

const OCTO = 'M10.6 2.2 H21.4 L29.8 10.6 V21.4 L21.4 29.8 H10.6 L2.2 21.4 V10.6 Z';

const RARITY_RING: Readonly<Record<Rarity, string>> = {
  commun: '#8A8478',
  rare: '#4E8977',
  majeur: '#C08A3E',
  relique: '#8C2230',
};

const RARITY_STUDS: Readonly<Record<Rarity, number>> = {
  commun: 1,
  rare: 2,
  majeur: 3,
  relique: 4,
};

function studPositions(count: number): [number, number][] {
  switch (count) {
    case 1:
      return [[16, 28.2]];
    case 2:
      return [
        [16, 3.8],
        [16, 28.2],
      ];
    case 3:
      return [
        [16, 3.8],
        [4.6, 16],
        [27.4, 16],
      ];
    default:
      return [
        [16, 3.8],
        [4.6, 16],
        [27.4, 16],
        [16, 28.2],
      ];
  }
}

/** Cartouche de rareté : troisième strate et information non chromatique. */
function frame(id: string, rarity: Rarity): ReactNode {
  const ring = RARITY_RING[rarity];
  return (
    <>
      {rarity === 'relique' ? (
        <path
          d="M16 0.8 L17 5.4 L16 5.4 Z M31.2 16 L26.6 17 L26.6 16 Z M16 31.2 L15 26.6 L16 26.6 Z M0.8 16 L5.4 15 L5.4 16 Z"
          fill="#C9A227"
          opacity="0.55"
        />
      ) : null}
      <path
        d={OCTO}
        fill="none"
        stroke={ring}
        strokeWidth={rarity === 'commun' ? 1 : rarity === 'rare' ? 1.2 : 1.5}
        strokeLinejoin="round"
        opacity="0.92"
      />
      {rarity === 'majeur' || rarity === 'relique' ? (
        <path
          d={OCTO}
          fill="none"
          stroke="#C9A227"
          strokeWidth="0.6"
          opacity="0.6"
          transform="translate(16 16) scale(0.88) translate(-16 -16)"
        />
      ) : null}
      {studPositions(RARITY_STUDS[rarity]).map(([x, y]) => (
        <path
          key={`${x}-${y}`}
          d={`M${x} ${y - 1.1} L${x + 1.1} ${y} L${x} ${y + 1.1} L${x - 1.1} ${y} Z`}
          fill={mat(id, 'or')}
        />
      ))}
    </>
  );
}

interface Glyph {
  mats: readonly MaterialKey[];
  radial?: readonly MaterialKey[];
  draw: (id: string) => ReactNode;
}

function artifactIcon(glyph: Glyph, rarity: Rarity, gem: string, seed: number): IconComponent {
  return makeIcon({
    mats: ['or', ...glyph.mats],
    radial: glyph.radial,
    seed,
    draw: (id) => (
      <>
        <path d={OCTO} fill={RARITY_RING[rarity]} opacity="0.16" />
        <path d={OCTO} fill="none" stroke="#FFE9C2" strokeOpacity="0.2" strokeWidth="2" transform="translate(0.7 0.7)" />
        {glyph.draw(id)}
        <path d="M25.4 24.2 a2.1 2.1 0 1 0 0.1 0 Z" fill={gem} stroke="#241C14" strokeOpacity="0.4" strokeWidth="0.7" />
        <path d="M24.8 23.5 a0.7 0.7 0 1 0 0.1 0 Z" fill="#FFE9C2" fillOpacity="0.7" />
        {frame(id, rarity)}
      </>
    ),
  });
}

/* ──────────────────────────── Les quarante glyphes ──────────────────────── */

const G: Readonly<Record<string, Glyph>> = {
  chausses: {
    mats: ['cuir'],
    draw: (id) => (
      <>
        <path d="M8.4 13.4 Q13.4 12.4 15.4 15.4 Q17.4 18.4 22.6 19.4 Q25.4 20 25 22.4 L8.4 22.4 Q6.4 18 8.4 13.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 1)} />
        {keyLight('M9.4 15.4 Q9 18.4 9.6 21', 0.42, 1)}
        {hatch('M12.4 16.4 L12.4 21.4 M16 18 L16 21.6 M20.4 20.4 L20.4 22', '#2E2010', 0.4, 0.8)}
      </>
    ),
  },
  brodequins: {
    mats: ['cuir', 'fer'],
    draw: (id) => (
      <>
        <path d="M8.4 10.4 Q13.4 9.4 14.4 14.4 Q15.4 19.4 21.6 20.4 Q25.4 21 25 24.4 L8.4 24.4 Q6 17 8.4 10.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 1.05)} />
        {keyLight('M9.6 12.4 Q9 18.4 9.6 23', 0.42, 1.1)}
        <path d="M7.4 24.4 L25.4 24.4 L25.4 26.4 L7.4 26.4 Z" fill={mat(id, 'fer')} {...contour('fer', 0.85)} />
        <path d="M10 25.4 a0.7 0.7 0 1 0 0.1 0 Z M14 25.4 a0.7 0.7 0 1 0 0.1 0 Z M18 25.4 a0.7 0.7 0 1 0 0.1 0 Z M22 25.4 a0.7 0.7 0 1 0 0.1 0 Z" fill="#9AA3AC" />
        {hatch('M11.4 13.4 L11.4 22.4 M14.6 16.4 L14.6 23', '#2E2010', 0.36, 0.8)}
      </>
    ),
  },
  lorgnette: {
    mats: ['cuivre', 'brume'],
    draw: (id) => (
      <>
        <path d="M5.4 18.4 L11.4 12.4 L20.6 12.4 L26.6 18.4 L26.6 21.4 L5.4 21.4 Z" fill={mat(id, 'cuivre')} {...contour('cuivre', 1.05)} />
        <path d="M11.4 12.4 L20.6 12.4 L20.6 21.4 L11.4 21.4 Z" fill={mat(id, 'cuivre')} opacity="0.8" />
        {keyLight('M6.6 18.6 L11.6 13.6 L20 13.6', 0.46, 1.1)}
        <path d="M24.4 15.4 L27.6 15.4 L27.6 22.4 L24.4 22.4 Z" fill={mat(id, 'brume')} fillOpacity="0.7" {...contour('brume', 0.8)} />
        {hatch('M13.4 14 L13.4 20.4 M17 14 L17 20.4', '#4C2E18', 0.34, 0.8)}
      </>
    ),
  },
  ceinture: {
    mats: ['cuir', 'or'],
    draw: (id) => (
      <>
        <path d="M3.4 13.4 L28.6 13.4 L28.6 19.4 L3.4 19.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 1.05)} />
        {keyLight('M4.4 14.4 L27.6 14.4', 0.44, 1.1)}
        {hatch('M7.4 15 L7.4 18 M11 15 L11 18 M24 15 L24 18 M27 15 L27 18', '#2E2010', 0.4, 0.8)}
        <path d="M13.4 10.4 L21.6 10.4 L21.6 22.4 L13.4 22.4 Z M15.4 12.4 L19.6 12.4 L19.6 20.4 L15.4 20.4 Z" fill={mat(id, 'or')} {...contour('or', 0.95)} />
        <path d="M17 8.4 L18 8.4 L18 13.4 L17 13.4 Z" fill={mat(id, 'or')} />
      </>
    ),
  },
  bourdon: {
    mats: ['bois', 'or'],
    draw: (id) => (
      <>
        <path d="M13.4 6.4 L17 6.4 L15.4 27.4 L12.4 27.4 Z" fill={mat(id, 'bois')} {...contour('bois', 1.05)} />
        {hatch('M13.4 11.4 L16.4 11.4 M13 16.4 L16 16.4 M12.7 21.4 L15.7 21.4', '#3A2C1A', 0.4, 0.8)}
        <path d="M12.4 4.4 Q15.4 2.4 18.4 4.6 Q18.4 7.4 15.4 7.6 Q12.4 7.2 12.4 4.4 Z" fill={mat(id, 'or')} {...contour('or', 0.9)} />
        {keyLight('M13.4 8.4 L12 25.4', 0.4, 0.9)}
        <path d="M17.4 12.4 Q22.6 13.4 22.6 18.4 Q22.6 22.4 19.4 22.4 Q16.4 22.4 16.4 18.4 Q16.4 14.4 17.4 12.4 Z" fill="#5A4128" {...contour('cuir', 0.95)} />
      </>
    ),
  },
  mitaines: {
    mats: ['etoffe', 'or'],
    draw: (id) => (
      <>
        <path d="M7.4 11.4 Q12.4 9.4 15.4 11.4 L15.4 22.4 Q11.4 24.4 7.4 22.4 Z" fill={mat(id, 'etoffe')} {...contour('etoffe', 1)} />
        <path d="M16.6 11.4 Q21.6 9.4 24.6 11.4 L24.6 22.4 Q20.6 24.4 16.6 22.4 Z" fill={mat(id, 'etoffe')} opacity="0.92" {...contour('etoffe', 1)} />
        <path d="M5.4 13.4 Q3.4 15.4 5.4 17.4 L7.4 16.4 L7.4 13.4 Z M26.6 13.4 Q28.6 15.4 26.6 17.4 L24.6 16.4 L24.6 13.4 Z" fill={mat(id, 'etoffe')} {...contour('etoffe', 0.85)} />
        {hatch('M9.4 13.4 L9.4 21.4 M12.4 13 L12.4 21.6 M19 13.4 L19 21.4 M22 13 L22 21.6', '#C9A227', 0.42, 0.8)}
      </>
    ),
  },
  capuche: {
    mats: ['etoffe', 'cuir'],
    draw: (id) => (
      <>
        <path d="M16 5.4 Q24.6 5.4 25.6 15.4 Q26.4 22.4 22.6 26.4 L20.4 21.4 Q22.6 16.4 21.4 12.4 Q19.4 15.4 16 15.4 Q12.6 15.4 10.6 12.4 Q9.4 16.4 11.6 21.4 L9.4 26.4 Q5.6 22.4 6.4 15.4 Q7.4 5.4 16 5.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 1.05)} />
        {keyLight('M9.4 12.4 Q7.4 18.4 9.4 24.4', 0.4, 1.2)}
        {hatch('M13.4 8.4 Q16 10.4 18.6 8.4', '#2E2010', 0.4, 0.9)}
        <path d="M12.4 17.4 Q16 20.4 19.6 17.4 L18.4 27.4 L13.6 27.4 Z" fill={mat(id, 'etoffe')} opacity="0.7" />
      </>
    ),
  },
  besace: {
    mats: ['cuir', 'or'],
    draw: (id) => (
      <>
        <path d="M8.4 13.4 L23.6 13.4 L25.4 26.4 L6.6 26.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 1.05)} />
        <path d="M8.4 13.4 L23.6 13.4 L22.6 18.4 L9.4 18.4 Z" fill="#6B4E30" {...contour('cuir', 0.85)} />
        {keyLight('M9.4 14.4 L22.6 14.4 M8 19.4 L7.4 25', 0.42, 1.1)}
        <path d="M11.4 13.4 Q11.4 6.4 16 6.4 Q20.6 6.4 20.6 13.4" fill="none" stroke={mat(id, 'cuir')} strokeWidth="1.6" />
        <path d="M14.4 18.4 L17.6 18.4 L17.6 21.4 L14.4 21.4 Z" fill={mat(id, 'or')} />
        {hatch('M12.4 20.4 L11.6 25 M20 20.4 L20.6 25', '#2E2010', 0.36, 0.8)}
      </>
    ),
  },
  medaille: {
    mats: ['cuivre', 'cuir'],
    radial: ['cuivre'],
    draw: (id) => (
      <>
        <path d="M9.4 5.4 Q16 3.4 22.6 5.4" fill="none" stroke={mat(id, 'cuir')} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M11.4 6.4 L16 14.4 L20.6 6.4" fill="none" stroke={mat(id, 'cuir')} strokeWidth="1.4" />
        <path d="M16 12.4 C20.6 12.4 24.4 16.2 24.4 20.8 C24.4 25.4 20.6 29.2 16 29.2 C11.4 29.2 7.6 25.4 7.6 20.8 C7.6 16.2 11.4 12.4 16 12.4 Z" fill={matR(id, 'cuivre')} {...contour('cuivre', 1.05)} />
        {keyLight('M10.4 17.4 A8.4 8.4 0 0 1 16 13.6', 0.5, 1.2)}
        <path d="M16 16.4 L17.4 19.8 L21 20 L18.2 22.2 L19.2 25.6 L16 23.6 L12.8 25.6 L13.8 22.2 L11 20 L14.6 19.8 Z" fill="#DDAB7E" fillOpacity="0.55" />
      </>
    ),
  },
  jaque: {
    mats: ['etoffe', 'cuir'],
    draw: (id) => (
      <>
        <path d="M11.4 6.4 L16 9.4 L20.6 6.4 L26.4 9.4 L24.4 16.4 L22.6 15.4 L22.6 27.4 L9.4 27.4 L9.4 15.4 L7.6 16.4 L5.6 9.4 Z" fill={mat(id, 'etoffe')} {...contour('etoffe', 1.05)} />
        {keyLight('M10.4 8.4 L7.4 10.4 M10.4 16.4 L10.4 26.4', 0.4, 1.1)}
        {hatch('M9.4 18.4 L22.6 18.4 M9.4 22.4 L22.6 22.4 M13 15.4 L13 27 M19 15.4 L19 27', '#241929', 0.42, 0.85)}
        <path d="M14.4 9.4 L17.6 9.4 L16 13.4 Z" fill={mat(id, 'cuir')} opacity="0.8" />
      </>
    ),
  },
  fanion: {
    mats: ['bois', 'sel'],
    draw: (id) => (
      <>
        <path d="M8.4 4.4 L10 4.4 L10 28.4 L8.4 28.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.85)} />
        <path d="M10 6.4 L24.6 9.4 L16.4 13.4 L24.6 17.4 L10 20.4 Z" fill={mat(id, 'sel')} {...contour('sel', 1)} />
        {keyLight('M11 7.6 L22 9.6', 0.44, 1)}
        {hatch('M13.4 7.4 L13.4 19.4 M17 8.4 L17 18.4', '#A59A80', 0.4, 0.8)}
      </>
    ),
  },
  anneau: {
    mats: ['or'],
    radial: ['or'],
    draw: (id) => (
      <>
        <path d="M16 8.4 C21.5 8.4 25.6 12.5 25.6 18 C25.6 23.5 21.5 27.6 16 27.6 C10.5 27.6 6.4 23.5 6.4 18 C6.4 12.5 10.5 8.4 16 8.4 Z M16 12.4 C12.9 12.4 10.4 14.9 10.4 18 C10.4 21.1 12.9 23.6 16 23.6 C19.1 23.6 21.6 21.1 21.6 18 C21.6 14.9 19.1 12.4 16 12.4 Z" fill={mat(id, 'or')} {...contour('or', 1.1)} />
        {keyLight('M9.4 13.4 A9.6 9.6 0 0 1 16 9.6', 0.5, 1.3)}
        {coolShade('M23.6 22.4 A9.6 9.6 0 0 1 17.4 26.4', 0.3, 1.2)}
        <path d="M16 4.4 L19.4 8.4 L16 11.4 L12.6 8.4 Z" fill={matR(id, 'or')} {...contour('or', 0.95)} />
      </>
    ),
  },
  couteau: {
    mats: ['acier', 'bois'],
    draw: (id) => (
      <>
        <path d="M6.4 22.4 L21.4 6.4 L23.6 8.4 L9.4 24.4 Z" fill={mat(id, 'acier')} {...contour('acier', 1.05)} />
        {keyLight('M7.6 21.6 L20.6 7.6', 0.48, 1.1)}
        <path d="M8.4 23.4 L11.4 26.4 L6.4 28.4 L4.4 25.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.95)} />
        {hatch('M6.4 25 L9.4 26.4', '#3A2C1A', 0.4, 0.8)}
        <path d="M20.4 5.4 L25.6 5.4 L25.6 9.4 L21.6 9.4 Z" fill={mat(id, 'acier')} opacity="0.7" />
      </>
    ),
  },
  baton: {
    mats: ['bois', 'fer'],
    draw: (id) => (
      <>
        <path d="M6.4 25.4 L23.6 6.4 L26 8.6 L8.8 27.6 Z" fill={mat(id, 'bois')} {...contour('bois', 1.05)} />
        {keyLight('M7.6 24.8 L23 7.6', 0.42, 1)}
        <path d="M11.4 20.4 L14.4 23.4 M15.4 15.4 L18.4 18.4 M19.4 10.4 L22.4 13.4" stroke={mat(id, 'fer')} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M23.4 4.4 L28.6 4.4 L28.6 9.4 L25.4 9.4 Z" fill={mat(id, 'fer')} {...contour('fer', 0.9)} />
      </>
    ),
  },
  bonnet: {
    mats: ['etoffe', 'sel'],
    draw: (id) => (
      <>
        <path d="M6.4 20.4 Q6.4 8.4 16 8.4 Q25.6 8.4 25.6 20.4 Z" fill={mat(id, 'etoffe')} {...contour('etoffe', 1.05)} />
        {keyLight('M8.4 19.4 Q8.4 11.4 14.4 9.6', 0.4, 1.2)}
        <path d="M4.4 20.4 L27.6 20.4 L27.6 24.4 L4.4 24.4 Z" fill={mat(id, 'sel')} {...contour('sel', 1)} />
        {hatch('M8.4 21.4 L8.4 23.4 M13 21.4 L13 23.4 M19 21.4 L19 23.4 M23.6 21.4 L23.6 23.4', '#A59A80', 0.42, 0.8)}
        <path d="M15.4 5.4 L16.6 5.4 L16.6 9.4 L15.4 9.4 Z" fill={mat(id, 'etoffe')} />
      </>
    ),
  },
  gourde: {
    mats: ['bois', 'cuir'],
    draw: (id) => (
      <>
        <path d="M13.4 6.4 L18.6 6.4 L18.6 10.4 L13.4 10.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 0.85)} />
        <path d="M16 10.4 Q25.6 12.4 25.6 20.4 Q25.6 27.6 16 27.6 Q6.4 27.6 6.4 20.4 Q6.4 12.4 16 10.4 Z" fill={mat(id, 'bois')} {...contour('bois', 1.05)} />
        {keyLight('M11.4 13.4 Q8.4 16.4 8.6 21.4', 0.44, 1.2)}
        <path d="M6.6 18.4 Q16 16.4 25.4 18.4" fill="none" stroke="#3A2C1A" strokeOpacity="0.45" strokeWidth="1" />
        {hatch('M12.4 20.4 L12 25.4 M19.6 20.4 L20 25.4', '#3A2C1A', 0.34, 0.8)}
      </>
    ),
  },
  gantelet: {
    mats: ['acier', 'cuir'],
    draw: (id) => (
      <>
        <path d="M9.4 12.4 L11.4 6.4 L14 6.4 L14.4 12.4 L16.4 5.4 L19 5.4 L19.4 12.4 L21.4 7.4 L23.6 8.4 L22.6 14.4 Q24.6 18.4 22.6 23.4 Q20.6 27.6 15.4 27.6 Q10.4 27.6 8.4 23.4 Q6.4 18.4 8.4 13.4 Z" fill={mat(id, 'acier')} {...contour('acier', 1.05)} />
        {keyLight('M10.4 14.4 Q8.6 19.4 10.4 24.4', 0.44, 1.2)}
        {hatch('M11.4 17.4 L21.4 17.4 M11 21.4 L21.6 21.4', '#3F474F', 0.42, 0.9)}
        <path d="M9.4 24.4 L21.6 24.4 L21 27.4 L10 27.4 Z" fill={mat(id, 'cuir')} opacity="0.8" />
      </>
    ),
  },
  banniere: {
    mats: ['grenat', 'bois', 'or'],
    draw: (id) => (
      <>
        <path d="M7.4 4.4 L9 4.4 L9 28.4 L7.4 28.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.85)} />
        <path d="M9 6.4 L25.6 8.4 L22.6 14.4 L25.6 20.4 L9 22.4 Z" fill={mat(id, 'grenat')} {...contour('grenat', 1.05)} />
        {keyLight('M10 7.6 L23.4 9.4', 0.4, 1.1)}
        <path d="M15.4 11.4 L18.4 14.4 L15.4 17.4 L12.4 14.4 Z" fill={mat(id, 'or')} {...contour('or', 0.85)} />
        {hatch('M12 8 L12 21.6 M20 9.4 L20 20', '#3A0E15', 0.3, 0.75)}
      </>
    ),
  },
  cor: {
    mats: ['os', 'or'],
    draw: (id) => (
      <>
        <path d="M5.4 10.4 Q5.4 7.4 8.4 7.4 Q16.4 7.4 21.6 13.4 Q26.6 19.4 26.6 26.4 L20.6 26.4 Q20.6 20.4 16.4 15.4 Q12.4 11.4 8.4 11.4 Q5.4 11.4 5.4 10.4 Z" fill={mat(id, 'os')} {...contour('os', 1.05)} />
        {keyLight('M7.4 9 Q13.4 9.4 18.4 15.4', 0.48, 1.2)}
        <path d="M19.6 24.4 L28.6 24.4 L28.6 28.4 L19.6 28.4 Z" fill={mat(id, 'or')} {...contour('or', 0.95)} />
        <path d="M4.4 6.4 L9.4 6.4 L9.4 12.4 L4.4 12.4 Z" fill={mat(id, 'or')} {...contour('or', 0.9)} />
      </>
    ),
  },
  chapeauCire: {
    mats: ['cuir', 'sel'],
    draw: (id) => (
      <>
        <path d="M9.4 17.4 Q9.4 7.4 16 7.4 Q22.6 7.4 22.6 17.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 1.05)} />
        <path d="M2.6 17.4 Q16 14.4 29.4 17.4 Q29.4 21.4 24.6 22.4 Q16 24.4 7.4 22.4 Q2.6 21.4 2.6 17.4 Z" fill={mat(id, 'cuir')} {...contour('cuir', 1.05)} />
        {keyLight('M11.4 15.4 Q11.4 9.4 15.4 8.6 M4.4 18 Q10 16.4 15.4 16.2', 0.44, 1.2)}
        <path d="M9.4 15.4 Q16 13.4 22.6 15.4 L22.6 17.4 Q16 15.4 9.4 17.4 Z" fill={mat(id, 'sel')} opacity="0.65" />
        {hatch('M12.4 19.4 L12 22 M19.6 19.4 L20 22', '#2E2010', 0.34, 0.8)}
      </>
    ),
  },
  sifflet: {
    mats: ['acier', 'cuir'],
    draw: (id) => (
      <>
        <path d="M6.4 13.4 L21.6 13.4 Q25.6 13.4 25.6 17.4 Q25.6 21.4 21.6 21.4 L6.4 21.4 Q4.4 17.4 6.4 13.4 Z" fill={mat(id, 'acier')} {...contour('acier', 1.05)} />
        {keyLight('M7.4 14.6 L21.4 14.6', 0.48, 1.1)}
        <path d="M13.4 10.4 L15 10.4 L15 13.4 L13.4 13.4 Z" fill={mat(id, 'acier')} />
        <path d="M11.4 15.4 L18.6 15.4 L18.6 17.4 L11.4 17.4 Z" fill="#3F474F" fillOpacity="0.72" />
        <path d="M13 6.4 Q18.4 5.4 21.6 9.4" fill="none" stroke={mat(id, 'cuir')} strokeWidth="1.4" strokeLinecap="round" />
        {hatch('M8.4 18.4 L8.4 20.4 M22.6 15.4 L22.6 19.4', '#3F474F', 0.36, 0.8)}
      </>
    ),
  },
  desACoudre: {
    mats: ['acier', 'or'],
    draw: (id) => (
      <>
        <path d="M9.4 24.4 Q7.4 13.4 12.4 8.4 Q16 5.4 19.6 8.4 Q24.6 13.4 22.6 24.4 Z" fill={mat(id, 'acier')} {...contour('acier', 1.1)} />
        {keyLight('M11.4 22.4 Q10.4 13.4 14 9.6', 0.48, 1.3)}
        {hatch('M11.4 12.4 L20.6 12.4 M10.8 15.4 L21.2 15.4 M10.4 18.4 L21.6 18.4 M10.2 21.4 L21.8 21.4', '#3F474F', 0.4, 0.8)}
        <path d="M9 24.4 L23 24.4 L23 26.4 L9 26.4 Z" fill={mat(id, 'or')} {...contour('or', 0.85)} />
      </>
    ),
  },
  corsage: {
    mats: ['grenat', 'or'],
    draw: (id) => (
      <>
        <path d="M11.4 6.4 L16 10.4 L20.6 6.4 L24.6 9.4 L22.6 26.4 L9.4 26.4 L7.4 9.4 Z" fill={mat(id, 'grenat')} {...contour('grenat', 1.05)} />
        {keyLight('M10.4 8.4 L9 11.4 M10.4 14.4 L10.4 25', 0.36, 1.1)}
        <path d="M13.4 14.4 a2 2 0 1 0 0.1 0 Z M19.6 17.4 a2 2 0 1 0 0.1 0 Z M15.4 21.4 a1.8 1.8 0 1 0 0.1 0 Z" fill={mat(id, 'or')} {...contour('or', 0.7)} />
        {hatch('M13.4 12.4 L13.4 13.4 M19.6 15.4 L19.6 16.4 M15.4 19.4 L15.4 20.4', '#7A6116', 0.6, 0.8)}
      </>
    ),
  },
  plastron: {
    mats: ['pierre', 'fer'],
    draw: (id) => (
      <>
        <path d="M10.4 6.4 L16 9.4 L21.6 6.4 L25.4 10.4 L23.6 26.4 L8.4 26.4 L6.6 10.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1.1)} />
        {keyLight('M9.4 9.4 L8 11.4 M9.4 14.4 L9.4 25', 0.42, 1.2)}
        {hatch('M8.4 15.4 L23.6 15.4 M8.4 20.4 L23.6 20.4 M16 11.4 L16 26', '#25272A', 0.44, 0.9)}
        <path d="M12.4 11.4 L19.6 11.4 L19.6 13.4 L12.4 13.4 Z" fill={mat(id, 'fer')} opacity="0.85" />
      </>
    ),
  },
  lanterne: {
    mats: ['fer', 'braise'],
    radial: ['braise'],
    draw: (id) => (
      <>
        <path d="M12.4 3.4 Q16 1.4 19.6 3.4" fill="none" stroke={mat(id, 'fer')} strokeWidth="1.4" />
        <path d="M9.4 6.4 L22.6 6.4 L21.4 9.4 L10.6 9.4 Z" fill={mat(id, 'fer')} {...contour('fer', 0.95)} />
        <path d="M10.6 9.4 L21.4 9.4 L22.6 24.4 L9.4 24.4 Z" fill={mat(id, 'fer')} fillOpacity="0.35" {...contour('fer', 1.05)} />
        <path d="M12.4 11.4 L19.6 11.4 L20.4 22.4 L11.6 22.4 Z" fill={matR(id, 'braise')} />
        <path d="M16 14.4 Q18 17.4 18 19.4 Q18 21.4 16 21.4 Q14 21.4 14 19.4 Q14 17.4 16 14.4 Z" fill="#FFE9C2" fillOpacity="0.75" />
        <path d="M9.4 24.4 L22.6 24.4 L22.6 27.4 L9.4 27.4 Z" fill={mat(id, 'fer')} {...contour('fer', 0.95)} />
        {hatch('M16 9.4 L16 24.4', '#31363B', 0.5, 0.9)}
      </>
    ),
  },
  echarpe: {
    mats: ['brume', 'or'],
    draw: (id) => (
      <>
        <path d="M4.4 9.4 Q11.4 6.4 16 10.4 Q20.6 14.4 27.6 11.4 L27.6 16.4 Q20.6 19.4 16 15.4 Q11.4 11.4 4.4 14.4 Z" fill={mat(id, 'brume')} fillOpacity="0.85" {...contour('brume', 1.05)} />
        <path d="M18.4 16.4 Q20.6 21.4 18.4 26.4 L14.4 26.4 Q16.4 21.4 14.4 15.4 Z" fill={mat(id, 'brume')} fillOpacity="0.7" {...contour('brume', 0.95)} />
        {keyLight('M5.4 10.4 Q11 8.4 15 11.4', 0.46, 1.2)}
        {hatch('M8.4 9.4 L8.4 13.4 M12 10.4 L12 14 M20.6 13.4 L20.6 17 M24 12.4 L24 16', '#4B5E6D', 0.36, 0.8)}
        <path d="M16.4 27.4 a1.5 1.5 0 1 0 0.1 0 Z" fill={mat(id, 'or')} opacity="0.7" />
      </>
    ),
  },
  collier: {
    mats: ['or', 'brume'],
    radial: ['brume'],
    draw: (id) => (
      <>
        <path d="M6.4 7.4 Q6.4 20.4 16 20.4 Q25.6 20.4 25.6 7.4" fill="none" stroke={mat(id, 'or')} strokeWidth="2" strokeLinecap="round" />
        <path d="M9.4 14.4 a1.2 1.2 0 1 0 0.1 0 Z M12.4 17.4 a1.2 1.2 0 1 0 0.1 0 Z M19.6 17.4 a1.2 1.2 0 1 0 0.1 0 Z M22.6 14.4 a1.2 1.2 0 1 0 0.1 0 Z" fill={mat(id, 'or')} />
        <path d="M16 19.4 L20.4 23.4 L16 28.4 L11.6 23.4 Z" fill={matR(id, 'brume')} {...contour('brume', 1)} />
        {keyLight('M13.4 22.4 L16 20.4', 0.5, 1)}
        <path d="M16 22.4 L18 24 L16 26 L14 24 Z" fill="#FFE9C2" fillOpacity="0.5" />
      </>
    ),
  },
  carte: {
    mats: ['parchemin', 'grenat'],
    draw: (id) => (
      <>
        <path d="M4.4 8.4 L11.4 6.4 L20.6 9.4 L27.6 7.4 L27.6 23.4 L20.6 25.4 L11.4 22.4 L4.4 24.4 Z" fill={mat(id, 'parchemin')} {...contour('parchemin', 1.05)} />
        <path d="M11.4 6.4 L11.4 22.4 M20.6 9.4 L20.6 25.4" fill="none" stroke="#B6A682" strokeOpacity="0.7" strokeWidth="0.9" />
        {keyLight('M5.4 9.4 L10.4 7.8', 0.44, 1)}
        <path d="M6.4 20.4 Q10.4 14.4 15.4 15.4 Q20.4 16.4 25.4 10.4" fill="none" stroke={mat(id, 'grenat')} strokeWidth="1.2" strokeDasharray="2.2 1.6" strokeLinecap="round" />
        <path d="M24.4 9.4 a1.4 1.4 0 1 0 0.1 0 Z" fill={mat(id, 'grenat')} />
      </>
    ),
  },
  heaume: {
    mats: ['acier', 'grenat'],
    draw: (id) => (
      <>
        <path d="M8.4 26.4 Q6.4 14.4 11.4 8.4 Q16 3.4 20.6 8.4 Q25.6 14.4 23.6 26.4 Z" fill={mat(id, 'acier')} {...contour('acier', 1.1)} />
        {keyLight('M10.4 24.4 Q9.4 14.4 13.4 9.4', 0.48, 1.3)}
        <path d="M8.6 14.4 L23.4 14.4 L23.4 17.4 L8.6 17.4 Z" fill="#3F474F" fillOpacity="0.75" />
        <path d="M15.2 8.4 L16.8 8.4 L16.8 26.4 L15.2 26.4 Z" fill="#3F474F" fillOpacity="0.55" />
        {hatch('M11.4 19.4 L11.4 25.4 M16 19.4 L16 25.4 M20.6 19.4 L20.6 25.4', '#3F474F', 0.42, 0.9)}
        <path d="M14.4 2.4 L17.6 2.4 L18.4 6.4 L13.6 6.4 Z" fill={mat(id, 'grenat')} {...contour('grenat', 0.85)} />
      </>
    ),
  },
  couronne: {
    mats: ['or', 'grenat'],
    radial: ['grenat'],
    draw: (id) => (
      <>
        <path d="M5.4 24.4 L4.4 8.4 L9.4 14.4 L12.6 5.4 L16 12.4 L19.4 5.4 L22.6 14.4 L27.6 8.4 L26.6 24.4 Z" fill={mat(id, 'or')} {...contour('or', 1.1)} />
        {keyLight('M6.4 10.4 L6.8 22.4 M12.8 7.4 L11.4 15.4', 0.5, 1.3)}
        {coolShade('M25.6 10.4 L25.2 22.4', 0.3, 1.2)}
        <path d="M4.8 20.4 L27.2 20.4 L27.2 23.4 L4.8 23.4 Z" fill="#9E7C1B" fillOpacity="0.6" />
        <path d="M16 15.4 a2 2 0 1 0 0.1 0 Z" fill={matR(id, 'grenat')} {...contour('grenat', 0.8)} />
        <path d="M9.4 17.4 a1.4 1.4 0 1 0 0.1 0 Z M22.6 17.4 a1.4 1.4 0 1 0 0.1 0 Z" fill={matR(id, 'grenat')} opacity="0.9" />
      </>
    ),
  },
  calice: {
    mats: ['or', 'eau'],
    radial: ['eau'],
    draw: (id) => (
      <>
        <path d="M9.4 6.4 L22.6 6.4 Q22.6 15.4 16 17.4 Q9.4 15.4 9.4 6.4 Z" fill={mat(id, 'or')} {...contour('or', 1.05)} />
        <path d="M10.6 7.6 L21.4 7.6 Q21.4 12.4 16 14 Q10.6 12.4 10.6 7.6 Z" fill={matR(id, 'eau')} opacity="0.75" />
        {keyLight('M11 8.4 Q11.4 13.4 15.4 15.6', 0.46, 1.2)}
        <path d="M15.2 17.4 L16.8 17.4 L16.8 23.4 L15.2 23.4 Z" fill={mat(id, 'or')} />
        <path d="M14 19.4 a2 2 0 1 0 0.1 0 Z" fill={mat(id, 'or')} />
        <path d="M9.4 23.4 L22.6 23.4 Q22.6 26.4 16 26.4 Q9.4 26.4 9.4 23.4 Z" fill={mat(id, 'or')} {...contour('or', 0.95)} />
      </>
    ),
  },
  escarboucle: {
    mats: ['sang', 'or'],
    radial: ['sang'],
    draw: (id) => (
      <>
        <path d="M16 4.4 L24.6 10.4 L21.6 22.4 L10.4 22.4 L7.4 10.4 Z" fill={matR(id, 'sang')} {...contour('sang', 1.1)} />
        <path d="M16 4.4 L21.6 22.4 M16 4.4 L10.4 22.4 M7.4 10.4 L21.6 22.4 M24.6 10.4 L10.4 22.4 M7.4 10.4 L24.6 10.4" fill="none" stroke="#FFE9C2" strokeOpacity="0.32" strokeWidth="0.8" />
        {keyLight('M9.4 10.4 L15.4 5.4', 0.5, 1.2)}
        <path d="M16 8.4 L19.4 11.4 L18 16.4 L14 16.4 L12.6 11.4 Z" fill="#FFE9C2" fillOpacity="0.28" />
        <path d="M8.4 25.4 L23.6 25.4 L22.6 27.4 L9.4 27.4 Z" fill={mat(id, 'or')} {...contour('or', 0.85)} />
      </>
    ),
  },
  sceptre: {
    mats: ['or', 'grenat'],
    radial: ['grenat'],
    draw: (id) => (
      <>
        <path d="M14.6 11.4 L17.4 11.4 L16.6 28.4 L15.4 28.4 Z" fill={mat(id, 'or')} {...contour('or', 0.95)} />
        {hatch('M14.8 16.4 L17.2 16.4 M14.8 21.4 L17.1 21.4', '#7A6116', 0.42, 0.8)}
        <path d="M10.4 9.4 L21.6 9.4 L21.6 12.4 L10.4 12.4 Z" fill={mat(id, 'or')} {...contour('or', 0.9)} />
        <path d="M16 2.4 L21.4 6.4 L19.4 10.4 L12.6 10.4 L10.6 6.4 Z" fill={matR(id, 'grenat')} {...contour('grenat', 1.05)} />
        {keyLight('M12 6.4 L15.4 3.4', 0.5, 1.1)}
        <path d="M16 5.4 L18 7.4 L16 9 L14 7.4 Z" fill="#FFE9C2" fillOpacity="0.35" />
      </>
    ),
  },
  ramure: {
    mats: ['os', 'feuille'],
    draw: (id) => (
      <>
        <path d="M14.4 27.4 L14.4 18.4 Q10.4 16.4 8.4 11.4 Q6.4 6.4 4.4 4.4 M14.4 18.4 Q11.4 14.4 6.4 13.4 M14.4 21.4 Q10.4 20.4 7.4 21.4 M13.4 13.4 Q10.4 9.4 9.4 4.4" fill="none" stroke={mat(id, 'os')} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M17.6 27.4 L17.6 18.4 Q21.6 16.4 23.6 11.4 Q25.6 6.4 27.6 4.4 M17.6 18.4 Q20.6 14.4 25.6 13.4 M17.6 21.4 Q21.6 20.4 24.6 21.4 M18.6 13.4 Q21.6 9.4 22.6 4.4" fill="none" stroke={mat(id, 'os')} strokeWidth="1.8" strokeLinecap="round" />
        <path d="M13.4 26.4 L18.6 26.4 L18.6 29.4 L13.4 29.4 Z" fill={mat(id, 'feuille')} {...contour('feuille', 0.85)} />
        {keyLight('M6.4 6.4 Q9.4 10.4 12.4 14.4', 0.42, 0.9)}
      </>
    ),
  },
  pierreLevee: {
    mats: ['pierre', 'feuille'],
    draw: (id) => (
      <>
        <path d="M11.4 5.4 Q16 3.4 20.6 5.4 L23.6 25.4 Q16 27.4 8.4 25.4 Z" fill={mat(id, 'pierre')} {...contour('pierre', 1.1)} />
        {keyLight('M12.4 6.4 L10.4 24.4', 0.48, 1.3)}
        {coolShade('M20.6 7.4 L22.4 24.4', 0.3, 1.2)}
        {hatch('M15.4 8.4 L15.8 23.4 M18.4 10.4 L19 22.4', '#25272A', 0.34, 0.8)}
        <path d="M16 11.4 L18.4 14.4 L16 17.4 L13.6 14.4 Z" fill="#C9A227" fillOpacity="0.5" />
        <path d="M7.4 27.4 Q11.4 24.4 14.4 26.4 Q11.4 29 7.4 27.4 Z" fill={mat(id, 'feuille')} opacity="0.8" />
      </>
    ),
  },
  clefTresor: {
    mats: ['or', 'fer'],
    draw: (id) => (
      <>
        <path d="M15.4 5.4 L17.6 5.4 L17.6 22.4 L20.6 22.4 L20.6 24.4 L17.6 24.4 L17.6 26.4 L21.4 26.4 L21.4 28.6 L15.4 28.6 Z" fill={mat(id, 'or')} {...contour('or', 1.05)} />
        <path d="M16.4 2.4 C20.4 2.4 23.6 5.6 23.6 9.6 C23.6 13.6 20.4 16.8 16.4 16.8 C12.4 16.8 9.2 13.6 9.2 9.6 C9.2 5.6 12.4 2.4 16.4 2.4 Z M16.4 6.4 C14.6 6.4 13.2 7.8 13.2 9.6 C13.2 11.4 14.6 12.8 16.4 12.8 C18.2 12.8 19.6 11.4 19.6 9.6 C19.6 7.8 18.2 6.4 16.4 6.4 Z" fill={mat(id, 'or')} {...contour('or', 1.05)} />
        {keyLight('M11.4 6.4 A7.2 7.2 0 0 1 16.4 3.6', 0.5, 1.2)}
        <path d="M9.4 8.4 L12.4 8.4 M20.4 8.4 L23.4 8.4" stroke={mat(id, 'fer')} strokeWidth="1.2" />
      </>
    ),
  },
  serre: {
    mats: ['os', 'acier'],
    draw: (id) => (
      <>
        <path d="M14.4 4.4 L18.6 4.4 L19.4 13.4 Q22.6 15.4 22.6 20.4 Q22.6 26.4 16 27.4 Q9.4 26.4 9.4 20.4 Q9.4 15.4 12.6 13.4 Z" fill={mat(id, 'os')} {...contour('os', 1.05)} />
        {keyLight('M13.4 6.4 L12.4 14.4 Q10.4 17.4 11 21.4', 0.46, 1.2)}
        <path d="M9.4 21.4 Q5.4 24.4 4.4 28.6 Q8.4 26.4 10.6 24.4 Z M22.6 21.4 Q26.6 24.4 27.6 28.6 Q23.6 26.4 21.4 24.4 Z M16 27.4 Q16 30.4 16 31.4 Q14.4 29.4 14.4 26.4 Z" fill={mat(id, 'acier')} {...contour('acier', 0.95)} />
        {hatch('M13.4 17.4 L18.6 17.4 M13 21.4 L19 21.4', '#A2947A', 0.42, 0.8)}
      </>
    ),
  },
  manteau: {
    mats: ['brume', 'or'],
    draw: (id) => (
      <>
        <path d="M11.4 5.4 Q16 3.4 20.6 5.4 Q26.6 8.4 26.6 27.4 L5.4 27.4 Q5.4 8.4 11.4 5.4 Z" fill={mat(id, 'brume')} fillOpacity="0.9" {...contour('brume', 1.1)} />
        {keyLight('M10.4 7.4 Q7.4 12.4 7.4 26.4', 0.44, 1.3)}
        {coolShade('M21.6 7.4 Q24.6 12.4 24.6 26.4', 0.3, 1.2)}
        {hatch('M12.4 10.4 L11.4 26.4 M16 9.4 L16 26.6 M19.6 10.4 L20.6 26.4', '#4B5E6D', 0.4, 0.9)}
        <path d="M11.4 5.4 Q16 8.4 20.6 5.4 L20.6 8.4 Q16 11.4 11.4 8.4 Z" fill={mat(id, 'or')} opacity="0.75" />
      </>
    ),
  },
  etendard: {
    mats: ['grenat', 'or', 'bois'],
    draw: (id) => (
      <>
        <path d="M15.2 3.4 L16.8 3.4 L16.8 29.4 L15.2 29.4 Z" fill={mat(id, 'bois')} {...contour('bois', 0.85)} />
        <path d="M16.8 5.4 L26.6 5.4 L26.6 21.4 L21.6 18.4 L16.8 21.4 Z" fill={mat(id, 'grenat')} {...contour('grenat', 1.05)} />
        <path d="M5.4 5.4 L15.2 5.4 L15.2 21.4 L10.4 18.4 L5.4 21.4 Z" fill={mat(id, 'grenat')} opacity="0.88" {...contour('grenat', 1)} />
        {keyLight('M6.4 6.6 L14.2 6.6', 0.4, 1.1)}
        <path d="M10.4 9.4 L12.4 12.4 L10.4 15.4 L8.4 12.4 Z M21.6 9.4 L23.6 12.4 L21.6 15.4 L19.6 12.4 Z" fill={mat(id, 'or')} {...contour('or', 0.8)} />
        <path d="M15.4 1.4 L16.6 1.4 L16.6 4.4 L15.4 4.4 Z" fill={mat(id, 'or')} />
      </>
    ),
  },
  haubert: {
    mats: ['fer', 'pierre'],
    draw: (id) => (
      <>
        <path d="M10.4 6.4 L16 9.4 L21.6 6.4 L26.4 10.4 L24.4 15.4 L22.6 14.4 L22.6 27.4 L9.4 27.4 L9.4 14.4 L7.6 15.4 L5.6 10.4 Z" fill={mat(id, 'fer')} {...contour('fer', 1.1)} />
        {keyLight('M10.4 8.4 L7.4 11 M10.4 15.4 L10.4 26.4', 0.42, 1.2)}
        <path d="M11 16.4 a1 1 0 1 0 0.1 0 Z M14 16.4 a1 1 0 1 0 0.1 0 Z M17 16.4 a1 1 0 1 0 0.1 0 Z M20 16.4 a1 1 0 1 0 0.1 0 Z M12.5 19 a1 1 0 1 0 0.1 0 Z M15.5 19 a1 1 0 1 0 0.1 0 Z M18.5 19 a1 1 0 1 0 0.1 0 Z M11 21.6 a1 1 0 1 0 0.1 0 Z M14 21.6 a1 1 0 1 0 0.1 0 Z M17 21.6 a1 1 0 1 0 0.1 0 Z M20 21.6 a1 1 0 1 0 0.1 0 Z M12.5 24.2 a1 1 0 1 0 0.1 0 Z M15.5 24.2 a1 1 0 1 0 0.1 0 Z M18.5 24.2 a1 1 0 1 0 0.1 0 Z" fill={mat(id, 'pierre')} opacity="0.8" />
      </>
    ),
  },
};

/* ─────────────────── Table des cinquante-trois artefacts ────────────────── */

interface Row {
  glyph: keyof typeof G;
  rarity: Rarity;
  /** cabochon propre à la pièce — c'est lui qui distingue deux objets de même nature */
  gem: string;
}

const ROWS: Readonly<Record<string, Row>> = {
  /* Communs (16) */
  chausses_du_colporteur: { glyph: 'chausses', rarity: 'commun', gem: '#6B5433' },
  lorgnette_de_belvedere: { glyph: 'lorgnette', rarity: 'commun', gem: '#8FA6B8' },
  ceinture_de_peage: { glyph: 'ceinture', rarity: 'commun', gem: '#C08A3E' },
  bourdon_de_pelerin: { glyph: 'bourdon', rarity: 'commun', gem: '#D8CEB4' },
  mitaines_de_brodeuse: { glyph: 'mitaines', rarity: 'commun', gem: '#C9A227' },
  capuche_de_bure: { glyph: 'capuche', rarity: 'commun', gem: '#5A4128' },
  besace_du_muletier: { glyph: 'besace', rarity: 'commun', gem: '#6B5433' },
  medaille_du_bon_chemin: { glyph: 'medaille', rarity: 'commun', gem: '#9C6438' },
  brodequins_ferres: { glyph: 'brodequins', rarity: 'commun', gem: '#5A6169' },
  jaque_de_toile: { glyph: 'jaque', rarity: 'commun', gem: '#45304C' },
  fanion_de_corvee: { glyph: 'fanion', rarity: 'commun', gem: '#A59A80' },
  anneau_de_cuivre: { glyph: 'anneau', rarity: 'commun', gem: '#9C6438' },
  couteau_de_veneur: { glyph: 'couteau', rarity: 'commun', gem: '#1E3226' },
  baton_de_cantonnier: { glyph: 'baton', rarity: 'commun', gem: '#4A4E52' },
  bonnet_de_clerc: { glyph: 'bonnet', rarity: 'commun', gem: '#2B3A4A' },
  gourde_des_sagnes: { glyph: 'gourde', rarity: 'commun', gem: '#4E8977' },

  /* Rares (17) */
  gantelets_des_farges: { glyph: 'gantelet', rarity: 'rare', gem: '#B4491F' },
  anneau_des_sources: { glyph: 'anneau', rarity: 'rare', gem: '#4E8977' },
  anneau_de_fortune: { glyph: 'anneau', rarity: 'rare', gem: '#C9A227' },
  banniere_grenat: { glyph: 'banniere', rarity: 'rare', gem: '#6E1F2A' },
  cor_de_veneur: { glyph: 'cor', rarity: 'rare', gem: '#4A6138' },
  ceinture_du_gabelou: { glyph: 'ceinture', rarity: 'rare', gem: '#D8CEB4' },
  chapeau_cire_du_gabelou: { glyph: 'chapeauCire', rarity: 'rare', gem: '#2B3A4A' },
  bottes_du_chemin_de_sel: { glyph: 'brodequins', rarity: 'rare', gem: '#D8CEB4' },
  sifflet_de_la_halle: { glyph: 'sifflet', rarity: 'rare', gem: '#7C8794' },
  des_a_coudre_dacier: { glyph: 'desACoudre', rarity: 'rare', gem: '#CBD4DD' },
  corsage_brode_de_grenades: { glyph: 'corsage', rarity: 'rare', gem: '#8C2230' },
  banniere_aux_grenades_dor: { glyph: 'banniere', rarity: 'rare', gem: '#C9A227' },
  plastron_dardoise: { glyph: 'plastron', rarity: 'rare', gem: '#414A52' },
  lanterne_des_sagnes: { glyph: 'lanterne', rarity: 'rare', gem: '#C08A3E' },
  anneau_du_carrier: { glyph: 'anneau', rarity: 'rare', gem: '#4A4E52' },
  echarpe_de_brume: { glyph: 'echarpe', rarity: 'rare', gem: '#9FB4C2' },
  collier_de_brume: { glyph: 'collier', rarity: 'rare', gem: '#8FA6B8' },

  /* Majeurs (12) */
  haubert_dardoise: { glyph: 'haubert', rarity: 'majeur', gem: '#414A52' },
  carte_du_senechal: { glyph: 'carte', rarity: 'majeur', gem: '#6E1F2A' },
  heaume_du_banneret: { glyph: 'heaume', rarity: 'majeur', gem: '#8C2230' },
  gantelet_du_forgeron: { glyph: 'gantelet', rarity: 'majeur', gem: '#C08A3E' },
  anneau_de_la_futaie: { glyph: 'anneau', rarity: 'majeur', gem: '#4A6138' },
  ceinture_aux_douze_bourses: { glyph: 'ceinture', rarity: 'majeur', gem: '#B8891F' },
  bottes_de_sept_layons: { glyph: 'brodequins', rarity: 'majeur', gem: '#2F6B45' },
  etendard_du_serment: { glyph: 'etendard', rarity: 'majeur', gem: '#C9A227' },
  calice_de_lhermitage: { glyph: 'calice', rarity: 'majeur', gem: '#4E8977' },
  couronne_comtale_de_forez: { glyph: 'couronne', rarity: 'majeur', gem: '#6E1F2A' },
  collier_des_serments: { glyph: 'collier', rarity: 'majeur', gem: '#C9A227' },
  anneau_du_grand_livre: { glyph: 'anneau', rarity: 'majeur', gem: '#E8DCC0' },

  /* Reliques (8) */
  escarboucle_de_vouivre: { glyph: 'escarboucle', rarity: 'relique', gem: '#8C2230' },
  sceptre_des_comtes: { glyph: 'sceptre', rarity: 'relique', gem: '#C9A227' },
  ramure_du_cerf_miraculeux: { glyph: 'ramure', rarity: 'relique', gem: '#4A6138' },
  pierre_de_pamole: { glyph: 'pierreLevee', rarity: 'relique', gem: '#8FA6B8' },
  clef_de_la_maison_du_tresor: { glyph: 'clefTresor', rarity: 'relique', gem: '#C08A3E' },
  serre_du_griffon_couronne: { glyph: 'serre', rarity: 'relique', gem: '#EDE3CE' },
  manteau_de_la_dame_des_brumes: { glyph: 'manteau', rarity: 'relique', gem: '#5B3A6E' },
  bourdon_du_premier_pelerin: { glyph: 'bourdon', rarity: 'relique', gem: '#FFE9C2' },
};

function buildArtifactIcons(): Record<string, IconComponent> {
  const out: Record<string, IconComponent> = {};
  let seed = 401;
  for (const [id, row] of Object.entries(ROWS)) {
    out[id] = artifactIcon(G[row.glyph], row.rarity, row.gem, seed);
    seed += 1;
  }
  return out;
}

/** Registre des cinquante-trois artefacts, clef `artefact_<id>`. */
export const ARTIFACT_ICONS: Readonly<Record<string, IconComponent>> = buildArtifactIcons();

/** Rareté de chaque artefact, pour colorer les libellés de la galerie. */
export const ARTIFACT_RARITY: Readonly<Record<string, Rarity>> = Object.fromEntries(
  Object.entries(ROWS).map(([id, row]) => [id, row.rarity]),
);

/** Nombre de glyphes distincts employés — utile pour la revue. */
export const ARTIFACT_GLYPH_COUNT = Object.keys(G).length;
