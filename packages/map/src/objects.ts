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
/**
 * L'emprise carrée d'une place forte, deux cases sur deux, appuyée sur son
 * ancrage.
 *
 * Elle se posait toujours au nord-est de l'ancrage. Quand la carte a pris la
 * taille d'une XL de HMM3, les cours d'eau reprojetés sont passés sous
 * certaines places : un quart de bourg se retrouvait dans la rivière, et le
 * comblement qui suivait effaçait le lit ou le pont. On choisit désormais le
 * quadrant qui tombe au sec — une ville se bâtit sur la rive, ce qui est
 * exactement ce qu'ont fait les vraies. L'ordre d'essai est fixe, donc le
 * résultat reste identique au bit près d'une machine à l'autre.
 */
function townFootprint(at: MapCoord, ctx?: ObjectContext): MapCoord[] {
  const quadrants: readonly (readonly [number, number])[] = [
    [0, -1],
    [-1, -1],
    [0, 0],
    [-1, 0],
  ];
  const cases = (dc: number, dr: number): MapCoord[] => [
    { col: at.col + dc, row: at.row + dr },
    { col: at.col + dc + 1, row: at.row + dr },
    { col: at.col + dc, row: at.row + dr + 1 },
    { col: at.col + dc + 1, row: at.row + dr + 1 },
  ];
  if (ctx) {
    for (const [dc, dr] of quadrants) {
      const bloc = cases(dc, dr);
      const bon = bloc.every(
        (f) =>
          f.col >= 0 &&
          f.row >= 0 &&
          f.col < COLS &&
          f.row < ROWS &&
          TERRAINS[ctx.terrain[idx(f.col, f.row)]] !== 'eau',
      );
      if (bon) return bloc;
    }
  }
  return cases(0, -1);
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
    at: c(36, 65),
    label: 'Sceau des Hautes-Futaies',
    lore: "Une pierre levée sous les plus vieux sapins des futaies de Viscomtat. On dit qu'elle marque la limite que les bûcherons ne franchissaient jamais.",
  },
  {
    seal: 'farges',
    at: c(98, 58),
    label: 'Sceau des Farges',
    lore: "Scellé dans le linteau d'une forge abandonnée, en contrebas de la porte des Farges. Le fer y garde encore la chaleur des comtes.",
  },
  {
    seal: 'pamole',
    at: c(35, 122),
    label: 'Sceau de Pamole',
    lore: "Gravé à même la Pierre Pamole, face au levant. Par temps clair, on voit d'ici la moitié du Forez.",
  },
  {
    seal: 'hermitage',
    at: c(58, 107),
    label: "Sceau de l'Hermitage",
    lore: "Déposé dans la niche du vallon de l'Hermitage, entre la source et les cellules de pèlerins.",
  },
  {
    seal: 'brumes',
    at: c(71, 70),
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
  { key: 'borne_arconsat', kind: 'borne', at: c(49, 26), label: "Borne des Hauts d'Arconsat", clear: 1 },
  { key: 'borne_tresor', kind: 'borne', at: c(59, 49), label: 'Borne du Trésor', clear: 1 },
  { key: 'borne_cervieres', kind: 'borne', at: c(92, 58), label: 'Borne de Cervières', clear: 1 },
  { key: 'borne_viscomtat', kind: 'borne', at: c(32, 70), label: 'Borne des Futaies', clear: 1 },
  { key: 'borne_noiretable', kind: 'borne', at: c(79, 87), label: 'Borne de Noirétable', clear: 1 },
  { key: 'borne_bois_noirs', kind: 'borne', at: c(66, 66), label: 'Borne des Bois Noirs', clear: 1 },
  { key: 'borne_hermitage', kind: 'borne', at: c(45, 116), label: "Borne de l'Hermitage", clear: 1 },
  { key: 'borne_vollore', kind: 'borne', at: c(29, 122), label: 'Borne de Vollore', clear: 1 },
  { key: 'borne_renaudie', kind: 'borne', at: c(56, 160), label: 'Borne de la Marche', clear: 1 },
];

const VIEWPOINT_SITES: readonly SiteSpec[] = [
  { key: 'belvedere_pamole', kind: 'belvedere', at: c(37, 121), label: 'Belvédère de Pamole', clear: 1 },
  { key: 'belvedere_cervieres', kind: 'belvedere', at: c(96, 50), label: 'Belvédère de Cervières', clear: 1 },
  { key: 'belvedere_bois_noirs', kind: 'belvedere', at: c(74, 58), label: 'Belvédère des Bois Noirs', clear: 1 },
  { key: 'belvedere_arconsat', kind: 'belvedere', at: c(55, 8), label: "Belvédère d'Arconsat", clear: 1 },
];

const SHRINE_SITES: readonly SiteSpec[] = [
  { key: 'sanctuaire_hermitage', kind: 'sanctuaire', at: c(54, 112), label: "Chapelle de l'Hermitage", clear: 1 },
  { key: 'sanctuaire_peyrotine', kind: 'sanctuaire', at: c(63, 104), label: 'Croix de la Peyrotine', clear: 1 },
  { key: 'sanctuaire_vollore', kind: 'sanctuaire', at: c(26, 114), label: 'Chapelle des Carriers', clear: 1 },
  { key: 'sanctuaire_farges', kind: 'sanctuaire', at: c(93, 55), label: 'Oratoire des Farges', clear: 1 },
  { key: 'source_durolle', kind: 'source', at: c(52, 46), label: 'Source de la Durolle', clear: 1 },
  { key: 'source_sagnes', kind: 'source', at: c(44, 48), label: 'Fontaine des Sagnes', clear: 1 },
  { key: 'source_anzon', kind: 'source', at: c(87, 77), label: "Source de l'Anzon", clear: 1 },
  { key: 'source_credogne', kind: 'source', at: c(57, 164), label: 'Source de la Credogne', clear: 1 },
];

const INN_SITES: readonly SiteSpec[] = [
  { key: 'auberge_chabreloche', kind: 'auberge', at: c(41, 23), label: 'Relais de Chabreloche', clear: 1 },
  { key: 'auberge_arconsat', kind: 'auberge', at: c(50, 12), label: "Auberge d'Arconsat", clear: 1 },
  { key: 'auberge_cervieres', kind: 'auberge', at: c(93, 54), label: 'Auberge des Bannières', clear: 1 },
  { key: 'auberge_noiretable', kind: 'auberge', at: c(87, 85), label: 'Auberge du Carrefour', clear: 1 },
  { key: 'auberge_viscomtat', kind: 'auberge', at: c(27, 74), label: 'Auberge des Futaies', clear: 1 },
  { key: 'auberge_renaudie', kind: 'auberge', at: c(60, 166), label: 'Auberge de la Marche', clear: 1 },
  { key: 'auberge_tresor', kind: 'auberge', at: c(65, 52), label: 'Hostellerie du Trésor', clear: 1 },
  { key: 'auberge_vollore', kind: 'auberge', at: c(26, 118), label: 'Auberge de Vollore', clear: 1 },
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
  { key: 'scierie_arconsat', at: c(55, 14), resource: 'bois', amount: 2, label: "Scierie d'Arconsat", ring: 1 },
  { key: 'carriere_arconsat', at: c(48, 8), resource: 'granit', amount: 2, label: 'Carrière des Hauts', ring: 1 },
  { key: 'peage_arconsat', at: c(56, 19), resource: 'ecus', amount: 350, label: 'Péage des Hauts', ring: 1 },
  // Futaies de Viscomtat
  { key: 'scierie_viscomtat', at: c(21, 70), resource: 'bois', amount: 2, label: 'Scierie des Futaies', ring: 1 },
  { key: 'carriere_viscomtat', at: c(19, 79), resource: 'granit', amount: 2, label: 'Carrière de la Faye', ring: 1 },
  { key: 'peage_viscomtat', at: c(23, 66), resource: 'ecus', amount: 350, label: 'Péage des Futaies', ring: 1 },
  { key: 'essence_viscomtat', at: c(30, 78), resource: 'essence', amount: 1, label: 'Brûlerie des Futaies', ring: 2 },
  // Châtellenie de Cervières
  { key: 'scierie_cervieres', at: c(98, 48), resource: 'bois', amount: 2, label: 'Scierie de Bise', ring: 1 },
  { key: 'carriere_cervieres', at: c(100, 57), resource: 'granit', amount: 2, label: 'Carrière des Farges', ring: 1 },
  { key: 'peage_cervieres', at: c(97, 62), resource: 'ecus', amount: 350, label: 'Péage de Cervières', ring: 1 },
  { key: 'fildor_cervieres', at: c(92, 56), resource: 'filDor', amount: 1, label: 'Atelier des Grenadières', ring: 2 },
  // Pays de Noirétable
  { key: 'scierie_noiretable', at: c(85, 88), resource: 'bois', amount: 2, label: 'Scierie du Carrefour', ring: 1 },
  { key: 'carriere_noiretable', at: c(94, 80), resource: 'granit', amount: 2, label: 'Carrière du Lignon', ring: 1 },
  { key: 'peage_noiretable', at: c(87, 91), resource: 'ecus', amount: 350, label: 'Péage de Noirétable', ring: 1 },
  { key: 'fer_noiretable', at: c(92, 90), resource: 'fer', amount: 2, label: 'Minière de Noirétable', ring: 2 },
  // Marche de La Renaudie
  { key: 'scierie_renaudie', at: c(55, 161), resource: 'bois', amount: 2, label: 'Scierie de la Marche', ring: 1 },
  { key: 'carriere_renaudie', at: c(64, 171), resource: 'granit', amount: 2, label: 'Carrière de la Renaudie', ring: 1 },
  { key: 'peage_renaudie', at: c(53, 172), resource: 'ecus', amount: 350, label: 'Péage de la Marche', ring: 1 },
  { key: 'fer_renaudie', at: c(64, 163), resource: 'fer', amount: 2, label: 'Minière de la Credogne', ring: 1 },
  /* La coupe s'est éloignée de la scierie de la Marche : sept cases entre deux
     scieries, c'est la grappe que le propriétaire ne veut pas voir, et c'était
     de surcroît la cinquième mine d'un départ qui n'en méritait pas plus que
     les autres. */
  { key: 'bois_renaudie', at: c(42, 150), resource: 'bois', amount: 2, label: 'Coupe des moulins', ring: 2 },
  // Vallée de la Durolle et centre
  { key: 'bois_durolle', at: c(31, 22), resource: 'bois', amount: 2, label: 'Coupe de la Durolle', ring: 2 },
  { key: 'peage_chabreloche', at: c(38, 19), resource: 'ecus', amount: 350, label: 'Péage de Chabreloche', ring: 2 },
  { key: 'sel_lac', at: c(52, 43), resource: 'sel', amount: 2, label: 'Saline du Lac', ring: 2 },
  { key: 'sel_tresor', at: c(67, 55), resource: 'sel', amount: 2, label: 'Grenier à sel du Trésor', ring: 3 },
  { key: 'fer_bois_noirs', at: c(72, 64), resource: 'fer', amount: 2, label: 'Minière des Bois Noirs', ring: 3 },
  { key: 'essence_bois_noirs', at: c(64, 73), resource: 'essence', amount: 1, label: 'Brûlerie des Bois Noirs', ring: 3 },
  { key: 'fildor_bise', at: c(102, 51), resource: 'filDor', amount: 1, label: 'Filature de Bise', ring: 2 },
  /* Douze cases exactement de la carrière de Vollore, c'est-à-dire l'écart voulu
     au ras : il suffisait que la case d'ancrage soit prise pour que le décalage
     d'une case fasse tomber la paire sous l'écart. Treize, et la marge existe. */
  { key: 'granit_pamole', at: c(35, 127), resource: 'granit', amount: 2, label: 'Carrière de Pamole', ring: 2 },
  { key: 'essence_hermitage', at: c(52, 108), resource: 'essence', amount: 1, label: "Brûlerie de l'Hermitage", ring: 2 },
  { key: 'fer_peyrotine', at: c(66, 103), resource: 'fer', amount: 2, label: 'Minière de la Peyrotine', ring: 2 },
  { key: 'granit_vollore', at: c(22, 114), resource: 'granit', amount: 2, label: 'Carrière de Vollore', ring: 1 },
  { key: 'bois_vollore', at: c(28, 111), resource: 'bois', amount: 2, label: 'Coupe de Vollore', ring: 1 },
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
    at: c(67, 51),
    artifact: 'clef_de_la_maison_du_tresor',
    rarity: 'relique',
    label: 'la Clef de la Maison du Trésor',
  },
];

/** Sites du Chemin du Trésor et bornes-témoins, purement narratifs. */
const QUEST_SITES: readonly SiteSpec[] = [
  { key: 'quete_chabreloche', kind: 'quete', at: c(39, 24), label: 'Doléance de Chabreloche', clear: 1 },
  { key: 'quete_lac', kind: 'quete', at: c(50, 41), label: 'Doléance du Lac', clear: 1 },
  { key: 'quete_vollore', kind: 'quete', at: c(23, 119), label: 'Doléance de Vollore', clear: 1 },
  { key: 'quete_hermitage', kind: 'quete', at: c(56, 112), label: "Doléance de l'Hermitage", clear: 1 },
  { key: 'quete_cervieres', kind: 'quete', at: c(95, 55), label: 'Doléance de Cervières', clear: 1 },
  { key: 'quete_noiretable', kind: 'quete', at: c(90, 86), label: 'Doléance de Noirétable', clear: 1 },
  { key: 'quete_viscomtat', kind: 'quete', at: c(24, 75), label: 'Doléance de Viscomtat', clear: 1 },
  { key: 'quete_renaudie', kind: 'quete', at: c(57, 169), label: 'Doléance de la Marche', clear: 1 },
  { key: 'quete_arconsat', kind: 'quete', at: c(53, 13), label: "Doléance d'Arconsat", clear: 1 },
  { key: 'quete_tresor', kind: 'quete', at: c(62, 48), label: 'Le Grand Livre', clear: 1 },
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
 * qu'à répartir les effectifs entre anneaux de difficulté. Exportée pour que
 * les tests mesurent la force des gardes avec LE barème du semeur, jamais une
 * copie.
 */
export const TIER_POWER: readonly number[] = [0, 10, 32, 85, 190, 420, 900, 2100];

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

/**
 * Poids de garde : ce que le lieu VAUT à qui devra le prendre.
 *
 * Ce n'est pas `objectValue`, et la différence est la raison d'être de cette
 * fonction. `objectValue` mesure un pillage — ce qu'on emporte le jour où l'on
 * visite — et c'est la bonne grandeur pour équilibrer les départs. Un gisement,
 * lui, ne s'emporte pas : on le GARDE, et il paie tous les jours. Mesuré à huit
 * jours de production, une scierie vaut quatre-vingt-seize écus ; sa garde
 * médiane en vaut deux mille. Doser la garde sur la valeur de pillage
 * reviendrait donc à laisser les scieries sans défense et à ne garder que les
 * coffres — l'inverse exact de HMM3, où l'on se bat pour les mines et où les
 * coffres se ramassent librement.
 *
 * Le poids retient donc un mois de production pour un gisement, la valeur de
 * pillage pour un butin, et un forfait d'objectif pour ce qui décide la partie.
 */
const JOURS_DE_GARDE = 30;

/** Poids à partir duquel une garde occupe le haut de sa fourchette d'anneau. */
const POIDS_PLEIN = 3000;

function poidsDeGarde(kind: string, data: Record<string, unknown>): number {
  switch (kind) {
    case 'mine': {
      const resource = data.resource as ResourceKey | undefined;
      const amount = (data.amount as number | undefined) ?? 0;
      if (!resource) return 400;
      return amount * (RESOURCE_VALUE[resource] ?? 1) * JOURS_DE_GARDE;
    }
    case 'ville':
    case 'village':
      /* Une ville capturable paie tous les jours et bâtit des troupes : c'est
         le plus gros lot de la carte après les objectifs de victoire. */
      return 5000;
    case 'maison_tresor':
      return 6000;
    case 'sceau':
      return 3000;
    case 'banque': {
      const ecus = (data.ecus as number | undefined) ?? 0;
      const resource = data.resource as ResourceKey | undefined;
      const amount = (data.amount as number | undefined) ?? 0;
      /* Un repaire se repeuple : on le pillera plus d'une fois. */
      const pillage = ecus + (resource ? amount * (RESOURCE_VALUE[resource] ?? 1) : 0);
      return Math.trunc((pillage * 15) / 10);
    }
    case 'artefact': {
      const rarity = (data.rarity as string | undefined) ?? 'rare';
      return VALEUR_ARTEFACT[rarity] ?? 900;
    }
    case 'demeure': {
      const creature = (data.creature as string | undefined) ?? '';
      const tier = Number(creature.slice(-1));
      /* Une demeure recrute chaque semaine, mais on paie les troupes : le lot
         est moindre qu'un gisement de même rang. Quatre cent cinquante par rang
         place un rang 3 au milieu de sa fourchette et un rang 5 aux trois
         quarts, là où sept cents les collait tous au sommet. */
      return Number.isFinite(tier) && tier > 0 ? tier * 450 : 700;
    }
    case 'ressource': {
      const resource = data.resource as ResourceKey | undefined;
      const amount = (data.amount as number | undefined) ?? 0;
      return resource ? amount * (RESOURCE_VALUE[resource] ?? 1) : 0;
    }
    case 'coffre': {
      const ecus = (data.ecus as number | undefined) ?? 0;
      return ecus;
    }
    /*
     * Un poste de garde ne garde rien d'autre que le passage : l'anneau seul le
     * dose, donc le MILIEU de sa fourchette — et c'est une correction mesurée.
     *
     * Le poids plein l'avait mis en haut de fourchette, et les postes sont la
     * famille la plus nombreuse de la carte : cinquante-six péages passés d'un
     * coup du milieu au sommet de leur anneau. Le duel de vingt parties l'a dit
     * sans ambiguïté — l'expert est tombé de 15/20 à 10/20 et les parties
     * réglées par conquête de 9 à 2 : la carte entière était devenue trop dure
     * pour qu'une armée traverse, et le plafond de tours décidait à la place des
     * joueurs. Doser la garde par ce qu'elle garde ne veut pas dire durcir tout
     * ce qui garde quelque chose.
     */
    case 'garde':
      return Math.trunc(POIDS_PLEIN / 2);
    default:
      return 600;
  }
}

/**
 * La garde d'un lieu : l'anneau donne la fourchette, le poids donne la place
 * dans la fourchette.
 *
 * C'est la traduction des deux axes que le propriétaire demande dans la même
 * phrase : « que la difficulté des ennemis sur la carte soit bien dosée en
 * fonction des évènements qu'ils gardent et du niveau du joueur ou proximité
 * avec le point de départ du héros ». L'anneau EST la proximité du départ, et
 * la fourchette d'anneau est calée sur la courbe de puissance d'un héros —
 * quatre cents à mille deux cents la première semaine, quatre à neuf mille au
 * troisième anneau. Le poids est ce qu'on garde. Avant, seul l'anneau comptait :
 * dans le même anneau, une scierie et un repaire de sept mille écus recevaient
 * la même garde tirée au sort, et la moitié de la phrase n'était pas honorée.
 *
 * Le tirage reste présent mais réduit — un huitième de la fourchette — pour que
 * deux lieux de même poids ne portent pas exactement la même garde.
 */
function guardFor(
  rng: RngState,
  ring: 1 | 2 | 3 | 4,
  stacks: number,
  poids: number = POIDS_PLEIN,
): ArmyStack[] {
  const table = RING_TABLE[ring];
  const etendue = table.powerMax - table.powerMin;
  const part = Math.min(10000, Math.max(0, Math.trunc((poids * 10000) / POIDS_PLEIN)));
  const jeu = Math.trunc(etendue / 8);
  const target = Math.min(
    table.powerMax,
    Math.max(
      table.powerMin,
      table.powerMin + Math.trunc((etendue * part) / 10000) + nextInt(rng, -jeu, jeu),
    ),
  );
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

/**
 * Écart minimal entre deux lieux qui se ressemblent, par clef d'espacement.
 *
 * **Pourquoi cette table existe.** Exigence du propriétaire, textuellement :
 * « je ne veux pas avoir 2 fois le même asset trop proches les uns des autres »,
 * et « les mines ou items de ressources doivent être répartis et distribués de
 * manière intelligente et réfléchie ». Mesuré avant correction, sur la graine de
 * démonstration : **cent trente paires de tas de ressources** sous l'écart, dont
 * deux collés case contre case ; **dix-neuf paires de gisements**, dont deux à
 * trois cases ; deux coffres adjacents ; **deux artefacts adjacents**.
 *
 * La cause était simple et générale : `poserEspaces` n'espaçait qu'à l'intérieur
 * d'un même appel. Chaque famille se répartissait proprement contre elle-même,
 * et ignorait tout ce qui avait été posé avant — les gisements nommés, les
 * artefacts fixes, les tas semés à l'étape précédente.
 *
 * **La clef n'est pas la nature seule**, et c'est le point qui demande du
 * jugement. Une scierie et un péage sont deux `mine`, mais HMM3 met bel et bien
 * deux ou trois gisements au pas de la porte d'une capitale : c'est ce qui
 * nourrit la première semaine. Ce que le propriétaire ne veut pas voir, c'est
 * deux fois LE MÊME lieu — deux icônes identiques côte à côte. On espace donc
 * largement ce qui se ressemble (même nature, même ressource) et modérément ce
 * qui se distingue à l'œil (même nature, ressource différente).
 */
export const ECART_MINIMAL: Readonly<Record<string, number>> = {
  /* Les gisements : douze cases entre deux mines de la MÊME ressource — on ne
     veut pas deux scieries voisines —, cinq entre deux gisements différents,
     ce qui laisse le trio de départ de HMM3 en place. */
  'mine|bois': 12,
  'mine|granit': 12,
  'mine|fer': 12,
  'mine|essence': 14,
  'mine|sel': 14,
  /* `filDor` et non `fil_or` : c'est la clef canonique de `RESOURCE_KEYS`, et
     l'orthographe fautive faisait tomber le fil d'or sur le repli générique —
     cinq cases entre deux filatures au lieu de quatorze, sans que rien ne le
     dise. Un test exige désormais la clef exacte pour chaque ressource. */
  'mine|filDor': 14,
  'mine|ecus': 12,
  mine: 5,
  /* Les tas : cinq cases entre deux tas de la même ressource, deux entre deux
     tas différents. Un tas est un consommable, on veut en croiser souvent. */
  'ressource|bois': 5,
  'ressource|granit': 5,
  'ressource|fer': 5,
  'ressource|essence': 6,
  'ressource|sel': 6,
  'ressource|filDor': 6,
  'ressource|ecus': 5,
  ressource: 2,
  ville: 20,
  village: 16,
  sceau: 24,
  maison_tresor: 30,
  artefact: 10,
  demeure: 8,
  banque: 12,
  monolithe: 10,
  ecole: 12,
  temple: 12,
  obelisque: 10,
  moulin: 12,
  fontaine: 12,
  belvedere: 14,
  sanctuaire: 12,
  source: 12,
  marche_noir: 16,
  cartographe: 16,
  auberge: 10,
  caravane: 12,
  quete: 12,
  borne: 10,
  coffre: 5,
  garde: 4,
};

/**
 * La clef d'espacement d'un lieu : ce qui décide s'il « ressemble » à un autre.
 *
 * Pour un gisement et un tas, la ressource fait partie de l'identité visuelle —
 * une scierie et une carrière ne portent pas la même icône. Pour tout le reste,
 * la nature suffit.
 */
export function cleEspacement(kind: string, data: Record<string, unknown>): string {
  if (kind === 'mine' || kind === 'ressource') {
    const r = data.resource;
    if (typeof r === 'string') return `${kind}|${r}`;
  }
  return kind;
}

/** L'écart voulu pour une clef, avec le repli sur la nature seule. */
export function ecartVoulu(kind: string, data: Record<string, unknown>): number {
  const cle = cleEspacement(kind, data);
  return ECART_MINIMAL[cle] ?? ECART_MINIMAL[kind] ?? 6;
}

interface Builder {
  ctx: ObjectContext;
  objects: MapObject[];
  occupied: Uint8Array;
  next: number;
  /**
   * Où se trouve déjà chaque clef d'espacement.
   *
   * C'est ce que `poserEspaces` regardait avant, mais seulement pour les objets
   * de son propre appel : la table est ici pour que le semis entier partage une
   * seule mémoire, gisements nommés compris.
   */
  parCle: Map<string, MapCoord[]>;
  /**
   * Le répartiteur de richesse : à qui appartient chaque case, et combien de
   * butin chaque départ a déjà reçu.
   *
   * Les familles de fort butin — repaires, gisements supplémentaires, artefacts,
   * coffres, demeures — le consultent avant de choisir leur case, et le
   * créditent après. C'est un accumulateur COMMUN à toutes les familles : c'est
   * ce qui permet à un artefact de compenser un repaire, et non seulement à un
   * artefact de compenser un artefact.
   */
  repartiteur: {
    proprio: Int8Array;
    attribue: number[];
    /** Coût de marche depuis chaque départ, dans l'ordre de `START_KEYS`. */
    champs: Int32Array[];
  };
}

/** La case appartient-elle à l'arrière-pays du départ visé ? */
function chez(b: Builder, cible: number, col: number, row: number): boolean {
  return b.repartiteur.proprio[row * COLS + col] === cible;
}

/**
 * Crédite le départ propriétaire de la case, à hauteur de ce que ce butin lui
 * rapporte VRAIMENT.
 *
 * Créditer le poids brut ne marche pas, et c'est mesuré : à répartir le poids
 * brut par arrière-pays, l'écart économique est remonté de 20,9 % à 35,3 %. La
 * raison est que la richesse ne se compte pas en butin posé mais en butin
 * ATTEIGNABLE : `accessibleValue` escompte chaque lieu par le coût de marche
 * qui reste dans le budget une fois la case atteinte. Un arrière-pays compact
 * et facile — Cervières — encaisse presque la valeur faciale ; un arrière-pays
 * étiré en forêt et en pente — Viscomtat — n'en encaisse qu'une fraction. Le
 * répartiteur doit donc compter dans la même monnaie que la mesure qu'il sert,
 * sinon il équilibre une grandeur que personne ne joue.
 */
function crediter(
  b: Builder,
  at: MapCoord,
  poids: number,
  garde?: readonly ArmyStack[],
): void {
  const i = at.row * COLS + at.col;
  const qui = b.repartiteur.proprio[i];
  if (qui < 0) return;
  const cout = b.repartiteur.champs[qui][i];
  if (cout >= BALANCE_BUDGET) return;
  const portee = Math.trunc(((BALANCE_BUDGET - cout) * 10000) / BALANCE_BUDGET);
  /* Le même escompte de risque que `accessibleValue` : un repaire tenu par
     quinze mille de puissance ne vaut qu'un cinquième de son butin tant qu'on
     ne peut pas le prendre. Sans ce facteur, le répartiteur croit enrichir un
     départ en lui posant un trésor qu'il ne peut pas ouvrir. */
  const risque = Math.max(2000, 10000 - Math.trunc(guardPower(garde) / 2));
  b.repartiteur.attribue[qui] += Math.trunc((poids * portee * risque) / 100000000);
}

/**
 * L'écart en dessous duquel on ne descend JAMAIS, quel que soit le relâchement.
 *
 * C'est la traduction littérale du reproche : « je ne veux pas avoir 2 fois le
 * même asset trop proches les uns des autres ». Trois cases, c'est-à-dire deux
 * cases de terre entre les deux lieux : à cette distance deux tas de sel ne se
 * touchent plus et ne se lisent plus comme un seul amas. Le relâchement peut
 * ramener un écart de douze à quatre s'il faut atteindre le compte ; il ne
 * ramènera jamais un écart à zéro, et c'est ce plancher qui rend l'exigence du
 * propriétaire vérifiable au lieu d'être une préférence.
 */
export const PLANCHER_ECART = 3;

/**
 * L'écart exigé après relâchement — la règle, isolée pour être éprouvée.
 *
 * Elle vivait dans le corps de `assezLoin`, où l'on ne pouvait pas la mettre en
 * défaut : en supprimant le plancher, la carte restait propre sur sept graines,
 * simplement parce qu'aucun semeur ne descend aujourd'hui jusqu'au dernier
 * palier. Le plancher est donc un filet, pas une pièce portante — et un filet
 * qu'on ne peut pas éprouver sur la carte se vérifie sur la règle elle-même.
 */
export function ecartRelache(
  kind: string,
  data: Record<string, unknown>,
  facteurBp: number,
): number {
  const brut = ecartVoulu(kind, data);
  return Math.max(Math.min(brut, PLANCHER_ECART), Math.trunc((brut * facteurBp) / 10000));
}

/**
 * Y a-t-il déjà, trop près, un lieu qui ressemble à celui qu'on veut poser ?
 *
 * `facteur` en points de base permet de relâcher l'exigence quand un semeur
 * n'arrive pas à son compte : mieux vaut deux coffres à quatre cases que
 * cinquante coffres au lieu de cinquante-huit. La densité est aussi une
 * exigence du propriétaire — « il faut suffisamment de mines de ressources pour
 * pouvoir jouer ». Le relâchement s'arrête au plancher ci-dessus.
 */
function assezLoin(
  b: Builder,
  kind: string,
  data: Record<string, unknown>,
  col: number,
  row: number,
  facteurBp = 10000,
): boolean {
  const cle = cleEspacement(kind, data);
  const deja = b.parCle.get(cle);
  if (!deja || deja.length === 0) return true;
  const voulu = ecartRelache(kind, data, facteurBp);
  if (voulu <= 0) return true;
  for (const t of deja) {
    if (Math.max(Math.abs(t.col - col), Math.abs(t.row - row)) < voulu) return false;
  }
  return true;
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
  /*
   * Jamais sur un pont. Le drapeau de franchissement dit vrai — c'est bien là
   * qu'on passe — mais un tablier n'est pas un terrain : le poser sous un lieu
   * met un objet au milieu de l'eau, et l'occuper peut couper l'unique
   * franchissement d'une rivière. Mesuré après le changement d'échelle, quand
   * les cours d'eau reprojetés ont fait glisser un pont sous la Doléance du
   * Lac : le lieu s'est retrouvé sur une case d'eau.
   */
  if ((b.ctx.flags[i] & CELL_BRIDGE) !== 0) return false;
  return passable(b.ctx, i);
}

/**
 * Dégagement exigé autour d'une capitale, en cases.
 *
 * Une bannière ne doit pas trouver un gardien sur son pas de porte au premier
 * jour : les abords immédiats se parcourent sans combattre. Le semis le
 * respectait par la seule vertu des distances, et cette vertu s'est perdue
 * quand la carte a rétréci — un poste s'est retrouvé à quatre cases
 * d'Arconsat. La règle est donc écrite plutôt que supposée.
 *
 * La règle ne vaut que pour le semis tiré au sort. Les lieux de la géographie
 * — les Sceaux des Marches, les cols, la scierie et la carrière que chaque
 * départ doit avoir sous la main — sont posés avec `fixe`, et gardés de plein
 * droit : ils sont voisins par dessein, et c'est précisément ce voisinage qui
 * fait la première semaine d'une partie de HMM3.
 */
const DEGAGEMENT_CAPITALE = 5;

function tropPresDUneCapitale(at: MapCoord): boolean {
  for (const key of START_KEYS) {
    const sp = START_POSITIONS[key].at;
    const d = Math.max(Math.abs(at.col - sp.col), Math.abs(at.row - sp.row));
    if (d <= DEGAGEMENT_CAPITALE) return true;
  }
  return false;
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
  options: { footprint?: MapCoord[]; guard?: ArmyStack[]; fixe?: boolean } = {},
): MapObject | null {
  const brut = options.footprint ?? [{ col: at.col, row: at.row }];
  for (const f of brut) {
    if (f.col < 0 || f.row < 0 || f.col >= COLS || f.row >= ROWS) return null;
    if (b.occupied[idx(f.col, f.row)] === 1) return null;
  }
  /*
   * Une emprise s'arrête à la berge. Les empreintes bâties sont des formes
   * fixes posées sur un ancrage ; quand un cours d'eau reprojeté passe sous
   * l'une d'elles, la case d'eau se retrouvait bâtie — et le comblement qui
   * suivait effaçait la rivière ou, pire, le pont. On retire donc les cases
   * d'eau de l'emprise plutôt que l'eau de la carte. L'entrée est conservée
   * quoi qu'il arrive : c'est par elle qu'on visite le lieu, et elle est
   * rendue franchissable plus bas.
   */
  const entree = idx(at.col, at.row);
  const footprint = brut.filter((f) => {
    const i = idx(f.col, f.row);
    return i === entree || TERRAINS[b.ctx.terrain[i]] !== 'eau';
  });
  if (footprint.length === 0) return null;
  if (!options.fixe && options.guard && options.guard.length > 0 && tropPresDUneCapitale(at)) {
    return null;
  }
  const obj: MapObject = {
    uid: `O_${String(b.next++).padStart(4, '0')}`,
    kind,
    at: { col: at.col, row: at.row },
    footprint: footprint.map((f) => ({ col: f.col, row: f.row })),
    entrance: { col: at.col, row: at.row },
    owner: null,
    /*
     * `fixe` reste inscrit dans la donnée du lieu, et ce n'est pas un détail de
     * confort : la mesure de répartition doit pouvoir séparer ce que le semeur
     * a le pouvoir de déplacer de ce que la géographie impose. Deux chapelles
     * écrites à la main à neuf cases l'une de l'autre sont un choix ; deux tas
     * de sel tirés au sort à deux cases sont un défaut. Sans la marque, les
     * deux se ressemblent dans le tableau, et l'on finit par baisser la cible
     * pour faire disparaître le reproche au lieu de corriger l'ouvrage.
     */
    data: options.fixe ? { ...data, fixe: true } : data,
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
  /* La mémoire d'espacement : c'est elle qui empêche le semeur suivant de poser
     le même lieu à côté de celui-ci. */
  const cle = cleEspacement(kind, data);
  const deja = b.parCle.get(cle);
  if (deja) deja.push({ col: at.col, row: at.row });
  else b.parCle.set(cle, [{ col: at.col, row: at.row }]);
  return obj;
}

/**
 * Deux flancs bloquants pour un poste de garde : des cases libres et
 * praticables voisines de l'entrée, hors voie — on ne mure pas la route
 * elle-même, on l'encadre — et hors eau. Déterministe : balayage d'ordre fixe.
 */
function flancsDe(b: Builder, ctx: ObjectContext, col: number, row: number): MapCoord[] {
  const flancs: MapCoord[] = [];
  const AUTOUR = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    [-1, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
  ] as const;
  for (const [dc, dr] of AUTOUR) {
    if (flancs.length >= 2) break;
    const c = col + dc;
    const r = row + dr;
    if (c < 1 || r < 1 || c >= COLS - 1 || r >= ROWS - 1) continue;
    const j = r * COLS + c;
    if (b.occupied[j] === 1) continue;
    if (!passable(ctx, j)) continue;
    if ((ctx.flags[j] & CELL_ROAD) !== 0) continue;
    if (TERRAINS[ctx.terrain[j]] === 'eau') continue;
    flancs.push({ col: c, row: r });
  }
  return flancs;
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

/**
 * À quel départ chaque case appartient : l'arrière-pays, par plus court chemin
 * à vol d'oiseau.
 *
 * On mesure ici la seule chose qui manquait pour répartir la RICHESSE : l'anneau
 * dit à quelle distance d'un départ on se trouve, jamais duquel. Les familles de
 * fort butin se posaient donc sur les meilleures cases disponibles, sans
 * personne pour remarquer qu'elles s'accumulaient autour de deux capitales.
 * Mesuré : Cervières atteignait 48 897 écus dans son horizon d'équilibrage
 * contre 24 159 à Viscomtat — cinquante pour cent d'écart, quand le document
 * maître en tolère trois. L'oubli était invisible parce qu'aucun outil ne
 * l'imprimait, et parce que `objectValue` rendait zéro pour les coffres et les
 * repaires, c'est-à-dire pour l'essentiel du butin.
 *
 * La distance de Tchebychev suffit : on ne cherche pas à savoir qui arrivera le
 * premier — le champ de coût de `balanceStarts` le fait, et mieux — mais à
 * répartir un lot entre cinq voisinages.
 */
function startOwnerField(): Int8Array {
  const field = new Int8Array(CELLS).fill(-1);
  const starts = START_KEYS.map((k) => START_POSITIONS[k].at);
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      let best = 0x7fffffff;
      let qui = -1;
      for (let k = 0; k < starts.length; k++) {
        const d = Math.max(Math.abs(starts[k].col - col), Math.abs(starts[k].row - row));
        if (d < best) {
          best = d;
          qui = k;
        }
      }
      field[row * COLS + col] = qui;
    }
  }
  return field;
}

/**
 * Le départ le plus pauvre en butin déjà attribué, pour lui donner le prochain
 * lot. À égalité, le plus petit indice — le semis reste déterministe.
 */
function departLePlusPauvre(attribue: readonly number[]): number {
  let qui = 0;
  for (let k = 1; k < attribue.length; k++) {
    if (attribue[k] < attribue[qui]) qui = k;
  }
  return qui;
}

function ringAt(startDist: Uint16Array, col: number, row: number): 1 | 2 | 3 {
  const mt = anchorCell('maison_tresor');
  const dTresor = Math.max(Math.abs(mt.col - col), Math.abs(mt.row - row));
  const d = startDist[row * COLS + col];
  if (d <= 11) return 1;
  if (dTresor <= 15) return 3;
  return d <= 26 ? 2 : 3;
}

/* ── Champ de coût (équilibrage des départs) ────────────────────────────── */

/** Budget de marche d'une semaine d'exploration, en points. */
export const WEEK_BUDGET = 12000;

/**
 * Horizon d'équilibrage des départs, en points de marche.
 *
 * Ce n'est pas une semaine, et il a fallu le mesurer pour s'en apercevoir.
 * L'équilibrage compare ce que chaque départ a **pour lui** ; il lui faut donc
 * un horizon où les cinq voisinages se partagent la carte au lieu de se
 * recouvrir. À 12 000 points sur une carte à la taille d'une XL de HMM3,
 * chaque départ atteint de 69 % à 99 % de la surface praticable et **100 %**
 * des cases atteintes le sont par au moins deux départs : les cinq sommes
 * comparées sont la même somme globale, aucun tas posé pour le plus pauvre ne
 * creuse l'écart, et les dix-huit passes vidaient leur quota — 540 tas de
 * compensation sur 1 307 objets.
 *
 * Mesure des recouvrements, cinq départs, graine de démonstration :
 *
 *     12 000 pts (7 j)  69–99 % de la carte chacun   recouvrement 100 %
 *      9 000 pts (5 j)  50–84 %                      recouvrement  95 %
 *      6 000 pts (3 j)  30–41 %                      recouvrement  56 %
 *      4 500 pts (2 j½) 19–25 %                      recouvrement  27 %
 *      3 000 pts (2 j)  10–12 %                      recouvrement   7 %
 *
 * 4 500 est le point où les cinq voisinages pavent la carte : cinq fois un
 * cinquième, un quart de recouvrement aux frontières. C'est l'arrière-pays
 * propre d'un départ, et c'est cela qu'on équilibre.
 */
export const BALANCE_BUDGET = 4500;

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

/** Horizon d'un gisement : combien de jours de production on met dans sa valeur. */
const JOURS_DE_GISEMENT = 8;

/** Ce que vaut un point de savoir dans un coffre, en écus. */
const VALEUR_DU_SAVOIR = 250;

/** Valeur d'un artefact selon sa rareté, en écus. */
const VALEUR_ARTEFACT: Readonly<Record<string, number>> = {
  commun: 500,
  rare: 900,
  majeur: 1600,
  relique: 2600,
};

/**
 * Valeur économique brute d'un objet, en écus.
 *
 * **Ce qui manquait, et ce que ça cassait.** La fonction rendait ZÉRO pour les
 * coffres, les repaires, les demeures franches, la Maison du Trésor, les
 * sceaux, les moulins, les écoles, les temples, les monolithes, les obélisques,
 * le marché noir et le cartographe — c'est-à-dire pour la moitié du butin de la
 * carte. Deux conséquences mesurées, et aucune n'était visible dans le code :
 *
 *   - le tableau de bord rangeait un repaire de deux mille écus dans la tranche
 *     « valeur < 200 », si bien que la question du propriétaire — « les assets
 *     les plus importants doivent être gardés par des gardes assez forts » — ne
 *     pouvait même pas se poser : on ne savait pas ce qui était important ;
 *   - `accessibleValue` sert à ÉQUILIBRER les cinq départs. Un départ entouré de
 *     coffres et de repaires était donc jugé pauvre et recevait de la
 *     compensation en plus. Le taux de victoire par capitale mesuré sur
 *     vingt-cinq parties à cinq allait de 40 % à 4 % ; c'est l'une des pistes,
 *     et la seule qui soit un défaut de calcul plutôt qu'un réglage.
 *
 * Les valeurs ci-dessous sont des ordres de grandeur en écus, cohérents entre
 * eux : ce qui compte n'est pas leur exactitude absolue mais leur RAPPORT, car
 * c'est le rapport qui décide de la garde et de la compensation.
 */
export function objectValue(obj: MapObject): number {
  return valeurBrute(obj.kind, obj.data);
}

/**
 * La même valeur, mais AVANT que l'objet existe.
 *
 * Le semis doit connaître la valeur d'un lieu pour décider à quel arrière-pays
 * le donner, et il la connaît avant de le poser. Deux fonctions diraient deux
 * choses — c'est l'erreur qu'on a déjà payée avec la table d'espacement recopiée
 * dans le tableau de bord — donc `objectValue` délègue ici, et il n'y a qu'un
 * seul barème.
 */
export function valeurBrute(kind: string, data: Record<string, unknown>): number {
  switch (kind) {
    case 'mine': {
      const resource = data.resource as ResourceKey | undefined;
      const amount = (data.amount as number | undefined) ?? 0;
      if (!resource) return 0;
      return amount * (RESOURCE_VALUE[resource] ?? 1) * JOURS_DE_GISEMENT;
    }
    case 'ressource': {
      const resource = data.resource as ResourceKey | undefined;
      const amount = (data.amount as number | undefined) ?? 0;
      if (!resource) return 0;
      return amount * (RESOURCE_VALUE[resource] ?? 1);
    }
    case 'coffre': {
      const ecus = (data.ecus as number | undefined) ?? 0;
      const savoir = (data.savoir as number | undefined) ?? 0;
      return ecus + savoir * VALEUR_DU_SAVOIR;
    }
    case 'banque': {
      /* Un repaire rend des écus ET une ressource, et il se repeuple : la
         valeur retenue est celle d'un pillage, pas celle du repaire à vie. */
      const ecus = (data.ecus as number | undefined) ?? 0;
      const resource = data.resource as ResourceKey | undefined;
      const amount = (data.amount as number | undefined) ?? 0;
      return ecus + (resource ? amount * (RESOURCE_VALUE[resource] ?? 1) : 0);
    }
    case 'demeure': {
      /* Une demeure franche vaut ce qu'elle recrute : le rang décide. La
         créature est nommée `<faction>_t<rang>`. */
      const creature = (data.creature as string | undefined) ?? '';
      const tier = Number(creature.slice(-1));
      return Number.isFinite(tier) && tier > 0 ? 250 + tier * 250 : 400;
    }
    case 'artefact': {
      const rarity = (data.rarity as string | undefined) ?? 'rare';
      return VALEUR_ARTEFACT[rarity] ?? 900;
    }
    /* Les objectifs de victoire : leur valeur n'est pas économique, mais elle
       doit primer sur tout le reste quand on décide d'une garde. */
    case 'maison_tresor':
      return 6000;
    case 'sceau':
      return 3000;
    case 'ville':
      return 5000;
    case 'village':
      return 1400;
    /* Les lieux de service. Ils ne se gardent pas dans HMM3 — on n'assiège pas
       un moulin — mais ils valent quelque chose pour l'équilibre des départs,
       et c'est ce qui manquait. */
    case 'ecole':
      return 800;
    case 'cartographe':
      return 500;
    case 'caravane':
      return 550;
    case 'marche_noir':
      return 400;
    case 'monolithe':
      return 400;
    case 'moulin':
      return 350;
    case 'temple':
      return 300;
    case 'obelisque':
      return 300;
    case 'auberge':
      return 250;
    case 'fontaine':
      return 250;
    case 'sanctuaire':
    case 'source':
      return 200;
    case 'quete':
      return 200;
    case 'belvedere':
      return 180;
    case 'borne':
      return 150;
    /* Un poste de garde et un obstacle ne valent rien : l'un EST la garde,
       l'autre est du décor infranchissable. */
    case 'garde':
    case 'obstacle':
      return 0;
    default:
      return 0;
  }
}

/**
 * Valeur accessible depuis un départ : somme des valeurs, escomptées par la
 * distance restante dans le budget et par la puissance de la garde.
 *
 * `budget` doit être celui qui a servi à construire `field` — l'escompte est
 * la part de budget qui reste une fois la case atteinte.
 */
export function accessibleValue(
  objects: readonly MapObject[],
  field: Int32Array,
  budget: number = WEEK_BUDGET,
): number {
  let total = 0;
  for (const obj of objects) {
    const raw = objectValue(obj);
    if (raw <= 0) continue;
    const cost = field[idx(obj.entrance.col, obj.entrance.row)];
    if (cost >= budget) continue;
    const reach = Math.trunc(((budget - cost) * 10000) / budget);
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
    parCle: new Map(),
    repartiteur: {
      proprio: startOwnerField(),
      attribue: START_KEYS.map(() => 0),
      champs: START_KEYS.map((k) =>
        costFieldFrom(ctx, START_POSITIONS[k].at, BALANCE_BUDGET),
      ),
    },
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
    }, { footprint: townFootprint(sp.at, ctx) });
  }

  /* 2 — Centres neutres capturables. */
  for (const n of NEUTRAL_CENTERS) {
    const at = anchorCell(n.anchor);
    place(
      b,
      'village',
      at,
      { townUid: n.townUid, name: n.name, capital: false, region: n.region, vocation: n.vocation },
      {
        footprint: townFootprint(at, ctx),
        guard: guardFor(rng, 2, 3, poidsDeGarde('village', {})),
        fixe: true,
      },
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
    { footprint: townFootprint(mt, ctx), guard: treasureGuard(rng), fixe: true },
  );

  /* 4 — Les cinq Sceaux des Marches. */
  for (const s of SEAL_SITES) {
    const at = snap(b, s.at, 4) ?? s.at;
    place(b, 'sceau', at, { seal: s.seal, name: s.label, lore: s.lore }, {
      guard: guardFor(rng, 3, 4, poidsDeGarde('sceau', {})),
      fixe: true,
    });
  }

  /* 5 — Bornes, belvédères, sanctuaires, sources, auberges, doléances. */
  /* Tous ces lieux sont ÉCRITS : la marque `fixe` ne change rien à leur pose —
     ils n'ont pas de garde, donc la règle de dégagement des capitales ne les
     concerne pas — mais elle dit à la mesure qu'ils ne sont pas déplaçables. */
  for (const s of BORNE_SITES) {
    const at = snap(b, s.at, 4);
    if (at) place(b, 'borne', at, { name: s.label, network: 'marches' }, { fixe: true });
  }
  for (const s of VIEWPOINT_SITES) {
    const at = snap(b, s.at, 4);
    if (at) place(b, 'belvedere', at, { name: s.label, radius: 22 }, { fixe: true });
  }
  for (const s of SHRINE_SITES) {
    const at = snap(b, s.at, 4);
    if (at) place(b, s.kind, at, { name: s.label }, { fixe: true });
  }
  for (const s of INN_SITES) {
    const at = snap(b, s.at, 4);
    if (at) place(b, 'auberge', at, { name: s.label }, { fixe: true });
  }
  for (const s of QUEST_SITES) {
    const at = snap(b, s.at, 4);
    if (at) {
      place(
        b,
        'quete',
        at,
        {
          name: s.label,
          reward: pickWeighted(rng, PILE_TABLE),
          amount: 300 + nextInt(rng, 0, 6) * 100,
        },
        { fixe: true },
      );
    }
  }

  /* 5 bis — Les lieux nommés demandés par le propriétaire (plan AAA, lot
     1.7). Deux cols GARDÉS — un col est un passage qu'on paie, pas un
     panneau — et la Pierre de Pamole, qui rend la force à qui la touche :
     +1 en vaillance, une fois par héros, sans bourse délier (mécanique de
     l'école, prix zéro, récit de pierre levée). */
  const COL_SITES = [
    { anchor: 'col_sagnes', label: 'Col des Sagnes' },
    { anchor: 'col_st_thomas', label: 'Col Saint-Thomas' },
  ] as const;
  for (const s of COL_SITES) {
    const brut = anchorCell(s.anchor);
    const at = snap(b, brut, 3) ?? brut;
    const ring = ringAt(startDist, at.col, at.row);
    place(
      b,
      'garde',
      at,
      { name: s.label, ring, poste: true, col: s.anchor },
      {
        guard: guardFor(rng, ring, 3),
        footprint: [{ col: at.col, row: at.row }, ...flancsDe(b, ctx, at.col, at.row)],
        fixe: true,
      },
    );
  }
  /*
   * — Les MARCHES : un poste fort entre deux capitales trop voisines —
   *
   * Cervières et Noirétable sont à trois mille deux cent quarante-six points de
   * marche l'une de l'autre, quand les autres paires en comptent de six mille
   * neuf cents à neuf mille. Ce n'est pas une erreur : les deux bourgs sont
   * réellement voisins dans le Forez, et la géographie est fixe. Mais la
   * conséquence, elle, se mesure — vingt-cinq parties à cinq bannières :
   *
   *     La Renaudie   44 % de victoires · 3,0 cités · niveau 11,5 · debout 20/25
   *     Cervières     20 %              · 1,1 cité  · niveau  7,9 · debout 10/25
   *     Noirétable     8 %              · 0,7 cité  · niveau  5,5 · debout  8/25
   *
   * Les deux voisines s'entre-détruisent — éliminées dans quinze et dix-sept
   * parties sur vingt-cinq — pendant que la plus isolée grandit en paix. Et
   * l'équité économique n'y peut rien : elle est acquise à moins de trois pour
   * cent près.
   *
   * Le semis de postes ne pouvait pas corriger cela tout seul : il place ses
   * gardes aux TRANSITIONS D'ANNEAU, et entre deux capitales voisines il n'y a
   * pas de transition — tout est anneau 1. Le corridor restait donc ouvert, et
   * c'est le seul de la carte à l'être.
   *
   * On y pose donc une marche frontière : un poste fort, à l'endroit exact où
   * les deux capitales se rejoignent au moindre coût. Chacune doit le forcer
   * pour atteindre l'autre, ce qui les pousse à grandir ailleurs d'abord — la
   * structure même de HMM3, où l'on ne se touche qu'après avoir vidé sa zone.
   */
  const SEUIL_MARCHE = 5000;
  {
    const champs = new Map<StartKey, Int32Array>();
    for (const key of START_KEYS) {
      champs.set(key, costFieldFrom(ctx, START_POSITIONS[key].at, BALANCE_BUDGET));
    }
    for (let i = 0; i < START_KEYS.length; i++) {
      for (let j = i + 1; j < START_KEYS.length; j++) {
        const a = champs.get(START_KEYS[i]) as Int32Array;
        const bb = champs.get(START_KEYS[j]) as Int32Array;
        const cible = START_POSITIONS[START_KEYS[j]].at;
        const separation = a[idx(cible.col, cible.row)];
        if (separation >= SEUIL_MARCHE) continue;
        /* Le point de rencontre : la case où le pire des deux trajets est le
           plus court. C'est le milieu du meilleur chemin, sans avoir à le
           reconstruire. */
        let meilleur = -1;
        let pire = 0x7fffffff;
        for (let k = 0; k < CELLS; k++) {
          if (b.occupied[k] === 1) continue;
          if (!passable(ctx, k)) continue;
          if (TERRAINS[ctx.terrain[k]] === 'eau') continue;
          const m = Math.max(a[k], bb[k]);
          if (m < pire) {
            pire = m;
            meilleur = k;
          }
        }
        if (meilleur < 0) continue;
        const at = { col: meilleur % COLS, row: (meilleur / COLS) | 0 };
        if (tropPresDUneCapitale(at)) continue;
        place(
          b,
          'garde',
          at,
          {
            name: 'Marche des deux bourgs',
            ring: 3,
            poste: true,
            marche: `${START_KEYS[i]}|${START_KEYS[j]}`,
          },
          {
            guard: guardFor(rng, 3, 3),
            footprint: [{ col: at.col, row: at.row }, ...flancsDe(b, ctx, at.col, at.row)],
            fixe: true,
          },
        );
      }
    }
  }

  const pierre = snap(b, anchorCell('pamole'), 3);
  if (pierre) {
    place(b, 'ecole', pierre, {
      name: 'Pierre de Pamole',
      matiere: 'vaillance',
      prix: 0,
      rite: 'pierre',
    });
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
      {
        guard: guardFor(rng, 3, 4, poidsDeGarde('artefact', { rarity: a.rarity })),
        fixe: true,
      },
    );
  }

  /* 7 — Gisements majeurs. */
  for (const m of MINE_SITES) {
    const at = snap(b, m.at, 5);
    if (!at) continue;
    /*
     * Un gisement posé sur le pas de la porte d'une capitale se prend sans
     * combattre. C'est la règle de HMM3 : les deux mines voisines de la ville
     * de départ sont acquises au premier tour, elles nourrissent la première
     * semaine au lieu de la bloquer. La Scierie d'Arconsat s'est retrouvée à
     * quatre cases de sa ville quand la carte a pris la taille d'une XL — avec
     * sa garde, elle murait la sortie.
     */
    const auPasDeLaPorte = tropPresDUneCapitale(at);
    place(
      b,
      'mine',
      at,
      { resource: m.resource, amount: m.amount, name: m.label },
      auPasDeLaPorte
        ? { fixe: true }
        : {
            guard: guardFor(
              rng,
              m.ring,
              m.ring === 1 ? 2 : 3,
              poidsDeGarde('mine', { resource: m.resource, amount: m.amount }),
            ),
            fixe: true,
          },
    );
  }

  /*
   * Le répartiteur part de ce que la GÉOGRAPHIE a déjà donné.
   *
   * Les sept étapes précédentes sont écrites à la main — capitales, Maison du
   * Trésor, sceaux, bornes, belvédères, sanctuaires, auberges, doléances,
   * gisements nommés, artefacts fixes — et elles ne donnent pas la même chose à
   * chacun : c'est leur droit, la géographie est fixe. Mais le semis qui suit
   * doit COMPENSER cette inégalité au lieu de l'ignorer, sans quoi il répartit
   * équitablement par-dessus un socle inéquitable et l'écart survit intact.
   */
  for (let k = 0; k < START_KEYS.length; k++) {
    b.repartiteur.attribue[k] = accessibleValue(
      b.objects,
      b.repartiteur.champs[k],
      BALANCE_BUDGET,
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

  /*
   * Le couvert d'abord — puis un plancher par canton, parce qu'un pays sans
   * arbre n'est pas un pays sans trésor.
   *
   * Mesuré sur la carte à la taille d'une XL : l'arrière-pays de La Renaudie
   * est à 69 % de prairie et à 6 % de forêt, quand les quatre autres départs
   * ont de 20 % à 42 % de bois. Comme toutes les familles tirées sur cache
   * exigeaient le couvert, la plaine du sud se retrouvait à 29 tas et 3
   * coffres contre 86 à 121 tas et 20 à 58 coffres ailleurs — 122 lieux en
   * tout contre 197 à 283. Le départ était 55 % plus pauvre que le plus riche
   * dans son propre arrière-pays, et l'équilibrage n'y pouvait rien : il
   * n'avait plus une seule case où poser.
   *
   * On balaie donc par cantons de `BLOC_CACHE` cases : le couvert fournit ce
   * qu'il peut, et là où il ne fournit pas son compte on complète en terrain
   * ouvert. HMM3 sème ses tas de bois et ses tas d'or à découvert sur la
   * plaine ; exiger l'ombre était un parti pris d'ambiance, qui devenait une
   * famine dès que l'ambiance changeait.
   */
  const BLOC_CACHE = 14;
  const PLANCHER = 10;
  for (let br = 3; br < ROWS - 3; br += BLOC_CACHE) {
    for (let bc = 3; bc < COLS - 3; bc += BLOC_CACHE) {
      const couvert: number[] = [];
      const ouvert: number[] = [];
      const rMax = Math.min(br + BLOC_CACHE, ROWS - 3);
      const cMax = Math.min(bc + BLOC_CACHE, COLS - 3);
      for (let row = br; row < rMax; row++) {
        for (let col = bc; col < cMax; col++) {
          const i = row * COLS + col;
          if (!passable(ctx, i)) continue;
          if (b.occupied[i] === 1) continue;
          if ((ctx.flags[i] & CELL_ROAD) !== 0) continue;
          /* Un gué est de l'eau praticable SANS route : le filtre de voie ne
             l'écarte pas, et le complément en terrain ouvert y déposait des
             tas au milieu de la rivière. */
          if (TERRAINS[ctx.terrain[i]] === 'eau') continue;
          if ((ctx.flags[i] & CELL_CACHE) !== 0) couvert.push(i);
          else ouvert.push(i);
        }
      }
      const retenues = couvert;
      // Complément en terrain ouvert, pris à pas régulier pour ne pas
      // agglutiner le rattrapage dans un coin du canton.
      if (retenues.length < PLANCHER && ouvert.length > 0) {
        const manque = Math.min(PLANCHER - retenues.length, ouvert.length);
        const pas = Math.max(1, Math.floor(ouvert.length / manque));
        for (let k = 0, pris = 0; k < ouvert.length && pris < manque; k += pas, pris++) {
          retenues.push(ouvert[k]);
        }
      }
      for (const i of retenues) {
        const col = i % COLS;
        const row = (i / COLS) | 0;
        const ring = ringAt(startDist, col, row);
        out[ring].push(i);
        if (routeDist[i] <= 6) out[ring].push(i);
      }
    }
  }
  return out;
}

/**
 * Tire une cachette qui respecte l'écart voulu pour la nature qu'on va y poser.
 *
 * Le tirage d'avant se faisait à l'aveugle : c'est lui qui produisait les
 * défauts que le tableau de bord nommait — « artefact (15,10) / artefact
 * (14,10) », « coffre (100,73) / coffre (99,73) », cent trente paires de tas
 * sous l'écart. Les familles semées par `poserEspaces` s'espaçaient déjà ; les
 * trois familles tirées des cachettes — artefacts, tas, coffres — ne
 * s'espaçaient pas du tout.
 *
 * On garde l'ordre de repli d'anneau — l'anneau demandé, puis 2, 1, 3 —, on
 * garde le tirage au sort — on part d'un rang tiré et l'on avance en cercle, ce
 * qui évite d'avoir à remettre les recalés dans la liste — et l'on desserre
 * l'écart par paliers
 * plutôt que de rendre un compte incomplet. Au dernier palier l'écart voulu
 * tombe à zéro : le compte est donc EXACTEMENT celui d'avant, seule la place
 * change. La densité est une exigence du propriétaire au même titre que
 * l'espacement, et aucune des deux ne se paie avec l'autre.
 */
function prendreEspace(
  b: Builder,
  rng: RngState,
  caches: Record<1 | 2 | 3, number[]>,
  ring: 1 | 2 | 3,
  kind: string,
  data: Record<string, unknown>,
  /**
   * Arrière-pays visé, ou -1 pour n'importe lequel. C'est une PRÉFÉRENCE : on
   * l'essaie d'abord partout, puis on l'abandonne plutôt que de renoncer au
   * lieu. Un lot qui disparaît parce qu'un voisinage était plein serait une
   * perte de densité payée pour une équité — les deux sont des exigences.
   */
  cible = -1,
): number {
  for (const chezQui of cible >= 0 ? [cible, -1] : [-1]) {
  for (const facteur of [10000, 6600, 3300, 0]) {
    for (const r of [ring, 2, 1, 3] as (1 | 2 | 3)[]) {
      const list = caches[r];
      if (list.length === 0) continue;
      const debut = nextInt(rng, 0, list.length - 1);
      for (let n = 0; n < list.length; n++) {
        if (list.length === 0) break;
        const k = (debut + n) % list.length;
        const i = list[k];
        const col = i % COLS;
        const row = (i / COLS) | 0;
        /*
         * Une cachette prise entre-temps est du bois mort, et c'était une perte
         * SÈCHE : le tirage d'avant rendait la case, `place` la refusait, et le
         * lieu disparaissait sans que rien ne le dise. Une liste de cachettes
         * porte d'ailleurs deux fois les cases proches d'une voie — c'est ainsi
         * qu'on les favorise —, donc le doublon d'une case déjà bâtie s'y
         * trouve toujours. On la retire ici, et le compte est tenu.
         */
        if (!isFree(b, col, row)) {
          list[k] = list[list.length - 1];
          list.pop();
          n--;
          continue;
        }
        if (chezQui >= 0 && !chez(b, chezQui, col, row)) continue;
        if (!assezLoin(b, kind, data, col, row, facteur)) continue;
        list[k] = list[list.length - 1];
        list.pop();
        return i;
      }
    }
  }
  }
  return -1;
}

function seedArtifacts(b: Builder, rng: RngState, caches: Record<1 | 2 | 3, number[]>): void {
  const plan: { ring: 1 | 2 | 3; count: number }[] = [
    { ring: 1, count: 3 },
    { ring: 2, count: 5 },
    { ring: 3, count: 4 },
  ];
  for (const entry of plan) {
    for (let k = 0; k < entry.count; k++) {
      /* La rareté se tire d'abord : c'est elle qui dit le poids, et le poids
         désigne l'arrière-pays qui en a le plus besoin. */
      const rarity = pickWeighted(rng, RARITY_BY_RING[entry.ring]);
      const cible = departLePlusPauvre(b.repartiteur.attribue);
      const i = prendreEspace(b, rng, caches, entry.ring, 'artefact', {}, cible);
      if (i < 0) continue;
      const pool = ARTIFACT_POOL[rarity];
      const artifact = pool[nextInt(rng, 0, pool.length - 1)];
      const at = { col: i % COLS, row: (i / COLS) | 0 };
      /*
       * Un artefact SANS garde, c'est un artefact qui ne se mérite pas. Les
       * trois artefacts du premier anneau n'en avaient aucune : on les
       * ramassait en passant, alors qu'un artefact est dans HMM3 l'objectif qui
       * justifie qu'on détourne un héros de sa route. Ils reçoivent maintenant
       * la garde de leur anneau, dosée par leur rareté — un commun du premier
       * anneau tombe donc au plancher de la fourchette, quatre cents de
       * puissance, ce qui est une escarmouche de première semaine et non un
       * mur.
       */
      const garde = guardFor(rng, entry.ring, 2, poidsDeGarde('artefact', { rarity }));
      crediter(b, at, valeurBrute('artefact', { rarity }), garde);
      place(b, 'artefact', at, { artifact, rarity }, { guard: garde });
    }
  }
}

function seedPiles(b: Builder, rng: RngState, caches: Record<1 | 2 | 3, number[]>): void {
  const plan: { ring: 1 | 2 | 3; count: number }[] = [
    { ring: 1, count: 14 },
    { ring: 2, count: 13 },
    { ring: 3, count: 9 },
  ];
  for (const entry of plan) {
    for (let k = 0; k < entry.count; k++) {
      /* La ressource se tire AVANT la case : c'est elle qui donne la clef
         d'espacement — on ne veut pas deux tas de sel côte à côte, deux tas
         de natures différentes ne gênent personne. */
      const resource = pickWeighted(rng, PILE_TABLE);
      const amount = pileAmount(rng, resource, entry.ring);
      /* Les tas sont la famille la plus nombreuse : ils ne pèsent pas lourd un
         par un, mais ensemble ils font le tiers du butin de la carte. Ils
         suivent donc le même répartiteur — c'est le sens littéral de la demande
         du propriétaire, « les items de ressources doivent être répartis et
         distribués de manière intelligente et réfléchie ». */
      const cible = departLePlusPauvre(b.repartiteur.attribue);
      const i = prendreEspace(b, rng, caches, entry.ring, 'ressource', { resource }, cible);
      if (i < 0) continue;
      const at = { col: i % COLS, row: (i / COLS) | 0 };
      crediter(b, at, valeurBrute('ressource', { resource, amount }));
      place(b, 'ressource', at, { resource, amount });
    }
  }
}

function seedGuards(
  b: Builder,
  rng: RngState,
  ctx: ObjectContext,
  startDist: Uint16Array,
): void {
  /*
   * Deux compagnies, deux métiers.
   *
   * Les POSTES tiennent les voies aux transitions d'anneau : là où la route
   * quitte les abords d'un départ pour entrer dans une zone plus rude. C'est
   * la structure de HMM3 — les zones se franchissent par des passages gardés —
   * et c'était l'écart le plus mesurable de l'audit : sur les dix itinéraires
   * optimaux entre capitales, on ne croisait AUCUN garde ; trois sur
   * quarante-six seulement touchaient une voie, et tous n'occupaient que leur
   * case d'entrée, que le calcul de chemin ignore par construction — ils ne
   * bloquaient donc rien du tout.
   *
   * Un poste reçoit une empreinte de TROIS cases : l'entrée, sur la voie —
   * on la franchit, mais y poser le pied déclenche le combat — et deux cases
   * de flanc, réellement bloquées pour le calcul de chemin. On passe par le
   * poste ou l'on fait un grand détour ; c'est toute la différence entre un
   * décor et une garde.
   *
   * Les ERRANTES gardent les lisières comme avant : elles protègent les
   * trésors des couverts, pas les passages.
   */
  const postes: number[] = [];
  const lisieres: number[] = [];
  for (let row = 6; row < ROWS - 6; row++) {
    for (let col = 6; col < COLS - 6; col++) {
      const i = row * COLS + col;
      if (b.occupied[i] === 1) continue;
      if (!passable(ctx, i)) continue;
      /* Jamais sur l'eau. Un tablier de pont et un gué sont praticables et
         portent la voie : ils passaient donc les deux filtres ci-dessus, et
         c'est ainsi que deux postes de garde se sont retrouvés plantés au
         milieu d'une rivière. Un poste tient un passage à terre, et ses deux
         cases de flanc n'ont de sens que sur la berge. */
      if (TERRAINS[ctx.terrain[i]] === 'eau') continue;
      if (startDist[i] < 6) continue;
      const onRoad = (ctx.flags[i] & CELL_ROAD) !== 0;
      if (onRoad) {
        /* Transition d'anneau : un voisin de voie est d'un anneau différent. */
        const ring = ringAt(startDist, col, row);
        let transition = false;
        for (let dr = -1; dr <= 1 && !transition; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const j = (row + dr) * COLS + (col + dc);
            if ((ctx.flags[j] & CELL_ROAD) === 0) continue;
            if (ringAt(startDist, col + dc, row + dr) !== ring) {
              transition = true;
              break;
            }
          }
        }
        if (transition) postes.push(i);
      } else if ((ctx.flags[i] & CELL_EDGE) !== 0) {
        lisieres.push(i);
      }
    }
  }
  shuffle(rng, postes);
  shuffle(rng, lisieres);

  /*
   * L'écart entre gardes se mesure sur la mémoire GLOBALE, pas sur la liste de
   * ce seul semeur.
   *
   * La liste locale ignorait les deux cols gardés écrits à la main, et le test
   * multi-graine l'a pris en flagrant délit : sur la graine 20260817, un poste
   * tombait à DEUX cases du Col Saint-Thomas. Deux péages sur le même passage,
   * ce n'est pas une garde renforcée, c'est un doublon — et c'est exactement le
   * reproche du propriétaire sur les assets qui se répètent de trop près.
   *
   * On garde en plus une exigence propre aux postes : cinq cases entre deux
   * postes, là où la table n'en demande que quatre entre deux gardes. Un poste
   * ferme un passage ; deux passages fermés côte à côte ne ferment qu'un
   * passage, et coûtent deux combats.
   */
  const postesPris: MapCoord[] = [];
  const entrePostes = (col: number, row: number, min: number): boolean => {
    for (const t of postesPris) {
      if (Math.max(Math.abs(t.col - col), Math.abs(t.row - row)) < min) return false;
    }
    return true;
  };

  /* — Les postes : jusqu'à 30, espacés, forts comme la zone qu'ils ferment — */
  let posts = 0;
  for (const i of postes) {
    if (posts >= 30) break;
    const col = i % COLS;
    const row = (i / COLS) | 0;
    if (!entrePostes(col, row, 5)) continue;
    if (!assezLoin(b, 'garde', {}, col, row)) continue;
    /* Le poste est fort comme le PLUS RUDE de ses deux côtés : on paie la
       zone où l'on entre, pas celle d'où l'on vient. */
    let ring = ringAt(startDist, col, row);
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r2 = ringAt(startDist, col + dc, row + dr);
        if (r2 > ring) ring = r2;
      }
    }
    const flancs = flancsDe(b, ctx, col, row);
    const obj = place(
      b,
      'garde',
      { col, row },
      { ring, poste: true },
      {
        guard: guardFor(rng, ring, 3),
        footprint: [{ col, row }, ...flancs],
      },
    );
    if (obj) {
      postesPris.push({ col, row });
      posts++;
    }
  }

  /* — Les errantes : le complément à 54, sur les lisières — */
  let placed = 0;
  for (const i of lisieres) {
    if (posts + placed >= 54) break;
    const col = i % COLS;
    const row = (i / COLS) | 0;
    if (!assezLoin(b, 'garde', {}, col, row)) continue;
    const ring = ringAt(startDist, col, row);
    const obj = place(b, 'garde', { col, row }, { ring }, { guard: guardFor(rng, ring, 3) });
    if (obj) placed++;
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

/**
 * Cherche une case ouverte qui respecte l'écart voulu pour ce qu'on va y poser.
 *
 * Là où `poserEspaces` choisit la case PUIS laisse la fabrique décider de la
 * nature, ce chercheur fait l'inverse : la nature est connue d'avance, donc
 * l'écart se mesure sur la vraie clef. C'est la différence qui manquait aux
 * gisements supplémentaires — ils s'espaçaient sur la clef `mine` sans
 * ressource, un ensemble VIDE puisque tout gisement en a une, si bien que le
 * test ne refusait jamais rien et qu'un filon de fer pouvait s'installer à huit
 * cases d'une minière nommée.
 */
function chercherPlace(
  b: Builder,
  spots: readonly number[],
  kind: string,
  data: Record<string, unknown>,
  convient?: (col: number, row: number) => boolean,
  cible = -1,
): MapCoord | null {
  for (const chezQui of cible >= 0 ? [cible, -1] : [-1]) {
    for (const facteur of [10000, 6600, 3300, 0]) {
      for (const i of spots) {
        if (b.occupied[i] === 1) continue;
        const col = i % COLS;
        const row = (i / COLS) | 0;
        if (chezQui >= 0 && !chez(b, chezQui, col, row)) continue;
        if (convient && !convient(col, row)) continue;
        if (!assezLoin(b, kind, data, col, row, facteur)) continue;
        return { col, row };
      }
    }
  }
  return null;
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
  /**
   * Ce que la fabrique va poser, pour que l'espacement consulte la mémoire
   * GLOBALE et non le seul historique de cet appel.
   *
   * C'était le défaut : chaque famille se répartissait proprement contre
   * elle-même et ignorait tout ce qui l'avait précédée. Les gisements
   * supplémentaires s'espaçaient de quatorze cases entre eux et venaient se
   * coller aux gisements nommés ; les artefacts semés ignoraient les artefacts
   * fixes. Mesuré : dix-neuf paires de gisements et quatre paires d'artefacts
   * sous l'écart voulu, dont deux artefacts case contre case.
   *
   * Quand la nature dépend du tirage — un gisement peut sortir en bois, en
   * granit ou en écus — on donne la nature et une `data` représentative ; c'est
   * la clef d'espacement la plus large qui s'applique alors, ce qui est le bon
   * sens : mieux vaut espacer un peu trop que se retrouver avec deux scieries
   * voisines.
   */
  nature?: { kind: string; data: Record<string, unknown> },
): void {
  const pris: MapCoord[] = [];
  const loinDesPris = (col: number, row: number): boolean => {
    for (const t of pris) {
      if (Math.max(Math.abs(t.col - col), Math.abs(t.row - row)) < spacing) return false;
    }
    return true;
  };
  /*
   * Un lieu à la fois, et chacun va au voisinage le plus pauvre.
   *
   * La boucle d'avant parcourait les cases et posait au fil de l'eau, ce qui
   * interdisait toute répartition de la RICHESSE : les onze écoles, les huit
   * moulins, les douze pierres levées — une trentaine de milliers d'écus au
   * total — tombaient là où il restait de la place. Poser un lieu à la fois
   * permet de demander, avant chacun, quel départ en a le plus besoin.
   *
   * Les trois passes de relâchement de l'écart restent : la densité est une
   * exigence du propriétaire autant que l'espacement — « il faut suffisamment de
   * mines de ressources pour pouvoir jouer » — donc on ne rend jamais un compte
   * incomplet par respect d'un écart. L'arrière-pays visé se relâche de même,
   * et en premier : mieux vaut le bon lieu chez le voisin que pas de lieu.
   */
  for (let n = 0; n < count; n++) {
    const cible = nature ? departLePlusPauvre(b.repartiteur.attribue) : -1;
    let choisi: MapCoord | null = null;
    for (const chezQui of cible >= 0 ? [cible, -1] : [-1]) {
      for (const facteur of [10000, 6600, 3300, 0]) {
        for (const i of spots) {
          if (b.occupied[i] === 1) continue;
          const col = i % COLS;
          const row = (i / COLS) | 0;
          if (chezQui >= 0 && !chez(b, chezQui, col, row)) continue;
          if (!loinDesPris(col, row)) continue;
          if (nature && !assezLoin(b, nature.kind, nature.data, col, row, facteur)) continue;
          choisi = { col, row };
          break;
        }
        if (choisi) break;
      }
      if (choisi) break;
    }
    if (!choisi) return;
    /* On crédite ce que la fabrique a RÉELLEMENT posé — elle peut poser deux
       pierres levées d'un coup — et non ce qu'on croyait qu'elle poserait. */
    const avant = b.objects.length;
    fabrique(choisi, ringAt(startDist, choisi.col, choisi.row));
    for (let k = avant; k < b.objects.length; k++) {
      const o = b.objects[k];
      crediter(b, o.at, valeurBrute(o.kind, o.data), o.guard);
    }
    pris.push(choisi);
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
  /* — Coffres : 58, cachés sous les couverts, valeur montant avec l'anneau — */
  const coffres: { ring: 1 | 2 | 3; count: number }[] = [
    { ring: 1, count: 19 },
    { ring: 2, count: 16 },
    { ring: 3, count: 9 },
  ];
  for (const entry of coffres) {
    for (let k = 0; k < entry.count; k++) {
      /* Un coffre vaut de mille à deux mille cinq cents écus : quarante-quatre
         coffres, c'est le plus gros pot de la carte, et il se répartissait au
         hasard des couverts. */
      const ecus = (10 + entry.ring * 5 + nextInt(rng, 0, 5)) * 100;
      const savoir = nextInt(rng, 0, 2) === 0 ? 1 : 0;
      const cible = departLePlusPauvre(b.repartiteur.attribue);
      const i = prendreEspace(b, rng, caches, entry.ring, 'coffre', {}, cible);
      if (i < 0) continue;
      const at = { col: i % COLS, row: (i / COLS) | 0 };
      crediter(b, at, valeurBrute('coffre', { ecus, savoir }));
      place(b, 'coffre', at, { ecus, savoir });
    }
  }

  /*
   * — Tas supplémentaires : 62 —
   *
   * Le compte a suivi la carte. Il était de 80, puis de 150 quand l'arrivée
   * des hautes-chaumes et des tourbières a mieux réparti le semis et fait
   * tomber le glaneur sous sa cible. La carte ramenée à la taille d'une XL de
   * HMM3 rend cette surenchère absurde : sur 20 266 cases praticables, les
   * anciens comptes donnaient un lieu toutes les 16 cases, deux à trois fois
   * la densité d'une XL. Chaque famille a donc été reposée sur le décompte
   * d'une vraie XL, et non divisée en bloc.
   */
  const tas: { ring: 1 | 2 | 3; count: number }[] = [
    { ring: 1, count: 20 },
    { ring: 2, count: 15 },
    { ring: 3, count: 9 },
  ];
  for (const entry of tas) {
    for (let k = 0; k < entry.count; k++) {
      const resource = pickWeighted(rng, PILE_TABLE);
      const amount = pileAmount(rng, resource, entry.ring);
      const cible = departLePlusPauvre(b.repartiteur.attribue);
      const i = prendreEspace(b, rng, caches, entry.ring, 'ressource', { resource }, cible);
      if (i < 0) continue;
      const at = { col: i % COLS, row: (i / COLS) | 0 };
      crediter(b, at, valeurBrute('ressource', { resource, amount }));
      place(b, 'ressource', at, { resource, amount });
    }
  }

  const spots = openSpots(b, ctx, routeDist);
  shuffle(rng, spots);

  /* — Demeures franches : 32, le compte d'habitats extérieurs d'une XL — un
       recruteur extérieur donne à l'exploration une conséquence militaire. — */
  for (let n = 0; n < 32; n++) {
    const cible = departLePlusPauvre(b.repartiteur.attribue);
    const at = chercherPlace(b, spots, 'demeure', {}, undefined, cible);
    if (!at) continue;
    const ring = ringAt(startDist, at.col, at.row);
    const tiers = DEMEURE_TIERS[ring];
    const tier = tiers[nextInt(rng, 0, tiers.length - 1)];
    const faction: Faction = nextInt(rng, 0, 1) === 0 ? 'granit' : 'ermitage';
    const creature = `${faction}_t${tier}`;
    const gardeDemeure =
      ring >= 2 ? guardFor(rng, ring, 2, poidsDeGarde('demeure', { creature })) : undefined;
    crediter(b, at, valeurBrute('demeure', { creature }), gardeDemeure);
    place(
      b,
      'demeure',
      at,
      { creature, stock: 0, name: NOMS_DEMEURES[tier] ?? 'Demeure franche' },
      gardeDemeure ? { guard: gardeDemeure } : {},
    );
  }

  /* — Gisements supplémentaires : 14, dont les orpaillages qui rendent des
       écus — l'équivalent des mines d'or, gardés à la mesure du gain. Avec les
       gisements nommés, la carte en porte une quarantaine, le compte d'une
       XL où chaque joueur veut sa scierie, sa carrière et sa mine d'or. — */
  /*
   * La ressource se tire AVANT la case, et l'orpaillage avec elle.
   *
   * L'ordre inverse — case, puis ressource — rendait l'espacement inopérant :
   * on ne peut pas s'écarter des scieries si l'on ne sait pas encore qu'on pose
   * une scierie. L'orpaillage restait de surcroît soumis à l'anneau de la case
   * déjà choisie, ce qui en supprimait un sur trois sans le dire ; il exige
   * maintenant l'anneau 2 ou 3 comme une CONDITION de la case, et le compte des
   * quatorze est tenu.
   */
  for (let n = 0; n < 14; n++) {
    const orpaillage = nextInt(rng, 0, 2) === 0;
    const filon = pickWeighted(rng, PILE_TABLE);
    const resource = orpaillage ? 'ecus' : filon === 'ecus' ? 'fer' : filon;
    const cible = departLePlusPauvre(b.repartiteur.attribue);
    const at = chercherPlace(
      b,
      spots,
      'mine',
      { resource },
      (col, row) => (orpaillage ? ringAt(startDist, col, row) >= 2 : true),
      cible,
    );
    if (!at) continue;
    const ring = ringAt(startDist, at.col, at.row);
    const quantite = orpaillage ? 300 + ring * 60 : 1 + (ring > 1 ? 1 : 0);
    const gardeMine = guardFor(
      rng,
      orpaillage ? (ring === 3 ? 4 : 3) : ring,
      3,
      poidsDeGarde('mine', { resource, amount: quantite }),
    );
    crediter(b, at, valeurBrute('mine', { resource, amount: quantite }), gardeMine);
    if (orpaillage) {
      place(
        b,
        'mine',
        at,
        { resource: 'ecus', amount: quantite, name: 'Orpaillage' },
        { guard: gardeMine },
      );
    } else {
      place(
        b,
        'mine',
        at,
        { resource, amount: quantite, name: 'Filon' },
        { guard: gardeMine },
      );
    }
  }

  /* — Repaires gardés : 12 banques, gros gardien, gros butin, repeuplées — */
  for (let n = 0; n < 12; n++) {
    const cibleR = departLePlusPauvre(b.repartiteur.attribue);
    const at = chercherPlace(b, spots, 'banque', {}, undefined, cibleR);
    if (!at) continue;
    const ring = ringAt(startDist, at.col, at.row);
    /* Le butin se tire d'abord : c'est lui qui dose le gardien. Un repaire de
       cinq mille écus et un de deux mille recevaient la même garde. */
    const butin = {
      ecus: (20 + ring * 15 + nextInt(rng, 0, 10)) * 100,
      resource: pickWeighted(rng, PILE_TABLE),
      amount: 4 + ring * 3,
    };
    const garde = guardFor(
      rng,
      ring === 1 ? 2 : ring === 2 ? 3 : 4,
      3,
      poidsDeGarde('banque', butin),
    );
    crediter(b, at, valeurBrute('banque', butin), garde);
    place(
      b,
      'banque',
      at,
      {
        ...butin,
        repop: 4,
        garde0: garde.map((g) => ({ ...g })),
        name: NOMS_REPAIRES[nextInt(rng, 0, NOMS_REPAIRES.length - 1)],
      },
      { guard: garde },
    );
  }

  /* — Écoles : 10, temples : 8, fontaines : 7, moulins : 8 — */
  const matieres = ['vaillance', 'garde', 'mystique', 'savoir'] as const;
  let ecole = 0;
  poserEspaces(b, rng, spots, 10, 16, (at) => {
    place(b, 'ecole', at, { matiere: matieres[ecole++ % matieres.length] });
  }, startDist, { kind: 'ecole', data: {} });
  poserEspaces(b, rng, spots, 8, 20, (at) => {
    place(b, 'temple', at, { name: 'Oratoire' });
  }, startDist, { kind: 'temple', data: {} });
  poserEspaces(b, rng, spots, 7, 20, (at) => {
    place(b, 'fontaine', at, { name: 'Fontaine aux fées' });
  }, startDist, { kind: 'fontaine', data: {} });
  poserEspaces(b, rng, spots, 8, 22, (at) => {
    const resource = pickWeighted(rng, PILE_TABLE);
    place(b, 'moulin', at, {
      resource,
      amount: resource === 'ecus' ? 250 : 4,
      name: 'Moulin',
    });
  }, startDist, { kind: 'moulin', data: {} });

  /* — Pierres levées : 6 paires, jumelées loin l'une de l'autre — */
  const bornes: MapCoord[] = [];
  poserEspaces(b, rng, spots, 12, 26, (at) => {
    bornes.push(at);
  }, startDist, { kind: 'monolithe', data: {} });
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
  }, startDist, { kind: 'obelisque', data: {} });
  poserEspaces(b, rng, spots, 3, 60, (at) => {
    const i = at.row * COLS + at.col;
    place(b, 'cartographe', at, { prix: 1000, region: undefined, name: 'Cartographe', regionIdx: b.ctx.region[i] });
  }, startDist, { kind: 'cartographe', data: {} });
  poserEspaces(b, rng, spots, 4, 40, (at, ring) => {
    const rarity: Rarity = ring === 3 ? 'majeur' : 'rare';
    const pool = ARTIFACT_POOL[rarity];
    place(b, 'marche_noir', at, {
      artifact: pool[nextInt(rng, 0, pool.length - 1)],
      prix: rarity === 'majeur' ? 4000 : 2500,
      name: 'Colporteurs',
    });
  }, startDist, { kind: 'marche_noir', data: {} });
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
 * La passe de couverture : aucun bloc de 14 × 14 praticable ne reste vide.
 *
 * Les placements par anneau et par cache suivent la géographie, et la
 * géographie laisse des déserts : 26 % des blocs n'avaient rien. Un joueur
 * qui traverse mille cases sans rien rencontrer n'explore pas, il marche.
 * Chaque bloc vide reçoit un ou deux ramassages — le minimum qui change la
 * traversée en cueillette.
 *
 * Le bloc valait 32 cases de côté quand la carte en faisait 256 × 416 ; il
 * suit l'échelle, sans quoi le filet ne retient plus rien.
 */
function seedCouverture(b: Builder, rng: RngState, ctx: ObjectContext): void {
  const BLOC = 14;
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
        const resource = pickWeighted(rng, PILE_TABLE);
        /* Un carré vide se remplit sans y remettre deux fois la même chose :
           on cherche une case qui respecte l'écart, et l'on se contente de
           n'importe laquelle seulement si le carré n'en offre aucune. */
        let idx2 = -1;
        const debut = nextInt(rng, 0, libres.length - 1);
        for (const facteur of [10000, 0]) {
          for (let t = 0; t < libres.length; t++) {
            const p = (debut + t) % libres.length;
            const j = libres[p];
            if (!assezLoin(b, 'ressource', { resource }, j % COLS, (j / COLS) | 0, facteur)) continue;
            idx2 = p;
            break;
          }
          if (idx2 >= 0) break;
        }
        if (idx2 < 0) break;
        const i = libres[idx2];
        libres[idx2] = libres[libres.length - 1];
        libres.pop();
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
    fields.set(key, costFieldFrom(ctx, START_POSITIONS[key].at, BALANCE_BUDGET));
  }

  /*
   * Cases de compensation candidates : l'arrière-pays propre de chaque départ,
   * trié par proximité. L'horizon `BALANCE_BUDGET` rend déjà les voisinages
   * presque disjoints ; on écarte en plus la frange où un rival arrive à
   * moins d'un tiers de coût de plus, pour que chaque tas posé creuse l'écart
   * dans le bon sens plutôt que d'enrichir les deux voisins à la fois.
   */
  const candidates = new Map<StartKey, number[]>();
  for (const key of START_KEYS) {
    const field = fields.get(key) as Int32Array;
    const rivaux = START_KEYS.filter((k) => k !== key).map((k) => fields.get(k) as Int32Array);
    const list: number[] = [];
    for (const ring of [1, 2, 3] as (1 | 2 | 3)[]) {
      for (const i of caches[ring]) {
        if (field[i] >= Math.trunc((BALANCE_BUDGET * 3) / 5)) continue;
        let plusProcheRival = BALANCE_BUDGET;
        for (const autre of rivaux) if (autre[i] < plusProcheRival) plusProcheRival = autre[i];
        if (plusProcheRival < Math.trunc((field[i] * 4) / 3)) continue;
        list.push(i);
      }
    }
    list.sort((x, y) => field[x] - field[y] || x - y);
    candidates.set(key, list);
  }

  const values = {} as Record<StartKey, number>;
  /* Le budget de tas de chaque départ, dépensé une fois pour toutes. */
  const reste = {} as Record<StartKey, number>;
  for (const key of START_KEYS) reste[key] = COMPENSATION_PILES;
  for (let pass = 0; pass < BALANCE_PASSES; pass++) {
    let max = 0;
    for (const key of START_KEYS) {
      const v = accessibleValue(b.objects, fields.get(key) as Int32Array, BALANCE_BUDGET);
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
      if (reste[key] <= 0) continue;
      const wanted = Math.max(120, Math.trunc(gap / 2));
      reste[key] -= addCompensation(
        b,
        rng,
        list,
        wanted,
        fields.get(key) as Int32Array,
        reste[key],
      );
    }
  }

  for (const key of START_KEYS) {
    values[key] = accessibleValue(b.objects, fields.get(key) as Int32Array, BALANCE_BUDGET);
  }
  return values;
}

/**
 * Valeur faciale maximale d'une cache de compensation, en écus.
 *
 * Relevée de neuf cents à deux mille cinq cents le jour où la compensation a
 * cessé de pouvoir ajouter des tas à volonté : à budget de tas fixe, c'est la
 * valeur de chaque tas qui doit porter l'écart. Deux mille cinq cents écus,
 * c'est un gros tas de HMM3 — pas un magot.
 */
const COMPENSATION_CAP = 2500;
/**
 * Nombre maximal de caches posées pour un même départ, TOUTES PASSES CONFONDUES.
 *
 * C'était un plafond par passe, et la compensation en a fait un désastre
 * silencieux : dix-huit passes, quatre départs en retard, huit tas chacun, cela
 * autorise cinq cent soixante-seize tas. Le jour où `objectValue` a cessé
 * d'ignorer les coffres et les repaires, les écarts absolus ont triplé, la
 * convergence a demandé plus de passes, et la carte est passée de 477 à 653
 * lieux — 327 tas de ressources au lieu de 131, une case sur 27 au lieu d'une
 * sur 38. Un dispositif d'équilibrage qui peut poser deux cents tas n'équilibre
 * pas la carte : il la noie. Le plafond est donc un BUDGET par départ, et ce qui
 * ne rentre pas dans le budget se dit dans le tableau de bord au lieu de se
 * payer en densité.
 */
const COMPENSATION_PILES = 15;

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
  budget: number,
): number {
  let delivered = 0;
  let piles = 0;
  /*
   * La compensation espace aussi ses caches.
   *
   * C'était la source des grappes que le tableau de bord montrait au ras des
   * capitales — « ecus (60,163) / ecus (60,162) / ecus (60,165) » à La Renaudie,
   * « fer (42,16) / fer (41,15) » à Arconsat. La liste de candidats est triée par
   * coût de marche, donc les cases les moins chères sont voisines par
   * construction : sans écart, une passe de rééquilibrage pose huit tas en
   * grappe sur le pas de porte. Le rééquilibrage reste prioritaire — c'est lui
   * qui rend les cinq départs comparables —, donc l'écart se desserre par
   * paliers, et les recalés retournent dans la file pour la passe suivante.
   */
  const paliers = [10000, 5000, 0];
  let palier = 0;
  const recales: number[] = [];
  while (delivered < wantedValue && piles < budget) {
    if (list.length === 0) {
      if (palier + 1 >= paliers.length || recales.length === 0) break;
      palier++;
      for (const r of recales) list.push(r);
      recales.length = 0;
      continue;
    }
    const i = list.shift() as number;
    if (b.occupied[i] === 1) continue;
    const col = i % COLS;
    const row = (i / COLS) | 0;
    const cost = field[i];
    if (cost >= BALANCE_BUDGET) continue;
    const reach = Math.trunc(((BALANCE_BUDGET - cost) * 10000) / BALANCE_BUDGET);
    if (reach <= 0) continue;

    // Valeur faciale nécessaire pour apporter le reste après escompte.
    const remaining = wantedValue - delivered;
    const raw = Math.min(COMPENSATION_CAP, Math.trunc((remaining * 10000) / reach));

    if (raw < 40) break;

    /*
     * La bourse plutôt que le tas, quand le manque est gros.
     *
     * Un tas de ressource est plafonné à soixante unités — au-delà ce n'est plus
     * un tas, c'est un entrepôt — donc il ne porte au mieux que trois cent
     * soixante écus de bois. C'était le vrai goulet de la compensation :
     * vingt-deux tas ne fermaient pas un écart de dix pour cent, et l'on
     * croyait manquer de tas quand on manquait de valeur PAR tas. Une bourse
     * d'écus va jusqu'au plafond de deux mille cinq cents, ce qui est le gros
     * tas d'or de HMM3, et ferme l'écart avec trois caches au lieu de vingt.
     */
    const resource: ResourceKey =
      remaining > 600 ? 'ecus' : pickWeighted(rng, PILE_TABLE);
    const unit = RESOURCE_VALUE[resource] ?? 1;
    let amount: number;
    if (resource === 'ecus') {
      amount = Math.max(100, Math.trunc(raw / 50) * 50);
    } else {
      amount = Math.max(2, Math.min(60, Math.trunc(raw / unit)));
    }
    if (!assezLoin(b, 'ressource', { resource }, col, row, paliers[palier])) {
      recales.push(i);
      continue;
    }
    const placed = place(b, 'ressource', { col, row }, { resource, amount, compensation: true });
    if (!placed) continue;
    delivered += Math.trunc((amount * unit * reach) / 10000);
    piles++;
  }
  /* Ce qui n'a pas servi retourne dans la file : la passe suivante y revient. */
  for (const r of recales) list.push(r);
  return piles;
}
