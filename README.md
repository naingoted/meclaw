# meclaw

A personal bot for Thet Naing. Visitors chat with a public page; an AI answers about the owner's work, schedule, and contact details. Admins can log in to edit knowledge and re-ingest. Local-first: knowledge in markdown under `content/`, no cloud DB.

**Status:** Monorepo complete (Plan C). All milestones (M0–M6 chat, Phase 1 RAG, Phase 3 sidecar, Phase 5 deploy infra) done.

## Stack

**Monorepo:**
- `apps/chat` — Next.js 16 public chat (port 3000)
- `apps/admin` — Next.js 16 content editor, Auth.js login (port 3001)
- `packages/core` — Drizzle ORM + Postgres (postgres-js), content loader
- `packages/rag` — ingest + retrieval config
- `packages/ui` — shadcn/ui components + cn helper
- `services/ai` — Python FastAPI + LangGraph sidecar (port 8000)
- `infra/` — Docker Compose (dev + prod), Caddy reverse proxy, deploy config

**Tech:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Vercel AI SDK · **Python sidecar** (FastAPI + LangGraph) · PostgreSQL + pgvector (RAG) · Ollama (embeddings) · Vitest · turbo (monorepo orchestration).

The Next.js chat app at `apps/chat/app/api/chat/route.ts` proxies all LLM calls to the Python sidecar (`services/ai`) over `AI_SERVICE_URL` (default `http://localhost:8000`).

## Quickstart A — Full stack in Docker (recommended)

```bash
cp .env.example .env              # Docker Compose reads .env
pnpm dev:full                     # boots postgres, ollama, ai sidecar, chat (:3000), admin (:3001)
```

One-time (after services are up):
```bash
docker compose exec ollama ollama pull nomic-embed-text   # download embed model
pnpm --filter @meclaw/rag ingest                           # embed corpus → Postgres
```

## Quickstart B — Host dev (fast UI loop)

```bash
pnpm install
cp .env.example .env.local        # Next.js reads .env.local; fill ANTHROPIC_API_KEY + DATABASE_URL
pnpm services                     # postgres + ollama (data plane)
pnpm --filter @meclaw/core db:migrate   # create tables
pnpm dev:ai                       # Python sidecar :8000 (needs uv)

# In another terminal:
pnpm --filter @meclaw/chat dev    # chat :3000
pnpm --filter @meclaw/admin dev   # admin :3001 (requires AUTH_SECRET + ADMIN_PASSWORD_HASH)
```

**Env file gotcha:** Docker reads `.env`; Next reads `.env.local`. Keep both if switching paths, or symlink.

## Key commands

| Command | Does |
|---------|------|
| `pnpm dev:full` | Docker: postgres, ollama, ai sidecar, chat, admin (full stack HMR). |
| `pnpm dev:ai` | Python sidecar :8000 on host (via `uv`). |
| `pnpm services` | Docker: postgres + ollama only (data plane). |
| `pnpm --filter @meclaw/chat dev` | Chat Next.js dev :3000. |
| `pnpm --filter @meclaw/admin dev` | Admin Next.js dev :3001. |
| `pnpm --filter @meclaw/core db:migrate` | Apply Drizzle migrations to DATABASE_URL. |
| `pnpm --filter @meclaw/rag ingest` | Embed content/ corpus → Postgres. |
| `pnpm --filter @meclaw/admin gen:admin-hash <password>` | Mint scrypt admin password hash. |
| `pnpm verify` | Lint + typecheck + build (turbo, all packages). |
| `pnpm test` | Vitest. |
| `docker compose -f infra/docker-compose.yml config -q` | Validate dev compose syntax. |
| `docker compose -f infra/docker-compose.prod.yml config -q` | Validate prod compose syntax. |

## Deployment

VPS deploy: `git push origin main` → GitHub Actions → builds four GHCR images (chat, admin, ai, ops) → SSHes to VPS → pulls + runs `infra/docker-compose.prod.yml`. Caddy reverse proxy routes apex domain → chat, `admin.<domain>` → admin. See `docs/ai/deploy.md` for full setup.

## Environment variables

**Dev** (`.env.local`):
- `ANTHROPIC_API_KEY` — gateway key (required)
- `ANTHROPIC_BASE_URL` — `https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1`
- `ANTHROPIC_MODEL` — `qwen3.6-plus`
- `DATABASE_URL` — Postgres conn (default: `postgres://meclaw:meclaw@localhost:5432/meclaw`)
- `AI_SERVICE_URL` — sidecar (default: `http://localhost:8000` for host dev; `http://ai:8000` in Docker)
- `AUTH_SECRET` — Auth.js random 32-byte hex (only for admin app)
- `ADMIN_PASSWORD_HASH` — scrypt `salt:hash` (only for admin app; mint via `gen:admin-hash`)

Full reference: `docs/ai/setup.md`.

## Knowledge & privacy

Bot learns from `content/` markdown. Fresh clone ships with starter files + samples so chat works immediately. **Your own `content/knowledge/**` stays local & gitignored** — never reaches public remotes. See `content/README.md`.

## Docs

- `docs/ai/HANDOFF.md` — current state + milestones (read first when resuming)
- `docs/ai/setup.md` — local dev reference
- `docs/ai/architecture.md` — topology & request flow
- `docs/ai/deploy.md` — VPS deploy guide
- `docs/ai/repo-index.md` — where things live
- `docs/superpowers/specs/` — archived design decisions
