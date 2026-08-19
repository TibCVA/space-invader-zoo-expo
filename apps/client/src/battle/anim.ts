/**
 * `battle/anim.ts` — la file d'animations du combat.
 *
 * Le moteur ne dit pas « anime ceci » : il émet des `GameEvent`
 * (`{ type: 'CombatAction', entry }`) dont le journal porte le texte français
 * et le détail chiffré. Ce module les traduit en gestes, **dans l'ordre** et
 * **un à la fois** : la vue ne montre jamais un état à moitié appliqué.
 *
 * Gestes couverts : marche le long du chemin hexagonal, attaque, tir, impact
 * avec secousse d'écran bornée, riposte, défense, attente, capacité, sort,
 * moral, fortune, mort avec dissolution, et le salut de victoire.
 *
 * Aucune règle n'est calculée : les dégâts, les pertes et les cases viennent
 * tous du journal du moteur.
 */

import { hexDistance, hexLine, hexPath } from '@auvergne/engine';
import type { CombatLogEntry, CombatState, GameEvent, HexCoord } from '@auvergne/engine';
import { LIGHT, PALETTE, melanger } from '../art/palette.js';
import type { Geometrie } from './hexgrid.js';
import type { CoucheUnites, PileVue } from './units.js';
import type { CoucheVfx } from './vfx.js';

/* ═══════════════════════════════ Tâches ══════════════════════════════════ */

interface Tache {
  /** durée en secondes ; 0 = instantané */
  duree: number;
  debut?(): void;
  pas?(t: number, dt: number): void;
  fin?(): void;
  /** index de l'événement d'origine, pour `onActionPlayed` */
  index: number;
}

export interface ContexteAnim {
  readonly geo: Geometrie;
  readonly piles: CoucheUnites;
  readonly vfx: CoucheVfx;
  /** état courant tel que la vue le connaît */
  readonly combat: () => CombatState;
  readonly reducedMotion: boolean;
  /** prévient la coquille qu'une animation est jouée */
  readonly onEtape?: (index: number) => void;
  /** prévient l'interface qu'une ligne de journal doit s'afficher */
  readonly onJournal?: (entry: CombatLogEntry) => void;
  /** appelé quand la file se vide */
  readonly onRepos?: () => void;
}

/* ═══════════════════════════ La file d'attente ═══════════════════════════ */

export class FileAnimations {
  private taches: Tache[] = [];
  private courante: Tache | null = null;
  private ecoule = 0;
  private attentes: (() => void)[] = [];
  private dernierIndex = -1;

  private ctx: ContexteAnim;

  constructor(ctx: ContexteAnim) {
    this.ctx = ctx;
  }

  /**
   * Le plateau a changé de taille : la file doit viser la nouvelle géométrie
   * et les nouvelles piles, sans quoi elle animerait des fantômes.
   */
  remplacerContexte(partiel: Partial<ContexteAnim>): void {
    this.ctx = { ...this.ctx, ...partiel };
  }

  get occupee(): boolean {
    return this.courante !== null || this.taches.length > 0;
  }

  /**
   * Enfile les événements et se résout quand tout est joué. En mouvement
   * réduit, tout est appliqué immédiatement : l'état final est le même.
   */
  enfiler(events: readonly GameEvent[]): Promise<void> {
    for (let i = 0; i < events.length; i += 1) {
      this.traduire(events[i], i);
    }
    if (this.ctx.reducedMotion) {
      this.viderImmediatement();
      return Promise.resolve();
    }
    if (!this.occupee) return Promise.resolve();
    return new Promise<void>((resoudre) => {
      this.attentes.push(resoudre);
    });
  }

  /** Coupe court : les tâches restantes sont exécutées d'un bloc. */
  purger(): void {
    this.viderImmediatement();
  }

  private viderImmediatement(): void {
    if (this.courante) {
      this.courante.pas?.(1, 0);
      this.courante.fin?.();
      this.signaler(this.courante.index);
      this.courante = null;
    }
    for (const t of this.taches) {
      t.debut?.();
      t.pas?.(1, 0);
      t.fin?.();
      this.signaler(t.index);
    }
    this.taches = [];
    this.ecoule = 0;
    this.terminer();
  }

  private signaler(index: number): void {
    if (index === this.dernierIndex || index < 0) return;
    this.dernierIndex = index;
    this.ctx.onEtape?.(index);
  }

  private terminer(): void {
    const a = this.attentes;
    this.attentes = [];
    for (const r of a) r();
    this.ctx.onRepos?.();
  }

  update(dtMs: number): void {
    const s = Math.min(0.1, dtMs / 1000);
    let budget = 4; // au plus quatre tâches instantanées par image
    while (budget > 0) {
      if (!this.courante) {
        const t = this.taches.shift();
        if (!t) {
          if (this.attentes.length > 0) this.terminer();
          return;
        }
        this.courante = t;
        this.ecoule = 0;
        t.debut?.();
        if (t.duree <= 0) {
          t.pas?.(1, 0);
          t.fin?.();
          this.signaler(t.index);
          this.courante = null;
          budget -= 1;
          continue;
        }
      }
      const c = this.courante;
      this.ecoule += s;
      const k = Math.min(1, this.ecoule / c.duree);
      c.pas?.(k, s);
      if (k >= 1) {
        c.fin?.();
        this.signaler(c.index);
        this.courante = null;
        budget -= 1;
        if (this.taches.length === 0) {
          if (this.attentes.length > 0) this.terminer();
          return;
        }
        continue;
      }
      return;
    }
  }

  /* ═══════════════════════ Traduction des événements ═════════════════════ */

  private traduire(ev: GameEvent, index: number): void {
    if (ev.type === 'CombatEnded') {
      this.victoire(ev.winner, index);
      return;
    }
    if (ev.type !== 'CombatAction') return;
    const e = ev.entry;
    this.taches.push({
      duree: 0,
      index,
      debut: () => this.ctx.onJournal?.(e),
    });
    switch (e.kind) {
      case 'attaque':
        this.attaque(e, index);
        break;
      case 'mort':
        this.mort(e, index);
        break;
      case 'capacite':
        this.capacite(e, index);
        break;
      case 'sort':
        this.sort(e, index);
        break;
      case 'moral':
        this.mention(e, index, e.text.startsWith('Élan') ? 'Élan' : 'Flottement', LIGHT.rim);
        break;
      case 'fortune':
        this.mention(e, index, e.text.startsWith('Fortune !') ? 'Fortune' : 'Fortune contraire', PALETTE.ocre);
        break;
      default:
        this.info(e, index);
        break;
    }
  }

  /* ─────────────────────────────── Marche ──────────────────────────────── */

  private info(e: CombatLogEntry, index: number): void {
    const d = e.detail ?? {};
    const uid = typeof d.unite === 'string' ? d.unite : null;
    if (!uid) return;
    if (typeof d.colonne === 'number' && typeof d.ligne === 'number') {
      this.marche(uid, { col: d.colonne, row: d.ligne }, index);
      return;
    }
    if (e.text.includes('se met en défense')) {
      this.geste(uid, 'defense', 0.5, index, 'Défense', melanger(PALETTE.bleuBrume, LIGHT.chaude, 0.3));
      return;
    }
    if (e.text.includes('patiente')) {
      this.geste(uid, 'attente', 0.32, index, 'Attente', PALETTE.bleuBrume);
    }
  }

  /**
   * Déplacement le long du chemin hexagonal, une case après l'autre. La durée
   * n'est connue qu'au départ : elle est fixée dans `debut`, que la file
   * appelle **avant** de lire `duree`.
   *
   * Le chemin est celui du **moteur**, pas une ligne droite. Voir
   * `cheminDeMarche` : la pile suivait auparavant l'interpolation linéaire de
   * `hexLine`, et traversait donc obstacles et piles alliées sous les yeux du
   * joueur, alors que la prévisualisation lui avait montré le contour.
   */
  private marche(uid: string, vers: HexCoord, index: number): void {
    const ctx = this.ctx;
    let chemin: HexCoord[] = [];
    let pile: PileVue | null = null;
    const tache: Tache = {
      index,
      duree: 0.2,
      debut: () => {
        pile = ctx.piles.pile(uid);
        if (!pile) {
          tache.duree = 0;
          return;
        }
        chemin = cheminDeMarche(ctx.combat(), uid, pile.hex, vers);
        tache.duree = Math.max(0.12, Math.min(1.6, 0.17 * Math.max(1, chemin.length - 1)));
        pile.jouer('marche');
        pile.orienter(vers.col >= pile.hex.col ? 1 : -1);
      },
      pas: (t) => {
        if (!pile || chemin.length < 2) return;
        const etapes = chemin.length - 1;
        const p = Math.min(etapes - 0.0001, t * etapes);
        const i = Math.min(etapes - 1, Math.floor(p));
        const k = p - i;
        const a = ctx.geo.local(chemin[i]);
        const b = ctx.geo.local(chemin[i + 1]);
        /* petit rebond de foulée : la pile ne glisse jamais au sol */
        const saut = Math.abs(Math.sin(p * Math.PI)) * ctx.geo.taille * 0.07;
        pile.imposerPosition(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k - saut);
        pile.imposerProfondeur(chemin[i + 1].row);
      },
      fin: () => {
        if (!pile) return;
        const c = ctx.geo.local(vers);
        pile.imposerPosition(c.x, c.y);
        pile.hex = { col: vers.col, row: vers.row };
        pile.libre();
        pile.jouer('attente');
        ctx.vfx.poussiere(c.x, c.y * ctx.geo.etirement, 0.9);
      },
    };
    this.taches.push(tache);
  }

  /* ─────────────────────────── Attaque et tir ──────────────────────────── */

  private attaque(e: CombatLogEntry, index: number): void {
    const ctx = this.ctx;
    const d = e.detail ?? {};
    const uidA = typeof d.attaquant === 'string' ? d.attaquant : null;
    const uidC = typeof d.cible === 'string' ? d.cible : null;
    const degats = typeof d.degats === 'number' ? d.degats : 0;
    const pertes = typeof d.pertes === 'number' ? d.pertes : 0;
    const riposte = e.text.includes('riposte contre');
    const tir = e.text.includes('tire sur');
    if (!uidA) return;

    let a: PileVue | null = null;
    let c: PileVue | null = null;
    let depart = { x: 0, y: 0 };
    let cible = { x: 0, y: 0 };
    let distant = tir;

    this.taches.push({
      index,
      duree: tir ? 0.14 : 0.2,
      debut: () => {
        a = ctx.piles.pile(uidA);
        c = uidC ? ctx.piles.pile(uidC) : null;
        if (!a) return;
        depart = { x: a.pos.x, y: a.pos.y };
        cible = c ? { x: c.pos.x, y: c.pos.y } : depart;
        if (c) {
          distant = tir || hexDistance(a.hex, c.hex) > 1;
          a.orienter(cible.x >= depart.x ? 1 : -1);
          c.orienter(depart.x >= cible.x ? 1 : -1);
        }
        a.jouer(riposte ? 'riposte' : 'attaque');
      },
      pas: (t) => {
        if (!a || distant) return;
        /* fente : la pile avance d'un tiers de case puis revient */
        const k = t < 0.55 ? t / 0.55 : 1 - (t - 0.55) / 0.45;
        const e2 = 1 - Math.pow(1 - k, 2);
        a.imposerPosition(
          depart.x + (cible.x - depart.x) * 0.3 * e2,
          depart.y + (cible.y - depart.y) * 0.3 * e2,
        );
      },
      fin: () => {
        a?.libre();
      },
    });

    /* le trait, quand le coup part de loin */
    this.taches.push({
      index,
      duree: 0,
      debut: () => {
        if (!distant || !a || !c) return;
        const et = ctx.geo.etirement;
        ctx.vfx.projectile(
          { x: depart.x, y: depart.y * et - ctx.geo.taille * 0.9 },
          { x: cible.x, y: cible.y * et - ctx.geo.taille * 0.7 },
          0.3,
          PALETTE.brunFougere,
        );
      },
    });
    if (tir) this.taches.push({ index, duree: 0.28 });

    /* l'impact */
    this.taches.push({
      index,
      duree: 0.42,
      debut: () => {
        if (!c) return;
        const et = ctx.geo.etirement;
        const x = cible.x;
        const y = cible.y * et - ctx.geo.taille * 0.7;
        c.jouer('impact');
        c.frapper(Math.min(4, 1.6 + degats / 90));
        ctx.vfx.impact(x, y, Math.min(1.7, 0.7 + degats / 140), tir ? PALETTE.brunFougere : PALETTE.ocre);
        if (pertes > 0) ctx.vfx.sang(x, cible.y * et + ctx.geo.taille * 0.1, Math.min(2, pertes / 4));
        ctx.vfx.nombrePertes(x, y - ctx.geo.taille * 0.5, degats, pertes);
        /* secousse d'écran bornée : elle ponctue, elle ne secoue pas le joueur */
        ctx.vfx.secousse.declencher(Math.min(6.5, 1.4 + degats / 70));
        if (riposte) ctx.vfx.mention(depart.x, depart.y * et - ctx.geo.taille * 1.7, 'Riposte', PALETTE.grenat);
      },
    });
  }

  /* ─────────────────────────────── Mort ────────────────────────────────── */

  private mort(e: CombatLogEntry, index: number): void {
    const ctx = this.ctx;
    const uid = typeof e.detail?.cible === 'string' ? e.detail.cible : null;
    if (!uid) return;
    this.taches.push({
      index,
      duree: 0.95,
      debut: () => {
        const p = ctx.piles.pile(uid);
        if (!p) return;
        p.jouer('mort');
        const et = ctx.geo.etirement;
        ctx.vfx.effet('poussiere', p.pos.x, p.pos.y * et, 0.9, 1.3);
        ctx.vfx.mention(p.pos.x, p.pos.y * et - ctx.geo.taille * 1.6, 'Anéantie', PALETTE.grenat);
      },
    });
  }

  /* ───────────────────────── Capacités et sorts ────────────────────────── */

  private capacite(e: CombatLogEntry, index: number): void {
    const uid = typeof e.detail?.unite === 'string' ? e.detail.unite : null;
    if (!uid) return;
    const ctx = this.ctx;
    this.taches.push({
      index,
      duree: 0.62,
      debut: () => {
        const p = ctx.piles.pile(uid);
        if (!p) return;
        p.jouer('capacite');
        const et = ctx.geo.etirement;
        ctx.vfx.effet('eclat_or', p.pos.x, p.pos.y * et - ctx.geo.taille * 0.8, 0.7, 1.2);
      },
    });
  }

  private sort(e: CombatLogEntry, index: number): void {
    const ctx = this.ctx;
    const d = e.detail ?? {};
    const uid = typeof d.cible === 'string' ? d.cible : typeof d.unite === 'string' ? d.unite : null;
    const degats = typeof d.degats === 'number' ? d.degats : 0;
    const pertes = typeof d.pertes === 'number' ? d.pertes : 0;
    const ecole = ecoleDuSort(d, e.text);
    this.taches.push({
      index,
      duree: 0.78,
      debut: () => {
        const p = uid ? ctx.piles.pile(uid) : null;
        const et = ctx.geo.etirement;
        const x = p ? p.pos.x : ctx.geo.boite.largeur / 2;
        const y = p ? p.pos.y * et - ctx.geo.taille * 0.6 : ctx.geo.boite.hauteur / 2;
        ctx.vfx.aura(ecole, x, y, 0.8);
        if (degats > 0) {
          p?.jouer('impact');
          ctx.vfx.nombrePertes(x, y - ctx.geo.taille * 0.4, degats, pertes);
          ctx.vfx.secousse.declencher(Math.min(4, 1 + degats / 90));
        }
      },
    });
  }

  private mention(e: CombatLogEntry, index: number, texte: string, couleur: number): void {
    const uid = typeof e.detail?.unite === 'string' ? e.detail.unite : null;
    if (!uid) return;
    const ctx = this.ctx;
    this.taches.push({
      index,
      duree: 0.3,
      debut: () => {
        const p = ctx.piles.pile(uid);
        if (!p) return;
        ctx.vfx.mention(p.pos.x, p.pos.y * ctx.geo.etirement - ctx.geo.taille * 1.6, texte, couleur);
      },
    });
  }

  private geste(
    uid: string,
    anim: 'attente' | 'defense' | 'capacite',
    duree: number,
    index: number,
    texte: string,
    couleur: number,
  ): void {
    const ctx = this.ctx;
    this.taches.push({
      index,
      duree,
      debut: () => {
        const p = ctx.piles.pile(uid);
        if (!p) return;
        p.jouer(anim);
        ctx.vfx.mention(p.pos.x, p.pos.y * ctx.geo.etirement - ctx.geo.taille * 1.6, texte, couleur);
      },
    });
  }

  /* ────────────────────────────── Victoire ─────────────────────────────── */

  private victoire(camp: 0 | 1, index: number): void {
    const ctx = this.ctx;
    this.taches.push({
      index,
      duree: 1.35,
      debut: () => {
        const et = ctx.geo.etirement;
        for (const p of ctx.piles.toutes) {
          if (p.estMorte) continue;
          if (p.side === camp) {
            p.jouer('capacite');
            ctx.vfx.effet('eclat_or', p.pos.x, p.pos.y * et - ctx.geo.taille * 0.9, 1.1, 1.4);
          } else {
            p.jouer('defense');
          }
        }
        ctx.vfx.mention(
          ctx.geo.boite.largeur / 2,
          ctx.geo.boite.hauteur * 0.3 * et,
          camp === 0 ? 'Le champ est aux assaillants' : 'Le champ tient',
          LIGHT.rim,
        );
      },
    });
  }
}

/* ═══════════════════════════════ Aides ═══════════════════════════════════ */

/**
 * Le chemin que la pile va **jouer**, celui que le moteur a réellement suivi.
 *
 * L'animation interpolait par `hexLine` — la ligne droite — pendant que la
 * prévisualisation au survol montrait le vrai chemin de `hexPath`, qui contourne
 * obstacles et piles. Dès que les deux divergeaient, la créature traversait un
 * rocher ou une pile alliée sous les yeux du joueur, exactement là où on venait
 * de lui montrer le contour.
 *
 * Deux précautions rendent l'appel au moteur honnête :
 *
 *  - au moment où l'animation démarre, l'état du combat a déjà appliqué le
 *    déplacement : la pile y est **à l'arrivée**, avec son propre corps posé sur
 *    `vers`. On repart donc d'un clone replacé au départ — l'occupation s'exclut
 *    par uid (`unitAt`), le clone ne bute pas sur son propre corps ;
 *  - si le moteur ne rend rien (état déjà avancé par d'autres événements, case
 *    devenue imprenable), on retombe sur la ligne droite : une trajectoire
 *    approchée vaut mieux qu'une pile figée.
 *
 * Les volants passent par le même appel : `hexPath` leur rend déjà la ligne
 * droite, qui est leur vrai déplacement.
 */
export function cheminDeMarche(
  combat: CombatState,
  uid: string,
  de: HexCoord,
  vers: HexCoord,
): HexCoord[] {
  const unite = combat.units.find((u) => u.uid === uid);
  if (unite) {
    const chemin = hexPath(combat, { ...unite, at: de }, vers);
    const bout = chemin?.[chemin.length - 1];
    if (chemin && chemin.length >= 2 && bout && bout.col === vers.col && bout.row === vers.row) {
      return chemin;
    }
  }
  return hexLine(de, vers);
}

export type EcoleSort = 'braises' | 'sources' | 'brumes' | 'racines';

const ECOLES: readonly EcoleSort[] = ['braises', 'sources', 'brumes', 'racines'];

/**
 * École d'un sort : celle que le moteur inscrit au journal (`detail.ecole`),
 * qui est la donnée du contenu.
 *
 * Le repli par mots-clefs n'est là que pour les vieilles parties enregistrées
 * avant que le moteur ne porte l'école — et il se trompait sur dix-huit sorts
 * sur trente-deux : « Foudre des Bois Noirs » n'a ni braise ni source dans son
 * nom et tombait donc en brumes, « Regain » en racines. Sur une partie
 * d'aujourd'hui, il n'est jamais consulté.
 */
export function ecoleDuSort(
  detail: Record<string, unknown> | undefined,
  texte: string,
): EcoleSort {
  const brut = detail?.['ecole'];
  if (typeof brut === 'string' && (ECOLES as readonly string[]).includes(brut)) {
    return brut as EcoleSort;
  }
  const t = texte.toLowerCase();
  if (t.includes('braise') || t.includes('feu') || t.includes('flamme')) return 'braises';
  if (t.includes('source') || t.includes('eau') || t.includes('soin')) return 'sources';
  if (t.includes('racine') || t.includes('ronce') || t.includes('liane')) return 'racines';
  return 'brumes';
}
