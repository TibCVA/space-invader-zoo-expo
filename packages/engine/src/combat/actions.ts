/**
 * `applyCombatAction` — porte d'entrée unique des actions de combat :
 * déplacement, attaque, tir, attente, défense, capacité, sort, reddition.
 *
 * La fonction mute `state.combat` et retourne les événements produits.
 * Toute erreur est renvoyée en français, sans modifier l'état.
 */

import type {
  CombatAction,
  CombatState,
  CombatUnit,
  GameEvent,
  GameState,
  HexCoord,
} from '../types.js';
import { nextInt } from '../rng.js';
import { directionTo, hexDistance, hexEquals } from './hex.js';
import {
  COMBAT_TUNING,
  FX,
  abilityOf,
  addEffect,
  effectiveSpeed,
  findUnit,
  hasEffect,
  heroOfSide,
  livingUnits,
  removeEffect,
  unitDef,
  unitLabel,
  unitsAdjacent,
  updateOathFormations,
} from './units.js';
import { hexPath } from './move.js';
import {
  applyDamage,
  damageForRoll,
  planDamage,
  rollDamageDie,
  rollFortune,
  rollMorale,
} from './damage.js';
import {
  activeUnit,
  checkCombatEnd,
  endActivation,
  finishCombat,
  unitWaits,
} from './order.js';
import { applyBreath, applyOnHitEffects, canBeShotAt, useAbility } from './abilities.js';
import { castCombatSpell } from './spells.js';
import {
  damageFortification,
  fortificationAt,
  hazardAt,
  hazardDamage,
  parseFortificationUid,
} from './siege.js';
import { heroCombatBonuses } from './hero.js';
import { pushLog } from './log.js';

export interface CombatActionResult {
  events: GameEvent[];
  ok: boolean;
  error?: string;
}

const MORALE_CHECKED = 'sys:moral_teste';

/* ─────────────────────────────── Entrée ─────────────────────────────────── */

export function applyCombatAction(state: GameState, action: CombatAction): CombatActionResult {
  const events: GameEvent[] = [];
  const combat = state.combat;
  if (!combat) return { events, ok: false, error: 'Aucun combat en cours.' };
  if (combat.finished) return { events, ok: false, error: 'Le combat est déjà terminé.' };

  const active = activeUnit(combat);
  if (!active) return { events, ok: false, error: 'Aucune pile ne peut agir.' };

  if (action.kind === 'surrender') {
    return surrender(state, combat, active, events);
  }

  if (action.kind === 'cast') {
    return cast(state, combat, active, action.spell, action.target, events);
  }

  if (action.unit !== active.uid) {
    return { events, ok: false, error: "Ce n'est pas le tour de cette pile." };
  }

  checkNegativeMorale(state, combat, active, events);

  switch (action.kind) {
    case 'move':
      return doMove(state, combat, active, action.to, events);
    case 'attack':
      return doAttack(state, combat, active, action.target, action.from, events);
    case 'shoot':
      return doShoot(state, combat, active, action.target, events);
    case 'wait':
      return doWait(state, combat, active, events);
    case 'defend':
      return doDefend(state, combat, active, events);
    case 'ability':
      return doAbility(state, combat, active, action.target, events);
    default:
      return { events, ok: false, error: 'Action de combat inconnue.' };
  }
}

/* ────────────────────────────── Moral négatif ───────────────────────────── */

/**
 * Moral négatif : jamais de tour perdu. La pile flotte — elle perd de
 * l'initiative pour le round suivant et sa capacité active est bloquée.
 */
function checkNegativeMorale(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  events: GameEvent[],
): void {
  if (hasEffect(unit, MORALE_CHECKED)) return;
  addEffect(unit, {
    id: MORALE_CHECKED,
    kind: 'buff',
    value: 1,
    turnsLeft: 1,
    source: 'systeme',
  });
  if (unit.morale >= 0) return;
  if (rollMorale(state.rng, unit) !== 'flottement') return;
  addEffect(unit, {
    id: 'sys:flottement',
    kind: 'debuff',
    stat: 'initiative',
    value: -COMBAT_TUNING.moralePenaltyInitiative,
    turnsLeft: 2,
    source: 'Moral',
  });
  addEffect(unit, {
    id: FX.noAbility,
    kind: 'debuff',
    value: 1,
    turnsLeft: 1,
    source: 'Moral',
  });
  pushLog(
    combat,
    events,
    'moral',
    `${unitLabel(unit)} flotte : elle perd de l'initiative et ne peut pas user de sa capacité.`,
    { unite: unit.uid, moral: unit.morale },
  );
}

/* ───────────────────────── Fin d'activation et Élan ─────────────────────── */

/**
 * Termine l'activation. Moral positif : Élan — demi-mouvement supplémentaire
 * et attaque de base, une seule fois par pile et par round.
 */
function finishActivation(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  events: GameEvent[],
): void {
  if (combat.finished) return;
  if (unit.alive && unit.count > 0 && unit.morale > 0 && !hasEffect(unit, FX.elanUsed)) {
    if (rollMorale(state.rng, unit) === 'elan') {
      addEffect(unit, {
        id: FX.elanUsed,
        kind: 'buff',
        value: 1,
        turnsLeft: 0,
        source: 'Élan',
      });
      const half = Math.max(1, Math.ceil(effectiveSpeed(combat, unit) / 2));
      addEffect(unit, {
        id: FX.elan,
        kind: 'buff',
        value: half,
        turnsLeft: 0,
        source: 'Élan',
      });
      unit.hasMoved = false;
      unit.lastMoveDistance = 0;
      pushLog(
        combat,
        events,
        'moral',
        `Élan ! ${unitLabel(unit)} repart : ${half} ${half > 1 ? 'hexagones' : 'hexagone'} et une attaque.`,
        { unite: unit.uid, moral: unit.morale, mouvement: half },
      );
      return;
    }
  }
  endActivation(state, combat, events);
}

/* ──────────────────────────────── Déplacement ───────────────────────────── */

function doMove(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  to: HexCoord,
  events: GameEvent[],
): CombatActionResult {
  if (hexEquals(unit.at, to)) {
    return { events, ok: false, error: 'La pile est déjà sur cet hexagone.' };
  }
  const path = hexPath(combat, unit, to);
  if (!path || path.length < 2) {
    return { events, ok: false, error: 'Cet hexagone est hors de portée.' };
  }
  moveAlong(state, combat, unit, path, events);
  updateOathFormations(combat);
  if (checkCombatEnd(state, combat, events)) return { events, ok: true };
  finishActivation(state, combat, unit, events);
  return { events, ok: true };
}

/** Déplace réellement la pile le long d'un chemin déjà validé. */
function moveAlong(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  path: HexCoord[],
  events: GameEvent[],
): void {
  const dest = path[path.length - 1];
  const prev = path.length >= 2 ? path[path.length - 2] : unit.at;
  const distance = path.length - 1;
  unit.at = { col: dest.col, row: dest.row };
  unit.facing = directionTo(prev, dest);
  unit.lastMoveDistance = distance;
  unit.hasMoved = true;
  removeEffect(unit, FX.elan);

  pushLog(combat, events, 'info', `${unitLabel(unit)} se déplace.`, {
    unite: unit.uid,
    colonne: dest.col,
    ligne: dest.row,
    hexagones: distance,
  });

  // Fossé / haie vive : dégâts à la traversée (siège).
  let hazardHit = false;
  for (const step of path) {
    if (hexEquals(step, path[0])) continue;
    if (hazardAt(combat, step)) hazardHit = true;
  }
  if (hazardHit) {
    const dmg = hazardDamage(unit);
    if (dmg > 0) {
      const res = applyDamage(unit, dmg);
      pushLog(
        combat,
        events,
        'capacite',
        `${unitLabel(unit)} franchit le fossé et y laisse ${res.kills} ${res.kills > 1 ? 'créatures' : 'créature'}.`,
        { unite: unit.uid, degats: dmg, pertes: res.kills },
      );
    }
  }
}

/* ─────────────────────────────── Attaque ────────────────────────────────── */

function doAttack(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  targetUid: string,
  from: HexCoord | undefined,
  events: GameEvent[],
): CombatActionResult {
  if (hasEffect(unit, FX.blind)) {
    return { events, ok: false, error: 'La pile est aveuglée : elle ne peut pas attaquer.' };
  }

  // Cible = fortification ?
  const fortHex = parseFortificationUid(targetUid);
  if (fortHex) {
    return attackFortification(state, combat, unit, fortHex, from, events);
  }

  const target = findUnit(combat, targetUid);
  if (!target || !target.alive) return { events, ok: false, error: 'Cible introuvable.' };
  if (target.side === unit.side) {
    return { events, ok: false, error: 'On ne frappe pas ses propres bannières.' };
  }

  if (from && !hexEquals(from, unit.at)) {
    const path = hexPath(combat, unit, from);
    if (!path || path.length < 2) {
      return { events, ok: false, error: "Impossible d'atteindre cette position d'attaque." };
    }
    moveAlong(state, combat, unit, path, events);
    updateOathFormations(combat);
    if (!unit.alive) {
      if (!checkCombatEnd(state, combat, events)) endActivation(state, combat, events);
      return { events, ok: true };
    }
  }

  if (!unitsAdjacent(unit, target)) {
    return { events, ok: false, error: "La cible n'est pas au contact." };
  }

  resolveAttack(state, combat, unit, target, events, { ranged: false });
  updateOathFormations(combat);
  if (checkCombatEnd(state, combat, events)) return { events, ok: true };
  finishActivation(state, combat, unit, events);
  return { events, ok: true };
}

function attackFortification(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  hex: HexCoord,
  from: HexCoord | undefined,
  events: GameEvent[],
): CombatActionResult {
  const fort = fortificationAt(combat, hex);
  if (!fort || fort.state === 2) {
    return { events, ok: false, error: 'Cet ouvrage est déjà à terre.' };
  }
  if (from && !hexEquals(from, unit.at)) {
    const path = hexPath(combat, unit, from);
    if (!path || path.length < 2) {
      return { events, ok: false, error: "Impossible d'atteindre cette position d'attaque." };
    }
    moveAlong(state, combat, unit, path, events);
  }
  if (hexDistance(unit.at, hex) > 1) {
    return { events, ok: false, error: "L'ouvrage n'est pas à portée de bras." };
  }

  const def = unitDef(unit);
  const roll = nextInt(state.rng, def.dmgMin, def.dmgMax);
  const hero = heroOfSide(state, combat, unit.side);
  const bonuses = heroCombatBonuses(hero);
  const siege = abilityOf(def, 'siege_bonus');
  const bp = 10000 + (siege ? siege.bp : 0) + bonuses.siegeDamageBp;
  const damage = Math.floor((unit.count * roll * bp) / 10000);

  pushLog(combat, events, 'attaque', `${unitLabel(unit)} frappe l'ouvrage.`, {
    unite: unit.uid,
    degats: damage,
  });
  damageFortification(state, combat, hex, damage, events);
  finishActivation(state, combat, unit, events);
  return { events, ok: true };
}

/* ─────────────────────────────────── Tir ────────────────────────────────── */

function doShoot(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  targetUid: string,
  events: GameEvent[],
): CombatActionResult {
  const def = unitDef(unit);
  if (!def.shooter) return { events, ok: false, error: "Cette pile n'est pas une pile de tir." };
  if (unit.shots <= 0) return { events, ok: false, error: 'Plus aucune munition.' };
  if (hasEffect(unit, FX.blind)) {
    return { events, ok: false, error: 'La pile est aveuglée : elle ne peut pas tirer.' };
  }
  const target = findUnit(combat, targetUid);
  if (!target || !target.alive) return { events, ok: false, error: 'Cible introuvable.' };
  if (target.side === unit.side) {
    return { events, ok: false, error: 'On ne tire pas sur ses propres bannières.' };
  }
  if (!canBeShotAt(combat, unit, target)) {
    return { events, ok: false, error: 'La cible est trop bien camouflée pour être visée.' };
  }

  unit.shots--;
  unit.facing = directionTo(unit.at, target.at);
  resolveAttack(state, combat, unit, target, events, { ranged: true });
  if (checkCombatEnd(state, combat, events)) return { events, ok: true };
  finishActivation(state, combat, unit, events);
  return { events, ok: true };
}

/* ──────────────────────── Attente, défense, capacité ────────────────────── */

function doWait(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  events: GameEvent[],
): CombatActionResult {
  if (unit.hasWaited) {
    return { events, ok: false, error: 'Cette pile a déjà attendu ce round.' };
  }
  unitWaits(combat, unit);
  pushLog(combat, events, 'info', `${unitLabel(unit)} patiente.`, { unite: unit.uid });
  if (activeUnit(combat) === null) endActivation(state, combat, events);
  return { events, ok: true };
}

function doDefend(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  events: GameEvent[],
): CombatActionResult {
  unit.defending = true;
  pushLog(combat, events, 'info', `${unitLabel(unit)} se met en défense.`, { unite: unit.uid });
  endActivation(state, combat, events);
  return { events, ok: true };
}

function doAbility(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  target: HexCoord | string | undefined,
  events: GameEvent[],
): CombatActionResult {
  const res = useAbility(state, combat, unit, target, events);
  if (!res.ok) return { events, ok: false, error: res.error };
  updateOathFormations(combat);
  if (checkCombatEnd(state, combat, events)) return { events, ok: true };
  finishActivation(state, combat, unit, events);
  return { events, ok: true };
}

/* ─────────────────────────────────── Sort ───────────────────────────────── */

function cast(
  state: GameState,
  combat: CombatState,
  active: CombatUnit,
  spell: string,
  target: HexCoord | string | undefined,
  events: GameEvent[],
): CombatActionResult {
  const res = castCombatSpell(state, combat, active.side, spell, target, events);
  if (!res.ok) return { events, ok: false, error: res.error };
  updateOathFormations(combat);
  if (checkCombatEnd(state, combat, events)) return { events, ok: true };
  // Lancer un sort consomme l'activation de la pile en cours.
  endActivation(state, combat, events);
  return { events, ok: true };
}

/* ─────────────────────────────── Reddition ──────────────────────────────── */

function surrender(
  state: GameState,
  combat: CombatState,
  active: CombatUnit,
  events: GameEvent[],
): CombatActionResult {
  const loser = active.side;
  const winner: 0 | 1 = loser === 0 ? 1 : 0;
  pushLog(combat, events, 'info', 'Le camp demande grâce et se rend.', { camp: loser });
  finishCombat(state, combat, events, winner, 'Reddition acceptée.');
  return { events, ok: true };
}

/* ───────────────────────── Résolution d'une attaque ─────────────────────── */

export interface AttackOptions {
  ranged: boolean;
  retaliation?: boolean;
}

/**
 * Résout une attaque complète : fortune, jet de dégâts, pertes, souffle,
 * effets au contact, puis riposte éventuelle.
 */
export function resolveAttack(
  state: GameState,
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
  events: GameEvent[],
  opts: AttackOptions,
): number {
  const retaliation = opts.retaliation === true;
  if (!opts.ranged) attacker.facing = directionTo(attacker.at, target.at);

  const fortuneBp = rollFortune(state.rng, attacker);
  const plan = planDamage(combat, attacker, target, {
    ranged: opts.ranged,
    retaliation,
    fromHex: attacker.at,
    fortuneBp,
  });
  const roll = rollDamageDie(state.rng, plan);
  const damage = damageForRoll(plan, roll);

  if (fortuneBp !== 0) {
    pushLog(
      combat,
      events,
      'fortune',
      fortuneBp > 0
        ? `Fortune ! Le coup de ${unitLabel(attacker)} porte mieux que prévu.`
        : `Fortune contraire : le coup de ${unitLabel(attacker)} manque de force.`,
      { unite: attacker.uid, bp: fortuneBp },
    );
  }

  const before = target.count;
  const res = applyDamage(target, damage);
  const verb = opts.ranged ? 'tire sur' : retaliation ? 'riposte contre' : 'frappe';
  pushLog(
    combat,
    events,
    'attaque',
    `${unitLabel(attacker)} ${verb} ${labelBefore(target, before)} : ${damage} points, ${res.kills} ${res.kills > 1 ? 'pertes' : 'perte'}.`,
    {
      attaquant: attacker.uid,
      cible: target.uid,
      degats: damage,
      pertes: res.kills,
      angle: plan.angle,
    },
  );
  if (!target.alive) {
    pushLog(combat, events, 'mort', `${labelBefore(target, before)} est anéantie.`, {
      cible: target.uid,
    });
  }

  // Aveuglement dissipé par le coup reçu.
  if (hasEffect(target, FX.blind)) removeEffect(target, FX.blind);

  // Souffle en ligne (Vouivre Couronnée).
  if (!opts.ranged && !retaliation) {
    applyBreath(state, combat, attacker, target, roll, events);
  }

  // Venin, entrave, refoulement.
  applyOnHitEffects(state, combat, attacker, target, events, {
    charged: attacker.lastMoveDistance,
    retaliation,
  });

  // Riposte.
  if (!retaliation && plan.retaliation && target.alive && target.count > 0) {
    target.retaliationsLeft--;
    target.facing = directionTo(target.at, attacker.at);
    resolveAttack(state, combat, target, attacker, events, { ranged: false, retaliation: true });
  }

  attacker.lastMoveDistance = 0;
  return damage;
}

function labelBefore(unit: CombatUnit, count: number): string {
  const def = unitDef(unit);
  return `${count} ${count > 1 ? def.namePlural : def.name}`;
}

/* ───────────────────────────── Aide à l'affichage ───────────────────────── */

/** Piles ennemies encore vivantes, triées par emplacement (pour l'interface). */
export function targetsFor(combat: CombatState, unit: CombatUnit): CombatUnit[] {
  return livingUnits(combat, unit.side === 0 ? 1 : 0).sort((a, b) => a.slot - b.slot);
}
