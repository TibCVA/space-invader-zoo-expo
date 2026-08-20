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
   praticable sur **35 à 50**, 0 bloc **14 × 14** vide, glaneur ≥ 2,5/j,
   composante praticable unique, ≥ 12 points d'articulation — puis
   `npx vitest run packages/map`.
   **Se méfier de toute constante qui est une longueur en cases** : depuis que
   la carte fait 113 × 184, une distance écrite en dur porte deux fois plus
   loin qu'avant. Les demander en fraction de `COLS`/`ROWS`/`CELLS`.
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

**Duel de validation du lot 1.5 : VERT** (`apps/worker`, les 20 parties
passent avec le mouvement à la pile la plus lente — aucun blocage de
conquête). Plus rien n'est en vol.

**Correctif post-passation (même branche)** : les bâtiments de cité
s'accrochent désormais aux TERRASSES réelles de chaque panorama
(`masse.ts#TERRASSES`, `basePct`) — le propriétaire avait vu des bâtiments
à cheval sur les murets ou au bord du vide. Toute retouche du plan de masse
doit passer par ces zones ; les captures de contrôle sont `shots/masse3`.

## 1 bis. Ce qui a été fait DEPUIS la passation (session Opus 5)

**Le jalon : le jeu est gagnable.** Trois bugs de fond l'en empêchaient, et
aucun n'était visible sans mesure :

1. **`clonePlayer` perdait `sansCiteDepuis`** (5a9737b). `applyCommand`
   reclone l'état à chaque commande : le compte des sept jours repartait de
   zéro plusieurs fois par tour. Une bannière dépouillée de sa dernière cité
   survivait indéfiniment — donc aucune partie ne pouvait se conclure.
   `HeroInstance.benedictions` tombait de la même façon (le joueur payait sa
   visite à l'oratoire et n'en gardait rien). Un test générique compare
   désormais les **jeux de clefs** de l'état et de son clone : un champ neuf
   oublié rougira sans qu'on ait pensé à l'écrire.
2. **L'IA n'avait aucun objectif visant les cités adverses** (7f9c76c) :
   `expansion` ne compte que les bourgs neutres, `harcelement` court après
   les héros. Ajout d'un objectif `conquete` (supériorité + âge + curée) et
   chute de la laisse pour une conquête — un profil prudent (laisse 70 cases)
   ne pouvait littéralement jamais atteindre l'ennemi sur 256 colonnes.
3. **Les capitales n'étaient pas publiques** (2821f93, e0f2831). Sonde sur
   une partie complète : en 858 jours l'IA n'a JAMAIS vu une cité adverse.
   Chaque bannière choisit pourtant sa capitale sur l'écran de nouvelle
   partie. Les capitales sont donc connues ; la garnison, non (le test de
   loyauté a d'ailleurs attrapé une fuite dans ma première version).

**Simulation : 4/4 parties conclues par conquête, 22 à 127 jours, médiane
11 semaines** (cible ≥ 6) — contre 4/4 au garde-fou à 451 jours avant.

Le reste livré : Citadelle et Château (croissance ×2 de HMM3, et le champ de
siège arme 2/3/4 tours selon la place forte) ; l'école d'un sort lue au lieu
d'être devinée (18 fautes sur 32 mesurées puis éliminées) ; l'impact du
combat calé sur le contact du geste (117 ms d'avance supprimées) ; la scène
accélérée qui ne passe plus sous la barre de pouce (elle perdait 90 px,
c'est-à-dire toute la barre d'actions du combat) ; le pincer-zoomer dans la
capitale et les combats ; les hautes-chaumes et les tourbières (prairie+forêt
82,3 % → 74,5 %).

## 1 ter. La carte ramenée à la taille d'une XL de HMM3

Demandé par le propriétaire : « je veux la taille max de HMM3 mais pas plus ».
La carte passe de **256 × 416** (106 496 cases, cinq fois une XL) à
**113 × 184 = 20 792**, l'aire d'une XL de 144 × 144, en gardant la forme du
Forez au rapport 1:1,64. La case vaut **109 m** au lieu de 48.

**La leçon générale, à retenir avant de toucher quoi que ce soit :** rétrécir
la grille sans toucher aux coûts de marche double la portée de toute distance
écrite en cases. Le semis, les routes, les régions, les ancrages, le relief,
l'hydrographie, le bruit fractal, les tests et jusqu'aux réglages de l'IA
parlaient tous en cases sans le dire. Chaque constante a dû être relue en se
demandant « est-ce une longueur ou une valeur ? ».

Ce que la nouvelle échelle a fait apparaître, et qui était faux avant :

| Défaut | Ce qui le cachait |
|---|---|
| `computeSlope` divisait par 96 m, écrit en dur, sans lien avec `CELL_SIZE_M` | La case faisait vraiment 48 m |
| L'équilibrage des départs comparait cinq sommes globales (recouvrement 100 % à son horizon d'une semaine) | Les départs étaient trop éloignés pour se recouvrir |
| La Renaudie, 55 % plus pauvre dans son propre arrière-pays : son pays est à 69 % de prairie et toutes les familles tirées sur cache exigeaient le couvert | L'horizon global masquait l'écart |
| La densité visée, « un objet toutes les 120 à 150 cases », impliquait qu'une XL entière n'en porte que 154 ; le décompte famille par famille en donne 400 à 620 | Le seuil compensait exactement l'excès de surface |
| Longueurs d'onde du bruit : une octave de 88 cases sur une carte large de 113 | Sur 256 de large, elle en couvrait le tiers |
| Rayon de raccord des cotes d'ancrage : 3 cases, soit 327 m d'esplanade plate autour de chaque lieu nommé | 144 m, imperceptible |
| Objets posés sur des tabliers de pont, emprises de bourg à cheval sur une rivière, comblement effaçant un pont | Les cours d'eau ne passaient pas là |
| La Scierie d'Arconsat gardée à quatre cases de sa ville, murant la sortie au premier jour | Elle était plus loin |

**État mesuré** (`cd apps/worker && npx tsx src/carte.ts`) : 20 792 cases,
20 135 praticables, **520 lieux — une case sur 39**, glaneur **4,2 par journée
de marche**, 0 bloc de 14 × 14 vide sur 104, composante praticable unique,
les cinq départs à moins de 4 % de valeur accessible les uns des autres.
Terrain : prairie 36,3 %, forêt 31,6 %, pente 10,3 %, lande 5,7 %, rocher
2,2 %, falaise 1,1 %.

**Suite complète : 782 tests, 57 fichiers, 0 échec.** Les seuils des tests
exprimés en cases sont devenus des parts de la grille, de sorte qu'ils
suivront le prochain changement d'échelle au lieu de le masquer. Le témoin
des ancrages est passé de la colonne et de la ligne — qui décrivaient une
grille disparue — à la latitude et la longitude.

**Un gel de partie découvert au passage, et corrigé.** `endTurn` désignait le
joueur suivant AVANT de faire passer le jour, alors que c'est au passage du
jour que les maisons s'éteignent (règle des sept jours sans cité). Le suivant
pouvait donc être mort avant d'avoir joué — et poser une bannière morte comme
joueur actif fige la partie pour tout le monde : le moteur refuse alors toute
commande, `EndTurn` compris, y compris celui qu'un harnais force à sa place.
Deux parties sur quatre gelées, aux tours 34 et 48. Le défaut est ancien ;
c'est la nouvelle échelle qui l'a rendu fréquent, les conquêtes y aboutissant
bien plus vite. Test dédié dans `passation-tour.test.ts`, éprouvé en le
défaisant — la coïncidence ne se rencontre pas en jouant, il faut la monter.

**Simulation à cinq bannières après correctif** : 4/4 décidées, 0 partie
enlisée, 0 commande refusée au rejeu, durée moyenne 217 jours. Le duel à deux
du harnais conclut en 108 à 161 jours, expert 16/20. **Mais aucune des
parties à cinq n'achève une conquête** : elles se règlent au classement
d'observation du harnais. C'est un sujet d'équilibrage et d'IA, pas d'échelle
— à noter pour la suite.

**Ce qui a EMPIRÉ et qu'il faut traiter (voir P0.4 ci-dessous) :** les points
d'articulation tombent de 14 à **4** pour une cible de 12. Ce n'est pas une
régression du semis : les 14 d'avant étaient un artefact de la pente
surestimée d'un facteur 2,27, qui fabriquait des barres rocheuses partout.
La mesure corrigée dit la vérité — **le relief ne ferme pas les zones**, et
c'est exactement le chantier déjà inscrit au plan.

## 1 quater. Audit du 20/08 — ce que le code dit, contre ce que ce document disait

Onze chantiers relus **dans le code**, pas dans les tableaux d'état. Trois
défauts que les documents masquaient, et deux correctifs faits dans la foulée.

**Corrigé — le pincer-zoomer volait le tour** (`gardePincement`). Le module
`pincement.ts` annonce dans son contrat que l'appelant doit « ignorer le
prochain relâché » et expose `surFin` pour cela ; la cité et le champ de
bataille branchaient `surPincement` sans jamais fournir `surFin`. `grep surFin`
ne le trouvait que dans sa propre déclaration et son propre appel. Au combat,
lever les doigts après un zoom émettait un `pointertap` sur l'hexagone en
dessous — donc un déplacement ou une attaque, et l'action du tour était
consommée par le geste de regarder.

**Corrigé — un tiers de la carte était illisible.** `render/objects.ts:121`
compose `carte_<genre>` et, faute de le trouver, retombe sur `carte_borne`.
Treize des vingt-neuf genres n'avaient aucune entrée : **163 lieux sur 493**
portaient la même borne armoriée (coffre 56, demeure 32, banque 12, monolithe
12, école 11, obélisque 10, temple 8, moulin 8, fontaine 7, marché noir 4,
cartographe 3). Le test ne pouvait pas l'attraper : il énumérait à la main
exactement les seize genres couverts. Le moteur publie donc `MAP_OBJECT_KINDS`,
liée à l'union de types par deux assertions — retirer un genre de la liste ne
compile plus. Trois tests en découlent, dont « deux genres ne partagent jamais
un dessin », qui est la faute exacte qui s'était installée.

**Non corrigé, et c'est le premier réglage à reprendre : les croissances de
créatures ne sont pas celles de HMM3.** 18/12/8/6/4/2/1 au lieu de
14/9/7/5/4/3/2 — rangs 1 à 4 très au-dessus, rangs 6 et 7 en dessous. La
Citadelle et le Château sont bien là (×1,5 puis ×2, quatre tours au siège),
mais la table témoin de `balance.test.ts:32-45` fige les anciennes valeurs :
aucun test ne pouvait rougir. C'est le réglage qui gouverne le rythme de toute
la partie, donc à reprendre AVANT tout étalonnage par simulation.

**Ce que l'audit a précisé sur les autres chantiers :**

| Chantier | Ce qu'on croyait | Ce que le code dit |
|---|---|---|
| P0.2a calage de l'impact | fait | fait au corps à corps ; au **tir** l'impact tombe encore 20 ms avant l'arrivée du trait (`anim.ts:358` attend 0,28 s, le projectile vole 0,3 s) et **aucun test ne verrouille le calage** |
| P0.2b effet par école | à faire | **fait** — `vfx.aura(ecole)` distingue les quatre écoles |
| P0.2b projectiles, cadavres | à faire | absents tous les deux ; le conteneur `siege.ts:305` des projectiles de tour n'est jamais alimenté |
| P0.2c densité d'obstacles | à faire | table d'origine intacte ; l'icône épée/flèche n'est posée que sur la case du curseur, et sur téléphone le toucher attaque aussitôt — elle n'est donc quasi jamais vue |
| P1.5 rampes du champ | à faire | **une seule ligne** a changé dans `field.ts` depuis le correctif des dégradés, et ce n'était pas un arrêt de rampe (mesure : luminance 89,6 pour une cible à 95) |
| P1.5 angle du soleil | à faire | `degradeSurface` passe toujours 135 quand son propre en-tête annonce 315 ; idem `parchemin.ts:170,376`, `archetypes.ts:238` |
| P1.7 resculpture | à faire | **impossible qu'elle ait eu lieu** : les fichiers de créature datent de 18 h AVANT l'arrivée des rendus de référence. Vu sur planche de contact : les formes sont très frustes (le sanglier est une caisse sur pattes) |
| P2.9 revue | à faire | 3 scènes sur 14 n'ont **jamais** été capturées une seule fois : `cite_granit`, `cite_ermitage`, `diagnostic` |
| P2.11 déploiement | fait | outillage **sain** — jeton lu uniquement dans l'environnement, jamais imprimé, jamais passé en argument, portes de qualité avant envoi. Mais **la version en ligne précède le correctif du gel de partie** : le jeu déployé gèle deux parties sur quatre. Et `RAILWAY_GIT_COMMIT_SHA` n'étant pas défini, `/health` annonce « commit inconnu » |
| « Raccordement des matières » (plan.md) | à faire | **fait** — les huit matières sont consommées dans `town/index.ts:86-93` |

**Deux dettes de test à connaître :** les 30 cas qui valident le correctif des
dégradés vivent dans `__epreuve/`, qui est dans `.gitignore` — ils n'existent
pas dans l'historique. Et il n'y a **aucun garde-fou** sur les seuils de la
carte (part d'infranchissable, articulations) : la prochaine remise à l'échelle
les refera tomber en silence.

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
**C'est désormais le premier chantier de la liste** : à la taille d'une XL,
la carte n'a plus que **4 points d'articulation** pour une cible de 12, et
**3,2 % d'infranchissable** (eau 2,44 % + falaise 1,06 %) pour une cible de
12 %. Une carte de HMM3 sans goulet n'a pas de front : on la traverse en
diagonale sans jamais rien devoir forcer.

*Note d'échelle, à lire avant de commencer.* La distribution des pentes a
changé de sens : elle se mesure maintenant sur les 218 m qui séparent
réellement deux cases. Mesuré sur la graine de démonstration, il reste au
-dessus de 18° 2,4 % de la carte, au-dessus de 13° 7,0 %, au-dessus de 11°
11,0 %. Autrement dit **on ne peut pas atteindre 12 % d'infranchissable en
abaissant seulement `FALAISE_SLOPE`** : il faudrait le descendre vers 11°,
soit sous `CLIFF_SLOPE` (17) et sous `ROCK_SLOPE` (13), ce qui avalerait les
classes `rocher` et `pente`. La voie qui ressemble à HMM3 est de rendre
**`rocher` infranchissable** — le « Rock » de HMM3 l'est, sa « Rough » ne
l'est pas — ce qui donne 2,2 % + 1,1 % + 2,4 % ≈ 5,7 % et ouvre la porte aux
6 % du lot. Attention, ce n'est pas un changement d'une ligne : `rocher` sert
aussi de marqueur de **col percé** (`build.ts`, la passe qui rouvre les poches
isolées en transformant une falaise en rocher franchissable), il est dans
`CELL_CACHE`, il porte des objets, et l'entrée d'un belvédère y est convertie.
Il faut un terrain distinct pour le passage taillé.

1.8 : hautes-chaumes en lande rase (> 1 150 m), tourbières étendues autour
des sagnes, falaises sur les barres — **≥ 6 % d'infranchissable total** ;
dominante par région
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
