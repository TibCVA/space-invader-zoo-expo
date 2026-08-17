/**
 * Fabrique d'icônes — toutes les icônes du jeu sont dessinées à la main ici.
 *
 * Aucune icône emoji, aucune police d'icônes, aucun fichier : uniquement du SVG
 * vectoriel construit sur la grille 32 × 32, éclairé par la lumière unique du
 * nord-ouest et fini d'un liseré doré au sud-est.
 */

import type { ReactElement, ReactNode } from 'react';
import {
  Drawing,
  GrainFilter,
  GrainVeil,
  LightFilter,
  Materials,
  mat,
  matInk,
  matR,
  useSvgId,
} from '../svg-kit.js';
import type { DrawingProps, MaterialKey } from '../svg-kit.js';
import { cx } from '../tokens.js';

export type IconProps = DrawingProps;
export type IconComponent = (props: IconProps) => ReactElement;

export interface IconRecipe {
  /** matières employées, en dégradé linéaire */
  mats: readonly MaterialKey[];
  /** matières employées en dégradé radial (gemmes, sphères) */
  radial?: readonly MaterialKey[];
  /** graine du grain, pour que deux icônes voisines ne portent pas le même */
  seed?: number;
  /** dessin ; reçoit le préfixe d'identifiants de l'instance */
  draw: (id: string) => ReactNode;
}

/** Contour teinté, jamais noir (loi n°6). L'épaisseur varie avec la matière. */
export function contour(key: MaterialKey, width = 1.05) {
  return {
    stroke: matInk(key),
    strokeWidth: width,
    strokeLinejoin: 'round',
    strokeLinecap: 'round',
  } as const;
}

/** Hachure de matière : la texture visible à grande taille. */
export function hatch(d: string, color: string, opacity = 0.22, width = 0.7): ReactElement {
  return (
    <path
      d={d}
      fill="none"
      stroke={color}
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
}

/** Haute lumière chaude posée au nord-ouest de la forme. */
export function keyLight(d: string, opacity = 0.42, width = 1.1): ReactElement {
  return (
    <path
      d={d}
      fill="none"
      stroke="#FFE9C2"
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
}

/** Ombre propre froide posée au sud-est de la forme. */
export function coolShade(d: string, opacity = 0.34, width = 1.2): ReactElement {
  return (
    <path
      d={d}
      fill="none"
      stroke="#3A4657"
      strokeOpacity={opacity}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
}

/**
 * Construit un composant d'icône à partir d'une recette.
 * Le grain n'est calculé qu'au-delà de 28 px : invisible plus petit, coûteux
 * pour rien.
 */
export function makeIcon(recipe: IconRecipe): IconComponent {
  const { mats, radial, seed = 7, draw } = recipe;
  function HmmIcon({ size = 24, title, className, style }: IconProps): ReactElement {
    const id = useSvgId('ic');
    const grain = size >= 28;
    return (
      <Drawing
        viewBox="0 0 32 32"
        size={size}
        title={title}
        className={cx('hmm-icone', className)}
        style={style}
      >
        <defs>
          <Materials id={id} keys={mats} radial={radial} />
          <LightFilter id={id} strength={size >= 40 ? 1.3 : 1} />
          {grain ? <GrainFilter id={id} seed={seed} frequency={0.94} slope={0.15} /> : null}
        </defs>
        <g filter={`url(#${id}-lit)`}>{draw(id)}</g>
        {grain ? <GrainVeil id={id} width={32} height={32} opacity={0.11} /> : null}
      </Drawing>
    );
  }
  return HmmIcon;
}

export { mat, matR, matInk };
export type { MaterialKey };
