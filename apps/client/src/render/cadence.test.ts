/**
 * LA CADENCE DE MARCHE DU HÉROS.
 *
 * Plainte du propriétaire, sur PC : « les déplacements du héros sont trop
 * rapides ». La file d'animation venait d'être rebranchée et un pas durait
 * 145 ms — un trajet de trois cases se jouait en moins d'une demi-seconde, à
 * peine le temps de voir partir la troupe.
 *
 * On l'a portée à 260 ms, puis on a corrigé le CORRECTIF : la première
 * version posait un plafond de durée totale (3400 ms) qui rendait identiques
 * tous les trajets de quatorze à vingt cases, puis écrasait la cadence des
 * plus longs — le défaut même que la marche de combat (`battle/anim.ts`) a
 * éliminé au profit d'un GENOU : pleine cadence jusqu'à onze cases, pas
 * resserré au-delà, durée totale STRICTEMENT croissante avec le chemin.
 * Mêmes valeurs ici, pour que carte et champ de bataille respirent pareil.
 */
import { describe, expect, it } from 'vitest';
import { cadenceDeMarche } from './heroes.js';

/** La cadence d'origine, celle que le propriétaire a jugée trop rapide. */
const TROP_RAPIDE = 145;
/** Une journée de route : 2000 points de marche, 70 la case de chemin. */
const PLUS_LONG_TRAJET = 28;

describe('cadence de marche', () => {
  it('un trajet court se joue à la pleine cadence', () => {
    for (const cases of [1, 2, 3, 5, 8, 11]) {
      expect(cadenceDeMarche(cases)).toBe(260);
    }
  });

  it('trois cases prennent maintenant près d’une seconde', () => {
    /* 3 × 145 = 435 ms auparavant : le héros arrivait avant qu'on ait vu
       qu'il partait. */
    expect(3 * cadenceDeMarche(3)).toBeGreaterThan(700);
  });

  it('AUCUN trajet ne repasse sous la cadence dont il s’est plaint', () => {
    /* Le genou tend vers 140 ms la case à l'infini, mais il faudrait un
       chemin de 265 cases pour passer sous 145 — la plus longue journée en
       fait vingt-huit. Sur tout chemin réellement possible (et jusqu'au
       double), la moyenne reste au-dessus. */
    for (let cases = 1; cases <= 60; cases += 1) {
      expect(
        cadenceDeMarche(cases),
        `${cases} cases : ${cadenceDeMarche(cases)} ms la case`,
      ).toBeGreaterThan(TROP_RAPIDE);
    }
  });

  it('la marche s’allonge TOUJOURS avec le chemin — jamais de plafond total', () => {
    /* La garde du genou, celle qui a attrapé le plafond du combat : deux
       trajets différents ne durent jamais pareil. */
    let precedent = 0;
    for (let cases = 1; cases <= 60; cases += 1) {
      const total = cases * cadenceDeMarche(cases);
      expect(total, `${cases} cases : ${total} ms au total`).toBeGreaterThan(precedent);
      precedent = total;
    }
  });

  it('la plus longue marche possible reste courte à regarder', () => {
    const total = PLUS_LONG_TRAJET * cadenceDeMarche(PLUS_LONG_TRAJET);
    /* Lisible, mais jamais une attente : 11 × 260 + 17 × 140 = 5240 ms pour
       une journée entière de route. */
    expect(total).toBeGreaterThan(4500);
    expect(total).toBeLessThan(6000);
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
