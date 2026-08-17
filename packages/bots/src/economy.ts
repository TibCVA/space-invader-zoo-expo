/**
 * Décisions économiques : **quoi bâtir**, **qui recruter**, **quand
 * améliorer**, **faut-il passer par le marché**.
 *
 * Le cœur du fichier est l'arbitrage *croissance contre défense*. Un profil
 * décrit un ordre de filières (`profile.economy.lines`) ; l'ordre n'est
 * suivi que tant que rien ne menace. Dès qu'un héros adverse est vu à moins
 * de `defenseTrigger` cases d'une de nos places, la filière défense remonte
 * en tête pour cette cité — et pour elle seule : on ne fortifie pas une
 * capitale tranquille parce qu'un bourg lointain est menacé.
 *
 * Toutes les décisions sont rendues sous forme de `Command`, jamais appliquées
 * ici : `index.ts` les valide une par une contre `applyCommand`.
 */
import { BUILDINGS, CREATURES } from '@auvergne/content';
import {
  RESOURCE_KEYS,
  canBuild,
  canRecruit,
  canUpgrade,
  buildCost,
  marketBp,
  recruitCost,
  tradeOutcome,
  upgradesOf,
  weekOf,
  type BuildingDef,
  type BuildingId,
  type Command,
  type CreatureId,
  type GameState,
  type ResourceKey,
  type Resources,
  type TownState,
} from '@auvergne/engine';

import { armyPowerOf, topTier } from './army.js';
import { bp, cells, type Perception } from './common.js';
import type { BotProfile, BuildLine } from './profiles.js';

/* ── Classement des bâtiments par filière ────────────────────────────────── */

/** Filière d'un bâtiment, déduite de ses octrois. Table construite une fois. */
const LINE_OF: Readonly<Record<BuildingId, BuildLine>> = (() => {
  const out: Record<BuildingId, BuildLine> = {};
  for (const id of Object.keys(BUILDINGS).sort()) {
    out[id] = classify(BUILDINGS[id]);
  }
  return Object.freeze(out);
})();

function classify(def: BuildingDef): BuildLine {
  let hasDefense = false;
  let hasDwelling = false;
  let hasUpgrade = false;
  let hasIncome = false;
  let hasMagic = false;
  let hasMobility = false;
  let hasGrowth = false;
  for (const grant of def.grants) {
    switch (grant.kind) {
      case 'dwelling':
        hasDwelling = true;
        break;
      case 'upgrade':
        hasUpgrade = true;
        break;
      case 'income':
      case 'market':
        hasIncome = true;
        break;
      case 'defense':
        hasDefense = true;
        break;
      case 'mage_guild':
      case 'mana':
        hasMagic = true;
        break;
      case 'tavern':
      case 'stables':
      case 'blacksmith':
        hasMobility = true;
        break;
      case 'growth_bp':
        hasGrowth = true;
        break;
      default:
        break;
    }
  }
  if (hasGrowth) return 'prestige';
  if (hasUpgrade) return 'amelioration';
  if (hasDwelling) return 'demeure';
  if (hasDefense) return 'defense';
  if (hasMagic) return 'magie';
  if (hasIncome) return 'revenu';
  if (hasMobility) return 'mobilite';
  return 'revenu';
}

/** Rang de créature servi par un bâtiment (0 si aucun). */
function dwellingTier(def: BuildingDef): number {
  let tier = 0;
  for (const grant of def.grants) {
    if (grant.kind !== 'dwelling' && grant.kind !== 'upgrade') continue;
    const id = grant.kind === 'dwelling' ? grant.creature : grant.to;
    const creatureDef = CREATURES[id];
    if (creatureDef && creatureDef.tier > tier) tier = creatureDef.tier;
  }
  return tier;
}

/** Bâtiments d'une filière que cette cité pourrait un jour élever, triés. */
function candidatesOf(town: TownState, line: BuildLine): BuildingDef[] {
  const out: BuildingDef[] = [];
  for (const id of Object.keys(BUILDINGS).sort()) {
    const def = BUILDINGS[id];
    if (LINE_OF[id] !== line) continue;
    if (def.faction !== 'commun' && def.faction !== town.faction) continue;
    if (town.built.includes(id)) continue;
    out.push(def);
  }
  out.sort((a, b) => {
    const ta = dwellingTier(a);
    const tb = dwellingTier(b);
    if (ta !== tb) return ta - tb;
    const la = a.chainLevel ?? 0;
    const lb = b.chainLevel ?? 0;
    if (la !== lb) return la - lb;
    const ca = costWorth(a.cost);
    const cb = costWorth(b.cost);
    if (ca !== cb) return ca - cb;
    return a.id < b.id ? -1 : 1;
  });
  return out;
}

const WORTH: Readonly<Record<ResourceKey, number>> = {
  ecus: 1,
  bois: 6,
  granit: 6,
  fer: 9,
  sel: 9,
  essence: 14,
  filDor: 14,
};

function costWorth(cost: Partial<Resources>): number {
  let total = 0;
  for (const key of RESOURCE_KEYS) {
    const amount = cost[key];
    if (amount) total += amount * WORTH[key];
  }
  return total;
}

/* ── Ordre des filières, corrigé par la situation ────────────────────────── */

/**
 * Ordre effectif des filières pour une cité donnée : l'ordre du profil, avec
 * la défense remontée si une menace visible approche, et les améliorations
 * remontées à partir de la semaine choisie par le profil.
 */
export function linesFor(
  state: GameState,
  view: Perception,
  profile: BotProfile,
  town: TownState,
): BuildLine[] {
  const lines = profile.economy.lines.slice();
  const week = weekOf(state.turn);

  let threat = 0;
  for (const enemy of view.enemyHeroes) {
    if (cells(enemy.at, town.at) > profile.economy.defenseTrigger) continue;
    const power = armyPowerOf(enemy.army);
    if (power > threat) threat = power;
  }
  const defence = armyPowerOf(town.garrison);

  const move = (line: BuildLine, to: number): void => {
    const at = lines.indexOf(line);
    if (at < 0 || at === to) return;
    lines.splice(at, 1);
    lines.splice(to, 0, line);
  };

  if (threat > defence) move('defense', 0);
  if (week >= profile.economy.upgradeFromWeek) {
    const at = lines.indexOf('amelioration');
    if (at > 1) move('amelioration', 1);
  }
  // Une cité sans revenu du tout ne peut rien financer ensuite.
  if (town.isCapital && !town.built.includes('hotel_ville_1') && week >= 2) {
    move('revenu', threat > defence ? 1 : 0);
  }
  return lines;
}

/* ── Choix d'une construction ────────────────────────────────────────────── */

/**
 * Résout un souhait en une construction réellement possible aujourd'hui : on
 * descend la chaîne des prérequis jusqu'à trouver un maillon manquant que la
 * cité peut poser. Retourne `null` si la chaîne est bloquée.
 */
function resolveWish(
  state: GameState,
  town: TownState,
  wish: BuildingId,
  depth = 0,
): BuildingId | null {
  if (depth > 6) return null;
  const def = BUILDINGS[wish];
  if (!def) return null;
  if (town.built.includes(wish)) return null;
  for (const requirement of def.requires) {
    if (town.built.includes(requirement)) continue;
    const resolved = resolveWish(state, town, requirement, depth + 1);
    if (resolved) return resolved;
    return null;
  }
  return canBuild(state, town, wish).ok ? wish : null;
}

/** Bâtiment souhaité mais inabordable, pour tenter un échange au marché. */
export interface BlockedBuild {
  building: BuildingId;
  missing: { key: ResourceKey; amount: number }[];
}

/**
 * Choisit la construction du jour pour une cité, ou signale ce qui bloque.
 * Une seule construction par cité et par jour : le moteur y veille, on ne
 * propose donc qu'un seul bâtiment.
 */
export function chooseBuilding(
  state: GameState,
  view: Perception,
  profile: BotProfile,
  town: TownState,
): { building: BuildingId | null; blocked: BlockedBuild | null } {
  if (town.builtThisTurn) return { building: null, blocked: null };
  const resources = view.self.resources;
  let blocked: BlockedBuild | null = null;

  for (const line of linesFor(state, view, profile, town)) {
    for (const def of candidatesOf(town, line)) {
      const target = resolveWish(state, town, def.id);
      if (target) {
        const cost = buildCost(state, town, target);
        if (affordableAfterReserve(resources, cost, profile)) {
          return { building: target, blocked: null };
        }
        if (!blocked) blocked = { building: target, missing: missingOf(resources, cost) };
        continue;
      }
      // Chaîne bloquée faute de ressources : on note le premier maillon.
      if (!blocked) {
        const chain = firstUnaffordable(state, town, def.id, resources);
        if (chain) blocked = chain;
      }
    }
  }
  return { building: null, blocked };
}

function firstUnaffordable(
  state: GameState,
  town: TownState,
  wish: BuildingId,
  resources: Resources,
  depth = 0,
): BlockedBuild | null {
  if (depth > 6) return null;
  const def = BUILDINGS[wish];
  if (!def || town.built.includes(wish)) return null;
  for (const requirement of def.requires) {
    if (town.built.includes(requirement)) continue;
    return firstUnaffordable(state, town, requirement, resources, depth + 1);
  }
  const cost = buildCost(state, town, wish);
  const missing = missingOf(resources, cost);
  if (missing.length === 0) return null;
  return { building: wish, missing };
}

function missingOf(
  resources: Resources,
  cost: Partial<Resources>,
): { key: ResourceKey; amount: number }[] {
  const out: { key: ResourceKey; amount: number }[] = [];
  for (const key of RESOURCE_KEYS) {
    const need = cost[key];
    if (need && (resources[key] | 0) < need) out.push({ key, amount: need - (resources[key] | 0) });
  }
  return out;
}

/** Le trésor supporte-t-il ce coût sans entamer le matelas de recrutement ? */
function affordableAfterReserve(
  resources: Resources,
  cost: Partial<Resources>,
  profile: BotProfile,
): boolean {
  for (const key of RESOURCE_KEYS) {
    const need = cost[key];
    if (!need) continue;
    const have = resources[key] | 0;
    const floor = key === 'ecus' ? profile.economy.reserveEcus : 0;
    if (have - need < floor) return false;
  }
  return true;
}

/* ── Marché ──────────────────────────────────────────────────────────────── */

/**
 * Échange destiné à débloquer une construction. On cède la ressource dont on
 * a le plus au regard de sa valeur, jamais des écus si l'on manque d'écus.
 */
export function planTrade(
  state: GameState,
  view: Perception,
  profile: BotProfile,
  blocked: BlockedBuild | null,
): Command | null {
  if (!blocked || !profile.economy.useMarket) return null;
  if (blocked.missing.length === 0) return null;
  const rate = marketBp(state, view.player);
  if (rate < profile.economy.marketMinBp) return null;

  const need = blocked.missing[0];
  const resources = view.self.resources;

  let bestKey: ResourceKey | null = null;
  let bestSurplus = 0;
  for (const key of RESOURCE_KEYS) {
    if (key === need.key) continue;
    const have = resources[key] | 0;
    const keep = key === 'ecus' ? profile.economy.reserveEcus + 1500 : 4;
    const surplus = have - keep;
    if (surplus <= 0) continue;
    const worth = surplus * WORTH[key];
    if (worth > bestSurplus) {
      bestSurplus = worth;
      bestKey = key;
    }
  }
  if (!bestKey) return null;

  // On cède juste ce qu'il faut, arrondi vers le haut, sans descendre en dessous
  // du matelas. `tradeOutcome` refuse les échanges qui ne rapportent rien.
  const unit = Math.max(1, Math.trunc((WORTH[need.key] * 10000) / (WORTH[bestKey] * rate)));
  const wanted = need.amount * unit;
  const keep = bestKey === 'ecus' ? profile.economy.reserveEcus + 1500 : 4;
  const give = Math.min(wanted, (resources[bestKey] | 0) - keep);
  if (give <= 0) return null;
  const outcome = tradeOutcome(state, view.player, bestKey, give, need.key);
  if (!outcome.ok || (outcome.taken ?? 0) <= 0) return null;
  return { type: 'TradeResources', give: bestKey, giveAmount: give, take: need.key };
}

/* ── Recrutement ─────────────────────────────────────────────────────────── */

export interface RecruitPlan {
  town: TownState;
  creature: CreatureId;
  count: number;
  toHero: string | null;
}

/**
 * Recrutement du jour pour une cité.
 *
 * On sert les rangs élevés d'abord — une pile de rang 5 vaut plus que trente
 * recrues de rang 1 — puis on redescend tant que le budget du jour tient. Le
 * budget est une part du trésor (`recruitShareBp`) au-dessus du matelas ; le
 * profil agressif y met presque tout, le prudent en garde la moitié.
 */
export function planRecruits(
  state: GameState,
  view: Perception,
  profile: BotProfile,
  town: TownState,
  destination: string | null,
): RecruitPlan[] {
  const plans: RecruitPlan[] = [];
  const purse: Resources = { ...view.self.resources };
  const spendable = Math.max(
    0,
    bp(purse.ecus - profile.economy.reserveEcus, profile.economy.recruitShareBp),
  );
  let ecusLeft = spendable;

  const offered = Object.keys(town.available).sort();
  offered.sort((a, b) => {
    const da = CREATURES[a];
    const db = CREATURES[b];
    const ta = da ? da.tier : 0;
    const tb = db ? db.tier : 0;
    if (ta !== tb) return tb - ta;
    return a < b ? -1 : 1;
  });

  for (const id of offered) {
    const available = town.available[id] ?? 0;
    if (available <= 0) continue;
    const def = CREATURES[id];
    if (!def) continue;
    if (ecusLeft <= 0) break;

    // Combien pouvons-nous nous offrir, toutes ressources confondues ?
    let count = available;
    for (const key of RESOURCE_KEYS) {
      const unitCost = def.cost[key];
      if (!unitCost) continue;
      const budget = key === 'ecus' ? ecusLeft : purse[key] | 0;
      count = Math.min(count, Math.trunc(budget / unitCost));
    }
    if (count <= 0) continue;

    const cost = recruitCost(id, count);
    const verdict = canRecruit(state, town, id, count);
    if (!verdict.ok) continue;

    for (const key of RESOURCE_KEYS) {
      const amount = cost[key];
      if (amount) purse[key] = (purse[key] | 0) - amount;
    }
    ecusLeft -= cost.ecus ?? 0;
    plans.push({ town, creature: id, count, toHero: destination });
  }
  return plans;
}

/** Amélioration de créatures, quand la filière est ouverte et le trésor large. */
export function planUpgrade(
  state: GameState,
  view: Perception,
  profile: BotProfile,
  town: TownState,
): Command | null {
  if (weekOf(state.turn) < profile.economy.upgradeFromWeek) return null;
  const map = upgradesOf(town);
  if (map.size === 0) return null;
  const entries = Array.from(map.keys()).sort((a, b) => {
    const da = CREATURES[a];
    const db = CREATURES[b];
    const ta = da ? da.tier : 0;
    const tb = db ? db.tier : 0;
    if (ta !== tb) return tb - ta;
    return a < b ? -1 : 1;
  });

  for (const from of entries) {
    // On améliore par paquets pour ne pas vider le trésor d'un coup.
    for (const size of [64, 32, 16, 8, 4, 2, 1]) {
      const verdict = canUpgrade(state, town, from, size);
      if (!verdict.ok || !verdict.cost) continue;
      const remaining = (view.self.resources.ecus | 0) - (verdict.cost.ecus ?? 0);
      if (remaining < profile.economy.reserveEcus) continue;
      return { type: 'UpgradeCreatures', town: town.uid, from, count: size };
    }
  }
  return null;
}

/* ── Chartes ─────────────────────────────────────────────────────────────── */

/**
 * Charte d'un bourg capturé : permanente, donc choisie selon ce qui manque.
 * Militaire si l'on manque de troupes, marchande si l'on manque d'écus,
 * spirituelle si l'agitation monte.
 */
export function planCharter(view: Perception, profile: BotProfile, town: TownState): Command | null {
  if (town.isCapital || town.charter) return null;
  if (town.unrest >= 25) return { type: 'SetCharter', town: town.uid, charter: 'spirituelle' };

  let power = 0;
  for (const hero of view.allHeroes) power += armyPowerOf(hero.army);
  const rich = (view.self.resources.ecus | 0) > profile.economy.reserveEcus * 4;

  if (!rich) return { type: 'SetCharter', town: town.uid, charter: 'marchande' };
  if (power < profile.military.sortiePower * 3) {
    return { type: 'SetCharter', town: town.uid, charter: 'militaire' };
  }
  return { type: 'SetCharter', town: town.uid, charter: 'marchande' };
}

/** Rang maximal recruté dans une cité : indicateur de maturité économique. */
export function townMaturity(town: TownState): number {
  let tier = topTier(town.garrison);
  for (const id of Object.keys(town.available).sort()) {
    if ((town.available[id] ?? 0) <= 0) continue;
    const def = CREATURES[id];
    if (def && def.tier > tier) tier = def.tier;
  }
  return tier;
}
