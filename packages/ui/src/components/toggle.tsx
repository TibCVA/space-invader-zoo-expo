/**
 * Toggle — bascule à targette de ferrure.
 *
 * L'état est lisible **sans couleur** : la targette se déplace et la mention
 * « Activé » / « Désactivé » accompagne toujours le contrôle.
 */

import { useId } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';

export interface ToggleProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** libellé français du réglage */
  label: ReactNode;
  /** précision affichée sous le libellé */
  hint?: ReactNode;
  disabled?: boolean;
  /** masquer la mention d'état à droite */
  hideState?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Bascule d'option. */
export function Toggle(props: ToggleProps): ReactElement {
  const { checked, onChange, label, hint, disabled = false, hideState = false, className, style } = props;
  const id = useId();
  return (
    <div className={cx('hmm-bascule', disabled && 'hmm-bascule--inactive', className)} style={style}>
      <label className="hmm-bascule__texte" htmlFor={id}>
        <span className="hmm-bascule__libelle">{label}</span>
        {hint ? <span className="hmm-bascule__precision">{hint}</span> : null}
      </label>
      <div className="hmm-bascule__commande">
        {hideState ? null : (
          <span className="hmm-bascule__etat hmm-donnee" aria-hidden="true">
            {checked ? 'Activé' : 'Désactivé'}
          </span>
        )}
        <button
          id={id}
          type="button"
          role="switch"
          aria-checked={checked}
          disabled={disabled}
          onClick={() => onChange(!checked)}
          className={cx('hmm-bascule__piste', checked && 'hmm-bascule__piste--active')}
        >
          <span className="hmm-bascule__targette" aria-hidden="true">
            <span className="hmm-bascule__rivet" />
          </span>
        </button>
      </div>
    </div>
  );
}
