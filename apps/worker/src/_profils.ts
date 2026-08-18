/**
 * Sonde de diagnostic — compare les quatre profils sur les mêmes conditions.
 *
 * Chaque profil joue en solitaire les mêmes trente premiers jours de la même
 * graine, à la même place. On compte ce qu'il fait réellement : commandes
 * émises, types de commandes, cases explorées, cité bâtie, troupes levées.
 * Deux profils qui rendent la même ligne ne se comportent pas différemment,
 * quoi qu'en disent leurs poids.
 */
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { applyCommand, createGame, type Command, type GameState, type WorldMap } from '@auvergne/engine';
import { BOT_PROFILE_IDS, runBotTurn, resetBotMemory, type BotProfileId } from '@auvergne/bots';

import { buildSetup, DEFAULT_OPTIONS } from './simulate.js';

const DAYS = 30;

function trial(profile: BotProfileId, seat: 0 | 1): string {
  bootstrapEngine();
  resetBotMemory();
  const others: BotProfileId = 'equilibre';
  const profiles: BotProfileId[] = seat === 0 ? [profile, others] : [others, profile];
  const world: WorldMap = buildWorld(1);
  const setup = buildSetup({ ...DEFAULT_OPTIONS, seed: 1, players: 2, profiles, duration: 'standard' });
  let state: GameState = createGame(setup, world);
  const me = setup.players[seat].id;

  const counts = new Map<string, number>();
  let total = 0;

  for (let guard = 0; guard < 400 && state.phase !== 'termine' && state.turn <= DAYS; guard++) {
    const before = state.turn;
    const player = state.activePlayer;
    const planned = runBotTurn(state, world, player);
    for (const command of planned.commands as Command[]) {
      const result = applyCommand(state, command, world);
      if (!result.ok) continue;
      state = result.state;
      if (player === me) {
        total++;
        counts.set(command.type, (counts.get(command.type) ?? 0) + 1);
      }
    }
    if (state.turn === before && state.activePlayer === player) {
      const forced = applyCommand(state, { type: 'EndTurn' }, world);
      if (!forced.ok) break;
      state = forced.state;
    }
  }

  const p = state.players[me];
  let explored = 0;
  for (let i = 0; i < p.fog.length; i++) if (p.fog[i] !== 0) explored++;
  let built = 0;
  for (const uid of p.towns) built += state.towns[uid]?.built.length ?? 0;
  let stacks = 0;
  let level = 0;
  for (const uid of p.heroes) {
    const h = state.heroes[uid];
    if (!h) continue;
    stacks += h.army.filter(Boolean).length;
    if (h.level > level) level = h.level;
  }
  const kinds = [...counts]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}:${n}`)
    .join(' ');
  return (
    `${profile.padEnd(10)} siège${seat + 1}  cmd ${String(total).padStart(4)}  ` +
    `exploré ${String(explored).padStart(5)}  bât ${String(built).padStart(2)}  ` +
    `piles ${stacks}  niv ${level}  héros ${p.heroes.length}  écus ${p.resources.ecus}\n` +
    `             ${kinds || '(aucune commande)'}\n`
  );
}

function main(): void {
  process.stdout.write(`Trente premiers jours, graine 1, deux bannières.\n\n`);
  for (const profile of BOT_PROFILE_IDS) {
    process.stdout.write(trial(profile, 0));
  }
  process.stdout.write('\n');
  for (const profile of BOT_PROFILE_IDS) {
    process.stdout.write(trial(profile, 1));
  }
}

main();
