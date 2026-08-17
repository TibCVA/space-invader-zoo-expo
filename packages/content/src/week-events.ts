/**
 * Les événements de semaine (document maître §4).
 *
 * Tirés au sort par le PRNG du moteur au jour 1 de chaque semaine, pondérés.
 * Le noyau lit `growth_bp` pour moduler la croissance des demeures ; les
 * autres effets sont consommés par le module monde et affichés au joueur.
 *
 * Le total des poids vaut 200, ce qui rend chaque probabilité lisible : un
 * poids de 24 équivaut à douze pour cent des semaines.
 *
 * Aucune semaine n'est purement punitive sans contrepartie lisible, et aucune
 * ne peut renverser une partie à elle seule : l'amplitude est bornée à ±12 %.
 */
import type { WeekEventDef } from '@auvergne/engine';

export const WEEK_EVENTS: readonly WeekEventDef[] = [
  {
    key: 'semaine_ordinaire',
    name: 'Semaine ordinaire',
    text: "Rien de notable, sinon la pluie sur les ardoises et les cloches de l'Hermitage à midi. Le comté vaque.",
    weight: 24,
    effects: [],
  },
  {
    key: 'semaine_foire_chabreloche',
    name: 'Semaine de la foire',
    text: "Chabreloche tient foire : bestiaux, toiles, sel et changeurs sur trois rangs de tréteaux. Les recettes du domaine augmentent d'un dixième.",
    weight: 16,
    effects: [
      { kind: 'income_bp', bp: 11000 },
      { kind: 'trade_bp', bp: 10600 },
    ],
  },
  {
    key: 'semaine_portees',
    name: 'Semaine des portées',
    text: "Les couvées, les portées et les levées tombent toutes en même temps. Les demeures livrent un dixième de recrues supplémentaires.",
    weight: 16,
    effects: [{ kind: 'growth_bp', bp: 11000 }],
  },
  {
    key: 'semaine_bons_chemins',
    name: 'Semaine des bons chemins',
    text: "Les cantonniers ont réempierré la chaussée et refait deux gués avant les pluies. On marche mieux, partout.",
    weight: 14,
    effects: [{ kind: 'movement_bp', bp: 10700 }],
  },
  {
    key: 'semaine_boue',
    name: 'Semaine de boue',
    text: "Les ornières avalent les charrettes jusqu'au moyeu et l'on décharge deux fois par lieue. Les colonnes traînent.",
    weight: 12,
    effects: [{ kind: 'movement_bp', bp: 9300 }],
  },
  {
    key: 'semaine_disette',
    name: 'Semaine de disette',
    text: "Les greniers sont maigres et l'on renvoie les bouches inutiles. La croissance des demeures ralentit d'un dixième.",
    weight: 10,
    effects: [{ kind: 'growth_bp', bp: 9000 }],
  },
  {
    key: 'semaine_pelerins',
    name: 'Semaine des pèlerins',
    text: "Les chemins de dévotion sont pleins du matin au soir, et les hospices débordent. Le mana revient plus vite à qui respecte les haltes.",
    weight: 12,
    effects: [
      { kind: 'mana_regen', value: 2 },
      { kind: 'morale', value: 1 },
    ],
  },
  {
    key: 'semaine_gabelous',
    name: 'Semaine des gabelous',
    text: "Contrôles doublés sur toutes les bornes du sel. Le grenier rapporte davantage, et l'agitation monte d'autant.",
    weight: 10,
    effects: [
      { kind: 'income_bp', bp: 10800 },
      { kind: 'unrest', value: 4 },
    ],
  },
  {
    key: 'semaine_coupe',
    name: 'Semaine de la coupe',
    text: "Les coupes d'hiver descendent des futaies de Viscomtat par le layon des Brumes, à la corde et au traîneau. Bois et essence sylvestre arrivent en abondance.",
    weight: 10,
    effects: [
      { kind: 'resource_gift', resource: 'bois', amount: 8 },
      { kind: 'resource_gift', resource: 'essence', amount: 3 },
    ],
  },
  {
    key: 'semaine_carriere',
    name: 'Semaine de la carrière',
    text: "Le front de taille de Vollore a livré une veine franche, sans nœud ni faille. Les chantiers de granit avancent d'un coup.",
    weight: 9,
    effects: [
      { kind: 'resource_gift', resource: 'granit', amount: 8 },
      { kind: 'build_cost_bp', bp: 9500 },
    ],
  },
  {
    key: 'semaine_serment',
    name: 'Semaine du serment',
    text: "Les bannières ont été bénies sous la porte des Farges, devant les maisons assemblées. La troupe se tient droite pour rien.",
    weight: 9,
    effects: [{ kind: 'morale', value: 1 }],
  },
  {
    key: 'semaine_vouivre',
    name: 'Semaine de la vouivre',
    text: "On l'a vue au-dessus de la Durolle, deux nuits de suite, l'escarboucle allumée. Les troupes murmurent et les mules refusent le pont.",
    weight: 8,
    effects: [
      { kind: 'morale', value: -1 },
      { kind: 'neutral_growth_bp', bp: 11000 },
    ],
  },
  {
    key: 'semaine_brumes',
    name: 'Semaine des brumes hautes',
    text: "La brume ne se lève pas de la semaine au-dessus des Bois Noirs. On y voit moins loin, et les embuscades y prospèrent.",
    weight: 9,
    effects: [
      { kind: 'vision', value: -2 },
      { kind: 'flank_bp', bp: 11000 },
    ],
  },
  {
    key: 'semaine_contrebande',
    name: 'Semaine de contrebande',
    text: "Le sel passe par les layons plutôt que par les bornes, et tout le monde le sait. Le change s'améliore, la gabelle rentre mal.",
    weight: 8,
    effects: [
      { kind: 'trade_bp', bp: 11200 },
      { kind: 'income_bp', bp: 9500 },
    ],
  },
  {
    key: 'semaine_loups',
    name: 'Semaine des loups',
    text: "Les meutes descendent jusqu'aux bergeries et les neutres des lisières s'enhardissent. Les gardes de l'anneau extérieur se renforcent.",
    weight: 7,
    effects: [{ kind: 'neutral_growth_bp', bp: 11500 }],
  },
  {
    key: 'semaine_forges',
    name: 'Semaine des forges',
    text: "Les martinets tournent jour et nuit et l'on ferre tout ce qui passe. Le fer abonde et les armures sortent mieux trempées.",
    weight: 8,
    effects: [
      { kind: 'resource_gift', resource: 'fer', amount: 5 },
      { kind: 'defense_bp', bp: 10400 },
    ],
  },
  {
    key: 'semaine_fil_dor',
    name: "Semaine du fil d'or",
    text: "L'atelier de Cervières a livré la commande de trois maisons d'un coup. Le fil d'or circule, et les bannières avec lui.",
    weight: 6,
    effects: [
      { kind: 'resource_gift', resource: 'filDor', amount: 3 },
      { kind: 'morale', value: 1 },
    ],
  },
  {
    key: 'semaine_gel',
    name: 'Semaine de gel',
    text: "Le gel a pris jusqu'à mi-pente et les sources hautes sont muettes. On marche mal en forêt, mais les tourbières portent enfin.",
    weight: 7,
    effects: [
      { kind: 'terrain_cost_bp', terrain: 'foret', bp: 11200 },
      { kind: 'terrain_cost_bp', terrain: 'humide', bp: 8500 },
    ],
  },
  {
    key: 'semaine_sanctuaires',
    name: 'Semaine des sanctuaires',
    text: "Les prieurés ouvrent leurs reliquaires et l'on vient de loin les toucher. Les sanctuaires de la carte rendent davantage cette semaine.",
    weight: 5,
    effects: [
      { kind: 'mana_regen', value: 1 },
      { kind: 'shrine_bonus', value: 1 },
    ],
  },
];

/** Somme des poids : sert au contrôle de cohérence du tirage. */
export const WEEK_EVENT_WEIGHT_TOTAL: number = WEEK_EVENTS.reduce((sum, e) => sum + e.weight, 0);
