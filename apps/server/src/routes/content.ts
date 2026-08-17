/**
 * `GET /api/contenu/version` — versions du moteur, du contenu et de la carte.
 *
 * Le client interroge cette route avant de proposer « Reprendre » : si la
 * majeure du moteur a changé depuis la dernière sauvegarde, il vaut mieux
 * l'annoncer sur la page d'accueil que laisser le joueur découvrir le refus au
 * moment du chargement.
 */
import type { FastifyInstance } from 'fastify';
import { API, PROTOCOL_VERSION, type VersionsPayload } from '@auvergne/protocol';
import type { ServerContext } from '../context.js';

export function registerContentRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get(API.contentVersion, async (_request, reply) => {
    const payload: VersionsPayload = {
      moteur: ctx.versions.moteur,
      contenu: ctx.versions.contenu,
      carte: ctx.versions.carte,
      protocole: PROTOCOL_VERSION,
      compatible: true,
    };
    return reply
      .header('cache-control', 'public, max-age=60')
      .send(payload);
  });
}
