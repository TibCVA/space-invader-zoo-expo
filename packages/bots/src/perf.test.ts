/**
 * Budget de réflexion de l'IA.
 *
 * Le brief impose un tour d'IA sous **400 ms en début de partie** et sous
 * **1,5 s en fin de partie**. Ces bornes existent pour le confort de jeu : en
 * partie à cinq, quatre tours d'IA séparent deux tours humains, et un joueur
 * n'attend pas six secondes entre deux journées.
 *
 * Une mesure chronométrée dépend de la machine. Deux précautions rendent le
 * test utile plutôt que capricieux :
 *
 *  - on mesure la **médiane** et le **pire** tour séparément, et l'on garde
 *    une marge sur le pire : c'est le budget du brief qui est vérifié, pas la
 *    variance du ramasse-miettes ;
 *  - la décision de l'IA, elle, ne lit jamais l'horloge (les budgets internes
 *    du planificateur sont comptés en opérations), donc le plan reste le même
 *    quelle que soit la vitesse de la machine.
 */
import { describe, expect, it } from 'vitest';

import { bootstrapEngine } from '@auvergne/game';
import { START_SETS, buildWorld } from '@auvergne/map';
import {
  applyCommand,
  createGame,
  weekOf,
  type GameSetup,
  type GameState,
  type PlayerId,
  type WorldMap,
} from '@auvergne/engine';

import { BOT_PROFILE_IDS, planTurn, resetBotMemory } from './index.js';

bootstrapEngine();

/** Budget du brief, en millisecondes. */
const BUDGET_EARLY_MS = 400;
const BUDGET_LATE_MS = 1500;

function setupFive(seed: number): GameSetup {
  const starts = START_SETS[5][0];
  const ids: PlayerId[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
  const granit = ['paul', 'loic', 'clotilde'];
  const ermitage = ['agathe', 'roxane'];
  return {
    seed,
    mapVersion: '',
    contentVersion: '',
    duration: 'standard',
    victory: 'couronne',
    players: Array.from({ length: 5 }, (_, i) => ({
      id: ids[i],
      name: `Bannière ${i + 1}`,
      faction: (i % 2 === 0 ? 'granit' : 'ermitage') as 'granit' | 'ermitage',
      kind: 'ia' as const,
      aiProfile: BOT_PROFILE_IDS[i % BOT_PROFILE_IDS.length],
      start: starts[i],
      hero: i % 2 === 0 ? granit[(i / 2) | 0] : ermitage[((i - 1) / 2) | 0],
    })),
  };
}

interface Sample {
  week: number;
  ms: number;
}

function millis(): number {
  return Number(process.hrtime.bigint() / 1000n) / 1000;
}

/** Joue `turns` tours à cinq bannières en chronométrant chaque plan. */
function measure(turns: number, seed: number): Sample[] {
  resetBotMemory();
  const world: WorldMap = buildWorld(seed);
  let state: GameState = createGame(setupFive(seed), world);
  const samples: Sample[] = [];

  for (let i = 0; i < turns && state.phase !== 'termine'; i++) {
    const player = state.activePlayer;
    const before = state.turn;
    const week = weekOf(state.turn);

    const t0 = millis();
    const commands = planTurn(state, world, player);
    samples.push({ week, ms: millis() - t0 });

    for (const command of commands) {
      const result = applyCommand(state, command, world);
      if (result.ok) state = result.state;
    }
    if (state.turn === before && state.activePlayer === player) {
      const forced = applyCommand(state, { type: 'EndTurn' }, world);
      if (!forced.ok) break;
      state = forced.state;
    }
  }
  return samples;
}

/** Quantile `q` (0 à 1) d'une série, sans interpolation. */
function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(q * sorted.length));
  return sorted[index];
}

describe('budget de réflexion', () => {
  it('tient les budgets de début et de fin de partie à cinq bannières', () => {
    // Une partie « standard » dure douze semaines ; 5 × 7 × 11 = 385 tours
    // couvre largement la huitième semaine, où l'on mesure la fin de partie.
    const samples = measure(360, 424242);
    expect(samples.length).toBeGreaterThan(100);

    const early = samples.filter((s) => s.week <= 3).map((s) => s.ms);
    const late = samples.filter((s) => s.week >= 8).map((s) => s.ms);

    expect(early.length).toBeGreaterThan(20);
    expect(late.length).toBeGreaterThan(20);

    const earlyMedian = quantile(early, 0.5);
    const earlyP95 = quantile(early, 0.95);
    const earlyWorst = Math.max(...early);
    const lateMedian = quantile(late, 0.5);
    const lateP95 = quantile(late, 0.95);
    const lateWorst = Math.max(...late);

    process.stdout.write(
      `\n  réflexion IA à cinq bannières\n` +
        `    début (≤ S3) : médiane ${earlyMedian.toFixed(0)} ms · p95 ${earlyP95.toFixed(0)} ms · ` +
        `pire ${earlyWorst.toFixed(0)} ms   (budget ${BUDGET_EARLY_MS} ms)\n` +
        `    fin   (≥ S8) : médiane ${lateMedian.toFixed(0)} ms · p95 ${lateP95.toFixed(0)} ms · ` +
        `pire ${lateWorst.toFixed(0)} ms   (budget ${BUDGET_LATE_MS} ms)\n`,
    );

    // Le budget porte sur le temps de réflexion, pas sur les hoquets de la
    // machine hôte : la médiane et le p95 sont tenus au budget strict, le pire
    // tour reçoit une marge d'un quart pour absorber une pause du ramasse-
    // miettes ou un partage de cœur. Les trois valeurs sont affichées.
    expect(earlyMedian).toBeLessThan(BUDGET_EARLY_MS);
    expect(earlyP95).toBeLessThan(BUDGET_EARLY_MS);
    expect(earlyWorst).toBeLessThan(BUDGET_EARLY_MS * 1.25);

    expect(lateMedian).toBeLessThan(BUDGET_LATE_MS);
    expect(lateP95).toBeLessThan(BUDGET_LATE_MS);
    expect(lateWorst).toBeLessThan(BUDGET_LATE_MS);
  }, 300_000);

  it('le premier tour, le plus coûteux en découverte, reste sous le budget', () => {
    resetBotMemory();
    const world = buildWorld(777);
    const state = createGame(setupFive(777), world);
    const t0 = millis();
    planTurn(state, world, state.activePlayer);
    const elapsed = millis() - t0;
    expect(elapsed).toBeLessThan(BUDGET_EARLY_MS);
  }, 60_000);
});
