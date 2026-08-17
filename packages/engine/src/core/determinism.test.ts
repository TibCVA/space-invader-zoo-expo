import { describe, expect, it } from 'vitest';
import type { Command, GameState } from '../types.js';
import { hashState } from '../hash.js';
import { applyCommand } from './apply.js';
import { createGame } from './create-game.js';
import { cloneState } from './clone.js';
import { computePath } from './pathfinding.js';
import { heroOf, newGame, testSetup, testWorld, townOf } from './test-helpers.js';

/** Suite de commandes représentative : tours, construction, recrutement, marche. */
function scenario(state: GameState): Command[] {
  const p1Hero = heroOf(state, 'P1');
  const p1Town = townOf(state, 'P1');
  const p2Hero = heroOf(state, 'P2');
  const p2Town = townOf(state, 'P2');
  const at = state.heroes[p1Hero].at;
  const at2 = state.heroes[p2Hero].at;

  return [
    { type: 'BuildInTown', town: p1Town, building: 'marche' },
    { type: 'RecruitCreatures', town: p1Town, creature: 'granit_t1', count: 5, toHero: p1Hero },
    { type: 'MoveHero', hero: p1Hero, to: { col: at.col, row: at.row + 6 } },
    { type: 'EndTurn' },
    { type: 'BuildInTown', town: p2Town, building: 'taverne' },
    { type: 'MoveHero', hero: p2Hero, to: { col: at2.col + 4, row: at2.row - 5 } },
    { type: 'EndTurn' },
    { type: 'TradeResources', give: 'bois', giveAmount: 5, take: 'ecus' },
    { type: 'BuildInTown', town: p1Town, building: 'granit_demeure_3' },
    { type: 'EndTurn' },
    { type: 'EndTurn' },
    { type: 'EndTurn' },
    { type: 'EndTurn' },
  ];
}

function play(seed: number): GameState {
  const world = testWorld(seed);
  let state = createGame(testSetup(seed, 2), world);
  for (const cmd of scenario(state)) {
    const result = applyCommand(state, cmd, world);
    if (result.ok) state = result.state;
  }
  return state;
}

describe('déterminisme du noyau', () => {
  it('deux parties identiques produisent exactement le même hash final', () => {
    const a = play(4242);
    const b = play(4242);

    expect(a.hash).toBe(b.hash);
    expect(a.turn).toBe(b.turn);
    expect(a.rng).toEqual(b.rng);
    expect(a.hash).toBe(hashState(a as unknown as Record<string, unknown>));
    // Le hash n'est pas dégénéré.
    expect(a.hash).toMatch(/^[0-9a-f]{16}$/);
  });

  it('deux graines différentes divergent', () => {
    expect(play(4242).hash).not.toBe(play(4243).hash);
  });

  it('createGame est reproductible, y compris l’ordre des joueurs et la météo', () => {
    const w = testWorld(777);
    const a = createGame(testSetup(777, 5), w);
    const b = createGame(testSetup(777, 5), w);
    expect(a.hash).toBe(b.hash);
    expect(a.turnOrder).toEqual(b.turnOrder);
    expect(a.weather).toEqual(b.weather);
    expect(a.turnOrder.length).toBe(5);
    expect(new Set(a.turnOrder).size).toBe(5);
  });

  it('une commande refusée laisse l’état d’origine strictement intact', () => {
    const { state, world } = newGame(31337);
    const before = state.hash;
    const snapshot = JSON.stringify({
      turn: state.turn,
      players: state.players,
      heroes: state.heroes,
    });

    const refused = applyCommand(
      state,
      { type: 'BuildInTown', town: townOf(state, 'P2'), building: 'marche' },
      world,
    );
    expect(refused.ok).toBe(false);
    expect(refused.error).toBeTruthy();
    expect(refused.state).toBe(state);
    expect(state.hash).toBe(before);
    expect(
      JSON.stringify({ turn: state.turn, players: state.players, heroes: state.heroes }),
    ).toBe(snapshot);
  });

  it('le clone ne partage aucune référence, brouillard compris', () => {
    const { state } = newGame(99);
    const copy = cloneState(state);

    expect(copy.hash).toBe(state.hash);
    expect(hashState(copy as unknown as Record<string, unknown>)).toBe(
      hashState(state as unknown as Record<string, unknown>),
    );

    expect(copy.players.P1.fog).not.toBe(state.players.P1.fog);
    expect(copy.players.P1.fog).toBeInstanceOf(Uint8Array);
    expect(copy.players.P1.fog.length).toBe(state.players.P1.fog.length);

    copy.players.P1.fog[0] = 2;
    copy.players.P1.resources.ecus = 1;
    const hero = copy.heroes[heroOf(copy, 'P1')];
    hero.at.col = 0;
    hero.army[0] = { creature: 'granit_t7', count: 999 };

    expect(state.players.P1.fog[0]).not.toBe(2);
    expect(state.players.P1.resources.ecus).not.toBe(1);
    expect(state.heroes[heroOf(state, 'P1')].at.col).not.toBe(0);
    expect(state.heroes[heroOf(state, 'P1')].army[0]?.count).not.toBe(999);
  });

  it('le hash change dès qu’une valeur simulée change, mais ignore le journal', () => {
    const { state } = newGame(5);
    const base = hashState(state as unknown as Record<string, unknown>);

    const withJournal = cloneState(state);
    withJournal.journal.push({ turn: 1, player: 'P1', text: 'note', kind: 'info' });
    expect(hashState(withJournal as unknown as Record<string, unknown>)).toBe(base);

    const withChange = cloneState(state);
    withChange.players.P1.resources.ecus += 1;
    expect(hashState(withChange as unknown as Record<string, unknown>)).not.toBe(base);
  });

  it('le calcul de chemin ne mute jamais l’état', () => {
    const { state, world } = newGame(1234);
    const before = hashState(state as unknown as Record<string, unknown>);
    const hero = state.heroes[heroOf(state, 'P1')];
    computePath(world, state, hero, { col: hero.at.col + 20, row: hero.at.row + 30 });
    expect(hashState(state as unknown as Record<string, unknown>)).toBe(before);
  });
});
