/**
 * Conséquences d'un combat : pertes, expérience, butin, capture de cité,
 * défaite du héros.
 *
 * Règle du document maître (§12.7) — un héros vaincu perd son armée, ses
 * artefacts non liés, et reste indisponible deux jours.
 */

import type {
  ArmyStack,
  ArtifactId,
  ArtifactSlot,
  CombatState,
  GameEvent,
  GameState,
  HeroInstance,
  PlayerId,
  Resources,
  TownState,
} from '../types.js';
import { artifactDef } from './content.js';
import { abilityOf, livingUnits, unitDef } from './units.js';
import { pushLog } from './log.js';

/** Jours d'indisponibilité d'un héros vaincu. */
export const HERO_DOWN_DAYS = 2;

/** Emplacements dont les artefacts sont liés au héros et ne se perdent pas. */
const BOUND_SLOTS: readonly ArtifactSlot[] = ['relique'];

/* ────────────────────────────── Utilitaires ─────────────────────────────── */

function armyFromSide(combat: CombatState, side: 0 | 1): (ArmyStack | null)[] {
  const out: (ArmyStack | null)[] = [null, null, null, null, null, null, null];
  for (const u of combat.units) {
    if (u.side !== side) continue;
    if (u.slot < 0 || u.slot > 6) continue; // invocations : elles disparaissent
    if (!u.alive || u.count <= 0) continue;
    out[u.slot] = { creature: u.creature, count: u.count };
  }
  return out;
}

/** Puissance des créatures tuées dans un camp (base de l'expérience). */
function killedPower(combat: CombatState, side: 0 | 1): number {
  let total = 0;
  for (const u of combat.units) {
    if (u.side !== side) continue;
    if (u.slot < 0) continue;
    const lost = u.startCount - (u.alive ? u.count : 0);
    if (lost <= 0) continue;
    total += lost * unitDef(u).power;
  }
  return total;
}

function heroOf(state: GameState, uid: string | null): HeroInstance | null {
  if (!uid) return null;
  return state.heroes[uid] ?? null;
}

/* ─────────────────────── Relèvement après la victoire ───────────────────── */

/**
 * Capacité `resurrect_after_win` (Pénitent Blanc) : une fraction des pertes se
 * relève une fois la bataille gagnée.
 */
function applyPostVictoryResurrection(
  combat: CombatState,
  winner: 0 | 1,
  events: GameEvent[],
): void {
  for (const u of combat.units) {
    if (u.side !== winner) continue;
    if (!u.alive || u.count <= 0) continue;
    const ab = abilityOf(unitDef(u), 'resurrect_after_win');
    if (!ab) continue;
    const lost = u.startCount - u.count;
    if (lost <= 0) continue;
    const back = Math.floor((lost * ab.bp) / 10000);
    if (back <= 0) continue;
    u.count += back;
    pushLog(
      combat,
      events,
      'capacite',
      `${back} ${back > 1 ? 'créatures se relèvent' : 'créature se relève'} après la victoire.`,
      { unite: u.uid, releves: back },
    );
  }
}

/* ──────────────────────────────── Butin ─────────────────────────────────── */

function unboundArtifacts(hero: HeroInstance): ArtifactId[] {
  const out: ArtifactId[] = [];
  for (const slot of Object.keys(hero.artifacts) as ArtifactSlot[]) {
    const id = hero.artifacts[slot];
    if (!id) continue;
    if (BOUND_SLOTS.includes(slot)) continue;
    const def = artifactDef(id);
    if (def && def.rarity === 'relique') continue;
    out.push(id);
  }
  for (const id of hero.backpack) out.push(id);
  return out;
}

/* ────────────────────────────── Résolution ──────────────────────────────── */

/**
 * Applique au monde le résultat du combat terminé, puis referme la phase de
 * combat. Retourne les événements produits.
 *
 * L'expérience est **appliquée ici** (`hero.xp += …`) et reportée dans
 * `combat.loot.xp` : l'appelant ne doit pas la créditer une seconde fois.
 */
export function resolveCombatOutcome(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const combat = state.combat;
  if (!combat) return events;
  if (!combat.finished || combat.winner === null) return events;

  const winner: 0 | 1 = combat.winner;
  const loser: 0 | 1 = winner === 0 ? 1 : 0;

  applyPostVictoryResurrection(combat, winner, events);

  const attackerHero = heroOf(state, combat.attacker.hero);
  const defenderHero = heroOf(state, combat.defender.hero);
  const winnerHero = winner === 0 ? attackerHero : defenderHero;
  const loserHero = winner === 0 ? defenderHero : attackerHero;
  const winnerPlayer: PlayerId | null =
    winner === 0 ? combat.attacker.player : combat.defender.player;
  const loserPlayer: PlayerId | null =
    winner === 0 ? combat.defender.player : combat.attacker.player;

  /* --- armées survivantes --- */
  const survivors = armyFromSide(combat, winner);
  if (winnerHero) winnerHero.army = survivors;

  const town: TownState | null = combat.defender.town
    ? (state.towns[combat.defender.town] ?? null)
    : null;
  if (town && winner === 1 && !defenderHero) {
    town.garrison = survivors;
  }

  /* --- expérience --- */
  const xp = Math.max(0, Math.floor(killedPower(combat, loser) / 2));
  if (winnerHero) {
    winnerHero.xp += xp;
  }

  /* --- butin --- */
  const lootResources: Partial<Resources> = {};
  const lootArtifacts: ArtifactId[] = [];

  if (loserHero) {
    const taken = unboundArtifacts(loserHero);
    for (const id of taken) lootArtifacts.push(id);
    for (const slot of Object.keys(loserHero.artifacts) as ArtifactSlot[]) {
      const id = loserHero.artifacts[slot];
      if (!id) continue;
      if (taken.includes(id)) delete loserHero.artifacts[slot];
    }
    loserHero.backpack = [];
    loserHero.army = [null, null, null, null, null, null, null];
    loserHero.movement = 0;
    loserHero.path = null;
    loserHero.downUntilTurn = state.turn + HERO_DOWN_DAYS;
    events.push({
      type: 'Notice',
      player: loserPlayer,
      text: `Le héros est vaincu : son armée est dispersée et il restera indisponible ${HERO_DOWN_DAYS} jours.`,
      severity: 'danger',
    });
  }

  // Rançon / dépouilles : proportionnelles aux pertes infligées.
  const spoils = Math.floor(killedPower(combat, loser) / 8);
  if (spoils > 0) lootResources.ecus = spoils;

  if (winnerPlayer) {
    const player = state.players[winnerPlayer];
    if (player) {
      if (lootResources.ecus) {
        player.resources.ecus += lootResources.ecus;
        events.push({
          type: 'ResourcesChanged',
          player: winnerPlayer,
          delta: { ecus: lootResources.ecus },
          reason: 'Dépouilles de la bataille',
        });
      }
      if (winnerHero) {
        for (const id of lootArtifacts) winnerHero.backpack.push(id);
      }
    }
  }

  combat.loot = { resources: lootResources, artifacts: lootArtifacts, xp };

  /* --- capture de cité --- */
  if (town && winner === 0 && combat.attacker.player) {
    const by = combat.attacker.player;
    const previous = town.owner;
    if (previous !== by) {
      if (previous) {
        const prev = state.players[previous];
        if (prev) prev.towns = prev.towns.filter((t) => t !== town.uid);
      }
      town.owner = by;
      town.visitingHero = null;
      town.garrisonHero = null;
      town.builtThisTurn = true;
      const newOwner = state.players[by];
      if (newOwner && !newOwner.towns.includes(town.uid)) newOwner.towns.push(town.uid);
      events.push({ type: 'TownCaptured', town: town.uid, by });
    }
  }

  /* --- journal --- */
  events.push({
    type: 'Notice',
    player: winnerPlayer,
    text:
      xp > 0
        ? `Victoire. Expérience gagnée : ${xp}.`
        : 'Victoire, sans grande gloire ni butin.',
    severity: 'info',
  });

  state.journal.push({
    turn: state.turn,
    player: winnerPlayer,
    text: winner === 0 ? "L'assaillant l'emporte." : 'La défense tient bon.',
    kind: 'combat',
  });

  state.combat = null;
  state.phase = 'aventure';
  return events;
}

/** Pertes détaillées d'un camp, pour l'écran de fin de bataille. */
export function casualtiesOf(combat: CombatState, side: 0 | 1): ArmyStack[] {
  const out: ArmyStack[] = [];
  for (const u of combat.units) {
    if (u.side !== side || u.slot < 0) continue;
    const lost = u.startCount - (u.alive ? u.count : 0);
    if (lost > 0) out.push({ creature: u.creature, count: lost });
  }
  return out;
}

/** Survivants d'un camp (identique à l'événement `CombatEnded`). */
export function survivingArmy(combat: CombatState, side: 0 | 1): (ArmyStack | null)[] {
  return armyFromSide(combat, side);
}

/** Nombre de piles encore debout, pour l'affichage. */
export function standingStacks(combat: CombatState, side: 0 | 1): number {
  return livingUnits(combat, side).length;
}
