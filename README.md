# meclaw

A personal AI bot for **Thet Naing**. Visitors chat on a public page; an AI answers about the owner's work, projects, and contact details — grounded in markdown knowledge, not made up. An authenticated admin console lets the owner edit knowledge, re-ingest, tune the agents, and close gaps the bot couldn't answer.

Local-first by design: knowledge lives in markdown under `content/`, everything runs in Docker, no managed cloud DB required.

## How it works

A monorepo of **two Next.js apps** (public chat + admin) sharing **three packages** (DB/core, RAG, UI), fronted by a **Python LLM sidecar** that does the actual reasoning, all backed by a single **PostgreSQL + pgvector** datastore and **Ollama** for embeddings.

```mermaid
flowchart TB
    visitor([Visitor browser])
    owner([Owner browser])

    subgraph next["Next.js apps (React 19, App Router)"]
        chat["@meclaw/chat<br/>public chat · :3000<br/>rate-limit + injection guard"]
        admin["@meclaw/admin<br/>console · :3001<br/>Auth.js (scrypt + JWT)"]
    end

    subgraph pkgs["Shared packages"]
        core["@meclaw/core<br/>Drizzle + postgres-js<br/>content loader · settings"]
        rag["@meclaw/rag<br/>ingest: chunk → embed → store"]
        ui["@meclaw/ui<br/>shadcn + design system"]
    end

    subgraph sidecar["Python sidecar · services/ai · :8000"]
        api["FastAPI /chat (SSE)"]
        triage["Triage (glm-4.7, non-stream)"]
        retrieve["Retrieve top-K (pgvector kNN)"]
        draft["Draft (qwen3.6-plus, stream)"]
        gaps["Gap + lead detection"]
        api --> triage --> retrieve --> draft --> gaps
    end

    gw["DashScope gateway<br/>(Anthropic-compatible)"]
    ollama["Ollama<br/>nomic-embed-text"]
    pg[("PostgreSQL + pgvector")]

    visitor --> chat
    owner --> admin
    chat -->|"POST /api/chat → proxy"| api
    chat -. persist turn / miss / lead .-> core
    admin --> core
    admin -->|enqueue ingest| rag

    triage --> gw
    draft --> gw
    retrieve --> pg
    rag --> ollama
    rag --> pg
    gaps --> pg
    core --> pg

    classDef store fill:#1f2937,stroke:#10b981,color:#e5e7eb
    class pg,ollama,gw store
```

**The split that matters:** the Next chat app is a thin, stateless edge — it runs guardrails (rate limit + prompt-injection refusal), proxies to the sidecar, tees the stream to the browser, and best-effort persists the turn. All LLM reasoning (routing, retrieval, drafting, gap/lead detection) lives in the Python sidecar so models and agent logic can change without rebuilding Next.

## Chat request flow

```mermaid
sequenceDiagram
    participant B as Browser
    participant N as Next /api/chat
    participant AI as Python sidecar
    participant PG as Postgres+pgvector
    participant GW as LLM gateway

    B->>N: POST message
    N->>N: IP rate-limit + injection guard
    alt flagged
        N-->>B: stream refusal (never hits sidecar)
    else allowed
        N->>AI: proxy (SSE) + config snapshot
        AI->>GW: triage intent (glm-4.7)
        AI->>PG: retrieve top-K chunks (cosine kNN)
        AI->>GW: draft answer (qwen3.6-plus, streaming)
        AI-->>N: token stream + step trace + metadata
        N-->>B: stream tokens, live "how I answered" trace
        AI->>AI: detect miss (low score / fallback / "don't know")
        N->>PG: persist conversation + messages
        N->>PG: persist miss → gap cluster (if any)
    end
```

1. **Edge guards first.** `apps/chat/app/api/chat/route.ts` runs an in-memory IP rate-limit (429 + Retry-After) and a prompt-injection regex guard (streams a refusal without ever calling the sidecar).
2. **Proxy + config.** It forwards to the sidecar at `AI_SERVICE_URL`, attaching a live config snapshot (persona, model knobs, RAG floors, public fields) read from the `settings` table.
3. **Agent pipeline** (`services/ai`): triage intent with `glm-4.7` (thinking-off, non-stream) → retrieve top-K chunks from pgvector → draft with `qwen3.6-plus` (streaming). Contact/scheduler intents answer via tools instead of retrieval.
4. **Stream + trace.** Tokens stream back to the browser, which renders markdown with auto-scroll and a live, collapsible step trace ("how I answered").
5. **Persist (best-effort).** On stream finish the route persists the conversation + messages. Failures are logged, never break the stream.
6. **Gap feedback loop.** If the corpus couldn't ground the answer (low cosine score, zero chunks, low triage confidence, or an explicit "I don't know"), the sidecar records a **miss** and folds it into the nearest **gap cluster** by embedding similarity — surfacing it in the admin Gaps inbox.

## Admin console

`apps/admin` (Auth.js v5, single scrypt-hashed password, JWT session):

- **Documents** — create/edit markdown knowledge, per-doc ingest with live status pills, origin filter (`manual` / `gap` / `seed`).
- **Config** — every field drives chat live: persona, triage/draft model knobs, routing confidence, RAG score floors, and public fields (greeting, suggestion chips, contact, Cal.com URL). Saves reach the running chat process within a bounded TTL — no restart.
- **Gaps** — ranked inbox of questions the bot couldn't answer, clustered by similarity. "Answer this gap" creates a document → enqueues ingest → resolves the cluster, all audit-logged. CSV export.
- **Audit log** — every mutation recorded.

## Stack

**Monorepo** (pnpm workspaces + turbo):

| Path | Package | Role |
|------|---------|------|
| `apps/chat` | `@meclaw/chat` | Public chat, stateless edge (:3000) |
| `apps/admin` | `@meclaw/admin` | Content/config/gaps console, Auth.js (:3001) |
| `packages/core` | `@meclaw/core` | Drizzle ORM + postgres-js, content loader, settings |
| `packages/rag` | `@meclaw/rag` | Ingest (chunk → embed → store) + retrieval config |
| `packages/ui` | `@meclaw/ui` | shadcn/ui + shared design system |
| `services/ai` | — | Python FastAPI + LangGraph LLM sidecar (:8000) |
| `infra/` | — | Docker Compose (dev + prod), Caddy reverse proxy, deploy |

**Tech:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Vercel AI SDK · Python (FastAPI + LangGraph) · PostgreSQL + pgvector · Ollama (`nomic-embed-text`, 768-dim) · Drizzle ORM · Auth.js v5 · Zod · Vitest + pytest · turbo.

**Models** (via DashScope Anthropic-compatible gateway): `qwen3.6-plus` drafts (streaming), `glm-4.7` triages (non-stream). Both run thinking-off for latency. Provider-agnostic — swap models in `services/ai/app/provider.py`.

## Quickstart A — Full stack in Docker (recommended)

```bash
cp infra/.env.example .env        # Docker Compose reads .env
pnpm dev:full                     # postgres, ollama, ai sidecar, chat (:3000), admin (:3001)
```

One-time, after services are up:
```bash
docker compose exec ollama ollama pull nomic-embed-text   # download embed model
pnpm ingest                                                # embed content/ corpus → Postgres
```

## Quickstart B — Host dev (fast UI loop)

```bash
pnpm install
cp infra/.env.example .env.local  # Next reads .env.local; fill ANTHROPIC_* + DATABASE_URL
pnpm services                     # postgres + ollama (data plane only)
pnpm db:migrate                   # create tables
pnpm dev:ai                       # Python sidecar :8000 (needs uv)

# In another terminal:
pnpm --filter @meclaw/chat dev    # chat :3000
pnpm --filter @meclaw/admin dev   # admin :3001 (needs AUTH_SECRET + ADMIN_PASSWORD_HASH)
```

**Env file gotcha:** Docker reads `.env`; Next reads `.env.local`. Keep both when switching paths, or symlink.

## Key commands

| Command | Does |
|---------|------|
| `pnpm dev:full` | Docker: full stack (postgres, ollama, ai, chat, admin) with HMR. |
| `pnpm services` | Docker: postgres + ollama only (data plane). |
| `pnpm dev:ai` | Python sidecar :8000 on host (via `uv`, `--reload`). |
| `pnpm --filter @meclaw/chat dev` | Chat Next.js dev :3000. |
| `pnpm --filter @meclaw/admin dev` | Admin Next.js dev :3001. |
| `pnpm db:migrate` | Apply Drizzle migrations to `DATABASE_URL`. |
| `pnpm db:generate` | Generate a new migration from schema changes. |
| `pnpm ingest` | Embed `content/` corpus → Postgres pgvector. |
| `pnpm --filter @meclaw/admin gen:admin-hash <password>` | Mint scrypt admin password hash. |
| `pnpm verify` | Lint + typecheck + build (turbo, all packages) — run before claiming done. |
| `pnpm test` | Vitest (all JS packages). |

## Data model (PostgreSQL, single store)

All tables live in one `DATABASE_URL` instance; vectors use the pgvector extension (768-dim, HNSW cosine).

- **conversations**, **messages** — transcript persistence (best-effort).
- **leads** — captured visitor contact (email/phone) when the bot offers to connect.
- **rag_chunks** — embedded knowledge chunks (written by ingest, read by the sidecar retriever).
- **documents**, **ingestion_jobs** — admin-managed knowledge + ingest job tracking.
- **settings** — single-row config (agents / shared persona / rag / public) driving chat live.
- **audit_log** — every admin mutation.
- **gap_clusters**, **chat_misses** — RAG gap feedback loop (centroid-clustered misses → admin Gaps inbox).

## Environment variables

**Dev** (`.env.local` for Next, `.env` for Docker):
- `ANTHROPIC_API_KEY` — gateway key (required)
- `ANTHROPIC_BASE_URL` — DashScope Anthropic-compatible endpoint. **TS AI SDK needs the `/v1` suffix; the Python sidecar must OMIT it** (it appends `/v1/messages` itself).
- `ANTHROPIC_MODEL` — draft model (default `qwen3.6-plus`)
- `DATABASE_URL` — Postgres conn (default `postgres://meclaw:meclaw@localhost:5432/meclaw`)
- `AI_SERVICE_URL` — sidecar (host dev `http://localhost:8000`; Docker `http://ai:8000`)
- `OLLAMA_BASE_URL` / `OLLAMA_EMBED_MODEL` — embeddings (admin ingests in-process; required there)
- `AUTH_SECRET` — Auth.js 32-byte hex (admin only)
- `ADMIN_PASSWORD_HASH` — scrypt `salt:hash` (admin only; mint via `gen:admin-hash`)

Full reference: `docs/ai/setup.md`.

## Deployment

`git push origin main` → GitHub Actions builds four GHCR images (**chat**, **admin**, **ai**, **ops**) → SSHes to the VPS → pulls + runs `infra/docker-compose.prod.yml`. The one-shot **ops** image runs migrations + ingest on deploy. Caddy routes the apex domain → chat and `admin.<domain>` → admin. Full guide: `docs/ai/deploy.md`.

## Knowledge & privacy

**The database is the source of truth, not the markdown files.** At chat time the sidecar only ever reads embedded chunks from Postgres (`rag_chunks`) — it never touches `content/` at runtime.

The flow:

1. **Seed once** — `content/**.md` is imported into the `documents` table (`pnpm --filter @meclaw/admin seed:docs`, idempotent by content hash, `origin: "seed"`). After this, the markdown is just a starter snapshot.
2. **Edit in the admin console** — create/edit knowledge in **Documents** (`origin: "manual"`); the gap loop adds docs (`origin: "gap"`). The `documents` table is now the editable source of truth.
3. **Ingest** — each document is chunked, embedded (Ollama `nomic-embed-text`), and written to `rag_chunks` (`source = document:<id>`, replace-on-edit so no stale vectors).
4. **Chat reads `rag_chunks`** — cosine kNN over pgvector. DB only.

**Privacy:** `content/` ships only public-safe templates + samples so a fresh clone chats immediately. Put real profile/contact details in `content/personal.md`, private notes in `content/private/**`, and real corpus files in `content/knowledge/**`; those paths are gitignored and stay local. See `content/README.md`.

## Docs

- `docs/ai/HANDOFF.md` — current build state + progress log (read first when resuming)
- `docs/ai/architecture.md` — topology & request flow
- `docs/ai/setup.md` — local dev reference
- `docs/ai/deploy.md` — VPS deploy guide
- `docs/ai/repo-index.md` — where things live
- Internal planning/review notes are intentionally not tracked in the public repo.
