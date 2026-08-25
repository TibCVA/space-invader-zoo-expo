/**
 * LES TROIS COMMANDES DE LA FICHE DE HÉROS.
 *
 * Le défaut gardé ici n'est pas un calcul faux : c'est une absence. Mesuré sur
 * l'arbre du client, hors tests, avant ce travail :
 *
 * ```
 * SwapArmy 0   EquipArtifact 0   UnequipArtifact 0   ChooseLevelUp 0
 * ```
 *
 * Ces tests tiennent les décisions de la fiche. Ils ne prouvent pas qu'un
 * bouton existe — une fonction pure ne peut pas le prouver, et c'est
 * exactement le genre de confiance qui laisse passer une absence. Ce qu'ils
 * prouvent, et que rien d'autre ne prouvait, c'est que **les commandes
 * fabriquées ici sont acceptées par le moteur et produisent l'effet annoncé** :
 * chaque bloc se termine par un `applyCommand` réel sur une vraie partie.
 *
 * ## Comment ils ont été éprouvés
 *
 * Vingt-trois défaites tentées sur `heros-actions.ts`, une édition ciblée à la
 * fois : chacune a fait rougir le test qui la gardait, et le rapport les liste.
 * L'une d'elles a d'abord échoué à rougir — muter `perdSaPile` ne changeait
 * rien tant que la branche « échanger » retournait `videLeHeros: false` écrit
 * en dur. Le test n'était pas en cause, le code l'était : la valeur est
 * maintenant calculée une seule fois et utilisée par les trois gestes, et la
 * même défaite rougit.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { applyCommand, createGame, grantXp, skillRank } from '@auvergne/engine';
import type { ArmyStack, GameState, HeroInstance, WorldMap } from '@auvergne/engine';
import { setupDemo, GRAINE_DEMO } from '../state/demo.js';
import {
  besaceDuHeros,
  choixDeNiveau,
  commandeDeNiveau,
  commandeDeRetrait,
  commandeDequipement,
  delogePar,
  echangeDePiles,
  mainSurLeHeros,
  rangeesDArmee,
  bornerEmport,
} from './heros-actions.js';

let world: WorldMap;

beforeAll(() => {
  bootstrapEngine();
  world = buildWorld(GRAINE_DEMO);
});

/** Une partie neuve, la main donnée à la bannière du héros que l'on teste. */
function partie(): { jeu: GameState; heros: HeroInstance } {
  const jeu = createGame(setupDemo(), world);
  const heros = jeu.heroes[jeu.players[jeu.activePlayer].heroes[0]];
  return { jeu, heros };
}

/** Le regard du magasin quand tout va bien : cette partie, cette bannière. */
function magasinOuvert(jeu: GameState, heros: HeroInstance) {
  return { game: jeu, localPlayer: heros.owner };
}

/* ═══════════════════════ 1. Qui a le droit d'agir ═══════════════════════ */

describe('la main sur le héros', () => {
  it('s’ouvre sur sa propre bannière, à son tour, hors combat', () => {
    const { jeu, heros } = partie();
    expect(mainSurLeHeros(jeu, magasinOuvert(jeu, heros), heros.uid).ouverte).toBe(true);
  });

  it('reste fermée sur une fiche de démonstration, qui n’est pas l’état du magasin', () => {
    const { jeu, heros } = partie();
    /* Même partie, autre objet : c'est le cas exact de `#/demo/heros`. */
    const autre = createGame(setupDemo(), world);
    const main = mainSurLeHeros(autre, magasinOuvert(jeu, heros), heros.uid);
    expect(main.ouverte).toBe(false);
    if (!main.ouverte) expect(main.raison).toMatch(/démonstration/);
  });

  it('reste fermée quand aucune partie n’est chargée', () => {
    const { jeu, heros } = partie();
    expect(mainSurLeHeros(jeu, { game: null, localPlayer: heros.owner }, heros.uid).ouverte).toBe(
      false,
    );
  });

  it('reste fermée sur le héros d’une autre bannière', () => {
    const { jeu, heros } = partie();
    const adverse = Object.values(jeu.heroes).find((h) => h.owner !== heros.owner);
    expect(adverse, 'la partie de démonstration doit compter deux bannières').toBeTruthy();
    const main = mainSurLeHeros(jeu, magasinOuvert(jeu, heros), (adverse as HeroInstance).uid);
    expect(main.ouverte).toBe(false);
    if (!main.ouverte) expect(main.raison).toMatch(/bannière/);
  });

  it('reste fermée quand la main est à un autre cousin, et dit qui', () => {
    const { jeu, heros } = partie();
    const autre = jeu.turnOrder.find((p) => p !== heros.owner);
    expect(autre, 'la partie doit compter un second joueur').toBeTruthy();
    jeu.activePlayer = autre as typeof jeu.activePlayer;
    const main = mainSurLeHeros(jeu, magasinOuvert(jeu, heros), heros.uid);
    expect(main.ouverte).toBe(false);
    if (!main.ouverte) expect(main.raison).toContain(jeu.players[jeu.activePlayer].name);
  });

  it('reste fermée pendant un combat : on ne réarme pas au milieu d’une bataille', () => {
    const { jeu, heros } = partie();
    jeu.phase = 'combat';
    expect(mainSurLeHeros(jeu, magasinOuvert(jeu, heros), heros.uid).ouverte).toBe(false);
  });

  it('reste fermée une fois la partie terminée', () => {
    const { jeu, heros } = partie();
    jeu.phase = 'termine';
    expect(mainSurLeHeros(jeu, magasinOuvert(jeu, heros), heros.uid).ouverte).toBe(false);
  });

  it('reste fermée sur un héros encore abattu, et annonce son retour', () => {
    const { jeu, heros } = partie();
    heros.downUntilTurn = jeu.turn + 3;
    const main = mainSurLeHeros(jeu, magasinOuvert(jeu, heros), heros.uid);
    expect(main.ouverte).toBe(false);
    if (!main.ouverte) expect(main.raison).toContain(String(jeu.turn + 3));
  });
});

/* ═════════════════════════ 2. Montée de niveau ══════════════════════════ */

describe('le choix de montée de niveau', () => {
  it('n’offre rien tant qu’aucune montée n’attend', () => {
    const { heros } = partie();
    expect(heros.pendingLevelUp).toBeNull();
    expect(choixDeNiveau(heros)).toBeNull();
  });

  it('offre les deux voies tirées par le moteur, avec leurs effets', () => {
    const { jeu, heros } = partie();
    grantXp(jeu, heros, 5000);
    const pending = heros.pendingLevelUp;
    expect(pending, 'cinq mille points doivent faire monter un héros de niveau 1').toBeTruthy();

    const choix = choixDeNiveau(heros);
    expect(choix).toBeTruthy();
    if (!choix || !pending) return;

    expect(choix.voies.map((v) => v.skill)).toEqual(pending.choices.map((c) => c.skill));
    for (const voie of choix.voies) {
      expect(voie.titre).not.toBe('');
      expect(voie.effets.length, `${voie.skill} doit annoncer au moins un effet`).toBeGreaterThan(0);
    }
  });

  it('nomme la caractéristique déjà accordée par la montée', () => {
    const { jeu, heros } = partie();
    grantXp(jeu, heros, 5000);
    const choix = choixDeNiveau(heros);
    expect(choix?.primaire).toBeTruthy();
    /* Le libellé est français, jamais la clef technique du moteur. */
    expect(choix?.primaire).not.toBe(heros.pendingLevelUp?.primary);
  });

  it('lit le rang déjà tenu : une montée de rang n’est pas une compétence neuve', () => {
    const { jeu, heros } = partie();
    grantXp(jeu, heros, 5000);
    const choix = choixDeNiveau(heros);
    expect(choix).toBeTruthy();
    if (!choix) return;
    for (const voie of choix.voies) {
      expect(voie.rangActuel).toBe(skillRank(heros, voie.skill));
      /* Le moteur ne propose qu'un rang immédiatement supérieur. */
      expect(voie.rank).toBe(voie.rangActuel + 1);
    }
    const connues = choix.voies.filter((v) => v.rangActuel > 0);
    expect(
      connues.length > 0,
      'le tirage garantit une montée de rang quand le héros en a une de disponible',
    ).toBe(true);
  });

  it('ne montre qu’une voie quand le moteur propose deux fois la même', () => {
    const { jeu, heros } = partie();
    grantXp(jeu, heros, 5000);
    const pending = heros.pendingLevelUp;
    expect(pending).toBeTruthy();
    if (!pending) return;
    /* `rollSkillOffers` retombe deux fois sur la même offre quand le héros n'a
       plus qu'un candidat : deux boutons identiques feraient croire à un choix. */
    pending.choices = [{ ...pending.choices[0] }, { ...pending.choices[0] }];
    expect(choixDeNiveau(heros)?.voies).toHaveLength(1);
  });

  it('fabrique une commande que le moteur accepte, et la compétence monte', () => {
    const { jeu, heros } = partie();
    grantXp(jeu, heros, 5000);
    const choix = choixDeNiveau(heros);
    expect(choix).toBeTruthy();
    if (!choix) return;

    /* On prend la SECONDE voie quand elle existe : la première est celle que
       `leveling.ts:288-290` appliquait d'office, et un test qui la choisit ne
       distinguerait pas le choix du joueur de la résolution automatique. */
    const voie = choix.voies[choix.voies.length - 1];
    const avant = skillRank(heros, voie.skill);

    const res = applyCommand(jeu, commandeDeNiveau(heros, voie.skill), world);
    expect(res.ok, res.error).toBe(true);

    const apres = res.state.heroes[heros.uid];
    expect(skillRank(apres, voie.skill)).toBe(avant + 1);
    expect(apres.pendingLevelUp).toBeNull();
  });

  it('refuse une compétence hors des deux propositions — le moteur garde la porte', () => {
    const { jeu, heros } = partie();
    grantXp(jeu, heros, 5000);
    const res = applyCommand(jeu, commandeDeNiveau(heros, 'compétence_inventée'), world);
    expect(res.ok).toBe(false);
  });
});

/* ═══════════════════════════ 3. Artefacts ═══════════════════════════════ */

describe('la besace et les emplacements', () => {
  it('est vide quand la besace l’est', () => {
    const { heros } = partie();
    expect(heros.backpack).toHaveLength(0);
    expect(besaceDuHeros(heros)).toHaveLength(0);
  });

  it('ouvre les deux anneaux à une bague, un seul emplacement au reste', () => {
    const { heros } = partie();
    heros.backpack.push('anneau_de_cuivre', 'heaume_du_banneret');
    const besace = besaceDuHeros(heros);

    const bague = besace[0];
    expect(bague.emplacements.map((e) => e.slot)).toEqual(['anneau1', 'anneau2']);
    expect(bague.emplacements[0].nom).not.toBe('anneau1');

    const heaume = besace[1];
    expect(heaume.emplacements.map((e) => e.slot)).toEqual(['tete']);
  });

  it('distingue deux exemplaires du même artefact par leur rang', () => {
    const { heros } = partie();
    heros.backpack.push('anneau_de_cuivre', 'anneau_de_cuivre');
    expect(besaceDuHeros(heros).map((p) => p.rang)).toEqual([0, 1]);
  });

  it('vise le premier emplacement libre, puis se rabat sur le premier admissible', () => {
    const { heros } = partie();
    heros.backpack.push('anneau_de_cuivre');
    expect(besaceDuHeros(heros)[0].cible).toBe('anneau1');

    heros.artifacts.anneau1 = 'anneau_des_sources';
    expect(besaceDuHeros(heros)[0].cible).toBe('anneau2');

    heros.artifacts.anneau2 = 'anneau_de_fortune';
    expect(besaceDuHeros(heros)[0].cible).toBe('anneau1');
    expect(delogePar(heros, 'anneau1')).toBe('anneau_des_sources');
  });

  it('ne déloge rien sur un emplacement libre', () => {
    const { heros } = partie();
    expect(delogePar(heros, 'tete')).toBeNull();
  });

  it('rapporte le refus du moteur pour un objet hors codex', () => {
    const { heros } = partie();
    heros.backpack.push('objet_qui_nexiste_pas');
    const piece = besaceDuHeros(heros)[0];
    expect(piece.refus).toBeTruthy();
    expect(piece.emplacements).toHaveLength(0);
    expect(piece.cible).toBeNull();
  });

  it('fabrique un équipement que le moteur accepte, besace et emplacement suivis', () => {
    const { jeu, heros } = partie();
    heros.backpack.push('heaume_du_banneret');
    const piece = besaceDuHeros(heros)[0];
    expect(piece.cible).toBe('tete');
    if (!piece.cible) return;

    const res = applyCommand(jeu, commandeDequipement(heros, piece.id, piece.cible), world);
    expect(res.ok, res.error).toBe(true);
    const apres = res.state.heroes[heros.uid];
    expect(apres.artifacts.tete).toBe('heaume_du_banneret');
    expect(apres.backpack).not.toContain('heaume_du_banneret');
  });

  it('renvoie en besace la pièce délogée, et le moteur le confirme', () => {
    const { jeu, heros } = partie();
    heros.artifacts.anneau1 = 'anneau_des_sources';
    heros.artifacts.anneau2 = 'anneau_de_fortune';
    heros.backpack.push('anneau_de_cuivre');
    const piece = besaceDuHeros(heros)[0];
    expect(piece.cible).toBe('anneau1');
    const delogee = delogePar(heros, 'anneau1');

    const res = applyCommand(jeu, commandeDequipement(heros, piece.id, 'anneau1'), world);
    expect(res.ok, res.error).toBe(true);
    const apres = res.state.heroes[heros.uid];
    expect(apres.artifacts.anneau1).toBe('anneau_de_cuivre');
    expect(apres.backpack).toContain(delogee);
  });

  it('fabrique un retrait que le moteur accepte', () => {
    const { jeu, heros } = partie();
    heros.artifacts.tete = 'heaume_du_banneret';
    const res = applyCommand(jeu, commandeDeRetrait(heros, 'tete'), world);
    expect(res.ok, res.error).toBe(true);
    const apres = res.state.heroes[heros.uid];
    expect(apres.artifacts.tete).toBeUndefined();
    expect(apres.backpack).toContain('heaume_du_banneret');
  });
});

/* ══════════════════════════ 4. Armée ════════════════════════════════════ */

/** Pose le héros sur la case de sa cité, comme le fait `movement.ts:315`. */
function enCite(jeu: GameState, heros: HeroInstance): string {
  const uid = jeu.players[heros.owner].towns[0];
  expect(uid, 'la bannière doit posséder une cité').toBeTruthy();
  const town = jeu.towns[uid];
  heros.at = { col: town.at.col, row: town.at.row };
  heros.inTown = town.uid;
  town.visitingHero = heros.uid;
  return uid;
}

describe('les rangées d’armée', () => {
  it('n’en montre qu’une hors des murs', () => {
    const { jeu, heros } = partie();
    expect(heros.inTown).toBeNull();
    const rangees = rangeesDArmee(jeu, heros);
    expect(rangees).toHaveLength(1);
    expect(rangees[0].ref).toEqual({ kind: 'hero', uid: heros.uid });
    expect(rangees[0].piles).toHaveLength(7);
  });

  it('ajoute la garnison quand le héros se tient dans sa cité', () => {
    const { jeu, heros } = partie();
    const uid = enCite(jeu, heros);
    const rangees = rangeesDArmee(jeu, heros);
    expect(rangees).toHaveLength(2);
    expect(rangees[1].ref).toEqual({ kind: 'garrison', uid });
    expect(rangees[1].titre).toContain(jeu.towns[uid].name);
  });

  it('retire la garnison si la cité a changé de bannière', () => {
    const { jeu, heros } = partie();
    const uid = enCite(jeu, heros);
    jeu.towns[uid].owner = jeu.turnOrder.find((p) => p !== heros.owner) ?? null;
    expect(rangeesDArmee(jeu, heros)).toHaveLength(1);
  });

  it('retire la garnison si le héros n’est plus sur la case de la cité', () => {
    const { jeu, heros } = partie();
    enCite(jeu, heros);
    heros.at = { col: heros.at.col + 1, row: heros.at.row };
    expect(rangeesDArmee(jeu, heros)).toHaveLength(1);
  });
});

describe('l’échange de piles', () => {
  it('annule quand on reclique la pile choisie', () => {
    const { jeu, heros } = partie();
    const r = rangeesDArmee(jeu, heros);
    const p = { ref: r[0].ref, slot: 0 };
    expect(echangeDePiles(r, p, p).quoi).toBe('annule');
  });

  it('refuse de partir d’un emplacement vide', () => {
    const { jeu, heros } = partie();
    const r = rangeesDArmee(jeu, heros);
    const vide = heros.army.findIndex((s) => s === null);
    expect(vide).toBeGreaterThan(0);
    const e = echangeDePiles(r, { ref: r[0].ref, slot: vide }, { ref: r[0].ref, slot: 0 });
    expect(e.quoi).toBe('refus');
  });

  it('déplace vers un emplacement libre, et le moteur suit', () => {
    const { jeu, heros } = partie();
    const r = rangeesDArmee(jeu, heros);
    const vide = heros.army.findIndex((s) => s === null);
    const pile = heros.army[0] as ArmyStack;

    const e = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[0].ref, slot: vide });
    expect(e.quoi).toBe('commande');
    if (e.quoi !== 'commande') return;
    expect(e.geste).toBe('deplace');
    expect(e.videLeHeros).toBe(false);

    const res = applyCommand(jeu, e.commande, world);
    expect(res.ok, res.error).toBe(true);
    const apres = res.state.heroes[heros.uid];
    expect(apres.army[0]).toBeNull();
    expect(apres.army[vide]).toEqual(pile);
  });

  it('réunit deux piles de la même créature, et le moteur additionne', () => {
    const { jeu, heros } = partie();
    const creature = (heros.army[0] as ArmyStack).creature;
    heros.army[0] = { creature, count: 5 };
    heros.army[2] = { creature, count: 7 };
    const r = rangeesDArmee(jeu, heros);

    const e = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[0].ref, slot: 2 });
    expect(e.quoi).toBe('commande');
    if (e.quoi !== 'commande') return;
    expect(e.geste).toBe('fusionne');

    const res = applyCommand(jeu, e.commande, world);
    expect(res.ok, res.error).toBe(true);
    const apres = res.state.heroes[heros.uid];
    expect(apres.army[0]).toBeNull();
    expect(apres.army[2]).toEqual({ creature, count: 12 });
  });

  it('échange deux créatures différentes, et le moteur permute', () => {
    const { jeu, heros } = partie();
    const a = heros.army[0] as ArmyStack;
    const b = heros.army[1] as ArmyStack;
    expect(a.creature).not.toBe(b.creature);
    const r = rangeesDArmee(jeu, heros);

    const e = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[0].ref, slot: 1 });
    expect(e.quoi).toBe('commande');
    if (e.quoi !== 'commande') return;
    expect(e.geste).toBe('echange');
    expect(e.videLeHeros).toBe(false);

    const res = applyCommand(jeu, e.commande, world);
    expect(res.ok, res.error).toBe(true);
    const apres = res.state.heroes[heros.uid];
    expect(apres.army[0]).toEqual(b);
    expect(apres.army[1]).toEqual(a);
  });

  it('passe une pile du héros à la garnison, et le moteur l’y range', () => {
    const { jeu, heros } = partie();
    const uid = enCite(jeu, heros);
    const r = rangeesDArmee(jeu, heros);
    const pile = heros.army[0] as ArmyStack;

    const e = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[1].ref, slot: 0 });
    expect(e.quoi).toBe('commande');
    if (e.quoi !== 'commande') return;

    const res = applyCommand(jeu, e.commande, world);
    expect(res.ok, res.error).toBe(true);
    expect(res.state.heroes[heros.uid].army[0]).toBeNull();
    expect(res.state.towns[uid].garrison[0]).toEqual(pile);
  });

  it('avertit quand la pile qui sort est la dernière du héros', () => {
    const { jeu, heros } = partie();
    enCite(jeu, heros);
    for (let i = 1; i < heros.army.length; i++) heros.army[i] = null;
    const r = rangeesDArmee(jeu, heros);

    const e = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[1].ref, slot: 0 });
    expect(e.quoi).toBe('commande');
    if (e.quoi !== 'commande') return;
    expect(e.videLeHeros).toBe(true);
  });

  it('avertit aussi quand la dernière pile part se fondre dans une pile jumelle', () => {
    const { jeu, heros } = partie();
    const uid = enCite(jeu, heros);
    const creature = (heros.army[0] as ArmyStack).creature;
    for (let i = 1; i < heros.army.length; i++) heros.army[i] = null;
    jeu.towns[uid].garrison[0] = { creature, count: 3 };
    const r = rangeesDArmee(jeu, heros);

    const e = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[1].ref, slot: 0 });
    expect(e.quoi).toBe('commande');
    if (e.quoi !== 'commande') return;
    expect(e.geste).toBe('fusionne');
    expect(e.videLeHeros).toBe(true);
  });

  it('n’avertit pas pour un échange, qui rend une pile en retour', () => {
    const { jeu, heros } = partie();
    const uid = enCite(jeu, heros);
    const autre = Object.values(jeu.heroes).find((h) => h.owner !== heros.owner) as HeroInstance;
    jeu.towns[uid].garrison[0] = { ...(autre.army[0] as ArmyStack) };
    for (let i = 1; i < heros.army.length; i++) heros.army[i] = null;
    const r = rangeesDArmee(jeu, heros);

    const e = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[1].ref, slot: 0 });
    expect(e.quoi).toBe('commande');
    if (e.quoi !== 'commande') return;
    expect(e.geste).toBe('echange');
    expect(e.videLeHeros).toBe(false);
  });

  it('n’avertit pas pour un rangement interne, qui ne fait rien sortir', () => {
    const { jeu, heros } = partie();
    enCite(jeu, heros);
    for (let i = 1; i < heros.army.length; i++) heros.army[i] = null;
    const r = rangeesDArmee(jeu, heros);

    const e = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[0].ref, slot: 3 });
    expect(e.quoi).toBe('commande');
    if (e.quoi !== 'commande') return;
    expect(e.videLeHeros).toBe(false);
  });
});

/**
 * LA DÉCOUPE DE PILE — le geste quotidien de HMM3 qui manquait.
 *
 * Mesuré avant le correctif : `SwapArmy` était émis SANS `count`
 * (heros-actions.ts:336), donc aucune découpe possible depuis l'interface,
 * alors que le moteur la gère depuis toujours (apply.ts:531-548 : fusion
 * partielle, pose partielle sur du vide, refus du fractionnement sur une
 * créature différente). Sans découpe : pas de garnison qu'on garnit sans se
 * vider, pas de chair à canon d'une créature, pas de chaîne de héros.
 *
 * Chaque bloc se termine par un `applyCommand` réel : la garde tient le
 * CONTRAT entre ce que l'écran propose et ce que le moteur fait.
 */
describe('découpe de pile', () => {
  it('bornerEmport ramène toute saisie douteuse à « tout »', () => {
    expect(bornerEmport(12, undefined)).toBe(12);
    expect(bornerEmport(12, Number.NaN)).toBe(12);
    expect(bornerEmport(12, 0)).toBe(12);
    expect(bornerEmport(12, -3)).toBe(12);
    expect(bornerEmport(12, 99)).toBe(12);
    expect(bornerEmport(12, 12)).toBe(12);
    expect(bornerEmport(12, 5)).toBe(5);
    expect(bornerEmport(12, 5.9)).toBe(5);
  });

  it('détache une partie sur un emplacement libre, et le moteur scinde', () => {
    const { jeu, heros } = partie();
    const creature = (heros.army[0] as ArmyStack).creature;
    heros.army[0] = { creature, count: 10 };
    const vide = heros.army.findIndex((s) => s === null);
    const r = rangeesDArmee(jeu, heros);

    const e = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[0].ref, slot: vide }, 3);
    expect(e.quoi).toBe('commande');
    if (e.quoi !== 'commande') return;
    expect(e.geste).toBe('scinde');
    expect(e.libelle).toContain('Détacher 3');
    expect('count' in e.commande && e.commande.count).toBe(3);

    const res = applyCommand(jeu, e.commande, world);
    expect(res.ok, res.error).toBe(true);
    const apres = res.state.heroes[heros.uid];
    expect(apres.army[0]).toEqual({ creature, count: 7 });
    expect(apres.army[vide]).toEqual({ creature, count: 3 });
  });

  it('envoie une partie rejoindre la même créature, et le moteur additionne', () => {
    const { jeu, heros } = partie();
    const creature = (heros.army[0] as ArmyStack).creature;
    heros.army[0] = { creature, count: 10 };
    heros.army[2] = { creature, count: 4 };
    const r = rangeesDArmee(jeu, heros);

    const e = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[0].ref, slot: 2 }, 6);
    expect(e.quoi).toBe('commande');
    if (e.quoi !== 'commande') return;
    expect(e.geste).toBe('scinde');

    const res = applyCommand(jeu, e.commande, world);
    expect(res.ok, res.error).toBe(true);
    const apres = res.state.heroes[heros.uid];
    expect(apres.army[0]).toEqual({ creature, count: 4 });
    expect(apres.army[2]).toEqual({ creature, count: 10 });
  });

  it('refuse AVANT le moteur de poser une partie sur une créature différente', () => {
    const { jeu, heros } = partie();
    const a = heros.army[0] as ArmyStack;
    heros.army[0] = { creature: a.creature, count: 8 };
    const b = heros.army[1] as ArmyStack;
    expect(b.creature).not.toBe(a.creature);
    const r = rangeesDArmee(jeu, heros);

    const e = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[0].ref, slot: 1 }, 3);
    /* Le refus est dit ICI, dans les mots du joueur — jamais laissé au
       moteur, dont la phrase supposerait qu'on sait ce qu'est « fractionner ». */
    expect(e.quoi).toBe('refus');
    if (e.quoi !== 'refus') return;
    expect(e.raison).toContain('emplacement libre');
  });

  it('une saisie à l’effectif complet rend EXACTEMENT la commande d’avant', () => {
    const { jeu, heros } = partie();
    const vide = heros.army.findIndex((s) => s === null);
    const r = rangeesDArmee(jeu, heros);
    const pleine = echangeDePiles(r, { ref: r[0].ref, slot: 0 }, { ref: r[0].ref, slot: vide });
    const saisie = echangeDePiles(
      r,
      { ref: r[0].ref, slot: 0 },
      { ref: r[0].ref, slot: vide },
      (heros.army[0] as ArmyStack).count,
    );
    expect(pleine.quoi).toBe('commande');
    expect(saisie.quoi).toBe('commande');
    if (pleine.quoi !== 'commande' || saisie.quoi !== 'commande') return;
    /* `count` OMIS dans les deux cas : le chemin d'avant la découpe est
       intouché, et les trente-huit gardes qui le tiennent gardent leur objet. */
    expect('count' in saisie.commande).toBe(false);
    expect(saisie.commande).toEqual(pleine.commande);
    expect(saisie.geste).toBe('deplace');
  });

  it('une découpe ne vide JAMAIS le héros', () => {
    const { jeu, heros } = partie();
    /* Le pire cas : une seule pile, qu'on détache vers la garnison. */
    const creature = (heros.army[0] as ArmyStack).creature;
    for (let i = 0; i < heros.army.length; i += 1) heros.army[i] = null;
    heros.army[0] = { creature, count: 6 };
    const cite = Object.values(jeu.towns).find((t) => t.owner === heros.owner);
    expect(cite).toBeDefined();
    if (!cite) return;
    heros.at = { ...cite.at };
    heros.inTown = cite.uid;
    const r = rangeesDArmee(jeu, heros);
    expect(r.length).toBe(2);
    const videGarnison = cite.garrison.findIndex((s) => s === null);

    const partielle = echangeDePiles(
      r,
      { ref: r[0].ref, slot: 0 },
      { ref: r[1].ref, slot: videGarnison },
      2,
    );
    expect(partielle.quoi).toBe('commande');
    if (partielle.quoi !== 'commande') return;
    expect(partielle.videLeHeros).toBe(false);

    /* La même pile, ENTIÈRE, vide bel et bien le héros : la confirmation
       reste demandée là où elle protège quelque chose. */
    const entiere = echangeDePiles(
      r,
      { ref: r[0].ref, slot: 0 },
      { ref: r[1].ref, slot: videGarnison },
    );
    expect(entiere.quoi).toBe('commande');
    if (entiere.quoi !== 'commande') return;
    expect(entiere.videLeHeros).toBe(true);
  });
});
