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

# `railway up` téléverse le répertoire de travail tel qu'il est, et non le
# dernier commit. Un fichier a demi écrit — une expérience en cours, une
# ablation qu'on n'a pas encore annulée — partirait donc en production sans que
# rien ne le signale. On exige un arbre propre, et l'on dit ce qui traîne.
if [ -n "$(git status --porcelain)" ]; then
  echo "L'arbre de travail n'est pas propre. Ce qui suit partirait en production :" >&2
  git status --short >&2
  echo >&2
  echo "Committez, annulez, ou relancez avec DEPLOYER_ARBRE_SALE=1 en connaissance de cause." >&2
  [ "${DEPLOYER_ARBRE_SALE:-}" = "1" ] || exit 1
  echo "▸ arbre sale accepté explicitement" >&2
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

# L'empreinte de révision, posée AVANT l'envoi.
#
# `/health` publie `commit`, lu dans `RAILWAY_GIT_COMMIT_SHA` puis `GIT_COMMIT`.
# Railway ne renseigne le premier que pour un déploiement déclenché par GitHub ;
# avec `railway up`, il est absent. Tant que personne ne posait le second, la
# santé annonçait un commit vieux de plusieurs déploiements — et l'on ne pouvait
# plus vérifier quelle version tournait, ce qui est précisément à quoi ce champ
# sert. La variable est posée ici parce que c'est ici, et nulle part ailleurs,
# qu'on sait ce qu'on expédie ; `--skip-deploys` évite un redéploiement à vide
# juste avant le vrai.
COMMIT="$(git rev-parse HEAD)"
echo "▸ empreinte de révision : $COMMIT"
railway variables --service "$SERVICE" --set "GIT_COMMIT=$COMMIT" --skip-deploys >/dev/null

echo "▸ envoi vers Railway (service : $SERVICE)"
# `--ci` : pas d'invite interactive, la sortie est un journal et non un écran.
railway up --service "$SERVICE" --ci

echo "▸ déployé. Vérifiez : https://auvergne-web-production.up.railway.app"
echo "  la santé doit annoncer le commit $COMMIT :"
echo "  curl -s https://auvergne-web-production.up.railway.app/health"
