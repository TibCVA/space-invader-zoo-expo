/**
 * `render/fog.ts` — le voile de guerre, à trois états.
 *
 *   inconnu  → voile `#1A1F26` à 0,92, marqué d'un motif de parchemin ;
 *   exploré  → désaturation 60 % et assombrissement 35 % ;
 *   visible  → plein.
 *
 * La règle qui coûte le plus cher est la dernière de la bible : **les frontières
 * sont adoucies, jamais en escalier de cases**. On peint donc le brouillard
 * dans une trame d'une texel par case, on la floue deux fois en séparable, puis
 * on la laisse s'étirer en filtrage linéaire sur tout l'écran : la transition
 * s'étale sur trois à quatre cases et suit le relief du masque, pas la grille.
 *
 * La trame n'est recalculée que lorsque la case du coin change ou que le
 * brouillard du joueur a bougé ; entre-temps, seul son décalage écran suit la
 * caméra, ce qui la rend gratuite pendant un glissement.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import type { WorldMap } from '@auvergne/engine';
import { alea, borne, xEcran, yEcran } from './commun.js';
import type { Cadrage } from './commun.js';

/** Marge de cases peintes au-delà de l'écran, pour que le flou ait de la matière. */
const MARGE = 5;

export interface RectBrouillard {
  x: number;
  y: number;
  largeur: number;
  hauteur: number;
}

export class Brouillard {
  /** Trame de visibilité : rouge = 0 inconnu, 128 exploré, 255 visible. */
  readonly texture: Texture;
  /** Voile peint, utilisé seulement quand le filtre unique n'est pas disponible. */
  readonly couche = new Container();

  private readonly canvasNiveau: HTMLCanvasElement;
  private readonly ctxNiveau: CanvasRenderingContext2D;
  private readonly imgNiveau: ImageData;
  private readonly voileSprite: Sprite;
  private readonly canvasVoile: HTMLCanvasElement;
  private readonly ctxVoile: CanvasRenderingContext2D | null;
  private readonly imgVoile: ImageData | null;
  private readonly texVoile: Texture | null;

  private readonly tw: number;
  private readonly th: number;
  private readonly brut: Float32Array;
  private readonly lisse: Float32Array;

  private col0 = Number.NaN;
  private row0 = Number.NaN;
  private version = -1;
  private source: Uint8Array | null = null;
  private versionSource = 0;
  private rect: RectBrouillard = { x: 0, y: 0, largeur: 1, hauteur: 1 };

  constructor(
    private readonly world: WorldMap,
    largeurMax: number,
    hauteurMax: number,
    private readonly avecVoile: boolean,
  ) {
    this.couche.label = 'brouillard';
    this.tw = Math.min(world.cols + 2 * MARGE, Math.ceil(largeurMax) + 2 * MARGE);
    this.th = Math.min(world.rows + 2 * MARGE, Math.ceil(hauteurMax) + 2 * MARGE);
    this.brut = new Float32Array(this.tw * this.th);
    this.lisse = new Float32Array(this.tw * this.th);

    this.canvasNiveau = document.createElement('canvas');
    this.canvasNiveau.width = this.tw;
    this.canvasNiveau.height = this.th;
    const c = this.canvasNiveau.getContext('2d', { willReadFrequently: true });
    if (!c) throw new Error('Contexte 2D indisponible : le brouillard ne peut être tramé.');
    this.ctxNiveau = c;
    this.imgNiveau = this.ctxNiveau.createImageData(this.tw, this.th);
    this.texture = Texture.from(this.canvasNiveau);
    this.texture.source.scaleMode = 'linear';
    this.texture.source.label = 'brouillard_niveau';

    this.canvasVoile = document.createElement('canvas');
    this.canvasVoile.width = this.tw;
    this.canvasVoile.height = this.th;
    if (avecVoile) {
      const v = this.canvasVoile.getContext('2d', { willReadFrequently: true });
      this.ctxVoile = v;
      this.imgVoile = v ? v.createImageData(this.tw, this.th) : null;
      this.texVoile = Texture.from(this.canvasVoile);
      this.texVoile.source.scaleMode = 'linear';
      this.texVoile.source.label = 'brouillard_voile';
      this.voileSprite = new Sprite(this.texVoile);
      this.couche.addChild(this.voileSprite);
    } else {
      this.ctxVoile = null;
      this.imgVoile = null;
      this.texVoile = null;
      this.voileSprite = new Sprite();
      this.voileSprite.visible = false;
    }
  }

  /** Rectangle écran couvert par la trame, en pixels CSS. */
  get rectangle(): RectBrouillard {
    return this.rect;
  }

  /** Nouveau masque de brouillard du joueur suivi. */
  poserSource(fog: Uint8Array | null): void {
    this.source = fog;
    this.versionSource += 1;
  }

  /** À appeler après tout `FogRevealed` : la trame sera recalculée. */
  invalider(): void {
    this.versionSource += 1;
  }

  majVue(v: Cadrage): void {
    const col0 = Math.floor(v.col - v.largeur / (2 * v.zoom)) - MARGE;
    const row0 = Math.floor(v.row - v.hauteur / (2 * v.zoom)) - MARGE;
    if (col0 !== this.col0 || row0 !== this.row0 || this.version !== this.versionSource) {
      this.col0 = col0;
      this.row0 = row0;
      this.version = this.versionSource;
      this.tramer();
    }
    this.rect = {
      x: xEcran(v, this.col0),
      y: yEcran(v, this.row0),
      largeur: this.tw * v.zoom,
      hauteur: this.th * v.zoom,
    };
    if (this.avecVoile) {
      this.voileSprite.position.set(this.rect.x, this.rect.y);
      this.voileSprite.width = this.rect.largeur;
      this.voileSprite.height = this.rect.hauteur;
    }
  }

  /** Niveau de visibilité lissé d'une case, de 0 (inconnu) à 1 (pleine vue). */
  niveauCase(col: number, row: number): number {
    const i = col - this.col0;
    const j = row - this.row0;
    if (i < 0 || j < 0 || i >= this.tw || j >= this.th) return this.brutCase(col, row);
    return this.lisse[j * this.tw + i];
  }

  private brutCase(col: number, row: number): number {
    const f = this.source;
    if (!f) return 1;
    if (col < 0 || row < 0 || col >= this.world.cols || row >= this.world.rows) return 0;
    const n = f[row * this.world.cols + col];
    return n >= 2 ? 1 : n === 1 ? 0.5 : 0;
  }

  /* ─────────────────────────── La trame et son flou ─────────────────────── */

  private tramer(): void {
    const { tw, th, brut, lisse } = this;
    const f = this.source;
    const cols = this.world.cols;
    const rows = this.world.rows;

    for (let j = 0; j < th; j += 1) {
      const row = this.row0 + j;
      const base = j * tw;
      for (let i = 0; i < tw; i += 1) {
        const col = this.col0 + i;
        let n = 0;
        if (!f) n = 1;
        else if (col >= 0 && row >= 0 && col < cols && row < rows) {
          const b = f[row * cols + col];
          n = b >= 2 ? 1 : b === 1 ? 0.5 : 0;
        }
        brut[base + i] = n;
      }
    }

    /* Flou séparable, deux passes de rayon 1 : la frontière s'étale sur
       trois à quatre cases et perd tout escalier. */
    this.flouHorizontal(brut, lisse);
    this.flouVertical(lisse, brut);
    this.flouHorizontal(brut, lisse);
    this.flouVertical(lisse, brut);
    lisse.set(brut);

    const px = this.imgNiveau.data;
    const pv = this.imgVoile ? this.imgVoile.data : null;
    for (let j = 0; j < th; j += 1) {
      const row = this.row0 + j;
      for (let i = 0; i < tw; i += 1) {
        const k = j * tw + i;
        const n = lisse[k];
        const p = k * 4;
        px[p] = Math.round(borne(n, 0, 1) * 255);
        px[p + 1] = px[p];
        px[p + 2] = px[p];
        px[p + 3] = 255;
        if (pv) {
          const col = this.col0 + i;
          /* Motif de parchemin du voile : granuleux, ancré aux cases. */
          const grain = 0.88 + alea(col, row, 613) * 0.2;
          const inconnu = borne((0.5 - n) / 0.5, 0, 1);
          const explore = borne((1 - n) / 0.5, 0, 1) * (1 - inconnu);
          pv[p] = Math.round(0x3a + (0x1a - 0x3a) * inconnu);
          pv[p + 1] = Math.round(0x46 + (0x1f - 0x46) * inconnu);
          pv[p + 2] = Math.round(0x57 + (0x26 - 0x57) * inconnu);
          pv[p + 3] = Math.round(borne(inconnu * 0.92 * grain + explore * 0.32, 0, 1) * 255);
        }
      }
    }
    this.ctxNiveau.putImageData(this.imgNiveau, 0, 0);
    this.texture.source.update();
    if (this.ctxVoile && this.imgVoile && this.texVoile) {
      this.ctxVoile.putImageData(this.imgVoile, 0, 0);
      this.texVoile.source.update();
    }
  }

  private flouHorizontal(src: Float32Array, dst: Float32Array): void {
    const { tw, th } = this;
    for (let j = 0; j < th; j += 1) {
      const b = j * tw;
      for (let i = 0; i < tw; i += 1) {
        const g = src[b + (i > 0 ? i - 1 : 0)];
        const c = src[b + i];
        const d = src[b + (i < tw - 1 ? i + 1 : tw - 1)];
        dst[b + i] = (g + c * 2 + d) / 4;
      }
    }
  }

  private flouVertical(src: Float32Array, dst: Float32Array): void {
    const { tw, th } = this;
    for (let j = 0; j < th; j += 1) {
      const h = (j > 0 ? j - 1 : 0) * tw;
      const c = j * tw;
      const b = (j < th - 1 ? j + 1 : th - 1) * tw;
      for (let i = 0; i < tw; i += 1) {
        dst[c + i] = (src[h + i] + src[c + i] * 2 + src[b + i]) / 4;
      }
    }
  }

  destroy(): void {
    this.texture.destroy(true);
    this.texVoile?.destroy(true);
    this.couche.destroy({ children: true });
  }
}
