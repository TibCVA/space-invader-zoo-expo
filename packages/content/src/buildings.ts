/**
 * L'arbre de construction des deux cités (document maître §5.1 et §5.2).
 *
 * Trois familles :
 *  - `commun`   : ce que toute cité peut bâtir, quelle que soit la bannière ;
 *  - `granit`   : l'architecture de la Châtellenie ;
 *  - `ermitage` : celle de l'Ermitage des Bois Noirs.
 *
 * Identifiants imposés par le noyau (`core/create-game.ts`) : toute capitale
 * démarre avec `<faction>_demeure_1`, `<faction>_demeure_2` et `taverne`.
 *
 * Chaque bâtiment porte sa position sur le tableau de cité :
 *   `scene.x`, `scene.y` — pourcentage de la largeur / hauteur (0–100) ;
 *   `scene.z`            — plan de parallaxe, 0 = lointain … 5 = premier plan ;
 *   `scene.scale`        — échelle en pourcentage (100 = taille de référence).
 * La cité se lit de bas en haut : halles et marchés au premier plan, remparts
 * à gauche, guilde à droite, demeures en écharpe vers le sommet, bâtiment
 * ultime au faîte.
 */
import type {
  BuildingDef,
  BuildingGrant,
  BuildingId,
  FactionId,
  Resources,
} from '@auvergne/engine';
import { indexById, scaleCostBp, scene } from './util.js';
import { CREATURES, creatureIdOf } from './creatures.js';

/* ── Bâtiments communs ───────────────────────────────────────────────────── */

const COMMON: readonly BuildingDef[] = [
  {
    id: 'hotel_ville_1',
    faction: 'commun',
    name: 'Salle des comptes',
    description:
      "Deux clercs, un coffre à trois serrures et le registre des tailles. La cité sait enfin ce qu'elle perçoit, ce qui suffit à augmenter la recette.",
    cost: { ecus: 2500 },
    requires: [],
    chain: 'hotel_ville',
    chainLevel: 1,
    grants: [{ kind: 'income', resource: 'ecus', amount: 500 }],
    scene: scene(54, 56, 3, 175),
  },
  {
    id: 'hotel_ville_2',
    faction: 'commun',
    name: 'Chambre des comptes',
    description:
      "Une salle voûtée, six clercs et la moitié des dettes anciennes enfin retrouvée. On y juge aussi les contestations de poids et mesures.",
    cost: { ecus: 5000, bois: 6, granit: 4 },
    requires: ['hotel_ville_1'],
    chain: 'hotel_ville',
    chainLevel: 2,
    grants: [{ kind: 'income', resource: 'ecus', amount: 500 }],
    scene: scene(54, 56, 3, 190),
  },
  {
    id: 'hotel_ville_3',
    faction: 'commun',
    name: 'Grand Livre du comté',
    description:
      "Le registre relié de peau, enchaîné à son pupitre, où figurent serments, cens, droits de passage et titres. Une cité qui le tient ne se conteste plus facilement.",
    cost: { ecus: 9500, granit: 12, filDor: 3 },
    requires: ['hotel_ville_2'],
    chain: 'hotel_ville',
    chainLevel: 3,
    grants: [
      { kind: 'income', resource: 'ecus', amount: 1000 },
      { kind: 'morale', value: 1 },
    ],
    scene: scene(54, 56, 3, 205),
  },
  {
    id: 'taverne',
    faction: 'commun',
    name: 'Auberge des Bannières',
    description:
      "Salle basse, feu permanent, tables de chêne. On y recrute des capitaines de passage et on y apprend les nouvelles trois jours avant les hérauts.",
    cost: { ecus: 700, bois: 6 },
    requires: [],
    grants: [{ kind: 'tavern' }, { kind: 'morale', value: 1 }],
    scene: scene(36, 80, 5, 150),
  },
  {
    id: 'marche',
    faction: 'commun',
    name: 'Marché',
    description:
      "Étals sous auvent, poids étalonnés et un juré pour trancher les litiges. Les ressources s'échangent enfin sans perte excessive.",
    cost: { ecus: 1200, bois: 8 },
    requires: [],
    grants: [{ kind: 'market' }],
    scene: scene(52, 78, 4, 155),
  },
  {
    id: 'halle_sel',
    faction: 'commun',
    name: 'Halle du Sel',
    description:
      "Un grenier scellé, deux gabelous à la porte et un registre de sorties. Le sel dort au sec et rapporte tous les jours.",
    cost: { ecus: 1800, bois: 6, granit: 6 },
    requires: ['marche'],
    grants: [{ kind: 'income', resource: 'sel', amount: 2 }],
    scene: scene(66, 72, 4, 145),
  },
  {
    id: 'caravanserail',
    faction: 'commun',
    name: 'Caravansérail',
    description:
      "Cour fermée, abreuvoir, écurie de passage et grange à fourrage. Les caravanes du Lac y font étape et laissent leur droit d'entrée.",
    cost: { ecus: 2600, bois: 10, granit: 6 },
    requires: ['marche'],
    grants: [
      { kind: 'income', resource: 'ecus', amount: 250 },
      { kind: 'income', resource: 'sel', amount: 1 },
      { kind: 'special', key: 'caravanserail' },
    ],
    scene: scene(8, 76, 4, 150),
  },
  {
    id: 'capitaine',
    faction: 'commun',
    name: 'Loge du Capitaine',
    description:
      "Logis du capitaine de place : chambre, salle d'armes et vue sur la porte. Une garnison commandée par quelqu'un dort mieux et tient mieux.",
    cost: { ecus: 1400, bois: 6, fer: 3 },
    requires: ['taverne'],
    grants: [{ kind: 'special', key: 'capitaine_de_place' }, { kind: 'morale', value: 1 }],
    scene: scene(38, 52, 3, 145),
  },
  {
    id: 'forge',
    faction: 'commun',
    name: 'Forge comtale',
    description:
      "Deux feux, un martinet mû par le bief et un maître qui refuse les mauvaises soudures. Ferrures, carreaux et lames en sortent mieux trempés.",
    cost: { ecus: 1500, fer: 5 },
    requires: [],
    grants: [{ kind: 'blacksmith' }],
    scene: scene(78, 66, 4, 155),
  },
  {
    id: 'ecuries',
    faction: 'commun',
    name: 'Écuries du Forez',
    description:
      "Chevaux de montagne, courts d'encolure et sûrs sur la pente gelée. Les héros qui partent d'ici couvrent une bonne lieue de plus.",
    cost: { ecus: 2000, bois: 10 },
    requires: ['taverne'],
    grants: [{ kind: 'stables', movement: 350 }],
    scene: scene(90, 80, 5, 150),
  },
  {
    id: 'guilde_1',
    faction: 'commun',
    name: 'Guilde des Arts, premier cercle',
    description:
      "Une salle, deux pupitres, quatre chandelles. Les sorts du premier degré y sont recopiés à la main ; l'Ermitage appelle la même maison le Cercle des Arts.",
    cost: { ecus: 2000, bois: 5, essence: 2 },
    requires: [],
    chain: 'guilde',
    chainLevel: 1,
    grants: [{ kind: 'mage_guild', level: 1 }, { kind: 'mana', amount: 2 }],
    scene: scene(80, 34, 2, 175),
  },
  {
    id: 'guilde_2',
    faction: 'commun',
    name: 'Guilde des Arts, deuxième cercle',
    description:
      "L'étage se remplit de coffres à manuscrits et l'on cesse de recevoir les curieux. Les deuxièmes degrés demandent du silence et de l'essence.",
    cost: { ecus: 3000, essence: 4, granit: 3 },
    requires: ['guilde_1'],
    chain: 'guilde',
    chainLevel: 2,
    grants: [{ kind: 'mage_guild', level: 2 }],
    scene: scene(80, 34, 2, 185),
  },
  {
    id: 'guilde_3',
    faction: 'commun',
    name: 'Guilde des Arts, troisième cercle',
    description:
      "On y discute des brumes comme d'une matière première, avec balances et carnets. Trois degrés, et déjà une querelle d'école par saison.",
    cost: { ecus: 4500, essence: 6, granit: 6 },
    requires: ['guilde_2'],
    chain: 'guilde',
    chainLevel: 3,
    grants: [{ kind: 'mage_guild', level: 3 }, { kind: 'mana', amount: 2 }],
    scene: scene(80, 34, 2, 195),
  },
  {
    id: 'guilde_4',
    faction: 'commun',
    name: 'Guilde des Arts, quatrième cercle',
    description:
      "Le cercle des maîtres, où l'on n'entre pas sans y être appelé et d'où l'on ne rapporte pas de notes. La tour prend deux étages et un escalier à vis.",
    cost: { ecus: 6500, essence: 8, granit: 10 },
    requires: ['guilde_3'],
    chain: 'guilde',
    chainLevel: 4,
    grants: [{ kind: 'mage_guild', level: 4 }],
    scene: scene(80, 34, 2, 205),
  },
  {
    id: 'guilde_5',
    faction: 'commun',
    name: 'Guilde des Arts, cinquième cercle',
    description:
      "La bibliothèque haute : huit degrés, le vent des crêtes dans les volets et une lanterne qu'on n'éteint jamais. Peu de cités la voient s'achever.",
    cost: { ecus: 9000, essence: 12, granit: 14, filDor: 2 },
    requires: ['guilde_4'],
    chain: 'guilde',
    chainLevel: 5,
    grants: [{ kind: 'mage_guild', level: 5 }, { kind: 'mana', amount: 4 }],
    scene: scene(80, 34, 2, 215),
  },
  {
    id: 'palissade',
    faction: 'commun',
    name: 'Palissade',
    description:
      "Des pieux de sapin, un fossé et une barrière qu'on ferme au crépuscule. Ce n'est rien, et cela fait déjà gagner deux jours à un assiégé.",
    cost: { ecus: 1000, bois: 12 },
    requires: [],
    chain: 'defense',
    chainLevel: 1,
    grants: [{ kind: 'defense', walls: 1, towers: 0, gate: true }],
    scene: scene(16, 88, 5, 200),
  },
  {
    id: 'rempart',
    faction: 'commun',
    name: 'Rempart de granit',
    description:
      "Trois segments de mur appareillés à joints vifs, une porte de bois ferré et un chemin de ronde. Le granit noir du pays ne gèle pas, il fend.",
    cost: { ecus: 3500, granit: 16 },
    requires: ['palissade'],
    chain: 'defense',
    chainLevel: 2,
    grants: [{ kind: 'defense', walls: 2, towers: 1, gate: true }],
    scene: scene(16, 88, 5, 215),
  },
  {
    id: 'tours',
    faction: 'commun',
    name: 'Tours de guet',
    description:
      "Deux tours en éperon, meurtrières basses et arbalètes de rempart servies en permanence. Elles tirent d'elles-mêmes sur qui approche du pied du mur.",
    cost: { ecus: 6000, granit: 26, fer: 8 },
    requires: ['rempart'],
    chain: 'defense',
    chainLevel: 3,
    grants: [
      { kind: 'defense', walls: 3, towers: 2, gate: true },
      { kind: 'morale', value: 1 },
    ],
    scene: scene(16, 88, 5, 230),
  },
  {
    /*
     * La Citadelle et le Château sont la mécanique de croissance de HMM3 que
     * la chaîne défensive n'avait pas : là-bas, Citadel multiplie par 1,5 la
     * croissance de BASE des demeures et Castle par 2 (wiki thelazy,
     * « Growth » : « Citadel, Castle and Statue of Legion only multiply the
     * basic growth rate »). Ici les deux paliers ajoutent chacun 5 000 points
     * de base au ratio de la cité — le Château exigeant la Citadelle, on
     * arrive bien à ×2 et non à ×1,5 × ×1,5. Sans eux, le plafond réel de
     * croissance de la cité était de ×1,35, et une partie longue n'avait
     * aucun moyen de faire grossir ses armées.
     */
    id: 'citadelle',
    faction: 'commun',
    name: 'Citadelle',
    description:
      "Un donjon de commandement au-dessus de la porte, un magasin d'armes, des casernes voûtées et un maître d'armes qui tient registre. La place ne se contente plus de se défendre : elle instruit et elle arme, et les demeures du comté envoient moitié plus de bras.",
    cost: { ecus: 9000, granit: 20, bois: 10 },
    requires: ['tours'],
    chain: 'defense',
    chainLevel: 4,
    grants: [
      { kind: 'defense', walls: 3, towers: 3, gate: true },
      { kind: 'growth_bp', bp: 5000 },
    ],
    scene: scene(16, 88, 5, 245),
  },
  {
    id: 'chateau',
    faction: 'commun',
    name: 'Château comtal',
    description:
      "Deux tours de flanquement de plus, une barbacane, des souterrains à grain et une garnison permanente qu'on relève tous les quinze jours. Une cité qui porte le château double le recrutement de ses demeures et ne tombe plus par surprise.",
    cost: { ecus: 15000, granit: 30, bois: 15, fer: 10 },
    requires: ['citadelle'],
    chain: 'defense',
    chainLevel: 5,
    grants: [
      { kind: 'defense', walls: 4, towers: 4, gate: true },
      { kind: 'growth_bp', bp: 5000 },
      { kind: 'morale', value: 1 },
    ],
    scene: scene(16, 88, 5, 260),
  },
];

/* ── Demeures : noms, coûts et bâtiment d'amélioration ───────────────────── */

interface DwellingRow {
  name: string;
  upgradeName: string;
  description: string;
  upgradeDescription: string;
  cost: Partial<Resources>;
  /** Prérequis supplémentaires, en plus de la demeure précédente. */
  extraRequires?: BuildingId[];
  /** Prérequis supplémentaires du bâtiment d'amélioration. */
  upgradeRequires?: BuildingId[];
}

const GRANIT_DWELLINGS: readonly DwellingRow[] = [
  {
    name: 'Corvée du bourg',
    upgradeName: 'Ban des Francs-Serfs',
    description:
      "Un hangar, un râtelier de piques et la cloche qui appelle la levée. Les manants du bourg s'y rassemblent quand la charte l'exige.",
    upgradeDescription:
      "On y lit publiquement les affranchissements et l'on inscrit les noms au registre. Le manant devient franc-serf, et le franc-serf ne recule plus.",
    cost: { ecus: 450, bois: 5 },
  },
  {
    name: 'Grenier à sel',
    upgradeName: 'Bureau du Prévôt',
    description:
      "Le grenier scellé et son corps de garde : c'est là qu'on forme les gabelous, à la mesure et à la patience.",
    upgradeDescription:
      "Bureau, sceau comtal et armoire aux registres de fraude. Le prévôt du sel y prend une autorité que nul muletier ne discute.",
    cost: { ecus: 950, bois: 8, granit: 2 },
  },
  {
    name: 'Butte de tir des Farges',
    upgradeName: "Salle d'armes des Farges",
    description:
      "Une butte de terre, cent pas mesurés au cordeau et des planches marquées d'une croix. On y compte les carreaux avant les prières.",
    upgradeDescription:
      "Bancs de bandage, étau à noix et forge d'appoint pour les têtes en losange. On y fait son chef-d'œuvre ou l'on redescend à la butte.",
    cost: { ecus: 1700, bois: 10, fer: 3 },
  },
  {
    name: 'Maison des Grenadières',
    upgradeName: "Chambre au Fil d'Or",
    description:
      "Grandes fenêtres au nord, métiers à broder alignés, coffres de soie. La grenade ouverte y est brodée depuis trois générations.",
    upgradeDescription:
      "La chambre haute, où l'on ne brode que trois choses : serments, linceuls et étendards de bataille. Le fil y passe à l'eau de la Durolle.",
    cost: { ecus: 2900, bois: 12, granit: 8, filDor: 2 },
    extraRequires: ['hotel_ville_1'],
  },
  {
    name: 'Soue cuirassée',
    upgradeName: 'Enclos du Verrat',
    description:
      "Une soue à charpente doublée, des mangeoires de pierre et beaucoup de glands. On y barde les sangliers d'ardoise rivetée.",
    upgradeDescription:
      "Enclos de blocs bruts pour les vieux solitaires pris au filet dans les Bois Noirs. Deux palefreniers, un fouet, et surtout de la distance.",
    cost: { ecus: 4800, granit: 14, fer: 8 },
    upgradeRequires: ['forge'],
  },
  {
    name: 'Cour des Bannerets',
    upgradeName: 'Chapelle des Bannerets',
    description:
      "Une cour pavée, un anneau d'attache par chevalier et la pierre levée où l'on prête serment devant témoins.",
    upgradeDescription:
      "On y bénit les bannières avant la campagne et l'on y grave le nom de ceux qui ne sont pas revenus. Le banneret y gagne le droit de mener les siens.",
    cost: { ecus: 8000, granit: 20, fer: 14, filDor: 4 },
    extraRequires: ['forge'],
  },
  {
    name: 'Aiguille de Pamole',
    upgradeName: "Couronnement de l'Aiguille",
    description:
      "Un escalier taillé dans le rocher jusqu'aux aires, et la convention tacite qu'on monte les moutons sans jamais toucher aux nids.",
    upgradeDescription:
      "Une plate-forme au sommet, un collier d'or refait par trois comtes et un fauconnier qui ne descend plus. Le vieux mâle accepte la couronne.",
    cost: { ecus: 13500, granit: 28, fer: 18, filDor: 8 },
    extraRequires: ['hotel_ville_2'],
  },
];

const ERMITAGE_DWELLINGS: readonly DwellingRow[] = [
  {
    name: 'Hospice des Pèlerins',
    upgradeName: 'Chemin de pénitence',
    description:
      "Une salle basse, de la paille propre, un chaudron et la porte jamais fermée. Tout ce qui monte à l'Hermitage passe par là.",
    upgradeDescription:
      "Le sentier des vœux, jalonné de croix de bois et de pierres plates. Ceux qui le suivent jusqu'au bout redescendent difficiles à arrêter.",
    cost: { ecus: 450, bois: 6 },
  },
  {
    name: 'Clairière des Chouettes',
    upgradeName: 'Perchoir oraculaire',
    description:
      "Perchoirs de branches basses, nichoirs creusés dans les souches, silence obligatoire. On y élève les hulottes au poing dès la nichée.",
    upgradeDescription:
      "Le vieux hêtre du sanctuaire, où nichent les oiseaux aux yeux presque blancs. Les prieures y viennent poser leurs questions avant les grandes décisions.",
    cost: { ecus: 950, bois: 9 },
  },
  {
    name: 'Chenil des Brumes',
    upgradeName: 'Layon des Brumes',
    description:
      "Un enclos ouvert sur la sapinière, plus symbolique qu'efficace : la meute reste parce qu'elle a décidé de rester.",
    upgradeDescription:
      "Un layon entretenu jusqu'aux brumes d'altitude, entre le col des Sagnes et Pamole. La meute y apprend à ne jamais attaquer de face.",
    cost: { ecus: 1700, bois: 12, essence: 2 },
  },
  {
    name: 'Loge des Veneurs',
    upgradeName: 'Affût du Garde-Futaie',
    description:
      "Loge de rondins, séchoir à peaux, râtelier d'arcs d'if. On y transmet les layons refermés depuis vingt ans.",
    upgradeDescription:
      "Affûts couverts aux carrefours des coupes et une décoction de racines qui raidit les jambes. Le garde-futaie tire sans sommation, la charte le permet.",
    cost: { ecus: 2900, bois: 14, essence: 4 },
    extraRequires: ['hotel_ville_1'],
  },
  {
    name: 'Bassin des Cerfs',
    upgradeName: 'Bassin miraculeux',
    description:
      "Un bassin de pierre alimenté par sept rigoles, où l'eau reste froide au plein de l'été. Les cerfs y viennent seuls.",
    upgradeDescription:
      "On a relevé la margelle, replanté le cercle de hêtres et rallumé la lampe des Sagnes. Ce qui boit ici cesse de pourrir.",
    cost: { ecus: 4800, bois: 10, granit: 10, essence: 7 },
    upgradeRequires: ['ermitage_source'],
  },
  {
    name: 'Cercle des Colosses',
    upgradeName: 'Carrière de Pamole',
    description:
      "Neuf blocs debout dans la lande, qu'on prend pour un chaos naturel tant qu'une prieure n'a pas prononcé le mot.",
    upgradeDescription:
      "Le front de taille de la Pierre Pamole, à mille cent soixante-cinq mètres. On y détache les colosses sans les débiter, ce qui suppose de savoir écouter.",
    cost: { ecus: 8000, granit: 24, essence: 12 },
    extraRequires: ['ermitage_source'],
  },
  {
    name: 'Nid de la Vouivre',
    upgradeName: 'Écaille de la Vouivre',
    description:
      "Une plate-forme de branches et de vase au-dessus de la fosse noire, en aval des moulins. On y jette une pièce avant de parler.",
    upgradeDescription:
      "L'escarboucle finit par s'enchâsser dans l'os du front des plus vieilles : c'est ce qu'on appelle la couronne. On leur cède le bief entier.",
    cost: { ecus: 13500, granit: 26, bois: 20, essence: 20 },
    extraRequires: ['hotel_ville_2'],
  },
];

/* ── Bâtiments propres à chaque faction ──────────────────────────────────── */

const GRANIT_SPECIALS: readonly BuildingDef[] = [
  {
    id: 'granit_atelier_fildor',
    faction: 'granit',
    name: "Atelier du Fil d'Or",
    description:
      "Filière, dévidoirs et bain de dorure : le fil d'or de Cervières y est tiré, puis vendu au poids aux ateliers de tout le comté.",
    cost: { ecus: 2600, bois: 8, fer: 4 },
    requires: ['marche'],
    grants: [{ kind: 'income', resource: 'filDor', amount: 2 }],
    scene: scene(68, 58, 3, 145),
  },
  {
    id: 'granit_porte_farges',
    faction: 'granit',
    name: 'Porte des Farges',
    description:
      "Deux tours jumelles, une herse, un assommoir et un corps de garde permanent. La porte des Farges n'a jamais été forcée de face.",
    cost: { ecus: 4200, granit: 18, fer: 8, filDor: 2 },
    requires: ['rempart'],
    grants: [
      { kind: 'defense', walls: 3, towers: 2, gate: true },
      { kind: 'special', key: 'porte_farges' },
    ],
    scene: scene(76, 90, 5, 215),
  },
  {
    id: 'granit_capitole',
    faction: 'granit',
    name: 'Serment des Comtes',
    description:
      "La salle haute où l'on jure sur la pierre, devant le Grand Livre ouvert et les bannières de toutes les maisons. Une cité qui l'achève cesse d'être une place forte : elle devient une capitale.",
    cost: { ecus: 20000, granit: 34, bois: 24, fer: 18, filDor: 12 },
    requires: ['granit_demeure_7', 'hotel_ville_3', 'granit_porte_farges'],
    grants: [
      { kind: 'growth_bp', bp: 2500 },
      { kind: 'morale', value: 1 },
      { kind: 'income', resource: 'ecus', amount: 500 },
      { kind: 'special', key: 'serment_des_comtes' },
    ],
    scene: scene(42, 21, 0, 225),
  },
];

const ERMITAGE_SPECIALS: readonly BuildingDef[] = [
  {
    id: 'ermitage_source',
    faction: 'ermitage',
    name: 'Source consacrée',
    description:
      "Une margelle de granit, une croix de fer et l'eau qui sort du rocher à la même température toute l'année. On y remplit les gourdes avant de partir.",
    cost: { ecus: 1900, granit: 8, essence: 5 },
    requires: [],
    grants: [{ kind: 'mana', amount: 4 }, { kind: 'morale', value: 1 }],
    scene: scene(24, 48, 3, 135),
  },
  {
    id: 'ermitage_scriptorium',
    faction: 'ermitage',
    name: 'Scriptorium',
    description:
      "Pupitres tournés vers le nord, encres de noix de galle, parchemins tendus. On y recopie ce que la forêt a bien voulu laisser écrire.",
    cost: { ecus: 2200, bois: 8, essence: 4 },
    requires: ['guilde_1'],
    grants: [{ kind: 'mana', amount: 3 }, { kind: 'special', key: 'scriptorium' }],
    scene: scene(68, 58, 3, 150),
  },
  {
    id: 'ermitage_clairiere',
    faction: 'ermitage',
    name: 'Clairière des Échanges',
    description:
      "Pas de halle, pas de juré : une clairière, des dates fixes et la parole donnée. On y troque l'essence sylvestre contre ce qui ne pousse pas ici.",
    cost: { ecus: 2400, bois: 12, essence: 3 },
    requires: ['marche'],
    grants: [
      { kind: 'income', resource: 'essence', amount: 2 },
      { kind: 'income', resource: 'ecus', amount: 150 },
    ],
    scene: scene(52, 40, 2, 150),
  },
  {
    id: 'ermitage_mur_racines',
    faction: 'ermitage',
    name: 'Mur de racines',
    description:
      "Haie vive doublée d'un rempart que les racines ont fini par absorber. Il ne se démolit pas : il se recoud, plus lentement qu'on ne l'abat mais sans jamais s'arrêter.",
    cost: { ecus: 4200, bois: 22, granit: 8, essence: 8 },
    requires: ['rempart'],
    grants: [
      { kind: 'defense', walls: 3, towers: 2, gate: true },
      { kind: 'special', key: 'mur_de_racines' },
    ],
    scene: scene(76, 90, 5, 215),
  },
  {
    id: 'ermitage_capitole',
    faction: 'ermitage',
    name: 'Cœur des Bois Noirs',
    description:
      "Le vallon central, ses passerelles, sa source haute et le silence qu'on y tient. Quand la forêt reconnaît la cité comme sienne, tout y pousse plus vite, y compris les armées.",
    cost: { ecus: 20000, granit: 26, bois: 34, essence: 26, sel: 8 },
    requires: ['ermitage_demeure_7', 'hotel_ville_3', 'ermitage_scriptorium'],
    grants: [
      { kind: 'growth_bp', bp: 2500 },
      { kind: 'morale', value: 1 },
      { kind: 'income', resource: 'essence', amount: 2 },
      { kind: 'special', key: 'coeur_des_bois_noirs' },
    ],
    scene: scene(42, 21, 0, 225),
  },
];

/* ── Génération des demeures ─────────────────────────────────────────────── */

/** Majoration du coût d'un bâtiment d'amélioration, en points de base. */
const UPGRADE_BUILDING_BP = 12000;

/**
 * Position des sept demeures sur le tableau de cité, par faction.
 *
 * L'écharpe monte du quartier de la porte vers le faîte, mais chaque faction
 * a son propre semis : l'Ermitage possède deux lieux de plus (source,
 * clairière) que la Châtellenie (atelier), et les demeures des étages hauts
 * se décalent pour que, tout construit, chaque terrasse du panorama porte
 * son bâtiment — l'exigence du propriétaire.
 */
const DWELLING_SCENE: Readonly<Record<FactionId, readonly [number, number, number, number][]>> = {
  granit: [
    [24, 70, 4, 130],
    [42, 66, 4, 135],
    [12, 56, 3, 140],
    [88, 54, 3, 150],
    [24, 44, 2, 160],
    [44, 30, 1, 172],
    [62, 24, 1, 185],
  ],
  ermitage: [
    [24, 70, 4, 130],
    [42, 66, 4, 135],
    [12, 56, 3, 140],
    [88, 54, 3, 150],
    [16, 38, 2, 160],
    [34, 30, 1, 172],
    [62, 24, 1, 185],
  ],
};

function dwellingsFor(faction: FactionId, rows: readonly DwellingRow[]): BuildingDef[] {
  const out: BuildingDef[] = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const tier = (i + 1) as 1 | 2 | 3 | 4 | 5 | 6 | 7;
    const id: BuildingId = `${faction}_demeure_${tier}`;
    const upId: BuildingId = `${faction}_amelioration_${tier}`;
    const creature = creatureIdOf(faction, tier);
    const upgraded = creatureIdOf(faction, tier, true);
    const def = CREATURES[creature];
    const upDef = CREATURES[upgraded];
    const [x, y, z, s] = DWELLING_SCENE[faction][i];

    const requires: BuildingId[] = [];
    if (i > 0) requires.push(`${faction}_demeure_${tier - 1}`);
    if (row.extraRequires) requires.push(...row.extraRequires);

    out.push({
      id,
      faction,
      name: row.name,
      description: `${row.description} Recrutement hebdomadaire : ${def.growth} ${def.namePlural}.`,
      cost: { ...row.cost },
      requires,
      chain: 'demeures',
      chainLevel: tier,
      grants: [{ kind: 'dwelling', creature, growth: def.growth }],
      scene: scene(x, y, z, s),
    });

    const upRequires: BuildingId[] = [id];
    if (row.upgradeRequires) upRequires.push(...row.upgradeRequires);

    out.push({
      id: upId,
      faction,
      name: row.upgradeName,
      description: `${row.upgradeDescription} Permet d'élever les ${def.namePlural} au rang de ${upDef.namePlural}.`,
      cost: scaleCostBp(row.cost, UPGRADE_BUILDING_BP),
      requires: upRequires,
      chain: 'ameliorations',
      chainLevel: tier,
      grants: [{ kind: 'upgrade', from: creature, to: upgraded }] as BuildingGrant[],
      /* L'amélioration ne pose pas un cabanon à côté : elle agrandit la
         demeure sur place — même emprise, un cran d'échelle — et la vue
         retire la demeure de base quand son amélioration est levée. */
      scene: scene(x, y, z, s + 12),
    });
  }
  return out;
}

/* ── Assemblage ──────────────────────────────────────────────────────────── */

function build(): BuildingDef[] {
  return [
    ...COMMON,
    ...dwellingsFor('granit', GRANIT_DWELLINGS),
    ...GRANIT_SPECIALS,
    ...dwellingsFor('ermitage', ERMITAGE_DWELLINGS),
    ...ERMITAGE_SPECIALS,
  ];
}

export const BUILDING_LIST: readonly BuildingDef[] = build();

export const BUILDINGS: Readonly<Record<BuildingId, BuildingDef>> = indexById(BUILDING_LIST);

/** Bâtiments constructibles par une faction : les siens et les communs. */
export function buildingsOf(faction: FactionId): BuildingDef[] {
  return BUILDING_LIST.filter((b) => b.faction === faction || b.faction === 'commun');
}

/** Bâtiments présents dès le premier jour dans une capitale (cf. le noyau). */
export function startingBuildingsOf(faction: FactionId): BuildingId[] {
  return [`${faction}_demeure_1`, `${faction}_demeure_2`, 'taverne'];
}
