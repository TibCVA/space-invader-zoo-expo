/**
 * Garanties du contrat public de `@auvergne/bots`.
 *
 * Quatre propriétés sont vérifiées ici, dans l'ordre où elles comptent :
 *
 *  1. le baril expose bien ce que `docs/02-API.md` impose ;
 *  2. `planTurn` ne rend **jamais** une commande que le moteur refuse ;
 *  3. le plan est **déterministe** — même état, même suite de commandes ;
 *  4. l'IA ne **triche pas** : altérer ce que le brouillard cache ne change
 *     rien à ses décisions.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { bootstrapEngine } from '@auvergne/game';
import { START_SETS, buildWorld } from '@auvergne/map';
import {
  applyCommand,
  cloneState,
  createGame,
  type GameSetup,
  type GameState,
  type PlayerId,
  type WorldMap,
} from '@auvergne/engine';

import {
  BOT_PROFILES,
  BOT_PROFILE_IDS,
  botProfile,
  nextBotCommand,
  perceive,
  planTurn,
  resetBotMemory,
} from './index.js';

bootstrapEngine();

/* ── Fabrique de parties ─────────────────────────────────────────────────── */

const SEED = 20250817;

function setupFor(players: number, seed = SEED): GameSetup {
  const starts = START_SETS[players as 2 | 3 | 4 | 5][0];
  const ids: PlayerId[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
  const granit = ['paul', 'thibaut', 'loic', 'matthieu', 'clotilde'];
  const ermitage = ['agathe', 'roxane', 'alice', 'ines', 'lise'];
  const profiles = BOT_PROFILE_IDS;
  return {
    seed,
    mapVersion: '',
    contentVersion: '',
    duration: 'standard',
    victory: 'couronne',
    players: Array.from({ length: players }, (_, i) => ({
      id: ids[i],
      name: `Bannière ${i + 1}`,
      faction: (i % 2 === 0 ? 'granit' : 'ermitage') as 'granit' | 'ermitage',
      kind: 'ia' as const,
      aiProfile: profiles[i % profiles.length],
      start: starts[i],
      hero: i % 2 === 0 ? granit[i % granit.length] : ermitage[i % ermitage.length],
    })),
  };
}

function freshGame(players = 2, seed = SEED): { state: GameState; world: WorldMap } {
  resetBotMemory();
  const world = buildWorld(seed);
  return { state: createGame(setupFor(players, seed), world), world };
}

/** Avance la partie de `turns` tours en jouant l'IA, sans rien vérifier. */
function advance(state: GameState, world: WorldMap, turns: number): GameState {
  let current = state;
  for (let i = 0; i < turns && current.phase !== 'termine'; i++) {
    const player = current.activePlayer;
    const before = current.turn;
    for (const command of planTurn(current, world, player)) {
      const result = applyCommand(current, command, world);
      if (result.ok) current = result.state;
    }
    if (current.turn === before && current.activePlayer === player) {
      const forced = applyCommand(current, { type: 'EndTurn' }, world);
      if (!forced.ok) break;
      current = forced.state;
    }
  }
  return current;
}

/** Retire commentaires de bloc et de ligne, pour ne juger que le code. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
}

/* ── 1. Contrat public ───────────────────────────────────────────────────── */

describe('contrat public', () => {
  it('expose les quatre profils imposés par docs/02-API.md', () => {
    expect(BOT_PROFILE_IDS).toEqual(['prudent', 'equilibre', 'agressif', 'expert']);
    for (const id of BOT_PROFILE_IDS) {
      const profile = BOT_PROFILES[id];
      expect(profile.id).toBe(id);
      expect(typeof profile.name).toBe('string');
      expect(profile.name.length).toBeGreaterThan(0);
    }
  });

  it('retombe sur le profil équilibré pour un identifiant inconnu', () => {
    expect(botProfile('inconnu').id).toBe('equilibre');
    expect(botProfile(undefined).id).toBe('equilibre');
    expect(botProfile(null).id).toBe('equilibre');
  });

  it('nextBotCommand rend la première commande du plan puis suit le plan', () => {
    const { state, world } = freshGame(2);
    const plan = planTurn(state, world, state.activePlayer);
    expect(plan.length).toBeGreaterThan(0);

    const first = nextBotCommand(state, world, state.activePlayer);
    expect(first).toEqual(plan[0]);

    // En rejouant coup par coup, chaque état intermédiaire retrouve sa place.
    let current = state;
    for (let i = 0; i < plan.length; i++) {
      const command = nextBotCommand(current, world, state.activePlayer);
      expect(command).not.toBeNull();
      const result = applyCommand(current, command!, world);
      expect(result.ok).toBe(true);
      current = result.state;
      if (current.activePlayer !== state.activePlayer) break;
    }
  });

  it('ne rend aucune commande pour une bannière éliminée', () => {
    const { state, world } = freshGame(2);
    const dead = cloneState(state);
    dead.players.P2.alive = false;
    expect(planTurn(dead, world, 'P2')).toEqual([]);
  });
});

/* ── 2. Aucune commande invalide ─────────────────────────────────────────── */

describe('validité des commandes', () => {
  it('chaque commande d’un tour est acceptée par applyCommand, à 2 puis à 5', () => {
    for (const players of [2, 5]) {
      const { state, world } = freshGame(players);
      let current = state;
      let emitted = 0;

      for (let turn = 0; turn < 40 && current.phase !== 'termine'; turn++) {
        const player = current.activePlayer;
        const before = current.turn;
        const commands = planTurn(current, world, player);

        for (const command of commands) {
          const result = applyCommand(current, command, world);
          expect(
            result.ok,
            `commande refusée à ${player} T${current.turn} : ` +
              `${command.type} — ${result.error ?? 'sans motif'}`,
          ).toBe(true);
          current = result.state;
          emitted++;
        }

        if (current.turn === before && current.activePlayer === player) {
          const forced = applyCommand(current, { type: 'EndTurn' }, world);
          if (!forced.ok) break;
          current = forced.state;
        }
      }
      expect(emitted).toBeGreaterThan(20);
    }
  }, 120_000);

  it('reste valide en milieu de partie, quand la carte s’est ouverte', () => {
    const { state, world } = freshGame(3);
    let current = advance(state, world, 90);

    for (let turn = 0; turn < 15 && current.phase !== 'termine'; turn++) {
      const player = current.activePlayer;
      const before = current.turn;
      for (const command of planTurn(current, world, player)) {
        const result = applyCommand(current, command, world);
        expect(result.ok, `${command.type} — ${result.error ?? ''}`).toBe(true);
        current = result.state;
      }
      if (current.turn === before && current.activePlayer === player) {
        const forced = applyCommand(current, { type: 'EndTurn' }, world);
        if (!forced.ok) break;
        current = forced.state;
      }
    }
  }, 120_000);
});

/* ── 3. Déterminisme et absence de Math.random ───────────────────────────── */

describe('déterminisme', () => {
  it('rend deux fois la même suite de commandes pour le même état', () => {
    const { state, world } = freshGame(3);
    const current = advance(state, world, 24);

    resetBotMemory();
    const first = planTurn(current, world, current.activePlayer);
    resetBotMemory();
    const second = planTurn(current, world, current.activePlayer);

    expect(second).toEqual(first);
  }, 60_000);

  it('ne fait jamais avancer le générateur de la partie', () => {
    const { state, world } = freshGame(2);
    const current = advance(state, world, 12);
    const before = { ...current.rng };
    const hashBefore = current.hash;

    resetBotMemory();
    planTurn(current, world, current.activePlayer);

    expect(current.rng).toEqual(before);
    expect(current.hash).toBe(hashBefore);
  }, 60_000);

  it('aucune source du paquet n’appelle Math.random', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const files = readdirSync(here).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      // Les commentaires ont le droit de nommer l'interdit : c'est le code
      // qui est jugé, pas la prose qui l'explique.
      const code = stripComments(readFileSync(join(here, file), 'utf8'));
      expect(/Math\s*\.\s*random/.test(code), `${file} appelle Math.random`).toBe(false);
    }
  });
});

/* ── 4. L’IA ne triche pas ───────────────────────────────────────────────── */

/**
 * Altère tout ce que le brouillard du joueur cache : armées adverses hors de
 * vue, trésoreries, gardes des lieux non explorés, offres d'auberge. Rien de
 * ce qui est modifié ici n'est légitimement lisible par `player`.
 */
function corruptHidden(state: GameState, world: WorldMap, player: PlayerId): GameState {
  const shadow = cloneState(state);
  const fog = shadow.players[player].fog;
  const visible = (col: number, row: number): number => fog[row * world.cols + col] | 0;

  for (const uid of Object.keys(shadow.heroes)) {
    const hero = shadow.heroes[uid];
    if (hero.owner === player) continue;
    // Un héros sous nos yeux est une information légitime : on n'y touche pas.
    if (visible(hero.at.col, hero.at.row) === 2) continue;
    for (const stack of hero.army) {
      if (stack) stack.count = stack.count * 7 + 13;
    }
    hero.level += 9;
    hero.xp += 99999;
    hero.mana = 0;
  }

  for (const id of Object.keys(shadow.players) as PlayerId[]) {
    if (id === player) continue;
    const other = shadow.players[id];
    other.resources = {
      ecus: 999999,
      bois: 4242,
      granit: 4242,
      fer: 4242,
      sel: 4242,
      essence: 4242,
      filDor: 4242,
    };
    other.reputation = -777;
    other.tavernOffers = [];
    other.buildQueue = [];
  }

  for (const uid of Object.keys(shadow.objects)) {
    const obj = shadow.objects[uid];
    if (visible(obj.entrance.col, obj.entrance.row) >= 1) continue;
    if (obj.guard) for (const stack of obj.guard) stack.count = stack.count * 5 + 3;
    obj.data = { ...obj.data, amount: 9999 };
  }

  for (const uid of Object.keys(shadow.towns)) {
    const town = shadow.towns[uid];
    if (town.owner === player) continue;
    if (visible(town.at.col, town.at.row) === 2) continue;
    town.garrison = [{ creature: town.garrison[0]?.creature ?? 'granit_t1', count: 4242 }, null, null, null, null, null, null];
    town.unrest = 99;
  }

  return shadow;
}

describe('loyauté : l’IA ne lit que son brouillard', () => {
  it('la perception n’expose que des entités visibles ou explorées', () => {
    const { state, world } = freshGame(3);
    const current = advance(state, world, 40);
    const player = current.activePlayer;
    const view = perceive(current, world, player);
    const fog = current.players[player].fog;

    for (const enemy of view.enemyHeroes) {
      expect(enemy.owner).not.toBe(player);
      expect(fog[enemy.at.row * world.cols + enemy.at.col]).toBe(2);
    }
    for (const place of view.places) {
      expect(fog[place.obj.entrance.row * world.cols + place.obj.entrance.col]).toBeGreaterThan(0);
    }
    /*
     * Les capitales sont publiques — chaque bannière choisit la sienne sur
     * l'écran de nouvelle partie, dans une liste de lieux nommés du Forez :
     * un joueur humain sait où elles sont avant le premier jour. Toute
     * AUTRE place doit être explorée pour figurer dans la perception. Et
     * une capitale connue sans être vue ne livre rien de son intérieur :
     * c'est ce que garde le test suivant, qui altère ce qui est caché.
     */
    for (const known of [...view.enemyTowns, ...view.neutralTowns]) {
      if (known.town.isCapital) continue;
      expect(
        fog[known.town.at.row * world.cols + known.town.at.col],
        `${known.town.uid} hors brouillard`,
      ).toBeGreaterThan(0);
    }
    for (const known of view.enemyTowns) {
      if (fog[known.town.at.row * world.cols + known.town.at.col] > 0) continue;
      expect(known.town.isCapital, `${known.town.uid} : place cachée exposée`).toBe(true);
      expect(known.fresh, `${known.town.uid} : garnison lue sans la voir`).toBe(false);
    }
    for (const town of view.towns) expect(town.owner).toBe(player);
    expect(view.self.id).toBe(player);
  }, 60_000);

  it('la perception est inchangée quand on altère ce qui est caché', () => {
    const { state, world } = freshGame(3);
    const current = advance(state, world, 40);
    const player = current.activePlayer;

    const honest = perceive(current, world, player);
    const shadow = corruptHidden(current, world, player);
    const tainted = perceive(shadow, world, player);

    expect(tainted.places.map((p) => p.obj.uid)).toEqual(honest.places.map((p) => p.obj.uid));
    expect(tainted.enemyHeroes.map((h) => h.uid)).toEqual(honest.enemyHeroes.map((h) => h.uid));
    expect(tainted.frontier).toEqual(honest.frontier);
    expect(tainted.explored).toBe(honest.explored);
    // Les gardes des lieux connus n'ont pas bougé non plus.
    expect(tainted.places.map((p) => JSON.stringify(p.obj.guard ?? []))).toEqual(
      honest.places.map((p) => JSON.stringify(p.obj.guard ?? [])),
    );
  }, 60_000);

  it('le plan du tour est identique quand on altère ce qui est caché', () => {
    // Deux départs éloignés : les bannières ne se voient pas encore, tout ce
    // qui concerne l'adversaire est donc entièrement caché.
    const { state, world } = freshGame(2);
    const current = advance(state, world, 30);
    const player = current.activePlayer;

    resetBotMemory();
    const honest = planTurn(current, world, player);
    const shadow = corruptHidden(current, world, player);
    resetBotMemory();
    const tainted = planTurn(shadow, world, player);

    expect(tainted).toEqual(honest);
    expect(honest.length).toBeGreaterThan(0);
  }, 90_000);
});
