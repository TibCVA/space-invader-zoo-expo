# Prompt d'intégration et de continuation pour Claude Code — vague 2

Copier-coller ce bloc dans Claude Code sur la branche
`claude/hmm-auvergne-game-uesdlz` après synchronisation du dernier commit.

```text
Tu reprends la vague 2 ImageGen de Heroes of Might and Magic — Auvergne Edition.
Ne remplace ni ne régénère les bitmaps livrés avant d'avoir lu leur contrat et
leur QA. Travaille fail-closed : une image absente, invalide ou non chargée doit
laisser immédiatement apparaître le rendu procédural existant.

LIS DANS CET ORDRE

1. docs/05-ASSETS.md
2. docs/07-BRIEF-IMAGEGEN-VAGUE-2.md
3. docs/01-ART-BIBLE.md §0 et §2
4. docs/reference/ASSET-QA-WAVE2-2026-08-19.md
5. docs/reference/IMAGEGEN-WAVE2-TRACE.json
6. apps/client/public/img/manifeste.json
7. tools/wave2_asset_specs.mjs

ÉTAT LIVRÉ

- 152 images vague 2 : 40 bâtiments, 6 panoramas portrait, 15 objets actifs,
  7 ressources, 56 décors et 28 références de créatures.
- 124 nouvelles images publiques ; manifeste global à 167 clefs uniques et
  9 610 264 octets sur un budget de 12 582 912.
- Les bâtiments `bati_*` et les panoramas portrait sont déjà intégrés dans la
  cité avec repli procédural.
- Les clefs `carte_*`, `ressource_*` et `prop_*` correspondent exactement aux
  consommateurs existants de l'atlas.
- Les 28 WebP de docs/reference/creatures/ ne sont pas chargés par le client.

RÈGLES NON NÉGOCIABLES

- Ne transforme jamais les références de créatures en billboards 2D. Resculpte
  seulement les Graphics/meshes existants en conservant animation, orientation,
  dégâts, mort, ombres, hitboxes et coût de rendu.
- Ne supprime aucun repli procédural et ne masque pas une erreur de chargement.
- Ne renomme aucune clef ni aucun fichier du manifeste.
- L'interface, le texte, les cadres, les sorts, les compétences et les blasons
  restent vectoriels.
- Ne prétends pas qu'un asset apparaît en jeu sans capture du HEAD exact et sans
  `rapport.json` exempt d'erreur console.

SUITE RECOMMANDÉE

1. Lance les validateurs et les tests indiqués dans le rapport QA.
2. Inspecte les captures bureau et iPhone de `cite_granit`, `cite_ermitage` et
   `carte`. Corrige seulement un défaut prouvé par capture.
3. Utilise les planches `granit_t1` à `ermitage_t7_up` pour une passe de
   resculpture des 28 rigs, famille par famille, en ajoutant des tests de budget
   de primitives et des captures combat/planche-art.
4. Conserve les améliorations de bâtiments en procédural : aucune image n'a été
   demandée pour elles.

COMMANDES DE CONTRÔLE

node tools/build_asset_manifest.mjs
python tools/validate_asset_manifest.py
node tools/validate_wave2_assets.mjs
npx --yes pnpm@10.33.0 --filter @auvergne/client typecheck
npx --yes pnpm@10.33.0 --filter @auvergne/client build
node tools/screenshot.mjs cite_granit cite_ermitage carte --dir shots/wave2
```
