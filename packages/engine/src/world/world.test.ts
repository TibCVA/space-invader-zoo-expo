/**
 * Tests des systèmes de monde : visites de carte, bornes armoriées, météo,
 * gabelle, événements de semaine et conditions de victoire.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CELL_PASSABLE, type GameEvent, type GameState, type MapObject, type WorldMap } from '../types.js';
import {
  CLAIM_DURATION_TURNS,
  applyCommand,
  registerWorldModule,
  resetEngineModules,
} from '../core/index.js';
import { newGame } from '../core/test-helpers.js';
import { worldModulePack } from './index.js';
import {
  visitObject,
  canUseBorne,
  useBorne,
  borneUsesLeft,
  questTermsIfKnown,
  BORNE_TUNING,
} from './objects.js';
import { advanceWeather, canDelayFront, weatherModifiers, WEATHER_ORDER } from './weather.js';
import { gabelleIncome, gabelleReport } from './gabelle.js';
import { checkVictory, claimRemaining, startClaim, scoreOf } from './victory.js';
import { weeklyEvent, currentWeekEvent } from './week-events.js';
import { castAdventureSpell, checkFord, revealRadius } from './spells-adventure.js';
import { parleyChance } from './diplomacy.js';
import { LEDGER_UID, treasuryHolder } from './common.js';

function texts(events: GameEvent[]): string {
  return events
    .filter((e): e is Extract<GameEvent, { type: 'Notice' }> => e.type === 'Notice')
    .map((e) => e.text)
    .join(' | ');
}

function place(
  state: GameState,
  uid: string,
  kind: MapObject['kind'],
  col: number,
  row: number,
  data: Record<string, unknown> = {},
): MapObject {
  const obj: MapObject = {
    uid,
    kind,
    at: { col, row },
    footprint: [{ col, row }],
    entrance: { col, row },
    owner: null,
    data,
  };
  state.objects[uid] = obj;
  return obj;
}

function fixture(seed = 909090, players = 2): { state: GameState; world: WorldMap } {
  return newGame(seed, players);
}

/** La Maison du Trésor posée par la carte, telle que la partie la connaît. */
function treasury(state: GameState): MapObject {
  for (const uid of Object.keys(state.objects).sort()) {
    if (state.objects[uid].kind === 'maison_tresor') return state.objects[uid];
  }
  throw new Error('La carte de test ne comporte aucune Maison du Trésor.');
}

describe('visites de carte', () => {
  beforeEach(() => registerWorldModule(worldModulePack()));
  afterEach(() => resetEngineModules());

  it('raconte une trouvaille en français et crédite le trésor', () => {
    const { state, world } = fixture();
    const hero = state.heroes[state.players.P1.heroes[0]];
    const before = state.players.P1.resources.sel;

    const pile = place(state, 'O_test_sel', 'ressource', hero.at.col, hero.at.row, {
      resource: 'sel',
      amount: 4,
    });
    const events = visitObject(state, world, hero, pile);

    expect(pile.spent).toBe(true);
    expect(state.players.P1.resources.sel).toBeGreaterThanOrEqual(before + 4);
    expect(events.some((e) => e.type === 'ResourcesChanged')).toBe(true);
    expect(events.some((e) => e.type === 'ObjectVisited')).toBe(true);

    const story = texts(events);
    expect(story).toMatch(/sel/);
    expect(story).toMatch(/[àéèêôûùç]/); // du vrai français, accentué
    // Une seconde visite ne rapporte plus rien.
    expect(visitObject(state, world, hero, pile)).toHaveLength(0);
  });

  it('prend un gisement, prévient l’ancien maître et accorde de l’expérience', () => {
    const { state, world } = fixture();
    const hero = state.heroes[state.players.P1.heroes[0]];
    const xpBefore = hero.xp;
    const mine = place(state, 'O_test_mine', 'mine', hero.at.col, hero.at.row, {
      resource: 'fer',
      amount: 2,
      name: 'Minière des Farges',
    });
    mine.owner = 'P2';

    const events = visitObject(state, world, hero, mine);
    expect(mine.owner).toBe('P1');
    expect(hero.xp).toBeGreaterThan(xpBefore);
    expect(events.some((e) => e.type === 'Notice' && e.player === 'P2')).toBe(true);
  });

  it('ouvre une doléance, la mémorise, puis la solde quand la condition est tenue', () => {
    const { state, world } = fixture();
    const hero = state.heroes[state.players.P1.heroes[0]];
    const quest = place(state, 'O_test_quete', 'quete', hero.at.col, hero.at.row, {
      name: 'Doléance du Lac',
      reward: 'ecus',
      amount: 500,
    });

    // Termes forcés : un péage de six mesures de sel.
    quest.data.quete = { kind: 'peage', resource: 'sel', need: 6, level: 0, seals: 0 };
    expect(questTermsIfKnown(quest)?.kind).toBe('peage');

    state.players.P1.resources.sel = 2;
    const waiting = visitObject(state, world, hero, quest);
    expect(texts(waiting)).toMatch(/mesures de sel/);
    expect(state.players.P1.resources.sel).toBe(2);

    state.players.P1.resources.sel = 10;
    const reputationBefore = state.players.P1.reputation;
    const ecusBefore = state.players.P1.resources.ecus;
    const done = visitObject(state, world, hero, quest);

    expect(state.players.P1.resources.sel).toBe(4); // le péage est payé
    expect(state.players.P1.resources.ecus).toBeGreaterThan(ecusBefore);
    expect(state.players.P1.reputation).toBeGreaterThan(reputationBefore);
    expect(done.some((e) => e.type === 'ObjectVisited')).toBe(true);

    // Une doléance close ne se rejoue pas.
    const again = visitObject(state, world, hero, quest);
    expect(texts(again)).toMatch(/close/);
  });

  it('refuse la Maison du Trésor tant que les trois sceaux manquent', () => {
    const { state, world } = fixture();
    const hero = state.heroes[state.players.P1.heroes[0]];
    const house = treasury(state);
    house.owner = null;

    state.players.P1.seals = ['farges'];
    const refused = visitObject(state, world, hero, house);
    expect(texts(refused)).toMatch(/scellée|Sceaux/);
    expect(state.claim).toBeNull();

    state.players.P1.seals = ['farges', 'pamole', 'brumes'];
    const accepted = visitObject(state, world, hero, house);
    expect(house.owner).toBe('P1');
    expect(state.claim?.by).toBe('P1');
    expect(accepted.some((e) => e.type === 'ClaimStarted')).toBe(true);
    // L'annonce est publique : elle ne vise aucune bannière en particulier.
    expect(
      accepted.some((e) => e.type === 'Notice' && e.player === null && /proclamation/i.test(e.text)),
    ).toBe(true);
  });
});

describe('bornes armoriées', () => {
  beforeEach(() => registerWorldModule(worldModulePack()));
  afterEach(() => resetEngineModules());

  function twoBornes(state: GameState) {
    const hero = state.heroes[state.players.P1.heroes[0]];
    const a = place(state, 'O_borne_a', 'borne', hero.at.col, hero.at.row, {
      name: 'Borne de départ',
      network: 'marches',
    });
    const other = state.heroes[state.players.P2.heroes[0]];
    const b = place(state, 'O_borne_b', 'borne', other.at.col, other.at.row - 1, {
      name: 'Borne lointaine',
      network: 'marches',
    });
    return { hero, a, b };
  }

  it('ne mène qu’aux pierres déjà découvertes, contre écus et points de marche', () => {
    const { state, world } = fixture();
    const { hero, a, b } = twoBornes(state);

    // Aucune borne découverte : le réseau se tait.
    expect(canUseBorne(state, hero, b).ok).toBe(false);

    visitObject(state, world, hero, a);
    const halfWay = canUseBorne(state, hero, b);
    expect(halfWay.ok).toBe(false);
    expect(halfWay.reason).toMatch(/découverte/);

    b.visitedBy = ['P1'];
    state.players.P1.resources.ecus = 5000;
    hero.movement = hero.movementMax;

    const verdict = canUseBorne(state, hero, b);
    expect(verdict.ok).toBe(true);
    expect(verdict.costEcus).toBe(BORNE_TUNING.costEcus);

    const ecusBefore = state.players.P1.resources.ecus;
    const movementBefore = hero.movement;
    const events = useBorne(state, world, hero, b);

    expect(hero.at).toEqual({ col: b.entrance.col, row: b.entrance.row });
    expect(state.players.P1.resources.ecus).toBe(ecusBefore - BORNE_TUNING.costEcus);
    expect(hero.movement).toBe(movementBefore - BORNE_TUNING.costMovement);
    expect(events.some((e) => e.type === 'HeroMoved')).toBe(true);
  });

  it('borne le nombre de passages par semaine et montre le trajet aux voisins', () => {
    const { state, world } = fixture();
    const { hero, a, b } = twoBornes(state);
    a.visitedBy = ['P1'];
    b.visitedBy = ['P1'];
    state.players.P1.resources.ecus = 50_000;

    // L'arrivée est collée au héros de P2 : le trajet ne peut pas passer inaperçu.
    const seen: string[] = [];
    for (let i = 0; i < BORNE_TUNING.usesPerWeek; i++) {
      hero.movement = hero.movementMax;
      const target = i % 2 === 0 ? b : a;
      const events = useBorne(state, world, hero, target);
      for (const e of events) {
        if (e.type === 'Notice' && e.player === 'P2') seen.push(e.text);
      }
    }
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.join(' ')).toMatch(/bornes ont sonné/);

    expect(borneUsesLeft(state, hero)).toBe(0);
    hero.movement = hero.movementMax;
    const refused = useBorne(state, world, hero, b);
    expect(texts(refused)).toMatch(/passages de la semaine|usé/);
  });
});

describe('météo', () => {
  beforeEach(() => registerWorldModule(worldModulePack()));
  afterEach(() => resetEngineModules());

  it('annonce deux jours à l’avance et fait glisser la file de prévision', () => {
    const { state } = fixture();
    state.weather.current = 'eclaircie';
    state.weather.forecast = ['brume', 'vent'];
    state.weather.delayedBy = null;
    // Aucun lecteur du ciel : la file glisse sans être retenue.
    for (const uid of Object.keys(state.heroes)) state.heroes[uid].def = 'thibaut';

    const events = advanceWeather(state);
    expect(state.weather.current).toBe('brume');
    expect(state.weather.forecast[0]).toBe('vent');
    expect(WEATHER_ORDER).toContain(state.weather.forecast[1]);

    const changed = events.find((e) => e.type === 'WeatherChanged');
    expect(changed).toBeDefined();
    expect(texts(events)).toMatch(/Prévision/);
  });

  it('laisse Côme retarder un front, une seule fois par semaine', () => {
    const { state } = fixture();
    const hero = state.heroes[state.players.P1.heroes[0]];
    hero.def = 'come'; // « Lecture du ciel »
    hero.downUntilTurn = 0;

    state.turn = 1;
    state.weather.current = 'pluie';
    state.weather.forecast = ['eclaircie', 'pluie'];
    state.weather.delayedBy = null;

    // Le front qui arrive (pluie) est contraire, le temps du jour ne l'est pas.
    const first = advanceWeather(state);
    expect(state.weather.current).toBe('eclaircie');
    expect(state.weather.delayedBy).toBe('P1');
    expect(texts(first)).toMatch(/retient le front/);

    // Le lendemain, le report se consomme : le temps ne change pas.
    const kept = state.weather.forecast[0];
    state.turn = 2;
    const second = advanceWeather(state);
    expect(state.weather.current).toBe('eclaircie');
    expect(state.weather.forecast[0]).toBe(kept);
    expect(state.weather.delayedBy).toBeNull();
    expect(texts(second)).toMatch(/arrêté aux crêtes/);

    // Deuxième tentative la même semaine : refusée.
    expect(canDelayFront(state, hero).ok).toBe(false);
  });

  it('donne des modificateurs entiers et neutres par beau temps', () => {
    for (const kind of WEATHER_ORDER) {
      const mods = weatherModifiers(kind);
      for (const value of Object.values(mods)) {
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBeGreaterThan(0);
      }
    }
    expect(weatherModifiers('eclaircie')).toEqual({
      moveBp: 10000,
      visionBp: 10000,
      rangedBp: 10000,
      flyBp: 10000,
      flankBp: 10000,
    });
    // La brume mange la vue et favorise les flancs (document maître §9).
    expect(weatherModifiers('brume').visionBp).toBeLessThan(10000);
    expect(weatherModifiers('brume').flankBp).toBeGreaterThan(10000);
  });
});

describe('gabelle', () => {
  beforeEach(() => registerWorldModule(worldModulePack()));
  afterEach(() => resetEngineModules());

  it('ne rapporte rien sans détenteur, puis croît avec la domination', () => {
    const { state } = fixture();
    expect(treasuryHolder(state)).toBeNull();
    expect(gabelleIncome(state)).toEqual({ ecus: 0, sel: 0, unrest: 0 });

    const house = treasury(state);
    house.owner = 'P1';
    state.gabelle = 'forte';

    const modest = gabelleIncome(state);
    expect(modest.ecus).toBeGreaterThan(0);
    expect(modest.unrest).toBeGreaterThan(0);

    // Anti-emballement : plus on domine, plus on gagne — et plus on agite.
    state.players.P1.seals = ['farges', 'pamole', 'brumes', 'hermitage', 'hautes_futaies'];
    state.players.P1.towns = [...state.players.P1.towns, 'T_a', 'T_b', 'T_c'];
    const dominant = gabelleIncome(state);

    expect(dominant.ecus).toBeGreaterThan(modest.ecus);
    expect(dominant.unrest).toBeGreaterThan(modest.unrest);
    expect(Number.isInteger(dominant.ecus)).toBe(true);
    expect(Number.isInteger(dominant.sel)).toBe(true);

    const report = gabelleReport(state);
    expect(report.policy).toBe('forte');
    expect(report.smugglerBp).toBeGreaterThan(0);
    expect(report.text).toMatch(/Forte gabelle/);

    // La franchise apaise au lieu d'agiter.
    state.gabelle = 'franchise';
    expect(gabelleIncome(state).unrest).toBeLessThan(0);
  });
});

describe('événements de semaine', () => {
  beforeEach(() => registerWorldModule(worldModulePack()));
  afterEach(() => resetEngineModules());

  it('tire une semaine, l’annonce et ne la rejoue jamais deux fois de suite', () => {
    const { state } = fixture();
    let previous: string | null = null;
    for (let week = 0; week < 8; week++) {
      state.turn = 1 + week * 7;
      const events = weeklyEvent(state);
      const passed = events.find((e) => e.type === 'WeekPassed');
      expect(passed).toBeDefined();
      const key = passed && passed.type === 'WeekPassed' ? passed.eventKey : null;
      expect(key).not.toBeNull();
      expect(key).not.toBe(previous);
      expect(currentWeekEvent(state)).toBe(key);
      expect(texts(events)).toMatch(/Semaine \d+/);
      previous = key;
    }
  });
});

describe('victoire', () => {
  beforeEach(() => registerWorldModule(worldModulePack()));
  afterEach(() => resetEngineModules());

  it('décompte la proclamation en public et couronne au jour prévu', () => {
    const { state } = fixture();
    const house = treasury(state);
    house.owner = 'P1';
    state.turn = 3;

    const opening = startClaim(state, 'P1');
    expect(state.claim).not.toBeNull();
    expect(state.claim?.endsAtTurn).toBe(3 + CLAIM_DURATION_TURNS);
    expect(claimRemaining(state)).toBe(CLAIM_DURATION_TURNS);
    expect(opening.some((e) => e.type === 'ClaimStarted')).toBe(true);

    // Chaque palier public est annoncé une fois, et une seule.
    const announcements: number[] = [];
    for (let day = 4; day < 3 + CLAIM_DURATION_TURNS; day++) {
      state.turn = day;
      const events = checkVictory(state);
      const publics = events.filter(
        (e) => e.type === 'Notice' && e.player === null && /[Pp]roclamation|Dernier jour/.test(e.text),
      );
      if (publics.length > 0) announcements.push(claimRemaining(state));
      expect(publics.length).toBeLessThanOrEqual(1);
      expect(state.phase).toBe('aventure');
    }
    expect(announcements).toEqual([14, 7, 3, 1]);

    // Au jour d'échéance, la Couronne tombe.
    state.turn = 3 + CLAIM_DURATION_TURNS;
    const ending = checkVictory(state);
    expect(state.phase).toBe('termine');
    expect(state.winner).toBe('P1');
    expect(ending.some((e) => e.type === 'GameEnded')).toBe(true);
  });

  it('rompt la proclamation dès que la Maison du Trésor change de main', () => {
    const { state } = fixture();
    const house = treasury(state);
    house.owner = 'P1';
    state.turn = 5;
    startClaim(state, 'P1');
    expect(state.claim?.by).toBe('P1');

    house.owner = 'P2';
    state.turn = 9;
    const events = checkVictory(state);

    expect(state.claim).toBeNull();
    expect(events.some((e) => e.type === 'ClaimBroken')).toBe(true);
    expect(state.phase).toBe('aventure');
  });

  it('couronne la dernière bannière debout et sait compter les points', () => {
    const { state } = fixture();
    expect(scoreOf(state, 'P1')).toBeGreaterThan(0);

    // P2 perd tout : cités et héros.
    for (const uid of state.players.P2.towns) {
      state.towns[uid].owner = null;
    }
    state.players.P2.towns = [];
    for (const uid of state.players.P2.heroes) delete state.heroes[uid];
    state.players.P2.heroes = [];

    const events = checkVictory(state);
    expect(events.some((e) => e.type === 'PlayerDefeated')).toBe(true);
    expect(state.winner).toBe('P1');
    expect(state.phase).toBe('termine');
  });
});

describe('magie d’aventure', () => {
  beforeEach(() => registerWorldModule(worldModulePack()));
  afterEach(() => resetEngineModules());

  /** Petite carte de test : deux rives de prairie séparées par une rivière. */
  function pond(): WorldMap {
    const cols = 8;
    const rows = 8;
    const cells = cols * rows;
    const terrain = new Uint8Array(cells).fill(2); // prairie
    const flags = new Uint16Array(cells).fill(CELL_PASSABLE);
    for (let row = 0; row < rows; row++) {
      for (const col of [3, 4]) {
        terrain[row * cols + col] = 7; // eau
        flags[row * cols + col] = 0;
      }
    }
    return {
      cols,
      rows,
      terrain,
      region: new Uint8Array(cells),
      elevation: new Int16Array(cells),
      slope: new Uint8Array(cells),
      flags,
      objectAt: new Uint32Array(cells),
      objects: [],
      anchors: [],
    };
  }

  it('ouvre un gué sur deux cases d’eau et refuse une rivière trop large', () => {
    const { state } = fixture();
    const hero = state.heroes[state.players.P1.heroes[0]];
    const world = pond();
    hero.at = { col: 2, row: 4 };
    hero.spells = ['sources_2'];
    hero.movement = 0;

    expect(checkFord(world, hero, { col: 5, row: 4 }).ok).toBe(true);
    // Une cible sur la même rive ne traverse rien.
    expect(checkFord(world, hero, { col: 1, row: 4 }).ok).toBe(false);

    const events = castAdventureSpell(state, world, hero, 'sources_2', { col: 5, row: 4 });
    expect(hero.at).toEqual({ col: 5, row: 4 });
    expect(hero.movement).toBeGreaterThan(0);
    expect(texts(events)).toMatch(/gué|dalles/i);
    expect(events.some((e) => e.type === 'HeroMoved')).toBe(true);
  });

  it('révèle la carte autour d’une cible et compte en entiers', () => {
    const { state, world } = fixture();
    const hero = state.heroes[state.players.P1.heroes[0]];
    hero.spells = ['brumes_5'];
    const target = { col: hero.at.col + 20, row: hero.at.row + 20 };

    const events = castAdventureSpell(state, world, hero, 'brumes_5', target);
    expect(events.some((e) => e.type === 'FogRevealed')).toBe(true);
    expect(revealRadius(state, hero, 26)).toBeGreaterThanOrEqual(26);
    expect(Number.isInteger(revealRadius(state, hero, 26))).toBe(true);
  });

  it('n’ouvre le Cercle des bornes que vers une pierre déjà vue', () => {
    const { state, world } = fixture();
    const hero = state.heroes[state.players.P1.heroes[0]];
    hero.spells = ['racines_7'];

    const a = place(state, 'O_borne_a', 'borne', hero.at.col, hero.at.row, { name: 'Borne A' });
    const other = state.heroes[state.players.P2.heroes[0]];
    const b = place(state, 'O_borne_b', 'borne', other.at.col, other.at.row - 1, { name: 'Borne B' });
    a.visitedBy = ['P1'];

    const refused = castAdventureSpell(state, world, hero, 'racines_7', b.entrance);
    expect(texts(refused)).toMatch(/inconnue|déjà vues/);
    expect(hero.at).toEqual({ col: a.entrance.col, row: a.entrance.row });

    b.visitedBy = ['P1'];
    const done = castAdventureSpell(state, world, hero, 'racines_7', b.entrance);
    expect(hero.at).toEqual({ col: b.entrance.col, row: b.entrance.row });
    expect(done.some((e) => e.type === 'HeroMoved')).toBe(true);
  });
});

describe('diplomatie', () => {
  beforeEach(() => registerWorldModule(worldModulePack()));
  afterEach(() => resetEngineModules());

  it('ne fait parler que les héros diplomates, et jamais avec certitude', () => {
    const { state } = fixture();
    const hero = state.heroes[state.players.P1.heroes[0]];
    const guard = [{ creature: 'granit_t1', count: 6 }];

    hero.skills = [];
    expect(parleyChance(state, hero, guard).totalBp).toBe(0);

    hero.skills = [{ skill: 'diplomatie', rank: 3 }];
    const strong = parleyChance(state, hero, guard);
    expect(strong.totalBp).toBeGreaterThan(0);
    expect(strong.totalBp).toBeLessThan(10000); // jamais une certitude
    expect(strong.freeBp).toBeLessThanOrEqual(strong.totalBp);
    expect(strong.factors.length).toBeGreaterThan(0);

    // Une compagnie écrasante refuse de répondre.
    const huge = [{ creature: 'granit_t7', count: 400 }];
    expect(parleyChance(state, hero, huge).totalBp).toBe(0);
  });

  it('incorpore la compagnie ralliée dans l’armée du héros', () => {
    const { state, world } = fixture();
    const hero = state.heroes[state.players.P1.heroes[0]];
    hero.skills = [{ skill: 'diplomatie', rank: 3 }];
    state.players.P1.reputation = 25;
    state.players.P1.resources.ecus = 50_000;
    hero.army = [{ creature: 'granit_t1', count: 40 }, null, null, null, null, null, null];

    const camp = place(state, 'O_test_garde', 'garde', hero.at.col, hero.at.row, { ring: 1 });
    camp.guard = [{ creature: 'granit_t2', count: 4 }];

    // Le tirage est borné : on répète jusqu'à obtenir une issue pacifique.
    let joined = false;
    for (let i = 0; i < 40 && !joined; i++) {
      camp.guard = [{ creature: 'granit_t2', count: 4 }];
      camp.spent = false;
      hero.army = [{ creature: 'granit_t1', count: 40 }, null, null, null, null, null, null];
      const events = visitObject(state, world, hero, camp);
      const story = texts(events);
      if (/rejoignent la colonne|bannière derrière la vôtre|solde/.test(story)) joined = true;
    }
    expect(joined).toBe(true);
  });
});

describe('intégration au noyau', () => {
  beforeEach(() => registerWorldModule(worldModulePack()));
  afterEach(() => resetEngineModules());

  it('reste branchable : le noyau joue une semaine entière sans rien casser', () => {
    const { state, world } = fixture(31_337, 3);
    let current = state;
    for (let i = 0; i < 21; i++) {
      const result = applyCommand(current, { type: 'EndTurn' }, world);
      expect(result.ok).toBe(true);
      current = result.state;
    }
    expect(current.turn).toBeGreaterThan(1);
    expect(current.hash).toHaveLength(16);
    // La chronique du monde est bien sérialisée dans l'état, hors carte.
    const ledger = current.objects[LEDGER_UID];
    if (ledger) {
      expect(ledger.at.col).toBeLessThan(0);
      expect(ledger.footprint).toHaveLength(0);
      expect(ledger.spent).toBe(true);
    }
  });

  it('sort intact du baril racine : aucun nom n’entre en collision avec core ou combat', async () => {
    const engine = (await import('../index.js')) as unknown as Record<string, unknown>;
    const contract = [
      'heroStats',
      'skillRank',
      'activeEffects',
      'grantXp',
      'applyLevelChoice',
      'xpForLevel',
      'visitObject',
      'castAdventureSpell',
      'advanceWeather',
      'weatherModifiers',
      'gabelleIncome',
      'checkVictory',
      'weeklyEvent',
      'worldModulePack',
    ];
    for (const name of contract) {
      expect(typeof engine[name], `« ${name} » manque au baril racine`).toBe('function');
    }
    const pack = (engine.worldModulePack as () => Record<string, unknown>)();
    expect(Object.keys(pack).sort()).toEqual(contract.filter((n) => n !== 'worldModulePack').sort());
  });

  it('produit deux fois le même hash pour la même suite de commandes', () => {
    const run = (): string => {
      resetEngineModules();
      registerWorldModule(worldModulePack());
      const { state, world } = fixture(777, 2);
      let current = state;
      for (let i = 0; i < 16; i++) {
        current = applyCommand(current, { type: 'EndTurn' }, world).state;
      }
      return current.hash;
    };
    expect(run()).toBe(run());
  });
});
