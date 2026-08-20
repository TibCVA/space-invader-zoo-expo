import { describe, expect, it } from 'vitest';
import { REGIONS, TERRAINS } from '@auvergne/engine';

import { CANTONS, accepte, cantonDe } from './cantons.js';
import { PROPS, type PropKey } from '../art/props.js';

/**
 * « Il faut que la carte soit très jolie avec beaucoup de détails (même si items
 * non jouables) et les différentes zones bien délimitées visuellement. »
 *
 * Ce que ce test garde n'est pas une impression : c'est que les douze pays
 * existent bel et bien dans les données du rendu, qu'ils diffèrent assez pour se
 * voir, et que la différence ne peut pas produire d'absurdité — un muret dans une
 * tourbière, une ferme dans une falaise.
 *
 * Le rendu lui-même se juge sur capture ; ces tests-ci gardent les invariants
 * qu'une capture ne montre pas : la couverture des douze cantons, la présence de
 * chaque silhouette dans l'atlas, l'écart de densité entre le pays le plus dense
 * et le plus clairsemé.
 */
describe('les douze pays du Forez', () => {
  it('donne un caractère à CHAQUE canton, sans repli muet', () => {
    for (const id of REGIONS) {
      expect(CANTONS[id], id).toBeDefined();
    }
    /* Et pas de canton fantôme dans la table. */
    for (const id of Object.keys(CANTONS)) {
      expect(REGIONS as readonly string[]).toContain(id);
    }
  });

  it('retombe sur un pays neutre pour un index hors table', () => {
    const neutre = cantonDe(200);
    expect(neutre.dose).toBe(0);
    expect(neutre.signature).toEqual([]);
    expect(neutre.bati).toEqual([]);
  });

  it('tient la teinte de pays sous quinze pour cent', () => {
    /* Au-delà, une frontière qui coupe une prairie se lit comme une couture
       d'affichage. La retenue est le sujet, pas un détail de réglage. */
    for (const id of REGIONS) {
      expect(CANTONS[id].dose, id).toBeGreaterThan(0);
      expect(CANTONS[id].dose, id).toBeLessThanOrEqual(0.15);
    }
  });

  it('creuse un écart de densité qui se voit', () => {
    const densites = REGIONS.map((id) => CANTONS[id].densite);
    const min = Math.min(...densites);
    const max = Math.max(...densites);
    /* Le Cœur des Bois Noirs contre les Hauts d'Arconsat : il faut au moins un
       rapport de deux pour qu'on sente qu'on change de pays sans lire son nom. */
    expect(max / min).toBeGreaterThanOrEqual(2);
    /* Mais jamais de désert ni de mur : le semis reste jouable. */
    expect(min).toBeGreaterThanOrEqual(0.5);
    expect(max).toBeLessThanOrEqual(1.6);
  });

  it('ne nomme que des silhouettes que l’atlas sait dessiner', () => {
    for (const id of REGIONS) {
      for (const k of [...CANTONS[id].signature, ...CANTONS[id].bati]) {
        expect(PROPS[k], `${id} → ${k}`).toBeDefined();
      }
    }
  });

  it('n’accepte une silhouette que sur un terrain qui la porte', () => {
    /* La règle métier, écrite plutôt que supposée : rien ne pousse sur l'eau,
       et un bâti ne se plante ni dans un lac ni dans une falaise. */
    const eau = TERRAINS.indexOf('eau');
    const falaise = TERRAINS.indexOf('falaise');
    for (const k of Object.keys(PROPS) as PropKey[]) {
      expect(accepte(k, eau), `${k} sur l'eau`).toBe(false);
    }
    for (const k of ['ferme', 'moulin', 'chapelle'] as PropKey[]) {
      expect(accepte(k, falaise), `${k} sur une falaise`).toBe(false);
    }
    /* Et l'inverse : une aiguille de granit a bien le droit d'être sur du roc. */
    expect(accepte('aiguille', TERRAINS.indexOf('rocher'))).toBe(true);
    expect(accepte('souche', TERRAINS.indexOf('humide'))).toBe(true);
    expect(accepte('muret', TERRAINS.indexOf('prairie'))).toBe(true);
    expect(accepte('muret', TERRAINS.indexOf('humide'))).toBe(false);
  });

  it('pose du bâti de décor dans chaque pays, et rarement', () => {
    /*
     * Quatre silhouettes bâties dormaient dans l'atlas — ferme, moulin,
     * chapelle, tour — que le semis n'a jamais posées : la carte ne portait
     * aucun hameau, aucun clocher, aucune tour de guet. C'est la réponse la plus
     * directe à « beaucoup de détails, même si items non jouables ».
     *
     * Rarement : au-delà de deux pour cent des cases éligibles, un pays se
     * couvre de fermes et l'on ne distingue plus les lieux visitables du décor.
     */
    const bâtis = new Set<PropKey>();
    for (const id of REGIONS) {
      const c = CANTONS[id];
      expect(c.bati.length, id).toBeGreaterThan(0);
      expect(c.chanceBati, id).toBeGreaterThan(0);
      expect(c.chanceBati, id).toBeLessThanOrEqual(0.02);
      for (const k of c.bati) bâtis.add(k);
    }
    /* Les quatre silhouettes servent toutes : aucune ne dort plus. */
    expect([...bâtis].sort()).toEqual(['chapelle', 'ferme', 'moulin', 'tour']);
  });

  it('donne à chaque pays une signature qui lui ressemble', () => {
    /* Trois cas nommés, parce qu'un test qui n'énonce rien ne garde rien : le
       pays des carriers a ses aiguilles, les sagnes leurs souches, la route du
       sel ses bornes. */
    expect(CANTONS.vollore_pamole.signature).toContain('aiguille');
    expect(CANTONS.lac_sagnes.signature).toContain('souche');
    expect(CANTONS.grande_chaussee.signature).toContain('borne');
    expect(CANTONS.coeur_bois_noirs.signature).toContain('sapin');
    /* Et le pays le plus dense est bien la sapinière. */
    const plusDense = REGIONS.reduce((a, b) =>
      CANTONS[a].densite >= CANTONS[b].densite ? a : b,
    );
    expect(plusDense).toBe('coeur_bois_noirs');
  });
});
