/**
 * Clonage d'état rapide et correct.
 *
 * `structuredClone` fonctionne mais recopie l'état par introspection générique
 * et se comporte mal avec les tableaux typés partagés. Le noyau clone donc
 * champ par champ : c'est environ trois fois plus rapide sur un `GameState`
 * complet et cela garantit que le brouillard (`Uint8Array`) est **copié**,
 * jamais partagé entre deux états.
 */
import type {
  ArmyStack,
  ClaimState,
  CombatState,
  CombatUnit,
  GameState,
  HeroInstance,
  MapCoord,
  MapObject,
  PlayerId,
  PlayerState,
  SealId,
  TownState,
} from '../types.js';

/* ── Primitives ─────────────────────────────────────────────────────────── */

export function cloneCoord(c: MapCoord): MapCoord {
  return { col: c.col, row: c.row };
}

export function cloneCoords(list: readonly MapCoord[]): MapCoord[] {
  const out: MapCoord[] = new Array(list.length);
  for (let i = 0; i < list.length; i++) out[i] = { col: list[i].col, row: list[i].row };
  return out;
}

export function cloneFog(fog: Uint8Array): Uint8Array {
  const out = new Uint8Array(fog.length);
  out.set(fog);
  return out;
}

export function cloneArmy(army: readonly (ArmyStack | null)[]): (ArmyStack | null)[] {
  const out: (ArmyStack | null)[] = new Array(army.length);
  for (let i = 0; i < army.length; i++) {
    const s = army[i];
    out[i] = s ? { creature: s.creature, count: s.count } : null;
  }
  return out;
}

export function cloneStacks(list: readonly ArmyStack[]): ArmyStack[] {
  const out: ArmyStack[] = new Array(list.length);
  for (let i = 0; i < list.length; i++) out[i] = { creature: list[i].creature, count: list[i].count };
  return out;
}

/**
 * Clone générique et déterministe : objets simples, tableaux, tableaux typés.
 * Utilisé pour les sacs de données libres (`MapObject.data`) et le combat.
 */
export function cloneDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Uint8Array) return new Uint8Array(value) as unknown as T;
  if (value instanceof Uint16Array) return new Uint16Array(value) as unknown as T;
  if (value instanceof Uint32Array) return new Uint32Array(value) as unknown as T;
  if (value instanceof Int8Array) return new Int8Array(value) as unknown as T;
  if (value instanceof Int16Array) return new Int16Array(value) as unknown as T;
  if (value instanceof Int32Array) return new Int32Array(value) as unknown as T;
  if (Array.isArray(value)) {
    const out: unknown[] = new Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = cloneDeep(value[i]);
    return out as unknown as T;
  }
  const src = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(src)) out[k] = cloneDeep(src[k]);
  return out as unknown as T;
}

/* ── Entités ────────────────────────────────────────────────────────────── */

export function cloneHero(h: HeroInstance): HeroInstance {
  return {
    uid: h.uid,
    def: h.def,
    owner: h.owner,
    level: h.level,
    xp: h.xp,
    vaillance: h.vaillance,
    garde: h.garde,
    mystique: h.mystique,
    savoir: h.savoir,
    mana: h.mana,
    manaMax: h.manaMax,
    movement: h.movement,
    movementMax: h.movementMax,
    at: { col: h.at.col, row: h.at.row },
    facing: h.facing,
    army: cloneArmy(h.army),
    artifacts: { ...h.artifacts },
    backpack: h.backpack.slice(),
    skills: h.skills.map((s) => ({ skill: s.skill, rank: s.rank })),
    spells: h.spells.slice(),
    inTown: h.inTown,
    downUntilTurn: h.downUntilTurn,
    pendingLevelUp: h.pendingLevelUp
      ? {
          choices: [
            { skill: h.pendingLevelUp.choices[0].skill, rank: h.pendingLevelUp.choices[0].rank },
            { skill: h.pendingLevelUp.choices[1].skill, rank: h.pendingLevelUp.choices[1].rank },
          ],
          primary: h.pendingLevelUp.primary,
        }
      : null,
    path: h.path ? cloneCoords(h.path) : null,
  };
}

export function cloneTown(t: TownState): TownState {
  return {
    uid: t.uid,
    name: t.name,
    faction: t.faction,
    owner: t.owner,
    at: { col: t.at.col, row: t.at.row },
    built: t.built.slice(),
    builtThisTurn: t.builtThisTurn,
    available: { ...t.available },
    garrison: cloneArmy(t.garrison),
    visitingHero: t.visitingHero,
    garrisonHero: t.garrisonHero,
    spells: t.spells.slice(),
    charter: t.charter,
    isCapital: t.isCapital,
    unrest: t.unrest,
  };
}

export function clonePlayer(p: PlayerState): PlayerState {
  const out: PlayerState = {
    id: p.id,
    name: p.name,
    faction: p.faction,
    color: p.color,
    pattern: p.pattern,
    kind: p.kind,
    resources: {
      ecus: p.resources.ecus,
      bois: p.resources.bois,
      granit: p.resources.granit,
      fer: p.resources.fer,
      sel: p.resources.sel,
      essence: p.resources.essence,
      filDor: p.resources.filDor,
    },
    heroes: p.heroes.slice(),
    towns: p.towns.slice(),
    fog: cloneFog(p.fog),
    seals: p.seals.slice(),
    alive: p.alive,
    reputation: p.reputation,
    buildQueue: p.buildQueue.map((q) => ({ town: q.town, building: q.building })),
    tavernOffers: p.tavernOffers.slice(),
  };
  if (p.aiProfile !== undefined) out.aiProfile = p.aiProfile;
  if (p.defeatedAtTurn !== undefined) out.defeatedAtTurn = p.defeatedAtTurn;
  return out;
}

export function cloneObject(o: MapObject): MapObject {
  const out: MapObject = {
    uid: o.uid,
    kind: o.kind,
    at: { col: o.at.col, row: o.at.row },
    footprint: cloneCoords(o.footprint),
    entrance: { col: o.entrance.col, row: o.entrance.row },
    owner: o.owner,
    data: cloneDeep(o.data),
  };
  if (o.guard) out.guard = cloneStacks(o.guard);
  if (o.visitedBy) out.visitedBy = o.visitedBy.slice();
  if (o.spent !== undefined) out.spent = o.spent;
  return out;
}

export function cloneCombatUnit(u: CombatUnit): CombatUnit {
  return {
    uid: u.uid,
    side: u.side,
    slot: u.slot,
    creature: u.creature,
    count: u.count,
    startCount: u.startCount,
    topHp: u.topHp,
    at: { col: u.at.col, row: u.at.row },
    facing: u.facing,
    attack: u.attack,
    defense: u.defense,
    speed: u.speed,
    initiative: u.initiative,
    shots: u.shots,
    morale: u.morale,
    fortune: u.fortune,
    hasMoved: u.hasMoved,
    hasWaited: u.hasWaited,
    retaliationsLeft: u.retaliationsLeft,
    defending: u.defending,
    effects: u.effects.map((e) => ({ ...e })),
    alive: u.alive,
    lastMoveDistance: u.lastMoveDistance,
  };
}

export function cloneCombat(c: CombatState): CombatState {
  const out: CombatState = {
    id: c.id,
    attacker: { player: c.attacker.player, hero: c.attacker.hero },
    defender: { player: c.defender.player, hero: c.defender.hero, town: c.defender.town },
    units: c.units.map(cloneCombatUnit),
    obstacles: c.obstacles.map((o) => ({ ...o, at: { col: o.at.col, row: o.at.row } })),
    terrain: c.terrain,
    region: c.region,
    weather: c.weather,
    siege: c.siege,
    round: c.round,
    order: c.order.slice(),
    activeIndex: c.activeIndex,
    spellCastThisRound: { ...c.spellCastThisRound },
    log: c.log.map((l) => (l.detail ? { ...l, detail: { ...l.detail } } : { ...l })),
    finished: c.finished,
    winner: c.winner,
  };
  if (c.loot) {
    out.loot = {
      resources: { ...c.loot.resources },
      artifacts: c.loot.artifacts.slice(),
      xp: c.loot.xp,
    };
  }
  return out;
}

export function cloneClaim(c: ClaimState | null): ClaimState | null {
  return c ? { by: c.by, startedTurn: c.startedTurn, endsAtTurn: c.endsAtTurn } : null;
}

/* ── État complet ───────────────────────────────────────────────────────── */

/**
 * Clone complet d'un `GameState`. Le résultat ne partage **aucune** référence
 * mutable avec l'original : deux états peuvent évoluer indépendamment.
 */
export function cloneState(state: GameState): GameState {
  const players = {} as Record<PlayerId, PlayerState>;
  for (const id of Object.keys(state.players) as PlayerId[]) {
    players[id] = clonePlayer(state.players[id]);
  }

  const heroes: Record<string, HeroInstance> = {};
  for (const uid of Object.keys(state.heroes)) heroes[uid] = cloneHero(state.heroes[uid]);

  const towns: Record<string, TownState> = {};
  for (const uid of Object.keys(state.towns)) towns[uid] = cloneTown(state.towns[uid]);

  const objects: Record<string, MapObject> = {};
  for (const uid of Object.keys(state.objects)) objects[uid] = cloneObject(state.objects[uid]);

  const seals = {} as Record<SealId, { owner: PlayerId | null; at: MapCoord }>;
  for (const id of Object.keys(state.seals) as SealId[]) {
    const s = state.seals[id];
    seals[id] = { owner: s.owner, at: { col: s.at.col, row: s.at.row } };
  }

  return {
    engineVersion: state.engineVersion,
    contentVersion: state.contentVersion,
    mapVersion: state.mapVersion,
    id: state.id,
    seed: state.seed,
    rng: { hi: state.rng.hi, lo: state.rng.lo, inchi: state.rng.inchi, inclo: state.rng.inclo },
    turn: state.turn,
    activePlayer: state.activePlayer,
    turnOrder: state.turnOrder.slice(),
    players,
    heroes,
    towns,
    objects,
    weather: {
      current: state.weather.current,
      forecast: [state.weather.forecast[0], state.weather.forecast[1]],
      delayedBy: state.weather.delayedBy,
    },
    gabelle: state.gabelle,
    seals,
    claim: cloneClaim(state.claim),
    phase: state.phase,
    combat: state.combat ? cloneCombat(state.combat) : null,
    winner: state.winner,
    endReason: state.endReason,
    nextUid: state.nextUid,
    journal: state.journal.map((j) => ({
      turn: j.turn,
      player: j.player,
      text: j.text,
      kind: j.kind,
    })),
    hash: state.hash,
  };
}
