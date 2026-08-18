/**
 * Parties en ligne asynchrones — contrat réseau.
 *
 * Spécification : `docs/04-MULTIJOUEUR.md`. Cinq cousins, chacun chez soi, une
 * partie qui dure des semaines. Aucun compte, aucun mot de passe : un seul lien
 * partagé, et un **jeton de joueur** que le navigateur mémorise.
 *
 * Ce module ne contient que des routes, des schémas Zod et des types de
 * réponse. Aucune règle de jeu, aucune dépendance à Node ni au DOM : le client
 * et le serveur l'importent tous les deux.
 *
 * Trois invariants portés par les schémas :
 *
 *  1. **Le code de partie est court et lisible à voix haute** — `FOREZ-7K2P`.
 *     L'alphabet exclut `O`, `0`, `I` et `1`, qu'on confond au téléphone.
 *  2. **Toute commande porte une clef d'idempotence.** Une reconnexion mobile
 *     rejoue l'envoi ; le serveur doit renvoyer le résultat déjà calculé au
 *     lieu d'appliquer deux fois l'action.
 *  3. **Toute commande annonce la séquence attendue.** Un client en retard
 *     reçoit `409` avec l'état à jour plutôt que d'écraser le monde.
 */
import { z } from 'zod';
import {
  AiProfileSchema,
  CommandSchema,
  ContentIdSchema,
  DurationSchema,
  FactionIdSchema,
  IntSchema,
  PlayerIdSchema,
  StartKeySchema,
  TimestampSchema,
  VictorySchema,
} from './schemas.js';

/* ── Constantes ─────────────────────────────────────────────────────────── */

/** En-tête portant le jeton secret d'un joueur. */
export const PLAYER_TOKEN_HEADER = 'x-jeton-joueur';

/** Alphabet du suffixe d'un code de partie : ni `O`, ni `0`, ni `I`, ni `1`. */
export const PARTY_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Préfixes de code : des noms du Forez, faciles à dicter. */
export const PARTY_CODE_PREFIXES: readonly string[] = [
  'FOREZ',
  'GRANIT',
  'DUROLLE',
  'SAGNES',
  'PAMOLE',
  'ARCONSAT',
  'CERVIERES',
  'RENAUDIE',
  'HERMITAGE',
  'VOLLORE',
];

/** Bannières minimales et maximales d'une partie en ligne. */
export const MIN_PARTY_SEATS = 2;
export const MAX_PARTY_SEATS = 5;

/** Longueur exacte d'un jeton de joueur (hexadécimal). */
export const PARTY_TOKEN_CHARS = 32;

/** Journal de commandes conservé par partie en ligne. */
export const MAX_PARTY_COMMANDS = 20_000;

/**
 * Rythmes d'interrogation, en millisecondes (`docs/04-MULTIJOUEUR.md` §2).
 * Le client n'invente aucune de ces valeurs : il les lit ici.
 */
export const POLL_INTERVALS = {
  /** Onglet actif, ce n'est pas mon tour. */
  actif: 5_000,
  /** Onglet en arrière-plan. */
  arrierePlan: 60_000,
  /** Après dix minutes sans le moindre geste. */
  assoupi: 300_000,
  /** Délai au bout duquel on considère le joueur assoupi. */
  inactiviteMs: 600_000,
} as const;

/* ── Routes ─────────────────────────────────────────────────────────────── */

/**
 * Adresses des parties en ligne. `mes-parties` est une route **statique** :
 * Fastify la fait passer avant `/api/parties/:code`, et aucun code valide ne
 * peut valoir `mes-parties` (les codes sont en majuscules).
 */
export const PARTIES_API = {
  /** `POST` crée une partie. */
  racine: '/api/parties',
  /** Les parties où ce navigateur possède un jeton. */
  mesParties: '/api/parties/mes-parties',
  /** Salon ou état public d'une partie. */
  partie: (code: string): string => `/api/parties/${encodeURIComponent(code)}`,
  rejoindre: (code: string): string => `/api/parties/${encodeURIComponent(code)}/rejoindre`,
  modifier: (code: string): string => `/api/parties/${encodeURIComponent(code)}/modifier`,
  ia: (code: string): string => `/api/parties/${encodeURIComponent(code)}/ia`,
  lancer: (code: string): string => `/api/parties/${encodeURIComponent(code)}/lancer`,
  etat: (code: string): string => `/api/parties/${encodeURIComponent(code)}/etat`,
  pouls: (code: string): string => `/api/parties/${encodeURIComponent(code)}/pouls`,
  commande: (code: string): string => `/api/parties/${encodeURIComponent(code)}/commande`,
  abandonner: (code: string): string => `/api/parties/${encodeURIComponent(code)}/abandonner`,
} as const;

/** Lien à partager pour rejoindre une partie. */
export function partyLink(origin: string, code: string): string {
  const base = origin.replace(/\/+$/, '');
  return `${base}/#/en-ligne/${encodeURIComponent(code)}`;
}

/* ── Primitives ─────────────────────────────────────────────────────────── */

/** Code de partie : `PREFIXE-XXXX`, majuscules, sans caractère ambigu. */
export const PartyCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z]{4,10}-[A-HJ-NP-Z2-9]{4}$/,
    'Code de partie invalide. Il ressemble à « FOREZ-7K2P ».',
  );

/** Jeton secret d'un joueur : 32 caractères hexadécimaux. */
export const PartyTokenSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{32}$/, 'Jeton de joueur invalide.');

/** Nom choisi par un cousin pour sa bannière. */
export const SeatNameSchema = z
  .string()
  .trim()
  .min(1, 'Il faut un nom pour cette bannière.')
  .max(28, 'Le nom est trop long (28 caractères au maximum).');

/** Clef d'idempotence d'une commande. */
export const IdempotencyKeySchema = z
  .string()
  .min(8, "Clef d'idempotence trop courte.")
  .max(64, "Clef d'idempotence trop longue.")
  .regex(/^[A-Za-z0-9_-]+$/, "Clef d'idempotence invalide.");

/** Numéro de séquence : il ne recule jamais. */
export const SeqSchema = IntSchema.min(0, 'Numéro de séquence invalide.');

/* ── Corps de requête ───────────────────────────────────────────────────── */

/** `POST /api/parties`. */
export const CreatePartySchema = z
  .object({
    bannieres: IntSchema.min(MIN_PARTY_SEATS, 'Il faut au moins deux bannières.').max(
      MAX_PARTY_SEATS,
      'Cinq bannières au maximum.',
    ),
    duree: DurationSchema,
    victoire: VictorySchema,
    graine: IntSchema.min(0, 'La graine doit être un entier positif.')
      .max(1_000_000_000, 'Graine trop grande.')
      .optional(),
  })
  .strict();

export type CreatePartyRequest = z.infer<typeof CreatePartySchema>;

/** `POST /api/parties/:code/rejoindre`. */
export const JoinPartySchema = z
  .object({
    slot: PlayerIdSchema,
    nom: SeatNameSchema,
    faction: FactionIdSchema,
    heros: ContentIdSchema,
    depart: StartKeySchema,
  })
  .strict();

export type JoinPartyRequest = z.infer<typeof JoinPartySchema>;

/** `POST /api/parties/:code/modifier` — avant le lancement seulement. */
export const ModifyPartySchema = z
  .object({
    nom: SeatNameSchema.optional(),
    faction: FactionIdSchema.optional(),
    heros: ContentIdSchema.optional(),
    depart: StartKeySchema.optional(),
    pret: z.boolean().optional(),
  })
  .strict();

export type ModifyPartyRequest = z.infer<typeof ModifyPartySchema>;

/** `POST /api/parties/:code/ia` — l'hôte remplit ou vide une bannière libre. */
export const PartySeatAiSchema = z
  .object({
    slot: PlayerIdSchema,
    action: z.enum(['confier', 'retirer'], {
      errorMap: () => ({ message: 'Action inconnue : « confier » ou « retirer ».' }),
    }),
    profil: AiProfileSchema.optional(),
  })
  .strict();

export type PartySeatAiRequest = z.infer<typeof PartySeatAiSchema>;

/** `POST /api/parties/:code/commande`. */
export const PartyCommandSchema = z
  .object({
    commande: CommandSchema,
    cleIdempotence: IdempotencyKeySchema,
    seqAttendu: SeqSchema,
  })
  .strict();

export type PartyCommandRequest = z.infer<typeof PartyCommandSchema>;

/** Paramètre de route `:code`. */
export const PartyParamsSchema = z.object({ code: PartyCodeSchema }).strict();

/** `GET /api/parties/:code/etat?depuis=12`. */
export const PartyStateQuerySchema = z
  .object({
    depuis: z.string().regex(/^\d{1,9}$/, 'Paramètre « depuis » invalide.').optional(),
  })
  .strict();

/* ── Réponses ───────────────────────────────────────────────────────────── */

/** Occupation d'une bannière, telle qu'elle est **publique** dans le salon. */
export interface PartySeatPublic {
  slot: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  /** Couleur imposée par la bannière, pour l'affichage. */
  couleur: string;
  kind: 'libre' | 'humain' | 'ia';
  nom: string | null;
  faction: 'granit' | 'ermitage' | null;
  heros: string | null;
  /** Identifiant de héros servant d'avatar. Égal à `heros`. */
  avatar: string | null;
  depart: string | null;
  profilIa: 'prudent' | 'equilibre' | 'agressif' | 'expert' | null;
  pret: boolean;
  /** Vrai si c'est la bannière du navigateur qui interroge. */
  moi: boolean;
  /** Dernière présence constatée, ou `null`. */
  dernierVuLe: string | null;
}

/** Corps de `GET /api/parties/:code` — le salon, ou l'en-tête d'une partie. */
export interface PartySalonPayload {
  code: string;
  lien: string;
  statut: 'salon' | 'en_cours' | 'terminee';
  seq: number;
  activePlayer: string | null;
  bannieres: number;
  duree: 'eclair' | 'standard' | 'saga';
  victoire: 'couronne' | 'derniere_banniere' | 'maitre_marches' | 'chronique';
  graine: number;
  joueurs: PartySeatPublic[];
  /** Vrai si le navigateur qui interroge est l'hôte. */
  hote: boolean;
  /** Bannière du navigateur qui interroge, ou `null`. */
  monSlot: string | null;
  creeLe: string;
  majLe: string;
  gagnant: string | null;
  /** Ce qui empêcherait un lancement immédiat. Vide si tout va bien. */
  obstacles: string[];
  versions: { moteur: string; contenu: string; carte: string };
}

/** Corps de `POST /api/parties` — ce que l'hôte doit conserver. */
export interface PartyCreatedPayload {
  code: string;
  lien: string;
  jeton: string;
  salon: PartySalonPayload;
}

/** Corps de `POST /api/parties/:code/rejoindre`. */
export interface PartyJoinedPayload {
  jeton: string;
  slot: string;
  salon: PartySalonPayload;
}

/** Corps de `GET /api/parties/:code/pouls` — quelques dizaines d'octets. */
export interface PartyPulsePayload {
  seq: number;
  activePlayer: string | null;
  updatedAt: string;
}

/** Corps de `GET /api/parties/:code/etat`. */
export interface PartyStatePayload {
  code: string;
  seq: number;
  statut: 'salon' | 'en_cours' | 'terminee';
  activePlayer: string | null;
  /** Ma bannière. `null` si j'observe sans jeton valide. */
  monSlot: string | null;
  /** Vrai si c'est à moi de jouer. */
  monTour: boolean;
  setup: unknown;
  /**
   * État sérialisé par `serializeState`, **expurgé** : le brouillard des
   * autres bannières est remis à zéro. L'empreinte interne reste celle de
   * l'état autoritaire du serveur : ne la vérifiez pas côté client.
   */
  etat: string;
  /** Empreinte de l'état autoritaire, avant expurgation. */
  hash: string;
  /** Vrai si du brouillard a été masqué (toujours vrai hors solo). */
  brouillardMasque: boolean;
  joueurs: PartySeatPublic[];
  updatedAt: string;
  gagnant: string | null;
}

/** Corps de `POST /api/parties/:code/commande`, en cas de succès. */
export interface PartyCommandPayload {
  ok: boolean;
  /** Vrai si cette clef d'idempotence avait déjà été appliquée. */
  rejeu: boolean;
  seq: number;
  activePlayer: string | null;
  monTour: boolean;
  /** Journal français des événements produits, prêt à afficher. */
  journal: string[];
  /** Bannières jouées par le serveur juste après (les IA). */
  toursIa: string[];
  etat: PartyStatePayload;
}

/** Une ligne de `GET /api/parties/mes-parties`. */
export interface MyPartyEntry {
  code: string;
  lien: string;
  statut: 'salon' | 'en_cours' | 'terminee';
  monSlot: string;
  monNom: string;
  avatar: string | null;
  activePlayer: string | null;
  /** Vrai si c'est mon tour : le bandeau d'accueil s'allume. */
  monTour: boolean;
  /** Nom de la bannière qu'on attend, pour « En attente de Jean ». */
  attendu: string | null;
  seq: number;
  joueurs: number;
  majLe: string;
  hote: boolean;
}

/** Corps de `GET /api/parties/mes-parties`. */
export interface MyPartiesPayload {
  parties: MyPartyEntry[];
  /** Combien de parties attendent mon coup. */
  monTour: number;
  /** Bandeau prêt à afficher, ou `null`. */
  bandeau: string | null;
}

/* ── Textes partagés ────────────────────────────────────────────────────── */

/** Titre d'onglet quand c'est au joueur de jouer (`docs/04-MULTIJOUEUR.md` §6). */
export const TITRE_MON_TOUR = '▸ À toi de jouer — Auvergne';

/** Bandeau d'accueil, accordé en nombre. */
export function bandeauMonTour(parties: number): string | null {
  if (parties <= 0) return null;
  if (parties === 1) return "C'est ton tour dans une partie.";
  return `C'est ton tour dans ${String(parties)} parties.`;
}

/** « En attente de Jean », ou l'attente générique si le nom manque. */
export function libelleAttente(nom: string | null): string {
  return nom === null || nom.length === 0 ? "En attente d'une autre bannière" : `En attente de ${nom}`;
}

/* ── Validation d'un timestamp de service ───────────────────────────────── */

/** Réexport pratique : les charges utiles ci-dessus portent des ISO 8601 UTC. */
export const PartyTimestampSchema = TimestampSchema;
