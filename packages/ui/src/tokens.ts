/**
 * Jetons de design — Heroes of Might and Magic, Auvergne Edition.
 *
 * Source unique de vérité pour les couleurs, les espacements, les rayons, les
 * ombres, les durées, les courbes, les plans, les points de rupture et les
 * cibles tactiles. `styles.css` en dérive les variables CSS ; les composants
 * lisent ces variables, jamais des valeurs en dur.
 *
 * Toutes les couleurs proviennent de docs/01-ART-BIBLE.md §2. Aucun `#FFF`,
 * aucun `#000`, aucun bleu générique.
 */

/* ─────────────────────────────── Palette ────────────────────────────────── */

/** Couleurs communes (bible artistique §2, « Communes »). */
export const palette = {
  /** roche, ombres structurelles */
  granitAnthracite: '#2A2C2F',
  /** faces éclairées de la pierre */
  granitClair: '#4A4E52',
  /** sous-bois, lichen */
  mousseSombre: '#2F3B2E',
  /** conifères, masses forestières */
  vertSapin: '#1E3226',
  /** feuillus, prairies hautes */
  vertHetre: '#4A6138',
  /** terre, chemins, bois */
  brunFougere: '#6B5433',
  /** atmosphère, lointains */
  bleuBrume: '#8FA6B8',
  /** nuit, eaux profondes */
  bleuProfond: '#2B3A4A',
  /** lumière rasante, torchis */
  ocre: '#C08A3E',
  /** Châtellenie, alertes */
  grenat: '#6E1F2A',
  /** accents, rim light, enluminure */
  vieilOr: '#C9A227',
  /** fonds d'interface */
  parchemin: '#E8DCC0',
  /** interface, séparateurs */
  parcheminOmbre: '#C9B996',
  /** texte principal */
  encre: '#241C14',
} as const;

/** Lumière et ombre — loi n°3 : lumière chaude, ombre froide. Jamais de gris. */
export const light = {
  /** lumière directe du soleil de nord-ouest */
  chaude: '#FFE9C2',
  /** ombre propre, bleu-violet */
  froide: '#3A4657',
  /** ombre portée, plus dense */
  portee: '#2A3242',
  /** liseré de contre-jour, 40 % d'opacité */
  rim: '#C9A227',
  /** opacité canonique du rim light */
  rimOpacity: 0.4,
  /** opacité canonique de l'ombre portée */
  shadowOpacity: 0.32,
} as const;

/** Direction unique du soleil : azimut 315° (nord-ouest), élévation 38°. */
export const sun = {
  azimuthDeg: 315,
  elevationDeg: 38,
  /** vecteur unitaire de l'ombre portée, vers le sud-est */
  shadow: { x: 0.7071, y: 0.7071 },
  /** longueur d'ombre = hauteur × ce facteur */
  lengthFactor: 1.28,
} as const;

/** Châtellenie de Granit. */
export const granit = {
  primary: '#6E1F2A',
  accent: '#C9A227',
  stone: '#414A52',
  light: '#EDE3CE',
  wood: '#5A4128',
} as const;

/** Ermitage des Bois Noirs. */
export const ermitage = {
  primary: '#1B3A2B',
  accent: '#7C8F6B',
  copper: '#4E8977',
  mist: '#9FB4C2',
  light: '#CFC6B4',
} as const;

export type FactionKey = 'granit' | 'ermitage' | 'neutre';

/** Teintes par faction, utilisées par les portraits, les blasons et les cadres. */
export const factionPalette: Readonly<Record<FactionKey, {
  primary: string; accent: string; stone: string; light: string; deep: string;
}>> = {
  granit: {
    primary: granit.primary,
    accent: granit.accent,
    stone: granit.stone,
    light: granit.light,
    deep: '#3A2018',
  },
  ermitage: {
    primary: ermitage.primary,
    accent: ermitage.copper,
    stone: '#4A5450',
    light: ermitage.light,
    deep: '#132318',
  },
  neutre: {
    primary: '#5A4128',
    accent: palette.vieilOr,
    stone: palette.granitClair,
    light: palette.parchemin,
    deep: '#2C2418',
  },
};

/** Motif de bannière : l'accessibilité impose couleur **et** motif (§2). */
export type BannerPattern = 'plein' | 'chevrons' | 'losanges' | 'rayures' | 'pois';

export interface BannerToken {
  id: 'p1' | 'p2' | 'p3' | 'p4' | 'p5';
  /** libellé français, affiché tel quel */
  label: string;
  color: string;
  pattern: BannerPattern;
}

/** Les cinq bannières jouables. */
export const banners: readonly BannerToken[] = [
  { id: 'p1', label: 'Grenat', color: '#8C2230', pattern: 'plein' },
  { id: 'p2', label: 'Azur', color: '#2E5F8A', pattern: 'chevrons' },
  { id: 'p3', label: 'Or', color: '#B8891F', pattern: 'losanges' },
  { id: 'p4', label: 'Sinople', color: '#2F6B45', pattern: 'rayures' },
  { id: 'p5', label: 'Pourpre', color: '#5B3A6E', pattern: 'pois' },
];

/** Teintes des sept ressources — chacune reste dans la palette. */
export const resourceColors = {
  ecus: '#C9A227',
  bois: '#6B5433',
  granit: '#4A4E52',
  fer: '#7C8794',
  sel: '#D8CEB4',
  essence: '#4E8977',
  filDor: '#C08A3E',
} as const;

/** Teintes des quatre écoles de magie. */
export const schoolColors = {
  braises: '#B4491F',
  sources: '#4E8977',
  brumes: '#8FA6B8',
  racines: '#4A6138',
} as const;

/** Teintes de rareté des artefacts. */
export const rarityColors = {
  commun: '#8A8478',
  rare: '#4E8977',
  majeur: '#C08A3E',
  relique: '#8C2230',
} as const;

/** Sémantique d'état : jamais de rouge/vert « web », toujours la palette. */
export const status = {
  succes: '#3F6B4A',
  avertissement: '#C08A3E',
  danger: '#8C2230',
  information: '#4E7A93',
  neutre: '#6E6A60',
} as const;

/* ─────────────────────────── Espacements ────────────────────────────────── */

/** Échelle 4/8. `space[3]` = 12 px. */
export const space = {
  0: '0px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
  20: '80px',
  24: '96px',
} as const;

export type SpaceKey = keyof typeof space;

/* ───────────────────────────── Géométrie ────────────────────────────────── */

/** Coins nets : la ferronnerie médiévale ne connaît pas le rayon 16 px. */
export const radius = {
  none: '0px',
  xs: '2px',
  sm: '3px',
  md: '4px',
  lg: '6px',
  cartouche: '8px',
  round: '999px',
} as const;

/** Épaisseur du biseau des panneaux (clair en haut, sombre en bas). */
export const bevel = {
  width: '2px',
  light: 'rgba(255, 233, 194, 0.42)',
  dark: 'rgba(42, 50, 66, 0.55)',
} as const;

/** Filets d'or et ferrures. */
export const border = {
  hairline: '1px',
  thin: '2px',
  thick: '3px',
  gold: '#C9A227',
  goldDim: 'rgba(201, 162, 39, 0.42)',
  iron: '#3B3E42',
  ink: 'rgba(36, 28, 20, 0.55)',
} as const;

/* ─────────────────────────────── Ombres ─────────────────────────────────── */

/**
 * Toutes les ombres tirent vers le bleu-violet `#2A3242` et sont décalées vers
 * le sud-est, conformément aux lois n°2 et n°3. Aucune ombre grise diffuse.
 */
export const shadow = {
  none: 'none',
  /** liseré d'assise sous un élément posé */
  assise: '0 1px 0 rgba(42, 50, 66, 0.45)',
  /** carte, badge */
  basse: '0 2px 3px rgba(42, 50, 66, 0.28), 0 1px 0 rgba(255, 233, 194, 0.18) inset',
  /** panneau */
  panneau:
    '0 3px 6px rgba(42, 50, 66, 0.32), 0 10px 20px rgba(42, 50, 66, 0.20), 0 1px 0 rgba(255, 233, 194, 0.22) inset',
  /** dialogue, feuille mobile */
  haute:
    '0 6px 12px rgba(42, 50, 66, 0.38), 0 22px 44px rgba(42, 50, 66, 0.30), 0 1px 0 rgba(255, 233, 194, 0.24) inset',
  /** enfoncement d'un bouton actif */
  enfonce: '0 1px 2px rgba(42, 50, 66, 0.40) inset',
  /** halo doré discret sur fond sombre */
  halo: '0 0 18px rgba(201, 162, 39, 0.18)',
  /** anneau de focus, toujours visible */
  focus: '0 0 0 2px rgba(36, 28, 20, 0.72), 0 0 0 4px rgba(201, 162, 39, 0.92)',
} as const;

/* ────────────────────────────── Typographie ─────────────────────────────── */

export const font = {
  /** titres, héraldique, noms de lieux */
  titre: "'Cinzel', 'Cinzel Fallback', Georgia, 'Times New Roman', serif",
  /** récit, descriptions, codex */
  recit: "'EB Garamond', 'EB Garamond Fallback', Georgia, 'Times New Roman', serif",
  /** données, chiffres, boutons */
  donnee: "'Alegreya Sans', 'Alegreya Sans Fallback', 'Alegreya', 'Segoe UI', sans-serif",
} as const;

/** Corps de texte. Aucun texte indispensable sous 15 px (bible §3). */
export const fontSize = {
  micro: '13px',
  petit: '15px',
  base: '16px',
  lecture: '18px',
  moyen: '20px',
  grand: '24px',
  titre: '30px',
  enseigne: '38px',
  fronton: '50px',
} as const;

export const fontWeight = {
  normal: 400,
  moyen: 500,
  demi: 600,
  gras: 700,
} as const;

export const lineHeight = {
  serre: 1.2,
  normal: 1.4,
  recit: 1.62,
} as const;

export const letterSpacing = {
  titre: '0.08em',
  cartouche: '0.14em',
  normal: '0',
} as const;

/* ─────────────────────────── Mouvement ──────────────────────────────────── */

/** Toute animation d'interface tient entre 140 et 220 ms (bible §8). */
export const duration = {
  instant: '0ms',
  rapide: '140ms',
  base: '180ms',
  lente: '220ms',
  /** respiration d'ambiance : loi n°7, période 2 à 7 s */
  ambiance: '5200ms',
} as const;

export const easing = {
  /** courbe unique de l'interface */
  standard: 'cubic-bezier(.22,.61,.36,1)',
  /** sortie d'écran, feuille mobile qui retombe */
  sortie: 'cubic-bezier(.4,.02,.72,.36)',
  /** oscillation d'ambiance */
  ambiance: 'cubic-bezier(.45,.05,.55,.95)',
} as const;

/** Amplitude maximale d'un mouvement d'ambiance : 3 px (loi n°7). */
export const motion = {
  amplitudeMaxPx: 3,
  periodMinMs: 2000,
  periodMaxMs: 7000,
} as const;

/* ─────────────────────────────── Plans ──────────────────────────────────── */

export const zIndex = {
  fond: 0,
  carte: 10,
  releve: 20,
  colle: 100,
  bandeau: 200,
  voile: 900,
  feuille: 1000,
  dialogue: 1050,
  infobulle: 1200,
  toast: 1300,
  visite: 1400,
} as const;

/* ───────────────────────── Points de rupture ────────────────────────────── */

export const breakpoint = {
  /** téléphone étroit */
  xs: 360,
  /** téléphone */
  sm: 480,
  /** tablette portrait */
  md: 768,
  /** tablette paysage */
  lg: 1024,
  /** ordinateur */
  xl: 1280,
  /** grand écran */
  xxl: 1600,
} as const;

export type BreakpointKey = keyof typeof breakpoint;

/** Requête média « à partir de ». */
export function mediaFrom(key: BreakpointKey): string {
  return `(min-width: ${breakpoint[key]}px)`;
}

/** Requête média « en dessous de ». */
export function mediaUnder(key: BreakpointKey): string {
  return `(max-width: ${breakpoint[key] - 1}px)`;
}

/* ───────────────────────── Cibles tactiles ──────────────────────────────── */

/** Non négociable n°10 du brief : cible tactile ≥ 48 px. */
export const touch = {
  min: '48px',
  confortable: '56px',
  ample: '64px',
  /** hauteur imposée des boutons */
  bouton: '48px',
  /** carré d'un bouton-icône */
  boutonIcone: '48px',
  /** poignée de la feuille mobile */
  poignee: '40px',
} as const;

/** Tailles canoniques des icônes dessinées. */
export const iconSize = {
  xs: 16,
  sm: 20,
  md: 24,
  lg: 32,
  xl: 40,
  xxl: 56,
} as const;

/** Tailles canoniques des portraits de héros. */
export const portraitSize = {
  /** vignette de liste : doit rester lisible */
  vignette: 56,
  petit: 88,
  moyen: 140,
  grand: 220,
  /** fiche de héros */
  planche: 320,
} as const;

/* ──────────────────────── Regroupement exporté ──────────────────────────── */

export const tokens = {
  palette,
  light,
  sun,
  granit,
  ermitage,
  factionPalette,
  banners,
  resourceColors,
  schoolColors,
  rarityColors,
  status,
  space,
  radius,
  bevel,
  border,
  shadow,
  font,
  fontSize,
  fontWeight,
  lineHeight,
  letterSpacing,
  duration,
  easing,
  motion,
  zIndex,
  breakpoint,
  touch,
  iconSize,
  portraitSize,
} as const;

export type Tokens = typeof tokens;

/* ────────────────────────── Petits utilitaires ──────────────────────────── */

/** Concatène des classes en ignorant les valeurs vides. */
export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

/** Convertit `#RRGGBB` en `rgba(r, g, b, a)`. Utilisé par les dégradés SVG. */
export function alpha(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Mélange deux couleurs `#RRGGBB`. `t = 0` renvoie `a`, `t = 1` renvoie `b`. */
export function mix(a: string, b: string, t: number): string {
  const parse = (hex: string): [number, number, number] => {
    const h = hex.replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [
      parseInt(full.slice(0, 2), 16),
      parseInt(full.slice(2, 4), 16),
      parseInt(full.slice(4, 6), 16),
    ];
  };
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const k = Math.max(0, Math.min(1, t));
  const to = (x: number, y: number): string =>
    Math.round(x + (y - x) * k).toString(16).padStart(2, '0');
  return `#${to(r1, r2)}${to(g1, g2)}${to(b1, b2)}`;
}

/** Assombrit une couleur locale de `amount` (loi n°6 : contour teinté, jamais noir). */
export function shade(hex: string, amount = 0.45): string {
  return mix(hex, '#241C14', amount);
}

/** Éclaircit une couleur vers la lumière chaude (loi n°3). */
export function tint(hex: string, amount = 0.35): string {
  return mix(hex, light.chaude, amount);
}

/**
 * Perspective atmosphérique (loi n°5) : désature vers le bleu de brume selon la
 * distance en pixels de scène.
 */
export function aerial(hex: string, distance: number): string {
  const m = Math.max(0, Math.min(0.55, distance / 1400));
  return mix(hex, palette.bleuBrume, m);
}
