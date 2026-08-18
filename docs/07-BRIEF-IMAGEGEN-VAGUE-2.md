# Brief ImageGen — vague 2 : les bâtiments, les objets actifs et le portrait

> **Destinataire : l'agent qui produit les images (Codex / ImageGen).**
> Ce document complète `docs/05-ASSETS.md`, qui reste le **contrat**. Tout ce qui
> y est écrit — format WebP q82, manifeste obligatoire, soleil au nord-ouest à
> 315° et 38° d'élévation, lumière chaude `#FFE9C2` et ombre froide `#3A4657`,
> palette imposée, aucun texte ni cadre dans l'image — s'applique ici sans
> changement. Ce document ne redit pas ces règles : il dit **quoi produire de
> plus**, et pourquoi.

---

## 1. Pourquoi cette vague existe

La vague 1 a livré 43 images et a produit un résultat net, mesurable et visible
sur une seule capture : **là où l'art est peint, le jeu est au niveau AAA ; là où
il reste procédural, il ne l'est pas.**

Regardez `shots/audit-base/cite_granit--bureau.png`. Le panorama peint est une
forteresse de granit sur son éperon, vallée noyée de brume, murs d'appareil
irrégulier — c'est superbe. Et par-dessus, **les bâtiments que le joueur
construit sont des polyèdres gris non texturés**, des primitives sans matière.
Les deux cohabitent à trente pixels l'un de l'autre. C'est la fracture que cette
vague doit refermer.

Même diagnostic ailleurs :

| Élément | État | Cette vague |
|---|---|---|
| Page d'accueil, panoramas de cité, portraits | **peints, AAA** | on n'y touche pas |
| Bâtiments bâtis dans la cité | polyèdres gris, tous identiques | **vague A — priorité absolue** |
| Objets actifs de la carte (mines, puits, gardes) | indistinguables du décor | **vague B** |
| Cité en portrait sur iPhone | 50 % d'aplat mort à l'écran | **vague C** |
| Créatures au combat | figurines correctes mais minuscules | **vague D — références seules** |

### Le mécanisme à connaître avant de produire

Le chargeur (`apps/client/src/art/assets.ts`) **remplace une entrée d'atlas par
son image, sans une ligne de code à ajouter**, à la seule condition que la clef
du manifeste soit exactement la clef d'atlas. Les catégories `creature` et `prop`
sont déjà acceptées. Les clefs existantes et leurs tailles de cellule :

| Famille | Clef d'atlas | Cellule de l'atlas |
|---|---|---|
| Créature | `creature_<id>` | 192 × 208, ancre au sol en (0,5 ; 0,94) |
| Objet de carte | `carte_<kind>` | 88 × 88 |
| Jeton de ressource | `ressource_<key>` | 88 × 88 |
| Pinceau de terrain | `<nom>` sans préfixe | 512 × 512 répétable |

Si la clef ne correspond pas au caractère près, l'image est **silencieusement
ignorée** et le repli procédural reste affiché. C'est le seul piège de ce
contrat, et il est fatal.

---

## 2. Vague A — les bâtiments de cité

**C'est le plus gros gain visuel du projet pour un octet dépensé.** Trente-deux
images qui remplacent des blocs gris par des bâtiments peints, dans un panorama
déjà peint qui les attend.

### Contraintes techniques, identiques pour toutes les entrées

- **512 × 512, avec alpha.** Généreux à dessein : le propriétaire veut pouvoir
  **zoomer dans la capitale**, y compris sur iPhone. À l'écran un bâtiment couvre
  aujourd'hui 100 à 130 px de large sur 1920 ; 512 px laisse un facteur 4 de zoom
  sans mollesse.
- Catégorie `prop`. Fichiers dans `apps/client/public/img/batiments/`.
- **Vue en projection oblique, caméra haute d'environ 35°**, exactement celle du
  panorama de cité : on voit la façade principale et un pan de toiture. Ni
  élévation frontale, ni vue de dessus.
- **Le bâtiment occupe la largeur pleine et pose au sol au bas de l'image**, base
  centrée horizontalement. Le moteur ancre au point de contact.
- **Ombre portée comprise dans l'image**, tirée vers le sud-est, bleu-violet, en
  alpha dégressif. Pas d'ombre noire.
- **Aucun terrain autour** : pas de socle d'herbe, pas de route, pas de rocher
  débordant. Le panorama fournit le sol. Une lisière de terre battue de quelques
  pixels au pied du mur est admise, rien de plus.
- Échelle relative à tenir absolument : une demeure de rang 1 doit être **plus
  petite** que le corps de logis peint voisin du panorama. Le rang 7 et le
  capitole sont les seuls à avoir le droit de dominer.

### A.1 — Les quatorze demeures de créature

En HMM3 chaque demeure est un point de repère reconnaissable au premier coup
d'œil, et c'est ce qui donne à une ville son caractère. Chez nous les sept
demeures d'une faction rendent aujourd'hui **le même archétype « maison »** :
sept bâtiments identiques. Chaque demeure doit dire quelle créature elle abrite.

**Châtellenie de Granit** — grenat `#6E1F2A`, or ancien `#C9A227`, ardoise
`#414A52`, granit anthracite `#2A2C2F`. Architecture : appareil de granit à
joints épais, toitures d'ardoise à forte pente, encadrements de basalte,
bannières grenat.

| Clef | Fichier | Créature abritée | Sujet |
|---|---|---|---|
| `bati_granit_demeure_1` | `batiments/granit-demeure-1.webp` | Manant | Rangée de chaumières basses de granit, une seule pièce, toit de genêt, appentis à outils, tas de bois fendu |
| `bati_granit_demeure_2` | `batiments/granit-demeure-2.webp` | Gabelou | Bureau de la gabelle : corps de garde trapu, porte cloutée, balance à sel sous auvent, coffre ferré, mesure à grain |
| `bati_granit_demeure_3` | `batiments/granit-demeure-3.webp` | Arbalétrier des Farges | Butte de tir couverte : long hangar ouvert, râtelier d'arbalètes, cibles de paille bottelée, pavois appuyés |
| `bati_granit_demeure_4` | `batiments/granit-demeure-4.webp` | Grenadière d'Or | Atelier de broderie : maison à grandes fenêtres à meneaux, métiers à broder visibles, écheveaux d'or tendus à sécher |
| `bati_granit_demeure_5` | `batiments/granit-demeure-5.webp` | Sanglier Cuirassé | Soue fortifiée : enclos de pierre sèche, abri voûté, auges de granit, glandée de chênes, planches de bardage entaillées |
| `bati_granit_demeure_6` | `batiments/granit-demeure-6.webp` | Chevalier du Forez | Corps de logis noble : perron, écurie attenante, quintaine d'entraînement, bannières grenat, girouette |
| `bati_granit_demeure_7` | `batiments/granit-demeure-7.webp` | Griffon de Pamole | Aire du griffon : tour ouverte sur un piton, perchoirs de poutres usées, nid de branches, plumes prises au vent |

**Ermitage des Bois Noirs** — vert profond `#1B3A2B`, vert sauge `#7C8F6B`,
cuivre patiné `#4E8977`, pierre claire `#CFC6B4`. Architecture : pans de bois et
pierre claire, toitures de cuivre verdi ou de bardeaux, passerelles, sources
captées, végétation qui reprend ses droits.

| Clef | Fichier | Créature abritée | Sujet |
|---|---|---|---|
| `bati_ermitage_demeure_1` | `batiments/ermitage-demeure-1.webp` | Pèlerin | Hospice de chemin : longue salle basse, porche d'accueil, banc de pierre, croix de bois, coquilles clouées au linteau |
| `bati_ermitage_demeure_2` | `batiments/ermitage-demeure-2.webp` | Chouette Hulotte | Colombier à chouettes : tour ronde percée de boulins, toit conique de bardeaux, lierre, perchoirs |
| `bati_ermitage_demeure_3` | `batiments/ermitage-demeure-3.webp` | Loup des Bois Noirs | Tanière palissadée : abri creusé sous une roche, palissade de pieux, os blanchis, brume basse retenue au sol |
| `bati_ermitage_demeure_4` | `batiments/ermitage-demeure-4.webp` | Veneur Sylvestre | Loge de veneur sur pilotis : plateforme de bois, échelle, filets et épieux, peaux tendues sur cadre |
| `bati_ermitage_demeure_5` | `batiments/ermitage-demeure-5.webp` | Cerf des Sources | Enclos sacré autour d'une source captée : margelle de pierre claire, bassin, arbres à rubans, bois de cerf offerts |
| `bati_ermitage_demeure_6` | `batiments/ermitage-demeure-6.webp` | Colosse de Granite | Carrière-atelier : front de taille, blocs équarris, coins et masses, un colosse inachevé encore pris dans la roche |
| `bati_ermitage_demeure_7` | `batiments/ermitage-demeure-7.webp` | Vouivre de la Durolle | Gouffre de la vouivre : bouche de grotte au bord du torrent, eau qui fume, écailles prises dans la vase, reflet vert d'eau |

### A.2 — Les bâtiments communs qui portent la ville

| Clef | Fichier | Sujet |
|---|---|---|
| `bati_hotel_ville_1` | `batiments/hotel-ville-1.webp` | Maison commune modeste : salle sur arcades, banc de justice, écu peint au-dessus de la porte |
| `bati_hotel_ville_2` | `batiments/hotel-ville-2.webp` | Même bâtiment agrandi d'un étage à colombage et d'une tourelle d'escalier |
| `bati_hotel_ville_3` | `batiments/hotel-ville-3.webp` | Hôtel de ville abouti : beffroi carré, horloge à jacquemart, galerie, toiture d'ardoise complexe |
| `bati_taverne` | `batiments/taverne.webp` | Auberge : enseigne en fer forgé sans texte, tonneaux, banc, fumée à la cheminée, fenêtres éclairées |
| `bati_marche` | `batiments/marche.webp` | Halle de marché : charpente de bois sur piliers de pierre, toit à croupes, étals vides, mesures à grain |
| `bati_halle_sel` | `batiments/halle-sel.webp` | Grenier à sel : bâtiment aveugle et trapu, contreforts, porte à double battant ferrée, chariot à sel |
| `bati_caravanserail` | `batiments/caravanserail.webp` | Relais de caravane : cour fermée, abreuvoir, portique d'entrée, bâts empilés |
| `bati_forge` | `batiments/forge.webp` | Forge : appentis ouvert, feu rougeoyant visible, enclume, soufflet, cheminée conique, ferrures pendues |
| `bati_ecuries` | `batiments/ecuries.webp` | Écuries : longue bâtisse basse, portes en deux parties, botte de foin, abreuvoir de granit |
| `bati_capitaine` | `batiments/capitaine.webp` | Maison du capitaine de place : tour-porche carrée, meurtrières, oriflamme, corps de garde |
| `bati_guilde_1` | `batiments/guilde-1.webp` | Guilde des mages, rang 1 : tour ronde courte, une fenêtre haute, appareil régulier |
| `bati_guilde_2` | `batiments/guilde-2.webp` | Rang 2 : la tour gagne un étage et une coursive de bois |
| `bati_guilde_3` | `batiments/guilde-3.webp` | Rang 3 : toit conique d'ardoise, oculus, contreforts |
| `bati_guilde_4` | `batiments/guilde-4.webp` | Rang 4 : tourelle satellite reliée par une passerelle, vitraux étroits |
| `bati_guilde_5` | `batiments/guilde-5.webp` | Rang 5 : sommet ouvert sur le ciel, armille de bronze, lueur froide bleu-vert |
| `bati_palissade` | `batiments/palissade.webp` | Palissade de pieux et talus de terre, porte charretière simple |
| `bati_rempart` | `batiments/rempart.webp` | Rempart de granit à chemin de ronde et merlons |
| `bati_tours` | `batiments/tours.webp` | Tours de flanquement rondes, machicoulis, toits en poivrière |

### A.3 — Les bâtiments singuliers de chaque faction

| Clef | Fichier | Sujet |
|---|---|---|
| `bati_granit_atelier_fildor` | `batiments/granit-atelier-fildor.webp` | Atelier du fil d'or : longue salle vitrée, dévidoirs, cuves de teinture, écheveaux d'or tendus dehors |
| `bati_granit_porte_farges` | `batiments/granit-porte-farges.webp` | Porte des Farges : châtelet à deux tours, herse levée, pont dormant, mâchicoulis |
| `bati_granit_capitole` | `batiments/granit-capitole.webp` | Capitole des Comtes : donjon carré massif sur motte de granit, salle haute à baies géminées, bannières grenat et or — **le point culminant de la ville** |
| `bati_ermitage_source` | `batiments/ermitage-source.webp` | Source captée : fontaine de pierre claire sous abri de bois, bassin, mousses, vapeur froide |
| `bati_ermitage_scriptorium` | `batiments/ermitage-scriptorium.webp` | Scriptorium : salle à hautes fenêtres, pupitres, volets de bois, toit de cuivre verdi |
| `bati_ermitage_clairiere` | `batiments/ermitage-clairiere.webp` | Clairière défrichée : essarts, charbonnière fumante, tas de perches, cabane de charbonnier |
| `bati_ermitage_mur_racines` | `batiments/ermitage-mur-racines.webp` | Mur de racines : rempart vivant d'arbres entrelacés sur soubassement de pierre, passage voûté par les branches |
| `bati_ermitage_capitole` | `batiments/ermitage-capitole.webp` | Cœur des Bois Noirs : sanctuaire de bois et pierre claire adossé à un if colossal, toitures de cuivre, passerelles, source à ses pieds — **le point culminant de la ville** |

### A.4 — Les améliorations

Les quatorze bâtiments d'amélioration (`granit_amelioration_1..7`,
`ermitage_amelioration_1..7`) **ne demandent pas d'image propre dans cette
vague**. Le moteur les pose sur la même emprise que la demeure qu'ils améliorent.
Produisez plutôt, pour chaque demeure, une **variante « améliorée »** si le budget
le permet — sinon le moteur ajoutera un fanion et une réfection de toiture par
code. À traiter en vague 3.

---

## 3. Vague C — la cité en portrait, pour l'iPhone

**C'est le pire écran du jeu, et le jeu se joue sur téléphone.** Le panorama de
cité est en 2048 × 1152, ratio 16:9. Sur un iPhone en portrait il est posté en
boîte aux lettres au milieu de l'écran : bandeau d'image sur environ 28 % de la
hauteur, **et le reste est un aplat bleu-gris mort**. La mesure donne 52 % de
lignes quasi unies.

Six images, **1152 × 2048** (ratio 9:16), sans alpha, catégorie `cite`, dans
`apps/client/public/img/cites/` :

| Clef | Fichier |
|---|---|
| `cite_granit_aube_portrait` | `cites/granit-aube-portrait.webp` |
| `cite_granit_midi_portrait` | `cites/granit-midi-portrait.webp` |
| `cite_granit_crepuscule_portrait` | `cites/granit-crepuscule-portrait.webp` |
| `cite_ermitage_aube_portrait` | `cites/ermitage-aube-portrait.webp` |
| `cite_ermitage_midi_portrait` | `cites/ermitage-midi-portrait.webp` |
| `cite_ermitage_crepuscule_portrait` | `cites/ermitage-crepuscule-portrait.webp` |

**Ce n'est pas un recadrage du paysage existant** : il faut recomposer. Le sujet
s'y prête admirablement — une forteresse sur un éperon et un vallon encaissé sont
des motifs verticaux par nature. Empilez : ciel et crêtes lointaines en haut,
la ville au tiers médian, l'à-pic et la vallée en bas. Gardez **exactement la
même ville, la même heure, la même lumière** que la version paysage
correspondante : le joueur passe de l'une à l'autre en tournant son téléphone.

Les trois heures d'une même faction gardent le même cadrage exact, à la lumière
près — le jeu interpole entre elles.

---

## 4. Vague D — planches de référence des créatures, **non embarquées**

À produire dans `docs/reference/creatures/`, **jamais dans `public/`**. Ce sont
des maquettes qui guident le gréage procédural, pas des images de jeu.

La mesure qui justifie ce choix : sur le champ de bataille les créatures sont
dessinées à environ 40 à 50 px de haut dans des hexagones de 55 px, et
**la bannière de faction posée derrière elles est plus grande et plus saturée que
la figurine**. Elles lisent donc comme des jetons alors que le dessin lui-même
est correct. C'est d'abord un défaut de mise en scène, à corriger dans le code —
remplacer l'image ne le réglerait pas.

Ce dont le gréage a besoin, pour les 28 créatures : **une planche par créature,
1024 × 1024, quatre vues** — profil au repos, profil en attaque, trois-quarts, et
une étude de silhouette en aplat noir. La silhouette est la plus utile : à 50 px
c'est elle seule qui distingue un Loup des Brumes d'un Cerf des Sources.

Ordre de production, du plus utile au moins utile : les quatorze créatures de
rang 5, 6 et 7 d'abord — ce sont elles qu'on regarde et qui décident des
batailles —, puis les rangs 3 et 4, les rangs 1 et 2 en dernier.

---

## 5. Budget

| Poste | Entrées | Taille unitaire | Total |
|---|---|---|---|
| Déjà livré (vague 1) | 43 | — | 4,19 Mo |
| A — bâtiments 512², alpha | 32 | ~90 Ko | ~2,9 Mo |
| C — panoramas portrait | 6 | ~250 Ko | ~1,5 Mo |
| B — objets actifs 88² (§6) | ~25 | ~9 Ko | ~0,2 Mo |
| **Total embarqué** | **~106** | | **~8,8 Mo** |

Le budget déclaré dans le manifeste est de 12 Mo (`budgetOctets: 12582912`) :
on tient, mais sans marge confortable. Deux garde-fous :

1. **Le jeu se charge sur un iPhone en 4G.** Le chargeur borne chaque image à
   25 s et retombe sur le procédural au-delà. Une image trop lourde n'est pas
   seulement lente : elle est perdue.
2. Si une entrée dépasse nettement son enveloppe, **descendez les bâtiments
   secondaires à 384 × 384** et gardez 512 pour les quatorze demeures, les deux
   capitoles et les trois défenses. Le zoom porte surtout sur eux.

La vague D ne compte pas : elle n'est pas embarquée.

---

## 6. Vague B — les objets actifs et le décor de la carte

Le catalogue des natures d'objet va s'allonger avec la densification de la
carte (285 objets aujourd'hui pour une cible de 700 à 880). Mais **tout ce qui
existe déjà est commandable dès maintenant**, et c'est une surface bien plus
large qu'il n'y paraît : des dizaines d'images, chacune remplaçant une entrée
d'atlas par sa seule clef de manifeste, sans une ligne de code.

### La contrainte de lisibilité — la demande explicite du propriétaire

« Les éléments actifs doivent être très jolis et bien visibles, bien distincts
des éléments juste décoratifs. » Un objet actif se lit **en un coup d'œil** au
milieu d'un semis de sapins : silhouette fermée et reconnaissable, palette
nettement plus **saturée** que le terrain, un accent chaud (or, cuivre, grenat)
par objet. Le décor, lui, reste désaturé, dans les verts et les gris du fond.
Le moteur fait le reste — clairière dégagée autour de chaque lieu, terre
foulée au pied, échelle supérieure au décor : tout cela est déjà en place.

### B.1 — Les seize icônes d'objet de carte (immédiat)

`88 × 88` avec alpha, catégorie `prop`, fichiers dans
`apps/client/public/img/carte/`. **Point de contact au sol au milieu de la
base** (le rendu ancre en (0,5 ; 0,78) de la texture). Une entrée par nature,
clef exactement `carte_<kind>` :

`carte_ville` (bourg fortifié) · `carte_village` (hameau à clocheton) ·
`carte_mine` (entrée de galerie boisée, wagonnet) · `carte_ressource` (tas
générique, repli) · `carte_artefact` (coffret ouvragé sur pierre) ·
`carte_garde` (pavois planté, lances croisées) · `carte_borne` (borne armoriée
gravée) · `carte_sanctuaire` (chapelle votive) · `carte_auberge` (relais à
enseigne) · `carte_caravane` (chariot bâché) · `carte_sceau` (stèle scellée de
cire) · `carte_maison_tresor` (porte de trésor dans la roche) ·
`carte_belvedere` (plateforme de guet) · `carte_source` (source captée
fumante) · `carte_quete` (potence à parchemin) · `carte_obstacle` (jamais
dessiné — ne pas produire).

### B.2 — Les sept jetons de ressource (immédiat)

`ressource_<key>`, `88 × 88`, avec alpha : `ecus`, `bois`, `granit`, `fer`,
`sel`, `essence`, `filDor`. Un petit tas peint, brillant, nettement plus saturé
que le sol — c'est lui qu'on voit sur les tas de la carte **et** en annexe des
mines, qui affichent désormais le jeton de ce qu'elles produisent.

### B.3 — Le décor lui-même, par variante (le gros volume)

C'est la réponse à « des dizaines et des dizaines d'items très bien dessinés » :
le décor est substituable **pièce par pièce, variante par variante**, clef
`prop_<nom>_<variante>` (numérotée de 0 à n−1), catégorie `prop`, fichiers dans
`apps/client/public/img/decor/`.

| Décor | Variantes | Clefs |
|---|---|---|
| sapin | 5 | `prop_sapin_0` … `prop_sapin_4` |
| hetre | 5 | `prop_hetre_0` … `prop_hetre_4` |
| rocher | 5 | `prop_rocher_0` … `prop_rocher_4` |
| buisson | 4 | `prop_buisson_0` … `prop_buisson_3` |
| muret | 4 | `prop_muret_0` … |
| croix | 4 | `prop_croix_0` … |
| pont | 4 | `prop_pont_0` … |
| tour | 4 | `prop_tour_0` … |
| ferme | 4 | `prop_ferme_0` … |
| souche | 4 | `prop_souche_0` … |
| fougere | 4 | `prop_fougere_0` … |
| borne | 3 | `prop_borne_0` … |
| moulin | 3 | `prop_moulin_0` … |
| chapelle | 3 | `prop_chapelle_0` … |

Soit **56 images** qui remplacent la forêt répétitive par de vrais arbres
peints. Règles :

- **Le point de contact au sol est à (50 % ; 92 %) de l'image** — c'est l'ancre
  appliquée par le rendu, dimensions libres depuis le correctif des ancres.
  `256 × 384` est un bon gabarit pour un arbre, `256 × 192` pour un rocher.
- **Les variantes d'une même essence doivent différer vraiment** — port,
  penchant, densité du houppier — sans changer d'essence ni de palette : elles
  sont semées côte à côte par milliers.
- **Palette du décor** : verts de sapin et de hêtre, gris de granit, jamais
  d'accent chaud — l'accent chaud est réservé aux objets actifs, c'est lui qui
  porte la distinction demandée.
- Commencer par **sapin et hêtre (10 images)** : à eux deux ils couvrent
  l'écrasante majorité des 32 272 décors semés.

### B.4 — Quand le catalogue s'étend

Chaque nouvelle nature d'objet issue de la densification (demeure extérieure,
moulin à revenu, banque gardée, monolithe, obélisque…) recevra sa clef
`carte_<kind>` au moment où elle entrera dans `MapObjectKind`. La liste sera
ajoutée ici en révision — le mécanisme, lui, ne changera pas.
