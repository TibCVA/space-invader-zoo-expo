/**
 * Baril de l'état du client.
 *
 * Un seul magasin, une seule porte de mutation (`dispatch`), une seule
 * politique de sauvegarde. Tout le reste du client passe par ici.
 */

export type {
  AppState,
  DispatchResult,
  PanelKind,
  PathPreview,
  QueuedEvent,
  SaveIndicator,
  SaveStatus,
  Selection,
} from './types.js';

export {
  annulerChemin,
  chargerPartie,
  confirmerChemin,
  consommerEvenements,
  demarrerPartie,
  dispatch,
  effacerNotice,
  empilerEvenements,
  getState,
  ouvrirPanneau,
  previsualiserChemin,
  quitterPartie,
  reinitialiser,
  selectionner,
  subscribe,
  useApp,
  useAppState,
  viderSauvegarde,
  viewStore,
} from './store.js';
export type { ChargementPartie } from './store.js';

export {
  Autosave,
  DELAI_ENVOI_MS,
  SLOT_AUTO,
  chargerEmplacement,
  decrireEmplacement,
  effacerLocal,
  ecrireLocal,
  envoyerEmplacement,
  lireLocal,
  listerEmplacements,
  partieReprenable,
  reprendreLocal,
  resumeEmplacement,
  serialiser,
  supprimerEmplacement,
} from './persistence.js';
export type { EtatEcriture, Sauvegarde } from './persistence.js';

export {
  GRAINE_DEMO,
  HEROS_DEMO,
  combatDemo,
  emplacementsDemo,
  etatDemo,
  partieDemo,
  setupDemo,
} from './demo.js';
