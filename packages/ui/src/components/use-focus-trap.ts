/**
 * Piège à focus — navigation clavier complète dans les surfaces modales.
 *
 * Sans dépendance : on relit les éléments focalisables à chaque Tab, ce qui
 * fonctionne même si le contenu change pendant que la surface est ouverte.
 */

import { useEffect } from 'react';
import type { RefObject } from 'react';

const SELECTEURS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(SELECTEURS)).filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

/**
 * Enferme le focus dans `ref` tant que `active` vaut vrai, appelle `onEscape`
 * sur Échap et restitue le focus à l'élément d'origine en sortant.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
): void {
  useEffect(() => {
    if (!active || typeof document === 'undefined') return;
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;

    const first = focusables(root)[0] ?? root;
    if (first.tabIndex < 0 && first === root) root.tabIndex = -1;
    first.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onEscape?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables(root);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const debut = items[0];
      const fin = items[items.length - 1];
      const courant = document.activeElement as HTMLElement | null;
      if (e.shiftKey && (courant === debut || !root.contains(courant))) {
        e.preventDefault();
        fin.focus();
      } else if (!e.shiftKey && courant === fin) {
        e.preventDefault();
        debut.focus();
      }
    };

    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      previous?.focus?.({ preventScroll: true });
    };
  }, [ref, active, onEscape]);
}
