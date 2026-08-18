/**
 * Statistiques d'équilibrage, selon les critères du document maître §20.3.
 *
 * Le document fixe six seuils :
 *
 *  1. taux de victoire de chaque position en partie à cinq : 18 à 22 % ;
 *  2. taux de victoire des deux factions : 47 à 53 % ;
 *  3. aucun héros au-dessus de 55 % ;
 *  4. aucune construction d'ouverture dans plus de 70 % des parties gagnantes ;
 *  5. temps moyen d'accès à un premier sceau comparable à ±1 tour ;
 *  6. au moins trois routes réalistes vers la Maison du Trésor par départ.
 *
 * Les cinq premiers se mesurent ici. Le sixième relève de la carte et non de
 * la simulation ; il est signalé comme non couvert plutôt que passé sous
 * silence.
 *
 * Le document réclame dix mille parties par graine. Aucun poste de travail ne
 * joue dix mille parties complètes en un temps utile : chaque partie coûte
 * des dizaines de secondes de calcul honnête. Ce module travaille donc sur
 * l'échantillon qu'on lui donne, et **dit** de combien de parties il parle —
 * une anomalie tirée de trente parties est une piste, pas un verdict. Les
 * intervalles sont élargis en conséquence quand l'échantillon est mince :
 * signaler comme déséquilibré ce qui n'est que du bruit d'échantillonnage
 * serait pire que ne rien signaler.
 */
import {
  DEFAULT_OPTIONS,
  simulateGame,
  type Duration,
  type GameOptions,
  type GameOutcome,
  type VictoryKind,
} from './simulate.js';
import { renderBalance } from './report.js';
import { BOT_PROFILE_IDS, type BotProfileId } from '@auvergne/bots';

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface RateRow {
  label: string;
  wins: number;
  played: number;
  ratePercent: number;
  /** faux si la valeur sort de la fourchette attendue */
  withinRange: boolean;
}

export interface OpeningRow {
  building: string;
  wins: number;
  sharePercent: number;
}

export interface Anomaly {
  severity: 'alerte' | 'grave';
  subject: string;
  message: string;
}

export interface BalanceReport {
  games: number;
  players: number;
  profiles: BotProfileId[];
  seedFirst: number;
  seedLast: number;
  elapsedMs: number;

  byStart: RateRow[];
  byFaction: RateRow[];
  bySeat: RateRow[];
  byProfile: RateRow[];
  byHero: RateRow[];

  decided: number;
  meanTurns: number;
  medianTurns: number;
  minTurns: number;
  maxTurns: number;

  firstSeal: { count: number; meanTurn: number; spread: number };
  openings: OpeningRow[];
  think: { meanMs: number; earlyMaxMs: number; lateMaxMs: number };
  invalidCommands: number;
  stalled: number;

  anomalies: Anomaly[];
}

/* ── Agrégation ──────────────────────────────────────────────────────────── */

interface Bucket {
  wins: number;
  played: number;
}

function bucketRows(
  buckets: Map<string, Bucket>,
  low: number,
  high: number,
  minSample: number,
): RateRow[] {
  const rows: RateRow[] = [];
  for (const label of Array.from(buckets.keys()).sort()) {
    const bucket = buckets.get(label) as Bucket;
    const ratePercent = bucket.played > 0 ? Math.round((bucket.wins * 100) / bucket.played) : 0;
    // Sous le seuil d'échantillon, on ne prétend pas juger.
    const withinRange =
      bucket.played < minSample || (ratePercent >= low && ratePercent <= high);
    rows.push({ label, wins: bucket.wins, played: bucket.played, ratePercent, withinRange });
  }
  return rows;
}

/**
 * Rapporte les victoires d'un groupe au nombre de parties **décidées**, et non
 * au nombre de bannières engagées : c'est la lecture du partage des victoires,
 * la seule qui garde un sens quand un groupe aligne plusieurs bannières par
 * partie. Les parts d'un même découpage somment à cent.
 */
function shareRows(
  buckets: Map<string, Bucket>,
  decided: number,
  low: number,
  high: number,
): RateRow[] {
  const rows: RateRow[] = [];
  for (const label of Array.from(buckets.keys()).sort()) {
    const bucket = buckets.get(label) as Bucket;
    const ratePercent = decided > 0 ? Math.round((bucket.wins * 100) / decided) : 0;
    rows.push({
      label,
      wins: bucket.wins,
      played: decided,
      ratePercent,
      withinRange: decided < 8 || (ratePercent >= low && ratePercent <= high),
    });
  }
  return rows;
}

function add(buckets: Map<string, Bucket>, label: string, won: boolean): void {
  const bucket = buckets.get(label) ?? { wins: 0, played: 0 };
  bucket.played++;
  if (won) bucket.wins++;
  buckets.set(label, bucket);
}

/**
 * Marge de tolérance liée à la taille de l'échantillon.
 *
 * Sur trente parties à cinq, chaque position n'est jouée qu'une trentaine de
 * fois : l'écart-type binomial est de l'ordre de sept points. Exiger la
 * fourchette 18–22 % sur un tel échantillon reviendrait à crier au
 * déséquilibre à chaque série. On élargit donc la fourchette de deux
 * écarts-types, et le rapport annonce la taille réelle de l'échantillon.
 */
function slack(played: number, expectedPercent: number): number {
  if (played <= 0) return 100;
  const p = expectedPercent / 100;
  const sigma = Math.sqrt((p * (1 - p)) / played) * 100;
  return Math.round(2 * sigma);
}

/* ── Analyse ─────────────────────────────────────────────────────────────── */

/** Construit le rapport d'équilibrage à partir de parties déjà jouées. */
export function analyse(games: readonly GameOutcome[], elapsedMs: number): BalanceReport {
  const total = games.length;
  const players = total > 0 ? games[0].players : 0;

  const byStart = new Map<string, Bucket>();
  const byFaction = new Map<string, Bucket>();
  const bySeat = new Map<string, Bucket>();
  const byProfile = new Map<string, Bucket>();
  const byHero = new Map<string, Bucket>();
  const openings = new Map<string, number>();
  const sealTurnByStart = new Map<string, number[]>();
  const profiles = new Set<BotProfileId>();

  let decided = 0;
  let invalidCommands = 0;
  let stalled = 0;
  let thinkTotal = 0;
  let thinkTurns = 0;
  let earlyMaxMs = 0;
  let lateMaxMs = 0;
  const durations: number[] = [];
  const sealTurns: number[] = [];

  for (const game of games) {
    if (game.winner) decided++;
    invalidCommands += game.invalidCommands;
    if (game.stalled) stalled++;
    thinkTotal += game.think.totalMs;
    thinkTurns += game.think.turns;
    if (game.think.earlyMaxMs > earlyMaxMs) earlyMaxMs = game.think.earlyMaxMs;
    if (game.think.lateMaxMs > lateMaxMs) lateMaxMs = game.think.lateMaxMs;
    durations.push(game.turns);

    for (const banner of game.banners) {
      const won = banner.id === game.winner;
      profiles.add(banner.profile);
      add(byStart, banner.start, won);
      add(byFaction, banner.faction, won);
      add(bySeat, `siège ${banner.seat}`, won);
      add(byProfile, banner.profile, won);
      add(byHero, banner.hero, won);
      if (won) {
        for (const building of banner.opening) {
          openings.set(building, (openings.get(building) ?? 0) + 1);
        }
      }
    }

    if (game.firstSeal) {
      sealTurns.push(game.firstSeal.turn);
      const winner = game.banners.find((b) => b.id === game.firstSeal?.player);
      if (winner) {
        const list = sealTurnByStart.get(winner.start) ?? [];
        list.push(game.firstSeal.turn);
        sealTurnByStart.set(winner.start, list);
      }
    }
  }

  durations.sort((a, b) => a - b);
  const meanTurns = total > 0 ? Math.round(durations.reduce((a, b) => a + b, 0) / total) : 0;
  const medianTurns = total > 0 ? durations[Math.floor(total / 2)] : 0;

  /* — Fourchettes, élargies selon l'échantillon — */
  const startPlayed = total > 0 ? Math.round((total * players) / Math.max(1, byStart.size)) : 0;
  const startExpected = players > 0 ? 100 / players : 20;
  const startSlack = slack(startPlayed, startExpected);
  const factionSlack = slack(decided, 50);

  const report: BalanceReport = {
    games: total,
    players,
    profiles: Array.from(profiles).sort(),
    seedFirst: total > 0 ? games[0].seed : 0,
    seedLast: total > 0 ? games[total - 1].seed : 0,
    elapsedMs,

    byStart: bucketRows(
      byStart,
      Math.max(0, Math.round(startExpected) - Math.max(2, startSlack)),
      Math.round(startExpected) + Math.max(2, startSlack),
      8,
    ),
    // La fourchette 47–53 % du document maître porte sur le **partage des
    // victoires** entre les deux factions, pas sur la chance d'une bannière
    // prise isolément : à cinq, une bannière ne gagne qu'une fois sur cinq,
    // et comparer 20 % à 50 % n'aurait aucun sens. On rapporte donc, pour
    // chaque faction, la part des parties décidées qu'elle a remportées.
    byFaction: shareRows(
      byFaction,
      decided,
      50 - Math.max(3, factionSlack),
      50 + Math.max(3, factionSlack),
    ),
    bySeat: bucketRows(bySeat, 0, 100, 8),
    byProfile: bucketRows(byProfile, 0, 100, 8),
    // Un héros n'est jugé qu'au-delà de dix parties : en deçà, deux victoires
    // de chance suffiraient à le faire passer pour déséquilibré.
    byHero: bucketRows(byHero, 0, 55, 10),

    decided,
    meanTurns,
    medianTurns,
    minTurns: total > 0 ? durations[0] : 0,
    maxTurns: total > 0 ? durations[total - 1] : 0,

    firstSeal: {
      count: sealTurns.length,
      meanTurn:
        sealTurns.length > 0
          ? Math.round(sealTurns.reduce((a, b) => a + b, 0) / sealTurns.length)
          : 0,
      spread: spreadOfMeans(sealTurnByStart),
    },
    openings: openingRows(openings, decided),
    think: {
      meanMs: thinkTurns > 0 ? thinkTotal / thinkTurns : 0,
      earlyMaxMs,
      lateMaxMs,
    },
    invalidCommands,
    stalled,
    anomalies: [],
  };

  report.anomalies = detectAnomalies(report);
  return report;
}

function spreadOfMeans(byStart: Map<string, number[]>): number {
  const means: number[] = [];
  for (const list of byStart.values()) {
    if (list.length === 0) continue;
    means.push(list.reduce((a, b) => a + b, 0) / list.length);
  }
  if (means.length < 2) return 0;
  return Math.round(Math.max(...means) - Math.min(...means));
}

function openingRows(openings: Map<string, number>, decided: number): OpeningRow[] {
  const rows: OpeningRow[] = [];
  for (const [building, wins] of openings) {
    rows.push({
      building,
      wins,
      sharePercent: decided > 0 ? Math.round((wins * 100) / decided) : 0,
    });
  }
  rows.sort((a, b) => {
    if (a.wins !== b.wins) return b.wins - a.wins;
    return a.building < b.building ? -1 : 1;
  });
  return rows;
}

/* ── Détection d'anomalies ───────────────────────────────────────────────── */

/** Confronte le rapport aux six critères du document maître §20.3. */
export function detectAnomalies(report: BalanceReport): Anomaly[] {
  const out: Anomaly[] = [];

  // Critère 0 — la simulation doit d'abord être saine.
  if (report.invalidCommands > 0) {
    out.push({
      severity: 'grave',
      subject: 'Intégrité',
      message:
        `${report.invalidCommands} commande(s) rendue(s) par l’IA ont été refusées au rejeu : ` +
        'le plan et le moteur divergent.',
    });
  }
  if (report.stalled > 0) {
    out.push({
      severity: 'grave',
      subject: 'Intégrité',
      message: `${report.stalled} partie(s) enlisée(s) : une bannière ne pouvait plus clore son tour.`,
    });
  }

  // Critère 1 — positions.
  for (const row of report.byStart) {
    if (row.withinRange) continue;
    out.push({
      severity: 'alerte',
      subject: `Position « ${row.label} »`,
      message:
        `${row.ratePercent} % de victoires sur ${row.played} départs, hors de la fourchette ` +
        'attendue pour un départ équivalent (document maître §20.1 et §20.3).',
    });
  }

  // Critère 2 — factions.
  for (const row of report.byFaction) {
    if (row.withinRange) continue;
    out.push({
      severity: 'alerte',
      subject: `Faction « ${row.label} »`,
      message:
        `${row.wins} victoires sur ${row.played} parties décidées (${row.ratePercent} %), ` +
        'hors de la fourchette 47–53 % de partage entre les deux factions.',
    });
  }

  // Critère 3 — héros.
  for (const row of report.byHero) {
    if (row.withinRange) continue;
    out.push({
      severity: 'alerte',
      subject: `Héros « ${row.label} »`,
      message: `${row.ratePercent} % de victoires sur ${row.played} parties : au-dessus du plafond de 55 %.`,
    });
  }

  // Critère 4 — ouvertures.
  for (const opening of report.openings) {
    if (opening.sharePercent <= 70) continue;
    out.push({
      severity: 'alerte',
      subject: `Ouverture « ${opening.building} »`,
      message:
        `présente dans ${opening.sharePercent} % des parties gagnantes : ` +
        'l’ouverture est trop contrainte, le plafond est de 70 %.',
    });
  }

  // Critère 5 — premier sceau.
  if (report.firstSeal.count === 0) {
    out.push({
      severity: 'grave',
      subject: 'Sceaux des Marches',
      message:
        'aucun sceau levé de toute la série : la victoire par la Couronne est hors de portée, ' +
        'le critère du délai d’accès au premier sceau ne peut pas être mesuré.',
    });
  } else if (report.firstSeal.spread > 1) {
    out.push({
      severity: 'alerte',
      subject: 'Sceaux des Marches',
      message:
        `${report.firstSeal.spread} jours d’écart entre le premier sceau le plus rapide et le ` +
        'plus lent selon la position : le critère demande ±1 tour.',
    });
  }

  // Critère transverse — la partie doit se décider.
  if (report.games > 0 && report.decided * 2 < report.games) {
    out.push({
      severity: 'alerte',
      subject: 'Conclusion des parties',
      message:
        `${report.decided} partie(s) sur ${report.games} se terminent par une victoire : ` +
        'la majorité s’achève au décompte de fin de chronique.',
    });
  }

  // Performance de l'IA, hors §20.3 mais imposée par le brief.
  if (report.think.earlyMaxMs > 400) {
    out.push({
      severity: 'alerte',
      subject: 'Performance de l’IA',
      message: `${Math.round(report.think.earlyMaxMs)} ms pour un tour de début de partie (budget 400 ms).`,
    });
  }
  if (report.think.lateMaxMs > 1500) {
    out.push({
      severity: 'alerte',
      subject: 'Performance de l’IA',
      message: `${Math.round(report.think.lateMaxMs)} ms pour un tour de fin de partie (budget 1500 ms).`,
    });
  }

  // Taille d'échantillon : le document maître demande dix mille parties par
  // graine. On dit franchement de combien on parle plutôt que de laisser
  // croire à un verdict.
  const thinHeroes = report.byHero.filter((row) => row.played < 10).length;
  if (thinHeroes > 0) {
    out.push({
      severity: 'alerte',
      subject: 'Couverture',
      message:
        `${thinHeroes} héros sur ${report.byHero.length} comptent moins de dix parties : ` +
        'leur taux de victoire n’est pas concluant à cet échantillon.',
    });
  }
  if (report.games < 100) {
    out.push({
      severity: 'alerte',
      subject: 'Couverture',
      message:
        `${report.games} parties simulées, là où le document maître §20.3 en demande dix mille ` +
        'par graine : les écarts relevés ci-dessus sont des pistes, pas des verdicts.',
    });
  }

  // Critère 6 — hors de portée d'une simulation.
  out.push({
    severity: 'alerte',
    subject: 'Couverture',
    message:
      'le critère « au moins trois routes réalistes vers la Maison du Trésor par départ » ' +
      'relève de l’analyse de la carte et n’est pas mesuré ici.',
  });

  return out;
}

/* ── Ligne de commande ───────────────────────────────────────────────────── */

interface CliOptions extends GameOptions {
  games: number;
  out: string | null;
  json: boolean;
}

function parseArgs(argv: readonly string[]): CliOptions {
  const cli: CliOptions = {
    ...DEFAULT_OPTIONS,
    players: 5,
    profiles: ['expert', 'equilibre', 'agressif', 'prudent'],
    games: 10,
    out: null,
    json: false,
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
          .filter((s): s is BotProfileId => (BOT_PROFILE_IDS as readonly string[]).includes(s));
        i++;
        break;
      case '--duree':
      case '--duration':
        if (value === 'eclair' || value === 'standard' || value === 'saga') {
          cli.duration = value as Duration;
        }
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
          cli.victory = value as VictoryKind;
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
      case '--aide':
      case '--help':
        process.stdout.write(
          [
            'Usage : pnpm balance [options]',
            '',
            '  --parties N       nombre de parties simulées (défaut 10)',
            '  --graine N        graine de la première partie (défaut 1)',
            '  --joueurs N       nombre de bannières, 2 à 5 (défaut 5)',
            '  --profils a,b     profils affectés aux sièges',
            '  --duree D         eclair | standard | saga',
            '  --victoire V      couronne | derniere_banniere | maitre_marches | chronique',
            '  --sortie F        écrit le rapport JSON dans le fichier F',
            '  --rapide          ne rejoue pas les commandes',
            '  --json            écrit le JSON sur la sortie standard',
            '',
          ].join('\n'),
        );
        process.exit(0);
        break;
      default:
        break;
    }
  }
  if (cli.profiles.length === 0) cli.profiles = ['expert', 'equilibre', 'agressif', 'prudent'];
  return cli;
}

async function main(): Promise<void> {
  const cli = parseArgs(process.argv.slice(2));

  if (!cli.json) {
    process.stdout.write(
      `Équilibrage : ${cli.games} partie(s) à ${cli.players} bannières, graine ${cli.seed}…\n`,
    );
  }

  const started = Number(process.hrtime.bigint() / 1000n) / 1000;
  const games: GameOutcome[] = [];
  for (let i = 0; i < cli.games; i++) {
    const seed = cli.seed + i * 7919;
    games.push(simulateGame({ ...cli, seed, rotation: i }));
    if (!cli.json) {
      const last = games[games.length - 1];
      process.stdout.write(
        `  partie ${i + 1}/${cli.games} — graine ${seed} — ${last.turns} jours — ` +
          `${last.winner ?? 'sans vainqueur'}\n`,
      );
    }
  }
  const elapsedMs = Number(process.hrtime.bigint() / 1000n) / 1000 - started;

  const report = analyse(games, elapsedMs);

  if (cli.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write('\n');
    process.stdout.write(renderBalance(report));
  }

  if (cli.out) {
    const { writeFile } = await import('node:fs/promises');
    await writeFile(cli.out, `${JSON.stringify({ report, games }, null, 2)}\n`, 'utf8');
    if (!cli.json) process.stdout.write(`\nRapport JSON écrit dans ${cli.out}\n`);
  }

  const grave = report.anomalies.filter((a) => a.severity === 'grave').length;
  process.exitCode = grave > 0 ? 1 : 0;
}

function isEntryPoint(): boolean {
  const entry = process.argv[1] ?? '';
  return entry.endsWith('balance.ts') || entry.endsWith('balance.js');
}

if (isEntryPoint()) {
  void main();
}
