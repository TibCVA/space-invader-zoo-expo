/**
 * Tabs — onglets de codex, navigables entièrement au clavier
 * (flèches, Origine, Fin), conformes au motif ARIA « tabs ».
 */

import { useCallback, useId, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';

export interface TabItem {
  id: string;
  /** libellé français */
  label: ReactNode;
  /** icône dessinée, facultative */
  icon?: ReactNode;
  disabled?: boolean;
  content: ReactNode;
}

export interface TabsProps {
  items: readonly TabItem[];
  /** onglet actif contrôlé */
  value?: string;
  /** onglet actif initial, si non contrôlé */
  defaultValue?: string;
  onChange?: (id: string) => void;
  className?: string;
  style?: CSSProperties;
  /** libellé du groupe d'onglets, pour les lecteurs d'écran */
  label?: string;
}

/** Barre d'onglets et panneaux associés. */
export function Tabs(props: TabsProps): ReactElement {
  const { items, value, defaultValue, onChange, className, style, label = 'Sections' } = props;
  const uid = useId();
  const [interne, setInterne] = useState(defaultValue ?? items[0]?.id ?? '');
  const actif = value ?? interne;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const choisir = useCallback(
    (id: string) => {
      if (value === undefined) setInterne(id);
      onChange?.(id);
    },
    [value, onChange],
  );

  const clavier = useCallback(
    (e: ReactKeyboardEvent<HTMLDivElement>) => {
      const utilisables = items.filter((t) => !t.disabled);
      const i = utilisables.findIndex((t) => t.id === actif);
      if (i < 0) return;
      let cible: string | null = null;
      if (e.key === 'ArrowRight') cible = utilisables[(i + 1) % utilisables.length].id;
      else if (e.key === 'ArrowLeft') cible = utilisables[(i - 1 + utilisables.length) % utilisables.length].id;
      else if (e.key === 'Home') cible = utilisables[0].id;
      else if (e.key === 'End') cible = utilisables[utilisables.length - 1].id;
      if (cible) {
        e.preventDefault();
        choisir(cible);
        refs.current[cible]?.focus();
      }
    },
    [items, actif, choisir],
  );

  const courant = items.find((t) => t.id === actif) ?? items[0];

  return (
    <div className={cx('hmm-onglets', className)} style={style}>
      <div className="hmm-onglets__barre" role="tablist" aria-label={label} onKeyDown={clavier}>
        {items.map((t) => {
          const selectionne = t.id === actif;
          return (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[t.id] = el;
              }}
              type="button"
              role="tab"
              id={`${uid}-${t.id}-onglet`}
              aria-selected={selectionne}
              aria-controls={`${uid}-${t.id}-panneau`}
              tabIndex={selectionne ? 0 : -1}
              disabled={t.disabled}
              onClick={() => choisir(t.id)}
              className={cx('hmm-onglet', selectionne && 'hmm-onglet--actif')}
            >
              <span className="hmm-bouton__fond" aria-hidden="true" />
              {t.icon ? <span className="hmm-onglet__icone">{t.icon}</span> : null}
              <span className="hmm-onglet__libelle">{t.label}</span>
            </button>
          );
        })}
      </div>
      {courant ? (
        <div
          role="tabpanel"
          id={`${uid}-${courant.id}-panneau`}
          aria-labelledby={`${uid}-${courant.id}-onglet`}
          tabIndex={0}
          className="hmm-onglets__panneau"
        >
          {courant.content}
        </div>
      ) : null}
    </div>
  );
}
