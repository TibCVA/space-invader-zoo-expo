/**
 * L'école d'un sort se lit, elle ne se devine pas.
 *
 * L'audit du combat a mesuré le défaut : l'animation choisissait la couleur
 * et l'aura du sort en cherchant des mots-clefs dans la phrase du journal
 * (« feu », « soin », « ronce »…). Sur les trente-deux sorts du contenu,
 * **dix-huit** tombaient sur la mauvaise école — « Foudre des Bois Noirs »
 * n'a ni braise ni source dans son nom et virait donc en brumes, « Regain »
 * en racines. Un joueur qui apprend les écoles par la couleur apprenait faux.
 *
 * Le moteur porte désormais `ecole` dans le détail de chaque entrée de sort
 * (`castCombatSpell`), et l'affichage la lit. Le repli par mots-clefs ne
 * sert plus qu'aux parties enregistrées avant ce correctif.
 *
 * Ce test compte les erreurs des deux méthodes sur le contenu réel : le
 * repli doit se tromper (sinon il n'y avait pas de défaut à corriger) et la
 * lecture du détail ne doit jamais se tromper.
 */
import { describe, expect, it } from 'vitest';
import { SPELL_LIST } from '@auvergne/content';
import { ecoleDuSort } from './anim.js';

describe('école d’un sort', () => {
  it('la lecture du détail du moteur ne se trompe jamais', () => {
    const fautes: string[] = [];
    for (const sort of SPELL_LIST) {
      /* La phrase que le moteur écrit à la première entrée du sort. */
      const texte = `Le héros lance « ${sort.name} ».`;
      const lue = ecoleDuSort({ sort: sort.id, ecole: sort.school }, texte);
      if (lue !== sort.school) fautes.push(`${sort.name} : ${lue} au lieu de ${sort.school}`);
    }
    expect(fautes, fautes.join(' · ')).toEqual([]);
  });

  it('le repli par mots-clefs se trompait sur la moitié du grimoire', () => {
    /* La mesure qui justifie le correctif. Si un jour ce test devenait vert
       à zéro faute, c'est que les noms de sorts ont changé — pas que la
       devinette était bonne : on lirait quand même le détail du moteur. */
    let fautes = 0;
    for (const sort of SPELL_LIST) {
      const texte = `Le héros lance « ${sort.name} ».`;
      if (ecoleDuSort(undefined, texte) !== sort.school) fautes++;
    }
    expect(fautes, `${String(fautes)} sorts sur ${String(SPELL_LIST.length)}`).toBeGreaterThan(
      SPELL_LIST.length / 4,
    );
  });

  it('un détail illisible retombe sur le repli, sans jamais lever', () => {
    expect(ecoleDuSort({ ecole: 'chocolat' }, 'Le héros lance « Braises ».')).toBe('braises');
    expect(ecoleDuSort({}, 'Le héros lance « Soin ».')).toBe('sources');
    expect(ecoleDuSort(undefined, '')).toBe('brumes');
  });
});
