/**
 * `render/heroes.ts` — les jetons de héros.
 *
 * Un jeton, c'est quatre choses : le **portrait** du héros dans un cartouche de
 * parchemin cerné d'un double filet d'or, la **bannière** de son joueur (couleur
 * *et* motif, pour l'accessibilité), un **chevron** qui donne l'une des huit
 * directions, et la **jauge de points de marche** qui reste le renseignement le
 * plus consulté de la carte.
 *
 * Le jeton marche : `animerDeplacement` le fait glisser de case en case le long
 * du chemin rendu par le moteur, avec un léger balancement de pas. Aucune règle
 * n'est décidée ici — la vue reçoit un chemin déjà validé.
 */

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { GameState, HeroInstance, MapCoord, PlayerId } from '@auvergne/engine';
import type { ArtAtlas } from '../art/index.js';
import { LIGHT, PALETTE, assombrir, melanger } from '../art/palette.js';
import { borne, xEcran, yEcran } from './commun.js';
import type { Cadrage } from './commun.js';

/**
 * Durée d'un pas de héros, en millisecondes.
 *
 * Elle valait 145 ms, et le propriétaire l'a jugée trop rapide dès qu'elle a
 * commencé à s'appliquer — la file d'animation venait d'être rebranchée, et un
 * trajet de trois cases se jouait en 435 ms, à peine le temps de voir partir
 * le héros. On la porte à 260 ms : un pas devient lisible, on suit la troupe
 * du regard, et l'on comprend où passe la route.
 */
const MS_PAR_CASE = 260;

/**
 * Le GENOU : nombre de cases jouées à pleine cadence avant que le pas ne se
 * resserre. Mêmes valeurs que la marche de combat (`battle/anim.ts`), pour
 * que les deux écrans aient la même respiration.
 */
const GENOU_CASES = 11;

/** Cadence des cases AU-DELÀ du genou — le trot du courrier pressé. */
const MS_PAR_CASE_AU_DELA = 140;

/**
 * Cadence retenue pour un trajet de `cases` cases, en millisecondes par case.
 *
 * Un chemin court garde la pleine cadence — c'est lui qu'on regarde. Au-delà
 * du genou, chaque case supplémentaire coûte moins, mais la durée TOTALE
 * croît STRICTEMENT avec le chemin : l'ancien plafond de durée totale rendait
 * identiques tous les trajets de quatorze à vingt cases (3400 ms exactement),
 * puis écrasait la cadence des plus longs — le défaut même que la marche de
 * combat a éliminé. La plus longue journée possible (vingt-huit cases) tient
 * en 5,2 s, jamais instantanée, jamais une attente.
 */
export function cadenceDeMarche(cases: number): number {
  if (!Number.isFinite(cases) || cases <= 0) return MS_PAR_CASE;
  const pleines = Math.min(cases, GENOU_CASES);
  const audela = Math.max(0, cases - GENOU_CASES);
  return (pleines * MS_PAR_CASE + audela * MS_PAR_CASE_AU_DELA) / cases;
}

interface Jeton {
  uid: string;
  racine: Container;
  ombre: Sprite;
  banniere: Sprite;
  cadre: Graphics;
  portrait: Sprite;
  masque: Graphics;
  jauge: Graphics;
  /** halo de sélection au pied, repeint chaque image tant qu'il est actif */
  halo: Graphics;
  /** position affichée, en cases continues */
  col: number;
  row: number;
  facing: number;
  /** dernière taille dessinée, pour ne pas repeindre à chaque image */
  tailleDessinee: number;
  marche: number;
  dernierSelect: boolean;
}

interface Deplacement {
  uid: string;
  points: MapCoord[];
  index: number;
  t: number;
  /** Cadence retenue pour CE trajet, genou compris. */
  msParCase: number;
  resoudre: () => void;
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
    grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(48, 24, 46, 22, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ombreTexture = Texture.from(el);
  ombreTexture.source.label = 'ombre_heros';
  return ombreTexture;
}

export class JetonsHeros {
  readonly couche = new Container();
  private readonly jetons = new Map<string, Jeton>();
  private etat: GameState | null = null;
  private deplacement: Deplacement | null = null;

  constructor(
    private readonly atlas: ArtAtlas,
    private readonly localPlayer: PlayerId,
  ) {
    this.couche.label = 'heros';
  }

  /** Position affichée d'un héros, en cases continues (suit l'animation). */
  position(uid: string): { col: number; row: number } | null {
    const j = this.jetons.get(uid);
    return j ? { col: j.col, row: j.row } : null;
  }

  /** Le jeton sous un point écran, ou `null`. */
  jetonSous(v: Cadrage, x: number, y: number): string | null {
    let trouve: string | null = null;
    let meilleur = Infinity;
    for (const j of this.jetons.values()) {
      const cx = xEcran(v, j.col + 0.5);
      const cy = yEcran(v, j.row + 0.5);
      const taille = this.taille(v);
      const dx = x - cx;
      const dy = y - (cy - taille * 0.5);
      const d = dx * dx + dy * dy;
      if (Math.abs(dx) < taille * 0.45 && Math.abs(dy) < taille * 0.55 && d < meilleur) {
        meilleur = d;
        trouve = j.uid;
      }
    }
    return trouve;
  }

  private taille(v: Cadrage): number {
    return borne(v.zoom * 2.45, 30, 112);
  }

  sync(state: GameState, enAttente: ReadonlySet<string> = new Set()): void {
    this.etat = state;
    const vus = new Set<string>();
    for (const uid of Object.keys(state.heroes)) {
      const hero = state.heroes[uid];
      if (!hero) continue;
      vus.add(uid);
      let jeton = this.jetons.get(uid);
      if (!jeton) {
        jeton = this.creer(uid, hero, state);
        this.jetons.set(uid, jeton);
      }
      /* Pendant une marche animée — ou quand une marche ATTEND encore dans la
         file (`enAttente`) — la position vient de l'animation, pas de l'état :
         claquer le jeton à destination ici ferait partir la marche de
         l'arrivée, c'est-à-dire nulle part. */
      if (this.deplacement?.uid !== uid && !enAttente.has(uid)) {
        jeton.col = hero.at.col;
        jeton.row = hero.at.row;
        jeton.facing = hero.facing;
      }
      jeton.marche = hero.movementMax > 0 ? borne(hero.movement / hero.movementMax, 0, 1) : 0;
      jeton.tailleDessinee = 0;
    }
    for (const [uid, jeton] of this.jetons) {
      if (vus.has(uid)) continue;
      jeton.racine.destroy({ children: true });
      this.jetons.delete(uid);
    }
  }

  private creer(uid: string, hero: HeroInstance, state: GameState): Jeton {
    const racine = new Container();
    racine.label = `heros-${uid}`;

    /* Le halo de sélection vit SOUS tout le reste : un anneau au sol, pas un
       cadre sur le portrait. */
    const halo = new Graphics();
    racine.addChild(halo);

    const ombre = new Sprite(ombreDouce());
    ombre.anchor.set(0.5, 0.5);
    ombre.tint = LIGHT.ombrePortee;
    ombre.alpha = LIGHT.ombrePorteeAlpha + 0.08;
    racine.addChild(ombre);

    const joueur = state.players[hero.owner];
    const banniere = new Sprite(this.atlas.banner(joueur?.color ?? '#8C2230', joueur?.pattern ?? 0));
    banniere.anchor.set(0.5, 0.06);
    racine.addChild(banniere);

    const cadre = new Graphics();
    racine.addChild(cadre);

    const portrait = new Sprite(this.atlas.icon(`portrait_${hero.def}`));
    portrait.anchor.set(0.5, 0.42);
    racine.addChild(portrait);

    const masque = new Graphics();
    racine.addChild(masque);
    portrait.mask = masque;

    const jauge = new Graphics();
    racine.addChild(jauge);

    this.couche.addChild(racine);
    return {
      uid,
      racine,
      ombre,
      banniere,
      cadre,
      portrait,
      masque,
      jauge,
      halo,
      col: hero.at.col,
      row: hero.at.row,
      facing: hero.facing,
      tailleDessinee: 0,
      marche: 1,
      dernierSelect: false,
    };
  }

  /* ─────────────────────────── Peinture du jeton ────────────────────────── */

  private peindre(j: Jeton, taille: number, propre: boolean): void {
    const l = taille * 0.78;
    const h = taille * 0.9;
    const cy = -taille * 0.62;
    const g = j.cadre;
    g.clear();

    /* Socle : une dalle de granit posée au sol, trois strates et rien d'opaque.
       Un disque sombre plein ferait un trou dans la carte. */
    g.ellipse(taille * 0.05, taille * 0.02, taille * 0.33, taille * 0.14).fill({
      color: LIGHT.ombrePortee,
      alpha: 0.34,
    });
    g.ellipse(0, -taille * 0.01, taille * 0.3, taille * 0.125).fill({
      color: melanger(PALETTE.granitClair, PALETTE.brunFougere, 0.34),
      alpha: 0.85,
    });
    g.ellipse(-taille * 0.02, -taille * 0.035, taille * 0.25, taille * 0.09).fill({
      color: melanger(PALETTE.granitClair, LIGHT.chaude, 0.34),
      alpha: 0.6,
    });
    g.ellipse(0, -taille * 0.01, taille * 0.3, taille * 0.125).stroke({
      color: melanger(PALETTE.granitAnthracite, PALETTE.bleuProfond, 0.4),
      width: Math.max(1, taille * 0.022),
      alpha: 0.7,
    });

    /* Cartouche de parchemin : ombre portée, corps, biseau, double filet d'or. */
    const x = -l / 2;
    const y = cy - h / 2;
    g.roundRect(x + taille * 0.05, y + taille * 0.07, l, h, taille * 0.1).fill({
      color: LIGHT.ombrePortee,
      alpha: 0.38,
    });
    g.roundRect(x, y, l, h, taille * 0.1).fill({
      color: melanger(PALETTE.parcheminOmbre, PALETTE.brunFougere, 0.24),
    });
    g.roundRect(x + taille * 0.035, y + taille * 0.035, l - taille * 0.07, h - taille * 0.07, taille * 0.08).fill({
      color: propre ? melanger(PALETTE.parchemin, PALETTE.ocre, 0.1) : PALETTE.parcheminOmbre,
    });

    /* Biseau : clair en haut (nord-ouest), sombre en bas. */
    g.roundRect(x, y, l, h, taille * 0.1).stroke({ color: LIGHT.chaude, width: Math.max(1, taille * 0.03), alpha: 0.32 });
    g.moveTo(x + taille * 0.05, y + h)
      .lineTo(x + l - taille * 0.05, y + h)
      .stroke({ color: LIGHT.ombrePortee, width: Math.max(1, taille * 0.04), alpha: 0.5 });

    j.masque.clear();
    j.masque
      .roundRect(x + taille * 0.06, y + taille * 0.06, l - taille * 0.12, h - taille * 0.12, taille * 0.07)
      .fill({ color: 0xffffff });
  }

  /** Filet d'or et chevron de direction, tracés au-dessus du portrait. */
  private peindreJauge(j: Jeton, taille: number, selectionne: boolean): void {
    const g = j.jauge;
    g.clear();
    const l = taille * 0.78;
    const h = taille * 0.9;
    const cy = -taille * 0.62;
    const x = -l / 2;
    const y = cy - h / 2;

    g.roundRect(x + taille * 0.045, y + taille * 0.045, l - taille * 0.09, h - taille * 0.09, taille * 0.08).stroke({
      color: PALETTE.vieilOr,
      width: Math.max(1, taille * 0.035),
      alpha: 0.9,
    });
    g.roundRect(x + taille * 0.1, y + taille * 0.1, l - taille * 0.2, h - taille * 0.2, taille * 0.06).stroke({
      color: PALETTE.vieilOr,
      width: Math.max(1, taille * 0.016),
      alpha: 0.55,
    });
    /* Loi n°4 : liseré doré au sud-est, en arc, jamais un contour complet. */
    g.moveTo(Math.cos(0.15) * l * 0.56, cy + Math.sin(0.15) * l * 0.56);
    g.arc(0, cy, l * 0.56, 0.15, 1.55).stroke({
      color: LIGHT.rim,
      width: Math.max(1, taille * 0.035),
      alpha: LIGHT.rimAlpha,
    });

    /* Jauge de points de marche : un arc d'or sous le cartouche. */
    const rj = taille * 0.42;
    const yj = -taille * 0.1;
    g.moveTo(Math.cos(Math.PI * 0.12) * rj, yj + Math.sin(Math.PI * 0.12) * rj);
    g.arc(0, yj, rj, Math.PI * 0.12, Math.PI * 0.88).stroke({
      color: assombrir(PALETTE.brunFougere, 0.3),
      width: Math.max(2, taille * 0.075),
      alpha: 0.8,
      cap: 'round',
    });
    if (j.marche > 0.001) {
      const a0 = Math.PI * 0.88;
      const a1 = a0 - (Math.PI * 0.76) * j.marche;
      g.moveTo(Math.cos(a1) * rj, yj + Math.sin(a1) * rj);
      g.arc(0, yj, rj, a1, a0).stroke({
        color: j.marche > 0.25 ? PALETTE.vieilOr : PALETTE.grenat,
        width: Math.max(1.5, taille * 0.055),
        alpha: 0.95,
        cap: 'round',
      });
    }

    /* Chevron des huit directions : 0 = nord, sens horaire. */
    const a = (j.facing / 8) * Math.PI * 2 - Math.PI / 2;
    const rc = taille * 0.36;
    const px = Math.cos(a) * rc;
    const py = Math.sin(a) * rc * 0.55 - taille * 0.04;
    const nx = Math.cos(a + Math.PI / 2);
    const ny = Math.sin(a + Math.PI / 2) * 0.55;
    const t = taille * 0.11;
    g.poly([
      px + Math.cos(a) * t * 1.5,
      py + Math.sin(a) * t * 0.9,
      px + nx * t,
      py + ny * t,
      px - nx * t,
      py - ny * t,
    ]).fill({ color: selectionne ? LIGHT.chaude : PALETTE.vieilOr, alpha: 0.9 });

    if (selectionne) {
      g.ellipse(0, 0, taille * 0.5, taille * 0.22).stroke({
        color: PALETTE.vieilOr,
        width: Math.max(1.5, taille * 0.04),
        alpha: 0.85,
      });
    }
  }

  /* ──────────────────────────── Boucle d'image ──────────────────────────── */

  majVue(v: Cadrage, temps: number, selection: string | null, immobile: boolean): void {
    const taille = this.taille(v);
    for (const j of this.jetons.values()) {
      const hero = this.etat?.heroes[j.uid];
      const propre = hero?.owner === this.localPlayer;
      if (Math.abs(j.tailleDessinee - taille) > 0.5) {
        j.tailleDessinee = taille;
        this.peindre(j, taille, propre ?? false);
        this.peindreJauge(j, taille, selection === j.uid);
        /* Le portrait est cadré poitrine : on l'agrandit pour que le visage
           remplisse le cartouche, sinon on ne reconnaît personne à 40 px. */
        const tp = j.portrait.texture;
        j.portrait.scale.set((taille * 1.72) / Math.max(1, tp.height));
        j.portrait.anchor.set(0.5, 0.34);
        j.portrait.tint = melanger(0xffffff, LIGHT.chaude, 0.2);
        j.portrait.position.set(0, -taille * 0.66);
        const tb = j.banniere.texture;
        j.banniere.scale.set((taille * 0.78) / Math.max(1, tb.height));
        j.ombre.width = taille * 0.86;
        j.ombre.height = taille * 0.34;
      } else if (j.dernierSelect !== (selection === j.uid)) {
        this.peindreJauge(j, taille, selection === j.uid);
      }
      j.dernierSelect = selection === j.uid;

      /*
       * LE HALO DE SÉLECTION — « je voudrais que l'on voie mieux quand on
       * sélectionne un héros ». L'ancien marquage (chevron réchauffé + fin
       * trait d'or) se perdait dans le décor. L'anneau au sol PULSE, comme
       * l'anneau d'activation du combat : deux ellipses d'or, l'une pleine
       * lumière, l'autre en respiration. Repeint chaque image, mais pour le
       * SEUL héros choisi — un tracé vectoriel par image, rien de plus.
       */
      if (j.dernierSelect) {
        const pulse = immobile ? 0.85 : 0.62 + 0.3 * Math.sin(temps * 4.2);
        const rx = taille * (0.56 + (immobile ? 0 : 0.035 * Math.sin(temps * 4.2)));
        j.halo.clear();
        j.halo
          .ellipse(0, taille * 0.02, rx, rx * 0.42)
          .stroke({ color: LIGHT.chaude, width: Math.max(2, taille * 0.07), alpha: pulse });
        j.halo
          .ellipse(0, taille * 0.02, rx * 0.78, rx * 0.33)
          .fill({ color: PALETTE.vieilOr, alpha: 0.16 })
          .stroke({ color: PALETTE.vieilOr, width: Math.max(1, taille * 0.03), alpha: 0.9 });
      } else if (j.halo.visible) {
        j.halo.clear();
      }
      j.halo.visible = j.dernierSelect;

      const x = xEcran(v, j.col + 0.5);
      const y = yEcran(v, j.row + 0.9);
      const balance = immobile ? 0 : Math.sin(temps * 1.1 + j.col * 0.7) * 1.4;
      j.racine.position.set(x, y + balance * 0.3);
      j.banniere.position.set(-taille * 0.46, -taille * 1.02);
      j.banniere.rotation = immobile ? -0.04 : -0.04 + Math.sin(temps * 1.7 + j.row) * 0.035;
      j.ombre.position.set(taille * 0.1, taille * 0.03);
    }
  }

  /* ──────────────────────── Marche le long du chemin ────────────────────── */

  /** Fait marcher un héros ; se résout à l'arrivée. */
  animerDeplacement(uid: string, chemin: readonly MapCoord[], immediat: boolean): Promise<void> {
    const jeton = this.jetons.get(uid);
    if (!jeton || chemin.length === 0) return Promise.resolve();
    if (immediat) {
      const fin = chemin[chemin.length - 1];
      jeton.col = fin.col;
      jeton.row = fin.row;
      return Promise.resolve();
    }
    const msParCase = cadenceDeMarche(chemin.length);
    return new Promise<void>((resoudre) => {
      this.deplacement = { uid, points: [...chemin], index: 0, t: 0, msParCase, resoudre };
    });
  }

  /** Avance la marche en cours. */
  avancer(dtMs: number): void {
    const d = this.deplacement;
    if (!d) return;
    const jeton = this.jetons.get(d.uid);
    if (!jeton) {
      d.resoudre();
      this.deplacement = null;
      return;
    }
    d.t += dtMs / d.msParCase;
    while (d.t >= 1 && d.index < d.points.length) {
      d.t -= 1;
      const p = d.points[d.index];
      jeton.col = p.col;
      jeton.row = p.row;
      d.index += 1;
    }
    if (d.index >= d.points.length) {
      const fin = d.points[d.points.length - 1];
      jeton.col = fin.col;
      jeton.row = fin.row;
      d.resoudre();
      this.deplacement = null;
      return;
    }
    const depart = d.index === 0 ? { col: jeton.col, row: jeton.row } : d.points[d.index - 1];
    const cible = d.points[d.index];
    jeton.col = depart.col + (cible.col - depart.col) * d.t;
    jeton.row = depart.row + (cible.row - depart.row) * d.t;
    const dx = cible.col - depart.col;
    const dy = cible.row - depart.row;
    jeton.facing = directionDe(dx, dy);
  }

  get enMarche(): boolean {
    return this.deplacement !== null;
  }

  destroy(): void {
    this.deplacement?.resoudre();
    this.deplacement = null;
    this.couche.destroy({ children: true });
    this.jetons.clear();
  }
}

/** Direction 0..7, 0 = nord, sens horaire. */
export function directionDe(dcol: number, drow: number): number {
  if (dcol === 0 && drow === 0) return 0;
  const angle = Math.atan2(dcol, -drow);
  const secteur = Math.round((angle / (Math.PI * 2)) * 8);
  return ((secteur % 8) + 8) % 8;
}
