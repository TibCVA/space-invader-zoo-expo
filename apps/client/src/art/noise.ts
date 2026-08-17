/**
 * Bruits déterministes pour la génération de matière.
 *
 * Rien ici n'utilise `Math.random` : chaque texture, chaque variante de prop et
 * chaque perturbation de silhouette doit être reproductible d'une session à
 * l'autre, sinon la revue visuelle automatisée n'a plus de sens.
 */

/** Générateur pseudo-aléatoire 32 bits, rapide et reproductible. */
export function prng(seed: number): () => number {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hachage d'une chaîne en entier 32 bits (identifiants → graines stables). */
export function hashString(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Hachage de deux entiers vers 0..1. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(seed | 0, 0x9e3779b9);
  h ^= h >>> 15;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);

/**
 * Bruit de valeur **périodique** : `valueNoise(x + period, y) === valueNoise(x, y)`.
 * C'est la condition pour obtenir des textures répétables sans couture.
 */
export function valueNoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const wrap = (v: number): number => ((v % period) + period) % period;
  const x0 = wrap(xi);
  const y0 = wrap(yi);
  const x1 = wrap(xi + 1);
  const y1 = wrap(yi + 1);
  const u = fade(xf);
  const v = fade(yf);
  const a = hash2(x0, y0, seed);
  const b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed);
  const d = hash2(x1, y1, seed);
  const top = a + (b - a) * u;
  const bottom = c + (d - c) * u;
  return top + (bottom - top) * v;
}

/** Bruit fractal périodique, `octaves` couches de fréquence doublée. */
export function fbm(
  x: number,
  y: number,
  period: number,
  seed: number,
  octaves = 4,
  gain = 0.5,
): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * valueNoise(x * freq, y * freq, period * freq, seed + i * 1013);
    norm += amp;
    amp *= gain;
    freq *= 2;
  }
  return sum / norm;
}

/** Bruit « crête » : |2n-1| inversé, donne des veines et des fibres. */
export function ridged(x: number, y: number, period: number, seed: number, octaves = 3): number {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let freq = 1;
  for (let i = 0; i < octaves; i += 1) {
    const n = valueNoise(x * freq, y * freq, period * freq, seed + i * 7717);
    sum += amp * (1 - Math.abs(n * 2 - 1));
    norm += amp;
    amp *= 0.55;
    freq *= 2;
  }
  return sum / norm;
}

/**
 * Distribution « bruit bleu » approximative : n points bien répartis dans un
 * rectangle, sans agglutination. Utilisé pour semer les props et les grains.
 */
export function blueNoisePoints(
  count: number,
  width: number,
  height: number,
  seed: number,
  tries = 12,
): { x: number; y: number }[] {
  const rand = prng(seed);
  const points: { x: number; y: number }[] = [];
  const minDist = Math.sqrt((width * height) / Math.max(1, count)) * 0.72;
  for (let i = 0; i < count; i += 1) {
    let best = { x: rand() * width, y: rand() * height };
    let bestScore = -1;
    for (let t = 0; t < tries; t += 1) {
      const cand = { x: rand() * width, y: rand() * height };
      let nearest = Infinity;
      for (const p of points) {
        const dx = p.x - cand.x;
        const dy = p.y - cand.y;
        const d = dx * dx + dy * dy;
        if (d < nearest) nearest = d;
      }
      if (nearest > bestScore) {
        bestScore = nearest;
        best = cand;
      }
      if (nearest > minDist * minDist) break;
    }
    points.push(best);
  }
  return points;
}
