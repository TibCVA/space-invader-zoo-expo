/**
 * File d'initiative, attente, tours et rounds.
 *
 * Un round = une activation par pile vivante, dans l'ordre d'initiative
 * décroissante. Une pile qui **attend** est retirée de la file et replacée en
 * queue, les attentes s'exécutant entre elles par initiative croissante.
 */

import type {
  ArmyStack,
  CombatState,
  CombatUnit,
  GameEvent,
  GameState,
} from '../types.js';
import {
  COMBAT_TUNING,
  FX,
  abilityOf,
  alliesOf,
  applyForestMemory,
  baseRetaliations,
  cleanseUnit,
  effectiveInitiative,
  findUnit,
  hasEffect,
  healStack,
  heroOfSide,
  livingUnits,
  removeEffect,
  sidePower,
  tickEffects,
  unitDef,
  unitLabel,
  unitsAdjacent,
  unitTotalHp,
  updateOathFormations,
} from './units.js';
import { heroCombatBonuses } from './hero.js';
import { pushLog } from './log.js';
import { siegeTowerVolley } from './siege.js';
import { tickMagicWalls } from './spells.js';

export { baseRetaliations } from './units.js';

/* ─────────────────────────── Moral et fortune ───────────────────────────── */

/**
 * Recalcule moral et fortune de chaque pile : héros, auras de moral alliées,
 * bornées à −3..+3.
 */
export function recomputeMoraleAndFortune(state: GameState, combat: CombatState): void {
  for (const side of [0, 1] as const) {
    const hero = heroOfSide(state, combat, side);
    const bonuses = heroCombatBonuses(hero);
    const units = livingUnits(combat, side);
    for (const unit of units) {
      let morale = bonuses.morale;
      let fortune = bonuses.fortune;
      for (const ally of alliesOf(combat, unit)) {
        const aura = abilityOf(unitDef(ally), 'morale_aura');
        if (aura) morale += aura.value;
      }
      const own = abilityOf(unitDef(unit), 'morale_aura');
      if (own) morale += own.value;
      // Les créatures des deux factions dans une même armée se supportent mal.
      const factions = new Set(units.map((u) => unitDef(u).faction));
      if (factions.size > 1) morale -= 1;
      unit.morale = morale > 3 ? 3 : morale < -3 ? -3 : morale;
      unit.fortune = fortune > 3 ? 3 : fortune < -3 ? -3 : fortune;
    }
  }
}

/* ───────────────────────── Construction de la file ──────────────────────── */

/**
 * Trie les piles vivantes par initiative décroissante. Départages successifs :
 * initiative, vitesse, camp (l'assaillant d'abord), emplacement — entièrement
 * déterministe, sans aléa.
 */
export function buildInitiativeOrder(combat: CombatState): void {
  const alive = livingUnits(combat);
  const waiting = alive.filter((u) => u.hasWaited);
  const ready = alive.filter((u) => !u.hasWaited);
  ready.sort((a, b) => compareInitiative(combat, a, b));
  waiting.sort((a, b) => -compareInitiative(combat, a, b));
  combat.order = [...ready.map((u) => u.uid), ...waiting.map((u) => u.uid)];
  if (combat.activeIndex >= combat.order.length) combat.activeIndex = 0;
}

function compareInitiative(combat: CombatState, a: CombatUnit, b: CombatUnit): number {
  const ia = effectiveInitiative(combat, a);
  const ib = effectiveInitiative(combat, b);
  if (ia !== ib) return ib - ia;
  if (a.speed !== b.speed) return b.speed - a.speed;
  if (a.side !== b.side) return a.side - b.side;
  return a.slot - b.slot;
}

/** Pile actuellement active, ou `null` si le combat est terminé. */
export function activeUnit(combat: CombatState): CombatUnit | null {
  if (combat.finished) return null;
  for (let i = combat.activeIndex; i < combat.order.length; i++) {
    const u = findUnit(combat, combat.order[i]);
    if (u && u.alive && u.count > 0) {
      combat.activeIndex = i;
      return u;
    }
  }
  return null;
}

/* ──────────────────────────────── Attente ───────────────────────────────── */

/**
 * La pile active attend : elle sort de la file et rejoint la queue, où les
 * piles en attente s'activent par initiative croissante.
 */
export function unitWaits(combat: CombatState, unit: CombatUnit): void {
  unit.hasWaited = true;
  const idx = combat.order.indexOf(unit.uid);
  if (idx >= 0) combat.order.splice(idx, 1);
  // Insertion dans la queue des attentes, initiative croissante.
  let insertAt = combat.order.length;
  for (let i = combat.activeIndex; i < combat.order.length; i++) {
    const other = findUnit(combat, combat.order[i]);
    if (!other || !other.hasWaited) continue;
    if (effectiveInitiative(combat, other) > effectiveInitiative(combat, unit)) {
      insertAt = i;
      break;
    }
  }
  combat.order.splice(insertAt, 0, unit.uid);
  if (idx >= 0 && idx < combat.activeIndex) combat.activeIndex--;
}

/* ────────────────────────────── Fin d'activation ────────────────────────── */

/** Passe à la pile suivante ; enchaîne sur un nouveau round si nécessaire. */
export function endActivation(state: GameState, combat: CombatState, events: GameEvent[]): void {
  if (combat.finished) return;
  const unit = activeUnit(combat);
  if (unit) {
    unit.hasMoved = true;
    removeEffect(unit, FX.elan);
  }
  combat.activeIndex++;
  if (activeUnit(combat) === null) beginRound(state, combat, events);
}

/* ─────────────────────────────── Rounds ─────────────────────────────────── */

/**
 * Ouvre un nouveau round : réinitialisation des piles, effets périodiques,
 * auras de soin, venin, tours de siège, puis file d'initiative.
 */
export function beginRound(state: GameState, combat: CombatState, events: GameEvent[]): void {
  if (combat.finished) return;
  combat.round++;
  combat.activeIndex = 0;

  if (combat.round > COMBAT_TUNING.maxRounds) {
    finishByAttrition(state, combat, events, 'Les deux armées se retirent, épuisées.');
    return;
  }

  for (const unit of combat.units) {
    if (!unit.alive) continue;
    unit.hasMoved = false;
    unit.hasWaited = false;
    unit.defending = false;
    unit.lastMoveDistance = 0;
    unit.retaliationsLeft = baseRetaliations(unit);
    removeEffect(unit, FX.elan);
    removeEffect(unit, FX.elanUsed);
    removeEffect(unit, FX.noAbility);
    tickEffects(unit);
  }

  tickMagicWalls(combat);
  applyPoison(state, combat, events);
  applyHealAuras(state, combat, events);
  updateOathFormations(combat);
  applyForestMemory(combat);
  recomputeMoraleAndFortune(state, combat);

  for (const key of Object.keys(combat.spellCastThisRound)) {
    combat.spellCastThisRound[key as keyof typeof combat.spellCastThisRound] = false;
  }

  if (combat.siege) siegeTowerVolley(state, combat, events);
  if (checkCombatEnd(state, combat, events)) return;

  buildInitiativeOrder(combat);
  pushLog(combat, events, 'info', `Round ${combat.round}.`, { round: combat.round });
}

/** Venin : perte de sang en début de round, sans jamais anéantir la pile. */
function applyPoison(state: GameState, combat: CombatState, events: GameEvent[]): void {
  for (const unit of livingUnits(combat)) {
    if (!hasEffect(unit, FX.poison)) continue;
    const bp = Math.abs(unit.effects.find((e) => e.id === FX.poison)?.value ?? 0);
    if (bp <= 0) continue;
    const total = unitTotalHp(unit);
    let dmg = Math.floor((total * bp) / 10000);
    if (dmg >= total) dmg = total - 1;
    if (dmg <= 0) continue;
    const hp = unitDef(unit).hp;
    let kills = 0;
    let remaining = dmg;
    if (remaining >= unit.topHp) {
      remaining -= unit.topHp;
      kills = 1 + Math.floor(remaining / hp);
      if (kills >= unit.count) kills = unit.count - 1;
      const rest = remaining - (kills - 1) * hp;
      unit.topHp = Math.max(1, hp - rest);
      unit.count -= kills;
    } else {
      unit.topHp -= remaining;
    }
    pushLog(
      combat,
      events,
      'capacite',
      kills > 0
        ? `Le venin ronge ${unitLabel(unit)} : ${kills} ${kills > 1 ? 'créatures succombent' : 'créature succombe'}.`
        : `Le venin ronge ${unitLabel(unit)}.`,
      { unite: unit.uid, degats: dmg, pertes: kills },
    );
  }
}

/** Aura de soin (Cerf des Sources) appliquée aux alliés au contact. */
function applyHealAuras(state: GameState, combat: CombatState, events: GameEvent[]): void {
  for (const healer of livingUnits(combat)) {
    const aura = abilityOf(unitDef(healer), 'heal_aura');
    if (!aura) continue;
    const amount = aura.amount * healer.count;
    for (const ally of alliesOf(combat, healer)) {
      if (!unitsAdjacent(healer, ally)) continue;
      const res = healStack(ally, amount, false);
      if (res.healed > 0) {
        pushLog(
          combat,
          events,
          'capacite',
          `${unitLabel(healer)} apaise ${unitLabel(ally)} (${res.healed} points de vie).`,
          { soigneur: healer.uid, cible: ally.uid, soin: res.healed },
        );
      }
    }
    const cleanser = abilityOf(unitDef(healer), 'cleanse');
    if (cleanser) {
      for (const ally of alliesOf(combat, healer)) {
        if (!unitsAdjacent(healer, ally)) continue;
        const removed = cleanseUnit(ally);
        if (removed > 0) {
          pushLog(
            combat,
            events,
            'capacite',
            `${unitLabel(healer)} purifie ${unitLabel(ally)}.`,
            { soigneur: healer.uid, cible: ally.uid, effets: removed },
          );
        }
      }
    }
  }
}

/* ──────────────────────────────── Fin du combat ─────────────────────────── */

export function survivorsOf(combat: CombatState, side: 0 | 1): ArmyStack[] {
  const out: ArmyStack[] = [];
  for (const u of combat.units) {
    if (u.side !== side) continue;
    if (!u.alive || u.count <= 0) continue;
    out.push({ creature: u.creature, count: u.count });
  }
  return out;
}

/** Termine le combat sur une victoire nette. */
export function finishCombat(
  state: GameState,
  combat: CombatState,
  events: GameEvent[],
  winner: 0 | 1,
  reason: string,
): void {
  if (combat.finished) return;
  combat.finished = true;
  combat.winner = winner;
  pushLog(combat, events, 'info', reason, { vainqueur: winner });
  events.push({
    type: 'CombatEnded',
    winner,
    survivorsA: survivorsOf(combat, 0),
    survivorsB: survivorsOf(combat, 1),
  });
}

/**
 * Termine un combat qui ne peut plus progresser (limite de rounds, camps hors
 * de portée l'un de l'autre) : le camp le plus puissant l'emporte, le
 * défenseur en cas d'égalité.
 */
export function finishByAttrition(
  state: GameState,
  combat: CombatState,
  events: GameEvent[],
  reason: string,
): void {
  const pa = sidePower(combat, 0);
  const pb = sidePower(combat, 1);
  const winner: 0 | 1 = pa > pb ? 0 : 1;
  finishCombat(state, combat, events, winner, reason);
}

/** Vérifie la disparition d'un camp. Retourne vrai si le combat est terminé. */
export function checkCombatEnd(
  state: GameState,
  combat: CombatState,
  events: GameEvent[],
): boolean {
  if (combat.finished) return true;
  const a = livingUnits(combat, 0).length;
  const b = livingUnits(combat, 1).length;
  if (a === 0 && b === 0) {
    finishCombat(state, combat, events, 1, 'Les deux armées sont anéanties.');
    return true;
  }
  if (a === 0) {
    finishCombat(state, combat, events, 1, "L'armée assaillante est anéantie.");
    return true;
  }
  if (b === 0) {
    finishCombat(state, combat, events, 0, "L'armée défenderesse est anéantie.");
    return true;
  }
  return false;
}
