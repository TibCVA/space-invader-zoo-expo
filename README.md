# Heroes of Might and Magic — Auvergne Edition

> *Les Comtes du Forez — La Maison du Trésor*
>
> Jeu de stratégie fantasy médiévale au tour par tour, dans un Forez légendaire :
> Arconsat, Chabreloche, Le Lac, Cervières, Viscomtat, Noirétable, Vollore-Montagne,
> La Renaudie, Notre-Dame de l'Hermitage — et la Maison du Trésor.

## Démarrer

```bash
pnpm install
pnpm dev            # client (5173) + serveur (8080)
```

Client seul : `pnpm dev:client` · Serveur seul : `pnpm dev:server`

## Construire et lancer en production

```bash
pnpm build          # apps/client/dist + apps/server/dist
pnpm start          # sert le client et l'API sur $PORT (8080 par défaut)
```

## Contrôles qualité

```bash
pnpm typecheck      # TypeScript strict sur tous les paquets
pnpm test           # Vitest (moteur, contenu, carte, protocole)
pnpm e2e            # Playwright (bureau + iPhone)
pnpm shots          # captures d'écran de toutes les scènes → shots/
pnpm sim            # simulations d'équilibrage en masse
```

## Architecture

```
apps/
  client/     React 19 + Vite 8 + PixiJS 8 — carte, combats, cités, interface
  server/     Fastify 5 — statique, API de sauvegarde, santé
  worker/     simulations d'équilibrage hors ligne
packages/
  engine/     bibliothèque pure : état, commandes, événements, hash déterministe
  content/    données du jeu : créatures, héros, sorts, compétences, bâtiments…
  map/        génération de la carte du Forez depuis les ancrages géographiques
  bots/        intelligence artificielle
  protocol/   schémas Zod + sérialisation partagés client/serveur
  ui/         design system React + portraits + icônes
  test-fixtures/ jeux d'essai partagés
```

Le moteur ne dépend ni du DOM, ni de React, ni du réseau. Une commande et un état
produisent une liste d'événements, un nouvel état et un hash. C'est ce qui permet
les tests, les rejeux, les bots et la vérification d'intégrité des sauvegardes.

Documents de référence : [`docs/00-BRIEF.md`](docs/00-BRIEF.md),
[`docs/01-ART-BIBLE.md`](docs/01-ART-BIBLE.md), [`docs/02-API.md`](docs/02-API.md),
[`docs/03-ROUTES.md`](docs/03-ROUTES.md), [`docs/90-DOCUMENT-MAITRE.md`](docs/90-DOCUMENT-MAITRE.md).

## Déploiement Railway

Le dépôt se déploie tel quel : `railway.json` sélectionne le `Dockerfile`, qui
construit le client et le serveur puis lance `node apps/server/dist/server.js`.

Variables attendues sur le service web :

| Variable | Rôle | Obligatoire |
|---|---|---|
| `PORT` | fourni par Railway | oui (automatique) |
| `DATABASE_URL` | PostgreSQL des sauvegardes ; sans elle le serveur bascule sur un stockage fichier | non |
| `SESSION_SECRET` | signature du cookie d'identité anonyme | recommandé |
| `NODE_ENV` | `production` | recommandé |

Aucun secret n'est lu depuis le dépôt. `RAILWAY_TOKEN` n'est utilisé que depuis
l'environnement du processus, jamais écrit dans un fichier.

```bash
export RAILWAY_TOKEN="…"        # jeton limité au projet
railway up --service auvergne-web
```

Point de santé : `GET /health` · Diagnostic sans secret : `GET /api/diagnostic`.

## Licence et contenu

Toutes les créatures, tous les sorts, les héros, les textes, les images et la
musique sont originaux et générés par le code de ce dépôt. Aucun asset, texte ou
mélodie provenant d'une œuvre existante n'y figure.
