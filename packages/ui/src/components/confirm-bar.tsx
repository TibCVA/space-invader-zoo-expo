/**
 * ConfirmBar — barre d'engagement en trois temps :
 * **sélection → prévisualisation → confirmation**.
 *
 * Aucun coup irréversible ne part d'un simple clic : le joueur choisit, voit
 * l'effet annoncé, puis confirme. La barre reste visible au-dessus de la marge
 * de sécurité de l'appareil.
 */

import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';
import { Button } from './button.js';
import { IconChevron, IconFermer, IconValider } from '../icons/core-icons.js';

export type ConfirmStage = 'selection' | 'previsualisation' | 'confirmation';

const ETAPES: readonly { id: ConfirmStage; label: string }[] = [
  { id: 'selection', label: 'Choix' },
  { id: 'previsualisation', label: 'Aperçu' },
  { id: 'confirmation', label: 'Confirmation' },
];

export interface ConfirmBarProps {
  stage: ConfirmStage;
  /** ce que le joueur vient de désigner */
  selection?: ReactNode;
  /** conséquences annoncées : pertes estimées, coût, durée */
  preview?: ReactNode;
  /** phrase d'engagement affichée au dernier temps */
  question?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  backLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  /** revenir au temps précédent ; absent au premier temps */
  onBack?: () => void;
  /** passer au temps suivant depuis la sélection */
  onNext?: () => void;
  nextLabel?: string;
  disabled?: boolean;
  /** ton d'alerte pour une décision lourde (attaque, démolition) */
  grave?: boolean;
  className?: string;
  style?: CSSProperties;
}

/** Barre d'engagement en trois temps. */
export function ConfirmBar(props: ConfirmBarProps): ReactElement {
  const {
    stage,
    selection,
    preview,
    question,
    confirmLabel = 'Confirmer',
    cancelLabel = 'Annuler',
    backLabel = 'Revenir',
    nextLabel = 'Voir le résultat',
    onConfirm,
    onCancel,
    onBack,
    onNext,
    disabled = false,
    grave = false,
    className,
    style,
  } = props;
  const index = ETAPES.findIndex((e) => e.id === stage);

  return (
    <div
      className={cx('hmm-confirmation', grave && 'hmm-confirmation--grave', 'hmm-mat-ferrure', className)}
      style={style}
      role="region"
      aria-label="Barre de confirmation"
    >
      <ol className="hmm-confirmation__etapes">
        {ETAPES.map((e, i) => (
          <li
            key={e.id}
            className={cx(
              'hmm-confirmation__etape',
              i < index && 'hmm-confirmation__etape--faite',
              i === index && 'hmm-confirmation__etape--courante',
            )}
            aria-current={i === index ? 'step' : undefined}
          >
            <span className="hmm-confirmation__rang" aria-hidden="true">
              {i + 1}
            </span>
            <span className="hmm-confirmation__nom">{e.label}</span>
          </li>
        ))}
      </ol>

      <div className="hmm-confirmation__corps" aria-live="polite">
        {selection ? (
          <p className="hmm-confirmation__selection">
            <span className="hmm-confirmation__cle">Choix</span>
            <span className="hmm-confirmation__valeur">{selection}</span>
          </p>
        ) : null}
        {stage !== 'selection' && preview ? (
          <p className="hmm-confirmation__apercu">
            <span className="hmm-confirmation__cle">Aperçu</span>
            <span className="hmm-confirmation__valeur">{preview}</span>
          </p>
        ) : null}
        {stage === 'confirmation' && question ? (
          <p className="hmm-confirmation__question hmm-recit">{question}</p>
        ) : null}
      </div>

      <div className="hmm-confirmation__actions">
        <Button variant="fantome" onClick={onCancel} leading={<IconFermer size={18} />}>
          {cancelLabel}
        </Button>
        {stage !== 'selection' && onBack ? (
          <Button variant="secondaire" onClick={onBack}>
            {backLabel}
          </Button>
        ) : null}
        {stage === 'selection' && onNext ? (
          <Button
            variant="principal"
            onClick={onNext}
            disabled={disabled}
            trailing={<IconChevron size={18} />}
          >
            {nextLabel}
          </Button>
        ) : null}
        {stage !== 'selection' ? (
          <Button
            variant={grave ? 'danger' : 'principal'}
            onClick={onConfirm}
            disabled={disabled}
            leading={<IconValider size={18} />}
          >
            {confirmLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
