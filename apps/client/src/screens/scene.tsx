/**
 * Hôte des scènes accélérées.
 *
 * Une seule `Application` PixiJS existe dans le client (`boot.ts`). Ce
 * composant est le **seul** endroit où son canevas entre dans le DOM : il
 * l'attache, le redimensionne, fait tourner la boucle d'images, puis rend la
 * scène et détache tout. La coquille React n'appelle jamais autre chose que
 * `resize`, `update` et `destroy` (règle n°2 de `view-contract.ts`).
 *
 * Aucune règle de jeu n'est calculée ici.
 */

import { useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import type { Application, Container } from 'pixi.js';
import { MAX_FRAME_MS } from '../view-contract.js';
import {
  compterObjets,
  ErreurAmorcage,
  noterMontageScene,
  obtenirAtlas,
  obtenirRendu,
  observerProgression,
} from '../boot.js';
import type { ArtAtlas } from '../art/index.js';
import type { Progression } from '../boot.js';
import { Bandeau, EcranChargement, EcranPanne } from './shell.js';
import { eveillerAudio } from '../landing/audio-bridge.js';
import { consommerEvenements, viewStore } from '../state/store.js';
import type { GameEvent } from '@auvergne/engine';

/**
 * Délai avant démontage du voile de chargement, un peu au-delà de la
 * transition CSS (`--hmm-duree-lente`, 220 ms) pour qu'elle finisse à l'écran.
 */
export const DUREE_LEVEE_MS = 260;

/**
 * Le strict minimum pour animer : ce que `GameView` promet en plus d'une scène.
 * On ne dépend pas de `GameView` entier — une scène de démonstration n'a pas de
 * contrat de jeu et doit rester montable ici.
 */
interface VuePouvantAnimer {
  playEvents(events: readonly GameEvent[]): Promise<void>;
}

/* ────────────────────────── Ce qu'une scène doit savoir faire ───────────── */

/** Le strict minimum attendu d'une scène : c'est `GameView` sans le contrat de jeu. */
export interface SceneMontee {
  readonly container: Container;
  resize?(width: number, height: number): void;
  update?(dtMs: number): void;
  destroy?(): void;
  /** taille intrinsèque, pour les scènes à cadrer (planche d'art) */
  readonly taille?: { largeur: number; hauteur: number };
}

export interface FabriqueSceneDeps {
  /** l'unique application PixiJS, déjà initialisée et dimensionnée */
  app: Application;
  atlas: ArtAtlas;
  width: number;
  height: number;
  reducedMotion: boolean;
}

export type FabriqueScene = (deps: FabriqueSceneDeps) => Promise<SceneMontee>;

/* ─────────────────────────────── Le composant ───────────────────────────── */

export interface ScenePixiProps {
  titre: string;
  note?: ReactNode;
  /**
   * Contenu poussé à droite du bandeau — la barre du trésor sur les écrans où
   * l'on dépense. Il est rendu **même pendant le chargement** : le bandeau est
   * hors de la scène Pixi, et attendre l'atlas pour afficher un nombre déjà
   * connu ferait clignoter la barre à chaque entrée d'écran.
   */
  outils?: ReactNode;
  /** construit la scène ; **doit** rester sous deux secondes */
  fabrique: FabriqueScene;
  /** relance la fabrique quand cette clef change */
  cle: string;
  reducedMotion?: boolean;
  /** légende posée en bas à gauche de la scène */
  legende?: ReactNode;
  /** interface React superposée à la scène (panneaux, barres de confirmation) */
  children?: ReactNode;
  /** cadrer la scène à la largeur utile plutôt que de la laisser plein cadre */
  ajusterLargeur?: boolean;
  /** faire défiler la scène verticalement à la molette et au glissement */
  defilementVertical?: boolean;
  /** images par seconde visées ; 60 par défaut */
  fps?: number;
  /**
   * Durée d'animation avant mise en sommeil, en millisecondes. À l'expiration,
   * la boucle s'arrête sur la dernière image : le fil principal redevient
   * libre. Toute interaction (molette, glissement, redimensionnement) la
   * réveille. `0` anime sans fin — c'est le comportement des scènes de jeu.
   */
  sommeilMs?: number;
}

/** Monte une scène PixiJS plein cadre, avec chargement et panne soignés. */
export function ScenePixi(props: ScenePixiProps): ReactElement {
  const {
    titre,
    note,
    outils,
    fabrique,
    cle,
    reducedMotion = false,
    legende,
    children,
    ajusterLargeur = false,
    defilementVertical = false,
    fps = 60,
    sommeilMs = 0,
  } = props;

  const hote = useRef<HTMLDivElement | null>(null);
  const [progression, setProgression] = useState<Progression>({
    etape: 'moteur',
    valeur: 0.05,
    libelle: 'On attelle le moteur du Forez…',
  });
  const [erreur, setErreur] = useState<unknown>(null);
  const [prete, setPrete] = useState(false);
  /* Le voile de chargement reste monté un court instant après `prete` pour
     se lever en fondu plutôt que de disparaître d'un coup. Le démontage passe
     par un délai fixe, jamais par `transitionend` : sous mouvement réduit la
     transition est coupée et l'événement ne viendrait pas. */
  const [voile, setVoile] = useState(true);

  useEffect(() => observerProgression(setProgression), []);

  useEffect(() => {
    if (!prete) {
      setVoile(true);
      return;
    }
    const levee = window.setTimeout(() => setVoile(false), DUREE_LEVEE_MS);
    return () => window.clearTimeout(levee);
  }, [prete]);

  useEffect(() => {
    let vivant = true;
    let scene: SceneMontee | null = null;
    let boucle = 0;
    let observateur: ResizeObserver | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let detacherDefilement: (() => void) | null = null;
    /** Désabonnement de la file d'animation, posé quand la scène est prête. */
    let desabonnerFile: (() => void) | null = null;
    /** relance la boucle d'images ; posée dès qu'elle existe */
    let reveil: (() => void) | null = null;

    setPrete(false);
    setErreur(null);

    void (async (): Promise<void> => {
      try {
        const { app } = await obtenirRendu();
        const atlas = await obtenirAtlas();
        if (!vivant) return;
        const conteneur = hote.current;
        if (!conteneur) return;

        canvas = app.canvas;
        const mesurer = (): { w: number; h: number } => ({
          w: Math.max(320, Math.round(conteneur.clientWidth || 1280)),
          h: Math.max(240, Math.round(conteneur.clientHeight || 720)),
        });
        const { w, h } = mesurer();

        app.stage.removeChildren();
        app.renderer.resize(w, h);
        conteneur.appendChild(canvas);

        /* Le premier appui sur la scène réveille le moteur audio : un joueur
           qui recharge en pleine partie n'est jamais passé par un clic de
           l'accueil, et les navigateurs n'ouvrent le son qu'après un geste. */
        conteneur.addEventListener('pointerdown', eveillerAudio, { once: true, passive: true });

        /* Chronométré et compté : sur un appareil où la scène reste vide, c'est
           cette trace, relue par `#/diagnostic`, qui dira ce qui s'est passé. */
        const debutFabrique = performance.now();
        scene = await fabrique({ app, atlas, width: w, height: h, reducedMotion });
        if (!vivant) {
          scene.destroy?.();
          return;
        }
        app.stage.addChild(scene.container);
        noterMontageScene({
          cle,
          largeur: w,
          hauteur: h,
          dureeMs: Math.round(performance.now() - debutFabrique),
          objets: compterObjets(scene.container as unknown as { children?: unknown[] }),
          erreur: null,
          a: new Date().toLocaleTimeString('fr-FR'),
        });

        /* Cadrage des scènes à taille intrinsèque (la planche de contact). */
        let decalageY = 0;
        const cadrer = (largeur: number, hauteur: number): void => {
          const taille = scene?.taille;
          if (!ajusterLargeur || !taille || !scene) return;
          const echelle = Math.min(1, largeur / taille.largeur);
          scene.container.scale.set(echelle);
          scene.container.position.set(
            Math.max(0, (largeur - taille.largeur * echelle) / 2),
            -decalageY * echelle,
          );
          void hauteur;
        };

        const appliquer = (): void => {
          if (!scene) return;
          const t = mesurer();
          app.renderer.resize(t.w, t.h);
          scene.resize?.(t.w, t.h);
          if (!ajusterLargeur) scene.container.position.set(t.w / 2, t.h / 2);
          cadrer(t.w, t.h);
          reveil?.();
        };
        appliquer();

        if (defilementVertical && scene.taille) {
          const taille = scene.taille;
          const glisser = (delta: number): void => {
            const t = mesurer();
            const echelle = Math.min(1, t.w / taille.largeur);
            const max = Math.max(0, taille.hauteur - t.h / echelle);
            decalageY = Math.min(max, Math.max(0, decalageY + delta));
            cadrer(t.w, t.h);
            reveil?.();
          };
          const surMolette = (e: WheelEvent): void => {
            e.preventDefault();
            glisser(e.deltaY);
          };
          let depart: number | null = null;
          const surDebut = (e: PointerEvent): void => {
            depart = e.clientY;
          };
          const surDeplace = (e: PointerEvent): void => {
            if (depart === null) return;
            glisser(depart - e.clientY);
            depart = e.clientY;
          };
          const surFin = (): void => {
            depart = null;
          };
          conteneur.addEventListener('wheel', surMolette, { passive: false });
          conteneur.addEventListener('pointerdown', surDebut);
          conteneur.addEventListener('pointermove', surDeplace);
          conteneur.addEventListener('pointerup', surFin);
          conteneur.addEventListener('pointercancel', surFin);
          detacherDefilement = (): void => {
            conteneur.removeEventListener('wheel', surMolette);
            conteneur.removeEventListener('pointerdown', surDebut);
            conteneur.removeEventListener('pointermove', surDeplace);
            conteneur.removeEventListener('pointerup', surFin);
            conteneur.removeEventListener('pointercancel', surFin);
          };
        }

        observateur = new ResizeObserver(() => appliquer());
        observateur.observe(conteneur);

        /* ── La boucle d'images ───────────────────────────────────────────
           Deux garde-fous : une cadence plafonnée (`fps`) et une mise en
           sommeil (`sommeilMs`). Une planche de 1840 × 7000 px repeinte
           soixante fois par seconde monopolise le fil principal d'un
           téléphone — la scène finit par ne plus rien laisser passer, pas
           même une capture d'écran. Au sommeil, la dernière image reste à
           l'écran et la moindre interaction relance l'animation. */
        const pasMin = fps > 0 ? 1000 / fps : 0;
        let precedent = performance.now();
        let debut = precedent;
        let dernierRendu = 0;

        const image = (maintenant: number): void => {
          boucle = 0;
          if (!vivant || !scene) return;
          if (maintenant - dernierRendu >= pasMin) {
            const dt = Math.min(MAX_FRAME_MS, maintenant - precedent);
            precedent = maintenant;
            dernierRendu = maintenant;
            scene.update?.(dt);
            app.render();
          }
          if (sommeilMs > 0 && maintenant - debut > sommeilMs) return;
          boucle = requestAnimationFrame(image);
        };

        const reveiller = (): void => {
          if (!vivant) return;
          debut = performance.now();
          precedent = debut;
          if (boucle === 0) boucle = requestAnimationFrame(image);
        };
        reveil = reveiller;

        /* Une première image tout de suite : la capture d'écran ne doit jamais
           trouver un canevas vide. */
        app.render();
        boucle = requestAnimationFrame(image);
        setPrete(true);

        /*
         * LA FILE D'ANIMATION ÉTAIT DÉBRANCHÉE DES DEUX CÔTÉS.
         *
         * `dispatch` empile chaque `GameEvent` dans `etat.queue`
         * (`state/store.ts`), `consommerEvenements()` existe pour la vider, et
         * `playEvents()` est écrite sur la carte comme sur le champ de
         * bataille pour la jouer. **Aucune des deux n'était appelée par qui
         * que ce soit** : la file grossissait sans fin et rien ne s'animait.
         *
         * Ce que voyait le joueur, et ce qu'il a signalé : « sur la carte, les
         * déplacements sont instantanés au lieu de voir le héros avancer
         * lentement ». Le héros se téléporte parce que `animerDeplacement`, qui
         * le fait marcher de case en case, n'est jamais atteinte.
         *
         * On relie donc les deux bouts ici, au seul endroit qui tient à la fois
         * la scène montée et son cycle de vie. Trois garanties :
         *
         *  - **une lecture à la fois** : `enTrainDeJouer` empêche deux séries
         *    de se chevaucher, sinon deux marches du même héros se disputent sa
         *    position ;
         *  - **l'état n'est jamais touché** : le moteur a déjà tout appliqué,
         *    l'animation est purement visuelle et ne peut rien changer ;
         *  - **une série qui échoue ne fige rien** : on relâche le verrou et on
         *    reprend la file, quitte à sauter une animation.
         */
        let enTrainDeJouer = false;
        const jouerLaFile = (): void => {
          if (!vivant || enTrainDeJouer) return;
          const vue = scene as SceneMontee & Partial<VuePouvantAnimer>;
          if (typeof vue.playEvents !== 'function') return;
          const attente = consommerEvenements();
          if (attente.length === 0) return;
          enTrainDeJouer = true;
          void vue
            .playEvents(attente)
            .catch(() => {
              /* Une animation qui casse ne doit pas emporter la partie : l'état
                 du moteur est déjà juste, seule l'image est perdue. */
            })
            .finally(() => {
              enTrainDeJouer = false;
              reveil?.();
              jouerLaFile();
            });
        };
        desabonnerFile = viewStore.subscribe(jouerLaFile);
        jouerLaFile();
      } catch (cause) {
        if (!vivant) return;
        noterMontageScene({
          cle,
          largeur: 0,
          hauteur: 0,
          dureeMs: 0,
          objets: 0,
          erreur: String(cause).slice(0, 240),
          a: new Date().toLocaleTimeString('fr-FR'),
        });
        setErreur(
          cause instanceof ErreurAmorcage
            ? cause
            : new ErreurAmorcage(
                'Cette scène n’a pas pu être dressée.',
                'Revenez à l’accueil, puis réessayez. Les écrans de données restent accessibles.',
                cause,
              ),
        );
      }
    })();

    return () => {
      vivant = false;
      if (boucle) cancelAnimationFrame(boucle);
      desabonnerFile?.();
      detacherDefilement?.();
      observateur?.disconnect();
      scene?.destroy?.();
      if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);
    };
  }, [cle, fabrique, reducedMotion, ajusterLargeur, defilementVertical, fps, sommeilMs]);

  if (erreur !== null) {
    return (
      <>
        <Bandeau titre={titre} note={note}>{outils}</Bandeau>
        <EcranPanne erreur={erreur} />
      </>
    );
  }

  return (
    <>
      <Bandeau titre={titre} note={note}>{outils}</Bandeau>
      <div className="jeu-ecran">
        <div className="jeu-scene">
          <div className="jeu-scene__toile" ref={hote} />
          {voile ? (
            <div
              className={'jeu-scene__voile' + (prete ? ' jeu-scene__voile--leve' : '')}
              aria-hidden={prete || undefined}
            >
              <EcranChargement progression={progression} titre={titre} citation={titre.length} />
            </div>
          ) : null}
          {prete && legende ? <div className="jeu-scene__legende">{legende}</div> : null}
          {prete ? children : null}
        </div>
      </div>
    </>
  );
}
