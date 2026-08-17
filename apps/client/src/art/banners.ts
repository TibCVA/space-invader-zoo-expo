/**
 * Bannières des cinq joueurs.
 *
 * Accessibilité : la couleur ne porte jamais seule l'information. Chaque
 * bannière est doublée d'un **motif** (plein, chevrons, losanges, rayures,
 * pois) lisible en niveaux de gris comme en vision dichromatique.
 *
 * L'étoffe est peinte comme une étoffe : ondulation, plis, frange d'or,
 * ombre propre bleutée et liseré doré au bord opposé au soleil.
 */
import { Graphics } from 'pixi.js';
import {
  BANNERS,
  LIGHT,
  PALETTE,
  assombrir,
  eclaircir,
  faceEclairee,
  melanger,
  ombreBleutee,
} from './palette.js';
import type { BannerPattern } from './palette.js';
import type { MaterialSet, Poly } from './shading.js';
import { blob, clipHalfPlane, densifier, flat, fuseau, lisser, peindre, perturber, pt } from './shading.js';

export type { BannerPattern };

export const BANNER_W = 76;
export const BANNER_H = 108;

/** Contour de l'étoffe : ondulée en haut, à queue d'aronde en bas. */
function silhouetteEtoffe(w: number, h: number, seed: number): Poly {
  const haut: Poly = [];
  const n = 8;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    haut.push(pt(-w / 2 + w * t, Math.sin(t * 3.6 + seed) * h * 0.022));
  }
  const bas: Poly = [];
  for (let i = n; i >= 0; i -= 1) {
    const t = i / n;
    // queue d'aronde : deux pointes séparées par une échancrure
    const ech = Math.abs(t - 0.5) < 0.22 ? (0.22 - Math.abs(t - 0.5)) * h * 1.1 : 0;
    const onde = Math.sin(t * 4.4 + seed * 1.7) * h * 0.03;
    bas.push(pt(-w / 2 + w * t, h - ech + onde));
  }
  return lisser(perturber([...haut, ...bas], w * 0.008, seed * 13 + 3), 1);
}

/**
 * Motif d'accessibilité, découpé à l'intérieur de l'étoffe par demi-plans :
 * aucun débord, aucun masque, tout reste vectoriel.
 */
function motif(g: Graphics, etoffe: Poly, w: number, h: number, pattern: BannerPattern, clair: number, sombre: number): void {
  const bandes = (poly: Poly, y0: number, y1: number): Poly => {
    const a = clipHalfPlane(poly, pt(0, y0), pt(0, 1));
    return clipHalfPlane(a, pt(0, y1), pt(0, -1));
  };
  switch (pattern) {
    case 0: {
      // plein : une seule pièce, mais avec un chef légèrement plus clair
      const chef = bandes(etoffe, 0, h * 0.2);
      if (chef.length >= 3) g.poly(flat(chef)).fill({ color: clair, alpha: 0.3 });
      break;
    }
    case 1: {
      // chevrons
      for (let i = 0; i < 4; i += 1) {
        const y = h * (0.1 + i * 0.22);
        const chevron: Poly = [
          pt(-w * 0.52, y),
          pt(0, y + h * 0.11),
          pt(w * 0.52, y),
          pt(w * 0.52, y + h * 0.07),
          pt(0, y + h * 0.18),
          pt(-w * 0.52, y + h * 0.07),
        ];
        const cut = clipHalfPlane(clipHalfPlane(chevron, pt(-w * 0.5, 0), pt(1, 0)), pt(w * 0.5, 0), pt(-1, 0));
        if (cut.length >= 3) g.poly(flat(cut)).fill({ color: i % 2 ? clair : sombre, alpha: 0.62 });
      }
      break;
    }
    case 2: {
      // losanges
      for (let r = 0; r < 5; r += 1) {
        for (let c = 0; c < 4; c += 1) {
          const cx = -w * 0.42 + c * w * 0.28 + (r % 2 ? w * 0.14 : 0);
          const cy = h * (0.12 + r * 0.19);
          const los: Poly = perturber(
            [pt(cx, cy - h * 0.075), pt(cx + w * 0.1, cy), pt(cx, cy + h * 0.075), pt(cx - w * 0.1, cy)],
            0.7,
            r * 7 + c,
          );
          const cut = clipHalfPlane(clipHalfPlane(los, pt(-w * 0.48, 0), pt(1, 0)), pt(w * 0.48, 0), pt(-1, 0));
          if (cut.length >= 3) g.poly(flat(cut)).fill({ color: (r + c) % 2 ? clair : sombre, alpha: 0.6 });
        }
      }
      break;
    }
    case 3: {
      // rayures verticales
      for (let i = 0; i < 5; i += 1) {
        const x0 = -w * 0.5 + i * w * 0.2;
        const bande = clipHalfPlane(clipHalfPlane(etoffe, pt(x0 + w * 0.045, 0), pt(1, 0)), pt(x0 + w * 0.155, 0), pt(-1, 0));
        if (bande.length >= 3) g.poly(flat(bande)).fill({ color: i % 2 ? clair : sombre, alpha: 0.55 });
      }
      break;
    }
    case 4:
    default: {
      // pois
      for (let r = 0; r < 5; r += 1) {
        for (let c = 0; c < 4; c += 1) {
          const cx = -w * 0.36 + c * w * 0.24 + (r % 2 ? w * 0.12 : 0);
          const cy = h * (0.13 + r * 0.185);
          const rr = w * 0.062;
          const rond = blob(cx, cy, rr, rr, { seed: r * 11 + c, points: 12, wobble: 0.2 });
          const cut = clipHalfPlane(clipHalfPlane(rond, pt(-w * 0.46, 0), pt(1, 0)), pt(w * 0.46, 0), pt(-1, 0));
          if (cut.length >= 3) g.poly(flat(cut)).fill({ color: (r + c) % 2 ? clair : sombre, alpha: 0.6 });
        }
      }
      break;
    }
  }
}

/**
 * Dessine une bannière complète : hampe, traverse, étoffe motivée, frange d'or.
 * L'origine (0, 0) est en haut de la hampe.
 */
export function dessinerBanniere(
  mats: MaterialSet,
  couleur: number,
  pattern: BannerPattern,
  opts: { w?: number; h?: number; hampe?: boolean; seed?: number } = {},
): Graphics {
  const g = new Graphics();
  const w = opts.w ?? BANNER_W;
  const h = opts.h ?? BANNER_H;
  const seed = opts.seed ?? pattern * 7 + 1;
  const clair = faceEclairee(couleur, 0.9);
  const sombre = ombreBleutee(couleur, 0.7);

  if (opts.hampe !== false) {
    // hampe et traverse, en chêne ferré
    const bois = melanger(PALETTE.brunFougere, PALETTE.granitAnthracite, 0.34);
    peindre(g, perturber(densifier([pt(-w * 0.045, -h * 0.1), pt(w * 0.045, -h * 0.1), pt(w * 0.038, h * 1.12), pt(-w * 0.04, h * 1.1)], 12), 0.7, seed), mats, {
      base: bois,
      matiere: 'ecorce',
      matiereAlpha: 0.28,
      matiereEchelle: 0.35,
      modele: 1,
    });
    peindre(g, perturber(densifier([pt(-w * 0.58, -h * 0.055), pt(w * 0.58, -h * 0.05), pt(w * 0.57, h * 0.015), pt(-w * 0.57, h * 0.01)], 10), 0.6, seed + 5), mats, {
      base: bois,
      matiere: 'ecorce',
      matiereAlpha: 0.26,
      matiereEchelle: 0.35,
      modele: 1,
    });
    // fer de hampe
    peindre(g, fuseau(0, -h * 0.1, 0, -h * 0.3, w * 0.14, { seed, taper: 0.6 }), mats, {
      base: LIGHT.rim,
      matiere: 'metal',
      matiereAlpha: 0.24,
      matiereEchelle: 0.4,
      modele: 1,
      speculaire: { x: 0.3, y: 0.24, r: 0.12 },
    });
    // glands aux extrémités de la traverse
    for (const s of [-1, 1] as const) {
      g.poly(flat(blob(s * w * 0.56, h * 0.05, w * 0.05, w * 0.06, { seed: s + 3, points: 11, wobble: 0.24 }))).fill({
        color: LIGHT.rim,
        alpha: 0.9,
      });
    }
  }

  const etoffe = silhouetteEtoffe(w, h, seed);
  peindre(g, etoffe, mats, {
    base: couleur,
    matiere: 'tissu',
    matiereAlpha: 0.26,
    matiereEchelle: 0.8,
    modele: 1,
    rim: true,
  });

  motif(g, etoffe, w, h, pattern, clair, sombre);

  // plis : quatre ondulations verticales, valeurs alternées
  for (let i = 0; i < 4; i += 1) {
    const x = -w * 0.34 + i * w * 0.23;
    g.moveTo(x, h * 0.03);
    g.bezierCurveTo(x + w * 0.05, h * 0.32, x - w * 0.04, h * 0.66, x + w * 0.02, h * 0.94);
    g.stroke({
      color: i % 2 ? eclaircir(couleur, 0.4) : assombrir(couleur, 0.42),
      width: w * 0.028,
      alpha: 0.34,
      cap: 'round',
    });
  }

  // orfroi : filet d'or le long du guindant et de l'ourlet
  g.moveTo(-w * 0.48, h * 0.02);
  g.lineTo(-w * 0.48, h * 0.94);
  g.moveTo(w * 0.48, h * 0.02);
  g.lineTo(w * 0.48, h * 0.94);
  g.stroke({ color: LIGHT.rim, width: w * 0.022, alpha: 0.7, cap: 'round' });

  // frange d'or à l'ourlet
  for (let i = 0; i < 11; i += 1) {
    const t = i / 10;
    const ech = Math.abs(t - 0.5) < 0.22 ? (0.22 - Math.abs(t - 0.5)) * h * 1.1 : 0;
    const x = -w * 0.46 + t * w * 0.92;
    const y = h - ech + Math.sin(t * 4.4 + seed * 1.7) * h * 0.03;
    g.moveTo(x, y);
    g.lineTo(x + (i % 2 ? 0.8 : -0.8), y + h * 0.045);
    g.stroke({ color: i % 2 ? LIGHT.rim : melanger(LIGHT.rim, LIGHT.chaude, 0.4), width: w * 0.018, alpha: 0.72, cap: 'round' });
  }

  return g;
}

/** Bannière du joueur `index` (0 = P1). */
export function dessinerBanniereJoueur(mats: MaterialSet, index: number): Graphics {
  const def = BANNERS[((index % BANNERS.length) + BANNERS.length) % BANNERS.length];
  return dessinerBanniere(mats, def.color, def.pattern, { seed: index * 5 + 2 });
}

/** Clef de cache d'une bannière. */
export function cleBanniere(couleur: string | number, pattern: number): string {
  const c = typeof couleur === 'number' ? `#${couleur.toString(16).padStart(6, '0')}` : couleur.toLowerCase();
  return `banniere_${c}_${pattern}`;
}

/** Convertit une couleur CSS `#rrggbb` en entier ; tolère les formes courtes. */
export function couleurDepuisCss(css: string): number {
  const s = css.trim().replace('#', '');
  if (s.length === 3) {
    const r = s[0];
    const g = s[1];
    const b = s[2];
    return parseInt(`${r}${r}${g}${g}${b}${b}`, 16);
  }
  const n = parseInt(s.slice(0, 6), 16);
  return Number.isNaN(n) ? BANNERS[0].color : n;
}

export { BANNERS };
