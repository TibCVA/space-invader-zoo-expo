/**
 * HeroPortrait — le composant public : `heroId`, `size`, `frame`.
 *
 * Le portrait est peint par `PortraitPainter` à partir de la spécification du
 * héros. En 56 px il reste lisible (silhouette, couvre-chef, couleur de
 * faction) ; en 320 px il révèle le modelé, les rides, le grain et le détail
 * signature.
 */

import type { CSSProperties, ReactElement } from 'react';
import { PortraitPainter } from './kit.js';
import { HERO_PORTRAITS } from './heroes.js';
import { cx } from '../tokens.js';

export type PortraitFrame = 'aucun' | 'simple' | 'enluminure';

export interface HeroPortraitProps {
  /** identifiant du héros — `paul`, `anastasia`, `jules`… */
  heroId: string;
  /** largeur en pixels ; la hauteur suit le rapport 280 × 340 */
  size?: number;
  frame?: PortraitFrame;
  /** afficher le nom dans le cartouche du cadre d'enluminure */
  showName?: boolean;
  /** libellé accessible ; par défaut « Portrait de <nom> » */
  title?: string;
  className?: string;
  style?: CSSProperties;
}

/** Portrait d'un des vingt-et-un héros. */
export function HeroPortrait(props: HeroPortraitProps): ReactElement {
  const { heroId, size = 140, frame = 'enluminure', showName = true, title, className, style } = props;
  const spec = HERO_PORTRAITS[heroId];
  if (!spec) {
    return (
      <span
        className={cx('hmm-portrait-absent', className)}
        style={{ width: size, height: Math.round((size * 340) / 280), ...style }}
        role="img"
        aria-label={title ?? `Portrait inconnu : ${heroId}`}
        title={title ?? `Portrait inconnu : ${heroId}`}
      />
    );
  }
  return (
    <span className={cx('hmm-portrait-hote', className)} style={style}>
      <PortraitPainter spec={spec} size={size} frame={frame} showName={showName} title={title} />
    </span>
  );
}

/** Vignette ronde de héros, pour les listes et la barre de héros. */
export function HeroAvatar({
  heroId,
  size = 56,
  title,
  className,
  style,
}: Omit<HeroPortraitProps, 'frame' | 'showName'>): ReactElement {
  return (
    <span className={cx('hmm-vignette-heros', className)} style={{ width: size, height: size, ...style }}>
      <HeroPortrait heroId={heroId} size={size * 1.32} frame="aucun" showName={false} title={title} />
    </span>
  );
}
