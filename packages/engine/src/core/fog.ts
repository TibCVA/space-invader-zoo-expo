/**
 * Brouillard de guerre à trois états, avec relief.
 *
 * 0 = inconnu · 1 = exploré, non visible · 2 = visible maintenant.
 *
 * La vision n'est pas un simple disque : le relief compte réellement.
 * Une crête, un belvédère ou Pierre Pamole portent le regard plus loin ;
 * une futaie dense ou un ressaut rocheux l'arrêtent. Le calcul de ligne de vue
 * est entièrement entier (comparaison de pentes par produits croisés), donc
 * strictement reproductible d'une machine à l'autre.
 */
import type { GameState, MapCoord, PlayerId, WorldMap } from '../types.js';
import {
  CANOPY_FOREST,
  CANOPY_ROCK,
  EYE_HEIGHT,
  FOG_EXPLORED,
  FOG_UNKNOWN,
  FOG_VISIBLE,
  RIDGE_METERS_PER_POINT,
  RIDGE_VISION_BONUS_MAX,
  RIDGE_VISION_MALUS_MAX,
  TOWN_VISION,
} from './constants.js';
import { terrainAtIndex } from './util.js';

/** Hauteur occultante d'une case, en mètres au-dessus du sol. */
function canopyAt(world: WorldMap, index: number): number {
  const t = terrainAtIndex(world, index);
  if (t === 'foret') return CANOPY_FOREST;
  if (t === 'rocher') return CANOPY_ROCK;
  return 0;
}

/**
 * Bonus de portée dû au relief local : on compare l'altitude de l'observateur
 * à celle d'une couronne de cases à trois cases de distance.
 */
export function reliefVisionBonus(world: WorldMap, at: MapCoord): number {
  const here = world.elevation[at.row * world.cols + at.col] | 0;
  let sum = 0;
  let count = 0;
  const ring = 3;
  for (let k = 0; k < 8; k++) {
    const dc = [0, 1, 1, 1, 0, -1, -1, -1][k] * ring;
    const dr = [-1, -1, 0, 1, 1, 1, 0, -1][k] * ring;
    const col = at.col + dc;
    const row = at.row + dr;
    if (col < 0 || row < 0 || col >= world.cols || row >= world.rows) continue;
    sum += world.elevation[row * world.cols + col] | 0;
    count++;
  }
  if (count === 0) return 0;
  const mean = Math.trunc(sum / count);
  const diff = here - mean;
  const bonus = Math.trunc(diff / RIDGE_METERS_PER_POINT);
  if (bonus > RIDGE_VISION_BONUS_MAX) return RIDGE_VISION_BONUS_MAX;
  if (bonus < -RIDGE_VISION_MALUS_MAX) return -RIDGE_VISION_MALUS_MAX;
  return bonus;
}

/**
 * Ligne de vue entière entre deux cases. `eyeH` est l'altitude de l'œil.
 * On suit la ligne de Bresenham et l'on retient la pente occultante maximale ;
 * la case cible est vue si sa propre pente reste au-dessus de cet horizon.
 */
export function hasLineOfSight(
  world: WorldMap,
  fromCol: number,
  fromRow: number,
  eyeH: number,
  toCol: number,
  toRow: number,
): boolean {
  const dc = toCol - fromCol;
  const dr = toRow - fromRow;
  const steps = Math.max(Math.abs(dc), Math.abs(dr));
  if (steps <= 1) return true;

  // Horizon courant, exprimé en fraction (num / den) pour rester entier.
  let horizonNum = -1000000;
  let horizonDen = 1;

  for (let i = 1; i < steps; i++) {
    const col = fromCol + intDiv(dc * i, steps);
    const row = fromRow + intDiv(dr * i, steps);
    const index = row * world.cols + col;
    const blockH = (world.elevation[index] | 0) + canopyAt(world, index);
    const num = blockH - eyeH;
    if (num * horizonDen > horizonNum * i) {
      horizonNum = num;
      horizonDen = i;
    }
  }

  const targetIndex = toRow * world.cols + toCol;
  const targetNum = (world.elevation[targetIndex] | 0) + 1 - eyeH;
  return targetNum * horizonDen >= horizonNum * steps;
}

/** Division entière arrondie au plus proche, sans virgule flottante résiduelle. */
function intDiv(a: number, b: number): number {
  return Math.trunc((a * 2 + (a >= 0 ? b : -b)) / (2 * b));
}

/**
 * Révèle le brouillard d'un joueur autour d'une case.
 *
 * Retourne la liste des index de cases qui viennent de passer en « visible »
 * (elles étaient inconnues ou seulement explorées).
 */
export function revealFog(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
  at: MapCoord,
  radius: number,
): number[] {
  const p = state.players[player];
  if (!p) return [];
  const fog = p.fog;
  const changed: number[] = [];

  const effective = Math.max(1, radius + reliefVisionBonus(world, at));
  const eyeH = (world.elevation[at.row * world.cols + at.col] | 0) + EYE_HEIGHT;
  const r2 = effective * effective;

  const minCol = Math.max(0, at.col - effective);
  const maxCol = Math.min(world.cols - 1, at.col + effective);
  const minRow = Math.max(0, at.row - effective);
  const maxRow = Math.min(world.rows - 1, at.row + effective);

  for (let row = minRow; row <= maxRow; row++) {
    const dr = row - at.row;
    for (let col = minCol; col <= maxCol; col++) {
      const dc = col - at.col;
      if (dc * dc + dr * dr > r2) continue;
      const index = row * world.cols + col;
      if (fog[index] === FOG_VISIBLE) continue;
      if (!hasLineOfSight(world, at.col, at.row, eyeH, col, row)) continue;
      fog[index] = FOG_VISIBLE;
      changed.push(index);
    }
  }
  return changed;
}

/** Rabat toutes les cases visibles d'un joueur à l'état « exploré ». */
export function dimVisible(state: GameState, player: PlayerId): void {
  const p = state.players[player];
  if (!p) return;
  const fog = p.fog;
  for (let i = 0; i < fog.length; i++) {
    if (fog[i] === FOG_VISIBLE) fog[i] = FOG_EXPLORED;
  }
}

/**
 * Recalcule intégralement la visibilité d'un joueur : héros, cités et
 * belvédères possédés. Appelé au début de chaque tour.
 */
export function recomputeVisibility(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
  visionOf: (heroUid: string) => number,
): number[] {
  dimVisible(state, player);
  const p = state.players[player];
  if (!p) return [];
  const changed: number[] = [];
  for (const uid of p.heroes.slice().sort()) {
    const hero = state.heroes[uid];
    if (!hero) continue;
    changed.push(...revealFog(state, world, player, hero.at, visionOf(uid)));
  }
  for (const uid of p.towns.slice().sort()) {
    const town = state.towns[uid];
    if (!town) continue;
    changed.push(...revealFog(state, world, player, town.at, TOWN_VISION));
  }
  for (const uid of Object.keys(state.objects).sort()) {
    const obj = state.objects[uid];
    if (obj.owner !== player) continue;
    const radius = obj.kind === 'belvedere' ? 22 : obj.kind === 'mine' ? 5 : 4;
    changed.push(...revealFog(state, world, player, obj.at, radius));
  }
  return changed;
}

/** État du brouillard sur une case, pour l'affichage et l'IA. */
export function fogAt(state: GameState, player: PlayerId, world: WorldMap, at: MapCoord): number {
  const p = state.players[player];
  if (!p) return FOG_UNKNOWN;
  return p.fog[at.row * world.cols + at.col] | 0;
}

/** Vrai si le joueur a au moins exploré la case. */
export function isExplored(state: GameState, player: PlayerId, world: WorldMap, at: MapCoord): boolean {
  return fogAt(state, player, world, at) >= FOG_EXPLORED;
}

export { FOG_UNKNOWN, FOG_EXPLORED, FOG_VISIBLE };
