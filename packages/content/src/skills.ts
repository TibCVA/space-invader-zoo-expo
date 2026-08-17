/**
 * Les vingt compétences secondaires (document maître §11.2).
 *
 * Trois rangs : Novice, Expert, Maître. Un héros en porte huit au maximum.
 * Tous les effets sont typés (`SkillEffect`) et exprimés en entiers ou en
 * points de base : aucune règle n'est écrite ici, seulement des données que le
 * moteur additionne.
 *
 * Convention de lecture des BP :
 *  - `movement_bp`, `income_bp`, `heal_bp`… : multiplicateurs, 10000 = neutre ;
 *  - `terrain_cost_bp`, `build_cost_bp` : coûts, en dessous de 10000 = remise ;
 *  - `resist_bp`, `summon_bp`, `xp_bp` : voir le module qui les consomme.
 */
import type { SkillDef, SkillEffect, SkillId } from '@auvergne/engine';
import { indexById } from './util.js';

const RANKS: [string, string, string] = ['Novice', 'Expert', 'Maître'];

interface SkillRow {
  id: SkillId;
  name: string;
  description: string;
  ranks?: [string, string, string];
  effects: [SkillEffect[], SkillEffect[], SkillEffect[]];
}

const ROWS: readonly SkillRow[] = [
  {
    id: 'logistique',
    name: 'Logistique',
    description:
      "L'art de faire tenir une colonne sur un chemin creux : ordre de marche, relais de mules, haltes comptées. Les journées s'allongent sans que la troupe s'épuise.",
    effects: [
      [{ kind: 'movement_bp', bp: 10800 }],
      [{ kind: 'movement_bp', bp: 11600 }],
      [
        { kind: 'movement_bp', bp: 12600 },
        { kind: 'movement', value: 150 },
      ],
    ],
  },
  {
    id: 'tactique',
    name: 'Tactique',
    description:
      "Choisir le terrain avant l'ennemi et poser ses piles où elles serviront. Chaque rang gagne des rangées de déploiement et un avantage au premier choc.",
    effects: [
      [{ kind: 'tactics_rows', value: 1 }],
      [
        { kind: 'tactics_rows', value: 1 },
        { kind: 'first_strike_bp', bp: 10600 },
      ],
      [
        { kind: 'tactics_rows', value: 2 },
        { kind: 'first_strike_bp', bp: 11200 },
      ],
    ],
  },
  {
    id: 'seigneurie',
    name: 'Seigneurie',
    description:
      "La troupe croit en son chef, et cela se voit dans la ligne. Le moral monte, les élans se multiplient, les paniques se raréfient.",
    effects: [
      [{ kind: 'morale', value: 1 }],
      [{ kind: 'morale', value: 2 }],
      [
        { kind: 'morale', value: 3 },
        { kind: 'first_strike_bp', bp: 10400 },
      ],
    ],
  },
  {
    id: 'intendance',
    name: 'Intendance',
    description:
      "Tenir les greniers, les registres et les corvées. Les revenus du domaine rentrent mieux et les chantiers coûtent un peu moins cher.",
    effects: [
      [{ kind: 'income_bp', bp: 10600 }],
      [{ kind: 'income_bp', bp: 11200 }],
      [
        { kind: 'income_bp', bp: 12000 },
        { kind: 'build_cost_bp', bp: 9300 },
      ],
    ],
  },
  {
    id: 'diplomatie',
    name: 'Diplomatie',
    description:
      "Parler aux communautés avant qu'elles ne lèvent les fourches. Les villages accueillent mieux la bannière et les troupes en tirent une assurance tranquille.",
    effects: [
      [{ kind: 'morale', value: 1 }],
      [
        { kind: 'morale', value: 1 },
        { kind: 'income_bp', bp: 10400 },
      ],
      [
        { kind: 'morale', value: 2 },
        { kind: 'income_bp', bp: 10800 },
      ],
    ],
  },
  {
    id: 'reconnaissance',
    name: 'Reconnaissance',
    description:
      "Monter sur la crête avant d'engager, lire les fumées et les traces de roue. On voit plus loin, et surtout plus tôt.",
    effects: [
      [{ kind: 'vision', value: 2 }],
      [{ kind: 'vision', value: 3 }],
      [
        { kind: 'vision', value: 5 },
        { kind: 'movement', value: 100 },
      ],
    ],
  },
  {
    id: 'sylviculture',
    name: 'Sylviculture',
    description:
      "Connaître la futaie : les layons de débardage, les coupes anciennes, les gués de tourbière. La forêt s'ouvre pour qui l'entretient.",
    effects: [
      [{ kind: 'terrain_cost_bp', terrain: 'foret', bp: 8800 }],
      [
        { kind: 'terrain_cost_bp', terrain: 'foret', bp: 7900 },
        { kind: 'terrain_cost_bp', terrain: 'humide', bp: 9300 },
      ],
      [
        { kind: 'terrain_cost_bp', terrain: 'foret', bp: 7000 },
        { kind: 'terrain_cost_bp', terrain: 'humide', bp: 8600 },
        { kind: 'terrain_cost_bp', terrain: 'pente', bp: 9200 },
      ],
    ],
  },
  {
    id: 'pelerinage',
    name: 'Pèlerinage',
    description:
      "Faire étape aux sanctuaires, boire aux sources consacrées, dormir sous le porche. Chaque halte rend un peu de force à qui la respecte.",
    effects: [
      [{ kind: 'mana_regen', value: 1 }],
      [
        { kind: 'mana_regen', value: 2 },
        { kind: 'morale', value: 1 },
      ],
      [
        { kind: 'mana_regen', value: 4 },
        { kind: 'morale', value: 1 },
        { kind: 'mana_max_bp', bp: 10800 },
      ],
    ],
  },
  {
    id: 'forges',
    name: 'Forges',
    description:
      "Surveiller la trempe, refuser les soudures ratées, faire recommencer sans se fâcher. Les armures sortent mieux ferrées et durent une bataille de plus.",
    effects: [
      [{ kind: 'defense_bp', bp: 10600 }],
      [{ kind: 'defense_bp', bp: 11200 }],
      [
        { kind: 'defense_bp', bp: 11800 },
        { kind: 'resist_bp', bp: 800 },
      ],
    ],
  },
  {
    id: 'balistique',
    name: 'Balistique',
    description:
      "Lire un mur : chercher l'assise creuse, le joint gelé, la reprise mal faite. Les machines de siège trouvent le défaut plutôt que de battre au hasard.",
    effects: [
      [{ kind: 'siege_damage_bp', bp: 11500 }],
      [{ kind: 'siege_damage_bp', bp: 13200 }],
      [
        { kind: 'siege_damage_bp', bp: 15500 },
        { kind: 'first_strike_bp', bp: 10300 },
      ],
    ],
  },
  {
    id: 'guerison',
    name: 'Guérison',
    description:
      "Trier, recoudre, immobiliser. Les blessés reviennent au rang au lieu de rester au bord du chemin.",
    effects: [
      [{ kind: 'heal_bp', bp: 11000 }],
      [{ kind: 'heal_bp', bp: 12600 }],
      [
        { kind: 'heal_bp', bp: 15000 },
        { kind: 'mana_regen', value: 1 },
      ],
    ],
  },
  {
    id: 'erudition',
    name: 'Érudition',
    description:
      "Lire, recopier, comparer les mains d'écriture. Le savoir se convertit en réserve de mana et en apprentissage plus rapide.",
    effects: [
      [{ kind: 'mana_max_bp', bp: 11200 }],
      [{ kind: 'mana_max_bp', bp: 12400 }],
      [
        { kind: 'mana_max_bp', bp: 13800 },
        { kind: 'xp_bp', bp: 11000 },
      ],
    ],
  },
  {
    id: 'occultisme',
    name: 'Occultisme',
    description:
      "Ce qui ne s'enseigne pas au scriptorium : les mots très anciens, le nom des lieux avant les lieux. Les sorts en frappent plus profond, et l'on dort un peu moins bien.",
    effects: [
      [{ kind: 'spell_power_bp', bp: 11000 }],
      [{ kind: 'spell_power_bp', bp: 12200 }],
      [
        { kind: 'spell_power_bp', bp: 13800 },
        { kind: 'mana_regen', value: 1 },
      ],
    ],
  },
  {
    id: 'commandement',
    name: 'Commandement',
    description:
      "Donner l'ordre au bon moment et le donner une seule fois. La première ligne frappe avant l'ennemi et tient la cadence.",
    effects: [
      [{ kind: 'first_strike_bp', bp: 10600 }],
      [
        { kind: 'first_strike_bp', bp: 11200 },
        { kind: 'morale', value: 1 },
      ],
      [
        { kind: 'first_strike_bp', bp: 11800 },
        { kind: 'morale', value: 2 },
      ],
    ],
  },
  {
    id: 'fortune',
    name: 'Fortune',
    description:
      "Un hasard borné, mais qu'on peut faire pencher : bonnes positions, bonnes heures, bonnes bêtes. La Fortune reste toujours dans ses limites publiques.",
    effects: [
      [{ kind: 'fortune', value: 1 }],
      [{ kind: 'fortune', value: 2 }],
      [
        { kind: 'fortune', value: 3 },
        { kind: 'morale', value: 1 },
      ],
    ],
  },
  {
    id: 'embuscade',
    name: 'Embuscade',
    description:
      "Attendre sans bouger dans un chemin creux, laisser passer la tête de colonne, frapper le flanc. Une discipline, pas un coup de chance.",
    effects: [
      [{ kind: 'flank_bp', bp: 11000 }],
      [
        { kind: 'flank_bp', bp: 12200 },
        { kind: 'first_strike_bp', bp: 10300 },
      ],
      [
        { kind: 'flank_bp', bp: 13400 },
        { kind: 'first_strike_bp', bp: 10600 },
      ],
    ],
  },
  {
    id: 'commerce',
    name: 'Commerce',
    description:
      "Connaître les cours de la foire, les poids réels et les changeurs honnêtes. Le change au marché cesse d'être une saignée.",
    effects: [
      [{ kind: 'trade_bp', bp: 10700 }],
      [{ kind: 'trade_bp', bp: 11400 }],
      [
        { kind: 'trade_bp', bp: 12300 },
        { kind: 'income_bp', bp: 10400 },
      ],
    ],
  },
  {
    id: 'cartographie',
    name: 'Cartographie',
    description:
      "Relever, noter, corriger. Les raccourcis notés hier servent aujourd'hui, et la carte finit par valoir une journée de marche.",
    effects: [
      [
        { kind: 'movement', value: 150 },
        { kind: 'vision', value: 1 },
      ],
      [
        { kind: 'movement', value: 280 },
        { kind: 'vision', value: 1 },
      ],
      [
        { kind: 'movement', value: 450 },
        { kind: 'vision', value: 2 },
        { kind: 'movement_bp', bp: 10400 },
      ],
    ],
  },
  {
    id: 'resistance',
    name: 'Résistance',
    description:
      "Amulettes, prières, sel dans la doublure : ce qui fait glisser un sort adverse sur une troupe au lieu de l'y planter.",
    effects: [
      [{ kind: 'resist_bp', bp: 1000 }],
      [{ kind: 'resist_bp', bp: 2000 }],
      [
        { kind: 'resist_bp', bp: 3000 },
        { kind: 'defense_bp', bp: 10400 },
      ],
    ],
  },
  {
    id: 'invocation',
    name: 'Invocation',
    description:
      "Demander à la forêt, et savoir ce qu'elle demandera en retour. Ce qu'elle prête, elle le prête en nombre.",
    effects: [
      [{ kind: 'summon_bp', bp: 11000 }],
      [{ kind: 'summon_bp', bp: 12600 }],
      [
        { kind: 'summon_bp', bp: 14500 },
        { kind: 'spell_power_bp', bp: 10500 },
      ],
    ],
  },
];

export const SKILL_LIST: readonly SkillDef[] = ROWS.map((row) => ({
  id: row.id,
  name: row.name,
  icon: `competence_${row.id}`,
  description: row.description,
  ranks: row.ranks ?? RANKS,
  effects: row.effects,
}));

export const SKILLS: Readonly<Record<SkillId, SkillDef>> = indexById(SKILL_LIST);

/** Les vingt identifiants de compétence imposés par docs/02-API.md. */
export const SKILL_IDS: readonly SkillId[] = SKILL_LIST.map((s) => s.id);
