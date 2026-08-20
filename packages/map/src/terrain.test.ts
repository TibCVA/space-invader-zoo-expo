import { describe, expect, it } from 'vitest';
import {
  CELL_BRIDGE,
  CELL_BUILDABLE,
  CELL_CACHE,
  CELL_EDGE,
  CELL_PASSABLE,
  CELL_ROAD,
  TERRAINS,
  TERRAIN_COST,
  type Terrain,
} from '@auvergne/engine';
import { anchorCell } from './anchors.js';
import { buildTerrain } from './build.js';
import { CELLS, COLS, ROWS, idx } from './grid.js';
import { buildHydrography } from './hydrography.js';
import {
  FOREST_LABELS,
  STEEP_SLOPE,
  couvre,
  distanceToWater,
  forestKindAt,
  franchissable,
} from './terrain.js';

const field = buildTerrain();
const hydro = buildHydrography();
const name = (i: number): Terrain => TERRAINS[field.terrain[i]];

function census(): Record<Terrain, number> {
  const out = {} as Record<Terrain, number>;
  for (const t of TERRAINS) out[t] = 0;
  for (let i = 0; i < CELLS; i++) out[name(i)]++;
  return out;
}

describe('biomes — répartition', () => {
  const counts = census();

  it('emploie les huit terrains du contrat', () => {
    for (const t of TERRAINS) {
      expect(counts[t], `terrain absent : ${t}`).toBeGreaterThan(0);
    }
  });

  it('dessine un massif boisé, pas une lande ni une futaie continue', () => {
    expect(counts.foret * 100).toBeGreaterThan(CELLS * 25);
    expect(counts.foret * 100).toBeLessThan(CELLS * 60);
    expect(counts.prairie * 100).toBeGreaterThan(CELLS * 20);
    expect(counts.prairie * 100).toBeLessThan(CELLS * 60);
  });

  it('garde les terrains coûteux minoritaires', () => {
    expect(counts.rocher * 100).toBeLessThan(CELLS * 6);
    expect(counts.pente * 100).toBeLessThan(CELLS * 16);
    expect(counts.humide * 100).toBeLessThan(CELLS * 10);
    expect(counts.eau * 100).toBeLessThan(CELLS * 3);
  });

  it('ne pave pas la carte de routes', () => {
    /*
     * Les voies sont larges d'une case ; leur longueur suit la carte (÷ 2,26)
     * mais la surface suit son aire (÷ 5,12). Le même réseau — celui qui relie
     * les mêmes lieux, car la géographie n'a pas changé — occupe donc une part
     * deux fois plus grande d'une carte deux fois plus petite : 5,3 % contre
     * 2,4 %. Ce n'est pas un pavage, c'est de l'arithmétique. La borne monte
     * à 8 %, ce que porte une XL de HMM3, et garde son sens : la voie reste
     * l'exception, jamais le fond de carte.
     */
    expect((counts.route + counts.chemin) * 100).toBeLessThan(CELLS * 8);
    expect(counts.route * 1000).toBeGreaterThan(CELLS * 6);
    expect(counts.chemin * 1000).toBeGreaterThan(CELLS * 20);
  });
});

describe('biomes — logique altitudinale', () => {
  it('met le rocher sur les crêtes, pas dans les vallées', () => {
    let rockAlt = 0;
    let rock = 0;
    let meadowAlt = 0;
    let meadow = 0;
    for (let i = 0; i < CELLS; i++) {
      if (name(i) === 'rocher') {
        rockAlt += field.elevation[i];
        rock++;
      } else if (name(i) === 'prairie') {
        meadowAlt += field.elevation[i];
        meadow++;
      }
    }
    expect(rock).toBeGreaterThan(200);
    /*
     * Le rocher domine la prairie, mais moins nettement qu'avant : depuis qu'il
     * ferme le passage, son seuil de pente est descendu de 17° à 13° pour que
     * le relief coupe enfin des zones (4 points d'articulation, il en faut 12).
     * Il prend donc aussi des versants de mi-pente, plus bas que les seules
     * barres sommitales. L'écart mesuré tombe de 97 m à 78 ; la hiérarchie
     * tient, elle est simplement moins caricaturale.
     */
    expect(Math.trunc(rockAlt / rock)).toBeGreaterThan(Math.trunc(meadowAlt / meadow) + 60);
  });

  it('met la forte pente sur les versants raides', () => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < CELLS; i++) {
      if (name(i) !== 'pente') continue;
      sum += field.slope[i];
      n++;
    }
    expect(n).toBeGreaterThan(Math.trunc(CELLS / 50));
    /* La moyenne doit atteindre le seuil qui définit la forte pente — c'est
       la même constante, pas un nombre recopié : elle a suivi le passage à
       une case de 109 m, où un gradient se mesure sur 218 m et non sur 96. */
    expect(Math.trunc(sum / n)).toBeGreaterThanOrEqual(STEEP_SLOPE);
  });

  it('met la prairie dans les fonds : plus plate que la moyenne', () => {
    let meadow = 0;
    let meadowSlope = 0;
    let all = 0;
    for (let i = 0; i < CELLS; i++) {
      all += field.slope[i];
      if (name(i) !== 'prairie') continue;
      meadowSlope += field.slope[i];
      meadow++;
    }
    expect(meadowSlope / meadow).toBeLessThan(all / CELLS);
  });

  it('distingue sapinière, hêtraie-sapinière et hêtraie', () => {
    /* Les deux témoins sont nommés, pas numérotés : le sommet des Bois Noirs
       porte la sapinière d'altitude, Arconsat la hêtraie de piémont. Ils
       étaient donnés en cases de l'ancienne grille — (154, 151) et (117, 25) —
       et désignaient depuis le changement d'échelle deux points quelconques. */
    const boisNoirs = anchorCell('bois_noirs');
    const arconsat = anchorCell('arconsat');
    expect(forestKindAt(field.elevation, boisNoirs.col, boisNoirs.row)).toBe('sapiniere');
    expect(forestKindAt(field.elevation, arconsat.col, arconsat.row)).toBe('hetraie');
    const kinds = new Set<string>();
    for (let i = 0; i < CELLS; i += 37) {
      if (name(i) !== 'foret') continue;
      kinds.add(forestKindAt(field.elevation, i % COLS, (i / COLS) | 0));
    }
    expect(kinds.size).toBe(3);
    for (const k of Object.values(FOREST_LABELS)) expect(k.length).toBeGreaterThan(4);
  });

  it('classe les tourbières en zone humide', () => {
    let bog = 0;
    let wet = 0;
    for (let i = 0; i < CELLS; i++) {
      if (hydro.bog[i] !== 1) continue;
      if (hydro.water[i] === 1) continue;
      if ((field.flags[i] & CELL_ROAD) !== 0) continue;
      bog++;
      if (name(i) === 'humide' || name(i) === 'prairie') wet++;
    }
    /* Une surface, donc une part de la grille. */
    expect(bog * 1000).toBeGreaterThan(CELLS * 2);
    expect(wet * 100).toBeGreaterThan(bog * 85);
  });
});

describe('drapeaux — cohérence avec le terrain', () => {
  it('n’ouvre CELL_PASSABLE que là où l’on peut réellement passer', () => {
    const faults: string[] = [];
    for (let i = 0; i < CELLS; i++) {
      const passable = (field.flags[i] & CELL_PASSABLE) !== 0;
      const bridged = (field.flags[i] & CELL_BRIDGE) !== 0;
      /*
       * Trois familles : l'eau se franchit là où un pont la franchit, ce qui
       * FERME ne se franchit jamais, tout le reste se franchit toujours.
       *
       * La règle est lue dans `franchissable`, jamais recopiée ici. Elle
       * l'était, et elle nommait la falaise seule ; le jour où le chaos
       * rocheux s'est mis à fermer lui aussi — c'est lui qui donne au relief
       * de quoi couper une zone — ce test aurait exigé le contraire du
       * contrat qu'il prétend garder.
       */
      const ok =
        name(i) === 'eau' ? passable === bridged
        : !franchissable(field.terrain[i]) ? !passable
        : passable;
      if (!ok && faults.length < 12) faults.push(`${i % COLS},${(i / COLS) | 0} (${name(i)})`);
    }
    expect(faults).toEqual([]);
  });

  it('ne pose jamais de pont hors de l’eau', () => {
    for (let i = 0; i < CELLS; i++) {
      if ((field.flags[i] & CELL_BRIDGE) === 0) continue;
      expect(name(i)).toBe('eau');
    }
  });

  it('donne un coût fini à toute case franchissable', () => {
    let infinite = 0;
    for (let i = 0; i < CELLS; i++) {
      if ((field.flags[i] & CELL_PASSABLE) === 0) continue;
      const cost = name(i) === 'eau' ? TERRAIN_COST.chemin : TERRAIN_COST[name(i)];
      if (cost >= Number.MAX_SAFE_INTEGER) infinite++;
    }
    expect(infinite).toBe(0);
  });

  it('lève CELL_ROAD exactement sur les voies', () => {
    for (let i = 0; i < CELLS; i++) {
      const road = (field.flags[i] & CELL_ROAD) !== 0;
      const isRoadTerrain = name(i) === 'route' || name(i) === 'chemin';
      if (isRoadTerrain) expect(road).toBe(true);
      // Un pont porte CELL_ROAD sans être un terrain de route : c'est légitime.
      if (road && !isRoadTerrain) expect(name(i)).toBe('eau');
    }
  });

  it('n’autorise les caches que sur les couverts qui les justifient', () => {
    const wrong = new Set<string>();
    for (let i = 0; i < CELLS; i++) {
      if ((field.flags[i] & CELL_CACHE) === 0) continue;
      const t = name(i);
      /*
       * La liste est LUE dans `couvre`, jamais recopiée.
       *
       * Recopiée, elle nommait la forêt, le rocher et la tourbière — et pas la
       * lande. Or `terrain.ts` accordait bien son couvert à la lande, que
       * `build.ts` reprenait ensuite en réécrivant la règle de son côté. Ce
       * test entérinait donc le désaccord : il exigeait que les mille deux
       * cents cases de hautes-chaumes n'abritent rien, alors que le semis
       * comptait dessus.
       */
      if (!couvre(field.terrain[i])) wrong.add(t);
    }
    expect([...wrong]).toEqual([]);
  });

  it('ne rend constructible que du terrain plat, sec et hors voie', () => {
    let buildable = 0;
    let wet = 0;
    let steep = 0;
    let paved = 0;
    for (let i = 0; i < CELLS; i++) {
      if ((field.flags[i] & CELL_BUILDABLE) === 0) continue;
      buildable++;
      if (name(i) === 'eau') wet++;
      if (field.slope[i] > 16) steep++;
      if (name(i) === 'route' || name(i) === 'chemin') paved++;
    }
    expect(buildable).toBeGreaterThan(5000);
    expect(wet).toBe(0);
    expect(steep).toBe(0);
    expect(paved).toBe(0);
  });

  it('marque les lisières et rien qu’elles', () => {
    let edges = 0;
    let wrongEdges = 0;
    for (let row = 1; row < ROWS - 1; row++) {
      for (let col = 1; col < COLS - 1; col++) {
        const i = idx(col, row);
        const t = field.terrain[i];
        const differs =
          field.terrain[i - 1] !== t ||
          field.terrain[i + 1] !== t ||
          field.terrain[i - COLS] !== t ||
          field.terrain[i + COLS] !== t;
        if (((field.flags[i] & CELL_EDGE) !== 0) !== differs) wrongEdges++;
        if (differs) edges++;
      }
    }
    expect(wrongEdges).toBe(0);
    expect(edges).toBeGreaterThan(5000);
  });
});

describe('humidité et proximité de l’eau', () => {
  it('mesure une distance à l’eau croissante et bornée', () => {
    const dist = distanceToWater();
    expect(dist.length).toBe(CELLS);
    let bad = 0;
    let over = 0;
    for (let i = 0; i < CELLS; i++) {
      if (hydro.water[i] === 1 && dist[i] !== 0) bad++;
      if (dist[i] > 63) over++;
    }
    expect(bad).toBe(0);
    expect(over).toBe(0);
    // Le voisinage immédiat d'une rivière est à 1.
    const source = hydro.courses[0][10];
    expect(dist[idx(source.col + 1, source.row)]).toBeLessThanOrEqual(1);
  });

  it('installe les prairies plus près de l’eau que les sapinières', () => {
    const dist = distanceToWater();
    let meadow = 0;
    let meadowD = 0;
    let forest = 0;
    let forestD = 0;
    for (let i = 0; i < CELLS; i++) {
      if (name(i) === 'prairie') {
        meadowD += dist[i];
        meadow++;
      } else if (name(i) === 'foret') {
        forestD += dist[i];
        forest++;
      }
    }
    expect(meadowD / meadow).toBeLessThan(forestD / forest);
  });
});
