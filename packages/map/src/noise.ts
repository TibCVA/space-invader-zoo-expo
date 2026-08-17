/**
 * Bruit déterministe **entier** pour la rugosité du relief.
 *
 * Aucun `Math.random`, aucun flottant : le champ est identique au bit près sur
 * toutes les machines, ce qui est indispensable puisque le placement des
 * objets — donc le hash de la partie — dépend du terrain.
 *
 * Le bruit de valeur est interpolé par un `smoothstep` entier sur 1024, et le
 * bruit fractal en somme quatre octaves de tailles et d'amplitudes
 * décroissantes.
 */

/** Mélangeur entier 32 bits (variante de xxHash finalizer). */
export function hash2i(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(seed, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) | 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** `smoothstep(t)` entier : entrée et sortie sur 0..1024. */
function smoothstep1024(f: number, cell: number): number {
  const t = Math.trunc((f * 1024) / cell);
  return Math.trunc((t * t * (3072 - 2 * t)) / 1048576);
}

/**
 * Bruit de valeur lissé sur une maille de `cell` cases.
 * Retourne un entier dans `[-amp, +amp]`.
 */
export function valueNoise(
  x: number,
  y: number,
  cell: number,
  seed: number,
  amp: number,
): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x - gx * cell;
  const fy = y - gy * cell;

  const n00 = hash2i(gx, gy, seed) % 2048;
  const n10 = hash2i(gx + 1, gy, seed) % 2048;
  const n01 = hash2i(gx, gy + 1, seed) % 2048;
  const n11 = hash2i(gx + 1, gy + 1, seed) % 2048;

  const tx = smoothstep1024(fx, cell);
  const ty = smoothstep1024(fy, cell);

  const a = n00 + (((n10 - n00) * tx) >> 10);
  const b = n01 + (((n11 - n01) * tx) >> 10);
  const v = a + (((b - a) * ty) >> 10);
  return Math.trunc(((v - 1024) * amp) / 1024);
}

export interface Octave {
  /** Taille de maille, en cases. */
  cell: number;
  /** Amplitude, dans l'unité du champ (mètres pour l'altitude). */
  amp: number;
}

/** Rugosité fractale : somme d'octaves de bruit de valeur. */
export function fractalNoise(
  x: number,
  y: number,
  seed: number,
  octaves: readonly Octave[],
): number {
  let total = 0;
  for (let i = 0; i < octaves.length; i++) {
    const o = octaves[i];
    total += valueNoise(x, y, o.cell, (seed ^ (i * 0x9e3779b1)) | 0, o.amp);
  }
  return total;
}

/** Octaves du relief : quatre échelles, de 4,6 km à 240 m. */
export const RELIEF_OCTAVES: readonly Octave[] = [
  { cell: 88, amp: 74 },
  { cell: 33, amp: 44 },
  { cell: 12, amp: 25 },
  { cell: 4, amp: 10 },
];

/** Octaves de l'humidité : champ lent, valeurs en centièmes. */
export const MOISTURE_OCTAVES: readonly Octave[] = [
  { cell: 58, amp: 60 },
  { cell: 21, amp: 26 },
  { cell: 8, amp: 12 },
  { cell: 3, amp: 5 },
];

/** Octaves du couvert forestier, en centièmes. */
export const CANOPY_OCTAVES: readonly Octave[] = [
  { cell: 44, amp: 64 },
  { cell: 17, amp: 28 },
  { cell: 7, amp: 12 },
  { cell: 3, amp: 5 },
];
