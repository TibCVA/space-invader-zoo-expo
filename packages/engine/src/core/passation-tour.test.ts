/**
 * La main passe toujours à une bannière vivante.
 *
 * `endTurn` désigne le joueur suivant, PUIS fait passer le jour quand la
 * ronde boucle. Or c'est au passage du jour que les maisons s'éteignent : la
 * règle des sept jours sans cité tombe dans `advanceDay`, exactement entre le
 * choix du suivant et sa prise de main.
 *
 * Si le suivant est mort dans l'intervalle et qu'on le pose quand même comme
 * joueur actif, la partie se fige pour **tout le monde** : `applyCommand`
 * refuse alors la moindre commande — « Le joueur actif n'est plus en lice » —
 * et cela vaut aussi pour `EndTurn`, y compris celui qu'un harnais force à la
 * place de la bannière. Plus personne ne joue jamais.
 *
 * Le défaut s'est vu quand la carte a pris la taille d'une XL de HMM3 : les
 * conquêtes y aboutissent bien plus vite, donc les éliminations tombent bien
 * plus souvent, et deux parties sur quatre se sont enlisées — aux tours 34 et
 * 48, sur des maisons dépouillées la veille.
 *
 * Le test met la situation en place à la main plutôt que d'espérer la
 * rencontrer : jouer des centaines de tours ne suffit pas, la coïncidence
 * demande qu'une maison arrive au septième jour sans cité pile au moment où
 * la ronde boucle sur elle.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from './apply.js';
import { newGame } from './test-helpers.js';
import { JOURS_SANS_CITE } from '../world/victory.js';

describe('passation du tour', () => {
  it('ne donne jamais la main à une maison éteinte par le jour qui vient de passer', () => {
    const { state, world } = newGame(31, 5);

    /*
     * On installe la coïncidence : la dernière maison de la ronde joue, la
     * première suit — et cette première est à son septième jour sans cité,
     * donc `advanceDay` l'éteindra au moment même où la ronde boucle.
     */
    const ordre = state.turnOrder;
    const dernier = ordre[ordre.length - 1];
    const premier = ordre[0];
    state.activePlayer = dernier;

    const condamne = state.players[premier];
    for (const uid of condamne.towns.slice()) {
      const town = state.towns[uid];
      if (town) {
        town.owner = null;
        town.garrisonHero = null;
        town.visitingHero = null;
      }
    }
    condamne.towns = [];
    condamne.sansCiteDepuis = state.turn - JOURS_SANS_CITE;

    const apres = applyCommand(state, { type: 'EndTurn' }, world);
    expect(apres.ok).toBe(true);

    const suite = apres.state;
    // Le décor doit être celui qu'on a voulu, sans quoi le test ne dit rien.
    expect(suite.players[premier].alive, 'la maison visée devait s’éteindre').toBe(false);

    // À cinq bannières, la partie continue : c'est bien la passation qu'on
    // observe, et non une chronique qui se clôt.
    expect(suite.phase, 'la partie ne devait pas se conclure ici').not.toBe('termine');
    {
      const actif = suite.players[suite.activePlayer];
      expect(actif.alive, `la main est passée à ${suite.activePlayer}, qui est éteint`).toBe(true);

      // Et la partie doit pouvoir continuer : c'est tout l'enjeu.
      const encore = applyCommand(suite, { type: 'EndTurn' }, world);
      expect(encore.ok, `plus personne ne peut clore son tour : ${String(encore.error)}`).toBe(true);
    }
  });
});
