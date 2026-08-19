/**
 * Les artefacts du Forez : cinquante-trois pièces réparties en quatre raretés
 * et dix emplacements, dont trois ensembles complets.
 *
 * Rien de « générique » : ce sont des objets de pays — brodequins ferrés,
 * bourdon de pèlerin, sifflet de la halle au sel, escarboucle de vouivre,
 * fragment de la Pierre Pamole. Chaque pièce porte son lore.
 *
 * Barème de puissance appliqué :
 *  - commun  : un seul effet modeste, aucune caractéristique primaire ;
 *  - rare    : un ou deux effets, au plus un point de caractéristique ;
 *  - majeur  : deux effets, une à deux caractéristiques ;
 *  - relique : deux à trois effets forts, deux à quatre caractéristiques.
 *
 * Les trois ensembles :
 *  - `parure_grenadieres`  — Parure des Grenadières (3 pièces) ;
 *  - `attirail_gabelou`    — Attirail du Gabelou (4 pièces) ;
 *  - `regalia_forez`       — Regalia des Comtes du Forez (4 pièces).
 * Les pièces d'un même ensemble n'entrent jamais en conflit d'emplacement.
 */
import type { ArtifactDef, ArtifactId } from '@auvergne/engine';
import { indexById } from './util.js';

export interface ArtifactSetDef {
  id: string;
  name: string;
  lore: string;
  pieces: ArtifactId[];
  /** Effet d'ensemble, annoncé au joueur. Appliqué par le module monde. */
  bonusText: string;
}

type Row = Omit<ArtifactDef, 'icon'>;

/* ── Communs ─────────────────────────────────────────────────────────────── */

const COMMUNS: readonly Row[] = [
  {
    id: 'chausses_du_colporteur',
    name: 'Chausses du colporteur',
    slot: 'pieds',
    rarity: 'commun',
    effects: [{ kind: 'movement', value: 200 }],
    lore: "Cuir retourné, semelle triple, recousues onze fois. Elles ont vu plus de cols que la plupart des mulets et sentent encore la route.",
  },
  {
    id: 'lorgnette_de_belvedere',
    name: 'Lorgnette du belvédère',
    slot: 'tete',
    rarity: 'commun',
    effects: [{ kind: 'vision', value: 2 }],
    lore: "Un tube de cuivre terni, deux verres mal montés, et tout le sud du Forez d'un seul coup d'œil. Le guetteur de Cervières la prêtait contre un pichet.",
  },
  {
    id: 'ceinture_de_peage',
    name: 'Ceinture de péage',
    slot: 'ceinture',
    rarity: 'commun',
    effects: [{ kind: 'income_bp', bp: 10300 }],
    lore: "Ceinture de cuir large à boucle de laiton, portée par les receveurs des ponts. On y accrochait la sacoche du jour et la liste des exemptés.",
  },
  {
    id: 'bourdon_de_pelerin',
    name: 'Bourdon de pèlerin',
    slot: 'mains',
    rarity: 'commun',
    effects: [{ kind: 'mana_regen', value: 1 }],
    lore: "Un bâton de cormier au pommeau usé jusqu'à l'os par quarante ans de main droite. Il tient debout tout seul quand on le plante ; personne n'a jamais su pourquoi.",
  },
  {
    id: 'mitaines_de_brodeuse',
    name: 'Mitaines de brodeuse',
    slot: 'mains',
    rarity: 'commun',
    effects: [{ kind: 'morale', value: 1 }],
    lore: "Laine grise, doigts coupés, un fil d'or oublié dans la couture. On les porte à l'atelier l'hiver ; elles ont fini par prendre l'habitude du calme.",
  },
  {
    id: 'capuche_de_bure',
    name: 'Capuche de bure',
    slot: 'tete',
    rarity: 'commun',
    effects: [{ kind: 'resist_bp', bp: 600 }],
    lore: "Bure brune, doublée d'une bande de toile où l'on a cousu du sel. C'est un vieux geste de l'Hermitage, dont plus personne n'explique l'origine.",
  },
  {
    id: 'besace_du_muletier',
    name: 'Besace du muletier',
    slot: 'ceinture',
    rarity: 'commun',
    effects: [{ kind: 'trade_bp', bp: 10400 }],
    lore: "Toile huilée, trois poches et un jeu de poids en plomb qui, curieusement, ne correspond à aucun étalon connu. Elle a fait vingt fois le tour du massif.",
  },
  {
    id: 'medaille_du_bon_chemin',
    name: 'Médaille du bon chemin',
    slot: 'cou',
    rarity: 'commun',
    effects: [{ kind: 'movement_bp', bp: 10400 }],
    lore: "Un jeton d'étain frappé d'une borne et d'une croix, vendu deux deniers à la foire de Chabreloche. Les muletiers en achètent une par saison, par principe.",
  },
  {
    id: 'brodequins_ferres',
    name: 'Brodequins ferrés',
    slot: 'pieds',
    rarity: 'commun',
    effects: [{ kind: 'terrain_cost_bp', terrain: 'pente', bp: 9200 }],
    lore: "Clous à tête large sur semelle de bois, comme en portent les carriers de Vollore. Sur la pente gelée, ils font la différence entre monter et glisser.",
  },
  {
    id: 'jaque_de_toile',
    name: 'Jaque de toile',
    slot: 'torse',
    rarity: 'commun',
    effects: [{ kind: 'defense_bp', bp: 10300 }],
    lore: "Vingt épaisseurs de toile piquées au fil de chanvre, bourrées d'étoupe. Ce n'est pas une armure, c'est ce qu'on met quand on n'a pas d'armure.",
  },
  {
    id: 'fanion_de_corvee',
    name: 'Fanion de corvée',
    slot: 'banniere',
    rarity: 'commun',
    effects: [{ kind: 'morale', value: 1 }],
    lore: "Un carré de serge grenat monté sur un manche de fourche, brodé au fil ordinaire par la femme du forgeron. La levée du bourg le suit sans discuter.",
  },
  {
    id: 'anneau_de_cuivre',
    name: 'Anneau de cuivre',
    slot: 'anneau1',
    rarity: 'commun',
    effects: [{ kind: 'mana_max_bp', bp: 10500 }],
    lore: "Cuivre rouge martelé, sans pierre ni gravure, trouvé par centaines dans les tourbières des Sagnes. Les prieures disent que le cuivre retient, comme un bassin.",
  },
  {
    id: 'couteau_de_veneur',
    name: 'Couteau de veneur',
    slot: 'mains',
    rarity: 'commun',
    effects: [{ kind: 'flank_bp', bp: 10500 }],
    lore: "Lame courte à dos épais, manche en bois de cerf, fourreau cousu à l'aiguille. Il sert à tout, y compris à ce à quoi il n'était pas destiné.",
  },
  {
    id: 'baton_de_cantonnier',
    name: 'Bâton de cantonnier',
    slot: 'mains',
    rarity: 'commun',
    effects: [{ kind: 'terrain_cost_bp', terrain: 'foret', bp: 9300 }],
    lore: "Ferré aux deux bouts, marqué tous les pieds pour mesurer l'empierrement. Qui le porte se voit ouvrir les layons sans avoir à demander.",
  },
  {
    id: 'bonnet_de_clerc',
    name: 'Bonnet de clerc',
    slot: 'tete',
    rarity: 'commun',
    effects: [{ kind: 'xp_bp', bp: 10400 }],
    lore: "Feutre noir à bords souples, taché d'encre de noix de galle sur le côté gauche. Il appartenait à un copiste du scriptorium qui écrivait de la main gauche.",
  },
  {
    id: 'gourde_des_sagnes',
    name: 'Gourde des Sagnes',
    slot: 'ceinture',
    rarity: 'commun',
    effects: [{ kind: 'heal_bp', bp: 10500 }],
    lore: "Bois cerclé de fer, bouchon de liège attaché par une lanière. Remplie à la source haute, son eau reste froide trois jours en plein été.",
  },
];

/* ── Rares ───────────────────────────────────────────────────────────────── */

const RARES: readonly Row[] = [
  {
    id: 'gantelets_des_farges',
    name: 'Gantelets des Farges',
    slot: 'mains',
    rarity: 'rare',
    effects: [{ kind: 'defense_bp', bp: 10700 }],
    primary: { vaillance: 1 },
    lore: "Plates articulées sur cuir de vache, sorties de la forge sous la porte des Farges. Le cuir sent encore la trempe, et il la sentira longtemps.",
  },
  {
    id: 'anneau_des_sources',
    name: 'Anneau des sources',
    slot: 'anneau1',
    rarity: 'rare',
    effects: [{ kind: 'mana_regen', value: 2 }],
    primary: { mystique: 1 },
    lore: "Argent bruni serti d'un galet de rivière poli, froid en toute saison, même contre la peau. On le trempe dans chaque source rencontrée, par courtoisie.",
  },
  {
    id: 'anneau_de_fortune',
    name: 'Anneau de fortune',
    slot: 'anneau2',
    rarity: 'rare',
    effects: [{ kind: 'fortune', value: 1 }],
    lore: "Trouvé deux fois, perdu trois, et pourtant il finit toujours par revenir au doigt de quelqu'un. Les joueurs de la foire refusent de s'asseoir en face.",
  },
  {
    id: 'banniere_grenat',
    name: 'Bannière grenat',
    slot: 'banniere',
    rarity: 'rare',
    effects: [
      { kind: 'morale', value: 1 },
      { kind: 'first_strike_bp', bp: 10400 },
    ],
    lore: "Reprisée après chaque siège, jamais remplacée : la Châtellenie tient qu'une bannière neuve ne vaut rien. Elle porte onze pièces de tissu d'époques différentes.",
  },
  {
    id: 'cor_de_veneur',
    name: 'Cor de veneur',
    slot: 'cou',
    rarity: 'rare',
    effects: [{ kind: 'flank_bp', bp: 11000 }],
    lore: "Corne de bœuf montée en laiton, à la note basse qui porte trois vallons. Trois brèves : la meute se disperse. Deux longues : elle se referme.",
  },
  {
    id: 'ceinture_du_gabelou',
    name: 'Ceinture du gabelou',
    slot: 'ceinture',
    rarity: 'rare',
    effects: [{ kind: 'income_bp', bp: 10600 }],
    lore: "Douze bourses cousues à la file, dont neuf officielles. Le prévôt la faisait vérifier tous les mois, ce qui explique pourquoi il n'en trouvait jamais que neuf.",
  },
  {
    id: 'chapeau_cire_du_gabelou',
    name: 'Chapeau ciré du gabelou',
    slot: 'tete',
    rarity: 'rare',
    setId: 'attirail_gabelou',
    effects: [{ kind: 'resist_bp', bp: 900 }],
    lore: "Feutre passé à la cire chaude, bord rabattu à l'arrière pour laisser couler la pluie dans le dos et non dans le col. Détail d'homme qui a beaucoup attendu dehors.",
  },
  {
    id: 'bottes_du_chemin_de_sel',
    name: 'Bottes du chemin de sel',
    slot: 'pieds',
    rarity: 'rare',
    setId: 'attirail_gabelou',
    effects: [{ kind: 'movement', value: 250 }],
    lore: "Tige haute, couture au poix, semelle qui ne prend pas le sel. Elles ont fait le trajet du Lac à la Maison du Trésor mille fois, toujours dans le même sens le matin.",
  },
  {
    id: 'sifflet_de_la_halle',
    name: 'Sifflet de la halle',
    slot: 'cou',
    rarity: 'rare',
    setId: 'attirail_gabelou',
    effects: [{ kind: 'trade_bp', bp: 10800 }],
    lore: "Étain coulé, deux notes seulement : ouverture du marché, fermeture du marché. En trente ans, il n'a servi à rien d'autre, et cela suffisait à régler une ville.",
  },
  {
    id: 'des_a_coudre_dacier',
    name: "Dés à coudre d'acier",
    slot: 'mains',
    rarity: 'rare',
    setId: 'parure_grenadieres',
    effects: [
      { kind: 'morale', value: 1 },
      { kind: 'defense_bp', bp: 10500 },
    ],
    lore: "Trois dés d'acier bleui, gravés d'une grenade ouverte, forgés à la demande de l'atelier de Cervières. On y coud sous la mitraille comme on y coud à l'établi.",
  },
  {
    id: 'corsage_brode_de_grenades',
    name: 'Corsage brodé de grenades',
    slot: 'torse',
    rarity: 'rare',
    setId: 'parure_grenadieres',
    effects: [{ kind: 'defense_bp', bp: 10800 }],
    primary: { garde: 1 },
    lore: "Toile forte doublée de futaine, semée de grenades au fil d'or serré à six brins. La broderie est si dense qu'elle arrête une pointe mal lancée.",
  },
  {
    id: 'banniere_aux_grenades_dor',
    name: "Bannière aux grenades d'or",
    slot: 'banniere',
    rarity: 'rare',
    setId: 'parure_grenadieres',
    effects: [{ kind: 'morale', value: 2 }],
    lore: "Champ grenat, neuf grenades d'or ouvertes, franges tirées à la main. L'atelier en livre une par génération, et refuse absolument d'en faire copie.",
  },
  {
    id: 'plastron_dardoise',
    name: "Plastron d'ardoise",
    slot: 'torse',
    rarity: 'rare',
    effects: [{ kind: 'defense_bp', bp: 10700 }],
    lore: "Lames d'ardoise rivetées sur cuir, comme on en barde les sangliers cuirassés. Lourd, bruyant, et remarquablement efficace contre les carreaux.",
  },
  {
    id: 'lanterne_des_sagnes',
    name: 'Lanterne des Sagnes',
    slot: 'mains',
    rarity: 'rare',
    effects: [
      { kind: 'vision', value: 2 },
      { kind: 'mana_regen', value: 1 },
    ],
    lore: "Fer-blanc, corne à la place du verre, mèche de jonc. Elle brûle dans la brume du col là où toute autre flamme s'étouffe au bout de dix pas.",
  },
  {
    id: 'anneau_du_carrier',
    name: 'Anneau du carrier',
    slot: 'anneau2',
    rarity: 'rare',
    effects: [{ kind: 'siege_damage_bp', bp: 11200 }],
    lore: "Fer brut, large, porté au majeur pour amortir le manche de la masse. Celui qui le portait savait, dit-on, entendre où la pierre allait céder.",
  },
  {
    id: 'echarpe_de_brume',
    name: 'Écharpe de brume',
    slot: 'cou',
    rarity: 'rare',
    effects: [{ kind: 'resist_bp', bp: 1200 }],
    lore: "Laine filée si fine qu'on la voit mal, même sur soi, même en plein jour. Les prieures du col en tissent trois par hiver et n'en vendent aucune.",
  },
  {
    id: 'collier_de_brume',
    name: 'Collier de brume',
    slot: 'cou',
    rarity: 'rare',
    effects: [{ kind: 'resist_bp', bp: 1500 }],
    primary: { mystique: 1 },
    lore: "Anneaux d'argent enfilés sur un crin, tellement ternis qu'ils prennent la couleur de l'air. On le retrouve toujours au fond du coffre, jamais là où on l'a posé.",
  },
];

/* ── Majeurs ─────────────────────────────────────────────────────────────── */

const MAJEURS: readonly Row[] = [
  {
    id: 'haubert_dardoise',
    name: "Haubert d'ardoise",
    slot: 'torse',
    rarity: 'majeur',
    effects: [{ kind: 'defense_bp', bp: 11200 }],
    primary: { garde: 2 },
    lore: "Maille doublée d'écailles de schiste, œuvre de la forge comtale pour un castellan qui ne comptait pas manœuvrer. Lourd comme un toit, sûr comme un toit.",
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
    lore: "Peau de mouton montée sur deux rouleaux, corrigée trois fois par trois mains différentes. Les raccourcis y sont dessinés à l'encre plus pâle, pour qu'un œil pressé ne les voie pas.",
  },
  {
    id: 'heaume_du_banneret',
    name: 'Heaume du banneret',
    slot: 'tete',
    rarity: 'majeur',
    effects: [
      { kind: 'morale', value: 2 },
      { kind: 'first_strike_bp', bp: 10500 },
    ],
    primary: { vaillance: 1 },
    lore: "Bassinet à visière relevée, cimier de crin teint en grenat, bosselé au front par un coup qui aurait dû finir la discussion. Il se voit de loin, ce qui est tout l'intérêt.",
  },
  {
    id: 'gantelet_du_forgeron',
    name: 'Gantelet du forgeron',
    slot: 'mains',
    rarity: 'majeur',
    effects: [
      { kind: 'defense_bp', bp: 11000 },
      { kind: 'resist_bp', bp: 800 },
    ],
    primary: { garde: 1 },
    lore: "Un seul gantelet, celui de la main gauche, celle qui tient la pièce dans le feu. Le maître de la forge comtale l'a porté quarante ans et ne s'est jamais brûlé.",
  },
  {
    id: 'anneau_de_la_futaie',
    name: 'Anneau de la futaie',
    slot: 'anneau1',
    rarity: 'majeur',
    effects: [
      { kind: 'terrain_cost_bp', terrain: 'foret', bp: 8200 },
      { kind: 'summon_bp', bp: 11000 },
    ],
    primary: { mystique: 1 },
    lore: "Un cerceau de bois de fayard tordu vert puis séché, sans une jointure visible. Les gardes-futaie affirment qu'il a poussé ainsi, ce qui est peut-être vrai.",
  },
  {
    id: 'ceinture_aux_douze_bourses',
    name: 'Ceinture aux douze bourses',
    slot: 'ceinture',
    rarity: 'majeur',
    setId: 'attirail_gabelou',
    effects: [
      { kind: 'income_bp', bp: 11000 },
      { kind: 'trade_bp', bp: 10800 },
    ],
    lore: "La ceinture du dernier grand prévôt du sel, celle des inventaires officiels : douze bourses, douze sceaux, douze registres. On n'a jamais retrouvé le douzième registre.",
  },
  {
    id: 'bottes_de_sept_layons',
    name: 'Bottes des sept layons',
    slot: 'pieds',
    rarity: 'majeur',
    effects: [
      { kind: 'movement', value: 350 },
      { kind: 'terrain_cost_bp', terrain: 'humide', bp: 8800 },
    ],
    lore: "Cuir graissé au suif de cerf, lacé jusqu'au genou, semelle cousue de sept coutures. Elles connaissent les sept layons de Viscomtat mieux que celui qui les chausse.",
  },
  {
    id: 'etendard_du_serment',
    name: 'Étendard du serment',
    slot: 'banniere',
    rarity: 'majeur',
    effects: [
      { kind: 'morale', value: 2 },
      { kind: 'first_strike_bp', bp: 10800 },
    ],
    primary: { vaillance: 1 },
    lore: "Il a été déployé sur la pierre levée du col le jour où les maisons du Forez ont juré ensemble, et replié le soir même. On ne le sort que pour rappeler ce serment.",
  },
  {
    id: 'calice_de_lhermitage',
    name: "Calice de l'Hermitage",
    slot: 'mains',
    rarity: 'majeur',
    effects: [
      { kind: 'heal_bp', bp: 12000 },
      { kind: 'mana_regen', value: 2 },
    ],
    primary: { mystique: 1 },
    lore: "Étain, pied large, aucune gravure : les prieures ont toujours refusé qu'on l'orne. Rempli à la source du vallon, il ne se vide pas tout à fait avant le dernier blessé.",
  },
  {
    id: 'couronne_comtale_de_forez',
    name: 'Couronne comtale du Forez',
    slot: 'tete',
    rarity: 'majeur',
    setId: 'regalia_forez',
    effects: [{ kind: 'morale', value: 1 }],
    primary: { vaillance: 1, garde: 1, mystique: 1, savoir: 1 },
    lore: "Un cercle d'or bas, sans pierres, alourdi de huit fleurons de granit poli — le pays y tient plus de place que le métal. Aucun prétendant ne la porte tant que le Grand Livre n'est pas ouvert.",
  },
  {
    id: 'collier_des_serments',
    name: 'Collier des serments',
    slot: 'cou',
    rarity: 'majeur',
    setId: 'regalia_forez',
    effects: [
      { kind: 'morale', value: 1 },
      { kind: 'resist_bp', bp: 1400 },
    ],
    primary: { garde: 1 },
    lore: "Une chaîne de maillons plats, un par maison vassale, gravés du nom de celui qui a juré le premier. Trois maillons sont vierges : on n'a jamais su s'il s'agissait d'un oubli ou d'une prudence.",
  },
  {
    id: 'anneau_du_grand_livre',
    name: 'Anneau du Grand Livre',
    slot: 'anneau1',
    rarity: 'majeur',
    setId: 'regalia_forez',
    effects: [
      { kind: 'income_bp', bp: 11000 },
      { kind: 'xp_bp', bp: 10800 },
    ],
    primary: { savoir: 1 },
    lore: "Le sceau du comté monté en bague : un chaton d'or gravé en creux d'une borne et de deux clefs. Sans lui, une charte n'est qu'une feuille bien écrite.",
  },
];

/* ── Reliques ────────────────────────────────────────────────────────────── */

const RELIQUES: readonly Row[] = [
  {
    id: 'escarboucle_de_vouivre',
    name: 'Escarboucle de vouivre',
    slot: 'relique',
    rarity: 'relique',
    effects: [
      { kind: 'spell_power_bp', bp: 12500 },
      { kind: 'mana_max_bp', bp: 12000 },
    ],
    primary: { mystique: 3, savoir: 2 },
    lore: "Une pierre rouge de la taille d'un poing, chaude au toucher, qui éclaire la vallée quand la vouivre la pose sur la berge pour boire. Trois hommes ont essayé de la prendre ; on a retrouvé un chapeau. La rivière la réclame chaque nuit, et il vaut mieux la lui rendre avant de mourir.",
  },
  {
    id: 'sceptre_des_comtes',
    name: 'Sceptre des comtes',
    slot: 'relique',
    rarity: 'relique',
    setId: 'regalia_forez',
    effects: [
      { kind: 'morale', value: 2 },
      { kind: 'income_bp', bp: 11500 },
    ],
    primary: { vaillance: 2, garde: 2 },
    lore: "Une hampe de chêne noircie, une pomme de granit, une virole d'or ternie. Il n'a jamais servi à frapper personne, et c'est précisément là son pouvoir : on le tend, et la salle se tait.",
  },
  {
    id: 'ramure_du_cerf_miraculeux',
    name: 'Ramure du Cerf miraculeux',
    slot: 'relique',
    rarity: 'relique',
    effects: [
      { kind: 'heal_bp', bp: 15000 },
      { kind: 'mana_regen', value: 3 },
    ],
    primary: { mystique: 2, savoir: 1 },
    lore: "Une ramure de douze cors, tombée d'elle-même au bord du bassin le jour de la grande gelée et jamais ramassée par personne d'autre qu'une prieure. L'eau s'y accroche encore en gouttes qui ne sèchent pas. Ce qu'elle touche cesse de pourrir.",
  },
  {
    /* L'identifiant reste `pierre_de_pamole` (sauvegardes) ; le nom affiché
       distingue l'éclat portable de la Pierre elle-même, dressée depuis le
       lot 1.7 sur son sommet, qui donne +1 de vaillance à qui la touche. */
    id: 'pierre_de_pamole',
    name: 'Éclat de Pamole',
    slot: 'relique',
    rarity: 'relique',
    effects: [
      { kind: 'defense_bp', bp: 12000 },
      { kind: 'resist_bp', bp: 2000 },
    ],
    primary: { garde: 3 },
    lore: "Un éclat détaché du flanc même de la Pierre, à mille cent soixante-cinq mètres, qui pèse trois fois ce qu'il devrait peser. Posé au sol, on ne le déplace plus. Les carriers de Vollore prétendent qu'il continue lentement de grandir.",
  },
  {
    id: 'clef_de_la_maison_du_tresor',
    name: 'Clef de la Maison du Trésor',
    slot: 'relique',
    rarity: 'relique',
    effects: [
      { kind: 'income_bp', bp: 12000 },
      { kind: 'trade_bp', bp: 12000 },
    ],
    primary: { savoir: 2, garde: 1 },
    lore: "Une clef de fer à double panneton, longue comme l'avant-bras, dont on ignore laquelle des trois serrures elle ouvre. Elle a servi aux gabelous à marquer la limite entre pays de gabelle et pays franc. Celui qui la porte perçoit sur les deux.",
  },
  {
    id: 'serre_du_griffon_couronne',
    name: 'Serre du Griffon couronné',
    slot: 'relique',
    rarity: 'relique',
    effects: [
      { kind: 'first_strike_bp', bp: 11500 },
      { kind: 'flank_bp', bp: 11500 },
    ],
    primary: { vaillance: 3 },
    lore: "Une serre entière, montée en crochet sur une garde de cuir, cédée et non arrachée — la distinction compte beaucoup pour les fauconniers de Pamole. Elle a l'air de vouloir se refermer quand une ombre passe au-dessus. Le vieux mâle, dit-on, sait toujours où elle est.",
  },
  {
    id: 'manteau_de_la_dame_des_brumes',
    name: 'Manteau de la Dame des Brumes',
    slot: 'torse',
    rarity: 'relique',
    effects: [
      { kind: 'resist_bp', bp: 2500 },
      { kind: 'spell_power_bp', bp: 11500 },
    ],
    primary: { mystique: 2, savoir: 1 },
    lore: "Une laine grise tissée au prieuré haut du col, si peu contrastée qu'on perd de vue celui qui la porte en tournant la tête. Elle n'est ni chaude ni imperméable. Elle est ailleurs, et elle vous emmène avec elle.",
  },
  {
    id: 'bourdon_du_premier_pelerin',
    name: 'Bourdon du premier pèlerin',
    slot: 'mains',
    rarity: 'relique',
    effects: [
      { kind: 'mana_regen', value: 4 },
      { kind: 'mana_max_bp', bp: 13000 },
      { kind: 'morale', value: 1 },
    ],
    primary: { savoir: 3, mystique: 1 },
    lore: "Le bâton de celui qui monta le premier au vallon de l'Hermitage, avant qu'il n'y ait chapelle, hospice ou chemin. Le bois a la dureté de la pierre et porte soixante-dix-huit encoches, une par croix relevée. Planté en terre, il fait remonter l'eau ; on ne s'en sert plus pour cela.",
  },
];

/* ── Ensembles ───────────────────────────────────────────────────────────── */

export const ARTIFACT_SETS: readonly ArtifactSetDef[] = [
  {
    id: 'parure_grenadieres',
    name: 'Parure des Grenadières',
    lore: "L'atelier de Cervières livre une parure complète par génération, et la reprend à la mort de celle qui la portait. Dés, corsage et bannière ont été faits ensemble, au même fil, sur le même métier.",
    pieces: ['des_a_coudre_dacier', 'corsage_brode_de_grenades', 'banniere_aux_grenades_dor'],
    bonusText: 'Parure complète : +1 au moral et +5 % en défense pour toute l’armée.',
  },
  {
    id: 'attirail_gabelou',
    name: 'Attirail du Gabelou',
    lore: "Chapeau, sifflet, ceinture et bottes : l'équipement réglementaire d'un prévôt du sel, tel qu'il figure à l'inventaire de la halle. Réuni, il donne à son porteur l'autorité tranquille de celui qui a le droit d'arrêter une charrette.",
    pieces: [
      'chapeau_cire_du_gabelou',
      'sifflet_de_la_halle',
      'ceinture_aux_douze_bourses',
      'bottes_du_chemin_de_sel',
    ],
    bonusText: 'Attirail complet : +10 % de revenu et +10 % au change du marché.',
  },
  {
    id: 'regalia_forez',
    name: 'Regalia des Comtes du Forez',
    lore: "Couronne, collier, anneau et sceptre : les quatre pièces déposées dans la Maison du Trésor à la mort du dernier comte. Les réunir ne fait pas un comte, mais aucun comte n'a jamais régné sans elles.",
    pieces: [
      'couronne_comtale_de_forez',
      'collier_des_serments',
      'anneau_du_grand_livre',
      'sceptre_des_comtes',
    ],
    bonusText:
      'Regalia complètes : +2 au moral, +1 à la fortune et +15 % de revenu sur tout le domaine.',
  },
];

/* ── Assemblage ──────────────────────────────────────────────────────────── */

function build(): ArtifactDef[] {
  const rows: readonly Row[] = [...COMMUNS, ...RARES, ...MAJEURS, ...RELIQUES];
  return rows.map((row) => ({ ...row, icon: `artefact_${row.id}` }));
}

export const ARTIFACT_LIST: readonly ArtifactDef[] = build();

export const ARTIFACTS: Readonly<Record<ArtifactId, ArtifactDef>> = indexById(ARTIFACT_LIST);

/** Pièces d'un ensemble, dans l'ordre où le codex les présente. */
export function artifactsOfSet(setId: string): ArtifactDef[] {
  return ARTIFACT_LIST.filter((a) => a.setId === setId);
}

/** Artefacts d'une rareté donnée : sert au tirage des trésors de la carte. */
export function artifactsOfRarity(rarity: ArtifactDef['rarity']): ArtifactDef[] {
  return ARTIFACT_LIST.filter((a) => a.rarity === rarity);
}
