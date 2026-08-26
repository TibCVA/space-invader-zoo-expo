/**
 * LA DÉFINITION SUR PC — « pas assez fine ».
 *
 * Trois étages rendaient l'image molle, mesurés le 26/08 :
 *  1. le FILTRE de post-traitement, au défaut de Pixi (resolution 1) : toute
 *     la carte était rendue dans un tampon à densité 1 puis étirée sur le
 *     canevas ×2 des écrans denses — le renderer avait beau être en haute
 *     définition (`boot.ts`), l'image finale ne l'était pas ;
 *  2. le TERRAIN, peint à 16 px/case au plus pour un affichage jusqu'à
 *     56 px/case × densité : le sol, qui est tout l'écran, était étiré
 *     jusqu'à ×3,5 même en densité 1 ;
 *  3. le DÉCOR DU COMBAT, composé dans une RenderTexture à resolution 1.
 */
import { describe, expect, it } from 'vitest';
/* `node:fs` n'est pas dans les types du client — cf. battle/pouce.test.ts. */
// @ts-expect-error — types Node absents du tsconfig du client, cf. ci-dessus
import { readFileSync } from 'node:fs';
import { resolutionDeBloc } from './terrain.js';

function code(chemin: string): string {
  return String(readFileSync(new URL(chemin, import.meta.url), 'utf8'))
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

describe('le filtre et les textures de rendu suivent la densité', () => {
  it('le filtre de la carte hérite de la résolution de sa cible', () => {
    expect(code('./postfx.ts')).toContain("resolution: 'inherit'");
  });

  it('le décor du combat se compose à la densité du renderer', () => {
    expect(code('../battle/field.ts')).toContain('resolution: renderer.resolution');
    expect(code('../battle/field.ts')).not.toMatch(/resolution: 1[,\s]/);
  });
});

describe('le niveau de détail du terrain vise la densité d’affichage', () => {
  it('au zoom par défaut (22), un écran ×2 obtient 32 px/case en haute qualité', () => {
    /* Avant : 12 px/case pour 44 pixels physiques affichés — flou ×3,7. */
    expect(resolutionDeBloc(22, 32, 2)).toBe(32);
  });

  it('en densité 1, l’échelle suit le zoom au palier supérieur', () => {
    expect(resolutionDeBloc(7, 32, 1)).toBe(8);
    expect(resolutionDeBloc(22, 32, 1)).toBe(24);
    expect(resolutionDeBloc(56, 32, 1)).toBe(32);
  });

  it('le plafond de qualité reste souverain — un téléphone modeste ne paie pas', () => {
    expect(resolutionDeBloc(56, 8, 3)).toBe(8);
    expect(resolutionDeBloc(22, 16, 2)).toBe(16);
  });

  it('l’échelle ne descend jamais quand le zoom ou la densité montent', () => {
    let precedent = 0;
    for (const zoom of [7, 9, 14, 22, 30, 44, 56]) {
      const r = resolutionDeBloc(zoom, 32, 1);
      expect(r).toBeGreaterThanOrEqual(precedent);
      precedent = r;
      expect(resolutionDeBloc(zoom, 32, 2)).toBeGreaterThanOrEqual(r);
    }
  });
});
