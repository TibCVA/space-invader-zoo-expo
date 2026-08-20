/**
 * Les seuils de la carte, tenus par un test et non plus par un rapport imprimé.
 *
 * Le tableau de bord `carte.ts` mesure tout cela depuis longtemps — et
 * n'échoue jamais : « un instrument, pas une porte de qualité », dit son
 * en-tête, et c'était un choix assumé tant que quelqu'un lisait le rapport.
 *
 * Le passage de la carte à la taille d'une XL de HMM3 a montré ce que ce choix
 * coûte. Tous ces nombres ont bougé d'un coup, en silence : la densité d'objets
 * a triplé, la part d'infranchissable a chuté, les points d'articulation sont
 * tombés de quatorze à quatre, et il a fallu les redécouvrir un par un, à la
 * main, longtemps après. Un seuil que personne ne tient n'est pas un seuil.
 *
 * Deux catégories de seuils ici, et la distinction est importante :
 *
 *  - ceux qui sont **atteints** : ils sont exigés strictement ;
 *  - ceux qui ne le sont **pas encore** — l'infranchissable et les
 *    articulations — pour lesquels on fige la mesure du jour comme plancher de
 *    non-régression, avec la cible écrite à côté. Ce n'est pas se donner
 *    raison : c'est empêcher que l'écart se creuse pendant qu'on travaille
 *    ailleurs, et rendre visible dans le code le chantier qui reste.
 */
import { describe, expect, it } from 'vitest';
import { mesurer } from './carte.js';

/** La graine de démonstration : celle que le tableau de bord imprime. */
const GRAINE = 20250816;
const r = mesurer(GRAINE);

describe('la carte — ce qui est tenu', () => {
  it('porte la densité d’objets d’une XL de HMM3', () => {
    // Une case praticable sur 35 à 50 : le décompte famille par famille d'une
    // vraie XL donne de 400 à 620 lieux sur 20 736 cases.
    expect(r.casesParObjet, `une case sur ${String(r.casesParObjet)}`).toBeGreaterThanOrEqual(35);
    expect(r.casesParObjet, `une case sur ${String(r.casesParObjet)}`).toBeLessThanOrEqual(50);
  });

  it('ne laisse aucun canton sans rien à y trouver', () => {
    expect(r.blocsVides, `${String(r.blocsVides)} blocs vides sur ${String(r.blocsTotal)}`).toBe(0);
    // Le compte de blocs doit rester substantiel, sans quoi « zéro vide » ne
    // dirait rien : c'est le piège d'un plancher de surface trop haut.
    expect(r.blocsTotal).toBeGreaterThan(60);
  });

  it('tient d’un seul tenant : aucune poche isolée', () => {
    expect(r.composantes).toBe(1);
  });

  it('donne au glaneur de quoi cueillir chaque jour', () => {
    const parJour = r.glanage.reduce((s, g) => s + g.objetsParJour, 0) / r.glanage.length;
    expect(parJour).toBeGreaterThanOrEqual(2.5);
    // Et pas au point que la carte se vide en deux semaines.
    expect(parJour).toBeLessThanOrEqual(7);
  });

  it('pose des gardes qui bloquent vraiment', () => {
    expect(r.gardesBloquants).toBeGreaterThanOrEqual(20);
  });
});

describe('la carte — ce qui reste à faire, et ne doit pas empirer', () => {
  /*
   * Le relief ne ferme pas les zones. C'est le chantier P0.4 de la passation :
   * cible 12 % d'infranchissable et au moins douze points d'articulation, pour
   * qu'une carte de HMM3 ait des goulets qu'on doive forcer. On en est loin,
   * et abaisser le seuil de falaise ne suffira pas — au-delà de 7,7 % on ferme
   * des versants entiers. Ces deux planchers ne disent donc pas « c'est bien » :
   * ils disent « n'empire pas pendant qu'on travaille ailleurs ».
   */
  it('ne descend pas sous la part d’infranchissable mesurée ce jour', () => {
    expect(r.partInfranchissable, 'cible du plan : 0,12').toBeGreaterThanOrEqual(0.028);
  });

  it('ne descend pas sous le nombre de points d’articulation mesuré ce jour', () => {
    expect(r.articulations, 'cible du plan : 12').toBeGreaterThanOrEqual(4);
  });
});
