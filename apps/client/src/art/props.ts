/**
 * Décor de la carte d'aventure : quatorze objets, trois à cinq variantes
 * déterministes chacun. Tout est peint par `shading.ts`, donc porte les trois
 * strates, le liseré doré et l'ombre portée orientée à 315°.
 *
 * Chaque prop est dessiné dans une boîte `w × h` dont l'origine (0, 0) est le
 * **point de contact au sol**, au milieu de la base. Le semis sur la carte n'a
 * plus qu'à poser la texture par son ancre.
 */
import { Graphics } from 'pixi.js';
import {
  LIGHT,
  PALETTE,
  assombrir,
  eclaircir,
  melanger,
  ombreBleutee,
  perspectiveAtmospherique,
} from './palette.js';
import type { MaterialSet, Poly } from './shading.js';
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
import { hash2, prng } from './noise.js';

export type PropKey =
  | 'sapin'
  | 'hetre'
  | 'buisson'
  | 'rocher'
  | 'aiguille'
  | 'muret'
  | 'borne'
  | 'croix'
  | 'moulin'
  | 'pont'
  | 'tour'
  | 'ferme'
  | 'chapelle'
  | 'souche'
  | 'fougere';

export interface PropDef {
  /** nombre de variantes déterministes */
  variantes: number;
  /** boîte de rendu */
  w: number;
  h: number;
  /** distance de référence pour la perspective atmosphérique */
  distance: number;
  dessin: (g: Graphics, mats: MaterialSet, v: number) => void;
}

const GRANIT = PALETTE.granitAnthracite;
const GRANIT_CLAIR = PALETTE.granitClair;
const SAPIN = PALETTE.vertSapin;
const HETRE = PALETTE.vertHetre;
const MOUSSE = PALETTE.mousseSombre;
const TERRE = PALETTE.brunFougere;
const OCRE = PALETTE.ocre;
const ARDOISE = 0x414a52;

/** Peinture standard d'un élément de décor. */
function poser(
  g: Graphics,
  mats: MaterialSet,
  poly: Poly,
  base: number,
  o: {
    matiere?: keyof MaterialSet;
    alpha?: number;
    echelle?: number;
    modele?: number;
    rim?: boolean;
    distance?: number;
    speculaire?: { x: number; y: number; r: number } | null;
  } = {},
): void {
  peindre(g, poly, mats, {
    base: perspectiveAtmospherique(base, o.distance ?? 0),
    matiere: o.matiere ?? 'grain',
    matiereAlpha: o.alpha ?? 0.16,
    matiereEchelle: o.echelle ?? 1,
    modele: o.modele ?? 1,
    rim: o.rim !== false,
    speculaire: o.speculaire ?? null,
  });
}

/* ───────────────────────────── Végétation ───────────────────────────────── */

function sapin(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(1000 + v * 37);
  const H = 118 + rand() * 26;
  const W = 34 + rand() * 12;
  const penche = (rand() - 0.5) * 0.1;
  ombreProjetee(g, 0, 0, W * 0.5, H * 0.42, { seed: v * 3 });
  // tronc
  const tronc = perturber(
    densifier([pt(-W * 0.1, 0), pt(W * 0.1, 0), pt(W * 0.06 + penche * H, -H * 0.9), pt(-W * 0.05 + penche * H, -H * 0.9)], 12),
    1.1,
    v * 7 + 1,
  );
  poser(g, mats, tronc, melanger(TERRE, GRANIT, 0.35), { matiere: 'ecorce', alpha: 0.28, echelle: 0.35 });
  // étages de branches, du plus large au plus étroit
  const etages = 6 + Math.floor(rand() * 2);
  for (let i = etages - 1; i >= 0; i -= 1) {
    const t = i / (etages - 1);
    const y = -H * (0.18 + t * 0.8);
    const demi = W * (1 - t * 0.78) * 0.98;
    const chute = H * 0.14 * (1 - t * 0.45);
    const cx = penche * -y;
    const branche: Poly = [];
    const n = 9;
    for (let j = 0; j <= n; j += 1) {
      const u = j / n;
      const x = cx - demi + u * demi * 2;
      const creux = Math.sin(u * Math.PI) * chute * 0.42;
      branche.push(pt(x, y + chute - creux + Math.sin(u * 13 + i) * 2.4));
    }
    branche.push(pt(cx + demi * 0.16, y - chute * 0.5));
    branche.push(pt(cx - demi * 0.14, y - chute * 0.42));
    const teinte = melanger(SAPIN, i % 2 ? MOUSSE : HETRE, 0.12 + t * 0.18);
    poser(g, mats, lisser(perturber(densifier(branche, 7), 1.2, v * 11 + i), 1), teinte, {
      matiere: 'fourrure',
      alpha: 0.24,
      echelle: 0.4,
      distance: 60 * t,
    });
    // aiguilles saillantes côté lumière
    for (let j = 0; j < 4; j += 1) {
      const u = 0.12 + (j / 3) * 0.76;
      const x = cx - demi + u * demi * 2;
      g.moveTo(x, y + chute * 0.35);
      g.lineTo(x - 4 - rand() * 3, y + chute * 0.35 - 3 - rand() * 3);
      g.stroke({
        color: eclaircir(teinte, 0.42),
        width: 1.1,
        alpha: 0.4,
        cap: 'round',
      });
    }
  }
  // flèche du sommet
  poser(g, mats, fuseau(penche * H * 0.98, -H * 0.94, penche * H, -H * 1.06, W * 0.22, { seed: v, taper: 0.6 }), melanger(SAPIN, HETRE, 0.2), {
    matiere: 'fourrure',
    alpha: 0.22,
    echelle: 0.4,
  });
}

function hetre(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(2000 + v * 53);
  const H = 100 + rand() * 26;
  const W = 52 + rand() * 18;
  ombreProjetee(g, 0, 0, W * 0.6, H * 0.34, { seed: v * 5 });
  // tronc à contreforts
  const tronc: Poly = [];
  const droite: Poly = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const y = -H * 0.52 * t;
    const w = W * 0.14 * (1 - t * 0.5) + W * 0.06 * Math.exp(-t * 6);
    tronc.push(pt(-w, y));
    droite.push(pt(w, y));
  }
  droite.reverse();
  poser(g, mats, lisser([...tronc, ...droite], 1), melanger(GRANIT_CLAIR, TERRE, 0.32), {
    matiere: 'ecorce',
    alpha: 0.3,
    echelle: 0.4,
  });
  // charpentières
  for (const s of [-1, 1] as const) {
    poser(
      g,
      mats,
      fuseau(s * W * 0.04, -H * 0.48, s * W * 0.3, -H * 0.72, W * 0.09, { seed: v + s, taper: 0.6 }),
      melanger(GRANIT_CLAIR, TERRE, 0.36),
      { matiere: 'ecorce', alpha: 0.28, echelle: 0.35 },
    );
  }
  // houppier : quatre masses imbriquées, jamais un rond
  const masses: [number, number, number, number][] = [
    [-W * 0.34, -H * 0.72, W * 0.44, H * 0.24],
    [W * 0.26, -H * 0.68, W * 0.42, H * 0.22],
    [-W * 0.06, -H * 0.9, W * 0.5, H * 0.26],
    [W * 0.12, -H * 0.82, W * 0.34, H * 0.2],
  ];
  masses.forEach((m, i) => {
    const teinte = melanger(HETRE, i % 2 ? SAPIN : OCRE, 0.1 + i * 0.06);
    poser(g, mats, blob(m[0], m[1], m[2], m[3], { seed: v * 13 + i, points: 20, wobble: 0.2 }), teinte, {
      matiere: 'fourrure',
      alpha: 0.24,
      echelle: 0.42,
      distance: 40 + i * 20,
    });
  });
  // touches de feuilles au bord lumineux
  for (let i = 0; i < 14; i += 1) {
    const a = -2.9 + (i / 13) * 2.2;
    const x = Math.cos(a) * W * 0.52;
    const y = -H * 0.78 + Math.sin(a) * H * 0.2;
    g.poly(flat(blob(x, y, 3 + rand() * 3, 2.4 + rand() * 2.4, { seed: i * 3 + v, points: 8, wobble: 0.3 }))).fill({
      color: eclaircir(HETRE, 0.4 + rand() * 0.3),
      alpha: 0.4,
    });
  }
}

function buisson(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(3000 + v * 29);
  const W = 26 + rand() * 12;
  const H = 22 + rand() * 12;
  ombreProjetee(g, 0, 0, W * 0.9, H * 0.5, { seed: v });
  for (let i = 0; i < 4; i += 1) {
    const x = (rand() - 0.5) * W * 0.9;
    const y = -rand() * H * 0.6;
    const teinte = melanger(i % 2 ? MOUSSE : HETRE, SAPIN, rand() * 0.3);
    poser(g, mats, blob(x, y, W * (0.5 + rand() * 0.3), H * (0.5 + rand() * 0.3), { seed: v * 7 + i, points: 16, wobble: 0.26 }), teinte, {
      matiere: 'fourrure',
      alpha: 0.26,
      echelle: 0.35,
    });
  }
  for (let i = 0; i < 7; i += 1) {
    const x = (rand() - 0.5) * W * 1.4;
    g.moveTo(x, -H * 0.2);
    g.quadraticCurveTo(x - 2, -H * 0.7, x - 4 - rand() * 3, -H * (0.9 + rand() * 0.3));
    g.stroke({ color: eclaircir(HETRE, 0.4), width: 1.2, alpha: 0.45, cap: 'round' });
  }
}

function fougere(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(4000 + v * 41);
  const H = 26 + rand() * 14;
  ombreProjetee(g, 0, 0, H * 0.7, H * 0.34, { seed: v });
  const n = 5 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i += 1) {
    const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.36 + (rand() - 0.5) * 0.12;
    const L = H * (0.72 + rand() * 0.5);
    const ex = Math.cos(a) * L;
    const ey = Math.sin(a) * L;
    const teinte = melanger(HETRE, i % 2 ? MOUSSE : SAPIN, 0.2 + rand() * 0.25);
    poser(g, mats, fuseau(0, 0, ex, ey, H * 0.2, { seed: v * 5 + i, taper: 0.55 }), teinte, {
      matiere: 'fourrure',
      alpha: 0.26,
      echelle: 0.3,
      modele: 0.9,
    });
    // folioles
    for (let j = 1; j <= 5; j += 1) {
      const t = j / 6;
      const px = ex * t;
      const py = ey * t;
      const w = H * 0.14 * (1 - t * 0.5);
      for (const s of [-1, 1] as const) {
        g.moveTo(px, py);
        g.lineTo(px + s * w, py - w * 0.4);
        g.stroke({
          color: s > 0 ? ombreBleutee(teinte, 0.5) : eclaircir(teinte, 0.4),
          width: 1.1,
          alpha: 0.55,
          cap: 'round',
        });
      }
    }
  }
}

function souche(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(5000 + v * 67);
  const W = 22 + rand() * 10;
  const H = 16 + rand() * 10;
  ombreProjetee(g, 0, 0, W * 0.9, H * 0.7, { seed: v });
  const corps = lisser(
    perturber(
      densifier([pt(-W, 0), pt(-W * 0.86, -H * 0.86), pt(-W * 0.2, -H), pt(W * 0.7, -H * 0.9), pt(W * 0.98, -H * 0.1), pt(W * 0.5, H * 0.12), pt(-W * 0.5, H * 0.1)], 8),
      1.4,
      v * 3 + 1,
    ),
    1,
  );
  poser(g, mats, corps, melanger(TERRE, GRANIT, 0.3), { matiere: 'ecorce', alpha: 0.32, echelle: 0.35 });
  // cœur du bois : cernes concentriques irréguliers
  for (let i = 3; i >= 1; i -= 1) {
    const k = i / 3;
    g.poly(flat(blob(-W * 0.05, -H * 0.9, W * 0.72 * k, H * 0.22 * k, { seed: v * 9 + i, points: 16, wobble: 0.2 }))).fill({
      color: i % 2 ? melanger(TERRE, OCRE, 0.4) : assombrir(TERRE, 0.24),
      alpha: 0.85,
    });
  }
  // éclat de rupture
  g.poly(flat(perturber([pt(W * 0.3, -H * 0.9), pt(W * 0.9, -H * 0.5), pt(W * 0.66, -H * 0.2)], 1.2, v + 5))).fill({
    color: eclaircir(TERRE, 0.35),
    alpha: 0.6,
  });
  // rejets et mousse
  for (let i = 0; i < 5; i += 1) {
    const x = -W * 0.7 + rand() * W * 1.5;
    g.poly(flat(blob(x, -H * 0.1 + rand() * H * 0.2, 2.5 + rand() * 2.5, 2 + rand() * 2, { seed: i * 5 + v, points: 9, wobble: 0.34 }))).fill({
      color: melanger(MOUSSE, HETRE, rand() * 0.5),
      alpha: 0.7,
    });
  }
}

/* ────────────────────────────── Minéral ─────────────────────────────────── */

function rocher(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(6000 + v * 71);
  const W = 26 + rand() * 14;
  const H = 20 + rand() * 14;
  ombreProjetee(g, 0, 0, W * 0.95, H * 0.9, { seed: v });
  const blocs = 2 + Math.floor(rand() * 2);
  for (let i = blocs - 1; i >= 0; i -= 1) {
    const x = (i - (blocs - 1) / 2) * W * 0.5 + (rand() - 0.5) * 6;
    const y = -rand() * H * 0.25;
    const w = W * (0.6 + rand() * 0.5);
    const h = H * (0.6 + rand() * 0.5);
    const face = lisser(
      perturber(
        densifier([pt(x - w, y), pt(x - w * 0.7, y - h * 0.86), pt(x + w * 0.1, y - h), pt(x + w * 0.9, y - h * 0.6), pt(x + w, y - h * 0.08), pt(x + w * 0.4, y + h * 0.1)], 8),
        1.6,
        v * 13 + i,
      ),
      0,
    );
    poser(g, mats, face, melanger(GRANIT_CLAIR, i % 2 ? GRANIT : ARDOISE, 0.3 + i * 0.12), {
      matiere: 'granit',
      alpha: 0.32,
      echelle: 0.55,
      modele: 1.05,
    });
    // plan de fracture éclairé
    g.moveTo(x - w * 0.8, y - h * 0.5);
    g.lineTo(x + w * 0.6, y - h * 0.7);
    g.stroke({ color: eclaircir(GRANIT_CLAIR, 0.4), width: 1.4, alpha: 0.4 });
  }
  // lichen au pied, côté ombre
  for (let i = 0; i < 6; i += 1) {
    const x = -W * 0.8 + rand() * W * 1.6;
    g.poly(flat(blob(x, -rand() * H * 0.2, 2 + rand() * 2.6, 1.6 + rand() * 2, { seed: i * 3 + v, points: 9, wobble: 0.36 }))).fill({
      color: melanger(MOUSSE, HETRE, rand() * 0.6),
      alpha: 0.55,
    });
  }
}

/**
 * L'aiguille : un ressaut de granit qui monte, et non un bloc posé à terre.
 *
 * **Pourquoi il fallait ce décor.** Les barrières de crête ont porté
 * l'infranchissable de 8,6 % à 15,5 % de la carte, en longues chaînes continues
 * — c'est ce qui donne enfin un front au pays. Vu en image, le massif se tient ;
 * vu à l'écran, il ne se voyait pas. Le rocher se peint en bleu de pierre
 * (`bleuBrume × bleuProfond` en altitude) et ne portait qu'un bloc de 0,86 case
 * de haut sur une case sur trois : une chaîne de montagnes rendue comme une
 * brume grise semée de cailloux. Le joueur ne pouvait pas voir où il ne pouvait
 * pas aller, ce qui est le contraire de ce que fait HMM3 — chez lui, la roche
 * infranchissable est un relief massif qu'on lit du premier coup d'œil.
 *
 * L'aiguille monte donc à deux cases et demie, avec un fût, une arête éclairée
 * au vent et deux contreforts qui l'ancrent. Semée densément sur le rocher, elle
 * donne à la chaîne une silhouette et une masse.
 */
function aiguille(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(6500 + v * 97);
  /*
   * La variété est ici l'essentiel, et c'est une correction faite sur capture :
   * la première version tirait toutes ses aiguilles dans la même fourchette
   * étroite, et la chaîne rendait une palissade de cônes identiques — pas une
   * montagne. On tire donc large, de la croupe massive au clocher, et l'on
   * élargit les bases pour que deux voisines se fondent en un massif au lieu de
   * se ranger côte à côte.
   */
  const trapu = rand();
  const W = 34 + rand() * 16 + trapu * 12;
  const H = 62 + rand() * 96 - trapu * 26;
  ombreProjetee(g, 0, 0, W * 1.3, H * 0.22, { seed: v });

  /* Deux contreforts d'abord : ils passent derrière le fût. */
  for (let i = 0; i < 2; i += 1) {
    const cote = i === 0 ? -1 : 1;
    const w = W * (0.58 + rand() * 0.34);
    const h = H * (0.3 + rand() * 0.3);
    const x = cote * W * (0.52 + rand() * 0.2);
    const face = lisser(
      perturber(
        densifier(
          [
            pt(x - w * 0.9, 0),
            pt(x - w * 0.5, -h * 0.72),
            pt(x + w * 0.15, -h),
            pt(x + w * 0.85, -h * 0.42),
            pt(x + w, 0),
          ],
          7,
        ),
        1.7,
        v * 29 + i,
      ),
      0,
    );
    poser(g, mats, face, melanger(GRANIT, ARDOISE, 0.25 + i * 0.2), {
      matiere: 'granit',
      alpha: 0.34,
      echelle: 0.5,
      modele: 1.0,
    });
  }

  /* Le fût : deux pans nets, l'un au soleil, l'autre à l'ombre, pour que
     l'arête se lise même à petite échelle. */
  const sommet = pt((rand() - 0.5) * W * 0.4, -H);
  const pied = W * (0.86 + rand() * 0.3);
  const pan = lisser(
    perturber(
      densifier([pt(-pied, 0), pt(-pied * 0.62, -H * 0.52), sommet, pt(pied * 0.2, -H * 0.34), pt(pied * 0.34, 0)], 9),
      1.9,
      v * 37,
    ),
    0,
  );
  poser(g, mats, pan, melanger(GRANIT_CLAIR, ARDOISE, 0.34), {
    matiere: 'granit',
    alpha: 0.3,
    echelle: 0.58,
    modele: 1.1,
  });
  const revers = lisser(
    perturber(
      densifier([sommet, pt(pied * 0.86, -H * 0.44), pt(pied, 0), pt(pied * 0.28, 0), pt(pied * 0.16, -H * 0.36)], 9),
      1.9,
      v * 41,
    ),
    0,
  );
  poser(g, mats, revers, melanger(GRANIT, ARDOISE, 0.42), {
    matiere: 'granit',
    alpha: 0.36,
    echelle: 0.58,
    modele: 1.1,
  });

  /* L'arête sommitale, éclairée : c'est elle qui donne l'altitude. */
  g.moveTo(sommet.x, sommet.y);
  g.lineTo(-pied * 0.55, -H * 0.46);
  g.stroke({ color: eclaircir(GRANIT_CLAIR, 0.46), width: 1.6, alpha: 0.5 });

  /* Éboulis au pied : la roche se défait, elle ne sort pas du sol nette. */
  for (let i = 0; i < 7; i += 1) {
    const x = -W * 1.1 + rand() * W * 2.2;
    g.poly(
      flat(
        blob(x, -rand() * H * 0.06, 2.2 + rand() * 3, 1.8 + rand() * 2.4, {
          seed: i * 7 + v,
          points: 9,
          wobble: 0.4,
        }),
      ),
    ).fill({ color: melanger(GRANIT_CLAIR, TERRE, 0.3 + rand() * 0.3), alpha: 0.7 });
  }
}

function muret(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(7000 + v * 83);
  const L = 42 + rand() * 16;
  const H = 16 + rand() * 8;
  ombreProjetee(g, 0, 0, L, H * 0.9, { seed: v });
  const rangs = 3;
  for (let r = 0; r < rangs; r += 1) {
    const y = -r * (H / rangs) - 2;
    const n = 5 - Math.floor(r * 0.6);
    for (let i = 0; i < n; i += 1) {
      const w = (L * 2) / n;
      const x = -L + i * w + (r % 2 ? w * 0.28 : 0) + (rand() - 0.5) * 2.4;
      const pierre = lisser(
        perturber(
          densifier([pt(x, y), pt(x + w * 0.9, y - 1.2), pt(x + w * 0.86, y - H / rangs + 1), pt(x + w * 0.06, y - H / rangs)], 5),
          1.1,
          v * 17 + r * 5 + i,
        ),
        0,
      );
      poser(g, mats, pierre, melanger(GRANIT_CLAIR, r % 2 ? GRANIT : ARDOISE, 0.22 + r * 0.08), {
        matiere: 'granit',
        alpha: 0.3,
        echelle: 0.5,
        modele: 0.95,
      });
    }
  }
  // couronnement de pierres plates posées de chant
  for (let i = 0; i < 7; i += 1) {
    const x = -L * 0.94 + (i / 6) * L * 1.88;
    const p = perturber(densifier([pt(x - 4, -H), pt(x + 4, -H - 1), pt(x + 3.4, -H - 6), pt(x - 3.6, -H - 5.4)], 4), 0.9, v + i);
    poser(g, mats, p, melanger(GRANIT_CLAIR, OCRE, 0.14), { matiere: 'granit', alpha: 0.28, echelle: 0.45 });
  }
  for (let i = 0; i < 8; i += 1) {
    const x = -L + rand() * L * 2;
    g.poly(flat(blob(x, -rand() * H, 1.8 + rand() * 2, 1.4 + rand() * 1.6, { seed: i * 7 + v, points: 8, wobble: 0.36 }))).fill({
      color: melanger(MOUSSE, HETRE, rand() * 0.5),
      alpha: 0.5,
    });
  }
}

function borne(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(8000 + v * 97);
  const W = 10 + rand() * 3;
  const H = 34 + rand() * 12;
  ombreProjetee(g, 0, 0, W * 1.3, H * 0.7, { seed: v });
  const fut = lisser(
    perturber(
      densifier([pt(-W, 0), pt(-W * 0.86, -H * 0.82), pt(-W * 0.4, -H), pt(W * 0.5, -H * 0.98), pt(W * 0.92, -H * 0.78), pt(W * 0.96, 0)], 7),
      1,
      v * 3 + 2,
    ),
    0,
  );
  poser(g, mats, fut, melanger(GRANIT_CLAIR, PALETTE.parcheminOmbre, 0.2), {
    matiere: 'granit',
    alpha: 0.32,
    echelle: 0.5,
  });
  // écusson gravé en creux, refait par Jules
  const ec = lisser(
    perturber(densifier([pt(-W * 0.5, -H * 0.72), pt(W * 0.5, -H * 0.7), pt(W * 0.42, -H * 0.42), pt(0, -H * 0.3), pt(-W * 0.44, -H * 0.44)], 5), 0.5, v + 9),
    1,
  );
  g.poly(flat(ec)).fill({ color: ombreBleutee(GRANIT_CLAIR, 0.7), alpha: 0.8 });
  g.poly(flat(ec), true).stroke({ color: LIGHT.rim, width: 1.2, alpha: 0.6 });
  g.moveTo(-W * 0.2, -H * 0.62);
  g.lineTo(W * 0.2, -H * 0.6);
  g.moveTo(0, -H * 0.68);
  g.lineTo(0, -H * 0.4);
  g.stroke({ color: LIGHT.rim, width: 1.4, alpha: 0.7, cap: 'round' });
  for (let i = 0; i < 4; i += 1) {
    const x = -W + rand() * W * 2;
    g.poly(flat(blob(x, -rand() * H * 0.25, 1.6 + rand() * 1.8, 1.2 + rand() * 1.4, { seed: i + v, points: 8, wobble: 0.36 }))).fill({
      color: melanger(MOUSSE, HETRE, rand() * 0.5),
      alpha: 0.5,
    });
  }
}

function croix(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(9000 + v * 43);
  const H = 46 + rand() * 16;
  const W = 12 + rand() * 5;
  ombreProjetee(g, 0, 0, W * 1.4, H * 0.8, { seed: v });
  // socle de granit
  poser(
    g,
    mats,
    lisser(perturber(densifier([pt(-W * 1.3, 0), pt(W * 1.3, 0), pt(W * 1.05, -H * 0.17), pt(-W * 1.1, -H * 0.16)], 6), 1.1, v + 3), 0),
    melanger(GRANIT_CLAIR, GRANIT, 0.34),
    { matiere: 'granit', alpha: 0.3, echelle: 0.5 },
  );
  const bois = v % 2 === 0;
  const teinte = bois ? melanger(TERRE, GRANIT, 0.34) : melanger(ARDOISE, GRANIT_CLAIR, 0.4);
  const mat: keyof MaterialSet = bois ? 'ecorce' : 'metal';
  poser(g, mats, perturber(densifier([pt(-W * 0.24, -H * 0.15), pt(W * 0.24, -H * 0.16), pt(W * 0.2, -H), pt(-W * 0.2, -H * 0.99)], 9), 0.8, v * 5), teinte, {
    matiere: mat,
    alpha: 0.28,
    echelle: 0.35,
  });
  poser(g, mats, perturber(densifier([pt(-W * 1.05, -H * 0.76), pt(W * 1.02, -H * 0.78), pt(W * 1.0, -H * 0.64), pt(-W * 1.04, -H * 0.62)], 7), 0.8, v * 7), teinte, {
    matiere: mat,
    alpha: 0.28,
    echelle: 0.35,
  });
  // rayons ou fleurons aux extrémités
  for (const [x, y] of [
    [-W * 1.05, -H * 0.7],
    [W * 1.03, -H * 0.71],
    [0, -H * 1.0],
  ] as const) {
    g.poly(flat(blob(x, y, W * 0.24, W * 0.24, { seed: v + x, points: 10, wobble: 0.26 }))).fill({
      color: LIGHT.rim,
      alpha: 0.62,
    });
  }
  if (!bois) {
    g.poly(flat(blob(0, -H * 0.7, W * 0.3, W * 0.3, { seed: v + 11, points: 14, wobble: 0.18 }))).fill({
      color: LIGHT.rim,
      alpha: 0.5,
    });
  }
}

/* ─────────────────────────── Constructions ──────────────────────────────── */

/** Toit d'ardoise à deux pentes, avec faîtage clair. */
function toitArdoise(
  g: Graphics,
  mats: MaterialSet,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
): void {
  const toit = lisser(
    perturber(
      densifier([pt(x - w, y), pt(x - w * 0.06, y - h), pt(x + w * 0.1, y - h * 0.99), pt(x + w, y + h * 0.04)], 9),
      1.2,
      seed,
    ),
    0,
  );
  poser(g, mats, toit, ARDOISE, { matiere: 'granit', alpha: 0.28, echelle: 0.4, modele: 1.05 });
  const rangs = 6;
  for (let i = 1; i < rangs; i += 1) {
    const t = i / rangs;
    g.moveTo(x - w + t * w * 0.94, y - t * h);
    g.lineTo(x + w - t * w * 0.9, y + h * 0.04 - t * h * 1.03);
    g.stroke({ color: i % 2 ? eclaircir(ARDOISE, 0.3) : ombreBleutee(ARDOISE, 0.5), width: 1, alpha: 0.32 });
  }
  g.moveTo(x - w * 0.06, y - h);
  g.lineTo(x + w * 0.1, y - h * 0.99);
  g.stroke({ color: eclaircir(ARDOISE, 0.45), width: 2, alpha: 0.6, cap: 'round' });
}

/** Mur de torchis sur colombage, ou de granit selon la variante. */
function mur(
  g: Graphics,
  mats: MaterialSet,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  pierre: boolean,
): void {
  const face = lisser(
    perturber(densifier([pt(x - w, y), pt(x + w, y - h * 0.03), pt(x + w * 0.98, y - h), pt(x - w * 0.98, y - h * 0.98)], 9), 1, seed),
    0,
  );
  poser(g, mats, face, pierre ? melanger(GRANIT_CLAIR, GRANIT, 0.28) : melanger(OCRE, PALETTE.parchemin, 0.34), {
    matiere: pierre ? 'granit' : 'parchemin',
    alpha: pierre ? 0.3 : 0.26,
    echelle: pierre ? 0.5 : 0.55,
  });
  if (!pierre) {
    // colombage : poteaux, décharges, sablière
    const n = 4;
    for (let i = 0; i <= n; i += 1) {
      const px = x - w + (i / n) * w * 2;
      g.moveTo(px, y);
      g.lineTo(px + 1, y - h);
      g.stroke({ color: melanger(TERRE, GRANIT, 0.4), width: 2.6, alpha: 0.78 });
    }
    g.moveTo(x - w, y - h * 0.55);
    g.lineTo(x + w, y - h * 0.58);
    g.stroke({ color: melanger(TERRE, GRANIT, 0.4), width: 2.4, alpha: 0.7 });
    for (let i = 0; i < n; i += 1) {
      const px = x - w + (i / n) * w * 2;
      g.moveTo(px, y - h * 0.55);
      g.lineTo(px + (w * 2) / n, y - h);
      g.stroke({ color: melanger(TERRE, GRANIT, 0.45), width: 1.8, alpha: 0.55 });
    }
  } else {
    for (let r = 0; r < 5; r += 1) {
      const yy = y - (r / 5) * h;
      g.moveTo(x - w, yy);
      g.lineTo(x + w, yy - 1);
      g.stroke({ color: ombreBleutee(GRANIT_CLAIR, 0.5), width: 0.9, alpha: 0.3 });
    }
  }
}

/** Ouverture : porte ou fenêtre, avec ébrasement clair et fond chaud. */
function ouverture(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  seed: number,
  eclairee: boolean,
): void {
  const o = perturber(densifier([pt(x - w, y), pt(x + w, y), pt(x + w * 0.9, y - h), pt(x - w * 0.9, y - h * 0.98)], 4), 0.5, seed);
  g.poly(flat(o)).fill({
    color: eclairee ? melanger(OCRE, LIGHT.chaude, 0.55) : ombreBleutee(GRANIT, 0.9),
    alpha: eclairee ? 0.9 : 0.88,
  });
  g.poly(flat(o), true).stroke({ color: eclaircir(GRANIT_CLAIR, 0.3), width: 1.2, alpha: 0.6 });
  if (eclairee) {
    g.poly(flat(blob(x, y - h * 0.5, w * 1.8, h * 0.9, { seed: seed + 3, points: 12, wobble: 0.3 }))).fill({
      color: LIGHT.chaude,
      alpha: 0.1,
    });
  }
}

function ferme(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(11000 + v * 31);
  const W = 46 + rand() * 12;
  const H = 34 + rand() * 10;
  ombreProjetee(g, 0, 0, W * 1.05, H, { seed: v });
  // grange en retrait
  mur(g, mats, -W * 0.5, -H * 0.05, W * 0.42, H * 0.52, v * 5 + 1, false);
  toitArdoise(g, mats, -W * 0.5, -H * 0.55, W * 0.5, H * 0.3, v * 5 + 2);
  // corps de logis
  mur(g, mats, W * 0.28, 0, W * 0.5, H * 0.62, v * 5 + 3, v % 2 === 0);
  toitArdoise(g, mats, W * 0.28, -H * 0.62, W * 0.6, H * 0.36, v * 5 + 4);
  ouverture(g, W * 0.16, 0, W * 0.08, H * 0.32, v + 7, false);
  ouverture(g, W * 0.52, -H * 0.3, W * 0.055, H * 0.12, v + 9, true);
  // cheminée et fumée immobile-mais-pas-tout-à-fait (le semis l'anime)
  poser(g, mats, perturber(densifier([pt(W * 0.5, -H * 0.86), pt(W * 0.62, -H * 0.88), pt(W * 0.6, -H * 1.06), pt(W * 0.48, -H * 1.04)], 4), 0.6, v), melanger(GRANIT_CLAIR, OCRE, 0.2), {
    matiere: 'granit',
    alpha: 0.28,
    echelle: 0.45,
  });
  for (let i = 0; i < 4; i += 1) {
    g.poly(flat(blob(W * 0.55 - i * 2, -H * (1.1 + i * 0.14), 4 + i * 2.4, 3 + i * 1.8, { seed: v * 7 + i, points: 12, wobble: 0.3 }))).fill({
      color: melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.25),
      alpha: 0.2 - i * 0.035,
    });
  }
  // tas de bois et clôture
  for (let i = 0; i < 5; i += 1) {
    g.poly(flat(blob(-W * 0.95 + i * 4, -3 - (i % 2) * 3, 2.6, 2.2, { seed: v + i * 3, points: 9, wobble: 0.28 }))).fill({
      color: melanger(TERRE, OCRE, 0.3),
      alpha: 0.85,
    });
  }
}

function chapelle(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(12000 + v * 59);
  const W = 34 + rand() * 10;
  const H = 46 + rand() * 12;
  ombreProjetee(g, 0, 0, W * 1.1, H * 0.9, { seed: v });
  // nef
  mur(g, mats, -W * 0.1, 0, W * 0.66, H * 0.52, v * 3 + 1, true);
  toitArdoise(g, mats, -W * 0.1, -H * 0.52, W * 0.76, H * 0.28, v * 3 + 2);
  // chevet et contrefort
  mur(g, mats, W * 0.6, 0, W * 0.22, H * 0.42, v * 3 + 3, true);
  poser(g, mats, perturber(densifier([pt(-W * 0.82, 0), pt(-W * 0.62, -H * 0.02), pt(-W * 0.68, -H * 0.4), pt(-W * 0.8, -H * 0.38)], 5), 0.8, v + 5), melanger(GRANIT_CLAIR, GRANIT, 0.34), {
    matiere: 'granit',
    alpha: 0.3,
    echelle: 0.5,
  });
  // clocher-mur
  const cl = lisser(
    perturber(densifier([pt(-W * 0.34, -H * 0.5), pt(W * 0.02, -H * 0.5), pt(W * 0.0, -H * 0.86), pt(-W * 0.16, -H * 0.98), pt(-W * 0.34, -H * 0.84)], 7), 1, v * 9),
    0,
  );
  poser(g, mats, cl, melanger(GRANIT_CLAIR, PALETTE.parcheminOmbre, 0.18), { matiere: 'granit', alpha: 0.3, echelle: 0.45 });
  // baie de la cloche
  const baie = arcBande(-W * 0.16, -H * 0.74, W * 0.1, W * 0.11, Math.PI, Math.PI * 2, W * 0.05, 0);
  g.poly(flat(baie)).fill({ color: ombreBleutee(GRANIT, 0.85), alpha: 0.85 });
  g.poly(flat(blob(-W * 0.16, -H * 0.7, W * 0.05, W * 0.055, { seed: v + 3, points: 11, wobble: 0.2 }))).fill({
    color: melanger(LIGHT.rim, OCRE, 0.3),
    alpha: 0.9,
  });
  // croix de faîtage
  g.moveTo(-W * 0.16, -H * 1.0);
  g.lineTo(-W * 0.16, -H * 1.14);
  g.moveTo(-W * 0.24, -H * 1.08);
  g.lineTo(-W * 0.08, -H * 1.08);
  g.stroke({ color: LIGHT.rim, width: 2, alpha: 0.85, cap: 'round' });
  // porte en plein cintre et oculus
  ouverture(g, -W * 0.16, 0, W * 0.1, H * 0.24, v + 11, false);
  g.poly(flat(blob(W * 0.28, -H * 0.32, W * 0.07, W * 0.07, { seed: v + 13, points: 13, wobble: 0.18 }))).fill({
    color: melanger(OCRE, LIGHT.chaude, 0.4),
    alpha: 0.7,
  });
  g.poly(flat(blob(W * 0.28, -H * 0.32, W * 0.07, W * 0.07, { seed: v + 13, points: 13, wobble: 0.18 })), true).stroke({
    color: LIGHT.rim,
    width: 1.2,
    alpha: 0.6,
  });
}

function tour(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(13000 + v * 73);
  const W = 22 + rand() * 8;
  const H = 62 + rand() * 24;
  ombreProjetee(g, 0, 0, W * 1.2, H * 0.9, { seed: v });
  // fût légèrement fruité (plus large en bas)
  const gauche: Poly = [];
  const droite: Poly = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const y = -H * 0.86 * t;
    const w = W * (1 - t * 0.16);
    gauche.push(pt(-w, y));
    droite.push(pt(w, y));
  }
  droite.reverse();
  poser(g, mats, perturber([...gauche, ...droite], 1.1, v * 3), melanger(GRANIT_CLAIR, GRANIT, 0.3), {
    matiere: 'granit',
    alpha: 0.32,
    echelle: 0.55,
  });
  for (let r = 1; r < 7; r += 1) {
    const y = -H * 0.86 * (r / 7);
    g.moveTo(-W * (1 - (r / 7) * 0.16), y);
    g.lineTo(W * (1 - (r / 7) * 0.16), y - 1);
    g.stroke({ color: ombreBleutee(GRANIT_CLAIR, 0.5), width: 1, alpha: 0.3 });
  }
  // hourds et créneaux
  const cw = W * 1.16;
  poser(g, mats, perturber(densifier([pt(-cw, -H * 0.86), pt(cw, -H * 0.87), pt(cw * 0.96, -H * 0.94), pt(-cw * 0.96, -H * 0.93)], 6), 0.8, v + 5), melanger(GRANIT_CLAIR, ARDOISE, 0.3), {
    matiere: 'granit',
    alpha: 0.3,
    echelle: 0.5,
  });
  const n = 5;
  for (let i = 0; i < n; i += 1) {
    const x = -cw * 0.9 + (i / (n - 1)) * cw * 1.8;
    poser(g, mats, perturber(densifier([pt(x - cw * 0.12, -H * 0.94), pt(x + cw * 0.12, -H * 0.945), pt(x + cw * 0.11, -H * 1.02), pt(x - cw * 0.11, -H * 1.015)], 4), 0.7, v * 11 + i), melanger(GRANIT_CLAIR, ARDOISE, 0.26), {
      matiere: 'granit',
      alpha: 0.3,
      echelle: 0.5,
    });
  }
  // archères
  for (let i = 0; i < 3; i += 1) {
    const y = -H * (0.28 + i * 0.2);
    ouverture(g, (i % 2 ? 1 : -1) * W * 0.34, y, W * 0.05, H * 0.1, v + i * 7, i === 1);
  }
  // porte basse
  ouverture(g, 0, 0, W * 0.2, H * 0.16, v + 17, false);
  // bannière au sommet, animée par le semis
  g.moveTo(cw * 0.72, -H * 1.02);
  g.lineTo(cw * 0.74, -H * 1.24);
  g.stroke({ color: melanger(TERRE, GRANIT, 0.4), width: 1.8, alpha: 0.9, cap: 'round' });
  g.poly(
    flat(
      perturber(
        [pt(cw * 0.74, -H * 1.22), pt(cw * 1.4, -H * 1.17), pt(cw * 1.2, -H * 1.1), pt(cw * 1.36, -H * 1.04), pt(cw * 0.74, -H * 1.06)],
        0.8,
        v + 3,
      ),
    ),
  ).fill({ color: PALETTE.grenat, alpha: 0.92 });
}

function moulin(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(14000 + v * 89);
  const W = 30 + rand() * 8;
  const H = 54 + rand() * 16;
  ombreProjetee(g, 0, 0, W * 1.2, H * 0.9, { seed: v });
  // corps tronconique
  const gauche: Poly = [];
  const droite: Poly = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    const y = -H * 0.72 * t;
    const w = W * (1 - t * 0.28);
    gauche.push(pt(-w, y));
    droite.push(pt(w, y));
  }
  droite.reverse();
  poser(g, mats, perturber([...gauche, ...droite], 1.1, v * 5), melanger(GRANIT_CLAIR, PALETTE.parcheminOmbre, 0.24), {
    matiere: 'granit',
    alpha: 0.3,
    echelle: 0.5,
  });
  toitArdoise(g, mats, 0, -H * 0.72, W * 0.86, H * 0.24, v * 5 + 1);
  ouverture(g, -W * 0.1, 0, W * 0.16, H * 0.2, v + 5, false);
  ouverture(g, W * 0.36, -H * 0.42, W * 0.07, H * 0.1, v + 7, true);
  // arbre et ailes : quatre volées entoilées
  const cx = -W * 0.2;
  const cy = -H * 0.82;
  g.poly(flat(blob(cx, cy, W * 0.1, W * 0.1, { seed: v, points: 12, wobble: 0.2 }))).fill({
    color: melanger(TERRE, GRANIT, 0.4),
    alpha: 0.95,
  });
  const rot = (v * 0.4) % (Math.PI / 2);
  for (let i = 0; i < 4; i += 1) {
    const a = rot + (i * Math.PI) / 2;
    const L = H * 0.52;
    const ex = cx + Math.cos(a) * L;
    const ey = cy + Math.sin(a) * L;
    poser(g, mats, fuseau(cx, cy, ex, ey, W * 0.13, { seed: v * 7 + i, taper: 0.4 }), melanger(TERRE, GRANIT, 0.34), {
      matiere: 'ecorce',
      alpha: 0.26,
      echelle: 0.3,
      modele: 0.9,
    });
    // toile tendue d'un seul côté de la volée
    const nx = -Math.sin(a);
    const ny = Math.cos(a);
    const toile = perturber(
      [
        pt(cx + Math.cos(a) * L * 0.24, cy + Math.sin(a) * L * 0.24),
        pt(ex * 0.96 + cx * 0.04, ey * 0.96 + cy * 0.04),
        pt(ex * 0.94 + nx * W * 0.3, ey * 0.94 + ny * W * 0.3),
        pt(cx + Math.cos(a) * L * 0.26 + nx * W * 0.28, cy + Math.sin(a) * L * 0.26 + ny * W * 0.28),
      ],
      1,
      v + i,
    );
    poser(g, mats, toile, melanger(PALETTE.parchemin, OCRE, 0.3), {
      matiere: 'tissu',
      alpha: 0.28,
      echelle: 0.6,
      modele: 0.8,
    });
  }
}

function pont(g: Graphics, mats: MaterialSet, v: number): void {
  const rand = prng(15000 + v * 101);
  const L = 62 + rand() * 16;
  const H = 24 + rand() * 8;
  ombreProjetee(g, 0, 0, L * 0.9, H * 0.5, { seed: v });
  const arches = v % 2 === 0 ? 1 : 2;
  // tablier bombé
  const dessus: Poly = [];
  for (let i = 0; i <= 12; i += 1) {
    const t = i / 12;
    dessus.push(pt(-L + t * L * 2, -H * (0.5 + Math.sin(t * Math.PI) * 0.32)));
  }
  const dessous: Poly = [];
  for (let i = 12; i >= 0; i -= 1) {
    const t = i / 12;
    dessous.push(pt(-L + t * L * 2, -H * (0.24 + Math.sin(t * Math.PI) * 0.3)));
  }
  poser(g, mats, lisser(perturber([...dessus, ...dessous], 1, v * 3), 0), melanger(GRANIT_CLAIR, GRANIT, 0.3), {
    matiere: 'granit',
    alpha: 0.32,
    echelle: 0.5,
  });
  // piles et arches
  for (let a = 0; a < arches; a += 1) {
    const cx = arches === 1 ? 0 : -L * 0.42 + a * L * 0.84;
    const r = arches === 1 ? L * 0.5 : L * 0.3;
    const voute = arcBande(cx, -H * 0.2, r, r * 0.66, Math.PI, Math.PI * 2, H * 0.2, 0.1);
    poser(g, mats, voute, melanger(GRANIT_CLAIR, ARDOISE, 0.3), { matiere: 'granit', alpha: 0.3, echelle: 0.45 });
    // ombre sous l'arche : bleutée, jamais noire
    g.poly(flat(arcBande(cx, -H * 0.2, r * 0.82, r * 0.52, Math.PI, Math.PI * 2, H * 0.34, 0))).fill({
      color: ombreBleutee(GRANIT, 0.9),
      alpha: 0.7,
    });
    // claveaux
    for (let i = 0; i <= 6; i += 1) {
      const ang = Math.PI + (i / 6) * Math.PI;
      g.moveTo(cx + Math.cos(ang) * r * 0.86, -H * 0.2 + Math.sin(ang) * r * 0.56);
      g.lineTo(cx + Math.cos(ang) * r * 1.1, -H * 0.2 + Math.sin(ang) * r * 0.78);
      g.stroke({ color: ombreBleutee(GRANIT_CLAIR, 0.45), width: 1, alpha: 0.35 });
    }
  }
  // parapet de pierres plates
  for (let i = 0; i < 11; i += 1) {
    const t = i / 10;
    const x = -L * 0.94 + t * L * 1.88;
    const y = -H * (0.5 + Math.sin(t * Math.PI) * 0.32);
    poser(g, mats, perturber(densifier([pt(x - 4, y), pt(x + 4, y - 0.6), pt(x + 3.6, y - 7), pt(x - 3.8, y - 6.4)], 4), 0.8, v * 13 + i), melanger(GRANIT_CLAIR, OCRE, 0.12), {
      matiere: 'granit',
      alpha: 0.28,
      echelle: 0.45,
      modele: 0.9,
    });
  }
  // eau vive sous le pont, avec liseré clair côté lumière
  for (let i = 0; i < 5; i += 1) {
    const y = -H * 0.02 + i * 2.4;
    g.moveTo(-L * (0.8 - i * 0.06), y);
    g.quadraticCurveTo(0, y + 2 + hash2(i, v, 3) * 3, L * (0.8 - i * 0.06), y - 1);
    g.stroke({
      color: i % 2 ? melanger(PALETTE.bleuProfond, PALETTE.bleuBrume, 0.4) : melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.3),
      width: 1.6,
      alpha: 0.4,
    });
  }
}

/* ────────────────────────────── La table ────────────────────────────────── */

export const PROPS: Readonly<Record<PropKey, PropDef>> = {
  sapin: { variantes: 5, w: 100, h: 160, distance: 0, dessin: sapin },
  hetre: { variantes: 5, w: 130, h: 148, distance: 0, dessin: hetre },
  buisson: { variantes: 4, w: 84, h: 58, distance: 0, dessin: buisson },
  rocher: { variantes: 5, w: 92, h: 62, distance: 0, dessin: rocher },
  aiguille: { variantes: 5, w: 104, h: 152, distance: 0, dessin: aiguille },
  muret: { variantes: 4, w: 130, h: 52, distance: 0, dessin: muret },
  borne: { variantes: 3, w: 44, h: 62, distance: 0, dessin: borne },
  croix: { variantes: 4, w: 56, h: 82, distance: 0, dessin: croix },
  moulin: { variantes: 3, w: 128, h: 156, distance: 0, dessin: moulin },
  pont: { variantes: 4, w: 168, h: 66, distance: 0, dessin: pont },
  tour: { variantes: 4, w: 96, h: 160, distance: 0, dessin: tour },
  ferme: { variantes: 4, w: 148, h: 108, distance: 0, dessin: ferme },
  chapelle: { variantes: 3, w: 116, h: 132, distance: 0, dessin: chapelle },
  souche: { variantes: 4, w: 76, h: 46, distance: 0, dessin: souche },
  fougere: { variantes: 4, w: 76, h: 56, distance: 0, dessin: fougere },
};

export const PROP_KEYS: readonly PropKey[] = Object.keys(PROPS) as PropKey[];

/** Libellés français, pour la planche de contact et le codex. */
export const PROP_LABELS: Readonly<Record<PropKey, string>> = {
  sapin: 'Sapin',
  hetre: 'Hêtre',
  buisson: 'Buisson',
  rocher: 'Rocher',
  aiguille: 'Aiguille de granit',
  muret: 'Muret',
  borne: 'Borne armoriée',
  croix: 'Croix de chemin',
  moulin: 'Moulin',
  pont: 'Pont',
  tour: 'Tour de guet',
  ferme: 'Ferme',
  chapelle: 'Chapelle',
  souche: 'Souche',
  fougere: 'Fougère',
};

/**
 * Oscillation d'ambiance d'un prop posé sur la carte (loi n°7).
 *
 * Le rendu de carte n'a qu'à ajouter le décalage retourné à la position du
 * sprite : amplitude bornée à 3 px, périodes tirées entre 2 et 7 s, phases
 * décorrélées par bruit — deux sapins voisins ne respirent jamais ensemble.
 *
 * @param temps horloge de la scène, en secondes
 */
export function oscillationProp(
  key: PropKey,
  variante: number,
  temps: number,
  colonne = 0,
  ligne = 0,
): { dx: number; dy: number; rot: number } {
  const def = PROPS[key];
  if (!def) return { dx: 0, dy: 0, rot: 0 };
  const graine = hash2(colonne, ligne, key.length * 31 + variante);
  const souple = key === 'sapin' || key === 'hetre' || key === 'buisson' || key === 'fougere';
  const amp = souple ? 1.4 + graine * 1.6 : 0.25 + graine * 0.35;
  const periode = 2 + graine * 5;
  const phase = graine * Math.PI * 2;
  const w = (Math.PI * 2) / periode;
  return {
    dx: Math.sin(temps * w + phase) * amp,
    dy: Math.sin(temps * w * 0.61 + phase * 1.7) * amp * 0.3,
    rot: Math.sin(temps * w * 0.83 + phase * 0.6) * amp * (souple ? 0.006 : 0.0015),
  };
}

/**
 * Dessine un prop dans un `Graphics` neuf. L'origine reste le point de contact
 * au sol : c'est à l'appelant de translater pour composer une planche.
 */
export function dessinerProp(mats: MaterialSet, key: PropKey, variante: number): Graphics {
  const def = PROPS[key];
  const g = new Graphics();
  def.dessin(g, mats, ((variante % def.variantes) + def.variantes) % def.variantes);
  return g;
}
