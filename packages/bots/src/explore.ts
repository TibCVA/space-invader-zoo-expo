/**
 * Choix des cibles de carte : **gain contre risque contre distance**, et
 * gestion du brouillard.
 *
 * La carte du Forez compte plus de trois cents lieux. Calculer un vrai chemin
 * vers chacun coûterait plusieurs secondes par tour — inacceptable. On
 * procède donc en deux temps, comme un capitaine qui regarde d'abord sa carte
 * avant d'envoyer un éclaireur :
 *
 *  1. **classement bon marché** — tous les lieux *connus* reçoivent un score
 *     entier à partir d'une estimation de distance à vol d'oiseau corrigée du
 *     terrain exploré (`travelEstimate`) ;
 *  2. **liste courte** — seules les `shortlist` meilleures cibles reçoivent un
 *     vrai `computePath`, qui tranche l'accessibilité et le nombre de
 *     journées.
 *
 * Le brouillard est traité comme une cible à part entière : une lisière vaut
 * des points, d'autant plus que le profil est curieux (`fogBonus`). Une carte
 * connue vaut mieux qu'une carte vide, mais moins qu'un gisement.
 */
import { ARTIFACTS, CREATURES } from '@auvergne/content';
import {
  computePath,
  pathDayCount,
  type GameState,
  type HeroInstance,
  type MapCoord,
  type MapObject,
  type WorldMap,
} from '@auvergne/engine';

import { armyPowerOf, guardPowerOf } from './army.js';
import { bp, cells, daysAway, travelEstimate, type Perception } from './common.js';
import type { BotProfile, ObjectiveKind } from './profiles.js';

/* ── Cibles ──────────────────────────────────────────────────────────────── */

export type TargetKind =
  | 'ressource'
  | 'caravane'
  | 'gisement'
  | 'artefact'
  | 'sceau'
  | 'tresor'
  | 'bourg'
  | 'cite'
  | 'heros'
  | 'lisiere'
  | 'auberge'
  | 'sanctuaire'
  | 'belvedere'
  | 'source'
  | 'borne'
  | 'quete'
  | 'garde'
  | 'repli';

export interface Target {
  kind: TargetKind;
  at: MapCoord;
  /** identifiant du lieu visé, s'il y en a un */
  object: string | null;
  /** identifiant de la cité visée, s'il y en a une */
  town: string | null;
  /** identifiant du héros adverse visé, s'il y en a un */
  enemyHero: string | null;
  /** valeur brute de la cible, en points */
  gain: number;
  /** puissance de la garde qui la défend */
  guard: number;
  /** journées de marche estimées */
  days: number;
  /** note finale, entière */
  score: number;
}

/* ── Valeurs de référence ────────────────────────────────────────────────── */

const GAIN = {
  /** un point de valeur de ressource ramassée */
  resourceUnit: 9,
  /** un gisement pris à la dernière heure vaut encore ce nombre de jours */
  mineFloorDays: 10,
  artefactCommun: 900,
  artefactRare: 1800,
  artefactMajeur: 3200,
  artefactRelique: 5200,
  sceau: 26000,
  tresor: 34000,
  bourgNeutre: 9000,
  citeAdverse: 14000,
  heroAdverse: 6000,
  auberge: 700,
  sanctuaire: 1400,
  belvedere: 1500,
  source: 500,
  borne: 900,
  quete: 2200,
  gardeSeule: 1200,
  lisiere: 1000,
  repli: 800,
} as const;

/** Pénalité de risque : la garde est convertie en points selon notre force. */
function riskPoints(guard: number, ourPower: number): number {
  if (guard <= 0) return 0;
  if (ourPower <= 0) return guard * 4;
  // Une garde deux fois plus forte que nous coûte très cher ; une garde
  // dérisoire ne coûte presque rien.
  return Math.trunc((guard * guard) / Math.max(1, ourPower));
}

/* ── Construction des cibles ─────────────────────────────────────────────── */

function resourceGain(obj: MapObject): number {
  const amount = Number(obj.data.amount ?? 0) | 0;
  const key = String(obj.data.resource ?? 'ecus');
  const worth =
    key === 'ecus'
      ? 1
      : key === 'bois' || key === 'granit'
        ? 6
        : key === 'fer' || key === 'sel'
          ? 9
          : 14;
  const ecus = Number(obj.data.ecus ?? 0) | 0;
  return (amount * worth + Math.trunc(ecus / 8)) * GAIN.resourceUnit;
}

function artefactGain(obj: MapObject): number {
  const id = String(obj.data.artifact ?? '');
  const def = ARTIFACTS[id];
  const rarity = def ? def.rarity : String(obj.data.rarity ?? 'commun');
  switch (rarity) {
    case 'relique':
      return GAIN.artefactRelique;
    case 'majeur':
      return GAIN.artefactMajeur;
    case 'rare':
      return GAIN.artefactRare;
    default:
      return GAIN.artefactCommun;
  }
}

/**
 * Valeur d'un gisement : c'est une **rente**, pas un magot.
 *
 * Un gisement verse `amount` unités par jour jusqu'à la fin de la partie ; sa
 * valeur est donc le produit du rendement, du cours de la ressource et des
 * jours restants — la même monnaie que celle d'un tas ramassé au bord du
 * chemin (`resourceGain`). On escompte le tout de moitié : une rente se perd,
 * un tas ramassé est acquis.
 *
 * Ce détail décide de la partie. Les écus tombent tout seuls des cités, mais
 * le bois, le granit et le fer ne viennent que des gisements : une bannière
 * qui les néglige accumule une trésorerie inutile et ne bâtit plus rien
 * passé la quatrième demeure.
 */
function mineGain(
  state: GameState,
  view: Perception,
  obj: MapObject,
  maxWeeks: number,
): number {
  const amount = Math.max(1, Number(obj.data.amount ?? 1) | 0);
  const key = String(obj.data.resource ?? 'ecus');
  const worth =
    key === 'ecus'
      ? 1
      : key === 'bois' || key === 'granit'
        ? 6
        : key === 'fer' || key === 'sel'
          ? 9
          : 14;
  const daysLeft = Math.max(GAIN.mineFloorDays, maxWeeks * 7 - state.turn);
  const base = Math.trunc((amount * worth * daysLeft * GAIN.resourceUnit) / 2);
  return bp(base, famineBp(view, key));
}

/**
 * Multiplicateur de disette.
 *
 * Le cours d'une ressource ne dit pas ce qu'elle vaut *pour nous ce matin*.
 * Une bannière assise sur cent mille écus mais sans un lingot de fer ne peut
 * plus rien bâtir : le prochain gisement de fer vaut alors trois fois son
 * cours, et le péage voisin ne vaut presque rien. C'est exactement la
 * situation dans laquelle les premières parties simulées enlisaient les
 * quatre profils.
 */
function famineBp(view: Perception, key: string): number {
  const stock = (view.self.resources as unknown as Record<string, number>)[key] | 0;
  if (key === 'ecus') {
    // Les écus tombent des cités : ils ne manquent jamais longtemps.
    return stock >= 6000 ? 5000 : 10000;
  }
  if (stock <= 4) return 30000;
  if (stock <= 12) return 20000;
  if (stock <= 30) return 13000;
  return 10000;
}

/**
 * Valeur brute d'un lieu pour une bannière, avant distance et risque.
 * Retourne 0 si le lieu n'a plus rien à offrir.
 */
function placeGain(
  state: GameState,
  view: Perception,
  obj: MapObject,
  maxWeeks: number,
): { gain: number; kind: TargetKind } | null {
  if (obj.spent) return null;
  const mine = view.player;
  switch (obj.kind) {
    case 'ressource':
      return { gain: resourceGain(obj), kind: 'ressource' };
    case 'caravane':
      return { gain: resourceGain(obj), kind: 'caravane' };
    case 'artefact':
      return { gain: artefactGain(obj), kind: 'artefact' };
    case 'mine':
      return obj.owner === mine
        ? null
        : { gain: mineGain(state, view, obj, maxWeeks), kind: 'gisement' };
    case 'sceau':
      return obj.owner === mine ? null : { gain: GAIN.sceau, kind: 'sceau' };
    case 'maison_tresor':
      return { gain: GAIN.tresor, kind: 'tresor' };
    case 'auberge':
      return (obj.visitedBy ?? []).includes(mine) ? null : { gain: GAIN.auberge, kind: 'auberge' };
    case 'sanctuaire':
      return (obj.visitedBy ?? []).includes(mine)
        ? null
        : { gain: GAIN.sanctuaire, kind: 'sanctuaire' };
    case 'belvedere':
      return (obj.visitedBy ?? []).includes(mine)
        ? null
        : { gain: GAIN.belvedere, kind: 'belvedere' };
    case 'source':
      return { gain: GAIN.source, kind: 'source' };
    case 'borne':
      return (obj.visitedBy ?? []).includes(mine) ? null : { gain: GAIN.borne, kind: 'borne' };
    case 'quete':
      return (obj.visitedBy ?? []).includes(mine) ? null : { gain: GAIN.quete, kind: 'quete' };
    case 'garde':
      return { gain: GAIN.gardeSeule + guardXpGain(obj), kind: 'garde' };
    default:
      return null;
  }
}

/** L'expérience arrachée à une garde neutre vaut, elle aussi, quelque chose. */
function guardXpGain(obj: MapObject): number {
  let power = 0;
  for (const stack of obj.guard ?? []) {
    const def = CREATURES[stack.creature];
    if (def) power += def.power * stack.count;
  }
  return Math.trunc(power / 6);
}

/* ── Pondération par objectif ────────────────────────────────────────────── */

/** Prime accordée à une cible selon l'objectif à moyen terme en cours. */
function objectiveBonusBp(kind: TargetKind, objective: ObjectiveKind): number {
  switch (objective) {
    case 'sceaux':
      return kind === 'sceau' ? 22000 : kind === 'garde' ? 11000 : 10000;
    case 'tresor':
      return kind === 'tresor' ? 26000 : kind === 'sceau' ? 15000 : 9000;
    case 'expansion':
      return kind === 'gisement' || kind === 'bourg'
        ? 17000
        : kind === 'ressource' || kind === 'caravane'
          ? 12000
          : 10000;
    case 'harcelement':
      return kind === 'heros' || kind === 'cite'
        ? 20000
        : kind === 'gisement'
          ? 13000
          : 9000;
    /* La conquête ne regarde qu'une chose : les cités adverses. Tout le
       reste — glaner, fortifier, courir après un éclaireur — est du temps
       que l'ennemi met à profit pour se refaire. */
    case 'conquete':
      return kind === 'cite' ? 34000 : kind === 'heros' ? 13000 : 6000;
    case 'defense':
      return kind === 'repli' ? 30000 : kind === 'heros' ? 12000 : 7000;
    case 'developpement':
    default:
      return kind === 'ressource' || kind === 'caravane' || kind === 'gisement' ? 13000 : 10000;
  }
}

/* ── Classement ──────────────────────────────────────────────────────────── */

export interface RankOptions {
  objective: ObjectiveKind;
  /** semaines de partie, pour capitaliser la valeur des gisements */
  maxWeeks: number;
  /** cases déjà réservées par un autre héros ce tour-ci */
  claimed: ReadonlySet<string>;
}

/**
 * Classe les cibles d'un héros, du meilleur au moins bon, sans calculer un
 * seul chemin exact. La liste est tronquée à `shortlist × 3` pour rester
 * bornée : l'appelant n'a besoin que du sommet.
 */
export function rankTargets(
  state: GameState,
  world: WorldMap,
  view: Perception,
  profile: BotProfile,
  hero: HeroInstance,
  options: RankOptions,
): Target[] {
  const ourPower = armyPowerOf(hero.army);
  const home = view.capital ? view.capital.at : hero.at;
  const leash = profile.explore.leash;
  const out: Target[] = [];

  const push = (target: Target): void => {
    const key = `${target.at.col},${target.at.row}`;
    if (options.claimed.has(key)) return;
    /*
     * La laisse tient le héros près de sa capitale — sauf quand il part
     * finir la guerre. Sur une carte de deux cent cinquante-six colonnes,
     * une capitale adverse est à plus de deux cents cases : un profil à
     * laisse courte (70 cases pour le prudent, 130 pour l'équilibré) ne
     * pouvait littéralement JAMAIS marcher sur l'ennemi, donc jamais
     * gagner, puisque la victoire ne s'obtient plus qu'en prenant les
     * châteaux. Un repli et une conquête ignorent la laisse.
     */
    const horsLaisse = target.kind === 'repli' || (target.kind === 'cite' && options.objective === 'conquete');
    if (leash > 0 && !horsLaisse && cells(target.at, home) > leash) return;
    out.push(target);
  };

  /* — Lieux de carte connus — */
  /*
   * L'évaluation fine (`scored` → `daysAway`, quarante échantillons de
   * terrain) coûtait un tour d'IA entier depuis la densification : sept cents
   * lieux connus au lieu de deux cents, et le pire tour de début de partie
   * passait de 333 à 510 ms — au-dessus de la marge du brief. Or le classement
   * ne garde qu'une liste courte : évaluer finement le sept-centième lieu le
   * plus lointain n'a jamais changé une décision. On trie donc au vol
   * d'oiseau, on n'évalue finement que les cent plus proches — et tous les
   * gros gains, quelle que soit leur distance : une Maison du Trésor à l'autre
   * bout du pays reste une cible.
   */
  const EVALUES_MAX = 100;
  const GAIN_TOUJOURS = 2000;
  const candidats: { obj: (typeof view.places)[number]['obj']; gain: ReturnType<typeof placeGain>; d: number }[] = [];
  for (const known of view.places) {
    const valued = placeGain(state, view, known.obj, options.maxWeeks);
    if (!valued || valued.gain <= 0) continue;
    candidats.push({ obj: known.obj, gain: valued, d: cells(hero.at, known.obj.entrance) });
  }
  candidats.sort((a, z) => a.d - z.d || a.obj.uid.localeCompare(z.obj.uid));
  const retenus =
    candidats.length <= EVALUES_MAX
      ? candidats
      : candidats.filter((c, k) => k < EVALUES_MAX || (c.gain?.gain ?? 0) >= GAIN_TOUJOURS);
  for (const { obj, gain: valued } of retenus) {
    if (!valued) continue;
    const guard = guardPowerOf(obj.guard);
    // Nous sommes déjà sur l'entrée et la garde tient toujours : la journée
    // d'hier n'a rien donné, insister ne donnera rien de plus. Le héros doit
    // repartir, sans quoi il campe indéfiniment sur un lieu qu'il ne peut pas
    // prendre (cf. rapport, bogue moteur nº 2).
    if (guard > 0 && cells(hero.at, obj.entrance) === 0) continue;
    push(
      scored(
        state,
        world,
        view,
        profile,
        hero,
        {
          kind: valued.kind,
          at: obj.entrance,
          object: obj.uid,
          town: null,
          enemyHero: null,
          gain: valued.gain,
          guard,
          days: 0,
          score: 0,
        },
        ourPower,
        options.objective,
      ),
    );
  }

  /* — Bourgs neutres et cités adverses — */
  for (const known of view.neutralTowns) {
    push(
      scored(
        state,
        world,
        view,
        profile,
        hero,
        {
          kind: 'bourg',
          at: known.town.at,
          object: null,
          town: known.town.uid,
          enemyHero: null,
          gain: GAIN.bourgNeutre + known.town.built.length * 400,
          guard: known.fresh ? armyPowerOf(known.town.garrison) : estimateGarrison(state, known.town.isCapital),
          days: 0,
          score: 0,
        },
        ourPower,
        options.objective,
      ),
    );
  }
  for (const known of view.enemyTowns) {
    push(
      scored(
        state,
        world,
        view,
        profile,
        hero,
        {
          kind: 'cite',
          at: known.town.at,
          object: null,
          town: known.town.uid,
          enemyHero: null,
          /*
           * Une cité adverse ne vaut pas son butin : elle vaut ce qu'elle
           * rapproche de la fin. Tant que l'ennemi en tient une demi-douzaine,
           * c'est une place de plus ; quand il n'en tient plus qu'une ou deux,
           * c'est la partie. Sans cette échelle, le meneur d'une simulation —
           * onze fois plus fort, maître de cinq cités sur six — préférait
           * indéfiniment ramasser des tas de bois à vingt jours de marche de
           * la victoire.
           */
          gain:
            GAIN.citeAdverse +
            (known.town.isCapital ? 6000 : 0) +
            (view.enemyTowns.length <= 3
              ? Math.trunc(GAIN.citeAdverse * (4 - view.enemyTowns.length))
              : 0),
          guard: known.fresh
            ? armyPowerOf(known.town.garrison) + garrisonHeroPower(state, known.town.garrisonHero)
            : estimateGarrison(state, known.town.isCapital),
          days: 0,
          score: 0,
        },
        ourPower,
        options.objective,
      ),
    );
  }

  /* — Héros adverses visibles — */
  for (const enemy of view.enemyHeroes) {
    push(
      scored(
        state,
        world,
        view,
        profile,
        hero,
        {
          kind: 'heros',
          at: enemy.at,
          object: null,
          town: null,
          enemyHero: enemy.uid,
          gain: GAIN.heroAdverse + enemy.level * 220,
          guard: armyPowerOf(enemy.army),
          days: 0,
          score: 0,
        },
        ourPower,
        options.objective,
      ),
    );
  }

  /* — Lisières du brouillard — */
  const fogWeight = profile.explore.fogBonus;
  for (const frontier of view.frontier) {
    push(
      scored(
        state,
        world,
        view,
        profile,
        hero,
        {
          kind: 'lisiere',
          at: frontier,
          object: null,
          town: null,
          enemyHero: null,
          gain: GAIN.lisiere + fogWeight * 4,
          guard: 0,
          days: 0,
          score: 0,
        },
        ourPower,
        options.objective,
      ),
    );
  }

  out.sort((a, b) => {
    if (a.score !== b.score) return b.score - a.score;
    if (a.at.row !== b.at.row) return a.at.row - b.at.row;
    return a.at.col - b.at.col;
  });
  return out.slice(0, Math.max(4, profile.explore.shortlist * 3));
}

function garrisonHeroPower(state: GameState, uid: string | null): number {
  if (!uid) return 0;
  const hero = state.heroes[uid];
  return hero ? armyPowerOf(hero.army) : 0;
}

/**
 * Garnison supposée d'une cité qui n'est pas sous nos yeux : on ne triche pas,
 * on estime à partir du calendrier — ce qu'un capitaine ferait.
 */
function estimateGarrison(state: GameState, capital: boolean): number {
  const week = Math.max(1, Math.trunc((state.turn - 1) / 7) + 1);
  return (capital ? 2200 : 900) * week;
}

function scored(
  state: GameState,
  world: WorldMap,
  view: Perception,
  profile: BotProfile,
  hero: HeroInstance,
  target: Target,
  ourPower: number,
  objective: ObjectiveKind,
): Target {
  const days = daysAway(state, world, view.player, hero, target.at);
  const gain = bp(target.gain, profile.explore.gainBp);
  const risk = bp(riskPoints(target.guard, ourPower), profile.explore.riskBp);
  const bonus = objectiveBonusBp(target.kind, objective);
  const distance = days * profile.explore.dayCost;
  target.days = days;
  target.score = bp(gain, bonus) - risk - distance;
  return target;
}

/* ── Liste courte et chemins réels ───────────────────────────────────────── */

export interface ReachableTarget extends Target {
  /** coût réel du trajet complet, en points de marche */
  cost: number;
  /** nombre de journées réelles */
  realDays: number;
  /** case exacte à indiquer à `MoveHero` */
  destination: MapCoord;
}

/**
 * Retient la meilleure cible réellement joignable. Seules les `shortlist`
 * premières entrées reçoivent un `computePath` : c'est le seul endroit du
 * paquet où l'on paie le prix fort d'un vrai calcul de chemin.
 */
export function firstReachable(
  state: GameState,
  world: WorldMap,
  profile: BotProfile,
  hero: HeroInstance,
  ranked: readonly Target[],
): ReachableTarget | null {
  let budget = profile.explore.shortlist;
  for (const target of ranked) {
    if (budget <= 0) break;
    budget--;
    const route = computePath(world, state, hero, target.at);
    if (!route || route.path.length === 0) continue;
    let cost = 0;
    for (const step of route.costs) cost += step;
    const realDays = pathDayCount(route.costs, hero.movement, Math.max(1, hero.movementMax));
    return { ...target, cost, realDays, destination: target.at };
  }
  return null;
}

/**
 * Case de repli : la cité amie la plus proche. Sert au profil prudent et à
 * l'objectif « défense ».
 */
export function fallbackHome(
  state: GameState,
  world: WorldMap,
  view: Perception,
  hero: HeroInstance,
): MapCoord | null {
  let best: MapCoord | null = null;
  /* `Infinity` et non `Number.MAX_SAFE_INTEGER` : une estimation saturée doit
     rester comparable. Rendre `null` ici immobilise le héros pour de bon. */
  let bestCost = Number.POSITIVE_INFINITY;
  for (const town of view.towns) {
    const cost = travelEstimate(state, world, view.player, hero.at, town.at);
    if (cost < bestCost) {
      bestCost = cost;
      best = town.at;
    }
  }
  return best;
}
