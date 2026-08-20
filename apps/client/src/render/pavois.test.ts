/**
 * Le pavois : qui porte une bannière sur la carte, et laquelle.
 *
 * ## Ce que ce fichier garde
 *
 * 1. **La liste des genres pavoisables est celle du moteur, pas une opinion.**
 *    Le test ne recopie aucune règle : il fait *réellement* visiter un lieu de
 *    chaque genre par un héros (`visitObject`) sur la vraie carte du Forez, puis
 *    regarde si le moteur a posé un propriétaire dessus. La liste observée doit
 *    être exactement `PAVOISABLE`. Ajouter un genre à l'un sans l'autre fait
 *    rougir ce test, dans les deux sens : un coffre pavoisé comme un gisement
 *    oublié.
 *
 * 2. **Un lieu qui change de main change de couleur.** `objects.ts` ne posait la
 *    texture qu'à la première apparition du sprite : une mine prise à
 *    l'adversaire gardait ses anciennes couleurs jusqu'à sortir du cadre. Le
 *    test surveille la source de vérité, `proprietaireLieu`, sur les trois
 *    registres qui peuvent la porter — l'objet, la cité liée, le registre des
 *    sceaux.
 *
 * 3. **Le pavois de démonstration ne touche pas l'état** et laisse des lieux
 *    neutres : sans lieux neutres, la démonstration ne montre plus la moitié de
 *    ce qu'on lui demande de montrer.
 *
 * ## Comment il a été éprouvé
 *
 * En défaisant chaque correction, une à une (voir le rapport) : ajouter
 * `'coffre'` à `PAVOISABLE` fait rougir le point 1 ; retirer la lecture de
 * `state.seals` fait rougir le point 2 ; supprimer la borne de
 * `RAYON_PAVOIS_DEMO` fait rougir le point 3.
 */

import { beforeAll, describe, expect, it } from 'vitest';
import { bootstrapEngine } from '@auvergne/game';
import { buildWorld } from '@auvergne/map';
import { MAP_OBJECT_KINDS, captureTown, createGame, visitObject } from '@auvergne/engine';
import type {
  GameSetup,
  GameState,
  MapObject,
  MapObjectKind,
  PlayerId,
  WorldMap,
} from '@auvergne/engine';
import { banners } from '@auvergne/ui';
import { BANNERS } from '../art/palette.js';
import { setupDemo, GRAINE_DEMO } from '../state/demo.js';
import {
  PAVOISABLE,
  PAVOISABLE_DEMO,
  RAYON_PAVOIS_DEMO,
  pavoise,
  pavoisDemonstration,
  proprietaireLieu,
  rangBanniere,
} from './pavois.js';

let world: WorldMap;

function partie(): GameState {
  return createGame(setupDemo(), world);
}

beforeAll(() => {
  bootstrapEngine();
  world = buildWorld(GRAINE_DEMO);
});

/* ───────────────── 1. La liste vient du moteur ──────────────────────────── */

/**
 * Fait visiter jusqu'à `MAX_ESSAIS` lieux d'un genre par un héros et dit si le
 * moteur a fini par en faire son propriétaire.
 *
 * Un seul essai ne suffirait pas : `visitSettlement` rend la main sans rien
 * changer quand la cité est **déjà** celle du visiteur, et la première `ville`
 * de la carte est justement Cervières, le siège du joueur. On essaie donc
 * plusieurs lieux du même genre — le genre est pavoisable si l'un d'eux passe
 * sous la bannière, et il ne l'est pas si aucun n'y passe.
 */
const MAX_ESSAIS = 6;

function leMoteurPavoise(kind: MapObjectKind): boolean {
  const state = partie();
  const heros = state.heroes[state.players.P1.heroes[0]];
  /*
   * La Maison du Trésor n'ouvre qu'au porteur des cinq Sceaux des Marches :
   * sans eux, l'essai mesurerait une porte fermée et non le pavois. On garnit
   * donc la besace du joueur — et **seulement** la besace : le registre
   * `state.seals` reste vierge, sinon `visitSeal` rendrait la main avant
   * d'avoir planté sa bannière et le genre « sceau » passerait pour
   * non-pavoisable.
   */
  state.players.P1.seals = Object.keys(state.seals) as typeof state.players.P1.seals;
  const candidats = world.objects.filter((o) => o.kind === kind).slice(0, MAX_ESSAIS);
  for (const gabarit of candidats) {
    const vif: MapObject | undefined = state.objects[gabarit.uid];
    if (!vif) continue;
    try {
      visitObject(state, world, heros, vif);
    } catch {
      /* Un lieu qui refuse la visite ne prouve rien : on passe au suivant. */
    }
    /* Une visite peut ouvrir un combat ou clore la partie ; on rend la main à
       la phase d'aventure pour que l'essai suivant ait lieu dans les mêmes
       conditions que le premier. */
    state.combat = null;
    state.phase = 'aventure';
    if (state.objects[gabarit.uid]?.owner === heros.owner) return true;
  }
  return false;
}

describe('les genres pavoisables sont ceux que le moteur fait changer de main', () => {
  it('chaque genre présent sur la carte est pavoisable si et seulement si le moteur lui donne un maître', () => {
    const presents = MAP_OBJECT_KINDS.filter((k) => world.objects.some((o) => o.kind === k));
    expect(presents.length).toBeGreaterThan(20);

    const desaccords: string[] = [];
    for (const kind of presents) {
      const observe = leMoteurPavoise(kind);
      if (observe !== pavoise(kind)) {
        desaccords.push(
          `${kind} : le moteur ${observe ? 'donne' : 'ne donne pas'} de maître, ` +
            `PAVOISABLE dit ${pavoise(kind) ? 'oui' : 'non'}`,
        );
      }
    }
    expect(desaccords, desaccords.join(' · ')).toEqual([]);
  });

  it('le décor pur ne porte jamais de bannière, quoi qu’on écrive dans son état', () => {
    /* Un coffre à qui l'on collerait un propriétaire — par une sauvegarde
       abîmée, un bac de test, une future règle — ne doit pas se mettre à battre
       pavillon : la carte politique doit rester lisible. */
    const coffre = world.objects.find((o) => o.kind === 'coffre');
    expect(coffre).toBeTruthy();
    const state = partie();
    const vif = state.objects[coffre!.uid];
    vif.owner = 'P1';
    expect(proprietaireLieu(state, vif)).toBeNull();
  });
});

/* ───────────────── 2. Les trois registres de la propriété ───────────────── */

describe('la bannière que porte un lieu', () => {
  it('suit l’objet vivant de l’état, et non le gabarit figé de la carte', () => {
    const state = partie();
    const gabarit = world.objects.find((o) => o.kind === 'mine');
    expect(gabarit).toBeTruthy();
    expect(proprietaireLieu(state, gabarit!)).toBeNull();
    state.objects[gabarit!.uid].owner = 'P2';
    /* On interroge avec le GABARIT, celui que le rendu tient en mémoire : c'est
       exactement le cas où une mine prise gardait l'ancienne couleur. */
    expect(proprietaireLieu(state, gabarit!)).toBe('P2');
  });

  it('suit la cité liée quand l’objet de carte n’a pas été touché', () => {
    const state = partie();
    const village = world.objects.find(
      (o) => o.kind === 'village' && typeof o.data.townUid === 'string',
    );
    expect(village).toBeTruthy();
    const townUid = village!.data.townUid as string;
    state.objects[village!.uid].owner = null;
    state.towns[townUid].owner = 'P2';
    expect(proprietaireLieu(state, state.objects[village!.uid])).toBe('P2');
  });

  /**
   * La prise d'une cité ne passe pas toujours par `visitSettlement`, seul
   * endroit du moteur qui recopie le maître dans l'objet de carte. Trois
   * chemins écrivent `town.owner` **seuls** :
   *
   *  - `captureTown` (core/movement.ts), pour une cité vide où l'on entre ;
   *  - la victoire de siège (`combat/outcome.ts`) ;
   *  - la sécession d'une cité révoltée (`world/gabelle.ts`), qui rend la
   *    place à personne.
   *
   * Le test rejoue les trois sur la vraie cité liée à un vrai objet de carte,
   * en appelant le moteur plutôt qu'en écrivant `town.owner` à la main : c'est
   * le registre qui doit trancher, y compris pour dire « personne ».
   */
  it('suit la cité même après une prise qui ne touche pas l’objet de carte', () => {
    const state = partie();
    const objet = world.objects.find(
      (o) =>
        (o.kind === 'ville' || o.kind === 'village') &&
        typeof o.data.townUid === 'string' &&
        state.towns[o.data.townUid as string] !== undefined,
    );
    expect(objet).toBeTruthy();
    const town = state.towns[objet!.data.townUid as string];

    /* 1. Visite en règle : les deux registres s'accordent. */
    state.objects[objet!.uid].owner = 'P1';
    town.owner = 'P1';
    expect(proprietaireLieu(state, objet!)).toBe('P1');

    /* 2. Prise sans visite : le moteur ne touche que la cité. */
    captureTown(state, town, 'P2');
    expect(state.objects[objet!.uid].owner).toBe('P1');
    expect(town.owner).toBe('P2');
    expect(proprietaireLieu(state, objet!)).toBe('P2');

    /* 3. Sécession : la place n'est plus à personne, le drapeau doit tomber. */
    town.owner = null;
    expect(state.objects[objet!.uid].owner).toBe('P1');
    expect(proprietaireLieu(state, objet!)).toBeNull();
  });

  it('suit le registre des sceaux, qui fait foi pour la victoire', () => {
    const state = partie();
    const sceau = world.objects.find((o) => o.kind === 'sceau');
    expect(sceau).toBeTruthy();
    const seal = sceau!.data.seal as keyof typeof state.seals;
    state.objects[sceau!.uid].owner = null;
    state.seals[seal] = { owner: 'P1', at: { ...sceau!.at } };
    expect(proprietaireLieu(state, state.objects[sceau!.uid])).toBe('P1');
  });

  it('rend `null` sur un lieu que personne ne tient', () => {
    const state = partie();
    for (const o of world.objects.filter((q) => q.kind === 'mine').slice(0, 12)) {
      expect(proprietaireLieu(state, o)).toBeNull();
    }
  });

  it('donne à chaque bannière son rang héraldique, et jamais NaN', () => {
    expect(rangBanniere('P1')).toBe(1);
    expect(rangBanniere('P5')).toBe(5);
    expect(rangBanniere('P9' as PlayerId)).toBe(1);
    expect(rangBanniere('' as PlayerId)).toBe(1);
  });
});

/* ───────────────── 3. Le pavois de démonstration ────────────────────────── */

describe('pavois des routes de démonstration', () => {
  it('mesure le défaut qu’il corrige : la carte de démonstration n’a aucun lieu possédé', () => {
    /* C'est la mesure qui justifie la fabrication. `createGame` ouvre le premier
       jour ; `#/demo/carte` annonce la semaine 6. Sans pavois d'affichage, la
       revue visuelle photographie une carte politique vierge. */
    const state = partie();
    const pavoisables = world.objects.filter((o) => pavoise(o.kind));
    expect(pavoisables.length).toBeGreaterThan(80);
    const tenus = pavoisables.filter((o) => proprietaireLieu(state, o) !== null);
    /* Seules les deux capitales des joueurs répondent, par leur cité liée. */
    expect(tenus.length).toBeLessThanOrEqual(2);
  });

  it('plante des bannières, en laisse au loin, et n’écrit rien dans l’état', () => {
    const state = partie();
    const avant = JSON.stringify(state.objects);
    const table = pavoisDemonstration(world, state);

    expect(table.size).toBeGreaterThan(10);
    /* Des lieux neutres doivent rester : c'est l'autre moitié de la démonstration. */
    const candidats = world.objects.filter((o) => PAVOISABLE_DEMO.has(o.kind));
    expect(table.size).toBeLessThan(candidats.length);
    /* L'état du moteur est intact, à l'octet près. */
    expect(JSON.stringify(state.objects)).toBe(avant);
  });

  it('ne pavoise que les genres sans registre séparé', () => {
    const state = partie();
    const table = pavoisDemonstration(world, state);
    const parUid = new Map(world.objects.map((o) => [o.uid, o]));
    for (const uid of table.keys()) {
      const objet = parUid.get(uid);
      expect(objet, uid).toBeTruthy();
      expect(PAVOISABLE_DEMO.has(objet!.kind), `${objet!.kind} pavoisé en démonstration`).toBe(true);
      /* Une cité, un sceau ou la Maison du Trésor tiennent leur propriété dans
         un registre à part : une couleur d'affichage les contredirait. */
      expect(['ville', 'village', 'sceau', 'maison_tresor']).not.toContain(objet!.kind);
    }
  });

  it('respecte le rayon d’influence : aucun lieu pavoisé au-delà', () => {
    const state = partie();
    const table = pavoisDemonstration(world, state);
    const parUid = new Map(world.objects.map((o) => [o.uid, o]));
    let pireDistance = 0;
    for (const [uid, joueur] of table) {
      const objet = parUid.get(uid)!;
      const foyers = [
        ...state.players[joueur].towns.map((t) => state.towns[t].at),
        ...state.players[joueur].heroes.map((h) => state.heroes[h].at),
      ];
      const d = Math.min(
        ...foyers.map((f) => Math.hypot(objet.at.col - f.col, objet.at.row - f.row)),
      );
      pireDistance = Math.max(pireDistance, d);
    }
    expect(pireDistance).toBeLessThanOrEqual(RAYON_PAVOIS_DEMO);
    /* Et le rayon sert à quelque chose : il y a bien des lieux plus loin. */
    const horsRayon = world.objects.filter(
      (o) => PAVOISABLE_DEMO.has(o.kind) && !table.has(o.uid),
    );
    expect(horsRayon.length).toBeGreaterThan(0);
  });

  it('est déterministe : deux constructions donnent la même carte politique', () => {
    const a = pavoisDemonstration(world, partie());
    const b = pavoisDemonstration(world, partie());
    expect([...a.entries()].sort()).toEqual([...b.entries()].sort());
  });

  it('ne parle qu’après le moteur, jamais à sa place', () => {
    const state = partie();
    const mine = world.objects.find((o) => o.kind === 'mine')!;
    const table = new Map<string, PlayerId>([[mine.uid, 'P2']]);
    expect(proprietaireLieu(state, mine, table)).toBe('P2');
    state.objects[mine.uid].owner = 'P1';
    expect(proprietaireLieu(state, mine, table)).toBe('P1');
  });

  it('couvre exactement les sept genres annoncés', () => {
    expect([...PAVOISABLE].sort()).toEqual(
      ['belvedere', 'demeure', 'maison_tresor', 'mine', 'sceau', 'ville', 'village'].sort(),
    );
  });
});

/* ───────────────── 4. Les trois tables de couleurs ne font qu'une ───────── */

/**
 * Un gonfanon est peint à trois endroits : le moteur inscrit couleur et motif
 * dans `PlayerState` (`core/create-game.ts`), le design system les redonne aux
 * fiches (`@auvergne/ui` — `tokens.ts`), et l'art Pixi les redonne à la carte
 * (`art/palette.ts`). Les trois concordaient sans que rien ne les y oblige :
 * changer l'une désaccorderait le drapeau planté sur la mine de celui affiché
 * sur la fiche de la même mine, et le pavois cesserait de renseigner.
 *
 * Le test n'écrit aucune couleur : il fait ouvrir une vraie partie à cinq
 * bannières et compare ce que le moteur a réellement inscrit aux deux tables.
 */
describe('les trois tables de bannières disent la même chose', () => {
  /** Les cinq départs du Forez, un par bannière : la seule table à cinq entrées. */
  function setupCinq(): GameSetup {
    const base = setupDemo();
    return {
      ...base,
      players: [
        ...base.players,
        {
          id: 'P3',
          name: 'Maison d’Arconsat',
          faction: 'granit',
          kind: 'ia',
          aiProfile: 'equilibre',
          start: 'arconsat',
          hero: 'auguste',
        },
        {
          id: 'P4',
          name: 'Maison de Viscomtat',
          faction: 'ermitage',
          kind: 'ia',
          aiProfile: 'equilibre',
          start: 'viscomtat',
          hero: 'mathilde',
        },
        {
          id: 'P5',
          name: 'Maison de La Renaudie',
          faction: 'granit',
          kind: 'ia',
          aiProfile: 'equilibre',
          start: 'renaudie',
          hero: 'georges',
        },
      ],
    };
  }

  it('couleur et motif s’accordent, du moteur au jeton et au gonfanon de la carte', () => {
    const state = createGame(setupCinq(), world);
    const rangs: PlayerId[] = ['P1', 'P2', 'P3', 'P4', 'P5'];
    for (const id of rangs) {
      const moteur = state.players[id];
      const rang = rangBanniere(id);
      const jeton = banners[rang - 1];
      const gonfanon = BANNERS[rang - 1];
      expect(jeton.color.toUpperCase(), id).toBe(moteur.color.toUpperCase());
      expect(`#${gonfanon.color.toString(16).padStart(6, '0')}`.toUpperCase(), id).toBe(
        moteur.color.toUpperCase(),
      );
      /* Le motif est l'autre moitié du renseignement : il porte la bannière
         pour qui ne distingue pas le grenat du sinople. */
      expect(gonfanon.pattern, id).toBe(moteur.pattern);
      expect(jeton.pattern, id).toBe(gonfanon.patternName);
      expect(gonfanon.player, id).toBe(id);
      expect(jeton.id, id).toBe(id.toLowerCase());
    }
  });
});
