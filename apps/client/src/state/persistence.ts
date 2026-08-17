/**
 * Persistance des parties — `localStorage` immédiat, serveur différé.
 *
 * Deux niveaux, dans cet ordre de confiance :
 *
 *  1. **`localStorage`** : écrit *à chaque* mutation, de façon synchrone. Le
 *     brief impose que le jeu reste jouable sans base de données (non
 *     négociable n°8) ; c'est ce niveau qui le garantit.
 *  2. **`PUT /api/saves/:id`** : envoyé après **2 secondes de repos**, pour ne
 *     pas inonder le serveur pendant qu'un joueur enchaîne les clics. Un échec
 *     réseau n'est jamais fatal : il change seulement l'indicateur.
 *
 * L'état est toujours transporté par `serializeState` — c'est la seule
 * fonction qui sait traiter les `Uint8Array` du brouillard sans casser le hash.
 */

import type { Command, GameSetup, GameState } from '@auvergne/engine';
import { dayOf, weekOf } from '@auvergne/engine';
import { API, serializeState, deserializeState } from '@auvergne/protocol';
import type { SaveSlot } from '@auvergne/protocol';

/* ────────────────────────────── Constantes ──────────────────────────────── */

/** Clef de l'emplacement automatique local. */
const CLEF_LOCALE = 'auvergne.partie.v1';
/** Identifiant de l'emplacement automatique côté serveur. */
export const SLOT_AUTO = 'auto-1';
/** Repos exigé avant l'envoi au serveur, en millisecondes. */
export const DELAI_ENVOI_MS = 2000;

/* ─────────────────────────────── Le modèle ──────────────────────────────── */

/** Une sauvegarde complète, telle qu'elle voyage et telle qu'elle est rangée. */
export interface Sauvegarde {
  slot: SaveSlot;
  setup: GameSetup;
  /** état **sérialisé** (`serializeState`) */
  state: string;
  commands: Command[];
}

function horodatage(): string {
  return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}

/** Construit le descripteur d'emplacement à partir de l'état courant. */
export function decrireEmplacement(
  state: GameState,
  options: { id: string; name: string; autosave: boolean; createdAt?: string },
): SaveSlot {
  return {
    id: options.id,
    name: options.name,
    turn: state.turn,
    week: weekOf(state.turn),
    players: state.turnOrder
      .map((id) => state.players[id])
      .filter((p): p is NonNullable<typeof p> => Boolean(p))
      .map((p) => ({ name: p.name, faction: p.faction, color: p.color })),
    updatedAt: horodatage(),
    createdAt: options.createdAt ?? horodatage(),
    autosave: options.autosave,
    hash: state.hash,
  };
}

/** Résumé lisible d'un emplacement : « Semaine 3, jour 5 ». */
export function resumeEmplacement(slot: SaveSlot): string {
  return `Semaine ${slot.week}, jour ${dayOf(slot.turn)}`;
}

/* ───────────────────────────── Niveau local ─────────────────────────────── */

/** Écrit la sauvegarde locale. N'échoue jamais bruyamment. */
export function ecrireLocal(save: Sauvegarde): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(CLEF_LOCALE, JSON.stringify(save));
    return true;
  } catch {
    /* Quota dépassé ou stockage refusé : la partie continue en mémoire. */
    return false;
  }
}

/** Relit la sauvegarde locale, ou `null` si elle est absente ou abîmée. */
export function lireLocal(): Sauvegarde | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const brut = localStorage.getItem(CLEF_LOCALE);
    if (!brut) return null;
    const parsed: unknown = JSON.parse(brut);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const candidat = parsed as Partial<Sauvegarde>;
    if (typeof candidat.state !== 'string' || !candidat.slot || !candidat.setup) return null;
    return {
      slot: candidat.slot,
      setup: candidat.setup,
      state: candidat.state,
      commands: Array.isArray(candidat.commands) ? candidat.commands : [],
    };
  } catch {
    return null;
  }
}

/** Efface la sauvegarde locale. */
export function effacerLocal(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(CLEF_LOCALE);
  } catch {
    /* Sans conséquence. */
  }
}

/** Vrai si une partie peut être reprise sans réseau. */
export function partieReprenable(): boolean {
  return lireLocal() !== null;
}

/** Relit et désérialise la partie locale, ou `null`. */
export function reprendreLocal(): { state: GameState; setup: GameSetup; slot: SaveSlot; commands: Command[] } | null {
  const save = lireLocal();
  if (!save) return null;
  try {
    return {
      state: deserializeState(save.state),
      setup: save.setup,
      slot: save.slot,
      commands: save.commands,
    };
  } catch {
    /* Sauvegarde corrompue : on ne propose pas une reprise qui échouerait. */
    return null;
  }
}

/* ──────────────────────────── Niveau serveur ────────────────────────────── */

export interface ReponseListe {
  emplacements: SaveSlot[];
  quota?: { resume?: string };
}

async function json<T>(reponse: Response): Promise<T> {
  const texte = await reponse.text();
  return texte ? (JSON.parse(texte) as T) : ({} as T);
}

/** Message français extrait d'une réponse d'erreur de l'API. */
async function messageErreur(reponse: Response): Promise<string> {
  try {
    const corps = await json<{ message?: string; erreur?: string }>(reponse);
    return corps.message ?? corps.erreur ?? `Le serveur a répondu ${reponse.status}.`;
  } catch {
    return `Le serveur a répondu ${reponse.status}.`;
  }
}

/** Liste les emplacements du joueur. Retourne `null` si le serveur est absent. */
export async function listerEmplacements(signal?: AbortSignal): Promise<SaveSlot[] | null> {
  try {
    const reponse = await fetch(API.saves, { signal, headers: { accept: 'application/json' } });
    if (!reponse.ok) return null;
    const corps = await json<ReponseListe>(reponse);
    return Array.isArray(corps.emplacements) ? corps.emplacements : [];
  } catch {
    /* Hors ligne ou serveur non déployé : le jeu reste jouable en local. */
    return null;
  }
}

/** Envoie une sauvegarde au serveur. Lève un message français en cas de refus. */
export async function envoyerEmplacement(save: Sauvegarde, signal?: AbortSignal): Promise<void> {
  const reponse = await fetch(API.save(save.slot.id), {
    method: 'PUT',
    signal,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(save),
  });
  if (!reponse.ok) throw new Error(await messageErreur(reponse));
}

/** Charge un emplacement distant. */
export async function chargerEmplacement(id: string): Promise<Sauvegarde> {
  const reponse = await fetch(API.save(id), { headers: { accept: 'application/json' } });
  if (!reponse.ok) throw new Error(await messageErreur(reponse));
  return json<Sauvegarde>(reponse);
}

/** Supprime un emplacement distant. */
export async function supprimerEmplacement(id: string): Promise<void> {
  const reponse = await fetch(API.save(id), { method: 'DELETE' });
  if (!reponse.ok && reponse.status !== 404) throw new Error(await messageErreur(reponse));
}

/* ─────────────────────── L'ordonnanceur d'écriture ──────────────────────── */

export type EtatEcriture = 'repos' | 'differe' | 'envoi' | 'enregistre' | 'erreur';

export interface AutosaveObserver {
  (etat: EtatEcriture, details: { at: number | null; message: string | null }): void;
}

/**
 * Ordonnanceur : écrit en local tout de suite, programme l'envoi serveur après
 * `DELAI_ENVOI_MS` de repos, et n'a jamais plus d'une requête en vol.
 */
export class Autosave {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private enAttente: Sauvegarde | null = null;
  private enVol = false;
  private dernier: number | null = null;
  private observateur: AutosaveObserver | null = null;
  /** coupe tout envoi : routes de démonstration, ou serveur déclaré absent */
  private silencieux = false;

  observer(observateur: AutosaveObserver | null): void {
    this.observateur = observateur;
  }

  /** Coupe (ou rétablit) les écritures. Les démos passent ici. */
  setSilencieux(valeur: boolean): void {
    this.silencieux = valeur;
    if (valeur) this.annuler();
  }

  private signaler(etat: EtatEcriture, message: string | null = null): void {
    this.observateur?.(etat, { at: this.dernier, message });
  }

  /** Une mutation vient d'avoir lieu. */
  planifier(save: Sauvegarde): void {
    if (this.silencieux) return;
    const local = ecrireLocal(save);
    if (local) {
      this.dernier = Date.now();
    }
    this.enAttente = save;
    this.signaler('differe');
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.vider();
    }, DELAI_ENVOI_MS);
  }

  /** Force l'envoi immédiat (fin de tour, fermeture d'onglet). */
  async vider(): Promise<void> {
    if (this.silencieux || this.enVol) return;
    const save = this.enAttente;
    if (!save) return;
    this.enAttente = null;
    this.enVol = true;
    this.signaler('envoi');
    try {
      await envoyerEmplacement(save);
      this.dernier = Date.now();
      this.signaler('enregistre');
    } catch (err) {
      const message = err instanceof Error ? err.message : "Le serveur n'a pas répondu.";
      /* La sauvegarde locale est bonne : l'indicateur reste rassurant. */
      this.signaler('erreur', `${message} La partie reste enregistrée sur cet appareil.`);
    } finally {
      this.enVol = false;
      if (this.enAttente) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = null;
          void this.vider();
        }, DELAI_ENVOI_MS);
      }
    }
  }

  annuler(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.enAttente = null;
  }
}

/** Sérialise l'état pour le transport. Isolé ici pour n'avoir qu'un point d'appel. */
export function serialiser(state: GameState): string {
  return serializeState(state);
}
