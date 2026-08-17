/**
 * ProgressBar — jauge sertie dans une gouttière de ferrure.
 *
 * Trois strates : gouttière creusée, remplissage à dégradé, éclat de bord.
 * Le nombre est toujours écrit à côté : la barre seule n'est pas une donnée.
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';

export type ProgressTone = 'or' | 'grenat' | 'sinople' | 'azur' | 'braises' | 'sources' | 'brumes' | 'racines';

export interface ProgressBarProps {
  value: number;
  max?: number;
  /** libellé accessible, obligatoire pour une jauge porteuse de sens */
  label: string;
  /** texte affiché à droite ; par défaut « valeur / max » */
  caption?: ReactNode;
  /** masquer la légende chiffrée (jauge purement décorative) */
  hideCaption?: boolean;
  tone?: ProgressTone;
  size?: 'normal' | 'fin' | 'epais';
  /** repères intermédiaires, en valeur absolue */
  marks?: readonly number[];
  className?: string;
  style?: CSSProperties;
}

/** Jauge de progression. */
export function ProgressBar(props: ProgressBarProps): ReactElement {
  const {
    value,
    max = 100,
    label,
    caption,
    hideCaption = false,
    tone = 'or',
    size = 'normal',
    marks = [],
    className,
    style,
  } = props;
  const borne = Math.max(1, max);
  const part = Math.max(0, Math.min(1, value / borne));
  const pourcent = `${(part * 100).toFixed(1)}%`;
  return (
    <div className={cx('hmm-jauge', `hmm-jauge--${size}`, `hmm-jauge--${tone}`, className)} style={style}>
      <div
        className="hmm-jauge__gouttiere"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={borne}
        aria-valuenow={Math.round(value)}
        aria-valuetext={`${Math.round(value)} sur ${Math.round(borne)}`}
      >
        <span className="hmm-jauge__remplissage" style={{ width: pourcent }}>
          <span className="hmm-jauge__eclat" aria-hidden="true" />
        </span>
        {marks.map((m) => (
          <span
            key={m}
            className="hmm-jauge__repere"
            style={{ left: `${Math.max(0, Math.min(100, (m / borne) * 100)).toFixed(1)}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
      {hideCaption ? null : (
        <span className="hmm-jauge__legende hmm-donnee">
          {caption ?? `${Math.round(value)} / ${Math.round(borne)}`}
        </span>
      )}
    </div>
  );
}
