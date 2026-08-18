/**
 * `battle/initiative.ts` — la barre d'initiative, en haut de l'écran.
 *
 * Elle affiche la file `CombatState.order` telle que le moteur l'a construite
 * (`buildInitiativeOrder`) : la vue ne trie rien. La pile active est mise en
 * avant, agrandie et soulignée d'or ; les piles qui ont patienté portent une
 * marque de sablier ; le numéro de round défile à gauche.
 */

import { Container, Graphics } from 'pixi.js';
import { effectiveInitiative, findUnit, unitDef } from '@auvergne/engine';
import type { CombatState, CombatUnit } from '@auvergne/engine';
import type { ArtAtlas } from '../art/index.js';
import {
  LIGHT,
  PALETTE,
  melanger,
  ombreBleutee,
} from '../art/palette.js';
import { blob, flat } from '../art/shading.js';
import { donnee, donneeClaire, plaqueGranit, titre } from './parchemin.js';
import { vignettePile, type Camp } from './units.js';

interface Vignette {
  uid: string;
  noeud: Container;
  cible: { x: number; y: number; s: number };
  courant: { x: number; y: number; s: number };
  phase: number;
}

/** La barre d'initiative complète : cartouche de round + file de vignettes. */
export class BarreInitiative {
  readonly container = new Container();

  private readonly fond = new Graphics();
  private readonly file = new Container();
  private readonly ornement = new Graphics();
  private readonly vignettes: Vignette[] = [];
  private largeur = 0;
  private hauteurBarre = 92;
  private tailleVignette = 58;
  private cleAffichee = '';
  private horloge = 0;
  private roundAffiche = -1;
  private texteRound: Container | null = null;

  constructor(
    private readonly atlas: ArtAtlas,
    private readonly camps: Readonly<Record<0 | 1, Camp>>,
    private readonly reducedMotion: boolean,
  ) {
    this.container.label = 'barre-initiative';
    this.file.label = 'file-initiative';
    this.container.addChild(this.fond, this.file, this.ornement);
  }

  get hauteur(): number {
    return this.hauteurBarre;
  }

  /** Redimensionne : la barre occupe toute la largeur utile. */
  disposer(largeur: number, compact: boolean): void {
    this.largeur = largeur;
    this.hauteurBarre = compact ? 68 : 92;
    this.tailleVignette = compact ? 42 : 58;
    this.cleAffichee = '';
    /* Le cartouche de round n'a pas la même largeur selon la hauteur de barre :
       sans cette remise à zéro, un cartouche large peint en paysage survivait au
       passage en portrait et recouvrait les trois premières vignettes. */
    this.roundAffiche = -1;
    this.peindreFond();
  }

  /**
   * Relit la file d'initiative. Le contenu n'est reconstruit que si l'ordre,
   * les effectifs ou le round ont changé.
   */
  sync(combat: CombatState, actif: string | null): void {
    const cle = `${combat.round}|${combat.order.join(',')}|${actif ?? ''}|${combat.units
      .map((u) => `${u.uid}:${u.count}:${u.hasWaited ? 1 : 0}`)
      .join(',')}`;
    if (cle === this.cleAffichee) return;
    this.cleAffichee = cle;

    if (combat.round !== this.roundAffiche) {
      this.roundAffiche = combat.round;
      this.peindreRound(combat);
    }

    const anciennes = new Map(this.vignettes.map((v) => [v.uid, v]));
    this.vignettes.length = 0;
    this.file.removeChildren();

    const unites: CombatUnit[] = [];
    for (const uid of combat.order) {
      const u = findUnit(combat, uid);
      if (u && u.alive && u.count > 0) unites.push(u);
    }

    const t = this.tailleVignette;
    const ecart = Math.round(t * 0.22);
    const debut = this.zoneFile.x;
    const largeurDispo = this.zoneFile.largeur;
    const pas = Math.min(t + ecart, largeurDispo / Math.max(1, unites.length));

    for (let i = 0; i < unites.length; i += 1) {
      const u = unites[i];
      const estActif = u.uid === actif;
      const noeud = new Container();
      const vign = vignettePile(this.atlas, u, this.camps[u.side], t, { actif: estActif });
      noeud.addChild(vign);
      noeud.pivot.set(t / 2, t / 2);

      /* initiative chiffrée sous la vignette : la file s'explique d'elle-même */
      const ini = donneeClaire(String(effectiveInitiative(combat, u)), 11, melanger(LIGHT.rim, LIGHT.chaude, 0.4), true);
      ini.anchor.set(0.5, 0);
      ini.position.set(t / 2, t + 2);
      noeud.addChild(ini);

      if (u.hasWaited) noeud.addChild(marqueSablier(t));
      if (unitDef(u).shooter) noeud.addChild(marqueTir(t));

      const s = estActif ? 1.16 : 1;
      const x = debut + t / 2 + i * pas;
      const y = this.zoneFile.y + t / 2 + (estActif ? -4 : 2);
      const ancienne = anciennes.get(u.uid);
      const courant = ancienne ? { ...ancienne.courant } : { x, y, s };
      this.vignettes.push({ uid: u.uid, noeud, cible: { x, y, s }, courant, phase: (i * 37) % 100 / 100 });
      noeud.position.set(courant.x, courant.y);
      noeud.scale.set(courant.s);
      noeud.zIndex = estActif ? 10 : 0;
      this.file.addChild(noeud);
      /* la vignette ne change qu'à la resynchronisation : entre deux, elle
         glisse et respire, mais son contenu est figé — donc mis en cache. */
      noeud.cacheAsTexture(true);
    }
    this.file.sortableChildren = true;
    this.peindreOrnement(unites.length, pas, debut, t, actif ? unites.findIndex((u) => u.uid === actif) : -1);
  }

  /** Zone occupée par la file, à droite du cartouche de round. */
  private get zoneFile(): { x: number; y: number; largeur: number } {
    const gauche = this.hauteurBarre > 80 ? 148 : 108;
    return {
      x: gauche,
      y: this.hauteurBarre > 80 ? 12 : 8,
      largeur: Math.max(120, this.largeur - gauche - 20),
    };
  }

  /** Vignette de la pile active à l'écran, pour poser un repère ailleurs. */
  positionDe(uid: string): { x: number; y: number } | null {
    const v = this.vignettes.find((w) => w.uid === uid);
    return v ? { x: v.courant.x, y: v.courant.y } : null;
  }

  update(dtMs: number): void {
    this.horloge += dtMs / 1000;
    const k = this.reducedMotion ? 1 : Math.min(1, dtMs / 90);
    for (const v of this.vignettes) {
      v.courant.x += (v.cible.x - v.courant.x) * k;
      v.courant.y += (v.cible.y - v.courant.y) * k;
      v.courant.s += (v.cible.s - v.courant.s) * k;
      const flottement = this.reducedMotion ? 0 : Math.sin(this.horloge * 1.1 + v.phase * 6.28) * 0.9;
      v.noeud.position.set(Math.round(v.courant.x), Math.round(v.courant.y + flottement));
      v.noeud.scale.set(v.courant.s);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  /* ─────────────────────────────── Peinture ────────────────────────────── */

  private peindreFond(): void {
    const g = this.fond;
    g.clear();
    const h = this.hauteurBarre;
    plaqueGranit(g, this.atlas.materials, 0, 0, this.largeur, h, { graine: 3, rayon: 2 });
    /* rail de la file : un creux dans la plaque, éclairé au nord-ouest */
    const z = this.zoneFile;
    const t = this.tailleVignette;
    g.roundRect(z.x - 8, z.y - 6, z.largeur + 16, t + 24, 3).fill({
      color: ombreBleutee(PALETTE.granitAnthracite, 0.95),
      alpha: 0.55,
    });
    g.moveTo(z.x - 8, z.y - 5).lineTo(z.x + z.largeur + 8, z.y - 5).stroke({
      color: LIGHT.ombrePortee,
      width: 2,
      alpha: 0.55,
    });
    g.moveTo(z.x - 8, z.y + t + 17).lineTo(z.x + z.largeur + 8, z.y + t + 17).stroke({
      color: LIGHT.chaude,
      width: 1.2,
      alpha: 0.12,
    });
  }

  /** Cartouche du round, à gauche : chiffres romains et filet d'or. */
  private peindreRound(combat: CombatState): void {
    this.texteRound?.destroy({ children: true });
    const hote = new Container();
    const large = this.hauteurBarre > 80;
    const w = large ? 128 : 92;
    const h = this.hauteurBarre - (large ? 24 : 18);
    const g = new Graphics();
    plaqueGranit(g, this.atlas.materials, 12, large ? 12 : 9, w, h, {
      teinte: melanger(PALETTE.granitAnthracite, PALETTE.grenat, 0.18),
      graine: 41,
      rayon: 2,
    });
    hote.addChild(g);

    const etiquette = donneeClaire('ROUND', large ? 12 : 11, melanger(LIGHT.rim, PALETTE.parchemin, 0.4), true);
    etiquette.anchor.set(0.5, 0);
    etiquette.position.set(12 + w / 2, (large ? 12 : 9) + 8);
    hote.addChild(etiquette);

    const chiffre = titre(String(combat.round), large ? 32 : 25, melanger(PALETTE.parchemin, LIGHT.chaude, 0.5));
    chiffre.anchor.set(0.5, 0);
    chiffre.position.set(12 + w / 2, (large ? 12 : 9) + (large ? 24 : 20));
    chiffre.style.dropShadow = {
      color: LIGHT.rim,
      alpha: 0.28,
      angle: Math.PI / 2,
      blur: 10,
      distance: 0,
    };
    hote.addChild(chiffre);

    if (large) {
      const meteo = donnee(
        `${combat.units.filter((u) => u.alive).length} piles`,
        11,
        melanger(PALETTE.bleuBrume, PALETTE.parchemin, 0.3),
      );
      meteo.anchor.set(0.5, 1);
      meteo.position.set(12 + w / 2, (large ? 12 : 9) + h - 6);
      hote.addChild(meteo);
    }

    this.texteRound = hote;
    this.container.addChild(hote);
  }

  /** Repère sous la pile active et dégradé de fin de file. */
  private peindreOrnement(
    nombre: number,
    pas: number,
    debut: number,
    t: number,
    indexActif: number,
  ): void {
    const g = this.ornement;
    g.clear();
    if (indexActif >= 0) {
      const x = debut + t / 2 + indexActif * pas;
      const y = this.zoneFile.y + t + 18;
      /* chevron doré : la pile qui joue ne se cherche pas */
      g.poly([x, y - 7, x + 8, y + 1, x - 8, y + 1]).fill({ color: LIGHT.rim, alpha: 0.95 });
      g.poly([x, y - 4, x + 4, y, x - 4, y]).fill({ color: LIGHT.chaude, alpha: 0.8 });
      g.poly(flat(blob(x, y + 6, 26, 3.4, { seed: 7, points: 16, wobble: 0.2 }))).fill({
        color: LIGHT.rim,
        alpha: 0.22,
      });
    }
    /* fondu de bord droit : la file peut déborder sans couper net */
    const z = this.zoneFile;
    if (nombre * pas > z.largeur) {
      for (let i = 0; i < 12; i += 1) {
        g.rect(z.x + z.largeur - 34 + i * 3, z.y - 6, 3, t + 24).fill({
          color: PALETTE.granitAnthracite,
          alpha: (i / 11) * 0.8,
        });
      }
    }
  }
}

/* ═══════════════════════════ Petites marques ═════════════════════════════ */

/** Sablier : la pile a patienté et rejoint la fin de la file. */
function marqueSablier(t: number): Graphics {
  const g = new Graphics();
  const x = 6;
  const y = 6;
  const r = Math.max(5, t * 0.13);
  g.poly(flat(blob(x + r, y + r, r * 1.5, r * 1.5, { seed: 4, points: 11, wobble: 0.2 }))).fill({
    color: melanger(PALETTE.granitAnthracite, PALETTE.bleuProfond, 0.4),
    alpha: 0.88,
  });
  g.poly([x + r * 0.3, y + r * 0.3, x + r * 1.7, y + r * 0.3, x + r, y + r]).fill({
    color: melanger(PALETTE.parchemin, LIGHT.chaude, 0.3),
    alpha: 0.9,
  });
  g.poly([x + r * 0.3, y + r * 1.7, x + r * 1.7, y + r * 1.7, x + r, y + r]).fill({
    color: melanger(PALETTE.parcheminOmbre, PALETTE.ocre, 0.4),
    alpha: 0.9,
  });
  g.poly(flat(blob(x + r, y + r, r * 1.5, r * 1.5, { seed: 4, points: 11, wobble: 0.2 })), true).stroke({
    color: LIGHT.rim,
    width: 1,
    alpha: 0.6,
  });
  return g;
}

/** Carquois : la pile est un tireur. */
function marqueTir(t: number): Graphics {
  const g = new Graphics();
  const x = t - 12;
  const y = 5;
  const r = Math.max(5, t * 0.12);
  g.poly(flat(blob(x, y + r, r * 1.3, r * 1.3, { seed: 8, points: 11, wobble: 0.22 }))).fill({
    color: melanger(PALETTE.brunFougere, PALETTE.granitAnthracite, 0.4),
    alpha: 0.85,
  });
  for (let i = -1; i <= 1; i += 1) {
    g.moveTo(x + i * r * 0.42, y + r * 1.5);
    g.lineTo(x + i * r * 0.42 + r * 0.2, y - r * 0.5);
  }
  g.stroke({ color: melanger(PALETTE.parchemin, LIGHT.chaude, 0.35), width: 1.2, alpha: 0.9 });
  return g;
}

/* ═════════════════════════════ Chiffre romain ════════════════════════════ */

const ROMAINS: readonly (readonly [number, string])[] = [
  [50, 'L'],
  [40, 'XL'],
  [10, 'X'],
  [9, 'IX'],
  [5, 'V'],
  [4, 'IV'],
  [1, 'I'],
];

/** Le round s'affiche en chiffres romains : c'est une chronique, pas un score. */
export function romain(n: number): string {
  let reste = Math.max(1, Math.min(399, Math.round(n)));
  let out = '';
  for (const [v, s] of ROMAINS) {
    while (reste >= v) {
      out += s;
      reste -= v;
    }
  }
  return out;
}
