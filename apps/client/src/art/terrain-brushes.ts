/**
 * Pinceaux de matière du terrain.
 *
 * Six matières répétables sans couture visible : herbe, aiguilles, roche,
 * tourbe, gravier, eau. Chacune est produite une fois au chargement dans un
 * canvas dont la périodicité est garantie par `valueNoise(x, y, période)` et
 * par le tracé neuf fois décalé (3 × 3) des détails vectoriels.
 *
 * Ce sont des textures **pleines** (elles portent la teinte), contrairement aux
 * matières de `shading.ts` qui sont des voiles à composer par-dessus.
 */
import { Texture } from 'pixi.js';
import { LIGHT, PALETTE, cssAlpha, melanger } from './palette.js';
import { fbm, hash2, prng, ridged, valueNoise } from './noise.js';

export type TerrainBrushKey =
  | 'herbe'
  | 'aiguilles'
  | 'roche'
  | 'tourbe'
  | 'gravier'
  | 'eau';

export const TERRAIN_BRUSH_KEYS: readonly TerrainBrushKey[] = [
  'herbe',
  'aiguilles',
  'roche',
  'tourbe',
  'gravier',
  'eau',
];

export const TERRAIN_BRUSH_LABELS: Readonly<Record<TerrainBrushKey, string>> = {
  herbe: 'Herbe de pâture',
  aiguilles: 'Tapis d’aiguilles',
  roche: 'Dalle de granit',
  tourbe: 'Tourbe des Sagnes',
  gravier: 'Gravier de chemin',
  eau: 'Eau de la Durolle',
};

/** Quelle matière peindre pour chacun des huit terrains du moteur. */
export const TERRAIN_TO_BRUSH: Readonly<Record<string, TerrainBrushKey>> = {
  route: 'gravier',
  chemin: 'gravier',
  prairie: 'herbe',
  foret: 'aiguilles',
  pente: 'roche',
  humide: 'tourbe',
  rocher: 'roche',
  eau: 'eau',
};

const TAILLE = 128;

type Ctx2D = CanvasRenderingContext2D;

function canvas(size: number): { el: HTMLCanvasElement; ctx: Ctx2D } {
  if (typeof document === 'undefined') {
    throw new Error("Les pinceaux de terrain requièrent un navigateur : aucun document disponible.");
  }
  const el = document.createElement('canvas');
  el.width = size;
  el.height = size;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('Contexte 2D indisponible : impossible de générer les pinceaux.');
  return { el, ctx };
}

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

function texture(el: HTMLCanvasElement, label: string): Texture {
  const t = Texture.from(el);
  t.source.addressMode = 'repeat';
  t.source.scaleMode = 'linear';
  t.source.label = `pinceau_${label}`;
  return t;
}

interface Champ {
  /** teinte pour une valeur de bruit 0..1 */
  couleur: (v: number, x: number, y: number) => number;
  /** bruit de base */
  bruit: (x: number, y: number) => number;
}

/** Remplit le canvas pixel par pixel à partir d'un champ périodique. */
function peindreChamp(ctx: Ctx2D, size: number, champ: Champ): void {
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const i = (y * size + x) * 4;
      const v = champ.bruit(x, y);
      const c = champ.couleur(v, x, y);
      d[i] = (c >> 16) & 0xff;
      d[i + 1] = (c >> 8) & 0xff;
      d[i + 2] = c & 0xff;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

/**
 * Modelé directionnel : la lumière vient du nord-ouest, donc la pente
 * ascendante vers le nord-ouest s'éclaire et la pente opposée se refroidit.
 * On dérive le bruit et on applique le même vecteur que partout ailleurs.
 */
function modeler(base: number, bruit: (x: number, y: number) => number, x: number, y: number, force: number): number {
  const dx = bruit(x + 1, y) - bruit(x - 1, y);
  const dy = bruit(x, y + 1) - bruit(x, y - 1);
  // produit scalaire avec le vecteur vers le soleil (−0,707 ; −0,707)
  const n = (-dx - dy) * 0.7071;
  const k = Math.max(-1, Math.min(1, n * force));
  return k >= 0 ? melanger(base, LIGHT.chaude, k * 0.34) : melanger(base, LIGHT.froide, -k * 0.38);
}

/* ─────────────────────────────── Herbe ──────────────────────────────────── */

function brosseHerbe(): Texture {
  const { el, ctx } = canvas(TAILLE);
  const bruit = (x: number, y: number): number =>
    fbm(x / 16, y / 16, TAILLE / 16, 2213, 4) * 0.72 + valueNoise(x / 4, y / 4, TAILLE / 4, 991) * 0.28;
  peindreChamp(ctx, TAILLE, {
    bruit,
    couleur: (v, x, y) => {
      const base = melanger(PALETTE.vertHetre, v > 0.55 ? PALETTE.ocre : PALETTE.mousseSombre, Math.abs(v - 0.55) * 1.1);
      return modeler(base, bruit, x, y, 7);
    },
  });
  const rand = prng(7717);
  sansCouture(ctx, TAILLE, (c) => {
    for (let i = 0; i < 260; i += 1) {
      const x = rand() * TAILLE;
      const y = rand() * TAILLE;
      const h = 3 + rand() * 6;
      const pen = (rand() - 0.5) * 3;
      const clair = rand() > 0.48;
      c.strokeStyle = cssAlpha(
        clair ? melanger(PALETTE.vertHetre, LIGHT.chaude, 0.45) : melanger(PALETTE.mousseSombre, LIGHT.froide, 0.3),
        0.2 + rand() * 0.3,
      );
      c.lineWidth = 0.7 + rand() * 0.7;
      c.beginPath();
      c.moveTo(x, y);
      c.quadraticCurveTo(x + pen * 0.5, y - h * 0.6, x + pen, y - h);
      c.stroke();
    }
    // fleurs de pâture, rares
    for (let i = 0; i < 8; i += 1) {
      const x = rand() * TAILLE;
      const y = rand() * TAILLE;
      c.fillStyle = cssAlpha(rand() > 0.5 ? PALETTE.parchemin : PALETTE.ocre, 0.42);
      c.beginPath();
      c.ellipse(x, y, 1 + rand(), 1 + rand(), rand() * 3, 0, Math.PI * 2);
      c.fill();
    }
  });
  return texture(el, 'herbe');
}

/* ───────────────────────────── Aiguilles ────────────────────────────────── */

function brosseAiguilles(): Texture {
  const { el, ctx } = canvas(TAILLE);
  const bruit = (x: number, y: number): number =>
    fbm(x / 20, y / 20, TAILLE / 20, 4409, 4) * 0.66 + ridged(x / 6, y / 5, TAILLE / 6, 331, 2) * 0.34;
  peindreChamp(ctx, TAILLE, {
    bruit,
    couleur: (v, x, y) => {
      const base = melanger(
        PALETTE.brunFougere,
        v > 0.5 ? PALETTE.ocre : PALETTE.vertSapin,
        Math.abs(v - 0.5) * 1.25,
      );
      return modeler(melanger(base, PALETTE.mousseSombre, 0.22), bruit, x, y, 6);
    },
  });
  const rand = prng(1231);
  sansCouture(ctx, TAILLE, (c) => {
    for (let i = 0; i < 320; i += 1) {
      const x = rand() * TAILLE;
      const y = rand() * TAILLE;
      const a = rand() * Math.PI * 2;
      const L = 3 + rand() * 7;
      c.strokeStyle = cssAlpha(
        rand() > 0.5 ? melanger(PALETTE.brunFougere, LIGHT.chaude, 0.4) : melanger(PALETTE.vertSapin, LIGHT.froide, 0.25),
        0.22 + rand() * 0.3,
      );
      c.lineWidth = 0.6 + rand() * 0.6;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L);
      c.stroke();
    }
    // cônes et brindilles
    for (let i = 0; i < 10; i += 1) {
      const x = rand() * TAILLE;
      const y = rand() * TAILLE;
      c.fillStyle = cssAlpha(melanger(PALETTE.brunFougere, PALETTE.granitAnthracite, 0.4), 0.5);
      c.beginPath();
      c.ellipse(x, y, 1.4 + rand() * 1.4, 2.4 + rand() * 2, rand() * 3, 0, Math.PI * 2);
      c.fill();
    }
  });
  return texture(el, 'aiguilles');
}

/* ─────────────────────────────── Roche ──────────────────────────────────── */

function brosseRoche(): Texture {
  const { el, ctx } = canvas(TAILLE);
  const bruit = (x: number, y: number): number =>
    fbm(x / 14, y / 14, TAILLE / 14, 8081, 4) * 0.6 + hash2(x, y, 5501) * 0.18 + ridged(x / 26, y / 22, TAILLE / 26, 617, 2) * 0.22;
  peindreChamp(ctx, TAILLE, {
    bruit,
    couleur: (v, x, y) => {
      const base = melanger(PALETTE.granitClair, v > 0.52 ? PALETTE.parcheminOmbre : PALETTE.granitAnthracite, Math.abs(v - 0.52) * 1.4);
      return modeler(base, bruit, x, y, 9);
    },
  });
  const rand = prng(3607);
  sansCouture(ctx, TAILLE, (c) => {
    // diaclases : le granit se lit en plans
    for (let i = 0; i < 7; i += 1) {
      const x = rand() * TAILLE;
      const y = rand() * TAILLE;
      const a = rand() * Math.PI;
      c.strokeStyle = cssAlpha(melanger(PALETTE.granitAnthracite, LIGHT.froide, 0.4), 0.3 + rand() * 0.2);
      c.lineWidth = 0.9 + rand() * 1.4;
      c.beginPath();
      c.moveTo(x - Math.cos(a) * 70, y - Math.sin(a) * 70);
      let px = x - Math.cos(a) * 70;
      let py = y - Math.sin(a) * 70;
      for (let s = 0; s < 10; s += 1) {
        px += Math.cos(a + (rand() - 0.5) * 0.5) * 14;
        py += Math.sin(a + (rand() - 0.5) * 0.5) * 14;
        c.lineTo(px, py);
      }
      c.stroke();
      // lèvre éclairée du plan, côté nord-ouest
      c.strokeStyle = cssAlpha(melanger(PALETTE.granitClair, LIGHT.chaude, 0.5), 0.24);
      c.lineWidth = 0.8;
      c.beginPath();
      c.moveTo(x - Math.cos(a) * 70 - 1.2, y - Math.sin(a) * 70 - 1.2);
      c.lineTo(px - 1.2, py - 1.2);
      c.stroke();
    }
    for (let i = 0; i < 60; i += 1) {
      const x = rand() * TAILLE;
      const y = rand() * TAILLE;
      c.fillStyle = cssAlpha(rand() > 0.5 ? LIGHT.chaude : PALETTE.mousseSombre, 0.14 + rand() * 0.16);
      c.beginPath();
      c.ellipse(x, y, 0.8 + rand() * 1.6, 0.7 + rand() * 1.3, rand() * 3, 0, Math.PI * 2);
      c.fill();
    }
  });
  return texture(el, 'roche');
}

/* ─────────────────────────────── Tourbe ─────────────────────────────────── */

function brosseTourbe(): Texture {
  const { el, ctx } = canvas(TAILLE);
  const bruit = (x: number, y: number): number =>
    fbm(x / 18, y / 18, TAILLE / 18, 6221, 5) * 0.78 + valueNoise(x / 5, y / 7, TAILLE / 5, 149) * 0.22;
  peindreChamp(ctx, TAILLE, {
    bruit,
    couleur: (v, x, y) => {
      const base =
        v > 0.6
          ? melanger(PALETTE.mousseSombre, PALETTE.vertHetre, (v - 0.6) * 2.2)
          : melanger(PALETTE.brunFougere, PALETTE.bleuProfond, (0.6 - v) * 1.1);
      return modeler(base, bruit, x, y, 5);
    },
  });
  const rand = prng(9013);
  sansCouture(ctx, TAILLE, (c) => {
    // flaques d'eau noire, reflet clair côté lumière
    for (let i = 0; i < 9; i += 1) {
      const x = rand() * TAILLE;
      const y = rand() * TAILLE;
      const rx = 4 + rand() * 10;
      const ry = rx * (0.4 + rand() * 0.4);
      c.fillStyle = cssAlpha(melanger(PALETTE.bleuProfond, PALETTE.granitAnthracite, 0.35), 0.5);
      c.beginPath();
      c.ellipse(x, y, rx, ry, rand() * 3, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = cssAlpha(melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.4), 0.32);
      c.lineWidth = 1;
      c.beginPath();
      c.ellipse(x - 0.8, y - 0.8, rx * 0.92, ry * 0.9, rand() * 3, Math.PI * 0.9, Math.PI * 1.9);
      c.stroke();
    }
    // touffes de linaigrette
    for (let i = 0; i < 46; i += 1) {
      const x = rand() * TAILLE;
      const y = rand() * TAILLE;
      c.strokeStyle = cssAlpha(melanger(PALETTE.parchemin, PALETTE.vertHetre, 0.35), 0.3 + rand() * 0.24);
      c.lineWidth = 0.7;
      for (let j = 0; j < 3; j += 1) {
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x + (rand() - 0.5) * 5, y - 3 - rand() * 4);
        c.stroke();
      }
    }
  });
  return texture(el, 'tourbe');
}

/* ─────────────────────────────── Gravier ────────────────────────────────── */

function brosseGravier(): Texture {
  const { el, ctx } = canvas(TAILLE);
  const bruit = (x: number, y: number): number =>
    fbm(x / 10, y / 10, TAILLE / 10, 1487, 3) * 0.55 + hash2(x, y, 727) * 0.45;
  peindreChamp(ctx, TAILLE, {
    bruit,
    couleur: (v, x, y) => {
      const base = melanger(PALETTE.brunFougere, v > 0.5 ? PALETTE.parcheminOmbre : PALETTE.granitAnthracite, Math.abs(v - 0.5) * 1.3);
      return modeler(melanger(base, PALETTE.ocre, 0.16), bruit, x, y, 6);
    },
  });
  const rand = prng(2903);
  sansCouture(ctx, TAILLE, (c) => {
    for (let i = 0; i < 150; i += 1) {
      const x = rand() * TAILLE;
      const y = rand() * TAILLE;
      const r = 0.8 + rand() * 2.4;
      const teinte = rand();
      c.fillStyle = cssAlpha(
        teinte > 0.66 ? melanger(PALETTE.granitClair, LIGHT.chaude, 0.35) : teinte > 0.33 ? PALETTE.granitClair : PALETTE.granitAnthracite,
        0.34 + rand() * 0.3,
      );
      c.beginPath();
      c.ellipse(x, y, r, r * (0.6 + rand() * 0.5), rand() * 3, 0, Math.PI * 2);
      c.fill();
      // ombre bleutée au sud-est de chaque caillou
      c.fillStyle = cssAlpha(LIGHT.ombrePortee, 0.2);
      c.beginPath();
      c.ellipse(x + r * 0.5, y + r * 0.45, r * 0.7, r * 0.4, 0.78, 0, Math.PI * 2);
      c.fill();
    }
    // ornières : deux sillons parallèles
    for (const oy of [TAILLE * 0.3, TAILLE * 0.7]) {
      c.strokeStyle = cssAlpha(melanger(PALETTE.brunFougere, LIGHT.froide, 0.4), 0.22);
      c.lineWidth = 5;
      c.beginPath();
      c.moveTo(-4, oy);
      c.bezierCurveTo(TAILLE * 0.3, oy - 4, TAILLE * 0.7, oy + 4, TAILLE + 4, oy);
      c.stroke();
      c.strokeStyle = cssAlpha(melanger(PALETTE.parcheminOmbre, LIGHT.chaude, 0.3), 0.18);
      c.lineWidth = 1.6;
      c.beginPath();
      c.moveTo(-4, oy - 3);
      c.bezierCurveTo(TAILLE * 0.3, oy - 7, TAILLE * 0.7, oy + 1, TAILLE + 4, oy - 3);
      c.stroke();
    }
  });
  return texture(el, 'gravier');
}

/* ──────────────────────────────── Eau ───────────────────────────────────── */

function brosseEau(): Texture {
  const { el, ctx } = canvas(TAILLE);
  const bruit = (x: number, y: number): number =>
    fbm(x / 22, y / 12, TAILLE / 22, 3313, 4) * 0.7 + ridged(x / 9, y / 5, TAILLE / 9, 881, 2) * 0.3;
  peindreChamp(ctx, TAILLE, {
    bruit,
    couleur: (v, x, y) => {
      const base = melanger(PALETTE.bleuProfond, v > 0.55 ? PALETTE.bleuBrume : PALETTE.granitAnthracite, Math.abs(v - 0.55) * 1.5);
      return modeler(base, bruit, x, y, 10);
    },
  });
  const rand = prng(4127);
  sansCouture(ctx, TAILLE, (c) => {
    // rides longues, orientées par le courant
    for (let i = 0; i < 22; i += 1) {
      const y = rand() * TAILLE;
      const amp = 2 + rand() * 4;
      c.strokeStyle = cssAlpha(melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.45), 0.14 + rand() * 0.18);
      c.lineWidth = 0.8 + rand() * 1.2;
      c.beginPath();
      c.moveTo(-4, y);
      for (let x = -4; x <= TAILLE + 4; x += 8) {
        c.lineTo(x, y + Math.sin(x / 11 + i) * amp);
      }
      c.stroke();
    }
    // éclats de lumière sur la crête des rides
    for (let i = 0; i < 34; i += 1) {
      const x = rand() * TAILLE;
      const y = rand() * TAILLE;
      c.strokeStyle = cssAlpha(LIGHT.chaude, 0.16 + rand() * 0.2);
      c.lineWidth = 0.9;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + 3 + rand() * 6, y - 1);
      c.stroke();
    }
    // profondeurs froides
    for (let i = 0; i < 8; i += 1) {
      const x = rand() * TAILLE;
      const y = rand() * TAILLE;
      c.fillStyle = cssAlpha(melanger(PALETTE.bleuProfond, LIGHT.froide, 0.3), 0.22);
      c.beginPath();
      c.ellipse(x, y, 6 + rand() * 12, 4 + rand() * 7, rand() * 3, 0, Math.PI * 2);
      c.fill();
    }
  });
  return texture(el, 'eau');
}

/** Construit les six pinceaux. Coût : six canvas 128 × 128. */
export function creerPinceauxTerrain(): Readonly<Record<TerrainBrushKey, Texture>> {
  return {
    herbe: brosseHerbe(),
    aiguilles: brosseAiguilles(),
    roche: brosseRoche(),
    tourbe: brosseTourbe(),
    gravier: brosseGravier(),
    eau: brosseEau(),
  };
}
