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
  /*
   * Un seul mode de victoire : prendre tous les châteaux adverses — la
   * dernière bannière debout. La demande est explicite (« pas besoin d'autre
   * mode »), et la mesure lui donnait raison : sur vingt parties, toutes se
   * réglaient au score de fin de chronique et le profil d'IA le plus immobile
   * l'emportait quinze fois — la lecture correcte d'un monde où gagner ne
   * demandait pas de conquérir.
   *
   * Le jeton de mode reste dans l'identifiant de partie pour que les
   * sauvegardes anciennes se chargent telles quelles ; il n'est simplement
   * plus lu. `parts[3]` conserve sa place dans le format.
   */
  void VICTORIES;
  return {
    duration,
    victory: 'derniere_banniere',
    maxWeeks: DURATION_WEEKS[duration],
    heroLimit: HERO_LIMIT,
    turnTimerSeconds: TIMERS[duration],
  };
}
