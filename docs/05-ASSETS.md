# Contrat des images générées

> **Destinataire : l'agent qui produit les images (Codex / ImageGen).**
> Ce document dit exactement quoi produire, sous quels noms, à quelles tailles et
> dans quel style. Claude Code a déjà écrit le chargeur : si tu respectes ce
> contrat, tes images apparaissent dans le jeu **sans une ligne de code à
> ajouter**. Si tu t'en écartes d'un caractère, elles sont silencieusement
> ignorées et le repli procédural reste affiché.

---

## 1. Ce qui existe déjà — ne le refais pas

Le jeu est **complet et jouable sans aucune image**. Tout l'art est aujourd'hui
dessiné en code (PixiJS `Graphics`, canvas 2D, SVG). Tes images ne s'ajoutent pas :
elles **remplacent** des entrées précises de l'atlas, une par une.

| Déjà produit en procédural | Qualité actuelle | À remplacer par une image ? |
|---|---|---|
| 21 portraits de héros | **faible** — visages plats, traits sommaires | **Oui, priorité 1** |
| Fonds d'écran de cité | inexistants | **Oui, priorité 2** |
| 6 pinceaux de terrain | correct mais synthétique | **Oui, priorité 3** |
| Matières (granit, écorce, métal…) | correct | **Oui, priorité 4** |
| Fond de la page d'accueil | correct en paysage, cassé en portrait | **Oui, priorité 5** |
| 28 créatures gréées, 8 animations chacune | acceptable | **Références seulement** (voir §6) |
| 14 silhouettes de décor, 3 à 5 variantes chacune | correct — sapin, hêtre, buisson, rocher, aiguille de granit, muret, borne, croix, moulin, pont, tour de guet, ferme, chapelle, souche | **Oui** — vague 3, priorité 2 |
| 30 icônes de lieux de carte | inégal : treize natures partagent des icônes génériques | **Oui** — vague 3, priorité 3 |
| Icônes, cadres, boutons, blasons, typographie | bon | **Non — jamais.** Reste vectoriel |

> **Vague 3 : `docs/10-BRIEF-IMAGEGEN-VAGUE-3.md`.** Elle porte sur la carte
> d'aventure — le SOL d'abord, qui occupe tout l'écran et n'a aucune matière
> peinte, puis le décor et les icônes de lieux. Le piège à connaître y est écrit :
> les pinceaux de terrain ne sont aujourd'hui lus que par le champ de bataille,
> le sol de la carte d'aventure est peint pixel par pixel et n'en utilise aucun.


**Ne génère jamais** : icônes d'interface, cadres, boutons, curseurs, blasons,
glyphes de sorts ou de compétences, ni aucune image contenant du texte. L'interface
doit rester nette à toute échelle et recolorable ; le texte est rendu par
l'application, en français, avec ses propres polices.

---

## 2. Où déposer les fichiers

```
apps/client/public/img/
├── manifeste.json          ← index de tout, obligatoire
├── portraits/              ← 21 fichiers
├── terrain/                ← 6 tuiles répétables
├── matieres/               ← tuiles répétables
├── cites/                  ← panoramas de cité
└── accueil/                ← fonds de la page d'accueil
```

Tout ce qui est sous `public/` est servi tel quel à la racine du site : le fichier
`public/img/portraits/clotilde.webp` est lu par le jeu à `/img/portraits/clotilde.webp`.

Les **références non embarquées** (maquettes de créatures, planches d'étude) vont
dans `docs/reference/` — jamais dans `public/`, pour ne pas peser sur le
téléchargement.

**Format** : WebP, qualité 82. Alpha uniquement là où c'est indiqué. Pas de PNG
sauf si l'alpha exige un dégradé très fin.

---

## 3. Le manifeste

`apps/client/public/img/manifeste.json`. Sans lui, **rien n'est chargé**.

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
`repetable: true` est **obligatoire** pour les tuiles de terrain et de matière —
sans lui la texture ne se répète pas et on voit les coutures.
`invite` et `graine` sont exigés pour pouvoir régénérer à l'identique.

Le chargeur (`apps/client/src/art/assets.ts`) rejette silencieusement, avec un
avertissement console, toute entrée dont le chemin est absolu, contient `..`, est
une URL distante, ou dont un côté dépasse 4096 px.

---

## 4. Style — non négociable

La formule du jeu : **enluminure vivante + naturalisme romantique**. Le repère
mental : une page de manuscrit enluminé peinte par un paysagiste du XIXᵉ, puis
éclairée comme un jeu moderne. **Ni photoréalisme, ni cartoon, ni 3D lissée.**

Univers : le Forez légendaire, XIIᵉ–XVᵉ siècle. Granit sombre, sapinières et
hêtraies, brumes d'altitude, chemins encaissés, ardoise, broderie au fil d'or,
bornes armoriées, sources sacrées.

### Lumière — la règle la plus importante

**Soleil au nord-ouest, azimut 315°, élévation 38°.** Toutes les images doivent
partager cette direction, sinon elles jureront entre elles et avec le rendu
procédural. Lumière directe chaude `#FFE9C2`, ombre froide `#3A4657`.
**Aucune ombre grise ou noire** : toute ombre tire vers le bleu-violet, toute
lumière vers l'ambre.

### Palette imposée

Communes — granit anthracite `#2A2C2F`, granit clair `#4A4E52`, mousse sombre
`#2F3B2E`, vert de sapin `#1E3226`, vert de hêtre `#4A6138`, brun de fougère
`#6B5433`, bleu de brume `#8FA6B8`, bleu profond `#2B3A4A`, ocre `#C08A3E`,
grenat `#6E1F2A`, vieil or `#C9A227`, parchemin `#E8DCC0`, encre `#241C14`.

Châtellenie de Granit — grenat `#6E1F2A`, or ancien `#C9A227`, ardoise `#414A52`,
ivoire `#EDE3CE`, brun de chêne `#5A4128`.

Ermitage des Bois Noirs — vert profond `#1B3A2B`, vert sauge `#7C8F6B`, cuivre
patiné `#4E8977`, bleu brume `#9FB4C2`, pierre claire `#CFC6B4`.

### Interdits

Aucune référence à une franchise, un studio, un artiste vivant ou une personne
réelle, ni dans l'image ni dans l'invite. Aucun texte, chiffre ou logo dans
l'image. Aucun cadre décoratif intégré : les cadres sont dessinés par
l'application par-dessus. Aucune signature ni filigrane.

---

## 5. Ce qu'il faut produire, par priorité

### Priorité 1 — les 21 portraits de héros

`512 × 640` (ratio 4:5), sans alpha, catégorie `portrait`.

Cadrage poitrine, lumière latérale douce à 315°, fond évoquant la faction
(appareil de granit et bannière grenat pour la Châtellenie ; futaie et brume pour
l'Ermitage). **Aucun cadre** : l'application ajoute l'enluminure dorée.
Personnages blancs d'apparence européenne, sans ressemblance avec une personne
réelle. Diversité réelle d'âge (24 à 61 ans), de morphologie, de coiffure, de
couvre-chef et d'expression — surtout pas une galerie de mannequins.

**Lis `packages/content/src/heroes.ts` avant de générer** : chaque héros y a une
biographie de trois à six phrases qui dit son âge implicite, son métier et son
caractère. Le portrait doit correspondre à *ce* personnage. Exemple : Clotilde
dirige depuis ses vingt-six ans les ateliers de broderie au fil d'or de Cervières,
une maison de quarante femmes ; elle mène ses brodeuses comme une compagnie, par
métier et sans jamais élever la voix.

| Clef | Fichier | Héros | Classe |
|---|---|---|---|
| `portrait_paul` | `portraits/paul.webp` | Paul | Castellan · Châtellenie |
| `portrait_thibaut` | `portraits/thibaut.webp` | Thibaut | Sénéchal · Châtellenie |
| `portrait_loic` | `portraits/loic.webp` | Loïc | Sénéchal · Châtellenie |
| `portrait_matthieu` | `portraits/matthieu.webp` | Matthieu | Castellan · Châtellenie |
| `portrait_clotilde` | `portraits/clotilde.webp` | Clotilde | Sénéchale · Châtellenie |
| `portrait_caroline` | `portraits/caroline.webp` | Caroline | Sénéchale · Châtellenie |
| `portrait_thomas` | `portraits/thomas.webp` | Thomas | Castellan · Châtellenie |
| `portrait_georges` | `portraits/georges.webp` | Georges | Castellan · Châtellenie |
| `portrait_auguste` | `portraits/auguste.webp` | Auguste | Sénéchal · Châtellenie |
| `portrait_josephine` | `portraits/josephine.webp` | Joséphine | Sénéchale · Châtellenie |
| `portrait_anastasia` | `portraits/anastasia.webp` | Anastasia | Prieure · Ermitage |
| `portrait_mathilde` | `portraits/mathilde.webp` | Mathilde | Prieure · Ermitage |
| `portrait_agathe` | `portraits/agathe.webp` | Agathe | Veneuse · Ermitage |
| `portrait_roxane` | `portraits/roxane.webp` | Roxane | Veneuse · Ermitage |
| `portrait_jean` | `portraits/jean.webp` | Jean | Veneur · Ermitage |
| `portrait_alice` | `portraits/alice.webp` | Alice | Prieure · Ermitage |
| `portrait_ines` | `portraits/ines.webp` | Inès | Prieure · Ermitage |
| `portrait_gustave` | `portraits/gustave.webp` | Gustave | Veneur · Ermitage |
| `portrait_come` | `portraits/come.webp` | Côme | Prieur · Ermitage |
| `portrait_lise` | `portraits/lise.webp` | Lise | Prieure · Ermitage |
| `portrait_jules` | `portraits/jules.webp` | Jules | Gardien des Bornes · neutre |

Contrainte de lisibilité : le portrait est affiché en vignette de **56 px** dans
les listes et en **320 px** sur la fiche. La silhouette et la coiffe doivent
suffire à identifier le héros à 56 px.

### Priorité 2 — fonds de cité

`2048 × 1152`, sans alpha, catégorie `cite`. Six images : deux factions × trois
heures. Vue en plongée légère sur une ville en pente (Châtellenie) ou un vallon
sanctuaire (Ermitage). **Sans aucun bâtiment de niveau supérieur** : ce sont les
décors de fond ; les bâtiments construits sont posés par-dessus en couches par le
moteur, aux positions déclarées dans `packages/content/src/buildings.ts`.

| Clef | Fichier | Scène |
|---|---|---|
| `cite_granit_aube` | `cites/granit-aube.webp` | Bourg fortifié de granit sur son éperon, brume au fond de vallée, lumière rasante froide |
| `cite_granit_midi` | `cites/granit-midi.webp` | Même cadrage, lumière haute et chaude, ardoises brillantes |
| `cite_granit_crepuscule` | `cites/granit-crepuscule.webp` | Même cadrage, or et grenat, fenêtres éclairées |
| `cite_ermitage_aube` | `cites/ermitage-aube.webp` | Vallon forestier, source, passerelles de bois, toits de cuivre verdi, brume basse |
| `cite_ermitage_midi` | `cites/ermitage-midi.webp` | Même cadrage, lumière filtrée par la futaie |
| `cite_ermitage_crepuscule` | `cites/ermitage-crepuscule.webp` | Même cadrage, cierges, lune montante |

Les trois heures d'une même faction doivent être **le même cadrage exact**, à la
lumière près : le jeu interpole entre elles.

### Priorité 3 — pinceaux de terrain

`512 × 512`, **répétables sans couture** (`"repetable": true`), sans alpha,
catégorie `terrain`. Vue **du dessus, strictement zénithale**, éclairage neutre et
plat : ce sont des matières, pas des scènes. Le relief et l'ombrage sont appliqués
par le moteur par-dessus.

| Clef | Fichier | Matière |
|---|---|---|
| `herbe` | `terrain/herbe.webp` | prairie d'altitude, touffes courtes, quelques fleurs pâles |
| `aiguilles` | `terrain/aiguilles.webp` | tapis d'aiguilles de sapin, pommes de pin, mousse |
| `roche` | `terrain/roche.webp` | dalle de granit lichenée, diaclases |
| `tourbe` | `terrain/tourbe.webp` | sagne humide, sphaigne, eau affleurante |
| `gravier` | `terrain/gravier.webp` | chemin de cailloutis, ornières |
| `eau` | `terrain/eau.webp` | eau courante peu profonde sur galets |

Les clefs sont **sans préfixe** : `herbe`, pas `terrain_herbe`.

### Priorité 4 — matières

`512 × 512`, répétables, catégorie `matiere`. Elles sont multipliées sur les formes
vectorielles pour leur donner du grain : **valeurs moyennes, faible contraste,
aucune ombre portée, aucun relief marqué**.

`matiere_granit`, `matiere_ecorce`, `matiere_ardoise`, `matiere_parchemin`,
`matiere_cuir`, `matiere_filDor`, `matiere_cuivre`, `matiere_tissu`.
Fichiers : `matieres/<nom>.webp`.

### Priorité 5 — fonds de la page d'accueil

Catégorie `accueil`, sans alpha. **Deux cadrages distincts**, pas un recadrage :

| Clef | Fichier | Taille | Cadrage |
|---|---|---|---|
| `accueil_paysage` | `accueil/paysage.webp` | 2560 × 1440 | Monts du Forez au crépuscule, bourg fortifié à droite, tiers gauche dégagé pour le titre et le menu |
| `accueil_portrait` | `accueil/portrait.webp` | 1170 × 2532 | Composition verticale : ciel haut, crêtes au tiers, bourg au centre, fougères et granit au premier plan bas |

Le tiers gauche (paysage) et le tiers médian (portrait) doivent rester **calmes et
sombres** : le titre doré et les boutons de parchemin s'y posent.

---

## 6. Références de créatures — non embarquées

Les 28 créatures sont des **rigs vectoriels animés** : huit animations chacune
(attente, marche, attaque, impact, riposte, défense, mort, capacité). Une image
fixe ne peut pas les remplacer sans détruire l'animation.

Ce qui aide vraiment : une **planche de référence** par créature, déposée dans
`docs/reference/creatures/<id>.webp`, en vue de profil, pose neutre, fond uni,
que Claude Code utilisera pour resculpter le rig. Identifiants exacts :

`granit_t1` … `granit_t7` et `granit_t1_up` … `granit_t7_up` ;
`ermitage_t1` … `ermitage_t7` et `ermitage_t1_up` … `ermitage_t7_up`.

Les noms, statistiques et capacités de chacune sont dans
`packages/content/src/creatures.ts`, avec un texte de lore de deux à quatre
phrases. Lis-le : le Verrat de Granit, la Dame au Fil d'Or et la Vouivre Couronnée
y sont décrits précisément.

---

## 7. Budget et vérification

**12 Mo au total** dans `public/img/`. Répartition visée : portraits 2,2 Mo ·
cités 2,6 Mo · terrain 1,8 Mo · matières 1,2 Mo · accueil 1,2 Mo. Le chargeur
arrête de charger au-delà du budget déclaré dans le manifeste.

Une fois les fichiers déposés :

```bash
du -sh apps/client/public/img
node -e "const m=require('./apps/client/public/img/manifeste.json');console.log(m.entrees.length+' entrées')"
pnpm --filter @auvergne/client build
node tools/screenshot.mjs --dir shots/assets accueil heros
```

Puis **ouvrir les PNG produits et les regarder**. Le chargeur écrit dans la console
un avertissement listant chaque entrée ignorée et pourquoi : `shots/*/rapport.json`
doit rester sans erreur.

---

## 8. Résumé pour l'agent générateur

1. Lis `docs/01-ART-BIBLE.md` (formule, sept lois du rendu, palette) et
   `packages/content/src/heroes.ts` (les 21 personnalités).
2. Génère dans l'ordre des priorités 1 à 5.
3. Lumière à 315°/38° sur **toutes** les images, ombres bleutées, lumières ambrées.
4. Dépose sous `apps/client/public/img/`, aux chemins exacts du tableau.
5. Écris `manifeste.json` avec les **clefs exactes** — une faute de frappe et
   l'image est ignorée sans erreur visible.
6. Pas d'icônes, pas de cadres, pas de texte dans les images.
7. Consigne invite et graine pour chaque image.
