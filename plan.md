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

**État au 18/08/2026 : aucun outil de génération d'images n'est disponible dans la
session de travail.** Recherche effectuée sous `ImageGen`, `generate_image`,
`image_gen`, `CreateImage` — aucun résultat. Les sous-agents héritent du même jeu
d'outils. La directive est donc **enregistrée mais inapplicable aujourd'hui** ; elle
devient contraignante dès qu'un tel outil apparaît. **À vérifier au début de chaque
lot visuel.**

Priorités de génération, contraintes de style, budget et traçabilité :
voir `docs/01-ART-BIBLE.md` §0.

Préparation en cours pour que l'arrivée de l'outil ne coûte aucune réécriture :
l'atlas d'art est déjà indirect (`atlas.icon`, `atlas.prop`, `atlas.terrainBrush`),
il restera à ajouter `assets/manifeste.json` et un chargeur à repli procédural.

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
| `docs/90-DOCUMENT-MAITRE.md` | document de conception d'origine |
