/**
 * IA tactique de combat.
 *
 * Principes :
 *  – évaluation de menace par pile (dégâts potentiels × valeur) ;
 *  – focalisation sur les tireurs et les soutiens ennemis ;
 *  – choix de la case d'attaque qui minimise la riposte (flanc, dos) ;
 *  – protection des piles fragiles (repli, écran) ;
 *  – sorts lancés seulement s'ils valent mieux que l'action de la pile ;
 *  – attente tactique plutôt que de s'exposer bêtement.
 *
 * Entièrement déterministe : aucune décision ne consulte le générateur
 * pseudo-aléatoire.
 */

import type {
  CombatAction,
  CombatState,
  CombatUnit,
  GameState,
  HexCoord,
} from '../types.js';
import { hexDistance, hexKey, keyToHex, neighbors } from './hex.js';
import {
  FX,
  canStand,
  effectiveSpeed,
  hasAbility,
  hasEffect,
  heroOfSide,
  livingUnits,
  unitDef,
  unitHexes,
  unitTotalHp,
  unitsAdjacent,
} from './units.js';
import { reachMap, fullPath, advanceAlong } from './move.js';
import { damageForRoll, killsFor, planDamage } from './damage.js';
import { activeUnit } from './order.js';
import { activeAbilityOf, boulderUses, canBeShotAt, canUseAbility } from './abilities.js';
import { suggestSpell } from './spells.js';
import {
  SIEGE_GATE_ROW,
  SIEGE_WALL_COL,
  fortificationAt,
  fortificationUid,
  isGateOpen,
} from './siege.js';

/* ───────────────────────────── Valeurs de base ──────────────────────────── */

/** Valeur stratégique d'une pile : puissance restante, tireurs surpondérés. */
export function unitPriority(combat: CombatState, unit: CombatUnit): number {
  const def = unitDef(unit);
  let value = unit.count * def.power;
  if (def.shooter && unit.shots > 0) value = Math.floor((value * 14000) / 10000);
  if (hasAbility(def, 'heal_aura')) value = Math.floor((value * 13000) / 10000);
  if (hasAbility(def, 'morale_aura')) value = Math.floor((value * 11500) / 10000);
  if (hasAbility(def, 'boulder')) value = Math.floor((value * 11000) / 10000);
  return value;
}

/** Dégâts moyens qu'une pile peut infliger à une autre, convertis en valeur. */
function damageValue(combat: CombatState, victim: CombatUnit, damage: number): number {
  const def = unitDef(victim);
  const total = unitTotalHp(victim);
  if (total <= 0) return 0;
  const capped = damage > total ? total : damage;
  const value = Math.floor((capped * def.power) / Math.max(1, def.hp));
  const res = killsFor(victim, damage);
  const bonus = res.wiped ? Math.floor((unitPriority(combat, victim) * 3000) / 10000) : 0;
  return value + bonus;
}

function averageDamage(
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
  opts: { ranged: boolean; fromHex?: HexCoord; retaliation?: boolean },
): { damage: number; retaliation: boolean } {
  const plan = planDamage(combat, attacker, target, {
    ranged: opts.ranged,
    fromHex: opts.fromHex ?? attacker.at,
    retaliation: opts.retaliation === true,
  });
  const lo = damageForRoll(plan, plan.rollMin);
  const hi = damageForRoll(plan, plan.rollMax);
  return { damage: (lo + hi) >> 1, retaliation: plan.retaliation };
}

/** Menace exercée par une pile : ce qu'elle peut infliger en un round. */
export function threatOf(combat: CombatState, unit: CombatUnit): number {
  const def = unitDef(unit);
  const avgRoll = (def.dmgMin + def.dmgMax) >> 1;
  return unit.count * Math.max(1, avgRoll) * Math.max(1, def.attack);
}

/** Exposition d'une case : menace ennemie capable de l'atteindre au prochain tour. */
function exposureAt(combat: CombatState, unit: CombatUnit, at: HexCoord): number {
  let total = 0;
  for (const e of livingUnits(combat, unit.side === 0 ? 1 : 0)) {
    const eDef = unitDef(e);
    const dist = hexDistance(e.at, at);
    if (eDef.shooter && e.shots > 0) {
      total += Math.floor(threatOf(combat, e) / 2);
      continue;
    }
    const reach = effectiveSpeed(combat, e) + 1;
    if (dist <= reach) total += threatOf(combat, e);
  }
  return total;
}

/** Fragilité : une pile lente, peu nombreuse et précieuse doit être protégée. */
function fragility(combat: CombatState, unit: CombatUnit): number {
  const def = unitDef(unit);
  let f = 10000;
  if (def.shooter) f += 6000;
  if (hasAbility(def, 'heal_aura')) f += 4000;
  const hp = unitTotalHp(unit);
  const start = unit.startCount * def.hp;
  if (start > 0 && hp * 3 < start) f += 3000;
  return f;
}

/* ─────────────────────────── Évaluation d'attaque ───────────────────────── */

interface AttackPlan {
  score: number;
  action: CombatAction;
}

function evaluateShots(
  combat: CombatState,
  unit: CombatUnit,
): AttackPlan | null {
  const def = unitDef(unit);
  if (!def.shooter || unit.shots <= 0) return null;
  if (hasEffect(unit, FX.blind)) return null;
  let best: AttackPlan | null = null;
  for (const enemy of livingUnits(combat, unit.side === 0 ? 1 : 0)) {
    if (!canBeShotAt(combat, unit, enemy)) continue;
    const { damage } = averageDamage(combat, unit, enemy, { ranged: true });
    if (damage <= 0) continue;
    const score =
      damageValue(combat, enemy, damage) +
      Math.floor((unitPriority(combat, enemy) * 1000) / 10000);
    if (!best || score > best.score) {
      best = { score, action: { kind: 'shoot', unit: unit.uid, target: enemy.uid } };
    }
  }
  return best;
}

function evaluateMelee(combat: CombatState, unit: CombatUnit): AttackPlan | null {
  if (hasEffect(unit, FX.blind)) return null;
  const map = reachMap(combat, unit);
  const myFrag = fragility(combat, unit);
  let best: AttackPlan | null = null;

  for (const enemy of livingUnits(combat, unit.side === 0 ? 1 : 0)) {
    const spots: HexCoord[] = [];
    if (unitsAdjacent(unit, enemy)) spots.push(unit.at);
    for (const th of unitHexes(enemy)) {
      for (const n of neighbors(th)) {
        const node = map.get(hexKey(n));
        if (!node) continue;
        if (!canStand(combat, unit, n)) continue;
        spots.push(n);
      }
    }
    for (const from of spots) {
      const cost = map.get(hexKey(from))?.cost ?? 0;
      const charge = cost;
      const plan = planDamage(combat, unit, enemy, {
        ranged: false,
        fromHex: from,
        chargeHexes: charge,
      });
      const lo = damageForRoll(plan, plan.rollMin);
      const hi = damageForRoll(plan, plan.rollMax);
      const dealt = (lo + hi) >> 1;
      let score = damageValue(combat, enemy, dealt);

      // Riposte attendue.
      if (plan.retaliation) {
        const res = killsFor(enemy, dealt);
        const survivors = enemy.count - res.kills;
        if (survivors > 0) {
          const back = averageDamage(combat, enemy, unit, {
            ranged: false,
            retaliation: true,
          });
          const scaled = Math.floor((back.damage * survivors) / Math.max(1, enemy.count));
          score -= Math.floor((damageValue(combat, unit, scaled) * myFrag) / 10000);
        }
      }

      // Exposition de la case choisie.
      score -= Math.floor((exposureAt(combat, unit, from) * myFrag) / 400000);

      // Priorité aux tireurs et aux soutiens.
      score += Math.floor((unitPriority(combat, enemy) * 800) / 10000);

      // À valeur égale, on préfère ne pas courir.
      score -= cost;

      const action: CombatAction =
        hexKey(from) === hexKey(unit.at)
          ? { kind: 'attack', unit: unit.uid, target: enemy.uid }
          : { kind: 'attack', unit: unit.uid, target: enemy.uid, from };
      if (!best || score > best.score) best = { score, action };
    }
  }
  return best;
}

function evaluateAbility(combat: CombatState, unit: CombatUnit): AttackPlan | null {
  const ability = activeAbilityOf(unit);
  if (!ability) return null;
  if (!canUseAbility(combat, unit).ok) return null;

  if (ability.kind === 'boulder') {
    if (boulderUses(unit) <= 0) return null;
    const damage = ability.damage * unit.count;
    let best: AttackPlan | null = null;
    for (const enemy of livingUnits(combat, unit.side === 0 ? 1 : 0)) {
      const score = damageValue(combat, enemy, damage);
      if (!best || score > best.score) {
        best = { score, action: { kind: 'ability', unit: unit.uid, target: enemy.uid } };
      }
    }
    // En siège, ouvrir la porte vaut mieux que grignoter une pile.
    if (combat.siege && unit.side === 0 && !isGateOpen(combat)) {
      const gate: HexCoord = { col: SIEGE_WALL_COL, row: SIEGE_GATE_ROW };
      const fort = fortificationAt(combat, gate);
      if (fort && fort.state !== 2) {
        const score = Math.floor((damage * 3) / 2);
        if (!best || score > best.score) {
          best = {
            score,
            action: { kind: 'ability', unit: unit.uid, target: fortificationUid(gate) },
          };
        }
      }
    }
    return best;
  }

  if (ability.kind === 'cleanse') {
    let afflicted = 0;
    for (const ally of livingUnits(combat, unit.side)) {
      if (ally.uid !== unit.uid && !unitsAdjacent(unit, ally)) continue;
      for (const e of ally.effects) {
        if (e.kind === 'debuff' || e.kind === 'root' || e.kind === 'blind') afflicted++;
      }
    }
    if (afflicted === 0) return null;
    return { score: afflicted * 220, action: { kind: 'ability', unit: unit.uid } };
  }

  // `reveal_fortune` : information pure, valeur faible mais non nulle.
  return { score: 25, action: { kind: 'ability', unit: unit.uid } };
}

/* ────────────────────────── Déplacement et repli ────────────────────────── */

function bestApproach(combat: CombatState, unit: CombatUnit): CombatAction | null {
  const enemies = livingUnits(combat, unit.side === 0 ? 1 : 0);
  if (enemies.length === 0) return null;

  // Cible prioritaire : valeur / distance.
  let target: CombatUnit | null = null;
  let bestPriority = -1;
  for (const e of enemies) {
    const dist = Math.max(1, hexDistance(unit.at, e.at));
    const score = Math.floor((unitPriority(combat, e) * 100) / dist);
    if (score > bestPriority) {
      bestPriority = score;
      target = e;
    }
  }
  if (!target) return null;

  const map = reachMap(combat, unit);
  const def = unitDef(unit);
  const frag = fragility(combat, unit);
  const kite = def.shooter && unit.shots > 0;

  let bestHex: HexCoord | null = null;
  let bestScore = -0x7fffffff;
  for (const key of map.keys()) {
    const at = keyToHex(key);
    if (key === hexKey(unit.at)) continue;
    if (!canStand(combat, unit, at)) continue;
    const dist = hexDistance(at, target.at);
    const exposure = exposureAt(combat, unit, at);
    let score = kite ? dist * 40 : -dist * 100;
    score -= Math.floor((exposure * frag) / 200000);
    if (score > bestScore) {
      bestScore = score;
      bestHex = at;
    }
  }

  if (!kite) {
    // Si aucune case ne rapproche vraiment, on suit le chemin complet.
    const path = fullPath(combat, unit, target.at);
    if (path && path.length > 1) {
      const step = advanceAlong(combat, unit, path.slice(0, path.length - 1));
      if (step) {
        const direct = hexDistance(step, target.at);
        const chosen = bestHex ? hexDistance(bestHex, target.at) : 0x7fffffff;
        if (direct < chosen) bestHex = step;
      }
    }
  }

  if (!bestHex) return null;
  if (hexDistance(bestHex, target.at) >= hexDistance(unit.at, target.at) && !kite) {
    return null;
  }
  return { kind: 'move', unit: unit.uid, to: bestHex };
}

/** Faut-il attendre plutôt que de s'avancer sous les coups ? */
function shouldWait(combat: CombatState, unit: CombatUnit): boolean {
  if (unit.hasWaited) return false;
  const def = unitDef(unit);
  if (def.shooter && unit.shots > 0) return false;
  const enemies = livingUnits(combat, unit.side === 0 ? 1 : 0);
  if (enemies.length === 0) return false;
  const speed = effectiveSpeed(combat, unit);
  let closing = false;
  for (const e of enemies) {
    const d = hexDistance(unit.at, e.at);
    if (d <= speed + 1) return false; // une cible est déjà accessible
    if (d <= speed + effectiveSpeed(combat, e) + 1) closing = true;
  }
  return closing;
}

/* ──────────────────────────── Choix final ───────────────────────────────── */

/**
 * Coup suivant recommandé pour la pile active. Déterministe : la même
 * situation produit toujours la même décision.
 */
export function chooseCombatAction(state: GameState, combat: CombatState): CombatAction {
  const unit = activeUnit(combat);
  if (!unit) return { kind: 'surrender' };

  // Sort du héros : seulement s'il vaut mieux que l'action de la pile.
  const shots = evaluateShots(combat, unit);
  const melee = evaluateMelee(combat, unit);
  const ability = evaluateAbility(combat, unit);

  let best: AttackPlan | null = null;
  for (const cand of [shots, melee, ability]) {
    if (cand && (!best || cand.score > best.score)) best = cand;
  }

  const hero = heroOfSide(state, combat, unit.side);
  if (hero) {
    const suggestion = suggestSpell(state, combat, unit.side);
    if (suggestion) {
      const threshold = best ? Math.floor((best.score * 12000) / 10000) : 0;
      if (suggestion.score > threshold) {
        return { kind: 'cast', spell: suggestion.spell, target: suggestion.target };
      }
    }
  }

  if (hasEffect(unit, FX.blind)) return { kind: 'defend', unit: unit.uid };

  if (best && best.score > 0) return best.action;

  // Siège : enfoncer la porte quand on ne peut rien faire d'autre.
  if (combat.siege && unit.side === 0 && !isGateOpen(combat)) {
    const gate: HexCoord = { col: SIEGE_WALL_COL, row: SIEGE_GATE_ROW };
    if (hexDistance(unit.at, gate) === 1) {
      return { kind: 'attack', unit: unit.uid, target: fortificationUid(gate) };
    }
  }

  if (shouldWait(combat, unit)) return { kind: 'wait', unit: unit.uid };

  const approach = bestApproach(combat, unit);
  if (approach) return approach;

  if (best) return best.action;
  return { kind: 'defend', unit: unit.uid };
}

/** Vrai si la pile dispose encore d'une action utile (aide à l'interface). */
export function hasUsefulAction(state: GameState, combat: CombatState, unit: CombatUnit): boolean {
  const shots = evaluateShots(combat, unit);
  if (shots && shots.score > 0) return true;
  const melee = evaluateMelee(combat, unit);
  return melee !== null && melee.score > 0;
}

/** Capacité active recommandée, pour l'info-bulle du bouton (interface). */
export function suggestAbility(combat: CombatState, unit: CombatUnit): CombatAction | null {
  const plan = evaluateAbility(combat, unit);
  return plan ? plan.action : null;
}

/** Menace totale d'un camp, utilisée par l'IA d'aventure. */
export function sideThreat(combat: CombatState, side: 0 | 1): number {
  let total = 0;
  for (const u of livingUnits(combat, side)) total += threatOf(combat, u);
  return total;
}
