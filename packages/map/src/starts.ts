/**
 * Les cinq positions de départ et les combinaisons équilibrées.
 *
 * Chaque position accepte indifféremment l'un des deux types de château : la
 * géographie n'impose jamais la faction (document maître §3.6). Les capitales
 * inoccupées deviennent des seigneuries neutres fortifiées, ce dont le noyau
 * se charge à la création de la partie.
 *
 * Les combinaisons ne sont pas tirées librement : pour deux, trois ou quatre
 * bannières, on n'utilise que des ensembles prédéfinis, choisis pour que les
 * distances au centre et les directions d'expansion restent comparables.
 */
import type { RegionId, StartKey, StartPosition, TownUid } from '@auvergne/engine';
import { anchorCell, type AnchorKey } from './anchors.js';

interface StartSpec {
  key: StartKey;
  anchor: AnchorKey;
  label: string;
  townUid: TownUid;
  region: RegionId;
}

const SPECS: readonly StartSpec[] = [
  {
    key: 'arconsat',
    anchor: 'arconsat',
    label: 'Arconsat',
    townUid: 'T_arconsat',
    region: 'hauts_arconsat',
  },
  {
    key: 'viscomtat',
    anchor: 'viscomtat',
    label: 'Viscomtat',
    townUid: 'T_viscomtat',
    region: 'futaies_viscomtat',
  },
  {
    key: 'cervieres',
    anchor: 'cervieres',
    label: 'Cervières',
    townUid: 'T_cervieres',
    region: 'chatellenie_cervieres',
  },
  {
    key: 'noiretable',
    anchor: 'noiretable',
    label: 'Noirétable',
    townUid: 'T_noiretable',
    region: 'pays_noiretable',
  },
  {
    key: 'renaudie',
    anchor: 'renaudie',
    label: 'La Renaudie',
    townUid: 'T_renaudie',
    region: 'marche_renaudie',
  },
];

function build(): Record<StartKey, StartPosition> {
  const out = {} as Record<StartKey, StartPosition>;
  for (const spec of SPECS) {
    out[spec.key] = {
      key: spec.key,
      label: spec.label,
      at: anchorCell(spec.anchor),
      townUid: spec.townUid,
      region: spec.region,
    };
  }
  return out;
}

/**
 * Ce que vaut chaque siège, en une phrase, pour qui doit le choisir.
 *
 * **Pourquoi cette table existe.** Les cinq capitales sont des lieux RÉELS du
 * Forez et la géographie est fixe (document maître §4) : on ne va pas déplacer
 * Cervières pour l'éloigner de Noirétable, qui en est voisine dans la vraie vie
 * comme sur la carte. Or ce voisinage se paie, et il se mesure. Vingt-cinq
 * parties à cinq bannières, une fois la richesse accessible égalisée à moins de
 * trois pour cent près :
 *
 *     La Renaudie   44 % de victoires · 3,0 cités · niveau 11,5 · debout 20/25
 *     Viscomtat     20 %              · 1,6        · niveau  7,4 · debout 17/25
 *     Cervières     20 %              · 1,1        · niveau  7,9 · debout 10/25
 *     Arconsat       8 %              · 1,2        · niveau  6,8 · debout 16/25
 *     Noirétable     8 %              · 0,7        · niveau  5,5 · debout  8/25
 *
 * L'isolement explique l'essentiel : La Renaudie est à 8 943 points de marche de
 * sa plus proche rivale, Cervières et Noirétable à 3 246 l'une de l'autre. Une
 * marche frontière gardée a été posée entre ces deux-là — le semis de postes ne
 * pouvait pas le faire seul, il ne garde que les transitions d'anneau et entre
 * deux capitales voisines il n'y en a pas — et cela n'a pas suffi à égaliser.
 *
 * Plutôt que de feindre une symétrie que la géographie n'a pas, on la DIT. Le
 * joueur qui choisit son siège doit savoir ce qu'il choisit : c'est ainsi qu'on
 * joue à HMM3, où l'on regarde la carte avant de prendre sa place. Les faits
 * énoncés ici sont mesurés, pas devinés — coût de marche jusqu'à la plus proche
 * rivale, nombre de rivales à une semaine de marche, distance au bourg neutre le
 * plus proche.
 */
export const EXPOSITION_DEPART: Readonly<Record<StartKey, string>> = {
  arconsat:
    'Estive du nord, adossée au bord de la carte. Chabreloche à onze cases, ' +
    'donc un bourg neutre sous la main dès la première semaine — mais trois ' +
    'rivales à une semaine de marche.',
  viscomtat:
    'Futaies de l’ouest, la position la plus centrale des cinq. Le Lac à trente ' +
    'et une cases ; quatre rivales à une semaine, donc autant de fronts.',
  cervieres:
    'Châtellenie de l’est, à MOINS DE DEUX JOURS de Noirétable : le front est ' +
    'immédiat, et une marche gardée sépare les deux bourgs. Aucun bourg neutre ' +
    'à moins de quarante cases.',
  noiretable:
    'Pays du Forez oriental, à MOINS DE DEUX JOURS de Cervières : même front, ' +
    'même marche gardée. Notre-Dame de l’Hermitage à trente-quatre cases.',
  renaudie:
    'La marche du sud, la plus isolée des cinq : neuf mille points de marche ' +
    'jusqu’à la première rivale, et aucun bourg neutre à moins de cinquante ' +
    'cases. On y grandit tard, mais tranquille.',
};

/** Contrat `docs/02-API.md` : les cinq positions de départ. */
export const START_POSITIONS: Readonly<Record<StartKey, StartPosition>> = build();

/** Les cinq clefs, dans l'ordre canonique nord → sud. */
export const START_KEYS: readonly StartKey[] = SPECS.map((s) => s.key);

/**
 * Combinaisons prédéfinies et équilibrées.
 *
 * - à deux, les bannières se font face sur les deux plus longues diagonales ;
 * - à trois, aucun triangle ne laisse deux capitales à moins de quatre-vingts
 *   cases l'une de l'autre ;
 * - à quatre, La Renaudie est toujours présente : sa distance au centre est
 *   compensée par ses réserves, et sa présence évite les blocs de trois
 *   voisins immédiats ;
 * - à cinq, tout le monde joue.
 */
export const START_SETS: Readonly<Record<2 | 3 | 4 | 5, StartKey[][]>> = {
  2: [
    ['arconsat', 'noiretable'],
    ['viscomtat', 'cervieres'],
    ['arconsat', 'viscomtat'],
    ['cervieres', 'renaudie'],
  ],
  3: [
    ['arconsat', 'viscomtat', 'noiretable'],
    ['arconsat', 'cervieres', 'renaudie'],
    ['viscomtat', 'cervieres', 'renaudie'],
    ['arconsat', 'noiretable', 'renaudie'],
  ],
  4: [
    ['arconsat', 'viscomtat', 'cervieres', 'renaudie'],
    ['arconsat', 'viscomtat', 'noiretable', 'renaudie'],
    ['arconsat', 'cervieres', 'noiretable', 'renaudie'],
    ['viscomtat', 'cervieres', 'noiretable', 'renaudie'],
  ],
  5: [['arconsat', 'viscomtat', 'cervieres', 'noiretable', 'renaudie']],
};

/** Centres neutres capturables (document maître §3.6). */
export interface NeutralCenter {
  anchor: AnchorKey;
  townUid: TownUid;
  name: string;
  region: RegionId;
  /** Vocation économique du bourg (document maître §7.4). */
  vocation: string;
}

export const NEUTRAL_CENTERS: readonly NeutralCenter[] = [
  {
    anchor: 'chabreloche',
    townUid: 'T_chabreloche',
    name: 'Chabreloche',
    region: 'vallee_durolle',
    vocation: 'marché et relais',
  },
  {
    anchor: 'le_lac',
    townUid: 'T_le_lac',
    name: 'Le Lac',
    region: 'lac_sagnes',
    vocation: 'caravanes de sel',
  },
  {
    anchor: 'vollore',
    townUid: 'T_vollore',
    name: 'Vollore-Montagne',
    region: 'vollore_pamole',
    vocation: 'granit et vision',
  },
  {
    anchor: 'hermitage',
    townUid: 'T_hermitage',
    name: "Notre-Dame de l'Hermitage",
    region: 'hermitage_peyrotine',
    vocation: 'mana, guérison et réputation',
  },
];
