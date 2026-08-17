/**
 * Table `CreatureId → fabrique de rig`.
 *
 * Les identifiants sont ceux imposés par docs/02-API.md et produits par
 * `packages/content` : `granit_t1` … `granit_t7_up`, `ermitage_t1` …
 * `ermitage_t7_up`. Vingt-huit entrées, ni plus ni moins.
 */
import type { CreatureId } from '@auvergne/engine';
import { hashString } from '../noise.js';
import type { MaterialSet } from '../shading.js';
import type { Rig } from '../rig.js';
import type { Fabrique, Kit } from './archetypes.js';
import { kitPour } from './archetypes.js';
import { FABRIQUES_GRANIT } from './granit.js';
import { FABRIQUES_ERMITAGE } from './ermitage.js';

export type { Fabrique, Kit };
export { kitPour };

/** Les vingt-huit fabriques, indexées par identifiant de contenu. */
export const FABRIQUES: Readonly<Record<string, Fabrique>> = {
  ...FABRIQUES_GRANIT,
  ...FABRIQUES_ERMITAGE,
};

/** Les identifiants dans l'ordre canonique d'affichage (rang, puis amélioration). */
export const CREATURE_IDS: readonly CreatureId[] = (() => {
  const out: CreatureId[] = [];
  for (const faction of ['granit', 'ermitage'] as const) {
    for (let tier = 1; tier <= 7; tier += 1) {
      out.push(`${faction}_t${tier}`);
      out.push(`${faction}_t${tier}_up`);
    }
  }
  return out;
})();

/** Faction déduite de l'identifiant, sans dépendre du contenu. */
export function factionDe(id: CreatureId): 'granit' | 'ermitage' {
  return id.startsWith('ermitage') ? 'ermitage' : 'granit';
}

/**
 * Construit un rig neuf pour une créature. Chaque appel retourne une instance
 * distincte : plusieurs piles de la même créature s'animent indépendamment.
 */
export function construireCreature(id: CreatureId, mats: MaterialSet): Rig {
  const fabrique = FABRIQUES[id];
  if (!fabrique) {
    throw new Error(`Créature inconnue dans l'atlas artistique : ${id}`);
  }
  const kit = kitPour(mats, factionDe(id), hashString(id) % 100000);
  return fabrique(kit);
}
