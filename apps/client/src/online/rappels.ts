/**
 * Les rappels « c'est ton tour » — `docs/04-MULTIJOUEUR.md` §6.
 *
 * Aucun courriel, aucun SMS, aucune infrastructure. Trois rappels, tous
 * locaux :
 *
 *  1. **Le titre de l'onglet** devient `TITRE_MON_TOUR`. Il n'est écrit qu'à
 *     un seul endroit — `App.tsx` s'abonne au petit magasin de ce fichier —
 *     pour qu'aucun écran ne se batte avec un autre pour le `document.title`.
 *  2. **Une notification du navigateur**, et seulement si le joueur l'a
 *     autorisée. **On ne demande jamais l'autorisation de nous-mêmes** :
 *     `demanderNotifications()` n'est appelée que par le bouton « Me
 *     prévenir », au clic, comme les navigateurs l'exigent désormais.
 *  3. **Le bandeau d'accueil**, rendu par `bandeauMonTour()` du protocole à
 *     partir du compte tenu ici.
 */

import { TITRE_MON_TOUR, bandeauMonTour } from '@auvergne/protocol';

/* ═══════════════════════════ Le petit magasin ═════════════════════════════ */

/** Les parties dont c'est mon tour, par code. */
const enAttente = new Map<string, boolean>();
const abonnes = new Set<() => void>();
/** Codes déjà annoncés par une notification : on ne sonne qu'une fois. */
const dejaSonne = new Set<string>();

let compte = 0;

function recompter(): void {
  let n = 0;
  for (const actif of enAttente.values()) if (actif) n += 1;
  if (n === compte) return;
  compte = n;
  for (const a of [...abonnes]) a();
}

/** Combien de parties attendent mon coup. Référence stable : un nombre. */
export function partiesEnAttente(): number {
  return compte;
}

/** Abonnement au compte, compatible `useSyncExternalStore`. */
export function abonnerRappels(ecouteur: () => void): () => void {
  abonnes.add(ecouteur);
  return () => {
    abonnes.delete(ecouteur);
  };
}

/** Le bandeau d'accueil, ou `null`. Le texte vient du protocole. */
export function bandeauCourant(): string | null {
  return bandeauMonTour(compte);
}

/**
 * Déclare l'état d'une partie. Au passage de `false` à `true`, la
 * notification part — si et seulement si elle a été autorisée.
 */
export function marquerMonTour(code: string, monTour: boolean, nomPartie?: string): void {
  const avant = enAttente.get(code) === true;
  enAttente.set(code, monTour);
  if (monTour && !avant && !dejaSonne.has(code)) {
    dejaSonne.add(code);
    notifierMonTour(nomPartie ?? code);
  }
  if (!monTour) dejaSonne.delete(code);
  recompter();
}

/** Retire une partie du suivi (écran quitté, partie abandonnée). */
export function oublierPartie(code: string): void {
  if (!enAttente.has(code)) return;
  enAttente.delete(code);
  dejaSonne.delete(code);
  recompter();
}

/** Remet le suivi à zéro. Réservé aux tests. */
export function reinitialiserRappels(): void {
  enAttente.clear();
  dejaSonne.clear();
  compte = 0;
  for (const a of [...abonnes]) a();
}

/* ═══════════════════════════ Titre de l'onglet ════════════════════════════ */

/**
 * Le titre à poser sur le document : `TITRE_MON_TOUR` dès qu'une partie
 * attend, le titre de la route sinon. Fonction pure, testable.
 */
export function titreDocument(titreDeRoute: string, attentes = compte): string {
  return attentes > 0 ? TITRE_MON_TOUR : titreDeRoute;
}

/* ════════════════════════ Notifications locales ═══════════════════════════ */

export type EtatAutorisation = 'indisponible' | 'default' | 'granted' | 'denied';

function apiNotification(): typeof Notification | null {
  const globale = globalThis as { Notification?: typeof Notification };
  return typeof globale.Notification === 'function' ? globale.Notification : null;
}

/** Où en est l'autorisation, sans jamais la demander. */
export function autorisationNotifications(): EtatAutorisation {
  const api = apiNotification();
  if (!api) return 'indisponible';
  const etat = api.permission;
  return etat === 'granted' || etat === 'denied' ? etat : 'default';
}

/**
 * Demande l'autorisation. **À n'appeler que depuis un clic explicite** sur le
 * bouton « Me prévenir » : une demande spontanée est une mauvaise manière, et
 * les navigateurs la refusent de plus en plus souvent.
 */
export async function demanderNotifications(): Promise<EtatAutorisation> {
  const api = apiNotification();
  if (!api) return 'indisponible';
  try {
    const reponse = await api.requestPermission();
    return reponse === 'granted' || reponse === 'denied' ? reponse : 'default';
  } catch {
    return autorisationNotifications();
  }
}

/**
 * Sonne, si le joueur l'a autorisé. Silencieuse dans tous les autres cas :
 * ce n'est pas à une notification de faire échouer un écran.
 */
export function notifierMonTour(nomPartie: string): boolean {
  const api = apiNotification();
  if (!api || api.permission !== 'granted') return false;
  try {
    new api(TITRE_MON_TOUR, {
      body: `Partie ${nomPartie} — la main est à vous.`,
      tag: `auvergne-${nomPartie}`,
      lang: 'fr',
    });
    return true;
  } catch {
    /* Certains navigateurs mobiles exigent un service worker : tant pis, le
       titre de l'onglet et le bandeau d'accueil font le travail. */
    return false;
  }
}
