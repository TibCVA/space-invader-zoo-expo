/**
 * `battle/vfx.ts` — ce qui vole, éclabousse et s'efface.
 *
 * Impacts, poussière de foulée, étincelles d'acier, sang stylisé (discret :
 * quelques gouttes teintées de grenat, jamais une giclée), nombres de pertes
 * qui montent et s'effacent, et la secousse d'écran **bornée** qui accompagne
 * un coup lourd.
 *
 * Tous les effets sont éphémères et se nettoient seuls. Rien ici ne lit ni ne
 * modifie l'état du moteur : la couche reçoit des positions et des nombres.
 */

import { Container, Graphics, Text } from 'pixi.js';
import type { ArtAtlas, Effet } from '../art/index.js';
import { LIGHT, PALETTE, assombrir, eclaircir, melanger } from '../art/palette.js';
import { blob, flat } from '../art/shading.js';
import { donnee, titre } from './parchemin.js';

interface Ephemere {
  noeud: Container;
  vie: number;
  duree: number;
  /** appliqué à chaque image, `t` allant de 0 à 1 */
  animer(noeud: Container, t: number, dt: number): void;
}

/** Secousse d'écran amortie, d'amplitude bornée (jamais plus de 7 px). */
export class Secousse {
  private amplitude = 0;
  private temps = 0;
  readonly decalage = { x: 0, y: 0 };

  declencher(force: number): void {
    this.amplitude = Math.max(this.amplitude, Math.min(7, force));
    this.temps = 0;
  }

  update(dtMs: number): void {
    if (this.amplitude <= 0.02) {
      this.decalage.x = 0;
      this.decalage.y = 0;
      return;
    }
    this.temps += dtMs / 1000;
    const amorti = Math.exp(-7.5 * this.temps);
    const a = this.amplitude * amorti;
    this.decalage.x = Math.sin(this.temps * 54) * a;
    this.decalage.y = Math.cos(this.temps * 41) * a * 0.5;
    if (amorti < 0.02) {
      this.amplitude = 0;
      this.decalage.x = 0;
      this.decalage.y = 0;
    }
  }
}

/* ═════════════════════════════ La couche ═════════════════════════════════ */

/**
 * Les quatre natures de trait, et ce qui les distingue en vol.
 *
 * `arc` est la part de la portée reprise en hauteur de courbe, `traine` la
 * fraction de vol que la traînée laisse voir derrière la tête, `fer` teinte le
 * trait vers l'acier plutôt que vers le bois.
 */
export type NatureTrait = 'carreau' | 'fleche' | 'pierre' | 'trait';

interface Trait {
  arc: number;
  arcMax: number;
  traine: number;
  epaisseur: number;
  tete: number;
  aplati: number;
  empenne: boolean;
  fer: boolean;
}

/** La table des natures, exposée pour que les tests puissent la lire. */
export const TRAITS_LISIBLES: Readonly<Record<NatureTrait, Trait>> = {
  /* Le carreau d'arbalète : tendu, presque droit, court et lourd de fer. */
  carreau: { arc: 0.07, arcMax: 22, traine: 0.09, epaisseur: 3.2, tete: 2.4, aplati: 0.7, empenne: false, fer: true },
  /* La flèche de chasse : longue courbe, hampe fine, empennage visible. */
  fleche: { arc: 0.2, arcMax: 62, traine: 0.16, epaisseur: 2.2, tete: 2.2, aplati: 0.55, empenne: true, fer: false },
  /* La pierre de fronde ou de tour : monte haut, retombe, masse ronde. */
  pierre: { arc: 0.34, arcMax: 96, traine: 0.06, epaisseur: 2, tete: 4.2, aplati: 1, empenne: false, fer: false },
  /* Tout le reste : un jet quelconque, celui d'avant. */
  trait: { arc: 0.22, arcMax: 70, traine: 0.12, epaisseur: 2.6, tete: 2.6, aplati: 0.77, empenne: false, fer: false },
};

export class CoucheVfx {
  readonly container = new Container();
  readonly secousse = new Secousse();

  private readonly ephemeres: Ephemere[] = [];
  private readonly effets: { effet: Effet; vie: number; duree: number }[] = [];

  constructor(
    private readonly atlas: ArtAtlas,
    private readonly reducedMotion: boolean,
  ) {
    this.container.label = 'vfx';
    this.container.sortableChildren = true;
  }

  /* ─────────────────────────────── Impacts ─────────────────────────────── */

  /** Éclat d'impact : anneau de choc, éclats et étincelles, en trois strates. */
  impact(x: number, y: number, force = 1, teinte: number = PALETTE.ocre): void {
    if (this.reducedMotion) return;
    const g = new Graphics();
    g.position.set(x, y);
    g.zIndex = 40;
    this.container.addChild(g);
    const rayons: { a: number; l: number; w: number }[] = [];
    for (let i = 0; i < 9; i += 1) {
      const a = (i / 9) * Math.PI * 2 + (i % 3) * 0.21;
      rayons.push({ a, l: (12 + (i % 4) * 7) * force, w: 1.4 + (i % 3) * 0.9 });
    }
    this.pousser(g, 0.42, (noeud, t) => {
      const gg = noeud as Graphics;
      gg.clear();
      const k = 1 - (1 - t) * (1 - t);
      const alpha = 1 - t;
      /* anneau de choc */
      gg.poly(flat(blob(0, 0, 8 + 26 * k * force, 6 + 19 * k * force, { seed: 3, points: 18, wobble: 0.24 }))).stroke({
        color: melanger(teinte, LIGHT.chaude, 0.55),
        width: 2.6 * (1 - t * 0.7),
        alpha: alpha * 0.75,
      });
      /* éclats */
      for (const r of rayons) {
        const l = r.l * k;
        gg.moveTo(Math.cos(r.a) * l * 0.28, Math.sin(r.a) * l * 0.28);
        gg.lineTo(Math.cos(r.a) * l, Math.sin(r.a) * l);
      }
      gg.stroke({ color: LIGHT.chaude, width: 1.7 * (1 - t * 0.6), alpha: alpha * 0.7, cap: 'round' });
      /* cœur chaud */
      gg.poly(flat(blob(0, 0, 9 * (1 - t) * force, 7 * (1 - t) * force, { seed: 9, points: 12, wobble: 0.3 }))).fill({
        color: LIGHT.chaude,
        alpha: alpha * 0.6,
      });
    });
    this.effet('impact', x, y, 0.6, force);
    this.effet('etincelles', x, y, 0.7, force * 0.8);
  }

  /** Poussière soulevée par une foulée ou une chute. */
  poussiere(x: number, y: number, force = 1): void {
    if (this.reducedMotion) return;
    this.effet('poussiere', x, y, 0.9, force);
  }

  /**
   * Sang stylisé : quelques gouttes de grenat assombri, posées au sol et
   * fondues en deux secondes. Discret — le jeu n'est pas gore.
   */
  sang(x: number, y: number, quantite = 1): void {
    if (this.reducedMotion) return;
    const g = new Graphics();
    g.position.set(x, y);
    g.zIndex = 5;
    this.container.addChild(g);
    const n = Math.min(7, 2 + Math.round(quantite * 3));
    const gouttes: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < n; i += 1) {
      const a = (i / n) * Math.PI * 2 + i * 0.4;
      const d = 5 + (i % 4) * 6;
      gouttes.push({ x: Math.cos(a) * d, y: Math.sin(a) * d * 0.48, r: 1.4 + (i % 3) * 1.1 });
    }
    this.pousser(g, 1.9, (noeud, t) => {
      const gg = noeud as Graphics;
      gg.clear();
      const alpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      for (const d of gouttes) {
        const k = Math.min(1, t * 4);
        gg.poly(flat(blob(d.x * k, d.y * k, d.r, d.r * 0.7, { seed: Math.round(d.x * 7), points: 9, wobble: 0.32 }))).fill({
          color: assombrir(PALETTE.grenat, 0.35),
          alpha: alpha * 0.62,
        });
        gg.poly(flat(blob(d.x * k - d.r * 0.2, d.y * k - d.r * 0.24, d.r * 0.35, d.r * 0.26, { seed: 4, points: 7, wobble: 0.3 }))).fill({
          color: melanger(PALETTE.grenat, LIGHT.chaude, 0.35),
          alpha: alpha * 0.4,
        });
      }
    });
  }

  /* ───────────────────────────── Nombres ───────────────────────────────── */

  /**
   * Nombre de pertes : il monte de vingt pixels, s'agrandit d'un souffle puis
   * s'efface. Le chiffre vient du journal du moteur, la vue ne le calcule pas.
   */
  nombrePertes(x: number, y: number, degats: number, pertes: number): void {
    const racine = new Container();
    racine.position.set(x, y);
    racine.zIndex = 60;

    const principal = titre(`−${degats}`, 24, melanger(PALETTE.grenat, LIGHT.chaude, 0.32));
    principal.anchor.set(0.5, 1);
    principal.style.stroke = { color: assombrir(PALETTE.grenat, 0.7), width: 3.4, join: 'round' };
    principal.style.dropShadow = {
      color: LIGHT.ombrePortee,
      alpha: 0.6,
      angle: Math.PI / 4,
      blur: 3,
      distance: 2,
    };
    racine.addChild(principal);

    if (pertes > 0) {
      const sous = donnee(
        `${pertes} ${pertes > 1 ? 'pertes' : 'perte'}`,
        14,
        melanger(PALETTE.parchemin, LIGHT.chaude, 0.4),
        true,
      );
      sous.anchor.set(0.5, 0);
      sous.position.set(0, 2);
      sous.style.stroke = { color: LIGHT.ombrePortee, width: 3, join: 'round' };
      racine.addChild(sous);
    }

    this.container.addChild(racine);
    this.pousser(racine, 1.5, (noeud, t) => {
      const e = 1 - Math.pow(1 - Math.min(1, t * 1.6), 3);
      noeud.y = y - 34 * e;
      noeud.alpha = t < 0.12 ? t / 0.12 : t > 0.62 ? 1 - (t - 0.62) / 0.38 : 1;
      const s = t < 0.14 ? 0.7 + (t / 0.14) * 0.42 : 1.06 - (t - 0.14) * 0.06;
      noeud.scale.set(s);
    });
  }

  /** Mention brève au-dessus d'une pile : « Riposte », « Élan », « Défense ». */
  mention(x: number, y: number, texte: string, couleur: number = LIGHT.rim): void {
    const t = titre(texte, 16, melanger(couleur, LIGHT.chaude, 0.35));
    t.anchor.set(0.5, 1);
    t.style.stroke = { color: LIGHT.ombrePortee, width: 3.2, join: 'round' };
    t.position.set(x, y);
    t.zIndex = 58;
    this.container.addChild(t);
    this.pousser(t, 1.15, (noeud, k) => {
      noeud.y = y - 22 * (1 - Math.pow(1 - Math.min(1, k * 1.5), 3));
      noeud.alpha = k < 0.15 ? k / 0.15 : k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
    });
  }

  /* ────────────────────────────── Traits ───────────────────────────────── */

  /**
   * Trait de projectile.
   *
   * Le commentaire annonçait « flèche, carreau ou bloc de pierre » et une
   * seule géométrie était dessinée, avec une teinte codée en dur à l'appel :
   * l'arbalétrier des Farges, le veneur sylvestre et une tour de siège
   * lançaient rigoureusement le même trait brun. Chaque nature a maintenant sa
   * ligne de vol, son épaisseur et sa tête, parce que c'est à cela qu'on
   * reconnaît qui tire — un carreau file droit, une flèche décrit sa courbe,
   * une pierre monte et retombe.
   */
  projectile(
    depuis: { x: number; y: number },
    vers: { x: number; y: number },
    duree = 0.34,
    teinte: number = PALETTE.brunFougere,
    nature: NatureTrait = 'trait',
  ): void {
    const g = new Graphics();
    g.zIndex = 45;
    this.container.addChild(g);
    const dx = vers.x - depuis.x;
    const dy = vers.y - depuis.y;
    const portee = Math.hypot(dx, dy);
    const t = TRAITS_LISIBLES[nature];
    const arc = Math.min(t.arcMax, portee * t.arc);
    const teinteTrait = t.fer ? melanger(teinte, PALETTE.granitClair, 0.55) : teinte;
    this.pousser(g, duree, (noeud, u) => {
      const gg = noeud as Graphics;
      gg.clear();
      const x = depuis.x + dx * u;
      const y = depuis.y + dy * u - Math.sin(Math.PI * u) * arc;
      const uq = Math.max(0, u - t.traine);
      const xp = depuis.x + dx * uq;
      const yp = depuis.y + dy * uq - Math.sin(Math.PI * uq) * arc;
      gg.moveTo(xp, yp).lineTo(x, y).stroke({
        color: melanger(teinteTrait, LIGHT.chaude, 0.3),
        width: t.epaisseur,
        alpha: 0.9,
        cap: 'round',
      });
      gg.moveTo(xp, yp).lineTo(x, y).stroke({
        color: LIGHT.rim,
        width: 1,
        alpha: LIGHT.rimAlpha + 0.25,
        cap: 'round',
      });
      // La tête : pointe fine pour un carreau, masse ronde pour une pierre.
      gg.poly(flat(blob(x, y, t.tete, t.tete * t.aplati, { seed: 3, points: 8, wobble: 0.3 }))).fill({
        color: eclaircir(teinteTrait, 0.5),
        alpha: 0.95,
      });
      // L'empennage d'une flèche : deux barbes en arrière de la hampe.
      if (t.empenne && portee > 1) {
        const nx = dx / portee;
        const ny = dy / portee;
        for (const s of [-1, 1]) {
          gg.moveTo(xp, yp);
          gg.lineTo(xp - nx * 4 + ny * 2.6 * s, yp - ny * 4 - nx * 2.6 * s);
        }
        gg.stroke({ color: eclaircir(teinteTrait, 0.35), width: 1.2, alpha: 0.8, cap: 'round' });
      }
    });
  }

  /* ─────────────────────────── Effets d'atlas ──────────────────────────── */

  /** Ajoute un effet de particules de l'atlas, positionné et daté. */
  effet(
    kind: 'poussiere' | 'fumee' | 'etincelles' | 'brume' | 'impact' | 'eclat_or' | 'feuilles' | 'givre' | 'pluie',
    x: number,
    y: number,
    duree: number,
    intensite = 1,
  ): void {
    if (this.reducedMotion) return;
    const e = this.atlas.effet(kind, { intensite, duree, largeur: 26, hauteur: 18 });
    e.position.set(x, y);
    e.zIndex = 42;
    this.container.addChild(e);
    this.effets.push({ effet: e, vie: 0, duree: duree + 1.6 });
  }

  /** Aura d'école posée sur une case, le temps d'un sort. */
  aura(ecole: 'braises' | 'sources' | 'brumes' | 'racines', x: number, y: number, duree = 1.2): void {
    if (this.reducedMotion) return;
    const e = this.atlas.auraSort(ecole, { intensite: 1.3, duree, largeur: 44, hauteur: 40 });
    e.position.set(x, y);
    e.zIndex = 44;
    this.container.addChild(e);
    this.effets.push({ effet: e, vie: 0, duree: duree + 1.8 });
  }

  /* ────────────────────────────── Boucle ───────────────────────────────── */

  private pousser(
    noeud: Container,
    duree: number,
    animer: (noeud: Container, t: number, dt: number) => void,
  ): void {
    this.ephemeres.push({ noeud, vie: 0, duree, animer });
    animer(noeud, 0, 0);
  }

  update(dtMs: number): void {
    const s = Math.min(0.1, dtMs / 1000);
    this.secousse.update(dtMs);
    for (let i = this.ephemeres.length - 1; i >= 0; i -= 1) {
      const e = this.ephemeres[i];
      e.vie += s;
      const t = Math.min(1, e.vie / e.duree);
      e.animer(e.noeud, t, s);
      if (e.vie >= e.duree) {
        e.noeud.destroy({ children: true });
        this.ephemeres.splice(i, 1);
      }
    }
    for (let i = this.effets.length - 1; i >= 0; i -= 1) {
      const e = this.effets[i];
      e.vie += s;
      e.effet.update(s);
      if (e.vie >= e.duree) {
        e.effet.destroy({ children: true });
        this.effets.splice(i, 1);
      }
    }
  }

  /** Vide la couche : utilisé au redimensionnement, la géométrie a changé. */
  vider(): void {
    for (const e of this.ephemeres) e.noeud.destroy({ children: true });
    this.ephemeres.length = 0;
    for (const e of this.effets) e.effet.destroy({ children: true });
    this.effets.length = 0;
  }

  destroy(): void {
    this.vider();
    this.container.destroy({ children: true });
  }
}

/** Texte de dégâts hors couche, pour les tests visuels. */
export function texteDegats(valeur: number): Text {
  return titre(`−${valeur}`, 22, PALETTE.grenat);
}
