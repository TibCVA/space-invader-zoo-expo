/**
 * AU DOIGT, ON VISE PUIS ON CONFIRME.
 *
 * Défaut mesuré : dans `surClic`, la branche « pile ennemie » construisait
 * l'aperçu et appelait `assaillir` dans la foulée — aucune étape de
 * confirmation. Le PREMIER appui dépensait donc le tour. L'aide affichée en
 * compact promettait pourtant l'inverse : « Touchez une case pour marcher,
 * une pile ennemie pour la viser. » Le texte promettait une visée, le code
 * frappait. Sur un écran de 390 points un hexagone fait une vingtaine de
 * pixels : un pouce qui rate d'une case perd l'activation.
 *
 * À la souris rien ne change : le survol a déjà posé l'aperçu et le curseur,
 * la visée a eu lieu avant le clic. Le geste de HMM3 reste d'un seul clic.
 */
import { describe, expect, it } from 'vitest';
import { gesteSurEnnemi } from './index.js';

describe('viser puis frapper', () => {
  it('à la souris, le clic frappe — visée ou non', () => {
    expect(gesteSurEnnemi(false, null, 'E1')).toBe('frapper');
    expect(gesteSurEnnemi(false, 'E1', 'E1')).toBe('frapper');
    expect(gesteSurEnnemi(false, 'E2', 'E1')).toBe('frapper');
  });

  it('au doigt, le premier appui ne fait que viser', () => {
    expect(gesteSurEnnemi(true, null, 'E1')).toBe('viser');
  });

  it('au doigt, le second appui sur la MÊME pile frappe', () => {
    const premier = gesteSurEnnemi(true, null, 'E1');
    expect(premier).toBe('viser');
    /* la vue retient la cible visée, puis le doigt revient dessus */
    expect(gesteSurEnnemi(true, 'E1', 'E1')).toBe('frapper');
  });

  it('changer de cible remet la visée à zéro, jamais un coup par surprise', () => {
    expect(gesteSurEnnemi(true, 'E1', 'E2')).toBe('viser');
    expect(gesteSurEnnemi(true, 'E2', 'E2')).toBe('frapper');
  });

  it('une visée ne frappe jamais deux piles à la fois', () => {
    const cibles = ['E1', 'E2', 'E3'];
    for (const visee of cibles) {
      const frappees = cibles.filter((c) => gesteSurEnnemi(true, visee, c) === 'frapper');
      expect(frappees, `visée ${visee}`).toEqual([visee]);
    }
  });
});
