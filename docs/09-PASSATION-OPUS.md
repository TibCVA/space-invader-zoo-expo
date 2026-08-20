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
   composante praticable unique, **coupe entre capitales ≤ 6**, ≥ 12 % d'infran-
   chissable — puis `npx vitest run packages/map apps/worker`.
   **La cible « ≥ 12 points d'articulation » est retirée, et c'était une erreur
   de grandeur, pas de valeur** : un point d'articulation exige un passage
   UNIQUE, alors que le générateur de HMM3 relie ses zones par « un à trois ».
   Une frontière percée de deux cols n'a aucun point d'articulation, et viser ce
   nombre poussait à bâtir des couloirs uniques. Ce qui se mesure désormais est
   la **coupe** : le nombre de cases à boucher pour séparer deux capitales
   (`apps/worker/src/coupe.ts`, flot maximal à capacités unitaires sur les cases).
   Une image de la structure : `npx tsx src/carte-image.ts /tmp/carte.png`.
   **Se méfier de toute constante qui est une longueur en cases** : depuis que
   la carte fait 113 × 184, une distance écrite en dur porte deux fois plus
   loin qu'avant. Les demander en fraction de `COLS`/`ROWS`/`CELLS`.
5. **Les sous-agents et les workflows fonctionnent de nouveau** — et le
   propriétaire les a demandés dès le prompt initial (« fan out sub-agents »).
   Deux règles apprises en les employant : (a) **partitionner strictement les
   fichiers** entre agents, un fichier n'appartient qu'à un seul, sinon deux
   `Edit` concurrents se marchent dessus ; (b) **leur interdire `pnpm build`,
   `vite build` et `tools/screenshot.mjs`** — deux constructions simultanées se
   disputent `apps/client/dist` — et faire les captures soi-même, une fois, à
   la fin. Leur interdire aussi tout `git`, et committer soi-même après
   relecture : c'est le seul moyen de ne pas emporter le travail à moitié fait
   d'un agent encore en vol.
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

**Ce qui a EMPIRÉ et a été traité depuis (voir §1 quinquies) :** les points
d'articulation tombaient de 14 à **4**. Ce n'était pas une régression du semis :
les 14 d'avant étaient un artefact de la pente surestimée d'un facteur 2,27, qui
fabriquait des barres rocheuses partout. La mesure corrigée disait la vérité —
**le relief ne fermait pas les zones**. Il les ferme maintenant, et l'on ne
mesure plus cela en points d'articulation, qui étaient la mauvaise grandeur.

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

**~~Non corrigé~~ CORRIGÉ depuis : les croissances de créatures.** Elles étaient
18/12/8/6/4/2/1 au lieu des valeurs de HMM3, et la table témoin de
`balance.test.ts` figeait les anciennes, si bien qu'aucun test ne pouvait rougir.
Elles valent maintenant **14/9/7/5/3/2/1** sur les deux factions — vérifié contre
heroes.thelazy.net avant d'écrire, et attention : la passation elle-même
annonçait « 14/9/7/5/4/3/2 », ce qui est FAUX sur les trois derniers rangs. La
Citadelle et le Château sont là (×1,5 puis ×2, quatre tours au siège).

**Ce que l'audit a précisé sur les autres chantiers :**

| Chantier | Ce qu'on croyait | Ce que le code dit |
|---|---|---|
| P0.2a calage de l'impact | fait | **fait des deux côtés** : `VOL_DU_TRAIT` est une constante unique lue par le lancement du projectile ET par l'attente de l'impact, précisément pour qu'ils ne redivorcent pas |
| P0.2b effet par école | à faire | **fait** — `vfx.aura(ecole)` distingue les quatre écoles |
| P0.2b projectiles, cadavres | à faire | absents tous les deux ; le conteneur `siege.ts:305` des projectiles de tour n'est jamais alimenté |
| P0.2c densité d'obstacles | à faire | table d'origine intacte ; l'icône épée/flèche n'est posée que sur la case du curseur, et sur téléphone le toucher attaque aussitôt — elle n'est donc quasi jamais vue |
| P1.5 rampes du champ | à faire | **une seule ligne** a changé dans `field.ts` depuis le correctif des dégradés, et ce n'était pas un arrêt de rampe (mesure : luminance 89,6 pour une cible à 95) |
| P1.5 angle du soleil | à faire | **fait** : `degradeSurface` passe `ANGLE_LUMIERE`, déduit du soleil déclaré et non recopié ; l'en-tête de la fonction porte la trace de l'erreur (135 = haute lumière au nord-EST, donc chaque surface à quatre-vingt-dix degrés de ses propres ombres) |
| P1.7 resculpture | à faire | commencé le 20/08, voir §1 quinquies. Le constat « le sanglier est une caisse sur pattes » était juste ET amplifié par le cadrage de la planche, qui affichait les bêtes en timbre-poste |
| P2.9 revue | à faire | fait le 20/08 : les 3 scènes jamais capturées l'ont été, et le diagnostic y a laissé deux défauts |
| P2.11 déploiement | fait | outillage **sain** — jeton lu uniquement dans l'environnement, jamais imprimé, jamais passé en argument, portes de qualité avant envoi. Mais **la version en ligne précède le correctif du gel de partie** : le jeu déployé gèle deux parties sur quatre. Et `RAILWAY_GIT_COMMIT_SHA` n'étant pas défini, `/health` annonce « commit inconnu » |
| « Raccordement des matières » (plan.md) | à faire | **fait** — les huit matières sont consommées dans `town/index.ts:86-93` |

**Les deux dettes de test signalées ici sont réglées.** Les 30 cas des dégradés
obliques sont revenus dans l'historique, et les seuils de la carte sont tenus par
`apps/worker/src/carte.test.ts` — qui exige les cibles du plan, mesure l'intégrité
de chaque mur de crête et la coupe des dix paires de capitales.

## 1 quinquies. Session du 20/08 — la carte reçoit un front

**P0.4 est CLOS**, et il a fallu changer deux fois d'instrument pour s'en
apercevoir. Le récit, parce que l'erreur est instructive :

1. Rendre le rocher infranchissable et abaisser `CLIFF_SLOPE` de 17 à 13 a porté
   l'infranchissable de 3,2 % à 7,95 % et les points d'articulation de 4 à 23.
   Cible « ≥ 12 » dépassée, chantier clos — c'est ce qu'on a écrit.
2. C'était faux. Un compte des **vrais goulets** — les articulations qui
   détachent un morceau de carte de plus de vingt-cinq cases — en trouve
   **zéro** sur les vingt-trois. Ce sont vingt-trois culs-de-sac : la pointe
   d'une presqu'île, le fond d'une combe. Un cul-de-sac ne se force pas, on n'y
   va pas.
3. Le balayage complet du seuil dit la forme du problème plutôt que son remède :
   0 goulet à 13, 7 à 11, 8 à 10, 7 à 9, pendant que les articulations brutes
   montent à 158 et que la « forte pente » disparaît du paysage. **Du rocher
   épars ne fabrique pas de frontière, en quelque quantité qu'on le sème.** La
   roche affleure sur les FLANCS d'une arête, jamais sur son fil, qui est le seul
   endroit plat : le seuil donnait deux bandes brisées de part et d'autre d'un
   sommet resté marchable.
4. Et la cible elle-même était mal posée : **un point d'articulation exige un
   passage unique**, alors que HMM3 relie ses zones par « un à trois ». La
   grandeur juste est la **coupe** entre capitales, et elle valait 25.

Ce qui a été bâti ensuite, et ce que ça donne :

| | infranchissable | coupe entre capitales |
|---|---:|---:|
| avant | 8,58 % | 25 |
| cinq crêtes murées | 10,98 % | 19 |
| plus cinq chaînes de partage | **15,49 %** | **5** |

- `packages/map/src/barrieres.ts` mure le fil des crêtes le long des polylignes
  qui les soulèvent dans `elevation.ts` — une seule source pour le relief et le
  rempart —, plus cinq chaînes dont on ne donne que les deux bouts, tracées par
  **marche de crête** (un plus-court-chemin qui paie le manque d'altitude).
- **L'ordre d'assemblage est le cœur de l'affaire** : le masque se calcule sur
  la seule élévation, donc AVANT `buildRoads`, et lui est remis comme pénalité.
  Les montagnes existent d'abord, les routes trouvent les cols. L'ordre inverse a
  été essayé et mesuré : la grande chaussée courait sur quarante-quatre cases le
  long du faîte, et un mur dont une route suit l'arête n'est pas un mur.
- Deux cols par crête, choisis aux minima d'altitude de l'axe et espacés le long
  de la ligne. Les postes de garde, qui se posent sur les transitions d'anneau
  des voies, s'y calent d'eux-mêmes.
- `desenclaver` creuse maintenant un col au lieu de sceller : il ne perçait que
  des brèches d'une case et, face à un mur épais de trois, convertissait la poche
  entière en falaise.
- `fermerLesCretes` a été **retirée** : sa raison d'être était de fabriquer des
  goulets par morphologie, et mesurée seule elle en fabriquait zéro.

**Ce que cela change au jeu, mesuré :** le duel expert/prudent réglait sept
parties sur vingt par conquête, il en règle **dix**. Même moteur, même IA, mêmes
graines. Un front rend la conquête décidable.

**Deux instruments neufs, à utiliser avant de conclure quoi que ce soit sur la
carte :** `apps/worker/src/coupe.ts` (la coupe, éprouvée sur sept grilles
dessinées à la main) et `apps/worker/src/carte-image.ts` (la grille entière en
PNG, un pixel par case). On avait redessiné le relief du pays sans jamais pouvoir
en regarder la forme.

**Ce que le duel affirmait de faux**, et qu'il imprimait à chaque exécution : que
la cible était hors d'atteinte faute de libérer la garde d'un lieu après la
victoire. Le défaut est corrigé depuis (`reglerGarde`, verrouillé par
`guarded-place.test.ts`) et le message envoyait le lecteur suivant à la poursuite
d'un bogue résolu. Mesure réelle : 13/20 ici, **43/60 sur soixante graines, soit
71,7 %**, dans la fourchette des plans (60 à 85 %). Le 65 % était un artefact
d'échantillon.

**P2.9 : les trois scènes jamais capturées l'ont été.** Les deux cités tiennent
leur promesse. Le diagnostic, non : ses notes prenaient `--hmm-texte-doux`
(#4c3f2f, l'encre d'un parchemin) sur le fond de nuit de la page — illisible, sur
la page même qui existe pour être lue par un joueur dont le jeu ne s'affiche pas.
Et sa capture iPhone était prise sur son écran d'attente : six secondes ne
suffisent pas à trois pixels de densité.

**P1.7 est commencé, pas fini.** Il a d'abord fallu réparer l'instrument : la
planche de contact plafonnait l'échelle à 1, donc une bête plus petite que sa
case y restait en timbre-poste — on ne pouvait pas voir ce qu'il y avait à
corriger, et l'impression de « très fruste » venait autant du cadrage que du
dessin. Même défaut sur le décor, où l'échelle se calculait sur la boîte de
dessin et non sur la texture : cinq variantes débordaient sur trois cases.
Repris ensuite : l'aile emplumée (un éventail de dix rémiges au lieu d'une
palette festonnée — griffons ET chouettes), la seconde aile qui manquait à toute
bête volante alors que les clips l'animaient déjà, les couleurs des griffons
(ardoise et or, ils étaient ivoire), le garrot et la barde des sangliers, la
crête de poils du loup, et la maçonnerie des colosses (`blocPierre` dessinait un
galet lissé). **Restent frustes :** les vouivres, les humains de la Châtellenie
(silhouettes très simples), les curés, le veneur.

## 1 sexies. Session du 20/08 (après-midi) — les neuf demandes du propriétaire

Le propriétaire a listé neuf reproches. Voici où en est chacun, avec la
mesure en face — et, quand la mesure a démenti une impression, le démenti.

| Sa demande | Où c'en est | La mesure |
|---|---|---|
| « je ne veux pas 2 fois le même asset trop proches » | **fait** | zéro paire semée sous l'écart voulu, toutes familles confondues, sur sept graines — contre 149 avant. Densité tenue : une case sur 37, zéro bloc vide, glaneur 3,6/j |
| « suffisamment de mines de ressources » | **fait** | 46 gisements, dont 9 qui rendent des écus. Une XL de HMM3 en porte 40 à 50 |
| « les mines et items répartis de manière intelligente et réfléchie » | **fait** | un répartiteur donne chaque lot au voisinage le plus pauvre. Équité économique des cinq départs : 50,6 % d'écart → **1,8 à 2,8 %** sur huit graines |
| « les assets les plus importants gardés par des gardes assez forts » | **fait** | la garde se dose par l'anneau (proximité du départ) ET par le poids de ce qu'elle garde. Zéro artefact nu, gisement d'or à 18 900 de puissance, scierie à 1 700 |
| « difficulté bien dosée selon la proximité du départ » | **fait** | médiane de garde par distance : 1 176 sous 12 cases, 3 103 de 12 à 25, 8 400 de 25 à 45 — monotone, ce qu'elle n'était pas |
| « drapeaux de couleurs sur les assets pris » | **fait** | pavois + cocarde au sol, sur les sept genres que le moteur fait changer de main ; taille ramenée de 0,74 à 0,46 fois le lieu après lecture d'une capture |
| « en cliquant, une indication de force, d'unités et de difficulté » | **fait** | fiche d'inspection : paquets flous à neuf crans, fourchette de force, appréciation de difficulté, jugée sur l'armée du héros courant |
| « améliorer grandement la représentation de chaque créature » | **en cours** | les quatorze humains resculptés (visages, articulations, gestes) ; les bêtes en cours |
| « zones bien délimitées visuellement, beaucoup de détails » | **commencé** | douze pays avec teinte, densité et signature de décor ; quatre silhouettes bâties tirées de l'atlas où elles dormaient. Le SOL reste procédural et sans matière : c'est la vague 3 d'ImageGen (`docs/10-BRIEF-IMAGEGEN-VAGUE-3.md`) |

**Et deux défauts de fond que la chasse a levés, tous deux invisibles sans
mesure :**

1. **Une place gardée se traversait.** L'entrée d'un lieu est franchissable
   pour qu'on puisse le visiter — mais elle l'était aussi pour le TRANSIT, et
   les postes de garde sont posés exprès sur les transitions de voie. Un héros
   qui longeait une route se retrouvait donc en combat en allant ailleurs.
   Mesuré sur une partie qui s'endormait : **soixante-quatre combats livrés,
   zéro gagné**, héros resté au niveau 2 après quatre cent cinquante jours.
   L'IA ne jugeait pas mal ses combats : elle ne les choisissait pas. Depuis
   qu'une place gardée bloque le transit — la règle de HMM3, où un monstre
   errant bloque sa case —, **les parties réglées par conquête passent de 2/20
   à 17/20**.
2. **Une place assiégée prenait toute l'armée.** `garrisonTarget` faisait
   `min(totalPower, threat)` : dès qu'un ennemi aussi fort passait dans le
   rayon de vigilance du profil — vingt-sept cases pour le prudent —, la maison
   verrouillait tout dans ses murs, des deux côtés en même temps. Plafonné aux
   trois cinquièmes.

**Ce que la mesure a démenti** : la trame hexagonale du champ de bataille
paraissait invisible sur capture. Mesurée, elle vaut +44 de luminance sur le
sol d'une sapinière : c'est la réduction de l'image pour l'examen qui mangeait
les traits de 1,2 pixel. Rien à corriger.

## 1 septies. Session du 20/08 (soir) — le sol, les mines, le combat

**Le fil de cette session : ce qui était LIVRÉ mais que personne ne LISAIT.**
Trois fois le même mode de panne, et il ne s'est jamais annoncé.

### Le sol de la carte

Six pinceaux de terrain peints dormaient dans `public/img/terrain/`, déclarés au
manifeste depuis la première vague, et n'étaient lus que par le champ de
bataille. Le sol de la carte d'aventure — cent pour cent de l'écran pendant
toute une partie — était peint sans une seule matière peinte.

`apps/client/src/art/matiere-sol.ts` fait le raccordement. La tuile n'est pas
posée comme une couleur mais comme un **écart relatif à sa propre moyenne**, par
canal, appliqué en multipliant après l'ombrage. Conséquences : la couleur
moyenne du sol ne bouge pas (le gradient d'altitude, la teinte de pays et
l'étalonnage survivent), la loi de lumière unique garde la main, et les
événements de teinte passent quand même. La tuile est lue à la position **déjà
gauchie** qui sert aux lisières : les frontières de matière serpentent et le
pavage est tordu, donc la répétition ne fait pas de lignes droites.

**Le premier raccordement ne servait à rien, et il a fallu une mesure pour s'en
apercevoir.** Les douze pays nomment tous une variante d'`herbe` ; les tuiles de
pays n'étaient pas encore livrées ; le peintre demandait `herbe_estive`, ne
trouvait rien, et laissait la case SANS matière — presque toute la carte. Le
journal disait « 6 chargées », la capture montrait le même grain qu'avant, à un
centième près. Le repli vit maintenant dans le registre (`BASE_DE_PAYS`) et un
test simule l'état de livraison réel pour l'exiger. Après correction, même scène
et même caméra : **62 % des pixels changent**, écart moyen 5,1 niveaux.

Codex a livré la vague 3 dans la foulée : **les douze tuiles**, dont les six de
pays, sous les clefs exactes. Les douze cantons ont donc chacun leur sol peint.

### Les panoramas de combat, même piège

La vague 3 a aussi livré six panoramas de 1024 × 640 (`combat_prairie`,
`combat_foret`…), et la catégorie `combat` n'existait même pas dans le type du
chargeur. Ils sont branchés dans `battle/field.ts`, **entre la rampe de biome et
les nappes** : l'image apporte la matière, le code garde la lumière — un
panorama posé par-dessus les neuf strates aurait effacé l'étalonnage et donné un
sol qui s'éclaire à l'envers des figurines. Une ambiance de plus au passage, les
**hautes chaumes**, qui couvrent 7,4 % de la carte et se battaient dans un pré.

Et un test qui interdit la récidive : **tout panorama livré au manifeste
qu'aucune ambiance n'emploie fait rougir la suite**, et ne peut être tu qu'en
l'inscrivant nommément avec sa raison. Vérifié ensuite pour TOUTES les clefs du
manifeste : les 197 entrées sont consommées, `bati_*` et `ressource_*` compris
(clefs construites dynamiquement, donc invisibles à un grep naïf).

### Les mines — la demande la moins tenue des dix

La carte rendait **trois essences par jour contre quatorze fers**. L'essence est
toute l'économie rare de l'Ermitage comme le fer est celle du Granit. Trois
causes cumulées : essence et fil d'or étaient les seuls gisements de la carte à
rendre 1 au lieu de 2 ; il n'y en avait que trois et deux ; et les quatorze
gisements tirés au sort prenaient leur ressource dans la table des TAS, où
`ecus` pèse 26 sur 100 et était reversé au fer — le fer récoltait 40 % des
filons, l'essence 6 %.

Pire : **deux capitales sur cinq ne pouvaient pas jouer une des deux maisons.**
La Renaudie trouvait son essence à 59 cases et son sel à 112 ; Viscomtat son fer
à 40 et son fil d'or à 55. Or la faction n'est jamais imposée par la géographie :
le joueur la choisit. Il choisissait à pile ou face sans le savoir.

| | avant | après |
|---|---|---|
| essence, par semaine et par carte | 21 | **110** |
| fer | 98 | 105 |
| fil d'or | 28 | 63 |
| sel | 35 | 68 |
| pire éloignement d'une capitale à une ressource rare | 112 cases | **32** |
| écart économique entre le plus riche et le plus pauvre départ | — | 1,89 % |
| paires d'assets trop proches | — | 0 |
| duel de validation | 19/20 | **19/20**, conquêtes 19/20 |

La Filature de Bise était par ailleurs à DIX cases de l'Atelier des Grenadières,
sous les quatorze que la table d'espacement déclare elle-même. Elle est descendue
à Augerolles, ce qui donne du fil d'or au sud par la même occasion.

### Le verrou de version de la carte

La carte n'est **pas enregistrée** : elle est reconstruite par `buildWorld(graine)`
à chaque chargement. Déplacer neuf gisements change donc le sol sous une partie
en cours, et les identifiants d'objets de l'état ne désignent plus rien. Le seul
garde-fou était `MAP_VERSION`, et `versionsCompatibles` ne compare que le
MAJEUR : passer de 1.0.0 à 1.1.0 aurait été déclaré compatible. D'où
**`2.0.0-forez`**, la règle écrite à côté de la constante, et un verrou testé —
une empreinte du monde semé sur trois graines, qui tombe dès qu'un objet bouge
d'une case. **Si ce test rougit, monter le majeur DANS LE MÊME COMMIT.**

### Le combat, enfin jouable comme HMM3

Trois défauts de fond, tous mesurés, tous corrigés :

1. **Personne ne jouait le camp adverse.** `chooseCombatAction` n'avait qu'un
   seul appelant dans tout le dépôt : `autoResolve`. Quand une pile de gardes
   neutres devenait active, le joueur humain devait la jouer LUI-MÊME. La vue
   fait maintenant jouer le moteur après un délai FIXE de 520 ms (fixe, parce
   que le combat est déterministe).
2. **Cliquer un ennemi non adjacent ne faisait rien.** Le client émettait
   `{kind:'attack'}` sans `from` ; `doAttack` refusait, et l'erreur s'affichait
   hors du champ de bataille. Le geste fondateur de HMM3 — cliquer l'ennemi,
   marcher, frapper — était absent alors que le moteur le supportait et que
   l'IA s'en servait.
3. **L'aperçu mentait pour tout assaut demandant un déplacement.** L'angle de
   flanc, l'angle de dos, la riposte conditionnelle et la charge étaient
   calculés depuis la case COURANTE. Mesuré : le dos valait 2000 BP et la charge
   2500 BP de plus que l'annonce, et le coup réellement porté sortait au-dessus
   du maximum affiché. `damageRange` prend désormais `fromHex` et
   `chargeHexes` — contrat, repli et `docs/02-API.md` alignés — et la riposte
   est **chiffrée**, en ne faisant riposter que les survivants.

### Ce que la mesure a démenti, cette fois encore

- Le sol paraissait taché de **grandes nappes jaunes qui se lisaient comme un
  défaut d'éclairage**. Mesurées : c'est le biome `lande` (teinte 48°, clarté
  108) contre la forêt (124°, 64). C'est du TERRAIN, pas de la lumière. Rien à
  corriger, et les tuiles de chaume lui donneront sa matière.
- L'aperçu de carte de « Nouvelle partie » paraissait trop sombre. Le peintre
  est **29 % plus clair** que le jeu : le canevas était simplement effacé par
  React après avoir été peint.
- La première tentative de mesure du grain du sol n'a rien montré parce que ses
  fenêtres tombaient sur des **sapins**, pas sur du sol nu. Choisir la fenêtre
  la plus PLATE de la capture d'avant règle le problème.

## 1 octies. Fin de la session du 20/08 — la vague 3, le partage, et ce qui reste

### Le défaut que le propriétaire a vu en production

« La dernière version n'affiche rien à l'écran sur la carte. » Reproduit deux
fois, sur bureau et sur iPhone, dans une vraie partie à deux bannières servie
par le vrai binaire. **Deux défauts se cumulaient**, et aucun n'était un défaut
de rendu :

1. `CADRAGE_DEMO` — la Maison du Trésor — était passée en `focus` sans
   condition, à la démonstration comme à la partie. Le joueur regardait un
   territoire jamais exploré, brouillard complet : un aplat bleu nuit. La
   légende l'avouait en toutes lettres et personne ne l'avait lue.
2. Une partie en ligne ne survivait pas à un rechargement : la reprise
   n'essayait que la sauvegarde LOCALE, que le mode en ligne n'a pas.

**La leçon de méthode** : les deux se voient en trente secondes dès qu'on ouvre
une vraie partie en ligne dans un navigateur. Le harnais de capture ne va que
sur `#/demo/*`, où le cadrage de démonstration est correct par définition et où
il n'y a pas de brouillard. Une scène de capture sur une partie EN LIGNE
manque encore au harnais ; en attendant, le script de sonde est décrit ci-dessous.

### Comment reproduire une vraie partie en ligne, en une commande

Le parcours est monté par l'API — c'est le salon, déjà éprouvé — puis on ouvre
deux navigateurs munis de leurs jetons. `tools/e2e-en-ligne.mjs` fait exactement
cela et vérifie la boucle de jeu ; pour REGARDER l'écran plutôt que le vérifier,
copier ce script et y ajouter `page.screenshot`. Les trois moments qui comptent :
après le clic sur « Entrer dans la partie », après un `page.reload()`, et sur
`#/partie` ouvert à froid.

### La vague 3 est entièrement consommée

197 entrées au manifeste, **zéro orpheline** hors `combat_pont`, qui est déclarée
inemployée avec sa raison dans `battle/field.ts`. Un test général
(`art/manifeste.test.ts`) reconstruit toutes les clefs que le client sait
réclamer depuis les tables réelles et fait rougir la suite pour toute image
livrée que personne ne charge. Les six validateurs de Codex sont verts, dont
`validate_wave3_runtime.mjs` : **197 images chargées en 1371 ms, zéro abandon,
zéro avertissement de repli, zéro erreur console**.

### Le teaser

Emplacement produit retenu : la **carte de partage du lien** (Open Graph +
Twitter), et un rappel dans le panneau de partage du salon. C'est le seul
emplacement naturel — le jeu se partage par une seule adresse, donc quatre
joueurs sur cinq voient le Forez pour la première fois dans leur messagerie.
Deux pièges gardés par des tests : l'adresse doit être ABSOLUE (le serveur la
rend absolue à partir de l'hôte de la requête, aucun domaine en dur) et les
dimensions DÉCLARÉES, faute de quoi un client rogne — et tout rognage coupe le
titre, un visage ou l'un des trois noms de lieux.

### Quatre impressions visuelles que la mesure a REFUSÉES

Ce paragraphe vaut autant que la liste des correctifs : chaque fois, j'étais sur
le point de « réparer » quelque chose qui allait bien.

1. **« Le sol se lit comme un défaut d'éclairage. »** Les grandes taches claires
   et sombres sont le biome `lande` (teinte 48°, clarté 108) contre la forêt
   (124°, 64). C'est du TERRAIN et du relief.
2. **« C'est la dérive basse fréquence (`nappe`) qui fait ces taches. »** Coupée,
   puis recapturée : l'écart entre blocs de 64 pixels passe de 28,14 à 28,86 —
   c'est-à-dire rien. Le terme n'y est pour rien.
3. **« Le brouillard laisse deviner le réseau de routes. »** Mesuré sur la
   capture d'une vraie partie : en territoire jamais exploré, la structure
   résiduelle vaut 3,0 à 3,4 d'écart-type contre 20,8 en terrain vu, soit une
   amplitude de ±7 niveaux sur une base de 41. Le voile à 0,92 fait exactement
   ce que son en-tête annonce. Rien à corriger.
4. **« La Dame au Fil d'Or reste une masse rouge. »** À trois fois la taille de
   la vignette : coiffe blanche, robe, surcot galonné, bannière, bras tendu
   tenant sa fusée. Elle se lit. C'était la planche réduite qui mentait — la
   même erreur que pour la trame hexagonale du champ de bataille.

**La règle qui en sort** : une impression tirée d'une planche RÉDUITE n'est pas
une mesure. Recadrer à trois fois la taille, ou mesurer, avant de toucher.

### Ce qui reste, honnêtement

| Ce qui reste | Ce qui est mesuré |
|---|---|
| **Les deux Colosses** restent les plus schématiques des vingt-huit | corrigés d'un cran : rapport du plus petit au plus grand rayon d'une pierre porté de 1,6 à 2,1 (un pentagone presque régulier était un galet), et groupement de valeurs de −30 % à +34 % selon la place de la pierre dans le membre, là où toutes recevaient le même ton à six pour cent près. Vérifié sur capture avant/après. Reste que la silhouette est un empilement, et qu'aller plus loin demanderait une autre approche, pas une meilleure pierre. Ils vivent dans `ermitage.ts` (`ermitage_t6`/`_up`, PAS des créatures de Granit — j'ai fait l'erreur, un agent l'a corrigée par la mesure) |
| **Le zoom large** laisse du vide à côté d'une carte en portrait sur un écran en paysage | 113 × 184 sur 1920 × 1080 : le vide est géométrique. Relever le plancher de zoom réglerait l'un et coûterait l'autre — arbitrage à demander au propriétaire |
| **L'asymétrie des capitales** 44 / 20 / 20 / 8 / 8 % | deux hypothèses mesurées et éliminées (richesse, accès aux bourgs neutres). Décrit honnêtement dans l'écran de nouvelle partie plutôt que masqué |
| **`combat_pont`** livré et inemployé | `CombatState` ne porte aucune coordonnée de carte : impossible de savoir qu'on se bat sur un franchissement |

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

**P0.4 — Lots 1.8 + 1.9 : le relief ferme, les cols ouvrent. ✅ CLOS.**
Voir §1 quinquies pour le récit et les chiffres. En deux mots : les cinq crêtes
du relief et cinq chaînes de partage sont murées (`packages/map/src/barrieres.ts`),
le masque est calculé avant `buildRoads` et lui sert de pénalité, chaque crête est
percée de deux cols choisis aux minima d'altitude. Infranchissable 15,49 % pour
une cible de 12 ; coupe entre capitales de 3 à 5 pour une cible de 6 ; composante
unique ; densité, cantons vides et glanage inchangés. Les seuils sont tenus par
`apps/worker/src/carte.test.ts`, qui exige désormais les cibles du plan et non
plus un plancher de non-régression.

*Ce qui reste à surveiller de ce chantier :* trois crêtes du relief passent par
une capitale — Arconsat, Cervières et La Renaudie sont posées SUR leur crête, ce
qui est fidèle mais perce le mur par construction. Leurs murs plafonnent donc
autour de la moitié de leur axe (`▸ Murs de crête` au tableau de bord). Si l'on
veut resserrer encore la coupe, c'est là qu'il faut regarder, et la réponse sera
du contenu — une chaîne de plus — non un réglage.

### P1 — la fidélité visuelle

**P1.5 — Lot 2.2 : rampes du champ + soleil de l'atlas. ✅ FAIT, et les lignes
de l'audit ci-dessus sont périmées.** Les rampes du sol sont tenues par
`apps/client/src/battle/rampes.test.ts` (luminance moyenne ≥ 95, mesurée sur la
rampe complète), et l'angle d'éclairage est tenu par `art.test.ts > loi n°2`, qui
ne vérifie pas « 45 » mais que l'angle SE DÉDUIT du soleil déclaré et qu'aucun
fichier d'art n'en passe plus en dur.

*Ancien libellé, conservé pour mémoire :*
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

**P1.7 — Lot 2.6 : resculpture des créatures. COMMENCÉ.** Les 28 rendus de
référence sont dans `docs/reference/creatures/renders` (non embarqués).

*L'instrument d'abord, et c'est ce qui bloquait tout* : la planche de contact
plafonnait l'échelle de chaque bête à 1, donc une créature plus petite que sa
case y restait à sa taille natale — vingt-huit sculptures jugées sur des
vignettes de cinquante pixels. C'est réparé, et le décor aussi, dont les
variantes débordaient sur trois cases parce que l'échelle se calculait sur la
boîte de dessin au lieu de la texture. **Toute revue de créature commence
maintenant par une capture de `planche_art`, en iPhone pour la vue d'ensemble et
en bureau pour le détail de la première rangée.**

*Repris :* l'aile emplumée (éventail de dix rémiges depuis le poignet, rachis
visible, liseré sur les trois dernières — vaut pour les griffons et les
chouettes), la seconde aile qui manquait à toute bête volante alors que
`clipsVolant` l'animait déjà, la pose d'aile (à l'épaule et relevée pour un
griffon, au flanc et à plat pour un oiseau), les couleurs des griffons (ardoise
et or ; ils étaient les seules bêtes ivoire de la Châtellenie), le garrot et la
barde des sangliers (les plaques étaient bleues et ne couvraient que l'échine),
la crête de poils du loup sur toute l'échine, et la maçonnerie des colosses
(`blocPierre` dessinait un galet lissé, un colosse en est fait sept fois).

*Restent frustes, dans cet ordre :* les vouivres (rang 7 de l'Ermitage, les plus
visibles), les humains de la Châtellenie — silhouettes très simples, un chapeau
et un tronc —, les deux curés, le veneur. La méthode qui a marché : ouvrir le
rendu de référence, nommer en une phrase CE QUI FAIT la bête (le garrot du
sanglier, la crête du loup, la maçonnerie du colosse, l'éventail de l'aile),
corriger cela seul, recapturer.

### P2 — l'endgame

**P2.8 — Simulation d'équilibrage (3.1). Les deux cibles chiffrées sont
TENUES**, et la troisième inquiétude était un artefact de mesure.

- *Expert contre prudent :* 13/20 sur les graines du test, **43/60 sur soixante
  graines, soit 71,7 %** — dans la fourchette 60-85 % des plans. Le 65 % qu'on
  lisait était un artefact d'échantillon : sur vingt parties, l'écart-type
  binomial vaut deux parties entières.
- *Durée médiane :* la cible est « ≥ 6 semaines » et l'on en est à **132 jours de
  médiane**, soit dix-neuf semaines. C'est un minimum, pas un maximum : rien à
  corriger de ce côté.
- *« La moitié des parties ne conclut pas » :* faux, et c'est le plafond de tours
  du harnais qui le faisait croire. À 700 tours au lieu de 320, **huit parties
  sur dix se règlent par conquête**. Le plafond existe pour tenir le duel sous
  son propre délai, pas pour mesurer le jeu.

*Et l'une des deux parties qui ne se tranchaient pas a été réglée.* La cause
n'était aucune de mes hypothèses : `garrisonTarget` calculait la part de garnison
PAR CITÉ sur la puissance totale de la maison, si bien que la fraction
immobilisée croissait avec l'empire — un expert à six cités en verrouillait 52 %
de son armée, à dix cités 82 %. **Plus il conquérait, moins il pouvait
conquérir.** La part est maintenant répartie entre les cités, la capitale
comptant double ; un joueur à une seule cité retrouve exactement sa valeur
d'avant, donc la tortue reste une tortue. Mesure : conquêtes 8/10 → **9/10** au
plafond de 700 tours, durée médiane 132 → 122 jours, duel 13/20 → **14/20 (70 %)**,
conquêtes dans le duel 10/20 → 11/20. Verrouillé par
`packages/bots/src/garnison.test.ts`, éprouvé en rétablissant l'ancienne formule.

*Ce qui reste, et c'est une seule partie sur dix :* la graine 48514, où l'expert
livre quatre-vingt-dix-huit combats pour une seule cité, deux gisements et un
héros resté au niveau quatre. Trois pistes sont déjà écartées par la mesure : ce
n'est pas la carte (chemin de trente-quatre pas vers la dernière capitale,
existant), ce ne sont pas les gardes (**99 % de terre libre depuis chaque
capitale sans livrer un combat**, mesuré par le tableau de bord), et ce n'est plus
le plancher de garnison. Chercher du côté de la reconstitution d'armée après une
défaite : un héros au niveau quatre après quatre-vingt-dix-huit combats meurt et
recommence.

*La partie à CINQ bannières, mesurée le 20/08 — et c'est le mode que les cousins
joueront :* `pnpm sim --players 5 --games 5`, plafond 900 tours.

- **5 parties sur 5 décidées par un vainqueur**, durée moyenne 208 jours ;
- un sceau levé dans les cinq parties (le premier vers le jour 71 à 105) ;
- et la cinquième s'achève par une **vraie conquête** — « dernière bannière
  debout », l'expert élimine ses quatre rivaux en 148 jours avec sept cités.
  C'est la première fois : la note d'audit disait « aucune conquête achevée à
  cinq bannières » ;
- éliminations nombreuses dans toutes les parties (trois bannières sur cinq
  éteintes en partie 4), donc la conquête mord réellement ;
- réflexion de l'IA : **52 ms en moyenne, pire tour 232 ms** — le brief accorde
  400 ms en début de partie et 1,5 s en fin ;
- zéro commande refusée au rejeu.

Victoires par profil sur ce petit échantillon : expert 4/7, équilibré 1/6,
agressif 0/6, prudent 0/6. C'est un classement de profils, pas la mesure du
document maître.

*Ce qui reste vraiment non mesuré :* le taux de victoire par CAPITALE en partie à
cinq (cible 18 à 22 % chacune, §20.3). Il faut une centaine de parties pour que
le chiffre veuille dire quelque chose, soit près de deux heures et demie de
simulation — c'est faisable, mais ce n'est pas cinq parties.

*Ancien libellé, conservé pour mémoire :* Après P0.1 : `pnpm sim`
20 parties × 3 graines ; ajuster revenus/coûts/croissance jusqu'aux cibles
(durée médiane ≥ 6 semaines ; win-rates par capitale dans une fourchette
raisonnable ; expert vs prudent 60-85 %).

**P2.9 — Revue adversariale finale (3.2).** Les trois scènes jamais capturées
l'ont été (voir §1 quinquies) ; le diagnostic y a laissé deux défauts, corrigés.
Reste la comparaison côte à côte avec de vraies captures HMM3, scène par scène.

**P2.10 — Capture de la carte densifiée. ✅ FAIT.** Regardée après les barrières,
en jeu et en image de structure (`carte-image.ts`). Le massif se tient : vallées,
cols, réseau de routes qui les emprunte. Un défaut trouvé et corrigé au passage —
la roche infranchissable ne portait de décor qu'une case sur trois, et ce décor
était un bloc de 0,86 case : une chaîne de montagnes rendue comme une brume grise
semée de cailloux, où le joueur ne pouvait pas voir où il ne pouvait pas aller.
D'où l'**aiguille de granit**, quinzième décor, semée sur 82 % du rocher et de la
falaise.

**P2.11 — Déploiement Railway.** `tools/deployer.sh`. Token DANS
L'ENVIRONNEMENT seulement ; exiger la rotation préalable (compromis).
Après déploiement : re-vérifier le multijoueur asynchrone en production et
l'iPhone réel (zoom compris).

**C'est le premier point de la liste par la valeur, et le seul qui ne dépende
pas de nous.** `RAILWAY_TOKEN` n'est pas dans l'environnement de la session du
20/08 : rien ne peut être déployé d'ici. Or la version en ligne précède TOUT ce
qui a été fait depuis la passation — le correctif du gel de partie compris, donc
le jeu déployé gèle encore deux parties sur quatre, et les cousins joueraient
cela. Il faut, dans cet ordre : que le propriétaire fasse tourner le jeton (il
est compromis), qu'il le pose dans l'environnement de la session, puis
`tools/deployer.sh`. Penser aussi à définir `RAILWAY_GIT_COMMIT_SHA`, faute de
quoi `/health` annonce « commit inconnu » et l'on ne sait pas ce qui tourne.

## 3. Détails d'état utiles

- Branche : `claude/hmm-auvergne-game-uesdlz`. Jamais pousser ailleurs.
- Graine de démonstration : 20250816. Grille **113 × 184** (une XL de HMM3).
- `pnpm carte` (via `npx tsx apps/worker/src/carte.ts`) : le tableau de bord
  de la carte. Dernier état : **457 objets, une case sur 36, glaneur 3,8/j, 0 bloc
  vide, composante 1, infranchissable 15,49 %, coupe entre capitales 3 à 5,
  32 postes bloquants sur 56 gardes**. Et `npx tsx apps/worker/src/carte-image.ts`
  pour voir la structure en image.
- Les améliorations de demeures REMPLACENT visuellement leur demeure
  (même emprise, +12 d'échelle, peinture de la demeure) — `masse.ts`,
  `visiblesDe`. Toute retouche du tableau de cité passe par
  `apps/client/src/town/masse.ts` (géométrie partagée vue/test).
- Le test `plan-de-masse.test.ts` mesure la couverture aux cadres réels ;
  seuil 70 %, mesuré 80,5-92,2 %.
- `docs/08-PLAN-AAA.md` reste le plan de référence (périmètres exclusifs,
  acceptations mesurables) ; `plan.md` §1 l'état d'avancement ligne à ligne.
