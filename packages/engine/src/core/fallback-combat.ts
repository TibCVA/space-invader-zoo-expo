/**
 * Module « combat » de secours.
 *
 * `packages/engine/src/combat` (grille hexagonale 15 × 11, initiative, moral,
 * fortune, sorts, sièges) est écrit par un autre agent. Le noyau doit pourtant
 * pouvoir conclure une rencontre : ce module fournit une résolution
 * automatique déterministe, fidèle à la **formule de dégâts autoritaire** du
 * brief (§3), et applique correctement le résultat au monde (pertes, XP,
 * capture, butin).
 *
 * Il est intégralement remplacé par `linkEngineModules({ combat })`.
 */
import {
  HEX_COLS,
  HEX_ROWS,
  type ArmyStack,
  type CombatAction,
  type CombatLogEntry,
  type CombatState,
  type CombatUnit,
  type CreatureDef,
  type GameEvent,
  type GameState,
  type HeroUid,
  type HexCoord,
  type PlayerId,
  type RegionId,
  type Resources,
  type Terrain,
  type TownUid,
} from '../types.js';
import { nextInt } from '../rng.js';
import { HERO_DOWN_DAYS } from './constants.js';
import { content, worldModule, type CombatModulePack } from './registry.js';
import { mergeDelta } from './util.js';

/* ── Construction ───────────────────────────────────────────────────────── */

function defOf(id: string): CreatureDef | null {
  return content().CREATURES[id] ?? null;
}

function buildUnits(army: (ArmyStack | null)[], side: 0 | 1): CombatUnit[] {
  const units: CombatUnit[] = [];
  let placed = 0;
  for (let slot = 0; slot < army.length; slot++) {
    const stack = army[slot];
    if (!stack || stack.count <= 0) continue;
    const def = defOf(stack.creature);
    if (!def) continue;
    const row = Math.min(HEX_ROWS - 1, 1 + placed * 2);
    units.push({
      uid: `U${side}_${slot}`,
      side,
      slot,
      creature: stack.creature,
      count: stack.count,
      startCount: stack.count,
      topHp: def.hp,
      at: { col: side === 0 ? 0 : HEX_COLS - 1, row },
      facing: side === 0 ? 2 : 6,
      attack: def.attack,
      defense: def.defense,
      speed: def.speed,
      initiative: def.initiative,
      shots: def.shots ?? 0,
      morale: 0,
      fortune: 0,
      hasMoved: false,
      hasWaited: false,
      retaliationsLeft: 1,
      defending: false,
      effects: [],
      alive: true,
      lastMoveDistance: 0,
    });
    placed++;
  }
  return units;
}

function orderOf(units: CombatUnit[]): string[] {
  return units
    .filter((u) => u.alive)
    .slice()
    .sort((a, b) => b.initiative - a.initiative || (a.uid < b.uid ? -1 : 1))
    .map((u) => u.uid);
}

export function startCombat(
  state: GameState,
  params: {
    attacker: { player: PlayerId; hero: HeroUid | null; army: (ArmyStack | null)[] };
    defender: {
      player: PlayerId | null;
      hero: HeroUid | null;
      town: TownUid | null;
      army: (ArmyStack | null)[];
    };
    terrain: Terrain;
    region: RegionId;
    siege: boolean;
  },
): CombatState {
  const units = [...buildUnits(params.attacker.army, 0), ...buildUnits(params.defender.army, 1)];
  const spellCastThisRound = {} as Record<PlayerId, boolean>;
  for (const id of state.turnOrder) spellCastThisRound[id] = false;

  return {
    id: `C${state.turn}_${params.attacker.hero ?? 'x'}_${params.defender.town ?? params.defender.hero ?? 'neutre'}`,
    attacker: { player: params.attacker.player, hero: params.attacker.hero },
    defender: {
      player: params.defender.player,
      hero: params.defender.hero,
      town: params.defender.town,
    },
    units,
    obstacles: [],
    terrain: params.terrain,
    region: params.region,
    weather: state.weather.current,
    siege: params.siege,
    round: 1,
    order: orderOf(units),
    activeIndex: 0,
    spellCastThisRound,
    log: [],
    finished: units.length === 0,
    winner: null,
  };
}

/* ── Formule de dégâts (brief §3) ───────────────────────────────────────── */

/**
 * Le repli n'a **aucune notion d'orientation ni de charge**, et il faut le dire.
 *
 * Le contrat (`registry.ts`) porte `fromHex` et `chargeHexes` depuis que
 * l'aperçu d'assaut se calcule depuis la case d'approche et non depuis la case
 * courante. Cette formule-ci, elle, ne connaît que l'attaque, la défense et la
 * posture : pas de flanc, pas de dos, pas d'élan. Elle accepte donc les deux
 * paramètres et les IGNORE, sciemment.
 *
 * Les nommer `_fromHex` et `_chargeHexes` n'est pas une coquetterie : c'est ce
 * qui distingue « ce repli ne sait pas faire » de « quelqu'un a oublié de les
 * brancher ». Le repli ne sert que lorsque `@auvergne/game` n'a pas relié les
 * vrais modules ; s'il devient un jour le chemin normal, cette limite doit être
 * levée avant, pas découverte après.
 */
export function damageRange(
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
  ranged: boolean,
  _fromHex?: unknown,
  _chargeHexes?: number,
): {
  min: number;
  max: number;
  kills: [number, number];
  retaliation: boolean;
  modifiers: { label: string; bp: number }[];
} {
  const def = defOf(attacker.creature);
  const targetDef = defOf(target.creature);
  if (!def || !targetDef) {
    return { min: 0, max: 0, kills: [0, 0], retaliation: false, modifiers: [] };
  }
  const mult = Math.max(3500, Math.min(30000, 10000 + 450 * (attacker.attack - target.defense)));
  const modifiers: { label: string; bp: number }[] = [
    { label: 'attaque contre défense', bp: mult },
  ];
  let abilityBp = 10000;
  if (target.defending) {
    abilityBp = Math.trunc((abilityBp * 8500) / 10000);
    modifiers.push({ label: 'cible en défense', bp: 8500 });
  }
  if (ranged) modifiers.push({ label: 'tir', bp: 10000 });

  const min = Math.floor((attacker.count * def.dmgMin * mult * abilityBp) / 10000 / 10000);
  const max = Math.floor((attacker.count * def.dmgMax * mult * abilityBp) / 10000 / 10000);
  const hp = Math.max(1, targetDef.hp);
  return {
    min,
    max,
    kills: [Math.floor(min / hp), Math.floor(max / hp)],
    retaliation: target.alive && target.retaliationsLeft > 0 && !ranged,
    modifiers,
  };
}

function strike(
  state: GameState,
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
): CombatLogEntry {
  const def = defOf(attacker.creature);
  const targetDef = defOf(target.creature);
  if (!def || !targetDef) {
    return { round: combat.round, text: 'Coup sans effet.', kind: 'info' };
  }
  const roll = nextInt(state.rng, def.dmgMin, def.dmgMax);
  const mult = Math.max(3500, Math.min(30000, 10000 + 450 * (attacker.attack - target.defense)));
  const abilityBp = target.defending ? 8500 : 10000;
  const damage = Math.floor((attacker.count * roll * mult * abilityBp) / 10000 / 10000);

  const hp = Math.max(1, targetDef.hp);
  let pool = (target.count - 1) * hp + target.topHp;
  pool -= damage;
  let killed: number;
  if (pool <= 0) {
    killed = target.count;
    target.count = 0;
    target.topHp = 0;
    target.alive = false;
  } else {
    const remaining = Math.ceil(pool / hp);
    killed = target.count - remaining;
    target.count = remaining;
    target.topHp = pool - (remaining - 1) * hp;
  }

  return {
    round: combat.round,
    text: `${def.namePlural} frappent ${targetDef.namePlural} : ${damage} dégâts, ${killed} perte(s).`,
    kind: killed >= 1 ? 'mort' : 'attaque',
    detail: { degats: damage, pertes: killed },
  };
}

/* ── Résolution automatique ─────────────────────────────────────────────── */

function sideAlive(combat: CombatState, side: 0 | 1): CombatUnit[] {
  return combat.units.filter((u) => u.side === side && u.alive && u.count > 0);
}

function pickTarget(combat: CombatState, unit: CombatUnit): CombatUnit | null {
  const enemies = sideAlive(combat, unit.side === 0 ? 1 : 0);
  if (enemies.length === 0) return null;
  // Cible la pile dont la puissance restante est la plus forte : déterministe.
  let best = enemies[0];
  let bestValue = -1;
  for (const e of enemies) {
    const def = defOf(e.creature);
    const value = def ? def.power * e.count : 0;
    if (value > bestValue || (value === bestValue && e.uid < best.uid)) {
      bestValue = value;
      best = e;
    }
  }
  return best;
}

export function autoResolve(state: GameState): GameEvent[] {
  const combat = state.combat;
  if (!combat || combat.finished) return [];
  const events: GameEvent[] = [];

  while (!combat.finished && combat.round <= 80) {
    combat.order = orderOf(combat.units);
    for (const uid of combat.order) {
      const unit = combat.units.find((u) => u.uid === uid);
      if (!unit || !unit.alive || unit.count <= 0) continue;
      const target = pickTarget(combat, unit);
      if (!target) break;
      const entry = strike(state, combat, unit, target);
      combat.log.push(entry);
      events.push({ type: 'CombatAction', entry });
      if (target.alive && target.retaliationsLeft > 0) {
        target.retaliationsLeft--;
        const back = strike(state, combat, target, unit);
        back.text = 'Riposte — ' + back.text;
        combat.log.push(back);
        events.push({ type: 'CombatAction', entry: back });
      }
      if (sideAlive(combat, 0).length === 0 || sideAlive(combat, 1).length === 0) break;
    }
    for (const u of combat.units) u.retaliationsLeft = 1;
    combat.round++;
    if (sideAlive(combat, 0).length === 0 || sideAlive(combat, 1).length === 0) {
      combat.finished = true;
    }
  }

  if (!combat.finished) combat.finished = true;
  const attackerLeft = sideAlive(combat, 0);
  const defenderLeft = sideAlive(combat, 1);
  combat.winner = attackerLeft.length > 0 && defenderLeft.length === 0 ? 0 : defenderLeft.length > 0 ? 1 : 1;

  events.push({
    type: 'CombatEnded',
    winner: combat.winner,
    survivorsA: attackerLeft.map((u) => ({ creature: u.creature, count: u.count })),
    survivorsB: defenderLeft.map((u) => ({ creature: u.creature, count: u.count })),
  });
  return events;
}

export function chooseCombatAction(state: GameState, combat: CombatState): CombatAction {
  void state;
  const active = combat.units.find((u) => u.alive && u.count > 0);
  if (!active) return { kind: 'surrender' };
  const target = pickTarget(combat, active);
  if (!target) return { kind: 'defend', unit: active.uid };
  return { kind: 'attack', unit: active.uid, target: target.uid };
}

export function applyCombatAction(
  state: GameState,
  action: CombatAction,
): { events: GameEvent[]; ok: boolean; error?: string } {
  const combat = state.combat;
  if (!combat) return { events: [], ok: false, error: 'Aucun combat en cours.' };
  if (combat.finished) return { events: [], ok: false, error: 'Le combat est déjà terminé.' };

  if (action.kind === 'surrender') {
    combat.finished = true;
    combat.winner = 1;
    return { events: autoResolveTail(combat), ok: true };
  }
  if (action.kind === 'attack' || action.kind === 'shoot') {
    const unit = combat.units.find((u) => u.uid === action.unit);
    const target = combat.units.find((u) => u.uid === action.target);
    if (!unit || !unit.alive) return { events: [], ok: false, error: 'Pile introuvable ou hors combat.' };
    if (!target || !target.alive) return { events: [], ok: false, error: 'Cible introuvable.' };
    const entry = strike(state, combat, unit, target);
    combat.log.push(entry);
    const events: GameEvent[] = [{ type: 'CombatAction', entry }];
    if (sideAlive(combat, 0).length === 0 || sideAlive(combat, 1).length === 0) {
      combat.finished = true;
      combat.winner = sideAlive(combat, 0).length > 0 ? 0 : 1;
      events.push(...autoResolveTail(combat));
    }
    return { events, ok: true };
  }
  if (action.kind === 'defend') {
    const unit = combat.units.find((u) => u.uid === action.unit);
    if (!unit) return { events: [], ok: false, error: 'Pile introuvable.' };
    unit.defending = true;
    return { events: [], ok: true };
  }
  if (action.kind === 'wait') {
    const unit = combat.units.find((u) => u.uid === action.unit);
    if (!unit) return { events: [], ok: false, error: 'Pile introuvable.' };
    unit.hasWaited = true;
    return { events: [], ok: true };
  }
  if (action.kind === 'move') {
    const unit = combat.units.find((u) => u.uid === action.unit);
    if (!unit) return { events: [], ok: false, error: 'Pile introuvable.' };
    unit.at = { col: action.to.col, row: action.to.row };
    unit.hasMoved = true;
    return { events: [], ok: true };
  }
  return { events: [], ok: false, error: 'Action de combat non prise en charge par le noyau.' };
}

function autoResolveTail(combat: CombatState): GameEvent[] {
  return [
    {
      type: 'CombatEnded',
      winner: combat.winner ?? 1,
      survivorsA: sideAlive(combat, 0).map((u) => ({ creature: u.creature, count: u.count })),
      survivorsB: sideAlive(combat, 1).map((u) => ({ creature: u.creature, count: u.count })),
    },
  ];
}

/* ── Application du résultat au monde ───────────────────────────────────── */

function writeBack(units: CombatUnit[], side: 0 | 1, army: (ArmyStack | null)[]): void {
  for (let i = 0; i < army.length; i++) army[i] = null;
  for (const u of units) {
    if (u.side !== side) continue;
    if (!u.alive || u.count <= 0) continue;
    army[u.slot] = { creature: u.creature, count: u.count };
  }
}

function powerOf(units: CombatUnit[], side: 0 | 1): number {
  let total = 0;
  for (const u of units) {
    if (u.side !== side) continue;
    const def = defOf(u.creature);
    if (def) total += def.power * u.startCount;
  }
  return total;
}

export function resolveCombatOutcome(state: GameState): GameEvent[] {
  const combat = state.combat;
  if (!combat || !combat.finished) return [];
  const events: GameEvent[] = [];
  const worldMod = worldModule();

  const attackerHero = combat.attacker.hero ? state.heroes[combat.attacker.hero] : null;
  const defenderHero = combat.defender.hero ? state.heroes[combat.defender.hero] : null;
  const town = combat.defender.town ? state.towns[combat.defender.town] : null;

  if (attackerHero) writeBack(combat.units, 0, attackerHero.army);
  if (defenderHero) {
    writeBack(combat.units, 1, defenderHero.army);
  } else if (town) {
    writeBack(combat.units, 1, town.garrison);
  }

  // Garde neutre : on met à jour l'objet situé sous le héros attaquant.
  if (!defenderHero && !town && attackerHero) {
    for (const uid of Object.keys(state.objects).sort()) {
      const obj = state.objects[uid];
      if (obj.at.col !== attackerHero.at.col || obj.at.row !== attackerHero.at.row) continue;
      if (!obj.guard) continue;
      const survivors: ArmyStack[] = [];
      for (const u of combat.units) {
        if (u.side === 1 && u.alive && u.count > 0) {
          survivors.push({ creature: u.creature, count: u.count });
        }
      }
      obj.guard = survivors;
      break;
    }
  }

  const attackerWon = combat.winner === 0;

  if (attackerWon) {
    const xp = Math.max(10, Math.trunc(powerOf(combat.units, 1) / 8));
    if (attackerHero) events.push(...worldMod.grantXp(state, attackerHero, xp));
    const loot: Partial<Resources> = {};
    mergeDelta(loot, { ecus: Math.trunc(powerOf(combat.units, 1) / 4) });
    combat.loot = { resources: loot, artifacts: [], xp };
    if (attackerHero && loot.ecus) {
      const p = state.players[attackerHero.owner];
      if (p) p.resources.ecus += loot.ecus;
      events.push({
        type: 'ResourcesChanged',
        player: attackerHero.owner,
        delta: loot,
        reason: 'butin',
      });
    }
    if (defenderHero) events.push(...defeatHero(state, defenderHero.uid));
    if (town && attackerHero) events.push(...captureAfterSiege(state, town.uid, attackerHero.owner));
  } else {
    const xp = Math.max(10, Math.trunc(powerOf(combat.units, 0) / 8));
    if (defenderHero) events.push(...worldMod.grantXp(state, defenderHero, xp));
    if (attackerHero) events.push(...defeatHero(state, attackerHero.uid));
  }

  state.combat = null;
  state.phase = state.phase === 'termine' ? 'termine' : 'aventure';
  return events;
}

function captureAfterSiege(state: GameState, townUid: TownUid, by: PlayerId): GameEvent[] {
  const town = state.towns[townUid];
  if (!town) return [];
  const previous = town.owner;
  if (previous && state.players[previous]) {
    const list = state.players[previous].towns;
    const at = list.indexOf(townUid);
    if (at >= 0) list.splice(at, 1);
  }
  town.owner = by;
  town.charter = null;
  town.builtThisTurn = true;
  town.garrisonHero = null;
  const p = state.players[by];
  if (p && !p.towns.includes(townUid)) {
    p.towns.push(townUid);
    p.towns.sort();
  }
  return [{ type: 'TownCaptured', town: townUid, by }];
}

/** Un héros vaincu perd son armée et redevient disponible après deux jours. */
export function defeatHero(state: GameState, uid: HeroUid): GameEvent[] {
  const hero = state.heroes[uid];
  if (!hero) return [];
  for (let i = 0; i < hero.army.length; i++) hero.army[i] = null;
  hero.path = null;
  hero.movement = 0;
  hero.downUntilTurn = state.turn + HERO_DOWN_DAYS;
  hero.inTown = null;

  const p = state.players[hero.owner];
  if (p && p.towns.length > 0) {
    const home = state.towns[p.towns[0]];
    if (home) hero.at = { col: home.at.col, row: home.at.row };
  }
  return [
    {
      type: 'Notice',
      player: hero.owner,
      text: `${content().HEROES[hero.def]?.name ?? uid} est vaincu : il sera indisponible ${HERO_DOWN_DAYS} jours.`,
      severity: 'danger',
    },
  ];
}

/* ── Divers ─────────────────────────────────────────────────────────────── */

export function reachableHexes(combat: CombatState, unit: CombatUnit): HexCoord[] {
  const out: HexCoord[] = [];
  for (let row = 0; row < HEX_ROWS; row++) {
    for (let col = 0; col < HEX_COLS; col++) {
      const d = Math.abs(col - unit.at.col) + Math.abs(row - unit.at.row);
      if (d > 0 && d <= unit.speed) out.push({ col, row });
    }
  }
  void combat;
  return out;
}

export function hexPath(combat: CombatState, unit: CombatUnit, to: HexCoord): HexCoord[] | null {
  void combat;
  const path: HexCoord[] = [];
  let col = unit.at.col;
  let row = unit.at.row;
  let guard = 0;
  while ((col !== to.col || row !== to.row) && guard++ < 64) {
    if (col < to.col) col++;
    else if (col > to.col) col--;
    else if (row < to.row) row++;
    else row--;
    path.push({ col, row });
  }
  return path.length === 0 ? null : path;
}

export function stackPower(army: (ArmyStack | null)[]): number {
  let total = 0;
  for (const s of army) {
    if (!s) continue;
    const def = defOf(s.creature);
    if (def) total += def.power * s.count;
  }
  return total;
}

export function fallbackCombatModule(): CombatModulePack {
  return {
    startCombat,
    applyCombatAction,
    autoResolve,
    chooseCombatAction,
    resolveCombatOutcome,
    damageRange,
    reachableHexes,
    hexPath,
    stackPower,
  };
}
