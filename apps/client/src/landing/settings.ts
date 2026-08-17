/**
 * Réglages du joueur — modèle, persistance et application.
 *
 * Les réglages sont volontairement **hors du moteur** : ils ne touchent ni
 * l'état de partie, ni le hachage, ni la reproductibilité. Ils vivent dans
 * `localStorage` et s'appliquent en posant des variables CSS et des attributs
 * de données sur `<html>`, ce que la feuille de style et la scène lisent.
 */

import type { SceneQuality } from './scene.js';

export interface GameSettings {
  /** volumes par bus, de 0 à 100 */
  musique: number;
  effets: number;
  ambiance: number;
  qualite: SceneQuality;
  /** échelle du texte, de 85 à 140 (pour cent) */
  echelleTexte: number;
  contrasteRenforce: boolean;
  animationsReduites: boolean;
  /** motifs de bannière en plus de la couleur (accessibilité) */
  motifsAccessibles: boolean;
  /** la seule langue livrée ; le champ existe pour ne pas mentir au joueur */
  langue: 'fr';
}

export const DEFAULT_SETTINGS: GameSettings = {
  musique: 62,
  effets: 78,
  ambiance: 54,
  qualite: 'haute',
  echelleTexte: 100,
  contrasteRenforce: false,
  animationsReduites: false,
  motifsAccessibles: true,
  langue: 'fr',
};

const STORAGE_KEY = 'auvergne.reglages.v1';

function clampInt(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = typeof value === 'number' ? Math.round(value) : Number.NaN;
  if (!Number.isFinite(n)) return fallback;
  return n < lo ? lo : n > hi ? hi : n;
}

function asQuality(value: unknown): SceneQuality {
  return value === 'basse' || value === 'moyenne' || value === 'haute' ? value : DEFAULT_SETTINGS.qualite;
}

/** Lit les réglages enregistrés, en tolérant un stockage absent ou abîmé. */
export function loadSettings(): GameSettings {
  if (typeof localStorage === 'undefined') return { ...DEFAULT_SETTINGS };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_SETTINGS };
    const o = parsed as Partial<Record<keyof GameSettings, unknown>>;
    return {
      musique: clampInt(o.musique, 0, 100, DEFAULT_SETTINGS.musique),
      effets: clampInt(o.effets, 0, 100, DEFAULT_SETTINGS.effets),
      ambiance: clampInt(o.ambiance, 0, 100, DEFAULT_SETTINGS.ambiance),
      qualite: asQuality(o.qualite),
      echelleTexte: clampInt(o.echelleTexte, 85, 140, DEFAULT_SETTINGS.echelleTexte),
      contrasteRenforce: o.contrasteRenforce === true,
      animationsReduites: o.animationsReduites === true,
      motifsAccessibles: o.motifsAccessibles !== false,
      langue: 'fr',
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Enregistre les réglages ; l'échec d'écriture n'interrompt jamais le jeu. */
export function saveSettings(settings: GameSettings): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* Stockage plein ou refusé : le jeu continue avec les réglages en mémoire. */
  }
}

/** Vrai si le système demande la réduction des animations. */
export function systemPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Le mouvement est coupé si le système **ou** le joueur le demande. */
export function motionDisabled(settings: GameSettings): boolean {
  return settings.animationsReduites || systemPrefersReducedMotion();
}

/**
 * Applique les réglages au document : échelle de texte, contraste renforcé,
 * motifs d'accessibilité, réduction des animations.
 */
export function applySettings(settings: GameSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--acc-echelle-texte', String(settings.echelleTexte / 100));
  root.dataset.contraste = settings.contrasteRenforce ? 'renforce' : 'normal';
  root.dataset.motifs = settings.motifsAccessibles ? 'oui' : 'non';
  root.dataset.animations = motionDisabled(settings) ? 'reduites' : 'completes';
  root.lang = 'fr';
}
