/**
 * Dialog — surface modale de parchemin sur voile de nuit.
 *
 * `role="dialog"`, `aria-modal`, piège à focus, fermeture par Échap et par le
 * voile. L'animation d'ouverture dure 180 ms sur la courbe unique.
 */

import { useCallback, useId, useRef } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';
import { useFocusTrap } from './use-focus-trap.js';
import { IconButton } from './icon-button.js';
import { IconFermer } from '../icons/core-icons.js';

export type DialogSize = 'petit' | 'moyen' | 'grand' | 'plein';

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** pied de dialogue : boutons d'action, alignés à droite */
  footer?: ReactNode;
  size?: DialogSize;
  /** interdire la fermeture par le voile (décision engageante) */
  persistent?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Dialogue modal. */
export function Dialog(props: DialogProps): ReactElement | null {
  const {
    open,
    onClose,
    title,
    subtitle,
    footer,
    size = 'moyen',
    persistent = false,
    className,
    style,
    children,
  } = props;
  const id = useId();
  const box = useRef<HTMLDivElement | null>(null);
  const escape = useCallback(() => {
    if (!persistent) onClose();
  }, [persistent, onClose]);
  useFocusTrap(box, open, escape);

  if (!open) return null;

  return (
    <div className="hmm-voile" role="presentation" onMouseDown={persistent ? undefined : onClose}>
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-titre`}
        aria-describedby={subtitle ? `${id}-sous` : undefined}
        className={cx('hmm-dialogue', `hmm-dialogue--${size}`, 'hmm-mat-parchemin', className)}
        style={style}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="hmm-dialogue__entete">
          <div className="hmm-dialogue__titres">
            <h2 id={`${id}-titre`} className="hmm-titre hmm-dialogue__titre">
              {title}
            </h2>
            {subtitle ? (
              <p id={`${id}-sous`} className="hmm-dialogue__soustitre">
                {subtitle}
              </p>
            ) : null}
          </div>
          <IconButton label="Fermer" variant="fantome" size="compact" onClick={onClose}>
            <IconFermer size={20} />
          </IconButton>
        </header>
        <div className="hmm-dialogue__corps">{children}</div>
        {footer ? <footer className="hmm-dialogue__pied">{footer}</footer> : null}
      </div>
    </div>
  );
}
