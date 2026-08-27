# PASSATION — « Heroes of Might and Magic : Auvergne Edition »

> Rapport de passation à l'agent qui reprend la main (« codex »).
> Rédigé le 21/08/2026 sur `fec15b7` ; MIS À JOUR le 25/08/2026 sur la
> révision courante, après vérification de chaque affirmation dans le code ou
> par une épreuve. **Rien ici n'est un souvenir : tout est mesuré, et la
> méthode pour re-mesurer est donnée.**

---

## 0. L'objectif, dans les mots du propriétaire

Les critères, verbatim, par ordre chronologique :

1. « Le jeu doit être 1) très beau 2) parfaitement fonctionnel sans bugs
   3) avec une jouabilité et un fun identique à HMM3. »
2. But de session : « push everything on railway after checking that
   everything is working fine so I can play with AI and/or my cousins on
   iPhones and computers asap. »
3. « Il y a plein de défauts qui empêchent de jouer de manière fluide et
   optimale. […] être au moins au même niveau que HMM3 sur tous les aspects
   et avoir une jouabilité parfaite. »
4. Dernier message : « je veux que la jouabilité soit super fluide, facile à
   comprendre avec des animations et de vrais déplacements, que la navigation
   soit claire et simple sur la carte, dans les combats et entre les écrans.
   Il y a plein de boulot d'ajustement. Je veux aussi que la carte soit hyper
   bien pensée, équilibrée et très cool à découvrir. »

Le juge de paix n'est jamais un test unitaire : c'est **le propriétaire, sur
son iPhone, et ses cousins sur PC**. Chaque plainte qu'il a formulée jusqu'ici
s'est avérée exacte et mesurable.

### Question ouverte au propriétaire

Un message s'est coupé en plein vol : « Aussi j'ai l'impression que les
drapeaux… ». La fin n'est jamais arrivée malgré deux relances. Demander :
drapeaux des bâtiments en cité, fanions des héros sur la carte, ou couleurs de
bannière des joueurs ?

### ⚠️ Sécurité — À FAIRE AVANT TOUT

Le jeton Railway a été collé **sept fois** dans la conversation : il est
compromis. **Le faire révoquer et régénérer par le propriétaire.** La règle du
dépôt : le jeton n'est lu QUE dans l'environnement du processus
(`RAILWAY_TOKEN=… tools/deployer.sh`), jamais écrit dans le dépôt, jamais
journalisé, jamais passé en argument.

---

## 1. Ce qui marche, et comment on le sait

Production : **https://auvergne-web-production.up.railway.app** —
`/health` publie le commit servi. Déployé au moment de la passation :
`dc44b45` ; la branche porte deux commits vérifiés de plus (`2a45f05` cadence
de combat, `fec15b7` réglage de mouvement) — **à déployer en premier geste**
(§6).

Vérifié **au clic** (Playwright, `tools/e2e-solo.mjs`, PC 1440×900 et iPhone
390×844), sur le paquet local de la même révision :

nouvelle partie → carte peinte → « Fin du tour » → l'IA joue → le jour avance
→ entrée en cité → bâtir (le trésor paie) → recruter (le trésor paie, la
vignette de créature est décodée — largeur naturelle non nulle —, la demeure
d'origine est nommée) → sortie par la porte → retour carte. Zéro erreur
console.

Vérifié **sur le serveur déployé** (`tools/fumee-production.mjs`, par l'API
car Chromium ne joint pas l'internet public depuis les conteneurs de
développement) : partie créée à deux bannières dont une IA, coup accepté,
l'ordinateur joue, la main revient, la partie se retrouve avec son jeton,
manifeste et images servis, base PostgreSQL.

Suite de tests : **97 fichiers, 1194 verts** (`npx vitest run`). Typecheck et
eslint verts sur les onze paquets.

---

## 2. ~~Le déficit central~~ RÉSOLU le 25/08 : les vingt commandes ont un chemin

Le moteur accepte 20 types de `Command` (`packages/engine/src/types.ts:739`).
Au 25/08 au soir, **les vingt sont jouables** (`StartGame` passant par la
route serveur, par conception). Le protocole en ligne les couvre toutes
(`schemas.ts`, preuve de compilation `_commandMatchesEngine` ; `SwapArmy` y
admet `count`). Histoire de la mesure :

| Commande | État | Ce que ça veut dire pour le joueur |
|---|---|---|
| MoveHero, EndTurn, CombatAction, AutoResolveCombat, BuildInTown, RecruitCreatures, SwapArmy, EquipArtifact, UnequipArtifact, ChooseLevelUp | **émises** | le tour de base se joue |
| `StartGame` | orpheline **par conception** | la création passe par la route serveur ; rien à faire |
| `HireHero` | **livrée le 25/08** | onglet Auberge du panneau de cité — portrait, classe, troupe, 2500 écus ; le tirage passe par la couture `worldModule()` (bug moteur corrigé, voir `auberge-tirage.test.ts`) |
| `UpgradeCreatures` | **livrée le 25/08** | section « Élever » sous les recrues, gain chiffré (`cite-offres.ts`) |
| `CastAdventureSpell` | **livrée le 25/08** | boutons « Lancer » au Grimoire ; prix = `spellCostFor` (extrait d'apply) ; cible requise ⇒ case sélectionnée sur la carte, JAMAIS de lancer aveugle (le mana partirait — `spells-adventure.ts:378`) |
| `TradeResources` | **livrée le 25/08** | onglet Marché : aperçu exact du change via `tradeOutcome` |
| SwapArmy `count` | **livrée le 25/08** | découpe de pile — champ « Emporter » sur la fiche |
| `UseBorne` | **livrée le 25/08** | fiche de borne : les pierres du registre, voyage d'un bouton, refus motivés (`screens/bornes.ts`) |
| `HeroInteract` | **livrée le 25/08** | « Agir sur place » sur la fiche du lieu (`screens/visite.ts`) |
| `SetCharter` | **livrée le 25/08** | la charte du village, onglet Bâtir, confirmation grave — choix permanent (`politiques.ts`) |
| `SetGabelle` | **livrée le 25/08** | vue du royaume, panneau « Le pays » : le détenteur de la Maison du Trésor décrète, aperçu par `gabelleIncome` |
| `Surrender` | **livrée le 25/08** | « Rendre les armes… » au menu de partie, confirmation la plus grave du jeu |

En combat, le client émet les **8 `CombatAction` sur 8** — la reddition
(« Se rendre », deux touches, la seconde confirme) a rejoint la barre le
25/08.

**Correctif du soir (revue adversariale du 25/08, six défauts réels)** :
la reddition de combat était livrée MORTE — bouton offert seulement pendant
le tour adverse, où `declencher` avale tout clic ; et le moteur fait perdre
le camp de la pile ACTIVE, donc l'ancien emplacement aurait fait capituler
l'adversaire. Le bouton vit maintenant dans la barre du joueur
(`battle/pouce.test.ts`, `engine/combat/reddition.test.ts`). S'y ajoutent :
la **garde de tour** du magasin (`dispatch` refuse toute commande hors de
son tour — abandon, marché et gabelle agissaient localement AU NOM du
joueur actif, `state/garde-de-tour.test.ts`), le tirage vide de l'auberge
qui laissait engager n'importe qui (`auberge-tirage.test.ts`), la promotion
partielle en garnison pleine qui payait puis détruisait les promues
(`promotion-place.test.ts`), le capitaine déjà engagé par un cousin dit sur
sa ligne, et l'onglet de cité qui survivait au changement de cité.

(La découpe de pile — `SwapArmy` sans `count`, mesurée le 21/08 — est
livrée : champ « Emporter » sur la fiche, gardes dans
`heros-actions.test.ts`.)

**Il ne reste AUCUNE commande orpheline.** Les chantiers suivants sont ceux
du §3 (transitions d'écran, annonces de tour en combat, son) et du §4
(multijoueur : rejeu du tour adverse, notifications).
Livré le 25/08, en plus des commandes : « Héros suivant » (touche E + bouton,
cycle stable, centre la caméra), Échap (chemin → fiche → panneau), gains
flottants « +5 bois » au pas du héros (`render/gains.ts`).

---

**Le 26/08 — cinq plaintes, cinq correctifs mesurés.** (1) La marche du héros
paraissait instantanée parce que la scène Pixi était DÉTRUITE ET REMONTÉE à
chaque commande (`fabrique` mémorisée sur `game`, cloné à chaque coup) : les
trois écrans à scène sont stabilisés (`scene-stable.test.ts`), le jeton n'est
plus claqué avant la marche, la cadence prend le genou du combat. (2) La carte
3.0.0 : plancher toutes-natures dans `assezLoin` (95 paires adjacentes → 0),
écarts génériques des gisements rendus exécutoires, caravanes sous contrôle,
parité essence/fer RÉTABLIE par mesure (`espacement.test.ts`,
`ressources.test.ts`) — MAJEUR monté, empreintes relevées, les parties
antérieures deviennent incompatibles (protocole `version.test.ts`). (3) La
cité : ancres au sol PAR IMAGE au manifeste, parallaxe ramenée au plan du sol,
zone morte gyroscope, fuite de `Text` corrigée (`ancrage.test.ts`). (4)
Navigation : sa cité s'ouvre d'un clic (carte et fiche), onglets aiguillés par
les grants, garnison en légende, flèches de cité (`cite-navigation.test.ts`).
(5) Les 28 dessins peints de créatures branchés sur `atlas.creature`
(`creatures-peintes.test.ts`).

**Chantier prudent : RÉGLÉ le 27/08.** Le duel a montré la vraie cause :
avec « revenu » en tête de filière, 2200 écus de réserve et 55 % de solde,
le prudent mourait par conquête en 14-25 jours avec une force de ZÉRO — il
thésaurisait pendant qu'on marchait sur sa capitale. Demeures en tête de
filière, réserve 900, solde 72 % (`profiles.ts`) : expert 17/20, prudent
3/20, parties de 13 à 158 jours — la tortue est redevenue un adversaire.

## 3. Les chantiers du dernier message du propriétaire

### 3.1 « Jouabilité super fluide, animations, vrais déplacements »

Fait cette session et déployable : cadence de marche UNIFIÉE carte/combat à
260 ms le pas, avec plancher (aucun long trajet ne redevient rapide — les deux
premiers plafonds, 2200 ms puis 3000 ms, rendaient les longues marches PLUS
RAPIDES que la cadence jugée trop vive ; c'est un **genou** maintenant, la
durée croît toujours). Gardes : `render/cadence.test.ts`,
`battle/marche.test.ts`.

Piège majeur trouvé et corrigé (`fec15b7`) : « Réduire les animations » était
un OU avec la préférence système — un iPhone avec « Réduire les animations »
n'avait AUCUNE animation et aucun moyen d'en ravoir. C'est un tri-état
maintenant (`landing/settings.ts`). **Toute nouvelle animation doit être
regardée avec ce réglage dans les trois états.**

Reste à faire, dans l'ordre où l'œil le voit :
- ~~le ramassage n'a pas de geste~~ — livré le 25/08 : « +5 bois » flotte au
  pas du héros (`render/gains.ts`), pertes exclues, mouvement réduit respecté ;
- pas de file de chemin visible AVANT de confirmer un déplacement long sur PC
  (la prévisualisation existe au doigt ; vérifier la parité souris) ;
- ~~les transitions d'écran sont des coupes franches~~ — livré le 27/08 : les
  écrans entrent en fondu depuis le granit (`.jeu-ecran` + `hmm-entree-voile`)
  et le voile de chargement SE LÈVE sur une scène déjà peinte. **Opacité
  seulement** sur l'hôte du canevas WebGL ; démontage du voile par délai fixe
  et JAMAIS par `transitionend` (qui ne vient ni sous mouvement réduit ni en
  onglet caché). Garde : `screens/transitions.test.ts` ;
- ~~le combat n'a pas d'annonce de tour~~ — livré le 27/08 : cartouche de
  granit grenaté au HAUT du champ (150 ms de montée, 900 de tenue, 350 de
  descente), chiffre romain et note de main. Deux pièges payés comptant, tous
  deux trouvés à l'ÉPREUVE AU CLIC et invisibles aux gardes de source :
  (1) `resize()` l'effaçait, et l'hôte redimensionne toujours juste après
  avoir construit la vue — l'annonce mourait dans la milliseconde à chaque
  bataille ; le redimensionnement la REPLACE maintenant ; (2) posé au quart de
  la hauteur, il tombait derrière la fiche d'aperçu d'assaut, ouverte par
  défaut. Garde : `battle/annonce.test.ts`. La surbrillance de l'unité active
  reste à juger à l'œil ;
- ~~aucun son~~ — livré le 27/08. Le moteur audio était COMPLET (dix-huit
  effets synthétiques, sept thèmes, trois bus, réverbe, limiteur) et seuls le
  menu et le codex s'en servaient. Branché sur le pont `landing/audio-bridge`
  (JAMAIS d'import direct de `audio/index.js` : le chargement paresseux et la
  garantie « ne lève jamais » y tiennent) : un pas par case franchie, au plus
  un par image ; gains, conquêtes, vignettes ; épée, trait, impact, mort, sort
  dans les `debut()` des tâches d'anim (seul instant où le son tombe avec le
  geste) ; cloches ou glas selon le camp ; un thème par écran. **Rien ne sonne
  en mouvement réduit** (tout s'y joue d'un bloc). Le premier appui sur une
  scène ouvre le contexte audio, qu'aucun navigateur n'accorde sans geste.
  Garde : `audio-en-jeu.test.ts`.

### 3.2 « Navigation claire et simple — carte, combats, écrans »

Corrigé cette session (tout au clic, éprouvé) : sortie de cité toujours
visible dans le panneau ; onglet initial selon ce qu'on a touché (demeure →
Recruter, chantier → Bâtir) ; « Fin du tour » à la racine, plus jamais sous le
panneau ; ligne de recrue en grille sur téléphone (600 px → 150 px) ;
pastille de sauvegarde qui ne recouvre plus le trésor ; l'action l'emporte sur
l'information au toucher (appui court agit, appui long informe).

Livré le 27/08 : **le clic droit sur l'herbe répond**. Le geste existait de
bout en bout — appui long et clic droit appelaient déjà `onInspect` avec
`{ kind: 'case', at }` — mais l'écran jetait ce cas et `ficheDe` rendait
`null` : sur les neuf dixièmes de la carte, le geste d'information de HMM3 ne
disait RIEN, et `tools/e2e-geste-carte.mjs` échouait là-dessus depuis
longtemps (vérifié en worktree : l'échec précède ce lot). La fiche donne le
nom du terrain, la région, et surtout le COÛT DE MARCHE — le renseignement
qui décide d'un trajet, affiché nulle part ailleurs. Elle se tait sous le
voile : même équité que pour les armées adverses. Gardes :
`screens/terrain-fiche.test.ts`, et l'e2e des gestes est vert pour la
première fois.

Reste : raccourcis clavier PC quasi absents — HMM3 vit sur Espace (revisite),
E (héros suivant), H (héros), T (cité), Échap (annuler). Il n'existe AUCUN
cycle « héros suivant / cité suivante » ; avec un seul héros ça ne se voit
pas, dès `HireHero` livré ce sera criant. Pas d'infobulle au survol des objets
de carte sur PC (le clic droit/appui long ouvre la fiche, mais le survol est
muet).

### 3.3 « La carte : hyper bien pensée, équilibrée, très cool à découvrir »

État : `packages/map/` est sérieux — `buildWorld(seed)` déterministe
(`build.ts:498`), régions, élévation, hydrographie, routes, barrières,
espacement, départs, lieux nommés, CHACUN avec son fichier de tests. La carte
n'est PAS un tirage aléatoire naïf.

Ce qui manque pour « équilibrée et cool à découvrir », à MESURER avant de
toucher :
- **équité des départs** : écrire une mesure (distance aux premières mines de
  chaque sorte, aux demeures neutres, à la première ville prenable, par
  joueur) et l'imposer en garde. `starts.ts` existe, la garde d'équité
  chiffrée n'existe pas ;
- **rythme de découverte** : HMM3 récompense chaque écart de route ; densité
  d'objets par anneau de distance au départ à mesurer, puis régler ;
- **gardiens gradués** : vérifier que la force des piles neutres croît avec la
  valeur de ce qu'elles gardent et la distance au départ ;
- les quatre conditions de victoire existent (`world/victory.ts` : couronne,
  dernière bannière, maître des marches, chronique) — vérifier qu'elles sont
  ANNONCÉES au joueur en cours de partie (où en suis-je, où en sont-ils).

Outils : `#/demo/carte` + scènes `carte`, `carte_pres`, `carte_loin` de
`tools/screenshot.mjs` ; `pnpm carte` (worker) pour générer/inspecter.

---

## 4. La méthode qui a fait ses preuves ici (la violer coûte cher, c'est mesuré)

1. **Rien n'est vrai sans mesure ou capture regardée.** Les plaintes du
   propriétaire ont TOUTES été confirmées par la mesure — et deux fois la
   mesure a contredit l'intuition (le plafond de marche « raisonnable » qui
   accélérait les charges ; l'écart 1,00 qui remplissait MIEUX les terrasses
   que 0,88).
2. **Une épreuve qui court-circuite l'interface prouve le serveur, pas le
   jeu.** Les quatre défauts bloquants de la session (fin de tour, IA solo,
   bâtir/recruter, sortie de cité) étaient tous invisibles aux tests
   unitaires et visibles au premier clic. Les épreuves `tools/e2e-*.mjs`
   cliquent ; les étendre, jamais les remplacer par des tests de fonctions.
3. **Éprouver chaque garde en défaisant son correctif** (toggle python ciblé,
   relancer, voir rougir, restaurer). JAMAIS `git checkout` pour « défaire » —
   ça a détruit un correctif non commité une fois cette session. Une garde de
   cette session ne rougissait pas : elle trouvait le texte cherché dans son
   propre commentaire. Depuis, les gardes qui lisent la source la lisent
   **commentaires retirés**.
4. **Committer et pousser AVANT toute épreuve longue.** Le conteneur s'est
   réinitialisé TROIS fois cette session (retour à un vieux commit, arbre
   perdu). Tout ce qui était poussé a survécu ; le reste s'est refait.
5. **`railway up` téléverse l'ARBRE, pas le commit.** Ne jamais déployer un
   arbre sale (le déployeur le refuse, ne pas le contourner).
6. Typecheck en vérifiant le code de sortie (`PIPESTATUS`), pas la sortie
   texte — un `| head` avale l'échec.
7. Les commits racontent le défaut, la mesure, le correctif, l'épreuve — en
   français, comme tout le dépôt (fichiers, gardes, commentaires).

---

## 5. Pièges connus (chacun a déjà mordu)

- **Chromium des conteneurs de dev ne joint pas l'internet public** (mesuré
  trois voies). La prod se vérifie par l'API (`fumee-production.mjs`), le
  navigateur sur le paquet local de la même révision.
- **WebGPU** : écran noir sur Windows/Chrome — le rendu force WebGL sauf
  `?rendu=webgpu` (`boot.ts`). Ne pas « réactiver » sans épreuve.
- **Le canevas d'un bâtiment est aux 2/3 transparent** (`SPRITE_FACTEUR`
  1,7). Toute logique d'espacement/couverture raisonne sur la **masse
  visible** (`demiVuePct`), pas le canevas — l'erreur a été faite, mesurée
  (couverture 81→73 %), corrigée. Asymétrie ASSUMÉE : `basePct` accroche avec
  la marge canevas, le desserrage re-accroche avec la marge visible (plus
  permissive — aucune oscillation possible).
- **Scènes lentes à froid** : première carte > 2 min sans GPU. Les épreuves
  attendent `.jeu-scene__legende` (rendue seulement quand la scène est prête),
  PAS le bouton « Fin du tour » (qui vit à la racine et apparaît avant).
- Le plan de masse inclut les chantiers pour ne pas se réorganiser à la
  construction ; il peut ENCORE bouger quand un nouveau chantier se
  DÉVERROUILLE (prérequis atteints). Mineur, connu ; le vrai fix serait un
  nœud par emprise sur tout le catalogue.
- Deux cadences de référence : 260 ms le pas (carte ET combat). Si l'une
  change, changer l'autre — deux gardes le tiennent.

---

## 6. Runbook

```bash
pnpm i                                  # installer
npx vitest run                          # 1359 verts attendus
node tools/e2e-solo.mjs                 # LA boucle de jeu, au clic, PC+iPhone
node tools/e2e-geste-carte.mjs          # les 4 gestes tactiles
node tools/screenshot.mjs cite_granit --dir shots/x   # regarder une scène
RAILWAY_TOKEN=… tools/deployer.sh       # portes de qualité PUIS déploiement
curl -s https://auvergne-web-production.up.railway.app/health  # commit servi
node tools/fumee-production.mjs         # partie réelle sur la prod
```

Premier geste suggéré : vérifier `/health` = HEAD, puis attaquer §2 dans
l'ordre des priorités restantes, une plainte du propriétaire à la fois, une
épreuve au clic par livraison. L'épreuve `e2e-solo` couvre désormais AUSSI :
bâtir le Marché, échanger bois→écus, engager un capitaine (2500 écus exacts),
cycler entre deux héros.

Branche : `claude/hmm-auvergne-game-uesdlz` — n'en pousser aucune autre.
Documents : `docs/90-DOCUMENT-MAITRE.md` (bible), `plan.md`, ce fichier.
