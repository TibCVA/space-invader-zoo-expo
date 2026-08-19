# Rapport QA — rendus individuels des créatures — 19 août 2026

## Verdict

**GO technique et graphique : 28/28.** Chaque créature, de `granit_t1` à
`ermitage_t7_up`, possède un rendu individuel 1024×1024 en WebP RGBA avec un
fond réellement transparent. Les 14 améliorations sont distinctes de leur forme
de base et les huit rangs 6–7 atteignent le niveau spectaculaire demandé.

Ces images sont des références haute définition de matière, pose et effets.
Elles ne sont pas chargées par le client et ne remplacent pas les rigs animés.

## Inventaire

| Faction | Bases | Améliorations | Rangs 6–7 | Total |
|---|---:|---:|---:|---:|
| Granit | 7 | 7 | 4 | 14 |
| Ermitage | 7 | 7 | 4 | 14 |
| **Total** | **14** | **14** | **8** | **28** |

- Destination : `docs/reference/creatures/renders/<id>.webp`
- Dimensions : 1024×1024
- Format : WebP RGBA, qualité 82, méthode 6, `exact=true`
- Poids cumulé : 8 457 716 octets
- Catalogue canonique : `tools/creature_render_specs.mjs`
- Trace : `docs/reference/IMAGEGEN-CREATURE-RENDERS-TRACE.json`

## Traçabilité ImageGen

Les 28 rendus initiaux ont chacun reçu un appel ImageGen distinct à partir de
leur planche quatre vues. Les sorties qui simulaient la transparence par un
damier opaque ont été refusées. L'obtention des 28 vrais canaux alpha a nécessité
44 appels d'extraction et 11 régénérations ciblées, soit 83 identifiants ImageGen
uniques conservés dans la trace.

ImageGen intégré n'expose pas de graine numérique. Le dépôt conserve les invites
canoniques normalisées, tous les identifiants disponibles, les octets réels et
les empreintes SHA-256, sans prétendre à une reproduction bit-à-bit.

## Revue visuelle

Les contrôles ont porté sur :

- la planche complète `creatures/renders-contact.webp`, avec trois couleurs de
  fond derrière l'alpha pour révéler tout rectangle résiduel ;
- la planche agrandie `creatures/legendary-contact.webp` pour les huit rangs
  6–7 ;
- les fichiers 1024 px `granit_t7_up`, `ermitage_t7_up`,
  `ermitage_t6_up` et `granit_t5_up`.

Constats : silhouettes entièrement contenues, paires base/amélioration lisibles,
équipements et espèces cohérents, absence de texte ou cadre, effets localisés,
pas d'anomalie anatomique visible. Le griffon noir-or, le dragon de brume, le
géant forestier et le verrat-forteresse constituent les pics visuels du lot.

## Règle d'intégration

Pour chaque identifiant, la planche
`docs/reference/creatures/<id>.webp` reste l'autorité anatomique et
géométrique. Le rendu `docs/reference/creatures/renders/<id>.webp` est
l'autorité de matière, pose et intensité. Claude Code doit transposer ces deux
références dans le rig procédural existant en conservant animation, états de
dégâts et de mort, orientation, hitbox, ombre et budget de primitives.

## Vérifications reproductibles

```powershell
node tools/export_creature_render_specs.mjs
python tools/finalize_creature_renders.py --specs ../creature-render-specs.json --results ../creature-render-results.json
python tools/build_creature_render_contact_sheets.py
python tools/validate_creature_renders.py
node tools/validate_creature_renders.mjs
```

Le fichier de résultats contient des chemins de travail locaux et n'est donc pas
versionné. Les WebP finaux, le catalogue, la trace et les validateurs le sont.
