/**
 * Particules et effets d'ambiance.
 *
 * Loi n°7 : rien n'est parfaitement immobile. Poussière, fumée, brume, pluie,
 * givre, feuilles et scintillement d'or tournent en permanence sur la carte et
 * dans les cités ; étincelles, impacts et auras de sort ne durent que le temps
 * d'une action.
 *
 * Tout est composé de sprites tirés de trois textures générées une fois : un
 * halo doux, un éclat en étoile et une feuille. Aucun `Graphics` n'est
 * reconstruit par image — seules les transformations changent.
 */
import { Container, Sprite, Texture } from 'pixi.js';
import type { BLEND_MODES } from 'pixi.js';
import { LIGHT, PALETTE, SCHOOL_COLORS, cssAlpha, melanger } from './palette.js';
import { prng } from './noise.js';

export type EffectKind =
  | 'poussiere'
  | 'fumee'
  | 'etincelles'
  | 'brume'
  | 'pluie'
  | 'givre'
  | 'feuilles'
  | 'eclat_or'
  | 'impact'
  | 'aura';

export type EcoleSort = 'braises' | 'sources' | 'brumes' | 'racines';

export interface ParticleTextures {
  halo: Texture;
  eclat: Texture;
  feuille: Texture;
  trait: Texture;
}

type Ctx2D = CanvasRenderingContext2D;

function canvas(w: number, h: number): { el: HTMLCanvasElement; ctx: Ctx2D } {
  if (typeof document === 'undefined') {
    throw new Error('Les effets requièrent un navigateur : aucun document disponible.');
  }
  const el = document.createElement('canvas');
  el.width = w;
  el.height = h;
  const ctx = el.getContext('2d');
  if (!ctx) throw new Error('Contexte 2D indisponible : impossible de générer les particules.');
  return { el, ctx };
}

/** Trois textures de particule, générées une fois pour toute la partie. */
export function creerTexturesParticules(): ParticleTextures {
  // halo doux, légèrement irrégulier : jamais un disque parfait
  const a = canvas(64, 64);
  const img = a.ctx.createImageData(64, 64);
  for (let y = 0; y < 64; y += 1) {
    for (let x = 0; x < 64; x += 1) {
      const i = (y * 64 + x) * 4;
      const dx = (x - 31.5) / 31.5;
      const dy = (y - 31.5) / 31.5;
      const ang = Math.atan2(dy, dx);
      const d = Math.hypot(dx, dy) * (1 + Math.sin(ang * 3 + 0.7) * 0.06 + Math.sin(ang * 5 - 1.2) * 0.04);
      const v = Math.max(0, 1 - d);
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(255 * Math.pow(v, 1.9));
    }
  }
  a.ctx.putImageData(img, 0, 0);

  // éclat en étoile à six branches inégales
  const b = canvas(64, 64);
  const bg = b.ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  bg.addColorStop(0, 'rgba(255,255,255,1)');
  bg.addColorStop(0.28, 'rgba(255,255,255,0.5)');
  bg.addColorStop(1, 'rgba(255,255,255,0)');
  b.ctx.fillStyle = bg;
  b.ctx.beginPath();
  b.ctx.arc(32, 32, 30, 0, Math.PI * 2);
  b.ctx.fill();
  b.ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  b.ctx.lineCap = 'round';
  for (let i = 0; i < 6; i += 1) {
    const ang = (i / 6) * Math.PI * 2 + 0.2;
    const L = i % 2 ? 29 : 20;
    b.ctx.lineWidth = i % 2 ? 2.4 : 1.6;
    b.ctx.beginPath();
    b.ctx.moveTo(32, 32);
    b.ctx.lineTo(32 + Math.cos(ang) * L, 32 + Math.sin(ang) * L);
    b.ctx.stroke();
  }

  // feuille de hêtre, nervurée
  const c = canvas(48, 48);
  c.ctx.fillStyle = 'rgba(255,255,255,0.94)';
  c.ctx.beginPath();
  c.ctx.moveTo(24, 3);
  c.ctx.bezierCurveTo(40, 12, 42, 32, 24, 45);
  c.ctx.bezierCurveTo(6, 32, 8, 12, 24, 3);
  c.ctx.fill();
  c.ctx.strokeStyle = 'rgba(120,120,120,0.7)';
  c.ctx.lineWidth = 1.4;
  c.ctx.beginPath();
  c.ctx.moveTo(24, 5);
  c.ctx.lineTo(24, 44);
  c.ctx.stroke();
  c.ctx.lineWidth = 0.9;
  for (let i = 0; i < 5; i += 1) {
    const y = 10 + i * 7;
    c.ctx.beginPath();
    c.ctx.moveTo(24, y);
    c.ctx.lineTo(24 - 12 + i, y + 6);
    c.ctx.moveTo(24, y);
    c.ctx.lineTo(24 + 12 - i, y + 6);
    c.ctx.stroke();
  }

  // trait de pluie, dégradé sur la longueur
  const d = canvas(8, 48);
  const dg = d.ctx.createLinearGradient(0, 0, 0, 48);
  dg.addColorStop(0, 'rgba(255,255,255,0)');
  dg.addColorStop(0.5, 'rgba(255,255,255,0.85)');
  dg.addColorStop(1, 'rgba(255,255,255,0)');
  d.ctx.fillStyle = dg;
  d.ctx.fillRect(2.4, 0, 3.2, 48);

  const tex = (el: HTMLCanvasElement, label: string): Texture => {
    const t = Texture.from(el);
    t.source.label = `particule_${label}`;
    t.source.scaleMode = 'linear';
    return t;
  };

  return {
    halo: tex(a.el, 'halo'),
    eclat: tex(b.el, 'eclat'),
    feuille: tex(c.el, 'feuille'),
    trait: tex(d.el, 'trait'),
  };
}

/**
 * Le geste propre à chaque école de magie.
 *
 * Ce n'est pas de l'ornement : c'est la seule chose qui, dans une scène
 * chargée, dit au joueur quelle école vient de frapper avant qu'il n'ait lu la
 * teinte. Exposé pour que le test puisse vérifier que les quatre diffèrent
 * réellement, et pas seulement par leur couleur.
 */
export interface GesteEcole {
  texture: keyof ParticleTextures;
  nombre: number;
  duree: [number, number];
  taille: [number, number];
  croissance: number;
  vitesse: { x: [number, number]; y: [number, number] };
  gravite: number;
  blend: 'add' | 'screen' | 'normal';
  rotation: [number, number];
  derive: number;
}

export const GESTE_ECOLE: Readonly<Record<EcoleSort, GesteEcole>> = {
  /* Le feu crache : des éclats vifs, brefs, qui montent vite et petit. */
  braises: {
    texture: 'eclat',
    nombre: 22,
    duree: [0.5, 1.1],
    taille: [4, 12],
    croissance: 1.1,
    vitesse: { x: [-22, 22], y: [-64, -26] },
    gravite: -14,
    blend: 'add',
    rotation: [-2, 2],
    derive: 4,
  },
  /* L'eau retombe : la seule école dont les particules descendent. */
  sources: {
    texture: 'halo',
    nombre: 16,
    duree: [1, 1.8],
    taille: [7, 16],
    croissance: 0.9,
    vitesse: { x: [-10, 10], y: [-14, 6] },
    gravite: 26,
    blend: 'screen',
    rotation: [-0.4, 0.4],
    derive: 3,
  },
  /* La brume ne va nulle part : grande, très lente, elle glisse de côté. */
  brumes: {
    texture: 'halo',
    nombre: 12,
    duree: [1.8, 3.2],
    taille: [16, 38],
    croissance: 1.9,
    vitesse: { x: [-8, 8], y: [-10, -2] },
    gravite: -2,
    blend: 'screen',
    rotation: [-0.2, 0.2],
    derive: 16,
  },
  /* Les racines tournent : des feuilles qui tombent en vrille. */
  racines: {
    texture: 'feuille',
    nombre: 18,
    duree: [1.1, 2.2],
    taille: [8, 20],
    croissance: 1.2,
    vitesse: { x: [-18, 18], y: [-24, -4] },
    gravite: 12,
    blend: 'add',
    rotation: [-5, 5],
    derive: 9,
  },
};

/* ───────────────────────────── Le système ───────────────────────────────── */

interface Particule {
  s: Sprite;
  vie: number;
  duree: number;
  vx: number;
  vy: number;
  vr: number;
  t0: number;
  t1: number;
  a0: number;
  a1: number;
  derive: number;
  phase: number;
}

export interface EffectOptions {
  /** largeur de la zone d'émission */
  largeur?: number;
  /** hauteur de la zone d'émission */
  hauteur?: number;
  /** 0,3 à 2 : densité et vigueur */
  intensite?: number;
  /** durée de vie de l'effet, en secondes ; 0 = permanent */
  duree?: number;
  /** école, pour `aura` */
  ecole?: EcoleSort;
  /** graine déterministe */
  graine?: number;
  /** teinte imposée (sinon celle du type) */
  couleur?: number;
}

interface Reglage {
  texture: keyof ParticleTextures;
  nombre: number;
  duree: [number, number];
  taille: [number, number];
  croissance: number;
  vitesse: { x: [number, number]; y: [number, number] };
  gravite: number;
  couleurs: number[];
  alpha: [number, number];
  blend: BLEND_MODES;
  rotation: [number, number];
  /** ondulation latérale */
  derive: number;
  /** l'effet se rejoue en boucle */
  boucle: boolean;
}

const VENT = LIGHT.toShadow; // le vent suit le sud-est, comme les ombres

function reglages(kind: EffectKind, o: EffectOptions): Reglage {
  const I = o.intensite ?? 1;
  switch (kind) {
    case 'poussiere':
      return {
        texture: 'halo',
        nombre: Math.round(16 * I),
        duree: [0.7, 1.6],
        taille: [5, 15],
        croissance: 2.1,
        vitesse: { x: [-9, 16], y: [-26, -8] },
        gravite: 9,
        couleurs: [melanger(PALETTE.brunFougere, LIGHT.chaude, 0.4), melanger(PALETTE.parcheminOmbre, LIGHT.froide, 0.3)],
        alpha: [0.38, 0],
        blend: 'normal',
        rotation: [-0.6, 0.6],
        derive: 6,
        boucle: true,
      };
    case 'fumee':
      return {
        texture: 'halo',
        nombre: Math.round(14 * I),
        duree: [2.2, 4.4],
        taille: [10, 30],
        croissance: 2.6,
        vitesse: { x: [2, 12], y: [-26, -13] },
        gravite: -3,
        couleurs: [melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.3), melanger(PALETTE.granitClair, PALETTE.bleuBrume, 0.5)],
        alpha: [0.24, 0],
        blend: 'normal',
        rotation: [-0.25, 0.25],
        derive: 9,
        boucle: true,
      };
    case 'etincelles':
      return {
        texture: 'eclat',
        nombre: Math.round(22 * I),
        duree: [0.35, 0.95],
        taille: [3, 9],
        croissance: 0.55,
        vitesse: { x: [-70, 70], y: [-90, -20] },
        gravite: 210,
        couleurs: [LIGHT.chaude, PALETTE.ocre, LIGHT.rim],
        alpha: [1, 0],
        blend: 'add',
        rotation: [-3, 3],
        derive: 0,
        boucle: false,
      };
    case 'brume':
      return {
        texture: 'halo',
        nombre: Math.round(10 * I),
        duree: [7, 13],
        taille: [50, 130],
        croissance: 1.25,
        vitesse: { x: [4, 14], y: [-3, 2] },
        gravite: 0,
        couleurs: [PALETTE.bleuBrume, melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.28)],
        alpha: [0.16, 0],
        blend: 'normal',
        rotation: [-0.08, 0.08],
        derive: 5,
        boucle: true,
      };
    case 'pluie':
      return {
        texture: 'trait',
        nombre: Math.round(46 * I),
        duree: [0.5, 0.9],
        taille: [14, 26],
        croissance: 1,
        vitesse: { x: [36, 62], y: [340, 480] },
        gravite: 40,
        couleurs: [melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.35), melanger(PALETTE.bleuProfond, PALETTE.bleuBrume, 0.55)],
        alpha: [0.5, 0.1],
        blend: 'normal',
        rotation: [0, 0],
        derive: 0,
        boucle: true,
      };
    case 'givre':
      return {
        texture: 'eclat',
        nombre: Math.round(20 * I),
        duree: [2.4, 5],
        taille: [3, 9],
        croissance: 1.1,
        vitesse: { x: [6, 22], y: [12, 34] },
        gravite: 4,
        couleurs: [melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.5), PALETTE.parchemin],
        alpha: [0.7, 0],
        blend: 'add',
        rotation: [-1.2, 1.2],
        derive: 13,
        boucle: true,
      };
    case 'feuilles':
      return {
        texture: 'feuille',
        nombre: Math.round(11 * I),
        duree: [3.4, 6.5],
        taille: [7, 15],
        croissance: 1,
        vitesse: { x: [10, 30], y: [16, 34] },
        gravite: 6,
        couleurs: [PALETTE.ocre, melanger(PALETTE.vertHetre, PALETTE.ocre, 0.5), melanger(PALETTE.grenat, PALETTE.ocre, 0.45)],
        alpha: [0.85, 0.1],
        blend: 'normal',
        rotation: [-2.4, 2.4],
        derive: 20,
        boucle: true,
      };
    case 'eclat_or':
      return {
        texture: 'eclat',
        nombre: Math.round(14 * I),
        duree: [0.9, 2],
        taille: [3, 10],
        croissance: 1.3,
        vitesse: { x: [-5, 5], y: [-11, -2] },
        gravite: -2,
        couleurs: [LIGHT.rim, LIGHT.chaude, melanger(LIGHT.rim, PALETTE.parchemin, 0.4)],
        alpha: [0.9, 0],
        blend: 'add',
        rotation: [-1.6, 1.6],
        derive: 3,
        boucle: true,
      };
    case 'impact':
      return {
        texture: 'eclat',
        nombre: Math.round(20 * I),
        duree: [0.24, 0.6],
        taille: [4, 15],
        croissance: 0.5,
        vitesse: { x: [-150, 150], y: [-130, 40] },
        gravite: 420,
        couleurs: [LIGHT.chaude, PALETTE.parcheminOmbre, melanger(PALETTE.grenat, LIGHT.chaude, 0.35)],
        alpha: [1, 0],
        blend: 'add',
        rotation: [-5, 5],
        derive: 0,
        boucle: false,
      };
    /*
     * L'aura d'un sort : une par école, et vraiment une par école.
     *
     * Les quatre écoles partageaient un unique réglage — même texture `halo`,
     * mêmes dix-huit particules, même durée, même vitesse, même gravité, même
     * dérive. Seules la couleur et le mode de fusion changeaient. Autrement
     * dit, la moitié du travail : le joueur voyait bien qu'un sort avait été
     * lancé, mais rien dans le MOUVEMENT ne lui disait de quelle école, et
     * c'est le mouvement qu'on lit avant la teinte quand la scène est chargée.
     *
     * Chaque école a donc son geste, tiré de ce qu'elle est :
     *
     *  - les **braises** montent en éclats vifs et brefs, comme un feu qui
     *    crache ;
     *  - les **sources** retombent en gouttes rondes et lentes, gravité vers
     *    le bas, seule école dont les particules descendent ;
     *  - les **brumes** ne vont nulle part : grandes, très lentes, elles
     *    dérivent de côté et durent longtemps ;
     *  - les **racines** tournent en feuilles qui tombent, avec la rotation
     *    la plus marquée des quatre.
     */
    case 'aura':
    default: {
      const ecole = o.ecole ?? 'braises';
      const c = SCHOOL_COLORS[ecole];
      const geste = GESTE_ECOLE[ecole];
      return {
        texture: geste.texture,
        nombre: Math.round(geste.nombre * I),
        duree: geste.duree,
        taille: geste.taille,
        croissance: geste.croissance,
        vitesse: geste.vitesse,
        gravite: geste.gravite,
        couleurs: [c.coeur, c.halo, melanger(c.halo, LIGHT.chaude, 0.4)],
        alpha: [0.65, 0],
        blend: geste.blend,
        rotation: geste.rotation,
        derive: geste.derive,
        boucle: true,
      };
    }
  }
}

/** Un effet vivant : conteneur de sprites qui s'anime seul. */
export class Effet extends Container {
  private readonly particules: Particule[] = [];
  private readonly r: Reglage;
  private readonly rand: () => number;
  private readonly W: number;
  private readonly H: number;
  private readonly dureeTotale: number;
  private ecoule = 0;
  private arret = false;

  constructor(kind: EffectKind, textures: ParticleTextures, o: EffectOptions = {}) {
    super();
    this.r = reglages(kind, o);
    this.rand = prng(o.graine ?? 20250816);
    this.W = o.largeur ?? 90;
    this.H = o.hauteur ?? 60;
    this.dureeTotale = o.duree ?? (this.r.boucle ? 0 : 1.2);
    const tex = textures[this.r.texture];
    for (let i = 0; i < this.r.nombre; i += 1) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.blendMode = this.r.blend;
      s.visible = false;
      this.addChild(s);
      const p: Particule = {
        s,
        vie: 0,
        duree: 1,
        vx: 0,
        vy: 0,
        vr: 0,
        t0: 1,
        t1: 1,
        a0: 1,
        a1: 0,
        derive: 0,
        phase: 0,
      };
      this.particules.push(p);
      // départ échelonné pour éviter la pulsation collective
      this.reinitialiser(p, o.couleur);
      p.vie = this.rand() * p.duree;
    }
    this.couleurForcee = o.couleur;
  }

  private couleurForcee: number | undefined;

  private entre(a: number, b: number): number {
    return a + this.rand() * (b - a);
  }

  private reinitialiser(p: Particule, couleur?: number): void {
    const r = this.r;
    p.vie = 0;
    p.duree = this.entre(r.duree[0], r.duree[1]);
    p.s.x = (this.rand() - 0.5) * this.W;
    p.s.y = (this.rand() - 0.5) * this.H;
    p.vx = this.entre(r.vitesse.x[0], r.vitesse.x[1]);
    p.vy = this.entre(r.vitesse.y[0], r.vitesse.y[1]);
    p.vr = this.entre(r.rotation[0], r.rotation[1]);
    p.t0 = this.entre(r.taille[0], r.taille[1]);
    p.t1 = p.t0 * r.croissance;
    p.a0 = r.alpha[0] * this.entre(0.7, 1);
    p.a1 = r.alpha[1];
    p.derive = r.derive * this.entre(0.5, 1.4);
    p.phase = this.rand() * Math.PI * 2;
    const palette = r.couleurs;
    p.s.tint = couleur ?? this.couleurForcee ?? palette[Math.floor(this.rand() * palette.length) % palette.length];
    p.s.rotation = this.rand() * Math.PI * 2;
    p.s.visible = true;
  }

  /** Arrête l'émission ; les particules encore vivantes finissent leur course. */
  arreter(): void {
    this.arret = true;
  }

  /** Vrai quand l'effet n'a plus rien à afficher. */
  get termine(): boolean {
    if (!this.arret && (this.r.boucle || this.dureeTotale === 0)) return false;
    return this.particules.every((p) => !p.s.visible);
  }

  /** `dt` en secondes ; une valeur > 1 est interprétée en millisecondes. */
  update(dt: number): void {
    const s = dt > 1 ? dt / 1000 : dt;
    const pas = Math.min(0.05, Math.max(0, s));
    this.ecoule += pas;
    const fini = this.arret || (this.dureeTotale > 0 && this.ecoule > this.dureeTotale);
    for (const p of this.particules) {
      if (!p.s.visible) continue;
      p.vie += pas;
      if (p.vie >= p.duree) {
        if (fini || (!this.r.boucle && this.dureeTotale === 0)) {
          p.s.visible = false;
          continue;
        }
        this.reinitialiser(p);
        continue;
      }
      const t = p.vie / p.duree;
      p.vy += this.r.gravite * pas;
      p.s.x += (p.vx + VENT.x * this.r.derive * 0.6) * pas + Math.sin(this.ecoule * 1.6 + p.phase) * p.derive * pas;
      p.s.y += p.vy * pas;
      p.s.rotation += p.vr * pas;
      const taille = p.t0 + (p.t1 - p.t0) * t;
      p.s.width = taille;
      p.s.height = taille * (this.r.texture === 'trait' ? 2.4 : 1);
      // enveloppe : montée rapide, longue extinction
      const env = t < 0.18 ? t / 0.18 : 1 - (t - 0.18) / 0.82;
      p.s.alpha = (p.a0 + (p.a1 - p.a0) * t) * env;
    }
  }
}

/** Fabrique d'effet. */
export function creerEffet(kind: EffectKind, textures: ParticleTextures, o: EffectOptions = {}): Effet {
  return new Effet(kind, textures, o);
}

/** Aura de sort par école, avec sa teinte propre. */
export function creerAuraSort(ecole: EcoleSort, textures: ParticleTextures, o: EffectOptions = {}): Effet {
  return new Effet('aura', textures, { ...o, ecole });
}

/** Les clefs d'effet disponibles, dans l'ordre de la planche de contact. */
export const EFFECT_KINDS: readonly EffectKind[] = [
  'poussiere',
  'fumee',
  'etincelles',
  'brume',
  'pluie',
  'givre',
  'feuilles',
  'eclat_or',
  'impact',
  'aura',
];

export const EFFECT_LABELS: Readonly<Record<EffectKind, string>> = {
  poussiere: 'Poussière',
  fumee: 'Fumée',
  etincelles: 'Étincelles',
  brume: 'Brume',
  pluie: 'Pluie',
  givre: 'Givre',
  feuilles: 'Feuilles',
  eclat_or: 'Éclat d’or',
  impact: 'Impact',
  aura: 'Aura de sort',
};

export const ECOLE_LABELS: Readonly<Record<EcoleSort, string>> = {
  braises: 'Braises',
  sources: 'Sources',
  brumes: 'Brumes',
  racines: 'Racines',
};

export { cssAlpha };
