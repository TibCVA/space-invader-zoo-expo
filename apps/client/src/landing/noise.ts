/**
 * Bruit déterministe pour la scène d'accueil.
 *
 * Aucun `Math.random` : toute la page d'accueil se redessine à l'identique
 * d'un chargement à l'autre, ce qui rend la revue visuelle reproductible.
 * Les fonctions sont volontairement minuscules et sans allocation : elles sont
 * appelées des centaines de milliers de fois pendant le pré-rendu des plans.
 */

/** Générateur pseudo-aléatoire 32 bits, rapide et reproductible. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hachage entier d'un couple, retourné dans `[-1, 1]`. */
function hash2(seed: number, x: number, y: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 32768 - 1;
}

/** Interpolation lisse (dérivée nulle aux extrémités) : pas de facette. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export type Noise1D = (x: number) => number;
export type Noise2D = (x: number, y: number) => number;

/** Bruit de valeur à une dimension, dans `[-1, 1]`. Profils de crête. */
export function makeNoise1D(seed: number): Noise1D {
  return (x: number): number => {
    const i = Math.floor(x);
    const f = smooth(x - i);
    const a = hash2(seed, i, 0);
    const b = hash2(seed, i + 1, 0);
    return a + (b - a) * f;
  };
}

/** Bruit de valeur à deux dimensions, dans `[-1, 1]`. Matières et masques. */
export function makeNoise2D(seed: number): Noise2D {
  return (x: number, y: number): number => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const fx = smooth(x - ix);
    const fy = smooth(y - iy);
    const a = hash2(seed, ix, iy);
    const b = hash2(seed, ix + 1, iy);
    const c = hash2(seed, ix, iy + 1);
    const d = hash2(seed, ix + 1, iy + 1);
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fy;
  };
}

/** Somme d'octaves à une dimension. Le relief n'est jamais une sinusoïde. */
export function fbm1(noise: Noise1D, x: number, octaves = 4, gain = 0.5, lacunarity = 2): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

/** Somme d'octaves à deux dimensions. Grain, nuages, lichen, brume. */
export function fbm2(
  noise: Noise2D,
  x: number,
  y: number,
  octaves = 4,
  gain = 0.5,
  lacunarity = 2,
): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return norm === 0 ? 0 : sum / norm;
}

/**
 * Bruit « de crête » : les maxima deviennent des arêtes vives, les minima des
 * vallées molles. C'est ce qui donne aux monts du Forez leur profil de dos
 * d'âne plutôt qu'un profil de vague.
 */
export function ridged(noise: Noise1D, x: number, octaves = 5): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const n = 1 - Math.abs(noise(x * freq));
    sum += n * n * amp;
    norm += amp;
    amp *= 0.52;
    freq *= 2.07;
  }
  return norm === 0 ? 0 : (sum / norm) * 2 - 1;
}

/** Borne utilitaire. */
export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Interpolation linéaire. */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Rampe lisse entre deux bornes. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge1 === edge0) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
