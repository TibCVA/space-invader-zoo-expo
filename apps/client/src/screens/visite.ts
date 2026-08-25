/**
 * AGIR SUR PLACE — la revisite de HMM3 (la barre Espace), injouable jusqu'ici.
 *
 * `HeroInteract` n'était émise nulle part. Les interactions AU PASSAGE
 * marchent toutes seules (`core/movement.ts` les déclenche à chaque pas) ;
 * ce qui manquait, c'est agir SANS bouger : le héros campé sur l'auberge
 * quand la semaine tourne, le moulin sous ses pieds au lundi.
 *
 * On ne mime que les trois conditions de forme d'`apply.ts:325-337` — sur
 * l'entrée, non épuisé, sans garde — pour savoir QUAND OFFRIR le bouton. Le
 * moteur reste seul juge du fond : « Il n'y a rien à faire ici » remonte en
 * avis, et c'est sa phrase.
 */
import { sameCoord } from '@auvergne/engine';
import type { GameState, HeroInstance, MapObject } from '@auvergne/engine';

export interface Revisite {
  readonly possible: boolean;
  /** pourquoi le bouton ne se montre pas — pour les gardes, pas pour l'écran */
  readonly raison: 'ok' | 'ailleurs' | 'epuise' | 'garde' | 'personne';
}

export function revisiteDe(
  game: GameState,
  heros: HeroInstance | null,
  objet: MapObject,
): Revisite {
  if (!heros) return { possible: false, raison: 'personne' };
  if (!sameCoord(heros.at, objet.entrance)) return { possible: false, raison: 'ailleurs' };
  if (objet.spent) return { possible: false, raison: 'epuise' };
  if (objet.guard && objet.guard.length > 0) return { possible: false, raison: 'garde' };
  void game;
  return { possible: true, raison: 'ok' };
}
