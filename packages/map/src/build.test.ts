import { afterAll, describe, expect, it } from 'vitest';
import {
  MAP_COLS,
  MAP_ROWS,
  computePath,
  createGame,
  linkEngineModules,
  mapPack,
  resetEngineModules,
  type GameSetup,
  type MapPack,
} from '@auvergne/engine';
import * as mapModule from './index.js';
import { MAP_VERSION, buildTerrain, buildWorld, elevationAt } from './build.js';
import { CELLS } from './grid.js';
import { anchorCell } from './anchors.js';
import { START_POSITIONS, START_SETS } from './starts.js';

describe('baril — contrat MapPack', () => {
  it('expose tout ce que registry.ts attend', () => {
    const pack: MapPack = mapModule;
    expect(typeof pack.MAP_VERSION).toBe('string');
    expect(pack.MAP_VERSION.length).toBeGreaterThan(3);
    expect(pack.START_POSITIONS).toBe(START_POSITIONS);
    expect(pack.START_SETS).toBe(START_SETS);
    expect(typeof pack.buildWorld).toBe('function');
  });

  it('expose la section @auvergne/map de docs/02-API.md', () => {
    expect(mapModule.MAP_VERSION).toBe(MAP_VERSION);
    expect(mapModule.BOUNDS).toEqual({
      west: 3.64,
      east: 3.8,
      south: 45.72,
      north: 45.9,
    });
    expect(Array.isArray(mapModule.ANCHORS)).toBe(true);
    expect(typeof mapModule.buildTerrain).toBe('function');
    expect(typeof mapModule.buildWorld).toBe('function');
    expect(typeof mapModule.latLonToCell).toBe('function');
    expect(typeof mapModule.cellToLatLon).toBe('function');
    expect(typeof mapModule.elevationAt).toBe('function');
  });
});

describe('buildTerrain', () => {
  const field = buildTerrain();

  it('rend la grille du brief, en tableaux typés', () => {
    expect(field.cols).toBe(MAP_COLS);
    expect(field.rows).toBe(MAP_ROWS);
    expect(field.terrain.length).toBe(CELLS);
    expect(field.region.length).toBe(CELLS);
    expect(field.elevation.length).toBe(CELLS);
    expect(field.slope.length).toBe(CELLS);
    expect(field.flags.length).toBe(CELLS);
  });

  it('est mémorisé : même instance à chaque appel', () => {
    expect(buildTerrain()).toBe(field);
    expect(buildTerrain().terrain).toBe(field.terrain);
  });
});

describe('buildWorld', () => {
  const world = buildWorld(7);

  it('remplit le contrat WorldMap du moteur', () => {
    expect(world.cols).toBe(MAP_COLS);
    expect(world.rows).toBe(MAP_ROWS);
    expect(world.objects.length).toBeGreaterThan(150);
    expect(world.anchors.length).toBeGreaterThan(10);
    expect(world.objectAt.length).toBe(CELLS);
  });

  it('mémorise par graine', () => {
    expect(buildWorld(7)).toBe(world);
  });

  it('protège le terrain mémorisé des mutations du monde', () => {
    const base = buildTerrain();
    expect(world.terrain).not.toBe(base.terrain);
    expect(world.flags).not.toBe(base.flags);
    expect(world.elevation).not.toBe(base.elevation);
    const before = base.terrain[1000];
    world.terrain[1000] = 255;
    expect(base.terrain[1000]).toBe(before);
    world.terrain[1000] = before;
  });

  it('normalise la graine sur 32 bits non signés', () => {
    expect(buildWorld(-1)).toBe(buildWorld(0xffffffff));
  });

  it('rend l’altitude d’une case, et 0 hors grille', () => {
    const arconsat = anchorCell('arconsat');
    expect(elevationAt(world, arconsat.col, arconsat.row)).toBe(700);
    expect(elevationAt(world, -1, 0)).toBe(0);
    expect(elevationAt(world, 0, MAP_ROWS)).toBe(0);
  });
});

describe('branchement dans le moteur', () => {
  afterAll(() => {
    resetEngineModules();
  });

  it('se branche par linkEngineModules et remplace la carte de secours', () => {
    linkEngineModules({ map: mapModule });
    expect(mapPack().MAP_VERSION).toBe(MAP_VERSION);
    expect(mapPack().START_POSITIONS.cervieres.at).toEqual(anchorCell('cervieres'));
  });

  it('permet au noyau de créer une partie jouable sur cette carte', () => {
    linkEngineModules({ map: mapModule });
    const world = buildWorld(4242);
    const setup: GameSetup = {
      seed: 4242,
      mapVersion: MAP_VERSION,
      contentVersion: 'test',
      duration: 'standard',
      victory: 'couronne',
      players: [
        {
          id: 'P1',
          name: 'Bannière du Nord',
          faction: 'granit',
          kind: 'humain',
          start: 'arconsat',
          hero: 'thibaut',
        },
        {
          id: 'P2',
          name: 'Bannière du Sud',
          faction: 'ermitage',
          kind: 'ia',
          aiProfile: 'equilibre',
          start: 'renaudie',
          hero: 'agathe',
        },
      ],
    };

    const state = createGame(setup, world);
    expect(state.phase).toBe('aventure');
    expect(state.hash.length).toBeGreaterThan(0);
    expect(Object.keys(state.towns).length).toBeGreaterThanOrEqual(5);
    // Les cinq Sceaux des Marches doivent être relevés depuis la carte.
    for (const seal of ['hautes_futaies', 'farges', 'pamole', 'hermitage', 'brumes'] as const) {
      expect(state.seals[seal].at.col, seal).toBeGreaterThan(0);
    }
  });

  it('laisse le moteur calculer un trajet vers la Maison du Trésor', () => {
    linkEngineModules({ map: mapModule });
    const world = buildWorld(4242);
    const setup: GameSetup = {
      seed: 4242,
      mapVersion: MAP_VERSION,
      contentVersion: 'test',
      duration: 'standard',
      victory: 'couronne',
      players: [
        {
          id: 'P1',
          name: 'Bannière du Nord',
          faction: 'granit',
          kind: 'humain',
          start: 'arconsat',
          hero: 'thibaut',
        },
        {
          id: 'P2',
          name: 'Bannière de l’Est',
          faction: 'ermitage',
          kind: 'ia',
          start: 'cervieres',
          hero: 'agathe',
        },
      ],
    };
    const state = createGame(setup, world);
    const hero = state.heroes[state.players.P1.heroes[0]];
    expect(hero).toBeDefined();
    const target = anchorCell('maison_tresor');
    const path = computePath(world, state, hero, target);
    expect(path, 'la Maison du Trésor doit être atteignable depuis Arconsat').not.toBeNull();
    const found = path as { path: { col: number; row: number }[]; costs: number[] };
    expect(found.path.length).toBeGreaterThan(40);
    expect(found.costs.length).toBe(found.path.length);
    for (const c of found.costs) expect(Number.isInteger(c)).toBe(true);
  });
});
