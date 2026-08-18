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
 * Tables : `players`, `saves`, `save_blobs`, `replays`, `profiles`, et les
 * quatre tables des parties en ligne (`parties`, `partie_joueurs`,
 * `partie_etats`, `partie_commandes`, cf. `writeParty`).
 * L'état sérialisé est stocké en `text` (et non en `jsonb`) : c'est la chaîne
 * exacte produite par `serializeState`, dont le hash doit rester vérifiable
 * octet pour octet — `jsonb` réordonnerait les clefs.
 */
import pg from 'pg';
import { MAX_PARTY_COMMANDS, type Profile, type SaveSlot } from '@auvergne/protocol';
import type { Command, FactionId, GameSetup, PlayerId, StartKey } from '@auvergne/engine';
import {
  MAX_SNAPSHOTS,
  sortSlots,
  type AiProfile,
  type PartySetup,
  type PartyStatus,
  type SaveMeta,
  type SaveVersions,
  type SeatKind,
  type Storage,
  type StorageKind,
  type StoredParty,
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
  /* — Parties en ligne asynchrones (`docs/04-MULTIJOUEUR.md` §3) — */
  `CREATE TABLE IF NOT EXISTS parties (
     code            text        PRIMARY KEY,
     hote            text        NOT NULL,
     jeton_hote      text        NOT NULL,
     setup           jsonb       NOT NULL,
     statut          text        NOT NULL,
     seq             integer     NOT NULL DEFAULT 0,
     active_player   text,
     engine_version  text        NOT NULL,
     content_version text        NOT NULL,
     map_version     text        NOT NULL,
     etat            text,
     hash            text,
     cree_le         timestamptz NOT NULL DEFAULT now(),
     maj_le          timestamptz NOT NULL DEFAULT now(),
     terminee_le     timestamptz,
     gagnant         text
   )`,
  `CREATE TABLE IF NOT EXISTS partie_joueurs (
     code           text    NOT NULL REFERENCES parties(code) ON DELETE CASCADE,
     slot           text    NOT NULL,
     jeton          text,
     identite       text,
     nom            text,
     faction        text,
     heros          text,
     avatar         text,
     depart         text,
     kind           text    NOT NULL,
     profil_ia      text,
     pret           boolean NOT NULL DEFAULT false,
     dernier_vu_le  timestamptz,
     PRIMARY KEY (code, slot)
   )`,
  `CREATE TABLE IF NOT EXISTS partie_etats (
     code     text        NOT NULL REFERENCES parties(code) ON DELETE CASCADE,
     seq      integer     NOT NULL,
     etat     text        NOT NULL,
     hash     text        NOT NULL,
     cree_le  timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (code, seq)
   )`,
  `CREATE TABLE IF NOT EXISTS partie_commandes (
     code             text        NOT NULL REFERENCES parties(code) ON DELETE CASCADE,
     seq              integer     NOT NULL,
     joueur           text        NOT NULL,
     commande         jsonb       NOT NULL,
     cle_idempotence  text        NOT NULL,
     applique_le      timestamptz NOT NULL DEFAULT now(),
     ok               boolean     NOT NULL DEFAULT true,
     erreur           text,
     journal          jsonb       NOT NULL DEFAULT '[]'::jsonb,
     tours_ia         jsonb       NOT NULL DEFAULT '[]'::jsonb,
     PRIMARY KEY (code, seq)
   )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS partie_commandes_cle_idx
     ON partie_commandes (code, cle_idempotence)`,
  `CREATE INDEX IF NOT EXISTS partie_joueurs_identite_idx
     ON partie_joueurs (identite)`,
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

interface PartyRow {
  code: string;
  hote: string;
  jeton_hote: string;
  setup: PartySetup;
  statut: PartyStatus;
  seq: number;
  active_player: PlayerId | null;
  engine_version: string;
  content_version: string;
  map_version: string;
  etat: string | null;
  hash: string | null;
  cree_le: Date | string;
  maj_le: Date | string;
  terminee_le: Date | string | null;
  gagnant: PlayerId | null;
}

interface SeatRow {
  slot: PlayerId;
  jeton: string | null;
  identite: string | null;
  nom: string | null;
  faction: FactionId | null;
  heros: string | null;
  avatar: string | null;
  depart: StartKey | null;
  kind: SeatKind;
  profil_ia: AiProfile | null;
  pret: boolean;
  dernier_vu_le: Date | string | null;
}

interface SnapshotRow {
  seq: number;
  etat: string;
  hash: string;
  cree_le: Date | string;
}

interface CommandRow {
  seq: number;
  joueur: PlayerId;
  commande: Command;
  cle_idempotence: string;
  applique_le: Date | string;
  ok: boolean;
  erreur: string | null;
  journal: string[];
  tours_ia: PlayerId[];
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

  /* ── Parties en ligne ─────────────────────────────────────────────────── */

  /**
   * **Pourquoi quatre tables et non une ligne à sous-objets `jsonb`.**
   *
   * Une partie est un agrégat, et la tentation est de l'écrire d'un bloc : une
   * ligne, `joueurs`/`instantanes`/`commandes` en `jsonb`. Deux raisons de ne
   * pas le faire, et elles décident toutes les deux dans le même sens.
   *
   *  1. **Le volume.** `MAX_PARTY_COMMANDS` vaut vingt mille. Réécrire le
   *     journal entier à chaque coup, c'est recopier des mégaoctets pour
   *     ajouter une ligne, quatre-vingt-dix-neuf fois sur cent pour rien.
   *     Ici le journal est *append-only* : seules les lignes dont le `seq`
   *     dépasse le maximum déjà consigné partent sur le réseau.
   *  2. **La concurrence.** Deux requêtes qui liraient le même agrégat et
   *     calculeraient le même `seq` suivant s'écraseraient en silence dans la
   *     forme « une ligne ». Avec `partie_commandes`, la clef primaire
   *     `(code, seq)` et l'index unique `(code, cle_idempotence)` font de ce
   *     doublon une violation de contrainte : la transaction perdante est
   *     annulée entière et la route répond une erreur, au lieu de perdre le
   *     coup du gagnant. C'est le point de sérialisation que la forme `jsonb`
   *     n'a pas.
   *
   * `etat` reste du `text`, dans `parties` comme dans `partie_etats` : c'est
   * la chaîne exacte de `serializeState`, dont le hash doit rester vérifiable
   * octet pour octet. `jsonb` réordonnerait les clefs et le hash ne
   * correspondrait plus.
   *
   * Tout part dans une seule transaction : en-tête, bannières, instantanés,
   * lignes de journal neuves.
   */
  async createParty(party: StoredParty): Promise<void> {
    await this.writeParty(party, true);
  }

  async putParty(party: StoredParty): Promise<void> {
    await this.writeParty(party, false);
  }

  private async writeParty(party: StoredParty, neuve: boolean): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const entete = await client.query(
        `INSERT INTO parties (code, hote, jeton_hote, setup, statut, seq, active_player,
                              engine_version, content_version, map_version, etat, hash,
                              cree_le, maj_le, terminee_le, gagnant)
              VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
         ON CONFLICT (code) DO UPDATE
            SET statut = EXCLUDED.statut,
                seq = EXCLUDED.seq,
                active_player = EXCLUDED.active_player,
                etat = EXCLUDED.etat,
                hash = EXCLUDED.hash,
                maj_le = EXCLUDED.maj_le,
                terminee_le = EXCLUDED.terminee_le,
                gagnant = EXCLUDED.gagnant
          WHERE $17 = false`,
        [
          party.code,
          party.hote,
          party.jetonHote,
          JSON.stringify(party.setup),
          party.statut,
          party.seq,
          party.activePlayer,
          party.versions.moteur,
          party.versions.contenu,
          party.versions.carte,
          party.etat,
          party.hash,
          party.creeLe,
          party.majLe,
          party.termineeLe,
          party.gagnant,
          neuve,
        ],
      );
      if (neuve && entete.rowCount === 0) {
        throw new Error('Code de partie déjà utilisé.');
      }

      for (const seat of party.joueurs) {
        await client.query(
          `INSERT INTO partie_joueurs (code, slot, jeton, identite, nom, faction, heros,
                                       avatar, depart, kind, profil_ia, pret, dernier_vu_le)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
           ON CONFLICT (code, slot) DO UPDATE
              SET jeton = EXCLUDED.jeton, identite = EXCLUDED.identite,
                  nom = EXCLUDED.nom, faction = EXCLUDED.faction, heros = EXCLUDED.heros,
                  avatar = EXCLUDED.avatar, depart = EXCLUDED.depart, kind = EXCLUDED.kind,
                  profil_ia = EXCLUDED.profil_ia, pret = EXCLUDED.pret,
                  dernier_vu_le = EXCLUDED.dernier_vu_le`,
          [
            party.code,
            seat.slot,
            seat.jeton,
            seat.identite,
            seat.nom,
            seat.faction,
            seat.heros,
            seat.avatar,
            seat.depart,
            seat.kind,
            seat.profilIa,
            seat.pret,
            seat.dernierVuLe,
          ],
        );
      }

      // Instantanés : on n'écrit que les nouveaux, et on élague ceux que
      // l'agrégat a laissés tomber. `MAX_SNAPSHOTS` est une limite de
      // conservation, pas seulement une limite de lecture : un état complet
      // pèse une centaine de kilo-octets par bannière.
      for (const snap of party.instantanes) {
        await client.query(
          `INSERT INTO partie_etats (code, seq, etat, hash, cree_le)
                VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (code, seq) DO NOTHING`,
          [party.code, snap.seq, snap.etat, snap.hash, snap.creeLe],
        );
      }
      const plusAncien = party.instantanes[0]?.seq;
      if (plusAncien !== undefined) {
        await client.query(`DELETE FROM partie_etats WHERE code = $1 AND seq < $2`, [
          party.code,
          plusAncien,
        ]);
      }

      // Le journal est append-only : on n'envoie que ce qui n'y est pas
      // encore. Sans `ON CONFLICT`, deux requêtes concurrentes qui
      // calculeraient le même `seq` se heurtent à la clef primaire, et la
      // perdante annule sa transaction au lieu d'écraser le coup de l'autre.
      const dernier = await client.query<{ max: number | null }>(
        `SELECT max(seq) AS max FROM partie_commandes WHERE code = $1`,
        [party.code],
      );
      const consigne = dernier.rows[0]?.max ?? -1;
      for (const cmd of party.commandes) {
        if (cmd.seq <= consigne) continue;
        await client.query(
          `INSERT INTO partie_commandes (code, seq, joueur, commande, cle_idempotence,
                                         applique_le, ok, erreur, journal, tours_ia)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            party.code,
            cmd.seq,
            cmd.joueur,
            JSON.stringify(cmd.commande),
            cmd.cleIdempotence,
            cmd.appliqueLe,
            cmd.ok,
            cmd.erreur,
            JSON.stringify(cmd.journal),
            JSON.stringify(cmd.toursIa),
          ],
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  async getParty(code: string): Promise<StoredParty | null> {
    const res = await this.pool.query<PartyRow>(
      `SELECT code, hote, jeton_hote, setup, statut, seq, active_player,
              engine_version, content_version, map_version, etat, hash,
              cree_le, maj_le, terminee_le, gagnant
         FROM parties WHERE code = $1`,
      [code],
    );
    const row = res.rows[0];
    if (row === undefined) return null;
    return await this.hydrateParty(row);
  }

  async listPartiesOf(identity: string): Promise<StoredParty[]> {
    const res = await this.pool.query<PartyRow>(
      `SELECT p.code, p.hote, p.jeton_hote, p.setup, p.statut, p.seq, p.active_player,
              p.engine_version, p.content_version, p.map_version, p.etat, p.hash,
              p.cree_le, p.maj_le, p.terminee_le, p.gagnant
         FROM parties p
        WHERE p.hote = $1
           OR EXISTS (SELECT 1 FROM partie_joueurs j
                       WHERE j.code = p.code AND j.identite = $1)
        ORDER BY p.maj_le DESC
        LIMIT 100`,
      [identity],
    );
    const out: StoredParty[] = [];
    for (const row of res.rows) out.push(await this.hydrateParty(row));
    return out;
  }

  async countParties(): Promise<number> {
    const res = await this.pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM parties`);
    return Number.parseInt(res.rows[0]?.n ?? '0', 10);
  }

  private async hydrateParty(row: PartyRow): Promise<StoredParty> {
    const seats = await this.pool.query<SeatRow>(
      `SELECT slot, jeton, identite, nom, faction, heros, avatar, depart,
              kind, profil_ia, pret, dernier_vu_le
         FROM partie_joueurs WHERE code = $1 ORDER BY slot`,
      [row.code],
    );
    const snaps = await this.pool.query<SnapshotRow>(
      `SELECT seq, etat, hash, cree_le FROM partie_etats
        WHERE code = $1 ORDER BY seq DESC LIMIT $2`,
      [row.code, MAX_SNAPSHOTS],
    );
    const cmds = await this.pool.query<CommandRow>(
      `SELECT seq, joueur, commande, cle_idempotence, applique_le, ok, erreur, journal, tours_ia
         FROM partie_commandes WHERE code = $1 ORDER BY seq ASC LIMIT $2`,
      [row.code, MAX_PARTY_COMMANDS],
    );

    return {
      code: row.code,
      hote: row.hote,
      jetonHote: row.jeton_hote,
      setup: row.setup,
      statut: row.statut,
      seq: row.seq,
      activePlayer: row.active_player,
      versions: {
        moteur: row.engine_version,
        contenu: row.content_version,
        carte: row.map_version,
      },
      joueurs: seats.rows.map((s) => ({
        slot: s.slot,
        jeton: s.jeton,
        identite: s.identite,
        nom: s.nom,
        faction: s.faction,
        heros: s.heros,
        avatar: s.avatar,
        depart: s.depart,
        kind: s.kind,
        profilIa: s.profil_ia,
        pret: s.pret === true,
        dernierVuLe: s.dernier_vu_le === null ? null : iso(s.dernier_vu_le),
      })),
      etat: row.etat,
      hash: row.hash,
      instantanes: snaps.rows
        .map((s) => ({ seq: s.seq, etat: s.etat, hash: s.hash, creeLe: iso(s.cree_le) }))
        .sort((a, b) => a.seq - b.seq),
      commandes: cmds.rows.map((c) => ({
        seq: c.seq,
        joueur: c.joueur,
        commande: c.commande,
        cleIdempotence: c.cle_idempotence,
        appliqueLe: iso(c.applique_le),
        ok: c.ok === true,
        erreur: c.erreur,
        journal: Array.isArray(c.journal) ? c.journal : [],
        toursIa: Array.isArray(c.tours_ia) ? c.tours_ia : [],
      })),
      creeLe: iso(row.cree_le),
      majLe: iso(row.maj_le),
      termineeLe: row.terminee_le === null ? null : iso(row.terminee_le),
      gagnant: row.gagnant,
    };
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
