/**
 * Journal de combat : une entrée = un événement `CombatAction`.
 * Tous les textes sont en français, prêts à être affichés tels quels.
 */

import type { CombatLogEntry, CombatState, GameEvent } from '../types.js';

export function pushLog(
  combat: CombatState,
  events: GameEvent[],
  kind: CombatLogEntry['kind'],
  text: string,
  detail?: Record<string, number | string>,
): CombatLogEntry {
  const entry: CombatLogEntry = { round: combat.round, text, kind };
  if (detail) entry.detail = detail;
  combat.log.push(entry);
  events.push({ type: 'CombatAction', entry });
  return entry;
}

/** Accord singulier/pluriel simple. */
export function plural(n: number, singular: string, plural_: string): string {
  return n > 1 ? plural_ : singular;
}
