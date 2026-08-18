/**
 * `render/props.ts` — le semis du décor : arbres, rochers, murets, bornes, croix.
 *
 * Les silhouettes viennent de l'atlas (`atlas.prop`, `atlas.propAnchor`), donc
 * elles portent déjà les trois strates, le liseré doré et le contour teinté. Le
 * travail ici est celui d'un jardinier : **où** poser, **dans quel ordre**, et
 * **comment** faire vivre.
 *
 *  - dispersion par grille perturbée déterministe (bruit bleu approché) : deux
 *    parties avec la même graine sèment exactement les mêmes arbres ;
 *  - tri en profondeur par ligne : un sapin plus au sud passe devant ;
 *  - ombre portée elliptique orientée au sud-est, bleutée, jamais grise ;
 *  - oscillation d'ambiance par `oscillationProp` : 3 px au plus, 2 à 7 s ;
 *  - perspective atmosphérique : plus la case est haute, plus le décor bleuit.
 */

import { Container, Sprite, Texture } from 'pixi.js';
import type { WorldMap } from '@auvergne/engine';
import type { ArtAtlas, PropKey } from '../art/index.js';
import { oscillationProp } from '../art/props.js';
import { LIGHT, melanger } from '../art/palette.js';
import type { ViewQuality } from '../view-contract.js';
import { TER, alea, borne, xEcran, yEcran } from './commun.js';
import type { Cadrage } from './commun.js';

const BLOC = 32;

/** Hauteur visée de chaque décor, en cases. C'est l'échelle du tableau. */
const HAUTEUR_CASES: Readonly<Record<PropKey, number>> = {
  sapin: 2.05,
  hetre: 1.85,
  buisson: 0.72,
  rocher: 0.86,
  muret: 0.62,
  borne: 0.7,
  croix: 1.05,
  moulin: 2.3,
  pont: 0.9,
  tour: 2.4,
  ferme: 1.5,
  chapelle: 1.7,
  souche: 0.5,
  fougere: 0.58,
};

/** Décors menus, escamotés au zoom lointain (niveau de détail). */
const MENUS: ReadonlySet<PropKey> = new Set<PropKey>(['fougere', 'souche', 'buisson']);

interface Plant {
  readonly key: PropKey;
  readonly variante: number;
  /** position continue en cases, point de contact au sol */
  readonly col: number;
  readonly row: number;
  /** teinte de perspective atmosphérique, déjà calculée */
  readonly teinte: number;
  readonly menu: boolean;
}

/* ─────────────────────────── L'ombre portée ─────────────────────────────── */

let textureOmbre: Texture | null = null;

/**
 * Une ellipse floue, une seule fois pour toute la carte. Teintée en bleu
 * d'ombre (`#2A3242`) : la bible interdit l'ombre grise.
 */
function ombreElliptique(): Texture {
  if (textureOmbre) return textureOmbre;
  const el = document.createElement('canvas');
  el.width = 96;
  el.height = 48;
  const ctx = el.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(48, 24, 2, 48, 24, 46);
    grad.addColorStop(0, 'rgba(255,255,255,0.92)');
    grad.addColorStop(0.55, 'rgba(255,255,255,0.42)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(48, 24, 46, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  textureOmbre = Texture.from(el);
  textureOmbre.source.label = 'ombre_prop';
  return textureOmbre;
}

/* ──────────────────────────────── Le semis ──────────────────────────────── */

export class SemisProps {
  readonly ombres = new Container();
  readonly couche = new Container();

  private readonly blocs = new Map<string, Plant[]>();
  private visibles: Plant[] = [];
  private signature = '';
  private readonly corps: Sprite[] = [];
  private readonly taches: Sprite[] = [];
  private readonly densite: number;

  constructor(
    private readonly world: WorldMap,
    private readonly atlas: ArtAtlas,
    quality: ViewQuality,
  ) {
    this.couche.label = 'decor';
    this.ombres.label = 'ombres-decor';
    this.densite = quality === 'basse' ? 0.45 : quality === 'moyenne' ? 0.75 : 1;
  }

  get nombreVisible(): number {
    return this.visibles.length;
  }

  /* — Génération déterministe d'un bloc — */

  private semerBloc(bx: number, by: number): Plant[] {
    const w = this.world;
    const out: Plant[] = [];
    const col0 = bx * BLOC;
    const row0 = by * BLOC;
    /* Grille perturbée : un candidat par case, décalé par un hachage stable.
       Cela approche un bruit bleu sans coût quadratique. */
    for (let dr = 0; dr < BLOC; dr += 1) {
      const row = row0 + dr;
      if (row < 0 || row >= w.rows) continue;
      for (let dc = 0; dc < BLOC; dc += 1) {
        const col = col0 + dc;
        if (col < 0 || col >= w.cols) continue;
        const index = row * w.cols + col;
        if (w.objectAt[index] !== 0) continue;
        const t = w.terrain[index];
        if (t === TER.eau) continue;
        const tirage = alea(col, row, 101);
        const pente = w.slope[index];
        const alt = w.elevation[index];

        let chance = 0;
        let choix: PropKey = 'buisson';
        switch (t) {
          case TER.foret: {
            chance = 0.62;
            const r = alea(col, row, 211);
            /* Sapinière au-dessus de 950 m, hêtraie plus bas (packages/map). */
            const sapin = alt > 950 ? 0.86 : alt > 800 ? 0.58 : 0.24;
            choix = r < sapin ? 'sapin' : r < sapin + 0.14 ? 'buisson' : 'hetre';
            break;
          }
          case TER.prairie: {
            chance = 0.075;
            const r = alea(col, row, 223);
            choix = r < 0.34 ? 'buisson' : r < 0.58 ? 'rocher' : r < 0.82 ? 'fougere' : 'hetre';
            break;
          }
          case TER.pente: {
            chance = 0.24;
            const r = alea(col, row, 227);
            choix = r < 0.52 ? 'rocher' : r < 0.76 ? 'buisson' : 'sapin';
            break;
          }
          case TER.rocher: {
            chance = 0.34;
            const r = alea(col, row, 229);
            choix = r < 0.78 ? 'rocher' : 'souche';
            break;
          }
          case TER.humide: {
            chance = 0.16;
            const r = alea(col, row, 233);
            choix = r < 0.55 ? 'fougere' : r < 0.82 ? 'souche' : 'buisson';
            break;
          }
          default: {
            /* Le long des voies : bornes armoriées, croix de chemin, murets. */
            chance = 0.05;
            const r = alea(col, row, 239);
            choix = r < 0.36 ? 'borne' : r < 0.62 ? 'croix' : 'muret';
            break;
          }
        }
        if (tirage > chance * this.densite) continue;

        const variante = Math.floor(alea(col, row, 307) * 5);
        const jx = alea(col, row, 401) * 0.86 + 0.07;
        const jy = alea(col, row, 409) * 0.7 + 0.2;
        /* Loi n°5 : l'altitude éloigne, donc désature vers le bleu de brume. */
        const voile = borne((alt - 700) / 2600, 0, 0.24) + borne(pente / 340, 0, 0.05);
        const teinte = melanger(0xffffff, LIGHT.brume, voile);
        out.push({
          key: choix,
          variante,
          col: col + jx,
          row: row + jy,
          teinte,
          menu: MENUS.has(choix),
        });
      }
    }
    out.sort((a, b) => a.row - b.row);
    return out;
  }

  private bloc(bx: number, by: number): Plant[] {
    const cle = `${bx},${by}`;
    let liste = this.blocs.get(cle);
    if (!liste) {
      liste = this.semerBloc(bx, by);
      this.blocs.set(cle, liste);
      if (this.blocs.size > 90) {
        const premier = this.blocs.keys().next();
        if (!premier.done && premier.value !== cle) this.blocs.delete(premier.value);
      }
    }
    return liste;
  }

  /* — Mise à jour de la vue — */

  majVue(v: Cadrage): void {
    const bx0 = Math.max(0, Math.floor((v.col - v.largeur / (2 * v.zoom)) / BLOC) - 1);
    const bx1 = Math.min(
      Math.ceil(this.world.cols / BLOC) - 1,
      Math.floor((v.col + v.largeur / (2 * v.zoom)) / BLOC) + 1,
    );
    const by0 = Math.max(0, Math.floor((v.row - v.hauteur / (2 * v.zoom)) / BLOC) - 1);
    const by1 = Math.min(
      Math.ceil(this.world.rows / BLOC) - 1,
      Math.floor((v.row + v.hauteur / (2 * v.zoom)) / BLOC) + 1,
    );
    const menus = v.zoom >= 13;
    const sig = `${bx0},${bx1},${by0},${by1},${menus ? 1 : 0}`;
    if (sig !== this.signature) {
      this.signature = sig;
      const liste: Plant[] = [];
      for (let by = by0; by <= by1; by += 1) {
        for (let bx = bx0; bx <= bx1; bx += 1) {
          for (const p of this.bloc(bx, by)) {
            if (!menus && p.menu) continue;
            liste.push(p);
          }
        }
      }
      /* Tri en profondeur : la ligne décide, la colonne départage. */
      liste.sort((a, b) => a.row - b.row || a.col - b.col);
      this.visibles = liste;
      this.ajusterPiscine(liste.length);
      this.rehabiller();
    }
  }

  private ajusterPiscine(n: number): void {
    while (this.corps.length < n) {
      const s = new Sprite();
      s.visible = false;
      this.couche.addChild(s);
      this.corps.push(s);
      const o = new Sprite(ombreElliptique());
      o.anchor.set(0.5, 0.5);
      o.tint = LIGHT.ombrePortee;
      o.visible = false;
      this.ombres.addChild(o);
      this.taches.push(o);
    }
    for (let i = n; i < this.corps.length; i += 1) {
      this.corps[i].visible = false;
      this.taches[i].visible = false;
    }
  }

  /** Réassigne textures et ancres après un changement de jeu de blocs. */
  private rehabiller(): void {
    for (let i = 0; i < this.visibles.length; i += 1) {
      const p = this.visibles[i];
      const s = this.corps[i];
      const tex = this.atlas.prop(p.key, p.variante);
      s.texture = tex;
      const ancre = this.atlas.propAnchor(p.key, p.variante);
      s.anchor.set(ancre.x / tex.width, ancre.y / tex.height);
      s.tint = p.teinte;
      s.visible = true;
      const o = this.taches[i];
      o.tint = LIGHT.ombrePortee;
      o.visible = true;
    }
  }

  /** Positionne tout le décor pour l'image courante. */
  animer(v: Cadrage, temps: number, immobile: boolean): void {
    const n = this.visibles.length;
    for (let i = 0; i < n; i += 1) {
      const p = this.visibles[i];
      const s = this.corps[i];
      const tex = s.texture;
      const hauteur = HAUTEUR_CASES[p.key] * v.zoom;
      const echelle = hauteur / Math.max(1, tex.height);
      const x = xEcran(v, p.col);
      const y = yEcran(v, p.row);
      let dx = 0;
      let dy = 0;
      let rot = 0;
      if (!immobile) {
        const osc = oscillationProp(p.key, p.variante, temps, Math.floor(p.col), Math.floor(p.row));
        dx = osc.dx;
        dy = osc.dy;
        rot = osc.rot;
      }
      s.scale.set(echelle);
      s.position.set(x + dx, y + dy);
      s.rotation = rot;

      const o = this.taches[i];
      const largeur = tex.width * echelle * 0.82;
      o.width = largeur;
      o.height = largeur * 0.42;
      /* Loi n°2 : l'ombre part au sud-est, longueur = hauteur × 1,28. */
      o.position.set(x + hauteur * 0.1, y + hauteur * 0.045);
      o.alpha = LIGHT.ombrePorteeAlpha;
    }
  }

  destroy(): void {
    this.couche.destroy({ children: true });
    this.ombres.destroy({ children: true });
    this.blocs.clear();
    this.visibles = [];
  }
}
