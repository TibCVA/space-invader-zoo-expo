/**
 * Frame — cadre d'enluminure autour d'un contenu quelconque.
 *
 * Filet doré double, écoinçons feuillagés, cartouche de nom en Cinzel
 * (bible artistique §7). Le cadre est un calque SVG superposé, jamais une
 * bordure CSS : c'est ce qui permet les feuillages et le cartouche.
 */

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { IlluminationBorder } from '../heraldry.js';
import { LightFilter, Materials, useSvgId } from '../svg-kit.js';
import { cx } from '../tokens.js';

export interface FrameProps {
  /** nom porté par le cartouche du bas */
  name?: string;
  /** teinte du filet */
  tone?: 'or' | 'cuivre';
  /** épaisseur du filet extérieur, en pixels */
  weight?: number;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Encadre son contenu d'une enluminure dorée dessinée en SVG. */
export function Frame({
  name,
  tone = 'or',
  weight = 3,
  className,
  style,
  children,
}: FrameProps): ReactElement {
  const id = useSvgId('fr');
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 240, h: 160 });

  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => {
      setSize({ w: Math.max(24, el.clientWidth), h: Math.max(24, el.clientHeight) });
    });
    ro.observe(el);
    setSize({ w: Math.max(24, el.clientWidth), h: Math.max(24, el.clientHeight) });
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={boxRef} className={cx('hmm-cadre', className)} style={style}>
      <div className={cx('hmm-cadre__contenu', name && 'hmm-cadre__contenu--cartouche')}>{children}</div>
      <svg
        className="hmm-cadre__enluminure"
        viewBox={`0 0 ${size.w} ${size.h}`}
        width={size.w}
        height={size.h}
        aria-hidden="true"
        focusable="false"
      >
        <defs>
          <Materials id={id} keys={['or', 'cuivre']} />
          <LightFilter id={id} strength={1.1} />
        </defs>
        <g filter={`url(#${id}-lit)`}>
          <IlluminationBorder id={id} width={size.w} height={size.h} name={name} tone={tone} weight={weight} />
        </g>
      </svg>
    </div>
  );
}
