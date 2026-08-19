import { describe, expect, it } from 'vitest';
import { MAP_COLS, MAP_ROWS } from '../types.js';
import { computePath, invalidatePathCache, pathDayCount, pathDays } from './pathfinding.js';
import { stepCost } from './movement.js';
import { areAdjacent } from './util.js';
import { heroOf, newGame } from './test-helpers.js';

describe('A* hiérarchique', () => {
  it('la carte de travail a bien les dimensions du brief', () => {
    const { world } = newGame(11);
    expect(world.cols).toBe(MAP_COLS);
    expect(world.rows).toBe(MAP_ROWS);
    expect(world.terrain.length).toBe(MAP_COLS * MAP_ROWS);
  });

  it('produit un chemin contigu dont les coûts correspondent au terrain', () => {
    const { state, world } = newGame(11);
    const hero = state.heroes[heroOf(state, 'P1')];
    const target = { col: hero.at.col + 12, row: hero.at.row + 18 };

    const route = computePath(world, state, hero, target);
    expect(route).not.toBeNull();
    if (!route) return;

    expect(route.path.length).toBeGreaterThan(0);
    expect(route.costs.length).toBe(route.path.length);
    expect(route.path[route.path.length - 1]).toEqual(target);

    let previous = hero.at;
    for (let i = 0; i < route.path.length; i++) {
      expect(areAdjacent(previous, route.path[i])).toBe(true);
      expect(route.costs[i]).toBeGreaterThan(0);
      expect(Number.isInteger(route.costs[i])).toBe(true);
      expect(route.costs[i]).toBe(stepCost(world, state, previous, route.path[i], []));
      previous = route.path[i];
    }
  });

  it('calcule un trajet long (Arconsat → La Renaudie) en moins de 150 ms', () => {
    const { state, world } = newGame(11);
    const hero = state.heroes[heroOf(state, 'P1')];
    // Arconsat (117, 25) → La Renaudie (132, 378) : la plus longue diagonale utile.
    const target = state.towns['T_renaudie'].at;

    // Chauffe : construction du graphe de blocs et de la table de coûts.
    computePath(world, state, hero, { col: hero.at.col + 3, row: hero.at.row + 3 });

    const samples: number[] = [];
    for (let i = 0; i < 5; i++) {
      invalidatePathCache();
      const start = performance.now();
      const route = computePath(world, state, hero, target);
      samples.push(performance.now() - start);
      expect(route).not.toBeNull();
      /* Le trajet traverse la carte du nord au sud : sa longueur se compte en
         cases et suit donc la hauteur de la grille, passée de 416 à 184. */
      expect(route?.path.length).toBeGreaterThan(MAP_ROWS - 40);
    }
    const median = samples.slice().sort((a, b) => a - b)[2];
    console.log("[perf] trajet Arconsat→La Renaudie :", samples.map((s) => s.toFixed(1)).join(" / "), "ms");
    // Trace utile si la machine d'intégration est lente.
    expect(median, `médiane mesurée : ${median.toFixed(1)} ms`).toBeLessThan(150);
  });

  it('retourne null pour une destination infranchissable ou hors carte', () => {
    const { state, world } = newGame(11);
    const hero = state.heroes[heroOf(state, 'P1')];

    expect(computePath(world, state, hero, { col: -1, row: 10 })).toBeNull();
    expect(computePath(world, state, hero, { col: MAP_COLS, row: 10 })).toBeNull();

    // Une case d'eau sans pont n'est jamais atteignable.
    let water = -1;
    for (let i = 0; i < world.terrain.length; i++) {
      if (world.terrain[i] === 7 && (world.flags[i] & 4) === 0) {
        water = i;
        break;
      }
    }
    expect(water).toBeGreaterThanOrEqual(0);
    const at = { col: water % world.cols, row: Math.floor(water / world.cols) };
    expect(computePath(world, state, hero, at)).toBeNull();
  });

  it('un chemin vers soi-même est vide', () => {
    const { state, world } = newGame(11);
    const hero = state.heroes[heroOf(state, 'P1')];
    expect(computePath(world, state, hero, hero.at)).toEqual({ path: [], costs: [] });
  });
});

describe('pathDays', () => {
  it('découpe le chemin en journées de marche', () => {
    const costs = [100, 100, 100, 100, 100];
    expect(pathDays(costs, 250, 300)).toEqual([0, 0, 1, 1, 1]);
    expect(pathDayCount(costs, 250, 300)).toBe(2);
  });

  it('tout tient dans la journée si les points suffisent', () => {
    expect(pathDays([70, 70, 70], 1800, 1800)).toEqual([0, 0, 0]);
  });

  it('un héros sans point de marche part demain', () => {
    expect(pathDays([100, 100], 0, 1800)).toEqual([1, 1]);
  });

  it('un pas plus coûteux qu’une journée entière ne boucle pas', () => {
    expect(pathDays([5000, 100], 100, 1800)).toEqual([1, 2]);
  });

  it('un chemin vide ne consomme aucune journée', () => {
    expect(pathDays([], 1800, 1800)).toEqual([]);
    expect(pathDayCount([], 1800, 1800)).toBe(0);
  });
});
