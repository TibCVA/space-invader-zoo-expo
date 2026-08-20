/**
 * Composition des armées, regroupement, garnisons et **estimation de la
 * puissance avant engagement**.
 *
 * Le moteur expose `stackPower`, qui est une somme de valeurs d'unités : très
 * bien pour classer des gardes, insuffisant pour décider d'une bataille, car
 * elle ignore la défense, les points de vie et l'initiative. On ajoute donc
 * ici un **duel analytique** : un échange round par round, entièrement entier,
 * sans le moindre tirage, qui applique la formule de dégâts du brief §3 sur
 * les moyennes. Il coûte quelques microsecondes là où `previewAutoResolve`
 * clone tout l'état et joue la bataille — impensable des dizaines de fois par
 * tour.
 *
 * Le duel n'a pas besoin d'être exact : il doit être **prudent et monotone**.
 * Les profils y ajoutent leur propre marge (`engageRatioBp`, `duelRatioBp`,
 * `siegeRatioBp`, `sealRatioBp`).
 */
import { creature } from '@auvergne/content';
import {
  ARMY_SLOTS,
  heroCombatBonuses,
  stackPower,
  type ArmyStack,
  type CreatureDef,
  type HeroInstance,
  type TownState,
} from '@auvergne/engine';

import { bp, clamp } from './common.js';
import type { BotProfile } from './profiles.js';

/* ── Accès tolérant au contenu ───────────────────────────────────────────── */

function defOf(id: string): CreatureDef | null {
  try {
    return creature(id);
  } catch {
    return null;
  }
}

/** Puissance brute d'une armée, tolérante aux emplacements vides. */
export function armyPowerOf(army: readonly (ArmyStack | null)[] | undefined): number {
  if (!army) return 0;
  return stackPower(army.slice() as (ArmyStack | null)[]);
}

/** Puissance d'une liste de piles compacte (garde neutre). */
export function guardPowerOf(guard: readonly ArmyStack[] | undefined): number {
  if (!guard || guard.length === 0) return 0;
  const army: (ArmyStack | null)[] = [];
  for (const s of guard) army.push({ creature: s.creature, count: s.count });
  return stackPower(army);
}

export function isArmyEmpty(army: readonly (ArmyStack | null)[] | undefined): boolean {
  if (!army) return true;
  for (const s of army) if (s && s.count > 0) return false;
  return true;
}

export function countStacks(army: readonly (ArmyStack | null)[] | undefined): number {
  if (!army) return 0;
  let n = 0;
  for (const s of army) if (s && s.count > 0) n++;
  return n;
}

/* ── Portrait d'une armée ────────────────────────────────────────────────── */

/** Résumé entier d'une armée, base du duel analytique. */
export interface ArmyProfile {
  /** points de vie totaux */
  hp: number;
  /** dégâts moyens par round, avant multiplicateur attaque/défense */
  rawDamage: number;
  /** attaque moyenne pondérée par la puissance */
  attack: number;
  /** défense moyenne pondérée par les points de vie */
  defense: number;
  /** initiative moyenne pondérée par la puissance */
  initiative: number;
  /** part de dégâts venant de tireurs, en BP */
  shooterBp: number;
  /** puissance brute (`stackPower`) */
  power: number;
  /** nombre de piles vivantes */
  stacks: number;
}

const EMPTY_PROFILE: ArmyProfile = {
  hp: 0,
  rawDamage: 0,
  attack: 0,
  defense: 0,
  initiative: 0,
  shooterBp: 0,
  power: 0,
  stacks: 0,
};

/** Portrait chiffré d'une armée, héros compris. */
export function profileArmy(
  army: readonly (ArmyStack | null)[] | undefined,
  hero: HeroInstance | null,
): ArmyProfile {
  if (!army) return { ...EMPTY_PROFILE };
  let hp = 0;
  let rawDamage = 0;
  let attackWeighted = 0;
  let defenseWeighted = 0;
  let initiativeWeighted = 0;
  let shooterDamage = 0;
  let power = 0;
  let stacks = 0;

  for (const s of army) {
    if (!s || s.count <= 0) continue;
    const def = defOf(s.creature);
    if (!def) continue;
    const stackHp = def.hp * s.count;
    // Dégâts moyens : (min + max) / 2, gardé entier par ×2 puis ÷2.
    const perCreature2 = def.dmgMin + def.dmgMax;
    const damage = Math.trunc((perCreature2 * s.count) / 2);
    const stackPowerValue = def.power * s.count;

    hp += stackHp;
    rawDamage += damage;
    if (def.shooter) shooterDamage += damage;
    attackWeighted += def.attack * stackPowerValue;
    defenseWeighted += def.defense * stackHp;
    initiativeWeighted += def.initiative * stackPowerValue;
    power += stackPowerValue;
    stacks++;
  }

  if (power === 0 || hp === 0) return { ...EMPTY_PROFILE };

  const bonuses = heroCombatBonuses(hero);
  const attack = Math.trunc(attackWeighted / power) + bonuses.attack;
  const defense =
    bp(Math.trunc(defenseWeighted / hp), 10000 + Math.max(0, bonuses.defenseBp - 10000)) +
    bonuses.defense;

  return {
    hp,
    rawDamage,
    attack,
    defense,
    initiative: Math.trunc(initiativeWeighted / power),
    shooterBp: rawDamage === 0 ? 0 : Math.trunc((shooterDamage * 10000) / rawDamage),
    power,
    stacks,
  };
}

/* ── Duel analytique ─────────────────────────────────────────────────────── */

/** Multiplicateur attaque/défense du brief §3, borné. */
export function attackMultBp(attack: number, defense: number): number {
  return clamp(10000 + 450 * (attack - defense), 3500, 30000);
}

export interface BattleEstimate {
  /** vrai si le camp A l'emporte dans le modèle */
  win: boolean;
  /** points de vie restants du camp A, en BP de son total initial */
  survivalBp: number;
  /** points de vie restants du camp B, en BP de son total initial */
  enemySurvivalBp: number;
  /** rounds simulés */
  rounds: number;
  /** rapport de force lissé, en BP (10000 = équilibre parfait) */
  edgeBp: number;
}

export interface BattleOptions {
  /** le camp A assiège une place forte */
  siege?: boolean;
  /** murailles du défenseur : 0 = aucune, 3 = tours */
  walls?: number;
  /** prime de moral / fortune du camp A, en BP */
  attackerBonusBp?: number;
  /** prime de moral / fortune du camp B, en BP */
  defenderBonusBp?: number;
}

const MAX_ROUNDS = 24;

/**
 * Échange analytique entre deux armées.
 *
 * Modèle : à chaque round, chaque camp inflige `rawDamage × multiplicateur ×
 * fraction de troupes encore debout`. La fraction reproduit l'attrition —
 * une armée à demi détruite ne frappe plus qu'à demi. L'initiative donne au
 * camp le plus rapide une frappe supplémentaire au premier round ; les
 * tireurs en tirent un profit supplémentaire, puisqu'ils frappent avant le
 * contact. Le siège majore la défense du camp B.
 */
export function estimateBattle(
  a: ArmyProfile,
  b: ArmyProfile,
  options: BattleOptions = {},
): BattleEstimate {
  if (a.hp <= 0) {
    return { win: false, survivalBp: 0, enemySurvivalBp: 10000, rounds: 0, edgeBp: 0 };
  }
  if (b.hp <= 0) {
    return { win: true, survivalBp: 10000, enemySurvivalBp: 0, rounds: 0, edgeBp: 30000 };
  }

  const wallBonus = options.siege ? 2 + (options.walls ?? 0) * 2 : 0;
  const multA = attackMultBp(a.attack, b.defense + wallBonus);
  const multB = attackMultBp(b.attack, a.defense);

  const offenseA = bp(bp(a.rawDamage, multA), options.attackerBonusBp ?? 10000);
  const offenseB = bp(bp(b.rawDamage, multB), options.defenderBonusBp ?? 10000);

  const hp0A = a.hp;
  const hp0B = b.hp;
  let hpA = a.hp;
  let hpB = b.hp;

  // Avantage d'initiative : une demi-frappe gratuite au camp le plus rapide,
  // majorée si ce camp aligne des tireurs.
  const initiativeGap = a.initiative - b.initiative;
  if (initiativeGap > 0) {
    const share = clamp(2500 + initiativeGap * 600 + bp(a.shooterBp, 3000), 0, 8000);
    hpB -= Math.min(hpB, bp(offenseA, share));
  } else if (initiativeGap < 0) {
    const share = clamp(2500 - initiativeGap * 600 + bp(b.shooterBp, 3000), 0, 8000);
    hpA -= Math.min(hpA, bp(offenseB, share));
  }

  let rounds = 0;
  while (rounds < MAX_ROUNDS && hpA > 0 && hpB > 0) {
    rounds++;
    const fracA = Math.trunc((hpA * 10000) / hp0A);
    const fracB = Math.trunc((hpB * 10000) / hp0B);
    const hitB = bp(offenseA, fracA);
    const hitA = bp(offenseB, fracB);
    hpB -= hitB;
    hpA -= hitA;
    if (hitA <= 0 && hitB <= 0) break;
  }

  const survivalBp = hpA <= 0 ? 0 : clamp(Math.trunc((hpA * 10000) / hp0A), 0, 10000);
  const enemySurvivalBp = hpB <= 0 ? 0 : clamp(Math.trunc((hpB * 10000) / hp0B), 0, 10000);
  const win = hpA > 0 && hpB <= 0;

  // Rapport de force lissé : sert de note continue quand les deux camps
  // survivent au plafond de rounds.
  const edgeBp = clamp(
    hpB <= 0 ? 20000 + survivalBp : Math.trunc(((survivalBp + 1) * 10000) / (enemySurvivalBp + 1)),
    0,
    30000,
  );

  return { win, survivalBp, enemySurvivalBp, rounds, edgeBp };
}

/* ── Décision d'engagement ───────────────────────────────────────────────── */

export type EngagementKind = 'garde' | 'sceau' | 'duel' | 'siege';

export interface Engagement {
  /** l'IA accepte le combat */
  go: boolean;
  /** pertes attendues, en BP de nos points de vie */
  lossBp: number;
  estimate: BattleEstimate;
  /** rapport `stackPower` brut, en BP */
  powerRatioBp: number;
}

function ratioFor(profile: BotProfile, kind: EngagementKind): number {
  switch (kind) {
    case 'sceau':
      return profile.military.sealRatioBp;
    case 'duel':
      return profile.military.duelRatioBp;
    case 'siege':
      return profile.military.siegeRatioBp;
    case 'garde':
    default:
      return profile.military.engageRatioBp;
  }
}

/**
 * Faut-il engager ? Deux garde-fous indépendants doivent être franchis :
 * le rapport de puissance brut (marge du profil) **et** le duel analytique.
 * Les pertes attendues sont retournées pour que la stratégie puisse choisir
 * entre deux cibles gagnables.
 */
export function considerEngagement(
  attacker: ArmyProfile,
  defender: ArmyProfile,
  kind: EngagementKind,
  profile: BotProfile,
  options: BattleOptions = {},
): Engagement {
  const estimate = estimateBattle(attacker, defender, options);
  const powerRatioBp =
    defender.power <= 0 ? 100000 : Math.trunc((attacker.power * 10000) / defender.power);
  const required = ratioFor(profile, kind);
  const lossBp = 10000 - estimate.survivalBp;

  // Un profil prudent exige en plus de conserver une part de son armée.
  const keepBp = clamp(required - 10000, 0, 12000);
  const go =
    estimate.win && powerRatioBp >= required && estimate.survivalBp >= Math.trunc(keepBp / 2);

  return { go, lossBp, estimate, powerRatioBp };
}

/* ── Composition et regroupement ─────────────────────────────────────────── */

/** Héros le plus puissant d'une liste, départage stable par identifiant. */
export function strongestHero(heroes: readonly HeroInstance[]): HeroInstance | null {
  let best: HeroInstance | null = null;
  let bestPower = -1;
  for (const hero of heroes) {
    const power = armyPowerOf(hero.army) + hero.level * 40;
    if (power > bestPower || (power === bestPower && best && hero.uid < best.uid)) {
      best = hero;
      bestPower = power;
    }
  }
  return best;
}

/** Héros le plus faible d'une liste (candidat éclaireur). */
export function weakestHero(heroes: readonly HeroInstance[]): HeroInstance | null {
  let worst: HeroInstance | null = null;
  let worstPower = Number.MAX_SAFE_INTEGER;
  for (const hero of heroes) {
    const power = armyPowerOf(hero.army) + hero.level * 40;
    if (power < worstPower || (power === worstPower && worst && hero.uid < worst.uid)) {
      worst = hero;
      worstPower = power;
    }
  }
  return worst;
}

/**
 * Puissance qu'un profil souhaite laisser en garnison dans une cité.
 *
 * **La part se divise entre les cités, et c'est une correction.** Elle se
 * calculait par cité sur la puissance TOTALE de la maison : la capitale gardait
 * `garrisonShareBp`, chaque autre ville la moitié. Le nom disait « part de
 * l'armée en garnison », le calcul disait autre chose — la fraction verrouillée
 * croissait avec l'empire. Un expert à six cités (part 15 %) en immobilisait
 * 15 + 5 × 7,5 = **52 %**, et à dix cités 82 %. Autrement dit : plus il
 * conquérait, moins il pouvait conquérir.
 *
 * Mesuré sur la partie qui ne se tranchait pas (graine 1000, trois cent
 * cinquante-et-un jours) : l'expert tenait six cités et 803 000 de puissance
 * contre une cité et 312 000, le chemin vers la dernière capitale existait —
 * trente-quatre pas — et il ne l'a jamais forcée. En face, une garnison de onze
 * griffons couronnés, quinze colosses et quatorze verrats, parce que le prudent,
 * lui, n'a qu'une ville : sa part ne se divisait par rien.
 *
 * La part est donc répartie, la capitale comptant double. Un joueur à une seule
 * cité retrouve exactement sa valeur d'avant — le tortue reste une tortue, c'est
 * son profil — mais un empire ne s'étouffe plus lui-même.
 */
/**
 * Part maximale de l'armée d'une maison qu'une menace peut immobiliser, en
 * points de base. Trois cinquièmes : la place tient, la campagne continue.
 */
export const PLAFOND_MENACE_BP = 6000;

export function garrisonTarget(
  profile: BotProfile,
  town: TownState,
  totalPower: number,
  threat: number,
  villes = 1,
): number {
  const parts = Math.max(2, villes + 1);
  const poids = town.isCapital ? 2 : 1;
  const share = Math.trunc((profile.military.garrisonShareBp * poids) / parts);
  const base = bp(totalPower, share);
  /*
   * Une menace visible relève le plancher — mais elle ne prend JAMAIS toute
   * l'armée, et c'est la correction d'une partie morte.
   *
   * La clause disait `Math.min(totalPower, threat)` : dès qu'un ennemi aussi
   * fort que soi passait dans le rayon de vigilance du profil — vingt-sept
   * cases pour le prudent, c'est-à-dire un quart de la carte —, la maison
   * verrouillait la TOTALITÉ de son armée dans ses murs. Son héros de tête
   * repartait les mains vides, ne livrait plus un combat, ne montait plus d'un
   * niveau, et ne prenait plus rien. Comme l'adversaire faisait de même, plus
   * personne ne bougeait jusqu'au plafond du harnais.
   *
   * Mesuré, sur quatre parties à deux bannières de la graine 20250816 : deux
   * parties sur quatre à quatre cent cinquante-et-un jours, héros de niveau 2 et
   * 3, une cité chacun, deux mille cent de puissance d'un côté contre six mille
   * trois cents de l'autre — et le plus FAIBLE déclaré vainqueur au classement.
   * Une partie où personne ne peut sortir n'est pas une partie serrée, c'est une
   * partie morte, et le défaut se voyait d'autant plus que la carte venait
   * d'être rendue équitable entre les cinq départs : à forces égales, la clause
   * de menace se déclenche des deux côtés en même temps, pour toujours.
   *
   * Une place assiégée garde donc les trois cinquièmes, et la maison conserve
   * deux cinquièmes de campagne. Ce reste ne suffit pas à forcer une capitale
   * tenue — il n'a pas à le faire — mais il suffit à prendre des gisements, des
   * repaires et des demeures, donc à grandir, donc à finir par l'emporter.
   * C'est ainsi qu'une partie se décide au lieu de s'endormir.
   */
  const plafond = bp(totalPower, PLAFOND_MENACE_BP);
  return Math.max(base, Math.min(plafond, threat));
}

/**
 * Transferts souhaitables entre deux porteurs d'armée : on cherche à
 * concentrer la puissance sur un seul héros de tête, sans jamais dépasser les
 * sept emplacements.
 */
export interface StackMove {
  slotFrom: number;
  slotTo: number;
  count: number;
}

/**
 * Calcule les échanges d'emplacements pour verser `from` dans `to`.
 * Les piles déjà présentes chez `to` fusionnent ; les autres prennent un
 * emplacement libre. Rien n'est déplacé si `to` est plein.
 */
export function pourInto(
  from: readonly (ArmyStack | null)[],
  to: readonly (ArmyStack | null)[],
  keepBack: number,
): StackMove[] {
  const moves: StackMove[] = [];
  const target = to.slice();
  let leftBehind = keepBack;

  // On verse d'abord les piles les plus fortes : elles décident des batailles.
  const order: number[] = [];
  for (let i = 0; i < from.length && i < ARMY_SLOTS; i++) {
    if (from[i] && (from[i] as ArmyStack).count > 0) order.push(i);
  }
  order.sort((x, y) => {
    const px = stackValue(from[x]);
    const py = stackValue(from[y]);
    if (px !== py) return py - px;
    return x - y;
  });

  for (const slotFrom of order) {
    const stack = from[slotFrom] as ArmyStack;
    const value = stackValue(stack);
    if (leftBehind > 0 && value <= leftBehind) {
      leftBehind -= value;
      continue;
    }
    let slotTo = -1;
    for (let j = 0; j < target.length; j++) {
      const other = target[j];
      if (other && other.creature === stack.creature) {
        slotTo = j;
        break;
      }
    }
    if (slotTo < 0) {
      for (let j = 0; j < target.length; j++) {
        if (!target[j]) {
          slotTo = j;
          break;
        }
      }
    }
    if (slotTo < 0) continue; // sept emplacements pleins : on laisse sur place
    const existing = target[slotTo];
    target[slotTo] = existing
      ? { creature: existing.creature, count: existing.count + stack.count }
      : { creature: stack.creature, count: stack.count };
    moves.push({ slotFrom, slotTo, count: stack.count });
  }
  return moves;
}

function stackValue(stack: ArmyStack | null): number {
  if (!stack || stack.count <= 0) return 0;
  const def = defOf(stack.creature);
  return def ? def.power * stack.count : 0;
}

/** Le rang le plus élevé présent dans une armée (indicateur de maturité). */
export function topTier(army: readonly (ArmyStack | null)[] | undefined): number {
  if (!army) return 0;
  let top = 0;
  for (const s of army) {
    if (!s || s.count <= 0) continue;
    const def = defOf(s.creature);
    if (def && def.tier > top) top = def.tier;
  }
  return top;
}
