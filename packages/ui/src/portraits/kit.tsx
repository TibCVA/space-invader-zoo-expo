/**
 * Atelier de portraits — peinture vectorielle par strates.
 *
 * Un portrait n'est jamais un assemblage d'aplats : il est peint dans l'ordre
 * d'un vrai tableau, chaque strate posée par-dessus la précédente.
 *
 *   1. fond de faction (granit + bannière, ou futaie + brume)
 *   2. occlusion d'arrière-plan et vignettage
 *   3. buste et épaules
 *   4. cou et ombre portée du menton
 *   5. masse du visage
 *   6. modelé d'ombre froide (`#3A4657`)
 *   7. hautes lumières chaudes (`#FFE9C2`) venues du nord-ouest
 *   8. traits : sourcils, yeux, nez, bouche, rides d'âge
 *   9. chevelure (arrière puis avant), pilosité
 *  10. vêtement, col, ferrures
 *  11. couvre-chef et accessoires
 *  12. rim light dorée sur le flanc sud-est
 *  13. grain général
 *  14. cadre d'enluminure et cartouche de nom
 *
 * Aucun contour noir : les silhouettes sont détachées par contraste de valeur
 * et par un contour teinté tiré de la couleur locale.
 */

import type { ReactElement, ReactNode } from 'react';
import { useSyncExternalStore } from 'react';
import {
  portraitSource,
  portraitSourcesVersion,
  subscribePortraitSources,
} from './source.js';
import {
  BlurFilter,
  Drawing,
  GrainFilter,
  GrainVeil,
  LightFilter,
  Materials,
  mat,
  useSvgId,
} from '../svg-kit.js';
import { IlluminationBorder } from '../heraldry.js';
import { cx, shade } from '../tokens.js';
import type { FactionKey } from '../tokens.js';

/* ────────────────────────────── Nuanciers ───────────────────────────────── */

export interface SkinRamp {
  light: string;
  base: string;
  shade: string;
  deep: string;
  blush: string;
}

export const SKINS = {
  ivoire: { light: '#FBE7CC', base: '#EFD3B4', shade: '#C79E7C', deep: '#9C7154', blush: '#D89A86' },
  clair: { light: '#F7DFC2', base: '#E8C9A8', shade: '#BE9270', deep: '#94684A', blush: '#D2907C' },
  rose: { light: '#FCE3CC', base: '#EFCDB6', shade: '#C4947A', deep: '#9A6B54', blush: '#DB9282' },
  hale: { light: '#F0D3AE', base: '#DCB894', shade: '#B0855F', deep: '#875F40', blush: '#C4826A' },
  burine: { light: '#E6C6A0', base: '#CFA982', shade: '#A2764F', deep: '#7A5333', blush: '#B5765C' },
  pale: { light: '#FBEDDC', base: '#F0DAC4', shade: '#CBA98C', deep: '#A17F64', blush: '#D9A091' },
} as const satisfies Record<string, SkinRamp>;

export type SkinKey = keyof typeof SKINS;

export interface HairRamp {
  light: string;
  base: string;
  shade: string;
}

export const HAIRS = {
  noir: { light: '#4E463D', base: '#2B2723', shade: '#171412' },
  chatain: { light: '#96703F', base: '#6B4A2C', shade: '#3A2717' },
  chatainClair: { light: '#B98A4E', base: '#8B6236', shade: '#4E351C' },
  blond: { light: '#E8CE8C', base: '#C8A257', shade: '#8A6A2E' },
  blondCendre: { light: '#DCD2AE', base: '#B9AC85', shade: '#7C7150' },
  roux: { light: '#C8763A', base: '#9C4E24', shade: '#5C2A11' },
  gris: { light: '#B8B4AB', base: '#8E8A83', shade: '#5C5952' },
  blanc: { light: '#F0EBDE', base: '#D8D2C4', shade: '#A29B8C' },
  poivreSel: { light: '#9A9389', base: '#6B655C', shade: '#423E38' },
} as const satisfies Record<string, HairRamp>;

export type HairKey = keyof typeof HAIRS;

export const IRIS = {
  bleu: '#5C7F92',
  gris: '#88968E',
  vert: '#6E8455',
  noisette: '#8A6438',
  brun: '#5B3E24',
  ambre: '#A97B32',
} as const;

export type IrisKey = keyof typeof IRIS;

/* ─────────────────────────── Géométrie du visage ────────────────────────── */

export type FaceShape = 'ovale' | 'long' | 'carre' | 'rond' | 'anguleux' | 'coeur';

const CX = 140;

export interface FaceGeom {
  w: number;
  crownY: number;
  chinY: number;
  cheekY: number;
  jaw: number;
  eyeY: number;
  noseY: number;
  mouthY: number;
  eyeGap: number;
}

const SHAPES: Record<FaceShape, { w: number; chinY: number; jaw: number; cheekY: number }> = {
  ovale: { w: 48, chinY: 200, jaw: 0.6, cheekY: 132 },
  long: { w: 45, chinY: 208, jaw: 0.58, cheekY: 136 },
  carre: { w: 51, chinY: 196, jaw: 0.82, cheekY: 128 },
  rond: { w: 52, chinY: 192, jaw: 0.72, cheekY: 138 },
  anguleux: { w: 47, chinY: 202, jaw: 0.68, cheekY: 126 },
  coeur: { w: 50, chinY: 198, jaw: 0.48, cheekY: 126 },
};

export function faceGeom(shape: FaceShape, scale = 1): FaceGeom {
  const s = SHAPES[shape];
  const w = s.w * scale;
  const crownY = 80;
  const chinY = s.chinY;
  const eyeY = crownY + (chinY - crownY) * 0.47;
  const noseY = eyeY + (chinY - eyeY) * 0.46;
  const mouthY = noseY + (chinY - noseY) * 0.52;
  return {
    w,
    crownY,
    chinY,
    cheekY: s.cheekY,
    jaw: s.jaw,
    eyeY,
    noseY,
    mouthY,
    eyeGap: w * 0.47,
  };
}

export function facePath(g: FaceGeom): string {
  const { w, crownY, chinY, cheekY, jaw } = g;
  const jw = w * jaw;
  return [
    `M${CX} ${crownY}`,
    `C${CX - w * 0.94} ${crownY + 3} ${CX - w} ${cheekY - 30} ${CX - w} ${cheekY}`,
    `C${CX - w} ${cheekY + 24} ${CX - jw - 7} ${chinY - 18} ${CX - jw} ${chinY - 7}`,
    `C${CX - jw * 0.6} ${chinY + 4} ${CX - jw * 0.26} ${chinY + 8} ${CX} ${chinY + 8}`,
    `C${CX + jw * 0.26} ${chinY + 8} ${CX + jw * 0.6} ${chinY + 4} ${CX + jw} ${chinY - 7}`,
    `C${CX + jw + 7} ${chinY - 18} ${CX + w} ${cheekY + 24} ${CX + w} ${cheekY}`,
    `C${CX + w} ${cheekY - 30} ${CX + w * 0.94} ${crownY + 3} ${CX} ${crownY}`,
    'Z',
  ].join(' ');
}

/* ───────────────────────────── Spécification ────────────────────────────── */

export type HairStyle =
  | 'court'
  | 'militaire'
  | 'miLong'
  | 'long'
  | 'tresse'
  | 'chignon'
  | 'nattes'
  | 'boucle'
  | 'tonsure'
  | 'degarni'
  | 'chauve'
  | 'crete';

export type FacialHair =
  | 'aucune'
  | 'barbe'
  | 'barbeLongue'
  | 'bouc'
  | 'moustache'
  | 'favoris'
  | 'rase';

export type Headwear =
  | 'aucun'
  | 'chaperon'
  | 'coiffe'
  | 'voile'
  | 'capuche'
  | 'bonnet'
  | 'cale'
  | 'chapeauLarge'
  | 'couronneFeuilles'
  | 'bandeau'
  | 'camail';

export type Garment =
  | 'mailles'
  | 'brigandine'
  | 'houppelande'
  | 'bure'
  | 'gambison'
  | 'robeBrodee'
  | 'peaux'
  | 'tunique'
  | 'surcot';

export interface PaintCtx {
  id: string;
  g: FaceGeom;
  skin: SkinRamp;
  hair: HairRamp;
  spec: HeroPortraitSpec;
}

export interface HeroPortraitSpec {
  id: string;
  /** nom affiché dans le cartouche */
  name: string;
  faction: FactionKey;
  /** âge en années : pilote rides, affaissement, cheveux gris */
  age: number;
  shape: FaceShape;
  /** carrure : 0,86 fin — 1,18 massif */
  build: number;
  skin: SkinKey;
  hair: HairKey;
  hairStyle: HairStyle;
  facial: FacialHair;
  head: Headwear;
  garment: Garment;
  iris: IrisKey;
  /** couleur dominante du vêtement, prise dans la palette */
  cloth: string;
  /** couleur secondaire (col, passepoil, doublure) */
  trim: string;
  /** −1 sourcils tombants (las), 0 neutre, +1 froncés (dur) */
  brow: number;
  /** −1 bouche tombante, 0 neutre, +1 esquisse de sourire */
  mouth: number;
  /** détail signature dessiné après le vêtement */
  extra?: (p: PaintCtx) => ReactNode;
}

/* ───────────────────────────── Fonds de faction ─────────────────────────── */

function Background({ id, faction }: { id: string; faction: FactionKey }): ReactElement {
  if (faction === 'ermitage') {
    return (
      <g>
        <rect x="0" y="0" width="280" height="340" fill={`url(#${id}-ciel)`} />
        <g opacity="0.9">
          {[18, 62, 108, 168, 214, 256].map((x, i) => (
            <path
              key={x}
              d={`M${x - 11 - i} 0 L${x + 11 + i} 0 L${x + 8 + i} 340 L${x - 8 - i} 340 Z`}
              fill={i % 2 === 0 ? '#16281D' : '#1E3226'}
              opacity={0.75 - i * 0.04}
            />
          ))}
          {[18, 62, 108, 168, 214, 256].map((x, i) => (
            <path
              key={`l${x}`}
              d={`M${x - 9 - i} 0 L${x - 6 - i} 340`}
              stroke="#FFE9C2"
              strokeOpacity={0.1}
              strokeWidth="2"
              fill="none"
            />
          ))}
        </g>
        <g filter={`url(#${id}-flou)`} opacity="0.5">
          <path d="M-10 214 Q70 196 140 214 Q210 232 290 210 L290 246 Q210 266 140 246 Q70 226 -10 246 Z" fill="#9FB4C2" opacity="0.44" />
          <path d="M-10 262 Q70 246 140 264 Q210 282 290 258 L290 300 Q210 320 140 300 Q70 280 -10 300 Z" fill="#9FB4C2" opacity="0.34" />
        </g>
        <rect x="0" y="0" width="280" height="340" fill={`url(#${id}-vignette)`} />
      </g>
    );
  }
  if (faction === 'neutre') {
    return (
      <g>
        <rect x="0" y="0" width="280" height="340" fill={`url(#${id}-ciel)`} />
        {/* crête lointaine, désaturée vers le bleu de brume (loi n°5) */}
        <path d="M-10 150 L44 116 L92 142 L138 104 L188 138 L236 112 L290 146 L290 200 L-10 200 Z" fill="#8FA6B8" opacity="0.3" />
        <path d="M-10 172 L52 146 L104 168 L152 138 L206 166 L262 142 L290 168 L290 230 L-10 230 Z" fill="#5D6A63" opacity="0.5" />
        {/* la chaussée qui monte vers le col */}
        <path d="M96 196 L184 196 L246 340 L34 340 Z" fill="#6B5433" opacity="0.5" />
        <path d="M120 196 L160 196 L176 340 L104 340 Z" fill="#4A4238" opacity="0.45" />
        <path d="M104 200 L58 336" stroke="#FFE9C2" strokeOpacity="0.12" strokeWidth="4" />
        {/* la borne armoriée du Gardien */}
        <path d="M94 116 Q140 98 186 116 L198 300 Q140 320 82 300 Z" fill="#4A4E52" opacity="0.62" />
        <path d="M102 124 L94 292" stroke="#FFE9C2" strokeOpacity="0.16" strokeWidth="6" />
        <path d="M178 126 L188 292" stroke="#2A3242" strokeOpacity="0.34" strokeWidth="7" />
        <rect x="0" y="0" width="280" height="340" fill={`url(#${id}-vignette)`} />
      </g>
    );
  }
  return (
    <g>
      <rect x="0" y="0" width="280" height="340" fill={`url(#${id}-ciel)`} />
      <g opacity="0.55">
        {[0, 1, 2, 3, 4, 5, 6].map((r) => (
          <g key={r}>
            <path d={`M-10 ${28 + r * 50} H290`} stroke="#1E2023" strokeWidth="3" opacity="0.6" />
            <path d={`M-10 ${30 + r * 50} H290`} stroke="#FFE9C2" strokeOpacity="0.08" strokeWidth="2" />
            {[0, 1, 2, 3, 4].map((c) => (
              <path
                key={c}
                d={`M${(r % 2 === 0 ? 24 : 58) + c * 62} ${28 + r * 50} V${78 + r * 50}`}
                stroke="#1E2023"
                strokeWidth="3"
                opacity="0.5"
              />
            ))}
          </g>
        ))}
      </g>
      <path d="M46 -6 L234 -6 L228 176 L206 160 L188 178 L168 158 L140 180 L112 158 L92 178 L74 160 L52 176 Z" fill="#6E1F2A" opacity="0.62" />
      <path d="M52 -6 L58 168" stroke="#FFE9C2" strokeOpacity="0.14" strokeWidth="5" />
      <path d="M140 34 L152 60 L180 64 L160 84 L165 112 L140 98 L115 112 L120 84 L100 64 L128 60 Z" fill="#C9A227" opacity="0.3" />
      <rect x="0" y="0" width="280" height="340" fill={`url(#${id}-vignette)`} />
    </g>
  );
}

/* ─────────────────────────────── Chevelure ──────────────────────────────── */

function hairBack(style: HairStyle, g: FaceGeom, h: HairRamp): ReactNode {
  const { w, crownY, chinY } = g;
  switch (style) {
    case 'long':
      return (
        <>
          <path
            d={`M${CX - w - 8} ${crownY + 26} Q${CX - w - 22} ${chinY + 40} ${CX - w - 4} ${chinY + 96} L${CX + w + 4} ${chinY + 96} Q${CX + w + 22} ${chinY + 40} ${CX + w + 8} ${crownY + 26} Z`}
            fill={h.shade}
          />
          <path
            d={`M${CX - w - 4} ${crownY + 40} Q${CX - w - 14} ${chinY + 30} ${CX - w} ${chinY + 84}`}
            stroke={h.base}
            strokeWidth="6"
            fill="none"
            opacity="0.8"
          />
        </>
      );
    case 'tresse':
    case 'nattes':
      return (
        <path
          d={`M${CX - w - 6} ${crownY + 28} Q${CX - w - 16} ${chinY + 20} ${CX - w - 2} ${chinY + 70} L${CX + w + 2} ${chinY + 70} Q${CX + w + 16} ${chinY + 20} ${CX + w + 6} ${crownY + 28} Z`}
          fill={h.shade}
        />
      );
    case 'miLong':
    case 'boucle':
      return (
        <path
          d={`M${CX - w - 6} ${crownY + 24} Q${CX - w - 14} ${chinY + 6} ${CX - w - 2} ${chinY + 40} L${CX + w + 2} ${chinY + 40} Q${CX + w + 14} ${chinY + 6} ${CX + w + 6} ${crownY + 24} Z`}
          fill={h.shade}
        />
      );
    case 'chignon':
      return (
        <>
          <path
            d={`M${CX - w - 4} ${crownY + 24} Q${CX - w - 8} ${chinY - 6} ${CX - w + 2} ${chinY + 18} L${CX + w - 2} ${chinY + 18} Q${CX + w + 8} ${chinY - 6} ${CX + w + 4} ${crownY + 24} Z`}
            fill={h.shade}
          />
          <path
            d={`M${CX + w - 6} ${crownY + 28} q26 -6 30 20 q4 24 -22 26 q-20 2 -22 -20 Z`}
            fill={h.base}
            stroke={h.shade}
            strokeWidth="2"
          />
        </>
      );
    default:
      return null;
  }
}

function hairFront(style: HairStyle, g: FaceGeom, h: HairRamp, age: number): ReactNode {
  const { w, crownY } = g;
  const y = crownY;
  const gris = age >= 52 ? 0.3 : 0;
  const common = (d: string, key?: string): ReactElement => (
    <g key={key}>
      <path d={d} fill={h.base} />
      <path d={d} fill={h.light} opacity={0.24} clipPath={undefined} transform="translate(-2.4 -2.4)" />
      <path d={d} fill={h.shade} opacity={0.34} transform="translate(2.6 2.6)" />
      <path d={d} fill={h.base} opacity={0.86} />
      {gris > 0 ? <path d={d} fill="#D8D2C4" opacity={gris * 0.4} /> : null}
    </g>
  );
  switch (style) {
    case 'chauve':
      return null;
    case 'degarni':
      return common(
        `M${CX - w} ${y + 40} Q${CX - w + 4} ${y + 6} ${CX - w * 0.42} ${y + 12} Q${CX - w * 0.1} ${y + 20} ${CX + w * 0.34} ${y + 8} Q${CX + w - 2} ${y + 4} ${CX + w} ${y + 42} Q${CX + w - 6} ${y + 18} ${CX + w * 0.4} ${y + 24} Q${CX - w * 0.2} ${y + 30} ${CX - w * 0.6} ${y + 22} Q${CX - w + 2} ${y + 18} ${CX - w} ${y + 40} Z`,
      );
    case 'tonsure':
      return common(
        `M${CX - w - 1} ${y + 46} Q${CX - w - 2} ${y + 18} ${CX - w * 0.55} ${y + 16} L${CX - w * 0.5} ${y + 26} Q${CX - w * 0.86} ${y + 30} ${CX - w * 0.9} ${y + 48} Z M${CX + w + 1} ${y + 46} Q${CX + w + 2} ${y + 18} ${CX + w * 0.55} ${y + 16} L${CX + w * 0.5} ${y + 26} Q${CX + w * 0.86} ${y + 30} ${CX + w * 0.9} ${y + 48} Z`,
      );
    case 'militaire':
      return common(
        `M${CX - w - 1} ${y + 40} Q${CX - w + 2} ${y - 4} ${CX} ${y - 5} Q${CX + w - 2} ${y - 4} ${CX + w + 1} ${y + 40} L${CX + w - 3} ${y + 22} Q${CX} ${y + 12} ${CX - w + 3} ${y + 22} Z`,
      );
    case 'court':
      return common(
        `M${CX - w - 2} ${y + 44} Q${CX - w - 2} ${y - 8} ${CX} ${y - 8} Q${CX + w + 2} ${y - 8} ${CX + w + 2} ${y + 44} Q${CX + w - 2} ${y + 20} ${CX + w * 0.4} ${y + 18} Q${CX - w * 0.2} ${y + 26} ${CX - w * 0.72} ${y + 16} Q${CX - w + 2} ${y + 20} ${CX - w - 2} ${y + 44} Z`,
      );
    case 'crete':
      return common(
        `M${CX - w * 0.5} ${y + 30} Q${CX - 16} ${y - 22} ${CX + 6} ${y - 20} Q${CX + 26} ${y - 16} ${CX + w * 0.5} ${y + 30} Q${CX} ${y + 12} ${CX - w * 0.5} ${y + 30} Z`,
      );
    case 'boucle':
      return common(
        `M${CX - w - 3} ${y + 48} Q${CX - w - 8} ${y + 4} ${CX - w * 0.5} ${y - 6} Q${CX} ${y - 14} ${CX + w * 0.55} ${y - 5} Q${CX + w + 8} ${y + 6} ${CX + w + 3} ${y + 48} Q${CX + w - 4} ${y + 26} ${CX + w * 0.5} ${y + 22} Q${CX + 8} ${y + 30} ${CX - w * 0.3} ${y + 22} Q${CX - w + 4} ${y + 26} ${CX - w - 3} ${y + 48} Z`,
      );
    case 'chignon':
    case 'tresse':
    case 'nattes':
      return common(
        `M${CX - w - 2} ${y + 44} Q${CX - w - 2} ${y - 6} ${CX} ${y - 7} Q${CX + w + 2} ${y - 6} ${CX + w + 2} ${y + 44} Q${CX + w - 4} ${y + 22} ${CX + w * 0.2} ${y + 16} Q${CX - w * 0.35} ${y + 12} ${CX - w + 4} ${y + 24} Z`,
      );
    default:
      return common(
        `M${CX - w - 2} ${y + 46} Q${CX - w - 4} ${y - 6} ${CX} ${y - 8} Q${CX + w + 4} ${y - 6} ${CX + w + 2} ${y + 46} Q${CX + w - 2} ${y + 22} ${CX + w * 0.44} ${y + 20} Q${CX - w * 0.1} ${y + 28} ${CX - w * 0.7} ${y + 18} Q${CX - w + 2} ${y + 22} ${CX - w - 2} ${y + 46} Z`,
      );
  }
}

/* ───────────────────────────────── Pilosité ─────────────────────────────── */

function facialHair(kind: FacialHair, g: FaceGeom, h: HairRamp): ReactNode {
  const { w, chinY, mouthY, noseY, jaw } = g;
  const jw = w * jaw;
  switch (kind) {
    case 'aucune':
    case 'rase':
      return null;
    case 'moustache':
      return (
        <g>
          <path
            d={`M${CX - 18} ${mouthY - 8} Q${CX} ${mouthY - 14} ${CX + 18} ${mouthY - 8} Q${CX + 10} ${mouthY - 1} ${CX} ${mouthY - 4} Q${CX - 10} ${mouthY - 1} ${CX - 18} ${mouthY - 8} Z`}
            fill={h.base}
          />
          <path d={`M${CX - 15} ${mouthY - 10} Q${CX - 4} ${mouthY - 13} ${CX} ${mouthY - 11}`} stroke={h.light} strokeOpacity="0.5" strokeWidth="1.6" fill="none" />
        </g>
      );
    case 'bouc':
      return (
        <g>
          <path
            d={`M${CX - 16} ${mouthY - 8} Q${CX} ${mouthY - 13} ${CX + 16} ${mouthY - 8} Q${CX + 8} ${mouthY - 2} ${CX} ${mouthY - 4} Q${CX - 8} ${mouthY - 2} ${CX - 16} ${mouthY - 8} Z`}
            fill={h.base}
          />
          <path
            d={`M${CX - 13} ${mouthY + 8} Q${CX} ${mouthY + 4} ${CX + 13} ${mouthY + 8} Q${CX + 11} ${chinY + 12} ${CX} ${chinY + 16} Q${CX - 11} ${chinY + 12} ${CX - 13} ${mouthY + 8} Z`}
            fill={h.base}
          />
          <path d={`M${CX - 8} ${mouthY + 12} Q${CX} ${chinY + 6} ${CX + 8} ${mouthY + 12}`} stroke={h.shade} strokeOpacity="0.5" strokeWidth="1.6" fill="none" />
        </g>
      );
    case 'favoris':
      return (
        <g>
          <path d={`M${CX - w + 2} ${noseY - 14} Q${CX - w - 2} ${chinY - 26} ${CX - jw + 4} ${chinY - 12} Q${CX - jw - 4} ${chinY - 30} ${CX - w + 2} ${noseY - 14} Z`} fill={h.base} />
          <path d={`M${CX + w - 2} ${noseY - 14} Q${CX + w + 2} ${chinY - 26} ${CX + jw - 4} ${chinY - 12} Q${CX + jw + 4} ${chinY - 30} ${CX + w - 2} ${noseY - 14} Z`} fill={h.base} />
        </g>
      );
    case 'barbe':
      return (
        <g>
          <path
            d={`M${CX - w + 3} ${noseY - 8} Q${CX - w - 1} ${chinY - 6} ${CX} ${chinY + 20} Q${CX + w + 1} ${chinY - 6} ${CX + w - 3} ${noseY - 8} Q${CX + jw} ${mouthY + 16} ${CX} ${mouthY + 14} Q${CX - jw} ${mouthY + 16} ${CX - w + 3} ${noseY - 8} Z`}
            fill={h.base}
          />
          <path
            d={`M${CX - 17} ${mouthY - 8} Q${CX} ${mouthY - 14} ${CX + 17} ${mouthY - 8} Q${CX + 9} ${mouthY - 1} ${CX} ${mouthY - 4} Q${CX - 9} ${mouthY - 1} ${CX - 17} ${mouthY - 8} Z`}
            fill={h.base}
          />
          <path d={`M${CX - w + 8} ${noseY} Q${CX - 16} ${chinY + 4} ${CX} ${chinY + 12}`} stroke={h.light} strokeOpacity="0.34" strokeWidth="2" fill="none" />
          <path d={`M${CX + w - 8} ${noseY + 4} Q${CX + 14} ${chinY + 6} ${CX + 2} ${chinY + 14}`} stroke={h.shade} strokeOpacity="0.44" strokeWidth="2" fill="none" />
        </g>
      );
    case 'barbeLongue':
      return (
        <g>
          <path
            d={`M${CX - w + 2} ${noseY - 10} Q${CX - w - 4} ${chinY + 10} ${CX - 12} ${chinY + 58} Q${CX} ${chinY + 68} ${CX + 12} ${chinY + 58} Q${CX + w + 4} ${chinY + 10} ${CX + w - 2} ${noseY - 10} Q${CX + jw} ${mouthY + 16} ${CX} ${mouthY + 14} Q${CX - jw} ${mouthY + 16} ${CX - w + 2} ${noseY - 10} Z`}
            fill={h.base}
          />
          <path
            d={`M${CX - 18} ${mouthY - 9} Q${CX} ${mouthY - 15} ${CX + 18} ${mouthY - 9} Q${CX + 9} ${mouthY - 1} ${CX} ${mouthY - 4} Q${CX - 9} ${mouthY - 1} ${CX - 18} ${mouthY - 9} Z`}
            fill={h.base}
          />
          <path d={`M${CX - w + 10} ${noseY + 4} Q${CX - 14} ${chinY + 30} ${CX - 4} ${chinY + 56}`} stroke={h.light} strokeOpacity="0.3" strokeWidth="2.2" fill="none" />
          <path d={`M${CX + w - 10} ${noseY + 8} Q${CX + 14} ${chinY + 32} ${CX + 4} ${chinY + 58}`} stroke={h.shade} strokeOpacity="0.42" strokeWidth="2.2" fill="none" />
        </g>
      );
  }
}

/* ───────────────────────────── Couvre-chefs ─────────────────────────────── */

function headwear(kind: Headwear, g: FaceGeom, cloth: string, trim: string): ReactNode {
  const { w, crownY, cheekY } = g;
  const y = crownY;
  const dark = shade(cloth, 0.42);
  const lit = shade(cloth, -0.02);
  switch (kind) {
    case 'aucun':
      return null;
    case 'bandeau':
      return (
        <g>
          <path d={`M${CX - w - 3} ${y + 26} Q${CX} ${y + 14} ${CX + w + 3} ${y + 26} L${CX + w + 3} ${y + 38} Q${CX} ${y + 26} ${CX - w - 3} ${y + 38} Z`} fill={cloth} />
          <path d={`M${CX - w - 1} ${y + 28} Q${CX - 10} ${y + 19} ${CX + 8} ${y + 20}`} stroke="#FFE9C2" strokeOpacity="0.34" strokeWidth="2" fill="none" />
        </g>
      );
    case 'cale':
      return (
        <g>
          <path
            d={`M${CX - w - 4} ${cheekY - 4} Q${CX - w - 6} ${y - 12} ${CX} ${y - 12} Q${CX + w + 6} ${y - 12} ${CX + w + 4} ${cheekY - 4} Q${CX + w - 4} ${cheekY + 6} ${CX + w - 6} ${y + 30} Q${CX} ${y + 16} ${CX - w + 6} ${y + 30} Q${CX - w + 4} ${cheekY + 6} ${CX - w - 4} ${cheekY - 4} Z`}
            fill={cloth}
          />
          <path d={`M${CX - w - 2} ${y + 16} Q${CX - 16} ${y - 6} ${CX + 4} ${y - 8}`} stroke="#FFE9C2" strokeOpacity="0.28" strokeWidth="3" fill="none" />
        </g>
      );
    case 'coiffe':
      return (
        <g>
          <path
            d={`M${CX - w - 8} ${cheekY + 22} Q${CX - w - 14} ${y - 16} ${CX} ${y - 16} Q${CX + w + 14} ${y - 16} ${CX + w + 8} ${cheekY + 22} L${CX + w + 2} ${cheekY + 24} Q${CX + w - 2} ${y + 12} ${CX} ${y + 10} Q${CX - w + 2} ${y + 12} ${CX - w - 2} ${cheekY + 24} Z`}
            fill={cloth}
          />
          <path d={`M${CX - w - 10} ${cheekY + 20} Q${CX - w - 12} ${y - 4} ${CX - 20} ${y - 12}`} stroke="#FFE9C2" strokeOpacity="0.3" strokeWidth="3" fill="none" />
          <path d={`M${CX - w - 8} ${cheekY + 22} Q${CX} ${cheekY + 34} ${CX + w + 8} ${cheekY + 22}`} stroke={trim} strokeWidth="3" fill="none" opacity="0.8" />
        </g>
      );
    case 'voile':
      return (
        <g>
          <path
            d={`M${CX - w - 12} ${cheekY + 60} Q${CX - w - 18} ${y - 18} ${CX} ${y - 18} Q${CX + w + 18} ${y - 18} ${CX + w + 12} ${cheekY + 60} L${CX + w + 4} ${cheekY + 58} Q${CX + w} ${y + 8} ${CX} ${y + 6} Q${CX - w} ${y + 8} ${CX - w - 4} ${cheekY + 58} Z`}
            fill={cloth}
            opacity="0.94"
          />
          <path d={`M${CX - w - 14} ${cheekY + 40} Q${CX - w - 14} ${y + 4} ${CX - 24} ${y - 14}`} stroke="#FFE9C2" strokeOpacity="0.26" strokeWidth="4" fill="none" />
          <path d={`M${CX - w - 4} ${y + 4} Q${CX} ${y - 6} ${CX + w + 4} ${y + 4}`} stroke={trim} strokeWidth="2.4" fill="none" opacity="0.7" />
        </g>
      );
    case 'capuche':
      return (
        <g>
          <path
            d={`M${CX - w - 16} ${cheekY + 78} Q${CX - w - 22} ${y - 24} ${CX} ${y - 24} Q${CX + w + 22} ${y - 24} ${CX + w + 16} ${cheekY + 78} L${CX + w + 2} ${cheekY + 70} Q${CX + w + 2} ${y + 4} ${CX} ${y + 2} Q${CX - w - 2} ${y + 4} ${CX - w - 2} ${cheekY + 70} Z`}
            fill={cloth}
          />
          <path d={`M${CX - w - 18} ${cheekY + 50} Q${CX - w - 18} ${y - 4} ${CX - 26} ${y - 20}`} stroke="#FFE9C2" strokeOpacity="0.22" strokeWidth="5" fill="none" />
          <path d={`M${CX + w + 16} ${cheekY + 60} Q${CX + w + 18} ${y + 6} ${CX + 24} ${y - 20}`} stroke="#2A3242" strokeOpacity="0.3" strokeWidth="6" fill="none" />
          <path d={`M${CX - w - 2} ${y + 6} Q${CX} ${y - 8} ${CX + w + 2} ${y + 6}`} stroke={dark} strokeWidth="3" fill="none" opacity="0.7" />
        </g>
      );
    case 'camail':
      return (
        <g>
          <path
            d={`M${CX - w - 16} ${cheekY + 78} Q${CX - w - 20} ${y - 20} ${CX} ${y - 20} Q${CX + w + 20} ${y - 20} ${CX + w + 16} ${cheekY + 78} L${CX + w - 2} ${cheekY + 52} Q${CX + w + 4} ${y + 22} ${CX} ${y + 12} Q${CX - w - 4} ${y + 22} ${CX - w + 2} ${cheekY + 52} Z`}
            fill="#5A6169"
          />
          <g opacity="0.5">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((r) =>
              [0, 1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
                <circle
                  key={`${r}-${c}`}
                  cx={CX - w - 12 + c * ((2 * w + 24) / 8) + (r % 2 ? 3 : 0)}
                  cy={y - 12 + r * 14}
                  r="2.4"
                  fill="#9AA3AC"
                  opacity="0.55"
                />
              )),
            )}
          </g>
          <path d={`M${CX - w - 4} ${y + 8} Q${CX} ${y - 6} ${CX + w + 4} ${y + 8}`} stroke="#31363B" strokeWidth="3" fill="none" opacity="0.8" />
        </g>
      );
    case 'bonnet':
      return (
        <g>
          <path d={`M${CX - w - 4} ${y + 30} Q${CX - w - 4} ${y - 22} ${CX} ${y - 22} Q${CX + w + 4} ${y - 22} ${CX + w + 4} ${y + 30} Z`} fill={cloth} />
          <path d={`M${CX - w - 8} ${y + 26} Q${CX} ${y + 16} ${CX + w + 8} ${y + 26} L${CX + w + 8} ${y + 38} Q${CX} ${y + 28} ${CX - w - 8} ${y + 38} Z`} fill={trim} />
          <path d={`M${CX - w - 2} ${y + 12} Q${CX - 18} ${y - 16} ${CX + 2} ${y - 18}`} stroke="#FFE9C2" strokeOpacity="0.28" strokeWidth="4" fill="none" />
        </g>
      );
    case 'chaperon':
      return (
        <g>
          <path
            d={`M${CX - w - 8} ${y + 34} Q${CX - w - 10} ${y - 22} ${CX} ${y - 24} Q${CX + w + 10} ${y - 22} ${CX + w + 8} ${y + 34} Q${CX + w + 26} ${y + 20} ${CX + w + 34} ${y + 62} L${CX + w + 12} ${y + 56} Q${CX + w + 4} ${y + 42} ${CX + w + 6} ${y + 34} Z`}
            fill={cloth}
          />
          <path d={`M${CX - w - 6} ${y + 14} Q${CX - 20} ${y - 18} ${CX + 2} ${y - 20}`} stroke="#FFE9C2" strokeOpacity="0.26" strokeWidth="4" fill="none" />
          <path d={`M${CX - w - 8} ${y + 32} Q${CX} ${y + 44} ${CX + w + 8} ${y + 32}`} stroke={dark} strokeWidth="3" fill="none" opacity="0.65" />
        </g>
      );
    case 'chapeauLarge':
      return (
        <g>
          <path d={`M${CX - w - 6} ${y + 22} Q${CX - w - 4} ${y - 24} ${CX} ${y - 26} Q${CX + w + 4} ${y - 24} ${CX + w + 6} ${y + 22} Z`} fill={cloth} />
          <path d={`M${CX - w - 34} ${y + 26} Q${CX} ${y + 6} ${CX + w + 34} ${y + 26} Q${CX} ${y + 46} ${CX - w - 34} ${y + 26} Z`} fill={lit} />
          <path d={`M${CX - w - 30} ${y + 25} Q${CX - 20} ${y + 12} ${CX + 6} ${y + 12}`} stroke="#FFE9C2" strokeOpacity="0.3" strokeWidth="3" fill="none" />
          <path d={`M${CX - w - 6} ${y + 20} Q${CX} ${y + 30} ${CX + w + 6} ${y + 20}`} stroke={trim} strokeWidth="4" fill="none" opacity="0.85" />
        </g>
      );
    case 'couronneFeuilles':
      return (
        <g>
          <path d={`M${CX - w - 2} ${y + 30} Q${CX} ${y + 16} ${CX + w + 2} ${y + 30}`} stroke="#4A6138" strokeWidth="5" fill="none" />
          {[-1, -0.6, -0.2, 0.2, 0.6, 1].map((t, i) => (
            <path
              key={i}
              d={`M${CX + t * w} ${y + 24 + Math.abs(t) * 6} q-6 -12 2 -16 q8 4 4 16 Z`}
              fill={i % 2 ? '#4A6138' : '#5C7645'}
              transform={`rotate(${t * 26} ${CX + t * w} ${y + 24})`}
            />
          ))}
          <path d={`M${CX} ${y + 12} l4 6 -4 6 -4 -6 Z`} fill="#C9A227" opacity="0.85" />
        </g>
      );
  }
}

/* ─────────────────────────────── Vêtements ──────────────────────────────── */

function garmentLayer(kind: Garment, g: FaceGeom, build: number, cloth: string, trim: string): ReactNode {
  const shoulderY = g.chinY + 34;
  const spread = 104 * build;
  const dark = shade(cloth, 0.4);
  const light = shade(cloth, -0.12);
  const bust = `M${CX - spread} 340 Q${CX - spread + 6} ${shoulderY + 8} ${CX - 44 * build} ${shoulderY - 12} Q${CX - 20} ${shoulderY - 26} ${CX} ${shoulderY - 26} Q${CX + 20} ${shoulderY - 26} ${CX + 44 * build} ${shoulderY - 12} Q${CX + spread - 6} ${shoulderY + 8} ${CX + spread} 340 Z`;
  const common = (
    <>
      <path d={bust} fill={cloth} />
      <path
        d={`M${CX - spread} 340 Q${CX - spread + 6} ${shoulderY + 8} ${CX - 44 * build} ${shoulderY - 12} Q${CX - 20} ${shoulderY - 26} ${CX} ${shoulderY - 26} L${CX} 340 Z`}
        fill={light}
        opacity="0.22"
      />
      <path
        d={`M${CX} ${shoulderY - 26} Q${CX + 20} ${shoulderY - 26} ${CX + 44 * build} ${shoulderY - 12} Q${CX + spread - 6} ${shoulderY + 8} ${CX + spread} 340 L${CX} 340 Z`}
        fill={dark}
        opacity="0.26"
      />
      <path
        d={`M${CX - spread} 340 Q${CX - spread + 6} ${shoulderY + 8} ${CX - 44 * build} ${shoulderY - 12}`}
        stroke="#FFE9C2"
        strokeOpacity="0.3"
        strokeWidth="5"
        fill="none"
      />
      <path
        d={`M${CX + spread} 340 Q${CX + spread - 6} ${shoulderY + 8} ${CX + 44 * build} ${shoulderY - 12}`}
        stroke="#3A4657"
        strokeOpacity="0.34"
        strokeWidth="6"
        fill="none"
      />
    </>
  );
  switch (kind) {
    case 'mailles':
      return (
        <g>
          {common}
          <g opacity="0.55">
            {Array.from({ length: 9 }, (_, r) =>
              Array.from({ length: 15 }, (_, c) => (
                <circle
                  key={`${r}-${c}`}
                  cx={CX - spread + 8 + c * ((spread * 2 - 16) / 14) + (r % 2 ? 4 : 0)}
                  cy={shoulderY - 14 + r * 13}
                  r="3"
                  fill="#9AA3AC"
                  opacity="0.4"
                />
              )),
            )}
          </g>
          <path d={`M${CX - 42} ${shoulderY - 22} Q${CX} ${shoulderY - 6} ${CX + 42} ${shoulderY - 22}`} stroke={trim} strokeWidth="7" fill="none" />
        </g>
      );
    case 'brigandine':
      return (
        <g>
          {common}
          <g opacity="0.7">
            {Array.from({ length: 6 }, (_, r) =>
              Array.from({ length: 9 }, (_, c) => (
                <path
                  key={`${r}-${c}`}
                  d={`M${CX - spread + 14 + c * ((spread * 2 - 28) / 8)} ${shoulderY - 6 + r * 18} l3 3 -3 3 -3 -3 Z`}
                  fill="#C9A227"
                  opacity="0.65"
                />
              )),
            )}
          </g>
          <path d={`M${CX - spread + 6} ${shoulderY + 16} Q${CX} ${shoulderY + 34} ${CX + spread - 6} ${shoulderY + 16}`} stroke={dark} strokeWidth="4" fill="none" opacity="0.6" />
          <path d={`M${CX - 44} ${shoulderY - 20} Q${CX} ${shoulderY - 4} ${CX + 44} ${shoulderY - 20}`} stroke={trim} strokeWidth="8" fill="none" />
        </g>
      );
    case 'houppelande':
      return (
        <g>
          {common}
          <path d={`M${CX - 52} ${shoulderY - 20} Q${CX} ${shoulderY + 4} ${CX + 52} ${shoulderY - 20} L${CX + 44} 340 L${CX - 44} 340 Z`} fill={trim} opacity="0.9" />
          <path d={`M${CX - 44} ${shoulderY - 12} Q${CX} ${shoulderY + 10} ${CX + 44} ${shoulderY - 12}`} stroke="#C9A227" strokeWidth="3" fill="none" opacity="0.7" />
          <path d={`M${CX - 66} ${shoulderY + 22} Q${CX - 58} ${shoulderY + 70} ${CX - 62} 340`} stroke={dark} strokeWidth="4" fill="none" opacity="0.45" />
          <path d={`M${CX + 66} ${shoulderY + 22} Q${CX + 58} ${shoulderY + 70} ${CX + 62} 340`} stroke={dark} strokeWidth="4" fill="none" opacity="0.45" />
        </g>
      );
    case 'bure':
      return (
        <g>
          {common}
          <path d={`M${CX - 46} ${shoulderY - 22} Q${CX} ${shoulderY + 40} ${CX + 46} ${shoulderY - 22} L${CX + 34} 340 L${CX - 34} 340 Z`} fill={dark} opacity="0.55" />
          <path d={`M${CX - 30} ${shoulderY + 10} Q${CX} ${shoulderY + 44} ${CX + 30} ${shoulderY + 10}`} stroke={trim} strokeWidth="3.4" fill="none" opacity="0.75" />
          <path d={`M${CX - 72} ${shoulderY + 30} Q${CX - 66} ${shoulderY + 90} ${CX - 70} 340`} stroke={dark} strokeWidth="5" fill="none" opacity="0.4" />
        </g>
      );
    case 'gambison':
      return (
        <g>
          {common}
          {Array.from({ length: 7 }, (_, i) => (
            <path
              key={i}
              d={`M${CX - spread + 12 + i * ((spread * 2 - 24) / 6)} ${shoulderY - 16} L${CX - spread + 12 + i * ((spread * 2 - 24) / 6)} 340`}
              stroke={dark}
              strokeWidth="3"
              opacity="0.45"
            />
          ))}
          <path d={`M${CX - 46} ${shoulderY - 20} Q${CX} ${shoulderY - 2} ${CX + 46} ${shoulderY - 20}`} stroke={trim} strokeWidth="7" fill="none" />
        </g>
      );
    case 'robeBrodee':
      return (
        <g>
          {common}
          <path d={`M${CX - 54} ${shoulderY - 20} Q${CX} ${shoulderY + 8} ${CX + 54} ${shoulderY - 20} L${CX + 48} 340 L${CX - 48} 340 Z`} fill={trim} opacity="0.85" />
          {Array.from({ length: 5 }, (_, i) => (
            <path
              key={i}
              d={`M${CX - 34 + i * 17} ${shoulderY + 26} l5 8 -5 8 -5 -8 Z`}
              fill="#C9A227"
              opacity="0.8"
            />
          ))}
          <path d={`M${CX - 54} ${shoulderY - 18} Q${CX} ${shoulderY + 10} ${CX + 54} ${shoulderY - 18}`} stroke="#C9A227" strokeWidth="2.6" fill="none" opacity="0.85" />
        </g>
      );
    case 'peaux':
      return (
        <g>
          {common}
          <path
            d={`M${CX - spread + 4} ${shoulderY + 16} Q${CX - 54} ${shoulderY - 26} ${CX} ${shoulderY - 18} Q${CX + 54} ${shoulderY - 26} ${CX + spread - 4} ${shoulderY + 16} Q${CX + 40} ${shoulderY + 44} ${CX} ${shoulderY + 36} Q${CX - 40} ${shoulderY + 44} ${CX - spread + 4} ${shoulderY + 16} Z`}
            fill={trim}
          />
          {Array.from({ length: 16 }, (_, i) => (
            <path
              key={i}
              d={`M${CX - spread + 10 + i * ((spread * 2 - 20) / 15)} ${shoulderY + 4} q3 14 -2 26`}
              stroke={shade(trim, 0.35)}
              strokeWidth="2.4"
              fill="none"
              opacity="0.55"
            />
          ))}
        </g>
      );
    case 'surcot':
      return (
        <g>
          {common}
          <path d={`M${CX - 50} ${shoulderY - 20} L${CX + 50} ${shoulderY - 20} L${CX + 44} 340 L${CX - 44} 340 Z`} fill={trim} opacity="0.9" />
          <path d={`M${CX} ${shoulderY - 14} L${CX} 340`} stroke="#C9A227" strokeWidth="2.4" opacity="0.6" />
          <path d={`M${CX - 44} ${shoulderY + 40} L${CX + 44} ${shoulderY + 40}`} stroke="#C9A227" strokeWidth="2.4" opacity="0.6" />
        </g>
      );
    default:
      return (
        <g>
          {common}
          <path d={`M${CX - 44} ${shoulderY - 20} Q${CX} ${shoulderY + 2} ${CX + 44} ${shoulderY - 20}`} stroke={trim} strokeWidth="7" fill="none" />
        </g>
      );
  }
}

/* ─────────────────────────── Peinture du visage ─────────────────────────── */

function Face({ id, g, skin, spec }: PaintCtx): ReactElement {
  const { w, crownY, chinY, cheekY, eyeY, noseY, mouthY, eyeGap } = g;
  const age = spec.age;
  const rides = age >= 46 ? 1 : age >= 34 ? 0.55 : 0.18;
  const iris = IRIS[spec.iris];
  const path = facePath(g);
  const browY = eyeY - 13;
  const browTilt = spec.brow * 4;
  const lid = 4.9;
  const eyeW = 10.4;

  return (
    <g>
      {/* 5. masse du visage */}
      <path d={path} fill={skin.base} />
      {/* 6. modelé froid : tempes, joues, sous le nez, sous la lèvre */}
      <g clipPath={`url(#${id}-visage)`}>
        <path d={path} fill={skin.shade} opacity="0.58" transform="translate(9 8)" filter={`url(#${id}-flou)`} />
        <path d={path} fill={skin.light} opacity="0.46" transform="translate(-7 -7)" filter={`url(#${id}-flou)`} />
        <path d={path} fill={skin.base} opacity="0.66" />
        <path
          d={`M${CX + w * 0.36} ${cheekY - 22} Q${CX + w * 0.9} ${cheekY + 10} ${CX + w * 0.4} ${chinY - 16}`}
          stroke={skin.shade}
          strokeOpacity="0.55"
          strokeWidth="14"
          fill="none"
          filter={`url(#${id}-flou)`}
        />
        <path
          d={`M${CX - w * 0.5} ${cheekY - 26} Q${CX - w * 0.92} ${cheekY + 6} ${CX - w * 0.5} ${chinY - 22}`}
          stroke={skin.light}
          strokeOpacity="0.5"
          strokeWidth="12"
          fill="none"
          filter={`url(#${id}-flou)`}
        />
        {/* pommettes */}
        <ellipse cx={CX - eyeGap - 4} cy={noseY - 4} rx="14" ry="9" fill={skin.blush} opacity="0.22" />
        <ellipse cx={CX + eyeGap + 4} cy={noseY - 4} rx="14" ry="9" fill={skin.blush} opacity="0.18" />
        {/* front */}
        <path
          d={`M${CX - w * 0.6} ${crownY + 30} Q${CX} ${crownY + 20} ${CX + w * 0.6} ${crownY + 30}`}
          stroke={skin.light}
          strokeOpacity="0.44"
          strokeWidth="12"
          fill="none"
          filter={`url(#${id}-flou)`}
        />
        {/* orbites : le regard se creuse sous l'arcade */}
        <path
          d={`M${CX - eyeGap - 13} ${eyeY - 7} Q${CX - eyeGap} ${eyeY - 13} ${CX - eyeGap + 12} ${eyeY - 6}`}
          stroke={skin.shade}
          strokeOpacity="0.5"
          strokeWidth="9"
          fill="none"
          filter={`url(#${id}-flou)`}
        />
        <path
          d={`M${CX + eyeGap - 12} ${eyeY - 6} Q${CX + eyeGap} ${eyeY - 13} ${CX + eyeGap + 13} ${eyeY - 7}`}
          stroke={skin.shade}
          strokeOpacity="0.56"
          strokeWidth="9"
          fill="none"
          filter={`url(#${id}-flou)`}
        />
        {/* ombre du nez, rejetée au sud-est */}
        <path
          d={`M${CX + 3} ${eyeY + 4} Q${CX + 9} ${noseY - 8} ${CX + 11} ${noseY + 3} Q${CX + 7} ${noseY + 8} ${CX + 1} ${noseY + 6}`}
          fill={skin.shade}
          opacity="0.42"
          filter={`url(#${id}-flou)`}
        />
        {/* creux sous la lèvre et bas de mâchoire */}
        <path
          d={`M${CX - w * 0.52} ${chinY - 26} Q${CX} ${chinY + 4} ${CX + w * 0.52} ${chinY - 26}`}
          stroke={skin.deep}
          strokeOpacity="0.3"
          strokeWidth="13"
          fill="none"
          filter={`url(#${id}-flou)`}
        />
        <path
          d={`M${CX - 9} ${mouthY + 13} Q${CX} ${mouthY + 18} ${CX + 9} ${mouthY + 13}`}
          stroke={skin.shade}
          strokeOpacity="0.42"
          strokeWidth="7"
          fill="none"
          filter={`url(#${id}-flou)`}
        />
        {/* menton éclairé */}
        <path
          d={`M${CX - 8} ${chinY - 12} Q${CX} ${chinY - 16} ${CX + 6} ${chinY - 12}`}
          stroke={skin.light}
          strokeOpacity="0.5"
          strokeWidth="8"
          fill="none"
          filter={`url(#${id}-flou)`}
        />
        {/* rides d'âge */}
        {rides > 0.4 ? (
          <g opacity={rides * 0.5} stroke={skin.deep} fill="none" strokeLinecap="round">
            <path d={`M${CX - 22} ${crownY + 30} Q${CX} ${crownY + 25} ${CX + 22} ${crownY + 30}`} strokeWidth="1.5" />
            <path d={`M${CX - 20} ${crownY + 38} Q${CX} ${crownY + 33} ${CX + 20} ${crownY + 38}`} strokeWidth="1.3" />
            <path d={`M${CX - eyeGap - 15} ${eyeY + 6} q-5 4 -6 9`} strokeWidth="1.3" />
            <path d={`M${CX + eyeGap + 15} ${eyeY + 6} q5 4 6 9`} strokeWidth="1.3" />
            <path d={`M${CX - 16} ${mouthY - 12} Q${CX - 22} ${mouthY + 2} ${CX - 14} ${mouthY + 12}`} strokeWidth="1.6" />
            <path d={`M${CX + 16} ${mouthY - 12} Q${CX + 22} ${mouthY + 2} ${CX + 14} ${mouthY + 12}`} strokeWidth="1.6" />
          </g>
        ) : null}
        {age >= 55 ? (
          <path
            d={`M${CX - w * 0.62} ${chinY - 32} Q${CX - w * 0.5} ${chinY - 12} ${CX - w * 0.3} ${chinY - 6}`}
            stroke={skin.deep}
            strokeOpacity="0.3"
            strokeWidth="1.6"
            fill="none"
          />
        ) : null}
      </g>

      {/* oreilles */}
      <path
        d={`M${CX - w + 1} ${eyeY - 2} q-9 -2 -9 10 q0 12 10 14 Z`}
        fill={skin.base}
        stroke={skin.deep}
        strokeOpacity="0.3"
        strokeWidth="1"
      />
      <path
        d={`M${CX + w - 1} ${eyeY - 2} q9 -2 9 10 q0 12 -10 14 Z`}
        fill={skin.shade}
        stroke={skin.deep}
        strokeOpacity="0.34"
        strokeWidth="1"
      />

      {/* 8. traits — sourcils */}
      <path
        d={`M${CX - eyeGap - 15} ${browY + 3 + browTilt} Q${CX - eyeGap} ${browY - 4 - browTilt} ${CX - eyeGap + 14} ${browY + 1}`}
        stroke={HAIRS[spec.hair].shade}
        strokeWidth={age >= 50 ? 4 : 3.5}
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />
      <path
        d={`M${CX + eyeGap + 15} ${browY + 3 + browTilt} Q${CX + eyeGap} ${browY - 4 - browTilt} ${CX + eyeGap - 14} ${browY + 1}`}
        stroke={HAIRS[spec.hair].shade}
        strokeWidth={age >= 50 ? 4 : 3.5}
        strokeLinecap="round"
        fill="none"
        opacity="0.9"
      />

      {/* yeux */}
      {[-1, 1].map((s) => {
        const ex = CX + s * eyeGap;
        return (
          <g key={s}>
            <path
              d={`M${ex - eyeW} ${eyeY} Q${ex} ${eyeY - lid - 2} ${ex + eyeW} ${eyeY} Q${ex} ${eyeY + lid} ${ex - eyeW} ${eyeY} Z`}
              fill="#F3EADA"
            />
            <path
              d={`M${ex - eyeW} ${eyeY} Q${ex} ${eyeY - lid - 2} ${ex + eyeW} ${eyeY} Q${ex} ${eyeY + lid} ${ex - eyeW} ${eyeY} Z`}
              fill={skin.deep}
              opacity="0.18"
            />
            <circle cx={ex + s * 0.6} cy={eyeY - 0.4} r="4.2" fill={iris} />
            <circle cx={ex + s * 0.6} cy={eyeY - 0.4} r="4.2" fill={`url(#${id}-iris)`} opacity="0.7" />
            <circle cx={ex + s * 0.6} cy={eyeY - 0.4} r="1.95" fill="#1D1712" />
            <circle cx={ex + s * 0.6 - 1.8} cy={eyeY - 2.2} r="1.2" fill="#FFE9C2" opacity="0.9" />
            <path
              d={`M${ex - eyeW} ${eyeY} Q${ex} ${eyeY - lid - 2.6} ${ex + eyeW} ${eyeY}`}
              stroke={skin.deep}
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d={`M${ex - eyeW + 1} ${eyeY - 1} Q${ex} ${eyeY - lid - 5} ${ex + eyeW - 1} ${eyeY - 1.6}`}
              stroke={skin.shade}
              strokeOpacity="0.42"
              strokeWidth="1.4"
              fill="none"
            />
            <path
              d={`M${ex - eyeW + 2} ${eyeY + 3} Q${ex} ${eyeY + lid - 0.4} ${ex + eyeW - 2} ${eyeY + 2.6}`}
              stroke={skin.deep}
              strokeOpacity="0.32"
              strokeWidth="1.2"
              fill="none"
            />
          </g>
        );
      })}

      {/* nez */}
      <path
        d={`M${CX - 2} ${eyeY + 2} Q${CX - 6} ${noseY - 12} ${CX - 7} ${noseY - 2} Q${CX - 8} ${noseY + 4} ${CX} ${noseY + 5} Q${CX + 8} ${noseY + 4} ${CX + 7} ${noseY - 2} Q${CX + 6} ${noseY - 12} ${CX + 2} ${eyeY + 2}`}
        fill="none"
        stroke={skin.shade}
        strokeOpacity="0.55"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d={`M${CX - 6} ${noseY + 4} Q${CX} ${noseY + 8} ${CX + 6} ${noseY + 4}`}
        stroke={skin.deep}
        strokeOpacity="0.42"
        strokeWidth="1.6"
        fill="none"
      />
      <path
        d={`M${CX - 3.4} ${eyeY + 8} Q${CX - 5} ${noseY - 8} ${CX - 4} ${noseY - 1}`}
        stroke={skin.light}
        strokeOpacity="0.6"
        strokeWidth="2.2"
        fill="none"
      />

      {/* bouche */}
      <g>
        <path
          d={`M${CX - 15} ${mouthY} Q${CX - 7} ${mouthY - 4.6} ${CX} ${mouthY - 1.6} Q${CX + 7} ${mouthY - 4.6} ${CX + 15} ${mouthY} Q${CX + 8} ${mouthY + 7 + spec.mouth * -1.4} ${CX} ${mouthY + 7 + spec.mouth * -1.4} Q${CX - 8} ${mouthY + 7 + spec.mouth * -1.4} ${CX - 15} ${mouthY} Z`}
          fill={skin.blush}
          opacity="0.85"
        />
        <path
          d={`M${CX - 15} ${mouthY + spec.mouth * -1.2} Q${CX} ${mouthY + 2 + spec.mouth * -2.4} ${CX + 15} ${mouthY + spec.mouth * -1.2}`}
          stroke={skin.deep}
          strokeOpacity="0.55"
          strokeWidth="1.8"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M${CX - 8} ${mouthY + 4} Q${CX} ${mouthY + 6} ${CX + 8} ${mouthY + 4}`}
          stroke={skin.light}
          strokeOpacity="0.4"
          strokeWidth="1.4"
          fill="none"
        />
        <path
          d={`M${CX - 5} ${mouthY + 12} Q${CX} ${mouthY + 14} ${CX + 5} ${mouthY + 12}`}
          stroke={skin.shade}
          strokeOpacity="0.34"
          strokeWidth="1.6"
          fill="none"
        />
      </g>

      {/* contour teinté, épaisseur variable : épais dans l'ombre, fin vers la lumière */}
      <path d={path} fill="none" stroke={skin.deep} strokeOpacity="0.42" strokeWidth="2.2" />
      <path
        d={`M${CX} ${crownY} C${CX - w * 0.94} ${crownY + 3} ${CX - w} ${cheekY - 30} ${CX - w} ${cheekY}`}
        fill="none"
        stroke={skin.shade}
        strokeOpacity="0.34"
        strokeWidth="1.2"
      />
    </g>
  );
}

/* ────────────────────────── Composant de portrait ───────────────────────── */

export interface PortraitPainterProps {
  spec: HeroPortraitSpec;
  size?: number;
  /** cadre : aucun, filet simple, enluminure complète avec cartouche */
  frame?: 'aucun' | 'simple' | 'enluminure';
  /** afficher le nom dans le cartouche (enluminure seulement) */
  showName?: boolean;
  title?: string;
  className?: string;
}

/** Peint un portrait de héros à partir de sa spécification. */
export function PortraitPainter(props: PortraitPainterProps): ReactElement {
  const { spec, size = 220, frame = 'enluminure', showName = true, title, className } = props;
  const id = useSvgId('pt');
  const g = faceGeom(spec.shape);
  const skin = SKINS[spec.skin];
  const hair = HAIRS[spec.hair];
  const ctx: PaintCtx = { id, g, skin, hair, spec };
  const shoulderY = g.chinY + 34;
  const detail = size >= 120;
  /* Portrait peint enregistré par l'application, s'il en existe un. */
  useSyncExternalStore(subscribePortraitSources, portraitSourcesVersion, portraitSourcesVersion);
  const peint = portraitSource(spec.id);
  const or = spec.faction === 'ermitage' ? 'cuivre' : 'or';

  return (
    <Drawing
      viewBox="0 0 280 340"
      width={size}
      height={Math.round((size * 340) / 280)}
      title={title ?? `Portrait de ${spec.name}`}
      className={cx('hmm-portrait', `hmm-portrait--${spec.faction}`, className)}
    >
      <defs>
        <Materials id={id} keys={['or', 'cuivre']} />
        <LightFilter id={id} strength={1.2} />
        <GrainFilter id={id} seed={spec.name.length * 7 + spec.age} frequency={0.62} slope={0.2} />
        <BlurFilter id={id} amount={2.6} />
        <clipPath id={`${id}-visage`}>
          <path d={facePath(g)} />
        </clipPath>
        <clipPath id={`${id}-tableau`}>
          <rect x="0" y="0" width="280" height="340" rx="3" />
        </clipPath>
        <radialGradient id={`${id}-iris`} cx="0.36" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#FFE9C2" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#FFE9C2" stopOpacity="0" />
          <stop offset="1" stopColor="#2A3242" stopOpacity="0.5" />
        </radialGradient>
        <linearGradient id={`${id}-ciel`} x1="0" y1="0" x2="0.8" y2="1">
          {spec.faction === 'ermitage' ? (
            <>
              <stop offset="0" stopColor="#3D5449" />
              <stop offset="0.45" stopColor="#22382B" />
              <stop offset="1" stopColor="#132318" />
            </>
          ) : spec.faction === 'neutre' ? (
            <>
              <stop offset="0" stopColor="#6E6355" />
              <stop offset="0.45" stopColor="#4A4238" />
              <stop offset="1" stopColor="#2C2418" />
            </>
          ) : (
            <>
              <stop offset="0" stopColor="#5A5F65" />
              <stop offset="0.42" stopColor="#3A3E43" />
              <stop offset="1" stopColor="#23262A" />
            </>
          )}
        </linearGradient>
        <radialGradient id={`${id}-vignette`} cx="0.36" cy="0.3" r="0.92">
          <stop offset="0" stopColor="#FFE9C2" stopOpacity="0.1" />
          <stop offset="0.5" stopColor="#FFE9C2" stopOpacity="0" />
          <stop offset="1" stopColor="#1A1F26" stopOpacity="0.62" />
        </radialGradient>
      </defs>

      {peint ? (
        /*
         * Portrait peint disponible : l'image remplace les quatorze couches
         * vectorielles, mais garde le même cadrage 280 × 340, le même grain et
         * le même cadre d'enluminure — la page reste homogène quel que soit le
         * héros, y compris si seuls quelques portraits peints existent.
         */
        <g clipPath={`url(#${id}-tableau)`}>
          <image
            href={peint}
            x="0"
            y="0"
            width="280"
            height="340"
            preserveAspectRatio="xMidYMid slice"
          />
          {detail ? <GrainVeil id={id} width={280} height={340} opacity={0.12} blend="soft-light" /> : null}
        </g>
      ) : (
      <g clipPath={`url(#${id}-tableau)`}>
        {/* 1–2. fond de faction, occlusion, vignettage */}
        <Background id={id} faction={spec.faction} />

        {/* halo de contre-jour : décolle la silhouette d'un fond sombre (loi n°4) */}
        <ellipse
          cx={CX - 6}
          cy={g.crownY + 66}
          rx={g.w * 2.05}
          ry={112}
          fill="#FFE9C2"
          opacity="0.11"
          filter={`url(#${id}-flou)`}
        />
        <ellipse
          cx={CX + 10}
          cy={g.crownY + 74}
          rx={g.w * 1.5}
          ry={92}
          fill="#C9A227"
          opacity="0.09"
          filter={`url(#${id}-flou)`}
        />

        {/* ombre portée du buste sur le fond, décalée au sud-est */}
        <ellipse cx={CX + 18} cy={shoulderY + 26} rx={118 * spec.build} ry="66" fill="#2A3242" opacity="0.34" filter={`url(#${id}-flou)`} />

        {/* 9a. chevelure arrière */}
        {hairBack(spec.hairStyle, g, hair)}

        {/* 3. buste */}
        {garmentLayer(spec.garment, g, spec.build, spec.cloth, spec.trim)}

        {/* 4. cou */}
        <path
          d={`M${CX - 20} ${g.chinY - 12} L${CX + 20} ${g.chinY - 12} L${CX + 24} ${shoulderY - 14} Q${CX} ${shoulderY - 4} ${CX - 24} ${shoulderY - 14} Z`}
          fill={skin.base}
        />
        <path
          d={`M${CX - 20} ${g.chinY - 12} Q${CX} ${g.chinY + 18} ${CX + 20} ${g.chinY - 12} L${CX + 22} ${g.chinY + 6} Q${CX} ${g.chinY + 30} ${CX - 22} ${g.chinY + 6} Z`}
          fill={skin.deep}
          opacity="0.44"
        />
        <path d={`M${CX - 18} ${g.chinY - 4} L${CX - 20} ${shoulderY - 16}`} stroke={skin.light} strokeOpacity="0.4" strokeWidth="4" fill="none" />

        {/* 5–8. visage */}
        <Face {...ctx} />

        {/* 9b. chevelure avant */}
        {hairFront(spec.hairStyle, g, hair, spec.age)}

        {/* 10. couvre-chef, posé sur la chevelure */}
        {headwear(spec.head, g, spec.cloth, spec.trim)}

        {/* 11. pilosité, qui déborde toujours du couvre-chef */}
        {facialHair(spec.facial, g, hair)}

        {/* détail signature */}
        {spec.extra ? spec.extra(ctx) : null}

        {/* 12. rim light dorée sur le flanc sud-est */}
        <path
          d={`M${CX + g.w * 0.96} ${g.crownY + 18} Q${CX + g.w + 3} ${g.cheekY + 10} ${CX + g.w * spec.build * 0.62} ${g.chinY + 2}`}
          stroke="#C9A227"
          strokeOpacity="0.4"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <path
          d={`M${CX + 44 * spec.build} ${shoulderY - 12} Q${CX + 104 * spec.build - 6} ${shoulderY + 8} ${CX + 104 * spec.build} 340`}
          stroke="#C9A227"
          strokeOpacity="0.4"
          strokeWidth="3.4"
          fill="none"
        />

        {/* 13. grain général */}
        {detail ? <GrainVeil id={id} width={280} height={340} opacity={0.2} blend="soft-light" /> : null}
      </g>
      )}

      {/* 14. cadre */}
      {frame === 'simple' ? (
        <rect
          x="1.6"
          y="1.6"
          width="276.8"
          height="336.8"
          fill="none"
          stroke={mat(id, or)}
          strokeWidth="3.2"
          rx="2"
        />
      ) : null}
      {frame === 'enluminure' ? (
        <g filter={`url(#${id}-lit)`}>
          <IlluminationBorder
            id={id}
            width={280}
            height={340}
            name={showName && detail ? spec.name : undefined}
            tone={or}
            weight={4}
          />
        </g>
      ) : null}
    </Drawing>
  );
}
