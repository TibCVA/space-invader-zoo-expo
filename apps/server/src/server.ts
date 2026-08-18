/**
 * Serveur HTTP — Heroes of Might and Magic : Édition Auvergne.
 *
 * Un seul service Railway sert l'interface compilée et l'API de sauvegarde.
 * Ses obligations, tirées du brief et de `docs/90-DOCUMENT-MAITRE.md` §18.5 :
 *
 *  - écouter sur `0.0.0.0`, sur `process.env.PORT` (8080 par défaut) ;
 *  - répondre **200 sur `/health` même sans base de données** ;
 *  - s'arrêter proprement sur `SIGTERM` et `SIGINT` (redéploiement) ;
 *  - compresser, gérer les cookies, journaliser sans jamais écrire de secret ;
 *  - appeler `bootstrapEngine()` avant tout usage du moteur.
 *
 * `buildServer()` construit une instance sans l'écouter : c'est ce que font
 * les tests, via `app.inject()`. `start()` n'est appelé que lorsque ce fichier
 * est le point d'entrée du processus.
 */
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import Fastify, {
  type FastifyError,
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import fastifyCompress from '@fastify/compress';
import fastifyCookie from '@fastify/cookie';
import {
  API,
  MAX_SAVE_BYTES,
  PROTOCOL_VERSION,
  apiError,
  type IdentityPayload,
} from '@auvergne/protocol';
import { bootstrapEngine } from '@auvergne/game';
import { ENGINE_VERSION } from '@auvergne/engine';
import { CONTENT_VERSION } from '@auvergne/content';
import { MAP_VERSION } from '@auvergne/map';
import { APP_VERSION, readConfig, sessionSecret, type ServerConfig } from './config.js';
import type { ServerContext } from './context.js';
import { HttpError, MESSAGES, sendError } from './errors.js';
import { registerHealth } from './health.js';
import { clearIdentityCookie, identityTag, resolveIdentity } from './identity.js';
import { RateLimiter } from './rate-limit.js';
import { registerContentRoutes } from './routes/content.js';
import { registerPartyRoutes } from './routes/parties.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerSaveRoutes } from './routes/saves.js';
import { registerStatic } from './static.js';
import { createStorage, describe, scrubSecrets, type Storage } from './storage/index.js';

/** Limite de corps des routes ordinaires. Les sauvegardes relèvent leur seuil. */
const DEFAULT_BODY_LIMIT = 1024 * 1024;

export interface BuiltServer {
  app: FastifyInstance;
  ctx: ServerContext;
}

/* ── Construction ───────────────────────────────────────────────────────── */

export async function buildServer(
  overrides: Partial<ServerConfig> = {},
): Promise<BuiltServer> {
  const config = readConfig(overrides);

  // Le moteur est pur : il faut lui brancher le contenu et la carte avant le
  // premier `createGame`, une fois pour toutes (l'appel est idempotent).
  bootstrapEngine();

  const app = Fastify({
    logger: loggerOptions(config),
    trustProxy: config.trustProxy,
    bodyLimit: DEFAULT_BODY_LIMIT,
    routerOptions: { ignoreTrailingSlash: true, caseSensitive: true },
    // Un identifiant de requête court suffit à corréler les lignes de journal.
    genReqId: () => randomUUID().slice(0, 8),
  });

  const { secret, derived } = sessionSecret();
  if (derived && config.production) {
    app.log.warn(
      'SESSION_SECRET absent en production : une clef dérivée localement est utilisée. Les sessions ne survivront pas à un changement de machine.',
    );
  }

  const { storage, notes } = await createStorage({
    databaseUrl: config.databaseUrl,
    dataDir: config.dataDir,
    forceMemory: config.forceMemoryStorage,
  });
  for (const note of notes) app.log.info(note);

  const ctx: ServerContext = {
    config,
    storage,
    storageNotes: notes,
    versions: {
      moteur: ENGINE_VERSION,
      contenu: CONTENT_VERSION,
      carte: MAP_VERSION,
      protocole: PROTOCOL_VERSION,
      application: APP_VERSION,
    },
    startedAt: Date.now(),
    limiter: new RateLimiter(),
    clientDir: null,
    secretDerived: derived,
  };

  await app.register(fastifyCookie, { secret, hook: 'onRequest' });
  await app.register(fastifyCompress, {
    global: true,
    threshold: 1024,
    encodings: ['br', 'gzip', 'deflate'],
  });

  registerSecurityHeaders(app);
  registerIdentity(app, ctx);
  registerRateLimit(app, ctx);
  registerErrorHandling(app);

  registerHealth(app, ctx);
  registerContentRoutes(app, ctx);
  registerSaveRoutes(app, ctx);
  registerProfileRoutes(app, ctx);
  registerPartyRoutes(app, ctx);
  registerIdentityRoutes(app);

  const statics = await registerStatic(app, ctx);

  app.setNotFoundHandler(async (request, reply) => {
    if (request.url.startsWith('/api/') || request.url === API.health) {
      return sendError(reply, 'route_introuvable', MESSAGES.routeIntrouvable);
    }
    return statics.fallback(request, reply);
  });

  await app.ready();
  return { app, ctx };
}

/* ── Journalisation ─────────────────────────────────────────────────────── */

/**
 * Journal sans secret. Trois précautions :
 *  - les en-têtes `cookie`, `set-cookie` et `authorization` sont supprimés ;
 *  - la chaîne de requête est tronquée (elle pourrait porter un jeton) ;
 *  - les messages d'erreur passent par `scrubSecrets`.
 */
function loggerOptions(config: ServerConfig): FastifyServerOptions['logger'] {
  if (config.silent) return false;
  return {
    level: config.logLevel,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        'headers.cookie',
      ],
      remove: true,
    },
    serializers: {
      req(request: { method: string; url: string; id?: string }) {
        return {
          method: request.method,
          url: sanitizeUrl(request.url),
          id: request.id,
        };
      },
      err(error: Error & { code?: string; statusCode?: number }) {
        return {
          type: error.name,
          message: scrubSecrets(error.message),
          // La pile n'apporte rien dans un journal de production et peut
          // révéler des chemins : on la remplace par le code d'erreur.
          stack: '',
          code: error.code ?? '',
          statusCode: error.statusCode ?? 0,
        };
      },
    },
  };
}

/** Retire la chaîne de requête de l'URL journalisée. */
export function sanitizeUrl(url: string): string {
  const cut = url.indexOf('?');
  return (cut === -1 ? url : `${url.slice(0, cut)}?…`).slice(0, 200);
}

/* ── Greffons ───────────────────────────────────────────────────────────── */

/**
 * En-têtes de sécurité minimaux, sans dépendance supplémentaire. La politique
 * de contenu autorise le `data:` (l'art est procédural et les vignettes de
 * sauvegarde sont des data-url) mais interdit toute origine distante, ce qui
 * est cohérent avec la règle « aucun asset externe ».
 */
function registerSecurityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'SAMEORIGIN');
    if (request.url.startsWith('/api/')) {
      reply.header('cross-origin-resource-policy', 'same-origin');
    }
    const type = String(reply.getHeader('content-type') ?? '');
    if (type.startsWith('text/html')) {
      reply.header(
        'content-security-policy',
        [
          "default-src 'self'",
          "img-src 'self' data: blob:",
          "media-src 'self' data: blob:",
          "style-src 'self' 'unsafe-inline'",
          "font-src 'self' data:",
          "script-src 'self'",
          "connect-src 'self'",
          "object-src 'none'",
          "base-uri 'self'",
          "frame-ancestors 'self'",
        ].join('; '),
      );
    }
    return payload;
  });
}

/** Résout l'identité anonyme pour toutes les routes `/api/*`. */
function registerIdentity(app: FastifyInstance, ctx: ServerContext): void {
  app.decorateRequest('identity', '');
  app.decorateRequest('identityIsNew', false);

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    const { identity, created } = resolveIdentity(request, reply);
    request.identity = identity;
    request.identityIsNew = created;
    if (created && ctx.config.production) {
      request.log.info({ identite: identityTag(identity) }, 'nouvelle identité anonyme');
    }
  });
}

/** Applique la limitation de débit par identité, hors sonde de santé. */
function registerRateLimit(app: FastifyInstance, ctx: ServerContext): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    const key = request.identity.length > 0 ? request.identity : (request.ip ?? 'anonyme');
    const verdict = ctx.limiter.hit(key);
    reply.header('x-ratelimit-limit', verdict.limit);
    reply.header('x-ratelimit-remaining', verdict.remaining);
    if (!verdict.allowed) {
      reply.header('retry-after', verdict.retryAfter);
      await sendError(reply, 'trop_de_requetes', MESSAGES.tropDeRequetes, {
        secondes: verdict.retryAfter,
      });
    }
  });
}

/**
 * Gestion des erreurs. Toute réponse `/api/*` sort avec `{ erreur, code }` en
 * français ; rien du contexte interne (pile, chemin, requête SQL) n'est
 * divulgué.
 */
function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    if (error instanceof HttpError) {
      request.log.info({ code: error.code }, 'requête refusée');
      return reply.code(error.status).send(error.toPayload());
    }

    const status = typeof error.statusCode === 'number' ? error.statusCode : 500;
    const code = String((error as { code?: string }).code ?? '');

    if (code === 'FST_ERR_CTP_BODY_TOO_LARGE' || status === 413) {
      return sendError(reply, 'charge_trop_lourde', MESSAGES.chargeTropLourde, {
        maximum: MAX_SAVE_BYTES,
      });
    }
    if (code === 'FST_ERR_CTP_EMPTY_JSON_BODY' || code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE') {
      return sendError(
        reply,
        'requete_invalide',
        'Le corps de la requête doit être un objet JSON.',
      );
    }
    if (status === 400) {
      return sendError(reply, 'requete_invalide', MESSAGES.requeteInvalide);
    }
    if (status === 405) {
      return sendError(
        reply,
        'methode_non_supportee',
        "Cette méthode n'est pas acceptée sur cette adresse.",
      );
    }
    if (status < 500) {
      return sendError(reply, 'requete_invalide', MESSAGES.requeteInvalide);
    }

    request.log.error({ err: error }, 'erreur non rattrapée');
    return sendError(reply, 'erreur_interne', MESSAGES.erreurInterne);
  });
}

/** Petite route utilitaire : quelle identité anonyme suis-je ? */
function registerIdentityRoutes(app: FastifyInstance): void {
  app.get(API.identity, async (request, reply) => {
    const payload: IdentityPayload = {
      identite: request.identity,
      nouvelle: request.identityIsNew,
    };
    return reply.header('cache-control', 'no-store').send(payload);
  });

  app.delete(API.identity, async (_request, reply) => {
    clearIdentityCookie(reply);
    return reply
      .header('cache-control', 'no-store')
      .send(
        apiError(
          'requete_invalide',
          "Identité oubliée. Vos sauvegardes serveur ne sont plus accessibles depuis ce navigateur.",
        ),
      );
  });
}

/* ── Cycle de vie ───────────────────────────────────────────────────────── */

/** Démarre l'écoute et installe l'arrêt gracieux. */
export async function start(): Promise<BuiltServer> {
  const built = await buildServer();
  const { app, ctx } = built;

  await app.listen({ port: ctx.config.port, host: ctx.config.host });
  app.log.info(
    {
      port: ctx.config.port,
      base: ctx.storage.kind,
      client: ctx.clientDir !== null ? 'compilé' : 'absent',
    },
    'service prêt',
  );

  installShutdown(app, ctx.storage, ctx.config.shutdownTimeoutMs);
  return built;
}

/**
 * Arrêt gracieux. Railway envoie `SIGTERM` lors d'un redéploiement : on cesse
 * d'accepter de nouvelles connexions, on laisse les requêtes en vol se
 * terminer, on ferme le stockage, puis on rend la main. Un minuteur de sûreté
 * empêche un client suspendu de bloquer le déploiement indéfiniment.
 */
export function installShutdown(
  app: FastifyInstance,
  storage: Storage,
  timeoutMs: number,
): void {
  let closing = false;

  const stop = (signal: NodeJS.Signals): void => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, 'arrêt demandé, fermeture en cours');

    const guard = setTimeout(() => {
      app.log.warn("délai d'arrêt dépassé, sortie forcée");
      process.exit(1);
    }, timeoutMs);
    guard.unref();

    void (async () => {
      try {
        await app.close();
        await storage.close();
        app.log.info('arrêt terminé proprement');
        clearTimeout(guard);
        process.exit(0);
      } catch (err) {
        app.log.error({ raison: describe(err) }, "échec de l'arrêt gracieux");
        clearTimeout(guard);
        process.exit(1);
      }
    })();
  };

  process.once('SIGTERM', () => stop('SIGTERM'));
  process.once('SIGINT', () => stop('SIGINT'));

  process.on('unhandledRejection', (reason) => {
    app.log.error({ raison: describe(reason) }, 'promesse rejetée sans traitement');
  });
  process.on('uncaughtException', (err) => {
    app.log.error({ raison: describe(err) }, 'exception non rattrapée');
  });
}

/* ── Point d'entrée ─────────────────────────────────────────────────────── */

/** Vrai si ce module est le point d'entrée du processus. */
function isEntryPoint(): boolean {
  const argv = process.argv[1];
  if (typeof argv !== 'string' || argv.length === 0) return false;
  try {
    return import.meta.url === pathToFileURL(argv).href;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  start().catch((err: unknown) => {
    // Dernier recours : le service n'a pas pu démarrer du tout.
    console.error('Démarrage impossible :', describe(err));
    process.exit(1);
  });
}
