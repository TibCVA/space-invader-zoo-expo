/**
 * Les couleurs d'une maison éteinte tombent, quelle que soit la façon dont
 * elle s'éteint.
 *
 * ## Le défaut mesuré
 *
 * Une bannière quitte la partie de deux façons. La **reddition** (`Surrender`,
 * `core/apply.ts`) rendait bien à la neutralité tout ce que le joueur tenait
 * sur la carte — gisements, demeures franches, belvédères, sceaux. L'**extinction
 * automatique** de `checkVictory`, elle, posait `p.alive = false` et s'arrêtait
 * là : `state.objects` n'était pas parcouru. Le joueur n'étant jamais retiré de
 * `state.players`, ses gisements gardaient son nom, donc sa couleur, jusqu'à la
 * fin de la partie — une carte politique qui montre les terres d'un mort.
 *
 * Ce n'est pas qu'un défaut d'affichage : `scoreBreakdown` compte encore ces
 * gisements (`scoreMine`), et le pavois de la carte les peint (`render/pavois.ts`).
 *
 * ## Ce que le test garde
 *
 * Les deux sorties de partie sont mises côte à côte, sur la même partie et le
 * même lot de lieux : ce que la reddition laisse derrière elle est exactement
 * ce que l'extinction doit laisser.
 */
import { describe, expect, it } from 'vitest';
import { applyCommand } from '../core/apply.js';
import { newGame } from '../core/test-helpers.js';
import type { GameState, PlayerId } from '../types.js';
import { JOURS_SANS_CITE, checkVictory, isEliminated } from './victory.js';

/** Les lieux que l'on met au nom d'une bannière avant de la faire disparaître. */
function pavoiserPour(state: GameState, joueur: PlayerId, combien: number): string[] {
  const pris: string[] = [];
  for (const uid of Object.keys(state.objects).sort()) {
    if (pris.length >= combien) break;
    const obj = state.objects[uid];
    if (obj.kind !== 'mine' && obj.kind !== 'demeure' && obj.kind !== 'belvedere') continue;
    obj.owner = joueur;
    pris.push(uid);
  }
  return pris;
}

/** Retire à une bannière ses cités et la met au seuil des sept jours de grâce. */
function condamner(state: GameState, joueur: PlayerId): void {
  const p = state.players[joueur];
  for (const uid of p.towns.slice()) {
    const town = state.towns[uid];
    if (town) {
      town.owner = null;
      town.garrisonHero = null;
      town.visitingHero = null;
    }
  }
  p.towns = [];
  p.sansCiteDepuis = state.turn - JOURS_SANS_CITE;
}

function lieuxTenus(state: GameState, joueur: PlayerId): string[] {
  return Object.keys(state.objects)
    .filter((uid) => state.objects[uid].owner === joueur)
    .sort();
}

describe('extinction d’une maison', () => {
  it('fait tomber ses couleurs sur la carte, comme le fait la reddition', () => {
    const { state } = newGame(31, 5);
    const condamne = state.turnOrder[1];

    /* Le décor doit exister, sans quoi le test ne mesure rien. */
    const pris = pavoiserPour(state, condamne, 12);
    expect(pris.length, 'aucun lieu pavoisable sur cette carte').toBeGreaterThan(5);
    expect(lieuxTenus(state, condamne)).toEqual(pris);

    condamner(state, condamne);
    expect(isEliminated(state, condamne), 'la maison visée devait être éteignable').toBe(true);

    const evenements = checkVictory(state);
    expect(state.players[condamne].alive).toBe(false);
    expect(evenements.some((e) => e.type === 'PlayerDefeated')).toBe(true);

    /* Le point du test : plus un seul lieu ne bat son pavillon. */
    expect(lieuxTenus(state, condamne), 'des lieux gardent la couleur d’une maison éteinte').toEqual(
      [],
    );
  });

  it('laisse exactement ce que laisse une reddition', () => {
    const { state, world } = newGame(31, 5);
    const redditeur = state.turnOrder[1];
    const eteint = state.turnOrder[2];
    const lotA = pavoiserPour(state, redditeur, 6);
    const lotB: string[] = [];
    for (const uid of Object.keys(state.objects).sort()) {
      if (lotB.length >= 6) break;
      if (lotA.includes(uid)) continue;
      const obj = state.objects[uid];
      if (obj.kind !== 'mine' && obj.kind !== 'demeure' && obj.kind !== 'belvedere') continue;
      obj.owner = eteint;
      lotB.push(uid);
    }
    expect(lotB.length).toBeGreaterThan(5);

    /* La reddition : c'est la référence. */
    state.activePlayer = redditeur;
    const apres = applyCommand(state, { type: 'Surrender' }, world);
    expect(apres.ok, String(apres.error)).toBe(true);
    expect(lieuxTenus(apres.state, redditeur)).toEqual([]);

    /* L'extinction doit donner le même résultat sur son propre lot. */
    const suite = apres.state;
    condamner(suite, eteint);
    checkVictory(suite);
    expect(suite.players[eteint].alive).toBe(false);
    expect(lieuxTenus(suite, eteint)).toEqual([]);
  });

  it('ne touche pas aux couleurs des maisons encore en lice', () => {
    const { state } = newGame(31, 5);
    const condamne = state.turnOrder[1];
    const survivant = state.turnOrder[0];
    pavoiserPour(state, condamne, 6);
    const gardes: string[] = [];
    for (const uid of Object.keys(state.objects).sort()) {
      if (gardes.length >= 6) break;
      const obj = state.objects[uid];
      if (obj.owner !== null) continue;
      if (obj.kind !== 'mine' && obj.kind !== 'demeure' && obj.kind !== 'belvedere') continue;
      obj.owner = survivant;
      gardes.push(uid);
    }
    expect(gardes.length).toBeGreaterThan(5);

    condamner(state, condamne);
    checkVictory(state);

    expect(lieuxTenus(state, condamne)).toEqual([]);
    expect(lieuxTenus(state, survivant)).toEqual(gardes);
  });
});
