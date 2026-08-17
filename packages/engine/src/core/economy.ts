/**
 * Économie : revenus, constructions, recrutement, amélioration, entretien,
 * marché et taux de change.
 *
 * Tout est entier. Les ratios (agitation, chartes, compétences, chartes de
 * village) sont exprimés en points de base et appliqués par troncature.
 */
import {
  RESOURCE_KEYS,
  type ArmyStack,
  type BuildingDef,
  type BuildingId,
  type CreatureId,
  type GameState,
  type HeroInstance,
  type PlayerId,
  type ResourceKey,
  type Resources,
  type SkillEffect,
  type TownState,
} from '../types.js';
import {
  CAPITAL_INCOME_ECUS,
  MARKET_BASE_BP,
  MARKET_BUILDING_BP,
  MARKET_MAX_BP,
  MAX_UNREST,
  RESOURCE_VALUE,
  TOWN_INCOME_ECUS,
  UNREST_INCOME_BP,
  UPGRADE_COST_BP,
  UPKEEP_FREE_POWER,
  UPKEEP_POWER_PER_ECU,
  VILLAGE_INCOME_ECUS,
} from './constants.js';
import { content, worldModule } from './registry.js';
import {
  applyBp,
  canAfford,
  costWithBp,
  formatCost,
  formatMissing,
  mergeDelta,
  missingResources,
  scaleCost,
} from './util.js';

/* ── Aides ──────────────────────────────────────────────────────────────── */

export function creatureOrNull(id: CreatureId): ReturnType<typeof content>['CREATURES'][string] | null {
  const table = content().CREATURES;
  return table[id] ?? null;
}

export function armyPower(army: readonly (ArmyStack | null)[]): number {
  let total = 0;
  for (const s of army) {
    if (!s || s.count <= 0) continue;
    const def = creatureOrNull(s.creature);
    if (!def) continue;
    total += def.power * s.count;
  }
  return total;
}

/** Effets actifs d'un héros, avec repli si le module monde n'est pas branché. */
function effectsOf(state: GameState, hero: HeroInstance): SkillEffect[] {
  try {
    return worldModule().activeEffects(state, hero);
  } catch {
    return [];
  }
}

/** Meilleur ratio d'un effet donné parmi les héros d'un joueur, en BP. */
function bestHeroBp(
  state: GameState,
  player: PlayerId,
  kind: 'income_bp' | 'build_cost_bp' | 'trade_bp',
  neutral = 10000,
): number {
  const p = state.players[player];
  if (!p) return neutral;
  let best = neutral;
  for (const uid of p.heroes) {
    const hero = state.heroes[uid];
    if (!hero) continue;
    for (const e of effectsOf(state, hero)) {
      if (e.kind !== kind) continue;
      if (kind === 'build_cost_bp') {
        if (e.bp < best) best = e.bp;
      } else if (e.bp > best) {
        best = e.bp;
      }
    }
  }
  return best;
}

/* ── Revenus ────────────────────────────────────────────────────────────── */

/** Revenu quotidien d'une cité, agitation et charte comprises. */
export function townIncome(state: GameState, town: TownState): Partial<Resources> {
  const out: Partial<Resources> = {};
  if (!town.owner) return out;

  const isVillage = !town.isCapital && town.built.length === 0;
  const base = town.isCapital
    ? CAPITAL_INCOME_ECUS
    : isVillage
      ? VILLAGE_INCOME_ECUS
      : TOWN_INCOME_ECUS;
  mergeDelta(out, { ecus: base });

  const buildings = content().BUILDINGS;
  for (const id of town.built) {
    const def = buildings[id];
    if (!def) continue;
    for (const grant of def.grants) {
      if (grant.kind === 'income') {
        mergeDelta(out, { [grant.resource]: grant.amount } as Partial<Resources>);
      }
    }
  }

  if (town.charter === 'marchande') {
    mergeDelta(out, { ecus: Math.trunc((out.ecus ?? 0) / 5) });
  } else if (town.charter === 'spirituelle') {
    mergeDelta(out, { essence: 1 });
  } else if (town.charter === 'militaire') {
    mergeDelta(out, { fer: 1 });
  }

  const unrest = Math.max(0, Math.min(MAX_UNREST, town.unrest | 0));
  if (unrest > 0) {
    const bp = Math.max(3000, 10000 - unrest * UNREST_INCOME_BP);
    for (const k of RESOURCE_KEYS) {
      if (out[k]) out[k] = applyBp(out[k] as number, bp);
    }
  }
  return out;
}

/** Revenu quotidien complet d'un joueur : cités, mines, spécialités, primes. */
export function playerIncomeOf(state: GameState, player: PlayerId): Partial<Resources> {
  const out: Partial<Resources> = {};
  const p = state.players[player];
  if (!p || !p.alive) return out;

  for (const uid of p.towns.slice().sort()) {
    const town = state.towns[uid];
    if (!town || town.owner !== player) continue;
    mergeDelta(out, townIncome(state, town));
  }

  for (const uid of Object.keys(state.objects).sort()) {
    const obj = state.objects[uid];
    if (obj.owner !== player) continue;
    if (obj.kind !== 'mine') continue;
    const resource = obj.data.resource as ResourceKey | undefined;
    const amount = obj.data.amount as number | undefined;
    if (!resource || !amount) continue;
    mergeDelta(out, { [resource]: amount } as Partial<Resources>);
  }

  for (const uid of p.heroes.slice().sort()) {
    const hero = state.heroes[uid];
    if (!hero) continue;
    const def = content().HEROES[hero.def];
    if (def && def.specialty.kind === 'resource') {
      mergeDelta(out, { [def.specialty.resource]: def.specialty.perDay } as Partial<Resources>);
    }
  }

  const bonus = bestHeroBp(state, player, 'income_bp');
  if (bonus !== 10000) {
    for (const k of RESOURCE_KEYS) {
      if (out[k]) out[k] = applyBp(out[k] as number, bonus);
    }
  }
  return out;
}

/**
 * Revenu quotidien du joueur actif.
 * (Signature imposée par `docs/02-API.md` ; utiliser `playerIncomeOf` pour un
 * joueur précis.)
 */
export function playerIncome(state: GameState): Partial<Resources> {
  return playerIncomeOf(state, state.activePlayer);
}

/** Entretien quotidien des grandes armées, en écus. Anti-emballement public. */
export function upkeepOf(state: GameState, player: PlayerId): number {
  const p = state.players[player];
  if (!p) return 0;
  let power = 0;
  for (const uid of p.heroes) {
    const hero = state.heroes[uid];
    if (hero) power += armyPower(hero.army);
  }
  for (const uid of p.towns) {
    const town = state.towns[uid];
    if (town) power += armyPower(town.garrison);
  }
  if (power <= UPKEEP_FREE_POWER) return 0;
  return Math.trunc((power - UPKEEP_FREE_POWER) / UPKEEP_POWER_PER_ECU);
}

/* ── Construction ───────────────────────────────────────────────────────── */

/** Coût réel d'une construction, remises de héros comprises. */
export function buildCost(state: GameState, town: TownState, building: BuildingId): Partial<Resources> {
  const def = content().BUILDINGS[building];
  if (!def) return {};
  if (!town.owner) return def.cost;
  let bp = bestHeroBp(state, town.owner, 'build_cost_bp');
  const heroes = state.players[town.owner]?.heroes ?? [];
  for (const uid of heroes) {
    const hero = state.heroes[uid];
    if (!hero) continue;
    const hdef = content().HEROES[hero.def];
    if (hdef && hdef.specialty.kind === 'build_discount' && hdef.specialty.bp < bp) {
      bp = hdef.specialty.bp;
    }
  }
  return bp === 10000 ? def.cost : costWithBp(def.cost, bp);
}

/**
 * Peut-on construire ce bâtiment dans cette cité, aujourd'hui ?
 * Chaque refus est expliqué en français.
 */
export function canBuild(
  state: GameState,
  town: TownState,
  building: BuildingId,
): { ok: boolean; reason?: string } {
  const def: BuildingDef | undefined = content().BUILDINGS[building];
  if (!def) return { ok: false, reason: `Bâtiment inconnu : « ${building} ».` };
  if (!town.owner) return { ok: false, reason: 'Cette cité n’a pas de bannière.' };
  if (town.built.includes(building)) {
    return { ok: false, reason: `${def.name} est déjà bâti à ${town.name}.` };
  }
  if (town.builtThisTurn) {
    return { ok: false, reason: 'Une seule construction par cité et par jour.' };
  }
  if (def.faction !== 'commun' && def.faction !== town.faction) {
    return {
      ok: false,
      reason: `${def.name} n’appartient pas à l’architecture de cette cité.`,
    };
  }
  for (const req of def.requires) {
    if (!town.built.includes(req)) {
      const reqDef = content().BUILDINGS[req];
      return {
        ok: false,
        reason: `Il faut d’abord bâtir ${reqDef ? reqDef.name : req}.`,
      };
    }
  }
  const player = state.players[town.owner];
  if (!player) return { ok: false, reason: 'Bannière introuvable.' };
  const cost = buildCost(state, town, building);
  if (!canAfford(player.resources, cost)) {
    return {
      ok: false,
      reason: `Ressources insuffisantes pour ${def.name} : il manque ${formatMissing(
        missingResources(player.resources, cost),
      )}.`,
    };
  }
  return { ok: true };
}

/** Applique les octrois d'un bâtiment fraîchement construit. */
export function applyBuildingGrants(town: TownState, building: BuildingId): void {
  const def = content().BUILDINGS[building];
  if (!def) return;
  for (const grant of def.grants) {
    if (grant.kind === 'dwelling') {
      if (town.available[grant.creature] === undefined) town.available[grant.creature] = 0;
      // La demeure livre immédiatement sa première portée.
      town.available[grant.creature] += grant.growth;
    }
  }
}

/* ── Recrutement ────────────────────────────────────────────────────────── */

export function recruitCost(creature: CreatureId, count: number): Partial<Resources> {
  const def = creatureOrNull(creature);
  if (!def) return {};
  return scaleCost(def.cost, count);
}

export function canRecruit(
  state: GameState,
  town: TownState,
  creature: CreatureId,
  count: number,
): { ok: boolean; reason?: string } {
  if (!Number.isInteger(count) || count <= 0) {
    return { ok: false, reason: 'Le nombre de recrues doit être un entier positif.' };
  }
  const def = creatureOrNull(creature);
  if (!def) return { ok: false, reason: `Créature inconnue : « ${creature} ».` };
  if (!town.owner) return { ok: false, reason: 'Cette cité n’a pas de bannière.' };
  const available = town.available[creature] ?? 0;
  if (available < count) {
    return {
      ok: false,
      reason:
        available === 0
          ? `Aucun ${def.name} disponible cette semaine à ${town.name}.`
          : `Seulement ${available} ${available > 1 ? def.namePlural : def.name} disponibles à ${town.name}.`,
    };
  }
  const player = state.players[town.owner];
  if (!player) return { ok: false, reason: 'Bannière introuvable.' };
  const cost = recruitCost(creature, count);
  if (!canAfford(player.resources, cost)) {
    return {
      ok: false,
      reason: `Il manque ${formatMissing(missingResources(player.resources, cost))} pour recruter ${count} ${
        count > 1 ? def.namePlural : def.name
      }.`,
    };
  }
  return { ok: true };
}

/** Ajoute des créatures à une armée de sept emplacements. */
export function addToArmy(
  army: (ArmyStack | null)[],
  creature: CreatureId,
  count: number,
): boolean {
  for (let i = 0; i < army.length; i++) {
    const s = army[i];
    if (s && s.creature === creature) {
      s.count += count;
      return true;
    }
  }
  for (let i = 0; i < army.length; i++) {
    if (!army[i]) {
      army[i] = { creature, count };
      return true;
    }
  }
  return false;
}

export function armySlotsFree(army: (ArmyStack | null)[], creature: CreatureId): boolean {
  for (const s of army) {
    if (!s) return true;
    if (s.creature === creature) return true;
  }
  return false;
}

/* ── Amélioration ───────────────────────────────────────────────────────── */

/** Améliorations offertes par les bâtiments d'une cité : base → amélioré. */
export function upgradesOf(town: TownState): Map<CreatureId, CreatureId> {
  const out = new Map<CreatureId, CreatureId>();
  const buildings = content().BUILDINGS;
  for (const id of town.built) {
    const def = buildings[id];
    if (!def) continue;
    for (const grant of def.grants) {
      if (grant.kind === 'upgrade') out.set(grant.from, grant.to);
    }
  }
  return out;
}

export function upgradeUnitCost(from: CreatureId, to: CreatureId): Partial<Resources> {
  const a = creatureOrNull(from);
  const b = creatureOrNull(to);
  if (!a || !b) return {};
  const diff: Partial<Resources> = {};
  for (const k of RESOURCE_KEYS) {
    const delta = (b.cost[k] ?? 0) - (a.cost[k] ?? 0);
    if (delta > 0) diff[k] = delta;
  }
  return costWithBp(diff, UPGRADE_COST_BP);
}

export function canUpgrade(
  state: GameState,
  town: TownState,
  from: CreatureId,
  count: number,
): { ok: boolean; reason?: string; to?: CreatureId; cost?: Partial<Resources> } {
  if (!Number.isInteger(count) || count <= 0) {
    return { ok: false, reason: 'Le nombre de créatures à améliorer doit être un entier positif.' };
  }
  if (!town.owner) return { ok: false, reason: 'Cette cité n’a pas de bannière.' };
  const to = upgradesOf(town).get(from);
  if (!to) {
    const def = creatureOrNull(from);
    return {
      ok: false,
      reason: `${town.name} ne peut pas améliorer ${def ? def.namePlural : from} : le bâtiment manque.`,
    };
  }
  const available = countInTown(state, town, from);
  if (available < count) {
    return {
      ok: false,
      reason: `Seulement ${available} créature(s) de ce type sont présentes à ${town.name}.`,
    };
  }
  const player = state.players[town.owner];
  if (!player) return { ok: false, reason: 'Bannière introuvable.' };
  const cost = scaleCost(upgradeUnitCost(from, to), count);
  if (!canAfford(player.resources, cost)) {
    return {
      ok: false,
      reason: `L’amélioration coûte ${formatCost(cost)} : il manque ${formatMissing(
        missingResources(player.resources, cost),
      )}.`,
    };
  }
  return { ok: true, to, cost };
}

/** Nombre de créatures d'un type présentes dans la garnison et chez le visiteur. */
export function countInTown(state: GameState, town: TownState, creature: CreatureId): number {
  let total = 0;
  for (const s of town.garrison) if (s && s.creature === creature) total += s.count;
  const visitor = town.visitingHero ? state.heroes[town.visitingHero] : null;
  if (visitor) {
    for (const s of visitor.army) if (s && s.creature === creature) total += s.count;
  }
  return total;
}

/** Convertit `count` créatures d'un type en leur version améliorée. */
export function applyUpgrade(
  state: GameState,
  town: TownState,
  from: CreatureId,
  to: CreatureId,
  count: number,
): number {
  let left = count;
  const armies: (ArmyStack | null)[][] = [town.garrison];
  const visitor = town.visitingHero ? state.heroes[town.visitingHero] : null;
  if (visitor) armies.push(visitor.army);

  for (const army of armies) {
    for (let i = 0; i < army.length && left > 0; i++) {
      const s = army[i];
      if (!s || s.creature !== from) continue;
      const take = Math.min(left, s.count);
      s.count -= take;
      left -= take;
      if (s.count === 0) army[i] = null;
      addToArmy(army, to, take);
    }
  }
  return count - left;
}

/* ── Marché ─────────────────────────────────────────────────────────────── */

/** Rendement du marché du joueur, en BP (10000 = échange à valeur égale). */
export function marketBp(state: GameState, player: PlayerId): number {
  const p = state.players[player];
  if (!p) return MARKET_BASE_BP;
  let bp = MARKET_BASE_BP;
  let hasMarket = false;
  let merchant = false;
  for (const uid of p.towns) {
    const town = state.towns[uid];
    if (!town) continue;
    for (const id of town.built) {
      const def = content().BUILDINGS[id];
      if (!def) continue;
      for (const g of def.grants) if (g.kind === 'market') hasMarket = true;
    }
    if (town.charter === 'marchande') merchant = true;
  }
  if (hasMarket) bp += MARKET_BUILDING_BP;
  if (merchant) bp += 600;
  const trade = bestHeroBp(state, player, 'trade_bp');
  if (trade > 10000) bp += trade - 10000;
  return Math.min(MARKET_MAX_BP, bp);
}

/** Résultat d'un échange au marché. `taken` est toujours un entier. */
export function tradeOutcome(
  state: GameState,
  player: PlayerId,
  give: ResourceKey,
  giveAmount: number,
  take: ResourceKey,
): { ok: boolean; reason?: string; taken?: number; bp?: number } {
  if (!Number.isInteger(giveAmount) || giveAmount <= 0) {
    return { ok: false, reason: 'La quantité cédée doit être un entier positif.' };
  }
  if (give === take) {
    return { ok: false, reason: 'Le marché n’échange pas une ressource contre elle-même.' };
  }
  const p = state.players[player];
  if (!p) return { ok: false, reason: 'Bannière introuvable.' };
  if ((p.resources[give] | 0) < giveAmount) {
    return {
      ok: false,
      reason: `Réserves insuffisantes : vous n’avez pas ${giveAmount} de cette ressource.`,
    };
  }
  const bp = marketBp(state, player);
  const taken = Math.trunc((giveAmount * RESOURCE_VALUE[give] * bp) / (RESOURCE_VALUE[take] * 10000));
  if (taken < 1) {
    return {
      ok: false,
      reason: 'Le change proposé ne rapporterait rien : augmentez la quantité cédée.',
    };
  }
  return { ok: true, taken, bp };
}

/* ── Croissance hebdomadaire ────────────────────────────────────────────── */

/** Ratio de croissance propre à une cité, en BP (bâtiments et charte). */
export function townGrowthBp(town: TownState): number {
  let bp = 10000;
  for (const id of town.built) {
    const def = content().BUILDINGS[id];
    if (!def) continue;
    for (const g of def.grants) {
      if (g.kind === 'growth_bp') bp += g.bp;
    }
  }
  if (town.charter === 'militaire') bp += 1000;
  if (town.unrest > 50) bp -= 1000;
  return Math.max(5000, bp);
}

/**
 * Recrues gagnées par une cité au jour 1 d'une semaine.
 * `eventBp` est le modificateur de l'événement de semaine.
 */
export function weeklyGrowth(town: TownState, eventBp: number): Record<CreatureId, number> {
  const out: Record<CreatureId, number> = {};
  if (!town.owner) return out;
  const bp = townGrowthBp(town);
  for (const id of town.built) {
    const def = content().BUILDINGS[id];
    if (!def) continue;
    for (const g of def.grants) {
      if (g.kind !== 'dwelling') continue;
      const gain = Math.max(1, applyBp(applyBp(g.growth, bp), eventBp));
      out[g.creature] = (out[g.creature] ?? 0) + gain;
    }
  }
  return out;
}

/* ── Divers ─────────────────────────────────────────────────────────────── */

/** Vrai si la cité possède un bâtiment octroyant une capacité donnée. */
export function townHasGrant(town: TownState, kind: string): boolean {
  for (const id of town.built) {
    const def = content().BUILDINGS[id];
    if (!def) continue;
    for (const g of def.grants) if (g.kind === kind) return true;
  }
  return false;
}

/** Niveau maximal de la guilde des arts d'une cité. */
export function mageGuildLevel(town: TownState): number {
  let level = 0;
  for (const id of town.built) {
    const def = content().BUILDINGS[id];
    if (!def) continue;
    for (const g of def.grants) {
      if (g.kind === 'mage_guild' && g.level > level) level = g.level;
    }
  }
  return level;
}

/** Bonus de points de marche accordé par les écuries d'une cité. */
export function stablesBonus(town: TownState): number {
  let bonus = 0;
  for (const id of town.built) {
    const def = content().BUILDINGS[id];
    if (!def) continue;
    for (const g of def.grants) if (g.kind === 'stables') bonus += g.movement;
  }
  return bonus;
}
