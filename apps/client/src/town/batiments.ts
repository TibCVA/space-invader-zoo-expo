/**
 * `apps/client/src/town/batiments.ts` — LES BÂTIMENTS POSÉS SUR LE TABLEAU.
 *
 * Les panoramas ne contiennent aucun bâtiment de niveau supérieur : ils offrent
 * des terrasses et des clairières vides. Tout ce que la cité a bâti est peint
 * ici, par-dessus, avec les primitives de `art/shading.ts` et la palette de
 * `art/palette.ts` — donc selon les sept lois : jamais d'aplat, soleil unique au
 * nord-ouest, lumière chaude contre ombre froide, liseré doré, perspective
 * atmosphérique, aucun contour noir.
 *
 * Deux vocabulaires d'architecture :
 *  - **Châtellenie de Granit** : moellons de granit, couvertures d'ardoise,
 *    charpente de chêne, ferrures, bannières grenat et or.
 *  - **Ermitage des Bois Noirs** : socles de pierre claire, parois d'écorce et
 *    de bois debout, toitures de cuivre verdi, passerelles et racines.
 *
 * Le placement ne se décide pas ici : il vient de `packages/content`
 * (`BuildingDef.scene`), seule source de vérité.
 */
import { FillPattern, Graphics, Matrix } from 'pixi.js';
import type { BuildingDef, FactionId } from '@auvergne/engine';
import type { MaterialKey, MaterialSet, Poly } from '../art/shading.js';
import {
  arcBande,
  blob,
  bounds,
  centroid,
  clipHalfPlane,
  contourVariable,
  dalle,
  densifier,
  flat,
  fuseau,
  lisereLumiere,
  perturber,
  pt,
  translater,
} from '../art/shading.js';
import { LIGHT, PALETTE, assombrir, eclaircir, melanger, rampe, speculaire } from '../art/palette.js';
import { prng } from '../art/noise.js';

/* ═══════════════════════════════ Le pinceau ══════════════════════════════ */

/** Densité du motif de matière : la tuile doit rester sous une trentaine de px. */
const DENSITE_MATIERE = 0.35;

/**
 * Options de `peindreFace`, calquées sur celles de `art/shading.ts`.
 */
export interface FaceOptions {
  base: number;
  matiere?: MaterialKey;
  matiereAlpha?: number;
  matiereEchelle?: number;
  /** contraste de l'ombrage cel, 0 = plat (interdit), 1 = très marqué */
  modele?: number;
  rim?: boolean;
  rimForce?: number;
  contour?: boolean;
  contourEpaisseur?: number;
  speculaire?: { x: number; y: number; r: number } | null;
  alpha?: number;
}

/**
 * Peint une face selon les sept lois, **en valeurs pleines** plutôt qu'en
 * dégradé de remplissage.
 *
 * `art/shading.ts#peindre` construit un `FillGradient` par surface. À l'échelle
 * d'un tableau de cité — une cinquantaine de faces dessinées directement dans
 * la scène vivante, sans passer par une `RenderTexture` — ces dégradés se
 * rendent délavés : les bâtiments virent au gris laiteux et perdent tout
 * modelé. On reprend donc ici la même construction en cinq valeurs, mais posée
 * par découpes en demi-plans, ce que le rendu traite comme des polygones
 * ordinaires.
 *
 * Strates, dans l'ordre : teinte locale, rampe de cinq valeurs perpendiculaire
 * au soleil, matière, spéculaire facultatif, liseré doré, contour teinté.
 */
export function peindreFace(g: Graphics, poly: Poly, m: MatieresCite, o: FaceOptions): void {
  if (poly.length < 3) return;
  const alpha = o.alpha ?? 1;
  const modele = Math.max(0.05, Math.min(1, o.modele ?? 0.6));
  const b = bounds(poly);
  const taille = Math.max(b.w, b.h) || 1;
  const c = centroid(poly);
  const sun = LIGHT.toSun;
  const ombre = { x: -sun.x, y: -sun.y };
  const [tresSombre, sombre, moyen, clair, tresClair] = rampe(o.base);
  const points = flat(poly);

  /* 1 — teinte locale. */
  g.poly(points).fill({ color: moyen, alpha });

  /* 2 — rampe de valeurs. Plus le modelé est faible, plus les bandes extrêmes
     sont repoussées vers les bords : la surface reste variée sans se couper. */
  const d1 = taille * (0.06 + 0.1 * (1 - modele));
  const d2 = taille * (0.24 + 0.24 * (1 - modele));
  const bandes: { dir: { x: number; y: number }; d: number; couleur: number; a: number }[] = [
    { dir: ombre, d: d1, couleur: sombre, a: 0.85 },
    { dir: ombre, d: d2, couleur: tresSombre, a: 0.8 },
    /* Les deux bandes claires sont volontairement plus discrètes que les deux
       sombres. `faceEclairee` éclaircit déjà de 54 % vers le blanc pour la
       plus haute ; posée aux trois quarts d'opacité sur les deux tiers d'une
       face, elle emportait toute la valeur du bâtiment et l'on retombait sur
       un aplat pâle, quelle que soit la teinte de base. Mesuré : 105 de
       luminance moyenne sur un mur, contre 60 à 80 pour les maisons peintes
       du même panorama. */
    { dir: sun, d: d1, couleur: clair, a: 0.6 },
    { dir: sun, d: d2, couleur: tresClair, a: 0.45 },
  ];
  for (const bande of bandes) {
    const decoupe = clipHalfPlane(poly, { x: c.x + bande.dir.x * bande.d, y: c.y + bande.dir.y * bande.d }, bande.dir);
    if (decoupe.length < 3) continue;
    g.poly(flat(decoupe)).fill({ color: bande.couleur, alpha: alpha * bande.a * (0.55 + 0.45 * modele) });
  }

  /* 3 — matière : la troisième strate exigée par la loi n°1. Le facteur global
     ramène la tuile à une trentaine de pixels, sinon le motif s'étale en nappe
     et ne se lit plus comme du grain. */
  const cle = o.matiere ?? 'grain';
  const tex = m.set[cle];
  if (tex) {
    const ech = (o.matiereEchelle ?? 0.4) * DENSITE_MATIERE;
    const motif = new FillPattern({ texture: tex, repetition: 'repeat' });
    motif.setTransform(new Matrix().scale(ech, ech));
    g.poly(points).fill({ fill: motif, alpha: (o.matiereAlpha ?? 0.16) * alpha });
  }

  /* 4 — spéculaire ponctuel (cuivre, plomb, gemme). */
  if (o.speculaire) {
    const s = o.speculaire;
    const sx = b.x + b.w * s.x;
    const sy = b.y + b.h * s.y;
    const r = taille * s.r;
    g.poly(flat(blob(sx, sy, r, r * 0.7, { seed: 12, points: 12, wobble: 0.2 }))).fill({
      color: speculaire(o.base),
      alpha: alpha * 0.6,
    });
  }

  /* 5 — liseré doré (loi n°4). */
  if (o.rim !== false) {
    lisereLumiere(g, poly, o.base, {
      force: o.rimForce ?? 1,
      largeur: Math.max(1, taille * 0.022),
      alpha,
    });
  }

  /* 6 — contour teinté d'épaisseur variable (loi n°6). */
  if (o.contour !== false) {
    contourVariable(g, poly, o.base, {
      epaisseur: o.contourEpaisseur ?? Math.max(1, taille * 0.028),
      alpha,
    });
  }
}

/**
 * Ombre portée au sol, en valeurs pleines.
 *
 * Même raison que `peindreFace` : `art/shading.ts#ombreProjetee` remplit son
 * ellipse d'un dégradé radial, invisible ici. Trois nappes concentriques de plus
 * en plus resserrées rendent le même fondu — bleu `#2A3242`, jamais du noir,
 * allongée vers le sud-est d'une fois la hauteur × 1,28 (loi n°2).
 */
export function ombreAuSol(
  g: Graphics,
  cx: number,
  cy: number,
  rayon: number,
  hauteur: number,
  graine: number,
): void {
  const allonge = hauteur * LIGHT.ombreFacteur;
  const dx = LIGHT.toShadow.x * allonge * 0.5;
  const dy = LIGHT.toShadow.y * allonge * 0.5 * 0.42;
  const rx = rayon + allonge * 0.5;
  const ry = Math.max(rayon * 0.34, rayon * 0.5 - allonge * 0.03);
  for (let k = 3; k >= 1; k -= 1) {
    const t = k / 3;
    const nappe = perturber(
      blob(cx + dx, cy + dy, rx * t, ry * t, { seed: graine + k * 7, points: 20, wobble: 0.12 }),
      rayon * 0.02,
      graine + k,
    );
    g.poly(flat(nappe)).fill({
      color: LIGHT.ombrePortee,
      alpha: LIGHT.ombrePorteeAlpha * (k === 3 ? 0.35 : k === 2 ? 0.45 : 0.6),
    });
  }

  /**
   * Ombre de contact : une nappe étroite, sombre, **sous** le bâtiment et non
   * décalée avec la portée.
   *
   * L'ombre portée seule ne pose pas un objet au sol : elle s'étale vers le
   * sud-est et laisse la base du mur flotter à un ou deux pixels de la terrasse.
   * C'est ce qui reste, à distance, l'indice le plus sûr d'un décor collé sur
   * une peinture. Le contact est court, opaque, et se referme sur l'emprise.
   */
  const contact = perturber(
    blob(cx, cy, rayon * 0.98, Math.max(2, rayon * 0.3), { seed: graine + 31, points: 18, wobble: 0.08 }),
    rayon * 0.015,
    graine + 5,
  );
  g.poly(flat(contact)).fill({ color: LIGHT.ombrePortee, alpha: LIGHT.ombrePorteeAlpha * 1.1 });
  const coeur = perturber(
    blob(cx, cy, rayon * 0.72, Math.max(1.5, rayon * 0.17), { seed: graine + 47, points: 16, wobble: 0.06 }),
    rayon * 0.01,
    graine + 6,
  );
  g.poly(flat(coeur)).fill({ color: LIGHT.ombrePortee, alpha: LIGHT.ombrePorteeAlpha * 1.5 });
}

/* ═══════════════════════════ Matières du tableau ═════════════════════════ */

/**
 * Jeu de matières utilisé par le tableau : les huit matières peintes du
 * manifeste quand elles existent, sinon les matières procédurales de l'atlas.
 * `facteur` compense la taille native — 512 px pour une image, 192 px pour une
 * matière procédurale — afin que le motif garde le même grain apparent.
 */
export interface MatieresCite {
  readonly set: MaterialSet;
  readonly facteur: Readonly<Record<MaterialKey, number>>;
}

/* ═══════════════════════════ Palettes d'architecture ═════════════════════ */

export interface PaletteBati {
  /** corps de mur */
  mur: number;
  /** assises et chaînages clairs */
  murClair: number;
  /** couverture */
  toit: number;
  /** charpente, huisseries */
  bois: number;
  /** ferrures, cuivre, plomb */
  metal: number;
  /** or d'enluminure, ferrures dorées */
  accent: number;
  /** étoffe des bannières */
  etoffe: number;
  /** végétation d'accompagnement */
  vegetal: number;
  /** matière dominante des murs */
  matiereMur: MaterialKey;
  /** matière dominante des toits */
  matiereToit: MaterialKey;
}

/**
 * Les valeurs sont relevées sur les panoramas peints : un moellon de granit au
 * soleil de midi n'est pas `granitClair` brut mais un gris chaud, et une
 * couverture d'ardoise sèche tire vers le bleu-gris clair. Toutes restent des
 * mélanges de la palette du §2 — aucune teinte n'est inventée.
 */
export const PALETTE_BATI: Readonly<Record<FactionId, PaletteBati>> = {
  granit: {
    /* granit clair réchauffé de parchemin ombré, puis d'un soupçon d'ocre :
       la pierre au soleil est chaude, jamais neutre. */
    mur: melanger(melanger(PALETTE.granitClair, PALETTE.parcheminOmbre, 0.24), PALETTE.ocre, 0.12),
    murClair: melanger(PALETTE.parcheminOmbre, PALETTE.granitClair, 0.3),
    /* Ardoise sèche : anthracite à peine bleuté.
       Elle était naguère éclaircie deux fois — mélange à 0,42 de bleu de brume
       *puis* 0,3 de parchemin ombré — et tombait à 0x777A76, quand le mur
       tombait à 0x8C8675. Deux gris de même valeur : le bâtiment entier se
       lisait comme un bloc plat, sans toit ni façade, posé sur un panorama
       peint qui, lui, oppose franchement une couverture sombre à une pierre
       claire. C'est ce qui le désignait immédiatement comme rapporté. */
    toit: melanger(PALETTE.granitAnthracite, PALETTE.bleuBrume, 0.2),
    bois: PALETTE.brunFougere,
    metal: melanger(PALETTE.granitClair, PALETTE.bleuBrume, 0.34),
    accent: PALETTE.vieilOr,
    etoffe: PALETTE.grenat,
    vegetal: PALETTE.vertHetre,
    matiereMur: 'granit',
    matiereToit: 'ecailles',
  },
  ermitage: {
    /* bois debout et écorce, sur socle de pierre claire */
    mur: melanger(PALETTE.brunFougere, PALETTE.mousseSombre, 0.34),
    murClair: 0xcfc6b4,
    /* cuivre verdi, éclairci pour tenir dans un sous-bois sombre */
    toit: melanger(melanger(0x4e8977, PALETTE.mousseSombre, 0.3), PALETTE.parcheminOmbre, 0.18),
    bois: melanger(PALETTE.brunFougere, PALETTE.encre, 0.28),
    metal: melanger(0x4e8977, PALETTE.parcheminOmbre, 0.3),
    accent: PALETTE.vieilOr,
    etoffe: 0x1b3a2b,
    vegetal: PALETTE.mousseSombre,
    matiereMur: 'ecorce',
    matiereToit: 'metal',
  },
};

/* ═════════════════════════════ Les archétypes ════════════════════════════ */

export type Archetype =
  | 'maison'
  | 'grange'
  | 'annexe'
  | 'tour'
  | 'halle'
  | 'forge'
  | 'ecurie'
  | 'mur'
  | 'porte'
  | 'donjon'
  | 'sanctuaire'
  | 'beffroi';

/** Déduit l'archétype d'un bâtiment de ses effets, jamais de son libellé. */
export function archetypeDe(def: BuildingDef): Archetype {
  const cles = new Set(def.grants.map((g) => g.kind));
  const speciaux = new Set(
    def.grants.filter((g) => g.kind === 'special').map((g) => (g as { key: string }).key),
  );

  if (speciaux.has('serment_des_comtes') || speciaux.has('coeur_des_bois_noirs')) return 'donjon';
  if (speciaux.has('porte_farges') || speciaux.has('mur_de_racines')) return 'porte';
  if (cles.has('defense')) return 'mur';
  if (cles.has('mage_guild')) return 'tour';
  if (cles.has('blacksmith')) return 'forge';
  if (cles.has('market')) return 'halle';
  if (cles.has('stables')) return 'ecurie';
  if (cles.has('tavern')) return 'maison';
  if (cles.has('upgrade')) return 'annexe';
  if (cles.has('dwelling')) return 'maison';
  if (def.chain === 'hotel_ville') return 'beffroi';
  if (cles.has('mana') || speciaux.has('scriptorium')) return 'sanctuaire';
  return 'grange';
}

/**
 * Ce que le dessin rend à la scène : les accroches de la vie permanente et
 * l'emprise, qui sert au survol comme au liseré doré.
 */
export interface DessinBatiment {
  readonly archetype: Archetype;
  /** bouches de fumée, en coordonnées locales (0,0 = pied du bâtiment) */
  readonly cheminees: readonly { x: number; y: number; force: number }[];
  /** hampes de bannière */
  readonly bannieres: readonly { x: number; y: number; taille: number }[];
  /** fenêtres qui s'allument au crépuscule */
  readonly fenetres: readonly { x: number; y: number; r: number }[];
  /** demi-largeur et demi-profondeur de l'emprise au sol */
  readonly emprise: { hw: number; hd: number };
  /** hauteur totale peinte, en pixels */
  readonly hauteur: number;
}

/* ══════════════════════════════ Outils de volume ═════════════════════════ */

interface Faces {
  sol: Poly;
  gauche: Poly;
  droite: Poly;
  dessus: Poly;
}

/** Les quatre faces visibles d'un pavé posé en vue trois quarts. */
function faces(hw: number, hd: number, h: number, graine: number): Faces {
  const g = (p: Poly): Poly => perturber(densifier(p, Math.max(6, hw / 2)), 0.6, graine);
  const W = pt(-hw, 0);
  const S = pt(0, hd);
  const E = pt(hw, 0);
  const N = pt(0, -hd);
  const W2 = pt(-hw, -h);
  const S2 = pt(0, hd - h);
  const E2 = pt(hw, -h);
  const N2 = pt(0, -hd - h);
  return {
    sol: g([W, S, E, N]),
    gauche: g([W, S, S2, W2]),
    droite: g([S, E, E2, S2]),
    dessus: g([W2, S2, E2, N2]),
  };
}

/** Peint un pavé : face au sud-ouest éclairée, face au sud-est dans l'ombre. */
function pave(
  g: Graphics,
  m: MatieresCite,
  pal: PaletteBati,
  hw: number,
  hd: number,
  h: number,
  opts: { base?: number; matiere?: MaterialKey; graine?: number; echelle?: number } = {},
): Faces {
  const base = opts.base ?? pal.mur;
  const mat = opts.matiere ?? pal.matiereMur;
  const graine = opts.graine ?? 5;
  const f = faces(hw, hd, h, graine);
  const ech = (opts.echelle ?? 0.42) * m.facteur[mat];
  peindreFace(g, f.droite, m, {
    base: melanger(base, LIGHT.froide, 0.34),
    matiere: mat,
    matiereAlpha: 0.26,
    matiereEchelle: ech,
    modele: 0.5,
    rim: false,
    contourEpaisseur: Math.max(0.9, hw * 0.04),
  });
  peindreFace(g, f.gauche, m, {
    /* Éclaircissement mesuré, et non généreux : `peindreFace` rajoute ensuite
       sa propre bande claire à 54 % vers le blanc, sur les deux tiers de la
       face. Les deux se cumulaient, et le mur ressortait à 105 de luminance
       moyenne quand les maisons peintes du panorama tiennent entre 60 et 80 —
       une façade plus lumineuse que tout ce qui l'entoure, qui se lisait comme
       un décor rapporté. */
    base: melanger(base, LIGHT.chaude, 0.14),
    matiere: mat,
    matiereAlpha: 0.24,
    matiereEchelle: ech,
    modele: 0.5,
    rimForce: 1.1,
    contourEpaisseur: Math.max(0.9, hw * 0.04),
  });
  /* Trois assises de moellons par face : sans elles la pierre est un aplat. */
  const assises = 3;
  for (let i = 1; i < assises; i += 1) {
    const y = (-h * i) / assises;
    g.moveTo(-hw, y)
      .lineTo(0, y + hd)
      .lineTo(hw, y)
      .stroke({ color: melanger(base, LIGHT.froide, 0.6), width: Math.max(0.8, hw * 0.015), alpha: 0.24 });
  }
  return f;
}

/** Couverture à deux pentes, avec débord d'avant-toit. */
function toitPignon(
  g: Graphics,
  m: MatieresCite,
  pal: PaletteBati,
  hw: number,
  hd: number,
  h: number,
  rh: number,
  opts: { debord?: number; graine?: number; couleur?: number } = {},
): { faite: [number, number, number, number] } {
  const d = opts.debord ?? 1.06;
  const graine = opts.graine ?? 9;
  const gw = hw * d;
  const gd = hd * d;
  const toit = opts.couleur ?? pal.toit;
  const mat = pal.matiereToit;
  const ech = 0.3 * m.facteur[mat];

  const W2 = pt(-gw, -h);
  const S2 = pt(0, gd - h);
  const E2 = pt(gw, -h);
  const N2 = pt(0, -gd - h);
  const RW = pt(-gw * 0.5, -h - rh);
  const RE = pt(gw * 0.5, -h - rh);
  const lisser = (p: Poly): Poly => perturber(densifier(p, Math.max(5, gw / 3)), 0.5, graine);

  const nord = lisser([W2, N2, E2, RE, RW]);
  const sud = lisser([W2, RW, RE, E2, S2]);

  /* Le versant du nord-ouest prend le soleil, celui du sud-est reste froid :
     c'est cet écart de valeur qui fait lire le volume (lois n°2 et n°3). */
  /* Le versant du nord-ouest prend la pleine lumière ; l'écart de valeur avec
     celui du sud-est doit se voir de loin, sans quoi le toit devient une dalle. */
  peindreFace(g, nord, m, {
    base: melanger(toit, LIGHT.chaude, 0.34),
    matiere: mat,
    matiereAlpha: 0.24,
    matiereEchelle: ech,
    modele: 0.55,
    rimForce: 1.2,
    contourEpaisseur: Math.max(1, gw * 0.04),
  });
  peindreFace(g, sud, m, {
    /* À midi le soleil est haut : le versant sud reste éclairé, seulement
       d'un cran plus froid. Le noircir ferait une dalle. */
    base: melanger(melanger(toit, LIGHT.chaude, 0.08), LIGHT.froide, 0.2),
    matiere: mat,
    matiereAlpha: 0.22,
    matiereEchelle: ech,
    modele: 0.45,
    rim: false,
    contourEpaisseur: Math.max(1, gw * 0.04),
  });
  /* Rangs de couverture : l'ardoise et le cuivre se lisent par lignes. */
  const rangs = Math.max(4, Math.round(rh / Math.max(3, gw * 0.075)));
  for (let i = 1; i < rangs; i += 1) {
    const t = i / rangs;
    const y = -h - rh * (1 - t);
    const demi = gw * (0.5 + 0.52 * t);
    g.moveTo(-demi, y).lineTo(demi, y).stroke({
      color: assombrir(toit, 0.34),
      width: Math.max(1, gw * 0.016),
      alpha: 0.3,
    });
    g.moveTo(-demi, y + gw * 0.012)
      .lineTo(demi, y + gw * 0.012)
      .stroke({ color: eclaircir(toit, 0.34), width: Math.max(0.8, gw * 0.01), alpha: 0.2 });
  }
  /* Avant-toit : une ombre franche sous la rive, c'est elle qui décolle le
     toit du mur. */
  g.moveTo(W2.x, W2.y)
    .lineTo(S2.x, S2.y)
    .lineTo(E2.x, E2.y)
    .stroke({ color: assombrir(toit, 0.6), width: Math.max(1.8, gw * 0.055), alpha: 0.8, join: 'round' });
  /* Faîtage : une arête claire, jamais un trait noir. */
  g.moveTo(RW.x, RW.y).lineTo(RE.x, RE.y).stroke({
    color: eclaircir(toit, 0.5),
    width: Math.max(1.4, gw * 0.04),
    alpha: 0.85,
    cap: 'round',
  });
  /* Deux planches de rive, aux pignons. */
  for (const s of [-1, 1]) {
    g.moveTo(s * gw, -h)
      .lineTo(s * gw * 0.5, -h - rh)
      .stroke({ color: melanger(pal.bois, LIGHT.chaude, 0.24), width: Math.max(1, gw * 0.024), alpha: 0.7, cap: 'round' });
  }
  return { faite: [RW.x, RW.y, RE.x, RE.y] };
}

/** Porte de bois ferré, posée sur la face sud-ouest. */
function porteBois(g: Graphics, pal: PaletteBati, x: number, y: number, w: number, h: number): void {
  const p = perturber(
    densifier(
      [pt(x - w / 2, y), pt(x + w / 2, y - h * 0.1), pt(x + w / 2, y - h), pt(x - w / 2, y - h * 0.9)],
      4,
    ),
    0.4,
    23,
  );
  g.poly(flat(p)).fill({ color: melanger(pal.bois, LIGHT.froide, 0.42) });
  g.poly(flat(p)).stroke({ color: assombrir(pal.bois, 0.45), width: 1, alpha: 0.8 });
  /* Deux pentures et un linteau clair. */
  for (let i = 0; i < 2; i += 1) {
    const yy = y - h * (0.3 + i * 0.38);
    g.rect(x - w / 2, yy, w, Math.max(0.9, h * 0.06)).fill({ color: pal.metal, alpha: 0.7 });
  }
  g.moveTo(x - w * 0.6, y - h)
    .lineTo(x + w * 0.6, y - h * 0.92)
    .stroke({ color: eclaircir(pal.murClair, 0.2), width: Math.max(1, h * 0.08), alpha: 0.6 });
}

/** Petite ouverture : ébrasement sombre, appui clair, verre au crépuscule. */
function fenetre(
  g: Graphics,
  pal: PaletteBati,
  x: number,
  y: number,
  r: number,
  ogive = false,
): { x: number; y: number; r: number } {
  const creux = melanger(pal.mur, LIGHT.froide, 0.72);
  if (ogive) {
    const p: Poly = [
      pt(x - r, y + r * 1.1),
      pt(x - r, y - r * 0.2),
      pt(x, y - r * 1.3),
      pt(x + r, y - r * 0.2),
      pt(x + r, y + r * 1.1),
    ];
    g.poly(flat(p)).fill({ color: assombrir(creux, 0.3) });
  } else {
    g.poly(flat(dalle(x - r, y - r * 0.9, r * 2, r * 2, { chamfer: r * 0.3, seed: 12 }))).fill({
      color: assombrir(creux, 0.3),
    });
  }
  g.moveTo(x - r * 1.15, y + r * 1.15)
    .lineTo(x + r * 1.15, y + r * 1.05)
    .stroke({ color: eclaircir(pal.murClair, 0.15), width: Math.max(0.8, r * 0.4), alpha: 0.65 });
  return { x, y: y - r * 0.2, r: r * 1.1 };
}

/** Hampe et étoffe : la bannière est animée par la scène, pas ici. */
function hampe(g: Graphics, pal: PaletteBati, x: number, y: number, taille: number): void {
  g.moveTo(x, y)
    .lineTo(x, y - taille)
    .stroke({ color: melanger(pal.bois, LIGHT.chaude, 0.2), width: Math.max(1, taille * 0.06), cap: 'round' });
  g.poly(flat(blob(x, y - taille, taille * 0.07, taille * 0.07, { seed: 3, points: 9, wobble: 0.2 }))).fill({
    color: pal.accent,
    alpha: 0.9,
  });
}

/** Semis de végétation au pied d'un bâtiment : rien ne pose sur du vide. */
function pied(g: Graphics, pal: PaletteBati, hw: number, hd: number, graine: number): void {
  const rand = prng(graine * 31 + 7);
  const n = Math.max(4, Math.round(hw / 5));
  for (let i = 0; i < n; i += 1) {
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * hw * (0.75 + rand() * 0.4);
    const y = hd * 0.4 + Math.sin(a) * hd * (0.5 + rand() * 0.5);
    const r = hw * (0.05 + rand() * 0.07);
    g.poly(flat(blob(x, y, r, r * 0.55, { seed: i * 5 + 2, points: 9, wobble: 0.34 }))).fill({
      color: melanger(pal.vegetal, rand() > 0.5 ? LIGHT.chaude : LIGHT.froide, 0.3),
      alpha: 0.24 + rand() * 0.2,
    });
  }
}

/* ══════════════════════════════ Les dessins ══════════════════════════════ */

/**
 * Peint un bâtiment dans `g`, origine au pied, façade au sud.
 *
 * @param taille  module de base en pixels : la largeur d'une maison de référence
 */
export function dessinerBatiment(
  g: Graphics,
  m: MatieresCite,
  pal: PaletteBati,
  archetype: Archetype,
  taille: number,
  graine: number,
): DessinBatiment {
  const cheminees: { x: number; y: number; force: number }[] = [];
  const bannieres: { x: number; y: number; taille: number }[] = [];
  const fenetres: { x: number; y: number; r: number }[] = [];
  const rand = prng(graine * 7919 + 13);
  const u = taille;

  let hw = u * 0.5;
  let hd = u * 0.24;
  let haut = u * 0.42;

  switch (archetype) {
    /* ── Maison, auberge, demeure : le module courant ── */
    case 'maison':
    case 'grange': {
      /* Aucune demeure n'est la copie de sa voisine : la graine fait varier
         l'empattement, la pente et la présence d'un appentis. */
      hw = u * (archetype === 'grange' ? 0.54 : 0.5) * (0.9 + rand() * 0.2);
      hd = hw * (0.58 + rand() * 0.1);
      haut = u * (0.27 + rand() * 0.07);
      const rh = u * (0.12 + rand() * 0.06);
      ombreAuSol(g, 0, hd * 0.5, hw * 1.1, haut + rh, graine);
      /* Appentis adossé au sud-ouest, une fois sur deux. */
      const appentis = rand() > 0.5;
      if (appentis) {
        const aw = hw * 0.42;
        const ax = -hw * 1.1;
        const toitApp = perturber(
          densifier(
            [pt(ax - aw, -haut * 0.28), pt(ax + aw * 0.7, -haut * 0.62), pt(ax + aw * 0.7, -haut * 0.3), pt(ax - aw, hd * 0.22)],
            5,
          ),
          0.5,
          graine + 41,
        );
        peindreFace(g, toitApp, m, {
          base: melanger(pal.toit, LIGHT.froide, 0.2),
          matiere: pal.matiereToit,
          matiereAlpha: 0.16,
          matiereEchelle: 0.3 * m.facteur[pal.matiereToit],
          modele: 0.35,
          rimForce: 1,
          contourEpaisseur: 1,
        });
      }
      pave(g, m, pal, hw, hd, haut, { graine });
      toitPignon(g, m, pal, hw, hd, haut, rh, { graine: graine + 3 });
      porteBois(g, pal, -hw * 0.3, hd * 0.5, hw * 0.26, haut * 0.62);
      fenetres.push(fenetre(g, pal, hw * 0.34, hd * 0.34 - haut * 0.42, hw * 0.1));
      fenetres.push(fenetre(g, pal, -hw * 0.66, -haut * 0.44, hw * 0.09));
      if (archetype === 'maison') {
        const cx = hw * 0.5;
        const cy = -haut - rh * 0.5;
        const souche = perturber(
          densifier([pt(cx - hw * 0.09, cy), pt(cx + hw * 0.09, cy), pt(cx + hw * 0.08, cy - u * 0.13), pt(cx - hw * 0.08, cy - u * 0.13)], 4),
          0.4,
          graine + 22,
        );
        peindreFace(g, souche, m, {
          base: melanger(pal.mur, LIGHT.chaude, 0.12),
          matiere: pal.matiereMur,
          matiereAlpha: 0.2,
          matiereEchelle: 0.55 * m.facteur[pal.matiereMur],
          modele: 0.9,
          rimForce: 1.1,
          contourEpaisseur: 1,
        });
        cheminees.push({ x: cx, y: cy - u * 0.14, force: 0.55 });
      }
      pied(g, pal, hw, hd, graine);
      break;
    }

    /* ── Annexe d'amélioration : appentis bas adossé ── */
    case 'annexe': {
      hw = u * 0.3;
      hd = hw * 0.5;
      haut = u * 0.22;
      const rh = u * 0.14;
      ombreAuSol(g, 0, hd * 0.5, hw, haut + rh, graine);
      pave(g, m, pal, hw, hd, haut, { graine, base: melanger(pal.mur, pal.bois, 0.4) });
      toitPignon(g, m, pal, hw, hd, haut, rh, { graine: graine + 5, debord: 1.24 });
      fenetres.push(fenetre(g, pal, 0, -haut * 0.5, hw * 0.14));
      pied(g, pal, hw, hd, graine + 2);
      break;
    }

    /* ── Tour de guilde : fût de pierre et toit conique ── */
    case 'tour': {
      hw = u * 0.3;
      hd = hw * 0.5;
      haut = u * 0.92;
      ombreAuSol(g, 0, hd * 0.6, hw * 1.2, haut, graine);
      /* Fût : deux flancs et deux ellipses, jamais un rectangle. */
      const fut: Poly = perturber(
        densifier(
          [
            pt(-hw, -haut * 0.02),
            pt(-hw * 0.86, -haut),
            pt(hw * 0.86, -haut),
            pt(hw, -haut * 0.02),
            pt(hw * 0.55, hd * 0.9),
            pt(-hw * 0.55, hd * 0.9),
          ],
          Math.max(6, hw / 2),
        ),
        0.7,
        graine,
      );
      peindreFace(g, fut, m, {
        base: pal.mur,
        matiere: pal.matiereMur,
        matiereAlpha: 0.2,
        matiereEchelle: 0.4 * m.facteur[pal.matiereMur],
        modele: 1,
        rimForce: 1.2,
        contourEpaisseur: Math.max(1, hw * 0.07),
      });
      /* Bandeaux d'assise. */
      for (let i = 1; i < 5; i += 1) {
        const y = -haut * (i / 5);
        g.moveTo(-hw * (0.99 - i * 0.024), y)
          .lineTo(hw * (0.99 - i * 0.024), y)
          .stroke({ color: melanger(pal.murClair, LIGHT.froide, 0.4), width: 1, alpha: 0.34 });
      }
      /* Couronnement et toit conique. */
      const cw = hw * 1.2;
      g.poly(flat(dalle(-cw, -haut - u * 0.06, cw * 2, u * 0.08, { chamfer: u * 0.02, seed: 4 }))).fill({
        color: melanger(pal.murClair, LIGHT.chaude, 0.16),
      });
      const cone: Poly = perturber(
        densifier([pt(-cw, -haut - u * 0.05), pt(0, -haut - u * 0.52), pt(cw, -haut - u * 0.05)], 5),
        0.5,
        graine + 1,
      );
      peindreFace(g, cone, m, {
        base: pal.toit,
        matiere: pal.matiereToit,
        matiereAlpha: 0.22,
        matiereEchelle: 0.28 * m.facteur[pal.matiereToit],
        modele: 0.95,
        rimForce: 1.3,
        contourEpaisseur: Math.max(1, hw * 0.06),
      });
      fenetres.push(fenetre(g, pal, 0, -haut * 0.72, hw * 0.16, true));
      fenetres.push(fenetre(g, pal, -hw * 0.4, -haut * 0.4, hw * 0.13, true));
      fenetres.push(fenetre(g, pal, hw * 0.42, -haut * 0.24, hw * 0.12, true));
      porteBois(g, pal, 0, hd * 0.8, hw * 0.34, haut * 0.2);
      bannieres.push({ x: 0, y: -haut - u * 0.5, taille: u * 0.24 });
      hampe(g, pal, 0, -haut - u * 0.5, u * 0.24);
      pied(g, pal, hw, hd, graine + 4);
      break;
    }

    /* ── Halle de marché : charpente ouverte sur poteaux ── */
    case 'halle': {
      hw = u * 0.62;
      hd = hw * 0.42;
      haut = u * 0.3;
      const rh = u * 0.18;
      ombreAuSol(g, 0, hd * 0.5, hw * 1.1, haut + rh, graine);
      /* Dallage. */
      const sol = perturber(densifier([pt(-hw, 0), pt(0, hd), pt(hw, 0), pt(0, -hd)], hw / 3), 0.8, graine);
      peindreFace(g, sol, m, {
        base: melanger(pal.murClair, LIGHT.froide, 0.34),
        matiere: 'granit',
        matiereAlpha: 0.2,
        matiereEchelle: 0.5 * m.facteur.granit,
        modele: 0.4,
        rim: false,
        contourEpaisseur: 1,
      });
      /* Six poteaux de chêne. */
      const poteaux = [-0.82, -0.3, 0.3, 0.82];
      for (let i = 0; i < poteaux.length; i += 1) {
        const px = hw * poteaux[i];
        const py = hd * (1 - Math.abs(poteaux[i])) * 0.7;
        const p = fuseau(px, py, px, py - haut, u * 0.05, { seed: i * 3 + 1, taper: 0.3 });
        peindreFace(g, p, m, {
          base: pal.bois,
          matiere: 'ecorce',
          matiereAlpha: 0.2,
          matiereEchelle: 0.5 * m.facteur.ecorce,
          modele: 0.9,
          rimForce: 1,
          contour: false,
        });
      }
      /* Étals et ballots sous l'auvent. */
      for (let i = 0; i < 5; i += 1) {
        const x = -hw * 0.7 + (i * hw * 1.4) / 4;
        const y = hd * 0.25 + (rand() - 0.5) * hd * 0.4;
        const r = u * (0.05 + rand() * 0.04);
        g.poly(flat(blob(x, y - r * 0.5, r, r * 0.62, { seed: i * 9 + 2, points: 10, wobble: 0.22 }))).fill({
          color: melanger(i % 2 ? pal.etoffe : PALETTE.ocre, LIGHT.chaude, 0.2),
          alpha: 0.9,
        });
        g.poly(flat(blob(x, y - r * 0.5, r, r * 0.62, { seed: i * 9 + 2, points: 10, wobble: 0.22 }))).stroke({
          color: assombrir(pal.bois, 0.3),
          width: 0.9,
          alpha: 0.6,
        });
      }
      /* Auvent bas, en croupe. */
      toitPignon(g, m, pal, hw, hd, haut, rh, {
        graine: graine + 7,
        debord: 1.3,
        couleur: melanger(pal.toit, pal.bois, 0.35),
      });
      pied(g, pal, hw, hd, graine + 6);
      break;
    }

    /* ── Forge comtale : haute cheminée, feu visible ── */
    case 'forge': {
      hw = u * 0.46;
      hd = hw * 0.5;
      haut = u * 0.38;
      const rh = u * 0.24;
      ombreAuSol(g, 0, hd * 0.5, hw * 1.2, haut + rh + u * 0.4, graine);
      pave(g, m, pal, hw, hd, haut, { graine, base: melanger(pal.mur, PALETTE.granitAnthracite, 0.3) });
      toitPignon(g, m, pal, hw, hd, haut, rh, { graine: graine + 2 });
      /* Cheminée massive au nord-est. */
      const cx = hw * 0.66;
      const chem = perturber(
        densifier(
          [pt(cx - u * 0.1, hd * 0.2), pt(cx + u * 0.1, hd * 0.1), pt(cx + u * 0.085, -haut - u * 0.44), pt(cx - u * 0.085, -haut - u * 0.4)],
          6,
        ),
        0.6,
        graine + 4,
      );
      peindreFace(g, chem, m, {
        base: melanger(pal.mur, LIGHT.froide, 0.16),
        matiere: 'granit',
        matiereAlpha: 0.22,
        matiereEchelle: 0.44 * m.facteur.granit,
        modele: 1,
        rimForce: 1.2,
        contourEpaisseur: Math.max(1, hw * 0.06),
      });
      g.poly(flat(dalle(cx - u * 0.12, -haut - u * 0.47, u * 0.24, u * 0.05, { chamfer: u * 0.015, seed: 6 }))).fill({
        color: eclaircir(pal.mur, 0.24),
      });
      cheminees.push({ x: cx, y: -haut - u * 0.47, force: 1.35 });
      /* Gueule de forge : la seule lumière chaude du tableau. */
      const feu = blob(-hw * 0.28, hd * 0.16, hw * 0.22, hw * 0.16, { seed: 11, points: 12, wobble: 0.2 });
      g.poly(flat(feu)).fill({ color: assombrir(pal.mur, 0.6) });
      g.poly(flat(blob(-hw * 0.28, hd * 0.18, hw * 0.16, hw * 0.11, { seed: 13, points: 11, wobble: 0.26 }))).fill({
        color: 0xd2712a,
        alpha: 0.85,
      });
      g.poly(flat(blob(-hw * 0.28, hd * 0.19, hw * 0.09, hw * 0.06, { seed: 17, points: 10, wobble: 0.3 }))).fill({
        color: LIGHT.chaude,
        alpha: 0.8,
      });
      /* Enclume et tas de charbon. */
      g.poly(
        flat(
          perturber(
            densifier([pt(hw * 0.1, hd * 0.6), pt(hw * 0.3, hd * 0.56), pt(hw * 0.26, hd * 0.4), pt(hw * 0.14, hd * 0.42)], 4),
            0.4,
            19,
          ),
        ),
      ).fill({ color: melanger(pal.metal, LIGHT.froide, 0.3) });
      pied(g, pal, hw, hd, graine + 8);
      break;
    }

    /* ── Écuries : long bâtiment bas et clôture ── */
    case 'ecurie': {
      hw = u * 0.66;
      hd = hw * 0.34;
      haut = u * 0.24;
      const rh = u * 0.17;
      ombreAuSol(g, 0, hd * 0.5, hw * 1.1, haut + rh, graine);
      pave(g, m, pal, hw, hd, haut, { graine, base: melanger(pal.mur, pal.bois, 0.45) });
      toitPignon(g, m, pal, hw, hd, haut, rh, { graine: graine + 1, debord: 1.2, couleur: melanger(pal.toit, PALETTE.brunFougere, 0.4) });
      for (let i = 0; i < 3; i += 1) {
        porteBois(g, pal, -hw * 0.5 + i * hw * 0.5, hd * 0.5 - i * hd * 0.06, hw * 0.2, haut * 0.7);
      }
      /* Clôture de lices. */
      for (let i = 0; i <= 5; i += 1) {
        const x = -hw * 1.3 + (i * hw * 0.7) / 2;
        g.moveTo(x, hd * 1.3)
          .lineTo(x, hd * 1.3 - u * 0.1)
          .stroke({ color: melanger(pal.bois, LIGHT.chaude, 0.2), width: Math.max(1, u * 0.014) });
      }
      g.moveTo(-hw * 1.3, hd * 1.3 - u * 0.07)
        .lineTo(-hw * 1.3 + hw * 1.75, hd * 1.3 - u * 0.07)
        .stroke({ color: melanger(pal.bois, LIGHT.froide, 0.22), width: Math.max(1, u * 0.012) });
      pied(g, pal, hw, hd, graine + 3);
      break;
    }

    /* ── Muraille : courtine crénelée, palissade ou mur de racines ── */
    case 'mur': {
      hw = u * 1.05;
      hd = u * 0.16;
      haut = u * 0.34;
      ombreAuSol(g, 0, hd * 0.5, hw, haut, graine);
      pave(g, m, pal, hw, hd, haut, { graine, echelle: 0.3 });
      /* Chemin de ronde et merlons. */
      const merlons = 9;
      for (let i = 0; i < merlons; i += 1) {
        const x = -hw + ((i + 0.5) * (hw * 2)) / merlons;
        const mw = (hw * 2) / merlons / 2.6;
        const p = perturber(
          densifier([pt(x - mw, -haut), pt(x + mw, -haut), pt(x + mw * 0.92, -haut - u * 0.1), pt(x - mw * 0.92, -haut - u * 0.1)], 4),
          0.5,
          graine + i,
        );
        peindreFace(g, p, m, {
          base: melanger(pal.mur, LIGHT.chaude, 0.1),
          matiere: pal.matiereMur,
          matiereAlpha: 0.18,
          matiereEchelle: 0.5 * m.facteur[pal.matiereMur],
          modele: 0.8,
          rimForce: 1.1,
          contourEpaisseur: 1,
        });
      }
      /* Une échauguette au sud-ouest. */
      const tx = -hw * 0.92;
      const tour = perturber(
        densifier([pt(tx - u * 0.11, hd * 0.6), pt(tx + u * 0.11, hd * 0.5), pt(tx + u * 0.1, -haut - u * 0.2), pt(tx - u * 0.1, -haut - u * 0.22)], 5),
        0.6,
        graine + 21,
      );
      peindreFace(g, tour, m, {
        base: pal.mur,
        matiere: pal.matiereMur,
        matiereAlpha: 0.2,
        matiereEchelle: 0.42 * m.facteur[pal.matiereMur],
        modele: 1,
        rimForce: 1.2,
        contourEpaisseur: 1.2,
      });
      const coif: Poly = [pt(tx - u * 0.15, -haut - u * 0.19), pt(tx, -haut - u * 0.42), pt(tx + u * 0.15, -haut - u * 0.19)];
      peindreFace(g, coif, m, {
        base: pal.toit,
        matiere: pal.matiereToit,
        matiereAlpha: 0.2,
        matiereEchelle: 0.3 * m.facteur[pal.matiereToit],
        modele: 0.9,
        rimForce: 1.2,
        contourEpaisseur: 1,
      });
      pied(g, pal, hw * 0.8, hd, graine + 5);
      break;
    }

    /* ── Porte de la place : deux tours jumelles et un vantail ferré ── */
    case 'porte': {
      hw = u * 0.78;
      hd = u * 0.2;
      haut = u * 0.44;
      ombreAuSol(g, 0, hd * 0.6, hw * 1.1, haut + u * 0.5, graine);
      /* Courtine centrale. */
      pave(g, m, pal, hw * 0.52, hd, haut, { graine, echelle: 0.32 });
      /* Arche et vantail. */
      const arc = arcBande(0, hd * 0.3, hw * 0.24, haut * 0.62, Math.PI, Math.PI * 2, u * 0.06, 0.1);
      g.poly(flat(arc)).fill({ color: melanger(pal.murClair, LIGHT.froide, 0.24) });
      g.poly(flat(arc)).stroke({ color: assombrir(pal.mur, 0.4), width: 1, alpha: 0.7 });
      const vantail = perturber(
        densifier([pt(-hw * 0.2, hd * 0.35), pt(hw * 0.2, hd * 0.3), pt(hw * 0.2, -haut * 0.5), pt(0, -haut * 0.66), pt(-hw * 0.2, -haut * 0.5)], 5),
        0.4,
        graine + 2,
      );
      peindreFace(g, vantail, m, {
        base: melanger(pal.bois, LIGHT.froide, 0.4),
        matiere: 'fourrure',
        matiereAlpha: 0.18,
        matiereEchelle: 0.5 * m.facteur.fourrure,
        modele: 0.7,
        rim: false,
        contourEpaisseur: 1.2,
      });
      for (let i = 0; i < 3; i += 1) {
        const y = hd * 0.32 - haut * (0.14 + i * 0.16);
        g.moveTo(-hw * 0.19, y).lineTo(hw * 0.19, y - hd * 0.03).stroke({
          color: pal.metal,
          width: Math.max(1, u * 0.014),
          alpha: 0.75,
        });
      }
      /* Deux tours jumelles. */
      for (const s of [-1, 1]) {
        const tx = s * hw * 0.68;
        const th = haut + u * 0.3;
        const t = perturber(
          densifier([pt(tx - u * 0.15, hd * 0.9), pt(tx + u * 0.15, hd * 0.8), pt(tx + u * 0.135, -th), pt(tx - u * 0.135, -th)], 6),
          0.6,
          graine + 30 + s,
        );
        peindreFace(g, t, m, {
          base: s < 0 ? melanger(pal.mur, LIGHT.chaude, 0.1) : melanger(pal.mur, LIGHT.froide, 0.14),
          matiere: pal.matiereMur,
          matiereAlpha: 0.2,
          matiereEchelle: 0.4 * m.facteur[pal.matiereMur],
          modele: 1,
          rimForce: 1.2,
          contourEpaisseur: Math.max(1, u * 0.02),
        });
        const coif: Poly = [pt(tx - u * 0.2, -th + u * 0.01), pt(tx, -th - u * 0.28), pt(tx + u * 0.2, -th + u * 0.01)];
        peindreFace(g, coif, m, {
          base: pal.toit,
          matiere: pal.matiereToit,
          matiereAlpha: 0.22,
          matiereEchelle: 0.3 * m.facteur[pal.matiereToit],
          modele: 0.95,
          rimForce: 1.3,
          contourEpaisseur: 1.2,
        });
        fenetres.push(fenetre(g, pal, tx, -th * 0.6, u * 0.05, true));
        bannieres.push({ x: tx, y: -th - u * 0.26, taille: u * 0.2 });
        hampe(g, pal, tx, -th - u * 0.26, u * 0.2);
      }
      pied(g, pal, hw, hd, graine + 9);
      break;
    }

    /* ── Bâtiment ultime : la salle haute et ses tourelles ── */
    case 'donjon': {
      hw = u * 0.62;
      hd = hw * 0.44;
      haut = u * 0.86;
      const rh = u * 0.42;
      ombreAuSol(g, 0, hd * 0.6, hw * 1.3, haut + rh, graine);
      /* Tourelles d'angle, derrière le corps principal. */
      for (const s of [-1, 1]) {
        const tx = s * hw * 0.94;
        const th = haut * 0.92;
        const t = perturber(
          densifier([pt(tx - u * 0.13, hd * 0.4), pt(tx + u * 0.13, hd * 0.32), pt(tx + u * 0.115, -th), pt(tx - u * 0.115, -th)], 6),
          0.6,
          graine + 40 + s,
        );
        peindreFace(g, t, m, {
          base: s < 0 ? melanger(pal.mur, LIGHT.chaude, 0.12) : melanger(pal.mur, LIGHT.froide, 0.18),
          matiere: pal.matiereMur,
          matiereAlpha: 0.2,
          matiereEchelle: 0.4 * m.facteur[pal.matiereMur],
          modele: 1,
          rimForce: 1.2,
          contourEpaisseur: Math.max(1, u * 0.018),
        });
        const coif: Poly = [pt(tx - u * 0.18, -th + u * 0.01), pt(tx, -th - u * 0.34), pt(tx + u * 0.18, -th + u * 0.01)];
        peindreFace(g, coif, m, {
          base: pal.toit,
          matiere: pal.matiereToit,
          matiereAlpha: 0.22,
          matiereEchelle: 0.28 * m.facteur[pal.matiereToit],
          modele: 0.95,
          rimForce: 1.3,
          contourEpaisseur: 1.2,
        });
        bannieres.push({ x: tx, y: -th - u * 0.32, taille: u * 0.26 });
        hampe(g, pal, tx, -th - u * 0.32, u * 0.26);
        fenetres.push(fenetre(g, pal, tx, -th * 0.58, u * 0.05, true));
      }
      /* Corps principal. */
      pave(g, m, pal, hw, hd, haut, { graine, echelle: 0.34 });
      toitPignon(g, m, pal, hw, hd, haut, rh, { graine: graine + 11, debord: 1.1 });
      /* Grand portail et rosace. */
      porteBois(g, pal, 0, hd * 0.6, hw * 0.3, haut * 0.34);
      for (let i = 0; i < 3; i += 1) {
        fenetres.push(fenetre(g, pal, -hw * 0.5 + i * hw * 0.5, -haut * 0.52, hw * 0.1, true));
      }
      const rosace = blob(0, -haut * 0.76, hw * 0.16, hw * 0.16, { seed: 31, points: 16, wobble: 0.08 });
      g.poly(flat(rosace)).fill({ color: melanger(pal.mur, LIGHT.froide, 0.6) });
      g.poly(flat(rosace)).stroke({ color: pal.accent, width: Math.max(1, u * 0.012), alpha: 0.85 });
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        g.moveTo(0, -haut * 0.76)
          .lineTo(Math.cos(a) * hw * 0.15, -haut * 0.76 + Math.sin(a) * hw * 0.15)
          .stroke({ color: pal.accent, width: 0.9, alpha: 0.6 });
      }
      fenetres.push({ x: 0, y: -haut * 0.76, r: hw * 0.18 });
      /* Filet doré du faîte : l'enluminure de la cité. */
      g.moveTo(-hw * 0.5, -haut - rh)
        .lineTo(hw * 0.5, -haut - rh)
        .stroke({ color: pal.accent, width: Math.max(1.2, u * 0.014), alpha: 0.7 });
      bannieres.push({ x: 0, y: -haut - rh - u * 0.02, taille: u * 0.34 });
      hampe(g, pal, 0, -haut - rh - u * 0.02, u * 0.34);
      cheminees.push({ x: -hw * 0.7, y: -haut - rh * 0.5, force: 0.4 });
      pied(g, pal, hw, hd, graine + 12);
      break;
    }

    /* ── Sanctuaire : socle de pierre, coupole de cuivre, passerelle ── */
    case 'sanctuaire': {
      hw = u * 0.42;
      hd = hw * 0.5;
      haut = u * 0.34;
      ombreAuSol(g, 0, hd * 0.5, hw * 1.2, haut + u * 0.3, graine);
      /* Socle appareillé. */
      pave(g, m, pal, hw, hd, haut, { graine, base: melanger(pal.murClair, pal.mur, 0.5), matiere: 'granit', echelle: 0.5 });
      /* Coupole. */
      const dome = blob(0, -haut, hw * 1.05, u * 0.34, { seed: 27, points: 24, wobble: 0.05, from: Math.PI, to: Math.PI * 2 });
      const domeFerme: Poly = [...dome, pt(hw * 1.05, -haut), pt(-hw * 1.05, -haut)];
      peindreFace(g, domeFerme, m, {
        base: pal.toit,
        matiere: pal.matiereToit,
        matiereAlpha: 0.24,
        matiereEchelle: 0.32 * m.facteur[pal.matiereToit],
        modele: 1,
        rimForce: 1.3,
        contourEpaisseur: Math.max(1, hw * 0.05),
        speculaire: { x: 0.34, y: 0.3, r: 0.09 },
      });
      /* Lanternon et croix de fer. */
      g.poly(flat(blob(0, -haut - u * 0.36, u * 0.05, u * 0.06, { seed: 5, points: 12, wobble: 0.12 }))).fill({
        color: melanger(pal.metal, LIGHT.chaude, 0.24),
      });
      g.moveTo(0, -haut - u * 0.4).lineTo(0, -haut - u * 0.52).stroke({ color: pal.accent, width: 1.4, alpha: 0.85 });
      g.moveTo(-u * 0.035, -haut - u * 0.47).lineTo(u * 0.035, -haut - u * 0.47).stroke({ color: pal.accent, width: 1.2, alpha: 0.8 });
      fenetres.push(fenetre(g, pal, -hw * 0.42, -haut * 0.5, hw * 0.11, true));
      fenetres.push(fenetre(g, pal, hw * 0.42, -haut * 0.45, hw * 0.11, true));
      porteBois(g, pal, 0, hd * 0.7, hw * 0.26, haut * 0.62);
      /* Passerelle de bois vers le sud-ouest. */
      for (let i = 0; i < 6; i += 1) {
        const x = -hw * (1.15 + i * 0.2);
        const y = hd * (0.9 + i * 0.22);
        g.poly(flat(dalle(x - u * 0.09, y, u * 0.18, u * 0.032, { chamfer: u * 0.008, seed: i + 40 }))).fill({
          color: melanger(pal.bois, i % 2 ? LIGHT.chaude : LIGHT.froide, 0.24),
          alpha: 0.92,
        });
      }
      pied(g, pal, hw, hd, graine + 15);
      break;
    }

    /* ── Beffroi : la maison commune et sa cloche ── */
    case 'beffroi': {
      hw = u * 0.56;
      hd = hw * 0.44;
      haut = u * 0.42;
      const rh = u * 0.26;
      ombreAuSol(g, 0, hd * 0.5, hw * 1.15, haut + rh + u * 0.4, graine);
      pave(g, m, pal, hw, hd, haut, { graine });
      toitPignon(g, m, pal, hw, hd, haut, rh, { graine: graine + 6 });
      /* Tour de l'horloge, adossée à l'ouest. */
      const tx = -hw * 0.72;
      const th = haut + rh + u * 0.3;
      const t = perturber(
        densifier([pt(tx - u * 0.12, hd * 0.6), pt(tx + u * 0.12, hd * 0.5), pt(tx + u * 0.105, -th), pt(tx - u * 0.105, -th)], 6),
        0.6,
        graine + 17,
      );
      peindreFace(g, t, m, {
        base: melanger(pal.mur, LIGHT.chaude, 0.1),
        matiere: pal.matiereMur,
        matiereAlpha: 0.2,
        matiereEchelle: 0.4 * m.facteur[pal.matiereMur],
        modele: 1,
        rimForce: 1.2,
        contourEpaisseur: Math.max(1, u * 0.018),
      });
      /* Baie de la cloche. */
      const baie = blob(tx, -th * 0.82, u * 0.07, u * 0.09, { seed: 8, points: 14, wobble: 0.1 });
      g.poly(flat(baie)).fill({ color: melanger(pal.mur, LIGHT.froide, 0.68) });
      g.poly(flat(blob(tx, -th * 0.83, u * 0.035, u * 0.045, { seed: 9, points: 12, wobble: 0.14 }))).fill({
        color: melanger(pal.metal, LIGHT.chaude, 0.35),
      });
      const coif: Poly = [pt(tx - u * 0.17, -th + u * 0.01), pt(tx, -th - u * 0.24), pt(tx + u * 0.17, -th + u * 0.01)];
      peindreFace(g, coif, m, {
        base: pal.toit,
        matiere: pal.matiereToit,
        matiereAlpha: 0.22,
        matiereEchelle: 0.3 * m.facteur[pal.matiereToit],
        modele: 0.95,
        rimForce: 1.3,
        contourEpaisseur: 1.1,
      });
      /* Cadran, en or et en encre. */
      const cadran = blob(tx, -th * 0.5, u * 0.06, u * 0.06, { seed: 21, points: 16, wobble: 0.06 });
      g.poly(flat(cadran)).fill({ color: melanger(PALETTE.parchemin, LIGHT.froide, 0.2) });
      g.poly(flat(cadran)).stroke({ color: pal.accent, width: 1.2, alpha: 0.9 });
      g.moveTo(tx, -th * 0.5).lineTo(tx + u * 0.03, -th * 0.5 - u * 0.026).stroke({ color: PALETTE.encre, width: 1, alpha: 0.8 });
      fenetres.push({ x: tx, y: -th * 0.82, r: u * 0.08 });
      fenetres.push(fenetre(g, pal, hw * 0.36, -haut * 0.5, hw * 0.11));
      fenetres.push(fenetre(g, pal, -hw * 0.1, hd * 0.3 - haut * 0.5, hw * 0.1));
      porteBois(g, pal, hw * 0.2, hd * 0.55, hw * 0.24, haut * 0.66);
      bannieres.push({ x: hw * 0.5, y: -haut - rh * 0.9, taille: u * 0.22 });
      hampe(g, pal, hw * 0.5, -haut - rh * 0.9, u * 0.22);
      pied(g, pal, hw, hd, graine + 18);
      break;
    }
  }

  return {
    archetype,
    cheminees,
    bannieres,
    fenetres,
    emprise: { hw, hd },
    hauteur: haut,
  };
}

/* ═══════════════════════════ Emplacement libre ═══════════════════════════ */

/**
 * Emplacement encore vide : une emprise tracée à la craie dorée, deux jalons de
 * chantier et une pierre d'attente. Discret, mais lisible et cliquable.
 */
export function dessinerEmplacement(g: Graphics, pal: PaletteBati, taille: number, graine: number): void {
  const hw = taille * 0.44;
  const hd = hw * 0.56;
  const rand = prng(graine + 101);
  const emprise = perturber(densifier([pt(-hw, 0), pt(0, hd), pt(hw, 0), pt(0, -hd)], hw / 3), 0.9, graine);

  /* Terrain décapé : plus clair que la terrasse, jamais un trou de peinture. */
  g.poly(flat(emprise)).fill({ color: melanger(PALETTE.brunFougere, LIGHT.chaude, 0.34), alpha: 0.34 });
  g.poly(flat(emprise)).fill({ color: LIGHT.rim, alpha: 0.09 });

  /* Trait d'implantation, tiré à la craie d'or, un segment sur deux. */
  for (let i = 0; i < emprise.length; i += 2) {
    const a = emprise[i];
    const b = emprise[(i + 1) % emprise.length];
    g.moveTo(a.x, a.y).lineTo(b.x, b.y);
  }
  g.stroke({ color: LIGHT.rim, width: Math.max(1.4, taille * 0.018), alpha: 0.8, cap: 'round' });

  /* Chèvre de chantier : trois perches liées, une poulie et sa corde. */
  const th = taille * 0.34;
  const pieds: [number, number][] = [
    [-hw * 0.34, hd * 0.34],
    [hw * 0.3, hd * 0.3],
    [-hw * 0.02, -hd * 0.42],
  ];
  for (const p of pieds) {
    g.moveTo(p[0], p[1])
      .lineTo(0, -th)
      .stroke({
        color: melanger(pal.bois, LIGHT.chaude, 0.3),
        width: Math.max(1.2, taille * 0.016),
        alpha: 0.92,
        cap: 'round',
      });
  }
  g.moveTo(0, -th)
    .lineTo(hw * 0.14, -th * 0.42)
    .stroke({ color: melanger(PALETTE.parcheminOmbre, LIGHT.froide, 0.2), width: Math.max(1, taille * 0.009), alpha: 0.75 });

  /* Pierres d'attente appareillées au pied de la chèvre. */
  for (let i = 0; i < 4; i += 1) {
    const x = -hw * 0.62 + i * hw * 0.16;
    const y = hd * 0.16 - (i % 2) * taille * 0.022;
    const bloc = perturber(
      densifier([pt(x, y), pt(x + hw * 0.17, y - hw * 0.03), pt(x + hw * 0.17, y - hw * 0.13), pt(x, y - hw * 0.1)], 3),
      0.4,
      graine + i * 5,
    );
    g.poly(flat(bloc)).fill({
      color: melanger(pal.murClair, i % 2 ? LIGHT.chaude : LIGHT.froide, 0.24),
      alpha: 0.9,
    });
    lisereLumiere(g, bloc, pal.murClair, { force: 0.9, largeur: 1.1 });
    contourVariable(g, bloc, pal.murClair, { epaisseur: 1, alpha: 0.7 });
  }

  /* Quelques gravats, pour que le sol ne soit pas un aplat. */
  for (let i = 0; i < 9; i += 1) {
    const a = rand() * Math.PI * 2;
    const x = Math.cos(a) * hw * rand() * 0.8;
    const y = Math.sin(a) * hd * rand() * 0.9;
    const r = taille * (0.008 + rand() * 0.012);
    g.poly(flat(blob(x, y, r, r * 0.6, { seed: i * 3 + graine, points: 8, wobble: 0.3 }))).fill({
      color: melanger(pal.murClair, LIGHT.froide, 0.4),
      alpha: 0.4 + rand() * 0.3,
    });
  }
}

/* ═════════════════════════════ Liseré de survol ══════════════════════════ */

/** Liseré doré posé sous un bâtiment survolé ou mis en avant. */
export function dessinerLisere(g: Graphics, hw: number, hd: number, hauteur: number): void {
  const emprise = perturber(densifier([pt(-hw, 0), pt(0, hd), pt(hw, 0), pt(0, -hd)], hw / 3), 0.6, 77);
  for (let i = 3; i >= 1; i -= 1) {
    g.poly(flat(translater(emprise, 0, 0))).stroke({
      color: LIGHT.rim,
      width: i * 2.4,
      alpha: 0.1 / i,
      join: 'round',
    });
  }
  g.poly(flat(emprise)).stroke({ color: LIGHT.rim, width: 1.8, alpha: 0.9, join: 'round' });
  g.poly(flat(emprise)).fill({ color: LIGHT.rim, alpha: 0.1 });
  /* Un chevron doré au-dessus du faîte : la cible est nommée par la coquille. */
  g.moveTo(-hw * 0.16, -hauteur - hd * 1.4)
    .lineTo(0, -hauteur - hd * 1.9)
    .lineTo(hw * 0.16, -hauteur - hd * 1.4)
    .stroke({ color: LIGHT.rim, width: 2, alpha: 0.85, cap: 'round', join: 'round' });
}
