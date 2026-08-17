/**
 * Tooltip — info-bulle de parchemin.
 *
 * Accessibilité : l'info-bulle s'ouvre au survol **et** au focus clavier, se
 * ferme sur Échap, et n'est jamais le seul porteur d'une information
 * indispensable (non négociable n°10).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';

export type TooltipPlacement = 'haut' | 'bas' | 'gauche' | 'droite';

export interface TooltipProps {
  /** contenu de l'info-bulle, en français */
  content: ReactNode;
  placement?: TooltipPlacement;
  /** délai d'ouverture au survol, en millisecondes */
  delay?: number;
  className?: string;
  style?: CSSProperties;
  /** l'élément déclencheur */
  children: ReactNode;
}

/** Info-bulle de parchemin, ouverte au survol et au focus. */
export function Tooltip({
  content,
  placement = 'haut',
  delay = 180,
  className,
  style,
  children,
}: TooltipProps): ReactElement {
  const id = useId();
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clear();
    timer.current = setTimeout(() => setOpen(true), delay);
  }, [clear, delay]);

  const hide = useCallback(() => {
    clear();
    setOpen(false);
  }, [clear]);

  useEffect(() => clear, [clear]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') hide();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, hide]);

  return (
    <span
      className={cx('hmm-infobulle-ancre', className)}
      style={style}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      <span aria-describedby={open ? id : undefined} className="hmm-infobulle-ancre__cible">
        {children}
      </span>
      <span
        id={id}
        role="tooltip"
        hidden={!open}
        className={cx('hmm-infobulle', `hmm-infobulle--${placement}`, open && 'hmm-infobulle--ouverte')}
      >
        <span className="hmm-infobulle__corps">{content}</span>
        <span className="hmm-infobulle__pointe" aria-hidden="true" />
      </span>
    </span>
  );
}
