/**
 * La fiche d'inspection : force, types d'unités, difficulté.
 *
 * ## Ce que ce fichier garde
 *
 * 1. **L'échelle des paquets est continue et croissante.** Un trou entre deux
 *    crans rendrait `undefined` sur un effectif parfaitement ordinaire, et la
 *    fiche afficherait « undefined Piqueurs ». Les bornes se touchent, et le
 *    dernier cran est ouvert.
 *
 * 2. **Aucun nombre ne fuit quand on n'a pas la vision.** C'est tout l'intérêt
 *    du procédé de HMM3 : on décide sur un renseignement incomplet. Le test
 *    vérifie qu'aucun chiffre n'apparaît dans les quantités affichées, ni
 *    l'effectif exact dans la donnée — pas même en filigrane par une fourchette
 *    de puissance réduite à un point.
 *
 * 3. **La vision fait tomber le voile**, et la Reconnaissance aussi : c'est le
 *    Scouting de HMM3, et c'est ce qui donne un prix au renseignement.
 *
 * 4. **La difficulté se mesure à l'armée du héros de référence**, et se tait
 *    quand il n'y en a pas — dire « hors de portée » à un joueur qui n'a rien
 *    sélectionné serait un renseignement faux.
 *
 * 5. **Une même créature ne se compte qu'une fois.** Le générateur pose
 *    volontiers deux emplacements de la même créature sur un lieu — soixante-
 *    trois des cent soixante-cinq lieux gardés de la carte de démonstration. La
 *    répartition en emplacements ne doit rien changer à ce que la fiche dit :
 *    ni la liste des lignes, ni la fourchette, ni la pastille.
 *
 * 6. **On ne jauge pas ce qu'on tient déjà.** Sa propre cité, sa propre mine,
 *    son propre héros : aucune pastille, aucune ligne de juge.
 *
 * 7. **On ne jauge pas ce qui n'oppose personne.** Un gisement que rien ne
 *    garde n'est pas un combat facile, c'est l'absence de combat.
 *
 * ## Comment il a été éprouvé
 *
 * En défaisant chaque garde (voir le rapport) : rendre l'effectif exact dans
 * `estimerPiles` sans vision fait rougir le point 2 ; retirer la lecture du
 * voile fait rougir le point 3 ; rendre `sans_peril` au lieu de `inconnue`
 * quand la puissance du héros est nulle fait rougir le point 4 ; décaler d'une
 * unité une borne de `PAQUETS` fait rougir le point 1 ; retirer l'appel à
 * `regrouperParCreature` en tête de `estimerPiles` fait rougir les trois tests
 * du point 5 ; retirer `aMoi` puis `!force` de la garde de `jugement` fait
 * rougir les points 6 et 7 séparément.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { armyPower, createGame } from '@auvergne/engine';
import type {
  ArmyStack,
  CreatureId,
  GameState,
  HeroInstance,
  MapObject,
  WorldMap,
} from '@auvergne/engine';
import { setupDemo, GRAINE_DEMO } from '../state/demo.js';
import {
  PAQUETS,
  difficulteDe,
  ficheDeLaCite,
  ficheDuHeros,
  ficheDuLieu,
  forceEnMots,
  forceMediane,
  paquetDe,
  sousTitreDe,
  visionExacte,
} from './estimation.js';
import type { Regard } from './estimation.js';

let world: WorldMap;

function partie(): GameState {
  return createGame(setupDemo(), world);
}

beforeAll(() => {
  bootstrapEngine();
  world = buildWorld(GRAINE_DEMO);
});

function regardAveugle(state: GameState, heros: HeroInstance | null): Regard {
  return { moi: 'P1', fog: new Uint8Array(world.cols * world.rows), cols: world.cols, heros };
}

/** Le même regard, mais la case visée est sous les yeux : les effectifs se comptent. */
function regardVoyant(state: GameState, at: { col: number; row: number }): Regard {
  const fog = new Uint8Array(world.cols * world.rows);
  fog[at.row * world.cols + at.col] = 2;
  return { moi: 'P1', fog, cols: world.cols, heros: state.heroes[state.players.P1.heroes[0]] };
}

/** Le lieu le mieux gardé de la carte : soixante créatures de rang 5 à 7. */
function maisonDuTresor(): MapObject {
  const o = world.objects.find((q) => q.kind === 'maison_tresor');
  if (!o) throw new Error('la Maison du Trésor a disparu de la carte');
  return o;
}

/** Le lieu nommé de la carte de démonstration, ou une erreur qui le dit. */
function lieuNomme(nom: string): MapObject {
  const o = world.objects.find((q) => q.data.name === nom);
  if (!o) throw new Error(`${nom} a disparu de la carte de démonstration`);
  return o;
}

/**
 * Les lieux dont la garde pose deux emplacements de la même créature.
 *
 * Ce n'est pas une curiosité : soixante-trois des cent soixante-cinq lieux
 * gardés de la carte de démonstration sont dans ce cas. La liste est lue sur la
 * carte, jamais recopiée.
 */
function lieuxAGardeRedondante(state: GameState): MapObject[] {
  return world.objects.filter((o) => {
    const garde = (state.objects[o.uid] ?? o).guard ?? [];
    return garde.length > 0 && new Set(garde.map((s) => s.creature)).size < garde.length;
  });
}

/** Effectif total par créature d'une garde, dans l'ordre de première apparition. */
function totauxParCreature(garde: readonly ArmyStack[]): ArmyStack[] {
  const ordre: CreatureId[] = [];
  const totaux = new Map<CreatureId, number>();
  for (const s of garde) {
    if (!totaux.has(s.creature)) ordre.push(s.creature);
    totaux.set(s.creature, (totaux.get(s.creature) ?? 0) + s.count);
  }
  return ordre.map((creature) => ({ creature, count: totaux.get(creature) ?? 0 }));
}

/* ─────────────────────── 1. L'échelle des paquets ───────────────────────── */

describe('les paquets flous', () => {
  it('couvre tous les effectifs sans trou et sans chevauchement', () => {
    for (let i = 0; i < PAQUETS.length - 1; i += 1) {
      expect(PAQUETS[i].max + 1, `entre « ${PAQUETS[i].mot} » et « ${PAQUETS[i + 1].mot} »`).toBe(
        PAQUETS[i + 1].min,
      );
      expect(PAQUETS[i].min).toBeLessThan(PAQUETS[i].max);
    }
    expect(PAQUETS[0].min).toBe(1);
    expect(PAQUETS[PAQUETS.length - 1].max).toBe(Number.POSITIVE_INFINITY);
  });

  it('rend le bon mot sur chaque borne, basse et haute', () => {
    for (const p of PAQUETS) {
      expect(paquetDe(p.min).mot, `plancher de « ${p.mot} »`).toBe(p.mot);
      if (Number.isFinite(p.max)) {
        expect(paquetDe(p.max).mot, `plafond de « ${p.mot} »`).toBe(p.mot);
      }
    }
    expect(paquetDe(1_000_000).mot).toBe(PAQUETS[PAQUETS.length - 1].mot);
  });

  it('ne rend jamais rien, même sur un effectif absurde', () => {
    for (const n of [0, -12, 0.4, Number.NaN]) {
      expect(paquetDe(n)).toBeTruthy();
      expect(typeof paquetDe(n).mot).toBe('string');
    }
  });

  it('n’emploie aucun chiffre dans ses mots', () => {
    for (const p of PAQUETS) expect(p.mot).not.toMatch(/\d/);
  });
});

/* ────────────────────── 2. Ce qui fuit et ce qui ne fuit pas ────────────── */

describe('une garde qu’on n’a pas reconnue', () => {
  it('ne laisse échapper aucun effectif, ni en mots ni en donnée', () => {
    const state = partie();
    const heros = state.heroes[state.players.P1.heroes[0]];
    const fiche = ficheDuLieu(state, maisonDuTresor(), regardAveugle(state, heros));

    expect(fiche.piles.length).toBeGreaterThan(3);
    for (const pile of fiche.piles) {
      expect(pile.effectif, `${pile.nom} : effectif divulgué`).toBeNull();
      expect(pile.quantite, `${pile.nom} : chiffre dans la quantité`).not.toMatch(/\d/);
    }
    expect(fiche.force).toBeTruthy();
    expect(fiche.force!.exacte).toBe(false);
    /* Une fourchette réduite à un point divulguerait le nombre par la fenêtre. */
    expect(fiche.force!.max).toBeGreaterThan(fiche.force!.min);
  });

  it('encadre la vraie puissance : la fourchette contient la valeur du moteur', () => {
    const state = partie();
    const heros = state.heroes[state.players.P1.heroes[0]];
    const gabarit = maisonDuTresor();
    const vraie = armyPower(state.objects[gabarit.uid].guard ?? []);
    const fiche = ficheDuLieu(state, gabarit, regardAveugle(state, heros));
    expect(vraie).toBeGreaterThan(0);
    expect(fiche.force!.min).toBeLessThanOrEqual(vraie);
    expect(fiche.force!.max).toBeGreaterThanOrEqual(vraie);
  });

  it('nomme bien les types d’unités présentes, sans en oublier', () => {
    const state = partie();
    const gabarit = maisonDuTresor();
    const garde = state.objects[gabarit.uid].guard ?? [];
    const fiche = ficheDuLieu(state, gabarit, regardAveugle(state, null));
    expect(fiche.piles.map((p) => p.creature)).toEqual(garde.map((s) => s.creature));
    for (const pile of fiche.piles) expect(pile.nom.length).toBeGreaterThan(2);
  });

  it('dit en mots que la force est une estimation', () => {
    const state = partie();
    const fiche = ficheDuLieu(state, maisonDuTresor(), regardAveugle(state, null));
    expect(forceEnMots(fiche.force)).toMatch(/^entre /);
  });

  it('sépare les milliers par une espace que les polices du jeu savent dessiner', () => {
    /*
     * Mesuré sur la capture : « entre 85225 et 170526 ». `Intl` rend le
     * séparateur français en espace fine insécable (U+202F), qu'aucune des trois
     * familles du jeu ne dessine — glyphe absent, largeur nulle, séparateur
     * évaporé. Le nombre le plus consulté de la fiche redevenait illisible.
     */
    const state = partie();
    const mots = forceEnMots(ficheDuLieu(state, maisonDuTresor(), regardAveugle(state, null)).force);
    expect(mots).not.toContain('\u202F');
    expect(mots, mots).toMatch(/\d\u00A0\d/);
  });
});

describe('une garde qu’on a sous les yeux', () => {
  it('se compte au grain près', () => {
    const state = partie();
    const gabarit = maisonDuTresor();
    const garde = state.objects[gabarit.uid].guard ?? [];
    const fiche = ficheDuLieu(state, gabarit, regardVoyant(state, gabarit.at));

    expect(fiche.force!.exacte).toBe(true);
    expect(fiche.force!.min).toBe(fiche.force!.max);
    expect(fiche.force!.min).toBe(armyPower(garde));
    expect(fiche.piles.map((p) => p.effectif)).toEqual(garde.map((s) => s.count));
    for (const pile of fiche.piles) expect(pile.quantite).toMatch(/\d/);
  });

  it('la Reconnaissance d’un éclaireur remplace la vision', () => {
    const state = partie();
    const gabarit = maisonDuTresor();
    const heros = state.heroes[state.players.P1.heroes[0]];
    const aveugle = regardAveugle(state, heros);
    expect(visionExacte(aveugle, gabarit.at, false)).toBe(false);

    heros.skills = [{ skill: 'reconnaissance', rank: 2 }];
    expect(visionExacte(aveugle, gabarit.at, false)).toBe(true);
    expect(ficheDuLieu(state, gabarit, aveugle).force!.exacte).toBe(true);

    /* Un novice ne suffit pas : le renseignement doit garder un prix. */
    heros.skills = [{ skill: 'reconnaissance', rank: 1 }];
    expect(visionExacte(aveugle, gabarit.at, false)).toBe(false);
  });

  it('ce qu’on tient soi-même est toujours compté', () => {
    const state = partie();
    const mine = world.objects.find((o) => o.kind === 'mine' && (o.guard?.length ?? 0) > 0)!;
    state.objects[mine.uid].owner = 'P1';
    const fiche = ficheDuLieu(state, mine, regardAveugle(state, null));
    expect(fiche.proprietaire?.id).toBe('P1');
    expect(fiche.neutre).toBe(false);
    expect(fiche.force!.exacte).toBe(true);
  });
});

/* ────────────── 2 bis. Une même créature ne se compte qu'une fois ───────── */

describe('deux emplacements de la même créature', () => {
  it('ne font qu’une ligne, et l’effectif s’additionne', () => {
    const state = partie();
    const lieux = lieuxAGardeRedondante(state);
    /* Vide, la boucle ne garderait rien : la carte de démonstration en porte
       soixante-trois. */
    expect(lieux.length).toBeGreaterThan(10);
    for (const lieu of lieux) {
      const garde = state.objects[lieu.uid].guard ?? [];
      const attendu = totauxParCreature(garde);
      const fiche = ficheDuLieu(state, lieu, regardVoyant(state, lieu.at));
      expect(fiche.piles.map((p) => p.creature), String(lieu.data.name)).toEqual(
        attendu.map((t) => t.creature),
      );
      expect(fiche.piles.map((p) => p.effectif), String(lieu.data.name)).toEqual(
        attendu.map((t) => t.count),
      );
    }
  });

  it('donnent la même fourchette que la même armée écrite en une seule pile', () => {
    /*
     * Le cœur du défaut : la façon dont le générateur de carte a réparti une
     * armée entre les emplacements ne doit rien changer à ce que la fiche en
     * dit. Sans fusion, chaque emplacement recevait son propre paquet flou —
     * deux fois « une poignée de » (1 à 4) là où la garde compte quatre
     * créatures, au lieu d'une fois « quelques » (5 à 9) — et la fourchette
     * comptait deux fois le même paquet.
     *
     * On compare donc la fiche du lieu tel qu'il est à la fiche du même lieu
     * dont la garde a été réécrite en piles déjà fusionnées : même armée, même
     * puissance, la fiche doit être mot pour mot la même.
     */
    const state = partie();
    const lieux = lieuxAGardeRedondante(state);
    for (const lieu of lieux) {
      const garde = state.objects[lieu.uid].guard ?? [];
      const vraie = armyPower(garde);
      const nom = `${String(lieu.data.name ?? lieu.kind)} (${String(vraie)})`;
      const eclatee = ficheDuLieu(state, lieu, regardAveugle(state, null));

      state.objects[lieu.uid].guard = totauxParCreature(garde);
      const fusionnee = ficheDuLieu(state, lieu, regardAveugle(state, null));
      expect(armyPower(state.objects[lieu.uid].guard ?? []), nom).toBe(vraie);

      expect(eclatee.force, nom).toEqual(fusionnee.force);
      expect(eclatee.piles, nom).toEqual(fusionnee.piles);
      /* Et la fourchette continue d'encadrer la vraie puissance. */
      expect(eclatee.force!.min, nom).toBeLessThanOrEqual(vraie);
      expect(eclatee.force!.max, nom).toBeGreaterThanOrEqual(vraie);
    }
  });

  it('rendent son verdict à Chabreloche : redoutable, et non hors de portée', () => {
    /*
     * Mesuré sur la carte de démonstration avant correction. Chabreloche porte
     * `[{ermitage_t5,2},{granit_t5,2},{granit_t5,2}]`, puissance réelle 6 612,
     * et le héros de premier jour de P1 pèse 1 682.
     *
     *                     fourchette       médiane   pastille
     *   éclaté         3 306 – 13 224       8 265    hors_de_portee
     *   fusionné       2 227 –  8 908       5 568    redoutable
     *
     * 6 612 / 1 682 = 3,93 : le combat est « Redoutable », il n'est pas hors de
     * portée. Le joueur renonçait à un combat qu'il gagne.
     */
    const state = partie();
    const heros = state.heroes[state.players.P1.heroes[0]];
    const chabreloche = lieuNomme('Chabreloche');
    const garde = state.objects[chabreloche.uid].guard ?? [];
    const fiche = ficheDuLieu(state, chabreloche, regardAveugle(state, heros));

    expect(fiche.piles.length).toBe(2);
    expect(fiche.difficulte).toBe('redoutable');
    /* Et le mot n'est pas un hasard : c'est celui que rendrait la vraie
       puissance si on la connaissait. */
    expect(difficulteDe(armyPower(garde), armyPower(heros.army))).toBe(fiche.difficulte);
  });
});

/* ─────────────────────── 3. L'échelle de difficulté ─────────────────────── */

describe('l’appréciation de difficulté', () => {
  it('se tait quand aucun héros ne peut servir de mesure', () => {
    expect(difficulteDe(50_000, 0)).toBe('inconnue');
    expect(difficulteDe(0, 0)).toBe('inconnue');
  });

  it('monte sans jamais redescendre quand la cible se renforce', () => {
    const crans = [0.05, 0.3, 0.6, 1, 1.8, 3, 10].map((r) => difficulteDe(r * 1000, 1000));
    expect(crans).toEqual([
      'sans_peril',
      'aise',
      'favorable',
      'incertain',
      'rude',
      'redoutable',
      'hors_de_portee',
    ]);
  });

  it('une place vide est sans péril, jamais « inconnue »', () => {
    expect(difficulteDe(0, 5000)).toBe('sans_peril');
  });

  it('se tait sur ce que la bannière du joueur tient déjà', () => {
    /*
     * Mesuré : cliquer sa propre cité de Cervières affichait « Sans péril » et
     * « Jugé sur l'armée de Clotilde (puissance 1 682) » ; cliquer sa propre
     * mine annonçait « Redoutable ». Il n'y a aucun combat à livrer contre sa
     * propre garnison, et une pastille y est un contresens — le même que
     * `ficheDuHeros` corrigeait déjà pour les héros, et lui seul.
     */
    const state = partie();
    const heros = state.heroes[state.players.P1.heroes[0]];
    const regard = regardAveugle(state, heros);

    const cite = state.towns[state.players.P1.towns[0]];
    const ficheCite = ficheDeLaCite(state, cite, regard);
    expect(ficheCite.proprietaire?.id).toBe('P1');
    expect(ficheCite.difficulte, `${cite.name} est à moi`).toBeNull();
    expect(ficheCite.juge).toBeNull();

    const mine = world.objects.find((o) => o.kind === 'mine' && (o.guard?.length ?? 0) > 0)!;
    state.objects[mine.uid].owner = 'P1';
    const ficheMine = ficheDuLieu(state, mine, regard);
    /* La garde est bien là, et comptée : c'est la pastille qui n'a pas lieu. */
    expect(ficheMine.force!.exacte).toBe(true);
    expect(ficheMine.force!.min).toBeGreaterThan(0);
    expect(ficheMine.difficulte, String(mine.data.name)).toBeNull();
    expect(ficheMine.juge).toBeNull();
  });

  it('se tait là où personne n’est en armes', () => {
    /*
     * Mesuré sur la scierie d'Arconsat, gisement neutre que rien ne garde :
     * `force = « aucune compagnie »` et pourtant pastille verte « Sans péril »,
     * comme s'il y avait là un affrontement facile. Il n'y a pas
     * d'affrontement.
     *
     * La correction est chez les appelants, pas dans `difficulteDe` : celle-ci
     * garde son contrat propre — « une place vide est sans péril » —, verrouillé
     * juste au-dessus, parce qu'un assaut sur une garnison décimée en cours de
     * partie est bel et bien sans péril.
     */
    const state = partie();
    const heros = state.heroes[state.players.P1.heroes[0]];
    const nue = world.objects.find((o) => o.kind === 'mine' && (o.guard?.length ?? 0) === 0);
    if (!nue) throw new Error('plus un seul gisement neutre sans garde sur la carte');

    const fiche = ficheDuLieu(state, nue, regardAveugle(state, heros));
    expect(fiche.force).toBeNull();
    expect(fiche.piles).toEqual([]);
    expect(fiche.difficulte, String(nue.data.name)).toBeNull();
    expect(fiche.juge).toBeNull();

    /* Une cité sans garnison ne se juge pas davantage. */
    const cite = Object.values(state.towns).find((t) => t.owner === null)!;
    cite.garrison = cite.garrison.map(() => null);
    cite.garrisonHero = null;
    const ficheCite = ficheDeLaCite(state, cite, regardAveugle(state, heros));
    expect(ficheCite.force).toBeNull();
    expect(ficheCite.difficulte).toBeNull();
  });

  it('juge la Maison du Trésor hors de portée d’un héros de premier jour', () => {
    const state = partie();
    const heros = state.heroes[state.players.P1.heroes[0]];
    const fiche = ficheDuLieu(state, maisonDuTresor(), regardAveugle(state, heros));
    expect(armyPower(heros.army)).toBeGreaterThan(0);
    expect(forceMediane(fiche.force)).toBeGreaterThan(armyPower(heros.army) * 4.5);
    expect(fiche.difficulte).toBe('hors_de_portee');
    expect(fiche.juge).toContain('puissance');
  });
});

/* ─────────────────────────── 4. Cités et héros ──────────────────────────── */

describe('fiche d’une cité', () => {
  it('additionne garnison et héros de garnison, comme un assaillant les rencontrera', () => {
    const state = partie();
    const cite = Object.values(state.towns).find((t) => t.owner === null)!;
    const gardien = state.heroes[state.players.P2.heroes[0]];
    cite.garrisonHero = gardien.uid;
    const regard: Regard = {
      moi: 'P1',
      fog: (() => {
        const f = new Uint8Array(world.cols * world.rows);
        f[cite.at.row * world.cols + cite.at.col] = 2;
        return f;
      })(),
      cols: world.cols,
      heros: state.heroes[state.players.P1.heroes[0]],
    };
    const fiche = ficheDeLaCite(state, cite, regard);
    expect(fiche.force!.min).toBe(armyPower([...cite.garrison, ...gardien.army]));
    expect(fiche.notes.join(' ')).toContain('garnison');
  });

  it('dit qu’une cité neutre est neutre', () => {
    const state = partie();
    const cite = Object.values(state.towns).find((t) => t.owner === null)!;
    const fiche = ficheDeLaCite(state, cite, regardAveugle(state, null));
    expect(fiche.neutre).toBe(true);
    expect(fiche.proprietaire).toBeNull();
  });

  it('nomme la bannière qui tient la place', () => {
    const state = partie();
    const cite = state.towns[state.players.P2.towns[0]];
    const fiche = ficheDeLaCite(state, cite, regardAveugle(state, null));
    expect(fiche.proprietaire?.id).toBe('P2');
    expect(fiche.proprietaire?.rang).toBe(2);
    expect(fiche.proprietaire?.nom).toBe(state.players.P2.name);
  });
});

describe('fiche d’un héros', () => {
  it('estime l’armée d’un concurrent et la juge', () => {
    const state = partie();
    const adverse = state.heroes[state.players.P2.heroes[0]];
    const mien = state.heroes[state.players.P1.heroes[0]];
    const fiche = ficheDuHeros(state, adverse, regardAveugle(state, mien));
    expect(fiche.nature).toBe('Héros concurrent');
    expect(fiche.force!.exacte).toBe(false);
    for (const pile of fiche.piles) expect(pile.effectif).toBeNull();
    expect(fiche.difficulte).not.toBe('inconnue');
  });

  it('compte le sien au grain près et ne se juge pas lui-même', () => {
    const state = partie();
    const mien = state.heroes[state.players.P1.heroes[0]];
    const fiche = ficheDuHeros(state, mien, regardAveugle(state, mien));
    expect(fiche.force!.exacte).toBe(true);
    /*
     * `null` et non `'inconnue'` : la nuance a été vue en capture. La fiche de
     * Clotilde portait la pastille « Aucun héros pour juger » alors que Clotilde
     * était le héros qui juge — le carton annonçait une lacune inexistante.
     * `null` veut dire « la comparaison n'a pas de sens », et le panneau ne pose
     * alors aucune pastille.
     */
    expect(fiche.difficulte).toBeNull();
    expect(fiche.juge).toBeNull();
  });

  it('ne répète pas le genre du lieu sous son propre nom', () => {
    /* Vu en capture : « MAISON DU TRÉSOR » puis « Maison du Trésor » juste
       dessous. Deux lignes pour un seul renseignement. */
    const state = partie();
    const tresor = ficheDuLieu(state, maisonDuTresor(), regardAveugle(state, null));
    expect(tresor.titre).toBe(tresor.nature);
    expect(sousTitreDe(tresor)).toBeNull();

    const mine = world.objects.find((o) => o.kind === 'mine' && typeof o.data.name === 'string')!;
    const fiche = ficheDuLieu(state, mine, regardAveugle(state, null));
    expect(fiche.titre).not.toBe(fiche.nature);
    expect(sousTitreDe(fiche)).toBe(fiche.nature);
  });

  it('garde « inconnue » pour le cas où il n’y a vraiment personne pour juger', () => {
    const state = partie();
    const adverse = state.heroes[state.players.P2.heroes[0]];
    const fiche = ficheDuHeros(state, adverse, regardAveugle(state, null));
    expect(fiche.difficulte).toBe('inconnue');
  });
});
