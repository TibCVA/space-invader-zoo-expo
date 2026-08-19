# Rapport QA — ImageGen vague 2 — 19 août 2026

## Verdict

**GO technique et graphique.** Les 152 images nommées dans le brief ont été
générées, finalisées et inspectées, puis les 28 créatures ont reçu chacune un
rendu individuel haute définition supplémentaire. La vague complète compte donc
**180 images** : 124 assets sont distribués par le client, tandis que 28 planches
géométriques et 28 rendus matière/pose restent des références de sculpture. Le
manifeste public contient toujours 167 entrées pour 9 610 264 octets, sous le
budget ferme de 12 582 912 octets.

Le brief comporte des totaux récapitulatifs incompatibles avec ses listes : il
annonce notamment 32 bâtiments alors qu'il en nomme 40, et 14 objets de carte
alors qu'il en nomme 15. Les **clefs explicitement listées** ont fait autorité :

| Famille | Livré | Destination |
|---|---:|---|
| Bâtiments | 40 | `apps/client/public/img/batiments/` |
| Panoramas portrait | 6 | `apps/client/public/img/cites/` |
| Objets actifs | 15 | `apps/client/public/img/carte/` |
| Ressources | 7 | `apps/client/public/img/carte/` |
| Variantes de décor | 56 | `apps/client/public/img/decor/` |
| Planches de créatures | 28 | `docs/reference/creatures/*.webp` |
| Rendus de créatures | 28 | `docs/reference/creatures/renders/` |
| **Total** | **180** | 124 publiques + 56 références |

## Traçabilité et traitement

- Chaque image a reçu un appel ImageGen individuel ; 152 identifiants de
  génération initiaux uniques sont conservés.
- 58 sources qui devaient être transparentes ont nécessité un second passage
  ImageGen d'extraction du fond. Les deux identifiants sont enregistrés dans
  `IMAGEGEN-WAVE2-TRACE.json`.
- La finalisation applique un redimensionnement Lanczos en alpha prémultiplié,
  un placement déterministe et un WebP qualité 82, méthode 6, `exact=true`.
- ImageGen intégré n'expose ni graine numérique ni journal textuel verbatim. Le
  dépôt conserve donc honnêtement l'invite canonique normalisée, les identifiants
  disponibles, les octets réels et les empreintes SHA-256.
- Les 124 nouveaux assets publics pèsent 5 211 768 octets. Les 28 planches hors
  bundle pèsent 2 893 406 octets.
- Les 28 rendus individuels supplémentaires pèsent 8 457 716 octets. Leur trace
  séparée conserve 28 générations initiales et les 55 appels correctifs
  nécessaires à la régénération ou à l'obtention d'un vrai canal alpha.

## Revue visuelle

Les cinq planches de contact de `docs/reference/wave2/` ont été inspectées :

- les bâtiments sont lisibles à l'échelle du jeu, hiérarchisés par rang et
  cohérents entre granite sombre, bois, ardoise et cuivre patiné ;
- les bandes de contrôle placées derrière les sprites confirment les détours
  sans fond résiduel opaque ;
- les objets actifs sont plus saturés que le décor et restent distincts à 88 px ;
- les 56 éléments de décor offrent quatre ou cinq silhouettes réellement
  différentes par famille ;
- chaque triptyque de cité portrait conserve cadrage et géométrie entre aube,
  midi et crépuscule ;
- les 28 planches de créatures présentent quatre vues/poses et une silhouette
  noire, sans devenir des sprites de remplacement.
- la planche `creatures/renders-contact.webp` confirme 28 silhouettes
  individuelles, 14 paires base/amélioration clairement différenciées et une
  progression visuelle régulière des rangs 1 à 7 ;
- la planche `creatures/legendary-contact.webp` et quatre inspections à
  1024 px confirment l'impact spectaculaire des huit rangs 6–7, sans recadrage,
  texte parasite ni anomalie anatomique visible.

## Intégration livrée

- Les quarante bâtiments non-améliorations utilisent les clefs `bati_*` dans la
  cité ; le maillage procédural reste le repli si un asset manque.
- Les panoramas portrait natifs sont sélectionnés sur viewport vertical, sans
  recadrer les panoramas paysage.
- Les objets actifs, ressources et décors utilisent les clefs déjà demandées par
  l'atlas de la carte.
- Les améliorations de bâtiment restent procédurales, conformément au brief.
- Les créatures restent animées et procédurales. Les planches quatre vues
  définissent la géométrie ; les rendus individuels définissent matière, pose et
  hiérarchie de spectacle. Aucun billboard 2D n'a été substitué aux rigs.

## Vérifications reproductibles

```powershell
node tools/build_asset_manifest.mjs
python tools/validate_asset_manifest.py
node tools/validate_wave2_assets.mjs
python tools/validate_creature_renders.py
node tools/validate_creature_renders.mjs
npx --yes pnpm@10.33.0 exec vitest run apps/client/src/town/assets.test.ts apps/client/src/art/assets.test.ts apps/client/src/render/objects.test.ts apps/client/src/render/clairieres.test.ts
npx --yes pnpm@10.33.0 --filter @auvergne/client typecheck
npx --yes pnpm@10.33.0 --filter @auvergne/client build
node tools/screenshot.mjs cite_granit cite_ermitage carte --dir shots/wave2
```

## Preuve en jeu

Le harnais de production a généré les six captures de `shots/wave2/` avec la CSP
réelle du serveur : **0 échec et 0 erreur console**. Leur inspection confirme :

- quarante bâtiments peints visibles dans les cités au lieu des primitives ;
- panorama paysage sur bureau et composition portrait native sur iPhone ;
- transparence et ancrage des bâtiments sans rectangle résiduel ;
- objets actifs, ressources et variantes de décor peints sur la carte ;
- HUD, navigation et zones tactiles conservés sur les deux viewports.

`shots/wave2/rapport.json` est la preuve machine ; les PNG sont la preuve
visuelle. Les deux ont été contrôlés. La suite complète termine également à
**48 fichiers et 703 tests réussis**, et le typecheck des onze projets du
workspace est sans erreur.
