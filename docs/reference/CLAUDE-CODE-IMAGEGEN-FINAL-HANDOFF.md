# Message de passation à Claude Code — assets ImageGen et teaser

Travaille exclusivement depuis la branche
`claude/hmm-auvergne-game-uesdlz`. Les images sont déjà générées, validées et
committées : ne les régénère pas et ne remplace pas leurs clefs ou chemins.

Lis d'abord, dans cet ordre :

1. `docs/05-ASSETS.md` — contrat, clefs, dimensions et budgets ;
2. `docs/01-ART-BIBLE.md`, sections 0 et 2 — palette et lumière ;
3. `docs/reference/CLAUDE-CODE-WAVE2-HANDOFF.md` — créatures et replis ;
4. `docs/reference/CLAUDE-CODE-WAVE3-HANDOFF.md` — carte, combats et références ;
5. `docs/reference/ASSET-QA-WAVE3-2026-08-20.md` — preuve de livraison ;
6. `docs/reference/teaser/IMAGEGEN-TEASER-TRACE.json` — provenance du teaser.

## Ce qui est livré

- Vague 3 : 99 images, dont 92 assets publics et 7 études de créatures.
- Manifeste public : 197 entrées, 11 357 618 octets sur un budget de
  12 582 912 octets.
- Teaser maître : `docs/reference/teaser/teaser-cousins-master.png`.
- Teaser partage : `docs/reference/teaser/teaser-cousins-share.webp`.
- Le teaser contient exactement les cinq héros Thibaut, Paul, Clotilde, Loïc et
  Matthieu, quatre créatures en combat, le titre, puis les mentions
  « Chabreloche », « Le Lac » et « La Maison du Trésor ».

## Travail restant pour toi

Implémente seulement ce qui reste décrit dans les deux handoffs. En particulier,
les matières de pays sont déjà branchées dans la carte : ne refais pas ce
travail. Le raccordement encore ouvert de la vague 3 est celui des six fonds
peints de combat dans `battle/field.ts`, sous la grille et sans toucher à la
lisibilité tactique.

Les études de créatures sont des références de resculpture. Elles ne doivent
jamais devenir des panneaux 2D statiques à la place des rigs, animations,
ombres, hitboxes ou replis procéduraux existants.

Pour le teaser, choisis son emplacement produit selon l'UX existante (accueil,
partage ou écran promotionnel), mais conserve son ratio 16:9 et une variante qui
ne rogne ni les cinq visages, ni le titre, ni les trois noms de lieux. N'ajoute
aucun texte par-dessus l'image. Si aucun emplacement naturel n'existe, laisse le
fichier comme asset éditorial et documente la décision au lieu de forcer une
intégration.

## Garde-fous et validation

- Conserve le rendu procédural comme repli pour toute image absente ou rejetée.
- Préserve les clefs exactes du manifeste et n'introduis aucune nouvelle
  dépendance réseau à l'exécution.
- Ne modifie pas les fichiers ImageGen pour les « optimiser » sans refaire les
  validateurs, la trace et le contrôle visuel.
- Exécute au minimum :

```powershell
node tools/validate_wave3_assets.mjs
python tools/validate_wave3_assets.py
python tools/validate_teaser_asset.py
npx --yes pnpm@10.33.0 typecheck
npx --yes pnpm@10.33.0 test
npx --yes pnpm@10.33.0 --filter @auvergne/client build
```

État de passation vérifié avant publication : 72 fichiers de tests et 945 tests
verts, typecheck vert sur 11 projets, build client vert à 987 modules, 197
images chargées sans abandon, avertissement artistique ou erreur console.
