/**
 * Contenu de secours du noyau.
 *
 * Ce jeu de données n'est **pas** le contenu du jeu : celui-ci vit dans
 * `packages/content`. Il s'agit d'un contenu minimal mais complet et cohérent,
 * utilisé tant que `linkEngineModules({ content })` n'a pas été appelé, afin
 * que le noyau reste jouable, testable et déterministe de façon autonome.
 *
 * Les chiffres reprennent les statistiques de prototype du document maître
 * (§5.1 et §5.2). Dès que `@auvergne/content` est branché, tout ceci est
 * intégralement remplacé.
 */
import type {
  ArtifactDef,
  ArtifactId,
  BuildingDef,
  BuildingGrant,
  BuildingId,
  CreatureAbility,
  CreatureDef,
  CreatureId,
  FactionId,
  HeroDef,
  HeroId,
  Resources,
  SkillDef,
  SkillEffect,
  SkillId,
  SpellDef,
  SpellId,
  SpellSchool,
} from '../types.js';
import type { ContentPack, FactionDef, GuardTemplate, WeekEventDef } from './registry.js';

export const FALLBACK_CONTENT_VERSION = '0.0.0-secours';

/* ── Créatures ──────────────────────────────────────────────────────────── */

interface CreatureRow {
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  name: string;
  plural: string;
  upName: string;
  upPlural: string;
  hp: number;
  attack: number;
  defense: number;
  dmgMin: number;
  dmgMax: number;
  speed: number;
  initiative: number;
  growth: number;
  flying?: boolean;
  shooter?: boolean;
  shots?: number;
  abilities: CreatureAbility[];
  upAbilities: CreatureAbility[];
  lore: string;
}

const GRANIT_ROWS: CreatureRow[] = [
  {
    tier: 1,
    name: 'Manant',
    plural: 'Manants',
    upName: 'Franc-Serf',
    upPlural: 'Francs-Serfs',
    hp: 4,
    attack: 2,
    defense: 2,
    dmgMin: 1,
    dmgMax: 2,
    speed: 4,
    initiative: 8,
    growth: 18,
    abilities: [],
    upAbilities: [{ kind: 'knockback', minHexes: 3 }],
    lore: "Levée de corvée des vallées, armée d'une fourche et d'une obstination de granit.",
  },
  {
    tier: 2,
    name: 'Gabelou',
    plural: 'Gabelous',
    upName: 'Prévôt du Sel',
    upPlural: 'Prévôts du Sel',
    hp: 12,
    attack: 5,
    defense: 6,
    dmgMin: 2,
    dmgMax: 4,
    speed: 5,
    initiative: 9,
    growth: 12,
    abilities: [{ kind: 'slow_on_hit', bp: 1200 }],
    upAbilities: [{ kind: 'slow_on_hit', bp: 1800 }, { kind: 'zone_of_control' }],
    lore: 'Commis du grenier à sel, plus redouté qu’un sergent d’armes.',
  },
  {
    tier: 3,
    name: 'Arbalétrier des Farges',
    plural: 'Arbalétriers des Farges',
    upName: 'Maître-Arbalétrier',
    upPlural: 'Maîtres-Arbalétriers',
    hp: 20,
    attack: 8,
    defense: 6,
    dmgMin: 4,
    dmgMax: 7,
    speed: 5,
    initiative: 9,
    growth: 8,
    shooter: true,
    shots: 12,
    abilities: [{ kind: 'slow_on_hit', bp: 800 }],
    upAbilities: [{ kind: 'pierce_defense', bp: 2000 }],
    lore: 'Formé sous la porte des Farges, où l’on compte les carreaux avant les prières.',
  },
  {
    tier: 4,
    name: "Grenadière d'Or",
    plural: "Grenadières d'Or",
    upName: "Dame au Fil d'Or",
    upPlural: "Dames au Fil d'Or",
    hp: 34,
    attack: 10,
    defense: 12,
    dmgMin: 6,
    dmgMax: 10,
    speed: 6,
    initiative: 10,
    growth: 6,
    abilities: [{ kind: 'morale_aura', value: 1 }],
    upAbilities: [{ kind: 'morale_aura', value: 2 }, { kind: 'cleanse' }],
    lore: 'Brodeuse de guerre : son emblème en grenade tient les rangs plus sûrement qu’un mur.',
  },
  {
    tier: 5,
    name: 'Sanglier Cuirassé',
    plural: 'Sangliers Cuirassés',
    upName: 'Verrat de Granit',
    upPlural: 'Verrats de Granit',
    hp: 65,
    attack: 15,
    defense: 14,
    dmgMin: 11,
    dmgMax: 17,
    speed: 8,
    initiative: 10,
    growth: 4,
    abilities: [{ kind: 'charge_bonus', perHex: 500, max: 4000 }],
    upAbilities: [
      { kind: 'charge_bonus', perHex: 700, max: 5600 },
      { kind: 'knockback', minHexes: 4 },
    ],
    lore: 'Nourri au gland des hêtraies et bardé de plaques d’ardoise.',
  },
  {
    tier: 6,
    name: 'Chevalier du Forez',
    plural: 'Chevaliers du Forez',
    upName: 'Banneret de Cervières',
    upPlural: 'Bannerets de Cervières',
    hp: 115,
    attack: 20,
    defense: 19,
    dmgMin: 20,
    dmgMax: 30,
    speed: 9,
    initiative: 11,
    growth: 2,
    abilities: [{ kind: 'charge_bonus', perHex: 400, max: 3200 }],
    upAbilities: [{ kind: 'morale_aura', value: 2 }, { kind: 'charge_bonus', perHex: 400, max: 3200 }],
    lore: 'Il jure sur la pierre levée, jamais sur sa propre vie.',
  },
  {
    tier: 7,
    name: 'Griffon de Pamole',
    plural: 'Griffons de Pamole',
    upName: 'Griffon Couronné',
    upPlural: 'Griffons Couronnés',
    hp: 235,
    attack: 27,
    defense: 25,
    dmgMin: 38,
    dmgMax: 55,
    speed: 11,
    initiative: 13,
    growth: 1,
    flying: true,
    abilities: [{ kind: 'retaliations', count: 2 }],
    upAbilities: [{ kind: 'retaliations', count: 3 }, { kind: 'no_retaliation_flank' }],
    lore: 'Il niche dans l’aiguille de Pamole et considère le ciel comme une châtellenie.',
  },
];

const ERMITAGE_ROWS: CreatureRow[] = [
  {
    tier: 1,
    name: 'Pèlerin',
    plural: 'Pèlerins',
    upName: 'Pénitent Blanc',
    upPlural: 'Pénitents Blancs',
    hp: 5,
    attack: 2,
    defense: 3,
    dmgMin: 1,
    dmgMax: 2,
    speed: 4,
    initiative: 8,
    growth: 18,
    abilities: [],
    upAbilities: [{ kind: 'resurrect_after_win', bp: 1500 }],
    lore: 'Il marche depuis si longtemps que la fatigue ne le concerne plus.',
  },
  {
    tier: 2,
    name: 'Chouette Hulotte',
    plural: 'Chouettes Hulottes',
    upName: 'Chouette Oraculaire',
    upPlural: 'Chouettes Oraculaires',
    hp: 11,
    attack: 6,
    defense: 4,
    dmgMin: 2,
    dmgMax: 4,
    speed: 8,
    initiative: 12,
    growth: 12,
    flying: true,
    abilities: [{ kind: 'no_retaliation_flank' }],
    upAbilities: [{ kind: 'no_retaliation_flank' }, { kind: 'reveal_fortune' }],
    lore: 'Les veneurs disent qu’elle compte les vivants avant la bataille.',
  },
  {
    tier: 3,
    name: 'Loup des Bois Noirs',
    plural: 'Loups des Bois Noirs',
    upName: 'Loup des Brumes',
    upPlural: 'Loups des Brumes',
    hp: 22,
    attack: 9,
    defense: 7,
    dmgMin: 4,
    dmgMax: 7,
    speed: 8,
    initiative: 11,
    growth: 8,
    abilities: [{ kind: 'terrain_bonus', terrain: 'foret', attackBp: 11500, defenseBp: 10500 }],
    upAbilities: [
      { kind: 'no_retaliation_flank' },
      { kind: 'terrain_bonus', terrain: 'foret', attackBp: 12000, defenseBp: 11000 },
    ],
    lore: 'La meute chasse en silence et se sépare avant d’être comptée.',
  },
  {
    tier: 4,
    name: 'Veneur Sylvestre',
    plural: 'Veneurs Sylvestres',
    upName: 'Garde-Futaie',
    upPlural: 'Gardes-Futaie',
    hp: 36,
    attack: 11,
    defense: 10,
    dmgMin: 7,
    dmgMax: 11,
    speed: 7,
    initiative: 10,
    growth: 6,
    shooter: true,
    shots: 10,
    abilities: [{ kind: 'stealth' }],
    upAbilities: [{ kind: 'stealth' }, { kind: 'slow_on_hit', bp: 1500 }],
    lore: 'Il connaît chaque layon, y compris ceux que la forêt a refermés.',
  },
  {
    tier: 5,
    name: 'Cerf des Sources',
    plural: 'Cerfs des Sources',
    upName: 'Cerf Miraculeux',
    upPlural: 'Cerfs Miraculeux',
    hp: 70,
    attack: 14,
    defense: 16,
    dmgMin: 11,
    dmgMax: 18,
    speed: 8,
    initiative: 10,
    growth: 4,
    abilities: [{ kind: 'heal_aura', amount: 6 }],
    upAbilities: [{ kind: 'heal_aura', amount: 10 }, { kind: 'cleanse' }],
    lore: 'Sa ramure porte l’eau claire de sept vallons.',
  },
  {
    tier: 6,
    name: 'Colosse de Granite',
    plural: 'Colosses de Granite',
    upName: 'Colosse de Pamole',
    upPlural: 'Colosses de Pamole',
    hp: 130,
    attack: 18,
    defense: 23,
    dmgMin: 20,
    dmgMax: 29,
    speed: 6,
    initiative: 8,
    growth: 2,
    abilities: [{ kind: 'terrain_bonus', terrain: 'rocher', attackBp: 10000, defenseBp: 12000 }],
    upAbilities: [
      { kind: 'boulder', uses: 3, damage: 60 },
      { kind: 'terrain_bonus', terrain: 'rocher', attackBp: 10500, defenseBp: 12500 },
    ],
    lore: 'On l’a taillé dans une pierre qui refusait de tomber.',
  },
  {
    tier: 7,
    name: 'Vouivre de la Durolle',
    plural: 'Vouivres de la Durolle',
    upName: 'Vouivre Couronnée',
    upPlural: 'Vouivres Couronnées',
    hp: 245,
    attack: 28,
    defense: 23,
    dmgMin: 40,
    dmgMax: 58,
    speed: 12,
    initiative: 13,
    growth: 1,
    flying: true,
    abilities: [{ kind: 'poison', bp: 1200, turns: 2 }],
    upAbilities: [
      { kind: 'poison', bp: 1800, turns: 3 },
      { kind: 'breath_line', length: 3 },
    ],
    lore: 'Elle dort sous la rivière et porte son escarboucle comme une couronne.',
  },
];

const TIER_COST: Record<number, { granit: Partial<Resources>; ermitage: Partial<Resources> }> = {
  1: { granit: { ecus: 60 }, ermitage: { ecus: 60 } },
  2: { granit: { ecus: 120 }, ermitage: { ecus: 115 } },
  3: { granit: { ecus: 220, fer: 1 }, ermitage: { ecus: 220, essence: 1 } },
  4: { granit: { ecus: 400, fer: 2 }, ermitage: { ecus: 400, essence: 2 } },
  5: { granit: { ecus: 750, fer: 3 }, ermitage: { ecus: 750, essence: 3 } },
  6: { granit: { ecus: 1400, fer: 5, filDor: 1 }, ermitage: { ecus: 1400, essence: 5, sel: 1 } },
  7: { granit: { ecus: 2800, fer: 8, filDor: 3 }, ermitage: { ecus: 2800, essence: 8, sel: 3 } },
};

const TIER_POWER: Record<number, number> = {
  1: 100,
  2: 200,
  3: 420,
  4: 850,
  5: 1700,
  6: 3400,
  7: 7000,
};

function up(n: number): number {
  return Math.ceil((n * 112) / 100);
}

function bumpCost(cost: Partial<Resources>): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const k of Object.keys(cost) as (keyof Resources)[]) {
    out[k] = Math.ceil(((cost[k] as number) * 130) / 100);
  }
  return out;
}

function buildCreatures(): Record<CreatureId, CreatureDef> {
  const out: Record<CreatureId, CreatureDef> = {};
  const table: [FactionId, CreatureRow[]][] = [
    ['granit', GRANIT_ROWS],
    ['ermitage', ERMITAGE_ROWS],
  ];
  for (const [faction, rows] of table) {
    for (const r of rows) {
      const baseId = `${faction}_t${r.tier}`;
      const upId = `${baseId}_up`;
      const cost = TIER_COST[r.tier][faction];
      const base: CreatureDef = {
        id: baseId,
        faction,
        tier: r.tier,
        upgraded: false,
        name: r.name,
        namePlural: r.plural,
        hp: r.hp,
        attack: r.attack,
        defense: r.defense,
        dmgMin: r.dmgMin,
        dmgMax: r.dmgMax,
        speed: r.speed,
        initiative: r.initiative,
        growth: r.growth,
        cost,
        power: TIER_POWER[r.tier],
        size: r.tier >= 5 ? 2 : 1,
        abilities: r.abilities,
        lore: r.lore,
      };
      if (r.flying) base.flying = true;
      if (r.shooter) {
        base.shooter = true;
        base.shots = r.shots ?? 8;
      }
      out[baseId] = base;

      const upgraded: CreatureDef = {
        ...base,
        id: upId,
        upgraded: true,
        upgradeOf: baseId,
        name: r.upName,
        namePlural: r.upPlural,
        hp: up(r.hp),
        attack: r.attack + 2,
        defense: r.defense + 2,
        dmgMin: up(r.dmgMin),
        dmgMax: up(r.dmgMax),
        speed: Math.min(13, r.speed + 1),
        initiative: r.initiative + 1,
        cost: bumpCost(cost),
        power: Math.ceil((TIER_POWER[r.tier] * 118) / 100),
        abilities: r.upAbilities,
      };
      if (r.shooter) upgraded.shots = (r.shots ?? 8) + 4;
      out[upId] = upgraded;
    }
  }
  return out;
}

/* ── Bâtiments ──────────────────────────────────────────────────────────── */

function scene(x: number, y: number, z: number, s = 100): BuildingDef['scene'] {
  return { x, y, z, scale: s };
}

function commonBuildings(): BuildingDef[] {
  return [
    {
      id: 'salle_comptes_1',
      faction: 'commun',
      name: 'Salle des comptes',
      description: 'Le registre des tailles et des cens. Augmente le revenu quotidien.',
      cost: { ecus: 2500 },
      requires: [],
      chain: 'comptes',
      chainLevel: 1,
      grants: [{ kind: 'income', resource: 'ecus', amount: 500 }],
      scene: scene(46, 62, 2),
    },
    {
      id: 'salle_comptes_2',
      faction: 'commun',
      name: 'Chambre des comptes',
      description: 'Deux clercs de plus, et la moitié des dettes retrouvée.',
      cost: { ecus: 5000 },
      requires: ['salle_comptes_1'],
      chain: 'comptes',
      chainLevel: 2,
      grants: [{ kind: 'income', resource: 'ecus', amount: 500 }],
      scene: scene(46, 60, 2),
    },
    {
      id: 'salle_comptes_3',
      faction: 'commun',
      name: 'Grand livre du comté',
      description: 'Le comté sait enfin ce qu’il possède.',
      cost: { ecus: 10000, granit: 10 },
      requires: ['salle_comptes_2'],
      chain: 'comptes',
      chainLevel: 3,
      grants: [{ kind: 'income', resource: 'ecus', amount: 1000 }],
      scene: scene(46, 58, 3),
    },
    {
      id: 'taverne',
      faction: 'commun',
      name: 'Auberge des Bannières',
      description: 'On y recrute des capitaines et on y écoute les nouvelles.',
      cost: { ecus: 750, bois: 5 },
      requires: [],
      grants: [{ kind: 'tavern' }, { kind: 'morale', value: 1 }],
      scene: scene(30, 70, 1),
    },
    {
      id: 'marche',
      faction: 'commun',
      name: 'Marché',
      description: 'Étals, poids et mesures : les ressources s’échangent enfin sans perte excessive.',
      cost: { ecus: 1200, bois: 8 },
      requires: [],
      grants: [{ kind: 'market' }],
      scene: scene(36, 68, 1),
    },
    {
      id: 'halle_sel',
      faction: 'commun',
      name: 'Halle du Sel',
      description: 'Un grenier scellé, deux gabelous et une rente régulière.',
      cost: { ecus: 1800, bois: 6, granit: 6 },
      requires: ['marche'],
      grants: [{ kind: 'income', resource: 'sel', amount: 2 }],
      scene: scene(40, 72, 1),
    },
    {
      id: 'forge',
      faction: 'commun',
      name: 'Forge comtale',
      description: 'Ferrures, carreaux et lames : les troupes frappent plus juste.',
      cost: { ecus: 1500, fer: 5 },
      requires: [],
      grants: [{ kind: 'blacksmith' }],
      scene: scene(54, 66, 2),
    },
    {
      id: 'ecuries',
      faction: 'commun',
      name: 'Écuries du Forez',
      description: 'Chevaux frais : les héros partant d’ici marchent plus loin.',
      cost: { ecus: 2000, bois: 10 },
      requires: [],
      grants: [{ kind: 'stables', movement: 300 }],
      scene: scene(62, 70, 1),
    },
    {
      id: 'guilde_1',
      faction: 'commun',
      name: 'Guilde des Arts, premier cercle',
      description: 'Deux sorts du premier degré, recopiés à la chandelle.',
      cost: { ecus: 2000, bois: 5, essence: 2 },
      requires: [],
      chain: 'guilde',
      chainLevel: 1,
      grants: [{ kind: 'mage_guild', level: 1 }, { kind: 'mana', amount: 2 }],
      scene: scene(70, 54, 3),
    },
    {
      id: 'guilde_2',
      faction: 'commun',
      name: 'Guilde des Arts, deuxième cercle',
      description: 'Les degrés supérieurs demandent du silence et de l’essence.',
      cost: { ecus: 3000, essence: 4 },
      requires: ['guilde_1'],
      chain: 'guilde',
      chainLevel: 2,
      grants: [{ kind: 'mage_guild', level: 2 }],
      scene: scene(70, 52, 3),
    },
    {
      id: 'guilde_3',
      faction: 'commun',
      name: 'Guilde des Arts, troisième cercle',
      description: 'On y discute des brumes comme d’une matière première.',
      cost: { ecus: 4500, essence: 6, granit: 5 },
      requires: ['guilde_2'],
      chain: 'guilde',
      chainLevel: 3,
      grants: [{ kind: 'mage_guild', level: 3 }, { kind: 'mana', amount: 2 }],
      scene: scene(70, 50, 3),
    },
    {
      id: 'guilde_4',
      faction: 'commun',
      name: 'Guilde des Arts, quatrième cercle',
      description: 'Le cercle des maîtres, où l’on n’entre pas sans y être appelé.',
      cost: { ecus: 6500, essence: 8, granit: 8 },
      requires: ['guilde_3'],
      chain: 'guilde',
      chainLevel: 4,
      grants: [{ kind: 'mage_guild', level: 4 }],
      scene: scene(70, 48, 4),
    },
    {
      id: 'guilde_5',
      faction: 'commun',
      name: 'Guilde des Arts, cinquième cercle',
      description: 'La bibliothèque haute : huit degrés, et le vent des crêtes.',
      cost: { ecus: 9000, essence: 12, granit: 12 },
      requires: ['guilde_4'],
      chain: 'guilde',
      chainLevel: 5,
      grants: [{ kind: 'mage_guild', level: 5 }, { kind: 'mana', amount: 4 }],
      scene: scene(70, 46, 4),
    },
    {
      id: 'palissade',
      faction: 'commun',
      name: 'Palissade',
      description: 'Des pieux, un fossé, et déjà beaucoup de temps gagné.',
      cost: { ecus: 1000, bois: 12 },
      requires: [],
      chain: 'defense',
      chainLevel: 1,
      grants: [{ kind: 'defense', walls: 1, towers: 0, gate: true }],
      scene: scene(20, 78, 0),
    },
    {
      id: 'rempart',
      faction: 'commun',
      name: 'Rempart de granit',
      description: 'Trois segments de mur, une porte ferrée.',
      cost: { ecus: 3500, granit: 15 },
      requires: ['palissade'],
      chain: 'defense',
      chainLevel: 2,
      grants: [{ kind: 'defense', walls: 2, towers: 1, gate: true }],
      scene: scene(20, 76, 0),
    },
    {
      id: 'tours',
      faction: 'commun',
      name: 'Tours de guet',
      description: 'Deux tours qui tirent d’elles-mêmes sur les assiégeants.',
      cost: { ecus: 6000, granit: 25, fer: 8 },
      requires: ['rempart'],
      chain: 'defense',
      chainLevel: 3,
      grants: [{ kind: 'defense', walls: 3, towers: 2, gate: true }, { kind: 'morale', value: 1 }],
      scene: scene(20, 74, 1),
    },
    {
      /* Les deux paliers de croissance de HMM3 : +50 % puis +100 % sur la
         croissance de base des demeures, et une tour de plus à chaque fois. */
      id: 'citadelle',
      faction: 'commun',
      name: 'Citadelle',
      description: 'Casernes, magasin d’armes : les demeures fournissent moitié plus.',
      cost: { ecus: 9000, granit: 20, bois: 10 },
      requires: ['tours'],
      chain: 'defense',
      chainLevel: 4,
      grants: [
        { kind: 'defense', walls: 3, towers: 3, gate: true },
        { kind: 'growth_bp', bp: 5000 },
      ],
      scene: scene(20, 72, 1),
    },
    {
      id: 'chateau',
      faction: 'commun',
      name: 'Château comtal',
      description: 'Barbacane et garnison permanente : le recrutement double.',
      cost: { ecus: 15000, granit: 30, bois: 15, fer: 10 },
      requires: ['citadelle'],
      chain: 'defense',
      chainLevel: 5,
      grants: [
        { kind: 'defense', walls: 4, towers: 4, gate: true },
        { kind: 'growth_bp', bp: 5000 },
        { kind: 'morale', value: 1 },
      ],
      scene: scene(20, 70, 1),
    },
  ];
}

const DWELLING_NAMES: Record<FactionId, string[]> = {
  granit: [
    'Corvée du bourg',
    'Grenier à sel',
    'Butte de tir des Farges',
    'Maison des Grenadières',
    'Soue cuirassée',
    'Cour des Bannerets',
    'Aiguille de Pamole',
  ],
  ermitage: [
    'Hospice des Pèlerins',
    'Clairière des Chouettes',
    'Chenil des Brumes',
    'Loge des Veneurs',
    'Bassin des Cerfs',
    'Cercle des Colosses',
    'Nid de la Vouivre',
  ],
};

const DWELLING_COST: Partial<Resources>[] = [
  { ecus: 500, bois: 5 },
  { ecus: 1000, bois: 8 },
  { ecus: 1800, bois: 10, granit: 4 },
  { ecus: 3000, bois: 12, granit: 8 },
  { ecus: 5000, granit: 14, fer: 6 },
  { ecus: 8000, granit: 20, fer: 12 },
  { ecus: 14000, granit: 28, fer: 18, filDor: 6 },
];

function factionBuildings(faction: FactionId): BuildingDef[] {
  const out: BuildingDef[] = [];
  const rows = faction === 'granit' ? GRANIT_ROWS : ERMITAGE_ROWS;
  for (let i = 0; i < 7; i++) {
    const tier = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    const id = `${faction}_demeure_${tier}`;
    const prev = i === 0 ? [] : [`${faction}_demeure_${tier - 1}`];
    out.push({
      id,
      faction,
      name: DWELLING_NAMES[faction][i],
      description: `Recrutement hebdomadaire : ${rows[i].plural}.`,
      cost: DWELLING_COST[i],
      requires: prev,
      chain: 'demeures',
      chainLevel: tier,
      grants: [{ kind: 'dwelling', creature: `${faction}_t${tier}`, growth: rows[i].growth }],
      scene: scene(12 + i * 12, 40 + (i % 3) * 8, 2),
    });
    out.push({
      id: `${faction}_amelioration_${tier}`,
      faction,
      name: `${DWELLING_NAMES[faction][i]} — amélioration`,
      description: `Permet d’améliorer les ${rows[i].plural} en ${rows[i].upPlural}.`,
      cost: bumpCost(DWELLING_COST[i]),
      requires: [id],
      grants: [
        { kind: 'upgrade', from: `${faction}_t${tier}`, to: `${faction}_t${tier}_up` },
      ] as BuildingGrant[],
      scene: scene(12 + i * 12, 44 + (i % 3) * 8, 2),
    });
  }
  out.push({
    id: `${faction}_capitole`,
    faction,
    name: faction === 'granit' ? 'Serment des Comtes' : 'Cœur des Bois Noirs',
    description:
      faction === 'granit'
        ? 'Le serment scellé sur la pierre : la cité croît plus vite et tient plus fort.'
        : 'La forêt reconnaît la cité comme sienne : la croissance s’accélère.',
    cost: { ecus: 20000, granit: 30, bois: 30, filDor: 10, essence: 10 },
    requires: [`${faction}_demeure_7`, 'salle_comptes_3'],
    grants: [{ kind: 'growth_bp', bp: 2500 }, { kind: 'morale', value: 1 }],
    scene: scene(50, 30, 5),
  });
  return out;
}

function buildBuildings(): Record<BuildingId, BuildingDef> {
  const out: Record<BuildingId, BuildingDef> = {};
  for (const b of commonBuildings()) out[b.id] = b;
  for (const b of factionBuildings('granit')) out[b.id] = b;
  for (const b of factionBuildings('ermitage')) out[b.id] = b;
  return out;
}

/* ── Compétences ────────────────────────────────────────────────────────── */

interface SkillRow {
  id: SkillId;
  name: string;
  description: string;
  ranks: [string, string, string];
  effects: [SkillEffect[], SkillEffect[], SkillEffect[]];
}

const SKILL_ROWS: SkillRow[] = [
  {
    id: 'logistique',
    name: 'Logistique',
    description: 'Les colonnes marchent plus vite et se fatiguent moins.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'movement_bp', bp: 10800 }],
      [{ kind: 'movement_bp', bp: 11500 }],
      [{ kind: 'movement_bp', bp: 12500 }],
    ],
  },
  {
    id: 'tactique',
    name: 'Tactique',
    description: 'Le déploiement gagne des rangées avant le premier choc.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'tactics_rows', value: 1 }],
      [{ kind: 'tactics_rows', value: 1 }, { kind: 'first_strike_bp', bp: 10500 }],
      [{ kind: 'tactics_rows', value: 2 }, { kind: 'first_strike_bp', bp: 11000 }],
    ],
  },
  {
    id: 'seigneurie',
    name: 'Seigneurie',
    description: 'La troupe croit en son chef.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'morale', value: 1 }],
      [{ kind: 'morale', value: 2 }],
      [{ kind: 'morale', value: 3 }],
    ],
  },
  {
    id: 'intendance',
    name: 'Intendance',
    description: 'Les revenus du domaine sont mieux tenus.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'income_bp', bp: 10500 }],
      [{ kind: 'income_bp', bp: 11100 }],
      [{ kind: 'income_bp', bp: 11800 }, { kind: 'build_cost_bp', bp: 9500 }],
    ],
  },
  {
    id: 'diplomatie',
    name: 'Diplomatie',
    description: 'Les communautés écoutent avant de lever les fourches.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'morale', value: 1 }],
      [{ kind: 'morale', value: 1 }, { kind: 'income_bp', bp: 10300 }],
      [{ kind: 'morale', value: 2 }, { kind: 'income_bp', bp: 10600 }],
    ],
  },
  {
    id: 'reconnaissance',
    name: 'Reconnaissance',
    description: 'On voit plus loin, et plus tôt.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'vision', value: 2 }],
      [{ kind: 'vision', value: 3 }],
      [{ kind: 'vision', value: 5 }],
    ],
  },
  {
    id: 'sylviculture',
    name: 'Sylviculture',
    description: 'La futaie s’ouvre pour qui la connaît.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'terrain_cost_bp', terrain: 'foret', bp: 9000 }],
      [{ kind: 'terrain_cost_bp', terrain: 'foret', bp: 8000 }],
      [
        { kind: 'terrain_cost_bp', terrain: 'foret', bp: 7000 },
        { kind: 'terrain_cost_bp', terrain: 'humide', bp: 9000 },
      ],
    ],
  },
  {
    id: 'pelerinage',
    name: 'Pèlerinage',
    description: 'Chaque sanctuaire visité rend un peu de force.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'mana_regen', value: 1 }],
      [{ kind: 'mana_regen', value: 2 }],
      [{ kind: 'mana_regen', value: 4 }],
    ],
  },
  {
    id: 'forges',
    name: 'Forges',
    description: 'Les armures sortent mieux trempées.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'defense_bp', bp: 10500 }],
      [{ kind: 'defense_bp', bp: 11000 }],
      [{ kind: 'defense_bp', bp: 11500 }],
    ],
  },
  {
    id: 'balistique',
    name: 'Balistique',
    description: 'Les machines de siège trouvent le défaut du mur.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'siege_damage_bp', bp: 11500 }],
      [{ kind: 'siege_damage_bp', bp: 13000 }],
      [{ kind: 'siege_damage_bp', bp: 15000 }],
    ],
  },
  {
    id: 'guerison',
    name: 'Guérison',
    description: 'Les blessés reviennent au rang.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'heal_bp', bp: 11000 }],
      [{ kind: 'heal_bp', bp: 12500 }],
      [{ kind: 'heal_bp', bp: 15000 }],
    ],
  },
  {
    id: 'erudition',
    name: 'Érudition',
    description: 'Le savoir se convertit en réserve de mana.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'mana_max_bp', bp: 11000 }],
      [{ kind: 'mana_max_bp', bp: 12000 }],
      [{ kind: 'mana_max_bp', bp: 13500 }, { kind: 'xp_bp', bp: 11000 }],
    ],
  },
  {
    id: 'occultisme',
    name: 'Occultisme',
    description: 'Les sorts frappent plus profond.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'spell_power_bp', bp: 11000 }],
      [{ kind: 'spell_power_bp', bp: 12000 }],
      [{ kind: 'spell_power_bp', bp: 13500 }],
    ],
  },
  {
    id: 'commandement',
    name: 'Commandement',
    description: 'La première ligne frappe avant l’ennemi.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'first_strike_bp', bp: 10500 }],
      [{ kind: 'first_strike_bp', bp: 11000 }, { kind: 'morale', value: 1 }],
      [{ kind: 'first_strike_bp', bp: 11500 }, { kind: 'morale', value: 2 }],
    ],
  },
  {
    id: 'fortune',
    name: 'Fortune',
    description: 'Le sort borné penche du bon côté.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'fortune', value: 1 }],
      [{ kind: 'fortune', value: 2 }],
      [{ kind: 'fortune', value: 3 }],
    ],
  },
  {
    id: 'embuscade',
    name: 'Embuscade',
    description: 'Les attaques de flanc deviennent une discipline.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'flank_bp', bp: 11000 }],
      [{ kind: 'flank_bp', bp: 12000 }],
      [{ kind: 'flank_bp', bp: 13000 }],
    ],
  },
  {
    id: 'commerce',
    name: 'Commerce',
    description: 'Le change au marché cesse d’être une saignée.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'trade_bp', bp: 10600 }],
      [{ kind: 'trade_bp', bp: 11200 }],
      [{ kind: 'trade_bp', bp: 12000 }],
    ],
  },
  {
    id: 'cartographie',
    name: 'Cartographie',
    description: 'Les raccourcis notés hier servent aujourd’hui.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'movement', value: 150 }, { kind: 'vision', value: 1 }],
      [{ kind: 'movement', value: 250 }, { kind: 'vision', value: 1 }],
      [{ kind: 'movement', value: 400 }, { kind: 'vision', value: 2 }],
    ],
  },
  {
    id: 'resistance',
    name: 'Résistance',
    description: 'Les sorts adverses glissent sur la troupe.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'resist_bp', bp: 1000 }],
      [{ kind: 'resist_bp', bp: 2000 }],
      [{ kind: 'resist_bp', bp: 3000 }],
    ],
  },
  {
    id: 'invocation',
    name: 'Invocation',
    description: 'Ce que la forêt prête, elle le prête en nombre.',
    ranks: ['Novice', 'Expert', 'Maître'],
    effects: [
      [{ kind: 'summon_bp', bp: 11000 }],
      [{ kind: 'summon_bp', bp: 12500 }],
      [{ kind: 'summon_bp', bp: 14000 }],
    ],
  },
];

function buildSkills(): Record<SkillId, SkillDef> {
  const out: Record<SkillId, SkillDef> = {};
  for (const r of SKILL_ROWS) {
    out[r.id] = {
      id: r.id,
      name: r.name,
      icon: r.id,
      description: r.description,
      ranks: r.ranks,
      effects: r.effects,
    };
  }
  return out;
}

/* ── Sorts ──────────────────────────────────────────────────────────────── */

const SPELL_NAMES: Record<SpellSchool, string[]> = {
  braises: [
    'Étincelle des Farges',
    'Acier tempéré',
    'Cendre aux yeux',
    'Trait incandescent',
    'Mur de braises',
    'Marteau rouge',
    'Fournaise du rempart',
    'Couronne de feu ancien',
  ],
  sources: [
    'Rosée vive',
    'Gué clair',
    'Eau réparatrice',
    'Voile de pluie',
    'Source miraculeuse',
    'Courant de la Durolle',
    'Lit de la Vierge',
    "Fontaine de l'Alliance",
  ],
  brumes: [
    'Brume basse',
    'Pas effacé',
    'Reflet du Lac',
    'Chouette silencieuse',
    'Brouillard de Pamole',
    'Échange des ombres',
    'Nuit des Bois Noirs',
    'Voile du Forez',
  ],
  racines: [
    'Écorce du fayard',
    'Ronce vive',
    'Futaie vigilante',
    'Appel de la meute',
    'Racines profondes',
    'Pierre levée',
    'Cercle des bornes',
    'Mémoire de la forêt',
  ],
};

/** Sorts d'aventure : (école, degré) → cible et effets. */
const ADVENTURE_SPELLS: Record<string, { target: SpellDef['target']; effects: SpellDef['effects'] }> =
  {
    sources_2: { target: 'adventure', effects: [{ kind: 'movement', value: 400 }] },
    brumes_2: { target: 'adventure', effects: [{ kind: 'movement', value: 300 }] },
    brumes_3: { target: 'adventure', effects: [{ kind: 'vision', radius: 12 }] },
    brumes_5: { target: 'adventure', effects: [{ kind: 'reveal_map', radius: 24 }] },
    sources_4: { target: 'adventure', effects: [{ kind: 'weather_shift' }] },
    racines_7: { target: 'adventure', effects: [{ kind: 'teleport' }] },
  };

function buildSpells(): Record<SpellId, SpellDef> {
  const out: Record<SpellId, SpellDef> = {};
  for (const school of Object.keys(SPELL_NAMES) as SpellSchool[]) {
    for (let i = 0; i < 8; i++) {
      const level = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
      const id = `${school}_${level}`;
      const adv = ADVENTURE_SPELLS[id];
      out[id] = {
        id,
        school,
        level,
        name: SPELL_NAMES[school][i],
        cost: 2 + level * 3,
        target: adv ? adv.target : level % 3 === 0 ? 'all_enemies' : 'enemy_stack',
        scope: adv ? 'aventure' : 'combat',
        effects: adv
          ? adv.effects
          : [{ kind: 'damage', base: 8 * level, perMystique: 3 * level, element: school }],
        description: `${SPELL_NAMES[school][i]} — degré ${level} de l’école des ${school}.`,
        icon: id,
      };
    }
  }
  return out;
}

/* ── Héros ──────────────────────────────────────────────────────────────── */

interface HeroRow {
  id: HeroId;
  name: string;
  faction: FactionId | 'neutre';
  cls: string;
  title: string;
  specialty: HeroDef['specialty'];
  skills: SkillId[];
  spell?: SpellId;
  stats: [number, number, number, number];
}

const HERO_ROWS: HeroRow[] = [
  {
    id: 'paul',
    name: 'Paul',
    faction: 'granit',
    cls: 'Castellan',
    title: 'Élan des Bannerets',
    specialty: { kind: 'creature', creature: 'granit_t6', perLevelBp: 300 },
    skills: ['commandement', 'tactique'],
    stats: [3, 2, 1, 1],
  },
  {
    id: 'thibaut',
    name: 'Thibaut',
    faction: 'granit',
    cls: 'Sénéchal',
    title: 'Maître des chemins',
    specialty: { kind: 'movement', bonus: 300 },
    skills: ['logistique', 'cartographie'],
    stats: [2, 2, 1, 2],
  },
  {
    id: 'loic',
    name: 'Loïc',
    faction: 'granit',
    cls: 'Sénéchal',
    title: 'Gabelle juste',
    specialty: { kind: 'resource', resource: 'sel', perDay: 2 },
    skills: ['intendance', 'diplomatie'],
    stats: [1, 2, 2, 2],
  },
  {
    id: 'matthieu',
    name: 'Matthieu',
    faction: 'granit',
    cls: 'Castellan',
    title: 'Briseur de portes',
    specialty: { kind: 'siege', bp: 12500 },
    skills: ['balistique', 'forges'],
    stats: [3, 2, 1, 1],
  },
  {
    id: 'clotilde',
    name: 'Clotilde',
    faction: 'granit',
    cls: 'Sénéchale',
    title: "Main d'or",
    specialty: { kind: 'creature', creature: 'granit_t4', perLevelBp: 350 },
    skills: ['seigneurie', 'guerison'],
    stats: [2, 2, 2, 1],
  },
  {
    id: 'caroline',
    name: 'Caroline',
    faction: 'granit',
    cls: 'Sénéchale',
    title: 'Intendante des Marches',
    specialty: { kind: 'build_discount', bp: 9000 },
    skills: ['intendance', 'commerce'],
    stats: [1, 2, 2, 2],
  },
  {
    id: 'thomas',
    name: 'Thomas',
    faction: 'granit',
    cls: 'Castellan',
    title: 'Œil des Farges',
    specialty: { kind: 'creature', creature: 'granit_t3', perLevelBp: 400 },
    skills: ['reconnaissance', 'balistique'],
    stats: [3, 1, 1, 2],
  },
  {
    id: 'georges',
    name: 'Georges',
    faction: 'granit',
    cls: 'Castellan',
    title: 'Mur de granit',
    specialty: { kind: 'skill', skill: 'forges', bonusBp: 11000 },
    skills: ['forges', 'resistance'],
    stats: [2, 4, 1, 1],
  },
  {
    id: 'auguste',
    name: 'Auguste',
    faction: 'granit',
    cls: 'Sénéchal',
    title: 'Voix du Comte',
    specialty: { kind: 'skill', skill: 'seigneurie', bonusBp: 11500 },
    skills: ['seigneurie', 'diplomatie'],
    stats: [2, 2, 2, 1],
  },
  {
    id: 'josephine',
    name: 'Joséphine',
    faction: 'granit',
    cls: 'Sénéchale',
    title: 'Pactes de village',
    specialty: { kind: 'diplomacy', bp: 12000 },
    skills: ['diplomatie', 'commerce'],
    stats: [1, 2, 2, 2],
  },
  {
    id: 'anastasia',
    name: 'Anastasia',
    faction: 'ermitage',
    cls: 'Prieure',
    title: 'Dame des Brumes',
    specialty: { kind: 'school', school: 'brumes', costBp: 8500 },
    skills: ['occultisme', 'erudition'],
    spell: 'brumes_3',
    stats: [1, 1, 3, 3],
  },
  {
    id: 'mathilde',
    name: 'Mathilde',
    faction: 'ermitage',
    cls: 'Prieure',
    title: 'Eaux réparatrices',
    specialty: { kind: 'school', school: 'sources', costBp: 8500 },
    skills: ['guerison', 'erudition'],
    spell: 'sources_2',
    stats: [1, 2, 3, 2],
  },
  {
    id: 'agathe',
    name: 'Agathe',
    faction: 'ermitage',
    cls: 'Veneuse',
    title: 'Œil de la Hulotte',
    specialty: { kind: 'vision', bonus: 3 },
    skills: ['reconnaissance', 'cartographie'],
    stats: [2, 2, 2, 1],
  },
  {
    id: 'roxane',
    name: 'Roxane',
    faction: 'ermitage',
    cls: 'Veneuse',
    title: 'Pas sans trace',
    specialty: { kind: 'skill', skill: 'embuscade', bonusBp: 11500 },
    skills: ['embuscade', 'sylviculture'],
    stats: [3, 1, 1, 2],
  },
  {
    id: 'jean',
    name: 'Jean',
    faction: 'ermitage',
    cls: 'Veneur',
    title: 'Chef de meute',
    specialty: { kind: 'creature', creature: 'ermitage_t3', perLevelBp: 400 },
    skills: ['sylviculture', 'tactique'],
    stats: [3, 2, 1, 1],
  },
  {
    id: 'adele',
    name: 'Adèle',
    faction: 'ermitage',
    cls: 'Prieure',
    title: 'Enfant des Racines',
    specialty: { kind: 'school', school: 'racines', costBp: 8500 },
    skills: ['invocation', 'occultisme'],
    spell: 'racines_2',
    stats: [1, 2, 3, 2],
  },
  {
    id: 'ines',
    name: 'Inès',
    faction: 'ermitage',
    cls: 'Prieure',
    title: 'Chemins de dévotion',
    specialty: { kind: 'skill', skill: 'pelerinage', bonusBp: 12000 },
    skills: ['pelerinage', 'erudition'],
    spell: 'sources_1',
    stats: [1, 2, 2, 3],
  },
  {
    id: 'gustave',
    name: 'Gustave',
    faction: 'ermitage',
    cls: 'Veneur',
    title: 'Poing de Pamole',
    specialty: { kind: 'creature', creature: 'ermitage_t6', perLevelBp: 300 },
    skills: ['balistique', 'forges'],
    stats: [3, 2, 1, 1],
  },
  {
    id: 'come',
    name: 'Côme',
    faction: 'ermitage',
    cls: 'Prieur',
    title: 'Lecture du ciel',
    specialty: { kind: 'weather' },
    skills: ['erudition', 'reconnaissance'],
    spell: 'brumes_1',
    stats: [1, 2, 2, 3],
  },
  {
    id: 'lise',
    name: 'Lise',
    faction: 'ermitage',
    cls: 'Prieure',
    title: 'Sang de la Durolle',
    specialty: { kind: 'creature', creature: 'ermitage_t7', perLevelBp: 250 },
    skills: ['occultisme', 'invocation'],
    spell: 'racines_1',
    stats: [2, 1, 3, 2],
  },
  {
    id: 'jules',
    name: 'Jules',
    faction: 'neutre',
    cls: 'Gardien des Bornes',
    title: 'Gardien des Bornes',
    specialty: { kind: 'movement', bonus: 500 },
    skills: ['cartographie', 'logistique'],
    stats: [2, 2, 2, 2],
  },
];

function startArmyFor(faction: FactionId | 'neutre'): { creature: CreatureId; count: number }[] {
  const f: FactionId = faction === 'neutre' ? 'granit' : faction;
  return [
    { creature: `${f}_t1`, count: 24 },
    { creature: `${f}_t2`, count: 8 },
  ];
}

function buildHeroes(): Record<HeroId, HeroDef> {
  const out: Record<HeroId, HeroDef> = {};
  for (const r of HERO_ROWS) {
    const weights: Partial<Record<SkillId, number>> = {};
    for (const s of SKILL_ROWS) weights[s.id] = 30;
    for (const s of r.skills) weights[s] = 90;
    out[r.id] = {
      id: r.id,
      name: r.name,
      faction: r.faction,
      class: r.cls,
      title: r.title,
      specialty: r.specialty,
      portrait: `portrait_${r.id}`,
      bio: `${r.name}, ${r.cls.toLowerCase()} — ${r.title}.`,
      start: {
        vaillance: r.stats[0],
        garde: r.stats[1],
        mystique: r.stats[2],
        savoir: r.stats[3],
        skills: r.skills.map((s) => ({ skill: s, rank: 1 as const })),
        army: startArmyFor(r.faction),
        spells: r.spell ? [r.spell] : [],
      },
      skillWeights: weights,
    };
  }
  return out;
}

/* ── Artefacts ──────────────────────────────────────────────────────────── */

const ARTIFACT_ROWS: ArtifactDef[] = [
  {
    id: 'chausses_du_colporteur',
    name: 'Chausses du colporteur',
    slot: 'pieds',
    rarity: 'commun',
    effects: [{ kind: 'movement', value: 200 }],
    lore: 'Elles ont vu plus de cols que la plupart des mulets.',
    icon: 'pieds_1',
  },
  {
    id: 'lorgnette_de_belvedere',
    name: 'Lorgnette du belvédère',
    slot: 'tete',
    rarity: 'commun',
    effects: [{ kind: 'vision', value: 2 }],
    lore: 'Un cuivre terni, deux verres, et tout le sud du Forez.',
    icon: 'tete_1',
  },
  {
    id: 'gantelets_des_farges',
    name: 'Gantelets des Farges',
    slot: 'mains',
    rarity: 'rare',
    effects: [{ kind: 'defense_bp', bp: 10600 }],
    primary: { vaillance: 1 },
    lore: 'Le cuir sent encore la trempe.',
    icon: 'mains_1',
  },
  {
    id: 'ceinture_du_gabelou',
    name: 'Ceinture du gabelou',
    slot: 'ceinture',
    rarity: 'commun',
    effects: [{ kind: 'income_bp', bp: 10400 }],
    lore: 'Douze bourses cousues, dont neuf officielles.',
    icon: 'ceinture_1',
  },
  {
    id: 'anneau_des_sources',
    name: 'Anneau des sources',
    slot: 'anneau1',
    rarity: 'rare',
    effects: [{ kind: 'mana_regen', value: 2 }],
    primary: { mystique: 1 },
    lore: 'Froid en toute saison.',
    icon: 'anneau_1',
  },
  {
    id: 'anneau_de_fortune',
    name: 'Anneau de fortune',
    slot: 'anneau2',
    rarity: 'rare',
    effects: [{ kind: 'fortune', value: 1 }],
    lore: 'Trouvé deux fois, perdu trois.',
    icon: 'anneau_2',
  },
  {
    id: 'banniere_grenat',
    name: 'Bannière grenat',
    slot: 'banniere',
    rarity: 'rare',
    effects: [{ kind: 'morale', value: 1 }],
    lore: 'Reprisée après chaque siège, jamais remplacée.',
    icon: 'banniere_1',
  },
  {
    id: 'haubert_dardoise',
    name: "Haubert d'ardoise",
    slot: 'torse',
    rarity: 'majeur',
    effects: [{ kind: 'defense_bp', bp: 11200 }],
    primary: { garde: 2 },
    lore: 'Lourd comme un toit, sûr comme un toit.',
    icon: 'torse_1',
  },
  {
    id: 'collier_de_brume',
    name: 'Collier de brume',
    slot: 'cou',
    rarity: 'majeur',
    effects: [{ kind: 'resist_bp', bp: 1500 }],
    primary: { mystique: 1 },
    lore: 'On le voit mal, même sur soi.',
    icon: 'cou_1',
  },
  {
    id: 'carte_du_senechal',
    name: 'Carte du sénéchal',
    slot: 'relique',
    rarity: 'majeur',
    effects: [
      { kind: 'movement_bp', bp: 10800 },
      { kind: 'vision', value: 1 },
    ],
    lore: 'Les raccourcis y sont dessinés à l’encre plus pâle.',
    icon: 'relique_1',
  },
  {
    id: 'escarboucle_de_vouivre',
    name: 'Escarboucle de vouivre',
    slot: 'relique',
    rarity: 'relique',
    effects: [
      { kind: 'spell_power_bp', bp: 12000 },
      { kind: 'mana_max_bp', bp: 12000 },
    ],
    primary: { mystique: 3, savoir: 2 },
    lore: 'La rivière la réclame chaque nuit.',
    icon: 'relique_2',
  },
  {
    id: 'sceptre_des_comtes',
    name: 'Sceptre des comtes',
    slot: 'relique',
    rarity: 'relique',
    effects: [
      { kind: 'morale', value: 2 },
      { kind: 'income_bp', bp: 11200 },
    ],
    primary: { vaillance: 2, garde: 2 },
    lore: 'Il n’a jamais servi à frapper. C’est bien là son pouvoir.',
    icon: 'relique_3',
  },
];

/* ── Événements de semaine ──────────────────────────────────────────────── */

const WEEK_EVENT_ROWS: WeekEventDef[] = [
  {
    key: 'semaine_calme',
    name: 'Semaine ordinaire',
    text: 'Rien de notable, sinon la pluie sur les ardoises.',
    weight: 30,
    effects: [],
  },
  {
    key: 'semaine_foire',
    name: 'Semaine de la foire',
    text: 'Chabreloche tient foire : les revenus augmentent d’un dixième.',
    weight: 12,
    effects: [{ kind: 'income_bp', bp: 11000 }],
  },
  {
    key: 'semaine_portee',
    name: 'Semaine des portées',
    text: 'Les demeures produisent un dixième de recrues supplémentaires.',
    weight: 12,
    effects: [{ kind: 'growth_bp', bp: 11000 }],
  },
  {
    key: 'semaine_disette',
    name: 'Semaine de disette',
    text: 'Les greniers sont maigres : la croissance ralentit d’un dixième.',
    weight: 8,
    effects: [{ kind: 'growth_bp', bp: 9000 }],
  },
  {
    key: 'semaine_chemins',
    name: 'Semaine des bons chemins',
    text: 'Les cantonniers ont réparé les gués : on marche mieux.',
    weight: 10,
    effects: [{ kind: 'movement_bp', bp: 10600 }],
  },
  {
    key: 'semaine_boue',
    name: 'Semaine de boue',
    text: 'Les ornières avalent les charrettes.',
    weight: 8,
    effects: [{ kind: 'movement_bp', bp: 9400 }],
  },
  {
    key: 'semaine_pelerins',
    name: 'Semaine des pèlerins',
    text: 'Les chemins de dévotion sont pleins : le mana revient plus vite.',
    weight: 8,
    effects: [{ kind: 'mana_regen', value: 2 }],
  },
  {
    key: 'semaine_gabelous',
    name: 'Semaine des gabelous',
    text: 'Les contrôles se multiplient : le sel rapporte, l’agitation aussi.',
    weight: 6,
    effects: [{ kind: 'income_bp', bp: 10500 }],
  },
  {
    key: 'semaine_vouivre',
    name: 'Semaine de la vouivre',
    text: 'On l’a vue au-dessus de la Durolle. Les troupes murmurent.',
    weight: 4,
    effects: [{ kind: 'morale', value: -1 }],
  },
  {
    key: 'semaine_serment',
    name: 'Semaine du serment',
    text: 'Les bannières ont été bénies sous la porte des Farges.',
    weight: 6,
    effects: [{ kind: 'morale', value: 1 }],
  },
];

/* ── Factions ───────────────────────────────────────────────────────────── */

const FACTION_ROWS: Record<FactionId, FactionDef> = {
  granit: {
    id: 'granit',
    name: 'Châtellenie de Granit',
    motto: 'La pierre tient, la parole tient.',
    description:
      'Féodale, marchande et architecturée : elle défend l’ordre des chartes, la sûreté des routes et la solidité des remparts.',
    colors: {
      primary: '#6E1F2A',
      secondary: '#C9A227',
      accent: '#414A52',
      stone: '#2A2C2F',
      light: '#EDE3CE',
    },
    capitalName: 'Châtellenie',
    mechanic: {
      name: 'Serment de Pierre',
      description:
        'Deux piles alliées adjacentes forment une ligne : +2 défense et ripostes renforcées, mais -1 vitesse.',
    },
    startingResources: {
      ecus: 12000,
      bois: 20,
      granit: 20,
      fer: 12,
      sel: 10,
      essence: 6,
      filDor: 6,
    },
  },
  ermitage: {
    id: 'ermitage',
    name: 'Ermitage des Bois Noirs',
    motto: 'La forêt se souvient.',
    description:
      'Sylvestre, monastique et mobile : elle protège les sources, les futaies et les anciens pactes.',
    colors: {
      primary: '#1B3A2B',
      secondary: '#4E8977',
      accent: '#7C8F6B',
      stone: '#2A2C2F',
      light: '#CFC6B4',
    },
    capitalName: 'Ermitage',
    mechanic: {
      name: 'Mémoire de la Forêt',
      description:
        'La faction gagne des effets selon le terrain : futaie, source, hauteur, brume et rocher.',
    },
    startingResources: {
      ecus: 11000,
      bois: 24,
      granit: 16,
      fer: 8,
      sel: 8,
      essence: 12,
      filDor: 4,
    },
  },
};

const NEUTRAL_GUARD_ROWS: GuardTemplate[] = [
  { ring: 1, tiers: [1, 2, 3], powerMin: 400, powerMax: 1800 },
  { ring: 2, tiers: [3, 4, 5], powerMin: 1800, powerMax: 6000 },
  { ring: 3, tiers: [5, 6, 7], powerMin: 6000, powerMax: 18000 },
  { ring: 4, tiers: [6, 7], powerMin: 18000, powerMax: 42000 },
];

/* ── Assemblage ─────────────────────────────────────────────────────────── */

let cache: ContentPack | null = null;

export function fallbackContent(): ContentPack {
  if (cache) return cache;

  const CREATURES = buildCreatures();
  const BUILDINGS = buildBuildings();
  const SKILLS = buildSkills();
  const SPELLS = buildSpells();
  const HEROES = buildHeroes();
  const ARTIFACTS: Record<ArtifactId, ArtifactDef> = {};
  for (const a of ARTIFACT_ROWS) ARTIFACTS[a.id] = a;

  function need<T>(table: Record<string, T>, id: string, what: string): T {
    const v = table[id];
    if (!v) throw new Error(`${what} inconnu : « ${id} »`);
    return v;
  }

  cache = {
    CONTENT_VERSION: FALLBACK_CONTENT_VERSION,
    CREATURES,
    HEROES,
    SPELLS,
    SKILLS,
    ARTIFACTS,
    BUILDINGS,
    FACTIONS: FACTION_ROWS,
    WEEK_EVENTS: WEEK_EVENT_ROWS,
    NEUTRAL_GUARDS: NEUTRAL_GUARD_ROWS,
    creature: (id) => need(CREATURES, id, 'Créature'),
    hero: (id) => need(HEROES, id, 'Héros'),
    spell: (id) => need(SPELLS, id, 'Sort'),
    skill: (id) => need(SKILLS, id, 'Compétence'),
    artifact: (id) => need(ARTIFACTS, id, 'Artefact'),
    building: (id) => need(BUILDINGS, id, 'Bâtiment'),
    creaturesOf: (faction, tier) =>
      Object.keys(CREATURES)
        .sort()
        .map((k) => CREATURES[k])
        .filter((c) => c.faction === faction && (tier === undefined || c.tier === tier)),
    buildingsOf: (faction) =>
      Object.keys(BUILDINGS)
        .sort()
        .map((k) => BUILDINGS[k])
        .filter((b) => b.faction === faction || b.faction === 'commun'),
  };
  return cache;
}
