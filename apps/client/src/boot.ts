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
import { fournirMoteurAudio } from './landing/audio-bridge.js';
import type { MoteurAudio } from './landing/audio-bridge.js';
import { lireManifeste, RACINE_IMAGES } from './art/assets.js';
import { setPortraitSources } from '@auvergne/ui';

/* ─────────────────────────────── Erreurs ────────────────────────────────── */

/** Panne d'amorçage, avec un message affichable tel quel. */
export class ErreurAmorcage extends Error {
  constructor(
    message: string,
    /** conseil pratique donné au joueur, en français */
    readonly conseil: string,
    /* `Error` déclare déjà `cause` : sans `override`, `noImplicitOverride`
       refuse la propriété de paramètre (TS4115). */
    override readonly cause?: unknown,
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
    /*
     * Sonde de performance. Le coût par image d'une scène PixiJS dépend bien
     * plus du NOMBRE d'objets vivants que du nombre de pixels : au-delà de
     * quelques milliers de `Graphics`, le moteur reconstruit ses lots à chaque
     * image et la fréquence s'effondre, identiquement en 320 × 180 et en
     * 1920 × 1080. `__auvergne` permet de compter sans instrumenter le code.
     */
    (globalThis as { __auvergne?: unknown }).__auvergne = {
      app,
      compter(): { total: number; graphics: number; sprites: number; conteneurs: number; profondeur: number } {
        let total = 0;
        let graphics = 0;
        let sprites = 0;
        let conteneurs = 0;
        let profondeur = 0;
        const pile: { n: { children?: unknown[]; constructor: { name: string } }; d: number }[] = [
          { n: app.stage as never, d: 0 },
        ];
        while (pile.length) {
          const { n, d } = pile.pop()!;
          total += 1;
          if (d > profondeur) profondeur = d;
          const nom = n.constructor?.name ?? '';
          if (nom.includes('Graphics')) graphics += 1;
          else if (nom.includes('Sprite')) sprites += 1;
          else conteneurs += 1;
          const enfants = n.children;
          if (Array.isArray(enfants)) {
            for (const e of enfants) pile.push({ n: e as never, d: d + 1 });
          }
        }
        return { total, graphics, sprites, conteneurs, profondeur };
      },
    };

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
let moteurAudioReel: MoteurAudio | null = null;
let chargementAudio: Promise<MoteurAudio | null> | null = null;

/**
 * Charge le module audio, une seule fois. Le spécificateur est écrit en clair :
 * le bundler en fait un fragment, et l'adresse résolue est la bonne en
 * production. Aucun `AudioContext` n'est créé — `AudioEngine.get()` attend
 * `init()`, lui-même déclenché par le premier geste du joueur.
 */
async function chargerAudio(): Promise<MoteurAudio | null> {
  chargementAudio ??= import('./audio/index.js')
    .then((module): MoteurAudio | null => {
      moteurAudioReel = module.AudioEngine.get();
      return moteurAudioReel;
    })
    .catch((): null => {
      /* Le jeu doit rester parfaitement jouable en silence. */
      chargementAudio = null;
      return null;
    });
  return chargementAudio;
}

/** Exécute l'ordre tout de suite si le moteur est là, sinon dès qu'il arrive. */
function differer(ordre: (moteur: MoteurAudio) => void): void {
  if (moteurAudioReel) {
    try {
      ordre(moteurAudioReel);
    } catch {
      /* Un son raté n'interrompt jamais une interaction. */
    }
    return;
  }
  void chargerAudio().then((moteur) => {
    if (!moteur) return;
    try {
      ordre(moteur);
    } catch {
      /* Sans conséquence. */
    }
  });
}

/**
 * Façade posée **synchroniquement** sur le pont audio de la page d'accueil.
 *
 * Le pont a trois canaux : moteur injecté, `globalThis.AuvergneAudio`, puis —
 * en dernier ressort — un import à spécificateur calculé que le bundler laisse
 * tel quel. Ce troisième canaux échoue en production (`GET /audio/index.js`
 * → 404 dans le journal de la console). Injecter cette façade dès la première
 * ligne de `amorcer()` ferme la course : le pont prend toujours le canal n°1,
 * et le vrai module n'est téléchargé qu'au premier son demandé.
 */
const FACADE_AUDIO: MoteurAudio = {
  get ready(): boolean {
    return moteurAudioReel?.ready ?? false;
  },
  async init(): Promise<void> {
    const moteur = await chargerAudio();
    if (moteur) await moteur.init();
  },
  setBus(bus, volume): void {
    differer((m) => m.setBus(bus, volume));
  },
  playTheme(theme): void {
    differer((m) => m.playTheme(theme));
  },
  stopTheme(fadeMs): void {
    differer((m) => m.stopTheme(fadeMs));
  },
  sfx(key): void {
    differer((m) => m.sfx(key));
  },
  ambience(key): void {
    differer((m) => m.ambience(key));
  },
};

/** Branche la façade audio sur le pont de la page d'accueil. Idempotent. */
export function brancherAudio(): void {
  if (audioBranche) return;
  audioBranche = true;
  fournirMoteurAudio(FACADE_AUDIO);
}

/* ────────────────────────── Amorçage complet ────────────────────────────── */

/**
 * Amorçage minimal, appelé par `main.tsx` avant le premier rendu React :
 * le moteur et le son. Le rendu accéléré et l'atlas viennent à la demande.
 */
/**
 * Enregistre les portraits peints auprès du design system.
 *
 * Volontairement indépendant de l'atlas PixiJS : la fiche de héros, le codex,
 * la taverne et la vue du royaume sont des écrans **DOM**, consultables même
 * quand le navigateur refuse WebGPU et WebGL. Ils doivent donc bénéficier des
 * portraits peints sans attendre — ni dépendre — du moteur de rendu.
 *
 * Sans manifeste, sans réseau, ou en cas de manifeste invalide : rien ne se
 * passe, et les portraits vectoriels du design system restent affichés.
 */
function brancherPortraitsPeints(): void {
  void lireManifeste()
    .then((manifeste) => {
      if (!manifeste) return;
      const sources: Record<string, string> = {};
      for (const e of manifeste.entrees) {
        if (e.categorie !== 'portrait') continue;
        sources[e.clef] = `${RACINE_IMAGES}/${e.fichier}`;
      }
      if (Object.keys(sources).length > 0) setPortraitSources(sources);
    })
    .catch(() => {
      /* Le repli vectoriel suffit : aucune raison d'alerter le joueur. */
    });
}

export function amorcer(): void {
  amorcerMoteur();
  brancherAudio();
  brancherPortraitsPeints();
}
