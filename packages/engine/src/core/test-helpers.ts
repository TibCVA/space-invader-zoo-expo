/**
 * Fabriques partagées par les tests du noyau.
 * Ce fichier n'est pas un test : il n'est pas ramassé par Vitest.
 */
import type { Command, GameSetup, GameState, WorldMap } from '../types.js';
import { applyCommand } from './apply.js';
import { createGame } from './create-game.js';
import { buildFallbackWorld } from './fallback-map.js';
import { FALLBACK_CONTENT_VERSION } from './fallback-content.js';
import { FALLBACK_MAP_VERSION } from './fallback-map.js';

export function testSetup(seed = 20260816, players = 2): GameSetup {
  const all: GameSetup['players'] = [
    { id: 'P1', name: 'Maison de Granit', faction: 'granit', kind: 'humain', start: 'arconsat', hero: 'thibaut' },
    { id: 'P2', name: 'Ermitage des Bois', faction: 'ermitage', kind: 'ia', aiProfile: 'equilibre', start: 'renaudie', hero: 'agathe' },
    { id: 'P3', name: 'Bannière de Cervières', faction: 'granit', kind: 'ia', aiProfile: 'prudent', start: 'cervieres', hero: 'georges' },
    { id: 'P4', name: 'Futaies de Viscomtat', faction: 'ermitage', kind: 'ia', aiProfile: 'agressif', start: 'viscomtat', hero: 'roxane' },
    { id: 'P5', name: 'Pays de Noirétable', faction: 'granit', kind: 'ia', aiProfile: 'expert', start: 'noiretable', hero: 'paul' },
  ];
  return {
    seed,
    mapVersion: FALLBACK_MAP_VERSION,
    contentVersion: FALLBACK_CONTENT_VERSION,
    duration: 'standard',
    victory: 'couronne',
    players: all.slice(0, players),
  };
}

export function testWorld(seed = 20260816): WorldMap {
  return buildFallbackWorld(seed);
}

export function newGame(seed = 20260816, players = 2): { state: GameState; world: WorldMap } {
  const world = testWorld(seed);
  return { state: createGame(testSetup(seed, players), world), world };
}

/** Applique une suite de commandes et renvoie l'état final. Lève si un refus survient. */
export function runCommands(
  state: GameState,
  world: WorldMap,
  commands: Command[],
  strict = false,
): { state: GameState; refusals: string[] } {
  let current = state;
  const refusals: string[] = [];
  for (const cmd of commands) {
    const result = applyCommand(current, cmd, world);
    if (!result.ok) {
      refusals.push(`${cmd.type} : ${result.error ?? ''}`);
      if (strict) throw new Error(`Commande refusée — ${cmd.type} : ${result.error}`);
      continue;
    }
    current = result.state;
  }
  return { state: current, refusals };
}

/** Premier héros du joueur donné. */
export function heroOf(state: GameState, player: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'): string {
  const uid = state.players[player].heroes[0];
  if (!uid) throw new Error(`Aucun héros pour ${player}`);
  return uid;
}

/** Première cité du joueur donné. */
export function townOf(state: GameState, player: 'P1' | 'P2' | 'P3' | 'P4' | 'P5'): string {
  const uid = state.players[player].towns[0];
  if (!uid) throw new Error(`Aucune cité pour ${player}`);
  return uid;
}
