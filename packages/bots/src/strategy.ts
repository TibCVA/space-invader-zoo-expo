/**
 * Objectifs à moyen terme, et bascule entre eux.
 *
 * Six objectifs se disputent le tour d'une bannière : se développer, s'étendre,
 * lever les sceaux, forcer la Maison du Trésor, harceler, se défendre. Chacun
 * reçoit une note entière ; le meilleur l'emporte. La note combine :
 *
 *  - le **biais du profil** (`profile.strategy.bias`) — un prudent part avec
 *    treize mille points de développement, un agressif avec treize mille
 *    points de harcèlement ;
 *  - la **situation perçue** — sceaux tenus, gisements libres connus, menace
 *    visible, proclamation en cours, semaine de la partie ;
 *  - une **marge d'hystérésis** en faveur de l'objectif par défaut, qui évite
 *    de changer de plan chaque matin.
 *
 * La fonction est **pure** : aucun état n'est conservé entre deux tours, ce
 * qui garantit qu'un rejeu produit exactement la même suite de décisions.
 * La stabilité vient de la granularité des entrées, pas d'une mémoire cachée.
 */
import {
  SEALS_REQUIRED,
  gameConfig,
  weekOf,
  type GameState,
  type HeroInstance,
  type WorldMap,
} from '@auvergne/engine';

import { armyPowerOf, strongestHero } from './army.js';
import { bp, cells, type Perception } from './common.js';
import { perceivedLead } from './evaluate.js';
import type { BotProfile, ObjectiveKind } from './profiles.js';

/* ── Plan du tour ────────────────────────────────────────────────────────── */

export type HeroRole = 'tete' | 'eclaireur' | 'ramasseur' | 'garde';

export interface StrategyPlan {
  objective: ObjectiveKind;
  /** notes des six objectifs, triées par identifiant, pour le diagnostic */
  scores: { objective: ObjectiveKind; score: number }[];
  /** rôle assigné à chaque héros, par identifiant */
  roles: Record<string, HeroRole>;
  /** phrase française expliquant le plan, pour le journal et les rapports */
  reason: string;
  /** avance perçue sur le meilleur rival */
  lead: number;
}

const OBJECTIVES: readonly ObjectiveKind[] = [
  'defense',
  'developpement',
  'expansion',
  'harcelement',
  'sceaux',
  'tresor',
];

const REASONS: Readonly<Record<ObjectiveKind, string>> = {
  developpement: 'bâtir et lever des troupes avant tout',
  expansion: 'prendre les gisements et les bourgs des environs',
  sceaux: 'lever les Sceaux des Marches',
  tresor: 'forcer la Maison du Trésor et tenir la proclamation',
  harcelement: 'harceler les bannières adverses',
  defense: 'rappeler les héros et tenir les places',
};

/* ── Choix de l'objectif ─────────────────────────────────────────────────── */

export function planStrategy(
  state: GameState,
  world: WorldMap,
  view: Perception,
  profile: BotProfile,
): StrategyPlan {
  const week = weekOf(state.turn);
  const config = gameConfig(state);
  const lead = perceivedLead(state, world, view.player, profile, view);
  const bias = profile.strategy.bias;

  let power = 0;
  for (const hero of view.allHeroes) power += armyPowerOf(hero.army);
  const seals = view.self.seals.length;

  /* Ce que la carte connue nous offre. */
  let freeMines = 0;
  let knownSeals = 0;
  let treasuryKnown = false;
  let treasuryOurs = false;
  for (const place of view.places) {
    switch (place.obj.kind) {
      case 'mine':
        if (place.obj.owner !== view.player) freeMines++;
        break;
      case 'sceau':
        if (place.obj.owner !== view.player) knownSeals++;
        break;
      case 'maison_tresor':
        treasuryKnown = true;
        if (place.obj.owner === view.player) treasuryOurs = true;
        break;
      default:
        break;
    }
  }
  const freeTowns = view.neutralTowns.length;

  /* Menace : la pire pression visible sur une de nos places. */
  let pressure = 0;
  for (const town of view.towns) {
    const defence = armyPowerOf(town.garrison);
    for (const enemy of view.enemyHeroes) {
      const distance = cells(enemy.at, town.at);
      if (distance > profile.economy.defenseTrigger) continue;
      const net = armyPowerOf(enemy.army) - defence;
      if (net > pressure) pressure = net;
    }
  }

  /* La proclamation est publique (brief §6) : la lire n'est pas tricher. */
  const enemyClaim = state.claim && state.claim.by !== view.player ? state.claim : null;
  const ourClaim = state.claim && state.claim.by === view.player ? state.claim : null;

  const scores: Record<ObjectiveKind, number> = {
    developpement: 0,
    expansion: 0,
    sceaux: 0,
    tresor: 0,
    harcelement: 0,
    defense: 0,
  };

  /* — Développement : décroît avec les semaines, remonte si l'armée est nue — */
  const youth = Math.max(0, 12000 - week * 1200);
  scores.developpement =
    bp(youth + (power < profile.military.sortiePower ? 9000 : 0), bias.developpement);

  /* — Expansion : proportionnelle à ce qu'il reste à prendre autour de nous — */
  scores.expansion = bp(
    Math.min(16000, freeMines * 1600 + freeTowns * 3000 + 2000),
    bias.expansion,
  );

  /* — Sceaux : interdits avant la semaine du profil, puis de plus en plus attirants — */
  if (week >= profile.strategy.sealFromWeek && knownSeals > 0) {
    const momentum = seals * 5200 + Math.min(6000, week * 700);
    scores.sceaux = bp(4000 + momentum, bias.sceaux);
  }

  /* — Maison du Trésor : un trésor de prestige, plus jamais une victoire.
     Le mode Couronne a disparu — la partie ne se gagne qu'en prenant tous les
     châteaux adverses — donc la Maison vaut son butin et sa réputation, pas
     une course à la proclamation. */
  if (seals >= SEALS_REQUIRED && treasuryKnown) {
    scores.tresor = bp(9000, bias.tresor);
  }
  void ourClaim;
  void enemyClaim;
  void treasuryOurs;
  void config;

  /* — Harcèlement : seulement si l'on voit une proie plus faible que nous — */
  let prey = 0;
  const lead0 = strongestHero(view.heroes);
  const ourBest = lead0 ? armyPowerOf(lead0.army) : 0;
  for (const enemy of view.enemyHeroes) {
    const gap = ourBest - armyPowerOf(enemy.army);
    if (gap > prey) prey = gap;
  }
  if (prey > 0) {
    scores.harcelement = bp(Math.min(18000, 3000 + Math.trunc(prey / 3)), bias.harcelement);
  }

  /* — Défense : la pression visible, et rien d'autre — */
  if (pressure > 0) {
    scores.defense = bp(Math.min(30000, 5000 + Math.trunc(pressure / 2)), bias.defense);
  }

  /* — Correctif de tempo : mener autorise l'audace, être derrière impose la prudence — */
  if (lead > 0) {
    scores.sceaux += bp(Math.min(9000, Math.trunc(lead / 12)), 10000);
    scores.harcelement += bp(Math.min(7000, Math.trunc(lead / 16)), 10000);
  } else {
    scores.developpement += bp(Math.min(9000, Math.trunc(-lead / 12)), 10000);
    scores.defense += bp(Math.min(6000, Math.trunc(-lead / 20)), 10000);
  }

  /* — Hystérésis : le développement garde la main tant qu'on ne le dépasse pas franchement — */
  scores.developpement += profile.strategy.switchMargin;

  let objective: ObjectiveKind = 'developpement';
  let best = Number.MIN_SAFE_INTEGER;
  for (const kind of OBJECTIVES) {
    if (scores[kind] > best) {
      best = scores[kind];
      objective = kind;
    }
  }

  return {
    objective,
    scores: OBJECTIVES.map((kind) => ({ objective: kind, score: scores[kind] })),
    roles: assignRoles(view, profile, objective),
    reason: REASONS[objective],
    lead,
  };
}

/* ── Rôles des héros ─────────────────────────────────────────────────────── */

/**
 * Distribution des rôles : un héros de tête, un ou deux éclaireurs selon le
 * profil, un garde si l'objectif est défensif, le reste en ramasseurs.
 */
export function assignRoles(
  view: Perception,
  profile: BotProfile,
  objective: ObjectiveKind,
): Record<string, HeroRole> {
  const roles: Record<string, HeroRole> = {};
  const heroes = view.allHeroes.slice().sort((a, b) => {
    const pa = armyPowerOf(a.army) + a.level * 40;
    const pb = armyPowerOf(b.army) + b.level * 40;
    if (pa !== pb) return pb - pa;
    return a.uid < b.uid ? -1 : 1;
  });
  if (heroes.length === 0) return roles;

  roles[heroes[0].uid] = 'tete';
  let scouts = profile.explore.scouts;
  for (let i = heroes.length - 1; i >= 1; i--) {
    const hero = heroes[i];
    if (roles[hero.uid]) continue;
    if (scouts > 0) {
      roles[hero.uid] = 'eclaireur';
      scouts--;
    } else {
      roles[hero.uid] = 'ramasseur';
    }
  }
  if (objective === 'defense' && heroes.length > 1) {
    // Le deuxième plus fort rentre garder la maison.
    roles[heroes[1].uid] = 'garde';
  }
  return roles;
}

/** Objectif propre à un héros, dérivé de son rôle et du plan général. */
export function objectiveForRole(plan: StrategyPlan, role: HeroRole): ObjectiveKind {
  switch (role) {
    case 'tete':
      return plan.objective;
    case 'eclaireur':
      return plan.objective === 'defense' ? 'defense' : 'expansion';
    case 'ramasseur':
      return plan.objective === 'defense' ? 'defense' : 'developpement';
    case 'garde':
    default:
      return 'defense';
  }
}

/** Le héros doit-il rentrer plutôt que partir ? */
export function shouldRetreat(
  view: Perception,
  profile: BotProfile,
  hero: HeroInstance,
): boolean {
  const ours = armyPowerOf(hero.army);
  if (ours <= 0) return true;
  for (const enemy of view.enemyHeroes) {
    if (cells(enemy.at, hero.at) > 12) continue;
    if (armyPowerOf(enemy.army) > bp(ours, profile.military.duelRatioBp)) return true;
  }
  return false;
}
