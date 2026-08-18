/**
 * `render/commun.ts` — outillage partagé par les couches de la carte.
 *
 * Rien ici ne dessine : ce sont les conversions case ↔ écran, les champs de
 * bruit répétables qui nourrissent le grain et les lisières, et les quelques
 * manipulations chromatiques en flottants dont la peinture par pixel a besoin
 * (la palette officielle, elle, vit dans `art/palette.ts` et n'est jamais
 * contournée : toutes les teintes de la carte en descendent).
 */

import { TERRAINS } from '@auvergne/engine';
import { prng } from '../art/noise.js';
import { LIGHT, PALETTE } from '../art/palette.js';

/* ───────────────────────────── Index des terrains ───────────────────────── */

/** Indices des huit terrains du moteur, lus depuis le contrat et non recopiés. */
export const TER = {
  route: TERRAINS.indexOf('route'),
  chemin: TERRAINS.indexOf('chemin'),
  prairie: TERRAINS.indexOf('prairie'),
  foret: TERRAINS.indexOf('foret'),
  pente: TERRAINS.indexOf('pente'),
  humide: TERRAINS.indexOf('humide'),
  rocher: TERRAINS.indexOf('rocher'),
  eau: TERRAINS.indexOf('eau'),
} as const;

/** Vrai pour une case portant une voie tracée (chaussée ou chemin). */
export function estVoie(terrain: number): boolean {
  return terrain === TER.route || terrain === TER.chemin;
}

/* ─────────────────────────────── Cadrage ────────────────────────────────── */

/**
 * Ce que toutes les couches ont besoin de savoir pour se placer : le centre de
 * la caméra en cases fractionnaires, l'échelle en pixels par case, et la taille
 * utile en pixels CSS. L'origine locale des couches est le coin haut-gauche de
 * la zone utile.
 */
export interface Cadrage {
  /** colonne au centre de l'écran (fractionnaire) */
  readonly col: number;
  /** ligne au centre de l'écran (fractionnaire) */
  readonly row: number;
  /** pixels par case */
  readonly zoom: number;
  readonly largeur: number;
  readonly hauteur: number;
}

/** Abscisse écran d'une coordonnée de colonne **continue** (145.5 = centre de 145). */
export function xEcran(v: Cadrage, col: number): number {
  return v.largeur / 2 + (col - v.col) * v.zoom;
}

/** Ordonnée écran d'une coordonnée de ligne continue. */
export function yEcran(v: Cadrage, row: number): number {
  return v.hauteur / 2 + (row - v.row) * v.zoom;
}

/** Colonne continue sous une abscisse écran. */
export function colEcran(v: Cadrage, x: number): number {
  return v.col + (x - v.largeur / 2) / v.zoom;
}

/** Ligne continue sous une ordonnée écran. */
export function rowEcran(v: Cadrage, y: number): number {
  return v.row + (y - v.hauteur / 2) / v.zoom;
}

/** Rectangle de cases visibles, marge comprise, borné à la grille. */
export function fenetreCases(
  v: Cadrage,
  world: { cols: number; rows: number },
  marge = 2,
): { col0: number; row0: number; col1: number; row1: number } {
  const col0 = Math.max(0, Math.floor(colEcran(v, 0)) - marge);
  const row0 = Math.max(0, Math.floor(rowEcran(v, 0)) - marge);
  const col1 = Math.min(world.cols - 1, Math.ceil(colEcran(v, v.largeur)) + marge);
  const row1 = Math.min(world.rows - 1, Math.ceil(rowEcran(v, v.hauteur)) + marge);
  return { col0, row0, col1, row1 };
}

/* ────────────────────────────── Petites maths ───────────────────────────── */

export function borne(x: number, min: number, max: number): number {
  return x < min ? min : x > max ? max : x;
}

/** Interpolation adoucie (3t² − 2t³) : c'est elle qui interdit les bords durs. */
export function adoucir(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

export function melange(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/* ──────────────────────────── Couleurs flottantes ───────────────────────── */

export interface Rgbf {
  r: number;
  g: number;
  b: number;
}

export function rgbf(couleur: number): Rgbf {
  return { r: (couleur >> 16) & 255, g: (couleur >> 8) & 255, b: couleur & 255 };
}

/** Mélange en place : `cible` reçoit `cible × (1−t) + vers × t`. */
export function verser(cible: Rgbf, vers: Rgbf, t: number): void {
  cible.r += (vers.r - cible.r) * t;
  cible.g += (vers.g - cible.g) * t;
  cible.b += (vers.b - cible.b) * t;
}

/** Entier 0xRRGGBB depuis trois composantes flottantes bornées. */
export function versEntier(c: Rgbf): number {
  const r = borne(Math.round(c.r), 0, 255);
  const g = borne(Math.round(c.g), 0, 255);
  const b = borne(Math.round(c.b), 0, 255);
  return (r << 16) | (g << 8) | b;
}

/** Teintes de référence, converties une fois pour toutes. */
export const CHAUDE = rgbf(LIGHT.chaude);
export const FROIDE = rgbf(LIGHT.froide);
export const BRUME = rgbf(LIGHT.brume);
export const OMBRE_PORTEE = rgbf(LIGHT.ombrePortee);
export const PARCHEMIN = rgbf(PALETTE.parchemin);

/* ─────────────────────────────── Champ de bruit ─────────────────────────── */

/**
 * Champ de bruit **répétable** : une grille de valeurs lissées dans [−1, 1]
 * qu'on échantillonne modulo sa taille. Deux passes de flou en enveloppe la
 * rendent sans couture, ce qui permet de la carreler à l'infini sur la carte
 * sans jamais montrer de raccord.
 */
export class ChampBruit {
  private readonly d: Float32Array;

  constructor(
    readonly taille: number,
    graine: number,
    passes = 2,
  ) {
    const n = taille * taille;
    let a: Float32Array = new Float32Array(n);
    const rand = prng(graine);
    for (let i = 0; i < n; i += 1) a[i] = rand() * 2 - 1;
    for (let p = 0; p < passes; p += 1) a = this.flouer(a);
    /* Recentrage : le flou tasse l'amplitude, on la rend au champ. */
    let max = 1e-6;
    for (let i = 0; i < n; i += 1) if (Math.abs(a[i]) > max) max = Math.abs(a[i]);
    for (let i = 0; i < n; i += 1) a[i] /= max;
    this.d = a;
  }

  private flouer(src: Float32Array): Float32Array {
    const t = this.taille;
    const out = new Float32Array(t * t);
    for (let y = 0; y < t; y += 1) {
      const yu = ((y - 1) + t) % t;
      const yd = (y + 1) % t;
      for (let x = 0; x < t; x += 1) {
        const xl = ((x - 1) + t) % t;
        const xr = (x + 1) % t;
        out[y * t + x] =
          (src[yu * t + xl] +
            src[yu * t + x] +
            src[yu * t + xr] +
            src[y * t + xl] +
            src[y * t + x] * 2 +
            src[y * t + xr] +
            src[yd * t + xl] +
            src[yd * t + x] +
            src[yd * t + xr]) /
          10;
      }
    }
    return out;
  }

  /** Échantillon au plus proche : bon marché, réservé au grain haute fréquence. */
  brut(x: number, y: number): number {
    const t = this.taille;
    const i = (((Math.floor(y) % t) + t) % t) * t + (((Math.floor(x) % t) + t) % t);
    return this.d[i];
  }

  /** Échantillon bilinéaire : c'est celui qui sert aux lisières et au gauchissement. */
  doux(x: number, y: number): number {
    const t = this.taille;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const ix0 = ((x0 % t) + t) % t;
    const iy0 = ((y0 % t) + t) % t;
    const ix1 = (ix0 + 1) % t;
    const iy1 = (iy0 + 1) % t;
    const a = this.d[iy0 * t + ix0];
    const b = this.d[iy0 * t + ix1];
    const c = this.d[iy1 * t + ix0];
    const e = this.d[iy1 * t + ix1];
    const h = a + (b - a) * fx;
    const i = c + (e - c) * fx;
    return h + (i - h) * fy;
  }
}

/** Les champs partagés par toutes les couches, construits une seule fois. */
export interface Champs {
  /** basse fréquence : gauchit les lisières de biome */
  readonly gauche: ChampBruit;
  readonly gaucheB: ChampBruit;
  /** moyenne fréquence : première octave du bruit de matière */
  readonly matiere: ChampBruit;
  /** haute fréquence : seconde octave, et grain de parchemin */
  readonly grain: ChampBruit;
}

let champsPartages: Champs | null = null;

/** Champs de bruit du rendu de carte, déterministes et partagés. */
export function champs(): Champs {
  champsPartages ??= {
    gauche: new ChampBruit(96, 0x5f6f4a, 3),
    gaucheB: new ChampBruit(96, 0x2a7b31, 3),
    matiere: new ChampBruit(128, 0x1c4d77, 2),
    grain: new ChampBruit(128, 0x7a2f19, 1),
  };
  return champsPartages;
}

/* ─────────────────────────── Hasard de position ─────────────────────────── */

/** Valeur déterministe dans [0, 1) attachée à une case et à un sélecteur. */
export function alea(col: number, row: number, sel: number): number {
  let h = (col * 0x1f1f1f1f) ^ (row * 0x27d4eb2d) ^ (sel * 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
