/**
 * Button — hauteur minimale 48 px, coins 3 px, dégradé vertical subtil,
 * états `:hover` (+6 % et liseré doré), `:active` (enfoncement 1 px),
 * `:disabled` (désaturation 70 %) et `:focus-visible` (double anneau).
 */

import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';

export type ButtonVariant = 'principal' | 'secondaire' | 'fantome' | 'danger' | 'or';
export type ButtonSize = 'normal' | 'grand' | 'compact';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** icône dessinée, placée avant le libellé */
  leading?: ReactNode;
  /** icône dessinée, placée après le libellé */
  trailing?: ReactNode;
  /** occupe toute la largeur disponible */
  block?: boolean;
  /** état d'attente : le bouton reste cliquable au clavier mais annonce l'attente */
  busy?: boolean;
  className?: string;
  children?: ReactNode;
}

/** Bouton de ferronnerie. Le libellé est toujours en français. */
export function Button(props: ButtonProps): ReactElement {
  const {
    variant = 'secondaire',
    size = 'normal',
    leading,
    trailing,
    block = false,
    busy = false,
    className,
    children,
    type = 'button',
    disabled,
    ...rest
  } = props;
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      aria-busy={busy || undefined}
      className={cx(
        'hmm-bouton',
        `hmm-bouton--${variant}`,
        `hmm-bouton--${size}`,
        block && 'hmm-bouton--bloc',
        busy && 'hmm-bouton--attente',
        className,
      )}
    >
      <span className="hmm-bouton__fond" aria-hidden="true" />
      {leading ? <span className="hmm-bouton__icone">{leading}</span> : null}
      <span className="hmm-bouton__libelle">{children}</span>
      {trailing ? <span className="hmm-bouton__icone">{trailing}</span> : null}
    </button>
  );
}
