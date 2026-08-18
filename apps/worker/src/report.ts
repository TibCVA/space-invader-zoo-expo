/**
 * Rendu texte des rapports de simulation et d'équilibrage, en français.
 *
 * Aucune décision n'est prise ici : ce fichier ne fait que mettre en forme ce
 * que `simulate.ts` a mesuré et ce que `balance.ts` a conclu. Il s'adresse à
 * un lecteur humain qui regarde défiler un terminal, d'où les tableaux à
 * largeur fixe et les nombres arrondis — le JSON reste la source exacte.
 */
import type { BannerOutcome, GameOutcome, SeriesOutcome } from './simulate.js';
import type { Anomaly, BalanceReport, RateRow } from './balance.js';

/* ── Petits outils de mise en forme ──────────────────────────────────────── */

const RULE = '─'.repeat(78);

export function pad(text: string, width: number): string {
  const value = String(text);
  return value.length >= width ? value.slice(0, width) : value + ' '.repeat(width - value.length);
}

export function padLeft(text: string | number, width: number): string {
  const value = String(text);
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

/** Pourcentage entier à partir d'une part sur un total. */
export function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part * 100) / total);
}

export function ms(value: number): string {
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value.toFixed(0)} ms`;
}

/** Accord du pluriel à la française : « 1 partie », « 3 parties ». */
export function plural(count: number, singular: string, pluralForm?: string): string {
  return `${count} ${count > 1 ? (pluralForm ?? `${singular}s`) : singular}`;
}

/* ── Rapport d'une partie ────────────────────────────────────────────────── */

function bannerLine(banner: BannerOutcome, winner: string | null): string {
  const mark = banner.id === winner ? '★' : banner.alive ? ' ' : '†';
  return (
    `  ${mark} ${pad(banner.id, 3)}${pad(banner.profile, 11)}${pad(banner.faction, 10)}` +
    `${pad(banner.start, 12)}` +
    `cités ${padLeft(banner.towns, 2)}  bât ${padLeft(banner.buildings, 3)}  ` +
    `gis ${padLeft(banner.mines, 2)}  sceaux ${padLeft(banner.seals, 1)}  ` +
    `force ${padLeft(banner.power, 7)}  niv ${padLeft(banner.heroLevel, 2)}  ` +
    `exploré ${padLeft(banner.explored, 6)}\n`
  );
}

/** Compte rendu d'une partie unique. */
export function renderGame(game: GameOutcome, index?: number): string {
  const title =
    index === undefined
      ? `Partie (graine ${game.seed})`
      : `Partie ${index} — graine ${game.seed}`;
  const out: string[] = [];
  out.push(`${title}\n`);
  out.push(
    `  ${game.turns} jours (${game.weeks} semaines) · ${ms(game.elapsedMs)} · ` +
      `réflexion moyenne ${ms(game.think.totalMs / Math.max(1, game.think.turns))}` +
      ` · pire tour ${ms(game.think.maxMs)}\n`,
  );
  out.push(
    game.winner
      ? `  Vainqueur : ${game.winner} (${game.winnerProfile}). ${game.reason}\n`
      : `  Sans vainqueur. ${game.reason}\n`,
  );
  if (game.firstSeal) {
    out.push(
      `  Premier sceau : « ${game.firstSeal.seal} » par ${game.firstSeal.player} ` +
        `au jour ${game.firstSeal.turn}.\n`,
    );
  } else {
    out.push('  Aucun Sceau des Marches levé de toute la partie.\n');
  }
  for (const banner of game.banners) out.push(bannerLine(banner, game.winner));
  if (game.stalled) out.push('  ⚠ Partie enlisée : une bannière ne parvenait plus à clore son tour.\n');
  if (game.invalidCommands > 0) {
    out.push(`  ⚠ ${plural(game.invalidCommands, 'commande refusée', 'commandes refusées')} au rejeu :\n`);
    for (const detail of game.invalidDetail) out.push(`      ${detail}\n`);
  }
  out.push('\n');
  return out.join('');
}

/* ── Rapport d'une série ─────────────────────────────────────────────────── */

/** Résumé d'une série de parties. */
export function renderSeries(series: SeriesOutcome): string {
  const out: string[] = [];
  const games = series.games;
  const total = games.length;

  out.push(`${RULE}\n`);
  out.push(`RÉSUMÉ — ${series.label}\n`);
  out.push(`${RULE}\n`);
  out.push(
    `${plural(total, 'partie')} · ${series.players} bannières · durée « ${series.duration} » · ` +
      `victoire « ${series.victory} »\n`,
  );
  out.push(`Temps total : ${ms(series.elapsedMs)}.\n\n`);

  /* Victoires par profil. */
  const byProfile = new Map<string, number>();
  const seats = new Map<string, number>();
  for (const profile of series.profiles) byProfile.set(profile, 0);
  for (const game of games) {
    if (game.winnerProfile) {
      byProfile.set(game.winnerProfile, (byProfile.get(game.winnerProfile) ?? 0) + 1);
    }
    for (const banner of game.banners) {
      seats.set(banner.profile, (seats.get(banner.profile) ?? 0) + 1);
    }
  }
  out.push('Victoires par profil\n');
  for (const profile of Array.from(byProfile.keys()).sort()) {
    const wins = byProfile.get(profile) ?? 0;
    const played = seats.get(profile) ?? 0;
    out.push(
      `  ${pad(profile, 12)}${padLeft(wins, 3)} / ${padLeft(played, 3)} parties jouées` +
        `   ${padLeft(percent(wins, played), 3)} %\n`,
    );
  }

  const decided = games.filter((g) => g.winner !== null).length;
  const turns = games.reduce((n, g) => n + g.turns, 0);
  const seals = games.filter((g) => g.firstSeal !== null).length;
  const invalid = games.reduce((n, g) => n + g.invalidCommands, 0);
  const stalled = games.filter((g) => g.stalled).length;
  const worstEarly = Math.max(0, ...games.map((g) => g.think.earlyMaxMs));
  const worstLate = Math.max(0, ...games.map((g) => g.think.lateMaxMs));
  const meanThink =
    games.reduce((n, g) => n + g.think.totalMs, 0) /
    Math.max(1, games.reduce((n, g) => n + g.think.turns, 0));

  out.push('\nGénéral\n');
  out.push(`  Parties décidées par un vainqueur      ${padLeft(decided, 4)} / ${total}\n`);
  out.push(`  Durée moyenne                          ${padLeft(Math.round(turns / Math.max(1, total)), 4)} jours\n`);
  out.push(`  Parties où un sceau est levé           ${padLeft(seals, 4)} / ${total}\n`);
  out.push(`  Réflexion moyenne de l’IA              ${padLeft(ms(meanThink), 9)}\n`);
  out.push(`  Pire tour en début de partie (≤ S3)    ${padLeft(ms(worstEarly), 9)}\n`);
  out.push(`  Pire tour en fin de partie (≥ S8)      ${padLeft(ms(worstLate), 9)}\n`);
  out.push(`  Commandes refusées au rejeu            ${padLeft(invalid, 4)}\n`);
  if (stalled > 0) out.push(`  ⚠ Parties enlisées                     ${padLeft(stalled, 4)}\n`);
  out.push('\n');
  return out.join('');
}

/* ── Rapport d'équilibrage ───────────────────────────────────────────────── */

function rateTable(title: string, rows: readonly RateRow[], expected: string): string {
  const out: string[] = [];
  out.push(`${title}   (attendu : ${expected})\n`);
  if (rows.length === 0) {
    out.push('  aucune donnée\n');
    return out.join('');
  }
  for (const row of rows) {
    const flag = row.withinRange ? ' ' : '⚠';
    const bar = '█'.repeat(Math.min(28, Math.round(row.ratePercent / 2)));
    out.push(
      `  ${flag} ${pad(row.label, 16)}${padLeft(row.wins, 4)} / ${padLeft(row.played, 4)}` +
        `  ${padLeft(`${row.ratePercent} %`, 6)}  ${bar}\n`,
    );
  }
  return out.join('');
}

function anomalyLine(anomaly: Anomaly): string {
  const badge = anomaly.severity === 'grave' ? 'GRAVE ' : 'ALERTE';
  return `  [${badge}] ${anomaly.subject} — ${anomaly.message}\n`;
}

/** Rapport d'équilibrage complet, conforme au document maître §20.3. */
export function renderBalance(report: BalanceReport): string {
  const out: string[] = [];
  out.push(`${RULE}\n`);
  out.push("RAPPORT D’ÉQUILIBRAGE — Heroes of Might and Magic : Auvergne Edition\n");
  out.push(`${RULE}\n`);
  out.push(
    `${plural(report.games, 'partie')} simulée${report.games > 1 ? 's' : ''} · ` +
      `${report.players} bannières · graines ${report.seedFirst} à ${report.seedLast} · ` +
      `${ms(report.elapsedMs)}\n`,
  );
  out.push(`Profils en lice : ${report.profiles.join(', ')}.\n\n`);

  out.push(rateTable('Taux de victoire par position', report.byStart, '18 à 22 % à cinq'));
  out.push('\n');
  out.push(
    rateTable(
      'Partage des victoires par faction',
      report.byFaction,
      '47 à 53 % — part des parties décidées',
    ),
  );
  out.push('\n');
  out.push(rateTable('Taux de victoire par siège', report.bySeat, 'réparti'));
  out.push('\n');
  out.push(rateTable('Taux de victoire par profil', report.byProfile, 'expert en tête'));
  out.push('\n');
  out.push(rateTable('Taux de victoire par héros', report.byHero, 'aucun au-dessus de 55 %'));
  out.push('\n');

  out.push('Durée des parties\n');
  out.push(`  Durée moyenne                          ${padLeft(report.meanTurns, 5)} jours\n`);
  out.push(`  Durée médiane                          ${padLeft(report.medianTurns, 5)} jours\n`);
  out.push(`  Plus courte / plus longue              ${padLeft(report.minTurns, 5)} / ${report.maxTurns} jours\n`);
  out.push(`  Parties décidées par un vainqueur      ${padLeft(report.decided, 5)} / ${report.games}\n\n`);

  out.push('Premier Sceau des Marches\n');
  if (report.firstSeal.count === 0) {
    out.push('  Aucun sceau levé dans la série entière.\n\n');
  } else {
    out.push(`  Parties avec au moins un sceau         ${padLeft(report.firstSeal.count, 5)} / ${report.games}\n`);
    out.push(`  Jour moyen du premier sceau            ${padLeft(report.firstSeal.meanTurn, 5)}\n`);
    out.push(`  Écart entre positions                  ${padLeft(report.firstSeal.spread, 5)} jours\n\n`);
  }

  out.push('Constructions d’ouverture (trois premières)\n');
  if (report.openings.length === 0) {
    out.push('  aucune donnée\n');
  } else {
    for (const opening of report.openings.slice(0, 10)) {
      const flag = opening.sharePercent > 70 ? '⚠' : ' ';
      out.push(
        `  ${flag} ${pad(opening.building, 26)}${padLeft(opening.wins, 4)} ouverture(s) gagnante(s)` +
          `  ${padLeft(`${opening.sharePercent} %`, 6)}\n`,
      );
    }
  }
  out.push('\n');

  out.push('Performance de l’IA\n');
  out.push(`  Réflexion moyenne par tour             ${padLeft(ms(report.think.meanMs), 9)}\n`);
  out.push(`  Pire tour en début de partie (≤ S3)    ${padLeft(ms(report.think.earlyMaxMs), 9)}\n`);
  out.push(`  Pire tour en fin de partie (≥ S8)      ${padLeft(ms(report.think.lateMaxMs), 9)}\n`);
  out.push(`  Commandes refusées au rejeu            ${padLeft(report.invalidCommands, 5)}\n\n`);

  out.push(`${RULE}\n`);
  if (report.anomalies.length === 0) {
    out.push('Aucune anomalie détectée sur les critères du document maître §20.3.\n');
  } else {
    out.push(`ANOMALIES — ${plural(report.anomalies.length, 'signalement')}\n`);
    out.push(`${RULE}\n`);
    for (const anomaly of report.anomalies) out.push(anomalyLine(anomaly));
  }
  out.push(`${RULE}\n`);
  return out.join('');
}
