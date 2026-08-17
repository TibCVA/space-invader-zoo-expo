/**
 * Scène d'accueil — les monts du Forez au crépuscule, en canvas 2D.
 *
 * Six plans de parallaxe, dans l'ordre de la bible artistique §5 :
 *
 *   1. **ciel** — dégradé à sept arrêts, halo solaire, cirrus, cumulus
 *      volumétriques érodés par un bruit fractal ;
 *   2. **crêtes lointaines** — trois arêtes bleutées par la perspective
 *      atmosphérique, ombrées segment par segment selon la pente ;
 *   3. **sapinières moyennes** — versant boisé, sapins pré-rendus, rochers ;
 *   4. **bourg fortifié** — éperon de granit, courtine, tours, donjon,
 *      chapelle, toits d'ardoise, fenêtres allumées, fumées, bannières ;
 *   5. **premier plan** — blocs de granit, fougères, bruyères, en contre-jour ;
 *   6. **particules** — brume de vallée, étincelles dorées, oiseaux, étoiles.
 *
 * Toute la lumière vient du **nord-ouest, azimut 315°, élévation 38°**
 * (loi n°2) ; les ombres partent au sud-est, bleutées (loi n°3) ; chaque
 * silhouette porte un liseré `#C9A227` à 40 % (loi n°4).
 *
 * ## Tenue des 60 images par seconde
 *
 * Les cinq premiers plans sont **peints une seule fois** dans des canvas hors
 * écran, à la construction et à chaque redimensionnement (débattu). Une image
 * ne fait plus que des `drawImage` et quelques centaines de primitives pour les
 * éléments vivants : le fil principal reste très en dessous de 8 ms. Un
 * garde-fou mesure le temps d'image et dégrade automatiquement la qualité s'il
 * dérive.
 *
 * `prefers-reduced-motion` supprime la parallaxe, les particules et la boucle
 * d'animation : la scène est alors peinte une fois, puis plus rien ne tourne.
 */

import {
  C,
  SUN,
  aerial,
  blobPath,
  bodyGradient,
  castShadow,
  context2d,
  contourOf,
  grainTile,
  layGrain,
  mistSprite,
  mix,
  noiseMask,
  rgb as rgbOf,
  rgba,
  rimLight,
  shade,
  softSprite,
  sunEdge,
  surface,
  tint,
  tintedOutline,
} from './paint.js';
import { clamp, fbm1, fbm2, lerp, makeNoise1D, makeNoise2D, mulberry32, ridged } from './noise.js';

/* ───────────────────────────────── Contrat ──────────────────────────────── */

/** Qualité de rendu de la scène, pilotée par l'écran des options. */
export type SceneQuality = 'basse' | 'moyenne' | 'haute';

export interface LandingSceneOptions {
  /** Qualité initiale ; déduite de l'écran si absente. */
  quality?: SceneQuality;
  /** Coupe parallaxe, particules et boucle d'animation. */
  reducedMotion?: boolean;
  /** Graine de composition : la même graine donne la même vallée. */
  seed?: number;
}

export interface LandingSceneHandle {
  /** Change la qualité et repeint les plans. */
  setQuality(quality: SceneQuality): void;
  /** Active ou coupe le mouvement. */
  setReducedMotion(reduced: boolean): void;
  /** Durée de la dernière image, en millisecondes (diagnostic). */
  readonly frameMs: number;
  /** Détache les écouteurs, arrête la boucle et libère les plans. */
  destroy(): void;
}

interface QualityProfile {
  /** Nombre maximal de pixels de rendu pour la surface visible. */
  maxPixels: number;
  /** Plafond de densité de pixels. */
  maxDpr: number;
  mist: number;
  sparks: number;
  birds: number;
  grain: boolean;
  clouds: number;
  firs: number;
}

const PROFILES: Readonly<Record<SceneQuality, QualityProfile>> = {
  basse: { maxPixels: 1_100_000, maxDpr: 1, mist: 0, sparks: 0, birds: 0, grain: false, clouds: 9, firs: 130 },
  moyenne: { maxPixels: 1_900_000, maxDpr: 1.5, mist: 10, sparks: 26, birds: 3, grain: true, clouds: 14, firs: 240 },
  haute: { maxPixels: 3_100_000, maxDpr: 2, mist: 18, sparks: 54, birds: 4, grain: true, clouds: 20, firs: 380 },
};

/* ────────────────────────────── Géométrie ───────────────────────────────── */

interface Geo {
  /** largeur de rendu, en pixels de canvas */
  w: number;
  /** hauteur de rendu, en pixels de canvas */
  h: number;
  /** ligne d'horizon */
  horizon: number;
  /** soleil bas au nord-ouest */
  sunX: number;
  sunY: number;
  /** marge de débordement des plans, pour que la dérive ne montre aucun bord */
  m: number;
  /** échelle de détail (grain, feuillages), 1 pour une scène de 900 px de haut */
  s: number;
  /**
   * Échelle de **composition** : elle borne la taille des grands motifs par la
   * largeur autant que par la hauteur. Sans elle, un téléphone en portrait
   * reçoit un bourg calibré pour un écran de bureau, qui déborde du cadre.
   */
  c: number;
  seed: number;
}

interface Layer {
  canvas: HTMLCanvasElement;
  /** position du plan dans le repère du canvas visible */
  x: number;
  y: number;
  /** amplitude de dérive, en pixels, pour une dérive normalisée de 1 */
  depth: number;
  /** vitesse de défilement horizontal continu, en pixels par seconde */
  drift?: number;
  alpha?: number;
}

interface TownMeta {
  chimneys: { x: number; y: number; scale: number; seed: number }[];
  banners: { x: number; y: number; h: number; color: string }[];
  windows: { x: number; y: number; w: number; h: number; phase: number }[];
  towers: { x: number; y: number }[];
}

/* ───────────────────────────── Plan 1 : le ciel ─────────────────────────── */

/** Teinte du ciel à une hauteur normalisée. Sept arrêts : jamais un dégradé plat. */
function skyStops(): { at: number; color: string }[] {
  return [
    { at: 0, color: shade(mix(C.bleuProfond, C.grenat, 0.24), 0.16) },
    { at: 0.2, color: C.bleuProfond },
    { at: 0.42, color: mix(C.bleuProfond, C.bleuBrume, 0.4) },
    { at: 0.63, color: mix(C.bleuBrume, C.ocre, 0.34) },
    { at: 0.8, color: mix(C.ocre, C.lumiere, 0.44) },
    { at: 0.93, color: mix(C.lumiere, C.ocre, 0.2) },
    { at: 1, color: mix(C.ocre, C.parcheminOmbre, 0.28) },
  ];
}

/** Colore un masque de bruit : sert à casser toute surface unie (loi n°1). */
function tintMask(mask: HTMLCanvasElement, color: string): HTMLCanvasElement {
  const out = surface(mask.width, mask.height);
  const ctx = context2d(out);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(mask, 0, 0);
  return out;
}

function paintSky(g: Geo): HTMLCanvasElement {
  const canvas = surface(g.w, g.h);
  const ctx = context2d(canvas);
  const hz = g.horizon;

  /* Strate 1 — la teinte : sept arrêts entre le zénith et l'horizon. */
  const grad = ctx.createLinearGradient(0, 0, g.w * 0.16, g.h);
  for (const stop of skyStops()) grad.addColorStop(stop.at * (hz / g.h), stop.color);
  grad.addColorStop(clamp(hz / g.h + 0.001, 0, 1), mix(C.ocre, C.parcheminOmbre, 0.28));
  grad.addColorStop(1, mix(C.bleuBrume, C.ombre, 0.5));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, g.w, g.h);

  /* Strate 2 — variation de valeur : nappes lentes de bruit, chaudes et froides. */
  const wide = noiseMask(g.w, Math.ceil(hz * 1.1), g.seed + 11, 190 * g.s, -0.05, 1.4);
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.drawImage(tintMask(wide, mix(C.ocre, C.lumiere, 0.4)), 0, 0);
  ctx.globalAlpha = 0.09;
  ctx.drawImage(tintMask(noiseMask(g.w, Math.ceil(hz * 1.1), g.seed + 12, 130 * g.s, 0.1, 1.6), C.ombre), 0, 0);
  ctx.restore();

  /* Halo solaire : une seule source, au nord-ouest, basse sur l'horizon. */
  const halo = ctx.createRadialGradient(g.sunX, g.sunY, 2, g.sunX, g.sunY, g.w * 0.62);
  halo.addColorStop(0, rgba(C.lumiere, 0.5));
  halo.addColorStop(0.13, rgba(C.lumiere, 0.24));
  halo.addColorStop(0.38, rgba(C.ocre, 0.12));
  halo.addColorStop(1, rgba(C.ocre, 0));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, g.w, g.h);

  /* Le disque, à peine appuyé : c'est le halo qui porte la lumière. */
  const disc = ctx.createRadialGradient(g.sunX, g.sunY, 0, g.sunX, g.sunY, 26 * g.s);
  disc.addColorStop(0, rgba(C.lumiere, 0.78));
  disc.addColorStop(0.55, rgba(C.lumiere, 0.26));
  disc.addColorStop(1, rgba(C.ocre, 0));
  ctx.fillStyle = disc;
  ctx.beginPath();
  ctx.ellipse(g.sunX, g.sunY, 30 * g.s, 26 * g.s, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  /*
   * Rais obliques. Peints à part puis très fortement floutés : un coin net en
   * plein ciel se lit comme une erreur de rendu, pas comme de la lumière.
   */
  const rand = mulberry32(g.seed + 991);
  const rays = surface(Math.max(2, Math.round(g.w / 3)), Math.max(2, Math.round(g.h / 3)));
  const rctx = context2d(rays);
  const rx = g.sunX / 3;
  const ry = g.sunY / 3;
  for (let i = 0; i < 7; i++) {
    const a = -0.52 + i * 0.17 + rand() * 0.05;
    const spread = 0.018 + rand() * 0.03;
    const len = (g.w * 1.3) / 3;
    rctx.beginPath();
    rctx.moveTo(rx, ry);
    rctx.lineTo(rx + Math.cos(a - spread) * len, ry + Math.sin(a - spread) * len);
    rctx.lineTo(rx + Math.cos(a + spread) * len, ry + Math.sin(a + spread) * len);
    rctx.closePath();
    const ray = rctx.createLinearGradient(rx, ry, rx + Math.cos(a) * len, ry + Math.sin(a) * len);
    ray.addColorStop(0, rgba(C.lumiere, 0.5));
    ray.addColorStop(0.42, rgba(C.lumiere, 0.22));
    ray.addColorStop(1, rgba(C.lumiere, 0));
    rctx.fillStyle = ray;
    rctx.fill();
  }
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.055;
  ctx.filter = `blur(${Math.max(12, g.w / 42).toFixed(1)}px)`;
  ctx.drawImage(rays, 0, 0, g.w, g.h);
  ctx.filter = 'none';
  ctx.restore();
  ctx.save();

  /* Étoiles du haut du ciel : le crépuscule commence à les découvrir. */
  for (let i = 0; i < 46; i++) {
    const x = rand() * g.w;
    const y = rand() * hz * 0.42;
    const a = (1 - y / (hz * 0.42)) * 0.34 * (0.4 + rand() * 0.6);
    const r = (0.6 + rand() * 0.9) * g.s;
    ctx.fillStyle = rgba(mix(C.lumiere, C.bleuBrume, 0.35), a);
    ctx.beginPath();
    ctx.ellipse(x, y, r, r, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Strate 3 — le grain. */
  layGrain(ctx, g.w, g.h, 0.055, g.seed + 3);
  return canvas;
}

/* ─────────────────────────── Plan 1 bis : nuages ────────────────────────── */

interface CloudOptions {
  count: number;
  yMin: number;
  yMax: number;
  /** > 1 tasse les nuages vers le haut, < 1 vers l'horizon */
  bias: number;
  rMin: number;
  rMax: number;
  flatten: number;
  distance: number;
  erosion: number;
  seed: number;
}

function paintClouds(g: Geo, width: number, height: number, o: CloudOptions): HTMLCanvasElement {
  const tmp = surface(width, height);
  const ctx = context2d(tmp);
  const rand = mulberry32(o.seed);

  for (let i = 0; i < o.count; i++) {
    const cx = rand() * width;
    const cy = lerp(o.yMin, o.yMax, Math.pow(rand(), o.bias));
    const radius = lerp(o.rMin, o.rMax, rand()) * g.s;
    /* Un nuage proche du soleil reçoit un cœur bien plus chaud. */
    const near = 1 - clamp(Math.abs(cx - g.sunX) / (width * 0.55), 0, 1);
    /* Un nuage de crépuscule est ambré, pas gris : c'est la lumière rasante
       qui le colore, d'autant plus qu'il est proche du soleil. */
    const lit = mix(mix(C.ocre, C.lumiere, 0.42), C.lumiere, 0.1 + near * 0.5);
    const mid = aerial(mix(C.ocre, C.grenat, 0.22), o.distance * 0.55);
    const dark = aerial(mix(C.ombre, C.grenat, 0.2), o.distance * 0.4);
    /* Plus le nuage est bas sur l'horizon, plus il s'étire. */
    const aplati = o.flatten * (0.42 + 0.58 * (1 - cy / height));
    const blobs = 8 + Math.floor(rand() * 8);
    for (let b = 0; b < blobs; b++) {
      const t = b / blobs;
      const bx = cx + (rand() - 0.5) * radius * 3.1;
      const by = cy + (rand() - 0.5) * radius * 0.62 * aplati;
      const br = radius * (0.4 + rand() * 0.78) * (1 - t * 0.16);
      const grad = ctx.createRadialGradient(
        bx - br * 0.46,
        by - br * 0.44 * aplati,
        br * 0.04,
        bx,
        by,
        br,
      );
      grad.addColorStop(0, rgba(lit, 0.86));
      grad.addColorStop(0.28, rgba(mid, 0.58));
      grad.addColorStop(0.62, rgba(dark, 0.26));
      grad.addColorStop(1, rgba(dark, 0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(bx, by, br * 1.24, br * aplati, (rand() - 0.5) * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /*
   * Érosion en trois échelles. Sans elle, un nuage reste un tas d'ellipses,
   * et près de l'horizon les grands disques se lisent comme des planètes.
   */
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = o.erosion;
  ctx.drawImage(noiseMask(width, height, o.seed + 71, 62 * g.s, 0.02, 2.2), 0, 0);
  ctx.globalAlpha = o.erosion * 0.82;
  ctx.drawImage(noiseMask(width, height, o.seed + 72, 21 * g.s, 0.12, 2.9), 0, 0);
  ctx.globalAlpha = o.erosion * 0.5;
  ctx.drawImage(noiseMask(width, height, o.seed + 74, 7 * g.s, 0.22, 3.4), 0, 0);
  ctx.restore();

  /* Modelé général : chaud au nord-ouest, froid au sud-est. */
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const lg = ctx.createLinearGradient(0, 0, width * 0.5, height * 1.4);
  lg.addColorStop(0, rgba(C.lumiere, 0.16));
  lg.addColorStop(0.45, rgba(C.ocre, 0.05));
  lg.addColorStop(1, rgba(C.ombre, 0.2));
  ctx.fillStyle = lg;
  ctx.fillRect(0, 0, width, height);
  ctx.globalAlpha = 0.1;
  ctx.drawImage(tintMask(noiseMask(width, height, o.seed + 73, 9 * g.s, 0, 2), C.ombre), 0, 0);
  ctx.restore();

  /* Adoucissement final : les bords d'un nuage ne sont jamais nets. */
  const out = surface(width, height);
  const octx = context2d(out);
  octx.filter = `blur(${(1.1 * g.s).toFixed(2)}px)`;
  octx.drawImage(tmp, 0, 0);
  octx.filter = 'none';
  return out;
}

/* ──────────────────── Plans 2 et 3 : crêtes et sapinières ───────────────── */

interface RidgeSpec {
  /** hauteur de base, en fraction de la hauteur visible */
  base: number;
  /** amplitude du relief, en fraction de la hauteur visible */
  amp: number;
  /** fréquence horizontale */
  freq: number;
  color: string;
  distance: number;
  /** brume accumulée au pied du versant */
  haze: number;
  seed: number;
}

/** Profil d'une crête : bruit de crête + une octave douce, jamais une sinusoïde. */
function ridgeProfile(spec: RidgeSpec, g: Geo): (x: number) => number {
  const n1 = makeNoise1D(spec.seed);
  const n2 = makeNoise1D(spec.seed + 401);
  const base = g.horizon * spec.base;
  const amp = g.h * spec.amp;
  return (x: number): number => {
    const u = (x / g.w) * spec.freq;
    /* Le bruit de crête donne des arêtes ; la puissance 0,55 redresse les
       sommets et creuse les cols. Sans elle, le profil ondule comme une
       houle — un massif ancien reste un massif, pas une vague. */
    const r = Math.pow(ridged(n1, u, 5) * 0.5 + 0.5, 0.55);
    const detail = (ridged(n2, u * 3.7 + 7, 3) * 0.5 + 0.5) * 0.22;
    const soft = fbm1(n2, u * 0.47 + 11, 3) * 0.3;
    return base - (r * 0.74 + detail + soft) * amp;
  };
}

function paintRidge(
  ctx: CanvasRenderingContext2D,
  spec: RidgeSpec,
  g: Geo,
  originX: number,
  originY: number,
  width: number,
  height: number,
): (x: number) => number {
  const profile = ridgeProfile(spec, g);
  const step = Math.max(2, Math.round(2 * g.s));
  const local = (x: number): number => profile(x + originX) - originY;

  const path = new Path2D();
  path.moveTo(0, height);
  for (let x = 0; x <= width; x += step) path.lineTo(x, local(x));
  path.lineTo(width, height);
  path.closePath();

  const crest = local(width * 0.5);
  const body = aerial(spec.color, spec.distance);
  const grad = ctx.createLinearGradient(0, crest - height * 0.04, 0, height);
  grad.addColorStop(0, aerial(tint(spec.color, 0.34), spec.distance));
  grad.addColorStop(0.12, aerial(tint(spec.color, 0.1), spec.distance));
  grad.addColorStop(0.42, body);
  grad.addColorStop(1, aerial(shade(spec.color, 0.42), spec.distance + 260));
  ctx.save();
  ctx.fillStyle = grad;
  ctx.fill(path);

  /*
   * Ombrage de relief : chaque tranche de versant est éclairée selon sa pente,
   * la lumière venant du nord-ouest.
   *
   * La passe est peinte dans un tampon **quatre fois plus petit** puis
   * agrandie et floutée. Peindre les tranches à pleine résolution donnait un
   * moirage de bandes verticales — un défaut de rendu très visible, et l'un
   * des critères d'échec de la bible (§10). L'interpolation bilinéaire de
   * l'agrandissement fait exactement le travail d'un dégradé horizontal, pour
   * un quart du coût.
   */
  ctx.clip(path);

  /*
   * Modelé du versant — un **vrai ombrage de relief**, pas un dégradé.
   *
   * La silhouette ne dit rien de la face que l'on voit ; on lui adjoint donc
   * un champ d'altitude fictif (bruit fractal étiré verticalement, comme le
   * sont les ravines d'un massif), dont on calcule le gradient, que l'on
   * éclaire au soleil unique du nord-ouest. La pente de la crête est ajoutée
   * au gradient pour que le modelé reste solidaire du profil.
   *
   * Le calcul se fait à un quart de résolution, puis on agrandit : c'est
   * quatre fois moins de pixels, et l'interpolation adoucit exactement ce
   * qu'il faut adoucir.
   */
  const q = 4;
  const sw = Math.max(24, Math.round(width / q));
  const sh = Math.max(24, Math.round(height / q));
  const span = Math.max(3, Math.round(step * 4));
  const relief = surface(sw, sh);
  const rctx = context2d(relief);
  const champ = new Float32Array(sw * sh);
  const nRelief = makeNoise2D(spec.seed + 77);
  /* Ravines : la maille est deux fois plus serrée en x qu'en y. */
  const echelleX = (78 * g.s) / q;
  const echelleY = (150 * g.s) / q;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      champ[y * sw + x] = fbm2(nRelief, x / echelleX, y / echelleY, 4, 0.52, 2.13);
    }
  }
  const img = rctx.createImageData(sw, sh);
  const data = img.data;
  const chaud = rgbOf(C.lumiere);
  const froid = rgbOf(C.ombre);
  /* Lumière : azimut 315°, élévation 38°, en repère écran (y vers le sud). */
  const lx = -0.5573;
  const ly = -0.5573;
  const lz = 0.6157;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const i = y * sw + x;
      const wy = y * q;
      const wx = x * q;
      const crestY = local(wx);
      const depth = wy - crestY;
      if (depth < 0) continue;
      const xm = x > 0 ? x - 1 : x;
      const xp = x < sw - 1 ? x + 1 : x;
      const ym = y > 0 ? y - 1 : y;
      const yp = y < sh - 1 ? y + 1 : y;
      /* Pente propre du versant, lue sur la crête, plus le relief de détail. */
      const pente = (local(wx + span) - local(wx - span)) / (span * 2);
      const dzdx = (champ[y * sw + xp] - champ[y * sw + xm]) * 2.6 - pente * 0.9;
      const dzdy = (champ[yp * sw + x] - champ[ym * sw + x]) * 2.6 + 0.34;
      const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
      const lambert = clamp((-dzdx * lx - dzdy * ly + lz) / len, 0, 1);
      /* Étalement : le relief doux du Forez doit rester lisible. */
      const v = clamp((lambert - 0.5) * 2.4, -1, 1);
      /* Le modelé s'éteint vers le bas, où la brume prend le relais. */
      const fade = clamp(1 - depth / (height * 0.62), 0, 1);
      const k = i * 4;
      if (v >= 0) {
        data[k] = chaud.r;
        data[k + 1] = chaud.g;
        data[k + 2] = chaud.b;
        data[k + 3] = v * 0.42 * fade * 255;
      } else {
        data[k] = froid.r;
        data[k + 1] = froid.g;
        data[k + 2] = froid.b;
        data[k + 3] = -v * 0.4 * fade * 255;
      }
    }
  }
  rctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.filter = `blur(${Math.max(0.8, width / 700).toFixed(2)}px)`;
  ctx.drawImage(relief, 0, 0, width, height);
  ctx.filter = 'none';
  ctx.restore();

  /* Matière : bruit multi-octave, jamais d'aplat. */
  ctx.globalAlpha = 0.15;
  ctx.drawImage(tintMask(noiseMask(width, height, spec.seed + 55, 34 * g.s, 0, 1.8), C.ombre), 0, 0);
  ctx.globalAlpha = 0.1;
  ctx.drawImage(
    tintMask(noiseMask(width, height, spec.seed + 56, 12 * g.s, 0.15, 2.2), tint(spec.color, 0.5)),
    0,
    0,
  );
  ctx.globalAlpha = 1;

  /* Brume de vallée : un dégradé plat serait un aplat, on le module au bruit. */
  const mistTop = crest + height * 0.08;
  const mg = ctx.createLinearGradient(0, mistTop, 0, height);
  mg.addColorStop(0, rgba(C.bleuBrume, 0));
  mg.addColorStop(0.55, rgba(C.bleuBrume, spec.haze * 0.5));
  mg.addColorStop(1, rgba(C.bleuBrume, spec.haze));
  ctx.fillStyle = mg;
  ctx.fillRect(0, mistTop, width, height - mistTop);
  ctx.globalAlpha = spec.haze * 0.7;
  ctx.drawImage(
    tintMask(noiseMask(width, height, spec.seed + 57, 90 * g.s, 0.16, 2.1), C.bleuBrume),
    0,
    mistTop * 0.35,
  );
  ctx.globalAlpha = 1;
  ctx.restore();

  /*
   * Liseré doré sur l'arête (loi n°4). Son intensité suit la pente : un
   * contour d'épaisseur constante sur toute la crête donnerait un dessin
   * cerné, ce que la loi n°6 interdit.
   */
  ctx.save();
  ctx.lineCap = 'round';
  const rim = SUN.rimOpacity * (1 - clamp(spec.distance / 1500, 0, 0.72));
  for (let x = 0; x <= width; x += step) {
    const slope = (local(x + span) - local(x - span)) / (span * 2);
    const face = clamp(0.28 + slope * 3.4, 0.05, 1);
    ctx.beginPath();
    ctx.moveTo(x, local(x));
    ctx.lineTo(x + step, local(x + step));
    ctx.strokeStyle = rgba(C.vieilOr, rim * face);
    ctx.lineWidth = Math.max(0.8, (0.6 + face * 0.9) * g.s);
    ctx.stroke();
    ctx.strokeStyle = rgba(C.lumiere, 0.15 * face);
    ctx.lineWidth = Math.max(0.5, 0.7 * g.s);
    ctx.stroke();
  }
  ctx.restore();

  return local;
}

/** Sapin pré-rendu : silhouette dentelée, trois valeurs, liseré doré. */
function firSprite(height: number, seed: number, distance: number): HTMLCanvasElement {
  const w = Math.ceil(height * 0.62);
  const h = Math.ceil(height);
  const canvas = surface(w + 4, h + 4);
  const ctx = context2d(canvas);
  const rand = mulberry32(seed);
  const base = aerial(C.vertSapin, distance);
  const cx = (w + 4) / 2;

  /* Tronc. */
  const trunk = aerial(C.brunFougere, distance + 120);
  ctx.fillStyle = shade(trunk, 0.3);
  ctx.fillRect(cx - h * 0.022, h * 0.72, h * 0.045, h * 0.28);

  /* Ramure : quatre à six étages dentelés, jamais un triangle. */
  const tiers = 4 + Math.floor(rand() * 3);
  const path = new Path2D();
  path.moveTo(cx, 2);
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let t = 0; t < tiers; t++) {
    const p = (t + 1) / tiers;
    const y = 2 + p * h * 0.92;
    const spread = (w / 2) * Math.pow(p, 0.78) * (0.82 + rand() * 0.3);
    const notch = spread * (0.42 + rand() * 0.2);
    left.push({ x: cx - notch, y: y - h * 0.06 });
    left.push({ x: cx - spread, y });
    right.push({ x: cx + notch, y: y - h * 0.06 });
    right.push({ x: cx + spread, y });
  }
  for (const p of right) path.lineTo(p.x, p.y);
  path.lineTo(cx + w * 0.06, h + 2);
  path.lineTo(cx - w * 0.06, h + 2);
  for (let i = left.length - 1; i >= 0; i--) path.lineTo(left[i].x, left[i].y);
  path.closePath();

  const grad = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, h);
  grad.addColorStop(0, tint(base, 0.3));
  grad.addColorStop(0.4, base);
  grad.addColorStop(1, shade(base, 0.44));
  ctx.fillStyle = grad;
  ctx.fill(path);

  /* Ombre propre du côté sud-est. */
  ctx.save();
  ctx.clip(path);
  const sg = ctx.createLinearGradient(cx, 0, cx + w * 0.7, h * 0.6);
  sg.addColorStop(0, rgba(C.ombre, 0));
  sg.addColorStop(1, rgba(C.ombre, 0.4));
  ctx.fillStyle = sg;
  ctx.fillRect(0, 0, w + 4, h + 4);
  ctx.restore();

  const proche = 1 - clamp(distance / 900, 0, 0.82);
  tintedOutline(ctx, path, base, Math.max(0.5, height * 0.01 * (0.4 + proche)));
  rimLight(ctx, path, Math.max(0.8, height * 0.024), SUN.rimOpacity * proche);
  sunEdge(ctx, path, Math.max(0.7, height * 0.018), 0.26 * proche);
  return canvas;
}

/* ───────────────────── Plan 4 : le bourg fortifié ───────────────────────── */

function paintTown(
  ctx: CanvasRenderingContext2D,
  g: Geo,
  width: number,
  height: number,
): TownMeta {
  const rand = mulberry32(g.seed + 4242);
  const meta: TownMeta = { chimneys: [], banners: [], windows: [], towers: [] };
  /* Le bourg se mesure à l'échelle de composition : il doit tenir dans le
     cadre en portrait comme en paysage. */
  const scale = g.c;
  const px = (v: number): number => v * scale;

  /* Assiette : l'éperon occupe le tiers droit, le soleil vient de la gauche. */
  const cx = width * 0.58;
  const plateauY = height * 0.42;
  const rock = C.granitAnthracite;
  const rockLit = mix(C.granitClair, C.ocre, 0.14);

  /* — L'éperon — */
  const spur = new Path2D();
  const leftX = cx - px(360);
  const rightX = cx + px(300);
  spur.moveTo(leftX - px(140), height);
  const nSpur = makeNoise1D(g.seed + 17);
  for (let x = leftX - px(140); x <= cx - px(150); x += px(9)) {
    const t = (x - (leftX - px(140))) / (cx - px(150) - (leftX - px(140)));
    const y = height - (height - plateauY - px(6)) * Math.pow(t, 1.5) + fbm1(nSpur, x / px(40), 3) * px(11);
    spur.lineTo(x, y);
  }
  for (let x = cx - px(150); x <= rightX; x += px(9)) {
    const t = (x - (cx - px(150))) / (rightX - (cx - px(150)));
    const y = plateauY + t * px(16) + fbm1(nSpur, x / px(28) + 40, 3) * px(7);
    spur.lineTo(x, y);
  }
  for (let x = rightX; x <= rightX + px(230); x += px(9)) {
    const t = (x - rightX) / px(230);
    const y = plateauY + px(16) + (height - plateauY) * Math.pow(t, 1.35);
    spur.lineTo(x, y + fbm1(nSpur, x / px(34) + 90, 3) * px(9));
  }
  spur.lineTo(rightX + px(260), height);
  spur.closePath();

  ctx.save();
  ctx.fillStyle = bodyGradient(ctx, leftX, plateauY, rightX + px(120), height, rock, 0.34, 0.4);
  ctx.fill(spur);
  ctx.save();
  ctx.clip(spur);

  /* Strates de granit : le Forez est un socle feuilleté. */
  for (let i = 0; i < 16; i++) {
    const y = plateauY + px(18) + i * px(26) + rand() * px(10);
    ctx.beginPath();
    ctx.moveTo(leftX - px(160), y);
    for (let x = leftX - px(160); x <= rightX + px(260); x += px(24)) {
      ctx.lineTo(x, y + fbm1(nSpur, x / px(60) + i * 7, 3) * px(9));
    }
    ctx.strokeStyle = rgba(contourOf(rock), 0.42);
    ctx.lineWidth = Math.max(0.8, px(1.5));
    ctx.stroke();
    ctx.strokeStyle = rgba(C.lumiere, 0.09);
    ctx.lineWidth = Math.max(0.6, px(1));
    ctx.translate(0, -px(1.6));
    ctx.stroke();
    ctx.translate(0, px(1.6));
  }

  /*
   * Pans de rocher : trois grands plans de valeurs distinctes. Un éperon peint
   * d'un seul dégradé se lit comme un dôme lisse, et le critique visuel a
   * raison d'y voir une forme géométrique non retravaillée.
   */
  for (let i = 0; i < 3; i++) {
    const pan = new Path2D();
    const x0 = leftX - px(120) + i * px(230) + rand() * px(50);
    const largeur = px(230) + rand() * px(150);
    pan.moveTo(x0, height);
    pan.lineTo(x0 + largeur * 0.24, plateauY + px(20) + rand() * px(60));
    pan.lineTo(x0 + largeur * 0.7, plateauY + px(50) + rand() * px(90));
    pan.lineTo(x0 + largeur, height);
    pan.closePath();
    ctx.fillStyle = rgba(i % 2 === 0 ? tint(rock, 0.16) : shade(rock, 0.3), 0.4);
    ctx.fill(pan);
    ctx.strokeStyle = rgba(contourOf(rock), 0.3);
    ctx.lineWidth = Math.max(0.8, px(1.4));
    ctx.stroke(pan);
  }

  /* Talus d'éboulis au pied : la roche se délite, elle ne s'arrête pas net. */
  for (let i = 0; i < 46; i++) {
    const ex = leftX - px(140) + rand() * px(820);
    const ey = plateauY + px(150) + rand() * (height - plateauY - px(150));
    const er = px(3) + rand() * px(9);
    ctx.fillStyle = rgba(rand() > 0.5 ? tint(rock, 0.22) : shade(rock, 0.34), 0.5);
    ctx.beginPath();
    ctx.ellipse(ex, ey, er, er * 0.62, rand() * 3, 0, Math.PI * 2);
    ctx.fill();
  }

  /* Faces éclairées au nord-ouest, ombre franche au sud-est. */
  const lightFace = ctx.createLinearGradient(leftX - px(120), plateauY, cx + px(120), height);
  lightFace.addColorStop(0, rgba(rockLit, 0.34));
  lightFace.addColorStop(0.45, rgba(rockLit, 0.06));
  lightFace.addColorStop(1, rgba(C.ombrePortee, 0.44));
  ctx.fillStyle = lightFace;
  ctx.fillRect(0, 0, width, height);

  /* Mousse et lichen dans les creux, puis grain. */
  ctx.globalAlpha = 0.2;
  ctx.drawImage(tintMask(noiseMask(width, height, g.seed + 61, 26 * g.s, 0.24, 2.6), C.mousseSombre), 0, 0);
  ctx.globalAlpha = 0.14;
  ctx.drawImage(tintMask(noiseMask(width, height, g.seed + 62, 8 * g.s, 0, 2), C.ombre), 0, 0);
  ctx.globalAlpha = 1;
  layGrain(ctx, width, height, 0.09, g.seed + 63);
  ctx.restore();

  tintedOutline(ctx, spur, rock, Math.max(1, px(2)));
  rimLight(ctx, spur, Math.max(1.4, px(2.6)));
  ctx.restore();

  /* — Le chemin de crête, qui descend vers la vallée — */
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(cx - px(120), plateauY + px(10));
  ctx.quadraticCurveTo(cx - px(250), plateauY + px(90), cx - px(180), plateauY + px(170));
  ctx.quadraticCurveTo(cx - px(120), plateauY + px(250), cx - px(260), height);
  ctx.strokeStyle = rgba(mix(C.ocre, C.brunFougere, 0.45), 0.5);
  ctx.lineWidth = px(9);
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.strokeStyle = rgba(C.lumiere, 0.16);
  ctx.lineWidth = px(3);
  ctx.stroke();
  ctx.restore();

  /* — La courtine — */
  const wallLeft = cx - px(215);
  const wallRight = cx + px(215);
  const wallTop = plateauY - px(86);
  const wallBottom = plateauY + px(16);
  /* Le granit du Forez tourne au chamois sous une lumière rasante : une
     muraille strictement grise, au crépuscule, sonne faux. */
  const stone = mix(mix(C.granitClair, C.parcheminOmbre, 0.34), C.ocre, 0.16);

  const wall = new Path2D();
  wall.moveTo(wallLeft, wallBottom);
  wall.lineTo(wallLeft + px(6), wallTop);
  /* Créneaux de largeurs inégales : jamais un peigne régulier. */
  let x = wallLeft + px(6);
  while (x < wallRight - px(10)) {
    const merlonW = px(16) + rand() * px(9);
    const gapW = px(11) + rand() * px(6);
    const top = wallTop - px(15) - rand() * px(4);
    wall.lineTo(x, top);
    wall.lineTo(x + merlonW, top);
    wall.lineTo(x + merlonW, wallTop);
    wall.lineTo(Math.min(x + merlonW + gapW, wallRight - px(10)), wallTop);
    x += merlonW + gapW;
  }
  wall.lineTo(wallRight, wallTop);
  wall.lineTo(wallRight, wallBottom);
  wall.closePath();

  ctx.save();
  ctx.fillStyle = bodyGradient(ctx, wallLeft, wallTop, wallRight, wallBottom, stone, 0.3, 0.46);
  ctx.fill(wall);
  ctx.save();
  ctx.clip(wall);
  /* Appareil de pierre : assises décalées, jointoiement teinté. */
  for (let row = 0; row * px(13) < wallBottom - wallTop + px(20); row++) {
    const y = wallTop - px(18) + row * px(13);
    ctx.beginPath();
    ctx.moveTo(wallLeft, y);
    ctx.lineTo(wallRight, y);
    ctx.strokeStyle = rgba(contourOf(stone), 0.3);
    ctx.lineWidth = Math.max(0.6, px(1));
    ctx.stroke();
    const offset = row % 2 === 0 ? 0 : px(11);
    for (let bx = wallLeft + offset; bx < wallRight; bx += px(22)) {
      ctx.beginPath();
      ctx.moveTo(bx, y);
      ctx.lineTo(bx, y + px(13));
      ctx.stroke();
    }
  }
  /* Mâchicoulis : bande d'ombre sous le parapet. */
  const mach = ctx.createLinearGradient(0, wallTop, 0, wallTop + px(16));
  mach.addColorStop(0, rgba(C.ombrePortee, 0.5));
  mach.addColorStop(1, rgba(C.ombrePortee, 0));
  ctx.fillStyle = mach;
  ctx.fillRect(wallLeft, wallTop, wallRight - wallLeft, px(16));
  ctx.globalAlpha = 0.13;
  ctx.drawImage(tintMask(noiseMask(width, height, g.seed + 64, 10 * g.s, 0, 2), C.ombre), 0, 0);
  ctx.globalAlpha = 1;
  ctx.restore();
  tintedOutline(ctx, wall, stone, Math.max(0.8, px(1.4)));
  rimLight(ctx, wall, Math.max(1.2, px(2)));
  sunEdge(ctx, wall, Math.max(1, px(1.6)), 0.3);
  ctx.restore();

  /* Archères. */
  for (let i = 0; i < 7; i++) {
    const ax = wallLeft + px(28) + i * px(52);
    ctx.fillStyle = rgba(C.ombrePortee, 0.68);
    ctx.fillRect(ax, wallTop + px(24), px(3.4), px(16));
    ctx.fillStyle = rgba(C.lumiere, 0.12);
    ctx.fillRect(ax - px(1.4), wallTop + px(24), px(1.2), px(16));
  }

  /* — La porte : une courtine sans entrée n'est qu'un mur — */
  const gateX = cx - px(46);
  const gateW = px(40);
  const gateH = px(58);
  const gate = new Path2D();
  gate.moveTo(gateX - gateW / 2, wallBottom);
  gate.lineTo(gateX - gateW / 2, wallBottom - gateH + gateW / 2);
  gate.arc(gateX, wallBottom - gateH + gateW / 2, gateW / 2, Math.PI, 0);
  gate.lineTo(gateX + gateW / 2, wallBottom);
  gate.closePath();
  ctx.save();
  const arch = ctx.createLinearGradient(gateX, wallBottom - gateH, gateX, wallBottom);
  arch.addColorStop(0, shade(C.brunFougere, 0.62));
  arch.addColorStop(0.5, shade(C.brunFougere, 0.44));
  arch.addColorStop(1, shade(C.brunFougere, 0.7));
  ctx.fillStyle = arch;
  ctx.fill(gate);
  /* Herse : barreaux verticaux, éclairés du côté du soleil. */
  ctx.save();
  ctx.clip(gate);
  for (let i = 0; i < 6; i++) {
    const bx = gateX - gateW / 2 + px(4) + i * px(6.6);
    ctx.fillStyle = rgba(mix(C.granitClair, C.brunFougere, 0.4), 0.66);
    ctx.fillRect(bx, wallBottom - gateH, px(2.4), gateH);
    ctx.fillStyle = rgba(C.lumiere, 0.12);
    ctx.fillRect(bx, wallBottom - gateH, px(0.9), gateH);
  }
  ctx.restore();
  tintedOutline(ctx, gate, C.brunFougere, Math.max(0.8, px(1.5)));
  ctx.restore();
  /* Deux torches encadrent la porte : elles vacilleront à l'animation. */
  for (const side of [-1, 1]) {
    const tx = gateX + side * (gateW / 2 + px(11));
    const ty = wallBottom - px(34);
    ctx.fillStyle = rgba(shade(C.brunFougere, 0.4), 0.9);
    ctx.fillRect(tx - px(1.4), ty, px(2.8), px(13));
    ctx.fillStyle = rgba(mix(C.ocre, C.lumiere, 0.55), 0.8);
    ctx.beginPath();
    ctx.ellipse(tx, ty - px(2), px(3.4), px(5), 0, 0, Math.PI * 2);
    ctx.fill();
    meta.windows.push({ x: tx - px(3.4), y: ty - px(7), w: px(6.8), h: px(10), phase: side + 2 });
  }

  /* Occlusion ambiante : la courtine s'ancre dans la roche. */
  const ao = ctx.createLinearGradient(0, wallBottom - px(22), 0, wallBottom + px(14));
  ao.addColorStop(0, rgba(C.ombrePortee, 0));
  ao.addColorStop(1, rgba(C.ombrePortee, 0.5));
  ctx.fillStyle = ao;
  ctx.fillRect(wallLeft - px(30), wallBottom - px(22), wallRight - wallLeft + px(60), px(36));

  /** Toit conique ou en bâtière, ardoise bleutée, lumière au nord-ouest. */
  const roof = (path: Path2D, base: string): void => {
    ctx.save();
    ctx.fillStyle = bodyGradient(ctx, 0, 0, width * 0.3, height * 0.3, base, 0.36, 0.5);
    ctx.fill(path);
    tintedOutline(ctx, path, base, Math.max(0.8, px(1.3)));
    rimLight(ctx, path, Math.max(1.2, px(2.1)));
    sunEdge(ctx, path, Math.max(1, px(1.6)), 0.36);
    ctx.restore();
  };
  const slate = mix(C.granitClair, C.bleuProfond, 0.4);

  /** Une tour ronde, sa toiture et son mât. */
  const tower = (tx: number, ty: number, w: number, h: number, banner: string | null): void => {
    const body = new Path2D();
    body.moveTo(tx - w / 2, ty);
    body.lineTo(tx - w / 2 - w * 0.05, ty - h);
    body.lineTo(tx + w / 2 + w * 0.05, ty - h);
    body.lineTo(tx + w / 2, ty);
    body.closePath();
    ctx.save();
    ctx.fillStyle = bodyGradient(ctx, tx - w / 2, ty - h, tx + w / 2, ty, stone, 0.36, 0.5);
    ctx.fill(body);
    ctx.save();
    ctx.clip(body);
    for (let row = 0; row * px(12) < h + px(12); row++) {
      const y = ty - h + row * px(12);
      ctx.beginPath();
      ctx.moveTo(tx - w, y);
      ctx.lineTo(tx + w, y);
      ctx.strokeStyle = rgba(contourOf(stone), 0.26);
      ctx.lineWidth = Math.max(0.6, px(0.9));
      ctx.stroke();
    }
    /* Cylindre : le modelé va du clair au sombre en travers. */
    const cyl = ctx.createLinearGradient(tx - w / 2, 0, tx + w / 2, 0);
    cyl.addColorStop(0, rgba(C.lumiere, 0.2));
    cyl.addColorStop(0.32, rgba(C.lumiere, 0.04));
    cyl.addColorStop(0.72, rgba(C.ombre, 0.22));
    cyl.addColorStop(1, rgba(C.ombre, 0.44));
    ctx.fillStyle = cyl;
    ctx.fillRect(tx - w, ty - h - px(4), w * 2, h + px(8));
    ctx.restore();
    tintedOutline(ctx, body, stone, Math.max(0.8, px(1.3)));
    rimLight(ctx, body, Math.max(1.2, px(2)));
    ctx.restore();

    const cone = new Path2D();
    cone.moveTo(tx, ty - h - w * 1.05);
    cone.lineTo(tx + w * 0.72, ty - h + px(3));
    cone.lineTo(tx + w * 0.5, ty - h + px(6));
    cone.lineTo(tx - w * 0.5, ty - h + px(6));
    cone.lineTo(tx - w * 0.72, ty - h + px(3));
    cone.closePath();
    roof(cone, slate);

    meta.towers.push({ x: tx, y: ty - h });
    if (banner) {
      ctx.strokeStyle = rgba(contourOf(C.brunFougere), 0.8);
      ctx.lineWidth = Math.max(0.8, px(1.6));
      ctx.beginPath();
      ctx.moveTo(tx, ty - h - w * 1.05);
      ctx.lineTo(tx, ty - h - w * 1.05 - px(26));
      ctx.stroke();
      meta.banners.push({ x: tx, y: ty - h - w * 1.05 - px(25), h: px(17), color: banner });
    }
  };

  /* — Le donjon, cœur de la silhouette — */
  const keepW = px(96);
  const keepH = px(178);
  const keepX = cx + px(18);
  const keepY = wallTop + px(18);
  const keep = new Path2D();
  keep.moveTo(keepX - keepW / 2, keepY);
  keep.lineTo(keepX - keepW / 2 - px(3), keepY - keepH);
  keep.lineTo(keepX + keepW / 2 + px(3), keepY - keepH);
  keep.lineTo(keepX + keepW / 2, keepY);
  keep.closePath();
  ctx.save();
  ctx.fillStyle = bodyGradient(ctx, keepX - keepW, keepY - keepH, keepX + keepW, keepY, stone, 0.34, 0.5);
  ctx.fill(keep);
  ctx.save();
  ctx.clip(keep);
  for (let row = 0; row * px(14) < keepH + px(14); row++) {
    const y = keepY - keepH + row * px(14);
    ctx.beginPath();
    ctx.moveTo(keepX - keepW, y);
    ctx.lineTo(keepX + keepW, y);
    ctx.strokeStyle = rgba(contourOf(stone), 0.28);
    ctx.lineWidth = Math.max(0.6, px(1));
    ctx.stroke();
  }
  const keepShade = ctx.createLinearGradient(keepX - keepW / 2, 0, keepX + keepW / 2, 0);
  keepShade.addColorStop(0, rgba(C.lumiere, 0.22));
  keepShade.addColorStop(0.5, rgba(C.lumiere, 0));
  keepShade.addColorStop(1, rgba(C.ombre, 0.4));
  ctx.fillStyle = keepShade;
  ctx.fillRect(keepX - keepW, keepY - keepH - px(6), keepW * 2, keepH + px(12));
  ctx.restore();
  tintedOutline(ctx, keep, stone, Math.max(0.9, px(1.6)));
  rimLight(ctx, keep, Math.max(1.4, px(2.4)));
  sunEdge(ctx, keep, Math.max(1, px(1.8)), 0.32);
  ctx.restore();

  const keepRoof = new Path2D();
  keepRoof.moveTo(keepX - keepW / 2 - px(12), keepY - keepH);
  keepRoof.lineTo(keepX, keepY - keepH - px(56));
  keepRoof.lineTo(keepX + keepW / 2 + px(12), keepY - keepH);
  keepRoof.closePath();
  roof(keepRoof, slate);
  meta.chimneys.push({ x: keepX + px(26), y: keepY - keepH - px(10), scale: 1.15, seed: 3 });

  /* — Les tours — */
  tower(wallLeft + px(14), wallBottom + px(6), px(58), px(126), C.grenat);
  tower(wallRight - px(14), wallBottom + px(6), px(52), px(104), C.vieilOr);
  tower(cx - px(112), wallBottom, px(40), px(78), null);

  /* — La chapelle — */
  const chapX = cx - px(178);
  const chapY = plateauY - px(6);
  const chapel = new Path2D();
  chapel.moveTo(chapX - px(34), chapY);
  chapel.lineTo(chapX - px(34), chapY - px(52));
  chapel.lineTo(chapX + px(34), chapY - px(52));
  chapel.lineTo(chapX + px(34), chapY);
  chapel.closePath();
  ctx.save();
  ctx.fillStyle = bodyGradient(ctx, chapX - px(34), chapY - px(52), chapX + px(34), chapY, mix(stone, C.parchemin, 0.2), 0.32, 0.44);
  ctx.fill(chapel);
  tintedOutline(ctx, chapel, stone, Math.max(0.7, px(1.1)));
  rimLight(ctx, chapel, Math.max(1, px(1.8)));
  ctx.restore();
  const spire = new Path2D();
  spire.moveTo(chapX - px(40), chapY - px(52));
  spire.lineTo(chapX, chapY - px(118));
  spire.lineTo(chapX + px(40), chapY - px(52));
  spire.closePath();
  roof(spire, mix(slate, C.mousseSombre, 0.22));
  /* Croix de faîte, dessinée, jamais un caractère. */
  ctx.strokeStyle = rgba(C.vieilOr, 0.62);
  ctx.lineWidth = Math.max(0.8, px(1.8));
  ctx.beginPath();
  ctx.moveTo(chapX, chapY - px(118));
  ctx.lineTo(chapX, chapY - px(134));
  ctx.moveTo(chapX - px(6), chapY - px(127));
  ctx.lineTo(chapX + px(6), chapY - px(127));
  ctx.stroke();

  /* — Les maisons du bourg, entre courtine et donjon — */
  const houseTints = [C.parcheminOmbre, mix(C.ocre, C.parchemin, 0.4), mix(C.brunFougere, C.parchemin, 0.5)];
  for (let i = 0; i < 9; i++) {
    const hx = wallLeft + px(46) + i * px(44) + rand() * px(12);
    const hw = px(34) + rand() * px(16);
    const hh = px(30) + rand() * px(26);
    const hy = wallTop + px(6) - rand() * px(10);
    const wallColor = shade(houseTints[Math.floor(rand() * houseTints.length)], rand() * 0.28);
    const house = new Path2D();
    house.rect(hx - hw / 2, hy - hh, hw, hh);
    ctx.save();
    ctx.fillStyle = bodyGradient(ctx, hx - hw / 2, hy - hh, hx + hw / 2, hy, wallColor, 0.2 + rand() * 0.24, 0.44 + rand() * 0.2);
    ctx.fill(house);
    /* Ombre de l'avant-toit : c'est elle qui fait tenir le toit sur le mur. */
    ctx.save();
    ctx.clip(house);
    const avant = ctx.createLinearGradient(0, hy - hh, 0, hy - hh + px(14));
    avant.addColorStop(0, rgba(C.ombrePortee, 0.52));
    avant.addColorStop(1, rgba(C.ombrePortee, 0));
    ctx.fillStyle = avant;
    ctx.fillRect(hx - hw, hy - hh, hw * 2, px(14));
    ctx.restore();
    tintedOutline(ctx, house, wallColor, Math.max(0.6, px(1)));
    rimLight(ctx, house, Math.max(0.9, px(1.5)));
    ctx.restore();
    const hroof = new Path2D();
    hroof.moveTo(hx - hw / 2 - px(5), hy - hh);
    hroof.lineTo(hx, hy - hh - px(19) - rand() * px(8));
    hroof.lineTo(hx + hw / 2 + px(5), hy - hh);
    hroof.closePath();
    roof(hroof, mix(slate, C.brunFougere, rand() * 0.3));
    if (rand() > 0.45) {
      meta.chimneys.push({ x: hx + hw * 0.28, y: hy - hh - px(12), scale: 0.55 + rand() * 0.4, seed: i });
    }
    /* Fenêtres allumées : la vie du bourg au crépuscule. */
    const cols = 1 + Math.floor(rand() * 2);
    for (let c = 0; c < cols; c++) {
      const wx = hx - hw / 4 + c * px(15);
      const wy = hy - hh * 0.55;
      const ww = px(6);
      const wh = px(8);
      ctx.fillStyle = rgba(mix(C.ocre, C.lumiere, 0.5), 0.7);
      ctx.fillRect(wx, wy, ww, wh);
      ctx.fillStyle = rgba(contourOf(wallColor), 0.5);
      ctx.strokeRect(wx, wy, ww, wh);
      meta.windows.push({ x: wx, y: wy, w: ww, h: wh, phase: rand() * Math.PI * 2 });
    }
  }
  /* Deux baies allumées au donjon. */
  for (let i = 0; i < 3; i++) {
    const wy = keepY - keepH * 0.78 + i * px(46);
    ctx.fillStyle = rgba(mix(C.ocre, C.lumiere, 0.42), 0.62);
    ctx.fillRect(keepX - px(7), wy, px(11), px(16));
    meta.windows.push({ x: keepX - px(7), y: wy, w: px(11), h: px(16), phase: i * 1.7 });
  }

  /* — Quelques arbres accrochés au flanc de l'éperon — */
  for (let i = 0; i < 11; i++) {
    const t = rand();
    const tx = cx - px(330) + t * px(600);
    const ty = plateauY + px(30) + rand() * px(150) + Math.abs(tx - cx) * 0.24;
    const th = px(26) * (0.6 + rand() * 0.9);
    const sprite = firSprite(th, g.seed + 700 + i, 220);
    ctx.drawImage(sprite, tx - sprite.width / 2, ty - sprite.height, sprite.width, sprite.height);
  }

  /* — Brume qui monte du pied de l'éperon : ancre le bourg dans la vallée — */
  const foot = ctx.createLinearGradient(0, plateauY + px(60), 0, height);
  foot.addColorStop(0, rgba(C.bleuBrume, 0));
  foot.addColorStop(0.55, rgba(C.bleuBrume, 0.2));
  foot.addColorStop(1, rgba(C.bleuBrume, 0.34));
  ctx.fillStyle = foot;
  ctx.fillRect(0, plateauY + px(60), width, height - plateauY - px(60));

  /* Perspective atmosphérique du plan : le bourg est proche, la dose est faible. */
  ctx.save();
  ctx.globalAlpha = 0.07;
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = C.bleuBrume;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  return meta;
}

/* ─────────────────────── Plan 5 : le premier plan ───────────────────────── */

/** Fronde de fougère : rachis courbe, folioles dégressives, liseré doré. */
function drawFrond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  len: number,
  angle: number,
  seed: number,
  base: string,
): void {
  const rand = mulberry32(seed);
  const curl = (rand() - 0.5) * 0.9;
  const tipX = x + Math.cos(angle) * len;
  const tipY = y + Math.sin(angle) * len;
  const ctrlX = x + Math.cos(angle + curl) * len * 0.6;
  const ctrlY = y + Math.sin(angle + curl) * len * 0.6;

  const path = new Path2D();
  const leaves = 13 + Math.floor(rand() * 7);
  const pts: { x: number; y: number; t: number }[] = [];
  for (let i = 0; i <= leaves; i++) {
    const t = i / leaves;
    const mt = 1 - t;
    const sx = mt * mt * x + 2 * mt * t * ctrlX + t * t * tipX;
    const sy = mt * mt * y + 2 * mt * t * ctrlY + t * t * tipY;
    pts.push({ x: sx, y: sy, t });
  }
  path.moveTo(pts[0].x, pts[0].y);
  const side = (dir: 1 | -1): void => {
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const prev = pts[i - 1];
      const dx = p.x - prev.x;
      const dy = p.y - prev.y;
      const l = Math.hypot(dx, dy) || 1;
      const nx = (-dy / l) * dir;
      const ny = (dx / l) * dir;
      const size = len * 0.17 * Math.sin(Math.PI * Math.pow(p.t, 0.72)) * (0.72 + rand() * 0.5);
      path.quadraticCurveTo(p.x + nx * size * 1.2 - dx * 0.4, p.y + ny * size * 1.2 - dy * 0.4, p.x, p.y);
    }
  };
  side(1);
  for (let i = pts.length - 1; i >= 0; i--) path.lineTo(pts[i].x, pts[i].y);
  path.moveTo(pts[0].x, pts[0].y);
  side(-1);
  path.closePath();

  const grad = ctx.createLinearGradient(x, y, tipX, tipY);
  grad.addColorStop(0, shade(base, 0.36));
  grad.addColorStop(0.55, base);
  grad.addColorStop(1, tint(base, 0.2));
  ctx.fillStyle = grad;
  ctx.fill(path);
  tintedOutline(ctx, path, base, 0.9);
  rimLight(ctx, path, 1.5);
  sunEdge(ctx, path, 1.1, 0.22);
}

function paintForeground(
  ctx: CanvasRenderingContext2D,
  g: Geo,
  width: number,
  height: number,
  near: boolean,
): void {
  const rand = mulberry32(g.seed + (near ? 808 : 707));
  const scale = g.h / 900;
  const px = (v: number): number => v * scale;
  /*
   * Le premier plan est le point le plus sombre du tableau : c'est lui qui
   * donne son amplitude à toute la gamme de valeurs. Il tire vers l'encre,
   * jamais vers le noir, et garde une pointe de bleu d'ombre.
   */
  const base = near
    ? mix(mix(C.vertSapin, C.encre, 0.44), C.ombre, 0.14)
    : mix(mix(C.vertSapin, C.mousseSombre, 0.4), C.encre, 0.24);
  const rockBase = near
    ? mix(mix(C.granitAnthracite, C.encre, 0.34), C.ombre, 0.16)
    : mix(C.granitAnthracite, C.ombre, 0.24);

  /* Ligne de sol : jamais une horizontale nette. */
  const nGround = makeNoise1D(g.seed + (near ? 21 : 22));
  const groundY = (x: number): number =>
    height - (near ? px(70) : px(150)) + fbm1(nGround, x / px(150), 4) * (near ? px(46) : px(28));
  const ground = new Path2D();
  ground.moveTo(0, height);
  for (let x = 0; x <= width; x += px(8)) ground.lineTo(x, groundY(x));
  ground.lineTo(width, height);
  ground.closePath();
  ctx.save();
  const gg = ctx.createLinearGradient(0, height - px(220), 0, height);
  gg.addColorStop(0, mix(base, C.ombre, 0.24));
  gg.addColorStop(0.5, base);
  gg.addColorStop(1, shade(base, 0.4));
  ctx.fillStyle = gg;
  ctx.fill(ground);
  ctx.save();
  ctx.clip(ground);
  ctx.globalAlpha = 0.22;
  ctx.drawImage(tintMask(noiseMask(width, height, g.seed + 91, 22 * g.s, 0.1, 2.4), C.mousseSombre), 0, 0);
  ctx.globalAlpha = 0.16;
  ctx.drawImage(tintMask(noiseMask(width, height, g.seed + 92, 7 * g.s, 0, 2), C.ombre), 0, 0);
  ctx.globalAlpha = 1;
  layGrain(ctx, width, height, 0.12, g.seed + 93);
  ctx.restore();
  rimLight(ctx, ground, near ? 2.2 : 1.6);
  ctx.restore();

  /*
   * Blocs de granit : le socle affleure partout dans les Bois Noirs. Ils sont
   * groupés aux deux bords de l'image et **enfoncés** dans le sol — un caillou
   * posé au milieu d'une pente flotte, et c'est immédiatement visible.
   */
  const lichen = tintMask(noiseMask(width, height, g.seed + (near ? 100 : 140), 13 * g.s, 0.24, 3), C.mousseSombre);
  const rocks = near ? 5 : 7;
  for (let i = 0; i < rocks; i++) {
    const bord = i % 2 === 0;
    const rx = near
      ? bord
        ? px(20) + rand() * px(240)
        : width - px(20) - rand() * px(300)
      : rand() * width;
    const rw = px(near ? 96 : 44) * (0.6 + rand() * 0.95);
    const rh = rw * (0.46 + rand() * 0.3);
    /* Le centre du bloc descend sous la ligne de sol : il est posé dedans. */
    const ry = groundY(rx) + rh * 0.52 + px(near ? 26 : 14);
    const path = blobPath(rx, ry, rw, rh, g.seed + i * 37 + (near ? 5 : 55), 0.32, 15);
    ctx.save();
    /* Ombre portée au sud-est, bleutée. */
    castShadow(ctx, path, rh * 0.5);
    ctx.fillStyle = bodyGradient(ctx, rx - rw, ry - rh, rx + rw * 0.6, ry + rh, rockBase, 0.34, 0.36);
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    /* Diaclases : le granit se fend en dalles, jamais en cercles concentriques. */
    for (let k = 0; k < 5; k++) {
      const ky = ry - rh * 0.7 + k * rh * 0.38;
      ctx.beginPath();
      ctx.moveTo(rx - rw * 1.1, ky);
      ctx.bezierCurveTo(
        rx - rw * 0.3,
        ky + (rand() - 0.5) * rh * 0.5,
        rx + rw * 0.3,
        ky + (rand() - 0.5) * rh * 0.5,
        rx + rw * 1.1,
        ky + rh * 0.16,
      );
      ctx.strokeStyle = rgba(contourOf(rockBase), 0.46);
      ctx.lineWidth = Math.max(0.7, px(1.5));
      ctx.stroke();
      ctx.strokeStyle = rgba(C.lumiere, 0.09);
      ctx.lineWidth = Math.max(0.5, px(1));
      ctx.translate(0, -px(1.5));
      ctx.stroke();
      ctx.translate(0, px(1.5));
    }
    ctx.globalAlpha = 0.3;
    ctx.drawImage(lichen, 0, 0);
    ctx.globalAlpha = 1;
    ctx.restore();
    tintedOutline(ctx, path, rockBase, 1.25);
    rimLight(ctx, path, near ? 2.6 : 1.7);
    sunEdge(ctx, path, near ? 2 : 1.2, 0.22);
    ctx.restore();
  }

  /*
   * Fougères, par touffes. Semées une à une, elles font une haie régulière ;
   * groupées, elles font un sous-bois. Chaque touffe partage une base et un
   * éventail d'angles.
   */
  const touffes = near ? 9 : 11;
  for (let t = 0; t < touffes; t++) {
    const bx = rand() * width;
    const by = groundY(bx) + px(near ? 34 : 16);
    const taille = px(near ? 126 : 62) * (0.5 + rand() * rand() * 1.15);
    const teinte = mix(base, C.vertHetre, rand() * 0.4);
    const frondes = 3 + Math.floor(rand() * 5);
    for (let i = 0; i < frondes; i++) {
      const spread = (i / Math.max(1, frondes - 1) - 0.5) * 1.72;
      drawFrond(
        ctx,
        bx + spread * taille * 0.13,
        by + rand() * px(6),
        taille * (0.62 + rand() * 0.5),
        -Math.PI / 2 + spread + (rand() - 0.5) * 0.22,
        g.seed + t * 97 + i * 13 + (near ? 1 : 2),
        teinte,
      );
    }
  }

  /* Graminées et bruyères : arcs fins, liseré doré au sud-est. */
  for (let i = 0; i < (near ? 110 : 70); i++) {
    const sx = rand() * width;
    const sy = groundY(sx) + px(near ? 34 : 16);
    const l = px(near ? 64 : 34) * (0.45 + rand());
    const bend = (rand() - 0.5) * l * 0.72;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.quadraticCurveTo(sx + bend * 0.4, sy - l * 0.6, sx + bend, sy - l);
    ctx.strokeStyle = rgba(mix(base, C.vertHetre, 0.34), 0.74);
    ctx.lineWidth = Math.max(0.8, px(1.9));
    ctx.lineCap = 'round';
    ctx.stroke();
    ctx.strokeStyle = rgba(C.vieilOr, SUN.rimOpacity * 0.55);
    ctx.lineWidth = Math.max(0.5, px(0.8));
    ctx.translate(px(1), -px(0.6));
    ctx.stroke();
    ctx.translate(-px(1), px(0.6));
    /* Une callune sur six : la bruyère du Forez fleurit en pourpre pâle. */
    if (rand() > 0.84) {
      ctx.fillStyle = rgba(mix(C.grenat, C.parcheminOmbre, 0.44), 0.5);
      ctx.beginPath();
      ctx.ellipse(sx + bend, sy - l, px(1.7), px(3.2), bend * 0.02, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/* ───────────────────────── Voile final : vignettage ─────────────────────── */

function paintVeil(g: Geo): HTMLCanvasElement {
  const canvas = surface(g.w, g.h);
  const ctx = context2d(canvas);
  const r = Math.hypot(g.w, g.h) * 0.62;
  const vg = ctx.createRadialGradient(g.w * 0.42, g.h * 0.44, r * 0.34, g.w * 0.5, g.h * 0.5, r);
  vg.addColorStop(0, rgba(C.ombrePortee, 0));
  vg.addColorStop(0.62, rgba(C.ombrePortee, 0.09));
  vg.addColorStop(1, rgba(C.ombrePortee, 0.34));
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, g.w, g.h);

  /* Étalonnage : ombres bleutées en bas, hautes lumières ambrées en haut. */
  const cg = ctx.createLinearGradient(0, 0, g.w * 0.2, g.h);
  cg.addColorStop(0, rgba(C.lumiere, 0.045));
  cg.addColorStop(0.55, rgba(C.ocre, 0.012));
  cg.addColorStop(1, rgba(C.bleuProfond, 0.1));
  ctx.fillStyle = cg;
  ctx.fillRect(0, 0, g.w, g.h);
  return canvas;
}

/* ───────────────────────────── Montage de la scène ──────────────────────── */

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  phase: number;
  sprite: HTMLCanvasElement;
}

function pickQuality(): SceneQuality {
  const area = window.innerWidth * window.innerHeight;
  const dpr = window.devicePixelRatio || 1;
  const cores = typeof navigator.hardwareConcurrency === 'number' ? navigator.hardwareConcurrency : 4;
  if (area <= 260_000 || cores <= 4) return 'moyenne';
  if (area * dpr * dpr > 6_000_000 && cores <= 8) return 'moyenne';
  return 'haute';
}

/**
 * Monte la scène animée sur un canvas et retourne sa poignée de contrôle.
 * L'appelant est responsable d'appeler `destroy()` au démontage.
 */
export function mountLandingScene(
  canvas: HTMLCanvasElement,
  options: LandingSceneOptions = {},
): LandingSceneHandle {
  const ctx = context2d(canvas);
  let quality: SceneQuality = options.quality ?? pickQuality();
  let reduced = options.reducedMotion ?? false;
  const seed = options.seed ?? 20250816;

  let geo: Geo = { w: 1, h: 1, horizon: 1, sunX: 0, sunY: 0, m: 0, s: 1, c: 1, seed };
  let layers: Layer[] = [];
  let veil: HTMLCanvasElement | null = null;
  let townMeta: TownMeta | null = null;
  let townLayer: Layer | null = null;
  let mist: Particle[] = [];
  let sparks: Particle[] = [];
  let birds: { x: number; y: number; v: number; a: number; phase: number }[] = [];
  let ready = false;
  let disposed = false;

  /* Dérive de caméra : souris, tactile, inclinaison. */
  const drift = { tx: 0, ty: 0, x: 0, y: 0 };
  let raf = 0;
  let rebuildTimer = 0;
  let frameMs = 0;
  let slowFrames = 0;
  let visible = true;

  function profile(): QualityProfile {
    return PROFILES[quality];
  }

  function build(): void {
    const p = profile();
    const cssW = Math.max(320, canvas.clientWidth || window.innerWidth);
    const cssH = Math.max(320, canvas.clientHeight || window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, p.maxDpr);
    const raw = cssW * cssH * dpr * dpr;
    const factor = raw > p.maxPixels ? Math.sqrt(p.maxPixels / raw) : 1;
    const w = Math.max(1, Math.round(cssW * dpr * factor));
    const h = Math.max(1, Math.round(cssH * dpr * factor));
    canvas.width = w;
    canvas.height = h;

    /* Composition : horizon au tiers bas en paysage, plus haut en portrait. */
    const portrait = cssH > cssW;
    const horizon = h * (portrait ? 0.5 : 0.6);
    geo = {
      w,
      h,
      horizon,
      sunX: w * (portrait ? 0.26 : 0.21),
      sunY: horizon - h * 0.075,
      m: Math.round(Math.max(26, w * 0.03)),
      s: Math.max(0.55, Math.min(2, h / 900)),
      c: Math.max(0.3, Math.min(1.6, Math.min(h / 900, w / 1150))),
      seed,
    };
    const m = geo.m;

    /* Plan 1 — le ciel et ses nuages. */
    const sky: Layer = { canvas: paintSky(geo), x: 0, y: 0, depth: 0 };
    const cirrusH = Math.ceil(horizon * 0.62);
    const cirrus: Layer = {
      canvas: paintClouds(geo, w + m * 2, cirrusH, {
        count: Math.round(p.clouds * 0.55),
        yMin: cirrusH * 0.16,
        yMax: cirrusH * 0.9,
        bias: 1.7,
        rMin: 34,
        rMax: 96,
        flatten: 0.16,
        distance: 1250,
        erosion: 0.92,
        seed: seed + 301,
      }),
      x: -m,
      y: 0,
      depth: 2.5,
      drift: 1.6,
      alpha: 0.72,
    };
    const cumulusH = Math.ceil(horizon * 1.0);
    const cumulus: Layer = {
      canvas: paintClouds(geo, w + m * 2, cumulusH, {
        count: p.clouds,
        yMin: cumulusH * 0.3,
        yMax: cumulusH * 0.96,
        bias: 0.62,
        rMin: 42,
        rMax: 132,
        flatten: 0.5,
        distance: 880,
        erosion: 0.86,
        seed: seed + 302,
      }),
      x: -m,
      y: 0,
      depth: 4,
      drift: 3.4,
      alpha: 0.92,
    };

    /* Plan 2 — les crêtes lointaines. */
    const farTop = Math.round(horizon - h * 0.3);
    const farLayer = surface(w + m * 2, h - farTop + m);
    const farCtx = context2d(farLayer);
    /*
     * Trois arêtes, du plus lointain au plus proche. La valeur descend et la
     * saturation monte à chaque plan : c'est cet écart, plus que la brume,
     * qui donne la profondeur. Trop de brume aplatit tout en bleu pâle.
     */
    const specs: RidgeSpec[] = [
      { base: 0.78, amp: 0.16, freq: 2.3, color: mix(C.bleuProfond, C.bleuBrume, 0.5), distance: 1400, haze: 0.42, seed: seed + 5 },
      { base: 0.87, amp: 0.21, freq: 3.1, color: mix(C.bleuProfond, C.granitAnthracite, 0.42), distance: 980, haze: 0.3, seed: seed + 6 },
      { base: 0.97, amp: 0.25, freq: 1.7, color: mix(C.vertSapin, C.bleuProfond, 0.44), distance: 620, haze: 0.2, seed: seed + 7 },
    ];
    for (const spec of specs) paintRidge(farCtx, spec, geo, -m, farTop, w + m * 2, h - farTop + m);
    const far: Layer = { canvas: farLayer, x: -m, y: farTop, depth: 6 };

    /* Plan 3 — les sapinières moyennes. */
    const midTop = Math.round(horizon - h * 0.12);
    const midLayer = surface(w + m * 2, h - midTop + m);
    const midCtx = context2d(midLayer);
    const midSpec: RidgeSpec = {
      base: 1.03,
      amp: 0.2,
      freq: 1.25,
      color: mix(C.vertSapin, C.granitAnthracite, 0.2),
      distance: 300,
      haze: 0.12,
      seed: seed + 8,
    };
    const midLine = paintRidge(midCtx, midSpec, geo, -m, midTop, w + m * 2, h - midTop + m);

    /*
     * Taches de futaie et de clairière : un versant d'un seul ton, même
     * ombragé, reste un aplat. Deux masques de bruit à grande échelle donnent
     * au flanc ses masses sombres et ses pâtures claires.
     */
    midCtx.save();
    midCtx.globalCompositeOperation = 'source-atop';
    midCtx.globalAlpha = 0.34;
    midCtx.drawImage(
      tintMask(
        noiseMask(midLayer.width, midLayer.height, seed + 81, 78 * geo.s, 0.16, 2.3),
        mix(C.vertSapin, C.mousseSombre, 0.4),
      ),
      0,
      0,
    );
    midCtx.globalAlpha = 0.16;
    midCtx.drawImage(
      tintMask(
        noiseMask(midLayer.width, midLayer.height, seed + 82, 42 * geo.s, 0.3, 2.6),
        mix(C.vertHetre, C.ocre, 0.3),
      ),
      0,
      0,
    );
    midCtx.restore();

    const firRand = mulberry32(seed + 909);
    const count = p.firs;
    /*
     * Quatre rangées de sapinière, de la plus lointaine à la plus proche.
     * Chaque rangée a ses propres silhouettes pré-rendues, à sa distance :
     * la désaturation est ainsi cuite dans le sprite, et non posée en voile
     * uniforme par-dessus — un voile plat effacerait tout le modelé.
     */
    const rows: { yOff: number; scale: number; dist: number }[] = [
      { yOff: -h * 0.012, scale: 0.34, dist: 680 },
      { yOff: h * 0.032, scale: 0.52, dist: 470 },
      { yOff: h * 0.086, scale: 0.78, dist: 290 },
      { yOff: h * 0.16, scale: 1.14, dist: 130 },
    ];
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const sprites: HTMLCanvasElement[] = [];
      for (let i = 0; i < 5; i++) sprites.push(firSprite(120 * geo.s, seed + 200 + r * 11 + i, row.dist));
      const n = Math.max(4, Math.round((count / rows.length) * (1 - r * 0.1)));
      /* Distribution en grille secouée : ni peigne régulier, ni tas. */
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5 + (firRand() - 0.5) * 1.5) / n) * (w + m * 2);
        const sprite = sprites[Math.floor(firRand() * sprites.length)];
        const sc = row.scale * (0.6 + firRand() * firRand() * 1.1) * geo.s * 0.72;
        const sw = sprite.width * sc;
        const sh = sprite.height * sc;
        const y = midLine(x) + row.yOff + firRand() * h * 0.028;
        midCtx.save();
        /* Ombre portée au sol, vers le sud-est, bleutée. */
        midCtx.globalAlpha = 0.2;
        midCtx.fillStyle = C.ombrePortee;
        midCtx.beginPath();
        midCtx.ellipse(x + sh * 0.16, y, sw * 0.42, sh * 0.045, 0, 0, Math.PI * 2);
        midCtx.fill();
        midCtx.globalAlpha = 1;
        if (firRand() > 0.5) {
          midCtx.translate(x + sw / 2, 0);
          midCtx.scale(-1, 1);
          midCtx.drawImage(sprite, 0, y - sh, sw, sh);
        } else {
          midCtx.drawImage(sprite, x - sw / 2, y - sh, sw, sh);
        }
        midCtx.restore();
      }
    }
    const mid: Layer = { canvas: midLayer, x: -m, y: midTop, depth: 9 };

    /* Plan 4 — le bourg fortifié. */
    const townTop = Math.round(horizon - h * 0.2);
    const townCanvas = surface(w + m * 2, h - townTop + m);
    const townCtx = context2d(townCanvas);
    townMeta = paintTown(townCtx, geo, w + m * 2, h - townTop + m);
    townLayer = { canvas: townCanvas, x: -m, y: townTop, depth: 11.5 };

    /* Plan 5 — le premier plan, en deux nappes décalées. */
    const fgFarTop = Math.round(h - h * 0.34);
    const fgFarCanvas = surface(w + m * 2, h - fgFarTop + m);
    paintForeground(context2d(fgFarCanvas), geo, w + m * 2, h - fgFarTop + m, false);
    const fgFar: Layer = { canvas: fgFarCanvas, x: -m, y: fgFarTop, depth: 15 };

    const fgNearTop = Math.round(h - h * 0.26);
    const fgNearCanvas = surface(w + m * 2, h - fgNearTop + m);
    paintForeground(context2d(fgNearCanvas), geo, w + m * 2, h - fgNearTop + m, true);
    const fgNear: Layer = { canvas: fgNearCanvas, x: -m, y: fgNearTop, depth: 21 };

    layers = [sky, cirrus, cumulus, far, mid, townLayer, fgFar, fgNear];
    veil = paintVeil(geo);

    /* Plan 6 — les particules. */
    const rand = mulberry32(seed + 555);
    mist = [];
    for (let i = 0; i < p.mist; i++) {
      const r = (60 + rand() * 130) * geo.s;
      mist.push({
        x: rand() * w,
        y: horizon - h * 0.06 + rand() * h * 0.42,
        vx: (4 + rand() * 9) * (rand() > 0.5 ? 1 : -1) * 0.35,
        vy: -(1 + rand() * 2) * 0.12,
        r,
        a: 0.1 + rand() * 0.14,
        phase: rand() * Math.PI * 2,
        sprite: mistSprite(r, seed + i),
      });
    }
    sparks = [];
    const spark = softSprite(Math.max(4, 7 * geo.s), C.vieilOr, 0.05);
    for (let i = 0; i < p.sparks; i++) {
      sparks.push({
        x: rand() * w,
        y: horizon * 0.55 + rand() * h * 0.5,
        vx: (rand() - 0.3) * 5,
        vy: -(5 + rand() * 16),
        r: (1.6 + rand() * 3.4) * geo.s,
        a: 0.2 + rand() * 0.55,
        phase: rand() * Math.PI * 2,
        sprite: spark,
      });
    }
    birds = [];
    for (let i = 0; i < p.birds; i++) {
      birds.push({
        x: rand() * w,
        y: horizon * (0.32 + rand() * 0.34),
        v: (7 + rand() * 12) * geo.s * 0.5,
        a: 0.18 + rand() * 0.2,
        phase: rand() * Math.PI * 2,
      });
    }
    ready = true;
  }

  /* ── Éléments vivants : fumées, bannières, lueurs, particules ─────────── */

  let smoke: HTMLCanvasElement | null = null;
  let windowHalo: HTMLCanvasElement | null = null;
  let grainPattern: CanvasPattern | null = null;

  function drawLiving(time: number, dx: number, dy: number): void {
    if (!townMeta || !townLayer) return;
    const t = time / 1000;
    const ox = townLayer.x + dx * townLayer.depth;
    const oy = townLayer.y + dy * townLayer.depth * 0.55;
    if (!smoke) smoke = softSprite(Math.max(12, 34 * geo.s), C.bleuBrume, 0.02);
    if (!windowHalo) windowHalo = softSprite(Math.max(8, 18 * geo.s), C.ocre, 0.02);

    /* Fumées de cheminée et de forge : elles montent, s'écartent, se diluent. */
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    for (const ch of townMeta.chimneys) {
      const puffs = quality === 'basse' ? 3 : 6;
      for (let i = 0; i < puffs; i++) {
        const life = ((t * 0.14 + i / puffs + ch.seed * 0.13) % 1);
        const rise = life * geo.h * 0.15 * ch.scale;
        const spread = 1 + life * 2.6;
        const alpha = (1 - life) * 0.2 * ch.scale;
        const sway = Math.sin(t * 0.6 + i + ch.seed) * geo.s * 5 * life;
        const size = smoke.width * ch.scale * spread * 0.55;
        ctx.globalAlpha = alpha;
        ctx.drawImage(smoke, ox + ch.x + sway - size / 2, oy + ch.y - rise - size / 2, size, size);
      }
    }
    ctx.restore();

    /* Fenêtres : la flamme d'une chandelle n'est jamais fixe. */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const win of townMeta.windows) {
      const flick = 0.5 + 0.5 * Math.sin(t * 1.7 + win.phase) * Math.sin(t * 0.61 + win.phase * 2.1);
      ctx.globalAlpha = 0.18 + flick * 0.3;
      ctx.fillStyle = mix(C.ocre, C.lumiere, 0.55);
      ctx.fillRect(ox + win.x, oy + win.y, win.w, win.h);
      ctx.globalAlpha = (0.08 + flick * 0.12) * 0.9;
      ctx.drawImage(
        windowHalo,
        ox + win.x + win.w / 2 - windowHalo.width / 2,
        oy + win.y + win.h / 2 - windowHalo.height / 2,
      );
    }
    ctx.restore();

    /* Bannières : amplitude de trois pixels, période de quatre secondes. */
    for (const b of townMeta.banners) {
      const bx = ox + b.x;
      const by = oy + b.y;
      const wave = Math.sin(t * 1.55 + b.x * 0.02);
      const wave2 = Math.sin(t * 0.9 + b.x * 0.05);
      const len = b.h * 1.5;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + len * 0.5, by + wave * 3 * geo.s, bx + len, by + b.h * 0.32 + wave2 * 2 * geo.s);
      ctx.lineTo(bx + len * 0.78, by + b.h * 0.62);
      ctx.quadraticCurveTo(bx + len * 0.4, by + b.h * 0.72 + wave * 2 * geo.s, bx, by + b.h);
      ctx.closePath();
      const bg = ctx.createLinearGradient(bx, by, bx + len, by + b.h);
      bg.addColorStop(0, tint(b.color, 0.22));
      bg.addColorStop(0.6, b.color);
      bg.addColorStop(1, shade(b.color, 0.34));
      ctx.fillStyle = bg;
      ctx.fill();
      ctx.strokeStyle = rgba(contourOf(b.color), 0.7);
      ctx.lineWidth = Math.max(0.6, geo.s);
      ctx.stroke();
      ctx.strokeStyle = rgba(C.vieilOr, SUN.rimOpacity);
      ctx.lineWidth = Math.max(0.5, geo.s * 0.7);
      ctx.translate(0, geo.s * 0.9);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawParticles(time: number, dt: number, dx: number, dy: number): void {
    const t = time / 1000;

    /* Oiseaux : trois traits, très loin, très lents. */
    ctx.save();
    for (const bird of birds) {
      bird.x += bird.v * dt;
      if (bird.x > geo.w + 40) bird.x = -40;
      const flap = Math.sin(t * 5.5 + bird.phase);
      const y = bird.y + Math.sin(t * 0.5 + bird.phase) * 6 * geo.s + dy * 3;
      const s = 5 * geo.s;
      ctx.strokeStyle = rgba(mix(C.bleuProfond, C.ombre, 0.4), bird.a);
      ctx.lineWidth = Math.max(0.8, geo.s);
      ctx.beginPath();
      ctx.moveTo(bird.x - s, y + flap * s * 0.4);
      ctx.quadraticCurveTo(bird.x, y - flap * s * 0.3, bird.x + s, y + flap * s * 0.4);
      ctx.stroke();
    }
    ctx.restore();

    /* Brume rampante dans la vallée. */
    ctx.save();
    for (const p of mist) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.x < -p.r * 2) p.x = geo.w + p.r;
      if (p.x > geo.w + p.r * 2) p.x = -p.r;
      const pulse = 0.72 + 0.28 * Math.sin(t * 0.28 + p.phase);
      ctx.globalAlpha = p.a * pulse;
      ctx.drawImage(p.sprite, p.x - p.r + dx * 7, p.y - p.r * 0.6 + dy * 7);
    }
    ctx.restore();

    /* Étincelles : braises et poussières d'or, en additif. */
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of sparks) {
      p.y += p.vy * dt;
      p.x += (p.vx + Math.sin(t * 0.8 + p.phase) * 9) * dt;
      if (p.y < geo.horizon * 0.3) {
        p.y = geo.h + 10;
        p.x = ((p.x + geo.w * 0.37) % geo.w + geo.w) % geo.w;
      }
      const twinkle = 0.45 + 0.55 * Math.sin(t * 2.1 + p.phase);
      ctx.globalAlpha = p.a * twinkle * 0.7;
      const size = p.r * 4;
      ctx.drawImage(p.sprite, p.x - size / 2 + dx * 12, p.y - size / 2 + dy * 12, size, size);
    }
    ctx.restore();
  }

  /* ── Boucle ───────────────────────────────────────────────────────────── */

  let last = 0;
  let elapsed = 0;

  function render(now: number): void {
    const started = performance.now();
    const dt = last === 0 ? 0.016 : Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduced) elapsed += dt * 1000;

    if (!reduced) {
      drift.x += (drift.tx - drift.x) * Math.min(1, dt * 3.4);
      drift.y += (drift.ty - drift.y) * Math.min(1, dt * 3.4);
    } else {
      drift.x = 0;
      drift.y = 0;
    }
    const dx = drift.x;
    const dy = drift.y;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (const layer of layers) {
      const ox = layer.x + dx * layer.depth;
      const oy = layer.y + dy * layer.depth * 0.55;
      ctx.globalAlpha = layer.alpha ?? 1;
      if (layer.drift) {
        const span = layer.canvas.width;
        const shift = ((elapsed / 1000) * layer.drift) % span;
        ctx.drawImage(layer.canvas, ox - shift, oy);
        ctx.drawImage(layer.canvas, ox - shift + span, oy);
      } else {
        ctx.drawImage(layer.canvas, ox, oy);
      }
      ctx.globalAlpha = 1;
      /* Sans animation, les fumées sont tout de même peintes, figées. */
      if (layer === townLayer) drawLiving(reduced ? 2400 : elapsed, dx, dy);
    }
    if (!reduced) drawParticles(elapsed, dt, dx, dy);
    if (veil) ctx.drawImage(veil, 0, 0);
    if (profile().grain) {
      if (!grainPattern) grainPattern = ctx.createPattern(grainTile(128, seed + 9), 'repeat');
      if (grainPattern) {
        const gx = reduced ? 0 : (elapsed * 0.02) % 128;
        const gy = reduced ? 0 : (elapsed * 0.013) % 128;
        ctx.save();
        ctx.globalAlpha = 0.035;
        ctx.translate(gx, gy);
        ctx.fillStyle = grainPattern;
        ctx.fillRect(-gx, -gy, geo.w, geo.h);
        ctx.restore();
      }
    }

    frameMs = performance.now() - started;
    /* Garde-fou : la scène n'a pas le droit de manger le fil principal. */
    if (frameMs > 8) {
      slowFrames++;
      if (slowFrames > 90 && quality !== 'basse') {
        slowFrames = 0;
        setQuality(quality === 'haute' ? 'moyenne' : 'basse');
        return;
      }
    } else if (slowFrames > 0) {
      slowFrames--;
    }
    if (!reduced && visible && !disposed) raf = requestAnimationFrame(render);
  }

  function start(): void {
    if (disposed) return;
    cancelAnimationFrame(raf);
    last = 0;
    if (reduced) {
      render(performance.now());
      return;
    }
    raf = requestAnimationFrame(render);
  }

  function setQuality(next: SceneQuality): void {
    if (quality === next && ready) return;
    quality = next;
    smoke = null;
    windowHalo = null;
    grainPattern = null;
    build();
    start();
  }

  function setReducedMotion(next: boolean): void {
    if (reduced === next) return;
    reduced = next;
    start();
  }

  /* ── Entrées ──────────────────────────────────────────────────────────── */

  const onPointer = (event: PointerEvent): void => {
    if (reduced) return;
    drift.tx = -(event.clientX / window.innerWidth - 0.5) * 2;
    drift.ty = -(event.clientY / window.innerHeight - 0.5) * 2;
  };
  const onOrientation = (event: DeviceOrientationEvent): void => {
    if (reduced) return;
    const gamma = event.gamma ?? 0;
    const beta = event.beta ?? 0;
    drift.tx = -clamp(gamma / 28, -1, 1);
    drift.ty = -clamp((beta - 42) / 34, -1, 1);
  };
  const onResize = (): void => {
    window.clearTimeout(rebuildTimer);
    rebuildTimer = window.setTimeout(() => {
      if (disposed) return;
      smoke = null;
      windowHalo = null;
      grainPattern = null;
      build();
      start();
    }, 180);
  };
  const onVisibility = (): void => {
    visible = !document.hidden;
    if (visible) start();
    else cancelAnimationFrame(raf);
  };

  window.addEventListener('pointermove', onPointer, { passive: true });
  window.addEventListener('deviceorientation', onOrientation, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('orientationchange', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  build();
  start();

  return {
    setQuality,
    setReducedMotion,
    get frameMs() {
      return frameMs;
    },
    destroy(): void {
      disposed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(rebuildTimer);
      window.removeEventListener('pointermove', onPointer);
      window.removeEventListener('deviceorientation', onOrientation);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      layers = [];
      veil = null;
      townMeta = null;
      townLayer = null;
      mist = [];
      sparks = [];
      birds = [];
    },
  };
}
