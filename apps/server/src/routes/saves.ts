/**
 * Emplacements de sauvegarde.
 *
 *  - `GET    /api/saves`            — liste des emplacements + quotas ;
 *  - `GET    /api/saves/:id`        — chargement, avec contrôle d'intégrité ;
 *  - `PUT    /api/saves/:id`        — enregistrement (corps limité à 24 Mo) ;
 *  - `DELETE /api/saves/:id`        — suppression ;
 *  - `POST   /api/saves/:id/rename` — renommage.
 *
 * Deux principes gouvernent ce fichier.
 *
 * **Le serveur ne croit pas le client.** Le descripteur envoyé avec une
 * sauvegarde (jour, semaine, bannières, empreinte) est *recalculé* à partir de
 * l'état désérialisé. Seuls le nom, la vignette et le drapeau d'automatisme
 * sont repris tels quels : ce sont les seuls champs que le joueur choisit.
 *
 * **Une sauvegarde illisible se dit en français.** Un hash qui ne correspond
 * pas, une version majeure de moteur différente, un quota atteint : chaque cas
 * produit un message explicite plutôt qu'un 500 muet.
 */
import type { FastifyInstance } from 'fastify';
import {
  API,
  AUTOSAVE_SLOTS,
  GetSaveQuerySchema,
  ListSavesQuerySchema,
  MANUAL_SLOTS,
  MAX_IDENTITY_BYTES,
  MAX_SAVE_BYTES,
  RenameSaveSchema,
  SaveUploadSchema,
  SerializationError,
  SlotParamsSchema,
  deserializeState,
  parseOrMessages,
  stateHash,
  summarizeState,
  utf8Length,
  versionsCompatibles,
  type IntegrityReport,
  type SaveSlot,
} from '@auvergne/protocol';
import type { GameState } from '@auvergne/engine';
import type { ServerContext } from '../context.js';
import { HttpError, MESSAGES, fail } from '../errors.js';
import {
  describe,
  formatOctets,
  planSlotWrite,
  usageOf,
  type SaveMeta,
  type SaveVersions,
  type StoredSave,
} from '../storage/index.js';

/** Bloc de quota renvoyé avec chaque écriture et chaque liste. */
interface QuotaPayload {
  octetsUtilises: number;
  octetsMaximum: number;
  manuels: { utilises: number; maximum: number };
  automatiques: { utilises: number; maximum: number };
  /** Résumé lisible, prêt à afficher sous la liste des emplacements. */
  resume: string;
}

export function registerSaveRoutes(app: FastifyInstance, ctx: ServerContext): void {
  /* ── Liste ────────────────────────────────────────────────────────────── */

  app.get(API.saves, async (request, reply) => {
    const query = parseOrMessages(ListSavesQuerySchema, request.query ?? {});
    if (!query.ok) fail('requete_invalide', query.messages[0]);

    const metas = await listMeta(ctx, request.identity);
    const filtre = query.value.autosave;
    const garde =
      filtre === undefined
        ? metas
        : metas.filter((m) => m.slot.autosave === (filtre === '1' || filtre === 'true'));

    return reply.header('cache-control', 'no-store').send({
      emplacements: garde.map((m) => m.slot),
      quota: quotaOf(metas),
    });
  });

  /* ── Chargement ───────────────────────────────────────────────────────── */

  app.get(`${API.saves}/:id`, async (request, reply) => {
    const params = parseOrMessages(SlotParamsSchema, request.params);
    if (!params.ok) fail('identifiant_invalide', MESSAGES.identifiantInvalide);
    const query = parseOrMessages(GetSaveQuerySchema, request.query ?? {});
    if (!query.ok) fail('requete_invalide', query.messages[0]);

    const save = await read(ctx, request.identity, params.value.id);
    if (save === null) fail('sauvegarde_introuvable', MESSAGES.sauvegardeIntrouvable);

    let state: GameState;
    try {
      state = deserializeState(save.state);
    } catch (err) {
      const raison = err instanceof SerializationError ? err.message : MESSAGES.erreurInterne;
      fail(
        'sauvegarde_corrompue',
        `L'emplacement « ${save.slot.name} » ne peut pas être relu. ${raison}`,
      );
    }

    const integrite = checkIntegrity(state, save.slot, save.versions, ctx);

    if (integrite.hashObtenu !== integrite.hashAttendu) {
      fail(
        'sauvegarde_corrompue',
        `L'emplacement « ${save.slot.name} » a été altéré : l'empreinte de la partie ne correspond plus à celle enregistrée. Le chargement est refusé pour ne pas fausser la suite de la partie.`,
        { attendu: integrite.hashAttendu, obtenu: integrite.hashObtenu },
      );
    }

    const force = query.value.force === '1';
    if (!integrite.ok && !force) {
      fail('versions_incompatibles', integrite.avertissements.join(' '), {
        moteur: integrite.versions.moteur.sauvegarde,
        contenu: integrite.versions.contenu.sauvegarde,
        carte: integrite.versions.carte.sauvegarde,
      });
    }

    return reply.header('cache-control', 'no-store').send({
      slot: save.slot,
      setup: save.setup,
      state: save.state,
      commands: save.commands,
      integrite,
    });
  });

  /* ── Enregistrement ───────────────────────────────────────────────────── */

  app.put(
    `${API.saves}/:id`,
    // Le corps d'une sauvegarde est volumineux : la limite de 24 Mo est posée
    // ici plutôt que globalement, pour que les autres routes restent à 1 Mo.
    { bodyLimit: MAX_SAVE_BYTES },
    async (request, reply) => {
      const params = parseOrMessages(SlotParamsSchema, request.params);
      if (!params.ok) fail('identifiant_invalide', MESSAGES.identifiantInvalide);

      const body = parseOrMessages(SaveUploadSchema, request.body);
      if (!body.ok) {
        fail('requete_invalide', `Sauvegarde refusée. ${body.messages[0]}`, {
          champs: body.champs,
        });
      }
      const upload = body.value;

      if (upload.slot.id !== params.value.id) {
        fail(
          'requete_invalide',
          "L'identifiant de l'emplacement ne correspond pas à celui de l'adresse.",
        );
      }

      let state: GameState;
      try {
        state = deserializeState(upload.state);
      } catch (err) {
        const raison = err instanceof SerializationError ? err.message : MESSAGES.requeteInvalide;
        fail('requete_invalide', `Sauvegarde refusée. ${raison}`);
      }

      const empreinte = stateHash(state);
      if (empreinte !== state.hash) {
        fail(
          'sauvegarde_corrompue',
          "Sauvegarde refusée : l'état transmis porte une empreinte incohérente. Il a été modifié après avoir été produit par le moteur.",
          { attendu: state.hash, obtenu: empreinte },
        );
      }
      if (empreinte !== upload.slot.hash) {
        fail(
          'sauvegarde_corrompue',
          "Sauvegarde refusée : l'empreinte annoncée ne correspond pas à l'état transmis.",
          { attendu: upload.slot.hash, obtenu: empreinte },
        );
      }

      const resume = summarizeState(state);
      const bytes =
        utf8Length(upload.state) +
        utf8Length(JSON.stringify(upload.commands)) +
        (upload.slot.thumbnail !== undefined ? utf8Length(upload.slot.thumbnail) : 0);

      const metas = await listMeta(ctx, request.identity);
      const plan = planSlotWrite(metas, params.value.id, upload.slot.autosave, bytes);
      if (!plan.ok) fail(plan.code, plan.message);

      const now = new Date().toISOString();
      const existant = metas.find((m) => m.slot.id === params.value.id) ?? null;

      // Descripteur autoritaire : tout ce qui décrit la partie vient de
      // l'état, pas du client. Seuls le nom, la vignette et le drapeau
      // d'automatisme sont des choix du joueur.
      const slot: SaveSlot = {
        id: params.value.id,
        name: upload.slot.name,
        turn: resume.turn,
        week: resume.week,
        players: resume.players.map((p) => ({
          name: p.name,
          faction: p.faction === 'ermitage' ? 'ermitage' : 'granit',
          color: p.color,
        })),
        createdAt: existant?.slot.createdAt ?? now,
        updatedAt: now,
        autosave: upload.slot.autosave,
        hash: empreinte,
      };
      if (upload.slot.thumbnail !== undefined) slot.thumbnail = upload.slot.thumbnail;

      const versions: SaveVersions = {
        moteur: resume.engineVersion,
        contenu: resume.contentVersion,
        carte: resume.mapVersion,
      };

      const stored: StoredSave = {
        slot,
        versions,
        bytes,
        setup: upload.setup,
        state: upload.state,
        commands: upload.commands,
      };

      if (plan.evince !== null) {
        try {
          await ctx.storage.deleteSave(request.identity, plan.evince);
        } catch (err) {
          request.log.warn(
            { raison: describe(err) },
            'rotation des sauvegardes automatiques incomplète',
          );
        }
      }

      try {
        await ctx.storage.putSave(request.identity, stored);
      } catch (err) {
        request.log.error({ raison: describe(err) }, 'écriture de la sauvegarde impossible');
        throw new HttpError('stockage_indisponible', MESSAGES.stockageIndisponible);
      }

      const apres = await listMeta(ctx, request.identity);
      return reply.code(plan.remplace ? 200 : 201).send({
        slot,
        remplace: plan.remplace,
        evince: plan.evince,
        integrite: checkIntegrity(state, slot, versions, ctx),
        quota: quotaOf(apres),
      });
    },
  );

  /* ── Suppression ──────────────────────────────────────────────────────── */

  app.delete(`${API.saves}/:id`, async (request, reply) => {
    const params = parseOrMessages(SlotParamsSchema, request.params);
    if (!params.ok) fail('identifiant_invalide', MESSAGES.identifiantInvalide);

    let supprime: boolean;
    try {
      supprime = await ctx.storage.deleteSave(request.identity, params.value.id);
    } catch (err) {
      request.log.error({ raison: describe(err) }, 'suppression impossible');
      throw new HttpError('stockage_indisponible', MESSAGES.stockageIndisponible);
    }
    if (!supprime) fail('sauvegarde_introuvable', MESSAGES.sauvegardeIntrouvable);

    const apres = await listMeta(ctx, request.identity);
    return reply.send({ supprime: true, quota: quotaOf(apres) });
  });

  /* ── Renommage ────────────────────────────────────────────────────────── */

  app.post(`${API.saves}/:id/rename`, async (request, reply) => {
    const params = parseOrMessages(SlotParamsSchema, request.params);
    if (!params.ok) fail('identifiant_invalide', MESSAGES.identifiantInvalide);

    const body = parseOrMessages(RenameSaveSchema, request.body);
    if (!body.ok) fail('nom_invalide', body.messages[0]);

    let slot: SaveSlot | null;
    try {
      slot = await ctx.storage.renameSave(request.identity, params.value.id, body.value.name);
    } catch (err) {
      request.log.error({ raison: describe(err) }, 'renommage impossible');
      throw new HttpError('stockage_indisponible', MESSAGES.stockageIndisponible);
    }
    if (slot === null) fail('sauvegarde_introuvable', MESSAGES.sauvegardeIntrouvable);

    return reply.send({ slot });
  });
}

/* ── Aides ──────────────────────────────────────────────────────────────── */

async function listMeta(ctx: ServerContext, identity: string): Promise<SaveMeta[]> {
  try {
    return await ctx.storage.listMeta(identity);
  } catch (err) {
    throw new HttpError('stockage_indisponible', MESSAGES.stockageIndisponible, {
      raison: describe(err),
    });
  }
}

async function read(
  ctx: ServerContext,
  identity: string,
  id: string,
): Promise<StoredSave | null> {
  try {
    return await ctx.storage.getSave(identity, id);
  } catch (err) {
    throw new HttpError('stockage_indisponible', MESSAGES.stockageIndisponible, {
      raison: describe(err),
    });
  }
}

function quotaOf(metas: readonly SaveMeta[]): QuotaPayload {
  const usage = usageOf(metas);
  return {
    octetsUtilises: usage.bytes,
    octetsMaximum: MAX_IDENTITY_BYTES,
    manuels: { utilises: usage.manuels, maximum: MANUAL_SLOTS },
    automatiques: { utilises: usage.automatiques, maximum: AUTOSAVE_SLOTS },
    resume: `${usage.manuels} emplacement${usage.manuels > 1 ? 's' : ''} manuel${
      usage.manuels > 1 ? 's' : ''
    } sur ${MANUAL_SLOTS}, ${usage.automatiques} sauvegarde${
      usage.automatiques > 1 ? 's' : ''
    } automatique${usage.automatiques > 1 ? 's' : ''} sur ${AUTOSAVE_SLOTS} — ${formatOctets(
      usage.bytes,
    )} utilisés sur ${formatOctets(MAX_IDENTITY_BYTES)}.`,
  };
}

/**
 * Contrôle d'intégrité complet : empreinte et compatibilité des versions.
 * Les messages sont rédigés pour être affichés tels quels au joueur.
 */
export function checkIntegrity(
  state: GameState,
  slot: SaveSlot,
  versions: SaveVersions,
  ctx: ServerContext,
): IntegrityReport {
  const obtenu = stateHash(state);
  const avertissements: string[] = [];

  const moteurSauvegarde = versions.moteur.length > 0 ? versions.moteur : state.engineVersion;
  const contenuSauvegarde = versions.contenu.length > 0 ? versions.contenu : state.contentVersion;
  const carteSauvegarde = versions.carte.length > 0 ? versions.carte : state.mapVersion;

  const moteurOk = versionsCompatibles(moteurSauvegarde, ctx.versions.moteur);
  const contenuOk = versionsCompatibles(contenuSauvegarde, ctx.versions.contenu);
  const carteOk = versionsCompatibles(carteSauvegarde, ctx.versions.carte);

  if (obtenu !== slot.hash) {
    avertissements.push(
      "L'empreinte de la partie ne correspond pas à celle enregistrée : la sauvegarde a été altérée.",
    );
  }
  if (!moteurOk) {
    avertissements.push(
      `Cette partie a été enregistrée avec le moteur ${moteurSauvegarde} ; le serveur exécute la version ${ctx.versions.moteur}. Les règles ont changé, la partie ne peut pas reprendre sans risque d'incohérence.`,
    );
  }
  if (!contenuOk) {
    avertissements.push(
      `Le contenu de cette partie (${contenuSauvegarde}) diffère de celui du serveur (${ctx.versions.contenu}) : créatures, sorts ou bâtiments pourraient manquer.`,
    );
  }
  if (!carteOk) {
    avertissements.push(
      `La carte de cette partie (${carteSauvegarde}) diffère de celle du serveur (${ctx.versions.carte}) : le relief et les objets ne coïncideraient plus.`,
    );
  }

  return {
    ok: obtenu === slot.hash && moteurOk && contenuOk && carteOk,
    hashAttendu: slot.hash,
    hashObtenu: obtenu,
    versions: {
      moteur: { sauvegarde: moteurSauvegarde, serveur: ctx.versions.moteur, compatible: moteurOk },
      contenu: {
        sauvegarde: contenuSauvegarde,
        serveur: ctx.versions.contenu,
        compatible: contenuOk,
      },
      carte: { sauvegarde: carteSauvegarde, serveur: ctx.versions.carte, compatible: carteOk },
    },
    avertissements,
  };
}
