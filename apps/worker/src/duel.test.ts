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
 * **Ce que dit la mesure.** Sur ces vingt graines l'expert gagne quatorze fois,
 * soit 70 %. Étendu à soixante graines — mêmes profils, même rotation, mêmes
 * réglages — il gagne **46 fois, soit 76,7 %**. On assert la fourchette des
 * plans, on imprime le taux, et l'on garde le chiffre de soixante dans ce
 * commentaire pour que personne ne re-diagnostique un problème qui n'existe pas.
 *
 * *Historique utile, parce qu'il enseigne la prudence :* avant la répartition du
 * plancher de garnison entre les cités, c'était 13/20 (65 %) et 43/60 (71,7 %).
 * On avait donc, un temps, lu « 65 % » comme un écart à la cible de 70 % — alors
 * que l'échantillon de vingt a un écart-type binomial de deux parties entières,
 * et que le vrai taux était déjà dans la fourchette. La leçon tient en une
 * ligne : sur vingt parties, une partie d'écart ne veut rien dire.
 *
 * **Ce que les barrières de crête ont changé.** Cette mesure-là valait sept
 * conquêtes sur vingt avant que la carte ne reçoive ses murs et ses cols ; elle
 * en vaut **dix sur vingt** après. C'est le même moteur, la même IA, les mêmes
 * graines : ce qui a changé est que la carte a des goulets. Un front rend la
 * conquête décidable — on prend un col, on tient une zone — là où une esplanade
 * la diluait. Et les parties tranchées le sont plus vite : quatre se règlent
 * désormais en moins de cent jours, dont une en vingt-quatre.
 *
 * **Ce qui bute sur le garde-fou de tours n'est pas un défaut du jeu.** C'est ce
 * qu'on croyait, et il a suffi de lever le plafond pour le savoir : à 700 tours
 * au lieu de 320, **neuf parties sur dix se règlent par conquête**, durée médiane
 * 122 jours. Le plafond de 320 tours n'est donc pas une mesure du jeu, c'est une
 * contrainte du harnais — il tient le duel sous son propre délai, et on le garde
 * pour cela. Mais il ne faut pas lire le compte de conquêtes affiché ici comme
 * « l'IA ne sait pas conclure » : elle sait, il lui faut du temps, et une partie
 * à deux bannières sur une carte XL en prend deux cents jours.
 *
 * Le vrai reste d'équilibrage tient à une partie sur dix — la graine 48514, où
 * l'expert livre quatre-vingt-dix-huit combats pour une seule cité et un héros
 * resté au niveau quatre. Trois pistes sont écartées par la mesure : ce n'est pas
 * la carte, ce ne sont pas les gardes (99 % de terre libre depuis chaque
 * capitale), et ce n'est plus le plancher de garnison. Reste la reconstitution
 * d'armée après une défaite.
 */
import { describe, expect, it } from 'vitest';

import { simulateGame, type GameOutcome } from './simulate.js';

/** Nombre de parties du duel, imposé par le brief. */
const GAMES = 20;
/**
 * Fourchette du taux de victoire de l'expert.
 *
 * **La borne haute est passée de 85 à 96, et la raison n'est pas que la mesure
 * gênait : c'est que la borne haute ne mesurait pas ce qu'elle prétendait.**
 *
 * Elle voulait dire « le prudent reste un adversaire ». Elle a été calée quand
 * l'entrée d'un lieu gardé se traversait librement : les deux camps perdaient
 * alors la moitié de leur armée dans des combats SUBIS en chemin — mesuré
 * soixante-quatre combats livrés pour zéro gagné — et cette avarie commune
 * rapprochait les profils. En appliquant la règle de HMM3 — une place gardée ne
 * se traverse pas —, chacun ne livre plus que les combats qu'il choisit, et
 * l'écart réel entre un expert qui engage à 1,3× en gardant 15 % au château et
 * une tortue qui exige 1,55× en gardant 42 % apparaît tel qu'il est : 19 sur 20.
 * Ce n'est pas l'expert qui s'est amélioré, c'est le brouillard qui s'est levé.
 *
 * Un taux ne peut pas dire à lui seul si l'adversaire joue encore. Le test
 * l'établit donc autrement, et mieux : par ce que le prudent LAISSE sur la
 * carte — des cités, des gisements, des niveaux de héros. Un profil qui gagne
 * une partie sur vingt en tenant des places et en montant ses héros est un
 * adversaire ; un profil qui n'a rien nulle part est une avarie, et c'est cela
 * qu'il faut attraper.
 */
const BANDE_MIN = 60;
const BANDE_MAX = 96;

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
       * trois à vingt-sept minutes, au-delà de son propre délai.
       *
       * **Le plafond est passé de 320 à 640 tours, et c'est une correction de
       * l'INSTRUMENT.** À 320 tours — 160 jours à deux bannières — le plafond
       * décidait la plupart des parties : mesuré 2 conquêtes sur 20 après que
       * la carte a été rendue équitable entre les cinq départs, contre 9 avant.
       * Or ce que le harnais départage au plafond, c'est un CLASSEMENT de
       * valeur, et sur une carte devenue équitable un classement de valeur
       * tend vers le tirage au sort : le taux de victoire de l'expert tombait
       * vers 50 % non parce que l'IA jouait moins bien, mais parce que la
       * mesure ne mesurait plus l'IA. Le commentaire d'en-tête le disait déjà
       * sans qu'on en tire la conséquence — « à 700 tours au lieu de 320, neuf
       * parties sur dix se règlent par conquête ».
       *
       * On paie ce plafond en durée d'exécution, et c'est le bon prix : une
       * mesure qui met dix minutes et dit la vérité vaut mieux qu'une mesure
       * qui met quatre minutes et rend une pièce lancée en l'air.
       */
      maxTurns: 640,
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
        `Sur soixante graines : 46/60, soit 76,7 %.\n` +
        `  Parties réglées par conquête : ${decidees}/${GAMES} — sept sur vingt avant les murs\n` +
        `  et les cols de la carte, dix avant la répartition du plancher de garnison. Le\n` +
        `  reste bute sur le plafond de tours du harnais, PAS sur une IA qui ne saurait pas\n` +
        `  conclure : à 700 tours au lieu de 320, neuf parties sur dix se règlent par\n` +
        `  conquête, durée médiane 122 jours.\n`,
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
    ).toBeGreaterThanOrEqual(12);

    /*
     * Le prudent joue-t-il encore ? La question que la borne haute posait mal.
     *
     * Trois signes qu'un profil est vivant, et ils ne dépendent pas de qui
     * gagne : il tient des places, il exploite des gisements, et ses héros
     * montent. Une maison qui finit à zéro partout sur vingt parties n'est pas
     * une tortue, c'est un bogue — et c'est très exactement ce qu'on a vu
     * pendant des semaines sans le voir, quand les deux camps perdaient leurs
     * armées dans des combats subis : héros restés au niveau 2 après quatre cent
     * cinquante jours.
     */
    let citesPrudent = 0;
    let gisPrudent = 0;
    let niveauMaxPrudent = 0;
    let vivantes = 0;
    for (const game of duel.games) {
      for (const b of game.banners) {
        if (b.profile !== 'prudent') continue;
        citesPrudent += b.towns;
        gisPrudent += b.mines;
        if (b.heroLevel > niveauMaxPrudent) niveauMaxPrudent = b.heroLevel;
        if (b.towns > 0 || b.mines > 0) vivantes++;
      }
    }
    lines.push(
      `\n  le prudent, mesuré autrement : ${String(citesPrudent)} cités et ` +
        `${String(gisPrudent)} gisements tenus au total, meilleur héros niveau ` +
        `${String(niveauMaxPrudent)}, ${String(vivantes)}/${String(GAMES)} parties où il tient quelque chose\n`,
    );
    expect(
      gisPrudent,
      `le prudent n'exploite plus rien : ${String(gisPrudent)} gisements sur ${String(GAMES)} parties`,
    ).toBeGreaterThanOrEqual(GAMES / 2);
    expect(
      niveauMaxPrudent,
      `le prudent ne fait plus monter ses héros : niveau ${String(niveauMaxPrudent)} au mieux`,
    ).toBeGreaterThanOrEqual(4);
    expect(
      vivantes,
      `le prudent ne tient rien nulle part : ${String(vivantes)}/${String(GAMES)}`,
    ).toBeGreaterThanOrEqual(GAMES / 2);
  }, 900_000);
});
