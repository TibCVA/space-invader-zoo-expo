/**
 * Stat — couple libellé / valeur, avec icône dessinée et variation éventuelle.
 * Employé pour les caractéristiques de héros, les fiches de créature et les
 * bilans de royaume.
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';

export type StatTone = 'neutre' | 'faveur' | 'defaveur' | 'or';
export type StatOrientation = 'ligne' | 'colonne';

export interface StatProps {
  /** libellé français, toujours écrit en toutes lettres */
  label: ReactNode;
  value: ReactNode;
  /** icône dessinée */
  icon?: ReactNode;
  /** variation par rapport à la valeur de base : « +2 », « −1 » */
  delta?: number;
  /** unité ou précision affichée en petit */
  hint?: ReactNode;
  tone?: StatTone;
  orientation?: StatOrientation;
  size?: 'normal' | 'grand' | 'compact';
  className?: string;
  style?: CSSProperties;
}

function signe(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `−${Math.abs(n)}`;
  return '±0';
}

/** Caractéristique affichée. */
export function Stat(props: StatProps): ReactElement {
  const {
    label,
    value,
    icon,
    delta,
    hint,
    tone = 'neutre',
    orientation = 'ligne',
    size = 'normal',
    className,
    style,
  } = props;
  return (
    <div
      className={cx(
        'hmm-stat',
        `hmm-stat--${orientation}`,
        `hmm-stat--${size}`,
        `hmm-stat--${tone}`,
        className,
      )}
      style={style}
    >
      {icon ? (
        <span className="hmm-stat__icone" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <span className="hmm-stat__texte">
        <span className="hmm-stat__libelle">{label}</span>
        <span className="hmm-stat__valeurs">
          <span className="hmm-stat__valeur hmm-donnee--gras">{value}</span>
          {delta === undefined || delta === 0 ? null : (
            <span
              className={cx(
                'hmm-stat__delta',
                delta > 0 ? 'hmm-stat__delta--hausse' : 'hmm-stat__delta--baisse',
              )}
            >
              {signe(delta)}
            </span>
          )}
          {hint ? <span className="hmm-stat__precision">{hint}</span> : null}
        </span>
      </span>
    </div>
  );
}
