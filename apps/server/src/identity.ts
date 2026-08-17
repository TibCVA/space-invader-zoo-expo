/**
 * Identité anonyme par cookie signé.
 *
 * Aucun compte, aucun mot de passe, aucune adresse électronique, aucune donnée
 * personnelle : le serveur pose un identifiant aléatoire de 128 bits dans un
 * cookie `httpOnly` **signé** (HMAC via `@fastify/cookie`), et c'est tout.
 * Cet identifiant ne sert qu'à retrouver ses propres sauvegardes ; il n'est
 * relié à rien d'autre et peut être effacé par le joueur à tout moment en
 * supprimant le cookie.
 *
 * La signature empêche un visiteur de se déclarer propriétaire des
 * sauvegardes d'autrui en fabriquant un cookie : une valeur non signée ou mal
 * signée est traitée comme une nouvelle identité, jamais comme une identité
 * revendiquée.
 */
import { randomBytes } from 'node:crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { IDENTITY_COOKIE, IDENTITY_COOKIE_MAX_AGE } from '@auvergne/protocol';

/** Forme d'un identifiant : 32 caractères hexadécimaux minuscules. */
const IDENTITY_PATTERN = /^[0-9a-f]{32}$/;

/** Fabrique un identifiant anonyme cryptographiquement aléatoire. */
export function newIdentity(): string {
  return randomBytes(16).toString('hex');
}

/** Vrai si la chaîne a la forme d'une identité produite par ce serveur. */
export function isIdentity(value: unknown): value is string {
  return typeof value === 'string' && IDENTITY_PATTERN.test(value);
}

declare module 'fastify' {
  interface FastifyRequest {
    /** Identité anonyme résolue pour cette requête. */
    identity: string;
    /** Vrai si l'identité vient d'être créée. */
    identityIsNew: boolean;
  }
}

/**
 * Détermine si la réponse doit poser un cookie `Secure`.
 * Derrière le proxy Railway, la requête interne est en clair : on se fie à
 * `X-Forwarded-Proto`, que Fastify expose via `request.protocol` lorsque
 * `trustProxy` est actif.
 */
function isSecureRequest(request: FastifyRequest): boolean {
  if (request.protocol === 'https') return true;
  const forwarded = request.headers['x-forwarded-proto'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  return typeof first === 'string' && first.split(',')[0].trim() === 'https';
}

/**
 * Lit l'identité du cookie signé, ou en crée une et la pose.
 * Ne lève jamais : au pire, une identité éphémère est utilisée pour la requête.
 */
export function resolveIdentity(
  request: FastifyRequest,
  reply: FastifyReply,
): { identity: string; created: boolean } {
  const raw = request.cookies[IDENTITY_COOKIE];
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const unsigned = request.unsignCookie(raw);
      if (unsigned.valid && isIdentity(unsigned.value)) {
        // Le cookie a été signé avec une clef antérieure : on le repose avec
        // la clef courante pour que la session survive à une rotation.
        if (unsigned.renew) setIdentityCookie(request, reply, unsigned.value);
        return { identity: unsigned.value, created: false };
      }
    } catch {
      /* cookie illisible : on repart sur une nouvelle identité */
    }
  }
  const identity = newIdentity();
  setIdentityCookie(request, reply, identity);
  return { identity, created: true };
}

/** Pose (ou repose) le cookie d'identité, signé et `httpOnly`. */
export function setIdentityCookie(
  request: FastifyRequest,
  reply: FastifyReply,
  identity: string,
): void {
  reply.setCookie(IDENTITY_COOKIE, identity, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: isSecureRequest(request),
    signed: true,
    maxAge: IDENTITY_COOKIE_MAX_AGE,
  });
}

/** Efface le cookie d'identité (le joueur repart de zéro). */
export function clearIdentityCookie(reply: FastifyReply): void {
  reply.clearCookie(IDENTITY_COOKIE, { path: '/' });
}

/**
 * Forme abrégée d'une identité, la seule qui ait le droit d'apparaître dans
 * un journal : huit caractères suffisent à corréler deux lignes sans permettre
 * de rejouer le cookie.
 */
export function identityTag(identity: string): string {
  return identity.slice(0, 8);
}
