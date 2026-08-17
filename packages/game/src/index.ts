/**
 * RACINE DE COMPOSITION.
 *
 * `packages/engine` est une bibliothèque pure : elle ne peut pas importer
 * `@auvergne/content` ni `@auvergne/map`, puisque ces paquets dépendent
 * eux-mêmes du moteur. Le moteur déclare donc des contrats et les reçoit par
 * injection (`linkEngineModules`, `setCombatContent`).
 *
 * Ce paquet est le SEUL endroit où le branchement a lieu. Tout consommateur
 * (client, serveur, worker, bots, tests) appelle `bootstrapEngine()` une fois
 * au démarrage, puis utilise `@auvergne/engine` normalement.
 *
 *     import { bootstrapEngine } from '@auvergne/game';
 *     bootstrapEngine();
 */
import * as content from '@auvergne/content';
import * as mapPkg from '@auvergne/map';
import {
  linkEngineModules,
  setCombatContent,
  combatModule,
  worldModule,
} from '@auvergne/engine';

let linked = false;

/**
 * Branche le contenu, la carte et les sous-modules du moteur.
 * Idempotent : les appels suivants sont ignorés (passer `force` pour rebrancher).
 */
export function bootstrapEngine(force = false): void {
  if (linked && !force) return;

  linkEngineModules({
    content: content as unknown as Parameters<typeof linkEngineModules>[0]['content'],
    map: mapPkg as unknown as Parameters<typeof linkEngineModules>[0]['map'],
    world: worldModule(),
    combat: combatModule(),
  });

  setCombatContent({
    creature: (id) => content.creature(id),
    spell: (id) => content.spell(id),
    skill: (id) => content.skill(id),
    artifact: (id) => content.artifact(id),
  });

  linked = true;
}

export function isBootstrapped(): boolean {
  return linked;
}

/** Versions actives, utiles au diagnostic et à la validation des sauvegardes. */
export function versions(): { engine: string; content: string; map: string } {
  return {
    engine: (content as { ENGINE_VERSION?: string }).ENGINE_VERSION ?? engineVersion(),
    content: content.CONTENT_VERSION,
    map: mapPkg.MAP_VERSION,
  };
}

function engineVersion(): string {
  // Importé paresseusement pour éviter toute dépendance circulaire de types.
  return (globalThis as { __AUVERGNE_ENGINE_VERSION__?: string }).__AUVERGNE_ENGINE_VERSION__ ?? '1.0.0';
}

export { content, mapPkg as map };
export * from '@auvergne/engine';
