/**
 * AGIR SUR PLACE — la revisite (`HeroInteract`), injouable jusqu'ici.
 *
 * Les interactions AU PASSAGE marchent toutes seules (`core/movement.ts`) ;
 * ce qui manquait, c'est agir SANS bouger : le héros campé sur l'auberge
 * quand la semaine tourne. La logique ne mime que les trois conditions de
 * FORME du moteur (sur l'entrée, non épuisé, sans garde) ; le fond reste au
 * moteur, dont « Il n'y a rien à faire ici » remonte en avis.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { applyCommand, createGame } from '@auvergne/engine';
import type { GameState, HeroInstance, MapObject, WorldMap } from '@auvergne/engine';
import { setupDemo } from '../state/demo.js';
import { revisiteDe } from './visite.js';

let world: WorldMap;

beforeAll(() => {
  bootstrapEngine();
  world = buildWorld(setupDemo().seed);
});

/** Le héros du joueur actif, posé sur l'entrée d'une auberge de la carte. */
function campeSurLAuberge(): { jeu: GameState; heros: HeroInstance; auberge: MapObject } {
  const jeu = createGame(setupDemo(), world);
  const heros = jeu.heroes[jeu.players[jeu.activePlayer].heroes[0]];
  const auberge = Object.values(jeu.objects).find(
    (o) => o.kind === 'auberge' && (!o.guard || o.guard.length === 0),
  );
  expect(auberge, 'la carte doit semer une auberge sans garde').toBeDefined();
  if (!auberge) throw new Error('pas d’auberge');
  heros.at = { ...auberge.entrance };
  heros.inTown = null;
  return { jeu, heros, auberge };
}

describe('agir sur place', () => {
  it('offert sur l’entrée, refusé d’à côté', () => {
    const { jeu, heros, auberge } = campeSurLAuberge();
    expect(revisiteDe(jeu, heros, auberge).possible).toBe(true);
    heros.at = { col: heros.at.col + 1, row: heros.at.row };
    expect(revisiteDe(jeu, heros, auberge)).toEqual({ possible: false, raison: 'ailleurs' });
    expect(revisiteDe(jeu, null, auberge)).toEqual({ possible: false, raison: 'personne' });
  });

  it('jamais sur un lieu épuisé ni sur un lieu gardé', () => {
    const { jeu, heros, auberge } = campeSurLAuberge();
    auberge.spent = true;
    expect(revisiteDe(jeu, heros, auberge)).toEqual({ possible: false, raison: 'epuise' });
    auberge.spent = false;
    auberge.guard = [{ creature: 'manant', count: 10 }] as never;
    expect(revisiteDe(jeu, heros, auberge)).toEqual({ possible: false, raison: 'garde' });
  });

  it('le geste offert est accepté par le moteur, et il fait quelque chose', () => {
    const { jeu, heros, auberge } = campeSurLAuberge();
    expect(revisiteDe(jeu, heros, auberge).possible).toBe(true);
    const res = applyCommand(
      jeu,
      { type: 'HeroInteract', hero: heros.uid, object: auberge.uid },
      world,
    );
    expect(res.ok, res.error).toBe(true);
    expect(res.events.length).toBeGreaterThan(0);
  });
});
