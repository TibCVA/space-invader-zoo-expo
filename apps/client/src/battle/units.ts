/**
 * `battle/units.ts` — les quatorze piles sur la grille.
 *
 * Chaque pile est montée sur un **rig de l'atlas** (`atlas.creatureRig`) : une
 * hiérarchie d'articulations peintes, pas une image. Autour d'elle :
 *
 *  - la bannière du camp, plantée derrière l'épaule au vent (loi n°7) ;
 *  - le cartouche du nombre de créatures, toujours lisible ;
 *  - la jauge de vie de la pile, lue dans le moteur (`unitTotalHp`) ;
 *  - l'orientation, donnée par le camp puis par la dernière cible ;
 *  - l'ombre portée à 315°, déjà dessinée par le rig, doublée d'une tache de
 *    contact au sol ;
 *  - un tri en profondeur par ligne d'hexagone.
 *
 * Aucune statistique n'est calculée ici : tout est lu dans `CombatState` et
 * dans les fonctions d'affichage du moteur.
 */

import { Container, Graphics, Sprite } from 'pixi.js';
import {
  HEX_ROWS,
  hexKey,
  unitDef,
  unitMaxHp,
  unitTotalHp,
} from '@auvergne/engine';
import type { CombatState, CombatUnit, PlayerId } from '@auvergne/engine';
import type { ArtAtlas, CreatureRig } from '../art/index.js';
import {
  LIGHT,
  PALETTE,
  assombrir,
  eclaircir,
  faceEclairee,
  melanger,
  ombreBleutee,
} from '../art/palette.js';
import { blob, flat } from '../art/shading.js';
import { jauge, plaqueNombre } from './parchemin.js';
import { Geometrie, faceDe } from './hexgrid.js';

/* ═════════════════════════════ Camps et couleurs ═════════════════════════ */

export interface Camp {
  /** couleur de bannière, entier 0xRRGGBB */
  couleur: number;
  /** motif d'accessibilité 0..4 */
  motif: number;
  nom: string;
}

/** Couleur CSS `#rrggbb` → entier ; repli sur le grenat de la Châtellenie. */
export function couleurDeCss(css: string | undefined, secours: number): number {
  if (!css) return secours;
  const m = /^#?([0-9a-f]{6})$/i.exec(css.trim());
  return m ? parseInt(m[1], 16) : secours;
}

/* ═══════════════════════════════ Une pile ════════════════════════════════ */

/**
 * Gel des gréements au repos. Mesuré dans ce conteneur **sans GPU** : aucun
 * gain reproductible (l'instrument dérive de 2× à l'intérieur d'une même
 * session, voir le rapport). Le mécanisme est écrit, testé et laissé en place,
 * mais **désactivé** : il coûte une respiration d'attente à 12 images/s, et on
 * ne paie pas de qualité pour un gain qu'on n'a pas su mesurer. À rallumer le
 * jour où la mesure se fait sur une vraie carte graphique.
 */
const GEL_DES_GREEMENTS = false;

/** Ce que la vue affiche d'une pile, indépendamment de l'état du moteur. */
export class PileVue {
  readonly container = new Container();
  readonly rig: CreatureRig;
  /** Identifiant de la créature : le trait qu'elle lance en dépend. */
  readonly creature: string;

  /** position affichée, en pixels du plateau (espace non étiré) */
  readonly pos = { x: 0, y: 0 };
  /** hexagone où la vue croit que la pile se trouve */
  hex = { col: 0, row: 0 };
  uid: string;
  side: 0 | 1;

  /** décor immobile de la pile : ombre de contact, socle de camp, jauge */
  private readonly decor = new Container();
  private readonly socle = new Graphics();
  private readonly cadran = new Graphics();
  private readonly banniere: Sprite;
  private readonly cartoucheHote = new Container();
  private cartouche: Container | null = null;
  private readonly ombreContact = new Graphics();

  private baseBanniereX = 0;
  /** animation en cours, telle que la vue l'a demandée au gréement */
  private animCourante = 'attente';
  /** le gréement est-il figé en texture ? */
  private rigFige = false;
  private cacheT = 0;
  private nombreAffiche = -1;
  private vieAffichee = -1;
  private mise = false;
  private morte = false;
  private phase: number;
  private echelle = 1;

  constructor(
    unit: CombatUnit,
    private readonly geo: Geometrie,
    private readonly atlas: ArtAtlas,
    private readonly camp: Camp,
    private readonly reducedMotion: boolean,
  ) {
    this.uid = unit.uid;
    this.side = unit.side;
    this.creature = unit.creature;
    this.hex = { col: unit.at.col, row: unit.at.row };
    this.phase = (hexKey(unit.at) % 97) / 97;
    this.container.label = `pile-${unit.uid}`;

    this.rig = atlas.creatureRig(unit.creature);
    /* La créature est mise à l'échelle de l'hexagone : la silhouette doit
       tenir dans sa case sans jamais la déborder de plus d'un tiers. */
    const b = this.rig.getLocalBounds();
    const hauteurCible = geo.taille * (unitDef(unit).size === 2 ? 2.9 : 2.5);
    this.echelle = Math.min(1.7, hauteurCible / Math.max(24, b.height));
    this.rig.scale.set(this.echelle);
    this.rig.setFacing(unit.side === 0 ? 1 : -1);

    /* Le pennon de camp est un repère, pas un décor : il reste petit, planté
       derrière l'épaule, et ne mange jamais la silhouette de la créature. */
    this.banniere = new Sprite(atlas.banner(couleurHex(camp.couleur), camp.motif));
    this.banniere.anchor.set(0.5, 0.04);
    const hb = geo.taille * 0.92;
    this.banniere.scale.set(hb / Math.max(8, this.banniere.texture.height));
    this.banniere.position.set(
      (unit.side === 0 ? -1 : 1) * geo.taille * 0.66,
      -geo.taille * 1.62,
    );
    this.banniere.alpha = 0.96;
    this.baseBanniereX = this.banniere.x;

    /*
     * Le décor de la pile ne bouge pas d'une image à l'autre : ombre de
     * contact, socle de camp, jauge de vie. Groupé puis mis en cache, il ne
     * coûte plus qu'un sprite au lieu de trois `Graphics` retracés — seul le
     * gréement de la créature reste vivant.
     */
    this.decor.addChild(this.ombreContact, this.socle);
    this.container.addChild(
      this.decor,
      this.banniere,
      this.rig,
      this.cadran,
      this.cartoucheHote,
    );
    this.peindreSocle();
    this.decor.cacheAsTexture(true);
    this.sync(unit, null);
  }

  /* ────────────────────────────── Mise à jour ──────────────────────────── */

  /**
   * Relit la pile dans l'état du moteur. `regarde` oriente la silhouette ;
   * `figer` empêche la replacer — une animation est en cours et c'est elle qui
   * commande la position, sans quoi la vue afficherait un état incohérent.
   */
  sync(unit: CombatUnit, regarde: { col: number; row: number } | null, figer = false): void {
    this.side = unit.side;
    if (!this.mise && !figer) {
      this.hex = { col: unit.at.col, row: unit.at.row };
      const p = this.geo.local(unit.at);
      this.pos.x = p.x;
      this.pos.y = p.y;
      this.placer();
    }
    this.degeler();
    if (regarde) {
      const dir = regarde.col === unit.at.col && regarde.row === unit.at.row
        ? unit.side === 0 ? 1 : -1
        : regarde.col >= unit.at.col ? 1 : -1;
      this.rig.setFacing(dir);
    }
    this.majCartouche(unit);
    this.majVie(unit);
    if (!this.mise && !figer) {
      this.container.zIndex = unit.at.row * 1000 + unit.at.col * 4 + (unit.side === 0 ? 0 : 1);
    }
    /* Perspective atmosphérique : les piles du fond tirent vers la brume. */
    const profondeur = 1 - unit.at.row / (HEX_ROWS - 1);
    this.rig.tint = melanger(0xffffff, LIGHT.brume, profondeur * 0.12);
    if (!unit.alive && !this.morte) this.mourir();
  }

  /** Position imposée par une animation ; `libre()` rend la main au moteur. */
  imposerPosition(x: number, y: number): void {
    this.mise = true;
    this.pos.x = x;
    this.pos.y = y;
    this.placer();
  }

  libre(): void {
    this.mise = false;
  }

  /** Tri en profondeur pendant une animation : la ligne visuelle prime. */
  imposerProfondeur(row: number): void {
    this.container.zIndex = row * 1000 + 500;
  }

  /**
   * La couche des piles n'est **pas** étirée : l'allongement du plateau en
   * mode portrait ne doit jamais déformer une créature. On applique donc
   * l'étirement à la position, et à elle seule.
   */
  private placer(): void {
    this.container.position.set(this.pos.x, this.pos.y * this.geo.etirement);
  }

  /** Rend le gréement au dessin direct : son contenu vient de changer. */
  private degeler(): void {
    if (!this.rigFige) return;
    this.rig.cacheAsTexture(false);
    this.rigFige = false;
    this.cacheT = 0;
  }

  orienter(dir: 1 | -1): void {
    this.degeler();
    this.rig.setFacing(dir);
  }

  jouer(anim: 'attente' | 'marche' | 'attaque' | 'impact' | 'riposte' | 'defense' | 'mort' | 'capacite'): void {
    this.animCourante = anim;
    this.degeler();
    this.rig.play(anim);
  }

  frapper(amplitude: number): void {
    this.degeler();
    const r = this.rig as unknown as { frapper?: (a: number) => void };
    r.frapper?.(Math.min(4, amplitude));
  }

  private mourir(): void {
    this.morte = true;
    this.animCourante = 'mort';
    this.degeler();
    this.rig.play('mort');
    this.cartoucheHote.visible = false;
    this.cadran.visible = false;
    this.banniere.visible = false;
  }

  get estMorte(): boolean {
    return this.morte;
  }

  update(dtMs: number): void {
    const s = dtMs / 1000;
    /*
     * Coût par image : un gréement de créature, c'est une trentaine de
     * `Graphics` — quatorze piles, plus de quatre cents appels de dessin par
     * image. Au **repos**, la pile ne fait que respirer (loi n°7, amplitude de
     * deux pixels) : on la fige alors en texture et on ne rafraîchit cette
     * texture que douze fois par seconde. Dès qu'une vraie animation joue —
     * marche, attaque, impact, mort — le cache tombe et le gréement est de
     * nouveau dessiné à pleine cadence. Compromis assumé : la respiration
     * d'attente s'anime à 12 images/s au lieu de 60.
     */
    if (GEL_DES_GREEMENTS && this.animCourante === 'attente' && !this.mise && !this.morte) {
      this.cacheT += dtMs;
      if (!this.rigFige) {
        this.rig.update(s);
        this.rig.cacheAsTexture(true);
        this.rigFige = true;
        this.cacheT = 0;
      } else if (this.cacheT >= 84) {
        this.rig.update(this.cacheT / 1000);
        this.rig.updateCacheTexture();
        this.cacheT = 0;
      }
    } else {
      this.degeler();
      this.rig.update(s);
    }
    if (this.reducedMotion) return;
    /* Bannière au vent : amplitude ≤ 3 px, période décorrélée (loi n°7). */
    this.phase += s;
    const w = (Math.PI * 2) / (3.1 + (this.uid.charCodeAt(1) % 5) * 0.7);
    this.banniere.rotation = Math.sin(this.phase * w) * 0.05;
    this.banniere.x = this.baseBanniereX + Math.sin(this.phase * w * 1.3) * 1.6;
    this.cartoucheHote.y = Math.sin(this.phase * 1.1) * 0.8;
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }

  /* ─────────────────────────────── Peinture ────────────────────────────── */

  /** Tache de contact au sol : la pile ne flotte jamais au-dessus du terrain. */
  private peindreSocle(): void {
    const t = this.geo.taille;
    const g = this.ombreContact;
    g.clear();
    for (let i = 3; i >= 0; i -= 1) {
      const k = 1 + i * 0.2;
      g.poly(
        flat(
          blob(t * 0.16 * k, t * 0.1 * k, t * 0.56 * k, t * 0.22 * k, {
            seed: 13 + i,
            points: 16,
            wobble: 0.16,
          }),
        ),
      ).fill({ color: LIGHT.ombrePortee, alpha: i === 0 ? 0.3 : 0.07 });
    }

    /* socle de camp : un croissant teinté, côté ombre, plus un liseré doré */
    const s = this.socle;
    s.clear();
    const anneau = blob(0, t * 0.04, t * 0.6, t * 0.25, { seed: 21, points: 20, wobble: 0.12 });
    s.poly(flat(anneau)).fill({ color: melanger(this.camp.couleur, LIGHT.froide, 0.55), alpha: 0.22 });
    s.poly(flat(anneau)).stroke({ color: melanger(this.camp.couleur, LIGHT.chaude, 0.3), width: 1.8, alpha: 0.62 });
    const nw = anneau.filter((p) => p.x + p.y < 0);
    if (nw.length > 2) {
      s.poly(flat(nw)).stroke({ color: LIGHT.rim, width: 1.3, alpha: LIGHT.rimAlpha });
    }
    /* motif d'accessibilité : trois encoches pour le camp 1, deux pour le 0 */
    const encoches = this.side === 0 ? 2 : 3;
    for (let i = 0; i < encoches; i += 1) {
      const a = Math.PI * (0.28 + (i / Math.max(1, encoches - 1)) * 0.44);
      s.moveTo(Math.cos(a) * t * 0.44, t * 0.02 + Math.sin(a) * t * 0.18);
      s.lineTo(Math.cos(a) * t * 0.64, t * 0.02 + Math.sin(a) * t * 0.28);
      s.stroke({ color: melanger(this.camp.couleur, LIGHT.chaude, 0.4), width: 1.6, alpha: 0.7 });
    }
  }

  /** Cartouche du nombre : reconstruit seulement quand le nombre change. */
  private majCartouche(unit: CombatUnit): void {
    if (unit.count === this.nombreAffiche) return;
    this.nombreAffiche = unit.count;
    this.cartouche?.destroy({ children: true });
    const echelle = Math.max(0.72, Math.min(1.15, this.geo.taille / 42));
    this.cartouche = plaqueNombre(this.atlas.materials, unit.count, this.camp.couleur, echelle);
    this.cartouche.position.set(this.geo.taille * 0.66, this.geo.taille * 0.3);
    this.cartoucheHote.addChild(this.cartouche);
    this.cartouche.cacheAsTexture(true);
  }

  /** Jauge de vie de la pile : `unitTotalHp` sur le total de départ. */
  private majVie(unit: CombatUnit): void {
    const total = unitTotalHp(unit);
    if (total === this.vieAffichee) return;
    this.vieAffichee = total;
    const max = Math.max(1, unit.startCount * unitMaxHp(unit));
    const ratio = total / max;
    const t = this.geo.taille;
    const w = t * 1.12;
    const g = this.cadran;
    g.clear();
    if (!unit.alive) return;
    const couleur =
      ratio > 0.6
        ? melanger(PALETTE.vertHetre, LIGHT.chaude, 0.3)
        : ratio > 0.3
          ? PALETTE.ocre
          : PALETTE.grenat;
    jauge(g, -w / 2, t * 0.62, w, 5.4, ratio, couleur);
    /* graduation : un cran par quart, pour lire sans compter les pixels */
    for (let i = 1; i < 4; i += 1) {
      const x = -w / 2 + (w * i) / 4;
      g.moveTo(x, t * 0.62).lineTo(x, t * 0.62 + 5.4);
      g.stroke({ color: ombreBleutee(PALETTE.granitAnthracite, 0.5), width: 0.8, alpha: 0.55 });
    }
  }
}

function couleurHex(v: number): string {
  return `#${(v >>> 0).toString(16).padStart(6, '0').slice(-6)}`;
}

/* ═════════════════════════════ Couche des piles ══════════════════════════ */

/** Toutes les piles, triées en profondeur, plus leurs mises en avant. */
export class CoucheUnites {
  readonly container = new Container();

  private readonly piles = new Map<string, PileVue>();
  private readonly halo = new Graphics();

  constructor(
    private readonly geo: Geometrie,
    private readonly atlas: ArtAtlas,
    private readonly camps: Readonly<Record<0 | 1, Camp>>,
    private readonly reducedMotion: boolean,
  ) {
    this.container.label = 'piles';
    this.container.sortableChildren = true;
    this.halo.zIndex = -10;
    this.container.addChild(this.halo);
  }

  get toutes(): PileVue[] {
    return [...this.piles.values()];
  }

  pile(uid: string): PileVue | null {
    return this.piles.get(uid) ?? null;
  }

  /**
   * Crée, met à jour ou retire les piles selon l'état du moteur. `figer`
   * suspend le replacement le temps qu'une animation se termine : la file
   * d'animations est seule maîtresse des positions qu'elle joue.
   */
  sync(combat: CombatState, actif: string | null, figer = false): void {
    const vus = new Set<string>();
    for (const u of combat.units) {
      vus.add(u.uid);
      let p = this.piles.get(u.uid);
      if (!p) {
        p = new PileVue(u, this.geo, this.atlas, this.camps[u.side], this.reducedMotion);
        this.piles.set(u.uid, p);
        this.container.addChild(p.container);
      }
      p.sync(u, null, figer);
      p.container.visible = u.alive || p.estMorte;
    }
    for (const [uid, p] of this.piles) {
      if (vus.has(uid)) continue;
      p.destroy();
      this.piles.delete(uid);
    }
    this.peindreHalo(combat, actif);
  }

  /** Halo doré sous la pile active : elle se repère d'un coup d'œil. */
  private peindreHalo(combat: CombatState, actif: string | null): void {
    const g = this.halo;
    g.clear();
    if (!actif) return;
    const u = combat.units.find((x) => x.uid === actif && x.alive);
    if (!u) return;
    const c = this.geo.local(u.at);
    const t = this.geo.taille;
    const y = c.y * this.geo.etirement;
    for (let i = 3; i >= 0; i -= 1) {
      const k = 1 + i * 0.24;
      g.poly(flat(blob(c.x, y + t * 0.06, t * 0.78 * k, t * 0.34 * k, { seed: 31 + i, points: 20, wobble: 0.12 }))).fill({
        color: LIGHT.rim,
        alpha: i === 0 ? 0.24 : 0.05,
      });
    }
  }

  update(dtMs: number): void {
    for (const p of this.piles.values()) p.update(dtMs);
  }

  destroy(): void {
    for (const p of this.piles.values()) p.destroy();
    this.piles.clear();
    this.container.destroy({ children: true });
  }
}

/* ═══════════════════════════ Vignette de pile ════════════════════════════ */

/**
 * Vignette carrée d'une pile : portrait de créature encadré, nombre, teinte de
 * camp. Utilisée par la barre d'initiative et par la fiche de gauche.
 */
export function vignettePile(
  atlas: ArtAtlas,
  unit: CombatUnit,
  camp: Camp,
  taille: number,
  options: { nombre?: boolean; actif?: boolean } = {},
): Container {
  const racine = new Container();
  racine.label = `vignette-${unit.uid}`;
  const g = new Graphics();
  const base = melanger(camp.couleur, PALETTE.granitAnthracite, 0.42);

  /* fond : trois strates, jamais un aplat */
  g.roundRect(2, 3, taille, taille, 3).fill({ color: LIGHT.ombrePortee, alpha: 0.34 });
  g.roundRect(0, 0, taille, taille, 3).fill({ color: base });
  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    g.rect(0, t * taille, taille, taille / 6 + 1).fill({
      color: t < 0.5 ? faceEclairee(base, 0.5) : ombreBleutee(base, 0.5),
      alpha: 0.07 + Math.abs(t - 0.5) * 0.12,
    });
  }
  g.poly(flat(blob(taille * 0.3, taille * 0.28, taille * 0.42, taille * 0.36, { seed: 7, points: 14, wobble: 0.22 }))).fill({
    color: LIGHT.chaude,
    alpha: 0.07,
  });
  racine.addChild(g);

  const tex = atlas.creature(unit.creature);
  const s = new Sprite(tex);
  const k = (taille * 0.94) / Math.max(8, tex.height);
  s.scale.set(k);
  s.anchor.set(0.5, 0.96);
  s.position.set(taille / 2, taille * 0.98);
  if (unit.side === 1) s.scale.x = -k;
  racine.addChild(s);

  const cadre = new Graphics();
  cadre.roundRect(0.5, 0.5, taille - 1, taille - 1, 3).stroke({
    color: options.actif ? LIGHT.rim : assombrir(base, 0.5),
    width: options.actif ? 2.2 : 1.3,
    alpha: options.actif ? 0.95 : 0.85,
  });
  /* liseré doré uniquement au sud-est : jamais un contour complet (loi n°4) */
  cadre
    .moveTo(taille - 1.4, 3)
    .lineTo(taille - 1.4, taille - 3)
    .lineTo(3, taille - 1.4);
  cadre.stroke({ color: LIGHT.rim, width: 1.4, alpha: LIGHT.rimAlpha });
  /* bandeau de camp en pied */
  cadre.rect(0, taille - 4, taille, 4).fill({ color: camp.couleur, alpha: 0.92 });
  cadre.rect(0, taille - 4, taille, 1.2).fill({ color: eclaircir(camp.couleur, 0.6), alpha: 0.6 });
  racine.addChild(cadre);

  if (options.nombre !== false) {
    const plaque = plaqueNombre(atlas.materials, unit.count, camp.couleur, Math.max(0.62, taille / 74));
    plaque.position.set(taille * 0.76, taille * 0.84);
    racine.addChild(plaque);
  }
  return racine;
}

/** Camps lus dans l'état de la partie : couleur et motif de chaque bannière. */
export function campsDuCombat(
  combat: CombatState,
  joueurs: Partial<Record<PlayerId, { color: string; pattern: number; name: string }>>,
): Readonly<Record<0 | 1, Camp>> {
  const lire = (id: PlayerId | null, secours: number, motif: number, nom: string): Camp => {
    const j = id ? joueurs[id] : undefined;
    return {
      couleur: couleurDeCss(j?.color, secours),
      motif: j?.pattern ?? motif,
      nom: j?.name ?? nom,
    };
  };
  return {
    0: lire(combat.attacker.player, 0x8c2230, 0, 'Assaillants'),
    1: lire(combat.defender.player, 0x2f6b45, 3, 'Défenseurs'),
  };
}

export { faceDe };
