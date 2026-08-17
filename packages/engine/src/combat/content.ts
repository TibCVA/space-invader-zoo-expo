/**
 * Pont vers les données de contenu.
 *
 * `packages/engine` est une bibliothèque pure : elle ne peut pas importer
 * `@auvergne/content` (c'est le contenu qui dépend du moteur). L'intégrateur
 * branche donc les données une fois pour toutes au démarrage :
 *
 * ```ts
 * import { CREATURES, SPELLS, SKILLS, ARTIFACTS } from '@auvergne/content';
 * setCombatContent({
 *   creature: (id) => CREATURES[id],
 *   spell:    (id) => SPELLS[id],
 *   skill:    (id) => SKILLS[id],
 *   artifact: (id) => ARTIFACTS[id],
 * });
 * ```
 *
 * Tant que rien n'est branché, le combat utilise la table de repli
 * `creatures.ts` (statistiques de prototype du document maître) : le moteur
 * reste testable et simulable seul, sans jamais dépendre du contenu.
 */

import type {
  ArtifactDef,
  ArtifactId,
  CreatureDef,
  CreatureId,
  SkillDef,
  SkillEffect,
  SkillId,
  SkillRank,
  SpellDef,
  SpellId,
} from '../types.js';
import { FALLBACK_CREATURES } from './creatures.js';

export interface CombatContentProvider {
  creature(id: CreatureId): CreatureDef | undefined;
  spell?(id: SpellId): SpellDef | undefined;
  skill?(id: SkillId): SkillDef | undefined;
  artifact?(id: ArtifactId): ArtifactDef | undefined;
}

let provider: CombatContentProvider | null = null;

/** Branche les données de contenu. Appelé une fois au démarrage. */
export function setCombatContent(p: CombatContentProvider | null): void {
  provider = p;
}

/** Vrai si un fournisseur de contenu est branché. */
export function hasCombatContent(): boolean {
  return provider !== null;
}

/**
 * Définition d'une créature. Lève une erreur en français si l'identifiant est
 * inconnu du contenu **et** de la table de repli : un combat ne doit jamais
 * démarrer sur une pile fantôme.
 */
export function creatureDef(id: CreatureId): CreatureDef {
  const fromContent = provider?.creature(id);
  if (fromContent) return fromContent;
  const fallback = FALLBACK_CREATURES[id];
  if (fallback) return fallback;
  throw new Error(`Créature inconnue dans le combat : « ${id} ».`);
}

/** Définition d'une créature, ou `null` si elle est inconnue. */
export function tryCreatureDef(id: CreatureId): CreatureDef | null {
  const fromContent = provider?.creature(id);
  if (fromContent) return fromContent;
  return FALLBACK_CREATURES[id] ?? null;
}

/** Définition d'un sort, ou `null` si le contenu n'est pas branché. */
export function spellDef(id: SpellId): SpellDef | null {
  return provider?.spell?.(id) ?? null;
}

/** Définition d'un artefact, ou `null`. */
export function artifactDef(id: ArtifactId): ArtifactDef | null {
  return provider?.artifact?.(id) ?? null;
}

/**
 * Effets d'une compétence au rang atteint. Convention : chaque rang décrit la
 * **totalité** de ses effets (ils ne se cumulent pas entre rangs).
 * Retourne un tableau vide si le contenu n'est pas branché.
 */
export function skillEffects(id: SkillId, rank: SkillRank): SkillEffect[] {
  const def = provider?.skill?.(id);
  if (!def) return [];
  return def.effects[rank - 1] ?? [];
}
