/**
 * LA GARDE DE TOUR DU MAGASIN — hors de son tour, AUCUNE commande ne part.
 *
 * Le moteur attribue toute commande à `game.activePlayer` (`apply.ts`) : sans
 * cette garde, « Rendre les armes » joué pendant le tour du cousin abaissait
 * SA bannière en local, et l'échange du marché puisait dans SON trésor — puis
 * le serveur refusait sans joindre d'état correctif, laissant le client sur
 * une partie fantôme. La garde vit à LA porte (`dispatch`), pas dans chaque
 * écran : c'est la classe entière du défaut qu'elle ferme.
 *
 * Chaque bloc passe par le VRAI `dispatch` du magasin, sur une vraie partie.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { createGame } from '@auvergne/engine';
import type { GameSetup, PlayerId, WorldMap } from '@auvergne/engine';
import { setupDemo } from './demo.js';
import { chargerPartie, dispatch, getState, reinitialiser } from './store.js';

let world: WorldMap;
let setup: GameSetup;

beforeAll(() => {
  bootstrapEngine();
  const base = setupDemo();
  /* Deux bannières HUMAINES : la boucle d'IA locale ne se déclenche pas, et
     la situation est exactement celle du jeu en ligne — la main à l'un,
     l'écran chez l'autre. */
  setup = {
    ...base,
    players: base.players.map((p) => ({ ...p, kind: 'humain' as const })),
  };
  world = buildWorld(base.seed);
});

afterEach(() => reinitialiser());

/**
 * Charge une partie neuve dans le magasin. `main: false` place l'écran chez
 * le SPECTATEUR — la bannière qui n'a pas la main — sans présumer laquelle
 * ouvre la partie : c'est la graine qui en décide.
 */
function ouvrir(main: boolean, demo = false): { actif: PlayerId; moi: PlayerId } {
  const state = createGame(setup, world);
  const actif = state.activePlayer;
  const autre = state.turnOrder.find((p) => p !== actif);
  if (!autre) throw new Error('la partie doit compter deux bannières');
  const moi = main ? actif : autre;
  chargerPartie({ state, world, setup, localPlayer: moi, demo });
  return { actif, moi };
}

describe('la garde de tour', () => {
  it('hors de son tour, l’abandon est refusé et l’état ne bouge pas d’un pouce', () => {
    const { actif } = ouvrir(false);
    const avant = getState().game;
    expect(avant?.activePlayer).toBe(actif);

    const res = dispatch({ type: 'Surrender' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('La main est à');
    /* MÊME RÉFÉRENCE : rien n'a été appliqué en local — c'était le cœur du
       défaut, la bannière du cousin tombait sur l'écran du spectateur. */
    expect(getState().game).toBe(avant);
    expect(getState().game?.players[actif]?.alive).toBe(true);
    expect(getState().notice).toContain('La main est à');
  });

  it('hors de son tour, le marché est refusé — le trésor de l’autre reste sien', () => {
    ouvrir(false);
    const avant = getState().game;
    const res = dispatch({ type: 'TradeResources', give: 'bois', giveAmount: 10, take: 'ecus' });
    expect(res.ok).toBe(false);
    expect(res.error).toContain('La main est à');
    expect(getState().game).toBe(avant);
  });

  it('pendant son tour, la porte reste grande ouverte', () => {
    const { actif } = ouvrir(true);
    const res = dispatch({ type: 'EndTurn' });
    expect(res.ok, res.error).toBe(true);
    expect(getState().game?.activePlayer).not.toBe(actif);
  });

  it('en démonstration, la garde s’efface : un seul banc, rien à garder', () => {
    ouvrir(false, true);
    /* Même situation que le premier bloc, mais `demo` : la commande passe au
       moteur (qui la joue au nom de la bannière active, l'unique banc des
       démonstrations). */
    const res = dispatch({ type: 'EndTurn' });
    expect(res.ok, res.error).toBe(true);
  });
});
