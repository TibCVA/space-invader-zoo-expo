import { describe, expect, it } from 'vitest';
import type { CombatObstacle, GameEvent } from '../types.js';
import { HEX_ROWS } from '../types.js';
import { autoResolve, previewAutoResolve } from './auto.js';
import { livingUnits, sideHp } from './units.js';
import { COMBAT_TUNING } from './units.js';
import { army, makeBattle, makeHero } from './testkit.js';

function digest(events: GameEvent[]): string {
  return events
    .map((e) => (e.type === 'CombatAction' ? `${e.entry.kind}|${e.entry.text}` : e.type))
    .join('\n');
}

describe('autoResolve — déterminisme', () => {
  it('produit exactement la même bataille deux fois de suite', () => {
    const build = () =>
      makeBattle({
        attackerArmy: army(
          ['granit_t1', 40],
          ['granit_t3', 12],
          ['granit_t5', 6],
          ['granit_t7', 2],
        ),
        defenderArmy: army(
          ['ermitage_t1', 45],
          ['ermitage_t4', 10],
          ['ermitage_t6', 4],
          ['ermitage_t7', 2],
        ),
        seed: 20260816,
      });

    const first = build();
    const eventsA = autoResolve(first.state);
    const second = build();
    const eventsB = autoResolve(second.state);

    expect(eventsA.length).toBe(eventsB.length);
    expect(digest(eventsA)).toBe(digest(eventsB));
    expect(first.combat.winner).toBe(second.combat.winner);
    expect(first.combat.round).toBe(second.combat.round);
    expect(first.state.rng).toEqual(second.state.rng);
    for (let i = 0; i < first.combat.units.length; i++) {
      expect(first.combat.units[i].count).toBe(second.combat.units[i].count);
      expect(first.combat.units[i].at).toEqual(second.combat.units[i].at);
    }
  });

  it('des graines différentes donnent des batailles différentes', () => {
    const a = makeBattle({
      attackerArmy: army(['granit_t1', 40], ['granit_t3', 12]),
      defenderArmy: army(['ermitage_t1', 40], ['ermitage_t4', 12]),
      seed: 1,
    });
    const b = makeBattle({
      attackerArmy: army(['granit_t1', 40], ['granit_t3', 12]),
      defenderArmy: army(['ermitage_t1', 40], ['ermitage_t4', 12]),
      seed: 2,
    });
    const ea = digest(autoResolve(a.state));
    const eb = digest(autoResolve(b.state));
    expect(ea).not.toBe(eb);
  });

  it('désigne toujours un vainqueur et clôt le combat', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t5', 8], ['granit_t3', 20]),
      defenderArmy: army(['ermitage_t5', 8], ['ermitage_t4', 20]),
      seed: 555,
      attackerHero: makeHero('H1', 'P1', { vaillance: 3, garde: 2 }),
      defenderHero: makeHero('H2', 'P2', { vaillance: 2, garde: 3 }),
    });
    const events = autoResolve(state);
    expect(combat.finished).toBe(true);
    expect(combat.winner === 0 || combat.winner === 1).toBe(true);
    expect(events.some((e) => e.type === 'CombatEnded')).toBe(true);
    expect(livingUnits(combat, combat.winner === 0 ? 1 : 0).length).toBeGreaterThanOrEqual(0);
  });
});

describe('autoResolve — terminaison garantie', () => {
  it('se termine même si les deux camps ne peuvent pas s’atteindre', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t1', 20]),
      defenderArmy: army(['ermitage_t1', 20]),
      seed: 31337,
    });
    // Mur infranchissable : aucune pile au sol ne peut traverser la colonne 7.
    const wall: CombatObstacle[] = [];
    for (let row = 0; row < HEX_ROWS; row++) {
      wall.push({
        at: { col: 7, row },
        kind: 'rocher',
        state: 0,
        blocksMove: true,
        blocksSight: true,
      });
    }
    combat.obstacles = wall;

    const hpBefore = sideHp(combat, 0) + sideHp(combat, 1);
    const started = Date.now();
    const events = autoResolve(state);
    const elapsed = Date.now() - started;

    expect(combat.finished).toBe(true);
    expect(combat.round).toBeLessThanOrEqual(COMBAT_TUNING.maxRounds + 1);
    expect(elapsed).toBeLessThan(1000);
    expect(events.some((e) => e.type === 'CombatEnded')).toBe(true);
    // Personne n'a pu frapper : les points de vie sont intacts.
    expect(sideHp(combat, 0) + sideHp(combat, 1)).toBe(hpBefore);
  });

  it('se termine avec des piles entravées et immobiles', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
      seed: 8,
    });
    for (const u of combat.units) {
      u.effects.push({
        id: 'sys:entrave',
        kind: 'root',
        value: 1,
        turnsLeft: 999,
        source: 'test',
      });
    }
    autoResolve(state);
    expect(combat.finished).toBe(true);
  });

  it('respecte la limite de rounds', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t7', 1]),
      defenderArmy: army(['granit_t7', 1]),
      seed: 12,
    });
    autoResolve(state);
    expect(combat.round).toBeLessThanOrEqual(COMBAT_TUNING.maxRounds + 1);
    expect(combat.finished).toBe(true);
  });
});

describe('autoResolve — performance', () => {
  it('résout une bataille complète à sept piles en moins d’une seconde', () => {
    const durations: number[] = [];
    for (let i = 0; i < 12; i++) {
      const { state } = makeBattle({
        attackerArmy: army(
          ['granit_t1', 120],
          ['granit_t2', 60],
          ['granit_t3', 40],
          ['granit_t4', 24],
          ['granit_t5', 16],
          ['granit_t6', 8],
          ['granit_t7', 4],
        ),
        defenderArmy: army(
          ['ermitage_t1', 120],
          ['ermitage_t2', 60],
          ['ermitage_t3', 40],
          ['ermitage_t4', 24],
          ['ermitage_t5', 16],
          ['ermitage_t6', 8],
          ['ermitage_t7', 4],
        ),
        seed: 1000 + i,
      });
      const t0 = Date.now();
      autoResolve(state);
      durations.push(Date.now() - t0);
    }
    const worst = Math.max(...durations);
    expect(worst).toBeLessThan(1000);
  });
});

describe('previewAutoResolve', () => {
  it('ne modifie jamais l’état réel', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t5', 6]),
      defenderArmy: army(['ermitage_t5', 6]),
      seed: 4,
    });
    const before = JSON.stringify(state.combat);
    const preview = previewAutoResolve(state);
    expect(preview.winner === 0 || preview.winner === 1).toBe(true);
    expect(JSON.stringify(state.combat)).toBe(before);
    expect(combat.finished).toBe(false);
  });
});
