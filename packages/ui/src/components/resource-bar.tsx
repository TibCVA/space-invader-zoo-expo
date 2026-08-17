/**
 * ResourceBar — bandeau des sept ressources.
 *
 * Chiffres en chasse tabulaire, icône dessinée devant chaque valeur, variation
 * du jour annoncée par un signe **et** une couleur (jamais par la seule
 * couleur). Sur téléphone, le bandeau défile horizontalement sans rien perdre.
 */

import type { CSSProperties, ReactElement } from 'react';
import { cx, resourceColors } from '../tokens.js';
import { RESOURCE_ICONS, RESOURCE_LABELS } from '../icons/registry.js';
import { Tooltip } from './tooltip.js';

export type ResourceKeyUi = 'ecus' | 'bois' | 'granit' | 'fer' | 'sel' | 'essence' | 'filDor';

export const RESOURCE_ORDER: readonly ResourceKeyUi[] = [
  'ecus',
  'bois',
  'granit',
  'fer',
  'sel',
  'essence',
  'filDor',
];

export interface ResourceBarProps {
  /** stock courant de chaque ressource */
  values: Partial<Record<ResourceKeyUi, number>>;
  /** revenu quotidien, affiché en petit sous la valeur */
  income?: Partial<Record<ResourceKeyUi, number>>;
  /** ressources à masquer (par exemple hors cité) */
  hide?: readonly ResourceKeyUi[];
  size?: 'normal' | 'compact';
  className?: string;
  style?: CSSProperties;
  onSelect?: (key: ResourceKeyUi) => void;
}

function formatEntier(n: number): string {
  return new Intl.NumberFormat('fr-FR').format(Math.trunc(n));
}

function formatRevenu(n: number): string {
  const s = formatEntier(Math.abs(n));
  if (n > 0) return `+${s}`;
  if (n < 0) return `−${s}`;
  return '±0';
}

/** Bandeau des ressources du joueur. */
export function ResourceBar(props: ResourceBarProps): ReactElement {
  const { values, income, hide = [], size = 'normal', className, style, onSelect } = props;
  const items = RESOURCE_ORDER.filter((k) => !hide.includes(k));
  return (
    <div
      className={cx('hmm-ressources', `hmm-ressources--${size}`, 'hmm-mat-ferrure', className)}
      style={style}
      role="group"
      aria-label="Ressources du royaume"
    >
      {items.map((k) => {
        const Icone = RESOURCE_ICONS[k];
        const valeur = values[k] ?? 0;
        const rev = income?.[k];
        const libelle = RESOURCE_LABELS[k] ?? k;
        const contenu = (
          <span
            className="hmm-ressource"
            style={{ ['--hmm-teinte-ressource' as string]: resourceColors[k] }}
          >
            <span className="hmm-ressource__icone" aria-hidden="true">
              {Icone ? <Icone size={size === 'compact' ? 22 : 28} /> : null}
            </span>
            <span className="hmm-ressource__valeurs">
              <span className="hmm-ressource__valeur hmm-donnee--gras">{formatEntier(valeur)}</span>
              {rev === undefined ? null : (
                <span
                  className={cx(
                    'hmm-ressource__revenu',
                    rev > 0 && 'hmm-ressource__revenu--hausse',
                    rev < 0 && 'hmm-ressource__revenu--baisse',
                  )}
                >
                  {formatRevenu(rev)}
                </span>
              )}
            </span>
            <span className="hmm-invisible">
              {libelle} : {formatEntier(valeur)}
              {rev === undefined ? '' : `, revenu ${formatRevenu(rev)} par jour`}
            </span>
          </span>
        );
        const bulle =
          rev === undefined
            ? libelle
            : `${libelle} — ${formatEntier(valeur)} en réserve, ${formatRevenu(rev)} par jour`;
        return onSelect ? (
          <button
            key={k}
            type="button"
            className="hmm-ressource__bouton"
            onClick={() => onSelect(k)}
            aria-label={bulle}
          >
            {contenu}
          </button>
        ) : (
          <Tooltip key={k} content={bulle} placement="bas">
            {contenu}
          </Tooltip>
        );
      })}
    </div>
  );
}
