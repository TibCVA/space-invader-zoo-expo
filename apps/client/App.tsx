/**
 * Emplacement historique — le composant racine vit dans `src/App.tsx`.
 *
 * `apps/client/index.html` charge `/src/main.tsx`, qui monte `src/App.tsx` :
 * tout le code du client est sous `src/`, comme l'exige `tsconfig.json`
 * (`rootDir: "src"`). Ce fichier n'existe que pour qu'un import égaré vers
 * `apps/client/App` ne parte pas dans le vide.
 */

export { App } from './src/App.js';
export type { AppProps } from './src/App.js';
