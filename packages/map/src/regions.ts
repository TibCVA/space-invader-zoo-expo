/**
 * Les douze régions de jeu (document maître §3.5), découpées géographiquement.
 *
 * Le découpage se fait en trois passes :
 *
 *  1. **Voronoï multi-germes** : chaque région pose plusieurs germes sur son
 *     territoire réel, et chaque case rejoint le germe le plus proche. Le
 *     résultat épouse la géographie sans polygones à la main.
 *  2. **corridor de la Grande Chaussée** : toute case à quatre cases ou moins
 *     d'une grande chaussée bascule dans la région 12, le pays des marchands,
 *     des péages et des postes de garde.
 *  3. **noyaux** : la clairière de la Maison du Trésor, puis un disque autour
 *     de chaque bourg et de chaque monument, reprennent leur région propre —
 *     un village n'est jamais avalé par le corridor qui le traverse.
 */
import { REGIONS, type MapCoord, type RegionId } from '@auvergne/engine';
import { FOREZ_ANCHORS, type AnchorKey } from './anchors.js';
import { CELLS, COLS, ROWS, idx } from './grid.js';
import { ROAD_MAJOR } from './roads.js';

const R = (id: RegionId): number => REGIONS.indexOf(id);

interface Seed {
  col: number;
  row: number;
  region: RegionId;
}

const s = (col: number, row: number, region: RegionId): Seed => ({ col, row, region });

/**
 * Germes des régions. Ils suivent le texte du document maître : départ nord
 * aux Hauts d'Arconsat, vallée marchande de la Durolle, transition du Lac et
 * des Sagnes, châtellenie de Cervières à l'est, futaies de Viscomtat à
 * l'ouest, cœur dangereux des Bois Noirs au centre, pays de Noirétable au
 * sud-est, Hermitage et Peyrotine au sud, hautes terres de Vollore et Pamole
 * au sud-ouest, Marche de La Renaudie au sud.
 */
const SEEDS: readonly Seed[] = [
  // 1 — Les Hauts d'Arconsat
  s(52, 11, 'hauts_arconsat'),
  s(58, 4, 'hauts_arconsat'),
  s(45, 7, 'hauts_arconsat'),
  s(56, 19, 'hauts_arconsat'),
  s(49, 26, 'hauts_arconsat'),
  s(42, 12, 'hauts_arconsat'),
  s(53, 5, 'hauts_arconsat'),
  s(59, 27, 'hauts_arconsat'),
  // 2 — La Vallée de la Durolle
  s(40, 21, 'vallee_durolle'),
  s(29, 19, 'vallee_durolle'),
  s(18, 18, 'vallee_durolle'),
  s(6, 14, 'vallee_durolle'),
  s(26, 5, 'vallee_durolle'),
  s(33, 33, 'vallee_durolle'),
  s(13, 34, 'vallee_durolle'),
  // 3 — Le Lac et les Sagnes
  s(49, 42, 'lac_sagnes'),
  s(44, 50, 'lac_sagnes'),
  s(53, 34, 'lac_sagnes'),
  s(42, 58, 'lac_sagnes'),
  s(51, 57, 'lac_sagnes'),
  // 4 — La Maison du Trésor
  s(64, 50, 'maison_tresor'),
  // 5 — La Châtellenie de Cervières
  s(94, 53, 'chatellenie_cervieres'),
  s(103, 41, 'chatellenie_cervieres'),
  s(106, 62, 'chatellenie_cervieres'),
  s(88, 39, 'chatellenie_cervieres'),
  s(98, 20, 'chatellenie_cervieres'),
  s(110, 7, 'chatellenie_cervieres'),
  s(109, 77, 'chatellenie_cervieres'),
  // 6 — Les Futaies de Viscomtat
  s(26, 73, 'futaies_viscomtat'),
  s(15, 65, 'futaies_viscomtat'),
  s(34, 82, 'futaies_viscomtat'),
  s(9, 84, 'futaies_viscomtat'),
  s(20, 95, 'futaies_viscomtat'),
  s(4, 65, 'futaies_viscomtat'),
  // 7 — Le Cœur des Bois Noirs
  s(68, 67, 'coeur_bois_noirs'),
  s(74, 58, 'coeur_bois_noirs'),
  s(76, 42, 'coeur_bois_noirs'),
  s(71, 27, 'coeur_bois_noirs'),
  s(79, 10, 'coeur_bois_noirs'),
  s(64, 78, 'coeur_bois_noirs'),
  s(76, 84, 'coeur_bois_noirs'),
  s(58, 65, 'coeur_bois_noirs'),
  // 8 — Le Pays de Noirétable
  s(89, 84, 'pays_noiretable'),
  s(101, 88, 'pays_noiretable'),
  s(93, 103, 'pays_noiretable'),
  s(107, 104, 'pays_noiretable'),
  s(83, 96, 'pays_noiretable'),
  s(104, 129, 'pays_noiretable'),
  s(91, 125, 'pays_noiretable'),
  s(102, 149, 'pays_noiretable'),
  s(109, 171, 'pays_noiretable'),
  // 9 — L'Hermitage et Peyrotine
  s(55, 111, 'hermitage_peyrotine'),
  s(63, 105, 'hermitage_peyrotine'),
  s(67, 119, 'hermitage_peyrotine'),
  s(49, 103, 'hermitage_peyrotine'),
  s(74, 109, 'hermitage_peyrotine'),
  s(57, 127, 'hermitage_peyrotine'),
  s(46, 131, 'hermitage_peyrotine'),
  s(71, 131, 'hermitage_peyrotine'),
  // 10 — Vollore et Pamole
  s(24, 117, 'vollore_pamole'),
  s(35, 122, 'vollore_pamole'),
  s(29, 103, 'vollore_pamole'),
  s(13, 119, 'vollore_pamole'),
  s(40, 135, 'vollore_pamole'),
  s(20, 137, 'vollore_pamole'),
  s(6, 133, 'vollore_pamole'),
  s(27, 149, 'vollore_pamole'),
  s(12, 152, 'vollore_pamole'),
  // 11 — La Marche de La Renaudie
  s(58, 167, 'marche_renaudie'),
  s(42, 157, 'marche_renaudie'),
  s(76, 154, 'marche_renaudie'),
  s(72, 178, 'marche_renaudie'),
  s(41, 178, 'marche_renaudie'),
  s(87, 162, 'marche_renaudie'),
  s(26, 175, 'marche_renaudie'),
  s(56, 149, 'marche_renaudie'),
];

/** Région propre de chaque ancrage, imposée dans un disque autour de lui. */
const ANCHOR_REGION: Readonly<Record<AnchorKey, RegionId>> = {
  arconsat: 'hauts_arconsat',
  col_st_thomas: 'hauts_arconsat',
  chabreloche: 'vallee_durolle',
  le_lac: 'lac_sagnes',
  col_sagnes: 'lac_sagnes',
  maison_tresor: 'maison_tresor',
  chemin_tresor: 'maison_tresor',
  cervieres: 'chatellenie_cervieres',
  porte_farges: 'chatellenie_cervieres',
  porte_bise: 'chatellenie_cervieres',
  viscomtat: 'futaies_viscomtat',
  noiretable: 'pays_noiretable',
  hermitage: 'hermitage_peyrotine',
  peyrotine: 'hermitage_peyrotine',
  vollore: 'vollore_pamole',
  pamole: 'vollore_pamole',
  renaudie: 'marche_renaudie',
  bois_noirs: 'coeur_bois_noirs',
  bois_noirs_est: 'coeur_bois_noirs',
};

/** Rayon de la clairière fortifiée de la Maison du Trésor, en cases. */
const TREASURE_RADIUS = 7;
/** Rayon du noyau conservé autour d'un bourg ou d'un monument. */
const CORE_RADIUS = 3;
/** Demi-largeur du corridor marchand, en cases. */
const CORRIDOR_RADIUS = 2;

function stampDisc(region: Uint8Array, at: MapCoord, radius: number, value: number): void {
  const r2 = radius * radius;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (dc * dc + dr * dr > r2) continue;
      const col = at.col + dc;
      const row = at.row + dr;
      if (col < 0 || row < 0 || col >= COLS || row >= ROWS) continue;
      region[row * COLS + col] = value;
    }
  }
}

/** Découpe les douze régions. `road` sert à tracer le corridor marchand. */
export function assignRegions(road: Uint8Array): Uint8Array {
  const region = new Uint8Array(CELLS);

  const n = SEEDS.length;
  const sc = new Int32Array(n);
  const sr = new Int32Array(n);
  const sv = new Uint8Array(n);
  for (let k = 0; k < n; k++) {
    sc[k] = SEEDS[k].col;
    sr[k] = SEEDS[k].row;
    sv[k] = R(SEEDS[k].region);
  }

  for (let row = 0; row < ROWS; row++) {
    const base = row * COLS;
    for (let col = 0; col < COLS; col++) {
      let best = 0;
      let bestD = Number.MAX_SAFE_INTEGER;
      for (let k = 0; k < n; k++) {
        const dc = sc[k] - col;
        const dr = sr[k] - row;
        const d = dc * dc + dr * dr;
        if (d < bestD) {
          bestD = d;
          best = sv[k];
        }
      }
      region[base + col] = best;
    }
  }

  // 2 — Corridor de la Grande Chaussée des Marchands.
  const corridor = R('grande_chaussee');
  const r2 = CORRIDOR_RADIUS * CORRIDOR_RADIUS;
  const majors: number[] = [];
  for (let i = 0; i < CELLS; i++) if (road[i] === ROAD_MAJOR) majors.push(i);
  for (const i of majors) {
    const col = i % COLS;
    const row = (i / COLS) | 0;
    for (let dr = -CORRIDOR_RADIUS; dr <= CORRIDOR_RADIUS; dr++) {
      for (let dc = -CORRIDOR_RADIUS; dc <= CORRIDOR_RADIUS; dc++) {
        if (dc * dc + dr * dr > r2) continue;
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        region[nr * COLS + nc] = corridor;
      }
    }
  }

  // 3 — Noyaux : la clairière du Trésor, puis les bourgs et monuments.
  for (const a of FOREZ_ANCHORS) {
    if (a.key !== 'maison_tresor') continue;
    stampDisc(region, { col: a.col, row: a.row }, TREASURE_RADIUS, R('maison_tresor'));
  }
  for (const a of FOREZ_ANCHORS) {
    if (a.key === 'maison_tresor' || a.key === 'chemin_tresor') continue;
    stampDisc(region, { col: a.col, row: a.row }, CORE_RADIUS, R(ANCHOR_REGION[a.key]));
  }

  return region;
}

/** Libellés français des douze régions, pour l'interface et le codex. */
export const REGION_LABELS: Readonly<Record<RegionId, string>> = {
  hauts_arconsat: "Les Hauts d'Arconsat",
  vallee_durolle: 'La Vallée de la Durolle',
  lac_sagnes: 'Le Lac et les Sagnes',
  maison_tresor: 'La Maison du Trésor',
  chatellenie_cervieres: 'La Châtellenie de Cervières',
  futaies_viscomtat: 'Les Futaies de Viscomtat',
  coeur_bois_noirs: 'Le Cœur des Bois Noirs',
  pays_noiretable: 'Le Pays de Noirétable',
  hermitage_peyrotine: "L'Hermitage et Peyrotine",
  vollore_pamole: 'Vollore et Pamole',
  marche_renaudie: 'La Marche de La Renaudie',
  grande_chaussee: 'La Grande Chaussée des Marchands',
};

/** Région d'une case. */
export function regionOf(region: Uint8Array, col: number, row: number): RegionId {
  return REGIONS[region[idx(col, row)]] ?? 'grande_chaussee';
}
