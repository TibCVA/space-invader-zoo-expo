/**
 * Calendrier et rythme de la partie.
 *
 * `turn` est le **jour absolu** (1-based). Chaque joueur joue dans l'ordre de
 * `turnOrder` ; lorsque la ronde est bouclée, le jour avance et l'on applique,
 * dans cet ordre déterministe : météo, événement de semaine, croissance des
 * créatures, revenus, gabelle, entretien, réinitialisation des points de
 * marche, file de construction, puis contrôle de victoire.
 */
import {
  dayOf,
  weekOf,
  type GameEvent,
  type GameState,
  type PlayerId,
  type Resources,
  type WorldMap,
} from '../types.js';
import {
  ECLAIR_MOVEMENT_BP,
  JOURNAL_MAX,
  MANA_REGEN,
  MANA_REGEN_TOWN,
  MAX_UNREST,
  START_REVEAL_RADIUS,
} from './constants.js';
import { gameConfig } from './config.js';
import { content, worldModule } from './registry.js';
import { canBuild, playerIncomeOf, stablesBonus, upkeepOf, weeklyGrowth } from './economy.js';
import { applyBuildingGrants } from './economy.js';
import { recomputeVisibility, revealFog } from './fog.js';
import { weekEventGrowthBp } from './fallback-world.js';
import { applyBp, mergeDelta, RESOURCE_LABELS } from './util.js';
import { RESOURCE_KEYS } from '../types.js';

/* ── Journal ────────────────────────────────────────────────────────────── */

export function journal(
  state: GameState,
  player: PlayerId | null,
  text: string,
  kind = 'info',
): void {
  state.journal.push({ turn: state.turn, player, text, kind });
  if (state.journal.length > JOURNAL_MAX) {
    state.journal.splice(0, state.journal.length - JOURNAL_MAX);
  }
}

/** Recopie les `Notice` d'une liste d'événements dans le journal. */
export function journalFromEvents(state: GameState, events: GameEvent[]): void {
  for (const e of events) {
    if (e.type === 'Notice') journal(state, e.player, e.text, e.severity);
  }
}

/* ── Statistiques dérivées ──────────────────────────────────────────────── */

/** Portée de vue effective d'un héros, météo comprise. */
export function visionOf(state: GameState, heroUid: string): number {
  const hero = state.heroes[heroUid];
  if (!hero) return 0;
  const stats = worldModule().heroStats(state, hero);
  const bp = worldModule().weatherModifiers(state.weather.current).visionBp;
  return Math.max(2, applyBp(stats.vision, bp));
}

/** Points de marche du jour, écuries et durée de partie comprises. */
export function dailyMovement(state: GameState, heroUid: string): number {
  const hero = state.heroes[heroUid];
  if (!hero) return 0;
  const stats = worldModule().heroStats(state, hero);
  let movement = stats.movementMax;
  if (hero.inTown) {
    const town = state.towns[hero.inTown];
    if (town && town.owner === hero.owner) movement += stablesBonus(town);
  }
  if (gameConfig(state).duration === 'eclair') {
    movement = applyBp(movement, ECLAIR_MOVEMENT_BP);
  }
  return movement;
}

/* ── Début de tour ──────────────────────────────────────────────────────── */

export function startTurn(state: GameState, world: WorldMap): GameEvent[] {
  const events: GameEvent[] = [];
  const player = state.activePlayer;
  const p = state.players[player];
  if (!p) return events;

  const cells = recomputeVisibility(state, world, player, (uid) => visionOf(state, uid));
  if (cells.length > 0) events.push({ type: 'FogRevealed', player, cells });

  events.push({
    type: 'TurnStarted',
    player,
    turn: state.turn,
    day: dayOf(state.turn),
    week: weekOf(state.turn),
  });
  return events;
}

/* ── Fin de tour ────────────────────────────────────────────────────────── */

/** Prochain joueur vivant dans l'ordre du tour, ou `null` si la ronde s'achève. */
function nextAlive(state: GameState, from: PlayerId): { player: PlayerId | null; wrapped: boolean } {
  const order = state.turnOrder;
  const start = order.indexOf(from);
  if (start < 0) return { player: order[0] ?? null, wrapped: true };
  for (let step = 1; step <= order.length; step++) {
    const index = start + step;
    const wrapped = index >= order.length;
    const candidate = order[index % order.length];
    const p = state.players[candidate];
    if (p && p.alive) return { player: candidate, wrapped };
  }
  return { player: null, wrapped: true };
}

export function endTurn(state: GameState, world: WorldMap): GameEvent[] {
  const events: GameEvent[] = [];
  const player = state.activePlayer;
  events.push({ type: 'TurnEnded', player });

  const { player: next, wrapped } = nextAlive(state, player);
  if (!next) {
    return [...events, ...worldModule().checkVictory(state)];
  }

  if (wrapped) {
    events.push(...advanceDay(state, world));
    if (state.phase === 'termine') return events;
  }

  /*
   * `advanceDay` peut éteindre une maison — et rien n'empêche que ce soit
   * celle qui vient d'être désignée. La règle des sept jours sans cité tombe
   * au passage du jour, c'est-à-dire exactement entre le choix du suivant et
   * sa prise de main.
   *
   * Poser une bannière morte comme joueur actif fige la partie pour tout le
   * monde : `applyCommand` refuse alors toute commande — « Le joueur actif
   * n'est plus en lice » — y compris `EndTurn`, y compris celui qu'un harnais
   * force à sa place. Plus personne ne joue jamais. Mesuré à la taille d'une
   * XL de HMM3, où les conquêtes aboutissent plus vite : deux parties
   * enlisées sur quatre, aux tours 34 et 48.
   *
   * On reprend donc la recherche là où elle s'était arrêtée. Elle ne peut pas
   * repasser le jour une seconde fois : `next` était la première maison
   * vivante de la ronde, aucune ne la précède, et si plus rien ne suit c'est
   * que la chronique est close.
   */
  let suivant: PlayerId = next;
  for (let garde = 0; garde < state.turnOrder.length; garde++) {
    const maison = state.players[suivant];
    if (maison && maison.alive) break;
    const relais = nextAlive(state, suivant);
    if (!relais.player) return [...events, ...worldModule().checkVictory(state)];
    suivant = relais.player;
  }
  if (!state.players[suivant]?.alive) {
    return [...events, ...worldModule().checkVictory(state)];
  }

  state.activePlayer = suivant;
  events.push(...startTurn(state, world));
  return events;
}

/* ── Passage du jour ────────────────────────────────────────────────────── */

export function advanceDay(state: GameState, world: WorldMap): GameEvent[] {
  const events: GameEvent[] = [];
  state.turn += 1;

  // 1. Météo (annoncée deux jours à l'avance).
  events.push(...worldModule().advanceWeather(state));

  // 2. Nouvelle semaine : événement, puis croissance des demeures.
  let growthBp = 10000;
  if (dayOf(state.turn) === 1) {
    const weekEvents = worldModule().weeklyEvent(state);
    events.push(...weekEvents);
    const passed = weekEvents.find((e) => e.type === 'WeekPassed');
    const key = passed && passed.type === 'WeekPassed' ? passed.eventKey : null;
    growthBp = weekEventGrowthBp(key);
    events.push(...applyWeeklyGrowth(state, growthBp));
    refreshTaverns(state);
    events.push(...renouvelerLieux(state));
  }

  // 3. Revenus, gabelle, entretien.
  events.push(...applyIncome(state));

  // 4. Réinitialisation quotidienne.
  resetDaily(state, world, events);

  // 5. Files de construction.
  events.push(...processBuildQueues(state));

  // 6. Victoire.
  events.push(...worldModule().checkVictory(state));

  journalFromEvents(state, events);
  return events;
}

/**
 * Le renouveau hebdomadaire des lieux de la carte.
 *
 * Deux natures vivent au rythme des semaines, comme dans HMM3 :
 *  - la **demeure franche** engrange sa croissance — les recrues s'accumulent
 *    tant que personne ne vient les enrôler, c'est ce qui donne une raison de
 *    repasser ;
 *  - le **repaire** vidé se repeuple après son délai : sa garde revient et son
 *    butin avec, ce qui fait des banques une rente de bravoure, pas un
 *    ramassage unique.
 */
function renouvelerLieux(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const semaine = weekOf(state.turn);
  for (const uid of Object.keys(state.objects)) {
    const obj = state.objects[uid];
    if (obj.kind === 'demeure') {
      const creature = typeof obj.data.creature === 'string' ? obj.data.creature : null;
      const def = creature ? contentCreature(creature) : null;
      if (!def) continue;
      const stock = typeof obj.data.stock === 'number' ? obj.data.stock : 0;
      /* Plafond à quatre semaines de croissance : une demeure oubliée ne
         devient pas une armée gratuite qui attend le premier passant. */
      obj.data.stock = Math.min(stock + def.growth, def.growth * 4);
    } else if (obj.kind === 'banque' && obj.spent) {
      const reposeA = typeof obj.data.reposeA === 'number' ? obj.data.reposeA : Infinity;
      if (semaine >= reposeA) {
        obj.spent = false;
        delete obj.data.reposeA;
        const garde = obj.data.garde0;
        if (Array.isArray(garde)) {
          obj.guard = (garde as { creature: string; count: number }[]).map((g) => ({ ...g }));
        }
      }
    }
  }
  return events;
}

function contentCreature(id: string): { growth: number } | null {
  const def = content().CREATURES[id];
  return def ?? null;
}

/** Croissance hebdomadaire des demeures, jour 1 de chaque semaine. */
export function applyWeeklyGrowth(state: GameState, eventBp: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (const uid of Object.keys(state.towns).sort()) {
    const town = state.towns[uid];
    if (!town.owner) continue;
    const gains = weeklyGrowth(town, eventBp);
    const keys = Object.keys(gains).sort();
    if (keys.length === 0) continue;
    for (const creature of keys) {
      town.available[creature] = (town.available[creature] ?? 0) + gains[creature];
    }
    events.push({
      type: 'Notice',
      player: town.owner,
      text: `Nouvelle semaine à ${town.name} : les demeures livrent leurs recrues.`,
      severity: 'info',
    });
  }
  return events;
}

function refreshTaverns(state: GameState): void {
  for (const id of state.turnOrder) {
    const p = state.players[id];
    if (!p || !p.alive) continue;
    p.tavernOffers = [];
  }
}

/** Revenus, gabelle et entretien de chaque joueur vivant. */
export function applyIncome(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const gabelle = worldModule().gabelleIncome(state);
  const treasurer = maisonTresorHolder(state);

  for (const id of state.turnOrder) {
    const p = state.players[id];
    if (!p || !p.alive) continue;

    const delta: Partial<Resources> = {};
    mergeDelta(delta, playerIncomeOf(state, id));

    if (treasurer === id) {
      mergeDelta(delta, { ecus: gabelle.ecus, sel: gabelle.sel });
    }

    const upkeep = upkeepOf(state, id);
    if (upkeep > 0) mergeDelta(delta, { ecus: -upkeep });

    let shortfall = 0;
    for (const k of RESOURCE_KEYS) {
      const d = delta[k];
      if (!d) continue;
      const before = p.resources[k] | 0;
      const value = before + d;
      if (value < 0) {
        shortfall += -value;
        p.resources[k] = 0;
        delta[k] = -before;
      } else {
        p.resources[k] = value;
      }
    }

    if (Object.keys(delta).length > 0) {
      events.push({ type: 'ResourcesChanged', player: id, delta, reason: 'revenu quotidien' });
    }
    if (shortfall > 0) {
      events.push({
        type: 'Notice',
        player: id,
        text: `Le trésor est vide : l’entretien des troupes n’est pas payé (${shortfall} ${RESOURCE_LABELS.ecus} manquants). L’agitation monte.`,
        severity: 'warn',
      });
      for (const uid of p.towns) {
        const town = state.towns[uid];
        if (town) town.unrest = Math.min(MAX_UNREST, town.unrest + 3);
      }
    }

    // Agitation liée à la gabelle, pour le détenteur de la Maison du Trésor.
    if (treasurer === id && gabelle.unrest !== 0) {
      for (const uid of p.towns) {
        const town = state.towns[uid];
        if (!town) continue;
        town.unrest = Math.max(0, Math.min(MAX_UNREST, town.unrest + gabelle.unrest));
      }
    }
  }
  return events;
}

function maisonTresorHolder(state: GameState): PlayerId | null {
  for (const uid of Object.keys(state.objects).sort()) {
    const obj = state.objects[uid];
    if (obj.kind === 'maison_tresor') return obj.owner;
  }
  return null;
}

/** Points de marche, mana, drapeaux de construction et retours de héros. */
function resetDaily(state: GameState, world: WorldMap, events: GameEvent[]): void {
  for (const uid of Object.keys(state.towns).sort()) {
    const town = state.towns[uid];
    town.builtThisTurn = false;
    if (town.unrest > 0 && town.charter === 'spirituelle') {
      town.unrest = Math.max(0, town.unrest - 2);
    } else if (town.unrest > 0) {
      town.unrest = Math.max(0, town.unrest - 1);
    }
  }

  for (const uid of Object.keys(state.heroes).sort()) {
    const hero = state.heroes[uid];
    if (hero.downUntilTurn > state.turn) {
      hero.movement = 0;
      continue;
    }
    if (hero.downUntilTurn === state.turn) {
      hero.downUntilTurn = 0;
      events.push({
        type: 'Notice',
        player: hero.owner,
        text: `${content().HEROES[hero.def]?.name ?? uid} reprend du service.`,
        severity: 'info',
      });
    }
    const stats = worldModule().heroStats(state, hero);
    hero.movementMax = stats.movementMax;
    hero.manaMax = stats.manaMax;
    hero.movement = dailyMovement(state, uid);

    let regen = MANA_REGEN;
    if (hero.inTown) {
      const town = state.towns[hero.inTown];
      if (town && town.owner === hero.owner) regen = MANA_REGEN_TOWN;
    }
    for (const e of worldModule().activeEffects(state, hero)) {
      if (e.kind === 'mana_regen') regen += e.value;
    }
    hero.mana = Math.min(hero.manaMax, hero.mana + regen);

    const cells = revealFog(state, world, hero.owner, hero.at, visionOf(state, uid));
    if (cells.length > 0) events.push({ type: 'FogRevealed', player: hero.owner, cells });
  }
}

/** Une construction par cité et par jour, prise dans la file du joueur. */
export function processBuildQueues(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  for (const id of state.turnOrder) {
    const p = state.players[id];
    if (!p || !p.alive || p.buildQueue.length === 0) continue;
    const remaining: { town: string; building: string }[] = [];
    const usedTowns = new Set<string>();

    for (const entry of p.buildQueue) {
      const town = state.towns[entry.town];
      if (!town || town.owner !== id) continue;
      if (usedTowns.has(entry.town)) {
        remaining.push(entry);
        continue;
      }
      const verdict = canBuild(state, town, entry.building);
      if (!verdict.ok) {
        if (town.built.includes(entry.building)) continue;
        remaining.push(entry);
        continue;
      }
      const def = content().BUILDINGS[entry.building];
      const cost = def ? def.cost : {};
      for (const k of RESOURCE_KEYS) {
        const c = cost[k];
        if (c) p.resources[k] = Math.max(0, (p.resources[k] | 0) - c);
      }
      town.built.push(entry.building);
      town.built.sort();
      town.builtThisTurn = true;
      applyBuildingGrants(town, entry.building);
      usedTowns.add(entry.town);
      events.push({ type: 'BuildingBuilt', town: town.uid, building: entry.building });
      events.push({
        type: 'Notice',
        player: id,
        text: `${def ? def.name : entry.building} s’élève à ${town.name}.`,
        severity: 'info',
      });
    }
    p.buildQueue = remaining;
  }
  return events;
}

/** Révélation initiale, utilisée par `createGame`. */
export function initialReveal(state: GameState, world: WorldMap): void {
  for (const id of state.turnOrder) {
    const p = state.players[id];
    if (!p) continue;
    for (const uid of p.towns) {
      const town = state.towns[uid];
      if (town) revealFog(state, world, id, town.at, START_REVEAL_RADIUS);
    }
    for (const uid of p.heroes) {
      const hero = state.heroes[uid];
      if (hero) revealFog(state, world, id, hero.at, visionOf(state, uid));
    }
  }
}
