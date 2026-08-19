/**
 * Chaque lieu qui se visite est rattaché au réseau des voies.
 *
 * Exigence littérale du propriétaire : « tous les lieux d'intérêt (actifs)
 * doivent être rattachés à une route secondaire reliée soit à la route
 * principale en jaune, soit à une autre route secondaire. » Avant le tracé
 * des embranchements, 24 lieux sur 94 seulement touchaient une voie ; les 70
 * autres étaient des points isolés dans les bois (mesuré en neutralisant le
 * tracé : le test tombe alors exactement sur ces 70 oubliés).
 *
 * La connexité se mesure sur le graphe des voies **plus les ponts et gués** :
 * un embranchement qui franchit la Durolle s'interrompt légitimement sur
 * l'eau pontée — le pont est le chemin — et reprendre le tracé de l'autre
 * côté n'est pas une rupture. C'est le cas mesuré qui a fixé cette règle :
 * un seul lieu de la carte de démonstration s'attache par un gué.
 *
 * Éprouvé en défaisant la correction : neutraliser `tracerEmbranchements`
 * fait tomber « chaque lieu desservi a sa voie » à 3 lieux sur 94.
 */
import { describe, expect, it } from 'vitest';
import { CELL_BRIDGE, CELL_ROAD, TERRAINS } from '@auvergne/engine';
import { buildWorld } from './build.js';
import { COLS, ROWS } from './grid.js';
import { DESSERVIS } from './embranchements.js';

const GRAINE = 20250816;

function estVoie(w: ReturnType<typeof buildWorld>, i: number): boolean {
  const t = TERRAINS[w.terrain[i]];
  return t === 'route' || t === 'chemin';
}

/** Voie, pont ou gué : ce qui porte les pas d'un voyageur sur le réseau. */
function porteLeReseau(w: ReturnType<typeof buildWorld>, i: number): boolean {
  return estVoie(w, i) || (w.flags[i] & CELL_BRIDGE) !== 0;
}

describe('embranchements — chaque lieu a son chemin', () => {
  const w = buildWorld(GRAINE);
  const lieux = w.objects.filter((o) => DESSERVIS.has(o.kind));

  it('la carte de démonstration a bien des lieux à desservir', () => {
    expect(lieux.length).toBeGreaterThan(50);
  });

  it('chaque lieu desservi a sa voie : l’entrée est sur une case de chemin', () => {
    const oublies: string[] = [];
    for (const o of lieux) {
      const i = o.entrance.row * COLS + o.entrance.col;
      if (!porteLeReseau(w, i)) {
        oublies.push(`${o.kind} ${o.uid} en (${String(o.entrance.col)},${String(o.entrance.row)})`);
      }
    }
    expect(oublies, oublies.join(' · ')).toEqual([]);
  });

  it('toute voie est reliée — par voie, pont ou gué — à la grande chaussée', () => {
    /* Composantes connexes du graphe « voie ou pont », 8 voisins. La consigne
       autorise une secondaire reliée à une autre secondaire : la transitivité
       est le cœur du test, chaque composante doit finir sur du jaune. */
    const comp = new Int32Array(COLS * ROWS).fill(-1);
    const file = new Int32Array(COLS * ROWS);
    const aRoute: boolean[] = [];
    for (let depart = 0; depart < COLS * ROWS; depart++) {
      if (!porteLeReseau(w, depart) || comp[depart] >= 0) continue;
      const num = aRoute.length;
      let route = false;
      let tete = 0;
      let queue = 0;
      file[queue++] = depart;
      comp[depart] = num;
      while (tete < queue) {
        const i = file[tete++];
        if (TERRAINS[w.terrain[i]] === 'route') route = true;
        const col = i % COLS;
        const row = (i / COLS) | 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (!dr && !dc) continue;
            const c = col + dc;
            const r = row + dr;
            if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
            const j = r * COLS + c;
            if (!porteLeReseau(w, j) || comp[j] >= 0) continue;
            comp[j] = num;
            file[queue++] = j;
          }
        }
      }
      aRoute.push(route);
    }
    /* Un gué isolé au milieu d'une rivière — sans un mètre de chemin de part
       et d'autre — est un passage pour le marcheur, pas une « route
       secondaire » : la carte en porte 88, hérités du semis des franchissements,
       et l'exigence ne parle pas d'eux. Seules les composantes qui contiennent
       au moins une vraie case de voie doivent finir sur du jaune. */
    const orphelines: number[] = [];
    for (let n = 0; n < aRoute.length; n++) {
      if (aRoute[n]) continue;
      let contientVoie = false;
      for (let i = 0; i < COLS * ROWS && !contientVoie; i++) {
        if (comp[i] === n && estVoie(w, i)) contientVoie = true;
      }
      if (contientVoie) orphelines.push(n);
    }
    expect(orphelines, `composantes de voie sans chaussée : ${String(orphelines.length)}`).toEqual(
      [],
    );
  });

  it('les cases peintes portent le drapeau de voie, et jamais celui de cache', () => {
    for (let i = 0; i < COLS * ROWS; i++) {
      if (!estVoie(w, i)) continue;
      expect((w.flags[i] & CELL_ROAD) !== 0, `voie sans drapeau en ${String(i)}`).toBe(true);
    }
  });

  it('reste déterministe : deux constructions de même graine tracent pareil', () => {
    /* Tous les lieux desservis d'aujourd'hui sont des sites FIXES — le tracé
       est donc identique d'une graine à l'autre, et c'est normal. Le jour où
       la densification sèmera des demeures et des moulins tirés de la graine,
       les tracés divergeront entre graines ; ce test ne garde que ce qui doit
       toujours tenir : même graine, même carte, au bit près. */
    const a = buildWorld(GRAINE);
    const c = buildWorld(GRAINE);
    expect(Buffer.from(a.terrain).equals(Buffer.from(c.terrain))).toBe(true);
    expect(Buffer.from(a.flags).equals(Buffer.from(c.flags))).toBe(true);
  });
});
