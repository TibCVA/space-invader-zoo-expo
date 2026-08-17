/**
 * Les vingt-huit créatures du Forez.
 *
 * Sept rangs par faction, chacun décliné en forme de base et en forme
 * améliorée : `granit_t1` … `granit_t7`, `granit_t1_up` … `granit_t7_up`,
 * et de même pour `ermitage_*` (identifiants imposés par docs/02-API.md).
 *
 * Les statistiques de base sont EXACTEMENT celles du document maître §5.1 et
 * §5.2 (points de vie, attaque, défense, dégâts, vitesse, croissance).
 * L'initiative, absente du document, est fixée ici de façon cohérente avec la
 * nature de la créature : les volants et les meutes passent tôt, les colosses
 * et la piétaille passent tard.
 *
 * ─── Formule de puissance (valeur d'IA), unique et appliquée aux 28 ───
 *
 *   offense  = (dmgMin + dmgMax) × (10 + attaque)
 *   survie   = pv × (10 + défense)
 *   noyau    = ⌊√(offense × survie)⌋            (moyenne géométrique entière)
 *   tempo    = 8000 + 130 × vitesse + 90 × initiative        (BP)
 *   prime    = 10000 + Σ primes de capacité + vol + tir      (BP)
 *   power    = ⌊ noyau × tempo × prime / 100 000 000 ⌋
 *
 * La moyenne géométrique évite qu'un rang 7 ne pèse mille fois un rang 1 :
 * l'échelle obtenue va d'environ 37 (Manant) à environ 6 600 (Vouivre), ce qui
 * correspond à l'entretien et aux gardes neutres calibrés par le noyau.
 * Aucun nombre magique n'est saisi à la main : `power` est toujours calculé.
 */
import type {
  CreatureAbility,
  CreatureDef,
  CreatureId,
  FactionId,
  Resources,
} from '@auvergne/engine';
import { indexById, isqrt, scaleCostBp } from './util.js';

/* ── Primes de capacité, en points de base ───────────────────────────────── */

/** Prime de puissance apportée par une capacité, en BP. Toujours entière. */
export function abilityBonusBp(ability: CreatureAbility): number {
  switch (ability.kind) {
    case 'no_retaliation':
      return 1400;
    case 'no_retaliation_flank':
      return 600;
    case 'retaliations':
      return 350 * Math.max(0, ability.count - 1);
    case 'charge_bonus':
      return Math.trunc(ability.max / 10);
    case 'knockback':
      return 300;
    case 'slow_on_hit':
      return Math.trunc(ability.bp / 4);
    case 'zone_of_control':
      return 450;
    case 'pierce_defense':
      return Math.trunc(ability.bp / 3);
    case 'morale_aura':
      return 350 * ability.value;
    case 'heal_aura':
      return 45 * ability.amount;
    case 'cleanse':
      return 250;
    case 'resurrect_after_win':
      return Math.trunc(ability.bp / 3);
    case 'reveal_fortune':
      return 220;
    case 'boulder':
      return Math.trunc((ability.uses * ability.damage) / 3);
    case 'breath_line':
      return 300 * ability.length;
    case 'poison':
      return Math.trunc((ability.bp * ability.turns) / 8);
    case 'stealth':
      return 550;
    case 'range_penalty_immune':
      return 450;
    case 'siege_bonus':
      return Math.trunc(Math.max(0, ability.bp - 10000) / 8);
    case 'terrain_bonus':
      return Math.trunc(
        (Math.max(0, ability.attackBp - 10000) + Math.max(0, ability.defenseBp - 10000)) / 6,
      );
    default:
      return 0;
  }
}

/** Puissance d'une créature. Voir l'en-tête du fichier pour la formule. */
export function computePower(input: {
  hp: number;
  attack: number;
  defense: number;
  dmgMin: number;
  dmgMax: number;
  speed: number;
  initiative: number;
  flying?: boolean;
  shooter?: boolean;
  abilities: readonly CreatureAbility[];
}): number {
  const offense = (input.dmgMin + input.dmgMax) * (10 + input.attack);
  const survival = input.hp * (10 + input.defense);
  const core = isqrt(offense * survival);
  const tempo = 8000 + 130 * input.speed + 90 * input.initiative;
  let bonus = 10000;
  for (const ability of input.abilities) bonus += abilityBonusBp(ability);
  if (input.flying) bonus += 1200;
  if (input.shooter) bonus += 1500;
  return Math.max(1, Math.trunc((core * tempo * bonus) / 100_000_000));
}

/* ── Coûts par rang ──────────────────────────────────────────────────────── */

/**
 * Coût hebdomadaire d'une recrue. La Châtellenie paie en Fer et en Fil d'or,
 * l'Ermitage en Essence sylvestre et en Sel (document maître §5.1 et §5.2).
 */
const TIER_COST: Record<number, Record<FactionId, Partial<Resources>>> = {
  1: { granit: { ecus: 55 }, ermitage: { ecus: 55 } },
  2: { granit: { ecus: 120 }, ermitage: { ecus: 115 } },
  3: { granit: { ecus: 230, fer: 1 }, ermitage: { ecus: 235, essence: 1 } },
  4: { granit: { ecus: 420, fer: 2, filDor: 1 }, ermitage: { ecus: 430, essence: 2 } },
  5: { granit: { ecus: 780, fer: 4 }, ermitage: { ecus: 800, essence: 3, sel: 1 } },
  6: {
    granit: { ecus: 1450, fer: 6, filDor: 2 },
    ermitage: { ecus: 1480, essence: 6, granit: 2 },
  },
  7: {
    granit: { ecus: 2900, fer: 9, filDor: 4 },
    ermitage: { ecus: 2950, essence: 10, sel: 3 },
  },
};

/** Majoration du coût d'une forme améliorée, en points de base. */
const UPGRADE_COST_BP = 13000;

/* ── Table de définition ─────────────────────────────────────────────────── */

interface UpgradeSpec {
  name: string;
  namePlural: string;
  lore: string;
  abilities: CreatureAbility[];
  /** Surcharges facultatives, quand la progression mérite un caractère propre. */
  hp?: number;
  attack?: number;
  defense?: number;
  dmgMin?: number;
  dmgMax?: number;
  speed?: number;
  initiative?: number;
  shots?: number;
}

interface CreatureRow {
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7;
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
  flying?: boolean;
  shooter?: boolean;
  shots?: number;
  abilities: CreatureAbility[];
  lore: string;
  up: UpgradeSpec;
}

/* ── Châtellenie de Granit ───────────────────────────────────────────────── */

const GRANIT_ROWS: readonly CreatureRow[] = [
  {
    tier: 1,
    name: 'Manant',
    namePlural: 'Manants',
    hp: 4,
    attack: 2,
    defense: 2,
    dmgMin: 1,
    dmgMax: 2,
    speed: 4,
    initiative: 8,
    growth: 18,
    abilities: [],
    lore: "Levée de corvée des vallées, convoquée au son de la cloche et armée de ce qui traînait dans la grange. Le manant du Forez ne sait pas manœuvrer, mais il sait rester debout dans la boue jusqu'au soir. On le paie en pain, en sel et en promesse d'exemption ; il n'a jamais vu la couleur de la troisième.",
    up: {
      name: 'Franc-Serf',
      namePlural: 'Francs-Serfs',
      lore: "Affranchi par charte contre trente ans de guet aux portes, le franc-serf a troqué la fourche contre une pique et son nom contre une ligne au registre. Il tient la ligne parce que la ligne est désormais la sienne : la reculer, ce serait rendre la charte. Deux hommes de front, et le chemin creux devient un mur.",
      abilities: [{ kind: 'retaliations', count: 2 }],
    },
  },
  {
    tier: 2,
    name: 'Gabelou',
    namePlural: 'Gabelous',
    hp: 12,
    attack: 5,
    defense: 6,
    dmgMin: 2,
    dmgMax: 4,
    speed: 5,
    initiative: 9,
    growth: 12,
    abilities: [{ kind: 'slow_on_hit', bp: 1200 }],
    lore: "Commis du grenier à sel, plus redouté sur les chemins qu'un sergent d'armes. Sa pique sert moins à tuer qu'à retenir : il pique le mollet, le chargement, la conscience. Là où passe un gabelou, une charrette met deux fois plus de temps à traverser la borne.",
    up: {
      name: 'Prévôt du Sel',
      namePlural: 'Prévôts du Sel',
      lore: "Le prévôt a les clefs du grenier, le sceau du comte et la mémoire des fraudes de trois générations. Il plante son bâton en travers du chemin et personne ne le contourne : ni le muletier, ni le contrebandier, ni la cavalerie ennemie. On dit qu'il connaît le poids exact de chaque mule du Forez, à la livre près.",
      abilities: [
        { kind: 'slow_on_hit', bp: 1800 },
        { kind: 'zone_of_control' },
      ],
    },
  },
  {
    tier: 3,
    name: 'Arbalétrier des Farges',
    namePlural: 'Arbalétriers des Farges',
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
    abilities: [{ kind: 'slow_on_hit', bp: 900 }],
    lore: "Formé sous la porte des Farges, où l'on compte les carreaux avant les prières et où l'on tire à cent pas sur une planche marquée d'une croix. Le carreau des Farges ne cherche pas le cœur : il cherche la cuisse, le jarret, la roue. Une troupe qui ralentit est une troupe déjà à moitié prise.",
    up: {
      name: 'Maître-Arbalétrier',
      namePlural: 'Maîtres-Arbalétriers',
      lore: "Il a fait son chef-d'œuvre : douze carreaux dans un cercle de la largeur d'un heaume, à la nuit tombante, par vent de crête. Ses carreaux sont ferrés à la forge comtale et affûtés en losange pour trouver le défaut des plates. Une armure de granit ne l'impressionne plus depuis longtemps : il vise les coutures.",
      abilities: [
        { kind: 'slow_on_hit', bp: 1100 },
        { kind: 'pierce_defense', bp: 2000 },
      ],
      shots: 16,
    },
  },
  {
    tier: 4,
    name: "Grenadière d'Or",
    namePlural: "Grenadières d'Or",
    hp: 34,
    attack: 10,
    defense: 12,
    dmgMin: 6,
    dmgMax: 10,
    speed: 6,
    initiative: 10,
    growth: 6,
    abilities: [{ kind: 'morale_aura', value: 1 }],
    lore: "Brodeuse au fil d'or de Cervières, dont l'atelier fournit les bannières, les chasubles et les emblèmes en forme de grenade ouverte. Aucune poudre, aucun explosif : le nom vient du fruit brodé, pas de l'artillerie. Elle coud sous la mitraille comme elle coud à l'atelier, sans lever la tête, et la ligne se rassure de la voir tranquille.",
    up: {
      name: "Dame au Fil d'Or",
      namePlural: "Dames au Fil d'Or",
      lore: "Maîtresse d'atelier, elle ne brode plus que trois choses : les serments, les linceuls et les étendards de bataille. On raconte que son fil, tiré à la filière et passé à l'eau de la Durolle, retient un peu de ce qu'on lui confie. Quand elle refait un point sur une bannière déchirée, la troupe cesse de trembler ; les prieures appellent cela une bénédiction, elle appelle cela son métier.",
      abilities: [
        { kind: 'morale_aura', value: 2 },
        { kind: 'cleanse' },
      ],
    },
  },
  {
    tier: 5,
    name: 'Sanglier Cuirassé',
    namePlural: 'Sangliers Cuirassés',
    hp: 65,
    attack: 15,
    defense: 14,
    dmgMin: 11,
    dmgMax: 17,
    speed: 8,
    initiative: 10,
    growth: 4,
    abilities: [{ kind: 'charge_bonus', perHex: 500, max: 4000 }],
    lore: "Nourri au gland des hêtraies puis bardé de plaques d'ardoise rivetées par les forges du bourg. Il ne charge pas par courage mais par habitude : on lui a appris que le chemin le plus court passe à travers. Les palefreniers le mènent au fouet, à la voix, et surtout de très loin.",
    up: {
      name: 'Verrat de Granit',
      namePlural: 'Verrats de Granit',
      lore: "Vieux solitaire des Bois Noirs capturé au filet, ferré au chanfrein et rendu à la guerre. Sa cuirasse porte les marques de trois sièges et deux propriétaires. Quand il a pris son élan sur cinquante pas, ce n'est plus une bête qui arrive : c'est un éboulement avec des défenses.",
      abilities: [
        { kind: 'charge_bonus', perHex: 700, max: 5600 },
        { kind: 'knockback', minHexes: 4 },
      ],
    },
  },
  {
    tier: 6,
    name: 'Chevalier du Forez',
    namePlural: 'Chevaliers du Forez',
    hp: 115,
    attack: 20,
    defense: 19,
    dmgMin: 20,
    dmgMax: 30,
    speed: 9,
    initiative: 11,
    growth: 2,
    abilities: [{ kind: 'charge_bonus', perHex: 400, max: 3200 }],
    lore: "Il a juré sur la pierre levée du col, devant deux témoins et un notaire, et l'on n'a jamais entendu dire qu'un serment prêté là se soit défait. Son cheval est un lourd de montagne, court d'encolure, sûr sur la pente gelée. Il jure sur la pierre, jamais sur sa propre vie : elle appartient déjà au comté.",
    up: {
      name: 'Banneret de Cervières',
      namePlural: 'Bannerets de Cervières',
      lore: "Il porte bannière, ce qui veut dire qu'il mène ses propres hommes et répond d'eux devant le comte. L'étendard brodé à Cervières se voit de l'autre bout de la vallée, et c'est là tout son intérêt : les troupes qui le voient avancer avancent aussi. Il tombe rarement, mais quand il tombe, la moitié d'un pays le sait avant le soir.",
      abilities: [
        { kind: 'charge_bonus', perHex: 400, max: 3200 },
        { kind: 'morale_aura', value: 2 },
      ],
    },
  },
  {
    tier: 7,
    name: 'Griffon de Pamole',
    namePlural: 'Griffons de Pamole',
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
    lore: "Il niche dans les fissures de l'aiguille de Pamole, à mille cent mètres, où le vent ne s'arrête jamais. La Châtellenie ne l'élève pas : elle négocie, apporte des moutons et laisse les aires tranquilles. En échange, le griffon considère le ciel du Forez comme une châtellenie dont il serait le seul officier, et il perçoit son droit sur tout ce qui y passe.",
    up: {
      name: 'Griffon Couronné',
      namePlural: 'Griffons Couronnés',
      lore: "Vieux mâle à la crête blanchie, marqué d'un collier d'or que trois comtes successifs ont fait refaire. Il tourne au-dessus de la mêlée sans jamais se poser tout à fait, et frappe chaque fois qu'on croit lui avoir tourné le dos. Les veneurs de l'Ermitage prétendent qu'il se souvient du nom de ceux qui l'ont blessé ; les archers de la Châtellenie préfèrent ne pas vérifier.",
      abilities: [
        { kind: 'retaliations', count: 3 },
        { kind: 'no_retaliation_flank' },
      ],
    },
  },
];

/* ── Ermitage des Bois Noirs ─────────────────────────────────────────────── */

const ERMITAGE_ROWS: readonly CreatureRow[] = [
  {
    tier: 1,
    name: 'Pèlerin',
    namePlural: 'Pèlerins',
    hp: 5,
    attack: 2,
    defense: 3,
    dmgMin: 1,
    dmgMax: 2,
    speed: 4,
    initiative: 8,
    growth: 18,
    abilities: [],
    lore: "Il monte à l'Hermitage depuis si longtemps que la fatigue a cessé de le concerner. Son bâton a l'usure d'un manche d'outil et le poli d'une relique. Il ne se bat pas pour vaincre : il se bat pour que la route reste ouverte à ceux qui montent derrière lui.",
    up: {
      name: 'Pénitent Blanc',
      namePlural: 'Pénitents Blancs',
      lore: "Il a fait vœu de marcher pieds nus jusqu'à ce que la source des Sagnes recommence à couler, et la source a fini par couler. Depuis, on ne sait plus très bien de quoi il est délié. Après la bataille, on retrouve toujours quelques pénitents debout parmi ceux qu'on avait comptés morts, occupés à relever les autres sans un mot.",
      abilities: [{ kind: 'resurrect_after_win', bp: 1500 }],
    },
  },
  {
    tier: 2,
    name: 'Chouette Hulotte',
    namePlural: 'Chouettes Hulottes',
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
    lore: "Élevée dans les clairières du chenil et nourrie à la main jusqu'à ce qu'elle accepte le poing. Elle ouvre la marche, coupe le vent et rabat vers les layons ceux qui croyaient passer inaperçus. Les veneurs disent qu'elle compte les vivants avant la bataille, et qu'elle recompte après.",
    up: {
      name: 'Chouette Oraculaire',
      namePlural: 'Chouettes Oraculaires',
      lore: "Née un jour de brume dans le vieux hêtre du sanctuaire, elle a les yeux d'un jaune presque blanc et ne cligne pas. Les prieures l'interrogent avant les grandes décisions et notent le sens de son premier virage. Quand elle refuse de quitter le poing, on remet la bataille au lendemain, et on a généralement raison.",
      abilities: [
        { kind: 'no_retaliation_flank' },
        { kind: 'reveal_fortune' },
      ],
      initiative: 14,
    },
  },
  {
    tier: 3,
    name: 'Loup des Bois Noirs',
    namePlural: 'Loups des Bois Noirs',
    hp: 22,
    attack: 9,
    defense: 7,
    dmgMin: 4,
    dmgMax: 7,
    speed: 8,
    initiative: 11,
    growth: 8,
    abilities: [{ kind: 'terrain_bonus', terrain: 'foret', attackBp: 11500, defenseBp: 10500 }],
    lore: "La meute des Bois Noirs chasse en silence, se disperse avant d'être comptée et se retrouve deux vallons plus loin sans un cri. Sous les sapinières, elle voit ce que les hommes entendent seulement. On ne l'apprivoise pas : on s'entend avec elle, ce qui prend une génération et ne se renégocie jamais.",
    up: {
      name: 'Loup des Brumes',
      namePlural: 'Loups des Brumes',
      lore: "Il chasse dans les brumes d'altitude, entre le col des Sagnes et la Pierre Pamole, là où le regard porte à dix pas. Il n'attaque jamais de face : il attend le flanc, le moment où la ligne se tourne, l'homme qui regarde ailleurs. Les bergers ne le décrivent jamais deux fois de la même façon, et cela aussi fait partie de sa méthode.",
      abilities: [
        { kind: 'no_retaliation_flank' },
        { kind: 'terrain_bonus', terrain: 'foret', attackBp: 12000, defenseBp: 11000 },
      ],
    },
  },
  {
    tier: 4,
    name: 'Veneur Sylvestre',
    namePlural: 'Veneurs Sylvestres',
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
    lore: "Il connaît chaque layon des futaies de Viscomtat, y compris ceux que la forêt a refermés depuis vingt ans. Son arc est en if de haute futaie, sa corde en chanvre passé à la cire, ses flèches empennées de plumes de hulotte. On ne le voit qu'au moment où il l'a décidé, et généralement c'est trop tard.",
    up: {
      name: 'Garde-Futaie',
      namePlural: 'Gardes-Futaie',
      lore: "Assermenté par le prieuré pour garder les coupes, les sources et les bornes, il a le droit de tirer sans sommation sur qui abat un fayard marqué. Ses flèches sont barbelées et trempées dans une décoction de racines qui raidit les jambes. Il campe seul des semaines entières, et l'on reconnaît son passage à ce que rien n'a été dérangé.",
      abilities: [
        { kind: 'stealth' },
        { kind: 'slow_on_hit', bp: 1600 },
      ],
      shots: 14,
    },
  },
  {
    tier: 5,
    name: 'Cerf des Sources',
    namePlural: 'Cerfs des Sources',
    hp: 70,
    attack: 14,
    defense: 16,
    dmgMin: 11,
    dmgMax: 18,
    speed: 8,
    initiative: 10,
    growth: 4,
    abilities: [{ kind: 'heal_aura', amount: 6 }],
    lore: "Sa ramure porte l'eau claire de sept vallons : elle s'y accroche en gouttes qui ne sèchent pas, même par grand vent. Là où il baisse la tête, l'herbe repousse et les blessures se referment plus vite. Les Bois Noirs le protègent depuis toujours, et l'Ermitage n'a fait que continuer.",
    up: {
      name: 'Cerf Miraculeux',
      namePlural: 'Cerfs Miraculeux',
      lore: "On l'a vu trois fois en cent ans : à la peste, à la grande gelée, et le jour où la Durolle a débordé jusqu'aux moulins. Entre ses bois brûle une lueur froide que les prieures appellent la lampe des Sagnes. Ce qu'il touche cesse de pourrir, ce qu'il traverse cesse d'avoir peur, et personne n'a jamais osé le monter.",
      abilities: [
        { kind: 'heal_aura', amount: 10 },
        { kind: 'cleanse' },
      ],
    },
  },
  {
    tier: 6,
    name: 'Colosse de Granite',
    namePlural: 'Colosses de Granite',
    hp: 130,
    attack: 18,
    defense: 23,
    dmgMin: 20,
    dmgMax: 29,
    speed: 6,
    initiative: 8,
    growth: 2,
    abilities: [{ kind: 'terrain_bonus', terrain: 'rocher', attackBp: 10000, defenseBp: 12000 }],
    lore: "On l'a taillé dans une pierre qui refusait de tomber, et les carriers ont fini par lui laisser sa forme plutôt que d'user un outil de plus. Il dort couché dans la lande, indiscernable d'un chaos de blocs, jusqu'à ce qu'une prieure prononce le mot. Sur le rocher il est chez lui ; dans la boue, il est surtout très lent.",
    up: {
      name: 'Colosse de Pamole',
      namePlural: 'Colosses de Pamole',
      lore: "Extrait du flanc même de la Pierre Pamole, à mille cent soixante-cinq mètres, il porte encore la ligne de faille qui l'a détaché. Il ramasse un bloc de la taille d'un veau et l'envoie à cent pas sans avancer d'un pouce. Trois blocs par bataille : au-delà, dit-on, il commencerait à se démonter lui-même.",
      abilities: [
        { kind: 'terrain_bonus', terrain: 'rocher', attackBp: 10500, defenseBp: 12500 },
        { kind: 'boulder', uses: 3, damage: 60 },
        { kind: 'siege_bonus', bp: 12500 },
      ],
      defense: 27,
    },
  },
  {
    tier: 7,
    name: 'Vouivre de la Durolle',
    namePlural: 'Vouivres de la Durolle',
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
    lore: "Elle dort sous la rivière, dans la fosse noire en aval des moulins, et l'on jette encore une pièce au pont pour qu'elle continue. Son escarboucle, posée sur la berge le temps qu'elle boit, éclaire la vallée comme une lanterne rouge : on raconte que trois hommes ont essayé de la prendre et qu'on n'a retrouvé qu'un chapeau. Son venin ne tue pas vite, il tue sûrement, ce qui lui laisse le temps de repartir.",
    up: {
      name: 'Vouivre Couronnée',
      namePlural: 'Vouivres Couronnées',
      lore: "Les plus vieilles vouivres cessent de poser leur escarboucle : la pierre finit par s'enchâsser dans l'os du front, et c'est ce qu'on appelle la couronne. Elle ne chasse plus, elle règne sur un bief et exige qu'on l'y laisse. Son souffle balaie une ligne entière de la mêlée et laisse derrière lui une odeur d'orage et de vase.",
      abilities: [
        { kind: 'poison', bp: 1800, turns: 3 },
        { kind: 'breath_line', length: 3 },
      ],
    },
  },
];

/* ── Assemblage ──────────────────────────────────────────────────────────── */

/** Progression appliquée aux formes améliorées : environ +15 % (brief). */
const UP_HP_BP = 11500;
const UP_DMG_BP = 11500;
const UP_STAT_BP = 1400; // +14 %, mais toujours au moins +1 point.

function upStat(value: number): number {
  return value + Math.max(1, Math.round((value * UP_STAT_BP) / 10000));
}

function upValue(value: number, bp: number): number {
  return Math.ceil((value * bp) / 10000);
}

function makeBase(faction: FactionId, row: CreatureRow): CreatureDef {
  const id: CreatureId = `${faction}_t${row.tier}`;
  const def: CreatureDef = {
    id,
    faction,
    tier: row.tier,
    upgraded: false,
    name: row.name,
    namePlural: row.namePlural,
    hp: row.hp,
    attack: row.attack,
    defense: row.defense,
    dmgMin: row.dmgMin,
    dmgMax: row.dmgMax,
    speed: row.speed,
    initiative: row.initiative,
    growth: row.growth,
    cost: { ...TIER_COST[row.tier][faction] },
    power: 0,
    size: row.tier >= 5 ? 2 : 1,
    abilities: row.abilities,
    lore: row.lore,
  };
  if (row.flying) def.flying = true;
  if (row.shooter) {
    def.shooter = true;
    def.shots = row.shots ?? 8;
  }
  def.power = computePower(def);
  return def;
}

function makeUpgrade(faction: FactionId, row: CreatureRow, base: CreatureDef): CreatureDef {
  const spec = row.up;
  const def: CreatureDef = {
    id: `${base.id}_up`,
    faction,
    tier: row.tier,
    upgraded: true,
    upgradeOf: base.id,
    name: spec.name,
    namePlural: spec.namePlural,
    hp: spec.hp ?? upValue(base.hp, UP_HP_BP),
    attack: spec.attack ?? upStat(base.attack),
    defense: spec.defense ?? upStat(base.defense),
    dmgMin: spec.dmgMin ?? upValue(base.dmgMin, UP_DMG_BP),
    dmgMax: spec.dmgMax ?? upValue(base.dmgMax, UP_DMG_BP),
    speed: spec.speed ?? Math.min(13, base.speed + 1),
    initiative: spec.initiative ?? base.initiative + 1,
    growth: base.growth,
    cost: scaleCostBp(base.cost, UPGRADE_COST_BP),
    power: 0,
    size: base.size,
    abilities: spec.abilities,
    lore: spec.lore,
  };
  if (base.flying) def.flying = true;
  if (base.shooter) {
    def.shooter = true;
    def.shots = spec.shots ?? (base.shots ?? 8) + 4;
  }
  def.power = computePower(def);
  return def;
}

function buildAll(): CreatureDef[] {
  const out: CreatureDef[] = [];
  const table: [FactionId, readonly CreatureRow[]][] = [
    ['granit', GRANIT_ROWS],
    ['ermitage', ERMITAGE_ROWS],
  ];
  for (const [faction, rows] of table) {
    for (const row of rows) {
      const base = makeBase(faction, row);
      out.push(base);
      out.push(makeUpgrade(faction, row, base));
    }
  }
  return out;
}

export const CREATURE_LIST: readonly CreatureDef[] = buildAll();

export const CREATURES: Readonly<Record<CreatureId, CreatureDef>> = indexById(CREATURE_LIST);

/** Identifiant de la demeure de base d'un rang, tel qu'imposé par l'API. */
export function creatureIdOf(faction: FactionId, tier: number, upgraded = false): CreatureId {
  return `${faction}_t${tier}${upgraded ? '_up' : ''}`;
}
