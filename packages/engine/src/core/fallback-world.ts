/**
 * Module « monde » de secours.
 *
 * `packages/engine/src/world` (progression, visites, météo, gabelle, victoire)
 * est écrit par un autre agent. Le noyau en a besoin en permanence : il fournit
 * donc une implémentation de repli complète et déterministe, remplacée dès que
 * `linkEngineModules({ world })` est appelé.
 *
 * Aucun `Math.random` : tous les tirages passent par `state.rng`.
 */
import {
  RESOURCE_KEYS,
  emptyResources,
  type ArtifactId,
  type GameEvent,
  type GameState,
  type HeroInstance,
  type MapCoord,
  type MapObject,
  type PlayerId,
  type PrimaryStat,
  type ResourceKey,
  type Resources,
  type SealId,
  type SkillEffect,
  type SkillId,
  type SkillOffer,
  type SkillRank,
  type SpellId,
  type WeatherKind,
  type WorldMap,
  dayOf,
  weekOf,
} from '../types.js';
import { nextInt, pickWeighted } from '../rng.js';
import {
  BASE_VISION,
  baseMovementFor,
  CLAIM_DURATION_TURNS,
  GABELLE,
  MAX_LEVEL,
  MAX_MOVEMENT,
  MAX_SKILLS,
  SEALS_REQUIRED,
  WEATHER_FALLBACK,
  WEATHER_LABELS,
  WEATHER_WEIGHTS,
  WEATHER_KINDS,
} from './constants.js';
import { content, type WorldModulePack } from './registry.js';
import { revealFog } from './fog.js';
import { applyBp, mergeDelta, sortedKeys } from './util.js';

/* ── Progression ────────────────────────────────────────────────────────── */

export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return 1000 * n + Math.trunc((250 * n * (n - 1)) / 2);
}

export function skillRank(hero: HeroInstance, skill: SkillId): 0 | 1 | 2 | 3 {
  for (const s of hero.skills) if (s.skill === skill) return s.rank;
  return 0;
}

export function activeEffects(state: GameState, hero: HeroInstance): SkillEffect[] {
  const out: SkillEffect[] = [];
  const table = content().SKILLS;
  for (const s of hero.skills) {
    const def = table[s.skill];
    if (!def) continue;
    const list = def.effects[s.rank - 1];
    if (list) out.push(...list);
  }
  const artifacts = content().ARTIFACTS;
  for (const slot of Object.keys(hero.artifacts).sort()) {
    const id = hero.artifacts[slot as keyof typeof hero.artifacts] as ArtifactId | undefined;
    if (!id) continue;
    const def = artifacts[id];
    if (def) out.push(...def.effects);
  }
  const hdef = content().HEROES[hero.def];
  if (hdef) {
    if (hdef.specialty.kind === 'movement') {
      out.push({ kind: 'movement', value: hdef.specialty.bonus });
    } else if (hdef.specialty.kind === 'vision') {
      out.push({ kind: 'vision', value: hdef.specialty.bonus });
    } else if (hdef.specialty.kind === 'skill') {
      const rank = skillRank(hero, hdef.specialty.skill);
      if (rank > 0) out.push({ kind: 'xp_bp', bp: hdef.specialty.bonusBp });
    }
  }
  void state;
  return out;
}

function sumEffect(effects: SkillEffect[], kind: 'movement' | 'vision' | 'morale' | 'fortune' | 'mana_regen'): number {
  let total = 0;
  for (const e of effects) {
    if (e.kind === kind) total += (e as { value: number }).value;
  }
  return total;
}

function productBp(effects: SkillEffect[], kind: 'movement_bp' | 'mana_max_bp'): number {
  let bp = 10000;
  for (const e of effects) {
    if (e.kind === kind) bp += e.bp - 10000;
  }
  return bp;
}

export function heroStats(
  state: GameState,
  hero: HeroInstance,
): {
  vaillance: number;
  garde: number;
  mystique: number;
  savoir: number;
  movementMax: number;
  vision: number;
  manaMax: number;
  morale: number;
  fortune: number;
} {
  const effects = activeEffects(state, hero);
  const artifacts = content().ARTIFACTS;
  let vaillance = hero.vaillance;
  let garde = hero.garde;
  let mystique = hero.mystique;
  let savoir = hero.savoir;
  for (const slot of Object.keys(hero.artifacts).sort()) {
    const id = hero.artifacts[slot as keyof typeof hero.artifacts] as ArtifactId | undefined;
    if (!id) continue;
    const def = artifacts[id];
    if (!def || !def.primary) continue;
    vaillance += def.primary.vaillance ?? 0;
    garde += def.primary.garde ?? 0;
    mystique += def.primary.mystique ?? 0;
    savoir += def.primary.savoir ?? 0;
  }

  /* Même règle que la fiche complète : la pile la plus lente donne le pas. */
  const creatures = content().CREATURES;
  let lente: number | null = null;
  for (const stack of hero.army) {
    if (!stack || stack.count <= 0) continue;
    const cdef = creatures[stack.creature];
    if (!cdef) continue;
    if (lente === null || cdef.speed < lente) lente = cdef.speed;
  }
  const movementMax = Math.min(
    MAX_MOVEMENT,
    applyBp(baseMovementFor(lente) + sumEffect(effects, 'movement'), productBp(effects, 'movement_bp')),
  );
  const vision = Math.max(2, BASE_VISION + sumEffect(effects, 'vision'));
  const manaMax = Math.max(10, applyBp(savoir * 10, productBp(effects, 'mana_max_bp')));
  const morale = Math.max(-3, Math.min(3, sumEffect(effects, 'morale')));
  const fortune = Math.max(-3, Math.min(3, sumEffect(effects, 'fortune')));
  return { vaillance, garde, mystique, savoir, movementMax, vision, manaMax, morale, fortune };
}

const PRIMARY_ORDER: PrimaryStat[] = ['vaillance', 'garde', 'mystique', 'savoir'];

function rollPrimary(state: GameState, hero: HeroInstance): PrimaryStat {
  const def = content().HEROES[hero.def];
  const weights = PRIMARY_ORDER.map((stat) => {
    let w = 25;
    if (def) {
      const start = def.start[stat];
      w += start * 8;
    }
    return { item: stat, weight: Math.max(1, w) };
  });
  return pickWeighted(state.rng, weights);
}

function rollSkillOffers(state: GameState, hero: HeroInstance): [SkillOffer, SkillOffer] {
  const def = content().HEROES[hero.def];
  const table = content().SKILLS;
  const candidates: { item: SkillOffer; weight: number }[] = [];
  for (const id of Object.keys(table).sort()) {
    const rank = skillRank(hero, id);
    if (rank >= 3) continue;
    if (rank === 0 && hero.skills.length >= MAX_SKILLS) continue;
    const weight = def?.skillWeights[id] ?? 20;
    if (weight <= 0) continue;
    candidates.push({ item: { skill: id, rank: (rank + 1) as SkillRank }, weight });
  }
  if (candidates.length === 0) {
    const fallback: SkillOffer = { skill: hero.skills[0]?.skill ?? 'logistique', rank: 1 };
    return [fallback, fallback];
  }
  const first = pickWeighted(state.rng, candidates);
  const rest = candidates.filter((c) => c.item.skill !== first.skill);
  const second = rest.length > 0 ? pickWeighted(state.rng, rest) : first;
  return [first, second];
}

export function grantXp(state: GameState, hero: HeroInstance, xp: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (xp <= 0) return events;
  let bonus = 10000;
  for (const e of activeEffects(state, hero)) {
    if (e.kind === 'xp_bp') bonus += e.bp - 10000;
  }
  hero.xp += Math.max(1, applyBp(xp, bonus));

  while (hero.level < MAX_LEVEL && hero.xp >= xpForLevel(hero.level + 1)) {
    hero.level++;
    const primary = rollPrimary(state, hero);
    hero[primary] += 1;
    hero.pendingLevelUp = { choices: rollSkillOffers(state, hero), primary };
    const stats = heroStats(state, hero);
    hero.manaMax = stats.manaMax;
    hero.movementMax = stats.movementMax;
    events.push({ type: 'HeroLeveled', hero: hero.uid, level: hero.level, primary });
  }
  return events;
}

export function applyLevelChoice(
  state: GameState,
  hero: HeroInstance,
  skill: SkillId,
): GameEvent[] {
  const pending = hero.pendingLevelUp;
  if (!pending) return [];
  const offer = pending.choices.find((c) => c.skill === skill) ?? pending.choices[0];
  const existing = hero.skills.find((s) => s.skill === offer.skill);
  if (existing) {
    existing.rank = offer.rank;
  } else {
    hero.skills.push({ skill: offer.skill, rank: offer.rank });
    hero.skills.sort((a, b) => (a.skill < b.skill ? -1 : a.skill > b.skill ? 1 : 0));
  }
  hero.pendingLevelUp = null;
  const def = content().SKILLS[offer.skill];
  const stats = heroStats(state, hero);
  hero.movementMax = stats.movementMax;
  hero.manaMax = stats.manaMax;
  return [
    {
      type: 'Notice',
      player: hero.owner,
      text: `${content().HEROES[hero.def]?.name ?? hero.uid} apprend ${
        def ? def.name : offer.skill
      } (${def ? def.ranks[offer.rank - 1] : 'rang ' + offer.rank}).`,
      severity: 'info',
    },
  ];
}

/* ── Visite d'objets ────────────────────────────────────────────────────── */

function giveResources(
  state: GameState,
  player: PlayerId,
  delta: Partial<Resources>,
  reason: string,
): GameEvent[] {
  const p = state.players[player];
  if (!p) return [];
  for (const k of RESOURCE_KEYS) {
    const d = delta[k];
    if (d) p.resources[k] = Math.max(0, (p.resources[k] | 0) + d);
  }
  return [{ type: 'ResourcesChanged', player, delta, reason }];
}

export function visitObject(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  obj: MapObject,
): GameEvent[] {
  const events: GameEvent[] = [];
  const owner = hero.owner;
  const live = state.objects[obj.uid] ?? obj;
  const visited = live.visitedBy ?? [];

  switch (live.kind) {
    case 'ressource': {
      if (live.spent) break;
      const resource = live.data.resource as ResourceKey | undefined;
      const amount = (live.data.amount as number | undefined) ?? 0;
      if (resource && amount > 0) {
        events.push(...giveResources(state, owner, { [resource]: amount }, 'trouvaille'));
      }
      live.spent = true;
      events.push({
        type: 'ObjectVisited',
        hero: hero.uid,
        object: live.uid,
        result: 'ressource_ramassee',
      });
      break;
    }
    case 'mine': {
      if (live.owner === owner) break;
      live.owner = owner;
      events.push({
        type: 'ObjectVisited',
        hero: hero.uid,
        object: live.uid,
        result: 'mine_prise',
      });
      events.push({
        type: 'Notice',
        player: owner,
        text: `Le site de ${String(live.data.resource ?? 'ressource')} passe sous votre bannière.`,
        severity: 'info',
      });
      break;
    }
    case 'artefact': {
      if (live.spent) break;
      const artifact = live.data.artifact as ArtifactId | undefined;
      if (artifact) {
        hero.backpack.push(artifact);
        const def = content().ARTIFACTS[artifact];
        events.push({
          type: 'Notice',
          player: owner,
          text: `${def ? def.name : artifact} rejoint votre besace.`,
          severity: 'info',
        });
      }
      live.spent = true;
      events.push({
        type: 'ObjectVisited',
        hero: hero.uid,
        object: live.uid,
        result: 'artefact_trouve',
      });
      break;
    }
    case 'sceau': {
      const seal = live.data.seal as SealId | undefined;
      if (!seal) break;
      const previous = state.seals[seal]?.owner ?? null;
      if (previous === owner) break;
      if (previous && state.players[previous]) {
        const list = state.players[previous].seals;
        const at = list.indexOf(seal);
        if (at >= 0) list.splice(at, 1);
      }
      live.owner = owner;
      state.seals[seal] = { owner, at: { col: live.at.col, row: live.at.row } };
      const p = state.players[owner];
      if (p && !p.seals.includes(seal)) {
        p.seals.push(seal);
        p.seals.sort();
      }
      events.push({ type: 'SealTaken', seal, by: owner });
      break;
    }
    case 'maison_tresor': {
      const p = state.players[owner];
      if (!p) break;
      if (p.seals.length < SEALS_REQUIRED) {
        events.push({
          type: 'Notice',
          player: owner,
          text: `La Maison du Trésor reste scellée : il faut ${SEALS_REQUIRED} Sceaux des Marches, vous en détenez ${p.seals.length}.`,
          severity: 'warn',
        });
        break;
      }
      live.owner = owner;
      if (state.claim && state.claim.by !== owner) {
        events.push({ type: 'ClaimBroken', by: state.claim.by });
      }
      state.claim = {
        by: owner,
        startedTurn: state.turn,
        endsAtTurn: state.turn + CLAIM_DURATION_TURNS,
      };
      events.push({ type: 'ClaimStarted', by: owner, endsAtTurn: state.claim.endsAtTurn });
      events.push({
        type: 'Notice',
        player: null,
        text: `Une proclamation est lancée depuis la Maison du Trésor. Elle doit tenir jusqu’au jour ${state.claim.endsAtTurn}.`,
        severity: 'danger',
      });
      break;
    }
    case 'belvedere': {
      const cells = revealFog(state, world, owner, live.at, 22);
      if (cells.length > 0) events.push({ type: 'FogRevealed', player: owner, cells });
      events.push({
        type: 'ObjectVisited',
        hero: hero.uid,
        object: live.uid,
        result: 'panorama',
      });
      break;
    }
    case 'source':
    case 'sanctuaire': {
      if (visited.includes(owner)) break;
      const stats = heroStats(state, hero);
      hero.mana = stats.manaMax;
      if (live.kind === 'sanctuaire') {
        hero.savoir += 1;
        const p = state.players[owner];
        if (p) p.reputation += 1;
      }
      live.visitedBy = [...visited, owner];
      events.push({
        type: 'ObjectVisited',
        hero: hero.uid,
        object: live.uid,
        result: 'benediction',
      });
      break;
    }
    case 'auberge': {
      const p = state.players[owner];
      if (!p) break;
      p.tavernOffers = drawTavernOffers(state, owner);
      events.push({
        type: 'ObjectVisited',
        hero: hero.uid,
        object: live.uid,
        result: 'auberge',
      });
      break;
    }
    case 'caravane': {
      if (live.spent) break;
      const delta: Partial<Resources> = {};
      mergeDelta(delta, { ecus: 400, sel: 3 });
      events.push(...giveResources(state, owner, delta, 'caravane'));
      live.spent = true;
      break;
    }
    case 'borne': {
      if (!visited.includes(owner)) live.visitedBy = [...visited, owner];
      events.push({
        type: 'ObjectVisited',
        hero: hero.uid,
        object: live.uid,
        result: 'borne_decouverte',
      });
      break;
    }
    case 'quete': {
      events.push({
        type: 'Notice',
        player: owner,
        text: 'Un villageois vous confie une requête. Le Grand Livre en gardera trace.',
        severity: 'info',
      });
      if (!visited.includes(owner)) live.visitedBy = [...visited, owner];
      break;
    }
    default:
      break;
  }
  return events;
}

/** Deux noms tirés au sort à l'auberge, hors héros déjà en jeu. */
export function drawTavernOffers(state: GameState, player: PlayerId): string[] {
  const p = state.players[player];
  if (!p) return [];
  const inPlay = new Set<string>();
  for (const uid of Object.keys(state.heroes)) inPlay.add(state.heroes[uid].def);
  const pool: { item: string; weight: number }[] = [];
  const heroes = content().HEROES;
  for (const id of Object.keys(heroes).sort()) {
    if (inPlay.has(id)) continue;
    const def = heroes[id];
    if (def.faction !== p.faction && def.faction !== 'neutre') continue;
    pool.push({ item: id, weight: def.faction === 'neutre' ? 10 : 40 });
  }
  const out: string[] = [];
  for (let i = 0; i < 2 && pool.length > 0; i++) {
    const pickId = pickWeighted(state.rng, pool);
    out.push(pickId);
    const at = pool.findIndex((c) => c.item === pickId);
    if (at >= 0) pool.splice(at, 1);
  }
  return out;
}

/* ── Sorts d'aventure ───────────────────────────────────────────────────── */

export function castAdventureSpell(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  spell: SpellId,
  target?: MapCoord,
): GameEvent[] {
  const events: GameEvent[] = [];
  const def = content().SPELLS[spell];
  if (!def) return events;
  for (const effect of def.effects) {
    switch (effect.kind) {
      case 'movement':
        hero.movement = Math.min(hero.movementMax * 2, hero.movement + effect.value);
        events.push({
          type: 'Notice',
          player: hero.owner,
          text: `${def.name} : ${effect.value} points de marche supplémentaires.`,
          severity: 'info',
        });
        break;
      case 'vision':
      case 'reveal_map': {
        const at = target ?? hero.at;
        const cells = revealFog(state, world, hero.owner, at, effect.radius);
        if (cells.length > 0) events.push({ type: 'FogRevealed', player: hero.owner, cells });
        break;
      }
      case 'weather_shift': {
        const forecast = state.weather.forecast;
        state.weather.current = forecast[0];
        state.weather.forecast = [forecast[1], drawWeather(state)];
        events.push({
          type: 'WeatherChanged',
          current: state.weather.current,
          forecast: state.weather.forecast,
        });
        break;
      }
      case 'teleport': {
        if (target && target.col >= 0 && target.row >= 0) {
          hero.at = { col: target.col, row: target.row };
          const cells = revealFog(state, world, hero.owner, hero.at, heroStats(state, hero).vision);
          if (cells.length > 0) events.push({ type: 'FogRevealed', player: hero.owner, cells });
        }
        break;
      }
      default:
        break;
    }
  }
  return events;
}

/* ── Météo ──────────────────────────────────────────────────────────────── */

export function weatherModifiers(w: WeatherKind): {
  moveBp: number;
  visionBp: number;
  rangedBp: number;
  flyBp: number;
  flankBp: number;
} {
  return WEATHER_FALLBACK[w] ?? WEATHER_FALLBACK.eclaircie;
}

export function drawWeather(state: GameState): WeatherKind {
  return pickWeighted(
    state.rng,
    WEATHER_KINDS.map((k) => ({ item: k, weight: WEATHER_WEIGHTS[k] })),
  );
}

export function advanceWeather(state: GameState): GameEvent[] {
  if (state.weather.delayedBy) {
    // Côme a retardé le front d'un jour : la prévision ne bouge pas.
    state.weather.delayedBy = null;
    return [
      {
        type: 'Notice',
        player: null,
        text: 'Le front est retardé d’un jour : le temps ne change pas.',
        severity: 'info',
      },
    ];
  }
  const [next, then] = state.weather.forecast;
  state.weather.current = next;
  state.weather.forecast = [then, drawWeather(state)];
  return [
    {
      type: 'WeatherChanged',
      current: state.weather.current,
      forecast: state.weather.forecast,
    },
    {
      type: 'Notice',
      player: null,
      text: `${WEATHER_LABELS[state.weather.current]} sur le Forez. Prévision : ${
        WEATHER_LABELS[state.weather.forecast[0]]
      }, puis ${WEATHER_LABELS[state.weather.forecast[1]]}.`,
      severity: 'info',
    },
  ];
}

/* ── Gabelle ────────────────────────────────────────────────────────────── */

export function gabelleIncome(state: GameState): { ecus: number; sel: number; unrest: number } {
  const policy = GABELLE[state.gabelle] ?? GABELLE.mesure;
  const holder = maisonTresorOwner(state);
  if (!holder) return { ecus: 0, sel: 0, unrest: 0 };
  return { ecus: policy.ecus, sel: policy.sel, unrest: policy.unrest };
}

export function maisonTresorOwner(state: GameState): PlayerId | null {
  for (const uid of Object.keys(state.objects).sort()) {
    const obj = state.objects[uid];
    if (obj.kind === 'maison_tresor') return obj.owner;
  }
  return null;
}

/* ── Événement de semaine ───────────────────────────────────────────────── */

export function weeklyEvent(state: GameState): GameEvent[] {
  const table = content().WEEK_EVENTS;
  if (table.length === 0) {
    return [{ type: 'WeekPassed', week: weekOf(state.turn), eventKey: null }];
  }
  const chosen = pickWeighted(
    state.rng,
    table.map((e) => ({ item: e, weight: Math.max(1, e.weight) })),
  );
  return [
    { type: 'WeekPassed', week: weekOf(state.turn), eventKey: chosen.key },
    {
      type: 'Notice',
      player: null,
      text: `${chosen.name} — ${chosen.text}`,
      severity: 'info',
    },
  ];
}

/** Ratio de croissance porté par l'événement de semaine, en BP. */
export function weekEventGrowthBp(key: string | null): number {
  if (!key) return 10000;
  const def = content().WEEK_EVENTS.find((e) => e.key === key);
  if (!def) return 10000;
  for (const effect of def.effects as { kind: string; bp?: number }[]) {
    if (effect.kind === 'growth_bp' && typeof effect.bp === 'number') return effect.bp;
  }
  return 10000;
}

/* ── Victoire ───────────────────────────────────────────────────────────── */

function alivePlayers(state: GameState): PlayerId[] {
  return state.turnOrder.filter((id) => state.players[id]?.alive);
}

/** Sept jours de grâce sans cité — même règle que le module monde. */
const JOURS_SANS_CITE_REPLI = 7;

export function checkVictory(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  if (state.phase === 'termine') return events;

  /*
   * Un seul mode : la prise de tous les châteaux adverses. Le repli suit la
   * même règle que le module monde — sept jours de grâce sans cité, puis la
   * maison s'éteint — sans les annonces de prestige, qui sont l'affaire du
   * module complet. Ni Couronne, ni Maître des Marches, ni victoire au score :
   * la mesure a montré ce que valait un monde où l'on gagnait sans conquérir.
   */
  for (const id of state.turnOrder) {
    const p = state.players[id];
    if (!p || !p.alive) continue;
    if (p.towns.length === 0 && p.sansCiteDepuis === undefined) {
      p.sansCiteDepuis = state.turn;
    } else if (p.towns.length > 0 && p.sansCiteDepuis !== undefined) {
      delete p.sansCiteDepuis;
    }
  }

  for (const id of state.turnOrder) {
    const p = state.players[id];
    if (!p || !p.alive) continue;
    const hasHero = p.heroes.some((uid) => state.heroes[uid]);
    const graceEchue =
      p.sansCiteDepuis !== undefined && state.turn - p.sansCiteDepuis >= JOURS_SANS_CITE_REPLI;
    if ((p.towns.length === 0 && !hasHero) || graceEchue) {
      p.alive = false;
      p.defeatedAtTurn = state.turn;
      events.push({ type: 'PlayerDefeated', player: id });
    }
  }

  const alive = alivePlayers(state);
  if (alive.length === 1) {
    return [...events, ...endGame(state, alive[0], 'Dernière bannière debout.')];
  }
  if (alive.length === 0) {
    return [...events, ...endGame(state, null, 'Plus aucune bannière en lice.')];
  }

  /* La proclamation de la Maison du Trésor survit comme événement de prestige :
     rompue si la Maison change de main, mais elle ne couronne plus personne. */
  if (state.claim) {
    const holder = maisonTresorOwner(state);
    if (holder !== state.claim.by) {
      events.push({ type: 'ClaimBroken', by: state.claim.by });
      state.claim = null;
    }
  }

  return events;
}

function endGame(state: GameState, winner: PlayerId | null, reason: string): GameEvent[] {
  state.phase = 'termine';
  state.winner = winner;
  state.endReason = reason;
  return [{ type: 'GameEnded', winner, reason }];
}

/* ── Assemblage ─────────────────────────────────────────────────────────── */

export function fallbackWorldModule(): WorldModulePack {
  return {
    heroStats,
    skillRank,
    activeEffects,
    grantXp,
    applyLevelChoice,
    xpForLevel,
    visitObject,
    castAdventureSpell,
    advanceWeather,
    weatherModifiers,
    gabelleIncome,
    checkVictory,
    weeklyEvent,
    drawTavernOffers,
  };
}

/** Ressources vides typées, réexportées pour les tests. */
export function zeroResources(): Resources {
  return emptyResources();
}

export { dayOf, nextInt, sortedKeys };
