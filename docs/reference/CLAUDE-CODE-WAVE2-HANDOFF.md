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
6. docs/reference/CREATURE-RENDERS-QA-2026-08-19.md
7. docs/reference/IMAGEGEN-CREATURE-RENDERS-TRACE.json
8. apps/client/public/img/manifeste.json
9. tools/wave2_asset_specs.mjs
10. tools/creature_render_specs.mjs

ÉTAT LIVRÉ

- 180 images vague 2 : 40 bâtiments, 6 panoramas portrait, 15 objets actifs,
  7 ressources, 56 décors, 28 planches quatre vues de créatures et 28 rendus
  individuels haute définition.
- 124 nouvelles images publiques ; manifeste global à 167 clefs uniques et
  9 610 264 octets sur un budget de 12 582 912.
- Les bâtiments `bati_*` et les panoramas portrait sont déjà intégrés dans la
  cité avec repli procédural.
- Les clefs `carte_*`, `ressource_*` et `prop_*` correspondent exactement aux
  consommateurs existants de l'atlas.
- Les 56 WebP de docs/reference/creatures/ ne sont pas chargés par le client :
  les fichiers à la racine sont les planches géométriques et ceux de `renders/`
  sont les références de matière, pose et impact.

RÈGLES NON NÉGOCIABLES

- Ne transforme jamais les références de créatures en billboards 2D. Resculpte
  seulement les Graphics/meshes existants en conservant animation, orientation,
  dégâts, mort, ombres, hitboxes et coût de rendu. La planche quatre vues fait
  autorité sur l'anatomie ; le rendu individuel fait autorité sur les matières,
  la pose de prestige et la hiérarchie d'effets.
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
3. Utilise chaque paire `docs/reference/creatures/<id>.webp` et
   `docs/reference/creatures/renders/<id>.webp` pour une passe de resculpture
   des 28 rigs, famille par famille. Les rangs 1–3 restent sobres, les rangs 4–5
   gagnent un accent mémorable et les rangs 6–7 doivent préserver leur ampleur
   spectaculaire. Ajoute des tests de budget de primitives et des captures
   combat/planche-art.
4. Conserve les améliorations de bâtiments en procédural : aucune image n'a été
   demandée pour elles.

COMMANDES DE CONTRÔLE

node tools/build_asset_manifest.mjs
python tools/validate_asset_manifest.py
node tools/validate_wave2_assets.mjs
python tools/validate_creature_renders.py
node tools/validate_creature_renders.mjs
npx --yes pnpm@10.33.0 --filter @auvergne/client typecheck
npx --yes pnpm@10.33.0 --filter @auvergne/client build
node tools/screenshot.mjs cite_granit cite_ermitage carte --dir shots/wave2
```
