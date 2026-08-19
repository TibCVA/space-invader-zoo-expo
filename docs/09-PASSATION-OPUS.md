# Passation à Opus 5 — ce qui reste pour être au plus près de HMM3

> Rédigé le 19/08 à la demande du propriétaire, à l'approche de la limite
> d'utilisation du modèle courant. **Lire d'abord `plan.md` §3 (méthode) et
> `docs/08-PLAN-AAA.md` (le plan d'exécution détaillé, lots et acceptations).**
> Ce document dit : ce qui est fait, ce qui reste, dans quel ordre, et les
> pièges qui ont déjà coûté des heures.

## 0. Les règles qui ont fait leurs preuves (ne pas transiger)

1. **Committer et pousser AVANT tout test long.** Le conteneur se recycle
   sans prévenir : deux pertes de travail vécues dans cette session, dont un
   lot entier refait de mémoire.
2. **`tsc --noEmit` sur chaque paquet touché.** Vitest transpile sans
   vérifier les types : une erreur latente a survécu à trois commits.
3. **Rien n'est « fait » sans mesure ou capture regardée.** Un correctif
   mesuré ne se défait qu'avec une mesure contraire. Chaque test neuf
   s'éprouve en le défaisant (bascule python ciblée, jamais `git checkout`).
4. **Toute insertion d'appels RNG dans `buildObjects` décale tout l'aval.**
   Après quoi : `cd apps/worker && npx tsx src/carte.ts` — cibles : une case
   praticable sur ≤ 150, 0 bloc 32×32 vide, glaneur ≥ 2,5/j, composante
   praticable unique, ≥ 12 points d'articulation — puis
   `npx vitest run packages/map`.
5. **Les sous-agents et workflows sont morts** (allocation d'usage épuisée) :
   travailler en ligne, séquentiellement.
6. Captures : `node tools/screenshot.mjs <scènes> --dir shots/<nom>` (construit,
   sert sous la vraie CSP, bureau 1920×1080 + iPhone 390×844, rapport
   d'erreurs console). Ports libres gérés. Les attentes par scène sont des
   mesures, ne pas les raccourcir.
7. **Aucun secret dans le repo, les logs ou le client.** Le `RAILWAY_TOKEN`
   se lit dans l'environnement processus uniquement. Celui du propriétaire
   est COMPROMIS (posté deux fois en chat) : lui rappeler de le faire tourner
   avant tout déploiement. Projet Railway : af0d4f76-b21d-4b77-a11b-05ca7f9c1088.
8. Pas d'identifiant de modèle dans les commits, PR ou le code.

## 1. Fait et vérifié (ne pas refaire)

| Quoi | Commit | Preuve |
|---|---|---|
| Victoire unique (tous les châteaux) + règle des 7 jours sans cité | 443a2a2 | 17/20 duels décisifs en 578 s |
| 13 natures d'objet branchées avec effets réels | 2398a70 | `lieux.test.ts` |
| Densification (842 objets, 1/125, 0 bloc vide, glaneur 2,7/j) | 31cb88d + cd2bcf9 | `pnpm carte` |
| Embranchements : 94/94 lieux actifs raccordés au réseau | 5c09158 | `embranchements.test.ts`, éprouvé |
| Gardes qui gardent : 30+ postes à empreinte 3 cases, 10/10 itinéraires croisés | 33c690d + 67f8b9d | `gardes.test.ts`, 5 graines |
| Plan de masse cité : tout construit couvre 80-92 % des terrasses, 2 orientations | 656bbdb + c7b1ceb | `plan-de-masse.test.ts` + captures `shots/masse2` |
| 3 lieux nommés : col des Sagnes, col Saint-Thomas (+ route Forez-Auvergne), Pierre de Pamole | cd2bcf9 | `lieux-nommes.test.ts` |
| Mouvement selon la pile la plus lente, barème HMM3 exact 1300→2000 | f1adaf3 | `progression.test.ts` |
| Vague 2 d'images (167 entrées, 9,6 Mo) intégrée, pipeline verrouillé | (Codex) | validateurs + captures |

**Vérification en vol au moment de la passation** : `npx vitest run apps/worker`
(les 20 duels, ~12 min) relancé après le lot 1.5 — si le résultat n'apparaît
pas dans un commit suivant, le relancer ; attendu ≥ 17/20 décisives, aucun
blocage de conquête.

## 2. LA LISTE — par importance pour le feeling HMM3

### P0 — le cœur du jeu (sans quoi ce n'est pas HMM3)

**P0.1 — Lot 1.4 : les vrais nombres HMM3 (croissance, Citadelle/Château).**
`packages/content/src/creatures.ts`, `buildings.ts`, `balance.test.ts`.
Croissance de base par rang 14/9/7/5/4/3/2 — RE-VÉRIFIER contre
heroes.thelazy.net (« Creature dwellings » / croissances par rang) avant
d'écrire, comme le barème de mouvement l'a été. Ajouter **Citadelle**
(+50 % de croissance, douves) et **Château** (+100 %, tours) dans la chaîne
défensive : les ranger `chain: 'defense'` sur l'emprise existante (16,88) —
le test des chaînes-échelles (`plan-de-masse.test.ts`,
`balance.test.ts > emprise`) les accepte alors d'office. Remplace le plafond
réel ×1,35 par le ×2 canonique. Coûts alignés (~2 500 écus + granit ; ~5 000).
Acceptation : `validateContent()` vert ; `pnpm sim` durée médiane ≥ 6
semaines ; expert vs prudent entre 60 et 85 %.

**P0.2 — Combat : câbler ce qui est déjà mesuré (lots 2.3 + 2.4).**
`apps/client/src/battle/`. Les défauts sont listés et chiffrés par l'audit :
impact joué 117 ms AVANT le contact (recaler sur la frame de contact du clip) ;
école de sort devinée par mots-clefs → **table id→école réelle** (18/32
fausses aujourd'hui) ; un seul effet visuel pour 32 sorts → au moins un par
école ; un seul projectile → par tireur ; pas de cadavres → les poser ;
**icônes épée/flèche sur les cases d'attaque** (exigence du propriétaire :
coûts visibles) ; obstacles 3,1/champ → variété et densité HMM3 ;
**iPhone : la carte d'aperçu recouvre les six boutons d'action** — la
déplacer/replier pour que cases tactiles et barre d'actions restent
utilisables. Un test par câblage (le premier test de `battle/` existe :
`anim.test.ts`, suivre son modèle). Vérifier par captures `combat`.

**P0.3 — Pincer-zoomer sur iPhone (reste du lot 2.5).**
Cité ET combat (exigence explicite). Scènes Pixi : geste pinch → échelle du
conteneur racine, bornée, avec recentrage. La cité est déjà recomposée
(plan de masse fait — ne pas y retoucher sans repasser
`plan-de-masse.test.ts` et les captures).

**P0.4 — Lots 1.8 + 1.9 ensemble : le relief ferme, les cols ouvrent.**
`packages/map/src/terrain.ts`, `roads.ts`, `elevation.ts`.
1.8 : hautes-chaumes en lande rase (> 1 150 m), tourbières étendues autour
des sagnes, falaises sur les barres — **≥ 6 % d'infranchissable total**
(aujourd'hui ~1,5 % : eau 1,08 % + falaise 0,39 %) ; dominante par région
≤ 65 % ; les 12 régions distinctes deux à deux. 1.9 : chaque frontière de
zone franchie par 1 à 3 passages seulement (cols, ponts, gués) — les postes
du lot 1.3 se caleront d'eux-mêmes sur les transitions d'anneau des voies —
plus des rocades secondaires. Acceptation : `pnpm carte` composante unique
contenant les 5 départs ; itinéraires optimaux entre capitales passant par
des cols ; articulations en hausse (≥ 12 tenu, viser plus). ATTENTION :
c'est LE chantier qui redessine la carte — refaire toutes les mesures et
regarder une capture de la carte entière avant/après.

### P1 — la fidélité visuelle

**P1.5 — Lot 2.2 : rampes du champ de bataille + soleil de l'atlas.**
`apps/client/src/battle/field.ts` : le sol a perdu 19 points de luminance et
4 de saturation depuis que les dégradés peignent réellement — ré-étalonner
les rampes contre une capture. `apps/client/src/art/shading.ts:419` :
`degradeSurface` éclaire à 135° quand tout le reste est à 45/315° —
harmoniser, PUIS regarder des captures de toutes les scènes (changement
global de l'atlas, risque de régression large).

**P1.6 — Lot 2.1 / vague 3 ImageGen : icônes de carte des 13 natures.**
Écrire le brief Codex (modèle : `docs/07-BRIEF-IMAGEGEN-VAGUE-2.md`) pour
`carte_demeure`, `carte_moulin`, `carte_banque`, `carte_monolithe`,
`carte_obelisque`, `carte_ecole`, `carte_temple`, `carte_fontaine`,
`carte_coffre`, `carte_garde_frontiere`, `carte_tente_clef`,
`carte_cartographe`, `carte_marche_noir` (+ Citadelle/Château si P0.1 les
ajoute au tableau). Le pipeline est verrouillé : clef manifeste = clef
d'atlas, ancres en fractions, repli procédural jamais retiré.

**P1.7 — Lot 2.6 : resculpture des créatures faibles.** Les 28 rendus de
référence sont dans `docs/reference` (non embarqués). Comparer côte à côte,
resculpter les pires d'abord, par captures de la planche de contact.

### P2 — l'endgame

**P2.8 — Simulation d'équilibrage (3.1).** Après P0.1 : `pnpm sim`
20 parties × 3 graines ; ajuster revenus/coûts/croissance jusqu'aux cibles
(durée médiane ≥ 6 semaines ; win-rates par capitale dans une fourchette
raisonnable ; expert vs prudent 60-85 %).

**P2.9 — Revue adversariale finale (3.2).** Toutes scènes, bureau + iPhone,
comparaison côte à côte avec de vraies captures HMM3, zéro erreur console,
puis corrections dernières.

**P2.10 — Capture de la carte densifiée.** Jamais regardée en image depuis
la densification + embranchements + postes : `node tools/screenshot.mjs
carte --dir shots/carte-dense` et JUGER (lisibilité actif/décor, routes
secondaires visibles, gardes visibles).

**P2.11 — Déploiement Railway.** `tools/deployer.sh`. Token DANS
L'ENVIRONNEMENT seulement ; exiger la rotation préalable (compromis).
Après déploiement : re-vérifier le multijoueur asynchrone en production et
l'iPhone réel (zoom compris).

## 3. Détails d'état utiles

- Branche : `claude/hmm-auvergne-game-uesdlz`. Jamais pousser ailleurs.
- Graine de démonstration : 20250816. Grille 256×416.
- `pnpm carte` (via `npx tsx apps/worker/src/carte.ts`) : le tableau de bord
  de la carte. Dernier état : 842 objets, 1/125, glaneur 2,7/j, 0 bloc vide,
  composante 1, 14 articulations, 32 postes bloquants + 2 cols nommés.
- Les améliorations de demeures REMPLACENT visuellement leur demeure
  (même emprise, +12 d'échelle, peinture de la demeure) — `masse.ts`,
  `visiblesDe`. Toute retouche du tableau de cité passe par
  `apps/client/src/town/masse.ts` (géométrie partagée vue/test).
- Le test `plan-de-masse.test.ts` mesure la couverture aux cadres réels ;
  seuil 70 %, mesuré 80,5-92,2 %.
- `docs/08-PLAN-AAA.md` reste le plan de référence (périmètres exclusifs,
  acceptations mesurables) ; `plan.md` §1 l'état d'avancement ligne à ligne.
