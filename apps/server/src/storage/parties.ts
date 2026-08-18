/**
 * Modèle de données des parties en ligne asynchrones.
 *
 * Traduction directe du tableau de `docs/04-MULTIJOUEUR.md` §3 :
 *
 * ```
 * parties            id, code, hote, setup, statut, seq, active_player,
 *                    engine_version, content_version, map_version,
 *                    cree_le, maj_le, terminee_le, gagnant
 * partie_joueurs     partie_id, slot (P1..P5), jeton (secret), nom, faction,
 *                    heros, depart, avatar, kind (humain|ia), profil_ia,
 *                    pret, dernier_vu_le
 * partie_etats       partie_id, seq, etat (jsonb compressé), hash
 * partie_commandes   partie_id, seq, joueur, commande (jsonb), cle_idempotence,
 *                    applique_le
 * ```
 *
 * Les trois dos-offices (mémoire, fichier, PostgreSQL) manipulent le même
 * agrégat `StoredParty` : une partie tient dans un seul objet, ce qui rend la
 * lecture-modification-écriture atomique côté fichier (`rename`) et
 * transactionnelle côté SQL (une ligne par instantané, un `UPDATE` par
 * en-tête). Le sérialiseur d'état étant textuel, `etat` est du `text` et jamais
 * du `jsonb` : le hash doit rester vérifiable octet pour octet.
 *
 * **Le jeton d'un joueur ne sort jamais d'ici** autrement que dans la réponse
 * qui le crée. Les projections publiques (`salonPublic`) l'omettent.
 */
import type { Command, FactionId, PlayerId, StartKey } from '@auvergne/engine';
import type { SaveVersions } from './index.js';

/** Statut d'une partie en ligne. */
export type PartyStatus = 'salon' | 'en_cours' | 'terminee';

/** Nature d'une bannière : libre, tenue par un cousin, ou confiée à l'IA. */
export type SeatKind = 'libre' | 'humain' | 'ia';

export type AiProfile = 'prudent' | 'equilibre' | 'agressif' | 'expert';

/** Réglages figés à la création, avant que quiconque ait rejoint. */
export interface PartySetup {
  bannieres: number;
  duree: 'eclair' | 'standard' | 'saga';
  victoire: 'couronne' | 'derniere_banniere' | 'maitre_marches' | 'chronique';
  graine: number;
}

/** Une bannière du salon. `jeton` est un secret : il ne se recopie jamais. */
export interface StoredSeat {
  slot: PlayerId;
  /** Secret de 32 caractères hexadécimaux, ou `null` pour une place libre. */
  jeton: string | null;
  /** Identité anonyme du navigateur qui tient cette bannière. */
  identite: string | null;
  nom: string | null;
  faction: FactionId | null;
  heros: string | null;
  /** Portrait du héros de départ : c'est l'avatar du joueur. */
  avatar: string | null;
  depart: StartKey | null;
  kind: SeatKind;
  profilIa: AiProfile | null;
  pret: boolean;
  dernierVuLe: string | null;
}

/** Une entrée du journal `partie_commandes`. */
export interface StoredPartyCommand {
  seq: number;
  joueur: PlayerId;
  commande: Command;
  cleIdempotence: string;
  appliqueLe: string;
  /** Verdict du moteur, conservé pour répondre à un rejeu à l'identique. */
  ok: boolean;
  erreur: string | null;
  /** Journal français produit par cette commande, pour le rejeu. */
  journal: string[];
  /** Bannières d'IA jouées dans la foulée. */
  toursIa: PlayerId[];
}

/** Un instantané de `partie_etats`. */
export interface StoredPartySnapshot {
  seq: number;
  /** Chaîne produite par `serializeState`. */
  etat: string;
  hash: string;
  creeLe: string;
}

/** L'agrégat complet d'une partie en ligne. */
export interface StoredParty {
  code: string;
  /** Identité anonyme de l'hôte. */
  hote: string;
  /** Secret d'hôte, remis une seule fois à la création. */
  jetonHote: string;
  setup: PartySetup;
  statut: PartyStatus;
  /** Incrémenté à chaque mutation acceptée. Ne recule jamais. */
  seq: number;
  activePlayer: PlayerId | null;
  versions: SaveVersions;
  joueurs: StoredSeat[];
  /** État courant, `null` tant que le salon n'a pas été levé. */
  etat: string | null;
  hash: string | null;
  /** Instantanés de reprise : fin de tour, et toutes les vingt commandes. */
  instantanes: StoredPartySnapshot[];
  /** Journal intégral, borné par `MAX_PARTY_COMMANDS`. */
  commandes: StoredPartyCommand[];
  creeLe: string;
  majLe: string;
  termineeLe: string | null;
  gagnant: PlayerId | null;
}

/** Contrat de stockage des parties en ligne, greffé sur `Storage`. */
export interface PartyStore {
  /** Écrit une partie neuve. Échoue si le code est déjà pris. */
  createParty(party: StoredParty): Promise<void>;
  getParty(code: string): Promise<StoredParty | null>;
  /** Remplace intégralement une partie existante. */
  putParty(party: StoredParty): Promise<void>;
  /** Les parties où cette identité tient au moins une bannière, ou est hôte. */
  listPartiesOf(identity: string): Promise<StoredParty[]>;
  /** Compteur global, pour la page de diagnostic. */
  countParties(): Promise<number>;
}

/* ── Aides communes aux trois dos-offices ───────────────────────────────── */

/** Bannières d'une partie, du plus récent au plus ancien. */
export function sortParties(parties: StoredParty[]): StoredParty[] {
  return parties.sort((a, b) => b.majLe.localeCompare(a.majLe));
}

/**
 * Les cinq identifiants de bannière, dans l'ordre imposé par le moteur.
 * Le salon en crée autant que `setup.bannieres`.
 */
export const SEAT_IDS: readonly PlayerId[] = ['P1', 'P2', 'P3', 'P4', 'P5'];

/** Bannière libre, telle qu'on la crée au moment de fabriquer le salon. */
export function emptySeat(slot: PlayerId): StoredSeat {
  return {
    slot,
    jeton: null,
    identite: null,
    nom: null,
    faction: null,
    heros: null,
    avatar: null,
    depart: null,
    kind: 'libre',
    profilIa: null,
    pret: false,
    dernierVuLe: null,
  };
}

/** Retrouve la bannière d'un jeton. Comparaison insensible à la casse. */
export function seatOfToken(party: StoredParty, jeton: string | null): StoredSeat | null {
  if (jeton === null || jeton.length === 0) return null;
  const cible = jeton.toLowerCase();
  return party.joueurs.find((s) => s.jeton !== null && s.jeton === cible) ?? null;
}

/** Retrouve la bannière d'une identité anonyme. */
export function seatOfIdentity(party: StoredParty, identity: string): StoredSeat | null {
  if (identity.length === 0) return null;
  return party.joueurs.find((s) => s.identite === identity && s.kind === 'humain') ?? null;
}

/**
 * Nombre d'instantanés conservés. Un par fin de tour et un toutes les vingt
 * commandes suffisent à rejouer sans conserver des centaines de méga-octets.
 */
export const MAX_SNAPSHOTS = 24;

/** Une commande sur vingt déclenche un instantané intermédiaire. */
export const SNAPSHOT_EVERY = 20;
