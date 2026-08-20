/**
 * La coupe minimale, éprouvée sur des grilles dessinées à la main.
 *
 * C'est l'instrument qui décide si la carte a un front, et il a déjà démenti
 * deux conclusions qu'on tenait pour acquises. Un calcul qui contredit doit
 * d'abord se laisser vérifier — et l'épreuve a servi trois fois d'un coup :
 *
 *  - le dimensionnement du tableau d'arêtes était trop court d'une arête par
 *    case (la boucle de comptage sautait le voisin en bas à droite) ; en
 *    JavaScript, l'écriture hors bornes d'un tableau typé ne lève rien, elle
 *    disparaît, et le calcul tournait dix minutes sur un graphe troué ;
 *  - le parcours faisait avancer l'itérateur d'un sommet dès qu'il empruntait
 *    une arête, ce qui perdait les liaisons de capacité infinie et
 *    sous-estimait la coupe ;
 *  - et deux de mes comptages à la main étaient faux, ce que seule la
 *    confrontation a montré.
 */
import { describe, expect, it } from 'vitest';

import { coupeMinimale } from './coupe.js';

/** Grille de dessin : `#` infranchissable, tout le reste praticable. */
function grille(lignes: string[]): { g: Uint8Array; cols: number; rows: number } {
  const rows = lignes.length;
  const cols = lignes[0]?.length ?? 0;
  const g = new Uint8Array(cols * rows);
  lignes.forEach((l, r) => {
    for (let c = 0; c < cols; c++) g[r * cols + c] = l[c] === '#' ? 0 : 1;
  });
  return { g, cols, rows };
}

describe('coupe minimale entre deux cases', () => {
  it('vaut un quand un seul passage relie les deux moitiés', () => {
    const { g, cols, rows } = grille([
      '.............#.............',
      '.............#.............',
      '.............#.............',
      '...........................',
      '.............#.............',
      '.............#.............',
      '.............#.............',
    ]);
    expect(coupeMinimale(g, cols, rows, { col: 2, row: 3 }, { col: 24, row: 3 })).toBe(1);
  });

  it('vaut trois quand trois passages percent le mur', () => {
    const { g, cols, rows } = grille([
      '.............#.............',
      '...........................',
      '.............#.............',
      '.............#.............',
      '...........................',
      '.............#.............',
      '.............#.............',
      '...........................',
      '.............#.............',
    ]);
    expect(coupeMinimale(g, cols, rows, { col: 3, row: 4 }, { col: 23, row: 4 })).toBe(3);
  });

  it('vaut la largeur du couloir quand le couloir est large', () => {
    /* Un couloir de trois cases de haut : il faut boucher les trois. */
    const { g, cols, rows } = grille([
      '###################',
      '###################',
      '###################',
      '...................',
      '...................',
      '...................',
      '###################',
      '###################',
      '###################',
    ]);
    expect(coupeMinimale(g, cols, rows, { col: 2, row: 4 }, { col: 16, row: 4 })).toBe(3);
  });

  it('vaut zéro quand les deux cases ne communiquent pas', () => {
    const { g, cols, rows } = grille([
      '.........#.........',
      '.........#.........',
      '.........#.........',
      '.........#.........',
      '.........#.........',
      '.........#.........',
      '.........#.........',
    ]);
    expect(coupeMinimale(g, cols, rows, { col: 3, row: 3 }, { col: 15, row: 3 })).toBe(0);
  });

  it('ne coupe pas les capitales elles-mêmes, ni leur voisinage', () => {
    /* Les deux zones incoupables se touchent : aucune case coupable entre
       elles, donc la coupe est « large » et le plafond répond. */
    const { g, cols, rows } = grille([
      '..........',
      '..........',
      '..........',
    ]);
    expect(coupeMinimale(g, cols, rows, { col: 2, row: 1 }, { col: 6, row: 1 }, 8)).toBe(8);
  });

  it('s’arrête au plafond quand la coupe est large', () => {
    const { g, cols, rows } = grille([
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
      '..............................',
    ]);
    expect(coupeMinimale(g, cols, rows, { col: 4, row: 4 }, { col: 25, row: 5 }, 3)).toBe(3);
  });

  it('compte les cases, pas les liaisons : une diagonale se coupe d’une case', () => {
    /*
     * Deux salles réunies par un seul contact diagonal, entre (9,4) et (10,5).
     * Une mesure qui compterait les LIAISONS rendrait plus d'un, puisque ce
     * contact met en jeu plusieurs couples de voisins ; en cases, il n'en faut
     * qu'une pour couper.
     */
    const { g, cols, rows } = grille([
      '##########••••••••••',
      '##########••••••••••',
      '##########••••••••••',
      '##########••••••••••',
      '##########••••••••••',
      '••••••••••##########',
      '••••••••••##########',
      '••••••••••##########',
      '••••••••••##########',
      '••••••••••##########',
    ]);
    /* Le contact diagonal est entre (10,4) et (9,5). */
    expect(coupeMinimale(g, cols, rows, { col: 16, row: 2 }, { col: 3, row: 7 })).toBe(1);
  });
});
