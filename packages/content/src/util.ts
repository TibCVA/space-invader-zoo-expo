/**
 * Petites aides internes du paquet de contenu.
 *
 * Ce fichier ne contient AUCUNE règle de jeu : uniquement des fabriques de
 * données (indexation, gel, mise à l'échelle de coûts, position de scène).
 * Toutes les valeurs produites restent entières, conformément au brief §2.3.
 */
import { RESOURCE_KEYS, type BuildingDef, type Resources } from '@auvergne/engine';

/** Indexe une liste d'entrées par leur identifiant, en préservant l'ordre. */
export function indexById<T extends { id: string }>(rows: readonly T[]): Record<string, T> {
  const out: Record<string, T> = {};
  for (const row of rows) out[row.id] = row;
  return out;
}

/**
 * Applique un ratio en points de base à un coût, en arrondissant au supérieur.
 * Aucun coût ne peut tomber à zéro s'il était non nul.
 */
export function scaleCostBp(cost: Partial<Resources>, bp: number): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const key of RESOURCE_KEYS) {
    const value = cost[key];
    if (value === undefined || value === 0) continue;
    out[key] = Math.max(1, Math.ceil((value * bp) / 10000));
  }
  return out;
}

/** Somme des valeurs d'un coût, utile aux contrôles d'équilibrage. */
export function costWeight(cost: Partial<Resources>): number {
  let total = 0;
  for (const key of RESOURCE_KEYS) total += cost[key] ?? 0;
  return total;
}

/**
 * Position d'un bâtiment sur le tableau de cité.
 * `x` et `y` sont des pourcentages de la largeur et de la hauteur (0–100),
 * `z` le plan de parallaxe (0 = lointain … 5 = premier plan), `scale` un
 * pourcentage d'échelle (100 = taille de référence).
 */
export function scene(x: number, y: number, z: number, scale = 100): BuildingDef['scene'] {
  return { x, y, z, scale };
}

/** Racine carrée entière, déterministe et sans flottant résiduel. */
export function isqrt(value: number): number {
  if (value <= 0) return 0;
  let x = Math.floor(Math.sqrt(value));
  while (x > 0 && x * x > value) x -= 1;
  while ((x + 1) * (x + 1) <= value) x += 1;
  return x;
}

/** Vrai si la chaîne contient au moins un caractère non blanc. */
export function isFilled(text: unknown): boolean {
  return typeof text === 'string' && text.trim().length > 0;
}

/** Nombre de phrases approximatif, pour les contrôles rédactionnels. */
export function sentenceCount(text: string): number {
  const parts = text
    .split(/[.!?…]+/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 1);
  return parts.length;
}
