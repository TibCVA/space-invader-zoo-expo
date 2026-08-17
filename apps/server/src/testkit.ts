/**
 * Fabriques partagées par les tests du serveur.
 *
 * Ce fichier n'est pas un test : Vitest ne le ramasse pas (`*.test.ts` seul
 * est collecté) et esbuild ne le bundle pas (il n'est atteignable depuis
 * aucun import de `server.ts`).
 *
 * Il produit de **vraies** sauvegardes : moteur branché par `bootstrapEngine`,
 * carte réelle de `@auvergne/map`, contenu réel de `@auvergne/content`. Les
 * tests d'intégrité vérifient donc quelque chose de réel, et pas un objet
 * bricolé qui passerait tous les contrôles par accident.
 */
import { bootstrapEngine } from '@auvergne/game';
import {
  applyCommand,
  createGame,
  type GameSetup,
  type GameState,
  type WorldMap,
} from '@auvergne/engine';
import { CONTENT_VERSION } from '@auvergne/content';
import { MAP_VERSION, buildWorld } from '@auvergne/map';
import { serializeState, type SaveUpload } from '@auvergne/protocol';
import type { InjectOptions, LightMyRequestResponse } from 'fastify';
import { buildServer, type BuiltServer } from './server.js';

export const TEST_SEED = 20260817;

let cachedWorld: WorldMap | null = null;

/** Carte réelle, construite une seule fois pour toute la suite de tests. */
export function testWorld(): WorldMap {
  bootstrapEngine();
  if (cachedWorld === null) cachedWorld = buildWorld(TEST_SEED);
  return cachedWorld;
}

/** Mise en place à deux bannières, valide au regard de `GameSetupSchema`. */
export function testSetup(seed = TEST_SEED): GameSetup {
  return {
    seed,
    mapVersion: MAP_VERSION,
    contentVersion: CONTENT_VERSION,
    duration: 'standard',
    victory: 'couronne',
    players: [
      {
        id: 'P1',
        name: 'Châtellenie de Granit',
        faction: 'granit',
        kind: 'humain',
        start: 'arconsat',
        hero: 'thibaut',
      },
      {
        id: 'P2',
        name: 'Ermitage des Bois Noirs',
        faction: 'ermitage',
        kind: 'ia',
        aiProfile: 'equilibre',
        start: 'renaudie',
        hero: 'agathe',
      },
    ],
  };
}

/** Partie réelle, éventuellement avancée de quelques journées. */
export function testGame(turns = 0, seed = TEST_SEED): GameState {
  const world = testWorld();
  let state = createGame(testSetup(seed), world);
  for (let i = 0; i < turns; i++) {
    const result = applyCommand(state, { type: 'EndTurn' }, world);
    if (!result.ok) break;
    state = result.state;
  }
  return state;
}

export interface UploadOptions {
  id?: string;
  name?: string;
  autosave?: boolean;
  thumbnail?: string;
  turns?: number;
  seed?: number;
  state?: GameState;
}

/** Corps prêt à être envoyé en `PUT /api/saves/:id`. */
export function testUpload(options: UploadOptions = {}): SaveUpload {
  const state = options.state ?? testGame(options.turns ?? 0, options.seed ?? TEST_SEED);
  const serialized = serializeState(state);
  const now = new Date().toISOString();
  const slot: SaveUpload['slot'] = {
    id: options.id ?? 'emplacement-1',
    name: options.name ?? 'Marche du Forez',
    turn: state.turn,
    week: Math.floor((state.turn - 1) / 7) + 1,
    players: state.turnOrder.map((id) => ({
      name: state.players[id].name,
      faction: state.players[id].faction,
      color: state.players[id].color,
    })),
    createdAt: now,
    updatedAt: now,
    autosave: options.autosave ?? false,
    hash: state.hash,
  };
  if (options.thumbnail !== undefined) slot.thumbnail = options.thumbnail;
  return { slot, setup: testSetup(options.seed ?? TEST_SEED), state: serialized, commands: [] };
}

/** Vignette minuscule, valide au regard de `ThumbnailSchema`. */
export const TEST_THUMBNAIL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/* ── Serveur de test ────────────────────────────────────────────────────── */

export interface TestServer extends BuiltServer {
  /** Requête injectée qui conserve automatiquement le cookie d'identité. */
  call(options: InjectOptions): Promise<LightMyRequestResponse>;
  /** Repart d'une identité vierge. */
  forgetIdentity(): void;
  /** Valeur signée du cookie d'identité, ou `null`. */
  cookie(): string | null;
  stop(): Promise<void>;
}

export interface TestServerOptions {
  /** Chemin imposé du client compilé (`''` pour aucun). */
  clientDir?: string | null;
  /** Stockage fichier dans ce dossier au lieu de la mémoire. */
  dataDir?: string;
}

/** Monte un serveur complet sur stockage mémoire, sans écouter de port. */
export async function startTestServer(options: TestServerOptions = {}): Promise<TestServer> {
  const built = await buildServer({
    silent: true,
    production: false,
    databaseUrl: null,
    forceMemoryStorage: options.dataDir === undefined,
    dataDir: options.dataDir ?? '/inutilise',
    clientDirOverride: options.clientDir === undefined ? null : options.clientDir,
    commit: 'essai0000',
  });

  let cookie: string | null = null;

  const call = async (opts: InjectOptions): Promise<LightMyRequestResponse> => {
    const headers: Record<string, string> = {
      ...((opts.headers as Record<string, string> | undefined) ?? {}),
    };
    if (cookie !== null) headers.cookie = cookie;
    const response = await built.app.inject({ ...opts, headers });
    for (const raw of setCookies(response)) {
      const [pair] = raw.split(';');
      if (pair.startsWith('forez_identite=')) cookie = pair;
    }
    return response;
  };

  return {
    ...built,
    call,
    cookie: () => cookie,
    forgetIdentity: () => {
      cookie = null;
    },
    stop: async () => {
      await built.app.close();
      await built.ctx.storage.close();
    },
  };
}

/** Extrait les en-têtes `set-cookie` d'une réponse injectée. */
export function setCookies(response: LightMyRequestResponse): string[] {
  const raw = response.headers['set-cookie'];
  if (raw === undefined) return [];
  return Array.isArray(raw) ? raw.map(String) : [String(raw)];
}
