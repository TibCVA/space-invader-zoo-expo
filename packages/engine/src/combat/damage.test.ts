import { describe, expect, it } from 'vitest';
import { createRng } from '../rng.js';
import {
  applyDamage,
  applyFormula,
  attackDefenseMult,
  damageForRoll,
  damageRange,
  killsFor,
  planDamage,
  rollFortune,
} from './damage.js';
import { COMBAT_TUNING, unitTotalHp, unitDef, livingUnits } from './units.js';
import { directionTo } from './hex.js';
import { FALLBACK_CREATURE_IDS } from './creatures.js';
import { army, makeBattle, makeHero } from './testkit.js';

describe('formule de dégâts officielle', () => {
  it('applique borne(10000 + 450 × (attaque − défense), 3500, 30000)', () => {
    expect(attackDefenseMult(2, 2)).toBe(10000);
    expect(attackDefenseMult(12, 2)).toBe(14500);
    expect(attackDefenseMult(2, 12)).toBe(5500);
    // bornes basse et haute
    expect(attackDefenseMult(0, 30)).toBe(COMBAT_TUNING.attackDefenseMinBp);
    expect(attackDefenseMult(60, 0)).toBe(COMBAT_TUNING.attackDefenseMaxBp);
  });

  it('calcule des cas connus, en entiers', () => {
    // 10 créatures, jet de 2, attaque = défense, aucun modificateur.
    expect(applyFormula(10 * 2, 10000, 10000)).toBe(20);
    // même chose avec +45 % d'attaque nette
    expect(applyFormula(10 * 2, 14500, 10000)).toBe(29);
    // modificateurs cumulés à +50 %
    expect(applyFormula(10 * 2, 10000, 15000)).toBe(30);
    // troncature vers le bas, jamais d'arrondi supérieur
    expect(applyFormula(3, 10000, 13333)).toBe(3);
    expect(applyFormula(0, 30000, 30000)).toBe(0);
  });

  it('reste exact sur de très grandes piles (aucun flottant)', () => {
    const d = applyFormula(20000 * 65, 30000, 40000);
    expect(Number.isSafeInteger(d)).toBe(true);
    expect(d).toBe(Math.floor((20000 * 65 * 30000 * 40000) / 100000000));
  });

  it('convertit les dégâts en pertes selon les points de vie', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['granit_t1', 10]),
    });
    const target = combat.units[1];
    // Manant : 4 PV. 20 points = exactement 5 créatures.
    expect(killsFor(target, 20)).toEqual({ kills: 5, topHp: 4, wiped: false });
    // 3 points : la créature de tête survit blessée.
    expect(killsFor(target, 3)).toEqual({ kills: 0, topHp: 1, wiped: false });
    // au-delà de la pile entière : elle est anéantie, sans « débordement ».
    expect(killsFor(target, 10000)).toEqual({ kills: 10, topHp: 0, wiped: true });
  });

  it('applique réellement les pertes à la pile', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['granit_t1', 10]),
    });
    const target = combat.units[1];
    applyDamage(target, 22);
    expect(target.count).toBe(5);
    expect(target.topHp).toBe(2);
    expect(target.alive).toBe(true);
    applyDamage(target, 1000);
    expect(target.alive).toBe(false);
    expect(target.count).toBe(0);
  });
});

describe('damageRange — explication complète avant l’attaque', () => {
  it('fournit fourchette, pertes probables, riposte et modificateurs', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t3', 10]),
      defenderArmy: army(['ermitage_t1', 40]),
    });
    const shooter = combat.units[0];
    const target = combat.units[1];
    const res = damageRange(combat, shooter, target, true);

    expect(res.min).toBeGreaterThan(0);
    expect(res.max).toBeGreaterThanOrEqual(res.min);
    expect(res.kills[0]).toBeLessThanOrEqual(res.kills[1]);
    expect(res.retaliation).toBe(false); // un tir ne provoque jamais de riposte
    expect(res.modifiers.length).toBeGreaterThan(0);
    for (const m of res.modifiers) {
      expect(typeof m.label).toBe('string');
      expect(m.label.length).toBeGreaterThan(0);
      expect(Number.isInteger(m.bp)).toBe(true);
    }
    // La pénalité de longue portée doit être annoncée (15 colonnes d'écart).
    expect(res.modifiers.some((m) => m.label.includes('longue portée'))).toBe(true);
  });

  it('annonce la riposte au corps à corps et son absence sur capacité', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
    });
    const a = combat.units[0];
    const b = combat.units[1];
    b.retaliationsLeft = 1;
    expect(damageRange(combat, a, b, false).retaliation).toBe(true);
    b.retaliationsLeft = 0;
    expect(damageRange(combat, a, b, false).retaliation).toBe(false);
  });

  it('détaille la posture de défense et la perforation d’armure', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t3_up', 10]),
      defenderArmy: army(['ermitage_t6', 3]),
    });
    const shooter = combat.units[0];
    const target = combat.units[1];
    target.defending = true;
    const res = damageRange(combat, shooter, target, true);
    expect(res.modifiers.some((m) => m.label.includes('posture de défense'))).toBe(true);
    expect(res.modifiers.some((m) => m.label.includes("Perforation d'armure"))).toBe(true);
    const defenceRow = res.modifiers.find((m) => m.label.includes('posture de défense'));
    expect(defenceRow && defenceRow.bp).toBeLessThan(0);
  });
});

/**
 * L'aperçu mentait pour tout assaut demandant un déplacement : `damageRange`
 * n'acceptait pas de case d'approche, `planDamage` retombait sur la position
 * actuelle, et l'angle, la riposte conditionnelle et la charge étaient tous
 * calculés depuis la case où la pile se tenait encore. Le joueur lisait un
 * chiffre, avançait, et en récoltait un autre.
 */
describe('aperçu depuis la case d’approche', () => {
  /** Cible au milieu du champ, face à un assaillant posé à l'ouest. */
  function duel(attaquant: string, cible: string) {
    const { state, combat } = makeBattle({
      attackerArmy: army([attaquant as never, 10]),
      defenderArmy: army([cible as never, 40]),
    });
    const a = combat.units[0];
    const c = combat.units[1];
    a.at = { col: 3, row: 5 };
    c.at = { col: 8, row: 5 };
    c.facing = directionTo(c.at, a.at);
    /* La case d'approche est à l'opposé : le coup y prendra la cible de dos. */
    return { state, combat, a, c, dos: { col: 9, row: 5 } as const };
  }

  it('compte l’angle de dos et la charge depuis la case où le coup partira', () => {
    const { combat, a, c, dos } = duel('granit_t5', 'ermitage_t1');
    const surPlace = damageRange(combat, a, c, false);
    const apresApproche = damageRange(combat, a, c, false, dos, 5);

    expect(surPlace.modifiers.some((m) => m.label === 'Attaque dans le dos')).toBe(false);
    expect(surPlace.modifiers.some((m) => m.label.startsWith('Charge'))).toBe(false);
    expect(apresApproche.modifiers.some((m) => m.label === 'Attaque dans le dos')).toBe(true);
    expect(apresApproche.modifiers.some((m) => m.label === 'Charge sur 5 hexagones')).toBe(true);
    /* Le dos vaut +2000 BP et la charge 5 × 500 BP : le chiffre annoncé
       change, et c'est précisément ce que l'aperçu taisait. */
    expect(apresApproche.max).toBeGreaterThan(surPlace.max);
  });

  it('suit la riposte conditionnelle : le Loup des Brumes ne la subit pas de dos', () => {
    const { combat, a, c, dos } = duel('ermitage_t3_up', 'ermitage_t1');
    expect(damageRange(combat, a, c, false).retaliation).toBe(true);
    expect(damageRange(combat, a, c, false, dos).retaliation).toBe(false);
    expect(damageRange(combat, a, c, false, dos).retaliationDamage).toBeNull();
  });

  it('un tir garde l’angle de face : la case d’approche ne le concerne pas', () => {
    const { combat, a, c, dos } = duel('granit_t3', 'ermitage_t1');
    const tir = damageRange(combat, a, c, true, dos);
    expect(tir.modifiers.some((m) => m.label === 'Attaque dans le dos')).toBe(false);
    expect(tir.retaliation).toBe(false);
    expect(tir.retaliationDamage).toBeNull();
  });
});

/**
 * « Riposte attendue » n'était qu'un booléen. Sans le nombre, on ne peut pas
 * décider d'un assaut : c'est le renseignement qui manque le plus.
 */
describe('la riposte est chiffrée', () => {
  it('annonce une fourchette et les pertes qu’elle coûtera', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 40]),
    });
    const a = combat.units[0];
    const c = combat.units[1];
    const res = damageRange(combat, a, c, false);
    expect(res.retaliation).toBe(true);
    const riposte = res.retaliationDamage;
    expect(riposte).not.toBeNull();
    if (!riposte) return;
    expect(riposte.min).toBeGreaterThan(0);
    expect(riposte.max).toBeGreaterThanOrEqual(riposte.min);
    expect(riposte.kills[0]).toBeLessThanOrEqual(riposte.kills[1]);
  });

  it('n’annonce rien quand la cible n’a plus de riposte', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
    });
    const a = combat.units[0];
    const c = combat.units[1];
    c.retaliationsLeft = 0;
    expect(damageRange(combat, a, c, false).retaliationDamage).toBeNull();
  });

  it('ne fait riposter que les survivants du coup', () => {
    /*
     * Douze Sangliers Cuirassés contre cinquante Pèlerins : le coup minimal
     * en couche quarante, le coup maximal les emporte tous. La riposte doit
     * donc s'annoncer « de 0 à quelque chose » — un aperçu qui la chiffrerait
     * sur la pile intacte conseillerait l'inverse de ce qu'il faut faire.
     */
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t5', 12]),
      defenderArmy: army(['ermitage_t1', 50]),
    });
    const a = combat.units[0];
    const c = combat.units[1];
    c.facing = directionTo(c.at, a.at);
    const res = damageRange(combat, a, c, false);
    expect(res.kills).toEqual([40, 50]);
    const riposte = res.retaliationDamage;
    expect(riposte).not.toBeNull();
    if (!riposte) return;
    expect(riposte.min).toBe(0);
    expect(riposte.max).toBeGreaterThan(0);
  });
});

describe('fortune bornée', () => {
  it('ne dépasse jamais ±3000 BP', () => {
    const rng = createRng(7);
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
    });
    const unit = combat.units[0];
    for (const fortune of [-3, -2, -1, 0, 1, 2, 3]) {
      unit.fortune = fortune;
      for (let i = 0; i < 200; i++) {
        const bp = rollFortune(rng, unit);
        expect(Math.abs(bp)).toBeLessThanOrEqual(COMBAT_TUNING.fortuneBp);
        if (fortune === 0) expect(bp).toBe(0);
        if (fortune > 0) expect(bp).toBeGreaterThanOrEqual(0);
        if (fortune < 0) expect(bp).toBeLessThanOrEqual(0);
      }
    }
  });

  it('aucun coup critique n’anéantit une pile comparable en un seul jet', () => {
    for (const id of FALLBACK_CREATURE_IDS) {
      const { combat } = makeBattle({
        attackerArmy: army([id, 40]),
        defenderArmy: army([id, 40]),
      });
      const attacker = combat.units[0];
      const target = combat.units[1];
      // Pire cas possible : attaque dans le dos, charge maximale, fortune au plafond.
      const incoming = directionTo(target.at, attacker.at);
      target.facing = (incoming + 3) % 6;
      attacker.lastMoveDistance = 20;
      const plan = planDamage(combat, attacker, target, {
        ranged: false,
        fromHex: attacker.at,
        fortuneBp: COMBAT_TUNING.fortuneBp,
      });
      const worst = damageForRoll(plan, plan.rollMax);
      const total = unitTotalHp(target);
      expect(worst).toBeLessThan(total);
      // Marge de sécurité : jamais plus de 85 % d'une pile comparable.
      expect(worst * 100).toBeLessThan(total * 85);
    }
  });

  it('un seul coup ne peut pas emporter une armée comparable', () => {
    const composition: [string, number][] = [
      ['granit_t1', 60],
      ['granit_t2', 30],
      ['granit_t3', 20],
      ['granit_t4', 12],
      ['granit_t5', 8],
      ['granit_t6', 4],
      ['granit_t7', 2],
    ];
    const { combat } = makeBattle({
      attackerArmy: army(...composition),
      defenderArmy: army(...composition),
    });
    let armyHp = 0;
    for (const u of livingUnits(combat, 1)) armyHp += unitTotalHp(u);

    let worstBlow = 0;
    for (const attacker of livingUnits(combat, 0)) {
      for (const target of livingUnits(combat, 1)) {
        const incoming = directionTo(target.at, attacker.at);
        target.facing = (incoming + 3) % 6;
        attacker.lastMoveDistance = 20;
        const plan = planDamage(combat, attacker, target, {
          ranged: false,
          fromHex: attacker.at,
          fortuneBp: COMBAT_TUNING.fortuneBp,
        });
        const dmg = Math.min(damageForRoll(plan, plan.rollMax), unitTotalHp(target));
        if (dmg > worstBlow) worstBlow = dmg;
      }
    }
    expect(worstBlow * 4).toBeLessThan(armyHp);
  });
});

describe('bonus de héros et de faction', () => {
  it('la vaillance et la garde du héros s’appliquent aux piles', () => {
    const hero = makeHero('H1', 'P1', { vaillance: 6, garde: 4 });
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['granit_t1', 10]),
      attackerHero: hero,
    });
    const mine = combat.units.find((u) => u.side === 0);
    const theirs = combat.units.find((u) => u.side === 1);
    const def = unitDef(mine!);
    expect(mine!.attack).toBe(def.attack + 6);
    expect(mine!.defense).toBe(def.defense + 4);
    expect(theirs!.attack).toBe(def.attack);
  });
});
