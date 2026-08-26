/**
 * L'ANCRAGE AU SOL DE LA CITÉ — trois défauts mesurés, trois gardes.
 *
 * Plainte du propriétaire : « les bâtiments semblent flotter / bouger un peu
 * et être au-dessus du sol : leurs noms se chevauchent parfois ». Mesuré :
 *  1. ancre unique (0,5 ; 0,97) pour quarante images dont le pied peint va de
 *     0,930 à 0,967 — jusqu'à ~10 px de vide sous le caravansérail, ×3 au
 *     zoom ;
 *  2. parallaxe des bâtiments (0,34 → 1,0) très au-dessus du sol peint
 *     (0,16) : les pieds glissaient jusqu'à ~12 px sur les terrasses à chaque
 *     mouvement de souris — et en continu au bruit du gyroscope sur mobile ;
 *  3. `Graphics.clear()` n'efface pas les enfants (Pixi v8) : le `Text` du
 *     nom survivait à chaque survol, et les anciens noms restaient affichés —
 *     les « noms qui se chevauchent ».
 */
import { describe, expect, it } from 'vitest';
/* `node:fs` n'est pas dans les types du client — cf. battle/pouce.test.ts. */
// @ts-expect-error — types Node absents du tsconfig du client, cf. ci-dessus
import { readFileSync } from 'node:fs';

const MANIFESTE = JSON.parse(
  String(readFileSync(new URL('../../public/img/manifeste.json', import.meta.url), 'utf8')),
) as { entrees: { clef: string; ancreY?: number }[] };

const VUE: string = String(readFileSync(new URL('./index.ts', import.meta.url), 'utf8'))
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');

describe('le pied peint touche le sol', () => {
  const batis = MANIFESTE.entrees.filter((e) => e.clef.startsWith('bati_'));

  it('chaque image de bâtiment porte son ancre MESURÉE au manifeste', () => {
    expect(batis.length).toBe(40);
    for (const e of batis) {
      expect(e.ancreY, e.clef).toBeGreaterThan(0.9);
      expect(e.ancreY, e.clef).toBeLessThanOrEqual(1);
    }
  });

  it('les ancres sont PAR IMAGE, pas une valeur unique rhabillée', () => {
    const valeurs = new Set(batis.map((e) => e.ancreY));
    expect(valeurs.size).toBeGreaterThan(3);
    /* Le pire cas mesuré : le caravansérail, pied peint à 0,93. C'est lui qui
       flottait le plus haut. */
    const caravanserail = batis.find((e) => e.clef === 'bati_caravanserail');
    expect(caravanserail?.ancreY).toBeLessThan(0.94);
  });

  it('la scène pose le sprite sur l’ancre du manifeste, repli 0,965', () => {
    expect(VUE).toContain('ancreYDe(clefAsset!) ?? 0.965');
    expect(VUE).not.toContain('anchor.set(0.5, 0.97)');
  });
});

describe('les pieds ne glissent plus sur le sol peint', () => {
  it('bâtiments et emplacements dérivent PRESQUE avec le panorama (0,16)', () => {
    /* L'ancien barème 0,34 + z×0,132 (jusqu'à 1,0) contre un sol à 0,16
       faisait glisser les pieds de ~12 px. Le nouveau borne l'écart à
       (0,26 − 0,16) × 14 = 1,4 px. */
    const barenes = VUE.match(/0\.16 \+ Math\.max\(0, Math\.min\(5, def\.scene\.z\)\) \* 0\.02/g) ?? [];
    expect(barenes.length).toBe(2);
    expect(VUE).not.toMatch(/0\.34 \+ Math\.max/);
  });

  it('le gyroscope a une zone morte — le tableau ne tremble plus au bruit', () => {
    expect(VUE).toContain('derniereInclinaison');
    expect(VUE).toMatch(/Math\.abs\(gamma - d\.gamma\) < 0\.5/);
  });
});

describe('une seule étiquette de nom à la fois', () => {
  it('l’étiquette précédente est DÉTRUITE — clear() ne suffit pas en Pixi v8', () => {
    expect(VUE).toContain('this.etiquette?.destroy()');
    expect(VUE).toContain('this.etiquette = t');
  });

  it('le cartouche se dimensionne sur le texte MESURÉ, pas sur la longueur de chaîne', () => {
    expect(VUE).toMatch(/Math\.max\(120, t\.width \+ h \* 0\.9\)/);
    expect(VUE).not.toMatch(/def\.name\.length \* Math\.max/);
  });
});
