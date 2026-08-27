/**
 * Pont tolérant vers le moteur audio.
 *
 * `apps/client/src/audio` est écrit par un autre agent et peut ne pas encore
 * exister. Ce module code **contre la signature de docs/02-API.md** et protège
 * chaque appel : la page d'accueil doit rester parfaitement utilisable sans
 * une note de musique, et la compilation ne doit jamais dépendre d'un fichier
 * absent.
 *
 * Trois voies de résolution, dans l'ordre :
 *  1. un moteur injecté par la racine du client via `fournirMoteurAudio()` ;
 *  2. un moteur publié sur `globalThis.AuvergneAudio` ;
 *  3. un import dynamique de `../audio/index.js`, tenté une seule fois, avec
 *     spécificateur calculé pour que l'absence du module ne casse ni le
 *     typecheck ni la construction.
 */

export type BusAudio = 'musique' | 'effets' | 'ambiance';

export type CleEffet =
  | 'clic'
  | 'clic_lourd'
  | 'page'
  | 'piece'
  | 'construction'
  | 'recrutement'
  | 'pas_terre'
  | 'pas_pierre'
  | 'epee'
  | 'arc'
  | 'impact'
  | 'mort'
  | 'sort'
  | 'victoire'
  | 'defaite'
  | 'alerte'
  | 'borne'
  | 'niveau';

export type CleTheme =
  | 'accueil'
  | 'aventure'
  | 'cite_granit'
  | 'cite_ermitage'
  | 'combat'
  | 'victoire'
  | 'defaite';

/** Sous-ensemble de `AudioEngine` (docs/02-API.md) réellement utilisé ici. */
export interface MoteurAudio {
  init(): Promise<void>;
  setBus(bus: BusAudio, volume0to100: number): void;
  playTheme(theme: CleTheme): void;
  stopTheme(fadeMs?: number): void;
  sfx(key: CleEffet): void;
  ambience(key: 'foret' | 'riviere' | 'vent' | 'foire' | 'cloches' | 'aucune'): void;
  readonly ready: boolean;
}

interface FabriqueAudio {
  get(): MoteurAudio;
}

let injecte: MoteurAudio | null = null;
let resolu: MoteurAudio | null = null;
let tentative: Promise<MoteurAudio | null> | null = null;

/** Permet à la racine du client d'injecter le moteur sans import circulaire. */
export function fournirMoteurAudio(moteur: MoteurAudio | null): void {
  injecte = moteur;
  if (moteur) resolu = moteur;
}

function depuisGlobal(): MoteurAudio | null {
  const global = globalThis as { AuvergneAudio?: unknown };
  const candidat = global.AuvergneAudio;
  if (candidat && typeof (candidat as MoteurAudio).sfx === 'function') return candidat as MoteurAudio;
  if (candidat && typeof (candidat as FabriqueAudio).get === 'function') {
    try {
      return (candidat as FabriqueAudio).get();
    } catch {
      return null;
    }
  }
  return null;
}

/** Résout le moteur audio si l'un des trois canaux le fournit. */
export async function moteurAudio(): Promise<MoteurAudio | null> {
  if (injecte) return injecte;
  if (resolu) return resolu;
  if (tentative) return tentative;
  tentative = (async (): Promise<MoteurAudio | null> => {
    const direct = depuisGlobal();
    if (direct) {
      resolu = direct;
      return direct;
    }
    try {
      /* Spécificateur calculé : le bundler ne tente pas de le résoudre. */
      const chemin = ['..', 'audio', 'index.js'].join('/');
      const mod = (await import(/* @vite-ignore */ chemin)) as { AudioEngine?: FabriqueAudio };
      const fabrique = mod.AudioEngine;
      if (fabrique && typeof fabrique.get === 'function') {
        resolu = fabrique.get();
        return resolu;
      }
    } catch {
      /* Le module audio n'est pas encore livré : la page reste silencieuse. */
    }
    return null;
  })();
  return tentative;
}

/**
 * Réveille le moteur au premier geste de jeu. À appeler depuis un gestionnaire
 * d'appui : les navigateurs n'ouvrent le contexte audio qu'après un geste, et
 * un joueur qui recharge en pleine partie n'est jamais passé par l'accueil.
 * Idempotent — `init()` reprend aussi un contexte suspendu.
 */
export function eveillerAudio(): void {
  void moteurAudio().then(async (moteur) => {
    try {
      await moteur?.init();
    } catch {
      /* Contexte refusé : silence, sans conséquence. */
    }
  });
}

/** Joue un effet ; ne lève jamais, n'attend jamais. */
export function jouerEffet(key: CleEffet): void {
  void moteurAudio().then((moteur) => {
    try {
      moteur?.sfx(key);
    } catch {
      /* Un effet muet ne doit jamais interrompre une interaction. */
    }
  });
}

/** Démarre un thème après un geste utilisateur (exigence des navigateurs). */
export function demarrerTheme(theme: CleTheme): void {
  void moteurAudio().then(async (moteur) => {
    if (!moteur) return;
    try {
      if (!moteur.ready) await moteur.init();
      moteur.playTheme(theme);
    } catch {
      /* Contexte audio refusé : silence, sans message d'erreur au joueur. */
    }
  });
}

/** Reporte les volumes des trois bus. */
export function appliquerVolumes(volumes: { musique: number; effets: number; ambiance: number }): void {
  void moteurAudio().then((moteur) => {
    if (!moteur) return;
    try {
      moteur.setBus('musique', volumes.musique);
      moteur.setBus('effets', volumes.effets);
      moteur.setBus('ambiance', volumes.ambiance);
    } catch {
      /* Le moteur n'accepte pas encore de réglage : sans conséquence. */
    }
  });
}

/** Ambiance de fond ; `aucune` coupe la nappe. */
export function reglerAmbiance(
  key: 'foret' | 'riviere' | 'vent' | 'foire' | 'cloches' | 'aucune',
): void {
  void moteurAudio().then((moteur) => {
    try {
      moteur?.ambience(key);
    } catch {
      /* Sans conséquence. */
    }
  });
}
