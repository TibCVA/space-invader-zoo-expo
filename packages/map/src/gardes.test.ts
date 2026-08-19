/**
 * Des gardes qui gardent : les postes tiennent les voies.
 *
 * L'audit mesurait l'écart le plus criant avec HMM3 : sur les dix itinéraires
 * optimaux entre capitales, AUCUN ne croisait un garde, parce que les
 * quarante-six gardes d'alors n'occupaient que leur case d'entrée — que le
 * calcul de chemin ignore par construction — et que trois seulement touchaient
 * une voie. Un garde que le chemin optimal contourne sans surcoût n'est pas
 * une garde, c'est un décor.
 *
 * Désormais trente POSTES se tiennent sur la voie même, aux transitions
 * d'anneau de difficulté, avec une empreinte de trois cases : l'entrée sur la
 * voie — la franchir déclenche le combat — et deux flancs réellement bloqués
 * pour le calcul de chemin. Mesures sur la graine de démonstration : les dix
 * itinéraires optimaux croisent tous au moins un garde (de un à cinq) ;
 * refuser tout combat reste possible — personne n'est emmuré — mais coûte
 * en moyenne quatre pour cent de marche en plus.
 *
 * Éprouvé en défaisant la correction : neutraliser la pose des postes
 * (`if (transition) postes.push(i)` retiré) fait tomber « ≥ 6 itinéraires
 * sur 10 » à 0 sur 10, et vide la compagnie des postes.
 */
import { describe, expect, it } from 'vitest';
import { CELL_PASSABLE, CELL_ROAD, TERRAINS, TERRAIN_COST } from '@auvergne/engine';
import { buildWorld } from './build.js';
import { COLS, IntHeap, ROWS } from './grid.js';
import { TIER_POWER } from './objects.js';

const GRAINE = 20250816;
const CELLS = COLS * ROWS;

const w = buildWorld(GRAINE);
const gardes = w.objects.filter((o) => o.kind === 'garde');
const postes = gardes.filter((o) => o.data['poste'] === true);

/* La règle du moteur (`buildStaticBlocked`) : toute case d'empreinte est
   bloquée pour la marche, sauf l'entrée. Le test marche comme le moteur. */
const bloque = new Uint8Array(CELLS);
for (const o of w.objects) {
  const e = o.entrance.row * COLS + o.entrance.col;
  for (const f of o.footprint) {
    const i = f.row * COLS + f.col;
    if (i !== e) bloque[i] = 1;
  }
}
const gardeEntree = new Uint8Array(CELLS);
for (const o of gardes) gardeEntree[o.entrance.row * COLS + o.entrance.col] = 1;

/** Coût de marche par indice de terrain, dérivé du contrat (jamais recopié). */
const COUT: readonly number[] = TERRAINS.map((t) => {
  const c = TERRAIN_COST[t];
  return Number.isFinite(c) && c <= 10_000 ? c : 0;
});

/**
 * Dijkstra aux règles du moteur : coûts de terrain, diagonale ×141/100,
 * empreintes bloquées sauf entrées. `eviteGardes` interdit en plus les
 * entrées de gardes — le trajet d'un héros qui refuse tout combat.
 */
function marche(src: number, eviteGardes: boolean): { dist: Int32Array; parent: Int32Array } {
  const dist = new Int32Array(CELLS).fill(-1);
  const parent = new Int32Array(CELLS).fill(-1);
  const regle = new Uint8Array(CELLS);
  const tas = new IntHeap(CELLS);
  dist[src] = 0;
  tas.push(0, src);
  while (tas.length > 0) {
    const i = tas.pop();
    if (regle[i] === 1) continue;
    regle[i] = 1;
    const d0 = dist[i];
    const col = i % COLS;
    const row = (i / COLS) | 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const c = col + dc;
        const r = row + dr;
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        const j = r * COLS + c;
        if ((w.flags[j] & CELL_PASSABLE) === 0 || bloque[j] === 1) continue;
        if (eviteGardes && gardeEntree[j] === 1) continue;
        let pas = COUT[w.terrain[j]] || TERRAIN_COST.chemin;
        if (dc && dr) pas = Math.trunc((pas * 141) / 100);
        const nd = d0 + pas;
        if (dist[j] >= 0 && dist[j] <= nd) continue;
        dist[j] = nd;
        parent[j] = i;
        tas.push(nd, j);
      }
    }
  }
  return { dist, parent };
}

describe('gardes — les postes tiennent les voies', () => {
  it('la compagnie des postes existe et se tient sur la voie', () => {
    expect(postes.length).toBeGreaterThanOrEqual(20);
    for (const p of postes) {
      const e = p.entrance.row * COLS + p.entrance.col;
      expect((w.flags[e] & CELL_ROAD) !== 0, `${p.uid} : entrée hors voie`).toBe(true);
      expect(p.guard && p.guard.length > 0, `${p.uid} : poste sans garnison`).toBe(true);
    }
  });

  it('chaque poste a son empreinte de trois cases : l’entrée et deux flancs', () => {
    for (const p of postes) {
      expect(p.footprint.length, `${p.uid} : empreinte incomplète`).toBe(3);
      expect(p.footprint[0]).toEqual(p.entrance);
      for (const f of p.footprint.slice(1)) {
        const dc = Math.abs(f.col - p.entrance.col);
        const dr = Math.abs(f.row - p.entrance.row);
        expect(Math.max(dc, dr), `${p.uid} : flanc détaché`).toBe(1);
        const i = f.row * COLS + f.col;
        /* Un flanc mure une case qui, sans lui, se marcherait : hors voie —
           on encadre la route, on ne la coupe pas — praticable et hors eau. */
        expect((w.flags[i] & CELL_ROAD) === 0, `${p.uid} : flanc sur la voie`).toBe(true);
        expect((w.flags[i] & CELL_PASSABLE) !== 0, `${p.uid} : flanc déjà infranchissable`).toBe(
          true,
        );
        expect(TERRAINS[w.terrain[i]], `${p.uid} : flanc sur l'eau`).not.toBe('eau');
      }
    }
  });

  it('au moins six des dix itinéraires optimaux entre capitales croisent un garde', () => {
    /* L'audit mesurait 0/10 ; la carte corrigée en mesure 10/10 (1 à 5 gardes
       par trajet). Le seuil du plan laisse de la marge aux graines futures. */
    const villes = w.objects.filter((o) => o.kind === 'ville');
    expect(villes.length).toBe(5);
    let croisent = 0;
    let paires = 0;
    for (let a = 0; a < villes.length; a++) {
      const sa = villes[a].entrance.row * COLS + villes[a].entrance.col;
      const { dist, parent } = marche(sa, false);
      for (let z = a + 1; z < villes.length; z++) {
        const sz = villes[z].entrance.row * COLS + villes[z].entrance.col;
        paires++;
        expect(dist[sz], `${villes[a].uid} → ${villes[z].uid} : inatteignable`).toBeGreaterThan(0);
        for (let i = sz; i >= 0 && i !== sa; i = parent[i]) {
          if (gardeEntree[i] === 1) {
            croisent++;
            break;
          }
        }
      }
    }
    expect(paires).toBe(10);
    expect(croisent, `${String(croisent)} itinéraires sur ${String(paires)}`).toBeGreaterThanOrEqual(
      6,
    );
  });

  it('refuser tout combat reste possible, mais jamais gratuit', () => {
    /* Les flancs ferment le contournement immédiat sans emmurer personne :
       c'est la différence entre un péage et un mur. Mesuré : +4 % de marche
       en moyenne pour éviter toutes les entrées de gardes. */
    const villes = w.objects.filter((o) => o.kind === 'ville');
    let coutLibre = 0;
    let coutEvite = 0;
    for (let a = 0; a < villes.length; a++) {
      const sa = villes[a].entrance.row * COLS + villes[a].entrance.col;
      const libre = marche(sa, false).dist;
      const evite = marche(sa, true).dist;
      for (let z = a + 1; z < villes.length; z++) {
        const sz = villes[z].entrance.row * COLS + villes[z].entrance.col;
        expect(evite[sz], `${villes[a].uid} → ${villes[z].uid} : emmuré par les gardes`)
          .toBeGreaterThan(0);
        coutLibre += libre[sz];
        coutEvite += evite[sz];
      }
    }
    expect(coutEvite).toBeGreaterThan(coutLibre);
  });

  it('la force des gardes croît avec l’anneau de difficulté', () => {
    /* Force mesurée avec le barème du semeur (TIER_POWER), jamais une copie.
       Mesuré sur la graine : anneau 2 ≈ 2 400, anneau 3 ≈ 7 300. */
    const parAnneau = new Map<number, number[]>();
    for (const g of gardes) {
      if (!g.guard) continue;
      let p = 0;
      for (const s of g.guard) {
        const tier = Number(s.creature.split('_t')[1]);
        p += s.count * TIER_POWER[tier];
      }
      const ring = Number(g.data['ring']);
      const liste = parAnneau.get(ring) ?? [];
      liste.push(p);
      parAnneau.set(ring, liste);
    }
    const anneaux = [...parAnneau.keys()].sort((a, z) => a - z);
    expect(anneaux.length).toBeGreaterThanOrEqual(2);
    let compares = 0;
    for (let k = 1; k < anneaux.length; k++) {
      const bas = parAnneau.get(anneaux[k - 1]) ?? [];
      const haut = parAnneau.get(anneaux[k]) ?? [];
      /* Deux gardes ne font pas une moyenne : on ne compare que les anneaux
         assez peuplés pour que la comparaison veuille dire quelque chose. */
      if (bas.length < 3 || haut.length < 3) continue;
      const moy = (xs: number[]): number => xs.reduce((s, x) => s + x, 0) / xs.length;
      expect(
        moy(haut),
        `anneau ${String(anneaux[k])} pas plus fort que ${String(anneaux[k - 1])}`,
      ).toBeGreaterThan(moy(bas));
      compares++;
    }
    expect(compares).toBeGreaterThanOrEqual(1);
  });
});
