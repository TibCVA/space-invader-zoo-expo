/**
 * LES ZONES DE MENACE DISAIENT MOINS QUE LA VÉRITÉ, ET PAS AU DOIGT.
 *
 * Deux défauts mesurés dans l'ancien `zonesDeMenace` de `battle/index.ts` :
 *
 *  1. LES TIREURS ÉTAIENT SAUTÉS. Un `continue` les écartait sous un
 *     commentaire qui promettait « un tireur menace tout le champ : on marque
 *     sa ligne de mire ». Rien n'était marqué. Une pile de tireurs adverse ne
 *     projetait donc AUCUNE menace, pas même celle, bien réelle, de son corps
 *     à corps.
 *
 *  2. LA ZONE RENDUE ÉTAIT `reachableHexes` SEUL : les cases d'ARRIVÉE de
 *     l'ennemi, non celles qu'il MENACE. Frappant au contact, il menace
 *     l'arrivée PLUS son voisinage — un hexagone entier de sous-estimation
 *     tout autour de chaque pile adverse.
 *
 * Le troisième défaut — le maintien de `M`, inexistant au tactile — est gardé
 * par le seuil de maintien, plus bas.
 *
 * Les attentes sont recalculées ici depuis le MOTEUR (`reachableHexes`,
 * `neighbors`) : aucune liste d'hexagones n'est recopiée.
 */
import { describe, expect, it } from 'vitest';
import { FX, hexKey, neighbors, reachableHexes, unitDef } from '@auvergne/engine';
import type { CombatState, CombatUnit } from '@auvergne/engine';
import { army, makeBattle } from '@auvergne/engine/combat/testkit';
import { zonesDeMenace } from './hexgrid.js';
import { MAINTIEN_MENACES_MS, maintienMontreLesMenaces } from './index.js';

/** Une pile de mêlée face à une pile de TIREURS : le cas que le code sautait. */
function faceAuxTireurs(): { combat: CombatState; moi: CombatUnit } {
  const { combat } = makeBattle({
    attackerArmy: army(['granit_t1', 30]),
    defenderArmy: army(['ermitage_t4', 14]),
    seed: 20260820,
  });
  combat.obstacles = [];
  const moi = combat.units.find((u) => u.side === 0);
  if (!moi) throw new Error('pas de pile alliée');
  return { combat, moi };
}

function cles(hexes: readonly { col: number; row: number }[]): Set<number> {
  return new Set(hexes.map((h) => hexKey(h)));
}

describe('zones de menace', () => {
  it('la pile adverse choisie est bien un tireur — sinon le test ne mesure rien', () => {
    const { combat } = faceAuxTireurs();
    const ennemis = combat.units.filter((u) => u.side === 1 && u.alive);
    expect(ennemis.length).toBeGreaterThan(0);
    expect(ennemis.every((e) => unitDef(e).shooter === true)).toBe(true);
  });

  it('ne saute plus les tireurs : ils menacent au contact comme les autres', () => {
    const { combat, moi } = faceAuxTireurs();
    const zone = zonesDeMenace(combat, moi);
    expect(zone.length).toBeGreaterThan(0);
  });

  it('couvre l’arrivée ET son voisinage, jamais l’arrivée seule', () => {
    const { combat, moi } = faceAuxTireurs();
    const zone = cles(zonesDeMenace(combat, moi));
    for (const e of combat.units.filter((u) => u.side === 1 && u.alive)) {
      for (const arrivee of reachableHexes(combat, e)) {
        expect(zone.has(hexKey(arrivee)), `arrivée ${arrivee.col},${arrivee.row}`).toBe(true);
        for (const v of neighbors(arrivee)) {
          expect(zone.has(hexKey(v)), `voisin de ${arrivee.col},${arrivee.row}`).toBe(true);
        }
      }
    }
  });

  it('est STRICTEMENT plus large que les seules cases d’arrivée', () => {
    const { combat, moi } = faceAuxTireurs();
    const arrivees = new Set<number>();
    for (const e of combat.units.filter((u) => u.side === 1 && u.alive)) {
      for (const a of reachableHexes(combat, e)) arrivees.add(hexKey(a));
    }
    const zone = cles(zonesDeMenace(combat, moi));
    expect(arrivees.size).toBeGreaterThan(0);
    expect(zone.size).toBeGreaterThan(arrivees.size);
  });

  it('menace le voisinage d’une pile immobilisée, qui n’ira nulle part', () => {
    const { combat, moi } = faceAuxTireurs();
    const e = combat.units.find((u) => u.side === 1 && u.alive);
    if (!e) throw new Error('pas d’ennemi');
    for (const autre of combat.units.filter((u) => u.side === 1 && u.uid !== e.uid)) {
      autre.alive = false;
      autre.count = 0;
    }
    /* Entrave du moteur : `effectiveSpeed` rend 0, et une vitesse mise à zéro
       à la main ne suffirait pas — elle est relevée à 1 par le plancher. */
    e.effects.push({ id: FX.root, kind: 'debuff', value: 1, turnsLeft: 2, source: 'test' });
    const arrivees = reachableHexes(combat, e);
    expect(arrivees, 'précondition : la pile ne peut plus bouger').toHaveLength(1);

    const zone = cles(zonesDeMenace(combat, moi));
    for (const v of neighbors(e.at)) {
      expect(zone.has(hexKey(v)), `voisin ${v.col},${v.row}`).toBe(true);
    }
  });

  it('ne rend jamais deux fois le même hexagone', () => {
    const { combat, moi } = faceAuxTireurs();
    const zone = zonesDeMenace(combat, moi);
    expect(cles(zone).size).toBe(zone.length);
  });

  it('regarde le camp d’en face, pas le sien', () => {
    const { combat, moi } = faceAuxTireurs();
    const zone = cles(zonesDeMenace(combat, moi));
    const adverse = cles(zonesDeMenace(combat, combat.units.filter((u) => u.side === 1)[0]));
    /* les deux camps ne menacent pas les mêmes cases : sinon le paramètre
       `pour` ne sert à rien */
    expect([...zone].some((k) => !adverse.has(k))).toBe(true);
  });
});

describe('maintien du doigt : les menaces au tactile', () => {
  it('un appui bref ne montre rien', () => {
    expect(maintienMontreLesMenaces(80, 0)).toBe(false);
  });

  it('un doigt posé et immobile finit par montrer les menaces', () => {
    expect(maintienMontreLesMenaces(600, 0)).toBe(true);
  });

  it('un doigt qui glisse fait glisser, il ne maintient pas', () => {
    expect(maintienMontreLesMenaces(600, 40)).toBe(false);
  });

  it('le seuil reste découvrable : ni réflexe, ni éternité', () => {
    /* Littéraux voulus : au-dessous de 200 ms tout appui un peu appuyé fait
       clignoter le champ, au-dessus de 500 ms personne ne trouve le geste. */
    expect(MAINTIEN_MENACES_MS).toBeGreaterThanOrEqual(200);
    expect(MAINTIEN_MENACES_MS).toBeLessThanOrEqual(500);
  });
});
