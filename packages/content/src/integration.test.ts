/**
 * Vérification de bout en bout : le contenu réel branché dans le moteur.
 *
 * On appelle `bootstrapEngine()` depuis `@auvergne/game` — la seule racine de
 * composition autorisée (docs/02-API.md) — puis on crée une partie à deux
 * bannières et l'on contrôle que le moteur travaille bien avec CE contenu et
 * non avec les replis de `core/fallback-*.ts`.
 *
 * Le paquet `@auvergne/game` est importé dynamiquement, par un spécificateur
 * porté par une variable : `@auvergne/content` ne peut pas déclarer
 * `@auvergne/game` en dépendance sans créer un cycle de paquets
 * (game → content → game). Vitest résout l'alias à l'exécution.
 *
 * NOTE — `@auvergne/map` est encore un espace réservé au moment où ce test est
 * écrit (un autre agent y travaille). `bootstrapEngine()` fonctionne quand même :
 * le registre fusionne l'espace de noms de la carte avec le repli du noyau, si
 * bien que `mapPack().buildWorld` reste disponible. Le jour où la vraie carte
 * arrive, ce test se met à l'utiliser sans aucune modification.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { Command, GameSetup, GameState, WorldMap } from '@auvergne/engine';
import {
  applyCommand,
  canBuild,
  content as engineContent,
  createGame,
  hasLinkedContent,
  mapPack,
  playerIncome,
  stackPower,
  townFortification,
  townGrowthBp,
  townIncome,
  weeklyGrowth,
} from '@auvergne/engine';
import { ARTIFACT_LIST, CONTENT_VERSION, CREATURES, FACTIONS, HEROES } from './index.js';

interface GameModule {
  bootstrapEngine(force?: boolean): void;
  isBootstrapped(): boolean;
}

let world: WorldMap;

function makeSetup(seed: number): GameSetup {
  return {
    seed,
    mapVersion: '',
    contentVersion: '',
    duration: 'standard',
    victory: 'couronne',
    players: [
      {
        id: 'P1',
        name: 'Maison de Cervières',
        faction: 'granit',
        kind: 'humain',
        start: 'cervieres',
        hero: 'thibaut',
      },
      {
        id: 'P2',
        name: 'Prieuré des Bois Noirs',
        faction: 'ermitage',
        kind: 'ia',
        aiProfile: 'equilibre',
        start: 'viscomtat',
        hero: 'anastasia',
      },
    ],
  };
}

beforeAll(async () => {
  // Spécificateur en variable : évite le cycle de dépendances de paquets.
  const specifier = '@auvergne/game';
  const game = (await import(/* @vite-ignore */ specifier)) as unknown as GameModule;
  expect(typeof game.bootstrapEngine).toBe('function');
  game.bootstrapEngine();
  expect(game.isBootstrapped()).toBe(true);

  const build = mapPack().buildWorld;
  expect(typeof build).toBe('function');
  world = (build as (seed: number) => WorldMap)(20250817);
});

describe('branchement du contenu réel', () => {
  it('le moteur voit un contenu branché, pas ses replis', () => {
    expect(hasLinkedContent()).toBe(true);
    const pack = engineContent();
    expect(pack.CONTENT_VERSION).toBe(CONTENT_VERSION);
    expect(Object.keys(pack.CREATURES)).toHaveLength(28);
    expect(Object.keys(pack.HEROES)).toHaveLength(21);
    expect(Object.keys(pack.SPELLS)).toHaveLength(32);
    expect(Object.keys(pack.SKILLS)).toHaveLength(20);
    expect(Object.keys(pack.ARTIFACTS).length).toBe(ARTIFACT_LIST.length);
    // Bâtiments et libellés qui n'existent que dans ce paquet.
    expect(pack.BUILDINGS.caravanserail).toBeDefined();
    expect(pack.BUILDINGS.granit_porte_farges).toBeDefined();
    expect(pack.BUILDINGS.ermitage_scriptorium).toBeDefined();
    expect(pack.creature('granit_t1').power).toBe(CREATURES.granit_t1.power);
    expect(pack.hero('jules').title).toBe('Gardien des Bornes');
  });

  it('le pont de combat utilise les créatures de ce paquet', () => {
    // `stackPower` passe par `setCombatContent` : la valeur ne peut venir
    // que de la table de ce paquet.
    expect(stackPower([{ creature: 'granit_t1', count: 10 }])).toBe(
      CREATURES.granit_t1.power * 10,
    );
    expect(stackPower([{ creature: 'ermitage_t7_up', count: 1 }])).toBe(
      CREATURES.ermitage_t7_up.power,
    );
  });
});

describe('createGame avec le contenu réel', () => {
  let state: GameState;

  beforeAll(() => {
    state = createGame(makeSetup(20250817), world);
  });

  it('la partie démarre en phase aventure, hachée et datée', () => {
    expect(state.phase).toBe('aventure');
    expect(state.turn).toBe(1);
    expect(state.contentVersion).toBe(CONTENT_VERSION);
    expect(state.hash).toMatch(/^[0-9a-f]{16}$/);
    expect(state.turnOrder).toHaveLength(2);
  });

  it('les réserves de départ sont celles des factions de ce paquet', () => {
    for (const id of ['P1', 'P2'] as const) {
      const player = state.players[id];
      const startingResources = FACTIONS[player.faction].startingResources;
      // Le noyau ajoute une compensation d'ordre de tour sur les écus seuls.
      expect(player.resources.ecus).toBeGreaterThanOrEqual(startingResources.ecus);
      for (const key of ['bois', 'granit', 'fer', 'sel', 'essence', 'filDor'] as const) {
        expect(player.resources[key], `${id}.${key}`).toBe(startingResources[key]);
      }
    }
    expect(state.players.P1.resources.bois).not.toBe(state.players.P2.resources.bois);
  });

  it('chaque capitale possède les bâtiments de départ et leur première portée', () => {
    for (const id of ['P1', 'P2'] as const) {
      const player = state.players[id];
      const town = state.towns[player.towns[0]];
      expect(town).toBeDefined();
      expect(town.built).toContain('taverne');
      expect(town.built).toContain(`${player.faction}_demeure_1`);
      expect(town.built).toContain(`${player.faction}_demeure_2`);

      const t1 = `${player.faction}_t1`;
      const t2 = `${player.faction}_t2`;
      expect(town.available[t1]).toBe(CREATURES[t1].growth);
      expect(town.available[t2]).toBe(CREATURES[t2].growth);
      expect(townIncome(state, town).ecus).toBeGreaterThan(0);
    }
  });

  it('les héros portent leur armée et leurs compétences de contenu', () => {
    const p1Hero = state.heroes[state.players.P1.heroes[0]];
    const thibaut = HEROES.thibaut;
    expect(p1Hero.def).toBe('thibaut');
    expect(p1Hero.vaillance).toBe(thibaut.start.vaillance);
    expect(p1Hero.savoir).toBe(thibaut.start.savoir);
    expect(p1Hero.skills.map((s) => s.skill).sort()).toEqual(
      thibaut.start.skills.map((s) => s.skill).sort(),
    );
    const stacks = p1Hero.army.filter((s) => s !== null);
    expect(stacks).toHaveLength(thibaut.start.army.length);
    for (const expected of thibaut.start.army) {
      expect(stacks.some((s) => s?.creature === expected.creature && s.count === expected.count)).toBe(
        true,
      );
    }

    const p2Hero = state.heroes[state.players.P2.heroes[0]];
    expect(p2Hero.def).toBe('anastasia');
    expect(p2Hero.spells).toEqual(HEROES.anastasia.start.spells);
    expect(p2Hero.manaMax).toBeGreaterThan(0);
    expect(p2Hero.movementMax).toBeGreaterThan(0);
  });

  it('les revenus quotidiens du joueur actif sont positifs', () => {
    const income = playerIncome(state);
    expect(income.ecus ?? 0).toBeGreaterThan(0);
  });
});

describe('la partie se joue avec ce contenu', () => {
  it('on construit, on recrute et le tour passe', () => {
    let state = createGame(makeSetup(4242), world);
    const active = state.activePlayer;
    const player = state.players[active];
    const townUid = player.towns[0];
    const heroUid = player.heroes[0];
    const faction = player.faction;

    // Un bâtiment de ce paquet, absent des replis du noyau.
    expect(canBuild(state, state.towns[townUid], 'marche').ok).toBe(true);

    const commands: Command[] = [
      { type: 'BuildInTown', town: townUid, building: 'marche' },
      // Le héros démarre à côté de la cité, pas dedans : les recrues
      // rejoignent donc la garnison.
      { type: 'RecruitCreatures', town: townUid, creature: `${faction}_t1`, count: 5 },
      { type: 'EndTurn' },
    ];

    const hashes = new Set<string>([state.hash]);
    for (const command of commands) {
      const result = applyCommand(state, command, world);
      expect(result.ok, `${command.type} : ${result.error ?? ''}`).toBe(true);
      state = result.state;
      hashes.add(state.hash);
    }
    expect(hashes.size).toBe(commands.length + 1);

    const town = state.towns[townUid];
    expect(town.built).toContain('marche');
    const t1Stack = town.garrison.find((s) => s?.creature === `${faction}_t1`);
    expect(t1Stack).toBeDefined();
    expect(t1Stack?.count).toBe(5);
    expect(town.available[`${faction}_t1`]).toBe(CREATURES[`${faction}_t1`].growth - 5);
    expect(state.heroes[heroUid]).toBeDefined();
    expect(state.activePlayer).not.toBe(active);
  });

  it('deux parties de même graine produisent le même hash', () => {
    const a = createGame(makeSetup(777), world);
    const b = createGame(makeSetup(777), world);
    expect(a.hash).toBe(b.hash);
    expect(a.turnOrder).toEqual(b.turnOrder);
  });

  it('une chaîne de bâtiments refuse le second niveau avant le premier', () => {
    const state = createGame(makeSetup(31337), world);
    const townUid = state.players[state.activePlayer].towns[0];
    const verdict = canBuild(state, state.towns[townUid], 'hotel_ville_2');
    expect(verdict.ok).toBe(false);
    expect(verdict.reason).toContain('Salle des comptes');
  });

  it('la Citadelle donne moitié plus de recrues, le Château le double', () => {
    /*
     * La mécanique de croissance de HMM3 qui manquait : là-bas Citadel
     * multiplie par 1,5 la croissance de BASE des demeures et Castle par 2
     * (wiki thelazy, « Growth »). Le plafond réel de la cité était de ×1,35 —
     * une partie longue n'avait aucun moyen de faire grossir ses armées.
     *
     * On mesure sur le vrai contenu, sans copier aucun chiffre : la
     * croissance de référence est celle que le moteur rend AVANT la place
     * forte, et l'on vérifie les rapports 3/2 puis 2/1.
     */
    const state = createGame(makeSetup(4242), world);
    const town = state.towns[state.players[state.activePlayer].towns[0]];
    const faction = town.faction;
    const demeure = `${faction}_demeure_1`;
    if (!town.built.includes(demeure)) town.built.push(demeure);

    const recrues = (): number => weeklyGrowth(town, 10000)[`${faction}_t1`] ?? 0;

    const nu = recrues();
    expect(nu).toBeGreaterThan(0);

    town.built.push('palissade', 'rempart', 'tours', 'citadelle');
    const avecCitadelle = recrues();
    town.built.push('chateau');
    const avecChateau = recrues();

    /* La charte et l'agitation entrent dans le même ratio : on compare des
       ratios de ratios, pas des valeurs absolues. */
    const bpNu = townGrowthBp({ ...town, built: [demeure] });
    expect(avecCitadelle).toBe(Math.max(1, Math.trunc((nu * (bpNu + 5000)) / bpNu)));
    expect(avecChateau).toBe(Math.max(1, Math.trunc((nu * (bpNu + 10000)) / bpNu)));
    expect(avecChateau).toBeGreaterThan(avecCitadelle);
    expect(avecCitadelle).toBeGreaterThan(nu);
  });

  it('la place forte arme ses tours : deux, trois, puis quatre', () => {
    /* Un Château qui ne défend pas mieux qu'un rempart serait un libellé
       flatteur. Le noyau lit la chaîne défensive et le champ de siège pose
       autant de tours qu'elle en arme. */
    const state = createGame(makeSetup(4242), world);
    const town = state.towns[state.players[state.activePlayer].towns[0]];
    town.built = town.built.filter((b) => !['palissade', 'rempart', 'tours'].includes(b));

    expect(townFortification(town).towers).toBe(0);
    town.built.push('palissade');
    expect(townFortification(town).towers).toBe(0);
    town.built.push('rempart');
    expect(townFortification(town).towers).toBe(1);
    town.built.push('tours');
    expect(townFortification(town).towers).toBe(2);
    town.built.push('citadelle');
    expect(townFortification(town).towers).toBe(3);
    town.built.push('chateau');
    expect(townFortification(town).towers).toBe(4);
  });
});
