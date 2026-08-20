/**
 * LA FILE D'INITIATIVE DOIT DIRE QUI A DÉJÀ JOUÉ.
 *
 * Défaut mesuré : `initiative.ts` reprenait `combat.order` en entier et
 * peignait quatorze vignettes rigoureusement identiques au round 3 de la
 * capture bureau. `combat.activeIndex` — le curseur du moteur dans cette
 * même liste (`packages/engine/src/combat/order.ts`) — n'était lu NULLE PART
 * côté client : `grep activeIndex apps/client/` ne rendait aucune occurrence.
 * Le joueur ne pouvait pas savoir ce qui restait à jouer dans le round, une
 * information que HMM3 donne d'un coup d'œil.
 *
 * Le test fait AVANCER un vrai combat par `applyCombatAction` : il ne
 * fabrique pas d'`activeIndex` à la main et ne recopie aucun ordre.
 */
import { describe, expect, it } from 'vitest';
import { activeUnit, applyCombatAction } from '@auvergne/engine';
import type { CombatState, GameState } from '@auvergne/engine';
import { army, makeBattle } from '@auvergne/engine/combat/testkit';
import { rangsDeLaFile } from './initiative.js';

/** Une bataille rangée : assez de piles pour que la file soit lisible. */
function bataille(): { state: GameState; combat: CombatState } {
  return makeBattle({
    attackerArmy: army(['granit_t1', 40], ['granit_t2', 20], ['granit_t3', 12]),
    defenderArmy: army(['ermitage_t1', 44], ['ermitage_t2', 22], ['ermitage_t3', 10]),
    seed: 20260820,
  });
}

/** Fait défendre la pile active : l'action la plus neutre qui clôt un tour. */
function passerLaMain(state: GameState, combat: CombatState): string {
  const u = activeUnit(combat);
  if (!u) throw new Error('aucune pile active');
  const res = applyCombatAction(state, { kind: 'defend', unit: u.uid });
  expect(res.ok, res.error).toBe(true);
  return u.uid;
}

describe('file d’initiative : qui a déjà joué', () => {
  it('au premier tour du round, personne n’a encore joué', () => {
    const { combat } = bataille();
    const actif = activeUnit(combat);
    const rangs = rangsDeLaFile(combat, actif?.uid ?? null);
    expect(rangs.length).toBeGreaterThan(1);
    expect(rangs.filter((r) => r.dejaJoue)).toHaveLength(0);
    expect(rangs.filter((r) => r.actif)).toHaveLength(1);
    expect(rangs[0].actif).toBe(true);
  });

  it('chaque pile qui agit passe derrière le curseur, et y reste', () => {
    const { state, combat } = bataille();
    const joues: string[] = [];
    for (let tour = 0; tour < 4; tour += 1) {
      joues.push(passerLaMain(state, combat));
      const actif = activeUnit(combat);
      const rangs = rangsDeLaFile(combat, actif?.uid ?? null);
      const marques = rangs.filter((r) => r.dejaJoue).map((r) => r.uid);
      expect(marques, `après ${String(tour + 1)} activation(s)`).toEqual(joues);
      /* la pile qui joue maintenant n'est jamais donnée pour jouée */
      expect(rangs.find((r) => r.actif)?.dejaJoue).toBe(false);
    }
  });

  it('un nouveau round efface les marques : tout le monde rejoue', () => {
    const { state, combat } = bataille();
    const round = combat.round;
    /* on épuise le round entier, sans jamais tuer personne */
    for (let garde = 0; garde < 40 && combat.round === round; garde += 1) {
      passerLaMain(state, combat);
    }
    expect(combat.round, 'le round doit avoir tourné').toBeGreaterThan(round);
    const actif = activeUnit(combat);
    const rangs = rangsDeLaFile(combat, actif?.uid ?? null);
    expect(rangs.filter((r) => r.dejaJoue)).toHaveLength(0);
  });

  it('n’oublie aucune pile vivante et n’en invente aucune', () => {
    const { state, combat } = bataille();
    passerLaMain(state, combat);
    passerLaMain(state, combat);
    const rangs = rangsDeLaFile(combat, activeUnit(combat)?.uid ?? null);
    const vivantes = combat.units.filter((u) => u.alive && u.count > 0).map((u) => u.uid);
    expect([...rangs.map((r) => r.uid)].sort()).toEqual([...vivantes].sort());
  });

  it('le curseur indexe l’ordre COMPLET : les morts devant ne le décalent pas', () => {
    const { state, combat } = bataille();
    passerLaMain(state, combat);
    passerLaMain(state, combat);
    passerLaMain(state, combat);
    const ordre = [...combat.order];
    expect(ordre.length, 'il faut du monde derrière le curseur').toBeGreaterThanOrEqual(5);
    const encoreAJouer = activeUnit(combat);
    expect(encoreAJouer?.uid).toBe(ordre[3]);

    /*
     * On efface DEUX piles déjà jouées, en tête de file. Elles sortent de
     * l'affichage mais restent dans `order` : le curseur ne bouge pas. Deux
     * et non une — avec une seule, un curseur relu sur la liste filtrée
     * rendrait par accident le même résultat, et le test ne mesurerait rien.
     */
    for (const uid of [ordre[0], ordre[1]]) {
      const morte = combat.units.find((u) => u.uid === uid);
      if (!morte) throw new Error('pile introuvable');
      morte.count = 0;
      morte.alive = false;
    }

    const rangs = rangsDeLaFile(combat, encoreAJouer?.uid ?? null);
    expect(rangs.map((r) => r.uid)).not.toContain(ordre[0]);
    expect(rangs.map((r) => r.uid)).not.toContain(ordre[1]);
    /* il reste exactement une pile jouée — la troisième — et personne
       derrière le curseur ne doit être marqué */
    expect(rangs.filter((r) => r.dejaJoue).map((r) => r.uid)).toEqual([ordre[2]]);
    expect(rangs.find((r) => r.uid === ordre[4])?.dejaJoue).toBe(false);
  });
});
