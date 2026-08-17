/**
 * Outillage partagé du module « monde ».
 *
 * Rien ici n'est une règle de jeu : uniquement des primitives entières, des
 * accès sûrs à l'état et la fabrique des textes français affichés au joueur.
 *
 * Deux règles gouvernent tout ce fichier :
 *  - aucun flottant ne sort d'une fonction (les ratios sont en points de base) ;
 *  - aucune itération sur un `Record` ne se fait dans l'ordre d'insertion :
 *    l'ordre d'insertion serait une entrée cachée de la simulation.
 */
import {
  RESOURCE_KEYS,
  weekOf,
  type GameEvent,
  type GameState,
  type HeroInstance,
  type MapObject,
  type ObjectUid,
  type PlayerId,
  type ResourceKey,
  type Resources,
  type SkillEffect,
} from '../types.js';
import { content, RESOURCE_LABELS, sortedKeys } from '../core/index.js';

/* ── Réglages de présentation ───────────────────────────────────────────── */

/**
 * Réglages du module partagé. Aucun de ces nombres n'entre dans la simulation :
 * ils ne servent qu'à la mise en forme des textes destinés au joueur.
 */
export const COMMON_TUNING = {
  /** Au-delà de ce nombre, on écrit le chiffre plutôt que le mot. */
  spelledOutMax: 16,
  /** Longueur maximale d'un nom de lieu repris dans un message. */
  placeNameMax: 48,
} as const;

/* ── Nombres et libellés français ───────────────────────────────────────── */

const NUMBER_WORDS_M: readonly string[] = [
  'zéro',
  'un',
  'deux',
  'trois',
  'quatre',
  'cinq',
  'six',
  'sept',
  'huit',
  'neuf',
  'dix',
  'onze',
  'douze',
  'treize',
  'quatorze',
  'quinze',
  'seize',
];

const NUMBER_WORDS_F: readonly string[] = NUMBER_WORDS_M.map((w, i) => (i === 1 ? 'une' : w));

/** « quatre » / « une » / « 240 ». `feminine` accorde le nombre un. */
export function numberWord(n: number, feminine = false): string {
  const v = Math.trunc(n);
  if (v < 0) return String(v);
  if (v > COMMON_TUNING.spelledOutMax) return String(v);
  const table = feminine ? NUMBER_WORDS_F : NUMBER_WORDS_M;
  return table[v] ?? String(v);
}

/** Accord simple d'un substantif : « un jour » / « trois jours ». */
export function pluralize(n: number, one: string, many: string): string {
  return Math.abs(n) > 1 ? `${n} ${many}` : `${n} ${one}`;
}

/** Unité de compte d'une ressource, telle qu'un gabelou la prononcerait. */
const RESOURCE_UNITS: Record<ResourceKey, { one: string; many: string; feminine: boolean }> = {
  ecus: { one: 'écu', many: 'écus', feminine: false },
  bois: { one: 'stère de bois', many: 'stères de bois', feminine: false },
  granit: { one: 'bloc de granit', many: 'blocs de granit', feminine: false },
  fer: { one: 'gueuse de fer', many: 'gueuses de fer', feminine: true },
  sel: { one: 'mesure de sel', many: 'mesures de sel', feminine: true },
  essence: { one: "flacon d'essence sylvestre", many: "flacons d'essence sylvestre", feminine: false },
  filDor: { one: "écheveau de fil d'or", many: "écheveaux de fil d'or", feminine: false },
};

/** « quatre mesures de sel », « 320 écus ». */
export function resourceWords(resource: ResourceKey, amount: number): string {
  const unit = RESOURCE_UNITS[resource] ?? { one: resource, many: resource, feminine: false };
  const n = Math.trunc(amount);
  const word = numberWord(n, unit.feminine);
  return `${word} ${Math.abs(n) > 1 ? unit.many : unit.one}`;
}

/** Énumération française : « a, b et c ». */
export function joinFr(parts: readonly string[], conjunction = 'et'): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(', ')} ${conjunction} ${parts[parts.length - 1]}`;
}

/** « quatre mesures de sel et 320 écus » à partir d'un delta de ressources. */
export function describeDelta(delta: Partial<Resources>): string {
  const parts: string[] = [];
  for (const k of RESOURCE_KEYS) {
    const d = delta[k];
    if (d) parts.push(resourceWords(k, Math.abs(d)));
  }
  return parts.length === 0 ? 'rien' : joinFr(parts);
}

/** Libellé court d'une ressource, pour les listes serrées. */
export function resourceLabel(resource: ResourceKey): string {
  return RESOURCE_LABELS[resource] ?? resource;
}

/* ── Accès à l'état ─────────────────────────────────────────────────────── */

/** Nom affichable d'un héros ; retombe sur son identifiant d'instance. */
export function heroName(hero: HeroInstance): string {
  const def = content().HEROES[hero.def];
  return def ? def.name : hero.uid;
}

/** Nom complet d'un héros : « Thibaut, Maître des chemins ». */
export function heroFullName(hero: HeroInstance): string {
  const def = content().HEROES[hero.def];
  if (!def) return hero.uid;
  return `${def.name}, ${def.title}`;
}

export function playerName(state: GameState, player: PlayerId | null): string {
  if (!player) return 'une bannière inconnue';
  return state.players[player]?.name ?? player;
}

/** Nom d'un lieu, tiré de son sac de données, tronqué si besoin. */
export function objectName(obj: MapObject, fallback = 'ce lieu'): string {
  const raw = obj.data.name;
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  return raw.length > COMMON_TUNING.placeNameMax
    ? raw.slice(0, COMMON_TUNING.placeNameMax - 1) + '…'
    : raw;
}

/** Lecture entière et tolérante d'un champ du sac de données d'un objet. */
export function dataInt(obj: MapObject, key: string, fallback = 0): number {
  const raw = obj.data[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : fallback;
}

export function dataString(obj: MapObject, key: string): string | null {
  const raw = obj.data[key];
  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/** Sous-objet mutable et sérialisable du sac de données. */
export function dataBag(obj: MapObject, key: string): Record<string, unknown> {
  const raw = obj.data[key];
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  const bag: Record<string, unknown> = {};
  obj.data[key] = bag;
  return bag;
}

/* ── Événements ─────────────────────────────────────────────────────────── */

export function notice(
  player: PlayerId | null,
  text: string,
  severity: 'info' | 'warn' | 'danger' = 'info',
): GameEvent {
  return { type: 'Notice', player, text, severity };
}

export function visited(hero: HeroInstance, obj: MapObject, result: string): GameEvent {
  return { type: 'ObjectVisited', hero: hero.uid, object: obj.uid, result };
}

/**
 * Crédite (ou débite) un joueur et produit l'événement correspondant.
 * Le trésor ne descend jamais sous zéro : le manque est simplement perdu.
 */
export function giveResources(
  state: GameState,
  player: PlayerId,
  delta: Partial<Resources>,
  reason: string,
): GameEvent[] {
  const p = state.players[player];
  if (!p) return [];
  const applied: Partial<Resources> = {};
  for (const k of RESOURCE_KEYS) {
    const d = delta[k];
    if (!d) continue;
    const before = p.resources[k] | 0;
    const after = Math.max(0, before + Math.trunc(d));
    if (after === before) continue;
    p.resources[k] = after;
    applied[k] = after - before;
  }
  if (Object.keys(applied).length === 0) return [];
  return [{ type: 'ResourcesChanged', player, delta: applied, reason }];
}

/** Vrai si le joueur possède au moins ce coût. */
export function canPay(state: GameState, player: PlayerId, cost: Partial<Resources>): boolean {
  const p = state.players[player];
  if (!p) return false;
  for (const k of RESOURCE_KEYS) {
    const c = cost[k];
    if (c && (p.resources[k] | 0) < c) return false;
  }
  return true;
}

/* ── Effets ─────────────────────────────────────────────────────────────── */

type ValueEffectKind = Extract<SkillEffect, { value: number }>['kind'];
type BpEffectKind = Extract<SkillEffect, { bp: number }>['kind'];

/** Somme des effets additifs d'un type donné. */
export function sumEffect(effects: readonly SkillEffect[], kind: ValueEffectKind): number {
  let total = 0;
  for (const e of effects) {
    if (e.kind === kind) total += (e as { value: number }).value | 0;
  }
  return total;
}

/**
 * Composition additive de ratios en points de base autour de la neutralité.
 * Deux bonus de +8 % donnent +16 %, jamais +16,64 % : la simulation reste
 * lisible et entièrement entière.
 */
export function combineEffectBp(effects: readonly SkillEffect[], kind: BpEffectKind): number {
  let bp = 10000;
  for (const e of effects) {
    if (e.kind === kind) bp += ((e as { bp: number }).bp | 0) - 10000;
  }
  return bp;
}

/* ── Chronique : registre global sérialisé ──────────────────────────────── */

/**
 * `GameState` (verrouillé) n'offre aucun champ libre pour la comptabilité du
 * monde : usages hebdomadaires du don de Côme, dernière semaine tirée,
 * refroidissement des révoltes, avancement des doléances globales…
 *
 * Ces compteurs sont donc rangés dans un objet de carte réservé, `O_chronique`,
 * inséré dans `state.objects` : il est cloné, sérialisé et haché comme le reste
 * de l'état, ce qui garantit qu'une partie rechargée se comporte exactement
 * comme la partie d'origine.
 *
 * Il est volontairement **hors carte** (`at` négatif, empreinte vide,
 * `spent: true`) : aucun héros ne peut l'atteindre, aucune vue ne le dessine,
 * `objectAt` de la `WorldMap` ne le référence jamais. C'est un contournement
 * assumé et documenté, du même ordre que l'encodage de la configuration dans
 * `state.id` (`core/config.ts`).
 */
export const LEDGER_UID: ObjectUid = 'O_chronique';

export function ledger(state: GameState): Record<string, unknown> {
  let obj = state.objects[LEDGER_UID];
  if (!obj) {
    obj = {
      uid: LEDGER_UID,
      kind: 'obstacle',
      at: { col: -1, row: -1 },
      footprint: [],
      entrance: { col: -1, row: -1 },
      owner: null,
      data: {},
      spent: true,
    };
    state.objects[LEDGER_UID] = obj;
  }
  return obj.data;
}

export function ledgerInt(state: GameState, key: string, fallback = 0): number {
  const raw = ledger(state)[key];
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : fallback;
}

export function setLedgerInt(state: GameState, key: string, value: number): void {
  ledger(state)[key] = Math.trunc(value);
}

export function ledgerString(state: GameState, key: string): string | null {
  const raw = ledger(state)[key];
  return typeof raw === 'string' ? raw : null;
}

export function setLedgerString(state: GameState, key: string, value: string): void {
  ledger(state)[key] = value;
}

/**
 * Usages hebdomadaires restants pour un sujet (bannière ou héros).
 * `subject` est une chaîne libre : `PlayerId` pour le don de Côme, `HeroUid`
 * pour les bornes armoriées.
 */
export function weeklyUsesLeft(
  state: GameState,
  key: string,
  subject: string,
  perWeek: number,
): number {
  const week = weekOf(state.turn);
  const stored = ledgerInt(state, `${key}.${subject}.week`, -1);
  if (stored !== week) return perWeek;
  return Math.max(0, perWeek - ledgerInt(state, `${key}.${subject}.count`, 0));
}

/** Vrai si l'usage hebdomadaire `key` est encore disponible pour ce sujet. */
export function weeklyUsageAvailable(
  state: GameState,
  key: string,
  subject: string,
  perWeek = 1,
): boolean {
  return weeklyUsesLeft(state, key, subject, perWeek) > 0;
}

/** Consomme un usage hebdomadaire. Retourne le nombre d'usages déjà faits. */
export function consumeWeeklyUsage(state: GameState, key: string, subject: string): number {
  const week = weekOf(state.turn);
  const stored = ledgerInt(state, `${key}.${subject}.week`, -1);
  const count = stored === week ? ledgerInt(state, `${key}.${subject}.count`, 0) : 0;
  setLedgerInt(state, `${key}.${subject}.week`, week);
  setLedgerInt(state, `${key}.${subject}.count`, count + 1);
  return count;
}

/** Usages quotidiens restants pour un sujet. */
export function dailyUsesLeft(
  state: GameState,
  key: string,
  subject: string,
  perDay: number,
): number {
  const stored = ledgerInt(state, `${key}.${subject}.jour`, -1);
  if (stored !== state.turn) return perDay;
  return Math.max(0, perDay - ledgerInt(state, `${key}.${subject}.n`, 0));
}

/** Consomme un usage quotidien. */
export function consumeDailyUsage(state: GameState, key: string, subject: string): void {
  const stored = ledgerInt(state, `${key}.${subject}.jour`, -1);
  const count = stored === state.turn ? ledgerInt(state, `${key}.${subject}.n`, 0) : 0;
  setLedgerInt(state, `${key}.${subject}.jour`, state.turn);
  setLedgerInt(state, `${key}.${subject}.n`, count + 1);
}

/* ── Parcours déterministes ─────────────────────────────────────────────── */

/** Objets de l'état, triés par identifiant : ordre stable et reproductible. */
export function allObjects(state: GameState): MapObject[] {
  const out: MapObject[] = [];
  for (const uid of sortedKeys(state.objects)) {
    if (uid === LEDGER_UID) continue;
    out.push(state.objects[uid]);
  }
  return out;
}

/** Objets d'un genre donné, ordre stable. */
export function objectsOfKind(state: GameState, kind: MapObject['kind']): MapObject[] {
  return allObjects(state).filter((o) => o.kind === kind);
}

/** Héros vivants d'un joueur, ordre stable. */
export function heroesOf(state: GameState, player: PlayerId): HeroInstance[] {
  const p = state.players[player];
  if (!p) return [];
  const out: HeroInstance[] = [];
  for (const uid of p.heroes.slice().sort()) {
    const hero = state.heroes[uid];
    if (hero) out.push(hero);
  }
  return out;
}

/**
 * Détenteur actuel de la Maison du Trésor, ou `null`.
 * On retient la première maison **effectivement tenue** : une carte peut en
 * décrire plusieurs bâtiments, et une maison sans maître ne doit jamais
 * masquer celle qu'une bannière occupe.
 */
export function treasuryHolder(state: GameState): PlayerId | null {
  for (const obj of allObjects(state)) {
    if (obj.kind === 'maison_tresor' && obj.owner !== null) return obj.owner;
  }
  return null;
}

/** L'objet Maison du Trésor, s'il existe sur cette carte. */
export function treasuryObject(state: GameState): MapObject | null {
  for (const obj of allObjects(state)) {
    if (obj.kind === 'maison_tresor') return obj;
  }
  return null;
}

/** Joueurs encore en lice, dans l'ordre du tour. */
export function alivePlayers(state: GameState): PlayerId[] {
  return state.turnOrder.filter((id) => state.players[id]?.alive === true);
}

/** Marque un objet comme visité par un joueur ; vrai s'il l'était déjà. */
export function markVisited(obj: MapObject, player: PlayerId): boolean {
  const list = obj.visitedBy ?? [];
  if (list.includes(player)) return true;
  obj.visitedBy = [...list, player].sort();
  return false;
}

export function hasVisited(obj: MapObject, player: PlayerId): boolean {
  return (obj.visitedBy ?? []).includes(player);
}
