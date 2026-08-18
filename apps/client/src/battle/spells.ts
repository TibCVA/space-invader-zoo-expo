/**
 * `battle/spells.ts` — le grimoire au combat.
 *
 * Trois choses : le choix du sort (liste de parchemins par école), le ciblage
 * (la vue affiche les cases que `spellTargets` désigne, elle n'en choisit
 * aucune) et l'effet visuel (aura d'école, trait de sort, retombée).
 *
 * Les coûts, les portées et la validité viennent de `canCastSpell` : la vue
 * n'autorise ni ne refuse rien, elle affiche ce que le moteur répond.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { spellDef } from '@auvergne/engine';
import type { HeroInstance, SpellDef, SpellId, SpellSchool } from '@auvergne/engine';
import type { ArtAtlas } from '../art/index.js';
import {
  LIGHT,
  PALETTE,
  SCHOOL_COLORS,
  assombrir,
  eclaircir,
  faceEclairee,
  melanger,
  ombreBleutee,
} from '../art/palette.js';
import { blob, flat } from '../art/shading.js';
import { donnee, filetSepare, panneau, recit, titre } from './parchemin.js';

/* ═════════════════════════════ Les écoles ════════════════════════════════ */

export const ECOLES: readonly SpellSchool[] = ['braises', 'sources', 'brumes', 'racines'];

export const NOM_ECOLE: Readonly<Record<SpellSchool, string>> = {
  braises: 'Braises',
  sources: 'Sources',
  brumes: 'Brumes',
  racines: 'Racines',
};

/** Teinte d'aura d'une école (bible artistique §2). */
export function couleurEcole(ecole: SpellSchool): number {
  return SCHOOL_COLORS[ecole].halo;
}

/** Teinte de cœur, plus claire : le centre de l'aura et les particules. */
export function coeurEcole(ecole: SpellSchool): number {
  return SCHOOL_COLORS[ecole].coeur;
}

/** Le sort, s'il existe dans le contenu ; `null` sinon (jamais d'exception). */
export function sortConnu(id: SpellId): SpellDef | null {
  try {
    return spellDef(id);
  } catch {
    return null;
  }
}

/* ═════════════════════════ Le panneau de sélection ═══════════════════════ */

export interface EntreeSort {
  readonly def: SpellDef;
  /** vrai si le moteur accepte le lancer maintenant */
  readonly possible: boolean;
  /** raison française du refus, telle que `canCastSpell` la donne */
  readonly refus: string | null;
}

/**
 * Grimoire ouvert : les sorts du héros, groupés par école, chacun avec son
 * coût et, s'il est refusé, la raison du refus.
 */
export class PanneauSorts {
  readonly container = new Container();

  private readonly fond = new Graphics();
  private readonly corps = new Container();
  private readonly zones: { id: SpellId; x: number; y: number; w: number; h: number; possible: boolean }[] = [];
  private largeur = 300;
  private hauteur = 0;
  private horloge = 0;
  private choisi: SpellId | null = null;

  constructor(
    private readonly atlas: ArtAtlas,
    private readonly reducedMotion: boolean,
  ) {
    this.container.label = 'grimoire';
    this.container.visible = false;
    this.container.addChild(this.fond, this.corps);
  }

  get ouvert(): boolean {
    return this.container.visible;
  }

  get taille(): { largeur: number; hauteur: number } {
    return { largeur: this.largeur, hauteur: this.hauteur };
  }

  get sortChoisi(): SpellId | null {
    return this.choisi;
  }

  choisir(id: SpellId | null): void {
    this.choisi = id;
  }

  fermer(): void {
    this.container.visible = false;
    this.zones.length = 0;
  }

  /** Sort sous un point local au panneau, ou `null`. */
  sortA(x: number, y: number): SpellId | null {
    for (const z of this.zones) {
      if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z.id;
    }
    return null;
  }

  /**
   * Compose le grimoire. `entrees` est déjà filtré et justifié par la coquille
   * ou par la vue à partir de `canCastSpell` : rien n'est décidé ici.
   */
  montrer(hero: HeroInstance | null, entrees: readonly EntreeSort[], largeur: number): void {
    this.largeur = largeur;
    this.container.visible = true;
    this.corps.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.zones.length = 0;
    this.fond.clear();

    const marge = 14;
    let y = 14;

    const t = titre('Grimoire', 16, PALETTE.encre);
    t.position.set(marge, y);
    this.corps.addChild(t);

    if (hero) {
      const mana = donnee(`${hero.mana} / ${hero.manaMax} manne`, 13, melanger(PALETTE.encre, PALETTE.bleuProfond, 0.4), true);
      mana.anchor.set(1, 0);
      mana.position.set(largeur - marge, y + 3);
      this.corps.addChild(mana);
    }
    y += 26;

    const g = new Graphics();
    this.corps.addChild(g);

    if (!hero) {
      const note = recit(
        "Aucun héros ne conduit ce camp : les piles se battent sans magie, comme une compagnie sans chapelain.",
        14,
        melanger(PALETTE.encre, PALETTE.brunFougere, 0.4),
        largeur - marge * 2,
      );
      note.position.set(marge, y);
      this.corps.addChild(note);
      y += note.height + 14;
      this.hauteur = y;
      this.peindreFond();
      return;
    }

    if (entrees.length === 0) {
      const note = recit(
        'Le héros ne connaît aucun sort utilisable sur ce champ.',
        14,
        melanger(PALETTE.encre, PALETTE.brunFougere, 0.4),
        largeur - marge * 2,
      );
      note.position.set(marge, y);
      this.corps.addChild(note);
      y += note.height + 14;
      this.hauteur = y;
      this.peindreFond();
      return;
    }

    for (const ecole of ECOLES) {
      const lot = entrees.filter((e) => e.def.school === ecole);
      if (lot.length === 0) continue;
      const teinte = couleurEcole(ecole);
      filetSepare(g, marge, y, largeur - marge * 2, 0.5);
      y += 9;
      const nom = donnee(NOM_ECOLE[ecole].toUpperCase(), 11.5, melanger(teinte, PALETTE.encre, 0.35), true);
      nom.position.set(marge + 12, y);
      this.corps.addChild(nom);
      g.poly(flat(blob(marge + 5, y + 7, 4.2, 4.2, { seed: ecole.length * 7, points: 10, wobble: 0.24 }))).fill({
        color: teinte,
        alpha: 0.9,
      });
      g.poly(flat(blob(marge + 3.8, y + 5.8, 1.9, 1.6, { seed: 3, points: 8, wobble: 0.3 }))).fill({
        color: coeurEcole(ecole),
        alpha: 0.85,
      });
      y += 18;

      for (const e of lot) {
        const h = 40;
        const actif = e.possible;
        const choisi = e.def.id === this.choisi;
        const fond = choisi
          ? melanger(PALETTE.parchemin, teinte, 0.22)
          : melanger(PALETTE.parchemin, PALETTE.parcheminOmbre, actif ? 0.25 : 0.6);
        g.roundRect(marge, y, largeur - marge * 2, h, 3).fill({ color: fond, alpha: actif ? 0.94 : 0.7 });
        g.roundRect(marge, y, largeur - marge * 2, h * 0.5, 3).fill({
          color: faceEclairee(fond, 0.4),
          alpha: 0.18,
        });
        g.roundRect(marge, y, largeur - marge * 2, h, 3).stroke({
          color: choisi ? LIGHT.rim : assombrir(PALETTE.parcheminOmbre, 0.45),
          width: choisi ? 1.9 : 1.1,
          alpha: choisi ? 0.95 : 0.8,
        });
        g.moveTo(largeur - marge - 1, y + 4).lineTo(largeur - marge - 1, y + h - 4);
        g.stroke({ color: LIGHT.rim, width: 1.2, alpha: LIGHT.rimAlpha });
        g.rect(marge + 1, y + 1, 3, h - 2).fill({ color: teinte, alpha: actif ? 0.85 : 0.4 });

        const icone = this.atlas.hasIcon(`sort_${e.def.icon}`)
          ? new Sprite(this.atlas.icon(`sort_${e.def.icon}`))
          : null;
        if (icone) {
          const k = 30 / Math.max(8, icone.texture.height);
          icone.scale.set(k);
          icone.anchor.set(0.5);
          icone.position.set(marge + 24, y + h / 2);
          icone.alpha = actif ? 1 : 0.55;
          this.corps.addChild(icone);
        }

        const nomSort = donnee(e.def.name, 14, actif ? PALETTE.encre : melanger(PALETTE.encre, PALETTE.bleuBrume, 0.5), true);
        nomSort.position.set(marge + 44, y + 5);
        this.corps.addChild(nomSort);

        const sous = donnee(
          e.refus ?? `${e.def.cost} manne · niveau ${e.def.level}`,
          11.5,
          e.refus
            ? melanger(PALETTE.grenat, PALETTE.encre, 0.3)
            : melanger(PALETTE.encre, PALETTE.brunFougere, 0.45),
        );
        sous.position.set(marge + 44, y + 22);
        this.corps.addChild(sous);

        this.zones.push({ id: e.def.id, x: marge, y, w: largeur - marge * 2, h, possible: actif });
        y += h + 6;
      }
    }
    y += 6;
    this.hauteur = y;
    this.peindreFond();
  }

  private peindreFond(): void {
    panneau(this.fond, this.atlas.materials, 0, 0, this.largeur, this.hauteur, {
      teinte: PALETTE.parchemin,
      matiere: 'parchemin',
      matiereAlpha: 0.2,
      graine: 61,
    });
  }

  update(dtMs: number): void {
    if (this.reducedMotion || !this.container.visible) return;
    this.horloge += dtMs / 1000;
    this.corps.y = Math.sin(this.horloge * 0.8) * 0.8;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/* ═══════════════════════════ Effets de sort ══════════════════════════════ */

/**
 * Aura posée sur les cases visées pendant le ciblage : un halo d'école qui
 * respire, et des runes qui tournent lentement. Amplitude discrète (loi n°7).
 */
export class AuraSort {
  readonly container = new Container();

  private readonly dessin = new Graphics();
  private cases: readonly { x: number; y: number }[] = [];
  private ecole: SpellSchool = 'brumes';
  private rayon = 30;
  private horloge = 0;

  constructor(private readonly reducedMotion: boolean) {
    this.container.label = 'aura-sort';
    this.container.addChild(this.dessin);
    this.container.visible = false;
  }

  poser(cases: readonly { x: number; y: number }[], ecole: SpellSchool, rayon: number): void {
    this.cases = cases;
    this.ecole = ecole;
    this.rayon = rayon;
    this.container.visible = cases.length > 0;
    this.peindre(0);
  }

  effacer(): void {
    this.cases = [];
    this.container.visible = false;
    this.dessin.clear();
  }

  update(dtMs: number): void {
    if (!this.container.visible) return;
    this.horloge += dtMs / 1000;
    this.peindre(this.reducedMotion ? 0 : this.horloge);
  }

  private peindre(t: number): void {
    const g = this.dessin;
    g.clear();
    const halo = couleurEcole(this.ecole);
    const coeur = coeurEcole(this.ecole);
    const r = this.rayon;
    for (const c of this.cases) {
      const pulse = 1 + Math.sin(t * 1.9 + (c.x + c.y) * 0.01) * 0.035;
      for (let i = 2; i >= 0; i -= 1) {
        const k = (1 + i * 0.3) * pulse;
        g.poly(flat(blob(c.x, c.y, r * 0.82 * k, r * 0.62 * k, { seed: 11 + i, points: 18, wobble: 0.18 }))).fill({
          color: i === 0 ? coeur : halo,
          alpha: i === 0 ? 0.24 : 0.09,
        });
      }
      /* trois runes en rotation lente : la magie n'est jamais un disque uni */
      for (let i = 0; i < 3; i += 1) {
        const a = t * 0.4 + (i / 3) * Math.PI * 2;
        const px = c.x + Math.cos(a) * r * 0.6;
        const py = c.y + Math.sin(a) * r * 0.42;
        g.moveTo(px - 3.4, py - 3.4).lineTo(px + 3.4, py + 3.4);
        g.moveTo(px + 3.4, py - 3.4).lineTo(px - 3.4, py + 3.4);
        g.stroke({ color: eclaircir(coeur, 0.5), width: 1.5, alpha: 0.62 });
      }
      g.poly(flat(blob(c.x, c.y, r * 0.86 * pulse, r * 0.66 * pulse, { seed: 5, points: 20, wobble: 0.2 })), true).stroke({
        color: eclaircir(halo, 0.4),
        width: 1.6,
        alpha: 0.6,
      });
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}

/**
 * Trait de sort : la coulée d'énergie qui va du héros à sa cible. Le dessin
 * change d'école — braise en flammèche, source en filet d'eau, brume en voile,
 * racine en liane.
 */
export function traitDeSort(
  g: Graphics,
  ecole: SpellSchool,
  a: { x: number; y: number },
  b: { x: number; y: number },
  t: number,
): void {
  const halo = couleurEcole(ecole);
  const coeur = coeurEcole(ecole);
  const n = 18;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const nx = -dy;
  const ny = dx;
  const len = Math.hypot(dx, dy) || 1;
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= n; i += 1) {
    const k = i / n;
    const onde =
      Math.sin(k * (ecole === 'racines' ? 5 : 9) + t * 9) *
      (ecole === 'brumes' ? 16 : 9) *
      Math.sin(Math.PI * k);
    pts.push({ x: a.x + dx * k + (nx / len) * onde, y: a.y + dy * k + (ny / len) * onde });
  }
  g.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.stroke({ color: halo, width: 7, alpha: 0.28, cap: 'round', join: 'round' });
  g.moveTo(pts[0].x, pts[0].y);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y);
  g.stroke({ color: coeur, width: 2.6, alpha: 0.85, cap: 'round', join: 'round' });
  g.moveTo(pts[0].x, pts[0].y - 1.4);
  for (const p of pts.slice(1)) g.lineTo(p.x, p.y - 1.4);
  g.stroke({ color: LIGHT.chaude, width: 1, alpha: 0.35, cap: 'round' });
}

/** Teinte de la nappe d'ombre d'une école, pour les fonds de panneau. */
export function ombreEcole(ecole: SpellSchool): number {
  return ombreBleutee(SCHOOL_COLORS[ecole].ombre, 0.4);
}
