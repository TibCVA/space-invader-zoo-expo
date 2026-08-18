/**
 * Baril des écrans du client.
 *
 * `App.tsx` n'importe que ce fichier : chaque route de `docs/03-ROUTES.md` y
 * trouve son écran. La feuille de style complémentaire est chargée ici, une
 * seule fois, pour qu'aucun écran n'ait à s'en soucier.
 */

import './screens.css';

export {
  Avis,
  Bandeau,
  BarrePouce,
  EcranChargement,
  EcranPanne,
  IndicateurSauvegarde,
  LimiteErreur,
  Page,
  commandeDe,
} from './shell.js';
export type { BandeauProps, CommandePouce, EcranChargementProps, EcranPanneProps, PageProps } from './shell.js';

export { EcranMenus } from './menus.js';
export type { EcranMenu, EcranMenusProps } from './menus.js';

export { FicheHeros } from './heros.js';
export type { FicheHerosProps } from './heros.js';

export { VueRoyaume } from './royaume.js';
export type { VueRoyaumeProps } from './royaume.js';

export { EMPLACEMENTS_AUTO, EMPLACEMENTS_MANUELS, EcranSauvegardes } from './sauvegardes.js';
export type { ActionsEmplacement, EcranSauvegardesProps } from './sauvegardes.js';

export { EcranGalerie, EcranPlancheArt } from './planches.js';

export { EcranCarte, EcranCite, EcranCombat } from './vues.js';
export type { EcranCiteProps, EcranPartieProps } from './vues.js';

export { PanneauMobile } from './panneaux.js';
export type { PanneauProps } from './panneaux.js';

export { EcranIntrouvable } from './introuvable.js';

export { ScenePixi } from './scene.js';
export type { FabriqueScene, FabriqueSceneDeps, ScenePixiProps, SceneMontee } from './scene.js';

export * from './format.js';
