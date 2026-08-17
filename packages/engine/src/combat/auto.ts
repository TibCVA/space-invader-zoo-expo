/**
 * Résolution automatique d'un combat.
 *
 * Déterministe : à état et graine identiques, la suite d'événements produite
 * est strictement la même. La terminaison est **garantie** par trois verrous :
 *  1. limite dure du nombre d'actions ;
 *  2. limite de rounds (`COMBAT_TUNING.maxRounds`) ;
 *  3. détection d'impasse — plusieurs rounds sans le moindre dégât, par
 *     exemple lorsque les deux camps ne peuvent pas s'atteindre.
 *
 * Objectif de performance : moins d'une seconde dans 95 % des cas (§22).
 */

import type { CombatState, GameEvent, GameState } from '../types.js';
import { COMBAT_TUNING, livingUnits, sideHp } from './units.js';
import { activeUnit, beginRound, checkCombatEnd, endActivation, finishByAttrition } from './order.js';
import { applyCombatAction } from './actions.js';
import { chooseCombatAction } from './ai.js';

/**
 * Joue le combat en cours jusqu'à son terme avec l'IA tactique des deux côtés.
 * Retourne tous les événements produits.
 */
export function autoResolve(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const combat = state.combat;
  if (!combat) return events;
  if (combat.finished) return events;

  if (combat.round === 0) beginRound(state, combat, events);
  if (checkCombatEnd(state, combat, events)) return events;

  let actions = 0;
  let lastRound = combat.round;
  let lastHp = sideHp(combat, 0) + sideHp(combat, 1);
  let quietRounds = 0;
  let failures = 0;

  while (!combat.finished && actions < COMBAT_TUNING.maxActions) {
    const unit = activeUnit(combat);
    if (!unit) {
      beginRound(state, combat, events);
      continue;
    }

    const action = chooseCombatAction(state, combat);
    const result = applyCombatAction(state, action);
    for (const e of result.events) events.push(e);
    actions++;

    if (!result.ok) {
      // Sécurité : une décision invalide ne doit jamais figer la boucle.
      failures++;
      const fallback = applyCombatAction(state, { kind: 'defend', unit: unit.uid });
      for (const e of fallback.events) events.push(e);
      if (!fallback.ok) endActivation(state, combat, events);
      if (failures > 64) {
        finishByAttrition(state, combat, events, 'Le combat ne peut plus progresser.');
        break;
      }
    }

    if (combat.round !== lastRound) {
      const hp = sideHp(combat, 0) + sideHp(combat, 1);
      if (hp === lastHp) {
        quietRounds++;
        if (quietRounds >= COMBAT_TUNING.stalemateRounds) {
          finishByAttrition(
            state,
            combat,
            events,
            'Les deux armées restent hors de portée : la bataille tourne court.',
          );
          break;
        }
      } else {
        quietRounds = 0;
        lastHp = hp;
      }
      lastRound = combat.round;
    }
  }

  if (!combat.finished) {
    finishByAttrition(state, combat, events, 'La bataille est interrompue faute de décision.');
  }
  return events;
}

/**
 * Simulation « à blanc » : rejoue le combat sur une copie de l'état et
 * retourne le vainqueur probable ainsi que les survivants, sans toucher à
 * l'état réel. Utilisée par l'IA d'aventure pour estimer un engagement.
 */
export function previewAutoResolve(state: GameState): {
  winner: 0 | 1 | null;
  survivorsA: number;
  survivorsB: number;
  rounds: number;
} {
  const copy = structuredClone(state) as GameState;
  autoResolve(copy);
  const combat: CombatState | null = copy.combat;
  if (!combat) return { winner: null, survivorsA: 0, survivorsB: 0, rounds: 0 };
  return {
    winner: combat.winner,
    survivorsA: livingUnits(combat, 0).length,
    survivorsB: livingUnits(combat, 1).length,
    rounds: combat.round,
  };
}
