/**
 * Textures d'interface — parchemin, granit, cuir, ferrure, fil d'or, velouté.
 *
 * Tout est **généré en code** sous forme de SVG encodé en `data:` : aucun
 * fichier image, aucun CDN (non négociable n°5 du brief).
 *
 * Chaque texture respecte les lois du rendu :
 *  - loi n°1 : jamais d'aplat — chaque matière superpose teinte, variation de
 *    valeur et grain ;
 *  - loi n°2 : l'éclairage de relief (`feDistantLight`) est toujours réglé sur
 *    azimut 315°, élévation 38° ;
 *  - loi n°3 : les creux tirent vers `#3A4657`, les reliefs vers `#FFE9C2`.
 */

import { light, palette } from './tokens.js';

/* ─────────────────────────────── Outillage ──────────────────────────────── */

/** Encode un fragment SVG en `data:` URI utilisable dans `background-image`. */
export function svgUri(svg: string): string {
  const compact = svg.replace(/\s{2,}/g, ' ').replace(/>\s+</g, '><').trim();
  return `url("data:image/svg+xml,${encodeURIComponent(compact)}")`;
}

/** Enveloppe un contenu SVG dans une racine de taille donnée. */
function sheet(w: number, h: number, body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${body}</svg>`;
}

/** Une couche de matière prête à poser dans une propriété `background`. */
export interface TextureLayer {
  /** valeur de `background-image` */
  image: string;
  /** valeur de `background-size` */
  size: string;
  /** valeur de `background-repeat` */
  repeat: string;
  /** valeur de `background-blend-mode` */
  blend: string;
}

/** Compose plusieurs couches en une déclaration `background-*` cohérente. */
export function layered(layers: readonly TextureLayer[]): {
  backgroundImage: string;
  backgroundSize: string;
  backgroundRepeat: string;
  backgroundBlendMode: string;
} {
  return {
    backgroundImage: layers.map((l) => l.image).join(', '),
    backgroundSize: layers.map((l) => l.size).join(', '),
    backgroundRepeat: layers.map((l) => l.repeat).join(', '),
    backgroundBlendMode: layers.map((l) => l.blend).join(', '),
  };
}

/* ───────────────────────────── Filtres communs ──────────────────────────── */

/**
 * Relief éclairé par le soleil unique du jeu (315° / 38°).
 * `freq` règle la finesse du grain, `scale` la profondeur du relief.
 */
function reliefFilter(id: string, freq: string, octaves: number, seed: number, scale: number): string {
  return (
    `<filter id="${id}" x="0" y="0" width="100%" height="100%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch" result="n"/>` +
    `<feDiffuseLighting in="n" surfaceScale="${scale}" diffuseConstant="1" lighting-color="${light.chaude}" result="l">` +
    `<feDistantLight azimuth="315" elevation="38"/>` +
    `</feDiffuseLighting>` +
    `<feColorMatrix in="l" type="saturate" values="0.15"/>` +
    `</filter>`
  );
}

/** Grain simple, désaturé, sans relief : la troisième strate de toute matière. */
function grainFilter(id: string, freq: string, octaves: number, seed: number, slope: number): string {
  return (
    `<filter id="${id}" x="0" y="0" width="100%" height="100%">` +
    `<feTurbulence type="fractalNoise" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch" result="n"/>` +
    `<feColorMatrix in="n" type="saturate" values="0"/>` +
    `<feComponentTransfer><feFuncA type="linear" slope="${slope}" intercept="0"/></feComponentTransfer>` +
    `</filter>`
  );
}

/* ─────────────────────────────── Parchemin ──────────────────────────────── */

/**
 * Parchemin : teinte `#E8DCC0`, marbrures d'ocre, fibres verticales, grain fin.
 * Trois strates au minimum, jamais un aplat.
 */
export function parchmentTexture(seed = 3): TextureLayer[] {
  const fibres = sheet(
    240,
    240,
    `<defs>${grainFilter('pf', '0.02 0.9', 4, seed, 0.34)}${grainFilter('pg', '1.6', 2, seed + 11, 0.22)}</defs>` +
      `<rect width="240" height="240" filter="url(#pf)" opacity="0.5"/>` +
      `<rect width="240" height="240" filter="url(#pg)" opacity="0.42"/>`,
  );
  const marbrures = sheet(
    320,
    320,
    `<defs>` +
      `<radialGradient id="m1" cx="28%" cy="22%" r="62%">` +
      `<stop offset="0" stop-color="${palette.ocre}" stop-opacity="0.16"/>` +
      `<stop offset="1" stop-color="${palette.ocre}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="m2" cx="76%" cy="72%" r="55%">` +
      `<stop offset="0" stop-color="${palette.brunFougere}" stop-opacity="0.14"/>` +
      `<stop offset="1" stop-color="${palette.brunFougere}" stop-opacity="0"/></radialGradient>` +
      `<radialGradient id="m3" cx="58%" cy="8%" r="42%">` +
      `<stop offset="0" stop-color="${light.froide}" stop-opacity="0.10"/>` +
      `<stop offset="1" stop-color="${light.froide}" stop-opacity="0"/></radialGradient>` +
      `</defs>` +
      `<rect width="320" height="320" fill="url(#m1)"/>` +
      `<rect width="320" height="320" fill="url(#m2)"/>` +
      `<rect width="320" height="320" fill="url(#m3)"/>`,
  );
  return [
    { image: svgUri(fibres), size: '240px 240px', repeat: 'repeat', blend: 'overlay' },
    { image: svgUri(marbrures), size: '100% 100%', repeat: 'no-repeat', blend: 'multiply' },
    {
      image: `linear-gradient(163deg, ${palette.parchemin} 0%, #E2D5B6 46%, ${palette.parcheminOmbre} 100%)`,
      size: '100% 100%',
      repeat: 'no-repeat',
      blend: 'normal',
    },
  ];
}

/* ──────────────────────────────── Granit ────────────────────────────────── */

/** Granit : cristaux clairs sur fond anthracite, relief éclairé au nord-ouest. */
export function graniteTexture(seed = 17): TextureLayer[] {
  const cristaux = sheet(
    200,
    200,
    `<defs>${reliefFilter('gr', '0.62', 4, seed, 2.2)}</defs>` +
      `<rect width="200" height="200" filter="url(#gr)" opacity="0.55"/>`,
  );
  const veines = sheet(
    260,
    260,
    `<defs>${grainFilter('gv', '0.012 0.34', 3, seed + 5, 0.5)}</defs>` +
      `<rect width="260" height="260" filter="url(#gv)" opacity="0.30"/>`,
  );
  return [
    { image: svgUri(cristaux), size: '200px 200px', repeat: 'repeat', blend: 'soft-light' },
    { image: svgUri(veines), size: '260px 260px', repeat: 'repeat', blend: 'overlay' },
    {
      image: `linear-gradient(158deg, ${palette.granitClair} 0%, #3A3D41 42%, ${palette.granitAnthracite} 100%)`,
      size: '100% 100%',
      repeat: 'no-repeat',
      blend: 'normal',
    },
  ];
}

/* ───────────────────────────────── Cuir ─────────────────────────────────── */

/** Cuir : grain cellulaire, plis doux, bord assombri. */
export function leatherTexture(seed = 29): TextureLayer[] {
  const grain = sheet(
    180,
    180,
    `<defs>${reliefFilter('lr', '0.09', 5, seed, 1.5)}</defs>` +
      `<rect width="180" height="180" filter="url(#lr)" opacity="0.62"/>`,
  );
  const pores = sheet(
    120,
    120,
    `<defs>${grainFilter('lp', '1.1', 2, seed + 7, 0.26)}</defs>` +
      `<rect width="120" height="120" filter="url(#lp)" opacity="0.4"/>`,
  );
  return [
    { image: svgUri(grain), size: '180px 180px', repeat: 'repeat', blend: 'soft-light' },
    { image: svgUri(pores), size: '120px 120px', repeat: 'repeat', blend: 'overlay' },
    {
      image: `linear-gradient(160deg, #6B4E30 0%, #4E381F 55%, #332514 100%)`,
      size: '100% 100%',
      repeat: 'no-repeat',
      blend: 'normal',
    },
  ];
}

/* ──────────────────────────────── Ferrure ───────────────────────────────── */

/** Ferrure : acier martelé, stries anisotropes, reflet froid. */
export function ironTexture(seed = 41): TextureLayer[] {
  const stries = sheet(
    160,
    160,
    `<defs>${reliefFilter('ir', '0.02 1.3', 3, seed, 1.1)}</defs>` +
      `<rect width="160" height="160" filter="url(#ir)" opacity="0.5"/>`,
  );
  const martelage = sheet(
    96,
    96,
    `<defs>${reliefFilter('im', '0.14', 2, seed + 3, 2.6)}</defs>` +
      `<rect width="96" height="96" filter="url(#im)" opacity="0.28"/>`,
  );
  return [
    { image: svgUri(stries), size: '160px 160px', repeat: 'repeat', blend: 'soft-light' },
    { image: svgUri(martelage), size: '96px 96px', repeat: 'repeat', blend: 'overlay' },
    {
      image: `linear-gradient(157deg, #6E757D 0%, #4A5158 46%, #32373C 100%)`,
      size: '100% 100%',
      repeat: 'no-repeat',
      blend: 'normal',
    },
  ];
}

/* ─────────────────────────────── Fil d'or ───────────────────────────────── */

/** Fil d'or : broderie oblique, deux passes de fil, éclat ponctuel. */
export function goldThreadTexture(seed = 53): TextureLayer[] {
  const fil = sheet(
    24,
    24,
    `<defs>` +
      `<linearGradient id="fg" x1="0" y1="0" x2="1" y2="1">` +
      `<stop offset="0" stop-color="${light.chaude}" stop-opacity="0.55"/>` +
      `<stop offset="0.5" stop-color="${palette.vieilOr}" stop-opacity="0.85"/>` +
      `<stop offset="1" stop-color="#7A6116" stop-opacity="0.6"/></linearGradient>` +
      `</defs>` +
      `<path d="M-6 6 L6 -6 M0 24 L24 0 M18 30 L30 18" stroke="url(#fg)" stroke-width="2.1" fill="none"/>` +
      `<path d="M-6 12 L12 -6 M6 24 L24 6" stroke="${palette.ocre}" stroke-opacity="0.32" stroke-width="0.9" fill="none"/>`,
  );
  const eclat = sheet(
    140,
    140,
    `<defs>${grainFilter('ge', '0.85', 2, seed, 0.3)}</defs>` +
      `<rect width="140" height="140" filter="url(#ge)" opacity="0.35"/>`,
  );
  return [
    { image: svgUri(fil), size: '24px 24px', repeat: 'repeat', blend: 'screen' },
    { image: svgUri(eclat), size: '140px 140px', repeat: 'repeat', blend: 'overlay' },
    {
      image: `linear-gradient(155deg, #C9A227 0%, #9E7C1B 52%, #6B5210 100%)`,
      size: '100% 100%',
      repeat: 'no-repeat',
      blend: 'normal',
    },
  ];
}

/* ──────────────────────────────── Velouté ───────────────────────────────── */

/** Velouté : tissu profond, duvet fin, vignettage doux — fond de portrait. */
export function velvetTexture(base = '#3A2430', seed = 67): TextureLayer[] {
  const duvet = sheet(
    150,
    150,
    `<defs>${grainFilter('vd', '1.9', 3, seed, 0.2)}</defs>` +
      `<rect width="150" height="150" filter="url(#vd)" opacity="0.5"/>`,
  );
  const ondes = sheet(
    300,
    300,
    `<defs>${reliefFilter('vo', '0.008 0.05', 3, seed + 9, 1.6)}</defs>` +
      `<rect width="300" height="300" filter="url(#vo)" opacity="0.30"/>`,
  );
  return [
    { image: svgUri(duvet), size: '150px 150px', repeat: 'repeat', blend: 'overlay' },
    { image: svgUri(ondes), size: '300px 300px', repeat: 'repeat', blend: 'soft-light' },
    {
      image:
        `radial-gradient(120% 96% at 24% 16%, ${light.chaude}22 0%, transparent 58%), ` +
        `radial-gradient(130% 110% at 78% 96%, ${light.portee}66 0%, transparent 62%), ` +
        `linear-gradient(158deg, ${base} 0%, ${base} 40%, #241823 100%)`,
      size: '100% 100%',
      repeat: 'no-repeat',
      blend: 'normal',
    },
  ];
}

/* ──────────────────────── Registre et variables CSS ─────────────────────── */

export type TextureName =
  | 'parchemin'
  | 'granit'
  | 'cuir'
  | 'ferrure'
  | 'filDor'
  | 'veloute';

/** Fabrique la matière demandée. */
export function texture(name: TextureName): TextureLayer[] {
  switch (name) {
    case 'parchemin':
      return parchmentTexture();
    case 'granit':
      return graniteTexture();
    case 'cuir':
      return leatherTexture();
    case 'ferrure':
      return ironTexture();
    case 'filDor':
      return goldThreadTexture();
    case 'veloute':
      return velvetTexture();
  }
}

/** Nom de la variable CSS portant l'image d'une matière. */
export function textureVarName(name: TextureName): string {
  return `--hmm-tex-${name.toLowerCase()}`;
}

/**
 * Variables CSS de toutes les matières, prêtes à poser sur `:root`.
 * Quatre variables par matière : `-image`, `-size`, `-repeat`, `-blend`.
 */
export function textureVars(): Record<string, string> {
  const out: Record<string, string> = {};
  const names: TextureName[] = ['parchemin', 'granit', 'cuir', 'ferrure', 'filDor', 'veloute'];
  for (const n of names) {
    const l = layered(texture(n));
    const base = textureVarName(n);
    out[`${base}-image`] = l.backgroundImage;
    out[`${base}-size`] = l.backgroundSize;
    out[`${base}-repeat`] = l.backgroundRepeat;
    out[`${base}-blend`] = l.backgroundBlendMode;
  }
  return out;
}

/**
 * Installe les matières générées sur l'élément racine du document.
 * Idempotent ; sans effet hors navigateur.
 */
export function installTextures(root?: HTMLElement): void {
  if (typeof document === 'undefined') return;
  const el = root ?? document.documentElement;
  if (el.dataset.hmmTextures === 'installees') return;
  const vars = textureVars();
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.dataset.hmmTextures = 'installees';
}

/** Style en ligne prêt à l'emploi pour une matière donnée. */
export function textureStyle(name: TextureName): {
  backgroundImage: string;
  backgroundSize: string;
  backgroundRepeat: string;
  backgroundBlendMode: string;
} {
  return layered(texture(name));
}

/* ─────────────────── Motifs de bannière (accessibilité) ─────────────────── */

/**
 * Motif de joueur, superposé à la couleur : l'information ne passe jamais par
 * la seule teinte (bible §2).
 */
export function bannerPatternUri(
  pattern: 'plein' | 'chevrons' | 'losanges' | 'rayures' | 'pois',
  ink = '#241C14',
  opacity = 0.28,
): string {
  const o = opacity.toFixed(2);
  switch (pattern) {
    case 'plein':
      return svgUri(
        sheet(16, 16, `<rect width="16" height="16" fill="${ink}" fill-opacity="${(opacity * 0.22).toFixed(3)}"/>`),
      );
    case 'chevrons':
      return svgUri(
        sheet(
          16,
          16,
          `<path d="M0 12 L8 4 L16 12" fill="none" stroke="${ink}" stroke-opacity="${o}" stroke-width="2.2"/>` +
            `<path d="M0 20 L8 12 L16 20" fill="none" stroke="${ink}" stroke-opacity="${o}" stroke-width="2.2"/>`,
        ),
      );
    case 'losanges':
      return svgUri(
        sheet(
          16,
          16,
          `<path d="M8 1 L15 8 L8 15 L1 8 Z" fill="none" stroke="${ink}" stroke-opacity="${o}" stroke-width="1.8"/>`,
        ),
      );
    case 'rayures':
      return svgUri(
        sheet(
          14,
          14,
          `<path d="M-4 4 L4 -4 M0 14 L14 0 M10 18 L18 10" stroke="${ink}" stroke-opacity="${o}" stroke-width="3" fill="none"/>`,
        ),
      );
    case 'pois':
      return svgUri(
        sheet(
          18,
          18,
          `<circle cx="5" cy="5" r="2.4" fill="${ink}" fill-opacity="${o}"/>` +
            `<circle cx="14" cy="13" r="2.4" fill="${ink}" fill-opacity="${o}"/>`,
        ),
      );
  }
}
