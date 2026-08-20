/**
 * La minicarte est la carte POLITIQUE : on y lit qui tient quoi.
 *
 * ## Le défaut
 *
 * `majVue` ne coloriait que `state.towns` et `state.heroes`. Relevé sur la
 * carte réelle, graine 20250816 : une centaine de lieux peuvent passer sous
 * une bannière — au dernier comptage 99, dont 48 gisements, 32 demeures,
 * 5 cités, 5 sceaux, 4 villages, 4 belvédères et la Maison du Trésor — et les
 * 90 qui ne sont pas des cités ne portaient AUCUNE marque, soit 91 % des biens
 * possédables invisibles sur la carte politique. La demande du propriétaire
 * était pourtant explicite : « il faut que l'on voie avec des drapeaux de
 * couleur visuellement les assets types mines ou châteaux ou autres qui sont
 * pris par un joueur ».
 *
 * ## Ce que ce fichier garde
 *
 * 1. **Le recensement est réel** — recompté sur la vraie carte à chaque
 *    exécution, en interrogeant la vraie table du pavois, et jamais figé en un
 *    nombre (voir le commentaire du premier `describe`).
 * 2. **Tout genre pavoisable reçoit une marque.** Le test ne recopie pas la
 *    liste : il parcourt `PAVOISABLE`, donne un maître à un lieu réel de chaque
 *    genre et exige qu'il ressorte — sauf la cité et le village, que la passe
 *    des cités dessine déjà d'un cran au-dessus. Ajouter un genre au pavois
 *    sans que la minicarte le voie fait rougir ce test.
 * 3. **Rien n'est marqué deux fois.** Une cité marquée par les deux passes
 *    porterait deux pastilles superposées.
 * 4. **Le brouillard tient.** La minicarte ne révèle que ce que le joueur a
 *    exploré ; sans ce filtre elle livrerait les possessions adverses dès le
 *    premier tour.
 *
 * Ce que ce fichier NE garde PAS : l'environnement de test est `node`, il n'y a
 * ni canevas ni Pixi vivant. Le test mesure la SÉLECTION des biens, pas la
 * taille des pastilles ni leur ordre de peinture — ces deux points-là ne se
 * jugent qu'à l'œil, sur une capture.
 *
 * ## Comment il a été éprouvé
 *
 * En défaisant la correction, une fois par point (voir le rapport).
 */

import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { createGame } from '@auvergne/engine';
import type { GameState, MapObject, MapObjectKind, WorldMap } from '@auvergne/engine';
import { GRAINE_DEMO, setupDemo } from '../state/demo.js';
import { PAVOISABLE } from './pavois.js';
import { biensPavoises } from './minimap.js';

let world: WorldMap;
let etat: GameState;

beforeAll(() => {
  bootstrapEngine();
  world = buildWorld(GRAINE_DEMO);
});

beforeEach(() => {
  /* Une partie neuve par test : les tests posent des propriétaires. */
  etat = createGame(setupDemo(), world);
});

/** Tous les lieux d'un genre, dans l'ordre de la carte. */
function lieuxDe(kind: MapObjectKind): MapObject[] {
  return world.objects.filter((o) => o.kind === kind);
}

/** Donne ce lieu à une bannière, dans le registre qui fait foi. */
function donner(objet: MapObject, joueur: 'P1' | 'P2'): void {
  const vif = etat.objects[objet.uid];
  expect(vif, `l'objet ${objet.uid} doit exister dans l'état`).toBeDefined();
  vif.owner = joueur;
}

/* ─────────────────── 1. Ce que la carte contient vraiment ────────────────── */

describe('recensement des biens possédables', () => {
  /*
   * Pas de nombre exact ici, et c'est délibéré.
   *
   * Le peuplement de la carte vit dans `packages/map/src/objects.ts` : entre
   * deux mesures prises à une heure d'intervalle, le recensement est passé de
   * 97 lieux pavoisables (46 gisements) à 99 (48 gisements) parce que ce
   * fichier avait bougé. Un test qui figerait 97 rougirait à chaque retouche du
   * peuplement, sans rien dire du défaut qu'il est censé garder — et on
   * finirait par le désarmer.
   *
   * Ce qui EST stable et ce qui motivait la correction, c'est le RAPPORT : les
   * biens qui ne sont pas des cités écrasent en nombre les neuf cités, donc
   * n'en marquer aucun revient à laisser la quasi-totalité de la carte
   * politique en blanc. Mesuré ce jour : 90 contre 9, soit dix fois plus.
   *
   * La table des genres, elle, est IMPORTÉE et non recopiée — mesurer avec sa
   * propre copie d'une table est exactement l'erreur qui a déjà coûté une
   * demi-journée à ce dépôt.
   */
  it('porte bien plus de biens secondaires que de cités', () => {
    const pavoisables = world.objects.filter((o) => PAVOISABLE.has(o.kind));
    const cites = pavoisables.filter((o) => o.kind === 'ville' || o.kind === 'village');
    const secondaires = pavoisables.length - cites.length;

    expect(cites).toHaveLength(Object.keys(etat.towns).length);
    expect(secondaires).toBeGreaterThan(cites.length * 5);
  });

  it('porte au moins un lieu de chaque genre pavoisable', () => {
    /* Sans quoi le test de sélection ci-dessous mesurerait du vide. */
    for (const kind of PAVOISABLE) {
      expect(lieuxDe(kind).length, `la carte doit porter un « ${kind} »`).toBeGreaterThan(0);
    }
  });
});

/* ─────────────── 2. Tout genre pavoisable reçoit une marque ──────────────── */

describe('sélection des biens à marquer', () => {
  it('marque un lieu de chaque genre pavoisable, cités exceptées', () => {
    /* La liste vient de `PAVOISABLE` : ajouter un genre au pavois sans que la
       minicarte le voie fait rougir ce test tout seul. */
    for (const kind of PAVOISABLE) {
      etat = createGame(setupDemo(), world);
      const lieux = lieuxDe(kind);
      expect(lieux.length, `la carte doit porter au moins un « ${kind} »`).toBeGreaterThan(0);
      const cible = lieux[0];
      donner(cible, 'P2');

      const marques = biensPavoises(world, etat, null);
      const vu = marques.some((m) => m.at.col === cible.at.col && m.at.row === cible.at.row);

      if (kind === 'ville' || kind === 'village') {
        /* Déjà dessinées par la passe des cités, d'un cran au-dessus. */
        expect(vu, `« ${kind} » ne doit pas être marqué deux fois`).toBe(false);
      } else {
        expect(vu, `« ${kind} » possédé doit porter une marque`).toBe(true);
      }
    }
  });

  it('ne marque aucun lieu neutre', () => {
    /* Au premier jour, seules les deux capitales sont tenues — et ce sont des
       cités. La passe des biens secondaires doit donc rendre une liste vide. */
    expect(biensPavoises(world, etat, null)).toHaveLength(0);
  });

  it('rend la bannière du maître, pas une couleur par défaut', () => {
    const mine = lieuxDe('mine')[0];
    donner(mine, 'P2');
    const marques = biensPavoises(world, etat, null);
    expect(marques).toHaveLength(1);
    expect(marques[0].owner).toBe('P2');
    expect(marques[0].kind).toBe('mine');
  });

  it('suit une prise : le bien change de bannière avec son maître', () => {
    const mine = lieuxDe('mine')[3];
    donner(mine, 'P1');
    expect(biensPavoises(world, etat, null)[0].owner).toBe('P1');
    donner(mine, 'P2');
    expect(biensPavoises(world, etat, null)[0].owner).toBe('P2');
  });

  it("ne parcourt même pas la carte tant qu'il n'y a pas de partie", () => {
    /*
     * `biensPavoises` est appelée à CHAQUE image par `majVue`. Un simple
     * « ne rend rien sans état » ne gardait rien du tout — `proprietaireLieu`
     * tolère un état nul et la liste serait vide de toute façon, éprouvé : en
     * retirant la sortie anticipée, l'assertion restait verte. On mesure donc
     * ce qui compte vraiment, la sortie AVANT le parcours des centaines de
     * lieux de la carte.
     */
    let lectures = 0;
    const espion = Object.create(world) as WorldMap;
    Object.defineProperty(espion, 'objects', {
      get(): readonly MapObject[] {
        lectures += 1;
        return world.objects;
      },
    });

    expect(biensPavoises(espion, null, null)).toHaveLength(0);
    expect(lectures, 'la carte ne doit pas être parcourue sans partie').toBe(0);
  });
});

/* ────────────────────────── 3. Le brouillard tient ───────────────────────── */

describe('brouillard', () => {
  /** Une nappe de brouillard uniforme au niveau demandé. */
  function nappe(niveau: 0 | 1 | 2): Uint8Array {
    return new Uint8Array(world.cols * world.rows).fill(niveau);
  }

  it('cache les biens des terres jamais explorées', () => {
    for (const mine of lieuxDe('mine').slice(0, 5)) donner(mine, 'P2');
    expect(biensPavoises(world, etat, nappe(0))).toHaveLength(0);
  });

  it('garde les biens des terres déjà vues, même hors de vue à cet instant', () => {
    /* Seuil des cités et non des héros : un gisement ne bouge pas, une place
       vue une fois reste inscrite sur la carte politique. */
    for (const mine of lieuxDe('mine').slice(0, 5)) donner(mine, 'P2');
    expect(biensPavoises(world, etat, nappe(1))).toHaveLength(5);
    expect(biensPavoises(world, etat, nappe(2))).toHaveLength(5);
  });

  it('ne révèle que les cases explorées quand la nappe est mixte', () => {
    const mines = lieuxDe('mine').slice(0, 6);
    for (const mine of mines) donner(mine, 'P2');
    const fog = nappe(0);
    for (const mine of mines.slice(0, 2)) {
      fog[mine.at.row * world.cols + mine.at.col] = 2;
    }
    const marques = biensPavoises(world, etat, fog);
    expect(marques).toHaveLength(2);
    for (const m of marques) {
      expect(fog[m.at.row * world.cols + m.at.col]).toBe(2);
    }
  });
});
