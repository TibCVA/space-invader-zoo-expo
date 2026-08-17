/**
 * Amorçage du client.
 *
 * Quatre choses, dans cet ordre, et une seule fois par session :
 *
 *  1. **Les polices et les feuilles de style.** Trois familles installées par
 *     npm (`@fontsource/*`), jamais par CDN — non négociable n°5. La feuille du
 *     design system est chargée ici pour que *toutes* les routes en profitent,
 *     pas seulement celles qui passent par la page d'accueil.
 *  2. **`bootstrapEngine()`.** Le moteur est pur et reçoit contenu et carte par
 *     injection ; sans cet appel il tourne sur ses implémentations de repli,
 *     qui ne sont pas le contenu du jeu (docs/02-API.md).
 *  3. **L'`Application` PixiJS partagée.** Une seule pour tout le client :
 *     WebGPU si le navigateur le sait, sinon WebGL, sinon canvas. Résolution
 *     bornée à 2 (au-delà, un téléphone à 3× peint quatre fois trop de pixels
 *     pour rien), antialiasing actif, fond transparent — le parchemin de
 *     l'interface reste visible derrière la scène.
 *  4. **L'atlas d'art**, construit à la demande : les écrans de données
 *     (accueil, codex, fiche de héros, royaume) s'affichent sans l'attendre.
 *
 * Aucun de ces quatre points ne doit pouvoir produire un écran noir : chaque
 * échec remonte un message français exploitable.
 */

/* — 1. Polices et styles. Ordre : polices, design system, styles de l'application. — */
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/eb-garamond/500-italic.css';
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
/* L'alias Vite `@auvergne/ui` désigne `packages/ui/src/index.ts` et s'applique
   par préfixe : `@auvergne/ui/styles.css` ne se résout pas. Chemin relatif. */
import '../../../packages/ui/src/styles.css';
import './styles.css';

import { Application } from 'pixi.js';
import { bootstrapEngine } from '@auvergne/game';
import { installTextures } from '@auvergne/ui';
import { buildArtAtlas } from './art/index.js';
import type { ArtAtlas } from './art/index.js';

/* ─────────────────────────────── Erreurs ────────────────────────────────── */

/** Panne d'amorçage, avec un message affichable tel quel. */
export class ErreurAmorcage extends Error {
  constructor(
    message: string,
    /** conseil pratique donné au joueur, en français */
    readonly conseil: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'ErreurAmorcage';
  }
}

/* ─────────────────────────── Étapes et progression ──────────────────────── */

export type EtapeAmorcage = 'moteur' | 'rendu' | 'atlas' | 'pret';

export interface Progression {
  etape: EtapeAmorcage;
  /** de 0 à 1 */
  valeur: number;
  /** libellé français affiché sous la barre */
  libelle: string;
}

export type ObservateurProgression = (progression: Progression) => void;

const LIBELLES: Record<EtapeAmorcage, string> = {
  moteur: 'On attelle le moteur du Forez…',
  rendu: 'On allume les chandelles…',
  atlas: 'On peint les vingt-huit créatures…',
  pret: 'Le pays vous attend.',
};

const observateurs = new Set<ObservateurProgression>();
let derniere: Progression = { etape: 'moteur', valeur: 0, libelle: LIBELLES.moteur };

/** S'abonner à la progression de l'amorçage. Reçoit tout de suite l'état courant. */
export function observerProgression(observateur: ObservateurProgression): () => void {
  observateurs.add(observateur);
  observateur(derniere);
  return () => {
    observateurs.delete(observateur);
  };
}

function avancer(etape: EtapeAmorcage, valeur: number): void {
  derniere = { etape, valeur, libelle: LIBELLES[etape] };
  for (const o of [...observateurs]) o(derniere);
}

/* ───────────────────────── 2. Moteur et matières ────────────────────────── */

let moteurPret = false;

/** Branche contenu, carte et sous-modules du moteur. Idempotent. */
export function amorcerMoteur(): void {
  if (moteurPret) return;
  bootstrapEngine();
  installTextures();
  moteurPret = true;
  avancer('rendu', 0.12);
}

/* ───────────────────── 3. L'application PixiJS partagée ─────────────────── */

export type MoteurRendu = 'webgpu' | 'webgl' | 'canvas' | 'inconnu';

export interface RenduPartage {
  readonly app: Application;
  readonly backend: MoteurRendu;
}

let renduPromesse: Promise<RenduPartage> | null = null;

/** Résolution d'affichage, bornée à 2 (bible artistique : 12 px/case suffisent). */
export function resolutionEcran(): number {
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return Math.min(2, Math.max(1, dpr));
}

function nomDuRendu(app: Application): MoteurRendu {
  const nom = (app.renderer as unknown as { name?: string }).name;
  if (nom === 'webgpu' || nom === 'webgl' || nom === 'canvas') return nom;
  return 'inconnu';
}

/**
 * L'unique `Application` PixiJS du client. WebGPU d'abord, WebGL ensuite —
 * `autoDetectRenderer` suit cet ordre dès que la préférence est `webgpu`.
 */
export async function obtenirRendu(): Promise<RenduPartage> {
  if (renduPromesse) return renduPromesse;
  renduPromesse = (async (): Promise<RenduPartage> => {
    amorcerMoteur();
    const app = new Application();
    try {
      await app.init({
        preference: 'webgpu',
        antialias: true,
        backgroundAlpha: 0,
        resolution: resolutionEcran(),
        autoDensity: true,
        powerPreference: 'high-performance',
        width: 1280,
        height: 720,
      });
    } catch (cause) {
      renduPromesse = null;
      throw new ErreurAmorcage(
        "Ce navigateur n'a pu ouvrir ni WebGPU ni WebGL : la carte, les cités et les combats ne peuvent pas être dessinés.",
        "Essayez un autre navigateur, ou activez l'accélération matérielle dans ses réglages. Le codex, la fiche de héros et le royaume restent consultables.",
        cause,
      );
    }
    /* Le canevas est décoratif tant qu'aucune vue ne l'a pris en charge. */
    app.canvas.classList.add('hmm-canevas');
    app.canvas.setAttribute('aria-hidden', 'true');
    /* Le ticker est piloté par les écrans : rien ne tourne à vide. */
    app.ticker.stop();
    avancer('atlas', 0.3);
    return { app, backend: nomDuRendu(app) };
  })();
  return renduPromesse;
}

/** Vrai si le rendu accéléré a déjà été obtenu (sans le déclencher). */
export function renduDisponible(): boolean {
  return renduPromesse !== null;
}

/* ─────────────────────────── 4. L'atlas d'art ───────────────────────────── */

let atlasPromesse: Promise<ArtAtlas> | null = null;

/**
 * Construit l'atlas procédural, une seule fois par session. Coûteux (polices,
 * matières, vingt-huit rigs, quelques pages de 2048 px) : les écrans qui n'en
 * ont pas besoin ne doivent surtout pas l'attendre.
 */
export async function obtenirAtlas(): Promise<ArtAtlas> {
  if (atlasPromesse) return atlasPromesse;
  atlasPromesse = (async (): Promise<ArtAtlas> => {
    const { app } = await obtenirRendu();
    avancer('atlas', 0.45);
    try {
      const atlas = await buildArtAtlas(app.renderer);
      avancer('pret', 1);
      return atlas;
    } catch (cause) {
      atlasPromesse = null;
      throw new ErreurAmorcage(
        "La planche d'art n'a pas pu être peinte.",
        'Rechargez la page ; si la panne persiste, signalez-la avec le message technique du journal du navigateur.',
        cause,
      );
    }
  })();
  return atlasPromesse;
}

/** Vrai si l'atlas est déjà construit (sans déclencher sa construction). */
export function atlasDisponible(): boolean {
  return atlasPromesse !== null;
}

/* ──────────────────────────────── Le son ────────────────────────────────── */

let audioBranche = false;

/**
 * Branche le moteur audio sur le pont de la page d'accueil. Sans cela, le pont
 * tenterait un import dynamique à spécificateur calculé, que le bundler ne
 * résout pas : le jeu resterait muet en production.
 *
 * Aucun `AudioContext` n'est créé ici : le moteur attend `init()`, lui-même
 * déclenché par le premier geste du joueur.
 */
export async function brancherAudio(): Promise<void> {
  if (audioBranche) return;
  audioBranche = true;
  try {
    const [{ AudioEngine }, { fournirMoteurAudio }] = await Promise.all([
      import('./audio/index.js'),
      import('./landing/audio-bridge.js'),
    ]);
    fournirMoteurAudio(AudioEngine.get());
  } catch {
    /* Le jeu doit rester parfaitement jouable en silence. */
    audioBranche = false;
  }
}

/* ────────────────────────── Amorçage complet ────────────────────────────── */

/**
 * Amorçage minimal, appelé par `main.tsx` avant le premier rendu React :
 * le moteur et le son. Le rendu accéléré et l'atlas viennent à la demande.
 */
export function amorcer(): void {
  amorcerMoteur();
  void brancherAudio();
}
