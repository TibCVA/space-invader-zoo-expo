# Plan AAA — de l'état mesuré à la cible HMM3

> Rédigé le 19/08 à partir de **douze audits mesurés** (agents indépendants,
> lecture seule, chiffres vérifiés par le fil principal) et des captures de
> `shots/wave2`. Ce document est **le plan d'exécution** ; l'état courant vit
> dans `plan.md`, les contrats dans `docs/`.
>
> Chaque lot porte : un périmètre de fichiers **exclusif**, un critère
> d'acceptation **mesurable**, et ses dépendances. Les lots d'une même phase
> sont parallélisables par des agents distincts — aucun fichier n'apparaît
> dans deux lots d'une même phase. Les règles de conduite (worktree isolé,
> jamais défaire un correctif mesuré sans mesure contraire, ports libres,
> capture sous la vraie CSP) sont dans `plan.md` §3 et s'appliquent à tout lot.

---

## 0. Ce que les audits ont établi — les dix faits qui commandent le plan

1. **La carte est une esplanade, pas un réseau.** 0,99 % d'infranchissable
   (uniquement l'eau), **zéro point d'articulation** sur 105 349 cases
   praticables, gardes qui ne bloquent aucune case (le calcul de chemin ignore
   la case d'entrée, seule case de leur empreinte). HMM3 découpe en zones
   reliées par des passages étroits **gardés** — son générateur pose en règle
   que les liaisons larges ne sont jamais gardées.
2. **La carte est vide, pas trop grande.** 285 objets = 1/370 cases ; un héros
   glaneur omniscient ramasse **1,9 objet par jour** (cible ≥ 4) ; 26 % des
   blocs 32×32 sont vides ; traversée capitale-à-capitale 18,3 jours — l'ordre
   d'une XL de HMM3. Correction de référence : une XL HMM3 fait 144×144 =
   20 736 cases ; notre carte en vaut 5,1. Les 15 natures d'objet existantes
   sont **toutes branchées** dans le moteur ; il en manque des familles
   entières : demeures extérieures, expérience, moral/chance, banques gardées,
   générateurs hebdomadaires, monolithes, obélisques, commerce, coffres.
3. **La croissance n'a pas de Citadelle/Château.** Plafond réel ×1,35 contre
   ×2 dans HMM3 ; la chaîne défensive ne donne que des murs.
4. **Le mouvement est forfaitaire** (1800), sans dépendance à la créature la
   plus lente (HMM3 : 1300–2000 selon la pile la plus lente) — un arbitrage
   stratégique entier manque.
5. **Le combat est déjà animé de bout en bout** (8 clips × 28 créatures, file
   d'événements, projectiles, dégâts flottants, carte d'aperçu au-dessus de
   HMM3). Les défauts sont du câblage : impact 117 ms avant le contact, école
   de sort devinée par mots (18/32 fausses), un seul effet visuel pour 32
   sorts, un seul projectile, pas de cadavres, pas d'icônes épée/flèche, 3,1
   obstacles par champ, cases tactiles et barre d'actions **invisibles sur
   iPhone** (la carte d'aperçu recouvre les six boutons).
6. **La lisibilité actif/décoratif est corrigée à la racine** (clairières,
   échelles, terre foulée, jetons par ressource — commit `13dc316`) et la
   vague 2 d'images l'a portée au niveau : ~20 objets repérables par écran.
7. **Les images peintes sont la voie du AAA.** Constat mesuré et désormais
   éprouvé deux fois : accueil, panoramas, et depuis la vague 2 les bâtiments
   de cité et le décor de carte. 167 entrées, 9,6 Mo / 12. Le pipeline est
   verrouillé (ancres en fractions, clefs = clefs d'atlas, repli procédural).
8. **Trois lavages de couleur sont tombés** (18,93 → 29,15 % de saturation sur
   la carte, reproduit trois fois à 0,01 pt) ; les rampes du champ de bataille
   écrites contre un dégradé mort restent à ré-étalonner (−19 lum, −4 sat).
9. **L'atlas éclaire à 90° du sol** (`degradeSurface` à 135°, tout le reste à
   45/315°) — rendu visible par le correctif des dégradés.
10. **Zéro test sur `battle/`** avant `0a70382` ; un seul depuis. Le moteur,
    lui, est bien couvert (703 tests).

## 0 bis. Contrainte d'exécution

Ce conteneur a 4 processeurs → **2 agents simultanés** par workflow. Les lots
sont donc taillés gros (une soirée-agent chacun) plutôt que nombreux. Tout lot
qui écrit passe par un `git worktree` isolé et rend l'arbre propre. La
construction du client, les captures et le déploiement sont **exclusifs** — un
seul à la fois.

---

## Phase 0 — les types partagés (SEUL, avant tout le reste)

### Lot 0.1 — étendre `MapObjectKind` et `Terrain`, et les verrouiller

**Périmètre** : `packages/engine/src/types.ts`,
`packages/protocol/src/schemas.ts`, `packages/engine/src/core/terrain-cost.test.ts`.

Ajouter les natures : `demeure` (recruteur extérieur), `moulin` (générateur
hebdomadaire), `banque` (trésor gardé rejouable), `monolithe` (paire liée),
`obelisque`, `ecole` (attaque/défense/savoir payant), `temple` (moral),
`fontaine` (chance), `coffre` (or **ou** expérience, au choix),
`garde_frontiere` + `tente_clef`, `cartographe`, `marche_noir`. Ajouter le
terrain `falaise` (infranchissable, `Number.MAX_SAFE_INTEGER`) pour le relief
qui ferme les zones. Le barème du calcul de chemin est déjà **dérivé** de
`TERRAIN_COST` (commit `90f5564`) : l'ajout est sûr, le test le prouve.

**Acceptation** : typecheck monorepo vert ; `terrain-cost.test.ts` passe avec
le terrain ajouté ; aucune nature sans effet déclaré en phase 1.2 ; hash d'état
d'une partie existante inchangé (les nouveaux types ne réordonnent rien).

---

## Phase 1 — moteur et contenu (parallèle, périmètres disjoints)

### Lot 1.1 — densification : de 285 à ≥ 720 objets

**Périmètre** : `packages/map/src/objects.ts` (+ son test).

Peupler par famille, cibles chiffrées (surface praticable 105 349 cases,
densité visée ≤ 150 cases/objet) : ~90 demeures extérieures (réparties par
région, paliers 1–4 surtout), ~140 coffres et petits ramassages, ~40 objets
d'expérience/compétence (écoles, pierres du savoir), ~30 moral/chance
(temples, fontaines), ~20 banques gardées, ~8 paires de monolithes, ~10
obélisques, ~12 moulins/générateurs, +80 tas de ressources, +30 mines (dont
2 mines d'or profondes gardées par région), gardes-frontières sur les cols de
la phase 1.9. La réserve foncière est mesurée : 47 175 cases `CELL_CACHE`,
30 784 cases de lisière indexées.

**Acceptation** : `pnpm carte` rend ≤ 150 cases/objet, 0 bloc 32×32 vide,
héros glaneur ≥ 4 objets/jour ; `buildWorld` < 1 200 ms ; IA p95 < 400 ms
(perf.test.ts) ; déterminisme : deux `buildWorld(graine)` identiques.

### Lot 1.2 — les effets des nouvelles natures

**Périmètre** : `packages/engine/src/world/objects.ts` (+ test),
`packages/engine/src/core/turn.ts` (croissance des demeures extérieures).

`visitObject` pour chaque nature du lot 0.1, aux valeurs HMM3 transposées :
demeure = recrutement sur place + cumul hebdomadaire au propriétaire ; école
+1 caractéristique contre 1 000 écus, une fois par héros ; coffre = choix
or/XP ; banque = combat contre garde forte puis butin, repeuplée toutes les
N semaines ; monolithe = téléport vers son jumeau ; obélisque = révèle une
part de la carte au puits du Graal (simplifié : révélation du trésor final) ;
temple +1 moral 7 jours ; fontaine −1..+3 chance ; moulin = ressource
hebdomadaire au premier visiteur de la semaine.

**Acceptation** : un test par nature (état pur, sans navigateur) ; « une fois
par héros » persiste à la sauvegarde ; rejeu déterministe (hash).

### Lot 1.3 — calibration des gardes

**Périmètre** : `packages/content/src/guards.ts`, `packages/map/src/objects.ts`
section gardes (coordonné avec 1.1 — même agent ou séquencé).

Règle explicite : `force = f(valeur gardée, distance au départ le plus
proche)`, paliers de zone concentriques ; les gardes reçoivent une **empreinte
qui bloque** (3 cases en travers du passage) — le correctif moteur est trivial
depuis l'audit (`place()` avec footprint multi-cases).

**Acceptation** : corrélation force/valeur > 0,8 ; aucun garde de fin de
partie à < 15 cases d'un départ ; sur les 10 itinéraires optimaux entre
capitales, **au moins 6 croisent un garde** (contre 0 aujourd'hui) ; test
versionné qui échantillonne 5 graines.

### Lot 1.4 — nombres HMM3 : créatures, croissance, Citadelle/Château

**Périmètre** : `packages/content/src/creatures.ts`, `buildings.ts`
(+ `balance.test.ts`).

Croissance HMM3 par palier (base 14/9/7/5/4/3/2 — à re-vérifier contre la
source avant d'écrire, l'audit signale l'incertitude) ; ajout de deux
bâtiments par faction dans la chaîne défensive : **Citadelle** (+50 % de
croissance, douves) et **Château** (+100 %, tours) — remplace le plafond
×1,35 par le ×2 canonique ; coûts alignés (Citadelle ~2 500 écus + granit,
Château ~5 000).

**Acceptation** : `validateContent()` vert ; simulation `pnpm sim` : durée
médiane de partie ≥ 6 semaines ; expert vs prudent entre 60 et 85 %.

### Lot 1.5 — mouvement dépendant de l'armée

**Périmètre** : `packages/engine/src/world/hero-stats.ts` (+ test),
`packages/engine/src/core/constants.ts`.

`BASE_MOVEMENT` devient `f(vitesse de la pile la plus lente)` : 1 300 à 2 000
par paliers (barème HMM3), bonus existants inchangés. Les bots lisent déjà
`heroStats` — aucun changement bots.

**Acceptation** : test à trois armées (lente/mixte/rapide) ; les 20 parties de
`duel.test.ts` restent jouables (aucun blocage de conquête).

### Lot 1.6 — victoire unique : prendre tous les châteaux adverses

**Périmètre** : `packages/engine/src/core/fallback-world.ts`,
`packages/protocol` (schémas), assistant de nouvelle partie
(`apps/client/src/screens/` route nouvelle-partie), tests des modes.

Un seul mode : élimination par perte de toutes les cités ; un joueur sans
cité garde **7 jours** pour en reprendre une (règle HMM3), sinon défaite ;
suppression de `couronne`, `maitre_marches` et de la victoire au score ;
`maxWeeks` disparaît ou devient un garde-fou très haut. La Maison du Trésor
devient la **banque légendaire** de la carte (gros gardien, gros butin,
obélisques qui la révèlent) — elle garde son ancrage et son folklore.

**Acceptation** : les parties de simulation se terminent **toutes** par la
prise du dernier château ; une sauvegarde d'un ancien mode se charge encore
(migration : mode forcé à l'élimination) ; l'assistant n'offre plus de choix
de mode ; tests des modes retirés remplacés par le test des 7 jours.

### Lot 1.7 — col des Sagnes, col de Saint-Thomas, Pierre de Pamole

**Périmètre** : `packages/map/src/anchors.ts`, `starts.ts` si besoin,
`packages/content/src/villages.ts` (fiches).

Les trois lieux demandés, ancrés dans la vraie géographie (le col de
Saint-Thomas est sur la route Forez-Auvergne ; les Sagnes sont les tourbières
près du village du lac — la région `lac_sagnes` existe déjà ; la Pierre de
Pamole rejoint la région `vollore_pamole`). Un col = passage étroit **gardé**
entre deux zones (garde-frontière du lot 1.1) ; la Pierre = objet à effet
unique (bénédiction de puissance, une fois par héros). Vérification par
l'altitude : un col tombe sur une selle de la grille d'élévation.

**Acceptation** : les trois ancres à < 2 cases de leur position réelle
projetée ; altitude de selle vérifiée pour les deux cols ; chaque lieu a une
fiche de codex et un effet testé.

### Lot 1.8 — zones lisibles : la carte des terrains

**Périmètre** : `packages/map/src/terrain.ts` (+ test), `elevation.ts` si
seuils.

Casser le 85 % prairie+forêt : hautes-chaumes (> 1 150 m) en lande rase,
tourbières étendues autour des sagnes, falaises `falaise` sur les barres
rocheuses (c'est le relief qui ferme les zones du lot 1.9), clairières de
pâture autour des villages. Cible : aucune paire prairie/forêt > 70 % à deux,
≥ 6 % d'infranchissable total.

**Acceptation** : `pnpm carte` — infranchissable ≥ 6 %, et par région la
matière dominante ≤ 65 % ; les 12 régions ont des dominantes distinctes deux
à deux (test) ; routes et départs restent connectés (composante unique côté
praticable contenant les 5 départs).

### Lot 1.9 — cols et goulets : le réseau

**Périmètre** : `packages/map/src/roads.ts`, `hydrography.ts` (gués).

Avec les falaises de 1.8 : chaque frontière de région se réduit à 1 à 3
passages de ≤ 4 cases (cols, ponts, gués), gardés par 1.3. Le réseau viaire
gagne 2 rocades pour porter les cycles de 3 à ≥ 6.

**Acceptation** : `pnpm carte` — points d'articulation ≥ 12 ; toujours une
seule composante praticable ; entre chaque paire de capitales, ≥ 2 itinéraires
< +25 % de coût passant par des cols **différents** ; A* < 150 ms (test perf
existant).

---

## Phase 2 — rendu et interaction (parallèle, après phase 1 pour 2.1/2.2)

### Lot 2.1 — icônes des nouvelles natures + brief vague 3

**Périmètre** : `apps/client/src/art/map-icons.ts`, `render/objects.ts`
(tailles des nouvelles natures), révision de `docs/07`.

Icônes procédurales de repli pour chaque nature du lot 0.1 (le peintre
existant sait faire), tailles au-dessus de `DECOR_MEDIAN`, et la liste
`carte_<kind>` ajoutée au brief pour la vague 3 de Codex.

**Acceptation** : `objects.test.ts` étendu (aucune nature sans taille ni
icône) ; capture de la carte : les nouvelles natures repérables au premier
regard (revue à l'œil du fil principal).

### Lot 2.2 — rampes du champ de bataille + soleil de l'atlas

**Périmètre** : `apps/client/src/battle/field.ts` (rampes 641/676/706),
`apps/client/src/art/shading.ts:419` (135° → 45°), `archetypes.ts:238`,
`parchemin.ts:170/376` (mêmes constantes).

Ré-étalonner les trois rampes écrites contre un dégradé mort ; aligner le
soleil de l'atlas sur 315° comme partout ailleurs.

**Acceptation** : sol du combat — luminance ≥ 95, saturation ≥ 19 % (retour
au niveau d'avant `092e513`, mesuré au même protocole 8 zones) ; NO−NE > 0
sur la planche pour ≥ 17 cellules sur 21 ; cité/accueil inchangés au diff
pixel-stable.

### Lot 2.3 — combat : câblage des animations

**Périmètre** : `apps/client/src/battle/anim.ts`, `vfx.ts`, `rig.ts` (instant
de contact), `packages/engine/src/combat/spells.ts` (école dans le détail du
journal — coordonné : seul point de contact moteur).

L'impact calé sur l'instant de contact du clip (écart < 30 ms) ; l'école du
sort lue du détail structuré, plus jamais du texte ; cadence de marche calée
sur l'avance au sol ; projectile par famille de tireur (flèche/carreau/
pierre/trait) ; cadavres persistants au sol ; brancher `traitDeSort` et
`AuraSort` (105 lignes écrites jamais appelées) ; une famille d'effet par
intention de sort (dégâts/soin/renfort/entrave), déclinée par école.

**Acceptation** : tests sur la file (l'école ne vient jamais du texte ; le
contact du clip pilote l'impact) ; capture du combat : cadavre visible,
projectiles distincts ; zéro régression des 4 tests `anim.test.ts`.

### Lot 2.4 — combat : icônes d'action, curseurs, obstacles

**Périmètre** : `apps/client/src/battle/hexgrid.ts`, `preview.ts`,
`packages/engine/src/combat/start.ts` (obstacles 3 → 8-12 par champ, nouveaux
props par région).

Pictogramme épée orientée / flèche pleine / flèche brisée au survol d'une
cible (demande explicite) ; curseur CSS par mode ; obstacles à 8-12 par champ
avec répertoire par région élargi.

**Acceptation** : capture bureau — pictogramme visible sur case ennemie ;
`start.test` : 8 ≤ obstacles ≤ 12 sur 200 tirages, jamais de case de départ
bloquée ; le taux de victoire auto ne dévie pas de ±5 pts (sim).

### Lot 2.5 — iPhone : combat jouable et gestes

**Périmètre** : `apps/client/src/battle/index.ts` (amarrage de la carte
d'aperçu, barre d'actions), gestionnaire de gestes partagé
(`apps/client/src/render/` nouveau module), `town/index.ts` (pincer),
`screens/scene.tsx` si branchement.

La carte d'aperçu ne recouvre plus jamais la barre d'actions (six boutons
tappables ≥ 44 pt) ; pincer-zoomer + glisser + double-tape sur carte, cité,
combat ; bornes de zoom par scène ; recadrage des bâtiments sur le panorama
portrait (positions % dédiées au cadrage portrait — défaut vu sur capture).

**Acceptation** : capture iPhone du combat — les six boutons visibles avec la
carte d'aperçu ouverte ; cibles tactiles mesurées ≥ 44 pt ; trace de montage
< 4 s sur les trois scènes en local ; capture cité portrait — bâtiments posés
sur les terrasses, pas sur les à-pics.

### Lot 2.6 — créatures : resculpture guidée par les références

**Périmètre** : `apps/client/src/art/creatures/` (granit.ts, ermitage.ts,
archetypes.ts pour les silhouettes).

Passe famille par famille sur les 28 rigs d'après
`docs/reference/creatures/<id>.webp` (anatomie) et `renders/<id>.webp`
(matières) — consigne de Codex maintenue : **jamais de billboard**, on
resculpte les Graphics en gardant animations et coûts. Rangs 6-7 d'abord.

**Acceptation** : budget de primitives par rig inchangé à ±20 % (test) ;
planche d'art avant/après jugée par un critique visuel dur, créature par
créature ; les 8 clips passent toujours (art.test.ts).

---

## Phase 3 — équilibrage et revue finale

- **3.1 Simulation** : 20 parties × 3 graines après 1.1-1.9 ; ajuster
  guards/growth/coûts jusqu'à : durée médiane 6-10 semaines, expert 60-85 %,
  zéro partie sans conquête.
- **3.2 Revue adversariale** : capture des 14 scènes × 2 viewports, un
  critique dur par écran, côte à côte avec des références HMM3 ; chaque
  verdict « pas AAA » ouvre un correctif mesuré. Boucler jusqu'à épuisement
  des défauts bloquants.
- **3.3 Déploiement** : `tools/deployer.sh` (portes + CSP), vérification en
  production, trace de montage relevée sur un vrai iPhone.

## Ordre de marche

```
0.1 ──► 1.1 ─┬─► 1.3 (gardes sur les objets posés)
             ├─► 2.1 (icônes des natures)
     ├─► 1.2 ┘
     ├─► 1.6   1.4   1.5   1.7   1.8 ──► 1.9
     └──────────────────────────► 2.2  2.3  2.4  2.5  2.6 (indépendants)
                                            └──► 3.1 ──► 3.2 ──► 3.3
```

Déjà fait au moment où ce plan est écrit : phase 0 partielle (barème dérivé,
ancres en fractions), lisibilité actif/décor (`13dc316`), chemin de marche du
combat (`0a70382`), vague 2 d'images livrée et **vue en jeu** (captures
`shots/wave2`, 0 erreur console).
