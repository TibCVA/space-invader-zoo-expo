/**
 * CONTRAT DES VUES PIXIJS — fichier de référence, à lire et à respecter.
 *
 * Trois vues impératives vivent sous `apps/client/src/` : la carte
 * (`render/`), le combat (`battle/`) et les cités (`town/`). Elles sont
 * écrites en PixiJS et pilotées par la coquille React, qui ne connaît d'elles
 * que ce fichier.
 *
 * ## Les trois règles
 *
 * 1. **Aucune logique de règles dans une vue** (non négociable n°4). Une vue
 *    lit l'état par `deps.store.get()` et émet des `Command` par
 *    `deps.dispatch(...)`. Elle ne calcule jamais un dégât, un revenu, un coût
 *    de terrain ni une victoire : cela appartient à `@auvergne/engine`.
 * 2. **Une vue est un objet à cycle de vie complet** : elle possède son
 *    `Container`, elle se redimensionne, elle s'anime, elle se détruit. La
 *    coquille React ne fait qu'attacher `view.container` à `app.stage`,
 *    appeler `resize`/`update`, puis `destroy`.
 * 3. **La fabrique est asynchrone** : construire un tableau de cité ou un
 *    champ de bataille demande des `RenderTexture`, donc au moins une passe de
 *    rendu. Elle doit rester **sous 2 secondes** pour tenir le budget de 6 s
 *    des routes de démonstration (docs/03-ROUTES.md).
 *
 * ## Ce que la coquille garantit
 *
 * - `deps.app` est l'unique `Application` PixiJS du client, déjà initialisée
 *   (WebGPU si possible, sinon WebGL) ; son `canvas` est déjà dans le DOM.
 * - `deps.atlas` est construit une seule fois par session.
 * - `deps.world` et l'état de `deps.store` sont cohérents entre eux.
 * - `resize` est appelé au moins une fois **avant** le premier `update`.
 * - `update(dtMs)` est appelé à chaque image, `dtMs` étant le temps écoulé en
 *   millisecondes (borné à 100 ms pour survivre à un onglet en arrière-plan).
 * - `destroy()` n'est appelé qu'une fois, et plus rien n'est appelé ensuite.
 */

import type { Application, Container } from 'pixi.js';
import type {
  BuildingId,
  CombatState,
  CombatUnit,
  FactionId,
  GameEvent,
  GameState,
  HexCoord,
  MapCoord,
  MapObject,
  PlayerId,
  TownState,
  TownUid,
  WorldMap,
} from '@auvergne/engine';
import type { ArtAtlas } from './art/index.js';
import type { AppState, DispatchResult, PathPreview, Selection } from './state/types.js';
import type { Command } from '@auvergne/engine';

/* ═══════════════════════════ 1. Dépendances ══════════════════════════════ */

/**
 * Accès en lecture à l'état du client. C'est volontairement la même forme que
 * `useSyncExternalStore` : `get()` renvoie un instantané immuable, `subscribe`
 * prévient d'un changement sans dire lequel.
 */
export interface ViewStore {
  get(): AppState;
  subscribe(listener: () => void): () => void;
}

/** Émission d'une commande. Seule porte de mutation offerte aux vues. */
export type ViewDispatch = (command: Command) => DispatchResult;

/** Qualité de rendu choisie par le joueur dans les options. */
export type ViewQuality = 'basse' | 'moyenne' | 'haute';

/** Dépendances communes aux trois vues. */
export interface ViewDeps {
  /** l'unique application PixiJS du client */
  readonly app: Application;
  /** l'atlas procédural, déjà construit */
  readonly atlas: ArtAtlas;
  /** lecture de l'état du client */
  readonly store: ViewStore;
  /** émission de commandes */
  readonly dispatch: ViewDispatch;
  /** carte statique de la partie affichée */
  readonly world: WorldMap;
  /** bannière pilotée par cet appareil */
  readonly localPlayer: PlayerId;
  /** taille utile en pixels CSS au moment de la fabrique */
  readonly width: number;
  readonly height: number;
  /** `prefers-reduced-motion` ou réglage du joueur : couper les animations d'ambiance */
  readonly reducedMotion: boolean;
  readonly quality: ViewQuality;
  /**
   * Vrai pour une route `#/demo/*` : l'état est factice, la vue ne doit
   * déclencher aucune écriture de sauvegarde ni aucun tour d'IA.
   */
  readonly demo: boolean;
}

/* ═══════════════════════════ 2. Vue générique ════════════════════════════ */

/** Le socle commun. Toute vue impérative du client l'implémente. */
export interface GameView {
  /** racine à attacher à `app.stage`. Ne jamais la remplacer après coup. */
  readonly container: Container;
  /** nouvelle taille utile, en pixels CSS. Appelé avant le premier `update`. */
  resize(width: number, height: number): void;
  /** une image ; `dtMs` est borné à 100 ms. */
  update(dtMs: number): void;
  /** libère textures, écouteurs et minuteries. Idempotent. */
  destroy(): void;
}

/* ═══════════════════════════ 3. Carte d'aventure ═════════════════════════ */

/** Caméra de la carte : centre en cases, facteur d'échelle. */
export interface MapCamera {
  /** colonne au centre de l'écran (fractionnaire) */
  readonly col: number;
  /** ligne au centre de l'écran (fractionnaire) */
  readonly row: number;
  /** pixels par case, borné par la vue */
  readonly zoom: number;
}

/**
 * Ce qu'on désigne quand on demande une FICHE, et non une action.
 *
 * Le geste d'information est distinct du geste d'action. Sur la carte, un
 * appui court AGIT — il choisit un héros, trace une route, la confirme — et
 * n'ouvre une fiche que s'il n'y avait rien à faire. Un appui LONG informe
 * toujours. C'est la traduction au doigt du clic gauche / clic droit de HMM3.
 */
export type CibleCarte =
  | { readonly kind: 'heros'; readonly uid: string; readonly at: MapCoord }
  | { readonly kind: 'cite'; readonly uid: TownUid; readonly at: MapCoord }
  | { readonly kind: 'objet'; readonly object: MapObject }
  | { readonly kind: 'case'; readonly at: MapCoord };

/** Ce que la carte signale à la coquille. Aucun de ces rappels ne mute l'état. */
export interface MapViewCallbacks {
  /** case cliquée (clic simple, ou tapotement) */
  onPickCell?(at: MapCoord): void;
  /** héros cliqué */
  onPickHero?(uid: string, at: MapCoord): void;
  /** cité cliquée */
  onPickTown?(uid: TownUid, at: MapCoord): void;
  /** objet de carte cliqué */
  onPickObject?(object: MapObject): void;
  /**
   * On demande la FICHE de ce qui est sous le doigt.
   *
   * **Pourquoi ce rappel existe.** Mesuré sur iPhone dans une vraie partie :
   * toucher son propre héros ouvrait un carton couvrant 45 % de la carte —
   * exactement au-dessus de l'endroit où il faut toucher ensuite pour tracer
   * une route. Le propriétaire l'a signalé ainsi : « dès que je veux cliquer
   * sur un endroit pour que le héros s'y rende, cela ouvre la vignette de
   * l'endroit et cache la carte ». Le geste d'information mangeait le geste
   * de jeu.
   *
   * La coquille n'ouvre donc la fiche QUE sur ce rappel-ci, jamais sur les
   * `onPick*`, qui ne servent plus qu'à choisir.
   */
  onInspect?(cible: CibleCarte): void;
  /** survol (souris) ou glissement long (tactile) : sert à prévisualiser */
  onHoverCell?(at: MapCoord | null): void;
  /** la caméra a bougé, pour synchroniser une minicarte */
  onCameraChange?(camera: MapCamera): void;
}

export interface MapViewDeps extends ViewDeps, MapViewCallbacks {
  /** cadrage initial ; à défaut, le premier héros du joueur local */
  readonly focus?: MapCoord;
}

export interface MapView extends GameView {
  /* — Caméra — */
  getCamera(): MapCamera;
  setCamera(camera: Partial<MapCamera>): void;
  /** centre la caméra ; `animate` glisse en 320 ms, sinon saut immédiat */
  centerOn(at: MapCoord, options?: { animate?: boolean; zoom?: number }): void;
  panBy(dxPixels: number, dyPixels: number): void;
  /** `factor` > 1 rapproche ; `anchor` est un point écran conservé */
  zoomBy(factor: number, anchor?: { x: number; y: number }): void;

  /* — Sélection, chemin, brouillard — */
  /** liseré doré sur la case, l'unité ou la cité sélectionnée */
  setSelection(selection: Selection | null): void;
  /** perles dorées et fanions de jour ; `null` efface le tracé */
  setPathPreview(preview: PathPreview | null): void;
  /**
   * Recalcule le masque de brouillard depuis `player.fog`. À appeler après
   * tout événement `FogRevealed` ; la vue adoucit les frontières elle-même.
   */
  refreshFog(player: PlayerId): void;

  /* — Contenu — */
  /** l'état a changé : la vue relit héros, cités, objets et bannières */
  sync(state: GameState): void;
  /**
   * Joue la file d'événements (déplacements, révélations, captures) et se
   * résout quand l'animation est terminée. Doit se terminer immédiatement
   * lorsque `reducedMotion` est vrai.
   */
  playEvents(events: readonly GameEvent[]): Promise<void>;

  /* — Conversions — */
  /** case sous un point écran, `null` hors de la grille */
  cellAt(x: number, y: number): MapCoord | null;
  /** position écran du centre d'une case */
  screenOf(at: MapCoord): { x: number; y: number };
}

/** Fabrique de la carte. Implémentée par `apps/client/src/render/index.ts`. */
export type CreateMapView = (deps: MapViewDeps) => Promise<MapView>;

/* ═══════════════════════════ 4. Combat tactique ══════════════════════════ */

/**
 * Prévisualisation d'attaque : ce que la vue affiche **avant** confirmation.
 * Les nombres viennent tous de `damageRange` — la vue ne les calcule jamais.
 */
export interface AttackPreview {
  readonly attacker: string;
  readonly target: string;
  /**
   * Case de départ de l'attaque au corps à corps. Ce n'est pas un détail
   * d'affichage : l'angle, la riposte conditionnelle et la charge se comptent
   * depuis elle, et c'est elle qui part dans `{kind:'attack', …, from}`.
   */
  readonly from?: HexCoord;
  /** hexagones à parcourir pour l'atteindre ; 0 si la pile y est déjà */
  readonly approach?: number;
  /**
   * Faux quand aucune case d'approche n'est atteignable ce tour-ci. L'assaut
   * doit alors être visiblement impossible, jamais tenté puis refusé.
   */
  readonly reachable?: boolean;
  readonly ranged: boolean;
  readonly damage: { readonly min: number; readonly max: number };
  readonly kills: readonly [number, number];
  readonly retaliation: boolean;
  /** ce que la riposte rendra, chiffré ; `null` quand la cible ne riposte pas */
  readonly retaliationDamage?: {
    readonly min: number;
    readonly max: number;
    readonly kills: readonly [number, number];
  } | null;
  readonly modifiers: readonly { readonly label: string; readonly bp: number }[];
}

export interface BattleViewCallbacks {
  /** hexagone cliqué */
  onPickHex?(hex: HexCoord): void;
  /** unité cliquée */
  onPickUnit?(unit: CombatUnit): void;
  /** survol : la coquille demande alors une prévisualisation au moteur */
  onHoverHex?(hex: HexCoord | null): void;
  /** une animation d'action est terminée (déblocage de la file) */
  onActionPlayed?(index: number): void;
}

export interface BattleViewDeps extends ViewDeps, BattleViewCallbacks {
  readonly combat: CombatState;
}

export interface BattleView extends GameView {
  /** nouvel état de combat (après `applyCombatAction`) */
  setCombat(combat: CombatState): void;
  /** met en avant la pile qui joue et la barre d'initiative */
  setActiveUnit(unitId: string | null): void;
  /** cases atteignables, telles que renvoyées par `reachableHexes` */
  setReachable(hexes: readonly HexCoord[]): void;
  /** chemin prévisualisé, tel que renvoyé par `hexPath` */
  setMovePreview(path: readonly HexCoord[] | null): void;
  /** carte de dégâts prévisionnels, ou `null` pour l'effacer */
  setAttackPreview(preview: AttackPreview | null): void;
  /** cases visées par un sort en cours de ciblage */
  setSpellTargets(hexes: readonly HexCoord[] | null): void;
  /** joue les entrées du journal de combat, dans l'ordre */
  playEvents(events: readonly GameEvent[]): Promise<void>;
  /** hexagone sous un point écran */
  hexAt(x: number, y: number): HexCoord | null;
  /** centre de l'hexagone en pixels écran */
  screenOf(hex: HexCoord): { x: number; y: number };
}

/** Fabrique du combat. Implémentée par `apps/client/src/battle/index.ts`. */
export type CreateBattleView = (deps: BattleViewDeps) => Promise<BattleView>;

/* ═══════════════════════════ 5. Écran de cité ════════════════════════════ */

/**
 * Heure du tableau. Le jour de la semaine la détermine (bible artistique §5) :
 * jour 1 aube, jour 4 midi, jour 7 crépuscule ; les valeurs intermédiaires
 * sont interpolées par la vue.
 */
export type TownHour = 'aube' | 'midi' | 'crepuscule';

export interface TownViewCallbacks {
  /** bâtiment cliqué : la coquille ouvre la carte d'information */
  onPickBuilding?(building: BuildingId): void;
  /** survol d'un bâtiment, `null` à la sortie */
  onHoverBuilding?(building: BuildingId | null): void;
  /** emplacement libre cliqué : la coquille ouvre le choix de construction */
  onPickPlot?(index: number): void;
  /** la porte de la cité a été cliquée : retour à la carte */
  onLeave?(): void;
}

export interface TownViewDeps extends ViewDeps, TownViewCallbacks {
  readonly town: TownUid;
  readonly faction: FactionId;
  /** heure imposée ; à défaut la vue la déduit du jour de la semaine */
  readonly hour?: TownHour;
}

export interface TownView extends GameView {
  /** nouvel état de la cité : bâtiments construits, garnison, agitation */
  setTown(town: TownState): void;
  /** change l'étalonnage lumineux */
  setHour(hour: TownHour): void;
  /** liseré doré sur un bâtiment, `null` pour l'effacer */
  highlightBuilding(building: BuildingId | null): void;
  /** animation de levée de 700 ms d'un bâtiment neuf */
  playBuild(building: BuildingId): Promise<void>;
  /** dérive de parallaxe, en fraction de −1 à 1 (souris ou inclinaison) */
  setParallax(x: number, y: number): void;
}

/** Fabrique de la cité. Implémentée par `apps/client/src/town/index.ts`. */
export type CreateTownView = (deps: TownViewDeps) => Promise<TownView>;

/* ═══════════════════════════ 6. Aides communes ═══════════════════════════ */

/**
 * Borne du pas de temps transmis à `update`. Un onglet remis au premier plan
 * après une minute ne doit pas faire sauter les animations d'un cran.
 */
export const MAX_FRAME_MS = 100;

/** Durée standard d'une animation d'interface (bible artistique §8). */
export const UI_MOTION_MS = 180;

/** Courbe standard d'une animation d'interface. */
export const UI_EASING = 'cubic-bezier(.22,.61,.36,1)';
