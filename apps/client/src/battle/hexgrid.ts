/**
 * `battle/hexgrid.ts` — la géométrie du plateau et toutes ses surbrillances.
 *
 * Deux choses vivent ici :
 *
 *  1. `Geometrie`, la conversion pixel ↔ hexagone. Elle **délègue au moteur**
 *     (`hexToPixel`, `pixelToHex`, `hexCorners` de `packages/engine/src/combat/hex.ts`) :
 *     la vue ne réinvente jamais la trame « odd-r » 15 × 11.
 *  2. `CoucheGrille`, la couche de marques posées dans le sol : cases
 *     atteignables, chemin prévisualisé en perles dorées, zones de menace
 *     ennemies (maintien d'une touche), curseur d'attaque indiquant la
 *     direction de frappe, survol, et cases visées par un sort.
 *
 * Aucune règle n'est calculée : les listes d'hexagones arrivent toutes faites
 * de `reachableHexes`, `hexPath` et `spellTargets`.
 */

import { Container, Graphics } from 'pixi.js';
import {
  HEX_COLS,
  HEX_ROWS,
  directionTo,
  hexCorners,
  hexKey,
  hexEquals,
  hexToPixel,
  clampHex,
  pixelToHex,
} from '@auvergne/engine';
import type { HexCoord } from '@auvergne/engine';
import {
  LIGHT,
  PALETTE,
  assombrir,
  eclaircir,
  faceEclairee,
  melanger,
  ombreBleutee,
} from '../art/palette.js';
import { blob, flat } from '../art/shading.js';
import type { Poly, Pt } from '../art/shading.js';

/* ═══════════════════════════════ Géométrie ═══════════════════════════════ */

/**
 * Cadrage du plateau à l'écran. `etirement` allonge légèrement la grille en
 * hauteur sur téléphone tenu à la verticale : la trame logique ne change pas,
 * seule sa projection s'étire (docs — interface, mode portrait).
 */
export class Geometrie {
  /** rayon d'un hexagone, centre → sommet, en pixels */
  readonly taille: number;
  /** position écran du centre de l'hexagone (0, 0) */
  readonly origine: Pt;
  readonly etirement: number;

  constructor(taille: number, origine: Pt, etirement = 1) {
    this.taille = taille;
    this.origine = origine;
    this.etirement = etirement;
  }

  /** Centre d'un hexagone dans l'espace **non étiré** du plateau. */
  local(h: HexCoord): Pt {
    return hexToPixel(h, this.taille);
  }

  /** Centre d'un hexagone en pixels écran (étirement compris). */
  centre(h: HexCoord): Pt {
    const p = hexToPixel(h, this.taille);
    return { x: this.origine.x + p.x, y: this.origine.y + p.y * this.etirement };
  }

  /** Sommets d'un hexagone dans l'espace non étiré, relatifs à son centre. */
  sommetsLocaux(): Poly {
    const c = hexCorners({ col: 0, row: 0 }, this.taille);
    return c.map((p) => ({ x: p.x, y: p.y }));
  }

  /** Sommets d'un hexagone dans l'espace non étiré du plateau. */
  sommets(h: HexCoord, retrait = 0): Poly {
    const c = hexToPixel(h, this.taille);
    const k = 1 - retrait;
    return hexCorners({ col: 0, row: 0 }, this.taille).map((p) => ({
      x: c.x + p.x * k,
      y: c.y + p.y * k,
    }));
  }

  /** Hexagone sous un point écran, `null` hors plateau. */
  hexAt(x: number, y: number): HexCoord | null {
    const h = pixelToHex(
      Math.round(x - this.origine.x),
      Math.round((y - this.origine.y) / this.etirement),
      this.taille,
    );
    /* `inBounds` du baril est celle de la carte : on borne par le moteur. */
    return hexEquals(h, clampHex(h)) ? h : null;
  }

  /** Demi-largeur d'un hexagone (centre → arête latérale). */
  get demiLargeur(): number {
    return (this.taille * Math.sqrt(3)) / 2;
  }

  /**
   * Boîte englobante exacte du plateau dans l'espace non étiré, relative au
   * centre de l'hexagone (0, 0).
   */
  get boite(): { x: number; y: number; largeur: number; hauteur: number } {
    const hw = this.demiLargeur;
    const droite = hexToPixel({ col: HEX_COLS - 1, row: 1 }, this.taille).x;
    const bas = hexToPixel({ col: 0, row: HEX_ROWS - 1 }, this.taille).y;
    return {
      x: -hw,
      y: -this.taille,
      largeur: droite + 2 * hw,
      hauteur: bas + 2 * this.taille,
    };
  }
}

/**
 * Choisit le rayon d'hexagone et l'origine pour tenir dans la zone offerte.
 * Le plateau est centré ; aucun hexagone n'est jamais coupé.
 */
export function cadrerPlateau(
  x: number,
  y: number,
  largeur: number,
  hauteur: number,
  etirement = 1,
): Geometrie {
  /* largeur d'un hexagone = √3 × taille ; le plateau fait 15,5 largeurs. */
  const parLargeur = largeur / (Math.sqrt(3) * (HEX_COLS + 0.5));
  const parHauteur = hauteur / (etirement * (1.5 * (HEX_ROWS - 1) + 2));
  const taille = Math.max(14, Math.floor(Math.min(parLargeur, parHauteur)));
  const boite = new Geometrie(taille, { x: 0, y: 0 }, etirement).boite;
  const ox = x + (largeur - boite.largeur) / 2 - boite.x;
  const oy = y + (hauteur - boite.hauteur * etirement) / 2 - boite.y * etirement;
  return new Geometrie(taille, { x: Math.round(ox), y: Math.round(oy) }, etirement);
}

/* ═════════════════════════════ Couche de marques ═════════════════════════ */

/** Ce que la couche affiche ; tout vient du moteur, rien n'est déduit ici. */
export interface EtatMarques {
  atteignables: readonly HexCoord[];
  chemin: readonly HexCoord[] | null;
  menaces: readonly HexCoord[];
  ciblesSort: readonly HexCoord[] | null;
  /** teinte d'école pour les cases visées par un sort */
  ecole: number;
  survol: HexCoord | null;
  /** hexagone de la pile active, mis en avant */
  active: HexCoord | null;
  /** cible d'attaque et case de départ, pour le curseur directionnel */
  curseur: { depuis: HexCoord; vers: HexCoord } | null;
}

const VIDE: EtatMarques = {
  atteignables: [],
  chemin: null,
  menaces: [],
  ciblesSort: null,
  ecole: PALETTE.bleuBrume,
  survol: null,
  active: null,
  curseur: null,
};

/**
 * Toutes les marques posées **dans le sol** du champ de bataille. Elle vit
 * dans le conteneur étiré du plateau, sous les piles.
 */
export class CoucheGrille {
  readonly container = new Container();

  private readonly statique = new Graphics();
  private readonly pulsee = new Graphics();
  private readonly perles = new Graphics();
  private etat: EtatMarques = { ...VIDE };
  private horloge = 0;

  constructor(
    private readonly geo: Geometrie,
    private readonly reducedMotion: boolean,
  ) {
    this.container.label = 'marques-grille';
    this.container.addChild(this.statique, this.pulsee, this.perles);
  }

  set(partiel: Partial<EtatMarques>): void {
    this.etat = { ...this.etat, ...partiel };
    this.peindre();
  }

  effacer(): void {
    this.etat = { ...VIDE };
    this.peindre();
  }

  update(dtMs: number): void {
    if (this.reducedMotion) return;
    this.horloge += dtMs / 1000;
    /* Respiration lente des surbrillances : loi n°7, amplitude imperceptible. */
    const w = (Math.PI * 2) / 3.4;
    this.pulsee.alpha = 0.72 + Math.sin(this.horloge * w) * 0.14;
    this.perles.alpha = 0.86 + Math.sin(this.horloge * w * 1.37 + 1.1) * 0.1;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  /* ────────────────────────────── Peinture ─────────────────────────────── */

  private peindre(): void {
    this.peindreStatique();
    this.peindrePulsee();
    this.peindrePerles();
  }

  /** Zones de menace et cases atteignables : deux nappes teintées, jamais plates. */
  private peindreStatique(): void {
    const g = this.statique;
    g.clear();

    if (this.etat.menaces.length > 0) {
      const vus = new Set<number>();
      for (const h of this.etat.menaces) {
        const k = hexKey(h);
        if (vus.has(k)) continue;
        vus.add(k);
        const poly = this.geo.sommets(h, 0.06);
        const pts = flat(poly);
        g.poly(pts).fill({ color: PALETTE.grenat, alpha: 0.2 });
        g.poly(pts).fill({ color: assombrir(PALETTE.grenat, 0.6), alpha: 0.12 });
        /* hachure oblique : la couleur seule ne suffit pas (accessibilité) */
        const c = this.geo.local(h);
        const r = this.geo.taille;
        for (let i = -2; i <= 2; i += 1) {
          const o = i * r * 0.36;
          g.moveTo(c.x - r * 0.6 + o, c.y + r * 0.66)
            .lineTo(c.x + r * 0.6 + o, c.y - r * 0.66)
            .stroke({ color: melanger(PALETTE.grenat, LIGHT.chaude, 0.35), width: 1.1, alpha: 0.24 });
        }
        g.poly(pts, true).stroke({ color: melanger(PALETTE.grenat, LIGHT.rim, 0.3), width: 1.2, alpha: 0.42 });
      }
    }

    for (const h of this.etat.atteignables) {
      const poly = this.geo.sommets(h, 0.1);
      const pts = flat(poly);
      const c = this.geo.local(h);
      const r = this.geo.taille;
      /* strate 1 : teinte ; strate 2 : cœur plus clair ; strate 3 : granulé */
      g.poly(pts).fill({ color: melanger(PALETTE.vertHetre, LIGHT.chaude, 0.4), alpha: 0.17 });
      g.poly(flat(blob(c.x, c.y, r * 0.5, r * 0.44, { seed: hexKey(h) + 3, points: 12, wobble: 0.2 }))).fill({
        color: LIGHT.chaude,
        alpha: 0.07,
      });
      g.poly(pts, true).stroke({ color: melanger(LIGHT.rim, PALETTE.vertHetre, 0.35), width: 1.2, alpha: 0.5 });
      /* le liseré doré ne fait pas le tour : il tient les arêtes au sud-est */
      g.moveTo(poly[2].x, poly[2].y).lineTo(poly[3].x, poly[3].y).lineTo(poly[4].x, poly[4].y);
      g.stroke({ color: LIGHT.rim, width: 1.4, alpha: LIGHT.rimAlpha });
    }

    if (this.etat.ciblesSort) {
      for (const h of this.etat.ciblesSort) {
        const poly = this.geo.sommets(h, 0.04);
        const pts = flat(poly);
        const c = this.geo.local(h);
        const r = this.geo.taille;
        g.poly(pts).fill({ color: this.etat.ecole, alpha: 0.22 });
        g.poly(flat(blob(c.x, c.y, r * 0.66, r * 0.58, { seed: hexKey(h) + 41, points: 14, wobble: 0.26 }))).fill({
          color: eclaircir(this.etat.ecole, 0.7),
          alpha: 0.16,
        });
        g.poly(pts, true).stroke({ color: eclaircir(this.etat.ecole, 0.55), width: 1.6, alpha: 0.66 });
      }
    }
  }

  /** Pile active, survol et curseur d'attaque : la couche qui respire. */
  private peindrePulsee(): void {
    const g = this.pulsee;
    g.clear();

    if (this.etat.active) {
      const poly = this.geo.sommets(this.etat.active, 0.02);
      const pts = flat(poly);
      g.poly(pts).fill({ color: LIGHT.rim, alpha: 0.1 });
      g.poly(pts, true).stroke({ color: LIGHT.rim, width: 2.6, alpha: 0.82 });
      g.poly(flat(this.geo.sommets(this.etat.active, 0.13)), true).stroke({
        color: melanger(LIGHT.rim, LIGHT.chaude, 0.55),
        width: 1,
        alpha: 0.45,
      });
    }

    if (this.etat.survol) {
      const poly = this.geo.sommets(this.etat.survol, 0.05);
      g.poly(flat(poly), true).stroke({
        color: melanger(LIGHT.chaude, PALETTE.parchemin, 0.3),
        width: 1.8,
        alpha: 0.7,
      });
    }

    if (this.etat.curseur) {
      this.peindreCurseur(g, this.etat.curseur.depuis, this.etat.curseur.vers);
    }
  }

  /**
   * Curseur d'attaque : une pointe de lance posée sur l'arête frappée, orientée
   * par `directionTo` du moteur. Le joueur voit d'où le coup part.
   */
  private peindreCurseur(g: Graphics, depuis: HexCoord, vers: HexCoord): void {
    const a = this.geo.local(depuis);
    const b = this.geo.local(vers);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const r = this.geo.taille;

    /* halo de la case visée */
    const poly = this.geo.sommets(vers, 0.02);
    const pts = flat(poly);
    g.poly(pts).fill({ color: PALETTE.grenat, alpha: 0.24 });
    g.poly(pts, true).stroke({ color: melanger(PALETTE.grenat, LIGHT.rim, 0.5), width: 2.4, alpha: 0.9 });

    /* hampe et fer, posés sur le bord attaqué */
    const px = b.x - ux * r * 0.98;
    const py = b.y - uy * r * 0.98;
    const nx = -uy;
    const ny = ux;
    const pointe: Poly = [
      { x: px + ux * r * 0.52, y: py + uy * r * 0.52 },
      { x: px + nx * r * 0.3, y: py + ny * r * 0.3 },
      { x: px - ux * r * 0.12, y: py - uy * r * 0.12 },
      { x: px - nx * r * 0.3, y: py - ny * r * 0.3 },
    ];
    g.poly(flat(pointe)).fill({ color: melanger(PALETTE.ocre, LIGHT.chaude, 0.35), alpha: 0.95 });
    g.poly(flat(pointe), true).stroke({ color: assombrir(PALETTE.ocre, 0.5), width: 1.2, alpha: 0.9 });
    g.moveTo(px - ux * r * 0.16, py - uy * r * 0.16)
      .lineTo(px - ux * r * 0.72, py - uy * r * 0.72)
      .stroke({ color: melanger(PALETTE.brunFougere, LIGHT.chaude, 0.2), width: 3, alpha: 0.85, cap: 'round' });
    g.moveTo(px + ux * r * 0.5, py + uy * r * 0.5)
      .lineTo(px + nx * r * 0.26, py + ny * r * 0.26)
      .stroke({ color: LIGHT.rim, width: 1.1, alpha: LIGHT.rimAlpha + 0.2 });
  }

  /** Chemin prévisualisé : perles dorées, une par hexagone, plus l'arrivée. */
  private peindrePerles(): void {
    const g = this.perles;
    g.clear();
    const chemin = this.etat.chemin;
    if (!chemin || chemin.length < 2) return;
    const r = this.geo.taille;

    /* ruban sombre sous les perles : la trace se lit sur tous les terrains */
    for (let i = 0; i < chemin.length - 1; i += 1) {
      const a = this.geo.local(chemin[i]);
      const b = this.geo.local(chemin[i + 1]);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    g.stroke({ color: ombreBleutee(PALETTE.brunFougere, 0.8), width: r * 0.2, alpha: 0.4, cap: 'round', join: 'round' });
    for (let i = 0; i < chemin.length - 1; i += 1) {
      const a = this.geo.local(chemin[i]);
      const b = this.geo.local(chemin[i + 1]);
      g.moveTo(a.x, a.y).lineTo(b.x, b.y);
    }
    g.stroke({ color: melanger(LIGHT.rim, LIGHT.chaude, 0.35), width: r * 0.07, alpha: 0.5, cap: 'round' });

    for (let i = 1; i < chemin.length; i += 1) {
      const c = this.geo.local(chemin[i]);
      const dernier = i === chemin.length - 1;
      const rr = dernier ? r * 0.3 : r * 0.15;
      /* trois strates par perle : creux, corps, éclat */
      g.poly(flat(blob(c.x + rr * 0.24, c.y + rr * 0.3, rr * 1.1, rr * 0.86, { seed: i * 7 + 2, points: 11, wobble: 0.16 }))).fill({
        color: LIGHT.ombrePortee,
        alpha: 0.34,
      });
      g.poly(flat(blob(c.x, c.y, rr, rr * 0.92, { seed: i * 5 + 1, points: 12, wobble: 0.14 }))).fill({
        color: LIGHT.rim,
        alpha: 0.94,
      });
      g.poly(flat(blob(c.x - rr * 0.28, c.y - rr * 0.3, rr * 0.4, rr * 0.32, { seed: i * 3, points: 9, wobble: 0.24 }))).fill({
        color: LIGHT.chaude,
        alpha: 0.8,
      });
      if (dernier) {
        const poly = this.geo.sommets(chemin[i], 0.08);
        g.poly(flat(poly), true).stroke({ color: LIGHT.rim, width: 2, alpha: 0.85 });
      }
    }
  }
}

/* ════════════════════════ Aides d'orientation ════════════════════════════ */

/**
 * Direction dominante d'un hexagone vers un autre, telle que le moteur la
 * définit. Sert à orienter les piles et le curseur d'attaque.
 */
export function orientationVers(a: HexCoord, b: HexCoord): number {
  return directionTo(a, b);
}

/** `1` si la direction regarde vers l'est, `-1` vers l'ouest. */
export function faceDe(direction: number): 1 | -1 {
  const d = ((direction % 6) + 6) % 6;
  return d === 2 || d === 3 || d === 4 ? -1 : 1;
}

/** Teinte de sol légèrement variée d'un hexagone (utilisée par le champ). */
export function teinteHexagone(base: number, h: HexCoord, force = 1): number {
  const k = ((h.col * 7 + h.row * 13) % 5) / 4 - 0.5;
  return k > 0
    ? faceEclairee(base, 0.12 * force * k * 2)
    : ombreBleutee(base, 0.14 * force * -k * 2);
}
