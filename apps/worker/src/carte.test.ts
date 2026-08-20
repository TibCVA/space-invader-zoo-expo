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
import { mesurer, tarjan } from './carte.js';

/**
 * L'instrument avant la mesure.
 *
 * On a cru la cible des goulets dépassée de onze points alors qu'elle était à
 * zéro, faute d'un compte qui distingue une frontière d'un cul-de-sac. Le
 * nouveau compte, lui, doit répondre juste sur des grilles dessinées à la main
 * — sinon on ne fait que remplacer une illusion par une autre.
 */
describe('le compte des goulets', () => {
  /** Petite grille de dessin : `#` infranchissable, tout le reste praticable. */
  function grille(lignes: string[]): { g: Uint8Array; cols: number; rows: number } {
    const rows = lignes.length;
    const cols = lignes[0]?.length ?? 0;
    const g = new Uint8Array(cols * rows);
    lignes.forEach((l, r) => {
      for (let c = 0; c < cols; c++) g[r * cols + c] = l[c] === '#' ? 0 : 1;
    });
    return { g, cols, rows };
  }

  it('voit une frontière : deux salles réunies par une seule case', () => {
    /* Deux salles de 8 × 6 = 48 cases, un unique passage entre elles. La
       diagonale compte comme un voisin, donc le mur doit être épais d'une case
       de part et d'autre du col pour que le passage soit vraiment unique. */
    const { g, cols, rows } = grille([
      '........#........',
      '........#........',
      '........#........',
      '.................',
      '........#........',
      '........#........',
      '........#........',
    ]);
    const r = tarjan(g, cols, rows);
    expect(r.composantes).toBe(1);
    expect(r.articulations).toBe(1);
    expect(r.goulets).toBe(1);
  });

  it('ne compte pas un cul-de-sac : un éperon de trois cases', () => {
    const { g, cols, rows } = grille([
      '..........',
      '..........',
      '..........',
      '..........',
      '####.#####',
      '####.#####',
      '####.#####',
    ]);
    const r = tarjan(g, cols, rows);
    expect(r.composantes).toBe(1);
    /* Le col de l'éperon EST un point d'articulation… */
    expect(r.articulations).toBeGreaterThanOrEqual(1);
    /* …mais il ne détache que trois cases : on n'y va pas, on ne le force pas. */
    expect(r.goulets).toBe(0);
  });

  it('compte les deux côtés, pas seulement le petit', () => {
    /* Un col qui détache 30 cases d'un côté et 6 de l'autre n'est pas un
       goulet : le plus petit morceau ne vaut pas le détour. C'est bien le
       MINIMUM des deux côtés qui décide, et non leur somme. */
    const { g, cols, rows } = grille([
      '######.######',
      '######.######',
      '.............',
      '.............',
      '.............',
    ]);
    const r = tarjan(g, cols, rows);
    expect(r.goulets).toBe(0);
  });

  it('sépare les composantes disjointes sans inventer de goulet', () => {
    const { g, cols, rows } = grille([
      '....#....',
      '....#....',
      '....#....',
      '....#....',
    ]);
    const r = tarjan(g, cols, rows);
    expect(r.composantes).toBe(2);
    expect(r.articulations).toBe(0);
    expect(r.goulets).toBe(0);
  });
});

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

describe('la carte — les murs de crête', () => {
  /*
   * Ce que les barrières ont changé, et ce qu'elles n'ont pas encore réglé.
   *
   * Le relief ne fermait pas les zones, et il a fallu deux instruments neufs
   * pour le voir. Le compte de points d'articulation avait quadruplé, puis
   * quintuplé, en rendant le rocher infranchissable : la cible « au moins
   * douze » semblait dépassée. Elle ne l'était pas — aucun de ces points ne
   * détache un morceau de carte valant le détour — et surtout la grandeur était
   * mal choisie : un point d'articulation exige un passage UNIQUE, alors que le
   * générateur de HMM3 relie ses zones par « un à trois ». La cible se mesure
   * donc en COUPE : le nombre de cases à boucher pour séparer deux capitales.
   *
   * Les murs sont posés, et ils tiennent : 155 cases sur 184 le long de la ligne
   * de partage des eaux, contre une esplanade auparavant. La coupe est tombée à
   * neuf autour d'Arconsat, mais elle reste de seize à dix-neuf entre les autres
   * capitales, pour une cible de six. Ce qui manque est du contenu, pas de
   * l'algorithme : cinq crêtes ne partagent pas le pays en douze zones, et deux
   * de ces cinq passent par une capitale, qui les perce par construction.
   *
   * Les planchers ci-dessous ne disent pas « c'est bien » : ils disent « n'empire
   * pas pendant qu'on travaille ailleurs ».
   */
  it('ne descend pas sous la part d’infranchissable mesurée ce jour', () => {
    expect(r.partInfranchissable, 'cible du plan : 0,12').toBeGreaterThanOrEqual(0.105);
  });

  it('tient le mur de la ligne de partage des eaux', () => {
    const partage = r.murs.find((m) => m.crete === 'partage');
    expect(partage, 'la ligne de partage des eaux n’est plus mesurée').toBeDefined();
    if (!partage) return;
    /* Quatre cinquièmes de l'axe murés. Le reste est fait des cols percés
       exprès, des passages voulus par le tracé — la Grande Chaussée franchit la
       ligne à la Maison du Trésor, la vieille route au col Saint-Thomas — et des
       tourbières de faîte, qu'on ne mure pas. */
    expect(partage.mur * 5, `${String(partage.mur)} sur ${String(partage.axe)}`)
      .toBeGreaterThanOrEqual(partage.axe * 4);
    /* Et pas un mur qui coupe une route en deux : un tracé qui devrait
       traverser passe, il ne s'interrompt pas. */
    expect(partage.trousVoie, 'plus aucune voie ne franchit la crête').toBeGreaterThan(0);
  });

  it('mesure la coupe entre les dix paires de capitales', () => {
    expect(r.coupes.length).toBe(10);
    for (const c of r.coupes) {
      /* Aucune capitale coupée du monde, et aucune coupe qui plafonne : une
         valeur au plafond signifierait que le calcul n'a rien pu mesurer. */
      expect(c.coupe, `${c.de} ↔ ${c.a} : capitale isolée`).toBeGreaterThan(0);
      expect(c.coupe, `${c.de} ↔ ${c.a} : coupe au plafond`).toBeLessThan(64);
    }
    const plusLarge = Math.max(...r.coupes.map((c) => c.coupe));
    /* Plafond de non-régression, très au-dessus de la cible de six : c'est la
       mesure du jour, et elle ne doit pas remonter. */
    expect(plusLarge, 'cible du plan : 6').toBeLessThanOrEqual(19);
  });

  it('mesure les vrais goulets, même quand il n’y en a aucun', () => {
    /* Pas de plancher à poser : il n'y en a pas un seul, et un plancher à zéro
       ne tiendrait rien. Ce que ce test tient, c'est que l'INSTRUMENT existe et
       répond — c'est lui qui a montré que la cible n'était pas atteinte alors
       qu'on la croyait dépassée de onze points. */
    expect(Number.isInteger(r.goulets)).toBe(true);
    expect(r.goulets).toBeLessThanOrEqual(r.articulations);
    expect(r.articulations).toBeGreaterThanOrEqual(20);
  });
});
