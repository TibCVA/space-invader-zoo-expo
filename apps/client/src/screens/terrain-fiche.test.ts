/**
 * LE CLIC DROIT SUR L'HERBE — le geste d'information de HMM3, qui manquait.
 *
 * L'appui long au doigt et le clic droit à la souris appelaient déjà
 * `onInspect` avec `{ kind: 'case', at }` : le moteur de vue faisait sa part.
 * Mais l'écran jetait ce cas (`setCible(null)`) et `ficheDe` rendait `null`
 * pour une case nue — si bien que sur les neuf dixièmes de la carte, le geste
 * d'information ne répondait RIEN. L'épreuve de bout en bout
 * (`tools/e2e-geste-carte.mjs`) l'attendait et échouait depuis longtemps.
 *
 * La fiche dit trois choses : le nom du terrain, la région, et le COÛT DE
 * MARCHE — le renseignement qui décide d'un trajet, qui n'était affiché nulle
 * part ailleurs.
 *
 * Et elle se tait sous le voile : on n'apprend pas d'un carton ce qu'on n'a
 * pas exploré. Même équité que pour les armées adverses.
 */
import { describe, expect, it } from 'vitest';
import { createGame, type MapCoord, type WorldMap } from '@auvergne/engine';
import { buildWorld } from '@auvergne/map';
import { ficheDuTerrain, type Regard } from './estimation.js';

function monde(): WorldMap {
  return buildWorld({ seed: 7, players: 2 }) as unknown as WorldMap;
}

function regardDe(world: WorldMap, fog: Uint8Array | null): Regard {
  return { moi: 'P1', fog, cols: world.cols, heros: null };
}

/** Première case franchissable trouvée — on ne dépend d'aucune graine. */
function caseQuelconque(world: WorldMap): MapCoord {
  return { col: Math.floor(world.cols / 2), row: Math.floor(world.rows / 2) };
}

describe('la fiche d’une case nue', () => {
  const world = monde();
  const at = caseQuelconque(world);

  it('nomme le terrain, sa région, et ce qu’il coûte à traverser', () => {
    const f = ficheDuTerrain(world, at, regardDe(world, null));
    expect(f).not.toBeNull();
    expect(f?.nature).toBe('Terrain');
    /* Le nom du terrain, avec une majuscule — c'est un titre de carton. */
    expect(f?.titre).toMatch(/^[A-ZÉÈÀÇ]/);
    const notes = (f?.notes ?? []).join(' | ');
    expect(notes).toMatch(/^Dans /);
    expect(notes).toMatch(/Coûte \d+ points de marche pour y entrer\.|Infranchissable/);
  });

  it('n’invente ni bannière, ni garnison, ni difficulté', () => {
    /* Un terrain n'oppose personne : une pastille de difficulté y annoncerait
       un combat imaginaire — la faute déjà corrigée sur les gisements. */
    const f = ficheDuTerrain(world, at, regardDe(world, null));
    expect(f?.proprietaire).toBeNull();
    expect(f?.neutre).toBe(true);
    expect(f?.piles).toEqual([]);
    expect(f?.force).toBeNull();
    expect(f?.difficulte).toBeNull();
  });

  it('se tait hors de la carte', () => {
    for (const dehors of [
      { col: -1, row: 0 },
      { col: 0, row: -1 },
      { col: world.cols, row: 0 },
      { col: 0, row: world.rows },
    ]) {
      expect(ficheDuTerrain(world, dehors, regardDe(world, null))).toBeNull();
    }
  });
});

describe('l’équité du brouillard vaut aussi pour le sol', () => {
  const world = monde();
  const at = caseQuelconque(world);

  it('une case jamais explorée ne livre pas son terrain', () => {
    const fog = new Uint8Array(world.cols * world.rows); /* tout à 0 */
    expect(ficheDuTerrain(world, at, regardDe(world, fog))).toBeNull();
  });

  it('une case déjà parcourue se souvient — le voile à 1 suffit', () => {
    const fog = new Uint8Array(world.cols * world.rows);
    fog[at.row * world.cols + at.col] = 1;
    expect(ficheDuTerrain(world, at, regardDe(world, fog))).not.toBeNull();
  });

  it('sans voile connu, tout se lit : la démonstration n’a personne à protéger', () => {
    expect(ficheDuTerrain(world, at, regardDe(world, null))).not.toBeNull();
  });
});

describe('le geste reste distinct de l’action', () => {
  it('une vraie partie sert bien un voile à la fiche', () => {
    /* Garde-fou de branchement : si `createGame` cessait de poser un voile,
       la fiche de terrain deviendrait bavarde sans que rien ne le dise. */
    const jeu = createGame(
      {
        seed: 7,
        players: [
          { id: 'P1', name: 'Maison de Granit', faction: 'granit', kind: 'humain', start: 'arconsat', hero: 'thibaut' },
          {
            id: 'P2',
            name: 'Ermitage des Bois',
            faction: 'ermitage',
            kind: 'ia',
            aiProfile: 'equilibre',
            start: 'renaudie',
            hero: 'agathe',
          },
        ],
      },
      monde(),
    );
    expect(jeu.players.P1?.fog).toBeInstanceOf(Uint8Array);
  });
});
