/**
 * `apps/client/src/landing` — la page d'accueil.
 *
 * `LandingPage` respecte exactement le contrat de docs/02-API.md :
 *
 * ```tsx
 * export function LandingPage(props: {
 *   onNewGame(): void; onContinue(): void; onLoad(): void;
 *   onCodex(): void; onOptions(): void; hasSave: boolean;
 * }): JSX.Element;
 * ```
 *
 * Les propriétés supplémentaires sont toutes facultatives : un hôte qui ne
 * fournit que les six champs imposés obtient une page complète et correcte.
 *
 * Ce baril exporte aussi les trois écrans que la page appelle — assistant de
 * nouvelle partie, codex, options — pour que le routeur de
 * `apps/client/src/main.tsx` les monte sur `#/nouvelle-partie`, `#/codex` et
 * `#/options` (docs/03-ROUTES.md), ainsi que `LandingShell`, qui les enchaîne
 * lui-même si le routeur préfère déléguer.
 *
 * Aucun asset externe : les trois familles typographiques viennent de
 * `@fontsource`, tout le décor est peint en canvas 2D ou composé en CSS, et
 * chaque icône est un tracé SVG de `@auvergne/ui`.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import type { GameSetup } from '@auvergne/engine';
import { installTextures } from '@auvergne/ui';

import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
/* L'alias Vite `@auvergne/ui` pointe sur `packages/ui/src/index.ts` : il est
   appliqué par préfixe, si bien que `@auvergne/ui/styles.css` se résolvait en
   `…/src/index.ts/styles.css` et cassait la construction. Chemin relatif. */
import '../../../../packages/ui/src/styles.css';
import './landing.css';

import { LandingTitle } from './title.js';
import { LandingFooter, LandingMenu, type MenuEntry } from './menu.js';
import { NewGamePage } from './new-game.js';
import { CodexPage } from './codex.js';
import { OptionsPage } from './options.js';
import { mountLandingScene, type LandingSceneHandle } from './scene.js';
import { useFondPeint } from './backdrop.js';
import {
  applySettings,
  loadSettings,
  motionDisabled,
  saveSettings,
  type GameSettings,
} from './settings.js';
import { appliquerVolumes, demarrerTheme } from './audio-bridge.js';

/* ─────────────────────────── Réglages du joueur ─────────────────────────── */

/**
 * Charge les réglages, les applique au document et les rend modifiables.
 * À utiliser une fois par application ; les écrans reçoivent l'état en
 * propriété plutôt que d'appeler ce crochet chacun de leur côté.
 */
export function useSettings(): [GameSettings, (next: GameSettings) => void] {
  const [settings, setSettings] = useState<GameSettings>(() => loadSettings());

  useEffect(() => {
    applySettings(settings);
    appliquerVolumes({
      musique: settings.musique,
      effets: settings.effets,
      ambiance: settings.ambiance,
    });
    /* Volontairement au montage seulement : les écrans appliquent eux-mêmes
       chaque changement, sans repasser par cet effet. */
  }, []);

  const update = useCallback((next: GameSettings): void => {
    setSettings(next);
    applySettings(next);
    saveSettings(next);
  }, []);

  return [settings, update];
}

/* ──────────────────────────── Décor de fond ─────────────────────────────── */

export interface LandingBackdropProps {
  settings?: GameSettings;
}

/**
 * Le décor animé, monté une seule fois et conservé d'un écran à l'autre.
 * Le canvas est purement décoratif : il est retiré de l'arbre d'accessibilité
 * et ne reçoit aucun événement de pointeur.
 */
export function LandingBackdrop({ settings }: LandingBackdropProps): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sceneRef = useRef<LandingSceneHandle | null>(null);
  const quality = settings?.qualite;
  const reduced = settings ? motionDisabled(settings) : false;
  const peint = useFondPeint();

  useEffect(() => {
    /* Fond peint disponible : la scène procédurale ne sert plus à rien et
       coûterait du temps machine pour être recouverte. */
    if (peint) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let handle: LandingSceneHandle | null = null;
    /* La construction des plans coûte quelques centaines de millisecondes :
       on la repousse après la première peinture pour que le titre et le menu
       apparaissent immédiatement. */
    const id = window.requestAnimationFrame(() => {
      try {
        handle = mountLandingScene(canvas, {
          quality: quality,
          reducedMotion: reduced,
          seed: 20250816,
        });
        sceneRef.current = handle;
      } catch {
        /* Canvas indisponible : le dégradé de repli de la feuille de style
           tient lieu de décor, et la page reste entièrement jouable. */
      }
    });
    return () => {
      window.cancelAnimationFrame(id);
      handle?.destroy();
      sceneRef.current = null;
    };
    /* Monté une seule fois : la qualité et le mouvement sont pilotés ensuite
       par les deux effets ci-dessous, sans reconstruire la scène. Seule
       l'arrivée du fond peint peut la démonter. */
  }, [peint]);

  useEffect(() => {
    if (quality) sceneRef.current?.setQuality(quality);
  }, [quality]);

  useEffect(() => {
    sceneRef.current?.setReducedMotion(reduced);
  }, [reduced]);

  return (
    <div className="hmm-acc-fond" aria-hidden="true">
      {peint ? (
        <>
          <img
            src={peint.paysage}
            alt=""
            className="hmm-acc-fond-peint hmm-acc-fond-peint--paysage"
            decoding="async"
            fetchPriority="high"
          />
          <img
            src={peint.portrait}
            alt=""
            className="hmm-acc-fond-peint hmm-acc-fond-peint--portrait"
            decoding="async"
            fetchPriority="high"
          />
        </>
      ) : (
        <canvas ref={canvasRef} className="hmm-acc-fond-toile" />
      )}
      <div className="hmm-acc-fond-voile" />
    </div>
  );
}

/* ────────────────────────────── Page d'accueil ──────────────────────────── */

export interface LandingPageProps {
  onNewGame(): void;
  onContinue(): void;
  onLoad(): void;
  onCodex(): void;
  onOptions(): void;
  hasSave: boolean;
  /** Réglages courants ; à défaut, ceux enregistrés sont relus. */
  settings?: GameSettings;
  /** Numéro de version affiché sous le titre. */
  version?: string;
  /** Résumé de la partie reprenable, affiché sur un signet de parchemin. */
  saveSummary?: { name: string; turn: number; week: number };
  /** Monter le décor animé. Mettre à `false` si l'hôte le monte lui-même. */
  backdrop?: boolean;
  /**
   * Entrées ajoutées au menu après Options — c'est par là que passe « Jouer
   * avec mes cousins » (`docs/04-MULTIJOUEUR.md`).
   */
  menuExtra?: MenuEntry[];
  /** Contenu libre glissé sous le menu (bandeau réseau, avertissement…). */
  children?: ReactNode;
}

/** La page d'accueil : décor, titre, menu, pied de page. */
export function LandingPage(props: LandingPageProps): ReactElement {
  const {
    onNewGame,
    onContinue,
    onLoad,
    onCodex,
    onOptions,
    hasSave,
    settings,
    version,
    saveSummary,
    backdrop = true,
    menuExtra,
    children,
  } = props;

  useEffect(() => {
    installTextures();
  }, []);

  /* Le thème d'accueil ne peut démarrer qu'après un geste : les navigateurs
     refusent tout contexte audio créé sans interaction. */
  useEffect(() => {
    const demarrer = (): void => {
      demarrerTheme('accueil');
      window.removeEventListener('pointerdown', demarrer);
      window.removeEventListener('keydown', demarrer);
    };
    window.addEventListener('pointerdown', demarrer, { once: true });
    window.addEventListener('keydown', demarrer, { once: true });
    return () => {
      window.removeEventListener('pointerdown', demarrer);
      window.removeEventListener('keydown', demarrer);
    };
  }, []);

  return (
    <div className="hmm-acc">
      {backdrop ? <LandingBackdrop settings={settings} /> : null}
      <main className="hmm-acc-scene" id="contenu">
        <div className="hmm-acc-colonne">
          <LandingTitle version={version} />
          <LandingMenu
            hasSave={hasSave}
            onNewGame={onNewGame}
            onContinue={onContinue}
            onLoad={onLoad}
            onCodex={onCodex}
            onOptions={onOptions}
            extra={menuExtra}
          />
          {hasSave && saveSummary ? (
            <p className="hmm-acc-signet">
              <span className="hmm-acc-signet-nom">{saveSummary.name}</span>
              <span className="hmm-acc-signet-detail">
                Semaine <span className="hmm-acc-tabulaire">{saveSummary.week}</span>, jour{' '}
                <span className="hmm-acc-tabulaire">{((saveSummary.turn - 1) % 7) + 1}</span>
              </span>
            </p>
          ) : null}
          {children}
        </div>
        <LandingFooter />
      </main>
    </div>
  );
}

/* ──────────────────────────── Enchaînement local ────────────────────────── */

export type LandingScreen = 'accueil' | 'nouvelle-partie' | 'codex' | 'options';

export interface LandingShellProps {
  /** Écran affiché ; laissez vide pour laisser la coquille le gérer. */
  screen?: LandingScreen;
  onScreenChange?(screen: LandingScreen): void;
  hasSave: boolean;
  onContinue(): void;
  onLoad(): void;
  onStartGame(setup: GameSetup): void;
  version?: string;
  saveSummary?: { name: string; turn: number; week: number };
}

/**
 * Coquille facultative : elle garde le décor monté, tient les réglages et
 * enchaîne accueil → assistant / codex / options sans démonter la scène.
 * Un routeur par fragment d'URL peut piloter `screen` de l'extérieur.
 */
export function LandingShell(props: LandingShellProps): ReactElement {
  const { screen, onScreenChange, hasSave, onContinue, onLoad, onStartGame, version, saveSummary } = props;
  const [interne, setInterne] = useState<LandingScreen>('accueil');
  const courant = screen ?? interne;
  const [settings, setSettings] = useSettings();

  const aller = useCallback(
    (next: LandingScreen): void => {
      setInterne(next);
      onScreenChange?.(next);
    },
    [onScreenChange],
  );

  return (
    <div className="hmm-acc">
      <LandingBackdrop settings={settings} />
      {courant === 'accueil' ? (
        <LandingPage
          backdrop={false}
          hasSave={hasSave}
          settings={settings}
          version={version}
          saveSummary={saveSummary}
          onNewGame={(): void => aller('nouvelle-partie')}
          onContinue={onContinue}
          onLoad={onLoad}
          onCodex={(): void => aller('codex')}
          onOptions={(): void => aller('options')}
        />
      ) : null}
      {courant === 'nouvelle-partie' ? (
        <NewGamePage onStart={onStartGame} onBack={(): void => aller('accueil')} />
      ) : null}
      {courant === 'codex' ? <CodexPage onBack={(): void => aller('accueil')} /> : null}
      {courant === 'options' ? (
        <OptionsPage settings={settings} onChange={setSettings} onBack={(): void => aller('accueil')} />
      ) : null}
    </div>
  );
}

/* ───────────────────────────────── Baril ────────────────────────────────── */

export { LandingTitle } from './title.js';
export { LandingMenu, LandingFooter } from './menu.js';
export { NewGamePage } from './new-game.js';
export { CodexPage } from './codex.js';
export { OptionsPage } from './options.js';
export { mountLandingScene } from './scene.js';
export type { LandingSceneHandle, LandingSceneOptions, SceneQuality } from './scene.js';
export {
  DEFAULT_SETTINGS,
  applySettings,
  loadSettings,
  motionDisabled,
  saveSettings,
  systemPrefersReducedMotion,
} from './settings.js';
export type { GameSettings } from './settings.js';
export { fournirMoteurAudio } from './audio-bridge.js';
export type { MoteurAudio } from './audio-bridge.js';
export { renderForezMinimap } from './minimap.js';
export type { LandingTitleProps } from './title.js';
export type { LandingMenuProps, MenuEntry } from './menu.js';
export type { NewGamePageProps } from './new-game.js';
export type { CodexPageProps } from './codex.js';
export type { OptionsPageProps } from './options.js';
