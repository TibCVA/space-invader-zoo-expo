/**
 * LA CADENCE DE MARCHE DU HÉROS.
 *
 * Plainte du propriétaire, sur PC : « les déplacements du héros sont trop
 * rapides ». La file d'animation venait d'être rebranchée et un pas durait
 * 145 ms — un trajet de trois cases se jouait en moins d'une demi-seconde, à
 * peine le temps de voir partir la troupe.
 *
 * On l'a portée à 260 ms. Mais la première correction posait AUSSI un plafond
 * de durée totale, et ce plafond corrigeait dans le mauvais sens : un héros
 * dispose de 1300 à 2000 points de marche et la case de chemin en coûte 70,
 * donc une journée de route fait jusqu'à vingt-huit cases. À 2200 ms de
 * plafond, ce trajet-là serait reparti à 79 ms la case — deux fois plus vite
 * que ce dont le propriétaire venait de se plaindre. Le défaut serait revenu
 * précisément sur les longues marches, celles qu'on regarde le plus.
 *
 * D'où le plancher, et d'où ce fichier : la garde qui dit qu'AUCUNE longueur
 * de chemin, si grande soit-elle, ne rend la marche plus rapide qu'avant.
 */
import { describe, expect, it } from 'vitest';
import { cadenceDeMarche } from './heroes.js';

/** La cadence d'origine, celle que le propriétaire a jugée trop rapide. */
const TROP_RAPIDE = 145;
/** Une journée de route : 2000 points de marche, 70 la case de chemin. */
const PLUS_LONG_TRAJET = 28;

describe('cadence de marche', () => {
  it('un trajet court se joue à la pleine cadence', () => {
    for (const cases of [1, 2, 3, 5, 8]) {
      expect(cadenceDeMarche(cases)).toBe(260);
    }
  });

  it('trois cases prennent maintenant près d’une seconde', () => {
    /* 3 × 145 = 435 ms auparavant : le héros arrivait avant qu'on ait vu
       qu'il partait. */
    expect(3 * cadenceDeMarche(3)).toBeGreaterThan(700);
  });

  it('AUCUN trajet ne repasse sous la cadence dont il s’est plaint', () => {
    for (let cases = 1; cases <= 60; cases += 1) {
      expect(
        cadenceDeMarche(cases),
        `${cases} cases : ${cadenceDeMarche(cases)} ms la case`,
      ).toBeGreaterThan(TROP_RAPIDE);
    }
  });

  it('la plus longue marche possible reste courte à regarder', () => {
    const total = PLUS_LONG_TRAJET * cadenceDeMarche(PLUS_LONG_TRAJET);
    /* Lisible, mais jamais une attente : moins de cinq secondes pour une
       journée entière de route. */
    expect(total).toBeLessThan(5000);
    expect(total).toBeGreaterThan(3000);
  });

  it('la cadence ne remonte jamais quand le chemin s’allonge', () => {
    let precedente = cadenceDeMarche(1);
    for (let cases = 2; cases <= 60; cases += 1) {
      const c = cadenceDeMarche(cases);
      expect(c).toBeLessThanOrEqual(precedente);
      precedente = c;
    }
  });

  it('un chemin vide ou absurde ne fige pas la marche', () => {
    for (const cases of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      const c = cadenceDeMarche(cases);
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeGreaterThan(0);
    }
  });
});
