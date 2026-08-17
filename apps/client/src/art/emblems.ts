/**
 * Emblèmes de compétence (`competence_<id>`) et de sort (`sort_<id>`).
 *
 * Les clefs sont imposées par `packages/content` : vingt compétences et
 * trente-deux sorts (huit par école). Chaque emblème est une petite peinture
 * sur plaque : fond de matière, glyphe modelé, filet d'or, ombre bleutée. Aucun
 * pictogramme plat, aucun emoji.
 *
 * Origine (0, 0) : centre de la plaque.
 */
import { Graphics } from 'pixi.js';
import {
  LIGHT,
  PALETTE,
  SCHOOL_COLORS,
  assombrir,
  eclaircir,
  melanger,
  ombreBleutee,
} from './palette.js';
import type { MaterialKey, MaterialSet, Poly } from './shading.js';
import {
  arcBande,
  blob,
  densifier,
  filetDore,
  flat,
  fuseau,
  lisser,
  peindre,
  perturber,
  pt,
} from './shading.js';

export const EMBLEM_BOX = 76;

const GRANIT = PALETTE.granitAnthracite;
const GRANIT_CLAIR = PALETTE.granitClair;
const PARCHEMIN = PALETTE.parchemin;
const BOIS = PALETTE.brunFougere;
const OCRE = PALETTE.ocre;
const GRENAT = PALETTE.grenat;
const VERT = PALETTE.vertHetre;
const SAPIN = PALETTE.vertSapin;
const BLEU = PALETTE.bleuProfond;
const BRUME = PALETTE.bleuBrume;
const ACIER = 0x8f99a4;

interface Opt {
  matiere?: MaterialKey;
  alpha?: number;
  echelle?: number;
  modele?: number;
  rim?: boolean;
  speculaire?: { x: number; y: number; r: number } | null;
}

function poser(g: Graphics, mats: MaterialSet, poly: Poly, base: number, o: Opt = {}): void {
  peindre(g, poly, mats, {
    base,
    matiere: o.matiere ?? 'grain',
    matiereAlpha: o.alpha ?? 0.16,
    matiereEchelle: o.echelle ?? 0.4,
    modele: o.modele ?? 1,
    rim: o.rim !== false,
    speculaire: o.speculaire ?? null,
  });
}

/** Plaque de fond : granit taillé pour les compétences, émail pour les sorts. */
function plaque(g: Graphics, mats: MaterialSet, teinte: number, seed: number, matiere: MaterialKey): void {
  const R = EMBLEM_BOX / 2;
  const contour = lisser(
    perturber(
      densifier(
        [
          pt(-R * 0.86, -R * 0.94),
          pt(R * 0.84, -R * 0.9),
          pt(R * 0.94, -R * 0.2),
          pt(R * 0.88, R * 0.86),
          pt(-R * 0.82, R * 0.92),
          pt(-R * 0.94, R * 0.1),
        ],
        R * 0.32,
      ),
      R * 0.02,
      seed,
    ),
    1,
  );
  poser(g, mats, contour, teinte, { matiere, alpha: 0.24, echelle: 0.5, modele: 0.9 });
  // creux central : le glyphe est en relief sur un fond légèrement plus sombre
  const creux = lisser(perturber(densifier([pt(-R * 0.72, -R * 0.76), pt(R * 0.72, -R * 0.74), pt(R * 0.76, R * 0.72), pt(-R * 0.7, R * 0.76)], R * 0.3), R * 0.015, seed + 3), 1);
  g.poly(flat(creux)).fill({ color: ombreBleutee(teinte, 0.42), alpha: 0.5 });
  filetDore(g, -R * 0.78, -R * 0.8, R * 1.56, R * 1.58, { epaisseur: 1.5, ecart: 3.2, seed: seed + 7, alpha: 0.85 });
}

/* ───────────────────────────── Glyphes de base ──────────────────────────── */

function flamme(g: Graphics, mats: MaterialSet, x: number, y: number, h: number, chaud: number, seed: number): void {
  const forme = lisser(
    perturber(
      densifier(
        [pt(x, y - h), pt(x + h * 0.34, y - h * 0.5), pt(x + h * 0.28, y - h * 0.05), pt(x, y + h * 0.12), pt(x - h * 0.3, y - h * 0.08), pt(x - h * 0.24, y - h * 0.56)],
        h * 0.2,
      ),
      h * 0.03,
      seed,
    ),
    1,
  );
  poser(g, mats, forme, chaud, { matiere: 'grain', alpha: 0.14, modele: 1 });
  g.poly(flat(blob(x - h * 0.04, y - h * 0.18, h * 0.16, h * 0.3, { seed: seed + 3, points: 12, wobble: 0.24 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.72,
  });
}

function goutte(g: Graphics, mats: MaterialSet, x: number, y: number, r: number, teinte: number, seed: number): void {
  const forme = lisser(
    perturber(densifier([pt(x, y - r * 1.7), pt(x + r * 0.86, y + r * 0.2), pt(x, y + r), pt(x - r * 0.86, y + r * 0.2)], r * 0.4), r * 0.05, seed),
    1,
  );
  poser(g, mats, forme, teinte, { matiere: 'grain', alpha: 0.12, modele: 0.95, speculaire: { x: 0.3, y: 0.42, r: 0.14 } });
}

function vague(g: Graphics, x: number, y: number, w: number, teinte: number, i: number): void {
  g.moveTo(x - w, y);
  g.bezierCurveTo(x - w * 0.4, y - w * 0.22, x + w * 0.3, y + w * 0.22, x + w, y - w * 0.04);
  g.stroke({ color: i % 2 ? eclaircir(teinte, 0.4) : teinte, width: w * 0.16, alpha: 0.9, cap: 'round' });
}

function feuille(g: Graphics, mats: MaterialSet, x: number, y: number, L: number, a: number, teinte: number, seed: number): void {
  const ex = x + Math.cos(a) * L;
  const ey = y + Math.sin(a) * L;
  poser(g, mats, fuseau(x, y, ex, ey, L * 0.44, { seed, taper: 0.4 }), teinte, { matiere: 'fourrure', alpha: 0.2, echelle: 0.3 });
  g.moveTo(x, y);
  g.lineTo(ex, ey);
  g.stroke({ color: eclaircir(teinte, 0.45), width: L * 0.06, alpha: 0.7, cap: 'round' });
}

function lame(g: Graphics, mats: MaterialSet, x: number, y: number, L: number, w: number, teinte: number, seed: number): void {
  const forme = lisser(
    perturber(densifier([pt(x, y - L), pt(x + w, y - L * 0.6), pt(x + w * 0.8, y + L * 0.5), pt(x, y + L * 0.6), pt(x - w * 0.8, y + L * 0.5), pt(x - w, y - L * 0.6)], L * 0.22), L * 0.02, seed),
    1,
  );
  poser(g, mats, forme, teinte, { matiere: 'metal', alpha: 0.22, echelle: 0.35, speculaire: { x: 0.3, y: 0.28, r: 0.09 } });
}

function anneauPerle(g: Graphics, cx: number, cy: number, r: number, teinte: number, n = 10, seed = 1): void {
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + seed * 0.13;
    g.poly(flat(blob(cx + Math.cos(a) * r, cy + Math.sin(a) * r, r * 0.11, r * 0.11, { seed: i + seed, points: 8, wobble: 0.28 }))).fill({
      color: i % 2 ? teinte : eclaircir(teinte, 0.35),
      alpha: 0.8,
    });
  }
}

function ruban(g: Graphics, pts: Poly, teinte: number, w: number, alpha = 0.9): void {
  if (pts.length < 2) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i].x, pts[i].y);
  g.stroke({ color: teinte, width: w, alpha, cap: 'round', join: 'round' });
  g.moveTo(pts[0].x - 0.7, pts[0].y - 0.7);
  for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i].x - 0.7, pts[i].y - 0.7);
  g.stroke({ color: eclaircir(teinte, 0.45), width: w * 0.4, alpha: alpha * 0.7, cap: 'round' });
}

/* ─────────────────────── Les vingt compétences ──────────────────────────── */

type Glyphe = (g: Graphics, mats: MaterialSet) => void;

const COMPETENCES: Record<string, Glyphe> = {
  // Botte ferrée sur une borne kilométrique
  logistique: (g, m) => {
    poser(g, m, lisser(perturber(densifier([pt(-16, 6), pt(-12, -14), pt(-2, -18), pt(4, -8), pt(18, 2), pt(19, 10), pt(-14, 12)], 7), 0.8, 3), 1), melanger(BOIS, GRANIT, 0.34), {
      matiere: 'grain',
      alpha: 0.2,
    });
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(-10 + i * 6, 9, 1.6, 1.4, { seed: i, points: 8, wobble: 0.3 }))).fill({ color: ACIER, alpha: 0.9 });
    }
    ruban(g, [pt(-20, 16), pt(0, 13), pt(20, 16)], melanger(OCRE, PARCHEMIN, 0.3), 3);
  },
  // Trois hexagones et une flèche de manœuvre
  tactique: (g, m) => {
    for (let i = 0; i < 3; i += 1) {
      const cx = -14 + i * 13;
      const cy = 6 - i * 4;
      const hex: Poly = [];
      for (let j = 0; j < 6; j += 1) {
        const a = (j / 6) * Math.PI * 2 + 0.5;
        hex.push(pt(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9));
      }
      poser(g, m, perturber(hex, 0.5, i + 2), melanger(GRANIT_CLAIR, PARCHEMIN, 0.2 + i * 0.1), {
        matiere: 'granit',
        alpha: 0.24,
        echelle: 0.4,
      });
    }
    ruban(g, [pt(-16, -14), pt(2, -20), pt(16, -12)], LIGHT.rim, 3);
    g.poly(flat(perturber([pt(16, -12), pt(8, -16), pt(11, -6)], 0.4, 5))).fill({ color: LIGHT.rim, alpha: 0.92 });
  },
  // Couronne comtale posée sur une charte
  seigneurie: (g, m) => {
    poser(g, m, perturber(densifier([pt(-18, 4), pt(18, 2), pt(16, 16), pt(-16, 17)], 6), 0.7, 7), PARCHEMIN, {
      matiere: 'parchemin',
      alpha: 0.3,
    });
    for (let i = 0; i < 3; i += 1) {
      g.moveTo(-12, 8 + i * 3.4);
      g.lineTo(10 - i * 4, 7.6 + i * 3.4);
      g.stroke({ color: melanger(PALETTE.encre, PARCHEMIN, 0.3), width: 1.1, alpha: 0.6 });
    }
    poser(g, m, perturber([pt(-16, -2), pt(-11, -18), pt(-5, -6), pt(0, -22), pt(5, -6), pt(11, -18), pt(16, -2)], 0.6, 9), LIGHT.rim, {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.3, r: 0.1 },
    });
    for (const x of [-11, 0, 11]) {
      g.poly(flat(blob(x, x === 0 ? -23 : -19, 2.4, 2.4, { seed: x, points: 10, wobble: 0.24 }))).fill({ color: GRENAT, alpha: 0.9 });
    }
  },
  // Balance à deux plateaux
  intendance: (g, m) => {
    ruban(g, [pt(0, -20), pt(0, 12)], melanger(BOIS, GRANIT, 0.4), 3.4);
    ruban(g, [pt(-20, -14), pt(20, -14)], melanger(BOIS, GRANIT, 0.4), 3);
    for (const s of [-1, 1] as const) {
      ruban(g, [pt(s * 18, -13), pt(s * 14, -2)], ACIER, 1.4, 0.7);
      poser(g, m, blob(s * 15, 1, 9, 3.6, { seed: s + 3, points: 16, wobble: 0.16 }), melanger(ACIER, LIGHT.rim, s > 0 ? 0.1 : 0.4), {
        matiere: 'metal',
        alpha: 0.24,
        speculaire: { x: 0.3, y: 0.26, r: 0.14 },
      });
    }
    poser(g, m, perturber(densifier([pt(-10, 12), pt(10, 12), pt(8, 18), pt(-8, 18)], 5), 0.5, 11), melanger(GRANIT_CLAIR, GRANIT, 0.3), {
      matiere: 'granit',
      alpha: 0.26,
    });
  },
  // Deux mains scellant un pacte au-dessus d'un sceau
  diplomatie: (g, m) => {
    for (const s of [-1, 1] as const) {
      poser(g, m, fuseau(s * 22, -10 + s * 3, s * 2, -2, 11, { seed: s + 2, taper: 0.4 }), melanger(0xd8b291, GRENAT, s > 0 ? 0.18 : 0.06), {
        matiere: 'grain',
        alpha: 0.14,
      });
    }
    poser(g, m, blob(0, -2, 9, 8, { seed: 5, points: 14, wobble: 0.22 }), 0xc79a78, { matiere: 'grain', alpha: 0.14 });
    poser(g, m, blob(0, 14, 8, 7, { seed: 7, points: 14, wobble: 0.2 }), GRENAT, {
      matiere: 'grain',
      alpha: 0.16,
      speculaire: { x: 0.3, y: 0.28, r: 0.14 },
    });
    anneauPerle(g, 0, 14, 10, LIGHT.rim, 8, 3);
  },
  // Œil et lunette d'approche
  reconnaissance: (g, m) => {
    poser(g, m, lisser(perturber(densifier([pt(-22, 0), pt(-6, -12), pt(10, -10), pt(20, 0), pt(8, 11), pt(-8, 10)], 8), 0.6, 13), 1), PARCHEMIN, {
      matiere: 'parchemin',
      alpha: 0.24,
      modele: 0.8,
    });
    poser(g, m, blob(-1, 0, 9, 9, { seed: 3, points: 16, wobble: 0.14 }), melanger(BRUME, BLEU, 0.4), {
      matiere: 'grain',
      alpha: 0.14,
      speculaire: { x: 0.3, y: 0.28, r: 0.16 },
    });
    g.poly(flat(blob(-1, 0, 4, 4.4, { seed: 5, points: 11, wobble: 0.2 }))).fill({ color: PALETTE.encre, alpha: 0.9 });
    ruban(g, [pt(-24, -6), pt(-14, -14), pt(2, -18)], LIGHT.rim, 2);
    ruban(g, [pt(-24, 6), pt(-12, 14), pt(4, 17)], LIGHT.rim, 2, 0.6);
  },
  // Cognée plantée dans une souche, jeune pousse à côté
  sylviculture: (g, m) => {
    poser(g, m, lisser(perturber(densifier([pt(-20, 18), pt(-16, 2), pt(-2, 0), pt(2, 18)], 6), 1, 17), 1), melanger(BOIS, GRANIT, 0.3), {
      matiere: 'ecorce',
      alpha: 0.28,
      echelle: 0.3,
    });
    ruban(g, [pt(-8, 2), pt(12, -18)], melanger(BOIS, OCRE, 0.3), 3.6);
    poser(g, m, lisser(perturber(densifier([pt(10, -20), pt(22, -22), pt(20, -10), pt(9, -14)], 5), 0.6, 19), 1), ACIER, {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.24, r: 0.12 },
    });
    ruban(g, [pt(14, 18), pt(15, 4)], melanger(VERT, SAPIN, 0.4), 2.2);
    feuille(g, m, 15, 6, 10, -0.7, VERT, 3);
    feuille(g, m, 15, 9, 9, -2.4, melanger(VERT, SAPIN, 0.3), 5);
  },
  // Bourdon et coquille
  pelerinage: (g, m) => {
    ruban(g, [pt(-6, 20), pt(-2, -20)], melanger(BOIS, GRANIT, 0.32), 4);
    poser(g, m, blob(-2, -22, 5, 5.4, { seed: 3, points: 13, wobble: 0.2 }), melanger(BOIS, OCRE, 0.3), {
      matiere: 'ecorce',
      alpha: 0.26,
      echelle: 0.3,
    });
    const coq = blob(12, 2, 12, 11, { seed: 7, points: 16, wobble: 0.12 });
    poser(g, m, coq, melanger(PARCHEMIN, OCRE, 0.24), { matiere: 'granit', alpha: 0.2, echelle: 0.35 });
    for (let i = 0; i < 5; i += 1) {
      const a = -2.5 + i * 0.5;
      g.moveTo(12, 12);
      g.lineTo(12 + Math.cos(a) * 11, 12 + Math.sin(a) * 12);
      g.stroke({ color: assombrir(PARCHEMIN, 0.4), width: 1.3, alpha: 0.6 });
    }
  },
  // Marteau sur enclume, étincelles
  forges: (g, m) => {
    poser(g, m, lisser(perturber(densifier([pt(-20, 18), pt(20, 17), pt(12, 8), pt(16, 2), pt(-14, 3), pt(-12, 9)], 6), 0.8, 23), 1), melanger(GRANIT_CLAIR, GRANIT, 0.36), {
      matiere: 'metal',
      alpha: 0.24,
      echelle: 0.4,
      speculaire: { x: 0.3, y: 0.2, r: 0.08 },
    });
    ruban(g, [pt(-14, -20), pt(6, -6)], melanger(BOIS, GRANIT, 0.34), 3.4);
    poser(g, m, perturber(densifier([pt(4, -12), pt(20, -18), pt(24, -10), pt(9, -3)], 5), 0.6, 27), ACIER, {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.24, r: 0.12 },
    });
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(-4 + i * 5, -1 - (i % 2) * 5, 1.4, 1.6, { seed: i + 3, points: 8, wobble: 0.3 }))).fill({
        color: i % 2 ? LIGHT.chaude : OCRE,
        alpha: 0.8,
      });
    }
  },
  // Arbalète de profil et carreau
  balistique: (g, m) => {
    poser(g, m, perturber(densifier([pt(-22, 2), pt(20, -1), pt(20, 6), pt(-22, 9)], 6), 0.6, 29), melanger(BOIS, GRANIT, 0.3), {
      matiere: 'ecorce',
      alpha: 0.26,
      echelle: 0.3,
    });
    poser(g, m, arcBande(8, 4, 16, 16, -1.35, 1.35, 4.4, 0.4), ACIER, {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.3, r: 0.09 },
    });
    ruban(g, [pt(11, -12), pt(2, 4), pt(11, 20)], melanger(PARCHEMIN, BOIS, 0.35), 1.6, 0.85);
    poser(g, m, fuseau(-14, 3, 18, 1, 4.4, { seed: 3, taper: 0.4 }), melanger(PARCHEMIN, BOIS, 0.3), {
      matiere: 'grain',
      alpha: 0.14,
    });
    ruban(g, [pt(-20, 10), pt(-14, 18)], assombrir(ACIER, 0.3), 3);
  },
  // Mortier, pilon et brin d'herbe
  guerison: (g, m) => {
    poser(g, m, lisser(perturber(densifier([pt(-16, 2), pt(16, 1), pt(11, 18), pt(-11, 19)], 6), 0.8, 31), 1), melanger(GRANIT_CLAIR, PARCHEMIN, 0.26), {
      matiere: 'granit',
      alpha: 0.28,
      echelle: 0.4,
    });
    poser(g, m, blob(0, 1, 17, 4.4, { seed: 5, points: 18, wobble: 0.12 }), melanger(GRANIT_CLAIR, PARCHEMIN, 0.38), {
      matiere: 'granit',
      alpha: 0.24,
      echelle: 0.4,
    });
    ruban(g, [pt(10, -20), pt(2, 0)], melanger(BOIS, OCRE, 0.3), 3.4);
    feuille(g, m, -6, -2, 12, -2.1, VERT, 7);
    feuille(g, m, -6, -2, 10, -1.1, melanger(VERT, SAPIN, 0.35), 9);
    goutte(g, m, -14, -12, 5, melanger(BRUME, LIGHT.chaude, 0.25), 11);
  },
  // Livre ouvert, signet et lettrine
  erudition: (g, m) => {
    for (const s of [-1, 1] as const) {
      poser(
        g,
        m,
        lisser(perturber(densifier([pt(0, -12), pt(s * 21, -16), pt(s * 22, 10), pt(0, 13)], 7), 0.6, 33 + s), 1),
        s > 0 ? melanger(PARCHEMIN, OCRE, 0.12) : PARCHEMIN,
        { matiere: 'parchemin', alpha: 0.3, echelle: 0.45 },
      );
      for (let i = 0; i < 4; i += 1) {
        g.moveTo(s * 4, -8 + i * 5);
        g.lineTo(s * 18, -9 + i * 5);
        g.stroke({ color: melanger(PALETTE.encre, PARCHEMIN, 0.35), width: 1, alpha: 0.55 });
      }
    }
    poser(g, m, perturber(densifier([pt(-2.4, -14), pt(2.4, -14), pt(2, 14), pt(-2, 14)], 6), 0.4, 37), melanger(GRENAT, GRANIT, 0.2), {
      matiere: 'grain',
      alpha: 0.18,
    });
    g.poly(flat(blob(-13, -6, 3.4, 3.6, { seed: 3, points: 11, wobble: 0.22 }))).fill({ color: LIGHT.rim, alpha: 0.9 });
    ruban(g, [pt(0, 12), pt(1, 22)], GRENAT, 2.4);
  },
  // Chandelle et cercle de runes
  occultisme: (g, m) => {
    anneauPerle(g, 0, 0, 24, melanger(BRUME, LIGHT.rim, 0.4), 12, 5);
    poser(g, m, perturber(densifier([pt(-6, 18), pt(6, 17), pt(4, -6), pt(-4, -5)], 7), 0.6, 41), melanger(PARCHEMIN, OCRE, 0.2), {
      matiere: 'grain',
      alpha: 0.18,
    });
    flamme(g, m, 0, -10, 13, melanger(OCRE, GRENAT, 0.24), 43);
    for (let i = 0; i < 3; i += 1) {
      g.poly(flat(blob(-14 + i * 14, 12 - (i % 2) * 6, 2, 2.2, { seed: i + 7, points: 9, wobble: 0.26 }))).fill({
        color: melanger(BRUME, LIGHT.chaude, 0.4),
        alpha: 0.6,
      });
    }
  },
  // Cor de commandement et fanion
  commandement: (g, m) => {
    poser(g, m, arcBande(-2, 2, 17, 15, 0.5, 3.6, 8, 0.55), melanger(0x4e8977, LIGHT.rim, 0.3), {
      matiere: 'metal',
      alpha: 0.24,
      echelle: 0.35,
      speculaire: { x: 0.3, y: 0.24, r: 0.1 },
    });
    poser(g, m, blob(-19, 3, 7, 8, { seed: 3, points: 14, wobble: 0.2 }), melanger(0x4e8977, LIGHT.rim, 0.42), {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.26, r: 0.14 },
    });
    ruban(g, [pt(14, -6), pt(16, -22)], melanger(BOIS, GRANIT, 0.4), 2.6);
    g.poly(flat(perturber([pt(16, -22), pt(30, -19), pt(25, -15), pt(30, -11), pt(16, -12)], 0.6, 5))).fill({
      color: GRENAT,
      alpha: 0.92,
    });
  },
  // Dé et pièce, tirés à la volée
  fortune: (g, m) => {
    const de: Poly = perturber(
      [pt(-18, -6), pt(-4, -14), pt(10, -6), pt(10, 10), pt(-4, 18), pt(-18, 10)],
      0.7,
      47,
    );
    poser(g, m, de, melanger(PARCHEMIN, OCRE, 0.18), { matiere: 'granit', alpha: 0.22, echelle: 0.35 });
    ruban(g, [pt(-4, -14), pt(-4, 2), pt(-18, 10)], assombrir(PARCHEMIN, 0.4), 1.2, 0.5);
    ruban(g, [pt(-4, 2), pt(10, -6)], assombrir(PARCHEMIN, 0.4), 1.2, 0.5);
    for (const [x, y] of [
      [-11, 2],
      [3, 0],
      [-4, 10],
    ] as const) {
      g.poly(flat(blob(x, y, 1.9, 1.9, { seed: x + y, points: 9, wobble: 0.26 }))).fill({ color: GRENAT, alpha: 0.88 });
    }
    poser(g, m, blob(19, -12, 8, 8.4, { seed: 9, points: 18, wobble: 0.12 }), LIGHT.rim, {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.28, y: 0.28, r: 0.16 },
    });
  },
  // Poignard surgissant d'un feuillage
  embuscade: (g, m) => {
    for (let i = 0; i < 4; i += 1) {
      feuille(g, m, -18 + i * 12, 16, 13, -2.5 + i * 0.42, melanger(SAPIN, VERT, 0.2 + i * 0.14), i + 3);
    }
    lame(g, m, 4, -6, 17, 5.6, ACIER, 51);
    ruban(g, [pt(4, 8), pt(4, 18)], melanger(BOIS, GRANIT, 0.4), 3.4);
    ruban(g, [pt(-4, 8), pt(12, 8)], melanger(LIGHT.rim, ACIER, 0.4), 2.6);
    for (let i = 0; i < 3; i += 1) {
      feuille(g, m, -14 + i * 14, 20, 11, -1.9 + i * 0.5, melanger(VERT, SAPIN, 0.4), i + 9);
    }
  },
  // Bourse liée et poids étalonné
  commerce: (g, m) => {
    poser(g, m, lisser(perturber(densifier([pt(-20, 18), pt(-18, -2), pt(-8, -10), pt(4, -6), pt(6, 16)], 7), 0.8, 53), 1), melanger(PARCHEMIN, BOIS, 0.34), {
      matiere: 'tissu',
      alpha: 0.26,
      echelle: 0.4,
    });
    ruban(g, [pt(-16, -6), pt(-8, -12), pt(2, -6)], melanger(BOIS, GRANIT, 0.34), 2.6);
    g.poly(flat(blob(-8, 6, 4.4, 4.6, { seed: 5, points: 12, wobble: 0.2 }))).fill({ color: LIGHT.rim, alpha: 0.85 });
    poser(g, m, perturber(densifier([pt(8, 18), pt(24, 17), pt(21, 2), pt(11, 3)], 6), 0.6, 57), melanger(ACIER, GRANIT, 0.3), {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.24, r: 0.1 },
    });
    ruban(g, [pt(13, 2), pt(16, -6), pt(19, 2)], LIGHT.rim, 2);
  },
  // Carte roulée et rose des vents
  cartographie: (g, m) => {
    poser(g, m, lisser(perturber(densifier([pt(-22, -14), pt(20, -16), pt(22, 12), pt(-20, 14)], 7), 0.8, 59), 1), PARCHEMIN, {
      matiere: 'parchemin',
      alpha: 0.32,
      echelle: 0.5,
      modele: 0.85,
    });
    ruban(g, [pt(-18, 6), pt(-6, -4), pt(6, 2), pt(18, -8)], melanger(GRENAT, BOIS, 0.35), 1.8, 0.7);
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      const L = i % 2 ? 6 : 11;
      g.poly(
        flat(
          perturber(
            [pt(4, -2), pt(4 + Math.cos(a) * L, -2 + Math.sin(a) * L), pt(4 + Math.cos(a + 0.35) * L * 0.34, -2 + Math.sin(a + 0.35) * L * 0.34)],
            0.35,
            i,
          ),
        ),
      ).fill({ color: i % 2 ? melanger(LIGHT.rim, PARCHEMIN, 0.3) : LIGHT.rim, alpha: 0.85 });
    }
    for (const x of [-22, 20]) {
      poser(g, m, blob(x, 0, 4, 15, { seed: x, points: 16, wobble: 0.14 }), melanger(PARCHEMIN, BOIS, 0.28), {
        matiere: 'parchemin',
        alpha: 0.28,
        echelle: 0.4,
      });
    }
  },
  // Écu adossé à une tour
  resistance: (g, m) => {
    poser(g, m, perturber(densifier([pt(6, 20), pt(24, 19), pt(22, -12), pt(8, -11)], 7), 0.9, 61), melanger(GRANIT_CLAIR, GRANIT, 0.32), {
      matiere: 'granit',
      alpha: 0.3,
      echelle: 0.45,
    });
    for (let i = 0; i < 3; i += 1) {
      poser(g, m, perturber(densifier([pt(7 + i * 6, -12), pt(12 + i * 6, -12), pt(12 + i * 6, -18), pt(7 + i * 6, -18)], 4), 0.5, 63 + i), melanger(GRANIT_CLAIR, 0x414a52, 0.3), {
        matiere: 'granit',
        alpha: 0.28,
      });
    }
    const ec = lisser(perturber(densifier([pt(-24, -14), pt(-2, -17), pt(4, -12), pt(2, 8), pt(-12, 20), pt(-24, 6)], 7), 0.8, 67), 1);
    poser(g, m, ec, melanger(GRENAT, GRANIT, 0.24), { matiere: 'grain', alpha: 0.2, echelle: 0.4 });
    ruban(g, [pt(-24, -6), pt(2, -8)], LIGHT.rim, 2.4);
    ruban(g, [pt(-12, -16), pt(-11, 18)], LIGHT.rim, 2.4);
  },
  // Cercle de pierres levées et étincelle appelée
  invocation: (g, m) => {
    for (let i = 0; i < 5; i += 1) {
      const a = -2.7 + i * 0.62;
      const x = Math.cos(a) * 22;
      const y = 10 + Math.sin(a) * 8;
      poser(g, m, lisser(perturber(densifier([pt(x - 4, y), pt(x - 3, y - 13), pt(x + 3, y - 14), pt(x + 4, y)], 5), 0.9, i + 3), 0), melanger(GRANIT_CLAIR, GRANIT, 0.3 + i * 0.04), {
        matiere: 'granit',
        alpha: 0.3,
        echelle: 0.45,
      });
    }
    for (let i = 3; i >= 1; i -= 1) {
      g.poly(flat(blob(0, -8, 10 * (i / 3) + 2, 11 * (i / 3) + 2, { seed: i * 5, points: 14, wobble: 0.24 }))).fill({
        color: melanger(0x4e8977, LIGHT.chaude, 1 - i / 3),
        alpha: 0.2,
      });
    }
    g.poly(flat(blob(0, -8, 4.4, 5, { seed: 11, points: 12, wobble: 0.22 }))).fill({ color: LIGHT.chaude, alpha: 0.85 });
  },
};

/* ────────────────────────── Les trente-deux sorts ───────────────────────── */

type SortGlyphe = (g: Graphics, mats: MaterialSet, c: { coeur: number; halo: number; ombre: number }) => void;

const BRAISES: SortGlyphe[] = [
  // 1 Étincelle des Farges
  (g, m, c) => {
    for (let i = 0; i < 7; i += 1) {
      const a = (i / 7) * Math.PI * 2 + 0.3;
      g.poly(flat(fuseau(0, 0, Math.cos(a) * 22, Math.sin(a) * 22, 6, { seed: i, taper: 0.7 }))).fill({
        color: i % 2 ? c.halo : c.coeur,
        alpha: 0.8,
      });
    }
    g.poly(flat(blob(0, 0, 7, 7, { seed: 3, points: 13, wobble: 0.24 }))).fill({ color: LIGHT.chaude, alpha: 0.92 });
  },
  // 2 Acier tempéré
  (g, m, c) => {
    lame(g, m, 0, -2, 20, 6.5, ACIER, 5);
    ruban(g, [pt(-10, 12), pt(10, 12)], melanger(LIGHT.rim, ACIER, 0.4), 3);
    ruban(g, [pt(0, 12), pt(0, 20)], melanger(BOIS, GRANIT, 0.4), 3.4);
    for (let i = 0; i < 4; i += 1) {
      g.poly(flat(blob(-12 + i * 8, -16 + (i % 2) * 6, 2, 2.2, { seed: i + 3, points: 8, wobble: 0.3 }))).fill({
        color: i % 2 ? c.coeur : c.halo,
        alpha: 0.7,
      });
    }
  },
  // 3 Cendre aux yeux
  (g, m, c) => {
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(-16 + i * 8, -4 + (i % 2) * 8, 9 - i * 0.6, 7 - i * 0.4, { seed: i * 3, points: 14, wobble: 0.3 }))).fill({
        color: melanger(c.ombre, PALETTE.bleuBrume, 0.3 + i * 0.1),
        alpha: 0.42,
      });
    }
    poser(g, m, lisser(perturber(densifier([pt(-16, -8), pt(0, -18), pt(16, -8), pt(0, 2)], 7), 0.6, 7), 1), PARCHEMIN, {
      matiere: 'parchemin',
      alpha: 0.22,
      modele: 0.7,
    });
    g.poly(flat(blob(0, -8, 5, 5, { seed: 9, points: 12, wobble: 0.2 }))).fill({ color: c.ombre, alpha: 0.8 });
    g.poly(flat(blob(-4, -12, 8, 5, { seed: 11, points: 12, wobble: 0.3 }))).fill({ color: melanger(c.ombre, PARCHEMIN, 0.5), alpha: 0.5 });
  },
  // 4 Trait incandescent
  (g, m, c) => {
    poser(g, m, fuseau(-24, 16, 22, -14, 9, { seed: 13, taper: 0.5 }), c.halo, { matiere: 'metal', alpha: 0.2, echelle: 0.35 });
    ruban(g, [pt(-24, 16), pt(22, -14)], LIGHT.chaude, 2.4, 0.8);
    for (let i = 0; i < 4; i += 1) {
      g.poly(flat(blob(-20 + i * 6, 14 - i * 4, 2.4, 2, { seed: i + 5, points: 8, wobble: 0.3 }))).fill({ color: c.coeur, alpha: 0.7 });
    }
    g.poly(flat(perturber([pt(22, -14), pt(12, -14), pt(16, -4)], 0.5, 3))).fill({ color: LIGHT.chaude, alpha: 0.9 });
  },
  // 5 Mur de braises
  (g, m, c) => {
    for (let r = 0; r < 3; r += 1) {
      for (let i = 0; i < 4 - (r % 2); i += 1) {
        const x = -21 + i * 14 + (r % 2 ? 7 : 0);
        const y = 16 - r * 10;
        poser(g, m, perturber(densifier([pt(x - 6, y), pt(x + 6, y - 1), pt(x + 5.4, y - 8), pt(x - 5.6, y - 7)], 4), 0.6, r * 7 + i), melanger(c.ombre, c.halo, 0.3 + r * 0.16), {
          matiere: 'granit',
          alpha: 0.24,
          echelle: 0.4,
        });
      }
    }
    for (let i = 0; i < 4; i += 1) flamme(g, m, -16 + i * 11, -12, 11, c.halo, i + 3);
  },
  // 6 Marteau rouge
  (g, m, c) => {
    ruban(g, [pt(-14, 20), pt(6, -6)], melanger(BOIS, GRANIT, 0.34), 4);
    poser(g, m, lisser(perturber(densifier([pt(0, -10), pt(20, -20), pt(26, -8), pt(8, 0)], 5), 0.7, 17), 1), melanger(c.halo, ACIER, 0.4), {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.22, r: 0.1 },
    });
    for (let i = 2; i >= 1; i -= 1) {
      g.poly(flat(blob(14, -12, 16 * (i / 2), 13 * (i / 2), { seed: i * 7, points: 14, wobble: 0.26 }))).fill({
        color: c.coeur,
        alpha: 0.14,
      });
    }
  },
  // 7 Fournaise du rempart
  (g, m, c) => {
    poser(g, m, perturber(densifier([pt(-24, 20), pt(24, 19), pt(22, -2), pt(-22, -1)], 7), 0.9, 19), melanger(PALETTE.granitClair, GRANIT, 0.34), {
      matiere: 'granit',
      alpha: 0.3,
      echelle: 0.45,
    });
    for (let i = 0; i < 4; i += 1) {
      poser(g, m, perturber(densifier([pt(-22 + i * 13, -2), pt(-14 + i * 13, -2), pt(-14 + i * 13, -10), pt(-22 + i * 13, -10)], 4), 0.5, 21 + i), melanger(PALETTE.granitClair, 0x414a52, 0.3), {
        matiere: 'granit',
        alpha: 0.28,
      });
    }
    const bouche = arcBande(0, 20, 9, 13, Math.PI, Math.PI * 2, 18, 0);
    g.poly(flat(bouche)).fill({ color: c.ombre, alpha: 0.85 });
    flamme(g, m, 0, 8, 16, c.halo, 23);
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(-14 + i * 7, -16 - (i % 2) * 6, 2.2, 2.4, { seed: i + 9, points: 8, wobble: 0.3 }))).fill({
        color: LIGHT.chaude,
        alpha: 0.6,
      });
    }
  },
  // 8 Couronne de feu ancien
  (g, m, c) => {
    poser(g, m, perturber([pt(-22, 8), pt(-15, -12), pt(-7, 2), pt(0, -18), pt(7, 2), pt(15, -12), pt(22, 8), pt(18, 18), pt(-18, 18)], 0.7, 27), melanger(LIGHT.rim, c.halo, 0.24), {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.34, r: 0.09 },
    });
    for (const [x, y] of [
      [-15, -14],
      [0, -20],
      [15, -14],
    ] as const) {
      flamme(g, m, x, y, 11, c.halo, x + 40);
    }
    for (let i = 0; i < 3; i += 1) {
      g.poly(flat(blob(-11 + i * 11, 10, 3, 3.2, { seed: i + 5, points: 11, wobble: 0.22 }))).fill({ color: GRENAT, alpha: 0.9 });
    }
  },
];

const SOURCES: SortGlyphe[] = [
  // 1 Rosée vive
  (g, m, c) => {
    feuille(g, m, -6, 14, 20, -1.2, VERT, 3);
    for (let i = 0; i < 4; i += 1) goutte(g, m, -14 + i * 10, -10 + (i % 2) * 8, 5 - i * 0.4, c.coeur, i + 5);
  },
  // 2 Gué clair
  (g, m, c) => {
    for (let i = 0; i < 4; i += 1) vague(g, 0, -6 + i * 8, 22, c.halo, i);
    for (let i = 0; i < 4; i += 1) {
      poser(g, m, blob(-16 + i * 11, 2 + (i % 2) * 8, 6, 3.4, { seed: i + 3, points: 14, wobble: 0.2 }), melanger(PALETTE.granitClair, PARCHEMIN, 0.3), {
        matiere: 'granit',
        alpha: 0.28,
        echelle: 0.4,
      });
    }
  },
  // 3 Eau réparatrice
  (g, m, c) => {
    poser(g, m, lisser(perturber(densifier([pt(-18, -6), pt(18, -8), pt(12, 18), pt(-12, 19)], 7), 0.7, 7), 1), melanger(PALETTE.granitClair, PARCHEMIN, 0.3), {
      matiere: 'granit',
      alpha: 0.3,
      echelle: 0.42,
    });
    poser(g, m, blob(0, -7, 18, 5, { seed: 9, points: 18, wobble: 0.12 }), c.halo, { matiere: 'grain', alpha: 0.14, modele: 0.7 });
    goutte(g, m, 0, -20, 7, c.coeur, 11);
    for (let i = 0; i < 3; i += 1) vague(g, 0, -6 + i * 2.6, 14, eclaircir(c.halo, 0.3), i);
  },
  // 4 Voile de pluie
  (g, m, c) => {
    for (let i = 0; i < 3; i += 1) {
      g.poly(flat(blob(-10 + i * 11, -16 + (i % 2) * 5, 13 - i, 7, { seed: i * 5, points: 16, wobble: 0.28 }))).fill({
        color: melanger(c.ombre, PALETTE.bleuBrume, 0.4 + i * 0.12),
        alpha: 0.55,
      });
    }
    for (let i = 0; i < 7; i += 1) {
      const x = -21 + i * 7;
      ruban(g, [pt(x, -4), pt(x - 3, 18)], melanger(c.halo, LIGHT.chaude, 0.2), 1.8, 0.6);
    }
  },
  // 5 Source miraculeuse
  (g, m, c) => {
    poser(g, m, lisser(perturber(densifier([pt(-22, 20), pt(-18, -2), pt(-4, -12), pt(10, -6), pt(6, 20)], 8), 1.2, 13), 0), melanger(PALETTE.granitClair, GRANIT, 0.3), {
      matiere: 'granit',
      alpha: 0.32,
      echelle: 0.5,
    });
    ruban(g, [pt(-6, -6), pt(0, 6), pt(-2, 18)], eclaircir(c.halo, 0.3), 4, 0.7);
    for (let i = 3; i >= 1; i -= 1) {
      g.poly(flat(blob(-4, -10, 9 * (i / 3) + 2, 9 * (i / 3) + 2, { seed: i * 7, points: 14, wobble: 0.24 }))).fill({
        color: melanger(c.coeur, LIGHT.chaude, 1 - i / 3),
        alpha: 0.2,
      });
    }
    for (let i = 0; i < 4; i += 1) goutte(g, m, 8 + (i % 2) * 8, -14 + i * 8, 3.4, c.coeur, i + 3);
  },
  // 6 Courant de la Durolle
  (g, m, c) => {
    for (let i = 0; i < 5; i += 1) {
      const y = -16 + i * 8;
      g.moveTo(-24, y);
      g.bezierCurveTo(-8, y - 7, 8, y + 7, 24, y - 2);
      g.stroke({ color: i % 2 ? c.halo : eclaircir(c.halo, 0.4), width: 3.4 - i * 0.3, alpha: 0.75, cap: 'round' });
    }
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(-18 + i * 9, -6 + (i % 3) * 7, 2, 1.8, { seed: i + 5, points: 8, wobble: 0.3 }))).fill({
        color: LIGHT.chaude,
        alpha: 0.5,
      });
    }
  },
  // 7 Lit de la Vierge
  (g, m, c) => {
    poser(g, m, arcBande(0, 12, 18, 22, Math.PI, Math.PI * 2, 7, 0.08), melanger(PALETTE.granitClair, PARCHEMIN, 0.24), {
      matiere: 'granit',
      alpha: 0.3,
      echelle: 0.42,
    });
    for (let i = 3; i >= 1; i -= 1) {
      g.poly(flat(blob(0, -2, 12 * (i / 3), 15 * (i / 3), { seed: i * 5, points: 16, wobble: 0.2 }))).fill({
        color: melanger(c.halo, LIGHT.chaude, 1 - i / 3),
        alpha: 0.18,
      });
    }
    goutte(g, m, 0, -2, 8, c.coeur, 17);
    anneauPerle(g, 0, -2, 20, melanger(LIGHT.rim, c.halo, 0.4), 9, 3);
  },
  // 8 Voile du Forez / grande eau
  (g, m, c) => {
    for (let i = 0; i < 3; i += 1) {
      const r = 24 - i * 7;
      const cercle = blob(0, 2, r, r * 0.72, { seed: i * 9 + 1, points: 22, wobble: 0.12 });
      g.poly(flat(cercle)).fill({ color: melanger(c.ombre, c.halo, 0.3 + i * 0.24), alpha: 0.28 });
      g.poly(flat(cercle), true).stroke({ color: eclaircir(c.halo, 0.4), width: 1.6, alpha: 0.5 });
    }
    goutte(g, m, 0, -14, 8, c.coeur, 19);
    for (let i = 0; i < 4; i += 1) vague(g, 0, 12 + i * 3, 20 - i * 3, eclaircir(c.halo, 0.35), i);
  },
];

const BRUMES: SortGlyphe[] = [
  // 1 Brume basse
  (g, m, c) => {
    for (let i = 0; i < 4; i += 1) {
      g.poly(flat(blob(-6 + (i % 2) * 10, 12 - i * 8, 22 - i * 3, 6 - i * 0.6, { seed: i * 7, points: 18, wobble: 0.28 }))).fill({
        color: melanger(c.halo, LIGHT.chaude, i * 0.12),
        alpha: 0.4 - i * 0.05,
      });
    }
    for (let i = 0; i < 3; i += 1) {
      poser(g, m, fuseau(-14 + i * 14, 20, -15 + i * 14, 2, 5, { seed: i, taper: 0.6 }), melanger(SAPIN, c.ombre, 0.4), {
        matiere: 'fourrure',
        alpha: 0.2,
        echelle: 0.3,
      });
    }
  },
  // 2 Pas effacé
  (g, m, c) => {
    for (let i = 0; i < 4; i += 1) {
      const alpha = 0.75 - i * 0.18;
      const x = -18 + i * 12;
      const y = 12 - i * 6;
      g.poly(flat(blob(x, y, 6, 8.4, { seed: i * 3 + 1, points: 14, wobble: 0.24 }))).fill({
        color: melanger(c.ombre, c.halo, 0.3 + i * 0.16),
        alpha,
      });
      for (let j = 0; j < 3; j += 1) {
        g.poly(flat(blob(x - 3 + j * 3, y - 9, 1.6, 1.8, { seed: i * 5 + j, points: 8, wobble: 0.3 }))).fill({
          color: melanger(c.ombre, c.halo, 0.3 + i * 0.16),
          alpha,
        });
      }
    }
  },
  // 3 Reflet du Lac
  (g, m, c) => {
    poser(g, m, blob(0, 0, 23, 15, { seed: 3, points: 22, wobble: 0.12 }), melanger(c.ombre, PALETTE.bleuProfond, 0.4), {
      matiere: 'grain',
      alpha: 0.14,
      modele: 0.7,
    });
    for (let i = 0; i < 4; i += 1) vague(g, 0, -8 + i * 6, 18, eclaircir(c.halo, 0.35), i);
    for (let i = 0; i < 3; i += 1) {
      poser(g, m, fuseau(-16 + i * 16, -8, -17 + i * 16, -24, 6, { seed: i + 5, taper: 0.6 }), melanger(SAPIN, c.ombre, 0.35), {
        matiere: 'fourrure',
        alpha: 0.2,
        echelle: 0.3,
      });
      g.poly(flat(fuseau(-16 + i * 16, 8, -17 + i * 16, 20, 5, { seed: i + 7, taper: 0.6 }))).fill({
        color: melanger(SAPIN, c.halo, 0.55),
        alpha: 0.35,
      });
    }
  },
  // 4 Chouette silencieuse
  (g, m, c) => {
    poser(g, m, blob(0, 0, 13, 12, { seed: 9, points: 20, wobble: 0.14 }), melanger(c.halo, PARCHEMIN, 0.3), {
      matiere: 'plumes',
      alpha: 0.24,
      echelle: 0.35,
    });
    for (const dx of [-5, 5]) {
      g.poly(flat(blob(dx, -2, 4.2, 4, { seed: dx, points: 12, wobble: 0.18 }))).fill({ color: LIGHT.chaude, alpha: 0.85 });
      g.poly(flat(blob(dx + (dx > 0 ? 0.6 : -0.6), -2, 2, 2.2, { seed: dx + 3, points: 9, wobble: 0.24 }))).fill({
        color: PALETTE.encre,
        alpha: 0.9,
      });
    }
    g.poly(flat(fuseau(0, 1, 0, 8, 3.4, { seed: 5 }))).fill({ color: melanger(PARCHEMIN, BOIS, 0.4), alpha: 0.9 });
    for (const s of [-1, 1] as const) {
      poser(g, m, fuseau(s * 10, -2, s * 24, 8, 11, { seed: s + 11, taper: 0.6 }), melanger(c.halo, c.ombre, 0.4), {
        matiere: 'plumes',
        alpha: 0.24,
        echelle: 0.35,
      });
    }
  },
  // 5 Brouillard de Pamole
  (g, m, c) => {
    poser(g, m, lisser(perturber(densifier([pt(-22, 20), pt(-10, -12), pt(2, -22), pt(16, -6), pt(22, 20)], 8), 1.6, 13), 0), melanger(PALETTE.granitClair, GRANIT, 0.38), {
      matiere: 'granit',
      alpha: 0.32,
      echelle: 0.5,
    });
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(-8 + (i % 2) * 14, 12 - i * 7, 24 - i * 2, 5, { seed: i * 5 + 3, points: 18, wobble: 0.3 }))).fill({
        color: melanger(c.halo, LIGHT.chaude, i * 0.1),
        alpha: 0.34,
      });
    }
  },
  // 6 Échange des ombres
  (g, m, c) => {
    for (const s of [-1, 1] as const) {
      poser(g, m, blob(s * 14, s * 6, 9, 12, { seed: s + 3, points: 16, wobble: 0.22 }), s > 0 ? melanger(c.ombre, c.halo, 0.5) : c.ombre, {
        matiere: 'grain',
        alpha: 0.16,
      });
    }
    ruban(g, [pt(-10, -12), pt(0, -18), pt(12, -6)], melanger(LIGHT.rim, c.halo, 0.4), 2.4);
    ruban(g, [pt(10, 14), pt(0, 20), pt(-12, 8)], melanger(LIGHT.rim, c.halo, 0.4), 2.4);
    g.poly(flat(perturber([pt(12, -6), pt(4, -10), pt(6, -1)], 0.4, 5))).fill({ color: LIGHT.rim, alpha: 0.9 });
    g.poly(flat(perturber([pt(-12, 8), pt(-4, 12), pt(-6, 3)], 0.4, 7))).fill({ color: LIGHT.rim, alpha: 0.9 });
  },
  // 7 Nuit des Bois Noirs
  (g, m, c) => {
    g.poly(flat(blob(0, 0, 26, 24, { seed: 17, points: 24, wobble: 0.14 }))).fill({
      color: melanger(c.ombre, PALETTE.bleuProfond, 0.55),
      alpha: 0.55,
    });
    for (let i = 0; i < 4; i += 1) {
      poser(g, m, fuseau(-18 + i * 12, 22, -19 + i * 12, -6 - (i % 2) * 6, 9, { seed: i + 3, taper: 0.62 }), melanger(SAPIN, c.ombre, 0.5), {
        matiere: 'fourrure',
        alpha: 0.22,
        echelle: 0.3,
      });
    }
    for (let i = 0; i < 6; i += 1) {
      const a = -2.6 + i * 0.55;
      g.poly(flat(blob(Math.cos(a) * 18, -12 + Math.sin(a) * 8, 1.5, 1.6, { seed: i + 9, points: 8, wobble: 0.3 }))).fill({
        color: LIGHT.rim,
        alpha: 0.5 + (i % 2) * 0.2,
      });
    }
  },
  // 8 Voile du Forez
  (g, m, c) => {
    for (let i = 0; i < 3; i += 1) {
      const y = 16 - i * 12;
      g.poly(
        flat(
          lisser(
            perturber(
              densifier([pt(-26, y), pt(-8, y - 9), pt(10, y - 2), pt(26, y - 10), pt(26, y + 4), pt(-26, y + 5)], 8),
              0.9,
              i * 5 + 1,
            ),
            1,
          ),
        ),
      ).fill({ color: melanger(c.halo, LIGHT.chaude, i * 0.16), alpha: 0.34 });
    }
    anneauPerle(g, 0, 0, 24, melanger(LIGHT.rim, c.halo, 0.5), 12, 5);
  },
];

const RACINES: SortGlyphe[] = [
  // 1 Écorce du fayard
  (g, m, c) => {
    poser(g, m, lisser(perturber(densifier([pt(-14, 20), pt(-12, -18), pt(12, -20), pt(14, 20)], 9), 1.2, 3), 0), melanger(BOIS, PALETTE.granitClair, 0.28), {
      matiere: 'ecorce',
      alpha: 0.32,
      echelle: 0.35,
    });
    for (let i = 0; i < 4; i += 1) {
      const x = -9 + i * 6;
      g.moveTo(x, -20);
      g.quadraticCurveTo(x + 2, 0, x - 1, 20);
      g.stroke({ color: i % 2 ? eclaircir(BOIS, 0.35) : assombrir(BOIS, 0.35), width: 1.6, alpha: 0.5 });
    }
    feuille(g, m, 12, -14, 13, -0.5, c.halo, 5);
    feuille(g, m, -12, -10, 12, -2.6, melanger(c.halo, VERT, 0.4), 7);
  },
  // 2 Ronce vive
  (g, m, c) => {
    for (let i = 0; i < 3; i += 1) {
      const y = -14 + i * 14;
      g.moveTo(-24, y);
      g.bezierCurveTo(-8, y - 10, 8, y + 10, 24, y - 2);
      g.stroke({ color: i % 2 ? melanger(c.ombre, BOIS, 0.4) : melanger(c.halo, BOIS, 0.3), width: 3, alpha: 0.9, cap: 'round' });
      for (let j = 0; j < 5; j += 1) {
        const x = -20 + j * 10;
        g.poly(flat(perturber([pt(x, y - 1), pt(x + 3, y - 8), pt(x + 5, y)], 0.4, i * 5 + j))).fill({
          color: melanger(PARCHEMIN, c.halo, 0.4),
          alpha: 0.85,
        });
      }
    }
  },
  // 3 Futaie vigilante
  (g, m, c) => {
    for (let i = 0; i < 3; i += 1) {
      const x = -16 + i * 16;
      poser(g, m, fuseau(x, 20, x - 1, -8 - (i % 2) * 6, 8, { seed: i + 3, taper: 0.6 }), melanger(SAPIN, c.ombre, 0.3), {
        matiere: 'ecorce',
        alpha: 0.26,
        echelle: 0.3,
      });
      poser(g, m, blob(x, -12 - (i % 2) * 6, 11, 9, { seed: i * 5 + 7, points: 16, wobble: 0.24 }), melanger(VERT, c.halo, 0.3), {
        matiere: 'fourrure',
        alpha: 0.24,
        echelle: 0.35,
      });
    }
    for (const [x, y] of [
      [-16, -12],
      [16, -12],
    ] as const) {
      g.poly(flat(blob(x, y, 3.4, 2.6, { seed: x, points: 11, wobble: 0.22 }))).fill({ color: LIGHT.chaude, alpha: 0.8 });
      g.poly(flat(blob(x, y, 1.5, 1.6, { seed: x + 3, points: 8, wobble: 0.3 }))).fill({ color: PALETTE.encre, alpha: 0.9 });
    }
  },
  // 4 Appel de la meute
  (g, m, c) => {
    poser(g, m, lisser(perturber(densifier([pt(-18, 8), pt(-4, -4), pt(14, -8), pt(22, 4), pt(10, 18), pt(-10, 18)], 8), 0.9, 11), 1), melanger(c.ombre, PALETTE.granitClair, 0.24), {
      matiere: 'fourrure',
      alpha: 0.26,
      echelle: 0.35,
    });
    for (const [dx, dy] of [
      [-12, -6],
      [-2, -12],
    ] as const) {
      poser(g, m, fuseau(dx, dy, dx - 6, dy - 12, 8, { seed: dx, taper: 0.6 }), melanger(c.ombre, BOIS, 0.3), {
        matiere: 'fourrure',
        alpha: 0.26,
        echelle: 0.3,
      });
    }
    g.poly(flat(blob(10, 0, 4, 2.6, { seed: 5, points: 10, wobble: 0.22 }))).fill({ color: LIGHT.chaude, alpha: 0.85 });
    for (let i = 0; i < 4; i += 1) {
      const r = 8 + i * 6;
      g.poly(flat(arcBande(20, -6, r, r * 0.8, -1.1, 0.6, 1.6, 0.2))).fill({
        color: melanger(c.halo, LIGHT.chaude, i * 0.2),
        alpha: 0.36 - i * 0.06,
      });
    }
  },
  // 5 Racines profondes
  (g, m, c) => {
    ruban(g, [pt(-26, -4), pt(26, -6)], melanger(BOIS, PALETTE.granitClair, 0.24), 3, 0.6);
    for (let i = 0; i < 5; i += 1) {
      const x = -20 + i * 10;
      g.moveTo(x, -6);
      g.bezierCurveTo(x - 4, 4, x + 5, 10, x - 2 + (i % 2) * 4, 20);
      g.stroke({ color: i % 2 ? melanger(BOIS, c.ombre, 0.4) : melanger(BOIS, c.halo, 0.24), width: 3.4 - i * 0.2, alpha: 0.85, cap: 'round' });
    }
    poser(g, m, fuseau(0, -6, -1, -22, 9, { seed: 13, taper: 0.6 }), melanger(BOIS, PALETTE.granitClair, 0.24), {
      matiere: 'ecorce',
      alpha: 0.28,
      echelle: 0.3,
    });
    feuille(g, m, 0, -20, 12, -1.9, c.halo, 3);
    feuille(g, m, 0, -20, 11, -1.2, melanger(c.halo, VERT, 0.4), 5);
  },
  // 6 Pierre levée
  (g, m, c) => {
    poser(g, m, lisser(perturber(densifier([pt(-13, 20), pt(-11, -14), pt(-2, -24), pt(10, -20), pt(13, 20)], 9), 1.8, 17), 0), melanger(PALETTE.granitClair, GRANIT, 0.36), {
      matiere: 'granit',
      alpha: 0.34,
      echelle: 0.55,
    });
    for (let i = 0; i < 4; i += 1) {
      g.poly(flat(blob(-8 + i * 6, 12 + (i % 2) * 4, 2.6, 2, { seed: i + 7, points: 9, wobble: 0.34 }))).fill({
        color: melanger(PALETTE.mousseSombre, c.halo, 0.4),
        alpha: 0.6,
      });
    }
    for (let i = 3; i >= 1; i -= 1) {
      g.poly(flat(blob(0, -6, 15 * (i / 3), 20 * (i / 3), { seed: i * 5 + 1, points: 16, wobble: 0.2 }))).fill({
        color: melanger(c.halo, LIGHT.chaude, 1 - i / 3),
        alpha: 0.12,
      });
    }
  },
  // 7 Cercle des bornes
  (g, m, c) => {
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const x = Math.cos(a) * 21;
      const y = Math.sin(a) * 15 + 2;
      poser(g, m, lisser(perturber(densifier([pt(x - 4, y + 6), pt(x - 3.4, y - 6), pt(x + 3.4, y - 7), pt(x + 4, y + 6)], 5), 0.8, i + 3), 0), melanger(PALETTE.granitClair, GRANIT, 0.28 + i * 0.02), {
        matiere: 'granit',
        alpha: 0.3,
        echelle: 0.45,
      });
    }
    anneauPerle(g, 0, 2, 24, melanger(LIGHT.rim, c.halo, 0.35), 12, 7);
    g.poly(flat(blob(0, 2, 5, 5.2, { seed: 9, points: 12, wobble: 0.22 }))).fill({ color: melanger(c.coeur, LIGHT.chaude, 0.3), alpha: 0.75 });
  },
  // 8 Mémoire de la forêt
  (g, m, c) => {
    for (let i = 3; i >= 1; i -= 1) {
      g.poly(flat(blob(0, 0, 24 * (i / 3), 22 * (i / 3), { seed: i * 9 + 1, points: 20, wobble: 0.18 }))).fill({
        color: melanger(c.ombre, c.halo, 1 - i / 3),
        alpha: 0.2,
      });
    }
    poser(g, m, fuseau(0, 22, -1, -6, 10, { seed: 19, taper: 0.62 }), melanger(BOIS, PALETTE.granitClair, 0.24), {
      matiere: 'ecorce',
      alpha: 0.3,
      echelle: 0.3,
    });
    for (let i = 0; i < 6; i += 1) {
      const a = -2.8 + i * 0.5;
      feuille(g, m, 0, -6, 15, a, melanger(VERT, c.halo, 0.2 + (i % 3) * 0.18), i + 3);
    }
    for (let i = 0; i < 4; i += 1) {
      g.poly(flat(blob(-16 + i * 11, -18 + (i % 2) * 6, 1.8, 2, { seed: i + 11, points: 8, wobble: 0.3 }))).fill({
        color: LIGHT.rim,
        alpha: 0.6,
      });
    }
  },
];

const ECOLES: Record<string, SortGlyphe[]> = {
  braises: BRAISES,
  sources: SOURCES,
  brumes: BRUMES,
  racines: RACINES,
};

/* ────────────────────────────── Rendu public ────────────────────────────── */

export const SKILL_IDS: readonly string[] = Object.keys(COMPETENCES);

export const SPELL_SCHOOLS: readonly ('braises' | 'sources' | 'brumes' | 'racines')[] = [
  'braises',
  'sources',
  'brumes',
  'racines',
];

/** Toutes les clefs d'emblème fournies par ce module. */
export function clesEmblemes(): string[] {
  const out = SKILL_IDS.map((id) => `competence_${id}`);
  for (const ecole of SPELL_SCHOOLS) {
    for (let n = 1; n <= 8; n += 1) out.push(`sort_${ecole}_${n}`);
  }
  return out;
}

/** Dessine l'emblème correspondant à une clef `competence_*` ou `sort_*`. */
export function dessinerEmbleme(mats: MaterialSet, key: string): Graphics {
  const g = new Graphics();
  if (key.startsWith('competence_')) {
    const id = key.slice('competence_'.length);
    const glyphe = COMPETENCES[id];
    if (!glyphe) throw new Error(`Compétence inconnue dans l'atlas artistique : ${id}`);
    plaque(g, mats, melanger(GRANIT_CLAIR, PALETTE.parcheminOmbre, 0.22), id.length * 7 + 3, 'granit');
    glyphe(g, mats);
    return g;
  }
  if (key.startsWith('sort_')) {
    const id = key.slice('sort_'.length);
    const sep = id.lastIndexOf('_');
    const ecole = id.slice(0, sep);
    const niveau = Number.parseInt(id.slice(sep + 1), 10);
    const table = ECOLES[ecole];
    if (!table || !Number.isFinite(niveau) || niveau < 1 || niveau > 8) {
      throw new Error(`Sort inconnu dans l'atlas artistique : ${id}`);
    }
    const c = SCHOOL_COLORS[ecole as keyof typeof SCHOOL_COLORS];
    plaque(g, mats, melanger(c.ombre, GRANIT, 0.34), niveau * 11 + ecole.length, 'metal');
    table[niveau - 1](g, mats, c);
    // rang du sort : autant de perles d'or que de niveaux, en pied de plaque
    for (let i = 0; i < Math.min(8, niveau); i += 1) {
      const x = -EMBLEM_BOX * 0.28 + i * (EMBLEM_BOX * 0.56) / 7;
      g.poly(flat(blob(x, EMBLEM_BOX * 0.42, 1.8, 1.8, { seed: i + 3, points: 8, wobble: 0.3 }))).fill({
        color: LIGHT.rim,
        alpha: 0.9,
      });
    }
    return g;
  }
  throw new Error(`Clef d'emblème inconnue : ${key}`);
}
