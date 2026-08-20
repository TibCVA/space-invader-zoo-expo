# Brief ImageGen — vague 3 : la carte d'aventure

> **Destinataire : l'agent qui produit les images (Codex / ImageGen).**
> `docs/05-ASSETS.md` reste le **contrat** : format WebP qualité 82, manifeste
> obligatoire, soleil au nord-ouest à 315° et 38° d'élévation, lumière chaude
> `#FFE9C2` et ombre froide `#3A4657`, palette imposée, aucun texte ni cadre
> dans l'image. Ce document ne redit pas ces règles. Il dit **quoi produire**,
> **sous quelle clef exacte**, et **ce que chaque image corrige** — parce que
> chaque ligne de cette liste vient d'une capture qu'on a regardée, pas d'une
> envie.

---

## 1. D'où vient cette liste

Le propriétaire a écrit : « il faut que la carte soit très jolie avec beaucoup de
détails (même si items non jouables) et les différentes zones bien délimitées
visuellement (ne pas hésiter à demander à codex de dessiner de nouveaux assets
avec image gen : faire la liste) ».

La liste ci-dessous est faite sur trois captures de `#/demo/carte` prises au
harnais réel (`node tools/screenshot.mjs carte carte_pres carte_loin`), à trois
échelles : le cadrage de jeu, le ras du décor, et trois cantons dans le cadre.
Ce que ces captures montrent, dans l'ordre de gravité :

1. **le SOL porte tout le tableau et il est entièrement procédural.** Aux trois
   échelles, c'est lui qui décide si la carte est belle, et c'est lui qui est le
   plus faible : les grandes prairies d'altitude rendent une nappe jaune-vert
   pâle qui se lit comme une tache d'éclairage. Le peintre de terrain est
   pourtant très travaillé — huit strates, ombrage de relief, occlusion de
   vallée, lisières gauchies — mais il n'a **aucune matière peinte** à poser
   dessus. C'est l'écart le plus rentable de toute la liste ;
2. **le décor manque de variété au ras du sol.** Cinq silhouettes de sapin et
   cinq de rocher tiennent tout le massif ; à ce zoom on reconnaît la répétition ;
3. **les lieux visitables se ressemblent.** Treize natures partagent encore des
   icônes génériques ; un moulin, une école et une fontaine se distinguent mal ;
4. **le champ de bataille n'a qu'un fond par palette de terrain**, là où HMM3 en
   a un par terrain et par saison.

---

## 2. Le mécanisme, à connaître avant de produire

Le chargeur (`apps/client/src/art/assets.ts`) **remplace une entrée d'atlas par
son image sans une ligne de code à ajouter**, à une seule condition : la clef du
manifeste doit être exactement la clef d'atlas. Les clefs utiles ici :

| Famille | Clef d'atlas | `categorie` | Remarque |
|---|---|---|---|
| Décor semé sur la carte | `prop_<nom>_<variante>` | `prop` | variante à partir de 0 ; une image par variante |
| Icône de lieu visitable | `carte_<genre>` | (icône) | une seule image par genre |
| Pinceau de terrain | `herbe`, `aiguilles`, `roche`, `tourbe`, `gravier`, `eau` | `terrain` | **`repetable: true` obligatoire** |
| Matière | libre | `matiere` | idem |
| Créature | `creature_<id>` | `creature` | |

**Un piège à connaître.** Les pinceaux de terrain ne sont aujourd'hui lus que par
le **champ de bataille** (`battle/field.ts`) et la planche de contact. Le sol de
la carte d'aventure, lui, est peint pixel par pixel par `render/terrain.ts` et
**n'utilise aucun pinceau**. Les tuiles de la vague A ci-dessous demandent donc
un raccordement côté code (une strate de matière multipliée sur le bloc peint,
après l'ombrage et avant le grain). Ce n'est pas un travail d'image : c'est écrit
ici pour que personne ne livre six tuiles superbes qui n'apparaîtront nulle part.

---

## 3. Vague A — les matières du sol · **priorité absolue**

**Ce que ça corrige.** Le sol est 100 % de l'écran et 0 % peint. Sur la capture
au ras du décor, la prairie d'altitude est une nappe jaune-vert de 22 % de
saturation et 90 de clarté, sans grain, sans touffe, sans caillou : à côté d'un
sapin peint, elle paraît vide. Dans HMM3 le sol est un jeu de tuiles peintes,
et c'est ce qui donne au jeu son épaisseur.

Format : **512 × 512**, `repetable: true`, sans alpha, **sans ombre portée** (le
relief est calculé par le moteur ; une ombre peinte dans la tuile se battrait
avec lui). Grain fin, aucune structure reconnaissable qui se répéterait à l'œil
— pas de rocher unique, pas de touffe remarquable.

| Clef | Matière | Ce qu'on doit y voir |
|---|---|---|
| `herbe` | pâture de moyenne montagne | herbe drue et courte, deux verts, quelques pissenlits fanés, crottin sec, traces de piétinement |
| `aiguilles` | tapis de sapinière | aiguilles brunes, cônes tombés, mousse en plaques, racines affleurantes |
| `roche` | dalle de granit | granit gris-bleu, feldspath clair, lichen jaune et gris, fissures remplies de terre |
| `tourbe` | tourbière des Sagnes | sphaigne rousse et verte, eau noire dans les creux, linaigrette |
| `gravier` | chemin de terre battue | gravier de granit concassé, ornières, boue séchée, herbe sur la crête centrale |
| `eau` | eau de rivière de montagne | eau claire sur galets, non pas eau de mer ; le reflet est ajouté par le moteur |

**Six tuiles supplémentaires, la vraie nouveauté** — une par caractère de pays,
pour que les douze cantons cessent d'être une simple teinte. Mêmes règles, mêmes
tailles ; ces clefs n'existent pas encore côté code et viendront avec le
raccordement de la vague A :

| Clef | Pays qu'elle habille | Ce qu'on doit y voir |
|---|---|---|
| `herbe_estive` | Hauts d'Arconsat, Grande Chaussée | herbe rase brûlée par le vent, cailloux affleurants, callune sèche |
| `herbe_grasse` | Vallée de la Durolle, Marche de La Renaudie | pré de fauche épais, boutons d'or, ombellifères |
| `aiguilles_noires` | Cœur des Bois Noirs | humus presque noir, aiguilles serrées, rien qui pousse |
| `roche_carrier` | Vollore et Pamole | granit débité de main d'homme, éclats anguleux, poussière de taille |
| `roche_chaude` | Cervières, Maison du Trésor | granit patiné par le soleil, lichen orangé, terre ocre dans les joints |
| `lande_callune` | Hermitage et Peyrotine | callune en fleur mêlée de myrtille, tourbe sèche, genêt |

---

## 4. Vague B — le décor semé · **priorité 2**

**Ce que ça corrige.** Le décor est ce qui donne les « beaucoup de détails, même
si items non jouables ». Depuis peu, chaque canton a une SIGNATURE de décor —
les aiguilles de granit au pays des carriers, les murets de pierre sèche à
Cervières, les souches noyées des sagnes, les bornes de la route du sel — et
quatre silhouettes bâties qui dormaient dans l'atlas sont enfin posées : ferme,
moulin, chapelle, tour. Ces silhouettes portent donc désormais le caractère des
pays, et ce sont elles qu'il faut peindre en premier.

Format : PNG/WebP **avec alpha**, hauteur au plus 512 px, cadré sur la
silhouette avec deux pixels de marge. **Pied de contact au bas exact de
l'image** : le semis pose l'objet par son pied. Aucune ombre portée peinte —
elle est dessinée par le moteur, orientée sud-est et bleutée.

Ordre de priorité à l'intérieur de la vague :

| Clef(s) | Combien | Ce qu'on doit y voir | Pourquoi d'abord |
|---|---|---|---|
| `prop_ferme_0..3` | 4 | ferme du Forez : toit de lauzes à quatre pentes, murs de granit, grange accolée, tas de fumier, four à pain | c'est le bâti le plus fréquent ; il fait la différence entre une carte et une maquette |
| `prop_chapelle_0..2` | 3 | chapelle romane trapue, clocher-mur, toit de lauzes, croix de fer, mur de cimetière bas | signature de l'Hermitage et des sagnes |
| `prop_tour_0..3` | 4 | tour de guet en granit, ruinée à des degrés divers, meurtrières, lierre | signature de Cervières et de la Maison du Trésor |
| `prop_moulin_0..2` | 3 | moulin à eau sur bief, roue à augets, toit de lauzes — **pas de moulin à vent** | signature de la Durolle |
| `prop_aiguille_0..4` | 5 | aiguille de granit dressée, arêtes vives, veines de quartz, lichen | signature de Vollore ; la version procédurale a d'abord rendu une palissade de cônes identiques |
| `prop_muret_0..3` | 4 | muret de pierre sèche, pierres appareillées à la main, chaperon, brèche, ronces | signature de Cervières et des estives |
| `prop_croix_0..3` | 4 | croix de chemin : bois grossier, fer forgé, pierre gravée, calvaire à niche | signature de la Grande Chaussée et de l'Hermitage |
| `prop_souche_0..3` | 4 | souche de sapin arrachée, racines en étoile, cœur pourri, mousse | signature des sagnes et des Bois Noirs |
| `prop_borne_0..2` | 3 | borne armoriée de granit, écu martelé, mousse dans les creux | réseau de déplacement tardif, et signature de la route du sel |
| `prop_sapin_0..4` | 5 | sapin pectiné d'altitude, flèche cassée par la neige, branches basses mortes | la famille la plus nombreuse de la carte |
| `prop_hetre_0..4` | 5 | hêtre de futaie, fût lisse et gris, houppier dense, feuilles cuivrées | idem |
| `prop_rocher_0..4` | 5 | bloc erratique de granit, arrondi, lichen, herbe au pied | idem |
| `prop_fougere_0..3` | 4 | fougère aigle, frondes retombantes | sous-bois |
| `prop_buisson_0..3` | 4 | genêt, myrtille, aubépine, ronce | sous-bois |
| `prop_pont_0..3` | 4 | pont de pierre à une ou deux arches, parapet bas, tablier bombé | on en voit peu, mais un pont raté se remarque |

Total vague B : **61 images**. Si le budget ne les prend pas toutes, les cinq
premières lignes (18 images) sont celles qui portent le caractère des pays.

---

## 5. Vague C — les icônes de lieux visitables · **priorité 3**

**Ce que ça corrige.** Treize natures partagent des icônes génériques : sur la
capture, une école, un temple et une fontaine se distinguent mal l'un de
l'autre, et un joueur qui ne connaît pas la carte ne sait pas ce qu'il visite.

Format : **avec alpha**, 256 × 256 au plus, vue de trois quarts haut comme les
icônes existantes, pied de contact en bas. Les clefs sont **exactement** celles
de l'atlas, sans quoi rien n'est chargé :

| Clef | Lieu | Ce qu'on doit y voir |
|---|---|---|
| `carte_demeure` | demeure franche | hutte de bûcheron ou abri de berger, feu allumé, armes appuyées au mur |
| `carte_moulin` | moulin à ressource | moulin à eau, sacs empilés, roue |
| `carte_banque` | repaire gardé | grotte à l'entrée étayée, coffre entrouvert, ossements |
| `carte_monolithe` | pierre levée jumelée | menhir gravé de spirales, halo bleu discret |
| `carte_obelisque` | montjoie du puzzle | cairn haut surmonté d'une dalle gravée |
| `carte_ecole` | école de vaillance | pierre plate gravée, banc, rouleau posé |
| `carte_temple` | oratoire | niche de pierre, statuette voilée, ex-voto |
| `carte_fontaine` | fontaine aux fées | vasque de granit, filet d'eau, rubans noués aux branches |
| `carte_coffre` | coffre | coffre de chêne cerclé de fer, à demi enterré sous les feuilles |
| `carte_garde_frontiere` | poste de garde | chevaux de frise, feu de camp, bouclier planté |
| `carte_tente_clef` | tente du gardien de clef | tente de toile écrue, fanion, coffret sur un tabouret |
| `carte_cartographe` | cartographe | roulotte bâchée, cartes déroulées sur une planche |
| `carte_marche_noir` | marché noir | étal sous une bâche sombre, balance, capuchon |

Et deux qui manquent au tableau de bord des cités si `P0.1` les ajoute :
`carte_citadelle`, `carte_chateau`.

**Une remarque qui ne demande pas d'image** : sur la capture, on ne distingue
pas un gisement de bois d'un gisement de sel — l'icône est la même, seul un
petit jeton de ressource à côté change. Ce n'est pas un manque d'image, c'est un
manque de **code** (une variante d'icône par ressource) ; c'est noté ailleurs.

---

## 6. Vague D — les fonds de champ de bataille · **priorité 4**

**Ce que ça corrige.** Le propriétaire demande que « les combats fonctionnent
parfaitement avec une lisibilité parfaite ». La lisibilité tient d'abord au
contraste entre les figurines et le sol : un fond peint, plus sombre et plus
mat que les créatures, sépare mieux qu'un dégradé procédural.

Format : **1024 × 640**, sans alpha, **sans aucun élément au centre** — c'est là
que les créatures combattent. Le décor se tient sur le pourtour et à l'horizon.
La grille hexagonale est dessinée par-dessus par l'application.

| Clef | Terrain | Ce qu'on doit y voir |
|---|---|---|
| `combat_prairie` | pâture | pré tondu, murets au loin, ciel de traîne |
| `combat_foret` | futaie | clairière entourée de fûts, lumière filtrée, fougères |
| `combat_rocher` | chaos granitique | dalles et blocs, herbe rase entre les pierres |
| `combat_lande` | hautes chaumes | callune, horizon nu, vent |
| `combat_humide` | sagne | eau stagnante, joncs, brume basse |
| `combat_pont` | franchissement | tablier de pierre, rivière de part et d'autre |

---

## 7. Vague E — références de créatures, **non embarquées**

Comme à la vague 2 : ces images ne vont **pas** dans le manifeste. Elles servent
de référence à la sculpture procédurale, et elles se rangent dans
`docs/reference/creatures/`. La resculpture des quatorze humains est faite ; ce
qui reste faible, mesuré sur planche de contact :

- **les deux cavaliers** — Chevalier du Forez, Banneret : à la vignette on lit
  « un cheval avec quelque chose dessus ». Il faut une référence de la TÊTE et
  de l'encolure du cheval, de trois quarts, sous notre lumière ;
- **les bêtes** — Griffon de Pamole, Vouivre de la Durolle, Sanglier Cuirassé,
  Cerf des Sources, Colosse de Granite : cinq références de trois quarts, à
  hauteur d'œil, sans décor.

---

## 8. Ordre de livraison recommandé

1. les six pinceaux de la vague A (le sol, sur toute la surface de l'écran) ;
2. les dix-huit premières images de la vague B (le caractère des pays) ;
3. les six tuiles de pays de la vague A ;
4. la vague C (les icônes de lieux) ;
5. le reste de la vague B ;
6. la vague D, puis la vague E.

## 9. Vérification avant de rendre

```bash
node -e "const m=require('./apps/client/public/img/manifeste.json');console.log(m.entrees.length+' entrées')"
node tools/screenshot.mjs carte carte_pres carte_loin combat --dir shots/vague3
```

Une clef mal orthographiée ne casse rien et ne charge rien : le repli procédural
prend la place et personne ne s'en aperçoit. C'est le mode de panne le plus
coûteux de ce pipeline — on a déjà perdu une demi-journée sur une table
d'espacement dont la clef disait `fil_or` là où le code dit `filDor`. Relis les
clefs deux fois, puis vérifie le rapport de chargement dans la console : le
chargeur imprime la liste des entrées ignorées.
