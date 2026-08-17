/**
 * Service des fichiers du client compilé, et repli SPA.
 *
 * Le client est une application à page unique dont le routeur travaille sur le
 * fragment d'URL (`docs/03-ROUTES.md`) : n'importe quelle adresse qui n'est ni
 * un fichier ni une route `/api/*` doit donc rendre `index.html`, à charge
 * pour le client de router ensuite.
 *
 * Politique de cache :
 *  - `/assets/*` porte une empreinte dans son nom (Vite) → cache d'un an,
 *    `immutable` ;
 *  - `index.html` ne doit jamais être mis en cache, sinon un déploiement ne
 *    serait visible qu'après expiration ;
 *  - les polices `@fontsource` embarquées suivent le régime des assets.
 *
 * Si le dossier est absent (API démarrée seule, image incomplète), une page de
 * diagnostic française soignée explique quoi faire, plutôt qu'un 404 nu.
 */
import { existsSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { API } from '@auvergne/protocol';
import { MODULE_DIR } from './config.js';
import type { ServerContext } from './context.js';
import { escapeHtml, htmlDocument } from './health.js';

/** Un an, en secondes. */
const CACHE_LONG = 60 * 60 * 24 * 365;

/**
 * Cherche `apps/client/dist` là où il peut raisonnablement se trouver :
 * en développement (`apps/server/src`), après compilation
 * (`apps/server/dist`), et dans l'image Docker (`/app/apps/client/dist`).
 */
export function findClientDir(override: string | null): string | null {
  // Un chemin imposé par `CLIENT_DIST` est une intention explicite : s'il est
  // faux, on ne va pas en chercher un autre dans son dos.
  const candidates =
    override !== null && override.length > 0
      ? [override]
      : [
          resolve(MODULE_DIR, '..', '..', 'client', 'dist'),
          resolve(MODULE_DIR, '..', '..', '..', 'client', 'dist'),
          resolve(process.cwd(), 'apps', 'client', 'dist'),
          resolve(process.cwd(), '..', 'client', 'dist'),
        ];

  for (const candidate of candidates) {
    try {
      if (existsSync(join(candidate, 'index.html')) && statSync(candidate).isDirectory()) {
        return candidate;
      }
    } catch {
      /* candidat inaccessible : on essaie le suivant */
    }
  }
  return null;
}

export interface StaticHandles {
  /** Dossier retenu, ou `null` si le client n'est pas compilé. */
  clientDir: string | null;
  /**
   * Repli des adresses inconnues. Rend `index.html` pour une navigation, la
   * page de diagnostic quand le client est absent, et laisse l'appelant gérer
   * les routes `/api/*`.
   */
  fallback(request: FastifyRequest, reply: FastifyReply): Promise<FastifyReply>;
}

export async function registerStatic(
  app: FastifyInstance,
  ctx: ServerContext,
): Promise<StaticHandles> {
  const clientDir = findClientDir(ctx.config.clientDirOverride);
  ctx.clientDir = clientDir;

  if (clientDir === null) {
    app.log.warn(
      'Client compilé introuvable : seule l’API est servie. Lancez « pnpm --filter @auvergne/client build ».',
    );
    return {
      clientDir: null,
      fallback: async (request, reply) => sendMissingClient(request, reply, ctx),
    };
  }

  await app.register(fastifyStatic, {
    root: clientDir,
    prefix: '/',
    // `index.html` est servi par nos soins pour maîtriser son cache : on
    // laisse `@fastify/static` poser sa route générique `/*`, qui délègue au
    // gestionnaire « adresse inconnue » dès qu'aucun fichier ne correspond.
    index: false,
    etag: true,
    lastModified: true,
    setHeaders(reply, path) {
      if (path.endsWith('index.html')) {
        reply.header('cache-control', 'no-cache, must-revalidate');
        return;
      }
      if (isFingerprinted(path)) {
        reply.header('cache-control', `public, max-age=${CACHE_LONG}, immutable`);
        return;
      }
      reply.header('cache-control', 'public, max-age=3600');
    },
  });

  app.get('/', async (_request, reply) => sendIndex(reply));

  return {
    clientDir,
    fallback: async (request, reply) => {
      if (!acceptsHtml(request)) {
        return reply
          .code(404)
          .header('content-type', 'application/json; charset=utf-8')
          .send({ erreur: "Cette ressource n'existe pas.", code: 'route_introuvable' });
      }
      return sendIndex(reply);
    },
  };

  function sendIndex(reply: FastifyReply): Promise<FastifyReply> {
    return reply
      .header('cache-control', 'no-cache, must-revalidate')
      .type('text/html; charset=utf-8')
      .sendFile('index.html') as unknown as Promise<FastifyReply>;
  }
}

/** Vrai si le nom de fichier porte une empreinte de contenu (Vite). */
export function isFingerprinted(path: string): boolean {
  return (
    /\/assets\//.test(path) ||
    /-[A-Za-z0-9_]{8,}\.(js|css|woff2?|png|jpg|jpeg|webp|svg|ttf)$/.test(path)
  );
}

/** Vrai si le client demande une page HTML (navigation) plutôt qu'une API. */
export function acceptsHtml(request: FastifyRequest): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const accept = String(request.headers.accept ?? '');
  return accept.includes('text/html') || accept.includes('*/*') || accept.length === 0;
}

/* ── Page « client absent » ─────────────────────────────────────────────── */

function sendMissingClient(
  request: FastifyRequest,
  reply: FastifyReply,
  ctx: ServerContext,
): FastifyReply {
  if (!acceptsHtml(request)) {
    return reply
      .code(404)
      .header('content-type', 'application/json; charset=utf-8')
      .send({ erreur: "Cette ressource n'existe pas.", code: 'route_introuvable' });
  }
  return reply
    .code(503)
    .header('content-type', 'text/html; charset=utf-8')
    .header('cache-control', 'no-store')
    .send(renderMissingClientPage(ctx));
}

/**
 * Page affichée quand `apps/client/dist` est absent. Elle est en français,
 * soignée, et surtout **actionnable** : elle dit précisément quoi lancer.
 */
export function renderMissingClientPage(ctx: ServerContext): string {
  const corps = `
<header>
  <p class="chapeau">Heroes of Might and Magic — Édition Auvergne</p>
  <h1>L’interface n’est pas encore compilée</h1>
  <p><span class="etat etat--attention"><span class="pastille"></span>API disponible · interface absente</span></p>
</header>

<p>Le serveur fonctionne : les sauvegardes, le profil et les versions du contenu
répondent normalement. En revanche, le dossier du client compilé
(<code>apps/client/dist</code>) est introuvable, il n’y a donc rien à afficher.</p>

<h2>Pour compiler l’interface</h2>
<table>
  <tbody>
    <tr><th scope="row">En développement</th><td class="valeur">pnpm --filter @auvergne/client dev</td></tr>
    <tr><th scope="row">Pour produire le dossier</th><td class="valeur">pnpm --filter @auvergne/client build</td></tr>
    <tr><th scope="row">Dossier imposé</th><td class="valeur">CLIENT_DIST=/chemin/vers/dist</td></tr>
  </tbody>
</table>

<h2>Ce qui répond déjà</h2>
<table>
  <tbody>
    <tr><th scope="row">Santé du service</th><td class="valeur">${escapeHtml(API.health)}</td></tr>
    <tr><th scope="row">Diagnostic complet</th><td class="valeur">${escapeHtml(API.diagnostic)}</td></tr>
    <tr><th scope="row">Versions du contenu</th><td class="valeur">${escapeHtml(
      API.contentVersion,
    )}</td></tr>
    <tr><th scope="row">Emplacements de sauvegarde</th><td class="valeur">${escapeHtml(
      API.saves,
    )}</td></tr>
  </tbody>
</table>

<footer>
  <p>Version du service ${escapeHtml(ctx.versions.application)} · moteur ${escapeHtml(
    ctx.versions.moteur,
  )} · contenu ${escapeHtml(ctx.versions.contenu)} · carte ${escapeHtml(ctx.versions.carte)}.</p>
</footer>`;
  return htmlDocument('Interface non compilée — Édition Auvergne', corps);
}
