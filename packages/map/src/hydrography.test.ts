import { describe, expect, it } from 'vitest';
import { anchorCell } from './anchors.js';
import { CELLS, COLS, ROWS, idx } from './grid.js';
import { CROSSINGS, RIVERS, SAGNES, buildHydrography } from './hydrography.js';

const hydro = buildHydrography();

function river(key: string) {
  const index = RIVERS.findIndex((r) => r.key === key);
  expect(index, `cours d'eau inconnu : ${key}`).toBeGreaterThanOrEqual(0);
  return { def: RIVERS[index], course: hydro.courses[index] };
}

describe('hydrographie — la Durolle', () => {
  const { def, course } = river('durolle');

  it('naît entre Le Lac et le Col des Sagnes', () => {
    const source = course[0];
    const lac = anchorCell('le_lac');
    const col = anchorCell('col_sagnes');
    const dLac = Math.max(Math.abs(source.col - lac.col), Math.abs(source.row - lac.row));
    const dCol = Math.max(Math.abs(source.col - col.col), Math.abs(source.row - col.row));
    expect(Math.min(dLac, dCol)).toBeLessThanOrEqual(14);
  });

  it('coule vers le nord-ouest', () => {
    const source = course[0];
    const mouth = course[course.length - 1];
    expect(mouth.col).toBeLessThan(source.col);
    expect(mouth.row).toBeLessThan(source.row);
    // Elle sort par la bordure ouest de l'emprise.
    expect(mouth.col).toBe(0);
  });

  it('traverse Chabreloche', () => {
    const bourg = anchorCell('chabreloche');
    let best = Number.MAX_SAFE_INTEGER;
    for (const p of course) {
      const d = Math.max(Math.abs(p.col - bourg.col), Math.abs(p.row - bourg.row));
      if (d < best) best = d;
    }
    expect(best).toBeLessThanOrEqual(3);
  });

  it('est la rivière la plus longue et la plus encaissée', () => {
    expect(def.kind).toBe('riviere');
    for (const other of RIVERS) {
      if (other.key === 'durolle') continue;
      expect(def.depth).toBeGreaterThanOrEqual(other.depth);
    }
    /* Une longueur de polyligne, en cases : elle suit la largeur de la grille,
       divisée par 2,26 quand la carte est passée à la taille d'une XL. */
    expect(course.length).toBeGreaterThan(Math.trunc(ROWS / 4));
  });

  it('reçoit des affluents', () => {
    const durolle = new Set(course.map((p) => idx(p.col, p.row)));
    let confluences = 0;
    for (let k = 0; k < RIVERS.length; k++) {
      if (RIVERS[k].key === 'durolle') continue;
      const other = hydro.courses[k];
      const end = other[other.length - 1];
      if (durolle.has(idx(end.col, end.row))) confluences++;
    }
    expect(confluences).toBeGreaterThanOrEqual(3);
  });
});

describe('hydrographie — les deux versants', () => {
  it("envoie l'Anzon vers le sud-est, depuis Noirétable", () => {
    const { course } = river('anzon');
    const source = course[0];
    const mouth = course[course.length - 1];
    const noiretable = anchorCell('noiretable');
    expect(
      Math.max(Math.abs(source.col - noiretable.col), Math.abs(source.row - noiretable.row)),
    ).toBeLessThanOrEqual(16);
    expect(mouth.row).toBeGreaterThan(source.row);
    expect(mouth.col).toBeGreaterThan(source.col);
  });

  it('envoie la Credogne vers l’ouest, depuis la Marche', () => {
    const { course } = river('credogne');
    const source = course[0];
    const mouth = course[course.length - 1];
    expect(mouth.col).toBeLessThan(source.col);
    expect(mouth.col).toBe(0);
  });

  it('sépare bien les deux bassins : aucun cours ne traverse la carte de part en part', () => {
    for (let k = 0; k < RIVERS.length; k++) {
      const course = hydro.courses[k];
      const source = course[0];
      const mouth = course[course.length - 1];
      const crossesWholeMap = source.col > COLS - 20 && mouth.col < 20;
      expect(crossesWholeMap, RIVERS[k].key).toBe(false);
    }
  });
});

describe('hydrographie — champ', () => {
  it('marque de l’eau sans noyer la carte', () => {
    let water = 0;
    for (let i = 0; i < CELLS; i++) if (hydro.water[i] === 1) water++;
    /* Des comptes de cases, donc proportionnels à la surface de la grille. La
       borne haute l'était déjà ; la borne basse était écrite en dur. */
    expect(water * 1000).toBeGreaterThan(CELLS * 6);
    expect(water * 100).toBeLessThan(CELLS * 3);
  });

  it('reste dans la grille', () => {
    for (const course of hydro.courses) {
      for (const p of course) {
        expect(p.col).toBeGreaterThanOrEqual(0);
        expect(p.col).toBeLessThan(COLS);
        expect(p.row).toBeGreaterThanOrEqual(0);
        expect(p.row).toBeLessThan(ROWS);
      }
    }
  });

  it('trace des cours continus, sans saut de case', () => {
    for (const course of hydro.courses) {
      for (let k = 1; k < course.length; k++) {
        const dc = Math.abs(course[k].col - course[k - 1].col);
        const dr = Math.abs(course[k].row - course[k - 1].row);
        expect(Math.max(dc, dr)).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('hydrographie — sagnes', () => {
  it('pose des tourbières en altitude, dont celle du col', () => {
    expect(SAGNES.length).toBeGreaterThanOrEqual(6);
    const col = anchorCell('col_sagnes');
    const onCol = SAGNES.some(
      (s) =>
        Math.max(Math.abs(s.at.col - col.col), Math.abs(s.at.row - col.row)) <= s.radius,
    );
    expect(onCol).toBe(true);
  });

  it('remplit un disque de cases humides', () => {
    let bog = 0;
    for (let i = 0; i < CELLS; i++) if (hydro.bog[i] === 1) bog++;
    /* Idem : une surface, exprimée en part de la grille. */
    expect(bog * 1000).toBeGreaterThan(CELLS * 2);
  });

  it('ne crée aucun grand plan d’eau au hameau du Lac', () => {
    // Le nom du hameau ne doit pas engendrer un lac : au plus une sagne.
    const lac = anchorCell('le_lac');
    let water = 0;
    for (let dr = -10; dr <= 10; dr++) {
      for (let dc = -10; dc <= 10; dc++) {
        const col = lac.col + dc;
        const row = lac.row + dr;
        if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
        if (hydro.water[idx(col, row)] === 1) water++;
      }
    }
    expect(water).toBeLessThan(60);
  });
});

describe('hydrographie — gués et ponts', () => {
  it('pose tous les franchissements nommés sur de l’eau', () => {
    expect(hydro.placed.length).toBe(CROSSINGS.length);
    for (const p of hydro.placed) {
      expect(hydro.water[idx(p.at.col, p.at.row)], p.key).toBe(1);
      expect(hydro.crossing[idx(p.at.col, p.at.row)], p.key).toBe(1);
    }
  });

  it('n’ouvre jamais un franchissement hors de l’eau', () => {
    for (let i = 0; i < CELLS; i++) {
      if (hydro.crossing[i] === 1) expect(hydro.water[i]).toBe(1);
    }
  });

  it('ouvre au moins un passage par cours d’eau', () => {
    for (let k = 0; k < RIVERS.length; k++) {
      const course = hydro.courses[k];
      const crossings = course.filter((p) => hydro.crossing[idx(p.col, p.row)] === 1);
      expect(crossings.length, RIVERS[k].key).toBeGreaterThanOrEqual(1);
    }
  });

  it('laisse malgré tout l’eau majoritairement infranchissable', () => {
    let water = 0;
    let crossing = 0;
    for (let i = 0; i < CELLS; i++) {
      if (hydro.water[i] === 1) water++;
      if (hydro.crossing[i] === 1) crossing++;
    }
    expect(crossing * 100).toBeLessThan(water * 30);
  });
});

describe('hydrographie — déterminisme', () => {
  it('rend le même champ à chaque appel', () => {
    expect(buildHydrography()).toBe(hydro);
  });
});
