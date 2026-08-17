/**
 * Select — liste de choix montée sur `<select>` natif.
 *
 * Le natif garantit le clavier, le tactile et les technologies d'assistance ;
 * seule la peau est redessinée (gouttière de ferrure, chevron dessiné).
 */

import { useId } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';
import { IconChevron } from '../icons/core-icons.js';

export interface SelectOption {
  value: string;
  /** libellé français */
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (next: string) => void;
  options: readonly SelectOption[];
  /** libellé français du champ */
  label: ReactNode;
  hint?: ReactNode;
  disabled?: boolean;
  /** message d'erreur en français ; passe le champ en état invalide */
  error?: string;
  className?: string;
  style?: CSSProperties;
}

/** Champ de sélection. */
export function Select(props: SelectProps): ReactElement {
  const { value, onChange, options, label, hint, disabled = false, error, className, style } = props;
  const id = useId();
  return (
    <div
      className={cx('hmm-selecteur', disabled && 'hmm-selecteur--inactif', error && 'hmm-selecteur--invalide', className)}
      style={style}
    >
      <label className="hmm-selecteur__libelle" htmlFor={id}>
        {label}
      </label>
      <div className="hmm-selecteur__gouttiere">
        <select
          id={id}
          className="hmm-selecteur__champ"
          value={value}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-erreur` : hint ? `${id}-aide` : undefined}
          onChange={(e) => onChange(e.currentTarget.value)}
        >
          {options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="hmm-selecteur__chevron" aria-hidden="true">
          <IconChevron size={18} />
        </span>
      </div>
      {error ? (
        <p id={`${id}-erreur`} className="hmm-selecteur__erreur" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-aide`} className="hmm-selecteur__aide">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
