import { describe, expect, it } from 'vitest';
import { applyCombatAction } from './actions.js';
import {
  activeUnit,
  baseRetaliations,
  beginRound,
  buildInitiativeOrder,
  unitWaits,
} from './order.js';
import {
  COMBAT_TUNING,
  FX,
  effectiveAttack,
  effectiveDefense,
  effectiveInitiative,
  effectiveSpeed,
  findUnit,
  hasEffect,
  unitDef,
  updateOathFormations,
} from './units.js';
import { hexPath, reachableHexes } from './move.js';
import { damageRange } from './damage.js';
import { directionTo, hexDistance } from './hex.js';
import { army, makeBattle, makeHero } from './testkit.js';

describe('file d’initiative', () => {
  it('classe les piles par initiative décroissante, sans aléa', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10], ['granit_t7', 1], ['granit_t3', 5]),
      defenderArmy: army(['ermitage_t2', 8], ['ermitage_t6', 2]),
    });
    const inits = combat.order.map((uid) => {
      const u = findUnit(combat, uid)!;
      return effectiveInitiative(combat, u);
    });
    for (let i = 1; i < inits.length; i++) {
      expect(inits[i - 1]).toBeGreaterThanOrEqual(inits[i]);
    }
    // Déterminisme : reconstruire la file donne exactement le même ordre.
    const before = [...combat.order];
    buildInitiativeOrder(combat);
    expect(combat.order).toEqual(before);
  });

  it('renvoie une pile qui attend en fin de file', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t7', 1], ['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
    });
    const first = activeUnit(combat)!;
    const positionBefore = combat.order.indexOf(first.uid);
    unitWaits(combat, first);
    const positionAfter = combat.order.indexOf(first.uid);
    expect(first.hasWaited).toBe(true);
    expect(positionAfter).toBeGreaterThan(positionBefore);
    expect(combat.order[combat.order.length - 1]).toBe(first.uid);
  });

  it('ouvre un nouveau round et réinitialise les piles', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
    });
    const unit = combat.units[0];
    unit.defending = true;
    unit.hasWaited = true;
    unit.retaliationsLeft = 0;
    const round = combat.round;
    beginRound(state, combat, []);
    expect(combat.round).toBe(round + 1);
    expect(unit.defending).toBe(false);
    expect(unit.hasWaited).toBe(false);
    expect(unit.retaliationsLeft).toBe(baseRetaliations(unit));
  });
});

describe('ripostes', () => {
  it('une riposte par round, sauf capacité explicite', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['granit_t7_up', 3], ['granit_t7', 3]),
    });
    const manant = combat.units.find((u) => u.creature === 'granit_t1')!;
    const couronne = combat.units.find((u) => u.creature === 'granit_t7_up')!;
    const griffon = combat.units.find((u) => u.creature === 'granit_t7')!;
    expect(baseRetaliations(manant)).toBe(1);
    expect(baseRetaliations(griffon)).toBe(2);
    expect(baseRetaliations(couronne)).toBe(3);
  });

  it('consomme la riposte de la cible après un coup au contact', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 20]),
    });
    const a = combat.units[0];
    const d = combat.units[1];
    a.at = { col: 6, row: 5 };
    d.at = { col: 7, row: 5 };
    combat.order = [a.uid, d.uid];
    combat.activeIndex = 0;
    const res = applyCombatAction(state, { kind: 'attack', unit: a.uid, target: d.uid });
    expect(res.ok).toBe(true);
    expect(d.retaliationsLeft).toBe(0);
    expect(combat.log.some((l) => l.text.includes('riposte'))).toBe(true);
  });
});

describe('moral', () => {
  it('un moral négatif ne fait jamais perdre le tour', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
      seed: 99,
    });
    let flottements = 0;
    for (let i = 0; i < 40; i++) {
      const unit = activeUnit(combat);
      if (!unit) break;
      unit.morale = -3;
      const res = applyCombatAction(state, { kind: 'defend', unit: unit.uid });
      expect(res.ok).toBe(true); // l'action aboutit toujours
      if (hasEffect(unit, FX.noAbility)) flottements++;
    }
    expect(flottements).toBeGreaterThan(0); // le flottement existe bien
  });

  it('l’Élan ne se déclenche qu’une fois par pile et par round', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t1', 1]),
      defenderArmy: army(['granit_t7', 100]),
      seed: 4242,
    });
    const a = combat.units[0];
    const d = combat.units[1];
    a.at = { col: 7, row: 5 };
    d.at = { col: 8, row: 5 };
    let elans = 0;
    for (let i = 0; i < 80 && elans < 3; i++) {
      const unit = activeUnit(combat);
      if (!unit) break;
      if (unit.uid !== a.uid) {
        applyCombatAction(state, { kind: 'defend', unit: unit.uid });
        continue;
      }
      unit.morale = 3;
      d.retaliationsLeft = 0; // on isole l'effet du moral
      const res = applyCombatAction(state, { kind: 'attack', unit: a.uid, target: d.uid });
      expect(res.ok).toBe(true);
      if (hasEffect(a, FX.elan)) {
        elans++;
        // Après un Élan la pile reste active avec un demi-mouvement.
        expect(activeUnit(combat)!.uid).toBe(a.uid);
        expect(hasEffect(a, FX.elanUsed)).toBe(true);
        // Deuxième action : aucun second Élan dans le même round.
        applyCombatAction(state, { kind: 'attack', unit: a.uid, target: d.uid });
        expect(activeUnit(combat)?.uid).not.toBe(a.uid);
      }
    }
    expect(elans).toBeGreaterThan(0);
  });

  it('l’attente et la défense ne déclenchent jamais d’Élan', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
      seed: 77,
    });
    for (let i = 0; i < 40; i++) {
      const unit = activeUnit(combat);
      if (!unit) break;
      unit.morale = 3;
      applyCombatAction(state, { kind: 'defend', unit: unit.uid });
      expect(hasEffect(unit, FX.elan)).toBe(false);
    }
  });
});

describe('mécaniques de faction', () => {
  it('Serment de Pierre : +2 défense, −1 vitesse, immunité au premier recul', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10], ['granit_t2', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
    });
    const a = combat.units.find((u) => u.creature === 'granit_t1')!;
    const b = combat.units.find((u) => u.creature === 'granit_t2')!;
    a.at = { col: 3, row: 5 };
    b.at = { col: 9, row: 9 };
    updateOathFormations(combat);
    const loneDefense = effectiveDefense(combat, a);
    const loneSpeed = effectiveSpeed(combat, a);
    expect(hasEffect(a, FX.oath)).toBe(false);

    b.at = { col: 4, row: 5 };
    updateOathFormations(combat);
    expect(hasEffect(a, FX.oath)).toBe(true);
    expect(hasEffect(a, FX.oathShield)).toBe(true);
    expect(effectiveDefense(combat, a)).toBe(loneDefense + COMBAT_TUNING.oathDefenseBonus);
    expect(effectiveSpeed(combat, a)).toBe(loneSpeed - COMBAT_TUNING.oathSpeedMalus);
  });

  it('Mémoire de la Forêt : la futaie renforce l’Ermitage, pas la Châtellenie', () => {
    const forest = makeBattle({
      attackerArmy: army(['ermitage_t3', 10]),
      defenderArmy: army(['granit_t1', 10]),
      terrain: 'foret',
    });
    const wolf = forest.combat.units[0];
    const manant = forest.combat.units[1];
    expect(hasEffect(wolf, FX.forest)).toBe(true);
    expect(hasEffect(manant, FX.forest)).toBe(false);
    expect(effectiveAttack(forest.combat, wolf)).toBe(unitDef(wolf).attack + 1);
    expect(effectiveSpeed(forest.combat, wolf)).toBe(unitDef(wolf).speed + 1);

    const plain = makeBattle({
      attackerArmy: army(['ermitage_t3', 10]),
      defenderArmy: army(['granit_t1', 10]),
      terrain: 'prairie',
    });
    expect(hasEffect(plain.combat.units[0], FX.forest)).toBe(false);
  });

  it('Mémoire de la Forêt : brume, hauteur et rocher ont chacun leur effet', () => {
    const mist = makeBattle({
      attackerArmy: army(['ermitage_t3', 10]),
      defenderArmy: army(['granit_t1', 10]),
      weather: 'brume',
    });
    expect(hasEffect(mist.combat.units[0], FX.mist)).toBe(true);

    const height = makeBattle({
      attackerArmy: army(['ermitage_t4', 10]),
      defenderArmy: army(['granit_t1', 10]),
      terrain: 'pente',
    });
    expect(hasEffect(height.combat.units[0], FX.height)).toBe(true);

    const rocky = makeBattle({
      attackerArmy: army(['ermitage_t6', 3]),
      defenderArmy: army(['granit_t1', 10]),
      terrain: 'rocher',
    });
    const colosse = rocky.combat.units[0];
    expect(hasEffect(colosse, FX.rocky)).toBe(true);
    expect(effectiveDefense(rocky.combat, colosse)).toBe(
      unitDef(colosse).defense + COMBAT_TUNING.rockyColossusDefense,
    );
  });
});

describe('déplacement', () => {
  it('limite la portée à la vitesse effective', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
    });
    const unit = combat.units[0];
    unit.at = { col: 7, row: 5 };
    const speed = effectiveSpeed(combat, unit);
    const reach = reachableHexes(combat, unit);
    expect(reach.length).toBeGreaterThan(1);
    for (const h of reach) {
      expect(hexDistance(unit.at, h)).toBeLessThanOrEqual(speed);
    }
    const path = hexPath(combat, unit, { col: 7 + speed, row: 5 });
    expect(path).not.toBeNull();
    expect(path!.length).toBe(speed + 1);
    expect(hexPath(combat, unit, { col: 7 + speed + 3, row: 5 })).toBeNull();
  });

  it('la zone de contrôle arrête la pile qui la traverse', () => {
    const { combat } = makeBattle({
      attackerArmy: army(['granit_t7', 1]),
      defenderArmy: army(['granit_t2_up', 5]),
    });
    const flyer = combat.units[0];
    const prevot = combat.units[1];
    flyer.at = { col: 2, row: 5 };
    prevot.at = { col: 6, row: 5 };
    const reach = reachableHexes(combat, flyer);
    const beyond = reach.filter((h) => h.col > 7 && h.row === 5);
    // Le Griffon vole : il peut dépasser, mais toute case sous contrôle est terminale.
    expect(reach.some((h) => h.col === 5 && h.row === 5)).toBe(true);
    expect(beyond.length).toBeGreaterThanOrEqual(0);

    const walker = combat.units[0];
    walker.creature = 'granit_t1';
    walker.speed = 8;
    const reachWalk = reachableHexes(combat, walker);
    // Une case au-delà du Prévôt, atteignable seulement en traversant sa zone.
    expect(reachWalk.some((h) => h.col === 9 && h.row === 5)).toBe(false);
  });
});

describe('validation des actions', () => {
  it('refuse en français une action hors tour', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
    });
    const active = activeUnit(combat)!;
    const other = combat.units.find((u) => u.uid !== active.uid)!;
    const res = applyCombatAction(state, { kind: 'defend', unit: other.uid });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("Ce n'est pas le tour de cette pile.");
  });

  it('refuse un déplacement hors de portée et une cible amie', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t1', 10], ['granit_t2', 5]),
      defenderArmy: army(['ermitage_t1', 10]),
    });
    const active = activeUnit(combat)!;
    const far = applyCombatAction(state, {
      kind: 'move',
      unit: active.uid,
      to: { col: active.at.col === 0 ? 14 : 0, row: 10 },
    });
    expect(far.ok).toBe(false);
    expect(far.error).toBe('Cet hexagone est hors de portée.');

    const ally = combat.units.find((u) => u.side === active.side && u.uid !== active.uid);
    if (ally) {
      const friendly = applyCombatAction(state, {
        kind: 'attack',
        unit: active.uid,
        target: ally.uid,
      });
      expect(friendly.ok).toBe(false);
      expect(friendly.error).toContain('bannières');
    }
  });

  it('interdit le tir sans munition', () => {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t3', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
    });
    const shooter = combat.units[0];
    combat.order = [shooter.uid];
    combat.activeIndex = 0;
    shooter.shots = 0;
    const res = applyCombatAction(state, {
      kind: 'shoot',
      unit: shooter.uid,
      target: combat.units[1].uid,
    });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('Plus aucune munition.');
  });
});

/**
 * Le geste fondateur de HMM3 : cliquer l'ennemi, marcher jusqu'à lui, frapper.
 * Le moteur le sait faire depuis toujours — encore faut-il lui donner la case
 * de départ, et que l'aperçu compte le coup depuis cette case-là.
 */
describe('assaut avec case d’approche', () => {
  /** Sanglier à l'ouest, Pèlerins au centre, tournés vers l'assaillant. */
  function duel() {
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t5', 12]),
      defenderArmy: army(['ermitage_t1', 120]),
      seed: 20260820,
    });
    const a = combat.units[0];
    const c = combat.units[1];
    combat.obstacles = []; // champ dégagé : on mesure l'approche, pas le semis
    a.at = { col: 3, row: 5 };
    c.at = { col: 8, row: 5 };
    c.facing = directionTo(c.at, a.at);
    combat.order = [a.uid, c.uid];
    combat.activeIndex = 0;
    /* Le Sanglier occupe deux cases : posé en {10,5} il déborde en {9,5} et
       touche donc la cible par l'arrière. */
    return { state, combat, a, c, dos: { col: 10, row: 5 } };
  }

  it('sans case de départ, la cible éloignée n’est tout simplement pas au contact', () => {
    /* La mesure du défaut : le client émettait l'attaque sans `from`, et le
       moteur refusait — l'erreur remontait dans une bulle hors du champ. */
    const { state, combat, a, c } = duel();
    expect(hexDistance(a.at, c.at)).toBe(5);
    const res = applyCombatAction(state, { kind: 'attack', unit: a.uid, target: c.uid });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("La cible n'est pas au contact.");
    expect(combat.units[0].at).toEqual({ col: 3, row: 5 });
  });

  it('avec la case de départ, la pile marche puis frappe dans le dos', () => {
    const { state, combat, a, c, dos } = duel();
    const res = applyCombatAction(state, { kind: 'attack', unit: a.uid, target: c.uid, from: dos });
    expect(res.ok).toBe(true);
    expect(a.at).toEqual(dos);
    const coup = combat.log.find((l) => l.kind === 'attaque' && l.detail?.attaquant === a.uid);
    expect(coup?.detail?.angle).toBe('dos');
  });

  it('l’aperçu chiffré depuis la case d’approche annonce le coup réellement porté', () => {
    const { state, combat, a, c, dos } = duel();
    const chemin = hexPath(combat, a, dos);
    expect(chemin).not.toBeNull();
    if (!chemin) return;
    const cout = chemin.length - 1;

    /* Ce que l'aperçu montrait avant : le coup calculé sur place. */
    const mensonge = damageRange(combat, a, c, false);
    /* Ce qu'il montre maintenant : le coup calculé depuis la case d'approche. */
    const annonce = damageRange(combat, a, c, false, dos, cout);

    const res = applyCombatAction(state, { kind: 'attack', unit: a.uid, target: c.uid, from: dos });
    expect(res.ok).toBe(true);
    const coup = combat.log.find((l) => l.kind === 'attaque' && l.detail?.attaquant === a.uid);
    const reel = coup?.detail?.degats;
    expect(typeof reel).toBe('number');
    if (typeof reel !== 'number') return;

    expect(reel).toBeGreaterThanOrEqual(annonce.min);
    expect(reel).toBeLessThanOrEqual(annonce.max);
    /* Et l'ancien aperçu se serait trompé : le dos et la charge lui échappaient. */
    expect(reel).toBeGreaterThan(mensonge.max);
  });
});

describe('déploiement', () => {
  it('avance le déploiement d’une colonne avec la Tactique experte', () => {
    const plain = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
    });
    const tactician = makeHero('H1', 'P1', { skills: [{ skill: 'tactique', rank: 2 }] });
    const tactic = makeBattle({
      attackerArmy: army(['granit_t1', 10]),
      defenderArmy: army(['ermitage_t1', 10]),
      attackerHero: tactician,
    });
    expect(plain.combat.units[0].at.col).toBe(0);
    expect(tactic.combat.units[0].at.col).toBe(1);
  });
});
