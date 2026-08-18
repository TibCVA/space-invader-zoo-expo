# Images générées

Dépose ici les bitmaps produits par un outil de génération d'images, en suivant
**`docs/05-ASSETS.md`** : chemins, clefs, tailles et style y sont imposés.

Le lot ImageGen du 18 août 2026 contient **43 images** : 21 portraits, six fonds
de cité, six terrains, huit matières et deux fonds d'accueil. `manifeste.json`
porte les dimensions, tailles, invites canoniques de régénération, identifiants
de génération et empreintes SHA-256.

Chaque entrée valide remplace la texture correspondante de l'atlas. Une entrée
absente ou invalide est ignorée et le rendu procédural reste affiché : ne jamais
supprimer ce repli. Les portraits et terrains sont déjà consommés par le client.
Les fonds de cité, fonds d'accueil et matières sont chargés dans la table de
textures mais doivent encore être demandés par leurs écrans ; voir
`docs/reference/CLAUDE-CODE-ASSET-HANDOFF.md`.

ImageGen intégré ne fournit pas de graine numérique. Le manifeste l'indique
explicitement au lieu d'inventer une reproductibilité bit-à-bit.
