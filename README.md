# echo-clone

A personal **AI-twin chatbot**. Visitors open a public chat page and ask an AI
about the owner — experience, projects, stack — and it answers on their behalf.
Local-first: knowledge lives in editable markdown under `content/`; no cloud DB,
no auth in v1.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 + shadcn/ui ·
Vercel AI SDK · Drizzle ORM + better-sqlite3 · **Python AI sidecar** (FastAPI +
LangGraph) · Qdrant (vector store) + Ollama (embeddings) · Vitest.

Since Phase 3 the chat answer is produced by the **Python sidecar** (`services/ai`),
not in-process TS. The Next route at `app/api/chat/route.ts` proxies to it over
`AI_SERVICE_URL` (default `http://localhost:8000`).

## Two ways to run

| | `pnpm dev:full` (Docker) | `pnpm dev` (host) |
|---|---|---|
| Runs | qdrant + ollama + **ai** sidecar + **web** (Next, HMR) — full stack | Next server only |
| Needs sidecar running? | included | **yes — start it yourself** (`pnpm dev:ai`) or chat 500s |
| Installs deps | inside containers (node + python) | you run `pnpm install` on host |
| Reads env from | **`.env`** (compose interpolation) | **`.env.local`** (Next) |
| Use when | end-to-end, closest to prod | fast UI iteration, tests, typecheck |

> **Env file gotcha:** Docker Compose auto-loads **`.env`**; Next auto-loads
> **`.env.local`**. They are *different files* (both gitignored). If you switch
> between `dev:full` and `dev`, keep both, or symlink one to the other.

## Prerequisites

- **Node 20+** and **pnpm 9+** (`corepack enable` if pnpm is missing). _(Host-only
  path; `dev:full` brings its own toolchain in containers.)_
- **Docker + Docker Compose** — required for `dev:full`, `pnpm services`, and RAG.
- **Build tools** (C compiler, Python 3, make) for the native `better-sqlite3`
  module on the host path. If the rebuild fails, persistence degrades gracefully
  (chat still works, DB errors logged) — see `docs/ai/setup.md`.

## Quickstart A — full stack (recommended)

```bash
cp .env.example .env            # compose reads .env; fill in ANTHROPIC_API_KEY
pnpm dev:full                   # builds + boots qdrant, ollama, ai sidecar, web
```

`dev:full` (= `docker compose up --build`) **pulls** the qdrant/ollama images and
**builds** the `ai` (Python deps via `uv`) and `web` (node deps via `pnpm`, incl.
native `better-sqlite3`) images. App at http://localhost:3000.

It does **not** stop containers on exit — tear down with `docker compose down`.

### Make RAG actually work (one-time)

`dev:full` boots the vector/embedding services but does **not** download the embed
model or load your corpus. Until you do this, retrieval is empty and chat falls
back to stuffing the full corpus into the prompt:

```bash
docker compose exec ollama ollama pull nomic-embed-text   # download embed model
pnpm ingest                                               # embed corpus → Qdrant
```

## Quickstart B — host dev (fast UI loop)

```bash
pnpm install
cp .env.example .env.local      # Next reads .env.local; fill in ANTHROPIC_API_KEY
pnpm rebuild better-sqlite3     # build the native module once

# the chat route proxies to the sidecar — start it (host, via uv):
pnpm dev:ai                     # FastAPI sidecar on :8000  (needs `uv`)
pnpm services                   # qdrant + ollama for retrieval (optional)

pnpm dev                        # Next on http://localhost:3000
```

Then run the RAG one-time steps above (`ollama pull` + `pnpm ingest`) if you want
retrieval.

## Environment variables

Full table in [`docs/ai/setup.md`](docs/ai/setup.md#environment-variables).
Minimum to chat: **`ANTHROPIC_API_KEY`**. The gateway base-URL `/v1` suffix
differs by consumer — see the comments in `.env.example` before editing.

## Commands

| Command | Does |
|---------|------|
| `pnpm dev` | Next dev server only (needs the sidecar running separately). |
| `pnpm dev:ai` | Python AI sidecar on :8000 (host, via `uv`). |
| `pnpm dev:full` | Build + boot the whole stack in Docker (`docker compose up --build`). |
| `pnpm services` | qdrant + ollama only (data plane). |
| `pnpm ingest` | Embed the `content/` corpus into Qdrant. |
| `pnpm build` / `pnpm start` | Production build / serve. |
| `pnpm verify` | lint + typecheck + build — pre-merge gate. |
| `pnpm test` / `pnpm test:watch` | Vitest. |

## Knowledge corpus & privacy

The bot only knows what's in `content/`. A fresh clone ships starter content
(`persona.md`, `resume.md`, `projects/`) plus `*_sample_*` docs so chat works
immediately. **Your own `content/knowledge/**` and `data/**` are gitignored** —
they stay local and never reach a public remote. See `content/README.md`.

## Docs

- `docs/ai/HANDOFF.md` — current build state + next milestone (read first when resuming).
- `docs/ai/setup.md` — deeper local-setup reference.
- `docs/ai/architecture.md` — how it fits together.
- `docs/ai/repo-index.md` — where things live.
- `docs/superpowers/specs/2026-05-29-echo-clone-design.md` — locked design decisions.
