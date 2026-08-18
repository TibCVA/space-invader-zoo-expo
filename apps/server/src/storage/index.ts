/**
 * Contrat de stockage et sélection automatique du dos-office.
 *
 * Trois implémentations interchangeables, choisies dans cet ordre :
 *
 *  1. **PostgreSQL** (`postgres.ts`) si `DATABASE_URL` est défini ;
 *  2. **fichier JSON** (`file.ts`) dans `.data/`, écriture atomique ;
 *  3. **mémoire** (`memory.ts`) si le disque est en lecture seule.
 *
 * Le brief impose que le jeu reste jouable sans base de données (§2, règle 8) :
 * une panne de PostgreSQL fait basculer sur le repli fichier, et une panne du
 * disque fait basculer sur la mémoire. Le service répond toujours.
 *
 * La politique d'emplacements (12 manuels + 3 automatiques rotatifs) et les
 * quotas (24 Mo par sauvegarde, 200 Mo par identité) sont décrits ici, une
 * seule fois, pour que les trois implémentations se comportent à l'identique.
 */
import {
  AUTOSAVE_SLOTS,
  MANUAL_SLOTS,
  MAX_IDENTITY_BYTES,
  MAX_SAVE_BYTES,
  type Profile,
  type SaveSlot,
} from '@auvergne/protocol';
import type { Command, GameSetup } from '@auvergne/engine';
import type { PartyStore } from './parties.js';

export type {
  AiProfile,
  PartySetup,
  PartyStatus,
  PartyStore,
  SeatKind,
  StoredParty,
  StoredPartyCommand,
  StoredPartySnapshot,
  StoredSeat,
} from './parties.js';
export {
  MAX_SNAPSHOTS,
  SEAT_IDS,
  SNAPSHOT_EVERY,
  emptySeat,
  seatOfIdentity,
  seatOfToken,
  sortParties,
} from './parties.js';

/* ── Types stockés ──────────────────────────────────────────────────────── */

/** Nature du stockage réellement actif. */
export type StorageKind = 'postgres' | 'fichier' | 'memoire';

/** Versions relevées dans l'état au moment du dépôt. */
export interface SaveVersions {
  moteur: string;
  contenu: string;
  carte: string;
}

/** Descripteur enrichi : le `SaveSlot` du contrat, plus ce dont le serveur a besoin. */
export interface SaveMeta {
  slot: SaveSlot;
  versions: SaveVersions;
  /** Poids réel de l'état sérialisé, en octets UTF-8. */
  bytes: number;
}

/**
 * Tout ce qu'une sauvegarde conserve : l'état sérialisé, la mise en place, le
 * journal des commandes (rejouabilité déterministe), le hash, les
 * horodatages, le nom d'emplacement, la vignette et le drapeau d'automatisme.
 */
export interface StoredSave extends SaveMeta {
  setup: GameSetup;
  /** État produit par `serializeState`. */
  state: string;
  /** Journal append-only des commandes appliquées depuis le début. */
  commands: Command[];
}

/** Enregistrement de replay : de quoi rejouer une partie de bout en bout. */
export interface StoredReplay {
  id: string;
  saveId: string | null;
  setup: GameSetup;
  commands: Command[];
  finalHash: string;
  createdAt: string;
}

/** Consommation d'une identité. */
export interface StorageUsage {
  /** Octets cumulés de toutes les sauvegardes. */
  bytes: number;
  /** Emplacements manuels occupés. */
  manuels: number;
  /** Emplacements automatiques occupés. */
  automatiques: number;
}

/**
 * Interface de stockage. Les implémentations ne valident rien : la validation
 * Zod et la politique d'emplacements sont appliquées en amont, dans les
 * routes, à partir des aides publiées plus bas.
 */
export interface Storage extends PartyStore {
  readonly kind: StorageKind;
  /** Libellé français affiché dans le diagnostic. */
  readonly label: string;

  /** Prépare le stockage (migrations idempotentes, création des dossiers). */
  init(): Promise<void>;

  /** Descripteurs d'emplacements, du plus récent au plus ancien. */
  listSaves(identity: string): Promise<SaveSlot[]>;
  /** Descripteurs enrichis (versions, poids) — usage interne du serveur. */
  listMeta(identity: string): Promise<SaveMeta[]>;
  getSave(identity: string, id: string): Promise<StoredSave | null>;
  putSave(identity: string, save: StoredSave): Promise<void>;
  deleteSave(identity: string, id: string): Promise<boolean>;
  renameSave(identity: string, id: string, name: string): Promise<SaveSlot | null>;

  getProfile(identity: string): Promise<Profile | null>;
  putProfile(identity: string, profile: Profile): Promise<Profile>;

  /** Enregistre un replay déterministe. */
  putReplay(identity: string, replay: StoredReplay): Promise<void>;
  listReplays(identity: string): Promise<StoredReplay[]>;

  /** Compteurs globaux, pour la page de diagnostic. */
  stats(): Promise<{ identites: number; sauvegardes: number }>;

  close(): Promise<void>;
}

/** Consommation d'une identité, dérivée des descripteurs enrichis. */
export function usageOf(metas: readonly SaveMeta[]): StorageUsage {
  let bytes = 0;
  let manuels = 0;
  let automatiques = 0;
  for (const m of metas) {
    bytes += m.bytes;
    if (m.slot.autosave) automatiques++;
    else manuels++;
  }
  return { bytes, manuels, automatiques };
}

/* ── Politique d'emplacements ───────────────────────────────────────────── */

/** Décision prise avant l'écriture d'une sauvegarde. */
export type SlotPlan =
  | { ok: true; remplace: boolean; evince: string | null }
  | {
      ok: false;
      code: 'emplacements_pleins' | 'quota_depasse' | 'charge_trop_lourde';
      message: string;
    };

/**
 * Applique la règle « 12 emplacements manuels + 3 automatiques rotatifs »,
 * puis les quotas.
 *
 * - écrire sur un emplacement existant est toujours permis (mise à jour) ;
 * - un nouvel emplacement manuel est refusé lorsque les douze sont occupés ;
 * - un nouvel emplacement automatique évince le plus ancien des trois.
 */
export function planSlotWrite(
  existants: readonly SaveMeta[],
  id: string,
  autosave: boolean,
  bytes: number,
): SlotPlan {
  if (bytes > MAX_SAVE_BYTES) {
    return {
      ok: false,
      code: 'charge_trop_lourde',
      message: `La sauvegarde pèse ${formatOctets(bytes)} : la limite est de ${formatOctets(
        MAX_SAVE_BYTES,
      )} par emplacement.`,
    };
  }

  const actuel = existants.find((m) => m.slot.id === id) ?? null;

  if (actuel !== null) {
    const apres = totalBytes(existants) - actuel.bytes + bytes;
    if (apres > MAX_IDENTITY_BYTES) return quotaRefus(apres);
    return { ok: true, remplace: true, evince: null };
  }

  let evince: string | null = null;
  if (autosave) {
    const autos = existants
      .filter((m) => m.slot.autosave)
      .sort((a, b) => a.slot.updatedAt.localeCompare(b.slot.updatedAt));
    if (autos.length >= AUTOSAVE_SLOTS) evince = autos[0].slot.id;
  } else {
    const manuels = existants.filter((m) => !m.slot.autosave).length;
    if (manuels >= MANUAL_SLOTS) {
      return {
        ok: false,
        code: 'emplacements_pleins',
        message: `Les ${MANUAL_SLOTS} emplacements manuels sont occupés. Supprimez-en un, ou écrasez un emplacement existant, avant d'enregistrer une nouvelle partie.`,
      };
    }
  }

  const libere =
    evince !== null ? (existants.find((m) => m.slot.id === evince)?.bytes ?? 0) : 0;
  const apres = totalBytes(existants) - libere + bytes;
  if (apres > MAX_IDENTITY_BYTES) return quotaRefus(apres);
  return { ok: true, remplace: false, evince };
}

function totalBytes(metas: readonly SaveMeta[]): number {
  let total = 0;
  for (const m of metas) total += m.bytes;
  return total;
}

function quotaRefus(apres: number): SlotPlan {
  return {
    ok: false,
    code: 'quota_depasse',
    message: `Cette sauvegarde porterait le total à ${formatOctets(
      apres,
    )}, au-delà des ${formatOctets(MAX_IDENTITY_BYTES)} autorisés pour une identité. Supprimez d'anciennes parties.`,
  };
}

/** Met en forme un nombre d'octets en français (Mo, Ko). */
export function formatOctets(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    const mo = Math.round((bytes / (1024 * 1024)) * 10) / 10;
    return `${mo.toLocaleString('fr-FR')} Mo`;
  }
  if (bytes >= 1024) return `${Math.round(bytes / 1024).toLocaleString('fr-FR')} Ko`;
  return `${bytes} octets`;
}

/**
 * Tri d'affichage : les emplacements manuels d'abord, puis les sauvegardes
 * automatiques ; à l'intérieur de chaque groupe, du plus récent au plus ancien.
 */
export function sortSlots<T extends { slot: SaveSlot } | SaveSlot>(items: T[]): T[] {
  const slotOf = (v: T): SaveSlot => ('slot' in v ? v.slot : (v as SaveSlot));
  return items.sort((a, b) => {
    const sa = slotOf(a);
    const sb = slotOf(b);
    if (sa.autosave !== sb.autosave) return sa.autosave ? 1 : -1;
    return sb.updatedAt.localeCompare(sa.updatedAt);
  });
}

/* ── Sélection automatique ──────────────────────────────────────────────── */

export interface StorageSelection {
  storage: Storage;
  /** Journal des tentatives, en français, sans aucun secret. */
  notes: string[];
}

export interface StorageOptions {
  databaseUrl: string | null;
  dataDir: string;
  /** Impose le stockage mémoire (tests, disque en lecture seule connu). */
  forceMemory?: boolean;
}

/**
 * Choisit et prépare le stockage. Ne lève jamais : en dernier recours, le
 * stockage mémoire garantit que `/health` répond et que le jeu reste jouable.
 */
export async function createStorage(options: StorageOptions): Promise<StorageSelection> {
  const notes: string[] = [];

  if (options.forceMemory === true) {
    const { MemoryStorage } = await import('./memory.js');
    const storage = new MemoryStorage('Stockage en mémoire (imposé par la configuration)');
    await storage.init();
    notes.push('Stockage mémoire imposé par la configuration.');
    return { storage, notes };
  }

  if (options.databaseUrl !== null) {
    try {
      const { PostgresStorage } = await import('./postgres.js');
      const storage = new PostgresStorage(options.databaseUrl);
      await storage.init();
      notes.push('PostgreSQL connecté, migrations appliquées.');
      return { storage, notes };
    } catch (err) {
      notes.push(`PostgreSQL indisponible : ${describe(err)}. Repli sur le stockage fichier.`);
    }
  } else {
    notes.push('Aucune base de données configurée : stockage fichier.');
  }

  try {
    const { FileStorage } = await import('./file.js');
    const storage = new FileStorage(options.dataDir);
    await storage.init();
    notes.push(`Stockage fichier prêt dans « ${options.dataDir} ».`);
    return { storage, notes };
  } catch (err) {
    notes.push(`Stockage fichier impossible : ${describe(err)}. Repli sur la mémoire.`);
  }

  const { MemoryStorage } = await import('./memory.js');
  const storage = new MemoryStorage(
    'Stockage en mémoire — les sauvegardes seront perdues au redémarrage',
  );
  await storage.init();
  return { storage, notes };
}

/**
 * Décrit une erreur sans divulguer de secret : les chaînes de connexion sont
 * souvent recopiées dans les messages du pilote PostgreSQL.
 */
export function describe(err: unknown): string {
  const brut = err instanceof Error ? err.message : String(err);
  return scrubSecrets(brut).slice(0, 200);
}

/**
 * Retire d'un texte tout ce qui ressemble à une URL de connexion ou à un
 * identifiant. Appliqué à chaque message d'erreur avant journalisation.
 */
export function scrubSecrets(text: string): string {
  return text
    .replace(/[a-z+]+:\/\/[^\s'"]*@[^\s'"]*/gi, '«connexion masquée»')
    .replace(
      /\b(password|mot_de_passe|secret|token|apikey|api_key)\b\s*[:=]\s*\S+/gi,
      '$1=«masqué»',
    );
}
