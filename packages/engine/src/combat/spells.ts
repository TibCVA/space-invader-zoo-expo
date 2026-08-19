/**
 * Résolution des sorts de combat, **entièrement pilotée par les données**
 * (`SpellDef.effects: SpellEffect[]`). Aucun sort n'est codé en dur : ajouter
 * un sort au contenu suffit à le rendre jouable.
 *
 * Règle du brief : un sort de héros au maximum par round et par joueur.
 */

import type {
  CombatState,
  CombatUnit,
  CreatureDef,
  GameEvent,
  GameState,
  HexCoord,
  HeroInstance,
  SpellDef,
  SpellEffect,
  SpellId,
} from '../types.js';
import { HEX_COLS, HEX_ROWS } from '../types.js';
import { hexDistance, hexLine, inBounds } from './hex.js';
import {
  FX,
  addEffect,
  canStand,
  cleanseUnit,
  effectiveInitiative,
  findUnit,
  healStack,
  hexBlocked,
  heroOfSide,
  livingUnits,
  playerOfSide,
  unitAt,
  unitDef,
  unitLabel,
  unitMaxHp,
} from './units.js';
import { applyDamage } from './damage.js';
import { creatureDef, spellDef } from './content.js';
import { heroCombatBonuses } from './hero.js';
import { pushLog } from './log.js';
import { baseRetaliations } from './order.js';

export type SpellTarget = string | HexCoord | undefined;

export interface CastCheck {
  ok: boolean;
  error?: string;
  spell?: SpellDef;
  hero?: HeroInstance;
}

/* ─────────────────────────────── Validation ─────────────────────────────── */

/** Le camp peut-il lancer ce sort maintenant ? */
export function canCastSpell(
  state: GameState,
  combat: CombatState,
  side: 0 | 1,
  spellId: SpellId,
): CastCheck {
  const hero = heroOfSide(state, combat, side);
  if (!hero) return { ok: false, error: "Ce camp n'a pas de héros pour lancer un sort." };
  const player = playerOfSide(combat, side);
  if (player && combat.spellCastThisRound[player]) {
    return { ok: false, error: 'Le héros a déjà lancé un sort ce round.' };
  }
  const spell = spellDef(spellId);
  if (!spell) return { ok: false, error: `Sort inconnu : « ${spellId} ».` };
  if (spell.scope !== 'combat' && spell.scope !== 'les_deux') {
    return { ok: false, error: "Ce sort ne s'emploie pas au combat." };
  }
  if (!hero.spells.includes(spellId)) {
    return { ok: false, error: 'Le héros ne connaît pas ce sort.' };
  }
  if (hero.mana < spell.cost) {
    return { ok: false, error: `Mana insuffisant : ${spell.cost} requis, ${hero.mana} disponible.` };
  }
  return { ok: true, spell, hero };
}

/* ───────────────────────────── Puissance magique ────────────────────────── */

/** Puissance effective du héros (mystique + bonus, en points entiers). */
export function spellPowerOf(hero: HeroInstance | null): number {
  if (!hero) return 0;
  const b = heroCombatBonuses(hero);
  const base = b.mystique;
  return Math.max(0, base + Math.floor((base * b.spellPowerBp) / 10000));
}

/** Résistance magique du camp visé, en BP. */
function resistBpOf(state: GameState, combat: CombatState, side: 0 | 1): number {
  const hero = heroOfSide(state, combat, side);
  if (!hero) return 0;
  const bp = heroCombatBonuses(hero).resistBp;
  return bp < 0 ? 0 : bp > 7500 ? 7500 : bp;
}

/* ─────────────────────────────── Ciblage ────────────────────────────────── */

/** Piles concernées par un sort, selon `SpellDef.target`. */
export function spellTargets(
  combat: CombatState,
  spell: SpellDef,
  side: 0 | 1,
  target: SpellTarget,
): CombatUnit[] {
  const enemySide: 0 | 1 = side === 0 ? 1 : 0;
  switch (spell.target) {
    case 'all_allies':
      return livingUnits(combat, side);
    case 'all_enemies':
      return livingUnits(combat, enemySide);
    case 'battlefield':
      return livingUnits(combat);
    case 'line': {
      if (!target || typeof target === 'string') return [];
      const origin: HexCoord = { col: side === 0 ? 0 : HEX_COLS - 1, row: target.row };
      const line = hexLine(origin, target);
      const out: CombatUnit[] = [];
      for (const h of line) {
        const u = unitAt(combat, h);
        if (u && u.alive && !out.some((x) => x.uid === u.uid)) out.push(u);
      }
      return out;
    }
    case 'hex': {
      if (!target || typeof target === 'string') return [];
      const u = unitAt(combat, target);
      return u ? [u] : [];
    }
    case 'ally_stack':
    case 'enemy_stack':
    case 'any_stack': {
      if (typeof target !== 'string') return [];
      const u = findUnit(combat, target);
      if (!u || !u.alive) return [];
      if (spell.target === 'ally_stack' && u.side !== side) return [];
      if (spell.target === 'enemy_stack' && u.side === side) return [];
      return [u];
    }
    default:
      return [];
  }
}

/* ────────────────────────────── Résolution ──────────────────────────────── */

export interface CastResult {
  ok: boolean;
  error?: string;
  /** dégâts totaux infligés */
  damage: number;
  /** points de vie rendus */
  healed: number;
}

/**
 * Lance un sort de combat. Déduit le mana, marque le round, applique chaque
 * `SpellEffect` dans l'ordre où il est déclaré dans les données.
 */
export function castCombatSpell(
  state: GameState,
  combat: CombatState,
  side: 0 | 1,
  spellId: SpellId,
  target: SpellTarget,
  events: GameEvent[],
): CastResult {
  const check = canCastSpell(state, combat, side, spellId);
  if (!check.ok || !check.spell || !check.hero) {
    return { ok: false, error: check.error, damage: 0, healed: 0 };
  }
  const spell = check.spell;
  const hero = check.hero;
  const power = spellPowerOf(hero);
  const enemySide: 0 | 1 = side === 0 ? 1 : 0;

  hero.mana -= spell.cost;
  const player = playerOfSide(combat, side);
  if (player) combat.spellCastThisRound[player] = true;

  /*
   * Toute entrée de journal d'un sort porte SON école, celle du contenu.
   * L'affichage la devinait dans la phrase par mots-clefs (« feu », « soin »,
   * « ronce »…) et se trompait sur dix-huit sorts sur trente-deux : une
   * Foudre des Bois Noirs s'entourait de brume, un Regain de racines. Une
   * donnée qui existe ne se redevine pas dans du texte.
   */
  const journal = (text: string, detail?: Record<string, number | string>): void => {
    pushLog(combat, events, 'sort', text, { ...detail, ecole: spell.school });
  };

  journal(`Le héros lance « ${spell.name} ».`, {
    sort: spell.id,
    cout: spell.cost,
    mana: hero.mana,
  });

  const units = spellTargets(combat, spell, side, target);
  let totalDamage = 0;
  let totalHealed = 0;

  for (const effect of spell.effects) {
    switch (effect.kind) {
      case 'damage': {
        const raw = effect.base + effect.perMystique * power;
        for (const u of units) {
          if (u.side === side && spell.target !== 'battlefield') continue;
          const resist = resistBpOf(state, combat, u.side);
          const dmg = Math.max(0, Math.floor((raw * (10000 - resist)) / 10000));
          if (dmg <= 0) continue;
          const res = applyDamage(u, dmg);
          totalDamage += dmg;
          journal(
            `${unitLabel(u)} subit ${dmg} points de dégâts (${effect.element}).`,
            { cible: u.uid, degats: dmg, pertes: res.kills },
          );
        }
        break;
      }
      case 'heal': {
        const amount = effect.base + effect.perMystique * power;
        for (const u of units) {
          if (u.side !== side && spell.target !== 'battlefield') continue;
          const res = healStack(u, amount, effect.resurrect);
          totalHealed += res.healed;
          if (res.healed > 0) {
            journal(
              res.resurrected > 0
                ? `${unitLabel(u)} : ${res.resurrected} ${res.resurrected > 1 ? 'créatures se relèvent' : 'créature se relève'}.`
                : `${unitLabel(u)} récupère ${res.healed} points de vie.`,
              { cible: u.uid, soin: res.healed, releves: res.resurrected },
            );
          }
        }
        break;
      }
      case 'buff':
      case 'debuff': {
        const sign = effect.kind === 'buff' ? 1 : -1;
        for (const u of units) {
          addEffect(u, {
            id: `sort:${spell.id}:${effect.stat}`,
            kind: effect.kind,
            stat: effect.stat,
            value: sign * Math.abs(effect.value),
            turnsLeft: effect.turns,
            source: spell.name,
          });
        }
        journal(
          `${spell.name} : ${statLabel(effect.stat)} ${sign > 0 ? '+' : '−'}${Math.abs(effect.value)} pendant ${effect.turns} rounds.`,
          { sort: spell.id, cibles: units.length },
        );
        break;
      }
      case 'shield': {
        for (const u of units) {
          addEffect(u, {
            id: FX.shield,
            kind: 'shield',
            value: Math.abs(effect.bp),
            turnsLeft: effect.turns,
            source: spell.name,
          });
        }
        break;
      }
      case 'root': {
        for (const u of units) {
          addEffect(u, {
            id: FX.root,
            kind: 'root',
            value: 1,
            turnsLeft: effect.turns,
            source: spell.name,
          });
          journal(`${unitLabel(u)} est entravée.`, { cible: u.uid });
        }
        break;
      }
      case 'blind': {
        for (const u of units) {
          addEffect(u, {
            id: FX.blind,
            kind: 'blind',
            value: 1,
            turnsLeft: effect.turns,
            source: spell.name,
          });
          journal(`${unitLabel(u)} est aveuglée.`, { cible: u.uid });
        }
        break;
      }
      case 'dispel': {
        for (const u of units) {
          const removed = cleanseUnit(u);
          if (removed > 0) {
            journal(`${unitLabel(u)} est purifiée.`, {
              cible: u.uid,
              effets: removed,
            });
          }
        }
        break;
      }
      case 'summon': {
        const count = effect.base + effect.perMystique * power;
        const summoned = summonStack(combat, side, effect.creature, count);
        if (summoned) {
          journal(
            `${unitLabel(summoned)} ${summoned.count > 1 ? 'apparaissent' : 'apparaît'} sur le champ de bataille.`,
            { cible: summoned.uid, effectif: summoned.count },
          );
        }
        break;
      }
      case 'teleport': {
        if (target && typeof target !== 'string' && units.length > 0) {
          const u = units[0];
          if (canStand(combat, u, target)) {
            u.at = { col: target.col, row: target.row };
            journal(`${unitLabel(u)} est transportée ailleurs.`, {
              cible: u.uid,
              colonne: target.col,
              ligne: target.row,
            });
          }
        }
        break;
      }
      case 'swap': {
        if (units.length > 0) {
          const a = units[0];
          let b: CombatUnit | null = null;
          let best = 0x7fffffff;
          for (const e of livingUnits(combat, a.side === side ? enemySide : side)) {
            const d = hexDistance(a.at, e.at);
            if (d < best) {
              best = d;
              b = e;
            }
          }
          if (b) {
            const tmp = a.at;
            a.at = b.at;
            b.at = tmp;
            journal(`${unitLabel(a)} et ${unitLabel(b)} échangent leurs places.`, {
              a: a.uid,
              b: b.uid,
            });
          }
        }
        break;
      }
      case 'wall': {
        if (target && typeof target !== 'string') {
          const placed = raiseMagicWall(combat, target, effect.hexes, effect.turns);
          journal(
            `Un obstacle magique se dresse sur ${placed} ${placed > 1 ? 'hexagones' : 'hexagone'}.`,
            { hexagones: placed, rounds: effect.turns },
          );
        }
        break;
      }
      case 'movement': {
        for (const u of units) {
          addEffect(u, {
            id: `sort:${spell.id}:speed`,
            kind: 'buff',
            stat: 'speed',
            value: effect.value,
            turnsLeft: 1,
            source: spell.name,
          });
        }
        break;
      }
      case 'weather_shift': {
        combat.weather = side === 0 ? 'eclaircie' : 'brume';
        journal(`Le ciel change : ${combat.weather}.`, {
          meteo: combat.weather,
        });
        break;
      }
      case 'vision':
      case 'reveal_map':
        journal('Le sort révèle les alentours : sans effet au combat.', {
          sort: spell.id,
        });
        break;
      default:
        break;
    }
  }

  // Un sort peut avoir tué : les files et formations sont rafraîchies ailleurs.
  return { ok: true, damage: totalDamage, healed: totalHealed };
}

function statLabel(stat: string): string {
  switch (stat) {
    case 'attack':
      return 'attaque';
    case 'defense':
      return 'défense';
    case 'speed':
      return 'vitesse';
    case 'initiative':
      return 'initiative';
    default:
      return stat;
  }
}

/* ────────────────────────────── Invocation ──────────────────────────────── */

/**
 * Invoque une pile temporaire du côté du lanceur. Les invocations portent
 * `slot = -1` : elles disparaissent à la fin du combat et ne rejoignent
 * jamais l'armée du héros.
 */
export function summonStack(
  combat: CombatState,
  side: 0 | 1,
  creature: string,
  count: number,
): CombatUnit | null {
  if (count <= 0) return null;
  let def: CreatureDef;
  try {
    def = creatureDef(creature);
  } catch {
    return null;
  }
  const spot = freeSpot(combat, side);
  if (!spot) return null;
  const uid = `S${side}_${combat.units.length}`;
  const unit: CombatUnit = {
    uid,
    side,
    slot: -1,
    creature,
    count,
    startCount: count,
    topHp: def.hp,
    at: spot,
    facing: side === 0 ? 0 : 3,
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
  };
  unit.retaliationsLeft = baseRetaliations(unit);
  combat.units.push(unit);
  combat.order.push(uid);
  return unit;
}

/** Première case libre du camp, en partant du centre du dispositif. */
function freeSpot(combat: CombatState, side: 0 | 1): HexCoord | null {
  const cols = side === 0 ? [2, 3, 1, 4, 0] : [12, 11, 13, 10, 14];
  const rows = [5, 4, 6, 3, 7, 2, 8, 1, 9, 0, 10];
  for (const col of cols) {
    for (const row of rows) {
      const h: HexCoord = { col, row };
      if (!inBounds(h)) continue;
      if (hexBlocked(combat, h)) continue;
      if (unitAt(combat, h)) continue;
      return h;
    }
  }
  return null;
}

/* ─────────────────────────── Murs magiques ──────────────────────────────── */

/**
 * Dresse un obstacle magique. Les murs magiques sont des `ronce` porteuses
 * d'un compteur de rounds dans `hp` (les ronces naturelles n'en ont pas).
 */
export function raiseMagicWall(
  combat: CombatState,
  center: HexCoord,
  hexes: number,
  turns: number,
): number {
  let placed = 0;
  const half = Math.floor(hexes / 2);
  for (let i = -half; placed < hexes && i <= half + 1; i++) {
    const h: HexCoord = { col: center.col, row: center.row + i };
    if (!inBounds(h)) continue;
    if (unitAt(combat, h)) continue;
    if (combat.obstacles.some((o) => o.at.col === h.col && o.at.row === h.row)) continue;
    combat.obstacles.push({
      at: h,
      kind: 'ronce',
      state: 0,
      hp: turns,
      blocksMove: true,
      blocksSight: false,
    });
    placed++;
  }
  return placed;
}

/** Décrémente la durée des murs magiques ; retire ceux qui expirent. */
export function tickMagicWalls(combat: CombatState): void {
  for (let i = combat.obstacles.length - 1; i >= 0; i--) {
    const o = combat.obstacles[i];
    if (o.kind !== 'ronce' || o.hp === undefined) continue;
    o.hp--;
    if (o.hp <= 0) combat.obstacles.splice(i, 1);
  }
}

/* ────────────────────────── Aide à la décision (IA) ─────────────────────── */

export interface SpellSuggestion {
  spell: SpellId;
  target: SpellTarget;
  score: number;
}

/**
 * Meilleur sort disponible pour un camp, du point de vue de l'IA.
 * Retourne `null` si aucun sort n'est jouable ou utile.
 */
export function suggestSpell(
  state: GameState,
  combat: CombatState,
  side: 0 | 1,
): SpellSuggestion | null {
  const hero = heroOfSide(state, combat, side);
  if (!hero) return null;
  const player = playerOfSide(combat, side);
  if (player && combat.spellCastThisRound[player]) return null;
  const power = spellPowerOf(hero);
  const enemySide: 0 | 1 = side === 0 ? 1 : 0;
  let best: SpellSuggestion | null = null;

  for (const id of hero.spells) {
    const spell = spellDef(id);
    if (!spell) continue;
    if (spell.scope !== 'combat' && spell.scope !== 'les_deux') continue;
    if (hero.mana < spell.cost) continue;

    for (const effect of spell.effects) {
      const cand = scoreEffect(state, combat, side, enemySide, spell, effect, power);
      if (cand && (!best || cand.score > best.score)) best = cand;
    }
  }
  if (best && best.score < 40) return null;
  return best;
}

function scoreEffect(
  state: GameState,
  combat: CombatState,
  side: 0 | 1,
  enemySide: 0 | 1,
  spell: SpellDef,
  effect: SpellEffect,
  power: number,
): SpellSuggestion | null {
  switch (effect.kind) {
    case 'damage': {
      const raw = effect.base + effect.perMystique * power;
      let bestUnit: CombatUnit | null = null;
      let bestScore = 0;
      for (const u of livingUnits(combat, enemySide)) {
        const hp = unitMaxHp(u);
        const kills = Math.min(u.count, Math.floor(raw / Math.max(1, hp)));
        const score = kills * unitDef(u).power + Math.floor(raw / 2);
        if (score > bestScore) {
          bestScore = score;
          bestUnit = u;
        }
      }
      if (!bestUnit) return null;
      const tgt: SpellTarget =
        spell.target === 'hex' || spell.target === 'line' ? bestUnit.at : bestUnit.uid;
      return { spell: spell.id, target: tgt, score: bestScore };
    }
    case 'heal': {
      const amount = effect.base + effect.perMystique * power;
      let bestUnit: CombatUnit | null = null;
      let bestScore = 0;
      for (const u of livingUnits(combat, side)) {
        const missing = (u.startCount - u.count) * unitMaxHp(u) + (unitMaxHp(u) - u.topHp);
        if (missing <= 0) continue;
        const score = Math.min(missing, amount);
        if (score > bestScore) {
          bestScore = score;
          bestUnit = u;
        }
      }
      if (!bestUnit) return null;
      return { spell: spell.id, target: bestUnit.uid, score: bestScore };
    }
    case 'buff': {
      const allies = livingUnits(combat, side);
      if (allies.length === 0) return null;
      let bestUnit = allies[0];
      for (const u of allies) {
        if (unitDef(u).power * u.count > unitDef(bestUnit).power * bestUnit.count) bestUnit = u;
      }
      return { spell: spell.id, target: bestUnit.uid, score: 60 + effect.value * 20 };
    }
    case 'debuff':
    case 'root':
    case 'blind': {
      const foes = livingUnits(combat, enemySide);
      if (foes.length === 0) return null;
      let bestUnit = foes[0];
      for (const u of foes) {
        if (unitDef(u).power * u.count > unitDef(bestUnit).power * bestUnit.count) bestUnit = u;
      }
      const base = effect.kind === 'blind' ? 120 : effect.kind === 'root' ? 90 : 55;
      return {
        spell: spell.id,
        target: bestUnit.uid,
        score: base + effectiveInitiative(combat, bestUnit),
      };
    }
    case 'shield': {
      const allies = livingUnits(combat, side);
      if (allies.length === 0) return null;
      let bestUnit = allies[0];
      for (const u of allies) {
        if (unitDef(u).power * u.count > unitDef(bestUnit).power * bestUnit.count) bestUnit = u;
      }
      return { spell: spell.id, target: bestUnit.uid, score: 50 + Math.floor(effect.bp / 200) };
    }
    case 'summon': {
      const count = effect.base + effect.perMystique * power;
      let def: CreatureDef | null = null;
      try {
        def = creatureDef(effect.creature);
      } catch {
        return null;
      }
      return { spell: spell.id, target: undefined, score: count * def.power };
    }
    default:
      return null;
  }
}
