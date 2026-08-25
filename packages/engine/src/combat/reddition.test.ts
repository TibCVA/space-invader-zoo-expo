/**
 * LA REDDITION FAIT PERDRE LE CAMP DE LA PILE ACTIVE — le fait du moteur qui
 * dicte l'emplacement du bouton « Se rendre » à l'écran.
 *
 * `surrender()` (`actions.ts`) pose `loser = active.side` : émise pendant
 * l'activation D'EN FACE, la commande ferait capituler l'adversaire — une
 * victoire volée que le serveur, jouant le même moteur, validerait. L'écran
 * ne l'offre donc que pendant sa propre activation ; si cette règle du moteur
 * changeait, cette garde rougirait et l'écran devrait suivre.
 */
import { describe, expect, it } from 'vitest';
import { applyCombatAction } from './actions.js';
import { activeUnit } from './order.js';
import { army, makeBattle } from './testkit.js';

describe('la reddition, côté moteur', () => {
  it('le camp de la pile ACTIVE capitule — et l’autre l’emporte', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t1', 12]),
      defenderArmy: army(['ermitage_t1', 12]),
      seed: 20260825,
    });
    const u = activeUnit(combat);
    expect(u).not.toBeNull();
    if (!u) return;

    const res = applyCombatAction(state, { kind: 'surrender' });
    expect(res.ok).toBe(true);
    expect(combat.finished).toBe(true);
    /* Celui qui parle perd ; l'autre gagne. C'est LA raison pour laquelle le
       bouton ne vit que dans la barre du joueur dont c'est l'activation. */
    expect(combat.winner).toBe(u.side === 0 ? 1 : 0);
  });
});
