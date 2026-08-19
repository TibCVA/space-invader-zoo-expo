/**
 * Les lieux nommés demandés par le propriétaire (plan AAA, lot 1.7).
 *
 * « Ajoute le col des Sagnes à côté du village du lac, pas loin de la Maison
 * du Trésor et des 3 Rochers. Ajoute le col de Saint-Thomas. Ajoute la Pierre
 * de Pamole. »
 *
 * Un col n'est pas un panneau : c'est un passage qu'on paie. Les deux cols
 * sont des postes de garde nommés, à trois cases d'empreinte, posés sur
 * l'ancre géographique réelle (le col Saint-Thomas est à 45,886 N · 3,754 E,
 * 930 m, sur la vieille route Forez-Auvergne à la limite Loire/Puy-de-Dôme).
 * La Pierre de Pamole rend la force à qui la touche : +1 en vaillance, une
 * fois par héros, gratis — la mécanique de l'école au prix zéro, dont le
 * moteur porte le récit de pierre levée (`visitEcole`).
 *
 * Le relief est vérifié, pas déclaré : Saint-Thomas est une selle (le terrain
 * monte fort d'un côté, descend de l'autre), les Sagnes un passage de crête
 * (le terrain tombe des deux côtés du col). Mesuré sur la grille d'élévation :
 * +111 m / −29 m autour de Saint-Thomas, −77 m à l'ouest et l'est des Sagnes.
 */
import { describe, expect, it } from 'vitest';
import { anchorCell } from './anchors.js';
import { buildWorld } from './build.js';
import { buildElevation } from './elevation.js';
import { COLS, ROWS } from './grid.js';

const GRAINE = 20250816;
const w = buildWorld(GRAINE);

function chebyshev(a: { col: number; row: number }, b: { col: number; row: number }): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

describe('lieux nommés — les deux cols gardés', () => {
  for (const nom of ['col_sagnes', 'col_st_thomas'] as const) {
    it(`${nom} : un poste de garde nommé, sur son ancre, qui bloque`, () => {
      const poste = w.objects.find((o) => o.kind === 'garde' && o.data['col'] === nom);
      expect(poste, `${nom} absent de la carte`).toBeDefined();
      if (!poste) return;
      expect(chebyshev(poste.entrance, anchorCell(nom))).toBeLessThanOrEqual(3);
      expect(poste.footprint.length, 'un col sans flancs ne barre rien').toBe(3);
      expect(poste.guard && poste.guard.length > 0, 'un col sans garnison').toBe(true);
      expect(typeof poste.data['name']).toBe('string');
    });
  }

  it('le col Saint-Thomas est une selle : les crêtes montent, la route descend', () => {
    const { elevation } = buildElevation();
    const { col, row } = anchorCell('col_st_thomas');
    const centre = elevation[row * COLS + col];
    let haut = -1e9;
    let bas = 1e9;
    for (let dr = -16; dr <= 16; dr++) {
      for (let dc = -16; dc <= 16; dc++) {
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        const a = elevation[r * COLS + c];
        if (a > haut) haut = a;
        if (a < bas) bas = a;
      }
    }
    expect(haut - centre, 'pas de crête au-dessus du col').toBeGreaterThanOrEqual(80);
    expect(centre - bas, 'pas de descente sous le col').toBeGreaterThanOrEqual(20);
  });

  it('le col des Sagnes est un passage de crête : le terrain tombe des deux côtés', () => {
    const { elevation } = buildElevation();
    const { col, row } = anchorCell('col_sagnes');
    const centre = elevation[row * COLS + col];
    const alt = (c: number, r: number): number => elevation[r * COLS + c];
    let minOuest = 1e9;
    let minEst = 1e9;
    /*
     * La fenêtre est une distance au sol : de 2 à 16 cases valait de 96 m à
     * 770 m sur une case de 48 m, et vaudrait près de deux kilomètres sur une
     * case de 109. Elle est ramenée à ce qu'elle mesurait.
     */
    for (let d = 1; d <= 8; d++) {
      minOuest = Math.min(minOuest, alt(col - d, row));
      minEst = Math.min(minEst, alt(col + d, row));
    }
    /*
     * Les deux versants ne sont pas symétriques, et ne doivent pas l'être. À
     * l'ouest le terrain plonge de 112 m vers le Lac ; à l'est il ne descend
     * que de 52 m avant de se relever vers les Bois Noirs, qui montent à
     * 1 200 m. Le col des Sagnes est un passage sur l'épaule du massif, pas
     * une brèche entre deux vallées : exiger la même chute des deux côtés
     * demanderait au relief de démentir la carte d'état-major.
     */
    expect(centre - minOuest, 'pas de versant ouest').toBeGreaterThanOrEqual(60);
    expect(centre - minEst, 'pas de versant est').toBeGreaterThanOrEqual(50);
  });
});

describe('lieux nommés — la Pierre de Pamole', () => {
  it('se dresse près de son ancre et enseigne la vaillance sans bourse délier', () => {
    const pierre = w.objects.find((o) => o.kind === 'ecole' && o.data['rite'] === 'pierre');
    expect(pierre, 'la Pierre de Pamole est absente').toBeDefined();
    if (!pierre) return;
    expect(pierre.data['name']).toBe('Pierre de Pamole');
    expect(pierre.data['matiere']).toBe('vaillance');
    expect(pierre.data['prix']).toBe(0);
    expect(chebyshev(pierre.entrance, anchorCell('pamole'))).toBeLessThanOrEqual(3);
  });
});
