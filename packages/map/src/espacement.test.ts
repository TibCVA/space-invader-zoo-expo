import { describe, expect, it } from 'vitest';

import { RESOURCE_KEYS } from '@auvergne/engine';

import { buildWorld } from './build.js';
import {
  ECART_MINIMAL,
  cleEspacement,
  ecartRelache,
  ecartVoulu,
} from './objects.js';

/**
 * « Je ne veux pas avoir 2 fois le même asset trop proches les uns des autres. »
 *
 * C'est la demande du propriétaire, mot pour mot, et elle se mesure : pour
 * chaque CLEF d'espacement — `mine|bois`, `ressource|sel`, `coffre` — deux lieux
 * ne doivent pas se trouver à moins de l'écart voulu par la table du semeur.
 *
 * **Ce que le test tolère, et pourquoi.** La géographie est fixe (document
 * maître §4) : la Chapelle de l'Hermitage et la Croix de la Peyrotine sont
 * écrites à la main à neuf cases l'une de l'autre, et le semeur n'a aucun
 * pouvoir de les écarter. Une paire dont les DEUX membres portent la marque
 * `fixe` est donc exclue du compte — mais elle est comptée à part et bornée,
 * pour qu'on ne puisse pas faire disparaître un défaut en déclarant un lieu
 * fixe. Dès qu'un membre de la paire est SEMÉ, la paire compte : un semeur doit
 * s'écarter des lieux écrits comme des siens.
 *
 * **Pourquoi plusieurs graines.** Un invariant de placement vérifié sur une
 * seule graine ne dit rien — on l'a appris en corrigeant les caches d'eau : le
 * tirage aval s'était décalé, le test d'une graine était redevenu vert, et les
 * postes de garde étaient toujours plantés dans la rivière. Ici l'enjeu est le
 * même : la saturation d'un anneau dépend du relief tiré.
 */
const GRAINES = [20250816, 20260817, 1, 424242, 987654321];

/** Distance de Tchebychev — c'est ainsi qu'on marche sur cette carte. */
function distance(
  a: { col: number; row: number },
  b: { col: number; row: number },
): number {
  return Math.max(Math.abs(a.col - b.col), Math.abs(a.row - b.row));
}

describe('espacement des lieux', () => {
  it('ne pose jamais deux lieux semés de même clef sous l’écart voulu', () => {
    for (const graine of GRAINES) {
      const w = buildWorld(graine);
      const parCle = new Map<
        string,
        { col: number; row: number; ecrit: boolean; nom: string }[]
      >();
      for (const o of w.objects) {
        const cle = cleEspacement(o.kind, o.data);
        const p = {
          col: o.at.col,
          row: o.at.row,
          ecrit: o.data.fixe === true,
          nom: (o.data.name as string | undefined) ?? o.kind,
        };
        const l = parCle.get(cle);
        if (l) l.push(p);
        else parCle.set(cle, [p]);
      }

      for (const [cle, lieux] of parCle) {
        const voulu = ECART_MINIMAL[cle] ?? ECART_MINIMAL[cle.split('|')[0]] ?? 6;
        for (let i = 0; i < lieux.length; i++) {
          for (let j = i + 1; j < lieux.length; j++) {
            if (lieux[i].ecrit && lieux[j].ecrit) continue;
            const d = distance(lieux[i], lieux[j]);
            expect(
              d,
              `graine ${String(graine)} · ${cle} : ${lieux[i].nom} (${String(lieux[i].col)},${String(lieux[i].row)}) ` +
                `et ${lieux[j].nom} (${String(lieux[j].col)},${String(lieux[j].row)}) à ${String(d)} cases, ` +
                `écart voulu ${String(voulu)}`,
            ).toBeGreaterThanOrEqual(voulu);
          }
        }
      }
    }
  });

  /*
   * Le garde-fou du garde-fou : on ne doit pas pouvoir vider le test ci-dessus
   * en déclarant tout le monde « écrit à la main ». La géographie fixe compte
   * une trentaine de gisements nommés, cinq sceaux, neuf bornes, quatre
   * belvédères, huit sanctuaires et sources, six auberges, dix doléances et deux
   * cols — de l'ordre de quatre-vingts lieux sur les quatre cent quatre-vingts
   * de la carte. Le jour où ce nombre s'envole, c'est que quelqu'un a marqué du
   * semis comme écrit, et le test précédent ne mesure plus rien.
   */
  it('garde la géographie écrite minoritaire', () => {
    const w = buildWorld(GRAINES[0]);
    const ecrits = w.objects.filter((o) => o.data.fixe === true).length;
    expect(ecrits).toBeGreaterThan(40);
    expect(ecrits).toBeLessThan(w.objects.length / 3);
  });

  /*
   * Les paires écrites qui contreviennent à l'écart sont un choix d'auteur, pas
   * un défaut — mais un choix qu'on veut voir compté. Trois aujourd'hui : deux
   * sanctuaires, deux sources, deux sceaux. La borne haute est là pour qu'une
   * dérive se remarque.
   */
  it('ne compte qu’une poignée de voisinages écrits à la main', () => {
    const w = buildWorld(GRAINES[0]);
    const parCle = new Map<string, { col: number; row: number }[]>();
    for (const o of w.objects) {
      if (o.data.fixe !== true) continue;
      const cle = cleEspacement(o.kind, o.data);
      const l = parCle.get(cle);
      if (l) l.push(o.at);
      else parCle.set(cle, [o.at]);
    }
    let paires = 0;
    for (const [cle, lieux] of parCle) {
      const voulu = ECART_MINIMAL[cle] ?? ECART_MINIMAL[cle.split('|')[0]] ?? 6;
      for (let i = 0; i < lieux.length; i++) {
        for (let j = i + 1; j < lieux.length; j++) {
          if (distance(lieux[i], lieux[j]) < voulu) paires++;
        }
      }
    }
    expect(paires).toBeLessThanOrEqual(4);
  });

  /*
   * Le repli muet est un piège éprouvé : la table portait `mine|fil_or` quand la
   * clef canonique est `mine|filDor`, si bien que le fil d'or retombait sur le
   * repli générique — cinq cases entre deux filatures au lieu de quatorze — sans
   * que rien ne le signale. Une clef mal orthographiée ne casse rien, elle
   * désarme la règle : le test exige donc la clef EXACTE pour chaque ressource,
   * et pas seulement l'existence d'un repli.
   */
  it('donne à chaque clef d’espacement une entrée EXACTE dans la table', () => {
    const manquantes = new Set<string>();
    for (const graine of GRAINES) {
      for (const o of buildWorld(graine).objects) {
        const cle = cleEspacement(o.kind, o.data);
        if (ECART_MINIMAL[cle] === undefined) manquantes.add(cle);
      }
    }
    expect([...manquantes].sort()).toEqual([]);
  });

  /*
   * Le relâchement est ce qui empêche l'espacement de manger la densité : un
   * semeur qui n'atteint pas son compte desserre son écart plutôt que de rendre
   * une carte pauvre. Le plancher est ce qui empêche le relâchement de tout
   * rendre. Les deux règles sont vérifiées ici sur toutes les clefs de la table,
   * parce que sur la carte le dernier palier ne se déclenche jamais — on l'a
   * mesuré en le retirant, et la carte est restée propre sur sept graines.
   */
  it('desserre l’écart sans jamais passer sous le plancher', () => {
    for (const cle of Object.keys(ECART_MINIMAL)) {
      const [kind, resource] = cle.split('|');
      const data = resource ? { resource } : {};
      const plein = ecartRelache(kind, data, 10000);
      expect(plein, cle).toBe(ECART_MINIMAL[cle]);
      let precedent = plein;
      for (const facteur of [6600, 3300, 0]) {
        const relache = ecartRelache(kind, data, facteur);
        expect(relache, `${cle} à ${String(facteur)}`).toBeLessThanOrEqual(precedent);
        /* Le plancher est écrit en clair — TROIS — et non lu dans la constante :
           un test qui lit la valeur qu'il prétend garder descend avec elle. On
           l'a vérifié en ramenant `PLANCHER_ECART` à 1, ce que la version
           auto-référentielle laissait passer sans broncher. */
        expect(relache, `${cle} à ${String(facteur)}`).toBeGreaterThanOrEqual(
          Math.min(plein, 3),
        );
        precedent = relache;
      }
    }
  });

  it('donne aux gisements de même ressource plus d’écart qu’aux gisements mêlés', () => {
    /* La règle métier, écrite plutôt que supposée : deux scieries se font
       concurrence, une scierie et une carrière se complètent. */
    /* La liste vient de `RESOURCE_KEYS` : une liste recopiée à la main est
       précisément ce qui a laissé passer `fil_or`. */
    for (const r of RESOURCE_KEYS) {
      expect(ecartVoulu('mine', { resource: r }), r).toBeGreaterThan(ECART_MINIMAL.mine);
      expect(ecartVoulu('ressource', { resource: r }), r).toBeGreaterThan(ECART_MINIMAL.ressource);
    }
  });
});
