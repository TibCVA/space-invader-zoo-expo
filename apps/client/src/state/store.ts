/**
 * Le magasin du client — sans dépendance, bâti sur `useSyncExternalStore`.
 *
 * Un seul objet immuable (`AppState`), une seule porte de mutation du jeu
 * (`dispatch`, qui passe par `applyCommand`), et un abonnement plat. Aucune
 * bibliothèque : React 19 fournit tout ce qu'il faut.
 *
 * ## Le cycle d'une action du joueur
 *
 * ```
 *  vue  →  dispatch(Command)  →  applyCommand(engine)  →  GameEvent[]
 *                                        │
 *                                        ├→ nouvel AppState (rendu React)
 *                                        ├→ file d'animation (vues PixiJS)
 *                                        └→ sauvegarde (locale + serveur différé)
 * ```
 *
 * Les routes de démonstration posent `demo: true` : la sauvegarde est coupée
 * de bout en bout, aucune écriture ne peut échapper.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react';
import {
  applyCommand,
  computePath,
  createGame,
  pathDays,
  heroStats,
} from '@auvergne/engine';
import type {
  Command,
  GameEvent,
  GameSetup,
  GameState,
  HeroUid,
  MapCoord,
  PlayerId,
  WorldMap,
} from '@auvergne/engine';
import type { SaveSlot } from '@auvergne/protocol';
import { Autosave, SLOT_AUTO, decrireEmplacement, serialiser } from './persistence.js';
import type { AppState, DispatchResult, PanelKind, PathPreview, Selection } from './types.js';

/* ────────────────────────────── L'instantané ────────────────────────────── */

const ETAT_INITIAL: AppState = {
  game: null,
  world: null,
  setup: null,
  localPlayer: null,
  selection: null,
  pathPreview: null,
  panel: null,
  queue: [],
  demo: false,
  save: { status: 'repos', at: null, message: null },
  slotId: null,
  notice: null,
  commands: [],
  revision: 0,
};

let etat: AppState = ETAT_INITIAL;
const abonnes = new Set<() => void>();
let prochainEvenement = 1;

const autosave = new Autosave();

autosave.observer((status, details) => {
  poser({ save: { status, at: details.at, message: details.message } });
});

function notifier(): void {
  for (const a of [...abonnes]) a();
}

/** Remplace une partie de l'état et prévient les abonnés. */
function poser(patch: Partial<AppState>): void {
  etat = { ...etat, ...patch, revision: etat.revision + 1 };
  notifier();
}

/** Instantané courant. Référence stable entre deux mutations. */
export function getState(): AppState {
  return etat;
}

/** Abonnement plat. Retourne la fonction de désabonnement. */
export function subscribe(listener: () => void): () => void {
  abonnes.add(listener);
  return () => {
    abonnes.delete(listener);
  };
}

/** Le magasin tel que le voit une vue PixiJS (`view-contract.ts`). */
export const viewStore = { get: getState, subscribe };

/* ────────────────────────── Crochets React ──────────────────────────────── */

/** L'état complet. Le rendu ne se déclenche qu'aux mutations réelles. */
export function useAppState(): AppState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/**
 * Une projection de l'état. Le sélecteur est mémorisé sur l'identité de
 * l'instantané : il n'est réévalué qu'après une mutation, ce qui évite la
 * boucle infinie classique d'un sélecteur qui construit un objet neuf.
 */
export function useApp<T>(selector: (state: AppState) => T, egal: (a: T, b: T) => boolean = Object.is): T {
  const cache = useRef<{ source: AppState; valeur: T } | null>(null);
  const lire = useCallback((): T => {
    const source = getState();
    const precedent = cache.current;
    if (precedent && precedent.source === source) return precedent.valeur;
    const valeur = selector(source);
    if (precedent && egal(precedent.valeur, valeur)) {
      cache.current = { source, valeur: precedent.valeur };
      return precedent.valeur;
    }
    cache.current = { source, valeur };
    return valeur;
  }, [selector, egal]);
  return useSyncExternalStore(subscribe, lire, lire);
}

/* ───────────────────────── Chargement d'une partie ──────────────────────── */

export interface ChargementPartie {
  state: GameState;
  world: WorldMap;
  setup: GameSetup;
  localPlayer?: PlayerId;
  slot?: SaveSlot | null;
  commands?: readonly Command[];
  /** état de démonstration : aucune sauvegarde ne sera écrite */
  demo?: boolean;
}

/** Installe une partie dans le magasin. */
export function chargerPartie(chargement: ChargementPartie): void {
  const { state, world, setup, slot, commands, demo = false } = chargement;
  const localPlayer =
    chargement.localPlayer ??
    setup.players.find((p) => p.kind === 'humain')?.id ??
    state.turnOrder[0] ??
    'P1';
  autosave.setSilencieux(demo);
  etat = {
    ...ETAT_INITIAL,
    game: state,
    world,
    setup,
    localPlayer,
    demo,
    slotId: demo ? null : (slot?.id ?? SLOT_AUTO),
    commands: commands ? [...commands] : [],
    save: demo ? { status: 'repos', at: null, message: null } : etat.save,
    revision: etat.revision + 1,
  };
  notifier();
}

/**
 * Crée une partie neuve depuis l'assistant. La construction de la carte du
 * Forez coûte près d'une seconde : elle est faite hors du rendu, et le
 * chargement est signalé par l'écran appelant.
 */
export async function demarrerPartie(setup: GameSetup): Promise<void> {
  const { buildWorld } = await import('@auvergne/map');
  const world = buildWorld(setup.seed);
  const state = createGame(setup, world);
  chargerPartie({ state, world, setup });
  planifierSauvegarde('Nouvelle partie');
}

/** Vide le magasin (retour à l'accueil, abandon d'une démonstration). */
export function quitterPartie(): void {
  autosave.annuler();
  autosave.setSilencieux(false);
  etat = { ...ETAT_INITIAL, save: etat.save, revision: etat.revision + 1 };
  notifier();
}

/* ─────────────────────────────── Sauvegarde ─────────────────────────────── */

function planifierSauvegarde(nom = 'Partie en cours'): void {
  const { game, setup, demo, slotId, commands } = etat;
  if (demo || !game || !setup) return;
  try {
    autosave.planifier({
      slot: decrireEmplacement(game, { id: slotId ?? SLOT_AUTO, name: nom, autosave: true }),
      setup,
      state: serialiser(game),
      commands: [...commands],
    });
  } catch {
    /* Sérialisation impossible : la partie continue, l'indicateur le dit. */
    poser({ save: { status: 'erreur', at: etat.save.at, message: "La partie n'a pas pu être sérialisée." } });
  }
}

/** Force l'envoi de la sauvegarde en attente (fin de tour, fermeture). */
export async function viderSauvegarde(): Promise<void> {
  await autosave.vider();
}

/* ──────────────────────────────── Dispatch ──────────────────────────────── */

/**
 * **La** porte de mutation du jeu. Valide par le moteur, récolte les
 * événements, met à jour l'état, alimente la file d'animation et programme la
 * sauvegarde. Aucun composant n'appelle `applyCommand` directement.
 */
export function dispatch(command: Command): DispatchResult {
  const { game, world } = etat;
  if (!game || !world) {
    const error = "Aucune partie n'est chargée.";
    poser({ notice: error });
    return { ok: false, error, events: [] };
  }

  let resultat;
  try {
    resultat = applyCommand(game, command, world);
  } catch (err) {
    const error =
      err instanceof Error
        ? `Le moteur a refusé l'action : ${err.message}`
        : "Le moteur a refusé l'action.";
    poser({ notice: error });
    return { ok: false, error, events: [] };
  }

  if (!resultat.ok) {
    poser({ notice: resultat.error ?? 'Action impossible.' });
    return { ok: false, error: resultat.error, events: resultat.events };
  }

  const maintenant = typeof performance === 'undefined' ? Date.now() : performance.now();
  const queue = [
    ...etat.queue,
    ...resultat.events.map((event) => ({ id: prochainEvenement++, event, at: maintenant })),
  ];

  poser({
    game: resultat.state,
    queue,
    commands: [...etat.commands, command],
    notice: null,
    /* Un déplacement confirmé consomme la prévisualisation. */
    pathPreview: command.type === 'MoveHero' ? null : etat.pathPreview,
  });

  planifierSauvegarde();
  return { ok: true, events: resultat.events };
}

/* ───────────────────────── Sélection et chemin ──────────────────────────── */

export function selectionner(selection: Selection | null): void {
  poser({ selection, pathPreview: null });
}

export function ouvrirPanneau(panel: PanelKind | null): void {
  poser({ panel });
}

export function effacerNotice(): void {
  if (etat.notice !== null) poser({ notice: null });
}

/**
 * Calcule la prévisualisation de chemin d'un héros vers une case.
 * Le calcul appartient au moteur (`computePath`, `pathDays`) ; le magasin ne
 * fait que le ranger. Retourne `false` si la case est inatteignable.
 */
export function previsualiserChemin(hero: HeroUid, to: MapCoord): boolean {
  const { game, world } = etat;
  if (!game || !world) return false;
  const instance = game.heroes[hero];
  if (!instance) return false;

  const trouve = computePath(world, game, instance, to);
  if (!trouve || trouve.path.length === 0) {
    poser({ pathPreview: null, notice: 'Aucun chemin ne mène jusque-là.' });
    return false;
  }

  const stats = heroStats(game, instance);
  const jours = pathDays(trouve.costs, instance.movement, stats.movementMax);
  const aujourdhui = jours.length > 0 ? (jours[0] ?? trouve.path.length) : trouve.path.length;

  const preview: PathPreview = {
    hero,
    to,
    path: trouve.path,
    costs: trouve.costs,
    days: jours,
    reachableToday: aujourdhui,
    confirmed: false,
  };
  poser({ pathPreview: preview, notice: null });
  return true;
}

/** Confirme la prévisualisation : le héros se met en route. */
export function confirmerChemin(): DispatchResult {
  const preview = etat.pathPreview;
  if (!preview) return { ok: false, error: 'Aucun chemin à confirmer.', events: [] };
  poser({ pathPreview: { ...preview, confirmed: true } });
  return dispatch({ type: 'MoveHero', hero: preview.hero, to: preview.to });
}

export function annulerChemin(): void {
  if (etat.pathPreview) poser({ pathPreview: null });
}

/* ────────────────────────── File d'animation ────────────────────────────── */

/** Retire et retourne les événements en attente d'animation. */
export function consommerEvenements(): GameEvent[] {
  if (etat.queue.length === 0) return [];
  const sortie = etat.queue.map((q) => q.event);
  poser({ queue: [] });
  return sortie;
}

/** Ajoute un événement à animer sans passer par une commande (arrivée réseau). */
export function empilerEvenements(events: readonly GameEvent[]): void {
  if (events.length === 0) return;
  const maintenant = typeof performance === 'undefined' ? Date.now() : performance.now();
  poser({
    queue: [...etat.queue, ...events.map((event) => ({ id: prochainEvenement++, event, at: maintenant }))],
  });
}

/* ───────────────────────────── Diagnostic ───────────────────────────────── */

/** Remet le magasin à zéro. Réservé aux tests et au démontage complet. */
export function reinitialiser(): void {
  autosave.annuler();
  etat = ETAT_INITIAL;
  prochainEvenement = 1;
  notifier();
}
