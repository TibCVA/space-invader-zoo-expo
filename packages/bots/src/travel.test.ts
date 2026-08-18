/**
 * L'estimation de trajet ne doit jamais rendre une distance ininterprétable.
 *
 * Pourquoi ce fichier existe. `TERRAIN_COST.eau` vaut `Number.MAX_SAFE_INTEGER` :
 * c'est la bonne valeur pour le vrai calcul de chemin, qui doit refuser l'eau.
 * Mais `travelEstimate` n'est pas un chemin — c'est une règle posée en droite
 * ligne sur la carte pour classer des cibles à bon marché. Un seul échantillon
 * d'eau sur cette droite portait sa moyenne à 2 × 10¹⁴, et l'estimation d'un
 * trajet de cent cinquante cases à 4 × 10¹⁶, au-delà de `MAX_SAFE_INTEGER`.
 *
 * Conséquence observée en simulation, avant correction : `fallbackHome` ne
 * retenait aucune cité (elle exige un coût *inférieur* à cette borne), un héros
 * privé de son armée restait immobile jusqu'à la fin de la chronique, sa
 * capitale accumulait plus de vingt mille points de troupes qu'il n'irait
 * jamais chercher, et **aucune bannière ne prenait un seul gisement en huit
 * semaines**. Sur une carte du Forez, la droite entre deux points éloignés
 * frôle presque toujours un étang ou la Durolle : le défaut se déclenchait donc
 * dans la quasi-totalité des parties.
 *
 * Les trois tests ci-dessous verrouillent la propriété qui manquait.
 */
import { describe, expect, it } from 'vitest';

import { bootstrapEngine } from '@auvergne/game';
import { START_SETS, buildWorld } from '@auvergne/map';
import {
  CELL_BRIDGE,
  TERRAIN_COST,
  TERRAINS,
  createGame,
  type GameSetup,
  type WorldMap,
} from '@auvergne/engine';

import { perceive, travelEstimate } from './index.js';
import { fallbackHome } from './explore.js';

bootstrapEngine();

const GRAINE = 7;
const world: WorldMap = buildWorld(GRAINE);
const depart = (START_SETS as unknown as Record<string, string[][]>)['2'][0];

const setup = {
  seed: GRAINE,
  duration: 'eclair',
  victory: 'couronne',
  players: [
    { id: 'P1', name: 'Un', faction: 'granit', kind: 'ia', aiProfile: 'expert', hero: 'thibaut', start: depart[0] },
    { id: 'P2', name: 'Deux', faction: 'ermitage', kind: 'ia', aiProfile: 'agressif', hero: 'clotilde', start: depart[1] },
  ],
} as unknown as GameSetup;

/** Toute la carte est levée : on veut mesurer le terrain, pas le brouillard. */
function etatOmniscient(): ReturnType<typeof createGame> {
  const state = createGame(setup, world);
  state.players.P1.fog = new Uint8Array(world.cols * world.rows).fill(2);
  return state;
}

/** Index d'une case dans les tableaux plats de la carte. */
function index(col: number, row: number): number {
  return row * world.cols + col;
}

const CODE_EAU = (TERRAINS as readonly string[]).indexOf('eau');

/** Vrai si la case est de l'eau, pont ou non. */
function estEau(col: number, row: number): boolean {
  return world.terrain[index(col, row)] === CODE_EAU;
}

/**
 * Vrai si la case est un **pont** : de l'eau que l'on peut fouler.
 *
 * C'est le cas qui saturait, et lui seul. Une eau nue est infranchissable :
 * `cellCost` la barrait avant de consulter la table, et rendait un prix de
 * rocher, fini. Un pont, lui, passe le test de franchissabilité — et le code
 * lisait alors `TERRAIN_COST.eau`, c'est-à-dire `Number.MAX_SAFE_INTEGER`,
 * pour la case même par laquelle le héros devait rentrer chez lui.
 */
function estPont(col: number, row: number): boolean {
  return estEau(col, row) && ((world.flags[index(col, row)] | 0) & CELL_BRIDGE) !== 0;
}

/**
 * Rejoue l'échantillonnage de `travelEstimate` — quarante points le long de la
 * droite — et dit si l'un d'eux tombe sur un pont. Il ne suffit pas qu'un pont
 * se trouve « sur le chemin » : encore faut-il que le sondeur le voie, sinon le
 * test ne prouverait rien.
 */
function laDroiteSondeUnPont(de: { col: number; row: number }, vers: { col: number; row: number }): boolean {
  const pas = Math.max(Math.abs(vers.col - de.col), Math.abs(vers.row - de.row));
  if (pas === 0) return false;
  const echantillons = Math.min(pas, 40);
  for (let s = 1; s <= echantillons; s += 1) {
    const col = de.col + Math.trunc(((vers.col - de.col) * s) / echantillons);
    const row = de.row + Math.trunc(((vers.row - de.row) * s) / echantillons);
    if (col < 0 || row < 0 || col >= world.cols || row >= world.rows) continue;
    if (estPont(col, row)) return true;
  }
  return false;
}

/**
 * Une case d'exil dont la droite de retour vers `chezSoi` sonde bel et bien un
 * pont. On balaie la carte plutôt que de deviner : un exil pris au hasard
 * passerait la plupart du temps à côté, et le test ne prouverait rien.
 */
function exilDerriereUnPont(chezSoi: { col: number; row: number }): { col: number; row: number } | null {
  for (let row = 2; row < world.rows - 2; row += 2) {
    for (let col = 2; col < world.cols - 2; col += 2) {
      if (estEau(col, row)) continue;
      if (!laDroiteSondeUnPont({ col, row }, chezSoi)) continue;
      return { col, row };
    }
  }
  return null;
}

describe('travelEstimate', () => {
  it('reste un entier sûr, quelle que soit la paire de cases', () => {
    const state = etatOmniscient();
    /* Un balayage large : les quatre coins, le centre, et les deux capitales.
       Sur une carte de lacs et de rivières, au moins une de ces droites
       traverse de l'eau — c'est précisément le cas qui échouait. */
    const points = [
      { col: 0, row: 0 },
      { col: world.cols - 1, row: 0 },
      { col: 0, row: world.rows - 1 },
      { col: world.cols - 1, row: world.rows - 1 },
      { col: world.cols >> 1, row: world.rows >> 1 },
      ...Object.values(state.towns).map((t) => t.at),
    ];

    let maximum = 0;
    for (const a of points) {
      for (const b of points) {
        const c = travelEstimate(state, world, 'P1', a, b);
        expect(Number.isFinite(c)).toBe(true);
        expect(Number.isSafeInteger(c)).toBe(true);
        expect(c).toBeGreaterThanOrEqual(0);
        maximum = Math.max(maximum, c);
      }
    }

    /* Garde-fou d'ordre de grandeur : traverser la carte entière au prix du
       rocher triplé reste très en deçà du million. La borne échouerait
       immédiatement si une sentinelle d'eau se réintroduisait. */
    const plafond = (world.cols + world.rows) * TERRAIN_COST.rocher * 3 * 2;
    expect(maximum).toBeLessThan(plafond);
  });

  it('départage deux cités au lieu de les saturer à la même valeur', () => {
    const state = etatOmniscient();
    const villes = Object.values(state.towns).map((t) => t.at);
    const origine = villes[0];
    const distances = villes.map((v) => travelEstimate(state, world, 'P1', origine, v));
    expect(distances[0]).toBe(0);
    /* Une estimation saturée rendrait toutes les cités équivalentes ; on exige
       donc que deux destinations distinctes se départagent. */
    const distinctes = new Set(distances).size;
    expect(distinctes).toBe(distances.length);
  });

  it('laisse toujours un repli à un héros, si loin soit-il de chez lui', () => {
    const state = etatOmniscient();
    const heros = Object.values(state.heroes).find((h) => h.owner === 'P1');
    expect(heros).toBeDefined();
    if (!heros) return;

    const capitale = Object.values(state.towns).find((t) => t.owner === 'P1');
    expect(capitale).toBeDefined();
    if (!capitale) return;

    /* On l'exile de l'autre côté d'un pont : c'est la situation exacte où
       `fallbackHome` rendait `null`, et le retour au logis passe forcément par
       là. */
    const exil = exilDerriereUnPont(capitale.at);
    expect(exil).not.toBeNull();
    if (!exil) return;
    heros.at = exil;

    const vue = perceive(state, world, 'P1');
    expect(vue.towns.length).toBeGreaterThan(0);
    expect(fallbackHome(state, world, vue, heros)).not.toBeNull();
  });
});
