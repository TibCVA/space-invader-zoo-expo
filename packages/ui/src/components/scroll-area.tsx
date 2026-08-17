/**
 * ScrollArea — zone de défilement à ombres de bord.
 *
 * Les ombres haute et basse apparaissent seulement quand il reste du contenu
 * dans cette direction : l'utilisateur voit toujours qu'il peut continuer.
 * La zone est focalisable au clavier pour rester défilable sans souris.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';

export interface ScrollAreaProps {
  /** hauteur maximale ; au-delà, le contenu défile */
  maxHeight?: number | string;
  /** défilement horizontal plutôt que vertical */
  horizontal?: boolean;
  className?: string;
  style?: CSSProperties;
  /** libellé accessible de la zone */
  label?: string;
  children?: ReactNode;
}

/** Zone de défilement encadrée. */
export function ScrollArea(props: ScrollAreaProps): ReactElement {
  const { maxHeight = 320, horizontal = false, className, style, label, children } = props;
  const zone = useRef<HTMLDivElement | null>(null);
  const [bords, setBords] = useState({ debut: false, fin: false });

  const mesurer = useCallback(() => {
    const el = zone.current;
    if (!el) return;
    if (horizontal) {
      setBords({
        debut: el.scrollLeft > 2,
        fin: el.scrollLeft + el.clientWidth < el.scrollWidth - 2,
      });
    } else {
      setBords({
        debut: el.scrollTop > 2,
        fin: el.scrollTop + el.clientHeight < el.scrollHeight - 2,
      });
    }
  }, [horizontal]);

  useEffect(() => {
    mesurer();
    const el = zone.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(mesurer);
    ro.observe(el);
    return () => ro.disconnect();
  }, [mesurer, children]);

  return (
    <div
      className={cx(
        'hmm-defilement',
        horizontal && 'hmm-defilement--horizontal',
        bords.debut && 'hmm-defilement--debut',
        bords.fin && 'hmm-defilement--fin',
        className,
      )}
      style={style}
    >
      <div
        ref={zone}
        className="hmm-defilement__zone"
        style={horizontal ? undefined : { maxHeight }}
        onScroll={mesurer}
        tabIndex={0}
        role="group"
        aria-label={label}
      >
        {children}
      </div>
      <span className="hmm-defilement__ombre hmm-defilement__ombre--debut" aria-hidden="true" />
      <span className="hmm-defilement__ombre hmm-defilement__ombre--fin" aria-hidden="true" />
    </div>
  );
}
