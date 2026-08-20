/**
 * LA COMMANDE DE FIN DE TOUR.
 *
 * Le défaut gardé ici n'était pas une erreur de calcul : c'était une absence.
 * `EndTurn` existait dans le moteur, dans le protocole et dans les tests, et
 * n'était émise par AUCUN chemin de l'interface — le client ne produisait que
 * `MoveHero`, `CombatAction` et `AutoResolveCombat`. Dans une vraie partie, on
 * ne pouvait pas rendre la main, donc la partie ne dépassait pas le tour du
 * premier joueur.
 *
 * Ces tests tiennent les décisions du bouton. Ils ne prouvent pas qu'il est
 * BRANCHÉ — une fonction pure ne peut pas le prouver, et c'est exactement le
 * genre de confiance qui a laissé passer le défaut. La preuve du branchement
 * est dans `tools/e2e-en-ligne.mjs`, qui rend la main **en cliquant le
 * bouton** dans un vrai navigateur et vérifie que le serveur change de joueur
 * actif.
 */
import { describe, expect, it } from 'vitest';
import { createGame } from '@auvergne/engine';
import type { GameState } from '@auvergne/engine';
import { buildWorld } from '@auvergne/map';
import { setupDemo } from '../state/demo.js';
import { etatFinDeTour } from './fin-de-tour.js';

function partie(): GameState {
  const setup = setupDemo();
  return createGame(setup, buildWorld(setup.seed));
}

describe('l’état de la commande de fin de tour', () => {
  it('se cache quand il n’y a ni partie ni joueur', () => {
    expect(etatFinDeTour(null, 'P1').quoi).toBe('cache');
    expect(etatFinDeTour(partie(), null).quoi).toBe('cache');
  });

  it('se cache pour une bannière qui n’est pas dans la partie', () => {
    const game = partie();
    expect(etatFinDeTour(game, 'P9' as never).quoi).toBe('cache');
  });

  it('s’efface pendant un combat : on ne rend pas la main au milieu d’une bataille', () => {
    const game = partie();
    expect(etatFinDeTour(game, game.activePlayer).quoi).toBe('prete');
    (game as { combat: unknown }).combat = { id: 'c1', round: 1, units: [] };
    expect(etatFinDeTour(game, game.activePlayer).quoi).toBe('combat');
  });

  it('annonce qui a la main quand ce n’est pas notre tour', () => {
    const game = partie();
    const autre = (Object.keys(game.players) as (keyof typeof game.players)[]).find(
      (p) => p !== game.activePlayer,
    );
    expect(autre, 'la partie de démonstration doit compter plusieurs bannières').toBeTruthy();
    const etat = etatFinDeTour(game, autre as never);
    expect(etat.quoi).toBe('attente');
    if (etat.quoi === 'attente') {
      expect(etat.qui).toBe(game.players[game.activePlayer].name);
    }
  });

  it('compte les héros qui ont encore de la marche', () => {
    const game = partie();
    const joueur = game.activePlayer;
    const heros = game.players[joueur].heroes;
    expect(heros.length, 'la bannière doit partir avec au moins un héros').toBeGreaterThan(0);
    for (const uid of heros) {
      game.heroes[uid].inTown = null;
      game.heroes[uid].movement = 100;
    }

    const plein = etatFinDeTour(game, joueur);
    expect(plein.quoi).toBe('prete');
    if (plein.quoi === 'prete') expect(plein.herosEnAttente).toBe(heros.length);

    /* Un héros à court de marche ne compte plus. */
    game.heroes[heros[0]].movement = 0;
    const partiel = etatFinDeTour(game, joueur);
    if (partiel.quoi === 'prete') expect(partiel.herosEnAttente).toBe(heros.length - 1);
  });

  it('ne compte pas un héros endormi dans une cité, qui ne bougera pas', () => {
    const game = partie();
    const joueur = game.activePlayer;
    const uid = game.players[joueur].heroes[0];
    game.heroes[uid].movement = 100;
    game.heroes[uid].inTown = null;
    const dehors = etatFinDeTour(game, joueur);
    const avant = dehors.quoi === 'prete' ? dehors.herosEnAttente : -1;

    game.heroes[uid].inTown = game.players[joueur].towns[0] ?? null;
    expect(game.heroes[uid].inTown, 'la bannière doit avoir une cité').toBeTruthy();
    const dedans = etatFinDeTour(game, joueur);
    if (dedans.quoi === 'prete') expect(dedans.herosEnAttente).toBe(avant - 1);
  });

  it('ne demande aucune confirmation quand personne n’a plus de marche', () => {
    const game = partie();
    const joueur = game.activePlayer;
    for (const uid of game.players[joueur].heroes) game.heroes[uid].movement = 0;
    const etat = etatFinDeTour(game, joueur);
    expect(etat.quoi).toBe('prete');
    if (etat.quoi === 'prete') expect(etat.herosEnAttente).toBe(0);
  });
});
