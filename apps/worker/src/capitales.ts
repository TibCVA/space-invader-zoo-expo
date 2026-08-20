/**
 * Le taux de victoire par CAPITALE, en partie à cinq.
 *
 *   npx tsx src/capitales.ts            → 25 parties
 *   npx tsx src/capitales.ts 100        → 100 parties (≈ 2 h 20)
 *
 * **Pourquoi cet outil existe.** Le document maître §20.3 fixe une exigence
 * qu'aucun outil ne mesurait : « taux de victoire de chaque position en partie à
 * cinq : 18 à 22 % ». Le rapport de `simulate.ts` classe les victoires par
 * PROFIL d'IA — utile pour régler l'IA, muet sur l'équité des départs. Or c'est
 * l'équité des départs qui décide si l'on peut mettre cinq cousins autour de la
 * même carte : si Cervières gagne une fois sur deux et La Renaudie jamais, le
 * choix de la capitale décide la partie avant qu'elle commence.
 *
 * La rotation fait tourner profils, sièges et factions d'une partie à l'autre :
 * sans elle, on mesurerait la force d'un profil et non celle d'un départ.
 *
 * **Sur la taille de l'échantillon, et sans se raconter d'histoires.** Pour une
 * cible de 20 %, l'écart-type binomial sur vingt-cinq parties vaut deux parties
 * entières, soit huit points de pourcentage : vingt-cinq parties ne peuvent PAS
 * distinguer 18 % de 22 %. Elles distinguent en revanche très bien un départ
 * grossièrement favorisé ou condamné, ce qui est le défaut qu'on cherche
 * d'abord. Le nombre de parties est donc imprimé à côté de chaque taux, et la
 * marge avec.
 */
import { START_POSITIONS, type StartKey } from '@auvergne/map';

import { simulateGame } from './simulate.js';

const PARTIES = Math.max(1, Number(process.argv[2] ?? 25) | 0);
const GRAINE = Number(process.argv[3] ?? 20250816) | 0;

interface Compte {
  jouees: number;
  gagnees: number;
}

function main(): void {
  const parCapitale = new Map<string, Compte>();
  for (const key of Object.keys(START_POSITIONS)) {
    parCapitale.set(key, { jouees: 0, gagnees: 0 });
  }

  let decidees = 0;
  let conquetes = 0;
  let joursTotal = 0;

  for (let i = 0; i < PARTIES; i++) {
    const g = simulateGame({
      seed: GRAINE + i * 7919,
      players: 5,
      rotation: i,
      duration: 'standard',
      victory: 'derniere_banniere',
      fast: true,
    });
    joursTotal += g.turns;
    if (g.winner) decidees++;
    if (!g.reason.startsWith('Garde-fou du harnais')) conquetes++;

    for (const b of g.banners) {
      const c = parCapitale.get(b.start);
      if (!c) continue;
      c.jouees++;
      if (b.id === g.winner) c.gagnees++;
    }
    process.stdout.write(
      `${String(i + 1).padStart(3)}/${String(PARTIES)} graine ${String(g.seed).padStart(8)} ` +
        `${String(g.turns).padStart(4)} j ${g.winner ?? 'aucun'} ` +
        `${g.reason.startsWith('Garde-fou') ? 'classement' : 'CONQUÊTE'}\n`,
    );
  }

  console.log(`\n╔═ Taux de victoire par capitale — ${String(PARTIES)} parties à cinq ═══════════`);
  const lignes: { nom: string; taux: number; c: Compte }[] = [];
  for (const [key, c] of parCapitale) {
    const nom = START_POSITIONS[key as StartKey]?.label ?? key;
    lignes.push({ nom, taux: c.jouees ? (100 * c.gagnees) / c.jouees : 0, c });
  }
  lignes.sort((a, b) => b.taux - a.taux);
  for (const l of lignes) {
    /* Marge à un écart-type binomial, en points de pourcentage. */
    const p = l.taux / 100;
    const marge = l.c.jouees ? 100 * Math.sqrt((p * (1 - p)) / l.c.jouees) : 0;
    console.log(
      `  ${l.nom.padEnd(14)} ${String(l.c.gagnees).padStart(3)} / ${String(l.c.jouees).padStart(3)}` +
        ` = ${l.taux.toFixed(1).padStart(5)} %  ± ${marge.toFixed(1)}`,
    );
  }
  console.log(`\n  cible du document maître §20.3 : 18 à 22 % par position`);
  console.log(`  parties décidées ${String(decidees)}/${String(PARTIES)} · par conquête ${String(conquetes)}/${String(PARTIES)}`);
  console.log(`  durée moyenne ${(joursTotal / PARTIES).toFixed(0)} jours`);
  const ecart = lignes[0].taux - lignes[lignes.length - 1].taux;
  console.log(`  écart entre la meilleure et la pire position : ${ecart.toFixed(1)} points`);
}

main();
