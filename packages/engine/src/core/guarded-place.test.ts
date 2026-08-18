/**
 * La garde d'un lieu de carte doit **tomber** quand on la bat.
 *
 * Pourquoi ce fichier existe. `CombatState` ne décrit le camp défenseur que par
 * trois champs : un joueur, un héros, une cité. Face à la garde neutre d'un
 * gisement ou d'un sceau, les trois valent `null` — le lieu lui-même
 * n'apparaît nulle part. `resolveCombatOutcome` rendait donc son armée au
 * vainqueur, garnissait une cité prise, distribuait l'expérience… et laissait
 * la garde du lieu **intacte**. Le gisement se relevait au grand complet au
 * tour suivant, et au suivant.
 *
 * Ce que cela coûtait, mesuré sur vingt parties complètes à quatre bannières
 * avant correction : zéro gisement, zéro Sceau des Marches, zéro cité gardée
 * pris — par qui que ce soit, en douze semaines. Une bataille ne rapportait
 * que de l'expérience et des dépouilles. La Couronne devenait inatteignable et
 * toutes les parties se réglaient au score de fin de chronique ; le profil
 * d'IA le plus immobile l'emportait trois fois sur quatre, ce qui n'était pas
 * un défaut de l'IA mais la lecture correcte d'un monde où rien ne se
 * conquiert.
 *
 * Les trois tests verrouillent les trois moitiés de la correction : la garde
 * tombe, le lieu se prend dans la foulée, et rien de tout cela n'arrive à un
 * lieu où le héros ne s'est pas rendu.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { CELL_PASSABLE, type GameState, type MapCoord, type MapObject, type WorldMap } from '../types.js';
import { worldModulePack } from '../world/index.js';
import {
  applyCommand,
  invalidateWorldCache,
  registerWorldModule,
  resetEngineModules,
} from './index.js';
import { newGame } from './test-helpers.js';

afterEach(() => resetEngineModules());

/**
 * Une partie neuve avec le **vrai** module de monde — c'est lui qui sait
 * prendre un gisement. Le module de combat reste celui de secours : ce qu'on
 * éprouve ici est la liaison faite par `applyCommand`, commune aux deux.
 *
 * Chaque test reçoit sa propre graine : les mondes de secours sont mis en
 * cache par graine, et l'on y injecte des lieux.
 */
function partie(graine: number): { state: GameState; world: WorldMap } {
  registerWorldModule(worldModulePack());
  return newGame(graine, 2);
}

/**
 * Une case voisine praticable. Le lieu gardé doit être posé **à côté** du
 * héros et non sous ses pieds : c'est en y entrant que la marche engage la
 * garde, et un déplacement sur place ne déclenche rien.
 */
function voisinePraticable(world: WorldMap, de: MapCoord): MapCoord {
  for (const [dc, dr] of [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
    [1, 1],
    [-1, -1],
    [1, -1],
    [-1, 1],
  ] as const) {
    const col = de.col + dc;
    const row = de.row + dr;
    if (col < 0 || row < 0 || col >= world.cols || row >= world.rows) continue;
    if (((world.flags[row * world.cols + col] | 0) & CELL_PASSABLE) === 0) continue;
    if (world.objects.some((o) => o.at.col === col && o.at.row === row)) continue;
    return { col, row };
  }
  throw new Error('Aucune case voisine praticable : la carte de test est inutilisable.');
}

/**
 * Pose un gisement gardé sur la carte **et** dans l'état.
 *
 * Les deux sont nécessaires : `objectAtCell` cherche le gabarit dans
 * `world.objects` puis lit l'exemplaire vivant dans `state.objects`. Un lieu
 * qui n'existerait que dans l'état serait invisible à la marche.
 */
function poserGisement(
  state: GameState,
  world: WorldMap,
  uid: string,
  at: MapCoord,
  garde: { creature: string; count: number }[],
): MapObject {
  const obj: MapObject = {
    uid,
    kind: 'mine',
    at: { col: at.col, row: at.row },
    footprint: [{ col: at.col, row: at.row }],
    entrance: { col: at.col, row: at.row },
    owner: null,
    data: { resource: 'fer', amount: 2, name: 'Minière d’épreuve' },
    guard: garde as MapObject['guard'],
  };
  world.objects.push({ ...obj, guard: garde as MapObject['guard'] });
  /* `objectAt` est la table plate qui dit quel lieu occupe quelle case, et
     c'est elle — et non `world.objects` — que consulte la marche. Y inscrire
     l'index, décalé de un puisque zéro signifie « aucun lieu ». */
  world.objectAt[at.row * world.cols + at.col] = world.objects.length;
  state.objects[uid] = obj;
  invalidateWorldCache(world);
  return obj;
}

/** Retire les lieux d'épreuve du monde mis en cache par graine. */
function retirerDuMonde(world: WorldMap, uids: readonly string[]): void {
  for (const uid of uids) {
    const i = world.objects.findIndex((o) => o.uid === uid);
    if (i < 0) continue;
    const lieu = world.objects[i];
    world.objectAt[lieu.at.row * world.cols + lieu.at.col] = 0;
    /* On vide la case du tableau plutôt que de la retirer : un `splice`
       décalerait tous les index suivants et fausserait `objectAt`. */
    world.objects.splice(i, 1);
  }
  /* Les index ayant pu bouger, on reconstruit la table de bout en bout. */
  world.objectAt.fill(0);
  world.objects.forEach((o, i) => {
    for (const c of o.footprint) world.objectAt[c.row * world.cols + c.col] = i + 1;
  });
  invalidateWorldCache(world);
}

/**
 * Le héros de la bannière **qui a la main**. `applyCommand` refuse toute
 * commande venue d'une autre — et l'ordre du tour dépend de la graine.
 */
function herosActif(state: GameState) {
  const joueur = state.players[state.activePlayer];
  return state.heroes[joueur.heroes[0]];
}

/** Total des créatures encore en garde d'un lieu. */
function garde(obj: MapObject | undefined): number {
  return (obj?.guard ?? []).reduce((n, s) => n + s.count, 0);
}

describe('garde d’un lieu de carte', () => {
  it('tombe quand on la bat, et le gisement change de bannière dans la foulée', () => {
    const { state, world } = partie(511001);
    const hero = herosActif(state);
    /* Une garde dérisoire face à l'armée de départ : la victoire ne doit pas
       dépendre des dés, seule la conséquence nous intéresse. */
    const obj = poserGisement(state, world, 'O_ep_gisement', voisinePraticable(world, hero.at), [
      { creature: 'granit_t1', count: 1 },
    ]);
    try {
      const engage = applyCommand(state, { type: 'MoveHero', hero: hero.uid, to: obj.entrance }, world);
      expect(engage.ok).toBe(true);
      /* La marche s'interrompt sur l'entrée et engage la garde. */
      expect(engage.state.combat).not.toBeNull();

      const apres = applyCommand(engage.state, { type: 'AutoResolveCombat' }, world);
      expect(apres.ok).toBe(true);
      expect(garde(apres.state.objects[obj.uid])).toBe(0);
      expect(apres.state.objects[obj.uid].owner).toBe(state.activePlayer);
    } finally {
      retirerDuMonde(world, [obj.uid]);
    }
  });

  it('ne rend le lieu à personne tant que la garde tient', () => {
    const { state, world } = partie(511002);
    const hero = herosActif(state);
    /* Une garde hors de portée : le héros perd, le gisement reste neutre. */
    const obj = poserGisement(state, world, 'O_ep_gisement', voisinePraticable(world, hero.at), [
      { creature: 'granit_t7', count: 400 },
    ]);
    try {
      const engage = applyCommand(state, { type: 'MoveHero', hero: hero.uid, to: obj.entrance }, world);
      expect(engage.state.combat).not.toBeNull();
      const apres = applyCommand(engage.state, { type: 'AutoResolveCombat' }, world);

      expect(garde(apres.state.objects[obj.uid])).toBeGreaterThan(0);
      expect(apres.state.objects[obj.uid].owner).toBeNull();
    } finally {
      retirerDuMonde(world, [obj.uid]);
    }
  });

  it('laisse intacte la garde d’un lieu où le héros ne s’est pas rendu', () => {
    const { state, world } = partie(511003);
    const hero = herosActif(state);
    const ici = poserGisement(state, world, 'O_ep_ici', voisinePraticable(world, hero.at), [
      { creature: 'granit_t1', count: 1 },
    ]);
    const ailleurs = poserGisement(
      state,
      world,
      'O_ep_ailleurs',
      { col: hero.at.col + 9, row: hero.at.row + 9 },
      [{ creature: 'granit_t1', count: 5 }],
    );
    try {
      const engage = applyCommand(state, { type: 'MoveHero', hero: hero.uid, to: ici.entrance }, world);
      expect(engage.state.combat).not.toBeNull();
      const apres = applyCommand(engage.state, { type: 'AutoResolveCombat' }, world);

      expect(garde(apres.state.objects[ailleurs.uid])).toBe(5);
      expect(apres.state.objects[ailleurs.uid].owner).toBeNull();
    } finally {
      retirerDuMonde(world, [ici.uid, ailleurs.uid]);
    }
  });
});
