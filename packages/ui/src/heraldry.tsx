/**
 * Héraldique — blasons des deux factions, bannières des cinq joueurs,
 * cadres d'enluminure.
 *
 * Le cadre d'enluminure suit la bible artistique §7 : filet doré double,
 * écoinçons feuillagés, cartouche de nom en Cinzel. Il sert aux portraits, aux
 * panneaux de codex et aux cartes d'objet.
 */

import type { ReactElement, ReactNode } from 'react';
import {
  Drawing,
  GrainFilter,
  GrainVeil,
  LightFilter,
  Materials,
  mat,
  matR,
  useSvgId,
} from './svg-kit.js';
import type { DrawingProps } from './svg-kit.js';
import { banners, cx, factionPalette } from './tokens.js';
import type { BannerPattern, FactionKey } from './tokens.js';

/* ───────────────────────── Cadre d'enluminure ───────────────────────────── */

export interface IlluminationBorderProps {
  /** préfixe d'identifiants de l'instance appelante */
  id: string;
  width: number;
  height: number;
  /** nom porté par le cartouche du bas, en capitales Cinzel */
  name?: string;
  /** teinte du filet : or ancien par défaut, cuivre pour l'Ermitage */
  tone?: 'or' | 'cuivre';
  /** épaisseur du filet extérieur */
  weight?: number;
}

/**
 * Bordure d'enluminure à poser **dans** un `<svg>` existant.
 * Trois strates : filet extérieur, filet intérieur, écoinçons feuillagés.
 */
export function IlluminationBorder(props: IlluminationBorderProps): ReactElement {
  const { id, width: w, height: h, name, tone = 'or', weight = 2.2 } = props;
  const gold = mat(id, tone === 'or' ? 'or' : 'cuivre');
  const inset = weight + 3.4;
  const leaf = (x: number, y: number, sx: number, sy: number): ReactElement => (
    <g transform={`translate(${x} ${y}) scale(${sx} ${sy})`} key={`${x}-${y}`}>
      <path
        d="M0 0 L16 0 Q16 3.2 12.4 4 Q8.4 4.8 6.4 8.4 Q4.8 11.6 4 15.4 Q0.8 15.4 0 12.4 Z"
        fill={gold}
        opacity="0.9"
      />
      <path
        d="M4.4 3.4 Q9.4 3.4 11.4 6.4 Q8 6.4 6.4 8.8 Q4.6 11.4 4.4 14 Q2.6 11.4 3 7.4 Q3.2 5 4.4 3.4 Z"
        fill="#FFE9C2"
        fillOpacity="0.32"
      />
      <path
        d="M13.4 1.6 Q17.4 3.4 18.4 7.4 Q15.4 6.4 13.6 4.4 Z"
        fill={gold}
        opacity="0.62"
      />
    </g>
  );
  return (
    <g>
      <rect
        x={weight / 2}
        y={weight / 2}
        width={w - weight}
        height={h - weight}
        fill="none"
        stroke={gold}
        strokeWidth={weight}
        rx="2"
      />
      <rect
        x={inset}
        y={inset}
        width={w - inset * 2}
        height={h - inset * 2}
        fill="none"
        stroke={gold}
        strokeWidth="0.9"
        opacity="0.8"
        rx="1.5"
      />
      <rect
        x={weight * 1.6}
        y={weight * 1.6}
        width={w - weight * 3.2}
        height={h - weight * 3.2}
        fill="none"
        stroke="#FFE9C2"
        strokeOpacity="0.16"
        strokeWidth="0.8"
      />
      {leaf(inset + 1, inset + 1, 1, 1)}
      {leaf(w - inset - 1, inset + 1, -1, 1)}
      {leaf(inset + 1, h - inset - 1, 1, -1)}
      {leaf(w - inset - 1, h - inset - 1, -1, -1)}
      {name ? (
        <g>
          <path
            d={`M${w * 0.16} ${h - inset - 20} H${w * 0.84} L${w * 0.88} ${h - inset - 10} L${w * 0.84} ${h - inset} H${w * 0.16} L${w * 0.12} ${h - inset - 10} Z`}
            fill="#241C14"
            fillOpacity="0.72"
            stroke={gold}
            strokeWidth="1.1"
          />
          <text
            x={w / 2}
            y={h - inset - 6}
            textAnchor="middle"
            fontFamily="Cinzel, Georgia, 'Times New Roman', serif"
            fontSize={Math.max(9, Math.round(w * 0.062))}
            fontWeight="700"
            letterSpacing={Math.max(0.8, w * 0.006)}
            fill="#EDE3CE"
          >
            {name.toUpperCase()}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/* ─────────────────────────── Blasons de faction ─────────────────────────── */

export interface BlazonProps extends DrawingProps {
  faction: FactionKey;
}

/**
 * Blason de faction : écu, meuble, devise implicite.
 *  - Châtellenie de Granit : tour de granit sur champ de grenat, chef d'or ;
 *  - Ermitage des Bois Noirs : hulotte et futaie sur champ de sinople ;
 *  - neutre : borne armoriée du Gardien des Bornes.
 */
export function FactionBlazon({ faction, size = 96, title, className, style }: BlazonProps): ReactElement {
  const id = useSvgId('bl');
  const pal = factionPalette[faction];
  const shield = 'M32 3 L59 11.4 V32 C59 47.6 47.4 56.6 32 62 C16.6 56.6 5 47.6 5 32 V11.4 Z';
  return (
    <Drawing
      viewBox="0 0 64 66"
      width={size}
      height={Math.round((size * 66) / 64)}
      title={title}
      className={cx('hmm-blason', className)}
      style={style}
    >
      <defs>
        <Materials
          id={id}
          keys={['or', 'grenat', 'pierre', 'sapin', 'feuille', 'os', 'cuivre', 'bois', 'brume']}
          radial={['grenat', 'sapin', 'or']}
        />
        <LightFilter id={id} strength={1.4} />
        <GrainFilter id={id} seed={17} frequency={0.7} slope={0.18} />
        <clipPath id={`${id}-ecu`}>
          <path d={shield} />
        </clipPath>
      </defs>
      <g filter={`url(#${id}-lit)`}>
        <path
          d={shield}
          fill={faction === 'ermitage' ? matR(id, 'sapin') : faction === 'granit' ? matR(id, 'grenat') : mat(id, 'bois')}
          stroke={pal.deep}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <g clipPath={`url(#${id}-ecu)`}>
          {faction === 'granit' ? (
            <>
              <path d="M5 11.4 L59 11.4 V21 L5 21 Z" fill={mat(id, 'or')} />
              <path d="M5 20 L59 20 V22.4 L5 22.4 Z" fill="#7A6116" fillOpacity="0.5" />
              <path d="M22 25 H42 V27.8 H22 Z" fill={mat(id, 'pierre')} stroke="#25272A" strokeWidth="0.9" />
              <path d="M22 25 V21.4 H25.4 V25 M28.8 25 V21.4 H32.2 V25 M35.6 25 V21.4 H39 V25" fill={mat(id, 'pierre')} stroke="#25272A" strokeWidth="0.8" />
              <path d="M24 27.8 H40 V56 H24 Z" fill={mat(id, 'pierre')} stroke="#25272A" strokeWidth="1.1" />
              <path d="M25.4 29 V54.6 M27 33 H37.4 M27 39 H37.4 M27 45 H37.4 M30 33 V39 M34 39 V45" stroke="#25272A" strokeOpacity="0.55" strokeWidth="0.8" fill="none" />
              <path d="M25 29 L25 55" stroke="#FFE9C2" strokeOpacity="0.34" strokeWidth="1.1" />
              <path d="M29.4 47 H34.6 V56 H29.4 Z" fill="#2E3236" stroke="#25272A" strokeWidth="0.8" />
              <path d="M14 40 L18 46 L16 46 L19.4 52 L8.6 52 L12 46 L10 46 Z" fill={mat(id, 'sapin')} opacity="0.9" />
              <path d="M50 42 L53.4 47.4 L51.6 47.4 L54.6 52.6 L45.4 52.6 L48.4 47.4 L46.6 47.4 Z" fill={mat(id, 'sapin')} opacity="0.85" />
              <path d="M31.4 13.4 L33.4 17.6 L38 18.2 L34.6 21.4 L35.4 26 L31.4 23.8 L27.4 26 L28.2 21.4 L24.8 18.2 L29.4 17.6 Z" fill={mat(id, 'grenat')} opacity="0.9" />
            </>
          ) : null}
          {faction === 'ermitage' ? (
            <>
              <path d="M5 40 Q18 34 32 40 Q46 46 59 40 V62 H5 Z" fill="#132318" opacity="0.75" />
              <path d="M12 20 L16 28 L14 28 L18.4 36 L16.4 36 L21 45 L3 45 L7.6 36 L5.6 36 L10 28 L8 28 Z" fill="#111E17" stroke="#0C1611" strokeWidth="0.8" />
              <path d="M52 22 L56 30 L54 30 L58.4 38 L56.4 38 L61 47 L43 47 L47.6 38 L45.6 38 L50 30 L48 30 Z" fill="#111E17" stroke="#0C1611" strokeWidth="0.8" />
              <path d="M32 18 Q40 18 41.6 27 Q43.4 38 32 45 Q20.6 38 22.4 27 Q24 18 32 18 Z" fill={mat(id, 'os')} stroke="#5A5140" strokeWidth="1.1" />
              <path d="M24.4 16.6 L29.4 13 L29 19.4 Z M39.6 16.6 L34.6 13 L35 19.4 Z" fill={mat(id, 'os')} stroke="#5A5140" strokeWidth="0.9" />
              <path d="M27.4 25.4 a3.4 3.4 0 1 0 0.1 0 Z M36.6 25.4 a3.4 3.4 0 1 0 0.1 0 Z" fill={matR(id, 'or')} stroke="#7A6116" strokeWidth="0.8" />
              <path d="M27.4 26.4 a1.5 1.5 0 1 0 0.1 0 Z M36.6 26.4 a1.5 1.5 0 1 0 0.1 0 Z" fill="#111E17" />
              <path d="M32 29 L34.4 32.8 L32 35.4 L29.6 32.8 Z" fill={mat(id, 'cuivre')} />
              <path d="M26 36 L28 40 L30 36 M31 37 L33 41 L35 37 M36 36 L38 40 L40 36" fill="none" stroke="#5A5140" strokeWidth="0.9" />
              <path d="M5 44 Q18 40 32 44 Q46 48 59 44" fill="none" stroke={mat(id, 'brume')} strokeWidth="3" strokeOpacity="0.5" strokeLinecap="round" />
              <path d="M5 51 Q18 47 32 51 Q46 55 59 51" fill="none" stroke={mat(id, 'brume')} strokeWidth="3.4" strokeOpacity="0.42" strokeLinecap="round" />
            </>
          ) : null}
          {faction === 'neutre' ? (
            <>
              <path d="M22 16 Q32 12 42 16 L45 52 Q32 57 19 52 Z" fill={mat(id, 'pierre')} stroke="#25272A" strokeWidth="1.2" />
              <path d="M24 18 L21.4 50" stroke="#FFE9C2" strokeOpacity="0.32" strokeWidth="1.4" />
              <path d="M32 22 L38 27 V36 C38 41 35 44 32 46 C29 44 26 41 26 36 V27 Z" fill={mat(id, 'or')} stroke="#7A6116" strokeWidth="1" />
              <path d="M32 27 L34.4 31 L32 35 L29.6 31 Z" fill={mat(id, 'grenat')} />
              <path d="M5 52 Q32 46 59 52 V62 H5 Z" fill={mat(id, 'feuille')} opacity="0.55" />
            </>
          ) : null}
          <GrainVeil id={id} width={64} height={66} opacity={0.16} />
        </g>
        <path d={shield} fill="none" stroke={mat(id, 'or')} strokeWidth="2" strokeLinejoin="round" />
        <path
          d={shield}
          fill="none"
          stroke="#FFE9C2"
          strokeOpacity="0.22"
          strokeWidth="0.9"
          transform="translate(1.1 1.1) scale(0.965) translate(0.6 0.4)"
        />
      </g>
    </Drawing>
  );
}

/* ──────────────────────── Bannières des cinq joueurs ────────────────────── */

/** Motif de bannière dessiné en SVG — l'information ne tient jamais à la teinte. */
function PatternDefs({ id, pattern, ink }: { id: string; pattern: BannerPattern; ink: string }): ReactElement {
  const common = { id: `${id}-motif`, patternUnits: 'userSpaceOnUse' as const };
  switch (pattern) {
    case 'plein':
      return (
        <pattern {...common} width="8" height="8">
          <path d="M0 0 H8 V8 H0 Z" fill={ink} fillOpacity="0.05" />
        </pattern>
      );
    case 'chevrons':
      return (
        <pattern {...common} width="10" height="10">
          <path d="M0 8 L5 3 L10 8" fill="none" stroke={ink} strokeOpacity="0.34" strokeWidth="1.9" />
          <path d="M0 13 L5 8 L10 13" fill="none" stroke={ink} strokeOpacity="0.34" strokeWidth="1.9" />
        </pattern>
      );
    case 'losanges':
      return (
        <pattern {...common} width="11" height="11">
          <path d="M5.5 0.8 L10.2 5.5 L5.5 10.2 L0.8 5.5 Z" fill="none" stroke={ink} strokeOpacity="0.36" strokeWidth="1.5" />
        </pattern>
      );
    case 'rayures':
      return (
        <pattern {...common} width="9" height="9">
          <path d="M-3 3 L3 -3 M0 9 L9 0 M6 12 L12 6" stroke={ink} strokeOpacity="0.34" strokeWidth="2.6" />
        </pattern>
      );
    case 'pois':
      return (
        <pattern {...common} width="12" height="12">
          <circle cx="3.4" cy="3.4" r="1.9" fill={ink} fillOpacity="0.36" />
          <circle cx="9.4" cy="9.4" r="1.9" fill={ink} fillOpacity="0.36" />
        </pattern>
      );
  }
}

export interface PlayerBannerProps extends DrawingProps {
  /** rang du joueur, de 1 à 5 */
  player: 1 | 2 | 3 | 4 | 5;
  /** afficher le nom de la couleur dans le cartouche */
  showLabel?: boolean;
}

/** Gonfanon d'un joueur : couleur **et** motif, hampe, pointe et frange. */
export function PlayerBanner({
  player,
  size = 72,
  title,
  className,
  style,
  showLabel = false,
}: PlayerBannerProps): ReactElement {
  const id = useSvgId('bn');
  const token = banners[player - 1] ?? banners[0];
  const color = token.color;
  return (
    <Drawing
      viewBox="0 0 48 72"
      width={size}
      height={Math.round((size * 72) / 48)}
      title={title ?? `Bannière ${token.label}`}
      className={cx('hmm-banniere-joueur', className)}
      style={style}
    >
      <defs>
        <Materials id={id} keys={['or', 'bois', 'fer']} />
        <LightFilter id={id} strength={1.2} />
        <GrainFilter id={id} seed={player * 13} frequency={0.8} slope={0.16} />
        <linearGradient id={`${id}-champ`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE9C2" stopOpacity="0.34" />
          <stop offset="0.42" stopColor={color} />
          <stop offset="1" stopColor="#2A3242" stopOpacity="0.55" />
        </linearGradient>
        <PatternDefs id={id} pattern={token.pattern} ink="#241C14" />
        <clipPath id={`${id}-drap`}>
          <path d="M9 8 H43 V48 L26 58 L9 48 Z" />
        </clipPath>
      </defs>
      <g filter={`url(#${id}-lit)`}>
        <path d="M5 3 H8 V70 H5 Z" fill={mat(id, 'bois')} stroke="#3A2C1A" strokeWidth="0.8" />
        <path d="M4.6 3.4 L6.5 0 L8.4 3.4 Z" fill={mat(id, 'fer')} stroke="#31363B" strokeWidth="0.7" />
        <path d="M9 8 H43 V48 L26 58 L9 48 Z" fill={color} />
        <g clipPath={`url(#${id}-drap)`}>
          <path d="M9 8 H43 V58 H9 Z" fill={`url(#${id}-champ)`} />
          <path d="M9 8 H43 V58 H9 Z" fill={`url(#${id}-motif)`} />
          <GrainVeil id={id} width={48} height={72} opacity={0.18} />
        </g>
        <path
          d="M9 8 H43 V48 L26 58 L9 48 Z"
          fill="none"
          stroke={mat(id, 'or')}
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M11 10 H41 V47 L26 55.6 L11 47 Z" fill="none" stroke="#FFE9C2" strokeOpacity="0.22" strokeWidth="0.8" />
        <path d="M13 58 L15 63 M20 61 L21.4 66 M26 58.6 L26 64 M32 61 L30.6 66 M39 58 L37 63" stroke={mat(id, 'or')} strokeWidth="1.1" strokeLinecap="round" opacity="0.8" />
        {showLabel ? (
          <text
            x="26"
            y="70"
            textAnchor="middle"
            fontFamily="Cinzel, Georgia, serif"
            fontSize="9"
            fontWeight="700"
            letterSpacing="1.1"
            fill="#EDE3CE"
          >
            {token.label.toUpperCase()}
          </text>
        ) : null}
      </g>
    </Drawing>
  );
}

/* ─────────────────────────── Cartouche de nom ───────────────────────────── */

export interface CartoucheProps {
  children: ReactNode;
  className?: string;
  tone?: 'clair' | 'sombre';
}

/** Cartouche de nom en Cinzel, sur plaque de parchemin ou d'encre. */
export function Cartouche({ children, className, tone = 'sombre' }: CartoucheProps): ReactElement {
  return (
    <span className={cx('hmm-cartouche', `hmm-cartouche--${tone}`, className)}>
      <span className="hmm-cartouche__texte">{children}</span>
    </span>
  );
}

/** Petite pastille de bannière, utilisable en liste ou en légende. */
export function BannerPip({
  player,
  size = 16,
  title,
}: {
  player: 1 | 2 | 3 | 4 | 5;
  size?: number;
  title?: string;
}): ReactElement {
  const id = useSvgId('bp');
  const token = banners[player - 1] ?? banners[0];
  return (
    <Drawing viewBox="0 0 16 16" size={size} title={title ?? `Bannière ${token.label}`} className="hmm-pastille">
      <defs>
        <PatternDefs id={id} pattern={token.pattern} ink="#241C14" />
        <linearGradient id={`${id}-f`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFE9C2" stopOpacity="0.4" />
          <stop offset="0.45" stopColor={token.color} />
          <stop offset="1" stopColor="#2A3242" stopOpacity="0.5" />
        </linearGradient>
      </defs>
      <path d="M8 0.8 L14.4 4.4 V11 L8 15.2 L1.6 11 V4.4 Z" fill={`url(#${id}-f)`} />
      <path d="M8 0.8 L14.4 4.4 V11 L8 15.2 L1.6 11 V4.4 Z" fill={`url(#${id}-motif)`} />
      <path
        d="M8 0.8 L14.4 4.4 V11 L8 15.2 L1.6 11 V4.4 Z"
        fill="none"
        stroke="#C9A227"
        strokeOpacity="0.85"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </Drawing>
  );
}
