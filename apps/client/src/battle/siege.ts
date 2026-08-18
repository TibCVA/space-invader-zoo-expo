/**
 * `battle/siege.ts` — la place forte : porte, remparts, tours, projectiles.
 *
 * La géométrie du siège appartient au moteur (`SIEGE_WALL_COL`,
 * `SIEGE_GATE_ROW`, `SIEGE_SEGMENT_ROWS`, `SIEGE_TOWERS`, `SIEGE_MOAT_COL`), de
 * même que l'état de chaque ouvrage (`CombatObstacle.state` : 0 intact,
 * 1 fissuré, 2 effondré). La vue se contente de peindre ces trois états et de
 * lancer les projectiles des tours quand on le lui demande.
 *
 * Trois segments de mur, deux tours, une porte, un fossé : rien de plus, rien
 * de moins que ce que `buildSiegeField` a posé.
 */

import { Container, Graphics } from 'pixi.js';
import {
  SIEGE_GATE_ROW,
  SIEGE_SEGMENT_NAMES,
  SIEGE_SEGMENT_ROWS,
  SIEGE_TOWERS,
  SIEGE_WALL_COL,
  fortificationAt,
  isGateOpen,
  segmentOf,
} from '@auvergne/engine';
import type { CombatObstacle, CombatState, HexCoord } from '@auvergne/engine';
import type { ArtAtlas } from '../art/index.js';
import {
  LIGHT,
  PALETTE,
  assombrir,
  eclaircir,
  faceEclairee,
  melanger,
  ombreBleutee,
} from '../art/palette.js';
import { blob, densifier, flat, perturber } from '../art/shading.js';
import type { Poly } from '../art/shading.js';
import { hash2 } from '../art/noise.js';
import { donneeClaire } from './parchemin.js';
import { Geometrie } from './hexgrid.js';

const PIERRE = melanger(PALETTE.granitClair, PALETTE.parcheminOmbre, 0.22);
const PIERRE_SOMBRE = PALETTE.granitAnthracite;
const CHENE = 0x5a4128;

/* ═══════════════════════════ Blocs de maçonnerie ═════════════════════════ */

/** Un moellon : jamais un rectangle, toujours une pierre taillée à la main. */
function moellon(x: number, y: number, w: number, h: number, graine: number): Poly {
  return perturber(
    densifier(
      [
        { x, y },
        { x: x + w, y: y + (hash2(graine, 1, 17) - 0.5) * 2 },
        { x: x + w - 1, y: y + h },
        { x: x + 1, y: y + h - (hash2(graine, 2, 19) - 0.5) * 2 },
      ],
      Math.max(5, w / 3),
    ),
    0.8,
    graine,
  );
}

/** Appareillage de pierre : trois strates, joints creusés, arête éclairée. */
function appareiller(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  teinte: number,
  graine: number,
  alpha = 1,
): void {
  const hauteurRang = Math.max(7, h / 6);
  let ligne = 0;
  for (let ry = y; ry < y + h - 1; ry += hauteurRang) {
    const decal = ligne % 2 === 0 ? 0 : hauteurRang * 0.7;
    for (let rx = x - decal; rx < x + w; rx += hauteurRang * 1.5) {
      const bw = Math.min(hauteurRang * 1.4, x + w - rx);
      if (bw < 3) continue;
      const bh = Math.min(hauteurRang - 1.4, y + h - ry);
      const v = hash2(Math.round(rx), Math.round(ry), graine);
      const c = v > 0.5 ? faceEclairee(teinte, (v - 0.5) * 0.8) : ombreBleutee(teinte, (0.5 - v) * 0.8);
      const bloc = moellon(Math.max(x, rx), ry, bw, bh, Math.round(rx * 7 + ry));
      g.poly(flat(bloc)).fill({ color: c, alpha });
      /* arête nord-ouest éclairée */
      g.moveTo(bloc[0].x, bloc[0].y).lineTo(bloc[Math.floor(bloc.length * 0.28)].x, bloc[Math.floor(bloc.length * 0.28)].y);
      g.stroke({ color: LIGHT.chaude, width: 1, alpha: alpha * 0.22 });
      /* joint sud-est creusé */
      g.poly(flat(bloc), true).stroke({ color: assombrir(teinte, 0.55), width: 1, alpha: alpha * 0.55 });
    }
    ligne += 1;
  }
}

/* ═══════════════════════════ Les trois états ═════════════════════════════ */

/** Segment de rempart intact : merlons, chemin de ronde, ombre portée. */
function murIntact(g: Graphics, x: number, y: number, w: number, h: number, graine: number): void {
  g.poly(flat(perturber(densifier([
    { x: x + 4, y: y + h },
    { x: x + w + 8, y: y + h },
    { x: x + w + 14, y: y + h + 9 },
    { x: x + 9, y: y + h + 9 },
  ], 8), 0.8, graine))).fill({ color: LIGHT.ombrePortee, alpha: LIGHT.ombrePorteeAlpha });

  appareiller(g, x, y + 10, w, h - 10, PIERRE, graine);
  /* merlons : la crête n'est jamais droite */
  const n = Math.max(3, Math.round(w / 16));
  for (let i = 0; i < n; i += 1) {
    const mw = w / n;
    const mx = x + i * mw;
    if (i % 2 === 1) continue;
    appareiller(g, mx + 1, y, mw - 2, 12, faceEclairee(PIERRE, 0.2), graine + i * 3);
  }
  /* liseré doré, côté opposé au soleil : à droite et en bas seulement */
  g.moveTo(x + w - 0.8, y + 12).lineTo(x + w - 0.8, y + h).lineTo(x + 4, y + h);
  g.stroke({ color: LIGHT.rim, width: 1.6, alpha: LIGHT.rimAlpha });
}

/** Segment fissuré : lézarde vive, moellons descellés, poussière au pied. */
function murFissure(g: Graphics, x: number, y: number, w: number, h: number, graine: number): void {
  murIntact(g, x, y, w, h, graine);
  const cx = x + w * (0.32 + hash2(graine, 5, 23) * 0.34);
  const fissure: Poly = [];
  for (let i = 0; i <= 8; i += 1) {
    const t = i / 8;
    fissure.push({ x: cx + (hash2(graine + i, 9, 31) - 0.5) * 13, y: y + 6 + t * (h - 6) });
  }
  g.moveTo(fissure[0].x, fissure[0].y);
  for (const p of fissure.slice(1)) g.lineTo(p.x, p.y);
  g.stroke({ color: ombreBleutee(PIERRE_SOMBRE, 0.9), width: 4.2, alpha: 0.85, join: 'round' });
  g.moveTo(fissure[0].x - 1.4, fissure[0].y);
  for (const p of fissure.slice(1)) g.lineTo(p.x - 1.4, p.y);
  g.stroke({ color: LIGHT.chaude, width: 1.1, alpha: 0.2, join: 'round' });
  /* moellons tombés au pied du mur */
  for (let i = 0; i < 5; i += 1) {
    const px = cx + (hash2(graine + i, 3, 41) - 0.5) * w * 0.5;
    const py = y + h + 2 + hash2(graine + i, 7, 43) * 6;
    const r = 3 + hash2(i, graine, 53) * 4;
    g.poly(flat(blob(px, py, r, r * 0.62, { seed: i * 7 + graine, points: 9, wobble: 0.3 }))).fill({
      color: hash2(i, 1, 5) > 0.5 ? faceEclairee(PIERRE, 0.4) : ombreBleutee(PIERRE, 0.4),
      alpha: 0.9,
    });
  }
}

/** Segment effondré : moignon bas, éboulis, brèche franche. */
function murEffondre(g: Graphics, x: number, y: number, w: number, h: number, graine: number): void {
  const bas = y + h * 0.62;
  appareiller(g, x, bas, w * 0.32, h - h * 0.62, ombreBleutee(PIERRE, 0.3), graine);
  appareiller(g, x + w * 0.74, bas + 4, w * 0.26, h - h * 0.62 - 4, ombreBleutee(PIERRE, 0.35), graine + 5);
  /* éboulis dans la brèche : un tas, pas un tapis */
  for (let i = 0; i < 22; i += 1) {
    const t = hash2(i, graine, 61);
    const px = x + w * (0.24 + t * 0.56);
    const py = y + h - 2 - hash2(i, graine + 3, 67) * h * 0.34;
    const r = 3 + hash2(i, graine + 7, 71) * 6;
    const poly = blob(px, py, r, r * 0.66, { seed: i * 11 + graine, points: 10, wobble: 0.32 });
    g.poly(flat(poly)).fill({
      color: t > 0.5 ? faceEclairee(PIERRE, 0.34) : ombreBleutee(PIERRE, 0.44),
      alpha: 0.95,
    });
    const nw = poly.filter((p) => p.x - px + (p.y - py) < 0);
    if (nw.length > 2) g.poly(flat(nw)).stroke({ color: LIGHT.rim, width: 0.9, alpha: 0.28 });
  }
  /* poussière encore en suspension */
  g.poly(flat(blob(x + w * 0.5, y + h * 0.6, w * 0.4, h * 0.24, { seed: graine, points: 18, wobble: 0.3 }))).fill({
    color: melanger(PALETTE.parcheminOmbre, LIGHT.brume, 0.4),
    alpha: 0.14,
  });
}

/** Porte : vantaux de chêne ferré, herse levée quand la porte est ouverte. */
function porte(g: Graphics, x: number, y: number, w: number, h: number, etat: number, ouverte: boolean): void {
  appareiller(g, x - 6, y, 7, h, PIERRE, 91);
  appareiller(g, x + w - 1, y, 7, h, PIERRE, 97);
  /* arc de décharge */
  const arc: Poly = [];
  for (let i = 0; i <= 12; i += 1) {
    const a = Math.PI + (i / 12) * Math.PI;
    arc.push({ x: x + w / 2 + Math.cos(a) * (w / 2 + 5), y: y + 6 + Math.sin(a) * 11 });
  }
  arc.push({ x: x + w / 2 + w / 2 + 5, y: y - 2 }, { x: x - 5, y: y - 2 });
  g.poly(flat(arc)).fill({ color: faceEclairee(PIERRE, 0.25) });
  g.poly(flat(arc), true).stroke({ color: assombrir(PIERRE, 0.5), width: 1.2 });

  if (etat >= 2) {
    /* vantaux arrachés : on voit la cour derrière */
    g.rect(x, y + 8, w, h - 8).fill({ color: ombreBleutee(PALETTE.bleuProfond, 0.6), alpha: 0.85 });
    g.rect(x, y + 8, w, 6).fill({ color: LIGHT.ombrePortee, alpha: 0.5 });
    for (let i = 0; i < 4; i += 1) {
      const px = x + 3 + hash2(i, 3, 13) * (w - 6);
      g.poly(flat(blob(px, y + h - 3, 4, 2.4, { seed: i, points: 8, wobble: 0.3 }))).fill({
        color: ombreBleutee(CHENE, 0.4),
        alpha: 0.9,
      });
    }
    return;
  }

  const bois = etat === 1 ? ombreBleutee(CHENE, 0.3) : CHENE;
  for (let i = 0; i < 2; i += 1) {
    const vx = x + (i * w) / 2 + 1;
    const vw = w / 2 - 2;
    g.rect(vx, y + 8, vw, h - 8).fill({
      color: i === 0 ? faceEclairee(bois, 0.22) : bois,
    });
    /* planches verticales : chaque planche a sa valeur */
    for (let p = 0; p < 4; p += 1) {
      const px = vx + (p * vw) / 4;
      const v = hash2(p, i, 29);
      g.rect(px, y + 8, vw / 4 - 0.6, h - 8).fill({
        color: v > 0.5 ? faceEclairee(bois, (v - 0.5) * 0.7) : ombreBleutee(bois, (0.5 - v) * 0.7),
        alpha: 0.55,
      });
    }
    g.rect(vx, y + 8, vw, h - 8).stroke({ color: assombrir(bois, 0.5), width: 1.2 });
  }
  /* ferrures et clous */
  for (const fy of [y + 16, y + h - 12]) {
    g.rect(x + 1, fy, w - 2, 4).fill({ color: melanger(PALETTE.granitClair, PALETTE.bleuProfond, 0.3) });
    g.rect(x + 1, fy, w - 2, 1.4).fill({ color: LIGHT.chaude, alpha: 0.3 });
    for (let i = 0; i < 6; i += 1) {
      const px = x + 4 + (i * (w - 8)) / 5;
      g.poly(flat(blob(px, fy + 2, 1.5, 1.5, { seed: i, points: 7, wobble: 0.24 }))).fill({
        color: eclaircir(PALETTE.granitClair, 0.5),
        alpha: 0.9,
      });
    }
  }
  if (etat === 1) {
    g.moveTo(x + w * 0.3, y + 10).lineTo(x + w * 0.62, y + h - 6);
    g.stroke({ color: ombreBleutee(CHENE, 0.9), width: 3.4, alpha: 0.8 });
  }
  if (ouverte) {
    /* herse levée : trois barreaux visibles sous l'arc */
    for (let i = 0; i < 3; i += 1) {
      const px = x + 5 + (i * (w - 10)) / 2;
      g.moveTo(px, y + 6).lineTo(px, y + 14);
      g.stroke({ color: melanger(PALETTE.granitClair, LIGHT.chaude, 0.2), width: 2, alpha: 0.85 });
    }
  }
  g.moveTo(x + w - 0.8, y + 10).lineTo(x + w - 0.8, y + h);
  g.stroke({ color: LIGHT.rim, width: 1.5, alpha: LIGHT.rimAlpha });
}

/** Tour de flanquement : fût appareillé, hourd, toiture d'ardoise, oriflamme. */
function tour(g: Graphics, x: number, y: number, w: number, h: number, etat: number, graine: number): void {
  g.poly(flat(perturber(densifier([
    { x: x + 5, y: y + h },
    { x: x + w + 10, y: y + h },
    { x: x + w + 17, y: y + h + 11 },
    { x: x + 11, y: y + h + 11 },
  ], 9), 0.9, graine))).fill({ color: LIGHT.ombrePortee, alpha: LIGHT.ombrePorteeAlpha });

  const teinte = etat >= 2 ? ombreBleutee(PIERRE, 0.4) : PIERRE;
  const hauteur = etat >= 2 ? h * 0.45 : h;
  appareiller(g, x, y + h - hauteur, w, hauteur, teinte, graine);

  if (etat < 2) {
    /* couronnement */
    const n = 4;
    for (let i = 0; i < n; i += 1) {
      if (i % 2 === 1) continue;
      appareiller(g, x + (i * w) / n, y - 10, w / n - 1, 12, faceEclairee(teinte, 0.22), graine + i);
    }
    /* archères */
    for (let i = 0; i < 2; i += 1) {
      const ax = x + w * (0.3 + i * 0.4);
      const ay = y + h * (0.3 + i * 0.22);
      g.rect(ax - 1.6, ay, 3.2, 12).fill({ color: ombreBleutee(PIERRE_SOMBRE, 0.9), alpha: 0.9 });
      g.rect(ax - 1.6, ay, 1, 12).fill({ color: LIGHT.chaude, alpha: 0.2 });
    }
  }
  if (etat === 1) {
    for (let i = 0; i < 6; i += 1) {
      const px = x + hash2(i, graine, 7) * w;
      const py = y + h - hauteur + hash2(i, graine + 1, 11) * hauteur;
      g.moveTo(px, py).lineTo(px + 4, py + 9);
      g.stroke({ color: ombreBleutee(PIERRE_SOMBRE, 0.9), width: 2, alpha: 0.7 });
    }
  }
  g.moveTo(x + w - 0.8, y + (etat >= 2 ? h - hauteur : -8)).lineTo(x + w - 0.8, y + h);
  g.stroke({ color: LIGHT.rim, width: 1.6, alpha: LIGHT.rimAlpha });
}

/* ═══════════════════════════ La place forte ══════════════════════════════ */

interface OuvrageVue {
  hex: HexCoord;
  kind: CombatObstacle['kind'];
  etat: number;
}

/**
 * Toutes les fortifications d'un siège. Elle vit dans le conteneur du plateau,
 * au-dessus du sol et sous les piles ; les tours tirent par-dessus.
 */
export class Fortifications {
  readonly container = new Container();
  /** couche des projectiles : au-dessus de tout, comme les traits qui volent */
  readonly projectiles = new Container();

  private readonly dessin = new Graphics();
  private readonly etiquettes = new Container();
  private cle = '';
  private horloge = 0;
  private readonly oriflammes: { g: Graphics; x: number; y: number; phase: number }[] = [];

  constructor(
    private readonly geo: Geometrie,
    private readonly atlas: ArtAtlas,
    private readonly reducedMotion: boolean,
  ) {
    this.container.label = 'fortifications';
    this.container.addChild(this.dessin, this.etiquettes);
  }

  /** Vrai si le combat comporte des ouvrages à peindre. */
  static concerne(combat: CombatState): boolean {
    return combat.siege;
  }

  /** Relit les ouvrages : trois segments, deux tours, une porte, un fossé. */
  sync(combat: CombatState): void {
    if (!combat.siege) {
      this.dessin.clear();
      this.etiquettes.removeChildren().forEach((c) => c.destroy({ children: true }));
      this.cle = '';
      return;
    }
    const ouvrages = this.relever(combat);
    const cle = ouvrages.map((o) => `${o.hex.col},${o.hex.row}:${o.kind}:${o.etat}`).join('|') +
      (isGateOpen(combat) ? '|ouverte' : '');
    if (cle === this.cle) return;
    this.cle = cle;
    this.peindre(combat, ouvrages);
  }

  /** Ce que le moteur a posé, relu case par case — rien n'est deviné. */
  private relever(combat: CombatState): OuvrageVue[] {
    const out: OuvrageVue[] = [];
    for (const o of combat.obstacles) {
      if (o.kind !== 'mur' && o.kind !== 'porte' && o.kind !== 'tour') continue;
      out.push({ hex: o.at, kind: o.kind, etat: o.state ?? 0 });
    }
    /* les tours sont à leur place canonique même si l'obstacle a disparu */
    for (const t of SIEGE_TOWERS) {
      if (out.some((o) => o.hex.col === t.col && o.hex.row === t.row)) continue;
      const f = fortificationAt(combat, t);
      if (f) out.push({ hex: t, kind: 'tour', etat: f.state ?? 0 });
    }
    return out;
  }

  private peindre(combat: CombatState, ouvrages: OuvrageVue[]): void {
    const g = this.dessin;
    g.clear();
    this.etiquettes.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.oriflammes.length = 0;
    const t = this.geo.taille;

    /* fossé : creusé devant le rempart, colonne donnée par le moteur */
    const fosses = combat.obstacles.filter((o) => o.kind === 'fosse');
    for (const f of fosses) {
      const c = this.geo.local(f.at);
      const poly = blob(c.x, c.y, t * 0.86, t * 0.7, { seed: f.at.row * 7 + 3, points: 18, wobble: 0.22 });
      g.poly(flat(poly)).fill({ color: ombreBleutee(PALETTE.brunFougere, 0.85), alpha: 0.8 });
      g.poly(flat(blob(c.x, c.y + t * 0.08, t * 0.62, t * 0.42, { seed: 9, points: 14, wobble: 0.28 }))).fill({
        color: melanger(PALETTE.bleuProfond, PALETTE.mousseSombre, 0.4),
        alpha: 0.7,
      });
      const nw = poly.filter((p) => p.x - c.x + (p.y - c.y) < 0);
      if (nw.length > 2) g.poly(flat(nw)).stroke({ color: LIGHT.chaude, width: 1.4, alpha: 0.26 });
    }

    /* les ouvrages, du fond vers l'avant */
    const tries = [...ouvrages].sort((a, b) => a.hex.row - b.hex.row);
    for (const o of tries) {
      const c = this.geo.local(o.hex);
      const x = c.x - t * 0.72;
      const w = t * 1.44;
      if (o.kind === 'tour') {
        const h = t * 2.6;
        tour(g, x, c.y - h + t * 0.4, w, h, o.etat, o.hex.row * 31 + 3);
        if (o.etat < 2) this.planterOriflamme(x + w / 2, c.y - h - t * 0.34);
      } else if (o.kind === 'porte') {
        const h = t * 1.9;
        porte(g, x, c.y - h + t * 0.4, w, h, o.etat, isGateOpen(combat));
      } else {
        const h = t * 1.7;
        const graine = o.hex.row * 17 + 5;
        if (o.etat === 0) murIntact(g, x, c.y - h + t * 0.4, w, h, graine);
        else if (o.etat === 1) murFissure(g, x, c.y - h + t * 0.4, w, h, graine);
        else murEffondre(g, x, c.y - h + t * 0.4, w, h, graine);
      }
    }

    /* nom et état des trois segments, en marge du rempart */
    for (let i = 0; i < SIEGE_SEGMENT_ROWS.length; i += 1) {
      const rows = SIEGE_SEGMENT_ROWS[i];
      const milieu = rows[Math.floor(rows.length / 2)];
      const hex: HexCoord = { col: SIEGE_WALL_COL, row: milieu };
      const f = fortificationAt(combat, hex);
      const etat = f?.state ?? 0;
      const c = this.geo.local(hex);
      const texte = donneeClaire(
        `${SIEGE_SEGMENT_NAMES[i] ?? `Segment ${i + 1}`} — ${['intact', 'fissuré', 'effondré'][etat]}`,
        12,
        etat === 0
          ? melanger(PALETTE.parchemin, LIGHT.chaude, 0.3)
          : etat === 1
            ? melanger(PALETTE.ocre, LIGHT.chaude, 0.3)
            : melanger(PALETTE.grenat, PALETTE.parchemin, 0.4),
        true,
      );
      texte.anchor.set(0, 0.5);
      texte.position.set(c.x + t * 0.9, c.y * this.geo.etirement);
      this.etiquettes.addChild(texte);
    }
  }

  /** Oriflamme au sommet d'une tour : elle bat au vent en permanence. */
  private planterOriflamme(x: number, y: number): void {
    const g = new Graphics();
    g.position.set(x, y);
    this.container.addChild(g);
    this.oriflammes.push({ g, x, y, phase: (x * 13 + y * 7) % 100 / 100 });
  }

  /** Volée d'une tour : le trait part du sommet et retombe sur la cible. */
  volee(depuis: HexCoord, vers: { x: number; y: number }, tracer: (a: { x: number; y: number }, b: { x: number; y: number }) => void): void {
    const c = this.geo.local(depuis);
    tracer({ x: c.x, y: (c.y - this.geo.taille * 2.4) * this.geo.etirement }, vers);
  }

  update(dtMs: number): void {
    if (this.reducedMotion) return;
    this.horloge += dtMs / 1000;
    for (const o of this.oriflammes) {
      const g = o.g;
      g.clear();
      const t = this.geo.taille;
      const w = (Math.PI * 2) / 4.3;
      const onde = Math.sin(this.horloge * w + o.phase * 6.28);
      const points: Poly = [];
      const L = t * 1.1;
      for (let i = 0; i <= 6; i += 1) {
        const k = i / 6;
        points.push({ x: k * L, y: -t * 0.5 + Math.sin(k * 3 + this.horloge * 2.1 + o.phase * 6) * 2.4 * k });
      }
      for (let i = 6; i >= 0; i -= 1) {
        const k = i / 6;
        points.push({ x: k * L, y: -t * 0.5 + t * 0.34 + Math.sin(k * 3 + this.horloge * 2.1 + o.phase * 6) * 2.4 * k });
      }
      g.poly(flat(points)).fill({ color: melanger(PALETTE.grenat, LIGHT.chaude, 0.16) });
      g.poly(flat(points.slice(0, 7))).stroke({ color: LIGHT.rim, width: 1.2, alpha: LIGHT.rimAlpha });
      g.moveTo(0, -t * 0.72).lineTo(0, t * 0.2);
      g.stroke({ color: melanger(PALETTE.brunFougere, LIGHT.chaude, 0.2), width: 2.2, alpha: 0.9 });
      g.rotation = onde * 0.012;
      /* l'atlas fournit les matières ; ici la bannière est peinte à la main
         pour rester attachée à la hampe de la tour. */
      void this.atlas;
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.projectiles.destroy({ children: true });
  }
}

/** Ligne de rempart, pour informer les panneaux. */
export function colonneDuRempart(): number {
  return SIEGE_WALL_COL;
}

/** Ligne de la porte, pour centrer la caméra d'un siège. */
export function ligneDeLaPorte(): number {
  return SIEGE_GATE_ROW;
}

/** Segment d'un hexagone, tel que le moteur le définit. */
export function segmentDe(at: HexCoord): number | null {
  return segmentOf(at);
}
