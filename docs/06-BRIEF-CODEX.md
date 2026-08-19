# Brief autonome pour l'agent générateur d'images

> **À copier-coller intégralement dans Codex.** Ce document se suffit à lui-même :
> aucun accès au dépôt n'est nécessaire. Il contient le style, les noms de
> fichiers, les tailles, les clefs exactes et la direction de chaque portrait.
>
> Livraison attendue : une arborescence de fichiers WebP + un `manifeste.json`.

---

## 1. Le projet

« **Heroes of Might and Magic — Auvergne Edition** », sous-titré *Les Comtes du
Forez — La Maison du Trésor*. Jeu de stratégie fantasy médiévale au tour par tour,
dans le navigateur, entièrement en français. Deux maisons se disputent la
succession du dernier comte du Forez : la **Châtellenie de Granit** (féodale,
marchande, militaire) et l'**Ermitage des Bois Noirs** (sylvestre, monastique,
mystique).

Le jeu est déjà complet et jouable : moteur déterministe, carte du Forez réel,
28 créatures animées, 21 héros, 32 sorts. Tout l'art est aujourd'hui **dessiné en
code** (vectoriel procédural). Il est correct mais plafonne sur la matière —
visages, écorce, pierre, feuillage. **Tes images remplacent ces textures-là,
une par une.** Le reste ne change pas.

## 2. Style — la partie la plus importante

**Formule : enluminure vivante + naturalisme romantique.** Le repère mental : une
page de manuscrit enluminé peinte par un paysagiste du XIXᵉ siècle, puis éclairée
comme un jeu moderne. **Ni photoréalisme, ni cartoon, ni rendu 3D lissé.**

Univers : le Forez légendaire, XIIᵉ–XVᵉ siècle. Granit sombre, sapinières et
hêtraies, brumes d'altitude, chemins encaissés, toits d'ardoise, broderie au fil
d'or, bornes armoriées, sources sacrées, légendes de vouivres.

### La règle qui prime sur toutes les autres

**Soleil au nord-ouest, azimut 315°, élévation 38°.** Toutes les images partagent
cette direction, sinon elles jureront entre elles et avec le rendu procédural
existant. Lumière directe chaude `#FFE9C2`, ombre froide `#3A4657`.
**Aucune ombre grise ni noire** : toute ombre tire vers le bleu-violet, toute
lumière vers l'ambre. C'est ce qui fait « peint » plutôt que « colorié ».

### Palette

Communes — granit anthracite `#2A2C2F`, granit clair `#4A4E52`, mousse sombre
`#2F3B2E`, vert de sapin `#1E3226`, vert de hêtre `#4A6138`, brun de fougère
`#6B5433`, bleu de brume `#8FA6B8`, bleu profond `#2B3A4A`, ocre `#C08A3E`,
grenat `#6E1F2A`, vieil or `#C9A227`, parchemin `#E8DCC0`, encre `#241C14`.

Châtellenie — grenat `#6E1F2A`, or ancien `#C9A227`, ardoise `#414A52`, ivoire
`#EDE3CE`, brun de chêne `#5A4128`.

Ermitage — vert profond `#1B3A2B`, vert sauge `#7C8F6B`, cuivre patiné `#4E8977`,
bleu brume `#9FB4C2`, pierre claire `#CFC6B4`.

### Interdits absolus

Aucune référence à une franchise, un studio, un artiste vivant ou une personne
réelle — ni dans l'image, ni dans l'invite. **Aucun texte, chiffre ou logo dans
l'image.** Aucun cadre décoratif intégré : les cadres dorés sont dessinés par
l'application par-dessus. Aucune signature, aucun filigrane.

**Ne génère jamais** : icônes d'interface, boutons, curseurs, blasons, glyphes de
sorts ou de compétences. Ils restent vectoriels.

## 3. Priorité 1 — les 21 portraits de héros

`512 × 640` px (ratio 4:5), WebP qualité 82, **sans canal alpha**.

Cadrage poitrine. Lumière latérale douce à 315°. Fond évoquant la faction :
appareil de granit et bannière grenat pour la Châtellenie, futaie et brume pour
l'Ermitage. **Aucun cadre.** Personnages blancs d'apparence européenne, sans
ressemblance avec une personne réelle. La diversité doit être **réelle** — âges de
24 à 61 ans, morphologies, coiffures, couvre-chefs, expressions — surtout pas une
galerie de mannequins interchangeables.

**Contrainte de lisibilité** : le portrait est affiché en vignette de **56 px**
dans les listes. Silhouette et coiffe doivent suffire à identifier le héros à
cette taille.

### Châtellenie de Granit

| Fichier | Clef | Direction |
|---|---|---|
| `portraits/paul.webp` | `portrait_paul` | Castellan, ~34 ans. Cadet désargenté devenu chef de cavalerie ; a mené les convois de sel très jeune. Sec, taciturne, ne sourit pas. Haubert usé sous un surcot grenat élimé, gorgerin de mailles. Regard fixe, mâchoire serrée. |
| `portraits/thibaut.webp` | `portrait_thibaut` | Sénéchal des chemins, ~45 ans. Fils de maître de poste, homme de relevés et d'itinéraires. Carnet relié de peau à la ceinture, doigts tachés d'encre. Manteau de voyage poussiéreux, chausses de cuir. Attentif, calme, un peu voûté. |
| `portraits/loic.webp` | `portrait_loic` | Sénéchal de la gabelle, ~52 ans. Douze ans derrière un comptoir de grenier à sel. Robe sombre de fonctionnaire, col d'ivoire, bourse et sceau. Visage rond, patient, sceptique. Mains soignées. |
| `portraits/matthieu.webp` | `portrait_matthieu` | Castellan briseur de portes, ~41 ans. Ancien charpentier de moulins. Épaules larges, avant-bras nus et marqués, cuir clouté. Fil à plomb ou maillet. Regard qui évalue une faiblesse. Barbe courte mal taillée. |
| `portraits/clotilde.webp` | `portrait_clotilde` | Sénéchale, ~38 ans. Dirige quarante brodeuses au fil d'or à Cervières depuis ses 26 ans. Robe grenat sombre à parements d'or véritable, coiffe de lin, aiguille d'or au corsage. Autorité tranquille, ne hausse jamais la voix. |
| `portraits/caroline.webp` | `portrait_caroline` | Sénéchale intendante, ~47 ans. Chambre des comptes, négocie le granit à la carrière. Sobre, laine grise et ivoire, tablettes de cire. Sourcils hauts, regard direct, pas de bijou. |
| `portraits/thomas.webp` | `portrait_thomas` | Castellan maître de tir, ~56 ans. Dix-huit ans sous la porte des Farges. Rides profondes du plisseur d'yeux, teint tanné, cheveux gris ras. Brassard de cuir d'arbalétrier, carreau à la main. Regard qui porte loin. |
| `portraits/georges.webp` | `portrait_georges` | Castellan défenseur, ~61 ans. A tenu la porte de Bise tout un siège d'hiver. Massif, lent, claudique. Barbe blanche courte, cicatrice au front, haubert lourd et rapiécé. Calme absolu, presque las. |
| `portraits/auguste.webp` | `portrait_auguste` | Sénéchal porte-parole, ~58 ans. Voix du dernier comte pendant vingt ans. Robe d'apparat grenat et or, chaîne de charge, rouleau scellé. Cheveux argentés soignés, main levée en parole. Prestance de diplomate. |
| `portraits/josephine.webp` | `portrait_josephine` | Sénéchale, ~43 ans. Née dans un hameau de six feux, négocie les chartes de village assise à la table commune. Vêtement de bonne laine sans luxe, fichu, mains de paysanne. Écoute plus qu'elle ne parle. Chaleur et fermeté. |

### Ermitage des Bois Noirs

| Fichier | Clef | Direction |
|---|---|---|
| `portraits/anastasia.webp` | `portrait_anastasia` | Prieure des Brumes, ~49 ans. Prieuré du col des Sagnes à 990 m, brume deux cents jours par an. Habit vert profond, voile gris-bleu, manuscrit annoté. Pâle, silencieuse, regard clair et distant. |
| `portraits/mathilde.webp` | `portrait_mathilde` | Prieure guérisseuse, ~54 ans. Tient l'hospice de l'Hermitage, registre des sources du massif. Tablier de lin taché, manches retroussées, fiole et linge. Visage fatigué et bienveillant, cheveux gris tirés. |
| `portraits/agathe.webp` | `portrait_agathe` | Veneuse, ~29 ans. Élève les hulottes depuis ses onze ans, dort dehors la moitié de l'année. Gant de fauconnier épais, plume dans les cheveux emmêlés, cape verte à capuche rabattue. Regard fixe et nocturne. |
| `portraits/roxane.webp` | `portrait_roxane` | Veneuse, ~33 ans. Ancienne braconnière assermentée. Silhouette mince, vêtements sombres près du corps, capuche, visage à demi dans l'ombre. Couteau court. Sourire en coin, méfiance amusée. |
| `portraits/jean.webp` | `portrait_jean` | Veneur chef de meute, ~46 ans. Vit avec les loups ; **il manque un doigt à sa main et la moitié de son oreille gauche**. Pelisse de fourrure grise, barbe fournie, cicatrices. Immobile, posture animale. |
| `portraits/alice.webp` | `portrait_alice` | Prieure, ~24 ans. Trouvée enfant dans une souche des Bois Noirs. Jeune, très pâle, cheveux emmêlés de brindilles, robe de bure verte, racines et ronces en arrière-plan. Regard trop calme pour son âge. |
| `portraits/ines.webp` | `portrait_ines` | Prieure pèlerine, ~40 ans. A relevé à pied 78 croix, 41 sources, 11 chapelles. Bourdon de pèlerin, sandales, habit poussiéreux, coquille cousue. Teint hâlé, sérénité de marcheuse. |
| `portraits/gustave.webp` | `portrait_gustave` | Veneur, ~50 ans. Ancien carrier de Vollore, éveille les colosses de granit. Très massif, taciturne, **main droite définitivement blanche de poussière de pierre**. Cuir épais, marteau. Front lourd. |
| `portraits/come.webp` | `portrait_come` | Prieur astronome, ~59 ans. Trente et un ans de journal du ciel, onze volumes. Habit vert sombre, cierge, cahier ouvert, regard levé. Maigre, nez fort, cheveux blancs en désordre. |
| `portraits/lise.webp` | `portrait_lise` | Prieure, ~31 ans. Descendue trois jours dans la fosse noire de la Durolle, muette une saison depuis. Cheveux noirs mouillés, écailles vertes cousues au col, teint livide. Regard fixe, presque reptilien. |

### Neutre

| Fichier | Clef | Direction |
|---|---|---|
| `portraits/jules.webp` | `portrait_jules` | Gardien des Bornes, ~44 ans. Sans bannière, entretient les bornes armoriées du comté. Vêtement mêlant les deux traditions — grenat et vert, or et cuivre. Burin et pinceau à écusson. Visage ouvert, ni méfiant ni docile. |

## 4. Priorité 2 — six fonds de cité

`2048 × 1152`, WebP q82, sans alpha. Vue en plongée légère.
**Sans aucun bâtiment de niveau supérieur** : ce sont des décors de fond, les
bâtiments construits sont posés par-dessus par le moteur.

Les **trois heures d'une même faction doivent être le même cadrage exact**, à la
lumière près : le jeu interpole entre elles.

| Fichier | Clef | Scène |
|---|---|---|
| `cites/granit-aube.webp` | `cite_granit_aube` | Bourg fortifié de granit sur son éperon, ruelles en pente, toits d'ardoise, brume au fond de vallée, lumière rasante froide |
| `cites/granit-midi.webp` | `cite_granit_midi` | Même cadrage, lumière haute et chaude, ardoises brillantes, ombres courtes |
| `cites/granit-crepuscule.webp` | `cite_granit_crepuscule` | Même cadrage, or et grenat, fenêtres éclairées, fumées |
| `cites/ermitage-aube.webp` | `cite_ermitage_aube` | Vallon forestier, source et bassins, passerelles de bois, toits de cuivre verdi, brume basse |
| `cites/ermitage-midi.webp` | `cite_ermitage_midi` | Même cadrage, lumière filtrée par la futaie, taches de soleil au sol |
| `cites/ermitage-crepuscule.webp` | `cite_ermitage_crepuscule` | Même cadrage, cierges, lune montante, brume qui remonte |

## 5. Priorité 3 — six tuiles de terrain

`512 × 512`, **répétables sans couture**, WebP q82, sans alpha.
Vue **strictement zénithale**, éclairage neutre et plat : ce sont des matières,
pas des scènes. Le relief et l'ombrage sont appliqués par le moteur par-dessus.

Les clefs sont **sans préfixe**.

| Fichier | Clef | Matière |
|---|---|---|
| `terrain/herbe.webp` | `herbe` | prairie d'altitude, touffes courtes, quelques fleurs pâles |
| `terrain/aiguilles.webp` | `aiguilles` | tapis d'aiguilles de sapin, pommes de pin, mousse |
| `terrain/roche.webp` | `roche` | dalle de granit lichenée, diaclases |
| `terrain/tourbe.webp` | `tourbe` | sagne humide, sphaigne, eau affleurante |
| `terrain/gravier.webp` | `gravier` | chemin de cailloutis, ornières |
| `terrain/eau.webp` | `eau` | eau courante peu profonde sur galets |

## 6. Priorité 4 — huit matières

`512 × 512`, répétables sans couture. Elles sont **multipliées** sur des formes
vectorielles pour leur donner du grain : **valeurs moyennes, faible contraste,
aucune ombre portée, aucun relief marqué, aucun objet identifiable**.

`matieres/granit.webp` → `matiere_granit` · `matieres/ecorce.webp` →
`matiere_ecorce` · `matieres/ardoise.webp` → `matiere_ardoise` ·
`matieres/parchemin.webp` → `matiere_parchemin` · `matieres/cuir.webp` →
`matiere_cuir` · `matieres/filDor.webp` → `matiere_filDor` ·
`matieres/cuivre.webp` → `matiere_cuivre` · `matieres/tissu.webp` →
`matiere_tissu`

## 7. Priorité 5 — deux fonds d'accueil

**Deux cadrages distincts, pas un recadrage.**

| Fichier | Clef | Taille | Cadrage |
|---|---|---|---|
| `accueil/paysage.webp` | `accueil_paysage` | 2560 × 1440 | Monts du Forez au crépuscule, bourg fortifié à droite, **tiers gauche dégagé, calme et sombre** pour le titre doré et le menu |
| `accueil/portrait.webp` | `accueil_portrait` | 1170 × 2532 | Composition verticale : ciel haut travaillé, crêtes au tiers, bourg au centre, fougères et granit au premier plan bas. **Tiers médian calme** pour les boutons |

## 8. Le manifeste — sans lui rien n'est chargé

Fichier `manifeste.json`, à la racine de l'arborescence livrée.

```json
{
  "version": "1.0.0",
  "budgetOctets": 12582912,
  "entrees": [
    {
      "clef": "portrait_clotilde",
      "fichier": "portraits/clotilde.webp",
      "categorie": "portrait",
      "largeur": 512,
      "hauteur": 640,
      "octets": 98304,
      "invite": "…l'invite exacte utilisée…",
      "graine": 771244
    },
    {
      "clef": "aiguilles",
      "fichier": "terrain/aiguilles.webp",
      "categorie": "terrain",
      "largeur": 512,
      "hauteur": 512,
      "repetable": true,
      "octets": 141312
    }
  ]
}
```

Champs obligatoires : `clef`, `fichier`, `categorie`, `largeur`, `hauteur`.
`categorie` ∈ `portrait | terrain | matiere | cite | accueil | creature | prop | ciel`.
**`"repetable": true` est obligatoire** pour terrain et matière, sinon on voit les
coutures. `invite` et `graine` sont exigés pour pouvoir régénérer à l'identique.

**Une faute d'un seul caractère dans une clef et l'image est ignorée sans erreur
visible.** Recopie les clefs des tableaux ci-dessus littéralement.

## 9. Livraison

Arborescence à produire :

```
img/
├── manifeste.json
├── portraits/     21 fichiers
├── cites/          6 fichiers
├── terrain/        6 fichiers
├── matieres/       8 fichiers
└── accueil/        2 fichiers
```

Total visé : **43 images, moins de 12 Mo**. Répartition : portraits 2,2 Mo ·
cités 2,6 Mo · terrain 1,8 Mo · matières 1,2 Mo · accueil 1,2 Mo.

Le dossier `img/` sera déposé tel quel dans `apps/client/public/`. Le chargeur est
déjà écrit et testé côté jeu : aucune ligne de code ne sera nécessaire.

Si le dépôt est accessible, pousse directement dans
`apps/client/public/img/` sur la branche **`claude/hmm-auvergne-game-uesdlz`**.
Sinon, livre une archive.

## 10. Ordre de travail conseillé

1. Fixe d'abord **un** portrait de référence (Clotilde) et itère dessus jusqu'à ce
   que le style soit exactement le bon : c'est lui qui donnera la cohérence des
   vingt autres.
2. Décline les 20 autres portraits en réutilisant la même formulation de style et
   en ne changeant que la direction du personnage.
3. Puis les tuiles de terrain et les matières (rapides, très rentables).
4. Puis les fonds de cité — d'abord le cadrage de midi, ensuite les deux autres
   heures en repartant de la même composition.
5. Enfin les deux fonds d'accueil.
