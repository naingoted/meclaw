# syntax=docker/dockerfile:1
FROM node:26-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

##### prune: minimal subset for @meclaw/chat #####
FROM base AS prune
COPY . .
RUN pnpm dlx turbo prune @meclaw/chat --docker

##### deps #####
FROM base AS deps
COPY --from=prune /app/out/json/ ./
COPY --from=prune /app/out/pnpm-lock.yaml ./
# turbo prune regenerates a pruned lockfile that pnpm's frozen check can reject
# (desyncs vs a workspace package.json) even when the full lockfile is in sync.
RUN pnpm install --no-frozen-lockfile

##### dev: hot-reload (compose dev only) #####
FROM deps AS dev
ENV NEXT_TELEMETRY_DISABLED=1 WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=true
# Pre-create .next so compose's anonymous volume inherits node ownership.
# Without this, docker materialises the mount as root-owned and the node
# user can't write the turbopack dev lockfile / cache.
RUN mkdir -p /app/apps/chat/.next && chown -R node:node /app
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@meclaw/chat", "dev"]

##### builder #####
FROM deps AS builder
COPY --from=prune /app/out/full/ ./
COPY tsconfig.base.json ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @meclaw/chat build

##### runner: standalone #####
FROM node:26-bookworm-slim AS runner
WORKDIR /app
ARG GIT_SHA=dev
ARG MECLAW_VERSION=dev
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
ENV GIT_SHA=$GIT_SHA
ENV MECLAW_VERSION=$MECLAW_VERSION
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/chat/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/chat/.next/static ./apps/chat/.next/static
# Next standalone does NOT bundle public/ — copy it so /embed.js (the widget
# loader) and other static assets actually serve instead of 404ing.
COPY --from=builder --chown=nextjs:nodejs /app/apps/chat/public ./apps/chat/public
# Stamp the build identity into the static loader so the deployed widget version
# is identifiable from the browser (console + window.MeclawWidget.version).
RUN sed -i \
  -e "s|__MECLAW_VERSION__|${MECLAW_VERSION}|g" \
  -e "s|__MECLAW_SHA__|${GIT_SHA}|g" \
  ./apps/chat/public/embed.js
USER nextjs
EXPOSE 3000
CMD ["node", "apps/chat/server.js"]
