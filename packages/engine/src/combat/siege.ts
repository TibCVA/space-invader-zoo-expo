/**
 * Champ de bataille de siège : porte, trois segments de mur, deux tours,
 * cour intérieure et obstacles de faction.
 *
 * Conformément au document maître (§12.6), aucune balistique : les projectiles
 * des tours visent une pile et appliquent des **dégâts déterministes**.
 * Les murs ont trois états visuels : 0 intact, 1 fissuré, 2 effondré.
 */

import type {
  CombatObstacle,
  CombatState,
  CombatUnit,
  FactionId,
  GameEvent,
  GameState,
  HexCoord,
} from '../types.js';
import { HEX_ROWS } from '../types.js';
import { hexDistance, hexEquals, inBounds } from './hex.js';
import { COMBAT_TUNING, livingUnits, unitLabel, unitDef } from './units.js';
import { applyDamage } from './damage.js';
import { pushLog } from './log.js';

/** Colonne des remparts. Cour intérieure : colonnes 12 à 14. */
export const SIEGE_WALL_COL = 11;
/** Ligne de la porte. */
export const SIEGE_GATE_ROW = 5;
/** Colonne du fossé (Châtellenie) ou de la haie vive (Ermitage). */
export const SIEGE_MOAT_COL = 10;
/**
 * Positions des tours, dans la cour, **par ordre de construction**.
 *
 * La chaîne défensive en arme de plus en plus : deux tours d'angle avec les
 * Tours de guet, une troisième au-dessus de la porte avec la Citadelle, une
 * quatrième de flanquement avec le Château. C'est la progression de HMM3 —
 * le donjon de la Citadelle puis les deux tours du Château tirent à chaque
 * tour de jeu — et c'est ce qui fait qu'un Château se défend réellement
 * mieux qu'un simple rempart, au lieu d'être un libellé plus flatteur.
 */
export const SIEGE_TOWERS: readonly HexCoord[] = [
  { col: 12, row: 1 },
  { col: 12, row: 9 },
  { col: 13, row: 5 },
  { col: 13, row: 3 },
];

/** Nombre de tours posées par défaut, sans place forte connue. */
export const SIEGE_TOWERS_DEFAUT = 2;

/** Lignes couvertes par chacun des trois segments de mur. */
export const SIEGE_SEGMENT_ROWS: readonly (readonly number[])[] = [
  [0, 1, 2, 3],
  [4, 6],
  [7, 8, 9, 10],
];

export const SIEGE_SEGMENT_NAMES: readonly string[] = [
  'segment nord',
  'jouées de la porte',
  'segment sud',
];

/* ───────────────────────────── Identification ───────────────────────────── */

/** Pseudo-identifiant de cible pour une fortification (`attack`, `boulder`). */
export function fortificationUid(at: HexCoord): string {
  return `F${at.col}_${at.row}`;
}

export function parseFortificationUid(uid: string): HexCoord | null {
  if (uid.length < 4 || uid[0] !== 'F') return null;
  const rest = uid.slice(1);
  const sep = rest.indexOf('_');
  if (sep <= 0) return null;
  const col = Number.parseInt(rest.slice(0, sep), 10);
  const row = Number.parseInt(rest.slice(sep + 1), 10);
  if (!Number.isInteger(col) || !Number.isInteger(row)) return null;
  const h = { col, row };
  return inBounds(h) ? h : null;
}

/** Index du segment de mur contenant cette case, ou `null`. */
export function segmentOf(at: HexCoord): number | null {
  if (at.col !== SIEGE_WALL_COL) return null;
  for (let i = 0; i < SIEGE_SEGMENT_ROWS.length; i++) {
    if (SIEGE_SEGMENT_ROWS[i].includes(at.row)) return i;
  }
  return null;
}

export function segmentHexes(index: number): HexCoord[] {
  const rows = SIEGE_SEGMENT_ROWS[index] ?? [];
  return rows.map((row) => ({ col: SIEGE_WALL_COL, row }));
}

export function fortificationAt(combat: CombatState, at: HexCoord): CombatObstacle | null {
  for (const o of combat.obstacles) {
    if (!hexEquals(o.at, at)) continue;
    if (o.kind === 'mur' || o.kind === 'porte' || o.kind === 'tour') return o;
  }
  return null;
}

export function isFortification(o: CombatObstacle): boolean {
  return o.kind === 'mur' || o.kind === 'porte' || o.kind === 'tour';
}

/** La porte est-elle franchissable ? */
export function isGateOpen(combat: CombatState): boolean {
  const gate = fortificationAt(combat, { col: SIEGE_WALL_COL, row: SIEGE_GATE_ROW });
  if (!gate) return true;
  return gate.state === 2;
}

/* ─────────────────────────── Construction du champ ──────────────────────── */

/**
 * Installe la place forte. `faction` détermine l'habillage : fossé et pierre de
 * taille pour la Châtellenie, haie vive et mur de racines pour l'Ermitage.
 */
export function buildSiegeField(
  combat: CombatState,
  faction: FactionId,
  tours: number = SIEGE_TOWERS_DEFAUT,
): void {
  const obstacles: CombatObstacle[] = [];
  const wallHp = faction === 'granit'
    ? COMBAT_TUNING.wallSegmentHp
    : Math.floor((COMBAT_TUNING.wallSegmentHp * 8500) / 10000);

  for (let s = 0; s < SIEGE_SEGMENT_ROWS.length; s++) {
    for (const at of segmentHexes(s)) {
      obstacles.push({
        at,
        kind: 'mur',
        state: 0,
        hp: wallHp,
        blocksMove: true,
        blocksSight: true,
      });
    }
  }

  obstacles.push({
    at: { col: SIEGE_WALL_COL, row: SIEGE_GATE_ROW },
    kind: 'porte',
    state: 0,
    hp: COMBAT_TUNING.gateHp,
    blocksMove: true,
    blocksSight: true,
  });

  const posees = Math.max(0, Math.min(SIEGE_TOWERS.length, Math.trunc(tours)));
  for (const at of SIEGE_TOWERS.slice(0, posees)) {
    obstacles.push({
      at: { col: at.col, row: at.row },
      kind: 'tour',
      state: 0,
      hp: COMBAT_TUNING.towerHp,
      blocksMove: true,
      blocksSight: false,
    });
  }

  // Fossé / haie vive devant le rempart, interrompu devant la porte.
  for (let row = 0; row < HEX_ROWS; row++) {
    if (row === SIEGE_GATE_ROW) continue;
    obstacles.push({
      at: { col: SIEGE_MOAT_COL, row },
      kind: faction === 'granit' ? 'fosse' : 'ronce',
      state: 0,
      blocksMove: false,
      blocksSight: false,
    });
  }

  combat.obstacles = obstacles;
}

/** La case porte-t-elle un fossé ou une haie vive (dégâts à la traversée) ? */
export function hazardAt(combat: CombatState, at: HexCoord): CombatObstacle | null {
  for (const o of combat.obstacles) {
    if (!hexEquals(o.at, at)) continue;
    if (o.kind === 'fosse' || o.kind === 'ronce') return o;
  }
  return null;
}

/** Dégâts subis en traversant le fossé ou la haie vive. */
export function hazardDamage(unit: CombatUnit): number {
  const def = unitDef(unit);
  if (def.flying) return 0;
  return Math.max(1, Math.floor((unit.count * def.hp * 400) / 10000));
}

/* ──────────────────────────── Dégâts aux ouvrages ───────────────────────── */

function refreshState(o: CombatObstacle, maxHp: number): void {
  const hp = o.hp ?? 0;
  if (hp <= 0) {
    o.hp = 0;
    o.state = 2;
    o.blocksSight = false;
  } else if (hp * 3 <= maxHp * 2) {
    o.state = 1;
  } else {
    o.state = 0;
  }
}

export interface FortificationHit {
  /** ouvrage touché */
  kind: 'mur' | 'porte' | 'tour';
  label: string;
  /** dégâts réellement appliqués */
  damage: number;
  /** état après le coup */
  state: 0 | 1 | 2;
  destroyed: boolean;
}

/**
 * Applique des dégâts à une fortification. Les trois cases d'un même segment
 * partagent leurs points de structure : on les met toutes à jour ensemble.
 */
export function damageFortification(
  state: GameState,
  combat: CombatState,
  at: HexCoord,
  damage: number,
  events: GameEvent[],
): FortificationHit | null {
  const target = fortificationAt(combat, at);
  if (!target || target.state === 2) return null;

  const seg = target.kind === 'mur' ? segmentOf(at) : null;
  const group: CombatObstacle[] = [];
  if (seg !== null) {
    for (const h of segmentHexes(seg)) {
      const o = fortificationAt(combat, h);
      if (o && o.kind === 'mur') group.push(o);
    }
  } else {
    group.push(target);
  }

  const maxHp =
    target.kind === 'porte'
      ? COMBAT_TUNING.gateHp
      : target.kind === 'tour'
        ? COMBAT_TUNING.towerHp
        : COMBAT_TUNING.wallSegmentHp;

  const before = target.hp ?? 0;
  const after = Math.max(0, before - damage);
  for (const o of group) {
    o.hp = after;
    refreshState(o, maxHp);
  }

  const label =
    target.kind === 'porte'
      ? 'la porte'
      : target.kind === 'tour'
        ? 'la tour'
        : `le ${SIEGE_SEGMENT_NAMES[seg ?? 0]}`;

  const hit: FortificationHit = {
    kind: target.kind as 'mur' | 'porte' | 'tour',
    label,
    damage: before - after,
    state: (target.state ?? 0) as 0 | 1 | 2,
    destroyed: after <= 0,
  };

  pushLog(
    combat,
    events,
    'capacite',
    after <= 0
      ? `${capitalize(label)} s'effondre !`
      : target.state === 1
        ? `${capitalize(label)} se fissure (${after} points de structure).`
        : `${capitalize(label)} encaisse le choc (${after} points de structure).`,
    { degats: hit.damage, structure: after },
  );

  return hit;
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

/* ─────────────────────────────── Tours ──────────────────────────────────── */

/**
 * Volée des tours en début de round. Dégâts déterministes, cible la pile
 * assaillante la plus proche (puis le plus petit emplacement) : aucune
 * balistique, aucun aléa.
 */
export function siegeTowerVolley(state: GameState, combat: CombatState, events: GameEvent[]): void {
  if (!combat.siege) return;
  if (combat.round <= 1) return; // la première volée part au round 2
  const targets = livingUnits(combat, 0);
  if (targets.length === 0) return;

  for (const at of SIEGE_TOWERS) {
    const tower = fortificationAt(combat, at);
    if (!tower || tower.state === 2) continue;
    let best: CombatUnit | null = null;
    let bestDist = 0x7fffffff;
    for (const u of targets) {
      if (!u.alive) continue;
      const d = hexDistance(at, u.at);
      if (d < bestDist || (d === bestDist && best !== null && u.slot < best.slot)) {
        bestDist = d;
        best = u;
      }
    }
    if (!best) continue;
    const res = applyDamage(best, COMBAT_TUNING.towerDamage);
    pushLog(
      combat,
      events,
      'attaque',
      res.kills > 0
        ? `Un trait de la tour frappe ${unitLabel(best)} : ${res.kills} ${res.kills > 1 ? 'pertes' : 'perte'}.`
        : `Un trait de la tour frappe ${unitLabel(best)}.`,
      { cible: best.uid, degats: COMBAT_TUNING.towerDamage, pertes: res.kills },
    );
  }
}
