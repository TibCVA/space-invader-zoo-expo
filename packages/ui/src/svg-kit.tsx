/**
 * Boîte à outils SVG partagée — matières, éclairage, grain.
 *
 * Tout le dessin du jeu (icônes, blasons, portraits) passe par ces primitives,
 * ce qui garantit mécaniquement le respect des sept lois du rendu :
 *
 *  1. jamais d'aplat        → chaque matière est un dégradé à trois arrêts,
 *                             doublé d'un grain et d'un modelé ;
 *  2. une seule lumière     → tous les dégradés descendent du nord-ouest vers
 *                             le sud-est (`x1=0 y1=0 → x2=1 y2=1`) ;
 *  3. chaud / froid         → les hautes lumières tirent vers `#FFE9C2`, les
 *                             ombres vers `#3A4657` ;
 *  4. rim light             → le filtre `lit` pose un liseré `#C9A227` à 40 %
 *                             sur le flanc sud-est de chaque silhouette ;
 *  5. perspective aérienne  → `aerial()` de `tokens.ts` ;
 *  6. aucun contour noir    → `shade()` teinte le contour à partir de la
 *                             couleur locale ;
 *  7. mouvement discret     → classes `hmm-respire`, `hmm-derive`.
 */

import { useId } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx, light } from './tokens.js';

/* ────────────────────────────── Identifiants ────────────────────────────── */

/** Identifiant stable et valide pour les `id` SVG d'une instance. */
export function useSvgId(prefix: string): string {
  const raw = useId();
  return `${prefix}${raw.replace(/[^a-zA-Z0-9]/g, '')}`;
}

/* ─────────────────────────────── Matières ───────────────────────────────── */

export type MaterialKey =
  | 'or'
  | 'orClair'
  | 'acier'
  | 'fer'
  | 'bois'
  | 'pierre'
  | 'parchemin'
  | 'ivoire'
  | 'feuille'
  | 'sapin'
  | 'cuir'
  | 'grenat'
  | 'braise'
  | 'eau'
  | 'brume'
  | 'cuivre'
  | 'sel'
  | 'etoffe'
  | 'pourpre'
  | 'encre'
  | 'os'
  | 'sang';

/** Rampe à trois valeurs : haute lumière, teinte locale, ombre. */
export const MATERIALS: Readonly<Record<MaterialKey, [string, string, string]>> = {
  or: ['#F3DEA0', '#C9A227', '#7A6116'],
  orClair: ['#FFF3CE', '#E3C55C', '#A8861F'],
  acier: ['#CBD4DD', '#7C8794', '#3F474F'],
  fer: ['#9AA3AC', '#5A6169', '#31363B'],
  bois: ['#AC8759', '#6B5433', '#3A2C1A'],
  pierre: ['#828A90', '#4A4E52', '#25272A'],
  parchemin: ['#F5EBD2', '#E8DCC0', '#B6A682'],
  ivoire: ['#F8F0DE', '#EDE3CE', '#BCAE97'],
  feuille: ['#86A05F', '#4A6138', '#26351F'],
  sapin: ['#4F6C53', '#1E3226', '#111E17'],
  cuir: ['#8E6C43', '#5A4128', '#2E2010'],
  grenat: ['#AC4A54', '#6E1F2A', '#3A0E15'],
  braise: ['#FFC873', '#B4491F', '#5A1D0B'],
  eau: ['#ABD5D0', '#4E8977', '#22463E'],
  brume: ['#DAE5EC', '#8FA6B8', '#4B5E6D'],
  cuivre: ['#DDAB7E', '#9C6438', '#4C2E18'],
  sel: ['#F6F0DE', '#D8CEB4', '#A59A80'],
  etoffe: ['#7A6580', '#45304C', '#241929'],
  pourpre: ['#8E6099', '#5B3A6E', '#2E1B39'],
  encre: ['#4C3C2C', '#241C14', '#140E09'],
  os: ['#F2E7D0', '#D8CAAB', '#A2947A'],
  sang: ['#B5525C', '#8C2230', '#48111A'],
};

/**
 * Dégradés des matières demandées. Les identifiants produits sont
 * `${id}-${clef}` et `${id}-${clef}-r` (variante radiale, pour les gemmes).
 */
export function Materials(props: {
  id: string;
  keys: readonly MaterialKey[];
  radial?: readonly MaterialKey[];
}): ReactElement {
  const { id, keys, radial = [] } = props;
  return (
    <>
      {keys.map((k) => {
        const [hi, base, lo] = MATERIALS[k];
        return (
          <linearGradient key={k} id={`${id}-${k}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor={hi} />
            <stop offset="0.44" stopColor={base} />
            <stop offset="1" stopColor={lo} />
          </linearGradient>
        );
      })}
      {radial.map((k) => {
        const [hi, base, lo] = MATERIALS[k];
        return (
          <radialGradient key={`${k}-r`} id={`${id}-${k}-r`} cx="0.34" cy="0.3" r="0.82">
            <stop offset="0" stopColor={hi} />
            <stop offset="0.42" stopColor={base} />
            <stop offset="1" stopColor={lo} />
          </radialGradient>
        );
      })}
    </>
  );
}

/** Référence d'une matière (dégradé linéaire). */
export function mat(id: string, key: MaterialKey): string {
  return `url(#${id}-${key})`;
}

/** Référence d'une matière en dégradé radial (gemme, sphère, œil). */
export function matR(id: string, key: MaterialKey): string {
  return `url(#${id}-${key}-r)`;
}

/** Teinte locale d'une matière, utile pour un contour teinté (loi n°6). */
export function matInk(key: MaterialKey): string {
  return MATERIALS[key][2];
}

/* ──────────────────────────────── Éclairage ─────────────────────────────── */

/**
 * Filtre d'éclairage unique : bande chaude au nord-ouest, liseré doré au
 * sud-est. Deux lois d'un coup (n°3 et n°4) sur n'importe quelle silhouette.
 */
export function LightFilter(props: { id: string; strength?: number }): ReactElement {
  const { id, strength = 1 } = props;
  const d = (0.9 * strength).toFixed(2);
  return (
    <filter
      id={`${id}-lit`}
      x="-25%"
      y="-25%"
      width="150%"
      height="150%"
      colorInterpolationFilters="sRGB"
    >
      <feOffset in="SourceAlpha" dx={`-${d}`} dy={`-${d}`} result="offSE" />
      <feComposite in="SourceAlpha" in2="offSE" operator="out" result="bandSE" />
      <feFlood floodColor={light.rim} floodOpacity={light.rimOpacity} result="dore" />
      <feComposite in="dore" in2="bandSE" operator="in" result="rim" />
      <feOffset in="SourceAlpha" dx={d} dy={d} result="offNW" />
      <feComposite in="SourceAlpha" in2="offNW" operator="out" result="bandNW" />
      <feFlood floodColor={light.chaude} floodOpacity="0.34" result="chaud" />
      <feComposite in="chaud" in2="bandNW" operator="in" result="cle" />
      <feMerge>
        <feMergeNode in="SourceGraphic" />
        <feMergeNode in="cle" />
        <feMergeNode in="rim" />
      </feMerge>
    </filter>
  );
}

/** Ombre portée bleutée, décalée au sud-est. Jamais de noir, jamais de gris. */
export function DropShadowFilter(props: { id: string; blur?: number; dy?: number }): ReactElement {
  const { id, blur = 0.9, dy = 0.9 } = props;
  return (
    <filter
      id={`${id}-ombre`}
      x="-40%"
      y="-40%"
      width="180%"
      height="180%"
      colorInterpolationFilters="sRGB"
    >
      <feDropShadow
        dx={dy}
        dy={dy}
        stdDeviation={blur}
        floodColor={light.portee}
        floodOpacity="0.32"
      />
    </filter>
  );
}

/** Grain de matière : la troisième strate exigée par la loi n°1. */
export function GrainFilter(props: {
  id: string;
  frequency?: number;
  octaves?: number;
  seed?: number;
  slope?: number;
}): ReactElement {
  const { id, frequency = 0.86, octaves = 2, seed = 11, slope = 0.16 } = props;
  return (
    <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
      <feTurbulence
        type="fractalNoise"
        baseFrequency={frequency}
        numOctaves={octaves}
        seed={seed}
        result="bruit"
      />
      <feColorMatrix in="bruit" type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncA type="linear" slope={slope} intercept="0" />
      </feComponentTransfer>
    </filter>
  );
}

/** Flou doux pour l'occlusion ambiante et la brume de fond. */
export function BlurFilter(props: { id: string; amount?: number }): ReactElement {
  const { id, amount = 1.6 } = props;
  return (
    <filter id={`${id}-flou`} x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation={amount} />
    </filter>
  );
}

/* ───────────────────────────── Voile de grain ───────────────────────────── */

/**
 * Voile de grain à poser en dernier sur une composition, en `overlay`.
 * `clip` limite le voile à une forme déjà définie.
 */
export function GrainVeil(props: {
  id: string;
  width: number;
  height: number;
  opacity?: number;
  clip?: string;
  /** mode de fusion ; `soft-light` reste discret sur une peinture */
  blend?: 'overlay' | 'soft-light' | 'multiply';
}): ReactElement {
  const { id, width, height, opacity = 0.14, clip, blend = 'overlay' } = props;
  const style: CSSProperties = { mixBlendMode: blend };
  return (
    <rect
      x="0"
      y="0"
      width={width}
      height={height}
      filter={`url(#${id}-grain)`}
      opacity={opacity}
      clipPath={clip}
      style={style}
      pointerEvents="none"
    />
  );
}

/* ─────────────────────────── Enveloppe de dessin ────────────────────────── */

export interface DrawingProps {
  /** côté du carré rendu, en pixels CSS */
  size?: number;
  /** libellé accessible, en français ; absent = décoratif */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/**
 * Racine SVG commune. `role="img"` et `<title>` quand un libellé est fourni,
 * `aria-hidden` sinon : une icône décorative ne doit pas polluer le lecteur
 * d'écran.
 */
export function Drawing(props: DrawingProps & {
  viewBox: string;
  width?: number;
  height?: number;
  children: ReactNode;
}): ReactElement {
  const { size = 24, width, height, title, className, style, viewBox, children } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={viewBox}
      width={width ?? size}
      height={height ?? size}
      className={cx('hmm-dessin', className)}
      style={style}
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}
