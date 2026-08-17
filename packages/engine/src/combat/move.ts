/**
 * Déplacement sur le champ de bataille : portée atteignable et chemins.
 *
 * Parcours en largeur sur les 165 hexagones, coût 1 par case. Les piles
 * volantes ignorent les obstacles intermédiaires mais doivent se poser sur une
 * case libre. La capacité « zone de contrôle » arrête la première pile qui la
 * traverse.
 */

import { HEX_COLS, HEX_ROWS, type CombatState, type CombatUnit, type HexCoord } from '../types.js';
import { hexDistance, hexKey, hexLine, inBounds, keyToHex, neighbors } from './hex.js';
import {
  canStand,
  enemiesOf,
  hasAbility,
  hexesFor,
  movementPoints,
  unitDef,
  unitHexes,
} from './units.js';

export interface ReachNode {
  /** coût en hexagones depuis la position de départ */
  cost: number;
  /** clef de l'hexagone précédent, -1 pour le départ */
  prev: number;
  /** vrai si la case est un cul-de-sac imposé (zone de contrôle) */
  locked: boolean;
}

/** Hexagones sous zone de contrôle ennemie pour la pile donnée. */
export function controlledHexes(combat: CombatState, unit: CombatUnit): Set<number> {
  const out = new Set<number>();
  for (const e of enemiesOf(combat, unit)) {
    if (!hasAbility(unitDef(e), 'zone_of_control')) continue;
    for (const h of unitHexes(e)) {
      for (const n of neighbors(h)) out.add(hexKey(n));
    }
  }
  return out;
}

/**
 * Carte des cases atteignables, indexée par `hexKey`. Contient toujours la
 * position de départ (coût 0).
 */
export function reachMap(combat: CombatState, unit: CombatUnit): Map<number, ReachNode> {
  const map = new Map<number, ReachNode>();
  const def = unitDef(unit);
  const budget = movementPoints(combat, unit);
  const start = unit.at;
  map.set(hexKey(start), { cost: 0, prev: -1, locked: false });
  if (budget <= 0) return map;

  const zoc = controlledHexes(combat, unit);

  if (def.flying) {
    // Vol : toute case posable dans le rayon de vitesse, obstacles ignorés.
    for (let row = 0; row < HEX_ROWS; row++) {
      for (let col = 0; col < HEX_COLS; col++) {
        const h: HexCoord = { col, row };
        const d = hexDistance(start, h);
        if (d === 0 || d > budget) continue;
        if (!canStand(combat, unit, h, def)) continue;
        map.set(hexKey(h), { cost: d, prev: hexKey(start), locked: false });
      }
    }
    return map;
  }

  // Marche : parcours en largeur, coût uniforme.
  let frontier: number[] = [hexKey(start)];
  for (let step = 1; step <= budget; step++) {
    const next: number[] = [];
    for (const fromKey of frontier) {
      const node = map.get(fromKey);
      if (!node || node.locked) continue;
      const from = keyToHex(fromKey);
      for (const n of neighbors(from)) {
        const key = hexKey(n);
        if (map.has(key)) continue;
        if (!inBounds(n)) continue;
        if (!canStand(combat, unit, n, def)) continue;
        const locked = zoc.has(key);
        map.set(key, { cost: step, prev: fromKey, locked });
        next.push(key);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return map;
}

/** Cases où la pile peut se rendre ce tour-ci, position de départ comprise. */
export function reachableHexes(combat: CombatState, unit: CombatUnit): HexCoord[] {
  const map = reachMap(combat, unit);
  const out: HexCoord[] = [];
  for (const key of map.keys()) out.push(keyToHex(key));
  out.sort((a, b) => a.row - b.row || a.col - b.col);
  return out;
}

/**
 * Chemin complet (départ inclus) jusqu'à `to`, ou `null` si la case n'est pas
 * atteignable ce tour-ci.
 */
export function hexPath(combat: CombatState, unit: CombatUnit, to: HexCoord): HexCoord[] | null {
  if (!inBounds(to)) return null;
  const def = unitDef(unit);
  const map = reachMap(combat, unit);
  const target = map.get(hexKey(to));
  if (!target) return null;
  if (def.flying) {
    if (hexKey(to) === hexKey(unit.at)) return [unit.at];
    // Trajectoire droite pour l'animation ; le vol ignore les obstacles.
    return hexLine(unit.at, to);
  }
  const path: HexCoord[] = [];
  let key = hexKey(to);
  for (let guard = 0; guard < 256; guard++) {
    path.push(keyToHex(key));
    const node = map.get(key);
    if (!node || node.prev < 0) break;
    key = node.prev;
  }
  path.reverse();
  return path;
}

/**
 * Chemin le plus court **sans limite de mouvement**, utilisé par l'IA pour
 * savoir vers où avancer quand la cible est hors de portée. Retourne `null`
 * si aucune route n'existe.
 */
export function fullPath(combat: CombatState, unit: CombatUnit, to: HexCoord): HexCoord[] | null {
  const def = unitDef(unit);
  if (!inBounds(to)) return null;
  if (!canStand(combat, unit, to, def)) return null;
  if (def.flying) return hexLine(unit.at, to);

  const prev = new Map<number, number>();
  const startKey = hexKey(unit.at);
  const goalKey = hexKey(to);
  prev.set(startKey, -1);
  let frontier: number[] = [startKey];
  let found = startKey === goalKey;
  for (let step = 0; step < 200 && !found && frontier.length > 0; step++) {
    const next: number[] = [];
    for (const fromKey of frontier) {
      const from = keyToHex(fromKey);
      for (const n of neighbors(from)) {
        const key = hexKey(n);
        if (prev.has(key)) continue;
        if (!canStand(combat, unit, n, def)) continue;
        prev.set(key, fromKey);
        if (key === goalKey) {
          found = true;
          break;
        }
        next.push(key);
      }
      if (found) break;
    }
    frontier = next;
  }
  if (!found) return null;
  const path: HexCoord[] = [];
  let key = goalKey;
  for (let guard = 0; guard < 256; guard++) {
    path.push(keyToHex(key));
    const p = prev.get(key);
    if (p === undefined || p < 0) break;
    key = p;
  }
  path.reverse();
  return path;
}

/**
 * Case la plus avancée du chemin que la pile peut réellement atteindre ce
 * tour-ci. Retourne `null` si elle ne peut pas bouger.
 */
export function advanceAlong(
  combat: CombatState,
  unit: CombatUnit,
  path: HexCoord[],
): HexCoord | null {
  const map = reachMap(combat, unit);
  let best: HexCoord | null = null;
  let bestCost = -1;
  for (const step of path) {
    const node = map.get(hexKey(step));
    if (!node) continue;
    if (node.cost > bestCost) {
      bestCost = node.cost;
      best = step;
    }
  }
  if (!best || bestCost <= 0) return null;
  return best;
}

/** Toutes les cases d'où `unit` pourrait frapper `target` ce tour-ci. */
export function reachableAttackHexes(
  combat: CombatState,
  unit: CombatUnit,
  target: CombatUnit,
): { at: HexCoord; cost: number }[] {
  const map = reachMap(combat, unit);
  const out: { at: HexCoord; cost: number }[] = [];
  const seen = new Set<number>();
  const def = unitDef(unit);
  for (const th of unitHexes(target)) {
    for (const n of neighbors(th)) {
      const key = hexKey(n);
      if (seen.has(key)) continue;
      const node = map.get(key);
      if (!node) continue;
      // La case doit accueillir la pile entière.
      const cells = hexesFor(unit, n, def);
      let ok = true;
      for (const c of cells) {
        if (!inBounds(c)) ok = false;
      }
      if (!ok) continue;
      seen.add(key);
      out.push({ at: n, cost: node.cost });
    }
  }
  out.sort((a, b) => a.cost - b.cost || a.at.row - b.at.row || a.at.col - b.at.col);
  return out;
}
