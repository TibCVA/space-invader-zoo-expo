/**
 * TRANSITIONS D'ÉCRAN, chantier « ameliore tout » du 27/08 :
 *
 *  - chaque écran entre en fondu depuis le granit (le routage démonte et
 *    remonte les écrans d'un coup — le fondu au montage suffit à lisser
 *    toutes les navigations, carte ↔ cité ↔ combat comprises) ;
 *  - le voile de chargement d'une scène Pixi SE LÈVE au lieu de disparaître
 *    d'une frame ; son démontage passe par un délai fixe, jamais par
 *    `transitionend` (l'événement ne vient pas sous mouvement réduit ni
 *    onglet caché — le voile resterait à l'écran pour toujours).
 *
 * Gardes de source, code lu sans commentaires.
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

const CSS: string = String(readFileSync(new URL('./screens.css', import.meta.url), 'utf8'));

describe('chaque écran entre en fondu', () => {
  it('`.jeu-ecran` et `.jeu-panne` montent avec le voile d’entrée maison', () => {
    expect(CSS).toMatch(
      /\.jeu-ecran,\s*\.jeu-panne \{\s*animation: hmm-entree-voile var\(--hmm-duree-lente\) var\(--hmm-courbe\) both;/
    );
  });

  it('opacité seulement — jamais de transform/filter sur l’hôte du canevas', () => {
    const debut = CSS.indexOf("Transitions d'écran");
    const fin = CSS.indexOf('Mouvement réduit', debut);
    const section = CSS.slice(debut, fin);
    expect(section.length).toBeGreaterThan(0);
    expect(section).not.toMatch(/transform\s*:/);
    expect(section).not.toMatch(/[^-]filter\s*:/);
  });
});

describe('le voile de chargement se lève', () => {
  const SCENE = code('./scene.tsx');

  it('le voile enveloppe l’écran de chargement et se lève quand la scène est prête', () => {
    expect(SCENE).toContain("'jeu-scene__voile' + (prete ? ' jeu-scene__voile--leve' : '')");
    expect(SCENE).toContain('aria-hidden={prete || undefined}');
  });

  it('démontage par délai fixe, jamais par transitionend', () => {
    expect(SCENE).toMatch(/setTimeout\(\(\) => setVoile\(false\), DUREE_LEVEE_MS\)/);
    expect(SCENE).not.toContain('transitionend');
    /* Le délai couvre la transition CSS (220 ms) avec une marge. */
    expect(SCENE).toMatch(/DUREE_LEVEE_MS = 260/);
  });

  it('le voile se repose dès que la scène redevient impréparée (changement de clé)', () => {
    const i = SCENE.indexOf('if (!prete) {');
    expect(i).toBeGreaterThan(0);
    expect(SCENE.slice(i, i + 120)).toContain('setVoile(true)');
  });

  it('levé, le voile ne vole aucun clic et finit invisible', () => {
    expect(CSS).toMatch(/\.jeu-scene__voile--leve \{[^}]*pointer-events: none/);
    expect(CSS).toMatch(/\.jeu-scene__voile--leve \{[^}]*visibility: hidden/);
  });
});

describe('mouvement réduit : la double garde maison', () => {
  it('la media query ET le réglage joueur coupent fondu et levée', () => {
    expect(CSS).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.jeu-ecran,\s*\.jeu-panne,\s*\.jeu-scene__voile \{\s*animation: none;\s*transition: none;/
    );
    expect(CSS).toMatch(
      /:root\[data-animations='reduites'\] \.jeu-ecran,\s*:root\[data-animations='reduites'\] \.jeu-panne,\s*:root\[data-animations='reduites'\] \.jeu-scene__voile \{\s*animation: none;\s*transition: none;/
    );
  });
});
