# Heroes of Might and Magic — Auvergne Edition · Brief maître

Document de référence unique. Tout agent travaillant sur ce dépôt doit l'avoir lu
avant d'écrire une ligne de code. Le document long d'origine (vision, géographie,
factions, chiffres) est archivé dans `docs/90-DOCUMENT-MAITRE.md`.

---

## 1. Ce qu'on livre

Un jeu de stratégie fantasy médiévale au tour par tour, **jouable de bout en bout
dans le navigateur**, déployé en un seul service Railway :

1. **Page d'accueil cinématique** — titre, atmosphère, nouvelle partie, reprise,
   codex, options.
2. **Carte d'aventure** — le Forez réel (Arconsat → La Renaudie), relief, brouillard
   de guerre, héros, cités, ressources, objets, sceaux.
3. **Deux cités jouables** — tableaux vivants en parallaxe, construction quotidienne,
   recrutement hebdomadaire.
4. **Combats tactiques hexagonaux** — 15 × 11, 7 piles, initiative, moral, fortune,
   sorts, sièges.
5. **Progression** — 21 héros, 20 compétences, 32 sorts, artefacts, niveaux.
6. **Adversaires IA** — 4 profils, jouables à 2–5 bannières.
7. **Système de sauvegarde** — emplacements nommés, sauvegarde automatique,
   persistance serveur (PostgreSQL) + repli local, reprise de partie, rejouabilité
   déterministe par hash.

Langue visible : **français intégral**. Code et identifiants : anglais.

## 2. Non négociables

| # | Règle |
|---|-------|
| 1 | `packages/engine` est pur TypeScript : aucun import de React, PixiJS, DOM, Node, Fastify. |
| 2 | Aucun `Math.random()` dans `engine`, `content`, `map`, `bots`. Le PRNG est `packages/engine/src/rng.ts`, injecté via `GameState.rng`. |
| 3 | Toute valeur simulée est un **entier**. Les ratios sont en points de base (BP, /10000). Aucun flottant dans la simulation autoritaire. |
| 4 | Aucune logique de règles dans un composant React ou un objet PixiJS. Les vues lisent l'état et émettent des `Command`. |
| 5 | Aucun asset externe : pas de CDN, pas d'image téléchargée, pas de police distante. Tout est généré (vectoriel, procédural, WebAudio) ou installé via npm (`@fontsource/*`). |
| 6 | Aucun secret dans le dépôt. `RAILWAY_TOKEN`, `DATABASE_URL` viennent de l'environnement. |
| 7 | Aucun texte visible en anglais. Y compris les messages d'erreur et les info-bulles. |
| 8 | Le jeu doit rester jouable **sans serveur de base de données** (repli fichier + `localStorage`). |
| 9 | `pnpm --filter @auvergne/client build` et `pnpm --filter @auvergne/server build` doivent rester verts en permanence. |
| 10 | Cibles tactiles ≥ 48 px, `env(safe-area-inset-*)` respecté, aucune fonction essentielle dépendant du survol. |

## 3. Formule de dégâts (autoritaire, entière)

```
base   = nombre × entierUniforme(dmgMin, dmgMax)
mult   = borne(10000 + 450 × (attaque - défense), 3500, 30000)
final  = plancher(base × mult × modCapacités × modTerrain / 10000 / 10000)
```

`modCapacités` et `modTerrain` sont en BP (10000 = neutre). Aucun coup critique ne
peut éliminer une armée comparable en un seul jet : la Fortune est bornée à ±3000 BP.

## 4. Calendrier

`turn` = jour absolu, 1-based. `jour = ((turn-1) % 7) + 1`, `semaine = ⌊(turn-1)/7⌋+1`,
`ronde = ⌊(turn-1)/28⌋+1`. Croissance des créatures au jour 1 de chaque semaine.
Une construction par cité et par jour. Quatre héros maximum par joueur.

## 5. Coûts de terrain (points de marche)

route 70 · chemin 85 · prairie 100 · forêt 125 · pente 145 · humide 160 · rocher 200 ·
eau infranchissable (hors pont/gué). Héros : 1800–2200 points/jour.
Diagonales : coût × 141 / 100.

## 6. Victoire — La Couronne du Forez

Cinq Sceaux des Marches (`hautes_futaies`, `farges`, `pamole`, `hermitage`, `brumes`).
Trois sceaux ⇒ la Maison du Trésor peut être ouverte, sa garde vaincue, la
proclamation lancée : il faut tenir le site **trois rondes complètes** (84 jours…
ramené à **3 semaines** pour la jouabilité : `CLAIM_DURATION_TURNS = 21`).
Le compte à rebours est public.

Modes alternatifs : `derniere_banniere`, `maitre_marches`, `chronique`.

## 7. Ancrages géographiques (WGS84 → grille 256 × 416)

Emprise : ouest 3.640, est 3.800, sud 45.720, nord 45.900.

| Lieu | lat | lon | col | row |
|------|-----|-----|-----|-----|
| Arconsat | 45.88972 | 3.71389 | 117 | 25 |
| Chabreloche | 45.87972 | 3.69750 | 90 | 48 |
| Le Lac | 45.85937 | 3.70981 | 111 | 95 |
| Col des Sagnes | 45.85170 | 3.70320 | 100 | 113 |
| Maison du Trésor | 45.8515024 | 3.7307805 | 145 | 113 |
| Cervières | 45.84861 | 3.77306 | 214 | 119 |
| Viscomtat | 45.82917 | 3.67694 | 58 | 165 |
| Noirétable | 45.81806 | 3.76556 | 202 | 189 |
| Notre-Dame de l'Hermitage | 45.79170 | 3.71756 | 125 | 250 |
| Vollore-Montagne | 45.785833 | 3.674444 | 55 | 264 |
| La Renaudie | 45.73610 | 3.72110 | 132 | 378 |

Écart toléré entre position réelle projetée et position de jeu : **< 1 case**.
La grille reste la source de vérité ; les coordonnées ci-dessus sont recalculées
par projection dans `packages/map`.

Départs : Arconsat, Viscomtat, Cervières, Noirétable, La Renaudie.
Neutres capturables : Chabreloche, Le Lac, Vollore-Montagne, Notre-Dame de l'Hermitage.

## 8. Propriété des fichiers

Chaque agent n'écrit que dans son périmètre. Toute modification hors périmètre doit
être signalée dans le rapport final, jamais faite en silence.

| Périmètre | Chemins |
|---|---|
| Contrat partagé (verrouillé) | `packages/engine/src/{types,rng,hash}.ts` |
| Moteur — noyau | `packages/engine/src/core/**` |
| Moteur — combat | `packages/engine/src/combat/**` |
| Moteur — progression & monde | `packages/engine/src/world/**` |
| Contenu | `packages/content/src/**` |
| Carte | `packages/map/src/**` |
| IA | `packages/bots/src/**` |
| Protocole | `packages/protocol/src/**` |
| Serveur & sauvegardes | `apps/server/src/**` |
| Rendu carte | `apps/client/src/render/**` |
| Rendu combat | `apps/client/src/battle/**` |
| Art créatures | `apps/client/src/art/**` |
| Cités | `apps/client/src/town/**` |
| Coquille UI | `apps/client/src/ui/**` |
| Accueil | `apps/client/src/landing/**` |
| Audio | `apps/client/src/audio/**` |
| Design system | `packages/ui/src/**` |
| Racine client | `apps/client/src/{main.tsx,App.tsx,state/**}` |

## 9. Conventions de code

- ESM strict, extensions `.js` dans les imports relatifs internes aux paquets
  (`import { x } from './y.js'`) — requis par `moduleResolution: Bundler` + Node.
- Aucun `any` non justifié par un commentaire.
- Les données de contenu sont des objets `as const satisfies XDef[]`, jamais du code.
- Les textes français vivent dans les données de contenu ou dans `apps/client/src/ui/strings.ts`.
- Nommage des fichiers en `kebab-case.ts`, des types en `PascalCase`, des valeurs en `camelCase`.
- Tests : `*.test.ts` à côté du code, exécutés par Vitest depuis la racine.

## 10. Portes de qualité

Avant de déclarer une tâche terminée :

```
pnpm --filter <paquet> typecheck
pnpm test
pnpm --filter @auvergne/client build
pnpm --filter @auvergne/server build
```

Un agent qui casse le build d'un autre périmètre doit le réparer ou le signaler
explicitement.
