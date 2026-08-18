/**
 * `@auvergne/bots` — intelligence artificielle d'aventure.
 *
 * Contrat imposé par `docs/02-API.md` :
 *
 * ```ts
 * export interface BotProfile { id: 'prudent'|'equilibre'|'agressif'|'expert'; name: string }
 * export function planTurn(state, world, player): Command[];
 * export function nextBotCommand(state, world, player): Command | null;
 * ```
 *
 * Trois garanties tiennent tout le paquet :
 *
 *  1. **Aucun `Math.random`.** Les rares départages passent par `botRng`, qui
 *     dérive une graine d'une *copie* de `state.rng` et ne fait jamais avancer
 *     le générateur de la partie.
 *  2. **Aucune commande invalide.** Le tour entier est joué d'abord sur un
 *     clone : une commande n'est retournée que si `applyCommand` l'a acceptée
 *     sur ce clone, dans l'ordre exact où elle sera rejouée.
 *  3. **Aucune triche.** Tout ce que l'IA sait du camp d'en face passe par
 *     `perceive()` (`common.ts`), qui n'expose que ce que le brouillard du
 *     joueur montre.
 *
 * Comme le plan est construit en simulant le tour, `runBotTurn` retourne aussi
 * l'état final et les événements : le harnais de simulation s'en sert pour
 * éviter de rejouer deux fois chaque commande.
 */
import {
  cloneState,
  gameConfig,
  weekOf,
  type Command,
  type GameEvent,
  type GameState,
  type HeroInstance,
  type MapCoord,
  type PlayerId,
  type TownState,
  type WorldMap,
} from '@auvergne/engine';

import { armyPowerOf, considerEngagement, guardPowerOf, profileArmy } from './army.js';
import { botRng, cells, perceive, sameCell, type Perception } from './common.js';
import {
  chooseBuilding,
  planCharter,
  planRecruits,
  planTrade,
  planUpgrade,
  type BlockedBuild,
} from './economy.js';
import { evaluatePosition } from './evaluate.js';
import {
  fallbackHome,
  firstReachable,
  rankTargets,
  type ReachableTarget,
  type Target,
} from './explore.js';
import {
  hasTroops,
  planEquip,
  planGarrisonTransfers,
  planHire,
  planLevelUp,
  planRegroup,
  readyToSortie,
  resupplyTown,
} from './hero.js';
import { botProfile, type BotProfile } from './profiles.js';
import { objectiveForRole, planStrategy, shouldRetreat, type StrategyPlan } from './strategy.js';

/* ── Réexports publics ───────────────────────────────────────────────────── */

export { BOT_PROFILES, BOT_PROFILE_IDS, botProfile } from './profiles.js';
export type {
  BotProfile,
  BotProfileId,
  BuildLine,
  EconomyWeights,
  EvalWeights,
  ExploreWeights,
  MilitaryWeights,
  ObjectiveKind,
  StrategyWeights,
} from './profiles.js';
export { evaluatePosition, perceivedLead, threatOnTown } from './evaluate.js';
export type { Evaluation } from './evaluate.js';
export {
  armyPowerOf,
  attackMultBp,
  considerEngagement,
  estimateBattle,
  guardPowerOf,
  profileArmy,
  strongestHero,
  topTier,
} from './army.js';
export type { ArmyProfile, BattleEstimate, Engagement } from './army.js';
export { perceive, travelEstimate } from './common.js';
export type { KnownPlace, KnownTown, Perception } from './common.js';
export { rankTargets, firstReachable } from './explore.js';
export type { Target, ReachableTarget, TargetKind } from './explore.js';
export { planStrategy, assignRoles, objectiveForRole } from './strategy.js';
export type { HeroRole, StrategyPlan } from './strategy.js';
export { chooseBuilding, planRecruits, linesFor } from './economy.js';
export { planLevelUp, planEquip, skillOfferValue } from './hero.js';

/* ── Budgets déterministes ───────────────────────────────────────────────── */

/**
 * Les budgets sont exprimés en **nombre d'opérations**, jamais en
 * millisecondes : une limite chronométrée rendrait le plan dépendant de la
 * machine et casserait la rejouabilité.
 *
 * Ils sont serrés pour une raison mesurée : `applyCommand` coûte
 * environ 27 ms en partie à cinq, dont la quasi-totalité en `hashState`, qui
 * repasse sur l'état entier à chaque commande. Comme la validation du plan
 * passe *par* `applyCommand`, chaque commande refusée coûte aussi cher qu'une
 * commande retenue. Tolérer quatre-vingt-dix refus, c'était s'autoriser deux
 * secondes et demie de calcul pur perdu, pour un budget de tour de 400 ms.
 */
const BUDGET = {
  /** appels à `computePath` autorisés pour un tour entier */
  paths: 30,
  /** commandes émises au maximum dans un tour (hors fin de tour) */
  commands: 120,
  /** commandes refusées tolérées avant d'abandonner une piste */
  refusals: 10,
  /** passes de déplacement par tour */
  moveRounds: 3,
  /** combats enchaînés résolus automatiquement dans un même tour */
  battles: 12,
} as const;

/* ── Contexte de planification ───────────────────────────────────────────── */

interface Planner {
  world: WorldMap;
  player: PlayerId;
  profile: BotProfile;
  state: GameState;
  commands: Command[];
  /** hash de l'état avant chaque commande, pour `nextBotCommand` */
  steps: { hash: string; command: Command }[];
  events: GameEvent[];
  view: Perception;
  plan: StrategyPlan;
  paths: number;
  refusals: number;
  battles: number;
  claimed: Set<string>;
  /** case occupée par chaque héros au lever du jour */
  origins: Map<string, MapCoord>;
  /** héros rentrés au logis : ils ne ressortent pas le jour même */
  resting: Set<string>;
}

function refreshView(planner: Planner): void {
  planner.view = perceive(planner.state, planner.world, planner.player);
}

/**
 * La partie est-elle terminée sur le clone ?
 *
 * Passer par une fonction n'est pas une coquetterie : `planner.state` est
 * réaffecté par `emit()`, et une lecture directe de `planner.state.phase`
 * laisserait TypeScript conserver un affinage de type devenu faux.
 */
function isOver(planner: Planner): boolean {
  return planner.state.phase === 'termine';
}

/**
 * Applique une commande au clone. Elle n'est retenue que si le moteur
 * l'accepte : c'est la garantie « aucune commande invalide » du brief.
 */
function emit(planner: Planner, command: Command): boolean {
  if (planner.commands.length >= BUDGET.commands) return false;
  if (planner.refusals >= BUDGET.refusals) return false;
  const before = planner.state.hash;
  const result = isOver(planner) ? null : applySafely(planner, command);
  if (!result || !result.ok) {
    planner.refusals++;
    return false;
  }
  planner.state = result.state;
  planner.commands.push(command);
  planner.steps.push({ hash: before, command });
  for (const event of result.events) planner.events.push(event);
  refreshView(planner);
  return true;
}

function applySafely(
  planner: Planner,
  command: Command,
): { state: GameState; events: GameEvent[]; ok: boolean } | null {
  try {
    return applyCommandRef(planner.state, command, planner.world);
  } catch {
    // Une exception du moteur ne doit jamais faire tomber le tour de l'IA :
    // la commande est simplement écartée et signalée dans le rapport.
    return null;
  }
}

// Import indirect : garde la trace unique du point d'entrée de mutation.
import { applyCommand as applyCommandRef } from '@auvergne/engine';

/* ── Combats ─────────────────────────────────────────────────────────────── */

/** Résout automatiquement tout combat en cours, dans la limite du budget. */
function resolveBattles(planner: Planner): void {
  let guard = 0;
  while (planner.state.phase === 'combat' && guard < BUDGET.battles) {
    guard++;
    planner.battles++;
    if (!emit(planner, { type: 'AutoResolveCombat' })) break;
  }
}

/* ── Phase 1 : intendance des héros ──────────────────────────────────────── */

function phaseHeroes(planner: Planner): void {
  for (const hero of planner.view.allHeroes) {
    const levelUp = planLevelUp(planner.profile, hero);
    if (levelUp) emit(planner, levelUp);
  }
  for (const hero of planner.view.allHeroes) {
    // Un héros peut porter plusieurs pièces le même jour.
    for (let i = 0; i < 4; i++) {
      const fresh = planner.state.heroes[hero.uid];
      if (!fresh) break;
      const equip = planEquip(fresh);
      if (!equip || !emit(planner, equip)) break;
    }
  }
}

/* ── Phase 2 : cités ─────────────────────────────────────────────────────── */

function phaseTowns(planner: Planner): void {
  const towns = planner.view.towns.slice();
  for (const town of towns) {
    const current = planner.state.towns[town.uid];
    if (!current || current.owner !== planner.player) continue;

    const charter = planCharter(planner.view, planner.profile, current);
    if (charter) emit(planner, charter);

    // Construction du jour, avec un passage par le marché si elle est bloquée
    // par une seule ressource.
    let blocked: BlockedBuild | null = null;
    const choice = chooseBuilding(planner.state, planner.view, planner.profile, current);
    if (choice.building) {
      emit(planner, { type: 'BuildInTown', town: current.uid, building: choice.building });
    } else {
      blocked = choice.blocked;
    }
    if (blocked) {
      const trade = planTrade(planner.state, planner.view, planner.profile, blocked);
      if (trade && emit(planner, trade)) {
        const again = chooseBuilding(
          planner.state,
          planner.view,
          planner.profile,
          planner.state.towns[town.uid],
        );
        if (again.building) {
          emit(planner, { type: 'BuildInTown', town: current.uid, building: again.building });
        }
      }
    }
  }

  const hire = planHire(planner.state, planner.view, planner.profile);
  if (hire) emit(planner, hire);

  for (const town of planner.view.towns.slice()) {
    const current = planner.state.towns[town.uid];
    if (!current) continue;
    const upgrade = planUpgrade(planner.state, planner.view, planner.profile, current);
    if (upgrade) emit(planner, upgrade);
  }

  for (const town of planner.view.towns.slice()) {
    const current = planner.state.towns[town.uid];
    if (!current) continue;
    const destination = recruitDestination(planner, current);
    for (const recruit of planRecruits(
      planner.state,
      planner.view,
      planner.profile,
      current,
      destination,
    )) {
      const command: Command = {
        type: 'RecruitCreatures',
        town: current.uid,
        creature: recruit.creature,
        count: recruit.count,
      };
      if (recruit.toHero) command.toHero = recruit.toHero;
      emit(planner, command);
    }
  }

  for (const town of planner.view.towns.slice()) {
    const current = planner.state.towns[town.uid];
    if (!current) continue;
    for (const move of planGarrisonTransfers(
      planner.state,
      planner.view,
      planner.profile,
      current,
    )) {
      emit(planner, move);
    }
  }

  for (const move of planRegroup(planner.view, planner.profile, planner.view.heroes)) {
    emit(planner, move);
  }
}

/**
 * Où verser les recrues : chez le héros qui visite la cité s'il est bien celui
 * qui va se battre, sinon en garnison — d'où elles remonteront plus tard.
 *
 * On ne se fie **pas** à `town.visitingHero` seul : le moteur ne le remet pas
 * à `null` quand le héros quitte la place (cf. rapport, bogue moteur nº 1), si
 * bien que le champ désigne encore un héros parti depuis vingt jours. Le
 * moteur refuserait alors le recrutement (« Ce héros n'est pas dans la
 * cité »), et la bannière thésauriserait sans jamais lever de troupes. On
 * vérifie donc la présence réelle.
 */
function recruitDestination(planner: Planner, town: TownState): string | null {
  const hero = presentHero(planner, town);
  if (!hero) return null;
  const role = planner.plan.roles[hero.uid];
  if (role === 'eclaireur') return null;
  return hero.uid;
}

/** Héros de la bannière réellement présent dans la cité, ou `null`. */
function presentHero(planner: Planner, town: TownState): HeroInstance | null {
  const uid = town.visitingHero;
  if (!uid) return null;
  const hero = planner.state.heroes[uid];
  if (!hero || hero.owner !== planner.player) return null;
  if (hero.downUntilTurn > planner.state.turn) return null;
  if (hero.inTown !== town.uid && !sameCell(hero.at, town.at)) return null;
  return hero;
}

/* ── Phase 3 : déplacements ──────────────────────────────────────────────── */

function phaseMovement(planner: Planner): void {
  const maxWeeks = gameConfig(planner.state).maxWeeks;

  // Case de départ du jour pour chaque héros : elle sert de garde-fou contre
  // le va-et-vient (cf. `wouldBacktrack`).
  planner.origins.clear();
  planner.resting.clear();
  for (const hero of planner.view.allHeroes) {
    planner.origins.set(hero.uid, { col: hero.at.col, row: hero.at.row });
  }

  for (let round = 0; round < BUDGET.moveRounds; round++) {
    let progressed = false;
    const order = movementOrder(planner);

    for (const uid of order) {
      const hero = planner.state.heroes[uid];
      if (!hero || hero.owner !== planner.player) continue;
      if (hero.downUntilTurn > planner.state.turn) continue;
      if (hero.movement <= 0) continue;
      if (planner.paths >= BUDGET.paths) break;

      if (moveOneHero(planner, hero, maxWeeks, round)) {
        progressed = true;
        resolveBattles(planner);
      }
      if (isOver(planner)) return;
    }
    if (!progressed) break;
  }
}

/**
 * Le héros reviendrait-il sur ses pas ?
 *
 * Sans ce garde-fou, la lisière du brouillard produit chaque matin une cible à
 * zéro journée de marche, dans une direction arbitraire : le héros part au
 * sud, dépense la moitié de ses points, trouve une nouvelle lisière au nord,
 * y retourne, et n'avance jamais. Le classement de `explore.ts` ne peut pas
 * voir ce piège, car il note chaque cible isolément. On l'impose donc ici :
 * une fois la journée entamée, une cible ne compte que si elle éloigne encore
 * le héros de sa case de départ.
 */
/**
 * La destination entamée la veille mérite-t-elle encore le voyage ?
 *
 * On ne relit que ce que le brouillard montre : un lieu déjà consommé ou déjà
 * passé sous notre bannière pendant la nuit ne vaut plus la marche, et le
 * héros reprend la main sur le classement du matin.
 */
function stillWorthwhile(planner: Planner, at: MapCoord): boolean {
  for (const known of planner.view.places) {
    if (!sameCell(known.obj.entrance, at)) continue;
    if (known.obj.spent) return false;
    if (known.obj.kind === 'mine' && known.obj.owner === planner.player) return false;
    return true;
  }
  for (const town of planner.view.towns) {
    // Rentrer chez soi reste légitime : la cité ravitaille.
    if (sameCell(town.at, at)) return true;
  }
  return true;
}

/**
 * Le classement du matin est-il *franchement* meilleur que la route en cours ?
 *
 * Persévérer est la règle, changer d'avis l'exception : il faut que la
 * nouvelle cible pèse le double de l'ancienne pour justifier d'abandonner
 * trois jours de marche. Sans ce facteur deux, l'IA hésiterait à chaque
 * lisière découverte et retomberait dans le va-et-vient.
 */
const ABANDON_FACTOR = 2;

function worthAbandoning(
  ranked: readonly Target[],
  filtered: readonly Target[],
  destination: MapCoord,
): boolean {
  if (filtered.length === 0) return false;
  const best = filtered[0];
  if (sameCell(best.at, destination)) return false;
  let committed = 0;
  for (const target of ranked) {
    if (sameCell(target.at, destination)) {
      committed = target.score;
      break;
    }
  }
  return best.score > committed * ABANDON_FACTOR && best.score > 0;
}

function wouldBacktrack(planner: Planner, hero: HeroInstance, at: MapCoord): boolean {
  const origin = planner.origins.get(hero.uid);
  if (!origin) return false;
  const travelled = cells(hero.at, origin);
  if (travelled === 0) return false;
  return cells(at, origin) < travelled;
}

/** Ordre de jeu des héros : la tête d'abord, puis les autres par identifiant. */
function movementOrder(planner: Planner): string[] {
  const roles = planner.plan.roles;
  const rank = (uid: string): number => {
    switch (roles[uid]) {
      case 'tete':
        return 0;
      case 'garde':
        return 1;
      case 'ramasseur':
        return 2;
      default:
        return 3;
    }
  };
  return planner.view.allHeroes
    .map((hero) => hero.uid)
    .sort((a, b) => {
      const ra = rank(a);
      const rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a < b ? -1 : 1;
    });
}

function moveOneHero(
  planner: Planner,
  hero: HeroInstance,
  maxWeeks: number,
  round: number,
): boolean {
  const role = planner.plan.roles[hero.uid] ?? 'ramasseur';
  const view = planner.view;
  const profile = planner.profile;

  // Un héros sans troupe rentre se refaire : il ne sert à rien dehors.
  if (!hasTroops(hero)) {
    const home = fallbackHome(planner.state, planner.world, view, hero);
    if (home && !sameCell(home, hero.at)) {
      planner.paths++;
      return emit(planner, { type: 'MoveHero', hero: hero.uid, to: home });
    }
    return false;
  }

  // Le héros de tête ne sort pas tant qu'il n'est pas assez fourni.
  if (
    role === 'tete' &&
    hero.inTown !== null &&
    !readyToSortie(planner.state, profile, hero) &&
    weekOf(planner.state.turn) <= 3
  ) {
    return false;
  }

  // Repli si une force supérieure est visible à portée.
  if (shouldRetreat(view, profile, hero) && role !== 'tete') {
    const home = fallbackHome(planner.state, planner.world, view, hero);
    if (home && !sameCell(home, hero.at)) {
      planner.paths++;
      return emit(planner, { type: 'MoveHero', hero: hero.uid, to: home });
    }
  }

  // Ravitaillement : la garnison qui attend au logis pèse le double de ce que
  // porte le héros. Il rentre la chercher — et s'arrête là pour la journée,
  // faute de quoi il ressortirait aussitôt sans avoir rien pris (les
  // transferts n'ont lieu qu'à la phase des cités, le lendemain matin).
  if (role !== 'eclaireur' && !planner.resting.has(hero.uid)) {
    const depot = resupplyTown(planner.state, planner.world, view, hero);
    if (depot) {
      planner.paths++;
      planner.resting.add(hero.uid);
      return emit(planner, { type: 'MoveHero', hero: hero.uid, to: depot.at });
    }
  }
  if (planner.resting.has(hero.uid)) return false;

  const objective = objectiveForRole(planner.plan, role);
  const ranked = rankTargets(planner.state, planner.world, view, profile, hero, {
    objective,
    maxWeeks,
    claimed: planner.claimed,
  });

  const filtered = ranked.filter(
    (target) => !wouldBacktrack(planner, hero, target.at) && acceptable(planner, hero, target),
  );

  // Route entamée la veille : on la poursuit, sauf si le jour s'est levé sur
  // franchement mieux. C'est cette mémoire d'un jour sur l'autre qui manquait
  // le plus à l'IA — sans elle, un héros reclasse ses cibles chaque matin,
  // repart dans une direction neuve et n'arrive jamais nulle part.
  if (round === 0 && hero.path && hero.path.length >= 2) {
    const last = hero.path[hero.path.length - 1];
    if (stillWorthwhile(planner, last) && !worthAbandoning(ranked, filtered, last)) {
      planner.paths++;
      if (emit(planner, { type: 'MoveHero', hero: hero.uid, to: last })) return true;
    }
  }
  const reachable = pickReachable(planner, hero, filtered);
  if (!reachable) return false;

  planner.claimed.add(`${reachable.at.col},${reachable.at.row}`);
  const before = hero.at;
  const moved = emit(planner, { type: 'MoveHero', hero: hero.uid, to: reachable.destination });
  if (!moved) return false;

  // Arrivé sur place sans que le moteur ait déclenché la visite : on la demande.
  const after = planner.state.heroes[hero.uid];
  if (
    after &&
    planner.state.phase !== 'combat' &&
    reachable.object &&
    sameCell(after.at, reachable.at) &&
    !sameCell(before, after.at)
  ) {
    const object = planner.state.objects[reachable.object];
    if (object && !object.spent && (!object.guard || object.guard.length === 0)) {
      emit(planner, { type: 'HeroInteract', hero: hero.uid, object: reachable.object });
    }
  }
  return true;
}

/**
 * Conversion d'un point de puissance d'armée en points de gain.
 *
 * Les coûts de recrutement du contenu donnent, du rang 1 au rang 4, un écu de
 * dépense pour un point de puissance à un dixième près. Comme `explore.ts`
 * compte un butin à neuf points de gain par écu de valeur, un point de
 * puissance perdu vaut neuf points de gain. Le rapport n'est pas une
 * convention : c'est ce qui permet de comparer une perte à un butin.
 */
const POWER_TO_GAIN = 9;

/**
 * Prime de valeur stratégique des cibles militaires.
 *
 * Abattre un héros, prendre une cité ou lever un sceau vaut bien au-delà du
 * butin immédiat : c'est du terrain, du revenu et du temps volés à l'autre.
 */
function prizeMultiplier(kind: Target['kind']): number {
  switch (kind) {
    case 'sceau':
    case 'tresor':
      return 3;
    case 'cite':
    case 'bourg':
    case 'heros':
      return 2;
    default:
      return 1;
  }
}

/** Pertes si faibles qu'on ne discute pas : l'expérience seule les paie. */
const FREE_LOSS_BP = 300;

/** La cible est-elle jouable : garde battable, cité prenable, proie plus faible ? */
function acceptable(planner: Planner, hero: HeroInstance, target: Target): boolean {
  if (target.guard <= 0) return true;
  const mine = profileArmy(hero.army, hero);
  const kind =
    target.kind === 'sceau' || target.kind === 'tresor'
      ? 'sceau'
      : target.kind === 'heros'
        ? 'duel'
        : target.kind === 'cite' || target.kind === 'bourg'
          ? 'siege'
          : 'garde';

  const defender = defenderProfileOf(planner, target);
  const verdict = considerEngagement(mine, defender, kind, planner.profile, {
    siege: kind === 'siege',
    walls: kind === 'siege' ? 1 : 0,
  });
  if (!verdict.go) return false;

  // Gagner ne suffit pas : il faut que la victoire vaille son prix. Une armée
  // amputée du quart pour un tas de bois est une armée perdue pour la suite —
  // c'est ainsi que les profils offensifs se ruinaient bataille après
  // bataille tout en gagnant chacune d'elles.
  if (verdict.lossBp <= FREE_LOSS_BP) return true;
  const lostPower = bpOf(mine.power, verdict.lossBp);
  const lossValue = lostPower * POWER_TO_GAIN;
  const prize = target.gain * prizeMultiplier(target.kind);
  return lossValue <= prize;
}

/** `value × bp / 10000`, tronqué. Copie locale pour éviter un import circulaire. */
function bpOf(value: number, ratio: number): number {
  return Math.trunc((value * ratio) / 10000);
}

function defenderProfileOf(planner: Planner, target: Target): ReturnType<typeof profileArmy> {
  if (target.enemyHero) {
    const enemy = planner.state.heroes[target.enemyHero];
    if (enemy) return profileArmy(enemy.army, enemy);
  }
  if (target.object) {
    const object = planner.state.objects[target.object];
    if (object && object.guard && object.guard.length > 0) {
      const army = object.guard.map((stack) => ({ ...stack }));
      return profileArmy(army, null);
    }
  }
  if (target.town) {
    const town = planner.state.towns[target.town];
    if (town) {
      const captain = town.garrisonHero ? planner.state.heroes[town.garrisonHero] : null;
      return profileArmy(town.garrison, captain ?? null);
    }
  }
  // Garnison estimée : on fabrique un adversaire fictif de puissance connue.
  return {
    hp: Math.max(1, Math.trunc(target.guard / 18)),
    rawDamage: Math.max(1, Math.trunc(target.guard / 26)),
    attack: 10,
    defense: 10,
    initiative: 10,
    shooterBp: 0,
    power: target.guard,
    stacks: 1,
  };
}

function pickReachable(
  planner: Planner,
  hero: HeroInstance,
  targets: readonly Target[],
): ReachableTarget | null {
  const left = Math.max(0, BUDGET.paths - planner.paths);
  if (left === 0) return null;
  const slice = targets.slice(0, Math.min(planner.profile.explore.shortlist, left));
  planner.paths += slice.length;
  return firstReachable(planner.state, planner.world, planner.profile, hero, slice);
}

/* ── Point d'entrée ──────────────────────────────────────────────────────── */

export interface BotTurn {
  /** commandes validées, à rejouer dans cet ordre */
  commands: Command[];
  /** état obtenu après les avoir toutes appliquées */
  state: GameState;
  /** événements produits pendant la simulation */
  events: GameEvent[];
  /** plan stratégique retenu */
  plan: StrategyPlan;
  /** hash de l'état avant chaque commande */
  steps: { hash: string; command: Command }[];
  /** combats résolus automatiquement */
  battles: number;
}

/**
 * Joue le tour complet d'une bannière sur un **clone** de l'état, et retourne
 * à la fois la suite de commandes validées et l'état final.
 *
 * L'appelant ordinaire (`planTurn`) n'utilise que les commandes ; le harnais
 * de simulation réutilise l'état pour ne pas payer deux fois chaque
 * `applyCommand`.
 */
export function runBotTurn(state: GameState, world: WorldMap, player: PlayerId): BotTurn {
  const profile = botProfile(state.players[player]?.aiProfile);
  const sim = cloneState(state);
  const view = perceive(sim, world, player);

  const planner: Planner = {
    world,
    player,
    profile,
    state: sim,
    commands: [],
    steps: [],
    events: [],
    view,
    plan: planStrategy(sim, world, view, profile),
    paths: 0,
    refusals: 0,
    battles: 0,
    claimed: new Set<string>(),
    origins: new Map<string, MapCoord>(),
    resting: new Set<string>(),
  };

  const alive = sim.players[player]?.alive === true;
  if (!alive || isOver(planner)) {
    return {
      commands: planner.commands,
      state: planner.state,
      events: planner.events,
      plan: planner.plan,
      steps: planner.steps,
      battles: 0,
    };
  }

  // Un combat laissé en suspens passe avant tout le reste.
  resolveBattles(planner);

  if (sim.activePlayer === player && !isOver(planner)) {
    phaseHeroes(planner);
    phaseTowns(planner);
    // Les rôles sont recalculés une fois les recrues versées : le héros de
    // tête n'est pas forcément celui du matin.
    planner.plan = planStrategy(planner.state, world, planner.view, profile);
    phaseMovement(planner);
    // Dernier passage d'intendance : les combats ont pu donner des niveaux.
    phaseHeroes(planner);
    if (!isOver(planner)) emit(planner, { type: 'EndTurn' });
  }

  return {
    commands: planner.commands,
    state: planner.state,
    events: planner.events,
    plan: planner.plan,
    steps: planner.steps,
    battles: planner.battles,
  };
}

/**
 * Séquence de commandes du tour, à appliquer une par une.
 * Signature imposée par `docs/02-API.md`.
 */
export function planTurn(state: GameState, world: WorldMap, player: PlayerId): Command[] {
  return cachedTurn(state, world, player).commands;
}

/**
 * Un seul coup, pour un déroulé animé côté client.
 *
 * Le plan complet est mémorisé avec le hash de l'état qui précède chaque
 * commande : appelée en boucle après chaque application, la fonction retrouve
 * sa place dans le plan au lieu de tout recalculer.
 */
export function nextBotCommand(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
): Command | null {
  for (const entry of memo) {
    if (entry.player !== player || entry.gameId !== state.id) continue;
    for (const step of entry.turn.steps) {
      if (step.hash === state.hash) return step.command;
    }
  }
  const turn = cachedTurn(state, world, player);
  for (const step of turn.steps) {
    if (step.hash === state.hash) return step.command;
  }
  return turn.commands.length > 0 ? turn.commands[0] : null;
}

/* ── Mémoire de plan ─────────────────────────────────────────────────────── */

interface MemoEntry {
  gameId: string;
  player: PlayerId;
  hash: string;
  turn: BotTurn;
}

const MEMO_MAX = 4;
const memo: MemoEntry[] = [];

function cachedTurn(state: GameState, world: WorldMap, player: PlayerId): BotTurn {
  for (let i = 0; i < memo.length; i++) {
    const entry = memo[i];
    if (entry.gameId === state.id && entry.player === player && entry.hash === state.hash) {
      return entry.turn;
    }
  }
  const turn = runBotTurn(state, world, player);
  memo.unshift({ gameId: state.id, player, hash: state.hash, turn });
  if (memo.length > MEMO_MAX) memo.length = MEMO_MAX;
  return turn;
}

/** Purge la mémoire des plans. Réservé aux tests et au changement de partie. */
export function resetBotMemory(): void {
  memo.length = 0;
}

/* ── Diagnostic ──────────────────────────────────────────────────────────── */

/**
 * Lecture complète de la décision d'une bannière : objectif retenu, notes des
 * six objectifs, évaluation de la position, rôles des héros. Sert au rapport
 * d'équilibrage et aux tests.
 */
export function explainTurn(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
): {
  profile: BotProfile;
  plan: StrategyPlan;
  evaluation: ReturnType<typeof evaluatePosition>;
  targets: Target[];
} {
  const profile = botProfile(state.players[player]?.aiProfile);
  const view = perceive(state, world, player);
  const plan = planStrategy(state, world, view, profile);
  const evaluation = evaluatePosition(state, world, player, profile, view);
  const hero = view.heroes[0];
  const targets = hero
    ? rankTargets(state, world, view, profile, hero, {
        objective: plan.objective,
        maxWeeks: gameConfig(state).maxWeeks,
        claimed: new Set<string>(),
      }).slice(0, 10)
    : [];
  return { profile, plan, evaluation, targets };
}

/* ── Utilitaires exposés pour les tests ──────────────────────────────────── */

/** Distance en cases entre deux points, exposée pour les tests. */
export { cells as cellDistance, botRng, sameCell };
export type { MapCoord, GameEvent };
export { guardPowerOf as guardPower };
export { armyPowerOf as armyPower };
