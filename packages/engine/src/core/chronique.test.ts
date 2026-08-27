/**
 * LA PORTÉE DES LIGNES DE JOURNAL — ce qui est public se raconte à tous,
 * ce qui est privé ne quitte jamais son auteur.
 *
 * Le journal du moteur nourrit trois choses : le panneau Journal, les
 * vignettes de la carte, et la chronique servie par le serveur à chaque
 * bannière. Sans la marque `portee`, le serveur n'avait aucun moyen de trier
 * — il servait TOUT, constructions adverses sous brouillard comprises.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from './apply.js';
import { captureTown } from './movement.js';
import { journalFromEvents } from './turn.js';
import { newGame } from './test-helpers.js';

describe('la portée des faits', () => {
  it('la reddition est PUBLIQUE — la partie continue, tout le monde doit le savoir', () => {
    const { state, world } = newGame();
    const res = applyCommand(state, { type: 'Surrender' }, world);
    expect(res.ok, res.error).toBe(true);
    const ligne = res.state.journal.find((e) => e.text.includes('abaisse sa bannière'));
    expect(ligne).toBeDefined();
    expect(ligne?.portee).toBe('publique');
  });

  it('la capture d’une cité est PUBLIQUE, et nomme la place et la bannière', () => {
    const { state } = newGame();
    const moi = state.activePlayer;
    const cite = Object.values(state.towns).find((t) => t.owner !== moi);
    expect(cite).toBeDefined();
    if (!cite) return;
    const events = captureTown(state, cite, moi);
    journalFromEvents(state, events);
    const ligne = state.journal.find((e) => e.text.includes('passe sous la bannière'));
    expect(ligne).toBeDefined();
    expect(ligne?.portee).toBe('publique');
    expect(ligne?.text).toContain(cite.name);
    expect(ligne?.text).toContain(state.players[moi].name);
  });

  it('une construction reste PRIVÉE — ce qu’on bâtit sous brouillard ne se raconte pas', () => {
    const { state, world } = newGame();
    const moi = state.activePlayer;
    const cite = Object.values(state.towns).find((t) => t.owner === moi);
    expect(cite).toBeDefined();
    if (!cite) return;
    /* Ressources garanties : la garde porte sur la PORTÉE, pas sur le prix. */
    state.players[moi].resources = {
      ecus: 99_999,
      bois: 999,
      granit: 999,
      fer: 999,
      sel: 999,
      essence: 999,
      filDor: 999,
    };
    const res = applyCommand(state, { type: 'BuildInTown', town: cite.uid, building: 'palissade' as never }, world);
    expect(res.ok, res.error).toBe(true);
    const ligne = res.state.journal.find((e) => e.text.includes('s’élève à'));
    expect(ligne).toBeDefined();
    expect(ligne?.portee).toBeUndefined();
  });
});
