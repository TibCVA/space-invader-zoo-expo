/**
 * Contribution d'un héros au combat : caractéristiques primaires, compétences
 * secondaires et artefacts, agrégées en un seul objet entier.
 *
 * Le combat ne dépend pas de `world/heroStats` : il lit l'instance de héros
 * telle qu'elle est stockée dans l'état (déjà à jour) et y ajoute les effets
 * de compétences et d'artefacts fournis par le pont de contenu.
 */

import type { HeroInstance, SkillEffect } from '../types.js';
import { artifactDef, skillEffects } from './content.js';

export interface HeroCombatBonuses {
  /** ajouté à l'attaque de chaque pile alliée */
  attack: number;
  /** ajouté à la défense de chaque pile alliée */
  defense: number;
  mystique: number;
  savoir: number;
  morale: number;
  fortune: number;
  spellPowerBp: number;
  firstStrikeBp: number;
  defenseBp: number;
  healBp: number;
  siegeDamageBp: number;
  resistBp: number;
  flankBp: number;
  summonBp: number;
  /** rangées de déploiement supplémentaires (compétence Tactique) */
  tacticsRows: number;
}

export function emptyHeroBonuses(): HeroCombatBonuses {
  return {
    attack: 0,
    defense: 0,
    mystique: 0,
    savoir: 0,
    morale: 0,
    fortune: 0,
    spellPowerBp: 0,
    firstStrikeBp: 0,
    defenseBp: 0,
    healBp: 0,
    siegeDamageBp: 0,
    resistBp: 0,
    flankBp: 0,
    summonBp: 0,
    tacticsRows: 0,
  };
}

function applyEffect(out: HeroCombatBonuses, e: SkillEffect): void {
  switch (e.kind) {
    case 'morale':
      out.morale += e.value;
      break;
    case 'fortune':
      out.fortune += e.value;
      break;
    case 'spell_power_bp':
      out.spellPowerBp += e.bp;
      break;
    case 'first_strike_bp':
      out.firstStrikeBp += e.bp;
      break;
    case 'defense_bp':
      out.defenseBp += e.bp;
      break;
    case 'heal_bp':
      out.healBp += e.bp;
      break;
    case 'siege_damage_bp':
      out.siegeDamageBp += e.bp;
      break;
    case 'resist_bp':
      out.resistBp += e.bp;
      break;
    case 'flank_bp':
      out.flankBp += e.bp;
      break;
    case 'summon_bp':
      out.summonBp += e.bp;
      break;
    case 'tactics_rows':
      out.tacticsRows += e.value;
      break;
    default:
      break;
  }
}

/**
 * Agrège la contribution complète d'un héros. Retourne des bonus nuls si le
 * camp n'a pas de héros (garde neutre, garnison sans capitaine).
 */
export function heroCombatBonuses(hero: HeroInstance | null): HeroCombatBonuses {
  const out = emptyHeroBonuses();
  if (!hero) return out;
  out.attack = hero.vaillance;
  out.defense = hero.garde;
  out.mystique = hero.mystique;
  out.savoir = hero.savoir;

  for (const s of hero.skills) {
    for (const e of skillEffects(s.skill, s.rank)) applyEffect(out, e);
  }

  const worn: string[] = [];
  for (const key of Object.keys(hero.artifacts)) {
    const id = hero.artifacts[key as keyof typeof hero.artifacts];
    if (id) worn.push(id);
  }
  for (const id of worn) {
    const def = artifactDef(id);
    if (!def) continue;
    for (const e of def.effects) applyEffect(out, e);
    if (def.primary) {
      out.attack += def.primary.vaillance ?? 0;
      out.defense += def.primary.garde ?? 0;
      out.mystique += def.primary.mystique ?? 0;
      out.savoir += def.primary.savoir ?? 0;
    }
  }

  if (out.morale > 3) out.morale = 3;
  if (out.morale < -3) out.morale = -3;
  if (out.fortune > 3) out.fortune = 3;
  if (out.fortune < -3) out.fortune = -3;
  return out;
}

/** Rangées de déploiement : 2 par défaut, 3 avec la Tactique. */
export function deploymentRows(bonuses: HeroCombatBonuses, hero: HeroInstance | null): number {
  let rows = 2 + bonuses.tacticsRows;
  if (bonuses.tacticsRows === 0 && hero) {
    // Repli si le contenu des compétences n'est pas branché : on lit le rang.
    for (const s of hero.skills) {
      if (s.skill === 'tactique') rows = 2 + (s.rank >= 2 ? 1 : 0);
    }
  }
  return rows < 2 ? 2 : rows > 3 ? 3 : rows;
}
