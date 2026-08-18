/**
 * `render/path.ts` — le chemin en perles dorées.
 *
 * Une perle par case, un fanion à chaque rupture de journée, des perles
 * gris-bleu pour ce qui ne sera pas atteint aujourd'hui (bible §4). Le tracé et
 * les journées viennent **du moteur** (`computePath`, `pathDays`) : cette
 * couche ne calcule ni coût ni portée, elle met en scène ce qu'on lui donne.
 */

import { Container, Graphics } from 'pixi.js';
import type { MapCoord } from '@auvergne/engine';
import type { PathPreview } from '../state/types.js';
import { LIGHT, PALETTE, assombrir, melanger } from '../art/palette.js';
import { borne, xEcran, yEcran } from './commun.js';
import type { Cadrage } from './commun.js';

const OR = PALETTE.vieilOr;
const OR_SOMBRE = assombrir(PALETTE.vieilOr, 0.42);
const GRIS_BLEU = melanger(PALETTE.bleuBrume, PALETTE.bleuProfond, 0.42);

export class CheminPerles {
  readonly couche = new Container();
  private readonly dessin = new Graphics();
  private chemin: readonly MapCoord[] = [];
  private jours: readonly number[] = [];
  private aujourdhui = 0;
  private depart: MapCoord | null = null;
  private confirme = false;

  constructor() {
    this.couche.label = 'chemin';
    this.couche.addChild(this.dessin);
  }

  get actif(): boolean {
    return this.chemin.length > 0;
  }

  /** Pose la prévisualisation ; `null` efface le tracé. */
  poser(preview: PathPreview | null, depart: MapCoord | null): void {
    if (!preview || preview.path.length === 0) {
      this.chemin = [];
      this.jours = [];
      this.depart = null;
      this.dessin.clear();
      this.couche.visible = false;
      return;
    }
    this.chemin = preview.path;
    this.jours = preview.days;
    this.aujourdhui = preview.reachableToday;
    this.confirme = preview.confirmed;
    this.depart = depart;
    this.couche.visible = true;
  }

  /**
   * Indice de journée du pas `i`. Le moteur renvoie soit un indice de jour par
   * pas, soit la liste des indices de rupture : les deux formes sont admises.
   */
  private jourDe(i: number): number {
    if (this.jours.length === this.chemin.length) return this.jours[i] ?? 0;
    let jour = 0;
    for (const rupture of this.jours) {
      if (i >= rupture) jour += 1;
    }
    return jour;
  }

  majVue(v: Cadrage, temps: number): void {
    if (this.chemin.length === 0) return;
    const g = this.dessin;
    g.clear();

    const rayon = borne(v.zoom * 0.17, 2.2, 7.5);
    const points: { x: number; y: number }[] = [];
    if (this.depart) {
      points.push({ x: xEcran(v, this.depart.col + 0.5), y: yEcran(v, this.depart.row + 0.5) });
    }
    for (const c of this.chemin) {
      points.push({ x: xEcran(v, c.col + 0.5), y: yEcran(v, c.row + 0.5) });
    }

    /* Le fil du chemin : discret, il relie les perles sans les concurrencer. */
    if (points.length > 1) {
      g.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i += 1) g.lineTo(points[i].x, points[i].y);
      g.stroke({ color: OR_SOMBRE, width: Math.max(1, rayon * 0.34), alpha: 0.34, cap: 'round' });
    }

    const decalage = this.depart ? 1 : 0;
    for (let i = 0; i < this.chemin.length; i += 1) {
      const p = points[i + decalage];
      const atteignable = i < this.aujourdhui;
      const teinte = atteignable ? OR : GRIS_BLEU;
      /* Loi n°7 : la perle scintille, 2,6 s de période, phases décorrélées. */
      const pulsation = this.confirme
        ? 1
        : 0.9 + 0.1 * Math.sin(temps * 2.4 + i * 0.55);
      const r = rayon * pulsation;

      /* Strate 1 — ombre bleutée posée au sud-est. */
      g.ellipse(p.x + r * 0.34, p.y + r * 0.46, r * 0.98, r * 0.52).fill({
        color: LIGHT.ombrePortee,
        alpha: 0.34,
      });
      /* Strate 2 — corps de la perle, contour teinté (jamais noir). */
      g.circle(p.x, p.y, r).fill({ color: assombrir(teinte, 0.34), alpha: 0.95 });
      g.circle(p.x, p.y, r * 0.82).fill({ color: teinte, alpha: 0.96 });
      /* Strate 3 — éclat du nord-ouest et liseré doré au sud-est. */
      g.circle(p.x - r * 0.3, p.y - r * 0.32, r * 0.34).fill({
        color: LIGHT.chaude,
        alpha: atteignable ? 0.75 : 0.4,
      });
      g.arc(p.x, p.y, r * 0.92, -0.5, 1.9).stroke({
        color: LIGHT.rim,
        width: Math.max(1, r * 0.16),
        alpha: LIGHT.rimAlpha,
      });

      /* Fanion de rupture de journée. */
      const jour = this.jourDe(i);
      const jourPrec = i === 0 ? 0 : this.jourDe(i - 1);
      if (i > 0 && jour > jourPrec) this.fanion(g, p.x, p.y, r, jour, temps);
    }

    /* Marque d'arrivée : un double anneau, plus large que les perles. */
    const fin = points[points.length - 1];
    const anneau = rayon * 2.05;
    g.circle(fin.x, fin.y, anneau).stroke({ color: OR, width: Math.max(1.2, rayon * 0.3), alpha: 0.85 });
    g.circle(fin.x, fin.y, anneau * 0.72).stroke({
      color: LIGHT.chaude,
      width: Math.max(1, rayon * 0.16),
      alpha: 0.5,
    });
  }

  /** Petit fanion planté sur la perle où la journée s'achève. */
  private fanion(g: Graphics, x: number, y: number, r: number, jour: number, temps: number): void {
    const h = r * 3.4;
    const souffle = Math.sin(temps * 1.6 + jour * 1.3) * r * 0.22;
    g.moveTo(x, y - r * 0.4).lineTo(x, y - h);
    g.stroke({ color: assombrir(PALETTE.brunFougere, 0.2), width: Math.max(1, r * 0.22), cap: 'round' });
    g.poly([
      x,
      y - h,
      x + r * 1.9 + souffle,
      y - h + r * 0.62,
      x + souffle * 0.5,
      y - h + r * 1.24,
    ]).fill({ color: jour >= 2 ? melanger(OR, PALETTE.grenat, 0.4) : OR, alpha: 0.94 });
    g.poly([
      x,
      y - h,
      x + r * 1.9 + souffle,
      y - h + r * 0.62,
      x + souffle * 0.5,
      y - h + r * 1.24,
    ]).stroke({ color: LIGHT.rim, width: Math.max(1, r * 0.12), alpha: LIGHT.rimAlpha });
    g.circle(x, y - h, r * 0.3).fill({ color: LIGHT.chaude, alpha: 0.8 });
  }

  destroy(): void {
    this.couche.destroy({ children: true });
  }
}
