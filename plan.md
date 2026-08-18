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
| Design system + 21 portraits SVG | **fait, qualité insuffisante** | portraits à refaire (§0 rang 1) |
| Audio génératif WebAudio | **fait** | |
| Page d'accueil | **bureau correct, mobile cassé** | 4 défauts constatés sur capture |
| Coquille client (routage, état, sauvegarde auto, écrans) | **fait** | 21 routes, 0 erreur console |
| Déploiement Railway | **fait** | empreinte des assets identique au build local |
| **Rendu de la carte d'aventure** | **en cours** | lot 4 |
| **Rendu du combat** | **en cours** | lot 4 |
| **IA + parties complètes** | **en cours** | lot 4 |
| Écrans de cité (2 tableaux en parallaxe) | à faire | |
| Multijoueur asynchrone | spécifié, à faire | `docs/04-MULTIJOUEUR.md` |
| Boucles de critique visuelle | à faire | |
| Équilibrage par simulation de masse | à faire | |

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

## 2. Suite

1. **Lot 4** (en cours) — carte d'aventure, combat, correction de l'accueil mobile, IA.
2. **Lot 5** — écrans de cité, multijoueur asynchrone, coquille d'interface de jeu.
3. **Lot 6** — critique visuelle adverse écran par écran, contre la bible artistique,
   captures à l'appui, en boucle jusqu'à ce que la comparaison avec un jeu du commerce
   ne désigne plus immédiatement l'amateur.
4. **Lot 7** — équilibrage par simulation, accessibilité, performance mobile,
   tests de bout en bout.
5. **Dès qu'un outil de génération d'images est disponible** — reprise des portraits,
   des fonds de cité et des textures de terrain selon `docs/01-ART-BIBLE.md` §0.

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
