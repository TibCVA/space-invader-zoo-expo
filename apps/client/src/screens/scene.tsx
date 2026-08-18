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
import { ErreurAmorcage, obtenirAtlas, obtenirRendu, observerProgression } from '../boot.js';
import type { ArtAtlas } from '../art/index.js';
import type { Progression } from '../boot.js';
import { Bandeau, EcranChargement, EcranPanne } from './shell.js';

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

  useEffect(() => observerProgression(setProgression), []);

  useEffect(() => {
    let vivant = true;
    let scene: SceneMontee | null = null;
    let boucle = 0;
    let observateur: ResizeObserver | null = null;
    let canvas: HTMLCanvasElement | null = null;
    let detacherDefilement: (() => void) | null = null;
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

        scene = await fabrique({ app, atlas, width: w, height: h, reducedMotion });
        if (!vivant) {
          scene.destroy?.();
          return;
        }
        app.stage.addChild(scene.container);

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
      } catch (cause) {
        if (!vivant) return;
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
      detacherDefilement?.();
      observateur?.disconnect();
      scene?.destroy?.();
      if (canvas && canvas.parentElement) canvas.parentElement.removeChild(canvas);
    };
  }, [cle, fabrique, reducedMotion, ajusterLargeur, defilementVertical, fps, sommeilMs]);

  if (erreur !== null) {
    return (
      <>
        <Bandeau titre={titre} note={note} />
        <EcranPanne erreur={erreur} />
      </>
    );
  }

  return (
    <>
      <Bandeau titre={titre} note={note} />
      <div className="jeu-ecran">
        <div className="jeu-scene">
          <div className="jeu-scene__toile" ref={hote} />
          {!prete ? <EcranChargement progression={progression} titre={titre} citation={titre.length} /> : null}
          {prete && legende ? <div className="jeu-scene__legende">{legende}</div> : null}
          {prete ? children : null}
        </div>
      </div>
    </>
  );
}
