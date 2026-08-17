/**
 * Toast — annonce brève sur bandeau de parchemin.
 *
 * `aria-live="polite"` pour les informations, `role="alert"` pour les alertes.
 * Les annonces s'empilent en bas à droite, au-dessus de la marge de sécurité,
 * et se retirent après leur durée de vie.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, ReactElement, ReactNode } from 'react';
import { cx } from '../tokens.js';
import { IconButton } from './icon-button.js';
import { IconAlerte, IconFermer, IconInformation, IconValider } from '../icons/core-icons.js';

export type ToastTone = 'information' | 'succes' | 'avertissement' | 'danger';

export interface ToastMessage {
  id: string;
  tone?: ToastTone;
  title: ReactNode;
  text?: ReactNode;
  /** durée de vie en millisecondes ; 0 = permanent */
  ttl?: number;
  /** action facultative, par exemple « Annuler » */
  action?: { label: string; onClick: () => void };
}

const ICONES: Record<ToastTone, (p: { size?: number }) => ReactElement> = {
  information: IconInformation,
  succes: IconValider,
  avertissement: IconAlerte,
  danger: IconAlerte,
};

export interface ToastProps {
  message: ToastMessage;
  onDismiss: (id: string) => void;
  className?: string;
  style?: CSSProperties;
}

/** Une annonce. */
export function Toast({ message, onDismiss, className, style }: ToastProps): ReactElement {
  const tone = message.tone ?? 'information';
  const Icone = ICONES[tone];
  const ttl = message.ttl ?? 5200;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (ttl <= 0) return;
    timer.current = setTimeout(() => onDismiss(message.id), ttl);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [ttl, message.id, onDismiss]);

  return (
    <div
      className={cx('hmm-toast', `hmm-toast--${tone}`, 'hmm-mat-parchemin', className)}
      style={style}
      role={tone === 'danger' || tone === 'avertissement' ? 'alert' : 'status'}
    >
      <span className="hmm-toast__icone" aria-hidden="true">
        <Icone size={24} />
      </span>
      <div className="hmm-toast__texte">
        <p className="hmm-toast__titre">{message.title}</p>
        {message.text ? <p className="hmm-toast__corps">{message.text}</p> : null}
      </div>
      {message.action ? (
        <button type="button" className="hmm-toast__action" onClick={message.action.onClick}>
          {message.action.label}
        </button>
      ) : null}
      <IconButton
        label="Fermer l'annonce"
        variant="fantome"
        size="compact"
        onClick={() => onDismiss(message.id)}
      >
        <IconFermer size={16} />
      </IconButton>
    </div>
  );
}

export interface ToastStackProps {
  messages: readonly ToastMessage[];
  onDismiss: (id: string) => void;
  className?: string;
}

/** Pile d'annonces, ancrée en bas à droite. */
export function ToastStack({ messages, onDismiss, className }: ToastStackProps): ReactElement {
  return (
    <div className={cx('hmm-toasts', className)} aria-live="polite" aria-relevant="additions text">
      {messages.map((m) => (
        <Toast key={m.id} message={m} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

/* ─────────────────────────── Contexte pratique ──────────────────────────── */

interface ToastApi {
  /** publie une annonce et renvoie son identifiant */
  annoncer: (m: Omit<ToastMessage, 'id'> & { id?: string }) => string;
  retirer: (id: string) => void;
  messages: readonly ToastMessage[];
}

const Ctx = createContext<ToastApi | null>(null);

/** Fournisseur d'annonces : monte la pile et expose `useToasts()`. */
export function ToastProvider({ children }: { children: ReactNode }): ReactElement {
  const [messages, setMessages] = useState<ToastMessage[]>([]);
  const compteur = useRef(0);

  const retirer = useCallback((id: string) => {
    setMessages((liste) => liste.filter((m) => m.id !== id));
  }, []);

  const annoncer = useCallback((m: Omit<ToastMessage, 'id'> & { id?: string }) => {
    compteur.current += 1;
    const id = m.id ?? `annonce-${compteur.current}`;
    setMessages((liste) => [...liste.filter((x) => x.id !== id), { ...m, id }]);
    return id;
  }, []);

  const api = useMemo<ToastApi>(() => ({ annoncer, retirer, messages }), [annoncer, retirer, messages]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <ToastStack messages={messages} onDismiss={retirer} />
    </Ctx.Provider>
  );
}

/** Accès aux annonces. Lance si aucun `ToastProvider` n'est monté. */
export function useToasts(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToasts exige un <ToastProvider> au-dessus de l'arbre.");
  return api;
}
