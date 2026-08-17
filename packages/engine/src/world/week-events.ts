/**
 * Événements de semaine.
 *
 * Au jour 1 de chaque semaine, le noyau appelle `weeklyEvent`. Un événement est
 * tiré dans `WEEK_EVENTS` (fourni par `@auvergne/content`), annoncé à tout le
 * monde, puis **appliqué** : c'est ici que les effets ponctuels prennent corps.
 *
 * Le noyau ne lit qu'une chose dans le résultat : la clef portée par
 * `WeekPassed`, dont il tire le ratio de croissance des demeures. Tout le
 * reste — dons de ressources, agitation, croissance des compagnies neutres,
 * bénédiction des sanctuaires — est appliqué par ce module, et les ratios qui
 * courent toute la semaine (`movement_bp`, `income_bp`, `trade_bp`…) sont
 * mémorisés dans la chronique pour que l'interface puisse les afficher.
 *
 * L'événement de la semaine précédente est écarté du tirage : deux semaines de
 * boue d'affilée seraient une punition, pas un récit.
 */
import {
  RESOURCE_KEYS,
  weekOf,
  type GameEvent,
  type GameState,
  type ResourceKey,
  type Resources,
} from '../types.js';
import { pickWeighted } from '../rng.js';
import { MAX_UNREST as UNREST_CEILING, clampInt, content } from '../core/index.js';
import type { WeekEventDef } from '../core/index.js';
import {
  allObjects,
  giveResources,
  heroesOf,
  joinFr,
  ledgerString,
  notice,
  numberWord,
  resourceWords,
  setLedgerString,
} from './common.js';
import { resolveGabelleWeek } from './gabelle.js';
import { heroStats } from './hero-stats.js';

/* ── Réglages ───────────────────────────────────────────────────────────── */

/**
 * Réglages des semaines. Les amplitudes restent volontairement faibles : une
 * semaine colore la partie, elle ne la renverse pas.
 */
export const WEEK_EVENT_TUNING = {
  /** Poids appliqué à l'événement de la semaine écoulée : il est écarté. */
  repeatWeight: 0,
  /** Poids minimal d'un événement, pour qu'aucun ne devienne impossible. */
  minWeight: 1,
  /** Ratio maximal de croissance porté par un événement, en points de base. */
  growthMaxBp: 13000,
  /** Ratio minimal de croissance porté par un événement, en points de base. */
  growthMinBp: 8000,
  /** Croissance par défaut des compagnies neutres, en points de base. */
  neutralGrowthDefaultBp: 10000,
  /** Croissance maximale d'une compagnie neutre en une semaine, en BP. */
  neutralGrowthMaxBp: 12500,
  /** Mana rendu par point de « bénédiction des sanctuaires ». */
  shrineManaPerPoint: 4,
  /** Clef de la chronique portant l'événement en cours. */
  ledgerKey: 'semaine.cle',
  /** Clef de la chronique portant l'événement de la semaine précédente. */
  ledgerPreviousKey: 'semaine.precedente',
} as const;

/* ── Lecture du contenu ─────────────────────────────────────────────────── */

/** Table des événements telle que le contenu la fournit. */
export function weekEventTable(): readonly WeekEventDef[] {
  return content().WEEK_EVENTS ?? [];
}

/** Définition d'un événement par sa clef. */
export function weekEventOf(key: string | null): WeekEventDef | null {
  if (!key) return null;
  for (const e of weekEventTable()) {
    if (e.key === key) return e;
  }
  return null;
}

/** Clef de l'événement qui court cette semaine, ou `null`. */
export function currentWeekEvent(state: GameState): string | null {
  return ledgerString(state, WEEK_EVENT_TUNING.ledgerKey);
}

type LooseEffect = { kind: string; [k: string]: unknown };

function effectsOf(def: WeekEventDef | null): LooseEffect[] {
  if (!def) return [];
  return def.effects as unknown as LooseEffect[];
}

function readBp(effect: LooseEffect): number | null {
  const raw = effect.bp;
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : null;
}

function readValue(effect: LooseEffect): number | null {
  const raw = effect.value;
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.trunc(raw) : null;
}

/**
 * Ratio de croissance des demeures porté par un événement, en points de base.
 * Le noyau lit la même information par son propre chemin ; cette fonction
 * existe pour l'interface et pour les tests.
 */
export function weekGrowthBp(key: string | null): number {
  const def = weekEventOf(key);
  for (const effect of effectsOf(def)) {
    if (effect.kind !== 'growth_bp') continue;
    const bp = readBp(effect);
    if (bp !== null) {
      return clampInt(bp, WEEK_EVENT_TUNING.growthMinBp, WEEK_EVENT_TUNING.growthMaxBp);
    }
  }
  return 10000;
}

/**
 * Ratio courant d'un effet de semaine, en points de base.
 * Sert aux info-bulles : « les chemins sont bons cette semaine (+7 %) ».
 */
export function weekModifierBp(state: GameState, kind: string): number {
  const def = weekEventOf(currentWeekEvent(state));
  for (const effect of effectsOf(def)) {
    if (effect.kind !== kind) continue;
    const bp = readBp(effect);
    if (bp !== null) return bp;
  }
  return 10000;
}

/** Valeur additive courante d'un effet de semaine (moral, vision, agitation). */
export function weekModifierValue(state: GameState, kind: string): number {
  const def = weekEventOf(currentWeekEvent(state));
  let total = 0;
  for (const effect of effectsOf(def)) {
    if (effect.kind !== kind) continue;
    const value = readValue(effect);
    if (value !== null) total += value;
  }
  return total;
}

/* ── Tirage ─────────────────────────────────────────────────────────────── */

/** Tire l'événement de la semaine. Consomme le PRNG de l'état. */
export function drawWeekEvent(state: GameState): WeekEventDef | null {
  const table = weekEventTable();
  if (table.length === 0) return null;
  // L'événement encore inscrit dans la chronique est celui de la semaine qui
  // s'achève : c'est lui, et lui seul, que l'on écarte du tirage.
  const previous = currentWeekEvent(state);

  const entries = table
    .map((e) => ({
      item: e,
      weight:
        e.key === previous
          ? WEEK_EVENT_TUNING.repeatWeight
          : Math.max(WEEK_EVENT_TUNING.minWeight, e.weight),
    }))
    .filter((entry) => entry.weight > 0);

  if (entries.length === 0) {
    return table[0];
  }
  return pickWeighted(state.rng, entries);
}

/* ── Application ────────────────────────────────────────────────────────── */

/**
 * Tire, annonce et applique l'événement de la semaine, puis résout les
 * conséquences hebdomadaires de la gabelle.
 * Signature imposée par `docs/02-API.md`.
 */
export function weeklyEvent(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const week = weekOf(state.turn);
  const chosen = drawWeekEvent(state);

  if (!chosen) {
    setLedgerString(state, WEEK_EVENT_TUNING.ledgerKey, '');
    events.push({ type: 'WeekPassed', week, eventKey: null });
    events.push(...resolveGabelleWeek(state));
    return events;
  }

  const previous = currentWeekEvent(state);
  if (previous) setLedgerString(state, WEEK_EVENT_TUNING.ledgerPreviousKey, previous);
  setLedgerString(state, WEEK_EVENT_TUNING.ledgerKey, chosen.key);

  events.push({ type: 'WeekPassed', week, eventKey: chosen.key });
  events.push(
    notice(null, `Semaine ${week} — ${chosen.name}. ${chosen.text}`, 'info'),
  );

  events.push(...applyWeekEffects(state, chosen));
  events.push(...resolveGabelleWeek(state));
  return events;
}

/**
 * Applique les effets ponctuels d'un événement de semaine.
 * Les ratios durables ne sont pas appliqués ici : ils sont lus à la demande
 * par `weekModifierBp`, ce qui évite tout double comptage.
 */
export function applyWeekEffects(state: GameState, def: WeekEventDef): GameEvent[] {
  const events: GameEvent[] = [];
  const gifts: Partial<Resources> = {};
  let unrest = 0;
  let neutralBp: number = WEEK_EVENT_TUNING.neutralGrowthDefaultBp;
  let shrine = 0;

  for (const effect of effectsOf(def)) {
    switch (effect.kind) {
      case 'resource_gift': {
        const resource = effect.resource;
        const amount = readValue(effect) ?? (typeof effect.amount === 'number' ? Math.trunc(effect.amount) : 0);
        if (
          typeof resource === 'string' &&
          (RESOURCE_KEYS as readonly string[]).includes(resource) &&
          amount !== 0
        ) {
          const key = resource as ResourceKey;
          gifts[key] = (gifts[key] ?? 0) + amount;
        }
        break;
      }
      case 'unrest': {
        const value = readValue(effect);
        if (value !== null) unrest += value;
        break;
      }
      case 'neutral_growth_bp': {
        const bp = readBp(effect);
        if (bp !== null) neutralBp = clampInt(bp, 10000, WEEK_EVENT_TUNING.neutralGrowthMaxBp);
        break;
      }
      case 'shrine_bonus': {
        const value = readValue(effect);
        if (value !== null) shrine += value;
        break;
      }
      default:
        break;
    }
  }

  // 1. Dons de ressources, pour toutes les bannières encore en lice.
  if (Object.keys(gifts).length > 0) {
    const described = joinFr(
      RESOURCE_KEYS.filter((k) => gifts[k]).map((k) => resourceWords(k, gifts[k] as number)),
    );
    for (const id of state.turnOrder) {
      const p = state.players[id];
      if (!p || !p.alive) continue;
      events.push(...giveResources(state, id, gifts, `semaine : ${def.key}`));
    }
    events.push(notice(null, `Chaque bannière reçoit ${described}.`, 'info'));
  }

  // 2. Agitation, pour toutes les cités tenues.
  if (unrest !== 0) {
    const touched: string[] = [];
    for (const uid of Object.keys(state.towns).sort()) {
      const town = state.towns[uid];
      if (!town.owner) continue;
      const before = town.unrest;
      town.unrest = clampInt(town.unrest + unrest, 0, UNREST_CEILING);
      if (town.unrest !== before) touched.push(town.name);
    }
    if (touched.length > 0) {
      events.push(
        notice(
          null,
          unrest > 0
            ? `On murmure aux portes de ${joinFr(touched)} : l’agitation monte de ${unrest}.`
            : `Les esprits s’apaisent à ${joinFr(touched)}.`,
          unrest > 0 ? 'warn' : 'info',
        ),
      );
    }
  }

  // 3. Croissance des compagnies neutres.
  if (neutralBp > 10000) {
    const grown = growNeutralGuards(state, neutralBp);
    if (grown > 0) {
      events.push(
        notice(
          null,
          `Les compagnies sans maître grossissent dans les futaies : ${numberWord(grown)} combattants de plus ` +
            `barrent désormais les chemins du Forez.`,
          'warn',
        ),
      );
    }
  }

  // 4. Bénédiction des sanctuaires : mana rendu à tous les héros.
  if (shrine > 0) {
    const gain = shrine * WEEK_EVENT_TUNING.shrineManaPerPoint;
    for (const id of state.turnOrder) {
      const p = state.players[id];
      if (!p || !p.alive) continue;
      for (const hero of heroesOf(state, id)) {
        hero.mana = Math.min(heroStats(state, hero).manaMax, hero.mana + gain);
      }
    }
    events.push(
      notice(null, `Les sanctuaires débordent de pèlerins : ${gain} points de mana pour chaque capitaine.`, 'info'),
    );
  }

  return events;
}

/** Fait grossir les gardes neutres. Retourne le nombre de combattants ajoutés. */
export function growNeutralGuards(state: GameState, bp: number): number {
  let added = 0;
  for (const obj of allObjects(state)) {
    if (!obj.guard || obj.guard.length === 0) continue;
    if (obj.owner !== null) continue;
    for (const stack of obj.guard) {
      if (stack.count <= 0) continue;
      const extra = Math.trunc((stack.count * (bp - 10000)) / 10000);
      if (extra <= 0) continue;
      stack.count += extra;
      added += extra;
    }
  }
  return added;
}

/* ── Lecture ────────────────────────────────────────────────────────────── */

export interface WeekSummary {
  week: number;
  key: string | null;
  name: string;
  text: string;
  growthBp: number;
  modifiers: { label: string; bp: number }[];
}

/** Résumé de la semaine en cours, pour le bandeau et le codex. */
export function weekSummary(state: GameState): WeekSummary {
  const key = currentWeekEvent(state);
  const def = weekEventOf(key);
  const modifiers: { label: string; bp: number }[] = [];
  for (const effect of effectsOf(def)) {
    const bp = readBp(effect);
    if (bp === null) continue;
    modifiers.push({ label: effect.kind, bp });
  }
  return {
    week: weekOf(state.turn),
    key,
    name: def ? def.name : 'Semaine ordinaire',
    text: def ? def.text : 'Rien de notable, sinon la pluie sur les ardoises.',
    growthBp: weekGrowthBp(key),
    modifiers,
  };
}
