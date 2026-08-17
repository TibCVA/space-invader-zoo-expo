/**
 * IconButton — bouton carré de 48 px minimum, portant une icône dessinée.
 * Le libellé accessible est **obligatoire** : aucune commande ne dépend d'une
 * icône muette.
 */

import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';

export type IconButtonVariant = 'ferrure' | 'parchemin' | 'fantome' | 'danger' | 'or';
export type IconButtonSize = 'normal' | 'grand' | 'compact';

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'aria-label'> {
  /** libellé accessible, en français — jamais vide */
  label: string;
  variant?: IconButtonVariant;
  size?: IconButtonSize;
  /** état enfoncé pour un bouton bascule */
  pressed?: boolean;
  className?: string;
  children: ReactNode;
}

/** Bouton-icône ferré. */
export function IconButton(props: IconButtonProps): ReactElement {
  const {
    label,
    variant = 'ferrure',
    size = 'normal',
    pressed,
    className,
    children,
    type = 'button',
    ...rest
  } = props;
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      className={cx(
        'hmm-bouton-icone',
        `hmm-bouton-icone--${variant}`,
        `hmm-bouton-icone--${size}`,
        pressed && 'hmm-bouton-icone--enfonce',
        className,
      )}
    >
      <span className="hmm-bouton__fond" aria-hidden="true" />
      <span className="hmm-bouton-icone__dessin">{children}</span>
    </button>
  );
}
