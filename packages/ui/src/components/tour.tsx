/**
 * Tour — visite guidée de l'interface.
 *
 * Chaque étape désigne une cible du document (sélecteur CSS), l'entoure d'un
 * halo doré découpé dans le voile, et présente une carte de parchemin placée
 * du côté disponible. Navigation clavier complète : flèches, Entrée, Échap.
 */

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';
import { Button } from './button.js';
import { IconChevron, IconFermer } from '../icons/core-icons.js';

export interface TourStep {
  /** sélecteur CSS de l'élément mis en avant ; absent = étape centrée */
  target?: string;
  title: ReactNode;
  text: ReactNode;
  /** côté préféré de la carte */
  side?: 'haut' | 'bas' | 'gauche' | 'droite';
}

export interface TourProps {
  open: boolean;
  steps: readonly TourStep[];
  /** index contrôlé de l'étape courante */
  index?: number;
  onIndexChange?: (next: number) => void;
  onClose: () => void;
  /** appelé quand la dernière étape est validée */
  onFinish?: () => void;
  className?: string;
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const MARGE = 10;

/** Visite guidée. */
export function Tour(props: TourProps): ReactElement | null {
  const { open, steps, index, onIndexChange, onClose, onFinish, className } = props;
  const uid = useId();
  const [interne, setInterne] = useState(0);
  const courant = index ?? interne;
  const [rect, setRect] = useState<Rect | null>(null);
  const carte = useRef<HTMLDivElement | null>(null);

  const aller = useCallback(
    (n: number) => {
      const borne = Math.max(0, Math.min(steps.length - 1, n));
      if (index === undefined) setInterne(borne);
      onIndexChange?.(borne);
    },
    [steps.length, index, onIndexChange],
  );

  const etape = steps[courant];

  useLayoutEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const mesurer = (): void => {
      if (!etape?.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(etape.target);
      if (!el) {
        setRect(null);
        return;
      }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    mesurer();
    window.addEventListener('resize', mesurer);
    window.addEventListener('scroll', mesurer, true);
    return () => {
      window.removeEventListener('resize', mesurer);
      window.removeEventListener('scroll', mesurer, true);
    };
  }, [open, etape]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' || e.key === 'Enter') {
        e.preventDefault();
        if (courant >= steps.length - 1) {
          onFinish?.();
          onClose();
        } else aller(courant + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        aller(courant - 1);
      }
    };
    document.addEventListener('keydown', onKey);
    carte.current?.focus({ preventScroll: true });
    return () => document.removeEventListener('keydown', onKey);
  }, [open, courant, steps.length, aller, onClose, onFinish]);

  if (!open || !etape) return null;

  const dernier = courant >= steps.length - 1;
  const halo: CSSProperties | undefined = rect
    ? {
        top: rect.top - MARGE,
        left: rect.left - MARGE,
        width: rect.width + MARGE * 2,
        height: rect.height + MARGE * 2,
      }
    : undefined;

  const cote = etape.side ?? 'bas';
  const carteStyle: CSSProperties = rect
    ? cote === 'haut'
      ? { top: Math.max(12, rect.top - MARGE - 12), left: rect.left, transform: 'translateY(-100%)' }
      : cote === 'gauche'
        ? { top: rect.top, left: Math.max(12, rect.left - MARGE - 12), transform: 'translateX(-100%)' }
        : cote === 'droite'
          ? { top: rect.top, left: rect.left + rect.width + MARGE + 12 }
          : { top: rect.top + rect.height + MARGE + 12, left: rect.left }
    : { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' };

  return (
    <div className={cx('hmm-visite', className)} role="presentation">
      <div className="hmm-visite__voile" onMouseDown={onClose} />
      {halo ? <div className="hmm-visite__halo" style={halo} aria-hidden="true" /> : null}
      <div
        ref={carte}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${uid}-titre`}
        tabIndex={-1}
        className={cx('hmm-visite__carte', 'hmm-mat-parchemin')}
        style={carteStyle}
      >
        <header className="hmm-visite__entete">
          <p className="hmm-visite__compteur hmm-donnee">
            Étape {courant + 1} sur {steps.length}
          </p>
          <button type="button" className="hmm-visite__fermer" onClick={onClose} aria-label="Quitter la visite">
            <IconFermer size={18} />
          </button>
        </header>
        <h2 id={`${uid}-titre`} className="hmm-titre hmm-visite__titre">
          {etape.title}
        </h2>
        <div className="hmm-visite__texte hmm-recit">{etape.text}</div>
        <footer className="hmm-visite__pied">
          <Button variant="fantome" onClick={onClose}>
            Passer
          </Button>
          <div className="hmm-visite__navigation">
            <Button variant="secondaire" onClick={() => aller(courant - 1)} disabled={courant === 0}>
              Précédent
            </Button>
            <Button
              variant="principal"
              trailing={dernier ? undefined : <IconChevron size={18} />}
              onClick={() => {
                if (dernier) {
                  onFinish?.();
                  onClose();
                } else aller(courant + 1);
              }}
            >
              {dernier ? 'Terminer' : 'Suivant'}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Contenu de démonstration, employé par la galerie. */
export const TOUR_DEMO: readonly TourStep[] = [
  {
    title: 'Le bandeau des ressources',
    text: "Écus, bois, granit, fer, sel, essence et fil d'or. Le petit nombre sous chaque valeur est le revenu du jour.",
    side: 'bas',
  },
  {
    title: 'Les panneaux de parchemin',
    text: 'Toute information de jeu tient sur du parchemin monté sur ferrure. Le bord biseauté indique ce qui est posé et ce qui est creusé.',
    side: 'bas',
  },
  {
    title: "La barre d'engagement",
    text: 'Aucun coup irréversible ne part d’un simple clic : vous choisissez, vous voyez l’effet annoncé, puis vous confirmez.',
    side: 'haut',
  },
];
