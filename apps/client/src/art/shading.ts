/**
 * Primitives de peinture réutilisables.
 *
 * Tout ce qui est dessiné dans le jeu passe par ce module. Il matérialise en
 * code les sept lois de docs/01-ART-BIBLE.md §1 :
 *
 *  1. `peindre()` pose toujours au minimum trois strates : teinte, variation de
 *     valeur (dégradé multi-arrêt), matière (motif de grain répétable).
 *  2. Une seule direction de lumière, importée de `palette.ts` (315° / 38°).
 *  3. Les hautes lumières tirent vers l'ambre, les ombres vers le bleu-violet.
 *  4. `liseréLumière()` pose systématiquement le rim doré côté opposé au soleil.
 *  5. `perspectiveAtmospherique()` (palette) est appliquée par les appelants.
 *  6. `contourVariable()` ne trace jamais de noir et fait varier son épaisseur.
 *  7. Les formes passent par `blob()` / `perturber()` : aucun cercle parfait.
 */
import { Matrix, Texture, FillGradient, FillPattern } from 'pixi.js';
import type { Graphics, ColorSource } from 'pixi.js';
import {
  LIGHT,
  assombrir,
  contourTeinte,
  cssAlpha,
  demiTeinte,
  eclaircir,
  faceEclairee,
  melanger,
  ombreBleutee,
  rimDoree,
  speculaire,
} from './palette.js';
import { fbm, hash2, prng, ridged, valueNoise } from './noise.js';

/* ─────────────────────────────── Géométrie ──────────────────────────────── */

export interface Pt {
  x: number;
  y: number;
}
export type Poly = Pt[];

export function pt(x: number, y: number): Pt {
  return { x, y };
}

/** Aplatit un polygone pour `Graphics.poly`. */
export function flat(poly: Poly): number[] {
  const out: number[] = new Array(poly.length * 2);
  for (let i = 0; i < poly.length; i += 1) {
    out[i * 2] = poly[i].x;
    out[i * 2 + 1] = poly[i].y;
  }
  return out;
}

export function centroid(poly: Poly): Pt {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  return { x: x / poly.length, y: y / poly.length };
}

export function bounds(poly: Poly): { x: number; y: number; w: number; h: number } {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/** Aire signée : positive si le polygone tourne dans le sens horaire à l'écran. */
export function signedArea(poly: Poly): number {
  let a = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/** Normale sortante de l'arête `i`, orientation détectée automatiquement. */
function outwardNormal(poly: Poly, i: number, clockwise: boolean): Pt {
  const p = poly[i];
  const q = poly[(i + 1) % poly.length];
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const len = Math.hypot(dx, dy) || 1;
  return clockwise ? { x: dy / len, y: -dx / len } : { x: -dy / len, y: dx / len };
}

/**
 * Découpe un polygone par un demi-plan (Sutherland–Hodgman).
 * Conserve les sommets tels que `(p − origine) · normale ≥ 0`.
 * C'est ce qui permet un ombrage cel exact, sans masque ni filtre.
 */
export function clipHalfPlane(poly: Poly, origin: Pt, normal: Pt): Poly {
  if (poly.length < 3) return [];
  const side = (p: Pt): number => (p.x - origin.x) * normal.x + (p.y - origin.y) * normal.y;
  const out: Poly = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const sa = side(a);
    const sb = side(b);
    if (sa >= 0) out.push(a);
    if ((sa >= 0 && sb < 0) || (sa < 0 && sb >= 0)) {
      const t = sa / (sa - sb);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** Translation d'un polygone. */
export function translater(poly: Poly, dx: number, dy: number): Poly {
  return poly.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

/** Homothétie autour d'un centre (par défaut le centroïde). */
export function echelonner(poly: Poly, sx: number, sy = sx, around?: Pt): Poly {
  const c = around ?? centroid(poly);
  return poly.map((p) => ({ x: c.x + (p.x - c.x) * sx, y: c.y + (p.y - c.y) * sy }));
}

/** Rotation d'un polygone autour d'un point. */
export function pivoter(poly: Poly, angle: number, around?: Pt): Poly {
  const c = around ?? centroid(poly);
  const co = Math.cos(angle);
  const si = Math.sin(angle);
  return poly.map((p) => {
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    return { x: c.x + dx * co - dy * si, y: c.y + dx * si + dy * co };
  });
}

/**
 * Perturbe chaque sommet par un bruit déterministe : loi n°7 du « rien de
 * parfaitement géométrique ». Un rectangle brut n'existe pas dans ce jeu.
 */
export function perturber(poly: Poly, amplitude: number, seed: number): Poly {
  return poly.map((p, i) => ({
    x: p.x + (hash2(i, seed, 17) - 0.5) * 2 * amplitude,
    y: p.y + (hash2(i, seed, 91) - 0.5) * 2 * amplitude,
  }));
}

/** Densifie un contour en insérant des points intermédiaires (avant perturbation). */
export function densifier(poly: Poly, step: number): Poly {
  const out: Poly = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.max(1, Math.round(d / step));
    for (let k = 0; k < n; k += 1) {
      const t = k / n;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return out;
}

/** Lissage de Chaikin : arrondit un polygone sans le rendre circulaire. */
export function lisser(poly: Poly, passes = 1): Poly {
  let cur = poly;
  for (let k = 0; k < passes; k += 1) {
    const out: Poly = [];
    for (let i = 0; i < cur.length; i += 1) {
      const a = cur[i];
      const b = cur[(i + 1) % cur.length];
      out.push({ x: a.x * 0.75 + b.x * 0.25, y: a.y * 0.75 + b.y * 0.25 });
      out.push({ x: a.x * 0.25 + b.x * 0.75, y: a.y * 0.25 + b.y * 0.75 });
    }
    cur = out;
  }
  return cur;
}

/**
 * Forme organique proche d'une ellipse, mais jamais une ellipse : chaque rayon
 * est modulé par un bruit périodique. Remplace tous les cercles du jeu.
 */
export function blob(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  opts: { seed?: number; points?: number; wobble?: number; from?: number; to?: number } = {},
): Poly {
  const n = opts.points ?? 22;
  const wob = opts.wobble ?? 0.09;
  const seed = opts.seed ?? 1;
  const from = opts.from ?? 0;
  const to = opts.to ?? Math.PI * 2;
  const closed = Math.abs(to - from - Math.PI * 2) < 1e-6;
  const count = closed ? n : n + 1;
  const out: Poly = [];
  for (let i = 0; i < count; i += 1) {
    const t = from + ((to - from) * i) / (closed ? n : n);
    const k = valueNoise(Math.cos(t) * 2.4 + 4, Math.sin(t) * 2.4 + 4, 16, seed);
    const r = 1 + (k - 0.5) * 2 * wob;
    out.push({ x: cx + Math.cos(t) * rx * r, y: cy + Math.sin(t) * ry * r });
  }
  return out;
}

/** Quadrilatère biseauté et perturbé : le « rectangle » légal du jeu. */
export function dalle(
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { chamfer?: number; seed?: number; wobble?: number } = {},
): Poly {
  const c = opts.chamfer ?? Math.min(w, h) * 0.16;
  const base: Poly = [
    { x: x + c, y },
    { x: x + w - c * 0.7, y: y + h * 0.02 },
    { x: x + w, y: y + c },
    { x: x + w - h * 0.03, y: y + h - c * 0.8 },
    { x: x + w - c, y: y + h },
    { x: x + c * 0.8, y: y + h - h * 0.02 },
    { x, y: y + h - c },
    { x: x + w * 0.02, y: y + c * 0.9 },
  ];
  return perturber(densifier(base, Math.max(4, Math.min(w, h) / 3)), opts.wobble ?? 0.7, opts.seed ?? 3);
}

/** Fuseau : forme allongée à deux pointes (membres, feuilles, lames). */
export function fuseau(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  width: number,
  opts: { seed?: number; bias?: number; taper?: number } = {},
): Poly {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const steps = 12;
  const taper = opts.taper ?? 0.15;
  const bias = opts.bias ?? 0.45;
  const left: Poly = [];
  const right: Poly = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const profile = Math.sin(Math.PI * Math.pow(t, bias * 1.4)) * (1 - taper * t) + taper * 0.35;
    const w = (width / 2) * profile;
    const px = ax + dx * t;
    const py = ay + dy * t;
    const j = valueNoise(t * 5, opts.seed ?? 0, 16, opts.seed ?? 0) - 0.5;
    left.push({ x: px + nx * w * (1 + j * 0.14), y: py + ny * w * (1 + j * 0.14) });
    right.push({ x: px - nx * w * (1 - j * 0.14), y: py - ny * w * (1 - j * 0.14) });
  }
  right.reverse();
  return [...left, ...right];
}

/** Arc épais (cornes, anses, ramures, arceaux). */
export function arcBande(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  thick: number,
  taper = 0.4,
): Poly {
  const steps = 16;
  const inner: Poly = [];
  const outer: Poly = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const a = a0 + (a1 - a0) * t;
    const w = (thick / 2) * (1 - taper * t);
    outer.push({ x: cx + Math.cos(a) * (rx + w), y: cy + Math.sin(a) * (ry + w) });
    inner.push({ x: cx + Math.cos(a) * (rx - w), y: cy + Math.sin(a) * (ry - w) });
  }
  inner.reverse();
  return [...outer, ...inner];
}

/* ─────────────────────────── Dégradés et motifs ─────────────────────────── */

export interface Stop {
  offset: number;
  color: number;
  alpha?: number;
}

/**
 * Taille de la texture de rampe fabriquée par `FillGradient` : c'est aussi le
 * facteur parasite qu'il faut compenser ci-dessous. On la lit chez PixiJS pour
 * que les deux ne puissent pas diverger.
 */
const TAILLE_RAMPE = FillGradient.defaultLinearOptions.textureSize ?? 256;

/**
 * Dégradé linéaire multi-arrêt orienté par un angle en degrés (0° = vers l'est,
 * sens horaire écran). Coordonnées locales à la forme.
 *
 * ── Pourquoi ce calcul n'est pas le calcul évident ──
 *
 * L'écriture naturelle — axe centré, `start = (0,5 - dx/2 ; 0,5 - dy/2)`,
 * `end` symétrique — ne marche qu'aux angles 0, 90, 180 et 270°. À tout autre
 * angle elle pose un APLAT d'une seule couleur. Mesuré, pas supposé : balayage
 * de 23 angles sur le même rectangle, écart-type de luminance 53,1 à 0° et
 * 52,6 à 90°, mais 0,00 à 1, 5, 15, 30, 45, 60, 89, 118, 135, 225, 315 et 359°.
 * Les trois couches qui portent le modèle de valeur du sol du champ de bataille
 * (field.ts, biome / nappe froide / glacis, toutes à 45°) étaient donc mortes :
 * le dégradé de biome devait courir de 0x85885c (luminance 132,2) à 0x1f2a2b
 * (39,7), amplitude 92,5, et posait 0x85885c partout.
 *
 * Le défaut est dans pixi.js 8.19.0, pas ici : `FillGradient.buildLinearGradient`
 * compose `scale(dist/256, 1) ; rotate(angle) ; translate(x0, y0)` puis, pour
 * `textureSpace: 'local'`, un `scale(256, 256)` final qui multiplie AUSSI le
 * terme de translation — alors que `generateTextureMatrix()` normalise ensuite
 * la boîte de la forme sur 0..1. Un axe aligné a `x0·dx + y0·dy = 0`, le terme
 * parasite ne fuit pas ; dès que l'axe est oblique il fuit, la coordonnée u
 * part à -53 au lieu de 0..1, et le `clamp-to-edge` renvoie le bord de la
 * rampe : aplat.
 *
 * On corrige donc en deux temps, sans toucher aux appelants :
 *
 *  1. `wrapMode: 'mirror-repeat'` désactive l'échange de coordonnées que
 *     PixiJS ne fait que pour `clamp-to-edge`. Cet échange est lui aussi
 *     fautif : il ramène tout axe dans le premier quadrant et compte sur le
 *     drapeau `flip` pour rétablir le sens, ce qui marche pour une diagonale
 *     nord-ouest → sud-est mais renvoie la diagonale opposée à 118, 135 et
 *     315°. Un simple ancrage de l'axe sur un coin, sans ce changement de
 *     mode, redonne bien un dégradé (écart-type 38,6) mais dans le MAUVAIS
 *     SENS à ces trois angles — mesuré, et c'est pourquoi cette piste plus
 *     courte a été écartée. Le miroir, lui, ne se voit pas : la plage utile
 *     reste [0 ; 1] et la couture maximale relevée sur les bords est de 4,3
 *     niveaux, soit le liseré antialiasé.
 *  2. On pré-divise par `TAILLE_RAMPE` la seule quantité que PixiJS va
 *     multiplier de trop, à savoir la projection du coin d'origine sur l'axe.
 *     `portee` (= |dx| + |dy|) est la largeur du balayage sur le carré unité,
 *     ce qui remet u exactement sur [0 ; 1].
 *
 * Vérifié à l'écran sous la CSP réelle, moteur WebGL, 0 erreur console :
 * 29 cas (23 angles sur rectangle, 4 sur polygone perturbé à 24 sommets,
 * 2 rampes à alpha variable), 0 aplat et 0 sens inversé.
 */
export function degradeLineaire(stops: Stop[], angleDeg: number): FillGradient {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  /* Largeur du balayage de l'axe sur la boîte normalisée 0..1. */
  const portee = Math.abs(dx) + Math.abs(dy);
  /* Projection, sur l'axe, du coin où le dégradé doit valoir 0. */
  const projection = (dx < 0 ? dx : 0) + (dy < 0 ? dy : 0);
  const start = {
    x: (dx * projection) / TAILLE_RAMPE,
    y: (dy * projection) / TAILLE_RAMPE,
  };
  const end = { x: start.x + dx * portee, y: start.y + dy * portee };
  /* PixiJS retourne la rampe dès qu'une composante de l'axe est négative ;
     on retourne alors les arrêts pour annuler l'inversion. */
  const retourne = end.x - start.x < 0 || end.y - start.y < 0;
  const arrets = stops.map((s) => ({
    offset: s.offset,
    color: cssAlpha(s.color, s.alpha ?? 1) as ColorSource,
  }));
  return new FillGradient({
    type: 'linear',
    start,
    end,
    textureSpace: 'local',
    wrapMode: 'mirror-repeat',
    colorStops: retourne
      ? arrets.map((s) => ({ offset: 1 - s.offset, color: s.color })).reverse()
      : arrets,
  });
}

/** Dégradé radial multi-arrêt, utile pour les halos et les ombres douces. */
export function degradeRadial(stops: Stop[], center: Pt = { x: 0.5, y: 0.5 }): FillGradient {
  return new FillGradient({
    type: 'radial',
    center,
    innerRadius: 0,
    outerCenter: center,
    outerRadius: 0.5,
    textureSpace: 'local',
    colorStops: stops.map((s) => ({
      offset: s.offset,
      color: cssAlpha(s.color, s.alpha ?? 1) as ColorSource,
    })),
  });
}

/**
 * Dégradé « éclairage » standard d'une surface : cinq arrêts, du creux d'ombre
 * bleuté à la haute lumière ambrée, orienté selon le soleil (315°).
 */
export function degradeSurface(base: number, force = 1): FillGradient {
  return degradeLineaire(
    [
      { offset: 0, color: faceEclairee(base, 0.85 * force) },
      { offset: 0.24, color: faceEclairee(base, 0.35 * force) },
      { offset: 0.52, color: base },
      { offset: 0.78, color: demiTeinte(base) },
      { offset: 1, color: ombreBleutee(base, 0.65 * force) },
    ],
    135,
  );
}

/* ──────────────────────────── Matières générées ─────────────────────────── */

export type MaterialKey =
  | 'grain'
  | 'parchemin'
  | 'granit'
  | 'ecorce'
  | 'metal'
  | 'tissu'
  | 'fourrure'
  | 'plumes'
  | 'ecailles';

export type MaterialSet = Readonly<Record<MaterialKey, Texture>>;

type Ctx2D = CanvasRenderingContext2D;

function makeCanvas(size: number): { canvas: HTMLCanvasElement; ctx: Ctx2D } {
  if (typeof document === 'undefined') {
    throw new Error("L'atlas artistique requiert un navigateur : aucun document disponible.");
  }
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Contexte 2D indisponible : impossible de générer les matières.");
  return { canvas, ctx };
}

/** Exécute un tracé neuf fois (3×3) pour obtenir un motif répétable sans couture. */
function sansCouture(ctx: Ctx2D, size: number, draw: (c: Ctx2D) => void): void {
  for (let ox = -1; ox <= 1; ox += 1) {
    for (let oy = -1; oy <= 1; oy += 1) {
      ctx.save();
      ctx.translate(ox * size, oy * size);
      draw(ctx);
      ctx.restore();
    }
  }
}

function toTexture(canvas: HTMLCanvasElement): Texture {
  const tex = Texture.from(canvas);
  tex.source.addressMode = 'repeat';
  tex.source.scaleMode = 'linear';
  tex.source.label = 'matiere';
  return tex;
}

/** Grain fin universel : la troisième strate imposée par la loi n°1. */
function texGrain(size = 128): Texture {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const fine = hash2(x, y, 4021);
      const large = fbm(x / 11, y / 11, size / 11, 71, 3);
      const v = fine * 0.62 + large * 0.38;
      // au-dessus de 0,5 on éclaire (ambre), en dessous on assombrit (bleu froid)
      if (v > 0.5) {
        d[i] = 255;
        d[i + 1] = 233;
        d[i + 2] = 194;
        d[i + 3] = Math.min(255, (v - 0.5) * 250);
      } else {
        d[i] = 42;
        d[i + 1] = 50;
        d[i + 2] = 66;
        d[i + 3] = Math.min(255, (0.5 - v) * 250);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/** Parchemin : fibres longues, taches d'humidité, bord piqué. */
function texParchemin(size = 192): Texture {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const fibre = ridged(x / 3.2, y / 26, size / 3.2, 311, 2);
      const tache = fbm(x / 34, y / 34, size / 34, 907, 4);
      const v = fibre * 0.34 + tache * 0.66;
      const chaud = v > 0.52;
      d[i] = chaud ? 255 : 132;
      d[i + 1] = chaud ? 233 : 112;
      d[i + 2] = chaud ? 194 : 84;
      d[i + 3] = Math.min(255, Math.abs(v - 0.52) * 235);
    }
  }
  ctx.putImageData(img, 0, 0);
  const rand = prng(4409);
  ctx.globalCompositeOperation = 'source-over';
  sansCouture(ctx, size, (c) => {
    for (let k = 0; k < 26; k += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 1 + rand() * 2.4;
      c.fillStyle = cssAlpha(0x6b5433, 0.09 + rand() * 0.07);
      c.beginPath();
      c.ellipse(x, y, r, r * (0.6 + rand() * 0.6), rand() * 3, 0, Math.PI * 2);
      c.fill();
    }
  });
  return toTexture(canvas);
}

/** Granit : fond moucheté, feldspath clair, mica sombre, micro-fissures. */
function texGranit(size = 160): Texture {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const grain = hash2(x, y, 2207);
      const bloc = fbm(x / 9, y / 9, size / 9, 5501, 3);
      const v = grain * 0.55 + bloc * 0.45;
      const clair = v > 0.55;
      d[i] = clair ? 255 : 42;
      d[i + 1] = clair ? 233 : 50;
      d[i + 2] = clair ? 194 : 66;
      d[i + 3] = Math.min(255, Math.abs(v - 0.5) * 330);
    }
  }
  ctx.putImageData(img, 0, 0);
  const rand = prng(9133);
  sansCouture(ctx, size, (c) => {
    for (let k = 0; k < 14; k += 1) {
      const x = rand() * size;
      const y = rand() * size;
      c.strokeStyle = cssAlpha(0x2a3242, 0.16 + rand() * 0.12);
      c.lineWidth = 0.6 + rand() * 0.7;
      c.beginPath();
      c.moveTo(x, y);
      let px = x;
      let py = y;
      const dir = rand() * Math.PI * 2;
      for (let s = 0; s < 5; s += 1) {
        px += Math.cos(dir + (rand() - 0.5) * 1.1) * (3 + rand() * 6);
        py += Math.sin(dir + (rand() - 0.5) * 1.1) * (3 + rand() * 6);
        c.lineTo(px, py);
      }
      c.stroke();
    }
    for (let k = 0; k < 40; k += 1) {
      const x = rand() * size;
      const y = rand() * size;
      c.fillStyle = cssAlpha(0xffe9c2, 0.14 + rand() * 0.16);
      c.beginPath();
      c.ellipse(x, y, 0.7 + rand() * 1.3, 0.5 + rand(), rand() * 3, 0, Math.PI * 2);
      c.fill();
    }
  });
  return toTexture(canvas);
}

/** Écorce : cannelures verticales, crevasses, lichen accroché. */
function texEcorce(size = 160): Texture {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const gorge = ridged(x / 5.5, y / 40, size / 5.5, 1319, 3);
      const bruit = fbm(x / 13, y / 7, size / 13, 631, 3);
      const v = gorge * 0.7 + bruit * 0.3;
      const clair = v > 0.62;
      d[i] = clair ? 255 : 42;
      d[i + 1] = clair ? 233 : 50;
      d[i + 2] = clair ? 194 : 66;
      d[i + 3] = Math.min(255, Math.abs(v - 0.55) * 300);
    }
  }
  ctx.putImageData(img, 0, 0);
  const rand = prng(2711);
  sansCouture(ctx, size, (c) => {
    for (let k = 0; k < 10; k += 1) {
      const x = rand() * size;
      c.strokeStyle = cssAlpha(0x2a3242, 0.22 + rand() * 0.16);
      c.lineWidth = 0.8 + rand() * 1.5;
      c.beginPath();
      let y = -8;
      c.moveTo(x, y);
      let px = x;
      while (y < size + 8) {
        y += 6 + rand() * 8;
        px += (rand() - 0.5) * 3.2;
        c.lineTo(px, y);
      }
      c.stroke();
    }
  });
  return toTexture(canvas);
}

/** Métal : brossage horizontal, martelage, reflets froids. */
function texMetal(size = 128): Texture {
  const { canvas, ctx } = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const brosse = valueNoise(x / 22, y / 1.4, size / 22, 811);
      const martel = fbm(x / 15, y / 15, size / 15, 4231, 3);
      const v = brosse * 0.55 + martel * 0.45;
      const clair = v > 0.5;
      d[i] = clair ? 255 : 42;
      d[i + 1] = clair ? 233 : 50;
      d[i + 2] = clair ? 194 : 66;
      d[i + 3] = Math.min(255, Math.abs(v - 0.5) * 210);
    }
  }
  ctx.putImageData(img, 0, 0);
  const rand = prng(6151);
  sansCouture(ctx, size, (c) => {
    for (let k = 0; k < 18; k += 1) {
      const y = rand() * size;
      c.strokeStyle = cssAlpha(rand() > 0.5 ? 0xffe9c2 : 0x2a3242, 0.07 + rand() * 0.08);
      c.lineWidth = 0.5 + rand() * 1.1;
      c.beginPath();
      c.moveTo(-4, y);
      c.lineTo(size + 4, y + (rand() - 0.5) * 3);
      c.stroke();
    }
  });
  return toTexture(canvas);
}

/** Tissu : armure toile, chaîne et trame visibles, léger duvet. */
function texTissu(size = 96): Texture {
  const { canvas, ctx } = makeCanvas(size);
  const rand = prng(1777);
  sansCouture(ctx, size, (c) => {
    for (let x = 0; x < size; x += 3) {
      c.strokeStyle = cssAlpha(0x2a3242, 0.1 + rand() * 0.05);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + 0.5, -2);
      c.lineTo(x + 0.5 + (rand() - 0.5), size + 2);
      c.stroke();
    }
    for (let y = 0; y < size; y += 3) {
      c.strokeStyle = cssAlpha(0xffe9c2, 0.1 + rand() * 0.06);
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(-2, y + 0.5);
      c.lineTo(size + 2, y + 0.5 + (rand() - 0.5));
      c.stroke();
    }
  });
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const v = fbm(x / 17, y / 17, size / 17, 313, 3);
      const add = Math.abs(v - 0.5) * 90;
      if (d[i + 3] < 10) {
        const clair = v > 0.5;
        d[i] = clair ? 255 : 42;
        d[i + 1] = clair ? 233 : 50;
        d[i + 2] = clair ? 194 : 66;
      }
      d[i + 3] = Math.min(255, d[i + 3] + add);
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(canvas);
}

/** Fourrure : mèches orientées, sous-poil clair, épis. */
function texFourrure(size = 128): Texture {
  const { canvas, ctx } = makeCanvas(size);
  const rand = prng(8087);
  sansCouture(ctx, size, (c) => {
    for (let k = 0; k < 340; k += 1) {
      const x = rand() * size;
      const y = rand() * size;
      const len = 3 + rand() * 7;
      const ang = -0.75 + (rand() - 0.5) * 0.5;
      const clair = rand() > 0.55;
      c.strokeStyle = cssAlpha(clair ? 0xffe9c2 : 0x2a3242, 0.08 + rand() * 0.14);
      c.lineWidth = 0.6 + rand() * 0.8;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(
        x + Math.cos(ang) * len * 0.5 + 1.4,
        y + Math.sin(ang) * len * 0.5,
        x + Math.cos(ang) * len,
        y + Math.sin(ang) * len,
      );
      c.stroke();
    }
  });
  return toTexture(canvas);
}

/** Plumes : barbes en chevron, rachis clair, duvet en pied. */
function texPlumes(size = 128): Texture {
  const { canvas, ctx } = makeCanvas(size);
  const rand = prng(3319);
  sansCouture(ctx, size, (c) => {
    for (let row = -1; row < size / 14 + 1; row += 1) {
      for (let col = -1; col < size / 12 + 1; col += 1) {
        const x = col * 12 + (row % 2 ? 6 : 0);
        const y = row * 14;
        c.strokeStyle = cssAlpha(0x2a3242, 0.16 + rand() * 0.1);
        c.lineWidth = 0.9;
        c.beginPath();
        c.moveTo(x - 6, y);
        c.quadraticCurveTo(x, y + 9, x + 6, y);
        c.stroke();
        c.strokeStyle = cssAlpha(0xffe9c2, 0.14 + rand() * 0.1);
        c.lineWidth = 0.7;
        c.beginPath();
        c.moveTo(x - 5, y + 2.2);
        c.quadraticCurveTo(x, y + 10.4, x + 5, y + 2.2);
        c.stroke();
      }
    }
  });
  return toTexture(canvas);
}

/** Écailles : rangées imbriquées, liseré clair en bord d'écaille. */
function texEcailles(size = 128): Texture {
  const { canvas, ctx } = makeCanvas(size);
  const rand = prng(5471);
  const w = 13;
  const h = 10;
  sansCouture(ctx, size, (c) => {
    for (let row = -1; row < size / h + 1; row += 1) {
      for (let col = -1; col < size / w + 1; col += 1) {
        const x = col * w + (row % 2 ? w / 2 : 0);
        const y = row * h;
        c.beginPath();
        c.moveTo(x - w / 2, y);
        c.quadraticCurveTo(x, y + h * 1.35, x + w / 2, y);
        c.strokeStyle = cssAlpha(0x2a3242, 0.2 + rand() * 0.1);
        c.lineWidth = 1.1;
        c.stroke();
        c.beginPath();
        c.moveTo(x - w / 2 + 1.4, y - 1.1);
        c.quadraticCurveTo(x, y + h * 1.05, x + w / 2 - 1.4, y - 1.1);
        c.strokeStyle = cssAlpha(0xffe9c2, 0.13 + rand() * 0.09);
        c.lineWidth = 0.8;
        c.stroke();
      }
    }
  });
  return toTexture(canvas);
}

/** Construit une fois pour toutes les neuf matières de base. */
export function creerMatieres(): MaterialSet {
  return {
    grain: texGrain(),
    parchemin: texParchemin(),
    granit: texGranit(),
    ecorce: texEcorce(),
    metal: texMetal(),
    tissu: texTissu(),
    fourrure: texFourrure(),
    plumes: texPlumes(),
    ecailles: texEcailles(),
  };
}

/* ────────────────────────────── Le pinceau ──────────────────────────────── */

export interface PeindreOptions {
  /** Teinte locale de la surface. */
  base: number;
  /** Matière posée en troisième strate. `grain` par défaut. */
  matiere?: MaterialKey;
  /** Opacité de la matière, 0,08 à 0,22 selon la surface. */
  matiereAlpha?: number;
  /** Échelle du motif de matière (1 = taille native). */
  matiereEchelle?: number;
  /** Intensité de l'ombrage cel, 0 = plat (interdit), 1 = très contrasté. */
  modele?: number;
  /** Pose le liseré doré. Vrai par défaut. */
  rim?: boolean;
  rimForce?: number;
  /** Pose le contour teinté d'épaisseur variable. Vrai par défaut. */
  contour?: boolean;
  contourEpaisseur?: number;
  /** Spéculaire ponctuel : position relative dans la boîte englobante. */
  speculaire?: { x: number; y: number; r: number } | null;
  /** Décale l'axe d'éclairage (utile pour les faces internes). */
  inverserLumiere?: boolean;
  /** Opacité globale de la forme. */
  alpha?: number;
}

/**
 * Peint une forme selon les sept lois. C'est la seule façon légitime de poser
 * de la couleur dans ce jeu.
 *
 * Strates, dans l'ordre :
 *   1. dégradé multi-arrêt orienté 315° (teinte + variation de valeur) ;
 *   2. ombre cel bleutée + demi-teinte + haute lumière ambrée, découpées par
 *      demi-plans perpendiculaires au soleil ;
 *   3. motif de matière répétable ;
 *   4. spéculaire ponctuel facultatif ;
 *   5. liseré doré côté opposé au soleil ;
 *   6. contour teinté d'épaisseur variable.
 */
export function peindre(
  g: Graphics,
  poly: Poly,
  mats: MaterialSet,
  opts: PeindreOptions,
): void {
  if (poly.length < 3) return;
  const base = opts.base;
  const modele = opts.modele ?? 1;
  const alpha = opts.alpha ?? 1;
  const b = bounds(poly);
  const size = Math.max(b.w, b.h) || 1;
  const c = centroid(poly);
  const sun = opts.inverserLumiere
    ? { x: -LIGHT.toSun.x, y: -LIGHT.toSun.y }
    : LIGHT.toSun;
  const shade = { x: -sun.x, y: -sun.y };
  const points = flat(poly);

  // 1 — teinte + variation de valeur
  g.poly(points).fill({ fill: degradeSurface(base, modele), alpha });

  // 2 — ombrage cel à trois valeurs
  if (modele > 0.05) {
    const midOrigin = { x: c.x + shade.x * size * 0.04, y: c.y + shade.y * size * 0.04 };
    const mid = clipHalfPlane(poly, midOrigin, shade);
    if (mid.length >= 3) {
      g.poly(flat(mid)).fill({ color: ombreBleutee(base, 0.42), alpha: alpha * 0.5 * modele });
    }
    const deepOrigin = { x: c.x + shade.x * size * 0.26, y: c.y + shade.y * size * 0.26 };
    const deep = clipHalfPlane(poly, deepOrigin, shade);
    if (deep.length >= 3) {
      g.poly(flat(deep)).fill({ color: ombreBleutee(base, 0.95), alpha: alpha * 0.42 * modele });
    }
    const litOrigin = { x: c.x + sun.x * size * 0.22, y: c.y + sun.y * size * 0.22 };
    const lit = clipHalfPlane(poly, litOrigin, sun);
    if (lit.length >= 3) {
      g.poly(flat(lit)).fill({ color: faceEclairee(base, 0.9), alpha: alpha * 0.34 * modele });
    }
  }

  // 3 — matière
  const key = opts.matiere ?? 'grain';
  const tex = mats[key];
  if (tex) {
    const scale = opts.matiereEchelle ?? 1;
    const pattern = new FillPattern({ texture: tex, repetition: 'repeat' });
    pattern.setTransform(new Matrix().scale(scale, scale));
    g.poly(points).fill({ fill: pattern, alpha: (opts.matiereAlpha ?? 0.16) * alpha });
  }

  // 4 — spéculaire ponctuel (métal, gemmes, cuir ciré)
  if (opts.speculaire) {
    const s = opts.speculaire;
    const sx = b.x + b.w * s.x;
    const sy = b.y + b.h * s.y;
    const r = size * s.r;
    g.poly(flat(blob(sx, sy, r, r * 0.72, { seed: 12, points: 12, wobble: 0.2 }))).fill({
      color: speculaire(base),
      alpha: alpha * 0.65,
    });
    g.poly(flat(blob(sx - r * 0.15, sy - r * 0.15, r * 0.42, r * 0.32, { seed: 33, points: 10, wobble: 0.25 }))).fill({
      color: LIGHT.chaude,
      alpha: alpha * 0.5,
    });
  }

  // 5 — liseré doré (loi n°4)
  if (opts.rim !== false) {
    lisereLumiere(g, poly, base, {
      force: opts.rimForce ?? 1,
      largeur: Math.max(1, size * 0.022),
      alpha,
      sun,
    });
  }

  // 6 — contour teinté d'épaisseur variable (loi n°6)
  if (opts.contour !== false) {
    contourVariable(g, poly, base, {
      epaisseur: opts.contourEpaisseur ?? Math.max(1, size * 0.028),
      alpha,
      sun,
    });
  }
}

/**
 * Liseré de lumière doré, posé uniquement sur les arêtes qui tournent le dos au
 * soleil : c'est ce qui décolle la silhouette du fond (loi n°4).
 */
export function lisereLumiere(
  g: Graphics,
  poly: Poly,
  base: number,
  opts: { force?: number; largeur?: number; alpha?: number; sun?: Pt } = {},
): void {
  const sun = opts.sun ?? LIGHT.toSun;
  const shade = { x: -sun.x, y: -sun.y };
  const cw = signedArea(poly) > 0;
  const largeur = opts.largeur ?? 1.5;
  const alpha = (opts.alpha ?? 1) * LIGHT.rimAlpha * (opts.force ?? 1);
  const color = rimDoree(base, opts.force ?? 1);
  let started = false;
  let any = false;
  for (let i = 0; i < poly.length; i += 1) {
    const n = outwardNormal(poly, i, cw);
    const d = n.x * shade.x + n.y * shade.y;
    const a = poly[i];
    const bpt = poly[(i + 1) % poly.length];
    if (d > 0.12) {
      if (!started) {
        g.moveTo(a.x, a.y);
        started = true;
      }
      g.lineTo(bpt.x, bpt.y);
      any = true;
    } else {
      started = false;
    }
  }
  if (any) g.stroke({ color, width: largeur, alpha, cap: 'round', join: 'round', alignment: 0.35 });
}

/**
 * Contour teinté d'épaisseur variable : plus épais dans l'ombre, il s'amincit
 * vers la lumière. Jamais de noir (loi n°6).
 */
export function contourVariable(
  g: Graphics,
  poly: Poly,
  base: number,
  opts: { epaisseur?: number; alpha?: number; sun?: Pt; couleur?: number } = {},
): void {
  const sun = opts.sun ?? LIGHT.toSun;
  const cw = signedArea(poly) > 0;
  const e = opts.epaisseur ?? 1.6;
  const alpha = opts.alpha ?? 1;
  const color = opts.couleur ?? contourTeinte(base);
  // trois passes d'épaisseur pour éviter un appel de tracé par arête
  const buckets: Poly[][] = [[], [], []];
  for (let i = 0; i < poly.length; i += 1) {
    const n = outwardNormal(poly, i, cw);
    const d = n.x * sun.x + n.y * sun.y; // 1 = pleine lumière, -1 = ombre
    const k = d > 0.34 ? 0 : d > -0.34 ? 1 : 2;
    buckets[k].push([poly[i], poly[(i + 1) % poly.length]]);
  }
  const widths = [e * 0.55, e * 0.95, e * 1.45];
  const alphas = [0.62, 0.82, 1];
  for (let k = 0; k < 3; k += 1) {
    const seg = buckets[k];
    if (seg.length === 0) continue;
    for (const s of seg) {
      g.moveTo(s[0].x, s[0].y);
      g.lineTo(s[1].x, s[1].y);
    }
    g.stroke({
      color: k === 0 ? melanger(color, base, 0.3) : color,
      width: widths[k],
      alpha: alpha * alphas[k],
      cap: 'round',
      join: 'round',
      alignment: 0.5,
    });
  }
}

/**
 * Ombre portée elliptique, orientée par le soleil de 315° : elle s'allonge vers
 * le sud-est d'une fois la hauteur × 1,28, en bleu `#2A3242` à 0,32.
 */
export function ombreProjetee(
  g: Graphics,
  cx: number,
  cy: number,
  rayon: number,
  hauteur: number,
  opts: { alpha?: number; seed?: number } = {},
): void {
  const allonge = hauteur * LIGHT.ombreFacteur;
  const dx = LIGHT.toShadow.x * allonge * 0.5;
  const dy = LIGHT.toShadow.y * allonge * 0.5;
  const rx = rayon + allonge * 0.5;
  const ry = Math.max(rayon * 0.34, rayon * 0.5 - allonge * 0.03);
  // L'ombre court sur le sol : la direction 315° s'y projette en raccourci,
  // d'où un angle d'environ 26° et non 45°. Même valeur que `Rig.dessinerOmbre`.
  const ell = pivoter(
    blob(0, 0, rx, ry, { seed: opts.seed ?? 5, points: 20, wobble: 0.11 }),
    Math.PI / 7,
    { x: 0, y: 0 },
  );
  const placed = translater(ell, cx + dx, cy + dy * 0.42);
  g.poly(flat(placed)).fill({
    fill: degradeRadial([
      { offset: 0, color: LIGHT.ombrePortee, alpha: (opts.alpha ?? 1) * LIGHT.ombrePorteeAlpha },
      { offset: 0.55, color: LIGHT.ombrePortee, alpha: (opts.alpha ?? 1) * LIGHT.ombrePorteeAlpha * 0.7 },
      { offset: 1, color: LIGHT.ombrePortee, alpha: 0 },
    ]),
  });
}

/** Grain seul, posé par-dessus une zone déjà peinte (fonds, panneaux, ciel). */
export function grain(
  g: Graphics,
  poly: Poly,
  mats: MaterialSet,
  alpha = 0.1,
  echelle = 1,
): void {
  const pattern = new FillPattern({ texture: mats.grain, repetition: 'repeat' });
  pattern.setTransform(new Matrix().scale(echelle, echelle));
  g.poly(flat(poly)).fill({ fill: pattern, alpha });
}

/** Bruit de matière libre : semis de touches colorées dans une zone. */
export function bruitDeMatiere(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  base: number,
  opts: { densite?: number; seed?: number; taille?: number; alpha?: number } = {},
): void {
  const rand = prng(opts.seed ?? 17);
  const n = Math.max(4, Math.round((opts.densite ?? 0.02) * w * h));
  const taille = opts.taille ?? 1.6;
  for (let i = 0; i < n; i += 1) {
    const px = x + rand() * w;
    const py = y + rand() * h;
    const r = taille * (0.5 + rand());
    const clair = rand() > 0.5;
    g.poly(
      flat(blob(px, py, r, r * (0.6 + rand() * 0.6), { seed: i * 13 + 1, points: 7, wobble: 0.3 })),
    ).fill({
      color: clair ? faceEclairee(base, 0.7) : ombreBleutee(base, 0.6),
      alpha: (opts.alpha ?? 0.22) * (0.4 + rand() * 0.6),
    });
  }
}

/* ─────────────────────────── Aides de composition ───────────────────────── */

/** Voile atmosphérique : rapproche une zone du bleu de brume selon la distance. */
export function voileAtmospherique(
  g: Graphics,
  poly: Poly,
  distance: number,
  alphaMax = 0.55,
): void {
  const mix = Math.max(0, Math.min(LIGHT.atmoMax, distance / LIGHT.atmoDistance));
  if (mix <= 0.001) return;
  g.poly(flat(poly)).fill({ color: LIGHT.brume, alpha: mix * alphaMax });
}

/** Filet doré double d'enluminure, autour d'un cadre. */
export function filetDore(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { epaisseur?: number; ecart?: number; alpha?: number; seed?: number } = {},
): void {
  const e = opts.epaisseur ?? 1.6;
  const ecart = opts.ecart ?? 4;
  const seed = opts.seed ?? 7;
  for (let k = 0; k < 2; k += 1) {
    const o = k * ecart;
    const p = perturber(
      densifier(
        [
          { x: x + o, y: y + o },
          { x: x + w - o, y: y + o },
          { x: x + w - o, y: y + h - o },
          { x: x + o, y: y + h - o },
        ],
        11,
      ),
      0.35,
      seed + k * 31,
    );
    g.poly(flat(p), true).stroke({
      color: k === 0 ? LIGHT.rim : melanger(LIGHT.rim, LIGHT.chaude, 0.4),
      width: k === 0 ? e : e * 0.55,
      alpha: (opts.alpha ?? 1) * (k === 0 ? 0.9 : 0.62),
      join: 'round',
    });
  }
}

/** Écoinçon feuillagé, posé dans un coin de cadre d'enluminure. */
export function ecoincon(
  g: Graphics,
  x: number,
  y: number,
  taille: number,
  rot: number,
  color = LIGHT.rim,
  alpha = 0.75,
): void {
  const feuille = (a: number, l: number, w: number): Poly =>
    pivoter(fuseau(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, w, { seed: 3 }), rot, { x, y });
  for (let i = 0; i < 3; i += 1) {
    const a = -0.35 + i * 0.62;
    g.poly(flat(feuille(a, taille * (1 - i * 0.18), taille * 0.3))).fill({ color, alpha: alpha * (0.9 - i * 0.16) });
  }
  g.poly(
    flat(
      pivoter(blob(x + Math.cos(rot) * taille * 0.22, y + Math.sin(rot) * taille * 0.22, taille * 0.13, taille * 0.13, {
        seed: 9,
        points: 9,
        wobble: 0.24,
      }), rot, { x, y }),
    ),
  ).fill({ color: eclaircir(color, 0.4), alpha });
}

/** Assemble une teinte « faction » cohérente : utilitaire de confort. */
export function teinteFaction(base: number, variation: number): number {
  return melanger(base, variation > 0 ? LIGHT.chaude : LIGHT.froide, Math.abs(variation) * 0.4);
}

export { assombrir, eclaircir, melanger, ombreBleutee, faceEclairee, contourTeinte };
