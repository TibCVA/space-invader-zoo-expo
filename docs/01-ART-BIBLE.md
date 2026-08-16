# Bible artistique — Auvergne Edition

> Formule : **enluminure vivante + naturalisme romantique + 2,5D isométrique**.
> Ni photoréalisme, ni caricature. Le repère mental : une page de manuscrit
> enluminé peinte par un paysagiste du XIXᵉ, puis éclairée comme un jeu moderne.

Tout est **généré** : aucun asset téléchargé. Les outils sont PixiJS 8 (Graphics,
Mesh, RenderTexture, Filter/GLSL), le canvas 2D pour le pré-rendu, le SVG inline
pour l'iconographie, et WebAudio pour le son. La qualité vient de la **discipline**,
pas des assets.

---

## 1. Les sept lois du rendu

Ces lois séparent un rendu « propre » d'un rendu **AAA**. Elles sont vérifiées
visuellement par un agent critique. Aucune n'est optionnelle.

1. **Jamais d'aplat.** Toute surface porte au minimum trois strates : teinte de base,
   variation de valeur (bruit multi-octave ou dégradé), et grain/texture. Un
   rectangle d'une seule couleur est un défaut.
2. **Une seule source de lumière, cohérente partout.** Soleil au **nord-ouest,
   azimut 315°, élévation 38°**. Ombres portées vers le sud-est, longueur =
   `hauteur × 1.28`, opacité 0,32, teinte bleutée `#2A3242`, jamais du noir pur.
3. **Lumière chaude / ombre froide.** Lumière directe `#FFE9C2`, ombre `#3A4657`.
   Toute ombre tire vers le bleu-violet, toute lumière vers l'ambre. C'est ce qui
   fait « peint » plutôt que « colorié ».
4. **Rim light systématique.** Chaque silhouette (créature, héros, bâtiment,
   arbre au premier plan) porte un liseré de lumière de 1–2 px du côté opposé au
   soleil, en `#C9A227` à 40 % d'opacité. C'est le détail qui décolle les objets
   du fond.
5. **Perspective atmosphérique.** Plus un élément est loin ou haut, plus il se
   désature et tire vers `#8FA6B8` (bleu de brume). Facteur : `mix = clamp(distance / 1400, 0, 0.55)`.
6. **Aucun contour noir.** Les silhouettes sont détachées par contraste de valeur
   et par un contour *sombre teinté* (couleur locale assombrie de 45 %, jamais
   `#000`), d'épaisseur variable (plus épais dans les ombres, s'amincissant vers
   la lumière).
7. **Le mouvement est permanent mais discret.** Bannières, fumées, feuillages,
   eau, oiseaux, poussière, scintillement d'or : rien n'est parfaitement immobile,
   rien ne bouge assez pour distraire. Amplitude ≤ 3 px, période 2–7 s, phases
   décorrélées par bruit.

## 2. Palette

Toutes les couleurs du jeu proviennent de cette liste. Aucun `#FFF`, aucun `#000`.

### Communes
| Nom | Hex | Usage |
|---|---|---|
| granit anthracite | `#2A2C2F` | roche, ombres structurelles |
| granit clair | `#4A4E52` | faces éclairées de la pierre |
| mousse sombre | `#2F3B2E` | sous-bois, lichen |
| vert de sapin | `#1E3226` | conifères, masses forestières |
| vert de hêtre | `#4A6138` | feuillus, prairies hautes |
| brun de fougère | `#6B5433` | terre, chemins, bois |
| bleu de brume | `#8FA6B8` | atmosphère, lointains |
| bleu profond | `#2B3A4A` | nuit, eaux profondes |
| ocre | `#C08A3E` | lumière rasante, torchis |
| grenat | `#6E1F2A` | Châtellenie, alertes |
| vieil or | `#C9A227` | accents, rim light, enluminure |
| parchemin | `#E8DCC0` | fonds d'interface |
| parchemin ombré | `#C9B996` | interface, séparateurs |
| encre | `#241C14` | texte principal |

### Châtellenie de Granit
grenat `#6E1F2A` · or ancien `#C9A227` · ardoise `#414A52` · ivoire `#EDE3CE` · brun de chêne `#5A4128`

### Ermitage des Bois Noirs
vert profond `#1B3A2B` · vert sauge `#7C8F6B` · cuivre patiné `#4E8977` · bleu brume `#9FB4C2` · pierre claire `#CFC6B4`

### Bannières des cinq joueurs (accessibilité : couleur **+ motif**)
| Joueur | Couleur | Motif |
|---|---|---|
| P1 | grenat `#8C2230` | plein |
| P2 | azur `#2E5F8A` | chevrons |
| P3 | or `#B8891F` | losanges |
| P4 | sinople `#2F6B45` | rayures |
| P5 | pourpre `#5B3A6E` | pois |

## 3. Typographie

Trois familles, installées par npm (`@fontsource/*`), jamais par CDN.

| Rôle | Police | Réglages |
|---|---|---|
| Titres, héraldique, noms de lieux | **Cinzel** 400/600/700 | interlettrage `0.08em`, majuscules, jamais sous 18 px |
| Récit, descriptions, codex | **EB Garamond** 400/500/italic | corps 16–19 px, interligne 1.62 |
| Données, chiffres, boutons | **Alegreya Sans** ou **Alegreya** 500/700 | tabular-nums pour les ressources |

Aucun texte indispensable sous **15 px CSS**. Les titres portent un très léger
relief : ombre `0 1px 0 rgba(36,28,20,.55)` et, sur fond sombre, un halo doré
`0 0 18px rgba(201,162,39,.18)`.

## 4. Carte d'aventure

- **Terrain** : rendu depuis un champ d'altitude réel (voir `packages/map`).
  Ombrage de relief (hillshade) calculé sur le MNT, mélangé à une classification
  biome par altitude/pente/humidité. Chaque bloc de 32 × 32 cases est peint une
  fois dans une `RenderTexture` (résolution 8 px/case minimum, 12 recommandé) puis
  affiché en sprite : c'est ce qui permet 60 fps.
- **Strates de peinture d'un bloc**, dans l'ordre :
  1. gradient de biome (altitude → couleur)
  2. hillshade multiplicatif (lumière 315°/38°)
  3. occlusion ambiante de vallée (blur du MNT inversé)
  4. bruit de matière (2 octaves, opacité 0,08–0,14)
  5. lisières : dégradés doux entre biomes, jamais de bord dur
  6. chemins et chaussée peints par spline, avec ornière centrale et bord clair
  7. cours d'eau (la Durolle et ses affluents) avec liseré clair côté lumière
  8. grain de parchemin global, opacité 0,05
- **Props** (arbres, rochers, murets, bornes, croix) : pré-rendus en atlas au
  chargement, dispersés par bruit bleu déterministe, **tri en profondeur par row**,
  ombre portée elliptique, oscillation légère.
- **Brouillard de guerre** : trois états. Inconnu = voile `#1A1F26` à 0,92 avec
  motif de parchemin ; exploré = désaturation 60 % + assombrissement 35 % ;
  visible = plein. Les frontières sont **adoucies** (masque flouté), jamais en
  escalier de cases.
- **Curseur et chemin** : le chemin s'affiche en perles dorées, une perle par
  case, avec un **fanion de jour** aux ruptures de journée. Cases inatteignables
  aujourd'hui : perles gris-bleu.
- **Post-traitement** (filtre PixiJS unique, un seul passe) : vignettage 0,22,
  aberration chromatique 0,4 px aux bords, grain animé 0,035, étalonnage
  colorimétrique par courbe (ombres bleutées, hautes lumières ambrées),
  bloom sélectif sur les sources lumineuses (seuil 0,78).

## 5. Cités

Deux tableaux peints, en **parallaxe à 6 plans** (ciel, lointain, moyen, principal,
premier plan, particules). La caméra dérive de ±14 px selon la souris/l'inclinaison.

- Les bâtiments **apparaissent** quand ils sont construits, avec une animation de
  levée de 700 ms (échelle 0.94 → 1, opacité, poussière au sol).
- L'éclairage suit l'heure de la semaine : jour 1 aube, jour 4 midi, jour 7 soir.
  Trois étalonnages interpolés.
- Vie permanente : fumée de forge, bannières, oiseaux, eau, silhouettes d'habitants,
  reflets sur l'ardoise mouillée quand la météo est à la pluie.
- Survol d'un bâtiment : liseré doré, carte d'information en parchemin, comparaison
  « actuel → amélioration » côte à côte.

## 6. Créatures

28 formes (14 par faction, base + amélioration). Chaque créature est un **rig
vectoriel** : parties dessinées en `Graphics` (ou paths SVG) assemblées en
hiérarchie de transformations, animées par interpolation.

Exigences par créature :
- silhouette lisible en 64 px et reconnaissable en négatif ;
- palette de 5 à 7 teintes issues de la palette de faction ;
- ombrage cel en 3 valeurs + rim light + spéculaire ponctuel sur métal ;
- 7 animations : `attente` (respiration, 2,4 s), `marche`, `attaque`, `impact`,
  `riposte`, `défense`, `mort` ; plus `capacité` si la créature en a une ;
- la variante améliorée n'est **jamais** un simple recolorage : ajout d'or, de
  ferrures, de cornes, de brume, de racines, de blessures anciennes.

## 7. Portraits (21 héros)

Peinture vectorielle stylisée, cadrage poitrine, lumière latérale douce (315°),
fond évoquant la faction (granit + bannière / futaie + brume). Diversité réelle
d'âge (24–61 ans), de morphologie et de coiffure. Aucune ressemblance avec une
personne réelle. Cadre d'enluminure : filet doré double, écoinçons feuillagés,
cartouche du nom en Cinzel.

## 8. Interface

- **Matière** : parchemin `#E8DCC0` sur structures de granit `#2A2C2F`, ferrures et
  filets d'or `#C9A227`. Les panneaux ont un bord biseauté de 2 px (clair en haut,
  sombre en bas) et une ombre portée douce.
- **Boutons** : hauteur ≥ 48 px, coins 3 px, dégradé vertical subtil, état
  `:hover` = éclaircissement 6 % + liseré doré, `:active` = enfoncement 1 px,
  `:disabled` = désaturation 70 %.
- **Aucune icône emoji.** Toute icône est un SVG dessiné à la main dans
  `packages/ui/src/icons/`.
- **Animation d'interface** : 140–220 ms, courbe `cubic-bezier(.22,.61,.36,1)`.
  Respect de `prefers-reduced-motion`.

## 9. Son

Musique **générative** WebAudio, jamais un fichier. Synthèse :
vielle à roue (scie filtrée + bourdon quinte), flûte (sinus + souffle filtré),
tambour sur cadre (bruit + enveloppe), cordes graves (triangle + chorus),
cloches (FM), chœur (formants). Modes anciens (dorien, éolien, mixolydien),
tempo 62–96, thèmes par région. Aucune mélodie ne doit évoquer une bande originale
existante.

Effets : forge, eau, vent forestier, cloches, pas sur pierre/terre/neige,
cliquetis d'armes, cris de créatures (synthèse formantique, jamais d'échantillon).
Volume par bus (musique / effets / ambiance), mémorisé.

## 10. Ce qui est considéré comme un échec

Un agent critique refusera le travail s'il constate :

- des aplats de couleur unie sans texture ;
- des contours noirs purs ;
- des ombres grises ou noires plutôt que bleutées ;
- des silhouettes plates sans rim light ;
- des formes géométriques évidentes (cercle parfait, rectangle) non retravaillées ;
- une interface « bootstrap sombre » : coins très arrondis, ombres diffuses grises,
  bleu générique `#3B82F6`, police système ;
- des emoji en guise d'icônes ;
- des textes anglais ;
- une scène statique (aucune animation d'ambiance) ;
- un dégradé linéaire unique servant de ciel ;
- des éléments qui ne respectent pas la direction de lumière commune.
