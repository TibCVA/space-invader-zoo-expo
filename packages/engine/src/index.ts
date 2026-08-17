/**
 * Baril public de @auvergne/engine.
 *
 * Le moteur est une bibliothèque PURE : aucun import de React, PixiJS, DOM,
 * Node ou Fastify, et aucune dépendance vers @auvergne/content ou
 * @auvergne/map (ce sont eux qui dépendent du moteur). Le contenu, la carte et
 * les sous-modules sont branchés par injection depuis @auvergne/game.
 */
export * from './types.js';
export * from './rng.js';
export * from './hash.js';
export * from './core/index.js';
export * from './combat/index.js';
export * from './world/index.js';

/**
 * Implémentations réelles des sous-modules, exposées en espaces de noms pour
 * que @auvergne/game puisse les injecter dans le registre du noyau. Le noyau
 * ne les importe jamais statiquement : sans injection il utiliserait ses replis.
 */
export * as worldImpl from './world/index.js';
export * as combatImpl from './combat/index.js';

/**
 * Levée d'ambiguïté : ces symboles utilitaires existent dans core/ et dans
 * combat/. La version du noyau fait autorité.
 */
export {
  HERO_DOWN_DAYS,
  areAdjacent,
  clampInt,
  inBounds,
  plural,
} from './core/index.js';
