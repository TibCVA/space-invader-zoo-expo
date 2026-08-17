/**
 * Slider — réglette de ferrure (volume, échelle de texte, difficulté).
 *
 * Construite sur `<input type="range">` : la navigation clavier, le pas et le
 * support des technologies d'assistance sont natifs. La peau est entièrement
 * redessinée dans `styles.css` ; la cible tactile fait 48 px de haut.
 */

import { useId } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';

export interface SliderProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** libellé français du réglage */
  label: ReactNode;
  /** valeur affichée à droite ; par défaut la valeur brute */
  display?: ReactNode;
  /** graduations dessinées sous la piste */
  ticks?: readonly number[];
  disabled?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Réglette. */
export function Slider(props: SliderProps): ReactElement {
  const {
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    label,
    display,
    ticks = [],
    disabled = false,
    className,
    style,
  } = props;
  const id = useId();
  const etendue = Math.max(1, max - min);
  const part = Math.max(0, Math.min(1, (value - min) / etendue));
  return (
    <div
      className={cx('hmm-curseur', disabled && 'hmm-curseur--inactif', className)}
      style={{ ...style, ['--hmm-curseur-part' as string]: `${(part * 100).toFixed(2)}%` }}
    >
      <div className="hmm-curseur__entete">
        <label className="hmm-curseur__libelle" htmlFor={id}>
          {label}
        </label>
        <span className="hmm-curseur__valeur hmm-donnee--gras">{display ?? value}</span>
      </div>
      <div className="hmm-curseur__piste">
        <span className="hmm-curseur__remplissage" aria-hidden="true" />
        <input
          id={id}
          type="range"
          className="hmm-curseur__entree"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(Number(e.currentTarget.value))}
        />
        {ticks.map((t) => (
          <span
            key={t}
            className="hmm-curseur__graduation"
            style={{ left: `${(((t - min) / etendue) * 100).toFixed(2)}%` }}
            aria-hidden="true"
          />
        ))}
      </div>
    </div>
  );
}
