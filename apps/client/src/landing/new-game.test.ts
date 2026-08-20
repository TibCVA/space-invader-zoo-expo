/**
 * L'aperçu de carte de l'écran « Nouvelle partie » — ce qui le rendait noir.
 *
 * ## Le défaut
 *
 * Le premier écran que voient les joueurs montrait un rectangle noir à la
 * place du Forez. Le peintre était hors de cause : mesuré, `renderForezMinimap`
 * rend une clarté moyenne de 128,6/255 sur les 20 792 cases, soit 29 % plus
 * clair que la strate de biome du jeu. Ce qu'on voyait était le dégradé sombre
 * du cadre CSS, `linear-gradient(168deg, #4a4e52, #2a2c2f)`, à travers un
 * canevas VIDE.
 *
 * Il était vide parce que React l'effaçait après coup. `CarteDepart` gardait
 * les dimensions du bitmap dans un état React initialisé à 256 × 416 — la
 * taille de la carte d'AVANT sa réduction à 113 × 184 — puis les corrigeait
 * dans un `setTimeout`. React 19 groupe les mises à jour d'un callback et ne
 * re-rend qu'à son retour, donc APRÈS le `drawImage` : au re-rendu, l'attribut
 * `width` passait de 256 à 113, React appelait `setAttribute('width', '113')`,
 * et poser cet attribut à une valeur différente réinitialise le bitmap.
 *
 * ## Ce que ce fichier garde — et ce qu'il ne garde pas
 *
 * L'environnement de test est `node` (`vitest.config.ts`) : il n'y a ni DOM ni
 * canevas, aucune dépendance de rendu React n'est installée, et **aucun test
 * d'ici ne peut donc observer un pixel**. Ce fichier ne prouve pas que
 * l'aperçu est peint. Il garde les trois conditions vérifiables qui, réunies,
 * rendent le défaut impossible à reproduire :
 *
 *  1. la géométrie que la vignette suppose est bien celle du moteur, mesurée
 *     sur `buildTerrain()`, la source même que le peintre lit ;
 *  2. React ne possède aucun attribut qui commande le bitmap du canevas, et le
 *     composant ne garde plus de dimension dans un état ;
 *  3. aucune coordonnée de la vignette n'est un littéral périmé — ni les
 *     dimensions dans le TSX, ni le rapport du cadre dans la CSS, ni la case
 *     du coffre.
 *
 * Les points 2 et 3 lisent le source : ce sont des gardes de FORME, et la
 * forme est précisément ce qui était en cause. Un aperçu repeint en noir par
 * une autre voie — une couleur de fond, un `z-index`, un canevas détruit —
 * passerait ces tests sans être vu. Seule une capture d'écran le dirait.
 */

import { describe, expect, it } from 'vitest';
import { MAP_COLS, MAP_ROWS } from '@auvergne/engine';
import { anchorCell, buildTerrain } from '@auvergne/map';

/*
 * Le source est lu par Vite, non par `node:fs` : la configuration TypeScript
 * du client n'expose délibérément pas les types de Node, pour qu'un module du
 * navigateur ne puisse pas importer `node:fs` par accident. C'est le chemin
 * déjà employé par `art/matiere-sol.test.ts`.
 *
 * `landing.css` n'est PAS lu ici, et ce n'est pas un oubli : Vitest coupe le
 * traitement des feuilles de style et un `?raw` sur un `.css` rend la chaîne
 * vide. C'est ce qui a décidé de la forme de la correction — plutôt que de
 * surveiller un littéral dans la CSS, on l'en a retiré : le rapport du cadre
 * est posé en style en ligne depuis `MAP_COLS / MAP_ROWS`, ce qui se mesure.
 */
const SOURCES = import.meta.glob('./new-game.tsx', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const TSX = Object.values(SOURCES)[0];

/**
 * Le TSX sans ses commentaires.
 *
 * Indispensable : les commentaires de `new-game.tsx` CITENT les littéraux
 * périmés pour expliquer ce qu'ils cassaient. Les chercher sans ce ménage
 * ferait rougir le test sur sa propre documentation.
 */
const CODE = TSX.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ─────────── 1. La géométrie est celle du moteur, pas une opinion ────────── */

describe('géométrie de la vignette', () => {
  /*
   * Le littéral est écrit à la main, à dessein : un test qui lirait
   * `MAP_COLS` des deux côtés descendrait avec la constante et ne garderait
   * plus rien. Si la carte est un jour retaillée, ce test rougit — et c'est
   * l'ordre de mission : la CSS et la vignette doivent suivre.
   */
  it('la carte du moteur fait 113 × 184 cases', () => {
    expect(MAP_COLS).toBe(113);
    expect(MAP_ROWS).toBe(184);
  });

  it('le peintre rend exactement la carte du moteur', () => {
    /* `buildTerrain()` est la source que lit `renderForezMinimap` : si elle
       rendait une autre taille que celle supposée par le cadre et par les
       marqueurs, la peinture serait décalée ou déformée. */
    const relief = buildTerrain();
    expect(relief.cols).toBe(MAP_COLS);
    expect(relief.rows).toBe(MAP_ROWS);
  });

  it('le cadre prend son rapport dans le moteur, et non dans la CSS', () => {
    /* La CSS annonçait « aspect-ratio: 256 / 416 » : un cadre plus large que
       la peinture, dont le dégradé sombre débordait de chaque côté. */
    expect(CODE).toMatch(/aspectRatio:\s*`\$\{MAP_COLS\} \/ \$\{MAP_ROWS\}`/);
  });

  it('le coffre de la Maison du Trésor tombe sur une case qui existe', () => {
    /* Il était planté en (145, 113) : hors carte de trente-deux colonnes. */
    const at = anchorCell('maison_tresor');
    expect(at.col).toBeGreaterThanOrEqual(0);
    expect(at.col).toBeLessThan(MAP_COLS);
    expect(at.row).toBeGreaterThanOrEqual(0);
    expect(at.row).toBeLessThan(MAP_ROWS);
  });
});

/* ────────── 2. React ne possède pas le bitmap du canevas ─────────────────── */

describe('le canevas de la vignette', () => {
  const balises = CODE.match(/<canvas\b[\s\S]*?\/>/g) ?? [];

  it("n'a qu'un canevas, et React ne lui pose ni width ni height", () => {
    expect(balises).toHaveLength(1);
    /*
     * Le cœur du défaut. Poser l'attribut `width` d'un `<canvas>` à une valeur
     * différente réinitialise son bitmap : tout attribut de dimension confié à
     * React lui donne le droit d'effacer la peinture à n'importe quel
     * re-rendu. Les dimensions se posent une seule fois, dans l'effet, juste
     * avant `drawImage`.
     */
    expect(balises[0]).not.toMatch(/\bwidth=/);
    expect(balises[0]).not.toMatch(/\bheight=/);
  });

  it('pose les dimensions dans l’effet, avant de peindre', () => {
    const effet = CODE.indexOf('renderForezMinimap()');
    const largeur = CODE.indexOf('cible.width =');
    const peinture = CODE.indexOf('drawImage');
    expect(effet).toBeGreaterThan(-1);
    expect(largeur).toBeGreaterThan(effet);
    expect(peinture).toBeGreaterThan(largeur);
  });

  it('ne garde plus aucune dimension dans un état React', () => {
    /* `useState({ cols, rows })` était la cause : c'est la mise à jour de cet
       état qui déclenchait le re-rendu effaceur. */
    expect(CODE).not.toMatch(/setDims|\bdims\b/);
    expect(CODE).not.toMatch(/useState\(\s*\{\s*cols/);
  });
});

/* ────────── 3. Aucune coordonnée de la vignette n'est un littéral ────────── */

describe('les coordonnées de la vignette', () => {
  it('se lisent dans le moteur et dans la carte', () => {
    expect(CODE).toMatch(/\/ MAP_COLS\) \* 100/);
    expect(CODE).toMatch(/\/ MAP_ROWS\) \* 100/);
    expect(CODE).toMatch(/anchorCell\('maison_tresor'\)/);
  });

  it("n'emploie plus les littéraux de l'ancienne carte", () => {
    /* 256 × 416 était la taille d'avant, 145 la colonne du coffre : trois
       nombres qui ne désignent plus rien sur une carte de 113 × 184. */
    for (const perime of ['256', '416', '145']) {
      expect(CODE, `le littéral ${perime} ne doit plus figurer dans le code`).not.toMatch(
        new RegExp(`\\b${perime}\\b`),
      );
    }
  });
});
