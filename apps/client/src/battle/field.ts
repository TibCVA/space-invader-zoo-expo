/**
 * `battle/field.ts` — le sol du champ de bataille, peint pour de bon.
 *
 * Le terrain est composé une seule fois dans une `RenderTexture` (une passe de
 * rendu), puis affiché en sprite : c'est ce qui laisse les soixante images par
 * seconde aux piles et aux animations.
 *
 * Cinq ambiances, choisies par la **région** de la carte et le terrain du
 * combat (`CombatState.region`, `CombatState.terrain`) :
 * sapinière, prairie, rocher, zone humide et cour de siège.
 *
 * Chaque ambiance pose au minimum, dans l'ordre (loi n°1) :
 *   1. un dégradé de biome orienté par le soleil de 315° ;
 *   2. des nappes de valeur (bruit multi-octave) et des lisières douces ;
 *   3. une matière répétable (pinceau de terrain de l'atlas) ;
 *   4. un semis de détail propre à l'ambiance ;
 *   5. la gravure de la trame hexagonale, éclairée au nord-ouest ;
 *   6. la perspective atmosphérique vers `#8FA6B8` avec l'éloignement ;
 *   7. un vignettage et un grain de parchemin global.
 *
 * Les obstacles arrivent tels quels de `CombatState.obstacles` : aucune règle
 * n'est recalculée, la vue ne fait que les poser.
 */

import { Container, Graphics, Matrix, RenderTexture, Sprite, FillPattern } from 'pixi.js';
import type { Renderer } from 'pixi.js';
import { HEX_COLS, HEX_ROWS, hexKey } from '@auvergne/engine';
import type { CombatObstacle, CombatState, HexCoord, RegionId, Terrain } from '@auvergne/engine';
import type { ArtAtlas } from '../art/index.js';
import type { PropKey } from '../art/props.js';
import { oscillationProp } from '../art/props.js';
import {
  LIGHT,
  PALETTE,
  assombrir,
  faceEclairee,
  melanger,
  ombreBleutee,
} from '../art/palette.js';
import { blob, degradeLineaire, degradeRadial, flat, fuseau, perturber, densifier } from '../art/shading.js';
import type { Poly } from '../art/shading.js';
import { fbm, hash2, prng, valueNoise } from '../art/noise.js';
import { Geometrie } from './hexgrid.js';

/* ═══════════════════════════════ Ambiances ═══════════════════════════════ */

export type Ambiance = 'sapiniere' | 'prairie' | 'rocher' | 'humide' | 'cour';

export const AMBIANCE_LABELS: Readonly<Record<Ambiance, string>> = {
  sapiniere: 'Sapinière',
  prairie: 'Prairie',
  rocher: 'Chaos de rochers',
  humide: 'Zone humide',
  cour: 'Cour de siège',
};

/** Ambiance dominante d'une région du Forez. */
const AMBIANCE_REGION: Readonly<Record<RegionId, Ambiance>> = {
  hauts_arconsat: 'rocher',
  vallee_durolle: 'humide',
  lac_sagnes: 'humide',
  maison_tresor: 'prairie',
  chatellenie_cervieres: 'prairie',
  futaies_viscomtat: 'sapiniere',
  coeur_bois_noirs: 'sapiniere',
  pays_noiretable: 'rocher',
  hermitage_peyrotine: 'sapiniere',
  vollore_pamole: 'prairie',
  marche_renaudie: 'rocher',
  grande_chaussee: 'prairie',
};

/** Le terrain de la case affine la région : une forêt reste une sapinière. */
const AMBIANCE_TERRAIN: Readonly<Partial<Record<Terrain, Ambiance>>> = {
  foret: 'sapiniere',
  prairie: 'prairie',
  rocher: 'rocher',
  pente: 'rocher',
  humide: 'humide',
};

/**
 * L'ambiance retenue. Un siège l'emporte sur tout : on se bat dans une cour
 * pavée, pas dans un pré.
 */
export function ambianceDe(region: RegionId, terrain: Terrain, siege: boolean): Ambiance {
  if (siege) return 'cour';
  return AMBIANCE_TERRAIN[terrain] ?? AMBIANCE_REGION[region] ?? 'prairie';
}

interface PaletteSol {
  /** teinte de fond, du fond de vallon au sommet éclairé */
  fond: number;
  clair: number;
  sombre: number;
  /** teinte du semis de détail */
  detail: number;
  /** deuxième teinte de détail */
  detail2: number;
  /** pinceau de terrain de l'atlas */
  pinceau: string;
  matiereAlpha: number;
}

const PALETTES: Readonly<Record<Ambiance, PaletteSol>> = {
  sapiniere: {
    fond: 0x2f3b2e,
    clair: melanger(PALETTE.vertHetre, PALETTE.ocre, 0.22),
    sombre: 0x1e3226,
    detail: melanger(PALETTE.brunFougere, PALETTE.vertSapin, 0.4),
    detail2: melanger(PALETTE.vertHetre, LIGHT.chaude, 0.28),
    pinceau: 'foret',
    matiereAlpha: 0.3,
  },
  prairie: {
    fond: 0x4a6138,
    clair: melanger(PALETTE.vertHetre, PALETTE.ocre, 0.4),
    sombre: melanger(PALETTE.mousseSombre, PALETTE.vertSapin, 0.35),
    detail: melanger(PALETTE.ocre, PALETTE.vertHetre, 0.4),
    detail2: melanger(PALETTE.parchemin, PALETTE.vertHetre, 0.55),
    pinceau: 'prairie',
    matiereAlpha: 0.28,
  },
  rocher: {
    fond: 0x4a4e52,
    clair: melanger(PALETTE.granitClair, PALETTE.ocre, 0.24),
    sombre: 0x2a2c2f,
    detail: melanger(PALETTE.granitClair, PALETTE.bleuBrume, 0.3),
    detail2: melanger(PALETTE.mousseSombre, PALETTE.granitClair, 0.4),
    pinceau: 'rocher',
    matiereAlpha: 0.34,
  },
  humide: {
    fond: melanger(PALETTE.mousseSombre, PALETTE.bleuProfond, 0.42),
    clair: melanger(PALETTE.vertHetre, PALETTE.bleuBrume, 0.4),
    sombre: 0x2b3a4a,
    detail: melanger(PALETTE.bleuProfond, PALETTE.bleuBrume, 0.4),
    detail2: melanger(PALETTE.brunFougere, PALETTE.mousseSombre, 0.5),
    pinceau: 'humide',
    matiereAlpha: 0.3,
  },
  cour: {
    fond: melanger(PALETTE.granitClair, PALETTE.brunFougere, 0.3),
    clair: melanger(PALETTE.granitClair, PALETTE.ocre, 0.34),
    sombre: melanger(PALETTE.granitAnthracite, PALETTE.brunFougere, 0.24),
    detail: melanger(PALETTE.parcheminOmbre, PALETTE.granitClair, 0.5),
    detail2: melanger(PALETTE.brunFougere, PALETTE.granitAnthracite, 0.4),
    pinceau: 'pierre',
    matiereAlpha: 0.32,
  },
};

/* ══════════════════════════ Peinture du sol ══════════════════════════════ */

interface Cadre {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Densité de détail selon la qualité choisie par le joueur. */
function densite(quality: 'basse' | 'moyenne' | 'haute'): number {
  return quality === 'basse' ? 0.42 : quality === 'moyenne' ? 0.72 : 1;
}

/** Nappes de valeur : le sol n'a jamais deux fois la même teinte. */
function nappes(g: Graphics, cadre: Cadre, pal: PaletteSol, graine: number, force: number): void {
  const n = Math.round(34 * force);
  const rand = prng(graine);
  for (let i = 0; i < n; i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const r = cadre.w * (0.04 + rand() * 0.13);
    const k = fbm(x / 180, y / 180, 6, graine + 3, 3);
    const clair = k > 0.5;
    g.poly(
      flat(blob(x, y, r, r * (0.42 + rand() * 0.4), { seed: i * 13 + 5, points: 18, wobble: 0.3 })),
    ).fill({
      color: clair ? faceEclairee(pal.clair, 0.4) : ombreBleutee(pal.sombre, 0.35),
      alpha: 0.05 + Math.abs(k - 0.5) * 0.18,
    });
  }
}

/** Sapinière : litière d'aiguilles, mousses, racines affleurantes, cônes. */
function detailSapiniere(g: Graphics, cadre: Cadre, pal: PaletteSol, force: number): void {
  const rand = prng(4409);
  /* coussins de mousse */
  for (let i = 0; i < Math.round(58 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const r = 8 + rand() * 22;
    const poly = blob(x, y, r, r * 0.5, { seed: i * 7 + 1, points: 14, wobble: 0.34 });
    g.poly(flat(poly)).fill({ color: melanger(PALETTE.mousseSombre, PALETTE.vertHetre, 0.45), alpha: 0.24 });
    g.poly(flat(blob(x - r * 0.2, y - r * 0.16, r * 0.6, r * 0.28, { seed: i * 3, points: 11, wobble: 0.3 }))).fill({
      color: faceEclairee(pal.detail2, 0.5),
      alpha: 0.18,
    });
  }
  /* aiguilles : traits courts orientés au hasard, deux valeurs */
  for (let i = 0; i < Math.round(560 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const a = rand() * Math.PI;
    const l = 3 + rand() * 7;
    g.moveTo(x, y).lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    if (i % 3 === 0) {
      g.stroke({ color: faceEclairee(pal.detail, 0.6), width: 0.9, alpha: 0.3 });
    } else {
      g.stroke({ color: ombreBleutee(pal.detail, 0.6), width: 1, alpha: 0.24 });
    }
  }
  /* racines : fuseaux rampants, éclairés au nord-ouest */
  for (let i = 0; i < Math.round(14 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const a = rand() * Math.PI * 2;
    const l = 40 + rand() * 90;
    const racine = fuseau(x, y, x + Math.cos(a) * l, y + Math.sin(a) * l, 9 + rand() * 6, { seed: i * 5 });
    g.poly(flat(racine)).fill({ color: melanger(PALETTE.brunFougere, PALETTE.vertSapin, 0.35), alpha: 0.42 });
    const haut = racine.map((p) => ({ x: p.x - 1.1, y: p.y - 1.4 }));
    g.poly(flat(haut), true).stroke({ color: LIGHT.rim, width: 1, alpha: 0.16 });
  }
}

/** Prairie : touffes d'herbe à trois brins, fleurs d'ocre, sentes usées. */
function detailPrairie(g: Graphics, cadre: Cadre, pal: PaletteSol, force: number): void {
  const rand = prng(7717);
  for (let i = 0; i < Math.round(28 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const r = 24 + rand() * 60;
    g.poly(flat(blob(x, y, r, r * 0.4, { seed: i * 11 + 3, points: 16, wobble: 0.32 }))).fill({
      color: rand() > 0.5 ? faceEclairee(pal.clair, 0.4) : ombreBleutee(pal.fond, 0.34),
      alpha: 0.14,
    });
  }
  for (let i = 0; i < Math.round(430 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const h = 5 + rand() * 10;
    const pente = (rand() - 0.5) * 4;
    for (let b = -1; b <= 1; b += 1) {
      g.moveTo(x + b * 1.7, y);
      g.lineTo(x + b * 2.6 + pente, y - h * (1 - Math.abs(b) * 0.25));
    }
    g.stroke({
      color: b1(rand) ? faceEclairee(pal.clair, 0.65) : ombreBleutee(pal.sombre, 0.4),
      width: 1,
      alpha: 0.32,
    });
  }
  for (let i = 0; i < Math.round(70 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const r = 1.2 + rand() * 1.6;
    g.poly(flat(blob(x, y, r, r, { seed: i * 3 + 2, points: 7, wobble: 0.3 }))).fill({
      color: rand() > 0.4 ? melanger(PALETTE.ocre, LIGHT.chaude, 0.4) : melanger(PALETTE.parchemin, PALETTE.ocre, 0.4),
      alpha: 0.5,
    });
  }
}

function b1(rand: () => number): boolean {
  return rand() > 0.55;
}

/** Rocher : dalles fracturées, éboulis, lichen jaune. */
function detailRocher(g: Graphics, cadre: Cadre, pal: PaletteSol, force: number): void {
  const rand = prng(3313);
  for (let i = 0; i < Math.round(46 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const w = 26 + rand() * 80;
    const h = w * (0.35 + rand() * 0.4);
    const dalle: Poly = perturber(
      densifier(
        [
          { x: x - w / 2, y: y - h / 2 },
          { x: x + w / 2, y: y - h / 2 + (rand() - 0.5) * 8 },
          { x: x + w / 2 - 4, y: y + h / 2 },
          { x: x - w / 2 + 5, y: y + h / 2 - (rand() - 0.5) * 7 },
        ],
        12,
      ),
      1.6,
      i * 7 + 1,
    );
    const teinte = rand() > 0.5 ? faceEclairee(pal.fond, 0.34) : ombreBleutee(pal.fond, 0.4);
    g.poly(flat(dalle)).fill({ color: teinte, alpha: 0.32 });
    /* arête éclairée au nord-ouest, joint sombre au sud-est */
    g.moveTo(dalle[0].x, dalle[0].y);
    for (let k = 1; k < dalle.length / 2; k += 1) g.lineTo(dalle[k].x, dalle[k].y);
    g.stroke({ color: LIGHT.chaude, width: 1.2, alpha: 0.16 });
    g.poly(flat(dalle), true).stroke({ color: assombrir(pal.sombre, 0.4), width: 1.1, alpha: 0.4 });
  }
  for (let i = 0; i < Math.round(240 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const r = 1 + rand() * 3.4;
    g.poly(flat(blob(x, y, r, r * 0.72, { seed: i * 5 + 9, points: 8, wobble: 0.34 }))).fill({
      color: rand() > 0.5 ? faceEclairee(pal.detail, 0.5) : ombreBleutee(pal.detail, 0.5),
      alpha: 0.4,
    });
  }
  for (let i = 0; i < Math.round(34 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const r = 4 + rand() * 12;
    g.poly(flat(blob(x, y, r, r * 0.6, { seed: i * 13, points: 13, wobble: 0.38 }))).fill({
      color: melanger(PALETTE.ocre, PALETTE.vertHetre, 0.45),
      alpha: 0.2,
    });
  }
}

/** Zone humide : flaques à reflet, joncs, vase, mottes de tourbe. */
function detailHumide(g: Graphics, cadre: Cadre, pal: PaletteSol, force: number): void {
  const rand = prng(9091);
  for (let i = 0; i < Math.round(24 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const r = 18 + rand() * 54;
    const flaque = blob(x, y, r, r * (0.3 + rand() * 0.24), { seed: i * 17 + 4, points: 20, wobble: 0.28 });
    g.poly(flat(flaque)).fill({
      fill: degradeLineaire(
        [
          { offset: 0, color: melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.34) },
          { offset: 0.45, color: melanger(PALETTE.bleuProfond, PALETTE.bleuBrume, 0.35) },
          { offset: 1, color: ombreBleutee(PALETTE.bleuProfond, 0.6) },
        ],
        135,
      ),
      alpha: 0.62,
    });
    /* liseré clair côté lumière, jamais un contour complet */
    const bordNW = flaque.filter((p) => p.x - x + (p.y - y) < 0);
    if (bordNW.length > 2) {
      g.poly(flat(bordNW)).stroke({ color: LIGHT.chaude, width: 1.4, alpha: 0.3 });
    }
    g.poly(flat(flaque), true).stroke({ color: assombrir(pal.sombre, 0.35), width: 1.2, alpha: 0.44 });
  }
  for (let i = 0; i < Math.round(180 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const h = 9 + rand() * 20;
    const courbe = (rand() - 0.5) * 8;
    g.moveTo(x, y);
    g.quadraticCurveTo(x + courbe * 0.5, y - h * 0.6, x + courbe, y - h);
    g.stroke({
      color: rand() > 0.5 ? faceEclairee(pal.detail2, 0.55) : ombreBleutee(PALETTE.vertSapin, 0.4),
      width: 1.1,
      alpha: 0.36,
    });
  }
  for (let i = 0; i < Math.round(40 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const r = 6 + rand() * 16;
    g.poly(flat(blob(x, y, r, r * 0.52, { seed: i * 9 + 2, points: 13, wobble: 0.34 }))).fill({
      color: melanger(PALETTE.brunFougere, PALETTE.mousseSombre, 0.5),
      alpha: 0.3,
    });
  }
}

/** Cour de siège : pavés posés un à un, joints de sable, ornières. */
function detailCour(g: Graphics, cadre: Cadre, pal: PaletteSol, force: number): void {
  const rand = prng(5501);
  const pas = 34;
  for (let ry = cadre.y; ry < cadre.y + cadre.h; ry += pas) {
    const decal = ((ry / pas) | 0) % 2 === 0 ? 0 : pas / 2;
    for (let rx = cadre.x - decal; rx < cadre.x + cadre.w; rx += pas) {
      const w = pas * (0.78 + rand() * 0.16);
      const h = pas * (0.66 + rand() * 0.2);
      const pave: Poly = perturber(
        densifier(
          [
            { x: rx, y: ry },
            { x: rx + w, y: ry + 1 },
            { x: rx + w - 2, y: ry + h },
            { x: rx + 1, y: ry + h - 1 },
          ],
          9,
        ),
        1.1,
        (rx * 31 + ry * 17) | 0,
      );
      const v = valueNoise(rx / 60, ry / 60, 16, 91);
      const teinte = melanger(
        v > 0.5 ? faceEclairee(pal.fond, (v - 0.5) * 0.9) : ombreBleutee(pal.fond, (0.5 - v) * 0.9),
        pal.detail,
        0.16,
      );
      g.poly(flat(pave)).fill({ color: teinte, alpha: 0.72 });
      /* arête nord-ouest éclairée, arête sud-est dans l'ombre */
      g.moveTo(pave[0].x, pave[0].y).lineTo(pave[Math.floor(pave.length * 0.25)].x, pave[Math.floor(pave.length * 0.25)].y);
      g.stroke({ color: LIGHT.chaude, width: 1.1, alpha: 0.2 });
      g.poly(flat(pave), true).stroke({ color: ombreBleutee(pal.sombre, 0.7), width: 1.2, alpha: 0.42 });
    }
  }
  /* sable dans les joints et ornières de charroi */
  for (let i = 0; i < Math.round(260 * force); i += 1) {
    const x = cadre.x + rand() * cadre.w;
    const y = cadre.y + rand() * cadre.h;
    const r = 0.9 + rand() * 2.2;
    g.poly(flat(blob(x, y, r, r * 0.8, { seed: i * 7, points: 7, wobble: 0.3 }))).fill({
      color: melanger(PALETTE.parcheminOmbre, PALETTE.ocre, 0.4),
      alpha: 0.22,
    });
  }
  for (let i = 0; i < 3; i += 1) {
    const y = cadre.y + cadre.h * (0.26 + i * 0.24);
    g.moveTo(cadre.x, y);
    for (let x = cadre.x; x < cadre.x + cadre.w; x += 40) {
      g.lineTo(x, y + Math.sin(x / 90 + i) * 6);
    }
    g.stroke({ color: ombreBleutee(pal.sombre, 0.6), width: 5, alpha: 0.14 });
  }
}

const DETAILS: Readonly<Record<Ambiance, (g: Graphics, c: Cadre, p: PaletteSol, f: number) => void>> = {
  sapiniere: detailSapiniere,
  prairie: detailPrairie,
  rocher: detailRocher,
  humide: detailHumide,
  cour: detailCour,
};

/**
 * Gravure de la trame hexagonale : un sillon, pas un trait. L'arête tournée
 * vers le soleil prend la lumière chaude, l'arête opposée garde l'ombre froide.
 * La grille reste discrète — on la lit sans qu'elle domine le sol.
 */
function graverTrame(g: Graphics, geo: Geometrie, pal: PaletteSol): void {
  for (let row = 0; row < HEX_ROWS; row += 1) {
    for (let col = 0; col < HEX_COLS; col += 1) {
      const h: HexCoord = { col, row };
      const poly = geo.sommets(h, 0.02);
      const c = geo.local(h);
      /* légère variation de valeur par case : la trame se devine dans le sol */
      const v = valueNoise(col * 0.7, row * 0.7, 16, 331);
      g.poly(flat(poly)).fill({
        color: v > 0.5 ? faceEclairee(pal.fond, 0.4) : ombreBleutee(pal.fond, 0.4),
        alpha: 0.035 + Math.abs(v - 0.5) * 0.05,
      });
      /* creux : arêtes sud-est */
      for (let i = 0; i < 6; i += 1) {
        const a = poly[i];
        const b = poly[(i + 1) % 6];
        const mx = (a.x + b.x) / 2 - c.x;
        const my = (a.y + b.y) / 2 - c.y;
        const versSoleil = -(mx * LIGHT.toSun.x + my * LIGHT.toSun.y);
        g.moveTo(a.x, a.y).lineTo(b.x, b.y);
        if (versSoleil > 0) {
          g.stroke({ color: ombreBleutee(pal.sombre, 0.85), width: 1.5, alpha: 0.3 });
        } else {
          g.stroke({ color: LIGHT.chaude, width: 1.1, alpha: 0.12 });
        }
      }
    }
  }
}

/* ═════════════════════════ Le champ de bataille ══════════════════════════ */

/** Un obstacle posé, avec son oscillation d'ambiance propre. */
interface PropPose {
  sprite: Sprite;
  key: PropKey;
  variante: number;
  base: { x: number; y: number };
  hex: HexCoord;
}

/**
 * Le sol, sa trame gravée et les obstacles. Le tout vit dans le conteneur
 * étiré du plateau : sur téléphone en portrait la grille s'allonge un peu.
 */
export class ChampDeBataille {
  readonly container = new Container();
  /** couche des obstacles, triée en profondeur, au-dessus du sol */
  readonly obstacles = new Container();
  readonly ambiance: Ambiance;

  private texture: RenderTexture | null = null;
  private readonly sol = new Sprite();
  private readonly poses: PropPose[] = [];
  private horloge = 0;

  constructor(
    private readonly geo: Geometrie,
    private readonly atlas: ArtAtlas,
    private readonly combat: CombatState,
    private readonly reducedMotion: boolean,
  ) {
    this.ambiance = ambianceDe(combat.region, combat.terrain, combat.siege);
    this.container.label = 'champ';
    this.obstacles.sortableChildren = true;
    this.container.addChild(this.sol, this.obstacles);
  }

  /** Compose le sol dans une `RenderTexture` : une seule passe de rendu. */
  peindre(renderer: Renderer, quality: 'basse' | 'moyenne' | 'haute'): void {
    const pal = PALETTES[this.ambiance];
    const force = densite(quality);
    const boite = this.geo.boite;
    const marge = Math.round(this.geo.taille * 0.9);
    const cadre: Cadre = {
      x: 0,
      y: 0,
      w: Math.ceil(boite.largeur + marge * 2),
      h: Math.ceil(boite.hauteur + marge * 2),
    };

    const racine = new Container();
    const g = new Graphics();
    racine.addChild(g);

    /* 1 — dégradé de biome, orienté 315° : le fond du champ n'est jamais plat */
    g.rect(cadre.x, cadre.y, cadre.w, cadre.h).fill({
      fill: degradeLineaire(
        [
          { offset: 0, color: melanger(faceEclairee(pal.clair, 0.55), LIGHT.brume, 0.34) },
          { offset: 0.24, color: faceEclairee(pal.fond, 0.3) },
          { offset: 0.56, color: pal.fond },
          { offset: 0.82, color: ombreBleutee(pal.fond, 0.34) },
          { offset: 1, color: ombreBleutee(pal.sombre, 0.5) },
        ],
        118,
      ),
    });

    /* 2 — nappes de valeur et lisières douces */
    nappes(g, cadre, pal, 20250816, force);

    /* 3 — matière : le pinceau de terrain de l'atlas, répété sans couture */
    const brosse = this.atlas.terrainBrush(pal.pinceau);
    const motif = new FillPattern({ texture: brosse, repetition: 'repeat' });
    motif.setTransform(new Matrix().scale(0.72, 0.72));
    g.rect(cadre.x, cadre.y, cadre.w, cadre.h).fill({ fill: motif, alpha: pal.matiereAlpha });

    /* 4 — semis de détail propre à l'ambiance */
    const detail = new Graphics();
    DETAILS[this.ambiance](detail, cadre, pal, force);
    racine.addChild(detail);

    /* 5 — gravure de la trame, dans le repère du plateau */
    const trame = new Graphics();
    trame.position.set(marge - boite.x, marge - boite.y);
    graverTrame(trame, this.geo, pal);
    racine.addChild(trame);

    /* 6 — perspective atmosphérique : le fond du champ part vers le bleu */
    const voile = new Graphics();
    voile.rect(cadre.x, cadre.y, cadre.w, cadre.h * 0.62).fill({
      fill: degradeLineaire(
        [
          { offset: 0, color: LIGHT.brume, alpha: 0.34 },
          { offset: 0.55, color: LIGHT.brume, alpha: 0.12 },
          { offset: 1, color: LIGHT.brume, alpha: 0 },
        ],
        90,
      ),
    });
    /* 7 — vignettage et grain de parchemin */
    voile.rect(cadre.x, cadre.y, cadre.w, cadre.h).fill({
      fill: degradeRadial([
        { offset: 0, color: LIGHT.ombrePortee, alpha: 0 },
        { offset: 0.62, color: LIGHT.ombrePortee, alpha: 0.05 },
        { offset: 1, color: LIGHT.ombrePortee, alpha: 0.28 },
      ]),
    });
    const parch = new FillPattern({ texture: this.atlas.materials.parchemin, repetition: 'repeat' });
    parch.setTransform(new Matrix().scale(0.85, 0.85));
    voile.rect(cadre.x, cadre.y, cadre.w, cadre.h).fill({ fill: parch, alpha: 0.05 });
    const grainTex = new FillPattern({ texture: this.atlas.materials.grain, repetition: 'repeat' });
    voile.rect(cadre.x, cadre.y, cadre.w, cadre.h).fill({ fill: grainTex, alpha: 0.07 });
    racine.addChild(voile);

    const rt = RenderTexture.create({
      width: cadre.w,
      height: cadre.h,
      antialias: true,
      resolution: 1,
    });
    rt.source.label = 'champ-de-bataille';
    renderer.render({ container: racine, target: rt, clear: true });
    racine.destroy({ children: true });

    this.texture?.destroy(true);
    this.texture = rt;
    this.sol.texture = rt;
    this.sol.position.set(boite.x - marge, boite.y - marge);

    this.poserObstacles();
  }

  /* ────────────────────────────── Obstacles ────────────────────────────── */

  /**
   * Chaque obstacle du moteur reçoit un prop de l'atlas. Rien n'est inventé :
   * la liste, les cases et les états viennent de `CombatState.obstacles`.
   */
  private poserObstacles(): void {
    this.obstacles.removeChildren().forEach((c) => c.destroy());
    this.poses.length = 0;
    const t = this.geo.taille;

    for (const o of this.combat.obstacles) {
      if (o.kind === 'mur' || o.kind === 'porte' || o.kind === 'tour') continue; // sièges : voir siege.ts
      const { key, echelle } = propPourObstacle(o, this.ambiance);
      const variante = hexKey(o.at) % 4;
      const tex = this.atlas.prop(key, variante);
      const ancre = this.atlas.propAnchor(key, variante);
      const s = new Sprite(tex);
      s.anchor.set(ancre.x / tex.width, ancre.y / tex.height);
      const c = this.geo.local(o.at);
      const k = ((t * 2.1) / tex.height) * echelle;
      s.scale.set(k);
      s.position.set(c.x, c.y + t * 0.28);
      s.zIndex = o.at.row * 100 + o.at.col;
      /* perspective atmosphérique : le haut du champ s'efface vers la brume */
      const profondeur = 1 - o.at.row / (HEX_ROWS - 1);
      s.tint = melanger(0xffffff, LIGHT.brume, profondeur * 0.22);
      this.obstacles.addChild(s);
      this.poses.push({ sprite: s, key, variante, base: { x: s.x, y: s.y }, hex: o.at });
    }

    /* fossés : creusés dans le sol, pas posés dessus */
    const fosses = this.combat.obstacles.filter((o) => o.kind === 'fosse');
    if (fosses.length > 0) {
      const g = new Graphics();
      g.zIndex = -1;
      for (const o of fosses) {
        const c = this.geo.local(o.at);
        const poly = blob(c.x, c.y, t * 0.82, t * 0.72, { seed: hexKey(o.at) + 7, points: 16, wobble: 0.24 });
        g.poly(flat(poly)).fill({ color: ombreBleutee(PALETTE.brunFougere, 0.9), alpha: 0.75 });
        g.poly(flat(blob(c.x, c.y + t * 0.1, t * 0.6, t * 0.44, { seed: 5, points: 14, wobble: 0.3 }))).fill({
          color: LIGHT.ombrePortee,
          alpha: 0.6,
        });
        const nw = poly.filter((p) => p.x - c.x + (p.y - c.y) < 0);
        if (nw.length > 2) g.poly(flat(nw)).stroke({ color: LIGHT.chaude, width: 1.4, alpha: 0.28 });
      }
      this.obstacles.addChild(g);
    }
  }

  /** Loi n°7 : le décor n'est jamais parfaitement immobile. */
  update(dtMs: number): void {
    if (this.reducedMotion) return;
    this.horloge += dtMs / 1000;
    for (const p of this.poses) {
      const o = oscillationProp(p.key, p.variante, this.horloge, p.hex.col, p.hex.row);
      p.sprite.x = p.base.x + o.dx;
      p.sprite.y = p.base.y + o.dy;
      p.sprite.rotation = o.rot;
    }
  }

  destroy(): void {
    this.texture?.destroy(true);
    this.texture = null;
    this.container.destroy({ children: true });
  }
}

/** Le prop de l'atlas qui incarne un obstacle du moteur. */
function propPourObstacle(o: CombatObstacle, ambiance: Ambiance): { key: PropKey; echelle: number } {
  switch (o.kind) {
    case 'rocher':
      return { key: 'rocher', echelle: 1.05 };
    case 'souche':
      return { key: 'souche', echelle: 1.1 };
    case 'ronce':
      return { key: ambiance === 'sapiniere' ? 'fougere' : 'buisson', echelle: 1 };
    case 'fosse':
      return { key: 'rocher', echelle: 0.4 };
    default:
      return { key: ambiance === 'rocher' ? 'rocher' : 'buisson', echelle: 1 };
  }
}

/** Couleur de brume appliquée à une ligne, pour la perspective atmosphérique. */
export function brumeDeLigne(row: number): number {
  const t = 1 - row / (HEX_ROWS - 1);
  return melanger(0xffffff, LIGHT.brume, t * 0.2);
}

/** Petite aide déterministe partagée par les décors. */
export function alea(a: number, b: number, graine = 0): number {
  return hash2(a, b, graine);
}

export { PALETTES as PALETTES_SOL };
export type { PaletteSol };
