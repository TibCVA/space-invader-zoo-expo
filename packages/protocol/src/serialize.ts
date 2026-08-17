/**
 * Sérialisation d'un `GameState` en JSON, aller-retour à hash constant.
 *
 * Contrainte du contrat (`docs/02-API.md`) : `GameState` contient des
 * `Uint8Array` (le brouillard de guerre de chaque joueur, 256 × 416 = 106 496
 * octets). JSON ne sait pas les représenter : on les encode en **base64**
 * dans une balise reconnaissable, puis on les reconstruit à l'identique.
 *
 * Deux exigences absolues :
 *
 *  1. `hashState(deserializeState(serializeState(s))) === hashState(s)`.
 *     `packages/engine/src/hash.ts` distingue explicitement les tableaux typés
 *     des tableaux ordinaires (`isTypedArray`) : rendre un `number[]` au lieu
 *     d'un `Uint8Array` changerait le hash. La reconstruction doit donc
 *     restituer le **type exact**.
 *  2. Aucune dépendance à Node ni au DOM : ni `Buffer`, ni `atob`. La base64
 *     est écrite ici, en TypeScript pur, pour que le client et le serveur
 *     partagent exactement le même code.
 *
 * Les entiers larges (`Int16Array`, `Uint32Array`…) sont écrits octet par
 * octet en **petit-boutiste explicite** : le résultat ne dépend pas de
 * l'endianness de la machine.
 */
import type { GameState, PlayerId } from '@auvergne/engine';
import { hashState } from '@auvergne/engine';

/* ── Base64 portable ────────────────────────────────────────────────────── */

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const B64_REVERSE = /* @__PURE__ */ (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < B64_ALPHABET.length; i++) {
    table[B64_ALPHABET.charCodeAt(i)] = i;
  }
  // Tolérance : accepte aussi l'alphabet « URL-safe ».
  table['-'.charCodeAt(0)] = 62;
  table['_'.charCodeAt(0)] = 63;
  return table;
})();

/** Nombre d'octets traités par bloc, pour éviter les concaténations quadratiques. */
const B64_CHUNK = 3 * 1024;

/** Encode un tampon d'octets en base64 standard, avec remplissage `=`. */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const n = bytes.length;
  let block = '';
  let sinceFlush = 0;
  let i = 0;

  for (; i + 2 < n; i += 3) {
    const a = bytes[i];
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    block +=
      B64_ALPHABET[a >>> 2] +
      B64_ALPHABET[((a & 0x03) << 4) | (b >>> 4)] +
      B64_ALPHABET[((b & 0x0f) << 2) | (c >>> 6)] +
      B64_ALPHABET[c & 0x3f];
    sinceFlush += 3;
    if (sinceFlush >= B64_CHUNK) {
      parts.push(block);
      block = '';
      sinceFlush = 0;
    }
  }

  const rest = n - i;
  if (rest === 1) {
    const a = bytes[i];
    block += B64_ALPHABET[a >>> 2] + B64_ALPHABET[(a & 0x03) << 4] + '==';
  } else if (rest === 2) {
    const a = bytes[i];
    const b = bytes[i + 1];
    block +=
      B64_ALPHABET[a >>> 2] +
      B64_ALPHABET[((a & 0x03) << 4) | (b >>> 4)] +
      B64_ALPHABET[(b & 0x0f) << 2] +
      '=';
  }
  if (block.length > 0) parts.push(block);
  return parts.join('');
}

/** Décode une chaîne base64 (standard ou URL-safe) en octets. */
export function base64ToBytes(text: string): Uint8Array {
  let end = text.length;
  while (end > 0 && (text[end - 1] === '=' || text[end - 1] === '\n' || text[end - 1] === '\r')) {
    end--;
  }

  // Compte les caractères significatifs (on ignore espaces et retours ligne).
  let significant = 0;
  for (let i = 0; i < end; i++) {
    const code = text.charCodeAt(i);
    if (code === 32 || code === 9 || code === 10 || code === 13) continue;
    if (code > 127 || B64_REVERSE[code] < 0) {
      throw new SerializationError(
        'Données binaires illisibles : la chaîne base64 contient un caractère interdit.',
      );
    }
    significant++;
  }

  const byteLength = Math.floor((significant * 3) / 4);
  const out = new Uint8Array(byteLength);
  let acc = 0;
  let bits = 0;
  let w = 0;

  for (let i = 0; i < end; i++) {
    const code = text.charCodeAt(i);
    if (code === 32 || code === 9 || code === 10 || code === 13) continue;
    acc = (acc << 6) | B64_REVERSE[code];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[w++] = (acc >>> bits) & 0xff;
    }
  }
  return out;
}

/* ── Tableaux typés ─────────────────────────────────────────────────────── */

/** Clef de balisage d'un tableau typé encodé. Volontairement improbable. */
export const TYPED_ARRAY_TAG = '@ta';

/** Codes des tableaux typés reconnus (ceux que `hash.ts` sait distinguer). */
const TA_CODES = ['u8', 'i8', 'u16', 'i16', 'u32', 'i32'] as const;
type TaCode = (typeof TA_CODES)[number];

type IntTypedArray =
  | Uint8Array
  | Int8Array
  | Uint16Array
  | Int16Array
  | Uint32Array
  | Int32Array;

interface EncodedTypedArray {
  [TYPED_ARRAY_TAG]: TaCode;
  /** Longueur en éléments (pas en octets) : contrôle d'intégrité au décodage. */
  n: number;
  /** Contenu, petit-boutiste, encodé en base64. */
  b: string;
}

const TA_BYTES: Readonly<Record<TaCode, 1 | 2 | 4>> = {
  u8: 1,
  i8: 1,
  u16: 2,
  i16: 2,
  u32: 4,
  i32: 4,
};

function taCodeOf(value: unknown): TaCode | null {
  if (value instanceof Uint8Array) return 'u8';
  if (value instanceof Int8Array) return 'i8';
  if (value instanceof Uint16Array) return 'u16';
  if (value instanceof Int16Array) return 'i16';
  if (value instanceof Uint32Array) return 'u32';
  if (value instanceof Int32Array) return 'i32';
  return null;
}

/** Erreur de sérialisation : message toujours en français. */
export class SerializationError extends Error {
  override readonly name = 'SerializationError';
  constructor(message: string) {
    super(message);
  }
}

function encodeTypedArray(code: TaCode, value: IntTypedArray): EncodedTypedArray {
  const width = TA_BYTES[code];
  let bytes: Uint8Array;
  if (width === 1) {
    // Copie explicite : la vue peut porter sur un tampon plus grand.
    bytes = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) bytes[i] = value[i] & 0xff;
  } else {
    bytes = new Uint8Array(value.length * width);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < value.length; i++) {
      const v = value[i];
      if (width === 2) view.setUint16(i * 2, v & 0xffff, true);
      else view.setUint32(i * 4, v >>> 0, true);
    }
  }
  return { [TYPED_ARRAY_TAG]: code, n: value.length, b: bytesToBase64(bytes) };
}

function decodeTypedArray(encoded: EncodedTypedArray): IntTypedArray {
  const code = encoded[TYPED_ARRAY_TAG];
  const width = TA_BYTES[code];
  if (width === undefined) {
    throw new SerializationError(
      `Sauvegarde illisible : type de tableau binaire inconnu (« ${String(code)} »).`,
    );
  }
  const bytes = base64ToBytes(encoded.b);
  const count = Math.floor(bytes.length / width);
  if (typeof encoded.n === 'number' && encoded.n !== count) {
    throw new SerializationError(
      `Sauvegarde illisible : tableau binaire tronqué (${count} éléments lus, ${encoded.n} attendus).`,
    );
  }

  switch (code) {
    case 'u8': {
      return bytes;
    }
    case 'i8': {
      const out = new Int8Array(count);
      for (let i = 0; i < count; i++) out[i] = (bytes[i] << 24) >> 24;
      return out;
    }
    case 'u16':
    case 'i16': {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const out = code === 'u16' ? new Uint16Array(count) : new Int16Array(count);
      for (let i = 0; i < count; i++) out[i] = view.getUint16(i * 2, true);
      return out;
    }
    case 'u32':
    case 'i32': {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const out = code === 'u32' ? new Uint32Array(count) : new Int32Array(count);
      for (let i = 0; i < count; i++) out[i] = view.getUint32(i * 4, true);
      return out;
    }
    default: {
      throw new SerializationError('Sauvegarde illisible : type de tableau binaire inconnu.');
    }
  }
}

function isEncodedTypedArray(value: unknown): value is EncodedTypedArray {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const tag = (value as Record<string, unknown>)[TYPED_ARRAY_TAG];
  return typeof tag === 'string' && typeof (value as Record<string, unknown>).b === 'string';
}

/* ── Encodage / décodage générique ──────────────────────────────────────── */

/**
 * Remplace récursivement les tableaux typés par leur forme balisée.
 * Utilisé comme `replacer` de `JSON.stringify` : les tableaux typés n'ayant
 * pas de `toJSON`, ils parviennent intacts jusqu'ici.
 */
function replacer(_key: string, value: unknown): unknown {
  const code = taCodeOf(value);
  if (code !== null) return encodeTypedArray(code, value as IntTypedArray);
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new SerializationError(
      'État non sérialisable : une valeur numérique non finie a été rencontrée (la simulation doit rester entière).',
    );
  }
  if (typeof value === 'bigint' || typeof value === 'function' || typeof value === 'symbol') {
    throw new SerializationError(
      `État non sérialisable : valeur de type « ${typeof value} » rencontrée.`,
    );
  }
  return value;
}

/** `reviver` de `JSON.parse` : reconstruit les tableaux typés. */
function reviver(_key: string, value: unknown): unknown {
  if (isEncodedTypedArray(value)) return decodeTypedArray(value);
  return value;
}

/** Transforme une valeur quelconque en structure JSON-compatible. */
export function encodeBinaries(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value, replacer)) as unknown;
}

/** Reconstruit les tableaux typés d'une structure déjà analysée. */
export function decodeBinaries(value: unknown): unknown {
  if (isEncodedTypedArray(value)) return decodeTypedArray(value);
  // Un tableau typé déjà reconstruit se traverse à l'identique : le parcourir
  // comme un objet ordinaire le transformerait en `{ '0': …, '1': … }`.
  if (taCodeOf(value) !== null) return value;
  if (Array.isArray(value)) return value.map((v) => decodeBinaries(v));
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = decodeBinaries(v);
    }
    return out;
  }
  return value;
}

/* ── API publique ───────────────────────────────────────────────────────── */

/**
 * Sérialise un `GameState` complet en une chaîne JSON.
 * Les `Uint8Array` de brouillard deviennent `{ '@ta':'u8', n, b:<base64> }`.
 */
export function serializeState(state: GameState): string {
  if (state === null || typeof state !== 'object') {
    throw new SerializationError("État non sérialisable : ce n'est pas un objet.");
  }
  return JSON.stringify(state, replacer);
}

/**
 * Reconstruit un `GameState` depuis sa forme JSON.
 * Lève une `SerializationError` (message français) si la structure est
 * inexploitable.
 */
export function deserializeState(json: string): GameState {
  if (typeof json !== 'string' || json.length === 0) {
    throw new SerializationError('Sauvegarde illisible : contenu vide.');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json, reviver) as unknown;
  } catch (err) {
    if (err instanceof SerializationError) throw err;
    throw new SerializationError(
      "Sauvegarde illisible : le contenu n'est pas du JSON valide.",
    );
  }
  // Le `reviver` a déjà reconstruit les tableaux typés : une seconde passe ne
  // ferait que recopier inutilement une centaine de kilo-octets par bannière.
  if (!isRawObject(parsed)) {
    throw new SerializationError("Sauvegarde illisible : l'état n'est pas un objet.");
  }
  assertState(parsed);
  return parsed as unknown as GameState;
}

/**
 * Valide qu'une valeur déjà analysée est bien un `GameState` plausible et
 * reconstruit ses tableaux typés si nécessaire. Utile côté serveur lorsque
 * Fastify a déjà analysé le corps de la requête.
 */
export function adoptState(value: unknown): GameState {
  const decoded = isRawObject(value) ? (decodeBinaries(value) as Record<string, unknown>) : null;
  if (decoded === null) {
    throw new SerializationError("Sauvegarde illisible : l'état n'est pas un objet.");
  }
  assertState(decoded);
  return decoded as unknown as GameState;
}

function isRawObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

const REQUIRED_STATE_KEYS = [
  'engineVersion',
  'contentVersion',
  'mapVersion',
  'id',
  'seed',
  'rng',
  'turn',
  'activePlayer',
  'turnOrder',
  'players',
  'heroes',
  'towns',
  'objects',
  'weather',
  'phase',
] as const;

/** Contrôle structurel minimal, suffisant pour refuser un corps hostile. */
function assertState(state: Record<string, unknown>): void {
  const missing = REQUIRED_STATE_KEYS.filter((k) => state[k] === undefined);
  if (missing.length > 0) {
    throw new SerializationError(
      `Sauvegarde illisible : champs manquants dans l'état (${missing.join(', ')}).`,
    );
  }
  if (!Number.isInteger(state.turn) || (state.turn as number) < 1) {
    throw new SerializationError('Sauvegarde illisible : le numéro de jour est invalide.');
  }
  if (!Number.isInteger(state.seed)) {
    throw new SerializationError('Sauvegarde illisible : la graine est invalide.');
  }
  if (!isRawObject(state.players)) {
    throw new SerializationError('Sauvegarde illisible : la liste des bannières est invalide.');
  }
  const players = state.players as Record<string, unknown>;
  const ids = Object.keys(players);
  if (ids.length < 1) {
    throw new SerializationError('Sauvegarde illisible : aucune bannière dans la partie.');
  }
  for (const id of ids) {
    const p = players[id];
    if (!isRawObject(p)) {
      throw new SerializationError(
        `Sauvegarde illisible : la bannière ${id} est mal formée.`,
      );
    }
    if (!(p.fog instanceof Uint8Array)) {
      throw new SerializationError(
        `Sauvegarde illisible : le brouillard de la bannière ${id} n'a pas pu être reconstruit.`,
      );
    }
  }
  if (!isRawObject(state.rng)) {
    throw new SerializationError('Sauvegarde illisible : le générateur pseudo-aléatoire est absent.');
  }
  const rng = state.rng as Record<string, unknown>;
  for (const k of ['hi', 'lo', 'inchi', 'inclo']) {
    if (!Number.isInteger(rng[k])) {
      throw new SerializationError(
        `Sauvegarde illisible : le générateur pseudo-aléatoire est corrompu (champ ${k}).`,
      );
    }
  }
}

/* ── Hash & intégrité ───────────────────────────────────────────────────── */

/** Hash canonique d'un état, tel que le calcule le moteur. */
export function stateHash(state: GameState): string {
  return hashState(state as unknown as Record<string, unknown>);
}

/**
 * Vérifie qu'un état correspond au hash annoncé.
 * Retourne le hash observé pour pouvoir l'afficher dans un message français.
 */
export function verifyStateHash(
  state: GameState,
  expected: string,
): { ok: boolean; expected: string; actual: string } {
  const actual = stateHash(state);
  return { ok: actual === expected, expected, actual };
}

/**
 * Contrôle complet d'un aller-retour. Réservé aux tests et au diagnostic :
 * sur un état réel, l'opération coûte deux passes JSON.
 */
export function roundTripPreservesHash(state: GameState): boolean {
  const before = stateHash(state);
  const after = stateHash(deserializeState(serializeState(state)));
  return before === after;
}

/* ── Résumé d'un état, pour l'affichage des emplacements ────────────────── */

/** Résumé léger tiré d'un état, utilisé pour remplir un `SaveSlot`. */
export interface StateSummary {
  turn: number;
  day: number;
  week: number;
  players: { id: PlayerId; name: string; faction: string; color: string; alive: boolean }[];
  activePlayer: string;
  phase: string;
  hash: string;
  engineVersion: string;
  contentVersion: string;
  mapVersion: string;
}

/**
 * Extrait un résumé affichable d'un état déjà désérialisé.
 * Ne recalcule pas le hash : on renvoie celui que porte l'état.
 */
export function summarizeState(state: GameState): StateSummary {
  const order = Array.isArray(state.turnOrder) ? state.turnOrder : [];
  const players = order
    .map((id) => state.players[id])
    .filter((p): p is NonNullable<typeof p> => p !== undefined && p !== null)
    .map((p) => ({
      id: p.id,
      name: p.name,
      faction: p.faction as string,
      color: p.color,
      alive: p.alive !== false,
    }));
  const turn = state.turn;
  return {
    turn,
    day: ((turn - 1) % 7) + 1,
    week: Math.floor((turn - 1) / 7) + 1,
    players,
    activePlayer: state.activePlayer,
    phase: state.phase,
    hash: state.hash,
    engineVersion: state.engineVersion,
    contentVersion: state.contentVersion,
    mapVersion: state.mapVersion,
  };
}

/** Taille en octets UTF-8 d'une chaîne, sans dépendre de `Buffer`. */
export function utf8Length(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff) {
      // paire de substitution : 4 octets pour deux unités de code
      bytes += 4;
      i++;
    } else bytes += 3;
  }
  return bytes;
}
