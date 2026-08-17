/**
 * Moteur audio — façade publique.
 *
 * Contrat imposé par `docs/02-API.md`. Tout est synthétisé en WebAudio :
 * aucun fichier son, aucun échantillon, aucune dépendance.
 *
 * Trois garanties tenues par cette classe :
 *  1. **Aucune exception ne remonte à l'appelant.** Si WebAudio est absent,
 *     refusé ou en panne, le moteur bascule en mode silencieux et toutes les
 *     méthodes deviennent des sans-effet. L'interface n'a jamais à s'en soucier.
 *  2. **L'`AudioContext` naît d'un geste utilisateur.** Rien n'est créé à
 *     l'import du module ; `init()` doit être appelé depuis un clic ou une
 *     touche. Les consignes reçues avant `init()` sont mémorisées et appliquées
 *     ensuite.
 *  3. **Tout se tait proprement en arrière-plan.** Passage d'onglet, mise en
 *     veille, perte de focus : la sortie descend en fondu, la planification
 *     s'arrête, et tout reprend au retour.
 */

import {
  BUS_NAMES,
  DEFAULT_VOLUMES,
  STORAGE_KEY,
  createAudioGraph,
  isAudioSupported,
  loadVolumes,
  saveVolumes,
  type AudioGraph,
  type BusName,
  type BusVolumes,
} from './context.js';
import { AmbienceController, type AmbienceKey } from './ambience.js';
import { Composer } from './composer.js';
import { SfxPlayer, type SfxKey } from './sfx.js';
import type { Intensity, ThemeKey } from './themes.js';
import type { RegionId } from '@auvergne/engine';

export type { SfxKey } from './sfx.js';
export type { AmbienceKey } from './ambience.js';
export type { BusName, BusVolumes } from './context.js';
export type { Intensity, ThemeKey, ThemeDef, RegionColour } from './themes.js';
export { THEMES, THEME_KEYS, REGION_COLOURS } from './themes.js';
export { SFX_KEYS, SFX_LABELS } from './sfx.js';
export { AMBIENCE_KEYS, AMBIENCE_LABELS } from './ambience.js';
export { STORAGE_KEY, DEFAULT_VOLUMES } from './context.js';
export {
  MODES,
  MODE_LABELS,
  CADENCES,
  RHYTHMS,
  generateMelody,
  scale,
  chord,
  progression,
} from './theory.js';
export { INSTRUMENT_NAMES, INSTRUMENT_LABELS } from './instruments.js';

interface PendingState {
  theme: { key: ThemeKey; region?: RegionId } | null;
  ambience: AmbienceKey | null;
  intensity: Intensity;
}

/**
 * Moteur audio du jeu. Instance unique, obtenue par `AudioEngine.get()`.
 */
export class AudioEngine {
  private static instance: AudioEngine | null = null;

  private graph: AudioGraph | null = null;
  private composer: Composer | null = null;
  private sfxPlayer: SfxPlayer | null = null;
  private ambienceController: AmbienceController | null = null;

  private volumes: BusVolumes = loadVolumes();
  private initPromise: Promise<void> | null = null;
  private silent = false;
  private hidden = false;
  private listenersBound = false;

  private readonly pending: PendingState = {
    theme: null,
    ambience: null,
    intensity: 'calme',
  };

  private readonly onVisibility = (): void => {
    try {
      if (typeof document === 'undefined') return;
      const nowHidden = document.visibilityState === 'hidden';
      if (nowHidden === this.hidden) return;
      this.hidden = nowHidden;
      if (nowHidden) this.goBackground();
      else this.goForeground();
    } catch {
      /* rien ne doit remonter */
    }
  };

  private readonly onBlur = (): void => {
    // Certains navigateurs mobiles ne signalent pas la visibilité : le flou de
    // la fenêtre sert de second filet.
    if (this.hidden) return;
    this.graph?.resume().catch(() => undefined);
  };

  private constructor() {
    /* usage exclusif par get() */
  }

  /** Instance unique. */
  static get(): AudioEngine {
    if (!AudioEngine.instance) AudioEngine.instance = new AudioEngine();
    return AudioEngine.instance;
  }

  /** Vrai quand le son est réellement disponible et actif. */
  get ready(): boolean {
    return this.graph !== null && !this.silent;
  }

  /** Vrai si WebAudio est indisponible : le moteur se tait sans se plaindre. */
  get silentMode(): boolean {
    return this.silent;
  }

  /** Volumes courants des trois bus, 0–100. */
  getVolumes(): BusVolumes {
    return { ...this.volumes };
  }

  /**
   * Crée l'`AudioContext` et démarre le moteur.
   * **Doit être appelé depuis un geste utilisateur.** Idempotent, et sûr à
   * rappeler : si le contexte a été suspendu par le navigateur, il reprend.
   */
  async init(): Promise<void> {
    if (this.graph) {
      await this.graph.resume();
      return;
    }
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      if (!isAudioSupported()) {
        this.silent = true;
        return;
      }
      let graph: AudioGraph | null = null;
      try {
        graph = await createAudioGraph(this.volumes);
      } catch {
        graph = null;
      }
      if (!graph) {
        this.silent = true;
        return;
      }
      this.graph = graph;
      this.silent = false;
      this.composer = new Composer(graph);
      this.sfxPlayer = new SfxPlayer(graph);
      this.ambienceController = new AmbienceController(graph);
      this.bindListeners();

      // Consignes reçues avant l'initialisation.
      this.composer.setIntensity(this.pending.intensity);
      if (this.pending.theme) {
        this.composer.play(this.pending.theme.key, this.pending.theme.region, 1800);
      }
      if (this.pending.ambience && this.pending.ambience !== 'aucune') {
        this.ambienceController.set(this.pending.ambience, 3000);
      }
    })();

    try {
      await this.initPromise;
    } catch {
      this.silent = true;
    } finally {
      this.initPromise = null;
    }
  }

  /** Règle le volume d'un bus, 0–100. Mémorisé sous `auvergne.audio`. */
  setBus(bus: BusName, volume0to100: number): void {
    if (!BUS_NAMES.includes(bus)) return;
    const value = Math.min(100, Math.max(0, Math.round(volume0to100)));
    this.volumes = { ...this.volumes, [bus]: value };
    if (this.graph) this.graph.setBusVolume(bus, value);
    else saveVolumes(this.volumes);
  }

  /** Lance un thème, éventuellement coloré par une région. */
  playTheme(theme: ThemeKey, region?: RegionId): void {
    this.pending.theme = region === undefined ? { key: theme } : { key: theme, region };
    if (!this.composer) return;
    try {
      this.composer.play(theme, region);
    } catch {
      /* rien ne doit remonter */
    }
  }

  /** Éteint la musique en fondu. */
  stopTheme(fadeMs = 1600): void {
    this.pending.theme = null;
    if (!this.composer) return;
    try {
      this.composer.stop(fadeMs);
    } catch {
      /* rien ne doit remonter */
    }
  }

  /** Joue un effet. Coût négligeable, jusqu'à douze effets simultanés. */
  sfx(key: SfxKey): void {
    if (!this.sfxPlayer || this.hidden) return;
    try {
      this.sfxPlayer.play(key);
    } catch {
      /* rien ne doit remonter */
    }
  }

  /** Change la nappe d'ambiance. `'aucune'` la coupe. */
  ambience(key: AmbienceKey): void {
    this.pending.ambience = key;
    if (!this.ambienceController) return;
    try {
      this.ambienceController.set(key);
    } catch {
      /* rien ne doit remonter */
    }
  }

  /**
   * Palier d'intensité de la musique : `calme` hors danger, `tension` quand une
   * armée ennemie approche ou qu'un compte à rebours court, `combat` pendant
   * une bataille. Le passage prend plusieurs secondes.
   */
  setIntensity(intensity: Intensity): void {
    this.pending.intensity = intensity;
    if (!this.composer) return;
    try {
      this.composer.setIntensity(intensity);
    } catch {
      /* rien ne doit remonter */
    }
  }

  /** Change la couleur régionale sans changer de thème. */
  setRegion(region: RegionId | undefined): void {
    if (this.pending.theme) {
      this.pending.theme =
        region === undefined
          ? { key: this.pending.theme.key }
          : { key: this.pending.theme.key, region };
    }
    if (!this.composer) return;
    try {
      this.composer.setRegion(region);
    } catch {
      /* rien ne doit remonter */
    }
  }

  /** Thème en cours, ou `null`. */
  get theme(): ThemeKey | null {
    return this.composer?.current ?? null;
  }

  /** Nappe d'ambiance en cours. */
  get ambienceKey(): AmbienceKey {
    return this.ambienceController?.key ?? 'aucune';
  }

  /**
   * Ferme le moteur et libère le contexte. Utile aux tests et aux pages de
   * démonstration ; le jeu n'en a pas besoin.
   */
  async dispose(): Promise<void> {
    this.unbindListeners();
    try {
      this.composer?.dispose();
      this.ambienceController?.dispose();
    } catch {
      /* rien ne doit remonter */
    }
    this.composer = null;
    this.sfxPlayer = null;
    this.ambienceController = null;
    const graph = this.graph;
    this.graph = null;
    if (graph) await graph.close();
  }

  /* ---------------------------------------------------------------- */

  private goBackground(): void {
    try {
      this.graph?.mute(260);
      this.composer?.suspend();
      this.ambienceController?.suspend();
      // Le contexte est suspendu après le fondu : rien ne claque.
      setTimeout(() => {
        if (this.hidden) this.graph?.suspend().catch(() => undefined);
      }, 320);
    } catch {
      /* rien ne doit remonter */
    }
  }

  private goForeground(): void {
    try {
      const graph = this.graph;
      if (!graph) return;
      void graph.resume().then(() => {
        if (this.hidden) return;
        graph.unmute(420);
        this.composer?.resume();
        this.ambienceController?.resume();
      });
    } catch {
      /* rien ne doit remonter */
    }
  }

  private bindListeners(): void {
    if (this.listenersBound) return;
    try {
      if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
        document.addEventListener('visibilitychange', this.onVisibility);
        this.hidden = document.visibilityState === 'hidden';
      }
      if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
        window.addEventListener('focus', this.onBlur);
      }
      this.listenersBound = true;
    } catch {
      /* environnement sans DOM : rien à faire */
    }
  }

  private unbindListeners(): void {
    if (!this.listenersBound) return;
    try {
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', this.onVisibility);
      }
      if (typeof window !== 'undefined') {
        window.removeEventListener('focus', this.onBlur);
      }
    } catch {
      /* rien à faire */
    }
    this.listenersBound = false;
  }
}

/** Raccourci pratique pour les vues : `audio().sfx('clic')`. */
export function audio(): AudioEngine {
  return AudioEngine.get();
}

/** Volumes mémorisés, lisibles avant toute initialisation (écran d'options). */
export function storedVolumes(): BusVolumes {
  return loadVolumes();
}

export { DEFAULT_VOLUMES as VOLUMES_PAR_DEFAUT, STORAGE_KEY as CLEF_STOCKAGE_AUDIO };
