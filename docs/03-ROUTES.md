# Routes du client et scènes de revue visuelle

Le client est une application à une seule page, avec un routeur par **fragment
d'URL** (`location.hash`) — pas de dépendance de routage, et compatible avec le
repli SPA du serveur.

## Routes de jeu

| Fragment | Écran |
|---|---|
| `#/` | Page d'accueil |
| `#/nouvelle-partie` | Assistant de nouvelle partie |
| `#/charger` | Emplacements de sauvegarde |
| `#/codex` | Encyclopédie |
| `#/options` | Options |
| `#/partie` | Carte d'aventure (partie en cours) |
| `#/partie/cite/:uid` | Écran de cité |
| `#/partie/heros/:uid` | Fiche de héros |
| `#/partie/royaume` | Vue d'ensemble du royaume |
| `#/partie/combat` | Combat tactique |

## Routes de démonstration (obligatoires)

Elles servent à la **revue visuelle automatisée** (`node tools/screenshot.mjs`).
Chacune doit s'afficher sans qu'une partie soit en cours : elle crée son propre
état de démonstration déterministe (graine fixe `20250816`) et n'écrit jamais de
sauvegarde.

| Fragment | Contenu attendu |
|---|---|
| `#/demo/carte` | Carte d'aventure, caméra cadrée sur la Maison du Trésor, brouillard partiel, deux héros visibles, chemin affiché avec marqueurs de jour |
| `#/demo/cite/granit` | Écran de cité de la Châtellenie, environ 70 % construite, midi |
| `#/demo/cite/ermitage` | Écran de cité de l'Ermitage, environ 70 % construite, crépuscule |
| `#/demo/combat` | Combat en cours au round 3, sept piles par camp, barre d'initiative, prévisualisation d'attaque affichée |
| `#/demo/heros` | Fiche complète d'un héros de niveau 12, avec artefacts, compétences et sorts |
| `#/demo/royaume` | Vue d'ensemble : cités, héros, revenus, objectifs |
| `#/demo/planche-art` | `renderArtSheet` — planche de contact de toutes les créatures et props |
| `#/demo/galerie` | `<UIGallery/>` du design system |
| `#/demo/sauvegardes` | Écran de sauvegarde avec des emplacements factices |

Chaque route de démonstration doit être **prête en moins de 6 secondes** après le
chargement, sinon la capture se fait sur un écran incomplet et la revue échoue.
