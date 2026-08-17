# syntax=docker/dockerfile:1
# ── Étape de construction ────────────────────────────────────────────────────
FROM node:22-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

COPY pnpm-workspace.yaml package.json .npmrc pnpm-lock.yaml ./
COPY apps/client/package.json ./apps/client/
COPY apps/server/package.json ./apps/server/
COPY apps/worker/package.json ./apps/worker/
COPY packages/engine/package.json ./packages/engine/
COPY packages/game/package.json ./packages/game/
COPY packages/content/package.json ./packages/content/
COPY packages/map/package.json ./packages/map/
COPY packages/bots/package.json ./packages/bots/
COPY packages/protocol/package.json ./packages/protocol/
COPY packages/ui/package.json ./packages/ui/
COPY packages/test-fixtures/package.json ./packages/test-fixtures/
RUN pnpm install --no-frozen-lockfile

COPY . .
RUN pnpm --filter @auvergne/client build \
 && pnpm --filter @auvergne/server build

# ── Étape d'exécution ────────────────────────────────────────────────────────
FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/client/dist ./apps/client/dist

EXPOSE 8080
ENV PORT=8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/server/dist/server.js"]
