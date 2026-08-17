/**
 * Projection géographique de la carte du Forez.
 *
 * Chaîne complète : **WGS84 → Lambert-93 (EPSG:2154) → grille de jeu**.
 *
 * L'emprise de travail du brief (§7) est la fenêtre WGS84
 * `ouest 3.640 · est 3.800 · sud 45.720 · nord 45.900`. Elle est projetée en
 * Lambert-93, puis le rectangle de jeu est défini par les deux coins
 * diagonaux **sud-ouest** et **nord-est** projetés :
 *
 * ```
 * origine X = x(sud, ouest)      largeur = x(nord, est) − x(sud, ouest)  ≈ 12 243 m
 * origine Y = y(nord, est)       hauteur = y(nord, est) − y(sud, ouest)  ≈ 20 102 m
 * ```
 *
 * soit **47,82 m par colonne** et **48,32 m par ligne** sur une grille de
 * 256 × 416 cases — les « environ 48 mètres par case » du document maître, et
 * les « environ 12,2 km × 20,1 km » qu'il annonce (§3.1).
 *
 * Cette définition reproduit les onze ancrages du brief à moins de 0,53 case
 * près sur chaque axe (0,70 case en distance) : le contrat de fidélité
 * « écart < 1 case » est tenu par construction, ce qui est vérifié par
 * `projection.test.ts`.
 *
 * Le centre de la case `(col, row)` est situé exactement à
 * `x = originX + col × largeurCase`, `y = originY − row × hauteurCase`.
 * `latLonToCell` et `cellToLatLon` sont donc réciproques à l'arrondi près.
 *
 * ⚠️ Aucune fonction de ce fichier n'est utilisée pendant la génération du
 * terrain : les ancrages sont figés en entiers dans `anchors.ts`. La
 * trigonométrie reste donc cantonnée à l'interface publique, et la carte est
 * bit-à-bit identique sur toutes les machines.
 */
import type { MapCoord } from '@auvergne/engine';
import { MAP_COLS, MAP_ROWS } from '@auvergne/engine';

/* ── Emprise (docs/02-API.md) ───────────────────────────────────────────── */

export const BOUNDS = {
  west: 3.64,
  east: 3.8,
  south: 45.72,
  north: 45.9,
} as const;

/* ── Ellipsoïde GRS80 et paramètres EPSG:2154 ───────────────────────────── */

/** Demi-grand axe de l'ellipsoïde GRS80, en mètres. */
const GRS80_A = 6378137;
/** Aplatissement de l'ellipsoïde GRS80. */
const GRS80_F = 1 / 298.257222101;
/** Première excentricité de GRS80. */
const GRS80_E = Math.sqrt(2 * GRS80_F - GRS80_F * GRS80_F);

const DEG = Math.PI / 180;

/** Latitude d'origine de la projection conique conforme de Lambert. */
const LAT_ORIGIN = 46.5 * DEG;
/** Méridien d'origine (Greenwich + 3°). */
const LON_ORIGIN = 3 * DEG;
/** Premier parallèle automécoïque. */
const LAT_STD_1 = 44 * DEG;
/** Second parallèle automécoïque. */
const LAT_STD_2 = 49 * DEG;
/** Fausse abscisse. */
const FALSE_EASTING = 700000;
/** Fausse ordonnée. */
const FALSE_NORTHING = 6600000;

function ellipsoidM(phi: number): number {
  const s = Math.sin(phi);
  return Math.cos(phi) / Math.sqrt(1 - GRS80_E * GRS80_E * s * s);
}

function isometricT(phi: number): number {
  const s = Math.sin(phi);
  return (
    Math.tan(Math.PI / 4 - phi / 2) /
    Math.pow((1 - GRS80_E * s) / (1 + GRS80_E * s), GRS80_E / 2)
  );
}

const LCC_N =
  (Math.log(ellipsoidM(LAT_STD_1)) - Math.log(ellipsoidM(LAT_STD_2))) /
  (Math.log(isometricT(LAT_STD_1)) - Math.log(isometricT(LAT_STD_2)));

const LCC_F = ellipsoidM(LAT_STD_1) / (LCC_N * Math.pow(isometricT(LAT_STD_1), LCC_N));

const LCC_RHO0 = GRS80_A * LCC_F * Math.pow(isometricT(LAT_ORIGIN), LCC_N);

export interface Lambert93 {
  /** Abscisse Lambert-93, en mètres. */
  x: number;
  /** Ordonnée Lambert-93, en mètres. */
  y: number;
}

/** WGS84 (degrés décimaux) → Lambert-93 (EPSG:2154), en mètres. */
export function lambert93(lat: number, lon: number): Lambert93 {
  const phi = lat * DEG;
  const lambda = lon * DEG;
  const rho = GRS80_A * LCC_F * Math.pow(isometricT(phi), LCC_N);
  const theta = LCC_N * (lambda - LON_ORIGIN);
  return {
    x: FALSE_EASTING + rho * Math.sin(theta),
    y: FALSE_NORTHING + LCC_RHO0 - rho * Math.cos(theta),
  };
}

/** Lambert-93 (EPSG:2154) → WGS84 (degrés décimaux). */
export function inverseLambert93(x: number, y: number): { lat: number; lon: number } {
  const dx = x - FALSE_EASTING;
  const dy = LCC_RHO0 - (y - FALSE_NORTHING);
  const sign = LCC_N >= 0 ? 1 : -1;
  const rho = sign * Math.sqrt(dx * dx + dy * dy);
  const theta = Math.atan2(sign * dx, sign * dy);
  const t = Math.pow(rho / (GRS80_A * LCC_F), 1 / LCC_N);

  // Inversion de la latitude isométrique : 8 itérations suffisent très
  // largement (convergence quadratique, précision < 1e-12 rad dès la 4ᵉ).
  let phi = Math.PI / 2 - 2 * Math.atan(t);
  for (let i = 0; i < 8; i++) {
    const s = Math.sin(phi);
    const next =
      Math.PI / 2 -
      2 * Math.atan(t * Math.pow((1 - GRS80_E * s) / (1 + GRS80_E * s), GRS80_E / 2));
    if (Math.abs(next - phi) < 1e-13) {
      phi = next;
      break;
    }
    phi = next;
  }
  return { lat: phi / DEG, lon: (theta / LCC_N + LON_ORIGIN) / DEG };
}

/* ── Rectangle de jeu ───────────────────────────────────────────────────── */

const CORNER_SW = lambert93(BOUNDS.south, BOUNDS.west);
const CORNER_NE = lambert93(BOUNDS.north, BOUNDS.east);

/** Abscisse Lambert-93 de la colonne 0. */
export const GRID_ORIGIN_X = CORNER_SW.x;
/** Ordonnée Lambert-93 de la ligne 0. */
export const GRID_ORIGIN_Y = CORNER_NE.y;

/** Largeur de l'emprise projetée, en mètres (≈ 12 243 m). */
export const MAP_WIDTH_M = CORNER_NE.x - CORNER_SW.x;
/** Hauteur de l'emprise projetée, en mètres (≈ 20 102 m). */
export const MAP_HEIGHT_M = CORNER_NE.y - CORNER_SW.y;

/** Largeur d'une case, en mètres (≈ 47,82 m). */
export const CELL_WIDTH_M = MAP_WIDTH_M / MAP_COLS;
/** Hauteur d'une case, en mètres (≈ 48,32 m). */
export const CELL_HEIGHT_M = MAP_HEIGHT_M / MAP_ROWS;

/**
 * Taille nominale d'une case, en mètres entiers (48 m).
 * Utilisée par les calculs de pente : la carte est isotrope à 1 % près.
 */
export const CELL_SIZE_M = 48;

/* ── Grille ─────────────────────────────────────────────────────────────── */

export interface GridPoint {
  /** Colonne continue (non arrondie, non bornée). */
  col: number;
  /** Ligne continue (non arrondie, non bornée). */
  row: number;
}

/** WGS84 → position continue sur la grille (sans arrondi ni bornage). */
export function projectToGrid(lat: number, lon: number): GridPoint {
  const p = lambert93(lat, lon);
  return {
    col: (p.x - GRID_ORIGIN_X) / CELL_WIDTH_M,
    row: (GRID_ORIGIN_Y - p.y) / CELL_HEIGHT_M,
  };
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  const i = Math.round(v);
  if (i < min) return min;
  if (i > max) return max;
  return i;
}

/**
 * WGS84 → case de la grille, arrondie au centre de case le plus proche et
 * bornée à l'emprise. Contrat `docs/02-API.md`.
 */
export function latLonToCell(lat: number, lon: number): MapCoord {
  const g = projectToGrid(lat, lon);
  return {
    col: clampInt(g.col, 0, MAP_COLS - 1),
    row: clampInt(g.row, 0, MAP_ROWS - 1),
  };
}

/** Case de la grille → Lambert-93 du centre de case. */
export function cellToLambert93(col: number, row: number): Lambert93 {
  return {
    x: GRID_ORIGIN_X + col * CELL_WIDTH_M,
    y: GRID_ORIGIN_Y - row * CELL_HEIGHT_M,
  };
}

/** Case de la grille → WGS84 du centre de case. Contrat `docs/02-API.md`. */
export function cellToLatLon(col: number, row: number): { lat: number; lon: number } {
  const p = cellToLambert93(col, row);
  return inverseLambert93(p.x, p.y);
}

/** Distance métrique entre deux cases (plan Lambert-93). */
export function cellDistanceMeters(a: MapCoord, b: MapCoord): number {
  const dx = (a.col - b.col) * CELL_WIDTH_M;
  const dy = (a.row - b.row) * CELL_HEIGHT_M;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Vrai si le point WGS84 tombe dans l'emprise de travail. */
export function insideBounds(lat: number, lon: number): boolean {
  return (
    lon >= BOUNDS.west && lon <= BOUNDS.east && lat >= BOUNDS.south && lat <= BOUNDS.north
  );
}
