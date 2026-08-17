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
