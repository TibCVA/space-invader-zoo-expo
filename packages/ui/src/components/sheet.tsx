/**
 * Sheet — panneau mobile remontant du bas, avec poignée et inertie.
 *
 * Le glissement suit le doigt, la relâche applique l'inertie : au-delà d'un
 * quart de la hauteur ou d'une vitesse de 0,6 px/ms vers le bas, la feuille se
 * referme ; sinon elle revient en place sur 220 ms.
 *
 * Le respect de `prefers-reduced-motion` est assuré par `styles.css`, qui
 * neutralise les transitions.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';
import { useFocusTrap } from './use-focus-trap.js';

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** hauteur cible, en fraction de la fenêtre (0,3 à 1) */
  height?: number;
  /** afficher le voile derrière la feuille */
  scrim?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

const SEUIL_FRACTION = 0.25;
const SEUIL_VITESSE = 0.6;

/** Feuille mobile remontant du bas. */
export function Sheet(props: SheetProps): ReactElement | null {
  const { open, onClose, title, height = 0.62, scrim = true, className, style, children } = props;
  const id = useId();
  const box = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const geste = useRef({ y0: 0, y1: 0, t1: 0, v: 0, h: 1 });

  useFocusTrap(box, open, onClose);

  useEffect(() => {
    if (open) setOffset(0);
  }, [open]);

  const onDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const el = box.current;
    if (!el) return;
    el.setPointerCapture?.(e.pointerId);
    geste.current = { y0: e.clientY, y1: e.clientY, t1: performance.now(), v: 0, h: el.clientHeight || 1 };
    setDragging(true);
  }, []);

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const g = geste.current;
      const now = performance.now();
      const dt = Math.max(1, now - g.t1);
      g.v = (e.clientY - g.y1) / dt;
      g.y1 = e.clientY;
      g.t1 = now;
      const dy = e.clientY - g.y0;
      // Résistance élastique vers le haut : la feuille ne monte pas au-delà.
      setOffset(dy >= 0 ? dy : dy / 4);
    },
    [dragging],
  );

  const onUp = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    const g = geste.current;
    const partie = offset / g.h;
    if (partie > SEUIL_FRACTION || g.v > SEUIL_VITESSE) {
      setOffset(g.h);
      window.setTimeout(onClose, 200);
    } else {
      setOffset(0);
    }
  }, [dragging, offset, onClose]);

  if (!open) return null;

  const style1: CSSProperties = {
    ...style,
    height: `${Math.round(Math.min(1, Math.max(0.3, height)) * 100)}%`,
    transform: `translate3d(0, ${Math.max(0, offset)}px, 0)`,
    transition: dragging ? 'none' : undefined,
  };

  return (
    <div className={cx('hmm-feuille-hote', scrim && 'hmm-feuille-hote--voile')} role="presentation">
      {scrim ? <div className="hmm-feuille__voile" onMouseDown={onClose} /> : null}
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? `${id}-titre` : undefined}
        aria-label={title ? undefined : 'Panneau'}
        className={cx('hmm-feuille', 'hmm-mat-parchemin', dragging && 'hmm-feuille--glisse', className)}
        style={style1}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <div
          className="hmm-feuille__prise"
          onPointerDown={onDown}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Poignée du panneau — glisser vers le bas pour fermer"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Escape' || e.key === 'ArrowDown') onClose();
          }}
        >
          <span className="hmm-feuille__poignee" aria-hidden="true" />
        </div>
        {title ? (
          <header className="hmm-feuille__entete">
            <h2 id={`${id}-titre`} className="hmm-titre hmm-feuille__titre">
              {title}
            </h2>
          </header>
        ) : null}
        <div className="hmm-feuille__corps">{children}</div>
      </div>
    </div>
  );
}
