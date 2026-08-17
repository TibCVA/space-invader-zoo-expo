import { describe, expect, it } from 'vitest';
import { FOREZ_ANCHORS, anchorCell } from './anchors.js';
import { MAX_ALTITUDE, MIN_ALTITUDE, buildElevation, computeSlope } from './elevation.js';
import { CELLS, COLS, ROWS, idx, slopeDegrees } from './grid.js';
import { buildHydrography } from './hydrography.js';

const field = buildElevation();
const h = (col: number, row: number): number => field.elevation[idx(col, row)];

describe('altitude — cotes connues', () => {
  it('rend exactement la cote de chaque ancrage', () => {
    for (const a of FOREZ_ANCHORS) {
      expect(h(a.col, a.row), `${a.key}`).toBe(a.alt);
    }
  });

  it('reste dans les bornes du massif', () => {
    let min = Number.MAX_SAFE_INTEGER;
    let max = -Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < CELLS; i++) {
      const v = field.elevation[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(MIN_ALTITUDE);
    expect(max).toBeLessThanOrEqual(MAX_ALTITUDE);
    // Le massif doit vraiment monter : plus de 500 m de dénivelé utile.
    expect(max - min).toBeGreaterThan(500);
  });

  it('respecte la hiérarchie des sommets et des fonds', () => {
    const alt = (k: Parameters<typeof anchorCell>[0]) => {
      const c = anchorCell(k);
      return h(c.col, c.row);
    };
    expect(alt('bois_noirs')).toBeGreaterThan(alt('hermitage'));
    expect(alt('hermitage')).toBeGreaterThan(alt('col_sagnes'));
    expect(alt('col_sagnes')).toBeGreaterThan(alt('le_lac'));
    expect(alt('le_lac')).toBeGreaterThan(alt('chabreloche'));
    expect(alt('chabreloche')).toBeGreaterThan(alt('arconsat'));
    expect(alt('pamole')).toBeGreaterThan(alt('vollore'));
    expect(alt('cervieres')).toBeGreaterThan(alt('noiretable'));
  });

  it('descend vers le nord-ouest, où la Durolle quitte l’emprise', () => {
    // Le coin nord-ouest est le point bas de l'emprise.
    let northWest = 0;
    let count = 0;
    for (let row = 20; row < 40; row++) {
      for (let col = 0; col < 16; col++) {
        northWest += h(col, row);
        count++;
      }
    }
    northWest = Math.trunc(northWest / count);

    let core = 0;
    count = 0;
    for (let row = 130; row < 170; row++) {
      for (let col = 140; col < 180; col++) {
        core += h(col, row);
        count++;
      }
    }
    core = Math.trunc(core / count);

    expect(core - northWest).toBeGreaterThan(300);
  });
});

describe('altitude — hydrographie et vallées', () => {
  const hydro = buildHydrography();

  it('ne fait jamais remonter un cours d’eau', () => {
    for (const course of hydro.courses) {
      let previous = Number.MAX_SAFE_INTEGER;
      for (const p of course) {
        const v = h(p.col, p.row);
        expect(v).toBeLessThanOrEqual(previous);
        previous = v;
      }
    }
  });

  it('creuse la vallée : l’eau est plus basse que ses berges', () => {
    let checked = 0;
    let lower = 0;
    for (const course of hydro.courses) {
      for (let k = 6; k < course.length - 6; k += 5) {
        const p = course[k];
        if (p.col < 6 || p.col > COLS - 7) continue;
        const bed = h(p.col, p.row);
        const banks = Math.trunc((h(p.col - 4, p.row) + h(p.col + 4, p.row)) / 2);
        checked++;
        if (bed < banks) lower++;
      }
    }
    expect(checked).toBeGreaterThan(30);
    // Quelques traversées de crête restent possibles ; l'immense majorité doit
    // néanmoins couler au fond d'une vallée.
    expect(lower * 100).toBeGreaterThan(checked * 85);
  });

  it('aplatit les sagnes d’altitude', () => {
    const slope = field.slope;
    let flat = 0;
    let total = 0;
    for (let i = 0; i < CELLS; i++) {
      if (hydro.bog[i] !== 1) continue;
      total++;
      if (slope[i] <= 10) flat++;
    }
    expect(total).toBeGreaterThan(100);
    expect(flat * 100).toBeGreaterThan(total * 75);
  });
});

describe('pente', () => {
  it('est bornée à 0..90 degrés', () => {
    let min = 255;
    let max = 0;
    for (let i = 0; i < CELLS; i++) {
      const v = field.slope[i];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(90);
  });

  it('convertit correctement une tangente en degrés, sans trigonométrie', () => {
    expect(slopeDegrees(0, 96)).toBe(0);
    expect(slopeDegrees(96, 96)).toBe(45);
    expect(slopeDegrees(96 * 2, 96)).toBe(63);
    expect(slopeDegrees(-96, 96)).toBe(45);
    expect(slopeDegrees(10, 0)).toBe(90);
  });

  it('est cohérente avec le champ d’altitude', () => {
    const recomputed = computeSlope(field.elevation);
    expect(recomputed.length).toBe(field.slope.length);
    for (let i = 0; i < CELLS; i += 997) {
      expect(recomputed[i]).toBe(field.slope[i]);
    }
  });

  it('offre du relief : versants raides et fonds plats coexistent', () => {
    let steep = 0;
    let gentle = 0;
    for (let i = 0; i < CELLS; i++) {
      if (field.slope[i] >= 20) steep++;
      if (field.slope[i] <= 4) gentle++;
    }
    expect(steep).toBeGreaterThan(1000);
    expect(gentle).toBeGreaterThan(10000);
  });
});

describe('déterminisme', () => {
  it('rend exactement le même champ à chaque appel', () => {
    const again = buildElevation();
    expect(again.elevation).toBe(field.elevation);
    const fresh = computeSlope(field.elevation);
    for (let i = 0; i < CELLS; i += 331) expect(fresh[i]).toBe(field.slope[i]);
  });

  it('couvre toute la grille', () => {
    expect(field.elevation.length).toBe(COLS * ROWS);
    expect(field.slope.length).toBe(COLS * ROWS);
  });
});
