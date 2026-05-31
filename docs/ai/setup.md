# Local setup

> New here? Start with the root [`README.md`](../../README.md) for the
> clone → running-chat quickstart. This file is the deeper reference.

## Prerequisites

- Node 20+ / pnpm 9+ (`corepack enable` if missing). The Docker images pin
  Node 20 + pnpm 9; the host path works on 20+ too. _(`.nvmrc` not enforced.)_
- Docker + Docker Compose — required for `pnpm dev:full`, `pnpm services`, and
  local RAG retrieval.
- `uv` (Python package runner) if you run the AI sidecar on the host via
  `pnpm dev:ai`. Not needed when you use `pnpm dev:full` (sidecar runs in Docker).
- **PostgreSQL:** persistence uses Postgres via `postgres-js` (pure JS — no
  native build). Local dev runs it as a docker-compose service (`pnpm services`).
  Apply the schema once before chatting persists: `pnpm db:migrate`. If the DB
  is down, chat still works (persistence is best-effort).

## Steps

Two paths — pick one (the root README compares them side by side):

**Full stack in Docker (recommended):**
```bash
cp .env.example .env         # compose reads .env (NOT .env.local); fill ANTHROPIC_API_KEY
pnpm dev:full                # builds + boots qdrant, ollama, ai sidecar, web → :3000
```

**Host dev (fast UI loop):**
```bash
pnpm install
cp .env.example .env.local   # Next reads .env.local; fill ANTHROPIC_API_KEY + DATABASE_URL
pnpm services                # qdrant + ollama + postgres
pnpm db:migrate              # create the conversations/messages tables
pnpm dev:ai                  # the chat route proxies here — start the sidecar (needs uv)
pnpm dev                     # Next only → http://localhost:3000
```

> **`.env` vs `.env.local`:** Docker Compose auto-loads **`.env`**; Next auto-loads
> **`.env.local`**. Different files, both gitignored. `dev:full` reads `.env`;
> `pnpm dev` reads `.env.local`. Keep both (or symlink) if you switch paths.

> **`pnpm dev` is Next only.** Since the Phase-3 cutover the chat answer comes from
> the Python sidecar (`services/ai`); `app/api/chat/route.ts` proxies to
> `AI_SERVICE_URL` (default `http://localhost:8000`). With `pnpm dev` alone and no
> sidecar running, the chat request fails — start the sidecar with `pnpm dev:ai`,
> or use `pnpm dev:full` which runs everything in Docker.

> **Host prod build (`pnpm build && pnpm start`)?** Next reads `.env`/`.env.local`,
> where `AI_SERVICE_URL` may be `http://ai:8000` (the compose-network name, valid
> only inside Docker). On the host that DNS doesn't resolve → `ENOTFOUND ai`.
> Override for a host run: `AI_SERVICE_URL=http://localhost:8000 pnpm start`
> (the Dockerized prod path in `docker-compose.prod.yml` keeps `ai:8000` — correct there).

## Phase 1 RAG services

Start the local vector and embedding services before ingesting (`pnpm services` is shorthand for the compose line):

```bash
docker compose up -d qdrant ollama postgres   # or: pnpm services
docker compose exec ollama ollama pull nomic-embed-text
pnpm db:migrate
pnpm ingest
```

`pnpm dev` runs only the Next server — the data plane is intentionally separate (stateful, slow to boot, survives Next restarts). **`pnpm dev:full`** (= `docker compose up --build`) is the whole stack in Docker: it pulls the qdrant/ollama/postgres images and builds the **`ai`** sidecar (Python deps via `uv`) and **`web`** (node deps via `pnpm`) images, then runs all services with the repo bind-mounted for HMR. It does **not** run a host `pnpm install`, pull the embed model, migrate Postgres, or ingest — see "Phase 1 RAG services" below for those one-time steps. Nothing stops the containers on exit; tear down with `docker compose down`.

If Qdrant or Ollama is down, the chat path falls back to the existing full-corpus prompt. The app stays usable, but retrieval is disabled until the services come back.
When the markdown corpus is still small enough to fit comfortably in the prompt, the app also keeps using the full-corpus prompt instead of narrowing context to retrieved chunks.

## Knowledge corpus

A fresh clone ships with starter content (`content/persona.md`, `content/resume.md`, `content/projects/`) plus a couple of `*_sample_*` docs in `content/knowledge/`, so `pnpm ingest` and chat work immediately. See `content/README.md` for the layout and privacy model. Your own `content/knowledge/**` and `data/**` are git-ignored — they stay local and never reach a public remote.

## Environment variables

Set in `.env.local` (gitignored — never commit real values):

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Gateway key. Required. Owner's earlier key is exposed — rotate it. |
| `ANTHROPIC_BASE_URL` | `https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1` |
| `ANTHROPIC_MODEL` | `qwen3.6-plus` |
| `DATABASE_URL` | Postgres connection. Local default `postgres://meclaw:meclaw@localhost:5432/meclaw`. Required for persistence. |
| `OLLAMA_BASE_URL` | `http://localhost:11434` |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` |
| `QDRANT_URL` | `http://localhost:6333` |
| `QDRANT_COLLECTION` | `meclaw_knowledge` |
| `RAG_TOP_K` | `4` |
| `RAG_DEV_SOURCES` | `true` to include retrieved source metadata in development streams; `false` to omit it. |

## Scripts

| Command | Does |
|---------|------|
| `pnpm dev` | Dev server (Next only; chat needs the sidecar running separately). |
| `pnpm dev:ai` | Python AI sidecar on :8000 (host, via `uv`). |
| `pnpm dev:full` | Build + boot the whole stack in Docker (qdrant, ollama, ai, web). |
| `pnpm services` | Start qdrant + ollama + postgres (data plane only). |
| `pnpm db:generate` | Regenerate Drizzle migrations from `lib/db/schema.ts` into `drizzle/`. |
| `pnpm db:migrate` | Apply pending migrations to `DATABASE_URL`. |
| `pnpm build` | Production build (`output: standalone`). |
| `pnpm start` | Serve the standalone prod build locally (copies `public/` + `.next/static` into `.next/standalone`, then runs `server.js`). |
| `pnpm lint` | ESLint (next config). |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm verify` | lint + typecheck + build — the pre-merge gate. |
| `pnpm test` | Vitest (run once). |
| `pnpm test:watch` | Vitest watch mode. |

## Adding a shadcn component

```bash
pnpm dlx shadcn@latest add <component>
```
