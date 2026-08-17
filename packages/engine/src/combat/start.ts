/**
 * Ouverture d'un combat : création des piles, déploiement (2 ou 3 rangées
 * selon la Tactique), obstacles tirés de la région, champ de bataille de siège.
 *
 * Tous les tirages passent par `state.rng` : deux exécutions identiques
 * produisent exactement le même champ de bataille.
 */

import type {
  ArmyStack,
  CombatObstacle,
  CombatState,
  CombatUnit,
  CreatureDef,
  FactionId,
  GameEvent,
  GameState,
  HeroUid,
  HexCoord,
  PlayerId,
  RegionId,
  Terrain,
  TownUid,
} from '../types.js';
import { HEX_COLS, HEX_ROWS } from '../types.js';
import { nextInt, shuffle } from '../rng.js';
import { hexEquals, inBounds } from './hex.js';
import { creatureDef } from './content.js';
import { deploymentRows, heroCombatBonuses } from './hero.js';
import {
  FX,
  addEffect,
  applyForestMemory,
  baseRetaliations,
  updateOathFormations,
} from './units.js';
import { buildInitiativeOrder, recomputeMoraleAndFortune } from './order.js';
import { buildSiegeField, SIEGE_MOAT_COL, SIEGE_WALL_COL } from './siege.js';
import { pushLog } from './log.js';

export interface CombatSideSetup {
  player: PlayerId;
  hero: HeroUid | null;
  army: (ArmyStack | null)[];
}

export interface CombatDefenderSetup {
  player: PlayerId | null;
  hero: HeroUid | null;
  town: TownUid | null;
  army: (ArmyStack | null)[];
}

export interface StartCombatParams {
  attacker: CombatSideSetup;
  defender: CombatDefenderSetup;
  terrain: Terrain;
  region: RegionId;
  siege: boolean;
}

/* ─────────────────────────── Rangées de déploiement ─────────────────────── */

/**
 * Lignes occupées selon le nombre de piles : dispositif symétrique, centré,
 * identique pour les deux camps.
 */
const ROW_LAYOUT: readonly (readonly number[])[] = [
  [],
  [5],
  [3, 7],
  [2, 5, 8],
  [1, 4, 6, 9],
  [1, 3, 5, 7, 9],
  [0, 2, 4, 6, 8],
  [0, 2, 3, 5, 7, 8, 10],
];

/** Colonne de base d'un camp, en fonction des rangées de Tactique. */
export function deployColumn(side: 0 | 1, rows: number, large: boolean, siege: boolean): number {
  if (siege) {
    if (side === 1) return large ? SIEGE_WALL_COL + 2 : SIEGE_WALL_COL + 3;
    return large ? 1 : 0;
  }
  const advance = rows - 2; // 0 sans Tactique, 1 avec Tactique experte
  if (side === 0) return (large ? 1 : 0) + advance;
  return HEX_COLS - 1 - (large ? 1 : 0) - advance;
}

/** Zone de déploiement affichable avant la bataille. */
export function deploymentZone(side: 0 | 1, rows: number, siege: boolean): HexCoord[] {
  const out: HexCoord[] = [];
  const base = deployColumn(side, rows, false, siege);
  for (let i = 0; i < rows; i++) {
    const col = side === 0 ? base + i : base - i;
    if (col < 0 || col >= HEX_COLS) continue;
    for (let row = 0; row < HEX_ROWS; row++) out.push({ col, row });
  }
  return out;
}

/* ──────────────────────────────── Obstacles ─────────────────────────────── */

const REGION_OBSTACLES: Record<RegionId, CombatObstacle['kind'][]> = {
  hauts_arconsat: ['souche', 'rocher', 'ronce'],
  vallee_durolle: ['souche', 'ronce'],
  lac_sagnes: ['rocher', 'ronce'],
  maison_tresor: ['rocher', 'mur'],
  chatellenie_cervieres: ['mur', 'rocher'],
  futaies_viscomtat: ['souche', 'souche', 'ronce'],
  coeur_bois_noirs: ['souche', 'ronce', 'rocher'],
  pays_noiretable: ['ronce', 'rocher'],
  hermitage_peyrotine: ['rocher', 'souche'],
  vollore_pamole: ['rocher', 'rocher'],
  marche_renaudie: ['ronce', 'souche'],
  grande_chaussee: ['ronce'],
};

const TERRAIN_OBSTACLE_COUNT: Record<Terrain, [number, number]> = {
  route: [1, 3],
  chemin: [2, 4],
  prairie: [2, 4],
  foret: [5, 8],
  pente: [3, 6],
  humide: [3, 5],
  rocher: [5, 8],
  eau: [2, 4],
};

/**
 * Sème les obstacles au centre du champ (colonnes 3 à 11) sans jamais fermer
 * complètement une ligne ni bloquer une zone de déploiement.
 */
export function scatterObstacles(state: GameState, combat: CombatState): void {
  const kinds = REGION_OBSTACLES[combat.region] ?? ['rocher'];
  const [lo, hi] = TERRAIN_OBSTACLE_COUNT[combat.terrain] ?? [2, 4];
  const count = nextInt(state.rng, lo, hi);

  const candidates: HexCoord[] = [];
  for (let col = 3; col <= HEX_COLS - 4; col++) {
    for (let row = 0; row < HEX_ROWS; row++) candidates.push({ col, row });
  }
  shuffle(state.rng, candidates);

  const perRow = new Map<number, number>();
  const placed: CombatObstacle[] = [];
  for (const at of candidates) {
    if (placed.length >= count) break;
    const used = perRow.get(at.row) ?? 0;
    if (used >= 2) continue; // jamais plus de deux obstacles sur une même ligne
    if (placed.some((o) => hexEquals(o.at, at))) continue;
    const kind = kinds[nextInt(state.rng, 0, kinds.length - 1)];
    placed.push({
      at,
      kind,
      state: 0,
      blocksMove: true,
      blocksSight: kind !== 'ronce',
    });
    perRow.set(at.row, used + 1);
  }
  combat.obstacles = placed;
}

/* ───────────────────────────── Création des piles ───────────────────────── */

function makeUnit(
  side: 0 | 1,
  slot: number,
  stack: ArmyStack,
  def: CreatureDef,
  at: HexCoord,
  attackBonus: number,
  defenseBonus: number,
): CombatUnit {
  const unit: CombatUnit = {
    uid: `${side === 0 ? 'A' : 'D'}${slot}`,
    side,
    slot,
    creature: stack.creature,
    count: stack.count,
    startCount: stack.count,
    topHp: def.hp,
    at,
    facing: side === 0 ? 0 : 3,
    attack: def.attack + attackBonus,
    defense: def.defense + defenseBonus,
    speed: def.speed,
    initiative: def.initiative,
    shots: def.shooter ? (def.shots ?? 10) : 0,
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
  return unit;
}

function deploySide(
  state: GameState,
  combat: CombatState,
  side: 0 | 1,
  army: (ArmyStack | null)[],
  heroUid: HeroUid | null,
  siege: boolean,
): void {
  const hero = heroUid ? (state.heroes[heroUid] ?? null) : null;
  const bonuses = heroCombatBonuses(hero);
  const rows = deploymentRows(bonuses, hero);

  const stacks: { slot: number; stack: ArmyStack; def: CreatureDef }[] = [];
  for (let slot = 0; slot < army.length && slot < 7; slot++) {
    const s = army[slot];
    if (!s || s.count <= 0) continue;
    stacks.push({ slot, stack: s, def: creatureDef(s.creature) });
  }
  if (stacks.length === 0) return;

  const layout = ROW_LAYOUT[Math.min(stacks.length, 7)];
  const taken: HexCoord[] = [];
  for (let i = 0; i < stacks.length; i++) {
    const entry = stacks[i];
    const large = entry.def.size === 2;
    const baseCol = deployColumn(side, rows, large, siege);
    const row = layout[i] ?? i;
    let at: HexCoord = { col: baseCol, row };
    // Recherche d'une case libre en cas de collision (grandes créatures).
    for (let attempt = 0; attempt < HEX_ROWS * 3; attempt++) {
      const conflict =
        taken.some((t) => hexEquals(t, at)) ||
        combat.obstacles.some((o) => o.blocksMove && hexEquals(o.at, at)) ||
        !inBounds(at) ||
        (large && !inBounds({ col: side === 0 ? at.col - 1 : at.col + 1, row: at.row }));
      if (!conflict) break;
      const nextRow = (at.row + 1) % HEX_ROWS;
      at = { col: at.col, row: nextRow };
    }
    taken.push(at);
    if (large) taken.push({ col: side === 0 ? at.col - 1 : at.col + 1, row: at.row });
    combat.units.push(
      makeUnit(side, entry.slot, entry.stack, entry.def, at, bonuses.attack, bonuses.defense),
    );
  }
}

/* ─────────────────────────────── Ouverture ──────────────────────────────── */

/** Faction dominante d'une armée, pour l'habillage du siège. */
function armyFaction(army: (ArmyStack | null)[]): FactionId {
  for (const s of army) {
    if (!s || s.count <= 0) continue;
    try {
      return creatureDef(s.creature).faction;
    } catch {
      continue;
    }
  }
  return 'granit';
}

/**
 * Ouvre un combat et l'installe dans l'état (`state.combat`, `phase = combat`).
 * Retourne l'état de combat créé.
 */
export function startCombat(state: GameState, params: StartCombatParams): CombatState {
  const id = `combat_${state.turn}_${params.attacker.player}_${(state.rng.hi ^ state.rng.lo) >>> 0}`;

  const combat: CombatState = {
    id,
    attacker: { player: params.attacker.player, hero: params.attacker.hero },
    defender: {
      player: params.defender.player,
      hero: params.defender.hero,
      town: params.defender.town,
    },
    units: [],
    obstacles: [],
    terrain: params.terrain,
    region: params.region,
    weather: state.weather.current,
    siege: params.siege,
    round: 0,
    order: [],
    activeIndex: 0,
    spellCastThisRound: {
      P1: false,
      P2: false,
      P3: false,
      P4: false,
      P5: false,
    },
    log: [],
    finished: false,
    winner: null,
  };

  if (params.siege) {
    buildSiegeField(combat, armyFaction(params.defender.army));
  } else {
    scatterObstacles(state, combat);
  }

  deploySide(state, combat, 0, params.attacker.army, params.attacker.hero, params.siege);
  deploySide(state, combat, 1, params.defender.army, params.defender.hero, params.siege);

  updateOathFormations(combat);
  applyForestMemory(combat);
  recomputeMoraleAndFortune(state, combat);
  buildInitiativeOrder(combat);

  state.combat = combat;
  state.phase = 'combat';

  const opening: GameEvent[] = [];
  pushLog(
    combat,
    opening,
    'info',
    params.siege
      ? `Siège engagé sur ${terrainLabel(params.terrain)}, météo : ${weatherLabel(combat.weather)}.`
      : `Bataille engagée sur ${terrainLabel(params.terrain)}, météo : ${weatherLabel(combat.weather)}.`,
    { terrain: params.terrain, region: params.region },
  );

  // Premier round.
  combat.round = 0;
  combat.activeIndex = 0;
  openFirstRound(state, combat);
  return combat;
}

/** Ouvre le round 1 sans passer par les effets périodiques de fin de round. */
function openFirstRound(state: GameState, combat: CombatState): void {
  combat.round = 1;
  combat.activeIndex = 0;
  for (const unit of combat.units) {
    unit.hasMoved = false;
    unit.hasWaited = false;
    unit.defending = false;
    unit.retaliationsLeft = baseRetaliations(unit);
  }
  // Le fossé de siège freine dès le premier round les piles au contact.
  if (combat.siege) {
    for (const unit of combat.units) {
      if (unit.side === 0 && unit.at.col >= SIEGE_MOAT_COL) {
        addEffect(unit, {
          id: FX.slow,
          kind: 'debuff',
          stat: 'speed',
          value: 0,
          turnsLeft: 1,
          source: 'Fossé',
        });
      }
    }
  }
  buildInitiativeOrder(combat);
}

export function terrainLabel(t: Terrain): string {
  switch (t) {
    case 'route':
      return 'la grande chaussée';
    case 'chemin':
      return 'un chemin creux';
    case 'prairie':
      return 'une prairie';
    case 'foret':
      return 'une futaie';
    case 'pente':
      return 'une forte pente';
    case 'humide':
      return 'une sagne humide';
    case 'rocher':
      return 'un chaos rocheux';
    case 'eau':
      return 'un gué';
    default:
      return 'un terrain inconnu';
  }
}

export function weatherLabel(w: CombatState['weather']): string {
  switch (w) {
    case 'eclaircie':
      return 'éclaircie';
    case 'pluie':
      return 'pluie';
    case 'brume':
      return 'brume';
    case 'givre':
      return 'givre';
    case 'vent':
      return 'vent des crêtes';
    default:
      return 'temps incertain';
  }
}
