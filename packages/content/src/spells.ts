/**
 * Les trente-deux sorts : quatre écoles de huit degrés (document maître §10).
 *
 * Identifiants imposés : `braises_1`…`braises_8`, `sources_1`…, `brumes_1`…,
 * `racines_1`…. Les noms sont exactement ceux du document maître.
 *
 * Les écoles ont des tempéraments distincts :
 *  - Braises : forge, feu, attaque et siège — presque tout est offensif ;
 *  - Sources : soin, eau, protection et déplacement ;
 *  - Brumes  : dissimulation, illusion, initiative — la plus « carte » ;
 *  - Racines : terrain, entrave, invocation et défense.
 *
 * Tous les effets sont typés (`SpellEffect`) : aucune valeur n'est codée dans
 * l'interface, tout se modifie ici sans recompiler la vue (document §10).
 */
import type { SpellDef, SpellId, SpellSchool } from '@auvergne/engine';
import { indexById } from './util.js';

interface SpellRow {
  level: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  name: string;
  cost: number;
  target: SpellDef['target'];
  scope: SpellDef['scope'];
  effects: SpellDef['effects'];
  description: string;
}

/* ── Braises ─────────────────────────────────────────────────────────────── */

const BRAISES: readonly SpellRow[] = [
  {
    level: 1,
    name: 'Étincelle des Farges',
    cost: 5,
    target: 'enemy_stack',
    scope: 'combat',
    effects: [{ kind: 'damage', base: 10, perMystique: 4, element: 'braises' }],
    description:
      "Une gerbe d'étincelles arrachée à l'enclume, jetée à la face de l'ennemi. Le premier tour de main que l'on apprend à la Guilde, et celui que l'on garde toute sa vie.",
  },
  {
    level: 2,
    name: 'Acier tempéré',
    cost: 7,
    target: 'ally_stack',
    scope: 'combat',
    effects: [
      { kind: 'buff', stat: 'attack', value: 2, turns: 3 },
      { kind: 'buff', stat: 'defense', value: 1, turns: 3 },
    ],
    description:
      "Les lames rougeoient un instant, puis reprennent leur gris : elles ont été retrempées en pleine bataille. Les coups portent plus loin et les plates encaissent mieux.",
  },
  {
    level: 3,
    name: 'Cendre aux yeux',
    cost: 9,
    target: 'enemy_stack',
    scope: 'combat',
    effects: [
      { kind: 'blind', turns: 2 },
      { kind: 'debuff', stat: 'initiative', value: 3, turns: 2 },
    ],
    description:
      "Un tourbillon de cendre brûlante, exactement celui qui monte au visage quand on ouvre le foyer trop vite. On ne meurt pas de cendre ; on cesse simplement de viser quoi que ce soit.",
  },
  {
    level: 4,
    name: 'Trait incandescent',
    cost: 12,
    target: 'line',
    scope: 'combat',
    effects: [{ kind: 'damage', base: 26, perMystique: 8, element: 'braises' }],
    description:
      "Une barre de métal en fusion tirée d'un bout à l'autre du champ, qui traverse tout ce qui se trouve sur sa ligne. L'air garde son odeur de forge jusqu'au soir.",
  },
  {
    level: 5,
    name: 'Mur de braises',
    cost: 15,
    target: 'hex',
    scope: 'combat',
    effects: [{ kind: 'wall', hexes: 3, turns: 3, damage: 14 }],
    description:
      "Un lit de charbons ardents se lève du sol et interdit le passage sur trois hexagones. Qui insiste passe, mais il paie le péage en chair brûlée.",
  },
  {
    level: 6,
    name: 'Marteau rouge',
    cost: 18,
    target: 'enemy_stack',
    scope: 'combat',
    effects: [
      { kind: 'damage', base: 44, perMystique: 12, element: 'braises' },
      { kind: 'debuff', stat: 'defense', value: 3, turns: 2 },
    ],
    description:
      "Le geste du forgeron, à l'échelle d'une bataille : un seul coup, porté à l'endroit exact où la pièce cède. Ce qui n'est pas détruit sort de là déformé.",
  },
  {
    level: 7,
    name: 'Fournaise du rempart',
    cost: 22,
    target: 'all_enemies',
    scope: 'combat',
    effects: [
      { kind: 'damage', base: 34, perMystique: 10, element: 'braises' },
      { kind: 'debuff', stat: 'speed', value: 1, turns: 2 },
    ],
    description:
      "L'air entre les murs devient celui d'un four à chaux. Les assiégeants comme les assiégés respirent la même chose ; c'est pourquoi on ne le lance qu'en dernier ressort.",
  },
  {
    level: 8,
    name: 'Couronne de feu ancien',
    cost: 28,
    target: 'all_enemies',
    scope: 'combat',
    effects: [
      { kind: 'damage', base: 52, perMystique: 14, element: 'braises' },
      { kind: 'debuff', stat: 'attack', value: 2, turns: 3 },
    ],
    description:
      "Un cercle de flammes basses, du même rouge que les braises sous la cendre au petit matin, se referme sur toute une armée. Les vieux textes disent que c'est le feu d'avant les forges, celui qu'on n'a pas allumé.",
  },
];

/* ── Sources ─────────────────────────────────────────────────────────────── */

const SOURCES: readonly SpellRow[] = [
  {
    level: 1,
    name: 'Rosée vive',
    cost: 4,
    target: 'ally_stack',
    scope: 'combat',
    effects: [{ kind: 'heal', base: 14, perMystique: 5, resurrect: false }],
    description:
      "Une buée froide se dépose sur les blessures et les referme comme la rosée referme la terre. Elle ne rend pas les morts, seulement les vivants à eux-mêmes.",
  },
  {
    level: 2,
    name: 'Gué clair',
    cost: 6,
    target: 'adventure',
    scope: 'aventure',
    effects: [{ kind: 'movement', value: 450 }],
    description:
      "L'eau se retire d'un pas sur chaque rive et découvre les dalles du gué. La colonne traverse sans se mouiller les jarrets, ce qui vaut une demi-journée de marche.",
  },
  {
    level: 3,
    name: 'Eau réparatrice',
    cost: 9,
    target: 'ally_stack',
    scope: 'combat',
    effects: [{ kind: 'heal', base: 32, perMystique: 9, resurrect: true }],
    description:
      "L'eau des Sagnes, appelée par son nom, rejoint la pile et remet debout ceux qui viennent de tomber. Au-delà d'un certain temps, elle ne les reconnaît plus.",
  },
  {
    level: 4,
    name: 'Voile de pluie',
    cost: 11,
    target: 'all_allies',
    scope: 'les_deux',
    effects: [
      { kind: 'shield', bp: 1500, turns: 3 },
      { kind: 'weather_shift' },
    ],
    description:
      "Une averse fine se met à tomber juste au-dessus de la troupe et nulle part ailleurs. Elle amortit les traits, éteint les braises et déplace le front d'un jour.",
  },
  {
    level: 5,
    name: 'Source miraculeuse',
    cost: 15,
    target: 'ally_stack',
    scope: 'combat',
    effects: [
      { kind: 'heal', base: 46, perMystique: 14, resurrect: true },
      { kind: 'dispel' },
    ],
    description:
      "Une source jaillit là où il n'y en avait pas, le temps de trois gorgées. Elle lave les blessures, les poisons et les mauvais sorts avec la même indifférence.",
  },
  {
    level: 6,
    name: 'Courant de la Durolle',
    cost: 18,
    target: 'all_allies',
    scope: 'combat',
    effects: [
      { kind: 'buff', stat: 'speed', value: 2, turns: 3 },
      { kind: 'buff', stat: 'initiative', value: 3, turns: 3 },
    ],
    description:
      "La rivière prête son allant : on marche comme si le sol descendait toujours. Les moulins de la vallée tournent plus vite pendant que le sort tient.",
  },
  {
    level: 7,
    name: 'Lit de la Vierge',
    cost: 22,
    target: 'all_allies',
    scope: 'combat',
    effects: [
      { kind: 'heal', base: 40, perMystique: 12, resurrect: true },
      { kind: 'shield', bp: 1200, turns: 2 },
    ],
    description:
      "Le vallon de l'Hermitage étend sa protection sur toute une armée, comme il l'étend sur les pèlerins qui y dorment. On se réveille entier, et l'on ne sait pas très bien pourquoi.",
  },
  {
    level: 8,
    name: "Fontaine de l'Alliance",
    cost: 28,
    target: 'all_allies',
    scope: 'combat',
    effects: [
      { kind: 'heal', base: 60, perMystique: 18, resurrect: true },
      { kind: 'dispel' },
      { kind: 'shield', bp: 2000, turns: 3 },
    ],
    description:
      "L'eau des sept vallons remonte d'un coup au même endroit, comme le jour où le premier pacte fut juré. Ce qui a été promis à la forêt est rendu ; ce qui a été fait à la troupe est défait.",
  },
];

/* ── Brumes ──────────────────────────────────────────────────────────────── */

const BRUMES: readonly SpellRow[] = [
  {
    level: 1,
    name: 'Brume basse',
    cost: 5,
    target: 'all_enemies',
    scope: 'combat',
    effects: [{ kind: 'debuff', stat: 'initiative', value: 2, turns: 3 }],
    description:
      "La brume des fonds monte à hauteur de genou et brouille les repères. Personne n'y voit rien de plus, mais tout le monde y réfléchit un peu plus longtemps.",
  },
  {
    level: 2,
    name: 'Pas effacé',
    cost: 6,
    target: 'adventure',
    scope: 'aventure',
    effects: [{ kind: 'movement', value: 350 }],
    description:
      "Les traces se referment derrière la colonne : ni ornière, ni empreinte, ni brin d'herbe couché. On avance plus vite quand on n'a plus à couvrir sa marche.",
  },
  {
    level: 3,
    name: 'Reflet du Lac',
    cost: 8,
    target: 'adventure',
    scope: 'aventure',
    effects: [{ kind: 'vision', radius: 14 }],
    description:
      "On se penche sur une flaque et l'on y voit le pays vu d'en haut, à l'envers, parfaitement net. Le hameau du Lac a donné son nom au sort, pas l'inverse.",
  },
  {
    level: 4,
    name: 'Chouette silencieuse',
    cost: 11,
    target: 'ally_stack',
    scope: 'combat',
    effects: [
      { kind: 'buff', stat: 'initiative', value: 4, turns: 3 },
      { kind: 'buff', stat: 'speed', value: 1, turns: 3 },
    ],
    description:
      "Le vol de la hulotte ne fait aucun bruit parce que ses plumes sont frangées. Le sort accorde la même frange à une pile entière : elle arrive avant qu'on l'entende.",
  },
  {
    level: 5,
    name: 'Brouillard de Pamole',
    cost: 14,
    target: 'adventure',
    scope: 'aventure',
    effects: [{ kind: 'reveal_map', radius: 26 }],
    description:
      "Le brouillard monte jusqu'à la Pierre Pamole et retombe en dessous du regard. Un instant, on domine toute la lande comme un rapace au-dessus de la mer de nuages.",
  },
  {
    level: 6,
    name: 'Échange des ombres',
    cost: 17,
    target: 'any_stack',
    scope: 'combat',
    effects: [{ kind: 'swap' }],
    description:
      "Deux ombres se croisent sur le pré et repartent avec le corps de l'autre. Le tireur se retrouve au contact, le colosse se retrouve seul au fond du champ.",
  },
  {
    level: 7,
    name: 'Nuit des Bois Noirs',
    cost: 21,
    target: 'all_enemies',
    scope: 'combat',
    effects: [
      { kind: 'blind', turns: 2 },
      { kind: 'debuff', stat: 'attack', value: 3, turns: 3 },
    ],
    description:
      "La nuit des sapinières, celle où l'on ne distingue plus sa propre main, tombe en plein midi. Les archers baissent leur arc d'eux-mêmes : tirer serait tirer sur les siens.",
  },
  {
    level: 8,
    name: 'Voile du Forez',
    cost: 27,
    target: 'all_allies',
    scope: 'combat',
    effects: [
      { kind: 'shield', bp: 2500, turns: 4 },
      { kind: 'buff', stat: 'defense', value: 4, turns: 4 },
    ],
    description:
      "Toute une armée entre dans la brume et cesse d'avoir des contours. Les coups portent sur une silhouette qui n'est déjà plus là, et les prieures appellent cela de la simple politesse.",
  },
];

/* ── Racines ─────────────────────────────────────────────────────────────── */

const RACINES: readonly SpellRow[] = [
  {
    level: 1,
    name: 'Écorce du fayard',
    cost: 5,
    target: 'ally_stack',
    scope: 'combat',
    effects: [{ kind: 'buff', stat: 'defense', value: 3, turns: 3 }],
    description:
      "La peau se durcit et se craquelle comme l'écorce d'un vieux hêtre. Ce n'est pas confortable, mais un fayard de deux cents ans n'a jamais reculé.",
  },
  {
    level: 2,
    name: 'Ronce vive',
    cost: 7,
    target: 'enemy_stack',
    scope: 'combat',
    effects: [
      { kind: 'root', turns: 2 },
      { kind: 'damage', base: 8, perMystique: 3, element: 'racines' },
    ],
    description:
      "Des ronces sortent du sol en une seconde et prennent les jambes à la hauteur du mollet. Plus on tire dessus, plus elles serrent : c'est leur seule idée.",
  },
  {
    level: 3,
    name: 'Futaie vigilante',
    cost: 10,
    target: 'all_allies',
    scope: 'combat',
    effects: [
      { kind: 'buff', stat: 'defense', value: 2, turns: 3 },
      { kind: 'buff', stat: 'attack', value: 1, turns: 3 },
    ],
    description:
      "Les arbres du bord de champ se penchent d'un même mouvement, sans vent. La troupe se sent regardée par quelque chose de très ancien et de plutôt bienveillant.",
  },
  {
    level: 4,
    name: 'Appel de la meute',
    cost: 13,
    target: 'battlefield',
    scope: 'combat',
    effects: [{ kind: 'summon', creature: 'ermitage_t3', base: 3, perMystique: 1 }],
    description:
      "Trois notes de corne, et la sapinière rend ce qu'elle avait gardé. Les loups arrivent par le côté que personne ne surveillait, comme d'habitude.",
  },
  {
    level: 5,
    name: 'Racines profondes',
    cost: 16,
    target: 'all_enemies',
    scope: 'combat',
    effects: [
      { kind: 'debuff', stat: 'speed', value: 3, turns: 2 },
      { kind: 'root', turns: 1 },
    ],
    description:
      "Sous le pré, le réseau de racines se resserre d'un coup et le sol devient un filet. On ne tombe pas, on n'avance plus, ce qui est souvent pire.",
  },
  {
    level: 6,
    name: 'Pierre levée',
    cost: 19,
    target: 'hex',
    scope: 'combat',
    effects: [{ kind: 'wall', hexes: 4, turns: 4, damage: 0 }],
    description:
      "Un menhir sort du sol comme une dent, quatre hexagones de granit brut posés en travers du champ. Il retombera de lui-même ; on ne sait jamais tout à fait quand.",
  },
  {
    level: 7,
    name: 'Cercle des bornes',
    cost: 23,
    target: 'adventure',
    scope: 'aventure',
    effects: [{ kind: 'teleport' }],
    description:
      "Les bornes armoriées ne marquent pas seulement les limites : elles se répondent. Qui connaît la formule passe de l'une à l'autre en un pas, à condition de les avoir vues.",
  },
  {
    level: 8,
    name: 'Mémoire de la forêt',
    cost: 30,
    target: 'battlefield',
    scope: 'combat',
    effects: [
      { kind: 'summon', creature: 'ermitage_t6', base: 1, perMystique: 1 },
      { kind: 'buff', stat: 'defense', value: 3, turns: 3 },
    ],
    description:
      "La forêt se souvient de ce qu'elle a enterré, et elle le fait remonter. Les colosses se relèvent de leur lande avec la lenteur des choses qui n'ont jamais douté.",
  },
];

/* ── Assemblage ──────────────────────────────────────────────────────────── */

const SCHOOLS: [SpellSchool, readonly SpellRow[]][] = [
  ['braises', BRAISES],
  ['sources', SOURCES],
  ['brumes', BRUMES],
  ['racines', RACINES],
];

function buildAll(): SpellDef[] {
  const out: SpellDef[] = [];
  for (const [school, rows] of SCHOOLS) {
    for (const row of rows) {
      const id: SpellId = `${school}_${row.level}`;
      out.push({
        id,
        school,
        level: row.level,
        name: row.name,
        cost: row.cost,
        target: row.target,
        scope: row.scope,
        effects: row.effects,
        description: row.description,
        icon: `sort_${id}`,
      });
    }
  }
  return out;
}

export const SPELL_LIST: readonly SpellDef[] = buildAll();

export const SPELLS: Readonly<Record<SpellId, SpellDef>> = indexById(SPELL_LIST);

/** Écoles dans leur ordre canonique d'affichage au codex. */
export const SPELL_SCHOOLS: readonly SpellSchool[] = ['braises', 'sources', 'brumes', 'racines'];

/** Libellés français des quatre écoles. */
export const SPELL_SCHOOL_LABELS: Readonly<Record<SpellSchool, string>> = {
  braises: 'Braises',
  sources: 'Sources',
  brumes: 'Brumes',
  racines: 'Racines',
};

/** Sorts d'une école, du premier au huitième degré. */
export function spellsOfSchool(school: SpellSchool): SpellDef[] {
  return SPELL_LIST.filter((s) => s.school === school);
}
