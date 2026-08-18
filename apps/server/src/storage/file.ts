/**
 * Stockage fichier — repli par défaut lorsqu'aucune base n'est configurée.
 *
 * Disposition sur le disque (racine `.data/`, ignorée par Git) :
 *
 * ```
 * .data/
 *   identites/
 *     <identite>/
 *       profil.json
 *       emplacements/
 *         <id>.meta.json     ← descripteur : lu pour la liste
 *         <id>.save.json     ← charge utile : lue au chargement seulement
 *       replays/
 *         <id>.json
 * ```
 *
 * La séparation descripteur / charge utile est ce qui rend l'écran
 * « Charger une partie » instantané : lister douze emplacements ne lit que
 * douze fichiers de quelques centaines d'octets, jamais les 500 Ko d'état.
 *
 * **Écriture atomique** : chaque fichier est écrit dans un temporaire voisin
 * puis déplacé par `rename`, opération atomique sur le même système de
 * fichiers. Une coupure de courant laisse donc soit l'ancienne version
 * complète, soit la nouvelle, jamais un fichier tronqué.
 */
import { randomBytes } from 'node:crypto';
import { constants } from 'node:fs';
import { access, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Profile, SaveSlot } from '@auvergne/protocol';
import {
  sortParties,
  sortSlots,
  type SaveMeta,
  type SaveVersions,
  type Storage,
  type StorageKind,
  type StoredParty,
  type StoredReplay,
  type StoredSave,
} from './index.js';

const META_SUFFIX = '.meta.json';
const SAVE_SUFFIX = '.save.json';

/** Identifiants acceptés sur le disque : jamais de séparateur ni de point. */
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9_-]*$/;

/** Codes de partie acceptés sur le disque : `FOREZ-7K2P`. */
const SAFE_CODE = /^[A-Z]{4,10}-[A-Z0-9]{4}$/;

interface MetaFile {
  slot: SaveSlot;
  versions: SaveVersions;
  bytes: number;
}

interface SaveFile {
  setup: StoredSave['setup'];
  state: string;
  commands: StoredSave['commands'];
}

export class FileStorage implements Storage {
  readonly kind: StorageKind = 'fichier';
  readonly label: string;

  private readonly root: string;

  constructor(dataDir: string) {
    this.root = resolve(dataDir);
    this.label = `Stockage fichier (${this.root})`;
  }

  /**
   * Crée l'arborescence et **vérifie réellement** que le disque est
   * inscriptible : un `mkdir` réussi ne suffit pas si le volume est monté en
   * lecture seule après coup. On écrit puis on efface un témoin.
   */
  async init(): Promise<void> {
    await mkdir(this.identitiesDir(), { recursive: true });
    const probe = join(this.root, `.ecriture-${randomBytes(6).toString('hex')}`);
    await writeFile(probe, 'ok', 'utf8');
    await unlink(probe);
  }

  /* ── Chemins ──────────────────────────────────────────────────────────── */

  private identitiesDir(): string {
    return join(this.root, 'identites');
  }

  private identityDir(identity: string): string {
    return join(this.identitiesDir(), safeSegment(identity));
  }

  private slotsDir(identity: string): string {
    return join(this.identityDir(identity), 'emplacements');
  }

  private replaysDir(identity: string): string {
    return join(this.identityDir(identity), 'replays');
  }

  private profilePath(identity: string): string {
    return join(this.identityDir(identity), 'profil.json');
  }

  /* ── Emplacements ─────────────────────────────────────────────────────── */

  async listSaves(identity: string): Promise<SaveSlot[]> {
    return (await this.listMeta(identity)).map((m) => m.slot);
  }

  async listMeta(identity: string): Promise<SaveMeta[]> {
    const dir = this.slotsDir(identity);
    const names = await listDir(dir);
    const metas: SaveMeta[] = [];
    for (const name of names) {
      if (!name.endsWith(META_SUFFIX)) continue;
      const meta = await readJson<MetaFile>(join(dir, name));
      if (meta === null || typeof meta.slot !== 'object' || meta.slot === null) continue;
      metas.push({
        slot: meta.slot,
        versions: meta.versions ?? { moteur: '', contenu: '', carte: '' },
        bytes: typeof meta.bytes === 'number' ? meta.bytes : 0,
      });
    }
    return sortSlots(metas);
  }

  async getSave(identity: string, id: string): Promise<StoredSave | null> {
    const key = safeSegment(id);
    const dir = this.slotsDir(identity);
    const meta = await readJson<MetaFile>(join(dir, `${key}${META_SUFFIX}`));
    if (meta === null) return null;
    const payload = await readJson<SaveFile>(join(dir, `${key}${SAVE_SUFFIX}`));
    if (payload === null) return null;
    return {
      slot: meta.slot,
      versions: meta.versions ?? { moteur: '', contenu: '', carte: '' },
      bytes: typeof meta.bytes === 'number' ? meta.bytes : 0,
      setup: payload.setup,
      state: payload.state,
      commands: Array.isArray(payload.commands) ? payload.commands : [],
    };
  }

  async putSave(identity: string, save: StoredSave): Promise<void> {
    const key = safeSegment(save.slot.id);
    const dir = this.slotsDir(identity);
    await mkdir(dir, { recursive: true });

    const payload: SaveFile = {
      setup: save.setup,
      state: save.state,
      commands: save.commands,
    };
    const meta: MetaFile = { slot: save.slot, versions: save.versions, bytes: save.bytes };

    // La charge utile d'abord : si l'écriture du descripteur échoue, on n'a
    // pas d'emplacement listé qui pointerait vers un fichier absent.
    await writeAtomic(join(dir, `${key}${SAVE_SUFFIX}`), JSON.stringify(payload));
    await writeAtomic(join(dir, `${key}${META_SUFFIX}`), JSON.stringify(meta, null, 2));
  }

  async deleteSave(identity: string, id: string): Promise<boolean> {
    const key = safeSegment(id);
    const dir = this.slotsDir(identity);
    const metaPath = join(dir, `${key}${META_SUFFIX}`);
    if (!(await exists(metaPath))) return false;
    await rm(metaPath, { force: true });
    await rm(join(dir, `${key}${SAVE_SUFFIX}`), { force: true });
    return true;
  }

  async renameSave(identity: string, id: string, name: string): Promise<SaveSlot | null> {
    const key = safeSegment(id);
    const dir = this.slotsDir(identity);
    const metaPath = join(dir, `${key}${META_SUFFIX}`);
    const meta = await readJson<MetaFile>(metaPath);
    if (meta === null) return null;
    meta.slot = { ...meta.slot, name, updatedAt: new Date().toISOString() };
    await writeAtomic(metaPath, JSON.stringify(meta, null, 2));
    return meta.slot;
  }

  /* ── Profil ───────────────────────────────────────────────────────────── */

  async getProfile(identity: string): Promise<Profile | null> {
    return await readJson<Profile>(this.profilePath(identity));
  }

  async putProfile(identity: string, profile: Profile): Promise<Profile> {
    await mkdir(this.identityDir(identity), { recursive: true });
    await writeAtomic(this.profilePath(identity), JSON.stringify(profile, null, 2));
    return profile;
  }

  /* ── Replays ──────────────────────────────────────────────────────────── */

  async putReplay(identity: string, replay: StoredReplay): Promise<void> {
    const dir = this.replaysDir(identity);
    await mkdir(dir, { recursive: true });
    await writeAtomic(join(dir, `${safeSegment(replay.id)}.json`), JSON.stringify(replay));
  }

  async listReplays(identity: string): Promise<StoredReplay[]> {
    const dir = this.replaysDir(identity);
    const names = await listDir(dir);
    const out: StoredReplay[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const replay = await readJson<StoredReplay>(join(dir, name));
      if (replay !== null) out.push(replay);
    }
    return out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  /* ── Parties en ligne ─────────────────────────────────────────────────── */

  /**
   * Une partie = un fichier `parties/<CODE>.json`, écrit atomiquement. Le code
   * est en majuscules et ne contient qu'un tiret : `safeCode` le vérifie avant
   * qu'il ne touche le système de fichiers.
   */
  private partiesDir(): string {
    return join(this.root, 'parties');
  }

  private partyPath(code: string): string {
    return join(this.partiesDir(), `${safeCode(code)}.json`);
  }

  async createParty(party: StoredParty): Promise<void> {
    await mkdir(this.partiesDir(), { recursive: true });
    if (await exists(this.partyPath(party.code))) {
      throw new Error('Code de partie déjà utilisé.');
    }
    await writeAtomic(this.partyPath(party.code), JSON.stringify(party));
  }

  async getParty(code: string): Promise<StoredParty | null> {
    return await readJson<StoredParty>(this.partyPath(code));
  }

  async putParty(party: StoredParty): Promise<void> {
    await mkdir(this.partiesDir(), { recursive: true });
    await writeAtomic(this.partyPath(party.code), JSON.stringify(party));
  }

  async listPartiesOf(identity: string): Promise<StoredParty[]> {
    const names = await listDir(this.partiesDir());
    const out: StoredParty[] = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const party = await readJson<StoredParty>(join(this.partiesDir(), name));
      if (party === null || !Array.isArray(party.joueurs)) continue;
      const tenue = party.joueurs.some((s) => s.identite === identity);
      if (tenue || party.hote === identity) out.push(party);
    }
    return sortParties(out);
  }

  async countParties(): Promise<number> {
    const names = await listDir(this.partiesDir());
    return names.filter((n) => n.endsWith('.json')).length;
  }

  /* ── Divers ───────────────────────────────────────────────────────────── */

  async stats(): Promise<{ identites: number; sauvegardes: number }> {
    const identites = await listDir(this.identitiesDir());
    let sauvegardes = 0;
    for (const id of identites) {
      const names = await listDir(join(this.identitiesDir(), id, 'emplacements'));
      sauvegardes += names.filter((n) => n.endsWith(META_SUFFIX)).length;
    }
    return { identites: identites.length, sauvegardes };
  }

  async close(): Promise<void> {
    /* aucune ressource à libérer */
  }
}

/* ── Primitives de fichiers ─────────────────────────────────────────────── */

/**
 * Refuse tout segment qui pourrait sortir du dossier de l'identité. Les
 * schémas Zod garantissent déjà la forme, mais le stockage ne fait confiance
 * à personne : c'est la dernière barrière avant le système de fichiers.
 */
function safeSegment(value: string): string {
  if (!SAFE_SEGMENT.test(value)) {
    throw new Error("Identifiant de stockage invalide : caractères non autorisés.");
  }
  return value;
}

/** Même barrière pour un code de partie : majuscules, chiffres, un tiret. */
function safeCode(value: string): string {
  if (!SAFE_CODE.test(value)) {
    throw new Error('Code de partie invalide : caractères non autorisés.');
  }
  return value;
}

/** Écriture atomique : temporaire voisin puis `rename`. */
async function writeAtomic(path: string, contents: string): Promise<void> {
  const tmp = `${path}.tmp-${randomBytes(8).toString('hex')}`;
  try {
    await writeFile(tmp, contents, { encoding: 'utf8', mode: 0o600 });
    await rename(tmp, path);
  } catch (err) {
    await rm(tmp, { force: true }).catch(() => undefined);
    throw err;
  }
}

async function readJson<T>(path: string): Promise<T | null> {
  try {
    const text = await readFile(path, 'utf8');
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function listDir(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
