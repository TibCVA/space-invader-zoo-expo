/**
 * Archétypes de créatures : assemblage des rigs et bibliothèque de pièces.
 *
 * Les vingt-huit formes du jeu ne sont pas vingt-huit dessins isolés : ce sont
 * des assemblages de pièces peintes par `shading.ts` sur des squelettes types
 * (bipède, quadrupède, volant, monture, monolithe, serpent). Ce fichier tient
 * les pièces communes et les jeux d'animation ; `granit.ts` et `ermitage.ts`
 * n'y ajoutent que ce qui rend chaque créature reconnaissable.
 */
import { Graphics } from 'pixi.js';
import type { FactionPalette } from '../palette.js';
import {
  FACTION_PALETTE,
  LIGHT,
  assombrir,
  eclaircir,
  faceEclairee,
  melanger,
  ombreBleutee,
  rimDoree,
} from '../palette.js';
import type { MaterialKey, MaterialSet, Poly, Pt } from '../shading.js';
import {
  arcBande,
  blob,
  bounds,
  contourVariable,
  degradeLineaire,
  densifier,
  flat,
  fuseau,
  lisereLumiere,
  lisser,
  peindre,
  perturber,
  pivoter,
  pt,
  translater,
} from '../shading.js';
import { hash2, prng } from '../noise.js';
import { Joint, Rig, clip, p } from '../rig.js';
import type { AnimName, Clip, Piste, RigOptions } from '../rig.js';

/* ─────────────────────────────── Le nécessaire ──────────────────────────── */

export interface Kit {
  mats: MaterialSet;
  faction: 'granit' | 'ermitage';
  pal: FactionPalette;
  /** graine déterministe propre à la créature */
  seed: number;
}

export function kitPour(mats: MaterialSet, faction: 'granit' | 'ermitage', seed: number): Kit {
  return { mats, faction, pal: FACTION_PALETTE[faction], seed };
}

/** Teints de peau du Forez : cinq valeurs, sans jamais tomber dans le gris. */
export const TEINTS = [0xd8b291, 0xc79a78, 0xa87a58, 0x8a5f42, 0xe3c3a4] as const;

export interface PieceDef {
  nom: string;
  parent?: string;
  x?: number;
  y?: number;
  rot?: number;
  sx?: number;
  sy?: number;
  /** > 0 = tourné vers le soleil au repos, sert au retournement */
  lumiere?: number;
  /** balancement d'ambiance, amplitude en px (≤ 3, loi n°7) */
  ambiance?: number;
  periode?: number;
  ordreMort?: number;
  dessin: (g: Graphics, k: Kit) => void;
}

/** Monte un rig complet à partir d'une liste de pièces ordonnée par profondeur. */
export function assembler(opts: RigOptions, pieces: PieceDef[], k: Kit): Rig {
  const rig = new Rig(opts);
  const map = new Map<string, Joint>();
  for (const def of pieces) {
    const j = new Joint(def.nom, def.x ?? 0, def.y ?? 0, def.rot ?? 0, def.sx ?? 1, def.sy ?? 1);
    j.expositionLumiere = def.lumiere ?? 0;
    j.ambiance = def.ambiance ?? 0;
    j.periode = def.periode ?? 3.4 + hash2(def.nom.length, k.seed, 5) * 3.2;
    j.ordreMort = def.ordreMort ?? 0;
    const parent = def.parent ? map.get(def.parent) : undefined;
    rig.ajouter(j, parent);
    map.set(def.nom, j);
    const g = new Graphics();
    def.dessin(g, k);
    j.addChild(g);
  }
  return rig;
}

/** Fabrique de créature : à partir du nécessaire de peinture, un rig neuf. */
export type Fabrique = (kit: Kit) => Rig;

/** Assemble un rig, y pose ses animations et le met en attente. */
export function creatureRig(
  opts: RigOptions,
  pieces: PieceDef[],
  k: Kit,
  animations: (rig: Rig) => void,
): Rig {
  const rig = assembler(opts, pieces, k);
  animations(rig);
  rig.play('attente');
  return rig;
}

/* ───────────────────────── Pièces communes peintes ──────────────────────── */

export interface CorpsOptions {
  couleur: number;
  matiere?: MaterialKey;
  matiereAlpha?: number;
  echelle?: number;
  modele?: number;
  rim?: boolean;
  seed?: number;
  speculaire?: { x: number; y: number; r: number } | null;
}

/** Peinture standard d'une pièce : trois strates garanties. */
export function poser(g: Graphics, k: Kit, poly: Poly, o: CorpsOptions): void {
  peindre(g, poly, k.mats, {
    base: o.couleur,
    matiere: o.matiere ?? 'grain',
    matiereAlpha: o.matiereAlpha ?? 0.15,
    matiereEchelle: o.echelle ?? 1,
    modele: o.modele ?? 1,
    rim: o.rim !== false,
    speculaire: o.speculaire ?? null,
  });
}

/** Membre fuselé : bras, jambe, patte, cou. */
export function membre(
  g: Graphics,
  k: Kit,
  a: Pt,
  b: Pt,
  largeur: number,
  o: CorpsOptions & { taper?: number },
): void {
  const poly = fuseau(a.x, a.y, b.x, b.y, largeur, {
    seed: (o.seed ?? 1) + k.seed,
    taper: o.taper ?? 0.24,
    bias: 0.6,
  });
  poser(g, k, poly, o);
}

/** Crâne humain stylisé, mâchoire comprise. */
export function crane(
  g: Graphics,
  k: Kit,
  o: { r: number; teint: number; seed?: number; menton?: number },
): void {
  const r = o.r;
  const menton = o.menton ?? 1;
  const tete: Poly = [
    pt(-r * 0.92, -r * 0.28),
    pt(-r * 0.84, -r * 0.84),
    pt(-r * 0.3, -r * 1.12),
    pt(r * 0.34, -r * 1.08),
    pt(r * 0.88, -r * 0.7),
    pt(r * 0.9, -r * 0.08),
    pt(r * 0.62, r * 0.62 * menton),
    pt(r * 0.14, r * 0.94 * menton),
    pt(-r * 0.34, r * 0.86 * menton),
    pt(-r * 0.78, r * 0.3),
  ];
  poser(g, k, lisser(perturber(densifier(tete, r * 0.44), r * 0.035, (o.seed ?? 1) + 5), 1), {
    couleur: o.teint,
    matiere: 'grain',
    matiereAlpha: 0.12,
    echelle: 0.55,
    modele: 0.9,
    seed: o.seed,
  });
}

/** Traits du visage : yeux, sourcils, nez, bouche. Jamais de contour noir. */
export function visage(
  g: Graphics,
  o: {
    r: number;
    teint: number;
    regard?: number;
    sourcils?: number;
    barbe?: number;
    barbeCouleur?: number;
    age?: number;
  },
): void {
  const r = o.r;
  const oeil = assombrir(o.teint, 0.72);
  const yy = -r * 0.2;
  for (const s of [-1, 1]) {
    const ox = s * r * 0.36;
    g.poly(flat(blob(ox, yy, r * 0.2, r * 0.13, { seed: 21 + s, points: 9, wobble: 0.18 }))).fill({
      color: melanger(0xe8dcc0, o.teint, 0.35),
      alpha: 0.9,
    });
    g.poly(
      flat(blob(ox + s * r * 0.03, yy + r * 0.01, r * 0.1, r * 0.1, { seed: 31 + s, points: 8, wobble: 0.2 })),
    ).fill({ color: oeil, alpha: 0.92 });
    // sourcil
    g.moveTo(ox - r * 0.24, yy - r * (0.26 + (o.sourcils ?? 0) * 0.1));
    g.quadraticCurveTo(ox, yy - r * (0.36 + (o.sourcils ?? 0) * 0.12), ox + r * 0.24, yy - r * 0.24);
    g.stroke({ color: assombrir(o.teint, 0.62), width: r * 0.1, alpha: 0.72, cap: 'round' });
  }
  // nez : une simple arête de valeur, côté ombre
  g.moveTo(r * 0.04, yy + r * 0.02);
  g.quadraticCurveTo(r * 0.16, yy + r * 0.28, r * 0.02, yy + r * 0.4);
  g.stroke({ color: assombrir(o.teint, 0.42), width: r * 0.075, alpha: 0.6, cap: 'round' });
  // bouche
  g.moveTo(-r * 0.22, yy + r * 0.62);
  g.quadraticCurveTo(0, yy + r * (0.68 + (o.regard ?? 0) * 0.06), r * 0.22, yy + r * 0.6);
  g.stroke({ color: assombrir(melanger(o.teint, 0x6e1f2a, 0.35), 0.34), width: r * 0.085, alpha: 0.66, cap: 'round' });
  if (o.age && o.age > 0.5) {
    for (let i = 0; i < 2; i += 1) {
      g.moveTo(-r * 0.72, yy - r * (0.5 + i * 0.16));
      g.quadraticCurveTo(0, yy - r * (0.62 + i * 0.16), r * 0.72, yy - r * (0.5 + i * 0.16));
      g.stroke({ color: assombrir(o.teint, 0.3), width: r * 0.05, alpha: 0.3 });
    }
  }
  if (o.barbe && o.barbe > 0) {
    const c = o.barbeCouleur ?? assombrir(o.teint, 0.55);
    const b = blob(0, r * 0.52, r * 0.72, r * 0.62 * o.barbe, { seed: 44, points: 16, wobble: 0.22 });
    g.poly(flat(b)).fill({ fill: degradeLineaire([
      { offset: 0, color: eclaircir(c, 0.3) },
      { offset: 1, color: ombreBleutee(c, 0.5) },
    ], 135), alpha: 0.94 });
    lisereLumiere(g, b, c, { force: 0.6, largeur: 1.1 });
  }
  // lumière chaude sur la pommette côté nord-ouest
  g.poly(flat(blob(-r * 0.42, yy + r * 0.14, r * 0.26, r * 0.2, { seed: 55, points: 10, wobble: 0.22 }))).fill({
    color: faceEclairee(o.teint, 0.75),
    alpha: 0.4,
  });
}

/** Chevelure : mèches, pas un casque de couleur. */
export function chevelure(
  g: Graphics,
  k: Kit,
  o: { r: number; couleur: number; longueur?: number; seed?: number; volume?: number },
): void {
  const r = o.r;
  const L = o.longueur ?? 1;
  const vol = o.volume ?? 1;
  const masse: Poly = lisser(
    perturber(
      densifier(
        [
          pt(-r * 1.02 * vol, -r * 0.3),
          pt(-r * 0.92, -r * 0.98),
          pt(-r * 0.24, -r * 1.28),
          pt(r * 0.42, -r * 1.2),
          pt(r * 0.98 * vol, -r * 0.68),
          pt(r * 1.04 * vol, r * 0.34 * L),
          pt(r * 0.66, r * 0.1),
          pt(r * 0.5, -r * 0.5),
          pt(-r * 0.5, -r * 0.62),
          pt(-r * 0.74, r * 0.2),
          pt(-r * 1.06 * vol, r * 0.5 * L),
        ],
        r * 0.4,
      ),
      r * 0.05,
      (o.seed ?? 2) + 9,
    ),
    1,
  );
  poser(g, k, masse, {
    couleur: o.couleur,
    matiere: 'fourrure',
    matiereAlpha: 0.24,
    echelle: 0.5,
    modele: 0.95,
    seed: o.seed,
  });
  const rand = prng((o.seed ?? 2) * 31 + 7);
  for (let i = 0; i < 7; i += 1) {
    const a = -2.6 + rand() * 2.2;
    const x0 = Math.cos(a) * r * 0.8;
    const y0 = Math.sin(a) * r * 0.8;
    g.moveTo(x0, y0);
    g.quadraticCurveTo(x0 * 1.3, y0 * 1.2 + r * 0.2, x0 * 1.12, y0 * 0.7 + r * 0.7 * L);
    g.stroke({
      color: i % 2 ? eclaircir(o.couleur, 0.4) : ombreBleutee(o.couleur, 0.5),
      width: r * 0.075,
      alpha: 0.55,
      cap: 'round',
    });
  }
}

/** Capuche : cône adouci, jamais un triangle net. */
export function capuche(
  g: Graphics,
  k: Kit,
  o: { r: number; couleur: number; pointe?: number; seed?: number; ouverture?: number },
): void {
  const r = o.r;
  const pointe = o.pointe ?? 0.6;
  const forme: Poly = lisser(
    perturber(
      densifier(
        [
          pt(-r * 1.16, r * 0.78),
          pt(-r * 1.1, -r * 0.42),
          pt(-r * 0.62, -r * (1.18 + pointe * 0.8)),
          pt(r * 0.05, -r * (1.42 + pointe * 1.15)),
          pt(r * 0.62, -r * (1.0 + pointe * 0.5)),
          pt(r * 1.14, -r * 0.24),
          pt(r * 1.2, r * 0.82),
          pt(r * 0.6, r * 0.6),
          pt(r * 0.46, -r * 0.34),
          pt(-r * 0.5, -r * 0.4),
          pt(-r * 0.62, r * 0.62),
        ],
        r * 0.36,
      ),
      r * 0.04,
      (o.seed ?? 4) + 13,
    ),
    1,
  );
  poser(g, k, forme, {
    couleur: o.couleur,
    matiere: 'tissu',
    matiereAlpha: 0.2,
    echelle: 0.6,
    modele: 1,
    seed: o.seed,
  });
  // ombre interne de la capuche : le visage est en retrait
  const creux = blob(0, -r * 0.02, r * (o.ouverture ?? 0.52), r * 0.62, {
    seed: (o.seed ?? 4) + 21,
    points: 14,
    wobble: 0.13,
  });
  g.poly(flat(creux)).fill({ color: ombreBleutee(o.couleur, 1), alpha: 0.72 });
}

/** Torse habillé, avec ceinture et éventuel plastron. */
export function torse(
  g: Graphics,
  k: Kit,
  o: {
    largeur: number;
    hauteur: number;
    couleur: number;
    matiere?: MaterialKey;
    ceinture?: number | null;
    plastron?: number | null;
    seed?: number;
    epaules?: number;
  },
): Poly {
  const w = o.largeur;
  const h = o.hauteur;
  const ep = o.epaules ?? 1;
  const forme: Poly = lisser(
    perturber(
      densifier(
        [
          pt(-w * 0.5 * ep, -h * 0.96),
          pt(-w * 0.2, -h * 1.02),
          pt(w * 0.22, -h * 1.0),
          pt(w * 0.52 * ep, -h * 0.92),
          pt(w * 0.46, -h * 0.42),
          pt(w * 0.4, h * 0.04),
          pt(w * 0.16, h * 0.1),
          pt(-w * 0.2, h * 0.08),
          pt(-w * 0.42, -h * 0.06),
          pt(-w * 0.5, -h * 0.5),
        ],
        Math.max(4, h * 0.2),
      ),
      w * 0.022,
      (o.seed ?? 6) + 3,
    ),
    1,
  );
  poser(g, k, forme, {
    couleur: o.couleur,
    matiere: o.matiere ?? 'tissu',
    matiereAlpha: 0.2,
    echelle: 0.7,
    modele: 1,
    seed: o.seed,
  });
  if (o.plastron != null) {
    const pl = lisser(
      perturber(
        densifier(
          [
            pt(-w * 0.38, -h * 0.86),
            pt(w * 0.4, -h * 0.84),
            pt(w * 0.34, -h * 0.2),
            pt(0, -h * 0.02),
            pt(-w * 0.34, -h * 0.22),
          ],
          h * 0.18,
        ),
        w * 0.018,
        (o.seed ?? 6) + 17,
      ),
      1,
    );
    poser(g, k, pl, {
      couleur: o.plastron,
      matiere: 'metal',
      matiereAlpha: 0.2,
      echelle: 0.6,
      modele: 1,
      speculaire: { x: 0.26, y: 0.24, r: 0.11 },
      seed: (o.seed ?? 6) + 2,
    });
  }
  if (o.ceinture != null) {
    const ce = perturber(
      densifier(
        [
          pt(-w * 0.46, -h * 0.12),
          pt(w * 0.44, -h * 0.1),
          pt(w * 0.42, h * 0.06),
          pt(-w * 0.44, h * 0.04),
        ],
        w * 0.2,
      ),
      w * 0.012,
      (o.seed ?? 6) + 23,
    );
    poser(g, k, ce, {
      couleur: o.ceinture,
      matiere: 'grain',
      matiereAlpha: 0.16,
      modele: 0.9,
      seed: (o.seed ?? 6) + 4,
    });
    // boucle
    const bo = blob(-w * 0.06, -h * 0.03, w * 0.08, h * 0.07, { seed: 12, points: 9, wobble: 0.2 });
    poser(g, k, bo, {
      couleur: LIGHT.rim,
      matiere: 'metal',
      matiereAlpha: 0.24,
      modele: 1,
      speculaire: { x: 0.3, y: 0.28, r: 0.2 },
    });
  }
  return forme;
}

/** Jupe, robe, bure : masse conique tombante. */
export function robe(
  g: Graphics,
  k: Kit,
  o: { largeurHaut: number; largeurBas: number; hauteur: number; couleur: number; seed?: number; plis?: number },
): void {
  const wh = o.largeurHaut;
  const wb = o.largeurBas;
  const h = o.hauteur;
  const base: Poly = [pt(-wh * 0.5, 0), pt(wh * 0.5, 0), pt(wb * 0.52, h * 0.72), pt(wb * 0.56, h)];
  const ourlet: Poly = [];
  const n = 7;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    ourlet.push(pt(wb * (0.56 - t * 1.12), h + Math.sin(t * Math.PI * 3 + (o.seed ?? 0)) * h * 0.035));
  }
  const forme = lisser(
    perturber(
      densifier([...base, ...ourlet, pt(-wb * 0.52, h * 0.72)], h * 0.16),
      wh * 0.014,
      (o.seed ?? 8) + 11,
    ),
    1,
  );
  poser(g, k, forme, {
    couleur: o.couleur,
    matiere: 'tissu',
    matiereAlpha: 0.22,
    echelle: 0.8,
    modele: 1,
    seed: o.seed,
  });
  const plis = o.plis ?? 4;
  for (let i = 0; i < plis; i += 1) {
    const t = (i + 0.6) / (plis + 0.2);
    const x0 = -wh * 0.4 + wh * 0.8 * t;
    const x1 = -wb * 0.44 + wb * 0.88 * t;
    g.moveTo(x0, h * 0.06);
    g.quadraticCurveTo((x0 + x1) / 2 + wh * 0.03, h * 0.55, x1, h * 0.96);
    g.stroke({
      color: i % 2 ? ombreBleutee(o.couleur, 0.6) : faceEclairee(o.couleur, 0.55),
      width: Math.max(0.9, wh * 0.028),
      alpha: 0.42,
      cap: 'round',
    });
  }
}

/** Cape ou manteau flottant, accroché aux épaules. */
export function cape(
  g: Graphics,
  k: Kit,
  o: { largeur: number; hauteur: number; couleur: number; seed?: number; vol?: number },
): void {
  const w = o.largeur;
  const h = o.hauteur;
  const v = o.vol ?? 1;
  const forme = lisser(
    perturber(
      densifier(
        [
          pt(-w * 0.46, 0),
          pt(w * 0.46, 0),
          pt(w * (0.58 + v * 0.12), h * 0.52),
          pt(w * 0.5, h * 0.95),
          pt(w * 0.14, h * 0.86),
          pt(-w * 0.2, h * 0.98),
          pt(-w * (0.56 + v * 0.1), h * 0.6),
        ],
        h * 0.16,
      ),
      w * 0.016,
      (o.seed ?? 9) + 19,
    ),
    1,
  );
  poser(g, k, forme, {
    couleur: o.couleur,
    matiere: 'tissu',
    matiereAlpha: 0.22,
    echelle: 0.85,
    modele: 1,
    seed: o.seed,
  });
  for (let i = 0; i < 3; i += 1) {
    const x = -w * 0.3 + i * w * 0.3;
    g.moveTo(x, h * 0.06);
    g.quadraticCurveTo(x + w * 0.05, h * 0.5, x + w * 0.02, h * 0.9);
    g.stroke({ color: ombreBleutee(o.couleur, 0.7), width: w * 0.022, alpha: 0.36, cap: 'round' });
  }
}

/** Main fermée ou ouverte, taille minuscule mais jamais un rond. */
export function main(g: Graphics, k: Kit, o: { r: number; teint: number; seed?: number }): void {
  const b = blob(0, 0, o.r, o.r * 1.12, { seed: (o.seed ?? 3) + 41, points: 10, wobble: 0.24 });
  poser(g, k, b, { couleur: o.teint, matiere: 'grain', matiereAlpha: 0.1, modele: 0.8, rim: true });
}

/** Botte ou pied nu. */
export function pied(
  g: Graphics,
  k: Kit,
  o: { l: number; h: number; couleur: number; seed?: number },
): void {
  const forme = lisser(
    perturber(
      densifier(
        [pt(-o.l * 0.3, -o.h), pt(o.l * 0.34, -o.h * 0.94), pt(o.l * 0.7, -o.h * 0.12), pt(o.l * 0.58, o.h * 0.1), pt(-o.l * 0.36, o.h * 0.06)],
        o.h * 0.5,
      ),
      o.h * 0.05,
      (o.seed ?? 5) + 29,
    ),
    1,
  );
  poser(g, k, forme, { couleur: o.couleur, matiere: 'grain', matiereAlpha: 0.15, modele: 0.95, seed: o.seed });
}

/* ─────────────────────────── Armes et attributs ─────────────────────────── */

/** Hampe de bois : jamais un trait droit uniforme. */
export function hampe(
  g: Graphics,
  k: Kit,
  a: Pt,
  b: Pt,
  epaisseur: number,
  couleur: number,
  seed = 1,
): void {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  const left: Poly = [];
  const right: Poly = [];
  const steps = 9;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const w = (epaisseur / 2) * (1 - t * 0.16 + Math.sin(t * 7 + seed) * 0.06);
    const px = a.x + dx * t + nx * Math.sin(t * 4.1 + seed) * epaisseur * 0.16;
    const py = a.y + dy * t + ny * Math.sin(t * 4.1 + seed) * epaisseur * 0.16;
    left.push(pt(px + nx * w, py + ny * w));
    right.push(pt(px - nx * w, py - ny * w));
  }
  right.reverse();
  poser(g, k, [...left, ...right], {
    couleur,
    matiere: 'ecorce',
    matiereAlpha: 0.26,
    echelle: 0.4,
    modele: 0.95,
    seed,
  });
}

/** Fer d'arme : lame, pointe, tranchant, avec spéculaire. */
export function fer(g: Graphics, k: Kit, poly: Poly, couleur = 0x8f99a4): void {
  poser(g, k, poly, {
    couleur,
    matiere: 'metal',
    matiereAlpha: 0.22,
    echelle: 0.5,
    modele: 1,
    speculaire: { x: 0.3, y: 0.26, r: 0.09 },
  });
}

/** Pointe de pique / lance. */
export function pointeLance(l: number, w: number): Poly {
  return lisser(
    perturber(
      densifier([pt(0, -l), pt(w * 0.5, -l * 0.62), pt(w * 0.34, -l * 0.06), pt(0, l * 0.1), pt(-w * 0.34, -l * 0.06), pt(-w * 0.5, -l * 0.62)], l * 0.22),
      l * 0.02,
      77,
    ),
    1,
  );
}

/** Écu (bouclier en amande ou chanfreiné) — jamais un demi-cercle propre. */
export function ecu(
  g: Graphics,
  k: Kit,
  o: { w: number; h: number; couleur: number; bord: number; meuble?: 'croix' | 'grenade' | 'borne' | 'feuille' | null; seed?: number },
): void {
  const w = o.w;
  const h = o.h;
  const forme = lisser(
    perturber(
      densifier(
        [pt(-w * 0.5, -h * 0.48), pt(0, -h * 0.54), pt(w * 0.5, -h * 0.46), pt(w * 0.44, h * 0.14), pt(0, h * 0.54), pt(-w * 0.44, h * 0.16)],
        h * 0.16,
      ),
      w * 0.014,
      (o.seed ?? 2) + 53,
    ),
    1,
  );
  poser(g, k, forme, {
    couleur: o.couleur,
    matiere: 'grain',
    matiereAlpha: 0.16,
    modele: 1,
    seed: o.seed,
  });
  contourVariable(g, forme, o.bord, { epaisseur: Math.max(1.4, w * 0.06), couleur: o.bord });
  if (o.meuble === 'croix') {
    const br = w * 0.12;
    g.poly(flat(perturber([pt(-br, -h * 0.34), pt(br, -h * 0.34), pt(br, -br), pt(w * 0.3, -br), pt(w * 0.3, br), pt(br, br), pt(br, h * 0.3), pt(-br, h * 0.3), pt(-br, br), pt(-w * 0.3, br), pt(-w * 0.3, -br), pt(-br, -br)], w * 0.012, 5))).fill({
      color: LIGHT.rim,
      alpha: 0.9,
    });
  } else if (o.meuble === 'grenade') {
    const b = blob(0, h * 0.04, w * 0.2, h * 0.2, { seed: 3, points: 12, wobble: 0.16 });
    g.poly(flat(b)).fill({ color: LIGHT.rim, alpha: 0.9 });
    g.poly(flat(perturber([pt(-w * 0.05, -h * 0.14), pt(w * 0.05, -h * 0.14), pt(0, -h * 0.3)], 0.6, 8))).fill({
      color: LIGHT.rim,
      alpha: 0.9,
    });
  } else if (o.meuble === 'borne') {
    g.poly(flat(perturber([pt(-w * 0.14, h * 0.26), pt(w * 0.14, h * 0.26), pt(w * 0.1, -h * 0.24), pt(0, -h * 0.34), pt(-w * 0.1, -h * 0.24)], w * 0.014, 11))).fill({
      color: LIGHT.rim,
      alpha: 0.88,
    });
  } else if (o.meuble === 'feuille') {
    g.poly(flat(fuseau(0, h * 0.3, 0, -h * 0.34, w * 0.34, { seed: 4 }))).fill({ color: LIGHT.rim, alpha: 0.86 });
  }
}

/** Bannière de tissu, avec ondulation et frange. */
export function banniereTissu(
  g: Graphics,
  k: Kit,
  o: { w: number; h: number; couleur: number; accent: number; seed?: number },
): void {
  const w = o.w;
  const h = o.h;
  const pts: Poly = [];
  const n = 8;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    pts.push(pt(w * t, Math.sin(t * 4.2 + (o.seed ?? 0)) * h * 0.05));
  }
  for (let i = n; i >= 0; i -= 1) {
    const t = i / n;
    const queue = t > 0.72 ? (t - 0.72) / 0.28 : 0;
    pts.push(pt(w * t, h * (1 - queue * 0.42) + Math.sin(t * 3.4 + 1.4 + (o.seed ?? 0)) * h * 0.06));
  }
  poser(g, k, pts, {
    couleur: o.couleur,
    matiere: 'tissu',
    matiereAlpha: 0.24,
    echelle: 0.9,
    modele: 1,
    seed: o.seed,
  });
  for (let i = 1; i < 4; i += 1) {
    const x = (w * i) / 4;
    g.moveTo(x, h * 0.06);
    g.quadraticCurveTo(x + w * 0.03, h * 0.5, x, h * 0.9);
    g.stroke({ color: i % 2 ? faceEclairee(o.couleur, 0.6) : ombreBleutee(o.couleur, 0.65), width: w * 0.02, alpha: 0.35 });
  }
  g.moveTo(0, h * 0.02);
  g.lineTo(w * 0.98, h * 0.04);
  g.stroke({ color: o.accent, width: h * 0.07, alpha: 0.8, cap: 'round' });
}

/** Corne, défense ou croc : arc épais qui s'affine. */
export function corne(
  g: Graphics,
  k: Kit,
  o: { cx: number; cy: number; rx: number; ry: number; a0: number; a1: number; ep: number; couleur: number; seed?: number },
): void {
  const poly = arcBande(o.cx, o.cy, o.rx, o.ry, o.a0, o.a1, o.ep, 0.82);
  poser(g, k, poly, {
    couleur: o.couleur,
    matiere: 'granit',
    matiereAlpha: 0.2,
    echelle: 0.35,
    modele: 1,
    speculaire: { x: 0.3, y: 0.3, r: 0.08 },
    seed: o.seed,
  });
}

/** Aile membraneuse ou emplumée. */
export function aile(
  g: Graphics,
  k: Kit,
  o: {
    envergure: number;
    corde: number;
    couleur: number;
    plume?: boolean;
    doigts?: number;
    seed?: number;
    sens?: 1 | -1;
  },
): void {
  const E = o.envergure;
  const C = o.corde;
  const s = o.sens ?? 1;
  const doigts = o.doigts ?? 4;
  const bordAttaque: Poly = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    bordAttaque.push(pt(s * E * t, -C * 0.16 * Math.sin(t * Math.PI * 0.9) - C * 0.04));
  }
  const bordFuite: Poly = [];
  for (let i = 8; i >= 0; i -= 1) {
    const t = i / 8;
    const festons = o.plume ? 0 : Math.abs(Math.sin(t * Math.PI * doigts)) * C * 0.16;
    bordFuite.push(pt(s * E * t, C * (0.28 + 0.72 * Math.sin(t * Math.PI * 0.75)) - festons));
  }
  const forme = lisser(perturber([...bordAttaque, ...bordFuite], C * 0.012, (o.seed ?? 7) + 61), 1);
  poser(g, k, forme, {
    couleur: o.couleur,
    matiere: o.plume ? 'plumes' : 'ecailles',
    matiereAlpha: 0.24,
    echelle: o.plume ? 0.7 : 0.6,
    modele: 1,
    seed: o.seed,
  });
  if (o.plume) {
    for (let i = 0; i < 6; i += 1) {
      const t = 0.24 + (i / 6) * 0.72;
      const x0 = s * E * t;
      const y0 = -C * 0.1;
      const y1 = C * (0.3 + 0.68 * Math.sin(t * Math.PI * 0.75));
      const pl = fuseau(x0, y0, x0 + s * C * 0.1, y1, C * 0.2, { seed: i + (o.seed ?? 0), taper: 0.5 });
      poser(g, k, pl, {
        couleur: i % 2 ? assombrir(o.couleur, 0.18) : eclaircir(o.couleur, 0.1),
        matiere: 'plumes',
        matiereAlpha: 0.2,
        echelle: 0.55,
        modele: 0.8,
        rim: i > 3,
      });
    }
  } else {
    for (let i = 1; i < doigts; i += 1) {
      const t = i / doigts;
      g.moveTo(s * E * 0.06, -C * 0.06);
      g.quadraticCurveTo(s * E * t * 0.6, C * 0.14, s * E * t, C * (0.28 + 0.7 * Math.sin(t * Math.PI * 0.75)));
      g.stroke({ color: assombrir(o.couleur, 0.42), width: C * 0.05, alpha: 0.72, cap: 'round' });
    }
  }
}

/** Queue segmentée (loup, cerf, vouivre). */
export function queue(
  g: Graphics,
  k: Kit,
  o: { longueur: number; epaisseur: number; couleur: number; courbe?: number; matiere?: MaterialKey; seed?: number },
): void {
  const L = o.longueur;
  const c = o.courbe ?? 0.5;
  const pts: Poly = [];
  const back: Poly = [];
  for (let i = 0; i <= 10; i += 1) {
    const t = i / 10;
    const x = L * t;
    const y = -Math.sin(t * Math.PI * 0.8) * L * c * 0.4 + t * t * L * 0.16;
    const w = (o.epaisseur / 2) * (1 - t * 0.72);
    pts.push(pt(x, y - w));
    back.push(pt(x, y + w));
  }
  back.reverse();
  poser(g, k, lisser([...pts, ...back], 1), {
    couleur: o.couleur,
    matiere: o.matiere ?? 'fourrure',
    matiereAlpha: 0.24,
    echelle: 0.5,
    modele: 1,
    seed: o.seed,
  });
}

/* ─────────────────────────── Jeux d'animation ───────────────────────────── */

function si(rig: Rig, nom: string, piste: Piste): Piste[] {
  return rig.aJoint(nom) ? [piste] : [];
}

function poser7(rig: Rig, clips: Partial<Record<AnimName, Clip>>): void {
  for (const [nom, c] of Object.entries(clips)) {
    if (c) rig.definirClip(nom as AnimName, c);
  }
}

export interface ReglageAnim {
  /** amplitude de la foulée */
  foulee?: number;
  /** allonge de l'attaque en px */
  allonge?: number;
  /** lourdeur : ralentit et amortit tout */
  lourdeur?: number;
  /** l'attaque est un tir : pas de fente, recul d'épaule */
  tir?: boolean;
  /** l'attaque est un envol / une charge */
  charge?: boolean;
}

/**
 * Temps du geste d'attaque, **la seule source** : les clips ci-dessous les
 * emploient, et l'animation de combat (`battle/anim.ts`) cale l'impact
 * dessus au lieu de le deviner.
 *
 * L'audit du combat avait mesuré l'écart : l'impact partait à 200 ms quand
 * l'arme touche à 0,48 × 0,66 = 317 ms — **cent dix-sept millisecondes
 * avant le contact**, si bien que la victime encaissait avant d'être
 * frappée, et que la fente de l'attaquant était déjà retombée quand le sang
 * giclait. Deux chiffres écrits à deux endroits finissent toujours par
 * diverger : ils n'ont plus qu'un domicile.
 */
export const GESTE_ATTAQUE = {
  /** durée du clip au corps à corps, en secondes */
  dureeCorpsACorps: 0.66,
  /** fraction du clip où l'arme touche */
  chocCorpsACorps: 0.48,
  /** durée du clip de tir */
  dureeTir: 0.72,
  /** fraction du clip où le trait quitte la main */
  lacherTir: 0.34,
} as const;

/** Instant du contact au corps à corps, en secondes depuis le début du geste. */
export const CONTACT_CORPS_A_CORPS =
  GESTE_ATTAQUE.dureeCorpsACorps * GESTE_ATTAQUE.chocCorpsACorps;

/** Instant où le trait part, en secondes depuis le début du geste. */
export const LACHER_DU_TRAIT = GESTE_ATTAQUE.dureeTir * GESTE_ATTAQUE.lacherTir;

/**
 * Sept animations pour un bipède. Les noms d'articulations attendus sont
 * `bassin torse tete bras_g bras_d jambe_g jambe_d arme bouclier cape`.
 * Les pistes visant une articulation absente sont ignorées.
 */
export function clipsBipede(rig: Rig, r: ReglageAnim = {}): void {
  const F = r.foulee ?? 1;
  const A = r.allonge ?? 1;
  const L = r.lourdeur ?? 1;
  const tir = r.tir ?? false;

  const attente = clip(2.4, true, [
    ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.5, 0.022], [1, 0]])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.3, -0.03], [0.72, 0.026], [1, 0]])),
    ...si(rig, 'tete', p('tete', 'y', [[0, 0], [0.5, -0.7], [1, 0]])),
    ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.5, 0.06], [1, 0]])),
    ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.5, -0.05], [1, 0]])),
    ...si(rig, 'cape', p('cape', 'rot', [[0, 0], [0.34, 0.035], [0.7, -0.028], [1, 0]])),
  ]);

  const marche = clip(0.82 / Math.max(0.5, 1 / L), true, [
    ...si(rig, 'jambe_g', p('jambe_g', 'rot', [[0, 0.42 * F], [0.5, -0.42 * F], [1, 0.42 * F]])),
    ...si(rig, 'jambe_d', p('jambe_d', 'rot', [[0, -0.42 * F], [0.5, 0.42 * F], [1, -0.42 * F]])),
    ...si(rig, 'bassin', p('bassin', 'y', [[0, 0], [0.25, -2.4 * F], [0.5, 0], [0.75, -2.4 * F], [1, 0]])),
    ...si(rig, 'bassin', p('bassin', 'rot', [[0, -0.03], [0.5, 0.03], [1, -0.03]])),
    ...si(rig, 'torse', p('torse', 'rot', [[0, 0.04], [0.5, -0.04], [1, 0.04]])),
    ...si(rig, 'tete', p('tete', 'y', [[0, 0], [0.25, -1], [0.5, 0], [0.75, -1], [1, 0]])),
    ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, -0.34 * F], [0.5, 0.34 * F], [1, -0.34 * F]])),
    ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0.3 * F], [0.5, -0.3 * F], [1, 0.3 * F]])),
    ...si(rig, 'cape', p('cape', 'rot', [[0, 0.06], [0.5, -0.06], [1, 0.06]])),
  ]);

  const attaque = tir
    ? clip(GESTE_ATTAQUE.dureeTir, false, [
        ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.34, -0.1, 'sortie'], [0.52, 0.06, 'choc'], [1, 0, 'doux']])),
        ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.34, 0.34, 'sortie'], [0.5, -0.12, 'choc'], [1, 0, 'doux']])),
        ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.34, -0.14, 'sortie'], [0.52, 0.05, 'choc'], [1, 0, 'doux']])),
        ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.3, -0.08], [0.55, 0.04], [1, 0]])),
        ...si(rig, 'arme', p('arme', 'rot', [[0, 0], [0.34, -0.07], [0.52, 0.03, 'choc'], [1, 0]])),
      ])
    : clip(GESTE_ATTAQUE.dureeCorpsACorps, false, [
        ...si(rig, 'bassin', p('bassin', 'x', [[0, 0], [0.3, -3 * A, 'sortie'], [0.48, 9 * A, 'choc'], [1, 0, 'doux']])),
        ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.3, -0.24, 'sortie'], [0.48, 0.3, 'choc'], [1, 0, 'doux']])),
        ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.3, -0.9, 'sortie'], [0.48, 1.15, 'choc'], [1, 0, 'doux']])),
        ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.3, 0.4, 'sortie'], [0.48, -0.35, 'choc'], [1, 0, 'doux']])),
        ...si(rig, 'arme', p('arme', 'rot', [[0, 0], [0.3, -0.5, 'sortie'], [0.48, 0.8, 'choc'], [1, 0, 'doux']])),
        ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.3, -0.12], [0.5, 0.16], [1, 0]])),
        ...si(rig, 'jambe_g', p('jambe_g', 'rot', [[0, 0], [0.48, -0.3], [1, 0]])),
        ...si(rig, 'jambe_d', p('jambe_d', 'rot', [[0, 0], [0.48, 0.24], [1, 0]])),
      ]);

  const impact = clip(
    0.44,
    false,
    [
      ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.16, 0.26, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.16, 0.36, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'bassin', p('bassin', 'x', [[0, 0], [0.18, -5, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.18, 0.5, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.18, 0.42, 'choc'], [1, 0, 'elastique']])),
    ],
    { secousse: 3.6 },
  );

  const riposte = clip(0.5, false, [
    ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.24, -0.16, 'sortie'], [0.42, 0.22, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.24, -0.55, 'sortie'], [0.42, 0.78, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'arme', p('arme', 'rot', [[0, 0], [0.24, -0.3], [0.42, 0.55, 'choc'], [1, 0]])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.3, 0.1], [1, 0]])),
  ]);

  const defense = clip(0.9, false, [
    ...si(rig, 'bassin', p('bassin', 'y', [[0, 0], [0.24, 4.2, 'sortie'], [0.72, 4.2], [1, 0, 'doux']])),
    ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.24, 0.16, 'sortie'], [0.72, 0.16], [1, 0, 'doux']])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.24, 0.2], [0.72, 0.2], [1, 0]])),
    ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.24, -0.72, 'sortie'], [0.72, -0.68], [1, 0, 'doux']])),
    ...si(rig, 'bouclier', p('bouclier', 'rot', [[0, 0], [0.24, -0.34], [0.72, -0.3], [1, 0]])),
    ...si(rig, 'jambe_g', p('jambe_g', 'rot', [[0, 0], [0.24, -0.18], [0.72, -0.18], [1, 0]])),
    ...si(rig, 'jambe_d', p('jambe_d', 'rot', [[0, 0], [0.24, 0.2], [0.72, 0.2], [1, 0]])),
  ]);

  const mort = clip(1.05, false, [
    ...si(rig, 'bassin', p('bassin', 'y', [[0, 0], [0.3, -2, 'sortie'], [1, 17, 'accelere']])),
    ...si(rig, 'bassin', p('bassin', 'rot', [[0, 0], [0.34, -0.12], [1, 0.5, 'accelere']])),
    ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.3, -0.2], [1, 0.62, 'accelere']])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.26, -0.3], [1, 0.75, 'accelere']])),
    ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.3, -0.5], [1, 1.15, 'accelere']])),
    ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.3, 0.55], [1, -0.85, 'accelere']])),
    ...si(rig, 'jambe_g', p('jambe_g', 'rot', [[0, 0], [1, -0.62, 'accelere']])),
    ...si(rig, 'jambe_d', p('jambe_d', 'rot', [[0, 0], [1, 0.5, 'accelere']])),
    ...si(rig, 'arme', p('arme', 'rot', [[0, 0], [1, 1.4, 'accelere']])),
  ]);

  poser7(rig, { attente, marche, attaque, impact, riposte, defense, mort });
}

/**
 * Sept animations pour un quadrupède. Articulations attendues :
 * `corps cou tete patte_ag patte_ad patte_pg patte_pd queue`.
 */
export function clipsQuadrupede(rig: Rig, r: ReglageAnim = {}): void {
  const F = r.foulee ?? 1;
  const L = r.lourdeur ?? 1;
  const A = r.allonge ?? 1;

  const attente = clip(2.4, true, [
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.5, -0.8], [1, 0]])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.42, -0.03], [1, 0]])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.3, 0.04], [0.68, -0.035], [1, 0]])),
    ...si(rig, 'queue', p('queue', 'rot', [[0, 0], [0.28, 0.12], [0.62, -0.1], [1, 0]])),
    ...si(rig, 'oreille_g', p('oreille_g', 'rot', [[0, 0], [0.2, -0.16], [0.4, 0.05], [1, 0]])),
  ]);

  const marche = clip(0.7 * L, true, [
    ...si(rig, 'patte_ag', p('patte_ag', 'rot', [[0, 0.5 * F], [0.5, -0.5 * F], [1, 0.5 * F]])),
    ...si(rig, 'patte_ad', p('patte_ad', 'rot', [[0, -0.42 * F], [0.5, 0.42 * F], [1, -0.42 * F]])),
    ...si(rig, 'patte_pg', p('patte_pg', 'rot', [[0, -0.46 * F], [0.5, 0.46 * F], [1, -0.46 * F]])),
    ...si(rig, 'patte_pd', p('patte_pd', 'rot', [[0, 0.4 * F], [0.5, -0.4 * F], [1, 0.4 * F]])),
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.25, -2.6 * F], [0.5, 0], [0.75, -2.6 * F], [1, 0]])),
    ...si(rig, 'corps', p('corps', 'rot', [[0, -0.025], [0.5, 0.025], [1, -0.025]])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0.04], [0.5, -0.04], [1, 0.04]])),
    ...si(rig, 'queue', p('queue', 'rot', [[0, 0.16], [0.5, -0.16], [1, 0.16]])),
  ]);

  const attaque = clip(0.6, false, [
    ...si(rig, 'corps', p('corps', 'x', [[0, 0], [0.28, -4 * A, 'sortie'], [0.46, 13 * A, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'corps', p('corps', 'rot', [[0, 0], [0.28, 0.12], [0.46, -0.18, 'choc'], [1, 0]])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.28, 0.22, 'sortie'], [0.46, -0.4, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.28, 0.18], [0.46, -0.32, 'choc'], [1, 0]])),
    ...si(rig, 'machoire', p('machoire', 'rot', [[0, 0], [0.3, 0.5, 'sortie'], [0.5, 0, 'choc'], [1, 0]])),
    ...si(rig, 'patte_ag', p('patte_ag', 'rot', [[0, 0], [0.3, -0.6], [0.5, 0.3], [1, 0]])),
    ...si(rig, 'patte_ad', p('patte_ad', 'rot', [[0, 0], [0.3, -0.45], [0.5, 0.24], [1, 0]])),
  ]);

  const impact = clip(
    0.42,
    false,
    [
      ...si(rig, 'corps', p('corps', 'x', [[0, 0], [0.16, -6, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'corps', p('corps', 'rot', [[0, 0], [0.16, 0.14, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.16, 0.3, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.16, 0.24, 'choc'], [1, 0, 'elastique']])),
    ],
    { secousse: 3.8 },
  );

  const riposte = clip(0.46, false, [
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.22, 0.2, 'sortie'], [0.4, -0.34, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.22, 0.14], [0.4, -0.28, 'choc'], [1, 0]])),
    ...si(rig, 'machoire', p('machoire', 'rot', [[0, 0], [0.24, 0.42], [0.42, 0], [1, 0]])),
  ]);

  const defense = clip(0.9, false, [
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.24, 4, 'sortie'], [0.74, 4], [1, 0, 'doux']])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.24, 0.3], [0.74, 0.28], [1, 0]])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.24, -0.16], [0.74, -0.14], [1, 0]])),
    ...si(rig, 'queue', p('queue', 'rot', [[0, 0], [0.24, 0.4], [0.74, 0.38], [1, 0]])),
  ]);

  const mort = clip(1.05, false, [
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.24, -2.5], [1, 13, 'accelere']])),
    ...si(rig, 'corps', p('corps', 'rot', [[0, 0], [1, 0.4, 'accelere']])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.3, -0.35], [1, 0.7, 'accelere']])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [1, 0.6, 'accelere']])),
    ...si(rig, 'patte_ag', p('patte_ag', 'rot', [[0, 0], [1, -0.9, 'accelere']])),
    ...si(rig, 'patte_ad', p('patte_ad', 'rot', [[0, 0], [1, -0.7, 'accelere']])),
    ...si(rig, 'patte_pg', p('patte_pg', 'rot', [[0, 0], [1, 0.8, 'accelere']])),
    ...si(rig, 'patte_pd', p('patte_pd', 'rot', [[0, 0], [1, 0.6, 'accelere']])),
    ...si(rig, 'queue', p('queue', 'rot', [[0, 0], [1, -0.5, 'accelere']])),
  ]);

  poser7(rig, { attente, marche, attaque, impact, riposte, defense, mort });
}

/**
 * Sept animations pour un volant. Articulations attendues :
 * `corps aile_g aile_d tete cou queue serre_g serre_d`.
 */
export function clipsVolant(rig: Rig, r: ReglageAnim = {}): void {
  const F = r.foulee ?? 1;
  const A = r.allonge ?? 1;

  const battement = (dur: number, amp: number, boucle: boolean): Piste[] => [
    ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, -amp * 0.4], [0.42, amp], [1, -amp * 0.4]])),
    ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, amp * 0.4], [0.42, -amp], [1, amp * 0.4]])),
    ...si(rig, 'aile_g', p('aile_g', 'sy', [[0, 1], [0.42, 0.86], [1, 1]])),
    ...si(rig, 'aile_d', p('aile_d', 'sy', [[0, 1], [0.42, 0.86], [1, 1]])),
    ...si(rig, 'corps', p('corps', 'y', [[0, 2.4], [0.46, -2.6], [1, 2.4]])),
    ...(boucle && dur > 0 ? [] : []),
  ];

  const attente = clip(2.4, true, [
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.5, -2.6], [1, 0]])),
    ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [0.5, -0.16], [1, 0]])),
    ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [0.5, 0.16], [1, 0]])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.26, -0.08], [0.6, 0.06], [1, 0]])),
    ...si(rig, 'queue', p('queue', 'rot', [[0, 0], [0.4, 0.1], [0.8, -0.08], [1, 0]])),
  ]);

  const marche = clip(0.68, true, battement(0.68, 0.7 * F, true));

  const attaque = clip(0.72, false, [
    ...si(rig, 'corps', p('corps', 'x', [[0, 0], [0.3, -7 * A, 'sortie'], [0.5, 16 * A, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.3, -8], [0.5, 5, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [0.3, -0.85, 'sortie'], [0.52, 0.5, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [0.3, 0.85, 'sortie'], [0.52, -0.5, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.3, -0.2], [0.5, 0.34, 'choc'], [1, 0]])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.3, -0.16], [0.5, 0.3, 'choc'], [1, 0]])),
    ...si(rig, 'serre_g', p('serre_g', 'rot', [[0, 0], [0.34, -0.7], [0.52, 0.6, 'choc'], [1, 0]])),
    ...si(rig, 'serre_d', p('serre_d', 'rot', [[0, 0], [0.34, -0.55], [0.52, 0.45, 'choc'], [1, 0]])),
  ]);

  const impact = clip(
    0.44,
    false,
    [
      ...si(rig, 'corps', p('corps', 'x', [[0, 0], [0.16, -7, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'corps', p('corps', 'rot', [[0, 0], [0.16, 0.16, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [0.16, 0.55, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [0.16, -0.55, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.16, 0.3, 'choc'], [1, 0, 'elastique']])),
    ],
    { secousse: 3.4 },
  );

  const riposte = clip(0.5, false, [
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.22, -0.24, 'sortie'], [0.4, 0.36, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.22, -0.18], [0.4, 0.3, 'choc'], [1, 0]])),
    ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [0.24, -0.4], [0.44, 0.22], [1, 0]])),
    ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [0.24, 0.4], [0.44, -0.22], [1, 0]])),
  ]);

  const defense = clip(0.95, false, [
    ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [0.24, 0.95, 'sortie'], [0.74, 0.92], [1, 0, 'doux']])),
    ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [0.24, -0.95, 'sortie'], [0.74, -0.92], [1, 0, 'doux']])),
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.24, 3.4], [0.74, 3.4], [1, 0]])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.24, 0.34], [0.74, 0.32], [1, 0]])),
  ]);

  const mort = clip(1.1, false, [
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.2, -4], [1, 20, 'accelere']])),
    ...si(rig, 'corps', p('corps', 'rot', [[0, 0], [1, 0.55, 'accelere']])),
    ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [0.3, -0.5], [1, 1.25, 'accelere']])),
    ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [0.3, 0.5], [1, -1.15, 'accelere']])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [1, 0.85, 'accelere']])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [1, 0.7, 'accelere']])),
    ...si(rig, 'queue', p('queue', 'rot', [[0, 0], [1, -0.7, 'accelere']])),
  ]);

  poser7(rig, { attente, marche, attaque, impact, riposte, defense, mort });
}

/** Sept animations pour un colosse de pierre : lent, lourd, jamais élastique. */
export function clipsMonolithe(rig: Rig, r: ReglageAnim = {}): void {
  const A = r.allonge ?? 1;

  const attente = clip(3.6, true, [
    ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.5, 0.014], [1, 0]])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.36, -0.02], [0.78, 0.016], [1, 0]])),
    ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.5, 0.035], [1, 0]])),
    ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.5, -0.03], [1, 0]])),
  ]);

  const marche = clip(1.5, true, [
    ...si(rig, 'jambe_g', p('jambe_g', 'rot', [[0, 0.24], [0.5, -0.24], [1, 0.24]])),
    ...si(rig, 'jambe_d', p('jambe_d', 'rot', [[0, -0.24], [0.5, 0.24], [1, -0.24]])),
    ...si(rig, 'bassin', p('bassin', 'y', [[0, 0], [0.24, -1.6], [0.5, 1.2, 'choc'], [0.74, -1.6], [1, 0]])),
    ...si(rig, 'torse', p('torse', 'rot', [[0, 0.03], [0.5, -0.03], [1, 0.03]])),
    ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, -0.16], [0.5, 0.16], [1, -0.16]])),
    ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0.14], [0.5, -0.14], [1, 0.14]])),
  ]);

  const attaque = clip(
    0.98,
    false,
    [
      ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.42, -0.28, 'sortie'], [0.6, 0.3, 'choc'], [1, 0, 'doux']])),
      ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.42, -1.4, 'sortie'], [0.6, 1.05, 'choc'], [1, 0, 'doux']])),
      ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.42, 0.4], [0.62, -0.4, 'choc'], [1, 0]])),
      ...si(rig, 'bassin', p('bassin', 'x', [[0, 0], [0.42, -3 * A], [0.6, 7 * A, 'choc'], [1, 0, 'doux']])),
      ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.42, -0.14], [0.6, 0.2], [1, 0]])),
    ],
    { secousse: 2.4 },
  );

  const impact = clip(
    0.52,
    false,
    [
      ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.2, 0.14, 'choc'], [1, 0, 'sortie']])),
      ...si(rig, 'bassin', p('bassin', 'x', [[0, 0], [0.2, -3, 'choc'], [1, 0, 'sortie']])),
      ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.2, 0.18, 'choc'], [1, 0, 'sortie']])),
    ],
    { secousse: 4.6 },
  );

  const riposte = clip(0.72, false, [
    ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.3, -0.8, 'sortie'], [0.5, 0.7, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.3, -0.14], [0.5, 0.2, 'choc'], [1, 0]])),
  ]);

  const defense = clip(1.2, false, [
    ...si(rig, 'bassin', p('bassin', 'y', [[0, 0], [0.26, 5, 'sortie'], [0.76, 5], [1, 0, 'doux']])),
    ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.26, -0.9], [0.76, -0.88], [1, 0]])),
    ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.26, 0.9], [0.76, 0.88], [1, 0]])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.26, 0.2], [0.76, 0.2], [1, 0]])),
  ]);

  const mort = clip(1.25, false, [
    ...si(rig, 'bassin', p('bassin', 'y', [[0, 0], [0.34, 3], [1, 22, 'accelere']])),
    ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.34, 0.1], [1, 0.44, 'accelere']])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.3, 0.2], [1, 0.9, 'accelere']])),
    ...si(rig, 'tete', p('tete', 'x', [[0, 0], [1, 9, 'accelere']])),
    ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [1, -1.1, 'accelere']])),
    ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [1, 1.05, 'accelere']])),
    ...si(rig, 'jambe_g', p('jambe_g', 'rot', [[0, 0], [1, -0.5, 'accelere']])),
    ...si(rig, 'jambe_d', p('jambe_d', 'rot', [[0, 0], [1, 0.45, 'accelere']])),
  ]);

  poser7(rig, { attente, marche, attaque, impact, riposte, defense, mort });
}

/** Sept animations pour un cavalier : le cheval mène, le cavalier suit. */
export function clipsMonture(rig: Rig, r: ReglageAnim = {}): void {
  const F = r.foulee ?? 1;
  const A = r.allonge ?? 1;

  const attente = clip(2.4, true, [
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.5, -0.9], [1, 0]])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.44, -0.04], [1, 0]])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.28, 0.05], [0.66, -0.04], [1, 0]])),
    ...si(rig, 'cavalier', p('cavalier', 'rot', [[0, 0], [0.5, 0.02], [1, 0]])),
    ...si(rig, 'tete_cavalier', p('tete_cavalier', 'rot', [[0, 0], [0.34, -0.035], [0.72, 0.03], [1, 0]])),
    ...si(rig, 'queue', p('queue', 'rot', [[0, 0], [0.3, 0.14], [0.7, -0.12], [1, 0]])),
    ...si(rig, 'arme', p('arme', 'rot', [[0, 0], [0.5, -0.025], [1, 0]])),
  ]);

  const marche = clip(0.62, true, [
    ...si(rig, 'patte_ag', p('patte_ag', 'rot', [[0, 0.55 * F], [0.5, -0.55 * F], [1, 0.55 * F]])),
    ...si(rig, 'patte_ad', p('patte_ad', 'rot', [[0, -0.45 * F], [0.5, 0.45 * F], [1, -0.45 * F]])),
    ...si(rig, 'patte_pg', p('patte_pg', 'rot', [[0, -0.5 * F], [0.5, 0.5 * F], [1, -0.5 * F]])),
    ...si(rig, 'patte_pd', p('patte_pd', 'rot', [[0, 0.44 * F], [0.5, -0.44 * F], [1, 0.44 * F]])),
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.25, -3.2], [0.5, 0], [0.75, -3.2], [1, 0]])),
    ...si(rig, 'cavalier', p('cavalier', 'y', [[0, 0], [0.25, -1.6], [0.5, 0.6], [0.75, -1.6], [1, 0]])),
    ...si(rig, 'cavalier', p('cavalier', 'rot', [[0, 0.03], [0.5, -0.03], [1, 0.03]])),
    ...si(rig, 'tete_cavalier', p('tete_cavalier', 'y', [[0, 0], [0.25, -1.1], [0.5, 0.4], [0.75, -1.1], [1, 0]])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0.05], [0.5, -0.05], [1, 0.05]])),
    ...si(rig, 'criniere', p('criniere', 'rot', [[0, 0.08], [0.5, -0.1], [1, 0.08]])),
    ...si(rig, 'queue', p('queue', 'rot', [[0, 0.18], [0.5, -0.18], [1, 0.18]])),
  ]);

  const attaque = clip(0.78, false, [
    ...si(rig, 'corps', p('corps', 'x', [[0, 0], [0.3, -6 * A, 'sortie'], [0.5, 18 * A, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'corps', p('corps', 'rot', [[0, 0], [0.3, 0.1], [0.5, -0.16, 'choc'], [1, 0]])),
    ...si(rig, 'patte_ag', p('patte_ag', 'rot', [[0, 0], [0.3, -1.1, 'sortie'], [0.56, 0.5, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'patte_ad', p('patte_ad', 'rot', [[0, 0], [0.3, -0.85, 'sortie'], [0.56, 0.42, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'cavalier', p('cavalier', 'rot', [[0, 0], [0.3, -0.16], [0.5, 0.22, 'choc'], [1, 0]])),
    ...si(rig, 'tete_cavalier', p('tete_cavalier', 'rot', [[0, 0], [0.3, -0.12], [0.5, 0.18, 'choc'], [1, 0]])),
    ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.3, -0.34], [0.5, 0.28, 'choc'], [1, 0]])),
    ...si(rig, 'arme', p('arme', 'rot', [[0, 0], [0.3, -0.22, 'sortie'], [0.5, 0.34, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'criniere', p('criniere', 'rot', [[0, 0], [0.3, -0.3], [0.6, 0.24], [1, 0]])),
  ]);

  const impact = clip(
    0.46,
    false,
    [
      ...si(rig, 'corps', p('corps', 'x', [[0, 0], [0.16, -7, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'cavalier', p('cavalier', 'rot', [[0, 0], [0.16, 0.22, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'tete_cavalier', p('tete_cavalier', 'rot', [[0, 0], [0.16, 0.3, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.16, 0.24, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.16, 0.2, 'choc'], [1, 0, 'elastique']])),
    ],
    { secousse: 4 },
  );

  const riposte = clip(0.54, false, [
    ...si(rig, 'cavalier', p('cavalier', 'rot', [[0, 0], [0.24, -0.14], [0.42, 0.2, 'choc'], [1, 0]])),
    ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.24, -0.5, 'sortie'], [0.42, 0.62, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'arme', p('arme', 'rot', [[0, 0], [0.24, -0.3], [0.42, 0.42, 'choc'], [1, 0]])),
  ]);

  const defense = clip(0.95, false, [
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.24, 3.4], [0.74, 3.4], [1, 0]])),
    ...si(rig, 'cavalier', p('cavalier', 'rot', [[0, 0], [0.24, 0.16], [0.74, 0.16], [1, 0]])),
    ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.24, -0.7], [0.74, -0.68], [1, 0]])),
    ...si(rig, 'bouclier', p('bouclier', 'rot', [[0, 0], [0.24, -0.3], [0.74, -0.28], [1, 0]])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.24, 0.24], [0.74, 0.24], [1, 0]])),
  ]);

  const mort = clip(1.2, false, [
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.24, -3], [1, 18, 'accelere']])),
    ...si(rig, 'corps', p('corps', 'rot', [[0, 0], [1, 0.42, 'accelere']])),
    ...si(rig, 'cavalier', p('cavalier', 'rot', [[0, 0], [0.3, -0.3], [1, 0.95, 'accelere']])),
    ...si(rig, 'tete_cavalier', p('tete_cavalier', 'rot', [[0, 0], [1, 0.6, 'accelere']])),
    ...si(rig, 'cavalier', p('cavalier', 'x', [[0, 0], [1, -12, 'accelere']])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [1, 0.6, 'accelere']])),
    ...si(rig, 'patte_ag', p('patte_ag', 'rot', [[0, 0], [1, -0.9, 'accelere']])),
    ...si(rig, 'patte_pg', p('patte_pg', 'rot', [[0, 0], [1, 0.8, 'accelere']])),
    ...si(rig, 'arme', p('arme', 'rot', [[0, 0], [1, 1.5, 'accelere']])),
  ]);

  poser7(rig, { attente, marche, attaque, impact, riposte, defense, mort });
}

/** Sept animations pour un serpent ailé (vouivre). */
export function clipsSerpent(rig: Rig, r: ReglageAnim = {}): void {
  const A = r.allonge ?? 1;
  const onde = (amp: number, dec: number): Piste[] => [
    ...si(rig, 'anneau1', p('anneau1', 'rot', [[0, -amp], [0.5, amp], [1, -amp]])),
    ...si(rig, 'anneau2', p('anneau2', 'rot', [[0 + dec, amp], [0.5, -amp], [1, amp]])),
    ...si(rig, 'anneau3', p('anneau3', 'rot', [[0, -amp * 1.2], [0.5, amp * 1.2], [1, -amp * 1.2]])),
    ...si(rig, 'queue', p('queue', 'rot', [[0, amp * 1.5], [0.5, -amp * 1.5], [1, amp * 1.5]])),
  ];

  const attente = clip(3.2, true, [
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.5, -2.4], [1, 0]])),
    ...onde(0.06, 0.12),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.4, -0.05], [1, 0]])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.28, 0.05], [0.68, -0.04], [1, 0]])),
    ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [0.5, -0.12], [1, 0]])),
    ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [0.5, 0.12], [1, 0]])),
  ]);

  const marche = clip(0.78, true, [
    ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, -0.28], [0.44, 0.62], [1, -0.28]])),
    ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0.28], [0.44, -0.62], [1, 0.28]])),
    ...si(rig, 'corps', p('corps', 'y', [[0, 2.6], [0.46, -3], [1, 2.6]])),
    ...onde(0.14, 0.15),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0.05], [0.5, -0.05], [1, 0.05]])),
  ]);

  const attaque = clip(0.76, false, [
    ...si(rig, 'corps', p('corps', 'x', [[0, 0], [0.3, -8 * A, 'sortie'], [0.5, 15 * A, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.3, -0.4, 'sortie'], [0.48, 0.52, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.3, -0.3], [0.48, 0.42, 'choc'], [1, 0]])),
    ...si(rig, 'machoire', p('machoire', 'rot', [[0, 0], [0.32, 0.55], [0.52, 0, 'choc'], [1, 0]])),
    ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [0.3, -0.7], [0.52, 0.35], [1, 0]])),
    ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [0.3, 0.7], [0.52, -0.35], [1, 0]])),
    ...onde(0.2, 0.1),
  ]);

  const impact = clip(
    0.46,
    false,
    [
      ...si(rig, 'corps', p('corps', 'x', [[0, 0], [0.16, -6, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.16, 0.34, 'choc'], [1, 0, 'elastique']])),
      ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.16, 0.28, 'choc'], [1, 0, 'elastique']])),
      ...onde(0.18, 0.08),
    ],
    { secousse: 3.6 },
  );

  const riposte = clip(0.52, false, [
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.22, -0.3, 'sortie'], [0.4, 0.44, 'choc'], [1, 0, 'doux']])),
    ...si(rig, 'machoire', p('machoire', 'rot', [[0, 0], [0.24, 0.5], [0.44, 0], [1, 0]])),
  ]);

  const defense = clip(1, false, [
    ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [0.24, 0.9, 'sortie'], [0.76, 0.88], [1, 0, 'doux']])),
    ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [0.24, -0.9, 'sortie'], [0.76, -0.88], [1, 0, 'doux']])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.24, 0.4], [0.76, 0.38], [1, 0]])),
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.24, 3], [0.76, 3], [1, 0]])),
  ]);

  const mort = clip(1.2, false, [
    ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.2, -4], [1, 16, 'accelere']])),
    ...si(rig, 'corps', p('corps', 'rot', [[0, 0], [1, 0.3, 'accelere']])),
    ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [1, 0.9, 'accelere']])),
    ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [1, 0.8, 'accelere']])),
    ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [1, 1.2, 'accelere']])),
    ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [1, -1.15, 'accelere']])),
    ...si(rig, 'anneau1', p('anneau1', 'rot', [[0, 0], [1, 0.4, 'accelere']])),
    ...si(rig, 'anneau2', p('anneau2', 'rot', [[0, 0], [1, -0.45, 'accelere']])),
    ...si(rig, 'queue', p('queue', 'rot', [[0, 0], [1, 0.6, 'accelere']])),
  ]);

  poser7(rig, { attente, marche, attaque, impact, riposte, defense, mort });
}

/**
 * Ajoute l'animation de capacité, différente selon la nature de la créature.
 * `levee` = les bras montent, `souffle` = la tête inspire puis expulse,
 * `hurlement` = tête haute, `jet` = lancer à deux mains, `benediction` = geste
 * lent d'ouverture.
 */
export function clipCapacite(
  rig: Rig,
  genre: 'levee' | 'souffle' | 'hurlement' | 'jet' | 'benediction' | 'guet',
): void {
  let c: Clip;
  switch (genre) {
    case 'levee':
      c = clip(1.05, false, [
        ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.4, -1.5, 'sortie'], [0.72, -1.4], [1, 0, 'doux']])),
        ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.4, 1.4, 'sortie'], [0.72, 1.3], [1, 0, 'doux']])),
        ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.4, -0.2], [0.72, -0.18], [1, 0]])),
        ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.4, -0.1], [0.72, -0.08], [1, 0]])),
      ]);
      break;
    case 'souffle':
      c = clip(1.15, false, [
        ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.28, -0.42, 'sortie'], [0.5, 0.3, 'choc'], [0.86, 0.26], [1, 0, 'doux']])),
        ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.28, -0.34], [0.5, 0.26, 'choc'], [1, 0]])),
        ...si(rig, 'machoire', p('machoire', 'rot', [[0, 0], [0.3, 0.16], [0.5, 0.7, 'choc'], [0.86, 0.62], [1, 0]])),
        ...si(rig, 'corps', p('corps', 'sx', [[0, 1], [0.28, 1.06], [0.55, 0.96], [1, 1]])),
        ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [0.3, -0.5], [0.6, 0.2], [1, 0]])),
        ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [0.3, 0.5], [0.6, -0.2], [1, 0]])),
      ]);
      break;
    case 'hurlement':
      c = clip(1.2, false, [
        ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.3, -0.5, 'sortie'], [0.78, -0.46], [1, 0, 'doux']])),
        ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.3, -0.34], [0.78, -0.3], [1, 0]])),
        ...si(rig, 'machoire', p('machoire', 'rot', [[0, 0], [0.32, 0.6], [0.78, 0.54], [1, 0]])),
        ...si(rig, 'corps', p('corps', 'y', [[0, 0], [0.3, -2], [0.78, -1.6], [1, 0]])),
        ...si(rig, 'queue', p('queue', 'rot', [[0, 0], [0.3, -0.2], [0.78, -0.16], [1, 0]])),
      ]);
      break;
    case 'jet':
      c = clip(1.1, false, [
        ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.34, -1.9, 'sortie'], [0.56, 0.7, 'choc'], [1, 0, 'doux']])),
        ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.34, 1.7, 'sortie'], [0.56, -0.5, 'choc'], [1, 0, 'doux']])),
        ...si(rig, 'torse', p('torse', 'rot', [[0, 0], [0.34, -0.3], [0.56, 0.34, 'choc'], [1, 0]])),
        ...si(rig, 'bassin', p('bassin', 'x', [[0, 0], [0.34, -3], [0.56, 6, 'choc'], [1, 0]])),
      ]);
      break;
    case 'benediction':
      c = clip(1.6, false, [
        ...si(rig, 'bras_g', p('bras_g', 'rot', [[0, 0], [0.34, -1.05, 'doux'], [0.74, -0.95], [1, 0, 'doux']])),
        ...si(rig, 'bras_d', p('bras_d', 'rot', [[0, 0], [0.34, 0.95, 'doux'], [0.74, 0.86], [1, 0, 'doux']])),
        ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.34, -0.24], [0.74, -0.2], [1, 0]])),
        ...si(rig, 'torse', p('torse', 'sy', [[0, 1], [0.4, 1.035], [1, 1]])),
      ]);
      break;
    case 'guet':
    default:
      c = clip(1.4, false, [
        ...si(rig, 'tete', p('tete', 'rot', [[0, 0], [0.22, -0.5, 'sortie'], [0.5, 0.44], [0.78, -0.2], [1, 0, 'doux']])),
        ...si(rig, 'cou', p('cou', 'rot', [[0, 0], [0.22, -0.16], [0.5, 0.14], [1, 0]])),
        ...si(rig, 'aile_g', p('aile_g', 'rot', [[0, 0], [0.3, -0.34], [0.66, 0.1], [1, 0]])),
        ...si(rig, 'aile_d', p('aile_d', 'rot', [[0, 0], [0.3, 0.34], [0.66, -0.1], [1, 0]])),
      ]);
      break;
  }
  rig.definirClip('capacite', c);
}

/* ────────────────────── Ornements de forme améliorée ────────────────────── */

/**
 * Ferrure rivetée : la matière ajoutée qui distingue une forme améliorée d'une
 * forme de base. Jamais un simple changement de teinte (bible §6).
 */
export function ferrure(
  g: Graphics,
  k: Kit,
  poly: Poly,
  o: { couleur?: number; rivets?: number; seed?: number } = {},
): void {
  const c = o.couleur ?? 0x8f99a4;
  poser(g, k, poly, {
    couleur: c,
    matiere: 'metal',
    matiereAlpha: 0.24,
    echelle: 0.45,
    modele: 1,
    speculaire: { x: 0.28, y: 0.24, r: 0.1 },
    seed: o.seed,
  });
  const n = o.rivets ?? 3;
  const b = bounds(poly);
  for (let i = 0; i < n; i += 1) {
    const t = (i + 0.5) / n;
    const x = b.x + b.w * t;
    const y = b.y + b.h * (0.45 + Math.sin(t * 5 + (o.seed ?? 0)) * 0.18);
    const r = Math.max(0.9, Math.min(b.w, b.h) * 0.1);
    g.poly(flat(blob(x, y, r, r * 0.92, { seed: i * 5 + 2, points: 8, wobble: 0.22 }))).fill({
      color: eclaircir(c, 0.35),
      alpha: 0.85,
    });
    g.poly(flat(blob(x - r * 0.22, y - r * 0.22, r * 0.38, r * 0.34, { seed: i * 7 + 4, points: 7, wobble: 0.25 }))).fill({
      color: LIGHT.chaude,
      alpha: 0.5,
    });
  }
}

/** Filet d'or appliqué : broderie, orfroi, damasquinure. */
export function orfevrerie(
  g: Graphics,
  chemin: Poly,
  o: { epaisseur?: number; alpha?: number } = {},
): void {
  if (chemin.length < 2) return;
  g.moveTo(chemin[0].x, chemin[0].y);
  for (let i = 1; i < chemin.length; i += 1) g.lineTo(chemin[i].x, chemin[i].y);
  g.stroke({ color: LIGHT.rim, width: o.epaisseur ?? 1.6, alpha: o.alpha ?? 0.85, cap: 'round', join: 'round' });
  g.moveTo(chemin[0].x, chemin[0].y - 0.6);
  for (let i = 1; i < chemin.length; i += 1) g.lineTo(chemin[i].x, chemin[i].y - 0.6);
  g.stroke({ color: LIGHT.chaude, width: (o.epaisseur ?? 1.6) * 0.4, alpha: (o.alpha ?? 0.85) * 0.6, cap: 'round' });
}

/** Cicatrice ancienne : deux valeurs, jamais un trait rouge vif. */
export function cicatrice(g: Graphics, a: Pt, b: Pt, teint: number, largeur = 1.4): void {
  g.moveTo(a.x, a.y);
  g.quadraticCurveTo((a.x + b.x) / 2 + 1.6, (a.y + b.y) / 2, b.x, b.y);
  g.stroke({ color: ombreBleutee(melanger(teint, 0x6e1f2a, 0.3), 0.5), width: largeur, alpha: 0.6, cap: 'round' });
  g.moveTo(a.x + 0.7, a.y - 0.7);
  g.quadraticCurveTo((a.x + b.x) / 2 + 2.2, (a.y + b.y) / 2 - 0.7, b.x + 0.7, b.y - 0.7);
  g.stroke({ color: faceEclairee(teint, 0.7), width: largeur * 0.45, alpha: 0.42, cap: 'round' });
}

/** Nappe de brume accrochée à une créature (Loup des Brumes, Vouivre). */
export function brumeAccrochee(
  g: Graphics,
  o: { x: number; y: number; w: number; h: number; couleur?: number; seed?: number; densite?: number },
): void {
  const c = o.couleur ?? 0x9fb4c2;
  const rand = prng((o.seed ?? 5) * 17 + 3);
  const n = o.densite ?? 9;
  for (let i = 0; i < n; i += 1) {
    const t = i / n;
    const x = o.x + (rand() - 0.5) * o.w;
    const y = o.y + (rand() - 0.5) * o.h;
    const r = o.w * (0.14 + rand() * 0.26);
    g.poly(flat(blob(x, y, r, r * (0.42 + rand() * 0.3), { seed: i * 13 + 5, points: 14, wobble: 0.3 }))).fill({
      color: i % 3 === 0 ? eclaircir(c, 0.3) : c,
      alpha: 0.1 + (1 - t) * 0.13,
    });
  }
}

/** Halo froid entre deux points (lampe des Sagnes, escarboucle, faille). */
export function lueurFroide(
  g: Graphics,
  x: number,
  y: number,
  r: number,
  couleur: number,
  intensite = 1,
): void {
  for (let i = 4; i >= 1; i -= 1) {
    const k = i / 4;
    g.poly(flat(blob(x, y, r * (0.35 + k * 1.15), r * (0.35 + k * 1.05), { seed: i * 9 + 1, points: 16, wobble: 0.2 }))).fill({
      color: melanger(couleur, LIGHT.chaude, 1 - k),
      alpha: 0.1 * intensite * (1.15 - k),
    });
  }
  g.poly(flat(blob(x, y, r * 0.42, r * 0.38, { seed: 3, points: 10, wobble: 0.18 }))).fill({
    color: eclaircir(couleur, 0.75),
    alpha: 0.85 * intensite,
  });
}

/** Mousse et lichen : la matière de l'Ermitage. */
export function mousse(
  g: Graphics,
  o: { x: number; y: number; w: number; h: number; seed?: number; couleur?: number; densite?: number },
): void {
  const c = o.couleur ?? 0x4a6138;
  const rand = prng((o.seed ?? 9) * 23 + 11);
  const n = o.densite ?? 12;
  for (let i = 0; i < n; i += 1) {
    const x = o.x + (rand() - 0.5) * o.w;
    const y = o.y + (rand() - 0.5) * o.h;
    const r = 1 + rand() * 2.6;
    g.poly(flat(blob(x, y, r, r * (0.5 + rand() * 0.5), { seed: i * 11 + 7, points: 9, wobble: 0.34 }))).fill({
      color: rand() > 0.6 ? eclaircir(c, 0.35) : ombreBleutee(c, 0.4),
      alpha: 0.35 + rand() * 0.35,
    });
  }
}

/* ─────────────────────────── Squelettes types ───────────────────────────── */

/**
 * Dessine un sous-ensemble décalé dans le même `Graphics`, en empilant la
 * transformation du contexte. On reste sur une seule géométrie par pièce :
 * c'est ce qui garde le nombre d'objets d'affichage bas.
 */
export function sous(g: Graphics, x: number, y: number, fn: (h: Graphics) => void): Graphics {
  g.save();
  g.translateTransform(x, y);
  fn(g);
  g.restore();
  return g;
}

export interface VisageOptions {
  regard?: number;
  sourcils?: number;
  barbe?: number;
  barbeCouleur?: number;
  age?: number;
}

export interface BipedeOptions {
  /** hauteur totale au garrot, coiffe comprise */
  H: number;
  teint: number;
  tunique: number;
  tuniqueMat?: MaterialKey;
  jambeCouleur: number;
  brasCouleur?: number;
  chausse?: number | null;
  ceinture?: number | null;
  plastron?: number | null;
  epaules?: number;
  largeur?: number;
  /** voûté (< 0) ou redressé (> 0) */
  posture?: number;
  visage?: VisageOptions | null;
  cheveux?: { couleur: number; longueur?: number; volume?: number } | null;
  coiffe?: (g: Graphics, k: Kit) => void;
  arme?: (g: Graphics, k: Kit) => void;
  armeAncre?: { x?: number; y?: number; rot?: number };
  bouclier?: (g: Graphics, k: Kit) => void;
  bouclierAncre?: { x?: number; y?: number; rot?: number };
  dos?: (g: Graphics, k: Kit) => void;
  surTorse?: (g: Graphics, k: Kit) => void;
  cape?: { couleur: number; w?: number; h?: number } | null;
  robe?: { couleur: number; haut?: number; bas?: number; hauteur?: number } | null;
  mainDroite?: (g: Graphics, k: Kit) => void;
  seed: number;
}

/**
 * Squelette humanoïde complet, conforme aux noms d'articulations attendus par
 * `clipsBipede`. Chaque créature n'a plus qu'à fournir sa coiffe, son arme et
 * ses attributs propres.
 */
export function squeletteBipede(o: BipedeOptions): PieceDef[] {
  const H = o.H;
  const larg = o.largeur ?? 1;
  const post = o.posture ?? 0;
  const hanche = -H * 0.44;
  const epaule = -H * 0.27;
  const bras = o.brasCouleur ?? o.teint;
  const jambeL = H * 0.42;
  const brasL = H * 0.3;
  const rTete = H * 0.086;
  const pieces: PieceDef[] = [];

  pieces.push({
    nom: 'bassin',
    x: 0,
    y: hanche,
    rot: post * -0.06,
    ordreMort: 6,
    dessin: () => {},
  });

  if (o.cape) {
    pieces.push({
      nom: 'cape',
      parent: 'bassin',
      x: 0,
      y: -H * 0.25,
      lumiere: -0.4,
      ambiance: 1.5,
      periode: 4.6,
      ordreMort: 2,
      dessin: (g, k) =>
        cape(g, k, {
          largeur: (o.cape?.w ?? H * 0.34) * larg,
          hauteur: o.cape?.h ?? H * 0.46,
          couleur: o.cape?.couleur ?? k.pal.primaire,
          seed: o.seed + 4,
        }),
    });
  }

  for (const cote of [1, -1] as const) {
    const nom = cote > 0 ? 'jambe_d' : 'jambe_g';
    pieces.push({
      nom,
      parent: 'bassin',
      x: cote * H * 0.052,
      y: -H * 0.01,
      lumiere: cote > 0 ? -0.6 : 0.6,
      ordreMort: cote > 0 ? 1 : 3,
      dessin: (g, k) => {
        membre(
          g,
          k,
          pt(0, 0),
          pt(cote * H * 0.012, jambeL * 0.92),
          H * (cote > 0 ? 0.072 : 0.078),
          {
            couleur: cote > 0 ? assombrir(o.jambeCouleur, 0.14) : o.jambeCouleur,
            matiere: 'tissu',
            matiereAlpha: 0.18,
            echelle: 0.6,
            seed: o.seed + cote,
          },
        );
        if (o.chausse !== null) {
          sous(g, cote * H * 0.014, jambeL * 0.95, (h) =>
            pied(h, k, {
              l: H * 0.11,
              h: H * 0.035,
              couleur: o.chausse ?? assombrir(o.jambeCouleur, 0.3),
              seed: o.seed + cote * 3,
            }),
          );
        } else {
          sous(g, cote * H * 0.014, jambeL * 0.95, (h) =>
            pied(h, k, { l: H * 0.1, h: H * 0.03, couleur: o.teint, seed: o.seed + cote * 3 }),
          );
        }
      },
    });
  }

  if (o.robe) {
    pieces.push({
      nom: 'robe',
      parent: 'bassin',
      x: 0,
      y: -H * 0.08,
      lumiere: 0.1,
      ordreMort: 4,
      dessin: (g, k) =>
        robe(g, k, {
          largeurHaut: (o.robe?.haut ?? H * 0.2) * larg,
          largeurBas: (o.robe?.bas ?? H * 0.34) * larg,
          hauteur: o.robe?.hauteur ?? H * 0.48,
          couleur: o.robe?.couleur ?? o.tunique,
          seed: o.seed + 6,
        }),
    });
  }

  pieces.push({ nom: 'torse', parent: 'bassin', x: 0, y: 0, rot: post * -0.05, ordreMort: 7, dessin: () => {} });

  if (o.dos) {
    pieces.push({
      nom: 'dos',
      parent: 'torse',
      x: H * 0.03,
      y: -H * 0.2,
      lumiere: -0.5,
      ordreMort: 2,
      dessin: (g, k) => o.dos?.(g, k),
    });
  }

  pieces.push({
    nom: 'bras_d',
    parent: 'torse',
    x: H * 0.075 * larg,
    y: epaule,
    rot: 0.1,
    lumiere: -0.8,
    ordreMort: 1,
    dessin: (g, k) => {
      membre(g, k, pt(0, 0), pt(H * 0.02, brasL), H * 0.062, {
        couleur: assombrir(bras, 0.18),
        matiere: o.tuniqueMat ?? 'tissu',
        matiereAlpha: 0.17,
        echelle: 0.55,
        seed: o.seed + 11,
      });
      sous(g, H * 0.024, brasL * 1.02, (h) =>
        main(h, k, { r: H * 0.032, teint: assombrir(o.teint, 0.14), seed: o.seed + 12 }),
      );
      o.mainDroite?.(g, k);
    },
  });

  if (o.bouclier) {
    pieces.push({
      nom: 'bouclier',
      parent: 'bras_d',
      x: o.bouclierAncre?.x ?? H * 0.03,
      y: o.bouclierAncre?.y ?? brasL * 0.86,
      rot: o.bouclierAncre?.rot ?? -0.12,
      lumiere: -0.7,
      ordreMort: 1,
      dessin: (g, k) => o.bouclier?.(g, k),
    });
  }

  pieces.push({
    nom: 'buste',
    parent: 'torse',
    x: 0,
    y: 0,
    ordreMort: 8,
    dessin: (g, k) => {
      torse(g, k, {
        largeur: H * 0.24 * larg,
        hauteur: H * 0.29,
        couleur: o.tunique,
        matiere: o.tuniqueMat ?? 'tissu',
        ceinture: o.ceinture ?? null,
        plastron: o.plastron ?? null,
        epaules: o.epaules ?? 1,
        seed: o.seed + 21,
      });
      o.surTorse?.(g, k);
    },
  });

  pieces.push({
    nom: 'tete',
    parent: 'torse',
    x: -H * 0.006,
    y: epaule - rTete * 1.02,
    lumiere: 0.5,
    ordreMort: 9,
    dessin: (g, k) => {
      // cou
      membre(g, k, pt(0, rTete * 0.5), pt(0, rTete * 1.5), rTete * 0.62, {
        couleur: assombrir(o.teint, 0.24),
        matiere: 'grain',
        matiereAlpha: 0.1,
        modele: 0.8,
        rim: false,
        seed: o.seed + 31,
      });
      if (o.cheveux) {
        chevelure(g, k, {
          r: rTete,
          couleur: o.cheveux.couleur,
          longueur: o.cheveux.longueur ?? 1,
          volume: o.cheveux.volume ?? 1,
          seed: o.seed + 33,
        });
      }
      crane(g, k, { r: rTete, teint: o.teint, seed: o.seed + 35 });
      if (o.visage !== null) visage(g, { r: rTete, teint: o.teint, ...(o.visage ?? {}) });
    },
  });

  if (o.coiffe) {
    pieces.push({
      nom: 'coiffe',
      parent: 'tete',
      x: 0,
      y: 0,
      lumiere: 0.9,
      ordreMort: 10,
      dessin: (g, k) => o.coiffe?.(g, k),
    });
  }

  pieces.push({
    nom: 'bras_g',
    parent: 'torse',
    x: -H * 0.062 * larg,
    y: epaule + H * 0.005,
    rot: -0.08,
    lumiere: 0.8,
    ordreMort: 5,
    dessin: (g, k) => {
      membre(g, k, pt(0, 0), pt(-H * 0.012, brasL), H * 0.066, {
        couleur: bras,
        matiere: o.tuniqueMat ?? 'tissu',
        matiereAlpha: 0.18,
        echelle: 0.55,
        seed: o.seed + 41,
      });
      sous(g, -H * 0.016, brasL * 1.02, (h) =>
        main(h, k, { r: H * 0.034, teint: o.teint, seed: o.seed + 42 }),
      );
    },
  });

  if (o.arme) {
    pieces.push({
      nom: 'arme',
      parent: 'bras_g',
      x: o.armeAncre?.x ?? -H * 0.016,
      y: o.armeAncre?.y ?? brasL * 1.0,
      rot: o.armeAncre?.rot ?? 0,
      lumiere: 0.3,
      ordreMort: 0,
      dessin: (g, k) => o.arme?.(g, k),
    });
  }

  return pieces;
}

export interface QuadrupedeOptions {
  /** hauteur au garrot */
  Hs: number;
  /** longueur du tronc */
  L: number;
  robe: number;
  ventre?: number;
  matiere?: MaterialKey;
  patteCouleur?: number;
  /** dessin du tronc, appelé après la masse par défaut */
  surTronc?: (g: Graphics, k: Kit) => void;
  tete: (g: Graphics, k: Kit) => void;
  machoire?: (g: Graphics, k: Kit) => void;
  machoireAncre?: { x?: number; y?: number };
  cou?: { longueur?: number; largeur?: number; angle?: number };
  queue?: { longueur?: number; epaisseur?: number; courbe?: number; matiere?: MaterialKey } | null;
  dos?: (g: Graphics, k: Kit) => void;
  seed: number;
}

/** Squelette quadrupède conforme à `clipsQuadrupede`. La bête regarde vers +x. */
export function squeletteQuadrupede(o: QuadrupedeOptions): PieceDef[] {
  const Hs = o.Hs;
  const L = o.L;
  const patte = o.patteCouleur ?? assombrir(o.robe, 0.2);
  const mat = o.matiere ?? 'fourrure';
  const couL = o.cou?.longueur ?? Hs * 0.34;
  const couA = o.cou?.angle ?? -1.15;
  const pieces: PieceDef[] = [];

  pieces.push({ nom: 'corps', x: 0, y: -Hs, ordreMort: 7, dessin: () => {} });

  const jambe = (nom: string, x: number, len: number, w: number, cote: number): PieceDef => ({
    nom,
    parent: 'corps',
    x,
    y: Hs * 0.06,
    lumiere: cote > 0 ? -0.6 : 0.6,
    ordreMort: cote > 0 ? 1 : 4,
    dessin: (g, k) => {
      membre(g, k, pt(0, 0), pt(cote * L * 0.02, len), w, {
        couleur: cote > 0 ? assombrir(patte, 0.16) : patte,
        matiere: mat,
        matiereAlpha: 0.22,
        echelle: 0.45,
        seed: o.seed + x,
      });
      sous(g, cote * L * 0.024, len * 0.99, (h) =>
        pied(h, k, { l: Hs * 0.16, h: Hs * 0.05, couleur: assombrir(patte, 0.34), seed: o.seed + len }),
      );
    },
  });

  pieces.push(jambe('patte_ad', L * 0.3, Hs * 0.92, Hs * 0.14, 1));
  pieces.push(jambe('patte_pd', -L * 0.3, Hs * 0.9, Hs * 0.16, 1));

  if (o.queue !== null) {
    pieces.push({
      nom: 'queue',
      parent: 'corps',
      x: -L * 0.46,
      y: -Hs * 0.14,
      rot: 2.5,
      lumiere: -0.3,
      ambiance: 1.6,
      periode: 3.8,
      ordreMort: 2,
      dessin: (g, k) =>
        queue(g, k, {
          longueur: o.queue?.longueur ?? L * 0.5,
          epaisseur: o.queue?.epaisseur ?? Hs * 0.16,
          couleur: o.robe,
          courbe: o.queue?.courbe ?? 0.5,
          matiere: o.queue?.matiere ?? mat,
          seed: o.seed + 3,
        }),
    });
  }

  pieces.push({
    nom: 'tronc',
    parent: 'corps',
    x: 0,
    y: 0,
    ordreMort: 8,
    dessin: (g, k) => {
      const corps: Poly = lisser(
        perturber(
          densifier(
            [
              pt(-L * 0.5, -Hs * 0.1),
              pt(-L * 0.3, -Hs * 0.34),
              pt(0, -Hs * 0.4),
              pt(L * 0.32, -Hs * 0.36),
              pt(L * 0.5, -Hs * 0.12),
              pt(L * 0.44, Hs * 0.16),
              pt(L * 0.1, Hs * 0.26),
              pt(-L * 0.28, Hs * 0.22),
              pt(-L * 0.48, Hs * 0.06),
            ],
            Hs * 0.16,
          ),
          Hs * 0.012,
          o.seed + 51,
        ),
        1,
      );
      poser(g, k, corps, {
        couleur: o.robe,
        matiere: mat,
        matiereAlpha: 0.24,
        echelle: 0.42,
        modele: 1,
        seed: o.seed,
      });
      if (o.ventre != null) {
        const v = lisser(
          perturber(
            densifier([pt(-L * 0.36, Hs * 0.06), pt(L * 0.3, Hs * 0.04), pt(L * 0.2, Hs * 0.24), pt(-L * 0.24, Hs * 0.2)], Hs * 0.16),
            Hs * 0.01,
            o.seed + 53,
          ),
          1,
        );
        poser(g, k, v, {
          couleur: o.ventre,
          matiere: mat,
          matiereAlpha: 0.2,
          echelle: 0.45,
          modele: 0.7,
          rim: false,
          seed: o.seed + 2,
        });
      }
      o.surTronc?.(g, k);
    },
  });

  if (o.dos) {
    pieces.push({
      nom: 'dos',
      parent: 'corps',
      x: 0,
      y: -Hs * 0.34,
      lumiere: 0.6,
      ordreMort: 9,
      dessin: (g, k) => o.dos?.(g, k),
    });
  }

  pieces.push({
    nom: 'cou',
    parent: 'corps',
    x: L * 0.36,
    y: -Hs * 0.24,
    rot: couA,
    lumiere: 0.4,
    ordreMort: 6,
    dessin: (g, k) => {
      membre(g, k, pt(0, 0), pt(0, -couL), o.cou?.largeur ?? Hs * 0.26, {
        couleur: o.robe,
        matiere: mat,
        matiereAlpha: 0.22,
        echelle: 0.45,
        taper: 0.32,
        seed: o.seed + 61,
      });
    },
  });

  pieces.push({
    nom: 'tete',
    parent: 'cou',
    x: 0,
    y: -couL * 0.94,
    lumiere: 0.6,
    ordreMort: 10,
    dessin: (g, k) => o.tete(g, k),
  });

  if (o.machoire) {
    pieces.push({
      nom: 'machoire',
      parent: 'tete',
      x: o.machoireAncre?.x ?? 0,
      y: o.machoireAncre?.y ?? 0,
      lumiere: -0.2,
      ordreMort: 10,
      dessin: (g, k) => o.machoire?.(g, k),
    });
  }

  pieces.push(jambe('patte_ag', L * 0.26, Hs * 0.94, Hs * 0.15, -1));
  pieces.push(jambe('patte_pg', -L * 0.34, Hs * 0.92, Hs * 0.17, -1));

  return pieces;
}

export interface VolantOptions {
  /** hauteur de vol du corps au-dessus du sol */
  altitude: number;
  corpsL: number;
  corpsH: number;
  robe: number;
  ventre?: number;
  matiere?: MaterialKey;
  aile: { envergure: number; corde: number; couleur: number; plume?: boolean; doigts?: number };
  tete: (g: Graphics, k: Kit) => void;
  machoire?: (g: Graphics, k: Kit) => void;
  cou?: { longueur?: number; largeur?: number; angle?: number };
  queue?: (g: Graphics, k: Kit) => void;
  serres?: (g: Graphics, k: Kit) => void;
  surTronc?: (g: Graphics, k: Kit) => void;
  seed: number;
}

/** Squelette volant conforme à `clipsVolant`. */
export function squeletteVolant(o: VolantOptions): PieceDef[] {
  const A = o.altitude;
  const L = o.corpsL;
  const Hc = o.corpsH;
  const mat = o.matiere ?? 'plumes';
  const couL = o.cou?.longueur ?? Hc * 0.5;
  const pieces: PieceDef[] = [];

  pieces.push({ nom: 'corps', x: 0, y: -A, ordreMort: 7, dessin: () => {} });

  pieces.push({
    nom: 'aile_d',
    parent: 'corps',
    x: L * 0.02,
    y: -Hc * 0.24,
    rot: 0.22,
    lumiere: -0.7,
    ordreMort: 2,
    dessin: (g, k) =>
      aile(g, k, {
        envergure: o.aile.envergure * 0.92,
        corde: o.aile.corde * 0.94,
        couleur: assombrir(o.aile.couleur, 0.2),
        plume: o.aile.plume,
        doigts: o.aile.doigts,
        sens: -1,
        seed: o.seed + 7,
      }),
  });

  if (o.queue) {
    pieces.push({
      nom: 'queue',
      parent: 'corps',
      x: -L * 0.42,
      y: Hc * 0.02,
      lumiere: -0.2,
      ambiance: 1.4,
      periode: 3.2,
      ordreMort: 3,
      dessin: (g, k) => o.queue?.(g, k),
    });
  }

  pieces.push({
    nom: 'tronc',
    parent: 'corps',
    x: 0,
    y: 0,
    ordreMort: 8,
    dessin: (g, k) => {
      const corps: Poly = lisser(
        perturber(
          densifier(
            [
              pt(-L * 0.5, -Hc * 0.06),
              pt(-L * 0.26, -Hc * 0.42),
              pt(L * 0.12, -Hc * 0.48),
              pt(L * 0.46, -Hc * 0.2),
              pt(L * 0.48, Hc * 0.14),
              pt(L * 0.1, Hc * 0.44),
              pt(-L * 0.26, Hc * 0.36),
              pt(-L * 0.48, Hc * 0.14),
            ],
            Hc * 0.18,
          ),
          Hc * 0.014,
          o.seed + 71,
        ),
        1,
      );
      poser(g, k, corps, {
        couleur: o.robe,
        matiere: mat,
        matiereAlpha: 0.24,
        echelle: 0.5,
        modele: 1,
        seed: o.seed,
      });
      if (o.ventre != null) {
        poser(
          g,
          k,
          lisser(perturber(densifier([pt(-L * 0.3, Hc * 0.02), pt(L * 0.3, -Hc * 0.06), pt(L * 0.16, Hc * 0.4), pt(-L * 0.2, Hc * 0.32)], Hc * 0.16), Hc * 0.01, o.seed + 73), 1),
          {
            couleur: o.ventre,
            matiere: mat,
            matiereAlpha: 0.2,
            echelle: 0.5,
            modele: 0.7,
            rim: false,
            seed: o.seed + 2,
          },
        );
      }
      o.surTronc?.(g, k);
    },
  });

  if (o.serres) {
    for (const cote of [1, -1] as const) {
      pieces.push({
        nom: cote > 0 ? 'serre_d' : 'serre_g',
        parent: 'corps',
        x: L * (cote > 0 ? 0.1 : 0.2),
        y: Hc * 0.3,
        rot: cote > 0 ? 0.12 : -0.08,
        lumiere: cote > 0 ? -0.4 : 0.4,
        ordreMort: 1,
        dessin: (g, k) => o.serres?.(g, k),
      });
    }
  }

  pieces.push({
    nom: 'cou',
    parent: 'corps',
    x: L * 0.34,
    y: -Hc * 0.24,
    rot: o.cou?.angle ?? -0.9,
    lumiere: 0.4,
    ordreMort: 6,
    dessin: (g, k) => {
      membre(g, k, pt(0, 0), pt(0, -couL), o.cou?.largeur ?? Hc * 0.34, {
        couleur: o.robe,
        matiere: mat,
        matiereAlpha: 0.22,
        echelle: 0.5,
        taper: 0.3,
        seed: o.seed + 81,
      });
    },
  });

  pieces.push({
    nom: 'tete',
    parent: 'cou',
    x: 0,
    y: -couL * 0.92,
    lumiere: 0.6,
    ordreMort: 10,
    dessin: (g, k) => o.tete(g, k),
  });

  if (o.machoire) {
    pieces.push({
      nom: 'machoire',
      parent: 'tete',
      x: 0,
      y: 0,
      lumiere: -0.2,
      ordreMort: 10,
      dessin: (g, k) => o.machoire?.(g, k),
    });
  }

  pieces.push({
    nom: 'aile_g',
    parent: 'corps',
    x: -L * 0.02,
    y: -Hc * 0.3,
    rot: -0.22,
    lumiere: 0.9,
    ordreMort: 5,
    dessin: (g, k) =>
      aile(g, k, {
        envergure: o.aile.envergure,
        corde: o.aile.corde,
        couleur: o.aile.couleur,
        plume: o.aile.plume,
        doigts: o.aile.doigts,
        sens: -1,
        seed: o.seed + 9,
      }),
  });

  return pieces;
}

export { rimDoree, translater, pivoter };
