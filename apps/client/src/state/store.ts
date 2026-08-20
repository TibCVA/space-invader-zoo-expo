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
/* ─────────────────────── Relais des commandes en ligne ──────────────────── */

/**
 * Crochet posé par `online/partie.ts` quand la partie chargée vient du serveur.
 *
 * Le magasin n'importe rien de `online/` : c'est le module réseau qui vient
 * s'inscrire ici, comme le registre des portraits peints le fait pour le
 * design system. Le magasin ne sait donc jamais si une partie est en ligne — il
 * sait seulement qu'après une commande acceptée, quelqu'un veut peut-être en
 * être informé.
 */
type RelaisDeCommande = (command: Command) => boolean;

let relaisDeCommande: RelaisDeCommande | null = null;

/** Inscrit — ou retire, avec `null` — le relais réseau. */
export function brancherRelaisDeCommandes(relais: RelaisDeCommande | null): void {
  relaisDeCommande = relais;
}

export function chargerPartie(chargement: ChargementPartie): void {
  const { state, world, setup, slot, commands, demo = false } = chargement;
  /* Toute partie qu'on ouvre est locale jusqu'à preuve du contraire : c'est à
     `installerPartieEnLigne` de rebrancher le relais juste après. Sans cette
     ligne, ouvrir une sauvegarde solo continuerait d'expédier ses coups à la
     dernière partie en ligne visitée. */
  relaisDeCommande = null;
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

  /*
   * Une sauvegarde peut avoir été prise pendant qu'une bannière de
   * l'ordinateur avait la main — on ferme l'onglet, la boucle s'arrête là.
   * Sans ce rappel, rouvrir cette partie la retrouverait figée exactement au
   * même endroit, et pour de bon. `installerPartieEnLigne` rebranche le relais
   * juste après, ce qui coupe court : la garde du relais est relue à
   * l'intérieur.
   */
  void deroulerIaLocale();
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

  /* Partie en ligne : le coup vient d'être joué sur le moteur local, il part
     maintenant au serveur, qui reste seul juge. Rien n'est attendu ici — le
     contrat des vues veut un `dispatch` synchrone, et sur une partie jouée à
     plusieurs jours d'intervalle la latence ne se voit pas. */
  relaisDeCommande?.(command);

  /* Partie locale : les bannières confiées à l'ordinateur n'ont personne pour
     les jouer. On les déroule ici, sans attendre — voir `deroulerIaLocale`. */
  void deroulerIaLocale();

  return { ok: true, events: resultat.events };
}

/* ────────────────────────── Les tours de l'ordinateur ───────────────────── */

/**
 * QUI JOUE LES BANNIÈRES DE L'ORDINATEUR DANS UNE PARTIE LOCALE.
 *
 * **Le défaut.** « Nouvelle partie » monte une partie entièrement locale :
 * `demarrerPartie` appelle `createGame` dans le navigateur et n'envoie rien au
 * serveur. Or le serveur est le seul endroit du dépôt qui déroulait l'IA
 * (`deroulerIa`, dans `routes/parties.ts`) — et il n'est pas dans la boucle
 * d'une partie locale. Le client, lui, n'importait même pas `@auvergne/bots`.
 *
 * Résultat mesuré dans un vrai navigateur : on rend la main, la bannière de
 * l'ordinateur prend le tour, et l'écran reste sur « La main est à Maison
 * de… » **pour toujours**. Le chemin le plus naturel depuis l'accueil ne
 * dépassait pas le premier tour.
 *
 * **La forme du correctif.** On imite le serveur, y compris son garde-fou et
 * son cas « l'IA n'a rien à jouer » — sans quoi une bannière sans coup
 * possible immobiliserait la partie sur elle. Trois différences tiennent au
 * navigateur :
 *
 *  - `@auvergne/bots` est importé **paresseusement**. Il ne pèse sur le
 *    premier chargement d'aucun joueur en ligne, qui n'en a pas besoin ;
 *  - on rend la main au navigateur entre deux tours, faute de quoi la carte
 *    ne se repeint pas et le joueur voit un écran figé au lieu de voir la
 *    journée avancer ;
 *  - un verrou empêche deux déroulés simultanés : `dispatch` peut être appelé
 *    de nouveau pendant qu'on attend une image.
 */

/** Au plus autant de tours d'IA enchaînés après un coup humain. */
const MAX_TOURS_IA_LOCAUX = 8;

let iaEnCours = false;

/** Rend la main au navigateur pour qu'il repeigne entre deux tours d'IA. */
function respirer(): Promise<void> {
  return new Promise((resoudre) => {
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resoudre());
    else setTimeout(resoudre, 16);
  });
}

/** Vrai si cette bannière est tenue par l'ordinateur. */
function estConfieeAlIa(setup: GameSetup | null, id: PlayerId): boolean {
  return setup?.players.find((p) => p.id === id)?.kind === 'ia';
}

/**
 * Déroule les tours de l'ordinateur tant que la main lui appartient.
 *
 * Ne fait rien en ligne (le serveur s'en charge et reste seul juge) ni en
 * démonstration (dont les captures doivent rester reproductibles).
 */
export async function deroulerIaLocale(): Promise<void> {
  if (iaEnCours || relaisDeCommande !== null || etat.demo) return;
  if (!etat.game || !etat.world || !etat.setup) return;
  if (!estConfieeAlIa(etat.setup, etat.game.activePlayer)) return;

  iaEnCours = true;
  try {
    const { runBotTurn } = await import('@auvergne/bots');
    for (let garde = 0; garde < MAX_TOURS_IA_LOCAUX; garde += 1) {
      /*
       * Le relais est relu à CHAQUE tour, et pas seulement à l'entrée.
       * `chargerPartie` le met à `null` avant qu'`installerPartieEnLigne` ne le
       * rebranche : entre les deux, une partie en ligne se présente comme
       * locale. L'attente de l'import laisse passer cet instant, et sans cette
       * relecture le navigateur jouerait lui-même les bannières d'IA d'une
       * partie dont le serveur est seul juge.
       */
      if (relaisDeCommande !== null || etat.demo) return;
      const { game, world, setup } = etat;
      if (!game || !world || !setup) return;
      if (game.phase === 'termine') return;
      const actif = game.activePlayer;
      if (!estConfieeAlIa(setup, actif)) return;

      let suivant: GameState;
      let evenements: GameEvent[];
      try {
        const tour = runBotTurn(game, world, actif);
        if (tour.commands.length === 0) {
          /* Une IA qui n'a rien à jouer doit tout de même passer la main, sans
             quoi la partie s'immobiliserait sur sa bannière. */
          const fin = applyCommand(game, { type: 'EndTurn' }, world);
          if (!fin.ok) return;
          suivant = fin.state;
          evenements = fin.events;
        } else {
          suivant = tour.state;
          evenements = tour.events;
        }
      } catch {
        /*
         * Une IA qui tombe ne doit pas emporter la partie avec elle : on lui
         * fait passer la main et le joueur continue de jouer. Se taire ici
         * serait pire que le défaut d'origine — la partie se figerait, mais
         * sans trace.
         */
        const fin = applyCommand(game, { type: 'EndTurn' }, world);
        if (!fin.ok) return;
        suivant = fin.state;
        evenements = fin.events;
        poser({ notice: 'Une bannière de l’ordinateur a passé son tour.' });
      }

      const maintenant = typeof performance === 'undefined' ? Date.now() : performance.now();
      poser({
        game: suivant,
        queue: [
          ...etat.queue,
          ...evenements.map((event) => ({ id: prochainEvenement++, event, at: maintenant })),
        ],
      });
      planifierSauvegarde();
      await respirer();
    }
  } finally {
    iaEnCours = false;
  }
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
 * Affiche un message au joueur sans passer par une commande. Sert au relais des
 * parties en ligne, qui a des choses à dire — « en attente de Jean », un
 * conflit de séquence, une coupure réseau — qu'aucune règle du jeu ne produit.
 */
export function poserNotice(notice: string | null): void {
  poser({ notice });
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
