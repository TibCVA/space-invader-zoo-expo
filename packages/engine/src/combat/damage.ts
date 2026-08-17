/**
 * Formule de dégâts officielle (brief §3), ripostes, moral, fortune.
 *
 * ```
 * base   = nombre × entierUniforme(dmgMin, dmgMax)
 * mult   = borne(10000 + 450 × (attaque − défense), 3500, 30000)
 * final  = plancher(base × mult × modificateurs / 10000 / 10000)
 * ```
 *
 * `modificateurs` regroupe capacités, terrain, météo, angle, charge, tir et
 * fortune. Chaque contribution est exposée en clair (`label` + `bp`) pour que
 * l'interface puisse tout justifier **avant** l'attaque.
 *
 * Aucun flottant. Aucun `Math.random` : les tirages passent par `rng.ts`.
 */

import type {
  CombatState,
  CombatUnit,
  CreatureDef,
  HexCoord,
  RngState,
} from '../types.js';
import { nextChance, nextInt } from '../rng.js';
import { attackAngle, hexDistance, hexLine, type AttackAngle } from './hex.js';
import {
  COMBAT_TUNING,
  FX,
  abilityOf,
  baseDefense,
  effectiveAttack,
  effectiveDefense,
  hasAbility,
  hasEffect,
  hexBlocksSight,
  unitDef,
  unitHexes,
  unitMaxHp,
} from './units.js';

export interface DamageModifier {
  label: string;
  bp: number;
}

export interface DamageOptions {
  /** attaque à distance */
  ranged?: boolean;
  /** l'attaque est une riposte */
  retaliation?: boolean;
  /** case d'où part l'attaque (par défaut la position actuelle) */
  fromHex?: HexCoord;
  /** hexagones parcourus avant de frapper (charge) */
  chargeHexes?: number;
  /** résultat de fortune déjà tiré, en BP (borné à ±3000) */
  fortuneBp?: number;
  /** l'attaque vise une fortification (siège) */
  versusWall?: boolean;
}

export interface DamagePlan {
  /** multiplicateur attaque/défense, en BP */
  mult: number;
  /** modificateurs cumulés, en BP (10000 = neutre) */
  modsBp: number;
  /** détail affichable */
  modifiers: DamageModifier[];
  /** dégâts unitaires minimum et maximum d'une créature */
  rollMin: number;
  rollMax: number;
  /** nombre de créatures qui frappent */
  count: number;
  /** riposte attendue */
  retaliation: boolean;
  angle: AttackAngle;
}

/* ───────────────────────────── Formule brute ────────────────────────────── */

export function clampInt(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** `borne(10000 + 450 × (attaque − défense), 3500, 30000)`. */
export function attackDefenseMult(attack: number, defense: number): number {
  return clampInt(
    10000 + COMBAT_TUNING.attackDefenseSlopeBp * (attack - defense),
    COMBAT_TUNING.attackDefenseMinBp,
    COMBAT_TUNING.attackDefenseMaxBp,
  );
}

/**
 * `plancher(base × mult × mods / 10000 / 10000)`, en arithmétique sûre :
 * au-delà de 2^40 on divise en deux temps pour rester exact.
 */
export function applyFormula(base: number, mult: number, modsBp: number): number {
  if (base <= 0) return 0;
  const product = base * mult;
  if (product <= 1099511627776) {
    return Math.floor((product * modsBp) / 100000000);
  }
  return Math.floor((Math.floor(product / 10000) * modsBp) / 10000);
}

/* ─────────────────────────── Analyse d'une attaque ──────────────────────── */

function isShooterBlocked(combat: CombatState, attacker: CombatUnit): boolean {
  for (const u of combat.units) {
    if (!u.alive || u.side === attacker.side) continue;
    for (const a of unitHexes(attacker)) {
      for (const b of unitHexes(u)) {
        if (hexDistance(a, b) === 1) return true;
      }
    }
  }
  return false;
}

/** Nombre d'obstacles bloquant la vue entre deux cases (extrémités exclues). */
export function sightObstacles(combat: CombatState, from: HexCoord, to: HexCoord): number {
  const line = hexLine(from, to);
  let n = 0;
  for (let i = 1; i < line.length - 1; i++) {
    if (hexBlocksSight(combat, line[i])) n++;
  }
  return n;
}

/** La cible peut-elle riposter à cette attaque ? */
export function canRetaliate(
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
  ranged: boolean,
  fromHex: HexCoord,
): boolean {
  if (ranged) return false;
  if (!target.alive || target.count <= 0) return false;
  if (target.retaliationsLeft <= 0) return false;
  if (hasEffect(target, FX.blind)) return false;
  const def = unitDef(attacker);
  if (hasAbility(def, 'no_retaliation')) return false;
  if (hasAbility(def, 'no_retaliation_flank')) {
    const angle = attackAngle(target.at, target.facing, fromHex);
    if (angle !== 'face') return false;
  }
  return true;
}

/**
 * Construit le plan de dégâts complet : multiplicateur, modificateurs détaillés
 * et riposte attendue. Fonction pure, sans tirage aléatoire.
 */
export function planDamage(
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
  opts: DamageOptions = {},
): DamagePlan {
  const ranged = opts.ranged === true;
  const retaliation = opts.retaliation === true;
  const fromHex = opts.fromHex ?? attacker.at;
  const aDef = unitDef(attacker);
  const tDef = unitDef(target);
  const modifiers: DamageModifier[] = [];

  /* --- multiplicateur attaque / défense, décomposé --- */
  const atk = effectiveAttack(combat, attacker);
  const defRaw = baseDefense(combat, target);
  const defWithStance = effectiveDefense(combat, target);
  const pierce = abilityOf(aDef, 'pierce_defense');
  const defFinal = pierce
    ? Math.max(0, defWithStance - Math.floor((defWithStance * pierce.bp) / 10000))
    : defWithStance;

  const multRaw = attackDefenseMult(atk, defRaw);
  const multStance = attackDefenseMult(atk, defWithStance);
  const multFinal = attackDefenseMult(atk, defFinal);

  modifiers.push({
    label: `Attaque ${atk} contre défense ${defRaw}`,
    bp: multRaw - 10000,
  });
  if (multStance !== multRaw) {
    modifiers.push({ label: 'Cible en posture de défense', bp: multStance - multRaw });
  }
  if (multFinal !== multStance && pierce) {
    modifiers.push({
      label: `Perforation d'armure (${Math.floor(pierce.bp / 100)} %)`,
      bp: multFinal - multStance,
    });
  }

  /* --- modificateurs additifs (capacités, terrain, météo, angle…) --- */
  let mods = 10000;
  const add = (label: string, bp: number): void => {
    if (bp === 0) return;
    mods += bp;
    modifiers.push({ label, bp });
  };
  const note = (label: string): void => {
    modifiers.push({ label, bp: 0 });
  };

  const angle: AttackAngle = ranged
    ? 'face'
    : attackAngle(target.at, target.facing, fromHex);

  if (!ranged && !opts.versusWall) {
    if (angle === 'flanc') {
      let bp = COMBAT_TUNING.flankBp;
      if (hasEffect(attacker, FX.mist)) bp += COMBAT_TUNING.mistFlankBp;
      add('Attaque de flanc', bp);
    } else if (angle === 'dos') {
      let bp = COMBAT_TUNING.rearBp;
      if (hasEffect(attacker, FX.mist)) bp += COMBAT_TUNING.mistFlankBp;
      add('Attaque dans le dos', bp);
    }
  }

  if (!ranged) {
    const charge = abilityOf(aDef, 'charge_bonus');
    const hexes = opts.chargeHexes ?? attacker.lastMoveDistance;
    if (charge && hexes > 0) {
      const bp = Math.min(charge.max, charge.perHex * hexes);
      add(`Charge sur ${hexes} hexagones`, bp);
    }
  }

  if (ranged) {
    const immune = hasAbility(aDef, 'range_penalty_immune');
    if (isShooterBlocked(combat, attacker)) {
      add('Tir gêné au corps à corps', COMBAT_TUNING.rangedMeleePenaltyBp);
    }
    const dist = hexDistance(fromHex, target.at);
    if (!immune && dist >= COMBAT_TUNING.rangedFarDistance) {
      add(`Tir à longue portée (${dist} hexagones)`, COMBAT_TUNING.rangedFarPenaltyBp);
    } else if (immune && dist >= COMBAT_TUNING.rangedFarDistance) {
      note('Portée maîtrisée : aucune pénalité de distance');
    }
    const blockers = sightObstacles(combat, fromHex, target.at);
    if (blockers > 0) {
      add(
        blockers > 1 ? `${blockers} obstacles sur la trajectoire` : 'Obstacle sur la trajectoire',
        COMBAT_TUNING.rangedObstacleBp * (blockers > 2 ? 2 : blockers),
      );
    }
    switch (combat.weather) {
      case 'pluie':
        add('Pluie : cordes détendues', COMBAT_TUNING.weatherRainRangedBp);
        break;
      case 'brume':
        add('Brume : cible mal distinguée', COMBAT_TUNING.weatherMistRangedBp);
        break;
      case 'vent':
        add('Vent des crêtes : tir dévié', COMBAT_TUNING.weatherWindRangedBp);
        break;
      default:
        break;
    }
    if (hasEffect(attacker, FX.height)) {
      add('Mémoire de la Forêt : tir en surplomb', COMBAT_TUNING.heightRangedBp);
    }
    if (combat.siege && attacker.side === 0 && !opts.versusWall) {
      add('Siège : tir par-dessus le rempart', COMBAT_TUNING.siegeRangedPenaltyBp);
    }
  }

  /* --- terrain du champ de bataille --- */
  const terrainAbility = abilityOf(aDef, 'terrain_bonus');
  if (terrainAbility && terrainAbility.terrain === combat.terrain && terrainAbility.attackBp > 0) {
    add(`Terrain favorable (${combat.terrain})`, terrainAbility.attackBp);
  }
  if (hasEffect(attacker, FX.forest)) {
    add('Mémoire de la Forêt : futaie', COMBAT_TUNING.forestAttackBp);
  }
  if (hasEffect(target, FX.forest) && ranged) {
    add('Cible camouflée sous la futaie', -COMBAT_TUNING.forestDefenseBp);
  }
  if (hasAbility(tDef, 'stealth') && ranged) {
    add('Cible camouflée', -COMBAT_TUNING.forestDefenseBp);
  }

  /* --- riposte et Serment de Pierre --- */
  if (retaliation) {
    note('Riposte');
    if (hasEffect(attacker, FX.oath)) {
      add('Serment de Pierre : riposte affermie', COMBAT_TUNING.oathRetaliationBp);
    }
  }

  /* --- sièges --- */
  if (opts.versusWall) {
    const siege = abilityOf(aDef, 'siege_bonus');
    if (siege) add('Machine de siège', siege.bp);
  }

  /* --- protections et altérations sur la cible --- */
  const shield = hasEffect(target, FX.shield) ? -Math.abs(shieldBp(target)) : 0;
  if (shield !== 0) add('Protection magique', shield);
  if (hasEffect(attacker, FX.poison)) note('Pile empoisonnée : elle perd du sang à chaque round');

  /* --- fortune --- */
  if (opts.fortuneBp !== undefined && opts.fortuneBp !== 0) {
    const bp = clampInt(opts.fortuneBp, -COMBAT_TUNING.fortuneBp, COMBAT_TUNING.fortuneBp);
    add(bp > 0 ? 'Fortune favorable' : 'Fortune contraire', bp);
  } else if (attacker.fortune !== 0) {
    note(
      attacker.fortune > 0
        ? `Fortune ${attacker.fortune} : jusqu'à +${COMBAT_TUNING.fortuneBp} BP possibles`
        : `Fortune ${attacker.fortune} : jusqu'à −${COMBAT_TUNING.fortuneBp} BP possibles`,
    );
  }

  /* --- informations non chiffrées --- */
  if (hasAbility(aDef, 'no_retaliation')) note('La cible ne peut pas riposter');
  if (hasEffect(target, FX.blind)) note('Cible aveuglée : aucune riposte');
  if (attacker.morale > 0) note(`Moral +${attacker.morale} : Élan possible`);
  if (attacker.morale < 0) note(`Moral ${attacker.morale} : flottement possible`);

  mods = clampInt(mods, COMBAT_TUNING.modifiersMinBp, COMBAT_TUNING.modifiersMaxBp);

  return {
    mult: multFinal,
    modsBp: mods,
    modifiers,
    rollMin: aDef.dmgMin,
    rollMax: aDef.dmgMax,
    count: attacker.count,
    retaliation: canRetaliate(combat, attacker, target, ranged, fromHex),
    angle,
  };
}

function shieldBp(unit: CombatUnit): number {
  const e = unit.effects.find((x) => x.id === FX.shield);
  return e ? e.value : 0;
}

/* ─────────────────────────── Dégâts et pertes ───────────────────────────── */

/** Dégâts finaux pour un jet unitaire donné. */
export function damageForRoll(plan: DamagePlan, roll: number): number {
  const base = plan.count * roll;
  return applyFormula(base, plan.mult, plan.modsBp);
}

export interface KillResult {
  kills: number;
  topHp: number;
  wiped: boolean;
}

/** Pertes provoquées par `damage` sur une pile, sans la modifier. */
export function killsFor(target: CombatUnit, damage: number, def?: CreatureDef): KillResult {
  const hp = def ? def.hp : unitMaxHp(target);
  if (damage <= 0) return { kills: 0, topHp: target.topHp, wiped: false };
  if (damage < target.topHp) {
    return { kills: 0, topHp: target.topHp - damage, wiped: false };
  }
  const rest = damage - target.topHp;
  let kills = 1 + Math.floor(rest / hp);
  if (kills >= target.count) {
    kills = target.count;
    return { kills, topHp: 0, wiped: true };
  }
  const remainder = rest % hp;
  return { kills, topHp: remainder === 0 ? hp : hp - remainder, wiped: false };
}

/** Applique les dégâts à la pile et retourne les pertes. */
export function applyDamage(target: CombatUnit, damage: number): KillResult {
  const res = killsFor(target, damage);
  target.count -= res.kills;
  target.topHp = res.topHp;
  if (target.count <= 0) {
    target.count = 0;
    target.topHp = 0;
    target.alive = false;
  }
  return res;
}

/* ────────────────────────── Interface publique ──────────────────────────── */

export interface DamageRangeResult {
  min: number;
  max: number;
  kills: [number, number];
  retaliation: boolean;
  modifiers: DamageModifier[];
}

/**
 * Fourchette de dégâts, pertes probables, riposte et explication complète des
 * modificateurs. Affichée **avant** l'attaque, ne consomme aucun aléa.
 */
export function damageRange(
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
  ranged: boolean,
): DamageRangeResult {
  const plan = planDamage(combat, attacker, target, { ranged });
  const min = damageForRoll(plan, plan.rollMin);
  const max = damageForRoll(plan, plan.rollMax);
  const kMin = killsFor(target, min).kills;
  const kMax = killsFor(target, max).kills;
  return {
    min,
    max,
    kills: [kMin, kMax],
    retaliation: plan.retaliation,
    modifiers: plan.modifiers,
  };
}

/* ──────────────────────────── Fortune et moral ──────────────────────────── */

/**
 * Tirage de fortune, borné à ±3000 BP (brief §3) : aucun coup critique ne peut
 * anéantir une armée comparable en un seul jet.
 */
export function rollFortune(rng: RngState, unit: CombatUnit): number {
  const f = clampInt(unit.fortune, -3, 3);
  if (f === 0) return 0;
  const chance = Math.abs(f) * COMBAT_TUNING.fortuneChancePerPointBp;
  if (!nextChance(rng, chance)) return 0;
  return f > 0 ? COMBAT_TUNING.fortuneBp : -COMBAT_TUNING.fortuneBp;
}

export type MoraleOutcome = 'elan' | 'flottement' | 'aucun';

/**
 * Tirage de moral. Positif : Élan (demi-mouvement + attaque de base, une fois
 * par pile et par round). Négatif : flottement (perte d'initiative et blocage
 * éventuel de la capacité active) — **jamais** un tour entièrement perdu.
 */
export function rollMorale(rng: RngState, unit: CombatUnit): MoraleOutcome {
  const m = clampInt(unit.morale, -3, 3);
  if (m === 0) return 'aucun';
  const chance = Math.abs(m) * COMBAT_TUNING.moraleChancePerPointBp;
  if (!nextChance(rng, chance)) return 'aucun';
  return m > 0 ? 'elan' : 'flottement';
}

/** Jet de dégâts unitaire (entier uniforme entre dmgMin et dmgMax). */
export function rollDamageDie(rng: RngState, plan: DamagePlan): number {
  return nextInt(rng, plan.rollMin, plan.rollMax);
}
