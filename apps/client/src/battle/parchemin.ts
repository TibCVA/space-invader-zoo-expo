/**
 * `battle/parchemin.ts` — la matière de l'interface du combat.
 *
 * Tous les panneaux, cartouches, jauges et filets du champ de bataille passent
 * par ce module. Il n'invente aucune couleur : tout vient de `art/palette.ts`,
 * et chaque surface porte les trois strates exigées par la loi n°1 (teinte,
 * variation de valeur, matière), le biseau de 2 px de la bible §8, l'ombre
 * portée bleutée du sud-est (loi n°2) et le filet d'or de l'enluminure.
 *
 * Aucune règle de jeu n'est calculée ici : ce sont des pinceaux.
 */

import { Container, Graphics, Matrix, Text, TextStyle, FillPattern } from 'pixi.js';
import {
  LIGHT,
  PALETTE,
  assombrir,
  eclaircir,
  faceEclairee,
  melanger,
  ombreBleutee,
} from '../art/palette.js';
import { blob, degradeLineaire, densifier, flat, perturber } from '../art/shading.js';
import type { MaterialKey, MaterialSet, Poly } from '../art/shading.js';
import { POLICES } from '../art/fonts.js';
import { hash2 } from '../art/noise.js';

/* ─────────────────────────────── Typographie ────────────────────────────── */

/** Titre en Cinzel : capitales, interlettrage large, jamais sous 15 px. */
export function titre(contenu: string, taille = 17, couleur: number = PALETTE.encre): Text {
  return new Text({
    text: contenu,
    style: new TextStyle({
      fontFamily: `${POLICES.titre}, Georgia, serif`,
      fontSize: Math.max(15, taille),
      fontWeight: '700',
      letterSpacing: taille * 0.09,
      fill: couleur,
    }),
  });
}

/** Chiffres et libellés de données, en Alegreya Sans. */
export function donnee(contenu: string, taille = 15, couleur: number = PALETTE.encre, gras = false): Text {
  return new Text({
    text: contenu,
    style: new TextStyle({
      fontFamily: `${POLICES.donnees}, "Trebuchet MS", sans-serif`,
      fontSize: Math.max(11, taille),
      fontWeight: gras ? '700' : '500',
      letterSpacing: 0.2,
      fill: couleur,
    }),
  });
}

/** Récit et descriptions, en EB Garamond. */
export function recit(
  contenu: string,
  taille = 15,
  couleur: number = melanger(PALETTE.encre, PALETTE.brunFougere, 0.35),
  largeur = 0,
): Text {
  return new Text({
    text: contenu,
    style: new TextStyle({
      fontFamily: `${POLICES.recit}, Georgia, serif`,
      fontSize: Math.max(13, taille),
      fill: couleur,
      wordWrap: largeur > 0,
      wordWrapWidth: largeur,
      lineHeight: taille * 1.5,
    }),
  });
}

/** Texte clair posé sur une structure de granit (barres, vignettes). */
export function donneeClaire(contenu: string, taille = 14, couleur: number = 0xede3ce, gras = false): Text {
  const t = donnee(contenu, taille, couleur, gras);
  t.style.dropShadow = {
    color: LIGHT.ombrePortee,
    alpha: 0.55,
    angle: Math.PI / 4,
    blur: 2,
    distance: 1.4,
  };
  return t;
}

/* ─────────────────────────── Géométrie de panneau ───────────────────────── */

/**
 * Contour d'un panneau : un quadrilatère à coins coupés de 3 px, très
 * légèrement perturbé. Ce n'est jamais un rectangle parfait (bible §10).
 */
export function contourPanneau(x: number, y: number, w: number, h: number, r = 3, seed = 5): Poly {
  const base: Poly = [
    { x: x + r, y },
    { x: x + w - r, y },
    { x: x + w, y: y + r },
    { x: x + w, y: y + h - r },
    { x: x + w - r, y: y + h },
    { x: x + r, y: y + h },
    { x, y: y + h - r },
    { x, y: y + r },
  ];
  return perturber(densifier(base, Math.max(10, Math.min(w, h) / 4)), 0.4, seed);
}

export interface PanneauOptions {
  /** teinte de fond ; parchemin par défaut */
  teinte?: number;
  /** matière posée en troisième strate */
  matiere?: MaterialKey;
  matiereAlpha?: number;
  /** filet d'or double sur le pourtour */
  or?: boolean;
  /** ombre portée bleutée vers le sud-est */
  ombre?: boolean;
  alpha?: number;
  /** graine du grain d'encre */
  graine?: number;
  /** coin coupé */
  rayon?: number;
}

/**
 * Peint un panneau complet : ombre portée, dégradé, bandes de valeur, matière,
 * moucheture, biseau clair en haut / sombre en bas, filet d'or.
 */
export function panneau(
  g: Graphics,
  mats: MaterialSet,
  x: number,
  y: number,
  w: number,
  h: number,
  o: PanneauOptions = {},
): void {
  if (w <= 2 || h <= 2) return;
  const base = o.teinte ?? PALETTE.parchemin;
  const alpha = o.alpha ?? 1;
  const graine = o.graine ?? 11;
  const r = o.rayon ?? 3;
  const forme = contourPanneau(x, y, w, h, r, graine);
  const pts = flat(forme);

  /* 0 — ombre portée : trois passes, jamais du noir (loi n°2 et n°3). */
  if (o.ombre !== false) {
    for (let i = 3; i >= 1; i -= 1) {
      const d = i * 3;
      g.poly(flat(contourPanneau(x + d * 0.72, y + d * 0.86, w, h, r, graine + i))).fill({
        color: LIGHT.ombrePortee,
        alpha: LIGHT.ombrePorteeAlpha * (i === 1 ? 0.55 : 0.14) * alpha,
      });
    }
  }

  /* 1 — teinte + variation de valeur, orientée par le soleil de 315°. */
  g.poly(pts).fill({
    fill: degradeLineaire(
      [
        { offset: 0, color: faceEclairee(base, 0.5) },
        { offset: 0.22, color: faceEclairee(base, 0.16) },
        { offset: 0.58, color: base },
        { offset: 0.84, color: assombrir(base, 0.16) },
        { offset: 1, color: ombreBleutee(base, 0.42) },
      ],
      135,
    ),
    alpha,
  });

  /* 2 — bandes horizontales : la valeur ne reste jamais constante. */
  const bandes = Math.max(6, Math.round(h / 26));
  for (let i = 0; i < bandes; i += 1) {
    const t = i / (bandes - 1 || 1);
    const bh = h / bandes + 1;
    const teinte = t < 0.5 ? faceEclairee(base, 0.3) : ombreBleutee(base, 0.36);
    g.rect(x + 1, y + t * (h - bh), w - 2, bh).fill({
      color: teinte,
      alpha: alpha * (0.028 + Math.abs(t - 0.5) * 0.07),
    });
  }

  /* 3 — matière répétable. */
  const tex = mats[o.matiere ?? 'parchemin'];
  if (tex) {
    const motif = new FillPattern({ texture: tex, repetition: 'repeat' });
    motif.setTransform(new Matrix().scale(0.6, 0.6));
    g.poly(pts).fill({ fill: motif, alpha: (o.matiereAlpha ?? 0.2) * alpha });
  }

  /* 4 — moucheture d'encre déterministe : le parchemin n'est jamais propre. */
  const taches = Math.max(18, Math.round((w * h) / 900));
  for (let i = 0; i < taches; i += 1) {
    const a = hash2(i * 3 + 1, graine, 7717);
    const b = hash2(i * 5 + 2, graine + 3, 9931);
    const px = x + 3 + a * (w - 6);
    const py = y + 3 + b * (h - 6);
    const rr = 0.5 + hash2(i, graine + 9, 331) * 1.3;
    g.poly(flat(blob(px, py, rr, rr * 0.82, { seed: i * 7 + 3, points: 7, wobble: 0.34 }))).fill({
      color: b > 0.6 ? melanger(base, LIGHT.chaude, 0.6) : melanger(base, PALETTE.encre, 0.55),
      alpha: alpha * (0.05 + a * 0.07),
    });
  }

  /* 5 — biseau : 2 px clairs en haut et à gauche, sombres en bas et à droite. */
  g.moveTo(x + r, y + 1).lineTo(x + w - r, y + 1);
  g.moveTo(x + 1, y + r).lineTo(x + 1, y + h - r);
  g.stroke({ color: LIGHT.chaude, width: 2, alpha: alpha * 0.34, cap: 'round' });
  g.moveTo(x + r, y + h - 1).lineTo(x + w - r, y + h - 1);
  g.moveTo(x + w - 1, y + r).lineTo(x + w - 1, y + h - r);
  g.stroke({ color: ombreBleutee(base, 0.9), width: 2, alpha: alpha * 0.45, cap: 'round' });

  /* 6 — contour teinté d'épaisseur variable (loi n°6), jamais noir. */
  g.poly(pts, true).stroke({
    color: assombrir(base, 0.5),
    width: 1.3,
    alpha: alpha * 0.85,
    join: 'round',
  });

  /* 7 — filet d'or d'enluminure. */
  if (o.or !== false) {
    const interne = contourPanneau(x + 5, y + 5, w - 10, h - 10, Math.max(2, r - 1), graine + 17);
    g.poly(flat(interne), true).stroke({
      color: LIGHT.rim,
      width: 1.1,
      alpha: alpha * 0.58,
      join: 'round',
    });
    g.poly(pts, true).stroke({
      color: melanger(LIGHT.rim, LIGHT.chaude, 0.35),
      width: 0.9,
      alpha: alpha * 0.36,
      join: 'round',
    });
  }
}

/** Panneau de structure : granit sombre, pour les barres et les vignettes. */
export function plaqueGranit(
  g: Graphics,
  mats: MaterialSet,
  x: number,
  y: number,
  w: number,
  h: number,
  o: PanneauOptions = {},
): void {
  panneau(g, mats, x, y, w, h, {
    teinte: PALETTE.granitAnthracite,
    matiere: 'granit',
    matiereAlpha: 0.24,
    ...o,
  });
}

/* ──────────────────────────────── Filets ────────────────────────────────── */

/** Filet d'or horizontal à losange central, séparateur de section. */
export function filetSepare(g: Graphics, x: number, y: number, w: number, alpha = 0.8): void {
  g.moveTo(x, y).lineTo(x + w, y).stroke({ color: LIGHT.rim, width: 1.2, alpha: alpha * 0.75 });
  g.moveTo(x, y + 1.6)
    .lineTo(x + w, y + 1.6)
    .stroke({ color: LIGHT.chaude, width: 0.7, alpha: alpha * 0.22 });
  const cx = x + w / 2;
  g.poly([cx, y - 3.4, cx + 4.2, y, cx, y + 3.4, cx - 4.2, y]).fill({
    color: LIGHT.rim,
    alpha,
  });
  g.poly([cx, y - 1.6, cx + 2, y, cx, y + 1.6, cx - 2, y]).fill({
    color: melanger(LIGHT.rim, LIGHT.chaude, 0.6),
    alpha: alpha * 0.9,
  });
}

/* ──────────────────────────────── Jauges ────────────────────────────────── */

/**
 * Jauge à trois strates : creux bleuté, remplissage dégradé, reflet chaud.
 * `ratio` est borné à [0, 1]. Aucune règle n'est calculée : l'appelant fournit
 * la valeur déjà lue dans le moteur.
 */
export function jauge(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  couleur: number,
  alpha = 1,
): void {
  const k = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
  /* creux */
  g.rect(x, y, w, h).fill({ color: ombreBleutee(PALETTE.granitAnthracite, 0.8), alpha: alpha * 0.9 });
  g.rect(x, y, w, 1.2).fill({ color: LIGHT.ombrePortee, alpha: alpha * 0.6 });
  /* remplissage */
  const rw = Math.max(0, (w - 2) * k);
  if (rw > 0.5) {
    g.rect(x + 1, y + 1, rw, h - 2).fill({
      fill: degradeLineaire(
        [
          { offset: 0, color: faceEclairee(couleur, 0.75) },
          { offset: 0.45, color: couleur },
          { offset: 1, color: ombreBleutee(couleur, 0.5) },
        ],
        90,
      ),
      alpha,
    });
    g.rect(x + 1, y + 1.4, rw, Math.max(1, h * 0.24)).fill({
      color: LIGHT.chaude,
      alpha: alpha * 0.24,
    });
  }
  /* contour teinté */
  g.rect(x, y, w, h).stroke({
    color: assombrir(PALETTE.granitAnthracite, 0.4),
    width: 1,
    alpha: alpha * 0.8,
  });
  g.moveTo(x, y).lineTo(x + w, y).stroke({ color: LIGHT.rim, width: 0.8, alpha: alpha * 0.28 });
}

/* ──────────────────────────── Cartouche de nombre ───────────────────────── */

/**
 * Plaque de nombre d'une pile : petit écu de parchemin bordé d'or, chiffres en
 * Alegreya Sans. C'est la seule information toujours lisible sur la grille.
 */
export function plaqueNombre(
  mats: MaterialSet,
  valeur: number,
  couleurCamp: number,
  echelle = 1,
): Container {
  const racine = new Container();
  racine.label = 'cartouche-nombre';
  const texte = donnee(String(valeur), Math.round(14 * echelle), PALETTE.encre, true);
  texte.anchor.set(0.5);
  const w = Math.max(26 * echelle, texte.width + 14 * echelle);
  const h = Math.max(19 * echelle, texte.height + 5 * echelle);

  const g = new Graphics();
  /* écu à pointe basse, jamais un rectangle */
  const forme: Poly = perturber(
    densifier(
      [
        { x: -w / 2, y: -h / 2 },
        { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h * 0.16 },
        { x: 0, y: h / 2 },
        { x: -w / 2, y: h * 0.16 },
      ],
      6,
    ),
    0.35,
    valeur % 97,
  );
  const pts = flat(forme);
  g.poly(flat(perturber(forme, 0.2, 13)).map((v, i) => (i % 2 === 0 ? v + 1.6 : v + 2.2))).fill({
    color: LIGHT.ombrePortee,
    alpha: 0.4,
  });
  g.poly(pts).fill({
    fill: degradeLineaire(
      [
        { offset: 0, color: faceEclairee(PALETTE.parchemin, 0.6) },
        { offset: 0.55, color: PALETTE.parchemin },
        { offset: 1, color: ombreBleutee(PALETTE.parcheminOmbre, 0.4) },
      ],
      135,
    ),
  });
  const motif = new FillPattern({ texture: mats.parchemin, repetition: 'repeat' });
  motif.setTransform(new Matrix().scale(0.5, 0.5));
  g.poly(pts).fill({ fill: motif, alpha: 0.22 });
  /* liseré de camp, en bas : la couleur seule ne suffit jamais, la forme aide */
  g.poly([-w / 2, h * 0.1, w / 2, h * 0.1, w / 2, h * 0.16, 0, h / 2, -w / 2, h * 0.16]).fill({
    color: couleurCamp,
    alpha: 0.9,
  });
  g.poly(pts, true).stroke({ color: assombrir(PALETTE.parcheminOmbre, 0.55), width: 1.2 });
  g.poly(pts, true).stroke({ color: LIGHT.rim, width: 0.8, alpha: 0.55 });

  racine.addChild(g, texte);
  return racine;
}

/* ─────────────────────────────── Boutons ────────────────────────────────── */

export interface BoutonOptions {
  largeur: number;
  hauteur: number;
  libelle: string;
  /** deuxième ligne, en plus petit (raccourci clavier, coût) */
  note?: string;
  actif?: boolean;
  /** teinte de fond ; parchemin par défaut */
  teinte?: number;
}

/**
 * Bouton d'action : hauteur ≥ 48 px (bible §8), coins coupés, dégradé vertical,
 * filet d'or. L'état inactif est désaturé de 70 %, jamais grisé au noir.
 */
export function bouton(mats: MaterialSet, o: BoutonOptions): Container {
  const racine = new Container();
  racine.label = `bouton-${o.libelle}`;
  const actif = o.actif !== false;
  const teinte = o.teinte ?? PALETTE.parchemin;
  const g = new Graphics();
  panneau(g, mats, 0, 0, o.largeur, o.hauteur, {
    teinte: actif ? teinte : melanger(teinte, PALETTE.bleuBrume, 0.5),
    matiere: 'parchemin',
    matiereAlpha: 0.18,
    or: actif,
    graine: o.libelle.length * 13 + 7,
  });
  racine.addChild(g);

  const t = donnee(
    o.libelle,
    o.note ? 15 : 16,
    actif ? PALETTE.encre : melanger(PALETTE.encre, PALETTE.bleuBrume, 0.55),
    true,
  );
  t.anchor.set(0.5);
  t.position.set(o.largeur / 2, o.note ? o.hauteur / 2 - 7 : o.hauteur / 2);
  racine.addChild(t);

  if (o.note) {
    const n = donnee(o.note, 12, melanger(PALETTE.encre, PALETTE.brunFougere, 0.5));
    n.anchor.set(0.5);
    n.position.set(o.largeur / 2, o.hauteur / 2 + 11);
    racine.addChild(n);
  }
  racine.alpha = actif ? 1 : 0.72;
  return racine;
}

/* ─────────────────────────── Pastille d'école ───────────────────────────── */

/** Petite pastille organique : puce de liste, jamais un cercle parfait. */
export function pastille(g: Graphics, x: number, y: number, r: number, couleur: number, alpha = 1): void {
  g.poly(flat(blob(x, y, r, r * 0.92, { seed: Math.round(x + y), points: 9, wobble: 0.22 }))).fill({
    color: couleur,
    alpha,
  });
  g.poly(flat(blob(x - r * 0.22, y - r * 0.26, r * 0.42, r * 0.34, { seed: 5, points: 8, wobble: 0.3 }))).fill({
    color: eclaircir(couleur, 0.7),
    alpha: alpha * 0.75,
  });
}

/* ───────────────────────── Mise en forme des nombres ────────────────────── */

/** Nombre à espace fine insécable comme séparateur de milliers. */
export function nombreFr(v: number): string {
  const n = Math.round(v);
  const s = Math.abs(n).toString();
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ' ';
    out += s[i];
  }
  return (n < 0 ? '−' : '') + out;
}

/** Points de base rendus lisibles : « +15,0 % » et la valeur brute. */
export function pourcentBp(bp: number): string {
  const signe = bp > 0 ? '+' : bp < 0 ? '−' : '';
  const v = Math.abs(bp) / 100;
  const texte = v >= 10 ? v.toFixed(0) : v.toFixed(1).replace('.', ',');
  return `${signe}${texte} %`;
}
