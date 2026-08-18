/**
 * Harnais de simulation — parties complètes IA contre IA.
 *
 * Ce fichier joue des parties entières, du premier jour à la proclamation ou
 * à la fin de la chronique, sans le moindre joueur humain. Il sert deux
 * usages :
 *
 *  - en ligne de commande (`pnpm sim`), il produit un rapport JSON sur une
 *    graine donnée ;
 *  - importé (`simulateGame`, `simulateSeries`), il alimente `balance.ts` et
 *    les tests du paquet `@auvergne/bots`.
 *
 * Deux exigences gouvernent l'écriture :
 *
 *  1. **Vérification.** Par défaut, chaque commande rendue par `planTurn` est
 *     rejouée contre `applyCommand` sur l'état réel — pas sur le clone du
 *     planificateur. Une seule commande refusée est une anomalie, comptée et
 *     rapportée. C'est ce qui donne son sens à la garantie « aucune commande
 *     invalide » du paquet d'IA.
 *  2. **Déterminisme.** Aucun `Math.random`, aucune horloge dans la décision.
 *     Les durées mesurées sont rapportées mais n'influencent rien : deux
 *     exécutions de la même graine produisent le même `hash` final.
 */
import { bootstrapEngine } from '@auvergne/game';
import { START_SETS, buildWorld, type StartKey } from '@auvergne/map';
import { FACTIONS, HEROES } from '@auvergne/content';
import {
  applyCommand,
  armyPower,
  createGame,
  weekOf,
  type BuildingId,
  type FactionId,
  type GameEvent,
  type GameSetup,
  type GameState,
  type HeroId,
  type PlayerId,
  type SealId,
  type WorldMap,
} from '@auvergne/engine';
import { BOT_PROFILE_IDS, resetBotMemory, runBotTurn, type BotProfileId } from '@auvergne/bots';

import { renderSeries, renderGame } from './report.js';

/* ── Types du rapport ────────────────────────────────────────────────────── */

export type Duration = 'eclair' | 'standard' | 'saga';
export type VictoryKind = 'couronne' | 'derniere_banniere' | 'maitre_marches' | 'chronique';

/** Ce qu'une bannière laisse derrière elle à la fin de la partie. */
export interface BannerOutcome {
  id: PlayerId;
  name: string;
  profile: BotProfileId;
  faction: FactionId;
  start: StartKey;
  hero: HeroId;
  /** rang dans l'ordre du tour, 1 = premier à jouer */
  seat: number;
  alive: boolean;
  towns: number;
  mines: number;
  seals: number;
  buildings: number;
  /** puissance cumulée des héros et des garnisons */
  power: number;
  /** niveau du héros le plus avancé */
  heroLevel: number;
  /** cases sorties du brouillard */
  explored: number;
  /** trois premières constructions, dans l'ordre */
  opening: BuildingId[];
  /** combats livrés */
  battles: number;
}

/** Chronométrage de la réflexion de l'IA, en millisecondes. */
export interface ThinkTiming {
  turns: number;
  totalMs: number;
  maxMs: number;
  /** pire tour des trois premières semaines */
  earlyMaxMs: number;
  /** pire tour à partir de la huitième semaine */
  lateMaxMs: number;
}

export interface GameOutcome {
  seed: number;
  players: number;
  duration: Duration;
  victory: VictoryKind;
  winner: PlayerId | null;
  /** profil du vainqueur, `null` si la partie s'achève sans vainqueur */
  winnerProfile: BotProfileId | null;
  reason: string;
  turns: number;
  weeks: number;
  banners: BannerOutcome[];
  /** premier Sceau des Marches levé de la partie */
  firstSeal: { turn: number; player: PlayerId; seal: SealId } | null;
  /** commandes refusées au rejeu : doit valoir zéro */
  invalidCommands: number;
  /** commandes refusées, détaillées, pour le diagnostic */
  invalidDetail: string[];
  /** la partie s'est arrêtée faute de progrès */
  stalled: boolean;
  elapsedMs: number;
  think: ThinkTiming;
  hash: string;
}

export interface SeriesOutcome {
  label: string;
  seeds: number[];
  players: number;
  duration: Duration;
  victory: VictoryKind;
  profiles: BotProfileId[];
  games: GameOutcome[];
  elapsedMs: number;
}

/* ── Composition d'une partie ────────────────────────────────────────────── */

/** Héros disponibles par faction, triés — le choix reste déterministe. */
const HEROES_BY_FACTION: Readonly<Record<FactionId, HeroId[]>> = (() => {
  const out: Record<string, HeroId[]> = { granit: [], ermitage: [] };
  for (const id of Object.keys(HEROES).sort()) {
    const faction = HEROES[id].faction;
    if (faction === 'granit' || faction === 'ermitage') out[faction].push(id);
  }
  return Object.freeze(out) as Readonly<Record<FactionId, HeroId[]>>;
})();

const PLAYER_IDS: readonly PlayerId[] = ['P1', 'P2', 'P3', 'P4', 'P5'];

export interface GameOptions {
  seed: number;
  players: number;
  /** profils affectés dans l'ordre des sièges, répétés si la liste est courte */
  profiles: readonly BotProfileId[];
  duration: Duration;
  victory: VictoryKind;
  /** décalage des sièges : sert à faire tourner les positions entre parties */
  rotation: number;
  /** ne pas rejouer les commandes sur l'état réel (deux fois plus rapide) */
  fast: boolean;
  /** garde-fou : nombre maximal de tours joués */
  maxTurns: number;
}

export const DEFAULT_OPTIONS: GameOptions = {
  seed: 1,
  players: 2,
  profiles: ['expert', 'prudent'],
  duration: 'standard',
  victory: 'couronne',
  rotation: 0,
  fast: false,
  maxTurns: 900,
};

/**
 * Compose la mise en place d'une partie.
 *
 * La `rotation` fait tourner à la fois les départs, les factions et les
 * profils autour de la table. Sans elle, une série entière mesurerait
 * toujours « le profil expert assis à Arconsat » : impossible de démêler la
 * force du profil de celle de la position.
 */
export function buildSetup(options: GameOptions): GameSetup {
  const count = Math.max(2, Math.min(5, options.players));
  const sets = START_SETS[count as 2 | 3 | 4 | 5];
  const set = sets[Math.abs(options.rotation) % sets.length];
  const profiles = options.profiles.length > 0 ? options.profiles : DEFAULT_OPTIONS.profiles;

  const players: GameSetup['players'] = [];
  for (let seat = 0; seat < count; seat++) {
    const start = set[(seat + options.rotation) % count];
    const faction: FactionId = (seat + options.rotation) % 2 === 0 ? 'granit' : 'ermitage';
    const profile = profiles[(seat + options.rotation) % profiles.length];
    const pool = HEROES_BY_FACTION[faction];
    const hero = pool[(seat + options.rotation) % pool.length];
    players.push({
      id: PLAYER_IDS[seat],
      name: `${FACTIONS[faction].name} ${seat + 1}`,
      faction,
      kind: 'ia',
      aiProfile: profile,
      start,
      hero,
    });
  }

  return {
    seed: options.seed,
    mapVersion: '',
    contentVersion: '',
    duration: options.duration,
    victory: options.victory,
    players,
  };
}

/* ── Déroulé d'une partie ────────────────────────────────────────────────── */

interface Tally {
  opening: Map<PlayerId, BuildingId[]>;
  battles: Map<PlayerId, number>;
  firstSeal: { turn: number; player: PlayerId; seal: SealId } | null;
}

function collect(tally: Tally, state: GameState, events: readonly GameEvent[]): void {
  for (const event of events) {
    switch (event.type) {
      case 'BuildingBuilt': {
        const town = state.towns[event.town];
        const owner = town ? town.owner : null;
        if (!owner) break;
        const list = tally.opening.get(owner) ?? [];
        if (list.length < 3) {
          list.push(event.building);
          tally.opening.set(owner, list);
        }
        break;
      }
      case 'CombatStarted':
        tally.battles.set(state.activePlayer, (tally.battles.get(state.activePlayer) ?? 0) + 1);
        break;
      case 'SealTaken':
        if (!tally.firstSeal) {
          tally.firstSeal = { turn: state.turn, player: event.by, seal: event.seal };
        }
        break;
      default:
        break;
    }
  }
}

/** Joue une partie complète et rend son rapport. */
export function simulateGame(partial: Partial<GameOptions> = {}): GameOutcome {
  const options: GameOptions = { ...DEFAULT_OPTIONS, ...partial };
  bootstrapEngine();
  resetBotMemory();

  const world: WorldMap = buildWorld(options.seed);
  const setup = buildSetup(options);
  let state = createGame(setup, world);

  const tally: Tally = { opening: new Map(), battles: new Map(), firstSeal: null };
  const think: ThinkTiming = { turns: 0, totalMs: 0, maxMs: 0, earlyMaxMs: 0, lateMaxMs: 0 };
  const invalidDetail: string[] = [];
  let invalidCommands = 0;
  let stalled = false;

  const started = now();

  for (let guard = 0; guard < options.maxTurns; guard++) {
    if (state.phase === 'termine') break;

    const player = state.activePlayer;
    const turnBefore = state.turn;
    const week = weekOf(state.turn);

    const think0 = now();
    const planned = runBotTurn(state, world, player);
    const thinkMs = now() - think0;

    think.turns++;
    think.totalMs += thinkMs;
    if (thinkMs > think.maxMs) think.maxMs = thinkMs;
    if (week <= 3 && thinkMs > think.earlyMaxMs) think.earlyMaxMs = thinkMs;
    if (week >= 8 && thinkMs > think.lateMaxMs) think.lateMaxMs = thinkMs;

    if (options.fast) {
      collect(tally, state, planned.events);
      state = planned.state;
    } else {
      for (const command of planned.commands) {
        const result = applyCommand(state, command, world);
        if (!result.ok) {
          invalidCommands++;
          if (invalidDetail.length < 20) {
            invalidDetail.push(`${player} T${state.turn} ${command.type} : ${result.error ?? '?'}`);
          }
          continue;
        }
        collect(tally, state, result.events);
        state = result.state;
      }
    }

    if (state.phase === 'termine') break;

    // Garde-fou : une bannière qui n'arrive pas à clore son tour bloquerait la
    // partie pour tout le monde. On tourne la page à sa place et on le note.
    if (state.turn === turnBefore && state.activePlayer === player) {
      const forced = applyCommand(state, { type: 'EndTurn' }, world);
      if (!forced.ok) {
        stalled = true;
        break;
      }
      collect(tally, state, forced.events);
      state = forced.state;
      if (state.turn === turnBefore && state.activePlayer === player) {
        stalled = true;
        break;
      }
    }
  }

  const elapsedMs = now() - started;

  const banners: BannerOutcome[] = setup.players.map((entry, seat) => {
    const p = state.players[entry.id];
    let power = 0;
    let heroLevel = 0;
    for (const uid of p.heroes) {
      const hero = state.heroes[uid];
      if (!hero) continue;
      power += armyPower(hero.army);
      if (hero.level > heroLevel) heroLevel = hero.level;
    }
    let buildings = 0;
    for (const uid of p.towns) {
      const town = state.towns[uid];
      if (town) buildings += town.built.length;
    }
    let mines = 0;
    for (const uid of Object.keys(state.objects)) {
      const obj = state.objects[uid];
      if (obj.kind === 'mine' && obj.owner === entry.id) mines++;
    }
    for (const uid of p.towns) {
      const town = state.towns[uid];
      if (town) power += armyPower(town.garrison);
    }
    let explored = 0;
    for (let i = 0; i < p.fog.length; i++) if (p.fog[i] !== 0) explored++;

    return {
      id: entry.id,
      name: entry.name,
      profile: (entry.aiProfile ?? 'equilibre') as BotProfileId,
      faction: entry.faction,
      start: entry.start as StartKey,
      hero: entry.hero,
      seat: seat + 1,
      alive: p.alive,
      towns: p.towns.length,
      mines,
      seals: p.seals.length,
      buildings,
      power,
      heroLevel,
      explored,
      opening: tally.opening.get(entry.id) ?? [],
      battles: tally.battles.get(entry.id) ?? 0,
    };
  });

  const winnerBanner = banners.find((b) => b.id === state.winner) ?? null;

  return {
    seed: options.seed,
    players: setup.players.length,
    duration: options.duration,
    victory: options.victory,
    winner: state.winner,
    winnerProfile: winnerBanner ? winnerBanner.profile : null,
    reason: state.endReason ?? 'Partie interrompue.',
    turns: state.turn,
    weeks: weekOf(state.turn),
    banners,
    firstSeal: tally.firstSeal,
    invalidCommands,
    invalidDetail,
    stalled,
    elapsedMs,
    think,
    hash: state.hash,
  };
}

/** Joue une série de parties sur des graines successives. */
export function simulateSeries(
  partial: Partial<GameOptions> & { games?: number; label?: string } = {},
): SeriesOutcome {
  const games = Math.max(1, partial.games ?? 10);
  const base: GameOptions = { ...DEFAULT_OPTIONS, ...partial };
  const started = now();
  const outcomes: GameOutcome[] = [];
  const seeds: number[] = [];

  for (let i = 0; i < games; i++) {
    const seed = base.seed + i * 7919;
    seeds.push(seed);
    outcomes.push(simulateGame({ ...base, seed, rotation: i }));
  }

  return {
    label: partial.label ?? 'série',
    seeds,
    players: base.players,
    duration: base.duration,
    victory: base.victory,
    profiles: base.profiles.slice(),
    games: outcomes,
    elapsedMs: now() - started,
  };
}

/* ── Utilitaires ─────────────────────────────────────────────────────────── */

function now(): number {
  return Number(process.hrtime.bigint() / 1000n) / 1000;
}

/* ── Ligne de commande ───────────────────────────────────────────────────── */

interface CliOptions extends GameOptions {
  games: number;
  out: string | null;
  json: boolean;
  quiet: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const cli: CliOptions = {
    ...DEFAULT_OPTIONS,
    profiles: ['expert', 'equilibre', 'agressif', 'prudent'],
    games: 4,
    out: null,
    json: false,
    quiet: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    switch (arg) {
      case '--parties':
      case '--games':
        cli.games = Math.max(1, Number(value) | 0);
        i++;
        break;
      case '--graine':
      case '--seed':
        cli.seed = Number(value) | 0;
        i++;
        break;
      case '--joueurs':
      case '--players':
        cli.players = Math.max(2, Math.min(5, Number(value) | 0));
        i++;
        break;
      case '--profils':
      case '--profiles':
        cli.profiles = String(value ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter((s): s is BotProfileId =>
            (BOT_PROFILE_IDS as readonly string[]).includes(s),
          );
        i++;
        break;
      case '--duree':
      case '--duration':
        if (value === 'eclair' || value === 'standard' || value === 'saga') cli.duration = value;
        i++;
        break;
      case '--victoire':
      case '--victory':
        if (
          value === 'couronne' ||
          value === 'derniere_banniere' ||
          value === 'maitre_marches' ||
          value === 'chronique'
        ) {
          cli.victory = value;
        }
        i++;
        break;
      case '--sortie':
      case '--out':
        cli.out = value ?? null;
        i++;
        break;
      case '--rapide':
      case '--fast':
        cli.fast = true;
        break;
      case '--json':
        cli.json = true;
        break;
      case '--silencieux':
      case '--quiet':
        cli.quiet = true;
        break;
      case '--aide':
      case '--help':
        printUsage();
        process.exit(0);
        break;
      default:
        break;
    }
  }
  if (cli.profiles.length === 0) cli.profiles = ['expert', 'equilibre', 'agressif', 'prudent'];
  return cli;
}

function printUsage(): void {
  process.stdout.write(
    [
      'Usage : pnpm sim [options]',
      '',
      '  --parties N       nombre de parties à jouer (défaut 4)',
      '  --graine N        graine de la première partie (défaut 1)',
      '  --joueurs N       nombre de bannières, 2 à 5 (défaut 2)',
      '  --profils a,b     profils affectés aux sièges (défaut les quatre)',
      '  --duree D         eclair | standard | saga',
      '  --victoire V      couronne | derniere_banniere | maitre_marches | chronique',
      '  --sortie F        écrit le rapport JSON dans le fichier F',
      '  --rapide          ne rejoue pas les commandes (deux fois plus rapide)',
      '  --json            écrit le JSON sur la sortie standard',
      '  --silencieux      n’affiche que le résumé final',
      '',
    ].join('\n'),
  );
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));

  if (!cli.quiet && !cli.json) {
    process.stdout.write(
      `Simulation : ${cli.games} partie(s), ${cli.players} bannières, graine ${cli.seed}, ` +
        `profils ${cli.profiles.join(', ')}.\n\n`,
    );
  }

  const series: SeriesOutcome = {
    label: `${cli.games} partie(s) à ${cli.players}`,
    seeds: [],
    players: cli.players,
    duration: cli.duration,
    victory: cli.victory,
    profiles: cli.profiles.slice(),
    games: [],
    elapsedMs: 0,
  };

  const started = now();
  for (let i = 0; i < cli.games; i++) {
    const seed = cli.seed + i * 7919;
    series.seeds.push(seed);
    const outcome = simulateGame({ ...cli, seed, rotation: i });
    series.games.push(outcome);
    if (!cli.quiet && !cli.json) process.stdout.write(renderGame(outcome, i + 1));
  }
  series.elapsedMs = now() - started;

  if (cli.json) {
    process.stdout.write(`${JSON.stringify(series, null, 2)}\n`);
  } else {
    process.stdout.write(renderSeries(series));
  }

  if (cli.out) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(cli.out, `${JSON.stringify(series, null, 2)}\n`, 'utf8');
    if (!cli.json) process.stdout.write(`\nRapport JSON écrit dans ${cli.out}\n`);
  }

  const broken = series.games.reduce((n, g) => n + g.invalidCommands, 0);
  process.exitCode = broken > 0 ? 1 : 0;
}

if (isEntryPoint()) {
  void main();
}

/** Vrai si ce module est le point d'entrée du processus. */
function isEntryPoint(): boolean {
  const entry = process.argv[1] ?? '';
  return entry.endsWith('simulate.ts') || entry.endsWith('simulate.js');
}
