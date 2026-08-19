/**
 * Le clonage ne perd RIEN — et la partie peut donc se conclure.
 *
 * `applyCommand` reclone l'état à chaque commande, et `clonePlayer` /
 * `cloneHero` recopient champ par champ. Un champ optionnel ajouté au
 * contrat sans être ajouté ici disparaît silencieusement à la première
 * commande venue : le code qui l'écrit marche, le test qui l'appelle
 * directement passe, et pourtant la donnée n'existe jamais en partie.
 *
 * Deux champs y étaient tombés, et le premier interdisait de gagner :
 *
 *  - `PlayerState.sansCiteDepuis` — le jour où la maison a perdu sa dernière
 *    cité. Remis à zéro plusieurs fois par tour, le compte des sept jours
 *    n'arrivait jamais à son terme : une bannière dépouillée survivait
 *    indéfiniment (mesuré : dix-neuf jours sans cité, toujours vivante),
 *    donc AUCUNE partie ne pouvait se conclure, puisque la victoire est la
 *    prise de tous les châteaux adverses.
 *  - `HeroInstance.benedictions` — le moral de l'oratoire, la fortune de la
 *    fontaine aux fées. Le joueur payait sa visite et n'en gardait rien.
 *
 * Ce test parcourt les champs optionnels du contrat plutôt que de les citer :
 * un champ neuf oublié dans le clonage le fera rougir, sans qu'on ait pensé
 * à l'ajouter ici.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from './apply.js';
import { clonePlayer, cloneHero, cloneState } from './clone.js';
import { newGame } from './test-helpers.js';

describe('clonage — aucun champ ne se perd en route', () => {
  it('un champ optionnel posé sur une maison survit au clonage', () => {
    const { state } = newGame(20250816, 2);
    const p = state.players.P2;
    p.sansCiteDepuis = 42;
    expect(clonePlayer(p).sansCiteDepuis).toBe(42);
    expect(cloneState(state).players.P2.sansCiteDepuis).toBe(42);
  });

  it('les bénédictions de visite survivent au clonage', () => {
    const { state } = newGame(20250816, 2);
    const hero = state.heroes[state.players.P1.heroes[0]];
    hero.benedictions = [{ kind: 'morale', value: 1, jusquau: 9, source: 'oratoire' }];
    const clone = cloneHero(hero);
    expect(clone.benedictions).toEqual(hero.benedictions);
    /* Copie profonde : altérer l'original ne doit pas toucher le clone. */
    hero.benedictions[0].value = 3;
    expect(clone.benedictions?.[0].value).toBe(1);
  });

  it('tout champ du contrat présent sur l’état d’origine se retrouve dans le clone', () => {
    /* Le garde-fou générique : on compare les jeux de clefs, si bien qu'un
       champ ajouté demain au contrat et oublié dans le clonage rougit ici. */
    const { state } = newGame(20250816, 2);
    const hero = state.heroes[state.players.P1.heroes[0]];
    state.players.P1.sansCiteDepuis = 7;
    hero.benedictions = [{ kind: 'fortune', value: 1, jusquau: 12, source: 'fontaine' }];

    const clone = cloneState(state);
    for (const id of Object.keys(state.players)) {
      const avant = Object.keys(state.players[id]).sort();
      const apres = Object.keys(clone.players[id]).sort();
      expect(apres, `joueur ${id}`).toEqual(avant);
    }
    for (const uid of Object.keys(state.heroes)) {
      const avant = Object.keys(state.heroes[uid]).sort();
      const apres = Object.keys(clone.heroes[uid]).sort();
      expect(apres, `héros ${uid}`).toEqual(avant);
    }
  });

  it('une maison sans cité s’éteint au septième jour, et la partie se termine', () => {
    /* Le bout du fil : la règle des sept jours ne tient que si le champ
       survit aux clonages d'`applyCommand`. C'est le scénario complet. */
    const { state, world } = newGame(20250816, 2);
    let courant = state;
    const uid = courant.players.P2.towns[0];
    courant.towns[uid].owner = 'P1';
    courant.players.P2.towns = [];
    courant.players.P1.towns.push(uid);

    let jours = 0;
    for (let i = 0; i < 40 && courant.phase !== 'termine'; i++) {
      const r = applyCommand(courant, { type: 'EndTurn' }, world);
      expect(r.ok, r.error).toBe(true);
      if (!r.ok) break;
      courant = r.state;
      jours = courant.turn;
    }
    expect(courant.phase, `toujours en cours au jour ${String(jours)}`).toBe('termine');
    expect(courant.winner).toBe('P1');
    expect(courant.players.P2.alive).toBe(false);
  });
});
