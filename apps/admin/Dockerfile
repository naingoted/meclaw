# syntax=docker/dockerfile:1
FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@10 --activate
WORKDIR /app

##### prune: minimal subset for @meclaw/admin #####
FROM base AS prune
COPY . .
RUN pnpm dlx turbo prune @meclaw/admin --docker

##### deps #####
FROM base AS deps
COPY --from=prune /app/out/json/ ./
COPY --from=prune /app/out/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

##### dev: hot-reload (compose dev only) #####
FROM deps AS dev
ENV NEXT_TELEMETRY_DISABLED=1 WATCHPACK_POLLING=true CHOKIDAR_USEPOLLING=true
EXPOSE 3001
CMD ["pnpm", "--filter", "@meclaw/admin", "dev"]

##### builder #####
FROM deps AS builder
COPY --from=prune /app/out/full/ ./
COPY tsconfig.base.json ./
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @meclaw/admin build

##### runner: standalone #####
FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3001 HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs && useradd --system --uid 1001 --gid nodejs nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/admin/.next/static ./apps/admin/.next/static
USER nextjs
EXPOSE 3001
CMD ["node", "apps/admin/server.js"]
