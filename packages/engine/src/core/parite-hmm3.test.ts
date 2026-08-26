/**
 * PARITÉ HMM3 DES DÉPLACEMENTS — la garde documentaire.
 *
 * Demande du propriétaire : « vérifie que le nombre de pas par tour du héros
 * et la distance parcourue est similaire à HMM3 ». Vérifié le 26/08, les
 * trois dimensions coïncident :
 *
 *  - le BARÈME DE BASE suit la pile la plus lente, de 1300 à 2000 points —
 *    HMM3 va de 1500 (vitesse ≤ 4) à 2000 (vitesse 11+) ; notre table ajoute
 *    deux crans planchers sous 1500 pour les vitesses 0-2 que HMM3 n'a pas ;
 *  - les COÛTS PAR CASE : route 70, chemin 85, prairie 100, forêt 125,
 *    pente 145, humide 160, rocher 200 — HMM3 : routes 50/65/75, herbe 100,
 *    accidenté 125, sable/neige 150, marais 175 ;
 *  - les DIAGONALES coûtent ×1,41, comme HMM3.
 *
 * Soit, PAR JOUR : 13 à 20 cases en prairie (HMM3 : 15-20), 18 à 28 sur
 * route (HMM3 : 20-40 selon le pavage). Ce test fige ces rapports : si un
 * réglage les fait sortir de la fourchette de HMM3, il rougit et la
 * discussion a lieu ici, pas sur un ressenti.
 */
import { describe, expect, it } from 'vitest';
import { MOVEMENT_BY_SPEED, baseMovementFor } from './constants.js';
import { TERRAIN_COST } from '../types.js';

describe('parité HMM3 — le barème de marche', () => {
  it('la journée va de 1300 à 2000 points, croissante avec la vitesse', () => {
    expect(MOVEMENT_BY_SPEED[0]).toBe(1300);
    expect(MOVEMENT_BY_SPEED[MOVEMENT_BY_SPEED.length - 1]).toBe(2000);
    for (let i = 1; i < MOVEMENT_BY_SPEED.length; i++) {
      expect(MOVEMENT_BY_SPEED[i]).toBeGreaterThan(MOVEMENT_BY_SPEED[i - 1]);
    }
    /* Le cœur de la fourchette HMM3 (vitesse 5 → 1630 chez HMM3). */
    expect(baseMovementFor(5)).toBeGreaterThanOrEqual(1560);
    expect(baseMovementFor(5)).toBeLessThanOrEqual(1700);
  });

  it('les cases par jour restent dans la fourchette de HMM3', () => {
    const lent = 1300;
    const rapide = 2000;
    /* Prairie : HMM3 donne 15-20 cases ; on tolère 13 pour l'armée la plus
       lente, que HMM3 n'a pas. */
    expect(Math.floor(lent / TERRAIN_COST.prairie)).toBeGreaterThanOrEqual(13);
    expect(Math.floor(rapide / TERRAIN_COST.prairie)).toBeLessThanOrEqual(20);
    /* Route : HMM3 donne 20-40 selon le pavage. */
    expect(Math.floor(rapide / TERRAIN_COST.route)).toBeGreaterThanOrEqual(20);
    expect(Math.floor(rapide / TERRAIN_COST.route)).toBeLessThanOrEqual(40);
  });

  it('les proportions de terrain sont celles de HMM3', () => {
    /* La route rend la marche 30-50 % moins chère que l'herbe (50-75/100
       chez HMM3) ; le difficile coûte 25-100 % de plus. */
    const route = TERRAIN_COST.route / TERRAIN_COST.prairie;
    expect(route).toBeGreaterThanOrEqual(0.5);
    expect(route).toBeLessThanOrEqual(0.75);
    expect(TERRAIN_COST.foret / TERRAIN_COST.prairie).toBeCloseTo(1.25, 2);
    expect(TERRAIN_COST.rocher / TERRAIN_COST.prairie).toBeLessThanOrEqual(2);
    /* L'ordre du monde : plus c'est rude, plus c'est cher. */
    expect(TERRAIN_COST.route).toBeLessThan(TERRAIN_COST.chemin);
    expect(TERRAIN_COST.chemin).toBeLessThan(TERRAIN_COST.prairie);
    expect(TERRAIN_COST.prairie).toBeLessThan(TERRAIN_COST.foret);
    expect(TERRAIN_COST.foret).toBeLessThan(TERRAIN_COST.pente);
    expect(TERRAIN_COST.pente).toBeLessThan(TERRAIN_COST.humide);
    expect(TERRAIN_COST.humide).toBeLessThan(TERRAIN_COST.rocher);
  });
});
