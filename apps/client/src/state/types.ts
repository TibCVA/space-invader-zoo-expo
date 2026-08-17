/**
 * Modèle d'état **du client** — tout ce qui n'appartient pas au moteur.
 *
 * Séparation stricte (non négociable n°4) : `GameState` est la vérité de la
 * simulation et n'est modifié que par `applyCommand` ; tout le reste (ce qui
 * est sélectionné, quel panneau est ouvert, quel chemin est prévisualisé,
 * quelle animation reste à jouer) vit ici et n'entre jamais dans le hachage.
 */

import type {
  Command,
  GameEvent,
  GameSetup,
  GameState,
  HeroUid,
  MapCoord,
  ObjectUid,
  PlayerId,
  TownUid,
  WorldMap,
} from '@auvergne/engine';

/* ───────────────────────────── Sélection ────────────────────────────────── */

export type Selection =
  | { readonly kind: 'heros'; readonly uid: HeroUid }
  | { readonly kind: 'cite'; readonly uid: TownUid }
  | { readonly kind: 'objet'; readonly uid: ObjectUid }
  | { readonly kind: 'case'; readonly at: MapCoord };

/**
 * Prévisualisation de chemin : le rythme imposé est
 * **sélection → prévisualisation → confirmation**, jamais un déplacement au
 * premier clic. `days` donne l'indice de la case où chaque journée s'achève,
 * ce qui permet de poser les fanions de jour sur les perles dorées.
 */
export interface PathPreview {
  readonly hero: HeroUid;
  readonly to: MapCoord;
  readonly path: readonly MapCoord[];
  readonly costs: readonly number[];
  /** indices de rupture de journée dans `path` */
  readonly days: readonly number[];
  /** nombre de cases franchissables aujourd'hui */
  readonly reachableToday: number;
  /** vrai quand le joueur a confirmé : la vue peut animer le déplacement */
  readonly confirmed: boolean;
}

/** Panneaux latéraux ou remontant du bas, un seul ouvert à la fois. */
export type PanelKind = 'heros' | 'cite' | 'armee' | 'sorts' | 'objectifs' | 'journal' | 'menu';

/** Événement en attente d'animation, dans l'ordre d'émission. */
export interface QueuedEvent {
  readonly id: number;
  readonly event: GameEvent;
  /** horodatage d'émission, en millisecondes de performance */
  readonly at: number;
}

/* ─────────────────────────── Sauvegarde ─────────────────────────────────── */

export type SaveStatus =
  /** rien à écrire */
  | 'repos'
  /** écrit en local, envoi serveur programmé */
  | 'differe'
  /** requête en vol */
  | 'envoi'
  /** confirmé par le serveur (ou local seul si le serveur est absent) */
  | 'enregistre'
  /** le serveur a refusé ; la sauvegarde locale, elle, est bonne */
  | 'erreur';

export interface SaveIndicator {
  readonly status: SaveStatus;
  /** horodatage du dernier enregistrement réussi */
  readonly at: number | null;
  /** message français affiché en info-bulle en cas d'erreur */
  readonly message: string | null;
}

/* ───────────────────────────── L'état global ────────────────────────────── */

export interface AppState {
  /** état autoritaire ; `null` tant qu'aucune partie n'est chargée */
  readonly game: GameState | null;
  /** carte statique associée ; `null` avec `game` */
  readonly world: WorldMap | null;
  readonly setup: GameSetup | null;
  /** bannière pilotée par cet appareil */
  readonly localPlayer: PlayerId | null;
  readonly selection: Selection | null;
  readonly pathPreview: PathPreview | null;
  readonly panel: PanelKind | null;
  /** file d'événements à animer, consommée par les vues */
  readonly queue: readonly QueuedEvent[];
  /** vrai pour un état de démonstration : aucune écriture de sauvegarde */
  readonly demo: boolean;
  readonly save: SaveIndicator;
  /** identifiant de l'emplacement de sauvegarde automatique */
  readonly slotId: string | null;
  /** dernier refus de commande, en français, à afficher puis effacer */
  readonly notice: string | null;
  /** commandes appliquées depuis le début, pour la rejouabilité */
  readonly commands: readonly Command[];
  /** incrémenté à chaque mutation ; utile aux vues impératives */
  readonly revision: number;
}

/** Résultat rendu par `dispatch`, déjà traduit pour l'interface. */
export interface DispatchResult {
  readonly ok: boolean;
  readonly error?: string;
  readonly events: readonly GameEvent[];
}
