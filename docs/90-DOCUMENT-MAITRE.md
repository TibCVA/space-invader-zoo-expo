Les Comtes du Forez : La Maison du Trésor
Cinq bannières. Deux bastions. Un seul Forez.
Le concept le plus solide n’est pas de reproduire Heroes of Might and Magic III, mais d’en retrouver la grammaire stratégique : exploration par héros, développement quotidien des cités, recrutement hebdomadaire, armées en piles, combats tactiques, artefacts, magie, brouillard de guerre et tension du « dernier tour avant d’arrêter ». Tout l’univers, les règles chiffrées, l’interface, les créatures, les sorts, les textes, les graphismes et la musique doivent cependant être originaux.
L’ambition réaliste est celle d’un successeur spirituel premium, avec une finition « AAA indépendant ». Une première tranche verticale peut être produite avec Claude Code et déployée sur Railway. En revanche, une finition réellement indiscernable d’un grand jeu commercial exigera ensuite des artistes, animateurs, sound designers, testeurs et plusieurs mois de polissage.
￼
1. Vision directrice
1.1 Promesse
Un jeu de stratégie fantasy médiévale au tour par tour dans lequel deux à cinq prétendants se disputent la succession du dernier comte du Forez.
La partie se déroule toujours sur une seule grande carte, représentant les reliefs, villages, vallées et axes de circulation autour de :
	●	Arconsat ;
	●	Chabreloche ;
	●	Le Lac ;
	●	Cervières ;
	●	Viscomtat ;
	●	Noirétable ;
	●	Vollore-Montagne ;
	●	La Renaudie ;
	●	Notre-Dame de l’Hermitage ;
	●	la Maison du Trésor.
La carte est fixe dans sa géographie mais variable dans son contenu : forces neutres, artefacts, quêtes, caravanes, météo, ressources secondaires et événements. Elle doit devenir aussi mémorable qu’un plateau d’échecs : le joueur apprend ses chemins, ses raccourcis, ses embuscades et ses points de bascule, sans que deux parties soient identiques.
1.2 Les sept piliers
	1.	Une carte unique, sans remplissage. Chaque route, clairière et bâtiment a une fonction stratégique.
	2.	Deux factions seulement, mais profondément asymétriques.
	3.	Une géographie authentique transformée en excellent espace de jeu.
	4.	Un hasard borné, visible et maîtrisable.
	5.	Des tours rapides et des décisions lourdes de conséquences.
	6.	La même profondeur sur PC et iPhone.
	7.	Une simulation déterministe et vérifiable pour garantir la confiance en PvP.
1.3 Ton de l’univers
Le jeu se situe dans un Forez légendaire, inspiré de la période allant approximativement du XIIe au XVe siècle, sans prétendre reconstituer une année historique précise.
L’identité visuelle doit associer :
	●	granit sombre ;
	●	forêts de sapins et de hêtres ;
	●	brumes d’altitude ;
	●	chemins encaissés ;
	●	foires, péages et gabelle ;
	●	broderie au fil d’or ;
	●	bornes armoriées ;
	●	sources sacrées ;
	●	légendes de vouivres et de pierres vivantes.
Cervières constitue une référence artistique majeure : bourg fortifié, maisons de granit, portes des Farges et de Bise, mémoire des comtes du Forez et tradition de broderie au fil d’or. La Maison du Trésor est particulièrement pertinente pour le jeu puisqu’elle est associée aux gabelous et à une limite entre territoires soumis ou non à la gabelle. (loireforez.fr)
￼
2. Cadre narratif
2.1 Le point de départ
Le dernier comte reconnu meurt sans héritier incontestable. Le Grand Livre contenant les serments, dettes, droits de passage et titres de propriété est scellé dans la Maison du Trésor.
Cinq bannières lèvent leurs armées. Chacune prétend représenter l’avenir du pays, mais les seigneurs sont partagés entre deux traditions :
	●	la Châtellenie de Granit, qui défend l’ordre féodal, les marchés, les remparts et la force des chartes ;
	●	l’Ermitage des Bois Noirs, qui protège les sources, les forêts, les chemins de pèlerinage et les anciens pactes.
Pour être reconnu comme nouveau comte ou nouvelle comtesse, un prétendant doit obtenir trois des cinq Sceaux des Marches, ouvrir la Maison du Trésor et y maintenir sa proclamation pendant trois rondes complètes.
2.2 Une fiction non manichéenne
Aucune faction n’est « bonne » ou « mauvaise ».
La Châtellenie apporte sécurité, routes, marchés et justice, mais peut devenir autoritaire et fiscalement oppressive.
L’Ermitage protège les équilibres naturels et les communautés, mais peut se montrer isolationniste, superstitieux ou hostile au commerce.
Le conflit est celui de deux visions du territoire, pas celui de la lumière contre les ténèbres.
￼
3. La carte unique
3.1 Emprise de travail
L’emprise de capture recommandée est approximativement :
	●	ouest : longitude 3,640 ;
	●	est : longitude 3,800 ;
	●	sud : latitude 45,720 ;
	●	nord : latitude 45,900.
Après projection en Lambert-93, cela représente environ 12,2 kilomètres d’ouest en est et 20,1 kilomètres du nord au sud.
La grille logique recommandée est de :
	●	256 colonnes × 416 lignes ;
	●	environ 48 mètres par case ;
	●	blocs techniques de 32 × 32 cases ;
	●	déplacement dans huit directions sur la carte d’aventure ;
	●	relief graphiquement exagéré d’environ 30 %, mais sans modifier les calculs de déplacement.
Ce niveau de résolution permet de conserver la position relative des villages, les vallées et les principaux axes, tout en offrant assez d’espace pour un jeu stratégique.
3.2 Ancrages géographiques
Positions de prototype sur la grille :
	●	Arconsat : colonne 117, ligne 25 ;
	●	Chabreloche : 90, 48 ;
	●	Le Lac : 111, 95 ;
	●	Col des Sagnes : 100, 113 ;
	●	Maison du Trésor : 145, 113 ;
	●	Cervières : 214, 119 ;
	●	Viscomtat : 58, 165 ;
	●	Noirétable : 202, 189 ;
	●	Notre-Dame de l’Hermitage : 125, 250 ;
	●	Vollore-Montagne : 55, 264 ;
	●	La Renaudie : 132, 378.
Ces coordonnées de jeu sont des conversions de travail, pas les positions finales des sprites. Les coordonnées géographiques des villages ont été normalisées à partir des sources topographiques disponibles. (fr.wikipedia.org)
3.3 Localisation de la Maison du Trésor
La Base Adresse Locale de Cervières contient deux bâtiments certifiés sur le Chemin du Trésor :
	●	n° 1 : latitude 45,8513476 ; longitude 3,7318868 ;
	●	n° 2 : latitude 45,8516572 ; longitude 3,7296742.
Pour le prototype, l’ancre de la Maison du Trésor peut être placée au milieu de ce petit ensemble :
	●	latitude 45,8515024 ;
	●	longitude 3,7307805.
Cette ancre se trouve à environ 1,85 kilomètre à vol d’oiseau à l’est du hameau du Lac. Elle est suffisamment précise pour la carte grise. En revanche, les données d’adresse ne permettent pas à elles seules d’identifier avec une certitude absolue lequel des deux bâtiments est l’édifice historique : ce point doit être vérifié sur le terrain, sur les données cadastrales/IGN détaillées ou auprès de la commune avant le verrouillage artistique de la carte. (adresse.data.gouv.fr)
3.4 Contrat de fidélité géographique
La carte doit respecter cinq règles :
Ancrages nommés. L’écart final entre la position réelle et la position de jeu d’un village ou monument doit être inférieur à une case, soit environ 50 mètres.
Topologie. L’ordre relatif des lieux, les directions principales, les traversées de vallées et les connexions routières doivent rester exacts.
Relief. Les altitudes et pentes sont calculées à partir d’un modèle numérique de terrain. Seule la représentation visuelle est exagérée.
Hydrographie. La Durolle, les ruisseaux et les franchissements doivent conserver leur logique réelle.
Adaptation ludique. La largeur des chemins, certaines clairières, les zones constructibles et quelques passages secondaires peuvent être ajustés pour la lisibilité et l’équilibrage.
L’IGN propose des services d’altimétrie par points et profils, des modèles de terrain LiDAR HD en licence ouverte ainsi que des flux BD TOPO actualisés. Ils constituent une base nettement préférable aux tuiles Google pour fabriquer la carte distribuée avec le jeu. Les captures Google fournies doivent rester des références visuelles privées et ne pas devenir des assets du jeu. (geoplateforme.pages.gpf-tech.ign.fr)
3.5 Les douze régions de jeu
1. Les Hauts d’Arconsat
Départ nord. Forêts, sources de la Durolle, relief prononcé et abondance de bois. Position défensive, mais accès au centre canalisé par deux passages.
2. La Vallée de la Durolle
Chabreloche devient un grand relais marchand neutre. C’est la route la plus rapide entre le nord et l’ouest, mais aussi la plus exposée aux raids.
3. Le Lac et les Sagnes
Zone de transition vers la Maison du Trésor. Chemins étroits, caravanes, cols et lisières.
Le nom « Le Lac » désigne le hameau : il ne faut pas inventer un immense plan d’eau simplement à cause de son nom.
4. La Maison du Trésor
Centre stratégique. Clairière fortifiée, bornes armoriées, ancien poste de contrôle du sel et objectif de victoire.
5. La Châtellenie de Cervières
Départ est. Bourg en hauteur, défense forte, ateliers de fil d’or, deux portes et belvédère.
6. Les Futaies de Viscomtat
Départ ouest. Forêts très denses, chemins secrets et production d’Essence sylvestre.
7. Le Cœur des Bois Noirs
Zone neutre dangereuse. Sapinières-hêtraies, brumes et secteurs humides d’altitude. Les meilleures reliques naturelles y sont gardées.
8. Le Pays de Noirétable
Départ sud-est. Carrefour commercial et militaire, adapté à l’expansion rapide.
9. L’Hermitage et Peyrotine
Sanctuaire majeur, source et lieu de pèlerinage. Notre-Dame de l’Hermitage se situe réellement à environ 1 110 mètres, dans un vallon forestier entre Loire et Puy-de-Dôme. (notredame-hermitage-noiretable.fr)
10. Vollore et Pamole
Hautes terres sud-ouest, carrières de granit et points d’observation. Pierre Pamole devient un objectif de sceau et un observatoire révélant une large partie du sud.
11. La Marche de La Renaudie
Départ sud. Position plus éloignée du centre, compensée par de bonnes réserves initiales, une croissance supérieure et un relais de borne accessible plus tôt.
12. La Grande Chaussée des Marchands
Réinterprétation médiévale du grand corridor moderne visible sur la carte. Ce n’est jamais une autoroute moderne, mais une chaussée commerciale rapide avec péages, ponts et postes de garde.
3.6 Les cinq positions de départ
	1.	Arconsat ;
	2.	Viscomtat ;
	3.	Cervières ;
	4.	Noirétable ;
	5.	La Renaudie.
Chabreloche, Le Lac, Vollore-Montagne et Notre-Dame de l’Hermitage restent des centres neutres capturables.
Chaque position de départ accepte indifféremment l’un des deux types de château. Ainsi, cinq joueurs peuvent employer seulement deux factions sans que la géographie impose leur choix.
Pour les parties à deux, trois ou quatre joueurs, les positions ne doivent pas être tirées librement. Le jeu utilise des combinaisons prédéfinies et équilibrées. Les capitales inoccupées deviennent des seigneuries neutres fortifiées.
￼
4. Rejouabilité d’une carte fixe
La géographie ne change jamais. En revanche, chaque partie reçoit une graine déterministe qui modifie :
	●	les compositions des gardes ;
	●	les artefacts présents ;
	●	les quêtes de village ;
	●	les marchandises des caravanes ;
	●	les événements de semaine ;
	●	les gisements secondaires ;
	●	les fronts météorologiques ;
	●	les recrues de tavernes ;
	●	l’emplacement précis des caches dans des emplacements autorisés.
Les routes majeures, villages, cols, sources, portes, Maison du Trésor et objectifs de sceaux restent fixes.
Pour les parties classées, seules des graines certifiées sont utilisées. Chacune doit être testée par des milliers de simulations automatiques avant d’entrer dans la rotation.
￼
5. Les deux types de château
5.1 Châtellenie de Granit
Identité
Féodale, marchande, militaire et architecturée.
Ses forces :
	●	défense ;
	●	formations ;
	●	économie ;
	●	tir perforant ;
	●	cavalerie ;
	●	siège ;
	●	contrôle des routes.
Ses faiblesses :
	●	armées relativement coûteuses ;
	●	mobilité médiocre en forêt ;
	●	dépendance au Fer et au Fil d’or ;
	●	magie moins flexible.
Architecture
Le château est bâti sur plusieurs niveaux :
	●	soubassements de granit noir ;
	●	portes de bois ferré ;
	●	toits d’ardoise ;
	●	ruelles étroites ;
	●	ateliers éclairés d’une lumière chaude ;
	●	halle du sel ;
	●	bannières grenat et or ;
	●	griffonnière sur la partie haute.
Mécanique de faction : Serment de Pierre
Deux piles alliées adjacentes peuvent former une ligne :
	●	+2 défense ;
	●	+10 % aux ripostes ;
	●	immunité au premier déplacement forcé ;
	●	mais -1 vitesse tant que la formation reste active.
Le joueur doit choisir entre tenir une ligne solide et conserver sa mobilité.
Bâtiments essentiels
	●	Salle des comptes, trois niveaux ;
	●	Halle du Sel ;
	●	Marché ;
	●	Auberge des Bannières ;
	●	Guilde des Arts, cinq niveaux ;
	●	Forge comtale ;
	●	Palissade, rempart puis tours ;
	●	Porte des Farges ;
	●	Maison des Grenadières ;
	●	Écuries du Forez ;
	●	Aiguille de Pamole ;
	●	Serment des Comtes, bâtiment ultime.
Menagerie
Rang 1 — Manant → Franc-Serf Infanterie nombreuse. Le Franc-Serf tient la ligne et résiste aux déplacements forcés.
Rang 2 — Gabelou → Prévôt du Sel Garde de contrôle. Ses attaques ralentissent les ennemis. Le Prévôt exerce une zone de contrôle qui arrête le premier ennemi la traversant.
Rang 3 — Arbalétrier des Farges → Maître-Arbalétrier Tireur lourd. Les tirs lointains ralentissent. L’amélioration ignore 20 % de la défense.
Rang 4 — Grenadière d’Or → Dame au Fil d’Or Artisane-guerrière et soutien. Le terme « Grenadière » renvoie ici à la tradition locale de broderie au fil d’or, notamment d’emblèmes en forme de grenade, et non à une unité utilisant des explosifs. Sa broderie de guerre augmente le moral et dissipe l’hésitation. (loireforez.fr)
Rang 5 — Sanglier Cuirassé → Verrat de Granit Créature de charge. Les dégâts augmentent avec la distance parcourue. Le Verrat repousse sa cible après une longue charge.
Rang 6 — Chevalier du Forez → Banneret de Cervières Cavalerie de choc. Le Banneret porte un étendard qui augmente le moral de toute l’armée.
Rang 7 — Griffon de Pamole → Griffon Couronné Créature volante d’interception. Le Griffon Couronné peut riposter jusqu’à trois fois par round.
Statistiques de départ pour le prototype
Les chiffres ci-dessous sont une base de test, pas un équilibrage définitif :
	●	Manant : 4 PV, attaque 2, défense 2, dégâts 1–2, vitesse 4, croissance 18 ;
	●	Gabelou : 12 PV, 5/6, dégâts 2–4, vitesse 5, croissance 12 ;
	●	Arbalétrier : 20 PV, 8/6, dégâts 4–7, vitesse 5, croissance 8 ;
	●	Grenadière : 34 PV, 10/12, dégâts 6–10, vitesse 6, croissance 6 ;
	●	Sanglier : 65 PV, 15/14, dégâts 11–17, vitesse 8, croissance 4 ;
	●	Chevalier : 115 PV, 20/19, dégâts 20–30, vitesse 9, croissance 2 ;
	●	Griffon : 235 PV, 27/25, dégâts 38–55, vitesse 11, croissance 1.
5.2 Ermitage des Bois Noirs
Identité
Sylvestre, monastique, mystique et mobile.
Ses forces :
	●	terrain ;
	●	reconnaissance ;
	●	embuscade ;
	●	guérison ;
	●	entraves ;
	●	initiative ;
	●	magie des Brumes et des Sources.
Ses faiblesses :
	●	sièges plus difficiles ;
	●	moins de tireurs lourds ;
	●	première ligne fragile avant les rangs supérieurs ;
	●	dépendance à l’Essence sylvestre.
Architecture
	●	pierres de granit absorbées par les racines ;
	●	passerelles de bois ;
	●	sources et bassins ;
	●	toits de cuivre verdi ;
	●	cierges ;
	●	cellules de pèlerins ;
	●	clairières éclairées par la lune ;
	●	nid de vouivre au sommet.
Mécanique de faction : Mémoire de la Forêt
La faction reçoit des effets selon le terrain :
	●	forêt : déplacement amélioré et camouflage ;
	●	source : récupération de mana ;
	●	hauteur : vision accrue ;
	●	brume : initiative et flanc ;
	●	terrain rocheux : défense des Colosses.
Bâtiments essentiels
	●	Hospice des Pèlerins ;
	●	Scriptorium ;
	●	Clairière des Échanges ;
	●	Cercle des Arts, cinq niveaux ;
	●	Source consacrée ;
	●	Haie vive et mur de racines ;
	●	Clairière des Chouettes ;
	●	Chenil des Brumes ;
	●	Loge des Veneurs ;
	●	Bassin des Cerfs ;
	●	Cercle des Colosses ;
	●	Nid de la Vouivre ;
	●	Cœur des Bois Noirs, bâtiment ultime.
Menagerie
Rang 1 — Pèlerin → Pénitent Blanc Unité nombreuse de soutien. Le Pénitent récupère une petite partie de ses pertes après une victoire.
Rang 2 — Chouette Hulotte → Chouette Oraculaire Éclaireur volant rapide. L’amélioration révèle le prochain résultat de fortune visant son armée.
Rang 3 — Loup des Bois Noirs → Loup des Brumes Unité de meute. Le Loup des Brumes ne subit pas de riposte lorsqu’il attaque de flanc.
Rang 4 — Veneur Sylvestre → Garde-Futaie Tireur forestier. Bénéficie d’un camouflage et peut accentuer les ralentissements.
Rang 5 — Cerf des Sources → Cerf Miraculeux Créature de soutien qui soigne les unités proches. L’amélioration peut purifier les effets négatifs.
Rang 6 — Colosse de Granite → Colosse de Pamole Construct extrêmement résistant. L’amélioration peut lancer trois blocs de pierre par combat.
Rang 7 — Vouivre de la Durolle → Vouivre Couronnée Créature volante venimeuse. L’amélioration souffle dans une ligne de trois hexagones.
Statistiques de départ
	●	Pèlerin : 5 PV, attaque 2, défense 3, dégâts 1–2, vitesse 4, croissance 18 ;
	●	Chouette : 11 PV, 6/4, dégâts 2–4, vitesse 8, croissance 12 ;
	●	Loup : 22 PV, 9/7, dégâts 4–7, vitesse 8, croissance 8 ;
	●	Veneur : 36 PV, 11/10, dégâts 7–11, vitesse 7, croissance 6 ;
	●	Cerf : 70 PV, 14/16, dégâts 11–18, vitesse 8, croissance 4 ;
	●	Colosse : 130 PV, 18/23, dégâts 20–29, vitesse 6, croissance 2 ;
	●	Vouivre : 245 PV, 28/23, dégâts 40–58, vitesse 12, croissance 1.
￼
6. Les vingt-et-un héros
Tous les portraits humains répondent à la contrainte demandée : personnages blancs d’apparence européenne. Pour éviter une galerie uniforme, il faut varier fortement les âges, morphologies, coiffures, fonctions, expressions et vêtements. Aucun portrait ne doit reproduire une personne réelle.
6.1 Héros de la Châtellenie
Paul — Castellan, Élan des Bannerets Spécialiste de la cavalerie et des dégâts de charge.
Thibaut — Sénéchal, Maître des chemins Spécialiste de la logistique et des changements de terrain.
Loïc — Sénéchal, Gabelle juste Augmente les revenus du Sel tout en limitant l’agitation.
Matthieu — Castellan, Briseur de portes Spécialiste des sièges, remparts et machines.
Clotilde — Sénéchale, Main d’or Renforce les Grenadières et leurs effets de soutien.
Caroline — Sénéchale, Intendante des Marches Réduit le coût des premières constructions de la semaine.
Thomas — Castellan, Œil des Farges Spécialiste des Arbalétriers et de la reconnaissance.
Georges — Castellan, Mur de granit Excellent gouverneur et défenseur de garnison.
Auguste — Sénéchal, Voix du Comte Commandement, moral et influence politique.
Joséphine — Sénéchale, Pactes de village Obtient plus rapidement la faveur des communautés.
6.2 Héros de l’Ermitage
Anastasia — Prieure, Dame des Brumes Réduit le coût des sorts de Brumes et prolonge leur durée.
Mathilde — Prieure, Eaux réparatrices Spécialiste des soins et de la résurrection limitée.
Agathe — Veneuse, Œil de la Hulotte Grande vision, repérage et bonus aux Chouettes.
Roxane — Veneuse, Pas sans trace Camouflage, embuscades et attaques de flanc.
Jean — Veneur, Chef de meute Améliore progressivement les Loups.
Adèle — Prieure, Enfant des Racines Renforce les entraves et les invocations végétales.
Inès — Prieure, Chemins de dévotion Tire un bénéfice cumulatif des sanctuaires visités.
Gustave — Veneur, Poing de Pamole Améliore les Colosses et leurs dégâts contre les murs.
Côme — Prieur, Lecture du ciel Prévoit la météo un jour plus tôt et peut retarder un front.
Lise — Prieure, Sang de la Durolle Renforce les Vouivres et leur venin.
6.3 Héros neutre
Jules — Gardien des Bornes
Jules est débloqué après la quête centrale du Grand Livre. Il choisit son allégeance lorsqu’il est recruté et utilise gratuitement une borne armoriée par jour.
Il ne doit pas être simplement « meilleur » que les autres : sa puissance réside dans sa mobilité et sa connaissance de la carte.
￼
7. Ressources et économie
7.1 Les sept ressources
	●	Écus : construction, recrutement, commerce et rançons ;
	●	Bois : bâtiments, palissades et logements ;
	●	Granit : fortifications et constructions supérieures ;
	●	Fer : armures, unités lourdes et améliorations ;
	●	Sel : commerce, gabelle et protection ;
	●	Essence sylvestre : magie et unités de l’Ermitage ;
	●	Fil d’or : étendards, prestige et unités de la Châtellenie.
7.2 Principes économiques
Une capitale produit initialement 1 000 écus par jour.
Chaque cité peut réaliser une seule construction par jour.
La croissance des créatures a lieu tous les sept jours.
Le nombre de héros est limité à quatre par joueur. Cette limite évite la prolifération de petits héros servant seulement à transporter des troupes, particulièrement pénible sur téléphone.
7.3 Charte des villages
Lors de la première prise de contrôle d’un village, le joueur choisit l’une des trois chartes :
	●	marchande : revenus et taux de change ;
	●	militaire : milice et recrutement ;
	●	spirituelle : mana, soins et réputation.
La décision est permanente jusqu’à la prise du village par un adversaire.
7.4 Identité des localités
	●	Arconsat : bois et reconnaissance ;
	●	Chabreloche : marché et relais ;
	●	Le Lac : caravanes de Sel ;
	●	Cervières : défense et Fil d’or ;
	●	Viscomtat : Essence sylvestre et embuscades ;
	●	Noirétable : revenus et recrutement ;
	●	Vollore-Montagne : Granit et vision ;
	●	La Renaudie : croissance et réserves ;
	●	Notre-Dame de l’Hermitage : mana, guérison et réputation.
7.5 La gabelle
Le détenteur de la Maison du Trésor choisit une politique :
Franchise Faibles revenus, forte faveur, routes sûres.
Droit mesuré Revenus et agitation équilibrés.
Forte gabelle Revenus élevés, mais apparition de contrebandiers, risque de révolte et détérioration de la faveur.
Cette mécanique constitue un système d’anti-emballement : le joueur dominant peut gagner davantage, mais crée simultanément de nouveaux risques autour de son domaine.
￼
8. Exploration et mouvement
8.1 Coûts de terrain
Base de prototype, en points de marche :
	●	grande route : 70 ;
	●	chemin : 85 ;
	●	prairie : 100 ;
	●	forêt : 125 ;
	●	forte pente : 145 ;
	●	zone humide : 160 ;
	●	rivière : infranchissable hors pont ou gué.
Un héros dispose généralement de 1 800 à 2 200 points de marche par jour.
Le chemin affiché doit comporter des marqueurs indiquant le jour d’arrivée. Le joueur sait immédiatement si une destination est atteignable aujourd’hui ou le lendemain.
8.2 Brouillard de guerre
Trois états :
	●	inconnu ;
	●	exploré mais non visible ;
	●	visible actuellement.
Le relief intervient réellement dans la vision. Une crête, le belvédère de Cervières ou Pierre Pamole permettent de voir plus loin. Une forêt dense bloque la vision.
8.3 Bornes armoriées
Les bornes constituent un réseau de déplacement tardif :
	●	destinations fixes ;
	●	activation payante ;
	●	seulement entre bornes découvertes ;
	●	nombre d’utilisations limité ;
	●	trajet visible pour les adversaires proches.
Ce système réduit les temps morts sur une carte très allongée sans détruire sa géographie.
￼
9. Météo
La météo est annoncée deux jours à l’avance afin de créer des choix, pas des surprises arbitraires.
Éclaircie Aucun modificateur.
Pluie Coût des routes légèrement accru et Sources renforcées.
Brume Vision et dégâts à distance réduits ; attaques de flanc favorisées.
Givre Déplacement en forêt plus coûteux ; magie des Braises renforcée.
Vent des crêtes Unités volantes plus rapides ; tirs lointains moins précis.
Côme peut décaler l’arrivée d’un front d’un jour, une fois par semaine.
￼
10. Magie
Quatre écoles originales, séparées des compétences secondaires.
Braises
Forge, feu, attaque et siège :
	1.	Étincelle des Farges ;
	2.	Acier tempéré ;
	3.	Cendre aux yeux ;
	4.	Trait incandescent ;
	5.	Mur de braises ;
	6.	Marteau rouge ;
	7.	Fournaise du rempart ;
	8.	Couronne de feu ancien.
Sources
Soin, eau, protection et déplacement :
	1.	Rosée vive ;
	2.	Gué clair ;
	3.	Eau réparatrice ;
	4.	Voile de pluie ;
	5.	Source miraculeuse ;
	6.	Courant de la Durolle ;
	7.	Lit de la Vierge ;
	8.	Fontaine de l’Alliance.
Brumes
Dissimulation, illusion et initiative :
	1.	Brume basse ;
	2.	Pas effacé ;
	3.	Reflet du Lac ;
	4.	Chouette silencieuse ;
	5.	Brouillard de Pamole ;
	6.	Échange des ombres ;
	7.	Nuit des Bois Noirs ;
	8.	Voile du Forez.
Racines
Terrain, entrave, invocation et défense :
	1.	Écorce du fayard ;
	2.	Ronce vive ;
	3.	Futaie vigilante ;
	4.	Appel de la meute ;
	5.	Racines profondes ;
	6.	Pierre levée ;
	7.	Cercle des bornes ;
	8.	Mémoire de la forêt.
Les sorts doivent être enregistrés dans des fichiers de données, et non codés directement dans les composants graphiques. Les valeurs numériques doivent pouvoir être modifiées sans recompilation de l’interface.
￼
11. Progression des héros
11.1 Caractéristiques primaires
	●	Vaillance : attaque physique des troupes ;
	●	Garde : défense ;
	●	Mystique : puissance magique ;
	●	Savoir : mana et apprentissage.
11.2 Compétences secondaires
Chaque héros peut en posséder huit au maximum, avec trois rangs : Novice, Expert et Maître.
Les vingt compétences initiales sont :
	●	Logistique ;
	●	Tactique ;
	●	Seigneurie ;
	●	Intendance ;
	●	Diplomatie ;
	●	Reconnaissance ;
	●	Sylviculture ;
	●	Pèlerinage ;
	●	Forges ;
	●	Balistique ;
	●	Guérison ;
	●	Érudition ;
	●	Occultisme ;
	●	Commandement ;
	●	Fortune ;
	●	Embuscade ;
	●	Commerce ;
	●	Cartographie ;
	●	Résistance ;
	●	Invocation.
Le niveau maximal recommandé est 30. À chaque niveau, le joueur choisit entre deux propositions ; il ne doit jamais être forcé d’accepter une compétence inutile.
￼
12. Combats tactiques
12.1 Terrain
	●	grille hexagonale de 15 colonnes × 11 lignes ;
	●	sept piles maximum par armée ;
	●	unités de taille un ou deux hexagones ;
	●	obstacles et couvert liés à la région de la carte ;
	●	deux à trois rangées de déploiement selon Tactique.
12.2 Actions
	●	se déplacer ;
	●	attaquer ;
	●	attendre ;
	●	défendre ;
	●	utiliser une capacité ;
	●	lancer un sort ;
	●	se rendre.
Une pile riposte une fois par round, sauf aptitude explicite.
Le héros lance au maximum un sort par round.
12.3 Formule de dégâts
La formule doit être originale, simple et déterministe :
```text id="unmqy4" dégâts_de_base =     nombre_de_créatures     × entier_uniforme(dégâts_minimum, dégâts_maximum)  multiplicateur_attaque_défense =     borne(         10 000 + 450 × (attaque - défense),         minimum 3 500,         maximum 30 000     )  dégâts_finaux =     plancher(         dégâts_de_base         × multiplicateur_attaque_défense         × modificateurs_de_capacité         × modificateurs_de_terrain         / 10 000     ) ```
Tous les calculs utilisent des entiers ou des points de base. Aucune dépendance au nombre à virgule flottante ne doit intervenir dans la simulation autoritaire.
Avant une attaque, l’interface affiche :
	●	fourchette de dégâts ;
	●	nombre probable de pertes ;
	●	riposte possible ;
	●	effets appliqués ;
	●	raison de chaque modificateur.
12.4 Moral
De -3 à +3.
Un moral positif peut provoquer un Élan : demi-mouvement supplémentaire et attaque de base, au maximum une fois par pile et par round.
Un moral négatif ne doit jamais faire perdre entièrement un tour. Il réduit l’initiative et bloque éventuellement la capacité active, ce qui est pénalisant sans être exaspérant.
12.5 Fortune
La Fortune modifie les dégâts de façon bornée. L’interface signale toujours qu’un résultat de Fortune s’est produit.
Aucun coup critique ne doit éliminer une armée comparable en un seul jet.
12.6 Sièges
Chaque faction possède son propre champ de bataille de siège :
	●	porte ;
	●	trois segments de mur ;
	●	deux tours ;
	●	cour intérieure ;
	●	obstacles de faction.
Les murs ont trois états visuels : intact, fissuré et effondré.
Pour le premier prototype, il faut éviter une simulation balistique trop complexe. Les projectiles de siège ciblent un segment et appliquent des dégâts déterministes.
12.7 Défaite d’un héros
Un héros vaincu :
	●	perd son armée ;
	●	perd ses artefacts non liés ;
	●	devient indisponible pendant deux jours ;
	●	peut être racheté plus tôt dans sa capitale.
Cela maintient l’importance d’une défaite sans provoquer une élimination irréversible au premier mauvais combat.
￼
13. Conditions de victoire
13.1 Mode principal : La Couronne du Forez
Cinq Sceaux des Marches sont répartis sur la carte. Un joueur doit en obtenir trois.
Les sceaux peuvent correspondre à :
	●	Sceau des Hautes-Futaies ;
	●	Sceau des Farges ;
	●	Sceau de Pamole ;
	●	Sceau de l’Hermitage ;
	●	Sceau des Brumes.
Une fois trois sceaux acquis :
	1.	la Maison du Trésor peut être ouverte ;
	2.	sa garde doit être vaincue ;
	3.	le joueur proclame sa légitimité ;
	4.	il doit tenir le site pendant trois rondes complètes.
La proclamation est annoncée à tous. Le compte à rebours est visible. Les autres joueurs disposent donc d’une dernière coalition naturelle contre le prétendant.
13.2 Modes alternatifs
Dernière Bannière Élimination totale.
Maître des Marches Contrôler cinq centres majeurs pendant deux rondes.
Chronique des douze semaines Victoire au score : sceaux, villages, armée, réputation et trésor.
13.3 Durées
Éclair 8 semaines, 60 à 90 minutes, mouvement +15 %, bornes ouvertes plus tôt.
Standard 12 semaines, environ 2 h 30 à 4 heures. Mode de référence.
Saga 16 semaines, 4 à 8 heures ou jeu asynchrone.
￼
14. Multijoueur
14.1 Formats
	●	deux à cinq joueurs en ligne ;
	●	jeu asynchrone ;
	●	mode local « Même table » ;
	●	bots pour compléter une partie ;
	●	entraînement solo.
14.2 Tour séquentiel
Un seul joueur modifie l’état du monde à la fois.
Pendant l’attente, les autres peuvent :
	●	inspecter la carte ;
	●	consulter leurs cités ;
	●	préparer une file de construction ;
	●	calculer un trajet ;
	●	examiner les héros et armées.
Ces actions restent prévisionnelles et ne sont validées qu’au début de leur tour.
14.3 Minuteurs
	●	90 secondes ;
	●	3 minutes ;
	●	5 minutes ;
	●	sans limite ;
	●	24 heures en asynchrone.
En combat, chaque activation peut recevoir une limite distincte de 30 à 60 secondes.
14.4 Équité
L’ordre des joueurs est tiré au sort. Les positions jouant plus tard reçoivent une petite compensation de départ calibrée par simulation.
Il ne doit exister aucune aide secrète au joueur perdant dans le mode classé. Les mécanismes d’anti-emballement sont publics : entretien des grandes armées, agitation fiscale, milices, quêtes et géographie.
￼
15. Interface PC
Carte d’aventure
	●	barre des ressources en haut ;
	●	portraits des héros à gauche ;
	●	minimap et ordre des joueurs à droite ;
	●	actions contextuelles en bas ;
	●	journal repliable ;
	●	raccourcis clavier ;
	●	zoom à la molette ;
	●	glissement avec bouton central ou bord d’écran ;
	●	clic simple pour sélectionner ;
	●	second clic pour confirmer un chemin.
Cité
La cité n’est pas une grille de boutons. C’est un tableau vivant en parallaxe :
	●	clic sur les bâtiments ;
	●	construction visuellement intégrée ;
	●	éclairage évoluant selon l’heure ;
	●	fumée de forge, eau, oiseaux, bannières ;
	●	comparaison immédiate entre bâtiment actuel et amélioration.
Combat
	●	barre d’initiative en haut ;
	●	fiche de la pile sélectionnée à gauche ;
	●	actions en bas ;
	●	historique et modificateurs à droite ;
	●	maintien d’une touche pour afficher toutes les zones de menace.
￼
16. Interface iPhone
Le jeu doit être conçu pour le tactile dès le départ, pas adapté à la fin.
16.1 Principes
	●	cible tactile minimale de 48 pixels CSS ;
	●	aucun texte indispensable en dessous de 14–15 pixels CSS ;
	●	respect des zones sûres de l’iPhone ;
	●	carte plein écran ;
	●	menus en panneaux remontant depuis le bas ;
	●	informations secondaires masquées par défaut ;
	●	aucune fonction essentielle dépendant du survol.
16.2 Gestes de la carte
	●	glisser : déplacer la caméra ;
	●	pincer : zoomer ;
	●	toucher un héros : sélectionner ;
	●	toucher une destination : prévisualiser le chemin ;
	●	toucher une seconde fois : confirmer ;
	●	appui long : inspecter sans agir ;
	●	bouton Annuler visible tant que l’ordre n’est pas exécuté ;
	●	toucher le portrait du héros : recentrer ;
	●	double toucher sur une cité : ouvrir la cité.
16.3 Barre de pouce
Cinq commandes seulement :
	1.	héros ;
	2.	cité ;
	3.	carte ;
	4.	objectifs ;
	5.	fin du tour.
Les fonctions supplémentaires apparaissent dans un panneau contextuel.
16.4 Orientation
Le jeu reste entièrement utilisable en portrait pour :
	●	l’accueil ;
	●	la salle des bannières ;
	●	la gestion des cités ;
	●	l’examen des héros ;
	●	la carte d’aventure.
Le paysage est recommandé pour les combats mais ne doit pas être strictement obligatoire. L’interface de combat portrait utilise un panneau inférieur rétractable et une grille légèrement plus verticale.
16.5 Prévention des erreurs
Toute action irréversible suit le rythme :
	1.	sélection ;
	2.	prévisualisation ;
	3.	confirmation.
La fin du tour affiche les alertes :
	●	héros encore mobile ;
	●	cité pouvant construire ;
	●	unités non recrutées ;
	●	armée menacée ;
	●	sceau ou Maison du Trésor en danger.
16.6 Accessibilité
	●	échelle de texte ;
	●	mode contraste renforcé ;
	●	motifs en plus des couleurs pour les cinq joueurs ;
	●	réduction des animations ;
	●	sous-titres ;
	●	navigation clavier ;
	●	étiquettes VoiceOver pour toute l’interface ;
	●	navigateur alternatif sous forme de liste pour les objets visibles de la carte.
￼
17. Direction artistique
17.1 Formule visuelle
Enluminure vivante + naturalisme romantique + 2,5D isométrique.
Le résultat ne doit être ni photoréaliste ni caricatural.
La carte utilise :
	●	un relief 3D léger ;
	●	des bâtiments et unités pré-rendus ;
	●	une retouche picturale 2D ;
	●	des contours doux ;
	●	des ombres orientées ;
	●	de nombreuses animations environnementales discrètes.
17.2 Palette
Couleurs communes :
	●	granit anthracite ;
	●	mousse sombre ;
	●	vert de sapin ;
	●	brun de fougère ;
	●	bleu de brume ;
	●	ocre ;
	●	grenat ;
	●	vieil or.
Châtellenie :
	●	grenat ;
	●	or ancien ;
	●	ardoise ;
	●	ivoire ;
	●	brun de chêne.
Ermitage :
	●	vert profond ;
	●	vert sauge ;
	●	cuivre patiné ;
	●	bleu brume ;
	●	pierre claire.
17.3 Les deux écrans de cité
Châtellenie
La caméra regarde une ville en pente. Au premier plan, la halle et les ateliers. Au centre, la porte et la forge. Plus haut, les écuries et la Maison des Grenadières. Au sommet, le donjon et l’aire des Griffons.
À mesure que la cité progresse :
	●	les rues se pavent ;
	●	des étals apparaissent ;
	●	les remparts s’élèvent ;
	●	les bannières se multiplient ;
	●	la lumière devient plus chaude ;
	●	la population anime les espaces.
Ermitage
La caméra traverse une forêt ouvrant sur un vallon. Les premiers bâtiments sont modestes. Les racines et pierres forment progressivement un sanctuaire monumental. La source s’agrandit, des passerelles apparaissent et la Vouivre s’installe au-dessus de la brume.
17.4 Portraits
	●	peinture réaliste stylisée ;
	●	cadrage poitrine ;
	●	lumière latérale douce ;
	●	arrière-plan évoquant la faction ;
	●	expression claire et non théâtrale ;
	●	diversité d’âges de 24 à 61 ans environ ;
	●	silhouettes minces, athlétiques, robustes ou massives ;
	●	aucun « mannequin générique de fantasy ».
17.5 Animation
Carte d’aventure :
	●	huit directions par héros ;
	●	marche, attente, interaction et combat ;
	●	24 images/seconde visuelles suffisantes ;
	●	interpolation à 60 images/seconde pour la caméra.
Combat :
	●	attente ;
	●	mouvement ;
	●	attaque ;
	●	impact ;
	●	riposte ;
	●	défense ;
	●	mort ;
	●	capacité ;
	●	victoire.
17.6 Son
Instrumentation :
	●	vielle à roue ;
	●	flûtes ;
	●	tambour sur cadre ;
	●	cordes graves ;
	●	cloches ;
	●	chœur discret ;
	●	sons de forge ;
	●	eau et vent forestier.
Chaque région possède une ambiance :
	●	Durolle et moulins ;
	●	foires de Chabreloche ;
	●	vent de Cervières ;
	●	brume des Bois Noirs ;
	●	cloches de l’Hermitage ;
	●	roches et rapaces de Pamole.
Aucune mélodie ne doit imiter la bande originale de Heroes III.
￼
18. Architecture technique recommandée
18.1 Pile technologique
Monorepo TypeScript avec pnpm.
```text id="4hw0yg" apps/   client/   server/   worker/  packages/   engine/   protocol/   content/   map/   ui/   bots/   test-fixtures/ ```
Client
	●	React 19.2 ;
	●	Vite 8 ;
	●	PixiJS 8 ;
	●	interface React en surcouche DOM ;
	●	carte et combats rendus par PixiJS ;
	●	PWA installable ;
	●	objectif de compatibilité iOS 16.4 et supérieur.
PixiJS 8 peut sélectionner WebGPU ou WebGL, prend en charge les événements pointeur et fournit des mécanismes d’accessibilité. Vite 8 cible notamment Safari et iOS 16.4 dans son profil largement disponible. (pixijs.com)
Serveur
	●	Node.js en version LTS active ;
	●	Fastify ;
	●	Socket.IO ;
	●	PostgreSQL ;
	●	Drizzle ORM ;
	●	Redis pour présence, files de délais et diffusion multi-instance.
Moteur
Le moteur ne dépend ni du navigateur ni du serveur HTTP.
Il reçoit :
	●	un état ;
	●	une commande ;
	●	une graine ou un flux pseudo-aléatoire contrôlé.
Il produit :
	●	une liste d’événements ;
	●	un nouvel état ;
	●	un hash.
Cette séparation permet :
	●	tests unitaires ;
	●	bots ;
	●	replays ;
	●	vérification du client ;
	●	simulation de milliers de parties ;
	●	prévention des tricheries.
18.2 Serveur autoritaire
Le client ne décide jamais :
	●	si un déplacement est valide ;
	●	si une ressource est suffisante ;
	●	quels dégâts sont infligés ;
	●	si un objet est visible ;
	●	si le joueur peut agir.
Il envoie seulement une intention.
Exemple :
```json id="mq6vqy" {   "type": "MoveHero",   "gameId": "partie_123",   "playerId": "joueur_2",   "heroId": "thibaut",   "destination": {"col": 145, "row": 113},   "expectedSequence": 184,   "idempotencyKey": "uuid" } ```
Le serveur valide, exécute et renvoie les événements.
18.3 Déterminisme
	●	générateur PCG32 ou équivalent ;
	●	calculs entiers ;
	●	journal append-only ;
	●	snapshot toutes les vingt commandes importantes ou à chaque fin de tour ;
	●	hash de l’état après chaque événement ;
	●	version du moteur et des contenus enregistrée avec chaque partie.
Un replay doit produire exactement le même hash final sur serveur, navigateur PC et iPhone.
18.4 Base de données
Tables principales :
```text id="mpcwyq" users lobbies lobby_players games game_players game_commands game_events game_snapshots turn_deadlines replays content_versions map_versions ```
Chaque commande possède une clé d’idempotence afin qu’une reconnexion mobile ne joue pas deux fois la même action.
18.5 Railway
Architecture cible :
	●	service web ;
	●	service game-server ;
	●	service worker ;
	●	PostgreSQL ;
	●	Redis ;
	●	bucket S3 compatible pour les atlas, replays et exports.
Pour la tranche verticale, web et game-server peuvent être regroupés afin de diminuer la complexité. La séparation intervient lorsque le moteur est stable.
Railway prend en charge les applications Socket.IO, la reconnexion, les connexions WebSocket prolongées et l’adaptateur Redis en cas de montée en charge. Le service doit écouter sur 0.0.0.0, utiliser la variable PORT et exposer /health. (docs.railway.com)
18.6 Gestion du token Railway
Utiliser uniquement un token limité au projet :
```bash id="5ubkzd" export RAILWAY_TOKEN="..." railway link railway up ```
Le token :
	●	ne doit jamais être écrit dans le dépôt ;
	●	ne doit jamais apparaître dans un fichier .env commité ;
	●	ne doit jamais être affiché dans les journaux ;
	●	ne doit jamais être envoyé au client ;
	●	doit être remplacé s’il a été exposé.
Railway distingue bien RAILWAY_TOKEN, limité au projet, de RAILWAY_API_TOKEN, plus large. Un seul doit être défini à la fois. Le déploiement normal s’effectue après liaison du projet avec railway link, puis railway up. (docs.railway.com)
￼
19. Performance
PC
	●	60 images/seconde en 1920 × 1080 ;
	●	support 4K avec mise à l’échelle de l’interface ;
	●	moins de 150 ms pour calculer un trajet ordinaire ;
	●	moins de 500 ms pour charger une nouvelle région.
iPhone
	●	objectif 60 images/seconde ;
	●	mode économie à 30 images/seconde ;
	●	mémoire graphique surveillée ;
	●	atlas divisés par région et faction ;
	●	élimination hors écran ;
	●	niveaux de détail ;
	●	chargement progressif ;
	●	aucune texture géante couvrant toute la carte.
Carte
Chaque case peut être représentée techniquement par :
```text id="ussy3h" terrain       uint8 région        uint8 altitude      int16 pente         uint8 drapeaux      uint16 objet         uint32 ```
Le pathfinding utilise un A* hiérarchique :
	●	graphe régional pour les longues distances ;
	●	grille locale pour les derniers blocs ;
	●	cache invalidé lorsqu’un pont, héros ou obstacle modifie la route.
￼
20. Équilibrage
20.1 Équivalence des départs
Chaque départ doit fournir, dans les sept premiers jours :
	●	une capitale ;
	●	une scierie accessible ;
	●	une carrière ;
	●	deux demeures de rang inférieur ;
	●	un site de revenu ;
	●	une auberge ;
	●	deux directions d’expansion viables.
La valeur économique accessible doit rester dans une fourchette de ±5 à 8 % entre les positions.
20.2 Force des neutres
	●	anneau extérieur : rangs 1 à 3 ;
	●	zones intermédiaires : rangs 3 à 5 ;
	●	centre et sceaux : rangs 5 à 7 ;
	●	garde de la Maison : armée mixte unique.
20.3 Critères statistiques
Après au moins 10 000 simulations par graine :
	●	taux de victoire de chaque position en partie à cinq : 18 à 22 % ;
	●	taux de victoire des deux factions : 47 à 53 % ;
	●	aucun héros au-dessus de 55 % ;
	●	aucune construction d’ouverture choisie dans plus de 70 % des parties gagnantes ;
	●	temps moyen d’accès à un premier sceau comparable à ±1 tour ;
	●	au moins trois routes réalistes vers la Maison du Trésor pour chaque départ.
Les statistiques automatiques ne remplacent pas les tests humains. Elles servent à identifier les anomalies.
￼
21. Feuille de route
Phase 0 — Verrouillage de la vision et de la carte
Durée cible : deux à trois semaines.
Livrables :
	●	emprise IGN ;
	●	modèle de terrain ;
	●	routes et hydrographie ;
	●	positions vérifiées ;
	●	ancre définitive de la Maison du Trésor ;
	●	carte grise ;
	●	graphe de circulation ;
	●	cinq départs ;
	●	trois variantes de victoire.
Phase 1 — Moteur déterministe
Quatre à six semaines.
	●	état du jeu ;
	●	calendrier ;
	●	ressources ;
	●	déplacement ;
	●	brouillard ;
	●	constructions ;
	●	recrutement ;
	●	combats sans graphisme ;
	●	sauvegardes et replays ;
	●	tests déterministes.
Phase 2 — Tranche verticale
Six à huit semaines.
Contenu limité mais jouable :
	●	portion Chabreloche–Le Lac–Maison du Trésor–Cervières ;
	●	deux cités ;
	●	trois rangs de créatures par faction ;
	●	quatre héros ;
	●	huit sorts ;
	●	une condition de victoire ;
	●	interface PC et iPhone ;
	●	partie locale complète.
Phase 3 — Multijoueur
Six à huit semaines.
	●	salles ;
	●	invitations ;
	●	commandes autoritaires ;
	●	reconnexion ;
	●	minuteurs ;
	●	observateurs ;
	●	partie asynchrone ;
	●	déploiement Railway.
Phase 4 — Contenu complet
Dix à quatorze semaines.
	●	carte entière ;
	●	quatorze créatures et améliorations ;
	●	vingt-et-un héros ;
	●	trente-deux sorts ;
	●	artefacts ;
	●	villages ;
	●	météo ;
	●	gabelle ;
	●	sceaux.
Phase 5 — Art, son et mobile
Dix à seize semaines.
	●	illustrations finales ;
	●	animations ;
	●	cités en parallaxe ;
	●	paysages ;
	●	musique ;
	●	bruitages ;
	●	optimisation mémoire ;
	●	accessibilité.
Phase 6 — Alpha et équilibrage
Huit à douze semaines.
	●	bots ;
	●	simulations ;
	●	télémétrie ;
	●	tournois internes ;
	●	sécurité ;
	●	corrections ;
	●	tests de charge.
Phase 7 — Bêta et sortie
Six à dix semaines.
Une excellente tranche verticale solo ou locale est envisageable en huit à douze semaines avec une forte assistance IA et des assets temporaires. La cible artistique complète correspond plutôt à douze à dix-huit mois pour une petite équipe expérimentée, selon le niveau d’animation et de contenu final.
￼
22. Critères de recette
Le jeu ne passe pas en bêta tant que les conditions suivantes ne sont pas remplies.
Carte
	●	tous les lieux nommés à moins d’une case de leur ancre validée ;
	●	aucune zone de départ isolée ;
	●	trois voies vers l’objectif central ;
	●	aucun chemin visuellement ouvert mais techniquement bloqué ;
	●	indication claire de tous les changements d’altitude importants.
Moteur
	●	10 000 replays identiques sur deux machines ;
	●	aucun écart de hash ;
	●	commandes idempotentes ;
	●	migrations de sauvegarde testées ;
	●	aucune logique de jeu dans les composants React.
Réseau
	●	reconnexion après coupure de cinq minutes ;
	●	récupération des événements manquants ;
	●	impossibilité de jouer hors de son tour ;
	●	impossibilité de modifier une ressource depuis le client ;
	●	reprise d’une partie pendant un redéploiement serveur.
Mobile
	●	partie complète sur un iPhone sans clavier ;
	●	aucun bouton essentiel trop proche d’une zone système ;
	●	aucun texte indispensable tronqué ;
	●	pas plus de deux gestes pour une action ordinaire ;
	●	retour ou annulation toujours disponible avant confirmation.
Équilibrage
	●	factions entre 47 et 53 % de victoire ;
	●	positions entre 18 et 22 % en cinq joueurs ;
	●	aucun héros ou sort obligatoire ;
	●	au moins trois ouvertures économiques compétitives par faction.
Performance
	●	60 images/seconde cible ;
	●	30 images/seconde minimum en mode économie ;
	●	chargement initial inférieur à 10 secondes sur connexion mobile correcte ;
	●	reconnexion inférieure à 5 secondes ;
	●	calcul d’une bataille automatique inférieur à une seconde dans 95 % des cas.
￼
23. Prompt maître à donner à Claude Code
```text id="42lxb0" Tu es l’architecte et développeur principal du jeu « Les Comtes du Forez : La Maison du Trésor ».  OBJECTIF Construire un successeur spirituel original des grands jeux de stratégie fantasy au tour par tour, jouable sur PC et iPhone, pour 1 à 5 joueurs, avec un multijoueur séquentiel autoritaire.  Le jeu ne doit copier aucun asset, nom, texte, formule, interface, créature, sort, musique ou carte d’une licence existante. Les mécaniques génériques du genre peuvent servir de référence, mais tout le contenu doit être original.  LANGUE L’intégralité de l’interface, des contenus, messages d’erreur, tests de contenu et données visibles doit être en français. Le code et les identifiants techniques peuvent être en anglais.  RÈGLE DE TRAVAIL Ne tente pas de produire tout le jeu dans une seule itération. Travaille par phases et ne passe une porte de qualité que lorsque les tests associés sont verts.  PILE IMPOSÉE - TypeScript strict. - Monorepo pnpm. - React 19.2. - Vite 8. - PixiJS 8. - Node.js LTS actif. - Fastify. - Socket.IO. - PostgreSQL. - Drizzle ORM. - Redis lorsque le multijoueur multi-instance est introduit. - Vitest pour les tests unitaires. - Playwright pour les tests fonctionnels. - ESLint et Prettier. - Aucun any non justifié. - Validation des entrées réseau avec Zod.  ARBORESCENCE apps/client apps/server apps/worker packages/engine packages/protocol packages/content packages/map packages/ui packages/bots packages/test-fixtures  ARCHITECTURE NON NÉGOCIABLE 1. packages/engine est une bibliothèque TypeScript pure. 2. Elle ne dépend ni de React, ni de PixiJS, ni de Fastify, ni du DOM. 3. Une commande et un état produisent une liste d’événements. 4. Tous les calculs de simulation utilisent des entiers ou points de base. 5. Le générateur pseudo-aléatoire est déterministe et injecté. 6. Chaque événement produit un hash d’état. 7. Le serveur est autoritaire. 8. Le client ne décide jamais de la validité d’une action. 9. Toutes les commandes possèdent une clé d’idempotence. 10. Les contenus sont définis par données et validés par schéma.  PREMIÈRE MISSION Ne construire que la Phase 0 et le socle de la Phase 1.  Livrer : - le monorepo compilable ; - le moteur de calendrier jour/semaine ; - les sept ressources ; - les joueurs et tours séquentiels ; - les héros et points de marche ; - une grille 256 × 416 chargée par blocs de 32 × 32 ; - un pathfinding A* hiérarchique minimal ; - les trois états du brouillard de guerre ; - une carte grise avec les ancrages géographiques fournis ; - une interface responsive PC/iPhone ; - une sauvegarde PostgreSQL ; - un journal d’événements ; - un replay déterministe ; - des tests prouvant que deux exécutions produisent le même hash.  CARTE Utiliser une emprise WGS84 de travail : ouest 3.640 sud 45.720 est 3.800 nord 45.900  Projection cible : EPSG:2154 Lambert-93. Grille : 256 colonnes × 416 lignes. Taille nominale : environ 48 mètres par case.  Ancrages : Arconsat 45.88972, 3.71389 Chabreloche 45.87972, 3.69750 Le Lac 45.85937, 3.70981 Col des Sagnes 45.85170, 3.70320 Maison du Trésor prototype 45.8515024, 3.7307805 Cervières 45.84861, 3.77306 Viscomtat 45.82917, 3.67694 Noirétable 45.81806, 3.76556 Notre-Dame de l’Hermitage 45.79170, 3.71756 Vollore-Montagne 45.785833, 3.674444 La Renaudie 45.73610, 3.72110  Ne jamais intégrer ou redistribuer de tuiles Google. Prévoir un pipeline d’import IGN MNT/LiDAR, BD TOPO, hydrographie, routes et bâtiments. Pour la première version, utiliser une carte grise originale issue des ancrages.  FACTIONS Créer les données de deux factions : - Châtellenie de Granit. - Ermitage des Bois Noirs.  Ne pas encore produire les 28 formes de créatures en graphismes finaux. Créer les schémas de données, les statistiques de prototype et des silhouettes vectorielles originales.  HÉROS Créer les entrées de données pour : Paul, Thibaut, Loïc, Matthieu, Clotilde, Anastasia, Mathilde, Caroline, Agathe, Thomas, Roxane, Georges, Auguste, Jean, Joséphine, Adèle, Jules, Inès, Gustave, Côme et Lise.  Tous les portraits humains finaux devront représenter des personnages blancs d’apparence européenne, sans ressemblance avec des personnes réelles, avec diversité d’âge, de morphologie et de style.  UX IPHONE - Cibles tactiles de 48 px minimum. - Aucun comportement dépendant du survol. - Glisser pour déplacer la caméra. - Pincer pour zoomer. - Premier toucher : prévisualiser. - Second toucher : confirmer. - Appui long : inspecter. - Panneaux remontant depuis le bas. - Respect de env(safe-area-inset-*). - Portrait et paysage. - Annulation visible avant toute action irréversible.  DÉPLOIEMENT RAILWAY Ne demande jamais d’insérer un token dans le code. Ne lis et n’utilise RAILWAY_TOKEN que depuis l’environnement du processus. Ne l’affiche jamais, même partiellement. Ne le copie dans aucun fichier. Vérifie que .env, .env.local et fichiers de secrets sont ignorés par Git.  Le serveur doit : - écouter sur 0.0.0.0 ; - utiliser process.env.PORT ; - exposer GET /health ; - avoir un arrêt gracieux ; - appliquer des migrations contrôlées ; - servir une page de diagnostic sans secret.  Avant railway up : 1. pnpm lint 2. pnpm typecheck 3. pnpm test 4. pnpm build 5. tests Playwright essentiels 6. vérification qu’aucun secret n’est suivi par Git  LIVRABLE DE CHAQUE PHASE - résumé des changements ; - décisions d’architecture ; - commandes exécutées ; - tests et résultats ; - risques restants ; - fichiers créés ; - prochaine étape recommandée.  INTERDICTIONS - Pas de monolithe contenant la logique dans React. - Pas de logique de combat dans PixiJS. - Pas de hasard Math.random dans le moteur. - Pas de mutation directe de l’état partagé. - Pas de secret dans le dépôt. - Pas de déploiement si les tests déterministes échouent. - Pas d’assets ou musiques copiés. - Pas de texte visible en anglais. - Pas d’ajout de fonctionnalités hors phase avant stabilisation du socle.  COMMENCE MAINTENANT PAR : 1. produire un plan d’exécution détaillé ; 2. créer les ADR d’architecture ; 3. initialiser le monorepo ; 4. implémenter le noyau déterministe ; 5. écrire les tests avant l’interface ; 6. créer la carte grise ; 7. présenter le résultat de la première porte de qualité. ```
￼
24. Point restant à verrouiller
Le seul point géographique substantiel qui ne doit pas être considéré comme définitivement résolu est l’identification du bâtiment historique exact de la Maison du Trésor parmi le petit ensemble du Chemin du Trésor. L’ancre prototype est suffisamment précise pour coder et équilibrer la carte, mais une validation locale ou cadastrale reste nécessaire avant de produire le décor final.
Je n’ai pas pu joindre dans ce message le paquet ZIP/JSON/GeoJSON structuré que j’avais prévu. Le contenu ci-dessus constitue néanmoins le document maître directement exploitable par Claude Code ; la prochaine matérialisation utile sera de le découper en fichiers de données, schémas, GeoJSON et critères de recette dans le dépôt du projet.