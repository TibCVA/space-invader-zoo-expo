/**
 * Duel de profils : l'expert doit dominer le prudent.
 *
 * La cible est celle des plans — `docs/08-PLAN-AAA.md` et la passation :
 * **l'expert entre 60 et 85 %** contre le prudent. Le test joue vingt parties
 * de bout en bout, en faisant tourner les positions de départ d'une partie à
 * l'autre : sans rotation, on mesurerait la force d'un départ, pas celle d'un
 * profil.
 *
 * **Ce que ce fichier a longtemps affirmé, et qui était faux.** Il expliquait
 * que la cible était hors d'atteinte parce que le moteur ne libérait jamais la
 * garde d'un lieu de carte après la victoire, et il imprimait ce diagnostic à
 * chaque exécution. Le défaut est corrigé depuis — `reglerGarde` dans
 * `packages/engine/src/core/apply.ts`, verrouillé par
 * `packages/engine/src/core/guarded-place.test.ts` — mais le message est resté,
 * et il envoyait le lecteur suivant à la poursuite d'un bogue résolu. Il
 * ajoutait une seconde erreur : le score de fin de chronique ne « compte pas
 * l'armée conservée en ignorant les bâtiments », il compte les cités, les
 * sceaux, les gisements, les héros, le trésor et la réputation
 * (`scoreBreakdown`, `world/victory.ts`).
 *
 * **Ce que dit la mesure.** Sur ces vingt graines l'expert gagne treize fois,
 * soit 65 %. Étendu à soixante graines — mêmes profils, même rotation, mêmes
 * réglages — il gagne **43 fois, soit 71,7 %**. Le 65 % était donc un artefact
 * d'échantillon, et non un écart à corriger : sur vingt parties, l'écart-type
 * binomial vaut deux parties entières. On assert la fourchette des plans, on
 * imprime le taux, et l'on garde le chiffre de soixante dans ce commentaire
 * pour que personne ne re-diagnostique un problème qui n'existe pas.
 *
 * **Ce qui reste ouvert, en revanche, et que le test mesure désormais.** Sur
 * les soixante parties, **vingt seulement se règlent par conquête** ; les
 * quarante autres butent sur le garde-fou de tours du harnais et sont
 * départagées au classement d'observation. À deux bannières, l'IA ne sait donc
 * pas conclure une conquête en cent soixante jours dans deux cas sur trois.
 * C'est un vrai sujet d'équilibrage — pas un défaut de mesure — et le test
 * l'affiche partie par partie plutôt que de le laisser sous le tapis.
 */
import { describe, expect, it } from 'vitest';

import { simulateGame, type GameOutcome } from './simulate.js';

/** Nombre de parties du duel, imposé par le brief. */
const GAMES = 20;
/** Fourchette des plans : sous 60 % l'expert joue mal, au-dessus de 85 % le
 *  prudent n'est plus un adversaire et la mesure ne dit plus rien. */
const BANDE_MIN = 60;
const BANDE_MAX = 85;

interface DuelResult {
  expert: number;
  prudent: number;
  draws: number;
  games: GameOutcome[];
}

function runDuel(): DuelResult {
  const result: DuelResult = { expert: 0, prudent: 0, draws: 0, games: [] };
  for (let i = 0; i < GAMES; i++) {
    const game = simulateGame({
      seed: 1000 + i * 7919,
      players: 2,
      profiles: ['expert', 'prudent'],
      // La rotation échange les sièges, les départs et les factions.
      rotation: i,
      duration: 'eclair',
      victory: 'derniere_banniere',
      /*
       * Depuis le mode unique, une partie ne s'achève que par la prise du
       * dernier château : plus de couperet de chronique à la semaine 8. Sans
       * borne propre au harnais, les vingt parties couraient chacune jusqu'au
       * garde-fou de 900 tours — 451 jours de jeu — et le duel passait de
       * trois à vingt-sept minutes, au-delà de son propre délai. 320 tours de
       * bot font 160 jours à deux bannières : de quoi conclure une conquête,
       * et le classement d'observation du harnais départage le reste.
       */
      maxTurns: 320,
      fast: true,
    });
    result.games.push(game);
    if (game.winnerProfile === 'expert') result.expert++;
    else if (game.winnerProfile === 'prudent') result.prudent++;
    else result.draws++;
  }
  return result;
}

describe('duel expert contre prudent', () => {
  it('joue vingt parties complètes et mesure la domination de l’expert', () => {
    const duel = runDuel();
    const percent = Math.round((duel.expert * 100) / GAMES);
    /* Une partie « décidée » l'est par le jeu ; le reste est départagé par le
       garde-fou de tours du harnais, qui le dit dans sa raison. */
    const decidees = duel.games.filter((g) => !g.reason.startsWith('Garde-fou du harnais')).length;

    const lines: string[] = [];
    lines.push(`\n  duel expert / prudent sur ${GAMES} parties complètes\n`);
    for (const game of duel.games) {
      const expert = game.banners.find((b) => b.profile === 'expert');
      const prudent = game.banners.find((b) => b.profile === 'prudent');
      const conquete = !game.reason.startsWith('Garde-fou du harnais');
      lines.push(
        `    graine ${String(game.seed).padStart(6)} · ${String(game.turns).padStart(3)} j · ` +
          `${conquete ? 'CONQUÊTE  ' : 'classement'} · ` +
          `vainqueur ${(game.winnerProfile ?? 'aucun').padEnd(8)} · ` +
          `expert force ${String(expert?.power ?? 0).padStart(7)} ` +
          `(${expert?.battles ?? 0} combats) · ` +
          `prudent force ${String(prudent?.power ?? 0).padStart(7)} ` +
          `(${prudent?.battles ?? 0} combats)\n`,
      );
    }
    lines.push(
      `  RÉSULTAT : expert ${duel.expert}/${GAMES} (${percent} %) · ` +
        `prudent ${duel.prudent}/${GAMES} · sans vainqueur ${duel.draws}\n` +
        `  Fourchette des plans : ${BANDE_MIN} à ${BANDE_MAX} %. ` +
        `Sur soixante graines : 43/60, soit 71,7 %.\n` +
        `  Parties réglées par conquête : ${decidees}/${GAMES} — le reste est départagé\n` +
        `  au classement d'observation du harnais. C'est le chantier d'équilibrage ouvert :\n` +
        `  à deux bannières, l'IA ne sait pas conclure en cent soixante jours.\n`,
    );
    process.stdout.write(lines.join(''));

    // Toutes les parties doivent au moins être allées au bout proprement.
    for (const game of duel.games) {
      expect(game.stalled, `partie ${game.seed} enlisée`).toBe(false);
      expect(game.turns).toBeGreaterThan(30);
    }

    /*
     * La fourchette des plans, sur cet échantillon-ci.
     *
     * Le test est déterministe — graines figées — donc la valeur ne fluctue pas
     * d'une exécution à l'autre ; ce qui fluctue, c'est ce qu'un échantillon de
     * vingt dit du taux réel. D'où la fourchette plutôt qu'un seuil sec :
     * treize sur vingt (65 %) et quarante-trois sur soixante (71,7 %) décrivent
     * le même équilibre, et un test qui exigerait quatorze sur vingt refuserait
     * un jeu correctement réglé.
     */
    expect(
      percent,
      `l’expert gagne ${duel.expert}/${GAMES} (${percent} %) : sous la fourchette des plans`,
    ).toBeGreaterThanOrEqual(BANDE_MIN);
    expect(
      percent,
      `l’expert gagne ${duel.expert}/${GAMES} (${percent} %) : le prudent n’est plus un adversaire`,
    ).toBeLessThanOrEqual(BANDE_MAX);

    /*
     * Et le plancher de conquête. Mesuré : sept sur vingt ici, vingt sur
     * soixante au total. Le plancher est bas parce que la mesure est basse ; il
     * n'est pas là pour dire que c'est bien, mais pour que l'on s'aperçoive si
     * la conquête cessait tout à fait d'aboutir — ce qui serait la signature du
     * retour d'un défaut de capture comme celui de `reglerGarde`.
     */
    expect(
      decidees,
      `aucune conquête n’aboutit : ${decidees}/${GAMES} parties décidées par le jeu`,
    ).toBeGreaterThanOrEqual(4);
  }, 900_000);
});
