/**
 * Les trois rampes du sol de bataille, mesurées et non jugées à l'œil.
 *
 * Elles ont été écrites contre un dégradé mort. `degradeLineaire` rendait alors
 * un aplat — la première teinte, partout — si bien que seul l'arrêt d'offset 0
 * comptait et que les quatre autres pouvaient être aussi sombres qu'on voulait.
 * Depuis que le dégradé peint réellement, ces arrêts comptent tous, et le sol a
 * perdu ce que l'audit a mesuré : **19,0 de luminance et 4,0 points de
 * saturation**.
 *
 * Ce fichier remplace « on regarde et on trouve ça sombre » par un nombre. Il
 * moyenne la rampe sur toute sa longueur, exactement comme un pixel moyen de la
 * surface peinte, et pose un plancher. Sans lui, le prochain arrêt un peu trop
 * bleuté referait tomber le sol sans que rien ne rougisse — c'est précisément
 * ce qui s'est produit.
 */
import { describe, expect, it } from 'vitest';
import { LIGHT, luminance, melanger, toRgb } from '../art/palette.js';
import { PALETTES_SOL, rampeBiome } from './field.js';

/** Un arrêt de rampe : offset dans [0;1] et couleur. */
interface Arret {
  offset: number;
  color: number;
}

/**
 * Couleur au point `t` d'une rampe, par interpolation linéaire entre arrêts —
 * ce que fait le dégradé lui-même.
 */
function couleurA(arrets: readonly Arret[], t: number): number {
  let a = arrets[0];
  let b = arrets[arrets.length - 1];
  for (let i = 0; i < arrets.length - 1; i += 1) {
    if (t >= arrets[i].offset && t <= arrets[i + 1].offset) {
      a = arrets[i];
      b = arrets[i + 1];
      break;
    }
  }
  const span = b.offset - a.offset;
  const k = span <= 0 ? 0 : (t - a.offset) / span;
  return melanger(a.color, b.color, k);
}

/**
 * Luminance moyenne de la rampe, sur 0–255.
 *
 * `luminance` rend 0–1 ; l'audit et le plan parlent en 0–255, et c'est la seule
 * échelle où « le sol a perdu 19 points » veut dire quelque chose. On convertit
 * ici, une fois, plutôt que de traduire les seuils.
 */
function luminanceMoyenne(arrets: readonly Arret[]): number {
  let somme = 0;
  const N = 64;
  for (let i = 0; i < N; i += 1) somme += luminance(couleurA(arrets, i / (N - 1))) * 255;
  return somme / N;
}

/** Saturation moyenne, en pourcentage, au sens « max − min sur max » du HSV. */
function saturationMoyenne(arrets: readonly Arret[]): number {
  let somme = 0;
  const N = 64;
  for (let i = 0; i < N; i += 1) {
    const { r, g, b } = toRgb(couleurA(arrets, i / (N - 1)));
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    somme += max === 0 ? 0 : ((max - min) / max) * 100;
  }
  return somme / N;
}

/*
 * La prairie : l'ambiance la plus fréquente, donc celle qui décide du ressenti.
 * La rampe est LUE dans `field.ts`, jamais recopiée — un témoin jumeau cesse de
 * dire la vérité au premier écart, et c'est ce genre de témoin qui a laissé ce
 * sol s'assombrir de dix-neuf points sans que rien ne rougisse.
 */
const BIOME: readonly Arret[] = rampeBiome(PALETTES_SOL.prairie);

describe('les rampes du sol de bataille', () => {
  /*
   * Le plancher vient de la cible d'acceptation du plan : le sol avait perdu
   * 19 points de luminance, il faut les rendre. L'aplat d'avant mesurait 142,7 ;
   * on ne cherche pas à y revenir — un vrai dégradé DOIT être plus sombre en
   * moyenne qu'un aplat pris sur sa teinte la plus claire — mais à repasser
   * au-dessus du seuil où le champ redevient un pré éclairé.
   */
  it('garde le sol assez clair pour lire un pré, non une cave', () => {
    expect(luminanceMoyenne(BIOME)).toBeGreaterThanOrEqual(95);
  });

  it('garde la couleur : un sol désaturé lit comme du gris peint', () => {
    expect(saturationMoyenne(BIOME)).toBeGreaterThanOrEqual(19);
  });

  it('reste un dégradé : le clair et l’ombre ne se confondent pas', () => {
    // Sans cet écart, on aurait pu satisfaire les deux seuils en aplatissant
    // la rampe — ce qui rendrait le sol plat, le défaut d'avant.
    const clair = luminance(couleurA(BIOME, 0)) * 255;
    const ombre = luminance(couleurA(BIOME, 1)) * 255;
    expect(clair - ombre).toBeGreaterThan(40);
  });

  it('éclaire par le haut : le sommet de la rampe est le plus clair', () => {
    // La loi n°2 encore : offset 0 est du côté du soleil.
    expect(luminance(couleurA(BIOME, 0))).toBeGreaterThan(luminance(couleurA(BIOME, 0.5)));
    expect(LIGHT.toSun.y).toBeLessThan(0);
  });
});
