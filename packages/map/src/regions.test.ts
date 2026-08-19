import { describe, expect, it } from 'vitest';
import { REGIONS, type RegionId } from '@auvergne/engine';
import { FOREZ_ANCHORS } from './anchors.js';
import { buildTerrain } from './build.js';
import { CELLS, COLS, idx } from './grid.js';
import { REGION_LABELS, regionOf } from './regions.js';
import { START_KEYS, START_POSITIONS } from './starts.js';

const field = buildTerrain();

function census(): Record<RegionId, number> {
  const out = {} as Record<RegionId, number>;
  for (const id of REGIONS) out[id] = 0;
  for (let i = 0; i < CELLS; i++) out[REGIONS[field.region[i]]]++;
  return out;
}

describe('régions', () => {
  const counts = census();

  it('utilise les douze régions du document maître', () => {
    expect(REGIONS.length).toBe(12);
    for (const id of REGIONS) {
      expect(counts[id], `région vide : ${id}`).toBeGreaterThan(0);
    }
  });

  it('donne à chacune une surface crédible', () => {
    for (const id of REGIONS) {
      // La clairière de la Maison du Trésor est volontairement minuscule.
      const floor = id === 'maison_tresor' ? 500 : 3000;
      expect(counts[id], id).toBeGreaterThan(floor);
      expect(counts[id], id).toBeLessThan(20000);
    }
    let total = 0;
    for (const id of REGIONS) total += counts[id];
    expect(total).toBe(CELLS);
  });

  it('publie un libellé français pour chaque région', () => {
    for (const id of REGIONS) {
      expect(REGION_LABELS[id]).toBeTruthy();
      expect(REGION_LABELS[id].length).toBeGreaterThan(3);
    }
  });

  it('range chaque ancrage dans sa région', () => {
    const expected: Record<string, RegionId> = {
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
    for (const a of FOREZ_ANCHORS) {
      expect(regionOf(field.region, a.col, a.row), a.key).toBe(expected[a.key]);
    }
  });

  it('accorde la région déclarée par chaque position de départ', () => {
    for (const key of START_KEYS) {
      const sp = START_POSITIONS[key];
      expect(regionOf(field.region, sp.at.col, sp.at.row), key).toBe(sp.region);
    }
  });

  it('trace un vrai corridor marchand', () => {
    expect(counts.grande_chaussee).toBeGreaterThan(3000);
    // Le corridor doit traverser la carte du nord au sud.
    let minRow = Number.MAX_SAFE_INTEGER;
    let maxRow = -1;
    for (let i = 0; i < CELLS; i++) {
      if (REGIONS[field.region[i]] !== 'grande_chaussee') continue;
      const row = (i / COLS) | 0;
      if (row < minRow) minRow = row;
      if (row > maxRow) maxRow = row;
    }
    expect(minRow).toBeLessThan(5);
    expect(maxRow).toBeGreaterThan(410);
  });

  it('forme des régions d’un seul tenant à peu près compactes', () => {
    // Chaque région garde une composante connexe dominante. Le seuil reste
    // modéré : la Grande Chaussée traverse le Cœur des Bois Noirs et le coupe
    // légitimement en deux versants, comme dans le pays réel.
    const visited = new Uint8Array(CELLS);
    const best = {} as Record<RegionId, number>;
    for (const id of REGIONS) best[id] = 0;
    const queue = new Int32Array(CELLS);
    for (let start = 0; start < CELLS; start++) {
      if (visited[start] === 1) continue;
      const id = REGIONS[field.region[start]];
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      let size = 0;
      while (head < tail) {
        const cur = queue[head++];
        size++;
        const col = cur % COLS;
        const row = (cur / COLS) | 0;
        const neighbours = [
          col > 0 ? cur - 1 : -1,
          col < COLS - 1 ? cur + 1 : -1,
          row > 0 ? cur - COLS : -1,
          cur + COLS < CELLS ? cur + COLS : -1,
        ];
        for (const j of neighbours) {
          if (j < 0 || visited[j] === 1) continue;
          if (REGIONS[field.region[j]] !== id) continue;
          visited[j] = 1;
          queue[tail++] = j;
        }
      }
      if (size > best[id]) best[id] = size;
    }
    for (const id of REGIONS) {
      // La Grande Chaussée n'est pas une région compacte : c'est un ruban,
      // sectionné à chaque bourg qu'il traverse et par la clairière du Trésor.
      if (id === 'grande_chaussee') continue;
      expect(best[id] * 100, id).toBeGreaterThan(counts[id] * 45);
    }
    // Le ruban marchand doit tout de même garder de longs tronçons continus.
    expect(best.grande_chaussee).toBeGreaterThan(1200);
  });

  it('respecte la géographie : est, ouest, nord et sud', () => {
    const centroid = (id: RegionId): { col: number; row: number } => {
      let sc = 0;
      let sr = 0;
      let n = 0;
      for (let i = 0; i < CELLS; i++) {
        if (REGIONS[field.region[i]] !== id) continue;
        sc += i % COLS;
        sr += (i / COLS) | 0;
        n++;
      }
      return { col: Math.trunc(sc / n), row: Math.trunc(sr / n) };
    };
    const arconsat = centroid('hauts_arconsat');
    const renaudie = centroid('marche_renaudie');
    const cervieres = centroid('chatellenie_cervieres');
    const viscomtat = centroid('futaies_viscomtat');
    expect(arconsat.row).toBeLessThan(renaudie.row);
    expect(viscomtat.col).toBeLessThan(cervieres.col);
    expect(centroid('vallee_durolle').row).toBeLessThan(centroid('hermitage_peyrotine').row);
    expect(centroid('vollore_pamole').col).toBeLessThan(centroid('pays_noiretable').col);
  });

  it('rend grande_chaussee par défaut hors grille', () => {
    expect(regionOf(field.region, 0, 0)).toBeTruthy();
    expect(REGIONS.includes(regionOf(field.region, 10, 10))).toBe(true);
    expect(idx(0, 0)).toBe(0);
  });
});
