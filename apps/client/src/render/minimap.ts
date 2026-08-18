/**
 * `render/minimap.ts` — la minicarte, en bas à droite.
 *
 * Une plaque de parchemin cerclée d'un double filet d'or, dans laquelle le pays
 * entier est peint une fois pour toutes (une texel par case, ombrage de relief
 * compris), recouvert du brouillard du joueur et surmonté du cadre de vue. Le
 * cadre se saisit et se déplace : c'est la façon la plus rapide de traverser un
 * pays de 256 × 416 cases.
 */

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { GameState, MapCoord, WorldMap } from '@auvergne/engine';
import { LIGHT, PALETTE, melanger } from '../art/palette.js';
import { TER, borne, colEcran, rowEcran } from './commun.js';
import type { Cadrage } from './commun.js';

const METRES_PAR_CASE = 48;
const SOLEIL_X = -Math.cos((38 * Math.PI) / 180) * Math.SQRT1_2;
const SOLEIL_Y = -Math.cos((38 * Math.PI) / 180) * Math.SQRT1_2;
const SOLEIL_Z = Math.sin((38 * Math.PI) / 180);

/** Teintes de la minicarte : plus claires que le terrain, lisibles à 1 px. */
function teinteCase(terrain: number, alt: number): number {
  const t = borne((alt - 470) / 800, 0, 1);
  switch (terrain) {
    case TER.eau:
      return melanger(PALETTE.bleuProfond, PALETTE.bleuBrume, 0.24);
    case TER.foret:
      return melanger(melanger(PALETTE.vertSapin, PALETTE.vertHetre, 0.4), PALETTE.bleuBrume, t * 0.22);
    case TER.rocher:
      return melanger(PALETTE.granitClair, PALETTE.bleuBrume, 0.16 + t * 0.2);
    case TER.pente:
      return melanger(PALETTE.brunFougere, PALETTE.granitClair, 0.3 + t * 0.2);
    case TER.humide:
      return melanger(PALETTE.mousseSombre, PALETTE.bleuProfond, 0.28);
    case TER.route:
    case TER.chemin:
      return melanger(PALETTE.ocre, PALETTE.brunFougere, 0.35);
    default:
      return melanger(melanger(PALETTE.vertHetre, PALETTE.ocre, 0.2), PALETTE.bleuBrume, t * 0.24);
  }
}

export class Minicarte {
  readonly couche = new Container();

  private readonly cadre = new Graphics();
  private readonly fond: Sprite;
  private readonly voile: Sprite;
  private readonly marques = new Graphics();
  private readonly texVoile: Texture;
  private readonly canvasVoile: HTMLCanvasElement;
  private readonly ctxVoile: CanvasRenderingContext2D | null;
  private readonly imgVoile: ImageData | null;

  private largeurEcran = 1;
  private hauteurEcran = 1;
  private boite = { x: 0, y: 0, largeur: 1, hauteur: 1 };
  private fog: Uint8Array | null = null;
  private etat: GameState | null = null;
  private depuisMaj = 1e9;

  constructor(private readonly world: WorldMap) {
    this.couche.label = 'minicarte';
    this.couche.addChild(this.cadre);

    const base = document.createElement('canvas');
    base.width = world.cols;
    base.height = world.rows;
    const ctx = base.getContext('2d');
    if (!ctx) throw new Error('Contexte 2D indisponible : la minicarte ne peut être peinte.');
    const img = ctx.createImageData(world.cols, world.rows);
    const px = img.data;
    for (let row = 0; row < world.rows; row += 1) {
      for (let col = 0; col < world.cols; col += 1) {
        const i = row * world.cols + col;
        const alt = world.elevation[i];
        const couleur = teinteCase(world.terrain[i], alt);
        const g = col > 0 ? world.elevation[i - 1] : alt;
        const d = col < world.cols - 1 ? world.elevation[i + 1] : alt;
        const h = row > 0 ? world.elevation[i - world.cols] : alt;
        const b = row < world.rows - 1 ? world.elevation[i + world.cols] : alt;
        const dzdx = ((d - g) / (2 * METRES_PAR_CASE)) * 2.4;
        const dzdy = ((b - h) / (2 * METRES_PAR_CASE)) * 2.4;
        const len = Math.sqrt(dzdx * dzdx + dzdy * dzdy + 1);
        const sh = borne(((-dzdx * SOLEIL_X - dzdy * SOLEIL_Y + SOLEIL_Z) / len / SOLEIL_Z), 0.5, 1.45);
        const p = i * 4;
        let r = ((couleur >> 16) & 255) * sh;
        let v = ((couleur >> 8) & 255) * sh;
        let bl = (couleur & 255) * sh;
        if (sh > 1) {
          const k = Math.min(1, (sh - 1) * 1.6) * 0.24;
          r += (0xff - r) * k;
          v += (0xe9 - v) * k;
          bl += (0xc2 - bl) * k;
        } else {
          const k = Math.min(1, (1 - sh) * 1.8) * 0.34;
          r += (0x3a - r) * k;
          v += (0x46 - v) * k;
          bl += (0x57 - bl) * k;
        }
        px[p] = borne(r, 0, 255);
        px[p + 1] = borne(v, 0, 255);
        px[p + 2] = borne(bl, 0, 255);
        px[p + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    const texFond = Texture.from(base);
    texFond.source.scaleMode = 'linear';
    texFond.source.label = 'minicarte_fond';
    this.fond = new Sprite(texFond);
    this.couche.addChild(this.fond);

    this.canvasVoile = document.createElement('canvas');
    this.canvasVoile.width = world.cols;
    this.canvasVoile.height = world.rows;
    this.ctxVoile = this.canvasVoile.getContext('2d');
    this.imgVoile = this.ctxVoile ? this.ctxVoile.createImageData(world.cols, world.rows) : null;
    this.texVoile = Texture.from(this.canvasVoile);
    this.texVoile.source.scaleMode = 'linear';
    this.texVoile.source.label = 'minicarte_voile';
    this.voile = new Sprite(this.texVoile);
    this.couche.addChild(this.voile);
    this.couche.addChild(this.marques);
  }

  redimensionner(largeur: number, hauteur: number): void {
    this.largeurEcran = Math.max(1, largeur);
    this.hauteurEcran = Math.max(1, hauteur);
    const hauteurUtile = borne(hauteur * 0.34, 130, 300);
    const largeurUtile = (hauteurUtile * this.world.cols) / this.world.rows;
    const marge = 18;
    this.boite = {
      x: this.largeurEcran - largeurUtile - marge,
      y: this.hauteurEcran - hauteurUtile - marge,
      largeur: largeurUtile,
      hauteur: hauteurUtile,
    };
    this.fond.position.set(this.boite.x, this.boite.y);
    this.fond.width = largeurUtile;
    this.fond.height = hauteurUtile;
    this.voile.position.set(this.boite.x, this.boite.y);
    this.voile.width = largeurUtile;
    this.voile.height = hauteurUtile;
    this.peindreCadre();
  }

  poserFog(fog: Uint8Array | null): void {
    this.fog = fog;
    this.depuisMaj = 1e9;
  }

  invalider(): void {
    this.depuisMaj = 1e9;
  }

  sync(state: GameState): void {
    this.etat = state;
  }

  /** Vrai si le point écran tombe sur la minicarte. */
  contient(x: number, y: number): boolean {
    const b = this.boite;
    return x >= b.x && y >= b.y && x <= b.x + b.largeur && y <= b.y + b.hauteur;
  }

  /** Case visée par un point écran posé sur la minicarte. */
  versCarte(x: number, y: number): MapCoord {
    const b = this.boite;
    const col = borne(((x - b.x) / b.largeur) * this.world.cols, 0, this.world.cols - 1);
    const row = borne(((y - b.y) / b.hauteur) * this.world.rows, 0, this.world.rows - 1);
    return { col: Math.floor(col), row: Math.floor(row) };
  }

  private peindreCadre(): void {
    const b = this.boite;
    const g = this.cadre;
    g.clear();
    const m = 9;
    g.roundRect(b.x - m + 3, b.y - m + 4, b.largeur + m * 2, b.hauteur + m * 2, 4).fill({
      color: LIGHT.ombrePortee,
      alpha: 0.4,
    });
    g.roundRect(b.x - m, b.y - m, b.largeur + m * 2, b.hauteur + m * 2, 4).fill({
      color: melanger(PALETTE.granitAnthracite, PALETTE.brunFougere, 0.2),
    });
    /* Trois strates sur la plaque : teinte, dégradé de valeur, grain doré. */
    const total = b.hauteur + m * 2;
    for (let i = 0; i < 12; i += 1) {
      const t = i / 11;
      const y0 = Math.round((total * i) / 12);
      const y1 = Math.round((total * (i + 1)) / 12);
      g.rect(b.x - m, b.y - m + y0, b.largeur + m * 2, y1 - y0).fill({
        color: melanger(PALETTE.granitClair, PALETTE.granitAnthracite, t),
        alpha: 0.28,
      });
    }
    g.rect(b.x - m, b.y - m, b.largeur + m * 2, 2).fill({ color: LIGHT.chaude, alpha: 0.28 });
    g.roundRect(b.x - m, b.y - m, b.largeur + m * 2, b.hauteur + m * 2, 4).stroke({
      color: PALETTE.vieilOr,
      width: 2,
      alpha: 0.8,
    });
    g.roundRect(b.x - 4, b.y - 4, b.largeur + 8, b.hauteur + 8, 2).stroke({
      color: PALETTE.vieilOr,
      width: 1,
      alpha: 0.5,
    });
  }

  private peindreVoile(): void {
    if (!this.ctxVoile || !this.imgVoile) return;
    const px = this.imgVoile.data;
    const f = this.fog;
    const n = this.world.cols * this.world.rows;
    for (let i = 0; i < n; i += 1) {
      const p = i * 4;
      const niveau = f ? f[i] : 2;
      if (niveau >= 2) {
        px[p + 3] = 0;
        continue;
      }
      if (niveau === 1) {
        px[p] = 0x3a;
        px[p + 1] = 0x46;
        px[p + 2] = 0x57;
        px[p + 3] = 96;
      } else {
        px[p] = 0x1a;
        px[p + 1] = 0x1f;
        px[p + 2] = 0x26;
        px[p + 3] = 236;
      }
    }
    this.ctxVoile.putImageData(this.imgVoile, 0, 0);
    this.texVoile.source.update();
  }

  majVue(v: Cadrage, dtMs: number): void {
    this.depuisMaj += dtMs;
    if (this.depuisMaj > 700) {
      this.depuisMaj = 0;
      this.peindreVoile();
    }
    const b = this.boite;
    const ex = b.largeur / this.world.cols;
    const ey = b.hauteur / this.world.rows;
    const g = this.marques;
    g.clear();

    /* Cités et héros : des pastilles aux couleurs de bannière. */
    if (this.etat) {
      for (const uid of Object.keys(this.etat.towns)) {
        const town = this.etat.towns[uid];
        const niveau = this.fog ? this.fog[town.at.row * this.world.cols + town.at.col] : 2;
        if (niveau === 0) continue;
        const joueur = town.owner ? this.etat.players[town.owner] : null;
        const couleur = joueur ? couleurCss(joueur.color) : PALETTE.parcheminOmbre;
        g.rect(b.x + town.at.col * ex - 2.5, b.y + town.at.row * ey - 2.5, 5, 5).fill({ color: couleur });
        g.rect(b.x + town.at.col * ex - 3.5, b.y + town.at.row * ey - 3.5, 7, 7).stroke({
          color: PALETTE.encre,
          width: 1,
          alpha: 0.55,
        });
      }
      for (const uid of Object.keys(this.etat.heroes)) {
        const hero = this.etat.heroes[uid];
        const niveau = this.fog ? this.fog[hero.at.row * this.world.cols + hero.at.col] : 2;
        if (niveau < 2) continue;
        const joueur = this.etat.players[hero.owner];
        const couleur = joueur ? couleurCss(joueur.color) : PALETTE.vieilOr;
        g.circle(b.x + hero.at.col * ex, b.y + hero.at.row * ey, 3).fill({ color: couleur });
        g.circle(b.x + hero.at.col * ex, b.y + hero.at.row * ey, 3).stroke({
          color: LIGHT.chaude,
          width: 1,
          alpha: 0.85,
        });
      }
    }

    /* Cadre de vue : ce que la caméra montre en ce moment. */
    const c0 = colEcran(v, 0);
    const r0 = rowEcran(v, 0);
    const c1 = colEcran(v, v.largeur);
    const r1 = rowEcran(v, v.hauteur);
    const rx = b.x + borne(c0, 0, this.world.cols) * ex;
    const ry = b.y + borne(r0, 0, this.world.rows) * ey;
    const rw = (borne(c1, 0, this.world.cols) - borne(c0, 0, this.world.cols)) * ex;
    const rh = (borne(r1, 0, this.world.rows) - borne(r0, 0, this.world.rows)) * ey;
    g.rect(rx + 1, ry + 1, rw, rh).stroke({ color: LIGHT.ombrePortee, width: 2, alpha: 0.5 });
    g.rect(rx, ry, rw, rh).stroke({ color: PALETTE.vieilOr, width: 1.6, alpha: 0.95 });
    g.rect(rx, ry, rw, rh).fill({ color: LIGHT.chaude, alpha: 0.06 });
  }

  destroy(): void {
    this.texVoile.destroy(true);
    this.couche.destroy({ children: true });
  }
}

function couleurCss(valeur: string | number): number {
  if (typeof valeur === 'number') return valeur;
  const brut = valeur.replace('#', '');
  const n = Number.parseInt(brut, 16);
  return Number.isFinite(n) ? n : PALETTE.vieilOr;
}
