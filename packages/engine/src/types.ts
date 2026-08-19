/**
 * CONTRAT DE DONNÉES DU MOTEUR — Heroes of Might and Magic : Auvergne Edition
 *
 * Ce fichier est le contrat partagé par TOUS les paquets. Il ne dépend d'aucun
 * runtime (ni DOM, ni Node, ni React, ni PixiJS).
 *
 * Règles non négociables :
 *  - Toute valeur simulée est un ENTIER (points de base = /10000 quand ratio).
 *  - Aucun Math.random : le PRNG est injecté et sérialisé dans l'état.
 *  - L'état est muté uniquement par `applyCommand` qui retourne (état, events, hash).
 */

/* ────────────────────────────── Identifiants ────────────────────────────── */

export type PlayerId = 'P1' | 'P2' | 'P3' | 'P4' | 'P5';
export type FactionId = 'granit' | 'ermitage';
export type HeroId = string; // clef de contenu, ex. 'thibaut'
export type HeroUid = string; // instance en partie, ex. 'H3'
export type TownUid = string; // ex. 'T_cervieres'
export type ObjectUid = string; // ex. 'O_1042'
export type CreatureId = string; // ex. 'granit_r3' | 'granit_r3_up'
export type SpellId = string;
export type ArtifactId = string;
export type BuildingId = string;
export type SkillId = string;
export type SealId =
  | 'hautes_futaies'
  | 'farges'
  | 'pamole'
  | 'hermitage'
  | 'brumes';

/* ────────────────────────────── Ressources ──────────────────────────────── */

export const RESOURCE_KEYS = [
  'ecus',
  'bois',
  'granit',
  'fer',
  'sel',
  'essence',
  'filDor',
] as const;
export type ResourceKey = (typeof RESOURCE_KEYS)[number];
export type Resources = Record<ResourceKey, number>;

/* ──────────────────────────────── Carte ─────────────────────────────────── */

export const TERRAINS = [
  'route', // grande chaussée des marchands
  'chemin',
  'prairie',
  'foret',
  'pente',
  'humide',
  'rocher',
  'eau',
  /*
   * Ajouté APRÈS l'eau, jamais avant : les huit premiers indices sont gravés
   * dans les mondes déjà construits et sauvegardés. La falaise est le relief
   * qui ferme les zones (docs/08-PLAN-AAA.md, lots 1.8-1.9) — le seul terrain
   * infranchissable avec l'eau, et sans pont possible. Notre carte n'avait
   * aucun point d'articulation sur 105 349 cases praticables ; HMM3 relie ses
   * zones par des cols étroits, et un col n'existe que si quelque chose de
   * dur le borde.
   */
  'falaise',
] as const;
export type Terrain = (typeof TERRAINS)[number];

/** Coût de marche par case, en points (cf. §8.1 du document maître). */
export const TERRAIN_COST: Record<Terrain, number> = {
  route: 70,
  chemin: 85,
  prairie: 100,
  foret: 125,
  pente: 145,
  humide: 160,
  rocher: 200,
  eau: Number.MAX_SAFE_INTEGER,
  falaise: Number.MAX_SAFE_INTEGER,
};

export const REGIONS = [
  'hauts_arconsat',
  'vallee_durolle',
  'lac_sagnes',
  'maison_tresor',
  'chatellenie_cervieres',
  'futaies_viscomtat',
  'coeur_bois_noirs',
  'pays_noiretable',
  'hermitage_peyrotine',
  'vollore_pamole',
  'marche_renaudie',
  'grande_chaussee',
] as const;
export type RegionId = (typeof REGIONS)[number];

export interface MapCoord {
  col: number;
  row: number;
}

/** Grille logique : 256 colonnes × 416 lignes, ~48 m par case. */
export const MAP_COLS = 256;
export const MAP_ROWS = 416;
export const BLOCK_SIZE = 32;

/**
 * Carte statique, stockée en tableaux typés parallèles (index = row*COLS+col).
 * Elle est produite par @auvergne/map et ne change jamais pendant la partie,
 * à l'exception de `objectAt` (ponts détruits, objets consommés…).
 */
export interface WorldMap {
  cols: number;
  rows: number;
  /** index dans TERRAINS */
  terrain: Uint8Array;
  /** index dans REGIONS */
  region: Uint8Array;
  /** altitude en mètres */
  elevation: Int16Array;
  /** pente en degrés (0-90) */
  slope: Uint8Array;
  /** bitfield: 1=passable, 2=route, 4=pont, 8=constructible, 16=cache autorisée, 32=lisiere */
  flags: Uint16Array;
  /** 0 = vide, sinon index+1 dans `objects` */
  objectAt: Uint32Array;
  objects: MapObject[];
  anchors: MapAnchor[];
}

export const CELL_PASSABLE = 1;
export const CELL_ROAD = 2;
export const CELL_BRIDGE = 4;
export const CELL_BUILDABLE = 8;
export const CELL_CACHE = 16;
export const CELL_EDGE = 32;

export interface MapAnchor {
  key: string;
  label: string;
  lat: number;
  lon: number;
  col: number;
  row: number;
  kind: 'ville' | 'hameau' | 'col' | 'sanctuaire' | 'monument' | 'sommet';
}

export type MapObjectKind =
  | 'ville'
  | 'village'
  | 'mine'
  | 'ressource'
  | 'artefact'
  | 'garde'
  | 'borne'
  | 'sanctuaire'
  | 'auberge'
  | 'caravane'
  | 'sceau'
  | 'maison_tresor'
  | 'belvedere'
  | 'source'
  | 'obstacle'
  | 'quete'
  /*
   * Le catalogue de la densification (docs/08-PLAN-AAA.md, lot 0.1). Chaque
   * nature ci-dessous est la transposition d'une famille de HMM3 dont
   * l'absence était mesurée : zéro recruteur extérieur, zéro objet
   * d'expérience, zéro moral/chance, une seule banque gardée, zéro
   * générateur hebdomadaire, zéro monolithe. Les effets sont branchés dans
   * `world/objects.ts` (lot 1.2) ; un ajout ici sans effet là-bas est un
   * objet de décor, ce que l'audit interdit.
   */
  | 'demeure' // recruteur extérieur : croissance hebdomadaire au propriétaire
  | 'moulin' // générateur : une ressource au premier visiteur de la semaine
  | 'banque' // trésor gardé rejouable (crypte, repaire), repeuplé par période
  | 'monolithe' // téléporteur vers son jumeau, par paire
  | 'obelisque' // révèle une part du secret de la carte, une fois par bannière
  | 'ecole' // +1 caractéristique contre écus, une fois par héros
  | 'temple' // +1 moral pour quelques jours
  | 'fontaine' // fortune tirée au sort, en bien ou en mal
  | 'coffre' // écus ou expérience, au choix du visiteur
  | 'garde_frontiere' // barre un col tant qu'on ne porte pas le laissez-passer
  | 'tente_clef' // délivre le laissez-passer du garde-frontière assorti
  | 'cartographe' // vend la révélation d'une région entière
  | 'marche_noir'; // négoce itinérant à taux défavorable

export interface MapObject {
  uid: ObjectUid;
  kind: MapObjectKind;
  at: MapCoord;
  /** cases occupées (empreinte), incluant `at` */
  footprint: MapCoord[];
  /** case sur laquelle le héros doit arriver pour interagir */
  entrance: MapCoord;
  owner: PlayerId | null;
  /** données spécifiques, validées par le contenu */
  data: Record<string, unknown>;
  /** garde neutre éventuelle */
  guard?: ArmyStack[];
  visitedBy?: PlayerId[];
  spent?: boolean;
}

/* ─────────────────────────────── Créatures ──────────────────────────────── */

export interface CreatureDef {
  id: CreatureId;
  faction: FactionId;
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  upgraded: boolean;
  upgradeOf?: CreatureId;
  name: string;
  namePlural: string;
  hp: number;
  attack: number;
  defense: number;
  dmgMin: number;
  dmgMax: number;
  speed: number;
  initiative: number;
  growth: number;
  cost: Partial<Resources>;
  /** valeur d'IA / de garde neutre */
  power: number;
  size: 1 | 2;
  flying?: boolean;
  shooter?: boolean;
  shots?: number;
  abilities: CreatureAbility[];
  lore: string;
}

export type CreatureAbility =
  | { kind: 'no_retaliation' }
  | { kind: 'no_retaliation_flank' }
  | { kind: 'retaliations'; count: number }
  | { kind: 'charge_bonus'; perHex: number; max: number }
  | { kind: 'knockback'; minHexes: number }
  | { kind: 'slow_on_hit'; bp: number }
  | { kind: 'zone_of_control' }
  | { kind: 'pierce_defense'; bp: number }
  | { kind: 'morale_aura'; value: number }
  | { kind: 'heal_aura'; amount: number }
  | { kind: 'cleanse' }
  | { kind: 'resurrect_after_win'; bp: number }
  | { kind: 'reveal_fortune' }
  | { kind: 'boulder'; uses: number; damage: number }
  | { kind: 'breath_line'; length: number }
  | { kind: 'poison'; bp: number; turns: number }
  | { kind: 'stealth' }
  | { kind: 'range_penalty_immune' }
  | { kind: 'siege_bonus'; bp: number }
  | { kind: 'terrain_bonus'; terrain: Terrain; attackBp: number; defenseBp: number };

export interface ArmyStack {
  creature: CreatureId;
  count: number;
}

/* ───────────────────────────────── Héros ────────────────────────────────── */

export interface HeroDef {
  id: HeroId;
  name: string;
  faction: FactionId | 'neutre';
  class: string; // Castellan, Sénéchal, Prieure, Veneuse…
  title: string; // spécialité affichée
  specialty: HeroSpecialty;
  portrait: string; // clef d'atlas
  bio: string;
  start: {
    vaillance: number;
    garde: number;
    mystique: number;
    savoir: number;
    skills: { skill: SkillId; rank: SkillRank }[];
    army: ArmyStack[];
    spells: SpellId[];
  };
  /** poids de tirage des compétences à la montée de niveau (0-100) */
  skillWeights: Partial<Record<SkillId, number>>;
}

export type HeroSpecialty =
  | { kind: 'creature'; creature: CreatureId; perLevelBp: number }
  | { kind: 'spell'; spell: SpellId; costBp: number; durationBonus: number }
  | { kind: 'school'; school: SpellSchool; costBp: number }
  | { kind: 'skill'; skill: SkillId; bonusBp: number }
  | { kind: 'resource'; resource: ResourceKey; perDay: number }
  | { kind: 'movement'; bonus: number }
  | { kind: 'siege'; bp: number }
  | { kind: 'vision'; bonus: number }
  | { kind: 'weather' }
  | { kind: 'diplomacy'; bp: number }
  | { kind: 'build_discount'; bp: number };

export type SkillRank = 1 | 2 | 3; // Novice, Expert, Maître

export interface SkillDef {
  id: SkillId;
  name: string;
  icon: string;
  description: string;
  ranks: [string, string, string];
  effects: [SkillEffect[], SkillEffect[], SkillEffect[]];
}

export type SkillEffect =
  | { kind: 'movement'; value: number }
  | { kind: 'movement_bp'; bp: number }
  | { kind: 'vision'; value: number }
  | { kind: 'morale'; value: number }
  | { kind: 'fortune'; value: number }
  | { kind: 'mana_max_bp'; bp: number }
  | { kind: 'mana_regen'; value: number }
  | { kind: 'spell_power_bp'; bp: number }
  | { kind: 'trade_bp'; bp: number }
  | { kind: 'income_bp'; bp: number }
  | { kind: 'build_cost_bp'; bp: number }
  | { kind: 'tactics_rows'; value: number }
  | { kind: 'first_strike_bp'; bp: number }
  | { kind: 'defense_bp'; bp: number }
  | { kind: 'siege_damage_bp'; bp: number }
  | { kind: 'heal_bp'; bp: number }
  | { kind: 'terrain_cost_bp'; terrain: Terrain; bp: number }
  | { kind: 'flank_bp'; bp: number }
  | { kind: 'resist_bp'; bp: number }
  | { kind: 'summon_bp'; bp: number }
  | { kind: 'xp_bp'; bp: number };

export interface HeroInstance {
  uid: HeroUid;
  def: HeroId;
  owner: PlayerId;
  level: number;
  xp: number;
  vaillance: number;
  garde: number;
  mystique: number;
  savoir: number;
  mana: number;
  manaMax: number;
  movement: number;
  movementMax: number;
  at: MapCoord;
  /** direction 0..7 pour l'animation, 0 = nord, sens horaire */
  facing: number;
  army: (ArmyStack | null)[]; // 7 emplacements
  artifacts: Partial<Record<ArtifactSlot, ArtifactId>>;
  backpack: ArtifactId[];
  skills: { skill: SkillId; rank: SkillRank }[];
  spells: SpellId[];
  inTown: TownUid | null;
  /** jours d'indisponibilité après défaite */
  downUntilTurn: number;
  pendingLevelUp: { choices: [SkillOffer, SkillOffer]; primary: PrimaryStat } | null;
  path: MapCoord[] | null;
  /**
   * Bénédictions temporaires gagnées en visitant la carte — l'oratoire donne
   * du moral, la fontaine aux fées de la fortune, en bien ou en mal. Chacune
   * expire à un jour donné et disparaît d'elle-même. Optionnel pour que les
   * sauvegardes antérieures se chargent telles quelles.
   */
  benedictions?: BenedictionDeVisite[];
}

export interface BenedictionDeVisite {
  kind: 'morale' | 'fortune';
  value: number;
  /** Dernier jour où la bénédiction agit (state.turn inclus). */
  jusquau: number;
  /** Lieu d'origine, pour interdire le cumul du même oratoire. */
  source: ObjectUid;
}

export interface SkillOffer {
  skill: SkillId;
  rank: SkillRank;
}
export type PrimaryStat = 'vaillance' | 'garde' | 'mystique' | 'savoir';

export type ArtifactSlot =
  | 'tete'
  | 'cou'
  | 'torse'
  | 'mains'
  | 'anneau1'
  | 'anneau2'
  | 'ceinture'
  | 'pieds'
  | 'banniere'
  | 'relique';

export interface ArtifactDef {
  id: ArtifactId;
  name: string;
  slot: ArtifactSlot;
  rarity: 'commun' | 'rare' | 'majeur' | 'relique';
  effects: SkillEffect[];
  primary?: Partial<Record<PrimaryStat, number>>;
  setId?: string;
  lore: string;
  icon: string;
}

/* ───────────────────────────────── Magie ────────────────────────────────── */

export type SpellSchool = 'braises' | 'sources' | 'brumes' | 'racines';

export interface SpellDef {
  id: SpellId;
  school: SpellSchool;
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  name: string;
  cost: number;
  target:
    | 'ally_stack'
    | 'enemy_stack'
    | 'any_stack'
    | 'hex'
    | 'line'
    | 'all_allies'
    | 'all_enemies'
    | 'battlefield'
    | 'adventure';
  scope: 'combat' | 'aventure' | 'les_deux';
  /** effets encodés en données, jamais en code d'interface */
  effects: SpellEffect[];
  description: string;
  icon: string;
}

export type SpellEffect =
  | { kind: 'damage'; base: number; perMystique: number; element: SpellSchool }
  | { kind: 'heal'; base: number; perMystique: number; resurrect: boolean }
  | { kind: 'buff'; stat: 'attack' | 'defense' | 'speed' | 'initiative'; value: number; turns: number }
  | { kind: 'debuff'; stat: 'attack' | 'defense' | 'speed' | 'initiative'; value: number; turns: number }
  | { kind: 'shield'; bp: number; turns: number }
  | { kind: 'root'; turns: number }
  | { kind: 'blind'; turns: number }
  | { kind: 'summon'; creature: CreatureId; base: number; perMystique: number }
  | { kind: 'teleport' }
  | { kind: 'swap' }
  | { kind: 'wall'; hexes: number; turns: number; damage: number }
  | { kind: 'dispel' }
  | { kind: 'vision'; radius: number }
  | { kind: 'movement'; value: number }
  | { kind: 'weather_shift' }
  | { kind: 'reveal_map'; radius: number };

/* ──────────────────────────────── Cités ─────────────────────────────────── */

export interface BuildingDef {
  id: BuildingId;
  faction: FactionId | 'commun';
  name: string;
  description: string;
  cost: Partial<Resources>;
  requires: BuildingId[];
  /** niveau dans une chaîne (fort → rempart → tours) */
  chain?: string;
  chainLevel?: number;
  grants: BuildingGrant[];
  /** position sur le tableau de cité, en pourcentage de la largeur/hauteur */
  scene: { x: number; y: number; z: number; scale: number };
}

export type BuildingGrant =
  | { kind: 'dwelling'; creature: CreatureId; growth: number }
  | { kind: 'upgrade'; from: CreatureId; to: CreatureId }
  | { kind: 'income'; resource: ResourceKey; amount: number }
  | { kind: 'mage_guild'; level: number }
  | { kind: 'defense'; walls: number; towers: number; gate: boolean }
  | { kind: 'tavern' }
  | { kind: 'market' }
  | { kind: 'blacksmith' }
  | { kind: 'stables'; movement: number }
  | { kind: 'mana'; amount: number }
  | { kind: 'growth_bp'; bp: number }
  | { kind: 'morale'; value: number }
  | { kind: 'special'; key: string };

export type Charter = 'marchande' | 'militaire' | 'spirituelle';

export interface TownState {
  uid: TownUid;
  name: string;
  faction: FactionId;
  owner: PlayerId | null;
  at: MapCoord;
  built: BuildingId[];
  builtThisTurn: boolean;
  /** créatures disponibles au recrutement, par CreatureId */
  available: Record<CreatureId, number>;
  garrison: (ArmyStack | null)[];
  visitingHero: HeroUid | null;
  garrisonHero: HeroUid | null;
  spells: SpellId[];
  charter: Charter | null;
  isCapital: boolean;
  /** agitation liée à la gabelle, 0..100 */
  unrest: number;
}

/* ─────────────────────────────── Joueurs ────────────────────────────────── */

export interface PlayerState {
  id: PlayerId;
  name: string;
  faction: FactionId;
  color: string;
  pattern: number; // motif d'accessibilité 0..4
  kind: 'humain' | 'ia';
  aiProfile?: 'prudent' | 'equilibre' | 'agressif' | 'expert';
  resources: Resources;
  heroes: HeroUid[];
  towns: TownUid[];
  /** 0=inconnu, 1=exploré, 2=visible ; longueur cols*rows */
  fog: Uint8Array;
  seals: SealId[];
  alive: boolean;
  reputation: number;
  /** file d'attente de constructions prévisionnelles (multijoueur) */
  buildQueue: { town: TownUid; building: BuildingId }[];
  tavernOffers: HeroId[];
  defeatedAtTurn?: number;
  /**
   * Jour où la bannière a perdu sa dernière cité, effacé dès qu'elle en
   * reprend une. Règle des sept jours de HMM3 : sans cité, il reste sept
   * jours pour en reprendre une, héros ou pas — sinon la maison s'éteint.
   * Optionnel pour que les sauvegardes antérieures se chargent telles quelles.
   */
  sansCiteDepuis?: number;
}

/* ─────────────────────────────── Météo ──────────────────────────────────── */

export type WeatherKind = 'eclaircie' | 'pluie' | 'brume' | 'givre' | 'vent';

export interface WeatherState {
  current: WeatherKind;
  /** prévisions pour J+1 et J+2 (annoncées deux jours à l'avance) */
  forecast: [WeatherKind, WeatherKind];
  delayedBy: PlayerId | null;
}

export type GabellePolicy = 'franchise' | 'mesure' | 'forte';

/* ─────────────────────────────── Combat ─────────────────────────────────── */

export const HEX_COLS = 15;
export const HEX_ROWS = 11;

export interface HexCoord {
  col: number;
  row: number;
}

export interface CombatUnit {
  uid: string;
  side: 0 | 1;
  slot: number;
  creature: CreatureId;
  count: number;
  startCount: number;
  /** PV de la créature de tête */
  topHp: number;
  at: HexCoord;
  facing: number;
  attack: number;
  defense: number;
  speed: number;
  initiative: number;
  shots: number;
  morale: number;
  fortune: number;
  hasMoved: boolean;
  hasWaited: boolean;
  retaliationsLeft: number;
  defending: boolean;
  effects: CombatEffect[];
  alive: boolean;
  /** hexes parcourus lors du dernier déplacement (charge) */
  lastMoveDistance: number;
}

export interface CombatEffect {
  id: string;
  kind: SpellEffect['kind'] | 'formation' | 'terrain';
  stat?: string;
  value: number;
  turnsLeft: number;
  source: string;
}

export interface CombatObstacle {
  at: HexCoord;
  kind: 'rocher' | 'souche' | 'ronce' | 'mur' | 'porte' | 'tour' | 'fosse';
  /** pour les sièges : 0=intact, 1=fissuré, 2=effondré */
  state?: 0 | 1 | 2;
  hp?: number;
  blocksMove: boolean;
  blocksSight: boolean;
}

export interface CombatState {
  id: string;
  attacker: { player: PlayerId; hero: HeroUid | null };
  defender: { player: PlayerId | null; hero: HeroUid | null; town: TownUid | null };
  units: CombatUnit[];
  obstacles: CombatObstacle[];
  terrain: Terrain;
  region: RegionId;
  weather: WeatherKind;
  siege: boolean;
  round: number;
  /** file d'initiative : uids dans l'ordre d'activation du round */
  order: string[];
  activeIndex: number;
  spellCastThisRound: Record<PlayerId, boolean>;
  log: CombatLogEntry[];
  finished: boolean;
  winner: 0 | 1 | null;
  /** butin déterminé à la résolution */
  loot?: { resources: Partial<Resources>; artifacts: ArtifactId[]; xp: number };
}

export interface CombatLogEntry {
  round: number;
  text: string;
  kind: 'attaque' | 'sort' | 'mort' | 'moral' | 'fortune' | 'capacite' | 'info';
  detail?: Record<string, number | string>;
}

/* ──────────────────────────── Commandes / Events ────────────────────────── */

export type Command =
  | { type: 'StartGame'; setup: GameSetup }
  | { type: 'MoveHero'; hero: HeroUid; to: MapCoord }
  | { type: 'HeroInteract'; hero: HeroUid; object: ObjectUid }
  | { type: 'BuildInTown'; town: TownUid; building: BuildingId }
  | { type: 'RecruitCreatures'; town: TownUid; creature: CreatureId; count: number; toHero?: HeroUid }
  | { type: 'UpgradeCreatures'; town: TownUid; from: CreatureId; count: number }
  | { type: 'HireHero'; town: TownUid; hero: HeroId }
  | { type: 'SwapArmy'; a: ArmyHolderRef; b: ArmyHolderRef; slotA: number; slotB: number; count?: number }
  | { type: 'EquipArtifact'; hero: HeroUid; artifact: ArtifactId; slot: ArtifactSlot }
  | { type: 'UnequipArtifact'; hero: HeroUid; slot: ArtifactSlot }
  | { type: 'CastAdventureSpell'; hero: HeroUid; spell: SpellId; target?: MapCoord }
  | { type: 'ChooseLevelUp'; hero: HeroUid; skill: SkillId }
  | { type: 'SetCharter'; town: TownUid; charter: Charter }
  | { type: 'SetGabelle'; policy: GabellePolicy }
  | { type: 'TradeResources'; give: ResourceKey; giveAmount: number; take: ResourceKey }
  | { type: 'UseBorne'; hero: HeroUid; to: ObjectUid }
  | { type: 'CombatAction'; action: CombatAction }
  | { type: 'AutoResolveCombat' }
  | { type: 'EndTurn' }
  | { type: 'Surrender' };

export type ArmyHolderRef =
  | { kind: 'hero'; uid: HeroUid }
  | { kind: 'garrison'; uid: TownUid };

export type CombatAction =
  | { kind: 'move'; unit: string; to: HexCoord }
  | { kind: 'attack'; unit: string; target: string; from?: HexCoord }
  | { kind: 'shoot'; unit: string; target: string }
  | { kind: 'wait'; unit: string }
  | { kind: 'defend'; unit: string }
  | { kind: 'ability'; unit: string; target?: HexCoord | string }
  | { kind: 'cast'; spell: SpellId; target?: HexCoord | string }
  | { kind: 'surrender' };

export interface GameSetup {
  seed: number;
  mapVersion: string;
  contentVersion: string;
  duration: 'eclair' | 'standard' | 'saga';
  victory: 'couronne' | 'derniere_banniere' | 'maitre_marches' | 'chronique';
  players: {
    id: PlayerId;
    name: string;
    faction: FactionId;
    kind: 'humain' | 'ia';
    aiProfile?: 'prudent' | 'equilibre' | 'agressif' | 'expert';
    start: 'arconsat' | 'viscomtat' | 'cervieres' | 'noiretable' | 'renaudie';
    hero: HeroId;
  }[];
}

export type GameEvent =
  | { type: 'GameStarted'; turn: number }
  | { type: 'TurnStarted'; player: PlayerId; turn: number; day: number; week: number }
  | { type: 'TurnEnded'; player: PlayerId }
  | { type: 'WeekPassed'; week: number; eventKey: string | null }
  | { type: 'HeroMoved'; hero: HeroUid; path: MapCoord[]; costSpent: number }
  | { type: 'HeroBlocked'; hero: HeroUid; reason: string }
  | { type: 'FogRevealed'; player: PlayerId; cells: number[] }
  | { type: 'ObjectVisited'; hero: HeroUid; object: ObjectUid; result: string }
  | { type: 'ResourcesChanged'; player: PlayerId; delta: Partial<Resources>; reason: string }
  | { type: 'BuildingBuilt'; town: TownUid; building: BuildingId }
  | { type: 'CreaturesRecruited'; town: TownUid; creature: CreatureId; count: number }
  | { type: 'HeroHired'; player: PlayerId; hero: HeroUid }
  | { type: 'HeroLeveled'; hero: HeroUid; level: number; primary: PrimaryStat }
  | { type: 'CombatStarted'; combat: string }
  | { type: 'CombatAction'; entry: CombatLogEntry }
  | { type: 'CombatEnded'; winner: 0 | 1; survivorsA: ArmyStack[]; survivorsB: ArmyStack[] }
  | { type: 'TownCaptured'; town: TownUid; by: PlayerId }
  | { type: 'SealTaken'; seal: SealId; by: PlayerId }
  | { type: 'ClaimStarted'; by: PlayerId; endsAtTurn: number }
  | { type: 'ClaimBroken'; by: PlayerId }
  | { type: 'WeatherChanged'; current: WeatherKind; forecast: [WeatherKind, WeatherKind] }
  | { type: 'PlayerDefeated'; player: PlayerId }
  | { type: 'GameEnded'; winner: PlayerId | null; reason: string }
  | { type: 'Notice'; player: PlayerId | null; text: string; severity: 'info' | 'warn' | 'danger' };

/* ────────────────────────────── État global ─────────────────────────────── */

export interface RngState {
  hi: number;
  lo: number;
  inchi: number;
  inclo: number;
}

export interface ClaimState {
  by: PlayerId;
  startedTurn: number;
  endsAtTurn: number;
}

export interface GameConfig {
  duration: 'eclair' | 'standard' | 'saga';
  victory: 'couronne' | 'derniere_banniere' | 'maitre_marches' | 'chronique';
  maxWeeks: number;
  heroLimit: number;
  turnTimerSeconds: number | null;
}

export interface GameState {
  engineVersion: string;
  contentVersion: string;
  mapVersion: string;
  id: string;
  seed: number;
  rng: RngState;
  /** jour absolu, 1-based */
  turn: number;
  activePlayer: PlayerId;
  turnOrder: PlayerId[];
  players: Record<PlayerId, PlayerState>;
  heroes: Record<HeroUid, HeroInstance>;
  towns: Record<TownUid, TownState>;
  objects: Record<ObjectUid, MapObject>;
  weather: WeatherState;
  gabelle: GabellePolicy;
  seals: Record<SealId, { owner: PlayerId | null; at: MapCoord }>;
  claim: ClaimState | null;
  phase: 'setup' | 'aventure' | 'combat' | 'termine';
  combat: CombatState | null;
  winner: PlayerId | null;
  endReason: string | null;
  nextUid: number;
  /** journal court affiché au joueur */
  journal: { turn: number; player: PlayerId | null; text: string; kind: string }[];
  hash: string;
}

export interface CommandResult {
  state: GameState;
  events: GameEvent[];
  ok: boolean;
  error?: string;
}

/* ────────────────────────────── Utilitaires ─────────────────────────────── */

export const BP = 10000;

export function emptyResources(): Resources {
  return { ecus: 0, bois: 0, granit: 0, fer: 0, sel: 0, essence: 0, filDor: 0 };
}

export function dayOf(turn: number): number {
  return ((turn - 1) % 7) + 1;
}
export function weekOf(turn: number): number {
  return Math.floor((turn - 1) / 7) + 1;
}
/** une « ronde » = 4 semaines */
export function rondeOf(turn: number): number {
  return Math.floor((turn - 1) / 28) + 1;
}

export function cellIndex(col: number, row: number, cols = MAP_COLS): number {
  return row * cols + col;
}
