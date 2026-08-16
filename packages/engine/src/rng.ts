/**
 * PCG32 déterministe, en arithmétique 32 bits pure (aucun BigInt, aucun flottant).
 * Deux exécutions sur deux machines produisent exactement la même suite.
 */
import type { RngState } from './types.js';

const MUL_HI = 0x5851f42d;
const MUL_LO = 0x4c957f2d;

/** multiplication non signée 32×32 → 64 bits, exacte (chunks de 16 bits). */
function umul(a: number, b: number): { hi: number; lo: number } {
  const ah = (a >>> 16) & 0xffff;
  const al = a & 0xffff;
  const bh = (b >>> 16) & 0xffff;
  const bl = b & 0xffff;
  const ll = al * bl;
  const lh = al * bh;
  const hl = ah * bl;
  const hh = ah * bh;
  const mid = (ll >>> 16) + (lh & 0xffff) + (hl & 0xffff);
  const lo = (((mid & 0xffff) << 16) | (ll & 0xffff)) >>> 0;
  const hi = (hh + (lh >>> 16) + (hl >>> 16) + ((mid / 0x10000) | 0)) >>> 0;
  return { hi, lo };
}

function add64(
  ahi: number,
  alo: number,
  bhi: number,
  blo: number,
): { hi: number; lo: number } {
  const lo = (alo + blo) >>> 0;
  const carry = lo < (alo >>> 0) ? 1 : 0;
  const hi = (ahi + bhi + carry) >>> 0;
  return { hi, lo };
}

function rotr32(x: number, r: number): number {
  const rr = r & 31;
  if (rr === 0) return x >>> 0;
  return ((x >>> rr) | (x << (32 - rr))) >>> 0;
}

export function createRng(seed: number, sequence = 0xda3e39cb): RngState {
  const s: RngState = {
    hi: 0,
    lo: 0,
    inchi: (sequence << 1) >>> 0,
    inclo: 1,
  };
  // inc = (seq << 1) | 1, sur 64 bits ; on garde seq sur 32 bits.
  s.inchi = (sequence >>> 31) >>> 0;
  s.inclo = (((sequence << 1) >>> 0) | 1) >>> 0;
  step(s);
  const added = add64(s.hi, s.lo, 0, seed >>> 0);
  s.hi = added.hi;
  s.lo = added.lo;
  step(s);
  return s;
}

function step(s: RngState): void {
  // state = state * MUL + inc (mod 2^64)
  const low = umul(s.lo, MUL_LO);
  const cross1 = umul(s.lo, MUL_HI);
  const cross2 = umul(s.hi, MUL_LO);
  const hi = (low.hi + cross1.lo + cross2.lo) >>> 0;
  const mult = add64(hi, low.lo, s.inchi, s.inclo);
  s.hi = mult.hi;
  s.lo = mult.lo;
}

/** Tirage 32 bits non signé. Mute l'état (qui est sérialisé dans GameState). */
export function nextUint32(s: RngState): number {
  const hi = s.hi;
  const lo = s.lo;
  step(s);
  // xorshifted = ((state >> 18) ^ state) >> 27
  const s18lo = ((lo >>> 18) | (hi << 14)) >>> 0;
  const s18hi = hi >>> 18;
  const xlo = (s18lo ^ lo) >>> 0;
  const xhi = (s18hi ^ hi) >>> 0;
  const xorshifted = ((xlo >>> 27) | (xhi << 5)) >>> 0;
  const rot = hi >>> 27;
  return rotr32(xorshifted, rot);
}

/** Entier uniforme dans [min, max] inclus, sans biais (rejection sampling). */
export function nextInt(s: RngState, min: number, max: number): number {
  if (max <= min) return min;
  const range = max - min + 1;
  const threshold = (0x100000000 - (0x100000000 % range)) >>> 0;
  for (;;) {
    const r = nextUint32(s);
    if (r < threshold || threshold === 0) return min + (r % range);
  }
}

/** Vrai avec une probabilité de `bp` points de base (0..10000). */
export function nextChance(s: RngState, bp: number): boolean {
  return nextInt(s, 1, 10000) <= bp;
}

export function pick<T>(s: RngState, arr: readonly T[]): T {
  return arr[nextInt(s, 0, arr.length - 1)];
}

/** Mélange Fisher-Yates déterministe, en place. */
export function shuffle<T>(s: RngState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = nextInt(s, 0, i);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
  return arr;
}

/** Tirage pondéré (poids entiers positifs). */
export function pickWeighted<T>(s: RngState, entries: { item: T; weight: number }[]): T {
  let total = 0;
  for (const e of entries) total += e.weight;
  let roll = nextInt(s, 1, Math.max(1, total));
  for (const e of entries) {
    roll -= e.weight;
    if (roll <= 0) return e.item;
  }
  return entries[entries.length - 1].item;
}

export function cloneRng(s: RngState): RngState {
  return { hi: s.hi, lo: s.lo, inchi: s.inchi, inclo: s.inclo };
}

/** Sous-générateur indépendant, dérivé de façon reproductible. */
export function deriveRng(s: RngState, tag: number): RngState {
  return createRng(nextUint32(s) ^ tag, (tag * 2654435761) >>> 0);
}
