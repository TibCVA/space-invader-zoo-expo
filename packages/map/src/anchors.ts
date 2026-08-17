/**
 * Ancrages géographiques du Forez.
 *
 * Onze ancrages viennent du brief (§7) avec leurs colonnes et lignes déjà
 * arrêtées ; sept s'y ajoutent pour les besoins du relief, des régions et de
 * la narration : Pierre Pamole, les deux sommets des Bois Noirs, les portes
 * des Farges et de Bise à Cervières, le hameau de la Peyrotine et le Chemin du
 * Trésor.
 *
 * Les couples `(col, row)` sont figés en **entiers** dans ce fichier : la
 * génération du terrain n'appelle donc jamais la trigonométrie de
 * `projection.ts`, ce qui garantit une carte bit-à-bit identique sur toutes
 * les machines. `anchors.test.ts` vérifie que chaque ancrage reste à moins
 * d'une case de sa position projetée par `latLonToCell`.
 *
 * Les altitudes sont celles du brief (§ « @auvergne/map » de docs/02-API.md) ;
 * elles pilotent l'interpolation du champ d'altitude (`elevation.ts`).
 */
import type { MapAnchor, MapCoord } from '@auvergne/engine';

export type AnchorKey =
  | 'arconsat'
  | 'chabreloche'
  | 'le_lac'
  | 'col_sagnes'
  | 'maison_tresor'
  | 'cervieres'
  | 'viscomtat'
  | 'noiretable'
  | 'hermitage'
  | 'vollore'
  | 'renaudie'
  | 'pamole'
  | 'bois_noirs'
  | 'bois_noirs_est'
  | 'porte_farges'
  | 'porte_bise'
  | 'peyrotine'
  | 'chemin_tresor';

/** Ancrage enrichi : `MapAnchor` + altitude connue et note de provenance. */
export interface ForezAnchor extends MapAnchor {
  key: AnchorKey;
  /** Altitude connue du lieu, en mètres. */
  alt: number;
  /** Vrai pour les onze ancrages inscrits au brief §7. */
  canonical: boolean;
}

/*
 * Ordre : du nord au sud, comme le brief.
 * Les latitudes/longitudes des onze premiers sont celles du brief, celles des
 * suivants proviennent de la Base Adresse Locale de Cervières (Chemin du
 * Trésor, cf. document maître §3.3) ou du relevé des sommets et hameaux.
 */
const TABLE: ForezAnchor[] = [
  {
    key: 'arconsat',
    label: 'Arconsat',
    lat: 45.88972,
    lon: 3.71389,
    col: 117,
    row: 25,
    kind: 'ville',
    alt: 700,
    canonical: true,
  },
  {
    key: 'chabreloche',
    label: 'Chabreloche',
    lat: 45.87972,
    lon: 3.6975,
    col: 90,
    row: 48,
    kind: 'ville',
    alt: 780,
    canonical: true,
  },
  {
    key: 'bois_noirs_est',
    label: 'Second sommet des Bois Noirs',
    lat: 45.842937,
    lon: 3.744947,
    col: 168,
    row: 132,
    kind: 'sommet',
    alt: 1150,
    canonical: false,
  },
  {
    key: 'le_lac',
    label: 'Le Lac',
    lat: 45.85937,
    lon: 3.70981,
    col: 111,
    row: 95,
    kind: 'hameau',
    alt: 900,
    canonical: true,
  },
  {
    key: 'col_sagnes',
    label: 'Col des Sagnes',
    lat: 45.8517,
    lon: 3.7032,
    col: 100,
    row: 113,
    kind: 'col',
    alt: 990,
    canonical: true,
  },
  {
    key: 'maison_tresor',
    label: 'Maison du Trésor',
    lat: 45.8515024,
    lon: 3.7307805,
    col: 145,
    row: 113,
    kind: 'monument',
    alt: 950,
    canonical: true,
  },
  {
    key: 'chemin_tresor',
    label: 'Chemin du Trésor',
    lat: 45.8513476,
    lon: 3.7318868,
    col: 147,
    row: 113,
    kind: 'monument',
    alt: 945,
    canonical: false,
  },
  {
    key: 'porte_bise',
    label: 'Porte de Bise',
    lat: 45.8492,
    lon: 3.7738,
    col: 215,
    row: 117,
    kind: 'monument',
    alt: 885,
    canonical: false,
  },
  {
    key: 'cervieres',
    label: 'Cervières',
    lat: 45.84861,
    lon: 3.77306,
    col: 214,
    row: 119,
    kind: 'ville',
    alt: 880,
    canonical: true,
  },
  {
    key: 'porte_farges',
    label: 'Porte des Farges',
    lat: 45.8482,
    lon: 3.7725,
    col: 213,
    row: 119,
    kind: 'monument',
    alt: 875,
    canonical: false,
  },
  {
    key: 'bois_noirs',
    label: 'Sommet des Bois Noirs',
    lat: 45.8348,
    lon: 3.7365,
    col: 154,
    row: 151,
    kind: 'sommet',
    alt: 1200,
    canonical: false,
  },
  {
    key: 'viscomtat',
    label: 'Viscomtat',
    lat: 45.82917,
    lon: 3.67694,
    col: 58,
    row: 165,
    kind: 'ville',
    alt: 700,
    canonical: true,
  },
  {
    key: 'noiretable',
    label: 'Noirétable',
    lat: 45.81806,
    lon: 3.76556,
    col: 202,
    row: 189,
    kind: 'ville',
    alt: 720,
    canonical: true,
  },
  {
    key: 'peyrotine',
    label: 'La Peyrotine',
    lat: 45.7972,
    lon: 3.7285,
    col: 142,
    row: 237,
    kind: 'hameau',
    alt: 1040,
    canonical: false,
  },
  {
    key: 'hermitage',
    label: "Notre-Dame de l'Hermitage",
    lat: 45.7917,
    lon: 3.71756,
    col: 125,
    row: 250,
    kind: 'sanctuaire',
    alt: 1110,
    canonical: true,
  },
  {
    key: 'vollore',
    label: 'Vollore-Montagne',
    lat: 45.785833,
    lon: 3.674444,
    col: 55,
    row: 264,
    kind: 'ville',
    alt: 940,
    canonical: true,
  },
  {
    key: 'pamole',
    label: 'Pierre Pamole',
    lat: 45.7805,
    lon: 3.6899,
    col: 80,
    row: 276,
    kind: 'sommet',
    alt: 1165,
    canonical: false,
  },
  {
    key: 'renaudie',
    label: 'La Renaudie',
    lat: 45.7361,
    lon: 3.7211,
    col: 132,
    row: 378,
    kind: 'ville',
    alt: 800,
    canonical: true,
  },
];

/** Table complète des ancrages, altitude comprise. */
export const FOREZ_ANCHORS: readonly ForezAnchor[] = TABLE;

/** Contrat `docs/02-API.md` : les ancrages publiés avec la carte. */
export const ANCHORS: readonly MapAnchor[] = TABLE.map((a) => ({
  key: a.key,
  label: a.label,
  lat: a.lat,
  lon: a.lon,
  col: a.col,
  row: a.row,
  kind: a.kind,
}));

const INDEX = new Map<string, ForezAnchor>();
for (const a of TABLE) INDEX.set(a.key, a);

/** Ancrage par clef. Lance si la clef est inconnue (erreur de programmation). */
export function anchor(key: AnchorKey): ForezAnchor {
  const a = INDEX.get(key);
  if (!a) throw new Error(`Ancrage inconnu : ${key}`);
  return a;
}

/** Case d'un ancrage. */
export function anchorCell(key: AnchorKey): MapCoord {
  const a = anchor(key);
  return { col: a.col, row: a.row };
}

/** Altitude connue d'un ancrage, en mètres. */
export function anchorAltitude(key: AnchorKey): number {
  return anchor(key).alt;
}

/** Copie fraîche des ancrages, prête à être posée dans un `WorldMap`. */
export function anchorList(): MapAnchor[] {
  return TABLE.map((a) => ({
    key: a.key,
    label: a.label,
    lat: a.lat,
    lon: a.lon,
    col: a.col,
    row: a.row,
    kind: a.kind,
  }));
}
