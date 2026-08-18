/**
 * Accès réseau aux parties en ligne asynchrones.
 *
 * Toute la couche HTTP du multijoueur tient ici : rien d'autre dans le client
 * ne connaît les adresses ni le format des erreurs. Tout le contrat — routes,
 * en-tête du jeton, formes de réponse — vient de `@auvergne/protocol`
 * (`packages/protocol/src/parties.ts`) ; aucune constante n'est réécrite.
 *
 * **Le jeton ne se perd pas, et ne s'échappe pas.** Le serveur ne connaît ni
 * compte ni mot de passe : le navigateur mémorise un jeton par partie, dans
 * **une seule clef** de `localStorage` portant un objet `code → jeton`. Le
 * cookie d'identité anonyme sert de seconde chance lorsque le stockage local a
 * été vidé — le serveur accepte les deux. Un jeton ne part jamais autrement
 * que dans l'en-tête `PLAYER_TOKEN_HEADER` : jamais dans une URL, jamais dans
 * un message d'erreur, jamais dans la console.
 *
 * **Une erreur se lit en français.** Le serveur renvoie `{ erreur, code }` ;
 * `ErreurPartie` porte les deux, plus les détails, pour que l'appelant puisse
 * brancher un comportement sur `code` tout en affichant `message` tel quel.
 *
 * **Un 409 de séquence n'est pas une panne.** C'est le cas nominal d'un client
 * en retard : il devient une `ErreurConflit`, qui porte l'état à jour joint par
 * le serveur. L'écran recharge et le geste du joueur reste rejouable, avec la
 * même clef d'idempotence.
 *
 * **Une coupure réseau n'est pas un refus.** `fetch` qui échoue devient une
 * `ErreurReseau` : c'est la seule erreur qu'il faille réessayer.
 */
import {
  PARTIES_API,
  PLAYER_TOKEN_HEADER,
  PartyCodeSchema,
  partyLink,
  type CreatePartyRequest,
  type JoinPartyRequest,
  type ModifyPartyRequest,
  type MyPartiesPayload,
  type PartyCommandPayload,
  type PartyCreatedPayload,
  type PartyJoinedPayload,
  type PartyPulsePayload,
  type PartySalonPayload,
  type PartySeatAiRequest,
  type PartyStatePayload,
} from '@auvergne/protocol';
import type { Command } from '@auvergne/engine';

/* ── Erreurs ────────────────────────────────────────────────────────────── */

/** Refus du serveur, avec son code stable et son message français. */
export class ErreurPartie extends Error {
  readonly code: string;
  readonly statut: number;
  readonly details: Record<string, unknown>;

  constructor(message: string, code: string, statut: number, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ErreurPartie';
    this.code = code;
    this.statut = statut;
    this.details = details;
  }
}

/**
 * `409` : le client était en retard d'une ou plusieurs séquences. Le serveur
 * joint l'état à jour ; le geste du joueur n'est pas perdu, il est rejouable
 * avec **la même clef d'idempotence** une fois l'état rechargé.
 */
export class ErreurConflit extends ErreurPartie {
  readonly etat: PartyStatePayload | null;

  constructor(message: string, code: string, etat: PartyStatePayload | null, details: Record<string, unknown> = {}) {
    super(message, code, 409, details);
    this.name = 'ErreurConflit';
    this.etat = etat;
  }
}

/**
 * Le serveur n'a pas répondu du tout : tunnel, ascenseur, avion, redémarrage.
 * C'est la seule erreur qu'il faille réessayer, et il faut la réessayer avec
 * la même clef d'idempotence.
 */
export class ErreurReseau extends Error {
  constructor(message = 'Le serveur des parties est injoignable.') {
    super(message);
    this.name = 'ErreurReseau';
  }
}

/** Vrai si l'échec est une simple désynchronisation, pas une panne. */
export function estEnRetard(err: unknown): boolean {
  if (err instanceof ErreurConflit) return true;
  return err instanceof ErreurPartie && err.code === 'sequence_perimee';
}

/** Vrai si l'échec mérite une nouvelle tentative : réseau, 429, 5xx. */
export function estTemporaire(err: unknown): boolean {
  if (err instanceof ErreurReseau) return true;
  if (err instanceof ErreurConflit) return false;
  if (err instanceof ErreurPartie) return err.statut === 429 || err.statut >= 500;
  return false;
}

/* ── Jetons mémorisés par le navigateur ─────────────────────────────────── */

/**
 * L'unique clef de `localStorage`. Elle porte un objet `code → jeton` : cinq
 * cousins, cinq parties, une seule ligne, lisible et effaçable d'un geste.
 */
export const CLEF_JETONS = 'auvergne.parties.jetons.v1';

type Trousseau = Record<string, string>;

function stockage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    /* Navigation privée stricte : on continue sans mémoire locale. */
    return null;
  }
}

/** Code normalisé : majuscules, sans espaces autour. Ne valide pas la forme. */
export function normaliserCode(code: string): string {
  return code.trim().toUpperCase();
}

/** Vrai si le code a la forme d'un code de partie (`FOREZ-7K2P`). */
export function codeValide(code: string): boolean {
  return PartyCodeSchema.safeParse(code).success;
}

/** Le trousseau complet. Jamais journalisé, jamais affiché. */
export function lireJetons(): Trousseau {
  const memoire = stockage();
  if (memoire === null) return {};
  try {
    const brut = memoire.getItem(CLEF_JETONS);
    if (brut === null || brut.length === 0) return {};
    const analyse: unknown = JSON.parse(brut);
    if (typeof analyse !== 'object' || analyse === null || Array.isArray(analyse)) return {};
    const out: Trousseau = {};
    for (const [code, jeton] of Object.entries(analyse as Record<string, unknown>)) {
      if (typeof jeton === 'string' && jeton.length > 0) out[normaliserCode(code)] = jeton;
    }
    return out;
  } catch {
    /* Trousseau abîmé : on repart d'un trousseau vide plutôt que de planter. */
    return {};
  }
}

function ecrireJetons(trousseau: Trousseau): void {
  const memoire = stockage();
  if (memoire === null) return;
  try {
    memoire.setItem(CLEF_JETONS, JSON.stringify(trousseau));
  } catch {
    /* Quota plein : le cookie d'identité prend le relais. */
  }
}

/** Jeton conservé pour cette partie, ou `null`. */
export function jetonDe(code: string): string | null {
  return lireJetons()[normaliserCode(code)] ?? null;
}

/**
 * Mémorise le jeton d'une partie. C'est la seule « identité » du joueur.
 * Le code réécrit passe en dernière position : c'est la partie la plus
 * récemment ouverte, celle que `dernierePartie()` renvoie.
 */
export function retenirJeton(code: string, jeton: string): void {
  const clef = normaliserCode(code);
  const trousseau = lireJetons();
  delete trousseau[clef];
  trousseau[clef] = jeton;
  ecrireJetons(trousseau);
}

/** Synonyme explicite de `retenirJeton`. */
export const memoriserJeton = retenirJeton;

/** Oublie le jeton d'une partie (abandon, ou partie purgée). */
export function oublierJeton(code: string): void {
  const clef = normaliserCode(code);
  const trousseau = lireJetons();
  if (!(clef in trousseau)) return;
  delete trousseau[clef];
  ecrireJetons(trousseau);
}

/** Les codes dont ce navigateur possède un jeton, du plus ancien au plus récent. */
export function codesConnus(): string[] {
  return Object.keys(lireJetons());
}

/** Vrai si ce navigateur tient une bannière quelque part. */
export function aDesParties(): boolean {
  return codesConnus().length > 0;
}

/** Dernière partie en ligne ouverte sur ce navigateur. */
export function dernierePartie(): string | null {
  const codes = codesConnus();
  return codes.length === 0 ? null : (codes[codes.length - 1] ?? null);
}

/* ── Transport ──────────────────────────────────────────────────────────── */

/** Signature du transport HTTP. Remplaçable en test, jamais en production. */
export type Transport = (url: string, init: RequestInit) => Promise<Response>;

let transport: Transport = (url, init) => fetch(url, init);

/** Remplace le transport HTTP. Réservé aux tests ; `null` rétablit `fetch`. */
export function installerTransport(suivant: Transport | null): void {
  transport = suivant ?? ((url, init) => fetch(url, init));
}

interface Options {
  methode?: 'GET' | 'POST';
  corps?: unknown;
  code?: string;
  /** joindre ce jeton précis, sans passer par le trousseau */
  jeton?: string | null;
  signal?: AbortSignal;
}

async function appel<T>(url: string, options: Options = {}): Promise<T> {
  const entetes: Record<string, string> = { accept: 'application/json' };
  if (options.corps !== undefined) entetes['content-type'] = 'application/json';
  const secret = options.jeton ?? (options.code === undefined ? null : jetonDe(options.code));
  if (secret !== null && secret.length > 0) entetes[PLAYER_TOKEN_HEADER] = secret;

  let reponse: Response;
  try {
    reponse = await transport(url, {
      method: options.methode ?? 'GET',
      headers: entetes,
      credentials: 'same-origin',
      ...(options.corps === undefined ? {} : { body: JSON.stringify(options.corps) }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    });
  } catch (cause) {
    /* Volontairement muet sur la cause : elle pourrait citer des en-têtes. */
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ErreurReseau();
  }

  if (reponse.status === 304) return undefined as T;
  if (!reponse.ok) throw await lireErreur(reponse);
  if (reponse.status === 204) return undefined as T;
  const texte = await reponse.text();
  if (texte.length === 0) return undefined as T;
  return JSON.parse(texte) as T;
}

function etatJoint(details: Record<string, unknown>, corps: Record<string, unknown>): PartyStatePayload | null {
  for (const source of [corps, details]) {
    const candidat = source['etat'];
    if (typeof candidat !== 'object' || candidat === null) continue;
    const forme = candidat as Partial<PartyStatePayload>;
    if (typeof forme.seq === 'number' && typeof forme.etat === 'string') {
      return candidat as PartyStatePayload;
    }
  }
  return null;
}

async function lireErreur(reponse: Response): Promise<ErreurPartie> {
  let message = `Le serveur a répondu ${String(reponse.status)}.`;
  let code = 'erreur_interne';
  let details: Record<string, unknown> = {};
  let corps: Record<string, unknown> = {};
  try {
    const texte = await reponse.text();
    const analyse = texte.length === 0 ? {} : (JSON.parse(texte) as Record<string, unknown>);
    if (typeof analyse === 'object' && analyse !== null) corps = analyse;
    if (typeof corps['erreur'] === 'string' && corps['erreur'].length > 0) message = corps['erreur'];
    if (typeof corps['code'] === 'string' && corps['code'].length > 0) code = corps['code'];
    const brut = corps['details'];
    if (typeof brut === 'object' && brut !== null) details = brut as Record<string, unknown>;
  } catch {
    /* Réponse non JSON : on garde le message générique. */
  }
  if (reponse.status === 409) {
    return new ErreurConflit(message, code, etatJoint(details, corps), details);
  }
  return new ErreurPartie(message, code, reponse.status, details);
}

/* ── Les dix routes ─────────────────────────────────────────────────────── */

/** Crée une partie. Le jeton renvoyé fait de l'appelant l'hôte. */
export async function creerPartie(
  corps: CreatePartyRequest,
  signal?: AbortSignal,
): Promise<PartyCreatedPayload> {
  const cree = await appel<PartyCreatedPayload>(PARTIES_API.racine, {
    methode: 'POST',
    corps,
    signal,
  });
  retenirJeton(cree.code, cree.jeton);
  return cree;
}

/** Salon, ou en-tête d'une partie déjà lancée. */
export async function lireSalon(code: string, signal?: AbortSignal): Promise<PartySalonPayload> {
  const clef = normaliserCode(code);
  return await appel<PartySalonPayload>(PARTIES_API.partie(clef), { code: clef, signal });
}

/** Réclame une bannière libre. Le jeton renvoyé est aussitôt mémorisé. */
export async function rejoindre(
  code: string,
  corps: JoinPartyRequest,
  signal?: AbortSignal,
): Promise<PartyJoinedPayload> {
  const clef = normaliserCode(code);
  const rejoint = await appel<PartyJoinedPayload>(PARTIES_API.rejoindre(clef), {
    methode: 'POST',
    corps,
    code: clef,
    signal,
  });
  retenirJeton(clef, rejoint.jeton);
  return rejoint;
}

/** Change son nom, sa maison, son héros ou sa position avant le lancement. */
export async function modifier(
  code: string,
  corps: ModifyPartyRequest,
  signal?: AbortSignal,
): Promise<PartySalonPayload> {
  const clef = normaliserCode(code);
  return await appel<PartySalonPayload>(PARTIES_API.modifier(clef), {
    methode: 'POST',
    corps,
    code: clef,
    signal,
  });
}

/** L'hôte confie une bannière libre à l'IA, ou la retire. */
export async function reglerIa(
  code: string,
  corps: PartySeatAiRequest,
  signal?: AbortSignal,
): Promise<PartySalonPayload> {
  const clef = normaliserCode(code);
  return await appel<PartySalonPayload>(PARTIES_API.ia(clef), {
    methode: 'POST',
    corps,
    code: clef,
    signal,
  });
}

/** L'hôte lève les bannières. */
export async function lancer(code: string, signal?: AbortSignal): Promise<PartySalonPayload> {
  const clef = normaliserCode(code);
  return await appel<PartySalonPayload>(PARTIES_API.lancer(clef), {
    methode: 'POST',
    corps: {},
    code: clef,
    signal,
  });
}

/**
 * Le pouls : `{ seq, activePlayer, updatedAt }`, quelques dizaines d'octets.
 * C'est la seule requête émise tant que rien ne change.
 */
export async function pouls(code: string, signal?: AbortSignal): Promise<PartyPulsePayload> {
  const clef = normaliserCode(code);
  return await appel<PartyPulsePayload>(PARTIES_API.pouls(clef), { code: clef, signal });
}

/**
 * L'état complet, seulement si `seq` a changé. `depuis` égal au `seq` connu
 * fait répondre `304`, que cette fonction traduit par `null`.
 */
export async function lireEtat(
  code: string,
  depuis?: number,
  signal?: AbortSignal,
): Promise<PartyStatePayload | null> {
  const clef = normaliserCode(code);
  const url =
    depuis === undefined || !Number.isFinite(depuis) || depuis < 0
      ? PARTIES_API.etat(clef)
      : `${PARTIES_API.etat(clef)}?depuis=${String(Math.trunc(depuis))}`;
  const etat = await appel<PartyStatePayload | undefined>(url, { code: clef, signal });
  return etat ?? null;
}

/** Envoie une commande. La clef d'idempotence protège la reconnexion mobile. */
export async function envoyerCommande(
  code: string,
  commande: Command,
  cleIdempotence: string,
  seqAttendu: number,
  signal?: AbortSignal,
): Promise<PartyCommandPayload> {
  const clef = normaliserCode(code);
  return await appel<PartyCommandPayload>(PARTIES_API.commande(clef), {
    methode: 'POST',
    corps: { commande, cleIdempotence, seqAttendu },
    code: clef,
    signal,
  });
}

/** Quitter la partie ; la bannière passe à l'IA. */
export async function abandonner(code: string, signal?: AbortSignal): Promise<PartySalonPayload> {
  const clef = normaliserCode(code);
  const salon = await appel<PartySalonPayload>(PARTIES_API.abandonner(clef), {
    methode: 'POST',
    corps: {},
    code: clef,
    signal,
  });
  oublierJeton(clef);
  return salon;
}

/** Les parties où ce navigateur possède un jeton. */
export async function mesParties(signal?: AbortSignal): Promise<MyPartiesPayload> {
  return await appel<MyPartiesPayload>(PARTIES_API.mesParties, { signal });
}

/**
 * Comme `mesParties`, mais silencieuse : `null` si le serveur est absent.
 * C'est la forme qu'appelle la page d'accueil, qui ne doit jamais se plaindre
 * d'un serveur des parties injoignable.
 */
export async function mesPartiesSilencieuses(signal?: AbortSignal): Promise<MyPartiesPayload | null> {
  try {
    return await mesParties(signal);
  } catch {
    return null;
  }
}

/* ── Clefs d'idempotence ────────────────────────────────────────────────── */

/**
 * Une clef par intention, stable tant que la commande n'a pas abouti : c'est
 * elle qui rend l'envoi rejouable après une coupure de réseau.
 */
export function nouvelleCle(prefixe: string): string {
  const alea =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : Math.floor(Math.random() * 1e16).toString(36);
  return `${prefixe}-${alea}`.slice(0, 64);
}

/* ── Le lien à partager ─────────────────────────────────────────────────── */

/** Le lien à envoyer aux cousins, bâti sur l'origine courante. */
export function lienDePartage(code: string): string {
  const origine =
    typeof location === 'undefined'
      ? ''
      : `${location.origin}${location.pathname}`.replace(/\/+$/, '');
  return partyLink(origine, normaliserCode(code));
}

/**
 * Copie un texte dans le presse-papier. Retourne `false` si le navigateur le
 * refuse — le lien reste alors sélectionnable à la main, ce que l'écran dit.
 */
export async function copierDansPressePapier(texte: string): Promise<boolean> {
  try {
    const presse = typeof navigator === 'undefined' ? null : navigator.clipboard;
    if (!presse) return false;
    await presse.writeText(texte);
    return true;
  } catch {
    return false;
  }
}
