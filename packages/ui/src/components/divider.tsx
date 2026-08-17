/**
 * Divider — séparateur d'enluminure : filet double, losange central facultatif,
 * ou cartouche de titre de section.
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';

export interface DividerProps {
  /** titre porté au centre du filet, en Cinzel */
  label?: ReactNode;
  orientation?: 'horizontal' | 'vertical';
  /** filet nu, sans losange ni titre */
  plain?: boolean;
  /** version claire, pour les fonds sombres */
  onDark?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Séparateur. */
export function Divider(props: DividerProps): ReactElement {
  const { label, orientation = 'horizontal', plain = false, onDark = false, className, style } = props;
  if (orientation === 'vertical') {
    return (
      <span
        role="separator"
        aria-orientation="vertical"
        className={cx('hmm-separateur', 'hmm-separateur--vertical', onDark && 'hmm-separateur--clair', className)}
        style={style}
      />
    );
  }
  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      className={cx('hmm-separateur', onDark && 'hmm-separateur--clair', className)}
      style={style}
    >
      <span className="hmm-separateur__filet" aria-hidden="true" />
      {plain ? null : label ? (
        <span className="hmm-separateur__titre hmm-titre hmm-titre--cartouche">{label}</span>
      ) : (
        <span className="hmm-separateur__losange" aria-hidden="true" />
      )}
      <span className="hmm-separateur__filet" aria-hidden="true" />
    </div>
  );
}
