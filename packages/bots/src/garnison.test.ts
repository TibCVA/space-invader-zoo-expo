/**
 * La part de garnison se divise entre les cités.
 *
 * **Ce que ce test empêche de revenir.** `garrisonTarget` calculait la part de
 * garnison PAR CITÉ sur la puissance totale de la maison : la capitale gardait
 * `garrisonShareBp`, chaque autre ville la moitié. Le nom disait « part de
 * l'armée en garnison », le calcul disait autre chose — la fraction verrouillée
 * croissait avec l'empire. Un expert à six cités (part 15 %) en immobilisait
 * 15 + 5 × 7,5 = 52 %, et à dix cités 82 %. Autrement dit : plus il conquérait,
 * moins il pouvait conquérir.
 *
 * Ce n'est pas une subtilité de réglage, c'est ce qui empêchait deux parties sur
 * dix de se conclure. Mesuré sur la graine 1000 : l'expert tenait six cités et
 * 803 000 de puissance contre une cité et 312 000, le chemin vers la dernière
 * capitale existait — trente-quatre pas — et il ne l'a jamais forcée en trois
 * cent cinquante-et-un jours. Après correction, cent trente-deux jours.
 *
 * Les deux propriétés qui comptent, et le test les vérifie séparément :
 *
 *  - à UNE cité, rien ne change. Le profil prudent est une tortue, c'est son
 *    caractère, et la correction ne doit pas le lui retirer.
 *  - à N cités, la SOMME des planchers vaut la part du profil, pas N fois.
 */
import { describe, expect, it } from 'vitest';

import type { TownState } from '@auvergne/engine';

import { garrisonTarget } from './army.js';
import { BOT_PROFILES } from './profiles.js';

/** Une cité réduite à ce que `garrisonTarget` en lit. */
function cite(isCapital: boolean): TownState {
  return { isCapital } as unknown as TownState;
}

const TOTAL = 100_000;

describe('part de garnison', () => {
  it('ne change rien au joueur qui n’a qu’une capitale', () => {
    for (const profile of Object.values(BOT_PROFILES)) {
      const attendu = Math.trunc((TOTAL * profile.military.garrisonShareBp) / 10_000);
      expect(
        garrisonTarget(profile, cite(true), TOTAL, 0, 1),
        `${profile.id} à une cité`,
      ).toBe(attendu);
    }
  });

  it('répartit la part entre les cités au lieu de la multiplier', () => {
    for (const profile of Object.values(BOT_PROFILES)) {
      const part = profile.military.garrisonShareBp;
      for (const villes of [1, 3, 6, 10]) {
        let somme = garrisonTarget(profile, cite(true), TOTAL, 0, villes);
        for (let i = 1; i < villes; i += 1) {
          somme += garrisonTarget(profile, cite(false), TOTAL, 0, villes);
        }
        const partEffective = (somme * 10_000) / TOTAL;
        /*
         * La capitale compte double, donc la somme des poids vaut `villes + 1`
         * et se divise par `villes + 1` : la part effective égale la part du
         * profil, à l'arrondi entier près sur chaque cité.
         */
        expect(
          partEffective,
          `${profile.id} à ${String(villes)} cités : ${partEffective.toFixed(0)} bp pour ${String(part)}`,
        ).toBeGreaterThan(part - 20 * villes);
        expect(partEffective).toBeLessThanOrEqual(part);
      }
    }
  });

  it('n’immobilise jamais plus de la moitié de l’armée d’un empire', () => {
    /* Le plafond que l'ancienne formule crevait : un expert à six cités en
       gardait 52 %, un prudent à six cités 147 % — c'est-à-dire tout, plus la
       menace. Une maison qui ne peut pas sortir son armée ne peut pas gagner. */
    for (const profile of Object.values(BOT_PROFILES)) {
      for (const villes of [2, 6, 10]) {
        let somme = garrisonTarget(profile, cite(true), TOTAL, 0, villes);
        for (let i = 1; i < villes; i += 1) {
          somme += garrisonTarget(profile, cite(false), TOTAL, 0, villes);
        }
        expect(somme, `${profile.id} à ${String(villes)} cités`).toBeLessThan(TOTAL / 2);
      }
    }
  });

  it('laisse une menace visible relever le plancher, quel que soit le profil', () => {
    const profile = BOT_PROFILES.agressif;
    const menace = 40_000;
    /* Le profil le plus dégarni (700 bp) doit tout de même tenir la place quand
       l'ennemi est sous ses murs : c'est la clause de menace, et la répartition
       de la part ne doit pas l'avoir emportée. */
    expect(garrisonTarget(profile, cite(true), TOTAL, menace, 6)).toBe(menace);
  });

  /*
   * La clause de menace ne prend jamais toute l'armée, et cette ligne-ci
   * demandait le contraire : elle exigeait `toBe(10_000)` sur un total de dix
   * mille, c'est-à-dire la totalité. Elle enshrinait le défaut qui tuait les
   * parties.
   *
   * Ce que cela donnait en jeu, mesuré sur quatre parties à deux bannières de la
   * graine 20250816 : deux parties sur quatre au plafond du harnais, quatre cent
   * cinquante-et-un jours, héros de niveau 2 et 3, une cité chacun, deux mille
   * cent de puissance contre six mille trois cents — et le plus FAIBLE déclaré
   * vainqueur au classement. Dès qu'un ennemi aussi fort que soi passe dans le
   * rayon de vigilance du profil — vingt-sept cases pour le prudent, un quart de
   * la carte —, la maison verrouillait tout dans ses murs, son héros repartait
   * les mains vides et ne montait plus d'un niveau. L'adversaire faisait de même.
   * Personne ne bougeait plus.
   *
   * Le test dit maintenant l'inverse, et il le dit pour les quatre profils : une
   * maison assiégée garde au plus les trois cinquièmes.
   */
  it('garde toujours de quoi faire campagne, même assiégée', () => {
    for (const profile of Object.values(BOT_PROFILES)) {
      for (const villes of [1, 2, 6]) {
        for (const total of [10_000, 250_000]) {
          /* Menace écrasante : dix fois ce qu'on possède. */
          const plancher = garrisonTarget(profile, cite(true), total, total * 10, villes);
          expect(
            plancher,
            `${profile.id} à ${String(villes)} cités, total ${String(total)}`,
          ).toBeLessThanOrEqual(Math.trunc(total * 0.6));
          /* Et il reste réellement quelque chose à sortir. */
          expect(total - plancher).toBeGreaterThanOrEqual(Math.trunc(total * 0.4) - 1);
        }
      }
    }
  });

  it('ne dépasse jamais ce que la maison possède', () => {
    for (const profile of Object.values(BOT_PROFILES)) {
      expect(garrisonTarget(profile, cite(true), 10_000, 10_000_000, 1)).toBeLessThanOrEqual(
        10_000,
      );
    }
  });
});
