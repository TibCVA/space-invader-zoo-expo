/**
 * Interactions de carte : tout ce qu'un héros peut rencontrer dans le Forez.
 *
 * `visitObject` est appelée par le noyau à deux moments :
 *  - pendant un déplacement, dès que le héros pose le pied sur l'entrée d'un
 *    lieu (`core/movement.executeMove`) ;
 *  - sur commande explicite (`HeroInteract` dans `core/apply`).
 *
 * Elle doit donc **toujours** renvoyer au moins un événement lorsqu'il se passe
 * quelque chose : le noyau refuse la commande si la liste est vide.
 *
 * Genres traités : `ville`, `village`, `mine`, `ressource`, `artefact`,
 * `garde`, `borne`, `sanctuaire`, `auberge`, `caravane`, `sceau`,
 * `maison_tresor`, `belvedere`, `source`, `quete`. Le genre `obstacle` ne se
 * visite pas.
 *
 * Tous les tirages passent par `state.rng`. Aucune valeur n'est flottante.
 */
import {
  REGIONS,
  RESOURCE_KEYS,
  dayOf,
  weekOf,
  type ArtifactId,
  type Charter,
  type GameEvent,
  type GameState,
  type HeroInstance,
  type HeroUid,
  type MapCoord,
  type MapObject,
  type PlayerId,
  type PrimaryStat,
  type ResourceKey,
  type Resources,
  type SealId,
  type WorldMap,
} from '../types.js';
import { nextInt, pickWeighted } from '../rng.js';
import {
  BORNE_COST_ECUS,
  BORNE_COST_MOVEMENT,
  SEALS_REQUIRED,
  captureTown,
  chebyshev,
  clampInt,
  content,
  addToArmy,
  armySlotsFree,
  invalidateWorldCache,
  isExplored,
  recruitCost,
  revealFog,
  sameCoord,
} from '../core/index.js';
import { acquireArtifact, artifactDefOf } from './artifacts.js';
import {
  allObjects,
  canPay,
  consumeDailyUsage,
  consumeWeeklyUsage,
  dailyUsesLeft,
  dataBag,
  dataInt,
  dataString,
  describeDelta,
  giveResources,
  hasVisited,
  heroName,
  joinFr,
  ledgerInt,
  markVisited,
  notice,
  numberWord,
  objectName,
  playerName,
  pluralize,
  resourceWords,
  setLedgerInt,
  visited,
  weeklyUsesLeft,
} from './common.js';
import { attemptParley, parleyChance, stackNames } from './diplomacy.js';
import { heroStats, refreshDerived, skillRank } from './hero-stats.js';
import { grantXp } from './leveling.js';
import { startClaim } from './victory.js';

/* ── Réglages ───────────────────────────────────────────────────────────── */

/**
 * Réglages des lieux de la carte. Un seul endroit à relire pour équilibrer les
 * récompenses de terrain : rien n'est écrit en dur ailleurs dans ce fichier.
 */
export const OBJECT_TUNING = {
  /* — Ressources et caravanes — */
  /** Prime de Reconnaissance sur les tas trouvés, par rang, en points de base. */
  scoutBonusByRank: [10000, 10600, 11200, 12000] as const,
  scoutSkillId: 'reconnaissance',
  /** Expérience accordée pour un tas ramassé. */
  xpResource: 25,
  /** Expérience accordée pour une caravane interceptée. */
  xpCaravan: 120,
  /** Expérience accordée pour un artefact trouvé, par rareté. */
  xpArtifact: { commun: 120, rare: 240, majeur: 450, relique: 900 } as const,
  /** Expérience accordée pour un gisement pris. */
  xpMine: 150,
  /** Expérience accordée pour un sceau pris. */
  xpSeal: 900,
  /** Expérience accordée pour une doléance honorée. */
  xpQuest: 400,

  /* — Gisements — */
  /** Portée révélée autour d'un gisement conquis. */
  mineReveal: 6,

  /* — Belvédères — */
  /** Portée révélée par défaut depuis un belvédère. */
  viewpointReveal: 22,
  /** Prime de portée par rang de Cartographie. */
  viewpointPerCartography: 3,
  cartographySkillId: 'cartographie',

  /* — Sanctuaires et sources — */
  /** Caractéristique offerte par un sanctuaire, à la première visite d'un héros. */
  shrineDefaultGift: 'savoir' as 'vaillance' | 'garde' | 'mystique' | 'savoir',
  /** Réputation gagnée à la première visite d'un sanctuaire par une bannière. */
  shrineReputation: 1,
  /** Expérience accordée par un sanctuaire, à la première visite d'un héros. */
  xpShrine: 200,
  /** Points de marche rendus par une source, une fois par jour et par héros. */
  springMovement: 250,
  /** Clef de comptabilité des sources. */
  springLedgerKey: 'source.usage',

  /* — Auberges — */
  /** Offres présentées au tableau de l'auberge. */
  innOffers: 2,
  /** Rumeurs par semaine et par bannière dans une même auberge. */
  innRumoursPerWeek: 1,
  /** Portée révélée par une rumeur d'auberge. */
  innRumourReveal: 5,
  /** Clef de comptabilité des rumeurs. */
  innLedgerKey: 'auberge.rumeur',

  /* — Le catalogue de la densification (docs/08-PLAN-AAA.md, lot 1.2) —
     Valeurs transposées de HMM3 : coffre 1 000-2 000 écus ou l'expérience
     équivalente moins un tiers, école +1 caractéristique pour 1 000 écus une
     fois par héros, oratoire +1 moral une semaine, fontaine -1..+3 de fortune
     jusqu'au dimanche, moulin au premier visiteur de la semaine. */
  /** Prix d'une leçon d'école. */
  ecolePrix: 1000,
  /** Durée d'une bénédiction d'oratoire, en jours. */
  oratoireJours: 7,
  /** Expérience d'un coffre quand il porte du savoir plutôt que des écus. */
  coffreXpParEcu: { num: 2, den: 3 } as const,
  /** Expérience accordée pour une banque vidée. */
  xpBanque: 600,
  /** Portée révélée par un montjoie autour de la Maison du Trésor. */
  obelisqueReveal: 8,
  /** Prix par défaut du cartographe. */
  cartographePrix: 1000,
  /** Clefs de comptabilité. */
  moulinLedgerKey: 'moulin.usage',
  laissezPasserLedgerKey: 'laissezpasser',

  /* — Villages et chartes — */
  /** Réputation gagnée en prenant un village sans le piller. */
  villageReputation: 1,

  /* — Doléances — */
  /** Poids de tirage des trois natures de doléance. */
  questWeights: { peage: 40, renom: 30, sceaux: 12, escorte: 28 } as const,
  /** Ressource et quantité exigées par un péage, bornes. */
  questTollMin: 4,
  questTollMax: 12,
  /** Niveau de héros exigé par une doléance de renom, bornes. */
  questLevelMin: 4,
  questLevelMax: 9,
  /** Sceaux exigés par une doléance de légitimité. */
  questSeals: 2,
  /** Écus exigés par une escorte. */
  questEscortMin: 600,
  questEscortMax: 1800,
  /** Réputation gagnée en honorant une doléance. */
  questReputation: 2,
  /** Identifiant du héros neutre libéré par la doléance du Grand Livre. */
  grandBookHeroId: 'jules',
  /** Nom de la doléance centrale. */
  grandBookName: 'Le Grand Livre',
} as const;

/**
 * Réglages du réseau des bornes armoriées (document maître §8.3) :
 * destinations fixes, activation payante, seulement entre bornes découvertes,
 * nombre d'utilisations limité, trajet visible pour les adversaires proches.
 */
export const BORNE_TUNING = {
  /** Coût d'activation, en écus. Repris du noyau pour rester cohérent. */
  costEcus: BORNE_COST_ECUS,
  /** Coût d'activation, en points de marche. */
  costMovement: BORNE_COST_MOVEMENT,
  /** Utilisations par héros et par semaine. */
  usesPerWeek: 2,
  /** Le Gardien des Bornes en obtient une gratuite par jour, en plus. */
  keeperHeroId: 'jules',
  keeperFreeUsesPerDay: 1,
  /** Distance à laquelle une bannière adverse voit passer le trajet. */
  witnessRadius: 12,
  /** Portée révélée à l'arrivée, en plus de la vue du héros. */
  arrivalReveal: 2,
  /** Clef de comptabilité des usages hebdomadaires. */
  ledgerKey: 'borne.usage',
  /** Clef de comptabilité des usages gratuits du Gardien. */
  keeperLedgerKey: 'borne.gardien',
  /** Semaine avant laquelle le réseau reste muet (les bornes dorment). */
  awakensAtWeek: 1,
} as const;

/* ── Aides communes ─────────────────────────────────────────────────────── */

function scoutBp(hero: HeroInstance): number {
  return OBJECT_TUNING.scoutBonusByRank[skillRank(hero, OBJECT_TUNING.scoutSkillId)];
}

function withScouting(hero: HeroInstance, amount: number): number {
  return Math.max(1, Math.trunc((amount * scoutBp(hero)) / 10000));
}

/** Lecture prudente d'une clef de ressource dans le sac de données. */
function resourceOf(obj: MapObject, key = 'resource'): ResourceKey | null {
  const raw = obj.data[key];
  if (typeof raw !== 'string') return null;
  return (RESOURCE_KEYS as readonly string[]).includes(raw) ? (raw as ResourceKey) : null;
}

/* ── Textes de trouvaille ───────────────────────────────────────────────── */

/**
 * Trois manières de raconter la même trouvaille, choisies au tirage. Le texte
 * est complété par la quantité réellement reçue.
 */
const FIND_STORIES: Record<ResourceKey, readonly string[]> = {
  ecus: [
    'Sous une dalle descellée du vieux relais, une bourse de cuir raidi',
    'Le mur de pierre sèche s’effondre au passage et découvre un pot ébréché',
    'Un colporteur mort de froid l’hiver dernier gardait encore sa ceinture pleine',
  ],
  bois: [
    'Une coupe abandonnée depuis l’automne attend encore ses charretiers',
    'Le vent des crêtes a couché trois hêtres en travers du chemin',
    'Les bûcherons de Viscomtat ont laissé leur pile sous une bâche goudronnée',
  ],
  granit: [
    'Une carrière de bord de route, ouverte puis oubliée, garde ses blocs équarris',
    'Les carriers de Vollore ont abandonné leur chantier, moellons compris',
    'Un muret écroulé livre des pierres taillées de la main des anciens comtes',
  ],
  fer: [
    'La forge éteinte des Farges conserve ses gueuses alignées contre le mur',
    'Un chariot versé dans le fossé a répandu son chargement de fonte',
    'Sous les fougères, des barres rouillées mais saines, marquées au poinçon',
  ],
  sel: [
    'Un vieux gabelou vous cède sa réserve',
    'Le grenier clandestin d’un faux-saunier, sous le plancher d’une grange',
    'La caravane du Lac a perdu une charge en franchissant le gué',
  ],
  essence: [
    'Les sourciers de l’Ermitage avaient scellé leurs fioles au pied d’un fayard',
    'La résine des vieux sapins des Bois Noirs a coulé toute la saison dans les pots',
    'Un ermite vous fait présent de sa distillation, sans un mot',
  ],
  filDor: [
    'Les brodeuses de Cervières avaient caché leur trésor de guerre dans la chapelle',
    'Une bannière comtale en lambeaux, dont le fil vaut plus que l’étoffe',
    'Un coffret de mariage, oublié dans un grenier, plein d’écheveaux luisants',
  ],
};

function findStory(state: GameState, resource: ResourceKey, amount: number): string {
  const list = FIND_STORIES[resource] ?? FIND_STORIES.ecus;
  const line = list[nextInt(state.rng, 0, list.length - 1)];
  return `${line} : ${resourceWords(resource, amount)}.`;
}

/* ── Le réseau des bornes armoriées ─────────────────────────────────────── */

/** Toutes les bornes de la carte, ordre stable. */
export function borneNetwork(state: GameState): MapObject[] {
  return allObjects(state).filter((o) => o.kind === 'borne');
}

/** Bornes déjà découvertes par une bannière. Ce sont les seules destinations. */
export function discoveredBornes(state: GameState, player: PlayerId): MapObject[] {
  return borneNetwork(state).filter((o) => hasVisited(o, player));
}

/** Vrai si ce héros est le Gardien des Bornes. */
export function isBorneKeeper(hero: HeroInstance): boolean {
  return hero.def === BORNE_TUNING.keeperHeroId;
}

/** Usages hebdomadaires restants pour ce héros. */
export function borneUsesLeft(state: GameState, hero: HeroInstance): number {
  return weeklyUsesLeft(state, BORNE_TUNING.ledgerKey, hero.uid, BORNE_TUNING.usesPerWeek);
}

/** Le Gardien dispose-t-il encore de son passage gratuit du jour ? */
export function borneKeeperFreeLeft(state: GameState, hero: HeroInstance): number {
  if (!isBorneKeeper(hero)) return 0;
  return dailyUsesLeft(
    state,
    BORNE_TUNING.keeperLedgerKey,
    hero.uid,
    BORNE_TUNING.keeperFreeUsesPerDay,
  );
}

export interface BorneVerdict {
  ok: boolean;
  reason?: string;
  from?: MapObject;
  to?: MapObject;
  costEcus: number;
  costMovement: number;
  free: boolean;
}

/**
 * Le héros peut-il emprunter le réseau depuis sa case vers cette borne ?
 * Chaque refus est rédigé en français, prêt à l'affichage.
 */
export function canUseBorne(
  state: GameState,
  hero: HeroInstance,
  target: MapObject,
): BorneVerdict {
  const free = borneKeeperFreeLeft(state, hero) > 0;
  const base: BorneVerdict = {
    ok: false,
    costEcus: free ? 0 : BORNE_TUNING.costEcus,
    costMovement: free ? 0 : BORNE_TUNING.costMovement,
    free,
  };

  const from = borneNetwork(state).find((o) => sameCoord(o.entrance, hero.at)) ?? null;
  if (!from) {
    return { ...base, reason: 'Le héros doit se tenir sur une borne armoriée pour appeler le réseau.' };
  }
  if (target.kind !== 'borne') {
    return { ...base, from, reason: 'La destination n’est pas une borne armoriée.' };
  }
  if (target.uid === from.uid) {
    return { ...base, from, to: target, reason: 'Le héros est déjà sur cette borne.' };
  }
  if (!hasVisited(from, hero.owner)) {
    return { ...base, from, to: target, reason: 'Cette borne-ci n’est pas encore inscrite à votre registre.' };
  }
  if (!hasVisited(target, hero.owner)) {
    return {
      ...base,
      from,
      to: target,
      reason: `${objectName(target, 'Cette borne')} n’a pas encore été découverte par votre bannière : le réseau ne mène qu’aux pierres déjà vues.`,
    };
  }
  if (weekOf(state.turn) < BORNE_TUNING.awakensAtWeek) {
    return { ...base, from, to: target, reason: 'Les bornes dorment encore : le réseau n’est pas éveillé.' };
  }
  if (!free && borneUsesLeft(state, hero) <= 0) {
    return {
      ...base,
      from,
      to: target,
      reason: `${heroName(hero)} a déjà usé ses ${pluralize(
        BORNE_TUNING.usesPerWeek,
        'passage',
        'passages',
      )} de la semaine.`,
    };
  }
  if (!free && !canPay(state, hero.owner, { ecus: BORNE_TUNING.costEcus })) {
    return {
      ...base,
      from,
      to: target,
      reason: `Éveiller le réseau coûte ${resourceWords('ecus', BORNE_TUNING.costEcus)}.`,
    };
  }
  if (!free && hero.movement < BORNE_TUNING.costMovement) {
    return {
      ...base,
      from,
      to: target,
      reason: `Il faut ${BORNE_TUNING.costMovement} points de marche pour franchir la pierre.`,
    };
  }
  return { ...base, ok: true, from, to: target };
}

/**
 * Emprunte le réseau. Déplace le héros, paie, consomme l'usage, révèle
 * l'arrivée — et **montre le trajet aux adversaires proches**, conformément
 * au document maître : le réseau est rapide, jamais discret.
 */
export function useBorne(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  target: MapObject,
): GameEvent[] {
  const verdict = canUseBorne(state, hero, target);
  if (!verdict.ok || !verdict.from || !verdict.to) {
    return [notice(hero.owner, verdict.reason ?? 'Le réseau ne répond pas.', 'warn')];
  }
  const events: GameEvent[] = [];
  const from = verdict.from;
  const to = verdict.to;
  const departure: MapCoord = { col: hero.at.col, row: hero.at.row };

  if (verdict.free) {
    consumeDailyUsage(state, BORNE_TUNING.keeperLedgerKey, hero.uid);
  } else {
    events.push(
      ...giveResources(state, hero.owner, { ecus: -BORNE_TUNING.costEcus }, 'borne armoriée'),
    );
    hero.movement = Math.max(0, hero.movement - BORNE_TUNING.costMovement);
    consumeWeeklyUsage(state, BORNE_TUNING.ledgerKey, hero.uid);
  }

  hero.at = { col: to.entrance.col, row: to.entrance.row };
  hero.path = null;
  hero.inTown = null;

  events.push({
    type: 'HeroMoved',
    hero: hero.uid,
    path: [{ col: hero.at.col, row: hero.at.row }],
    costSpent: verdict.costMovement,
  });

  const vision = heroStats(state, hero).vision + BORNE_TUNING.arrivalReveal;
  const cells = revealFog(state, world, hero.owner, hero.at, vision);
  if (cells.length > 0) events.push({ type: 'FogRevealed', player: hero.owner, cells });

  events.push(
    notice(
      hero.owner,
      `${heroName(hero)} pose la main sur ${objectName(from, 'la borne')} ; la pierre tiède répond, ` +
        `et la colonne se retrouve au pied de ${objectName(to, 'la borne suivante')}` +
        `${verdict.free ? ', sans qu’il en coûte un écu au Gardien.' : '.'}`,
      'info',
    ),
  );

  events.push(...announceBorneTravel(state, world, hero, departure, hero.at, from, to));
  return events;
}

/**
 * Prévient les bannières adverses dont un héros ou une cité se trouve à portée
 * du départ ou de l'arrivée. Le trajet leur est révélé, pas la suite.
 */
function announceBorneTravel(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  from: MapCoord,
  to: MapCoord,
  fromObj: MapObject,
  toObj: MapObject,
): GameEvent[] {
  const events: GameEvent[] = [];
  for (const player of state.turnOrder) {
    if (player === hero.owner) continue;
    const p = state.players[player];
    if (!p || !p.alive) continue;

    let near = false;
    for (const uid of p.heroes.slice().sort()) {
      const other = state.heroes[uid];
      if (!other) continue;
      if (
        chebyshev(other.at, from) <= BORNE_TUNING.witnessRadius ||
        chebyshev(other.at, to) <= BORNE_TUNING.witnessRadius
      ) {
        near = true;
        break;
      }
    }
    if (!near) {
      for (const uid of p.towns.slice().sort()) {
        const town = state.towns[uid];
        if (!town) continue;
        if (
          chebyshev(town.at, from) <= BORNE_TUNING.witnessRadius ||
          chebyshev(town.at, to) <= BORNE_TUNING.witnessRadius
        ) {
          near = true;
          break;
        }
      }
    }
    // Une borne déjà connue de l'adversaire suffit aussi à trahir le passage.
    if (!near && hasVisited(toObj, player) && isExplored(state, player, world, to)) near = true;
    if (!near) continue;

    const cells = revealFog(state, world, player, to, BORNE_TUNING.arrivalReveal + 1);
    if (cells.length > 0) events.push({ type: 'FogRevealed', player, cells });
    events.push(
      notice(
        player,
        `Les bornes ont sonné : une colonne de ${playerName(state, hero.owner)} a quitté ` +
          `${objectName(fromObj, 'une borne')} pour ${objectName(toObj, 'une autre')}. ` +
          `On l’a vue apparaître en (${to.col}, ${to.row}).`,
        'warn',
      ),
    );
  }
  return events;
}

/** Description du réseau pour l'interface : bornes connues et coût. */
export function borneSummary(state: GameState, hero: HeroInstance): string {
  const known = discoveredBornes(state, hero.owner);
  if (known.length === 0) return 'Aucune borne armoriée n’est encore inscrite à votre registre.';
  const free = borneKeeperFreeLeft(state, hero) > 0;
  return (
    `${numberWord(known.length, true)} bornes connues : ${joinFr(known.map((o) => objectName(o, 'borne')))}. ` +
    (free
      ? 'Le Gardien passe une fois par jour sans bourse délier.'
      : `Passage : ${resourceWords('ecus', BORNE_TUNING.costEcus)} et ${BORNE_TUNING.costMovement} points de marche, ` +
        `${pluralize(borneUsesLeft(state, hero), 'usage restant', 'usages restants')} cette semaine.`)
  );
}

/* ── Doléances ──────────────────────────────────────────────────────────── */

export type QuestKind = 'peage' | 'renom' | 'sceaux' | 'escorte';

export interface QuestTerms {
  kind: QuestKind;
  /** Ressource exigée pour un péage. */
  resource: ResourceKey | null;
  /** Quantité exigée (ressource ou écus). */
  need: number;
  /** Niveau exigé pour une doléance de renom. */
  level: number;
  /** Sceaux exigés pour une doléance de légitimité. */
  seals: number;
  rewardResource: ResourceKey;
  rewardAmount: number;
  grandBook: boolean;
}

/**
 * Termes déjà tirés pour cette doléance, sans rien tirer ni modifier.
 * C'est la porte d'entrée des info-bulles : consulter un lieu ne doit jamais
 * consommer le générateur de la partie.
 */
export function questTermsIfKnown(obj: MapObject): QuestTerms | null {
  const bag = obj.data.quete;
  if (!bag || typeof bag !== 'object' || Array.isArray(bag)) return null;
  const row = bag as Record<string, unknown>;
  if (typeof row.kind !== 'string') return null;
  return {
    kind: row.kind as QuestKind,
    resource: typeof row.resource === 'string' ? (row.resource as ResourceKey) : null,
    need: typeof row.need === 'number' ? Math.trunc(row.need) : 0,
    level: typeof row.level === 'number' ? Math.trunc(row.level) : 0,
    seals: typeof row.seals === 'number' ? Math.trunc(row.seals) : 0,
    rewardResource: (resourceOf(obj, 'reward') ?? 'ecus') as ResourceKey,
    rewardAmount: dataInt(obj, 'amount', 300),
    grandBook: objectName(obj, '') === OBJECT_TUNING.grandBookName,
  };
}

/**
 * Termes de la doléance, tirés une seule fois puis mémorisés dans l'objet.
 * **Consomme le PRNG** au premier appel : réservé au chemin autoritaire.
 */
export function questTerms(state: GameState, obj: MapObject): QuestTerms {
  const known = questTermsIfKnown(obj);
  if (known) return known;

  const bag = dataBag(obj, 'quete');
  const grandBook = objectName(obj, '') === OBJECT_TUNING.grandBookName;

  const kind = grandBook
    ? 'sceaux'
    : pickWeighted(state.rng, [
        { item: 'peage' as QuestKind, weight: OBJECT_TUNING.questWeights.peage },
        { item: 'renom' as QuestKind, weight: OBJECT_TUNING.questWeights.renom },
        { item: 'sceaux' as QuestKind, weight: OBJECT_TUNING.questWeights.sceaux },
        { item: 'escorte' as QuestKind, weight: OBJECT_TUNING.questWeights.escorte },
      ]);

  const tollPool: ResourceKey[] = ['bois', 'granit', 'fer', 'sel', 'essence', 'filDor'];
  const resource = kind === 'peage' ? tollPool[nextInt(state.rng, 0, tollPool.length - 1)] : null;
  const need =
    kind === 'peage'
      ? nextInt(state.rng, OBJECT_TUNING.questTollMin, OBJECT_TUNING.questTollMax)
      : kind === 'escorte'
        ? nextInt(state.rng, OBJECT_TUNING.questEscortMin, OBJECT_TUNING.questEscortMax)
        : 0;
  const level =
    kind === 'renom'
      ? nextInt(state.rng, OBJECT_TUNING.questLevelMin, OBJECT_TUNING.questLevelMax)
      : 0;
  const seals = kind === 'sceaux' ? OBJECT_TUNING.questSeals : 0;

  bag.kind = kind;
  if (resource) bag.resource = resource;
  bag.need = need;
  bag.level = level;
  bag.seals = seals;

  return {
    kind,
    resource,
    need,
    level,
    seals,
    rewardResource: (resourceOf(obj, 'reward') ?? 'ecus') as ResourceKey,
    rewardAmount: dataInt(obj, 'amount', 300),
    grandBook,
  };
}

/** Énoncé de la doléance, en français. */
export function questSentence(terms: QuestTerms): string {
  switch (terms.kind) {
    case 'peage':
      return `On demande ${resourceWords(terms.resource ?? 'bois', terms.need)} pour refaire le pont et le péage.`;
    case 'renom':
      return `On ne confiera l’affaire qu’à un capitaine de renom : niveau ${terms.level} au moins.`;
    case 'sceaux':
      return terms.grandBook
        ? `Le Grand Livre ne s’ouvrira qu’à qui porte déjà ${numberWord(terms.seals)} Sceaux des Marches.`
        : `La communauté ne suivra qu’un prétendant légitime : ${numberWord(terms.seals)} Sceaux des Marches.`;
    case 'escorte':
    default:
      return `On veut une escorte jusqu’à la foire, et la solde d’avance : ${resourceWords('ecus', terms.need)}.`;
  }
}

/** La doléance peut-elle être honorée maintenant ? */
export function questSatisfied(
  state: GameState,
  hero: HeroInstance,
  terms: QuestTerms,
): boolean {
  const p = state.players[hero.owner];
  if (!p) return false;
  switch (terms.kind) {
    case 'peage':
      return terms.resource !== null && (p.resources[terms.resource] | 0) >= terms.need;
    case 'renom':
      return hero.level >= terms.level;
    case 'sceaux':
      return p.seals.length >= terms.seals;
    case 'escorte':
      return (p.resources.ecus | 0) >= terms.need;
    default:
      return false;
  }
}

function payQuest(state: GameState, hero: HeroInstance, terms: QuestTerms): GameEvent[] {
  if (terms.kind === 'peage' && terms.resource) {
    return giveResources(state, hero.owner, { [terms.resource]: -terms.need } as Partial<Resources>, 'doléance');
  }
  if (terms.kind === 'escorte') {
    return giveResources(state, hero.owner, { ecus: -terms.need }, 'doléance');
  }
  return [];
}

/* ── Visite ─────────────────────────────────────────────────────────────── */

/**
 * Applique la visite d'un lieu par un héros.
 * Signature imposée par `docs/02-API.md`.
 */
export function visitObject(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  obj: MapObject,
): GameEvent[] {
  // Toujours travailler sur l'exemplaire vivant de l'état, jamais sur la copie
  // figée de la `WorldMap`.
  const live = state.objects[obj.uid] ?? obj;
  const owner = hero.owner;

  switch (live.kind) {
    case 'ressource':
      return visitResource(state, hero, live);
    case 'caravane':
      return visitCaravan(state, hero, live);
    case 'artefact':
      return visitArtifact(state, hero, live);
    case 'mine':
      return visitMine(state, world, hero, live);
    case 'belvedere':
      return visitViewpoint(state, world, hero, live);
    case 'source':
      return visitSpring(state, hero, live);
    case 'sanctuaire':
      return visitShrine(state, hero, live);
    case 'auberge':
      return visitInn(state, world, hero, live);
    case 'borne':
      return visitBorne(state, hero, live);
    case 'sceau':
      return visitSeal(state, hero, live);
    case 'maison_tresor':
      return visitTreasury(state, hero, live);
    case 'village':
    case 'ville':
      return visitSettlement(state, hero, live);
    case 'quete':
      return visitQuest(state, hero, live);
    case 'garde':
      return visitGuard(state, hero, live);
    case 'coffre':
      return visitCoffre(state, hero, live);
    case 'ecole':
      return visitEcole(state, hero, live);
    case 'temple':
      return visitOratoire(state, hero, live);
    case 'fontaine':
      return visitFontaine(state, hero, live);
    case 'moulin':
      return visitMoulin(state, hero, live);
    case 'demeure':
      return visitDemeure(state, hero, live);
    case 'banque':
      return visitBanque(state, hero, live);
    case 'monolithe':
      return visitMonolithe(state, world, hero, live);
    case 'obelisque':
      return visitObelisque(state, world, hero, live);
    case 'tente_clef':
      return visitTenteClef(state, hero, live);
    case 'garde_frontiere':
      return visitGardeFrontiere(state, world, hero, live);
    case 'cartographe':
      return visitCartographe(state, world, hero, live);
    case 'marche_noir':
      return visitMarcheNoir(state, hero, live);
    case 'obstacle':
    default:
      return [notice(owner, 'Il n’y a rien à prendre ici, seulement du vent et des pierres.', 'info')];
  }
}

/* — Tas de ressources — */

function visitResource(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  if (obj.spent) return [];
  const resource = resourceOf(obj);
  const amount = dataInt(obj, 'amount', 0);
  if (!resource || amount <= 0) {
    obj.spent = true;
    return [notice(hero.owner, 'La cache a déjà été vidée avant vous.', 'info')];
  }
  const total = withScouting(hero, amount);
  obj.spent = true;
  markVisited(obj, hero.owner);

  const events: GameEvent[] = [];
  events.push(...giveResources(state, hero.owner, { [resource]: total } as Partial<Resources>, 'trouvaille'));
  events.push(notice(hero.owner, findStory(state, resource, total), 'info'));
  events.push(...grantXp(state, hero, OBJECT_TUNING.xpResource));
  events.push(visited(hero, obj, 'ressource_ramassee'));
  return events;
}

/* — Caravanes — */

function visitCaravan(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  if (obj.spent) return [];
  const resource = resourceOf(obj);
  const amount = dataInt(obj, 'amount', 0);
  const ecus = dataInt(obj, 'ecus', 0);
  const delta: Partial<Resources> = {};
  if (resource && amount > 0) delta[resource] = withScouting(hero, amount);
  if (ecus > 0) delta.ecus = withScouting(hero, ecus);
  obj.spent = true;
  markVisited(obj, hero.owner);

  const events: GameEvent[] = [];
  events.push(...giveResources(state, hero.owner, delta, 'caravane'));
  events.push(
    notice(
      hero.owner,
      `${objectName(obj, 'Une caravane')} s’arrête, les muletiers découvrent leur bonnet et déchargent ` +
        `sans discuter : ${describeDelta(delta)}. Ils repartiront par un autre col.`,
      'info',
    ),
  );
  events.push(...grantXp(state, hero, OBJECT_TUNING.xpCaravan));
  events.push(visited(hero, obj, 'caravane'));
  return events;
}

/* — Artefacts — */

function visitArtifact(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  if (obj.spent) return [];
  const id = dataString(obj, 'artifact') as ArtifactId | null;
  obj.spent = true;
  markVisited(obj, hero.owner);
  if (!id) {
    return [notice(hero.owner, 'Le coffret est vide : quelqu’un est passé avant vous.', 'warn')];
  }
  const def = artifactDefOf(id);
  const events: GameEvent[] = [
    notice(
      hero.owner,
      `Sous la souche fendue, enveloppé de toile cirée, un objet qu’on n’abandonne pas par mégarde.`,
      'info',
    ),
    ...acquireArtifact(state, hero, id),
    ...grantXp(state, hero, def ? OBJECT_TUNING.xpArtifact[def.rarity] : OBJECT_TUNING.xpArtifact.commun),
    visited(hero, obj, 'artefact_trouve'),
  ];
  return events;
}

/* — Gisements — */

function visitMine(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  obj: MapObject,
): GameEvent[] {
  const resource = resourceOf(obj);
  const yieldPerDay = dataInt(obj, 'amount', 0);
  if (obj.owner === hero.owner) {
    return [
      notice(
        hero.owner,
        `${objectName(obj, 'Le gisement')} travaille déjà pour vous : ${resourceWords(
          resource ?? 'ecus',
          yieldPerDay,
        )} par jour.`,
        'info',
      ),
    ];
  }
  const previous = obj.owner;
  obj.owner = hero.owner;
  markVisited(obj, hero.owner);

  const events: GameEvent[] = [];
  const cells = revealFog(state, world, hero.owner, obj.at, OBJECT_TUNING.mineReveal);
  if (cells.length > 0) events.push({ type: 'FogRevealed', player: hero.owner, cells });

  events.push(
    notice(
      hero.owner,
      previous
        ? `Les mineurs de ${objectName(obj, 'ce gisement')} changent de bannière sans lever la tête : ` +
            `${resourceWords(resource ?? 'ecus', yieldPerDay)} par jour cessent d’aller à ${playerName(state, previous)}.`
        : `${objectName(obj, 'Le gisement')} passe sous votre bannière. Le contremaître promet ` +
            `${resourceWords(resource ?? 'ecus', yieldPerDay)} par jour, et il tiendra parole tant que vous tiendrez le site.`,
      'info',
    ),
  );
  if (previous) {
    events.push(
      notice(
        previous,
        `${objectName(obj, 'Un de vos gisements')} vous échappe : ${playerName(state, hero.owner)} y a planté sa bannière.`,
        'warn',
      ),
    );
  }
  events.push(...grantXp(state, hero, OBJECT_TUNING.xpMine));
  events.push(visited(hero, obj, 'mine_prise'));
  return events;
}

/* — Belvédères — */

function visitViewpoint(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  obj: MapObject,
): GameEvent[] {
  const base = dataInt(obj, 'radius', OBJECT_TUNING.viewpointReveal);
  const bonus =
    skillRank(hero, OBJECT_TUNING.cartographySkillId) * OBJECT_TUNING.viewpointPerCartography;
  const radius = clampInt(base + bonus, 4, 40);
  const cells = revealFog(state, world, hero.owner, obj.at, radius);
  obj.owner = hero.owner;
  markVisited(obj, hero.owner);

  const events: GameEvent[] = [];
  if (cells.length > 0) events.push({ type: 'FogRevealed', player: hero.owner, cells });
  events.push(
    notice(
      hero.owner,
      `Du haut de ${objectName(obj, 'ce belvédère')}, la brume s’ouvre un instant : on suit la chaussée ` +
        `jusqu’au col, on compte les toits, on devine les feux. ${numberWord(cells.length)} cases ` +
        `entrent au registre des cartes.`,
      'info',
    ),
  );
  events.push(visited(hero, obj, 'panorama'));
  return events;
}

/* — Sources — */

function visitSpring(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const key = `${OBJECT_TUNING.springLedgerKey}.${obj.uid}`;
  if (dailyUsesLeft(state, key, hero.uid, 1) <= 0) {
    return [
      notice(
        hero.owner,
        `${heroName(hero)} a déjà bu à ${objectName(obj, 'cette source')} aujourd’hui.`,
        'info',
      ),
    ];
  }
  consumeDailyUsage(state, key, hero.uid);
  const stats = heroStats(state, hero);
  const manaBefore = hero.mana;
  hero.mana = stats.manaMax;
  hero.movement = Math.min(
    hero.movementMax + OBJECT_TUNING.springMovement,
    hero.movement + OBJECT_TUNING.springMovement,
  );
  markVisited(obj, hero.owner);

  return [
    notice(
      hero.owner,
      `L’eau de ${objectName(obj, 'la source')} est si froide qu’elle fait mal aux dents. ` +
        `${heroName(hero)} y remplit ses outres : ${stats.manaMax - manaBefore} points de mana retrouvés ` +
        `et ${OBJECT_TUNING.springMovement} pas de plus dans les jambes.`,
      'info',
    ),
    visited(hero, obj, 'source'),
  ];
}

/* — Sanctuaires — */

function visitShrine(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const bag = dataBag(obj, 'pelerins');
  const already = bag[hero.uid] === true;
  const stats = heroStats(state, hero);
  const events: GameEvent[] = [];
  hero.mana = stats.manaMax;

  if (already) {
    events.push(
      notice(
        hero.owner,
        `${heroName(hero)} s’agenouille de nouveau à ${objectName(obj, 'ce sanctuaire')} ; ` +
          `la bénédiction est acquise, la réserve de mana est comble.`,
        'info',
      ),
    );
    events.push(visited(hero, obj, 'benediction'));
    return events;
  }

  bag[hero.uid] = true;
  const gift = (dataString(obj, 'gift') ?? OBJECT_TUNING.shrineDefaultGift) as
    | 'vaillance'
    | 'garde'
    | 'mystique'
    | 'savoir';
  hero[gift] += 1;
  refreshDerived(state, hero);
  hero.mana = heroStats(state, hero).manaMax;

  const firstForBanner = !markVisited(obj, hero.owner);
  if (firstForBanner) {
    const p = state.players[hero.owner];
    if (p) p.reputation += OBJECT_TUNING.shrineReputation;
  }

  events.push(
    notice(
      hero.owner,
      `À ${objectName(obj, 'ce sanctuaire')}, on allume un cierge pour les morts des Marches et ` +
        `l’on récite les noms à voix basse. ${heroName(hero)} en repart changé : ` +
        `${gift === 'savoir' ? 'Savoir' : gift === 'mystique' ? 'Mystique' : gift === 'garde' ? 'Garde' : 'Vaillance'} +1.`,
      'info',
    ),
  );
  events.push(...grantXp(state, hero, OBJECT_TUNING.xpShrine));
  events.push(visited(hero, obj, 'benediction'));
  return events;
}

/* — Auberges — */

function visitInn(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  obj: MapObject,
): GameEvent[] {
  const p = state.players[hero.owner];
  if (!p) return [];
  const events: GameEvent[] = [];
  p.tavernOffers = drawTavernOffers(state, hero.owner);
  markVisited(obj, hero.owner);

  const names = p.tavernOffers
    .map((id) => content().HEROES[id]?.name ?? id)
    .filter((n) => n.length > 0);

  events.push(
    notice(
      hero.owner,
      names.length > 0
        ? `À ${objectName(obj, 'l’auberge')}, deux capitaines sans emploi vident un pichet au coin du feu : ` +
            `${joinFr(names)}. Ils écouteront une offre dans n’importe quelle salle des bannières.`
        : `À ${objectName(obj, 'l’auberge')}, la salle est vide : tous les capitaines du pays ont déjà pris service.`,
      'info',
    ),
  );

  // Rumeur : un lieu notable est indiqué, une fois par semaine et par bannière.
  const rumourKey = `${OBJECT_TUNING.innLedgerKey}.${obj.uid}`;
  if (weeklyUsesLeft(state, rumourKey, hero.owner, OBJECT_TUNING.innRumoursPerWeek) > 0) {
    const rumour = pickRumour(state, hero.owner);
    if (rumour) {
      consumeWeeklyUsage(state, rumourKey, hero.owner);
      const cells = revealFog(state, world, hero.owner, rumour.at, OBJECT_TUNING.innRumourReveal);
      if (cells.length > 0) events.push({ type: 'FogRevealed', player: hero.owner, cells });
      events.push(
        notice(
          hero.owner,
          `L’aubergiste essuie un verre plus longtemps que nécessaire, puis lâche : ` +
            `« ${rumourText(rumour)} » — (${rumour.at.col}, ${rumour.at.row}).`,
          'info',
        ),
      );
    }
  }

  events.push(visited(hero, obj, 'auberge'));
  return events;
}

/** Deux capitaines libres, tirés au sort, de la faction du joueur ou neutres. */
export function drawTavernOffers(state: GameState, player: PlayerId): string[] {
  const p = state.players[player];
  if (!p) return [];
  const inPlay = new Set<string>();
  for (const uid of Object.keys(state.heroes).sort()) inPlay.add(state.heroes[uid].def);

  const heroes = content().HEROES;
  const pool: { item: string; weight: number }[] = [];
  for (const id of Object.keys(heroes).sort()) {
    if (inPlay.has(id)) continue;
    const def = heroes[id];
    if (def.faction !== p.faction && def.faction !== 'neutre') continue;
    if (def.faction === 'neutre' && !neutralHeroUnlocked(state, player, id)) continue;
    pool.push({ item: id, weight: def.faction === 'neutre' ? 14 : 40 });
  }

  const out: string[] = [];
  for (let i = 0; i < OBJECT_TUNING.innOffers && pool.length > 0; i++) {
    const picked = pickWeighted(state.rng, pool);
    out.push(picked);
    const at = pool.findIndex((c) => c.item === picked);
    if (at >= 0) pool.splice(at, 1);
  }
  return out;
}

/** Le Gardien des Bornes n'apparaît qu'une fois le Grand Livre honoré. */
export function neutralHeroUnlocked(
  state: GameState,
  player: PlayerId,
  heroId: string,
): boolean {
  if (heroId !== OBJECT_TUNING.grandBookHeroId) return true;
  return ledgerInt(state, `quete.grandlivre.${player}`, 0) === 1;
}

interface Rumour {
  at: MapCoord;
  kind: MapObject['kind'];
  name: string;
}

function pickRumour(state: GameState, player: PlayerId): Rumour | null {
  const candidates: { item: Rumour; weight: number }[] = [];
  for (const obj of allObjects(state)) {
    if (obj.spent) continue;
    if (hasVisited(obj, player)) continue;
    let weight = 0;
    if (obj.kind === 'sceau') weight = 30;
    else if (obj.kind === 'artefact') weight = 24;
    else if (obj.kind === 'borne') weight = 20;
    else if (obj.kind === 'mine' && obj.owner !== player) weight = 16;
    else if (obj.kind === 'caravane') weight = 10;
    if (weight <= 0) continue;
    candidates.push({
      item: { at: { col: obj.at.col, row: obj.at.row }, kind: obj.kind, name: objectName(obj, '') },
      weight,
    });
  }
  if (candidates.length === 0) return null;
  return pickWeighted(state.rng, candidates);
}

function rumourText(rumour: Rumour): string {
  switch (rumour.kind) {
    case 'sceau':
      return `On dit qu’un des Sceaux des Marches dort encore là-haut, et qu’il est bien gardé.`;
    case 'artefact':
      return `Un colporteur a vu briller quelque chose sous une souche, du côté de là-bas. Il n’y est pas retourné.`;
    case 'borne':
      return `Il y a une borne armoriée dans ce vallon. Les anciens disaient qu’elles se répondent.`;
    case 'mine':
      return `Le gisement de ce coteau n’a plus de maître depuis la mort du comte.`;
    default:
      return `Une caravane doit passer par là avant la fin de la semaine.`;
  }
}

/* — Bornes — */

function visitBorne(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const first = !markVisited(obj, hero.owner);
  const known = discoveredBornes(state, hero.owner).length;
  if (!first) {
    return [
      notice(hero.owner, `${objectName(obj, 'La borne')} est déjà inscrite à votre registre.`, 'info'),
      visited(hero, obj, 'borne_connue'),
    ];
  }
  return [
    notice(
      hero.owner,
      `Une borne armoriée, plantée là avant les comtes, portant des armes que plus personne ne lit. ` +
        `Elle est tiède au toucher. ${
          known >= 2
            ? `Votre registre en compte désormais ${numberWord(known, true)} : le réseau répond.`
            : 'Il en faudra une seconde pour que le réseau réponde.'
        }`,
      'info',
    ),
    visited(hero, obj, 'borne_decouverte'),
  ];
}

/* — Sceaux — */

function visitSeal(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const seal = dataString(obj, 'seal') as SealId | null;
  if (!seal) return [notice(hero.owner, 'La pierre est nue : le sceau en a été arraché.', 'warn')];

  const previous = state.seals[seal]?.owner ?? null;
  if (previous === hero.owner) {
    return [notice(hero.owner, `${objectName(obj, 'Ce sceau')} porte déjà votre bannière.`, 'info')];
  }

  if (previous && state.players[previous]) {
    const list = state.players[previous].seals;
    const at = list.indexOf(seal);
    if (at >= 0) list.splice(at, 1);
  }
  obj.owner = hero.owner;
  markVisited(obj, hero.owner);
  state.seals[seal] = { owner: hero.owner, at: { col: obj.at.col, row: obj.at.row } };

  const p = state.players[hero.owner];
  if (p && !p.seals.includes(seal)) {
    p.seals.push(seal);
    p.seals.sort();
  }

  const held = p?.seals.length ?? 0;
  const events: GameEvent[] = [];
  events.push({ type: 'SealTaken', seal, by: hero.owner });
  events.push(
    notice(
      null,
      `${playerName(state, hero.owner)} lève ${objectName(obj, 'un Sceau des Marches')}. ` +
        `${dataString(obj, 'lore') ?? 'La cire ancienne se brise sans un bruit.'} ` +
        `${playerName(state, hero.owner)} en détient ${numberWord(held)} sur ${numberWord(SEALS_REQUIRED)} nécessaires.`,
      'danger',
    ),
  );
  if (held >= SEALS_REQUIRED) {
    events.push(
      notice(
        null,
        `Le compte y est : ${playerName(state, hero.owner)} peut désormais faire ouvrir la Maison du Trésor.`,
        'danger',
      ),
    );
  }
  if (previous) {
    events.push(
      notice(previous, `Un de vos sceaux vient de changer de main. Il en manque un à votre compte.`, 'danger'),
    );
  }
  events.push(...grantXp(state, hero, OBJECT_TUNING.xpSeal));
  events.push(visited(hero, obj, 'sceau_pris'));
  return events;
}

/* — Maison du Trésor — */

function visitTreasury(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const p = state.players[hero.owner];
  if (!p) return [];
  if (p.seals.length < SEALS_REQUIRED) {
    return [
      notice(
        hero.owner,
        `La porte de la Maison du Trésor est scellée de cinq cires. Il en faut ${numberWord(
          SEALS_REQUIRED,
        )} pour la faire céder ; vous en portez ${numberWord(p.seals.length)}.`,
        'warn',
      ),
    ];
  }
  if (obj.owner === hero.owner && state.claim && state.claim.by === hero.owner) {
    return [
      notice(
        hero.owner,
        `La proclamation court déjà. Il reste ${pluralize(
          Math.max(0, state.claim.endsAtTurn - state.turn),
          'jour',
          'jours',
        )} à tenir.`,
        'info',
      ),
    ];
  }

  obj.owner = hero.owner;
  markVisited(obj, hero.owner);
  const events: GameEvent[] = [];
  events.push(
    notice(
      hero.owner,
      `Le Grand Livre est là, sur la table de pierre, sous une couche de poussière de sel. ` +
        `Serments, dettes, droits de passage : tout le comté tient dans ces pages.`,
      'danger',
    ),
  );
  events.push(...startClaim(state, hero.owner));
  events.push(visited(hero, obj, 'proclamation'));
  return events;
}

/* — Villages et cités — */

function visitSettlement(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const townUid = dataString(obj, 'townUid');
  const town = townUid ? state.towns[townUid] : undefined;
  if (!town) {
    return [notice(hero.owner, `${objectName(obj, 'Ce bourg')} ne répond pas : il n’a plus de conseil.`, 'warn')];
  }
  if (town.owner === hero.owner) {
    return [
      notice(
        hero.owner,
        town.charter
          ? `${town.name} vous appartient déjà (charte ${charterLabel(town.charter)}).`
          : `${town.name} vous appartient déjà, mais n’a pas encore choisi sa charte.`,
        'info',
      ),
    ];
  }

  const previous = town.owner;
  const events: GameEvent[] = [];
  events.push(...captureTown(state, town, hero.owner));
  obj.owner = hero.owner;
  markVisited(obj, hero.owner);

  const p = state.players[hero.owner];
  if (p && !previous) p.reputation += OBJECT_TUNING.villageReputation;

  events.push(
    notice(
      null,
      previous
        ? `${town.name} change de bannière : ${playerName(state, hero.owner)} y entre sans que la cloche sonne.`
        : `${town.name} ouvre ses portes à ${playerName(state, hero.owner)}. Le conseil attend une charte.`,
      previous ? 'danger' : 'info',
    ),
  );
  if (!town.isCapital && !town.charter) {
    events.push(
      notice(
        hero.owner,
        `Le conseil de ${town.name} demande sa charte : marchande (revenus et change), ` +
          `militaire (milice et recrutement) ou spirituelle (mana, soins, réputation). ` +
          `Le choix est définitif tant que la bannière tient.`,
        'warn',
      ),
    );
  }
  events.push(visited(hero, obj, 'village_pris'));
  return events;
}

/** Libellé français d'une charte de village. */
export function charterLabel(charter: Charter): string {
  switch (charter) {
    case 'marchande':
      return 'marchande';
    case 'militaire':
      return 'militaire';
    case 'spirituelle':
    default:
      return 'spirituelle';
  }
}

/* — Doléances — */

function visitQuest(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const terms = questTerms(state, obj);
  const bag = dataBag(obj, 'quete');
  const honoured = Array.isArray(bag.honore) ? (bag.honore as string[]) : [];

  if (honoured.includes(hero.owner)) {
    return [
      notice(
        hero.owner,
        `${objectName(obj, 'La doléance')} est close : on vous salue en passant, rien de plus.`,
        'info',
      ),
    ];
  }

  const known = markVisited(obj, hero.owner);
  if (!questSatisfied(state, hero, terms)) {
    return [
      notice(
        hero.owner,
        known
          ? `${objectName(obj, 'La doléance')} tient toujours. ${questSentence(terms)}`
          : `${objectName(obj, 'On vous arrête sur le pas d’une porte')}. ${questSentence(terms)} ` +
              `Revenez quand vous pourrez y répondre.`,
        'info',
      ),
      visited(hero, obj, 'doleance_ouverte'),
    ];
  }

  const events: GameEvent[] = [];
  events.push(...payQuest(state, hero, terms));
  honoured.push(hero.owner);
  honoured.sort();
  bag.honore = honoured;

  const reward: Partial<Resources> = {
    [terms.rewardResource]: withScouting(hero, terms.rewardAmount),
  } as Partial<Resources>;
  events.push(...giveResources(state, hero.owner, reward, 'doléance honorée'));

  const p = state.players[hero.owner];
  if (p) p.reputation += OBJECT_TUNING.questReputation;

  if (terms.grandBook) {
    setLedgerInt(state, `quete.grandlivre.${hero.owner}`, 1);
    if (p && !p.tavernOffers.includes(OBJECT_TUNING.grandBookHeroId)) {
      p.tavernOffers = [OBJECT_TUNING.grandBookHeroId, ...p.tavernOffers].slice(
        0,
        OBJECT_TUNING.innOffers,
      );
    }
    events.push(
      notice(
        null,
        `Le Grand Livre a été consulté par ${playerName(state, hero.owner)}. ` +
          `Un homme sort de l’ombre des piliers : le Gardien des Bornes accepte enfin de choisir une bannière.`,
        'danger',
      ),
    );
  } else {
    events.push(
      notice(
        hero.owner,
        `${objectName(obj, 'La doléance')} est honorée. On vous remet ${describeDelta(reward)} ` +
          `et l’on promet de s’en souvenir aux prochaines levées.`,
        'info',
      ),
    );
  }
  events.push(...grantXp(state, hero, OBJECT_TUNING.xpQuest));
  events.push(visited(hero, obj, 'doleance_honoree'));
  return events;
}

/* — Gardes neutres — */

function visitGuard(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const guard = obj.guard ?? [];
  const alive = guard.filter((s) => s.count > 0);

  if (alive.length === 0) {
    if (obj.spent) return [];
    obj.spent = true;
    markVisited(obj, hero.owner);
    return [
      notice(
        hero.owner,
        'Un camp abandonné : cendres froides, piquets arrachés, une gamelle retournée. La compagnie est partie ailleurs.',
        'info',
      ),
      visited(hero, obj, 'camp_vide'),
    ];
  }

  const chance = parleyChance(state, hero, alive);
  if (chance.totalBp <= 0) {
    return [
      notice(
        hero.owner,
        `${stackNames(alive)} barrent le passage, piques en avant. Aucune parole ne portera.`,
        'warn',
      ),
    ];
  }
  const result = attemptParley(state, hero, obj);
  const events: GameEvent[] = [...result.events];
  if (result.outcome.kind !== 'combat') {
    events.push(visited(hero, obj, `parole_${result.outcome.kind}`));
  }
  return events;
}

/* ═══════════ Le catalogue de la densification (lot 1.2) ═══════════════════
   Chaque nature ajoutée au contrat en 0.1 reçoit ici son effet réel — un objet
   sans effet est du décor, ce que l'audit interdit. Les valeurs viennent de
   HMM3, transposées aux ressources du Forez. ═══════════════════════════════ */

/* — Coffres — */

function visitCoffre(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  if (obj.spent) return [];
  obj.spent = true;
  markVisited(obj, hero.owner);
  const ecus = dataInt(obj, 'ecus', 1000);
  /* Le choix or-ou-savoir de HMM3 est tranché à la graine (`data.savoir`), le
     temps qu'un vrai dialogue de choix existe côté client : un tiers des
     coffres portent du savoir. La conversion suit HMM3 — l'expérience vaut
     les deux tiers des écus. */
  if (dataInt(obj, 'savoir', 0) === 1) {
    const xp = Math.trunc((ecus * OBJECT_TUNING.coffreXpParEcu.num) / OBJECT_TUNING.coffreXpParEcu.den);
    return [
      notice(
        hero.owner,
        `Un coffre cerclé de fer sous les fougères. Dedans, ni or ni argent : des lettres, des cartes, ` +
          `un carnet de comptes qui en dit long. ${heroName(hero)} y passe la soirée.`,
        'info',
      ),
      ...grantXp(state, hero, xp),
      visited(hero, obj, 'coffre_savoir'),
    ];
  }
  return [
    ...giveResources(state, hero.owner, { ecus }, 'coffre'),
    notice(
      hero.owner,
      `Un coffre cerclé de fer sous les fougères : ${String(ecus)} écus que personne ne réclamera.`,
      'info',
    ),
    visited(hero, obj, 'coffre_ecus'),
  ];
}

/* — Écoles — */

function visitEcole(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const eleves = dataBag(obj, 'eleves');
  const matiere = (dataString(obj, 'matiere') ?? 'vaillance') as PrimaryStat;
  if (eleves[hero.uid] === true) {
    return [
      notice(hero.owner, `${heroName(hero)} a déjà suivi la leçon de ${objectName(obj, "l'école")}.`, 'info'),
      visited(hero, obj, 'ecole_deja'),
    ];
  }
  const prix = dataInt(obj, 'prix', OBJECT_TUNING.ecolePrix);
  if (!canPay(state, hero.owner, { ecus: prix })) {
    return [
      notice(
        hero.owner,
        `Le maître de ${objectName(obj, "l'école")} demande ${String(prix)} écus pour sa leçon. ` +
          `Le trésor n'y suffit pas aujourd'hui.`,
        'warn',
      ),
    ];
  }
  eleves[hero.uid] = true;
  markVisited(obj, hero.owner);
  hero[matiere] += 1;
  return [
    ...giveResources(state, hero.owner, { ecus: -prix }, 'ecole'),
    notice(
      hero.owner,
      `${heroName(hero)} paie ${String(prix)} écus et suit la leçon : ` +
        `+1 en ${matiere}. Certaines choses ne s'apprennent qu'une fois.`,
      'info',
    ),
    visited(hero, obj, 'ecole_lecon'),
  ];
}

/* — Oratoires — */

/** Pose une bénédiction en purgeant les expirées et le doublon du même lieu. */
function poserBenediction(
  state: GameState,
  hero: HeroInstance,
  b: { kind: 'morale' | 'fortune'; value: number; jusquau: number; source: string },
): void {
  const gardees = (hero.benedictions ?? []).filter(
    (x) => state.turn <= x.jusquau && x.source !== b.source,
  );
  gardees.push(b);
  hero.benedictions = gardees;
}

function visitOratoire(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  markVisited(obj, hero.owner);
  poserBenediction(state, hero, {
    kind: 'morale',
    value: 1,
    jusquau: state.turn + OBJECT_TUNING.oratoireJours - 1,
    source: obj.uid,
  });
  return [
    notice(
      hero.owner,
      `Une chandelle brûle dans ${objectName(obj, "l'oratoire")}. La troupe se découvre, quelqu'un entonne ` +
        `un cantique faux mais sincère : +1 de moral pour ${numberWord(OBJECT_TUNING.oratoireJours)} jours.`,
      'info',
    ),
    visited(hero, obj, 'oratoire'),
  ];
}

/* — Fontaines aux fées — */

function visitFontaine(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const key = `fontaine.usage.${obj.uid}`;
  if (dailyUsesLeft(state, key, hero.uid, 1) <= 0) {
    return [
      notice(hero.owner, `Les fées de ${objectName(obj, 'la fontaine')} ont déjà répondu aujourd'hui.`, 'info'),
    ];
  }
  consumeDailyUsage(state, key, hero.uid);
  markVisited(obj, hero.owner);
  /* HMM3 tire la fortune entre -1 et +3 ; le zéro n'existe pas — les fées
     répondent toujours quelque chose. */
  let valeur = nextInt(state.rng, -1, 3);
  if (valeur === 0) valeur = 1;
  const finDeSemaine = state.turn + (8 - dayOf(state.turn));
  poserBenediction(state, hero, {
    kind: 'fortune',
    value: valeur,
    jusquau: finDeSemaine,
    source: obj.uid,
  });
  return [
    notice(
      hero.owner,
      valeur > 0
        ? `${heroName(hero)} jette une pièce dans ${objectName(obj, 'la fontaine')} ; l'eau frissonne dans le ` +
          `bon sens. Fortune +${String(valeur)} jusqu'au dimanche.`
        : `L'eau de ${objectName(obj, 'la fontaine')} se trouble : les fées sont contrariées. ` +
          `Fortune ${String(valeur)} jusqu'au dimanche.`,
      valeur > 0 ? 'info' : 'warn',
    ),
    visited(hero, obj, 'fontaine'),
  ];
}

/* — Moulins — */

function visitMoulin(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const key = `${OBJECT_TUNING.moulinLedgerKey}.${obj.uid}`;
  if (weeklyUsesLeft(state, key, 'roue', 1) <= 0) {
    return [
      notice(
        hero.owner,
        `La roue de ${objectName(obj, 'ce moulin')} a déjà donné sa mouture de la semaine.`,
        'info',
      ),
      visited(hero, obj, 'moulin_vide'),
    ];
  }
  consumeWeeklyUsage(state, key, 'roue');
  markVisited(obj, hero.owner);
  const resource = (dataString(obj, 'resource') ?? 'ecus') as ResourceKey;
  const amount = dataInt(obj, 'amount', 250);
  return [
    ...giveResources(state, hero.owner, { [resource]: amount } as Partial<Resources>, 'moulin'),
    notice(
      hero.owner,
      `Le meunier de ${objectName(obj, 'ce moulin')} règle sa dîme de la semaine au premier passé : ` +
        `${describeDelta({ [resource]: amount } as Partial<Resources>)}.`,
      'info',
    ),
    visited(hero, obj, 'moulin'),
  ];
}

/* — Demeures franches — */

function visitDemeure(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const creature = dataString(obj, 'creature');
  const def = creature ? content().CREATURES[creature] : undefined;
  if (!creature || !def) {
    return [notice(hero.owner, `${objectName(obj, 'La demeure')} est abandonnée depuis des années.`, 'info')];
  }
  const events: GameEvent[] = [];
  if (obj.owner !== hero.owner) {
    obj.owner = hero.owner;
    events.push(
      notice(
        hero.owner,
        `${objectName(obj, 'La demeure')} passe sous votre bannière : ses ${def.namePlural} ` +
          `viendront grossir vos rangs chaque semaine.`,
        'info',
      ),
    );
  }
  markVisited(obj, hero.owner);
  const stock = dataInt(obj, 'stock', 0);
  if (stock <= 0) {
    events.push(notice(hero.owner, `Personne à enrôler cette semaine : la relève grandit encore.`, 'info'));
    events.push(visited(hero, obj, 'demeure_vide'));
    return events;
  }
  /* On enrôle tout ce que le trésor peut payer et que l'armée peut loger. */
  let possibles = stock;
  while (possibles > 0 && !canPay(state, hero.owner, recruitCost(creature, possibles))) possibles--;
  if (possibles <= 0 || !armySlotsFree(hero.army, creature)) {
    events.push(
      notice(
        hero.owner,
        possibles <= 0
          ? `${String(stock)} ${stock > 1 ? def.namePlural : def.name} attendent, mais le trésor ne suit pas.`
          : `${String(stock)} ${stock > 1 ? def.namePlural : def.name} attendent, mais l'armée n'a plus un rang de libre.`,
        'warn',
      ),
    );
    events.push(visited(hero, obj, 'demeure_pleine'));
    return events;
  }
  const cost = recruitCost(creature, possibles);
  const negatif: Partial<Resources> = {};
  for (const [k, v] of Object.entries(cost)) negatif[k as ResourceKey] = -(v ?? 0);
  addToArmy(hero.army, creature, possibles);
  obj.data.stock = stock - possibles;
  events.push(...giveResources(state, hero.owner, negatif, 'demeure'));
  events.push(
    notice(
      hero.owner,
      `${String(possibles)} ${possibles > 1 ? def.namePlural : def.name} rejoignent ${heroName(hero)} ` +
        `contre ${describeDelta(cost)}.`,
      'info',
    ),
  );
  events.push(...grantXp(state, hero, 0));
  events.push(visited(hero, obj, 'demeure_enrolement'));
  return events;
}

/* — Banques (repaires gardés) — */

function visitBanque(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  if (obj.spent) {
    return [
      notice(hero.owner, `${objectName(obj, 'Le repaire')} a été vidé ; la vermine reviendra.`, 'info'),
      visited(hero, obj, 'banque_vide'),
    ];
  }
  obj.spent = true;
  markVisited(obj, hero.owner);
  /* La garde a été battue en amont par le flux des lieux gardés. Le butin est
     à la mesure du danger ; la vermine repeuplera le repaire (tour de jeu). */
  obj.data.reposeA = weekOf(state.turn) + dataInt(obj, 'repop', 4);
  const delta: Partial<Resources> = { ecus: dataInt(obj, 'ecus', 2000) };
  const resource = dataString(obj, 'resource') as ResourceKey | null;
  if (resource) delta[resource] = dataInt(obj, 'amount', 0);
  const events: GameEvent[] = [
    ...giveResources(state, hero.owner, delta, 'banque'),
    notice(
      hero.owner,
      `Le repaire est nettoyé jusqu'au dernier recoin : ${describeDelta(delta)}. ` +
        `Ces murs ne resteront pas vides longtemps.`,
      'info',
    ),
    ...grantXp(state, hero, OBJECT_TUNING.xpBanque),
    visited(hero, obj, 'banque_videe'),
  ];
  const artifact = dataString(obj, 'artifact') as ArtifactId | null;
  if (artifact) events.push(...acquireArtifact(state, hero, artifact));
  return events;
}

/* — Pierres levées (monolithes) — */

function visitMonolithe(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  obj: MapObject,
): GameEvent[] {
  markVisited(obj, hero.owner);
  const jumeauUid = dataString(obj, 'jumeau');
  const jumeau = jumeauUid ? (state.objects[jumeauUid] ?? null) : null;
  if (!jumeau) {
    return [
      notice(hero.owner, `${objectName(obj, 'La pierre levée')} est muette : sa jumelle est perdue.`, 'warn'),
    ];
  }
  hero.at = { col: jumeau.entrance.col, row: jumeau.entrance.row };
  hero.path = null;
  markVisited(jumeau, hero.owner);
  revealFog(state, world, hero.owner, hero.at, heroStats(state, hero).vision);
  return [
    notice(
      hero.owner,
      `${heroName(hero)} pose la main sur ${objectName(obj, 'la pierre levée')} — un froid de gouffre, un pas, ` +
        `et le pays a changé autour de la jumelle.`,
      'info',
    ),
    /* Le contrat d'événements n'a pas de téléportation : un déplacement d'un
       seul pas, au coût nul, dit exactement ce que la vue doit savoir. */
    { type: 'HeroMoved', hero: hero.uid, path: [{ col: hero.at.col, row: hero.at.row }], costSpent: 0 },
    visited(hero, obj, 'monolithe'),
  ];
}

/* — Montjoies (obélisques) — */

function visitObelisque(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  obj: MapObject,
): GameEvent[] {
  const lecteurs = dataBag(obj, 'lecteurs');
  if (lecteurs[hero.owner] === true) {
    return [
      notice(hero.owner, `Votre maison a déjà relevé les marques de ${objectName(obj, 'ce montjoie')}.`, 'info'),
      visited(hero, obj, 'montjoie_deja'),
    ];
  }
  lecteurs[hero.owner] = true;
  markVisited(obj, hero.owner);
  const tresor = allObjects(state).find((o) => o.kind === 'maison_tresor');
  if (tresor) {
    revealFog(state, world, hero.owner, tresor.at, OBJECT_TUNING.obelisqueReveal);
  }
  const tous = allObjects(state).filter((o) => o.kind === 'obelisque');
  const lus = tous.filter((o) => dataBag(o, 'lecteurs')[hero.owner] === true).length;
  return [
    notice(
      hero.owner,
      `Les marques du montjoie s'assemblent : ${String(lus)} sur ${String(tous.length)} relevées. ` +
        `Chacune éclaire un peu mieux les alentours de la Maison du Trésor.`,
      'info',
    ),
    visited(hero, obj, 'montjoie'),
  ];
}

/* — Bureaux des passes et postes de péage — */

function visitTenteClef(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  const couleur = dataString(obj, 'couleur') ?? 'grenat';
  const key = `${OBJECT_TUNING.laissezPasserLedgerKey}.${couleur}.${hero.owner}`;
  markVisited(obj, hero.owner);
  if (ledgerInt(state, key, 0) === 1) {
    return [
      notice(hero.owner, `Votre maison porte déjà le laissez-passer ${couleur}.`, 'info'),
      visited(hero, obj, 'passe_deja'),
    ];
  }
  setLedgerInt(state, key, 1);
  return [
    notice(
      hero.owner,
      `Le scribe du bureau appose son sceau : votre maison porte désormais le laissez-passer ` +
        `${couleur}. Les postes de péage de cette couleur s'ouvriront.`,
      'info',
    ),
    visited(hero, obj, 'passe_obtenu'),
  ];
}

function visitGardeFrontiere(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  obj: MapObject,
): GameEvent[] {
  const couleur = dataString(obj, 'couleur') ?? 'grenat';
  const key = `${OBJECT_TUNING.laissezPasserLedgerKey}.${couleur}.${hero.owner}`;
  if (obj.spent) {
    return [notice(hero.owner, `Le poste est ouvert : la barrière pend sur son montant.`, 'info')];
  }
  if (ledgerInt(state, key, 0) !== 1) {
    return [
      notice(
        hero.owner,
        `Le poste de péage barre le col : « laissez-passer ${couleur}, ou demi-tour ». ` +
          `Le bureau des passes de cette couleur se trouve quelque part sur la carte.`,
        'warn',
      ),
      visited(hero, obj, 'peage_refus'),
    ];
  }
  obj.spent = true;
  /* La barrière tombe : l'empreinte ne bloque plus que sa case d'entrée, et le
     calcul de chemin doit le réapprendre immédiatement. */
  obj.footprint = [{ col: obj.entrance.col, row: obj.entrance.row }];
  invalidateWorldCache(world);
  markVisited(obj, hero.owner);
  return [
    notice(
      hero.owner,
      `Le garde examine le sceau ${couleur}, rend le pli, et lève la barrière. Le col est ouvert — ` +
        `pour tout le monde, désormais.`,
      'info',
    ),
    visited(hero, obj, 'peage_ouvert'),
  ];
}

/* — Cartographes — */

function visitCartographe(
  state: GameState,
  world: WorldMap,
  hero: HeroInstance,
  obj: MapObject,
): GameEvent[] {
  const clients = dataBag(obj, 'clients');
  if (clients[hero.owner] === true) {
    return [
      notice(hero.owner, `Vous possédez déjà les cartes de ${objectName(obj, 'ce cartographe')}.`, 'info'),
      visited(hero, obj, 'cartographe_deja'),
    ];
  }
  const prix = dataInt(obj, 'prix', OBJECT_TUNING.cartographePrix);
  if (!canPay(state, hero.owner, { ecus: prix })) {
    return [
      notice(
        hero.owner,
        `Le cartographe déroule ses planches : ${String(prix)} écus la région, pas un de moins.`,
        'warn',
      ),
    ];
  }
  const regionNom = dataString(obj, 'region');
  const regionIdx = regionNom ? (REGIONS as readonly string[]).indexOf(regionNom) : world.region[obj.at.row * world.cols + obj.at.col];
  clients[hero.owner] = true;
  markVisited(obj, hero.owner);
  const p = state.players[hero.owner];
  let revelees = 0;
  if (p) {
    for (let i = 0; i < world.region.length; i++) {
      if (world.region[i] !== regionIdx) continue;
      if (p.fog[i] < 1) {
        p.fog[i] = 1;
        revelees++;
      }
    }
  }
  return [
    ...giveResources(state, hero.owner, { ecus: -prix }, 'cartographe'),
    notice(
      hero.owner,
      `${String(prix)} écus changent de main, et les planches aussi : ${String(revelees)} lieues de pays ` +
        `s'inscrivent sur vos cartes.`,
      'info',
    ),
    { type: 'FogRevealed', player: hero.owner, cells: [] },
    visited(hero, obj, 'cartographe_achat'),
  ];
}

/* — Colporteurs (marché noir) — */

function visitMarcheNoir(state: GameState, hero: HeroInstance, obj: MapObject): GameEvent[] {
  if (obj.spent) {
    return [
      notice(hero.owner, `Les colporteurs n'ont plus rien sous le bât — repassez une autre semaine.`, 'info'),
      visited(hero, obj, 'colporteurs_vides'),
    ];
  }
  const artifact = dataString(obj, 'artifact') as ArtifactId | null;
  const prix = dataInt(obj, 'prix', 2500);
  if (!artifact) {
    obj.spent = true;
    return [notice(hero.owner, `Les colporteurs ne vendent que des rubans aujourd'hui.`, 'info')];
  }
  if (!canPay(state, hero.owner, { ecus: prix })) {
    return [
      notice(
        hero.owner,
        `Sous la toile du bât, un objet qu'on ne montre pas au marché : ${String(prix)} écus, sans reçu.`,
        'warn',
      ),
      visited(hero, obj, 'colporteurs_trop_cher'),
    ];
  }
  obj.spent = true;
  markVisited(obj, hero.owner);
  return [
    ...giveResources(state, hero.owner, { ecus: -prix }, 'marche_noir'),
    ...acquireArtifact(state, hero, artifact),
    notice(hero.owner, `Affaire conclue à voix basse : ${String(prix)} écus, sans reçu ni regret.`, 'info'),
    visited(hero, obj, 'colporteurs_achat'),
  ];
}

/* ── Lecture ────────────────────────────────────────────────────────────── */

/** Libellés français des genres de lieux. */
export const OBJECT_KIND_LABELS: Record<MapObject['kind'], string> = {
  ville: 'Cité',
  village: 'Village',
  mine: 'Gisement',
  ressource: 'Cache',
  artefact: 'Trouvaille',
  garde: 'Compagnie neutre',
  borne: 'Borne armoriée',
  sanctuaire: 'Sanctuaire',
  auberge: 'Auberge',
  caravane: 'Caravane',
  sceau: 'Sceau des Marches',
  maison_tresor: 'Maison du Trésor',
  belvedere: 'Belvédère',
  source: 'Source',
  obstacle: 'Obstacle',
  quete: 'Doléance',
  demeure: 'Demeure franche',
  moulin: 'Moulin',
  banque: 'Repaire',
  monolithe: 'Pierre levée',
  obelisque: 'Montjoie',
  ecole: 'École',
  temple: 'Oratoire',
  fontaine: 'Fontaine aux fées',
  coffre: 'Coffre',
  garde_frontiere: 'Poste de péage',
  tente_clef: 'Bureau des passes',
  cartographe: 'Cartographe',
  marche_noir: 'Colporteurs',
};

/** Une ligne d'inspection, pour l'info-bulle de la carte. */
export function describeObject(state: GameState, obj: MapObject, player: PlayerId): string {
  const label = OBJECT_KIND_LABELS[obj.kind] ?? 'Lieu';
  const name = objectName(obj, label);
  const parts: string[] = [`${label} — ${name}.`];

  if (obj.owner) parts.push(`Sous la bannière de ${playerName(state, obj.owner)}.`);
  if (obj.spent) parts.push('Déjà vidé.');
  if (obj.guard && obj.guard.some((s) => s.count > 0)) {
    parts.push(`Gardé par ${stackNames(obj.guard)}.`);
  }
  switch (obj.kind) {
    case 'mine': {
      const resource = resourceOf(obj);
      if (resource) parts.push(`Rend ${resourceWords(resource, dataInt(obj, 'amount', 0))} par jour.`);
      break;
    }
    case 'ressource': {
      const resource = resourceOf(obj);
      if (resource && !obj.spent) parts.push(`On y devine ${resourceWords(resource, dataInt(obj, 'amount', 0))}.`);
      break;
    }
    case 'borne':
      parts.push(
        hasVisited(obj, player)
          ? 'Inscrite à votre registre : le réseau y mène.'
          : 'Inconnue de votre registre.',
      );
      break;
    case 'quete': {
      // Lecture seule : on n'engage pas le tirage d'une doléance non ouverte.
      const terms = questTermsIfKnown(obj);
      parts.push(
        terms
          ? questSentence(terms)
          : 'Une doléance attend qu’on veuille bien l’écouter.',
      );
      break;
    }
    default:
      break;
  }
  const lore = dataString(obj, 'lore');
  if (lore) parts.push(lore);
  return parts.join(' ');
}

/** Objets encore intéressants pour une bannière, pour l'IA et le navigateur. */
export function pendingObjects(state: GameState, player: PlayerId): MapObject[] {
  return allObjects(state).filter((obj) => {
    if (obj.spent) return false;
    switch (obj.kind) {
      case 'ressource':
      case 'artefact':
      case 'caravane':
      case 'sceau':
      case 'quete':
        return true;
      case 'mine':
      case 'village':
      case 'ville':
      case 'maison_tresor':
        return obj.owner !== player;
      case 'borne':
      case 'belvedere':
      case 'sanctuaire':
        return !hasVisited(obj, player);
      default:
        return false;
    }
  });
}

/** Héros présent sur l'entrée d'un lieu, s'il y en a un. */
export function heroAtEntrance(state: GameState, obj: MapObject): HeroUid | null {
  for (const uid of Object.keys(state.heroes).sort()) {
    if (sameCoord(state.heroes[uid].at, obj.entrance)) return uid;
  }
  return null;
}
