import { describe, expect, it } from 'vitest';
import { MAP_COLS, MAP_ROWS } from '@auvergne/engine';
import {
  ANCHORS,
  FOREZ_ANCHORS,
  anchor,
  anchorAltitude,
  anchorCell,
  anchorList,
  type AnchorKey,
} from './anchors.js';
import { latLonToCell } from './projection.js';

/**
 * Table du brief §7, recopiée telle quelle pour servir de témoin.
 *
 * Le témoin est la **latitude, la longitude et l'altitude** — pas la colonne
 * ni la ligne. Le brief donnait bien un couple (col, row) pour chacun des onze
 * ancrages, mais il l'avait calculé pour une grille de 256 × 416 : ces
 * nombres-là ne décrivent pas un lieu, ils décrivent où ce lieu tombait dans
 * une grille qui n'existe plus. Le jour où la carte est passée à la taille
 * d'une XL de HMM3, les recopier aurait fait échouer le test pour la seule
 * raison qu'il mesurait la grille au lieu de mesurer le Forez.
 *
 * Le test vérifie donc que chaque ancrage tombe sur la case où sa
 * latitude et sa longitude le projettent — ce qui vaut à toute échelle, et
 * qui attrape en plus une faute que l'ancienne table ne voyait pas : un
 * ancrage déplacé à la main sans que ses coordonnées géographiques suivent.
 */
const BRIEF: Record<string, { lat: number; lon: number; alt: number }> = {
  arconsat: { lat: 45.88972, lon: 3.71389, alt: 700 },
  chabreloche: { lat: 45.87972, lon: 3.6975, alt: 780 },
  le_lac: { lat: 45.85937, lon: 3.70981, alt: 900 },
  col_sagnes: { lat: 45.8517, lon: 3.7032, alt: 990 },
  col_st_thomas: { lat: 45.88609, lon: 3.754218, alt: 930 },
  maison_tresor: { lat: 45.8515024, lon: 3.7307805, alt: 950 },
  cervieres: { lat: 45.84861, lon: 3.77306, alt: 880 },
  viscomtat: { lat: 45.82917, lon: 3.67694, alt: 700 },
  noiretable: { lat: 45.81806, lon: 3.76556, alt: 720 },
  hermitage: { lat: 45.7917, lon: 3.71756, alt: 1110 },
  vollore: { lat: 45.785833, lon: 3.674444, alt: 940 },
  renaudie: { lat: 45.7361, lon: 3.7211, alt: 800 },
};

describe('ancrages', () => {
  it('reprend exactement les ancrages canoniques du brief', () => {
    for (const [key, want] of Object.entries(BRIEF)) {
      const a = anchor(key as AnchorKey);
      expect(a.lat, `${key}.lat`).toBe(want.lat);
      expect(a.lon, `${key}.lon`).toBe(want.lon);
      expect(a.alt, `${key}.alt`).toBe(want.alt);
      expect(a.canonical).toBe(true);
    }
    // Le brief ne connaît que ces ancrages-là comme canoniques.
    const canoniques = FOREZ_ANCHORS.filter((a) => a.canonical).map((a) => a.key);
    expect(canoniques.sort()).toEqual(Object.keys(BRIEF).sort());
  });

  it('pose chaque ancrage sur la case où le projette sa position réelle', () => {
    for (const a of FOREZ_ANCHORS) {
      const projete = latLonToCell(a.lat, a.lon);
      expect(Math.abs(a.col - projete.col), `${a.key}.col`).toBeLessThanOrEqual(1);
      expect(Math.abs(a.row - projete.row), `${a.key}.row`).toBeLessThanOrEqual(1);
    }
  });

  it('ajoute Pierre Pamole, les sommets des Bois Noirs, les portes, la Peyrotine et le Chemin du Trésor', () => {
    const extra: AnchorKey[] = [
      'pamole',
      'bois_noirs',
      'bois_noirs_est',
      'porte_farges',
      'porte_bise',
      'peyrotine',
      'chemin_tresor',
    ];
    for (const key of extra) {
      const a = anchor(key);
      expect(a.canonical).toBe(false);
      expect(a.label.length).toBeGreaterThan(2);
    }
    expect(anchorAltitude('pamole')).toBe(1165);
    expect(anchorAltitude('bois_noirs')).toBe(1200);
  });

  it('a des clefs uniques, des cases distinctes et des cases dans la grille', () => {
    const keys = new Set<string>();
    const cells = new Set<string>();
    for (const a of FOREZ_ANCHORS) {
      expect(keys.has(a.key)).toBe(false);
      keys.add(a.key);
      const cell = `${a.col},${a.row}`;
      expect(cells.has(cell), `case doublonnée : ${cell}`).toBe(false);
      cells.add(cell);
      expect(a.col).toBeGreaterThanOrEqual(0);
      expect(a.col).toBeLessThan(MAP_COLS);
      expect(a.row).toBeGreaterThanOrEqual(0);
      expect(a.row).toBeLessThan(MAP_ROWS);
      expect(a.lat).toBeGreaterThan(45.72);
      expect(a.lat).toBeLessThan(45.9);
      expect(a.lon).toBeGreaterThan(3.64);
      expect(a.lon).toBeLessThan(3.8);
    }
    expect(FOREZ_ANCHORS.length).toBe(19);
  });

  it('publie ANCHORS au format MapAnchor du moteur', () => {
    expect(ANCHORS.length).toBe(FOREZ_ANCHORS.length);
    const kinds = new Set(ANCHORS.map((a) => a.kind));
    for (const k of kinds) {
      expect(['ville', 'hameau', 'col', 'sanctuaire', 'monument', 'sommet']).toContain(k);
    }
    // Le baril ne doit pas exposer l'altitude interne dans MapAnchor.
    for (const a of ANCHORS) {
      expect(Object.keys(a).sort()).toEqual(
        ['col', 'key', 'kind', 'label', 'lat', 'lon', 'row'].sort(),
      );
    }
  });

  it('rend une copie fraîche et mutable dans anchorList', () => {
    const a = anchorList();
    const b = anchorList();
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    a[0].col = -1;
    expect(anchorList()[0].col).not.toBe(-1);
  });

  it('lance sur une clef inconnue', () => {
    expect(() => anchor('inexistant' as AnchorKey)).toThrow();
  });
});

describe('topologie — ordre relatif et directions', () => {
  const cell = (k: AnchorKey) => anchorCell(k);

  it('respecte l’ordre nord → sud du brief', () => {
    const order: AnchorKey[] = [
      'arconsat',
      'chabreloche',
      'le_lac',
      'col_sagnes',
      'cervieres',
      'viscomtat',
      'noiretable',
      'hermitage',
      'vollore',
      'renaudie',
    ];
    for (let i = 0; i + 1 < order.length; i++) {
      expect(
        cell(order[i]).row,
        `${order[i]} doit être au nord de ${order[i + 1]}`,
      ).toBeLessThan(cell(order[i + 1]).row);
    }
  });

  it('place Chabreloche au nord-ouest du Lac, comme la Durolle', () => {
    expect(cell('chabreloche').col).toBeLessThan(cell('le_lac').col);
    expect(cell('chabreloche').row).toBeLessThan(cell('le_lac').row);
  });

  it('place la Maison du Trésor à l’est du Lac et à l’ouest de Cervières', () => {
    expect(cell('maison_tresor').col).toBeGreaterThan(cell('le_lac').col);
    expect(cell('maison_tresor').col).toBeLessThan(cell('cervieres').col);
  });

  it('place le Col des Sagnes à l’ouest de la Maison du Trésor, à la même latitude', () => {
    expect(cell('col_sagnes').col).toBeLessThan(cell('maison_tresor').col);
    expect(Math.abs(cell('col_sagnes').row - cell('maison_tresor').row)).toBeLessThanOrEqual(2);
  });

  it('place Viscomtat à l’ouest et Cervières à l’est', () => {
    for (const other of ['arconsat', 'cervieres', 'noiretable', 'renaudie'] as AnchorKey[]) {
      expect(cell('viscomtat').col).toBeLessThan(cell(other).col);
    }
    for (const other of ['arconsat', 'viscomtat', 'hermitage', 'renaudie'] as AnchorKey[]) {
      expect(cell('cervieres').col).toBeGreaterThan(cell(other).col);
    }
  });

  it('garde les deux portes de Cervières collées au bourg', () => {
    for (const gate of ['porte_farges', 'porte_bise'] as AnchorKey[]) {
      const d = Math.max(
        Math.abs(cell(gate).col - cell('cervieres').col),
        Math.abs(cell(gate).row - cell('cervieres').row),
      );
      expect(d).toBeLessThanOrEqual(3);
    }
  });

  it('garde le Chemin du Trésor à deux pas de la Maison du Trésor', () => {
    const d = Math.max(
      Math.abs(cell('chemin_tresor').col - cell('maison_tresor').col),
      Math.abs(cell('chemin_tresor').row - cell('maison_tresor').row),
    );
    expect(d).toBeLessThanOrEqual(3);
  });

  it('place la Peyrotine entre Noirétable et l’Hermitage', () => {
    const p = cell('peyrotine');
    expect(p.row).toBeGreaterThan(cell('noiretable').row);
    expect(p.row).toBeLessThan(cell('hermitage').row);
    expect(p.col).toBeGreaterThan(cell('hermitage').col);
    expect(p.col).toBeLessThan(cell('noiretable').col);
  });

  it('place Pierre Pamole à l’est de Vollore-Montagne, en hauteur', () => {
    expect(cell('pamole').col).toBeGreaterThan(cell('vollore').col);
    expect(anchorAltitude('pamole')).toBeGreaterThan(anchorAltitude('vollore'));
  });

  it('place le col Saint-Thomas au nord-est, sur la vieille route Forez-Auvergne', () => {
    /* 45,886 N · 3,754 E, 930 m — limite Loire / Puy-de-Dôme, D 324 côté
       Chabreloche, D 1 côté La Bombarde. Projeté en (182, 33). */
    expect(cell('col_st_thomas').row).toBeLessThan(cell('chabreloche').row);
    expect(cell('col_st_thomas').col).toBeGreaterThan(cell('arconsat').col);
    expect(anchorAltitude('col_st_thomas')).toBe(930);
    expect(anchorAltitude('col_st_thomas')).toBeLessThan(anchorAltitude('col_sagnes'));
  });

  it('fait de La Renaudie le départ le plus éloigné du centre', () => {
    const mt = cell('maison_tresor');
    const dist = (k: AnchorKey) =>
      Math.max(Math.abs(cell(k).col - mt.col), Math.abs(cell(k).row - mt.row));
    const others: AnchorKey[] = ['arconsat', 'viscomtat', 'cervieres', 'noiretable'];
    for (const o of others) expect(dist('renaudie')).toBeGreaterThan(dist(o));
  });
});
