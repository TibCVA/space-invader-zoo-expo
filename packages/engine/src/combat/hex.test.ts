import { describe, expect, it } from 'vitest';
import { HEX_COLS, HEX_ROWS } from '../types.js';
import {
  allHexes,
  attackAngle,
  directionTo,
  fromCube,
  hexDistance,
  hexLine,
  hexRay,
  hexToPixel,
  hexesInRange,
  inBounds,
  keyToHex,
  hexKey,
  neighbor,
  neighbors,
  pixelToHex,
  toCube,
} from './hex.js';

describe('géométrie hexagonale odd-r 15 × 11', () => {
  it('couvre exactement 165 hexagones', () => {
    const all = allHexes();
    expect(all.length).toBe(HEX_COLS * HEX_ROWS);
    expect(all.every(inBounds)).toBe(true);
  });

  it('convertit offset ↔ cube sans perte', () => {
    for (const h of allHexes()) {
      const back = fromCube(toCube(h));
      expect(back).toEqual(h);
      const c = toCube(h);
      expect(c.x + c.y + c.z).toBe(0);
    }
  });

  it('convertit hexKey ↔ hexagone sans perte', () => {
    for (const h of allHexes()) {
      expect(keyToHex(hexKey(h))).toEqual(h);
    }
  });

  it('donne des voisins à distance 1, réciproques', () => {
    for (const h of allHexes()) {
      for (const n of neighbors(h)) {
        expect(hexDistance(h, n)).toBe(1);
        expect(neighbors(n).some((x) => x.col === h.col && x.row === h.row)).toBe(true);
      }
      expect(neighbors(h).length).toBeGreaterThanOrEqual(2);
      expect(neighbors(h).length).toBeLessThanOrEqual(6);
    }
  });

  it('respecte l’inégalité triangulaire', () => {
    const a = { col: 1, row: 1 };
    const b = { col: 12, row: 8 };
    const c = { col: 7, row: 3 };
    expect(hexDistance(a, b)).toBeLessThanOrEqual(hexDistance(a, c) + hexDistance(c, b));
    expect(hexDistance(a, a)).toBe(0);
    expect(hexDistance(a, b)).toBe(hexDistance(b, a));
  });

  it('trace une ligne continue de longueur distance + 1', () => {
    const a = { col: 0, row: 0 };
    const b = { col: 14, row: 10 };
    const line = hexLine(a, b);
    expect(line.length).toBe(hexDistance(a, b) + 1);
    expect(line[0]).toEqual(a);
    expect(line[line.length - 1]).toEqual(b);
    for (let i = 1; i < line.length; i++) {
      expect(hexDistance(line[i - 1], line[i])).toBe(1);
    }
  });

  it('énumère la portée sans doublon', () => {
    const center = { col: 7, row: 5 };
    const inRange = hexesInRange(center, 3);
    const keys = new Set(inRange.map(hexKey));
    expect(keys.size).toBe(inRange.length);
    expect(inRange.every((h) => hexDistance(center, h) <= 3)).toBe(true);
    expect(inRange.some((h) => hexDistance(center, h) === 3)).toBe(true);
  });

  it('prolonge un rayon dans la direction voulue (souffle)', () => {
    const from = { col: 3, row: 5 };
    const through = neighbor(from, 0);
    const ray = hexRay(from, through, 3);
    expect(ray.length).toBe(3);
    expect(ray[0]).toEqual(through);
    for (let i = 1; i < ray.length; i++) {
      expect(hexDistance(ray[i - 1], ray[i])).toBe(1);
      expect(directionTo(from, ray[i])).toBe(0);
    }
  });

  it('classe correctement face, flanc et dos', () => {
    const target = { col: 7, row: 5 };
    const facing = 0; // regarde vers l’est
    expect(attackAngle(target, facing, neighbor(target, 0))).toBe('face');
    expect(attackAngle(target, facing, neighbor(target, 1))).toBe('face');
    expect(attackAngle(target, facing, neighbor(target, 2))).toBe('flanc');
    expect(attackAngle(target, facing, neighbor(target, 3))).toBe('dos');
    expect(attackAngle(target, facing, neighbor(target, 4))).toBe('flanc');
  });

  it('convertit pixel ↔ hexagone sans dérive, en entiers', () => {
    for (const h of allHexes()) {
      const p = hexToPixel(h, 40);
      expect(Number.isInteger(p.x)).toBe(true);
      expect(Number.isInteger(p.y)).toBe(true);
      expect(pixelToHex(p.x, p.y, 40)).toEqual(h);
    }
  });
});
