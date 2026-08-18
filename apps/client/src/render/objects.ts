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

/**
 * Le décor médian, en cases : la barre qu'un objet interactif doit franchir.
 *
 * `props.ts` tire un sapin à 2,05 case multipliée par un facteur de 0,80 à
 * 1,22 ; le plus grand atteint donc 2,50 cases, le médian 2,05. L'échelle
 * précédente passait sous les deux — tas de ressource à 1,35, borne à 1,20,
 * artefact à 1,40, soit à peine plus de la moitié d'un sapin. Mesuré sur la
 * carte : **55 % des objets avaient un voisin décoratif plus haut qu'eux**.
 *
 * On aligne sur le **médian** et non sur le plus grand, délibérément. Porter un
 * tas de ressource à 2,50 cases en ferait un monument, et HMM3 ne fait pas cela :
 * ses tas de ressource sont petits, mais **saturés, brillants, et posés dans une
 * clairière**. Le dégagement du décor autour des objets (`props.ts`) et la dalle
 * permanente font le reste du travail — l'échelle seule ne peut pas le faire
 * sans ridicule.
 */
export const DECOR_MEDIAN = 2.05;

/** Terre battue au pied d'un lieu qu'on visite : l'ocre des chemins creux. */
const TERRE_FOULEE = melanger(PALETTE.ocre, PALETTE.brunFougere, 0.45);

/**
 * Taille de chaque famille d'objet, en cases.
 *
 * Règle : tout ce qui déclenche une action se tient **au-dessus** de
 * `DECOR_MEDIAN`. Le rang à l'intérieur reste celui de l'importance — une cité
 * domine une mine, qui domine un tas de ressource — mais le plancher n'est plus
 * négociable. `obstacle` est la seule exception : il est du décor par nature, et
 * le rendu ne le dessine même pas.
 */
export const TAILLE: Readonly<Record<MapObjectKind, number>> = {
  maison_tresor: 4.4,
  ville: 4.2,
  village: 3.4,
  mine: 3.0,
  auberge: 2.9,
  sceau: 2.8,
  sanctuaire: 2.7,
  garde: 2.6,
  belvedere: 2.4,
  caravane: 2.3,
  source: 2.25,
  quete: 2.2,
  artefact: 2.2,
  ressource: 2.1,
  borne: 2.05,
  obstacle: 1.5,
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
  /** Dalle permanente : ce qui dit « ceci se visite » sans qu'on survole. */
  socle: Graphics;
  banniere: Sprite;
  halo: Graphics;
  /** Jeton de la ressource produite, pour distinguer les trente-deux mines. */
  embleme: Sprite | null;
  nom: Text | null;
}

/**
 * L'icône d'un objet, choisie sur sa nature **et sur sa donnée**.
 *
 * Les cent vingt-neuf tas de ressource partageaient un seul dessin, et les
 * trente-deux mines un autre — alors que l'atlas porte depuis toujours sept
 * jetons `ressource_<clef>` que personne ne posait jamais sur la carte. Un
 * joueur ne pouvait donc pas savoir, sans cliquer, si le tas devant lui était
 * du sel ou du fil d'or. C'est exactement ce qu'on lui demande de décider.
 */
function cleIcone(objet: MapObject, atlas: ArtAtlas): string {
  if (objet.kind === 'ressource') {
    const r = objet.data?.resource as string | undefined;
    if (r && atlas.hasIcon(`ressource_${r}`)) return `ressource_${r}`;
  }
  const cle = `carte_${objet.kind}`;
  return atlas.hasIcon(cle) ? cle : 'carte_borne';
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
      if (e.embleme) this.couche.addChild(e.embleme);
      if (e.nom) this.couche.addChild(e.nom);
      this.couche.addChild(e.halo);
      if (e.banniere.visible) this.couche.addChild(e.banniere);
    }
    for (const [uid, e] of this.entrees) {
      if (vus.has(uid)) continue;
      e.sprite.destroy();
      e.ombre.destroy();
      e.socle.destroy();
      e.banniere.destroy();
      e.halo.destroy();
      e.embleme?.destroy();
      e.nom?.destroy();
      this.entrees.delete(uid);
    }
  }

  private creer(objet: MapObject, v: Cadrage): Entree {
    const sprite = new Sprite(this.atlas.icon(cleIcone(objet, this.atlas)));
    sprite.anchor.set(0.5, 0.78);
    this.couche.addChild(sprite);

    const ombre = new Sprite(ombreDouce());
    ombre.anchor.set(0.5, 0.5);
    ombre.tint = LIGHT.ombrePortee;
    ombre.alpha = LIGHT.ombrePorteeAlpha;
    this.ombres.addChild(ombre);

    /* Le socle passe sous tous les objets, donc dans la couche des ombres :
       sinon la dalle d'un objet du premier plan viendrait recouvrir la tête de
       celui qui est derrière lui. */
    const socle = new Graphics();
    this.ombres.addChild(socle);

    const banniere = new Sprite();
    banniere.anchor.set(0.5, 0.05);
    banniere.visible = false;
    this.couche.addChild(banniere);

    const halo = new Graphics();
    this.couche.addChild(halo);

    /* Une mine porte le jeton de ce qu'elle produit. Le tas de ressource, lui,
       EST déjà ce jeton — il n'a pas besoin d'être annoté. */
    let embleme: Sprite | null = null;
    if (objet.kind === 'mine') {
      const r = objet.data?.resource as string | undefined;
      if (r && this.atlas.hasIcon(`ressource_${r}`)) {
        embleme = new Sprite(this.atlas.icon(`ressource_${r}`));
        embleme.anchor.set(0.5, 1);
        this.couche.addChild(embleme);
      }
    }

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
    return { objet, sprite, ombre, socle, banniere, halo, embleme, nom };
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

    /*
     * La dalle. C'est elle qui répond à la demande : « les éléments actifs
     * doivent être bien distincts des éléments juste décoratifs ».
     *
     * Le halo doré n'existait qu'au survol — autant dire jamais, sur une carte
     * qu'on parcourt des yeux avant d'y poser la souris, et jamais du tout sur
     * un téléphone où il n'y a pas de survol. Un sapin et une mine recevaient
     * donc rigoureusement le même traitement : une ombre elliptique.
     *
     * Trois strates, comme la dalle de granit du jeton de héros dont on
     * reprend ici le procédé : une assise sombre qui détache l'objet du sol, un
     * anneau de pierre claire, et un liseré chaud sur le bord éclairé au
     * nord-ouest. Le décor n'en reçoit aucune ; c'est l'écart qui porte le
     * signal, pas la dalle elle-même.
     */
    const rx = taille * 0.34;
    const ry = taille * 0.135;
    const socle = e.socle;
    socle.clear();
    /*
     * Terre battue, et non dalle de pierre.
     *
     * Un premier essai posait une dalle de granit clair cerclée d'un trait
     * sombre. Regardé au zoom 2×, le résultat était sans appel : des plateaux
     * d'ardoise posés sur l'herbe, qui lisaient comme des pastilles d'interface
     * et non comme du sol — exactement l'écueil annoncé. HMM3 ne met aucun socle
     * sous ses objets ; ce qui les détache, c'est la trouée dans le décor et une
     * petite zone de terre foulée, celle que font les pas.
     *
     * On garde donc le principe — un objet visitable a un sol à lui — mais dans
     * la matière du lieu : ocre chaud, bords fondus, aucun trait de contour, et
     * un contact plus sombre juste sous l'objet pour l'asseoir.
     */
    socle.ellipse(x, y, rx * 1.35, ry * 1.35).fill({ color: TERRE_FOULEE, alpha: 0.16 });
    socle.ellipse(x, y, rx, ry).fill({ color: TERRE_FOULEE, alpha: 0.3 });
    socle.ellipse(x, y + ry * 0.18, rx * 0.62, ry * 0.58).fill({
      color: PALETTE.bleuProfond,
      alpha: 0.28,
    });
    /* Un souffle de lumière chaude sur le bord nord-ouest, très discret : c'est
       ce qui distingue une terre foulée d'une tache de boue. */
    socle
      .ellipse(x - rx * 0.1, y - ry * 0.22, rx * 0.92, ry * 0.8)
      .stroke({ color: LIGHT.chaude, width: Math.max(1, v.zoom * 0.035), alpha: 0.22 });

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

    if (e.embleme) {
      /* Le jeton se pose en haut à droite de la mine, assez grand pour se lire
         au zoom de croisière et assez petit pour ne pas la concurrencer. */
      const he = taille * 0.34;
      e.embleme.scale.set(he / Math.max(1, e.embleme.texture.height));
      e.embleme.position.set(x + taille * 0.3, y - taille * 0.62 + souffle * 0.5);
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
