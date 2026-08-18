/**
 * `render/objects.ts` — ce qui peuple la carte : cités, villages, mines, tas de
 * ressources, artefacts, gardes neutres, bornes armoriées, sanctuaires,
 * auberges, sceaux des Marches et la Maison du Trésor.
 *
 * Chaque objet reçoit son icône d'atlas, une ombre portée elliptique orientée
 * au sud-est, la bannière de son propriétaire quand il en a un, et un liseré
 * doré au survol. Les objets encore inconnus du joueur ne sont pas dessinés :
 * le voile ne suffirait pas à les cacher aux yeux d'un joueur attentif.
 */

import { Container, Graphics, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { GameState, MapObject, MapObjectKind, WorldMap } from '@auvergne/engine';
import type { ArtAtlas } from '../art/index.js';
import { LIGHT, PALETTE, melanger } from '../art/palette.js';
import { borne, xEcran, yEcran } from './commun.js';
import type { Cadrage } from './commun.js';

const BLOC = 32;

/** Taille de chaque famille d'objet, en cases. */
const TAILLE: Readonly<Record<MapObjectKind, number>> = {
  ville: 3.8,
  village: 2.9,
  mine: 2.4,
  ressource: 1.35,
  artefact: 1.4,
  garde: 1.7,
  borne: 1.2,
  sanctuaire: 2.1,
  auberge: 2.3,
  caravane: 1.6,
  sceau: 2.2,
  maison_tresor: 3.5,
  belvedere: 1.7,
  source: 1.5,
  obstacle: 1.5,
  quete: 1.35,
};

/** Objets qui méritent un cartouche de nom dès qu'on est assez près. */
const NOMMES: ReadonlySet<MapObjectKind> = new Set<MapObjectKind>([
  'ville',
  'village',
  'maison_tresor',
  'sceau',
]);

interface Entree {
  objet: MapObject;
  sprite: Sprite;
  ombre: Sprite;
  banniere: Sprite;
  halo: Graphics;
  nom: Text | null;
}

let ombreTexture: Texture | null = null;

function ombreDouce(): Texture {
  if (ombreTexture) return ombreTexture;
  const el = document.createElement('canvas');
  el.width = 96;
  el.height = 48;
  const ctx = el.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(48, 24, 2, 48, 24, 46);
    grad.addColorStop(0, 'rgba(255,255,255,0.95)');
    grad.addColorStop(0.52, 'rgba(255,255,255,0.46)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(48, 24, 46, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ombreTexture = Texture.from(el);
  ombreTexture.source.label = 'ombre_objet';
  return ombreTexture;
}

export class ObjetsCarte {
  readonly ombres = new Container();
  readonly couche = new Container();

  private readonly parBloc = new Map<string, MapObject[]>();
  private readonly entrees = new Map<string, Entree>();
  private etat: GameState | null = null;
  private visibles: MapObject[] = [];
  private survol: string | null = null;

  constructor(
    private readonly world: WorldMap,
    private readonly atlas: ArtAtlas,
  ) {
    this.couche.label = 'objets';
    this.ombres.label = 'ombres-objets';
    for (const objet of world.objects) {
      const cle = `${Math.floor(objet.at.col / BLOC)},${Math.floor(objet.at.row / BLOC)}`;
      const liste = this.parBloc.get(cle);
      if (liste) liste.push(objet);
      else this.parBloc.set(cle, [objet]);
    }
  }

  sync(state: GameState): void {
    this.etat = state;
  }

  survoler(uid: string | null): void {
    this.survol = uid;
  }

  /** État vivant d'un objet : le moteur peut l'avoir capturé ou vidé. */
  private vivant(objet: MapObject): MapObject {
    return this.etat?.objects?.[objet.uid] ?? objet;
  }

  private proprietaire(objet: MapObject): string | null {
    const vif = this.vivant(objet);
    if (vif.owner) return vif.owner;
    const uid = vif.data?.townUid as string | undefined;
    if (uid && this.etat?.towns?.[uid]) return this.etat.towns[uid].owner;
    return null;
  }

  /** L'objet sous un point écran, ou `null`. */
  objetSous(v: Cadrage, x: number, y: number): MapObject | null {
    let trouve: MapObject | null = null;
    let meilleur = Infinity;
    for (const objet of this.visibles) {
      const taille = TAILLE[objet.kind] * v.zoom;
      const cx = xEcran(v, objet.at.col + 0.5);
      const cy = yEcran(v, objet.at.row + 0.9);
      const dx = x - cx;
      const dy = y - (cy - taille * 0.35);
      if (Math.abs(dx) < taille * 0.44 && Math.abs(dy) < taille * 0.45) {
        const d = dx * dx + dy * dy;
        if (d < meilleur) {
          meilleur = d;
          trouve = objet;
        }
      }
    }
    return trouve;
  }

  majVue(v: Cadrage, temps: number, connu: (col: number, row: number) => number): void {
    const bx0 = Math.max(0, Math.floor((v.col - v.largeur / (2 * v.zoom)) / BLOC) - 1);
    const bx1 = Math.floor((v.col + v.largeur / (2 * v.zoom)) / BLOC) + 1;
    const by0 = Math.max(0, Math.floor((v.row - v.hauteur / (2 * v.zoom)) / BLOC) - 1);
    const by1 = Math.floor((v.row + v.hauteur / (2 * v.zoom)) / BLOC) + 1;

    const liste: MapObject[] = [];
    for (let by = by0; by <= by1; by += 1) {
      for (let bx = bx0; bx <= bx1; bx += 1) {
        const bloc = this.parBloc.get(`${bx},${by}`);
        if (!bloc) continue;
        for (const objet of bloc) {
          if (objet.kind === 'obstacle') continue;
          if (connu(objet.at.col, objet.at.row) < 0.22) continue;
          liste.push(objet);
        }
      }
    }
    liste.sort((a, b) => a.at.row - b.at.row || a.at.col - b.at.col);
    this.visibles = liste;

    const vus = new Set<string>();
    for (const objet of liste) {
      vus.add(objet.uid);
      let e = this.entrees.get(objet.uid);
      if (!e) {
        e = this.creer(objet, v);
        this.entrees.set(objet.uid, e);
      }
      this.placer(e, v, temps);
      /* Tri en profondeur : on remonte l'objet au sommet dans l'ordre trié. */
      this.couche.addChild(e.sprite);
      if (e.nom) this.couche.addChild(e.nom);
      this.couche.addChild(e.halo);
      if (e.banniere.visible) this.couche.addChild(e.banniere);
    }
    for (const [uid, e] of this.entrees) {
      if (vus.has(uid)) continue;
      e.sprite.destroy();
      e.ombre.destroy();
      e.banniere.destroy();
      e.halo.destroy();
      e.nom?.destroy();
      this.entrees.delete(uid);
    }
  }

  private creer(objet: MapObject, v: Cadrage): Entree {
    const cle = `carte_${objet.kind}`;
    const texture = this.atlas.hasIcon(cle) ? this.atlas.icon(cle) : this.atlas.icon('carte_borne');
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5, 0.78);
    this.couche.addChild(sprite);

    const ombre = new Sprite(ombreDouce());
    ombre.anchor.set(0.5, 0.5);
    ombre.tint = LIGHT.ombrePortee;
    ombre.alpha = LIGHT.ombrePorteeAlpha;
    this.ombres.addChild(ombre);

    const banniere = new Sprite();
    banniere.anchor.set(0.5, 0.05);
    banniere.visible = false;
    this.couche.addChild(banniere);

    const halo = new Graphics();
    this.couche.addChild(halo);

    let nom: Text | null = null;
    if (NOMMES.has(objet.kind)) {
      const libelle = (objet.data?.name as string | undefined) ?? (objet.data?.label as string | undefined);
      if (libelle) {
        nom = new Text({
          text: libelle,
          style: new TextStyle({
            fontFamily: 'Cinzel, Georgia, serif',
            fontSize: 15,
            fontWeight: '600',
            letterSpacing: 1.4,
            fill: PALETTE.parchemin,
            stroke: { color: melanger(PALETTE.encre, PALETTE.bleuProfond, 0.4), width: 3.4, join: 'round' },
            align: 'center',
          }),
        });
        nom.anchor.set(0.5, 1);
        nom.resolution = 2;
        this.couche.addChild(nom);
      }
    }
    void v;
    return { objet, sprite, ombre, banniere, halo, nom };
  }

  private placer(e: Entree, v: Cadrage, temps: number): void {
    const objet = e.objet;
    const taille = TAILLE[objet.kind] * v.zoom;
    const x = xEcran(v, objet.at.col + 0.5);
    const y = yEcran(v, objet.at.row + 0.9);
    const survole = this.survol === objet.uid;
    const tex = e.sprite.texture;
    const echelle = (taille / Math.max(1, tex.height)) * (survole ? 1.06 : 1);
    /* Loi n°7 : une respiration de 3 px au plus, période longue. */
    const souffle = Math.sin(temps * 0.9 + objet.at.col * 0.31 + objet.at.row * 0.17) * 1.1;
    e.sprite.scale.set(echelle);
    e.sprite.position.set(x, y + souffle * 0.5);

    e.ombre.width = taille * 0.9;
    e.ombre.height = taille * 0.32;
    e.ombre.position.set(x + taille * 0.1, y + taille * 0.02);
    e.ombre.alpha = LIGHT.ombrePorteeAlpha;

    const owner = this.proprietaire(objet);
    if (owner && this.etat) {
      const joueur = this.etat.players[owner as keyof typeof this.etat.players];
      if (joueur) {
        if (!e.banniere.visible) {
          e.banniere.texture = this.atlas.banner(joueur.color, joueur.pattern);
          e.banniere.visible = true;
        }
        const hb = taille * 0.52;
        e.banniere.scale.set(hb / Math.max(1, e.banniere.texture.height));
        e.banniere.position.set(x + taille * 0.3, y - taille * 0.82);
        e.banniere.rotation = -0.05 + Math.sin(temps * 1.9 + objet.at.row * 0.7) * 0.04;
      }
    } else if (e.banniere.visible) {
      e.banniere.visible = false;
    }

    const g = e.halo;
    g.clear();
    if (survole) {
      g.ellipse(x, y, taille * 0.46, taille * 0.2).stroke({
        color: PALETTE.vieilOr,
        width: Math.max(1.5, v.zoom * 0.12),
        alpha: 0.9,
      });
      g.ellipse(x, y, taille * 0.56, taille * 0.25).stroke({
        color: LIGHT.chaude,
        width: Math.max(1, v.zoom * 0.05),
        alpha: 0.45,
      });
    }

    if (e.nom) {
      const lisible = v.zoom >= 15;
      e.nom.visible = lisible;
      if (lisible) {
        e.nom.style.fontSize = borne(v.zoom * 0.62, 13, 22);
        e.nom.position.set(x, y - taille * 0.98);
      }
    }
  }

  destroy(): void {
    this.couche.destroy({ children: true });
    this.ombres.destroy({ children: true });
    this.entrees.clear();
    this.parBloc.clear();
  }
}
