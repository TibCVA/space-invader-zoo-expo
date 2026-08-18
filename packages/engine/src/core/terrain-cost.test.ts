/**
 * Un seul barème de marche, et pas deux.
 *
 * Pourquoi ce fichier existe. `pathfinding.ts` portait sa propre copie du
 * barème, écrite à la main :
 *
 *     if (terrainIndex === 7) return (f & 4) !== 0 ? 85 : 0;
 *     const costs = [70, 85, 100, 125, 145, 160, 200, 0];
 *     return costs[terrainIndex] ?? 100;
 *
 * Trois vérités en dur dans trois lignes : l'indice de l'eau, le coût d'un pont,
 * et la table entière. Tant que `TERRAINS` ne bougeait pas, la copie disait
 * juste et personne ne pouvait s'en apercevoir.
 *
 * Ce qui la rendait dangereuse, c'est la suite du projet. La carte doit gagner
 * du relief infranchissable et des cols étroits — c'est la différence mesurée
 * entre notre carte, qui n'a **aucun** point d'articulation sur 105 474 cases
 * praticables, et une carte de HMM3, qui relie ses zones par des passages
 * gardés. Ajouter un terrain à `TERRAINS` aurait décalé l'indice de l'eau : le
 * `=== 7` aurait alors désigné le rocher, l'eau serait tombée sur le `?? 100`
 * silencieux, et le graphe de blocs aurait tracé ses couloirs à travers les
 * rivières. Aucun test existant n'aurait rougi, parce que le coût réellement
 * facturé au héros vient de `stepCost`, pas d'ici : `rawCost` ne sert qu'au
 * couloir de recherche et au test « cette case est-elle ouverte ». Le calcul de
 * chemin se serait mis à mentir sans se plaindre.
 *
 * Le barème est désormais dérivé de `TERRAIN_COST`. Ce test garde la
 * dérivation, et il a été éprouvé en la défaisant : remettre la table écrite à
 * la main le fait rougir dès qu'un terrain est ajouté.
 */
import { describe, expect, it } from 'vitest';
import { TERRAIN_COST, TERRAINS } from '../types.js';
import { COUT_PAR_INDICE } from './pathfinding.js';

describe('barème de marche du calcul de chemin', () => {
  it('couvre exactement les terrains déclarés', () => {
    expect(COUT_PAR_INDICE.length).toBe(TERRAINS.length);
  });

  it('donne à chaque terrain franchissable le coût de TERRAIN_COST', () => {
    TERRAINS.forEach((terrain, indice) => {
      const attendu = TERRAIN_COST[terrain];
      if (!Number.isFinite(attendu) || attendu > 10_000) return;
      expect(COUT_PAR_INDICE[indice], `terrain « ${terrain} »`).toBe(attendu);
    });
  });

  it('marque zéro — donc infranchissable — tout terrain au coût prohibitif', () => {
    const prohibitifs = TERRAINS.filter((t) => {
      const c = TERRAIN_COST[t];
      return !Number.isFinite(c) || c > 10_000;
    });
    /* L'eau est aujourd'hui le seul cas ; le test ne le suppose pas, il le lit.
       Un terrain de falaise ajouté demain sera couvert sans y toucher. */
    expect(prohibitifs.length).toBeGreaterThan(0);
    for (const t of prohibitifs) {
      expect(COUT_PAR_INDICE[TERRAINS.indexOf(t)], `terrain « ${t} »`).toBe(0);
    }
  });

  it('ne laisse aucun terrain sans coût, même ajouté après coup', () => {
    /* Le piège qu'on répare : une table plus courte que `TERRAINS` rendait
       `undefined`, rattrapé par un `?? 100` qui inventait un coût de prairie
       pour un terrain dont personne n'avait décidé le prix. */
    for (let i = 0; i < TERRAINS.length; i++) {
      expect(COUT_PAR_INDICE[i], `indice ${String(i)} (${TERRAINS[i]})`).toBeTypeOf('number');
      expect(Number.isInteger(COUT_PAR_INDICE[i])).toBe(true);
      expect(COUT_PAR_INDICE[i]).toBeGreaterThanOrEqual(0);
    }
  });
});
