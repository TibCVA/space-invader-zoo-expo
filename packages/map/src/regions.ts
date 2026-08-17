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
  s(117, 25, 'hauts_arconsat'),
  s(132, 8, 'hauts_arconsat'),
  s(102, 16, 'hauts_arconsat'),
  s(128, 44, 'hauts_arconsat'),
  s(112, 58, 'hauts_arconsat'),
  s(96, 26, 'hauts_arconsat'),
  s(120, 12, 'hauts_arconsat'),
  s(134, 62, 'hauts_arconsat'),
  // 2 — La Vallée de la Durolle
  s(90, 48, 'vallee_durolle'),
  s(66, 44, 'vallee_durolle'),
  s(40, 40, 'vallee_durolle'),
  s(14, 32, 'vallee_durolle'),
  s(60, 12, 'vallee_durolle'),
  s(74, 74, 'vallee_durolle'),
  s(30, 76, 'vallee_durolle'),
  // 3 — Le Lac et les Sagnes
  s(111, 95, 'lac_sagnes'),
  s(100, 113, 'lac_sagnes'),
  s(120, 78, 'lac_sagnes'),
  s(96, 132, 'lac_sagnes'),
  s(116, 128, 'lac_sagnes'),
  // 4 — La Maison du Trésor
  s(145, 113, 'maison_tresor'),
  // 5 — La Châtellenie de Cervières
  s(214, 119, 'chatellenie_cervieres'),
  s(234, 92, 'chatellenie_cervieres'),
  s(240, 140, 'chatellenie_cervieres'),
  s(200, 88, 'chatellenie_cervieres'),
  s(222, 46, 'chatellenie_cervieres'),
  s(250, 16, 'chatellenie_cervieres'),
  s(248, 174, 'chatellenie_cervieres'),
  // 6 — Les Futaies de Viscomtat
  s(58, 165, 'futaies_viscomtat'),
  s(34, 146, 'futaies_viscomtat'),
  s(76, 186, 'futaies_viscomtat'),
  s(20, 190, 'futaies_viscomtat'),
  s(46, 214, 'futaies_viscomtat'),
  s(8, 148, 'futaies_viscomtat'),
  // 7 — Le Cœur des Bois Noirs
  s(154, 151, 'coeur_bois_noirs'),
  s(168, 132, 'coeur_bois_noirs'),
  s(172, 96, 'coeur_bois_noirs'),
  s(160, 60, 'coeur_bois_noirs'),
  s(178, 22, 'coeur_bois_noirs'),
  s(146, 176, 'coeur_bois_noirs'),
  s(172, 190, 'coeur_bois_noirs'),
  s(132, 148, 'coeur_bois_noirs'),
  // 8 — Le Pays de Noirétable
  s(202, 189, 'pays_noiretable'),
  s(228, 200, 'pays_noiretable'),
  s(210, 232, 'pays_noiretable'),
  s(242, 236, 'pays_noiretable'),
  s(188, 216, 'pays_noiretable'),
  s(236, 292, 'pays_noiretable'),
  s(206, 282, 'pays_noiretable'),
  s(230, 336, 'pays_noiretable'),
  s(248, 386, 'pays_noiretable'),
  // 9 — L'Hermitage et Peyrotine
  s(125, 250, 'hermitage_peyrotine'),
  s(142, 237, 'hermitage_peyrotine'),
  s(152, 268, 'hermitage_peyrotine'),
  s(112, 232, 'hermitage_peyrotine'),
  s(168, 246, 'hermitage_peyrotine'),
  s(130, 288, 'hermitage_peyrotine'),
  s(104, 296, 'hermitage_peyrotine'),
  s(160, 296, 'hermitage_peyrotine'),
  // 10 — Vollore et Pamole
  s(55, 264, 'vollore_pamole'),
  s(80, 276, 'vollore_pamole'),
  s(66, 232, 'vollore_pamole'),
  s(30, 268, 'vollore_pamole'),
  s(90, 306, 'vollore_pamole'),
  s(46, 310, 'vollore_pamole'),
  s(14, 300, 'vollore_pamole'),
  s(62, 336, 'vollore_pamole'),
  s(28, 344, 'vollore_pamole'),
  // 11 — La Marche de La Renaudie
  s(132, 378, 'marche_renaudie'),
  s(96, 356, 'marche_renaudie'),
  s(172, 348, 'marche_renaudie'),
  s(164, 402, 'marche_renaudie'),
  s(94, 402, 'marche_renaudie'),
  s(196, 366, 'marche_renaudie'),
  s(60, 396, 'marche_renaudie'),
  s(128, 336, 'marche_renaudie'),
];

/** Région propre de chaque ancrage, imposée dans un disque autour de lui. */
const ANCHOR_REGION: Readonly<Record<AnchorKey, RegionId>> = {
  arconsat: 'hauts_arconsat',
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
const TREASURE_RADIUS = 15;
/** Rayon du noyau conservé autour d'un bourg ou d'un monument. */
const CORE_RADIUS = 6;
/** Demi-largeur du corridor marchand, en cases. */
const CORRIDOR_RADIUS = 4;

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
