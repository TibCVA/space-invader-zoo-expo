/**
 * LA SCÈNE NE SE REMONTE PAS À CHAQUE COMMANDE — le défaut racine du
 * « héros qui se téléporte ».
 *
 * Le moteur CLONE l'état à chaque commande (`apply.ts`), donc `game` (et
 * tout ce qui en découle : `combat`, `cible`) change de référence à chaque
 * coup. Or l'effet de `ScenePixi` dépend de `fabrique` : une fabrique
 * mémorisée sur `game` prenait une identité neuve à chaque dispatch, et
 * React démontait la scène PixiJS entière — la file d'animation mourait à la
 * naissance, la marche du héros ne se jouait JAMAIS, quelles que soient les
 * cadences réglées. Trois écrans étaient touchés : carte, cité, combat.
 *
 * Gardes de source (code lu sans commentaires, la leçon du faux vert de
 * « Quitter la cité ») : les tableaux de dépendances des fabriques ne
 * contiennent plus AUCUN objet qui change de référence par commande, et
 * chaque fabrique lit l'état frais au montage par `viewStore.get()`.
 */
import { describe, expect, it } from 'vitest';
/* `node:fs` n'est pas dans les types du client — cf. battle/pouce.test.ts. */
// @ts-expect-error — types Node absents du tsconfig du client, cf. ci-dessus
import { readFileSync } from 'node:fs';

const VUES: string = String(readFileSync(new URL('./vues.tsx', import.meta.url), 'utf8'))
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

/** Les tableaux de dépendances qui ferment un `useCallback<FabriqueScene>`. */
function depsDesFabriques(source: string): string[] {
  const sorties: string[] = [];
  const motif = /useCallback<FabriqueScene>\(/g;
  let m: RegExpExecArray | null;
  while ((m = motif.exec(source)) !== null) {
    /* Le tableau de dépendances est le dernier `[...]` avant la parenthèse
       fermante de l'appel : on cherche `,\n [ ... ],\n );` après le corps. */
    const suite = source.slice(m.index, m.index + 4000);
    const fin = suite.match(/\],?\s*\)\s*;/);
    if (!fin || fin.index === undefined) continue;
    const avant = suite.slice(0, fin.index + 1);
    const ouverture = avant.lastIndexOf('[');
    sorties.push(avant.slice(ouverture, fin.index + 1));
  }
  return sorties;
}

describe('les fabriques de scène sont stables entre deux commandes', () => {
  const deps = depsDesFabriques(VUES);

  it('les trois écrans à scène (carte, cité, combat) ont chacun leur fabrique', () => {
    expect(deps.length).toBe(3);
  });

  it('aucune dépendance ne change de référence à chaque coup', () => {
    for (const d of deps) {
      /* `game`, `combat` et `cible` sont clonés à chaque commande. `world`,
         `localPlayer`, `demo`, `reducedMotion` et les chaînes dérivées
         (`uidCible`, `factionCible`) sont stables pour une partie donnée. */
      expect(d, d).not.toMatch(/\bgame\b/);
      expect(d, d).not.toMatch(/\bcombat\b/);
      expect(d, d).not.toMatch(/\bcible\b(?!\w)/);
    }
  });

  it('chaque fabrique lit l’état FRAIS au montage, par le magasin', () => {
    const corps = VUES.split('useCallback<FabriqueScene>').slice(1);
    expect(corps.length).toBe(3);
    for (const c of corps) {
      expect(c.slice(0, 1600)).toContain('viewStore.get().game');
    }
  });

  it('la cité se tient à jour par setTown — pas par remontage', () => {
    expect(VUES).toContain('vueCiteRef.current?.setTown(cible)');
  });
});

/**
 * LE JETON N'EST PAS CLAQUÉ À DESTINATION AVANT LA MARCHE.
 *
 * `relire` (abonné à la construction de la vue) passe AVANT `jouerLaFile`
 * (abonné au montage de la scène) : sans réserve, `sync` posait le jeton à
 * l'arrivée, puis l'animation partait… de l'arrivée. Les héros dont une
 * marche attend dans la file sont donc exclus du claquage.
 */
describe('la marche part du départ, pas de l’arrivée', () => {
  const RENDU: string = String(readFileSync(new URL('../render/index.ts', import.meta.url), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const JETONS: string = String(readFileSync(new URL('../render/heroes.ts', import.meta.url), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

  it('sync exclut les héros dont la marche attend dans la file', () => {
    expect(RENDU).toMatch(/event\.type === 'HeroMoved'\) enMarche\.add/);
    expect(RENDU).toContain('this.jetons.sync(state, enMarche)');
    expect(JETONS).toContain("this.deplacement?.uid !== uid && !enAttente.has(uid)");
  });
});
