/**
 * État de démonstration — graine fixe `20250816`.
 *
 * Les routes `#/demo/*` doivent s'afficher **sans partie en cours**, être
 * prêtes en moins de six secondes et n'écrire aucune sauvegarde
 * (docs/03-ROUTES.md §2). Deux niveaux répondent à ces trois exigences :
 *
 *  - `etatDemo()` — un `GameState` composé **à la main**, disponible
 *    instantanément. Il suffit à tous les écrans de données (fiche de héros,
 *    royaume, emplacements) : ces écrans lisent l'état et interrogent le
 *    moteur (`heroStats`, `playerIncome`), qui n'a pas besoin de la carte.
 *  - `partieDemo()` — la vraie carte du Forez (`buildWorld(20250816)`) et une
 *    vraie partie (`createGame`), pour la carte d'aventure, les cités et le
 *    combat. Elle coûte près d'une seconde : elle est donc asynchrone et mise
 *    en cache pour toute la session.
 *
 * Rien ici n'est aléatoire : deux exécutions produisent le même octet.
 */

import { createRng, hashState, emptyResources, MAP_COLS, MAP_ROWS } from '@auvergne/engine';
import type {
  ArmyStack,
  GameSetup,
  GameState,
  HeroInstance,
  PlayerId,
  PlayerState,
  TownState,
  WorldMap,
} from '@auvergne/engine';
import type { SaveSlot } from '@auvergne/protocol';

/** Graine imposée pour toute la revue visuelle. */
export const GRAINE_DEMO = 20250816;

/** Le héros mis en vedette par `#/demo/heros`. */
export const HEROS_DEMO = 'H1';

/* ───────────────────────── Fabriques élémentaires ───────────────────────── */

function brouillard(explore: boolean): Uint8Array {
  const fog = new Uint8Array(MAP_COLS * MAP_ROWS);
  if (explore) fog.fill(1);
  return fog;
}

function armee(entrees: readonly (readonly [string, number])[]): (ArmyStack | null)[] {
  const slots: (ArmyStack | null)[] = [null, null, null, null, null, null, null];
  entrees.forEach(([creature, count], i) => {
    if (i < 7) slots[i] = { creature, count };
  });
  return slots;
}

/* ──────────────────────────────── Héros ─────────────────────────────────── */

/**
 * Clotilde, Sénéchale de Cervières, niveau 12 : dix emplacements d'artefacts
 * garnis, six compétences dont deux au rang de maître, dix sorts appris.
 * C'est la fiche complète exigée par `#/demo/heros`.
 */
function clotilde(): HeroInstance {
  return {
    uid: HEROS_DEMO,
    def: 'clotilde',
    owner: 'P1',
    level: 12,
    /* Seuils du moteur : niveau 12 à 34 375, niveau 13 à 41 150. Une valeur
       en deçà du seuil affichait une jauge d'expérience vide. */
    xp: 37_400,
    vaillance: 9,
    garde: 8,
    mystique: 6,
    savoir: 7,
    mana: 41,
    manaMax: 70,
    movement: 1420,
    movementMax: 2180,
    at: { col: 214, row: 119 },
    facing: 4,
    army: armee([
      ['granit_t1_up', 64],
      ['granit_t2', 31],
      ['granit_t3_up', 24],
      ['granit_t4_up', 18],
      ['granit_t5', 11],
      ['granit_t6', 6],
      ['granit_t7', 2],
    ]),
    artifacts: {
      tete: 'heaume_du_banneret',
      cou: 'collier_des_serments',
      torse: 'haubert_dardoise',
      mains: 'gantelet_du_forgeron',
      anneau1: 'anneau_de_la_futaie',
      anneau2: 'anneau_de_fortune',
      ceinture: 'ceinture_aux_douze_bourses',
      pieds: 'bottes_de_sept_layons',
      banniere: 'etendard_du_serment',
      relique: 'sceptre_des_comtes',
    },
    backpack: ['carte_du_senechal', 'lanterne_des_sagnes', 'cor_de_veneur'],
    skills: [
      { skill: 'seigneurie', rank: 3 },
      { skill: 'guerison', rank: 3 },
      { skill: 'logistique', rank: 2 },
      { skill: 'intendance', rank: 2 },
      { skill: 'commerce', rank: 1 },
      { skill: 'diplomatie', rank: 1 },
    ],
    spells: [
      'braises_1',
      'braises_2',
      'braises_4',
      'sources_1',
      'sources_3',
      'sources_4',
      'brumes_1',
      'brumes_3',
      'racines_1',
      'racines_3',
    ],
    inTown: null,
    downUntilTurn: 0,
    pendingLevelUp: null,
    path: null,
  };
}

/** Auguste, second héros de la bannière : il tient la route du sel. */
function auguste(): HeroInstance {
  return {
    uid: 'H2',
    def: 'auguste',
    owner: 'P1',
    level: 7,
    /* Niveau 7 à 11 125, niveau 8 à 14 500. */
    xp: 12_900,
    vaillance: 4,
    garde: 6,
    mystique: 3,
    savoir: 5,
    mana: 22,
    manaMax: 50,
    movement: 2040,
    movementMax: 2040,
    at: { col: 202, row: 189 },
    facing: 2,
    army: armee([
      ['granit_t1', 42],
      ['granit_t2_up', 19],
      ['granit_t3', 14],
      ['granit_t5', 5],
    ]),
    artifacts: { tete: 'chapeau_cire_du_gabelou', ceinture: 'ceinture_du_gabelou' },
    backpack: [],
    skills: [
      { skill: 'commerce', rank: 2 },
      { skill: 'logistique', rank: 2 },
      { skill: 'reconnaissance', rank: 1 },
    ],
    spells: ['sources_2', 'brumes_2'],
    inTown: 'T_noiretable',
    downUntilTurn: 0,
    pendingLevelUp: null,
    path: null,
  };
}

/** Anastasia, Dame des Brumes : la bannière adverse, tenue par l'IA. */
function anastasia(): HeroInstance {
  return {
    uid: 'H3',
    def: 'anastasia',
    owner: 'P2',
    level: 10,
    /* Niveau 10 à 23 075, niveau 11 à 28 375. */
    xp: 25_800,
    vaillance: 5,
    garde: 6,
    mystique: 9,
    savoir: 8,
    mana: 63,
    manaMax: 80,
    movement: 1900,
    movementMax: 1900,
    at: { col: 125, row: 250 },
    facing: 6,
    army: armee([
      ['ermitage_t1_up', 55],
      ['ermitage_t3', 22],
      ['ermitage_t4', 15],
      ['ermitage_t6', 4],
    ]),
    artifacts: { torse: 'manteau_de_la_dame_des_brumes', cou: 'collier_de_brume' },
    backpack: [],
    skills: [
      { skill: 'occultisme', rank: 3 },
      { skill: 'erudition', rank: 2 },
      { skill: 'embuscade', rank: 2 },
    ],
    spells: ['brumes_1', 'brumes_4', 'brumes_5', 'brumes_7', 'sources_1'],
    inTown: null,
    downUntilTurn: 0,
    pendingLevelUp: null,
    path: null,
  };
}

/* ──────────────────────────────── Cités ─────────────────────────────────── */

/** Bâtiments de Cervières : capitale à ~70 %, telle que la demande la revue. */
const BATIS_CERVIERES: string[] = [
  'hotel_ville_1',
  'hotel_ville_2',
  'taverne',
  'marche',
  'halle_sel',
  'forge',
  'ecuries',
  'capitaine',
  'guilde_1',
  'guilde_2',
  'guilde_3',
  'palissade',
  'rempart',
  'granit_demeure_1',
  'granit_amelioration_1',
  'granit_demeure_2',
  'granit_demeure_3',
  'granit_amelioration_3',
  'granit_demeure_4',
  'granit_demeure_5',
  'granit_atelier_fildor',
  'granit_porte_farges',
];

const BATIS_NOIRETABLE: string[] = [
  'hotel_ville_1',
  'taverne',
  'marche',
  'caravanserail',
  'guilde_1',
  'palissade',
  'granit_demeure_1',
  'granit_demeure_2',
  'granit_demeure_3',
];

const BATIS_HERMITAGE: string[] = [
  'hotel_ville_1',
  'hotel_ville_2',
  'taverne',
  'marche',
  'guilde_1',
  'guilde_2',
  'guilde_3',
  'palissade',
  'rempart',
  'ermitage_demeure_1',
  'ermitage_amelioration_1',
  'ermitage_demeure_2',
  'ermitage_demeure_3',
  'ermitage_demeure_4',
  'ermitage_source',
  'ermitage_scriptorium',
  'ermitage_clairiere',
];

function cite(
  uid: string,
  name: string,
  faction: 'granit' | 'ermitage',
  owner: PlayerId | null,
  at: { col: number; row: number },
  built: string[],
  extra: Partial<TownState> = {},
): TownState {
  return {
    uid,
    name,
    faction,
    owner,
    at,
    built,
    builtThisTurn: false,
    available: {},
    garrison: [null, null, null, null, null, null, null],
    visitingHero: null,
    garrisonHero: null,
    spells: [],
    charter: null,
    isCapital: false,
    unrest: 0,
    ...extra,
  };
}

/* ─────────────────────────────── Joueurs ────────────────────────────────── */

function joueur(
  id: PlayerId,
  name: string,
  faction: 'granit' | 'ermitage',
  color: string,
  pattern: number,
  extra: Partial<PlayerState>,
): PlayerState {
  return {
    id,
    name,
    faction,
    color,
    pattern,
    kind: 'ia',
    resources: emptyResources(),
    heroes: [],
    towns: [],
    fog: brouillard(false),
    seals: [],
    alive: true,
    reputation: 0,
    buildQueue: [],
    tavernOffers: [],
    ...extra,
  };
}

/* ───────────────────────────── L'assemblage ─────────────────────────────── */

/** Composition de partie utilisée par toutes les démonstrations. */
export function setupDemo(): GameSetup {
  return {
    seed: GRAINE_DEMO,
    mapVersion: '1.0.0',
    contentVersion: '1.0.0',
    duration: 'standard',
    victory: 'couronne',
    players: [
      {
        id: 'P1',
        name: 'Maison de Cervières',
        faction: 'granit',
        kind: 'humain',
        start: 'cervieres',
        hero: 'clotilde',
      },
      {
        id: 'P2',
        name: 'Ermitage des Bois Noirs',
        faction: 'ermitage',
        kind: 'ia',
        aiProfile: 'equilibre',
        start: 'noiretable',
        hero: 'anastasia',
      },
    ],
  };
}

let cacheEtat: GameState | null = null;

/**
 * L'état de démonstration, composé à la main et donc immédiat.
 * Aucune carte n'est nécessaire : les écrans de données n'en lisent pas.
 */
export function etatDemo(): GameState {
  if (cacheEtat) return cacheEtat;

  const heroes: Record<string, HeroInstance> = {
    [HEROS_DEMO]: clotilde(),
    H2: auguste(),
    H3: anastasia(),
  };

  const towns: Record<string, TownState> = {
    T_cervieres: cite('T_cervieres', 'Cervières', 'granit', 'P1', { col: 214, row: 119 }, BATIS_CERVIERES, {
      isCapital: true,
      unrest: 12,
      charter: 'marchande',
      garrison: armee([
        ['granit_t1', 28],
        ['granit_t3', 12],
      ]),
      spells: ['braises_1', 'braises_2', 'sources_1', 'sources_3', 'brumes_1', 'racines_1'],
      available: {
        granit_t1: 34,
        granit_t2: 18,
        granit_t3: 11,
        granit_t4: 7,
        granit_t5: 4,
      },
    }),
    T_noiretable: cite('T_noiretable', 'Noirétable', 'granit', 'P1', { col: 202, row: 189 }, BATIS_NOIRETABLE, {
      unrest: 5,
      available: { granit_t1: 22, granit_t2: 9, granit_t3: 5 },
    }),
    T_hermitage: cite(
      'T_hermitage',
      "Notre-Dame de l'Hermitage",
      'ermitage',
      'P2',
      { col: 125, row: 250 },
      BATIS_HERMITAGE,
      {
        isCapital: true,
        unrest: 3,
        charter: 'spirituelle',
        available: { ermitage_t1: 30, ermitage_t2: 16, ermitage_t3: 9, ermitage_t4: 5 },
      },
    ),
    T_viscomtat: cite('T_viscomtat', 'Viscomtat', 'ermitage', null, { col: 58, row: 165 }, []),
    T_arconsat: cite('T_arconsat', 'Arconsat', 'granit', null, { col: 117, row: 25 }, []),
  };

  const fogP1 = brouillard(false);
  /* Un tiers du pays exploré : de quoi montrer les trois états du voile. */
  for (let row = 60; row < 300; row += 1) {
    for (let col = 40; col < 232; col += 1) {
      const index = row * MAP_COLS + col;
      const proche =
        Math.abs(col - 214) + Math.abs(row - 119) < 46 || Math.abs(col - 202) + Math.abs(row - 189) < 34;
      fogP1[index] = proche ? 2 : 1;
    }
  }

  const players: Record<PlayerId, PlayerState> = {
    P1: joueur('P1', 'Maison de Cervières', 'granit', '#8C2230', 0, {
      kind: 'humain',
      resources: { ecus: 18_450, bois: 62, granit: 48, fer: 31, sel: 27, essence: 9, filDor: 6 },
      heroes: [HEROS_DEMO, 'H2'],
      towns: ['T_cervieres', 'T_noiretable'],
      fog: fogP1,
      seals: ['farges', 'pamole'],
      reputation: 34,
      tavernOffers: ['thomas', 'josephine'],
    }),
    P2: joueur('P2', 'Ermitage des Bois Noirs', 'ermitage', '#2F6B45', 3, {
      resources: { ecus: 14_100, bois: 71, granit: 22, fer: 18, sel: 12, essence: 14, filDor: 3 },
      heroes: ['H3'],
      towns: ['T_hermitage'],
      aiProfile: 'equilibre',
      seals: ['brumes'],
      reputation: -8,
    }),
    P3: joueur('P3', 'Bannière dormante', 'granit', '#B8891F', 2, { alive: false, defeatedAtTurn: 12 }),
    P4: joueur('P4', 'Bannière dormante', 'granit', '#2F6B45', 3, { alive: false, defeatedAtTurn: 4 }),
    P5: joueur('P5', 'Bannière dormante', 'ermitage', '#5B3A6E', 4, { alive: false, defeatedAtTurn: 2 }),
  };

  const state: GameState = {
    engineVersion: '1.0.0',
    contentVersion: '1.0.0',
    mapVersion: '1.0.0',
    id: 'demonstration-20250816',
    seed: GRAINE_DEMO,
    rng: createRng(GRAINE_DEMO),
    turn: 38,
    activePlayer: 'P1',
    turnOrder: ['P1', 'P2'],
    players,
    heroes,
    towns,
    objects: {},
    weather: { current: 'brume', forecast: ['eclaircie', 'pluie'], delayedBy: null },
    gabelle: 'mesure',
    seals: {
      hautes_futaies: { owner: null, at: { col: 96, row: 62 } },
      farges: { owner: 'P1', at: { col: 188, row: 148 } },
      pamole: { owner: 'P1', at: { col: 152, row: 96 } },
      hermitage: { owner: null, at: { col: 125, row: 252 } },
      brumes: { owner: 'P2', at: { col: 74, row: 214 } },
    },
    claim: null,
    phase: 'aventure',
    combat: null,
    winner: null,
    endReason: null,
    nextUid: 40,
    journal: [
      { turn: 38, player: 'P1', text: 'Le sceau des Farges est tenu depuis quatre jours.', kind: 'sceau' },
      { turn: 37, player: 'P1', text: 'Clotilde a franchi le col des Sagnes sous la brume.', kind: 'deplacement' },
      { turn: 36, player: 'P1', text: "L'atelier de fil d'or de Cervières est achevé.", kind: 'construction' },
      { turn: 35, player: 'P2', text: 'Une caravane de sel a été interceptée près de Vollore.', kind: 'combat' },
      { turn: 34, player: 'P1', text: 'La gabelle est ramenée à la mesure : l’agitation retombe.', kind: 'politique' },
    ],
    hash: '0000000000000000',
  };

  state.hash = hashState(state as unknown as Record<string, unknown>);
  cacheEtat = state;
  return state;
}

/* ────────────────────── Démonstrations avec la carte ────────────────────── */

let cachePartie: Promise<{ state: GameState; world: WorldMap; setup: GameSetup }> | null = null;

/**
 * La vraie carte du Forez et une vraie partie, pour la carte d'aventure, les
 * cités et le combat. Mise en cache : une seule construction par session.
 */
export async function partieDemo(): Promise<{ state: GameState; world: WorldMap; setup: GameSetup }> {
  if (cachePartie) return cachePartie;
  cachePartie = (async () => {
    const [{ buildWorld }, { createGame }] = await Promise.all([
      import('@auvergne/map'),
      import('@auvergne/engine'),
    ]);
    const setup = setupDemo();
    const world = buildWorld(GRAINE_DEMO);
    const state = createGame(setup, world);
    return { state, world, setup };
  })();
  return cachePartie;
}

/* ─────────────────────────── Combat de démonstration ────────────────────── */

let cacheCombat: Promise<{ state: GameState; world: WorldMap; setup: GameSetup }> | null = null;

/** Sept piles par camp, comme l'exige `#/demo/combat` (docs/03-ROUTES.md §2). */
const ARMEE_ATTAQUE: readonly (readonly [string, number])[] = [
  ['granit_t1_up', 64],
  ['granit_t2', 31],
  ['granit_t3_up', 24],
  ['granit_t4_up', 18],
  ['granit_t5', 11],
  ['granit_t6', 6],
  ['granit_t7', 2],
];

const ARMEE_DEFENSE: readonly (readonly [string, number])[] = [
  ['ermitage_t1_up', 55],
  ['ermitage_t2', 34],
  ['ermitage_t3', 22],
  ['ermitage_t4', 15],
  ['ermitage_t5', 9],
  ['ermitage_t6', 4],
  ['ermitage_t7', 2],
];

/**
 * La partie de démonstration, arrêtée sur un combat déjà engagé.
 *
 * Le combat est **monté par le moteur** (`startCombat`) : aucune règle n'est
 * réécrite ici. Seuls le numéro de round et quelques lignes de journal sont
 * posés à la main, pour que la revue visuelle montre une bataille en cours
 * plutôt qu'un déploiement vide. Rien n'est jamais sauvegardé.
 */
export async function combatDemo(): Promise<{ state: GameState; world: WorldMap; setup: GameSetup }> {
  if (cacheCombat) return cacheCombat;
  cacheCombat = (async () => {
    const [base, { startCombat }] = await Promise.all([partieDemo(), import('@auvergne/engine')]);
    const combat = startCombat(base.state, {
      attacker: { player: 'P1', hero: null, army: armee(ARMEE_ATTAQUE) },
      defender: { player: 'P2', hero: null, town: null, army: armee(ARMEE_DEFENSE) },
      terrain: 'foret',
      region: 'coeur_bois_noirs',
      siege: false,
    });
    const state: GameState = {
      ...base.state,
      turn: 38,
      phase: 'combat',
      combat: { ...combat, round: 3 },
    };
    return { state, world: base.world, setup: base.setup };
  })();
  return cacheCombat;
}

/* ───────────────────── Emplacements de sauvegarde ───────────────────────── */

function jour(decalage: number): string {
  /* Horodatages figés : la revue visuelle doit être reproductible. */
  const base = Date.UTC(2025, 7, 16, 21, 12, 0);
  return new Date(base - decalage * 3_600_000).toISOString().replace(/\.\d+Z$/, 'Z');
}

/** Emplacements factices affichés par `#/demo/sauvegardes`. */
export function emplacementsDemo(): SaveSlot[] {
  const granit = { faction: 'granit' as const, color: '#8C2230' };
  const ermitage = { faction: 'ermitage' as const, color: '#2F6B45' };
  return [
    {
      id: 'auto-1',
      name: 'Sauvegarde automatique',
      turn: 38,
      week: 6,
      players: [
        { name: 'Maison de Cervières', ...granit },
        { name: 'Ermitage des Bois Noirs', ...ermitage },
      ],
      updatedAt: jour(0),
      createdAt: jour(96),
      autosave: true,
      hash: 'a41f7c9d02b6e158',
    },
    {
      id: 'la-marche-du-sel',
      name: 'La marche du sel',
      turn: 31,
      week: 5,
      players: [
        { name: 'Maison de Cervières', ...granit },
        { name: 'Ermitage des Bois Noirs', ...ermitage },
        { name: 'Compagnie de Noirétable', faction: 'granit', color: '#B8891F' },
      ],
      updatedAt: jour(19),
      createdAt: jour(140),
      autosave: false,
      hash: '7b0c25e9143da8f6',
    },
    {
      id: 'avant-le-col-des-sagnes',
      name: 'Avant le col des Sagnes',
      turn: 22,
      week: 4,
      players: [
        { name: 'Maison de Cervières', ...granit },
        { name: 'Ermitage des Bois Noirs', ...ermitage },
      ],
      updatedAt: jour(58),
      createdAt: jour(140),
      autosave: false,
      hash: '3e8a91d4c057b26f',
    },
    {
      id: 'chronique-de-la-renaudie',
      name: 'Chronique de La Renaudie',
      turn: 9,
      week: 2,
      players: [
        { name: 'Bannière de La Renaudie', ...ermitage },
        { name: 'Maison de Cervières', ...granit },
        { name: 'Prieuré de Vollore', faction: 'ermitage', color: '#5B3A6E' },
        { name: 'Gabelous du Forez', faction: 'granit', color: '#2E5F8A' },
      ],
      updatedAt: jour(203),
      createdAt: jour(214),
      autosave: false,
      hash: 'c1d604fa8e2379b5',
    },
  ];
}
