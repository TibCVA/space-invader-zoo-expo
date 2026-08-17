/**
 * Options du joueur : volumes, accessibilité, affichage, dernière partie.
 *
 * Aucune donnée personnelle n'est stockée — ni nom, ni adresse, ni
 * identifiant tiers. Le profil est rattaché à l'identité anonyme du cookie et
 * ne contient que des préférences d'interface.
 *
 *  - `GET    /api/profil` — le profil, ou celui par défaut s'il n'existe pas ;
 *  - `PUT    /api/profil` — mise à jour partielle, fusionnée puis revalidée ;
 *  - `DELETE /api/profil` — retour aux réglages d'origine.
 */
import type { FastifyInstance } from 'fastify';
import {
  API,
  ProfilePatchSchema,
  ProfileSchema,
  defaultProfile,
  parseOrMessages,
  type Profile,
} from '@auvergne/protocol';
import type { ServerContext } from '../context.js';
import { HttpError, MESSAGES, fail } from '../errors.js';
import { describe } from '../storage/index.js';

/** Corps de réponse du profil. */
interface ProfileResponse {
  profil: Profile;
  /** Vrai si le profil renvoyé est celui par défaut (jamais enregistré). */
  pardefaut: boolean;
}

export function registerProfileRoutes(app: FastifyInstance, ctx: ServerContext): void {
  app.get(API.profile, async (request, reply) => {
    const stored = await read(ctx, request.identity);
    const response: ProfileResponse = {
      profil: stored ?? defaultProfile(new Date().toISOString()),
      pardefaut: stored === null,
    };
    return reply.header('cache-control', 'no-store').send(response);
  });

  app.put(API.profile, async (request, reply) => {
    const patch = parseOrMessages(ProfilePatchSchema, request.body);
    if (!patch.ok) {
      fail('requete_invalide', premierMessage(patch.messages), { champs: patch.champs });
    }

    const now = new Date().toISOString();
    const base = (await read(ctx, request.identity)) ?? defaultProfile(now);

    const fusion: Profile = {
      volumes: { ...base.volumes, ...(patch.value.volumes ?? {}) },
      accessibilite: { ...base.accessibilite, ...(patch.value.accessibilite ?? {}) },
      affichage: { ...base.affichage, ...(patch.value.affichage ?? {}) },
      dernierePartie:
        patch.value.dernierePartie !== undefined
          ? patch.value.dernierePartie
          : base.dernierePartie,
      updatedAt: now,
    };

    // Ceinture et bretelles : la fusion est revalidée avant d'être écrite.
    const controle = parseOrMessages(ProfileSchema, fusion);
    if (!controle.ok) {
      fail('requete_invalide', premierMessage(controle.messages), { champs: controle.champs });
    }

    try {
      const enregistre = await ctx.storage.putProfile(request.identity, controle.value);
      const response: ProfileResponse = { profil: enregistre, pardefaut: false };
      return reply.header('cache-control', 'no-store').send(response);
    } catch (err) {
      request.log.error({ raison: describe(err) }, 'écriture du profil impossible');
      throw new HttpError('stockage_indisponible', MESSAGES.stockageIndisponible);
    }
  });

  app.delete(API.profile, async (request, reply) => {
    const now = new Date().toISOString();
    const neuf = defaultProfile(now);
    try {
      await ctx.storage.putProfile(request.identity, neuf);
    } catch (err) {
      request.log.error({ raison: describe(err) }, 'réinitialisation du profil impossible');
      throw new HttpError('stockage_indisponible', MESSAGES.stockageIndisponible);
    }
    const response: ProfileResponse = { profil: neuf, pardefaut: true };
    return reply.header('cache-control', 'no-store').send(response);
  });
}

/**
 * Lit le profil enregistré. Un profil corrompu (schéma obsolète, écriture
 * partielle) est traité comme absent plutôt que de faire échouer la requête :
 * mieux vaut des réglages par défaut qu'un écran d'options inaccessible.
 */
async function read(ctx: ServerContext, identity: string): Promise<Profile | null> {
  let brut: unknown;
  try {
    brut = await ctx.storage.getProfile(identity);
  } catch {
    return null;
  }
  if (brut === null || brut === undefined) return null;
  const controle = ProfileSchema.safeParse(brut);
  return controle.success ? controle.data : null;
}

function premierMessage(messages: string[]): string {
  return messages[0] ?? MESSAGES.requeteInvalide;
}
