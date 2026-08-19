import { describe, expect, it } from 'vitest';
import { MAP_COLS, MAP_ROWS } from '@auvergne/engine';
import {
  BOUNDS,
  CELL_HEIGHT_M,
  CELL_SIZE_M,
  CELL_WIDTH_M,
  MAP_HEIGHT_M,
  MAP_WIDTH_M,
  cellDistanceMeters,
  cellToLatLon,
  inverseLambert93,
  lambert93,
  latLonToCell,
  projectToGrid,
} from './projection.js';
import { FOREZ_ANCHORS } from './anchors.js';

describe('projection — emprise', () => {
  it('publie l’emprise du brief', () => {
    expect(BOUNDS.west).toBe(3.64);
    expect(BOUNDS.east).toBe(3.8);
    expect(BOUNDS.south).toBe(45.72);
    expect(BOUNDS.north).toBe(45.9);
  });

  it('couvre environ 12,2 km sur 20,1 km', () => {
    expect(MAP_WIDTH_M).toBeGreaterThan(12100);
    expect(MAP_WIDTH_M).toBeLessThan(12400);
    expect(MAP_HEIGHT_M).toBeGreaterThan(20000);
    expect(MAP_HEIGHT_M).toBeLessThan(20200);
  });

  it('donne des cases d’environ 109 mètres, et presque carrées', () => {
    expect(CELL_WIDTH_M).toBeGreaterThan(107);
    expect(CELL_WIDTH_M).toBeLessThan(110);
    expect(CELL_HEIGHT_M).toBeGreaterThan(108);
    expect(CELL_HEIGHT_M).toBeLessThan(111);
  });

  /*
   * L'isotropie est ce que le calcul de pente suppose : il divise une
   * dénivelée par `CELL_SIZE_M`, la même valeur dans les deux directions. Le
   * jour où la grille cessera d'être à peu près carrée, ce test tombera avant
   * que le terrain ne se déforme en silence.
   */
  it('reste isotrope à 1 % près, ce que la pente suppose', () => {
    const ecart = Math.abs(CELL_HEIGHT_M - CELL_WIDTH_M) / CELL_WIDTH_M;
    expect(ecart).toBeLessThan(0.01);
    expect(CELL_SIZE_M).toBeGreaterThanOrEqual(Math.floor(CELL_WIDTH_M));
    expect(CELL_SIZE_M).toBeLessThanOrEqual(Math.ceil(CELL_HEIGHT_M));
  });
});

describe('projection — Lambert-93', () => {
  it('place Paris-centre au bon endroit dans EPSG:2154', () => {
    // Point de contrôle public : 48.8566 N, 2.3522 E ≈ 652 000 / 6 862 000.
    const p = lambert93(48.8566, 2.3522);
    expect(Math.abs(p.x - 652183)).toBeLessThan(400);
    expect(Math.abs(p.y - 6862340)).toBeLessThan(400);
  });

  it('respecte l’origine de la projection', () => {
    const p = lambert93(46.5, 3);
    expect(Math.abs(p.x - 700000)).toBeLessThan(0.001);
    expect(Math.abs(p.y - 6600000)).toBeLessThan(0.001);
  });

  it('est inversible au millimètre', () => {
    for (const a of FOREZ_ANCHORS) {
      const p = lambert93(a.lat, a.lon);
      const back = inverseLambert93(p.x, p.y);
      expect(Math.abs(back.lat - a.lat)).toBeLessThan(1e-9);
      expect(Math.abs(back.lon - a.lon)).toBeLessThan(1e-9);
    }
  });
});

describe('projection — grille', () => {
  it('fait l’aller-retour case → WGS84 → case', () => {
    // Les quatre coins, le centre, et trois ancrages — tirés de la grille
    // courante plutôt que recopiés, pour que l'échantillon suive l'échelle.
    const samples = [
      { col: 0, row: 0 },
      { col: MAP_COLS - 1, row: 0 },
      { col: 0, row: MAP_ROWS - 1 },
      { col: MAP_COLS - 1, row: MAP_ROWS - 1 },
      { col: (MAP_COLS >> 1), row: (MAP_ROWS >> 1) },
      ...FOREZ_ANCHORS.slice(0, 3).map((a) => ({ col: a.col, row: a.row })),
    ];
    for (const s of samples) {
      const ll = cellToLatLon(s.col, s.row);
      const back = latLonToCell(ll.lat, ll.lon);
      expect(back).toEqual(s);
    }
  });

  it('borne les coordonnées hors emprise', () => {
    const north = latLonToCell(46.5, 3.72);
    expect(north.row).toBe(0);
    const south = latLonToCell(45.0, 3.72);
    expect(south.row).toBe(MAP_ROWS - 1);
    const west = latLonToCell(45.8, 3.0);
    expect(west.col).toBe(0);
    const east = latLonToCell(45.8, 4.5);
    expect(east.col).toBe(MAP_COLS - 1);
  });

  it('mesure les distances en mètres de façon cohérente', () => {
    const d = cellDistanceMeters({ col: 0, row: 0 }, { col: 10, row: 0 });
    expect(Math.abs(d - 10 * CELL_WIDTH_M)).toBeLessThan(0.001);
  });

  it('projette tous les ancrages à moins d’une case de leur position de jeu', () => {
    for (const a of FOREZ_ANCHORS) {
      const g = projectToGrid(a.lat, a.lon);
      const dc = g.col - a.col;
      const dr = g.row - a.row;
      const dist = Math.sqrt(dc * dc + dr * dr);
      expect(dist, `${a.key} : écart de ${dist.toFixed(3)} case`).toBeLessThan(1);
    }
  });
});
