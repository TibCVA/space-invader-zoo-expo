/**
 * Erreurs HTTP normalisées.
 *
 * Toute réponse d'échec des routes `/api/*` a la même forme :
 * `{ erreur: "…en français…", code: "…identifiant stable…" }`, complétée au
 * besoin d'un objet `details` qui ne contient que des valeurs sûres (noms de
 * champs, quotas, versions). Jamais de trace de pile, jamais de chemin de
 * fichier, jamais de contenu d'environnement.
 */
import type { FastifyReply } from 'fastify';
import { ERROR_STATUS, apiError, type ApiError, type ErrorCode } from '@auvergne/protocol';

/** Erreur applicative portant son code et son message français. */
export class HttpError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: ApiError['details'];

  constructor(code: ErrorCode, message: string, details?: ApiError['details']) {
    super(message);
    this.name = 'HttpError';
    this.code = code;
    this.status = ERROR_STATUS[code];
    if (details !== undefined) this.details = details;
  }

  toPayload(): ApiError {
    return apiError(this.code, this.message, this.details);
  }
}

/** Raccourci : lève une `HttpError`. */
export function fail(
  code: ErrorCode,
  message: string,
  details?: ApiError['details'],
): never {
  throw new HttpError(code, message, details);
}

/** Écrit une enveloppe d'erreur dans la réponse. */
export function sendError(
  reply: FastifyReply,
  code: ErrorCode,
  message: string,
  details?: ApiError['details'],
): FastifyReply {
  return reply.code(ERROR_STATUS[code]).send(apiError(code, message, details));
}

/**
 * Messages français des situations les plus fréquentes, centralisés pour que
 * le vocabulaire reste cohérent d'une route à l'autre.
 */
export const MESSAGES = {
  requeteInvalide: 'La requête est invalide.',
  identifiantInvalide:
    "L'identifiant d'emplacement est invalide : minuscules, chiffres, tirets et tirets bas uniquement.",
  sauvegardeIntrouvable: "Cet emplacement de sauvegarde n'existe pas.",
  stockageIndisponible:
    "Le stockage des sauvegardes est momentanément indisponible. La partie en cours n'est pas perdue : réessayez dans un instant.",
  tropDeRequetes:
    'Trop de requêtes envoyées en peu de temps. Patientez quelques secondes avant de réessayer.',
  chargeTropLourde: 'La sauvegarde dépasse la taille autorisée de 24 Mo.',
  routeIntrouvable: "Cette adresse n'existe pas sur ce serveur.",
  erreurInterne:
    "Une erreur interne est survenue. Elle a été consignée côté serveur ; aucune donnée n'a été perdue.",
} as const;
