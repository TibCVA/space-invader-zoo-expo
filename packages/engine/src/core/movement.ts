/**
 * Déplacement sur la carte d'aventure.
 *
 * Coût de terrain (brief §5), consommation des points de marche case par case,
 * mise à jour du brouillard à chaque pas et déclenchement des interactions en
 * arrivant sur un objet. Le héros s'arrête dès qu'une rencontre survient : le
 * reste du chemin est conservé pour le lendemain.
 */
import {
  TERRAIN_COST,
  type ArmyStack,
  type GameEvent,
  type GameState,
  type HeroInstance,
  type MapCoord,
  type MapObject,
  type PlayerId,
  type SkillEffect,
  type Terrain,
  type TownState,
  type WeatherKind,
  type WorldMap,
} from '../types.js';
import { DIAGONAL_DEN, DIAGONAL_NUM, WEATHER_FALLBACK, WEATHER_TERRAIN_PENALTY } from './constants.js';
import { combatModule, worldModule } from './registry.js';
import { revealFog } from './fog.js';
import {
  applyBp,
  areAdjacent,
  facingOf,
  isDiagonal,
  isPassableIndex,
  rawTerrainCost,
  regionAt,
  sameCoord,
  terrainAt,
} from './util.js';

/* ── Coût de terrain ────────────────────────────────────────────────────── */

/**
 * Coût en points de marche pour entrer dans `to` depuis `from`.
 * Les diagonales coûtent ×141/100. Retourne `Number.MAX_SAFE_INTEGER` si la
 * case est infranchissable.
 */
export function terrainCost(
  world: WorldMap,
  from: MapCoord,
  to: MapCoord,
  mods: SkillEffect[],
): number {
  if (to.col < 0 || to.row < 0 || to.col >= world.cols || to.row >= world.rows) {
    return Number.MAX_SAFE_INTEGER;
  }
  const index = to.row * world.cols + to.col;
  if (!isPassableIndex(world, index)) return Number.MAX_SAFE_INTEGER;

  let cost = rawTerrainCost(world, index);
  if (cost >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER;

  const terrain = terrainAt(world, to.col, to.row);
  for (const m of mods) {
    if (m.kind === 'terrain_cost_bp' && m.terrain === terrain) {
      cost = applyBp(cost, m.bp);
    }
  }
  if (cost < 1) cost = 1;

  if (isDiagonal(from, to)) {
    cost = Math.trunc((cost * DIAGONAL_NUM) / DIAGONAL_DEN);
  }
  return cost;
}

/** Modificateurs météo, délégués au module monde s'il est branché. */
export function weatherMods(w: WeatherKind): {
  moveBp: number;
  visionBp: number;
  rangedBp: number;
  flyBp: number;
  flankBp: number;
} {
  return worldModule().weatherModifiers(w);
}

/**
 * Coût réellement payé pour un pas : terrain, compétences, puis météo.
 * C'est cette fonction — et elle seule — qui sert à la fois au calcul de
 * chemin et à l'exécution du déplacement, afin que l'aperçu ne mente jamais.
 */
export function stepCost(
  world: WorldMap,
  state: GameState,
  from: MapCoord,
  to: MapCoord,
  mods: SkillEffect[],
): number {
  const base = terrainCost(world, from, to, mods);
  if (base >= Number.MAX_SAFE_INTEGER) return base;
  const weather = state.weather.current;
  const w = weatherMods(weather);
  let cost = applyBp(base, w.moveBp);
  const penalty = WEATHER_TERRAIN_PENALTY[weather];
  if (penalty && terrainAt(world, to.col, to.row) === penalty.terrain) {
    cost = applyBp(cost, penalty.bp);
  }
  return cost < 1 ? 1 : cost;
}

/** Coût météo de repli, utilisé si aucun module monde n'est branché. */
export function fallbackWeatherModifiers(w: WeatherKind): {
  moveBp: number;
  visionBp: number;
  rangedBp: number;
  flyBp: number;
  flankBp: number;
} {
  return WEATHER_FALLBACK[w] ?? WEATHER_FALLBACK.eclaircie;
}

/* ── Occupation des cases ───────────────────────────────────────────────── */

export function objectIndexAt(world: WorldMap, at: MapCoord): number {
  if (at.col < 0 || at.row < 0 || at.col >= world.cols || at.row >= world.rows) return -1;
  const v = world.objectAt[at.row * world.cols + at.col];
  return v === 0 ? -1 : v - 1;
}

/**
 * Objet de la partie présent sur une case. On passe toujours par
 * `state.objects` : `world.objects` n'est que le gabarit initial immuable.
 */
export function objectAtCell(state: GameState, world: WorldMap, at: MapCoord): MapObject | null {
  const i = objectIndexAt(world, at);
  if (i < 0) return null;
  const template = world.objects[i];
  if (!template) return null;
  return state.objects[template.uid] ?? template;
}

export function townAtCell(state: GameState, at: MapCoord): TownState | null {
  for (const uid of Object.keys(state.towns)) {
    const t = state.towns[uid];
    if (sameCoord(t.at, at)) return t;
  }
  return null;
}

export function heroAtCell(state: GameState, at: MapCoord, except?: string): HeroInstance | null {
  for (const uid of Object.keys(state.heroes)) {
    if (uid === except) continue;
    const h = state.heroes[uid];
    if (h.downUntilTurn > state.turn) continue;
    if (sameCoord(h.at, at)) return h;
  }
  return null;
}

/**
 * Vrai si la case est bloquée par l'empreinte d'un objet (hors case d'entrée).
 * Un héros ne traverse pas une cité ni un chaos rocheux aménagé.
 */
export function isFootprintBlocked(state: GameState, world: WorldMap, at: MapCoord): boolean {
  const obj = objectAtCell(state, world, at);
  if (!obj) return false;
  if (sameCoord(obj.entrance, at)) return false;
  return obj.kind !== 'ressource' && obj.kind !== 'borne';
}

/* ── Exécution du déplacement ───────────────────────────────────────────── */

export interface MoveOutcome {
  events: GameEvent[];
  steps: MapCoord[];
  costSpent: number;
  /** Message français expliquant l'arrêt, ou `null` si le chemin est achevé. */
  stopped: string | null;
  combatStarted: boolean;
}

interface MoveContext {
  vision: number;
  mods: SkillEffect[];
}

function stacksOf(army: (ArmyStack | null)[]): (ArmyStack | null)[] {
  return army.slice();
}

function guardArmy(obj: MapObject): (ArmyStack | null)[] {
  const out: (ArmyStack | null)[] = [null, null, null, null, null, null, null];
  const guard = obj.guard ?? [];
  for (let i = 0; i < guard.length && i < 7; i++) out[i] = { ...guard[i] };
  return out;
}

function armyIsEmpty(army: (ArmyStack | null)[]): boolean {
  for (const s of army) if (s && s.count > 0) return false;
  return true;
}

function startCombatWith(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  defender: {
    player: PlayerId | null;
    hero: string | null;
    town: string | null;
    army: (ArmyStack | null)[];
  },
  siege: boolean,
): GameEvent[] {
  const combat = combatModule().startCombat(state, {
    attacker: { player: hero.owner, hero: hero.uid, army: stacksOf(hero.army) },
    defender,
    terrain: terrainAt(world, hero.at.col, hero.at.row),
    region: regionAt(world, hero.at.col, hero.at.row),
    siege,
  });
  state.combat = combat;
  state.phase = 'combat';
  return [{ type: 'CombatStarted', combat: combat.id }];
}

/**
 * Fait avancer le héros le long du chemin, case par case.
 *
 * `path[i]` est la case atteinte au pas `i`, `costs[i]` le coût pour y entrer.
 * Le héros s'arrête au premier obstacle, à la première rencontre, ou lorsqu'il
 * n'a plus assez de points de marche ; le reliquat de chemin est mémorisé.
 */
export function executeMove(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  path: MapCoord[],
  costs: number[],
  ctx: MoveContext,
): MoveOutcome {
  const events: GameEvent[] = [];
  const steps: MapCoord[] = [];
  let costSpent = 0;
  let stopped: string | null = null;
  let combatStarted = false;
  let i = 0;

  for (; i < path.length; i++) {
    const next = path[i];
    const cost = costs[i];

    if (cost >= Number.MAX_SAFE_INTEGER) {
      stopped = 'Le chemin est coupé : la case suivante est infranchissable.';
      break;
    }
    if (hero.movement < cost) {
      stopped = 'Points de marche épuisés pour aujourd’hui.';
      break;
    }

    const blocker = heroAtCell(state, next, hero.uid);
    if (blocker && blocker.owner === hero.owner) {
      stopped = `Le passage est occupé par un héros allié (${blocker.uid}).`;
      break;
    }
    if (isFootprintBlocked(state, world, next) && !sameCoord(next, path[path.length - 1])) {
      stopped = 'Le chemin traverse une construction : contournez-la.';
      break;
    }

    // Le pas est payé, quelle que soit la suite.
    hero.movement -= cost;
    costSpent += cost;
    hero.facing = facingOf(hero.at, next);
    hero.at = { col: next.col, row: next.row };
    hero.inTown = null;
    steps.push({ col: next.col, row: next.row });

    const revealed = revealFog(state, world, hero.owner, hero.at, ctx.vision);
    if (revealed.length > 0) {
      events.push({ type: 'FogRevealed', player: hero.owner, cells: revealed });
    }

    // ── Rencontres ────────────────────────────────────────────────────────
    if (blocker && blocker.owner !== hero.owner) {
      events.push(
        ...startCombatWith(
          state,
          world,
          hero,
          {
            player: blocker.owner,
            hero: blocker.uid,
            town: null,
            army: stacksOf(blocker.army),
          },
          false,
        ),
      );
      combatStarted = true;
      stopped = `Rencontre avec un héros adverse.`;
      i++;
      break;
    }

    const town = townAtCell(state, next);
    if (town) {
      if (town.owner === hero.owner) {
        hero.inTown = town.uid;
        town.visitingHero = hero.uid;
        stopped = null;
        i++;
        break;
      }
      const defenders: (ArmyStack | null)[] = stacksOf(town.garrison);
      const gh = town.garrisonHero ? state.heroes[town.garrisonHero] : null;
      if (gh) {
        for (let s = 0; s < gh.army.length; s++) {
          if (defenders[s] === null || defenders[s] === undefined) defenders[s] = gh.army[s];
        }
      }
      if (armyIsEmpty(defenders)) {
        events.push(...captureTown(state, town, hero.owner));
        stopped = null;
        hero.inTown = town.uid;
        town.visitingHero = hero.uid;
        i++;
        break;
      }
      events.push(
        ...startCombatWith(
          state,
          world,
          hero,
          {
            player: town.owner,
            hero: town.garrisonHero,
            town: town.uid,
            army: defenders,
          },
          true,
        ),
      );
      combatStarted = true;
      stopped = `Siège de ${town.name}.`;
      i++;
      break;
    }

    const obj = objectAtCell(state, world, next);
    if (obj && sameCoord(obj.entrance, next)) {
      if (obj.guard && obj.guard.length > 0 && !armyIsEmpty(guardArmy(obj))) {
        events.push(
          ...startCombatWith(
            state,
            world,
            hero,
            { player: null, hero: null, town: null, army: guardArmy(obj) },
            false,
          ),
        );
        combatStarted = true;
        stopped = 'Une garde neutre barre le passage.';
        i++;
        break;
      }
      const visitEvents = worldModule().visitObject(state, world, hero, obj);
      events.push(...visitEvents);
      if (obj.kind !== 'ressource' && obj.kind !== 'borne' && obj.kind !== 'source') {
        stopped = null;
        i++;
        break;
      }
    }
  }

  hero.path = i < path.length ? path.slice(i).map((c) => ({ col: c.col, row: c.row })) : null;

  if (steps.length > 0) {
    events.unshift({ type: 'HeroMoved', hero: hero.uid, path: steps, costSpent });
  }
  if (stopped && steps.length === 0) {
    events.push({ type: 'HeroBlocked', hero: hero.uid, reason: stopped });
  }
  return { events, steps, costSpent, stopped, combatStarted };
}

/** Passe une cité sous une nouvelle bannière (capture sans combat). */
export function captureTown(state: GameState, town: TownState, by: PlayerId): GameEvent[] {
  const events: GameEvent[] = [];
  const previous = town.owner;
  if (previous && state.players[previous]) {
    const list = state.players[previous].towns;
    const at = list.indexOf(town.uid);
    if (at >= 0) list.splice(at, 1);
  }
  town.owner = by;
  town.builtThisTurn = true;
  town.garrisonHero = null;
  if (previous !== by) town.charter = null;
  const p = state.players[by];
  if (p && !p.towns.includes(town.uid)) {
    p.towns.push(town.uid);
    p.towns.sort();
  }
  events.push({ type: 'TownCaptured', town: town.uid, by });
  return events;
}

/** Terrain nommé sous un héros, utile aux modules de combat. */
export function terrainUnder(world: WorldMap, hero: HeroInstance): Terrain {
  return terrainAt(world, hero.at.col, hero.at.row);
}

/** Coût brut d'un terrain, exposé pour l'interface. */
export function baseTerrainCost(t: Terrain): number {
  return TERRAIN_COST[t];
}

export { areAdjacent };
