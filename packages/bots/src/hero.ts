/**
 * Gestion des héros : **recrutement à l'auberge**, **répartition des
 * troupes**, **choix des montées de niveau**, **équipement des artefacts**.
 *
 * Un principe guide tout le fichier : une bannière gagne avec *un* héros de
 * tête bien fourni, pas avec quatre armées moyennes. Les héros
 * supplémentaires servent à ramasser, à découvrir et à harceler ; les piles
 * lourdes remontent vers le héros de tête dès qu'elles se croisent.
 */
import { ARTIFACTS, SKILLS } from '@auvergne/content';
import {
  HERO_HIRE_COST,
  HERO_LIMIT,
  canEquip,
  freeSlotFor,
  townHasGrant,
  weekOf,
  type ArmyStack,
  type ArtifactSlot,
  type Command,
  type GameState,
  type HeroInstance,
  type SkillId,
  type TownState,
  type WorldMap,
} from '@auvergne/engine';

import { armyPowerOf, garrisonTarget, pourInto, strongestHero } from './army.js';
import { bp, daysAway, sameCell, type Perception } from './common.js';
import { threatOnTown } from './evaluate.js';
import type { BotProfile } from './profiles.js';

/* ── Montées de niveau ───────────────────────────────────────────────────── */

/**
 * Valeur d'une compétence pour un profil, en points.
 *
 * Les quatre profils ne cherchent pas la même chose : le prudent veut de la
 * défense et du revenu, l'agressif de l'initiative et du moral, l'expert de la
 * logistique — le tempo est sa monnaie — et l'équilibré un peu de tout.
 */
const SKILL_VALUE: Readonly<Record<string, Readonly<Record<SkillId, number>>>> = {
  prudent: {
    forges: 100,
    resistance: 92,
    intendance: 90,
    seigneurie: 78,
    guerison: 76,
    commerce: 70,
    logistique: 62,
    diplomatie: 58,
    fortune: 55,
    commandement: 54,
    tactique: 52,
    erudition: 46,
    pelerinage: 44,
    occultisme: 42,
    balistique: 40,
    reconnaissance: 38,
    cartographie: 36,
    sylviculture: 34,
    embuscade: 30,
    invocation: 28,
  },
  equilibre: {
    logistique: 94,
    seigneurie: 86,
    forges: 84,
    intendance: 82,
    commandement: 78,
    fortune: 74,
    tactique: 72,
    guerison: 68,
    resistance: 64,
    erudition: 58,
    occultisme: 56,
    reconnaissance: 54,
    commerce: 52,
    diplomatie: 50,
    cartographie: 48,
    balistique: 44,
    sylviculture: 42,
    pelerinage: 40,
    embuscade: 38,
    invocation: 32,
  },
  agressif: {
    commandement: 100,
    seigneurie: 94,
    tactique: 90,
    fortune: 86,
    embuscade: 82,
    logistique: 80,
    forges: 70,
    balistique: 66,
    occultisme: 60,
    guerison: 58,
    resistance: 52,
    reconnaissance: 50,
    cartographie: 48,
    sylviculture: 44,
    erudition: 40,
    intendance: 36,
    pelerinage: 32,
    diplomatie: 30,
    commerce: 26,
    invocation: 24,
  },
  expert: {
    logistique: 100,
    commandement: 92,
    seigneurie: 90,
    forges: 86,
    fortune: 82,
    tactique: 80,
    intendance: 78,
    guerison: 74,
    erudition: 66,
    occultisme: 64,
    resistance: 62,
    cartographie: 58,
    reconnaissance: 56,
    embuscade: 52,
    balistique: 48,
    sylviculture: 46,
    commerce: 44,
    diplomatie: 42,
    pelerinage: 38,
    invocation: 30,
  },
};

/** Note d'une offre de compétence, rang compris. */
export function skillOfferValue(
  profile: BotProfile,
  hero: HeroInstance,
  skill: SkillId,
  rank: number,
): number {
  const table = SKILL_VALUE[profile.id] ?? SKILL_VALUE.equilibre;
  const base = table[skill] ?? 40;
  const known = hero.skills.find((s) => s.skill === skill);
  // Monter un rang sur une compétence déjà tenue vaut mieux que disperser.
  const upgradeBonus = known ? 22 + known.rank * 8 : 0;
  // Le contenu peut exposer une compétence inconnue de la table : on n'en meurt pas.
  const exists = SKILLS[skill] ? 0 : -20;
  return base * rank + upgradeBonus + exists;
}

/** Commande de montée de niveau pour un héros qui attend son choix. */
export function planLevelUp(profile: BotProfile, hero: HeroInstance): Command | null {
  const pending = hero.pendingLevelUp;
  if (!pending) return null;
  const [a, b] = pending.choices;
  const va = skillOfferValue(profile, hero, a.skill, a.rank);
  const vb = skillOfferValue(profile, hero, b.skill, b.rank);
  const chosen = vb > va ? b : a;
  return { type: 'ChooseLevelUp', hero: hero.uid, skill: chosen.skill };
}

/* ── Artefacts ───────────────────────────────────────────────────────────── */

const RARITY_VALUE: Readonly<Record<string, number>> = {
  commun: 1,
  rare: 2,
  majeur: 3,
  relique: 4,
};

/**
 * Équipe l'artefact le plus précieux encore en besace. Si l'emplacement est
 * pris par une pièce moins précieuse, on remplace ; le moteur renvoie
 * l'ancienne pièce en besace tout seul.
 */
export function planEquip(hero: HeroInstance): Command | null {
  if (hero.backpack.length === 0) return null;
  const sorted = hero.backpack.slice().sort((x, y) => {
    const dx = ARTIFACTS[x];
    const dy = ARTIFACTS[y];
    const rx = dx ? (RARITY_VALUE[dx.rarity] ?? 0) : 0;
    const ry = dy ? (RARITY_VALUE[dy.rarity] ?? 0) : 0;
    if (rx !== ry) return ry - rx;
    return x < y ? -1 : 1;
  });

  for (const id of sorted) {
    const def = ARTIFACTS[id];
    if (!def) continue;
    const free = freeSlotFor(hero, def);
    if (free) {
      const verdict = canEquip(hero, id, free);
      if (verdict.ok) return { type: 'EquipArtifact', hero: hero.uid, artifact: id, slot: free };
      continue;
    }
    // Emplacement occupé : on ne remplace que par plus précieux.
    const slot = def.slot as ArtifactSlot;
    const worn = hero.artifacts[slot];
    if (!worn) continue;
    const wornDef = ARTIFACTS[worn];
    const wornValue = wornDef ? (RARITY_VALUE[wornDef.rarity] ?? 0) : 0;
    if ((RARITY_VALUE[def.rarity] ?? 0) <= wornValue) continue;
    const verdict = canEquip(hero, id, slot);
    if (verdict.ok) return { type: 'EquipArtifact', hero: hero.uid, artifact: id, slot };
  }
  return null;
}

/* ── Recrutement de héros ────────────────────────────────────────────────── */

/**
 * Faut-il engager un héros de plus ? Le profil fixe la cible ; on n'engage
 * que si l'auberge est libre, le trésor confortable, et si les héros déjà en
 * poste ne suffisent pas à couvrir le terrain.
 */
export function planHire(
  state: GameState,
  view: Perception,
  profile: BotProfile,
): Command | null {
  if (view.allHeroes.length >= Math.min(HERO_LIMIT, profile.military.heroTarget)) return null;
  const purse = view.self.resources.ecus | 0;
  const needed = HERO_HIRE_COST + profile.economy.reserveEcus;
  if (purse < needed) return null;
  if (view.self.tavernOffers.length === 0) return null;

  for (const town of view.towns) {
    if (!townHasGrant(town, 'tavern')) continue;
    if (town.visitingHero) continue;
    for (const candidate of view.self.tavernOffers.slice().sort()) {
      // Un héros déjà en jeu ne peut pas être engagé une seconde fois.
      let taken = false;
      for (const uid of Object.keys(state.heroes).sort()) {
        if (state.heroes[uid].def === candidate) taken = true;
      }
      if (taken) continue;
      return { type: 'HireHero', town: town.uid, hero: candidate };
    }
  }
  return null;
}

/* ── Répartition des troupes ─────────────────────────────────────────────── */

/**
 * Transferts entre une garnison et le héros qui visite la cité.
 *
 * Deux sens possibles :
 *  - la garnison verse au héros de tête ce qui dépasse le plancher de défense ;
 *  - un héros de passage dépose ce qu'il faut pour tenir la place quand la
 *    garnison est en dessous de son plancher.
 */
export function planGarrisonTransfers(
  state: GameState,
  view: Perception,
  profile: BotProfile,
  town: TownState,
): Command[] {
  const uid = town.visitingHero;
  if (!uid) return [];
  const hero = state.heroes[uid];
  if (!hero || hero.owner !== view.player) return [];
  if (hero.downUntilTurn > state.turn) return [];
  // `town.visitingHero` survit au départ du héros (bogue moteur nº 1) : sans
  // cette vérification on échangerait des troupes avec un héros absent, et le
  // moteur refuserait chaque commande.
  if (hero.inTown !== town.uid && !sameCell(hero.at, town.at)) return [];

  let totalPower = 0;
  for (const h of view.allHeroes) totalPower += armyPowerOf(h.army);
  for (const t of view.towns) totalPower += armyPowerOf(t.garrison);

  const threat = threatOnTown(view, town, profile.economy.defenseTrigger);
  const floor = garrisonTarget(profile, town, totalPower, threat, view.towns.length);
  const garrisonPower = armyPowerOf(town.garrison);
  const lead = strongestHero(view.heroes);
  const isLead = lead !== null && lead.uid === hero.uid;

  const commands: Command[] = [];

  if (garrisonPower > floor && isLead) {
    // La garnison verse son excédent au héros de tête.
    const moves = pourInto(town.garrison, hero.army, floor);
    for (const move of moves) {
      commands.push({
        type: 'SwapArmy',
        a: { kind: 'garrison', uid: town.uid },
        b: { kind: 'hero', uid: hero.uid },
        slotA: move.slotFrom,
        slotB: move.slotTo,
        count: move.count,
      });
    }
  } else if (garrisonPower < floor && !isLead && armyPowerOf(hero.army) > floor) {
    // Un héros secondaire laisse de quoi tenir la place.
    const moves = pourInto(hero.army, town.garrison, floor);
    for (const move of moves.slice(0, 2)) {
      commands.push({
        type: 'SwapArmy',
        a: { kind: 'hero', uid: hero.uid },
        b: { kind: 'garrison', uid: town.uid },
        slotA: move.slotFrom,
        slotB: move.slotTo,
        count: move.count,
      });
    }
  }
  return commands;
}

/**
 * Regroupement de deux héros alliés sur la même case : le plus faible verse
 * ses troupes au plus fort. C'est le geste qui transforme trois armées tièdes
 * en une armée décisive.
 */
export function planRegroup(
  view: Perception,
  profile: BotProfile,
  heroes: readonly HeroInstance[],
): Command[] {
  const commands: Command[] = [];
  for (let i = 0; i < heroes.length; i++) {
    for (let j = i + 1; j < heroes.length; j++) {
      const a = heroes[i];
      const b = heroes[j];
      if (!sameCell(a.at, b.at)) continue;
      const pa = armyPowerOf(a.army);
      const pb = armyPowerOf(b.army);
      const strong = pa >= pb ? a : b;
      const weak = pa >= pb ? b : a;
      const weakPower = armyPowerOf(weak.army);
      if (weakPower <= 0) continue;
      const strongPower = armyPowerOf(strong.army);
      // On ne regroupe que si l'écart justifie de vider le plus faible.
      if (strongPower < bp(weakPower, profile.military.regroupBp)) continue;
      for (const move of pourInto(weak.army, strong.army, 0)) {
        commands.push({
          type: 'SwapArmy',
          a: { kind: 'hero', uid: weak.uid },
          b: { kind: 'hero', uid: strong.uid },
          slotA: move.slotFrom,
          slotB: move.slotTo,
          count: move.count,
        });
      }
      return commands; // un regroupement par tour suffit
    }
  }
  return commands;
}

/* ── Ravitaillement ──────────────────────────────────────────────────────── */

/** La garnison doit peser ce multiple du héros pour justifier le retour. */
const RESUPPLY_RATIO = 2;
/** Au-delà de ce nombre de journées, le voyage coûte plus qu'il ne rapporte. */
const RESUPPLY_MAX_DAYS = 3;

/**
 * Cité où le héros devrait rentrer chercher ses renforts, ou `null`.
 *
 * Sans cette règle, une bannière lève des troupes tous les matins, les empile
 * dans sa capitale, et laisse son héros de tête courir la campagne avec
 * l'armée du premier jour : il n'ose plus attaquer la moindre garde, ne gagne
 * plus d'expérience, et la partie s'enlise — c'est très exactement ce que
 * faisaient les quatre profils dans les premières parties simulées.
 *
 * On en fait une décision **franche** plutôt qu'une cible notée : une cible
 * notée réapparaît dès que le héros a fait un pas hors des murs, et le héros
 * passe la partie à faire la navette. Ici, il rentre quand la garnison pèse
 * le double de ce qu'il porte, et il s'arrête pour la journée en arrivant.
 */
export function resupplyTown(
  state: GameState,
  world: WorldMap,
  view: Perception,
  hero: HeroInstance,
): TownState | null {
  const ours = armyPowerOf(hero.army);
  let best: TownState | null = null;
  let bestDays = RESUPPLY_MAX_DAYS + 1;
  for (const town of view.towns) {
    if (hero.inTown === town.uid || sameCell(hero.at, town.at)) continue;
    const waiting = armyPowerOf(town.garrison);
    if (waiting <= 0) continue;
    if (waiting < ours * RESUPPLY_RATIO) continue;
    const days = daysAway(state, world, view.player, hero, town.at);
    if (days > RESUPPLY_MAX_DAYS) continue;
    if (days < bestDays || (days === bestDays && best !== null && town.uid < best.uid)) {
      best = town;
      bestDays = days;
    }
  }
  return best;
}

/**
 * Le héros est-il assez fourni pour sortir de sa capitale ?
 * Le seuil monte avec les semaines : sortir avec vingt manants au jour 40
 * revient à offrir de l'expérience à l'adversaire.
 */
export function readyToSortie(
  state: GameState,
  profile: BotProfile,
  hero: HeroInstance,
): boolean {
  const week = weekOf(state.turn);
  const threshold = profile.military.sortiePower + (week - 1) * 260;
  return armyPowerOf(hero.army) >= Math.min(threshold, profile.military.sortiePower * 6);
}

/** Le héros porte-t-il encore quelque chose ? Un héros nu ne doit pas errer. */
export function hasTroops(hero: HeroInstance): boolean {
  for (const stack of hero.army as (ArmyStack | null)[]) {
    if (stack && stack.count > 0) return true;
  }
  return false;
}
