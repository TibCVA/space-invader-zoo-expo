/**
 * Sonde de diagnostic — suit une bannière tour par tour dans une vraie partie.
 *
 * Elle imprime, pour le siège surveillé, le nombre de commandes retenues, le
 * nombre de refus, l'objectif du jour et les premiers motifs de refus. Une
 * bannière qui plafonne au budget de refus tour après tour est paralysée : ce
 * fichier sert à voir à quel jour et sur quelle commande cela commence.
 *
 * Usage : tsx src/_trace.ts <siège 1..5> [graine] [joueurs] [jours]
 */
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { applyCommand, createGame, type GameState, type WorldMap } from '@auvergne/engine';
import { runBotTurn, resetBotMemory, explainTurn } from '@auvergne/bots';

import { buildSetup, DEFAULT_OPTIONS } from './simulate.js';

function main(): void {
  const seat = Math.max(1, Number(process.argv[2] ?? 3));
  const seed = Number(process.argv[3] ?? 1);
  const players = Number(process.argv[4] ?? 4);
  const days = Number(process.argv[5] ?? 40);

  bootstrapEngine();
  resetBotMemory();
  const world: WorldMap = buildWorld(seed);
  const setup = buildSetup({
    ...DEFAULT_OPTIONS,
    seed,
    players,
    profiles: ['expert', 'equilibre', 'agressif', 'prudent'],
    duration: 'standard',
    rotation: 0,
  });
  let state: GameState = createGame(setup, world);
  const watched = setup.players[seat - 1];
  process.stdout.write(
    `Surveillé : ${watched.id} ${watched.aiProfile} ${watched.faction} ${watched.start}\n\n`,
  );

  for (let guard = 0; guard < 900 && state.phase !== 'termine' && state.turn <= days; guard++) {
    const before = state.turn;
    const player = state.activePlayer;
    const why = player === watched.id ? explainTurn(state, world, player) : null;
    const turn = runBotTurn(state, world, player);
    for (const command of turn.commands) {
      const result = applyCommand(state, command, world);
      if (result.ok) state = result.state;
    }
    if (player === watched.id) {
      const hero = state.players[player].heroes
        .map((uid) => state.heroes[uid])
        .filter((h) => h)
        .map((h) => `${h.uid}@${h.at.col},${h.at.row} pm${h.movement}/${h.movementMax}`)
        .join(' ');
      const moves = turn.commands.filter((c) => c.type === 'MoveHero').length;
      process.stdout.write(
        `J${String(before).padStart(3)} ${turn.plan.objective.padEnd(14)} ` +
          `cmd ${String(turn.commands.length).padStart(3)} (dépl ${String(moves).padStart(2)}) ` +
          `refus ${String(turn.refusals).padStart(2)}  ${hero}\n`,
      );
      if (why) {
        const top = why.targets
          .slice(0, 3)
          .map((t) => `${t.kind}@${t.at.col},${t.at.row}=${Math.round(t.score)}`)
          .join('  ');
        process.stdout.write(`        cibles ${top}\n`);
      }
      if (turn.refusals > 0) {
        const seen = new Map<string, number>();
        for (const r of turn.refused) {
          const key = `${r.command.type} : ${r.error}`;
          seen.set(key, (seen.get(key) ?? 0) + 1);
        }
        for (const [key, n] of seen) process.stdout.write(`        ×${n} ${key}\n`);
      }
    }
    if (state.turn === before && state.activePlayer === player) {
      const forced = applyCommand(state, { type: 'EndTurn' }, world);
      if (!forced.ok) break;
      state = forced.state;
    }
  }
}

main();
