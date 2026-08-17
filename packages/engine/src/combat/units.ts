/**
 * Outils communs sur les piles de combat : occupation du terrain, statistiques
 * effectives, effets, formations, mécaniques de faction.
 *
 * Tout est entier. Les ratios sont en points de base (BP, /10000).
 */

import type {
  ArmyStack,
  CombatEffect,
  CombatObstacle,
  CombatState,
  CombatUnit,
  CreatureAbility,
  CreatureDef,
  HeroInstance,
  GameState,
  HexCoord,
  PlayerId,
  Terrain,
} from '../types.js';
import { areAdjacent, hexDistance, hexEquals, inBounds, neighbors } from './hex.js';
import { creatureDef } from './content.js';

/* ────────────────────────────── Réglages ────────────────────────────────── */

/**
 * Toutes les constantes d'équilibrage du combat, en un seul endroit.
 * Les valeurs en `Bp` sont des points de base (10000 = neutre).
 */
export const COMBAT_TUNING = {
  /** Pente du multiplicateur attaque/défense (cf. brief §3). */
  attackDefenseSlopeBp: 450,
  attackDefenseMinBp: 3500,
  attackDefenseMaxBp: 30000,

  /** Bornes du modificateur cumulé (capacités + terrain + météo + …). */
  modifiersMinBp: 2000,
  modifiersMaxBp: 40000,

  /** Fortune : bornée à ±3000 BP, jamais davantage (brief §3). */
  fortuneBp: 3000,
  fortuneChancePerPointBp: 1500,

  /** Moral : chance d'Élan / de flottement par point de moral. */
  moraleChancePerPointBp: 1500,
  /** Perte d'initiative sur moral négatif déclenché. */
  moralePenaltyInitiative: 2,

  /** Défense active : +30 % de défense. */
  defendDefenseBp: 3000,

  /** Attaques d'angle. */
  flankBp: 1500,
  rearBp: 2500,

  /** Tir. */
  rangedMeleePenaltyBp: -5000,
  rangedFarPenaltyBp: -5000,
  rangedFarDistance: 9,
  rangedObstacleBp: -2500,

  /** Serment de Pierre (Châtellenie). */
  oathDefenseBonus: 2,
  oathRetaliationBp: 1000,
  oathSpeedMalus: 1,

  /** Mémoire de la Forêt (Ermitage). */
  forestAttackBp: 1000,
  forestDefenseBp: 1000,
  heightRangedBp: 800,
  mistFlankBp: 1000,
  mistInitiative: 1,
  springHealBp: 2000,
  rockyColossusDefense: 2,

  /** Météo. */
  weatherRainRangedBp: -800,
  weatherMistRangedBp: -1500,
  weatherWindRangedBp: -1000,
  weatherWindFlySpeed: 1,
  weatherFrostSpeed: -1,

  /** Sièges. */
  wallSegmentHp: 900,
  gateHp: 700,
  towerHp: 600,
  towerDamage: 42,
  siegeRangedPenaltyBp: -2500,

  /** Poison, ralentissement. */
  slowSpeedMalus: 1,
  poisonTurns: 3,

  /** Limites de sécurité de la résolution automatique. */
  maxRounds: 60,
  maxActions: 6000,
  stalemateRounds: 3,
} as const;

/* ──────────────────────────── Identifiants d'effets ─────────────────────── */

export const FX = {
  elanUsed: 'sys:elan_utilise',
  elan: 'sys:elan',
  noAbility: 'sys:capacite_bloquee',
  boulder: 'sys:bloc_de_pierre',
  oath: 'sys:serment_de_pierre',
  oathShield: 'sys:serment_immunite',
  poison: 'sys:venin',
  slow: 'sys:ralentissement',
  stealth: 'sys:camouflage',
  blind: 'sys:aveuglement',
  root: 'sys:entrave',
  shield: 'sys:protection',
  forest: 'sys:memoire_foret',
  height: 'sys:memoire_hauteur',
  mist: 'sys:memoire_brume',
  rocky: 'sys:memoire_rocher',
  spring: 'sys:memoire_source',
} as const;

/* ─────────────────────────────── Créatures ──────────────────────────────── */

export function unitDef(unit: CombatUnit): CreatureDef {
  return creatureDef(unit.creature);
}

export function abilityOf<K extends CreatureAbility['kind']>(
  def: CreatureDef,
  kind: K,
): Extract<CreatureAbility, { kind: K }> | null {
  for (const a of def.abilities) {
    if (a.kind === kind) return a as Extract<CreatureAbility, { kind: K }>;
  }
  return null;
}

export function hasAbility(def: CreatureDef, kind: CreatureAbility['kind']): boolean {
  return abilityOf(def, kind) !== null;
}

/** Nombre de ripostes par round : 1, sauf capacité explicite. */
export function baseRetaliations(unit: CombatUnit): number {
  const ab = abilityOf(unitDef(unit), 'retaliations');
  return ab ? Math.max(1, ab.count) : 1;
}

/* ───────────────────────────── Occupation ───────────────────────────────── */

/**
 * Hexagones occupés par une pile. Les créatures de taille 2 occupent leur
 * hexagone de tête plus la case arrière : à l'ouest pour l'assaillant
 * (côté 0, tourné vers l'est), à l'est pour le défenseur (côté 1).
 */
export function unitHexes(unit: CombatUnit, def?: CreatureDef): HexCoord[] {
  const d = def ?? unitDef(unit);
  if (d.size !== 2) return [unit.at];
  return [unit.at, tailHex(unit.at, unit.side)];
}

export function tailHex(head: HexCoord, side: 0 | 1): HexCoord {
  return { col: side === 0 ? head.col - 1 : head.col + 1, row: head.row };
}

/** Hexagones qu'occuperait une pile si sa tête était placée en `head`. */
export function hexesFor(unit: CombatUnit, head: HexCoord, def?: CreatureDef): HexCoord[] {
  const d = def ?? unitDef(unit);
  if (d.size !== 2) return [head];
  return [head, tailHex(head, unit.side)];
}

export function unitAt(combat: CombatState, at: HexCoord, ignore?: CombatUnit): CombatUnit | null {
  for (const u of combat.units) {
    if (!u.alive) continue;
    if (ignore && u.uid === ignore.uid) continue;
    for (const h of unitHexes(u)) {
      if (hexEquals(h, at)) return u;
    }
  }
  return null;
}

export function obstacleAt(combat: CombatState, at: HexCoord): CombatObstacle | null {
  for (const o of combat.obstacles) {
    if (hexEquals(o.at, at)) return o;
  }
  return null;
}

/** L'hexagone bloque-t-il le déplacement (obstacle ou mur non effondré) ? */
export function hexBlocked(combat: CombatState, at: HexCoord): boolean {
  const o = obstacleAt(combat, at);
  if (!o) return false;
  if (!o.blocksMove) return false;
  if (o.state === 2) return false; // segment effondré : on passe dans les gravats
  return true;
}

export function hexBlocksSight(combat: CombatState, at: HexCoord): boolean {
  const o = obstacleAt(combat, at);
  if (!o) return false;
  if (o.state === 2) return false;
  return o.blocksSight;
}

/** Une pile peut-elle stationner avec sa tête en `head` ? */
export function canStand(combat: CombatState, unit: CombatUnit, head: HexCoord, def?: CreatureDef): boolean {
  const cells = hexesFor(unit, head, def);
  for (const c of cells) {
    if (!inBounds(c)) return false;
    if (hexBlocked(combat, c)) return false;
    const other = unitAt(combat, c, unit);
    if (other) return false;
  }
  return true;
}

/* ─────────────────────────────── Voisinage ──────────────────────────────── */

/** Deux piles sont-elles au contact (n'importe quelles cases adjacentes) ? */
export function unitsAdjacent(a: CombatUnit, b: CombatUnit): boolean {
  const ha = unitHexes(a);
  const hb = unitHexes(b);
  for (const x of ha) {
    for (const y of hb) {
      if (areAdjacent(x, y)) return true;
    }
  }
  return false;
}

/** Distance minimale entre deux piles, en hexagones. */
export function unitDistance(a: CombatUnit, b: CombatUnit): number {
  let best = 0x7fffffff;
  for (const x of unitHexes(a)) {
    for (const y of unitHexes(b)) {
      const d = hexDistance(x, y);
      if (d < best) best = d;
    }
  }
  return best;
}

export function livingUnits(combat: CombatState, side?: 0 | 1): CombatUnit[] {
  const out: CombatUnit[] = [];
  for (const u of combat.units) {
    if (!u.alive || u.count <= 0) continue;
    if (side !== undefined && u.side !== side) continue;
    out.push(u);
  }
  return out;
}

export function enemiesOf(combat: CombatState, unit: CombatUnit): CombatUnit[] {
  return livingUnits(combat, unit.side === 0 ? 1 : 0);
}

export function alliesOf(combat: CombatState, unit: CombatUnit): CombatUnit[] {
  return livingUnits(combat, unit.side).filter((u) => u.uid !== unit.uid);
}

export function findUnit(combat: CombatState, uid: string): CombatUnit | null {
  for (const u of combat.units) {
    if (u.uid === uid) return u;
  }
  return null;
}

/** La pile est-elle engagée au corps à corps par un ennemi vivant ? */
export function isEngaged(combat: CombatState, unit: CombatUnit): boolean {
  for (const e of enemiesOf(combat, unit)) {
    if (unitsAdjacent(unit, e)) return true;
  }
  return false;
}

/* ───────────────────────────────── Effets ───────────────────────────────── */

export function findEffect(unit: CombatUnit, id: string): CombatEffect | null {
  for (const e of unit.effects) {
    if (e.id === id) return e;
  }
  return null;
}

export function hasEffect(unit: CombatUnit, id: string): boolean {
  return findEffect(unit, id) !== null;
}

export function effectValue(unit: CombatUnit, id: string): number {
  const e = findEffect(unit, id);
  return e ? e.value : 0;
}

/** Ajoute ou remplace un effet portant le même identifiant. */
export function addEffect(unit: CombatUnit, effect: CombatEffect): void {
  const existing = findEffect(unit, effect.id);
  if (existing) {
    existing.kind = effect.kind;
    existing.stat = effect.stat;
    existing.value = effect.value;
    existing.turnsLeft = Math.max(existing.turnsLeft, effect.turnsLeft);
    existing.source = effect.source;
    return;
  }
  unit.effects.push(effect);
}

export function removeEffect(unit: CombatUnit, id: string): void {
  const idx = unit.effects.findIndex((e) => e.id === id);
  if (idx >= 0) unit.effects.splice(idx, 1);
}

/** Retire tous les effets négatifs (Purification, Cerf Miraculeux). */
export function cleanseUnit(unit: CombatUnit): number {
  let removed = 0;
  for (let i = unit.effects.length - 1; i >= 0; i--) {
    const e = unit.effects[i];
    const negative =
      e.kind === 'debuff' ||
      e.kind === 'root' ||
      e.kind === 'blind' ||
      e.id === FX.poison ||
      e.id === FX.slow;
    if (negative) {
      unit.effects.splice(i, 1);
      removed++;
    }
  }
  return removed;
}

/** Décrémente les durées et supprime les effets expirés. Retourne les expirés. */
export function tickEffects(unit: CombatUnit): CombatEffect[] {
  const expired: CombatEffect[] = [];
  for (let i = unit.effects.length - 1; i >= 0; i--) {
    const e = unit.effects[i];
    if (e.turnsLeft <= 0) continue; // durée illimitée (formations, capacités)
    e.turnsLeft--;
    if (e.turnsLeft <= 0) {
      expired.push(e);
      unit.effects.splice(i, 1);
    }
  }
  return expired;
}

/* ───────────────────────── Statistiques effectives ──────────────────────── */

function sumStat(unit: CombatUnit, stat: string): number {
  let total = 0;
  for (const e of unit.effects) {
    if ((e.kind === 'buff' || e.kind === 'debuff') && e.stat === stat) total += e.value;
  }
  return total;
}

export function effectiveAttack(combat: CombatState, unit: CombatUnit): number {
  let a = unit.attack + sumStat(unit, 'attack');
  if (hasEffect(unit, FX.forest)) a += 1;
  if (a < 0) a = 0;
  return a;
}

/** Défense hors posture de défense (utile pour détailler les modificateurs). */
export function baseDefense(combat: CombatState, unit: CombatUnit): number {
  let d = unit.defense + sumStat(unit, 'defense');
  if (hasEffect(unit, FX.oath)) d += COMBAT_TUNING.oathDefenseBonus;
  if (hasEffect(unit, FX.rocky)) d += COMBAT_TUNING.rockyColossusDefense;
  if (d < 0) d = 0;
  return d;
}

export function effectiveDefense(combat: CombatState, unit: CombatUnit): number {
  const d = baseDefense(combat, unit);
  if (!unit.defending) return d;
  return d + Math.floor((d * COMBAT_TUNING.defendDefenseBp) / 10000);
}

export function effectiveSpeed(combat: CombatState, unit: CombatUnit): number {
  if (hasEffect(unit, FX.root)) return 0;
  const def = unitDef(unit);
  let s = unit.speed + sumStat(unit, 'speed');
  if (hasEffect(unit, FX.oath)) s -= COMBAT_TUNING.oathSpeedMalus;
  if (hasEffect(unit, FX.forest)) s += 1;
  if (hasEffect(unit, FX.slow)) s -= COMBAT_TUNING.slowSpeedMalus;
  if (combat.weather === 'vent' && def.flying) s += COMBAT_TUNING.weatherWindFlySpeed;
  if (combat.weather === 'givre' && combat.terrain === 'foret') s += COMBAT_TUNING.weatherFrostSpeed;
  if (s < 1) s = 1;
  return s;
}

export function effectiveInitiative(combat: CombatState, unit: CombatUnit): number {
  let i = unit.initiative + sumStat(unit, 'initiative');
  if (hasEffect(unit, FX.mist)) i += COMBAT_TUNING.mistInitiative;
  if (hasEffect(unit, FX.slow)) i -= 1;
  if (i < 1) i = 1;
  return i;
}

/** Points de mouvement disponibles pour l'activation en cours. */
export function movementPoints(combat: CombatState, unit: CombatUnit): number {
  const elan = findEffect(unit, FX.elan);
  if (elan) return elan.value;
  return effectiveSpeed(combat, unit);
}

/* ────────────────────────────── Points de vie ───────────────────────────── */

export function unitMaxHp(unit: CombatUnit): number {
  return unitDef(unit).hp;
}

/** Points de vie totaux restants dans la pile. */
export function unitTotalHp(unit: CombatUnit): number {
  if (!unit.alive || unit.count <= 0) return 0;
  const hp = unitMaxHp(unit);
  return (unit.count - 1) * hp + unit.topHp;
}

/** Valeur de la pile pour l'IA et le partage d'expérience. */
export function unitValue(unit: CombatUnit): number {
  const def = unitDef(unit);
  return unit.count * def.power;
}

/** Puissance d'une armée hors combat (`ArmyStack[]`). */
export function stackPower(army: (ArmyStack | null)[]): number {
  let total = 0;
  for (const s of army) {
    if (!s || s.count <= 0) continue;
    const def = creatureDef(s.creature);
    total += s.count * def.power;
  }
  return total;
}

export function sidePower(combat: CombatState, side: 0 | 1): number {
  let total = 0;
  for (const u of livingUnits(combat, side)) total += unitValue(u);
  return total;
}

export function sideHp(combat: CombatState, side: 0 | 1): number {
  let total = 0;
  for (const u of livingUnits(combat, side)) total += unitTotalHp(u);
  return total;
}

/* ───────────────────────────────── Héros ────────────────────────────────── */

export function playerOfSide(combat: CombatState, side: 0 | 1): PlayerId | null {
  return side === 0 ? combat.attacker.player : combat.defender.player;
}

export function heroUidOfSide(combat: CombatState, side: 0 | 1): string | null {
  return side === 0 ? combat.attacker.hero : combat.defender.hero;
}

export function heroOfSide(state: GameState, combat: CombatState, side: 0 | 1): HeroInstance | null {
  const uid = heroUidOfSide(combat, side);
  if (!uid) return null;
  return state.heroes[uid] ?? null;
}

/* ──────────────────────── Mécaniques de faction ─────────────────────────── */

/**
 * « Serment de Pierre » (Châtellenie de Granit).
 * Deux piles alliées de Granit adjacentes forment une ligne :
 * +2 défense, +1000 BP de riposte, immunité au premier déplacement forcé,
 * mais -1 vitesse. Recalculé après chaque déplacement.
 */
export function updateOathFormations(combat: CombatState): void {
  for (const unit of combat.units) {
    if (!unit.alive) {
      removeEffect(unit, FX.oath);
      removeEffect(unit, FX.oathShield);
      continue;
    }
    const def = unitDef(unit);
    if (def.faction !== 'granit') {
      removeEffect(unit, FX.oath);
      removeEffect(unit, FX.oathShield);
      continue;
    }
    let linked = false;
    for (const ally of alliesOf(combat, unit)) {
      if (unitDef(ally).faction !== 'granit') continue;
      if (unitsAdjacent(unit, ally)) {
        linked = true;
        break;
      }
    }
    if (linked) {
      if (!hasEffect(unit, FX.oath)) {
        addEffect(unit, {
          id: FX.oath,
          kind: 'formation',
          value: 1,
          turnsLeft: 0,
          source: 'Serment de Pierre',
        });
        addEffect(unit, {
          id: FX.oathShield,
          kind: 'formation',
          value: 1,
          turnsLeft: 0,
          source: 'Serment de Pierre',
        });
      }
    } else {
      removeEffect(unit, FX.oath);
      removeEffect(unit, FX.oathShield);
    }
  }
}

/**
 * « Mémoire de la Forêt » (Ermitage des Bois Noirs).
 * Bonus selon le terrain du champ de bataille et la météo :
 * forêt, source, hauteur, brume, rocher.
 */
export function applyForestMemory(combat: CombatState): void {
  const terrain: Terrain = combat.terrain;
  for (const unit of combat.units) {
    if (!unit.alive) continue;
    const def = unitDef(unit);
    if (def.faction !== 'ermitage') continue;
    if (terrain === 'foret') {
      addEffect(unit, {
        id: FX.forest,
        kind: 'terrain',
        value: 1,
        turnsLeft: 0,
        source: 'Mémoire de la Forêt : futaie',
      });
    }
    if (terrain === 'humide' || terrain === 'eau') {
      addEffect(unit, {
        id: FX.spring,
        kind: 'terrain',
        value: 1,
        turnsLeft: 0,
        source: 'Mémoire de la Forêt : source',
      });
    }
    if (terrain === 'pente') {
      addEffect(unit, {
        id: FX.height,
        kind: 'terrain',
        value: 1,
        turnsLeft: 0,
        source: 'Mémoire de la Forêt : hauteur',
      });
    }
    if (terrain === 'rocher' && def.tier >= 6) {
      addEffect(unit, {
        id: FX.rocky,
        kind: 'terrain',
        value: 1,
        turnsLeft: 0,
        source: 'Mémoire de la Forêt : rocher',
      });
    }
    if (combat.weather === 'brume') {
      addEffect(unit, {
        id: FX.mist,
        kind: 'terrain',
        value: 1,
        turnsLeft: 0,
        source: 'Mémoire de la Forêt : brume',
      });
    }
  }
}

/* ─────────────────────────────── Divers ─────────────────────────────────── */

/** Hexagones libres adjacents à une pile, où un assaillant peut se placer. */
export function attackPositions(
  combat: CombatState,
  attacker: CombatUnit,
  target: CombatUnit,
): HexCoord[] {
  const out: HexCoord[] = [];
  const seen = new Set<number>();
  for (const h of unitHexes(target)) {
    for (const n of neighbors(h)) {
      const key = n.row * 100 + n.col;
      if (seen.has(key)) continue;
      seen.add(key);
      if (canStand(combat, attacker, n)) out.push(n);
    }
  }
  out.sort((a, b) => a.row - b.row || a.col - b.col);
  return out;
}

export interface HealResult {
  /** points de vie réellement rendus */
  healed: number;
  /** créatures ramenées dans la pile */
  resurrected: number;
}

/**
 * Soigne une pile : d'abord la créature de tête, puis, si `resurrect`, les
 * créatures tombées, sans jamais dépasser l'effectif de départ.
 */
export function healStack(unit: CombatUnit, amount: number, resurrect: boolean): HealResult {
  if (amount <= 0 || unit.count <= 0) return { healed: 0, resurrected: 0 };
  const hp = unitMaxHp(unit);
  let left = amount;
  let healed = 0;
  const missingTop = hp - unit.topHp;
  if (missingTop > 0) {
    const gain = Math.min(missingTop, left);
    unit.topHp += gain;
    left -= gain;
    healed += gain;
  }
  let resurrected = 0;
  if (resurrect && left > 0) {
    const room = unit.startCount - unit.count;
    if (room > 0) {
      const back = Math.min(room, Math.floor(left / hp));
      if (back > 0) {
        unit.count += back;
        left -= back * hp;
        healed += back * hp;
        resurrected = back;
      }
    }
  }
  return { healed, resurrected };
}

/** Résumé lisible d'une pile pour le journal de combat. */
export function unitLabel(unit: CombatUnit): string {
  const def = unitDef(unit);
  return `${unit.count} ${unit.count > 1 ? def.namePlural : def.name}`;
}
