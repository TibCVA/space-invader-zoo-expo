/**
 * Contexte partagé par toutes les routes.
 *
 * Construit une seule fois au démarrage puis passé explicitement : aucune
 * variable globale mutable, ce qui permet de monter plusieurs instances du
 * serveur dans le même processus de test sans qu'elles se marchent dessus.
 */
import type { ServerConfig } from './config.js';
import type { RateLimiter } from './rate-limit.js';
import type { Storage } from './storage/index.js';

export interface Versions {
  /** `ENGINE_VERSION` de `@auvergne/engine`. */
  moteur: string;
  /** `CONTENT_VERSION` de `@auvergne/content`. */
  contenu: string;
  /** `MAP_VERSION` de `@auvergne/map`. */
  carte: string;
  /** `PROTOCOL_VERSION` de `@auvergne/protocol`. */
  protocole: string;
  /** Version applicative du service. */
  application: string;
}

export interface ServerContext {
  readonly config: ServerConfig;
  readonly storage: Storage;
  /** Journal de la sélection du stockage, en français, sans secret. */
  readonly storageNotes: readonly string[];
  readonly versions: Versions;
  /** Horodatage de démarrage, en millisecondes. */
  readonly startedAt: number;
  readonly limiter: RateLimiter;
  /** Dossier du client compilé, ou `null` s'il est absent. */
  clientDir: string | null;
  /** Vrai si le secret de session est dérivé (développement). */
  readonly secretDerived: boolean;
}

/** Durée de fonctionnement en secondes entières. */
export function uptimeSeconds(ctx: ServerContext): number {
  return Math.max(0, Math.floor((Date.now() - ctx.startedAt) / 1000));
}

/** Durée de fonctionnement en toutes lettres françaises. */
export function uptimeLabel(seconds: number): string {
  if (seconds < 60) return `${seconds} seconde${seconds > 1 ? 's' : ''}`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes > 1 ? 's' : ''}`;
  const heures = Math.floor(minutes / 60);
  const reste = minutes % 60;
  if (heures < 24) {
    return reste === 0 ? `${heures} heure${heures > 1 ? 's' : ''}` : `${heures} h ${reste} min`;
  }
  const jours = Math.floor(heures / 24);
  return `${jours} jour${jours > 1 ? 's' : ''} et ${heures % 24} h`;
}
