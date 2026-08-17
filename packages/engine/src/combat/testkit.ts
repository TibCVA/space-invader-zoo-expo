/**
 * Échafaudage de tests du module de combat (usage interne, non exporté par le
 * baril). Construit des états de jeu minimaux mais valides.
 */

import type {
  ArmyStack,
  CombatState,
  CreatureId,
  GameState,
  HeroInstance,
  PlayerId,
  PlayerState,
  RegionId,
  SealId,
  Terrain,
  WeatherKind,
} from '../types.js';
import { emptyResources } from '../types.js';
import { createRng } from '../rng.js';
import { startCombat } from './start.js';

export function army(...stacks: [CreatureId, number][]): (ArmyStack | null)[] {
  const out: (ArmyStack | null)[] = [null, null, null, null, null, null, null];
  for (let i = 0; i < stacks.length && i < 7; i++) {
    out[i] = { creature: stacks[i][0], count: stacks[i][1] };
  }
  return out;
}

export function makeHero(uid: string, owner: PlayerId, over: Partial<HeroInstance> = {}): HeroInstance {
  return {
    uid,
    def: 'thibaut',
    owner,
    level: 1,
    xp: 0,
    vaillance: 0,
    garde: 0,
    mystique: 0,
    savoir: 0,
    mana: 0,
    manaMax: 0,
    movement: 2000,
    movementMax: 2000,
    at: { col: 10, row: 10 },
    facing: 0,
    army: army(),
    artifacts: {},
    backpack: [],
    skills: [],
    spells: [],
    inTown: null,
    downUntilTurn: 0,
    pendingLevelUp: null,
    path: null,
    ...over,
  };
}

function makePlayer(id: PlayerId): PlayerState {
  return {
    id,
    name: `Bannière ${id}`,
    faction: id === 'P1' ? 'granit' : 'ermitage',
    color: '#8C2230',
    pattern: 0,
    kind: 'humain',
    resources: emptyResources(),
    heroes: [],
    towns: [],
    fog: new Uint8Array(1),
    seals: [],
    alive: true,
    reputation: 0,
    buildQueue: [],
    tavernOffers: [],
  };
}

export function makeState(seed = 1234, weather: WeatherKind = 'eclaircie'): GameState {
  const seals: Record<SealId, { owner: PlayerId | null; at: { col: number; row: number } }> = {
    hautes_futaies: { owner: null, at: { col: 0, row: 0 } },
    farges: { owner: null, at: { col: 0, row: 0 } },
    pamole: { owner: null, at: { col: 0, row: 0 } },
    hermitage: { owner: null, at: { col: 0, row: 0 } },
    brumes: { owner: null, at: { col: 0, row: 0 } },
  };
  return {
    engineVersion: 'test',
    contentVersion: 'test',
    mapVersion: 'test',
    id: 'partie_test',
    seed,
    rng: createRng(seed),
    turn: 1,
    activePlayer: 'P1',
    turnOrder: ['P1', 'P2'],
    players: {
      P1: makePlayer('P1'),
      P2: makePlayer('P2'),
      P3: makePlayer('P3'),
      P4: makePlayer('P4'),
      P5: makePlayer('P5'),
    },
    heroes: {},
    towns: {},
    objects: {},
    weather: { current: weather, forecast: [weather, weather], delayedBy: null },
    gabelle: 'mesure',
    seals,
    claim: null,
    phase: 'aventure',
    combat: null,
    winner: null,
    endReason: null,
    nextUid: 1,
    journal: [],
    hash: '',
  };
}

export interface BattleOptions {
  attackerArmy: (ArmyStack | null)[];
  defenderArmy: (ArmyStack | null)[];
  attackerHero?: HeroInstance;
  defenderHero?: HeroInstance;
  terrain?: Terrain;
  region?: RegionId;
  siege?: boolean;
  seed?: number;
  weather?: WeatherKind;
}

export function makeBattle(opts: BattleOptions): { state: GameState; combat: CombatState } {
  const state = makeState(opts.seed ?? 1234, opts.weather ?? 'eclaircie');
  if (opts.attackerHero) state.heroes[opts.attackerHero.uid] = opts.attackerHero;
  if (opts.defenderHero) state.heroes[opts.defenderHero.uid] = opts.defenderHero;
  const combat = startCombat(state, {
    attacker: {
      player: 'P1',
      hero: opts.attackerHero ? opts.attackerHero.uid : null,
      army: opts.attackerArmy,
    },
    defender: {
      player: 'P2',
      hero: opts.defenderHero ? opts.defenderHero.uid : null,
      town: null,
      army: opts.defenderArmy,
    },
    terrain: opts.terrain ?? 'prairie',
    region: opts.region ?? 'vallee_durolle',
    siege: opts.siege ?? false,
  });
  return { state, combat };
}
