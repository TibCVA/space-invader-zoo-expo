/**
 * Configuration de partie.
 *
 * `packages/engine/src/types.ts` (verrouillé) définit `GameConfig` mais
 * `GameState` ne comporte aucun champ pour la stocker. Pour que la durée et le
 * mode de victoire survivent à une sauvegarde, à un rechargement et au hash,
 * ils sont encodés dans l'identifiant de partie, qui est sérialisé et haché
 * comme le reste de l'état :
 *
 *     G-<graine>-<durée>-<victoire>
 *
 * C'est un contournement volontaire et documenté ; il disparaîtra le jour où
 * `GameState` gagnera un champ `config`.
 */
import type { GameConfig, GameSetup, GameState } from '../types.js';
import { DURATION_WEEKS, HERO_LIMIT } from './constants.js';

const DURATIONS: GameConfig['duration'][] = ['eclair', 'standard', 'saga'];
const VICTORIES: GameConfig['victory'][] = [
  'couronne',
  'derniere_banniere',
  'maitre_marches',
  'chronique',
];

const TIMERS: Record<GameConfig['duration'], number | null> = {
  eclair: 90,
  standard: 180,
  saga: null,
};

export function encodeGameId(setup: GameSetup): string {
  return `G-${setup.seed >>> 0}-${setup.duration}-${setup.victory}`;
}

export function gameConfig(state: GameState): GameConfig {
  const parts = state.id.split('-');
  const duration = DURATIONS.includes(parts[2] as GameConfig['duration'])
    ? (parts[2] as GameConfig['duration'])
    : 'standard';
  const victory = VICTORIES.includes(parts[3] as GameConfig['victory'])
    ? (parts[3] as GameConfig['victory'])
    : 'couronne';
  return {
    duration,
    victory,
    maxWeeks: DURATION_WEEKS[duration],
    heroLimit: HERO_LIMIT,
    turnTimerSeconds: TIMERS[duration],
  };
}
