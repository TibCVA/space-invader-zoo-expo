/**
 * LE MOUVEMENT EST UN CHOIX DU JOUEUR, PAS UNE PRISON.
 *
 * **Le défaut.** `motionDisabled` valait `réglage du joueur OU préférence du
 * système`. Un joueur dont l'appareil demande moins de mouvement — la case
 * « Réduire les animations » d'iOS, très répandue, et son équivalent Windows —
 * n'avait AUCUNE animation dans le jeu : ni marche des héros, ni marche des
 * piles au combat, ni parallaxe. La bascule des options ne pouvait qu'ajouter
 * de la réduction, jamais en retirer, et l'écran l'annonçait sans le
 * corriger : « Imposé par les réglages du système ».
 *
 * **Pourquoi cela comptait ici.** Le propriétaire venait de demander que les
 * déplacements de combat soient LENTS. Un cousin avec « Réduire les
 * animations » sur son iPhone n'en aurait rien vu, quelle que soit la cadence
 * réglée : la file d'animation est vidée d'un bloc en mouvement réduit. Le
 * correctif de cadence était invisible pour lui.
 *
 * Un réglage d'accessibilité doit être un DÉFAUT, pas une prison. « auto »
 * suit l'appareil et reste la valeur de départ ; un choix explicite du joueur
 * l'emporte, dans les deux sens.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, motionDisabled } from './settings.js';
import type { GameSettings } from './settings.js';

/** Fait dire à l'appareil qu'il veut, ou non, moins de mouvement. */
function appareilDemandeMoins(oui: boolean): void {
  vi.stubGlobal('window', {
    matchMedia: (requete: string) => ({
      matches: oui && requete.includes('prefers-reduced-motion'),
    }),
  });
}

/** Un stockage local en mémoire, pour éprouver la reprise des réglages. */
function stockage(contenu: string | null): void {
  vi.stubGlobal('localStorage', {
    getItem: () => contenu,
    setItem: () => undefined,
  });
}

const reglages = (partiel: Partial<GameSettings>): GameSettings => ({
  ...DEFAULT_SETTINGS,
  ...partiel,
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('le mouvement', () => {
  it('« auto » suit l’appareil, dans les deux sens', () => {
    appareilDemandeMoins(true);
    expect(motionDisabled(reglages({ animations: 'auto' }))).toBe(true);
    appareilDemandeMoins(false);
    expect(motionDisabled(reglages({ animations: 'auto' }))).toBe(false);
  });

  it('« complètes » PASSE OUTRE l’appareil — c’est tout l’objet du correctif', () => {
    /* L'ancien OU rendait ce cas impossible : le joueur ne pouvait pas
       rallumer les animations que son système avait éteintes. */
    appareilDemandeMoins(true);
    expect(motionDisabled(reglages({ animations: 'completes' }))).toBe(false);
  });

  it('« réduites » coupe tout, même quand l’appareil ne demande rien', () => {
    appareilDemandeMoins(false);
    expect(motionDisabled(reglages({ animations: 'reduites' }))).toBe(true);
  });

  it('par défaut, on écoute l’appareil : l’accessibilité reste le défaut', () => {
    expect(DEFAULT_SETTINGS.animations).toBe('auto');
  });

  it('sans navigateur, le mouvement n’est pas coupé', () => {
    /* `systemPrefersReducedMotion` rend faux sans `window` : le rendu hors
       navigateur ne doit pas se retrouver figé par accident. */
    vi.stubGlobal('window', undefined);
    expect(motionDisabled(reglages({ animations: 'auto' }))).toBe(false);
  });

  it('un joueur qui avait demandé la réduction la garde', () => {
    /* Reprise du stockage d'avant les trois états. Perdre le réglage d'un
       joueur au premier rechargement serait une régression silencieuse. */
    appareilDemandeMoins(false);
    stockage(JSON.stringify({ animationsReduites: true }));
    const lus = loadSettings();
    expect(lus.animations).toBe('reduites');
    expect(motionDisabled(lus)).toBe(true);
  });

  it('un joueur qui n’avait rien demandé retombe sur « auto »', () => {
    stockage(JSON.stringify({ animationsReduites: false, echelleTexte: 120 }));
    const lus = loadSettings();
    expect(lus.animations).toBe('auto');
    /* Et le reste de ses réglages survit à la migration. */
    expect(lus.echelleTexte).toBe(120);
  });

  it('un réglage déjà à trois états est relu tel quel', () => {
    for (const choix of ['auto', 'completes', 'reduites'] as const) {
      stockage(JSON.stringify({ animations: choix }));
      expect(loadSettings().animations).toBe(choix);
    }
  });

  it('un stockage abîmé ne fige pas le jeu', () => {
    for (const brut of ['{', 'null', '"non"', JSON.stringify({ animations: 'oui' })]) {
      stockage(brut);
      expect(loadSettings().animations).toBe('auto');
    }
  });
});
