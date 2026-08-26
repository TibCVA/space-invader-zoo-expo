/**
 * DEUX GESTES DE LA CARTE, demandés le 26/08 :
 *
 *  1. « je voudrais que l'on voie mieux visuellement quand on sélectionne un
 *     héros » — le marquage d'avant (chevron réchauffé, fin trait d'or) se
 *     perdait dans le décor : le héros choisi porte maintenant un HALO d'or
 *     pulsant au sol, repeint chaque image pour lui seul ;
 *  2. « quand on clique dans le vide, cela doit faire disparaître les
 *     vignettes des actifs précédemment sélectionnés » — l'appui sur une case
 *     nue congédie la fiche d'inspection, comme dans HMM3.
 *
 * Gardes de source, code lu sans commentaires (la leçon du faux vert de
 * « Quitter la cité »).
 */
import { describe, expect, it } from 'vitest';
/* `node:fs` n'est pas dans les types du client — cf. battle/pouce.test.ts. */
// @ts-expect-error — types Node absents du tsconfig du client, cf. ci-dessus
import { readFileSync } from 'node:fs';

function code(chemin: string): string {
  return String(readFileSync(new URL(chemin, import.meta.url), 'utf8'))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('le héros sélectionné se voit', () => {
  const JETONS = code('../render/heroes.ts');

  it('un halo au sol, sous le jeton, membre à part entière du jeton', () => {
    expect(JETONS).toContain('halo: Graphics');
    expect(JETONS).toContain('racine.addChild(halo)');
  });

  it('le halo PULSE pour le seul héros choisi, et s’éteint pour les autres', () => {
    expect(JETONS).toMatch(/if \(j\.dernierSelect\) \{/);
    expect(JETONS).toMatch(/Math\.sin\(temps \* 4\.2\)/);
    expect(JETONS).toContain('j.halo.visible = j.dernierSelect');
    /* En mouvement réduit, l'anneau reste — FIXE : la sélection doit se voir
       sans clignoter. */
    expect(JETONS).toMatch(/immobile \? 0\.85 :/);
  });
});

describe('le clic dans le vide congédie la fiche', () => {
  const VUES = code('./vues.tsx');

  it('l’appui sur une case nue ferme la fiche d’inspection', () => {
    /* `onPickCell` n'est atteint que quand rien d'autre n'était faisable
       (`render/index.ts`, étape 4 du clic) : c'est LE clic dans le vide. */
    const i = VUES.indexOf('onPickCell: (at): void => {');
    expect(i).toBeGreaterThan(0);
    const bloc = VUES.slice(i, i + 260);
    expect(bloc).toContain("selectionner({ kind: 'case', at })");
    expect(bloc).toContain('setCible(null)');
  });
});
