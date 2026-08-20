/**
 * Un champ de bataille encombré, et jamais fermé.
 *
 * Mesuré à l'audit : 3,1 obstacles en moyenne sur la prairie et la lande, les
 * deux terrains les plus fréquents de la carte. Trois obstacles sur cent
 * soixante-cinq hexagones, ce n'est pas un terrain, c'est une table rase — on y
 * marche en ligne droite, la couverture ne veut rien dire, le tireur ne choisit
 * jamais son angle, et la moitié de la tactique de HMM3 disparaît avec.
 *
 * Le test tient les deux bouts, parce que l'un sans l'autre serait pire que
 * rien : assez d'obstacles pour que le terrain compte, et jamais assez pour
 * qu'une ligne se ferme ou qu'un déploiement soit muré. Encombrer un champ au
 * point d'y bloquer une armée serait un défaut plus grave que de le laisser nu.
 */
import { describe, expect, it } from 'vitest';
import { HEX_COLS, HEX_ROWS } from '../types.js';
import { army, makeBattle } from './testkit.js';
import type { CombatState, Terrain } from '../types.js';

/** Moyenne d'obstacles sur un échantillon de graines, pour un terrain donné. */
function moyenne(terrain: Terrain, graines: number): { moyenne: number; champs: CombatState[] } {
  const champs: CombatState[] = [];
  let total = 0;
  for (let g = 0; g < graines; g += 1) {
    const { combat } = makeBattle({
      seed: 1000 + g * 37,
      terrain,
      attackerArmy: army(['granit_t1', 8]),
      defenderArmy: army(['ermitage_t1', 8]),
    });
    champs.push(combat);
    total += combat.obstacles.length;
  }
  return { moyenne: total / graines, champs };
}

describe('les obstacles du champ de bataille', () => {
  it('encombre les terrains ouverts au lieu de les laisser nus', () => {
    for (const terrain of ['prairie', 'lande'] as const) {
      const { moyenne: m } = moyenne(terrain, 24);
      expect(m, `${terrain} : ${m.toFixed(1)} obstacles en moyenne`).toBeGreaterThanOrEqual(4);
    }
  });

  it('encombre franchement le couvert et la pierraille', () => {
    for (const terrain of ['foret', 'rocher'] as const) {
      const { moyenne: m } = moyenne(terrain, 24);
      expect(m, `${terrain} : ${m.toFixed(1)}`).toBeGreaterThanOrEqual(7);
    }
  });

  it('garde la hiérarchie : un pré reste plus dégagé qu’un chaos rocheux', () => {
    expect(moyenne('prairie', 24).moyenne).toBeLessThan(moyenne('rocher', 24).moyenne);
  });

  it('ne ferme jamais une ligne : deux obstacles au plus par rangée', () => {
    for (const terrain of ['prairie', 'foret', 'rocher', 'falaise'] as const) {
      for (const combat of moyenne(terrain, 12).champs) {
        const parLigne = new Map<number, number>();
        for (const o of combat.obstacles) {
          parLigne.set(o.at.row, (parLigne.get(o.at.row) ?? 0) + 1);
        }
        for (const [row, n] of parLigne) {
          expect(n, `${terrain} : ligne ${String(row)} porte ${String(n)} obstacles`).toBeLessThanOrEqual(2);
        }
      }
    }
  });

  it('laisse les deux zones de déploiement libres', () => {
    for (const terrain of ['foret', 'rocher'] as const) {
      for (const combat of moyenne(terrain, 12).champs) {
        for (const o of combat.obstacles) {
          // Le semis ne touche jamais aux trois colonnes de chaque bord.
          expect(o.at.col, terrain).toBeGreaterThanOrEqual(3);
          expect(o.at.col, terrain).toBeLessThanOrEqual(HEX_COLS - 4);
          expect(o.at.row, terrain).toBeLessThan(HEX_ROWS);
        }
      }
    }
  });

  it('ne pose jamais deux obstacles sur le même hexagone', () => {
    for (const combat of moyenne('rocher', 16).champs) {
      const vus = new Set(combat.obstacles.map((o) => `${String(o.at.col)},${String(o.at.row)}`));
      expect(vus.size).toBe(combat.obstacles.length);
    }
  });
});
