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
 * **Ce que les barrières de crête ont changé.** Cette mesure-là valait sept
 * conquêtes sur vingt avant que la carte ne reçoive ses murs et ses cols ; elle
 * en vaut **dix sur vingt** après. C'est le même moteur, la même IA, les mêmes
 * graines : ce qui a changé est que la carte a des goulets. Un front rend la
 * conquête décidable — on prend un col, on tient une zone — là où une esplanade
 * la diluait. Et les parties tranchées le sont plus vite : quatre se règlent
 * désormais en moins de cent jours, dont une en vingt-quatre.
 *
 * **Et la moitié qui bute sur le garde-fou de tours n'est pas un défaut du jeu.**
 * C'est ce qu'on croyait, et il a suffi de lever le plafond pour le savoir : à
 * 700 tours au lieu de 320, **huit parties sur dix se règlent par conquête**,
 * durée médiane 132 jours, la plus longue tranchée à 237. Deux seulement restent
 * indécises à 351 jours. Le plafond de 320 tours n'est donc pas une mesure du
 * jeu, c'est une contrainte du harnais — il tient le duel sous son propre délai,
 * et on le garde pour cela. Mais il ne faut pas lire « dix conquêtes sur vingt »
 * comme « l'IA ne sait pas conclure » : elle sait, il lui faut du temps, et une
 * partie à deux bannières sur une carte XL en prend deux cents jours.
 *
 * Le vrai reste d'équilibrage est donc plus étroit qu'il n'y paraissait : deux
 * parties sur dix ne se tranchent pas même en trois cent cinquante jours. C'est
 * là qu'il faudra regarder, et nulle part ailleurs.
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
        `  Parties réglées par conquête : ${decidees}/${GAMES} — sept sur vingt avant que\n` +
        `  la carte ne reçoive ses murs et ses cols. Le reste bute sur le plafond de tours\n` +
        `  du harnais, PAS sur une IA qui ne saurait pas conclure : a 700 tours au lieu de\n` +
        `  320, huit parties sur dix se reglent par conquete, duree mediane 132 jours.\n`,
    );
    process.stdout.write(lines.join(''));

    // Toutes les parties doivent au moins être allées au bout proprement.
    for (const game of duel.games) {
      expect(game.stalled, `partie ${game.seed} enlisée`).toBe(false);
      /*
       * Le plancher était de trente jours, et il est tombé à dix.
       *
       * Il servait à repérer une partie qui s'arrête absurdement tôt — le signe
       * d'une mise en place cassée. Depuis les barrières de crête, une partie
       * s'est réglée en vingt-quatre jours par conquête franche, et ce n'est pas
       * une anomalie : à deux bannières la rotation peut placer les deux
       * capitales dans des zones voisines, et un héros sur voie couvre vingt à
       * trente cases par jour. Une ruée qui aboutit est une manière de gagner,
       * pas un défaut. En dessous de dix jours, en revanche, personne n'a eu le
       * temps de lever une armée : là il y aurait à chercher.
       */
      expect(game.turns, `partie ${game.seed} : ${String(game.turns)} jours`).toBeGreaterThan(10);
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
     * Et le plancher de conquête. Mesuré dix sur vingt, contre sept avant les
     * barrières de crête. Le plancher est posé à sept — la mesure d'avant — de
     * sorte qu'il attrape aussi bien le retour d'un défaut de capture comme
     * celui de `reglerGarde` que la perte du front qu'on vient de gagner.
     */
    expect(
      decidees,
      `aucune conquête n’aboutit : ${decidees}/${GAMES} parties décidées par le jeu`,
    ).toBeGreaterThanOrEqual(7);
  }, 900_000);
});
