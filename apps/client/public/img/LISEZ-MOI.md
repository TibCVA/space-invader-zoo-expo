# Images générées

Dépose ici les bitmaps produits par un outil de génération d'images, en suivant
**`docs/05-ASSETS.md`** : chemins, clefs, tailles et style y sont imposés.

`manifeste.json` est aujourd'hui vide : le jeu tourne entièrement sur son art
procédural. Chaque entrée ajoutée au manifeste remplace la texture correspondante
de l'atlas ; une entrée absente ou invalide est ignorée et le rendu procédural
reste affiché. Le jeu ne peut donc jamais se retrouver avec un trou.
