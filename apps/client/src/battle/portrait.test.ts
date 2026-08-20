/**
 * EN PORTRAIT, LE CHAMP DE BATAILLE DOIT RESTER LE PLUS GRAND OBJET DE L'ÉCRAN.
 *
 * Défaut mesuré sur la capture iPhone : la carte d'aperçu occupait ~52 % de
 * la hauteur de scène. La réserve posée sous le champ valait
 * `min(320, max(230, hauteur × 0,44))` — jusqu'à 320 points — alors qu'elle
 * ne porte que deux choses : le bandeau de fiche et la COIFFE de la carte
 * amarrée. La carte dépliée, elle, se superpose au champ : c'est tout son
 * intérêt, et il n'y avait donc rien à lui réserver.
 *
 * Résultat : sur une scène d'iPhone 14 (390 × 754 une fois la barre de pouce
 * retranchée), le champ tombait à 276 points sur 754 — moins que la réserve
 * qui l'entourait.
 *
 * Le gabarit et la bande du champ ne sont pas recopiés : ils viennent de
 * `gabarit()` et `bandeDuChamp()`, ceux-là même que la vue appelle.
 */
import { describe, expect, it } from 'vitest';
import { bandeDuChamp, gabarit } from './index.js';

/**
 * Hauteurs de SCÈNE, barre de pouce déjà retranchée — c'est ce que la toile
 * Pixi reçoit une fois `.jeu-scene__toile` correctement bornée.
 */
const TELEPHONES: readonly { nom: string; largeur: number; hauteur: number }[] = [
  { nom: 'iPhone 14 · scène pleine', largeur: 390, hauteur: 844 },
  { nom: 'iPhone 14 · scène réelle', largeur: 390, hauteur: 754 },
  { nom: 'iPhone 14 · navigateur bas', largeur: 390, hauteur: 700 },
  { nom: 'iPhone SE · scène pleine', largeur: 375, hauteur: 667 },
  { nom: 'iPhone SE · scène réelle', largeur: 375, hauteur: 540 },
  { nom: 'petit Android', largeur: 360, hauteur: 640 },
];

describe('disposition portrait du combat', () => {
  it('tous ces écrans sont bien en portrait compact', () => {
    for (const e of TELEPHONES) {
      const plan = gabarit(e.largeur, e.hauteur);
      expect(plan.compact, e.nom).toBe(true);
      expect(plan.portrait, e.nom).toBe(true);
    }
  });

  it('la réserve du bas ne porte que ce qu’elle contient : fiche et coiffe', () => {
    for (const e of TELEPHONES) {
      const plan = gabarit(e.largeur, e.hauteur);
      /* 54 points : la coiffe de la carte repliée plus sa marge. Sans eux la
         carte repliée mordrait sur le champ ou sur la fiche. */
      expect(plan.info, `${e.nom} · plancher`).toBeGreaterThanOrEqual(plan.fiche + 54);
      /* La carte DÉPLIÉE se superpose au champ : rien de plus à réserver
         qu'une poignée de points de confort. */
      expect(plan.info, `${e.nom} · plafond`).toBeLessThanOrEqual(plan.fiche + 96);
    }
  });

  it('le champ garde plus de hauteur que la réserve qui le borde', () => {
    for (const e of TELEPHONES) {
      const plan = gabarit(e.largeur, e.hauteur);
      /* panneau d'actions rétracté : l'état ordinaire du combat */
      const bande = bandeDuChamp(plan, e.largeur, e.hauteur, plan.bas);
      expect(bande.h, `${e.nom} · champ ${String(bande.h)} vs réserve ${String(plan.info)}`)
        .toBeGreaterThan(plan.info);
    }
  });

  it('le champ garde au moins un tiers de la scène, même sur le plus petit écran', () => {
    for (const e of TELEPHONES) {
      const plan = gabarit(e.largeur, e.hauteur);
      const bande = bandeDuChamp(plan, e.largeur, e.hauteur, plan.bas);
      expect(bande.h / e.hauteur, e.nom).toBeGreaterThan(1 / 3);
    }
  });

  it('la réserve tient sous le champ sans jamais déborder de la scène', () => {
    for (const e of TELEPHONES) {
      const plan = gabarit(e.largeur, e.hauteur);
      const bande = bandeDuChamp(plan, e.largeur, e.hauteur, plan.bas);
      expect(bande.y + bande.h + plan.info + plan.bas, e.nom).toBeLessThanOrEqual(e.hauteur);
    }
  });
});
