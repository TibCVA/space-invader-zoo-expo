/**
 * Stockage PostgreSQL, actif dès que `DATABASE_URL` est défini.
 *
 * Principes :
 *  - **migration idempotente au démarrage** : `CREATE TABLE IF NOT EXISTS`,
 *    aucune migration destructive, le service peut redémarrer autant de fois
 *    qu'il veut ;
 *  - **requêtes paramétrées uniquement** : aucune valeur n'est concaténée dans
 *    une chaîne SQL, jamais, même un identifiant déjà validé par Zod ;
 *  - **aucun secret journalisé** : la chaîne de connexion n'est ni conservée
 *    en clair dans le libellé, ni recopiée dans un message d'erreur.
 *
 * Tables : `players`, `saves`, `save_blobs`, `replays`, `profiles`.
 * L'état sérialisé est stocké en `text` (et non en `jsonb`) : c'est la chaîne
 * exacte produite par `serializeState`, dont le hash doit rester vérifiable
 * octet pour octet — `jsonb` réordonnerait les clefs.
 */
import pg from 'pg';
import type { Profile, SaveSlot } from '@auvergne/protocol';
import type { Command, GameSetup } from '@auvergne/engine';
import {
  sortSlots,
  type SaveMeta,
  type SaveVersions,
  type Storage,
  type StorageKind,
  type StoredReplay,
  type StoredSave,
} from './index.js';

const { Pool } = pg;

/** Schéma complet, rejouable sans dommage à chaque démarrage. */
const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS players (
     id            text PRIMARY KEY,
     created_at    timestamptz NOT NULL DEFAULT now(),
     last_seen_at  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS saves (
     identity        text        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
     id              text        NOT NULL,
     name            text        NOT NULL,
     turn            integer     NOT NULL,
     week            integer     NOT NULL,
     players         jsonb       NOT NULL,
     thumbnail       text,
     autosave        boolean     NOT NULL DEFAULT false,
     hash            text        NOT NULL,
     engine_version  text        NOT NULL,
     content_version text        NOT NULL,
     map_version     text        NOT NULL,
     bytes           integer     NOT NULL DEFAULT 0,
     created_at      timestamptz NOT NULL DEFAULT now(),
     updated_at      timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (identity, id)
   )`,
  `CREATE TABLE IF NOT EXISTS save_blobs (
     identity  text  NOT NULL,
     id        text  NOT NULL,
     setup     jsonb NOT NULL,
     state     text  NOT NULL,
     commands  jsonb NOT NULL,
     PRIMARY KEY (identity, id),
     FOREIGN KEY (identity, id) REFERENCES saves(identity, id) ON DELETE CASCADE
   )`,
  `CREATE TABLE IF NOT EXISTS replays (
     id          text        PRIMARY KEY,
     identity    text        NOT NULL REFERENCES players(id) ON DELETE CASCADE,
     save_id     text,
     setup       jsonb       NOT NULL,
     commands    jsonb       NOT NULL,
     final_hash  text        NOT NULL,
     created_at  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS profiles (
     identity    text        PRIMARY KEY REFERENCES players(id) ON DELETE CASCADE,
     data        jsonb       NOT NULL,
     updated_at  timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE INDEX IF NOT EXISTS saves_identity_updated_idx
     ON saves (identity, updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS replays_identity_created_idx
     ON replays (identity, created_at DESC)`,
];

interface SaveRow {
  id: string;
  name: string;
  turn: number;
  week: number;
  players: SaveSlot['players'];
  thumbnail: string | null;
  autosave: boolean;
  hash: string;
  engine_version: string;
  content_version: string;
  map_version: string;
  bytes: number;
  created_at: Date | string;
  updated_at: Date | string;
}

interface BlobRow {
  setup: GameSetup;
  state: string;
  commands: Command[];
}

export class PostgresStorage implements Storage {
  readonly kind: StorageKind = 'postgres';
  readonly label = 'PostgreSQL';

  private readonly pool: pg.Pool;

  constructor(connectionString: string) {
    const secure = /sslmode=require|sslmode=verify/i.test(connectionString);
    this.pool = new Pool({
      connectionString,
      max: 8,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
      // Railway fournit un certificat géré ; on chiffre sans exiger une
      // chaîne de confiance locale, ce que le pilote ne sait pas faire seul.
      ...(secure ? { ssl: { rejectUnauthorized: false } } : {}),
    });
    // Une erreur sur une connexion inactive ne doit jamais tuer le processus.
    this.pool.on('error', () => undefined);
  }

  async init(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
      for (const sql of MIGRATIONS) await client.query(sql);
    } finally {
      client.release();
    }
  }

  /* ── Identité ─────────────────────────────────────────────────────────── */

  private async touchPlayer(identity: string): Promise<void> {
    await this.pool.query(
      `INSERT INTO players (id) VALUES ($1)
       ON CONFLICT (id) DO UPDATE SET last_seen_at = now()`,
      [identity],
    );
  }

  /* ── Emplacements ─────────────────────────────────────────────────────── */

  async listSaves(identity: string): Promise<SaveSlot[]> {
    return (await this.listMeta(identity)).map((m) => m.slot);
  }

  async listMeta(identity: string): Promise<SaveMeta[]> {
    const res = await this.pool.query<SaveRow>(
      `SELECT id, name, turn, week, players, thumbnail, autosave, hash,
              engine_version, content_version, map_version, bytes,
              created_at, updated_at
         FROM saves
        WHERE identity = $1`,
      [identity],
    );
    return sortSlots(res.rows.map((row) => rowToMeta(row)));
  }

  async getSave(identity: string, id: string): Promise<StoredSave | null> {
    const meta = await this.pool.query<SaveRow>(
      `SELECT id, name, turn, week, players, thumbnail, autosave, hash,
              engine_version, content_version, map_version, bytes,
              created_at, updated_at
         FROM saves
        WHERE identity = $1 AND id = $2`,
      [identity, id],
    );
    const row = meta.rows[0];
    if (row === undefined) return null;

    const blob = await this.pool.query<BlobRow>(
      `SELECT setup, state, commands FROM save_blobs WHERE identity = $1 AND id = $2`,
      [identity, id],
    );
    const payload = blob.rows[0];
    if (payload === undefined) return null;

    const base = rowToMeta(row);
    return {
      ...base,
      setup: payload.setup,
      state: payload.state,
      commands: Array.isArray(payload.commands) ? payload.commands : [],
    };
  }

  async putSave(identity: string, save: StoredSave): Promise<void> {
    await this.touchPlayer(identity);
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO saves (identity, id, name, turn, week, players, thumbnail, autosave,
                            hash, engine_version, content_version, map_version, bytes,
                            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,$13,$14,$15)
         ON CONFLICT (identity, id) DO UPDATE SET
           name            = EXCLUDED.name,
           turn            = EXCLUDED.turn,
           week            = EXCLUDED.week,
           players         = EXCLUDED.players,
           thumbnail       = EXCLUDED.thumbnail,
           autosave        = EXCLUDED.autosave,
           hash            = EXCLUDED.hash,
           engine_version  = EXCLUDED.engine_version,
           content_version = EXCLUDED.content_version,
           map_version     = EXCLUDED.map_version,
           bytes           = EXCLUDED.bytes,
           updated_at      = EXCLUDED.updated_at`,
        [
          identity,
          save.slot.id,
          save.slot.name,
          save.slot.turn,
          save.slot.week,
          JSON.stringify(save.slot.players),
          save.slot.thumbnail ?? null,
          save.slot.autosave,
          save.slot.hash,
          save.versions.moteur,
          save.versions.contenu,
          save.versions.carte,
          save.bytes,
          save.slot.createdAt,
          save.slot.updatedAt,
        ],
      );
      await client.query(
        `INSERT INTO save_blobs (identity, id, setup, state, commands)
         VALUES ($1,$2,$3::jsonb,$4,$5::jsonb)
         ON CONFLICT (identity, id) DO UPDATE SET
           setup    = EXCLUDED.setup,
           state    = EXCLUDED.state,
           commands = EXCLUDED.commands`,
        [
          identity,
          save.slot.id,
          JSON.stringify(save.setup),
          save.state,
          JSON.stringify(save.commands),
        ],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteSave(identity: string, id: string): Promise<boolean> {
    const res = await this.pool.query(`DELETE FROM saves WHERE identity = $1 AND id = $2`, [
      identity,
      id,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  async renameSave(identity: string, id: string, name: string): Promise<SaveSlot | null> {
    const res = await this.pool.query<SaveRow>(
      `UPDATE saves
          SET name = $3, updated_at = now()
        WHERE identity = $1 AND id = $2
        RETURNING id, name, turn, week, players, thumbnail, autosave, hash,
                  engine_version, content_version, map_version, bytes,
                  created_at, updated_at`,
      [identity, id, name],
    );
    const row = res.rows[0];
    return row === undefined ? null : rowToMeta(row).slot;
  }

  /* ── Profil ───────────────────────────────────────────────────────────── */

  async getProfile(identity: string): Promise<Profile | null> {
    const res = await this.pool.query<{ data: Profile }>(
      `SELECT data FROM profiles WHERE identity = $1`,
      [identity],
    );
    return res.rows[0]?.data ?? null;
  }

  async putProfile(identity: string, profile: Profile): Promise<Profile> {
    await this.touchPlayer(identity);
    await this.pool.query(
      `INSERT INTO profiles (identity, data, updated_at)
       VALUES ($1, $2::jsonb, now())
       ON CONFLICT (identity) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      [identity, JSON.stringify(profile)],
    );
    return profile;
  }

  /* ── Replays ──────────────────────────────────────────────────────────── */

  async putReplay(identity: string, replay: StoredReplay): Promise<void> {
    await this.touchPlayer(identity);
    await this.pool.query(
      `INSERT INTO replays (id, identity, save_id, setup, commands, final_hash, created_at)
       VALUES ($1,$2,$3,$4::jsonb,$5::jsonb,$6,$7)
       ON CONFLICT (id) DO UPDATE SET
         setup      = EXCLUDED.setup,
         commands   = EXCLUDED.commands,
         final_hash = EXCLUDED.final_hash`,
      [
        replay.id,
        identity,
        replay.saveId,
        JSON.stringify(replay.setup),
        JSON.stringify(replay.commands),
        replay.finalHash,
        replay.createdAt,
      ],
    );
  }

  async listReplays(identity: string): Promise<StoredReplay[]> {
    const res = await this.pool.query<{
      id: string;
      save_id: string | null;
      setup: GameSetup;
      commands: Command[];
      final_hash: string;
      created_at: Date | string;
    }>(
      `SELECT id, save_id, setup, commands, final_hash, created_at
         FROM replays WHERE identity = $1 ORDER BY created_at DESC LIMIT 200`,
      [identity],
    );
    return res.rows.map((r) => ({
      id: r.id,
      saveId: r.save_id,
      setup: r.setup,
      commands: Array.isArray(r.commands) ? r.commands : [],
      finalHash: r.final_hash,
      createdAt: iso(r.created_at),
    }));
  }

  /* ── Divers ───────────────────────────────────────────────────────────── */

  async stats(): Promise<{ identites: number; sauvegardes: number }> {
    const res = await this.pool.query<{ identites: string; sauvegardes: string }>(
      `SELECT (SELECT count(*) FROM players)::text AS identites,
              (SELECT count(*) FROM saves)::text   AS sauvegardes`,
    );
    const row = res.rows[0];
    return {
      identites: Number.parseInt(row?.identites ?? '0', 10),
      sauvegardes: Number.parseInt(row?.sauvegardes ?? '0', 10),
    };
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

/* ── Conversions ────────────────────────────────────────────────────────── */

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToMeta(row: SaveRow): SaveMeta {
  const slot: SaveSlot = {
    id: row.id,
    name: row.name,
    turn: row.turn,
    week: row.week,
    players: Array.isArray(row.players) ? row.players : [],
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    autosave: row.autosave === true,
    hash: row.hash,
  };
  if (row.thumbnail !== null && row.thumbnail !== undefined) slot.thumbnail = row.thumbnail;
  const versions: SaveVersions = {
    moteur: row.engine_version,
    contenu: row.content_version,
    carte: row.map_version,
  };
  return { slot, versions, bytes: row.bytes };
}
