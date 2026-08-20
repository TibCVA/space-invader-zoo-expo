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
import { GESTE_ECOLE } from '../art/effects.js';

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

/**
 * Chaque école a son geste, et pas seulement sa couleur.
 *
 * Les quatre écoles partageaient un unique réglage d'aura : même texture,
 * même nombre de particules, même durée, même vitesse, même gravité, même
 * dérive. Seules la teinte et le mode de fusion changeaient. C'était la moitié
 * du travail — le joueur voyait qu'un sort était parti, mais rien dans le
 * mouvement ne lui disait de quelle école, et dans une scène chargée le
 * mouvement se lit avant la teinte.
 *
 * Ces tests ne jugent pas du goût : ils vérifient que les quatre réglages sont
 * réellement distincts, et que chacun tient la promesse de son école — le feu
 * monte, l'eau tombe, la brume s'attarde, les racines tournent.
 */
describe('le geste de chaque école', () => {
  const ECOLES = ['braises', 'sources', 'brumes', 'racines'] as const;

  it('donne à chaque école un réglage qui n’en double aucun autre', () => {
    const signatures = ECOLES.map((e) => JSON.stringify(GESTE_ECOLE[e]));
    expect(new Set(signatures).size, signatures.join('\n')).toBe(ECOLES.length);
  });

  it('n’emploie pas la même texture pour toutes les écoles', () => {
    // C'était le défaut : quatre fois « halo ».
    const textures = new Set(ECOLES.map((e) => GESTE_ECOLE[e].texture));
    expect(textures.size).toBeGreaterThan(1);
  });

  it('fait monter les braises et tomber les sources', () => {
    // La gravité est le signe le plus lisible : négative, ça monte.
    expect(GESTE_ECOLE.braises.gravite).toBeLessThan(0);
    expect(GESTE_ECOLE.sources.gravite).toBeGreaterThan(0);
  });

  it('fait s’attarder la brume plus que toute autre école', () => {
    const plusLongue = Math.max(
      ...ECOLES.filter((e) => e !== 'brumes').map((e) => GESTE_ECOLE[e].duree[1]),
    );
    expect(GESTE_ECOLE.brumes.duree[1]).toBeGreaterThan(plusLongue);
    // Et dériver de côté plus que les autres : elle glisse au lieu de filer.
    const plusDerivante = Math.max(
      ...ECOLES.filter((e) => e !== 'brumes').map((e) => GESTE_ECOLE[e].derive),
    );
    expect(GESTE_ECOLE.brumes.derive).toBeGreaterThan(plusDerivante);
  });

  it('fait tourner les racines plus que toute autre école', () => {
    const amplitude = (e: (typeof ECOLES)[number]): number =>
      GESTE_ECOLE[e].rotation[1] - GESTE_ECOLE[e].rotation[0];
    const plusVrillee = Math.max(...ECOLES.filter((e) => e !== 'racines').map(amplitude));
    expect(amplitude('racines')).toBeGreaterThan(plusVrillee);
  });
});
