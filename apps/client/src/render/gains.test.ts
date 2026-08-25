/**
 * LES GAINS FLOTTANTS — « +5 bois » au pas du héros.
 *
 * Le ramassage n'avait aucun geste : l'objet disparaissait au sync suivant et
 * le trésor changeait dans le bandeau sans qu'aucun fil ne relie les deux.
 * Dans HMM3, chaque ramassage se voit — c'est la moitié du plaisir d'explorer.
 *
 * Les gardes du bas lisent la vue : une couche parfaitement juste que
 * `playEvents` n'appellerait pas ne montrerait rien — la leçon de la file
 * d'animation, débranchée des deux côtés pendant des semaines.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error — types Node absents du tsconfig du client, cf. battle/pouce.test.ts
import { readFileSync } from 'node:fs';
import { GainsFlottants } from './gains.js';
import type { Cadrage } from './commun.js';

const VUE: string = String(readFileSync(new URL('./index.ts', import.meta.url), 'utf8'))
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

const CADRE: Cadrage = { col: 10, row: 10, zoom: 32, largeur: 800, hauteur: 600 };

describe('gains flottants', () => {
  it('un gain fait naître une étiquette par ressource positive, trois au plus', () => {
    const g = new GainsFlottants();
    g.montrer({ col: 3, row: 4 }, { ecus: 300, bois: 5, fer: 2, sel: 1 });
    expect(g.couche.children.length).toBe(3);
    g.detruire();
  });

  it('une perte ne flotte pas : payer est un choix, pas un événement', () => {
    const g = new GainsFlottants();
    g.montrer({ col: 3, row: 4 }, { ecus: -200 });
    expect(g.couche.children.length).toBe(0);
    g.detruire();
  });

  it('vit puis meurt : plus aucune étiquette après sa durée de vie', () => {
    const g = new GainsFlottants();
    g.montrer({ col: 1, row: 1 }, { ecus: 100 });
    expect(g.couche.children.length).toBe(1);
    g.majVue(CADRE, 0.4);
    expect(g.couche.children.length).toBe(1);
    g.majVue(CADRE, 2.0);
    expect(g.couche.children.length).toBe(0);
    g.detruire();
  });

  it('monte et s’éteint — jamais un saut d’opacité', () => {
    const g = new GainsFlottants();
    g.montrer({ col: 2, row: 2 }, { bois: 8 });
    const texte = g.couche.children[0] as { position: { y: number }; alpha: number };
    g.majVue(CADRE, 0.05);
    const y1 = texte.position.y;
    const a1 = texte.alpha;
    g.majVue(CADRE, 0.5);
    const y2 = texte.position.y;
    g.majVue(CADRE, 0.6);
    expect(y2).toBeLessThan(y1);
    expect(a1).toBe(1);
    expect(texte.alpha).toBeLessThan(1);
    expect(texte.alpha).toBeGreaterThan(0);
    g.detruire();
  });

  it('la vue fait naître les gains AU PAS DU HÉROS, et seulement les nôtres', () => {
    /* Branchement : le gain naît sur la dernière case d'un HeroMoved du même
       lot, pour le joueur local, jamais en mouvement réduit. */
    expect(VUE).toContain("case 'ResourcesChanged':");
    const i = VUE.indexOf("case 'ResourcesChanged':");
    const bloc = VUE.slice(i, i + 400);
    expect(bloc).toContain('derniereCase');
    expect(bloc).toContain('e.player === this.deps.localPlayer');
    expect(bloc).toContain('this.gains.montrer(derniereCase, e.delta)');
    expect(bloc).toContain('!immediat');
  });

  it('la couche est animée par la vue et détruite avec elle', () => {
    expect(VUE).toContain('this.scene.addChild(this.gains.couche)');
    expect(VUE).toContain('this.gains.majVue(v, dtMs / 1000)');
    expect(VUE).toContain('this.gains.detruire()');
  });
});
