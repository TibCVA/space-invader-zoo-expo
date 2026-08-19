/**
 * Socle commun de l'intelligence artificielle : **perception** filtrée par le
 * brouillard, estimation de distance bon marché, et petits utilitaires
 * entiers.
 *
 * Règle cardinale : *l'IA ne triche pas*. Aucun module de ce paquet ne lit
 * `state.objects`, `state.heroes` ou `state.towns` d'un adversaire
 * directement ; tout passe par `perceive()`, qui n'expose que ce que le
 * brouillard du joueur montre :
 *
 *  - un **lieu de carte** n'est connu que si sa case d'entrée a été explorée
 *    au moins une fois (`fog >= 1`) ;
 *  - un **héros adverse** n'est connu que s'il se tient sur une case
 *    actuellement visible (`fog === 2`) ;
 *  - une **cité adverse** n'est connue que si sa case a été explorée, et sa
 *    garnison n'est lisible que si la case est visible maintenant ;
 *  - les **ressources, la trésorerie et les plans** des autres bannières ne
 *    sont jamais lus.
 *
 * Le terrain, lui, est une donnée publique : le Forez est le pays des joueurs.
 * En revanche l'estimation de trajet ne s'en sert que sur les cases explorées ;
 * ailleurs elle suppose une prairie moyenne, comme un capitaine qui lit une
 * carte muette.
 */
import {
  FOG_EXPLORED,
  FOG_UNKNOWN,
  FOG_VISIBLE,
  TERRAIN_COST,
  cloneRng,
  createRng,
  isPassable,
  nextInt,
  sortedKeys,
  terrainAt,
  type GameState,
  type HeroInstance,
  type MapCoord,
  type MapObject,
  type PlayerId,
  type PlayerState,
  type RngState,
  type TownState,
  type WorldMap,
} from '@auvergne/engine';

/* ── Petites mathématiques entières ─────────────────────────────────────── */

/** `value × bp / 10000`, tronqué vers zéro. */
export function bp(value: number, ratio: number): number {
  return Math.trunc((value * ratio) / 10000);
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** Distance de Tchebychev, en cases. */
export function cells(a: MapCoord, b: MapCoord): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

export function sameCell(a: MapCoord, b: MapCoord): boolean {
  return a.col === b.col && a.row === b.row;
}

/**
 * Générateur local, dérivé de l'état **sans jamais le muter**.
 *
 * `state.rng` n'appartient qu'au moteur : le faire avancer depuis l'IA
 * désynchroniserait la simulation de planification et la partie réelle. On
 * copie donc l'état du PRNG et on en dérive une graine stable.
 */
export function botRng(state: GameState, tag: number): RngState {
  const copy = cloneRng(state.rng);
  const seed = (copy.lo ^ copy.hi ^ ((tag * 2654435761) >>> 0)) >>> 0;
  return createRng(seed, (tag * 40503 + 1) >>> 0);
}

/** Départage stable de deux scores égaux, sans jamais toucher au PRNG du jeu. */
export function jitter(rng: RngState, span: number): number {
  if (span <= 0) return 0;
  return nextInt(rng, -span, span);
}

/* ── Brouillard ──────────────────────────────────────────────────────────── */

export function fogAtCell(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
  at: MapCoord,
): number {
  const p = state.players[player];
  if (!p) return FOG_UNKNOWN;
  if (at.col < 0 || at.row < 0 || at.col >= world.cols || at.row >= world.rows) return FOG_UNKNOWN;
  return p.fog[at.row * world.cols + at.col] | 0;
}

export function isExploredCell(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
  at: MapCoord,
): boolean {
  return fogAtCell(state, world, player, at) >= FOG_EXPLORED;
}

export function isVisibleCell(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
  at: MapCoord,
): boolean {
  return fogAtCell(state, world, player, at) === FOG_VISIBLE;
}

/* ── Perception ──────────────────────────────────────────────────────────── */

/** Un lieu de carte tel que la bannière le connaît. */
export interface KnownPlace {
  obj: MapObject;
  /** vrai si la case est visible à l'instant (les gardes sont alors à jour) */
  fresh: boolean;
}

/** Une cité tierce telle que la bannière la connaît. */
export interface KnownTown {
  town: TownState;
  /** vrai si la garnison est lisible (case visible maintenant) */
  fresh: boolean;
}

/** Vue du monde restreinte à ce que le brouillard laisse voir. */
export interface Perception {
  player: PlayerId;
  self: PlayerState;
  /** nos cités, triées par identifiant */
  towns: TownState[];
  /** notre capitale (la première capitale possédée), ou `null` */
  capital: TownState | null;
  /** nos héros disponibles aujourd'hui, triés par identifiant */
  heroes: HeroInstance[];
  /** tous nos héros, y compris ceux qui pansent leurs plaies */
  allHeroes: HeroInstance[];
  /** lieux de carte connus, triés par identifiant */
  places: KnownPlace[];
  /** cités neutres connues (sans bannière) */
  neutralTowns: KnownTown[];
  /** cités adverses connues */
  enemyTowns: KnownTown[];
  /** héros adverses actuellement visibles */
  enemyHeroes: HeroInstance[];
  /**
   * Cases explorées.
   *
   * Calculé à la demande : `perceive()` est rappelé après **chaque** commande
   * du tour, et compter cent six mille cases dix fois par tour coûtait plus
   * cher que toutes les décisions réunies. La plupart des appels ne lisent
   * jamais ce champ.
   */
  readonly explored: number;
  /** total de cases de la carte */
  total: number;
  /** points de lisière du brouillard, échantillonnés, triés — calculé à la demande */
  readonly frontier: MapCoord[];
}

const FRONTIER_STRIDE = 4;
const FRONTIER_MAX = 96;

/**
 * Construit la vue d'un joueur. Fonction pure : elle ne modifie rien et ne
 * lit aucune donnée cachée.
 */
export function perceive(state: GameState, world: WorldMap, player: PlayerId): Perception {
  const self = state.players[player];
  const total = world.cols * world.rows;
  if (!self) {
    return {
      player,
      self: {
        id: player,
        name: player,
        faction: 'granit',
        color: '#000000',
        pattern: 0,
        kind: 'ia',
        resources: {
          ecus: 0,
          bois: 0,
          granit: 0,
          fer: 0,
          sel: 0,
          essence: 0,
          filDor: 0,
        },
        heroes: [],
        towns: [],
        fog: new Uint8Array(0),
        seals: [],
        alive: false,
        reputation: 0,
        buildQueue: [],
        tavernOffers: [],
      },
      towns: [],
      capital: null,
      heroes: [],
      allHeroes: [],
      places: [],
      neutralTowns: [],
      enemyTowns: [],
      enemyHeroes: [],
      explored: 0,
      total,
      frontier: [],
    };
  }

  const towns: TownState[] = [];
  const neutralTowns: KnownTown[] = [];
  const enemyTowns: KnownTown[] = [];
  for (const uid of sortedKeys(state.towns)) {
    const town = state.towns[uid];
    if (town.owner === player) {
      towns.push(town);
      continue;
    }
    /*
     * Les CAPITALES sont publiques, les autres places se découvrent.
     *
     * Chaque bannière choisit sa capitale sur l'écran de nouvelle partie,
     * dans une liste de lieux nommés du Forez : un joueur humain sait donc
     * exactement où sont Cervières et Viscomtat avant le premier jour. Le
     * cacher à l'IA n'est pas de l'équité, c'est une infirmité — et elle
     * était mesurable : sur une partie complète de huit cent cinquante-huit
     * jours, les deux bannières ne se sont JAMAIS vues (« cités adverses
     * connues : zéro » à chaque relevé), sur une carte de cent six mille
     * cases où deux capitales sont à plus de deux cents cases l'une de
     * l'autre. Aucune conquête n'était possible, donc aucune partie ne
     * pouvait se gagner.
     *
     * `fresh` reste soumis au brouillard : on sait où est la place, on ne
     * lit sa garnison que si on la voit — l'estimation prend le relais
     * sinon (`estimateGarrison`). Savoir où frapper n'est pas savoir ce
     * qu'on y trouvera.
     */
    const publique = town.isCapital || isExploredCell(state, world, player, town.at);
    if (!publique) continue;
    const known: KnownTown = { town, fresh: isVisibleCell(state, world, player, town.at) };
    if (town.owner === null) neutralTowns.push(known);
    else enemyTowns.push(known);
  }

  const heroes: HeroInstance[] = [];
  const allHeroes: HeroInstance[] = [];
  const enemyHeroes: HeroInstance[] = [];
  for (const uid of sortedKeys(state.heroes)) {
    const hero = state.heroes[uid];
    if (hero.owner === player) {
      allHeroes.push(hero);
      if (hero.downUntilTurn <= state.turn) heroes.push(hero);
      continue;
    }
    // Un héros adverse n'existe pour nous que s'il est sous nos yeux.
    if (!isVisibleCell(state, world, player, hero.at)) continue;
    enemyHeroes.push(hero);
  }

  const places: KnownPlace[] = [];
  for (const uid of sortedKeys(state.objects)) {
    const obj = state.objects[uid];
    if (!isExploredCell(state, world, player, obj.entrance)) continue;
    places.push({ obj, fresh: isVisibleCell(state, world, player, obj.entrance) });
  }

  let capital: TownState | null = null;
  for (const town of towns) {
    if (town.isCapital) {
      capital = town;
      break;
    }
  }
  if (!capital && towns.length > 0) capital = towns[0];

  let exploredCache = -1;
  let frontierCache: MapCoord[] | null = null;

  return {
    player,
    self,
    towns,
    capital,
    heroes,
    allHeroes,
    places,
    neutralTowns,
    enemyTowns,
    enemyHeroes,
    total,
    get explored(): number {
      if (exploredCache < 0) {
        let count = 0;
        const fog = self.fog;
        for (let i = 0; i < fog.length; i++) {
          if (fog[i] !== FOG_UNKNOWN) count++;
        }
        exploredCache = count;
      }
      return exploredCache;
    },
    get frontier(): MapCoord[] {
      if (frontierCache === null) frontierCache = sampleFrontier(state, world, player);
      return frontierCache;
    },
  };
}

/**
 * Lisière du brouillard : cases explorées bordant l'inconnu. Échantillonnée
 * avec un pas régulier pour rester bon marché, puis triée pour rester
 * strictement déterministe.
 *
 * L'échantillonnage regarde à **une foulée** de distance, pas à une case. La
 * lisière d'une carte à peine entamée est un anneau d'une case d'épaisseur :
 * en n'interrogeant que les quatre voisins immédiats d'un maillage au pas de
 * quatre, on ne tombait presque jamais dessus, et une bannière se retrouvait
 * avec une seule lisière connue — donc plus rien à explorer, donc un héros
 * planté devant sa capitale jusqu'au dernier jour.
 */
function sampleFrontier(state: GameState, world: WorldMap, player: PlayerId): MapCoord[] {
  const p = state.players[player];
  if (!p) return [];
  const fog = p.fog;
  const out: MapCoord[] = [];
  const reach = FRONTIER_STRIDE;
  for (let row = 1; row < world.rows - 1; row += FRONTIER_STRIDE) {
    for (let col = 1; col < world.cols - 1; col += FRONTIER_STRIDE) {
      const i = row * world.cols + col;
      if (fog[i] === FOG_UNKNOWN) continue;
      if (!isPassable(world, col, row)) continue;
      const west = Math.max(0, col - reach);
      const east = Math.min(world.cols - 1, col + reach);
      const north = Math.max(0, row - reach);
      const south = Math.min(world.rows - 1, row + reach);
      const unknownNeighbour =
        fog[row * world.cols + west] === FOG_UNKNOWN ||
        fog[row * world.cols + east] === FOG_UNKNOWN ||
        fog[north * world.cols + col] === FOG_UNKNOWN ||
        fog[south * world.cols + col] === FOG_UNKNOWN;
      if (!unknownNeighbour) continue;
      out.push({ col, row });
    }
  }
  if (out.length <= FRONTIER_MAX) return out;
  // Sous-échantillonnage régulier : déterministe, sans PRNG.
  const step = Math.ceil(out.length / FRONTIER_MAX);
  const trimmed: MapCoord[] = [];
  for (let i = 0; i < out.length; i += step) trimmed.push(out[i]);
  return trimmed;
}

/* ── Estimation de trajet ────────────────────────────────────────────────── */

/** Coût supposé d'une case inconnue : une prairie moyenne. */
const UNKNOWN_CELL_COST = TERRAIN_COST.prairie;
/** Nombre maximal d'échantillons pris le long d'une droite. */
const SAMPLE_MAX = 40;

/**
 * Prix du détour, en points de marche, pour une case que la droite traverse
 * mais qu'un héros ne peut pas fouler : lac, falaise, ravin.
 *
 * Ce n'est **pas** l'infini, et c'est tout l'objet de cette constante. La
 * droite n'est qu'une règle posée sur la carte pour classer des cibles : le
 * vrai trajet, calculé plus tard par `computePath`, contourne l'obstacle. Lui
 * donner un coût infini revenait à déclarer inaccessible toute destination
 * dont la ligne droite frôle un étang — c'est-à-dire, sur une carte du Forez,
 * à peu près toutes.
 *
 * Ce que cela coûtait exactement : `TERRAIN_COST.eau` vaut
 * `Number.MAX_SAFE_INTEGER`. Un seul échantillon d'eau sur quarante portait la
 * moyenne à 2 × 10¹⁴, et l'estimation d'un trajet de cent cinquante cases à
 * 4 × 10¹⁶ — au-delà de `Number.MAX_SAFE_INTEGER`. Or `fallbackHome` retient
 * la cité de coût *inférieur* à cette borne : aucune ne passait le test, la
 * fonction rendait `null`, et un héros dépouillé de son armée restait planté
 * là jusqu'à la fin de la chronique, pendant que sa capitale entassait vingt
 * mille points de troupes qu'il n'irait jamais chercher. Mesuré : zéro
 * gisement pris en huit semaines, sur toutes les bannières de toutes les
 * parties simulées.
 *
 * Trois fois le rocher : assez cher pour qu'une route sèche soit toujours
 * préférée, assez modeste pour qu'un pont ou un gué reste une option.
 */
const DETOUR_CELL_COST = TERRAIN_COST.rocher * 3;

/**
 * Estimation bon marché du coût en points de marche entre deux cases.
 *
 * On suit la droite qui relie les deux cases, on échantillonne le terrain
 * **là où la bannière l'a exploré** et l'on suppose une prairie ailleurs. Le
 * résultat n'est pas un trajet : c'est un ordre de grandeur qui sert à
 * classer des dizaines de cibles pour quelques microsecondes, avant de ne
 * calculer le vrai chemin (`computePath`) que sur la courte liste retenue.
 */
export function travelEstimate(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
  from: MapCoord,
  to: MapCoord,
): number {
  const dc = Math.abs(to.col - from.col);
  const dr = Math.abs(to.row - from.row);
  const steps = Math.max(dc, dr);
  if (steps === 0) return 0;
  const diagonals = Math.min(dc, dr);

  const samples = Math.min(steps, SAMPLE_MAX);
  let sum = 0;
  for (let s = 1; s <= samples; s++) {
    const col = from.col + Math.trunc(((to.col - from.col) * s) / samples);
    const row = from.row + Math.trunc(((to.row - from.row) * s) / samples);
    sum += cellCost(state, world, player, col, row);
  }
  const average = Math.trunc(sum / samples);
  const straight = steps - diagonals;
  return straight * average + Math.trunc((diagonals * average * 141) / 100);
}

function cellCost(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
  col: number,
  row: number,
): number {
  if (col < 0 || row < 0 || col >= world.cols || row >= world.rows) return UNKNOWN_CELL_COST;
  const p = state.players[player];
  const index = row * world.cols + col;
  if (!p || p.fog[index] === FOG_UNKNOWN) return UNKNOWN_CELL_COST;
  if (!isPassable(world, col, row)) return TERRAIN_COST.rocher * 2;
  /* Une case franchissable peut tout de même porter un coût sentinelle : un
     pont sur la Durolle reste de l'eau dans `world.terrain`. On borne donc
     toujours, plutôt que de faire confiance à la table. */
  const brut = TERRAIN_COST[terrainAt(world, col, row)];
  return brut > DETOUR_CELL_COST ? DETOUR_CELL_COST : brut;
}

/** Nombre de journées de marche estimées pour rallier une case. */
export function daysAway(
  state: GameState,
  world: WorldMap,
  player: PlayerId,
  hero: HeroInstance,
  to: MapCoord,
): number {
  const cost = travelEstimate(state, world, player, hero.at, to);
  const perDay = Math.max(1, hero.movementMax);
  if (cost <= hero.movement) return 0;
  return 1 + Math.trunc((cost - hero.movement) / perDay);
}

/* ── Divers ──────────────────────────────────────────────────────────────── */

/** Somme pondérée d'un enregistrement de ressources, en écus de référence. */
export const RESOURCE_WORTH: Readonly<Record<string, number>> = Object.freeze({
  ecus: 1,
  bois: 6,
  granit: 6,
  fer: 9,
  sel: 9,
  essence: 14,
  filDor: 14,
});

export function worthOf(resources: Partial<Record<string, number>>): number {
  let total = 0;
  for (const key of Object.keys(resources).sort()) {
    const amount = resources[key];
    if (!amount) continue;
    total += amount * (RESOURCE_WORTH[key] ?? 1);
  }
  return total;
}
