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

describe('la carte — ce qui reste à faire, et ne doit pas empirer', () => {
  /*
   * Le relief ne ferme toujours pas les ZONES, et il a fallu changer
   * d'instrument pour le voir.
   *
   * Le compte brut de points d'articulation avait doublé puis quintuplé quand
   * on a rendu le rocher infranchissable : quatre, puis vingt-trois, puis cent
   * treize en abaissant le seuil de pente à 10. La cible « au moins douze »
   * semblait donc largement dépassée. Elle ne l'était pas du tout : sur les
   * vingt-trois, **aucune** ne détache un morceau de carte de plus de vingt-cinq
   * cases. Ce sont vingt-trois culs-de-sac — la pointe d'une presqu'île, le fond
   * d'une combe — et un cul-de-sac ne se force pas, on n'y va pas.
   *
   * La mesure des vrais goulets, ajoutée pour trancher, dit la vraie forme du
   * problème : 0 au seuil 13, 7 au seuil 11, 8 au seuil 10, 7 au seuil 9. Elle
   * plafonne. Du rocher épars ne fabrique pas de frontière, quelle qu'en soit la
   * quantité — il fabrique des recoins. Une barrière de zone est une CRÊTE
   * CONTINUE percée de cols, et la roche affleure sur les FLANCS d'une crête,
   * pas sur son fil, qui est justement le seul endroit plat : le relief nous
   * donnait donc deux bandes brisées de part et d'autre d'un sommet resté
   * marchable. Il faudra poser les barrières exprès, pas les espérer d'un seuil.
   *
   * Les planchers ci-dessous ne disent pas « c'est bien » : ils disent
   * « n'empire pas pendant qu'on travaille ailleurs ».
   */
  it('ne descend pas sous la part d’infranchissable mesurée ce jour', () => {
    expect(r.partInfranchissable, 'cible du plan : 0,12').toBeGreaterThanOrEqual(0.079);
  });

  it('ne descend pas sous le nombre de points d’articulation mesuré ce jour', () => {
    expect(r.articulations).toBeGreaterThanOrEqual(20);
  });

  it('mesure les vrais goulets, même quand il n’y en a aucun', () => {
    /* Pas de plancher à poser : il n'y en a pas un seul, et un plancher à zéro
       ne tiendrait rien. Ce que ce test tient, c'est que l'INSTRUMENT existe et
       répond — c'est lui qui a montré que la cible n'était pas atteinte alors
       qu'on la croyait dépassée de onze points. */
    expect(r.goulets, 'cible du plan : 12 vrais goulets').toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(r.goulets)).toBe(true);
    expect(r.goulets).toBeLessThanOrEqual(r.articulations);
  });
});
