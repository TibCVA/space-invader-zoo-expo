/**
 * `apps/client/src/render` — RENDU DE LA CARTE D'AVENTURE.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  SQUELETTE. Ce fichier respecte déjà le contrat de                   │
 * │  `apps/client/src/view-contract.ts` et se monte réellement : il       │
 * │  affiche un panneau « en construction » peint en PixiJS.              │
 * │                                                                      │
 * │  L'agent du rendu de carte remplace le CORPS de `createMapView`, sans │
 * │  toucher ni à la signature, ni à l'interface `MapView`, ni aux noms   │
 * │  exportés. Tout le reste du client est déjà branché dessus.           │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * Ce qui est attendu à la place de ce squelette (bible artistique §4) :
 * blocs de 32 × 32 cases peints une fois en `RenderTexture` à 12 px/case,
 * hillshade calculé sur le MNT réel, props triés en profondeur, brouillard à
 * trois états aux frontières adoucies, perles dorées de chemin avec fanions de
 * jour, et un unique filtre de post-traitement.
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import type { GameEvent, GameState, MapCoord, PlayerId } from '@auvergne/engine';
import type { MapCamera, MapView, MapViewDeps } from '../view-contract.js';
import type { PathPreview, Selection } from '../state/types.js';

/** Zoom par défaut, en pixels par case. */
const ZOOM_DEFAUT = 26;
const ZOOM_MIN = 8;
const ZOOM_MAX = 64;

/* ─────────────────────────── Panneau de chantier ────────────────────────── */

const PARCHEMIN = 0xe8dcc0;
const PARCHEMIN_OMBRE = 0xc9b996;
const ENCRE = 0x241c14;
const OR = 0xc9a227;
const OMBRE_BLEUTEE = 0x2a3242;

/**
 * Le panneau provisoire : parchemin biseauté, double filet d'or, titre en
 * Cinzel majuscule. Aucun aplat — trois strates de valeur, ombre bleutée.
 */
function panneauChantier(titre: string, lignes: readonly string[]): Container {
  const racine = new Container();
  racine.label = 'chantier';

  const largeur = 560;
  const hauteur = 260;
  const x = -largeur / 2;
  const y = -hauteur / 2;

  const fond = new Graphics();
  fond.roundRect(x + 6, y + 8, largeur, hauteur, 3).fill({ color: OMBRE_BLEUTEE, alpha: 0.34 });
  fond.roundRect(x, y, largeur, hauteur, 3).fill(PARCHEMIN);
  /* Strate 2 : variation de valeur, du nord-ouest éclairé au sud-est ombré. */
  for (let i = 0; i < 14; i += 1) {
    const t = i / 13;
    fond
      .rect(x, y + t * hauteur, largeur, hauteur / 14 + 1)
      .fill({ color: PARCHEMIN_OMBRE, alpha: 0.06 + t * 0.1 });
  }
  /* Strate 3 : grain discret, semé de façon déterministe. */
  for (let i = 0; i < 220; i += 1) {
    const a = (i * 2654435761) % 4294967296;
    const px = x + ((a >>> 8) % largeur);
    const py = y + ((a >>> 3) % hauteur);
    fond.rect(px, py, 1, 1).fill({ color: ENCRE, alpha: 0.05 });
  }
  /* Biseau : clair en haut, sombre en bas. */
  fond.rect(x, y, largeur, 2).fill({ color: 0xffe9c2, alpha: 0.5 });
  fond.rect(x, y + hauteur - 2, largeur, 2).fill({ color: OMBRE_BLEUTEE, alpha: 0.4 });
  /* Double filet d'or. */
  fond.roundRect(x, y, largeur, hauteur, 3).stroke({ color: OR, width: 2, alpha: 0.75 });
  fond.roundRect(x + 7, y + 7, largeur - 14, hauteur - 14, 2).stroke({ color: OR, width: 1, alpha: 0.5 });
  racine.addChild(fond);

  const styleTitre = new TextStyle({
    fontFamily: 'Cinzel, Georgia, serif',
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: 2.2,
    fill: ENCRE,
    align: 'center',
  });
  const texteTitre = new Text({ text: titre.toUpperCase(), style: styleTitre });
  texteTitre.anchor.set(0.5, 0);
  texteTitre.position.set(0, y + 34);
  racine.addChild(texteTitre);

  const filet = new Graphics();
  filet.moveTo(-52, y + 76).lineTo(52, y + 76).stroke({ color: OR, width: 1.4, alpha: 0.8 });
  filet.poly([0, y + 70, 7, y + 76, 0, y + 82, -7, y + 76]).fill({ color: OR, alpha: 0.9 });
  racine.addChild(filet);

  const styleCorps = new TextStyle({
    fontFamily: '"EB Garamond", Georgia, serif',
    fontSize: 18,
    fill: 0x4c3f2f,
    align: 'center',
    wordWrap: true,
    wordWrapWidth: largeur - 88,
    lineHeight: 27,
  });
  const corps = new Text({ text: lignes.join('\n'), style: styleCorps });
  corps.anchor.set(0.5, 0);
  corps.position.set(0, y + 98);
  racine.addChild(corps);

  return racine;
}

/* ───────────────────────────── Le squelette ─────────────────────────────── */

class SqueletteCarte implements MapView {
  readonly container = new Container();

  private readonly fond = new Graphics();
  private readonly chantier: Container;
  private camera: MapCamera;
  private largeur = 1;
  private hauteur = 1;
  private temps = 0;
  private detruit = false;

  constructor(private readonly deps: MapViewDeps) {
    this.container.label = 'carte-aventure';
    this.container.addChild(this.fond);

    const focus = deps.focus ?? { col: 145, row: 113 };
    this.camera = { col: focus.col, row: focus.row, zoom: ZOOM_DEFAUT };

    this.chantier = panneauChantier("Carte d'aventure", [
      'Le relief du Forez, les routes, le brouillard et les perles de chemin',
      'sont peints par le module de rendu de carte.',
      'Cette vue respecte déjà le contrat : caméra, sélection, chemin, voile.',
    ]);
    this.container.addChild(this.chantier);
  }

  /* — Caméra — */

  getCamera(): MapCamera {
    return this.camera;
  }

  setCamera(camera: Partial<MapCamera>): void {
    const zoom = camera.zoom ?? this.camera.zoom;
    this.camera = {
      col: camera.col ?? this.camera.col,
      row: camera.row ?? this.camera.row,
      zoom: Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom)),
    };
    this.deps.onCameraChange?.(this.camera);
  }

  centerOn(at: MapCoord, options?: { animate?: boolean; zoom?: number }): void {
    this.setCamera({ col: at.col, row: at.row, zoom: options?.zoom });
  }

  panBy(dxPixels: number, dyPixels: number): void {
    this.setCamera({
      col: this.camera.col - dxPixels / this.camera.zoom,
      row: this.camera.row - dyPixels / this.camera.zoom,
    });
  }

  zoomBy(factor: number): void {
    this.setCamera({ zoom: this.camera.zoom * factor });
  }

  /* — Sélection, chemin, brouillard — */

  setSelection(_selection: Selection | null): void {
    /* Le squelette n'a rien à surligner : la sélection reste dans le magasin. */
  }

  setPathPreview(_preview: PathPreview | null): void {
    /* Les perles de chemin appartiennent au rendu définitif. */
  }

  refreshFog(_player: PlayerId): void {
    /* Le masque de brouillard appartient au rendu définitif. */
  }

  sync(_state: GameState): void {
    /* Rien à relire tant que la carte n'est pas peinte. */
  }

  async playEvents(_events: readonly GameEvent[]): Promise<void> {
    /* Aucune animation : la file est considérée comme jouée. */
  }

  /* — Conversions — */

  cellAt(x: number, y: number): MapCoord | null {
    const col = Math.floor(this.camera.col + (x - this.largeur / 2) / this.camera.zoom);
    const row = Math.floor(this.camera.row + (y - this.hauteur / 2) / this.camera.zoom);
    if (col < 0 || row < 0 || col >= this.deps.world.cols || row >= this.deps.world.rows) return null;
    return { col, row };
  }

  screenOf(at: MapCoord): { x: number; y: number } {
    return {
      x: this.largeur / 2 + (at.col + 0.5 - this.camera.col) * this.camera.zoom,
      y: this.hauteur / 2 + (at.row + 0.5 - this.camera.row) * this.camera.zoom,
    };
  }

  /* — Cycle de vie — */

  resize(width: number, height: number): void {
    this.largeur = Math.max(1, width);
    this.hauteur = Math.max(1, height);
    this.chantier.position.set(this.largeur / 2, this.hauteur / 2);
    this.peindreFond();
  }

  update(dtMs: number): void {
    if (this.detruit || this.deps.reducedMotion) return;
    /* Loi n°7 : rien n'est parfaitement immobile, rien ne distrait. */
    this.temps += dtMs;
    this.chantier.y = this.hauteur / 2 + Math.sin(this.temps / 2600) * 2;
  }

  destroy(): void {
    if (this.detruit) return;
    this.detruit = true;
    this.container.destroy({ children: true });
  }

  /** Ciel de vallée : dégradé bleuté, jamais un aplat. */
  private peindreFond(): void {
    const g = this.fond;
    g.clear();
    const bandes = 24;
    for (let i = 0; i < bandes; i += 1) {
      const t = i / (bandes - 1);
      const haut = 0x2b3a4a;
      const bas = 0x1a1f26;
      const r = Math.round(((haut >> 16) & 255) * (1 - t) + ((bas >> 16) & 255) * t);
      const v = Math.round(((haut >> 8) & 255) * (1 - t) + ((bas >> 8) & 255) * t);
      const b = Math.round((haut & 255) * (1 - t) + (bas & 255) * t);
      g.rect(0, (this.hauteur * i) / bandes, this.largeur, this.hauteur / bandes + 1).fill(
        (r << 16) | (v << 8) | b,
      );
    }
    /* Voile de lumière du nord-ouest (azimut 315°). */
    g.poly([0, 0, this.largeur * 0.62, 0, 0, this.hauteur * 0.7]).fill({ color: 0xffe9c2, alpha: 0.05 });
  }
}

/* ────────────────────────────── La fabrique ─────────────────────────────── */

/**
 * Fabrique de la carte d'aventure. **Signature imposée** par
 * `apps/client/src/view-contract.ts` : ne pas la changer.
 */
export async function createMapView(deps: MapViewDeps): Promise<MapView> {
  const vue = new SqueletteCarte(deps);
  vue.resize(deps.width, deps.height);
  return vue;
}

export type { MapView, MapViewDeps } from '../view-contract.js';
