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
  rimWidth,
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
  /** `cumulus` = amas volumétrique à base plate ; `cirrus` = voile étiré */
  kind: 'cumulus' | 'cirrus';
}

/**
 * Un **cumulus**, pré-rendu dans son propre tampon.
 *
 * Un nuage n'est pas un tas de dégradés radiaux : c'est un volume. Il a une
 * base **plate** (c'est le niveau de condensation, il est horizontal et il est
 * dans l'ombre), des bourgeons qui montent, une couronne **éclairée au
 * nord-ouest** et des flancs qui s'occluent les uns les autres. C'est ce
 * rapport couronne claire / socle sombre qui donne la structure ; sans lui on
 * n'obtient qu'une tache grise floue.
 *
 * Le tampon dédié est indispensable : il permet d'ombrer la base **à travers
 * le masque du nuage** (`source-atop`) et d'éroder ce nuage-là, pas le ciel.
 */
function cumulusSprite(
  radius: number,
  aplati: number,
  seed: number,
  lit: string,
  body: string,
  dark: string,
  erosion: number,
  s: number,
): HTMLCanvasElement {
  const rand = mulberry32(seed);
  /*
   * Le tampon est **plus grand que le nuage**, avec une marge d'une fois et
   * demie le rayon nominal de chaque côté. Ce n'était pas le cas au premier
   * jet : les bourgeons débordaient et se faisaient couper au carré par le
   * bord du tampon, ce qui semait le ciel de rectangles nets — un défaut de
   * rendu, pas un nuage.
   */
  const coeur = radius * 3.6;
  const pad = radius * 1.6;
  const w = Math.ceil(coeur + pad * 2);
  const h = Math.ceil(radius * 3.6);
  const canvas = surface(w, h);
  const ctx = context2d(canvas);
  /* Base plate : le pied de tous les bourgeons est sur la même horizontale. */
  const baseY = h - radius * 0.75;

  /* Profil de l'amas : plus haut au tiers gauche, effiloché à droite. */
  const lobes: { x: number; y: number; r: number }[] = [];
  const n = 6 + Math.floor(rand() * 5);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    /* Cloche décentrée vers la gauche : un cumulus n'est pas symétrique. */
    const hump = Math.pow(Math.sin(Math.PI * Math.pow(t, 1.35)), 0.7);
    const r = radius * (0.3 + hump * 0.78) * (0.78 + rand() * 0.46);
    lobes.push({
      x: pad + coeur * t + (rand() - 0.5) * radius * 0.35,
      y: baseY - r * (0.42 + hump * 0.5) * (0.8 + rand() * 0.42) * (0.7 + 0.6 * (1 - aplati)),
      r,
    });
  }

  /* 1 — le socle : les flancs sud-est, sourds, sous les bourgeons. */
  for (const l of lobes) {
    const gr = ctx.createRadialGradient(l.x + l.r * 0.22, l.y + l.r * 0.3, l.r * 0.05, l.x, l.y, l.r * 1.04);
    gr.addColorStop(0, rgba(dark, 0.72));
    gr.addColorStop(0.62, rgba(dark, 0.6));
    gr.addColorStop(0.9, rgba(dark, 0.22));
    gr.addColorStop(1, rgba(dark, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(l.x, l.y + l.r * 0.1, l.r * 1.2, l.r * (0.72 + aplati * 0.4), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* 2 — le corps : la valeur moyenne, bien tenue jusqu'aux deux tiers. */
  for (const l of lobes) {
    const gr = ctx.createRadialGradient(l.x - l.r * 0.2, l.y - l.r * 0.24, l.r * 0.06, l.x, l.y, l.r);
    gr.addColorStop(0, rgba(body, 0.96));
    gr.addColorStop(0.58, rgba(body, 0.9));
    gr.addColorStop(0.84, rgba(body, 0.44));
    gr.addColorStop(1, rgba(body, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(l.x, l.y, l.r * 1.06, l.r * (0.86 + aplati * 0.2), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* 3 — la couronne : le bourgeon reçoit le soleil sur son épaule nord-ouest. */
  for (const l of lobes) {
    const cxx = l.x - l.r * 0.3;
    const cyy = l.y - l.r * 0.36;
    const cr = l.r * 0.68;
    const gr = ctx.createRadialGradient(cxx - cr * 0.24, cyy - cr * 0.26, cr * 0.04, cxx, cyy, cr);
    gr.addColorStop(0, rgba(lit, 0.95));
    gr.addColorStop(0.5, rgba(lit, 0.72));
    gr.addColorStop(0.86, rgba(lit, 0.16));
    gr.addColorStop(1, rgba(lit, 0));
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.ellipse(cxx, cyy, cr * 1.02, cr * 0.84, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  /* 4 — le fil de lumière sur l'épaule du plus haut bourgeon, et lui seul :
     répété sur trois lobes, il se lisait comme un trait de dessin dans le ciel. */
  const haut = lobes.reduce((a, b) => (a.y <= b.y ? a : b));
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.ellipse(haut.x, haut.y, haut.r * 0.9, haut.r * 0.76, 0, Math.PI * 1.14, Math.PI * 1.58);
  ctx.strokeStyle = rgba(C.lumiere, 0.26);
  ctx.lineWidth = Math.max(1, 1.3 * s);
  ctx.stroke();
  ctx.restore();

  /* 5 — érosion, à trois échelles : sans elle, ce sont encore des ellipses. */
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = erosion * 0.9;
  ctx.drawImage(noiseMask(w, h, seed + 71, radius * 0.62, 0.06, 2.4), 0, 0);
  ctx.globalAlpha = erosion * 0.7;
  ctx.drawImage(noiseMask(w, h, seed + 72, radius * 0.22, 0.16, 3), 0, 0);
  ctx.globalAlpha = erosion * 0.44;
  ctx.drawImage(noiseMask(w, h, seed + 74, radius * 0.075, 0.24, 3.4), 0, 0);
  ctx.restore();

  /* 6 — la base : plate, franche, et nettement plus sombre que la couronne. */
  ctx.save();
  ctx.globalCompositeOperation = 'source-atop';
  const socle = ctx.createLinearGradient(0, baseY - radius * 0.8, 0, baseY + radius * 0.2);
  socle.addColorStop(0, rgba(dark, 0));
  socle.addColorStop(0.6, rgba(dark, 0.24));
  socle.addColorStop(1, rgba(mix(dark, C.bleuProfond, 0.34), 0.44));
  ctx.fillStyle = socle;
  ctx.fillRect(0, baseY - radius * 0.62, w, h - baseY + radius * 0.62);
  /* Grain interne : la vapeur n'est pas lisse. */
  ctx.globalAlpha = 0.13;
  ctx.drawImage(tintMask(noiseMask(w, h, seed + 73, radius * 0.16, 0, 2), C.ombre), 0, 0);
  ctx.restore();

  /* 7 — la base est rognée net, le sommet reste vaporeux. */
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const coupe = ctx.createLinearGradient(0, baseY - radius * 0.06, 0, baseY + radius * 0.4);
  coupe.addColorStop(0, 'rgba(0,0,0,0)');
  coupe.addColorStop(0.5, 'rgba(0,0,0,0.55)');
  coupe.addColorStop(1, 'rgba(0,0,0,0.95)');
  ctx.fillStyle = coupe;
  ctx.fillRect(0, baseY - radius * 0.06, w, h - baseY + radius * 0.06);
  ctx.restore();

  return canvas;
}

/** Un **cirrus** : un voile étiré, strié, jamais un tas de boules. */
function cirrusSprite(
  length: number,
  seed: number,
  lit: string,
  dark: string,
  s: number,
): HTMLCanvasElement {
  const rand = mulberry32(seed);
  /* Marge de sûreté, comme pour le cumulus : aucun filament ne doit toucher le
     bord du tampon, sous peine d'y laisser une arête droite. */
  const corps = Math.ceil(length);
  const marge = Math.ceil(length * 0.06);
  const w = corps + marge * 2;
  const h = Math.ceil(length * (0.12 + rand() * 0.1));
  const canvas = surface(w, Math.max(8, h));
  const ctx = context2d(canvas);
  const cy = canvas.height * 0.5;
  /* Sept à douze filaments parallèles, de longueurs très inégales. */
  const brins = 7 + Math.floor(rand() * 6);
  for (let i = 0; i < brins; i++) {
    const t = i / brins;
    const x0 = marge + corps * rand() * 0.42;
    const len = Math.min(corps + marge - x0, corps * (0.2 + rand() * 0.58) * (1 - t * 0.2));
    const y = cy + (rand() - 0.5) * canvas.height * 0.5;
    const ep = Math.max(1, canvas.height * (0.04 + rand() * 0.09));
    const grad = ctx.createLinearGradient(x0, 0, x0 + len, 0);
    grad.addColorStop(0, rgba(rand() > 0.5 ? lit : dark, 0));
    grad.addColorStop(0.3, rgba(lit, 0.42 + rand() * 0.3));
    grad.addColorStop(0.72, rgba(lit, 0.2));
    grad.addColorStop(1, rgba(lit, 0));
    ctx.fillStyle = grad;
    ctx.beginPath();
    /* Le filament remonte légèrement : un cirrus suit le vent d'altitude. */
    ctx.ellipse(x0 + len / 2, y - len * 0.02, len / 2, ep, -0.03 - rand() * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 0.66;
  ctx.drawImage(noiseMask(canvas.width, canvas.height, seed + 31, 26 * s, 0.02, 2.4), 0, 0);
  ctx.globalAlpha = 0.4;
  ctx.drawImage(noiseMask(canvas.width, canvas.height, seed + 32, 7 * s, 0.16, 3), 0, 0);
  ctx.restore();
  return canvas;
}

function paintClouds(g: Geo, width: number, height: number, o: CloudOptions): HTMLCanvasElement {
  const out = surface(width, height);
  const ctx = context2d(out);
  const rand = mulberry32(o.seed);

  /**
   * Colle un nuage **et ses deux répliques** à une largeur d'écart.
   *
   * Le plan des nuages défile en boucle : il est dessiné deux fois, décalé de
   * sa propre largeur. Si un nuage touche un bord, la boucle le coupe net et
   * une arête verticale traverse le ciel à intervalle régulier. En répliquant
   * ce qui déborde, le tampon devient périodique et la boucle ne se voit plus.
   */
  const poser = (sprite: HTMLCanvasElement, x: number, y: number, alpha: number): void => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(sprite, x, y);
    if (x < 0) ctx.drawImage(sprite, x + width, y);
    else if (x + sprite.width > width) ctx.drawImage(sprite, x - width, y);
    ctx.restore();
  };

  for (let i = 0; i < o.count; i++) {
    const cx = rand() * width;
    const cy = lerp(o.yMin, o.yMax, Math.pow(rand(), o.bias));
    /*
     * Un nuage est un **grand motif** : sa taille suit l'échelle de
     * composition, pas l'échelle de détail. Calibré sur `g.s`, il devenait
     * démesuré sur un écran haute densité étroit et le couvert avalait tout le
     * ciel du portrait.
     */
    const radius = lerp(o.rMin, o.rMax, rand()) * Math.min(g.s, g.c * 1.2);
    /* Un nuage proche du soleil reçoit un cœur bien plus chaud. */
    const near = 1 - clamp(Math.abs(cx - g.sunX) / (width * 0.55), 0, 1);
    /* Un nuage de crépuscule est ambré, pas gris : c'est la lumière rasante
       qui le colore, d'autant plus qu'il est proche du soleil. */
    const lit = aerial(mix(C.lumiere, C.ocre, 0.3 - near * 0.22), o.distance * 0.18);
    const body = aerial(mix(mix(C.ocre, C.parcheminOmbre, 0.42), C.bleuBrume, 0.16), o.distance * 0.36);
    const dark = aerial(mix(mix(C.ombre, C.grenat, 0.22), C.bleuBrume, 0.2), o.distance * 0.26);

    if (o.kind === 'cirrus') {
      const sprite = cirrusSprite(radius * 5.4, o.seed + i * 17, lit, dark, g.s);
      poser(sprite, cx - sprite.width / 2, cy - sprite.height / 2, 0.28 + near * 0.3);
      continue;
    }

    /* Plus le nuage est bas sur l'horizon, plus il s'étire. */
    const aplati = clamp(o.flatten * (0.4 + 0.6 * (1 - cy / height)), 0.1, 1);
    const sprite = cumulusSprite(radius, aplati, o.seed + i * 29, lit, body, dark, o.erosion, g.s);
    poser(sprite, cx - sprite.width / 2, cy - sprite.height * 0.78, 0.62 + near * 0.3);
  }

  /*
   * Le bas du tampon s'efface. C'est la même règle que pour les crêtes : une
   * bande de hauteur fixe ne doit jamais couper son contenu, sans quoi le bord
   * du tampon se lit comme un trait horizontal en travers du ciel.
   */
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  const bord = ctx.createLinearGradient(0, height * 0.7, 0, height);
  bord.addColorStop(0, 'rgba(0,0,0,0)');
  bord.addColorStop(1, 'rgba(0,0,0,1)');
  ctx.fillStyle = bord;
  ctx.fillRect(0, height * 0.7, width, height * 0.3);
  ctx.restore();

  /* Adoucissement final, très léger : la structure doit survivre au flou. */
  const soft = surface(width, height);
  const sctx = context2d(soft);
  sctx.filter = `blur(${(0.6 * g.s).toFixed(2)}px)`;
  sctx.drawImage(out, 0, 0);
  sctx.filter = 'none';
  return soft;
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
  /**
   * Étagement de végétation : fraction de l'amplitude sous la crête où la
   * futaie prend le relais de la lande. `0` laisse le versant nu. Les monts du
   * Forez portent la forêt jusque vers 1 300 m puis la chaume : c'est cette
   * limite, sinueuse et jamais horizontale, qui fait lire l'échelle.
   */
  treeline?: number;
  /** teinte de l'étage boisé */
  wood?: string;
}

/** Profil d'une crête : bruit de crête + une octave douce, jamais une sinusoïde. */
function ridgeProfile(spec: RidgeSpec, g: Geo): (x: number) => number {
  const n1 = makeNoise1D(spec.seed);
  const n2 = makeNoise1D(spec.seed + 401);
  const n3 = makeNoise1D(spec.seed + 733);
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
    /* Dentelure de sommet : sans cette dernière octave, l'arête est un pli de
       papier découpé. Elle est trop fine pour se voir isolément, assez pour
       que l'œil cesse de lire un triangle. */
    const dent = (ridged(n3, u * 13.5 + 3, 2) * 0.5 + 0.5) * 0.055;
    return base - (r * 0.74 + detail + soft + dent) * amp;
  };
}

/**
 * Point le plus haut atteint par une crête sur un intervalle.
 *
 * C'est la clé de la **couture horizontale** : chaque plan est peint dans son
 * propre tampon, et si le sommet du profil tombe au-dessus du bord supérieur
 * de ce tampon, le remplissage opaque commence sur ce bord — l'écran est barré
 * d'un trait net à la hauteur exacte du bord de la bande. La bande doit donc
 * être dimensionnée sur le relief réel, jamais sur une fraction fixe.
 */
function ridgeCeiling(spec: RidgeSpec, g: Geo, x0: number, x1: number): number {
  const profile = ridgeProfile(spec, g);
  let min = Infinity;
  const steps = 256;
  for (let i = 0; i <= steps; i++) {
    const y = profile(x0 + ((x1 - x0) * i) / steps);
    if (y < min) min = y;
  }
  return min;
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
  /* Amplitude du relief en pixels : toutes les longueurs de modelé s'y
     rapportent, jamais à la hauteur du tampon, qui n'a pas de sens physique. */
  const ampPx = g.h * spec.amp;

  const path = new Path2D();
  path.moveTo(0, height);
  for (let x = 0; x <= width; x += step) path.lineTo(x, local(x));
  path.lineTo(width, height);
  path.closePath();

  /* Le sommet réel, pas un échantillon au milieu : c'est lui qui cale tous les
     dégradés du versant, et il ne tombe presque jamais au centre du cadre. */
  let crest = Infinity;
  for (let x = 0; x <= width; x += step) crest = Math.min(crest, local(x));
  const body = aerial(spec.color, spec.distance);
  const grad = ctx.createLinearGradient(0, crest - height * 0.04, 0, height);
  grad.addColorStop(0, aerial(tint(spec.color, 0.2), spec.distance));
  grad.addColorStop(0.12, aerial(tint(spec.color, 0.06), spec.distance));
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
  const nArete = makeNoise2D(spec.seed + 78);
  /* Ravines : la maille est un peu plus serrée en x qu'en y. */
  const echelleX = (104 * g.s) / q;
  const echelleY = (128 * g.s) / q;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      /*
       * Deux composantes, et c'est leur somme qui fait la montagne :
       *
       *  - un bruit fractal doux, qui donne la matière du versant ;
       *  - un bruit **de crête** (`1 − |bruit|`), qui produit de vraies arêtes
       *    secondaires : contreforts descendant de la ligne de faîte, combes
       *    entre eux. C'est ce que l'on lit comme « une montagne » plutôt que
       *    comme « une surface bosselée ».
       */
      const doux = fbm2(nRelief, x / echelleX, y / echelleY, 4, 0.52, 2.13);
      const arete =
        1 - Math.abs(fbm2(nArete, x / (echelleX * 1.5), y / (echelleY * 1.15), 3, 0.55, 2.07)) * 2.4;
      champ[y * sw + x] = doux * 0.62 + arete * 0.3;
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
      const v = clamp((lambert - 0.5) * 3.1, -1, 1);
      /*
       * Le modelé s'éteint vers le bas, où la brume prend le relais. Il
       * s'éteint sur **l'amplitude du relief**, pas sur la hauteur du tampon :
       * indexé sur le tampon, il descendait jusqu'au bas de l'image et
       * dessinait de longues rayures verticales par-dessus la forêt.
       */
      const fade = clamp(1 - depth / (ampPx * 0.95), 0, 1);
      const k = i * 4;
      if (v >= 0) {
        data[k] = chaud.r;
        data[k + 1] = chaud.g;
        data[k + 2] = chaud.b;
        data[k + 3] = v * 0.34 * fade * 255;
      } else {
        data[k] = froid.r;
        data[k + 1] = froid.g;
        data[k + 2] = froid.b;
        data[k + 3] = -v * 0.36 * fade * 255;
      }
    }
  }
  rctx.putImageData(img, 0, 0);
  ctx.save();
  ctx.filter = `blur(${Math.max(1.4, width / 420).toFixed(2)}px)`;
  ctx.drawImage(relief, 0, 0, width, height);
  ctx.filter = 'none';
  ctx.restore();

  /*
   * Étagement de végétation : sous une altitude qui varie d'un vallon à
   * l'autre, la lande cède à la futaie. La limite est floutée — une lisière
   * nette serait un bord dur, ce que la bible interdit (§4, lisières).
   */
  if (spec.treeline && spec.treeline > 0) {
    const nWood = makeNoise1D(spec.seed + 617);
    const amp = g.h * spec.amp;
    const wood = aerial(spec.wood ?? mix(C.vertSapin, C.granitAnthracite, 0.28), spec.distance);
    const belt = new Path2D();
    const bstep = Math.max(3, Math.round(4 * g.s));
    belt.moveTo(0, height);
    for (let x = 0; x <= width; x += bstep) {
      const ondule = 0.62 + fbm1(nWood, x / (width * 0.055), 4) * 0.72;
      belt.lineTo(x, local(x) + amp * spec.treeline * ondule);
    }
    belt.lineTo(width, height);
    belt.closePath();
    ctx.save();
    ctx.filter = `blur(${Math.max(1.4, width / 300).toFixed(2)}px)`;
    const wg = ctx.createLinearGradient(0, crest, 0, height);
    wg.addColorStop(0, rgba(wood, 0.5));
    wg.addColorStop(0.5, rgba(wood, 0.66));
    wg.addColorStop(1, rgba(shade(wood, 0.3), 0.5));
    ctx.fillStyle = wg;
    ctx.fill(belt);
    ctx.filter = 'none';
    /* Grain de futaie : la masse boisée n'est pas un aplat non plus. */
    ctx.save();
    ctx.clip(belt);
    ctx.globalAlpha = 0.24;
    ctx.drawImage(
      tintMask(noiseMask(width, height, spec.seed + 58, 15 * g.s, 0.2, 2.8), shade(wood, 0.44)),
      0,
      0,
    );
    ctx.globalAlpha = 0.14;
    ctx.drawImage(
      tintMask(noiseMask(width, height, spec.seed + 59, 44 * g.s, 0.06, 2.1), tint(wood, 0.26)),
      0,
      0,
    );
    ctx.restore();
    ctx.restore();
  }

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

  /*
   * Brume de vallée. Elle **s'accumule au pied du versant**, sur une ou deux
   * fois son amplitude : réglée sur la hauteur du tampon, elle noyait le
   * tableau entier dans un bleu pâle et effaçait tout le travail de valeur.
   */
  const mistTop = crest + ampPx * 0.85;
  const mistBottom = Math.min(height, crest + ampPx * 2.6);
  if (mistBottom > mistTop) {
    const mg = ctx.createLinearGradient(0, mistTop, 0, mistBottom);
    mg.addColorStop(0, rgba(C.bleuBrume, 0));
    mg.addColorStop(0.55, rgba(C.bleuBrume, spec.haze * 0.5));
    mg.addColorStop(1, rgba(C.bleuBrume, spec.haze));
    ctx.fillStyle = mg;
    ctx.fillRect(0, mistTop, width, height - mistTop);
    ctx.globalAlpha = spec.haze * 0.5;
    ctx.drawImage(
      tintMask(noiseMask(width, height, spec.seed + 57, 90 * g.s, 0.16, 2.1), C.bleuBrume),
      0,
      mistTop * 0.35,
    );
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  /*
   * L'arête. Deux traits seulement, et jamais continus :
   *
   *  - un **fil chaud** sur les segments dont la face regarde le nord-ouest
   *    (pente descendante vers l'ouest), là où le soleil rase la roche ;
   *  - un **liseré doré** très mince (loi n°4) sur les segments opposés.
   *
   * Chacun s'éteint là où l'autre s'allume : une arête cernée sur toute sa
   * longueur donne le découpage de papier que la loi n°6 interdit.
   */
  ctx.save();
  ctx.lineCap = 'round';
  const proximite = 1 - clamp(spec.distance / 1500, 0, 0.78);
  const rim = SUN.rimOpacity * proximite;
  for (let x = 0; x <= width; x += step) {
    const slope = (local(x + span) - local(x - span)) / (span * 2);
    /* `slope > 0` : le terrain descend vers l'est, la face est au soleil. */
    const auSoleil = clamp(slope * 2.6, 0, 1);
    const aLOmbre = clamp(-slope * 2.6, 0, 1);
    ctx.beginPath();
    ctx.moveTo(x, local(x));
    ctx.lineTo(x + step, local(x + step));
    if (auSoleil > 0.04) {
      ctx.strokeStyle = rgba(C.lumiere, 0.3 * auSoleil * proximite);
      ctx.lineWidth = Math.max(0.6, 1.1 * g.s);
      ctx.stroke();
    }
    if (aLOmbre > 0.04) {
      ctx.strokeStyle = rgba(C.vieilOr, rim * 0.55 * aLOmbre);
      ctx.lineWidth = Math.max(0.5, 0.9 * g.s);
      ctx.stroke();
    }
  }

  /*
   * Halo de brume juste au-dessus de l'arête. C'est lui qui empêche le
   * découpage : dans un massif, l'air chargé diffuse la lumière et le sommet
   * ne rencontre jamais le ciel sur un pixel franc.
   */
  ctx.globalCompositeOperation = 'destination-over';
  ctx.filter = `blur(${Math.max(2, ampPx / 14).toFixed(2)}px)`;
  /*
   * Le halo est une **bande qui suit l'arête**, bord supérieur compris. Tracé
   * avec un bord supérieur droit, il barrait le ciel d'une ligne horizontale
   * parfaite en travers de tout l'écran : le flou ne sauve pas un bord droit,
   * il ne fait que l'adoucir de quelques pixels.
   */
  const halo = new Path2D();
  halo.moveTo(0, local(0) - ampPx * 0.3);
  for (let x = 0; x <= width; x += step * 2) halo.lineTo(x, local(x) - ampPx * 0.3);
  for (let x = width; x >= 0; x -= step * 2) halo.lineTo(x, local(x) + ampPx * 0.34);
  halo.closePath();
  ctx.fillStyle = rgba(mix(C.bleuBrume, C.ocre, 0.22), 0.16 * (0.4 + clamp(spec.distance / 1400, 0, 1)));
  ctx.fill(halo);
  ctx.filter = 'none';
  ctx.restore();

  return local;
}

/**
 * Un sapin, pré-rendu **à sa taille d'affichage**.
 *
 * Trois erreurs sont corrigées ici par rapport au premier jet :
 *
 *  1. le lutin était rendu à 120 × `s` puis **agrandi une seconde fois** par
 *     `s` : sur un téléphone à forte densité, les sapins faisaient trois fois
 *     leur taille et leurs traits d'ornement suivaient ;
 *  2. le liseré valait `hauteur × 0,024`, soit cinq pixels sur un grand lutin,
 *     pour un décalage d'un seul : l'anneau ressortait **de tous les côtés** et
 *     donnait le contour doré continu, l'« autocollant » ;
 *  3. cinq silhouettes par rangée se répétaient visiblement. La forme dépend
 *     maintenant entièrement de la graine : inclinaison, élancement, densité
 *     d'étages, dissymétrie gauche/droite, valeur.
 */
function firSprite(height: number, seed: number, distance: number): HTMLCanvasElement {
  const rand = mulberry32(seed);
  /* Élancement : du sapin de crête, étroit et serré, au sapin de vallon. */
  const elan = 0.34 + rand() * 0.24;
  const h = Math.max(6, Math.ceil(height));
  const w = Math.max(4, Math.ceil(h * elan));
  const pad = Math.ceil(Math.max(2, h * 0.05));
  const canvas = surface(w + pad * 2, h + pad * 2);
  const ctx = context2d(canvas);
  /* Chaque sujet a sa propre valeur : une futaie n'est pas monochrome. */
  const teinte = mix(C.vertSapin, rand() > 0.55 ? C.mousseSombre : C.bleuProfond, rand() * 0.34);
  const base = aerial(shade(teinte, rand() * 0.16), distance);
  const cx = (w + pad * 2) / 2;
  const top = pad;
  /* Inclinaison : aucun arbre n'est parfaitement vertical. */
  const lean = (rand() - 0.5) * w * 0.22;
  const axe = (p: number): number => cx + lean * Math.pow(p, 1.6);

  /* Tronc, visible seulement au pied. */
  const trunk = aerial(mix(C.brunFougere, C.encre, 0.4), distance + 140);
  ctx.fillStyle = rgba(trunk, 0.9);
  ctx.fillRect(axe(1) - h * 0.017, top + h * 0.86, Math.max(1, h * 0.034), h * 0.15);

  /*
   * Ramure : sept à douze étages, chacun tiré indépendamment à gauche et à
   * droite. C'est cette dissymétrie qui empêche l'œil de reconnaître un motif.
   */
  const tiers = 7 + Math.floor(rand() * 6);
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let t = 0; t < tiers; t++) {
    const p = (t + 1) / tiers;
    const y = top + Math.pow(p, 1.04) * h * 0.94;
    const enveloppe = (w / 2) * Math.pow(p, 0.74);
    const sg = enveloppe * (0.74 + rand() * 0.42);
    const sd = enveloppe * (0.74 + rand() * 0.42);
    const creux = 0.36 + rand() * 0.22;
    /* La branche retombe : sa pointe est plus basse que son attache. */
    const tombe = h * 0.012 * (0.5 + rand());
    left.push({ x: axe(p) - enveloppe * creux, y: y - h * (0.045 + rand() * 0.025) });
    left.push({ x: axe(p) - sg, y: y + tombe });
    right.push({ x: axe(p) + enveloppe * creux, y: y - h * (0.045 + rand() * 0.025) });
    right.push({ x: axe(p) + sd, y: y + tombe });
  }
  const path = new Path2D();
  path.moveTo(axe(0), top);
  for (const p of right) path.lineTo(p.x, p.y);
  path.lineTo(axe(1) + w * 0.05, top + h);
  path.lineTo(axe(1) - w * 0.05, top + h);
  for (let i = left.length - 1; i >= 0; i--) path.lineTo(left[i].x, left[i].y);
  path.closePath();

  /* Corps : lumière au nord-ouest, ombre froide au sud-est (lois 2 et 3). */
  const grad = ctx.createLinearGradient(cx - w * 0.6, top, cx + w * 0.6, top + h);
  grad.addColorStop(0, tint(base, 0.34));
  grad.addColorStop(0.3, tint(base, 0.1));
  grad.addColorStop(0.6, base);
  grad.addColorStop(1, shade(base, 0.5));
  ctx.fillStyle = grad;
  ctx.fill(path);

  ctx.save();
  ctx.clip(path);
  /* Ombre propre : la moitié sud-est de la couronne est dans son propre noir. */
  const sg2 = ctx.createLinearGradient(cx - w * 0.1, top, cx + w * 0.62, top + h * 0.62);
  sg2.addColorStop(0, rgba(C.ombre, 0));
  sg2.addColorStop(1, rgba(C.ombre, 0.46));
  ctx.fillStyle = sg2;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  /* Étages : chaque verticille projette son ombre sur celui du dessous. */
  if (h > 26) {
    ctx.lineCap = 'round';
    for (let t = 1; t < tiers; t++) {
      const p = t / tiers;
      const y = top + Math.pow(p, 1.04) * h * 0.94;
      const e = (w / 2) * Math.pow(p, 0.74);
      ctx.beginPath();
      ctx.moveTo(axe(p) - e * 0.94, y + h * 0.012);
      ctx.quadraticCurveTo(axe(p), y - h * 0.014, axe(p) + e * 0.94, y + h * 0.014);
      ctx.strokeStyle = rgba(C.ombrePortee, 0.2);
      ctx.lineWidth = Math.max(0.6, h * 0.012);
      ctx.stroke();
      /* Et reçoit la lumière sur son épaule ouest. */
      ctx.beginPath();
      ctx.moveTo(axe(p) - e * 0.9, y - h * 0.014);
      ctx.quadraticCurveTo(axe(p) - e * 0.3, y - h * 0.03, axe(p), y - h * 0.02);
      ctx.strokeStyle = rgba(C.lumiere, 0.16);
      ctx.lineWidth = Math.max(0.5, h * 0.008);
      ctx.stroke();
    }
  }
  ctx.restore();

  const proche = 1 - clamp(distance / 900, 0, 0.85);
  const box = { x: pad, y: top, w, h };
  /* Contour teinté seulement du côté de l'ombre, et très fin. */
  if (h > 18) tintedOutline(ctx, path, shade(base, 0.2), Math.max(0.5, h * 0.006));
  /* Liseré : 1 à 2 px, sud-est uniquement. Le reste est un cerne. */
  rimLight(ctx, path, rimWidth(h / 90), SUN.rimOpacity * (0.5 + proche * 0.5), box);
  sunEdge(ctx, path, rimWidth(h / 110), 0.3 * proche, box);
  return canvas;
}

/* ───────────────────── Plan 4 : le bourg fortifié ───────────────────────── */

interface AshlarOptions {
  /** hauteur d'assise, en unités de composition */
  course?: number;
  /** longueur moyenne d'une pierre, en unités de composition */
  stoneLen?: number;
  /** mousse au pied du mur, 0 à 1 */
  moss?: number;
  /** décalage d'assise : 0 pour un appareil réglé, 0,5 pour un appareil croisé */
  offset?: number;
}

/**
 * **Appareil de granit.**
 *
 * Une grille de blocs d'un seul gris est un aplat, donc un défaut (loi n°1) :
 * c'est exactement ce que montrait la première version de la courtine. Une
 * muraille du Forez, elle, est un assemblage de blocs **tous différents** —
 * le granit d'un même front de taille varie du chamois au gris bleuté selon le
 * grain et l'exposition — montés à joints creux, épaufrés aux angles, verdis
 * au pied par la mousse et lavés de coulures sous chaque ouverture.
 *
 * On peint donc, pierre par pierre :
 *
 *  1. une **valeur propre** tirée d'un bruit à grande maille (les bancs de
 *     carrière se suivent), plus un aléa individuel ;
 *  2. un dégradé interne, clair au nord-ouest ;
 *  3. un **joint creux** : filet sombre en bas et à droite, filet clair en haut
 *     et à gauche — c'est le relief du joint qui fait la pierre, pas le trait ;
 *  4. une épaufrure d'angle sur une pierre sur sept ;
 *  5. par-dessus l'ensemble, les grandes salissures et la mousse.
 *
 * L'appelant a déjà découpé la silhouette du mur : cette fonction remplit.
 */
function ashlar(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  stone: string,
  u: number,
  seed: number,
  o: AshlarOptions = {},
): void {
  const rand = mulberry32(seed);
  const course = Math.max(2.5, (o.course ?? 13) * u);
  const avg = Math.max(4, (o.stoneLen ?? 25) * u);
  const joint = Math.max(0.7, course * 0.09);
  const banc = makeNoise2D(seed + 55);
  const mortier = shade(mix(stone, C.parcheminOmbre, 0.3), 0.34);

  ctx.save();
  /* Le mortier occupe le fond : les joints sont donc des creux, pas des traits
     posés par-dessus. */
  ctx.fillStyle = mortier;
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);

  let row = 0;
  for (let y = y0; y < y1; y += course, row++) {
    const decalage = row % 2 === 0 ? 0 : (o.offset ?? 0.5);
    let x = x0 - avg * (decalage + rand() * 0.3);
    const hh = Math.min(course, y1 - y);
    while (x < x1) {
      const len = avg * (0.6 + rand() * 0.9);
      /* Valeur du banc, puis aléa de la pierre : deux échelles, jamais une. */
      const v = fbm2(banc, x / (avg * 3.4), y / (course * 5), 3, 0.5, 2.1);
      const perso = (rand() - 0.5) * 0.24;
      let col = v + perso > 0 ? tint(stone, 0.05 + (v + perso) * 0.3) : shade(stone, 0.04 - (v + perso) * 0.34);
      const nature = rand();
      /* Une pierre sur dix est chamois, une sur douze est verdie : c'est cette
         minorité qui fait lire du granit et non du béton peint. */
      if (nature > 0.9) col = mix(col, C.ocre, 0.2 + rand() * 0.14);
      else if (nature < 0.085) col = mix(col, C.mousseSombre, 0.22 + rand() * 0.16);
      else if (nature < 0.16) col = mix(col, C.bleuProfond, 0.12);

      const px0 = Math.max(x0, x + joint * 0.5);
      const px1 = Math.min(x1, x + len - joint * 0.5);
      const largeur = px1 - px0;
      if (largeur > 0.8) {
        const g2 = ctx.createLinearGradient(px0, y, px0 + largeur * 0.5, y + hh);
        g2.addColorStop(0, tint(col, 0.14));
        g2.addColorStop(0.45, col);
        g2.addColorStop(1, shade(col, 0.2));
        ctx.fillStyle = g2;
        ctx.fillRect(px0, y + joint * 0.5, largeur, Math.max(0.8, hh - joint));

        /* Joint creux : lumière sur l'arête supérieure, ombre sous la pierre. */
        ctx.fillStyle = rgba(C.lumiere, 0.13);
        ctx.fillRect(px0, y + joint * 0.5, largeur, Math.max(0.5, joint * 0.55));
        ctx.fillStyle = rgba(contourOf(stone), 0.42);
        ctx.fillRect(px0, y + hh - joint * 0.9, largeur, Math.max(0.5, joint * 0.7));
        ctx.fillStyle = rgba(contourOf(stone), 0.26);
        ctx.fillRect(px1 - Math.max(0.5, joint * 0.5), y + joint * 0.5, Math.max(0.5, joint * 0.5), hh - joint);

        /* Épaufrure : le coin d'une pierre sur sept a sauté. */
        if (rand() > 0.86 && largeur > joint * 4) {
          const cs = Math.min(largeur * 0.4, hh * 0.5);
          ctx.fillStyle = rgba(mortier, 0.9);
          ctx.beginPath();
          if (rand() > 0.5) {
            ctx.moveTo(px1, y + joint * 0.5);
            ctx.lineTo(px1 - cs, y + joint * 0.5);
            ctx.lineTo(px1, y + joint * 0.5 + cs);
          } else {
            ctx.moveTo(px0, y + hh - joint);
            ctx.lineTo(px0 + cs, y + hh - joint);
            ctx.lineTo(px0, y + hh - joint - cs);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
      x += len;
    }
  }

  /* Grandes salissures : lessivage des pluies, taches d'humidité, suie. */
  const w = x1 - x0;
  const hgt = y1 - y0;
  ctx.globalAlpha = 0.2;
  ctx.drawImage(tintMask(noiseMask(w, hgt, seed + 71, Math.max(6, course * 5), 0.1, 2.4), C.ombrePortee), x0, y0);
  ctx.globalAlpha = 0.11;
  ctx.drawImage(tintMask(noiseMask(w, hgt, seed + 72, Math.max(4, course * 1.6), 0, 2.2), C.ocre), x0, y0);
  ctx.globalAlpha = 1;

  /* Mousse au pied : elle monte du sol et suit les joints. */
  const moss = o.moss ?? 0.55;
  if (moss > 0) {
    const mg = ctx.createLinearGradient(0, y1 - hgt * 0.42, 0, y1);
    mg.addColorStop(0, rgba(C.mousseSombre, 0));
    mg.addColorStop(0.6, rgba(C.mousseSombre, 0.2 * moss));
    mg.addColorStop(1, rgba(mix(C.mousseSombre, C.vertHetre, 0.24), 0.62 * moss));
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = mg;
    ctx.fillRect(x0, y1 - hgt * 0.42, w, hgt * 0.42);
    /* Rongée par un bruit fin : une frange de mousse régulière n'existe pas. */
    ctx.globalCompositeOperation = 'destination-out';
    ctx.globalAlpha = 0.34;
    ctx.drawImage(noiseMask(w, hgt, seed + 73, Math.max(3, course * 0.8), 0.2, 3), x0, y0);
    ctx.restore();
  }
  ctx.restore();
}

/**
 * Coulure sous une ouverture : l'eau de pluie qui sort d'une archère ou d'une
 * baie lave la pierre en dessous et y dépose sa crasse. Deux traînées légères
 * suffisent à dater un mur.
 */
function grimeStreak(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  len: number,
  seed: number,
): void {
  const rand = mulberry32(seed);
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const sx = x + w * (0.1 + rand() * 0.8);
    const l = len * (0.4 + rand() * 0.8);
    const g = ctx.createLinearGradient(sx, y, sx, y + l);
    g.addColorStop(0, rgba(C.ombrePortee, 0.34));
    g.addColorStop(0.35, rgba(mix(C.ombrePortee, C.brunFougere, 0.4), 0.18));
    g.addColorStop(1, rgba(C.ombrePortee, 0));
    ctx.fillStyle = g;
    ctx.fillRect(sx - w * 0.12, y, Math.max(0.8, w * (0.16 + rand() * 0.26)), l);
  }
  ctx.restore();
}

function paintTown(
  ctx: CanvasRenderingContext2D,
  g: Geo,
  width: number,
  height: number,
  /** hauteur du plateau dans le repère du plan, imposée par la composition */
  plateauY: number,
  /** abscisse du bourg dans le repère du plan */
  cx: number,
): TownMeta {
  const rand = mulberry32(g.seed + 4242);
  const meta: TownMeta = { chimneys: [], banners: [], windows: [], towers: [] };
  /* Le bourg se mesure à l'échelle de composition : il doit tenir dans le
     cadre en portrait comme en paysage. */
  const scale = g.c;
  const px = (v: number): number => v * scale;
  /* Assiette : l'éperon occupe le tiers droit, le soleil vient de la gauche. */
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
  for (let i = 0; i < 5; i++) {
    const pan = new Path2D();
    const x0 = leftX - px(140) + i * px(160) + rand() * px(60);
    const largeur = px(180) + rand() * px(170);
    /* Le pan n'est pas un quadrilatère : son arête supérieure est brisée. */
    pan.moveTo(x0, height);
    pan.lineTo(x0 + largeur * 0.18, plateauY + px(26) + rand() * px(70));
    pan.lineTo(x0 + largeur * 0.44, plateauY + px(52) + rand() * px(60));
    pan.lineTo(x0 + largeur * 0.74, plateauY + px(44) + rand() * px(110));
    pan.lineTo(x0 + largeur, height);
    pan.closePath();
    /* Flouté : un plan de roche n'a pas d'arête vive à cette distance, et une
       facette franche se lit comme un polygone, pas comme du granit. */
    ctx.save();
    ctx.filter = `blur(${Math.max(1.5, px(4)).toFixed(1)}px)`;
    ctx.fillStyle = rgba(i % 2 === 0 ? tint(rock, 0.2) : shade(rock, 0.34), 0.34);
    ctx.fill(pan);
    ctx.restore();
    /* Seule l'arête au soleil est marquée, d'un fil chaud et non d'un cerne. */
    ctx.strokeStyle = rgba(C.lumiere, 0.1);
    ctx.lineWidth = Math.max(0.8, px(1.4));
    ctx.stroke(pan);
  }

  /*
   * Dalles du plateau. Le dessus de l'éperon était une nappe unie, et c'est
   * l'aplat le plus large du tableau. Le granit du Forez se débite en grandes
   * dalles séparées de fissures herbues : quelques joints obliques, un liseré
   * chaud sur leur lèvre nord-ouest, et la surface se met à porter la lumière.
   */
  for (let i = 0; i < 9; i++) {
    const dx = leftX - px(60) + i * px(120) + rand() * px(50);
    const dy = plateauY + px(6) + rand() * px(120);
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.bezierCurveTo(
      dx + px(70),
      dy + px(30) + rand() * px(28),
      dx + px(120),
      dy + px(60),
      dx + px(210) + rand() * px(120),
      dy + px(150) + rand() * px(70),
    );
    ctx.strokeStyle = rgba(contourOf(rock), 0.34);
    ctx.lineWidth = Math.max(0.7, px(1.6));
    ctx.stroke();
    ctx.strokeStyle = rgba(C.lumiere, 0.08);
    ctx.lineWidth = Math.max(0.5, px(1));
    ctx.translate(-px(1.6), -px(1.2));
    ctx.stroke();
    ctx.translate(px(1.6), px(1.2));
  }
  /* Touffes d'herbe rase dans les fissures : la roche n'est jamais stérile. */
  ctx.globalAlpha = 0.26;
  ctx.drawImage(
    tintMask(noiseMask(width, height, g.seed + 66, 18 * g.s, 0.3, 3.2), mix(C.mousseSombre, C.vertHetre, 0.34)),
    0,
    0,
  );
  ctx.globalAlpha = 1;

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

  /*
   * Ombre portée du bourg sur son plateau. Azimut 315°, donc vers le sud-est,
   * longue, bleutée, jamais noire (lois 2 et 3). Sans elle la citadelle est
   * *posée* sur la roche comme une découpe de papier : c'est l'ombre au sol,
   * bien plus que le contour, qui pose un bâtiment dans un paysage.
   */
  ctx.save();
  ctx.filter = `blur(${Math.max(2, px(8)).toFixed(1)}px)`;
  const ombreBourg = new Path2D();
  ombreBourg.moveTo(cx - px(232), plateauY + px(16));
  ombreBourg.lineTo(cx + px(244), plateauY + px(6));
  ombreBourg.lineTo(cx + px(336), plateauY + px(148));
  ombreBourg.lineTo(cx - px(96), plateauY + px(176));
  ombreBourg.closePath();
  ctx.fillStyle = rgba(C.ombrePortee, SUN.shadowOpacity * 1.3);
  ctx.fill(ombreBourg);
  ctx.filter = 'none';
  ctx.restore();

  /* — La courtine — */
  const wallLeft = cx - px(215);
  const wallRight = cx + px(215);
  const wallTop = plateauY - px(86);
  const wallBottom = plateauY + px(16);
  /* Le granit du Forez tourne au chamois sous une lumière rasante : une
     muraille strictement grise, au crépuscule, sonne faux. */
  const stone = mix(mix(C.granitClair, C.parcheminOmbre, 0.3), C.ocre, 0.24);

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

  const wallBox = { x: wallLeft, y: wallTop - px(20), w: wallRight - wallLeft, h: wallBottom - wallTop + px(20) };
  ctx.save();
  ctx.fillStyle = bodyGradient(ctx, wallLeft, wallTop, wallRight, wallBottom, stone, 0.3, 0.46);
  ctx.fill(wall);
  ctx.save();
  ctx.clip(wall);
  ashlar(ctx, wallLeft - px(4), wallTop - px(24), wallRight + px(4), wallBottom + px(4), stone, scale, g.seed + 311, {
    course: 12,
    stoneLen: 24,
    moss: 0.7,
  });
  /* Modelé général du front : le soleil rase la muraille par la gauche. */
  const front = ctx.createLinearGradient(wallLeft, wallTop, wallRight, wallBottom);
  front.addColorStop(0, rgba(C.lumiere, 0.2));
  front.addColorStop(0.36, rgba(C.lumiere, 0.03));
  front.addColorStop(0.75, rgba(C.ombre, 0.16));
  front.addColorStop(1, rgba(C.ombre, 0.34));
  ctx.fillStyle = front;
  ctx.fillRect(wallLeft - px(6), wallTop - px(26), wallRight - wallLeft + px(12), wallBottom - wallTop + px(32));
  /* Mâchicoulis : bande d'ombre sous le parapet. */
  const mach = ctx.createLinearGradient(0, wallTop, 0, wallTop + px(16));
  mach.addColorStop(0, rgba(C.ombrePortee, 0.55));
  mach.addColorStop(1, rgba(C.ombrePortee, 0));
  ctx.fillStyle = mach;
  ctx.fillRect(wallLeft, wallTop, wallRight - wallLeft, px(16));
  ctx.globalAlpha = 0.13;
  ctx.drawImage(tintMask(noiseMask(width, height, g.seed + 64, 10 * g.s, 0, 2), C.ombre), 0, 0);
  ctx.globalAlpha = 1;

  /* Archères, peintes dans le mur : elles y creusent, elles ne s'y posent pas. */
  for (let i = 0; i < 7; i++) {
    const ax = wallLeft + px(28) + i * px(52);
    grimeStreak(ctx, ax - px(2), wallTop + px(40), px(8), px(34), g.seed + i * 31);
    ctx.fillStyle = rgba(C.ombrePortee, 0.72);
    ctx.fillRect(ax, wallTop + px(24), px(3.4), px(16));
    ctx.fillStyle = rgba(C.lumiere, 0.14);
    ctx.fillRect(ax - px(1.4), wallTop + px(24), px(1.2), px(16));
    ctx.fillStyle = rgba(C.ombrePortee, 0.3);
    ctx.fillRect(ax + px(3.4), wallTop + px(24), px(1.2), px(16));
  }
  ctx.restore();
  tintedOutline(ctx, wall, stone, Math.max(0.8, px(1.2)));
  rimLight(ctx, wall, rimWidth(scale * 1.6), SUN.rimOpacity, wallBox);
  sunEdge(ctx, wall, rimWidth(scale * 1.4), 0.32, wallBox);
  ctx.restore();

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

  /**
   * Toit conique ou en bâtière : **ardoise du Forez**, posée en rangs à
   * recouvrement. Un triangle d'un seul dégradé serait un aplat de plus ; ce
   * sont les rangs et leur ombre portée qui font la couverture.
   */
  const roof = (path: Path2D, base: string, box: { x: number; y: number; w: number; h: number }): void => {
    ctx.save();
    ctx.fillStyle = bodyGradient(ctx, box.x, box.y, box.x + box.w, box.y + box.h, base, 0.18, 0.5);
    ctx.fill(path);
    ctx.save();
    ctx.clip(path);
    const rang = Math.max(1.6, px(5));
    const rand2 = mulberry32(g.seed + Math.round(box.x * 7 + box.y * 3));
    for (let y = box.y; y < box.y + box.h + rang; y += rang) {
      ctx.fillStyle = rgba(contourOf(base), 0.34);
      ctx.fillRect(box.x - px(4), y, box.w + px(8), Math.max(0.5, rang * 0.24));
      ctx.fillStyle = rgba(C.lumiere, 0.1);
      ctx.fillRect(box.x - px(4), y + rang * 0.24, box.w + px(8), Math.max(0.4, rang * 0.16));
      /* Un joint vertical sur deux rangs : les ardoises sont décalées. */
      if (rang > 3) {
        for (let x = box.x + rand2() * rang * 2; x < box.x + box.w; x += rang * (1.4 + rand2() * 0.8)) {
          ctx.fillStyle = rgba(contourOf(base), 0.2);
          ctx.fillRect(x, y, Math.max(0.4, rang * 0.14), rang);
        }
      }
    }
    /* Lumière rasante sur le versant nord-ouest, ombre franche sur l'autre. */
    const vers = ctx.createLinearGradient(box.x, box.y, box.x + box.w, box.y + box.h * 0.6);
    vers.addColorStop(0, rgba(C.lumiere, 0.2));
    vers.addColorStop(0.36, rgba(C.lumiere, 0));
    vers.addColorStop(1, rgba(C.ombrePortee, 0.52));
    ctx.fillStyle = vers;
    ctx.fillRect(box.x - px(6), box.y - px(6), box.w + px(12), box.h + px(12));
    ctx.restore();
    tintedOutline(ctx, path, base, Math.max(0.7, px(1.1)));
    rimLight(ctx, path, rimWidth(scale * 1.5), SUN.rimOpacity, box);
    sunEdge(ctx, path, rimWidth(scale * 1.3), 0.38, box);
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
    const tbox = { x: tx - w / 2, y: ty - h, w, h };
    ctx.save();
    ctx.fillStyle = bodyGradient(ctx, tx - w / 2, ty - h, tx + w / 2, ty, stone, 0.36, 0.5);
    ctx.fill(body);
    ctx.save();
    ctx.clip(body);
    ashlar(ctx, tx - w, ty - h - px(4), tx + w, ty + px(4), stone, scale, g.seed + Math.round(tx), {
      course: 11,
      stoneLen: 17,
      moss: 0.5,
    });
    /* Cylindre : le modelé va du clair au sombre en travers. */
    const cyl = ctx.createLinearGradient(tx - w / 2, 0, tx + w / 2, 0);
    cyl.addColorStop(0, rgba(C.lumiere, 0.24));
    cyl.addColorStop(0.32, rgba(C.lumiere, 0.05));
    cyl.addColorStop(0.72, rgba(C.ombre, 0.26));
    cyl.addColorStop(1, rgba(C.ombre, 0.5));
    ctx.fillStyle = cyl;
    ctx.fillRect(tx - w, ty - h - px(4), w * 2, h + px(8));
    /* Bandeau de larmier au tiers de la tour : elle a été surélevée un jour. */
    ctx.fillStyle = rgba(tint(stone, 0.16), 0.7);
    ctx.fillRect(tx - w, ty - h * 0.42, w * 2, Math.max(1, px(3)));
    ctx.fillStyle = rgba(contourOf(stone), 0.5);
    ctx.fillRect(tx - w, ty - h * 0.42 + Math.max(1, px(3)), w * 2, Math.max(0.8, px(1.6)));
    ctx.restore();
    tintedOutline(ctx, body, stone, Math.max(0.7, px(1.1)));
    rimLight(ctx, body, rimWidth(scale * 1.5), SUN.rimOpacity, tbox);
    ctx.restore();

    const cone = new Path2D();
    cone.moveTo(tx, ty - h - w * 1.05);
    cone.lineTo(tx + w * 0.72, ty - h + px(3));
    cone.lineTo(tx + w * 0.5, ty - h + px(6));
    cone.lineTo(tx - w * 0.5, ty - h + px(6));
    cone.lineTo(tx - w * 0.72, ty - h + px(3));
    cone.closePath();
    roof(cone, slate, { x: tx - w * 0.72, y: ty - h - w * 1.05, w: w * 1.44, h: w * 1.05 + px(6) });

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
  const keepBox = { x: keepX - keepW / 2, y: keepY - keepH, w: keepW, h: keepH };
  ctx.save();
  ctx.fillStyle = bodyGradient(ctx, keepX - keepW, keepY - keepH, keepX + keepW, keepY, stone, 0.34, 0.5);
  ctx.fill(keep);
  ctx.save();
  ctx.clip(keep);
  ashlar(ctx, keepX - keepW, keepY - keepH - px(4), keepX + keepW, keepY + px(4), stone, scale, g.seed + 407, {
    course: 14,
    stoneLen: 28,
    moss: 0.32,
  });
  /* Chaînage d'angle : de grands blocs longs, plus clairs, montent aux arêtes. */
  for (const cote of [-1, 1] as const) {
    for (let i = 0; i * px(28) < keepH; i++) {
      const y = keepY - px(6) - i * px(28);
      const bw = i % 2 === 0 ? px(20) : px(13);
      const bx = cote < 0 ? keepX - keepW / 2 : keepX + keepW / 2 - bw;
      ctx.fillStyle = rgba(tint(stone, 0.2), 0.6);
      ctx.fillRect(bx, y - px(26), bw, px(25));
      ctx.fillStyle = rgba(contourOf(stone), 0.4);
      ctx.fillRect(bx, y - px(2), bw, Math.max(0.7, px(1.4)));
    }
  }
  const keepShade = ctx.createLinearGradient(keepX - keepW / 2, 0, keepX + keepW / 2, 0);
  keepShade.addColorStop(0, rgba(C.lumiere, 0.26));
  keepShade.addColorStop(0.42, rgba(C.lumiere, 0.02));
  keepShade.addColorStop(1, rgba(C.ombre, 0.46));
  ctx.fillStyle = keepShade;
  ctx.fillRect(keepX - keepW, keepY - keepH - px(6), keepW * 2, keepH + px(12));
  ctx.restore();
  tintedOutline(ctx, keep, stone, Math.max(0.8, px(1.3)));
  rimLight(ctx, keep, rimWidth(scale * 1.7), SUN.rimOpacity, keepBox);
  sunEdge(ctx, keep, rimWidth(scale * 1.5), 0.34, keepBox);
  ctx.restore();

  const keepRoof = new Path2D();
  keepRoof.moveTo(keepX - keepW / 2 - px(12), keepY - keepH);
  keepRoof.lineTo(keepX, keepY - keepH - px(56));
  keepRoof.lineTo(keepX + keepW / 2 + px(12), keepY - keepH);
  keepRoof.closePath();
  roof(keepRoof, slate, {
    x: keepX - keepW / 2 - px(12),
    y: keepY - keepH - px(56),
    w: keepW + px(24),
    h: px(56),
  });
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
  const chapBox = { x: chapX - px(34), y: chapY - px(52), w: px(68), h: px(52) };
  const chapStone = mix(stone, C.parchemin, 0.2);
  ctx.save();
  ctx.fillStyle = bodyGradient(ctx, chapX - px(34), chapY - px(52), chapX + px(34), chapY, chapStone, 0.32, 0.44);
  ctx.fill(chapel);
  ctx.save();
  ctx.clip(chapel);
  ashlar(ctx, chapX - px(36), chapY - px(54), chapX + px(36), chapY + px(2), chapStone, scale, g.seed + 519, {
    course: 9,
    stoneLen: 15,
    moss: 0.6,
  });
  /* Baie en plein cintre, encadrée de claveaux clairs. */
  ctx.fillStyle = rgba(shade(C.bleuProfond, 0.34), 0.8);
  ctx.beginPath();
  ctx.ellipse(chapX, chapY - px(30), px(7), px(11), 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = rgba(tint(chapStone, 0.3), 0.7);
  ctx.lineWidth = Math.max(0.7, px(2));
  ctx.stroke();
  grimeStreak(ctx, chapX - px(7), chapY - px(19), px(14), px(20), g.seed + 77);
  ctx.restore();
  tintedOutline(ctx, chapel, stone, Math.max(0.6, px(0.9)));
  rimLight(ctx, chapel, rimWidth(scale * 1.3), SUN.rimOpacity, chapBox);
  ctx.restore();
  const spire = new Path2D();
  spire.moveTo(chapX - px(40), chapY - px(52));
  spire.lineTo(chapX, chapY - px(118));
  spire.lineTo(chapX + px(40), chapY - px(52));
  spire.closePath();
  roof(spire, mix(slate, C.mousseSombre, 0.22), { x: chapX - px(40), y: chapY - px(118), w: px(80), h: px(66) });
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
    const houseBox = { x: hx - hw / 2, y: hy - hh, w: hw, h: hh };
    ctx.save();
    ctx.fillStyle = bodyGradient(ctx, hx - hw / 2, hy - hh, hx + hw / 2, hy, wallColor, 0.2 + rand() * 0.24, 0.44 + rand() * 0.2);
    ctx.fill(house);
    ctx.save();
    ctx.clip(house);
    /* Torchis sur solin de pierre : le bas du mur est appareillé, le haut est
       enduit et lavé de pluie. Deux matières, jamais une seule. */
    ashlar(ctx, hx - hw / 2, hy - hh * 0.36, hx + hw / 2, hy + px(2), mix(wallColor, C.granitAnthracite, 0.5), scale, g.seed + i * 61, {
      course: 7,
      stoneLen: 11,
      moss: 0.8,
    });
    ctx.globalAlpha = 0.22;
    ctx.drawImage(
      tintMask(noiseMask(Math.ceil(hw) + 2, Math.ceil(hh) + 2, g.seed + i * 13, px(9), 0.06, 2.4), C.ombrePortee),
      hx - hw / 2,
      hy - hh,
    );
    ctx.globalAlpha = 1;
    /* Colombage : deux poteaux et une écharpe, à peine marqués. */
    if (rand() > 0.45) {
      ctx.strokeStyle = rgba(shade(C.brunFougere, 0.3), 0.5);
      ctx.lineWidth = Math.max(0.7, px(2.2));
      ctx.beginPath();
      ctx.moveTo(hx - hw * 0.26, hy - hh + px(3));
      ctx.lineTo(hx - hw * 0.26, hy - hh * 0.36);
      ctx.moveTo(hx + hw * 0.26, hy - hh + px(3));
      ctx.lineTo(hx + hw * 0.26, hy - hh * 0.36);
      ctx.moveTo(hx - hw * 0.26, hy - hh * 0.36);
      ctx.lineTo(hx + hw * 0.26, hy - hh + px(3));
      ctx.stroke();
    }
    /* Ombre de l'avant-toit : c'est elle qui fait tenir le toit sur le mur. */
    const avant = ctx.createLinearGradient(0, hy - hh, 0, hy - hh + px(14));
    avant.addColorStop(0, rgba(C.ombrePortee, 0.56));
    avant.addColorStop(1, rgba(C.ombrePortee, 0));
    ctx.fillStyle = avant;
    ctx.fillRect(hx - hw, hy - hh, hw * 2, px(14));
    ctx.restore();
    tintedOutline(ctx, house, wallColor, Math.max(0.5, px(0.8)));
    rimLight(ctx, house, rimWidth(scale * 1.2), SUN.rimOpacity, houseBox);
    ctx.restore();
    const faitage = px(19) + rand() * px(8);
    const hroof = new Path2D();
    hroof.moveTo(hx - hw / 2 - px(5), hy - hh);
    hroof.lineTo(hx, hy - hh - faitage);
    hroof.lineTo(hx + hw / 2 + px(5), hy - hh);
    hroof.closePath();
    roof(hroof, mix(slate, C.brunFougere, rand() * 0.3), {
      x: hx - hw / 2 - px(5),
      y: hy - hh - faitage,
      w: hw + px(10),
      h: faitage,
    });
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

  /*
   * Brume qui monte du pied de l'éperon. Elle **s'arrête** : étalée jusqu'au
   * bas du plan, elle recouvrait tout le tiers inférieur du tableau d'une
   * nappe grise uniforme — un aplat, et le pire des aplats puisqu'il tuait la
   * séparation entre la vallée et le premier plan.
   */
  const brumeHaut = plateauY + px(90);
  const brumeBas = Math.min(height, plateauY + px(340));
  if (brumeBas > brumeHaut) {
    const foot = ctx.createLinearGradient(0, brumeHaut, 0, brumeBas);
    foot.addColorStop(0, rgba(C.bleuBrume, 0));
    foot.addColorStop(0.5, rgba(C.bleuBrume, 0.13));
    foot.addColorStop(1, rgba(C.bleuBrume, 0.2));
    ctx.fillStyle = foot;
    ctx.fillRect(0, brumeHaut, width, brumeBas - brumeHaut);
  }

  /* Perspective atmosphérique du plan : le bourg est proche, la dose est faible. */
  ctx.save();
  ctx.globalAlpha = 0.045;
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

    /*
     * ## Composition
     *
     * Le portrait n'est **pas** le paysage recadré. En paysage le titre et le
     * menu occupent la colonne de gauche et le bourg respire à droite ; en
     * portrait ils occupent le haut et le bas, et le tableau doit se replier
     * dans la bande intermédiaire.
     *
     * D'où deux jeux de repères, et non un seul multiplié par un facteur :
     *
     * | | paysage | portrait |
     * |---|---|---|
     * | horizon | 0,60 h | 0,455 h |
     * | plateau du bourg | 0,72 h | 0,555 h |
     * | axe du bourg | 0,62 w | 0,50 w |
     * | soleil | 0,21 w | 0,24 w |
     *
     * En portrait, le bourg est **centré** : décentré, il tomberait sous une
     * colonne de boutons qui, elle, tient toute la largeur.
     */
    const portrait = cssH > cssW;
    const horizon = h * (portrait ? 0.455 : 0.6);
    geo = {
      w,
      h,
      horizon,
      sunX: w * (portrait ? 0.24 : 0.21),
      sunY: horizon - h * (portrait ? 0.055 : 0.075),
      m: Math.round(Math.max(26, w * 0.03)),
      s: Math.max(0.55, Math.min(2, h / 900)),
      /* L'échelle de composition se cale sur la dimension **contraignante** :
         la hauteur en paysage, la largeur en portrait. */
      c: portrait
        ? Math.max(0.3, Math.min(1.6, Math.min(h / 1500, w / 820)))
        : Math.max(0.3, Math.min(1.6, Math.min(h / 900, w / 1150))),
      seed,
    };
    const m = geo.m;
    /* Plateau du bourg et axe du bourg, en pixels de rendu absolus. */
    const plateauAbs = h * (portrait ? 0.555 : 0.72);
    const townCx = w * (portrait ? 0.5 : 0.62);

    /* Plan 1 — le ciel et ses nuages. */
    const sky: Layer = { canvas: paintSky(geo), x: 0, y: 0, depth: 0 };
    /*
     * Les deux plans de nuages couvrent tout le ciel et s'effacent avant leur
     * bord inférieur : une bande courte, comme il y en avait une, laissait une
     * arête horizontale nette au tiers du ciel.
     */
    const cirrusH = Math.ceil(horizon * 1.15);
    const cirrus: Layer = {
      canvas: paintClouds(geo, w + m * 2, cirrusH, {
        count: Math.max(3, Math.round(p.clouds * 0.4)),
        yMin: cirrusH * 0.08,
        yMax: cirrusH * 0.42,
        bias: 1.7,
        rMin: 34,
        rMax: 96,
        flatten: 0.16,
        distance: 1250,
        erosion: 0.92,
        seed: seed + 301,
        kind: 'cirrus',
      }),
      x: -m,
      y: 0,
      depth: 2.5,
      drift: 1.6,
      alpha: 0.72,
    };
    const cumulusH = Math.ceil(horizon * 1.15);
    const cumulus: Layer = {
      canvas: paintClouds(geo, w + m * 2, cumulusH, {
        /* Un ciel de crépuscule respire : la moitié de la voûte reste nue,
           sans quoi le couvert mange la lumière rasante qui fait le tableau. */
        count: Math.max(4, Math.round(p.clouds * 0.5)),
        yMin: cumulusH * 0.2,
        yMax: cumulusH * 0.56,
        bias: 0.62,
        rMin: 38,
        rMax: 104,
        flatten: 0.5,
        distance: 880,
        erosion: 0.86,
        seed: seed + 302,
        kind: 'cumulus',
      }),
      x: -m,
      y: 0,
      depth: 4,
      drift: 3.4,
      alpha: 0.92,
    };

    /*
     * ## Plans 2 et 3 — crêtes et sapinières
     *
     * **La couture horizontale.** Chaque plan est peint dans un tampon puis
     * collé à une hauteur donnée. Tant que ces tampons commençaient à une
     * fraction *fixe* de l'écran, il suffisait qu'un sommet passe au-dessus du
     * bord pour que le remplissage opaque démarre sur ce bord : l'écran était
     * barré d'un trait net, sur toute sa largeur, à la hauteur exacte du bord
     * de la bande — spectaculaire en portrait, où les crêtes montent haut et
     * tranchent sur la futaie sombre du plan suivant.
     *
     * La hauteur de chaque bande est donc calculée **sur le relief réel** :
     * `ridgeCeiling` donne le sommet du profil, on remonte encore d'une marge
     * (et, pour la sapinière, de la hauteur du plus grand sapin, qui déborde
     * de sa crête). Un plan ne peut plus se faire couper.
     */
    const specs: RidgeSpec[] = portrait
      ? [
          { base: 0.80, amp: 0.115, freq: 2.1, color: mix(C.bleuProfond, C.bleuBrume, 0.42), distance: 620, haze: 0.2, seed: seed + 5 },
          { base: 0.90, amp: 0.135, freq: 2.7, color: mix(C.bleuProfond, C.granitAnthracite, 0.4), distance: 380, haze: 0.14, seed: seed + 6, treeline: 0.5, wood: mix(C.vertSapin, C.bleuProfond, 0.46) },
          { base: 1.0, amp: 0.155, freq: 1.6, color: mix(C.vertSapin, C.bleuProfond, 0.34), distance: 210, haze: 0.08, seed: seed + 7, treeline: 0.34, wood: mix(C.vertSapin, C.mousseSombre, 0.26) },
        ]
      : [
          { base: 0.78, amp: 0.16, freq: 2.3, color: mix(C.bleuProfond, C.bleuBrume, 0.42), distance: 620, haze: 0.22, seed: seed + 5 },
          { base: 0.87, amp: 0.21, freq: 3.1, color: mix(C.bleuProfond, C.granitAnthracite, 0.4), distance: 380, haze: 0.15, seed: seed + 6, treeline: 0.52, wood: mix(C.vertSapin, C.bleuProfond, 0.46) },
          { base: 0.97, amp: 0.25, freq: 1.7, color: mix(C.vertSapin, C.bleuProfond, 0.34), distance: 210, haze: 0.09, seed: seed + 7, treeline: 0.36, wood: mix(C.vertSapin, C.mousseSombre, 0.26) },
        ];
    const midSpec: RidgeSpec = {
      base: portrait ? 1.12 : 1.03,
      amp: portrait ? 0.13 : 0.2,
      freq: 1.25,
      color: mix(C.vertSapin, C.granitAnthracite, 0.2),
      distance: 220,
      haze: 0.1,
      seed: seed + 8,
      /* Masse boisée sous la crête : les sapins dessinés se posent dessus au
         lieu de se découper sur une pente nue, qui les faisait flotter. */
      treeline: 0.22,
      wood: mix(C.vertSapin, C.encre, 0.24),
    };

    /* Hauteur du plus grand sapin : la sapinière déborde de sa propre crête. */
    const firBase = h * (portrait ? 0.052 : 0.062);
    const marge = Math.round(h * 0.03);

    /* Plan 2 — les crêtes lointaines. */
    const farTop = Math.max(
      0,
      Math.round(Math.min(...specs.map((s) => ridgeCeiling(s, geo, -m, w + m))) - marge),
    );
    const farLayer = surface(w + m * 2, h - farTop + m);
    const farCtx = context2d(farLayer);
    /*
     * Trois arêtes, du plus lointain au plus proche. La valeur descend et la
     * saturation monte à chaque plan : c'est cet écart, plus que la brume,
     * qui donne la profondeur. Trop de brume aplatit tout en bleu pâle.
     */
    for (const spec of specs) paintRidge(farCtx, spec, geo, -m, farTop, w + m * 2, h - farTop + m);
    const far: Layer = { canvas: farLayer, x: -m, y: farTop, depth: 6 };

    /* Plan 3 — les sapinières moyennes. */
    const midTop = Math.max(
      0,
      Math.round(ridgeCeiling(midSpec, geo, -m, w + m) - firBase * 1.5 - marge),
    );
    const midLayer = surface(w + m * 2, h - midTop + m);
    const midCtx = context2d(midLayer);
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

    /*
     * ## La sapinière
     *
     * Quatre rangs, du plus lointain au plus proche. Chaque rang a ses propres
     * silhouettes, pré-rendues **à leur taille d'affichage** et à leur
     * distance : la désaturation est cuite dans le lutin, jamais posée en
     * voile uniforme par-dessus, qui effacerait tout le modelé.
     *
     * Trois précautions contre le motif répété, qui était très lisible :
     *
     *  - **quatorze** silhouettes par rang au lieu de cinq, toutes tirées de
     *    graines différentes (élancement, inclinaison, étages, valeur) ;
     *  - la **densité suit un bruit** : les sapins se groupent en bosquets et
     *    laissent des clairières, au lieu de border la crête comme un peigne ;
     *  - chaque rang se termine par un **voile de lisière** flouté qui noie sa
     *    base dans le rang suivant : aucune ligne d'arbres ne s'arrête net.
     */
    const firRand = mulberry32(seed + 909);
    const count = p.firs;
    const rows: { yOff: number; hauteur: number; dist: number; densite: number }[] = [
      { yOff: -h * 0.004, hauteur: firBase * 0.4, dist: 720, densite: 1 },
      { yOff: h * 0.018, hauteur: firBase * 0.58, dist: 520, densite: 0.92 },
      { yOff: h * 0.05, hauteur: firBase * 0.82, dist: 320, densite: 0.8 },
      { yOff: h * 0.098, hauteur: firBase * 1.2, dist: 150, densite: 0.66 },
    ];
    const nDensite = makeNoise1D(seed + 4711);
    for (let r = 0; r < rows.length; r++) {
      const row = rows[r];
      const sprites: HTMLCanvasElement[] = [];
      for (let i = 0; i < 14; i++) {
        sprites.push(firSprite(row.hauteur * (0.62 + (i / 13) * 0.86), seed + 2000 + r * 137 + i * 7, row.dist));
      }
      const n = Math.max(6, Math.round((count / rows.length) * row.densite));
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5 + (firRand() - 0.5) * 1.7) / n) * (w + m * 2);
        /* Bosquets et clairières : sous le seuil, l'arbre n'est pas planté. */
        const dens = fbm1(nDensite, x / (w * 0.11) + r * 31, 3) * 0.5 + 0.5;
        if (dens < 0.3 && firRand() > 0.3) continue;
        const sprite = sprites[Math.floor(firRand() * sprites.length)];
        const sc = 0.82 + firRand() * 0.42;
        const sw = sprite.width * sc;
        const sh = sprite.height * sc;
        const y = midLine(x) + row.yOff + firRand() * h * 0.016;
        midCtx.save();
        /* Ombre portée au sol, vers le sud-est, bleutée. */
        midCtx.globalAlpha = 0.22;
        midCtx.fillStyle = C.ombrePortee;
        midCtx.beginPath();
        midCtx.ellipse(x + sh * 0.14, y, sw * 0.44, sh * 0.05, 0, 0, Math.PI * 2);
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
      /* Lisière : la base du rang se dissout dans l'air du rang suivant. */
      if (r < rows.length - 1) {
        const y0 = midLine(w * 0.5) + row.yOff - row.hauteur * 0.2;
        const y1 = midLine(w * 0.5) + row.yOff + row.hauteur * 0.55;
        const lg = midCtx.createLinearGradient(0, y0, 0, y1);
        lg.addColorStop(0, rgba(mix(C.bleuBrume, C.ocre, 0.24), 0));
        lg.addColorStop(1, rgba(mix(C.bleuBrume, C.ocre, 0.24), 0.075 - r * 0.018));
        midCtx.save();
        midCtx.globalCompositeOperation = 'source-atop';
        midCtx.fillStyle = lg;
        midCtx.fillRect(0, y0, midLayer.width, y1 - y0);
        midCtx.restore();
      }
    }
    /*
     * Fond de vallée. Sous la dernière rangée, le versant descend vers un
     * bassin **boisé et à l'ombre** : c'est le point le plus sombre de tout le
     * lointain, et c'est lui qui fait ressortir la citadelle. Sans lui, le bas
     * du plan restait une nappe gris-vert uniforme — un aplat qui occupait un
     * bon tiers du tableau.
     */
    const valleeHaut = midLine(w * 0.5) + rows[rows.length - 1].yOff + firBase * 0.5;
    if (valleeHaut < midLayer.height) {
      midCtx.save();
      midCtx.globalCompositeOperation = 'source-atop';
      const vg = midCtx.createLinearGradient(0, valleeHaut, 0, midLayer.height);
      vg.addColorStop(0, rgba(mix(C.vertSapin, C.bleuProfond, 0.4), 0));
      vg.addColorStop(0.45, rgba(mix(C.vertSapin, C.bleuProfond, 0.34), 0.44));
      vg.addColorStop(1, rgba(mix(mix(C.vertSapin, C.encre, 0.42), C.ombre, 0.16), 0.82));
      midCtx.fillStyle = vg;
      midCtx.fillRect(0, valleeHaut, midLayer.width, midLayer.height - valleeHaut);
      /* Futaie lointaine, en masses : la vallée n'est pas une nappe. */
      midCtx.globalAlpha = 0.26;
      midCtx.drawImage(
        tintMask(
          noiseMask(midLayer.width, midLayer.height, seed + 84, 26 * geo.s, 0.18, 2.7),
          mix(C.vertSapin, C.encre, 0.5),
        ),
        0,
        0,
      );
      midCtx.globalAlpha = 0.14;
      midCtx.drawImage(
        tintMask(
          noiseMask(midLayer.width, midLayer.height, seed + 85, 84 * geo.s, 0.02, 2),
          mix(C.bleuBrume, C.ocre, 0.3),
        ),
        0,
        0,
      );
      midCtx.restore();
    }
    const mid: Layer = { canvas: midLayer, x: -m, y: midTop, depth: 9 };

    /*
     * Plan 4 — le bourg fortifié.
     *
     * La bande commence au-dessus du sommet du plus haut mât, jamais à une
     * fraction fixe : c'est la même règle que pour les crêtes. La hauteur
     * bâtie au-dessus du plateau vaut à peu près 420 unités de composition
     * (courtine 86, donjon 18 + 178, toiture 56, mât et bannière 60).
     */
    const bati = 430 * geo.c;
    const townTop = Math.max(0, Math.round(plateauAbs - bati - marge));
    const townCanvas = surface(w + m * 2, h - townTop + m);
    const townCtx = context2d(townCanvas);
    townMeta = paintTown(
      townCtx,
      geo,
      w + m * 2,
      h - townTop + m,
      plateauAbs - townTop,
      townCx + m,
    );
    townLayer = { canvas: townCanvas, x: -m, y: townTop, depth: 11.5 };

    /* Plan 5 — le premier plan, en deux nappes décalées. */
    const fgFarTop = Math.round(h - h * (portrait ? 0.3 : 0.34));
    const fgFarCanvas = surface(w + m * 2, h - fgFarTop + m);
    paintForeground(context2d(fgFarCanvas), geo, w + m * 2, h - fgFarTop + m, false);
    const fgFar: Layer = { canvas: fgFarCanvas, x: -m, y: fgFarTop, depth: 15 };

    const fgNearTop = Math.round(h - h * (portrait ? 0.22 : 0.26));
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
