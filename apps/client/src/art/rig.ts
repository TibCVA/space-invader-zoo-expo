/**
 * Système d'animation vectorielle.
 *
 * Une créature n'est pas une image : c'est une hiérarchie d'articulations
 * (`Joint`) portant des `Graphics` peints par `shading.ts`, animée par
 * interpolation de pistes. Ce module fournit :
 *
 *  - la hiérarchie de transformations et sa pose de repos ;
 *  - l'interpolation et les courbes d'assouplissement ;
 *  - la boucle d'attente respiratoire (2,4 s, amplitude faible) ;
 *  - la secousse d'impact amortie ;
 *  - la dissolution à la mort ;
 *  - le mouvement d'ambiance permanent mais discret exigé par la loi n°7
 *    (amplitude ≤ 3 px, périodes 2 à 7 s, phases décorrélées).
 *
 * Il implémente `CreatureRig` de docs/02-API.md.
 */
import { Container, Graphics } from 'pixi.js';
import { LIGHT, melanger } from './palette.js';
import { blob, flat } from './shading.js';
import { hash2 } from './noise.js';

/* ───────────────────────────── Courbes ──────────────────────────────────── */

export type EaseName =
  | 'lineaire'
  | 'doux'
  | 'sortie'
  | 'entree'
  | 'accelere'
  | 'rebond'
  | 'elastique'
  | 'choc';

const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);

export const COURBES: Readonly<Record<EaseName, (t: number) => number>> = {
  lineaire: (t) => t,
  doux: (t) => 0.5 - 0.5 * Math.cos(Math.PI * clamp01(t)),
  sortie: (t) => 1 - Math.pow(1 - clamp01(t), 3),
  entree: (t) => clamp01(t) * clamp01(t) * clamp01(t),
  accelere: (t) => clamp01(t) * clamp01(t),
  rebond: (t) => {
    const k = clamp01(t);
    const c = 1.70158 + 1;
    return 1 + c * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);
  },
  elastique: (t) => {
    const k = clamp01(t);
    if (k === 0 || k === 1) return k;
    return Math.pow(2, -9 * k) * Math.sin((k * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
  },
  choc: (t) => {
    const k = clamp01(t);
    return 1 - Math.pow(1 - k, 6);
  },
};

/* ───────────────────────────── Articulations ────────────────────────────── */

export interface PoseRepos {
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
}

/**
 * Une articulation : un conteneur qui mémorise sa pose de repos et son
 * exposition à la lumière (utilisée pour compenser le retournement).
 */
export class Joint extends Container {
  readonly nom: string;
  readonly repos: PoseRepos;
  /** > 0 : la pièce fait face au soleil au repos ; < 0 : elle est dans l'ombre. */
  expositionLumiere = 0;
  /** Phase propre du mouvement d'ambiance, décorrélée par bruit. */
  readonly phase: number;
  /** Amplitude du balancement d'ambiance en pixels (≤ 3, loi n°7). */
  ambiance = 0;
  /** Période du balancement d'ambiance, en secondes (2 à 7). */
  periode = 4;
  /** Ordre de dissolution à la mort, 0 = disparaît en premier. */
  ordreMort = 0;

  constructor(nom: string, x = 0, y = 0, rot = 0, sx = 1, sy = 1) {
    super();
    this.nom = nom;
    this.label = nom;
    this.repos = { x, y, rot, sx, sy };
    this.position.set(x, y);
    this.rotation = rot;
    this.scale.set(sx, sy);
    this.phase = hash2(nom.length, nom.charCodeAt(0) || 1, 4093) * Math.PI * 2;
  }

  /** Rétablit la pose de repos. */
  reposer(): void {
    this.position.set(this.repos.x, this.repos.y);
    this.rotation = this.repos.rot;
    this.scale.set(this.repos.sx, this.repos.sy);
    this.alpha = 1;
  }

  /** Ajoute un dessin peint à l'articulation. */
  peindre(fn: (g: Graphics) => void): Graphics {
    const g = new Graphics();
    fn(g);
    this.addChild(g);
    return g;
  }
}

/* ──────────────────────────────── Pistes ────────────────────────────────── */

export type Canal = 'x' | 'y' | 'rot' | 'sx' | 'sy' | 'alpha';

export interface Cle {
  /** instant normalisé 0..1 dans la durée du clip */
  t: number;
  /** décalage (x, y, rot), facteur (sx, sy) ou valeur absolue (alpha) */
  v: number;
  ease?: EaseName;
}

export interface Piste {
  joint: string;
  canal: Canal;
  cles: Cle[];
}

export interface Clip {
  duree: number;
  boucle: boolean;
  pistes: Piste[];
  /** secousse ajoutée à la racine au démarrage : amplitude en px */
  secousse?: number;
  /** vitesse de reprise vers l'attente à la fin d'un clip non bouclé */
  retour?: number;
}

/** Fabrique de clip, avec valeurs par défaut raisonnables. */
export function clip(duree: number, boucle: boolean, pistes: Piste[], extra: Partial<Clip> = {}): Clip {
  return { duree, boucle, pistes, retour: 0.16, ...extra };
}

/** Raccourci de piste : `p('bras_d','rot',[[0,0],[0.4,-0.9,'sortie'],[1,0,'doux']])`. */
export function p(
  joint: string,
  canal: Canal,
  cles: ([number, number] | [number, number, EaseName])[],
): Piste {
  return {
    joint,
    canal,
    cles: cles.map((c) => ({ t: c[0], v: c[1], ease: c[2] as EaseName | undefined })),
  };
}

function evaluer(piste: Piste, t: number): number {
  const k = piste.cles;
  if (k.length === 0) return piste.canal === 'sx' || piste.canal === 'sy' || piste.canal === 'alpha' ? 1 : 0;
  if (t <= k[0].t) return k[0].v;
  const last = k[k.length - 1];
  if (t >= last.t) return last.v;
  for (let i = 0; i < k.length - 1; i += 1) {
    const a = k[i];
    const b = k[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = b.t - a.t || 1;
      const u = (t - a.t) / span;
      const ease = COURBES[b.ease ?? 'doux'];
      return a.v + (b.v - a.v) * ease(u);
    }
  }
  return last.v;
}

/* ────────────────────────────── Le rig ──────────────────────────────────── */

export type AnimName =
  | 'attente'
  | 'marche'
  | 'attaque'
  | 'impact'
  | 'riposte'
  | 'defense'
  | 'mort'
  | 'capacite';

/** Contrat imposé par docs/02-API.md. */
export interface CreatureRig extends Container {
  play(anim: AnimName): void;
  update(dt: number): void;
  setFacing(dir: 1 | -1): void;
}

export interface RigOptions {
  /** Hauteur visuelle de la créature, sert à l'ombre portée et à la respiration. */
  hauteur: number;
  /** Demi-largeur au sol, pour l'ombre portée. */
  empriseSol: number;
  /** Articulation qui respire (torse, corps, masse principale). */
  respiration?: string;
  /** Teinte de base pour la dissolution à la mort. */
  teinteMort?: number;
  /** Graine déterministe pour les phases d'ambiance. */
  graine?: number;
}

interface Instantane {
  x: number;
  y: number;
  rot: number;
  sx: number;
  sy: number;
  alpha: number;
}

const DUREE_MELANGE = 0.13;

/**
 * Conteneur animable d'une créature. Trois couches, dans l'ordre de rendu :
 *   `ombre`  — ombre portée au sol, jamais retournée (le soleil ne bouge pas) ;
 *   `corps`  — la hiérarchie d'articulations, retournée par `setFacing` ;
 *   `aura`   — particules de capacité et cendres de dissolution.
 */
export class Rig extends Container implements CreatureRig {
  readonly ombre = new Graphics();
  readonly corps = new Container();
  readonly aura = new Graphics();

  private readonly joints = new Map<string, Joint>();
  private readonly ordreJoints: Joint[] = [];
  private readonly clips = new Map<AnimName, Clip>();

  private courant: AnimName = 'attente';
  private temps = 0;
  private termine = false;
  private melange = 0;
  private readonly depuis = new Map<string, Instantane>();

  private secousseAmp = 0;
  private secousseT = 0;
  private mortT = -1;
  private horloge = 0;
  private facing: 1 | -1 = 1;

  private readonly opts: RigOptions;

  constructor(opts: RigOptions) {
    super();
    this.opts = opts;
    this.addChild(this.ombre, this.corps, this.aura);
    this.dessinerOmbre();
  }

  /** Enregistre une articulation et la rattache à son parent. */
  ajouter(joint: Joint, parent?: Joint): Joint {
    this.joints.set(joint.nom, joint);
    this.ordreJoints.push(joint);
    (parent ?? (this.corps as unknown as Container)).addChild(joint);
    return joint;
  }

  joint(nom: string): Joint {
    const j = this.joints.get(nom);
    if (!j) throw new Error(`Articulation inconnue : ${nom}`);
    return j;
  }

  aJoint(nom: string): boolean {
    return this.joints.has(nom);
  }

  definirClip(nom: AnimName, c: Clip): void {
    this.clips.set(nom, c);
  }

  /** Les animations disponibles, dans l'ordre du contrat. */
  get animations(): AnimName[] {
    return [...this.clips.keys()];
  }

  private dessinerOmbre(): void {
    const g = this.ombre;
    g.clear();
    const r = this.opts.empriseSol;
    const h = this.opts.hauteur;
    const allonge = h * LIGHT.ombreFacteur * 0.28;
    const rx = r * 1.06 + allonge;
    const ry = r * 0.42;
    const poly = blob(allonge * 0.55, allonge * 0.16, rx, ry, {
      seed: (this.opts.graine ?? 3) + 11,
      points: 22,
      wobble: 0.1,
    });
    // Projection au sol de la direction 315° : environ 26°, pas 45°.
    const rot = Math.PI / 7;
    const co = Math.cos(rot);
    const si = Math.sin(rot);
    const tourne = poly.map((q) => ({ x: q.x * co - q.y * si, y: q.x * si + q.y * co }));
    for (let i = 3; i >= 0; i -= 1) {
      const k = 1 + i * 0.14;
      g.poly(flat(tourne.map((q) => ({ x: q.x * k, y: q.y * k })))).fill({
        color: LIGHT.ombrePortee,
        alpha: LIGHT.ombrePorteeAlpha * (i === 0 ? 0.55 : 0.13),
      });
    }
  }

  /* ── Contrôle ───────────────────────────────────────────────────────── */

  play(anim: AnimName): void {
    const c = this.clips.get(anim) ?? this.clips.get('attente');
    if (!c) return;
    const nom: AnimName = this.clips.has(anim) ? anim : 'attente';
    if (nom === this.courant && c.boucle && !this.termine) return;
    // instantané de la pose actuelle pour un enchaînement sans à-coup
    this.depuis.clear();
    for (const j of this.ordreJoints) {
      this.depuis.set(j.nom, {
        x: j.x,
        y: j.y,
        rot: j.rotation,
        sx: j.scale.x,
        sy: j.scale.y,
        alpha: j.alpha,
      });
    }
    this.courant = nom;
    this.temps = 0;
    this.termine = false;
    this.melange = DUREE_MELANGE;
    if (c.secousse) this.frapper(c.secousse);
    if (nom === 'mort') {
      this.mortT = 0;
    } else {
      this.mortT = -1;
      this.aura.clear();
      this.ombre.alpha = 1;
      this.corps.alpha = 1;
    }
  }

  /** Secousse d'impact amortie, appliquée à la racine. */
  frapper(amplitude = 3.4): void {
    this.secousseAmp = amplitude;
    this.secousseT = 0;
  }

  setFacing(dir: 1 | -1): void {
    if (dir === this.facing) return;
    this.facing = dir;
    this.corps.scale.x = Math.abs(this.corps.scale.x) * dir;
    // Le soleil, lui, ne se retourne pas : on rééquilibre les valeurs pour que
    // le côté désormais tourné vers le sud-est redevienne le côté sombre.
    for (const j of this.ordreJoints) {
      if (dir === 1) {
        j.tint = 0xffffff;
      } else {
        const e = j.expositionLumiere;
        j.tint = e > 0 ? melanger(0xffffff, 0x8e9cb2, Math.min(0.5, e * 0.42)) : 0xffffff;
      }
    }
  }

  get orientation(): 1 | -1 {
    return this.facing;
  }

  /* ── Boucle ─────────────────────────────────────────────────────────── */

  /**
   * Avance l'animation. `dt` est attendu en **secondes** ; une valeur
   * supérieure à 1 est interprétée comme des millisecondes (tolérance pour les
   * appelants branchés directement sur `Ticker.deltaMS`).
   */
  update(dt: number): void {
    const s = dt > 1 ? dt / 1000 : dt;
    const pas = Math.min(0.05, Math.max(0, s));
    this.horloge += pas;

    let c = this.clips.get(this.courant);
    if (c) {
      this.temps += pas;
      if (this.temps >= c.duree) {
        if (c.boucle) {
          this.temps %= c.duree;
        } else if (!this.termine) {
          this.temps = c.duree;
          this.termine = true;
          if (this.courant !== 'mort') {
            // Retour naturel à l'attente, fondu compris.
            this.play('attente');
            c = this.clips.get(this.courant);
          }
        } else {
          this.temps = c.duree;
        }
      }
    }

    this.appliquerPose(c, pas);
    this.appliquerAmbiance();
    this.appliquerSecousse(pas);
    if (this.mortT >= 0) this.appliquerDissolution(pas);
  }

  private appliquerPose(c: Clip | undefined, pas: number): void {
    for (const j of this.ordreJoints) j.reposer();
    if (!c) return;
    const t = c.duree > 0 ? Math.min(1, this.temps / c.duree) : 1;
    for (const piste of c.pistes) {
      const j = this.joints.get(piste.joint);
      if (!j) continue;
      const v = evaluer(piste, t);
      switch (piste.canal) {
        case 'x':
          j.x = j.repos.x + v;
          break;
        case 'y':
          j.y = j.repos.y + v;
          break;
        case 'rot':
          j.rotation = j.repos.rot + v;
          break;
        case 'sx':
          j.scale.x = j.repos.sx * v;
          break;
        case 'sy':
          j.scale.y = j.repos.sy * v;
          break;
        case 'alpha':
          j.alpha = v;
          break;
      }
    }
    if (this.melange > 0) {
      this.melange = Math.max(0, this.melange - pas);
      const k = this.melange / DUREE_MELANGE;
      for (const j of this.ordreJoints) {
        const from = this.depuis.get(j.nom);
        if (!from) continue;
        j.x += (from.x - j.x) * k;
        j.y += (from.y - j.y) * k;
        j.rotation += (from.rot - j.rotation) * k;
        j.scale.x += (from.sx - j.scale.x) * k;
        j.scale.y += (from.sy - j.scale.y) * k;
        j.alpha += (from.alpha - j.alpha) * k;
      }
    }
  }

  /**
   * Respiration et mouvement d'ambiance : jamais rien de parfaitement immobile,
   * jamais rien d'assez grand pour distraire (loi n°7).
   */
  private appliquerAmbiance(): void {
    const respire = this.opts.respiration ? this.joints.get(this.opts.respiration) : undefined;
    if (respire && this.courant !== 'mort') {
      const w = (Math.PI * 2) / 2.4; // période imposée : 2,4 s
      const s = Math.sin(this.horloge * w);
      const c2 = Math.sin(this.horloge * w * 2 + 0.7);
      const force = this.courant === 'attente' ? 1 : 0.35;
      respire.scale.y *= 1 + (s * 0.016 + c2 * 0.004) * force;
      respire.scale.x *= 1 - (s * 0.009) * force;
      respire.y += (s * 0.9 + c2 * 0.25) * force;
    }
    for (const j of this.ordreJoints) {
      if (j.ambiance <= 0) continue;
      const w = (Math.PI * 2) / j.periode;
      const a = Math.min(3, j.ambiance);
      j.x += Math.sin(this.horloge * w + j.phase) * a;
      j.y += Math.sin(this.horloge * w * 0.63 + j.phase * 1.7) * a * 0.42;
      j.rotation += Math.sin(this.horloge * w * 0.81 + j.phase * 0.6) * a * 0.012;
    }
  }

  private appliquerSecousse(pas: number): void {
    if (this.secousseAmp <= 0.01) {
      this.corps.position.set(0, 0);
      return;
    }
    this.secousseT += pas;
    const amort = Math.exp(-9 * this.secousseT);
    const a = this.secousseAmp * amort;
    this.corps.x = Math.sin(this.secousseT * 62) * a;
    this.corps.y = Math.cos(this.secousseT * 48) * a * 0.55;
    if (amort < 0.02) {
      this.secousseAmp = 0;
      this.corps.position.set(0, 0);
    }
  }

  /**
   * Dissolution à la mort : la silhouette s'affaisse, se refroidit et se défait
   * en cendres. Aucune disparition brutale, aucun fondu gris.
   */
  private appliquerDissolution(pas: number): void {
    const c = this.clips.get('mort');
    const duree = (c?.duree ?? 1) + 0.75;
    this.mortT = Math.min(duree, this.mortT + pas);
    const t = this.mortT / duree;
    const n = this.ordreJoints.length || 1;
    for (let i = 0; i < this.ordreJoints.length; i += 1) {
      const j = this.ordreJoints[i];
      const retard = (j.ordreMort || i) / (n * 1.6);
      const k = Math.max(0, Math.min(1, (t - retard) / 0.55));
      j.alpha *= 1 - k;
      j.y += k * 3.4;
      j.rotation += k * 0.06 * (i % 2 ? 1 : -1);
    }
    this.ombre.alpha = 1 - t * 0.9;

    const teinte = this.opts.teinteMort ?? LIGHT.brume;
    const g = this.aura;
    g.clear();
    const monte = Math.min(1, t * 1.35);
    for (let i = 0; i < 16; i += 1) {
      const h1 = hash2(i, 71, 13);
      const h2 = hash2(i, 137, 29);
      const seuil = h1 * 0.5;
      if (t < seuil) continue;
      const local = Math.min(1, (t - seuil) / 0.7);
      const x = (h1 - 0.5) * this.opts.empriseSol * 2.1;
      const y = -this.opts.hauteur * (0.15 + h2 * 0.7) - local * this.opts.hauteur * 0.55;
      const r = (0.9 + h2 * 2.1) * (1 - local * 0.35);
      g.poly(
        flat(blob(x + Math.sin(local * 5 + i) * 2.4, y, r, r * 1.25, { seed: i * 7 + 3, points: 8, wobble: 0.32 })),
      ).fill({ color: i % 3 === 0 ? LIGHT.rim : teinte, alpha: (1 - local) * 0.42 * monte });
    }
  }
}
