/**
 * `render/terrain.ts` — la peinture du sol du Forez.
 *
 * Le terrain n'est jamais dessiné à l'image : il est **peint une fois par bloc
 * de 32 × 32 cases** dans un canevas hors écran, converti en texture, puis
 * affiché en sprite. C'est la condition des 60 images par seconde (bible
 * artistique §4) et la seule façon de s'offrir un vrai travail par pixel.
 *
 * Strates d'un bloc, dans l'ordre imposé par la bible :
 *   1. gradient de biome par altitude (aucune case n'a la couleur de sa voisine) ;
 *   2. ombrage de relief calculé sur `world.elevation`, lumière 315° / 38° ;
 *   3. occlusion ambiante de vallée (différence au relief flouté) ;
 *   4. bruit de matière à deux octaves ;
 *   5. lisières adoucies : l'échantillonnage des couleurs est **gauchi** par un
 *      champ de bruit basse fréquence, donc aucune frontière ne suit la grille ;
 *   6. chemins et chaussée tracés par splines quadratiques, ornière centrale et
 *      bord clair du côté du soleil ;
 *   7. cours d'eau, avec liseré clair sur la rive nord-ouest ;
 *   8. grain de parchemin global à 0,05.
 *
 * Aucune couleur n'est inventée : tout descend de `art/palette.ts`.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import { CELL_ROAD } from '@auvergne/engine';
import type { WorldMap } from '@auvergne/engine';
import type { ViewQuality } from '../view-contract.js';
import { LIGHT, PALETTE, assombrir, melanger } from '../art/palette.js';
import {
  BRUME,
  CHAUDE,
  FROIDE,
  TER,
  adoucir,
  alea,
  borne,
  champs,
  estVoie,
  xEcran,
  yEcran,
} from './commun.js';
import type { Cadrage } from './commun.js';

/** Côté d'un bloc, en cases. Imposé par `BLOCK_SIZE` du moteur. */
const BLOC = 32;
/** Marge de cases échantillonnées autour d'un bloc, pour des lisières continues. */
const MARGE = 3;
/** Taille de la sous-grille échantillonnée. */
const G = BLOC + 2 * MARGE;
/** Mètres par case (la grille du Forez est à ~48 m). */
const METRES_PAR_CASE = 48;
/** Exagération du relief : sans elle, un massif réel paraît plat en 2D. */
const EXAGERATION = 2.6;

/* Vecteur unitaire surface → soleil, azimut 315°, élévation 38° (loi n°2). */
const SOLEIL_X = -Math.cos((38 * Math.PI) / 180) * Math.SQRT1_2;
const SOLEIL_Y = -Math.cos((38 * Math.PI) / 180) * Math.SQRT1_2;
const SOLEIL_Z = Math.sin((38 * Math.PI) / 180);

interface Bloc {
  readonly cle: string;
  readonly bx: number;
  readonly by: number;
  readonly res: number;
  readonly texture: Texture;
  readonly sprite: Sprite;
  usage: number;
}

export interface StatsTerrain {
  /** blocs peints depuis le montage */
  blocs: number;
  /** durée du dernier bloc peint, en millisecondes */
  dernierMs: number;
  /** durée moyenne d'un bloc, en millisecondes */
  moyenneMs: number;
  /** blocs gardés en cache */
  enCache: number;
  /** blocs restant à peindre */
  enAttente: number;
}

/* ─────────────────────────── Matière de parchemin ───────────────────────── */

let motifParchemin: HTMLCanvasElement | null = null;

/**
 * Petite feuille de parchemin répétable : fibres longues, piqûres, veines.
 * Elle est posée en dernier sur chaque bloc, à 5 % — c'est ce qui unifie la
 * carte et lui donne son âge.
 */
function parchemin(): HTMLCanvasElement {
  if (motifParchemin) return motifParchemin;
  const el = document.createElement('canvas');
  el.width = 128;
  el.height = 128;
  const ctx = el.getContext('2d');
  if (!ctx) return el;
  ctx.fillStyle = '#8a8175';
  ctx.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 520; i += 1) {
    const x = alea(i, 3, 11) * 128;
    const y = alea(i, 7, 23) * 128;
    const l = 4 + alea(i, 11, 5) * 26;
    const clair = alea(i, 13, 17) > 0.5;
    ctx.strokeStyle = clair ? 'rgba(232,220,192,0.42)' : 'rgba(60,52,40,0.34)';
    ctx.lineWidth = alea(i, 19, 3) < 0.8 ? 1 : 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo((x + l) % 128, (y + (alea(i, 23, 9) - 0.5) * 5) % 128);
    ctx.stroke();
  }
  for (let i = 0; i < 240; i += 1) {
    const x = alea(i, 29, 31) * 128;
    const y = alea(i, 37, 41) * 128;
    ctx.fillStyle = alea(i, 43, 47) > 0.55 ? 'rgba(36,28,20,0.30)' : 'rgba(240,230,205,0.30)';
    ctx.fillRect(x, y, 1, 1);
  }
  motifParchemin = el;
  return el;
}

/* ────────────────────────────── Couleur d'une case ──────────────────────── */

/**
 * Gradient de biome par altitude. Chaque terrain a une teinte de fond de vallée
 * et une teinte de crête ; entre les deux, l'altitude réelle du MNT décide.
 */
function couleurBiome(terrain: number, alt: number, pente: number): number {
  const t = borne((alt - 470) / 800, 0, 1);
  let c: number;
  switch (terrain) {
    case TER.foret: {
      const hetraie = melanger(PALETTE.vertSapin, PALETTE.vertHetre, 0.46);
      const sapiniere = melanger(PALETTE.vertSapin, PALETTE.bleuProfond, 0.24);
      c = melanger(hetraie, sapiniere, t);
      break;
    }
    case TER.pente: {
      const bas = melanger(PALETTE.brunFougere, PALETTE.vertHetre, 0.34);
      const haut = melanger(PALETTE.granitClair, PALETTE.mousseSombre, 0.34);
      c = melanger(bas, haut, t);
      break;
    }
    case TER.rocher: {
      const bas = melanger(PALETTE.granitAnthracite, PALETTE.brunFougere, 0.3);
      const haut = melanger(PALETTE.granitClair, PALETTE.bleuBrume, 0.24);
      c = melanger(bas, haut, t);
      break;
    }
    case TER.humide: {
      const tourbe = melanger(PALETTE.mousseSombre, PALETTE.brunFougere, 0.44);
      c = melanger(tourbe, PALETTE.bleuProfond, 0.1 + t * 0.12);
      break;
    }
    case TER.eau: {
      c = melanger(PALETTE.bleuProfond, assombrir(PALETTE.bleuProfond, 0.35), 0.45);
      break;
    }
    default: {
      /* prairie, et sous-sol des voies */
      const basse = melanger(PALETTE.vertHetre, PALETTE.ocre, 0.22);
      const haute = melanger(PALETTE.vertHetre, PALETTE.bleuBrume, 0.28);
      c = melanger(basse, haute, t);
      break;
    }
  }
  /* La roche affleure dès que la pente se redresse. */
  if (pente > 11 && terrain !== TER.eau) {
    c = melanger(c, PALETTE.granitClair, Math.min(0.34, (pente - 11) / 46));
  }
  return c;
}

/* ─────────────────────────────── Le peintre ─────────────────────────────── */

export class PeintreTerrain {
  readonly couche = new Container();

  private readonly cache = new Map<string, Bloc>();
  private readonly attente: { bx: number; by: number; res: number; distance: number }[] = [];
  private readonly ch = champs();
  private readonly blocsCols: number;
  private readonly blocsRows: number;
  private readonly maxCache: number;
  private readonly resMax: number;
  private horloge = 0;

  private statsBlocs = 0;
  private statsCumul = 0;
  private statsDernier = 0;

  constructor(
    private readonly world: WorldMap,
    quality: ViewQuality,
  ) {
    this.couche.label = 'terrain';
    this.blocsCols = Math.ceil(world.cols / BLOC);
    this.blocsRows = Math.ceil(world.rows / BLOC);
    this.resMax = quality === 'basse' ? 8 : quality === 'moyenne' ? 12 : 16;
    this.maxCache = quality === 'basse' ? 28 : 56;
  }

  get stats(): StatsTerrain {
    return {
      blocs: this.statsBlocs,
      dernierMs: Math.round(this.statsDernier * 100) / 100,
      moyenneMs: this.statsBlocs === 0 ? 0 : Math.round((this.statsCumul / this.statsBlocs) * 100) / 100,
      enCache: this.cache.size,
      enAttente: this.attente.length,
    };
  }

  /** Nombre de pixels peints par case au zoom donné : c'est le niveau de détail. */
  private resolutionPour(zoom: number): number {
    if (zoom <= 9) return Math.min(5, this.resMax);
    if (zoom <= 14) return Math.min(8, this.resMax);
    if (zoom <= 24) return Math.min(12, this.resMax);
    return Math.min(16, this.resMax);
  }

  /**
   * Place les blocs visibles, met les autres de côté, et met en file ceux qui
   * manquent. Aucune peinture ici : la peinture est budgétée par image.
   */
  majVue(v: Cadrage): void {
    const res = this.resolutionPour(v.zoom);
    const bx0 = Math.max(0, Math.floor((v.col - v.largeur / (2 * v.zoom)) / BLOC));
    const bx1 = Math.min(this.blocsCols - 1, Math.floor((v.col + v.largeur / (2 * v.zoom)) / BLOC));
    const by0 = Math.max(0, Math.floor((v.row - v.hauteur / (2 * v.zoom)) / BLOC));
    const by1 = Math.min(this.blocsRows - 1, Math.floor((v.row + v.hauteur / (2 * v.zoom)) / BLOC));

    this.horloge += 1;
    this.attente.length = 0;

    for (const bloc of this.cache.values()) bloc.sprite.visible = false;

    for (let by = by0; by <= by1; by += 1) {
      for (let bx = bx0; bx <= bx1; bx += 1) {
        const cle = `${res}:${bx},${by}`;
        const bloc = this.cache.get(cle);
        if (bloc) {
          bloc.usage = this.horloge;
          this.placer(bloc, v);
          continue;
        }
        /* Repli : un bloc déjà peint à une autre résolution évite le trou. */
        const secours = this.secours(bx, by, res);
        if (secours) {
          secours.usage = this.horloge;
          this.placer(secours, v);
        }
        const dc = (bx + 0.5) * BLOC - v.col;
        const dr = (by + 0.5) * BLOC - v.row;
        this.attente.push({ bx, by, res, distance: dc * dc + dr * dr });
      }
    }
    this.attente.sort((a, b) => a.distance - b.distance);
    this.purger();
  }

  /** Un bloc déjà peint au même endroit, quelle que soit sa résolution. */
  private secours(bx: number, by: number, resExclue: number): Bloc | null {
    for (const bloc of this.cache.values()) {
      if (bloc.bx === bx && bloc.by === by && bloc.res !== resExclue) return bloc;
    }
    return null;
  }

  private placer(bloc: Bloc, v: Cadrage): void {
    const s = bloc.sprite;
    s.visible = true;
    s.x = xEcran(v, bloc.bx * BLOC);
    s.y = yEcran(v, bloc.by * BLOC);
    /* Un pixel de recouvrement : sans lui, un liséré de fond apparaît entre
       deux blocs dès que la caméra tombe sur une demi-position. */
    s.width = BLOC * v.zoom + 1;
    s.height = BLOC * v.zoom + 1;
  }

  /**
   * Peint les blocs en attente tant que le budget de l'image le permet.
   * Retourne le nombre de blocs peints.
   */
  peindreEnAttente(budgetMs: number, v: Cadrage): number {
    if (this.attente.length === 0) return 0;
    const debut = performance.now();
    let faits = 0;
    while (this.attente.length > 0) {
      const t = this.attente[0];
      const bloc = this.peindreBloc(t.bx, t.by, t.res);
      this.attente.shift();
      this.placer(bloc, v);
      faits += 1;
      if (performance.now() - debut >= budgetMs) break;
    }
    if (faits > 0) this.purger();
    return faits;
  }

  /** Peint tout ce qui reste, sans budget : réservé au premier cadrage. */
  toutPeindre(v: Cadrage, plafond = 40): number {
    let faits = 0;
    while (this.attente.length > 0 && faits < plafond) {
      const t = this.attente[0];
      const bloc = this.peindreBloc(t.bx, t.by, t.res);
      this.attente.shift();
      this.placer(bloc, v);
      faits += 1;
    }
    this.purger();
    return faits;
  }

  /** Libère les blocs les plus anciens au-delà de la contenance du cache. */
  private purger(): void {
    if (this.cache.size <= this.maxCache) return;
    const tries = [...this.cache.values()].sort((a, b) => a.usage - b.usage);
    let aRetirer = this.cache.size - this.maxCache;
    for (const bloc of tries) {
      if (aRetirer <= 0) break;
      if (bloc.usage === this.horloge) continue;
      this.cache.delete(bloc.cle);
      bloc.sprite.destroy();
      bloc.texture.destroy(true);
      aRetirer -= 1;
    }
  }

  /* ─────────────────────────── La peinture d'un bloc ────────────────────── */

  private peindreBloc(bx: number, by: number, res: number): Bloc {
    const debut = performance.now();
    const w = this.world;
    const cols = w.cols;
    const rows = w.rows;
    const col0 = bx * BLOC - MARGE;
    const row0 = by * BLOC - MARGE;
    const n = G * G;

    const alt = new Float32Array(n);
    const ter = new Uint8Array(n);
    const dedans = new Uint8Array(n);
    const cr = new Float32Array(n);
    const cg = new Float32Array(n);
    const cb = new Float32Array(n);
    const eau = new Float32Array(n);

    for (let j = 0; j < G; j += 1) {
      const wr = row0 + j;
      const rc = borne(wr, 0, rows - 1);
      for (let i = 0; i < G; i += 1) {
        const wc = col0 + i;
        const cc = borne(wc, 0, cols - 1);
        const k = j * G + i;
        const index = rc * cols + cc;
        const a = w.elevation[index];
        const t = w.terrain[index];
        alt[k] = a;
        ter[k] = t;
        dedans[k] = wc === cc && wr === rc ? 1 : 0;
        eau[k] = t === TER.eau ? 1 : 0;
        /* Sous une voie, on peint le sol d'à côté : la chaussée est tracée
           ensuite en spline, jamais en cases carrées. */
        const sol = estVoie(t) ? this.solSousVoie(cc, rc) : t;
        let couleur = couleurBiome(sol, a, w.slope[index]);
        /* Bruit de teinte par case : deux cases voisines ne sont jamais
           exactement de la même couleur (loi n°1). */
        const jitter = alea(cc, rc, 17) - 0.5;
        couleur = melanger(couleur, jitter > 0 ? LIGHT.chaude : LIGHT.froide, Math.abs(jitter) * 0.16);
        cr[k] = (couleur >> 16) & 255;
        cg[k] = (couleur >> 8) & 255;
        cb[k] = couleur & 255;
      }
    }

    /* Relief flouté : sa différence à l'altitude donne l'occlusion de vallée. */
    const flou = this.flouter(this.flouter(alt));

    /* Ombrage de relief. 1 = plat éclairé, < 1 = versant à l'ombre. */
    const ombre = new Float32Array(n);
    for (let j = 0; j < G; j += 1) {
      const jh = j > 0 ? j - 1 : 0;
      const jb = j < G - 1 ? j + 1 : G - 1;
      for (let i = 0; i < G; i += 1) {
        const ig = i > 0 ? i - 1 : 0;
        const id = i < G - 1 ? i + 1 : G - 1;
        const dzdx = ((alt[j * G + id] - alt[j * G + ig]) / (2 * METRES_PAR_CASE)) * EXAGERATION;
        const dzdy = ((alt[jb * G + i] - alt[jh * G + i]) / (2 * METRES_PAR_CASE)) * EXAGERATION;
        const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        const dot = (-dzdx * SOLEIL_X - dzdy * SOLEIL_Y + SOLEIL_Z) / len;
        ombre[j * G + i] = borne(dot / SOLEIL_Z, 0.18, 1.62);
      }
    }

    const taille = BLOC * res;
    const el = document.createElement('canvas');
    el.width = taille;
    el.height = taille;
    const ctx = el.getContext('2d', { willReadFrequently: false });
    if (!ctx) throw new Error('Contexte 2D indisponible : le terrain ne peut être peint.');

    const img = ctx.createImageData(taille, taille);
    const px = img.data;
    const inv = 1 / res;
    const ch = this.ch;

    for (let py = 0; py < taille; py += 1) {
      const gy = MARGE + (py + 0.5) * inv;
      const wy = row0 + gy;
      let p = py * taille * 4;
      for (let pxi = 0; pxi < taille; pxi += 1, p += 4) {
        const gx = MARGE + (pxi + 0.5) * inv;
        const wx = col0 + gx;

        /* Strate 5 — gauchissement des lisières : l'échantillonnage lui-même
           serpente, donc aucune frontière de biome ne suit la grille. */
        const wa = ch.gauche.doux(wx * 1.15, wy * 1.15);
        const wb = ch.gaucheB.doux(wx * 1.15, wy * 1.15);
        const sx = gx - 0.5 + wa * 0.9;
        const sy = gy - 0.5 + wb * 0.9;

        const dans = dedans[
          borne(Math.round(gy - 0.5), 0, G - 1) * G + borne(Math.round(gx - 0.5), 0, G - 1)
        ];
        if (dans === 0) {
          px[p + 3] = 0;
          continue;
        }

        /* Strate 1 — couleur de biome, échantillonnée en douceur. */
        const x0 = borne(Math.floor(sx), 0, G - 2);
        const y0 = borne(Math.floor(sy), 0, G - 2);
        const fx = adoucir(sx - x0);
        const fy = adoucir(sy - y0);
        const k00 = y0 * G + x0;
        const k10 = k00 + 1;
        const k01 = k00 + G;
        const k11 = k01 + 1;
        const w00 = (1 - fx) * (1 - fy);
        const w10 = fx * (1 - fy);
        const w01 = (1 - fx) * fy;
        const w11 = fx * fy;
        let r = cr[k00] * w00 + cr[k10] * w10 + cr[k01] * w01 + cr[k11] * w11;
        let g = cg[k00] * w00 + cg[k10] * w10 + cg[k01] * w01 + cg[k11] * w11;
        let b = cb[k00] * w00 + cb[k10] * w10 + cb[k01] * w01 + cb[k11] * w11;

        /* Strate 2 — ombrage de relief, à peine gauchi pour rester lisible. */
        const hx = borne(gx - 0.5 + wa * 0.22, 0, G - 1.001);
        const hy = borne(gy - 0.5 + wb * 0.22, 0, G - 1.001);
        const hx0 = Math.floor(hx);
        const hy0 = Math.floor(hy);
        const hfx = hx - hx0;
        const hfy = hy - hy0;
        const h00 = hy0 * G + hx0;
        const sh =
          ombre[h00] * (1 - hfx) * (1 - hfy) +
          ombre[h00 + 1] * hfx * (1 - hfy) +
          ombre[h00 + G] * (1 - hfx) * hfy +
          ombre[h00 + G + 1] * hfx * hfy;

        /* Strate 3 — occlusion ambiante : les fonds de vallée se referment. */
        const creux = flou[h00] - alt[h00];
        const ao = borne(creux / 26, -0.7, 1);

        /* Strate 4 — bruit de matière, deux octaves. */
        const o1 = ch.matiere.doux(wx * 3.3, wy * 3.3);
        const o2 = ch.grain.brut(wx * 12.7 + 41, wy * 12.7 + 17);
        const matiere = o1 * 0.62 + o2 * 0.38;

        let v = sh * (1 - ao * 0.17) * (1 + matiere * 0.1);
        v = borne(v, 0.4, 1.55);
        r *= v;
        g *= v;
        b *= v;

        /* Loi n°3 — la lumière tire vers l'ambre, l'ombre vers le bleu. */
        if (v > 1) {
          const t = Math.min(1, (v - 1) * 1.5) * 0.3;
          r += (CHAUDE.r - r) * t;
          g += (CHAUDE.g - g) * t;
          b += (CHAUDE.b - b) * t;
        } else {
          const t = Math.min(1, (1 - v) * 1.7) * 0.38;
          r += (FROIDE.r - r) * t;
          g += (FROIDE.g - g) * t;
          b += (FROIDE.b - b) * t;
        }

        /* Strate 7 — l'eau : miroitement et liseré clair sur la rive au soleil. */
        const e =
          eau[k00] * w00 + eau[k10] * w10 + eau[k01] * w01 + eau[k11] * w11;
        if (e > 0.35) {
          const miroir = ch.matiere.doux(wx * 2.4, wy * 6.1);
          const eclat = 0.5 + 0.5 * Math.sin(wy * 5.7 + miroir * 2.4);
          const t = adoucir((e - 0.35) / 0.5);
          r += (CHAUDE.r * 0.42 - r) * t * 0.1 * eclat;
          g += (CHAUDE.g * 0.5 - g) * t * 0.1 * eclat;
          b += (CHAUDE.b * 0.72 - b) * t * 0.12 * eclat;
          const nx = borne(sx - 0.62, 0, G - 2);
          const ny = borne(sy - 0.62, 0, G - 2);
          const rive = eau[Math.floor(ny) * G + Math.floor(nx)];
          if (rive < 0.5 && e > 0.55) {
            r += (CHAUDE.r - r) * 0.3;
            g += (CHAUDE.g - g) * 0.3;
            b += (CHAUDE.b - b) * 0.26;
          }
        }

        /* Loi n°5 — perspective atmosphérique : les hauteurs bleuissent. */
        const altP = alt[h00];
        const voile = borne((altP - 660) / 2150, 0, 0.28);
        if (voile > 0) {
          r += (BRUME.r - r) * voile;
          g += (BRUME.g - g) * voile;
          b += (BRUME.b - b) * voile;
        }

        px[p] = r < 0 ? 0 : r > 255 ? 255 : r;
        px[p + 1] = g < 0 ? 0 : g > 255 ? 255 : g;
        px[p + 2] = b < 0 ? 0 : b > 255 ? 255 : b;
        px[p + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);

    /* Strate 6 — les voies, en splines. */
    this.tracerVoies(ctx, bx, by, res, col0, row0, ter, dedans);

    /* Strate 8 — le grain de parchemin, à 0,05. */
    const motif = ctx.createPattern(parchemin(), 'repeat');
    if (motif) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.globalCompositeOperation = 'overlay';
      const ox = -((bx * BLOC * res) % 128);
      const oy = -((by * BLOC * res) % 128);
      ctx.translate(ox, oy);
      ctx.fillStyle = motif;
      ctx.fillRect(-ox, -oy, taille, taille);
      ctx.restore();
    }

    const texture = Texture.from(el);
    texture.source.scaleMode = 'linear';
    texture.source.label = `terrain_${bx}_${by}_${res}`;
    const sprite = new Sprite(texture);
    sprite.label = `bloc_${bx}_${by}`;
    this.couche.addChild(sprite);

    const cle = `${res}:${bx},${by}`;
    const bloc: Bloc = { cle, bx, by, res, texture, sprite, usage: this.horloge };
    this.cache.set(cle, bloc);

    const duree = performance.now() - debut;
    this.statsBlocs += 1;
    this.statsCumul += duree;
    this.statsDernier = duree;
    return bloc;
  }

  /** Terrain à peindre sous une case de voie : celui qui domine autour. */
  private solSousVoie(col: number, row: number): number {
    const w = this.world;
    const comptes = new Map<number, number>();
    for (let dr = -1; dr <= 1; dr += 1) {
      for (let dc = -1; dc <= 1; dc += 1) {
        const c = borne(col + dc, 0, w.cols - 1);
        const r = borne(row + dr, 0, w.rows - 1);
        const t = w.terrain[r * w.cols + c];
        if (estVoie(t)) continue;
        comptes.set(t, (comptes.get(t) ?? 0) + 1);
      }
    }
    let meilleur = TER.prairie;
    let score = 0;
    for (const [t, c] of comptes) {
      if (c > score) {
        score = c;
        meilleur = t;
      }
    }
    return meilleur;
  }

  /**
   * Chaussée et chemins. Pour chaque case de voie, on relie les milieux des
   * segments vers ses voisines par une quadratique passant par le centre : la
   * courbe est continue, jamais un escalier de cases.
   */
  private tracerVoies(
    ctx: CanvasRenderingContext2D,
    bx: number,
    by: number,
    res: number,
    col0: number,
    row0: number,
    ter: Uint8Array,
    dedans: Uint8Array,
  ): void {
    const w = this.world;
    const chemins = new Path2D();
    const chaussees = new Path2D();
    let aQuelqueChose = false;

    const cx = (i: number): number => (i - MARGE + 0.5) * res;
    const cy = (j: number): number => (j - MARGE + 0.5) * res;

    for (let j = 0; j < G; j += 1) {
      for (let i = 0; i < G; i += 1) {
        const k = j * G + i;
        const wc = col0 + i;
        const wr = row0 + j;
        if (wc < 0 || wr < 0 || wc >= w.cols || wr >= w.rows) continue;
        const flags = w.flags[wr * w.cols + wc];
        const voie = estVoie(ter[k]) || (flags & CELL_ROAD) !== 0;
        if (!voie) continue;
        const majeure = ter[k] === TER.route;
        const cible = majeure ? chaussees : chemins;
        const voisins: { i: number; j: number }[] = [];
        for (let dj = -1; dj <= 1; dj += 1) {
          for (let di = -1; di <= 1; di += 1) {
            if (di === 0 && dj === 0) continue;
            const ni = i + di;
            const nj = j + dj;
            if (ni < 0 || nj < 0 || ni >= G || nj >= G) continue;
            const nwc = col0 + ni;
            const nwr = row0 + nj;
            if (nwc < 0 || nwr < 0 || nwc >= w.cols || nwr >= w.rows) continue;
            const nk = nj * G + ni;
            const nf = w.flags[nwr * w.cols + nwc];
            if (estVoie(ter[nk]) || (nf & CELL_ROAD) !== 0) voisins.push({ i: ni, j: nj });
          }
        }
        aQuelqueChose = true;
        if (voisins.length === 0) {
          cible.moveTo(cx(i) - res * 0.2, cy(j));
          cible.lineTo(cx(i) + res * 0.2, cy(j));
          continue;
        }
        for (let a = 0; a < voisins.length; a += 1) {
          const na = voisins[a];
          if (voisins.length === 1) {
            cible.moveTo(cx(i), cy(j));
            cible.lineTo((cx(i) + cx(na.i)) / 2, (cy(j) + cy(na.j)) / 2);
            break;
          }
          for (let b = a + 1; b < voisins.length; b += 1) {
            const nb = voisins[b];
            cible.moveTo((cx(i) + cx(na.i)) / 2, (cy(j) + cy(na.j)) / 2);
            cible.quadraticCurveTo(cx(i), cy(j), (cx(i) + cx(nb.i)) / 2, (cy(j) + cy(nb.j)) / 2);
          }
        }
      }
    }
    if (!aQuelqueChose) return;
    void dedans;
    void bx;
    void by;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const passes: { chemin: Path2D; largeur: number }[] = [
      { chemin: chaussees, largeur: res * 0.66 },
      { chemin: chemins, largeur: res * 0.44 },
    ];

    for (const { chemin, largeur } of passes) {
      /* Ombre bleutée de l'ornière, projetée au sud-est. */
      ctx.save();
      ctx.translate(largeur * 0.16, largeur * 0.16);
      ctx.strokeStyle = 'rgba(42,50,66,0.30)';
      ctx.lineWidth = largeur * 1.22;
      ctx.stroke(chemin);
      ctx.restore();

      /* Corps de gravier : brun de fougère réchauffé d'ocre. */
      const corps = melanger(PALETTE.brunFougere, PALETTE.ocre, 0.5);
      ctx.strokeStyle = `rgba(${(corps >> 16) & 255},${(corps >> 8) & 255},${corps & 255},0.94)`;
      ctx.lineWidth = largeur;
      ctx.stroke(chemin);

      /* Bord clair du côté du soleil (nord-ouest). */
      ctx.save();
      ctx.translate(-largeur * 0.2, -largeur * 0.2);
      ctx.strokeStyle = 'rgba(255,233,194,0.24)';
      ctx.lineWidth = largeur * 0.5;
      ctx.stroke(chemin);
      ctx.restore();

      /* Ornière centrale, creusée par les charrois. */
      const creux = assombrir(corps, 0.36);
      ctx.strokeStyle = `rgba(${(creux >> 16) & 255},${(creux >> 8) & 255},${creux & 255},0.45)`;
      ctx.lineWidth = Math.max(1, largeur * 0.2);
      ctx.stroke(chemin);
    }
    ctx.restore();
  }

  /** Flou 3 × 3 en enveloppe, utilisé pour l'occlusion de vallée. */
  private flouter(src: Float32Array): Float32Array {
    const out = new Float32Array(src.length);
    for (let j = 0; j < G; j += 1) {
      const jh = j > 0 ? j - 1 : 0;
      const jb = j < G - 1 ? j + 1 : G - 1;
      for (let i = 0; i < G; i += 1) {
        const ig = i > 0 ? i - 1 : 0;
        const id = i < G - 1 ? i + 1 : G - 1;
        out[j * G + i] =
          (src[jh * G + ig] +
            src[jh * G + i] +
            src[jh * G + id] +
            src[j * G + ig] +
            src[j * G + i] +
            src[j * G + id] +
            src[jb * G + ig] +
            src[jb * G + i] +
            src[jb * G + id]) /
          9;
      }
    }
    return out;
  }

  destroy(): void {
    for (const bloc of this.cache.values()) {
      bloc.sprite.destroy();
      bloc.texture.destroy(true);
    }
    this.cache.clear();
    this.attente.length = 0;
    this.couche.destroy({ children: true });
  }
}
