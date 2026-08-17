/**
 * Aller-retour de sérialisation, prouvé sur une **vraie** partie issue de
 * `createGame` (moteur branché par `bootstrapEngine`), pas sur un objet
 * fabriqué pour l'occasion.
 *
 * L'exigence est stricte : `hashState` doit rendre exactement la même
 * empreinte avant et après le passage par JSON. Comme `hash.ts` distingue les
 * tableaux typés des tableaux ordinaires, la moindre erreur de reconstruction
 * du brouillard se voit immédiatement.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import {
  applyCommand,
  content as engineContent,
  createGame,
  hasLinkedContent,
  hashState,
  mapPack,
  type GameSetup,
  type GameState,
  type WorldMap,
} from '@auvergne/engine';
import {
  SerializationError,
  base64ToBytes,
  bytesToBase64,
  deserializeState,
  roundTripPreservesHash,
  serializeState,
  stateHash,
  summarizeState,
  utf8Length,
  verifyStateHash,
} from './serialize.js';

const SEED = 20260816;

/**
 * `@auvergne/protocol` ne déclare que `@auvergne/engine` en dépendance : le
 * branchement du contenu réel passe donc par un import dynamique à
 * spécificateur porté par une variable, exactement comme le fait déjà
 * `packages/content/src/integration.test.ts`. Cela évite un cycle de paquets
 * sans jamais toucher aux implémentations de repli du moteur.
 */
interface GameModule {
  bootstrapEngine(force?: boolean): void;
  isBootstrapped(): boolean;
}

let CONTENT_VERSION = '';
let MAP_VERSION = '';

function setupFor(players: 2 | 3 | 4 | 5): GameSetup {
  const all: GameSetup['players'] = [
    {
      id: 'P1',
      name: 'Châtellenie de Granit',
      faction: 'granit',
      kind: 'humain',
      start: 'arconsat',
      hero: 'thibaut',
    },
    {
      id: 'P2',
      name: 'Ermitage des Bois Noirs',
      faction: 'ermitage',
      kind: 'ia',
      aiProfile: 'equilibre',
      start: 'renaudie',
      hero: 'agathe',
    },
    {
      id: 'P3',
      name: 'Bannière de Cervières',
      faction: 'granit',
      kind: 'ia',
      aiProfile: 'prudent',
      start: 'cervieres',
      hero: 'georges',
    },
    {
      id: 'P4',
      name: 'Futaies de Viscomtat',
      faction: 'ermitage',
      kind: 'ia',
      aiProfile: 'agressif',
      start: 'viscomtat',
      hero: 'roxane',
    },
    {
      id: 'P5',
      name: 'Pays de Noirétable',
      faction: 'granit',
      kind: 'ia',
      aiProfile: 'expert',
      start: 'noiretable',
      hero: 'paul',
    },
  ];
  return {
    seed: SEED,
    mapVersion: MAP_VERSION,
    contentVersion: CONTENT_VERSION,
    duration: 'standard',
    victory: 'couronne',
    players: all.slice(0, players),
  };
}

let world: WorldMap;

beforeAll(async () => {
  const specifier = '@auvergne/game';
  const game = (await import(/* @vite-ignore */ specifier)) as unknown as GameModule;
  game.bootstrapEngine();

  // On travaille bien sur le contenu et la carte réels, pas sur les replis.
  expect(hasLinkedContent()).toBe(true);
  CONTENT_VERSION = engineContent().CONTENT_VERSION;
  MAP_VERSION = mapPack().MAP_VERSION;

  const build = mapPack().buildWorld;
  expect(typeof build).toBe('function');
  world = (build as (seed: number) => WorldMap)(SEED);
});

function freshGame(players: 2 | 3 | 4 | 5 = 2): GameState {
  return createGame(setupFor(players), world);
}

/** Fait tourner quelques journées pour obtenir un état non trivial. */
function advanced(state: GameState, turns: number): GameState {
  let current = state;
  for (let i = 0; i < turns; i++) {
    const result = applyCommand(current, { type: 'EndTurn' }, world);
    if (!result.ok) break;
    current = result.state;
  }
  return current;
}

describe('base64 portable', () => {
  it('respecte les vecteurs de la RFC 4648', () => {
    const encoder = new TextEncoder();
    const cases: [string, string][] = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='],
      ['fooba', 'Zm9vYmE='],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [clair, code] of cases) {
      expect(bytesToBase64(encoder.encode(clair))).toBe(code);
      expect(Array.from(base64ToBytes(code))).toEqual(Array.from(encoder.encode(clair)));
    }
  });

  it('rend octet pour octet un tampon de la taille du brouillard', () => {
    const bytes = new Uint8Array(256 * 416);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 37 + (i >> 5)) & 0xff;
    const retour = base64ToBytes(bytesToBase64(bytes));
    expect(retour.length).toBe(bytes.length);
    expect(retour).toEqual(bytes);
  });

  it('refuse une chaîne base64 corrompue', () => {
    expect(() => base64ToBytes('abc€def')).toThrow(SerializationError);
  });
});

describe('serializeState / deserializeState', () => {
  it("conserve exactement le hash d'une partie neuve", () => {
    const state = freshGame(2);
    const avant = hashState(state as unknown as Record<string, unknown>);
    expect(state.hash).toBe(avant);

    const json = serializeState(state);
    expect(typeof json).toBe('string');
    const retour = deserializeState(json);

    expect(hashState(retour as unknown as Record<string, unknown>)).toBe(avant);
    expect(retour.hash).toBe(state.hash);
  });

  it('conserve le hash pour deux, trois, quatre et cinq bannières', () => {
    for (const n of [2, 3, 4, 5] as const) {
      const state = freshGame(n);
      expect(roundTripPreservesHash(state)).toBe(true);
    }
  });

  it("conserve le hash après plusieurs journées de jeu", () => {
    const state = advanced(freshGame(3), 9);
    expect(state.turn).toBeGreaterThan(1);
    const avant = stateHash(state);
    const retour = deserializeState(serializeState(state));
    expect(stateHash(retour)).toBe(avant);
    expect(retour.turn).toBe(state.turn);
  });

  it('reconstruit le brouillard en Uint8Array, valeur par valeur', () => {
    const state = advanced(freshGame(2), 3);
    const retour = deserializeState(serializeState(state));
    for (const id of state.turnOrder) {
      const avant = state.players[id].fog;
      const apres = retour.players[id].fog;
      expect(apres).toBeInstanceOf(Uint8Array);
      expect(apres.length).toBe(avant.length);
      expect(apres).toEqual(avant);
    }
  });

  it("le brouillard n'est pas rendu sous forme de tableau ordinaire", () => {
    const state = freshGame(2);
    const brut = JSON.parse(serializeState(state)) as {
      players: Record<string, { fog: unknown }>;
    };
    const fog = brut.players.P1.fog as Record<string, unknown>;
    expect(Array.isArray(fog)).toBe(false);
    expect(typeof fog['@ta']).toBe('string');
    expect(typeof fog.b).toBe('string');
  });

  it('un hash calculé sur un brouillard dégradé en tableau diffère', () => {
    const state = freshGame(2);
    const degrade = JSON.parse(
      JSON.stringify(state, (_k, v) => (v instanceof Uint8Array ? Array.from(v) : v)),
    ) as Record<string, unknown>;
    // Preuve que la balise typée est indispensable : sans elle, le hash change.
    expect(hashState(degrade)).not.toBe(state.hash);
  });

  it('préserve le générateur pseudo-aléatoire à l’identique', () => {
    const state = advanced(freshGame(2), 5);
    const retour = deserializeState(serializeState(state));
    expect(retour.rng).toEqual(state.rng);
    expect(retour.seed).toBe(state.seed);
  });

  it('préserve héros, cités, objets et sceaux', () => {
    const state = advanced(freshGame(2), 2);
    const retour = deserializeState(serializeState(state));
    expect(Object.keys(retour.heroes).sort()).toEqual(Object.keys(state.heroes).sort());
    expect(Object.keys(retour.towns).sort()).toEqual(Object.keys(state.towns).sort());
    expect(Object.keys(retour.objects).length).toBe(Object.keys(state.objects).length);
    expect(retour.seals).toEqual(state.seals);
    expect(retour.weather).toEqual(state.weather);
  });

  it('reste stable sur un double aller-retour', () => {
    const state = advanced(freshGame(2), 4);
    const un = serializeState(state);
    const deux = serializeState(deserializeState(un));
    expect(deux).toBe(un);
  });

  it('applique les mêmes commandes après rechargement, au hash près', () => {
    const depart = advanced(freshGame(2), 2);
    const recharge = deserializeState(serializeState(depart));

    const a = applyCommand(depart, { type: 'EndTurn' }, world);
    const b = applyCommand(recharge, { type: 'EndTurn' }, world);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    expect(b.state.hash).toBe(a.state.hash);
  });
});

describe('contrôles et refus', () => {
  it('refuse un JSON vide', () => {
    expect(() => deserializeState('')).toThrow(SerializationError);
    expect(() => deserializeState('   ')).toThrow(/JSON valide/);
  });

  it('refuse un JSON valide qui n’est pas un état', () => {
    expect(() => deserializeState('{"a":1}')).toThrow(/champs manquants/);
    expect(() => deserializeState('[]')).toThrow(/pas un objet/);
  });

  it('refuse un état dont le brouillard a été remplacé par un tableau', () => {
    const state = freshGame(2);
    const json = JSON.stringify(state, (_k, v) => (v instanceof Uint8Array ? [] : v));
    expect(() => deserializeState(json)).toThrow(/brouillard/);
  });

  it('refuse un générateur pseudo-aléatoire corrompu', () => {
    const state = freshGame(2);
    const brut = JSON.parse(serializeState(state)) as Record<string, unknown>;
    (brut.rng as Record<string, unknown>).lo = 'zut';
    expect(() => deserializeState(JSON.stringify(brut))).toThrow(/pseudo-aléatoire/);
  });

  it('refuse un tableau binaire tronqué', () => {
    const state = freshGame(2);
    const brut = JSON.parse(serializeState(state)) as {
      players: Record<string, { fog: { n: number } }>;
    };
    brut.players.P1.fog.n = 12;
    expect(() => deserializeState(JSON.stringify(brut))).toThrow(/tronqué/);
  });

  it('refuse une valeur numérique non finie', () => {
    const state = freshGame(2) as unknown as Record<string, unknown>;
    state.turn = Number.POSITIVE_INFINITY;
    expect(() => serializeState(state as unknown as GameState)).toThrow(/non finie/);
  });
});

describe('utilitaires', () => {
  it('vérifie un hash annoncé', () => {
    const state = freshGame(2);
    const bon = verifyStateHash(state, state.hash);
    expect(bon.ok).toBe(true);
    expect(bon.actual).toBe(state.hash);

    const mauvais = verifyStateHash(state, '0000000000000000');
    expect(mauvais.ok).toBe(false);
    expect(mauvais.expected).toBe('0000000000000000');
  });

  it('résume un état pour la liste des emplacements', () => {
    const state = advanced(freshGame(3), 7);
    const resume = summarizeState(state);
    expect(resume.turn).toBe(state.turn);
    expect(resume.week).toBe(Math.floor((state.turn - 1) / 7) + 1);
    expect(resume.day).toBe(((state.turn - 1) % 7) + 1);
    expect(resume.players).toHaveLength(3);
    expect(resume.players[0].name.length).toBeGreaterThan(0);
    expect(resume.hash).toBe(state.hash);
  });

  it("compte les octets UTF-8 comme le fait Node", () => {
    for (const texte of ['', 'abc', 'Notre-Dame de l’Hermitage', 'Cervières · 880 m', '🏰']) {
      expect(utf8Length(texte)).toBe(new TextEncoder().encode(texte).length);
    }
  });

  it("la sauvegarde d'une partie à cinq reste très en deçà des 24 Mo", () => {
    const json = serializeState(freshGame(5));
    expect(utf8Length(json)).toBeLessThan(24 * 1024 * 1024);
  });
});
