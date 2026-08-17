/**
 * Création d'une partie complète et jouable.
 *
 * `createGame(setup, world)` place les bannières sur les positions de départ
 * publiées par `@auvergne/map`, dote chaque joueur d'une capitale avec ses
 * bâtiments de départ, d'un héros et de son armée initiale issus de
 * `@auvergne/content`, des ressources de sa faction, tire l'ordre des joueurs
 * avec le PRNG, prépare la météo, relève les sceaux et lève le brouillard
 * initial. L'état retourné est immédiatement jouable et haché.
 */
import {
  emptyResources,
  type ArmyStack,
  type FactionId,
  type GameSetup,
  type GameState,
  type HeroInstance,
  type HeroUid,
  type MapCoord,
  type PlayerId,
  type PlayerState,
  type SealId,
  type TownState,
  type TownUid,
  type WeatherKind,
  type WorldMap,
} from '../types.js';
import { createRng, shuffle } from '../rng.js';
import { hashState } from '../hash.js';
import {
  ARMY_SLOTS,
  ENGINE_VERSION,
  GARRISON_SLOTS,
  TURN_ORDER_COMPENSATION_ECUS,
} from './constants.js';
import { encodeGameId } from './config.js';
import { content, mapPack, worldModule, type StartKey } from './registry.js';
import { addToArmy, applyBuildingGrants } from './economy.js';
import { initialReveal, journal } from './turn.js';
import { drawWeather } from './fallback-world.js';
import { invalidatePathCache } from './pathfinding.js';
import { cloneResources, sameCoord } from './util.js';
import { isPassable } from './util.js';

/** Couleurs et motifs des cinq bannières (bible artistique §2). */
const BANNERS: { color: string; pattern: number }[] = [
  { color: '#8C2230', pattern: 0 },
  { color: '#2E5F8A', pattern: 1 },
  { color: '#B8891F', pattern: 2 },
  { color: '#2F6B45', pattern: 3 },
  { color: '#5B3A6E', pattern: 4 },
];

/** Bâtiments présents dès le premier jour dans une capitale. */
function startingBuildings(faction: FactionId): string[] {
  return [`${faction}_demeure_1`, `${faction}_demeure_2`, 'taverne'];
}

/* ── Validation ─────────────────────────────────────────────────────────── */

export function validateSetup(setup: GameSetup): string[] {
  const errors: string[] = [];
  if (!Number.isInteger(setup.seed)) errors.push('La graine doit être un entier.');
  if (setup.players.length < 2) errors.push('Il faut au moins deux bannières.');
  if (setup.players.length > 5) errors.push('Cinq bannières au maximum.');

  const ids = new Set<string>();
  const starts = new Set<string>();
  for (const p of setup.players) {
    if (ids.has(p.id)) errors.push(`Deux bannières portent l’identifiant ${p.id}.`);
    ids.add(p.id);
    if (starts.has(p.start)) {
      errors.push(`Deux bannières partent de ${p.start}.`);
    }
    starts.add(p.start);
    if (p.faction !== 'granit' && p.faction !== 'ermitage') {
      errors.push(`Faction inconnue pour ${p.id} : ${p.faction}.`);
    }
    if (!content().HEROES[p.hero]) {
      errors.push(`Héros inconnu pour ${p.id} : ${p.hero}.`);
    }
    if (!mapPack().START_POSITIONS[p.start as StartKey]) {
      errors.push(`Position de départ inconnue : ${p.start}.`);
    }
  }
  return errors;
}

/* ── Fabriques ──────────────────────────────────────────────────────────── */

function emptyArmy(size: number): (ArmyStack | null)[] {
  return new Array(size).fill(null) as (ArmyStack | null)[];
}

function makeTown(
  uid: TownUid,
  name: string,
  faction: FactionId,
  owner: PlayerId | null,
  at: MapCoord,
  isCapital: boolean,
): TownState {
  const town: TownState = {
    uid,
    name,
    faction,
    owner,
    at: { col: at.col, row: at.row },
    built: [],
    builtThisTurn: false,
    available: {},
    garrison: emptyArmy(GARRISON_SLOTS),
    visitingHero: null,
    garrisonHero: null,
    spells: [],
    charter: null,
    isCapital,
    unrest: 0,
  };
  if (owner) {
    for (const id of startingBuildings(faction)) {
      if (!content().BUILDINGS[id]) continue;
      town.built.push(id);
      applyBuildingGrants(town, id);
    }
    town.built.sort();
  }
  return town;
}

function makeHero(
  state: GameState,
  uid: HeroUid,
  defId: string,
  owner: PlayerId,
  at: MapCoord,
): HeroInstance {
  const def = content().hero(defId);
  const hero: HeroInstance = {
    uid,
    def: defId,
    owner,
    level: 1,
    xp: 0,
    vaillance: def.start.vaillance,
    garde: def.start.garde,
    mystique: def.start.mystique,
    savoir: def.start.savoir,
    mana: 0,
    manaMax: 0,
    movement: 0,
    movementMax: 0,
    at: { col: at.col, row: at.row },
    facing: 4,
    army: emptyArmy(ARMY_SLOTS),
    artifacts: {},
    backpack: [],
    skills: def.start.skills.map((s) => ({ skill: s.skill, rank: s.rank })),
    spells: def.start.spells.slice(),
    inTown: null,
    downUntilTurn: 0,
    pendingLevelUp: null,
    path: null,
  };
  for (const stack of def.start.army) {
    addToArmy(hero.army, stack.creature, stack.count);
  }
  const stats = worldModule().heroStats(state, hero);
  hero.manaMax = stats.manaMax;
  hero.mana = stats.manaMax;
  hero.movementMax = stats.movementMax;
  hero.movement = stats.movementMax;
  return hero;
}

/** Case libre adjacente à la cité où planter le premier héros. */
function heroSpawn(world: WorldMap, town: MapCoord, taken: MapCoord[]): MapCoord {
  const offsets: MapCoord[] = [
    { col: 0, row: 1 },
    { col: 1, row: 1 },
    { col: -1, row: 1 },
    { col: 1, row: 0 },
    { col: -1, row: 0 },
    { col: 0, row: 2 },
    { col: 2, row: 1 },
    { col: -2, row: 1 },
  ];
  for (const o of offsets) {
    const candidate = { col: town.col + o.col, row: town.row + o.row };
    if (!isPassable(world, candidate.col, candidate.row)) continue;
    if (taken.some((t) => sameCoord(t, candidate))) continue;
    return candidate;
  }
  return { col: town.col, row: town.row };
}

/* ── Création ───────────────────────────────────────────────────────────── */

export function createGame(setup: GameSetup, world: WorldMap): GameState {
  const errors = validateSetup(setup);
  if (errors.length > 0) {
    throw new Error(`Configuration de partie invalide : ${errors.join(' ')}`);
  }

  invalidatePathCache();

  const rng = createRng(setup.seed >>> 0);
  const cells = world.cols * world.rows;

  const players = {} as Record<PlayerId, PlayerState>;
  const heroes: Record<HeroUid, HeroInstance> = {};
  const towns: Record<TownUid, TownState> = {};
  const objects: Record<string, import('../types.js').MapObject> = {};

  // Copie de travail des objets de la carte : c'est l'état qui les fait vivre.
  for (const template of world.objects) {
    objects[template.uid] = {
      uid: template.uid,
      kind: template.kind,
      at: { col: template.at.col, row: template.at.row },
      footprint: template.footprint.map((c) => ({ col: c.col, row: c.row })),
      entrance: { col: template.entrance.col, row: template.entrance.row },
      owner: template.owner,
      data: JSON.parse(JSON.stringify(template.data)) as Record<string, unknown>,
      ...(template.guard ? { guard: template.guard.map((s) => ({ ...s })) } : {}),
      ...(template.visitedBy ? { visitedBy: template.visitedBy.slice() } : {}),
      ...(template.spent !== undefined ? { spent: template.spent } : {}),
    };
  }

  const seals = {} as Record<SealId, { owner: PlayerId | null; at: MapCoord }>;
  const sealIds: SealId[] = ['hautes_futaies', 'farges', 'pamole', 'hermitage', 'brumes'];
  for (const id of sealIds) seals[id] = { owner: null, at: { col: 0, row: 0 } };
  for (const uid of Object.keys(objects).sort()) {
    const obj = objects[uid];
    if (obj.kind !== 'sceau') continue;
    const seal = obj.data.seal as SealId | undefined;
    if (seal && seals[seal]) seals[seal] = { owner: null, at: { col: obj.at.col, row: obj.at.row } };
  }

  const state: GameState = {
    engineVersion: ENGINE_VERSION,
    contentVersion: setup.contentVersion || content().CONTENT_VERSION,
    mapVersion: setup.mapVersion || mapPack().MAP_VERSION,
    id: encodeGameId(setup),
    seed: setup.seed >>> 0,
    rng,
    turn: 1,
    activePlayer: setup.players[0].id,
    turnOrder: [],
    players,
    heroes,
    towns,
    objects,
    weather: { current: 'eclaircie', forecast: ['eclaircie', 'eclaircie'], delayedBy: null },
    gabelle: 'mesure',
    seals,
    claim: null,
    phase: 'setup',
    combat: null,
    winner: null,
    endReason: null,
    nextUid: 1,
    journal: [],
    hash: '',
  };

  // 1. Ordre des joueurs, tiré au sort (doc §14.4).
  const order = setup.players.map((p) => p.id);
  shuffle(state.rng, order);
  state.turnOrder = order;
  state.activePlayer = order[0];

  // 2. Cités : toutes les positions de départ existent, occupées ou non.
  const startPositions = mapPack().START_POSITIONS;
  const claimed = new Map<string, { player: PlayerId; faction: FactionId }>();
  for (const p of setup.players) claimed.set(p.start, { player: p.id, faction: p.faction });

  for (const key of (Object.keys(startPositions) as StartKey[]).sort()) {
    const sp = startPositions[key];
    const owner = claimed.get(key);
    // Les capitales inoccupées deviennent des seigneuries neutres fortifiées.
    const faction: FactionId = owner ? owner.faction : key === 'cervieres' ? 'granit' : 'ermitage';
    const town = makeTown(
      sp.townUid,
      sp.label,
      faction,
      owner ? owner.player : null,
      sp.at,
      true,
    );
    if (!owner) {
      town.garrison[0] = { creature: `${faction}_t3`, count: 16 };
      town.garrison[1] = { creature: `${faction}_t2`, count: 22 };
    }
    towns[town.uid] = town;
  }

  // 3. Centres neutres capturables déclarés par la carte.
  for (const uid of Object.keys(objects).sort()) {
    const obj = objects[uid];
    if (obj.kind !== 'village') continue;
    const townUid = obj.data.townUid as TownUid | undefined;
    if (!townUid || towns[townUid]) continue;
    towns[townUid] = makeTown(
      townUid,
      (obj.data.name as string) ?? townUid,
      'granit',
      null,
      obj.at,
      false,
    );
  }

  // 4. Joueurs, ressources et héros.
  const takenCells: MapCoord[] = [];
  for (let i = 0; i < setup.players.length; i++) {
    const conf = setup.players[i];
    const banner = BANNERS[Number(conf.id.slice(1)) - 1] ?? BANNERS[i];
    const faction = content().FACTIONS[conf.faction];
    const resources = faction ? cloneResources(faction.startingResources) : emptyResources();

    // Compensation des positions jouant plus tard (anti-avantage du premier).
    const rank = order.indexOf(conf.id);
    resources.ecus += rank * TURN_ORDER_COMPENSATION_ECUS;

    const player: PlayerState = {
      id: conf.id,
      name: conf.name,
      faction: conf.faction,
      color: banner.color,
      pattern: banner.pattern,
      kind: conf.kind,
      resources,
      heroes: [],
      towns: [],
      fog: new Uint8Array(cells),
      seals: [],
      alive: true,
      reputation: 0,
      buildQueue: [],
      tavernOffers: [],
    };
    if (conf.aiProfile) player.aiProfile = conf.aiProfile;
    players[conf.id] = player;

    const sp = startPositions[conf.start as StartKey];
    const town = towns[sp.townUid];
    if (town) {
      town.owner = conf.id;
      town.faction = conf.faction;
      town.built = [];
      town.available = {};
      for (const id of startingBuildings(conf.faction)) {
        if (!content().BUILDINGS[id]) continue;
        town.built.push(id);
        applyBuildingGrants(town, id);
      }
      town.built.sort();
      town.garrison = emptyArmy(GARRISON_SLOTS);
      player.towns.push(town.uid);
    }

    const spawn = heroSpawn(world, sp.at, takenCells);
    takenCells.push(spawn);
    const uid = `H${state.nextUid++}`;
    const hero = makeHero(state, uid, conf.hero, conf.id, spawn);
    hero.inTown = null;
    heroes[uid] = hero;
    player.heroes.push(uid);
  }

  // 5. Météo : le jour courant et deux jours de prévision.
  const first: WeatherKind = drawWeather(state);
  state.weather = {
    current: first,
    forecast: [drawWeather(state), drawWeather(state)],
    delayedBy: null,
  };

  // 6. Brouillard initial.
  state.phase = 'aventure';
  initialReveal(state, world);

  journal(state, null, 'Le dernier comte est mort. Cinq bannières se lèvent sur le Forez.', 'info');
  for (const id of order) {
    const p = players[id];
    if (p) journal(state, id, `${p.name} prend la tête de sa maison.`, 'info');
  }

  state.hash = hashState(state as unknown as Record<string, unknown>);
  return state;
}
