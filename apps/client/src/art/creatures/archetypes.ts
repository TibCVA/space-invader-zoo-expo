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
  ANGLE_LUMIERE,
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

/**
 * Traits du visage : yeux, sourcils, nez, bouche. Jamais de contour noir.
 *
 * **Ce que l'ancien visage coûtait, mesuré sur la planche de contact.** Un
 * humain du jeu fait dans les quatre-vingts pixels de haut ; sa tête en fait
 * seize. Les yeux étaient posés à 0,20 × 0,13 rayon, soit un pixel six sur un
 * pixel : à l'écran il ne restait RIEN. Chaque humain de la planche était donc
 * un ovale de chair vide sous un chapeau — manants, gabelous, arbalétriers,
 * brodeuses, tous le même œuf. Le regard est ce qui distingue un homme d'un
 * mannequin, et il ne survit à la réduction que s'il est franchement contrasté.
 *
 * On tient donc trois valeurs plutôt que des détails : le creux orbital (une
 * bande d'ombre sous le front, qui installe le volume), la prunelle (le seul
 * point vraiment sombre autorisé sur la peau) et l'étincelle au nord-ouest. Le
 * sourcil est une barre, pas un cheveu : à seize pixels, un trait de 0,1 rayon
 * disparaît quand une barre de 0,17 tient encore.
 */
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
  const oeil = assombrir(o.teint, 0.92);
  const yy = -r * 0.2;
  // creux orbital : sans cette bande d'ombre, deux points clairs sur une joue
  // claire ne font pas un regard mais deux salissures.
  g.poly(flat(blob(0, yy - r * 0.04, r * 0.64, r * 0.26, { seed: 17, points: 15, wobble: 0.16 }))).fill({
    color: ombreBleutee(o.teint, 0.6),
    alpha: 0.32,
  });
  for (const s of [-1, 1]) {
    const ox = s * r * 0.37;
    g.poly(flat(blob(ox, yy, r * 0.27, r * 0.185, { seed: 21 + s, points: 11, wobble: 0.16 }))).fill({
      color: melanger(0xf0e6cc, o.teint, 0.32),
      alpha: 0.9,
    });
    g.poly(
      flat(blob(ox + s * r * 0.05, yy + r * 0.015, r * 0.15, r * 0.15, { seed: 31 + s, points: 10, wobble: 0.16 })),
    ).fill({ color: oeil, alpha: 0.94 });
    g.poly(
      flat(blob(ox - s * r * 0.02, yy - r * 0.06, r * 0.045, r * 0.04, { seed: 37 + s, points: 7, wobble: 0.3 })),
    ).fill({ color: LIGHT.chaude, alpha: 0.7 });
    // sourcil : une barre, la seule épaisseur qui survive à la réduction
    g.moveTo(ox - s * r * 0.3, yy - r * (0.34 + (o.sourcils ?? 0) * 0.1));
    g.quadraticCurveTo(
      ox,
      yy - r * (0.46 + (o.sourcils ?? 0) * 0.14),
      ox + s * r * 0.27,
      yy - r * (0.32 + (o.sourcils ?? 0) * 0.06),
    );
    g.stroke({ color: assombrir(o.teint, 0.7), width: r * 0.17, alpha: 0.8, cap: 'round' });
  }
  // nez : une arête de valeur côté ombre, plus une narine
  g.moveTo(r * 0.05, yy + r * 0.04);
  g.quadraticCurveTo(r * 0.2, yy + r * 0.3, r * 0.02, yy + r * 0.44);
  g.stroke({ color: assombrir(o.teint, 0.5), width: r * 0.1, alpha: 0.7, cap: 'round' });
  // bouche
  g.moveTo(-r * 0.24, yy + r * 0.62);
  g.quadraticCurveTo(0, yy + r * (0.72 + (o.regard ?? 0) * 0.06), r * 0.24, yy + r * 0.6);
  g.stroke({ color: assombrir(melanger(o.teint, 0x6e1f2a, 0.4), 0.4), width: r * 0.11, alpha: 0.76, cap: 'round' });
  if (o.age && o.age > 0.5) {
    for (let i = 0; i < 2; i += 1) {
      g.moveTo(-r * 0.72, yy - r * (0.5 + i * 0.16));
      g.quadraticCurveTo(0, yy - r * (0.62 + i * 0.16), r * 0.72, yy - r * (0.5 + i * 0.16));
      g.stroke({ color: assombrir(o.teint, 0.3), width: r * 0.05, alpha: 0.3 });
    }
  }
  if (o.barbe && o.barbe > 0) {
    /*
     * La barbe : un collier qui suit la mâchoire, et non un rectangle sur la
     * bouche.
     *
     * L'ancienne était un blob centré à 0,52 rayon, aussi large que haut,
     * peint en dégradé clair : sur le Pèlerin de l'Ermitage, dont la barbe est
     * grise, cela donnait à l'écran une BANDE BLANCHE en travers du bas du
     * visage — un bâillon, littéralement, et c'est ce qu'on voyait sur la
     * planche de contact avant de voir un vieil homme. Une barbe se lit à son
     * contour : large aux oreilles, pointue au menton, et fendue d'une
     * moustache. Trois points, et le bâillon devient un visage.
     */
    const c = o.barbeCouleur ?? assombrir(o.teint, 0.55);
    const L = o.barbe;
    const b = lisser(
      perturber(
        densifier(
          [
            pt(-r * 0.8, r * 0.02),
            pt(-r * 0.62, r * (0.6 + L * 0.34)),
            pt(0, r * (0.9 + L * 0.7)),
            pt(r * 0.6, r * (0.58 + L * 0.32)),
            pt(r * 0.78, r * 0.0),
            pt(r * 0.42, r * 0.34),
            pt(0, r * 0.24),
            pt(-r * 0.44, r * 0.36),
          ],
          r * 0.24,
        ),
        r * 0.035,
        44,
      ),
      1,
    );
    g.poly(flat(b)).fill({
      fill: degradeLineaire(
        [
          { offset: 0, color: eclaircir(c, 0.22) },
          { offset: 1, color: ombreBleutee(c, 0.6) },
        ],
        ANGLE_LUMIERE,
      ),
      alpha: 0.94,
    });
    lisereLumiere(g, b, c, { force: 0.5, largeur: 1.1 });
    // moustache : deux coups de part et d'autre du philtrum
    for (const s of [-1, 1]) {
      g.moveTo(s * r * 0.06, yy + r * 0.5);
      g.quadraticCurveTo(s * r * 0.3, yy + r * 0.52, s * r * 0.44, yy + r * 0.42);
      g.stroke({ color: ombreBleutee(c, 0.4), width: r * 0.16, alpha: 0.9, cap: 'round' });
    }
    // deux mèches sous le menton : la barbe finit en pointe, pas en bloc
    for (const s of [-1, 1]) {
      g.moveTo(s * r * 0.16, r * 0.6);
      g.quadraticCurveTo(s * r * 0.1, r * (0.82 + L * 0.4), s * r * 0.02, r * (0.92 + L * 0.68));
      g.stroke({ color: s > 0 ? ombreBleutee(c, 0.7) : eclaircir(c, 0.3), width: r * 0.09, alpha: 0.6, cap: 'round' });
    }
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

/**
 * Capuche : un anneau d'étoffe qui ENCADRE le visage, et non un couvercle.
 *
 * **Ce que la capuche pleine coûtait.** Elle était peinte comme une masse
 * pleine, puis on posait par-dessus un ovale d'ombre bleue à 72 % d'opacité «
 * pour que le visage soit en retrait ». Le visage n'était pas en retrait : il
 * était effacé. Sur la planche de contact, le Pèlerin et les deux veneurs de
 * l'Ermitage étaient trois taches sombres à hauteur de tête, sans un œil, sans
 * une barbe — et les rendus de référence montrent au contraire un homme dont on
 * lit l'âge sous le capuchon.
 *
 * On construit donc la capuche comme `arcBande` construit une corne : un
 * contour extérieur qui passe par-dessus le crâne d'une joue à l'autre, puis un
 * contour intérieur qui redescend en encadrant le front. Le polygone est un C
 * ouvert vers le bas : ce qui est dans l'ouverture n'est pas peint, donc le
 * visage traverse. `ouverture` règle la largeur de cet encadrement — plus elle
 * est grande, plus on voit de figure.
 */
export function capuche(
  g: Graphics,
  k: Kit,
  o: { r: number; couleur: number; pointe?: number; seed?: number; ouverture?: number },
): void {
  const r = o.r;
  const pointe = o.pointe ?? 0.6;
  const seed = o.seed ?? 4;
  /* Le bord de l'ouverture : il doit passer AU-DESSUS des sourcils, qui vivent
     à −0,56 rayon. On le tient à −0,98 : trois pixels de marge à l'échelle où
     la créature est réellement affichée, et pas un de moins. */
  const w = r * (0.66 + (o.ouverture ?? 0.52) * 0.42);
  const exterieur: Poly = [
    pt(-r * 1.22, r * 0.94),
    pt(-r * 1.16, -r * 0.36),
    pt(-r * 0.66, -r * (1.2 + pointe * 0.8)),
    pt(r * 0.05, -r * (1.46 + pointe * 1.15)),
    pt(r * 0.64, -r * (1.02 + pointe * 0.5)),
    pt(r * 1.18, -r * 0.2),
    pt(r * 1.26, r * 0.98),
  ];
  const interieur: Poly = [
    pt(w * 1.02, r * 0.9),
    pt(w * 0.98, -r * 0.3),
    pt(w * 0.54, -r * 0.94),
    pt(-w * 0.5, -r * 0.98),
    pt(-w * 0.96, -r * 0.26),
    pt(-w, r * 0.86),
  ];
  const forme: Poly = lisser(
    perturber(densifier([...exterieur, ...interieur], r * 0.3), r * 0.035, seed + 13),
    1,
  );
  poser(g, k, forme, {
    couleur: o.couleur,
    matiere: 'tissu',
    matiereAlpha: 0.2,
    echelle: 0.6,
    modele: 1,
    seed,
  });
  /* L'intérieur du capuchon : une ombre étroite le long du bord de
     l'ouverture, là où l'étoffe passe derrière la tempe. C'est ce qui donne la
     profondeur que l'ovale plein prétendait donner, sans manger la figure. */
  g.moveTo(-w * 0.92, r * 0.5);
  g.quadraticCurveTo(-w * 0.9, -r * 0.86, 0, -r * 0.98);
  g.quadraticCurveTo(w * 0.9, -r * 0.84, w * 0.94, r * 0.54);
  g.stroke({ color: ombreBleutee(o.couleur, 1), width: r * 0.2, alpha: 0.6, cap: 'round' });
  // arête de l'étoffe sur le dessus : le pli qui court du front à la pointe
  g.moveTo(r * 0.04, -r * (1.4 + pointe * 1.05));
  g.quadraticCurveTo(-r * 0.4, -r * 0.9, -r * 1.06, -r * 0.1);
  g.stroke({ color: faceEclairee(o.couleur, 0.6), width: r * 0.11, alpha: 0.42, cap: 'round' });
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

/**
 * Jupe, robe, bure : masse conique tombante. `dents` déchire l'ourlet du bas —
 * c'est la bure du pèlerin et le lin mangé du pénitent, dont les rendus de
 * référence montrent l'ourlet parti en langues jusqu'au mollet.
 */
export function robe(
  g: Graphics,
  k: Kit,
  o: {
    largeurHaut: number;
    largeurBas: number;
    hauteur: number;
    couleur: number;
    seed?: number;
    plis?: number;
    dents?: number;
  },
): void {
  const wh = o.largeurHaut;
  const wb = o.largeurBas;
  const h = o.hauteur;
  const dents = o.dents ?? 0;
  const base: Poly = [pt(-wh * 0.5, 0), pt(wh * 0.5, 0), pt(wb * 0.52, h * 0.72), pt(wb * 0.56, h)];
  const ourlet: Poly = [];
  const n = dents > 0 ? 11 : 7;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const creux = dents > 0 && i % 2 === 1 ? h * 0.2 * dents : 0;
    ourlet.push(
      pt(wb * (0.56 - t * 1.12), h + Math.sin(t * Math.PI * 3 + (o.seed ?? 0)) * h * 0.035 - creux),
    );
  }
  const forme = lisser(
    perturber(
      densifier([...base, ...ourlet, pt(-wb * 0.52, h * 0.72)], h * 0.16),
      wh * 0.014,
      (o.seed ?? 8) + 11,
    ),
    dents > 0 ? 0 : 1,
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

/**
 * Cape ou manteau flottant, accroché aux épaules.
 *
 * `dents` déchire l'ourlet en pointes — c'est le manteau du manant, la cape
 * mangée aux mites du pèlerin, le caparaçon en loques du chevalier ; `bord` le
 * galonne, et c'est le grand manteau du prévôt du sel. Les rendus de référence
 * n'ont pas une seule cape à ourlet net : ou elle est en lambeaux, ou elle est
 * bordée.
 */
export function cape(
  g: Graphics,
  k: Kit,
  o: {
    largeur: number;
    hauteur: number;
    couleur: number;
    seed?: number;
    vol?: number;
    dents?: number;
    bord?: number | null;
  },
): void {
  const w = o.largeur;
  const h = o.hauteur;
  const v = o.vol ?? 1;
  const dents = o.dents ?? 0;
  /* L'ourlet : sept festons entre les deux pointes basses. Les creux montent de
     `dents` × 0,3 hauteur, ce qui suffit à faire une guenille et pas une frange
     décorative. */
  const ourlet: Poly = [];
  const n = 7;
  for (let i = 0; i <= n; i += 1) {
    const t = i / n;
    const x = w * (0.5 - t * 1.06);
    const creux = dents > 0 && i % 2 === 1 ? h * 0.3 * dents : 0;
    ourlet.push(pt(x, h * (0.9 + Math.sin(t * 4.4 + (o.seed ?? 0)) * 0.09) - creux));
  }
  const forme = lisser(
    perturber(
      densifier(
        [
          pt(-w * 0.46, 0),
          pt(w * 0.46, 0),
          pt(w * (0.58 + v * 0.12), h * 0.52),
          ...ourlet,
          pt(-w * (0.56 + v * 0.1), h * 0.6),
        ],
        h * 0.16,
      ),
      w * 0.016,
      (o.seed ?? 9) + 19,
    ),
    dents > 0 ? 0 : 1,
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
  if (o.bord != null) {
    /* Le galon court sur l'ourlet ET sur les deux bords d'ouverture. Sans les
       verticales, un manteau large se lit comme une plaque : c'est ce que le
       prévôt du sel rendait à l'écran — une ardoise posée derrière lui. Les deux
       montants disent que l'étoffe s'OUVRE, et le rendu de référence les montre
       galonnés sur toute leur longueur. */
    orfevrerie(g, ourlet, { epaisseur: Math.max(1.2, h * 0.035), couleur: o.bord, alpha: 0.8 });
    for (const s of [-1, 1] as const) {
      orfevrerie(
        g,
        [pt(s * w * 0.2, h * 0.02), pt(s * w * 0.3, h * 0.5), pt(s * w * 0.34, h * 0.88)],
        { epaisseur: Math.max(1, h * 0.03), couleur: o.bord, alpha: 0.7 },
      );
    }
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
/**
 * L'aile emplumée : un éventail de rémiges, et non une palette festonnée.
 *
 * **Ce qu'elle remplace, et pourquoi.** L'aile à plumes était une seule masse
 * pleine sur laquelle on posait six fuseaux courts. Rendu à l'écran, cela ne
 * fait pas une aile : cela fait une palette, un coquillage segmenté — c'est
 * exactement le mot qui vient devant les griffons de Pamole et les chouettes de
 * l'Ermitage sur la planche de contact, et les rendus de référence disent tout
 * autre chose. Chez eux, l'aile est un ÉVENTAIL : des rémiges longues,
 * nettement séparées, qui partent toutes du poignet et s'ouvrent de la verticale
 * à l'horizontale, chacune se lisant comme une plume distincte.
 *
 * On construit donc dans cet ordre : les couvertures — la masse courte près du
 * corps, qui cache les bases —, puis les secondaires, puis les primaires en
 * éventail depuis le poignet. Les extrémités reçoivent le liseré chaud : c'est
 * ce qui donne au griffon son or et à la chouette sa lumière de bord d'aile.
 *
 * Les plumes sont peintes de l'intérieur vers l'extérieur pour que le
 * recouvrement aille dans le bon sens, comme sur un oiseau qui plane.
 */
function ailePlumee(
  g: Graphics,
  k: Kit,
  o: { E: number; C: number; s: 1 | -1; couleur: number; seed: number },
): void {
  const { E, C, s, couleur, seed } = o;
  /** Le poignet : d'où part l'éventail. */
  const px = s * E * 0.4;
  const py = -C * 0.04;

  /* Les couvertures : masse courte et arrondie, du corps au poignet. */
  const couvertures = lisser(
    perturber(
      densifier(
        [
          pt(0, -C * 0.1),
          pt(s * E * 0.2, -C * 0.2),
          pt(px, py - C * 0.06),
          pt(s * E * 0.44, C * 0.34),
          pt(s * E * 0.2, C * 0.52),
          pt(0, C * 0.3),
        ],
        C * 0.16,
      ),
      C * 0.014,
      seed + 61,
    ),
    1,
  );
  poser(g, k, couvertures, {
    couleur: assombrir(couleur, 0.14),
    matiere: 'plumes',
    matiereAlpha: 0.26,
    echelle: 0.6,
    modele: 1,
    seed,
  });

  /* Les secondaires : un rang court derrière les couvertures. */
  const SECONDAIRES = 5;
  for (let i = 0; i < SECONDAIRES; i += 1) {
    const t = i / (SECONDAIRES - 1);
    const bx = s * E * (0.08 + t * 0.3);
    const by = C * 0.06;
    const tx = bx - s * C * 0.06;
    const ty = C * (0.62 + 0.22 * Math.sin(t * Math.PI));
    poser(g, k, fuseau(bx, by, tx, ty, C * 0.19, { seed: seed + i * 3, taper: 0.46 }), {
      couleur: i % 2 ? assombrir(couleur, 0.24) : assombrir(couleur, 0.06),
      matiere: 'plumes',
      matiereAlpha: 0.22,
      echelle: 0.5,
      modele: 0.85,
      rim: false,
    });
  }

  /*
   * Les primaires. Leurs pointes se posent sur un quart d'ellipse allant du bas
   * (la plus intérieure, presque verticale) au bout de l'aile (la plus
   * extérieure, dans le prolongement de l'envergure) : c'est ce quart
   * d'ellipse, et lui seul, qui fait lire l'éventail.
   */
  const PRIMAIRES = 10;
  for (let i = 0; i < PRIMAIRES; i += 1) {
    const t = i / (PRIMAIRES - 1);
    const a = (Math.PI / 2) * (1 - t);
    const rx = E * 0.66;
    const ry = C * 1.15;
    const tx = px + s * rx * Math.cos(a) * (0.9 + t * 0.24);
    const ty = py + ry * Math.sin(a) - C * 0.1 * t;
    const large = C * (0.2 - t * 0.05);
    poser(g, k, fuseau(px, py, tx, ty, large, { seed: seed + 40 + i * 5, taper: 0.34 }), {
      couleur: i % 2 ? assombrir(couleur, 0.2) : eclaircir(couleur, 0.08),
      matiere: 'plumes',
      matiereAlpha: 0.2,
      echelle: 0.46,
      modele: 0.9,
      /* Le liseré sur les trois dernières : c'est l'or du griffon et la
         lumière de bord d'aile de la chouette. */
      rim: i >= PRIMAIRES - 4,
    });
    /* Le rachis, une nervure claire : sans elle, deux plumes voisines de même
       ton se fondent l'une dans l'autre. */
    g.moveTo(px, py);
    g.lineTo(tx, ty);
    g.stroke({
      color: eclaircir(couleur, 0.34),
      width: C * 0.016,
      alpha: 0.42,
      cap: 'round',
    });
  }
}

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
  if (o.plume) {
    ailePlumee(g, k, { E, C, s, couleur: o.couleur, seed: o.seed ?? 7 });
    return;
  }
  const forme = lisser(perturber([...bordAttaque, ...bordFuite], C * 0.012, (o.seed ?? 7) + 61), 1);
  poser(g, k, forme, {
    couleur: o.couleur,
    matiere: 'ecailles',
    matiereAlpha: 0.24,
    echelle: 0.6,
    modele: 1,
    seed: o.seed,
  });
  {
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

/**
 * Filet appliqué : broderie, orfroi, damasquinure. Or ancien par défaut — la
 * `couleur` ne se change que pour un galon d'argent sur des plates, et le
 * rehaut chaud du dessus reste celui du soleil unique dans tous les cas.
 */
export function orfevrerie(
  g: Graphics,
  chemin: Poly,
  o: { epaisseur?: number; alpha?: number; couleur?: number } = {},
): void {
  if (chemin.length < 2) return;
  g.moveTo(chemin[0].x, chemin[0].y);
  for (let i = 1; i < chemin.length; i += 1) g.lineTo(chemin[i].x, chemin[i].y);
  g.stroke({
    color: o.couleur ?? LIGHT.rim,
    width: o.epaisseur ?? 1.6,
    alpha: o.alpha ?? 0.85,
    cap: 'round',
    join: 'round',
  });
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
  /** Couleur de l'avant-bras : la peau, ou le gantelet. */
  brasCouleur?: number;
  /**
   * Couleur de la MANCHE, qui habille l'humérus. Vaut la tunique par défaut ;
   * `null` laisse le bras nu sur toute sa longueur (pénitent, manant en été).
   */
  manche?: number | null;
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
  cape?: { couleur: number; w?: number; h?: number; dents?: number; bord?: number | null } | null;
  robe?: { couleur: number; haut?: number; bas?: number; hauteur?: number; dents?: number } | null;
  mainDroite?: (g: Graphics, k: Kit) => void;
  /**
   * Écartement des pieds, en multiples de l'écartement de base. 1 = debout au
   * repos, 1,6 = campé sur ses jambes comme tous les rendus de référence.
   */
  ecart?: number;
  /**
   * Flexion du coude, en radians. Positif = l'avant-bras rentre vers le ventre,
   * ce qui est la pose de qui tient une hampe à deux mains.
   */
  coude?: number;
  /** Rotation de repos du bras porteur (gauche) et du bras libre (droit). */
  brasGRot?: number;
  brasDRot?: number;
  /** Épaulement : la masse qui donne une carrure au lieu d'un tuyau. */
  epaulement?: { couleur: number; matiere?: MaterialKey; largeur?: number } | null;
  /**
   * Basque : la jupe courte du vêtement, tombant de la ceinture. `dents` la
   * déchire en pointes (haillons du manant, feuilles du veneur), `bord` la
   * galonne (officiers de la Châtellenie).
   */
  basque?: {
    couleur: number;
    hauteur?: number;
    largeur?: number;
    dents?: number;
    bord?: number | null;
  } | null;
  /** Jambière : la bande molletière ou la tige de botte, au mollet. */
  jambiere?: { couleur: number; hauteur?: number } | null;
  seed: number;
}

/**
 * Rayon de la tête d'un bipède. Les coiffes en dépendent toutes : elles doivent
 * l'obtenir d'ici, jamais le recopier, sinon un chapeau finit par flotter.
 */
export function rayonTete(H: number): number {
  return H * 0.092;
}

/**
 * Squelette humanoïde complet, conforme aux noms d'articulations attendus par
 * `clipsBipede`. Chaque créature n'a plus qu'à fournir sa coiffe, son arme et
 * ses attributs propres.
 *
 * ─── Ce que le squelette précédent coûtait, vu sur la planche de contact ───
 *
 * Le propriétaire l'a nommé exactement : « un chapeau, un tronc, deux jambes
 * fines ». Le diagnostic était juste au pixel près. Le bipède n'avait
 * *aucune* articulation intermédiaire : le bras était UN fuseau du moignon
 * d'épaule jusqu'à la main, la jambe UN fuseau de la hanche jusqu'au pied, et
 * les deux jambes descendaient parallèles à dix pixels l'une de l'autre. Il n'y
 * avait ni épaule (le cou sortait d'une planche), ni coude (la main pendait le
 * long de la cuisse), ni genou, ni écartement. Résultat : dix silhouettes de la
 * Châtellenie et quatre de l'Ermitage indiscernables l'une de l'autre sauf par
 * la couleur du chapeau, et une arme tenue d'une seule main pendante alors que
 * les quatorze rendus de référence montrent, sans exception, un homme CAMPÉ —
 * pieds écartés, genoux marqués, épaules larges, hampe empoignée des deux mains.
 *
 * Ce squelette-ci ajoute donc les quatre articulations qui manquaient, et rien
 * d'autre :
 *
 *  1. **l'épaulement** — une masse d'étoffe ou de plates sur le haut du torse,
 *     qui fait la carrure et sur laquelle le liseré doré a enfin une arête à
 *     mordre ;
 *  2. **le coude** — le bras est peint en deux tronçons, humérus puis
 *     avant-bras, la main au bout du second. `coude` amène l'avant-bras vers le
 *     ventre, ce qui met les deux poings sur la même hampe ;
 *  3. **le genou** — la jambe est peinte en cuisse puis mollet, avec sa rotule ;
 *  4. **l'écartement** — la cuisse part en dehors, le mollet revient à la
 *     verticale, si bien que les pieds s'appuient large. C'est ce qui fait
 *     tenir un homme debout plutôt que flotter.
 *
 * Les noms d'articulations et leur hiérarchie ne changent pas d'un iota : les
 * sept clips de `clipsBipede` continuent de tourner sur `bassin torse tete
 * bras_g bras_d jambe_g jambe_d arme bouclier cape`.
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
  const rTete = rayonTete(H);
  const ecart = o.ecart ?? 1;
  const coude = o.coude ?? 0;
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
          dents: o.cape?.dents,
          bord: o.cape?.bord ?? null,
          seed: o.seed + 4,
        }),
    });
  }

  for (const cote of [1, -1] as const) {
    const nom = cote > 0 ? 'jambe_d' : 'jambe_g';
    /* La cuisse part en dehors, le mollet redescend à la verticale : c'est cette
       cassure au genou qui fait un appui, là où le fuseau unique faisait un
       échasse. Le pied se pose donc large, à `ecart` fois l'écartement de base. */
    const genouY = jambeL * 0.52;
    const genouX = cote * H * 0.038 * ecart;
    const chevilleX = cote * H * 0.052 * ecart;
    pieces.push({
      nom,
      parent: 'bassin',
      x: cote * H * 0.046,
      y: -H * 0.012,
      lumiere: cote > 0 ? -0.6 : 0.6,
      ordreMort: cote > 0 ? 1 : 3,
      dessin: (g, k) => {
        const teinteJambe = cote > 0 ? assombrir(o.jambeCouleur, 0.16) : o.jambeCouleur;
        // cuisse : la partie épaisse, celle qui porte
        membre(g, k, pt(0, -H * 0.01), pt(genouX, genouY), H * (cote > 0 ? 0.088 : 0.095), {
          couleur: teinteJambe,
          matiere: 'tissu',
          matiereAlpha: 0.18,
          echelle: 0.6,
          taper: 0.34,
          seed: o.seed + cote,
        });
        // mollet
        membre(g, k, pt(genouX, genouY - H * 0.01), pt(chevilleX, jambeL * 0.94), H * (cote > 0 ? 0.066 : 0.072), {
          couleur: assombrir(teinteJambe, 0.08),
          matiere: 'tissu',
          matiereAlpha: 0.18,
          echelle: 0.6,
          taper: 0.3,
          seed: o.seed + cote * 7,
        });
        // rotule : deux valeurs suffisent à faire lire l'articulation, et pas
        // plus — trop claire, elle se lit comme une genouillère de plates que
        // ni le manant ni le pèlerin n'ont jamais portée.
        poser(g, k, blob(genouX, genouY, H * 0.033, H * 0.026, { seed: o.seed + cote * 11, points: 12, wobble: 0.22 }), {
          couleur: faceEclairee(teinteJambe, 0.16),
          matiere: 'tissu',
          matiereAlpha: 0.14,
          modele: 0.8,
          rim: false,
        });
        if (o.jambiere) {
          // bande molletière ou tige de botte : le rendu de référence en montre
          // sur les quatorze humains, et c'est ce qui coupe la jambe en deux
          /* Une tige de botte s'ÉVASE vers le haut et se resserre à la cheville.
             Coupée en rectangle, elle rendait un seau : c'est le mot qui venait
             devant les pieds du manant et du garde-futaie sur la capture. */
          const hj = o.jambiere.hauteur ?? H * 0.11;
          const y0 = jambeL * 0.94 - hj;
          poser(
            g,
            k,
            lisser(
              perturber(
                densifier(
                  [
                    pt(chevilleX - H * 0.056, y0),
                    pt(chevilleX + H * 0.054, y0 + H * 0.008),
                    pt(chevilleX + H * 0.036, y0 + hj),
                    pt(chevilleX - H * 0.038, y0 + hj * 0.96),
                  ],
                  hj * 0.4,
                ),
                H * 0.004,
                o.seed + cote * 13,
              ),
              1,
            ),
            {
              couleur: cote > 0 ? assombrir(o.jambiere.couleur, 0.14) : o.jambiere.couleur,
              matiere: 'grain',
              matiereAlpha: 0.2,
              echelle: 0.4,
              seed: o.seed + cote * 17,
            },
          );
          // les tours de la bande, ou les lacets de la botte : discrets, deux
          // suffisent, et ils suivent le rétrécissement de la tige
          for (let i = 0; i < 2; i += 1) {
            const t = 0.28 + i * 0.38;
            const demi = H * (0.05 - t * 0.014);
            const y = y0 + hj * t;
            g.moveTo(chevilleX - demi, y);
            g.lineTo(chevilleX + demi, y + H * 0.005);
            g.stroke({ color: ombreBleutee(o.jambiere.couleur, 0.75), width: H * 0.007, alpha: 0.34 });
          }
        }
        if (o.chausse !== null) {
          sous(g, chevilleX + cote * H * 0.006, jambeL * 0.96, (h) =>
            pied(h, k, {
              l: H * 0.11,
              h: H * 0.036,
              couleur: o.chausse ?? assombrir(o.jambeCouleur, 0.3),
              seed: o.seed + cote * 3,
            }),
          );
        } else {
          sous(g, chevilleX + cote * H * 0.006, jambeL * 0.96, (h) =>
            pied(h, k, { l: H * 0.098, h: H * 0.03, couleur: o.teint, seed: o.seed + cote * 3 }),
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
          dents: o.robe?.dents,
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

  /**
   * Un bras en deux tronçons. `sens` = +1 pour le bras d'ombre (droite à
   * l'écran), −1 pour le bras de lumière. Le coude tombe aux deux tiers du
   * membre, l'avant-bras rentre de `flexion` radians, et la main est au bout du
   * SECOND tronçon — plus le long du corps.
   */
  const humerus = brasL * 0.54;
  const avantBras = brasL - humerus;
  /** Où tombe le poignet, coude fléchi : l'arme et l'écu s'y accrochent. */
  const poignet = (sens: 1 | -1): Pt =>
    pt(
      sens * H * 0.016 - Math.sin(coude) * avantBras * sens,
      humerus + Math.cos(coude) * avantBras + H * 0.008,
    );
  const brasEnDeux = (
    g: Graphics,
    k: Kit,
    sens: 1 | -1,
    couleurBras: number,
    rMain: number,
  ): void => {
    const coudeX = sens * H * 0.016;
    const w = poignet(sens);
    const poignetX = w.x;
    const poignetY = w.y - H * 0.008;
    /* La manche habille l'humérus, la peau ne sort qu'à l'avant-bras. C'est ce
       que montrent les quatorze rendus, et c'est ce qui manquait le plus après
       le coude : deux fuseaux couleur chair, c'était un homme en bras de
       chemise sous une cotte de mailles. */
    const sleeve = o.manche === null ? couleurBras : o.manche ?? o.tunique;
    membre(g, k, pt(0, 0), pt(coudeX, humerus), H * 0.078, {
      couleur: sens > 0 ? assombrir(sleeve, 0.16) : sleeve,
      matiere: o.tuniqueMat ?? 'tissu',
      matiereAlpha: 0.17,
      echelle: 0.55,
      taper: 0.3,
      seed: o.seed + (sens > 0 ? 11 : 41),
    });
    membre(g, k, pt(coudeX, humerus - H * 0.008), pt(poignetX, poignetY), H * 0.056, {
      couleur: couleurBras,
      matiere: 'grain',
      matiereAlpha: 0.12,
      echelle: 0.5,
      taper: 0.26,
      seed: o.seed + (sens > 0 ? 13 : 43),
    });
    /* Le poignet de la manche : un bourrelet d'étoffe au coude, qui marque où
       la manche s'arrête. Sans lui, la peau et l'étoffe se raboutent net. */
    poser(g, k, blob(coudeX, humerus - H * 0.004, H * 0.038, H * 0.026, { seed: o.seed + sens * 5, points: 12, wobble: 0.22 }), {
      couleur: sens > 0 ? assombrir(sleeve, 0.06) : faceEclairee(sleeve, 0.3),
      matiere: o.tuniqueMat ?? 'tissu',
      matiereAlpha: 0.16,
      modele: 0.85,
      rim: sens < 0,
    });
    sous(g, poignetX, poignetY + H * 0.008, (h) =>
      main(h, k, {
        r: rMain,
        teint: sens > 0 ? assombrir(o.teint, 0.14) : o.teint,
        seed: o.seed + (sens > 0 ? 12 : 42),
      }),
    );
  };

  pieces.push({
    nom: 'bras_d',
    parent: 'torse',
    x: H * 0.082 * larg,
    y: epaule + H * 0.008,
    rot: o.brasDRot ?? 0.1,
    lumiere: -0.8,
    ordreMort: 1,
    dessin: (g, k) => {
      brasEnDeux(g, k, 1, assombrir(bras, 0.18), H * 0.034);
      o.mainDroite?.(g, k);
    },
  });

  if (o.bouclier) {
    pieces.push({
      nom: 'bouclier',
      parent: 'bras_d',
      x: o.bouclierAncre?.x ?? poignet(1).x,
      y: o.bouclierAncre?.y ?? poignet(1).y * 0.9,
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
      if (o.basque) {
        /* La basque : elle tombe de la ceinture et casse la verticale du tronc.
           Sur les quatorze rendus de référence, aucun humain n'a le tronc nu
           jusqu'aux cuisses — il y a toujours une jupe de vêtement, déchirée en
           pointes chez les manants et les veneurs, galonnée chez les officiers.
           Sans elle, le torse et les jambes ne font qu'une planche. */
        const bw = (o.basque.largeur ?? H * 0.27) * larg;
        const bh = o.basque.hauteur ?? H * 0.15;
        const dents = o.basque.dents ?? 0;
        const haut: Poly = [pt(-bw * 0.46, -H * 0.03), pt(bw * 0.46, -H * 0.03)];
        const ourlet: Poly = [];
        const n = dents > 0 ? 9 : 6;
        for (let i = 0; i <= n; i += 1) {
          const t = i / n;
          const x = bw * (0.52 - t * 1.04);
          const creux = dents > 0 && i % 2 === 1 ? bh * 0.34 * dents : 0;
          ourlet.push(pt(x, bh - creux + Math.sin(t * 5.1 + o.seed) * bh * 0.06));
        }
        const forme = lisser(
          perturber(densifier([...haut, ...ourlet], bh * 0.36), bw * 0.012, o.seed + 57),
          dents > 0 ? 0 : 1,
        );
        poser(g, k, forme, {
          couleur: o.basque.couleur,
          matiere: o.tuniqueMat ?? 'tissu',
          matiereAlpha: 0.22,
          echelle: 0.7,
          seed: o.seed + 59,
        });
        for (let i = 0; i < 3; i += 1) {
          const x = -bw * 0.26 + i * bw * 0.26;
          g.moveTo(x, H * 0.0);
          g.quadraticCurveTo(x + bw * 0.02, bh * 0.6, x, bh * 0.92);
          g.stroke({ color: ombreBleutee(o.basque.couleur, 0.65), width: bw * 0.022, alpha: 0.4, cap: 'round' });
        }
        if (o.basque.bord != null) {
          /* Sur un ourlet déchiqueté, le galon suit les dents : il faut alors
             qu'il soit MINCE, sinon les pointes d'or se lisent comme une rangée
             de dents dorées — c'est ce que rendait le garde-futaie au premier
             essai. Sur un ourlet net il peut être franc. */
          const dentele = dents > 0;
          orfevrerie(g, ourlet, {
            epaisseur: Math.max(0.9, bh * (dentele ? 0.055 : 0.1)),
            couleur: o.basque.bord,
            alpha: dentele ? 0.6 : 0.85,
          });
        }
      }
      if (o.epaulement) {
        /* L'épaulement : la carrure. Deux masses posées sur le haut du tronc,
           celle de gauche prise dans la lumière, celle de droite dans l'ombre —
           c'est là que le liseré doré trouve enfin une arête à mordre. */
        const ew = (o.epaulement.largeur ?? H * 0.15) * larg;
        for (const cote of [-1, 1] as const) {
          const ep = lisser(
            perturber(
              densifier(
                [
                  pt(cote * H * 0.02, -H * 0.29),
                  pt(cote * (H * 0.05 + ew * 0.5), -H * 0.28),
                  pt(cote * (H * 0.055 + ew * 0.5), -H * 0.21),
                  pt(cote * (H * 0.03 + ew * 0.3), -H * 0.175),
                  pt(cote * H * 0.015, -H * 0.2),
                ],
                H * 0.03,
              ),
              H * 0.004,
              o.seed + 61 + cote * 3,
            ),
            1,
          );
          poser(g, k, ep, {
            couleur: cote > 0 ? assombrir(o.epaulement.couleur, 0.18) : faceEclairee(o.epaulement.couleur, 0.3),
            matiere: o.epaulement.matiere ?? 'tissu',
            matiereAlpha: 0.2,
            echelle: 0.5,
            speculaire: o.epaulement.matiere === 'metal' ? { x: 0.3, y: 0.24, r: 0.12 } : null,
            seed: o.seed + 63 + cote,
          });
        }
      }
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
    x: -H * 0.07 * larg,
    y: epaule + H * 0.005,
    rot: o.brasGRot ?? -0.08,
    lumiere: 0.8,
    ordreMort: 5,
    dessin: (g, k) => brasEnDeux(g, k, -1, bras, H * 0.036),
  });

  if (o.arme) {
    pieces.push({
      nom: 'arme',
      /* L'arme s'accroche au POIGNET, pas à un point fixe : dès que le coude
         fléchit, la hampe doit suivre la main, sinon elle flotte à côté. */
      parent: 'bras_g',
      x: o.armeAncre?.x ?? poignet(-1).x,
      y: o.armeAncre?.y ?? poignet(-1).y,
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

  /*
   * QUATRE pattes, pas deux.
   *
   * `clipsQuadrupede` anime `patte_ag`, `patte_ad`, `patte_pg` et `patte_pd`
   * depuis toujours — c'est écrit dans son propre contrat quelques lignes plus
   * haut — mais le squelette n'en posait que deux, celles du côté proche.
   * Chaque ligne d'animation visant une patte du fond était donc gardée par
   * `si(rig, …)` et ne trouvait rien : tous les quadrupèdes du jeu, loups,
   * sangliers et cerfs, marchaient sur deux pattes. Vu sur la planche de contact
   * une fois les bêtes affichées à taille lisible, un cerf ressemblait à une
   * masse posée sur deux piquets.
   *
   * Les pattes du fond sont poussées EN PREMIER, donc peintes derrière tout le
   * reste, décalées d'un peu et assombries : c'est la perspective d'un animal vu
   * de flanc, où l'on aperçoit les deux pattes opposées entre les proches.
   */
  pieces.push(jambe('patte_ag', L * 0.22, Hs * 0.88, Hs * 0.12, -1));
  pieces.push(jambe('patte_pg', -L * 0.38, Hs * 0.86, Hs * 0.14, -1));
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
  aile: {
    envergure: number;
    corde: number;
    couleur: number;
    plume?: boolean;
    doigts?: number;
    /**
     * Où l'aile s'attache et sous quel angle, en fractions du corps.
     *
     * Un oiseau porte ses ailes au milieu du flanc, à plat : c'est le défaut, et
     * c'est juste pour les chouettes. Un griffon les porte à l'épaule et
     * relevées, parce qu'il a un arrière-train de lion à montrer — sans cette
     * option, l'éventail se centrait sur la bête et avalait le fauve, si bien
     * que les deux rangs sept de la Châtellenie rendaient de grands oiseaux
     * sombres au lieu de griffons.
     */
    pose?: { x: number; y: number; rot: number };
  };
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

  /*
   * L'aile LOINTAINE, poussée la première donc peinte derrière tout le reste.
   *
   * Elle manquait, et les clips la réclamaient depuis toujours : `clipsVolant`
   * anime `aile_g` comme `aile_d`, mais chaque ligne est gardée par `si(rig,
   * 'aile_g', …)` et ne trouvait rien. Une bête ailée n'avait donc qu'une aile,
   * ce qui se voyait : les griffons et les chouettes rendaient un éventail
   * planté sur un flanc, sans la symétrie qui fait lire un oiseau. Elle est
   * placée plus haut et plus en arrière, à l'envergure réduite et à la lumière
   * baissée — c'est la perspective, pas une aile atrophiée.
   */
  const pose = o.aile.pose ?? { x: 0.02, y: -0.24, rot: 0.22 };
  pieces.push({
    nom: 'aile_g',
    parent: 'corps',
    x: L * (pose.x - 0.12),
    y: Hc * (pose.y - 0.18),
    rot: pose.rot - 0.56,
    lumiere: -1.15,
    ambiance: 1.25,
    ordreMort: 1,
    dessin: (g, k) =>
      aile(g, k, {
        envergure: o.aile.envergure * 0.8,
        corde: o.aile.corde * 0.82,
        couleur: assombrir(o.aile.couleur, 0.42),
        plume: o.aile.plume,
        doigts: o.aile.doigts,
        sens: -1,
        seed: o.seed + 23,
      }),
  });

  pieces.push({
    nom: 'aile_d',
    parent: 'corps',
    x: L * pose.x,
    y: Hc * pose.y,
    rot: pose.rot,
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
