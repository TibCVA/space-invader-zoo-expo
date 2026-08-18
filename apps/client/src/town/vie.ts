/**
 * `apps/client/src/town/vie.ts` — LA VIE PERMANENTE DU TABLEAU (loi n°7).
 *
 * « Rien n'est parfaitement immobile, rien ne bouge assez pour distraire. »
 * Amplitude ≤ 3 px, périodes de 2 à 7 s, phases décorrélées par bruit. Tout ce
 * module s'éteint proprement quand `prefers-reduced-motion` est vrai : les
 * éléments restent peints, ils cessent seulement de bouger.
 *
 * Cinq registres : les bannières, les oiseaux, les habitants, l'eau et les
 * lumières de fenêtre. Les fumées, elles, viennent de `atlas.effet('fumee')`.
 */
import { Container, Graphics } from 'pixi.js';
import type { FactionId } from '@auvergne/engine';
import { LIGHT, PALETTE, assombrir, eclaircir, melanger } from '../art/palette.js';
import { blob, densifier, flat, perturber, pt } from '../art/shading.js';
import type { Poly } from '../art/shading.js';
import { hash2, prng } from '../art/noise.js';
import type { PaletteBati } from './batiments.js';
import type { CadreCite } from './panorama.js';

/* ══════════════════════════════ Bannières ════════════════════════════════ */

/** Étoffe pendue à une hampe. Dessinée une fois, ondulée par la scène. */
export class Banniere {
  readonly node = new Graphics();
  private readonly phase: number;
  private readonly periode: number;

  constructor(pal: PaletteBati, taille: number, graine: number) {
    this.phase = hash2(graine, 3, 91) * Math.PI * 2;
    /* Périodes de 2 à 7 s, décorrélées (loi n°7). */
    this.periode = 2.4 + hash2(graine, 7, 12) * 4.2;

    const w = taille * 0.46;
    const h = taille * 0.86;
    const corps: Poly = [];
    const n = 9;
    for (let i = 0; i <= n; i += 1) {
      const t = i / n;
      corps.push(pt(w * (0.06 + Math.sin(t * 2.4) * 0.05), h * t));
    }
    for (let i = n; i >= 0; i -= 1) {
      const t = i / n;
      const creux = Math.sin(t * 3.1) * w * 0.12;
      corps.push(pt(w * (0.95 + creux / w) - (t > 0.82 ? w * (t - 0.82) * 3 : 0), h * t));
    }
    const p = perturber(densifier(corps, Math.max(3, w / 3)), 0.4, graine);
    this.node.poly(flat(p)).fill({ color: melanger(pal.etoffe, LIGHT.froide, 0.2) });
    /* Deux plis : jamais un aplat. */
    for (let i = 1; i < 3; i += 1) {
      const x = w * (0.24 + i * 0.26);
      this.node
        .moveTo(x, h * 0.04)
        .lineTo(x - w * 0.05, h * 0.92)
        .stroke({ color: i % 2 ? eclaircir(pal.etoffe, 0.28) : assombrir(pal.etoffe, 0.3), width: Math.max(1, w * 0.1), alpha: 0.4 });
    }
    /* Meuble d'or et frange. */
    this.node
      .poly(flat(blob(w * 0.5, h * 0.4, w * 0.2, h * 0.16, { seed: graine + 5, points: 12, wobble: 0.18 })))
      .fill({ color: pal.accent, alpha: 0.82 });
    this.node.poly(flat(p)).stroke({ color: assombrir(pal.etoffe, 0.45), width: 1, alpha: 0.75, join: 'round' });
    this.node.pivot.set(0, 0);
  }

  animer(temps: number, immobile: boolean): void {
    if (immobile) return;
    const t = (temps / 1000) * ((Math.PI * 2) / this.periode) + this.phase;
    /* Amplitude tenue sous 3 px : une gîte et un léger gonflement. */
    this.node.skew.y = Math.sin(t) * 0.06;
    this.node.scale.x = 1 + Math.sin(t * 1.7 + 0.8) * 0.07;
  }
}

/* ═══════════════════════════════ Oiseaux ═════════════════════════════════ */

interface Oiseau {
  x: number;
  y: number;
  v: number;
  amp: number;
  phase: number;
  taille: number;
  sens: number;
}

/** Une volée haute, lente, jamais nette : elle donne l'échelle du tableau. */
export class Oiseaux {
  readonly node = new Graphics();
  private readonly oiseaux: Oiseau[] = [];
  private cadre: CadreCite = { x: 0, y: 0, w: 1, h: 1 };
  private temps = 0;
  private prochainDessin = 0;

  constructor(nombre: number, graine: number) {
    const rand = prng(graine);
    for (let i = 0; i < nombre; i += 1) {
      this.oiseaux.push({
        x: rand(),
        y: 0.06 + rand() * 0.2,
        v: 0.008 + rand() * 0.014,
        amp: 0.004 + rand() * 0.006,
        phase: rand() * Math.PI * 2,
        taille: 3 + rand() * 3.4,
        sens: rand() > 0.35 ? 1 : -1,
      });
    }
  }

  disposer(cadre: CadreCite): void {
    this.cadre = cadre;
    this.prochainDessin = 0;
  }

  update(dtMs: number, immobile: boolean): void {
    this.temps += dtMs;
    if (!immobile) {
      const dt = dtMs / 1000;
      for (const o of this.oiseaux) {
        o.x += o.v * o.sens * dt;
        if (o.x > 1.15) o.x = -0.15;
        if (o.x < -0.15) o.x = 1.15;
      }
    }
    /* Redessin à 20 Hz : c'est amplement suffisant pour six silhouettes. */
    if (this.temps < this.prochainDessin) return;
    this.prochainDessin = this.temps + 50;
    const g = this.node;
    g.clear();
    for (const o of this.oiseaux) {
      const x = this.cadre.x + this.cadre.w * o.x;
      const y =
        this.cadre.y + this.cadre.h * (o.y + Math.sin(this.temps / 1000 + o.phase) * o.amp);
      const battement = Math.sin(this.temps / 210 + o.phase * 3) * 0.45;
      const s = o.taille;
      g.moveTo(x - s, y + battement * s)
        .lineTo(x, y - s * 0.28)
        .lineTo(x + s, y + battement * s * 0.9)
        .stroke({
          color: melanger(PALETTE.granitAnthracite, PALETTE.bleuBrume, 0.42),
          width: Math.max(1, s * 0.24),
          alpha: 0.44,
          cap: 'round',
          join: 'round',
        });
    }
  }
}

/* ══════════════════════════════ Habitants ════════════════════════════════ */

interface Habitant {
  node: Container;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  t: number;
  v: number;
  sens: number;
  balance: number;
}

/**
 * Silhouettes d'habitants : six figures de trois pixels de large qui vont d'un
 * bout à l'autre d'une place et reviennent. Elles ne sont jamais nettes, jamais
 * pressées, et elles donnent l'échelle du tableau.
 */
export class Habitants {
  readonly node = new Container();
  private readonly gens: Habitant[] = [];
  private readonly chemins: readonly [number, number, number, number][];
  private readonly graine: number;
  private temps = 0;

  constructor(
    chemins: readonly [number, number, number, number][],
    pal: PaletteBati,
    graine: number,
  ) {
    this.chemins = chemins;
    this.graine = graine;
    const rand = prng(graine + 5);
    for (let i = 0; i < chemins.length; i += 1) {
      const g = new Graphics();
      const teinte = melanger(
        i % 3 === 0 ? pal.etoffe : i % 3 === 1 ? PALETTE.brunFougere : pal.mur,
        LIGHT.froide,
        0.3,
      );
      /* Une capuche, un dos, une jambe : trois traits suffisent à 8 px. */
      g.poly(flat(blob(0, -5.4, 1.5, 1.7, { seed: i * 3 + 1, points: 9, wobble: 0.2 }))).fill({ color: assombrir(teinte, 0.2) });
      g.poly(
        flat(
          perturber(
            densifier([pt(-1.9, -4.4), pt(1.9, -4.4), pt(1.3, 0), pt(-1.3, 0)], 2),
            0.3,
            i + 3,
          ),
        ),
      ).fill({ color: teinte });
      g.moveTo(0, 0).lineTo(0, 1.4).stroke({ color: assombrir(teinte, 0.4), width: 1.1, alpha: 0.8 });
      g.poly(flat(blob(0.6, 1.9, 2.4, 0.8, { seed: i * 7 + 2, points: 10, wobble: 0.2 }))).fill({
        color: LIGHT.ombrePortee,
        alpha: 0.26,
      });
      this.node.addChild(g);
      this.gens.push({
        node: g,
        x0: chemins[i][0],
        y0: chemins[i][1],
        x1: chemins[i][2],
        y1: chemins[i][3],
        t: rand(),
        v: 0.045 + rand() * 0.05,
        sens: rand() > 0.5 ? 1 : -1,
        balance: rand() * Math.PI * 2,
      });
    }
  }

  disposer(cadre: CadreCite, echelle: number): void {
    for (let i = 0; i < this.gens.length; i += 1) {
      const h = this.gens[i];
      const c = this.chemins[i];
      h.x0 = cadre.x + (cadre.w * c[0]) / 100;
      h.y0 = cadre.y + (cadre.h * c[1]) / 100;
      h.x1 = cadre.x + (cadre.w * c[2]) / 100;
      h.y1 = cadre.y + (cadre.h * c[3]) / 100;
      h.node.scale.set(echelle);
    }
    this.placer(true);
  }

  update(dtMs: number, immobile: boolean): void {
    if (immobile) {
      this.placer(true);
      return;
    }
    this.temps += dtMs;
    const dt = dtMs / 1000;
    for (const h of this.gens) {
      h.t += h.v * h.sens * dt;
      if (h.t > 1) {
        h.t = 1;
        h.sens = -1;
      } else if (h.t < 0) {
        h.t = 0;
        h.sens = 1;
      }
    }
    this.placer(false);
  }

  private placer(immobile: boolean): void {
    for (const h of this.gens) {
      const x = h.x0 + (h.x1 - h.x0) * h.t;
      const y = h.y0 + (h.y1 - h.y0) * h.t;
      h.node.position.set(x, y);
      h.node.scale.x = Math.abs(h.node.scale.x) * (h.sens < 0 ? -1 : 1);
      if (!immobile) {
        /* Balancement de marche : moins de deux pixels. */
        h.node.rotation = Math.sin(this.temps / 240 + h.balance) * 0.05;
      }
    }
  }

  get nombre(): number {
    return this.gens.length;
  }

  get graineUtilisee(): number {
    return this.graine;
  }
}

/* ═══════════════════════════════ Eau vive ════════════════════════════════ */

/**
 * Miroitement de l'eau : trois nappes de reflets pré-dessinées dont l'opacité
 * respire en décalé. Aucun redessin par image.
 */
export class Eau {
  readonly node = new Container();
  private readonly nappes: Graphics[] = [];
  private readonly veines: readonly [number, number, number, number][];
  private readonly faction: FactionId;
  private temps = 0;

  constructor(veines: readonly [number, number, number, number][], faction: FactionId) {
    this.veines = veines;
    this.faction = faction;
    for (let k = 0; k < 3; k += 1) {
      const g = new Graphics();
      this.nappes.push(g);
      this.node.addChild(g);
    }
  }

  disposer(cadre: CadreCite): void {
    const teinte = this.faction === 'ermitage' ? 0x9fb4c2 : 0xbfd0d8;
    for (let k = 0; k < this.nappes.length; k += 1) {
      const g = this.nappes[k];
      g.clear();
      const rand = prng(k * 71 + 13);
      for (const v of this.veines) {
        const x0 = cadre.x + (cadre.w * v[0]) / 100;
        const y0 = cadre.y + (cadre.h * v[1]) / 100;
        const x1 = cadre.x + (cadre.w * v[2]) / 100;
        const y1 = cadre.y + (cadre.h * v[3]) / 100;
        const n = 9;
        for (let i = 0; i < n; i += 1) {
          const t = (i + rand() * 0.7) / n;
          const x = x0 + (x1 - x0) * t + (rand() - 0.5) * cadre.w * 0.012;
          const y = y0 + (y1 - y0) * t + (rand() - 0.5) * cadre.h * 0.006;
          const l = cadre.w * (0.006 + rand() * 0.012);
          g.moveTo(x - l, y)
            .lineTo(x + l, y - l * 0.18)
            .stroke({
              color: melanger(teinte, LIGHT.chaude, rand() * 0.4),
              width: Math.max(1, cadre.h * 0.0018),
              alpha: 0.5,
              cap: 'round',
            });
        }
      }
      g.alpha = 0;
    }
  }

  update(dtMs: number, immobile: boolean): void {
    this.temps += dtMs;
    for (let k = 0; k < this.nappes.length; k += 1) {
      if (immobile) {
        this.nappes[k].alpha = k === 0 ? 0.5 : 0;
        continue;
      }
      /* Périodes de 3,4 à 5,8 s, déphasées d'un tiers de tour. */
      const periode = 3400 + k * 1200;
      this.nappes[k].alpha =
        0.22 + 0.3 * Math.max(0, Math.sin((this.temps / periode) * Math.PI * 2 + k * 2.1));
    }
  }
}

/* ══════════════════════ Lumières de fenêtre au crépuscule ════════════════ */

/**
 * Halos chauds derrière les fenêtres. L'opacité globale suit l'heure ; chaque
 * halo garde un scintillement propre, à peine perceptible.
 */
export class Lumieres {
  readonly node = new Graphics();
  private readonly graine: number;
  private temps = 0;
  private force = 0;

  constructor(fenetres: readonly { x: number; y: number; r: number }[], graine: number) {
    this.graine = graine;
    for (const f of fenetres) {
      for (let k = 3; k >= 1; k -= 1) {
        this.node
          .poly(flat(blob(f.x, f.y, f.r * k * 0.95, f.r * k * 0.8, { seed: graine + k, points: 12, wobble: 0.2 })))
          .fill({ color: k === 1 ? LIGHT.chaude : PALETTE.ocre, alpha: k === 1 ? 0.75 : 0.16 / k });
      }
    }
    this.node.alpha = 0;
  }

  /** `force` va de 0 (plein jour) à 1 (nuit tombée). */
  setForce(force: number): void {
    this.force = Math.max(0, Math.min(1, force));
  }

  update(dtMs: number, immobile: boolean): void {
    this.temps += dtMs;
    const scintillement = immobile
      ? 1
      : 0.94 + 0.06 * Math.sin(this.temps / 1900 + hash2(this.graine, 2, 5) * 6.283);
    this.node.alpha = this.force * scintillement;
  }
}
