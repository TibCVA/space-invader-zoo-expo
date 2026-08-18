/**
 * Point d'entrée du client.
 *
 * Trois lignes utiles, dans cet ordre :
 *
 *  1. `amorcer()` — le moteur reçoit contenu et carte par injection, et le
 *     pont audio est branché. Sans cet appel, `@auvergne/engine` tournerait sur
 *     ses implémentations de repli, qui ne sont pas le contenu du jeu
 *     (docs/02-API.md). Rien d'accéléré n'est réclamé ici : les écrans de
 *     données s'affichent sans attendre WebGPU ni l'atlas.
 *  2. Le point de montage est vérifié : si `#root` manquait, la page dirait
 *     pourquoi en français plutôt que de rester blanche.
 *  3. `<App/>` prend la main, et c'est le **routeur** qui décide de l'écran —
 *     plus aucune page n'est montée en dur.
 *
 * `StrictMode` est volontairement absent : il monte deux fois chaque effet, ce
 * qui ferait construire, détruire puis reconstruire les vues impératives
 * PixiJS (carte, cité, combat) à chaque navigation. Le double montage est un
 * outil de mise au point, pas un mode de fonctionnement pour une application
 * qui possède des ressources GPU.
 */

/*
 * PREMIER IMPORT, ET IL DOIT LE RESTER.
 *
 * PixiJS 8 compile ses synchronisations d'uniformes et de shaders en
 * fabriquant des fonctions à l'exécution (`new Function`). Cela réclame
 * `unsafe-eval` dans la politique de sécurité de contenu — que le serveur
 * refuse volontairement (`script-src 'self'`, apps/server/src/server.ts).
 * Sans ce module, Chrome et Edge affichent « Ce navigateur n'a pu ouvrir ni
 * WebGPU ni WebGL » : la carte, les cités et les combats ne se dessinent pas.
 *
 * `pixi.js/unsafe-eval` installe des équivalents interprétés de ces
 * générateurs. Il doit être chargé AVANT toute création de moteur de rendu,
 * donc avant `./boot.js`.
 */
import 'pixi.js/unsafe-eval';

/*
 * SECOND IMPÉRATIF DE LA MÊME FAMILLE, ET POUR LA MÊME RAISON.
 *
 * PixiJS décode aussi les images dans un *worker* fabriqué depuis une URL
 * `blob:`. Notre CSP dit `script-src 'self'` sans mentionner `worker-src`, qui
 * retombe donc sur `default-src 'self'` et refuse `blob:`. Le worker n'est
 * jamais créé et la promesse de `Assets.load` n'est **ni tenue ni rejetée** :
 * le chargement se fige pour de bon. Mesuré six fois sur six sous le vrai
 * binaire du serveur, sur la carte comme sur les cités et le combat.
 *
 * On pose donc la préférence avant tout, et non à la première image chargée :
 * une fois le décodeur choisi, il est trop tard.
 */
import { poserPreferencesAssets } from './art/assets.js';

import { createRoot } from 'react-dom/client';
import { amorcer } from './boot.js';
import { App } from './App.js';

poserPreferencesAssets();
amorcer();

const hote = document.getElementById('root');

if (!hote) {
  document.body.innerHTML =
    '<main style="font-family:Georgia,serif;color:#E8DCC0;padding:48px;max-width:40rem;margin:0 auto">' +
    '<h1 style="font-size:1.5rem;letter-spacing:.08em;text-transform:uppercase">Le jeu n’a pas pu s’ouvrir</h1>' +
    '<p>Le point de montage de la page est introuvable. Rechargez la page&#8239;; si la panne persiste, ' +
    'videz le cache du navigateur.</p></main>';
} else {
  createRoot(hote).render(<App />);
}
