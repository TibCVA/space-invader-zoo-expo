/**
 * Contrat de fidélité de la carte du Forez (brief §7, document maître §3.4,
 * §20.1 et §22).
 *
 * Ces tests sont la recette de la carte : ils vérifient que la géographie est
 * juste, qu'aucun départ n'est enfermé, qu'il existe bien trois itinéraires
 * distincts vers la Maison du Trésor, que les drapeaux ne mentent jamais sur
 * le terrain, et que les cinq positions valent économiquement la même chose.
 */
import { describe, expect, it } from 'vitest';
import {
  CELL_BRIDGE,
  CELL_PASSABLE,
  TERRAINS,
  TERRAIN_COST,
  type MapCoord,
  type StartKey,
  type WorldMap,
} from '@auvergne/engine';
import { FOREZ_ANCHORS, anchorCell } from './anchors.js';
import { franchissable } from './terrain.js';
import { buildTerrain, buildWorld, startEconomy } from './build.js';
import { CELLS, COLS, IntHeap, NDC, NDR, ROWS, idx } from './grid.js';
import { projectToGrid } from './projection.js';
import { START_KEYS, START_POSITIONS } from './starts.js';

const world = buildWorld(20260817);

/* ── Outils de parcours ─────────────────────────────────────────────────── */

function passableAt(w: WorldMap, i: number): boolean {
  if ((w.flags[i] & CELL_BRIDGE) !== 0) return true;
  if ((w.flags[i] & CELL_PASSABLE) === 0) return false;
  return TERRAINS[w.terrain[i]] !== 'eau';
}

function stepCostAt(w: WorldMap, i: number): number {
  const name = TERRAINS[w.terrain[i]];
  if (name === 'eau') return TERRAIN_COST.chemin;
  return TERRAIN_COST[name];
}

/** Plus court chemin en points de marche, avec pénalité sur les cases déjà usées. */
function shortestPath(
  w: WorldMap,
  from: MapCoord,
  to: MapCoord,
  used: Uint8Array,
  penaltyBp: number,
): MapCoord[] | null {
  const dist = new Int32Array(CELLS).fill(0x7fffffff);
  const cameFrom = new Int32Array(CELLS).fill(-1);
  const closed = new Uint8Array(CELLS);
  const heap = new IntHeap(1 << 15);
  const start = idx(from.col, from.row);
  const goal = idx(to.col, to.row);
  dist[start] = 0;
  heap.push(0, start);

  while (heap.length > 0) {
    const cur = heap.pop();
    if (cur < 0) break;
    if (closed[cur] === 1) continue;
    closed[cur] = 1;
    if (cur === goal) break;
    const col = cur % COLS;
    const row = (cur / COLS) | 0;
    const g = dist[cur];
    for (let k = 0; k < 8; k++) {
      const nc = col + NDC[k];
      const nr = row + NDR[k];
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const j = nr * COLS + nc;
      if (closed[j] === 1 || !passableAt(w, j)) continue;
      let step = stepCostAt(w, j);
      if (NDC[k] !== 0 && NDR[k] !== 0) step = Math.trunc((step * 141) / 100);
      if (used[j] === 1) step = Math.trunc((step * penaltyBp) / 10000);
      const g2 = g + step;
      if (g2 >= dist[j]) continue;
      dist[j] = g2;
      cameFrom[j] = cur;
      heap.push(g2, j);
    }
  }

  if (dist[goal] === 0x7fffffff) return null;
  const path: MapCoord[] = [];
  let cursor = goal;
  let guard = 0;
  while (cursor >= 0 && guard++ < CELLS) {
    path.push({ col: cursor % COLS, row: (cursor / COLS) | 0 });
    if (cursor === start) break;
    cursor = cameFrom[cursor];
  }
  path.reverse();
  return path;
}

/** Composante franchissable atteignable depuis une case. */
function reachable(w: WorldMap, from: MapCoord): Uint8Array {
  const seen = new Uint8Array(CELLS);
  const queue = new Int32Array(CELLS);
  let head = 0;
  let tail = 0;
  const start = idx(from.col, from.row);
  seen[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const cur = queue[head++];
    const col = cur % COLS;
    const row = (cur / COLS) | 0;
    for (let k = 0; k < 8; k++) {
      const nc = col + NDC[k];
      const nr = row + NDR[k];
      if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
      const j = nr * COLS + nc;
      if (seen[j] === 1 || !passableAt(w, j)) continue;
      seen[j] = 1;
      queue[tail++] = j;
    }
  }
  return seen;
}

/* ── 1. Fidélité géographique ───────────────────────────────────────────── */

describe('fidélité — ancrages', () => {
  it('place chaque lieu nommé à moins d’une case de sa position projetée', () => {
    const report: string[] = [];
    for (const a of FOREZ_ANCHORS) {
      const g = projectToGrid(a.lat, a.lon);
      const d = Math.sqrt((g.col - a.col) ** 2 + (g.row - a.row) ** 2);
      if (d >= 1) report.push(`${a.key} : ${d.toFixed(3)}`);
    }
    expect(report).toEqual([]);
  });

  it('publie les mêmes ancrages dans le monde construit', () => {
    expect(world.anchors.length).toBe(FOREZ_ANCHORS.length);
    for (const a of world.anchors) {
      const source = FOREZ_ANCHORS.find((x) => x.key === a.key);
      expect(source, a.key).toBeDefined();
      expect(a.col).toBe((source as { col: number }).col);
      expect(a.row).toBe((source as { row: number }).row);
    }
  });

  it('conserve les directions principales', () => {
    const at = (k: Parameters<typeof anchorCell>[0]) => anchorCell(k);
    // Arconsat au nord, La Renaudie au sud, Viscomtat à l'ouest, Cervières à l'est.
    const mt = at('maison_tresor');
    expect(at('arconsat').row).toBeLessThan(mt.row);
    expect(at('renaudie').row).toBeGreaterThan(mt.row);
    expect(at('viscomtat').col).toBeLessThan(mt.col);
    expect(at('cervieres').col).toBeGreaterThan(mt.col);
    // Noirétable au sud-est, l'Hermitage au sud-ouest du Trésor.
    expect(at('noiretable').row).toBeGreaterThan(mt.row);
    expect(at('noiretable').col).toBeGreaterThan(mt.col);
    expect(at('hermitage').row).toBeGreaterThan(mt.row);
    expect(at('hermitage').col).toBeLessThan(mt.col);
  });
});

/* ── 2. Cohérence terrain / passabilité ─────────────────────────────────── */

describe('fidélité — passabilité', () => {
  it('n’affiche aucun passage ouvert qui soit techniquement bloqué', () => {
    const faults: string[] = [];
    for (let i = 0; i < CELLS; i++) {
      const name = TERRAINS[world.terrain[i]];
      const passable = (world.flags[i] & CELL_PASSABLE) !== 0;
      const bridged = (world.flags[i] & CELL_BRIDGE) !== 0;
      /* Ce qui ferme est lu dans `franchissable`, jamais recopié : la liste
         nommait la falaise seule, et le jour où le chaos rocheux s'est mis à
         fermer lui aussi, ce test a réclamé le contraire du contrat. */
      const ferme = !franchissable(world.terrain[i]);
      if (ferme && name !== 'eau' && passable) {
        faults.push(`${name} ouvert ${i % COLS},${(i / COLS) | 0}`);
      }
      if (name !== 'eau' && !ferme && !passable) {
        faults.push(`sec bloqué ${i % COLS},${(i / COLS) | 0}`);
      }
      if (name === 'eau' && passable !== bridged) {
        faults.push(`eau incohérente ${i % COLS},${(i / COLS) | 0}`);
      }
      if (faults.length > 10) break;
    }
    expect(faults).toEqual([]);
  });

  it('ne laisse aucun îlot sec inaccessible de taille notable', () => {
    const seen = reachable(world, anchorCell('maison_tresor'));
    let unreachableDry = 0;
    for (let i = 0; i < CELLS; i++) {
      if (!passableAt(world, i)) continue;
      if (seen[i] === 0) unreachableDry++;
    }
    // Quelques cases isolées derrière un méandre restent tolérables.
    expect(unreachableDry * 1000).toBeLessThan(CELLS);
  });
});

/* ── 3. Connexité et itinéraires ────────────────────────────────────────── */

describe('fidélité — accès à la Maison du Trésor', () => {
  const target = anchorCell('maison_tresor');
  const seen = reachable(world, target);

  it('n’isole aucune zone de départ', () => {
    for (const key of START_KEYS) {
      const at = START_POSITIONS[key].at;
      expect(seen[idx(at.col, at.row)], `${key} est enclavé`).toBe(1);
    }
  });

  it('offre au moins trois itinéraires distincts depuis chaque départ', () => {
    for (const key of START_KEYS) {
      const at = START_POSITIONS[key].at;
      const used = new Uint8Array(CELLS);
      const routes: MapCoord[][] = [];
      for (let r = 0; r < 3; r++) {
        const path = shortestPath(world, at, target, used, 60000);
        expect(path, `${key} : itinéraire ${r + 1} introuvable`).not.toBeNull();
        const route = path as MapCoord[];
        routes.push(route);
        /*
         * On n'use que le corps de l'itinéraire : les extrémités sont
         * imposées. La marge est une **part** du trajet, pas un nombre de
         * cases. Fixée à 8, elle laissait libres seize cases sur les trente
         * qui séparent Cervières de la Maison du Trésor à la taille d'une XL
         * de HMM3 — plus de la moitié du chemin restait ouverte, les trois
         * itinéraires repassaient par là et la mesure de diversité ne mesurait
         * plus rien. Un huitième reproduit exactement l'ancienne marge sur
         * l'ancienne carte, où le même trajet faisait soixante-huit cases.
         */
        const marge = Math.max(2, Math.trunc(route.length / 8));
        for (let k = marge; k < route.length - marge; k++) {
          used[idx(route[k].col, route[k].row)] = 1;
        }
      }

      for (let a = 0; a < routes.length; a++) {
        for (let b = a + 1; b < routes.length; b++) {
          const setA = new Set(routes[a].map((p) => idx(p.col, p.row)));
          let shared = 0;
          for (const p of routes[b]) if (setA.has(idx(p.col, p.row))) shared++;
          const smallest = Math.min(routes[a].length, routes[b].length);
          const ratio = (shared * 100) / smallest;
          expect(
            ratio,
            `${key} : itinéraires ${a + 1} et ${b + 1} partagent ${ratio.toFixed(1)} % des cases`,
          ).toBeLessThan(40);
        }
      }
    }
  });

  it('relie aussi les cinq Sceaux des Marches à chaque départ', () => {
    const seals = world.objects.filter((o) => o.kind === 'sceau');
    expect(seals.length).toBe(5);
    for (const key of START_KEYS) {
      const at = START_POSITIONS[key].at;
      const field = reachable(world, at);
      for (const s of seals) {
        expect(field[idx(s.entrance.col, s.entrance.row)], `${key} → ${s.uid}`).toBe(1);
      }
    }
  });
});

/* ── 4. Équivalence économique des départs ──────────────────────────────── */

describe('fidélité — équivalence économique des départs', () => {
  function spread(values: Record<StartKey, number>): number {
    let min = Number.MAX_SAFE_INTEGER;
    let max = 0;
    for (const key of START_KEYS) {
      const v = values[key];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    return ((max - min) * 100) / max;
  }

  it('tient la fourchette de ±8 % sur plusieurs graines', () => {
    for (const seed of [1, 20260817, 987654321]) {
      const values = startEconomy(seed);
      for (const key of START_KEYS) {
        expect(values[key], `${key} (graine ${seed})`).toBeGreaterThan(0);
      }
      const s = spread(values);
      expect(s, `graine ${seed} : écart de ${s.toFixed(2)} %`).toBeLessThanOrEqual(8);
    }
  });
});

/* ── 5. Performance ─────────────────────────────────────────────────────── */

describe('fidélité — performance', () => {
  it('mémorise le terrain fixe : le second appel est immédiat', () => {
    const first = buildTerrain();
    const t0 = Date.now();
    const second = buildTerrain();
    const elapsed = Date.now() - t0;
    expect(second).toBe(first);
    expect(elapsed).toBeLessThan(50);
  });

  it('construit un monde complet en moins de 2,5 s', () => {
    const t0 = Date.now();
    buildWorld(31337);
    const elapsed = Date.now() - t0;
    expect(elapsed, `${elapsed} ms`).toBeLessThan(2500);
  });

  it('n’alloue que des tableaux typés pour les champs de la carte', () => {
    expect(world.terrain).toBeInstanceOf(Uint8Array);
    expect(world.region).toBeInstanceOf(Uint8Array);
    expect(world.elevation).toBeInstanceOf(Int16Array);
    expect(world.slope).toBeInstanceOf(Uint8Array);
    expect(world.flags).toBeInstanceOf(Uint16Array);
    expect(world.objectAt).toBeInstanceOf(Uint32Array);
    expect(world.terrain.length).toBe(CELLS);
    expect(world.objectAt.length).toBe(CELLS);
  });
});
