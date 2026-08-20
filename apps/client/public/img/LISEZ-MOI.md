# Images générées

Dépose ici les bitmaps produits par un outil de génération d'images, en suivant
**`docs/05-ASSETS.md`** : chemins, clefs, tailles et style y sont imposés.

Les trois lots ImageGen des 18, 19 et 20 août 2026 contiennent **197 images
publiques**. La vague 3 remplace six terrains et cinquante-six variantes de
décor, puis ajoute six matières de pays, cinq aiguilles de granit, treize icônes
de lieux et six fonds de combat. `manifeste.json` porte les dimensions, tailles,
invites canoniques de régénération, identifiants de génération et empreintes
SHA-256. Son poids public total est de 11 357 618 octets sur un budget de
12 582 912 octets.

Les vagues 2 et 3 fournissent en plus **63 références de créatures** hors bundle client
dans `docs/reference/creatures/` : 28 planches quatre vues et 28 rendus
individuels haute définition dans `renders/`, puis sept études ciblées dans
`vague3/`. Elles servent ensemble à resculpter les rigs procéduraux ; elles ne
doivent jamais remplacer les créatures animées par de simples images.

Chaque entrée valide remplace la texture correspondante de l'atlas. Une entrée
absente ou invalide est ignorée et le rendu procédural reste affiché : ne jamais
supprimer ce repli. Les portraits, terrains, fonds d'accueil, matières, panoramas
de cité, bâtiments, objets actifs, ressources et décors sont consommés par le
client au moyen de leurs clefs exactes. Toute image absente ou rejetée laisse
réapparaître le rendu procédural. Voir
`docs/reference/CLAUDE-CODE-WAVE2-HANDOFF.md` pour la suite côté créatures et
`docs/reference/CLAUDE-CODE-WAVE3-HANDOFF.md` pour le raccordement des matières
de pays et des fonds de combat.

ImageGen intégré ne fournit pas de graine numérique. Le manifeste l'indique
explicitement au lieu d'inventer une reproductibilité bit-à-bit.
