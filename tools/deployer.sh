#!/usr/bin/env bash
#
# Déploiement sur Railway.
#
# Le jeton n'est lu QUE dans l'environnement du processus. Il n'est jamais
# écrit dans le dépôt, jamais journalisé, jamais passé en argument de ligne de
# commande — un argument se lit dans `ps` et se retrouve dans l'historique du
# shell. S'il manque, ce script s'arrête et dit comment le fournir.
#
#   RAILWAY_TOKEN=… tools/deployer.sh
#
# Avant d'envoyer quoi que ce soit, on vérifie que ce qu'on déploie tient
# debout : types, lint, tests, et surtout l'épreuve de chargement sous la vraie
# politique de sécurité. Cette dernière n'est pas une formalité — deux pannes
# bloquantes sont déjà parties en production parce que personne ne l'avait
# faite.

set -euo pipefail

SERVICE="${RAILWAY_SERVICE:-auvergne-web}"
RACINE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$RACINE"

if [ -z "${RAILWAY_TOKEN:-}" ]; then
  cat >&2 <<'FIN'
Aucun jeton Railway dans l'environnement.

  RAILWAY_TOKEN=<votre-jeton> tools/deployer.sh

Le jeton ne doit être écrit nulle part dans le dépôt, ni dans un .env versionné.
Si le vôtre a été partagé dans une conversation, remplacez-le d'abord : un jeton
qui a circulé est un jeton perdu.
FIN
  exit 1
fi

echo "▸ portes de qualité"
pnpm -r --parallel typecheck
npx eslint .
npx vitest run --exclude '**/perf.test.ts' --exclude '**/duel.test.ts'

echo "▸ construction"
pnpm --filter @auvergne/client build
pnpm --filter @auvergne/server build

echo "▸ épreuve de chargement sous la CSP réelle"
node tools/repro-chargement.mjs 3 40000

echo "▸ envoi vers Railway (service : $SERVICE)"
# `--ci` : pas d'invite interactive, la sortie est un journal et non un écran.
railway up --service "$SERVICE" --ci

echo "▸ déployé. Vérifiez : https://auvergne-web-production.up.railway.app"
