# QA ImageGen — vague 3 — 20 août 2026

## Verdict

**GO pour le lot d'images.** Les 99 fichiers demandés sont présents, valides et
visuellement contrôlés. Le manifeste public reste sous son budget. Les replis
procéduraux sont conservés.

Ce verdict porte sur les images et leur chargement actuel. Deux raccordements
de rendu restent explicitement à faire par Claude Code : les six matières de
pays sur le sol de la carte d'aventure et les six fonds peints sous la grille de
combat.

## Inventaire livré

| Famille | Public | Référence | Détail |
|---|---:|---:|---|
| Terrains répétables | 12 | 0 | 6 remplacements + 6 matières de pays |
| Décor semé | 61 | 0 | 56 remplacements + 5 aiguilles de granit |
| Icônes de lieux | 13 | 0 | 13 nouvelles clefs exactes `carte_*` |
| Fonds de combat | 6 | 0 | 6 nouvelles clefs exactes `combat_*` |
| Études de créatures | 0 | 7 | 2 chevaux + 5 bêtes, hors bundle client |
| **Total** | **92** | **7** | **99 images** |

La vague 3 remplace 62 clefs publiques existantes et ajoute 30 clefs. Le
manifeste passe de 167 à **197 entrées uniques**.

Les lignes explicites du brief ont toutes été produites. La mention « dix-huit
premières images » du paragraphe d'ordre de livraison est un total éditorial :
les cinq familles listées comptent en réalité 4 + 3 + 4 + 3 + 5 = 19 images.
Les 19 sont livrées. `carte_citadelle` et `carte_chateau` n'ont pas été inventées
car ces clefs n'existent pas dans le code ni dans le contrat.

## Traçabilité ImageGen

- 99 appels initiaux, un par asset ;
- 7 extractions de fond transparent pour les sept études de créatures ;
- 0 régénération ;
- 106 appels ImageGen au total ;
- invites canoniques, identifiants de génération, appels d'extraction alpha,
  tailles et SHA-256 dans `docs/reference/IMAGEGEN-WAVE3-TRACE.json` ;
- aucune graine numérique inventée : ImageGen intégré ne l'expose pas.

Les 81 fichiers qui exigent de l'alpha ont un vrai canal RGBA : 61 décors,
13 icônes et 7 références. Les 18 autres fichiers sont opaques.

## Contrôles visuels

Les cinq planches dans `docs/reference/wave3/` ont été inspectées sur fond
parchemin, bleu profond et grenat pour rendre tout halo ou fond résiduel visible.

- `terrains-contact.webp` répète chaque tuile en 2 × 2 ; aucun raccord visible ;
- `decor-contact.webp` montre 61 silhouettes distinctes, ancrées au sol ;
- `lieux-contact.webp` montre 13 lieux identifiables sans texte ni cadre ;
- `combats-contact.webp` confirme six compositions distinctes au centre libre ;
- `creatures-reference-contact.webp` confirme les deux encolures de cheval et
  les cinq études spectaculaires : griffon, vouivre, sanglier, cerf et colosse.

Aucun texte parasite, logo, filigrane, bord opaque, objet moderne ou ombre noire
pure n'a été relevé.

## Mesures et budget

- dimensions, format WebP et canal alpha : **99/99 conformes** ;
- raccords terrain mesurés après décodage WebP : **1,7927 à 2,5218 RMSE**,
  seuil maximal 4 ;
- manifeste : **197 entrées**, **197 clefs uniques** ;
- poids public : **11 357 618 octets** ;
- budget : **12 582 912 octets** ;
- marge : **1 225 294 octets**.

## Vérifications exécutées

```text
python tools/validate_wave3_assets.py             PASS — 99 assets, 0 erreur
node tools/validate_wave3_assets.mjs              PASS — inventaire, trace, SHA, budget
python tools/validate_asset_manifest.py           PASS — 197 clefs uniques
node tools/validate_wave2_assets.mjs              PASS — vague 2 et remplacements cohérents
python tools/validate_creature_renders.py         PASS — 28 rendus historiques
node tools/validate_creature_renders.mjs           PASS — 28 rendus, 14 améliorés, 8 légendaires
npx --yes pnpm@10.33.0 typecheck                 PASS — 11 projets
npx --yes pnpm@10.33.0 test                      PASS — 70 fichiers, 926 tests
npx --yes pnpm@10.33.0 --filter @auvergne/client build
                                                    PASS — 986 modules
node tools/screenshot.mjs carte carte_pres carte_loin combat --dir shots/vague3
                                                    PASS — 8 captures, 0 erreur console
node tools/validate_wave3_runtime.mjs              PASS — 197 chargées, 0 abandon
```

Le harnais a été exécuté après construction explicite du client et du serveur,
avec `--no-build`, car ce poste expose pnpm par son runtime épinglé plutôt que
comme commande globale. Les scènes et attentes du harnais sont restées intactes.

Les avertissements de build sur `ENGINE_VERSION` et deux imports dynamiques sont
antérieurs et sans lien avec ce lot ; ils ne rendent pas le build rouge.

## État d'intégration observé sur les captures

Le validateur runtime ouvre la carte puis le diagnostic dans le même contexte :
**197 images chargées, zéro image abandonnée, zéro avertissement de repli et
zéro erreur console**. Les 61 décors et 13 icônes passent par leurs clefs d'atlas et apparaissent sur la
carte. Les six pinceaux historiques remplacés restent utilisés par le champ de
bataille. Les captures `carte`, `carte_pres`, `carte_loin` et `combat`, en bureau
et iPhone, sont complètes et ne contiennent aucune erreur console.

Les six nouvelles matières de pays sont chargées dans la table générique mais
`render/terrain.ts` ne les compose pas encore dans le sol pixel. Les six fonds
`combat_*` sont également chargés mais `battle/field.ts` ne les dessine pas
encore sous la grille. Le prompt de raccordement exact est dans
`docs/reference/CLAUDE-CODE-WAVE3-HANDOFF.md`.
