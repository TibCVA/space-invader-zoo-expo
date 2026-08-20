/**
 * Palette officielle du jeu — docs/01-ART-BIBLE.md §2.
 *
 * Aucune couleur du rendu ne doit provenir d'ailleurs. Ce module expose la
 * palette en constantes typées, la configuration de l'unique source de lumière
 * (loi n°2) et les fonctions de manipulation chromatique qui garantissent les
 * lois n°3 (lumière chaude / ombre froide), n°4 (liseré doré), n°5 (perspective
 * atmosphérique) et n°6 (contour teinté, jamais noir).
 *
 * Convention : toutes les couleurs sont des entiers 0xRRGGBB.
 */

/* ────────────────────────── Couleurs communes ───────────────────────────── */

export const PALETTE = {
  /** roche, ombres structurelles */
  granitAnthracite: 0x2a2c2f,
  /** faces éclairées de la pierre */
  granitClair: 0x4a4e52,
  /** sous-bois, lichen */
  mousseSombre: 0x2f3b2e,
  /** conifères, masses forestières */
  vertSapin: 0x1e3226,
  /** feuillus, prairies hautes */
  vertHetre: 0x4a6138,
  /** terre, chemins, bois */
  brunFougere: 0x6b5433,
  /** atmosphère, lointains */
  bleuBrume: 0x8fa6b8,
  /** nuit, eaux profondes */
  bleuProfond: 0x2b3a4a,
  /** lumière rasante, torchis */
  ocre: 0xc08a3e,
  /** Châtellenie, alertes */
  grenat: 0x6e1f2a,
  /** accents, rim light, enluminure */
  vieilOr: 0xc9a227,
  /** fonds d'interface */
  parchemin: 0xe8dcc0,
  /** interface, séparateurs */
  parcheminOmbre: 0xc9b996,
  /** texte principal */
  encre: 0x241c14,
} as const;

export type PaletteKey = keyof typeof PALETTE;

/* ─────────────────────── Loi n°2 — la seule lumière ─────────────────────── */

/**
 * Soleil au nord-ouest : azimut 315°, élévation 38°.
 *
 * En repère écran (y vers le bas), le nord-ouest est en haut à gauche : le
 * vecteur qui va de la surface vers le soleil est donc (-0,707 ; -0,707). Les
 * ombres portées partent dans la direction opposée, allongées de `1 / tan(38°)`
 * ramené par la bible à un facteur simple de 1,28.
 */
export const LIGHT = {
  azimuthDeg: 315,
  elevationDeg: 38,
  /** Vecteur unitaire surface → soleil, en repère écran. */
  toSun: { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
  /** Vecteur unitaire de projection des ombres (sud-est). */
  toShadow: { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  /** Lumière directe, chaude. */
  chaude: 0xffe9c2,
  /** Ombre propre, froide. */
  froide: 0x3a4657,
  /** Liseré de lumière (rim light). */
  rim: 0xc9a227,
  rimAlpha: 0.4,
  /** Ombre portée : teinte bleutée, jamais du noir. */
  ombrePortee: 0x2a3242,
  ombrePorteeAlpha: 0.32,
  /** longueur d'ombre = hauteur × ce facteur */
  ombreFacteur: 1.28,
  /** Bleu de brume vers lequel tend la distance. */
  brume: 0x8fa6b8,
  /** mix = clamp(distance / atmoDistance, 0, atmoMax) */
  atmoDistance: 1400,
  atmoMax: 0.55,
} as const;
/**
 * Angle à donner à `degradeLineaire` pour un dégradé d'ÉCLAIRAGE, en degrés.
 *
 * Il se déduit de la loi n°2 et ne se recopie pas. Un dégradé de surface va du
 * clair vers l'ombre : sa direction est donc `toShadow`, et l'angle est
 * l'argument de ce vecteur en repère écran — 45°, la première teinte tombant
 * en haut à gauche, c'est-à-dire au nord-ouest.
 *
 * Il était écrit en dur à **135** en cinq endroits, dont `degradeSurface`, qui
 * peint tout l'atlas — et dont l'en-tête annonçait pourtant « orienté selon le
 * soleil (315°) ». À 135°, `cos` et `sin` donnent (−0,707 ; +0,707) : la
 * première teinte tombe en haut à DROITE, la haute lumière passe au nord-est
 * et l'objet est éclairé à quatre-vingt-dix degrés de tous ses voisins et de
 * ses propres ombres portées. Tant que le dégradé rendait un aplat, la
 * contradiction ne se voyait pas ; depuis qu'il peint, elle se voit.
 */
export const ANGLE_LUMIERE = Math.round(
  (Math.atan2(LIGHT.toShadow.y, LIGHT.toShadow.x) * 180) / Math.PI,
);


/* ───────────────────────── Palettes de faction ──────────────────────────── */

export interface FactionPalette {
  /** teinte identitaire, la plus saturée */
  primaire: number;
  /** métal / accent d'enluminure */
  accent: number;
  /** pierre, armure, structure */
  pierre: number;
  /** valeur claire, tissu, os */
  clair: number;
  /** valeur sombre organique, cuir, bois */
  sombre: number;
  /** teinte d'appoint, atmosphère de la faction */
  appoint: number;
}

export const FACTION_PALETTE: Readonly<Record<'granit' | 'ermitage', FactionPalette>> = {
  granit: {
    primaire: 0x6e1f2a, // grenat
    accent: 0xc9a227, // or ancien
    pierre: 0x414a52, // ardoise
    clair: 0xede3ce, // ivoire
    sombre: 0x5a4128, // brun de chêne
    appoint: 0xc08a3e, // ocre, torchis et cuivre chaud
  },
  ermitage: {
    primaire: 0x1b3a2b, // vert profond
    accent: 0x4e8977, // cuivre patiné
    pierre: 0xcfc6b4, // pierre claire
    clair: 0x9fb4c2, // bleu brume
    sombre: 0x2f3b2e, // mousse sombre
    appoint: 0x7c8f6b, // vert sauge
  },
};

/* ─────────────────────── Bannières des cinq joueurs ─────────────────────── */

export type BannerPattern = 0 | 1 | 2 | 3 | 4;

export interface BannerDef {
  player: 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
  color: number;
  /** motif d'accessibilité, indépendant de la couleur */
  pattern: BannerPattern;
  patternName: 'plein' | 'chevrons' | 'losanges' | 'rayures' | 'pois';
  label: string;
}

export const BANNERS: readonly BannerDef[] = [
  { player: 'P1', color: 0x8c2230, pattern: 0, patternName: 'plein', label: 'Grenat' },
  { player: 'P2', color: 0x2e5f8a, pattern: 1, patternName: 'chevrons', label: 'Azur' },
  { player: 'P3', color: 0xb8891f, pattern: 2, patternName: 'losanges', label: 'Or' },
  { player: 'P4', color: 0x2f6b45, pattern: 3, patternName: 'rayures', label: 'Sinople' },
  { player: 'P5', color: 0x5b3a6e, pattern: 4, patternName: 'pois', label: 'Pourpre' },
];

/* ───────────────────── Écoles de magie — teintes d'aura ─────────────────── */

export const SCHOOL_COLORS: Readonly<
  Record<'braises' | 'sources' | 'brumes' | 'racines', { coeur: number; halo: number; ombre: number }>
> = {
  braises: { coeur: 0xffc98a, halo: 0xc0562a, ombre: 0x6e1f2a },
  sources: { coeur: 0xd6ecf2, halo: 0x4e8977, ombre: 0x2b3a4a },
  brumes: { coeur: 0xe4ecf2, halo: 0x8fa6b8, ombre: 0x414a52 },
  racines: { coeur: 0xcfd8a2, halo: 0x4a6138, ombre: 0x2f3b2e },
};

/* ─────────────────────── Ressources — teintes de jeton ──────────────────── */

export const RESOURCE_COLORS: Readonly<Record<string, { corps: number; eclat: number; creux: number }>> = {
  ecus: { corps: 0xc9a227, eclat: 0xf2dc94, creux: 0x7a5c14 },
  bois: { corps: 0x6b5433, eclat: 0xa88551, creux: 0x3b2c19 },
  granit: { corps: 0x4a4e52, eclat: 0x8b9298, creux: 0x2a2c2f },
  fer: { corps: 0x6d7681, eclat: 0xb9c3cb, creux: 0x333b44 },
  sel: { corps: 0xe8dcc0, eclat: 0xfdf6e4, creux: 0x9d9276 },
  essence: { corps: 0x4e8977, eclat: 0x9fd7c2, creux: 0x1b3a2b },
  filDor: { corps: 0xe3c355, eclat: 0xfff0b4, creux: 0x8c6a12 },
};

/* ───────────────────────────── Manipulation ─────────────────────────────── */

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Décompose un entier 0xRRGGBB en canaux 0-255. */
export function toRgb(color: number): Rgb {
  return { r: (color >> 16) & 0xff, g: (color >> 8) & 0xff, b: color & 0xff };
}

/** Recompose un entier 0xRRGGBB depuis des canaux 0-255 (bornés). */
export function fromRgb(c: Rgb): number {
  const r = Math.max(0, Math.min(255, Math.round(c.r)));
  const g = Math.max(0, Math.min(255, Math.round(c.g)));
  const b = Math.max(0, Math.min(255, Math.round(c.b)));
  return (r << 16) | (g << 8) | b;
}

/** Mélange linéaire de deux couleurs. `t = 0` renvoie `a`, `t = 1` renvoie `b`. */
export function melanger(a: number, b: number, t: number): number {
  const k = clamp01(t);
  const ca = toRgb(a);
  const cb = toRgb(b);
  return fromRgb({
    r: ca.r + (cb.r - ca.r) * k,
    g: ca.g + (cb.g - ca.g) * k,
    b: ca.b + (cb.b - ca.b) * k,
  });
}

/**
 * Assombrit une couleur **vers l'ombre froide**, jamais vers le noir : c'est la
 * loi n°3. Une ombre reste une couleur locale poussée vers le bleu-violet.
 */
export function assombrir(color: number, amount: number): number {
  const k = clamp01(amount);
  // deux tiers de mélange vers l'ombre froide, un tiers de perte de valeur pure
  const froid = melanger(color, LIGHT.froide, k * 0.62);
  const c = toRgb(froid);
  const f = 1 - k * 0.34;
  return fromRgb({ r: c.r * f, g: c.g * f, b: c.b * f });
}

/**
 * Éclaircit une couleur **vers la lumière chaude**, jamais vers le blanc pur.
 */
export function eclaircir(color: number, amount: number): number {
  const k = clamp01(amount);
  return melanger(color, LIGHT.chaude, k * 0.86);
}

/** Ombre propre d'une surface : deux crans de valeur, franchement bleutés. */
export function ombreBleutee(color: number, force = 0.5): number {
  return assombrir(color, 0.28 + 0.55 * clamp01(force));
}

/** Demi-teinte : la valeur intermédiaire de l'ombrage cel à trois valeurs. */
export function demiTeinte(color: number): number {
  return assombrir(color, 0.22);
}

/** Face pleinement éclairée d'une surface. */
export function faceEclairee(color: number, force = 0.5): number {
  return eclaircir(color, 0.16 + 0.4 * clamp01(force));
}

/**
 * Liseré doré (loi n°4). On ne pose pas l'or brut : on le teinte légèrement de
 * la couleur locale pour qu'il appartienne à l'objet.
 */
export function rimDoree(color: number, force = 1): number {
  return melanger(LIGHT.rim, eclaircir(color, 0.55), 0.24 * clamp01(force));
}

/**
 * Contour teinté (loi n°6) : couleur locale assombrie de 45 %, jamais `#000`.
 */
export function contourTeinte(color: number, force = 1): number {
  return assombrir(color, 0.45 * clamp01(force) + 0.08);
}

/**
 * Perspective atmosphérique (loi n°5).
 * `mix = clamp(distance / 1400, 0, 0.55)` vers le bleu de brume.
 */
export function perspectiveAtmospherique(color: number, distance: number): number {
  const mix = Math.max(0, Math.min(LIGHT.atmoMax, distance / LIGHT.atmoDistance));
  return melanger(color, LIGHT.brume, mix);
}

/** Désature une couleur vers sa propre luminance (brouillard exploré, boutons inactifs). */
export function desaturer(color: number, amount: number): number {
  const c = toRgb(color);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const k = clamp01(amount);
  return fromRgb({ r: c.r + (l - c.r) * k, g: c.g + (l - c.g) * k, b: c.b + (l - c.b) * k });
}

/** Sature une couleur en l'éloignant de sa luminance. */
export function saturer(color: number, amount: number): number {
  const c = toRgb(color);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const k = 1 + clamp01(amount);
  return fromRgb({ r: l + (c.r - l) * k, g: l + (c.g - l) * k, b: l + (c.b - l) * k });
}

/** Luminance relative 0..1, utile pour choisir un contour ou un texte lisible. */
export function luminance(color: number): number {
  const c = toRgb(color);
  return (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) / 255;
}

/**
 * Rampe à cinq valeurs d'une même teinte, du creux d'ombre au point de lumière.
 * C'est la base de tout ombrage : on ne peint jamais avec une seule valeur.
 */
export function rampe(color: number): [number, number, number, number, number] {
  return [
    ombreBleutee(color, 0.95),
    ombreBleutee(color, 0.45),
    color,
    faceEclairee(color, 0.4),
    faceEclairee(color, 0.95),
  ];
}

/** Spéculaire ponctuel sur métal : presque la lumière pure, teintée du métal. */
export function speculaire(color: number): number {
  return melanger(LIGHT.chaude, eclaircir(color, 0.9), 0.3);
}

/** Chaîne CSS `#rrggbb`, pour les textes et les dégradés canvas. */
export function css(color: number): string {
  return `#${(color >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
}

/** Chaîne CSS `rgba(...)`, pour le pré-rendu canvas. */
export function cssAlpha(color: number, alpha: number): string {
  const c = toRgb(color);
  return `rgba(${c.r},${c.g},${c.b},${clamp01(alpha).toFixed(3)})`;
}
