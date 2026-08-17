/**
 * Boîte à outils de peinture — page d'accueil.
 *
 * Elle encode les sept lois du rendu (docs/01-ART-BIBLE.md §1) sous forme de
 * fonctions, pour qu'aucun plan de la scène ne puisse s'en écarter par
 * inadvertance :
 *
 *  - `mix`, `tint`, `shade` : lumière chaude, ombre froide, jamais de gris ;
 *  - `aerial` : perspective atmosphérique vers le bleu de brume ;
 *  - `contourOf` : contour teinté, jamais noir ;
 *  - `grainTile`, `noiseMask` : la troisième strate obligatoire de toute
 *    surface — sans elle on obtient un aplat, ce qui est un défaut ;
 *  - `rimLight` : le liseré doré à 40 % qui décolle les silhouettes.
 *
 * Rien ici ne dépend de React : ce sont des primitives de canvas 2D.
 */

import { clamp, fbm2, makeNoise2D, mulberry32 } from './noise.js';

/* ─────────────────────────────── Palette ────────────────────────────────── */

/** Palette validée (bible artistique §2). Aucun `#FFF`, aucun `#000`. */
export const C = {
  granitAnthracite: '#2A2C2F',
  granitClair: '#4A4E52',
  mousseSombre: '#2F3B2E',
  vertSapin: '#1E3226',
  vertHetre: '#4A6138',
  brunFougere: '#6B5433',
  bleuBrume: '#8FA6B8',
  bleuProfond: '#2B3A4A',
  ocre: '#C08A3E',
  grenat: '#6E1F2A',
  vieilOr: '#C9A227',
  parchemin: '#E8DCC0',
  parcheminOmbre: '#C9B996',
  encre: '#241C14',
  /** lumière directe du soleil de nord-ouest */
  lumiere: '#FFE9C2',
  /** ombre propre */
  ombre: '#3A4657',
  /** ombre portée */
  ombrePortee: '#2A3242',
} as const;

/** Direction unique du soleil : azimut 315°, élévation 38°. */
export const SUN = {
  azimuthDeg: 315,
  elevationDeg: 38,
  /** vecteur écran de la lumière : elle vient du haut-gauche */
  from: { x: -0.7071, y: -0.7071 },
  /** vecteur de l'ombre portée : vers le bas-droite */
  shadow: { x: 0.7071, y: 0.7071 },
  lengthFactor: 1.28,
  shadowOpacity: 0.32,
  rimOpacity: 0.4,
} as const;

/* ──────────────────────────────── Couleur ───────────────────────────────── */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const CACHE = new Map<string, Rgb>();

/** Décompose `#rrggbb`. Une couleur inconnue retombe sur l'ombre froide. */
export function rgb(hex: string): Rgb {
  const found = CACHE.get(hex);
  if (found) return found;
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0x3a4657;
  const value = { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  CACHE.set(hex, value);
  return value;
}

function toHex2(n: number): string {
  const v = clamp(Math.round(n), 0, 255).toString(16);
  return v.length === 1 ? `0${v}` : v;
}

/** Recompose `#rrggbb`. */
export function hex(c: Rgb): string {
  return `#${toHex2(c.r)}${toHex2(c.g)}${toHex2(c.b)}`;
}

/** Mélange deux couleurs. `t = 0` renvoie `a`, `t = 1` renvoie `b`. */
export function mix(a: string, b: string, t: number): string {
  const x = rgb(a);
  const y = rgb(b);
  const k = clamp(t, 0, 1);
  return hex({ r: x.r + (y.r - x.r) * k, g: x.g + (y.g - x.g) * k, b: x.b + (y.b - x.b) * k });
}

/** Couleur en `rgba()`, pour les alphas. */
export function rgba(color: string, alpha: number): string {
  const c = rgb(color);
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${clamp(alpha, 0, 1)})`;
}

/** Assombrit **vers l'ombre froide** : loi n°3, jamais vers le noir. */
export function shade(color: string, amount: number): string {
  return mix(color, C.ombrePortee, amount);
}

/** Éclaircit **vers la lumière chaude** : loi n°3, jamais vers le blanc. */
export function tint(color: string, amount: number): string {
  return mix(color, C.lumiere, amount);
}

/**
 * Perspective atmosphérique (loi n°5) : `mix = clamp(distance / 1400, 0, 0.55)`
 * vers le bleu de brume.
 */
export function aerial(color: string, distance: number): string {
  return mix(color, C.bleuBrume, clamp(distance / 1400, 0, 0.55));
}

/** Contour teinté (loi n°6) : couleur locale assombrie de 45 %, jamais `#000`. */
export function contourOf(color: string): string {
  const c = rgb(color);
  return mix(hex({ r: c.r * 0.55, g: c.g * 0.55, b: c.b * 0.55 }), C.ombrePortee, 0.22);
}

/* ─────────────────────────── Surfaces et grain ──────────────────────────── */

/** Crée un canvas hors écran dimensionné en pixels de rendu. */
export function surface(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

/** Contexte 2D d'un canvas hors écran, avec repli explicite en français. */
export function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Le contexte 2D n'est pas disponible sur ce navigateur.");
  return ctx;
}

const GRAIN_CACHE = new Map<string, HTMLCanvasElement>();

/**
 * Tuile de grain — la troisième strate de toute surface (loi n°1).
 * Le grain est **teinté** : sombre bleuté, clair ambré, jamais un gris neutre.
 */
export function grainTile(size = 128, seed = 7, strength = 26): HTMLCanvasElement {
  const key = `${size}|${seed}|${strength}`;
  const found = GRAIN_CACHE.get(key);
  if (found) return found;
  const canvas = surface(size, size);
  const ctx = context2d(canvas);
  const image = ctx.createImageData(size, size);
  const data = image.data;
  const rand = mulberry32(seed * 9176 + 13);
  const cold = rgb(C.ombre);
  const warm = rgb(C.lumiere);
  for (let i = 0; i < size * size; i++) {
    const v = rand() * 2 - 1;
    const c = v < 0 ? cold : warm;
    const a = Math.abs(v) * strength;
    data[i * 4] = c.r;
    data[i * 4 + 1] = c.g;
    data[i * 4 + 2] = c.b;
    data[i * 4 + 3] = a;
  }
  ctx.putImageData(image, 0, 0);
  GRAIN_CACHE.set(key, canvas);
  return canvas;
}

/** Pose le grain sur toute une surface, en motif répété. */
export function layGrain(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  alpha = 0.11,
  seed = 7,
  offsetX = 0,
  offsetY = 0,
): void {
  const pattern = ctx.createPattern(grainTile(128, seed), 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(offsetX, offsetY);
  ctx.fillStyle = pattern;
  ctx.fillRect(-offsetX, -offsetY, width, height);
  ctx.restore();
}

/**
 * Masque de bruit fractal, rendu en basse résolution puis agrandi : c'est ce
 * qui érode les formes trop géométriques (nuages, brume, mousse, lisières).
 * Le canal alpha porte le masque ; la couleur est neutre.
 */
export function noiseMask(
  width: number,
  height: number,
  seed: number,
  scale: number,
  threshold = 0,
  contrast = 1,
): HTMLCanvasElement {
  const step = 4;
  const w = Math.max(2, Math.ceil(width / step));
  const h = Math.max(2, Math.ceil(height / step));
  const small = surface(w, h);
  const sctx = context2d(small);
  const image = sctx.createImageData(w, h);
  const data = image.data;
  const noise = makeNoise2D(seed);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const n = fbm2(noise, (x * step) / scale, (y * step) / scale, 4, 0.52, 2.11);
      const a = clamp((n - threshold) * contrast * 0.5 + 0.5, 0, 1);
      const i = (y * w + x) * 4;
      data[i] = 120;
      data[i + 1] = 120;
      data[i + 2] = 120;
      data[i + 3] = a * 255;
    }
  }
  sctx.putImageData(image, 0, 0);
  const big = surface(width, height);
  const bctx = context2d(big);
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, width, height);
  return big;
}

/* ───────────────────────────── Lumière et forme ─────────────────────────── */

/**
 * Dégradé de matière conforme aux lois 1 et 3 : trois strates au minimum, la
 * face éclairée vers le nord-ouest, l'ombre vers le sud-est, toujours teintées.
 */
export function bodyGradient(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  base: string,
  lightAmount = 0.3,
  shadeAmount = 0.42,
): CanvasGradient {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, tint(base, lightAmount));
  g.addColorStop(0.34, tint(base, lightAmount * 0.34));
  g.addColorStop(0.62, base);
  g.addColorStop(1, shade(base, shadeAmount));
  return g;
}

/**
 * Liseré de contre-jour (loi n°4) : `#C9A227` à 40 %, du côté **opposé** au
 * soleil, donc au sud-est. Le tracé reçu est décalé d'un pixel et redessiné.
 */
export function rimLight(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  width = 1.6,
  opacity: number = SUN.rimOpacity,
): void {
  ctx.save();
  ctx.clip(path);
  ctx.translate(-1.1, -1.1);
  ctx.strokeStyle = rgba(C.vieilOr, opacity);
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  ctx.restore();
}

/** Éclat chaud sur l'arête tournée vers le soleil (nord-ouest). */
export function sunEdge(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  width = 1.4,
  opacity = 0.34,
): void {
  ctx.save();
  ctx.clip(path);
  ctx.translate(1.1, 1.1);
  ctx.strokeStyle = rgba(C.lumiere, opacity);
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.stroke(path);
  ctx.restore();
}

/** Contour teinté d'épaisseur variable (loi n°6) : jamais `#000`. */
export function tintedOutline(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  base: string,
  width = 1.15,
): void {
  ctx.save();
  ctx.strokeStyle = contourOf(base);
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(path);
  ctx.restore();
}

/** Ombre portée vers le sud-est, bleutée, jamais noire (loi n°2). */
export function castShadow(
  ctx: CanvasRenderingContext2D,
  path: Path2D,
  height: number,
  opacity: number = SUN.shadowOpacity,
): void {
  const d = height * SUN.lengthFactor;
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.translate(SUN.shadow.x * d, SUN.shadow.y * d * 0.36);
  ctx.fillStyle = C.ombrePortee;
  ctx.fill(path);
  ctx.restore();
}

const SPRITE_CACHE = new Map<string, HTMLCanvasElement>();

/**
 * Vignette douce pré-rendue : les particules sont des `drawImage` et non des
 * dégradés recréés à chaque image — c'est la condition des 60 images/seconde.
 */
export function softSprite(radius: number, color: string, hardness = 0.18): HTMLCanvasElement {
  const key = `${radius}|${color}|${hardness}`;
  const found = SPRITE_CACHE.get(key);
  if (found) return found;
  const size = Math.max(4, Math.ceil(radius * 2));
  const canvas = surface(size, size);
  const ctx = context2d(canvas);
  const g = ctx.createRadialGradient(size / 2, size / 2, size * hardness * 0.5, size / 2, size / 2, size / 2);
  g.addColorStop(0, rgba(color, 0.92));
  g.addColorStop(0.42, rgba(color, 0.4));
  g.addColorStop(0.78, rgba(color, 0.1));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  SPRITE_CACHE.set(key, canvas);
  return canvas;
}

/**
 * Vignette de brume : plus large, plus molle, légèrement déformée par un bruit
 * pour qu'aucune particule ne soit un disque parfait (critère d'échec §10).
 */
export function mistSprite(radius: number, seed: number): HTMLCanvasElement {
  const key = `mist|${radius}|${seed}`;
  const found = SPRITE_CACHE.get(key);
  if (found) return found;
  const size = Math.max(8, Math.ceil(radius * 2));
  const canvas = surface(size, size);
  const ctx = context2d(canvas);
  const rand = mulberry32(seed * 131 + 7);
  for (let i = 0; i < 5; i++) {
    const r = (size / 2) * (0.42 + rand() * 0.34);
    const cx = size / 2 + (rand() - 0.5) * size * 0.3;
    const cy = size / 2 + (rand() - 0.5) * size * 0.22;
    const g = ctx.createRadialGradient(cx, cy, r * 0.1, cx, cy, r);
    g.addColorStop(0, rgba(C.bleuBrume, 0.3));
    g.addColorStop(0.55, rgba(C.bleuBrume, 0.11));
    g.addColorStop(1, rgba(C.bleuBrume, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(cx, cy, r, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  SPRITE_CACHE.set(key, canvas);
  return canvas;
}

/* ─────────────────────────────── Géométrie ──────────────────────────────── */

/**
 * Polygone irrégulier — une roche, jamais un cercle parfait. Le rayon est
 * modulé par un bruit angulaire, les sommets sont reliés en courbes.
 */
export function blobPath(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed: number,
  roughness = 0.28,
  points = 14,
): Path2D {
  const rand = mulberry32(seed);
  const pts: { x: number; y: number }[] = [];
  const wobble: number[] = [];
  for (let i = 0; i < points; i++) wobble.push(1 + (rand() - 0.5) * 2 * roughness);
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2;
    const k = (wobble[i] + wobble[(i + 1) % points]) / 2;
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  const path = new Path2D();
  path.moveTo((pts[0].x + pts[points - 1].x) / 2, (pts[0].y + pts[points - 1].y) / 2);
  for (let i = 0; i < points; i++) {
    const cur = pts[i];
    const next = pts[(i + 1) % points];
    path.quadraticCurveTo(cur.x, cur.y, (cur.x + next.x) / 2, (cur.y + next.y) / 2);
  }
  path.closePath();
  return path;
}
