import { describe, expect, it } from 'vitest';
import { CELL_BRIDGE, CELL_ROAD, TERRAINS } from '@auvergne/engine';
import { FOREZ_ANCHORS, anchorCell, type AnchorKey } from './anchors.js';
import { buildTerrain } from './build.js';
import { buildElevation } from './elevation.js';
import { CELLS, COLS, ROWS, idx, polyline } from './grid.js';
import { buildHydrography } from './hydrography.js';
import { ROADS, ROAD_MAJOR, ROAD_PATH, buildRoads } from './roads.js';

const { elevation, slope } = buildElevation();
const roads = buildRoads(elevation, slope);
const hydro = buildHydrography();

describe('voies — tracé', () => {
  it('produit un itinéraire pour chaque route déclarée', () => {
    for (const def of ROADS) {
      const course = roads.courses.get(def.key);
      expect(course, def.key).toBeDefined();
      expect((course as { length: number }).length, def.key).toBeGreaterThan(4);
    }
  });

  it('trace des itinéraires continus', () => {
    for (const [key, course] of roads.courses) {
      for (let k = 1; k < course.length; k++) {
        const dc = Math.abs(course[k].col - course[k - 1].col);
        const dr = Math.abs(course[k].row - course[k - 1].row);
        expect(Math.max(dc, dr), key).toBeLessThanOrEqual(1);
      }
    }
  });

  it('ne suit pas la ligne droite : les voies contournent le relief', () => {
    // Une chaussée qui suivrait la ligne droite ferait exactement la distance
    // de Tchebychev. La vraie doit être sensiblement plus longue.
    const course = roads.courses.get('chabreloche_viscomtat') as { col: number; row: number }[];
    const a = course[0];
    const b = course[course.length - 1];
    const straight = Math.max(Math.abs(b.col - a.col), Math.abs(b.row - a.row));
    /* Le détour minimal est une longueur, en cases : il suit l'échelle. */
    expect(course.length).toBeGreaterThan(straight + 4);
  });

  it('suit les pentes faibles : moins raide que la ligne droite', () => {
    let gentler = 0;
    let compared = 0;
    for (const def of ROADS) {
      const course = roads.courses.get(def.key);
      if (!course) continue;
      const straight = polyline(def.waypoints);
      const mean = (cells: readonly { col: number; row: number }[]): number => {
        let sum = 0;
        for (const p of cells) sum += slope[idx(p.col, p.row)];
        return (sum * 100) / Math.max(1, cells.length);
      };
      compared++;
      if (mean(course) < mean(straight)) gentler++;
    }
    expect(compared).toBeGreaterThan(20);
    // Chaque itinéraire doit être en moyenne moins pentu que sa corde.
    expect(gentler * 100).toBeGreaterThan(compared * 90);
  });
});

describe('voies — la Grande Chaussée des Marchands', () => {
  const chaussee = roads.chausseeCourse;

  it('court du nord au sud, d’une bordure à l’autre', () => {
    /* La chaussée court d'une bordure à l'autre : au moins la hauteur de la
       carte, et un peu plus puisqu'elle serpente. */
    expect(chaussee.length).toBeGreaterThan(ROWS);
    expect(chaussee[0].row).toBe(0);
    expect(chaussee[chaussee.length - 1].row).toBe(ROWS - 1);
  });

  it('dessert Chabreloche, Le Lac, la Maison du Trésor, Noirétable et La Renaudie', () => {
    const stops: AnchorKey[] = [
      'chabreloche',
      'le_lac',
      'maison_tresor',
      'noiretable',
      'renaudie',
    ];
    for (const key of stops) {
      const at = anchorCell(key);
      const touched = chaussee.some((p) => p.col === at.col && p.row === at.row);
      expect(touched, `la chaussée doit passer par ${key}`).toBe(true);
    }
  });

  it('reste minoritaire en surface : c’est un corridor, pas un damier', () => {
    let major = 0;
    for (let i = 0; i < CELLS; i++) if (roads.road[i] === ROAD_MAJOR) major++;
    expect(major * 1000).toBeGreaterThan(CELLS * 4);
    expect(major * 100).toBeLessThan(CELLS * 2);
  });
});

describe('voies — desserte', () => {
  it('relie tous les villages, cols, sanctuaires et sommets nommés', () => {
    for (const a of FOREZ_ANCHORS) {
      let found = false;
      for (let dr = -2; dr <= 2 && !found; dr++) {
        for (let dc = -2; dc <= 2 && !found; dc++) {
          const col = a.col + dc;
          const row = a.row + dr;
          if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
          if (roads.road[idx(col, row)] !== 0) found = true;
        }
      }
      expect(found, `${a.key} doit être desservi par une voie`).toBe(true);
    }
  });

  it('propose au moins deux directions à chaque bourg de départ', () => {
    const starts: AnchorKey[] = [
      'arconsat',
      'viscomtat',
      'cervieres',
      'noiretable',
      'renaudie',
    ];
    for (const key of starts) {
      const at = anchorCell(key);
      // On compte les branches sortant du disque de rayon 6 autour du bourg.
      let branches = 0;
      const radius = 6;
      let previous = false;
      const ring: boolean[] = [];
      for (let a = 0; a < 8 * radius; a++) {
        const side = Math.trunc(a / (2 * radius));
        const t = a % (2 * radius);
        let col = at.col;
        let row = at.row;
        if (side === 0) {
          col = at.col - radius + t;
          row = at.row - radius;
        } else if (side === 1) {
          col = at.col + radius;
          row = at.row - radius + t;
        } else if (side === 2) {
          col = at.col + radius - t;
          row = at.row + radius;
        } else {
          col = at.col - radius;
          row = at.row + radius - t;
        }
        const inside = col >= 0 && row >= 0 && col < COLS && row < ROWS;
        ring.push(inside && roads.road[idx(col, row)] !== 0);
      }
      previous = ring[ring.length - 1];
      for (const cell of ring) {
        if (cell && !previous) branches++;
        previous = cell;
      }
      expect(branches, `${key} : ${branches} direction(s)`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe('voies — franchissements', () => {
  it('pose un pont partout où une voie coupe un cours d’eau', () => {
    for (let i = 0; i < CELLS; i++) {
      if (roads.road[i] === 0) continue;
      if (hydro.water[i] !== 1) continue;
      expect(roads.bridge[i], `case ${i % COLS},${(i / COLS) | 0}`).toBe(1);
    }
  });

  it('n’invente pas de pont hors de l’eau', () => {
    for (let i = 0; i < CELLS; i++) {
      if (roads.bridge[i] === 1) expect(hydro.water[i]).toBe(1);
    }
  });
});

describe('voies — intégration au terrain', () => {
  const field = buildTerrain();

  it('classe les voies en route et chemin, et lève CELL_ROAD', () => {
    let route = 0;
    let chemin = 0;
    for (let i = 0; i < CELLS; i++) {
      const name = TERRAINS[field.terrain[i]];
      if (name === 'route') {
        route++;
        expect(field.flags[i] & CELL_ROAD).not.toBe(0);
      }
      if (name === 'chemin') {
        chemin++;
        expect(field.flags[i] & CELL_ROAD).not.toBe(0);
      }
    }
    expect(route * 1000).toBeGreaterThan(CELLS * 6);
    expect(chemin * 1000).toBeGreaterThan(CELLS * 20);
  });

  it('rend franchissable toute voie posée sur l’eau', () => {
    for (let i = 0; i < CELLS; i++) {
      if ((field.flags[i] & CELL_ROAD) === 0) continue;
      if (TERRAINS[field.terrain[i]] !== 'eau') continue;
      expect(field.flags[i] & CELL_BRIDGE).not.toBe(0);
    }
  });

  it('distingue bien les chemins des grandes chaussées', () => {
    let path = 0;
    for (let i = 0; i < CELLS; i++) if (roads.road[i] === ROAD_PATH) path++;
    expect(path * 1000).toBeGreaterThan(CELLS * 20);
  });
});
