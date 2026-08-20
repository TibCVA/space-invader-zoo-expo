/**
 * Une pile abattue laisse une dépouille, et la dépouille passe sous les vivants.
 *
 * La dissolution menait chaque articulation à l'alpha zéro : au bout d'une
 * seconde et trois quarts, l'hexagone était nu. Un champ de bataille sans
 * dépouilles n'a pas de mémoire — on ne lit plus où l'on a payé cher ni où l'on
 * a percé, alors que c'est précisément ce que HMM3 donne à lire en laissant la
 * créature abattue couchée sur sa case jusqu'à la fin de la bataille.
 *
 * Le second point est une question d'ordre, et il n'est pas décoratif : le tri
 * en profondeur range les piles par `ligne × 1000`, toutes positives. Une
 * dépouille qui garderait ce rang se dessinerait par-dessus une troupe debout
 * venue occuper le terrain plus bas — un mort masquant un vivant, à l'endroit
 * même où le joueur doit décider de son prochain coup.
 */
import { describe, expect, it } from 'vitest';
import { DEPOUILLE_ALPHA } from '../art/rig.js';
import { PROFONDEUR_DEPOUILLE } from './units.js';

/** Le rang de profondeur d'une pile vivante, tel que `units.ts` le calcule. */
function rangVivant(row: number, col: number, side: 0 | 1): number {
  return row * 1000 + col * 4 + (side === 0 ? 0 : 1);
}

/** Le rang d'une dépouille, tel que `units.ts` le calcule. */
function rangDepouille(row: number): number {
  return PROFONDEUR_DEPOUILLE + row;
}

describe('la dépouille', () => {
  it('reste visible : la dissolution ne va pas jusqu’au néant', () => {
    expect(DEPOUILLE_ALPHA).toBeGreaterThan(0);
    // Et reste assez effacée pour qu'on ne la prenne pas pour une troupe debout.
    expect(DEPOUILLE_ALPHA).toBeLessThan(0.5);
  });

  it('passe sous toute pile vivante, quelle que soit la ligne', () => {
    const LIGNES = 11;
    for (let mort = 0; mort < LIGNES; mort += 1) {
      for (let vivant = 0; vivant < LIGNES; vivant += 1) {
        for (const side of [0, 1] as const) {
          expect(
            rangDepouille(mort),
            `dépouille ligne ${String(mort)} contre vivant ligne ${String(vivant)}`,
          ).toBeLessThan(rangVivant(vivant, 0, side));
        }
      }
    }
  });

  it('garde les dépouilles triées entre elles', () => {
    // Deux corps couchés se recouvrent dans l'ordre des lignes, comme les vivants.
    expect(rangDepouille(2)).toBeLessThan(rangDepouille(9));
  });

  it('n’occulte jamais le halo de la pile active', () => {
    /* Le halo doré se dessine sous la pile qui joue, au rang −10. Une dépouille
       au-dessus de lui le masquerait, et le joueur perdrait le seul repère qui
       dit « c'est à cette pile-ci d'agir ». Elle passe donc dessous aussi. */
    const HALO = -10;
    for (let row = 0; row < 11; row += 1) {
      expect(rangDepouille(row), `ligne ${String(row)}`).toBeLessThan(HALO);
    }
  });
});
