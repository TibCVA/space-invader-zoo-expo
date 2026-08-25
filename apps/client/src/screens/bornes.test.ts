/**
 * LE RÉSEAU DES BORNES — `UseBorne` n'était émise nulle part : les bornes
 * armoriées étaient décoratives, alors que le moteur porte tout (découverte,
 * éveil à la semaine, quota, gratuité du Gardien, coûts).
 *
 * Comme partout : la logique décide de ce qu'on PROPOSE, `canUseBorne` reste
 * seul juge, et chaque bloc se ferme par un `applyCommand` réel.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { applyCommand, createGame } from '@auvergne/engine';
import type { GameState, HeroInstance, MapObject, WorldMap } from '@auvergne/engine';
import { setupDemo } from '../state/demo.js';
import { reseauDepuisLaBorne } from './bornes.js';

let world: WorldMap;

beforeAll(() => {
  bootstrapEngine();
  world = buildWorld(setupDemo().seed);
});

/** Une partie où NOTRE héros se tient sur une borne, deux bornes au registre. */
function surUneBorne(): {
  jeu: GameState;
  heros: HeroInstance;
  ici: MapObject;
  labas: MapObject;
} {
  const jeu = createGame(setupDemo(), world);
  const heros = jeu.heroes[jeu.players[jeu.activePlayer].heroes[0]];
  const bornes = Object.values(jeu.objects).filter((o) => o.kind === 'borne');
  expect(bornes.length, 'la carte doit semer au moins deux bornes').toBeGreaterThanOrEqual(2);
  const [ici, labas] = bornes;
  /* Les deux pierres sont inscrites au registre, comme après une visite. */
  for (const b of [ici, labas]) {
    b.visitedBy = [...(b.visitedBy ?? []), heros.owner];
  }
  heros.at = { ...ici.entrance };
  heros.inTown = null;
  heros.movement = 2000;
  /* Le réseau s'éveille à une semaine donnée : on avance le calendrier
     plutôt que de désactiver la règle. */
  jeu.turn = Math.max(jeu.turn, 7 * 4 + 1);
  return { jeu, heros, ici, labas };
}

describe('le réseau des bornes', () => {
  it('hors d’une borne, la fiche ne propose rien', () => {
    const { jeu, heros, labas } = surUneBorne();
    heros.at = { col: heros.at.col + 1, row: heros.at.row };
    expect(reseauDepuisLaBorne(jeu, heros, labas).surLaBorne).toBe(false);
    expect(reseauDepuisLaBorne(jeu, null, labas).surLaBorne).toBe(false);
  });

  it('sur la borne : les pierres du registre, jamais celle où l’on est', () => {
    const { jeu, heros, ici, labas } = surUneBorne();
    const reseau = reseauDepuisLaBorne(jeu, heros, ici);
    expect(reseau.surLaBorne).toBe(true);
    const vers = reseau.offres.map((o) => o.vers);
    expect(vers).toContain(labas.uid);
    expect(vers).not.toContain(ici.uid);
  });

  it('une pierre jamais vue n’existe pas pour le joueur', () => {
    const { jeu, heros, ici, labas } = surUneBorne();
    labas.visitedBy = (labas.visitedBy ?? []).filter((p) => p !== heros.owner);
    const vers = reseauDepuisLaBorne(jeu, heros, ici).offres.map((o) => o.vers);
    expect(vers).not.toContain(labas.uid);
  });

  it('le voyage annoncé est le voyage fait : position, écus, marche', () => {
    const { jeu, heros, ici, labas } = surUneBorne();
    const offre = reseauDepuisLaBorne(jeu, heros, ici).offres.find((o) => o.vers === labas.uid);
    expect(offre).toBeDefined();
    if (!offre) return;
    expect(offre.possible, offre.refus ?? '').toBe(true);

    const ecusAvant = jeu.players[heros.owner].resources.ecus;
    const marcheAvant = heros.movement;
    const res = applyCommand(jeu, { type: 'UseBorne', hero: heros.uid, to: labas.uid }, world);
    expect(res.ok, res.error).toBe(true);
    const apres = res.state.heroes[heros.uid];
    expect(apres.at).toEqual(labas.entrance);
    expect(ecusAvant - res.state.players[heros.owner].resources.ecus).toBe(offre.coutEcus);
    expect(marcheAvant - apres.movement).toBe(offre.coutMarche);
  });

  it('un refus du juge est LISTÉ avec sa phrase, pas caché', () => {
    const { jeu, heros, ici, labas } = surUneBorne();
    /* Bourse vidée : le juge refuse pour les écus, la ligne reste et le dit. */
    jeu.players[heros.owner].resources.ecus = 0;
    const offre = reseauDepuisLaBorne(jeu, heros, ici).offres.find((o) => o.vers === labas.uid);
    expect(offre).toBeDefined();
    if (!offre) return;
    expect(offre.possible).toBe(false);
    expect(offre.refus ?? '').toContain('écus');
    /* Et le moteur refuse le même voyage : l'offre et lui disent une seule
       et même chose. */
    const res = applyCommand(jeu, { type: 'UseBorne', hero: heros.uid, to: labas.uid }, world);
    expect(res.ok).toBe(false);
  });
});
