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
    /* Et elle ne dépasse jamais ce qu'on possède. */
    expect(garrisonTarget(profile, cite(true), 10_000, menace, 6)).toBe(10_000);
  });
});
