/**
 * Contenu de la carte : ce que la graine change, et ce qu'elle ne change
 * jamais.
 *
 * La géographie est fixe (document maître §4). Restent fixes également les
 * capitales, les centres neutres, la Maison du Trésor, les cinq Sceaux des
 * Marches, les bornes armoriées, les belvédères, les sanctuaires, les sources,
 * les auberges et les gisements majeurs — ce sont les repères que le joueur
 * apprend, comme les cases d'un échiquier.
 *
 * La graine décide en revanche :
 *  - la composition exacte des gardes neutres, par anneau de difficulté ;
 *  - les artefacts présents et leur emplacement parmi les caches autorisées ;
 *  - les gisements secondaires et les tas de ressources ;
 *  - les caravanes et les quêtes de village ;
 *  - les gardes errantes.
 *
 * Une dernière passe **équilibre les départs** : la valeur économique
 * accessible en sept jours est mesurée par un Dijkstra sur les coûts de
 * terrain, puis des caches de compensation sont semées près des positions les
 * plus pauvres jusqu'à ramener l'écart sous 8 % (document maître §20.1).
 *
 * Aucun `Math.random` : tous les tirages passent par le PRNG déterministe du
 * moteur, initialisé à partir de la graine de partie.
 */
import {
  CELL_BRIDGE,
  CELL_CACHE,
  CELL_PASSABLE,
  CELL_EDGE,
  CELL_ROAD,
  RESOURCE_VALUE,
  TERRAINS,
  TERRAIN_COST,
  createRng,
  nextInt,
  pickWeighted,
  shuffle,
  type ArmyStack,
  type MapCoord,
  type MapObject,
  type MapObjectKind,
  type ResourceKey,
  type RngState,
  type SealId,
  type StartKey,
} from '@auvergne/engine';
import { anchorCell } from './anchors.js';
import { CELLS, COLS, IntHeap, NDC, NDR, ROWS, T, idx } from './grid.js';
import { NEUTRAL_CENTERS, START_KEYS, START_POSITIONS } from './starts.js';

/* ── Contexte ───────────────────────────────────────────────────────────── */

export interface ObjectContext {
  terrain: Uint8Array;
  flags: Uint16Array;
  elevation: Int16Array;
  slope: Uint8Array;
  region: Uint8Array;
}

const c = (col: number, row: number): MapCoord => ({ col, row });

/* ── Sites fixes ────────────────────────────────────────────────────────── */

export interface Plot {
  at: MapCoord;
  radius: number;
}

/** Emprise 2 × 2 d'une cité : la case d'ancrage et ses trois voisines nord-est. */
function townFootprint(at: MapCoord): MapCoord[] {
  return [
    { col: at.col, row: at.row },
    { col: at.col + 1, row: at.row },
    { col: at.col, row: at.row - 1 },
    { col: at.col + 1, row: at.row - 1 },
  ];
}

interface SealSite {
  seal: SealId;
  at: MapCoord;
  label: string;
  lore: string;
}

const SEAL_SITES: readonly SealSite[] = [
  {
    seal: 'hautes_futaies',
    at: c(82, 146),
    label: 'Sceau des Hautes-Futaies',
    lore: "Une pierre levée sous les plus vieux sapins des futaies de Viscomtat. On dit qu'elle marque la limite que les bûcherons ne franchissaient jamais.",
  },
  {
    seal: 'farges',
    at: c(222, 132),
    label: 'Sceau des Farges',
    lore: "Scellé dans le linteau d'une forge abandonnée, en contrebas de la porte des Farges. Le fer y garde encore la chaleur des comtes.",
  },
  {
    seal: 'pamole',
    at: c(80, 276),
    label: 'Sceau de Pamole',
    lore: "Gravé à même la Pierre Pamole, face au levant. Par temps clair, on voit d'ici la moitié du Forez.",
  },
  {
    seal: 'hermitage',
    at: c(131, 242),
    label: "Sceau de l'Hermitage",
    lore: "Déposé dans la niche du vallon de l'Hermitage, entre la source et les cellules de pèlerins.",
  },
  {
    seal: 'brumes',
    at: c(160, 158),
    label: 'Sceau des Brumes',
    lore: 'Au cœur des Bois Noirs, là où la brume ne se lève pas avant midi. Les veneurs prétendent que la pierre change de place.',
  },
];

interface SiteSpec {
  key: string;
  kind: MapObjectKind;
  at: MapCoord;
  label: string;
  clear: number;
  data?: Record<string, unknown>;
}

/** Bornes armoriées : le réseau de déplacement tardif (document maître §8.3). */
const BORNE_SITES: readonly SiteSpec[] = [
  { key: 'borne_arconsat', kind: 'borne', at: c(112, 58), label: "Borne des Hauts d'Arconsat", clear: 1 },
  { key: 'borne_tresor', kind: 'borne', at: c(133, 110), label: 'Borne du Trésor', clear: 1 },
  { key: 'borne_cervieres', kind: 'borne', at: c(208, 132), label: 'Borne de Cervières', clear: 1 },
  { key: 'borne_viscomtat', kind: 'borne', at: c(72, 158), label: 'Borne des Futaies', clear: 1 },
  { key: 'borne_noiretable', kind: 'borne', at: c(180, 196), label: 'Borne de Noirétable', clear: 1 },
  { key: 'borne_bois_noirs', kind: 'borne', at: c(150, 150), label: 'Borne des Bois Noirs', clear: 1 },
  { key: 'borne_hermitage', kind: 'borne', at: c(102, 262), label: "Borne de l'Hermitage", clear: 1 },
  { key: 'borne_vollore', kind: 'borne', at: c(66, 276), label: 'Borne de Vollore', clear: 1 },
  { key: 'borne_renaudie', kind: 'borne', at: c(126, 362), label: 'Borne de la Marche', clear: 1 },
];

const VIEWPOINT_SITES: readonly SiteSpec[] = [
  { key: 'belvedere_pamole', kind: 'belvedere', at: c(83, 273), label: 'Belvédère de Pamole', clear: 1 },
  { key: 'belvedere_cervieres', kind: 'belvedere', at: c(218, 112), label: 'Belvédère de Cervières', clear: 1 },
  { key: 'belvedere_bois_noirs', kind: 'belvedere', at: c(168, 132), label: 'Belvédère des Bois Noirs', clear: 1 },
  { key: 'belvedere_arconsat', kind: 'belvedere', at: c(124, 18), label: "Belvédère d'Arconsat", clear: 1 },
];

const SHRINE_SITES: readonly SiteSpec[] = [
  { key: 'sanctuaire_hermitage', kind: 'sanctuaire', at: c(122, 254), label: "Chapelle de l'Hermitage", clear: 1 },
  { key: 'sanctuaire_peyrotine', kind: 'sanctuaire', at: c(143, 236), label: 'Croix de la Peyrotine', clear: 1 },
  { key: 'sanctuaire_vollore', kind: 'sanctuaire', at: c(58, 258), label: 'Chapelle des Carriers', clear: 1 },
  { key: 'sanctuaire_farges', kind: 'sanctuaire', at: c(211, 124), label: 'Oratoire des Farges', clear: 1 },
  { key: 'source_durolle', kind: 'source', at: c(118, 103), label: 'Source de la Durolle', clear: 1 },
  { key: 'source_sagnes', kind: 'source', at: c(99, 109), label: 'Fontaine des Sagnes', clear: 1 },
  { key: 'source_anzon', kind: 'source', at: c(196, 175), label: "Source de l'Anzon", clear: 1 },
  { key: 'source_credogne', kind: 'source', at: c(129, 371), label: 'Source de la Credogne', clear: 1 },
];

const INN_SITES: readonly SiteSpec[] = [
  { key: 'auberge_chabreloche', kind: 'auberge', at: c(94, 52), label: 'Relais de Chabreloche', clear: 1 },
  { key: 'auberge_arconsat', kind: 'auberge', at: c(114, 28), label: "Auberge d'Arconsat", clear: 1 },
  { key: 'auberge_cervieres', kind: 'auberge', at: c(210, 122), label: 'Auberge des Bannières', clear: 1 },
  { key: 'auberge_noiretable', kind: 'auberge', at: c(198, 192), label: 'Auberge du Carrefour', clear: 1 },
  { key: 'auberge_viscomtat', kind: 'auberge', at: c(61, 167), label: 'Auberge des Futaies', clear: 1 },
  { key: 'auberge_renaudie', kind: 'auberge', at: c(135, 376), label: 'Auberge de la Marche', clear: 1 },
  { key: 'auberge_tresor', kind: 'auberge', at: c(148, 117), label: 'Hostellerie du Trésor', clear: 1 },
  { key: 'auberge_vollore', kind: 'auberge', at: c(58, 266), label: 'Auberge de Vollore', clear: 1 },
];

interface MineSpec {
  key: string;
  at: MapCoord;
  resource: ResourceKey;
  amount: number;
  label: string;
  /** Anneau de difficulté de la garde. */
  ring: 1 | 2 | 3;
}

/**
 * Gisements majeurs.
 *
 * Chaque départ dispose, dans son premier cercle, d'une scierie, d'une
 * carrière et d'un site de revenu (document maître §20.1). Les gisements
 * rares — sel du Lac, fil d'or de Cervières, essence des futaies, fer des Bois
 * Noirs — sont volontairement plus loin et mieux gardés.
 */
const MINE_SITES: readonly MineSpec[] = [
  // Hauts d'Arconsat
  { key: 'scierie_arconsat', at: c(124, 32), resource: 'bois', amount: 2, label: "Scierie d'Arconsat", ring: 1 },
  { key: 'carriere_arconsat', at: c(108, 18), resource: 'granit', amount: 2, label: 'Carrière des Hauts', ring: 1 },
  { key: 'peage_arconsat', at: c(128, 42), resource: 'ecus', amount: 350, label: 'Péage des Hauts', ring: 1 },
  // Futaies de Viscomtat
  { key: 'scierie_viscomtat', at: c(48, 158), resource: 'bois', amount: 2, label: 'Scierie des Futaies', ring: 1 },
  { key: 'carriere_viscomtat', at: c(44, 178), resource: 'granit', amount: 2, label: 'Carrière de la Faye', ring: 1 },
  { key: 'peage_viscomtat', at: c(52, 150), resource: 'ecus', amount: 350, label: 'Péage des Futaies', ring: 1 },
  { key: 'essence_viscomtat', at: c(68, 176), resource: 'essence', amount: 1, label: 'Brûlerie des Futaies', ring: 2 },
  // Châtellenie de Cervières
  { key: 'scierie_cervieres', at: c(222, 108), resource: 'bois', amount: 2, label: 'Scierie de Bise', ring: 1 },
  { key: 'carriere_cervieres', at: c(226, 128), resource: 'granit', amount: 2, label: 'Carrière des Farges', ring: 1 },
  { key: 'peage_cervieres', at: c(220, 140), resource: 'ecus', amount: 350, label: 'Péage de Cervières', ring: 1 },
  { key: 'fildor_cervieres', at: c(208, 126), resource: 'filDor', amount: 1, label: 'Atelier des Grenadières', ring: 2 },
  // Pays de Noirétable
  { key: 'scierie_noiretable', at: c(192, 198), resource: 'bois', amount: 2, label: 'Scierie du Carrefour', ring: 1 },
  { key: 'carriere_noiretable', at: c(212, 180), resource: 'granit', amount: 2, label: 'Carrière du Lignon', ring: 1 },
  { key: 'peage_noiretable', at: c(196, 206), resource: 'ecus', amount: 350, label: 'Péage de Noirétable', ring: 1 },
  { key: 'fer_noiretable', at: c(208, 204), resource: 'fer', amount: 2, label: 'Minière de Noirétable', ring: 2 },
  // Marche de La Renaudie
  { key: 'scierie_renaudie', at: c(124, 364), resource: 'bois', amount: 2, label: 'Scierie de la Marche', ring: 1 },
  { key: 'carriere_renaudie', at: c(144, 386), resource: 'granit', amount: 2, label: 'Carrière de la Renaudie', ring: 1 },
  { key: 'peage_renaudie', at: c(120, 388), resource: 'ecus', amount: 350, label: 'Péage de la Marche', ring: 1 },
  { key: 'fer_renaudie', at: c(146, 368), resource: 'fer', amount: 2, label: 'Minière de la Credogne', ring: 1 },
  { key: 'bois_renaudie', at: c(108, 356), resource: 'bois', amount: 2, label: 'Coupe des moulins', ring: 1 },
  // Vallée de la Durolle et centre
  { key: 'bois_durolle', at: c(70, 50), resource: 'bois', amount: 2, label: 'Coupe de la Durolle', ring: 2 },
  { key: 'peage_chabreloche', at: c(86, 44), resource: 'ecus', amount: 350, label: 'Péage de Chabreloche', ring: 2 },
  { key: 'sel_lac', at: c(118, 98), resource: 'sel', amount: 2, label: 'Saline du Lac', ring: 2 },
  { key: 'sel_tresor', at: c(152, 124), resource: 'sel', amount: 2, label: 'Grenier à sel du Trésor', ring: 3 },
  { key: 'fer_bois_noirs', at: c(162, 144), resource: 'fer', amount: 2, label: 'Minière des Bois Noirs', ring: 3 },
  { key: 'essence_bois_noirs', at: c(146, 164), resource: 'essence', amount: 1, label: 'Brûlerie des Bois Noirs', ring: 3 },
  { key: 'fildor_bise', at: c(230, 116), resource: 'filDor', amount: 1, label: 'Filature de Bise', ring: 2 },
  { key: 'granit_pamole', at: c(76, 282), resource: 'granit', amount: 2, label: 'Carrière de Pamole', ring: 2 },
  { key: 'essence_hermitage', at: c(118, 244), resource: 'essence', amount: 1, label: "Brûlerie de l'Hermitage", ring: 2 },
  { key: 'fer_peyrotine', at: c(150, 232), resource: 'fer', amount: 2, label: 'Minière de la Peyrotine', ring: 2 },
  { key: 'granit_vollore', at: c(50, 258), resource: 'granit', amount: 2, label: 'Carrière de Vollore', ring: 1 },
  { key: 'bois_vollore', at: c(64, 250), resource: 'bois', amount: 2, label: 'Coupe de Vollore', ring: 1 },
];

/**
 * Artefacts posés à demeure, indépendants de la graine.
 *
 * La Clef de la Maison du Trésor n'est pas un butin comme un autre : elle
 * dort à mi-chemin du Chemin du Trésor, sous bonne garde, et chaque partie la
 * trouve au même endroit.
 */
const FIXED_ARTIFACTS: readonly {
  key: string;
  at: MapCoord;
  artifact: string;
  rarity: Rarity;
  label: string;
}[] = [
  {
    key: 'clef_tresor',
    at: c(152, 116),
    artifact: 'clef_de_la_maison_du_tresor',
    rarity: 'relique',
    label: 'la Clef de la Maison du Trésor',
  },
];

/** Sites du Chemin du Trésor et bornes-témoins, purement narratifs. */
const QUEST_SITES: readonly SiteSpec[] = [
  { key: 'quete_chabreloche', kind: 'quete', at: c(88, 54), label: 'Doléance de Chabreloche', clear: 1 },
  { key: 'quete_lac', kind: 'quete', at: c(114, 92), label: 'Doléance du Lac', clear: 1 },
  { key: 'quete_vollore', kind: 'quete', at: c(52, 268), label: 'Doléance de Vollore', clear: 1 },
  { key: 'quete_hermitage', kind: 'quete', at: c(128, 254), label: "Doléance de l'Hermitage", clear: 1 },
  { key: 'quete_cervieres', kind: 'quete', at: c(216, 124), label: 'Doléance de Cervières', clear: 1 },
  { key: 'quete_noiretable', kind: 'quete', at: c(204, 194), label: 'Doléance de Noirétable', clear: 1 },
  { key: 'quete_viscomtat', kind: 'quete', at: c(54, 169), label: 'Doléance de Viscomtat', clear: 1 },
  { key: 'quete_renaudie', kind: 'quete', at: c(130, 382), label: 'Doléance de la Marche', clear: 1 },
  { key: 'quete_arconsat', kind: 'quete', at: c(120, 30), label: "Doléance d'Arconsat", clear: 1 },
  { key: 'quete_tresor', kind: 'quete', at: c(140, 108), label: 'Le Grand Livre', clear: 1 },
];

/**
 * Toutes les emprises à aplanir avant la classification des biomes : sites
 * fixes, capitales et centres neutres. Consommé par `build.ts`.
 */
export function fixedPlots(): Plot[] {
  const plots: Plot[] = [];
  for (const key of START_KEYS) plots.push({ at: START_POSITIONS[key].at, radius: 4 });
  for (const n of NEUTRAL_CENTERS) plots.push({ at: anchorCell(n.anchor), radius: 3 });
  plots.push({ at: anchorCell('maison_tresor'), radius: 4 });
  for (const s of SEAL_SITES) plots.push({ at: s.at, radius: 2 });
  for (const list of [BORNE_SITES, VIEWPOINT_SITES, SHRINE_SITES, INN_SITES, QUEST_SITES]) {
    for (const s of list) plots.push({ at: s.at, radius: s.clear });
  }
  for (const m of MINE_SITES) plots.push({ at: m.at, radius: 1 });
  for (const a of FIXED_ARTIFACTS) plots.push({ at: a.at, radius: 1 });
  return plots;
}

/* ── Gardes neutres ─────────────────────────────────────────────────────── */

/**
 * Puissance indicative d'une créature par rang, servant à calibrer les gardes.
 * Elle n'engage pas les valeurs finales de `@auvergne/content` : elle ne sert
 * qu'à répartir les effectifs entre anneaux de difficulté.
 */
const TIER_POWER: readonly number[] = [0, 10, 32, 85, 190, 420, 900, 2100];

/** Rangs autorisés et fourchette de puissance, par anneau (document §20.2). */
const RING_TABLE: Readonly<
  Record<1 | 2 | 3 | 4, { tiers: number[]; powerMin: number; powerMax: number }>
> = {
  1: { tiers: [1, 2, 3], powerMin: 380, powerMax: 1200 },
  2: { tiers: [3, 4, 5], powerMin: 1500, powerMax: 3600 },
  3: { tiers: [5, 6, 7], powerMin: 4200, powerMax: 9000 },
  4: { tiers: [6, 7], powerMin: 15000, powerMax: 19000 },
};

type Faction = 'granit' | 'ermitage';

function guardFor(rng: RngState, ring: 1 | 2 | 3 | 4, stacks: number): ArmyStack[] {
  const table = RING_TABLE[ring];
  const target = nextInt(rng, table.powerMin, table.powerMax);
  const count = Math.max(1, Math.min(stacks, table.tiers.length + 1));
  const share = Math.trunc(target / count);
  const out: ArmyStack[] = [];
  for (let k = 0; k < count; k++) {
    const tier = table.tiers[nextInt(rng, 0, table.tiers.length - 1)];
    const faction: Faction = nextInt(rng, 0, 1) === 0 ? 'granit' : 'ermitage';
    const n = Math.max(2, Math.trunc(share / TIER_POWER[tier]));
    out.push({ creature: `${faction}_t${tier}`, count: Math.min(999, n) });
  }
  return out;
}

/** Garde unique et mixte de la Maison du Trésor (document maître §20.2). */
function treasureGuard(rng: RngState): ArmyStack[] {
  return [
    { creature: 'granit_t7', count: 3 + nextInt(rng, 0, 2) },
    { creature: 'ermitage_t7', count: 3 + nextInt(rng, 0, 2) },
    { creature: 'granit_t6', count: 8 + nextInt(rng, 0, 4) },
    { creature: 'ermitage_t6', count: 8 + nextInt(rng, 0, 4) },
    { creature: 'granit_t5', count: 14 + nextInt(rng, 0, 6) },
    { creature: 'ermitage_t5', count: 14 + nextInt(rng, 0, 6) },
  ];
}

function guardPower(stacks: readonly ArmyStack[] | undefined): number {
  if (!stacks) return 0;
  let total = 0;
  for (const s of stacks) {
    const tier = Number(s.creature.slice(-1));
    total += (TIER_POWER[tier] ?? 100) * s.count;
  }
  return total;
}

/* ── Artefacts ──────────────────────────────────────────────────────────── */

type Rarity = 'commun' | 'rare' | 'majeur' | 'relique';

/**
 * Réserve d'artefacts posés sur la carte, par rareté.
 *
 * ⚠️ Ces identifiants doivent rester alignés sur ceux publiés par
 * `@auvergne/content` (`ARTIFACTS`). Ils sont recopiés ici en clair, et non
 * lus à l'exécution, pour deux raisons : la carte ne dépend que du moteur, et
 * surtout `buildWorld(seed)` doit rendre exactement le même monde qu'il soit
 * appelé avant ou après `bootstrapEngine()`. `objects.test.ts` vérifie que
 * chaque tirage produit un identifiant non vide ; la cohérence avec le contenu
 * est vérifiée côté racine de composition.
 */
const ARTIFACT_POOL: Readonly<Record<Rarity, readonly string[]>> = {
  commun: [
    'chausses_du_colporteur',
    'lorgnette_de_belvedere',
    'ceinture_de_peage',
    'bourdon_de_pelerin',
    'mitaines_de_brodeuse',
    'capuche_de_bure',
    'besace_du_muletier',
    'medaille_du_bon_chemin',
    'brodequins_ferres',
    'jaque_de_toile',
    'fanion_de_corvee',
    'anneau_de_cuivre',
    'couteau_de_veneur',
    'baton_de_cantonnier',
    'bonnet_de_clerc',
    'gourde_des_sagnes',
  ],
  rare: [
    'gantelets_des_farges',
    'anneau_des_sources',
    'anneau_de_fortune',
    'banniere_grenat',
    'cor_de_veneur',
    'ceinture_du_gabelou',
    'chapeau_cire_du_gabelou',
    'bottes_du_chemin_de_sel',
    'sifflet_de_la_halle',
    'des_a_coudre_dacier',
    'corsage_brode_de_grenades',
    'banniere_aux_grenades_dor',
    'plastron_dardoise',
    'lanterne_des_sagnes',
    'anneau_du_carrier',
    'echarpe_de_brume',
    'collier_de_brume',
  ],
  majeur: [
    'haubert_dardoise',
    'carte_du_senechal',
    'heaume_du_banneret',
    'gantelet_du_forgeron',
    'anneau_de_la_futaie',
    'ceinture_aux_douze_bourses',
    'bottes_de_sept_layons',
    'etendard_du_serment',
    'calice_de_lhermitage',
    'couronne_comtale_de_forez',
    'collier_des_serments',
    'anneau_du_grand_livre',
  ],
  relique: [
    'escarboucle_de_vouivre',
    'sceptre_des_comtes',
    'ramure_du_cerf_miraculeux',
    'pierre_de_pamole',
    'serre_du_griffon_couronne',
    'manteau_de_la_dame_des_brumes',
    'bourdon_du_premier_pelerin',
  ],
};

const RARITY_BY_RING: Readonly<Record<1 | 2 | 3, { item: Rarity; weight: number }[]>> = {
  1: [
    { item: 'commun', weight: 80 },
    { item: 'rare', weight: 20 },
  ],
  2: [
    { item: 'commun', weight: 30 },
    { item: 'rare', weight: 55 },
    { item: 'majeur', weight: 15 },
  ],
  3: [
    { item: 'rare', weight: 30 },
    { item: 'majeur', weight: 55 },
    { item: 'relique', weight: 15 },
  ],
};

/* ── Ressources semées ──────────────────────────────────────────────────── */

const PILE_TABLE: { item: ResourceKey; weight: number }[] = [
  { item: 'ecus', weight: 26 },
  { item: 'bois', weight: 20 },
  { item: 'granit', weight: 18 },
  { item: 'fer', weight: 14 },
  { item: 'sel', weight: 10 },
  { item: 'essence', weight: 6 },
  { item: 'filDor', weight: 6 },
];

function pileAmount(rng: RngState, resource: ResourceKey, ring: number): number {
  if (resource === 'ecus') return (4 + nextInt(rng, 0, 4) + ring * 2) * 100;
  return 2 + nextInt(rng, 0, 3) + ring;
}

/* ── Construction ───────────────────────────────────────────────────────── */

interface Builder {
  ctx: ObjectContext;
  objects: MapObject[];
  occupied: Uint8Array;
  next: number;
}

function passable(ctx: ObjectContext, i: number): boolean {
  /* Le drapeau fait foi, pas le terrain : il connaît les ponts sur l'eau et
     les falaises infranchissables. L'ancien test `!== 'eau'` datait du temps
     où toute terre se traversait — le semeur aurait posé des trésors sur les
     falaises. */
  return (ctx.flags[i] & CELL_PASSABLE) !== 0;
}

function isFree(b: Builder, col: number, row: number): boolean {
  if (col < 1 || row < 1 || col >= COLS - 1 || row >= ROWS - 1) return false;
  const i = idx(col, row);
  if (b.occupied[i] === 1) return false;
  return passable(b.ctx, i);
}

/** Cherche en spirale la première case libre et franchissable autour de `at`. */
function snap(b: Builder, at: MapCoord, maxRadius = 6): MapCoord | null {
  if (isFree(b, at.col, at.row)) return { col: at.col, row: at.row };
  for (let r = 1; r <= maxRadius; r++) {
    for (let dr = -r; dr <= r; dr++) {
      for (let dc = -r; dc <= r; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== r) continue;
        const col = at.col + dc;
        const row = at.row + dr;
        if (isFree(b, col, row)) return { col, row };
      }
    }
  }
  return null;
}

function place(
  b: Builder,
  kind: MapObjectKind,
  at: MapCoord,
  data: Record<string, unknown>,
  options: { footprint?: MapCoord[]; guard?: ArmyStack[] } = {},
): MapObject | null {
  const footprint = options.footprint ?? [{ col: at.col, row: at.row }];
  for (const f of footprint) {
    if (f.col < 0 || f.row < 0 || f.col >= COLS || f.row >= ROWS) return null;
    if (b.occupied[idx(f.col, f.row)] === 1) return null;
  }
  const obj: MapObject = {
    uid: `O_${String(b.next++).padStart(4, '0')}`,
    kind,
    at: { col: at.col, row: at.row },
    footprint: footprint.map((f) => ({ col: f.col, row: f.row })),
    entrance: { col: at.col, row: at.row },
    owner: null,
    data,
  };
  if (options.guard && options.guard.length > 0) obj.guard = options.guard;
  /*
   * L'entrée d'un lieu se visite, donc se rejoint. Les sites fixes suivent la
   * géographie réelle, et la géographie réelle met les belvédères sur les
   * escarpements : le Belvédère de Pamole est tombé pile sur une case classée
   * falaise le jour où la falaise est devenue infranchissable. On ne rase pas
   * l'escarpement — c'est lui qui fait le belvédère — on taille un accès :
   * la case d'entrée devient du rocher franchissable, comme un sentier
   * d'aiguille taillé dans la barre.
   */
  const ei = idx(obj.entrance.col, obj.entrance.row);
  if (TERRAINS[b.ctx.terrain[ei]] === 'falaise') {
    b.ctx.terrain[ei] = TERRAINS.indexOf('rocher');
    b.ctx.flags[ei] |= CELL_PASSABLE;
  }
  for (const f of obj.footprint) b.occupied[idx(f.col, f.row)] = 1;
  b.objects.push(obj);
  return obj;
}

/* ── Anneaux de difficulté ──────────────────────────────────────────────── */

/** Distance de Tchebychev à la position de départ la plus proche. */
function startDistanceField(): Uint16Array {
  const field = new Uint16Array(CELLS).fill(0xffff);
  const starts = START_KEYS.map((k) => START_POSITIONS[k].at);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      let best = 0xffff;
      for (const s of starts) {
        const d = Math.max(Math.abs(s.col - col), Math.abs(s.row - row));
        if (d < best) best = d;
      }
      field[row * COLS + col] = best;
    }
  }
  return field;
}

function ringAt(startDist: Uint16Array, col: number, row: number): 1 | 2 | 3 {
  const mt = anchorCell('maison_tresor');
  const dTresor = Math.max(Math.abs(mt.col - col), Math.abs(mt.row - row));
  const d = startDist[row * COLS + col];
  if (d <= 26) return 1;
  if (dTresor <= 34) return 3;
  return d <= 58 ? 2 : 3;
}

/* ── Champ de coût (équilibrage des départs) ────────────────────────────── */

/** Budget de marche d'une semaine d'exploration, en points. */
export const WEEK_BUDGET = 12000;

function terrainCostOf(code: number): number {
  return TERRAIN_COST[TERRAINS[code] ?? 'prairie'];
}

/** Dijkstra en huit directions, plafonné au budget. Coûts de terrain du brief. */
export function costFieldFrom(ctx: ObjectContext, from: MapCoord, budget: number): Int32Array {
  const dist = new Int32Array(CELLS).fill(0x7fffffff);
  const heap = new IntHeap(1 << 14);
  const start = idx(from.col, from.row);
  dist[start] = 0;
  heap.push(0, start);
  const closed = new Uint8Array(CELLS);

  while (heap.length > 0) {
    const cur = heap.pop();
    if (cur < 0) break;
    if (closed[cur] === 1) continue;
    closed[cur] = 1;
    const g = dist[cur];
    if (g >= budget) continue;
    const col = cur % COLS;
    const row = (cur / COLS) | 0;
    for (let k = 0; k < 8; k++) {
      const nc = col + NDC[k];
      const nr = row + NDR[k];
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const j = nr * COLS + nc;
      if (closed[j] === 1) continue;
      const code = ctx.terrain[j];
      let step: number;
      if (code === T.eau) {
        // Pont ou gué : coût d'un chemin ; sinon infranchissable.
        if ((ctx.flags[j] & CELL_BRIDGE) === 0) continue;
        step = TERRAIN_COST.chemin;
      } else {
        step = terrainCostOf(code);
      }
      if (NDC[k] !== 0 && NDR[k] !== 0) step = Math.trunc((step * 141) / 100);
      const g2 = g + step;
      if (g2 >= dist[j] || g2 > budget) continue;
      dist[j] = g2;
      heap.push(g2, j);
    }
  }
  return dist;
}

/** Valeur économique brute d'un objet, en écus. */
export function objectValue(obj: MapObject): number {
  switch (obj.kind) {
    case 'mine': {
      const resource = obj.data.resource as ResourceKey | undefined;
      const amount = (obj.data.amount as number | undefined) ?? 0;
      if (!resource) return 0;
      return amount * (RESOURCE_VALUE[resource] ?? 1) * 8;
    }
    case 'ressource': {
      const resource = obj.data.resource as ResourceKey | undefined;
      const amount = (obj.data.amount as number | undefined) ?? 0;
      if (!resource) return 0;
      return amount * (RESOURCE_VALUE[resource] ?? 1);
    }
    case 'artefact':
      return 900;
    case 'village':
      return 1400;
    case 'caravane':
      return 550;
    case 'auberge':
      return 250;
    case 'sanctuaire':
    case 'source':
      return 200;
    case 'belvedere':
      return 180;
    case 'borne':
      return 150;
    case 'quete':
      return 200;
    default:
      return 0;
  }
}

/**
 * Valeur accessible depuis un départ : somme des valeurs, escomptées par la
 * distance restante dans le budget et par la puissance de la garde.
 */
export function accessibleValue(objects: readonly MapObject[], field: Int32Array): number {
  let total = 0;
  for (const obj of objects) {
    const raw = objectValue(obj);
    if (raw <= 0) continue;
    const cost = field[idx(obj.entrance.col, obj.entrance.row)];
    if (cost >= WEEK_BUDGET) continue;
    const reach = Math.trunc(((WEEK_BUDGET - cost) * 10000) / WEEK_BUDGET);
    const power = guardPower(obj.guard);
    const risk = Math.max(2000, 10000 - Math.trunc(power / 2));
    total += Math.trunc((raw * reach * risk) / 100000000);
  }
  return total;
}

/* ── Assemblage ─────────────────────────────────────────────────────────── */

export interface ObjectBuild {
  objects: MapObject[];
  /** Valeur accessible en sept jours, par position de départ. */
  startValues: Record<StartKey, number>;
}

export function buildObjects(ctx: ObjectContext, seed: number): ObjectBuild {
  const rng = createRng(seed >>> 0, 0x466f7265);
  const b: Builder = {
    ctx,
    objects: [],
    occupied: new Uint8Array(CELLS),
    next: 1,
  };
  const startDist = startDistanceField();

  /* 1 — Capitales. */
  for (const key of START_KEYS) {
    const sp = START_POSITIONS[key];
    place(b, 'ville', sp.at, {
      townUid: sp.townUid,
      name: sp.label,
      capital: true,
      start: key,
      region: sp.region,
    }, { footprint: townFootprint(sp.at) });
  }

  /* 2 — Centres neutres capturables. */
  for (const n of NEUTRAL_CENTERS) {
    const at = anchorCell(n.anchor);
    place(
      b,
      'village',
      at,
      { townUid: n.townUid, name: n.name, capital: false, region: n.region, vocation: n.vocation },
      { footprint: townFootprint(at), guard: guardFor(rng, 2, 3) },
    );
  }

  /* 3 — La Maison du Trésor. */
  const mt = anchorCell('maison_tresor');
  place(
    b,
    'maison_tresor',
    mt,
    {
      name: 'Maison du Trésor',
      lore: "Ancien poste de contrôle du sel, à la limite des pays de gabelle. Le Grand Livre y est scellé depuis la mort du dernier comte.",
    },
    { footprint: townFootprint(mt), guard: treasureGuard(rng) },
  );

  /* 4 — Les cinq Sceaux des Marches. */
  for (const s of SEAL_SITES) {
    const at = snap(b, s.at, 4) ?? s.at;
    place(b, 'sceau', at, { seal: s.seal, name: s.label, lore: s.lore }, {
      guard: guardFor(rng, 3, 4),
    });
  }

  /* 5 — Bornes, belvédères, sanctuaires, sources, auberges, doléances. */
  for (const s of BORNE_SITES) {
    const at = snap(b, s.at, 4);
    if (at) place(b, 'borne', at, { name: s.label, network: 'marches' });
  }
  for (const s of VIEWPOINT_SITES) {
    const at = snap(b, s.at, 4);
    if (at) place(b, 'belvedere', at, { name: s.label, radius: 22 });
  }
  for (const s of SHRINE_SITES) {
    const at = snap(b, s.at, 4);
    if (at) place(b, s.kind, at, { name: s.label });
  }
  for (const s of INN_SITES) {
    const at = snap(b, s.at, 4);
    if (at) place(b, 'auberge', at, { name: s.label });
  }
  for (const s of QUEST_SITES) {
    const at = snap(b, s.at, 4);
    if (at) {
      place(b, 'quete', at, {
        name: s.label,
        reward: pickWeighted(rng, PILE_TABLE),
        amount: 300 + nextInt(rng, 0, 6) * 100,
      });
    }
  }

  /* 6 — Artefacts posés à demeure. */
  for (const a of FIXED_ARTIFACTS) {
    const at = snap(b, a.at, 4);
    if (!at) continue;
    place(
      b,
      'artefact',
      at,
      { artifact: a.artifact, rarity: a.rarity, name: a.label, fixed: true },
      { guard: guardFor(rng, 3, 4) },
    );
  }

  /* 7 — Gisements majeurs. */
  for (const m of MINE_SITES) {
    const at = snap(b, m.at, 5);
    if (!at) continue;
    place(
      b,
      'mine',
      at,
      { resource: m.resource, amount: m.amount, name: m.label },
      { guard: guardFor(rng, m.ring, m.ring === 1 ? 2 : 3) },
    );
  }

  /* 8 — Caches, artefacts, gardes errantes et caravanes, tirés de la graine. */
  const routeDist = roadDistanceField(ctx);
  const caches = collectCaches(ctx, b, startDist, routeDist);
  seedArtifacts(b, rng, caches);
  seedPiles(b, rng, caches);
  seedGuards(b, rng, ctx, startDist);
  seedCaravans(b, rng, ctx);

  /* 8 bis — La densification (docs/08-PLAN-AAA.md, lot 1.1). La carte portait
     285 objets sur 105 349 cases praticables — un toutes les 370 cases, un
     héros glaneur omniscient n'en ramassait que 1,9 par journée de marche, et
     26 % des blocs de 32 × 32 étaient entièrement vides. Une carte de HMM3 de
     taille comparable en porte un toutes les 120 à 150 cases. Chaque famille
     ci-dessous transpose une famille de HMM3 dont l'absence était mesurée. */
  seedDensification(b, rng, ctx, startDist, caches, routeDist);
  seedCouverture(b, rng, ctx);

  /* 9 — Équilibrage économique des départs. */
  const startValues = balanceStarts(b, rng, ctx, caches);

  return { objects: b.objects, startValues };
}

/** Distance de Tchebychev à la voie la plus proche, plafonnée à 15. */
function roadDistanceField(ctx: ObjectContext): Uint8Array {
  const dist = new Uint8Array(CELLS).fill(15);
  const file = new Int32Array(CELLS);
  let queue = 0;
  for (let i = 0; i < CELLS; i++) {
    if ((ctx.flags[i] & CELL_ROAD) !== 0) {
      dist[i] = 0;
      file[queue++] = i;
    }
  }
  let tete = 0;
  while (tete < queue) {
    const i = file[tete++];
    const d = dist[i];
    if (d >= 15) continue;
    const col = i % COLS;
    const row = (i / COLS) | 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        const j = r * COLS + c;
        if (dist[j] <= d + 1) continue;
        dist[j] = d + 1;
        file[queue++] = j;
      }
    }
  }
  return dist;
}

/**
 * Cases autorisées pour une cache, groupées par anneau.
 *
 * Les caches à moins de six cases d'une voie comptent double : les trésors
 * d'une carte de HMM3 s'égrènent le long des routes, pas au fond des combes —
 * c'est ce qui fait qu'une journée de marche est une cueillette et non une
 * traversée. Mesuré avant le biais : le héros glaneur plafonnait à 2,3 objets
 * par jour malgré une densité conforme, le coût médian entre deux trouvailles
 * ne descendant pas sous 650 points.
 */
function collectCaches(
  ctx: ObjectContext,
  b: Builder,
  startDist: Uint16Array,
  routeDist: Uint8Array,
): Record<1 | 2 | 3, number[]> {
  const out: Record<1 | 2 | 3, number[]> = { 1: [], 2: [], 3: [] };
  for (let row = 3; row < ROWS - 3; row++) {
    for (let col = 3; col < COLS - 3; col++) {
      const i = row * COLS + col;
      if ((ctx.flags[i] & CELL_CACHE) === 0) continue;
      if (!passable(ctx, i)) continue;
      if (b.occupied[i] === 1) continue;
      const ring = ringAt(startDist, col, row);
      out[ring].push(i);
      if (routeDist[i] <= 6) out[ring].push(i);
    }
  }
  return out;
}

function takeCache(rng: RngState, caches: Record<1 | 2 | 3, number[]>, ring: 1 | 2 | 3): number {
  for (const r of [ring, 2, 1, 3] as (1 | 2 | 3)[]) {
    const list = caches[r];
    if (list.length === 0) continue;
    const k = nextInt(rng, 0, list.length - 1);
    const value = list[k];
    list[k] = list[list.length - 1];
    list.pop();
    return value;
  }
  return -1;
}

function seedArtifacts(b: Builder, rng: RngState, caches: Record<1 | 2 | 3, number[]>): void {
  const plan: { ring: 1 | 2 | 3; count: number }[] = [
    { ring: 1, count: 4 },
    { ring: 2, count: 6 },
    { ring: 3, count: 5 },
  ];
  for (const entry of plan) {
    for (let k = 0; k < entry.count; k++) {
      const i = takeCache(rng, caches, entry.ring);
      if (i < 0) continue;
      const rarity = pickWeighted(rng, RARITY_BY_RING[entry.ring]);
      const pool = ARTIFACT_POOL[rarity];
      const artifact = pool[nextInt(rng, 0, pool.length - 1)];
      const at = { col: i % COLS, row: (i / COLS) | 0 };
      place(b, 'artefact', at, { artifact, rarity }, {
        guard: entry.ring === 1 ? undefined : guardFor(rng, entry.ring, 2),
      });
    }
  }
}

function seedPiles(b: Builder, rng: RngState, caches: Record<1 | 2 | 3, number[]>): void {
  const plan: { ring: 1 | 2 | 3; count: number }[] = [
    { ring: 1, count: 34 },
    { ring: 2, count: 30 },
    { ring: 3, count: 22 },
  ];
  for (const entry of plan) {
    for (let k = 0; k < entry.count; k++) {
      const i = takeCache(rng, caches, entry.ring);
      if (i < 0) continue;
      const resource = pickWeighted(rng, PILE_TABLE);
      const at = { col: i % COLS, row: (i / COLS) | 0 };
      place(b, 'ressource', at, {
        resource,
        amount: pileAmount(rng, resource, entry.ring),
      });
    }
  }
}

function seedGuards(
  b: Builder,
  rng: RngState,
  ctx: ObjectContext,
  startDist: Uint16Array,
): void {
  // Les gardes errantes tiennent les passages : on ne les pose que sur des
  // cases de voie ou de lisière, jamais au milieu d'un versant vide.
  const spots: number[] = [];
  for (let row = 6; row < ROWS - 6; row++) {
    for (let col = 6; col < COLS - 6; col++) {
      const i = row * COLS + col;
      if (b.occupied[i] === 1) continue;
      if (!passable(ctx, i)) continue;
      const onRoad = (ctx.flags[i] & CELL_ROAD) !== 0;
      const onEdge = (ctx.flags[i] & CELL_EDGE) !== 0;
      if (!onRoad && !onEdge) continue;
      if (startDist[i] < 14) continue;
      spots.push(i);
    }
  }
  shuffle(rng, spots);
  const wanted = 46;
  let placed = 0;
  const minSpacing = 9;
  const taken: MapCoord[] = [];
  for (const i of spots) {
    if (placed >= wanted) break;
    const col = i % COLS;
    const row = (i / COLS) | 0;
    let tooClose = false;
    for (const t of taken) {
      if (Math.max(Math.abs(t.col - col), Math.abs(t.row - row)) < minSpacing) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    const ring = ringAt(startDist, col, row);
    const obj = place(b, 'garde', { col, row }, { ring }, { guard: guardFor(rng, ring, 3) });
    if (obj) {
      taken.push({ col, row });
      placed++;
    }
  }
}

function seedCaravans(b: Builder, rng: RngState, ctx: ObjectContext): void {
  const spots: number[] = [];
  for (let row = 4; row < ROWS - 4; row++) {
    for (let col = 4; col < COLS - 4; col++) {
      const i = row * COLS + col;
      if (b.occupied[i] === 1) continue;
      if ((ctx.flags[i] & CELL_ROAD) === 0) continue;
      if (!passable(ctx, i)) continue;
      spots.push(i);
    }
  }
  shuffle(rng, spots);
  const goods: ResourceKey[] = ['sel', 'fer', 'bois', 'granit', 'essence', 'filDor'];
  let placed = 0;
  const taken: MapCoord[] = [];
  for (const i of spots) {
    if (placed >= 8) break;
    const col = i % COLS;
    const row = (i / COLS) | 0;
    let tooClose = false;
    for (const t of taken) {
      if (Math.max(Math.abs(t.col - col), Math.abs(t.row - row)) < 24) {
        tooClose = true;
        break;
      }
    }
    if (tooClose) continue;
    const good = goods[nextInt(rng, 0, goods.length - 1)];
    const obj = place(b, 'caravane', { col, row }, {
      name: 'Caravane des marchands',
      resource: good,
      amount: 3 + nextInt(rng, 0, 4),
      ecus: 300 + nextInt(rng, 0, 4) * 100,
    });
    if (obj) {
      taken.push({ col, row });
      placed++;
    }
  }
}

/* ═══════════ La densification (lot 1.1) ═══════════════════════════════════
   Douze familles nouvelles, tirées de la graine, placées par anneau de
   difficulté. Les quantités visent une case praticable sur 150 au plus —
   la densité d'une carte HMM3 soignée — et le glaneur à quatre objets par
   journée de marche. Les structures reçoivent leur embranchement de chemin
   automatiquement (embranchements.ts). ═══════════════════════════════════ */

/** Cases ouvertes — praticables, libres, hors voie — pour poser des bâtis. */
function openSpots(b: Builder, ctx: ObjectContext, routeDist: Uint8Array, margin = 4): number[] {
  const spots: number[] = [];
  for (let row = margin; row < ROWS - margin; row++) {
    for (let col = margin; col < COLS - margin; col++) {
      const i = row * COLS + col;
      if (b.occupied[i] === 1) continue;
      if (!passable(ctx, i)) continue;
      if ((ctx.flags[i] & CELL_ROAD) !== 0) continue;
      /* L'eau pontee est praticable — c'est un pont — mais on ne batit pas
         dessus, pas plus qu'on n'y pose un coffre. */
      if (TERRAINS[ctx.terrain[i]] === 'eau') continue;
      spots.push(i);
      /* Les bâtis aussi se tiennent près des voies — on ne bâtit pas un
         moulin au fond d'une combe — sans y être tous : poids double sous
         six cases, pas une exclusivité. */
      if (routeDist[i] <= 6) spots.push(i);
    }
  }
  return spots;
}

/** Pose `count` objets d'une nature sur des cases ouvertes, espacés d'au moins `spacing`. */
function poserEspaces(
  b: Builder,
  rng: RngState,
  spots: number[],
  count: number,
  spacing: number,
  fabrique: (at: MapCoord, ring: 1 | 2 | 3) => void,
  startDist: Uint16Array,
): void {
  const pris: MapCoord[] = [];
  let poses = 0;
  for (const i of spots) {
    if (poses >= count) break;
    const col = i % COLS;
    const row = (i / COLS) | 0;
    if (b.occupied[i] === 1) continue;
    let proche = false;
    for (const t of pris) {
      if (Math.max(Math.abs(t.col - col), Math.abs(t.row - row)) < spacing) {
        proche = true;
        break;
      }
    }
    if (proche) continue;
    fabrique({ col, row }, ringAt(startDist, col, row));
    pris.push({ col, row });
    poses++;
  }
}

/** Palier de créature d'une demeure franche, selon l'anneau de difficulté. */
const DEMEURE_TIERS: Readonly<Record<1 | 2 | 3, number[]>> = {
  1: [1, 1, 2],
  2: [2, 3, 3, 4],
  3: [3, 4, 5],
};

function seedDensification(
  b: Builder,
  rng: RngState,
  ctx: ObjectContext,
  startDist: Uint16Array,
  caches: Record<1 | 2 | 3, number[]>,
  routeDist: Uint8Array,
): void {
  /* — Coffres : 140, cachés sous les couverts, valeur montant avec l'anneau — */
  const coffres: { ring: 1 | 2 | 3; count: number }[] = [
    { ring: 1, count: 60 },
    { ring: 2, count: 50 },
    { ring: 3, count: 30 },
  ];
  for (const entry of coffres) {
    for (let k = 0; k < entry.count; k++) {
      const i = takeCache(rng, caches, entry.ring);
      if (i < 0) continue;
      place(b, 'coffre', { col: i % COLS, row: (i / COLS) | 0 }, {
        ecus: (10 + entry.ring * 5 + nextInt(rng, 0, 5)) * 100,
        savoir: nextInt(rng, 0, 2) === 0 ? 1 : 0,
      });
    }
  }

  /* — Tas supplémentaires : 80 — */
  const tas: { ring: 1 | 2 | 3; count: number }[] = [
    { ring: 1, count: 40 },
    { ring: 2, count: 25 },
    { ring: 3, count: 15 },
  ];
  for (const entry of tas) {
    for (let k = 0; k < entry.count; k++) {
      const i = takeCache(rng, caches, entry.ring);
      if (i < 0) continue;
      const resource = pickWeighted(rng, PILE_TABLE);
      place(b, 'ressource', { col: i % COLS, row: (i / COLS) | 0 }, {
        resource,
        amount: pileAmount(rng, resource, entry.ring),
      });
    }
  }

  const spots = openSpots(b, ctx, routeDist);
  shuffle(rng, spots);

  /* — Demeures franches : 90, la famille qui manquait le plus — un recruteur
       extérieur donne à l'exploration une conséquence militaire. — */
  poserEspaces(b, rng, spots, 90, 10, (at, ring) => {
    const tiers = DEMEURE_TIERS[ring];
    const tier = tiers[nextInt(rng, 0, tiers.length - 1)];
    const faction: Faction = nextInt(rng, 0, 1) === 0 ? 'granit' : 'ermitage';
    const creature = `${faction}_t${tier}`;
    place(
      b,
      'demeure',
      at,
      { creature, stock: 0, name: NOMS_DEMEURES[tier] ?? 'Demeure franche' },
      ring >= 2 ? { guard: guardFor(rng, ring, 2) } : {},
    );
  }, startDist);

  /* — Gisements supplémentaires : 30, dont les orpaillages qui rendent des
       écus — l'équivalent des mines d'or, gardés à la mesure du gain. — */
  poserEspaces(b, rng, spots, 30, 14, (at, ring) => {
    const orpaillage = ring >= 2 && nextInt(rng, 0, 2) === 0;
    if (orpaillage) {
      place(
        b,
        'mine',
        at,
        { resource: 'ecus', amount: 300 + ring * 60, name: 'Orpaillage' },
        { guard: guardFor(rng, ring === 3 ? 4 : 3, 3) },
      );
    } else {
      const filon = pickWeighted(rng, PILE_TABLE);
      place(
        b,
        'mine',
        at,
        { resource: filon === 'ecus' ? 'fer' : filon, amount: 1 + (ring > 1 ? 1 : 0), name: 'Filon' },
        { guard: guardFor(rng, ring, ring === 1 ? 2 : 3) },
      );
    }
  }, startDist);

  /* — Repaires gardés : 20 banques, gros gardien, gros butin, repeuplées — */
  poserEspaces(b, rng, spots, 20, 18, (at, ring) => {
    const garde = guardFor(rng, ring === 1 ? 2 : ring === 2 ? 3 : 4, 3);
    place(
      b,
      'banque',
      at,
      {
        ecus: (20 + ring * 15 + nextInt(rng, 0, 10)) * 100,
        resource: pickWeighted(rng, PILE_TABLE),
        amount: 4 + ring * 3,
        repop: 4,
        garde0: garde.map((g) => ({ ...g })),
        name: NOMS_REPAIRES[nextInt(rng, 0, NOMS_REPAIRES.length - 1)],
      },
      { guard: garde },
    );
  }, startDist);

  /* — Écoles : 24, temples : 16, fontaines : 14, moulins : 12 — */
  const matieres = ['vaillance', 'garde', 'mystique', 'savoir'] as const;
  let ecole = 0;
  poserEspaces(b, rng, spots, 24, 16, (at) => {
    place(b, 'ecole', at, { matiere: matieres[ecole++ % matieres.length] });
  }, startDist);
  poserEspaces(b, rng, spots, 16, 20, (at) => {
    place(b, 'temple', at, { name: 'Oratoire' });
  }, startDist);
  poserEspaces(b, rng, spots, 14, 20, (at) => {
    place(b, 'fontaine', at, { name: 'Fontaine aux fées' });
  }, startDist);
  poserEspaces(b, rng, spots, 12, 22, (at) => {
    const resource = pickWeighted(rng, PILE_TABLE);
    place(b, 'moulin', at, {
      resource,
      amount: resource === 'ecus' ? 250 : 4,
      name: 'Moulin',
    });
  }, startDist);

  /* — Pierres levées : 8 paires, jumelées loin l'une de l'autre — */
  const bornes: MapCoord[] = [];
  poserEspaces(b, rng, spots, 16, 26, (at) => {
    bornes.push(at);
  }, startDist);
  /* Apparier la plus proche avec la plus lointaine : chaque paire raccourcit
     vraiment la carte au lieu de relier deux voisines. */
  bornes.sort((a, z) => a.col + a.row * COLS - (z.col + z.row * COLS));
  for (let k = 0; k * 2 + 1 < bornes.length; k++) {
    const a = bornes[k];
    const z = bornes[bornes.length - 1 - k];
    const uidA = `O_${String(b.next).padStart(4, '0')}`;
    const uidZ = `O_${String(b.next + 1).padStart(4, '0')}`;
    place(b, 'monolithe', a, { jumeau: uidZ, name: 'Pierre levée' });
    place(b, 'monolithe', z, { jumeau: uidA, name: 'Pierre levée' });
  }

  /* — Montjoies : 10, cartographes : 3, colporteurs : 4 — */
  poserEspaces(b, rng, spots, 10, 30, (at) => {
    place(b, 'obelisque', at, { name: 'Montjoie' });
  }, startDist);
  poserEspaces(b, rng, spots, 3, 60, (at) => {
    const i = at.row * COLS + at.col;
    place(b, 'cartographe', at, { prix: 1000, region: undefined, name: 'Cartographe', regionIdx: b.ctx.region[i] });
  }, startDist);
  poserEspaces(b, rng, spots, 4, 40, (at, ring) => {
    const rarity: Rarity = ring === 3 ? 'majeur' : 'rare';
    const pool = ARTIFACT_POOL[rarity];
    place(b, 'marche_noir', at, {
      artifact: pool[nextInt(rng, 0, pool.length - 1)],
      prix: rarity === 'majeur' ? 4000 : 2500,
      name: 'Colporteurs',
    });
  }, startDist);
}

const NOMS_DEMEURES: Readonly<Record<number, string>> = {
  1: 'Hameau des journaliers',
  2: 'Bureau de la gabelle',
  3: 'Butte de tir',
  4: 'Atelier des brodeuses',
  5: 'Soue fortifiée',
};

const NOMS_REPAIRES = [
  'Repaire des brigands',
  'Crypte du vieux prieuré',
  'Terrier des loups',
  'Grange aux écorcheurs',
] as const;

/**
 * La passe de couverture : aucun bloc de 32 × 32 praticable ne reste vide.
 *
 * Les placements par anneau et par cache suivent la géographie, et la
 * géographie laisse des déserts : 26 % des blocs n'avaient rien. Un joueur
 * qui traverse mille cases sans rien rencontrer n'explore pas, il marche.
 * Chaque bloc vide reçoit un ou deux ramassages — le minimum qui change la
 * traversée en cueillette.
 */
function seedCouverture(b: Builder, rng: RngState, ctx: ObjectContext): void {
  const BLOC = 32;
  for (let br = 0; br < ROWS; br += BLOC) {
    for (let bc = 0; bc < COLS; bc += BLOC) {
      let vide = true;
      const libres: number[] = [];
      for (let row = br; row < Math.min(br + BLOC, ROWS); row++) {
        for (let col = bc; col < Math.min(bc + BLOC, COLS); col++) {
          const i = row * COLS + col;
          if (b.occupied[i] === 1) {
            vide = false;
            break;
          }
          if (
            passable(ctx, i) &&
            (ctx.flags[i] & CELL_ROAD) === 0 &&
            TERRAINS[ctx.terrain[i]] !== 'eau'
          ) {
            libres.push(i);
          }
        }
        if (!vide) break;
      }
      if (!vide || libres.length < 40) continue;
      const n = 1 + nextInt(rng, 0, 1);
      for (let k = 0; k < n && libres.length > 0; k++) {
        const idx2 = nextInt(rng, 0, libres.length - 1);
        const i = libres[idx2];
        libres[idx2] = libres[libres.length - 1];
        libres.pop();
        const resource = pickWeighted(rng, PILE_TABLE);
        place(b, 'ressource', { col: i % COLS, row: (i / COLS) | 0 }, {
          resource,
          amount: pileAmount(rng, resource, 2),
        });
      }
    }
  }
}


/** Écart relatif maximal toléré entre positions de départ, en points de base. */
const BALANCE_TOLERANCE_BP = 300;
/** Nombre maximal de passes de compensation. */
const BALANCE_PASSES = 18;

function balanceStarts(
  b: Builder,
  rng: RngState,
  ctx: ObjectContext,
  caches: Record<1 | 2 | 3, number[]>,
): Record<StartKey, number> {
  const fields = new Map<StartKey, Int32Array>();
  for (const key of START_KEYS) {
    fields.set(key, costFieldFrom(ctx, START_POSITIONS[key].at, WEEK_BUDGET));
  }

  // Cases de compensation candidates, triées par proximité de chaque départ.
  const candidates = new Map<StartKey, number[]>();
  for (const key of START_KEYS) {
    const field = fields.get(key) as Int32Array;
    const list: number[] = [];
    for (const ring of [1, 2, 3] as (1 | 2 | 3)[]) {
      for (const i of caches[ring]) {
        if (field[i] < Math.trunc((WEEK_BUDGET * 3) / 5)) list.push(i);
      }
    }
    list.sort((x, y) => field[x] - field[y] || x - y);
    candidates.set(key, list);
  }

  const values = {} as Record<StartKey, number>;
  for (let pass = 0; pass < BALANCE_PASSES; pass++) {
    let max = 0;
    for (const key of START_KEYS) {
      const v = accessibleValue(b.objects, fields.get(key) as Int32Array);
      values[key] = v;
      if (v > max) max = v;
    }
    let worstGap = 0;
    for (const key of START_KEYS) {
      const gap = Math.trunc(((max - values[key]) * 10000) / Math.max(1, max));
      if (gap > worstGap) worstGap = gap;
    }
    if (worstGap <= BALANCE_TOLERANCE_BP) break;

    for (const key of START_KEYS) {
      const gap = max - values[key];
      if (Math.trunc((gap * 10000) / Math.max(1, max)) <= BALANCE_TOLERANCE_BP / 2) continue;
      const list = candidates.get(key) as number[];
      // Une cache proche vaut presque sa valeur faciale : on vise la moitié du
      // manque à chaque passe, ce qui converge sans jamais dépasser.
      const wanted = Math.max(120, Math.trunc(gap / 2));
      addCompensation(b, rng, list, wanted, fields.get(key) as Int32Array);
    }
  }

  for (const key of START_KEYS) {
    values[key] = accessibleValue(b.objects, fields.get(key) as Int32Array);
  }
  return values;
}

/** Valeur faciale maximale d'une cache de compensation, en écus. */
const COMPENSATION_CAP = 900;
/** Nombre maximal de caches posées en une passe pour un même départ. */
const COMPENSATION_PILES = 8;

/**
 * Pose des caches de compensation jusqu'à apporter `wantedValue` à la position
 * concernée. Chaque cache reste d'une taille crédible : on en sème plusieurs
 * plutôt qu'un magot unique.
 */
function addCompensation(
  b: Builder,
  rng: RngState,
  list: number[],
  wantedValue: number,
  field: Int32Array,
): void {
  let delivered = 0;
  let piles = 0;
  while (list.length > 0 && delivered < wantedValue && piles < COMPENSATION_PILES) {
    const i = list.shift() as number;
    if (b.occupied[i] === 1) continue;
    const col = i % COLS;
    const row = (i / COLS) | 0;
    const cost = field[i];
    if (cost >= WEEK_BUDGET) continue;
    const reach = Math.trunc(((WEEK_BUDGET - cost) * 10000) / WEEK_BUDGET);
    if (reach <= 0) continue;

    // Valeur faciale nécessaire pour apporter le reste après escompte.
    const remaining = wantedValue - delivered;
    const raw = Math.min(COMPENSATION_CAP, Math.trunc((remaining * 10000) / reach));
    if (raw < 40) break;

    const resource = pickWeighted(rng, PILE_TABLE);
    const unit = RESOURCE_VALUE[resource] ?? 1;
    let amount: number;
    if (resource === 'ecus') {
      amount = Math.max(100, Math.trunc(raw / 50) * 50);
    } else {
      amount = Math.max(2, Math.min(60, Math.trunc(raw / unit)));
    }
    const placed = place(b, 'ressource', { col, row }, { resource, amount, compensation: true });
    if (!placed) continue;
    delivered += Math.trunc((amount * unit * reach) / 10000);
    piles++;
  }
}
