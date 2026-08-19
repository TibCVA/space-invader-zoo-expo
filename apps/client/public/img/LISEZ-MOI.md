# Images générées

Dépose ici les bitmaps produits par un outil de génération d'images, en suivant
**`docs/05-ASSETS.md`** : chemins, clefs, tailles et style y sont imposés.

Les deux lots ImageGen des 18 et 19 août 2026 contiennent **167 images publiques** :
21 portraits, douze fonds de cité (six paysage et six portrait), six terrains,
huit matières, deux fonds d'accueil, quarante bâtiments, quinze objets actifs,
sept ressources et cinquante-six variantes de décor. `manifeste.json` porte les
dimensions, tailles, invites canoniques de régénération, identifiants de
génération et empreintes SHA-256.

La vague 2 fournit en plus **28 planches de référence de créatures** hors bundle
client dans `docs/reference/creatures/`. Elles servent à resculpter les rigs
procéduraux ; elles ne doivent jamais remplacer les créatures animées par de
simples images.

Chaque entrée valide remplace la texture correspondante de l'atlas. Une entrée
absente ou invalide est ignorée et le rendu procédural reste affiché : ne jamais
supprimer ce repli. Les portraits, terrains, fonds d'accueil, matières, panoramas
de cité, bâtiments, objets actifs, ressources et décors sont consommés par le
client au moyen de leurs clefs exactes. Toute image absente ou rejetée laisse
réapparaître le rendu procédural. Voir
`docs/reference/CLAUDE-CODE-WAVE2-HANDOFF.md` pour la suite côté créatures et la
procédure de validation visuelle.

ImageGen intégré ne fournit pas de graine numérique. Le manifeste l'indique
explicitement au lieu d'inventer une reproductibilité bit-à-bit.
