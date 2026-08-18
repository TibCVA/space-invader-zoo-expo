# Prompt d'intégration pour Claude Code

Copier-coller intégralement le bloc suivant dans une tâche Claude Code ouverte
sur la branche `claude/hmm-auvergne-game-uesdlz`, après avoir rendu le lot
d'assets disponible dans son arbre de travail.

```text
Tu intègres le lot ImageGen de l'Auvergne Edition. Travaille avec une discipline
fail-closed : ne prétends jamais qu'une image apparaît à l'écran sans capture qui
le prouve, et conserve toujours le repli procédural actuel.

CONTEXTE À LIRE AVANT TOUTE MODIFICATION

1. docs/05-ASSETS.md
2. docs/01-ART-BIBLE.md §0, §1 et §2
3. docs/reference/ASSET-QA-2026-08-18.md
4. apps/client/public/img/manifeste.json
5. apps/client/src/art/assets.ts et apps/client/src/art/index.ts
6. packages/content/src/buildings.ts pour les positions de scène

ÉTAT LIVRÉ ET VÉRIFIÉ

- 43 WebP, 4 398 496 octets au total, budget maximal 12 582 912 octets.
- 21 portraits 512x640 : apps/client/public/img/portraits/*.webp
- 6 cités 2048x1152 : apps/client/public/img/cites/*.webp
- 6 terrains 512x512 répétables : apps/client/public/img/terrain/*.webp
- 8 matières 512x512 répétables : apps/client/public/img/matieres/*.webp
- 2 accueils natifs : paysage 2560x1440, portrait 1170x2532.
- Manifeste : 43 clefs uniques, octets réels, prompts canoniques, generationId et
  SHA-256. ImageGen intégré n'expose pas de graine numérique ; n'en invente pas.
- Planches visuelles et répétitions 3x3 : docs/reference/*.webp et
  docs/reference/tiles/*.webp.

CE QUI EST DÉJÀ BRANCHÉ

- appliquerAssetsGeneres(...) remplace les textures après la construction de
  l'atlas et garde le procédural en secours.
- apps/client/src/render/heroes.ts demande portrait_<id> : les 21 portraits
  doivent donc apparaître dès que le manifeste est chargé.
- atlas.terrainBrush(...) consomme les clefs herbe, aiguilles, roche, tourbe,
  gravier et eau.

CE QUI N'EST PAS ENCORE CONSOMMÉ — À IMPLÉMENTER

1. ACCUEIL
   - Intègre accueil_paysage et accueil_portrait dans l'écran d'accueil existant.
   - Choisis l'image par le ratio réel du viewport ; le portrait ne doit jamais
     être remplacé par un recadrage du paysage.
   - Dessine l'image en mode cover sans déformer son ratio.
   - Préserve le titre, les boutons, l'accessibilité, les animations discrètes et
     les effets atmosphériques utiles, mais ne laisse pas le fond procédural
     concurrencer la peinture.
   - Sur absence, erreur ou chargement incomplet, utilise immédiatement le fond
     procédural actuel sans écran vide ni flash blanc.

2. CITÉS
   - Intègre les clefs exactes cite_granit_aube, cite_granit_midi,
     cite_granit_crepuscule, cite_ermitage_aube, cite_ermitage_midi et
     cite_ermitage_crepuscule dans la scène de cité.
   - La peinture est la couche de fond. Tous les bâtiments constructibles restent
     des couches du moteur aux coordonnées scene.x/y/z/scale de buildings.ts.
   - Ne redessine pas et ne déplace pas les bâtiments pour "coller" à l'image :
     les grandes terrasses et glades ont précisément été générées pour ces slots.
   - Si le jeu expose déjà une phase horaire, interpole/croise progressivement
     entre aube, midi et crépuscule. Sinon, affiche midi et isole le mapping dans
     une fonction pure prête à recevoir l'heure plus tard.
   - Sur toute erreur, garde le tableau procédural actuel.

3. MATIÈRES
   - Les huit clefs sont matiere_granit, matiere_ecorce, matiere_ardoise,
     matiere_parchemin, matiere_cuir, matiere_filDor, matiere_cuivre et
     matiere_tissu.
   - Expose-les proprement aux formes du monde qui utilisent déjà les matières
     procédurales, par exemple via une API d'atlas dédiée ou un adaptateur du
     MaterialKit. Ne les détourne pas en icônes.
   - Utilise un mélange faible et contrôlé (multiplication/overlay selon le rendu)
     pour conserver les valeurs et l'éclairage des formes. Commence bas, inspecte
     les captures, puis augmente seulement si le grain disparaît.
   - Ne bitmapise jamais cadres, boutons, curseurs, blasons, sorts, compétences,
     typographie ni texte : toute l'interface reste vectorielle.

CONTRAINTES DE COHABITATION

- Le lot 4 modifie encore huit fichiers de carte et de combat. Ne touche à aucun
  fichier de carte, de combat, de champ de bataille ou de post-traitement hors
  nécessité démontrée. Limite le diff à landing, town, art/assets, tests et
  documentation d'intégration.
- Préserve les changements concurrents ; commence par fetch, vérifie le HEAD et
  rebase/merge sans écraser le travail d'autrui.
- N'altère pas les WebP, leurs noms, leurs dimensions, leurs clefs, ni le
  manifeste sauf pour corriger une preuve objective.
- Ne supprime jamais le repli procédural.
- Ne charge pas deux fois la même image et ne bloque pas le premier affichage sur
  une catégorie non nécessaire. Les erreurs doivent être visibles dans
  rapportAssets() et rester non fatales.

VALIDATION OBLIGATOIRE

1. Vérifie Node >=22 et pnpm 10.33.0.
2. pnpm --filter @auvergne/client typecheck
3. pnpm --filter @auvergne/client build
4. pnpm test -- --run apps/client/src/art/assets.test.ts (ou la commande Vitest
   équivalente réellement supportée par le dépôt)
5. node -e "const m=require('./apps/client/public/img/manifeste.json'); const n=new Set(m.entrees.map(e=>e.clef)); const b=m.entrees.reduce((s,e)=>s+e.octets,0); console.log({entrees:m.entrees.length,clefs:n.size,octets:b,budget:m.budgetOctets})"
6. Lance le client et produis au minimum :
   - accueil paysage 1440x900 ;
   - accueil portrait 390x844 ;
   - planche des 21 héros avec une lecture à 56 px et une fiche à 320 px ;
   - cité Granit et cité Ermitage, avec bâtiments par-dessus ;
   - les trois heures d'au moins une faction si l'heure est disponible ;
   - une vue rapprochée où terrain et matière se répètent.
7. Ouvre réellement chaque capture. Refuse la validation si tu vois : ratio
   déformé, texte illisible, couture, peinture masquée par le procédural, bâtiment
   flottant, changement de caméra entre les heures, ombre noire, chargement blanc
   ou image manquante.
8. Exporte le rapport de rapportAssets(). Objectif : 43 charges, zéro entrée
   ignorée, octets sous budget. Si l'architecture passe à un chargement paresseux,
   documente alors le nombre attendu par écran au lieu d'inventer 43.

LIVRABLE FINAL

Donne : fichiers modifiés, tests exacts et résultats, captures ouvertes, rapport
assets, budget, anomalies restantes et verdict GO/NO-GO visuel. Un build vert sans
inspection des captures n'est pas un GO visuel.
```

