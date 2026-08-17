/**
 * Icônes d'objets de carte et jetons de ressource.
 *
 * Les clefs `carte_<kind>` couvrent l'intégralité de `MapObjectKind`
 * (packages/engine/src/types.ts) ; les clefs `ressource_<key>` couvrent les
 * sept ressources. Chaque icône est un petit objet peint, pas un pictogramme
 * plat : trois strates, ombre portée orientée, liseré doré.
 *
 * Origine (0, 0) : point de contact au sol, au milieu de la base.
 */
import { Graphics } from 'pixi.js';
import {
  LIGHT,
  PALETTE,
  RESOURCE_COLORS,
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
  flat,
  fuseau,
  lisser,
  ombreProjetee,
  peindre,
  perturber,
  pt,
} from './shading.js';
import { prng } from './noise.js';

const GRANIT = PALETTE.granitAnthracite;
const GRANIT_CLAIR = PALETTE.granitClair;
const BOIS = PALETTE.brunFougere;
const OCRE = PALETTE.ocre;
const ARDOISE = 0x414a52;
const PARCHEMIN = PALETTE.parchemin;
const GRENAT = PALETTE.grenat;
const VERT = PALETTE.vertHetre;

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
    matiereEchelle: o.echelle ?? 0.5,
    modele: o.modele ?? 1,
    rim: o.rim !== false,
    speculaire: o.speculaire ?? null,
  });
}

/** Planche de bois : la brique de base des installations. */
function planche(g: Graphics, mats: MaterialSet, a: { x: number; y: number }, b: { x: number; y: number }, w: number, seed: number, teinte: number = BOIS): void {
  poser(g, mats, fuseau(a.x, a.y, b.x, b.y, w, { seed, taper: 0.1, bias: 1.6 }), teinte, {
    matiere: 'ecorce',
    alpha: 0.26,
    echelle: 0.3,
  });
}

/* ───────────────────────── Objets de la carte ───────────────────────────── */

function mine(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 22, 26, { seed: 3 });
  // gueule de galerie taillée dans le rocher
  const roche = lisser(
    perturber(densifier([pt(-24, 0), pt(-22, -20), pt(-8, -30), pt(12, -28), pt(24, -14), pt(22, 0)], 8), 1.6, 5),
    0,
  );
  poser(g, mats, roche, melanger(GRANIT_CLAIR, GRANIT, 0.4), { matiere: 'granit', alpha: 0.32, echelle: 0.6 });
  const gueule = arcBande(0, 0, 11, 15, Math.PI, Math.PI * 2, 22, 0);
  g.poly(flat(gueule)).fill({ color: ombreBleutee(GRANIT, 1), alpha: 0.9 });
  // cadre de boisage
  planche(g, mats, { x: -12, y: 0 }, { x: -11, y: -19 }, 5, 7);
  planche(g, mats, { x: 12, y: 0 }, { x: 11, y: -19 }, 5, 9);
  planche(g, mats, { x: -14, y: -19 }, { x: 14, y: -20 }, 5, 11);
  // chevalement : deux mâts et une poulie
  planche(g, mats, { x: -9, y: -20 }, { x: -3, y: -44 }, 4, 13);
  planche(g, mats, { x: 9, y: -20 }, { x: 3, y: -44 }, 4, 15);
  poser(g, mats, blob(0, -45, 6, 6, { seed: 4, points: 13, wobble: 0.18 }), melanger(ARDOISE, LIGHT.rim, 0.25), {
    matiere: 'metal',
    alpha: 0.24,
    speculaire: { x: 0.3, y: 0.26, r: 0.16 },
  });
  g.moveTo(0, -45);
  g.lineTo(0, -26);
  g.stroke({ color: assombrir(ARDOISE, 0.2), width: 1.4, alpha: 0.8 });
  // wagonnet et minerai
  poser(g, mats, perturber(densifier([pt(14, -2), pt(28, -3), pt(27, -12), pt(15, -11)], 5), 0.8, 17), melanger(BOIS, ARDOISE, 0.4), {
    matiere: 'ecorce',
    alpha: 0.24,
  });
  for (let i = 0; i < 4; i += 1) {
    g.poly(flat(blob(17 + i * 3.4, -13 - (i % 2) * 2, 2.6, 2.2, { seed: i + 2, points: 9, wobble: 0.3 }))).fill({
      color: i % 2 ? melanger(GRANIT_CLAIR, LIGHT.chaude, 0.3) : melanger(0x6d7681, GRANIT, 0.3),
      alpha: 0.9,
    });
  }
}

function ressourceTas(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 22, 14, { seed: 5 });
  // deux sacs, trois billes de bois, un lingot
  for (const [x, y, r] of [
    [-11, -1, 11],
    [7, -2, 12],
  ] as const) {
    const sac = lisser(
      perturber(densifier([pt(x - r, y), pt(x - r * 0.82, y - r * 1.2), pt(x - r * 0.2, y - r * 1.5), pt(x + r * 0.6, y - r * 1.3), pt(x + r, y - r * 0.2), pt(x + r * 0.6, y + r * 0.15)], 6), 0.9, x + 3),
      1,
    );
    poser(g, mats, sac, melanger(PARCHEMIN, BOIS, 0.38), { matiere: 'tissu', alpha: 0.26, echelle: 0.4 });
    g.moveTo(x - r * 0.5, y - r * 1.32);
    g.quadraticCurveTo(x, y - r * 1.62, x + r * 0.4, y - r * 1.28);
    g.stroke({ color: assombrir(BOIS, 0.3), width: 1.6, alpha: 0.8 });
  }
  for (let i = 0; i < 3; i += 1) {
    const x = -20 + i * 7;
    g.poly(flat(blob(x, -2 - (i % 2) * 4, 4.2, 3.6, { seed: i * 3 + 1, points: 12, wobble: 0.18 }))).fill({
      color: i % 2 ? melanger(BOIS, OCRE, 0.35) : assombrir(BOIS, 0.2),
      alpha: 0.95,
    });
    g.poly(flat(blob(x - 1, -3 - (i % 2) * 4, 1.8, 1.6, { seed: i * 3 + 2, points: 9, wobble: 0.24 }))).fill({
      color: melanger(OCRE, LIGHT.chaude, 0.4),
      alpha: 0.7,
    });
  }
  poser(g, mats, perturber(densifier([pt(14, -1), pt(24, -2), pt(23, -7), pt(15, -6)], 4), 0.5, 21), LIGHT.rim, {
    matiere: 'metal',
    alpha: 0.24,
    speculaire: { x: 0.28, y: 0.3, r: 0.18 },
  });
}

function artefact(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 20, 18, { seed: 7 });
  const coffre = lisser(
    perturber(densifier([pt(-19, 0), pt(19, -1), pt(18, -16), pt(-18, -15)], 7), 0.8, 23),
    0,
  );
  poser(g, mats, coffre, melanger(BOIS, GRENAT, 0.22), { matiere: 'ecorce', alpha: 0.26, echelle: 0.35 });
  // couvercle bombé, entrouvert
  const couvercle = arcBande(0, -16, 18, 11, Math.PI, Math.PI * 2, 7, 0.05);
  poser(g, mats, couvercle, melanger(BOIS, GRENAT, 0.3), { matiere: 'ecorce', alpha: 0.24, echelle: 0.35 });
  // ferrures et serrure
  for (const x of [-11, 11]) {
    poser(g, mats, perturber(densifier([pt(x - 2.6, 1), pt(x + 2.6, 0.6), pt(x + 2.4, -24), pt(x - 2.4, -23.6)], 6), 0.4, x), melanger(ARDOISE, LIGHT.rim, 0.3), {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.2, r: 0.1 },
    });
  }
  poser(g, mats, blob(0, -13, 4.4, 5, { seed: 3, points: 12, wobble: 0.2 }), LIGHT.rim, {
    matiere: 'metal',
    alpha: 0.24,
    speculaire: { x: 0.3, y: 0.26, r: 0.2 },
  });
  // lumière chaude qui s'échappe du coffre
  for (let i = 3; i >= 1; i -= 1) {
    g.poly(flat(blob(0, -20, 12 * (i / 3) + 4, 8 * (i / 3) + 3, { seed: i * 5, points: 14, wobble: 0.24 }))).fill({
      color: melanger(LIGHT.rim, LIGHT.chaude, 1 - i / 3),
      alpha: 0.16,
    });
  }
  for (let i = 0; i < 4; i += 1) {
    g.poly(flat(blob(-8 + i * 5.4, -21 - (i % 2) * 4, 1.6, 1.8, { seed: i + 9, points: 8, wobble: 0.3 }))).fill({
      color: LIGHT.chaude,
      alpha: 0.7,
    });
  }
}

function sanctuaire(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 20, 30, { seed: 9 });
  // édicule de granit à niche
  const socle = perturber(densifier([pt(-19, 0), pt(19, -1), pt(16, -9), pt(-16, -8)], 6), 1, 27);
  poser(g, mats, socle, melanger(GRANIT_CLAIR, GRANIT, 0.36), { matiere: 'granit', alpha: 0.3, echelle: 0.55 });
  const fut = perturber(densifier([pt(-13, -8), pt(13, -9), pt(11, -34), pt(-11, -33)], 8), 1, 29);
  poser(g, mats, fut, melanger(GRANIT_CLAIR, PALETTE.parcheminOmbre, 0.2), { matiere: 'granit', alpha: 0.3, echelle: 0.5 });
  const fronton = perturber(densifier([pt(-15, -33), pt(15, -34), pt(0, -47)], 8), 1.2, 31);
  poser(g, mats, fronton, melanger(GRANIT_CLAIR, ARDOISE, 0.3), { matiere: 'granit', alpha: 0.3, echelle: 0.5 });
  // niche creusée, ombre bleutée
  const niche = arcBande(0, -20, 7, 9, Math.PI, Math.PI * 2, 15, 0);
  g.poly(flat(niche)).fill({ color: ombreBleutee(GRANIT, 0.95), alpha: 0.88 });
  // flamme votive
  for (let i = 3; i >= 1; i -= 1) {
    g.poly(flat(blob(0, -20, 5 * (i / 3) + 1.5, 8 * (i / 3) + 2, { seed: i * 3 + 2, points: 12, wobble: 0.3 }))).fill({
      color: i === 1 ? LIGHT.chaude : melanger(OCRE, LIGHT.chaude, i / 3),
      alpha: 0.28 + (3 - i) * 0.2,
    });
  }
  // croix de faîtage
  g.moveTo(0, -47);
  g.lineTo(0, -56);
  g.moveTo(-4.6, -52);
  g.lineTo(4.6, -52);
  g.stroke({ color: LIGHT.rim, width: 2, alpha: 0.85, cap: 'round' });
  // brin de mousse au socle
  for (let i = 0; i < 4; i += 1) {
    g.poly(flat(blob(-16 + i * 9, -1.5, 2.4, 1.8, { seed: i + 5, points: 9, wobble: 0.34 }))).fill({
      color: melanger(PALETTE.mousseSombre, VERT, 0.4),
      alpha: 0.6,
    });
  }
}

function auberge(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 18, 24, { seed: 11 });
  // poteau et potence
  planche(g, mats, { x: -14, y: 0 }, { x: -13, y: -50 }, 6, 33);
  planche(g, mats, { x: -13, y: -46 }, { x: 16, y: -48 }, 5, 35);
  planche(g, mats, { x: -13, y: -34 }, { x: 4, y: -46 }, 4, 37);
  // enseigne suspendue, elle balance
  const ens = lisser(
    perturber(densifier([pt(-2, -42), pt(24, -43), pt(23, -18), pt(-1, -17)], 7), 0.9, 39),
    0,
  );
  poser(g, mats, ens, melanger(BOIS, PARCHEMIN, 0.3), { matiere: 'ecorce', alpha: 0.24, echelle: 0.35 });
  g.poly(flat(ens), true).stroke({ color: LIGHT.rim, width: 1.6, alpha: 0.8 });
  // pichet peint sur l'enseigne
  poser(g, mats, blob(10, -29, 6.4, 8, { seed: 4, points: 14, wobble: 0.2 }), melanger(OCRE, GRENAT, 0.24), {
    matiere: 'grain',
    alpha: 0.18,
    speculaire: { x: 0.3, y: 0.26, r: 0.12 },
  });
  g.poly(flat(arcBande(17, -30, 4, 4.6, -1.4, 1.4, 2.2, 0.2))).fill({ color: melanger(OCRE, GRENAT, 0.24), alpha: 0.95 });
  g.poly(flat(blob(10, -35, 5.4, 2.4, { seed: 6, points: 12, wobble: 0.24 }))).fill({
    color: melanger(PARCHEMIN, LIGHT.chaude, 0.4),
    alpha: 0.85,
  });
  // anneaux de suspension
  for (const x of [1, 21]) {
    g.poly(flat(blob(x, -44, 2.2, 2.4, { seed: x, points: 9, wobble: 0.24 }))).fill({ color: LIGHT.rim, alpha: 0.9 });
  }
}

function sceau(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 18, 30, { seed: 13 });
  // pierre levée
  const pierre = lisser(
    perturber(densifier([pt(-15, 0), pt(-13, -30), pt(-5, -46), pt(8, -44), pt(15, -26), pt(14, 0)], 8), 1.6, 41),
    0,
  );
  poser(g, mats, pierre, melanger(GRANIT_CLAIR, GRANIT, 0.42), { matiere: 'granit', alpha: 0.34, echelle: 0.6 });
  // le sceau lui-même : cire enchâssée, rayonnante
  for (let i = 3; i >= 1; i -= 1) {
    g.poly(flat(blob(0, -25, 9 * (i / 3) + 2, 9 * (i / 3) + 2, { seed: i * 7, points: 16, wobble: 0.22 }))).fill({
      color: melanger(GRENAT, LIGHT.rim, 1 - i / 3),
      alpha: 0.22,
    });
  }
  poser(g, mats, blob(0, -25, 8, 8.4, { seed: 3, points: 18, wobble: 0.16 }), GRENAT, {
    matiere: 'grain',
    alpha: 0.18,
    speculaire: { x: 0.3, y: 0.26, r: 0.14 },
  });
  // empreinte : une borne entre deux clefs
  g.poly(flat(perturber([pt(-2.4, 3 - 25), pt(2.4, 3 - 25), pt(1.8, -5 - 25), pt(0, -7.4 - 25), pt(-1.8, -5 - 25)], 0.3, 7))).fill({
    color: LIGHT.rim,
    alpha: 0.92,
  });
  for (const s of [-1, 1] as const) {
    g.moveTo(s * 5, -21);
    g.lineTo(s * 5, -29);
    g.stroke({ color: LIGHT.rim, width: 1.3, alpha: 0.85, cap: 'round' });
    g.poly(flat(blob(s * 5, -30.4, 1.5, 1.5, { seed: s + 4, points: 8, wobble: 0.26 }))).fill({ color: LIGHT.rim, alpha: 0.9 });
  }
}

function borneIcone(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 12, 22, { seed: 15 });
  const fut = lisser(
    perturber(densifier([pt(-10, 0), pt(-9, -26), pt(-4, -34), pt(6, -33), pt(10, -24), pt(9, 0)], 7), 1.1, 43),
    0,
  );
  poser(g, mats, fut, melanger(GRANIT_CLAIR, PALETTE.parcheminOmbre, 0.24), { matiere: 'granit', alpha: 0.32, echelle: 0.55 });
  const ec = lisser(perturber(densifier([pt(-5.6, -26), pt(5.6, -25.4), pt(4.8, -14), pt(0, -9.6), pt(-5, -14.4)], 5), 0.4, 45), 1);
  g.poly(flat(ec)).fill({ color: ombreBleutee(GRANIT_CLAIR, 0.7), alpha: 0.8 });
  g.poly(flat(ec), true).stroke({ color: LIGHT.rim, width: 1.3, alpha: 0.72 });
  g.moveTo(-2.6, -21);
  g.lineTo(2.6, -20.6);
  g.moveTo(0, -24);
  g.lineTo(0, -13);
  g.stroke({ color: LIGHT.rim, width: 1.4, alpha: 0.75, cap: 'round' });
}

function caravane(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 26, 16, { seed: 17 });
  // chariot bâché
  const caisse = lisser(perturber(densifier([pt(-24, -6), pt(16, -7), pt(15, -20), pt(-23, -19)], 7), 0.9, 47), 0);
  poser(g, mats, caisse, melanger(BOIS, ARDOISE, 0.28), { matiere: 'ecorce', alpha: 0.26, echelle: 0.32 });
  const bache: Poly = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    bache.push(pt(-23 + t * 38, -20 - Math.sin(t * Math.PI) * 15));
  }
  bache.push(pt(15, -19), pt(-23, -19));
  poser(g, mats, lisser(perturber(bache, 0.7, 49), 1), melanger(PARCHEMIN, BOIS, 0.24), {
    matiere: 'tissu',
    alpha: 0.28,
    echelle: 0.5,
  });
  for (let i = 1; i < 5; i += 1) {
    const t = i / 5;
    g.moveTo(-23 + t * 38, -19);
    g.quadraticCurveTo(-23 + t * 38 + 1, -27, -23 + t * 38, -20 - Math.sin(t * Math.PI) * 15);
    g.stroke({ color: ombreBleutee(PARCHEMIN, 0.5), width: 1.2, alpha: 0.35 });
  }
  // roues : deux disques perturbés à rais
  for (const [cx, r] of [
    [-15, 7],
    [8, 7.6],
  ] as const) {
    poser(g, mats, blob(cx, -r, r, r, { seed: cx, points: 18, wobble: 0.1 }), melanger(BOIS, GRANIT, 0.4), {
      matiere: 'ecorce',
      alpha: 0.24,
      echelle: 0.3,
    });
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + cx * 0.1;
      g.moveTo(cx, -r);
      g.lineTo(cx + Math.cos(a) * r * 0.82, -r + Math.sin(a) * r * 0.82);
      g.stroke({ color: eclaircir(BOIS, 0.3), width: 1.1, alpha: 0.6 });
    }
  }
  // timon et coffret de marchandises
  planche(g, mats, { x: 16, y: -12 }, { x: 30, y: -16 }, 3.6, 51);
  poser(g, mats, perturber(densifier([pt(20, -6), pt(30, -7), pt(29, -14), pt(21, -13)], 4), 0.5, 53), melanger(OCRE, BOIS, 0.4), {
    matiere: 'grain',
    alpha: 0.2,
  });
}

function quete(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 13, 24, { seed: 19 });
  planche(g, mats, { x: 0, y: 0 }, { x: -1, y: -44 }, 6, 55);
  // parchemin cloué, coins qui rebiquent
  const rouleau = lisser(
    perturber(
      densifier([pt(-16, -40), pt(15, -42), pt(17, -14), pt(-1, -10), pt(-15, -13)], 7),
      1,
      57,
    ),
    1,
  );
  poser(g, mats, rouleau, PARCHEMIN, { matiere: 'parchemin', alpha: 0.3, echelle: 0.5, modele: 0.9 });
  for (let i = 0; i < 4; i += 1) {
    const y = -36 + i * 6;
    g.moveTo(-11, y);
    g.lineTo(9 - (i % 2) * 6, y - 1);
    g.stroke({ color: melanger(PALETTE.encre, PARCHEMIN, 0.25), width: 1.2, alpha: 0.55 });
  }
  // sceau de cire et ruban
  g.poly(flat(blob(11, -16, 4.4, 4, { seed: 5, points: 12, wobble: 0.22 }))).fill({ color: GRENAT, alpha: 0.95 });
  g.poly(flat(blob(10, -17, 1.8, 1.6, { seed: 7, points: 8, wobble: 0.3 }))).fill({ color: LIGHT.rim, alpha: 0.7 });
  g.moveTo(11, -13);
  g.quadraticCurveTo(14, -7, 10, -2);
  g.stroke({ color: GRENAT, width: 2.4, alpha: 0.85, cap: 'round' });
  // clou de fixation
  g.poly(flat(blob(-1, -41, 2, 2, { seed: 9, points: 8, wobble: 0.26 }))).fill({ color: eclaircir(ARDOISE, 0.4), alpha: 0.9 });
}

function toit(g: Graphics, mats: MaterialSet, x: number, y: number, w: number, h: number, seed: number): void {
  poser(g, mats, lisser(perturber(densifier([pt(x - w, y), pt(x, y - h), pt(x + w, y + h * 0.06)], 7), 1, seed), 0), ARDOISE, {
    matiere: 'granit',
    alpha: 0.28,
    echelle: 0.4,
  });
  for (let i = 1; i < 4; i += 1) {
    const t = i / 4;
    g.moveTo(x - w + t * w, y - t * h);
    g.lineTo(x + w - t * w * 0.94, y + h * 0.06 - t * h);
    g.stroke({ color: i % 2 ? eclaircir(ARDOISE, 0.3) : ombreBleutee(ARDOISE, 0.5), width: 0.9, alpha: 0.32 });
  }
}

function ville(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 28, 34, { seed: 21 });
  // rempart bas
  poser(g, mats, lisser(perturber(densifier([pt(-30, 0), pt(30, -1), pt(28, -14), pt(-28, -13)], 8), 1.1, 59), 0), melanger(GRANIT_CLAIR, GRANIT, 0.34), {
    matiere: 'granit',
    alpha: 0.3,
    echelle: 0.55,
  });
  for (let i = 0; i < 5; i += 1) {
    const x = -26 + i * 13;
    poser(g, mats, perturber(densifier([pt(x - 4, -13), pt(x + 4, -13.4), pt(x + 3.6, -19), pt(x - 3.8, -18.6)], 4), 0.6, 61 + i), melanger(GRANIT_CLAIR, ARDOISE, 0.3), {
      matiere: 'granit',
      alpha: 0.28,
      echelle: 0.5,
    });
  }
  // maisons derrière et donjon
  poser(g, mats, perturber(densifier([pt(-24, -13), pt(-6, -14), pt(-7, -30), pt(-23, -29)], 6), 0.8, 63), melanger(OCRE, PARCHEMIN, 0.3), {
    matiere: 'parchemin',
    alpha: 0.24,
    echelle: 0.5,
  });
  toit(g, mats, -15, -30, 12, 10, 65);
  poser(g, mats, perturber(densifier([pt(6, -13), pt(24, -14), pt(23, -34), pt(7, -33)], 6), 0.8, 67), melanger(GRANIT_CLAIR, PARCHEMIN, 0.2), {
    matiere: 'granit',
    alpha: 0.28,
    echelle: 0.5,
  });
  toit(g, mats, 15, -34, 12, 11, 69);
  // beffroi central
  poser(g, mats, perturber(densifier([pt(-7, -14), pt(7, -14), pt(6, -44), pt(-6, -43)], 8), 0.8, 71), melanger(GRANIT_CLAIR, GRANIT, 0.24), {
    matiere: 'granit',
    alpha: 0.3,
    echelle: 0.5,
  });
  toit(g, mats, 0, -44, 9, 13, 73);
  // porte et bannière
  g.poly(flat(arcBande(0, 0, 5, 8, Math.PI, Math.PI * 2, 11, 0))).fill({ color: ombreBleutee(GRANIT, 0.95), alpha: 0.9 });
  g.moveTo(0, -57);
  g.lineTo(0, -66);
  g.stroke({ color: melanger(BOIS, GRANIT, 0.4), width: 1.6, alpha: 0.9, cap: 'round' });
  g.poly(flat(perturber([pt(0, -65), pt(13, -62), pt(9, -58), pt(13, -55), pt(0, -55)], 0.7, 3))).fill({
    color: GRENAT,
    alpha: 0.92,
  });
}

function village(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 24, 18, { seed: 23 });
  poser(g, mats, perturber(densifier([pt(-24, 0), pt(-4, -1), pt(-5, -18), pt(-23, -17)], 6), 0.9, 75), melanger(OCRE, PARCHEMIN, 0.34), {
    matiere: 'parchemin',
    alpha: 0.24,
    echelle: 0.5,
  });
  toit(g, mats, -14, -18, 13, 11, 77);
  poser(g, mats, perturber(densifier([pt(2, 0), pt(20, -1), pt(19, -22), pt(3, -21)], 6), 0.9, 79), melanger(OCRE, PARCHEMIN, 0.24), {
    matiere: 'parchemin',
    alpha: 0.24,
    echelle: 0.5,
  });
  toit(g, mats, 11, -22, 12, 10, 81);
  // clôture de perches
  for (let i = 0; i < 5; i += 1) {
    const x = -28 + i * 6;
    planche(g, mats, { x, y: 1 }, { x: x + 0.6, y: -9 }, 2.4, 83 + i);
  }
  planche(g, mats, { x: -29, y: -5 }, { x: -4, y: -6 }, 2, 91);
  // fumée
  for (let i = 0; i < 3; i += 1) {
    g.poly(flat(blob(11 - i * 2, -30 - i * 6, 4 + i * 2.4, 3 + i * 1.8, { seed: i * 5 + 3, points: 12, wobble: 0.3 }))).fill({
      color: melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.3),
      alpha: 0.2 - i * 0.04,
    });
  }
}

function garde(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 20, 20, { seed: 25 });
  // deux piques croisées derrière un écu
  for (const s of [-1, 1] as const) {
    planche(g, mats, { x: s * 20, y: 2 }, { x: -s * 14, y: -46 }, 4, 93 + s, melanger(BOIS, GRANIT, 0.3));
    poser(g, mats, fuseau(-s * 14, -46, -s * 16, -56, 6, { seed: s, taper: 0.6 }), melanger(0x8f99a4, ARDOISE, 0.2), {
      matiere: 'metal',
      alpha: 0.24,
      speculaire: { x: 0.3, y: 0.24, r: 0.14 },
    });
  }
  const ecuP = lisser(
    perturber(densifier([pt(-16, -34), pt(0, -37), pt(16, -33), pt(14, -10), pt(0, 0), pt(-14, -9)], 7), 0.9, 95),
    1,
  );
  poser(g, mats, ecuP, melanger(GRENAT, GRANIT, 0.22), { matiere: 'grain', alpha: 0.2, echelle: 0.5 });
  g.poly(flat(ecuP), true).stroke({ color: LIGHT.rim, width: 1.8, alpha: 0.8 });
  g.poly(flat(perturber([pt(-3, -30), pt(3, -30), pt(3, -21), pt(11, -21), pt(11, -15), pt(3, -15), pt(3, -6), pt(-3, -6), pt(-3, -15), pt(-11, -15), pt(-11, -21), pt(-3, -21)], 0.4, 5))).fill({
    color: LIGHT.rim,
    alpha: 0.88,
  });
}

function maisonTresor(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 26, 30, { seed: 27 });
  // falaise et porte voûtée scellée
  const roche = lisser(
    perturber(densifier([pt(-30, 0), pt(-28, -26), pt(-14, -44), pt(10, -48), pt(28, -34), pt(30, 0)], 9), 2, 97),
    0,
  );
  poser(g, mats, roche, melanger(GRANIT_CLAIR, GRANIT, 0.46), { matiere: 'granit', alpha: 0.34, echelle: 0.65 });
  const voute = arcBande(0, 0, 13, 20, Math.PI, Math.PI * 2, 26, 0);
  g.poly(flat(voute)).fill({ color: ombreBleutee(GRANIT, 1), alpha: 0.9 });
  // vantaux de bronze
  poser(g, mats, perturber(densifier([pt(-11, 0), pt(-1, 0), pt(-1, -20), pt(-8, -18)], 6), 0.7, 99), melanger(0x4e8977, LIGHT.rim, 0.3), {
    matiere: 'metal',
    alpha: 0.24,
    speculaire: { x: 0.3, y: 0.2, r: 0.09 },
  });
  poser(g, mats, perturber(densifier([pt(1, 0), pt(11, 0), pt(8, -18), pt(1, -20)], 6), 0.7, 101), melanger(0x4e8977, ARDOISE, 0.28), {
    matiere: 'metal',
    alpha: 0.24,
    speculaire: { x: 0.3, y: 0.24, r: 0.07 },
  });
  // trois sceaux d'or : la condition d'ouverture
  for (let i = 0; i < 3; i += 1) {
    const x = -10 + i * 10;
    g.poly(flat(blob(x, -26 - (i === 1 ? 5 : 0), 4.4, 4.6, { seed: i * 3 + 1, points: 13, wobble: 0.2 }))).fill({
      color: LIGHT.rim,
      alpha: 0.92,
    });
    g.poly(flat(blob(x - 1, -27 - (i === 1 ? 5 : 0), 1.8, 1.6, { seed: i * 3 + 2, points: 8, wobble: 0.3 }))).fill({
      color: LIGHT.chaude,
      alpha: 0.66,
    });
  }
  // couronne gravée au linteau
  g.poly(flat(perturber([pt(-9, -38), pt(-6, -44), pt(-3, -39), pt(0, -45), pt(3, -39), pt(6, -44), pt(9, -38), pt(9, -35), pt(-9, -35)], 0.5, 7))).fill({
    color: LIGHT.rim,
    alpha: 0.75,
  });
}

function belvedere(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 20, 22, { seed: 29 });
  // cairn de pierres empilées
  const rand = prng(1234);
  let y = 0;
  for (let i = 0; i < 5; i += 1) {
    const w = 17 - i * 2.6;
    const h = 7 - i * 0.5;
    poser(
      g,
      mats,
      lisser(perturber(densifier([pt(-w, y), pt(w * 0.9, y - 1), pt(w * 0.8, y - h), pt(-w * 0.9, y - h + 1)], 6), 1.2, 103 + i), 0),
      melanger(GRANIT_CLAIR, i % 2 ? GRANIT : ARDOISE, 0.24 + i * 0.05),
      { matiere: 'granit', alpha: 0.32, echelle: 0.5 },
    );
    y -= h - 0.6 + rand() * 0.8;
  }
  // perche et fanion : on voit loin d'ici
  planche(g, mats, { x: 2, y: y + 2 }, { x: 3, y: y - 24 }, 3.4, 111);
  g.poly(flat(perturber([pt(3, y - 23), pt(20, y - 20), pt(15, y - 16), pt(20, y - 12), pt(3, y - 13)], 0.8, 5))).fill({
    color: melanger(PALETTE.bleuProfond, PALETTE.bleuBrume, 0.35),
    alpha: 0.92,
  });
  // lointain suggéré : trois crêtes bleutées
  for (let i = 0; i < 3; i += 1) {
    g.poly(
      flat(
        perturber(
          [pt(-30 + i * 8, y - 6 - i * 3), pt(-18 + i * 9, y - 14 - i * 4), pt(-6 + i * 10, y - 6 - i * 3)],
          1.2,
          i + 3,
        ),
      ),
    ).fill({ color: melanger(PALETTE.bleuBrume, PALETTE.bleuProfond, i * 0.2), alpha: 0.22 - i * 0.05 });
  }
}

function source(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 22, 12, { seed: 31 });
  // margelle de granit
  const marg = lisser(
    perturber(densifier([pt(-22, -2), pt(22, -3), pt(19, -14), pt(-19, -13)], 8), 1.2, 113),
    0,
  );
  poser(g, mats, marg, melanger(GRANIT_CLAIR, GRANIT, 0.36), { matiere: 'granit', alpha: 0.32, echelle: 0.55 });
  // eau : miroir clair côté lumière, profond côté ombre
  const eau = blob(0, -13, 16, 5, { seed: 5, points: 20, wobble: 0.12 });
  poser(g, mats, eau, melanger(PALETTE.bleuProfond, PALETTE.bleuBrume, 0.34), {
    matiere: 'grain',
    alpha: 0.14,
    modele: 0.7,
    rim: false,
  });
  for (let i = 0; i < 4; i += 1) {
    g.moveTo(-12 + i * 2, -14.5 + i * 0.8);
    g.quadraticCurveTo(0, -15.5 + i, 12 - i * 2, -14 + i * 0.8);
    g.stroke({ color: melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.45), width: 1.1, alpha: 0.4 });
  }
  // rocher d'où sort l'eau, et filet qui tombe
  poser(g, mats, lisser(perturber(densifier([pt(-24, -12), pt(-22, -34), pt(-8, -40), pt(2, -32), pt(0, -13)], 8), 1.8, 115), 0), melanger(GRANIT_CLAIR, PALETTE.mousseSombre, 0.24), {
    matiere: 'granit',
    alpha: 0.32,
    echelle: 0.55,
  });
  g.moveTo(-6, -28);
  g.quadraticCurveTo(-3, -22, -4, -14);
  g.stroke({ color: melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.5), width: 2.4, alpha: 0.6, cap: 'round' });
  for (let i = 0; i < 5; i += 1) {
    g.poly(flat(blob(-4 + (i % 2) * 3, -12 - i * 1.4, 1.4, 1.1, { seed: i + 7, points: 8, wobble: 0.3 }))).fill({
      color: melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.6),
      alpha: 0.45,
    });
  }
  // croix de fer plantée dans la margelle
  g.moveTo(14, -13);
  g.lineTo(14, -28);
  g.moveTo(9, -24);
  g.lineTo(19, -24);
  g.stroke({ color: melanger(0x6d7681, LIGHT.rim, 0.25), width: 1.8, alpha: 0.85, cap: 'round' });
  for (let i = 0; i < 4; i += 1) {
    g.poly(flat(blob(-18 + i * 12, -3, 2.6, 1.9, { seed: i + 11, points: 9, wobble: 0.34 }))).fill({
      color: melanger(PALETTE.mousseSombre, VERT, 0.4),
      alpha: 0.6,
    });
  }
}

function obstacle(g: Graphics, mats: MaterialSet): void {
  ombreProjetee(g, 0, 0, 26, 12, { seed: 33 });
  // tronc couché en travers
  const tronc: Poly = [];
  const bas: Poly = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const x = -28 + t * 56;
    const y = -8 - Math.sin(t * Math.PI) * 3;
    const w = 6 - t * 1.6;
    tronc.push(pt(x, y - w));
    bas.push(pt(x, y + w));
  }
  bas.reverse();
  poser(g, mats, lisser([...tronc, ...bas], 1), melanger(BOIS, GRANIT, 0.32), {
    matiere: 'ecorce',
    alpha: 0.3,
    echelle: 0.32,
  });
  // section fraîchement rompue
  for (let i = 2; i >= 1; i -= 1) {
    g.poly(flat(blob(-27, -9, 5.4 * (i / 2), 5 * (i / 2), { seed: i * 3, points: 14, wobble: 0.2 }))).fill({
      color: i % 2 ? melanger(BOIS, OCRE, 0.45) : assombrir(BOIS, 0.24),
      alpha: 0.9,
    });
  }
  // branches et blocs
  for (let i = 0; i < 3; i += 1) {
    poser(g, mats, fuseau(-10 + i * 12, -9, -16 + i * 14, -24 - i * 3, 3.4, { seed: i, taper: 0.6 }), assombrir(BOIS, 0.18), {
      matiere: 'ecorce',
      alpha: 0.26,
      echelle: 0.28,
    });
  }
  for (let i = 0; i < 2; i += 1) {
    poser(g, mats, lisser(perturber(densifier([pt(12 + i * 12, 0), pt(22 + i * 12, -2), pt(20 + i * 12, -10), pt(11 + i * 12, -8)], 5), 1.4, 117 + i), 0), melanger(GRANIT_CLAIR, GRANIT, 0.4), {
      matiere: 'granit',
      alpha: 0.3,
      echelle: 0.5,
    });
  }
}

/* ────────────────────────── Jetons de ressource ─────────────────────────── */

function jetonRessource(g: Graphics, mats: MaterialSet, key: string): void {
  const c = RESOURCE_COLORS[key] ?? RESOURCE_COLORS.ecus;
  ombreProjetee(g, 0, 0, 15, 10, { seed: key.length });
  switch (key) {
    case 'ecus': {
      // pile d'écus + une pièce de chant
      for (let i = 0; i < 4; i += 1) {
        poser(g, mats, blob(-3 + i * 0.6, -3 - i * 3.4, 10 - i * 0.4, 3.4, { seed: i * 5 + 1, points: 16, wobble: 0.12 }), c.corps, {
          matiere: 'metal',
          alpha: 0.24,
          echelle: 0.3,
          speculaire: { x: 0.28, y: 0.3, r: 0.12 },
        });
      }
      poser(g, mats, blob(11, -8, 4.6, 8, { seed: 9, points: 18, wobble: 0.1 }), c.corps, {
        matiere: 'metal',
        alpha: 0.24,
        echelle: 0.3,
        speculaire: { x: 0.3, y: 0.26, r: 0.16 },
      });
      g.poly(flat(blob(11, -8, 2, 3.4, { seed: 11, points: 12, wobble: 0.2 }))).fill({ color: c.creux, alpha: 0.5 });
      break;
    }
    case 'bois': {
      for (let i = 0; i < 3; i += 1) {
        const x = -10 + i * 10;
        poser(g, mats, blob(x, -6, 5.6, 5.4, { seed: i * 3 + 2, points: 16, wobble: 0.14 }), c.corps, {
          matiere: 'ecorce',
          alpha: 0.3,
          echelle: 0.28,
        });
        g.poly(flat(blob(x - 0.8, -6.6, 2.6, 2.4, { seed: i * 3 + 4, points: 12, wobble: 0.2 }))).fill({
          color: c.eclat,
          alpha: 0.75,
        });
      }
      poser(g, mats, blob(-1, -15, 5.8, 5.6, { seed: 13, points: 16, wobble: 0.14 }), c.corps, {
        matiere: 'ecorce',
        alpha: 0.3,
        echelle: 0.28,
      });
      break;
    }
    case 'granit': {
      for (let i = 0; i < 2; i += 1) {
        poser(
          g,
          mats,
          lisser(perturber(densifier([pt(-14 + i * 13, 0), pt(-2 + i * 14, -2), pt(-3 + i * 13, -12), pt(-13 + i * 12, -10)], 5), 1.3, i + 3), 0),
          c.corps,
          { matiere: 'granit', alpha: 0.34, echelle: 0.5 },
        );
      }
      poser(g, mats, lisser(perturber(densifier([pt(-7, -10), pt(6, -12), pt(5, -22), pt(-6, -20)], 5), 1.3, 7), 0), eclaircir(c.corps, 0.14), {
        matiere: 'granit',
        alpha: 0.34,
        echelle: 0.5,
      });
      break;
    }
    case 'fer': {
      for (let i = 0; i < 3; i += 1) {
        const y = -4 - i * 5;
        const dx = i * 1.6;
        poser(g, mats, perturber(densifier([pt(-12 + dx, y), pt(11 + dx, y - 1), pt(9 + dx, y - 5), pt(-10 + dx, y - 4)], 5), 0.5, i + 5), c.corps, {
          matiere: 'metal',
          alpha: 0.26,
          echelle: 0.35,
          speculaire: { x: 0.26, y: 0.3, r: 0.1 },
        });
      }
      break;
    }
    case 'sel': {
      // sac ouvert et cône de sel
      poser(g, mats, lisser(perturber(densifier([pt(-13, 0), pt(-11, -12), pt(-4, -16), pt(9, -13), pt(12, 0)], 6), 0.9, 3), 1), melanger(PALETTE.parcheminOmbre, c.corps, 0.4), {
        matiere: 'tissu',
        alpha: 0.28,
        echelle: 0.4,
      });
      poser(g, mats, lisser(perturber(densifier([pt(-9, -14), pt(0, -25), pt(9, -13)], 6), 0.9, 5), 1), c.corps, {
        matiere: 'granit',
        alpha: 0.22,
        echelle: 0.4,
      });
      for (let i = 0; i < 6; i += 1) {
        g.poly(flat(blob(-6 + i * 2.4, -16 - (i % 3) * 2.4, 1.1, 1, { seed: i + 7, points: 7, wobble: 0.34 }))).fill({
          color: c.eclat,
          alpha: 0.75,
        });
      }
      break;
    }
    case 'essence': {
      // fiole de verre, sève lumineuse
      poser(g, mats, lisser(perturber(densifier([pt(-8, 0), pt(8, -1), pt(6, -14), pt(3, -20), pt(-3, -20), pt(-6, -14)], 7), 0.6, 9), 1), melanger(c.corps, PALETTE.bleuBrume, 0.3), {
        matiere: 'metal',
        alpha: 0.16,
        echelle: 0.4,
        modele: 0.85,
        speculaire: { x: 0.26, y: 0.42, r: 0.1 },
      });
      g.poly(flat(blob(0, -5, 5.4, 5, { seed: 11, points: 14, wobble: 0.2 }))).fill({ color: c.eclat, alpha: 0.55 });
      g.poly(flat(blob(0, -21, 3.4, 2.6, { seed: 13, points: 11, wobble: 0.24 }))).fill({ color: BOIS, alpha: 0.9 });
      for (let i = 2; i >= 1; i -= 1) {
        g.poly(flat(blob(0, -8, 10 * (i / 2), 12 * (i / 2), { seed: i * 7, points: 14, wobble: 0.24 }))).fill({
          color: c.eclat,
          alpha: 0.1,
        });
      }
      break;
    }
    case 'filDor':
    default: {
      // écheveau de fil d'or sur sa bobine
      poser(g, mats, perturber(densifier([pt(-4, 0), pt(4, 0), pt(4, -18), pt(-4, -18)], 6), 0.5, 3), BOIS, {
        matiere: 'ecorce',
        alpha: 0.26,
        echelle: 0.28,
      });
      poser(g, mats, blob(0, -9, 10, 7, { seed: 5, points: 18, wobble: 0.14 }), c.corps, {
        matiere: 'tissu',
        alpha: 0.24,
        echelle: 0.3,
        speculaire: { x: 0.28, y: 0.28, r: 0.12 },
      });
      for (let i = 0; i < 5; i += 1) {
        g.moveTo(-9, -12 + i * 1.6);
        g.quadraticCurveTo(0, -13 + i * 1.6 + (i % 2 ? 1.4 : -1.4), 9, -12 + i * 1.6);
        g.stroke({ color: i % 2 ? c.eclat : c.creux, width: 0.9, alpha: 0.6 });
      }
      for (const y of [-18, -1]) {
        poser(g, mats, blob(0, y, 7.4, 2, { seed: y, points: 14, wobble: 0.16 }), BOIS, {
          matiere: 'ecorce',
          alpha: 0.26,
          echelle: 0.28,
        });
      }
      break;
    }
  }
}

/* ─────────────────────────────── La table ───────────────────────────────── */

type Dessin = (g: Graphics, mats: MaterialSet) => void;

export const MAP_ICONS: Readonly<Record<string, Dessin>> = {
  carte_mine: mine,
  carte_ressource: ressourceTas,
  carte_artefact: artefact,
  carte_sanctuaire: sanctuaire,
  carte_auberge: auberge,
  carte_sceau: sceau,
  carte_borne: borneIcone,
  carte_caravane: caravane,
  carte_quete: quete,
  carte_ville: ville,
  carte_village: village,
  carte_garde: garde,
  carte_maison_tresor: maisonTresor,
  carte_belvedere: belvedere,
  carte_source: source,
  carte_obstacle: obstacle,
};

export const MAP_ICON_LABELS: Readonly<Record<string, string>> = {
  carte_mine: 'Mine',
  carte_ressource: 'Ressource',
  carte_artefact: 'Artefact',
  carte_sanctuaire: 'Sanctuaire',
  carte_auberge: 'Auberge',
  carte_sceau: 'Sceau des Marches',
  carte_borne: 'Borne armoriée',
  carte_caravane: 'Caravane',
  carte_quete: 'Quête',
  carte_ville: 'Cité',
  carte_village: 'Village',
  carte_garde: 'Garde neutre',
  carte_maison_tresor: 'Maison du Trésor',
  carte_belvedere: 'Belvédère',
  carte_source: 'Source consacrée',
  carte_obstacle: 'Obstacle',
};

export const RESOURCE_KEYS_ART = ['ecus', 'bois', 'granit', 'fer', 'sel', 'essence', 'filDor'] as const;

export const RESOURCE_LABELS: Readonly<Record<string, string>> = {
  ecus: 'Écus',
  bois: 'Bois',
  granit: 'Granit',
  fer: 'Fer',
  sel: 'Sel',
  essence: 'Essence sylvestre',
  filDor: 'Fil d’or',
};

/** Boîte de rendu commune aux icônes de carte. */
export const MAP_ICON_BOX = { w: 84, h: 84, ancreY: 62 };

/** Dessine une icône de carte ou de ressource dans un `Graphics` neuf. */
export function dessinerIconeCarte(mats: MaterialSet, key: string): Graphics {
  const g = new Graphics();
  const fn = MAP_ICONS[key];
  if (fn) {
    fn(g, mats);
    return g;
  }
  if (key.startsWith('ressource_')) {
    jetonRessource(g, mats, key.slice('ressource_'.length));
    return g;
  }
  throw new Error(`Icône de carte inconnue : ${key}`);
}

/** Toutes les clefs fournies par ce module. */
export function clesIconesCarte(): string[] {
  return [...Object.keys(MAP_ICONS), ...RESOURCE_KEYS_ART.map((r) => `ressource_${r}`)];
}
