/**
 * `apps/client/src/render` — LA CARTE D'AVENTURE.
 *
 * Cette fabrique respecte le contrat de `apps/client/src/view-contract.ts` :
 * `createMapView(deps)` rend un `MapView` complet, qui possède son conteneur,
 * se redimensionne, s'anime et se détruit. Elle ne calcule **aucune règle** :
 * les chemins viennent de `computePath` / `pathDays`, les déplacements partent
 * en `Command` par `deps.dispatch`, l'état se lit par `deps.store`.
 *
 * L'assemblage des couches, du sol au ciel :
 *
 *   fond hors carte · terrain (blocs peints) · ombres portées · décor semé ·
 *   objets de carte · chemin en perles · jetons de héros · météo
 *   → puis **un seul filtre** (`postfx.ts`) qui porte le brouillard de guerre,
 *     le vignettage, l'aberration, le grain, l'étalonnage et le bloom
 *   → puis l'habillage non filtré : minicarte, rose des vents, échelle.
 *
 * Le budget est tenu par trois moyens : les blocs de terrain sont peints une
 * fois puis mis en cache, seuls les blocs visibles existent, et la peinture est
 * étalée sur les images avec un budget en millisecondes.
 */

import { Container, Graphics, Rectangle, Text, TextStyle } from 'pixi.js';
import {
  computePath,
  heroStats,
  pathDays,
} from '@auvergne/engine';
import type {
  GameEvent,
  GameState,
  HeroInstance,
  MapCoord,
  MapObject,
  PlayerId,
  TownUid,
} from '@auvergne/engine';
import type { MapCamera, MapView, MapViewDeps } from '../view-contract.js';
import type { PathPreview, Selection } from '../state/types.js';
import { LIGHT, PALETTE, melanger } from '../art/palette.js';
import { Camera, ZOOM_DEFAUT, ZOOM_MAX, ZOOM_MIN } from './camera.js';
import { PeintreTerrain } from './terrain.js';
import { SemisProps } from './props.js';
import { ObjetsCarte } from './objects.js';
import { pavoisDemonstration } from './pavois.js';
import { JetonsHeros } from './heroes.js';
import { Brouillard } from './fog.js';
import { CheminPerles } from './path.js';
import { Minicarte } from './minimap.js';
import { Meteo } from './weather.js';
import { creerPostFx } from './postfx.js';
import type { PostTraitement } from './postfx.js';
import { borne, champs, colEcran, rowEcran, xEcran, yEcran } from './commun.js';
import type { Cadrage } from './commun.js';

/** Budget de peinture de terrain par image, en millisecondes. */
const BUDGET_PEINTURE = 7;
/** Au-delà, un appui est une inspection et non un clic. */
const APPUI_LONG_MS = 520;
/** Déplacement au-delà duquel un geste devient un glissement. */
const SEUIL_GLISSEMENT = 6;

interface Pointeur {
  id: number;
  x: number;
  y: number;
  x0: number;
  y0: number;
  t0: number;
  glisse: boolean;
  tactile: boolean;
}

/* ─────────────────────────────── La vue ─────────────────────────────────── */

class CarteAventure implements MapView {
  readonly container = new Container();

  private readonly monde = new Container();
  private readonly scene = new Container();
  private readonly habillage = new Container();
  private readonly fondHorsCarte = new Graphics();
  private readonly surbrillance = new Graphics();
  private readonly rose = new Graphics();
  private readonly echelle = new Container();

  private readonly camera: Camera;
  private readonly terrain: PeintreTerrain;
  private readonly decor: SemisProps;
  private readonly objets: ObjetsCarte;
  private readonly jetons: JetonsHeros;
  private readonly voile: Brouillard;
  private readonly perles: CheminPerles;
  private readonly minicarte: Minicarte;
  private readonly meteo: Meteo;
  private readonly postfx: PostTraitement | null;

  private largeur = 1;
  private hauteur = 1;
  private temps = 0;
  private detruit = false;
  private premierCadrage = true;
  private retard = 0;
  private readonly economie: boolean;

  private etat: GameState | null = null;
  private selection: Selection | null = null;
  private survolCase: MapCoord | null = null;
  private survolObjet: string | null = null;
  private previewExterne: PathPreview | null = null;
  private previewInterne: PathPreview | null = null;
  private fogAffiche: Uint8Array | null = null;

  private readonly pointeurs = new Map<number, Pointeur>();
  private souris: { x: number; y: number } | null = null;
  private pinceEcart = 0;
  private minicarteSaisie = false;
  private desabonner: (() => void) | null = null;
  private readonly detacher: (() => void)[] = [];

  /* Mesures, pour le rapport de performance. */
  private imagesMesurees = 0;
  private cumulImageMs = 0;
  private pireImageMs = 0;
  private rapportFait = false;

  constructor(private readonly deps: MapViewDeps) {
    this.container.label = 'carte-aventure';
    this.container.addChild(this.monde);
    this.monde.addChild(this.scene);
    this.monde.addChild(this.habillage);
    this.economie = deps.quality === 'basse';

    this.camera = new Camera(
      { cols: deps.world.cols, rows: deps.world.rows, onChange: (c) => deps.onCameraChange?.(c) },
      { col: (deps.focus?.col ?? deps.world.cols / 2) + 0.5, row: (deps.focus?.row ?? deps.world.rows / 2) + 0.5, zoom: ZOOM_DEFAUT },
    );

    this.terrain = new PeintreTerrain(deps.world, deps.quality);
    this.decor = new SemisProps(deps.world, deps.atlas, deps.quality);
    this.objets = new ObjetsCarte(deps.world, deps.atlas);
    this.jetons = new JetonsHeros(deps.atlas, deps.localPlayer);
    this.perles = new CheminPerles();
    this.meteo = new Meteo(deps.atlas, deps.quality, deps.reducedMotion);
    this.minicarte = new Minicarte(deps.world);
    this.voile = new Brouillard(deps.world, deps.width / ZOOM_MIN, deps.height / ZOOM_MIN, false);
    this.postfx = creerPostFx(this.voile.texture);
    if (!this.postfx) {
      /* Repli sans filtre : le voile redevient un calque peint. */
      this.voileSecours = new Brouillard(deps.world, deps.width / ZOOM_MIN, deps.height / ZOOM_MIN, true);
    }

    this.scene.addChild(this.fondHorsCarte);
    this.scene.addChild(this.terrain.couche);
    this.scene.addChild(this.decor.ombres);
    this.scene.addChild(this.objets.ombres);
    this.scene.addChild(this.surbrillance);
    this.scene.addChild(this.decor.couche);
    this.scene.addChild(this.objets.couche);
    this.scene.addChild(this.perles.couche);
    this.scene.addChild(this.jetons.couche);
    this.scene.addChild(this.meteo.couche);
    if (this.voileSecours) this.scene.addChild(this.voileSecours.couche);
    if (this.postfx) this.scene.filters = [this.postfx.filtre];

    this.habillage.addChild(this.rose);
    this.habillage.addChild(this.echelle);
    this.habillage.addChild(this.minicarte.couche);

    this.brancherEntrees();
    this.desabonner = deps.store.subscribe(() => this.relire());
    this.relire();
  }

  private voileSecours: Brouillard | null = null;

  /* ───────────────────────────── État du magasin ──────────────────────── */

  private relire(): void {
    if (this.detruit) return;
    const app = this.deps.store.get();
    if (app.game && app.game !== this.etat) this.sync(app.game);
    this.selection = app.selection;
    if (app.pathPreview !== this.previewExterne) {
      this.previewExterne = app.pathPreview;
      this.majPerles();
    }
  }

  sync(state: GameState): void {
    this.etat = state;
    this.jetons.sync(state);
    this.objets.sync(state);
    this.minicarte.sync(state);
    this.meteo.poser(state.weather.current);
    this.majFog();
    this.majPavois(state);
  }

  /**
   * Pavois des routes de démonstration.
   *
   * Même procédé que `fogDemonstration` juste en dessous, et même justification :
   * `createGame` ouvre le premier jour d'une partie, où aucun gisement n'a
   * changé de main. `#/demo/carte` annonce pourtant la semaine 6 — la revue
   * visuelle photographiait donc une carte politique vierge, une seule bannière
   * dans tout le cadre, celle de Cervières, cachée derrière le jeton de
   * Clotilde. La table est déterministe et **ne touche jamais l'état du
   * moteur** ; `screens/vues.tsx` construit la même par la même fonction, pour
   * que le drapeau planté et la fiche d'inspection ne se contredisent pas.
   */
  private majPavois(state: GameState): void {
    if (!this.deps.demo || this.pavoisPose) return;
    this.pavoisPose = true;
    this.objets.poserPavoisDemo(pavoisDemonstration(this.deps.world, state));
  }

  private pavoisPose = false;

  /* ──────────────────────────── Brouillard ─────────────────────────────── */

  refreshFog(player: PlayerId): void {
    void player;
    this.majFog();
  }

  private majFog(): void {
    const state = this.etat;
    if (!state) return;
    const joueur = state.players[this.deps.localPlayer];
    const reel = joueur?.fog ?? null;
    const affiche = this.deps.demo ? this.fogDemonstration(state, reel) : reel;
    this.fogAffiche = affiche;
    this.voile.poserSource(affiche);
    this.voile.invalider();
    this.voileSecours?.poserSource(affiche);
    this.voileSecours?.invalider();
    this.minicarte.poserFog(affiche);
  }

  /**
   * Sur les routes `#/demo/*`, l'état factice ne connaît que les alentours
   * immédiats des départs : la carte de démonstration serait un écran noir.
   * On y ouvre donc les **terres arpentées** — explorées, jamais « visibles » —
   * autour des cités et des héros du joueur local, sans jamais toucher à l'état
   * du moteur. Les trois états du voile restent démontrés.
   */
  private fogDemonstration(state: GameState, reel: Uint8Array | null): Uint8Array {
    const w = this.deps.world;
    const out = new Uint8Array(w.cols * w.rows);
    if (reel) out.set(reel);
    const joueur = state.players[this.deps.localPlayer];
    if (!joueur) return out;

    /* Les foyers : cités, héros, point de cadrage — et les relais du chemin qui
       les relie, pour que la contrée traversée forme une seule contrée claire
       plutôt que deux taches sans lien. */
    const socles: MapCoord[] = [];
    for (const uid of joueur.towns) {
      const t = state.towns[uid];
      if (t) socles.push(t.at);
    }
    for (const uid of joueur.heroes) {
      const h = state.heroes[uid];
      if (h) socles.push(h.at);
    }
    const centre = this.deps.focus;
    if (centre) socles.push(centre);
    const foyers: MapCoord[] = [...socles];
    if (centre) {
      for (const s of socles) {
        for (const t of [0.25, 0.5, 0.75]) {
          foyers.push({
            col: Math.round(s.col + (centre.col - s.col) * t),
            row: Math.round(s.row + (centre.row - s.row) * t),
          });
        }
      }
    }

    const ch = champs();
    const marquer = (niveau: number, a: number, b: number) => {
      for (const f of foyers) {
        const c0 = Math.max(0, Math.floor(f.col - a - 4));
        const c1 = Math.min(w.cols - 1, Math.ceil(f.col + a + 4));
        const r0 = Math.max(0, Math.floor(f.row - b - 4));
        const r1 = Math.min(w.rows - 1, Math.ceil(f.row + b + 4));
        for (let row = r0; row <= r1; row += 1) {
          const dr = (row - f.row) / b;
          for (let col = c0; col <= c1; col += 1) {
            const dc = (col - f.col) / a;
            /* Frontière gauchie par le bruit : jamais un ovale de géomètre. */
            const seuil = 1 + ch.gauche.doux(col * 0.11, row * 0.11) * 0.34;
            if (dc * dc + dr * dr > seuil) continue;
            const i = row * w.cols + col;
            if (out[i] < niveau) out[i] = niveau;
          }
        }
      }
    };
    marquer(1, 96, 66);
    marquer(2, 44, 22);
    return out;
  }

  /* ─────────────────────────────── Caméra ──────────────────────────────── */

  getCamera(): MapCamera {
    return this.camera.etat;
  }

  setCamera(camera: Partial<MapCamera>): void {
    this.camera.poser(camera);
  }

  centerOn(at: MapCoord, options?: { animate?: boolean; zoom?: number }): void {
    this.camera.centrer(at, options);
  }

  panBy(dxPixels: number, dyPixels: number): void {
    this.camera.glisser(dxPixels, dyPixels);
  }

  zoomBy(factor: number, anchor?: { x: number; y: number }): void {
    this.camera.zoomer(factor, anchor);
  }

  /* ────────────────────── Sélection, chemin, conversions ───────────────── */

  setSelection(selection: Selection | null): void {
    this.selection = selection;
  }

  setPathPreview(preview: PathPreview | null): void {
    this.previewExterne = preview;
    this.majPerles();
  }

  private get preview(): PathPreview | null {
    return this.previewExterne ?? this.previewInterne;
  }

  private majPerles(): void {
    const p = this.preview;
    if (!p) {
      this.perles.poser(null, null);
      return;
    }
    const hero = this.etat?.heroes[p.hero];
    this.perles.poser(p, hero ? hero.at : null);
  }

  cellAt(x: number, y: number): MapCoord | null {
    const v = this.cadrage();
    const col = Math.floor(colEcran(v, x));
    const row = Math.floor(rowEcran(v, y));
    if (col < 0 || row < 0 || col >= this.deps.world.cols || row >= this.deps.world.rows) return null;
    return { col, row };
  }

  screenOf(at: MapCoord): { x: number; y: number } {
    const v = this.cadrage();
    return { x: xEcran(v, at.col + 0.5), y: yEcran(v, at.row + 0.5) };
  }

  private cadrage(): Cadrage {
    const c = this.camera.etat;
    return { col: c.col, row: c.row, zoom: c.zoom, largeur: this.largeur, hauteur: this.hauteur };
  }

  /* ─────────────────────────────── Événements ──────────────────────────── */

  async playEvents(events: readonly GameEvent[]): Promise<void> {
    const immediat = this.deps.reducedMotion;
    for (const e of events) {
      if (this.detruit) return;
      switch (e.type) {
        case 'HeroMoved':
          await this.jetons.animerDeplacement(e.hero, e.path, immediat);
          break;
        case 'FogRevealed':
          this.majFog();
          break;
        case 'WeatherChanged':
          this.meteo.poser(e.current);
          break;
        default:
          break;
      }
    }
    const app = this.deps.store.get();
    if (app.game) this.sync(app.game);
  }

  /* ─────────────────────────── Cycle de vie ────────────────────────────── */

  resize(width: number, height: number): void {
    this.largeur = Math.max(1, width);
    this.hauteur = Math.max(1, height);
    /* La coquille place le conteneur au centre de l'écran : on ramène le monde
       à l'origine, pour raisonner en coordonnées d'écran partout ailleurs. */
    this.monde.position.set(-this.largeur / 2, -this.hauteur / 2);
    this.scene.filterArea = new Rectangle(0, 0, this.largeur, this.hauteur);
    this.camera.redimensionner(this.largeur, this.hauteur);
    this.meteo.redimensionner(this.largeur, this.hauteur);
    this.minicarte.redimensionner(this.largeur, this.hauteur);
    this.peindreFond();
    this.peindreRose();
    this.peindreEchelle();
  }

  update(dtMs: number): void {
    if (this.detruit) return;
    const debutImage = performance.now();

    if (this.economie) {
      /* Mode économie : une image utile sur deux, soit 30 par seconde. */
      this.retard += dtMs;
      if (this.retard < 32) return;
      dtMs = this.retard;
      this.retard = 0;
    }

    this.temps += dtMs / 1000;

    if (this.souris && this.pointeurs.size === 0) this.camera.bords(this.souris, dtMs);
    this.camera.avancer(dtMs);
    this.jetons.avancer(dtMs);

    const v = this.cadrage();

    this.terrain.majVue(v);
    this.terrain.peindreEnAttente(this.economie ? 4 : BUDGET_PEINTURE, v);
    this.decor.majVue(v);
    this.decor.animer(v, this.temps, this.deps.reducedMotion);
    this.voile.majVue(v);
    this.voileSecours?.majVue(v);
    const connu = (col: number, row: number): number => this.voile.niveauCase(col, row);
    this.objets.majVue(v, this.temps, connu);
    this.perles.majVue(v, this.temps);
    this.jetons.majVue(v, this.temps, this.selection?.kind === 'heros' ? this.selection.uid : null, this.deps.reducedMotion);
    this.meteo.animer(dtMs);
    this.minicarte.majVue(v, dtMs);
    this.peindreSurbrillance(v);

    if (this.postfx) {
      this.postfx.regler({
        temps: this.temps,
        largeur: this.largeur,
        hauteur: this.hauteur,
        ancreX: v.col * v.zoom,
        ancreY: v.row * v.zoom,
        brouillard: this.fogAffiche !== null,
        fogRect: this.voile.rectangle,
      });
    }

    const duree = performance.now() - debutImage;
    this.imagesMesurees += 1;
    this.cumulImageMs += duree;
    if (duree > this.pireImageMs) this.pireImageMs = duree;
    if (!this.rapportFait && this.imagesMesurees >= 180) {
      this.rapportFait = true;
      const t = this.terrain.stats;
      console.info(
        `[carte] ${this.imagesMesurees} images · moyenne ${(this.cumulImageMs / this.imagesMesurees).toFixed(2)} ms · pire ${this.pireImageMs.toFixed(2)} ms · ` +
          `blocs ${t.blocs} (moyenne ${t.moyenneMs} ms, dernier ${t.dernierMs} ms, cache ${t.enCache}) · décor ${this.decor.nombreVisible}`,
      );
    }
  }

  destroy(): void {
    if (this.detruit) return;
    this.detruit = true;
    this.desabonner?.();
    this.desabonner = null;
    for (const d of this.detacher) d();
    this.detacher.length = 0;
    this.terrain.destroy();
    this.decor.destroy();
    this.objets.destroy();
    this.jetons.destroy();
    this.perles.destroy();
    this.minicarte.destroy();
    this.meteo.destroy();
    this.voile.destroy();
    this.voileSecours?.destroy();
    this.scene.filters = [];
    this.postfx?.destroy();
    this.container.destroy({ children: true });
  }

  /* ────────────────────────────── Habillage ────────────────────────────── */

  /** Ce qui existe hors de la grille : une mer de brume, jamais un aplat. */
  private peindreFond(): void {
    const g = this.fondHorsCarte;
    g.clear();
    const bandes = 44;
    for (let i = 0; i < bandes; i += 1) {
      const t = i / (bandes - 1);
      const y0 = Math.round((this.hauteur * i) / bandes);
      const y1 = Math.round((this.hauteur * (i + 1)) / bandes);
      g.rect(0, y0, this.largeur, y1 - y0).fill({
        color: melanger(melanger(PALETTE.bleuProfond, PALETTE.bleuBrume, 0.25), PALETTE.granitAnthracite, t * 0.7),
      });
    }
    g.poly([0, 0, this.largeur * 0.6, 0, 0, this.hauteur * 0.72]).fill({
      color: LIGHT.chaude,
      alpha: 0.05,
    });
  }

  /** Rose des vents : le nord, et le soleil à 315°, pour lire les ombres. */
  private peindreRose(): void {
    const g = this.rose;
    g.clear();
    const r = 34;
    const x = this.largeur - r - 26;
    const y = r + 26;
    g.circle(x + 2, y + 3, r).fill({ color: LIGHT.ombrePortee, alpha: 0.34 });
    g.circle(x, y, r).fill({ color: melanger(PALETTE.parcheminOmbre, PALETTE.brunFougere, 0.3), alpha: 0.9 });
    for (let i = 0; i < 8; i += 1) {
      const t = i / 7;
      g.rect(x - r, y - r + t * 2 * r, 2 * r, (2 * r) / 8 + 1).fill({
        color: melanger(PALETTE.parchemin, PALETTE.brunFougere, t * 0.6),
        alpha: 0.22,
      });
    }
    g.circle(x, y, r).stroke({ color: PALETTE.vieilOr, width: 2, alpha: 0.85 });
    g.circle(x, y, r * 0.78).stroke({ color: PALETTE.vieilOr, width: 1, alpha: 0.5 });
    /* L'aiguille : pointe claire au nord, contrepoids grenat au sud. */
    g.poly([x, y - r * 0.72, x + r * 0.17, y, x, y + r * 0.1, x - r * 0.17, y]).fill({
      color: melanger(PALETTE.parchemin, LIGHT.chaude, 0.4),
    });
    g.poly([x, y + r * 0.72, x + r * 0.17, y, x, y - r * 0.1, x - r * 0.17, y]).fill({
      color: melanger(PALETTE.grenat, PALETTE.encre, 0.2),
    });
    g.poly([x, y - r * 0.72, x + r * 0.17, y, x, y + r * 0.1, x - r * 0.17, y]).stroke({
      color: LIGHT.rim,
      width: 1,
      alpha: LIGHT.rimAlpha,
    });
    /* Le soleil, au nord-ouest, à 315°. */
    const a = (315 * Math.PI) / 180;
    const sx = x + Math.sin(a) * r * 0.88;
    const sy = y - Math.cos(a) * r * 0.88;
    g.circle(sx, sy, 4.5).fill({ color: LIGHT.chaude, alpha: 0.95 });
    g.circle(sx, sy, 7).stroke({ color: PALETTE.vieilOr, width: 1, alpha: 0.6 });
  }

  /** Échelle : la grille du Forez est à ~48 m la case. */
  private peindreEchelle(): void {
    this.echelle.removeChildren().forEach((c) => c.destroy());
    const g = new Graphics();
    const cases = 1000 / 48;
    const x = this.largeur - 26;
    const y = this.hauteur - 26;
    const l = borne(cases * this.camera.etat.zoom, 60, 220);
    g.rect(x - l, y - 7, l, 7).fill({ color: PALETTE.parchemin, alpha: 0.22 });
    for (let i = 0; i < 4; i += 1) {
      g.rect(x - l + (i * l) / 4, y - 7, l / 4, 7).fill({
        color: i % 2 === 0 ? PALETTE.encre : PALETTE.parchemin,
        alpha: 0.72,
      });
    }
    g.rect(x - l, y - 7, l, 7).stroke({ color: PALETTE.vieilOr, width: 1, alpha: 0.75 });
    this.echelle.addChild(g);
    const texte = new Text({
      text: '1 km',
      style: new TextStyle({
        fontFamily: '"Alegreya Sans", system-ui, sans-serif',
        fontSize: 13,
        fontWeight: '700',
        letterSpacing: 0.6,
        fill: PALETTE.parchemin,
        stroke: { color: melanger(PALETTE.encre, PALETTE.bleuProfond, 0.4), width: 3, join: 'round' },
      }),
    });
    texte.anchor.set(1, 1);
    texte.position.set(x, y - 9);
    texte.resolution = 2;
    this.echelle.addChild(texte);
    /* L'échelle est masquée par la minicarte : on la remonte au-dessus d'elle. */
    this.echelle.position.set(0, -this.minicarteHauteur() - 10);
  }

  private minicarteHauteur(): number {
    return borne(this.hauteur * 0.34, 130, 300) + 22;
  }

  /** Liseré doré de la sélection et halo discret du survol. */
  private peindreSurbrillance(v: Cadrage): void {
    const g = this.surbrillance;
    g.clear();
    const z = v.zoom;

    if (this.survolCase) {
      const x = xEcran(v, this.survolCase.col);
      const y = yEcran(v, this.survolCase.row);
      g.rect(x + 1, y + 1, z - 2, z - 2).fill({ color: LIGHT.chaude, alpha: 0.09 });
      g.rect(x + 1, y + 1, z - 2, z - 2).stroke({ color: PALETTE.vieilOr, width: 1.2, alpha: 0.5 });
    }

    const sel = this.selection;
    if (!sel) return;
    let cible: MapCoord | null = null;
    if (sel.kind === 'case') cible = sel.at;
    else if (sel.kind === 'heros') {
      const h = this.etat?.heroes[sel.uid];
      cible = h ? h.at : null;
    } else if (sel.kind === 'cite') {
      const t = this.etat?.towns[sel.uid];
      cible = t ? t.at : null;
    } else if (sel.kind === 'objet') {
      const o = this.deps.world.objects.find((q) => q.uid === sel.uid);
      cible = o ? o.at : null;
    }
    if (!cible) return;
    const x = xEcran(v, cible.col + 0.5);
    const y = yEcran(v, cible.row + 0.5);
    const r = z * 0.62;
    const pulsation = this.deps.reducedMotion ? 1 : 1 + Math.sin(this.temps * 2.2) * 0.04;
    g.ellipse(x, y, r * pulsation, r * 0.5 * pulsation).stroke({
      color: PALETTE.vieilOr,
      width: Math.max(1.5, z * 0.09),
      alpha: 0.9,
    });
    g.ellipse(x, y, r * 1.2 * pulsation, r * 0.6 * pulsation).stroke({
      color: LIGHT.chaude,
      width: Math.max(1, z * 0.04),
      alpha: 0.4,
    });
    /* Quatre équerres d'enluminure, pour ne pas laisser un cercle nu. */
    for (const [sx, sy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const) {
      const ex = x + sx * r * 1.32;
      const ey = y + sy * r * 0.72;
      g.moveTo(ex - sx * z * 0.16, ey).lineTo(ex, ey).lineTo(ex, ey - sy * z * 0.1);
      g.stroke({ color: PALETTE.vieilOr, width: Math.max(1, z * 0.06), alpha: 0.85, cap: 'round' });
    }
  }

  /* ────────────────────────────── Interaction ──────────────────────────── */

  /* `MouseEvent` et non `PointerEvent | WheelEvent` : les deux en héritent, et
     le clic droit arrive en `MouseEvent` nu. Seules `clientX`/`clientY` sont
     lues, qui sont déclarées là. */
  private point(e: MouseEvent): { x: number; y: number } {
    const rect = this.deps.app.canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private brancherEntrees(): void {
    const canvas = this.deps.app.canvas;
    if (!canvas || typeof canvas.addEventListener !== 'function') return;

    const surDown = (e: PointerEvent): void => {
      const p = this.point(e);
      if (e.button === 2) {
        this.previewInterne = null;
        this.majPerles();
        return;
      }
      if (this.minicarte.contient(p.x, p.y)) {
        this.minicarteSaisie = true;
        this.camera.centrer(this.minicarte.versCarte(p.x, p.y), { animate: true });
        return;
      }
      this.camera.arreter();
      this.pointeurs.set(e.pointerId, {
        id: e.pointerId,
        x: p.x,
        y: p.y,
        x0: p.x,
        y0: p.y,
        t0: performance.now(),
        glisse: false,
        tactile: e.pointerType === 'touch',
      });
      if (this.pointeurs.size === 2) this.pinceEcart = this.ecartPince();
      canvas.setPointerCapture?.(e.pointerId);
    };

    const surMove = (e: PointerEvent): void => {
      const p = this.point(e);
      if (e.pointerType !== 'touch') this.souris = p;
      if (this.minicarteSaisie) {
        this.camera.centrer(this.minicarte.versCarte(p.x, p.y), { animate: false });
        return;
      }
      const suivi = this.pointeurs.get(e.pointerId);
      if (!suivi) {
        this.majSurvol(p);
        return;
      }
      const dx = p.x - suivi.x;
      const dy = p.y - suivi.y;
      suivi.x = p.x;
      suivi.y = p.y;
      if (Math.hypot(p.x - suivi.x0, p.y - suivi.y0) > SEUIL_GLISSEMENT) suivi.glisse = true;

      if (this.pointeurs.size === 2) {
        const ecart = this.ecartPince();
        if (this.pinceEcart > 0 && ecart > 0) {
          this.camera.zoomer(ecart / this.pinceEcart, this.centrePince());
        }
        this.pinceEcart = ecart;
        for (const q of this.pointeurs.values()) q.glisse = true;
        return;
      }
      if (suivi.glisse) {
        this.camera.glisser(dx, dy);
        this.vitesseX = dx;
        this.vitesseY = dy;
        this.dernierMove = performance.now();
      }
    };

    const surUp = (e: PointerEvent): void => {
      if (this.minicarteSaisie) {
        this.minicarteSaisie = false;
        return;
      }
      const suivi = this.pointeurs.get(e.pointerId);
      this.pointeurs.delete(e.pointerId);
      canvas.releasePointerCapture?.(e.pointerId);
      if (this.pointeurs.size < 2) this.pinceEcart = 0;
      if (!suivi) return;
      const duree = performance.now() - suivi.t0;
      const p = this.point(e);
      if (suivi.glisse) {
        /* Inertie : on prolonge le geste, amorti par la caméra. */
        const ecoule = performance.now() - this.dernierMove;
        if (ecoule < 90) {
          const z = this.camera.etat.zoom;
          this.camera.lancer((-this.vitesseX / z) * 12, (-this.vitesseY / z) * 12);
        }
        return;
      }
      if (suivi.tactile && duree >= APPUI_LONG_MS) {
        /* Appui long : on informe, on n'agit pas. C'est le clic droit de HMM3. */
        this.majSurvol(p);
        this.inspecter(p);
        return;
      }
      this.cliquer(p);
    };

    const surLeave = (): void => {
      this.souris = null;
      this.survolCase = null;
      this.survolObjet = null;
      this.objets.survoler(null);
      this.deps.onHoverCell?.(null);
    };

    const surMolette = (e: WheelEvent): void => {
      e.preventDefault();
      const p = this.point(e);
      const pas = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.camera.zoomer(Math.exp(-pas * 0.0016), p);
    };

    /* Clic droit : le geste d'information de HMM3, à la souris. Il ne déplace
       rien et n'ouvre jamais le menu du navigateur. */
    const surMenu = (e: Event): void => {
      e.preventDefault();
      if (e instanceof MouseEvent) this.inspecter(this.point(e));
    };

    canvas.addEventListener('pointerdown', surDown);
    canvas.addEventListener('pointermove', surMove);
    canvas.addEventListener('pointerup', surUp);
    canvas.addEventListener('pointercancel', surUp);
    canvas.addEventListener('pointerleave', surLeave);
    canvas.addEventListener('wheel', surMolette, { passive: false });
    canvas.addEventListener('contextmenu', surMenu);
    this.detacher.push(() => {
      canvas.removeEventListener('pointerdown', surDown);
      canvas.removeEventListener('pointermove', surMove);
      canvas.removeEventListener('pointerup', surUp);
      canvas.removeEventListener('pointercancel', surUp);
      canvas.removeEventListener('pointerleave', surLeave);
      canvas.removeEventListener('wheel', surMolette);
      canvas.removeEventListener('contextmenu', surMenu);
    });
  }

  private vitesseX = 0;
  private vitesseY = 0;
  private dernierMove = 0;

  private ecartPince(): number {
    const liste = [...this.pointeurs.values()];
    if (liste.length < 2) return 0;
    return Math.hypot(liste[0].x - liste[1].x, liste[0].y - liste[1].y);
  }

  private centrePince(): { x: number; y: number } {
    const liste = [...this.pointeurs.values()];
    if (liste.length < 2) return { x: this.largeur / 2, y: this.hauteur / 2 };
    return { x: (liste[0].x + liste[1].x) / 2, y: (liste[0].y + liste[1].y) / 2 };
  }

  private majSurvol(p: { x: number; y: number }): void {
    const v = this.cadrage();
    const at = this.cellAt(p.x, p.y);
    const memeCase =
      (at === null && this.survolCase === null) ||
      (at !== null && this.survolCase !== null && at.col === this.survolCase.col && at.row === this.survolCase.row);
    if (!memeCase) {
      this.survolCase = at;
      this.deps.onHoverCell?.(at);
    }
    const objet = this.objets.objetSous(v, p.x, p.y);
    const uid = objet ? objet.uid : null;
    if (uid !== this.survolObjet) {
      this.survolObjet = uid;
      this.objets.survoler(uid);
    }
  }

  /**
   * L'ACTION L'EMPORTE SUR L'INFORMATION.
   *
   * Le rythme reste celui de HMM3 — **premier appui prévisualise, second
   * confirme**, aucun déplacement au premier appui, jamais. Ce qui change,
   * c'est qu'un appui court n'ouvre plus de fiche quand il y a quelque chose à
   * faire.
   *
   * **Le défaut corrigé, mesuré sur iPhone dans une vraie partie.** Toucher
   * son héros appelait `onPickHero`, la coquille en tirait un carton
   * d'inspection couvrant 45 % de la carte, posé juste au-dessus de l'endroit
   * où il fallait toucher ensuite. Le propriétaire : « dès que je veux cliquer
   * sur un endroit pour que le héros s'y rende, cela ouvre la vignette de
   * l'endroit et cache la carte ». Trois appuis sont nécessaires pour marcher
   * — choisir, viser, confirmer — et le premier des trois masquait les deux
   * suivants.
   *
   * La règle est donc : on tente d'AGIR ; on n'informe que si rien n'était
   * faisable. L'appui long, lui, informe toujours (`inspecter`).
   */
  private cliquer(p: { x: number; y: number }): void {
    const v = this.cadrage();
    const at = this.cellAt(p.x, p.y);

    /* 1 — son propre héros : on le choisit, et c'est tout. La fiche viendra
       d'un appui long, si le joueur la demande. */
    const heros = this.jetons.jetonSous(v, p.x, p.y);
    if (heros && at) {
      const hero = this.etat?.heroes[heros];
      this.previewInterne = null;
      this.majPerles();
      this.deps.onPickHero?.(heros, hero ? hero.at : at);
      return;
    }

    /* 2 — une route est possible vers cette case : on la trace, ou on part.
       Cela vaut aussi bien pour une case nue que pour une garde, une mine ou
       une cité : dans HMM3 on marche DESSUS, et c'est le geste le plus
       fréquent de toute la partie. */
    if (at && this.essayerChemin(at)) return;

    /* 3 — rien à faire ici : alors seulement, on informe. */
    const objet = this.objets.objetSous(v, p.x, p.y);
    if (objet) {
      const townUid = objet.data?.townUid as string | undefined;
      if (townUid && this.etat?.towns?.[townUid]) {
        this.deps.onPickTown?.(townUid, objet.at);
        this.deps.onInspect?.({ kind: 'cite', uid: townUid as TownUid, at: objet.at });
      } else {
        this.deps.onPickObject?.(objet);
        this.deps.onInspect?.({ kind: 'objet', object: objet });
      }
      return;
    }

    if (!at) return;
    this.deps.onPickCell?.(at);
  }

  /**
   * Le geste d'INFORMATION : appui long au doigt, clic droit à la souris.
   *
   * Il n'agit jamais. Il ne consomme ni la sélection ni la route en cours :
   * on doit pouvoir demander « qui garde ce pont ? » au milieu d'un tracé
   * sans perdre le tracé.
   */
  private inspecter(p: { x: number; y: number }): void {
    const v = this.cadrage();
    const at = this.cellAt(p.x, p.y);

    const heros = this.jetons.jetonSous(v, p.x, p.y);
    if (heros) {
      const hero = this.etat?.heroes[heros];
      this.deps.onInspect?.({ kind: 'heros', uid: heros, at: hero ? hero.at : (at ?? { col: 0, row: 0 }) });
      return;
    }

    const objet = this.objets.objetSous(v, p.x, p.y);
    if (objet) {
      const townUid = objet.data?.townUid as string | undefined;
      if (townUid && this.etat?.towns?.[townUid]) {
        this.deps.onInspect?.({ kind: 'cite', uid: townUid as TownUid, at: objet.at });
      } else {
        this.deps.onInspect?.({ kind: 'objet', object: objet });
      }
      return;
    }

    if (at) this.deps.onInspect?.({ kind: 'case', at });
  }

  /** Vrai si `at` est déjà la destination prévisualisée. */
  private previewVers(at: MapCoord | null): boolean {
    const p = this.preview;
    return !!p && !!at && p.to.col === at.col && p.to.row === at.row;
  }

  /**
   * Prévisualise, puis confirme. Le calcul appartient au moteur : la vue se
   * borne à appeler `computePath` / `pathDays` et à émettre `MoveHero`.
   */
  private essayerChemin(at: MapCoord): boolean {
    const state = this.etat;
    if (!state) return false;
    const hero = this.herosActif();
    if (!hero) return false;
    if (hero.at.col === at.col && hero.at.row === at.row) return false;

    const p = this.preview;
    if (p && p.hero === hero.uid && p.to.col === at.col && p.to.row === at.row) {
      /* Second clic sur la même case : on met le héros en route. */
      this.previewInterne = null;
      this.deps.dispatch({ type: 'MoveHero', hero: hero.uid, to: at });
      this.majPerles();
      return true;
    }
    const trouve = this.calculerChemin(state, hero, at);
    if (!trouve) return false;
    this.previewInterne = trouve;
    this.previewExterne = null;
    this.majPerles();
    return true;
  }

  private herosActif(): HeroInstance | null {
    const state = this.etat;
    if (!state) return null;
    if (this.selection?.kind === 'heros') {
      const h = state.heroes[this.selection.uid];
      if (h && h.owner === this.deps.localPlayer) return h;
    }
    return null;
  }

  private calculerChemin(state: GameState, hero: HeroInstance, to: MapCoord): PathPreview | null {
    try {
      const trouve = computePath(this.deps.world, state, hero, to);
      if (!trouve || trouve.path.length === 0) return null;
      const stats = heroStats(state, hero);
      const jours = pathDays(trouve.costs, hero.movement, stats.movementMax);
      let aujourdhui = 0;
      for (const j of jours) {
        if (j === 0) aujourdhui += 1;
      }
      return {
        hero: hero.uid,
        to,
        path: trouve.path,
        costs: trouve.costs,
        days: jours,
        reachableToday: aujourdhui,
        confirmed: false,
      };
    } catch (cause) {
      console.warn('[carte] chemin introuvable.', cause);
      return null;
    }
  }

  /* ───────────────────────── Cadrage initial ───────────────────────────── */

  /** Peint le premier écran avant que la fabrique ne rende la main. */
  preparer(): void {
    this.cadrerAuDepart();
    const v = this.cadrage();
    this.terrain.majVue(v);
    this.terrain.toutPeindre(v, 24);
    this.decor.majVue(v);
    this.decor.animer(v, 0, true);
    this.voile.majVue(v);
    this.voileSecours?.majVue(v);
    this.objets.majVue(v, 0, (c, r) => this.voile.niveauCase(c, r));
    this.jetons.majVue(v, 0, null, true);
    this.minicarte.majVue(v, 1000);
    this.premierCadrage = false;
    this.cheminDeDemonstration();
  }

  /**
   * Cadrage de départ. En jeu, on se pose sur le point demandé. Sur une route
   * de démonstration, on élargit juste ce qu'il faut pour que la Maison du
   * Trésor **et** les bannières du joueur local tiennent dans le tableau.
   */
  private cadrerAuDepart(): void {
    const focus = this.deps.focus ?? { col: Math.floor(this.deps.world.cols / 2), row: Math.floor(this.deps.world.rows / 2) };
    if (!this.deps.demo || !this.etat) {
      this.camera.poser({ col: focus.col + 0.5, row: focus.row + 0.5, zoom: ZOOM_DEFAUT });
      return;
    }
    const points: MapCoord[] = [focus];
    const joueur = this.etat.players[this.deps.localPlayer];
    if (joueur) {
      for (const uid of joueur.heroes) {
        const h = this.etat.heroes[uid];
        if (h) points.push(h.at);
      }
      for (const uid of joueur.towns) {
        const t = this.etat.towns[uid];
        if (t) points.push(t.at);
      }
    }
    let c0 = Infinity;
    let c1 = -Infinity;
    let r0 = Infinity;
    let r1 = -Infinity;
    for (const p of points) {
      if (Math.abs(p.col - focus.col) > 110 || Math.abs(p.row - focus.row) > 110) continue;
      c0 = Math.min(c0, p.col);
      c1 = Math.max(c1, p.col);
      r0 = Math.min(r0, p.row);
      r1 = Math.max(r1, p.row);
    }
    if (!Number.isFinite(c0)) {
      this.camera.poser({ col: focus.col + 0.5, row: focus.row + 0.5, zoom: ZOOM_DEFAUT });
      return;
    }
    const marge = 7;
    const largeurCases = c1 - c0 + marge * 2;
    const hauteurCases = r1 - r0 + marge * 2;
    const zoom = borne(
      Math.min(this.largeur / Math.max(1, largeurCases), this.hauteur / Math.max(1, hauteurCases)),
      15,
      26,
    );
    this.camera.poser({ col: (c0 + c1) / 2 + 0.5, row: (r0 + r1) / 2 + 0.5, zoom });
  }

  /**
   * Sur `#/demo/carte`, la route exige un chemin affiché avec ses marqueurs de
   * journée (docs/03-ROUTES.md). L'état de démonstration n'en pose aucun : on
   * en trace un, du héros du joueur local vers la Maison du Trésor, calculé par
   * le moteur et jamais appliqué.
   */
  private cheminDeDemonstration(): void {
    if (!this.deps.demo || !this.etat || this.preview) return;
    const joueur = this.etat.players[this.deps.localPlayer];
    const uid = joueur?.heroes[0];
    const hero = uid ? this.etat.heroes[uid] : null;
    if (!hero) return;
    const cible = this.deps.focus ?? { col: hero.at.col - 18, row: hero.at.row };
    const candidats: MapCoord[] = [
      { col: Math.round((hero.at.col * 0.45 + cible.col * 0.55)), row: Math.round((hero.at.row * 0.45 + cible.row * 0.55)) },
      { col: Math.round((hero.at.col + cible.col) / 2), row: Math.round((hero.at.row + cible.row) / 2) },
      cible,
    ];
    for (const c of candidats) {
      const trouve = this.calculerChemin(this.etat, hero, c);
      if (trouve && trouve.path.length > 4) {
        this.previewInterne = trouve;
        this.majPerles();
        this.selection = { kind: 'heros', uid: hero.uid };
        return;
      }
    }
  }

  get premier(): boolean {
    return this.premierCadrage;
  }
}

/* ────────────────────────────── La fabrique ─────────────────────────────── */

/**
 * Fabrique de la carte d'aventure. **Signature imposée** par
 * `apps/client/src/view-contract.ts` : ne pas la changer.
 */
export async function createMapView(deps: MapViewDeps): Promise<MapView> {
  const vue = new CarteAventure(deps);
  vue.resize(deps.width, deps.height);
  vue.preparer();
  return vue;
}

export type { MapView, MapViewDeps } from '../view-contract.js';
export { ZOOM_MIN, ZOOM_MAX, ZOOM_DEFAUT } from './camera.js';
