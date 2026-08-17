/**
 * Polices du jeu — trois familles, installées par npm (`@fontsource/*`),
 * jamais par CDN (non négociable n°5).
 *
 * `packages/ui` ne déclare pas encore ces paquets dans ses dépendances : le
 * spécificateur nu n'est donc pas résoluble depuis ce paquet (pnpm strict).
 * L'application cliente, qui les déclare, doit importer la liste ci-dessous.
 * Dès que `@fontsource/*` figure dans `packages/ui/package.json`, il suffit de
 * décommenter le bloc d'imports en tête de `styles.css`.
 */

/** Les spécificateurs exacts à importer, dans l'ordre. */
export const FONT_IMPORTS: readonly string[] = [
  '@fontsource/cinzel/400.css',
  '@fontsource/cinzel/600.css',
  '@fontsource/cinzel/700.css',
  '@fontsource/eb-garamond/400.css',
  '@fontsource/eb-garamond/500.css',
  '@fontsource/eb-garamond/400-italic.css',
  '@fontsource/eb-garamond/500-italic.css',
  '@fontsource/alegreya-sans/400.css',
  '@fontsource/alegreya-sans/500.css',
  '@fontsource/alegreya-sans/700.css',
];

/** Rôle de chaque famille (bible artistique §3). */
export const FONT_ROLES = {
  titre: {
    family: 'Cinzel',
    usage: 'Titres, héraldique, noms de lieux',
    tracking: '0.08em',
    minSizePx: 18,
  },
  recit: {
    family: 'EB Garamond',
    usage: 'Récit, descriptions, codex',
    tracking: '0',
    minSizePx: 16,
  },
  donnee: {
    family: 'Alegreya Sans',
    usage: 'Données, chiffres, boutons',
    tracking: '0.02em',
    minSizePx: 15,
  },
} as const;
