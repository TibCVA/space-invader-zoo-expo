/**
 * Chargement des trois familles typographiques (bible artistique §3).
 *
 * Elles sont installées par npm (`@fontsource/*`) et importées ici : aucune
 * requête vers un CDN, aucune police distante. `attendrePolices()` garantit que
 * les fontes sont réellement disponibles avant qu'un texte ne soit composé dans
 * une `RenderTexture` — sinon la planche de contact se rendrait en police
 * système et la revue visuelle échouerait.
 */
import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/600.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/eb-garamond/400.css';
import '@fontsource/eb-garamond/500.css';
import '@fontsource/eb-garamond/400-italic.css';
import '@fontsource/alegreya-sans/500.css';
import '@fontsource/alegreya-sans/700.css';
import '@fontsource/alegreya/500.css';
import '@fontsource/alegreya/700.css';

/** Familles telles qu'elles doivent être nommées dans les styles de texte. */
export const POLICES = {
  titre: 'Cinzel',
  recit: 'EB Garamond',
  donnees: 'Alegreya Sans',
  donneesSerif: 'Alegreya',
} as const;

const A_CHARGER: readonly string[] = [
  '400 24px Cinzel',
  '600 24px Cinzel',
  '700 24px Cinzel',
  '400 18px "EB Garamond"',
  '500 18px "Alegreya Sans"',
  '700 18px "Alegreya Sans"',
];

let promesse: Promise<void> | null = null;

/**
 * Attend que les fontes soient prêtes. Idempotent, et sans échec bloquant :
 * si l'environnement ne fournit pas `document.fonts`, on rend quand même.
 */
export function attendrePolices(): Promise<void> {
  if (promesse) return promesse;
  promesse = (async () => {
    const docFonts = typeof document !== 'undefined' ? document.fonts : undefined;
    if (!docFonts) return;
    try {
      await Promise.all(A_CHARGER.map((spec) => docFonts.load(spec)));
      await docFonts.ready;
    } catch {
      // Une fonte manquante ne doit jamais empêcher le jeu de s'afficher.
    }
  })();
  return promesse;
}
