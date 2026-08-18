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
| Raccordement des matières | à faire | 8 matières livrées, sans consommateur |
| Rendu de la carte d'aventure | **fait, à polir** | trop sombre, forêts répétitives, panneau sur la minicarte en portrait |
| Rendu du combat | **fait, à corriger** | vide de 35 % en portrait ; prévisualisation d'attaque conforme |
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

## 2. Suite

Par ordre de valeur pour le joueur, et non d'ordre chronologique.

1. **La carte d'aventure manque de couleur.** Mesuré : le sol rendu tient entre
   12 et 15 % de saturation, quand les textures peintes de ce même jeu en ont
   35 à 55. Ce n'est **pas** le brouillard de guerre — le désaturer de 60 à
   42 % ne change rien à la mesure — ni la teinte de base du terrain : la
   porter de +16 à +45 % ne gagne que 1,2 point. Trois essais à une constante
   chacun ont donc échoué, et c'est le résultat utile : la platitude vient du
   cumul des termes froids (l'ombre tirée à 38 % vers le bleu, le voile
   d'altitude, la teinte des décors) et demande une passe d'ensemble, pas un
   réglage. À reprendre avec les quatre termes tenus ensemble et une mesure
   après chaque essai.
2. **Le vide de 35 % du combat en portrait.**
3. **Le tableau de cité, second passage** — il reste aux bâtiments une arête un
   peu nette et un mur 15 % plus clair que la pierre peinte voisine. Les
   silhouettes et l'usure feraient le reste.
4. **La colonne droite vide de `#/en-ligne`** sur grand écran.
5. **Équilibrage par simulation** — maintenant que les lieux se prennent et que
   le siège ne détermine plus le profil, les chiffres de `pnpm sim` veulent
   enfin dire quelque chose.

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
