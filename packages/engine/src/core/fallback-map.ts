/**
 * Carte de secours du noyau.
 *
 * La vraie carte du Forez vit dans `packages/map` : relief IGN synthétisé,
 * hydrographie réelle, routes, régions et contenu tiré de la graine. Ce module
 * fabrique une carte **de même forme** (256 × 416, mêmes ancrages, mêmes
 * positions de départ, mêmes sceaux) afin que le noyau soit jouable, mesurable
 * et testable sans `@auvergne/map`. Elle est intégralement remplacée dès que
 * `linkEngineModules({ map })` est appelé.
 *
 * Aucun `Math.random` : le relief est un champ déterministe de la graine.
 */
import {
  CELL_BRIDGE,
  CELL_BUILDABLE,
  CELL_CACHE,
  CELL_EDGE,
  CELL_PASSABLE,
  CELL_ROAD,
  MAP_COLS,
  MAP_ROWS,
  REGIONS,
  TERRAINS,
  type ArmyStack,
  type MapAnchor,
  type MapCoord,
  type MapObject,
  type RegionId,
  type SealId,
  type Terrain,
  type WorldMap,
} from '../types.js';
import { createRng, nextInt } from '../rng.js';
import type { MapPack, StartKey, StartPosition } from './registry.js';

export const FALLBACK_MAP_VERSION = '0.0.0-secours';

/* ── Ancrages (brief §7) ────────────────────────────────────────────────── */

interface AnchorRow {
  key: string;
  label: string;
  lat: number;
  lon: number;
  col: number;
  row: number;
  alt: number;
  kind: MapAnchor['kind'];
}

const ANCHOR_ROWS: AnchorRow[] = [
  { key: 'arconsat', label: 'Arconsat', lat: 45.88972, lon: 3.71389, col: 52, row: 11, alt: 700, kind: 'ville' },
  { key: 'chabreloche', label: 'Chabreloche', lat: 45.87972, lon: 3.6975, col: 40, row: 21, alt: 780, kind: 'ville' },
  { key: 'le_lac', label: 'Le Lac', lat: 45.85937, lon: 3.70981, col: 49, row: 42, alt: 900, kind: 'hameau' },
  { key: 'col_sagnes', label: 'Col des Sagnes', lat: 45.8517, lon: 3.7032, col: 44, row: 50, alt: 990, kind: 'col' },
  { key: 'maison_tresor', label: 'Maison du Trésor', lat: 45.8515024, lon: 3.7307805, col: 64, row: 50, alt: 950, kind: 'monument' },
  { key: 'cervieres', label: 'Cervières', lat: 45.84861, lon: 3.77306, col: 94, row: 53, alt: 880, kind: 'ville' },
  { key: 'viscomtat', label: 'Viscomtat', lat: 45.82917, lon: 3.67694, col: 26, row: 73, alt: 700, kind: 'ville' },
  { key: 'noiretable', label: 'Noirétable', lat: 45.81806, lon: 3.76556, col: 89, row: 84, alt: 720, kind: 'ville' },
  { key: 'hermitage', label: "Notre-Dame de l'Hermitage", lat: 45.7917, lon: 3.71756, col: 55, row: 111, alt: 1110, kind: 'sanctuaire' },
  { key: 'vollore', label: 'Vollore-Montagne', lat: 45.785833, lon: 3.674444, col: 24, row: 117, alt: 940, kind: 'ville' },
  { key: 'renaudie', label: 'La Renaudie', lat: 45.7361, lon: 3.7211, col: 58, row: 167, alt: 800, kind: 'ville' },
  { key: 'pamole', label: 'Pierre Pamole', lat: 45.7805, lon: 3.6899, col: 37, row: 121, alt: 1165, kind: 'sommet' },
  { key: 'bois_noirs', label: 'Sommet des Bois Noirs', lat: 45.8348, lon: 3.7365, col: 68, row: 67, alt: 1200, kind: 'sommet' },
];

/* ── Bruit entier déterministe ──────────────────────────────────────────── */

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = (h ^ (h >>> 13)) | 0;
  h = Math.imul(h, 1274126177) | 0;
  h = (h ^ (h >>> 16)) | 0;
  return h >>> 0;
}

/** Bruit de valeur lissé, retourne un entier dans [-amp, amp]. */
function valueNoise(x: number, y: number, cell: number, seed: number, amp: number): number {
  const gx = Math.floor(x / cell);
  const gy = Math.floor(y / cell);
  const fx = x - gx * cell;
  const fy = y - gy * cell;
  const n00 = hash2(gx, gy, seed) % 2048;
  const n10 = hash2(gx + 1, gy, seed) % 2048;
  const n01 = hash2(gx, gy + 1, seed) % 2048;
  const n11 = hash2(gx + 1, gy + 1, seed) % 2048;
  // interpolation lissée (smoothstep entière sur 1024)
  const tx = smooth(fx, cell);
  const ty = smooth(fy, cell);
  const a = n00 + (((n10 - n00) * tx) >> 10);
  const b = n01 + (((n11 - n01) * tx) >> 10);
  const v = a + (((b - a) * ty) >> 10);
  return Math.trunc(((v - 1024) * amp) / 1024);
}

function smooth(f: number, cell: number): number {
  const t = Math.trunc((f * 1024) / cell);
  return Math.trunc((t * t * (3072 - 2 * t)) / (1024 * 1024));
}

/* ── Polylignes ─────────────────────────────────────────────────────────── */

function line(a: MapCoord, b: MapCoord): MapCoord[] {
  const out: MapCoord[] = [];
  let x = a.col;
  let y = a.row;
  const dx = Math.abs(b.col - x);
  const dy = -Math.abs(b.row - y);
  const sx = x < b.col ? 1 : -1;
  const sy = y < b.row ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ col: x, row: y });
    if (x === b.col && y === b.row) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
  return out;
}

function anchor(key: string): AnchorRow {
  const a = ANCHOR_ROWS.find((r) => r.key === key);
  if (!a) throw new Error(`Ancrage inconnu : ${key}`);
  return a;
}

function at(key: string): MapCoord {
  const a = anchor(key);
  return { col: a.col, row: a.row };
}

/* ── Positions de départ ────────────────────────────────────────────────── */

export const FALLBACK_START_POSITIONS: Record<StartKey, StartPosition> = {
  arconsat: {
    key: 'arconsat',
    label: 'Arconsat',
    at: at('arconsat'),
    townUid: 'T_arconsat',
    region: 'hauts_arconsat',
  },
  viscomtat: {
    key: 'viscomtat',
    label: 'Viscomtat',
    at: at('viscomtat'),
    townUid: 'T_viscomtat',
    region: 'futaies_viscomtat',
  },
  cervieres: {
    key: 'cervieres',
    label: 'Cervières',
    at: at('cervieres'),
    townUid: 'T_cervieres',
    region: 'chatellenie_cervieres',
  },
  noiretable: {
    key: 'noiretable',
    label: 'Noirétable',
    at: at('noiretable'),
    townUid: 'T_noiretable',
    region: 'pays_noiretable',
  },
  renaudie: {
    key: 'renaudie',
    label: 'La Renaudie',
    at: at('renaudie'),
    townUid: 'T_renaudie',
    region: 'marche_renaudie',
  },
};

export const FALLBACK_START_SETS: Record<2 | 3 | 4 | 5, StartKey[][]> = {
  2: [
    ['arconsat', 'renaudie'],
    ['viscomtat', 'cervieres'],
    ['arconsat', 'noiretable'],
  ],
  3: [
    ['arconsat', 'viscomtat', 'noiretable'],
    ['cervieres', 'viscomtat', 'renaudie'],
  ],
  4: [
    ['arconsat', 'viscomtat', 'cervieres', 'renaudie'],
    ['arconsat', 'cervieres', 'noiretable', 'renaudie'],
  ],
  5: [['arconsat', 'viscomtat', 'cervieres', 'noiretable', 'renaudie']],
};

/* ── Sceaux et centres neutres ──────────────────────────────────────────── */

const SEAL_SITES: { seal: SealId; anchorKey: string; offset: MapCoord; label: string }[] = [
  { seal: 'hautes_futaies', anchorKey: 'viscomtat', offset: { col: 11, row: -15 }, label: 'Sceau des Hautes-Futaies' },
  { seal: 'farges', anchorKey: 'cervieres', offset: { col: -5, row: 6 }, label: 'Sceau des Farges' },
  { seal: 'pamole', anchorKey: 'pamole', offset: { col: 0, row: 0 }, label: 'Sceau de Pamole' },
  { seal: 'hermitage', anchorKey: 'hermitage', offset: { col: 3, row: -4 }, label: "Sceau de l'Hermitage" },
  { seal: 'brumes', anchorKey: 'bois_noirs', offset: { col: -4, row: 10 }, label: 'Sceau des Brumes' },
];

const NEUTRAL_TOWNS: { key: string; uid: string; name: string; region: RegionId }[] = [
  { key: 'chabreloche', uid: 'T_chabreloche', name: 'Chabreloche', region: 'vallee_durolle' },
  { key: 'le_lac', uid: 'T_le_lac', name: 'Le Lac', region: 'lac_sagnes' },
  { key: 'vollore', uid: 'T_vollore', name: 'Vollore-Montagne', region: 'vollore_pamole' },
  { key: 'hermitage', uid: 'T_hermitage', name: "Notre-Dame de l'Hermitage", region: 'hermitage_peyrotine' },
];

/* ── Génération ─────────────────────────────────────────────────────────── */

const T = {
  route: TERRAINS.indexOf('route'),
  chemin: TERRAINS.indexOf('chemin'),
  prairie: TERRAINS.indexOf('prairie'),
  foret: TERRAINS.indexOf('foret'),
  pente: TERRAINS.indexOf('pente'),
  humide: TERRAINS.indexOf('humide'),
  rocher: TERRAINS.indexOf('rocher'),
  eau: TERRAINS.indexOf('eau'),
};

function regionIndexAt(col: number, row: number): number {
  let best = 'grande_chaussee' as RegionId;
  let bestD = Number.MAX_SAFE_INTEGER;
  const table: [string, RegionId][] = [
    ['arconsat', 'hauts_arconsat'],
    ['chabreloche', 'vallee_durolle'],
    ['le_lac', 'lac_sagnes'],
    ['col_sagnes', 'lac_sagnes'],
    ['maison_tresor', 'maison_tresor'],
    ['cervieres', 'chatellenie_cervieres'],
    ['viscomtat', 'futaies_viscomtat'],
    ['bois_noirs', 'coeur_bois_noirs'],
    ['noiretable', 'pays_noiretable'],
    ['hermitage', 'hermitage_peyrotine'],
    ['vollore', 'vollore_pamole'],
    ['pamole', 'vollore_pamole'],
    ['renaudie', 'marche_renaudie'],
  ];
  for (const [key, region] of table) {
    const a = anchor(key);
    const dc = a.col - col;
    const dr = a.row - row;
    const d = dc * dc + dr * dr;
    if (d < bestD) {
      bestD = d;
      best = region;
    }
  }
  return REGIONS.indexOf(best);
}

function buildElevation(seed: number): Int16Array {
  const elevation = new Int16Array(MAP_COLS * MAP_ROWS);
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      let wsum = 0;
      let vsum = 0;
      for (const a of ANCHOR_ROWS) {
        const dc = a.col - col;
        const dr = a.row - row;
        const d2 = dc * dc + dr * dr + 4;
        const w = 1000000 / (d2 * d2 === 0 ? 1 : d2);
        wsum += w;
        vsum += w * a.alt;
      }
      let h = Math.round(vsum / wsum);
      h += valueNoise(col, row, 48, seed ^ 0x51ed, 70);
      h += valueNoise(col, row, 17, seed ^ 0x2b19, 26);
      h += valueNoise(col, row, 6, seed ^ 0x7a31, 9);
      elevation[row * MAP_COLS + col] = Math.max(420, Math.min(1260, h));
    }
  }
  return elevation;
}

function buildSlope(elevation: Int16Array): Uint8Array {
  const slope = new Uint8Array(MAP_COLS * MAP_ROWS);
  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const i = row * MAP_COLS + col;
      const w = elevation[i - (col > 0 ? 1 : 0)];
      const e = elevation[i + (col < MAP_COLS - 1 ? 1 : 0)];
      const n = elevation[i - (row > 0 ? MAP_COLS : 0)];
      const s = elevation[i + (row < MAP_ROWS - 1 ? MAP_COLS : 0)];
      // 48 m par case ; pente en degrés approchée par la tangente × 45
      const gx = Math.abs(e - w);
      const gy = Math.abs(s - n);
      const g = Math.max(gx, gy) + Math.trunc(Math.min(gx, gy) / 2);
      slope[i] = Math.min(90, Math.trunc((g * 45) / 96));
    }
  }
  return slope;
}

interface Draft {
  terrain: Uint8Array;
  region: Uint8Array;
  elevation: Int16Array;
  slope: Uint8Array;
  flags: Uint16Array;
}

function classify(seed: number): Draft {
  const elevation = buildElevation(seed);
  const slope = buildSlope(elevation);
  const terrain = new Uint8Array(MAP_COLS * MAP_ROWS);
  const region = new Uint8Array(MAP_COLS * MAP_ROWS);
  const flags = new Uint16Array(MAP_COLS * MAP_ROWS);

  for (let row = 0; row < MAP_ROWS; row++) {
    for (let col = 0; col < MAP_COLS; col++) {
      const i = row * MAP_COLS + col;
      const h = elevation[i];
      const s = slope[i];
      const wet = valueNoise(col, row, 23, seed ^ 0x1177, 100);
      const wood = valueNoise(col, row, 31, seed ^ 0x4423, 100);
      let t: number;
      if (s >= 34 && h > 1000) t = T.rocher;
      else if (s >= 22) t = T.pente;
      else if (h > 1040 && wet > 40) t = T.humide;
      else if (wood > -10 && h > 620) t = T.foret;
      else if (wet > 55) t = T.humide;
      else t = T.prairie;
      terrain[i] = t;
      region[i] = regionIndexAt(col, row);
      let f = CELL_PASSABLE;
      if (s < 14 && (t === T.prairie || t === T.foret)) f |= CELL_BUILDABLE;
      if (t === T.foret || t === T.rocher) f |= CELL_CACHE;
      terrainEdge(terrain, i, col, row, f);
      flags[i] = f;
    }
  }
  return { terrain, region, elevation, slope, flags };
}

function terrainEdge(_t: Uint8Array, _i: number, _c: number, _r: number, _f: number): void {
  /* les lisières sont recalculées après le tracé des routes */
}

function carveRiver(d: Draft, seed: number): void {
  // La Durolle coule vers le nord-ouest depuis Le Lac.
  const course: MapCoord[] = [
    at('le_lac'),
    { col: 46, row: 34 },
    at('chabreloche'),
    { col: 33, row: 13 },
    { col: 26, row: 2 },
  ];
  const cells: MapCoord[] = [];
  for (let i = 0; i + 1 < course.length; i++) cells.push(...line(course[i], course[i + 1]));
  // Affluent depuis le col des Sagnes.
  const trib = [at('col_sagnes'), { col: 47, row: 41 }];
  cells.push(...line(trib[0], trib[1]));

  for (const c of cells) {
    const wobble = Math.trunc(valueNoise(c.col, c.row, 9, seed ^ 0x3c3c, 2));
    for (let dc = -1; dc <= 1; dc++) {
      const col = c.col + dc + wobble;
      if (col < 0 || col >= MAP_COLS) continue;
      const i = c.row * MAP_COLS + col;
      if (dc === 0 || (i % 3) !== 0) {
        d.terrain[i] = T.eau;
        d.flags[i] = d.flags[i] & ~(CELL_PASSABLE | CELL_BUILDABLE);
        d.elevation[i] = Math.max(420, d.elevation[i] - 12);
      }
    }
  }
}

const ROAD_LINKS: [string, string, boolean][] = [
  ['arconsat', 'chabreloche', true],
  ['chabreloche', 'le_lac', true],
  ['le_lac', 'col_sagnes', true],
  ['col_sagnes', 'maison_tresor', true],
  ['maison_tresor', 'cervieres', true],
  ['cervieres', 'noiretable', true],
  ['chabreloche', 'viscomtat', false],
  ['viscomtat', 'vollore', false],
  ['vollore', 'hermitage', false],
  ['hermitage', 'noiretable', false],
  ['hermitage', 'renaudie', true],
  ['vollore', 'renaudie', false],
  ['maison_tresor', 'bois_noirs', false],
  ['bois_noirs', 'noiretable', false],
];

function carveRoads(d: Draft): void {
  for (const [a, b, major] of ROAD_LINKS) {
    const cells = line(at(a), at(b));
    for (const c of cells) {
      if (c.col < 0 || c.col >= MAP_COLS || c.row < 0 || c.row >= MAP_ROWS) continue;
      const i = c.row * MAP_COLS + c.col;
      if (d.terrain[i] === T.eau) {
        d.flags[i] |= CELL_BRIDGE | CELL_PASSABLE | CELL_ROAD;
        continue;
      }
      d.terrain[i] = major ? T.route : T.chemin;
      d.flags[i] |= CELL_PASSABLE | CELL_ROAD;
      d.flags[i] &= ~CELL_BUILDABLE;
    }
  }
}

function markEdges(d: Draft): void {
  for (let row = 1; row < MAP_ROWS - 1; row++) {
    for (let col = 1; col < MAP_COLS - 1; col++) {
      const i = row * MAP_COLS + col;
      const t = d.terrain[i];
      if (
        d.terrain[i - 1] !== t ||
        d.terrain[i + 1] !== t ||
        d.terrain[i - MAP_COLS] !== t ||
        d.terrain[i + MAP_COLS] !== t
      ) {
        d.flags[i] |= CELL_EDGE;
      }
    }
  }
}

function clearPlot(d: Draft, c: MapCoord, radius: number): void {
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const col = c.col + dc;
      const row = c.row + dr;
      if (col < 0 || row < 0 || col >= MAP_COLS || row >= MAP_ROWS) continue;
      const i = row * MAP_COLS + col;
      if (d.terrain[i] === T.eau) continue;
      if (d.terrain[i] === T.rocher || d.terrain[i] === T.pente) d.terrain[i] = T.prairie;
      d.flags[i] |= CELL_PASSABLE;
    }
  }
}

function guardFor(tier: number, count: number, faction: 'granit' | 'ermitage'): ArmyStack[] {
  return [{ creature: `${faction}_t${tier}`, count }];
}

function buildObjects(d: Draft, seed: number): MapObject[] {
  const rng = createRng(seed ^ 0x5eed, 0x9e3779b9);
  const objects: MapObject[] = [];
  let n = 1;
  const uid = (): string => `O_${(n++).toString().padStart(4, '0')}`;

  const place = (o: Omit<MapObject, 'uid'>): MapObject => {
    const obj: MapObject = { uid: uid(), ...o };
    objects.push(obj);
    return obj;
  };

  // Capitales de départ (2 × 2 cases, entrée sur la case d'ancrage).
  for (const key of Object.keys(FALLBACK_START_POSITIONS) as StartKey[]) {
    const sp = FALLBACK_START_POSITIONS[key];
    clearPlot(d, sp.at, 3);
    place({
      kind: 'ville',
      at: sp.at,
      footprint: [
        sp.at,
        { col: sp.at.col + 1, row: sp.at.row },
        { col: sp.at.col, row: sp.at.row - 1 },
        { col: sp.at.col + 1, row: sp.at.row - 1 },
      ],
      entrance: sp.at,
      owner: null,
      data: { townUid: sp.townUid, name: sp.label, capital: true, start: key },
    });
  }

  // Centres neutres capturables.
  for (const nt of NEUTRAL_TOWNS) {
    const c = at(nt.key);
    clearPlot(d, c, 2);
    place({
      kind: 'village',
      at: c,
      footprint: [c, { col: c.col + 1, row: c.row }],
      entrance: c,
      owner: null,
      data: { townUid: nt.uid, name: nt.name, capital: false },
      guard: guardFor(3, 12 + nextInt(rng, 0, 8), 'granit'),
    });
  }

  // Maison du Trésor.
  const mt = at('maison_tresor');
  clearPlot(d, mt, 3);
  place({
    kind: 'maison_tresor',
    at: mt,
    footprint: [mt, { col: mt.col + 1, row: mt.row }],
    entrance: mt,
    owner: null,
    data: { name: 'Maison du Trésor' },
    guard: [
      { creature: 'granit_t6', count: 12 },
      { creature: 'ermitage_t6', count: 12 },
      { creature: 'granit_t7', count: 4 },
    ],
  });

  // Sceaux des Marches.
  for (const s of SEAL_SITES) {
    const a = anchor(s.anchorKey);
    const c = {
      col: Math.max(2, Math.min(MAP_COLS - 3, a.col + s.offset.col)),
      row: Math.max(2, Math.min(MAP_ROWS - 3, a.row + s.offset.row)),
    };
    clearPlot(d, c, 1);
    place({
      kind: 'sceau',
      at: c,
      footprint: [c],
      entrance: c,
      owner: null,
      data: { seal: s.seal, name: s.label },
      guard: [
        { creature: 'ermitage_t5', count: 8 + nextInt(rng, 0, 6) },
        { creature: 'granit_t5', count: 6 + nextInt(rng, 0, 6) },
      ],
    });
  }

  // Mines et sites de revenu, deux par région de départ.
  const mineSpots: { c: MapCoord; resource: string; amount: number }[] = [
    { c: { col: 55, row: 17 }, resource: 'bois', amount: 2 },
    { c: { col: 48, row: 9 }, resource: 'granit', amount: 2 },
    { c: { col: 31, row: 67 }, resource: 'essence', amount: 1 },
    { c: { col: 21, row: 79 }, resource: 'bois', amount: 2 },
    { c: { col: 91, row: 47 }, resource: 'filDor', amount: 1 },
    { c: { col: 99, row: 58 }, resource: 'fer', amount: 2 },
    { c: { col: 85, row: 88 }, resource: 'ecus', amount: 500 },
    { c: { col: 94, row: 79 }, resource: 'fer', amount: 2 },
    { c: { col: 54, row: 161 }, resource: 'bois', amount: 2 },
    { c: { col: 64, row: 172 }, resource: 'granit', amount: 2 },
    { c: { col: 29, row: 112 }, resource: 'granit', amount: 2 },
    { c: { col: 52, row: 42 }, resource: 'sel', amount: 2 },
    { c: { col: 67, row: 57 }, resource: 'sel', amount: 2 },
    { c: { col: 42, row: 93 }, resource: 'essence', amount: 1 },
  ];
  for (const m of mineSpots) {
    clearPlot(d, m.c, 1);
    place({
      kind: 'mine',
      at: m.c,
      footprint: [m.c],
      entrance: m.c,
      owner: null,
      data: { resource: m.resource, amount: m.amount },
      guard: guardFor(2, 8 + nextInt(rng, 0, 10), nextInt(rng, 0, 1) === 0 ? 'granit' : 'ermitage'),
    });
  }

  // Bornes armoriées.
  const borneSpots: MapCoord[] = [
    { col: 49, row: 27 },
    { col: 58, row: 52 },
    { col: 37, row: 74 },
    { col: 87, row: 66 },
    { col: 49, row: 119 },
    { col: 61, row: 152 },
  ];
  for (const b of borneSpots) {
    clearPlot(d, b, 1);
    place({
      kind: 'borne',
      at: b,
      footprint: [b],
      entrance: b,
      owner: null,
      data: { network: 'marches' },
    });
  }

  // Belvédères, sources et sanctuaires.
  const specials: { kind: MapObject['kind']; c: MapCoord; name: string }[] = [
    { kind: 'belvedere', c: at('pamole'), name: 'Belvédère de Pamole' },
    { kind: 'belvedere', c: { col: 96, row: 50 }, name: 'Belvédère de Cervières' },
    { kind: 'sanctuaire', c: at('hermitage'), name: "Sanctuaire de l'Hermitage" },
    { kind: 'source', c: { col: 46, row: 44 }, name: 'Source de la Durolle' },
    { kind: 'auberge', c: at('chabreloche'), name: 'Relais de Chabreloche' },
  ];
  for (const s of specials) {
    const c = { col: Math.min(MAP_COLS - 2, s.c.col + 2), row: Math.min(MAP_ROWS - 2, s.c.row + 2) };
    clearPlot(d, c, 1);
    place({ kind: s.kind, at: c, footprint: [c], entrance: c, owner: null, data: { name: s.name } });
  }

  // Ressources dispersées dans les caches autorisées.
  const kinds = ['bois', 'granit', 'fer', 'sel', 'essence', 'filDor', 'ecus'];
  for (let k = 0; k < 60; k++) {
    const col = nextInt(rng, 4, MAP_COLS - 5);
    const row = nextInt(rng, 4, MAP_ROWS - 5);
    const i = row * MAP_COLS + col;
    if ((d.flags[i] & CELL_CACHE) === 0 || (d.flags[i] & CELL_PASSABLE) === 0) continue;
    const res = kinds[nextInt(rng, 0, kinds.length - 1)];
    place({
      kind: 'ressource',
      at: { col, row },
      footprint: [{ col, row }],
      entrance: { col, row },
      owner: null,
      data: { resource: res, amount: res === 'ecus' ? 300 + nextInt(rng, 0, 8) * 100 : 3 + nextInt(rng, 0, 5) },
    });
  }

  // Gardes errantes des anneaux intermédiaires.
  for (let k = 0; k < 24; k++) {
    const col = nextInt(rng, 8, MAP_COLS - 9);
    const row = nextInt(rng, 8, MAP_ROWS - 9);
    const i = row * MAP_COLS + col;
    if ((d.flags[i] & CELL_PASSABLE) === 0) continue;
    const faction = nextInt(rng, 0, 1) === 0 ? 'granit' : 'ermitage';
    const tier = 2 + nextInt(rng, 0, 3);
    place({
      kind: 'garde',
      at: { col, row },
      footprint: [{ col, row }],
      entrance: { col, row },
      owner: null,
      data: { ring: 2 },
      guard: guardFor(tier, 4 + nextInt(rng, 0, 12), faction),
    });
  }

  return objects;
}

/* ── Assemblage ─────────────────────────────────────────────────────────── */

const worldCache = new Map<number, WorldMap>();

/** Construit (et met en cache) la carte de secours pour une graine donnée. */
export function buildFallbackWorld(seed: number): WorldMap {
  const cached = worldCache.get(seed);
  if (cached) return cached;

  const d = classify(seed);
  carveRiver(d, seed);
  carveRoads(d);
  const objects = buildObjects(d, seed);
  markEdges(d);

  const objectAt = new Uint32Array(MAP_COLS * MAP_ROWS);
  for (let k = 0; k < objects.length; k++) {
    for (const c of objects[k].footprint) {
      if (c.col < 0 || c.row < 0 || c.col >= MAP_COLS || c.row >= MAP_ROWS) continue;
      objectAt[c.row * MAP_COLS + c.col] = k + 1;
    }
  }

  const anchors: MapAnchor[] = ANCHOR_ROWS.map((a) => ({
    key: a.key,
    label: a.label,
    lat: a.lat,
    lon: a.lon,
    col: a.col,
    row: a.row,
    kind: a.kind,
  }));

  const world: WorldMap = {
    cols: MAP_COLS,
    rows: MAP_ROWS,
    terrain: d.terrain,
    region: d.region,
    elevation: d.elevation,
    slope: d.slope,
    flags: d.flags,
    objectAt,
    objects,
    anchors,
  };
  worldCache.set(seed, world);
  return world;
}

export function fallbackMapPack(): MapPack {
  return {
    MAP_VERSION: FALLBACK_MAP_VERSION,
    START_POSITIONS: FALLBACK_START_POSITIONS,
    START_SETS: FALLBACK_START_SETS,
    buildWorld: buildFallbackWorld,
  };
}

/** Terrain nommé d'une case, utile aux tests. */
export function fallbackTerrainName(world: WorldMap, col: number, row: number): Terrain {
  return TERRAINS[world.terrain[row * world.cols + col]];
}
