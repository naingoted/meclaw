# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
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
RUN pnpm install --frozen-lockfile

##### dev: hot-reload (compose dev only) #####
FROM deps AS dev
ENV NEXT_TELEMETRY_DISABLED=1 WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=true
EXPOSE 3000
CMD ["pnpm", "--filter", "@meclaw/chat", "dev"]

##### builder #####
FROM deps AS builder
COPY --from=prune /app/out/full/ ./
COPY tsconfig.base.json ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @meclaw/chat build

##### runner: standalone #####
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/chat/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/chat/.next/static ./apps/chat/.next/static
USER nextjs
EXPOSE 3000
CMD ["node", "apps/chat/server.js"]
