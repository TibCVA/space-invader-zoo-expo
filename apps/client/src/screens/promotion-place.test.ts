/**
 * LA PROMOTION NE DÉTRUIT JAMAIS CE QU'ELLE NE PEUT PAS LOGER.
 *
 * Le défaut mesuré : `applyUpgrade` ignorait le retour de `addToArmy`. Une
 * amélioration PARTIELLE dans une garnison pleine — la pile d'origine garde
 * son emplacement, les promues ont besoin d'un emplacement neuf qui n'existe
 * pas — payait le prix entier et DÉTRUISAIT les créatures promues, en
 * silence. Le tout-ou-rien du moteur refuse désormais, et l'état reste
 * vierge au sou près.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { applyCommand, createGame, upgradesOf } from '@auvergne/engine';
import type { CreatureId, GameState, TownState, WorldMap } from '@auvergne/engine';
import { BUILDINGS, CREATURES } from '@auvergne/content';
import { setupDemo } from '../state/demo.js';

let world: WorldMap;

beforeAll(() => {
  bootstrapEngine();
  world = buildWorld(setupDemo().seed);
});

/**
 * Une cité prête à promouvoir : le bâtiment d'amélioration est levé, le
 * trésor est plein, aucun visiteur — seule la garnison compte.
 */
function citePrete(): {
  jeu: GameState;
  cite: TownState;
  de: CreatureId;
  vers: CreatureId;
} {
  const jeu = createGame(setupDemo(), world);
  const cite = Object.values(jeu.towns).find((t) => t.owner === jeu.activePlayer);
  if (!cite) throw new Error('le joueur actif doit avoir une cité');
  const batiment = Object.values(BUILDINGS).find((b) =>
    b.grants.some((g) => g.kind === 'upgrade'),
  );
  if (!batiment) throw new Error('le contenu doit offrir un bâtiment d’amélioration');
  cite.built.push(batiment.id);
  const paire = [...upgradesOf(cite).entries()][0];
  if (!paire) throw new Error('le bâtiment levé doit ouvrir une promotion');
  cite.visitingHero = null;
  const joueur = jeu.players[jeu.activePlayer];
  joueur.resources = {
    ecus: 99_999,
    bois: 999,
    granit: 999,
    fer: 999,
    sel: 999,
    essence: 999,
    filDor: 999,
  };
  return { jeu, cite, de: paire[0], vers: paire[1] };
}

/** Remplit la garnison : la pile à promouvoir, puis des piles d'appoint. */
function garnisonDe(cite: TownState, de: CreatureId, vers: CreatureId, taille: number): void {
  const autres = Object.keys(CREATURES).filter((c) => c !== de && c !== vers);
  cite.garrison = [
    { creature: de, count: 10 },
    ...autres.slice(0, taille - 1).map((c) => ({ creature: c as CreatureId, count: 1 })),
    ...Array.from({ length: 7 - taille }, () => null),
  ];
}

describe('la promotion et la place', () => {
  it('partielle dans une garnison PLEINE : refusée, et l’état reste vierge au sou près', () => {
    const { jeu, cite, de, vers } = citePrete();
    garnisonDe(cite, de, vers, 7);
    const avant = jeu.players[jeu.activePlayer].resources.ecus;

    const res = applyCommand(
      jeu,
      { type: 'UpgradeCreatures', town: cite.uid, from: de, count: 4 },
      world,
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('La place manque');
    /* Rien payé, rien perdu : c'était le cœur du défaut. */
    expect(res.state.players[jeu.activePlayer].resources.ecus).toBe(avant);
    const restees = res.state.towns[cite.uid].garrison.find((s) => s?.creature === de);
    expect(restees?.count).toBe(10);
  });

  it('ENTIÈRE dans une garnison pleine : la pile libère sa place et la promotion passe', () => {
    const { jeu, cite, de, vers } = citePrete();
    garnisonDe(cite, de, vers, 7);

    const res = applyCommand(
      jeu,
      { type: 'UpgradeCreatures', town: cite.uid, from: de, count: 10 },
      world,
    );
    expect(res.ok, res.error).toBe(true);
    const promues = res.state.towns[cite.uid].garrison.find((s) => s?.creature === vers);
    expect(promues?.count).toBe(10);
    expect(res.state.towns[cite.uid].garrison.some((s) => s?.creature === de)).toBe(false);
  });

  it('partielle avec un emplacement libre : les deux piles cohabitent', () => {
    const { jeu, cite, de, vers } = citePrete();
    garnisonDe(cite, de, vers, 6);

    const res = applyCommand(
      jeu,
      { type: 'UpgradeCreatures', town: cite.uid, from: de, count: 4 },
      world,
    );
    expect(res.ok, res.error).toBe(true);
    const garnison = res.state.towns[cite.uid].garrison;
    expect(garnison.find((s) => s?.creature === de)?.count).toBe(6);
    expect(garnison.find((s) => s?.creature === vers)?.count).toBe(4);
  });
});
