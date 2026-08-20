# L'invite exacte à donner à Codex — vague 3

> Le propriétaire a demandé : « si besoin de créer des assets dessinés par codex,
> fais-moi le prompt exact ». Le voici. Le bloc ci-dessous se copie **tel quel**,
> sans rien y ajouter : il porte le contrat, les clefs exactes, les formats, les
> quantités et la façon de vérifier. Tout le reste de ce fichier n'est là que pour
> expliquer les choix ; Codex n'a besoin que du bloc.

---

## 1. Ce qui a changé depuis la première version du brief

Le brief `docs/10-BRIEF-IMAGEGEN-VAGUE-3.md` avertissait, en §2, d'un piège :

> « Les pinceaux de terrain ne sont aujourd'hui lus que par le champ de bataille.
> Le sol de la carte d'aventure est peint pixel par pixel par `render/terrain.ts`
> et n'utilise aucun pinceau. »

**Ce piège n'existe plus.** Le raccordement est écrit et mesuré :
`apps/client/src/art/matiere-sol.ts` lit les tuiles, en fait une carte d'écart
relatif à leur propre moyenne, et `render/terrain.ts` l'applique en multipliant
sur chaque bloc peint. Mesure après raccordement, même scène et même caméra :
**62 % des pixels du sol changent**, écart moyen 5,1 niveaux, p99 à 32.

Conséquences pour la commande :

1. **les six tuiles de base existent déjà et sont maintenant EMPLOYÉES** — les
   redessiner en mieux améliore immédiatement toute la surface de l'écran ;
2. **les six tuiles de PAYS ont désormais du code derrière elles.** Les douze
   cantons les réclament (`apps/client/src/render/cantons.ts`, champ `sol`), un
   repli les fait retomber sur leur matière de base tant qu'elles ne sont pas
   livrées, et un test garde ce repli. Le jour où le fichier arrive sous la bonne
   clef, il est employé **sans une ligne de code à écrire** ;
3. la tuile est posée comme un **écart** et non comme une couleur : la moyenne de
   la tuile est retirée avant application. Cela veut dire, pour le dessinateur,
   que **la couleur moyenne de la tuile ne compte pas** — seule compte sa
   MATIÈRE, c'est-à-dire ce qui s'écarte de sa moyenne. Une tuile d'herbe trop
   jaune ne jaunira pas la carte ; une tuile d'herbe trop lisse ne fera rien du
   tout. Le contraste local est tout, la teinte moyenne n'est rien.

C'est le point le plus important à faire passer, et il est écrit dans le bloc.

---

## 2. L'invite, à copier telle quelle

```
Tu produis les images de la vague 3 du jeu « Heroes of Might and Magic — Auvergne
Edition » (dépôt space-invader-zoo-expo, branche claude/hmm-auvergne-game-uesdlz).

AVANT DE DESSINER, LIS CES DEUX FICHIERS DU DÉPÔT :
  docs/05-ASSETS.md                     ← le contrat : format, manifeste, lumière
  docs/10-BRIEF-IMAGEGEN-VAGUE-3.md     ← la liste et ce que chaque image corrige

RÈGLES DE STYLE, sans exception :
  - lumière unique : soleil au nord-ouest, azimut 315°, élévation 38° ;
    lumière chaude #FFE9C2, ombre froide #3A4657. Aucune source secondaire.
  - palette du Forez : verts de hêtre et de sapin, ocres, granit gris-bleu,
    brun de fougère, grenat. Rien de saturé, rien de néon.
  - aucun texte, aucun cadre, aucun filigrane, aucune signature dans l'image.
  - peinture à la main, matière visible, pas de rendu 3D lisse ni de photo.
  - format WebP qualité 82.

DÉPÔT DES FICHIERS : apps/client/public/img/<dossier>/<nom>.webp
Et une entrée par fichier dans apps/client/public/img/manifeste.json :
  { "clef": "<clef exacte>", "fichier": "<dossier>/<nom>.webp",
    "categorie": "terrain|prop|creature|cite|accueil",
    "largeur": <px>, "hauteur": <px>, "repetable": true|false,
    "octets": <taille>, "invite": "<l'invite exacte>", "graine": <graine> }
UNE CLEF MAL ORTHOGRAPHIÉE NE CASSE RIEN ET NE CHARGE RIEN : le repli procédural
prend la place et personne ne s'en aperçoit. Relis chaque clef deux fois.

═══════════════════════════════════════════════════════════════════════════
VAGUE A — LES MATIÈRES DU SOL. Priorité absolue. Dossier terrain/.
═══════════════════════════════════════════════════════════════════════════
512 × 512, SANS alpha, RÉPÉTABLE SANS COUTURE (obligatoire : "repetable": true),
categorie "terrain".

CE QUI COMPTE, ET C'EST CONTRE-INTUITIF : le moteur retire la moyenne de la tuile
avant de l'appliquer, puis multiplie l'écart sur la couleur que lui-même a
calculée. Donc :
  - la TEINTE MOYENNE de ta tuile n'a aucun effet. Ne cherche pas à assortir la
    couleur du sol du jeu : c'est inutile.
  - seul compte le CONTRASTE LOCAL : le grain, les touffes, les cailloux, les
    fissures, les taches de lichen. Une tuile lisse ne produit rien du tout.
  - pousse donc le micro-contraste et la variété de teinte LOCALE (une touffe
    plus jaune, une pierre plus bleue), sans jamais peindre d'ombre portée : le
    relief est calculé par le moteur et une ombre peinte se battrait avec lui.
  - aucune structure reconnaissable qui se répéterait à l'œil : pas de rocher
    unique, pas de tronc, pas de touffe remarquable. La tuile couvre huit cases
    de carte et revient toutes les huit cases.

Les six tuiles de base — elles EXISTENT déjà et sont employées ; tu les remplaces
par mieux, sous les MÊMES clefs :
  herbe       pâture de moyenne montagne : herbe drue et courte, deux verts,
              pissenlits fanés, crottin sec, traces de piétinement
  aiguilles   tapis de sapinière : aiguilles brunes, cônes tombés, mousse en
              plaques, racines affleurantes
  roche       dalle de granit : gris-bleu, feldspath clair, lichen jaune et gris,
              fissures remplies de terre
  tourbe      tourbière des Sagnes : sphaigne rousse et verte, eau noire dans les
              creux, linaigrette
  gravier     chemin de terre battue : granit concassé, ornières, boue séchée,
              herbe sur la crête centrale
  eau         rivière de montagne : eau claire sur galets, PAS de la mer ; le
              reflet est ajouté par le moteur

Les six tuiles de PAYS — elles sont NOUVELLES, le code les attend déjà, et elles
sont ce qui fera que les douze cantons cessent d'être une simple teinte :
  herbe_estive       Hauts d'Arconsat, Grande Chaussée : herbe rase brûlée par le
                     vent, cailloux affleurants, callune sèche
  herbe_grasse       Vallée de la Durolle, Marche de La Renaudie, Futaies,
                     Sagnes : pré de fauche épais, boutons d'or, ombellifères
  aiguilles_noires   Cœur des Bois Noirs : humus presque noir, aiguilles serrées,
                     rien qui pousse
  roche_carrier      Vollore et Pamole, Hauts d'Arconsat : granit débité de main
                     d'homme, éclats anguleux, poussière de taille
  roche_chaude       Cervières, Maison du Trésor, Hermitage : granit patiné par le
                     soleil, lichen orangé, terre ocre dans les joints
  lande_callune      Pays de Noirétable, Hermitage et Peyrotine : callune en fleur
                     mêlée de myrtille, tourbe sèche, genêt

Douze fichiers pour la vague A. C'est la priorité : le sol occupe cent pour cent
de l'écran pendant toute une partie.

═══════════════════════════════════════════════════════════════════════════
VAGUE B — LE DÉCOR SEMÉ. Priorité 2. Dossier decor/.
═══════════════════════════════════════════════════════════════════════════
AVEC alpha, hauteur au plus 512 px, cadré sur la silhouette avec deux pixels de
marge, PIED DE CONTACT AU BAS EXACT DE L'IMAGE (le semis pose l'objet par son
pied). AUCUNE ombre portée peinte : le moteur la dessine, orientée sud-est et
bleutée. categorie "prop". Clef : prop_<nom>_<variante>, variante à partir de 0.

Cinquante-six de ces images existent déjà (vague 2) : REGARDE d'abord
apps/client/public/img/decor/ et le manifeste, et ne refais que ce qui manque ou
ce qui est manifestement faible. Ce qui manque, dans l'ordre :
  prop_ferme_0..3     4  ferme du Forez : toit de lauzes à quatre pentes, murs de
                         granit, grange accolée, tas de fumier, four à pain
  prop_chapelle_0..2  3  chapelle romane trapue, clocher-mur, toit de lauzes,
                         croix de fer, mur de cimetière bas
  prop_tour_0..3      4  tour de guet en granit, ruinée à des degrés divers,
                         meurtrières, lierre
  prop_moulin_0..2    3  moulin À EAU sur bief, roue à augets, toit de lauzes —
                         surtout pas de moulin à vent
  prop_aiguille_0..4  5  aiguille de granit dressée, arêtes vives, veines de
                         quartz, lichen
  prop_muret_0..3     4  muret de pierre sèche, pierres appareillées à la main,
                         chaperon, brèche, ronces
  prop_croix_0..3     4  croix de chemin : bois grossier, fer forgé, pierre
                         gravée, calvaire à niche
  prop_souche_0..3    4  souche de sapin arrachée, racines en étoile, cœur
                         pourri, mousse
  prop_borne_0..2     3  borne armoriée de granit, écu martelé, mousse
  prop_sapin_0..4     5  sapin pectiné d'altitude, flèche cassée par la neige,
                         branches basses mortes
  prop_hetre_0..4     5  hêtre de futaie, fût lisse et gris, houppier dense,
                         feuilles cuivrées
  prop_rocher_0..4    5  bloc erratique de granit, arrondi, lichen, herbe au pied
  prop_fougere_0..3   4  fougère aigle, frondes retombantes
  prop_buisson_0..3   4  genêt, myrtille, aubépine, ronce
  prop_pont_0..3      4  pont de pierre à une ou deux arches, parapet bas,
                         tablier bombé

═══════════════════════════════════════════════════════════════════════════
VAGUE C — LES ICÔNES DE LIEUX VISITABLES. Priorité 3. Dossier carte/.
═══════════════════════════════════════════════════════════════════════════
AVEC alpha, 256 × 256 au plus, vue de trois quarts haut, pied de contact en bas.
Les clefs sont EXACTEMENT celles-ci :
  carte_demeure          hutte de bûcheron ou abri de berger, feu allumé, armes
  carte_moulin           moulin à eau, sacs empilés, roue
  carte_banque           grotte à l'entrée étayée, coffre entrouvert, ossements
  carte_monolithe        menhir gravé de spirales, halo bleu discret
  carte_obelisque        cairn haut surmonté d'une dalle gravée
  carte_ecole            pierre plate gravée, banc, rouleau posé
  carte_temple           niche de pierre, statuette voilée, ex-voto
  carte_fontaine         vasque de granit, filet d'eau, rubans noués aux branches
  carte_coffre           coffre de chêne cerclé de fer, à demi enterré
  carte_garde_frontiere  chevaux de frise, feu de camp, bouclier planté
  carte_tente_clef       tente de toile écrue, fanion, coffret sur un tabouret
  carte_cartographe      roulotte bâchée, cartes déroulées sur une planche
  carte_marche_noir      étal sous une bâche sombre, balance, capuchon

═══════════════════════════════════════════════════════════════════════════
VAGUE D — LES FONDS DE CHAMP DE BATAILLE. Priorité 4. Dossier combat/.
═══════════════════════════════════════════════════════════════════════════
1024 × 640, SANS alpha, et SURTOUT : AUCUN ÉLÉMENT AU CENTRE — c'est là que les
créatures combattent. Le décor se tient sur le pourtour et à l'horizon. La grille
hexagonale est dessinée par-dessus par l'application. Plus SOMBRE et plus MAT que
les créatures : c'est le contraste qui rend un combat lisible.
  combat_prairie  pré tondu, murets au loin, ciel de traîne
  combat_foret    clairière entourée de fûts, lumière filtrée, fougères
  combat_rocher   chaos granitique, dalles et blocs, herbe rase entre les pierres
  combat_lande    hautes chaumes, callune, horizon nu, vent
  combat_humide   sagne, eau stagnante, joncs, brume basse
  combat_pont     tablier de pierre, rivière de part et d'autre

═══════════════════════════════════════════════════════════════════════════
VAGUE E — RÉFÉRENCES DE CRÉATURES. NON EMBARQUÉES. docs/reference/creatures/
═══════════════════════════════════════════════════════════════════════════
Ces images ne vont PAS dans le manifeste : elles servent de modèle à la sculpture
procédurale. Sept références, trois quarts, à hauteur d'œil, sans décor, sous
notre lumière :
  la TÊTE et l'ENCOLURE d'un cheval de guerre (deux cavaliers à reprendre) ;
  Griffon, Vouivre (dragon serpentiforme sans pattes avant), Sanglier cuirassé,
  Cerf de légende à grande ramure, Colosse de granit.

═══════════════════════════════════════════════════════════════════════════
ORDRE DE LIVRAISON ET VÉRIFICATION
═══════════════════════════════════════════════════════════════════════════
1. les six tuiles de base de la vague A (tout l'écran) ;
2. les six tuiles de PAYS de la vague A (les douze cantons) ;
3. les dix-huit premières images de la vague B (le caractère des pays) ;
4. la vague C, puis le reste de B, puis D, puis E.

Avant de rendre, lance et colle la sortie :
    node tools/validate_asset_manifest.py   (ou l'équivalent présent dans tools/)
    node -e "const m=require('./apps/client/public/img/manifeste.json');\
console.log(m.entrees.length+' entrées');\
for(const e of m.entrees) if(!e.clef||!e.fichier) console.log('INCOMPLET', e)"

Et vérifie que CHAQUE clef que tu as écrite figure dans la liste ci-dessus, au
caractère près. C'est le seul mode de panne qui ne se voit pas.
```

---

## 3. Pourquoi cet ordre, et pas un autre

Le sol d'abord parce qu'il est le seul asset dont la surface à l'écran est de
100 % à tous les zooms, et parce que son raccordement vient d'être écrit : chaque
tuile livrée se voit immédiatement sur toute la carte. Les tuiles de PAYS
remontent en deuxième position — elles étaient troisièmes dans le brief initial —
parce que le code qui les emploie existe désormais et que ce sont elles qui
répondent à « les différentes zones bien délimitées visuellement ».

Le décor vient ensuite parce que cinquante-six silhouettes sont déjà peintes : le
gain marginal y est plus faible qu'il n'y paraît. Les icônes de lieux ensuite, les
fonds de combat en dernier — le champ de bataille a déjà cinq ambiances peintes
en code, c'est le moins nu des quatre chantiers.
