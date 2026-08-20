/**
 * `apps/client/src/battle` — RENDU DU COMBAT TACTIQUE.
 *
 * `createBattleView` monte le champ de bataille hexagonal complet :
 *
 *   `field.ts`      le sol peint selon la région, la trame gravée, les obstacles
 *   `units.ts`      les piles montées sur les rigs de l'atlas
 *   `hexgrid.ts`    portée, chemin, menaces, curseur d'attaque
 *   `preview.ts`    la carte de prévisualisation d'attaque, chiffrée et justifiée
 *   `initiative.ts` la barre d'initiative
 *   `anim.ts`       la file d'animations pilotée par les `GameEvent`
 *   `spells.ts`     grimoire, ciblage, auras d'école
 *   `siege.ts`      porte, remparts, tours, projectiles
 *   `vfx.ts`        impacts, poussière, sang stylisé, nombres de pertes
 *
 * **Aucune règle n'est calculée ici.** Les portées viennent de
 * `reachableHexes`, les chemins de `hexPath`, les dégâts de `damageRange`, la
 * file d'initiative de `CombatState.order`, la validité des actions de
 * `canUseAbility` et `canCastSpell`. La vue lit l'état et émet des `Command`.
 *
 * Disposition : barre d'initiative en haut, fiche de la pile à gauche, actions
 * en bas, historique et modificateurs à droite. En portrait sur téléphone, les
 * deux panneaux latéraux cèdent la place à un panneau inférieur rétractable et
 * la grille s'allonge légèrement ; les cibles tactiles restent à 48 px.
 */

import { Container, Graphics, Rectangle } from 'pixi.js';
import type { FederatedPointerEvent } from 'pixi.js';
import {
  activeUnit,
  attackAngle,
  canCastSpell,
  canUseAbility,
  chooseCombatAction,
  describeAbility,
  effectiveAttack,
  effectiveDefense,
  effectiveInitiative,
  effectiveSpeed,
  findUnit,
  hexDistance,
  hexPath,
  livingUnits,
  movementPoints,
  reachableAttackHexes,
  reachableHexes,
  terrainLabel,
  unitDef,
  unitLabel,
  unitTotalHp,
  weatherLabel,
} from '@auvergne/engine';
import type {
  AttackAngle,
  CombatAction,
  CombatLogEntry,
  CombatState,
  CombatUnit,
  GameEvent,
  HexCoord,
  HeroInstance,
  PlayerId,
  SpellId,
} from '@auvergne/engine';
import type { AttackPreview, BattleView, BattleViewDeps } from '../view-contract.js';
import { LIGHT, PALETTE, assombrir, melanger } from '../art/palette.js';
import { blob, degradeLineaire, degradeRadial, flat } from '../art/shading.js';
import { ChampDeBataille, AMBIANCE_LABELS } from './field.js';
import { CoucheGrille, Geometrie, cadrerPlateau, zonesDeMenace } from './hexgrid.js';
import { CoucheUnites, campsDuCombat, vignettePile, type Camp } from './units.js';
import { BarreInitiative } from './initiative.js';
import { CarteApercu, construireApercu, enrichirApercu, libelleEffet, type ApercuComplet } from './preview.js';
import { POIGNEE_TACTILE, poserBoutonsActions, poserCarteAmarree } from './amarrage.js';
import { brancherPincement, echelleBornee, gardePincement } from '../pincement.js';
import { PanneauSorts, couleurEcole, sortConnu, type EntreeSort } from './spells.js';
import { Fortifications } from './siege.js';
import { CoucheVfx } from './vfx.js';
import { FileAnimations } from './anim.js';
import {
  bouton,
  donnee,
  donneeClaire,
  filetSepare,
  jauge,
  nombreFr,
  panneau,
  pastille,
  plaqueGranit,
  recit,
  titre,
} from './parchemin.js';

/** Grossissement maximal du champ au pincement. */
const ZOOM_COMBAT_MAX = 2.6;

/*
 * ══════════════════════════ Assaut avec approche ══════════════════════════
 *
 * Le geste fondateur de HMM3 — cliquer l'ennemi, marcher jusqu'à lui, frapper
 * — manquait. La vue émettait `{kind:'attack', unit, target}` SANS `from` ;
 * `doAttack` ne bouge pas sans case de départ, `unitsAdjacent` échouait et le
 * joueur récoltait « La cible n'est pas au contact. » dans une bulle posée
 * hors du champ de bataille. Le moteur savait pourtant le faire : l'IA émet
 * `{kind:'attack', …, from}` depuis toujours.
 */

/** Case d'où l'assaut partira, avec ce qu'il en coûte et l'angle obtenu. */
export interface Approche {
  readonly at: HexCoord;
  /** hexagones à parcourir ; 0 quand la pile est déjà au contact */
  readonly cout: number;
  readonly angle: AttackAngle;
}

/** À coût égal, le dos vaut mieux que le flanc, et le flanc mieux que la face. */
const RANG_ANGLE: Readonly<Record<AttackAngle, number>> = { face: 0, flanc: 1, dos: 2 };

/*
 * ═══════════════════════════ Le camp adverse joue ═════════════════════════
 *
 * `chooseCombatAction` n'avait qu'un seul appelant dans tout le dépôt :
 * `autoResolve`. Personne ne jouait donc le camp adverse dans un combat
 * manuel — quand une pile de gardes neutres devenait active, le joueur devait
 * la jouer LUI-MÊME ou expédier la bataille par « Résoudre automatiquement ».
 *
 * La boucle est portée par la VUE et non par le moteur, pour trois raisons :
 *  – `applyCombatAction` applique UNE action et ignore délibérément le
 *    propriétaire de la pile : `autoResolve` et les rejeux serveur en
 *    dépendent, un contrôle de bannière y casserait la résolution auto ;
 *  – seule la vue connaît `deps.localPlayer` et la fin des animations, or
 *    c'est là qu'il faut rendre la main ;
 *  – la vue émet déjà les actions par `dispatch`, exactement comme un clic.
 *
 * Le délai est une CONSTANTE : le combat est déterministe, une graine rejouée
 * doit rendre la même bataille, et aucun aléa n'a sa place ici.
 */
export const REFLEXION_ADVERSAIRE_MS = 520;

/** Camp du joueur dans ce combat, `null` s'il n'y tient aucune bannière. */
export function campDuJoueur(combat: CombatState, joueur: PlayerId): 0 | 1 | null {
  if (combat.attacker.player === joueur) return 0;
  if (combat.defender.player === joueur) return 1;
  return null;
}

/**
 * Le moteur doit-il jouer la pile active à la place du joueur ?
 *
 * Oui dès que la pile n'est pas au camp local : bannière adverse, gardes
 * neutres (`defender.player === null`, donc `campLocal` vaut 0 et le camp 1
 * n'appartient à personne), ou combat simplement observé. Non en
 * démonstration : le contrat de vue interdit tout tour d'IA sur `#/demo/*`.
 */
export function moteurDoitJouer(
  combat: CombatState,
  actif: CombatUnit | null,
  campLocal: 0 | 1 | null,
  demo: boolean,
): boolean {
  if (demo || combat.finished) return false;
  if (!actif || !actif.alive) return false;
  return actif.side !== campLocal;
}

/**
 * Case d'approche retenue, ou `null` si la cible est hors d'atteinte ce
 * tour-ci. Le choix ne réinvente aucune règle : les cases viennent de
 * `reachableAttackHexes`, déjà triées par coût croissant, et l'angle de
 * `attackAngle`. On prend la moins chère ; le flanc et le dos ne départagent
 * que ce qui coûte pareil, car ils ne doivent jamais faire marcher plus loin.
 */
export function choisirApproche(
  combat: CombatState,
  unit: CombatUnit,
  cible: CombatUnit,
): Approche | null {
  let meilleure: Approche | null = null;
  for (const { at, cost } of reachableAttackHexes(combat, unit, cible)) {
    if (meilleure && cost > meilleure.cout) break;
    const angle = attackAngle(cible.at, cible.facing, at);
    if (!meilleure || RANG_ANGLE[angle] > RANG_ANGLE[meilleure.angle]) {
      meilleure = { at, cout: cost, angle };
    }
  }
  return meilleure;
}

/**
 * L'action qu'un clic sur `cible` doit émettre, ou `null` quand rien ne peut
 * partir. L'attaque emporte sa case de départ (`from`) : sans elle, `doAttack`
 * ne bouge pas et refuse tout ce qui n'est pas déjà au contact.
 */
export function actionAssaut(
  combat: CombatState,
  unit: CombatUnit,
  cible: CombatUnit,
): CombatAction | null {
  const def = unitDef(unit);
  if (def.shooter === true && unit.shots > 0 && hexDistance(unit.at, cible.at) > 1) {
    return { kind: 'shoot', unit: unit.uid, target: cible.uid };
  }
  const approche = choisirApproche(combat, unit, cible);
  if (!approche) return null;
  return approche.cout === 0
    ? { kind: 'attack', unit: unit.uid, target: cible.uid }
    : { kind: 'attack', unit: unit.uid, target: cible.uid, from: approche.at };
}

/* ═══════════════════════════ Viser, puis frapper ═════════════════════════ */

/**
 * Ce que fait un appui sur une pile ennemie.
 *
 * Au doigt, le PREMIER appui déclenchait l'attaque : `surClic` construisait
 * l'aperçu puis appelait `emettre` dans la foulée, sans aucune étape de
 * confirmation. L'aide affichée en compact promettait pourtant l'inverse —
 * « une pile ennemie pour la viser ». Le texte promettait une visée, le code
 * frappait, et un pouce qui rate d'un hexagone dépensait le tour.
 *
 * À la souris le geste de HMM3 reste d'un seul clic : le survol a déjà montré
 * l'aperçu et le curseur, la visée a donc déjà eu lieu.
 */
export type GesteSurEnnemi = 'viser' | 'frapper';

export function gesteSurEnnemi(
  tactile: boolean,
  visee: string | null,
  cible: string,
): GesteSurEnnemi {
  if (!tactile) return 'frapper';
  return visee === cible ? 'frapper' : 'viser';
}

/* ═══════════════════════ Maintien : zones de menace ══════════════════════ */

/**
 * Combien de temps le doigt doit rester posé pour que les zones de menace
 * apparaissent, en millisecondes.
 *
 * Les menaces n'étaient offertes qu'au maintien de la touche `M` — inexistant
 * sur un iPhone. Le maintien du doigt est la même intention, dite avec ce
 * qu'on a. Le seuil se tient entre deux échecs : trop court, le moindre appui
 * un peu appuyé fait clignoter le champ ; trop long, personne ne découvre le
 * geste.
 */
export const MAINTIEN_MENACES_MS = 340;

/** Au-delà de ce déplacement, le doigt fait glisser, il ne maintient pas. */
export const MAINTIEN_TOLERANCE_PX = 12;

/** Le doigt posé demande-t-il les zones de menace ? */
export function maintienMontreLesMenaces(dureeMs: number, deplacementPx: number): boolean {
  return deplacementPx <= MAINTIEN_TOLERANCE_PX && dureeMs >= MAINTIEN_MENACES_MS;
}

/* ══════════════════════════════ Disposition ══════════════════════════════ */

export interface Gabarit {
  compact: boolean;
  /** téléphone tenu à la verticale : disposition entièrement empilée */
  portrait: boolean;
  barre: number;
  gauche: number;
  droite: number;
  bas: number;
  /** hauteur réservée sous le champ à la carte amarrée (portrait) */
  info: number;
  /** hauteur du bandeau de fiche posé au bas, en portrait */
  fiche: number;
  /** allongement vertical maximal toléré pour un hexagone */
  etirementMax: number;
  /** allongement retenu, calculé au redimensionnement */
  etirement: number;
}

/** Hauteur du bandeau de fiche en portrait ; sa mise en page en dépend. */
const FICHE_PORTRAIT = 124;

/**
 * Coiffe de la carte d'aperçu amarrée, plus la marge qui l'en sépare : ce
 * qu'il faut réserver sous le champ pour que la carte REPLIÉE tienne entre le
 * champ et le bandeau de fiche, sans recouvrir ni l'un ni l'autre.
 */
const COIFFE_CARTE = 54;

export function gabarit(largeur: number, hauteur: number): Gabarit {
  const compact = largeur < 940 || hauteur < 520;
  if (compact) {
    const portrait = hauteur > largeur * 1.2;
    return {
      compact: true,
      portrait,
      barre: 68,
      gauche: 0,
      droite: 0,
      /* 84 et non 74 : le panneau rétracté doit loger la bande de bascule de
         26 points ET une rangée de boutons d'au moins 44 — la hauteur d'avant
         forçait des boutons de 38 points, sous le minimum tactile. */
      bas: 84,
      /*
       * La place laissée sous le champ n'est pas un vide : elle porte la
       * fiche de la pile et la coiffe de la carte d'aperçu amarrée. Elle
       * n'a donc pas à porter la carte DÉPLIÉE — celle-ci se superpose au
       * champ, c'est tout son intérêt.
       *
       * Elle valait `max(230, hauteur × 0,44)`, jusqu'à 320 points : sur la
       * capture iPhone, le champ de bataille tombait à un tiers de la scène
       * et la carte en avalait la moitié. La réserve tient maintenant à ce
       * qu'elle contient vraiment, fiche plus coiffe.
       */
      info: portrait
        ? Math.round(
            Math.min(
              FICHE_PORTRAIT + COIFFE_CARTE + 42,
              Math.max(FICHE_PORTRAIT + COIFFE_CARTE, hauteur * 0.27),
            ),
          )
        : 0,
      fiche: portrait ? FICHE_PORTRAIT : 0,
      etirementMax: portrait ? 1.3 : 1,
      etirement: 1,
    };
  }
  return {
    compact: false,
    portrait: false,
    barre: 92,
    gauche: Math.round(Math.min(308, Math.max(250, largeur * 0.17))),
    droite: Math.round(Math.min(346, Math.max(268, largeur * 0.19))),
    bas: 84,
    info: 0,
    fiche: 0,
    etirementMax: 1,
    etirement: 1,
  };
}

/**
 * Bande d'écran offerte au champ de bataille, marges comprises. Extraite du
 * redimensionnement pour être MESURABLE : c'est elle que le test de
 * disposition compare à la réserve du bas.
 */
export function bandeDuChamp(
  plan: Gabarit,
  largeur: number,
  hauteur: number,
  panneauBas: number,
): { x: number; y: number; w: number; h: number } {
  const marge = plan.compact ? 8 : 16;
  /* En portrait, le cartouche d'effectif déborde de l'hexagone : sans ce
     retrait, les piles des colonnes de bord sont coupées par l'écran. */
  const retrait = plan.portrait ? 15 : 0;
  return {
    x: plan.gauche + marge + retrait,
    y: plan.barre + marge,
    w: Math.max(80, largeur - plan.gauche - plan.droite - marge * 2 - retrait * 2),
    h: Math.max(80, hauteur - plan.barre - panneauBas - plan.info - marge * 2),
  };
}

/** Boutons d'action, dans l'ordre du bas de l'écran. */
interface ActionBouton {
  cle: string;
  libelle: string;
  note?: string;
  actif: boolean;
  noeud: Container;
  zone: Rectangle;
}

/* ══════════════════════════════ La vue ═══════════════════════════════════ */

class VueCombat implements BattleView {
  readonly container = new Container();

  /* — couches — */
  private readonly racine = new Container();
  /** grossissement courant du champ (1 = plein cadre) */
  private zoom = 1;
  /** déplacement du champ sous le grossissement, en pixels écran */
  private decalage = { x: 0, y: 0 };
  /** débranchement du pincer-zoomer */
  private debrancherPince: (() => void) | null = null;
  private readonly fond = new Graphics();
  private readonly board = new Container();
  private readonly plateau = new Container();
  private readonly hoteUnites = new Container();
  private readonly hoteVfx = new Container();
  private readonly ihm = new Container();

  /* — modules — */
  private geo: Geometrie;
  private champ: ChampDeBataille;
  private marques: CoucheGrille;
  private unites: CoucheUnites;
  private forts: Fortifications;
  private readonly vfx: CoucheVfx;
  private readonly barre: BarreInitiative;
  private readonly carte: CarteApercu;
  private readonly grimoire: PanneauSorts;
  private readonly file: FileAnimations;

  /* — panneaux — */
  private readonly ficheG = new Container();
  private readonly ficheGFond = new Graphics();
  private readonly ficheGCorps = new Container();
  private readonly journalD = new Container();
  private readonly journalDFond = new Graphics();
  private readonly journalDCorps = new Container();
  private readonly barreActions = new Container();
  private readonly actionsFond = new Graphics();
  private readonly actionsCorps = new Container();
  private readonly poignee = new Graphics();
  private readonly aide = new Container();
  /** bandeau d'information du mode portrait */
  private readonly infoBas = new Container();
  private readonly infoFond = new Graphics();
  private readonly infoCorps = new Container();
  /** fenêtre de la carte d'aperçu quand elle est rétractée */
  private readonly masqueCarte = new Graphics();

  /* — état de la vue — */
  private combat: CombatState;
  private camps: Readonly<Record<0 | 1, Camp>>;
  private largeur = 1;
  private hauteur = 1;
  private plan: Gabarit;
  private detruit = false;
  private temps = 0;

  private actif: string | null = null;
  private selection: string | null = null;
  private survol: HexCoord | null = null;
  private atteignables: readonly HexCoord[] = [];
  private cheminPrevu: readonly HexCoord[] | null = null;
  private ciblesSort: readonly HexCoord[] | null = null;
  private apercu: ApercuComplet | null = null;
  private apercuImpose: AttackPreview | null = null;
  private ancreApercu = { x: 0, y: 0 };
  private menacesVisibles = false;
  /** doigt posé sur le champ : origine, durée, plus grand écart parcouru */
  private maintien: { x: number; y: number; ms: number; ecart: number } | null = null;
  /** les menaces affichées le sont par un maintien du doigt, pas par `M` */
  private menacesParMaintien = false;
  /** le maintien a répondu : le relâché qui suit n'est pas un coup */
  private avalerLeClic = false;
  private panneauReplie = true;
  private boutons: ActionBouton[] = [];
  /** bande du haut du panneau qui bascule le panneau au lieu d'agir */
  private zonePoignee = POIGNEE_TACTILE;
  private cleFiche = '';
  private cleJournal = '';
  private cleActions = '';
  private cleAide = '';
  private cleApercu = '';
  private baseBoard = { x: 0, y: 0 };
  /** bande écran offerte au champ de bataille, marges comprises */
  private bandeChamp = { x: 0, y: 0, w: 1, h: 1 };
  /**
   * En portrait, la carte d'aperçu est un panneau rétractable superposé.
   *
   * Elle arrive REPLIÉE : dépliée d'office, elle occupait la moitié de la
   * hauteur de scène et absorbait la touche sur toute sa surface — les piles
   * qu'elle recouvrait étaient intouchables. Repliée, elle ne prend que sa
   * coiffe, et une touche dessus la déroule quand on veut les chiffres.
   */
  private carteRepliee = false;
  /** hauteur réellement montrée de la carte amarrée (rognée si besoin) */
  private hauteurCarteVisible = 0;
  private cleInfo = '';
  private journalLocal: CombatLogEntry[] = [];
  private desabonner: (() => void) | null = null;
  private dernierEvenement = -1;
  private enAttenteDeSync = false;
  private surTouche: ((e: KeyboardEvent) => void) | null = null;
  private surRelache: ((e: KeyboardEvent) => void) | null = null;
  /** millisecondes écoulées depuis que la pile adverse est devenue active */
  private reflexionAdversaire = 0;

  constructor(private readonly deps: BattleViewDeps) {
    this.container.label = 'combat-tactique';
    this.combat = deps.combat;
    this.plan = gabarit(deps.width, deps.height);
    this.carteRepliee = this.plan.compact;
    this.camps = campsDuCombat(this.combat, deps.store.get().game?.players ?? {});

    this.container.addChild(this.racine);
    this.racine.addChild(this.fond, this.board, this.ihm);
    this.board.addChild(this.plateau, this.hoteUnites, this.hoteVfx);

    this.geo = cadrerPlateau(0, 0, 100, 100, this.plan.etirement);
    this.champ = new ChampDeBataille(this.geo, deps.atlas, this.combat, deps.reducedMotion);
    this.marques = new CoucheGrille(this.geo, deps.reducedMotion);
    this.unites = new CoucheUnites(this.geo, deps.atlas, this.camps, deps.reducedMotion);
    this.forts = new Fortifications(this.geo, deps.atlas, deps.reducedMotion);
    this.vfx = new CoucheVfx(deps.atlas, deps.reducedMotion);
    this.barre = new BarreInitiative(deps.atlas, this.camps, deps.reducedMotion);
    this.carte = new CarteApercu(deps.atlas, deps.reducedMotion);
    this.grimoire = new PanneauSorts(deps.atlas, deps.reducedMotion);

    this.plateau.addChild(this.champ.container, this.marques.container, this.forts.container);
    this.hoteUnites.addChild(this.unites.container);
    this.hoteVfx.addChild(this.vfx.container);
    this.ihm.addChild(
      this.barre.container,
      this.ficheG,
      this.journalD,
      this.infoBas,
      this.barreActions,
      this.aide,
      this.grimoire.container,
      this.masqueCarte,
      this.carte.container,
    );
    this.infoBas.addChild(this.infoFond, this.infoCorps);
    this.ficheG.addChild(this.ficheGFond, this.ficheGCorps);
    this.journalD.addChild(this.journalDFond, this.journalDCorps);
    this.barreActions.addChild(this.actionsFond, this.poignee, this.actionsCorps);

    this.file = new FileAnimations({
      geo: this.geo,
      piles: this.unites,
      vfx: this.vfx,
      combat: () => this.combat,
      reducedMotion: deps.reducedMotion,
      onEtape: (i) => deps.onActionPlayed?.(i),
      onJournal: (e) => this.pousserJournal(e),
      onRepos: () => this.auRepos(),
    });

    this.actif = activeUnit(this.combat)?.uid ?? null;
    this.selection = this.actif;
    this.journalLocal = [...this.combat.log];
    this.brancherInteractions();
    this.brancherClavier();
    this.desabonner = deps.store.subscribe(() => this.relire());
  }

  /* ═══════════════════════════ Contrat de vue ════════════════════════════ */

  setCombat(combat: CombatState): void {
    const avant = this.actif;
    this.combat = combat;
    this.camps = campsDuCombat(combat, this.deps.store.get().game?.players ?? {});
    if (this.actif && !findUnit(combat, this.actif)?.alive) this.actif = null;
    if (!this.actif) this.actif = activeUnit(combat)?.uid ?? null;
    if (this.selection && !findUnit(combat, this.selection)) this.selection = this.actif;
    /* La visée appartient à la pile qui l'a posée : la laisser survivre au
       changement de main ferait frapper au PREMIER appui du tour suivant. */
    if (this.actif !== avant) this.cibleForcee = null;
    /* Une cible morte ne se vise plus. */
    if (this.cibleForcee && !findUnit(combat, this.cibleForcee)?.alive) this.cibleForcee = null;
    this.appliquer();
  }

  setActiveUnit(unitId: string | null): void {
    if (unitId !== this.actif) this.cibleForcee = null;
    this.actif = unitId;
    if (unitId) this.selection = unitId;
    this.appliquer();
  }

  setReachable(hexes: readonly HexCoord[]): void {
    this.atteignables = hexes;
    this.marques.set({ atteignables: hexes });
  }

  setMovePreview(path: readonly HexCoord[] | null): void {
    this.cheminPrevu = path;
    this.marques.set({ chemin: path });
  }

  setAttackPreview(preview: AttackPreview | null): void {
    this.apercuImpose = preview;
    if (!preview) {
      this.apercu = null;
      this.carte.fermer();
      this.marques.set({ curseur: null });
      return;
    }
    this.apercu = enrichirApercu(this.combat, preview);
    this.carte.montrer(this.apercu, this.combat);
    this.placerCarte();
    const c = findUnit(this.combat, this.apercu.uidCible ?? preview.target);
    const a = findUnit(this.combat, this.apercu.uidAttaquant ?? preview.attacker);
    if (a && c) this.marques.set({ curseur: { depuis: preview.from ?? a.at, vers: c.at } });
  }

  setSpellTargets(hexes: readonly HexCoord[] | null): void {
    this.ciblesSort = hexes;
    const id = this.grimoire.sortChoisi;
    const def = id ? sortConnu(id) : null;
    this.marques.set({
      ciblesSort: hexes,
      ecole: def ? couleurEcole(def.school) : PALETTE.bleuBrume,
    });
  }

  async playEvents(events: readonly GameEvent[]): Promise<void> {
    this.enAttenteDeSync = true;
    await this.file.enfiler(events);
  }

  hexAt(x: number, y: number): HexCoord | null {
    return this.geo.hexAt(x, y);
  }

  screenOf(hex: HexCoord): { x: number; y: number } {
    const c = this.geo.centre(hex);
    return { x: c.x, y: c.y };
  }

  /* ═════════════════════════════ Cycle de vie ════════════════════════════ */

  resize(width: number, height: number): void {
    if (this.detruit) return;
    this.largeur = Math.max(320, Math.round(width));
    this.hauteur = Math.max(240, Math.round(height));
    this.plan = gabarit(this.largeur, this.hauteur);
    /* La coquille place le conteneur au centre de la toile : on ramène le
       repère de la vue dans le coin haut-gauche, en pixels écran. */
    this.appliquerZoom();
    this.container.hitArea = new Rectangle(
      -this.largeur / 2,
      -this.hauteur / 2,
      this.largeur,
      this.hauteur,
    );

    this.file.purger();
    const zone = bandeDuChamp(this.plan, this.largeur, this.hauteur, this.hauteurPanneauBas());
    this.bandeChamp = zone;

    /* Étirement : le plateau prend la hauteur qu'on lui laisse, jusqu'au
       plafond du gabarit. Au-delà, l'hexagone cesserait d'être un hexagone. */
    const nature = cadrerPlateau(zone.x, zone.y, zone.w, zone.h, 1);
    const hNature = Math.max(1, nature.boite.hauteur);
    this.plan.etirement =
      Math.round(Math.max(1, Math.min(this.plan.etirementMax, zone.h / hNature)) * 100) / 100;

    /* L'origine de la géométrie est en pixels **écran** : `screenOf` et
       `hexAt` du contrat travaillent donc directement dans ce repère. */
    this.geo = cadrerPlateau(
      zone.x,
      zone.y,
      zone.w,
      zone.h,
      this.plan.etirement,
      this.plan.portrait ? 'haut' : 'centre',
    );
    this.baseBoard = { x: this.geo.origine.x, y: this.geo.origine.y };
    this.board.position.set(this.baseBoard.x, this.baseBoard.y);
    this.plateau.scale.set(1, this.plan.etirement);

    this.reconstruirePlateau();
    this.peindreFond();

    this.barre.disposer(this.largeur, this.plan.compact);
    this.barre.container.position.set(0, 0);

    this.vfx.vider();
    this.cleFiche = '';
    this.cleJournal = '';
    this.cleActions = '';
    this.cleAide = '';
    this.cleApercu = '';
    this.cleInfo = '';
    this.appliquer(true);
  }

  update(dtMs: number): void {
    if (this.detruit) return;
    const dt = Math.min(100, dtMs);
    this.temps += dt;
    this.file.update(dt);
    this.champ.update(dt);
    this.marques.update(dt);
    this.unites.update(dt);
    this.forts.update(dt);
    this.vfx.update(dt);
    this.barre.update(dt);
    this.grimoire.update(dt);
    this.carte.update(dt, this.ancreApercu);
    this.avancerMaintien(dt);
    this.avancerAdversaire(dt);

    /* secousse d'écran : elle porte le plateau, jamais l'interface */
    const s = this.vfx.secousse.decalage;
    this.board.position.set(
      this.baseBoard.x + s.x,
      this.baseBoard.y + s.y,
    );
  }

  destroy(): void {
    if (this.detruit) return;
    this.detruit = true;
    this.desabonner?.();
    this.desabonner = null;
    if (this.surTouche) window.removeEventListener('keydown', this.surTouche);
    if (this.surRelache) window.removeEventListener('keyup', this.surRelache);
    this.surTouche = null;
    this.surRelache = null;
    this.debrancherPince?.();
    this.debrancherPince = null;
    this.champ.destroy();
    this.marques.destroy();
    this.unites.destroy();
    this.forts.destroy();
    this.vfx.destroy();
    this.barre.destroy();
    this.carte.destroy();
    this.grimoire.destroy();
    this.container.destroy({ children: true });
  }

  /* ═══════════════════════════ Reconstruction ════════════════════════════ */

  /** Recompose sol, marques, piles et fortifications à la nouvelle échelle. */
  private reconstruirePlateau(): void {
    this.champ.destroy();
    this.marques.destroy();
    this.unites.destroy();
    this.forts.destroy();
    this.plateau.removeChildren();
    this.hoteUnites.removeChildren();

    this.champ = new ChampDeBataille(this.geo, this.deps.atlas, this.combat, this.deps.reducedMotion);
    this.marques = new CoucheGrille(this.geo, this.deps.reducedMotion);
    this.unites = new CoucheUnites(this.geo, this.deps.atlas, this.camps, this.deps.reducedMotion);
    this.forts = new Fortifications(this.geo, this.deps.atlas, this.deps.reducedMotion);

    this.plateau.addChild(this.champ.container, this.marques.container, this.forts.container);
    this.hoteUnites.addChild(this.unites.container);
    this.champ.peindre(this.deps.app.renderer, this.deps.quality, this.zoneSolLocale());

    /* la file d'animations doit connaître la nouvelle géométrie */
    this.file.remplacerContexte({ geo: this.geo, piles: this.unites });
  }

  /** Fond de l'écran : granit sombre, halo de champ, brume au loin. */
  private peindreFond(): void {
    const g = this.fond;
    g.clear();
    const W = this.largeur;
    const H = this.hauteur;
    g.rect(0, 0, W, H).fill({
      fill: degradeLineaire(
        [
          { offset: 0, color: melanger(PALETTE.granitAnthracite, PALETTE.bleuProfond, 0.5) },
          { offset: 0.42, color: melanger(PALETTE.granitAnthracite, LIGHT.brume, 0.1) },
          { offset: 1, color: assombrir(PALETTE.granitAnthracite, 0.4) },
        ],
        118,
      ),
    });
    /* nappe de brume derrière le plateau : perspective atmosphérique */
    const cx = this.baseBoard.x + this.geo.boite.largeur * 0.42;
    const cy = this.baseBoard.y + this.geo.boite.hauteur * 0.34;
    g.poly(flat(blob(cx, cy, W * 0.55, H * 0.42, { seed: 5, points: 24, wobble: 0.16 }))).fill({
      fill: degradeRadial([
        { offset: 0, color: LIGHT.brume, alpha: 0.13 },
        { offset: 0.6, color: LIGHT.brume, alpha: 0.05 },
        { offset: 1, color: LIGHT.brume, alpha: 0 },
      ]),
    });
    /* grain et vignettage */
    for (let i = 0; i < 220; i += 1) {
      const a = (i * 2246822519) % 4294967296;
      g.rect(((a >>> 8) % W), ((a >>> 3) % H), 1, 1).fill({ color: LIGHT.chaude, alpha: 0.02 });
    }
    g.rect(0, 0, W, H).fill({
      fill: degradeRadial([
        { offset: 0, color: LIGHT.ombrePortee, alpha: 0 },
        { offset: 0.68, color: LIGHT.ombrePortee, alpha: 0.06 },
        { offset: 1, color: LIGHT.ombrePortee, alpha: 0.3 },
      ]),
    });
  }

  /* ═════════════════════════ Lecture de l'état ═══════════════════════════ */

  /** L'état du client a changé : on relit le combat et on enfile les gestes. */
  private relire(): void {
    if (this.detruit) return;
    const etat = this.deps.store.get();
    const combat = etat.game?.combat;
    if (!combat) return;
    const nouveaux: GameEvent[] = [];
    for (const q of etat.queue) {
      if (q.id <= this.dernierEvenement) continue;
      this.dernierEvenement = q.id;
      if (q.event.type === 'CombatAction' || q.event.type === 'CombatEnded') nouveaux.push(q.event);
    }
    this.combat = combat;
    this.camps = campsDuCombat(combat, etat.game?.players ?? {});
    if (nouveaux.length > 0) {
      this.enAttenteDeSync = true;
      void this.file.enfiler(nouveaux);
    }
    this.actif = activeUnit(combat)?.uid ?? null;
    if (!this.selection || !findUnit(combat, this.selection)?.alive) this.selection = this.actif;
    this.appliquer();
  }

  /** La file d'animations est vide : on remet la vue en phase avec le moteur. */
  private auRepos(): void {
    if (this.detruit) return;
    this.enAttenteDeSync = false;
    this.appliquer(true);
  }

  /** Applique l'état courant à toutes les couches. */
  private appliquer(force = false): void {
    if (this.detruit) return;
    const figer = this.file.occupee || this.enAttenteDeSync;
    this.unites.sync(this.combat, this.actif, figer && !force);
    this.forts.sync(this.combat);
    this.barre.sync(this.combat, this.actif);
    this.majPortee();
    this.majApercu();
    this.majFiche();
    this.majJournal();
    this.majInfoPortrait();
    this.majActions();
    this.majAide();
    this.disposerIhm();
  }

  /* ════════════════════════ Le camp adverse joue ═════════════════════════ */

  /** Vrai quand la pile active n'est pas au joueur local. */
  private get adversaireDoitJouer(): boolean {
    return moteurDoitJouer(
      this.combat,
      this.actif ? findUnit(this.combat, this.actif) : null,
      campDuJoueur(this.combat, this.deps.localPlayer),
      this.deps.demo,
    );
  }

  /**
   * Fait jouer le moteur pour le camp adverse, après un temps de réflexion
   * fixe et une fois les animations retombées — sans quoi les coups
   * s'empileraient sans que l'œil puisse les suivre.
   */
  private avancerAdversaire(dt: number): void {
    if (!this.adversaireDoitJouer || this.file.occupee || this.enAttenteDeSync) {
      this.reflexionAdversaire = 0;
      return;
    }
    this.reflexionAdversaire += dt;
    const attente = this.deps.reducedMotion ? 0 : REFLEXION_ADVERSAIRE_MS;
    if (this.reflexionAdversaire < attente) return;
    this.reflexionAdversaire = 0;
    const jeu = this.deps.store.get().game;
    const combat = jeu?.combat;
    if (!jeu || !combat || combat.finished) return;
    const u = activeUnit(combat);
    if (!u) return;
    /* La décision vient du moteur, pas de la vue : `chooseCombatAction` est
       pure et déterministe, la même situation rend toujours le même coup. */
    const rendu = this.deps.dispatch({ type: 'CombatAction', action: chooseCombatAction(jeu, combat) });
    /* Même verrou que `autoResolve` : une décision refusée ne doit jamais
       figer la bataille sur une pile qui rejoue indéfiniment le même coup. */
    if (!rendu.ok) this.deps.dispatch({ type: 'CombatAction', action: { kind: 'defend', unit: u.uid } });
  }

  /** Cases atteignables et hexagone actif — tout vient de `reachableHexes`. */
  private majPortee(): void {
    const u = this.actif ? findUnit(this.combat, this.actif) : null;
    if (!u || !u.alive || this.combat.finished) {
      this.atteignables = [];
      this.marques.set({ atteignables: [], active: null, menaces: [] });
      return;
    }
    this.atteignables = reachableHexes(this.combat, u);
    this.marques.set({
      atteignables: this.atteignables,
      active: u.at,
      menaces: this.menacesVisibles ? zonesDeMenace(this.combat, u) : [],
    });
  }


  /* ═══════════════════════════ Prévisualisation ══════════════════════════ */

  /**
   * Recompose la carte d'attaque. Deux sources possibles : celle que la
   * coquille impose (`setAttackPreview`) ou celle que le survol demande. Dans
   * les deux cas les nombres viennent de `damageRange`.
   */
  private majApercu(): void {
    if (this.apercuImpose) {
      const cle = `impose:${this.apercuImpose.attacker}>${this.apercuImpose.target}:${this.apercuImpose.damage.min}-${this.apercuImpose.damage.max}`;
      if (cle !== this.cleApercu) {
        this.cleApercu = cle;
        this.apercu = enrichirApercu(this.combat, this.apercuImpose);
        this.carte.montrer(this.apercu, this.combat);
      }
      this.placerCarte();
      return;
    }
    const a = this.actif ? findUnit(this.combat, this.actif) : null;
    const cibleUid = this.cibleSurvolee();
    const c = cibleUid ? findUnit(this.combat, cibleUid) : null;
    if (!a || !c || !a.alive || !c.alive || a.side === c.side || this.combat.finished) {
      if (this.carte.estOuverte) this.carte.fermer();
      this.cleApercu = '';
      this.apercu = null;
      this.marques.set({ curseur: null });
      return;
    }
    const def = unitDef(a);
    const distance = def.shooter === true && a.shots > 0 && hexDistance(a.at, c.at) > 1;
    /* Au corps à corps, le coup ne partira pas d'ici mais de la case
       d'approche : c'est depuis elle que se comptent l'angle, la riposte
       conditionnelle et la charge. L'aperçu mentait tant qu'il l'ignorait. */
    const approche = distance ? null : choisirApproche(this.combat, a, c);
    const depuis = approche ? approche.at : a.at;
    const cle = [
      a.uid, a.count, a.at.col, a.at.row,
      c.uid, c.count, c.topHp, c.facing,
      distance ? 't' : 'm',
      approche ? `${approche.at.col},${approche.at.row},${approche.cout}` : 'x',
    ].join(':');
    if (cle !== this.cleApercu) {
      this.cleApercu = cle;
      this.apercu = construireApercu(this.combat, a, c, distance, approche);
      this.carte.montrer(this.apercu, this.combat);
    }
    this.placerCarte();
    /* Assaut impossible : pas de pointe de lance sur la cible. Rien ne doit
       laisser croire que le clic va porter. */
    this.marques.set(
      distance || approche
        ? { curseur: { depuis, vers: c.at, tir: distance } }
        : { curseur: null },
    );
  }

  private cibleSurvolee(): string | null {
    if (this.cibleForcee) return this.cibleForcee;
    if (!this.survol) return null;
    const u = this.combat.units.find(
      (x) => x.alive && x.at.col === this.survol?.col && x.at.row === this.survol?.row,
    );
    return u ? u.uid : null;
  }

  /** Cible imposée par la vue (mode démonstration, ou clic de sélection). */
  private cibleForcee: string | null = null;

  /**
   * Rectangle de sol à peindre, en pixels du plateau non étiré. Il couvre
   * toute la bande offerte au champ : le pré continue au-delà de la trame,
   * au lieu de laisser voir le granit de fond.
   */
  private zoneSolLocale(): { x: number; y: number; w: number; h: number } {
    const e = Math.max(0.01, this.plan.etirement);
    const o = this.geo.origine;
    /* le pré ne s'arrête pas à la trame : il couvre toute la surface libre,
       réserve de la carte amarrée comprise */
    const b = {
      x: this.plan.gauche + 2,
      y: this.bandeChamp.y - 8,
      w: this.largeur - this.plan.gauche - this.plan.droite - 4,
      h: this.bandeChamp.h + this.plan.info + 16,
    };
    /* la bande déborde un peu de ses marges : le sol ne doit pas s'arrêter
       pile sous les panneaux, sinon on voit une couture */
    const debord = 14;
    return {
      x: b.x - o.x - debord,
      y: (b.y - o.y - debord) / e,
      w: b.w + debord * 2,
      h: (b.h + debord * 2) / e,
    };
  }

  /** Hauteur visible de la carte d'aperçu rétractée : son bandeau de titre. */
  private get enteteCarte(): number {
    return 46;
  }

  /** La carte d'aperçu est-elle posée en panneau rétractable au bas ? */
  private get carteAmarree(): boolean {
    return this.plan.compact;
  }

  /** Rectangle écran occupé par la carte, telle qu'on la voit. */
  private zoneCarte(): Rectangle | null {
    if (!this.carte.estOuverte) return null;
    /* Amarrée, la carte peut être rognée : la zone tactile suit ce qu'on
       voit, sinon la touche du bandeau porterait dans le vide. */
    const h = this.carteAmarree
      ? (this.hauteurCarteVisible || this.enteteCarte)
      : this.carte.hauteurCourante;
    return new Rectangle(this.ancreApercu.x, this.ancreApercu.y, this.carte.largeur, h);
  }

  /** Pose la carte à côté de la cible, sans jamais sortir de l'écran. */
  private placerCarte(): void {
    const uid = this.apercu?.uidCible ?? this.apercuImpose?.target ?? null;
    const c = uid ? findUnit(this.combat, uid) : null;
    const h = this.carte.hauteurCourante;
    const w = this.carte.largeur;

    /*
     * En écran étroit la carte n'est plus posée à côté de la cible : elle
     * s'amarre au bas de l'écran, **superposée** au champ, et se rétracte
     * d'une touche sur son bandeau. Elle ne recouvre jamais la trame, qui est
     * calée en haut de la bande.
     */
    if (this.carteAmarree) {
      /* La pose vient de `amarrage.ts`, qui garantit l'invariant : la carte
         ne recouvre JAMAIS la barre d'actions. Trop haute pour la bande
         disponible, elle est rognée par le bas — on en voit le haut, le
         reste glisse sous la barre, qui reste entière et touchable. */
      const pose = poserCarteAmarree({
        hauteur: this.hauteur,
        largeur: this.largeur,
        barre: this.plan.barre,
        /* La fiche fait partie du plancher : la carte s'arrêtait au-dessus de
           la seule barre d'actions et recouvrait le bandeau, si bien qu'on
           éteignait la fiche pour ne pas superposer deux parchemins. Lire les
           chiffres d'une attaque coûtait alors la fiche de sa propre pile. */
        panneauBas: this.hauteurPanneauBas() + this.plan.fiche,
        largeurCarte: w,
        hauteurCarte: h,
        entete: this.enteteCarte,
        repliee: this.carteRepliee,
      });
      this.ancreApercu = { x: pose.x, y: pose.y };
      this.carte.container.position.set(pose.x, pose.y);
      this.masqueCarte.clear();
      if (this.carteRepliee || pose.rognee) {
        this.masqueCarte
          .rect(pose.x - 2, pose.y - 6, w + 4, pose.hauteurVisible + 6)
          .fill({ color: 0xffffff });
        this.carte.container.mask = this.masqueCarte;
      } else {
        this.carte.container.mask = null;
      }
      this.hauteurCarteVisible = pose.hauteurVisible;
      return;
    }
    this.carte.container.mask = null;
    this.masqueCarte.clear();
    let x = this.largeur - this.plan.droite - w - 22;
    let y = this.plan.barre + 22;
    if (c) {
      const p = this.screenOf(c.at);
      x = p.x + this.geo.taille * 1.4;
      y = p.y - h * 0.45;
      if (x + w > this.largeur - this.plan.droite - 10) x = p.x - this.geo.taille * 1.4 - w;
    }
    const minX = this.plan.compact ? 8 : this.plan.gauche + 10;
    const maxX = this.largeur - (this.plan.compact ? 8 : this.plan.droite + 10) - w;
    const minY = this.plan.barre + 8;
    const maxY = this.hauteur - this.plan.bas - 8 - h;
    this.ancreApercu = {
      x: Math.round(Math.max(minX, Math.min(Math.max(minX, maxX), x))),
      y: Math.round(Math.max(minY, Math.min(Math.max(minY, maxY), y))),
    };
    this.carte.container.position.set(this.ancreApercu.x, this.ancreApercu.y);
  }

  /* ══════════════════════════════ Panneaux ═══════════════════════════════ */

  private disposerIhm(): void {
    const marge = this.plan.compact ? 8 : 14;
    this.ficheG.visible = !this.plan.compact;
    this.journalD.visible = !this.plan.compact;
    this.ficheG.position.set(marge, this.plan.barre + marge);
    this.journalD.position.set(this.largeur - this.plan.droite + 2, this.plan.barre + marge);
    this.barreActions.position.set(0, this.hauteur - this.hauteurPanneauBas());
    const carteDepliee = this.carteAmarree && this.carte.estOuverte && !this.carteRepliee;
    /* La fiche ne s'éteint plus quand la carte se déplie : la carte s'arrête
       maintenant AU-DESSUS du bandeau (`placerCarte`), les deux parchemins ne
       se chevauchent plus, et on ne perd plus sa propre pile de vue pour lire
       les chiffres d'une attaque. */
    this.infoBas.visible = this.plan.fiche > 0 && this.hauteurPanneauBas() <= this.plan.bas;
    /* Le rappel des commandes se pose au même endroit que la carte amarrée :
       dépliée, elle le recouvrait et il n'en dépassait que trois lettres au
       bord gauche de l'écran. Un texte qu'on ne peut pas lire n'aide personne. */
    this.aide.visible = !carteDepliee;
    this.infoBas.position.set(marge, this.hauteur - this.hauteurPanneauBas() - this.plan.fiche);
    this.grimoire.container.position.set(
      this.plan.compact ? marge : this.plan.gauche + marge + 8,
      this.plan.barre + marge + 8,
    );
    this.aide.position.set(
      this.plan.compact ? marge : this.plan.gauche + marge,
      this.hauteur - this.hauteurPanneauBas() - this.plan.info - 26,
    );
  }

  /**
   * Fige un sous-arbre d'interface en texture. Ces panneaux ne changent qu'à
   * la reconstruction : les retesseller à chaque image était, après les piles,
   * le poste de dépense le plus lourd de la scène.
   */
  private figer(c: Container): void {
    c.cacheAsTexture(false);
    if (c.children.length === 0) return;
    const b = c.getLocalBounds();
    if (b.width < 1 || b.height < 1) return;
    c.cacheAsTexture(true);
  }

  /**
   * Bandeau d'information du mode portrait : la pile choisie, ses chiffres,
   * sa vie, et la dernière ligne de chronique. C'est ce que les deux panneaux
   * latéraux disent en paysage, ramené à la largeur d'un téléphone.
   */
  private majInfoPortrait(): void {
    if (this.plan.fiche <= 0) {
      if (this.cleInfo !== 'aucun') {
        this.cleInfo = 'aucun';
        this.infoCorps.removeChildren().forEach((c) => c.destroy({ children: true }));
        this.infoFond.clear();
      }
      return;
    }
    const u = this.selection ? findUnit(this.combat, this.selection) : null;
    const dernier = this.journalLocal.length > 0 ? this.journalLocal[this.journalLocal.length - 1] : null;
    const cle = [
      u?.uid ?? 'vide',
      u?.count ?? 0,
      u?.topHp ?? 0,
      u?.effects.length ?? 0,
      dernier?.text ?? '',
      this.largeur,
      this.plan.fiche,
    ].join('|');
    if (cle === this.cleInfo) return;
    this.cleInfo = cle;
    this.infoBas.cacheAsTexture(false);
    this.infoCorps.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.infoFond.clear();

    const w = this.largeur - 16;
    const h = this.plan.fiche - 8;
    const marge = 12;
    const g = new Graphics();
    this.infoCorps.addChild(g);
    panneau(this.infoFond, this.deps.atlas.materials, 0, 0, w, h, {
      teinte: PALETTE.parchemin,
      matiere: 'parchemin',
      matiereAlpha: 0.2,
      graine: 19,
    });

    if (!u) {
      const t = titre('Aucune pile choisie', 14, PALETTE.encre);
      t.position.set(marge, 14);
      this.infoCorps.addChild(t);
      const s = donnee('Touchez une pile pour lire sa fiche.', 12.5, melanger(PALETTE.encre, PALETTE.brunFougere, 0.4));
      s.position.set(marge, 36);
      this.infoCorps.addChild(s);
      this.figer(this.infoBas);
      return;
    }

    const def = unitDef(u);
    const camp = this.camps[u.side];
    const vign = vignettePile(this.deps.atlas, u, camp, 52, { nombre: false });
    vign.position.set(marge, 12);
    this.infoCorps.addChild(vign);

    const nom = titre(u.count > 1 ? def.namePlural : def.name, 14, PALETTE.encre);
    nom.position.set(marge + 62, 12);
    this.infoCorps.addChild(nom);

    const effectif = donnee(
      `${nombreFr(u.count)} sur ${nombreFr(u.startCount)} · ${camp.nom}`,
      12,
      melanger(PALETTE.encre, camp.couleur, 0.4),
      true,
    );
    effectif.position.set(marge + 62, 32);
    this.infoCorps.addChild(effectif);

    /* chiffres du moteur, sur une ligne : ce sont eux qu'on regarde en combat */
    const chiffres: [string, string][] = [
      ['att.', String(effectiveAttack(this.combat, u))],
      ['déf.', String(effectiveDefense(this.combat, u))],
      ['dég.', `${def.dmgMin}–${def.dmgMax}`],
      ['vit.', `${effectiveSpeed(this.combat, u)}`],
      ['ini.', String(effectiveInitiative(this.combat, u))],
    ];
    const pas = Math.floor((w - marge * 2) / chiffres.length);
    let x = marge;
    for (const [k, v] of chiffres) {
      const tk = donnee(k, 11, melanger(PALETTE.encre, PALETTE.brunFougere, 0.45));
      tk.position.set(x, 68);
      this.infoCorps.addChild(tk);
      const tv = donnee(v, 14, PALETTE.encre, true);
      tv.position.set(x, 80);
      this.infoCorps.addChild(tv);
      x += pas;
    }

    const total = unitTotalHp(u);
    const max = Math.max(1, u.startCount * def.hp);
    jauge(g, marge, h - 34, w - marge * 2, 8, total / max, melanger(PALETTE.vertHetre, LIGHT.chaude, 0.25));
    const vie = donnee(
      `${nombreFr(total)} / ${nombreFr(max)} points de vie`,
      11,
      melanger(PALETTE.encre, PALETTE.brunFougere, 0.45),
    );
    vie.position.set(marge, h - 23);
    this.infoCorps.addChild(vie);

    if (dernier) {
      const l = donnee(dernier.text, 11, melanger(PALETTE.encre, PALETTE.bleuProfond, 0.25));
      l.anchor.set(1, 0);
      l.position.set(w - marge, h - 23);
      if (l.width < w - marge * 2 - 150) this.infoCorps.addChild(l);
      else l.destroy();
    }
    this.figer(this.infoBas);
  }

  private hauteurPanneauBas(): number {
    if (!this.plan.compact) return this.plan.bas;
    /* `this.plan.bas` et non un 74 recopié : `disposerIhm` compare cette
       hauteur à `plan.bas` pour savoir si le panneau est rétracté, et les
       deux valeurs avaient divergé une fois déjà. */
    return this.panneauReplie ? this.plan.bas : Math.min(this.hauteur * 0.52, 320);
  }

  /** Fiche de la pile sélectionnée : ce qu'elle est, ce qu'elle porte. */
  private majFiche(): void {
    const u = this.selection ? findUnit(this.combat, this.selection) : null;
    const cle = u
      ? `${u.uid}:${u.count}:${u.topHp}:${u.effects.length}:${u.shots}:${u.defending}:${this.plan.gauche}:${this.hauteur}`
      : `vide:${this.plan.gauche}`;
    if (cle === this.cleFiche) return;
    this.cleFiche = cle;

    this.ficheG.cacheAsTexture(false);
    this.ficheGCorps.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.ficheGFond.clear();
    if (this.plan.compact) return;

    const w = this.plan.gauche - 20;
    const hMax = this.hauteur - this.plan.barre - this.plan.bas - 34;
    const g = new Graphics();
    this.ficheGCorps.addChild(g);
    let y = 14;
    const marge = 14;

    if (!u) {
      const t = titre('Aucune pile', 15, PALETTE.encre);
      t.position.set(marge, y);
      this.ficheGCorps.addChild(t);
      y += 30;
      panneau(this.ficheGFond, this.deps.atlas.materials, 0, 0, w, y, { graine: 19 });
      this.figer(this.ficheG);
      return;
    }

    const def = unitDef(u);
    const camp = this.camps[u.side];

    /* portrait et identité */
    const vign = vignettePile(this.deps.atlas, u, camp, 66, { nombre: false });
    vign.position.set(marge, y);
    this.ficheGCorps.addChild(vign);

    const nom = titre(u.count > 1 ? def.namePlural : def.name, 15, PALETTE.encre);
    nom.position.set(marge + 76, y + 2);
    this.ficheGCorps.addChild(nom);

    const effectif = donnee(
      `${nombreFr(u.count)} sur ${nombreFr(u.startCount)}`,
      14,
      melanger(PALETTE.encre, PALETTE.brunFougere, 0.35),
      true,
    );
    effectif.position.set(marge + 76, y + 24);
    this.ficheGCorps.addChild(effectif);

    const camp2 = donnee(camp.nom, 12, melanger(PALETTE.encre, camp.couleur, 0.55));
    camp2.position.set(marge + 76, y + 43);
    this.ficheGCorps.addChild(camp2);
    y += 74;

    /* vie de la pile */
    const total = unitTotalHp(u);
    const max = Math.max(1, u.startCount * def.hp);
    jauge(g, marge, y, w - marge * 2, 9, total / max, melanger(PALETTE.vertHetre, LIGHT.chaude, 0.25));
    const vie = donnee(`${nombreFr(total)} / ${nombreFr(max)} points de vie`, 12, melanger(PALETTE.encre, PALETTE.brunFougere, 0.45));
    vie.position.set(marge, y + 12);
    this.ficheGCorps.addChild(vie);
    y += 32;

    filetSepare(g, marge, y, w - marge * 2, 0.7);
    y += 10;

    /* caractéristiques, telles que le moteur les calcule maintenant */
    const lignes: [string, string][] = [
      ['Attaque', String(effectiveAttack(this.combat, u))],
      ['Défense', String(effectiveDefense(this.combat, u))],
      ['Dégâts', `${def.dmgMin} – ${def.dmgMax}`],
      ['Vitesse', `${effectiveSpeed(this.combat, u)} hex.`],
      ['Initiative', String(effectiveInitiative(this.combat, u))],
      ['Mouvement', `${movementPoints(this.combat, u)} hex.`],
    ];
    if (def.shooter) lignes.push(['Tirs', `${u.shots}`]);
    lignes.push(['Ripostes', String(u.retaliationsLeft)]);
    if (u.morale !== 0) lignes.push(['Moral', u.morale > 0 ? `+${u.morale}` : String(u.morale)]);
    if (u.fortune !== 0) lignes.push(['Fortune', u.fortune > 0 ? `+${u.fortune}` : String(u.fortune)]);

    for (let i = 0; i < lignes.length; i += 1) {
      const [k, v] = lignes[i];
      if (i % 2 === 0) {
        g.rect(marge - 4, y - 2, w - marge * 2 + 8, 19).fill({
          color: melanger(PALETTE.parcheminOmbre, PALETTE.parchemin, 0.4),
          alpha: 0.5,
        });
      }
      const tk = donnee(k, 13, melanger(PALETTE.encre, PALETTE.brunFougere, 0.4));
      tk.position.set(marge, y);
      this.ficheGCorps.addChild(tk);
      const tv = donnee(v, 13.5, PALETTE.encre, true);
      tv.anchor.set(1, 0);
      tv.position.set(w - marge, y);
      this.ficheGCorps.addChild(tv);
      y += 19;
    }
    y += 8;

    /* capacités */
    if (def.abilities.length > 0 && y < hMax - 60) {
      filetSepare(g, marge, y, w - marge * 2, 0.6);
      y += 10;
      const t = donnee('Capacités', 12.5, melanger(PALETTE.encre, PALETTE.brunFougere, 0.35), true);
      t.position.set(marge, y);
      this.ficheGCorps.addChild(t);
      y += 18;
      for (const ab of def.abilities) {
        if (y > hMax - 26) break;
        pastille(g, marge + 4, y + 7, 3.2, PALETTE.vieilOr, 0.9);
        const l = recit(describeAbility(ab), 12.5, melanger(PALETTE.encre, PALETTE.brunFougere, 0.2), w - marge * 2 - 14);
        l.position.set(marge + 13, y - 1);
        this.ficheGCorps.addChild(l);
        y += Math.max(17, l.height + 3);
      }
      y += 6;
    }

    /* altérations en cours */
    if (u.effects.length > 0 && y < hMax - 40) {
      filetSepare(g, marge, y, w - marge * 2, 0.6);
      y += 10;
      for (const e of u.effects) {
        if (y > hMax - 20) break;
        pastille(g, marge + 4, y + 7, 3.2, PALETTE.bleuBrume, 0.9);
        const l = donnee(libelleEffet(e), 12.5, melanger(PALETTE.encre, PALETTE.bleuProfond, 0.3));
        l.position.set(marge + 13, y);
        this.ficheGCorps.addChild(l);
        y += 17;
      }
      y += 6;
    }

    panneau(this.ficheGFond, this.deps.atlas.materials, 0, 0, w, Math.min(y + 6, hMax), {
      teinte: PALETTE.parchemin,
      matiere: 'parchemin',
      matiereAlpha: 0.2,
      graine: 19,
    });
    this.figer(this.ficheG);
  }

  /** Historique et modificateurs : ce qui s'est passé, et ce qui pèse. */
  private majJournal(): void {
    const cle = `${this.journalLocal.length}:${this.combat.round}:${this.plan.droite}:${this.hauteur}:${this.actif ?? ''}`;
    if (cle === this.cleJournal) return;
    this.cleJournal = cle;
    this.journalD.cacheAsTexture(false);
    this.journalDCorps.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.journalDFond.clear();
    if (this.plan.compact) return;

    const w = this.plan.droite - 16;
    const hMax = this.hauteur - this.plan.barre - this.plan.bas - 34;
    const marge = 14;
    const g = new Graphics();
    this.journalDCorps.addChild(g);
    let y = 14;

    const t = titre('Modificateurs', 15, PALETTE.encre);
    t.position.set(marge, y);
    this.journalDCorps.addChild(t);
    y += 26;

    /* conditions permanentes du champ : elles pèsent sur chaque coup */
    const conditions: [string, string][] = [
      ['Terrain', capitale(terrainLabel(this.combat.terrain))],
      ['Temps', capitale(weatherLabel(this.combat.weather))],
      ['Décor', AMBIANCE_LABELS[this.champ.ambiance]],
    ];
    if (this.combat.siege) conditions.push(['Ouvrage', 'Siège en cours']);
    for (const [k, v] of conditions) {
      pastille(g, marge + 4, y + 7, 3.2, PALETTE.bleuBrume, 0.85);
      const tk = donnee(k, 12.5, melanger(PALETTE.encre, PALETTE.brunFougere, 0.4));
      tk.position.set(marge + 13, y);
      this.journalDCorps.addChild(tk);
      const tv = donnee(v, 12.5, PALETTE.encre, true);
      tv.anchor.set(1, 0);
      tv.position.set(w - marge, y);
      this.journalDCorps.addChild(tv);
      y += 18;
    }
    y += 4;

    /* rapport de force, lu dans le moteur */
    const vieA = this.combat.units.filter((u) => u.side === 0 && u.alive).reduce((s, u) => s + unitTotalHp(u), 0);
    const vieB = this.combat.units.filter((u) => u.side === 1 && u.alive).reduce((s, u) => s + unitTotalHp(u), 0);
    const totalVie = Math.max(1, vieA + vieB);
    jauge(g, marge, y, w - marge * 2, 8, vieA / totalVie, this.camps[0].couleur);
    g.rect(marge + (w - marge * 2) * (vieA / totalVie), y, Math.max(1, (w - marge * 2) * (vieB / totalVie)), 8).fill({
      color: this.camps[1].couleur,
      alpha: 0.9,
    });
    g.rect(marge, y, w - marge * 2, 8).stroke({ color: assombrir(PALETTE.granitAnthracite, 0.4), width: 1 });
    const rapport = donnee(
      `${nombreFr(vieA)} contre ${nombreFr(vieB)} points de vie`,
      11.5,
      melanger(PALETTE.encre, PALETTE.brunFougere, 0.45),
    );
    rapport.position.set(marge, y + 11);
    this.journalDCorps.addChild(rapport);
    y += 30;

    filetSepare(g, marge, y, w - marge * 2, 0.7);
    y += 12;
    const th = titre('Chronique', 15, PALETTE.encre);
    th.position.set(marge, y);
    this.journalDCorps.addChild(th);
    y += 24;

    const entrees = this.journalLocal.slice(-30).reverse();
    for (const e of entrees) {
      if (y > hMax - 18) break;
      const teinte = couleurJournal(e.kind);
      pastille(g, marge + 4, y + 7, 3, teinte, 0.9);
      const round = donnee(String(e.round), 10.5, melanger(PALETTE.encre, PALETTE.bleuBrume, 0.5), true);
      round.anchor.set(1, 0);
      round.position.set(w - marge, y + 1);
      this.journalDCorps.addChild(round);
      const l = recit(e.text, 12.5, melanger(PALETTE.encre, PALETTE.brunFougere, 0.15), w - marge * 2 - 26);
      l.position.set(marge + 13, y - 2);
      this.journalDCorps.addChild(l);
      y += Math.max(17, l.height + 4);
    }

    panneau(this.journalDFond, this.deps.atlas.materials, 0, 0, w, Math.min(y + 8, hMax), {
      teinte: PALETTE.parchemin,
      matiere: 'parchemin',
      matiereAlpha: 0.2,
      graine: 37,
    });
    this.figer(this.journalD);
  }

  private pousserJournal(e: CombatLogEntry): void {
    this.journalLocal.push(e);
    if (this.journalLocal.length > 200) this.journalLocal.splice(0, this.journalLocal.length - 200);
    this.cleJournal = '';
    this.majJournal();
    this.majInfoPortrait();
  }

  /* ══════════════════════════════ Actions ════════════════════════════════ */

  private majActions(): void {
    const u0 = this.actif ? findUnit(this.combat, this.actif) : null;
    const cle = [
      u0?.uid ?? 'vide',
      u0?.count ?? 0,
      u0?.hasWaited ? 1 : 0,
      u0?.defending ? 1 : 0,
      u0?.shots ?? 0,
      this.apercu?.uidCible ?? '',
      this.plan.compact ? 'c' : 'l',
      this.panneauReplie ? 'r' : 'd',
      this.largeur,
      this.hauteur,
      this.combat.finished ? 'f' : 'e',
      this.adversaireDoitJouer ? 'ia' : 'moi',
    ].join('|');
    if (cle === this.cleActions) return;
    this.cleActions = cle;
    this.barreActions.cacheAsTexture(false);
    this.actionsCorps.removeChildren().forEach((c) => c.destroy({ children: true }));
    this.actionsFond.clear();
    this.poignee.clear();
    this.boutons = [];

    const u = this.actif ? findUnit(this.combat, this.actif) : null;
    const h = this.hauteurPanneauBas();
    plaqueGranit(this.actionsFond, this.deps.atlas.materials, 0, 0, this.largeur, h, {
      graine: 23,
      rayon: 2,
      ombre: false,
    });
    this.actionsFond.moveTo(0, 1).lineTo(this.largeur, 1).stroke({ color: LIGHT.rim, width: 1.2, alpha: 0.35 });

    if (this.plan.compact) {
      /* poignée du panneau rétractable : cible tactile de 48 px de haut */
      const pw = 96;
      const px = (this.largeur - pw) / 2;
      this.poignee.roundRect(px, 6, pw, 6, 3).fill({ color: melanger(PALETTE.parcheminOmbre, LIGHT.chaude, 0.2), alpha: 0.75 });
      this.poignee.roundRect(px, 6, pw, 2.4, 3).fill({ color: LIGHT.chaude, alpha: 0.25 });
      this.poignee.rect(px - 40, 0, pw + 80, POIGNEE_TACTILE).fill({ color: LIGHT.chaude, alpha: 0.001 });
    }

    const libelles = this.listeActions(u);
    const compact = this.plan.compact;
    /* La pose vient de `amarrage.ts`, qui garantit l'invariant gardé par
       `actions.test.ts` : chaque bouton tient dans l'écran, sous la bande de
       bascule, et ne descend pas sous 44 points de côté. */
    const pose = poserBoutonsActions({
      largeur: this.largeur,
      panneauBas: h,
      gauche: this.plan.gauche,
      droite: this.plan.droite,
      compact,
      replie: this.panneauReplie,
      nombre: libelles.length,
    });
    this.zonePoignee = pose.zonePoignee;

    for (let i = 0; i < libelles.length; i += 1) {
      const a = libelles[i];
      const r = pose.rectangles[i];
      const noeud = bouton(this.deps.atlas.materials, {
        largeur: r.w,
        hauteur: r.h,
        libelle: a.libelle,
        note: a.note,
        actif: a.actif,
        teinte: a.teinte,
      });
      noeud.position.set(r.x, r.y);
      this.actionsCorps.addChild(noeud);
      this.boutons.push({
        cle: a.cle,
        libelle: a.libelle,
        note: a.note,
        actif: a.actif,
        noeud,
        zone: new Rectangle(r.x, r.y, r.w, r.h),
      });
    }

    /* en mode compact déplié : la fiche courte au-dessus des boutons */
    if (compact && !this.panneauReplie && u) {
      const def = unitDef(u);
      const vign = vignettePile(this.deps.atlas, u, this.camps[u.side], 54, { nombre: false });
      vign.position.set(14, 22);
      this.actionsCorps.addChild(vign);
      const nom = titre(u.count > 1 ? def.namePlural : def.name, 15, melanger(PALETTE.parchemin, LIGHT.chaude, 0.3));
      nom.position.set(78, 24);
      this.actionsCorps.addChild(nom);
      const stats = donneeClaire(
        `${nombreFr(u.count)} · attaque ${effectiveAttack(this.combat, u)} · défense ${effectiveDefense(this.combat, u)} · ${effectiveSpeed(this.combat, u)} hex.`,
        12.5,
        melanger(PALETTE.bleuBrume, PALETTE.parchemin, 0.45),
      );
      stats.position.set(78, 46);
      this.actionsCorps.addChild(stats);
      const g = new Graphics();
      jauge(
        g,
        14,
        84,
        this.largeur - 28,
        7,
        unitTotalHp(u) / Math.max(1, u.startCount * def.hp),
        melanger(PALETTE.vertHetre, LIGHT.chaude, 0.25),
      );
      this.actionsCorps.addChild(g);
    } else if (compact && this.panneauReplie && u) {
      /* Le nom se range désormais DANS la bande de bascule, à gauche de la
         poignée : la rangée de boutons occupe tout le reste du panneau, et le
         nom posé à `y = 20` passait dessous. On ne l'écrit que s'il tient
         dans la place libre — un nom tronqué par la poignée n'apprend rien. */
      const nom = donneeClaire(
        `${unitLabel(u)} — ${this.camps[u.side].nom}`,
        11.5,
        melanger(PALETTE.parchemin, LIGHT.chaude, 0.3),
        true,
      );
      nom.position.set(12, 5);
      if (nom.width <= (this.largeur - 96) / 2 - 16) this.actionsCorps.addChild(nom);
      else nom.destroy();
    }
    this.figer(this.barreActions);
  }

  /** Ce que la pile active peut tenter, d'après le moteur seul. */
  private listeActions(u: CombatUnit | null): {
    cle: string;
    libelle: string;
    note?: string;
    actif: boolean;
    teinte?: number;
  }[] {
    const jeu = this.deps.store.get().game;
    const heros = this.herosDuCamp(u?.side ?? 0);
    if (!u || this.combat.finished) {
      return [
        { cle: 'auto', libelle: 'Résoudre', note: 'automatiquement', actif: !this.combat.finished },
        { cle: 'sorts', libelle: 'Grimoire', actif: false },
      ];
    }
    /* La pile qui joue n'est pas la nôtre : le moteur s'en charge, et aucun
       bouton ne doit laisser croire au joueur qu'il pilote le camp d'en face. */
    if (this.adversaireDoitJouer) {
      return [
        {
          cle: 'adversaire',
          libelle: 'L’adversaire réfléchit',
          note: `${this.camps[u.side].nom} — ${unitLabel(u)}`,
          actif: false,
        },
        { cle: 'auto', libelle: 'Résoudre', note: 'automatiquement', actif: true },
      ];
    }
    const def = unitDef(u);
    const capacite = canUseAbility(this.combat, u);
    const sortDispo =
      jeu && heros
        ? this.combat.units.length > 0 &&
          heros.spells.some((s) => canCastSpell(jeu, this.combat, u.side, s).ok)
        : false;
    const cible = this.apercu?.uidCible ? findUnit(this.combat, this.apercu.uidCible) : null;
    const tir = def.shooter === true && u.shots > 0;

    /*
     * Le bouton restait allumé sur une cible qu'on ne pouvait pas rejoindre :
     * le clic partait, le moteur refusait, et l'erreur s'affichait hors du
     * champ. L'atteignabilité se lit maintenant AVANT, dans `choisirApproche`.
     */
    const aTirer = tir && cible !== null && hexDistance(u.at, cible.at) > 1;
    const approche = cible && !aTirer ? choisirApproche(this.combat, u, cible) : null;
    const assautPossible = cible !== null && (aTirer || approche !== null);

    return [
      {
        cle: 'attaquer',
        libelle: aTirer ? 'Tirer' : 'Attaquer',
        note: !cible
          ? 'choisir une cible'
          : !assautPossible
            ? 'hors d’atteinte'
            : approche && approche.cout > 0
              ? `${unitLabel(cible)} · ${approche.cout} hex.`
              : unitLabel(cible),
        actif: assautPossible,
        teinte: melanger(PALETTE.parchemin, PALETTE.grenat, 0.1),
      },
      {
        cle: 'capacite',
        libelle: 'Capacité',
        note: capacite.ok ? 'prête' : undefined,
        actif: capacite.ok,
      },
      { cle: 'sorts', libelle: 'Grimoire', note: heros ? `${heros.mana} manne` : 'sans héros', actif: sortDispo },
      { cle: 'defendre', libelle: 'Défendre', note: '+ défense', actif: !u.defending },
      { cle: 'attendre', libelle: 'Attendre', note: u.hasWaited ? 'déjà fait' : 'plus tard', actif: !u.hasWaited },
      { cle: 'auto', libelle: 'Résoudre', note: 'automatiquement', actif: true },
    ];
  }

  private herosDuCamp(side: 0 | 1): HeroInstance | null {
    const jeu = this.deps.store.get().game;
    if (!jeu) return null;
    const uid = side === 0 ? this.combat.attacker.hero : this.combat.defender.hero;
    return uid ? (jeu.heroes[uid] ?? null) : null;
  }

  /** Rappel des commandes, discret, posé au-dessus de la barre d'actions. */
  private majAide(): void {
    const adverse = this.adversaireDoitJouer;
    const cle = `${this.plan.compact ? 'c' : 'l'}${adverse ? 'a' : ''}`;
    if (cle === this.cleAide) return;
    this.cleAide = cle;
    this.aide.cacheAsTexture(false);
    this.aide.removeChildren().forEach((c) => c.destroy({ children: true }));
    const texte = adverse
      ? 'L’adversaire réfléchit…'
      : this.plan.compact
        ? 'Marcher : touchez. Viser : touchez l’ennemi, encore pour frapper. Menaces : maintenez.'
        : 'Clic : marcher ou frapper · maintenir M : zones de menace · Échap : annuler';
    const t = donneeClaire(texte, 12, melanger(PALETTE.bleuBrume, PALETTE.parchemin, 0.35));
    const g = new Graphics();
    g.roundRect(-6, -3, t.width + 12, t.height + 6, 3).fill({
      color: PALETTE.granitAnthracite,
      alpha: 0.5,
    });
    this.aide.addChild(g, t);
    this.figer(this.aide);
  }

  /* ══════════════════════════════ Entrées ════════════════════════════════ */

  private brancherInteractions(): void {
    this.container.eventMode = 'static';
    this.container.on('pointermove', (e: FederatedPointerEvent) => this.surDeplacement(e));
    this.container.on('pointerdown', (e: FederatedPointerEvent) => this.surAppui(e));
    this.container.on('pointertap', (e: FederatedPointerEvent) => this.surClic(e));
    this.container.on('pointerup', () => this.relacherMaintien());
    this.container.on('pointerupoutside', () => this.relacherMaintien());
    this.container.on('pointercancel', () => this.relacherMaintien());
    this.container.on('pointerleave', () => {
      this.relacherMaintien();
      this.survol = null;
      this.marques.set({ survol: null, chemin: null });
    });

    /*
     * Pincer-zoomer, exigence du propriétaire : « il faut aussi pouvoir
     * zoomer dans les combats sur l'iPhone ». Sur un écran de 390 points, un
     * hexagone fait une vingtaine de pixels et une pile de créatures guère
     * plus : viser du pouce est une loterie. Le geste à un doigt reste au
     * jeu — marcher, frapper — comme sur la carte d'aventure.
     */
    const toile = this.deps.app.canvas as HTMLCanvasElement | undefined;
    if (toile && typeof toile.addEventListener === 'function') {
      this.debrancherPince = brancherPincement(toile, {
        surFin: this.gardePince.surFin,
        surPincement: (g) => {
          if (this.detruit) return;
          const { echelle, applique } = echelleBornee(this.zoom, g.facteur, 1, ZOOM_COMBAT_MAX);
          this.zoom = echelle;
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
   * Grossissement et déplacement du champ. La POSITION de `container`
   * appartient à la coquille, qui le centre : on ne touche qu'à son échelle,
   * et le déplacement passe par la racine, en unités locales.
   */
  /** Le relâché qui clôt un pincement n'est pas un clic. */
  private readonly gardePince = gardePincement();

  private appliquerZoom(): void {
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

  private local(e: FederatedPointerEvent): { x: number; y: number } {
    const p = this.racine.toLocal(e.global);
    return { x: p.x, y: p.y };
  }

  private surDeplacement(e: FederatedPointerEvent): void {
    if (this.detruit) return;
    const p = this.local(e);
    const m = this.maintien;
    if (m) {
      const d = Math.hypot(p.x - m.x, p.y - m.y);
      if (d > m.ecart) m.ecart = d;
    }
    if (!this.dansLePlateau(p)) {
      if (this.survol) {
        this.survol = null;
        this.marques.set({ survol: null, chemin: null });
      }
      return;
    }
    const h = this.geo.hexAt(p.x, p.y);
    if (!h) return;
    if (this.survol && this.survol.col === h.col && this.survol.row === h.row) return;
    this.survol = h;
    this.deps.onHoverHex?.(h);
    this.marques.set({ survol: h });
    this.majSurvol();
  }

  /** Le survol décide : chemin prévisualisé, ou carte d'attaque. */
  private majSurvol(): void {
    const u = this.actif ? findUnit(this.combat, this.actif) : null;
    if (!u || !this.survol) return;
    const cible = this.combat.units.find(
      (x) => x.alive && x.at.col === this.survol?.col && x.at.row === this.survol?.row,
    );
    if (cible && cible.side !== u.side) {
      /* En compact la visée est SANGLÉE : un `pointermove` de doigt précède
         chaque `pointertap`, et l'effacer ici ramènerait chaque appui au
         rang de premier appui — la cible ne serait jamais frappée. */
      if (!this.plan.compact) this.cibleForcee = null;
      this.marques.set({ chemin: null });
      this.majApercu();
      this.majActions();
      return;
    }
    if (!cible) {
      /* le chemin vient de `hexPath` : la vue ne trace rien qu'elle a deviné */
      this.marques.set({ chemin: hexPath(this.combat, u, this.survol) });
    }
    if (!this.cibleForcee) this.majApercu();
  }

  private surAppui(e: FederatedPointerEvent): void {
    if (!this.plan.compact) return;
    const p = this.local(e);
    /* la carte amarrée se replie et se déplie d'une touche sur son bandeau */
    const zc = this.zoneCarte();
    if (zc && this.carteAmarree && p.x >= zc.x && p.x <= zc.x + zc.width && p.y >= zc.y && p.y <= zc.y + Math.min(zc.height, this.enteteCarte)) {
      this.carteRepliee = !this.carteRepliee;
      this.placerCarte();
      this.disposerIhm();
      return;
    }
    const yBas = this.hauteur - this.hauteurPanneauBas();
    /* La même bande que celle laissée libre par `poserBoutonsActions` : c'est
       leur divergence qui faisait basculer le panneau quand on visait le haut
       d'un bouton, avant que le relâché ne tombe sur un bouton déplacé. */
    if (p.y >= yBas && p.y < yBas + this.zonePoignee) {
      this.panneauReplie = !this.panneauReplie;
      this.majActions();
      this.disposerIhm();
      return;
    }
    /* Doigt posé sur le champ : c'est peut-être une demande de menaces. */
    if (this.dansLePlateau(p)) this.maintien = { x: p.x, y: p.y, ms: 0, ecart: 0 };
  }

  /** Le doigt se lève : fin du maintien, et repli des menaces qu'il montrait. */
  private relacherMaintien(): void {
    this.maintien = null;
    if (!this.menacesParMaintien) return;
    this.menacesParMaintien = false;
    this.menacesVisibles = false;
    this.majPortee();
  }

  /**
   * Fait mûrir le maintien du doigt. Le seuil et la tolérance sont dans
   * `maintienMontreLesMenaces`, testée à part : ici on ne fait que compter.
   */
  private avancerMaintien(dt: number): void {
    const m = this.maintien;
    if (!m || this.menacesParMaintien) return;
    m.ms += dt;
    if (!maintienMontreLesMenaces(m.ms, m.ecart)) return;
    const u = this.actif ? findUnit(this.combat, this.actif) : null;
    if (!u) return;
    this.menacesParMaintien = true;
    this.menacesVisibles = true;
    /* Le relâché qui clôt le maintien n'est pas un coup : sans ce garde-fou,
       lever le doigt dépenserait l'activation qu'on cherchait à protéger. */
    this.avalerLeClic = true;
    this.majPortee();
  }

  private surClic(e: FederatedPointerEvent): void {
    if (this.detruit) return;
    /*
     * Le relâché qui clôt un pincement n'est pas une visée.
     *
     * `brancherPincement` le dit dans son contrat — « à charge pour l'appelant
     * d'ignorer le prochain relâché » — et expose `surFin` pour cela. Les deux
     * scènes branchaient `surPincement` sans jamais fournir `surFin` : le
     * garde-fou existait et n'était appelé de nulle part. Au combat, lever les
     * doigts après un zoom émettait donc un déplacement ou une attaque sur
     * l'hexagone qui se trouvait dessous — et consommait l'action du tour.
     */
    if (this.gardePince.avaleLeClic()) return;
    /* Le relâché qui clôt un maintien n'est pas un coup non plus : le doigt
       demandait à VOIR les menaces, pas à dépenser l'activation. */
    if (this.avalerLeClic) {
      this.avalerLeClic = false;
      return;
    }
    const p = this.local(e);

    /* 1 — les boutons d'action */
    const yBas = this.hauteur - this.hauteurPanneauBas();
    if (p.y >= yBas) {
      const local = { x: p.x, y: p.y - yBas };
      for (const b of this.boutons) {
        if (b.zone.contains(local.x, local.y)) {
          /* Un bouton éteint ne fait rien. Il partait quand même, et l'action
             refusée revenait en bulle hors du champ de bataille. */
          if (b.actif) this.declencher(b.cle);
          return;
        }
      }
      return;
    }

    /* 1 bis — la carte amarrée : elle est superposée, elle prend la touche */
    if (this.carteAmarree) {
      const zc = this.zoneCarte();
      if (zc && zc.contains(p.x, p.y)) return;
    }

    /* 2 — le grimoire ouvert */
    if (this.grimoire.ouvert) {
      const g = this.grimoire.container.position;
      const id = this.grimoire.sortA(p.x - g.x, p.y - g.y);
      if (id) {
        this.choisirSort(id);
        return;
      }
    }

    /* 3 — le plateau */
    if (!this.dansLePlateau(p)) return;
    const h = this.geo.hexAt(p.x, p.y);
    if (!h) return;
    this.deps.onPickHex?.(h);
    const cible = this.combat.units.find((x) => x.alive && x.at.col === h.col && x.at.row === h.row);
    if (cible) this.deps.onPickUnit?.(cible);

    const u = this.actif ? findUnit(this.combat, this.actif) : null;
    /* Pile adverse en train de jouer : le clic ne sert qu'à regarder. */
    if (!u || this.combat.finished || this.adversaireDoitJouer) {
      if (cible) this.selection = cible.uid;
      this.cleFiche = '';
      this.appliquer();
      return;
    }

    if (this.grimoire.ouvert && this.grimoire.sortChoisi) {
      this.lancerSort(this.grimoire.sortChoisi, cible ? cible.uid : h);
      return;
    }

    if (cible && cible.side !== u.side) {
      const geste = gesteSurEnnemi(this.plan.compact, this.cibleForcee, cible.uid);
      this.cibleForcee = cible.uid;
      this.selection = cible.uid;
      this.majApercu();
      this.majActions();
      this.cleFiche = '';
      this.majInfoPortrait();
      /* Au doigt, le premier appui ne fait que viser : il pose l'aperçu et le
         curseur. C'est le second appui sur la MÊME pile — ou le bouton
         « Attaquer » — qui dépense le tour. */
      if (geste === 'frapper') this.assaillir(u, cible);
      return;
    }
    if (cible) {
      this.selection = cible.uid;
      this.cleFiche = '';
      this.appliquer();
      return;
    }
    if (this.atteignables.some((a) => a.col === h.col && a.row === h.row)) {
      this.emettre({ kind: 'move', unit: u.uid, to: h });
    }
  }

  /**
   * Le geste de HMM3 : on désigne l'ennemi, la pile marche jusqu'à lui et
   * frappe. L'attaque emporte sa case de départ (`from`), faute de quoi le
   * moteur refuse tout ce qui n'est pas déjà au contact. Si aucune case
   * d'approche n'est atteignable, RIEN ne part : l'aperçu et le bouton l'ont
   * déjà dit, il n'y a pas d'erreur à faire remonter.
   */
  private assaillir(u: CombatUnit, cible: CombatUnit): void {
    const action = actionAssaut(this.combat, u, cible);
    if (action) this.emettre(action);
  }

  private dansLePlateau(p: { x: number; y: number }): boolean {
    return (
      p.x > this.plan.gauche &&
      p.x < this.largeur - this.plan.droite &&
      p.y > this.plan.barre &&
      p.y < this.hauteur - this.hauteurPanneauBas() - this.plan.info
    );
  }

  private declencher(cle: string): void {
    const u = this.actif ? findUnit(this.combat, this.actif) : null;
    /* Seul « Résoudre » reste offert pendant que le moteur joue l'adversaire. */
    if (this.adversaireDoitJouer && cle !== 'auto') return;
    switch (cle) {
      case 'attaquer': {
        const cible = this.apercu?.uidCible ? findUnit(this.combat, this.apercu.uidCible) : null;
        if (u && cible) this.assaillir(u, cible);
        break;
      }
      case 'capacite':
        if (u) this.emettre({ kind: 'ability', unit: u.uid });
        break;
      case 'defendre':
        if (u) this.emettre({ kind: 'defend', unit: u.uid });
        break;
      case 'attendre':
        if (u) this.emettre({ kind: 'wait', unit: u.uid });
        break;
      case 'sorts':
        this.basculerGrimoire();
        break;
      case 'auto':
        this.deps.dispatch({ type: 'AutoResolveCombat' });
        break;
      default:
        break;
    }
  }

  private emettre(action: CombatAction): void {
    this.cibleForcee = null;
    this.deps.dispatch({ type: 'CombatAction', action });
  }

  /* ══════════════════════════════ Grimoire ═══════════════════════════════ */

  private basculerGrimoire(): void {
    if (this.grimoire.ouvert) {
      this.grimoire.fermer();
      this.grimoire.choisir(null);
      this.setSpellTargets(null);
      return;
    }
    const u = this.actif ? findUnit(this.combat, this.actif) : null;
    const side = u?.side ?? 0;
    const heros = this.herosDuCamp(side);
    const jeu = this.deps.store.get().game;
    const entrees: EntreeSort[] = [];
    if (jeu && heros) {
      for (const id of heros.spells) {
        const def = sortConnu(id);
        if (!def) continue;
        if (def.scope !== 'combat' && def.scope !== 'les_deux') continue;
        const verdict = canCastSpell(jeu, this.combat, side, id);
        entrees.push({ def, possible: verdict.ok, refus: verdict.ok ? null : (verdict.error ?? null) });
      }
    }
    const largeur = this.plan.compact ? Math.min(320, this.largeur - 24) : 300;
    this.grimoire.montrer(heros, entrees, largeur);
    this.disposerIhm();
  }

  private choisirSort(id: SpellId): void {
    this.grimoire.choisir(id);
    const def = sortConnu(id);
    const u = this.actif ? findUnit(this.combat, this.actif) : null;
    const side = u?.side ?? 0;
    if (!def) return;
    /* cases proposées : celles où le sort a un sens, d'après sa portée */
    let cases: HexCoord[] = [];
    if (def.target === 'all_enemies') {
      cases = livingUnits(this.combat, side === 0 ? 1 : 0).map((x) => x.at);
    } else if (def.target === 'all_allies') {
      cases = livingUnits(this.combat, side).map((x) => x.at);
    } else if (def.target === 'battlefield') {
      cases = livingUnits(this.combat).map((x) => x.at);
    } else if (def.target === 'enemy_stack') {
      cases = livingUnits(this.combat, side === 0 ? 1 : 0).map((x) => x.at);
    } else if (def.target === 'ally_stack') {
      cases = livingUnits(this.combat, side).map((x) => x.at);
    } else {
      cases = livingUnits(this.combat).map((x) => x.at);
    }
    this.setSpellTargets(cases);
    const jeu = this.deps.store.get().game;
    if (jeu && (def.target === 'all_enemies' || def.target === 'all_allies' || def.target === 'battlefield')) {
      /* pas de cible à désigner : le sort part au clic suivant sur le grimoire */
      this.grimoire.choisir(id);
    }
    this.grimoire.montrer(
      this.herosDuCamp(side),
      this.entreesGrimoire(side),
      this.plan.compact ? Math.min(320, this.largeur - 24) : 300,
    );
  }

  private entreesGrimoire(side: 0 | 1): EntreeSort[] {
    const jeu = this.deps.store.get().game;
    const heros = this.herosDuCamp(side);
    const out: EntreeSort[] = [];
    if (!jeu || !heros) return out;
    for (const id of heros.spells) {
      const def = sortConnu(id);
      if (!def) continue;
      if (def.scope !== 'combat' && def.scope !== 'les_deux') continue;
      const verdict = canCastSpell(jeu, this.combat, side, id);
      out.push({ def, possible: verdict.ok, refus: verdict.ok ? null : (verdict.error ?? null) });
    }
    return out;
  }

  private lancerSort(spell: SpellId, target: string | HexCoord): void {
    this.deps.dispatch({ type: 'CombatAction', action: { kind: 'cast', spell, target } });
    this.grimoire.fermer();
    this.grimoire.choisir(null);
    this.setSpellTargets(null);
  }

  /* ══════════════════════════════ Clavier ════════════════════════════════ */

  private brancherClavier(): void {
    if (typeof window === 'undefined') return;
    this.surTouche = (e: KeyboardEvent): void => {
      if (this.detruit) return;
      const k = e.key.toLowerCase();
      if (k === 'm' && !this.menacesVisibles) {
        this.menacesVisibles = true;
        this.majPortee();
      } else if (k === 'escape') {
        this.cibleForcee = null;
        this.grimoire.fermer();
        this.grimoire.choisir(null);
        this.setSpellTargets(null);
        this.setAttackPreview(null);
      } else if (k === 'a') {
        this.declencher('attendre');
      } else if (k === 'd') {
        this.declencher('defendre');
      }
    };
    this.surRelache = (e: KeyboardEvent): void => {
      if (this.detruit) return;
      if (e.key.toLowerCase() === 'm') {
        this.menacesVisibles = false;
        this.majPortee();
      }
    };
    window.addEventListener('keydown', this.surTouche);
    window.addEventListener('keyup', this.surRelache);
  }

  /* ═════════════════════════ Ouverture de scène ══════════════════════════ */

  /**
   * En démonstration, la revue visuelle exige une prévisualisation d'attaque
   * ouverte : on désigne donc la cible que la pile active viserait en premier
   * — la plus proche qu'elle peut atteindre. C'est un choix d'affichage, pas
   * une règle : les nombres restent ceux de `damageRange`.
   */
  ouvrirScene(): void {
    const u = this.actif ? findUnit(this.combat, this.actif) : null;
    if (!u) return;
    const ennemis = livingUnits(this.combat, u.side === 0 ? 1 : 0);
    if (ennemis.length === 0) return;
    let meilleure = ennemis[0];
    let meilleureD = hexDistance(u.at, meilleure.at);
    for (const e of ennemis) {
      const d = hexDistance(u.at, e.at);
      if (d < meilleureD) {
        meilleureD = d;
        meilleure = e;
      }
    }
    this.cibleForcee = meilleure.uid;
    this.selection = u.uid;
    const chemin = hexPath(this.combat, u, plusProcheAtteignable(this.atteignables, meilleure.at));
    this.marques.set({ chemin });
    this.marques.set({ curseur: { depuis: u.at, vers: meilleure.at } });
    this.majApercu();
    this.majActions();
    /* orientation : chacun regarde son adversaire */
    this.unites.pile(u.uid)?.orienter(meilleure.at.col >= u.at.col ? 1 : -1);
    this.unites.pile(meilleure.uid)?.orienter(meilleure.at.col >= u.at.col ? -1 : 1);
  }
}

/* ═══════════════════════════════ Aides ═══════════════════════════════════ */

function capitale(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

function couleurJournal(kind: CombatLogEntry['kind']): number {
  switch (kind) {
    case 'attaque':
      return PALETTE.grenat;
    case 'mort':
      return assombrir(PALETTE.grenat, 0.4);
    case 'sort':
      return melanger(PALETTE.bleuProfond, PALETTE.bleuBrume, 0.4);
    case 'moral':
      return PALETTE.vieilOr;
    case 'fortune':
      return PALETTE.ocre;
    case 'capacite':
      return PALETTE.vertHetre;
    default:
      return PALETTE.bleuBrume;
  }
}

/** L'hexagone atteignable le plus proche d'une cible, pour tracer un chemin. */
function plusProcheAtteignable(atteignables: readonly HexCoord[], cible: HexCoord): HexCoord {
  let meilleur = cible;
  let d = Number.MAX_SAFE_INTEGER;
  for (const h of atteignables) {
    const dd = hexDistance(h, cible);
    if (dd > 0 && dd < d) {
      d = dd;
      meilleur = h;
    }
  }
  return meilleur;
}

/* ════════════════════════════ La fabrique ════════════════════════════════ */

/**
 * Fabrique du combat tactique. **Signature imposée** par
 * `apps/client/src/view-contract.ts` : ne pas la changer.
 */
export async function createBattleView(deps: BattleViewDeps): Promise<BattleView> {
  const vue = new VueCombat(deps);
  vue.resize(deps.width, deps.height);
  vue.ouvrirScene();
  return vue;
}

export type { BattleView, BattleViewDeps } from '../view-contract.js';
