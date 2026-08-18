/**
 * `render/camera.ts` — la caméra de la carte d'aventure.
 *
 * Elle tient deux états : la **visée** (là où le joueur veut aller) et le
 * **courant** (là où la caméra se trouve à cette image). Le courant rejoint la
 * visée par une approche exponentielle indépendante de la cadence, ce qui donne
 * un glissement continu à 60 images par seconde sans jamais dépasser la cible.
 *
 * Elle connaît les bornes de la carte : jamais un bord de grille au milieu de
 * l'écran. Elle sait aussi recentrer en 320 ms (durée imposée par le contrat de
 * vues), zoomer autour d'un point d'ancrage — molette ou pincement — et pousser
 * la vue quand le curseur touche un bord d'écran.
 */

import type { MapCoord } from '@auvergne/engine';
import type { MapCamera } from '../view-contract.js';
import { borne } from './commun.js';

/** Pixels par case : en deçà on ne lit plus rien, au-delà on peint du vide. */
export const ZOOM_MIN = 7;
export const ZOOM_MAX = 56;
/** Cadrage de confort au premier montage. */
export const ZOOM_DEFAUT = 22;

/** Durée d'un recentrage animé, imposée par `view-contract.ts`. */
const RECENTRAGE_MS = 320;
/** Constante de temps de l'approche continue, en millisecondes. */
const SOUPLESSE_MS = 62;
/** Largeur de la bande de bord qui pousse la caméra, en pixels. */
export const BANDE_BORD = 26;
/** Vitesse de poussée au bord, en cases par seconde à zoom 22. */
const VITESSE_BORD = 520;

interface Etat {
  col: number;
  row: number;
  zoom: number;
}

export interface OptionsCamera {
  readonly cols: number;
  readonly rows: number;
  /** appelé à chaque changement effectif de cadrage */
  onChange?: (camera: MapCamera) => void;
}

export class Camera {
  private readonly vise: Etat;
  private readonly courant: Etat;
  private depart: Etat | null = null;
  private animation = 0;
  private largeur = 1;
  private hauteur = 1;
  /** vitesse résiduelle d'un glissement, en cases par seconde */
  private vx = 0;
  private vy = 0;
  private dernierAnnonce: MapCamera;

  constructor(
    private readonly options: OptionsCamera,
    initial: Etat,
  ) {
    this.vise = { ...initial };
    this.courant = { ...initial };
    this.dernierAnnonce = { ...initial };
  }

  /* — Lecture — */

  get etat(): MapCamera {
    return { col: this.courant.col, row: this.courant.row, zoom: this.courant.zoom };
  }

  get cible(): MapCamera {
    return { col: this.vise.col, row: this.vise.row, zoom: this.vise.zoom };
  }

  /** Vrai tant que la caméra n'est pas posée : les couches restent en éveil. */
  get enMouvement(): boolean {
    return (
      this.animation > 0 ||
      Math.abs(this.courant.col - this.vise.col) > 0.002 ||
      Math.abs(this.courant.row - this.vise.row) > 0.002 ||
      Math.abs(this.courant.zoom - this.vise.zoom) > 0.01 ||
      Math.abs(this.vx) > 0.01 ||
      Math.abs(this.vy) > 0.01
    );
  }

  redimensionner(largeur: number, hauteur: number): void {
    this.largeur = Math.max(1, largeur);
    this.hauteur = Math.max(1, hauteur);
    this.contraindre(this.vise);
    this.contraindre(this.courant);
  }

  /* — Écriture — */

  /** Pose directement la caméra (aucune animation) : c'est `setCamera`. */
  poser(partiel: Partial<MapCamera>): void {
    this.animation = 0;
    this.depart = null;
    this.vx = 0;
    this.vy = 0;
    if (partiel.zoom !== undefined) this.vise.zoom = borne(partiel.zoom, ZOOM_MIN, ZOOM_MAX);
    if (partiel.col !== undefined) this.vise.col = partiel.col;
    if (partiel.row !== undefined) this.vise.row = partiel.row;
    this.contraindre(this.vise);
    this.courant.col = this.vise.col;
    this.courant.row = this.vise.row;
    this.courant.zoom = this.vise.zoom;
    this.annoncer();
  }

  /** Vise une position sans y sauter : le courant la rejoindra en douceur. */
  viser(partiel: Partial<MapCamera>): void {
    if (partiel.zoom !== undefined) this.vise.zoom = borne(partiel.zoom, ZOOM_MIN, ZOOM_MAX);
    if (partiel.col !== undefined) this.vise.col = partiel.col;
    if (partiel.row !== undefined) this.vise.row = partiel.row;
    this.contraindre(this.vise);
  }

  /** Recentrage : `animate` glisse en 320 ms, sinon saut immédiat. */
  centrer(at: MapCoord, options?: { animate?: boolean; zoom?: number }): void {
    const cible: Partial<MapCamera> =
      options?.zoom === undefined
        ? { col: at.col + 0.5, row: at.row + 0.5 }
        : { col: at.col + 0.5, row: at.row + 0.5, zoom: options.zoom };
    if (!options?.animate) {
      this.poser(cible);
      return;
    }
    this.vx = 0;
    this.vy = 0;
    this.viser(cible);
    this.depart = { ...this.courant };
    this.animation = RECENTRAGE_MS;
  }

  /** Glissement à la souris ou au doigt, en pixels écran. */
  glisser(dxPixels: number, dyPixels: number): void {
    this.animation = 0;
    this.depart = null;
    this.vise.col -= dxPixels / this.courant.zoom;
    this.vise.row -= dyPixels / this.courant.zoom;
    this.contraindre(this.vise);
    this.courant.col = this.vise.col;
    this.courant.row = this.vise.row;
    this.annoncer();
  }

  /** Vitesse résiduelle à la fin d'un glissement, en cases par seconde. */
  lancer(vxCases: number, vyCases: number): void {
    this.vx = borne(vxCases, -90, 90);
    this.vy = borne(vyCases, -90, 90);
  }

  arreter(): void {
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * Zoom autour d'un point d'ancrage écran : la case sous le curseur ne bouge
   * pas d'un pixel, ce qui est la seule façon de zoomer sans perdre son repère.
   */
  zoomer(facteur: number, ancre?: { x: number; y: number }): void {
    const avant = this.vise.zoom;
    const apres = borne(avant * facteur, ZOOM_MIN, ZOOM_MAX);
    if (apres === avant) return;
    this.animation = 0;
    this.depart = null;
    if (ancre) {
      /* La case visée sous l'ancre est calculée sur la visée, pas sur le
         courant : deux crans de molette successifs restent cohérents. */
      const dx = ancre.x - this.largeur / 2;
      const dy = ancre.y - this.hauteur / 2;
      const colAncre = this.vise.col + dx / avant;
      const rowAncre = this.vise.row + dy / avant;
      this.vise.col = colAncre - dx / apres;
      this.vise.row = rowAncre - dy / apres;
    }
    this.vise.zoom = apres;
    this.contraindre(this.vise);
  }

  /**
   * Poussée par le bord de l'écran. `pointeur` est `null` quand le curseur a
   * quitté la scène : la poussée s'arrête d'elle-même.
   */
  bords(pointeur: { x: number; y: number } | null, dtMs: number): void {
    if (!pointeur) return;
    const { x, y } = pointeur;
    if (x < -1 || y < -1 || x > this.largeur + 1 || y > this.hauteur + 1) return;
    let px = 0;
    let py = 0;
    if (x < BANDE_BORD) px = -(1 - x / BANDE_BORD);
    else if (x > this.largeur - BANDE_BORD) px = 1 - (this.largeur - x) / BANDE_BORD;
    if (y < BANDE_BORD) py = -(1 - y / BANDE_BORD);
    else if (y > this.hauteur - BANDE_BORD) py = 1 - (this.hauteur - y) / BANDE_BORD;
    if (px === 0 && py === 0) return;
    const pas = (VITESSE_BORD * dtMs) / 1000 / this.courant.zoom;
    this.animation = 0;
    this.vise.col += px * pas;
    this.vise.row += py * pas;
    this.contraindre(this.vise);
  }

  /* — Boucle — */

  /** Fait avancer l'interpolation d'une image. Retourne `true` si ça a bougé. */
  avancer(dtMs: number): boolean {
    const avantCol = this.courant.col;
    const avantRow = this.courant.row;
    const avantZoom = this.courant.zoom;

    if (this.vx !== 0 || this.vy !== 0) {
      const s = dtMs / 1000;
      this.vise.col += this.vx * s;
      this.vise.row += this.vy * s;
      const amorti = Math.exp(-dtMs / 190);
      this.vx *= amorti;
      this.vy *= amorti;
      if (Math.abs(this.vx) < 0.02) this.vx = 0;
      if (Math.abs(this.vy) < 0.02) this.vy = 0;
      this.contraindre(this.vise);
    }

    if (this.animation > 0 && this.depart) {
      this.animation = Math.max(0, this.animation - dtMs);
      const t = 1 - this.animation / RECENTRAGE_MS;
      /* Courbe d'interface : départ franc, arrivée posée. */
      const e = 1 - Math.pow(1 - t, 3);
      this.courant.col = this.depart.col + (this.vise.col - this.depart.col) * e;
      this.courant.row = this.depart.row + (this.vise.row - this.depart.row) * e;
      this.courant.zoom = this.depart.zoom + (this.vise.zoom - this.depart.zoom) * e;
      if (this.animation === 0) this.depart = null;
    } else {
      const k = 1 - Math.exp(-dtMs / SOUPLESSE_MS);
      this.courant.col += (this.vise.col - this.courant.col) * k;
      this.courant.row += (this.vise.row - this.courant.row) * k;
      this.courant.zoom += (this.vise.zoom - this.courant.zoom) * k;
      if (Math.abs(this.vise.col - this.courant.col) < 0.0015) this.courant.col = this.vise.col;
      if (Math.abs(this.vise.row - this.courant.row) < 0.0015) this.courant.row = this.vise.row;
      if (Math.abs(this.vise.zoom - this.courant.zoom) < 0.005) this.courant.zoom = this.vise.zoom;
    }

    this.contraindre(this.courant);
    const bouge =
      Math.abs(this.courant.col - avantCol) > 1e-4 ||
      Math.abs(this.courant.row - avantRow) > 1e-4 ||
      Math.abs(this.courant.zoom - avantZoom) > 1e-4;
    if (bouge) this.annoncer();
    return bouge;
  }

  /* — Bornes — */

  /**
   * La carte ne s'échappe pas de l'écran : on autorise un débord d'un quart
   * d'écran pour que les bordures restent atteignables, pas davantage.
   */
  private contraindre(e: Etat): void {
    e.zoom = borne(e.zoom, ZOOM_MIN, ZOOM_MAX);
    const demiLargeur = this.largeur / (2 * e.zoom);
    const demiHauteur = this.hauteur / (2 * e.zoom);
    const debordX = Math.min(demiLargeur * 0.5, this.options.cols * 0.12);
    const debordY = Math.min(demiHauteur * 0.5, this.options.rows * 0.12);
    const minCol = Math.min(demiLargeur - debordX, this.options.cols / 2);
    const maxCol = Math.max(this.options.cols - demiLargeur + debordX, this.options.cols / 2);
    const minRow = Math.min(demiHauteur - debordY, this.options.rows / 2);
    const maxRow = Math.max(this.options.rows - demiHauteur + debordY, this.options.rows / 2);
    e.col = borne(e.col, minCol, maxCol);
    e.row = borne(e.row, minRow, maxRow);
  }

  private annoncer(): void {
    const c = this.etat;
    const p = this.dernierAnnonce;
    if (Math.abs(c.col - p.col) < 1e-3 && Math.abs(c.row - p.row) < 1e-3 && Math.abs(c.zoom - p.zoom) < 1e-3) {
      return;
    }
    this.dernierAnnonce = c;
    this.options.onChange?.(c);
  }
}
