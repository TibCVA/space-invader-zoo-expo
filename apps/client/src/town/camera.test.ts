/**
 * LA DÉRIVE DE CAMÉRA NE DOIT PLUS FAIRE BOUGER LES BÂTIMENTS AU ZOOM.
 *
 * Plainte du propriétaire, sur iPhone : « quand je zoome ou dézoome les
 * bâtiments bougent un peu ». Le mécanisme est décrit dans `camera.ts` : la
 * cible de la dérive était lue dans un repère qui se dilate avec le
 * grossissement, si bien qu'à doigt immobile chaque cran de pincement donnait
 * une dérive différente — multipliée ensuite par le plan de chaque bâtiment,
 * de 0,34 au fond à 1 au premier plan, donc pas la même pour tous.
 *
 * Ce fichier tient les deux moitiés du correctif : le fondu lui-même, et le
 * fait qu'il soit RÉELLEMENT branché. La seconde compte autant que la
 * première — un fondu parfaitement juste que la vue n'appellerait pas ne
 * corrigerait rien, et c'est exactement la faute qu'un test de fonction pure
 * ne voit pas.
 */
import { describe, expect, it } from 'vitest';
/* La vue se lit sur le disque : `node:fs` n'est pas dans les types du client
   — le `tsconfig` s'y limite à `vite/client` —, d'où l'exception, comme dans
   `battle/pouce.test.ts`. */
// @ts-expect-error — types Node absents du tsconfig du client, cf. ci-dessus
import { readFileSync } from 'node:fs';
import { ZOOM_SANS_DERIVE, amplitudeDerive } from './camera.js';

/** La source de la vue, pour les gardes de branchement. */
const VUE: string = String(readFileSync(new URL('./index.ts', import.meta.url), 'utf8'));

/** Le plan le plus lointain et le plus proche : `0,34 + z × 0,132`, z ∈ [0;5]. */
const PLAN_FOND = 0.34;
const PLAN_PREMIER = 1;
/** Dérive maximale du tableau, en pixels (bible artistique §5). */
const DERIVE_MAX = 14;

describe('dérive de caméra du tableau de cité', () => {
  it('pleine au repos', () => {
    expect(amplitudeDerive(1)).toBe(1);
    expect(amplitudeDerive(1.02)).toBe(1);
  });

  it('éteinte dès qu’on est entré dans le tableau', () => {
    expect(amplitudeDerive(ZOOM_SANS_DERIVE)).toBe(0);
    expect(amplitudeDerive(2)).toBe(0);
    expect(amplitudeDerive(3)).toBe(0);
  });

  it('en fondu, jamais par à-coups', () => {
    let precedente = amplitudeDerive(1);
    for (let zoom = 1; zoom <= 3; zoom += 0.01) {
      const a = amplitudeDerive(zoom);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
      /* Décroissante, et jamais d'un saut visible : le pas de 0,01 de
         grossissement ne doit pas rendre plus de 4 % de la dérive. */
      expect(a).toBeLessThanOrEqual(precedente + 1e-9);
      expect(precedente - a).toBeLessThan(0.04);
      precedente = a;
    }
  });

  it('un doigt immobile, deux bâtiments ne se décalent plus l’un de l’autre', () => {
    /* Le pire cas : la dérive part d'un bout à l'autre (cible −1 → +1) parce
       que le repère s'est dilaté sous le doigt. L'écart entre le fond et le
       premier plan est ce que l'œil lit comme « les bâtiments bougent ». */
    const ecart = (zoom: number): number =>
      Math.abs(2 * DERIVE_MAX * amplitudeDerive(zoom) * (PLAN_PREMIER - PLAN_FOND));

    /* Sans le fondu, l'amplitude vaudrait 1 partout : 18 px de glissement
       entre deux bâtiments, à doigt immobile. */
    expect(2 * DERIVE_MAX * (PLAN_PREMIER - PLAN_FOND)).toBeGreaterThan(18);

    /* Avec : plus rien du tout passé le seuil, et déjà moins de trois pixels
       au dernier cran du fondu — et encore, ce pire cas suppose que la cible
       traverse tout le tableau, ce que le gel pendant le pincement empêche. */
    expect(ecart(ZOOM_SANS_DERIVE)).toBe(0);
    expect(ecart(2)).toBe(0);
    expect(ecart(1.3)).toBeLessThan(3);
    expect(ecart(1.3)).toBeLessThan(ecart(1.1) / 2);
  });

  it('la vue ne calcule la dérive QUE par le fondu', () => {
    /* Garde de branchement. `derive()` est le seul endroit du tableau où la
       dérive maximale est multipliée ; tout autre site la recalculerait sans
       amplitude, et le défaut reviendrait par cette porte-là — c'est
       précisément ce qui s'était passé, la boîte de clic ayant sa propre
       copie du calcul, à côté de celle du dessin. */
    const sites = VUE.match(/DERIVE_MAX/g) ?? [];
    /* Une déclaration, et les deux axes de `derive()`. */
    expect(sites.length, `DERIVE_MAX employé ${sites.length} fois`).toBe(3);
    expect(VUE).toContain('private derive(): { dx: number; dy: number }');
    expect(VUE).toContain('const amplitude = amplitudeDerive(this.zoom);');
    /* Le dessin et la boîte de clic lisent la même. */
    expect((VUE.match(/this\.derive\(\)/g) ?? []).length).toBe(2);
  });

  it('le pincement en cours gèle la cible', () => {
    /* Deux doigts produisent des `pointermove` en rafale dans un repère qui
       se dilate : la cible ne doit pas les écouter. */
    expect(VUE).toContain('!this.deps.reducedMotion && !this.pinceEnCours');
    expect(VUE).toContain('this.pinceEnCours = true;');
    expect(VUE).toContain('this.pinceEnCours = false;');
  });
});
