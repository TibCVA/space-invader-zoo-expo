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

  /*
   * Le libellé a changé de sens, et il fallait le dire : depuis que le moteur
   * applique la règle de HMM3 — une place gardée ne se traverse pas —, TOUT
   * garde bloque le transit, entrée comprise. Les deux cases de flanc ne font
   * plus la différence entre « bloque » et « ne bloque pas » ; elles élargissent
   * la porte, ce qui reste utile : un poste d'une seule case se contourne en un
   * pas, un poste de trois demande un détour.
   */
  it('pose des postes assez larges pour qu’on les remarque', () => {
    expect(r.gardesBloquants).toBeGreaterThanOrEqual(20);
  });

  it('n’enferme aucune capitale derrière ses gardes', () => {
    /*
     * Le revers de la médaille des barrières, et il fallait le mesurer avant de
     * l'affirmer. Depuis que les crêtes sont murées, une zone de départ n'a plus
     * que deux ou trois cols : si chacun portait une compagnie de l'anneau
     * trois, la maison serait en cage jusqu'à pouvoir forcer, et une partie où
     * l'un est en cage ne se joue pas.
     *
     * Mesuré : **99 % de la terre praticable reste atteignable depuis chacune
     * des cinq capitales sans livrer un seul combat**. Aucun départ n'est
     * enfermé — l'hypothèse était fausse, et c'est le genre de chose qu'il vaut
     * mieux savoir avant de corriger ce qui n'est pas cassé.
     *
     * **Et ce test ne détecte qu'une catastrophe, il faut le dire.** Éprouvé en
     * muraillant non plus les seuls gardes mais TOUS les objets de la carte, les
     * cinq cent soixante cases d'emprise comprises : la terre libre ne tombe
     * qu'à 97 %. Sur une carte à composante unique et à cinq cols par frontière,
     * aucun semis d'objets ne peut enfermer qui que ce soit. Le garde-fou est
     * donc là pour une refonte du relief ou un triplement de la densité de
     * gardes, pas pour un réglage fin — et le seuil est posé à dix-neuf
     * vingtièmes, ce qui laisse encore deux points de marge sous la mesure du
     * jour sans rien laisser passer de grave.
     */
    expect(r.terreLibre.length).toBe(5);
    for (const t of r.terreLibre) {
      expect(t.libre * 20, `${t.depart} : ${String(t.libre)} cases libres`)
        .toBeGreaterThanOrEqual(r.praticables * 19);
    }
  });
});

describe('la carte — le front', () => {
  /*
   * Ce que les barrières ont changé, et comment on a su qu'elles marchaient.
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
   * Les trois étapes, en chiffres, sur la graine de démonstration :
   *
   *   sans barrières            infranchissable  8,58 %  coupe 25
   *   cinq crêtes murées                        10,98 %  coupe 19
   *   plus cinq chaînes de partage              15,49 %  coupe  5
   *
   * Les deux cibles du plan — douze pour cent d'infranchissable, une coupe de
   * six — sont donc tenues, et les tests ci-dessous les EXIGENT au lieu de figer
   * un plancher de non-régression. Le reste n'a pas bougé : composante unique,
   * une case sur trente-six porte un objet, zéro canton vide, glaneur à 3,8
   * prises par journée de marche.
   */
  it('porte la part d’infranchissable d’un relief HMM3', () => {
    expect(r.partInfranchissable, 'cible du plan : 0,12').toBeGreaterThanOrEqual(0.12);
    /* Et pas au point d'étouffer la carte : au-delà d'un quart, on rend de la
       terre jouable contre une frontière, ce qui n'est plus un échange. */
    expect(r.partInfranchissable).toBeLessThanOrEqual(0.25);
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

  it('mure aussi les cinq chaînes de partage', () => {
    for (const key of [
      'barre_nord',
      'barre_futaies_nord',
      'barre_futaies_sud',
      'barre_cervieres_sud',
      'barre_marche',
    ]) {
      const m = r.murs.find((x) => x.crete === key);
      expect(m, `chaîne absente : ${key}`).toBeDefined();
      if (!m) continue;
      /* Les chaînes sont tracées par marche de crête entre deux bouts, donc
         elles ne rencontrent ni capitale ni site fixe par hasard : on peut leur
         demander plus qu'aux crêtes du relief. */
      expect(m.mur * 4, `${key} : ${String(m.mur)} sur ${String(m.axe)}`)
        .toBeGreaterThanOrEqual(m.axe * 3);
    }
  });

  it('ferme les zones comme HMM3 : une coupe de un à trois passages', () => {
    expect(r.coupes.length).toBe(10);
    for (const c of r.coupes) {
      /* Jamais coupée du monde, et jamais tenue par une seule case : le
         générateur de HMM3 pose « un à trois » liaisons, et deux au moins
         laissent au joueur le choix de son itinéraire. */
      expect(c.coupe, `${c.de} ↔ ${c.a} : capitale isolée`).toBeGreaterThanOrEqual(2);
      expect(c.coupe, `${c.de} ↔ ${c.a} : coupe trop large`).toBeLessThanOrEqual(6);
    }
  });

  it('mesure les vrais goulets, même quand il n’y en a aucun', () => {
    /*
     * Toujours zéro, et c'est désormais NORMAL : les frontières sont percées de
     * deux à cinq passages, donc aucune ne tient à une case unique. C'est la
     * démonstration en creux que la cible en points d'articulation était mal
     * posée — l'atteindre aurait voulu dire construire des couloirs uniques.
     * Ce que ce test tient, c'est que l'instrument existe et répond.
     */
    expect(Number.isInteger(r.goulets)).toBe(true);
    expect(r.goulets).toBeLessThanOrEqual(r.articulations);
    expect(r.articulations).toBeGreaterThanOrEqual(20);
  });
});
