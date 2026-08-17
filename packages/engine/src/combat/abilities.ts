/**
 * Capacités de créatures — toutes les variantes de `CreatureAbility`.
 *
 * Passives résolues ailleurs (indiquées pour mémoire) :
 *  `no_retaliation`, `no_retaliation_flank`, `pierce_defense`, `charge_bonus`,
 *  `range_penalty_immune`, `siege_bonus`, `terrain_bonus` → `damage.ts` ;
 *  `retaliations`, `morale_aura`, `heal_aura`, `cleanse` (aura) → `order.ts` ;
 *  `zone_of_control` → `move.ts` ; `resurrect_after_win` → `outcome.ts`.
 *
 * Ce module traite les capacités **actives** (`boulder`, `cleanse` volontaire,
 * `reveal_fortune`) et les effets **au contact** (`poison`, `slow_on_hit`,
 * `knockback`, `breath_line`, `stealth`).
 */

import type {
  CombatState,
  CombatUnit,
  CreatureAbility,
  GameEvent,
  GameState,
  HexCoord,
  RngState,
} from '../types.js';
import { cloneRng } from '../rng.js';
import { directionTo, hexDistance, hexEquals, inBounds, neighbor } from './hex.js';
import {
  COMBAT_TUNING,
  FX,
  abilityOf,
  addEffect,
  canStand,
  cleanseUnit,
  effectValue,
  enemiesOf,
  findEffect,
  hasAbility,
  hasEffect,
  removeEffect,
  unitAt,
  unitDef,
  unitLabel,
  unitsAdjacent,
} from './units.js';
import { applyDamage, damageForRoll, planDamage, rollFortune } from './damage.js';
import { pushLog } from './log.js';
import { damageFortification, fortificationAt, parseFortificationUid } from './siege.js';

/* ──────────────────────────── Description (UI) ──────────────────────────── */

/** Texte français d'une capacité, pour l'info-bulle de la fiche de pile. */
export function describeAbility(a: CreatureAbility): string {
  switch (a.kind) {
    case 'no_retaliation':
      return 'Frappe sans riposte : la cible ne rend jamais le coup.';
    case 'no_retaliation_flank':
      return 'Attaque de flanc ou de dos : la cible ne peut pas riposter.';
    case 'retaliations':
      return `Riposte jusqu'à ${a.count} fois par round.`;
    case 'charge_bonus':
      return `Charge : +${a.perHex} BP de dégâts par hexagone parcouru, jusqu'à +${a.max} BP.`;
    case 'knockback':
      return `Après une charge d'au moins ${a.minHexes} hexagones, repousse la cible d'un hexagone.`;
    case 'slow_on_hit':
      return `Ses coups alourdissent la cible (${Math.floor(a.bp / 100)} % d'entrave).`;
    case 'zone_of_control':
      return 'Zone de contrôle : arrête la première pile ennemie qui la traverse.';
    case 'pierce_defense':
      return `Ignore ${Math.floor(a.bp / 100)} % de la défense adverse.`;
    case 'morale_aura':
      return `Étendard : +${a.value} au moral de toute l'armée.`;
    case 'heal_aura':
      return `Soigne les alliés au contact de ${a.amount} points de vie par créature et par round.`;
    case 'cleanse':
      return 'Purifie les effets néfastes des alliés au contact.';
    case 'resurrect_after_win':
      return `Après une victoire, ${Math.floor(a.bp / 100)} % des pertes se relèvent.`;
    case 'reveal_fortune':
      return 'Annonce le prochain résultat de fortune de son armée.';
    case 'boulder':
      return `Lance ${a.uses} blocs de pierre par combat (${a.damage} points de dégâts par créature).`;
    case 'breath_line':
      return `Souffle sur une ligne de ${a.length} hexagones.`;
    case 'poison':
      return `Venin : la cible perd ${Math.floor(a.bp / 100)} % de ses points de vie pendant ${a.turns} rounds.`;
    case 'stealth':
      return 'Camouflage : difficile à prendre pour cible à distance.';
    case 'range_penalty_immune':
      return 'Aucune pénalité de tir à longue portée.';
    case 'siege_bonus':
      return `Machine de siège : +${a.bp} BP de dégâts contre les ouvrages.`;
    case 'terrain_bonus':
      return `Sur ${a.terrain} : +${a.attackBp} BP d'attaque, +${a.defenseBp} BP de défense.`;
    default:
      return 'Capacité inconnue.';
  }
}

/* ───────────────────────────── Capacité active ──────────────────────────── */

export type ActiveAbility =
  | Extract<CreatureAbility, { kind: 'boulder' }>
  | Extract<CreatureAbility, { kind: 'cleanse' }>
  | Extract<CreatureAbility, { kind: 'reveal_fortune' }>;

/** Capacité déclenchable par l'action `ability`, ou `null`. */
export function activeAbilityOf(unit: CombatUnit): ActiveAbility | null {
  const def = unitDef(unit);
  const boulder = abilityOf(def, 'boulder');
  if (boulder) return boulder;
  const cleanse = abilityOf(def, 'cleanse');
  if (cleanse) return cleanse;
  const reveal = abilityOf(def, 'reveal_fortune');
  if (reveal) return reveal;
  return null;
}

export interface AbilityCheck {
  ok: boolean;
  reason?: string;
}

/** La pile peut-elle utiliser sa capacité active maintenant ? */
export function canUseAbility(combat: CombatState, unit: CombatUnit): AbilityCheck {
  const ability = activeAbilityOf(unit);
  if (!ability) return { ok: false, reason: "Cette pile n'a pas de capacité active." };
  if (hasEffect(unit, FX.noAbility)) {
    return { ok: false, reason: 'Le flottement de la troupe bloque sa capacité ce tour-ci.' };
  }
  if (hasEffect(unit, FX.blind)) {
    return { ok: false, reason: 'La pile est aveuglée.' };
  }
  if (ability.kind === 'boulder') {
    const left = boulderUses(unit);
    if (left <= 0) return { ok: false, reason: 'Plus aucun bloc de pierre disponible.' };
  }
  return { ok: true };
}

/** Blocs de pierre restants (initialisés à la première consultation). */
export function boulderUses(unit: CombatUnit): number {
  const ability = abilityOf(unitDef(unit), 'boulder');
  if (!ability) return 0;
  const e = findEffect(unit, FX.boulder);
  if (!e) return ability.uses;
  return e.value;
}

function consumeBoulder(unit: CombatUnit): void {
  const left = boulderUses(unit) - 1;
  addEffect(unit, {
    id: FX.boulder,
    kind: 'buff',
    value: left < 0 ? 0 : left,
    turnsLeft: 0,
    source: 'Bloc de pierre',
  });
}

/**
 * Déclenche la capacité active. `target` est un uid de pile, un uid de
 * fortification (`F<col>_<row>`) ou un hexagone.
 */
export function useAbility(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  target: string | HexCoord | undefined,
  events: GameEvent[],
): { ok: boolean; error?: string } {
  const check = canUseAbility(combat, unit);
  if (!check.ok) return { ok: false, error: check.reason };
  const ability = activeAbilityOf(unit);
  if (!ability) return { ok: false, error: "Cette pile n'a pas de capacité active." };

  switch (ability.kind) {
    case 'boulder':
      return throwBoulder(state, combat, unit, target, events, ability.damage);
    case 'cleanse': {
      let purified = 0;
      for (const ally of combat.units) {
        if (!ally.alive || ally.side !== unit.side) continue;
        if (ally.uid !== unit.uid && !unitsAdjacent(unit, ally)) continue;
        purified += cleanseUnit(ally);
      }
      pushLog(
        combat,
        events,
        'capacite',
        purified > 0
          ? `${unitLabel(unit)} dissipe ${purified} ${purified > 1 ? 'effets néfastes' : 'effet néfaste'}.`
          : `${unitLabel(unit)} entonne la purification : rien à dissiper.`,
        { unite: unit.uid, effets: purified },
      );
      return { ok: true };
    }
    case 'reveal_fortune': {
      const bp = previewFortune(state, unit);
      pushLog(
        combat,
        events,
        'fortune',
        bp > 0
          ? `${unitLabel(unit)} annonce une fortune favorable pour le prochain coup.`
          : bp < 0
            ? `${unitLabel(unit)} annonce une fortune contraire pour le prochain coup.`
            : `${unitLabel(unit)} n'annonce aucun présage particulier.`,
        { unite: unit.uid, presage: bp },
      );
      return { ok: true };
    }
    default:
      return { ok: false, error: 'Capacité non prise en charge.' };
  }
}

function throwBoulder(
  state: GameState,
  combat: CombatState,
  unit: CombatUnit,
  target: string | HexCoord | undefined,
  events: GameEvent[],
  perCreature: number,
): { ok: boolean; error?: string } {
  if (target === undefined) return { ok: false, error: 'Aucune cible désignée pour le bloc.' };
  const damage = perCreature * unit.count;

  if (typeof target === 'string') {
    const fortHex = parseFortificationUid(target);
    if (fortHex) {
      const fort = fortificationAt(combat, fortHex);
      if (!fort || fort.state === 2) return { ok: false, error: 'Cet ouvrage est déjà à terre.' };
      const siege = abilityOf(unitDef(unit), 'siege_bonus');
      const total = siege ? Math.floor((damage * (10000 + siege.bp)) / 10000) : damage;
      consumeBoulder(unit);
      pushLog(combat, events, 'capacite', `${unitLabel(unit)} arrache un bloc et le lance.`, {
        unite: unit.uid,
        degats: total,
      });
      damageFortification(state, combat, fortHex, total, events);
      return { ok: true };
    }
    const victim = combat.units.find((u) => u.uid === target && u.alive);
    if (!victim) return { ok: false, error: 'Cible introuvable.' };
    if (victim.side === unit.side) return { ok: false, error: 'On ne vise pas ses propres rangs.' };
    consumeBoulder(unit);
    const res = applyDamage(victim, damage);
    pushLog(
      combat,
      events,
      'capacite',
      `Le bloc de pierre écrase ${unitLabel(victim)} : ${res.kills} ${res.kills > 1 ? 'pertes' : 'perte'}.`,
      { unite: unit.uid, cible: victim.uid, degats: damage, pertes: res.kills },
    );
    return { ok: true };
  }

  const victim = unitAt(combat, target, unit);
  if (!victim || victim.side === unit.side) {
    return { ok: false, error: 'Aucune cible valable sur cet hexagone.' };
  }
  consumeBoulder(unit);
  const res = applyDamage(victim, damage);
  pushLog(
    combat,
    events,
    'capacite',
    `Le bloc de pierre écrase ${unitLabel(victim)} : ${res.kills} ${res.kills > 1 ? 'pertes' : 'perte'}.`,
    { unite: unit.uid, cible: victim.uid, degats: damage, pertes: res.kills },
  );
  return { ok: true };
}

/**
 * Aperçu du prochain résultat de fortune, **sans consommer d'aléa**
 * (Chouette Oraculaire). Le générateur est cloné.
 */
export function previewFortune(state: GameState, unit: CombatUnit): number {
  const copy: RngState = cloneRng(state.rng);
  return rollFortune(copy, unit);
}

/* ───────────────────────── Effets déclenchés au coup ────────────────────── */

/**
 * Effets appliqués après un coup au contact réussi : venin, entrave,
 * refoulement. Retourne le nombre d'effets posés.
 */
export function applyOnHitEffects(
  state: GameState,
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
  events: GameEvent[],
  opts: { charged: number; retaliation: boolean },
): number {
  if (!target.alive) return 0;
  const def = unitDef(attacker);
  let applied = 0;

  const poison = abilityOf(def, 'poison');
  if (poison) {
    addEffect(target, {
      id: FX.poison,
      kind: 'debuff',
      stat: 'venin',
      value: poison.bp,
      turnsLeft: poison.turns,
      source: def.name,
    });
    pushLog(combat, events, 'capacite', `Le venin gagne ${unitLabel(target)}.`, {
      cible: target.uid,
      venin: poison.bp,
      rounds: poison.turns,
    });
    applied++;
  }

  const slow = abilityOf(def, 'slow_on_hit');
  if (slow) {
    addEffect(target, {
      id: FX.slow,
      kind: 'debuff',
      stat: 'speed',
      value: 0,
      turnsLeft: 2,
      source: def.name,
    });
    applied++;
  }

  const push = abilityOf(def, 'knockback');
  if (push && !opts.retaliation && opts.charged >= push.minHexes) {
    if (knockback(state, combat, attacker, target, events)) applied++;
  }

  return applied;
}

/**
 * Repousse une pile d'un hexagone dans l'axe de l'attaque.
 * Le Serment de Pierre offre l'immunité au **premier** déplacement forcé.
 */
export function knockback(
  state: GameState,
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
  events: GameEvent[],
): boolean {
  if (hasEffect(target, FX.oathShield)) {
    removeEffect(target, FX.oathShield);
    pushLog(
      combat,
      events,
      'capacite',
      `${unitLabel(target)} tient la ligne : le Serment de Pierre absorbe le choc.`,
      { cible: target.uid },
    );
    return false;
  }
  const dir = directionTo(attacker.at, target.at);
  const dest = neighbor(target.at, dir);
  if (!inBounds(dest)) return false;
  if (!canStand(combat, target, dest)) return false;
  target.at = dest;
  target.facing = (dir + 3) % 6;
  pushLog(combat, events, 'capacite', `${unitLabel(target)} est repoussée d'un hexagone.`, {
    cible: target.uid,
    colonne: dest.col,
    ligne: dest.row,
  });
  return true;
}

/**
 * Piles touchées par le souffle en ligne, hors cible principale.
 * La ligne prolonge l'axe attaquant → cible.
 */
export function breathTargets(
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
): CombatUnit[] {
  const ability = abilityOf(unitDef(attacker), 'breath_line');
  if (!ability) return [];
  const dir = directionTo(attacker.at, target.at);
  const out: CombatUnit[] = [];
  let cur = target.at;
  for (let i = 1; i < ability.length; i++) {
    cur = neighbor(cur, dir);
    if (!inBounds(cur)) break;
    const u = unitAt(combat, cur);
    if (!u || u.uid === attacker.uid || u.uid === target.uid) continue;
    if (u.side === attacker.side) continue;
    if (out.some((x) => x.uid === u.uid)) continue;
    out.push(u);
  }
  return out;
}

/** Applique le souffle aux piles situées derrière la cible (60 % des dégâts). */
export function applyBreath(
  state: GameState,
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
  roll: number,
  events: GameEvent[],
): void {
  const extra = breathTargets(combat, attacker, target);
  for (const victim of extra) {
    const plan = planDamage(combat, attacker, victim, { ranged: false, fromHex: attacker.at });
    const full = damageForRoll(plan, roll);
    const dmg = Math.floor((full * 6000) / 10000);
    const res = applyDamage(victim, dmg);
    pushLog(
      combat,
      events,
      'capacite',
      `Le souffle atteint ${unitLabel(victim)} : ${dmg} points, ${res.kills} ${res.kills > 1 ? 'pertes' : 'perte'}.`,
      { cible: victim.uid, degats: dmg, pertes: res.kills },
    );
  }
}

/* ──────────────────────────────── Camouflage ────────────────────────────── */

/**
 * Une pile camouflée ne peut être prise pour cible à distance qu'à courte
 * portée (Garde-Futaie, Roxane).
 */
export function canBeShotAt(combat: CombatState, shooter: CombatUnit, target: CombatUnit): boolean {
  if (!hasAbility(unitDef(target), 'stealth')) return true;
  return hexDistance(shooter.at, target.at) <= 6;
}

/* ──────────────────────────── Divers utilitaires ────────────────────────── */

/** Les piles adjacentes à `unit` sur lesquelles une capacité peut agir. */
export function abilityTargets(combat: CombatState, unit: CombatUnit): CombatUnit[] {
  const ability = activeAbilityOf(unit);
  if (!ability) return [];
  if (ability.kind === 'boulder') {
    return enemiesOf(combat, unit).filter((e) => !hexEquals(e.at, unit.at));
  }
  if (ability.kind === 'cleanse') {
    return combat.units.filter(
      (u) => u.alive && u.side === unit.side && (u.uid === unit.uid || unitsAdjacent(unit, u)),
    );
  }
  return [unit];
}

/** Valeur courante d'un compteur de capacité (pour l'affichage). */
export function abilityCounter(unit: CombatUnit, id: string): number {
  return effectValue(unit, id);
}

export { COMBAT_TUNING };
