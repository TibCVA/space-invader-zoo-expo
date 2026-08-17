/**
 * Icônes d'artefact (`artefact_<id>`).
 *
 * Les cinquante-trois artefacts du Forez sont décrits par `@auvergne/content` :
 * ce module lit leur **emplacement** et leur **rareté** et en tire une peinture
 * cohérente, puis applique une variation déterministe issue du hachage de
 * l'identifiant. Une quinzaine de pièces majeures reçoivent en plus un dessin
 * qui leur est propre : ce sont celles qu'on reconnaît d'un coup d'œil.
 *
 * Origine (0, 0) : centre de la vignette.
 */
import { Graphics } from 'pixi.js';
import { ARTIFACTS } from '@auvergne/content';
import type { ArtifactDef } from '@auvergne/engine';
import {
  LIGHT,
  PALETTE,
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
import { hashString, prng } from './noise.js';

export const ARTIFACT_BOX = 76;

const GRANIT = PALETTE.granitAnthracite;
const GRANIT_CLAIR = PALETTE.granitClair;
const PARCHEMIN = PALETTE.parchemin;
const BOIS = PALETTE.brunFougere;
const OCRE = PALETTE.ocre;
const GRENAT = PALETTE.grenat;
const VERT = PALETTE.vertHetre;
const SAPIN = PALETTE.vertSapin;
const BRUME = PALETTE.bleuBrume;
const ACIER = 0x8f99a4;
const CUIVRE = 0x4e8977;

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

type Rarete = ArtifactDef['rarity'];

/** Métal dominant selon la rareté : le rang se lit dans la matière. */
function metalDe(rarete: Rarete): number {
  switch (rarete) {
    case 'commun':
      return melanger(ACIER, GRANIT, 0.34);
    case 'rare':
      return melanger(CUIVRE, ACIER, 0.4);
    case 'majeur':
      return melanger(ACIER, LIGHT.rim, 0.42);
    case 'relique':
    default:
      return LIGHT.rim;
  }
}

/** Gemme d'accent, tirée du hachage de l'identifiant. */
function gemmeDe(seed: number): number {
  const table = [GRENAT, CUIVRE, BRUME, VERT, OCRE, PALETTE.bleuProfond];
  return table[seed % table.length];
}

/** Fond de vignette : ardoise pour le commun, halo croissant vers la relique. */
function fond(g: Graphics, mats: MaterialSet, rarete: Rarete, seed: number): void {
  const R = ARTIFACT_BOX / 2;
  const teinte =
    rarete === 'relique'
      ? melanger(GRENAT, GRANIT, 0.45)
      : rarete === 'majeur'
        ? melanger(0x414a52, GRANIT, 0.3)
        : melanger(GRANIT_CLAIR, GRANIT, 0.45);
  const contour = lisser(
    perturber(
      densifier(
        [pt(-R * 0.9, -R * 0.92), pt(R * 0.88, -R * 0.88), pt(R * 0.92, R * 0.9), pt(-R * 0.86, R * 0.92)],
        R * 0.34,
      ),
      R * 0.02,
      seed,
    ),
    1,
  );
  poser(g, mats, contour, teinte, { matiere: 'granit', alpha: 0.26, echelle: 0.5, modele: 0.85 });
  if (rarete === 'majeur' || rarete === 'relique') {
    const n = rarete === 'relique' ? 4 : 2;
    for (let i = n; i >= 1; i -= 1) {
      g.poly(flat(blob(0, 0, R * 0.9 * (i / n), R * 0.9 * (i / n), { seed: i * 7 + seed, points: 20, wobble: 0.18 }))).fill({
        color: melanger(LIGHT.rim, LIGHT.chaude, 1 - i / n),
        alpha: rarete === 'relique' ? 0.09 : 0.05,
      });
    }
  }
  filetDore(g, -R * 0.8, -R * 0.82, R * 1.6, R * 1.62, {
    epaisseur: rarete === 'relique' ? 2 : 1.4,
    ecart: 3.4,
    seed: seed + 5,
    alpha: rarete === 'commun' ? 0.55 : 0.9,
  });
}

/** Petite gemme sertie, avec éclat chaud. */
function gemme(g: Graphics, x: number, y: number, r: number, couleur: number, seed: number): void {
  g.poly(flat(blob(x, y, r * 1.28, r * 1.28, { seed: seed + 1, points: 11, wobble: 0.2 }))).fill({
    color: LIGHT.rim,
    alpha: 0.9,
  });
  g.poly(flat(blob(x, y, r, r, { seed, points: 9, wobble: 0.18 }))).fill({ color: couleur, alpha: 0.95 });
  g.poly(flat(blob(x - r * 0.3, y - r * 0.32, r * 0.36, r * 0.3, { seed: seed + 3, points: 7, wobble: 0.26 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.7,
  });
}

function ruban(g: Graphics, pts: Poly, teinte: number, w: number, alpha = 0.9): void {
  if (pts.length < 2) return;
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i].x, pts[i].y);
  g.stroke({ color: teinte, width: w, alpha, cap: 'round', join: 'round' });
}

/* ─────────────────── Formes de base, par emplacement ────────────────────── */

type Forme = (g: Graphics, mats: MaterialSet, metal: number, gem: number, seed: number, rarete: Rarete) => void;

const PAR_EMPLACEMENT: Record<string, Forme> = {
  tete: (g, m, metal, gem, seed, rarete) => {
    const calotte = lisser(
      perturber(densifier([pt(-20, 4), pt(-17, -14), pt(-4, -23), pt(12, -19), pt(20, -3), pt(19, 8), pt(-19, 9)], 8), 0.8, seed),
      1,
    );
    poser(g, m, calotte, metal, { matiere: 'metal', alpha: 0.24, echelle: 0.4, speculaire: { x: 0.3, y: 0.24, r: 0.1 } });
    poser(g, m, perturber(densifier([pt(-24, 8), pt(24, 6), pt(22, 15), pt(-22, 17)], 6), 0.7, seed + 3), assombrir(metal, 0.2), {
      matiere: 'metal',
      alpha: 0.24,
      echelle: 0.4,
    });
    ruban(g, [pt(-2, -22), pt(-1, 8)], eclaircir(metal, 0.4), 2.4, 0.7);
    if (rarete !== 'commun') gemme(g, -1, -8, 4, gem, seed + 7);
    if (rarete === 'relique') {
      for (let i = 0; i < 3; i += 1) {
        g.poly(flat(fuseau(-12 + i * 12, -20, -14 + i * 14, -34, 5, { seed: i + seed, taper: 0.7 }))).fill({
          color: LIGHT.rim,
          alpha: 0.9,
        });
      }
    }
  },
  cou: (g, m, metal, gem, seed, rarete) => {
    g.poly(flat(arcBande(0, -8, 20, 17, 0.15, Math.PI - 0.15, 3.4, 0))).fill({ color: metal, alpha: 0.9 });
    for (let i = 0; i < 9; i += 1) {
      const a = 0.25 + (i / 8) * (Math.PI - 0.5);
      g.poly(flat(blob(Math.cos(a) * 20, -8 + Math.sin(a) * 17, 2.4, 2.4, { seed: i + seed, points: 8, wobble: 0.26 }))).fill({
        color: i % 2 ? eclaircir(metal, 0.34) : metal,
        alpha: 0.92,
      });
    }
    const pendant = lisser(perturber(densifier([pt(-9, 8), pt(9, 8), pt(11, 16), pt(0, 24), pt(-11, 16)], 6), 0.6, seed + 5), 1);
    poser(g, m, pendant, metal, { matiere: 'metal', alpha: 0.24, echelle: 0.35, speculaire: { x: 0.3, y: 0.26, r: 0.11 } });
    gemme(g, 0, 14, rarete === 'commun' ? 3.4 : 5, gem, seed + 9);
  },
  torse: (g, m, metal, gem, seed, rarete) => {
    const plastron = lisser(
      perturber(
        densifier([pt(-20, -18), pt(-8, -24), pt(9, -24), pt(21, -17), pt(18, 6), pt(0, 22), pt(-18, 5)], 8),
        0.9,
        seed,
      ),
      1,
    );
    poser(g, m, plastron, metal, { matiere: 'metal', alpha: 0.26, echelle: 0.45, speculaire: { x: 0.28, y: 0.24, r: 0.1 } });
    for (let i = 0; i < 3; i += 1) {
      ruban(g, [pt(-16 + i * 2, -12 + i * 8), pt(16 - i * 2, -14 + i * 8)], ombreBleutee(metal, 0.5), 1.6, 0.5);
    }
    if (rarete !== 'commun') {
      ruban(g, [pt(-14, -18), pt(0, -22), pt(15, -17)], LIGHT.rim, 2.2);
      gemme(g, 0, -6, 4.4, gem, seed + 11);
    }
    if (rarete === 'relique') ruban(g, [pt(0, -2), pt(0, 16)], LIGHT.rim, 2);
  },
  mains: (g, m, metal, gem, seed, rarete) => {
    const gant = lisser(
      perturber(densifier([pt(-16, 20), pt(-18, -4), pt(-9, -18), pt(6, -20), pt(16, -6), pt(15, 20)], 8), 0.9, seed),
      1,
    );
    poser(g, m, gant, metal, { matiere: 'metal', alpha: 0.26, echelle: 0.4, speculaire: { x: 0.3, y: 0.24, r: 0.09 } });
    for (let i = 0; i < 4; i += 1) {
      const x = -12 + i * 8;
      poser(g, m, perturber(densifier([pt(x - 3, -18), pt(x + 3, -19), pt(x + 3, -28 - (i === 1 ? 4 : 0)), pt(x - 3, -27 - (i === 1 ? 4 : 0))], 4), 0.4, seed + i), eclaircir(metal, 0.16), {
        matiere: 'metal',
        alpha: 0.24,
      });
    }
    for (let i = 0; i < 2; i += 1) ruban(g, [pt(-16, 2 + i * 8), pt(15, 0 + i * 8)], ombreBleutee(metal, 0.45), 1.8, 0.55);
    if (rarete !== 'commun') gemme(g, 0, 8, 4, gem, seed + 13);
  },
  anneau1: (g, m, metal, gem, seed, rarete) => {
    const ext = blob(0, 4, 17, 17, { seed, points: 22, wobble: 0.1 });
    poser(g, m, ext, metal, { matiere: 'metal', alpha: 0.24, echelle: 0.35, speculaire: { x: 0.3, y: 0.28, r: 0.1 } });
    g.poly(flat(blob(0, 4, 11, 11, { seed: seed + 3, points: 20, wobble: 0.12 }))).fill({
      color: ombreBleutee(metal, 0.8),
      alpha: 0.9,
    });
    gemme(g, 0, -15, rarete === 'commun' ? 4 : 6.5, gem, seed + 5);
    if (rarete === 'majeur' || rarete === 'relique') {
      for (const s of [-1, 1] as const) gemme(g, s * 12, -6, 3, melanger(gem, LIGHT.chaude, 0.4), seed + s + 9);
    }
  },
  ceinture: (g, m, metal, gem, seed, rarete) => {
    const sangle = lisser(
      perturber(densifier([pt(-26, -8), pt(26, -10), pt(25, 6), pt(-25, 8)], 8), 0.7, seed),
      1,
    );
    poser(g, m, sangle, melanger(BOIS, GRANIT, 0.36), { matiere: 'grain', alpha: 0.22, echelle: 0.4 });
    for (let i = 0; i < 6; i += 1) {
      g.poly(flat(blob(-20 + i * 8, -1, 2, 2, { seed: i + seed, points: 8, wobble: 0.28 }))).fill({
        color: eclaircir(metal, 0.2),
        alpha: 0.85,
      });
    }
    const boucle = lisser(perturber(densifier([pt(-10, -14), pt(10, -15), pt(11, 12), pt(-10, 13)], 6), 0.6, seed + 3), 1);
    poser(g, m, boucle, metal, { matiere: 'metal', alpha: 0.24, echelle: 0.35, speculaire: { x: 0.3, y: 0.24, r: 0.11 } });
    g.poly(flat(blob(0, -1, 5, 8, { seed: seed + 5, points: 14, wobble: 0.16 }))).fill({ color: ombreBleutee(metal, 0.8), alpha: 0.9 });
    if (rarete !== 'commun') gemme(g, 17, -2, 4, gem, seed + 7);
  },
  pieds: (g, m, metal, gem, seed, rarete) => {
    const botte = lisser(
      perturber(
        densifier([pt(-14, -22), pt(6, -24), pt(9, -2), pt(24, 8), pt(24, 20), pt(-14, 21)], 9),
        0.9,
        seed,
      ),
      1,
    );
    poser(g, m, botte, melanger(BOIS, GRANIT, 0.3), { matiere: 'grain', alpha: 0.24, echelle: 0.4 });
    poser(g, m, perturber(densifier([pt(-15, 14), pt(25, 12), pt(25, 21), pt(-15, 22)], 6), 0.6, seed + 3), assombrir(BOIS, 0.4), {
      matiere: 'grain',
      alpha: 0.2,
    });
    for (let i = 0; i < 3; i += 1) ruban(g, [pt(-13, -16 + i * 7), pt(6, -18 + i * 7)], metal, 1.8, 0.7);
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(-10 + i * 8, 19, 1.6, 1.4, { seed: i + seed, points: 8, wobble: 0.3 }))).fill({
        color: eclaircir(metal, 0.25),
        alpha: 0.85,
      });
    }
    if (rarete !== 'commun') gemme(g, -6, -14, 3.6, gem, seed + 9);
  },
  banniere: (g, m, metal, gem, seed, rarete) => {
    ruban(g, [pt(-16, 26), pt(-14, -26)], melanger(BOIS, GRANIT, 0.4), 4);
    const etoffe = lisser(
      perturber(
        densifier([pt(-13, -22), pt(20, -19), pt(21, 4), pt(12, 10), pt(20, 16), pt(-13, 14)], 8),
        0.8,
        seed,
      ),
      1,
    );
    poser(g, m, etoffe, rarete === 'relique' ? GRENAT : melanger(GRENAT, GRANIT, 0.25), {
      matiere: 'tissu',
      alpha: 0.26,
      echelle: 0.5,
    });
    ruban(g, [pt(-12, -18), pt(19, -15)], LIGHT.rim, 2);
    ruban(g, [pt(-12, 10), pt(15, 8)], LIGHT.rim, 2, 0.7);
    gemme(g, 3, -4, rarete === 'commun' ? 3.4 : 5, gem, seed + 5);
    poser(g, m, fuseau(-14, -26, -14, -34, 7, { seed, taper: 0.6 }), metal, {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.24, r: 0.14 },
    });
  },
  relique: (g, m, metal, gem, seed) => {
    // coffret reliquaire par défaut
    const boite = lisser(perturber(densifier([pt(-20, 18), pt(20, 16), pt(18, -6), pt(-18, -4)], 8), 0.8, seed), 1);
    poser(g, m, boite, melanger(BOIS, GRENAT, 0.3), { matiere: 'ecorce', alpha: 0.24, echelle: 0.35 });
    poser(g, m, arcBande(0, -5, 18, 12, Math.PI, Math.PI * 2, 7, 0.06), metal, {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.2, r: 0.1 },
    });
    for (const x of [-11, 11]) ruban(g, [pt(x, 18), pt(x, -16)], metal, 2.6, 0.85);
    gemme(g, 0, -8, 6, gem, seed + 3);
    for (let i = 0; i < 3; i += 1) {
      g.poly(flat(blob(-9 + i * 9, 8, 2.4, 2.6, { seed: i + seed, points: 10, wobble: 0.24 }))).fill({
        color: LIGHT.rim,
        alpha: 0.8,
      });
    }
  },
};

PAR_EMPLACEMENT.anneau2 = PAR_EMPLACEMENT.anneau1;

/* ────────────────── Pièces au dessin propre (curatées) ──────────────────── */

const CURATEES: Record<string, Forme> = {
  bourdon_de_pelerin: (g, m, metal) => {
    ruban(g, [pt(-6, 28), pt(-1, -26)], melanger(BOIS, GRANIT, 0.3), 5.4);
    poser(g, m, blob(-1, -28, 6, 6.4, { seed: 3, points: 13, wobble: 0.2 }), melanger(BOIS, OCRE, 0.3), {
      matiere: 'ecorce',
      alpha: 0.26,
      echelle: 0.3,
    });
    poser(g, m, blob(13, 2, 11, 10, { seed: 5, points: 16, wobble: 0.12 }), melanger(PARCHEMIN, OCRE, 0.22), {
      matiere: 'granit',
      alpha: 0.2,
      echelle: 0.35,
    });
    for (let i = 0; i < 5; i += 1) {
      const a = -2.4 + i * 0.5;
      ruban(g, [pt(13, 11), pt(13 + Math.cos(a) * 10, 11 + Math.sin(a) * 11)], assombrir(PARCHEMIN, 0.4), 1.2, 0.6);
    }
    ruban(g, [pt(-3, -14), pt(6, -12)], metal, 1.8, 0.7);
  },
  bourdon_du_premier_pelerin: (g, m) => {
    ruban(g, [pt(-6, 28), pt(-1, -24)], melanger(BOIS, LIGHT.rim, 0.22), 6);
    for (let i = 3; i >= 1; i -= 1) {
      g.poly(flat(blob(-1, -26, 9 * (i / 3) + 3, 9 * (i / 3) + 3, { seed: i * 7, points: 15, wobble: 0.22 }))).fill({
        color: melanger(LIGHT.rim, LIGHT.chaude, 1 - i / 3),
        alpha: 0.18,
      });
    }
    poser(g, m, blob(-1, -26, 7, 7.4, { seed: 9, points: 14, wobble: 0.18 }), LIGHT.rim, {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.24, r: 0.16 },
    });
    for (let i = 0; i < 4; i += 1) {
      ruban(g, [pt(-4, -12 + i * 10), pt(4, -14 + i * 10)], LIGHT.rim, 1.8, 0.75);
    }
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(10 + (i % 2) * 6, -14 + i * 9, 2, 2.2, { seed: i + 3, points: 8, wobble: 0.3 }))).fill({
        color: LIGHT.chaude,
        alpha: 0.55,
      });
    }
  },
  cor_de_veneur: (g, m) => {
    poser(g, m, arcBande(-2, 2, 20, 18, 0.4, 3.7, 9, 0.55), melanger(CUIVRE, LIGHT.rim, 0.32), {
      matiere: 'metal',
      alpha: 0.24,
      echelle: 0.35,
      speculaire: { x: 0.3, y: 0.24, r: 0.1 },
    });
    poser(g, m, blob(-22, 4, 8, 9, { seed: 3, points: 14, wobble: 0.2 }), melanger(CUIVRE, LIGHT.rim, 0.45), {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.26, r: 0.14 },
    });
    ruban(g, [pt(-16, -12), pt(0, -18), pt(16, -10)], melanger(VERT, SAPIN, 0.3), 3.4);
    for (let i = 0; i < 3; i += 1) {
      g.poly(flat(blob(-8 + i * 8, -16, 2.2, 2.4, { seed: i + 5, points: 10, wobble: 0.24 }))).fill({ color: LIGHT.rim, alpha: 0.85 });
    }
  },
  lanterne_des_sagnes: (g, m) => {
    poser(g, m, perturber(densifier([pt(-13, 20), pt(13, 19), pt(11, -8), pt(-11, -7)], 8), 0.7, 3), melanger(ACIER, GRANIT, 0.3), {
      matiere: 'metal',
      alpha: 0.24,
      echelle: 0.4,
    });
    for (let i = 3; i >= 1; i -= 1) {
      g.poly(flat(blob(0, 8, 11 * (i / 3), 14 * (i / 3), { seed: i * 5, points: 16, wobble: 0.22 }))).fill({
        color: melanger(BRUME, LIGHT.chaude, 1 - i / 3),
        alpha: 0.26,
      });
    }
    g.poly(flat(blob(0, 9, 4, 6, { seed: 11, points: 12, wobble: 0.24 }))).fill({ color: LIGHT.chaude, alpha: 0.9 });
    poser(g, m, perturber(densifier([pt(-15, -8), pt(15, -9), pt(9, -18), pt(-9, -17)], 6), 0.6, 7), melanger(ACIER, LIGHT.rim, 0.3), {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.22, r: 0.12 },
    });
    g.poly(flat(arcBande(0, -18, 9, 9, Math.PI, Math.PI * 2, 3, 0))).fill({ color: LIGHT.rim, alpha: 0.9 });
  },
  carte_du_senechal: (g, m) => {
    poser(g, m, lisser(perturber(densifier([pt(-24, -16), pt(22, -18), pt(24, 14), pt(-22, 16)], 8), 0.9, 3), 1), PARCHEMIN, {
      matiere: 'parchemin',
      alpha: 0.32,
      echelle: 0.5,
      modele: 0.85,
    });
    ruban(g, [pt(-19, 8), pt(-6, -4), pt(7, 2), pt(19, -10)], melanger(GRENAT, BOIS, 0.35), 1.8, 0.75);
    for (let i = 0; i < 4; i += 1) {
      g.poly(flat(blob(-16 + i * 11, 2 - i * 3, 2.2, 2.2, { seed: i + 5, points: 10, wobble: 0.24 }))).fill({
        color: LIGHT.rim,
        alpha: 0.85,
      });
    }
    for (const x of [-24, 22]) {
      poser(g, m, blob(x, -1, 4.4, 17, { seed: x, points: 16, wobble: 0.12 }), melanger(PARCHEMIN, BOIS, 0.3), {
        matiere: 'parchemin',
        alpha: 0.28,
        echelle: 0.4,
      });
    }
  },
  calice_de_lhermitage: (g, m) => {
    poser(g, m, lisser(perturber(densifier([pt(-14, -16), pt(14, -17), pt(9, 2), pt(-9, 3)], 8), 0.6, 3), 1), LIGHT.rim, {
      matiere: 'metal',
      alpha: 0.24,
      echelle: 0.35,
      speculaire: { x: 0.28, y: 0.24, r: 0.1 },
    });
    g.poly(flat(blob(0, -16, 13, 3.6, { seed: 5, points: 18, wobble: 0.14 }))).fill({
      color: melanger(BRUME, LIGHT.chaude, 0.4),
      alpha: 0.8,
    });
    ruban(g, [pt(0, 2), pt(0, 14)], LIGHT.rim, 4.4);
    poser(g, m, blob(0, 8, 5, 4, { seed: 7, points: 12, wobble: 0.2 }), eclaircir(LIGHT.rim, 0.3), { matiere: 'metal', alpha: 0.24 });
    poser(g, m, blob(0, 18, 15, 5, { seed: 9, points: 18, wobble: 0.14 }), LIGHT.rim, {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.26, r: 0.12 },
    });
    for (let i = 0; i < 3; i += 1) gemme(g, -8 + i * 8, -8, 2.6, i % 2 ? CUIVRE : GRENAT, i + 3);
  },
  couronne_comtale_de_forez: (g, m) => {
    poser(g, m, perturber([pt(-26, 6), pt(-18, -16), pt(-9, 0), pt(0, -24), pt(9, 0), pt(18, -16), pt(26, 6), pt(22, 18), pt(-22, 18)], 0.8, 3), LIGHT.rim, {
      matiere: 'metal',
      alpha: 0.24,
      echelle: 0.35,
      speculaire: { x: 0.3, y: 0.3, r: 0.09 },
    });
    for (const [x, y] of [
      [-18, -18],
      [0, -26],
      [18, -18],
    ] as const) {
      gemme(g, x, y, 4.4, GRENAT, x + 40);
    }
    for (let i = 0; i < 5; i += 1) gemme(g, -16 + i * 8, 11, 3, i % 2 ? CUIVRE : GRENAT, i + 7);
    ruban(g, [pt(-24, 3), pt(24, 3)], eclaircir(LIGHT.rim, 0.4), 2, 0.7);
  },
  escarboucle_de_vouivre: (g, m) => {
    for (let i = 4; i >= 1; i -= 1) {
      g.poly(flat(blob(0, 0, 26 * (i / 4), 26 * (i / 4), { seed: i * 7 + 1, points: 18, wobble: 0.2 }))).fill({
        color: melanger(GRENAT, LIGHT.chaude, 1 - i / 4),
        alpha: 0.14,
      });
    }
    const taille: Poly = [];
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2 + 0.2;
      const r = i % 2 ? 15 : 11;
      taille.push(pt(Math.cos(a) * r, Math.sin(a) * r));
    }
    poser(g, m, perturber(taille, 0.5, 5), GRENAT, {
      matiere: 'metal',
      alpha: 0.2,
      echelle: 0.35,
      speculaire: { x: 0.3, y: 0.26, r: 0.14 },
    });
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      ruban(g, [pt(0, 0), pt(Math.cos(a) * 13, Math.sin(a) * 13)], melanger(GRENAT, LIGHT.chaude, 0.4), 1.2, 0.5);
    }
    g.poly(flat(blob(-4, -5, 4, 3.4, { seed: 9, points: 9, wobble: 0.26 }))).fill({ color: LIGHT.chaude, alpha: 0.75 });
  },
  sceptre_des_comtes: (g, m) => {
    ruban(g, [pt(2, 30), pt(-2, -14)], LIGHT.rim, 5);
    for (let i = 0; i < 4; i += 1) ruban(g, [pt(-4, 20 - i * 10), pt(4, 18 - i * 10)], eclaircir(LIGHT.rim, 0.35), 2, 0.7);
    poser(g, m, blob(-2, -20, 11, 11, { seed: 3, points: 16, wobble: 0.16 }), LIGHT.rim, {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.24, r: 0.14 },
    });
    gemme(g, -2, -20, 5, GRENAT, 5);
    for (let i = 0; i < 5; i += 1) {
      const a = -2.7 + i * 0.55;
      g.poly(flat(fuseau(-2, -20, -2 + Math.cos(a) * 17, -20 + Math.sin(a) * 17, 5, { seed: i, taper: 0.7 }))).fill({
        color: melanger(LIGHT.rim, LIGHT.chaude, 0.3),
        alpha: 0.85,
      });
    }
  },
  ramure_du_cerf_miraculeux: (g, m) => {
    for (const cote of [-1, 1] as const) {
      poser(g, m, arcBande(cote * 6, 16, 16, 20, cote > 0 ? -1.9 : -1.25, cote > 0 ? -0.3 : -2.85, 5, 0.6), melanger(PARCHEMIN, CUIVRE, 0.25), {
        matiere: 'ecorce',
        alpha: 0.26,
        echelle: 0.3,
      });
      for (let i = 0; i < 4; i += 1) {
        const t = 0.2 + (i / 4) * 0.72;
        const a = cote > 0 ? -1.9 + t * 1.6 : -1.25 - t * 1.6;
        const bx = cote * 6 + Math.cos(a) * 16;
        const by = 16 + Math.sin(a) * 20;
        g.poly(flat(fuseau(bx, by, bx + cote * 6, by - 10 - i, 3.4, { seed: i + cote, taper: 0.7 }))).fill({
          color: i % 2 ? eclaircir(PARCHEMIN, 0.2) : melanger(PARCHEMIN, CUIVRE, 0.35),
          alpha: 0.92,
        });
      }
    }
    for (let i = 3; i >= 1; i -= 1) {
      g.poly(flat(blob(0, -8, 10 * (i / 3), 10 * (i / 3), { seed: i * 5, points: 14, wobble: 0.24 }))).fill({
        color: melanger(BRUME, LIGHT.chaude, 1 - i / 3),
        alpha: 0.22,
      });
    }
  },
  clef_de_la_maison_du_tresor: (g, m) => {
    ruban(g, [pt(0, -22), pt(2, 12)], LIGHT.rim, 5);
    poser(g, m, blob(0, -25, 10, 10, { seed: 3, points: 18, wobble: 0.14 }), LIGHT.rim, {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.24, r: 0.14 },
    });
    g.poly(flat(blob(0, -25, 4.6, 4.6, { seed: 5, points: 12, wobble: 0.2 }))).fill({ color: GRENAT, alpha: 0.85 });
    for (let i = 0; i < 3; i += 1) {
      poser(g, m, perturber(densifier([pt(2, 2 + i * 6), pt(14 - i * 3, 1 + i * 6), pt(14 - i * 3, 6 + i * 6), pt(2, 7 + i * 6)], 4), 0.4, i + 7), LIGHT.rim, {
        matiere: 'metal',
        alpha: 0.24,
      });
    }
    for (let i = 0; i < 4; i += 1) {
      g.poly(flat(blob(-14 + (i % 2) * 6, -6 + i * 8, 1.8, 2, { seed: i + 11, points: 8, wobble: 0.3 }))).fill({
        color: LIGHT.chaude,
        alpha: 0.5,
      });
    }
  },
  serre_du_griffon_couronne: (g, m) => {
    for (let i = 0; i < 3; i += 1) {
      const a = -0.9 + i * 0.8;
      poser(g, m, arcBande(-4, -14, 22, 26, a, a + 1.1, 8, 0.75), melanger(PARCHEMIN, GRANIT, 0.32), {
        matiere: 'granit',
        alpha: 0.24,
        echelle: 0.3,
        speculaire: { x: 0.3, y: 0.28, r: 0.09 },
      });
    }
    poser(g, m, blob(-4, -18, 10, 8, { seed: 3, points: 14, wobble: 0.2 }), melanger(OCRE, BOIS, 0.35), {
      matiere: 'ecailles',
      alpha: 0.26,
      echelle: 0.3,
    });
    g.poly(flat(arcBande(-4, -18, 12, 10, 0.2, Math.PI - 0.2, 3, 0))).fill({ color: LIGHT.rim, alpha: 0.9 });
    gemme(g, -4, -26, 4, GRENAT, 7);
  },
  manteau_de_la_dame_des_brumes: (g, m) => {
    const drape = lisser(
      perturber(
        densifier([pt(-22, -18), pt(0, -24), pt(22, -17), pt(26, 16), pt(9, 22), pt(-8, 16), pt(-25, 21)], 9),
        1,
        3,
      ),
      1,
    );
    poser(g, m, drape, melanger(BRUME, PALETTE.bleuProfond, 0.3), { matiere: 'tissu', alpha: 0.28, echelle: 0.6 });
    for (let i = 0; i < 4; i += 1) {
      ruban(g, [pt(-16 + i * 11, -20), pt(-14 + i * 11, 18)], i % 2 ? eclaircir(BRUME, 0.35) : ombreBleutee(BRUME, 0.5), 1.8, 0.4);
    }
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(-20 + i * 10, -22 + (i % 2) * 8, 8 - i * 0.6, 4, { seed: i * 5, points: 14, wobble: 0.3 }))).fill({
        color: melanger(BRUME, LIGHT.chaude, 0.3),
        alpha: 0.24,
      });
    }
    ruban(g, [pt(-20, -19), pt(0, -25), pt(20, -18)], LIGHT.rim, 2.2);
  },
  pierre_de_pamole: (g, m) => {
    poser(g, m, lisser(perturber(densifier([pt(-19, 20), pt(-16, -8), pt(-4, -22), pt(11, -18), pt(19, 2), pt(16, 20)], 9), 2, 3), 0), melanger(GRANIT_CLAIR, GRANIT, 0.38), {
      matiere: 'granit',
      alpha: 0.34,
      echelle: 0.55,
    });
    const faille: Poly = [];
    for (let i = 0; i <= 6; i += 1) {
      const t = i / 6;
      faille.push(pt(-10 + t * 20 + Math.sin(t * 9) * 3, -20 + t * 38));
    }
    ruban(g, faille, ombreBleutee(GRANIT, 1), 4.4, 0.85);
    ruban(g, faille, melanger(CUIVRE, LIGHT.chaude, 0.45), 1.8, 0.8);
    for (let i = 0; i < 5; i += 1) {
      g.poly(flat(blob(-12 + i * 7, 14 - (i % 2) * 5, 2.4, 1.8, { seed: i + 5, points: 9, wobble: 0.34 }))).fill({
        color: melanger(PALETTE.mousseSombre, VERT, 0.4),
        alpha: 0.55,
      });
    }
  },
  gourde_des_sagnes: (g, m) => {
    poser(g, m, blob(0, 4, 17, 19, { seed: 3, points: 18, wobble: 0.14 }), melanger(BOIS, PARCHEMIN, 0.34), {
      matiere: 'grain',
      alpha: 0.22,
      echelle: 0.4,
    });
    ruban(g, [pt(-16, -2), pt(16, -4)], melanger(BOIS, GRANIT, 0.4), 3, 0.7);
    poser(g, m, perturber(densifier([pt(-5, -16), pt(5, -17), pt(4, -26), pt(-4, -25)], 5), 0.5, 5), melanger(BOIS, GRANIT, 0.34), {
      matiere: 'ecorce',
      alpha: 0.26,
    });
    poser(g, m, blob(0, -27, 6, 3.4, { seed: 7, points: 12, wobble: 0.2 }), melanger(BOIS, OCRE, 0.4), { matiere: 'ecorce', alpha: 0.26 });
    for (let i = 0; i < 4; i += 1) {
      g.poly(flat(blob(-8 + i * 6, 2 + (i % 2) * 6, 2.2, 2.4, { seed: i + 9, points: 10, wobble: 0.26 }))).fill({
        color: melanger(BRUME, LIGHT.chaude, 0.4),
        alpha: 0.4,
      });
    }
  },
  lorgnette_de_belvedere: (g, m) => {
    for (let i = 0; i < 3; i += 1) {
      poser(g, m, perturber(densifier([pt(-24 + i * 15, -8 + i * 1.4), pt(-10 + i * 15, -10 + i * 1.4), pt(-10 + i * 15, 8 - i * 1.4), pt(-24 + i * 15, 10 - i * 1.4)], 6), 0.6, i + 3), melanger(CUIVRE, LIGHT.rim, 0.2 + i * 0.12), {
        matiere: 'metal',
        alpha: 0.24,
        echelle: 0.35,
        speculaire: { x: 0.3, y: 0.24, r: 0.1 },
      });
    }
    g.poly(flat(blob(21, 0, 4.4, 9, { seed: 9, points: 14, wobble: 0.16 }))).fill({
      color: melanger(BRUME, LIGHT.chaude, 0.4),
      alpha: 0.8,
    });
    ruban(g, [pt(-22, 12), pt(0, 20), pt(20, 12)], melanger(BOIS, GRENAT, 0.3), 2.4, 0.7);
  },
  sifflet_de_la_halle: (g, m) => {
    poser(g, m, lisser(perturber(densifier([pt(-22, -6), pt(14, -10), pt(20, 0), pt(12, 8), pt(-22, 6)], 7), 0.6, 3), 1), melanger(ACIER, LIGHT.rim, 0.35), {
      matiere: 'metal',
      alpha: 0.24,
      echelle: 0.35,
      speculaire: { x: 0.3, y: 0.24, r: 0.11 },
    });
    g.poly(flat(blob(-4, -1, 3.4, 3.4, { seed: 5, points: 11, wobble: 0.22 }))).fill({ color: ombreBleutee(ACIER, 0.9), alpha: 0.9 });
    ruban(g, [pt(-22, 0), pt(-30, -8)], melanger(BOIS, GRENAT, 0.35), 2.6, 0.8);
    for (let i = 0; i < 4; i += 1) {
      const r = 8 + i * 6;
      g.poly(flat(arcBande(20, 0, r, r * 0.85, -0.9, 0.9, 1.6, 0.2))).fill({
        color: melanger(LIGHT.rim, LIGHT.chaude, i * 0.2),
        alpha: 0.34 - i * 0.06,
      });
    }
  },
};

/* ────────────────────────────── Rendu public ────────────────────────────── */

/** Toutes les clefs d'artefact, lues depuis le contenu. */
export function clesArtefacts(): string[] {
  return Object.values(ARTIFACTS).map((a) => a.icon);
}

/** Dessine l'icône d'un artefact à partir de sa définition de contenu. */
export function dessinerArtefact(mats: MaterialSet, key: string): Graphics {
  const id = key.startsWith('artefact_') ? key.slice('artefact_'.length) : key;
  const def = ARTIFACTS[id];
  if (!def) throw new Error(`Artefact inconnu dans l'atlas artistique : ${id}`);
  const seed = hashString(id) % 9973;
  const g = new Graphics();
  fond(g, mats, def.rarity, seed);
  const metal = metalDe(def.rarity);
  const gem = gemmeDe(seed);
  const curatee = CURATEES[id];
  if (curatee) {
    curatee(g, mats, metal, gem, seed, def.rarity);
    return g;
  }
  const forme = PAR_EMPLACEMENT[def.slot] ?? PAR_EMPLACEMENT.relique;
  forme(g, mats, metal, gem, seed, def.rarity);
  // variation déterministe : quelques appliques, jamais deux fois les mêmes
  const rand = prng(seed);
  const n = 2 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = 20 + rand() * 8;
    g.poly(flat(blob(Math.cos(a) * r, Math.sin(a) * r, 1.4 + rand() * 1.6, 1.3 + rand() * 1.4, { seed: i * 7 + seed, points: 8, wobble: 0.3 }))).fill({
      color: def.rarity === 'commun' ? melanger(metal, LIGHT.chaude, 0.3) : LIGHT.rim,
      alpha: 0.42 + rand() * 0.3,
    });
  }
  return g;
}
