/**
 * `@auvergne/protocol` — routes, quotas et codes d'erreur partagés.
 *
 * Ce module est le **seul** endroit où sont écrites les URL de l'API : le
 * client et le serveur les importent tous les deux, si bien qu'aucune chaîne
 * de route n'est jamais dupliquée. Il ne dépend de rien (ni Node, ni DOM), il
 * peut donc être chargé dans le navigateur comme dans le serveur Fastify.
 *
 * Rappel du brief : tout texte visible par le joueur est en français ; les
 * identifiants techniques restent en anglais lorsqu'ils ne sont pas déjà des
 * termes de domaine (les bus audio `musique`/`effets`/`ambiance` et les
 * factions `granit`/`ermitage` sont imposés par `docs/02-API.md`).
 */

/** Version du protocole réseau. Incrémentée à chaque rupture de compatibilité. */
export const PROTOCOL_VERSION = '1.0.0';

/**
 * Routes de l'API. Les fonctions encodent l'identifiant pour qu'un nom
 * d'emplacement exotique ne casse jamais l'URL.
 */
export const API = {
  /** Sonde de santé Railway. Répond même sans base de données. */
  health: '/health',
  /** Page de diagnostic française, sans aucun secret. */
  diagnostic: '/api/diagnostic',
  /** Identité anonyme courante (cookie signé). */
  identity: '/api/identite',
  /** Liste des emplacements de sauvegarde de l'identité courante. */
  saves: '/api/saves',
  /** Un emplacement précis : GET, PUT, DELETE. */
  save: (id: string): string => `/api/saves/${encodeURIComponent(id)}`,
  /** Renommage d'un emplacement : POST. */
  renameSave: (id: string): string => `/api/saves/${encodeURIComponent(id)}/rename`,
  /** Options du joueur : GET, PUT. */
  profile: '/api/profil',
  /** Versions du moteur, du contenu et de la carte. */
  contentVersion: '/api/contenu/version',
} as const;

export type ApiRoutes = typeof API;

/* ── Quotas ─────────────────────────────────────────────────────────────── */

/** Taille maximale d'une sauvegarde, corps de requête compris : 24 Mo. */
export const MAX_SAVE_BYTES = 24 * 1024 * 1024;

/** Volume total conservé par identité anonyme : 200 Mo. */
export const MAX_IDENTITY_BYTES = 200 * 1024 * 1024;

/** Emplacements manuels par identité. */
export const MANUAL_SLOTS = 12;

/** Emplacements de sauvegarde automatique, rotatifs. */
export const AUTOSAVE_SLOTS = 3;

/** Longueur maximale d'un nom d'emplacement affiché. */
export const MAX_SLOT_NAME = 60;

/** Longueur maximale d'une vignette encodée en data-url. */
export const MAX_THUMBNAIL_CHARS = 320_000;

/** Nombre maximal de commandes conservées dans le journal d'une sauvegarde. */
export const MAX_COMMANDS = 100_000;

/** Limite de requêtes par identité et par minute. */
export const RATE_LIMIT_PER_MINUTE = 120;

/** Fenêtre de la limitation, en millisecondes. */
export const RATE_LIMIT_WINDOW_MS = 60_000;

/** Nom du cookie d'identité anonyme. */
export const IDENTITY_COOKIE = 'forez_identite';

/** Durée de vie du cookie d'identité, en secondes (un an). */
export const IDENTITY_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/* ── Codes d'erreur ─────────────────────────────────────────────────────── */

/**
 * Codes d'erreur stables, en anglais (identifiants techniques). Le message
 * lisible qui les accompagne est toujours en français.
 */
export const ERROR_CODES = [
  'requete_invalide',
  'identifiant_invalide',
  'nom_invalide',
  'sauvegarde_introuvable',
  'sauvegarde_corrompue',
  'versions_incompatibles',
  'emplacements_pleins',
  'quota_depasse',
  'charge_trop_lourde',
  'trop_de_requetes',
  'stockage_indisponible',
  'methode_non_supportee',
  'route_introuvable',
  'erreur_interne',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** Enveloppe d'erreur renvoyée par toutes les routes `/api/*`. */
export interface ApiError {
  /** Message lisible, en français, destiné à être affiché tel quel. */
  erreur: string;
  /** Code stable, exploitable par le client pour brancher un comportement. */
  code: ErrorCode;
  /** Détails facultatifs (champs invalides, quotas). Jamais de secret. */
  details?: Record<string, string | number | boolean | string[]>;
}

/** Statut HTTP recommandé pour chaque code d'erreur. */
export const ERROR_STATUS: Readonly<Record<ErrorCode, number>> = {
  requete_invalide: 400,
  identifiant_invalide: 400,
  nom_invalide: 400,
  sauvegarde_introuvable: 404,
  sauvegarde_corrompue: 409,
  versions_incompatibles: 409,
  emplacements_pleins: 409,
  quota_depasse: 409,
  charge_trop_lourde: 413,
  trop_de_requetes: 429,
  stockage_indisponible: 503,
  methode_non_supportee: 405,
  route_introuvable: 404,
  erreur_interne: 500,
};

/** Fabrique une enveloppe d'erreur normalisée. */
export function apiError(
  code: ErrorCode,
  erreur: string,
  details?: ApiError['details'],
): ApiError {
  return details === undefined ? { erreur, code } : { erreur, code, details };
}

/* ── Réponses ───────────────────────────────────────────────────────────── */

/** Corps de `GET /health`. */
export interface HealthPayload {
  ok: boolean;
  version: string;
  /** Secondes écoulées depuis le démarrage du processus, entier. */
  uptime: number;
  /** Nature du stockage réellement actif. */
  base: 'postgres' | 'fichier' | 'memoire';
  /** Empreinte de révision, ou `'inconnu'` si l'environnement ne la fournit pas. */
  commit: string;
}

/** Corps de `GET /api/contenu/version`. */
export interface VersionsPayload {
  moteur: string;
  contenu: string;
  carte: string;
  protocole: string;
  /** Vrai si une sauvegarde produite par ces versions est rechargeable ici. */
  compatible: boolean;
}

/** Corps de `GET /api/identite`. */
export interface IdentityPayload {
  identite: string;
  nouvelle: boolean;
}

/* ── Utilitaires de version ─────────────────────────────────────────────── */

/**
 * Extrait la version majeure d'une chaîne du type `1.0.0-noyau`.
 * Retourne `-1` si la chaîne n'est pas exploitable.
 */
export function majorOf(version: string): number {
  const m = /^(\d+)/.exec(version.trim());
  if (!m) return -1;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : -1;
}

/**
 * Deux versions sont compatibles si elles partagent la même majeure.
 * Une majeure illisible n'est jamais compatible : mieux vaut refuser que
 * charger une sauvegarde produite par un moteur inconnu.
 */
export function versionsCompatibles(a: string, b: string): boolean {
  if (a === b) return true;
  const ma = majorOf(a);
  const mb = majorOf(b);
  if (ma < 0 || mb < 0) return false;
  return ma === mb;
}
