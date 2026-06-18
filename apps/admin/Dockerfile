# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

##### prune: minimal subset for @meclaw/admin #####
FROM base AS prune
COPY . .
RUN pnpm dlx turbo prune @meclaw/admin --docker

##### deps (production - pruned workspace) #####
FROM base AS deps
COPY --from=prune /app/out/json/ ./
COPY --from=prune /app/out/pnpm-lock.yaml ./
# turbo prune regenerates a pruned lockfile that pnpm's frozen check can reject
# (desyncs vs a workspace package.json) even when the full lockfile is in sync.
RUN pnpm install --no-frozen-lockfile

##### deps-dev (dev mode - full workspace for HMR with compose mounts) #####
FROM base AS deps-dev
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/
COPY packages/ui/package.json ./packages/ui/
COPY packages/rag/package.json ./packages/rag/
COPY apps/admin/package.json ./apps/admin/
# Install full workspace deps so compose mounts work (host source may use any workspace pkg)
RUN pnpm install --no-frozen-lockfile

##### dev: hot-reload (compose dev only) #####
FROM deps-dev AS dev
ENV NEXT_TELEMETRY_DISABLED=1 WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=true
# Pre-create .next so compose's anonymous volume inherits node ownership.
# Without this, docker materialises the mount as root-owned and the node
# user can't write the turbopack dev lockfile / cache.
RUN mkdir -p /app/apps/admin/.next && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["pnpm", "--filter", "@meclaw/admin", "dev"]

##### builder #####
FROM deps AS builder
COPY --from=prune /app/out/full/ ./
COPY tsconfig.base.json ./
ENV NEXT_TELEMETRY_DISABLED=1
ARG MECLAW_VERSION=dev
ARG GIT_SHA=dev
ENV MECLAW_VERSION=${MECLAW_VERSION} GIT_SHA=${GIT_SHA}
RUN pnpm --filter @meclaw/admin build

##### runner: standalone #####
FROM node:26-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "apps/admin/server.js"]
