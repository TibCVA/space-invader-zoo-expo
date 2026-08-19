/**
 * Les vingt-et-un héros du Forez (document maître §6).
 *
 * Identifiants imposés par docs/02-API.md :
 * `paul thibaut loic matthieu clotilde caroline thomas georges auguste
 *  josephine anastasia mathilde agathe roxane jean alice ines gustave come
 *  lise jules`.
 *
 * Dix pour la Châtellenie, dix pour l'Ermitage, un neutre (Jules), débloqué
 * par la quête du Grand Livre et qui choisit son allégeance au recrutement.
 *
 * Cohérence des caractéristiques de départ, par classe :
 *  - Castellan / Castellane : homme de guerre — Vaillance et Garde dominantes ;
 *  - Sénéchal / Sénéchale : administrateur — Garde et Savoir dominants ;
 *  - Veneur / Veneuse : batteur de bois — Vaillance et Savoir ;
 *  - Prieur / Prieure : magicien — Mystique et Savoir dominantes ;
 *  - Gardien : Jules, équilibré sur les quatre.
 *
 * `skillWeights` : poids de tirage à la montée de niveau, de 0 à 100. Chaque
 * héros reçoit un socle par classe, puis ses affinités propres.
 */
import type { HeroDef, HeroId, SkillId } from '@auvergne/engine';
import { indexById } from './util.js';
import { SKILL_IDS } from './skills.js';

type HeroClass =
  | 'Castellan'
  | 'Castellane'
  | 'Sénéchal'
  | 'Sénéchale'
  | 'Veneur'
  | 'Veneuse'
  | 'Prieur'
  | 'Prieure'
  | 'Gardien';

/** Socle de poids par classe : ce vers quoi la classe penche naturellement. */
const CLASS_WEIGHTS: Record<HeroClass, Partial<Record<SkillId, number>>> = {
  Castellan: {
    commandement: 62,
    tactique: 58,
    forges: 52,
    seigneurie: 50,
    balistique: 44,
    resistance: 42,
    logistique: 38,
    fortune: 34,
  },
  Castellane: {
    commandement: 62,
    tactique: 58,
    forges: 52,
    seigneurie: 50,
    balistique: 44,
    resistance: 42,
    logistique: 38,
    fortune: 34,
  },
  Sénéchal: {
    intendance: 62,
    commerce: 56,
    diplomatie: 54,
    logistique: 50,
    cartographie: 44,
    seigneurie: 42,
    erudition: 38,
    forges: 30,
  },
  Sénéchale: {
    intendance: 62,
    commerce: 56,
    diplomatie: 54,
    logistique: 50,
    cartographie: 44,
    seigneurie: 42,
    erudition: 38,
    forges: 30,
  },
  Veneur: {
    sylviculture: 62,
    embuscade: 58,
    reconnaissance: 56,
    cartographie: 48,
    fortune: 42,
    tactique: 40,
    logistique: 38,
    guerison: 30,
  },
  Veneuse: {
    sylviculture: 62,
    embuscade: 58,
    reconnaissance: 56,
    cartographie: 48,
    fortune: 42,
    tactique: 40,
    logistique: 38,
    guerison: 30,
  },
  Prieur: {
    occultisme: 62,
    erudition: 60,
    pelerinage: 54,
    guerison: 50,
    invocation: 48,
    resistance: 42,
    diplomatie: 32,
    seigneurie: 28,
  },
  Prieure: {
    occultisme: 62,
    erudition: 60,
    pelerinage: 54,
    guerison: 50,
    invocation: 48,
    resistance: 42,
    diplomatie: 32,
    seigneurie: 28,
  },
  Gardien: {
    cartographie: 64,
    logistique: 60,
    reconnaissance: 54,
    diplomatie: 46,
    commerce: 42,
    sylviculture: 40,
    fortune: 38,
    erudition: 34,
  },
};

/** Poids de base attribué à une compétence hors socle et hors affinité. */
const BASE_WEIGHT = 22;

interface HeroRow {
  id: HeroId;
  name: string;
  faction: HeroDef['faction'];
  cls: HeroClass;
  title: string;
  specialty: HeroDef['specialty'];
  /** Vaillance, Garde, Mystique, Savoir. */
  stats: [number, number, number, number];
  skills: { skill: SkillId; rank: 1 | 2 | 3 }[];
  army: { creature: string; count: number }[];
  spells: string[];
  /** Affinités propres au héros, ajoutées par-dessus le socle de classe. */
  affinities: Partial<Record<SkillId, number>>;
  /** Devise affichée sous le nom — sans effet de jeu. Voir `HeroDef.devise`. */
  devise?: string;
  bio: string;
}

/* ── Châtellenie de Granit ───────────────────────────────────────────────── */

const GRANIT_HEROES: readonly HeroRow[] = [
  {
    id: 'paul',
    name: 'Paul',
    faction: 'granit',
    cls: 'Castellan',
    title: 'Élan des Bannerets',
    specialty: { kind: 'creature', creature: 'granit_t6', perLevelBp: 300 },
    stats: [3, 2, 1, 1],
    skills: [
      { skill: 'commandement', rank: 1 },
      { skill: 'tactique', rank: 1 },
    ],
    army: [
      { creature: 'granit_t1', count: 22 },
      { creature: 'granit_t2', count: 7 },
    ],
    spells: [],
    affinities: { commandement: 92, tactique: 84, seigneurie: 66, logistique: 54 },
    devise:
      "J’ai un onguent pour chaque mal et une raison pour chaque débat. On ne m’a jamais pris en défaut sur l’un ni sur l’autre.",
    bio: "Cadet d'une maison de la vallée qui n'avait plus que son cheval et son nom, Paul a fait ses armes en menant les convois de sel entre Le Lac et la Maison du Trésor, à l'âge où d'autres apprenaient encore à tenir la lance. Il a compris très tôt que la cavalerie de montagne ne gagne pas par le choc frontal mais par le moment : cinquante pas d'élan bien choisis valent trois cents mal engagés. Ses bannerets le suivent parce qu'il part toujours le premier et qu'il revient toujours compter les rangs. On lui reproche de parler peu et de sourire moins encore ; ses hommes disent qu'il économise pour la charge.",
  },
  {
    id: 'thibaut',
    name: 'Thibaut',
    faction: 'granit',
    cls: 'Sénéchal',
    title: 'Maître des chemins',
    specialty: { kind: 'movement', bonus: 350 },
    stats: [2, 2, 1, 2],
    skills: [
      { skill: 'logistique', rank: 1 },
      { skill: 'cartographie', rank: 1 },
    ],
    army: [
      { creature: 'granit_t1', count: 24 },
      { creature: 'granit_t2', count: 8 },
    ],
    spells: [],
    affinities: { logistique: 94, cartographie: 88, reconnaissance: 62, commerce: 52 },
    devise:
      "Je ne mène pas la charge : je rédige le plan qui expliquera pourquoi elle a réussi.",
    bio: "Fils d'un maître de poste de Chabreloche, Thibaut a grandi dans une cour où l'on changeait les attelages six fois par jour et où l'on savait à l'heure près combien de temps mettait une charrette pour monter au col des Sagnes. Nommé sénéchal des chemins par le dernier comte, il a relevé les gués, fait replanter les bornes arrachées et interdit trois raccourcis qui tuaient des mules chaque hiver. Il tient un carnet relié de peau où figurent les ornières, les jours de foire et le nom des cantonniers. Son ambition n'est pas la couronne mais la chaussée : il estime, sans plaisanter tout à fait, que celui qui tient les chemins tient déjà le comté.",
  },
  {
    id: 'loic',
    name: 'Loïc',
    faction: 'granit',
    cls: 'Sénéchal',
    title: 'Gabelle juste',
    specialty: { kind: 'resource', resource: 'sel', perDay: 2 },
    stats: [1, 2, 2, 2],
    skills: [
      { skill: 'intendance', rank: 1 },
      { skill: 'diplomatie', rank: 1 },
    ],
    army: [
      { creature: 'granit_t1', count: 20 },
      { creature: 'granit_t2', count: 9 },
    ],
    spells: [],
    affinities: { intendance: 90, diplomatie: 80, commerce: 74, seigneurie: 50 },
    devise:
      "J’ai inventé une monnaie que personne n’a jamais vue. Elle vaut déjà trois mules.",
    bio: "Loïc a passé douze ans derrière le comptoir du grenier à sel avant qu'on ne lui confie la gabelle des Marches, et il en a gardé une horreur tranquille des contrôles inutiles. Sa théorie tient en une phrase : un impôt qu'on peut payer rentre, un impôt qu'on ne peut pas payer engendre des contrebandiers et des potences. Il a fait baisser le droit de deux deniers et augmenter la recette d'un cinquième, ce que la Châtellenie n'a jamais complètement digéré. Les villages du Lac le reçoivent sans fourche à la main, ce qui, dans le métier, est une distinction rare.",
  },
  {
    id: 'matthieu',
    name: 'Matthieu',
    faction: 'granit',
    cls: 'Castellan',
    title: 'Briseur de portes',
    specialty: { kind: 'siege', bp: 12500 },
    stats: [3, 2, 1, 1],
    skills: [
      { skill: 'balistique', rank: 1 },
      { skill: 'forges', rank: 1 },
    ],
    army: [
      { creature: 'granit_t1', count: 20 },
      { creature: 'granit_t3', count: 4 },
    ],
    spells: [],
    affinities: { balistique: 94, forges: 82, tactique: 60, resistance: 54 },
    devise:
      "J’en ai quarante et un. Le quarante-deuxième est commandé chez le forgeron de Thiers.",
    bio: "Matthieu a d'abord été charpentier de moulins, ce qui consiste à comprendre comment les choses tiennent avant de comprendre comment elles cèdent. Passé au service du comte pour relever les remparts de Cervières, il a fini par se rendre compte qu'il aimait mieux les abattre. Il ne bat jamais un mur au hasard : il fait sonder les assises, repère la reprise mal faite ou le joint que le gel a mangé, et concentre tout dessus. Il a la réputation de prendre une place en trois jours quand un autre en met dix, et l'habitude désagréable de le dire à l'avance.",
  },
  {
    id: 'clotilde',
    name: 'Clotilde',
    faction: 'granit',
    cls: 'Sénéchale',
    title: "Main d'or",
    specialty: { kind: 'creature', creature: 'granit_t4', perLevelBp: 350 },
    stats: [2, 2, 2, 1],
    skills: [
      { skill: 'seigneurie', rank: 1 },
      { skill: 'guerison', rank: 1 },
    ],
    army: [
      { creature: 'granit_t1', count: 18 },
      { creature: 'granit_t2', count: 8 },
    ],
    spells: [],
    affinities: { seigneurie: 88, guerison: 76, diplomatie: 66, intendance: 58 },
    devise:
      "J’ai fait naître la moitié du comté. L’autre moitié me doit encore des excuses.",
    bio: "Clotilde dirige les ateliers de broderie au fil d'or de Cervières, une maison de quarante femmes qui fournit les bannières de tout le comté et qui, depuis trois générations, ne s'est jamais soumise à un maître extérieur. Elle a pris la tête de la Maison des Grenadières à vingt-six ans, après la grande gelée qui avait emporté sa mère et deux tiers des commandes. Elle mène ses brodeuses comme une compagnie : par métier, par fierté et sans jamais élever la voix. Sur un champ de bataille, elle place ses Grenadières exactement là où la ligne va plier, et la ligne ne plie pas.",
  },
  {
    id: 'caroline',
    name: 'Caroline',
    faction: 'granit',
    cls: 'Sénéchale',
    title: 'Intendante des Marches',
    specialty: { kind: 'build_discount', bp: 9000 },
    stats: [1, 2, 2, 2],
    skills: [
      { skill: 'intendance', rank: 1 },
      { skill: 'commerce', rank: 1 },
    ],
    army: [
      { creature: 'granit_t1', count: 22 },
      { creature: 'granit_t2', count: 6 },
    ],
    spells: [],
    affinities: { intendance: 92, commerce: 82, logistique: 62, diplomatie: 56 },
    devise:
      "Une coupe, un semis. On ne prend au bois que ce qu’on lui rend.",
    bio: "Caroline a été formée à la chambre des comptes, où l'on apprend que la moitié d'un chantier se gagne avant la première pierre, dans le choix de la carrière et du charroi. Elle négocie le granit à la carrière plutôt qu'au pied du mur, paie les compagnons à la semaine et refuse les devis qu'on lui présente sans détail. Les architectes la détestent la première année et la réclament ensuite. Elle dit volontiers qu'un comté se bâtit comme une grange : d'abord le sol plat, ensuite les murs, et jamais l'inverse.",
  },
  {
    id: 'thomas',
    name: 'Thomas',
    faction: 'granit',
    cls: 'Castellan',
    title: 'Œil des Farges',
    specialty: { kind: 'creature', creature: 'granit_t3', perLevelBp: 400 },
    stats: [3, 1, 1, 2],
    skills: [
      { skill: 'reconnaissance', rank: 1 },
      { skill: 'balistique', rank: 1 },
    ],
    army: [
      { creature: 'granit_t1', count: 18 },
      { creature: 'granit_t3', count: 4 },
    ],
    spells: [],
    affinities: { reconnaissance: 88, balistique: 84, tactique: 62, embuscade: 54 },
    devise:
      "Franchement, ce col-là, il est propre. On y va tranquille, ça passe.",
    bio: "Thomas a été maître de tir sous la porte des Farges pendant dix-huit ans, ce qui veut dire qu'il a appris à trois cents jeunes gens la différence entre viser et attendre. Il a le regard long des gens qui ont passé leur vie à estimer des distances par-dessus une vallée, et une aversion nette pour les batailles rangées où l'on gaspille les carreaux. Sa méthode est simple : occuper la hauteur, connaître la portée exacte, laisser venir. Il n'a jamais commandé une charge de sa vie et ne s'en excuse pas.",
  },
  {
    id: 'georges',
    name: 'Georges',
    faction: 'granit',
    cls: 'Castellan',
    title: 'Mur de granit',
    specialty: { kind: 'skill', skill: 'forges', bonusBp: 11000 },
    stats: [2, 4, 1, 1],
    skills: [
      { skill: 'forges', rank: 1 },
      { skill: 'resistance', rank: 1 },
    ],
    army: [
      { creature: 'granit_t1', count: 26 },
      { creature: 'granit_t2', count: 8 },
    ],
    spells: [],
    affinities: { forges: 92, resistance: 86, seigneurie: 60, commandement: 56 },
    bio: "Georges a tenu la porte de Bise pendant le siège du grand hiver, avec soixante hommes, deux tonneaux de salaison et aucune illusion. Au onzième jour, il a fait démonter les charpentes des greniers pour étayer la courtine ; au vingt-troisième, les assiégeants sont partis. Il en a gardé une lenteur de parole, une claudication et la conviction que la meilleure bataille est celle qu'on ne livre pas dehors. Les jeunes castellans le trouvent démodé jusqu'au jour où ils ont besoin d'un gouverneur pour une place qu'ils ne veulent surtout pas perdre.",
  },
  {
    id: 'auguste',
    name: 'Auguste',
    faction: 'granit',
    cls: 'Sénéchal',
    title: 'Voix du Comte',
    specialty: { kind: 'skill', skill: 'seigneurie', bonusBp: 11500 },
    stats: [2, 2, 2, 1],
    skills: [
      { skill: 'seigneurie', rank: 1 },
      { skill: 'diplomatie', rank: 1 },
    ],
    army: [
      { creature: 'granit_t1', count: 22 },
      { creature: 'granit_t2', count: 8 },
    ],
    spells: [],
    affinities: { seigneurie: 94, diplomatie: 84, commandement: 66, intendance: 52 },
    bio: "Auguste a porté la parole du dernier comte pendant vingt ans, dans les assemblées de villages comme devant les évêques, et il a la voix qu'il faut pour cela : basse, lente, jamais pressée. Il connaît par cœur les serments, les préséances et le nom du grand-père de chaque prévôt du comté. Il est aussi le seul à savoir précisément ce que le vieux comte avait promis à qui, ce qui fait de lui l'homme le plus recherché et le plus surveillé des Marches. Il n'a pas de prétention à la couronne, dit-il ; il a une prétention à ce qu'elle soit portée correctement.",
  },
  {
    id: 'josephine',
    name: 'Joséphine',
    faction: 'granit',
    cls: 'Sénéchale',
    title: 'Pactes de village',
    specialty: { kind: 'diplomacy', bp: 12000 },
    stats: [1, 2, 2, 2],
    skills: [
      { skill: 'diplomatie', rank: 1 },
      { skill: 'commerce', rank: 1 },
    ],
    army: [
      { creature: 'granit_t1', count: 20 },
      { creature: 'granit_t2', count: 7 },
    ],
    spells: [],
    affinities: { diplomatie: 94, commerce: 80, intendance: 68, seigneurie: 54 },
    bio: "Joséphine est née dans un hameau de six feux au-dessus de Viscomtat et n'a jamais tout à fait cessé d'y appartenir, ce qui explique une bonne part de ses succès. Elle arrive dans un village avant la troupe, s'assoit à la table commune, écoute deux heures et ne propose rien le premier jour. Ses chartes tiennent parce qu'elles sont écrites avec les intéressés et non contre eux : droit de pacage, entretien du four, exemption de guet pour les veuves. Les capitaines la trouvent lente ; ils remarquent moins que les villages qu'elle a ralliés ne se sont jamais repris.",
  },
];

/* ── Ermitage des Bois Noirs ─────────────────────────────────────────────── */

const ERMITAGE_HEROES: readonly HeroRow[] = [
  {
    id: 'anastasia',
    name: 'Anastasia',
    faction: 'ermitage',
    cls: 'Prieure',
    title: 'Dame des Brumes',
    specialty: { kind: 'school', school: 'brumes', costBp: 8500 },
    stats: [1, 1, 3, 3],
    skills: [
      { skill: 'occultisme', rank: 1 },
      { skill: 'erudition', rank: 1 },
    ],
    army: [
      { creature: 'ermitage_t1', count: 18 },
      { creature: 'ermitage_t2', count: 6 },
    ],
    spells: ['brumes_1'],
    affinities: { occultisme: 94, erudition: 86, resistance: 62, embuscade: 54 },
    devise:
      "Montée de la capitale pour trois jours, restée trois ans : on m’avait servi un très bon vin le premier soir.",
    bio: "Anastasia dirige le prieuré haut du col des Sagnes, à neuf cent quatre-vingt-dix mètres, là où la brume monte deux cents jours par an et où l'on apprend à travailler sans voir. Elle a passé sa jeunesse à recopier les traités des Brumes puis dix ans à comprendre qu'ils décrivaient mal ce qu'ils prétendaient enseigner. Sa correction, écrite en marge d'un manuscrit du siècle précédent, coûte aujourd'hui moitié moins de mana que la formule d'origine et dure un jour de plus. Elle parle bas, se déplace sans bruit et considère la clarté comme une commodité surestimée.",
  },
  {
    id: 'mathilde',
    name: 'Mathilde',
    faction: 'ermitage',
    cls: 'Prieure',
    title: 'Eaux réparatrices',
    specialty: { kind: 'school', school: 'sources', costBp: 8500 },
    stats: [1, 2, 3, 2],
    skills: [
      { skill: 'guerison', rank: 1 },
      { skill: 'erudition', rank: 1 },
    ],
    army: [
      { creature: 'ermitage_t1', count: 20 },
      { creature: 'ermitage_t2', count: 5 },
    ],
    spells: ['sources_3'],
    affinities: { guerison: 94, erudition: 82, pelerinage: 72, occultisme: 60 },
    devise:
      "Je monte au col avant l’aube et je redescends avec de quoi nourrir la garnison.",
    bio: "Mathilde tient l'hospice de Notre-Dame de l'Hermitage, où l'on reçoit sans distinction les pèlerins, les blessés des deux bannières et les bergers tombés d'un talus. Elle a établi, année après année, un registre des sources du massif : débit, température, ce qu'elles guérissent et ce qu'elles ne guérissent pas malgré ce qu'on raconte. Ce registre est probablement le document le plus précieux du comté après le Grand Livre, et elle refuse d'en faire copie. Elle ramène des mourants avec une régularité qui inquiète autant qu'elle rassure, et elle est la première à dire qu'il y a une limite.",
  },
  {
    id: 'agathe',
    name: 'Agathe',
    faction: 'ermitage',
    cls: 'Veneuse',
    title: 'Œil de la Hulotte',
    specialty: { kind: 'vision', bonus: 3 },
    stats: [2, 2, 2, 1],
    skills: [
      { skill: 'reconnaissance', rank: 1 },
      { skill: 'cartographie', rank: 1 },
    ],
    army: [
      { creature: 'ermitage_t1', count: 16 },
      { creature: 'ermitage_t2', count: 9 },
    ],
    spells: [],
    affinities: { reconnaissance: 94, cartographie: 84, sylviculture: 70, embuscade: 62 },
    devise:
      "Deux vallées avant le déjeuner. Le messager, lui, arrive après moi.",
    bio: "Agathe élève les hulottes de la clairière depuis l'âge de onze ans, quand on lui a confié une nichée que personne ne voulait nourrir la nuit. Elle chasse au poing, dort dehors la moitié de l'année et connaît le massif par les silhouettes de crête plutôt que par les chemins. Ses relevés servent aux deux factions, ce qui lui vaut une réputation ambiguë et une sécurité relative. Quand une hulotte refuse de partir de son poing, elle annule la sortie sans donner d'explication à personne.",
  },
  {
    id: 'roxane',
    name: 'Roxane',
    faction: 'ermitage',
    cls: 'Veneuse',
    title: 'Pas sans trace',
    specialty: { kind: 'skill', skill: 'embuscade', bonusBp: 11500 },
    stats: [3, 1, 1, 2],
    skills: [
      { skill: 'embuscade', rank: 1 },
      { skill: 'sylviculture', rank: 1 },
    ],
    army: [
      { creature: 'ermitage_t1', count: 18 },
      { creature: 'ermitage_t3', count: 4 },
    ],
    spells: [],
    affinities: { embuscade: 94, sylviculture: 86, reconnaissance: 68, fortune: 56 },
    devise:
      "Six mois à la capitale, six mois au Lac, et le reste de l’année sur la route entre les deux.",
    bio: "Roxane a été braconnière avant d'être assermentée, ce que le prieuré considère comme une formation plutôt que comme un passé. Elle sait à quelle heure un chemin creux est aveugle, combien de temps une colonne met à se retourner et où elle regardera en se retournant. Elle ne livre jamais de bataille rangée si elle peut livrer trois embuscades. Ses hommes marchent en file, ne parlent pas et effacent leurs traces ; on la soupçonne d'avoir traversé deux fois le camp adverse en plein jour sans que personne ne le note.",
  },
  {
    id: 'jean',
    name: 'Jean',
    faction: 'ermitage',
    cls: 'Veneur',
    title: 'Chef de meute',
    specialty: { kind: 'creature', creature: 'ermitage_t3', perLevelBp: 400 },
    stats: [3, 2, 1, 1],
    skills: [
      { skill: 'sylviculture', rank: 1 },
      { skill: 'tactique', rank: 1 },
    ],
    army: [
      { creature: 'ermitage_t1', count: 16 },
      { creature: 'ermitage_t3', count: 6 },
    ],
    spells: [],
    affinities: { sylviculture: 90, tactique: 78, embuscade: 74, commandement: 58 },
    bio: "Jean est le quatrième de sa famille à tenir le chenil des Brumes, et le premier à avoir renoncé à dresser les loups. Sa méthode consiste à vivre avec eux jusqu'à ce qu'ils l'admettent dans l'ordre de la meute, ce qui lui a coûté deux hivers, un doigt et la moitié de son oreille gauche. Il ne donne pas d'ordres : il se place, et la meute déduit. En bataille, ses loups se dispersent puis se retrouvent sur le flanc adverse avec une coordination que les capitaines de la Châtellenie qualifient poliment de troublante.",
  },
  {
    id: 'alice',
    name: 'Alice',
    faction: 'ermitage',
    cls: 'Prieure',
    title: 'Enfant des Racines',
    specialty: { kind: 'school', school: 'racines', costBp: 8500 },
    stats: [1, 2, 3, 2],
    skills: [
      { skill: 'invocation', rank: 1 },
      { skill: 'occultisme', rank: 1 },
    ],
    army: [
      { creature: 'ermitage_t1', count: 18 },
      { creature: 'ermitage_t2', count: 6 },
    ],
    spells: ['racines_2'],
    affinities: { invocation: 94, occultisme: 84, sylviculture: 70, resistance: 58 },
    devise:
      "Je n’ai jamais refusé un service à personne. C’est bien mon seul défaut.",
    bio: "On a trouvé Alice enfant dans une souche creuse des Bois Noirs, après trois jours de recherches et un hiver qui aurait dû la tuer, et personne n'a jamais su à qui elle appartenait. Le prieuré l'a élevée ; la forêt, visiblement, l'avait déjà adoptée. Elle appelle les ronces comme on siffle un chien et les menhirs sortent de terre là où elle pose la main, ce qui rend les paysans à la fois reconnaissants et prudents. Elle-même dit qu'elle ne commande rien : elle demande, et il se trouve qu'on lui répond.",
  },
  {
    id: 'ines',
    name: 'Inès',
    faction: 'ermitage',
    cls: 'Prieure',
    title: 'Chemins de dévotion',
    specialty: { kind: 'skill', skill: 'pelerinage', bonusBp: 12000 },
    stats: [1, 2, 2, 3],
    skills: [
      { skill: 'pelerinage', rank: 1 },
      { skill: 'erudition', rank: 1 },
    ],
    army: [
      { creature: 'ermitage_t1', count: 20 },
      { creature: 'ermitage_t2', count: 6 },
    ],
    spells: ['sources_1'],
    affinities: { pelerinage: 96, erudition: 82, guerison: 68, diplomatie: 56 },
    bio: "Inès a relevé les chemins de dévotion du massif, un par un, en marchant : soixante-dix-huit croix, quarante et une sources, onze chapelles dont trois qu'on croyait effondrées. Elle en a tiré un itinéraire que les pèlerins suivent désormais et un principe qu'elle applique à la guerre : ce qu'on visite avec respect vous rend quelque chose. Sa troupe s'arrête à chaque borne, chaque fontaine, chaque oratoire, et gagne à chaque halte une force que ses adversaires n'arrivent pas à comptabiliser. Elle a l'air d'aller lentement ; elle arrive rarement en retard.",
  },
  {
    id: 'gustave',
    name: 'Gustave',
    faction: 'ermitage',
    cls: 'Veneur',
    title: 'Poing de Pamole',
    specialty: { kind: 'creature', creature: 'ermitage_t6', perLevelBp: 300 },
    stats: [3, 2, 1, 1],
    skills: [
      { skill: 'balistique', rank: 1 },
      { skill: 'forges', rank: 1 },
    ],
    army: [
      { creature: 'ermitage_t1', count: 18 },
      { creature: 'ermitage_t2', count: 7 },
    ],
    spells: [],
    affinities: { balistique: 88, forges: 78, sylviculture: 66, resistance: 62 },
    bio: "Gustave a été carrier à Vollore avant de comprendre, un matin de gel, que le bloc qu'il attaquait depuis trois jours le regardait. Il a posé ses outils, il est redescendu, et il est remonté le lendemain avec une prieure. Depuis, il éveille les colosses au lieu de les débiter, et il est le seul à savoir comment les faire lancer sans qu'ils se disloquent. Massif, taciturne, la main droite définitivement blanche de poussière, il tient les murs adverses pour un désordre passager dans la géologie locale.",
  },
  {
    id: 'come',
    name: 'Côme',
    faction: 'ermitage',
    cls: 'Prieur',
    title: 'Lecture du ciel',
    specialty: { kind: 'weather' },
    stats: [1, 2, 2, 3],
    skills: [
      { skill: 'erudition', rank: 1 },
      { skill: 'reconnaissance', rank: 1 },
    ],
    army: [
      { creature: 'ermitage_t1', count: 18 },
      { creature: 'ermitage_t2', count: 7 },
    ],
    spells: ['brumes_3'],
    affinities: { erudition: 92, reconnaissance: 76, occultisme: 70, pelerinage: 60 },
    bio: "Côme tient depuis trente et un ans un journal du ciel au-dessus des Bois Noirs : direction du vent au lever, forme des nuages sur Pamole, heure exacte de la première brume. Le cahier compte onze volumes et il en tire des prévisions à deux jours qu'aucun almanach n'égale. Il a découvert par accident qu'un front peut être retenu vingt-quatre heures si l'on sait où poser les cierges et quand ; il ne le fait qu'une fois par semaine et jamais deux semaines de suite. Il prétend n'avoir aucun pouvoir, seulement de l'attention, et il n'est pas certain qu'il se trompe.",
  },
  {
    id: 'lise',
    name: 'Lise',
    faction: 'ermitage',
    cls: 'Prieure',
    title: 'Sang de la Durolle',
    specialty: { kind: 'creature', creature: 'ermitage_t7', perLevelBp: 250 },
    stats: [2, 1, 3, 2],
    skills: [
      { skill: 'occultisme', rank: 1 },
      { skill: 'invocation', rank: 1 },
    ],
    army: [
      { creature: 'ermitage_t1', count: 18 },
      { creature: 'ermitage_t2', count: 6 },
    ],
    spells: ['racines_1'],
    affinities: { occultisme: 90, invocation: 86, guerison: 62, resistance: 58 },
    bio: "Lise a grandi au bord de la fosse noire, en aval des moulins, dans une maison où l'on jetait une pièce à la rivière avant chaque repas sans que personne ne sache plus pourquoi. À dix-neuf ans, elle est descendue voir. Elle est remontée trois jours plus tard, muette pendant une saison, et depuis les vouivres de la Durolle acceptent sa présence et parfois ses demandes. Elle ne prétend pas les commander : elle dit qu'elles ont un intérêt provisoirement commun avec le sien, ce qui est déjà davantage que ce que la plupart des seigneurs obtiennent de leurs vassaux.",
  },
];

/* ── Héros neutre ────────────────────────────────────────────────────────── */

const JULES: HeroRow = {
  id: 'jules',
  name: 'Jules',
  faction: 'neutre',
  cls: 'Gardien',
  title: 'Gardien des Bornes',
  specialty: { kind: 'movement', bonus: 500 },
  stats: [2, 2, 2, 2],
  skills: [
    { skill: 'cartographie', rank: 1 },
    { skill: 'logistique', rank: 1 },
  ],
  army: [
    { creature: 'granit_t1', count: 20 },
    { creature: 'ermitage_t1', count: 20 },
  ],
  spells: [],
  affinities: { cartographie: 96, logistique: 84, reconnaissance: 74, diplomatie: 64 },
  bio: "Jules n'appartient à aucune bannière et prétend n'avoir jamais eu à choisir, ce qui n'est vrai que jusqu'au jour où le Grand Livre est ouvert. Sa charge est ancienne et sans maître : entretenir les bornes armoriées, refaire les écussons effacés, vérifier que les limites du comté disent encore la vérité. Il connaît le réseau entier et l'ordre dans lequel les bornes se répondent, savoir qui ne figure nulle part et que personne d'autre ne possède. Son escorte est mêlée, prise aux deux traditions, et elle marche sans se poser de question parce que lui-même n'en pose jamais. Sa force n'est pas de frapper plus fort : c'est d'être déjà là où l'on ne l'attendait pas avant midi.",
};

/* ── Assemblage ──────────────────────────────────────────────────────────── */

const ROWS: readonly HeroRow[] = [...GRANIT_HEROES, ...ERMITAGE_HEROES, JULES];

function weightsFor(row: HeroRow): Partial<Record<SkillId, number>> {
  const out: Partial<Record<SkillId, number>> = {};
  for (const id of SKILL_IDS) out[id] = BASE_WEIGHT;
  const base = CLASS_WEIGHTS[row.cls];
  for (const id of Object.keys(base) as SkillId[]) {
    const value = base[id];
    if (value !== undefined) out[id] = value;
  }
  for (const id of Object.keys(row.affinities) as SkillId[]) {
    const value = row.affinities[id];
    if (value !== undefined) out[id] = value;
  }
  // Une compétence déjà connue reste attirante : le héros progresse dans sa voie.
  for (const s of row.skills) {
    const current = out[s.skill] ?? BASE_WEIGHT;
    out[s.skill] = Math.min(100, current + 6);
  }
  return out;
}

function build(): HeroDef[] {
  return ROWS.map((row) => ({
    id: row.id,
    name: row.name,
    faction: row.faction,
    class: row.cls,
    title: row.title,
    specialty: row.specialty,
    portrait: `portrait_${row.id}`,
    ...(row.devise ? { devise: row.devise } : {}),
    bio: row.bio,
    start: {
      vaillance: row.stats[0],
      garde: row.stats[1],
      mystique: row.stats[2],
      savoir: row.stats[3],
      skills: row.skills.map((s) => ({ skill: s.skill, rank: s.rank })),
      army: row.army.map((s) => ({ creature: s.creature, count: s.count })),
      spells: row.spells.slice(),
    },
    skillWeights: weightsFor(row),
  }));
}

export const HERO_LIST: readonly HeroDef[] = build();

export const HEROES: Readonly<Record<HeroId, HeroDef>> = indexById(HERO_LIST);

/** Les vingt-et-un identifiants de héros imposés par docs/02-API.md. */
export const HERO_IDS: readonly HeroId[] = HERO_LIST.map((h) => h.id);

/** Héros recrutables par une faction (le neutre est ouvert aux deux). */
export function heroesOf(faction: 'granit' | 'ermitage'): HeroDef[] {
  return HERO_LIST.filter((h) => h.faction === faction || h.faction === 'neutre');
}
