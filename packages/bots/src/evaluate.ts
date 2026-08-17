/**
 * Fonction d'évaluation d'une position.
 *
 * Elle rend un **entier** : la valeur de la position pour une bannière, du
 * point de vue de son profil. Sept familles y contribuent — économie, armée,
 * territoire, sceaux, menaces, tempo, objectifs de victoire — chacune
 * pondérée par le profil (`profiles.ts`), ce qui suffit à donner des lectures
 * franchement divergentes de la même position : là où l'agressif voit une
 * armée décisive, le prudent voit un revenu insuffisant et une capitale nue.
 *
 * Contrainte de sincérité : l'évaluation ne lit du camp adverse que ce que le
 * brouillard montre (`perceive`). Ce qu'elle ignore, elle le remplace par une
 * estimation prudente tirée du calendrier, jamais par la vérité cachée.
 */
import {
  RESOURCE_KEYS,
  playerIncomeOf,
  weekOf,
  type GameState,
  type PlayerId,
  type WorldMap,
} from '@auvergne/engine';

import { armyPowerOf, profileArmy } from './army.js';
import { bp, cells, perceive, worthOf, type Perception } from './common.js';
import type { BotProfile } from './profiles.js';

/** Détail de l'évaluation, utile aux tests et au rapport d'équilibrage. */
export interface Evaluation {
  player: PlayerId;
  total: number;
  economy: number;
  army: number;
  territory: number;
  seals: number;
  threat: number;
  tempo: number;
  victory: number;
}

/* ── Réglages communs à tous les profils ─────────────────────────────────── */

const TUNING = {
  /** valeur d'un point de puissance d'armée, avant pondération de profil */
  armyUnit: 1,
  /** diviseur de la trésorerie convertie en écus de référence */
  treasuryDivisor: 12,
  /** un point de revenu quotidien vaut ce nombre de points, avant pondération */
  incomeUnit: 3,
  /** distance (cases) au-delà de laquelle un héros adverse ne menace plus */
  threatRange: 46,
  /** menace maximale retenue pour une seule cité */
  threatCap: 40000,
  /** points par case explorée, avant pondération */
  exploredUnit: 1,
  /** progression de développement attendue par semaine (bâtiments) */
  buildingsPerWeek: 4,
  /** puissance d'armée attendue par semaine, pour le tempo */
  powerPerWeek: 2600,
} as const;

/* ── Évaluation ──────────────────────────────────────────────────────────── */

/**
 * Évalue la position d'un joueur. Fonction pure, entière et déterministe.
 * `view` peut être fourni pour éviter de reconstruire la perception.
 */
export function evaluatePosition(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
  profile: BotProfile,
  view?: Perception,
): Evaluation {
  const p = state.players[player];
  const empty: Evaluation = {
    player,
    total: 0,
    economy: 0,
    army: 0,
    territory: 0,
    seals: 0,
    threat: 0,
    tempo: 0,
    victory: 0,
  };
  if (!p) return empty;
  if (!p.alive) return { ...empty, total: -1000000 };

  const perception = view ?? perceive(state, world, player);
  const weights = profile.eval;

  /* — Économie : trésorerie et revenu quotidien — */
  const treasury = worthOf(p.resources as unknown as Record<string, number>);
  const income = playerIncomeOf(state, player);
  let incomeWorth = 0;
  for (const key of RESOURCE_KEYS) {
    const amount = income[key];
    if (amount) incomeWorth += amount * (key === 'ecus' ? 1 : 6);
  }
  const economy =
    bp(Math.trunc(treasury / TUNING.treasuryDivisor), weights.treasuryBp) +
    bp(incomeWorth * TUNING.incomeUnit, weights.incomeBp);

  /* — Armée : héros au champ et garnisons — */
  let power = 0;
  let heroLevels = 0;
  for (const hero of perception.allHeroes) {
    power += armyPowerOf(hero.army);
    heroLevels += hero.level;
  }
  for (const town of perception.towns) power += armyPowerOf(town.garrison);
  const army =
    bp(power * TUNING.armyUnit, weights.armyBp) + heroLevels * weights.heroLevel;

  /* — Territoire : cités, bâtiments, gisements, brouillard levé — */
  let territory = 0;
  let buildings = 0;
  for (const town of perception.towns) {
    territory += town.isCapital ? weights.capital : weights.town;
    buildings += town.built.length;
  }
  territory += buildings * weights.building;
  let mines = 0;
  for (const place of perception.places) {
    if (place.obj.kind === 'mine' && place.obj.owner === player) mines++;
  }
  territory += mines * weights.mine;
  territory += bp(perception.explored * TUNING.exploredUnit, weights.exploredBp);

  /* — Sceaux — */
  const seals = p.seals.length * weights.seal;

  /* — Menaces : héros adverses visibles près de nos places — */
  let threatRaw = 0;
  for (const town of perception.towns) {
    let worst = 0;
    for (const enemy of perception.enemyHeroes) {
      const distance = cells(enemy.at, town.at);
      if (distance > TUNING.threatRange) continue;
      const enemyPower = armyPowerOf(enemy.army);
      const defence = armyPowerOf(town.garrison);
      const net = enemyPower - defence;
      if (net <= 0) continue;
      const proximity = 10000 - Math.trunc((distance * 10000) / TUNING.threatRange);
      const value = bp(net, proximity);
      if (value > worst) worst = value;
    }
    threatRaw += Math.min(TUNING.threatCap, worst);
  }
  const threat = -bp(threatRaw, weights.threatBp);

  /* — Tempo : sommes-nous en avance sur le calendrier ? — */
  const week = weekOf(state.turn);
  const expectedBuildings = week * TUNING.buildingsPerWeek;
  const expectedPower = week * TUNING.powerPerWeek;
  const buildingLead = buildings - expectedBuildings;
  const powerLead = Math.trunc((power - expectedPower) / 40);
  const tempo = bp((buildingLead * 120 + powerLead) * 10, weights.tempoBp);

  /* — Objectifs de victoire — */
  let victory = 0;
  if (state.claim) {
    victory += state.claim.by === player ? weights.claim : -weights.enemyClaim;
  }
  // Détenir la Maison du Trésor vaut en soi, même sans proclamation ouverte.
  for (const place of perception.places) {
    if (place.obj.kind !== 'maison_tresor') continue;
    if (place.obj.owner === player) victory += Math.trunc(weights.claim / 2);
    else if (place.obj.owner !== null) victory -= Math.trunc(weights.enemyClaim / 3);
  }

  const total = economy + army + territory + seals + threat + tempo + victory;
  return { player, total, economy, army, territory, seals, threat, tempo, victory };
}

/**
 * Écart d'évaluation entre nous et le meilleur rival **tel que nous le
 * percevons**. Positif = nous menons. Sert à l'expert pour choisir entre
 * prendre le tempo et se couvrir.
 */
export function perceivedLead(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
  profile: BotProfile,
  view?: Perception,
): number {
  const perception = view ?? perceive(state, world, player);
  const mine = evaluatePosition(state, world, player, profile, perception).total;

  let best = 0;
  for (const id of state.turnOrder) {
    if (id === player) continue;
    const rival = state.players[id];
    if (!rival || !rival.alive) continue;
    // On ne lit ni son trésor ni ses plans : on additionne ce qui est visible.
    let visible = 0;
    for (const known of perception.enemyTowns) {
      if (known.town.owner !== id) continue;
      visible += known.town.isCapital ? profile.eval.capital : profile.eval.town;
      visible += known.town.built.length * profile.eval.building;
      if (known.fresh) visible += bp(armyPowerOf(known.town.garrison), profile.eval.armyBp);
    }
    for (const hero of perception.enemyHeroes) {
      if (hero.owner !== id) continue;
      visible += bp(armyPowerOf(hero.army), profile.eval.armyBp);
      visible += hero.level * profile.eval.heroLevel;
    }
    // Sceaux : leur prise est annoncée publiquement, donc légitimement connue.
    visible += rival.seals.length * profile.eval.seal;
    // Ce qui reste caché est estimé au niveau attendu du calendrier.
    visible += weekOf(state.turn) * 900;
    if (visible > best) best = visible;
  }
  return mine - best;
}

/**
 * Menace pesant sur une cité, en puissance d'armée adverse **visible**.
 * Utilisée par `economy.ts` (filière défense) et `strategy.ts`.
 */
export function threatOnTown(
  perception: Perception,
  town: { at: { col: number; row: number }; garrison: unknown },
  range: number,
): number {
  let worst = 0;
  for (const enemy of perception.enemyHeroes) {
    if (cells(enemy.at, town.at) > range) continue;
    const power = armyPowerOf(enemy.army);
    if (power > worst) worst = power;
  }
  return worst;
}

/** Puissance visible la plus élevée dans le camp d'en face, tous héros confondus. */
export function strongestVisibleEnemy(perception: Perception): number {
  let best = 0;
  for (const enemy of perception.enemyHeroes) {
    const profile = profileArmy(enemy.army, enemy);
    if (profile.power > best) best = profile.power;
  }
  return best;
}
