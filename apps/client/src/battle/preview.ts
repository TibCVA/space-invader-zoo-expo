/**
 * `battle/preview.ts` — la carte de prévisualisation d'attaque.
 *
 * Exigence forte du document maître : avant de frapper, le joueur doit voir la
 * fourchette de dégâts, les pertes probables, la riposte attendue, les effets
 * en cours **et la raison de chaque modificateur**.
 *
 * Tous ces nombres viennent de `damageRange` (moteur). La vue n'en calcule
 * aucun : elle lit `DamageRangeResult.modifiers`, qui porte déjà le libellé
 * français et la valeur en points de base, et les affiche **tous**.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import { damageRange, findUnit, unitDef, unitLabel, unitTotalHp } from '@auvergne/engine';
import type { CombatEffect, CombatState, CombatUnit } from '@auvergne/engine';
import type { ArtAtlas } from '../art/index.js';
import type { AttackPreview } from '../view-contract.js';
import {
  LIGHT,
  PALETTE,
  assombrir,
  eclaircir,
  melanger,
  ombreBleutee,
} from '../art/palette.js';
import { blob, flat } from '../art/shading.js';
import {
  donnee,
  filetSepare,
  jauge,
  nombreFr,
  panneau,
  pastille,
  pourcentBp,
  recit,
  titre,
} from './parchemin.js';

/* ══════════════════════ Construction depuis le moteur ════════════════════ */

/** Libellés français des altérations posées par les sorts et les capacités. */
const LIBELLES_EFFET: Readonly<Record<string, string>> = {
  'sys:elan': 'Élan',
  'sys:elan_utilise': 'Élan déjà pris',
  'sys:capacite_bloquee': 'Capacité bloquée',
  'sys:bloc_de_pierre': 'Blocs de pierre',
  'sys:serment_de_pierre': 'Serment de Pierre',
  'sys:serment_immunite': 'Serment : immunité',
  'sys:venin': 'Venin',
  'sys:ralentissement': 'Ralentissement',
  'sys:camouflage': 'Camouflage',
  'sys:aveuglement': 'Aveuglement',
  'sys:entrave': 'Entrave',
  'sys:protection': 'Protection magique',
  'sys:memoire_foret': 'Mémoire de la Forêt : futaie',
  'sys:memoire_hauteur': 'Mémoire de la Forêt : surplomb',
  'sys:memoire_brume': 'Mémoire de la Forêt : brume',
  'sys:memoire_rocher': 'Mémoire de la Forêt : rocher',
  'sys:memoire_source': 'Mémoire de la Forêt : source',
};

/** Nom lisible d'une altération, avec sa durée restante. */
export function libelleEffet(e: CombatEffect): string {
  const nom = LIBELLES_EFFET[e.id] ?? e.stat ?? e.kind;
  if (e.turnsLeft > 0 && e.turnsLeft < 99) {
    return `${nom} · ${e.turnsLeft} tour${e.turnsLeft > 1 ? 's' : ''}`;
  }
  return nom;
}

/** La prévisualisation, enrichie de ce que la carte affiche en plus. */
export interface ApercuComplet extends AttackPreview {
  /** uid de l'assaillant, pour retrouver sa vignette */
  readonly uidAttaquant?: string;
  readonly uidCible?: string;
  /** altérations en cours sur les deux piles */
  readonly effets?: readonly { readonly texte: string; readonly camp: 0 | 1 }[];
  /** effectif de la cible, pour situer les pertes */
  readonly effectifCible?: number;
  /** points de vie restants de la cible, sur son maximum */
  readonly vieCible?: readonly [number, number];
}

/**
 * Construit la carte depuis le moteur. **Aucune règle n'est réécrite** :
 * `damageRange` fournit la fourchette, les pertes, la riposte et le détail
 * chiffré de chaque modificateur.
 */
export function construireApercu(
  combat: CombatState,
  attaquant: CombatUnit,
  cible: CombatUnit,
  distance: boolean,
): ApercuComplet {
  const r = damageRange(combat, attaquant, cible, distance);
  const effets: { texte: string; camp: 0 | 1 }[] = [];
  for (const e of attaquant.effects) effets.push({ texte: libelleEffet(e), camp: attaquant.side });
  for (const e of cible.effects) effets.push({ texte: libelleEffet(e), camp: cible.side });
  const def = unitDef(cible);
  return {
    attacker: unitLabel(attaquant),
    target: unitLabel(cible),
    from: attaquant.at,
    ranged: distance,
    damage: { min: r.min, max: r.max },
    kills: r.kills,
    retaliation: r.retaliation,
    modifiers: r.modifiers,
    uidAttaquant: attaquant.uid,
    uidCible: cible.uid,
    effets,
    effectifCible: cible.count,
    vieCible: [unitTotalHp(cible), Math.max(1, cible.startCount * def.hp)],
  };
}

/** Complète une prévisualisation venue de la coquille avec ce qu'elle omet. */
export function enrichirApercu(combat: CombatState, apercu: AttackPreview): ApercuComplet {
  const a = findUnit(combat, apercu.attacker);
  const c = findUnit(combat, apercu.target);
  if (a && c) {
    return {
      ...construireApercu(combat, a, c, apercu.ranged),
      damage: apercu.damage,
      kills: apercu.kills,
      retaliation: apercu.retaliation,
      modifiers: apercu.modifiers,
      from: apercu.from ?? a.at,
    };
  }
  return { ...apercu };
}

/* ═══════════════════════════════ La carte ════════════════════════════════ */

const LARGEUR = 344;

/**
 * Carte de parchemin posée à côté de la cible. Elle se ferme d'elle-même quand
 * la prévisualisation disparaît.
 */
export class CarteApercu {
  readonly container = new Container();

  private readonly fond = new Graphics();
  private readonly corps = new Container();
  private hauteur = 0;
  private horloge = 0;
  private ouverte = false;

  constructor(
    private readonly atlas: ArtAtlas,
    private readonly reducedMotion: boolean,
  ) {
    this.container.label = 'apercu-attaque';
    this.container.visible = false;
    this.container.addChild(this.fond, this.corps);
  }

  get largeur(): number {
    return LARGEUR;
  }

  get hauteurCourante(): number {
    return this.hauteur;
  }

  get estOuverte(): boolean {
    return this.ouverte;
  }

  fermer(): void {
    this.ouverte = false;
    this.container.visible = false;
    this.corps.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.fond.clear();
  }

  /** Recompose la carte. Appelée seulement quand la prévisualisation change. */
  montrer(apercu: ApercuComplet, combat: CombatState): void {
    this.corps.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.fond.clear();
    this.ouverte = true;
    this.container.visible = true;

    const mats = this.atlas.materials;
    const marge = 16;
    let y = 14;

    /* ── en-tête : les deux silhouettes et le sens du coup ── */
    const entete = titre(apercu.ranged ? 'Tir' : 'Assaut', 15, melanger(PALETTE.encre, PALETTE.grenat, 0.4));
    entete.position.set(marge, y);
    this.corps.addChild(entete);

    const mode = donnee(
      apercu.ranged ? 'à distance' : 'au corps à corps',
      13,
      melanger(PALETTE.encre, PALETTE.brunFougere, 0.45),
    );
    mode.anchor.set(1, 0);
    mode.position.set(LARGEUR - marge, y + 2);
    this.corps.addChild(mode);
    y += 24;

    const ligne = new Container();
    ligne.position.set(marge, y);
    const a = findUnit(combat, apercu.uidAttaquant ?? '');
    const c = findUnit(combat, apercu.uidCible ?? '');
    this.silhouette(ligne, 0, a);
    this.silhouette(ligne, LARGEUR - marge * 2 - 42, c);

    const nomA = donnee(apercu.attacker, 14, PALETTE.encre, true);
    nomA.position.set(48, 2);
    ligne.addChild(nomA);
    const nomC = donnee(apercu.target, 14, PALETTE.encre, true);
    nomC.anchor.set(1, 0);
    nomC.position.set(LARGEUR - marge * 2 - 48, 20);
    ligne.addChild(nomC);

    /* flèche : direction du coup, dessinée, jamais un caractère */
    const fleche = new Graphics();
    const fy = 22;
    fleche.moveTo(52, fy).lineTo(LARGEUR - marge * 2 - 58, fy);
    fleche.stroke({ color: melanger(PALETTE.grenat, LIGHT.rim, 0.4), width: 1.6, alpha: 0.75 });
    fleche.poly([
      LARGEUR - marge * 2 - 50, fy,
      LARGEUR - marge * 2 - 60, fy - 4.4,
      LARGEUR - marge * 2 - 60, fy + 4.4,
    ]).fill({ color: melanger(PALETTE.grenat, LIGHT.rim, 0.4), alpha: 0.9 });
    ligne.addChild(fleche);
    this.corps.addChild(ligne);
    y += 46;

    /* ── fourchette de dégâts ── */
    const g = new Graphics();
    this.corps.addChild(g);
    filetSepare(g, marge, y, LARGEUR - marge * 2, 0.8);
    y += 12;

    const etiqDegats = donnee('Dégâts', 13, melanger(PALETTE.encre, PALETTE.brunFougere, 0.4));
    etiqDegats.position.set(marge, y + 6);
    this.corps.addChild(etiqDegats);

    const chiffre = titre(
      apercu.damage.min === apercu.damage.max
        ? nombreFr(apercu.damage.min)
        : `${nombreFr(apercu.damage.min)} – ${nombreFr(apercu.damage.max)}`,
      26,
      melanger(PALETTE.encre, PALETTE.grenat, 0.25),
    );
    chiffre.anchor.set(1, 0);
    chiffre.position.set(LARGEUR - marge, y - 2);
    this.corps.addChild(chiffre);
    y += 34;

    /* ── pertes probables ── */
    const [kMin, kMax] = apercu.kills;
    const effectif = apercu.effectifCible ?? 0;
    const etiqPertes = donnee('Pertes probables', 13, melanger(PALETTE.encre, PALETTE.brunFougere, 0.4));
    etiqPertes.position.set(marge, y);
    this.corps.addChild(etiqPertes);

    const valPertes = donnee(
      effectif > 0
        ? `${kMin === kMax ? kMin : `${kMin} à ${kMax}`} sur ${effectif}`
        : `${kMin} à ${kMax}`,
      16,
      kMax > 0 ? PALETTE.grenat : melanger(PALETTE.encre, PALETTE.bleuBrume, 0.4),
      true,
    );
    valPertes.anchor.set(1, 0);
    valPertes.position.set(LARGEUR - marge, y - 2);
    this.corps.addChild(valPertes);
    y += 22;

    if (apercu.vieCible) {
      const [reste, max] = apercu.vieCible;
      jauge(g, marge, y, LARGEUR - marge * 2, 7, reste / max, melanger(PALETTE.vertHetre, LIGHT.chaude, 0.25));
      /* part de la pile que le coup emporterait, en surimpression grenat */
      if (effectif > 0 && kMax > 0) {
        const part = Math.min(1, kMax / effectif);
        const w = (LARGEUR - marge * 2 - 2) * (reste / max);
        const perte = Math.max(2, w * part);
        g.rect(marge + 1 + w - perte, y + 1, perte, 5).fill({ color: PALETTE.grenat, alpha: 0.75 });
        g.rect(marge + 1 + w - perte, y + 1, 1.4, 5).fill({ color: LIGHT.chaude, alpha: 0.5 });
      }
      const vie = donnee(
        `${nombreFr(reste)} / ${nombreFr(max)} points de vie`,
        12,
        melanger(PALETTE.encre, PALETTE.brunFougere, 0.5),
      );
      vie.position.set(marge, y + 10);
      this.corps.addChild(vie);
      y += 28;
    }

    /* ── riposte ── */
    const riposte = donnee(
      apercu.retaliation ? 'Riposte attendue' : 'Aucune riposte',
      14,
      apercu.retaliation ? PALETTE.grenat : melanger(PALETTE.encre, PALETTE.vertHetre, 0.45),
      true,
    );
    riposte.position.set(marge + 14, y);
    this.corps.addChild(riposte);
    pastille(g, marge + 5, y + 8, 4.4, apercu.retaliation ? PALETTE.grenat : PALETTE.vertHetre);
    y += 24;

    /* ── effets en cours ── */
    const effets = apercu.effets ?? [];
    if (effets.length > 0) {
      filetSepare(g, marge, y, LARGEUR - marge * 2, 0.6);
      y += 10;
      const etiq = donnee('Effets en cours', 12, melanger(PALETTE.encre, PALETTE.brunFougere, 0.45));
      etiq.position.set(marge, y);
      this.corps.addChild(etiq);
      y += 17;
      let x = marge;
      for (const e of effets.slice(0, 6)) {
        const t = donnee(e.texte, 12, PALETTE.encre);
        const w = t.width + 16;
        if (x + w > LARGEUR - marge) {
          x = marge;
          y += 21;
        }
        const teinte = e.camp === 0 ? PALETTE.grenat : PALETTE.vertSapin;
        g.roundRect(x, y - 2, w, 18, 3).fill({ color: melanger(PALETTE.parcheminOmbre, teinte, 0.16), alpha: 0.9 });
        g.roundRect(x, y - 2, w, 18, 3).stroke({ color: assombrir(PALETTE.parcheminOmbre, 0.4), width: 1 });
        g.moveTo(x + w - 1, y).lineTo(x + w - 1, y + 14).stroke({ color: LIGHT.rim, width: 1, alpha: LIGHT.rimAlpha });
        g.rect(x + 1, y - 1, 2.6, 16).fill({ color: teinte, alpha: 0.85 });
        t.position.set(x + 8, y);
        this.corps.addChild(t);
        x += w + 6;
      }
      y += 24;
    }

    /* ── la raison de chaque modificateur : tous, sans exception ── */
    filetSepare(g, marge, y, LARGEUR - marge * 2, 0.7);
    y += 11;
    const titreMod = donnee('Pourquoi ce chiffre', 13, melanger(PALETTE.encre, PALETTE.brunFougere, 0.35), true);
    titreMod.position.set(marge, y);
    this.corps.addChild(titreMod);
    y += 20;

    for (const m of apercu.modifiers) {
      const positif = m.bp > 0;
      const neutre = m.bp === 0;
      const teinte = neutre
        ? melanger(PALETTE.encre, PALETTE.bleuBrume, 0.42)
        : positif
          ? melanger(PALETTE.vertHetre, PALETTE.encre, 0.3)
          : PALETTE.grenat;
      pastille(g, marge + 4, y + 7, 3.2, neutre ? PALETTE.bleuBrume : positif ? PALETTE.vertHetre : PALETTE.grenat, 0.9);

      const valeur = neutre ? '' : `${pourcentBp(m.bp)}`;
      const val = donnee(valeur, 13, teinte, true);
      val.anchor.set(1, 0);
      val.position.set(LARGEUR - marge, y);
      this.corps.addChild(val);

      const libelle = recit(m.label, 13.5, melanger(PALETTE.encre, PALETTE.brunFougere, 0.2), LARGEUR - marge * 2 - 26 - (val.width + 8));
      libelle.position.set(marge + 13, y - 1);
      this.corps.addChild(libelle);

      if (!neutre) {
        const bp = donnee(`${m.bp > 0 ? '+' : '−'}${nombreFr(Math.abs(m.bp))} BP`, 11, melanger(teinte, PALETTE.parcheminOmbre, 0.35));
        bp.anchor.set(1, 0);
        bp.position.set(LARGEUR - marge, y + 15);
        this.corps.addChild(bp);
        y += Math.max(30, libelle.height + 16);
      } else {
        y += Math.max(19, libelle.height + 5);
      }
    }

    y += 12;
    this.hauteur = y;

    /* ── le parchemin, peint une fois la hauteur connue ── */
    panneau(this.fond, mats, 0, 0, LARGEUR, this.hauteur, {
      teinte: PALETTE.parchemin,
      matiere: 'parchemin',
      matiereAlpha: 0.2,
      graine: 29,
    });
    /* onglet grenat en tête : la carte se distingue des autres panneaux */
    this.fond.poly(flat(blob(LARGEUR * 0.5, 0, LARGEUR * 0.34, 8, { seed: 12, points: 18, wobble: 0.16 }))).fill({
      color: melanger(PALETTE.grenat, PALETTE.parcheminOmbre, 0.25),
      alpha: 0.9,
    });
    this.fond.moveTo(LARGEUR * 0.2, 1.6).lineTo(LARGEUR * 0.8, 1.6).stroke({
      color: LIGHT.rim,
      width: 1.2,
      alpha: 0.6,
    });
  }

  /** Silhouette d'une pile dans l'en-tête de la carte. */
  private silhouette(hote: Container, x: number, unit: CombatUnit | null): void {
    const cadre = new Graphics();
    const base = melanger(PALETTE.parcheminOmbre, PALETTE.granitClair, 0.3);
    cadre.roundRect(x, 0, 42, 42, 3).fill({ color: base });
    cadre.roundRect(x, 0, 42, 21, 3).fill({ color: eclaircir(base, 0.4), alpha: 0.35 });
    cadre.roundRect(x, 21, 42, 21, 3).fill({ color: ombreBleutee(base, 0.4), alpha: 0.3 });
    cadre.roundRect(x + 0.5, 0.5, 41, 41, 3).stroke({ color: assombrir(base, 0.5), width: 1.2 });
    cadre.moveTo(x + 40.6, 4).lineTo(x + 40.6, 38).stroke({ color: LIGHT.rim, width: 1.2, alpha: LIGHT.rimAlpha });
    hote.addChild(cadre);
    if (!unit) return;
    const tex = this.atlas.creature(unit.creature);
    const s = new Sprite(tex);
    const k = 38 / Math.max(8, tex.height);
    s.scale.set(unit.side === 1 ? -k : k, k);
    s.anchor.set(0.5, 0.96);
    s.position.set(x + 21, 40);
    hote.addChild(s);
  }

  /** Loi n°7 : la carte respire, très légèrement. */
  update(dtMs: number, ancre: { x: number; y: number }): void {
    if (!this.ouverte) return;
    this.horloge += dtMs / 1000;
    const d = this.reducedMotion ? 0 : Math.sin(this.horloge * 0.9) * 1.4;
    this.container.position.set(Math.round(ancre.x), Math.round(ancre.y + d));
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
