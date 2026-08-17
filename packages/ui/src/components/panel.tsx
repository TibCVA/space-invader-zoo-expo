/**
 * Panel — la surface de base de l'interface : parchemin sur granit, bord
 * biseauté de 2 px, ferrures d'or, ombre portée bleutée.
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { useId } from 'react';
import { cx } from '../tokens.js';

export type PanelMatter = 'parchemin' | 'granit' | 'cuir' | 'ferrure';
export type PanelPadding = 'aucun' | 'serre' | 'normal' | 'large';

export interface PanelProps {
  /** titre du panneau, rendu en Cinzel dans un bandeau de ferrure */
  title?: ReactNode;
  /** sous-titre discret, sous le titre */
  subtitle?: ReactNode;
  /** actions alignées à droite du bandeau */
  actions?: ReactNode;
  /** matière du fond */
  matter?: PanelMatter;
  padding?: PanelPadding;
  /** panneau surélevé : ombre plus marquée */
  raised?: boolean;
  /** panneau creusé dans la surface parente (biseau inversé) */
  inset?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  id?: string;
}

/** Panneau de parchemin encadré de ferrures. */
export function Panel(props: PanelProps): ReactElement {
  const {
    title,
    subtitle,
    actions,
    matter = 'parchemin',
    padding = 'normal',
    raised = false,
    inset = false,
    className,
    style,
    children,
    id,
  } = props;
  const autoId = useId();
  const titleId = `${id ?? autoId}-titre`;
  return (
    <section
      id={id}
      className={cx(
        'hmm-panneau',
        `hmm-panneau--${matter}`,
        `hmm-mat-${matter}`,
        raised && 'hmm-panneau--releve',
        inset && 'hmm-panneau--creuse',
        className,
      )}
      style={style}
      aria-labelledby={title ? titleId : undefined}
    >
      {title ? (
        <header className="hmm-panneau__entete">
          <div className="hmm-panneau__titres">
            <h2 id={titleId} className="hmm-titre hmm-panneau__titre">
              {title}
            </h2>
            {subtitle ? <p className="hmm-panneau__soustitre">{subtitle}</p> : null}
          </div>
          {actions ? <div className="hmm-panneau__actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cx('hmm-panneau__corps', `hmm-panneau__corps--${padding}`)}>{children}</div>
    </section>
  );
}
