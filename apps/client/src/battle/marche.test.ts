/**
 * LA CADENCE DE MARCHE EN COMBAT.
 *
 * Plainte du propriétaire, en jouant : « les déplacements des combats sont
 * quasi instantanés or ils devraient être lents ».
 *
 * L'ancienne formule était `max(0,12 ; min(1,6 ; 0,17 × pas))`. Mesurée :
 *
 * ```
 *    1 hex →   170 ms      170 ms/hex
 *    4 hex →   680 ms      170 ms/hex
 *   14 hex →  1600 ms      114 ms/hex
 *   18 hex →  1600 ms       89 ms/hex
 * ```
 *
 * Deux fautes. Un hexagone franchi en 170 ms est un glissement, pas un pas.
 * Et surtout LE PLAFOND CORRIGEAIT À L'ENVERS : passé dix hexagones la durée
 * totale était bornée, donc la cadence par case s'effondrait, et la charge qui
 * traverse tout le champ — le mouvement le plus spectaculaire du jeu —
 * devenait le plus rapide de tous.
 *
 * C'est la même faute que sur la marche du héros (`render/cadence.test.ts`),
 * trouvée d'abord là-bas, puis ici. Les deux gardes se ressemblent parce que
 * le défaut était le même ; elles vivent séparément parce que les deux écrans
 * ont chacun leur cadence à tenir.
 */
import { describe, expect, it } from 'vitest';
import { dureeDeMarche } from './anim.js';

/** La cadence d'origine, celle que le propriétaire a jugée instantanée. */
const TROP_RAPIDE_MS = 170;
/**
 * La plus longue marche RÉELLEMENT atteignable.
 *
 * Les points de marche d'une pile valent sa vitesse effective
 * (`movementPoints`), et la créature la plus rapide du contenu est à 13. Un
 * chemin plus long que cela suppose un élan de sort ; on garde donc les deux
 * bornes — celle qu'on verra tous les jours, et celle de l'extrême.
 */
const PLUS_LONG_CHEMIN = 13;
const CHEMIN_EXTREME = 25;

/** Cadence par hexagone, en millisecondes. */
const parHex = (n: number): number => (dureeDeMarche(n) * 1000) / n;

describe('cadence de marche en combat', () => {
  it('un pas se voit', () => {
    /* 170 ms auparavant : la pile avait bougé avant qu'on tourne les yeux. */
    expect(dureeDeMarche(1) * 1000).toBeGreaterThanOrEqual(250);
  });

  it('une approche de quatre hexagones est délibérée', () => {
    /* 680 ms auparavant. */
    expect(dureeDeMarche(4) * 1000).toBeGreaterThan(1000);
  });

  it('AUCUNE longueur ne repasse sous la cadence dont il s’est plaint', () => {
    /* Le cœur de la garde. L'ancienne formule tombait à 89 ms l'hexagone sur
       un chemin de dix-huit : c'est CE renversement qu'on interdit. */
    for (let n = 1; n <= 40; n += 1) {
      expect(parHex(n), `${n} hexagones : ${parHex(n).toFixed(0)} ms/hex`).toBeGreaterThan(
        TROP_RAPIDE_MS,
      );
    }
  });

  it('un long trajet n’est jamais plus vif qu’un court', () => {
    let precedente = parHex(1);
    for (let n = 2; n <= 40; n += 1) {
      const c = parHex(n);
      expect(c, `${n} hexagones`).toBeLessThanOrEqual(precedente + 1e-9);
      precedente = c;
    }
  });

  it('la marche s’allonge toujours avec le chemin', () => {
    /* Une propriété que le plafond ANCIEN violait : au-delà de dix hexagones,
       la durée totale ne bougeait plus — dix, quatorze et dix-huit hexagones
       prenaient tous exactement 1600 ms, ce qui est absurde à regarder. */
    let precedente = dureeDeMarche(1);
    for (let n = 2; n <= 40; n += 1) {
      const d = dureeDeMarche(n);
      expect(d, `${n} hexagones`).toBeGreaterThan(precedente);
      precedente = d;
    }
  });

  it('la plus longue charge reste regardable', () => {
    /* Personne ne veut voir une pile traverser le champ pendant cinq secondes
       à chaque tour. Le genou borne la croissance sans jamais clouer deux
       trajets à la même durée. */
    expect(dureeDeMarche(PLUS_LONG_CHEMIN) * 1000).toBeLessThan(3500);
    /* Et même hâtée par un sort, une pile ne prend pas la parole cinq secondes. */
    expect(dureeDeMarche(CHEMIN_EXTREME) * 1000).toBeLessThan(5000);
  });

  it('la même cadence que le héros sur la carte', () => {
    /* Un jeu qui marche à deux vitesses selon l'écran se lit comme deux jeux.
       Le pas de croisière est le même des deux côtés. */
    expect(parHex(1)).toBe(260);
  });

  it('un chemin vide ou absurde ne fige pas la file', () => {
    for (const n of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const d = dureeDeMarche(n);
      expect(Number.isFinite(d)).toBe(true);
      expect(d).toBeGreaterThan(0);
      /* Une tâche de durée nulle serait exécutée d'un bloc par la file, et la
         pile se téléporterait — le défaut d'origine, par une autre porte. */
      expect(d).toBeGreaterThan(0.05);
    }
  });
});
