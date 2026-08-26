/**
 * `apps/client/src/town` — TABLEAU DE CITÉ.
 *
 * Deux tableaux peints, un par maison : la Châtellenie de Granit et l'Ermitage
 * des Bois Noirs. Le fond vient des six panoramas du manifeste
 * (`cite_<faction>_<heure>`, 2048 × 1152, cadrage identique par faction, seule
 * la lumière change) ; tout ce que la cité a bâti est peint par-dessus avec les
 * primitives de `art/`, aux positions déclarées par `packages/content`
 * (`BuildingDef.scene`), seule source de vérité du placement.
 *
 * Ce que le tableau doit à la bible artistique (§5 et les sept lois) :
 *
 *  - parallaxe à six plans, dérive de caméra de ±14 px selon la souris ou
 *    l'inclinaison de l'appareil (`setParallax`) ;
 *  - levée de 700 ms d'un bâtiment neuf — échelle 0,94 → 1, opacité, poussière
 *    au sol (`playBuild`) ;
 *  - trois étalonnages lumineux interpolés : jour 1 aube, jour 4 midi, jour 7
 *    crépuscule (`setHour`) ;
 *  - vie permanente : fumée de forge, bannières, oiseaux, eau, habitants —
 *    amplitude ≤ 3 px, périodes de 2 à 7 s ;
 *  - liseré doré au survol, emplacements libres cliquables, porte de la cité
 *    qui renvoie à la carte.
 *
 * Le repli procédural n'est jamais retiré : si un panorama manque, un paysage
 * de terrasses est peint à sa place et le tableau reste complet.
 *
 * Aucune règle de jeu ici : la vue lit `deps.store`, appelle les rappels de
 * `TownViewCallbacks` et ne calcule ni coût, ni revenu, ni condition.
 */

import { Container, FederatedPointerEvent, Graphics, Rectangle, Sprite, Text, TextStyle, Texture } from 'pixi.js';
import type { BuildingDef, BuildingId, TownState } from '@auvergne/engine';
import { dayOf } from '@auvergne/engine';
import { BUILDINGS, buildingsOf } from '@auvergne/content';
import type { TownHour, TownView, TownViewDeps } from '../view-contract.js';
import type { Effet } from '../art/effects.js';
import { ancreYDe } from '../art/assets.js';
import type { MaterialKey, MaterialSet } from '../art/shading.js';
import { LIGHT, PALETTE, melanger } from '../art/palette.js';
import { densifier, flat, perturber, pt } from '../art/shading.js';
import { hash2 } from '../art/noise.js';
import {
  PALETTE_BATI,
  archetypeDe,
  dessinerBatiment,
  dessinerEmplacement,
  dessinerLisere,
} from './batiments.js';
import type { Archetype, MatieresCite, PaletteBati } from './batiments.js';
import {
  SPRITE_FACTEUR,
  basePct,
  empriseDe,
  planDeMasse,
  clefAssetBatiment,
  moduleDe,
  tailleDe as tailleDeMasse,
  visiblesDe,
} from './masse.js';
import {
  FondCite,
  etalonnageInterpole,
  phaseDeLHeure,
  teinteInterpolee,
  phaseDuJour,
} from './panorama.js';
import type { CadreCite } from './panorama.js';
import { Banniere, Eau, Habitants, Lumieres, Oiseaux } from './vie.js';
import { brancherPincement, echelleBornee, gardePincement } from '../pincement.js';
import { amplitudeDerive } from './camera.js';

/* ═══════════════════════════════ Réglages ════════════════════════════════ */

/** Dérive maximale de la caméra, en pixels (bible artistique §5). */
const DERIVE_MAX = 14;
/** Durée de la levée d'un bâtiment neuf, en millisecondes. */
const LEVEE_MS = 700;
/** Grossissement maximal au pincement : au-delà, la peinture se pixellise. */
const ZOOM_CITE_MAX = 3;

/** Nombre maximal de foyers de fumée simultanés : au-delà, l'image se charge. */
const FUMEES_MAX = 5;

/**
 * Les huit matières peintes du manifeste, branchées sur les emplacements de
 * l'atlas procédural. Une image absente laisse la matière dessinée en place
 * (bible artistique §0.7).
 */
const MATIERES_PEINTES: Readonly<Partial<Record<MaterialKey, string>>> = {
  granit: 'matiere_granit',
  ecorce: 'matiere_ecorce',
  ecailles: 'matiere_ardoise',
  parchemin: 'matiere_parchemin',
  fourrure: 'matiere_cuir',
  plumes: 'matiere_filDor',
  metal: 'matiere_cuivre',
  tissu: 'matiere_tissu',
};

/** Taille native des matières procédurales de `art/shading.ts`. */
const MATIERE_NATIVE = 192;

/**
 * Ancrages propres à chaque tableau : la porte qui renvoie à la carte, les
 * veines d'eau et les allées où passent les habitants. Ce sont des repères de
 * composition, lus sur les panoramas peints, exprimés en pourcentages.
 */
interface AncrageCite {
  porte: { x: number; y: number; largeur: number };
  /** La même porte sur la composition portrait — une autre peinture. */
  portePortrait: { x: number; y: number; largeur: number };
  eau: readonly [number, number, number, number][];
  allees: readonly [number, number, number, number][];
}

/* Le recadrage du repère 0–100 du contenu sur les terrasses réellement
   peintes vit dans `masse.ts` (`TERRAIN_CITE`), par faction ET par
   orientation, aux côtés du module et de la perspective : la vue et le test
   de couverture lisent la même géométrie. */
const ANCRAGES: Readonly<Record<'granit' | 'ermitage', AncrageCite>> = {
  granit: {
    porte: { x: 48.5, y: 88, largeur: 13 },
    portePortrait: { x: 52, y: 66, largeur: 14 },
    eau: [[16, 33, 24, 46]],
    allees: [
      [30, 84, 44, 82],
      [56, 79, 68, 74],
      [38, 70, 50, 68],
      [62, 62, 72, 58],
      [22, 76, 32, 79],
      [48, 58, 58, 55],
    ],
  },
  ermitage: {
    porte: { x: 50, y: 93, largeur: 13 },
    portePortrait: { x: 52, y: 66, largeur: 14 },
    eau: [
      [62, 40, 56, 74],
      [56, 74, 52, 96],
      [70, 44, 64, 56],
    ],
    allees: [
      [26, 78, 40, 74],
      [44, 66, 56, 63],
      [18, 86, 30, 84],
      [64, 70, 74, 66],
      [36, 56, 46, 53],
      [70, 82, 80, 78],
    ],
  },
};

/* ═══════════════════════════ Nœuds de la scène ═══════════════════════════ */

/** Un bâtiment posé : son dessin, son emprise, sa vie et son animation. */
interface NoeudBati {
  id: BuildingId;
  def: BuildingDef;
  archetype: Archetype;
  node: Container;
  corps: Graphics;
  /** Peinture ImageGen facultative ; le corps procédural reste le repli. */
  sprite: Sprite | null;
  lisere: Graphics;
  lumieres: Lumieres;
  bannieres: Banniere[];
  /** position d'ancrage au sol, en pixels du cadre */
  base: { x: number; y: number };
  /** facteur de parallaxe déduit du plan `scene.z` */
  parallaxe: number;
  taille: number;
  emprise: { hw: number; hd: number };
  hauteur: number;
  /** cheminées, en pixels du cadre */
  cheminees: { x: number; y: number; force: number }[];
  /** avancement de la levée, de 0 à 1 ; 1 = bâtiment en place */
  levee: number;
}

/**
 * Clef du manifeste pour un bâtiment réellement posé.
 *
 * Les améliorations partagent l'emprise de leur demeure et n'ont pas de
 * bitmap dans la vague 2 : elles conservent donc leur dessin procédural.
 */
export { clefAssetBatiment };

/** Un emplacement libre, cliquable. */
interface NoeudPlace {
  index: number;
  /** bâtiment qui viendrait s'y poser, pour l'infobulle de la coquille */
  candidat: BuildingId;
  node: Graphics;
  base: { x: number; y: number };
  parallaxe: number;
  rayon: number;
}

/* ═══════════════════════════════ Le tableau ══════════════════════════════ */

class TableauCite implements TownView {
  readonly container = new Container();

  /**
   * La coquille place `container` au centre de la toile (`screens/scene.tsx`) :
   * comme la carte et le combat, on ramène le repère du tableau dans le coin
   * haut-gauche, en pixels écran.
   */
  private readonly racine = new Container();
  /** grossissement courant du tableau (1 = plein cadre) */
  private zoom = 1;
  /** décalage du tableau sous le grossissement, en pixels */
  private decalage = { x: 0, y: 0 };
  /** débranchement du pincer-zoomer */
  private debrancherPince: (() => void) | null = null;

  private readonly fond: FondCite;
  private readonly couchePlaces = new Container();
  private readonly coucheBatis = new Container();
  private readonly coucheParticules = new Container();
  private readonly coucheCiel = new Container();
  private readonly coucheInterface = new Container();
  private readonly gPorte = new Graphics();
  private readonly gLisereeSurvol = new Graphics();

  private readonly pal: PaletteBati;
  private readonly mat: MatieresCite;
  private readonly ancrage: AncrageCite;

  private readonly oiseaux: Oiseaux;
  private readonly eau: Eau;
  private habitants: Habitants;
  private readonly fumees: { effet: Effet; noeud: NoeudBati; dx: number; dy: number }[] = [];
  private readonly poussieres: Effet[] = [];

  private batis: NoeudBati[] = [];
  private places: NoeudPlace[] = [];
  /** Le plan de masse desserré du tableau courant, en % du cadre, par id. */
  private plan: ReadonlyMap<string, { x: number; y: number }> = new Map();

  private town: TownState | null = null;
  private cadre: CadreCite = { x: 0, y: 0, w: 1, h: 1 };
  private module = 100;
  private largeur = 1;
  private hauteur = 1;

  private phaseCible: number;
  private phase: number;
  private parallaxeCible = { x: 0, y: 0 };
  /** Dernière inclinaison retenue, pour la zone morte du gyroscope. */
  private derniereInclinaison: { gamma: number; beta: number } | null = null;
  /** L'étiquette de nom courante — détruite avant chaque nouveau survol. */
  private etiquette: Text | null = null;
  private parallaxe = { x: 0, y: 0 };
  /** Vrai tant que deux doigts pincent : la dérive de caméra ne suit plus. */
  private pinceEnCours = false;
  private survole: BuildingId | null = null;
  private impose: BuildingId | null = null;
  private surPorte = false;
  private temps = 0;
  private detruit = false;
  private cartouche: Text | null = null;
  private legende: Text | null = null;
  private readonly surInclinaison: (e: DeviceOrientationEvent) => void;

  constructor(private readonly deps: TownViewDeps) {
    this.container.label = `cite-${deps.town}`;
    this.pal = PALETTE_BATI[deps.faction];
    this.ancrage = ANCRAGES[deps.faction];
    this.mat = construireMatieres(deps.atlas.materials, deps.atlas);

    this.fond = new FondCite(deps.atlas, deps.faction);

    const etat = deps.store.get().game;
    const jour = etat ? dayOf(etat.turn) : 4;
    this.phaseCible = deps.hour ? phaseDeLHeure(deps.hour) : phaseDuJour(jour);
    this.phase = this.phaseCible;
    this.fond.setPhase(this.phase);

    this.oiseaux = new Oiseaux(deps.quality === 'basse' ? 3 : 7, hash2(deps.town.length, 11, 3) * 1000);
    this.eau = new Eau(this.ancrage.eau, deps.faction);
    this.habitants = new Habitants(this.ancrage.allees, this.pal, 404);

    this.coucheCiel.addChild(this.oiseaux.node);

    this.container.addChild(this.racine);
    this.racine.addChild(
      this.fond.container,
      this.eau.node,
      this.couchePlaces,
      this.coucheBatis,
      this.habitants.node,
      this.gPorte,
      this.coucheParticules,
      this.coucheCiel,
      this.coucheInterface,
    );
    this.coucheInterface.addChild(this.gLisereeSurvol);

    /* Interaction : un seul écouteur sur la racine, résolution par distance.
       Bien plus sobre que vingt-cinq zones de test, et sans faux positifs sur
       les fumées ou les oiseaux, qui ne sont pas cliquables. */
    this.container.eventMode = 'static';
    this.container.cursor = 'default';
    this.container.on('pointermove', this.surDeplacement);
    this.container.on('pointertap', this.surClic);
    this.container.on('pointerleave', this.surSortie);

    this.surInclinaison = (e: DeviceOrientationEvent): void => {
      if (this.detruit || this.deps.reducedMotion) return;
      const gamma = typeof e.gamma === 'number' ? e.gamma : 0;
      const beta = typeof e.beta === 'number' ? e.beta : 0;
      /* ZONE MORTE : le capteur bruite en continu à ±0,2° même téléphone posé
         sur une table — sans ce seuil, tout le tableau micro-tremblait en
         permanence sur mobile (« les bâtiments bougent un peu »). */
      const d = this.derniereInclinaison;
      if (d && Math.abs(gamma - d.gamma) < 0.5 && Math.abs(beta - d.beta) < 0.5) return;
      this.derniereInclinaison = { gamma, beta };
      this.parallaxeCible = {
        x: Math.max(-1, Math.min(1, gamma / 30)),
        y: Math.max(-1, Math.min(1, (beta - 45) / 40)),
      };
    };
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('deviceorientation', this.surInclinaison);
    }

    /*
     * Pincer-zoomer, exigence du propriétaire : « il faut aussi pouvoir
     * zoomer dans la capitale ». Sur un écran de 390 points, une demeure de
     * rang 1 fait une trentaine de pixels — on ne joue pas ce qu'on ne voit
     * pas. Le geste agrandit la RACINE du tableau autour du point pincé ; le
     * geste à un doigt reste au jeu (choisir un bâtiment, un emplacement).
     */
    const toile = deps.app.canvas as HTMLCanvasElement | undefined;
    if (toile && typeof toile.addEventListener === 'function') {
      this.debrancherPince = brancherPincement(toile, {
        surFin: () => {
          this.pinceEnCours = false;
          this.gardePince.surFin();
        },
        surPincement: (g) => {
          if (this.detruit) return;
          /* Les deux doigts produisent des `pointermove` en rafale, dans un
             repère qui se dilate : la dérive de caméra cesse de les écouter. */
          this.pinceEnCours = true;
          const { echelle, applique } = echelleBornee(this.zoom, g.facteur, 1, ZOOM_CITE_MAX);
          this.zoom = echelle;
          /* Le point pincé ne doit pas glisser sous les doigts : on corrige
             le décalage du même facteur, autour de ce point. */
          const cx = g.centreX - this.largeur / 2;
          const cy = g.centreY - this.hauteur / 2;
          this.decalage.x = cx - (cx - this.decalage.x) * applique + g.deplaceX;
          this.decalage.y = cy - (cy - this.decalage.y) * applique + g.deplaceY;
          this.appliquerZoom();
        },
      });
    }
  }

  /**
   * Applique grossissement et déplacement, en bornant le débord.
   *
   * La POSITION de `container` appartient à la coquille, qui le centre sur la
   * toile : on ne la touche pas. Le grossissement passe par son échelle, et
   * le déplacement par la racine interne — en unités locales, donc divisé
   * par le grossissement.
   */
  private appliquerZoom(): void {
    /* On ne laisse jamais voir le vide autour du tableau : le débord permis
       est exactement ce que le grossissement a gagné. */
    const marge = (taille: number): number => Math.max(0, (taille * (this.zoom - 1)) / 2);
    const mx = marge(this.largeur);
    const my = marge(this.hauteur);
    this.decalage.x = Math.max(-mx, Math.min(mx, this.decalage.x));
    this.decalage.y = Math.max(-my, Math.min(my, this.decalage.y));
    this.container.scale.set(this.zoom);
    this.racine.position.set(
      -this.largeur / 2 + this.decalage.x / this.zoom,
      -this.hauteur / 2 + this.decalage.y / this.zoom,
    );
  }

  /* ────────────────────────────── Pilotage ─────────────────────────────── */

  setTown(town: TownState): void {
    const change =
      !this.town ||
      this.town.uid !== town.uid ||
      this.town.built.length !== town.built.length ||
      this.town.built.some((b, i) => b !== town.built[i]);
    this.town = town;
    if (change) this.construire();
    else this.ecrireCartouche();
  }

  setHour(hour: TownHour): void {
    this.phaseCible = phaseDeLHeure(hour);
    if (this.deps.reducedMotion) {
      this.phase = this.phaseCible;
      this.appliquerHeure();
    }
  }

  highlightBuilding(building: BuildingId | null): void {
    this.impose = building;
    this.rafraichirLisere();
  }

  async playBuild(building: BuildingId): Promise<void> {
    const noeud = this.batis.find((b) => b.id === building);
    if (!noeud) return;
    if (this.deps.reducedMotion) {
      noeud.levee = 1;
      this.appliquerLevee(noeud);
      return;
    }
    noeud.levee = 0;
    this.appliquerLevee(noeud);
    this.semerPoussiere(noeud);
    await new Promise<void>((resolve) => {
      const debut = this.temps;
      const attendre = (): void => {
        if (this.detruit || noeud.levee >= 1 || this.temps - debut > LEVEE_MS * 2) {
          resolve();
          return;
        }
        setTimeout(attendre, 40);
      };
      setTimeout(attendre, 40);
    });
  }

  setParallax(x: number, y: number): void {
    this.parallaxeCible = {
      x: Math.max(-1, Math.min(1, x)),
      y: Math.max(-1, Math.min(1, y)),
    };
  }

  /* ───────────────────────────── Cycle de vie ──────────────────────────── */

  resize(width: number, height: number): void {
    this.largeur = Math.max(1, width);
    this.hauteur = Math.max(1, height);
    this.cadre = this.fond.disposer(this.largeur, this.hauteur);
    /* Le module vit dans `masse.ts`, avec sa majoration portrait : le cadre
       vertical est étroit et la citadelle y occupe moitié moins du cadre —
       sans elle, les bâtiments tombaient à 13 % de la hauteur de la citadelle
       contre 30 % en paysage. */
    this.module = moduleDe(this.cadre.w, this.fond.portrait);
    this.appliquerZoom();
    this.container.hitArea = new Rectangle(
      -this.largeur / 2,
      -this.hauteur / 2,
      this.largeur,
      this.hauteur,
    );
    this.eau.disposer(this.cadre);
    this.oiseaux.disposer(this.cadre);
    this.habitants.disposer(this.cadre, Math.max(0.7, this.cadre.w / 1400));
    this.construire();
  }

  update(dtMs: number): void {
    if (this.detruit) return;
    const dt = Math.max(0, Math.min(100, dtMs));
    this.temps += dt;
    const immobile = this.deps.reducedMotion;

    /* Heure : fondu lent entre deux étalonnages. */
    if (Math.abs(this.phase - this.phaseCible) > 0.001) {
      const pas = dt / 900;
      this.phase += Math.sign(this.phaseCible - this.phase) * Math.min(pas, Math.abs(this.phaseCible - this.phase));
      this.appliquerHeure();
    }

    /* Caméra : amortissement, puis report sur chaque plan. */
    if (immobile) {
      this.parallaxe = { x: 0, y: 0 };
    } else {
      const k = Math.min(1, dt / 220);
      this.parallaxe.x += (this.parallaxeCible.x - this.parallaxe.x) * k;
      this.parallaxe.y += (this.parallaxeCible.y - this.parallaxe.y) * k;
    }
    const { dx, dy } = this.derive();
    /* Ce qui est peint dans le panorama — la porte, l'eau, les allées — dérive
       avec lui, sinon les repères se décollent de la peinture. Seuls les
       bâtiments posés par-dessus prennent la pleine dérive de leur plan. */
    this.fond.container.position.set(dx * 0.16, dy * 0.16);
    this.eau.node.position.set(dx * 0.2, dy * 0.2);
    this.coucheCiel.position.set(dx * 0.08, dy * 0.08);
    this.habitants.node.position.set(dx * 0.28, dy * 0.28);
    this.gPorte.position.set(dx * 0.16, dy * 0.16);

    for (const b of this.batis) {
      /* Levée de 700 ms : échelle 0,94 → 1 et opacité (bible artistique §5). */
      if (b.levee < 1) {
        b.levee = Math.min(1, b.levee + dt / LEVEE_MS);
        this.appliquerLevee(b);
      }
      const f = b.parallaxe;
      b.node.position.set(b.base.x + dx * f, b.base.y + dy * f);
      for (const ban of b.bannieres) ban.animer(this.temps, immobile);
      b.lumieres.update(dt, immobile);
    }
    for (const p of this.places) {
      p.node.position.set(p.base.x + dx * p.parallaxe, p.base.y + dy * p.parallaxe);
      p.node.alpha = immobile ? 0.62 : 0.5 + 0.16 * Math.sin(this.temps / 2600 + p.index * 1.7);
    }

    /* Fumées : elles suivent leur bâtiment, donc son plan de parallaxe. */
    for (const f of this.fumees) {
      f.effet.position.set(f.noeud.node.x + f.dx, f.noeud.node.y + f.dy);
      if (!immobile) f.effet.update(dt / 1000);
    }
    for (let i = this.poussieres.length - 1; i >= 0; i -= 1) {
      const p = this.poussieres[i];
      p.update(dt / 1000);
      if (p.termine) {
        p.destroy({ children: true });
        this.poussieres.splice(i, 1);
      }
    }

    this.oiseaux.update(dt, immobile);
    this.eau.update(dt, immobile);
    this.habitants.update(dt, immobile);

    /* Respiration du liseré doré et de la porte. */
    const battement = immobile ? 1 : 0.82 + 0.18 * Math.sin(this.temps / 1400);
    for (const b of this.batis) if (b.lisere.visible) b.lisere.alpha = battement;
    this.gPorte.alpha = this.surPorte ? 1 : immobile ? 0.86 : 0.78 + 0.1 * Math.sin(this.temps / 2300);
  }

  destroy(): void {
    if (this.detruit) return;
    this.detruit = true;
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('deviceorientation', this.surInclinaison);
    }
    this.container.off('pointermove', this.surDeplacement);
    this.container.off('pointertap', this.surClic);
    this.container.off('pointerleave', this.surSortie);
    this.debrancherPince?.();
    this.debrancherPince = null;
    this.container.destroy({ children: true });
  }

  /* ══════════════════════════ Construction du tableau ═══════════════════ */

  private construire(): void {
    if (this.detruit) return;
    const town = this.town ?? this.deps.store.get().game?.towns[this.deps.town] ?? null;
    this.town = town;

    for (const f of this.fumees) f.effet.destroy({ children: true });
    this.fumees.length = 0;
    this.coucheBatis.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.couchePlaces.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.batis = [];
    this.places = [];

    const bâtis = new Set<string>(town?.built ?? []);
    const catalogue = buildingsOf(this.deps.faction);

    /* — Les bâtiments levés. Une amélioration remplace sa demeure sur la même
       emprise (`visiblesDe`). — */
    const poses = visiblesDe(catalogue, bâtis);

    /* — Les emplacements encore libres : ce que la cité peut lever ensuite.
       Un seul jalon par emprise : deux chaînes ne se disputent pas la place. — */
    const occupees = new Set<string>(poses.map(empriseDe));
    const libres: BuildingDef[] = [];
    for (const def of catalogue
      .filter((d) => !bâtis.has(d.id) && d.requires.every((r) => bâtis.has(r)))
      .sort((a, b) => a.scene.y - b.scene.y)) {
      const cle = empriseDe(def);
      if (occupees.has(cle)) continue;
      occupees.add(cle);
      libres.push(def);
    }

    /* — Le plan de masse, calculé UNE fois pour tout ce qui se pose. Les
         chantiers vides en font partie : ils occupent la place qu'occupera le
         bâtiment, sinon le tableau se réorganiserait le jour de sa levée. — */
    this.plan = planDeMasse([...poses, ...libres], this.deps.faction, this.fond.portrait);

    /* Du fond vers le premier plan : l'ordre suit le pied RÉEL — terrasses et
       desserrage compris — pas la position déclarée. */
    const piedY = (d: BuildingDef): number =>
      this.plan.get(d.id)?.y ?? basePct(d, this.deps.faction, this.fond.portrait).y;
    poses.sort((a, b) => piedY(a) - piedY(b) || a.scene.z - b.scene.z);

    for (const def of poses) this.poserBatiment(def);
    libres.forEach((def, index) => this.poserEmplacement(def, index));

    this.peindrePorte();
    this.ecrireCartouche();
    this.appliquerHeure();
    this.rafraichirLisere();
  }

  private poserBatiment(def: BuildingDef): void {
    const graine = Math.abs(hashTexte(def.id));
    const taille = this.tailleDe(def);
    const node = new Container();
    node.label = `bati-${def.id}`;

    const lisere = new Graphics();
    lisere.visible = false;
    const corps = new Graphics();
    const archetype = archetypeDe(def);
    const dessin = dessinerBatiment(corps, this.mat, this.pal, archetype, taille, graine);

    const clefAsset = clefAssetBatiment(def.id);
    const sprite = clefAsset && this.deps.atlas.hasIcon(clefAsset)
      ? new Sprite(this.deps.atlas.icon(clefAsset) as Texture)
      : null;
    if (sprite) {
      sprite.label = clefAsset!;
      /* L'ancre suit le PIED PEINT de chaque image (bas de la masse opaque,
         mesuré sur la couche alpha et porté au manifeste) : l'ancre unique
         de 0,97 laissait de 2 à 10 px de vide sous les façades — jusqu'à
         ~32 px au zoom 3 sous le caravansérail (pied peint à 0,932). */
      sprite.anchor.set(0.5, ancreYDe(clefAsset!) ?? 0.965);
      /* Le WebP est un canevas carré dont l'occupation encode déjà l'échelle
         relative des rangs. Le module fixe sa taille dans le panorama. */
      sprite.width = taille * SPRITE_FACTEUR;
      sprite.height = taille * SPRITE_FACTEUR;
      sprite.eventMode = 'none';
    }

    dessinerLisere(lisere, dessin.emprise.hw * 1.16, dessin.emprise.hd * 1.16, dessin.hauteur);

    /* Les fenêtres qui s'allument au crépuscule sont celles du dessin
       procédural : sur une peinture, elles tombent à côté des fenêtres
       peintes et font des pastilles blanches sur les façades. La peinture
       porte déjà ses fenêtres éclairées. */
    const lumieres = new Lumieres(sprite ? [] : dessin.fenetres, graine);
    const bannieres: Banniere[] = [];
    node.addChild(lisere, sprite ?? corps, lumieres.node);
    for (const b of dessin.bannieres) {
      const ban = new Banniere(this.pal, b.taille, graine + Math.round(b.x));
      ban.node.position.set(b.x + Math.max(1.5, taille * 0.012), b.y + taille * 0.02);
      bannieres.push(ban);
      node.addChild(ban.node);
    }

    const base = this.piedDe(def);
    node.position.set(base.x, base.y);

    const noeud: NoeudBati = {
      id: def.id,
      def,
      archetype,
      node,
      corps,
      sprite,
      lisere,
      lumieres,
      bannieres,
      base,
      /* PRESQUE le plan du sol peint (0,16), à peine étagé par la profondeur.
         L'ancien barème (0,34 + z×0,132, jusqu'à 1,0) faisait glisser les
         pieds jusqu'à ~12 px sur les terrasses peintes à chaque mouvement de
         souris — mesuré, c'est ce qui se lisait « les bâtiments bougent ».
         Le différentiel est maintenant borné à (0,26−0,16)×14 = 1,4 px. */
      parallaxe: 0.16 + Math.max(0, Math.min(5, def.scene.z)) * 0.02,
      taille,
      emprise: dessin.emprise,
      hauteur: dessin.hauteur,
      cheminees: dessin.cheminees.map((c) => ({ ...c })),
      levee: 1,
    };
    this.coucheBatis.addChild(node);
    this.batis.push(noeud);
  }

  private poserEmplacement(def: BuildingDef, index: number): void {
    const g = new Graphics();
    g.label = `place-${def.id}`;
    const taille = this.tailleDe(def);
    dessinerEmplacement(g, this.pal, taille, Math.abs(hashTexte(def.id)));
    const base = this.piedDe(def);
    g.position.set(base.x, base.y);
    this.couchePlaces.addChild(g);
    this.places.push({
      index,
      candidat: def.id,
      node: g,
      base,
      /* Même plan que les bâtiments : un emplacement est un morceau de sol. */
      parallaxe: 0.16 + Math.max(0, Math.min(5, def.scene.z)) * 0.02,
      rayon: taille * 0.45,
    });
  }

  /** Module de base × échelle déclarée × raccourci de perspective. */
  private tailleDe(def: BuildingDef): number {
    return tailleDeMasse(def, this.module);
  }

  private pointDe(xPct: number, yPct: number): { x: number; y: number } {
    return {
      x: this.cadre.x + (this.cadre.w * xPct) / 100,
      y: this.cadre.y + (this.cadre.h * yPct) / 100,
    };
  }

  /**
   * Pied d'un bâtiment : sa place dans le plan de masse desserré. Le repli sur
   * `basePct` ne sert qu'aux bâtiments qui ne figurent pas au plan — il n'y en
   * a pas, mais un pied manquant vaut mieux qu'un tableau qui ne se dessine pas.
   */
  private piedDe(def: BuildingDef): { x: number; y: number } {
    const p = this.plan.get(def.id) ?? basePct(def, this.deps.faction, this.fond.portrait);
    return this.pointDe(p.x, p.y);
  }

  /** La porte du panorama affiché : la composition portrait a la sienne. */
  private porteActive(): { x: number; y: number; largeur: number } {
    return this.fond.portrait ? this.ancrage.portePortrait : this.ancrage.porte;
  }

  /* ── La porte : le seul chemin de retour vers la carte ── */

  private peindrePorte(): void {
    const g = this.gPorte;
    g.clear();
    const p = this.porteActive();
    const c = this.pointDe(p.x, p.y);
    const w = (this.cadre.w * p.largeur) / 100;
    const h = w * 0.62;

    /* Arche d'entrée, dessinée à la craie d'or sur la peinture. */
    const arche: { x: number; y: number }[] = [];
    const n = 22;
    for (let i = 0; i <= n; i += 1) {
      const a = Math.PI + (Math.PI * i) / n;
      arche.push(pt(c.x + Math.cos(a) * w * 0.5, c.y + Math.sin(a) * h * 0.8));
    }
    g.poly(flat(perturber(densifier(arche, 8), 0.5, 61))).stroke({
      color: LIGHT.rim,
      width: Math.max(1.6, w * 0.022),
      alpha: 0.75,
      cap: 'round',
      join: 'round',
    });
    g.poly([
      c.x - w * 0.5,
      c.y,
      c.x + w * 0.5,
      c.y,
      c.x + w * 0.5,
      c.y + h * 0.14,
      c.x - w * 0.5,
      c.y + h * 0.14,
    ]).fill({ color: LIGHT.rim, alpha: 0.14 });

    /* Chevron vers le bas : on sort par là. */
    const cy = c.y + h * 0.34;
    g.moveTo(c.x - w * 0.12, cy)
      .lineTo(c.x, cy + w * 0.09)
      .lineTo(c.x + w * 0.12, cy)
      .stroke({ color: LIGHT.rim, width: Math.max(1.6, w * 0.022), alpha: 0.85, cap: 'round', join: 'round' });

    /* Cartouche de parchemin, posé au-dessus de l'arche : au pied de la
       muraille, il tomberait sous le bord de la toile. */
    const th = Math.max(18, w * 0.19);
    const ty = c.y - h * 0.86 - th - Math.max(6, w * 0.04);

    /*
     * LE CARTOUCHE EST TAILLÉ SUR SON TEXTE, ET NON L'INVERSE.
     *
     * Il valait `w * 1.06` — c'est-à-dire la largeur de la PORTE — et le corps
     * du texte se déduisait de la HAUTEUR du cartouche. Rien ne comparait donc
     * jamais la largeur du libellé à celle du cadre qui devait le contenir. Sur
     * un iPhone, où la porte est étroite, « QUITTER LA CITÉ » débordait des deux
     * côtés : mesuré au quadruple sur capture, le Q dehors à gauche et « ITÉ »
     * coupé à droite. La seule commande de sortie de la cité s'affichait
     * tronquée.
     *
     * On construit donc le texte d'abord, on le mesure, et le cartouche prend
     * au moins cette largeur plus une gouttière. La porte ne fixe plus qu'un
     * plancher.
     */
    if (this.legende) this.legende.destroy();
    this.legende = new Text({
      text: 'QUITTER LA CITÉ',
      style: new TextStyle({
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: Math.max(9, Math.round(th * 0.5)),
        letterSpacing: Math.max(1, th * 0.07),
        fill: PALETTE.encre,
        align: 'center',
      }),
    });
    const tw = Math.max(w * 1.06, this.legende.width + th * 0.9);
    g.poly(
      flat(
        perturber(
          densifier(
            [
              pt(c.x - tw / 2, ty),
              pt(c.x + tw / 2, ty),
              pt(c.x + tw / 2, ty + th),
              pt(c.x - tw / 2, ty + th),
            ],
            10,
          ),
          0.6,
          73,
        ),
      ),
    ).fill({ color: melanger(PALETTE.parchemin, LIGHT.froide, 0.18), alpha: 0.88 });
    g.poly([
      c.x - tw / 2,
      ty,
      c.x + tw / 2,
      ty,
      c.x + tw / 2,
      ty + th,
      c.x - tw / 2,
      ty + th,
    ]).stroke({ color: LIGHT.rim, width: 1.2, alpha: 0.8 });

    this.legende.anchor.set(0.5);
    this.legende.position.set(c.x, ty + th / 2);
    this.gPorte.addChild(this.legende);
  }

  /* ── Cartouche des chantiers, en haut à droite ── */

  /**
   * La coquille affiche déjà le nom de la cité dans son bandeau : on n'y revient
   * pas. Le tableau annonce seulement ce qu'il reste à lever, là où l'œil ne
   * cherche pas la peinture.
   */
  private ecrireCartouche(): void {
    if (this.cartouche) {
      this.cartouche.destroy();
      this.cartouche = null;
    }
    if (!this.town) return;
    const libres = this.places.length;
    if (libres === 0) return;
    const texte = new Text({
      text: `${libres} emplacement${libres > 1 ? 's' : ''} à bâtir`,
      style: new TextStyle({
        fontFamily: 'Cinzel, Georgia, serif',
        fontSize: Math.max(12, Math.round(this.largeur * 0.0095)),
        letterSpacing: 2.2,
        fill: 0xede3ce,
        align: 'right',
        dropShadow: { color: LIGHT.ombrePortee, alpha: 0.8, blur: 5, distance: 2, angle: Math.PI / 4 },
      }),
    });
    texte.label = 'cartouche-cite';
    texte.anchor.set(1, 0);
    texte.position.set(Math.round(this.largeur * 0.982), Math.round(this.hauteur * 0.028));
    this.coucheInterface.addChild(texte);
    this.cartouche = texte;
  }

  /* ══════════════════════════ Heure et lumière ══════════════════════════ */

  private appliquerHeure(): void {
    this.fond.setPhase(this.phase);
    const cal = etalonnageInterpole(this.phase);
    /* Les bâtiments partagent la lumière du panorama : teinte multiplicative. */
    const teinte = teinteInterpolee(this.phase, this.deps.faction);
    this.coucheBatis.tint = teinte;
    this.couchePlaces.tint = teinte;
    this.habitants.node.tint = teinte;
    for (const b of this.batis) {
      const feu = b.archetype === 'forge' ? 1 : 0;
      b.lumieres.setForce(Math.min(1, cal.fenetres + feu * 0.35));
    }
    this.reglerFumees();
  }

  /**
   * Les foyers fument selon l'heure : la forge en permanence, les demeures au
   * petit matin et le soir. Cinq foyers au plus, choisis par force décroissante.
   */
  private reglerFumees(): void {
    for (const f of this.fumees) f.effet.destroy({ children: true });
    this.fumees.length = 0;
    if (this.deps.quality === 'basse') return;

    const cal = etalonnageInterpole(this.phase);
    /* Même à midi une cuisine tire : le foyer ne s'éteint jamais tout à fait. */
    const froid = Math.max(cal.fenetres, 0.6);
    const candidats: { noeud: NoeudBati; c: { x: number; y: number; force: number }; poids: number }[] = [];
    for (const b of this.batis) {
      for (const c of b.cheminees) {
        const poids = c.force * (b.archetype === 'forge' ? 1.8 : froid);
        if (poids < 0.2) continue;
        candidats.push({ noeud: b, c, poids });
      }
    }
    candidats.sort((a, b) => b.poids - a.poids);
    for (const cand of candidats.slice(0, FUMEES_MAX)) {
      const effet = this.deps.atlas.effet('fumee', {
        largeur: cand.noeud.taille * 0.1,
        hauteur: cand.noeud.taille * 0.08,
        intensite: Math.min(1.5, cand.poids) * (this.deps.quality === 'haute' ? 1 : 0.6),
        graine: Math.abs(hashTexte(cand.noeud.id)) % 9973,
      });
      effet.scale.set(Math.max(0.35, cand.noeud.taille / 190));
      this.coucheParticules.addChild(effet);
      this.fumees.push({ effet, noeud: cand.noeud, dx: cand.c.x, dy: cand.c.y });
    }
  }

  private semerPoussiere(noeud: NoeudBati): void {
    if (this.deps.quality === 'basse') return;
    const effet = this.deps.atlas.effet('poussiere', {
      largeur: noeud.emprise.hw * 1.6,
      hauteur: noeud.emprise.hd * 0.8,
      intensite: 1.4,
      duree: LEVEE_MS / 1000 + 0.5,
      graine: Math.abs(hashTexte(noeud.id)) % 7919,
    });
    effet.position.set(noeud.node.x, noeud.node.y + noeud.emprise.hd * 0.4);
    this.coucheParticules.addChild(effet);
    this.poussieres.push(effet);
  }

  private appliquerLevee(b: NoeudBati): void {
    const t = Math.max(0, Math.min(1, b.levee));
    /* Courbe d'interface de la bible : départ franc, arrivée posée. */
    const e = 1 - Math.pow(1 - t, 3);
    b.node.scale.set(0.94 + 0.06 * e);
    b.node.alpha = Math.min(1, e * 1.25);
  }

  /* ═════════════════════════════ Interaction ════════════════════════════ */

  private readonly surDeplacement = (e: FederatedPointerEvent): void => {
    if (this.detruit) return;
    const p = e.getLocalPosition(this.racine);
    if (!this.deps.reducedMotion && !this.pinceEnCours) {
      this.parallaxeCible = {
        x: Math.max(-1, Math.min(1, (p.x / this.largeur) * 2 - 1)),
        y: Math.max(-1, Math.min(1, (p.y / this.hauteur) * 2 - 1)),
      };
    }
    const cible = this.cibleSous(p.x, p.y);
    this.surPorte = cible.kind === 'porte';
    const survole = cible.kind === 'bati' ? cible.id : null;
    this.container.cursor = cible.kind === 'rien' ? 'default' : 'pointer';
    if (survole !== this.survole) {
      this.survole = survole;
      this.rafraichirLisere();
      this.deps.onHoverBuilding?.(survole);
    }
  };

  private readonly surSortie = (): void => {
    if (this.detruit) return;
    this.parallaxeCible = { x: 0, y: 0 };
    this.surPorte = false;
    if (this.survole) {
      this.survole = null;
      this.rafraichirLisere();
      this.deps.onHoverBuilding?.(null);
    }
  };

  /** Le relâché qui clôt un pincement n'est pas un clic. */
  private readonly gardePince = gardePincement();

  private readonly surClic = (e: FederatedPointerEvent): void => {
    if (this.detruit) return;
    /* Le relâché qui clôt un pincement n'est pas un choix de bâtiment :
       `brancherPincement` demande à l'appelant d'ignorer le prochain relâché,
       et `surFin` est là pour cela. Sans cette garde, lever les doigts après
       un zoom sélectionnait le bâtiment qui se trouvait dessous. */
    if (this.gardePince.avaleLeClic()) return;
    const p = e.getLocalPosition(this.racine);
    const cible = this.cibleSous(p.x, p.y);
    if (cible.kind === 'porte') this.deps.onLeave?.();
    else if (cible.kind === 'bati') this.deps.onPickBuilding?.(cible.id);
    else if (cible.kind === 'place') this.deps.onPickPlot?.(cible.index);
  };

  /**
   * Dérive de caméra courante, en pixels du cadre. Éteinte au grossissement :
   * une respiration du panorama au repos devient du flottement dès qu'on est
   * entré dedans (`camera.ts`).
   */
  private derive(): { dx: number; dy: number } {
    const amplitude = amplitudeDerive(this.zoom);
    return {
      dx: this.parallaxe.x * DERIVE_MAX * amplitude,
      dy: this.parallaxe.y * DERIVE_MAX * 0.5 * amplitude,
    };
  }

  /** Résolution du survol : du premier plan vers le fond, la porte d'abord. */
  private cibleSous(
    x: number,
    y: number,
  ):
    | { kind: 'rien' }
    | { kind: 'porte' }
    | { kind: 'bati'; id: BuildingId }
    | { kind: 'place'; index: number } {
    /* LA MÊME dérive que celle qui dessine : une boîte de clic qui suivrait
       une autre dérive que le dessin viserait à côté du bâtiment. */
    const { dx, dy } = this.derive();

    const porte = this.porteActive();
    const c = this.pointDe(porte.x, porte.y);
    const pw = (this.cadre.w * porte.largeur) / 100;
    const px = c.x + dx * 0.16;
    const py = c.y + dy * 0.16;
    if (x > px - pw * 0.62 && x < px + pw * 0.62 && y > py - pw * 0.62 && y < py + pw * 0.42) {
      return { kind: 'porte' };
    }

    for (let i = this.batis.length - 1; i >= 0; i -= 1) {
      const b = this.batis[i];
      const bx = b.base.x + dx * b.parallaxe;
      const by = b.base.y + dy * b.parallaxe;
      if (
        x > bx - b.emprise.hw * 1.05 &&
        x < bx + b.emprise.hw * 1.05 &&
        y > by - b.hauteur - b.emprise.hd * 2.1 &&
        y < by + b.emprise.hd * 1.15
      ) {
        return { kind: 'bati', id: b.id };
      }
    }

    for (let i = this.places.length - 1; i >= 0; i -= 1) {
      const p = this.places[i];
      const px = p.base.x + dx * p.parallaxe;
      const py = p.base.y + dy * p.parallaxe;
      if (Math.abs(x - px) < p.rayon && Math.abs(y - py) < p.rayon * 0.62) {
        return { kind: 'place', index: p.index };
      }
    }
    return { kind: 'rien' };
  }

  private rafraichirLisere(): void {
    const actif = this.impose ?? this.survole;
    for (const b of this.batis) b.lisere.visible = b.id === actif;
    const g = this.gLisereeSurvol;
    g.clear();
    this.etiquette?.destroy();
    this.etiquette = null;
    /* `clear()` n'efface QUE la géométrie du Graphics — jamais ses enfants
       (Pixi v8). Le `Text` du nom survivait donc à chaque changement de
       survol et les anciens noms restaient affichés à leur place : c'étaient
       eux, les « noms qui se chevauchent ». On détruit l'étiquette courante
       avant d'en poser une autre — même motif que le cartouche de la porte. */
    if (!actif) return;
    const b = this.batis.find((n) => n.id === actif);
    if (!b) return;
    /* Un discret cartouche de nom au-dessus du bâtiment mis en avant. Le
       texte se mesure AVANT le cartouche : un nom long débordait du cadre
       calculé à la longueur de chaîne. */
    const def = BUILDINGS[actif] ?? b.def;
    const x = b.node.x;
    const y = b.node.y - b.hauteur - b.emprise.hd * 2.6;
    const h = Math.max(20, this.largeur * 0.017);
    const t = new Text({
      text: def.name,
      style: new TextStyle({
        fontFamily: '"EB Garamond", Georgia, serif',
        fontSize: Math.max(11, Math.round(h * 0.58)),
        fill: PALETTE.encre,
        align: 'center',
      }),
    });
    const w = Math.max(120, t.width + h * 0.9);
    g.poly(
      flat(
        perturber(
          densifier([pt(x - w / 2, y - h), pt(x + w / 2, y - h), pt(x + w / 2, y), pt(x - w / 2, y)], 9),
          0.6,
          19,
        ),
      ),
    ).fill({ color: melanger(PALETTE.parchemin, LIGHT.froide, 0.14), alpha: 0.93 });
    g.poly([x - w / 2, y - h, x + w / 2, y - h, x + w / 2, y, x - w / 2, y]).stroke({
      color: LIGHT.rim,
      width: 1.2,
      alpha: 0.85,
    });
    t.anchor.set(0.5);
    t.position.set(x, y - h / 2);
    g.addChild(t);
    this.etiquette = t;
  }
}

/* ═══════════════════════════════ Utilitaires ═════════════════════════════ */

/** Hachage stable d'un identifiant, pour des graines reproductibles. */
function hashTexte(texte: string): number {
  let h = 2166136261;
  for (let i = 0; i < texte.length; i += 1) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

/** Deux bâtiments d'une même chaîne partagent la même emprise sur le tableau. */

/**
 * Compose le jeu de matières du tableau : chaque emplacement de l'atlas
 * procédural est remplacé par la matière peinte correspondante quand elle
 * existe. Le facteur d'échelle compense la différence de taille native pour que
 * le grain reste identique dans les deux cas.
 */
function construireMatieres(
  base: MaterialSet,
  atlas: { hasIcon(k: string): boolean; icon(k: string): Texture },
): MatieresCite {
  const set: Record<string, Texture> = { ...base };
  const facteur: Record<string, number> = {};
  for (const cle of Object.keys(base) as MaterialKey[]) {
    facteur[cle] = 1;
    const clefImage = MATIERES_PEINTES[cle];
    if (!clefImage || !atlas.hasIcon(clefImage)) continue;
    const tex = atlas.icon(clefImage);
    if (!tex || !tex.source || tex.width < 8) continue;
    /* Une matière peinte n'est utile que si elle peut se répéter. */
    tex.source.addressMode = 'repeat';
    set[cle] = tex;
    facteur[cle] = MATIERE_NATIVE / tex.width;
  }
  return { set: set as MaterialSet, facteur: facteur as Record<MaterialKey, number> };
}

/* ────────────────────────────── La fabrique ─────────────────────────────── */

/**
 * Fabrique du tableau de cité. **Signature imposée** par
 * `apps/client/src/view-contract.ts` : ne pas la changer.
 */
export async function createTownView(deps: TownViewDeps): Promise<TownView> {
  const vue = new TableauCite(deps);
  const etat = deps.store.get().game?.towns[deps.town];
  if (etat) vue.setTown(etat);
  vue.resize(deps.width, deps.height);
  return vue;
}

export type { TownView, TownViewDeps, TownHour } from '../view-contract.js';

/* Réexports de confort pour les planches de contrôle et les tests. */
export { PALETTE_BATI, archetypeDe } from './batiments.js';
export { ETALONNAGES, cadrerPanorama, phaseDuJour } from './panorama.js';
