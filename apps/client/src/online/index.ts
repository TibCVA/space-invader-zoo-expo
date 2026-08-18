/**
 * `online/` — le multijoueur asynchrone, côté client.
 *
 * Cinq cousins, chacun sur son iPhone ou son PC, une partie qui dure des
 * semaines. Spécification : `docs/04-MULTIJOUEUR.md`. Contrat réseau :
 * `packages/protocol/src/parties.ts` — importé, jamais réécrit.
 *
 * Baril du module. `App.tsx` ne connaît que ce fichier ; tout le reste est
 * interne :
 *
 * | Fichier         | Rôle |
 * |-----------------|------|
 * | `api.ts`        | transport HTTP, trousseau de jetons, erreurs françaises |
 * | `session.ts`    | la boucle d'interrogation, une session par code |
 * | `commandes.ts`  | l'envoi rejouable, à clef d'idempotence stable |
 * | `rappels.ts`    | titre d'onglet, notification locale, bandeau d'accueil |
 * | `choix.tsx`     | les champs de composition d'une bannière |
 * | `salle.tsx`     | `#/en-ligne` — créer ou rejoindre, et mes parties |
 * | `salon.tsx`     | `#/en-ligne/:code` — salon puis salle d'attente |
 * | `partie.ts`     | entrée dans la partie : l'état distant devient l'état local |
 *
 * Aucune règle de jeu n'est écrite dans ce module : le serveur est
 * autoritaire, le client n'envoie que des intentions.
 *
 * La feuille de style est chargée ici, une seule fois, comme `screens/index.ts`
 * le fait pour les écrans de jeu.
 */

import './online.css';

/* ── Écrans ─────────────────────────────────────────────────────────────── */

export { BandeauMesParties, BoutonPrevenir, CreationEnLigne, EcranEnLigne } from './salle.js';
export type { BandeauMesPartiesProps, CreationEnLigneProps } from './salle.js';
export { EcranSalon } from './salon.js';
export type { EcranSalonProps } from './salon.js';

/* ── Rappels « c'est ton tour » ─────────────────────────────────────────── */

export {
  abonnerRappels,
  autorisationNotifications,
  bandeauCourant,
  demanderNotifications,
  marquerMonTour,
  notifierMonTour,
  oublierPartie,
  partiesEnAttente,
  reinitialiserRappels,
  titreDocument,
} from './rappels.js';
export type { EtatAutorisation } from './rappels.js';

/* ── Réseau ─────────────────────────────────────────────────────────────── */

export {
  CLEF_JETONS,
  ErreurConflit,
  ErreurPartie,
  ErreurReseau,
  abandonner,
  aDesParties,
  codeValide,
  codesConnus,
  copierDansPressePapier,
  creerPartie,
  dernierePartie,
  estEnRetard,
  estTemporaire,
  installerTransport,
  jetonDe,
  lancer,
  lienDePartage,
  lireEtat,
  lireJetons,
  lireSalon,
  memoriserJeton,
  mesParties,
  mesPartiesSilencieuses,
  modifier,
  normaliserCode,
  nouvelleCle,
  oublierJeton,
  pouls,
  reglerIa,
  rejoindre,
  retenirJeton,
} from './api.js';
export type { Transport } from './api.js';

/* ── Commandes ──────────────────────────────────────────────────────────── */

export {
  ATTENTE_BASE_MS,
  ATTENTE_MAX_MS,
  TENTATIVES_MAX,
  attenteRetrait,
  envoyerCommandeFiable,
  messageConflit,
  nouvelleCleIdempotence,
} from './commandes.js';
export type {
  EnvoiApplique,
  EnvoiConflit,
  EnvoiEchec,
  OptionsEnvoi,
  ResultatEnvoi,
} from './commandes.js';

/* ── Session ────────────────────────────────────────────────────────────── */

export {
  SessionPartie,
  obtenirSession,
  reinitialiserSessions,
  relacherSession,
  retenirSession,
  rythmePoll,
  useSession,
  useSessionDe,
} from './session.js';
export type { ConditionsPoll, EtatSession, OptionsSession } from './session.js';

/* ── Choix d'une bannière ───────────────────────────────────────────────── */

export {
  CompteurBannieres,
  DUREES,
  FormulaireBanniere,
  PROFILS_IA,
  Segments,
  VICTOIRES,
  libelleDepart,
  libelleFaction,
  libelleProfil,
  premierDepartLibre,
  premierHerosLibre,
} from './choix.js';
export type { ChoixBanniere, DureePartie, ProfilIa, VictoirePartie } from './choix.js';

/* ── Entrée en jeu ──────────────────────────────────────────────────────── */

export { ErreurEntree, installerPartieEnLigne, lireSetup } from './partie.js';
