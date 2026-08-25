/**
 * `applyCommand` — l'unique porte de mutation de l'état.
 *
 * Contrat (docs/02-API.md) :
 *  1. valider la commande et refuser en français si elle est invalide ;
 *  2. cloner l'état (le brouillard `Uint8Array` est copié, jamais partagé) ;
 *  3. appliquer, collecter les `GameEvent[]` ;
 *  4. recalculer `state.hash = hashState(state)` ;
 *  5. ne jamais utiliser `Math.random`.
 *
 * Un refus laisse l'état d'origine **strictement intact** : c'est ce qui rend
 * les commandes idempotentes côté serveur et les rejeux vérifiables.
 */
import {
  RESOURCE_KEYS,
  type ArmyHolderRef,
  type ArmyStack,
  type ArtifactSlot,
  type Command,
  type CommandResult,
  type GameEvent,
  type GameState,
  type HeroInstance,
  type MapObject,
  type PlayerId,
  type Resources,
  type TownState,
  type WorldMap,
} from '../types.js';
import { hashState } from '../hash.js';
import {
  BORNE_COST_ECUS,
  BORNE_COST_MOVEMENT,
  HERO_HIRE_COST,
  HERO_LIMIT,
} from './constants.js';
import { cloneState } from './clone.js';
import { createGame } from './create-game.js';
import { content, worldModule, combatModule } from './registry.js';
import {
  addToArmy,
  applyBuildingGrants,
  buildCost,
  canBuild,
  canRecruit,
  canUpgrade,
  applyUpgrade,
  recruitCost,
  tradeOutcome,
} from './economy.js';
import { computePath, bumpPathRevision, invalidateWorldCache } from './pathfinding.js';
import { executeMove, objectAtCell, townAtCell } from './movement.js';
import { revealFog } from './fog.js';
import { endTurn, journal, journalFromEvents, visionOf } from './turn.js';

import { formatCost, sameCoord, subResources } from './util.js';

/* ── Suites d'un combat contre la garde d'un lieu ───────────────────────── */

/**
 * Ce qu'il faut retenir d'un combat **avant** de le résoudre : `resolveCombat­Outcome`
 * remet `state.combat` à `null`, et l'on ne peut plus rien lire ensuite.
 */
interface GardeEnJeu {
  /** lieu dont la garde était en défense */
  objet: string;
  /** héros assaillant */
  heros: string;
}

/**
 * Un combat oppose-t-il un héros à la **garde d'un lieu de carte** ?
 *
 * Trois `null` en défense signent le cas : ni joueur, ni héros, ni cité. C'est
 * la forme exacte que `executeMove` donne au camp adverse quand un héros
 * arrive sur l'entrée d'un gisement, d'un sceau ou d'un camp gardé.
 */
function gardeEnJeu(state: GameState): GardeEnJeu | null {
  const combat = state.combat;
  if (!combat || !combat.finished) return null;
  if (combat.defender.player !== null) return null;
  if (combat.defender.hero !== null || combat.defender.town !== null) return null;
  const heros = combat.attacker.hero;
  if (!heros) return null;
  const instance = state.heroes[heros];
  if (!instance) return null;

  /* Le héros se tient sur l'entrée : c'est l'invariant que pose `executeMove`
     avant d'engager le combat. On préfère l'entrée à la case-ancre, parce
     qu'un lieu à plusieurs cases ne se prend que par sa porte. */
  for (const uid of Object.keys(state.objects).sort()) {
    const obj = state.objects[uid];
    if (!obj.guard || obj.guard.length === 0) continue;
    if (sameCoord(obj.entrance, instance.at)) return { objet: uid, heros };
  }
  return null;
}

/**
 * Rend à un lieu de carte les survivants de sa garde, puis — si elle est
 * tombée — laisse le vainqueur en prendre possession sur-le-champ.
 *
 * **Pourquoi cette fonction existe.** Sans elle, la garde d'un lieu ne
 * diminuait jamais : `resolveCombatOutcome` sait rendre son armée au
 * vainqueur, garnir une cité prise et distribuer l'expérience, mais le lieu
 * de carte, lui, n'apparaît nulle part dans `CombatState` — le camp défenseur
 * n'y est décrit que par trois `null`. Le gisement se relevait donc intact au
 * tour suivant, et le suivant, indéfiniment.
 *
 * Ce que cela coûtait, mesuré sur vingt parties complètes à quatre bannières :
 * **zéro gisement, zéro Sceau des Marches, zéro cité gardée pris** — par qui
 * que ce soit, en douze semaines. Une bataille rapportait de l'expérience et
 * des dépouilles mais ne prenait rien ; la Couronne était donc inatteignable,
 * et toutes les parties se réglaient au score de fin de chronique. Le profil
 * d'IA le plus immobile gagnait trois fois sur quatre, ce qui n'est pas un
 * défaut de l'IA mais la lecture correcte d'un monde où rien ne se conquiert.
 *
 * L'appel à `visitObject` juste après la victoire n'est pas une commodité :
 * `executeMove` a interrompu la marche pour engager le combat et ne la
 * reprendra pas, et le héros se tient déjà sur l'entrée — sans cet appel, il
 * faudrait le faire sortir puis rentrer pour encaisser ce qu'il vient de
 * gagner.
 */
function reglerGarde(
  state: GameState,
  world: WorldMap,
  garde: GardeEnJeu,
  survivants: ArmyStack[],
  vainqueur: 0 | 1 | null,
): GameEvent[] {
  const obj = state.objects[garde.objet];
  if (!obj) return [];
  obj.guard = survivants;

  const events: GameEvent[] = [];
  if (vainqueur !== 0 || survivants.length > 0) return events;

  const hero = state.heroes[garde.heros];
  if (!hero || hero.downUntilTurn > state.turn) return events;
  events.push(...worldModule().visitObject(state, world, hero, obj));
  return events;
}

/** Piles encore debout dans un camp, prêtes à être réécrites dans un lieu. */
function survivantsDe(state: GameState, side: 0 | 1): ArmyStack[] {
  const combat = state.combat;
  if (!combat) return [];
  const out: ArmyStack[] = [];
  for (const u of combat.units) {
    /* Les invocations portent un emplacement négatif : elles ne rejoignent
       jamais la garde d'un lieu, elles se dissipent avec la bataille. */
    if (u.side !== side || u.slot < 0) continue;
    if (!u.alive || u.count <= 0) continue;
    out.push({ creature: u.creature, count: u.count });
  }
  return out;
}

/* ── Sortie de partie ───────────────────────────────────────────────────── */

/**
 * Rend à la neutralité tout ce qu'une bannière tenait sur la carte.
 *
 * Extrait de la reddition, qui était le **seul** endroit à le faire :
 * l'extinction automatique de `checkVictory` posait `p.alive = false` sans
 * toucher à `state.objects`, si bien que les gisements d'une maison morte
 * gardaient ses couleurs — et son score de gisements — jusqu'à la fin de la
 * partie. Les deux sorties de partie appellent désormais la même fonction,
 * pour qu'elles ne puissent plus diverger.
 *
 * Les cités ne passent pas par ici : elles vivent dans `state.towns` et chaque
 * sortie les traite à sa façon (la reddition les rend, l'extinction ne survient
 * qu'une fois qu'il n'en reste aucune).
 */
export function abaisserPavois(state: GameState, player: PlayerId): void {
  for (const uid of Object.keys(state.objects)) {
    if (state.objects[uid].owner === player) state.objects[uid].owner = null;
  }
}

/* ── Résultats ──────────────────────────────────────────────────────────── */

function refuse(state: GameState, error: string): CommandResult {
  return { state, events: [], ok: false, error };
}

function accept(state: GameState, events: GameEvent[]): CommandResult {
  journalFromEvents(state, events);
  state.hash = hashState(state as unknown as Record<string, unknown>);
  bumpPathRevision();
  return { state, events, ok: true };
}

/* ── Aides de validation ────────────────────────────────────────────────── */

function requireHero(
  state: GameState,
  uid: string,
  player: PlayerId,
): { hero?: HeroInstance; error?: string } {
  const hero = state.heroes[uid];
  if (!hero) return { error: `Héros introuvable : « ${uid} ».` };
  if (hero.owner !== player) return { error: 'Ce héros ne porte pas votre bannière.' };
  if (hero.downUntilTurn > state.turn) {
    return {
      error: `Ce héros est encore indisponible (il reprend le jour ${hero.downUntilTurn}).`,
    };
  }
  return { hero };
}

function requireTown(
  state: GameState,
  uid: string,
  player: PlayerId,
): { town?: TownState; error?: string } {
  const town = state.towns[uid];
  if (!town) return { error: `Cité introuvable : « ${uid} ».` };
  if (town.owner !== player) return { error: `${town.name} ne porte pas votre bannière.` };
  return { town };
}

function pay(state: GameState, player: PlayerId, cost: Partial<Resources>): void {
  const p = state.players[player];
  if (!p) return;
  subResources(p.resources, cost);
  for (const k of RESOURCE_KEYS) {
    if (p.resources[k] < 0) p.resources[k] = 0;
  }
}

function deltaOf(cost: Partial<Resources>): Partial<Resources> {
  const out: Partial<Resources> = {};
  for (const k of RESOURCE_KEYS) {
    const c = cost[k];
    if (c) out[k] = -c;
  }
  return out;
}

function armyOf(state: GameState, ref: ArmyHolderRef): (ArmyStack | null)[] | null {
  if (ref.kind === 'hero') return state.heroes[ref.uid]?.army ?? null;
  return state.towns[ref.uid]?.garrison ?? null;
}

function holderOwner(state: GameState, ref: ArmyHolderRef): PlayerId | null {
  if (ref.kind === 'hero') return state.heroes[ref.uid]?.owner ?? null;
  return state.towns[ref.uid]?.owner ?? null;
}

function holderCell(state: GameState, ref: ArmyHolderRef): { col: number; row: number } | null {
  if (ref.kind === 'hero') {
    const h = state.heroes[ref.uid];
    return h ? h.at : null;
  }
  const t = state.towns[ref.uid];
  return t ? t.at : null;
}

/* ── Point d'entrée ─────────────────────────────────────────────────────── */

export function applyCommand(state: GameState, cmd: Command, world: WorldMap): CommandResult {
  // Une nouvelle partie remplace l'état : elle ne se clone pas.
  if (cmd.type === 'StartGame') {
    try {
      const fresh = createGame(cmd.setup, world);
      return { state: fresh, events: [{ type: 'GameStarted', turn: fresh.turn }], ok: true };
    } catch (err) {
      return refuse(state, err instanceof Error ? err.message : 'Création de partie impossible.');
    }
  }

  if (state.phase === 'termine') {
    return refuse(state, 'La partie est terminée : plus aucune commande n’est acceptée.');
  }

  const player = state.activePlayer;
  const active = state.players[player];
  if (!active || !active.alive) {
    return refuse(state, 'Le joueur actif n’est plus en lice.');
  }

  const combatOnly = cmd.type === 'CombatAction' || cmd.type === 'AutoResolveCombat';
  if (state.phase === 'combat' && !combatOnly) {
    return refuse(state, 'Un combat est en cours : résolvez-le avant toute autre action.');
  }
  if (state.phase !== 'combat' && combatOnly) {
    return refuse(state, 'Aucun combat en cours.');
  }

  const next = cloneState(state);
  const events: GameEvent[] = [];

  switch (cmd.type) {
    /* ── Déplacement ──────────────────────────────────────────────────── */
    case 'MoveHero': {
      const found = requireHero(next, cmd.hero, player);
      if (!found.hero) return refuse(state, found.error as string);
      const hero = found.hero;
      if (sameCoord(hero.at, cmd.to)) {
        return refuse(state, 'Le héros se trouve déjà sur cette case.');
      }
      if (hero.movement <= 0) {
        return refuse(state, 'Ce héros n’a plus de points de marche aujourd’hui.');
      }
      const route = computePath(world, next, hero, cmd.to);
      if (!route || route.path.length === 0) {
        return refuse(state, 'Aucun chemin praticable ne mène à cette case.');
      }
      const outcome = executeMove(next, world, hero, route.path, route.costs, {
        vision: visionOf(next, hero.uid),
        mods: [],
      });
      events.push(...outcome.events);
      if (outcome.steps.length === 0) {
        return refuse(state, outcome.stopped ?? 'Le héros ne peut pas avancer.');
      }
      if (outcome.stopped) journal(next, player, outcome.stopped, 'info');
      if (outcome.combatStarted) invalidateWorldCache(world);
      break;
    }

    /* ── Interaction explicite ────────────────────────────────────────── */
    case 'HeroInteract': {
      const found = requireHero(next, cmd.hero, player);
      if (!found.hero) return refuse(state, found.error as string);
      const hero = found.hero;
      const obj: MapObject | undefined = next.objects[cmd.object];
      if (!obj) return refuse(state, `Objet introuvable : « ${cmd.object} ».`);
      if (!sameCoord(hero.at, obj.entrance)) {
        return refuse(state, 'Le héros doit se tenir sur l’entrée de ce lieu pour y agir.');
      }
      if (obj.spent) return refuse(state, 'Ce lieu a déjà été visité.');
      if (obj.guard && obj.guard.length > 0) {
        return refuse(state, 'Une garde neutre défend ce lieu : il faut la vaincre.');
      }
      const visitEvents = worldModule().visitObject(next, world, hero, obj);
      if (visitEvents.length === 0) {
        return refuse(state, 'Il n’y a rien à faire ici.');
      }
      events.push(...visitEvents);
      break;
    }

    /* ── Cité : construction ──────────────────────────────────────────── */
    case 'BuildInTown': {
      const found = requireTown(next, cmd.town, player);
      if (!found.town) return refuse(state, found.error as string);
      const town = found.town;
      const verdict = canBuild(next, town, cmd.building);
      if (!verdict.ok) return refuse(state, verdict.reason as string);

      const cost = buildCost(next, town, cmd.building);
      pay(next, player, cost);
      town.built.push(cmd.building);
      town.built.sort();
      town.builtThisTurn = true;
      applyBuildingGrants(town, cmd.building);

      const def = content().BUILDINGS[cmd.building];
      events.push({ type: 'ResourcesChanged', player, delta: deltaOf(cost), reason: 'construction' });
      events.push({ type: 'BuildingBuilt', town: town.uid, building: cmd.building });
      events.push({
        type: 'Notice',
        player,
        text: `${def ? def.name : cmd.building} s’élève à ${town.name} (${formatCost(cost)}).`,
        severity: 'info',
      });
      break;
    }

    /* ── Cité : recrutement ───────────────────────────────────────────── */
    case 'RecruitCreatures': {
      const found = requireTown(next, cmd.town, player);
      if (!found.town) return refuse(state, found.error as string);
      const town = found.town;
      const verdict = canRecruit(next, town, cmd.creature, cmd.count);
      if (!verdict.ok) return refuse(state, verdict.reason as string);

      let target: (ArmyStack | null)[] = town.garrison;
      if (cmd.toHero) {
        const heroFound = requireHero(next, cmd.toHero, player);
        if (!heroFound.hero) return refuse(state, heroFound.error as string);
        if (heroFound.hero.inTown !== town.uid && !sameCoord(heroFound.hero.at, town.at)) {
          return refuse(state, 'Ce héros n’est pas dans la cité : il ne peut pas lever ces troupes.');
        }
        target = heroFound.hero.army;
      }
      if (!addToArmy(target, cmd.creature, cmd.count)) {
        return refuse(state, 'Les sept emplacements d’armée sont déjà occupés.');
      }
      town.available[cmd.creature] = (town.available[cmd.creature] ?? 0) - cmd.count;
      const cost = recruitCost(cmd.creature, cmd.count);
      pay(next, player, cost);
      events.push({ type: 'ResourcesChanged', player, delta: deltaOf(cost), reason: 'recrutement' });
      events.push({
        type: 'CreaturesRecruited',
        town: town.uid,
        creature: cmd.creature,
        count: cmd.count,
      });
      break;
    }

    /* ── Cité : amélioration ──────────────────────────────────────────── */
    case 'UpgradeCreatures': {
      const found = requireTown(next, cmd.town, player);
      if (!found.town) return refuse(state, found.error as string);
      const town = found.town;
      const verdict = canUpgrade(next, town, cmd.from, cmd.count);
      if (!verdict.ok || !verdict.to || !verdict.cost) {
        return refuse(state, verdict.reason as string);
      }
      const done = applyUpgrade(next, town, cmd.from, verdict.to, cmd.count);
      if (done <= 0) return refuse(state, 'Aucune créature n’a pu être améliorée.');
      pay(next, player, verdict.cost);
      const upDef = content().CREATURES[verdict.to];
      events.push({ type: 'ResourcesChanged', player, delta: deltaOf(verdict.cost), reason: 'amélioration' });
      events.push({
        type: 'Notice',
        player,
        text: `${done} créature(s) deviennent ${upDef ? upDef.namePlural : verdict.to}.`,
        severity: 'info',
      });
      break;
    }

    /* ── Auberge ──────────────────────────────────────────────────────── */
    case 'HireHero': {
      const found = requireTown(next, cmd.town, player);
      if (!found.town) return refuse(state, found.error as string);
      const town = found.town;
      let hasTavern = false;
      for (const id of town.built) {
        const def = content().BUILDINGS[id];
        if (!def) continue;
        for (const g of def.grants) if (g.kind === 'tavern') hasTavern = true;
      }
      if (!hasTavern) return refuse(state, `${town.name} n’a pas d’auberge des Bannières.`);
      const p = next.players[player];
      if (p.heroes.length >= HERO_LIMIT) {
        return refuse(state, `Quatre héros au maximum par bannière.`);
      }
      for (const uid of Object.keys(next.heroes)) {
        if (next.heroes[uid].def === cmd.hero) {
          return refuse(state, 'Ce héros est déjà engagé dans la partie.');
        }
      }
      if (!content().HEROES[cmd.hero]) {
        return refuse(state, `Héros inconnu : « ${cmd.hero} ».`);
      }
      /* Par la COUTURE (`worldModule()`), comme `heroStats` et `visitObject` :
         l'import direct du repli tirait d'un AUTRE barème que l'auberge de la
         carte et que le baril public — la prévision du client annonçait un
         capitaine, le moteur en tirait un autre et refusait. */
      if (p.tavernOffers.length === 0) {
        p.tavernOffers = worldModule().drawTavernOffers(next, player);
      }
      if (p.tavernOffers.length > 0 && !p.tavernOffers.includes(cmd.hero)) {
        return refuse(state, 'Ce héros ne se présente pas à l’auberge aujourd’hui.');
      }
      if (p.resources.ecus < HERO_HIRE_COST) {
        return refuse(state, `Recruter un héros coûte ${HERO_HIRE_COST} écus.`);
      }
      if (town.visitingHero) {
        return refuse(state, 'Un héros occupe déjà la cité : déplacez-le d’abord.');
      }

      pay(next, player, { ecus: HERO_HIRE_COST });
      const uid = `H${next.nextUid++}`;
      const def = content().hero(cmd.hero);
      const hero: HeroInstance = {
        uid,
        def: cmd.hero,
        owner: player,
        level: 1,
        xp: 0,
        vaillance: def.start.vaillance,
        garde: def.start.garde,
        mystique: def.start.mystique,
        savoir: def.start.savoir,
        mana: 0,
        manaMax: 0,
        movement: 0,
        movementMax: 0,
        at: { col: town.at.col, row: town.at.row },
        facing: 4,
        army: [null, null, null, null, null, null, null],
        artifacts: {},
        backpack: [],
        skills: def.start.skills.map((s) => ({ skill: s.skill, rank: s.rank })),
        spells: def.start.spells.slice(),
        inTown: town.uid,
        downUntilTurn: 0,
        pendingLevelUp: null,
        path: null,
      };
      for (const stack of def.start.army) addToArmy(hero.army, stack.creature, stack.count);
      const stats = worldModule().heroStats(next, hero);
      hero.manaMax = stats.manaMax;
      hero.mana = stats.manaMax;
      hero.movementMax = stats.movementMax;
      hero.movement = stats.movementMax;
      next.heroes[uid] = hero;
      p.heroes.push(uid);
      p.heroes.sort();
      p.tavernOffers = p.tavernOffers.filter((h) => h !== cmd.hero);
      town.visitingHero = uid;

      events.push({ type: 'ResourcesChanged', player, delta: { ecus: -HERO_HIRE_COST }, reason: 'auberge' });
      events.push({ type: 'HeroHired', player, hero: uid });
      const cells = revealFog(next, world, player, hero.at, visionOf(next, uid));
      if (cells.length > 0) events.push({ type: 'FogRevealed', player, cells });
      break;
    }

    /* ── Échange de troupes ───────────────────────────────────────────── */
    case 'SwapArmy': {
      if (holderOwner(next, cmd.a) !== player || holderOwner(next, cmd.b) !== player) {
        return refuse(state, 'Les deux armées doivent porter votre bannière.');
      }
      const a = armyOf(next, cmd.a);
      const b = armyOf(next, cmd.b);
      if (!a || !b) return refuse(state, 'Armée introuvable.');
      const ca = holderCell(next, cmd.a);
      const cb = holderCell(next, cmd.b);
      if (!ca || !cb || !sameCoord(ca, cb)) {
        return refuse(state, 'Les deux armées doivent se trouver au même endroit.');
      }
      if (cmd.slotA < 0 || cmd.slotA >= a.length || cmd.slotB < 0 || cmd.slotB >= b.length) {
        return refuse(state, 'Emplacement d’armée invalide.');
      }
      const from = a[cmd.slotA];
      const to = b[cmd.slotB];
      if (!from) return refuse(state, 'L’emplacement de départ est vide.');

      const count = cmd.count === undefined ? from.count : cmd.count;
      if (!Number.isInteger(count) || count <= 0 || count > from.count) {
        return refuse(state, 'Le nombre de créatures déplacées est invalide.');
      }
      if (to && to.creature === from.creature) {
        to.count += count;
        from.count -= count;
        if (from.count === 0) a[cmd.slotA] = null;
      } else if (!to) {
        b[cmd.slotB] = { creature: from.creature, count };
        from.count -= count;
        if (from.count === 0) a[cmd.slotA] = null;
      } else {
        if (count !== from.count) {
          return refuse(state, 'On ne peut pas fractionner une pile sur un emplacement occupé.');
        }
        a[cmd.slotA] = to;
        b[cmd.slotB] = from;
      }
      const lastHero = cmd.a.kind === 'hero' ? next.heroes[cmd.a.uid] : null;
      if (lastHero && lastHero.army.every((s) => s === null)) {
        // Un héros sans troupe reste vivant mais ne peut plus attaquer.
        journal(next, player, 'Ce héros n’a plus aucune troupe.', 'warn');
      }
      events.push({
        type: 'Notice',
        player,
        text: 'Les troupes sont réorganisées.',
        severity: 'info',
      });
      break;
    }

    /* ── Artefacts ────────────────────────────────────────────────────── */
    case 'EquipArtifact': {
      const found = requireHero(next, cmd.hero, player);
      if (!found.hero) return refuse(state, found.error as string);
      const hero = found.hero;
      const index = hero.backpack.indexOf(cmd.artifact);
      if (index < 0) return refuse(state, 'Cet artefact n’est pas dans la besace du héros.');
      const def = content().ARTIFACTS[cmd.artifact];
      if (!def) return refuse(state, `Artefact inconnu : « ${cmd.artifact} ».`);
      const ringSwap =
        (def.slot === 'anneau1' || def.slot === 'anneau2') &&
        (cmd.slot === 'anneau1' || cmd.slot === 'anneau2');
      if (def.slot !== cmd.slot && !ringSwap) {
        return refuse(state, `${def.name} ne se porte pas à cet emplacement.`);
      }
      const previous = hero.artifacts[cmd.slot as ArtifactSlot];
      if (previous) hero.backpack.push(previous);
      hero.backpack.splice(index, 1);
      hero.artifacts[cmd.slot as ArtifactSlot] = cmd.artifact;
      const stats = worldModule().heroStats(next, hero);
      hero.movementMax = stats.movementMax;
      hero.manaMax = stats.manaMax;
      events.push({
        type: 'Notice',
        player,
        text: `${def.name} est équipé.`,
        severity: 'info',
      });
      break;
    }

    case 'UnequipArtifact': {
      const found = requireHero(next, cmd.hero, player);
      if (!found.hero) return refuse(state, found.error as string);
      const hero = found.hero;
      const current = hero.artifacts[cmd.slot];
      if (!current) return refuse(state, 'Aucun artefact à cet emplacement.');
      delete hero.artifacts[cmd.slot];
      hero.backpack.push(current);
      const stats = worldModule().heroStats(next, hero);
      hero.movementMax = stats.movementMax;
      hero.manaMax = stats.manaMax;
      hero.movement = Math.min(hero.movement, hero.movementMax);
      events.push({
        type: 'Notice',
        player,
        text: `${content().ARTIFACTS[current]?.name ?? current} rejoint la besace.`,
        severity: 'info',
      });
      break;
    }

    /* ── Magie d'aventure ─────────────────────────────────────────────── */
    case 'CastAdventureSpell': {
      const found = requireHero(next, cmd.hero, player);
      if (!found.hero) return refuse(state, found.error as string);
      const hero = found.hero;
      if (!hero.spells.includes(cmd.spell)) {
        return refuse(state, 'Ce héros ne connaît pas ce sort.');
      }
      const def = content().SPELLS[cmd.spell];
      if (!def) return refuse(state, `Sort inconnu : « ${cmd.spell} ».`);
      if (def.scope === 'combat') {
        return refuse(state, `${def.name} ne se lance qu’en bataille.`);
      }
      let cost = def.cost;
      const hdef = content().HEROES[hero.def];
      if (hdef) {
        if (hdef.specialty.kind === 'spell' && hdef.specialty.spell === cmd.spell) {
          cost = Math.max(1, Math.trunc((cost * hdef.specialty.costBp) / 10000));
        } else if (hdef.specialty.kind === 'school' && hdef.specialty.school === def.school) {
          cost = Math.max(1, Math.trunc((cost * hdef.specialty.costBp) / 10000));
        }
      }
      if (hero.mana < cost) {
        return refuse(state, `Mana insuffisant : ${def.name} coûte ${cost} points.`);
      }
      hero.mana -= cost;
      const spellEvents = worldModule().castAdventureSpell(next, world, hero, cmd.spell, cmd.target);
      events.push(...spellEvents);
      events.push({
        type: 'Notice',
        player,
        text: `${def.name} est lancé (${cost} mana).`,
        severity: 'info',
      });
      break;
    }

    /* ── Progression ──────────────────────────────────────────────────── */
    case 'ChooseLevelUp': {
      const found = requireHero(next, cmd.hero, player);
      if (!found.hero) return refuse(state, found.error as string);
      const hero = found.hero;
      if (!hero.pendingLevelUp) {
        return refuse(state, 'Ce héros n’a aucun choix de niveau en attente.');
      }
      if (!hero.pendingLevelUp.choices.some((c) => c.skill === cmd.skill)) {
        return refuse(state, 'Cette compétence ne fait pas partie des deux propositions.');
      }
      events.push(...worldModule().applyLevelChoice(next, hero, cmd.skill));
      break;
    }

    /* ── Chartes et gabelle ───────────────────────────────────────────── */
    case 'SetCharter': {
      const found = requireTown(next, cmd.town, player);
      if (!found.town) return refuse(state, found.error as string);
      const town = found.town;
      if (town.isCapital) {
        return refuse(state, 'Une capitale ne reçoit pas de charte de village.');
      }
      if (town.charter) {
        return refuse(state, `${town.name} a déjà choisi sa charte : elle est permanente.`);
      }
      town.charter = cmd.charter;
      events.push({
        type: 'Notice',
        player,
        text: `${town.name} adopte la charte ${cmd.charter}.`,
        severity: 'info',
      });
      break;
    }

    case 'SetGabelle': {
      let holder: PlayerId | null = null;
      for (const uid of Object.keys(next.objects).sort()) {
        if (next.objects[uid].kind === 'maison_tresor') holder = next.objects[uid].owner;
      }
      if (holder !== player) {
        return refuse(state, 'Seul le détenteur de la Maison du Trésor fixe la gabelle.');
      }
      if (next.gabelle === cmd.policy) {
        return refuse(state, 'Cette politique de gabelle est déjà en vigueur.');
      }
      next.gabelle = cmd.policy;
      events.push({
        type: 'Notice',
        player: null,
        text: `La gabelle passe au régime « ${cmd.policy} ».`,
        severity: 'warn',
      });
      break;
    }

    /* ── Marché ───────────────────────────────────────────────────────── */
    case 'TradeResources': {
      const outcome = tradeOutcome(next, player, cmd.give, cmd.giveAmount, cmd.take);
      if (!outcome.ok || outcome.taken === undefined) {
        return refuse(state, outcome.reason as string);
      }
      const p = next.players[player];
      p.resources[cmd.give] -= cmd.giveAmount;
      p.resources[cmd.take] += outcome.taken;
      events.push({
        type: 'ResourcesChanged',
        player,
        delta: { [cmd.give]: -cmd.giveAmount, [cmd.take]: outcome.taken } as Partial<Resources>,
        reason: 'marché',
      });
      break;
    }

    /* ── Bornes armoriées ─────────────────────────────────────────────── */
    case 'UseBorne': {
      const found = requireHero(next, cmd.hero, player);
      if (!found.hero) return refuse(state, found.error as string);
      const hero = found.hero;
      const here = objectAtCell(next, world, hero.at);
      if (!here || here.kind !== 'borne') {
        return refuse(state, 'Le héros doit se tenir sur une borne armoriée.');
      }
      const target = next.objects[cmd.to];
      if (!target || target.kind !== 'borne') {
        return refuse(state, 'La destination n’est pas une borne armoriée.');
      }
      if (target.uid === here.uid) {
        return refuse(state, 'Le héros est déjà sur cette borne.');
      }
      const discovered = (target.visitedBy ?? []).includes(player);
      if (!discovered) {
        return refuse(state, 'Cette borne n’a pas encore été découverte par votre bannière.');
      }
      const p = next.players[player];
      if (p.resources.ecus < BORNE_COST_ECUS) {
        return refuse(state, `Activer le réseau des bornes coûte ${BORNE_COST_ECUS} écus.`);
      }
      if (hero.movement < BORNE_COST_MOVEMENT) {
        return refuse(state, 'Il faut au moins 400 points de marche pour emprunter une borne.');
      }
      pay(next, player, { ecus: BORNE_COST_ECUS });
      hero.movement -= BORNE_COST_MOVEMENT;
      hero.at = { col: target.entrance.col, row: target.entrance.row };
      hero.path = null;
      hero.inTown = null;
      events.push({
        type: 'ResourcesChanged',
        player,
        delta: { ecus: -BORNE_COST_ECUS },
        reason: 'borne armoriée',
      });
      events.push({ type: 'HeroMoved', hero: hero.uid, path: [hero.at], costSpent: BORNE_COST_MOVEMENT });
      const cells = revealFog(next, world, player, hero.at, visionOf(next, hero.uid));
      if (cells.length > 0) events.push({ type: 'FogRevealed', player, cells });
      break;
    }

    /* ── Combat ───────────────────────────────────────────────────────── */
    case 'CombatAction': {
      const result = combatModule().applyCombatAction(next, cmd.action);
      if (!result.ok) return refuse(state, result.error ?? 'Action de combat refusée.');
      events.push(...result.events);
      if (next.combat && next.combat.finished) {
        /* Relevé avant résolution : elle efface `state.combat`. */
        const garde = gardeEnJeu(next);
        const survivants = garde ? survivantsDe(next, 1) : [];
        const vainqueur = next.combat.winner;
        events.push(...combatModule().resolveCombatOutcome(next));
        if (garde) events.push(...reglerGarde(next, world, garde, survivants, vainqueur));
        invalidateWorldCache(world);
        events.push(...worldModule().checkVictory(next));
      }
      break;
    }

    case 'AutoResolveCombat': {
      if (!next.combat) return refuse(state, 'Aucun combat en cours.');
      events.push(...combatModule().autoResolve(next));
      const garde = gardeEnJeu(next);
      const survivants = garde ? survivantsDe(next, 1) : [];
      const vainqueur = next.combat?.winner ?? null;
      events.push(...combatModule().resolveCombatOutcome(next));
      if (garde) events.push(...reglerGarde(next, world, garde, survivants, vainqueur));
      invalidateWorldCache(world);
      events.push(...worldModule().checkVictory(next));
      break;
    }

    /* ── Fin de tour ──────────────────────────────────────────────────── */
    case 'EndTurn': {
      events.push(...endTurn(next, world));
      break;
    }

    /* ── Reddition ────────────────────────────────────────────────────── */
    case 'Surrender': {
      const p = next.players[player];
      p.alive = false;
      p.defeatedAtTurn = next.turn;
      for (const uid of p.towns.slice()) {
        const town = next.towns[uid];
        if (town) {
          town.owner = null;
          town.garrisonHero = null;
          town.visitingHero = null;
        }
      }
      p.towns = [];
      for (const uid of p.heroes.slice()) delete next.heroes[uid];
      p.heroes = [];
      abaisserPavois(next, player);
      events.push({ type: 'PlayerDefeated', player });
      events.push({
        type: 'Notice',
        player: null,
        text: `${p.name} abaisse sa bannière.`,
        severity: 'danger',
      });
      invalidateWorldCache(world);
      events.push(...worldModule().checkVictory(next));
      if (next.phase !== 'termine') {
        events.push(...endTurn(next, world));
      }
      break;
    }

    default: {
      const unknown = cmd as { type: string };
      return refuse(state, `Commande inconnue : « ${unknown.type} ».`);
    }
  }

  return accept(next, events);
}

/** Cité située sous une case, exposée pour l'interface et l'IA. */
export { townAtCell };
