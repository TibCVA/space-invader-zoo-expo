/**
 * Stockage en mémoire — dernier repli.
 *
 * Utilisé lorsque ni PostgreSQL ni le disque ne sont disponibles (conteneur en
 * lecture seule, volume non monté). Les sauvegardes disparaissent au
 * redémarrage : c'est explicitement signalé dans `/health` et sur la page de
 * diagnostic, et le client conserve de son côté une copie `localStorage`.
 *
 * Sert aussi de dos-office aux tests : rapide, isolé, sans effet de bord.
 */
import type { Profile, SaveSlot } from '@auvergne/protocol';
import {
  sortParties,
  sortSlots,
  type SaveMeta,
  type Storage,
  type StorageKind,
  type StoredParty,
  type StoredReplay,
  type StoredSave,
} from './index.js';

interface Bucket {
  saves: Map<string, StoredSave>;
  replays: StoredReplay[];
  profile: Profile | null;
}

export class MemoryStorage implements Storage {
  readonly kind: StorageKind = 'memoire';
  readonly label: string;

  private readonly buckets = new Map<string, Bucket>();

  /** Parties en ligne, indexées par code. */
  private readonly parties = new Map<string, StoredParty>();

  constructor(label = 'Stockage en mémoire') {
    this.label = label;
  }

  async init(): Promise<void> {
    /* rien à préparer */
  }

  private bucket(identity: string): Bucket {
    let b = this.buckets.get(identity);
    if (b === undefined) {
      b = { saves: new Map(), replays: [], profile: null };
      this.buckets.set(identity, b);
    }
    return b;
  }

  async listSaves(identity: string): Promise<SaveSlot[]> {
    const metas = await this.listMeta(identity);
    return metas.map((m) => m.slot);
  }

  async listMeta(identity: string): Promise<SaveMeta[]> {
    const b = this.buckets.get(identity);
    if (b === undefined) return [];
    const metas: SaveMeta[] = [];
    for (const save of b.saves.values()) {
      metas.push({ slot: clone(save.slot), versions: { ...save.versions }, bytes: save.bytes });
    }
    return sortSlots(metas);
  }

  async getSave(identity: string, id: string): Promise<StoredSave | null> {
    const found = this.buckets.get(identity)?.saves.get(id);
    return found === undefined ? null : clone(found);
  }

  async putSave(identity: string, save: StoredSave): Promise<void> {
    this.bucket(identity).saves.set(save.slot.id, clone(save));
  }

  async deleteSave(identity: string, id: string): Promise<boolean> {
    const b = this.buckets.get(identity);
    if (b === undefined) return false;
    return b.saves.delete(id);
  }

  async renameSave(identity: string, id: string, name: string): Promise<SaveSlot | null> {
    const save = this.buckets.get(identity)?.saves.get(id);
    if (save === undefined) return null;
    save.slot = { ...save.slot, name, updatedAt: new Date().toISOString() };
    return clone(save.slot);
  }

  async getProfile(identity: string): Promise<Profile | null> {
    const p = this.buckets.get(identity)?.profile;
    return p === undefined || p === null ? null : clone(p);
  }

  async putProfile(identity: string, profile: Profile): Promise<Profile> {
    this.bucket(identity).profile = clone(profile);
    return clone(profile);
  }

  async putReplay(identity: string, replay: StoredReplay): Promise<void> {
    const b = this.bucket(identity);
    b.replays = b.replays.filter((r) => r.id !== replay.id);
    b.replays.push(clone(replay));
    // On ne conserve que les cinquante derniers : le repli mémoire n'est pas
    // une archive, et rien ne doit pouvoir faire enfler le processus.
    if (b.replays.length > 50) b.replays = b.replays.slice(-50);
  }

  async listReplays(identity: string): Promise<StoredReplay[]> {
    const b = this.buckets.get(identity);
    if (b === undefined) return [];
    return b.replays.map((r) => clone(r)).sort((a, z) => z.createdAt.localeCompare(a.createdAt));
  }

  /* ── Parties en ligne ─────────────────────────────────────────────────── */

  async createParty(party: StoredParty): Promise<void> {
    if (this.parties.has(party.code)) {
      throw new Error('Code de partie déjà utilisé.');
    }
    this.parties.set(party.code, clone(party));
  }

  async getParty(code: string): Promise<StoredParty | null> {
    const found = this.parties.get(code);
    return found === undefined ? null : clone(found);
  }

  async putParty(party: StoredParty): Promise<void> {
    this.parties.set(party.code, clone(party));
  }

  async listPartiesOf(identity: string): Promise<StoredParty[]> {
    const out: StoredParty[] = [];
    for (const party of this.parties.values()) {
      const tenue = party.joueurs.some((s) => s.identite === identity);
      if (tenue || party.hote === identity) out.push(clone(party));
    }
    return sortParties(out);
  }

  async countParties(): Promise<number> {
    return this.parties.size;
  }

  async stats(): Promise<{ identites: number; sauvegardes: number }> {
    let sauvegardes = 0;
    for (const b of this.buckets.values()) sauvegardes += b.saves.size;
    return { identites: this.buckets.size, sauvegardes };
  }

  async close(): Promise<void> {
    this.buckets.clear();
    this.parties.clear();
  }
}

/** Copie profonde : le stockage ne doit jamais partager de référence mutable. */
function clone<T>(value: T): T {
  return structuredClone(value);
}
