/**
 * La boucle d'interrogation d'une partie en ligne.
 *
 * Un jeu au tour par tour qui dure trois semaines n'a aucun besoin de
 * WebSocket : il a besoin de ne pas réveiller le téléphone pour rien. D'où le
 * rythme de `docs/04-MULTIJOUEUR.md` §2, lu dans `POLL_INTERVALS` — jamais
 * réécrit ici :
 *
 * | Situation                                   | Rythme               |
 * |---------------------------------------------|----------------------|
 * | Onglet actif, ce n'est pas mon tour          | `actif` (5 s)        |
 * | Onglet actif, c'est mon tour                 | aucune interrogation |
 * | Onglet en arrière-plan                       | `arrierePlan` (60 s) |
 * | Dix minutes sans le moindre geste            | `assoupi` (5 min)    |
 *
 * Et une règle d'économie : on interroge `/pouls`, qui pèse quelques dizaines
 * d'octets, et on ne retélécharge `/etat` **que** si `seq` a changé.
 *
 * Le module expose un magasin plat compatible `useSyncExternalStore` : même
 * discipline que `state/store.ts`, aucune bibliothèque.
 */

import { useEffect, useMemo, useSyncExternalStore } from 'react';
import { POLL_INTERVALS, libelleAttente } from '@auvergne/protocol';
import type { PartySalonPayload, PartyStatePayload } from '@auvergne/protocol';
import { ErreurPartie, ErreurReseau, lireEtat, lireSalon, normaliserCode, pouls } from './api.js';
import { marquerMonTour, oublierPartie } from './rappels.js';

/* ═══════════════════════════ Le calcul du rythme ══════════════════════════ */

/** Ce que la boucle sait du joueur à l'instant où elle choisit son rythme. */
export interface ConditionsPoll {
  /** `document.visibilityState === 'visible'` */
  visible: boolean;
  /** c'est mon tour : rien ne peut changer sans moi */
  monTour: boolean;
  /** millisecondes écoulées depuis le dernier geste */
  inactiviteMs: number;
}

/**
 * Le rythme d'interrogation, en millisecondes, ou `null` pour « ne rien
 * demander ». Fonction pure : c'est elle que les tests couvrent.
 *
 * L'assoupissement l'emporte sur l'arrière-plan — un onglet caché depuis dix
 * minutes est aussi un joueur qui n'a rien touché depuis dix minutes, et c'est
 * le rythme le plus économe qui doit gagner.
 */
export function rythmePoll(conditions: ConditionsPoll): number | null {
  if (conditions.monTour) return null;
  if (conditions.inactiviteMs >= POLL_INTERVALS.inactiviteMs) return POLL_INTERVALS.assoupi;
  if (!conditions.visible) return POLL_INTERVALS.arrierePlan;
  return POLL_INTERVALS.actif;
}

/* ═════════════════════════════ L'instantané ═══════════════════════════════ */

export interface EtatSession {
  code: string;
  /** première charge en cours : l'écran montre un parchemin d'attente */
  chargement: boolean;
  salon: PartySalonPayload | null;
  etat: PartyStatePayload | null;
  seq: number;
  statut: 'salon' | 'en_cours' | 'terminee' | 'inconnu';
  activePlayer: string | null;
  monSlot: string | null;
  monTour: boolean;
  /** « En attente de Jean », déjà accordé par le protocole */
  attente: string | null;
  /** message français d'un refus du serveur, ou `null` */
  erreur: string | null;
  /** le serveur n'a pas répondu au dernier pouls */
  horsLigne: boolean;
  majLe: string | null;
  /** incrémentée à chaque mutation : identité de l'instantané */
  revision: number;
}

function etatVide(code: string): EtatSession {
  return {
    code,
    chargement: true,
    salon: null,
    etat: null,
    seq: -1,
    statut: 'inconnu',
    activePlayer: null,
    monSlot: null,
    monTour: false,
    attente: null,
    erreur: null,
    horsLigne: false,
    majLe: null,
    revision: 0,
  };
}

/**
 * Le nom de la bannière qu'on attend. On cherche dans plusieurs listes : la
 * charge d'état et le salon décrivent les mêmes bannières, mais l'une peut
 * être plus complète que l'autre selon la route qui a répondu. On préfère
 * toujours un nom à « une autre bannière ».
 */
function nomDe(
  slot: string | null,
  ...listes: readonly (readonly { slot: string; nom: string | null }[] | undefined)[]
): string | null {
  if (!slot) return null;
  for (const joueurs of listes) {
    const trouve = joueurs?.find((j) => j.slot === slot)?.nom;
    if (typeof trouve === 'string' && trouve.length > 0) return trouve;
  }
  return null;
}

/* ══════════════════════════════ La session ════════════════════════════════ */

export interface OptionsSession {
  /** horloge injectable ; les tests passent une horloge de papier */
  maintenant?: () => number;
  /** visibilité injectable ; par défaut `document.visibilityState` */
  visible?: () => boolean;
}

/**
 * Une session par code de partie. Elle tient l'état, la boucle et les
 * rappels ; elle ne dessine rien et ne connaît aucun composant.
 */
export class SessionPartie {
  readonly code: string;

  private instantane: EtatSession;
  private readonly abonnes = new Set<() => void>();
  private minuteur: ReturnType<typeof setTimeout> | null = null;
  private enVol = false;
  private vivante = false;
  private dernierGeste: number;
  private readonly maintenant: () => number;
  private readonly estVisible: () => boolean;
  private readonly surGeste = (): void => this.signalerGeste();
  private readonly surVisibilite = (): void => {
    if (this.estVisible()) this.signalerGeste();
    else this.reprogrammer();
  };

  constructor(code: string, options: OptionsSession = {}) {
    this.code = normaliserCode(code);
    this.instantane = etatVide(this.code);
    this.maintenant = options.maintenant ?? ((): number => Date.now());
    this.estVisible =
      options.visible ??
      ((): boolean => (typeof document === 'undefined' ? true : document.visibilityState === 'visible'));
    this.dernierGeste = this.maintenant();
  }

  /* ── Magasin ──────────────────────────────────────────────────────────── */

  getSnapshot = (): EtatSession => this.instantane;

  subscribe = (ecouteur: () => void): (() => void) => {
    this.abonnes.add(ecouteur);
    return () => {
      this.abonnes.delete(ecouteur);
    };
  };

  private poser(patch: Partial<EtatSession>): void {
    this.instantane = { ...this.instantane, ...patch, revision: this.instantane.revision + 1 };
    for (const a of [...this.abonnes]) a();
  }

  /* ── Cycle de vie ─────────────────────────────────────────────────────── */

  /** Démarre la boucle et branche les écoutes de geste. Idempotent. */
  demarrer(): void {
    if (this.vivante) return;
    this.vivante = true;
    this.dernierGeste = this.maintenant();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.surVisibilite);
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('pointerdown', this.surGeste, { passive: true });
      window.addEventListener('keydown', this.surGeste, { passive: true });
      window.addEventListener('focus', this.surGeste);
    }
    void this.rafraichir(true);
  }

  /** Arrête la boucle, débranche tout, oublie le rappel de cette partie. */
  arreter(): void {
    if (!this.vivante) return;
    this.vivante = false;
    if (this.minuteur !== null) {
      clearTimeout(this.minuteur);
      this.minuteur = null;
    }
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.surVisibilite);
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointerdown', this.surGeste);
      window.removeEventListener('keydown', this.surGeste);
      window.removeEventListener('focus', this.surGeste);
    }
    oublierPartie(this.code);
  }

  /** Un geste du joueur : on repart au rythme vif. */
  signalerGeste(): void {
    this.dernierGeste = this.maintenant();
    this.reprogrammer();
  }

  /** Le rythme courant, tel que la boucle le voit. `null` : on ne demande rien. */
  rythmeCourant(): number | null {
    return rythmePoll({
      visible: this.estVisible(),
      monTour: this.instantane.monTour,
      inactiviteMs: this.maintenant() - this.dernierGeste,
    });
  }

  private reprogrammer(): void {
    if (this.minuteur !== null) {
      clearTimeout(this.minuteur);
      this.minuteur = null;
    }
    if (!this.vivante) return;
    const rythme = this.rythmeCourant();
    if (rythme === null) return;
    this.minuteur = setTimeout(() => {
      this.minuteur = null;
      void this.rafraichir(false);
    }, rythme);
  }

  /* ── L'interrogation ──────────────────────────────────────────────────── */

  /**
   * Un tour de boucle. `complet` force la relecture du salon et de l'état :
   * c'est le premier appel, ou un rafraîchissement demandé par un écran après
   * une action (rejoindre, lancer, conflit `409`).
   */
  async rafraichir(complet = false): Promise<void> {
    if (this.enVol) return;
    this.enVol = true;
    try {
      if (complet) {
        await this.chargerSalon();
        await this.chargerEtat(true);
      } else {
        await this.battre();
      }
      if (this.instantane.horsLigne) this.poser({ horsLigne: false });
    } catch (cause) {
      this.signalerErreur(cause);
    } finally {
      this.enVol = false;
      this.reprogrammer();
    }
  }

  /** `/pouls` : quelques dizaines d'octets, et `/etat` seulement si `seq` bouge. */
  private async battre(): Promise<void> {
    const battement = await pouls(this.code);
    if (battement.seq === this.instantane.seq) {
      if (this.instantane.majLe !== battement.updatedAt) this.poser({ majLe: battement.updatedAt });
      return;
    }
    await this.chargerSalon();
    await this.chargerEtat(false);
  }

  private async chargerSalon(): Promise<void> {
    const salon = await lireSalon(this.code);
    const attendu = nomDe(salon.activePlayer, salon.joueurs);
    this.poser({
      salon,
      chargement: false,
      statut: salon.statut,
      activePlayer: salon.activePlayer,
      monSlot: salon.monSlot,
      majLe: salon.majLe,
      attente:
        salon.statut === 'en_cours' && salon.monSlot !== salon.activePlayer
          ? libelleAttente(attendu)
          : null,
      erreur: null,
    });
  }

  private async chargerEtat(premier: boolean): Promise<void> {
    const statut = this.instantane.statut;
    if (statut === 'salon') {
      /* Rien à télécharger : la partie n'a pas encore d'état. */
      this.poser({ seq: this.instantane.salon?.seq ?? this.instantane.seq, monTour: false });
      marquerMonTour(this.code, false);
      return;
    }
    const depuis = premier ? undefined : Math.max(0, this.instantane.seq);
    const etat = await lireEtat(this.code, depuis);
    if (etat === null) return;
    const attendu = nomDe(etat.activePlayer, etat.joueurs, this.instantane.salon?.joueurs);
    this.poser({
      etat,
      chargement: false,
      seq: etat.seq,
      statut: etat.statut,
      activePlayer: etat.activePlayer,
      monSlot: etat.monSlot,
      monTour: etat.monTour,
      majLe: etat.updatedAt,
      attente: etat.statut === 'en_cours' && !etat.monTour ? libelleAttente(attendu) : null,
      erreur: null,
    });
    marquerMonTour(this.code, etat.monTour && etat.statut === 'en_cours', this.code);
  }

  private signalerErreur(cause: unknown): void {
    if (cause instanceof ErreurReseau) {
      this.poser({ horsLigne: true, chargement: false });
      return;
    }
    if (cause instanceof ErreurPartie) {
      this.poser({ erreur: cause.message, chargement: false, horsLigne: false });
      return;
    }
    this.poser({
      erreur: "La partie n'a pas pu être relue.",
      chargement: false,
    });
  }

  /**
   * Adopte un état reçu autrement que par la boucle : réponse d'une commande,
   * état joint à un `409`. Évite un aller-retour et remet la boucle d'aplomb.
   */
  adopterEtat(etat: PartyStatePayload): void {
    if (etat.seq < this.instantane.seq) return;
    const attendu = nomDe(etat.activePlayer, etat.joueurs, this.instantane.salon?.joueurs);
    this.poser({
      etat,
      chargement: false,
      seq: etat.seq,
      statut: etat.statut,
      activePlayer: etat.activePlayer,
      monSlot: etat.monSlot,
      monTour: etat.monTour,
      majLe: etat.updatedAt,
      attente: etat.statut === 'en_cours' && !etat.monTour ? libelleAttente(attendu) : null,
      erreur: null,
      horsLigne: false,
    });
    marquerMonTour(this.code, etat.monTour && etat.statut === 'en_cours', this.code);
  }

  /** Adopte un salon fraîchement obtenu (rejoindre, modifier, lancer). */
  adopterSalon(salon: PartySalonPayload): void {
    const attendu = nomDe(salon.activePlayer, salon.joueurs);
    this.poser({
      salon,
      chargement: false,
      statut: salon.statut,
      activePlayer: salon.activePlayer,
      monSlot: salon.monSlot,
      majLe: salon.majLe,
      attente:
        salon.statut === 'en_cours' && salon.monSlot !== salon.activePlayer
          ? libelleAttente(attendu)
          : null,
      erreur: null,
      horsLigne: false,
    });
  }

  /** Pose un message français sur l'écran sans passer par une requête. */
  signaler(message: string | null): void {
    if (this.instantane.erreur === message) return;
    this.poser({ erreur: message });
  }
}

/* ═════════════════════════ Registre et crochet ════════════════════════════ */

const sessions = new Map<string, { session: SessionPartie; usages: number }>();

/** La session de ce code, créée au besoin. Une seule par code, partagée. */
export function obtenirSession(code: string): SessionPartie {
  const clef = normaliserCode(code);
  const connue = sessions.get(clef);
  if (connue) return connue.session;
  const session = new SessionPartie(clef);
  sessions.set(clef, { session, usages: 0 });
  return session;
}

/** Retient une session (montage d'un écran) et démarre sa boucle. */
export function retenirSession(code: string): SessionPartie {
  const clef = normaliserCode(code);
  const session = obtenirSession(clef);
  const entree = sessions.get(clef);
  if (entree) entree.usages += 1;
  session.demarrer();
  return session;
}

/**
 * Relâche une session : la boucle s'arrête dès que plus personne ne la
 * regarde, mais **l'objet reste au registre**. Deux raisons : le mode strict
 * de React monte, démonte et remonte chaque écran, et un joueur qui revient
 * sur une partie retrouve son dernier état affiché au lieu d'un parchemin
 * d'attente. Quelques sessions inertes ne coûtent rien ; une session recréée
 * sous les pieds d'un composant déjà monté coûterait un écran figé.
 */
export function relacherSession(code: string): void {
  const clef = normaliserCode(code);
  const entree = sessions.get(clef);
  if (!entree) return;
  entree.usages = Math.max(0, entree.usages - 1);
  if (entree.usages > 0) return;
  entree.session.arreter();
}

/** Vide le registre. Réservé aux tests et au démontage complet. */
export function reinitialiserSessions(): void {
  for (const { session } of sessions.values()) session.arreter();
  sessions.clear();
}

/**
 * Retenir une session pendant la vie d'un composant. `useMemo` donne la
 * référence — elle ne change qu'avec le code —, l'effet tient le compte.
 */
export function useSessionDe(code: string): SessionPartie {
  const session = useMemo(() => obtenirSession(code), [code]);
  useEffect(() => {
    retenirSession(code);
    return () => relacherSession(code);
  }, [code]);
  return session;
}

/**
 * L'état d'une session, en abonnement externe. Le composant appelant doit
 * avoir retenu la session (`retenirSession`) dans un effet.
 */
export function useSession(session: SessionPartie): EtatSession {
  return useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);
}
