/**
 * Météo du Forez.
 *
 * Principe directeur du document maître : la météo est **annoncée deux jours à
 * l'avance**. Elle crée des choix, jamais des surprises arbitraires. L'état
 * porte donc en permanence `current` et `forecast = [J+1, J+2]`, et chaque
 * changement de jour fait glisser cette file d'un cran.
 *
 * Le don de Côme (« Lecture du ciel ») consiste à **retarder un front d'un
 * jour**, une fois par semaine : le temps du jour se prolonge, la file de
 * prévision ne bouge pas. C'est une capacité défensive, publique et bornée.
 *
 * Aucun `Math.random` : tous les tirages passent par `state.rng`.
 */
import {
  weekOf,
  type GameEvent,
  type GameState,
  type HeroInstance,
  type PlayerId,
  type SpellSchool,
  type WeatherKind,
} from '../types.js';
import { pickWeighted } from '../rng.js';
import { content } from '../core/index.js';
import {
  consumeWeeklyUsage,
  heroName,
  heroesOf,
  ledgerInt,
  notice,
  setLedgerInt,
  weeklyUsageAvailable,
} from './common.js';

/* ── Réglages ───────────────────────────────────────────────────────────── */

/**
 * Table météorologique complète. Tous les ratios sont en points de base
 * (10000 = neutre) et toutes les valeurs sont entières.
 *
 *  - `moveBp` multiplie le **coût** d'un pas : au-dessus de 10000, on avance
 *    moins loin. C'est le noyau (`core/movement.stepCost`) qui l'applique ;
 *    `heroStats` ne le duplique surtout pas.
 *  - `visionBp` multiplie la portée de vue, appliqué par `core/turn.visionOf`.
 *  - `rangedBp`, `flyBp`, `flankBp` sont lus par le module de combat.
 *  - `moraleDelta` et `manaBp` sont propres au module monde : ils touchent la
 *    fiche du héros (moral affiché, réserve de mana) et ne font double emploi
 *    avec aucun calcul du noyau.
 *  - `schoolBp` renforce ou affaiblit une école de magie, conformément au
 *    document maître (pluie → Sources, givre → Braises, brume → Brumes…).
 *  - `weight` est le poids de tirage de base ; `persistBp` ajoute un poids
 *    supplémentaire au front déjà annoncé, pour que les temps durent.
 */
export const WEATHER_TUNING: Readonly<
  Record<
    WeatherKind,
    {
      label: string;
      short: string;
      description: string;
      moveBp: number;
      visionBp: number;
      rangedBp: number;
      flyBp: number;
      flankBp: number;
      moraleDelta: number;
      manaBp: number;
      schoolBp: Partial<Record<SpellSchool, number>>;
      weight: number;
    }
  >
> = {
  eclaircie: {
    label: 'Éclaircie',
    short: 'clair',
    description:
      'Le ciel est lavé jusqu’aux Bois Noirs et l’on distingue la Pierre Pamole depuis la chaussée. Rien ne gêne, rien n’aide.',
    moveBp: 10000,
    visionBp: 10000,
    rangedBp: 10000,
    flyBp: 10000,
    flankBp: 10000,
    moraleDelta: 0,
    manaBp: 10000,
    schoolBp: {},
    weight: 38,
  },
  pluie: {
    label: 'Pluie',
    short: 'pluie',
    description:
      'Une pluie droite et patiente noie les ornières et gonfle la Durolle. Les cordes d’arc se détendent ; les sources, elles, se souviennent.',
    moveBp: 10700,
    visionBp: 9300,
    rangedBp: 9300,
    flyBp: 9500,
    flankBp: 10000,
    moraleDelta: 0,
    manaBp: 10000,
    schoolBp: { sources: 11500, braises: 9000 },
    weight: 20,
  },
  brume: {
    label: 'Brume',
    short: 'brume',
    description:
      'La brume des fonds monte à hauteur d’épaule et avale les repères. On ne voit plus l’ennemi ; l’ennemi ne voit plus son flanc.',
    moveBp: 10200,
    visionBp: 6500,
    rangedBp: 7800,
    flyBp: 9800,
    flankBp: 11500,
    moraleDelta: -1,
    manaBp: 10500,
    schoolBp: { brumes: 11500 },
    weight: 16,
  },
  givre: {
    label: 'Givre',
    short: 'givre',
    description:
      'Le givre soude les feuilles mortes et raidit les futaies. Chaque pas sous couvert coûte double ; les forges, elles, tirent mieux.',
    moveBp: 10800,
    visionBp: 9700,
    rangedBp: 9900,
    flyBp: 9300,
    flankBp: 10000,
    moraleDelta: -1,
    manaBp: 10000,
    schoolBp: { braises: 11500, racines: 9000 },
    weight: 13,
  },
  vent: {
    label: 'Vent des crêtes',
    short: 'vent',
    description:
      'Le vent des crêtes descend des Bois Noirs en rafales longues. Il porte les ailes et détourne les traits lointains.',
    moveBp: 10100,
    visionBp: 10500,
    rangedBp: 8600,
    flyBp: 11500,
    flankBp: 10000,
    moraleDelta: 0,
    manaBp: 10000,
    schoolBp: { racines: 10500 },
    weight: 13,
  },
};

/** Réglages du système météorologique lui-même. */
export const WEATHER_SYSTEM_TUNING = {
  /** Poids supplémentaire accordé au front déjà annoncé : les temps durent. */
  persistWeight: 14,
  /** Poids supplémentaire du beau temps en début de partie (première ronde). */
  earlyClearWeight: 10,
  /** Nombre de jours de la première ronde bénéficiant de cette clémence. */
  earlyClearTurns: 14,
  /** Usages du don de Côme par semaine et par bannière. */
  delaysPerWeek: 1,
  /** Clef de comptabilité du don de Côme dans la chronique. */
  ledgerKey: 'meteo.decalage',
  /** Un front est « contraire » si son coût de marche dépasse ce seuil (BP). */
  adverseMoveBp: 10500,
  /** … ou si sa portée de vue tombe sous ce seuil (BP). */
  adverseVisionBp: 9000,
} as const;

/** Les cinq temps, dans un ordre stable. */
export const WEATHER_ORDER: readonly WeatherKind[] = [
  'eclaircie',
  'pluie',
  'brume',
  'givre',
  'vent',
];

/* ── Lecture ────────────────────────────────────────────────────────────── */

/**
 * Modificateurs météorologiques, en points de base.
 * Signature imposée par `docs/02-API.md`.
 */
export function weatherModifiers(w: WeatherKind): {
  moveBp: number;
  visionBp: number;
  rangedBp: number;
  flyBp: number;
  flankBp: number;
} {
  const row = WEATHER_TUNING[w] ?? WEATHER_TUNING.eclaircie;
  return {
    moveBp: row.moveBp,
    visionBp: row.visionBp,
    rangedBp: row.rangedBp,
    flyBp: row.flyBp,
    flankBp: row.flankBp,
  };
}

/** Libellé français d'un temps. */
export function weatherName(w: WeatherKind): string {
  return (WEATHER_TUNING[w] ?? WEATHER_TUNING.eclaircie).label;
}

/** Description évocatrice d'un temps, pour le bandeau et le codex. */
export function weatherStory(w: WeatherKind): string {
  return (WEATHER_TUNING[w] ?? WEATHER_TUNING.eclaircie).description;
}

/** Ratio appliqué à une école de magie par le temps qu'il fait, en BP. */
export function weatherSchoolBp(w: WeatherKind, school: SpellSchool): number {
  const row = WEATHER_TUNING[w] ?? WEATHER_TUNING.eclaircie;
  return row.schoolBp[school] ?? 10000;
}

/** Effet du temps sur la fiche d'un héros : moral et réserve de mana. */
export function weatherHeroModifiers(w: WeatherKind): { moraleDelta: number; manaBp: number } {
  const row = WEATHER_TUNING[w] ?? WEATHER_TUNING.eclaircie;
  return { moraleDelta: row.moraleDelta, manaBp: row.manaBp };
}

/** « Brume sur le Forez. Prévision : pluie demain, puis éclaircie. » */
export function forecastSentence(state: GameState): string {
  const [j1, j2] = state.weather.forecast;
  return `${weatherName(state.weather.current)} sur le Forez. Prévision : ${weatherName(
    j1,
  ).toLowerCase()} demain, puis ${weatherName(j2).toLowerCase()}.`;
}

/** Vrai si ce temps dessert la marche ou la vue. */
export function isAdverse(w: WeatherKind): boolean {
  const row = WEATHER_TUNING[w] ?? WEATHER_TUNING.eclaircie;
  return (
    row.moveBp >= WEATHER_SYSTEM_TUNING.adverseMoveBp ||
    row.visionBp <= WEATHER_SYSTEM_TUNING.adverseVisionBp
  );
}

/* ── Tirage ─────────────────────────────────────────────────────────────── */

/**
 * Tire le front qui entrera dans la file de prévision.
 * Consomme le PRNG de l'état : à n'appeler que depuis une transition de jour.
 */
export function drawWeather(state: GameState): WeatherKind {
  const trailing = state.weather.forecast[1];
  const early = state.turn <= WEATHER_SYSTEM_TUNING.earlyClearTurns;
  const entries = WEATHER_ORDER.map((kind) => {
    let weight = WEATHER_TUNING[kind].weight;
    if (kind === trailing) weight += WEATHER_SYSTEM_TUNING.persistWeight;
    if (early && kind === 'eclaircie') weight += WEATHER_SYSTEM_TUNING.earlyClearWeight;
    return { item: kind, weight: Math.max(1, weight) };
  });
  return pickWeighted(state.rng, entries);
}

/* ── Don de Côme ────────────────────────────────────────────────────────── */

/** Vrai si ce héros porte la spécialité météorologique (« Lecture du ciel »). */
export function readsTheSky(hero: HeroInstance): boolean {
  const def = content().HEROES[hero.def];
  return def?.specialty.kind === 'weather';
}

export interface DelayVerdict {
  ok: boolean;
  reason?: string;
}

/**
 * Côme peut-il retarder le front ? Une fois par semaine et par bannière, et
 * jamais deux fois de suite (un report est déjà en cours).
 */
export function canDelayFront(state: GameState, hero: HeroInstance): DelayVerdict {
  if (!readsTheSky(hero)) {
    return { ok: false, reason: `${heroName(hero)} ne sait pas lire le ciel.` };
  }
  if (state.weather.delayedBy) {
    return { ok: false, reason: 'Un front est déjà retenu : on ne retient pas deux fois le ciel.' };
  }
  if (
    !weeklyUsageAvailable(
      state,
      WEATHER_SYSTEM_TUNING.ledgerKey,
      hero.owner,
      WEATHER_SYSTEM_TUNING.delaysPerWeek,
    )
  ) {
    return {
      ok: false,
      reason: 'Le ciel a déjà été retenu cette semaine. Il faudra attendre la suivante.',
    };
  }
  return { ok: true };
}

/**
 * Retarde le front d'un jour. Le temps du jour se prolongera demain et la file
 * de prévision ne bougera pas : c'est `advanceWeather` qui consomme le report.
 */
export function delayFront(state: GameState, hero: HeroInstance): GameEvent[] {
  const verdict = canDelayFront(state, hero);
  if (!verdict.ok) return [notice(hero.owner, verdict.reason ?? 'Report impossible.', 'warn')];
  state.weather.delayedBy = hero.owner;
  consumeWeeklyUsage(state, WEATHER_SYSTEM_TUNING.ledgerKey, hero.owner);
  return [
    notice(
      null,
      `${heroName(hero)} lit le ciel et retient le front d’un jour : ${weatherName(
        state.weather.current,
      ).toLowerCase()} se prolongera demain sur tout le Forez.`,
      'warn',
    ),
  ];
}

/**
 * Décision automatique du don de Côme, prise au moment où la prévision est
 * publiée. Un joueur servi par un lecteur du ciel retient le front lorsque
 * celui-ci dessert la marche ou la vue et que le temps du jour, lui, ne
 * dessert rien. Le choix est déterministe et lisible par tous.
 */
function autoDelay(state: GameState): GameEvent[] {
  if (state.weather.delayedBy) return [];
  const incoming = state.weather.forecast[0];
  if (!isAdverse(incoming) || isAdverse(state.weather.current)) return [];
  for (const player of state.turnOrder) {
    const p = state.players[player];
    if (!p || !p.alive) continue;
    for (const hero of heroesOf(state, player)) {
      if (!readsTheSky(hero)) continue;
      if (hero.downUntilTurn > state.turn) continue;
      const verdict = canDelayFront(state, hero);
      if (!verdict.ok) continue;
      return delayFront(state, hero);
    }
  }
  return [];
}

/* ── Passage du jour ────────────────────────────────────────────────────── */

/**
 * Fait avancer la météo d'un jour.
 * Signature imposée par `docs/02-API.md` ; appelée par `core/turn.advanceDay`.
 */
export function advanceWeather(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];

  // 1. Un front retenu : le temps du jour se prolonge, la file ne bouge pas.
  if (state.weather.delayedBy) {
    const holder: PlayerId = state.weather.delayedBy;
    state.weather.delayedBy = null;
    events.push({
      type: 'WeatherChanged',
      current: state.weather.current,
      forecast: [state.weather.forecast[0], state.weather.forecast[1]],
    });
    events.push(
      notice(
        null,
        `Le front annoncé s’est arrêté aux crêtes : ${weatherName(
          state.weather.current,
        ).toLowerCase()} tient un jour de plus sur le Forez, à la faveur de ${
          state.players[holder]?.name ?? holder
        }. ${forecastSentence(state)}`,
        'info',
      ),
    );
    return events;
  }

  // 2. Glissement normal de la file de prévision.
  const previous = state.weather.current;
  const [next, then] = state.weather.forecast;
  state.weather.current = next;
  state.weather.forecast = [then, drawWeather(state)];
  setLedgerInt(state, 'meteo.derniereSemaine', weekOf(state.turn));

  events.push({
    type: 'WeatherChanged',
    current: state.weather.current,
    forecast: [state.weather.forecast[0], state.weather.forecast[1]],
  });

  if (previous !== state.weather.current) {
    events.push(notice(null, `${weatherStory(state.weather.current)} ${forecastSentence(state)}`, 'info'));
  } else {
    events.push(notice(null, forecastSentence(state), 'info'));
  }

  // 3. Le don de Côme s'exerce sur la prévision fraîchement publiée.
  events.push(...autoDelay(state));
  return events;
}

/**
 * Décale immédiatement le temps d'un cran (sort « Voile de pluie »).
 * Le lendemain arrive aujourd'hui ; une nouvelle prévision est tirée.
 */
export function shiftWeatherNow(state: GameState): GameEvent[] {
  const [next, then] = state.weather.forecast;
  state.weather.current = next;
  state.weather.forecast = [then, drawWeather(state)];
  return [
    {
      type: 'WeatherChanged',
      current: state.weather.current,
      forecast: [state.weather.forecast[0], state.weather.forecast[1]],
    },
    notice(null, `Le ciel bascule sans prévenir. ${forecastSentence(state)}`, 'warn'),
  ];
}

/** Semaine du dernier changement enregistré, pour l'interface. */
export function lastWeatherWeek(state: GameState): number {
  return ledgerInt(state, 'meteo.derniereSemaine', weekOf(state.turn));
}
