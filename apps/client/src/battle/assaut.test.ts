/**
 * LE COMBAT DOIT SE JOUER : trois défauts mesurés, trois gardes.
 *
 * 1. Personne ne jouait le camp adverse dans un combat manuel.
 *    `chooseCombatAction` n'avait qu'un appelant dans tout le dépôt —
 *    `autoResolve`. Face à des gardes neutres, le joueur devait jouer LUI-MÊME
 *    la pile d'en face, ou expédier la bataille par « Résoudre ».
 *
 * 2. Cliquer un ennemi non adjacent ne faisait rien : la vue émettait
 *    `{kind:'attack', unit, target}` sans `from`, `doAttack` ne bougeait pas,
 *    et « La cible n'est pas au contact. » remontait dans une bulle React
 *    posée hors du champ de bataille.
 *
 * 3. L'aperçu mentait pour tout assaut demandant un déplacement.
 *
 * Les tests interrogent le MOTEUR réel (`makeBattle`, `applyCombatAction`) :
 * aucune table n'est recopiée, aucune constante n'est relue.
 */
import { describe, expect, it } from 'vitest';
import {
  applyCombatAction,
  attackAngle,
  chooseCombatAction,
  directionTo,
  reachableAttackHexes,
} from '@auvergne/engine';
import type { CombatState, CombatUnit, GameState } from '@auvergne/engine';
import { army, makeBattle } from '@auvergne/engine/combat/testkit';
import {
  REFLEXION_ADVERSAIRE_MS,
  actionAssaut,
  campDuJoueur,
  choisirApproche,
  moteurDoitJouer,
} from './index.js';
import { construireApercu } from './preview.js';
import { libelleRound, romain } from './initiative.js';

/* ─────────────────────────────── Échafaudage ─────────────────────────────── */

/** Sanglier à l'ouest, Pèlerins au centre et tournés vers lui, champ dégagé. */
function duel(seed = 20260820): {
  state: GameState;
  combat: CombatState;
  a: CombatUnit;
  c: CombatUnit;
} {
  const { state, combat } = makeBattle({
    attackerArmy: army(['granit_t5', 12]),
    defenderArmy: army(['ermitage_t1', 120]),
    seed,
  });
  const a = combat.units[0];
  const c = combat.units[1];
  combat.obstacles = []; // champ dégagé : on mesure l'approche, pas le semis
  a.at = { col: 3, row: 5 };
  c.at = { col: 8, row: 5 };
  c.facing = directionTo(c.at, a.at); // la cible fait face à l'assaillant
  combat.order = [a.uid, c.uid];
  combat.activeIndex = 0;
  return { state, combat, a, c };
}

/**
 * Une pile d'une seule case, déjà à deux pas de sa cible, avec plusieurs
 * approches à coût identique : c'est là que le départage par l'angle se voit.
 */
function corpsACorps(): { combat: CombatState; a: CombatUnit; c: CombatUnit } {
  const { combat } = makeBattle({
    attackerArmy: army(['granit_t1', 20]),
    defenderArmy: army(['ermitage_t1', 40]),
  });
  const a = combat.units[0];
  const c = combat.units[1];
  combat.obstacles = [];
  /* {8,3} touche à la fois {8,4} — de face — et {9,4} — de flanc, tous deux
     à un pas : les deux approches coûtent le même prix. */
  a.at = { col: 8, row: 3 };
  c.at = { col: 8, row: 5 };
  c.facing = directionTo(c.at, { col: 0, row: 5 }); // elle regarde l'ouest
  combat.order = [a.uid, c.uid];
  combat.activeIndex = 0;
  return { combat, a, c };
}

/* ══════════════ D1 — le camp adverse est joué par le moteur ══════════════ */

describe('le camp adverse est joué par le moteur', () => {
  it('rend la main au moteur pour une pile qui n’est pas au joueur local', () => {
    const { combat, a, c } = duel();
    const camp = campDuJoueur(combat, 'P1');
    expect(camp).toBe(0);
    expect(moteurDoitJouer(combat, a, camp, false)).toBe(false);
    expect(moteurDoitJouer(combat, c, camp, false)).toBe(true);
  });

  it('joue les gardes neutres, qui n’appartiennent à personne', () => {
    const { combat, c } = duel();
    /* Un lieu gardé : `defender.player` est nul, personne ne tient ce camp. */
    combat.defender.player = null;
    expect(campDuJoueur(combat, 'P1')).toBe(0);
    expect(moteurDoitJouer(combat, c, campDuJoueur(combat, 'P1'), false)).toBe(true);
  });

  it('joue les deux camps pour un simple spectateur', () => {
    const { combat, a, c } = duel();
    const camp = campDuJoueur(combat, 'P3');
    expect(camp).toBeNull();
    expect(moteurDoitJouer(combat, a, camp, false)).toBe(true);
    expect(moteurDoitJouer(combat, c, camp, false)).toBe(true);
  });

  it('ne joue rien en démonstration ni sur un combat terminé', () => {
    const { combat, c } = duel();
    expect(moteurDoitJouer(combat, c, 0, true)).toBe(false);
    combat.finished = true;
    expect(moteurDoitJouer(combat, c, 0, false)).toBe(false);
  });

  it('attend un délai fixe : un combat rejoué doit rendre la même bataille', () => {
    expect(REFLEXION_ADVERSAIRE_MS).toBe(520);
  });

  it('la décision du moteur est toujours acceptée par le moteur', () => {
    /* La boucle de la vue n'a qu'un repli. Si `chooseCombatAction` proposait
       couramment des coups refusés, la bataille se figerait sur une pile qui
       rejoue le même coup toutes les demi-secondes. */
    const { state, combat } = makeBattle({
      attackerArmy: army(['granit_t1', 20], ['granit_t3', 8], ['granit_t5', 3]),
      defenderArmy: army(['ermitage_t1', 30], ['ermitage_t3', 10], ['ermitage_t6', 2]),
      seed: 424242,
    });
    let coups = 0;
    for (let i = 0; i < 200 && !combat.finished; i += 1) {
      const action = chooseCombatAction(state, combat);
      const res = applyCombatAction(state, action);
      expect(res.ok, `coup ${String(i)} : ${res.error ?? ''}`).toBe(true);
      coups += 1;
    }
    expect(coups).toBeGreaterThan(10);
  });
});

/* ═══════════════ D2 — cliquer un ennemi non adjacent frappe ══════════════ */

describe('cliquer un ennemi éloigné le frappe', () => {
  it('sans case d’approche, le moteur refuse — c’est le défaut mesuré', () => {
    const { state, a, c } = duel();
    const res = applyCombatAction(state, { kind: 'attack', unit: a.uid, target: c.uid });
    expect(res.ok).toBe(false);
    expect(res.error).toBe("La cible n'est pas au contact.");
  });

  it('le clic emporte la case de départ, et le coup porte', () => {
    const { state, combat, a, c } = duel();
    const action = actionAssaut(combat, a, c);
    expect(action).not.toBeNull();
    if (!action) return;
    expect(action.kind).toBe('attack');
    expect('from' in action && action.from).toBeTruthy();
    const res = applyCombatAction(state, action);
    expect(res.ok).toBe(true);
    /* La pile a réellement marché avant de frapper. */
    expect(a.at).not.toEqual({ col: 3, row: 5 });
  });

  it('départage par l’angle les approches qui coûtent le même prix', () => {
    const { combat, a, c } = corpsACorps();
    const cases = reachableAttackHexes(combat, a, c);
    const cout = cases[0].cost; // `reachableAttackHexes` trie par coût croissant
    const angles = cases
      .filter((x) => x.cost === cout)
      .map((x) => attackAngle(c.at, c.facing, x.at));
    /* Le décor doit bien poser un choix, sinon le test ne garde rien. */
    expect(new Set(angles).size).toBeGreaterThan(1);

    const approche = choisirApproche(combat, a, c);
    expect(approche).not.toBeNull();
    if (!approche) return;
    expect(approche.cout).toBe(cout);
    expect(approche.angle).toBe(angles.includes('dos') ? 'dos' : 'flanc');
  });

  it('ne prend jamais un chemin plus long pour un meilleur angle', () => {
    /* Assaillant déjà au contact, de face : le dos est derrière la cible,
       à plusieurs pas. Rester sur place ne coûte rien et doit l'emporter. */
    const { combat, a, c } = duel();
    a.at = { col: 7, row: 5 };
    const approche = choisirApproche(combat, a, c);
    expect(approche).not.toBeNull();
    if (!approche) return;
    expect(approche.cout).toBe(0);
    expect(approche.at).toEqual({ col: 7, row: 5 });
  });

  it('rend null quand la cible est hors d’atteinte, et rien n’est émis', () => {
    const { combat, a, c } = duel();
    a.at = { col: 0, row: 0 };
    c.at = { col: 14, row: 10 };
    expect(choisirApproche(combat, a, c)).toBeNull();
    expect(actionAssaut(combat, a, c)).toBeNull();
  });
});

/* ═══════════════ D3 — l'aperçu compte depuis la case d'approche ══════════ */

describe('l’aperçu ne ment plus sur un assaut avec déplacement', () => {
  it('compte la charge et la case de départ, pas la position actuelle', () => {
    const { combat, a, c } = duel();
    const approche = choisirApproche(combat, a, c);
    expect(approche).not.toBeNull();
    if (!approche) return;
    expect(approche.cout).toBeGreaterThan(0); // il faut bien marcher

    const surPlace = construireApercu(combat, a, c, false);
    const honnete = construireApercu(combat, a, c, false, approche);

    /* Le Sanglier Cuirassé charge : la course compte, et l'aperçu la taisait. */
    expect(surPlace.modifiers.some((m) => m.label.startsWith('Charge sur'))).toBe(false);
    expect(honnete.modifiers.some((m) => m.label === `Charge sur ${approche.cout} hexagones`))
      .toBe(true);
    expect(honnete.damage.max).toBeGreaterThan(surPlace.damage.max);
    expect(honnete.from).toEqual(approche.at);
    expect(honnete.approach).toBe(approche.cout);
    expect(honnete.reachable).toBe(true);
  });

  it('annonce le coup que le moteur portera réellement', () => {
    const { state, combat, a, c } = duel();
    const approche = choisirApproche(combat, a, c);
    if (!approche) throw new Error('approche introuvable');
    const annonce = construireApercu(combat, a, c, false, approche);

    const res = applyCombatAction(state, {
      kind: 'attack',
      unit: a.uid,
      target: c.uid,
      from: approche.at,
    });
    expect(res.ok).toBe(true);
    const coup = combat.log.find((l) => l.kind === 'attaque' && l.detail?.attaquant === a.uid);
    const reel = coup?.detail?.degats;
    expect(typeof reel).toBe('number');
    if (typeof reel !== 'number') return;
    expect(reel).toBeGreaterThanOrEqual(annonce.damage.min);
    expect(reel).toBeLessThanOrEqual(annonce.damage.max);
  });

  it('marque la cible hors d’atteinte au lieu de laisser croire à un assaut', () => {
    const { combat, a, c } = duel();
    a.at = { col: 0, row: 0 };
    c.at = { col: 14, row: 10 };
    const apercu = construireApercu(combat, a, c, false, choisirApproche(combat, a, c));
    expect(apercu.reachable).toBe(false);
  });

  it('chiffre la riposte au lieu de la réduire à un booléen', () => {
    const { combat, a, c } = duel();
    const apercu = construireApercu(combat, a, c, false, choisirApproche(combat, a, c));
    expect(apercu.retaliation).toBe(true);
    expect(apercu.retaliationDamage).not.toBeNull();
    expect(apercu.retaliationDamage?.max).toBeGreaterThan(0);
  });
});

/* ══════════════════════ Bonus — le round en romain ═══════════════════════ */

describe('le cartouche du round', () => {
  it('emploie les chiffres romains, comme sa documentation le promet', () => {
    expect(libelleRound(1)).toBe('I');
    expect(libelleRound(4)).toBe('IV');
    expect(libelleRound(9)).toBe('IX');
    expect(libelleRound(14)).toBe('XIV');
    expect(libelleRound(40)).toBe('XL');
    expect(libelleRound(49)).toBe('XLIX');
    expect(libelleRound(60)).toBe('LX');
  });

  it('n’invente pas de round zéro : la bataille n’a pas encore commencé', () => {
    expect(libelleRound(0)).toBe('—');
    /* `romain` seul, lui, borne à I : c'est justement pourquoi le cartouche
       ne l'appelle pas directement sur un round nul. */
    expect(romain(0)).toBe('I');
  });
});
