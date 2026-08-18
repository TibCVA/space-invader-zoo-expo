# Plan — Heroes of Might and Magic : Auvergne Edition

Plan vivant du projet. Mis à jour à chaque lot. Les règles détaillées vivent dans
`docs/` ; ce fichier dit **où on en est** et **ce qui vient ensuite**.

En ligne : **https://auvergne-web-production.up.railway.app**

---

## 0. Directive permanente — génération d'images

> **Pour tout ce qui relève du bitmap, de la texture ou du sprite — et chaque fois
> qu'une maquette de référence aiderait à sculpter un rendu — utiliser un outil de
> génération d'images plutôt que de tout dessiner à la main en vectoriel.**

C'est la condition d'un rendu réellement AAA : le vectoriel procédural est excellent
pour l'interface, les icônes et les silhouettes, mais il plafonne sur la matière —
peau, écorce, pierre, feuillage, visages.

**Répartition du travail au 18/08/2026.** Aucun outil de génération d'images n'est
disponible dans la session Claude Code (recherche sous `ImageGen`,
`generate_image`, `image_gen`, `CreateImage` : aucun résultat ; les sous-agents
héritent du même jeu d'outils). **Les images sont donc produites par Codex**, qui
en dispose. Claude Code fournit le contrat, le chargeur et l'intégration.

| Qui | Quoi |
|---|---|
| **Codex** | produit les bitmaps et les dépose sous `apps/client/public/img/` avec `manifeste.json`, en suivant **`docs/05-ASSETS.md`** |
| **Claude Code** | contrat, chargeur, intégration, revue visuelle, redéploiement |

**Le tuyau est prêt et testé** : `apps/client/src/art/assets.ts` lit
`public/img/manifeste.json` au démarrage et remplace les entrées d'atlas
correspondantes. Une image absente, un chemin dangereux, une dimension absurde ou
un budget dépassé sont ignorés avec un avertissement, et le rendu procédural reste
affiché — **le jeu ne dépend jamais d'un asset**. Manifeste vide aujourd'hui,
toléré sans erreur console. 7 tests verrouillent ce comportement.

Clefs exactes, tailles, priorités, style et budget : **`docs/05-ASSETS.md`**.
Règles de style détaillées : `docs/01-ART-BIBLE.md` §0.

---

## 1. État d'avancement

| Bloc | État | Preuve |
|---|---|---|
| Socle monorepo, contrat de données, PRNG déterministe, hash d'état | **fait** | 615 tests |
| Moteur — noyau (tours, économie, mouvement, A\*, brouillard) | **fait** | A\* 42 ms, hash reproductible |
| Moteur — combat hexagonal (initiative, dégâts, capacités, sièges, IA) | **fait** | bataille auto < 1 s |
| Moteur — monde (progression, artefacts, objets, météo, gabelle, victoire) | **fait** | |
| Contenu (28 créatures, 21 héros, 32 sorts, 20 compétences, 54 bâtiments, 53 artefacts) | **fait** | `validateContent()` vert |
| Carte du Forez (relief réel 474–1263 m, hydrographie, routes, 12 régions) | **fait** | ancrages à < 1 case |
| Serveur + sauvegardes PostgreSQL (repli fichier et mémoire) | **fait** | en ligne, `base: postgres` |
| Art procédural (atlas, 28 créatures gréées, props, icônes, effets) | **fait** | 929 modules |
| Design system + 21 portraits | **fait** | 21 portraits peints d'ImageGen raccordés aux écrans DOM |
| Audio génératif WebAudio | **fait** | |
| Page d'accueil | **fait** | fond peint natif en paysage et en portrait ; les 8 défauts procéduraux tombent avec la scène qu'ils affectaient |
| Coquille client (routage, état, sauvegarde auto, écrans) | **fait** | 21 routes, 0 erreur console |
| Déploiement Railway | **fait** | 43 images servies, PostgreSQL connecté, CSP stricte conservée |
| Images générées (43, 4,19 Mo) | **fait** | 43 clefs sur 43 valides ; portraits et accueil raccordés |
| Blocage Chrome / Edge (`unsafe-eval`) | **corrigé** | vérifié sous la vraie CSP du serveur |
| Gel du chargement à 30 % sous la CSP (worker `blob:`) | **corrigé** | 6 gels sur 6 avant, 0 sur 6 après — voir §1 quinquies |
| Carte et cité vides sur iPhone | **corrigé, marge inconnue** | confirmé sur l'appareil, en production ; reste à relever la trace de montage pour savoir si cela passe confortablement ou de justesse (§1 quinquies) |
| Raccordement des matières | à faire | 8 matières livrées, sans consommateur |
| Rendu de la carte d'aventure | **fait, à polir** | saturation 18,93 → 29,15 % (§1 sexies) ; restent les traînées laiteuses, les forêts répétitives, le panneau sur la minicarte en portrait |
| Dégradés obliques (aplat sous pixi 8.19.0) | **corrigé** | 30 cas sur la vraie fonction, vérifié contre la source de pixi — voir §1 sexies |
| Rendu du combat | **fait, à corriger** | le sol a perdu 19,0 de luminance et 4,0 points de saturation depuis que les dégradés peignent : rampes de `field.ts` à ré-étalonner (§2.3) ; vide de 35 % en portrait |
| IA + parties complètes | **fait** | 20 parties IA contre IA jouées ; 0 commande refusée au rejeu ; réflexion médiane 154 ms, p95 219 ms (budget 400) |
| Conquête des lieux gardés | **corrigé** | voir §1 ter — c'était le défaut le plus grave du projet |
| Écrans de cité (2 tableaux en parallaxe) | **en cours** | panorama, porte, emplacements et survol en place ; **les bâtiments bâtis sont des blocs gris plats**, à reprendre |
| Multijoueur asynchrone | **fait et jouable** | parcours complet vérifié dans un vrai navigateur, deux contextes, contre le vrai serveur (voir §1 quater) |
| Boucles de critique visuelle | partiellement | les sous-agents refonctionnent ; revue par capture appliquée aux cités |
| Équilibrage par simulation de masse | à faire | l'outil existe (`pnpm sim`, `pnpm balance`), le réglage reste à faire |

## 1 bis. Anomalie de performance mesurée (non résolue)

Les scènes PixiJS s'effondrent à **1–2 images par seconde** dans l'environnement
de développement, alors que les écrans DOM tiennent 60 fps.

| Condition (route `#/demo/combat`) | images/s |
|---|---|
| 1280 × 654 | 2 |
| 320 × 180 — 16 fois moins de pixels | 6 |
| scène masquée (`stage.visible = false`) | 60 |
| planche d'art **statique**, toutes tailles | 1 |

Ce que ces mesures établissent : le coût est dans le **rendu de la scène**, pas
dans la logique de mise à jour (60 fps scène masquée), et il ne diminue que d'un
facteur 3 pour 16 fois moins de pixels — donc il tient surtout au nombre et à la
complexité des objets, pas au remplissage.

Ce qu'elles n'établissent pas : **ce conteneur n'a aucun GPU** ; Chromium y rend
en logiciel (SwiftShader). Le chiffre observé sur une vraie carte graphique peut
être tout autre. Aucune conclusion ne doit être tirée sans mesure sur une machine
réelle.

Comptes d'objets vivants relevés : combat 751, planche d'art 2 290,
**carte 21 657** — ce dernier est manifestement trop élevé et mérite un
regroupement des décors en sprites cachés.

Sonde disponible en console : `__auvergne.compter()` et `__auvergne.app`.

Piste privilégiée quand la mesure sera faite sur machine réelle : mettre en
cache les sous-arbres statiques (`cacheAsTexture`) — champ de bataille, barre
d'initiative, carte de prévisualisation, semis de décor de la carte — plutôt que
de les retesseller. Non appliqué à ce stade : modifier du code de rendu qui
fonctionne, sans pouvoir vérifier le gain sur GPU, ferait courir plus de risque
que de bénéfice.

## 1 ter. Le monde était inconquérable — corrigé le 18/08

Mesure de départ, sur vingt parties complètes à quatre bannières :
**zéro gisement, zéro Sceau des Marches, zéro cité gardée pris**, par qui que ce
soit, en douze semaines. Toutes les parties se réglaient au score de fin de
chronique, et le profil d'IA le plus immobile l'emportait quinze fois sur vingt.

Deux causes indépendantes, l'une dans le moteur, l'autre dans l'IA.

**La garde d'un lieu ne tombait jamais.** `CombatState` ne décrit le camp
défenseur que par un joueur, un héros et une cité : devant la garde neutre d'un
gisement, les trois valent `null` et le lieu n'apparaît nulle part.
`resolveCombatOutcome` rendait donc son armée au vainqueur, garnissait une cité
prise, distribuait l'expérience — et laissait la garde intacte. Le gisement se
relevait au complet au tour suivant. Une bataille rapportait de l'expérience et
des dépouilles, mais ne prenait rien. `applyCommand` relève désormais, avant la
résolution qui efface `state.combat`, quel lieu était défendu ; il lui rend ses
survivants, puis laisse le vainqueur en prendre possession sur-le-champ.

**Un pont rendait le logis infiniment lointain.** `TERRAIN_COST.eau` vaut
`Number.MAX_SAFE_INTEGER` — c'est juste pour le calcul de chemin, qui doit
refuser l'eau. Mais `travelEstimate` n'est pas un chemin : c'est une droite
échantillonnée pour classer des cibles à bon marché, et un pont est de l'eau
qu'on peut fouler. Un seul échantillon portait l'estimation d'un trajet de cent
cinquante cases à 4 × 10¹⁶, au-delà de `MAX_SAFE_INTEGER` ; `fallbackHome`, qui
retient la cité de coût *inférieur* à cette borne, rendait `null`. Un héros
dépouillé de son armée restait donc planté là jusqu'à la fin de la chronique,
pendant que sa capitale entassait vingt mille points de troupes.

| | avant | après |
|---|---|---|
| gisements pris par bannière | 0 | 1 à 2 |
| garnison de la capitale en semaine 8 | 21 638 | < 3 600 |
| héros de campagne en semaine 3 à 8 | armée vide, immobile | ressort réarmé tous les quinze jours |

Six tests verrouillent les deux correctifs, chacun vérifié non complaisant :
il tombe quand on retire la correction qu'il garde.

**Une mesure retirée.** On avait d'abord annoncé que le profil expert passait
de 20 % à 45 % de victoires. Ce chiffre ne veut rien dire et il est retiré : le
harnais indexait les départs *et* les profils sur le même `siège + rotation`.
Comme il y a autant de profils que de sièges, les deux roues tournaient au même
rythme et chaque profil restait soudé à sa place — le prudent a joué La Renaudie
vingt fois sur vingt. « Victoires par profil » et « victoires par position »
étaient deux lectures du même chiffre. Un décalage d'un cran par tour complet de
la roue des départs désolidarise les deux, et la mesure est refaite.

Le compte des gisements, lui, n'est pas touché par ce biais : il ne dépend
d'aucune comparaison entre profils.

**La mesure refaite**, vingt parties à quatre bannières, sièges désolidarisés
des profils :

| profil | victoires |
|---|---|
| expert | 9 / 20 — 45 % |
| équilibré | 8 / 20 — 40 % |
| agressif | 2 / 20 — 10 % |
| prudent | 1 / 20 — 5 % |

Le classement est enfin celui qu'on attend d'un jeu qui fonctionne : le profil
le plus fin gagne le plus souvent, le plus timoré le moins. Un Sceau des Marches
est levé dans 3 parties sur 20, contre aucune avant. Zéro commande refusée au
rejeu sur les vingt parties, réflexion médiane 119 ms.

## 1 quinquies. Le jeu se figeait à 30 % sous sa propre CSP

Le défaut le plus grave de la journée, trouvé par un module de cité qui
travaillait sur autre chose. **Toutes les scènes accélérées étaient
inaccessibles en production** — carte, cités, combat — bloquées pour de bon sur
« On peint les vingt-huit créatures… ». Six essais sur six sous le vrai binaire
du serveur, jamais un seul abouti.

PixiJS décode les images dans un *worker* fabriqué depuis une URL `blob:`. La
politique dit `script-src 'self'` sans mentionner `worker-src`, qui retombe donc
sur `default-src 'self'` et refuse `blob:`. Le worker n'est jamais créé, et la
promesse de `Assets.load` **n'est ni tenue ni rejetée** : elle reste en suspens
pour toujours. Aucun délai de garde ne la bornait — la règle « le repli
procédural n'est jamais retiré » ne tenait donc pas : il n'y avait pas de repli,
il y avait un gel.

Corrigé sans ouvrir la politique : décodage sur le fil principal
(`preferWorkers: false`, posé dans `main.tsx` avant tout le reste) et délai de
garde de dix secondes par image. Six essais sur six chargent désormais, en 8,7 s.

**Ce que le harnais doit en retenir.** Il servait le bundle par `vite preview`,
qui n'envoie aucune CSP. Deux pannes bloquantes ont déjà traversé ce trou :
`unsafe-eval` d'abord, ce worker ensuite. Les captures étaient vertes et le jeu
était inutilisable. `tools/screenshot.mjs` sert désormais par le binaire du
serveur, sous la politique réelle, à chaque capture.

**Confirmé sur le terrain le 18/08 au soir.** La carte et la cité s'affichent
maintenant correctement sur l'iPhone qui ne montrait rien — constaté par le
propriétaire de l'appareil, sur la production. C'était le symptôme rapporté
(« on ne voit rien sur la carte et pas grand-chose sur la cité »), et il a
disparu.

**Attribution — honnêtement incertaine.** Trois changements se sont succédé
entre le rapport et la confirmation, tous déployés : le décodage hors worker
(`82a446e`, seule des trois à être mesurée — six gels sur six avant, zéro sur
six après), puis `preferenceRendu` qui force `webgl` sur WebKit plutôt que de
laisser PixiJS tenter WebGPU, et le délai de garde porté à 25 s par image
(`6188626`). Le premier est de loin le plus probable : il frappait *toutes* les
scènes accélérées sous la vraie CSP, sur tous les navigateurs, et l'iPhone
était simplement le seul appareil testé. Mais les trois sont partis groupés et
**aucune mesure ne départage** — les six sondes de `#/diagnostic` passaient déjà
toutes lors des trois relevés, ce qui excluait la machine sans désigner le
coupable.

**Ce qui reste à vérifier, et pourquoi cela compte.** « S'affiche correctement »
ne dit pas *en combien de temps*. Avec un délai de garde de 25 s par image et
une carte qui crée ~17 900 objets, le téléphone peut très bien réussir de
justesse : un réseau un peu plus lent, et le défaut revient — chez les cousins,
pas ici. La trace de montage (`1e34f2d`, `sessionStorage`
`auvergne.trace-scene.v1`) enregistre durée, taille, nombre d'objets et erreur
par scène, et se relit dans `#/diagnostic`. **Un seul relevé après ouverture de
la carte suffit à distinguer « corrigé confortablement » de « passe de
justesse ».** Tant qu'il manque, tenir la marge pour inconnue.

## 1 quater. Le multijoueur, vérifié de bout en bout

Le service et le client ont été écrits séparément contre le contrat figé de
`packages/protocol/src/parties.ts`, puis confrontés au **vrai binaire du
serveur**, en HTTP, avec deux bocaux à témoins distincts. Onze étapes, toutes
conformes :

création → lien partageable · l'hôte prend une bannière · un second navigateur
en prend une autre sans jeton préalable · **aucun jeton d'autrui ne figure dans
le salon** · lancement · pouls · le joueur inactif reçoit **403 « En attente de
Thibaut »** · le joueur actif est accepté, la séquence passe de 3 à 4 et la main
change · **le rejeu de la même clef d'idempotence rend `rejeu: true` et la même
séquence** · une séquence périmée rend **409 avec l'état à jour joint** ·
`mes-parties` affiche « C'est ton tour dans une partie ».

Un trou de sécurité corrigé au passage : `Surrender` était accepté hors tour au
titre d'une exception de la spécification, or `applyCommand` lit
`state.activePlayer` avant d'entrer dans ce cas — **n'importe quel joueur
pouvait faire capituler n'importe quel autre**.

## 1 sexies. Les dégradés obliques ne peignaient rien — et la carte était lavée

Deux défauts distincts, tous deux établis par l'ablation puis contre-vérifiés
par un agent adverse chargé de les **réfuter**. Aucun des deux n'était ce que
le rapport interne annonçait.

**a) `degradeLineaire` posait un aplat à tout angle non multiple de 90°.** Pas
un « gris laiteux » : exactement la couleur d'un arrêt extrême, choisie par le
drapeau `flip` de PixiJS. Balayage de 16 angles, même rampe, même polygone :
écart-type 55,0 à 0° / 54,7 à 90° / 55,0 à 180° / 54,7 à 270°, et **0,00** à 1,
5, 15, 30, 45, 60, 89, 91, 118, 135, 315 et 359°. La RenderTexture, que le
rapport accusait, n'y est pour rien — mêmes chiffres à la deuxième décimale en
rendu direct. La cause est dans `FillGradient.buildLinearGradient` de pixi
8.19.0 : le facteur 256 de `textureSpace: 'local'` multiplie aussi le terme de
translation, que `generateTextureMatrix()` ne renormalise pas. Dès que la
matrice tourne, `u` sort de [0;1] — mesuré à −53,0 aux quatre coins à 45° — et
`clamp-to-edge` échantillonne le bord. Sept des quatorze dégradés de
`battle/**` étaient morts, dont les trois qui portent tout le modèle de valeur
du sol. Corrigé en `092e513`, vérifié analytiquement contre la source de pixi
puis sur 30 cas **de la vraie fonction exportée** : aucun aplat, sens correct
partout.

**b) La carte n'était pas ternie par un coupable unique.** Le classement par
ablation de 18 termes le montre : le brouillard de guerre ne pèse **rien**
(+0,01 en neutralisant le bloc entier du shader — il n'est pas actif sur cette
vue, les taches pâles sont les particules de brume de la météo), les décors
**ajoutent** 0,75 point, l'ombrage de relief en ajoute 2,20 et l'étalonnage
bleu des ombres 2,17. La perte venait de trois lavages successifs vers un blanc
crème appliqués **aux lumières**, puis d'une remontée d'exposition : gamma du
post-traitement (+3,13), `eclaircir(c, 0.12)` de `couleurBiome` (+2,37), rampe
d'altitude du biome (+1,69). Correctif combiné livré dans `6188626` — dont le
message ne le dit pas, ce qui a failli le faire passer pour perdu.

Mesure de la paire, région 1690×930, indicateur (max−min)/max, **reproduite
trois fois indépendamment à 0,01 point près** (auteur, agent adverse, fil
principal) : saturation moyenne **18,93 % → 29,15 %**, médiane 17,33 → 29,51,
à luminance constante (91,8 → 90,7) et contraste légèrement meilleur. Surtout,
l'**inversion signature** est corrigée : les lumières titraient 18,62 % contre
22,41 % pour les ombres — une carte peinte fait l'inverse — et passent à
34,18 % contre 27,01 %. Le sol ensoleillé du sud-ouest, le « 12–15 % » du
briefing, passe de 15,04 à 29,01 de médiane. Bruit de fond du harnais, mesuré
sur deux tirages du même code : 0,01 point. Le gain vaut mille fois le bruit.

## 2. Suite

Par ordre de valeur pour le joueur, et non d'ordre chronologique. Les quatre
premiers points sortent de la contre-vérification adverse du 18/08 au soir et
sont **chiffrés** ; ils se traitent dans cet ordre, un changement à la fois.

1. **Le soleil de l'atlas est à 90° de celui du sol — bloquant.**
   `degradeSurface` (`art/shading.ts:419`) oriente son dégradé à **135°**,
   quand `palette.ts` déclare `toSun` au nord-ouest (azimut 315), que
   `field.ts` éclaire son sol à 45°, que la docstring de `peindre()` annonce
   « orienté 315° » et que l'art bible §1 loi n°2 dit « soleil au nord-ouest ».
   Tant que le dégradé était un aplat, la contradiction ne se voyait pas — et
   c'est *pourquoi* les créatures étaient noires : à 135° le `clamp-to-edge`
   renvoyait l'arrêt le plus sombre. Depuis `092e513` elle est peinte à
   l'écran. Mesuré en isolation sur la vraie fonction : NO−NE passe de −24,8 à
   **+15,9**, en accord avec le témoin de terrain à +19,9 ; sur la planche, 9
   cellules sur 21 basculent au nord-est et l'écart moyen à la direction du
   soleil déclaré passe de 26,7° à 46,6°. Même question pour les trois autres
   appels à 135° : `archetypes.ts:238`, `parchemin.ts:170`, `parchemin.ts:376`.
2. **Un test versionné sur `degradeLineaire` — bloquant.** Les 30 cas qui
   valident le correctif vivent dans `**/__epreuve/`, qui est dans
   `.gitignore` : ils n'existent pas dans l'historique. La propriété à garder
   est purement algébrique et ne demande pas de GPU — `u = (p·d − proj)/portée`
   croissant, exactement sur [0;1], arrêts retournés si `dx < 0` ou `dy < 0` —
   donc elle a sa place dans `art/art.test.ts`, qui n'en teste rien
   aujourd'hui. Sans lui, la prochaine montée de pixi inverse l'atlas en
   silence.
3. **Ré-étalonner les trois rampes de `field.ts`** (641 biome, 676 nappe
   froide — son premier arrêt est à alpha 0, la couche est entièrement
   invisible —, 706 glacis). Elles ont été écrites contre un dégradé mort ;
   maintenant qu'il vit, elles assombrissent et désaturent. C'est la seule voie
   pour récupérer ce que le sol du combat a perdu, mesuré et reproduit :
   **−19,0 de luminance et −4,0 points de saturation**. Le correctif des
   dégradés reste un gain net par ailleurs — sur la planche, +16,5 d'écart-type
   et +5,8 points de saturation, et la séparation figure/fond du champ passe de
   19,2 à 28,0 — mais la cible nommée a reculé, et le dossier ne se ferme pas
   là-dessus.
4. **Deux incohérences d'état latentes dans `appliquerDecorDemo`**, sans un
   pixel de conséquence aujourd'hui, mordantes dès qu'une route rendra le point
   de vue de P2 ou un bandeau de ressources : `state.turn = modele.turn` pousse
   la partie au tour 38 sans recopier les trésors (l'en-tête affiche « semaine 6 »
   au-dessus d'un trésor de premier jour, et Cervières tient 22 bâtiments sans
   qu'un écu ait été dépensé) ; et `initialReveal` étant **additif**, P2 garde
   le voile levé autour de Noirétable, qu'il n'occupe plus. Un test d'état pur
   sur ce correctif — turn, faction de `T_noiretable`, les deux routes, union
   des archétypes ≥ 11 — coûte une seconde et l'empêche d'être défait en
   silence.
5. **Le peintre de bâtiments**, second passage : arête un peu nette, mur 15 %
   plus clair que la pierre peinte voisine, et le raccord entre volumes gris
   aplats et panorama peint mesuré à **−14,10 points de saturation** sur le
   pixel échangé à Cervières (mais +6,73 à l'Hermitage). Les silhouettes et
   l'usure feraient le reste.
6. **Les traînées laiteuses de la carte** — coin bas-gauche, bande sous
   Cervières, diagonale en haut à droite. Sur un sol désormais coloré, elles
   lisent comme des salissures plutôt que comme de la brume.
7. **Le vide de 35 % du combat en portrait**, et les 52 % de lignes quasi-unies
   du tableau de cité sur iPhone — défaut préexistant, mesuré inchangé.
8. **Équilibrage par simulation** — le siège ne détermine plus le profil, et
   `duel.test.ts` mesure maintenant l'expert à **17/20 (85 %)** pour une cible
   de 70 %. Les chiffres de `pnpm sim` veulent enfin dire quelque chose.

## 3. Méthode

- **Aucun rapport d'agent n'est pris pour argent comptant sur le visuel.** Chaque
  écran est capturé en 1920×1080 et en 390×844, puis **regardé**. Un rapport qui dit
  « terminé » sans capture examinée ne vaut rien : c'est ainsi qu'on a découvert que
  40 000 lignes de code visuel n'avaient jamais été exécutées.
- **Périmètres de fichiers disjoints** par agent, contrats figés dans `docs/02-API.md`
  et `apps/client/src/view-contract.ts`.
- **Commit et push après chaque lot**, pour survivre aux redémarrages de conteneur et
  aux limites de session.
- **Portes de qualité** : `pnpm typecheck`, `pnpm lint`, `pnpm test`, build client et
  serveur, captures sans erreur console.
- **Attendre le décodage avant de juger une capture.** Une attente de 2 600 ms a
  photographié la page avant que le fond peint de 207 ko ne soit décodé, et a fait
  conclure à tort à une régression. Les attentes du harnais sont désormais calées
  sur le poids réel des images.
- **Mesurer avant d'accuser.** « L'IA joue mal » était faux : l'IA classait
  correctement un gisement en tête de ses cibles dès la deuxième semaine, avec
  un score dix fois supérieur au suivant. Ce qui manquait était ailleurs — deux
  défauts d'arithmétique, l'un dans le moteur, l'autre dans une estimation de
  distance. Trois sondes successives (`explainTurn`, la force au champ contre
  celle en garnison, puis la valeur brute de `travelEstimate`) ont suffi à les
  isoler. Aucun réglage de pondération n'aurait rien donné.
- **Régler une constante à la fois, et mesurer.** Trois essais sur la carte —
  brouillard, saturation de base, teinte des décors — ont chacun déplacé le
  résultat de moins de deux points. Aucun n'a été conservé : livrer un
  changement visuel dont on n'a pas vu l'effet, c'est exactement ce que la
  ligne précédente interdit. Ce qu'ils ont donné vaut mieux qu'un réglage : ils
  ont montré où le défaut n'est pas.
- **Vérifier que la mesure mesure ce qu'on croit.** Le harnais de simulation
  indexait départs et profils sur le même compteur : le « taux de victoire par
  profil » et le « taux de victoire par position » étaient le même chiffre, et
  un résultat déjà annoncé a dû être retiré. Une mesure qu'on n'a pas éprouvée
  contre son propre biais n'est pas une mesure.
- **Un harnais qui échoue en silence corrompt tout ce qui s'appuie sur lui.**
  Les quatre harnais de capture servaient le jeu sur un port fixe. Tant qu'une
  seule capture tournait, cela passait ; dès que plusieurs agents ont travaillé
  en parallèle, le second serveur n'écoutait pas et Chromium recevait
  `ERR_CONNECTION_REFUSED`. Ce n'est pas une panne franche : la capture manque,
  la comparaison avant/après se fait sur des images absentes, et l'on conclut
  qu'un correctif ne sert à rien. C'est très probablement ce qui a fait annuler
  le correctif des dégradés — le harnais chargé de le vérifier ne captait plus
  rien. Chaque harnais demande désormais un port libre au système.
- **Un correctif mesuré ne se laisse pas défaire en silence.** Le correctif des
  dégradés obliques — vérifié, chiffré, l'écart-type du sol du champ de bataille
  passant de 23,1 à 50,0 — s'est retrouvé intégralement annulé dans l'arbre de
  travail par un agent, sans explication jointe. Il a été rétabli après
  re-mesure, et la re-mesure a aussi montré ce que l'annulation aurait coûté
  pour rien : la cité et l'accueil sont inchangés au dixième près (37,8 et 61,2
  avant comme après), donc aucun dégât collatéral ne la justifiait. Ce qui est
  committé après mesure fait foi ; un agent qui veut le défaire doit apporter
  une mesure contraire.
- **Sur une scène animée, un diff de pixels bruts ne prouve rien — dans aucun
  sens.** Entre deux captures du **même code**, seuls 52 % des pixels de la
  carte d'aventure coïncident : le grain, la brume et les particules bougent
  seuls. Un rapport a conclu « le signal est sous le plancher de bruit, donc la
  carte est inchangée » avec 7,93 % contre 8,81 % ; un second tirage a donné
  10,20 % contre 9,05 % et renversé la phrase. Aucun des quatre nombres n'était
  reproductible : l'argument était un coup de dés. Ce qui tranche, c'est le
  **masque des pixels stables** — ceux qui coïncident à moins de 4/255 entre
  deux captures du même code — auquel on restreint la comparaison, plus un
  recalage de motifs distants pour écarter un décalage de cadrage.
- **Un correctif mesuré se commite sous un message qui le nomme.** La passe de
  couleur de la carte — dix points de saturation, le gain visuel le plus net de
  la journée — est partie dans un commit intitulé « un écran de diagnostic ».
  `git log` sur les fichiers concernés ne montrait plus rien après, et il a
  fallu la mesurer pour établir qu'elle n'avait pas été perdue. Un correctif
  qui ne se lit pas dans l'historique est un correctif qu'on annulera par
  accident.
- **Le correctif qui découvre un défaut plus ancien ne se juge pas sur ce
  défaut.** Réparer les dégradés obliques a fait apparaître une contradiction
  restée invisible dix mille lignes durant : l'atlas éclaire ses créatures à
  135°, le sol qui les porte à 45°. Tant que le dégradé posait un aplat, les
  deux erreurs se masquaient l'une l'autre. La bonne conclusion n'est ni « le
  correctif régresse, on annule » ni « le correctif est bon, on ferme » : c'est
  qu'un troisième défaut vient d'être rendu mesurable.
- **Un test qui ne peut pas échouer ne vaut rien.** Chaque correctif est
  accompagné d'un test qu'on vérifie **en retirant la correction** : s'il reste
  vert, il ne garde rien. Deux des six écrits ce jour-là ont dû être resserrés
  après cette épreuve.
- **Les sous-agents refonctionnent** depuis le 18/08 après-midi. Ils écrivent
  vite et beaucoup, mais **plafonnent sur le jugement visuel** : le module des
  cités a produit cinq tours de captures sans jamais corriger le défaut le plus
  visible de son écran. La revue finale reste à faire par le fil principal, à
  l'œil, capture par capture.
- **Lire les rapports d'agent jusqu'au bout, surtout la section « hors
  périmètre ».** Le gel du chargement sous CSP — le défaut le plus grave du
  projet, qui rendait toutes les scènes accélérées inaccessibles — a été
  signalé en passant, en sixième point, par un module qui travaillait sur les
  cités. Il aurait pu rester dans un rapport non lu.
- **Un test de bout en bout doit courir dans les conditions de production.**
  C'est la même leçon deux fois : ce qui n'est pas éprouvé sous la vraie CSP,
  contre le vrai binaire, dans un vrai navigateur, n'est pas éprouvé.

## 4. Documents de référence

| Fichier | Contenu |
|---|---|
| `docs/00-BRIEF.md` | règles non négociables, formules, ancrages géographiques |
| `docs/01-ART-BIBLE.md` | **§0 génération d'images**, sept lois du rendu, palette, typographie, critères d'échec |
| `docs/02-API.md` | contrats inter-modules imposés |
| `docs/03-ROUTES.md` | routes du client et scènes de revue visuelle |
| `docs/04-MULTIJOUEUR.md` | parties en ligne asynchrones |
| `docs/05-ASSETS.md` | **contrat des images générées** : chemins, clefs, tailles, style |
| `docs/06-BRIEF-CODEX.md` | **brief autonome à coller dans Codex** — se suffit à lui-même, aucun accès au dépôt requis |
| `docs/90-DOCUMENT-MAITRE.md` | document de conception d'origine |
