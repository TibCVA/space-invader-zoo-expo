/**
 * Badge — pastille de qualification : rareté d'artefact, rang de compétence,
 * école de sort, état d'un héros. La teinte est toujours doublée d'un mot.
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';

export type BadgeTone =
  | 'neutre'
  | 'or'
  | 'grenat'
  | 'sinople'
  | 'azur'
  | 'commun'
  | 'rare'
  | 'majeur'
  | 'relique'
  | 'braises'
  | 'sources'
  | 'brumes'
  | 'racines';

export interface BadgeProps {
  tone?: BadgeTone;
  /** icône dessinée placée avant le texte */
  icon?: ReactNode;
  size?: 'normal' | 'compact';
  /** contour seul, pour un badge discret */
  outline?: boolean;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

/** Pastille de qualification. */
export function Badge(props: BadgeProps): ReactElement {
  const { tone = 'neutre', icon, size = 'normal', outline = false, className, style, children } = props;
  return (
    <span
      className={cx(
        'hmm-badge',
        `hmm-badge--${tone}`,
        `hmm-badge--${size}`,
        outline && 'hmm-badge--contour',
        className,
      )}
      style={style}
    >
      {icon ? (
        <span className="hmm-badge__icone" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="hmm-badge__texte">{children}</span>
    </span>
  );
}
