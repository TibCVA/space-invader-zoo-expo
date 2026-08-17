/**
 * Constantes du noyau déterministe.
 *
 * Toutes les valeurs sont entières. Les ratios sont exprimés en points de base
 * (BP, /10000) conformément au brief.
 */
import type { ResourceKey, Terrain, WeatherKind } from '../types.js';

/** Version du moteur, enregistrée dans chaque partie et dans chaque sauvegarde. */
export const ENGINE_VERSION = '1.0.0-noyau';

/* ── Calendrier ─────────────────────────────────────────────────────────── */

export const DAYS_PER_WEEK = 7;
export const WEEKS_PER_RONDE = 4;
export const DAYS_PER_RONDE = DAYS_PER_WEEK * WEEKS_PER_RONDE;

/** Durée de la proclamation dans la Maison du Trésor (brief §6). */
export const CLAIM_DURATION_TURNS = 21;

/** Semaines de jeu par durée de partie. */
export const DURATION_WEEKS: Record<'eclair' | 'standard' | 'saga', number> = {
  eclair: 8,
  standard: 12,
  saga: 16,
};

/** Bonus de déplacement du mode éclair, en BP. */
export const ECLAIR_MOVEMENT_BP = 11500;

/* ── Héros ──────────────────────────────────────────────────────────────── */

export const HERO_LIMIT = 4;
export const ARMY_SLOTS = 7;
export const GARRISON_SLOTS = 7;
export const MAX_SKILLS = 8;
export const MAX_LEVEL = 30;

/** Points de marche de base d'un héros (brief §5 : 1800–2200). */
export const BASE_MOVEMENT = 1800;
export const MAX_MOVEMENT = 3200;
/** Portée de vue de base, en cases. */
export const BASE_VISION = 7;
/** Portée de vue d'une cité. */
export const TOWN_VISION = 9;
/** Mana régénéré chaque jour hors cité. */
export const MANA_REGEN = 2;
/** Mana régénéré chaque jour dans une cité disposant d'une source de mana. */
export const MANA_REGEN_TOWN = 4;
/** Jours d'indisponibilité après la défaite d'un héros. */
export const HERO_DOWN_DAYS = 2;
/** Coût de recrutement d'un héros à l'auberge. */
export const HERO_HIRE_COST = 2500;
/** Nombre d'offres présentées à l'auberge. */
export const TAVERN_OFFERS = 2;

/* ── Déplacement ────────────────────────────────────────────────────────── */

/** Multiplicateur de coût en diagonale : ×141/100 (brief §5). */
export const DIAGONAL_NUM = 141;
export const DIAGONAL_DEN = 100;

/** Coût minimal d'une case, utilisé comme heuristique admissible du A*. */
export const MIN_TERRAIN_COST = 70;

/** Bornes armoriées : coût en écus et en points de marche. */
export const BORNE_COST_ECUS = 200;
export const BORNE_COST_MOVEMENT = 400;
/** Nombre d'utilisations quotidiennes d'une borne pour un héros ordinaire. */
export const BORNE_USES_PER_DAY = 1;

/* ── Brouillard de guerre ───────────────────────────────────────────────── */

export const FOG_UNKNOWN = 0;
export const FOG_EXPLORED = 1;
export const FOG_VISIBLE = 2;

/** Hauteur d'œil du héros au-dessus du sol, en mètres. */
export const EYE_HEIGHT = 2;
/** Hauteur occultante d'une futaie dense, en mètres. */
export const CANOPY_FOREST = 14;
/** Hauteur occultante d'un chaos rocheux, en mètres. */
export const CANOPY_ROCK = 7;
/** Bonus de portée maximal apporté par une crête. */
export const RIDGE_VISION_BONUS_MAX = 6;
export const RIDGE_VISION_MALUS_MAX = 3;
/** Mètres de dénivelé relatif nécessaires pour un point de portée. */
export const RIDGE_METERS_PER_POINT = 18;

/* ── Économie ───────────────────────────────────────────────────────────── */

/** Revenu quotidien de base d'une capitale (document maître §7.2). */
export const CAPITAL_INCOME_ECUS = 1000;
/** Revenu quotidien de base d'une cité secondaire. */
export const TOWN_INCOME_ECUS = 500;
/** Revenu quotidien de base d'un village capturé. */
export const VILLAGE_INCOME_ECUS = 150;

/** Agitation maximale d'une cité. */
export const MAX_UNREST = 100;
/** Perte de revenu par point d'agitation, en BP. */
export const UNREST_INCOME_BP = 60;

/** Puissance d'armée exonérée d'entretien, par joueur. */
export const UPKEEP_FREE_POWER = 4000;
/** Puissance nécessitant un écu d'entretien quotidien. */
export const UPKEEP_POWER_PER_ECU = 120;

/** Valeur d'échange de référence de chaque ressource, en écus. */
export const RESOURCE_VALUE: Record<ResourceKey, number> = {
  ecus: 1,
  bois: 6,
  granit: 6,
  fer: 9,
  sel: 9,
  essence: 14,
  filDor: 14,
};

/** Rendement du marché sans bâtiment, en BP. */
export const MARKET_BASE_BP = 4000;
/** Rendement apporté par un marché construit, en BP. */
export const MARKET_BUILDING_BP = 2200;
/** Rendement maximal du marché, en BP (jamais de profit sur un aller-retour). */
export const MARKET_MAX_BP = 9200;

/** Coût d'amélioration : différence de coût majorée de ce ratio, en BP. */
export const UPGRADE_COST_BP = 11000;

/* ── Gabelle ────────────────────────────────────────────────────────────── */

export const GABELLE: Record<
  'franchise' | 'mesure' | 'forte',
  { ecus: number; sel: number; unrest: number; reputation: number; label: string }
> = {
  franchise: { ecus: 0, sel: 2, unrest: -3, reputation: 2, label: 'Franchise' },
  mesure: { ecus: 350, sel: 4, unrest: 1, reputation: 0, label: 'Droit mesuré' },
  forte: { ecus: 900, sel: 8, unrest: 5, reputation: -2, label: 'Forte gabelle' },
};

/* ── Météo ──────────────────────────────────────────────────────────────── */

export const WEATHER_KINDS: readonly WeatherKind[] = [
  'eclaircie',
  'pluie',
  'brume',
  'givre',
  'vent',
];

/** Poids de tirage des fronts météorologiques. */
export const WEATHER_WEIGHTS: Record<WeatherKind, number> = {
  eclaircie: 40,
  pluie: 20,
  brume: 16,
  givre: 12,
  vent: 12,
};

export const WEATHER_LABELS: Record<WeatherKind, string> = {
  eclaircie: 'Éclaircie',
  pluie: 'Pluie',
  brume: 'Brume',
  givre: 'Givre',
  vent: 'Vent des crêtes',
};

/**
 * Modificateurs météorologiques de repli, en BP (10000 = neutre).
 * `moveBp` multiplie le coût de déplacement.
 */
export const WEATHER_FALLBACK: Record<
  WeatherKind,
  { moveBp: number; visionBp: number; rangedBp: number; flyBp: number; flankBp: number }
> = {
  eclaircie: { moveBp: 10000, visionBp: 10000, rangedBp: 10000, flyBp: 10000, flankBp: 10000 },
  pluie: { moveBp: 10700, visionBp: 9200, rangedBp: 9400, flyBp: 9600, flankBp: 10000 },
  brume: { moveBp: 10200, visionBp: 6500, rangedBp: 8000, flyBp: 9800, flankBp: 11500 },
  givre: { moveBp: 10900, visionBp: 9600, rangedBp: 9800, flyBp: 9400, flankBp: 10000 },
  vent: { moveBp: 10100, visionBp: 10400, rangedBp: 8800, flyBp: 11500, flankBp: 10000 },
};

/** Terrain dont le coût est aggravé par un temps donné, et de combien (BP). */
export const WEATHER_TERRAIN_PENALTY: Partial<
  Record<WeatherKind, { terrain: Terrain; bp: number }>
> = {
  pluie: { terrain: 'humide', bp: 11500 },
  givre: { terrain: 'foret', bp: 11800 },
};

/* ── Victoire ───────────────────────────────────────────────────────────── */

/** Nombre de sceaux nécessaires pour ouvrir la Maison du Trésor. */
export const SEALS_REQUIRED = 3;
/** Centres majeurs à tenir pour la victoire « Maître des Marches ». */
export const MASTER_CENTERS_REQUIRED = 5;
/** Durée de tenue pour « Maître des Marches », en jours (deux rondes). */
export const MASTER_HOLD_TURNS = DAYS_PER_RONDE * 2;

/* ── Divers ─────────────────────────────────────────────────────────────── */

/** Longueur maximale du journal conservé dans l'état. */
export const JOURNAL_MAX = 240;

/** Compensation de départ accordée aux joueurs jouant plus tard (doc §14.4). */
export const TURN_ORDER_COMPENSATION_ECUS = 150;

/** Rayon de révélation initiale autour d'une capitale. */
export const START_REVEAL_RADIUS = 12;
