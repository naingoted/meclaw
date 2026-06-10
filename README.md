# meclaw

[![CI](https://github.com/naingoted/meclaw/actions/workflows/ci.yml/badge.svg)](https://github.com/naingoted/meclaw/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Your AI twin, self-hosted.** Fork it, drop your markdown into `content/`, and get a public chatbot that answers questions about *you* — grounded in your own notes, never made up — plus an admin console with a built-in feedback loop: every question the bot couldn't answer lands in a ranked inbox, one click turns it into new knowledge.

This instance is the personal AI bot for **Thet Naing**. Visitors chat on a public page; an AI answers about the owner's work, projects, and contact details. An authenticated admin console lets the owner edit knowledge, re-ingest, tune the agents, and close gaps the bot couldn't answer.

Local-first by design: knowledge lives in markdown under `content/`, everything runs in Docker, no managed cloud DB required. What sets it apart from "chat with my resume" demos: retrieval telemetry on every answer, an offline Ragas eval harness over the real pipeline, a read-only MCP server for agent introspection, and a one-push VPS deploy story.

This project applies what I learned from [RAG and Agentic AI](https://coursera.org/share/7f66461a5be8323f542f68d4a45b8a25) together with my product engineering experience.

<!-- TODO(screenshots): capture and uncomment.
  1. docs/assets/chat-demo.gif   — public chat: ask a question, show streaming answer + the live "how I answered" trace expanding. ~10s screen recording, gif or mp4.
  2. docs/assets/admin-gaps.png  — admin Gaps inbox with a few clustered misses + the "Answer this gap" flow.

<p align="center">
  <img src="docs/assets/chat-demo.gif" alt="Public chat streaming an answer with live retrieval trace" width="720">
</p>
<p align="center">
  <img src="docs/assets/admin-gaps.png" alt="Admin gaps inbox: questions the bot could not answer, clustered by similarity" width="720">
</p>
-->

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
        triage["Triage · non-stream"]
        retrieve["Retrieve top-K (pgvector kNN)"]
        draft["Draft · streaming"]
        gaps["Gap + lead detection"]
        api --> triage --> retrieve --> draft --> gaps
    end

    gw["LLM gateway<br/>(Anthropic- or OpenAI-compatible)"]
    ollama["Ollama<br/>nomic-embed-text"]
    pg[("PostgreSQL + pgvector")]

    agent([MCP client · Claude / agent])
    mcp["@meclaw/mcp<br/>read-only server · stdio/http<br/>telemetry · schema · corpus"]

    visitor --> chat
    owner --> admin
    chat -->|"POST /api/chat → proxy"| api
    chat -. persist turn / retrieval event / miss / lead .-> core
    admin --> core
    admin -->|enqueue ingest| rag

    triage --> gw
    draft --> gw
    retrieve --> pg
    rag --> ollama
    rag --> pg
    gaps --> pg
    core --> pg

    agent --> mcp
    mcp -. read-only .-> pg

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
        AI->>GW: triage intent
        AI->>PG: retrieve top-K chunks (cosine kNN)
        AI->>GW: draft answer (streaming)
        AI-->>N: token stream + step trace + metadata
        N-->>B: stream tokens, live "how I answered" trace
        AI->>AI: detect miss (low score / fallback / "don't know")
        N->>PG: persist conversation + messages
        N->>PG: persist retrieval_events (telemetry)
        N->>PG: persist miss → gap cluster (if any)
    end
```

1. **Edge guards first.** `apps/chat/app/api/chat/route.ts` runs an in-memory IP rate-limit (429 + Retry-After) and a prompt-injection regex guard (streams a refusal without ever calling the sidecar).
2. **Proxy + config.** It forwards to the sidecar at `AI_SERVICE_URL`, attaching a live config snapshot (persona, model knobs, RAG floors, public fields) read from the `settings` table.
3. **Agent pipeline** (`services/ai`): triage intent with the **triage model** (thinking-off, non-stream) → retrieve top-K chunks from pgvector → draft with the **draft model** (streaming). Contact/scheduler intents answer via tools instead of retrieval.
4. **Stream + trace.** Tokens stream back to the browser, which renders markdown with auto-scroll and a live, collapsible step trace ("how I answered").
5. **Persist (best-effort).** On stream finish the route persists the conversation + messages, plus a **retrieval_events** telemetry row (query, intent, grounding flags, top score, candidate chunks). Failures are logged, never break the stream.
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
| `packages/mcp` | `@meclaw/mcp` | MCP server: read-only telemetry/schema tools (scoped + redacted) |
| `services/ai` | — | Python FastAPI + LangGraph sidecar (:8000) + Ragas eval harness |
| `infra/` | — | Docker Compose (dev + prod), Caddy reverse proxy, deploy |

**Tech:** Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · shadcn/ui · Vercel AI SDK · Python (FastAPI + LangGraph) · PostgreSQL + pgvector · Ollama (`nomic-embed-text`, 768-dim) · Drizzle ORM · Auth.js v5 · Zod · Vitest + pytest · turbo.

**Models** — two roles: a **draft model** (streaming) and a **triage model** (non-stream), both run thinking-off for latency where the endpoint supports it. Provider-agnostic: point the `ANTHROPIC_*` env at any Anthropic-compatible endpoint — the Anthropic API itself, or an Anthropic-compatible gateway (e.g. DashScope). For an OpenAI-compatible endpoint, swap the client in `services/ai/app/provider.py`. Either way, models are chosen in that one place.

## Quickstart A — Full stack in Docker (recommended)

```bash
cp infra/.env.example .env        # Docker Compose reads .env
pnpm dev:full                     # postgres, ollama, ai sidecar, chat (:3000), admin (:3001)
```

One-time, after services are up:
```bash
docker compose exec ollama ollama pull nomic-embed-text   # download embed model

# Optional: add your private first-run corpus before seeding/ingesting.
cp content/personal.example.md content/personal.md
# Drop .md/.pdf files into content/knowledge/ or content/private/
# Optional structured packs: data/work_impact_<company>/04_rag_entries.json

pnpm --filter @meclaw/admin seed:docs                     # import content/**/*.md into Documents
pnpm ingest                                                # embed markdown/pdf/work-impact docs → Postgres
```

## Quickstart B — Host dev (fast UI loop)

```bash
pnpm install
cp infra/.env.example .env.local              # Next reads .env.local; fill ANTHROPIC_* + DATABASE_URL
cp services/ai/.env.example services/ai/.env  # sidecar reads this; fill ANTHROPIC_API_KEY
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
| `pnpm --filter @meclaw/admin seed:docs` | Import `content/**/*.md` into the admin Documents table. |
| `pnpm ingest` | Embed ingestable markdown, PDFs, and work-impact packs → Postgres pgvector. |
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
- **retrieval_events** — per-message retrieval telemetry (query, intent, grounded/stuffed, top score, answer-used, candidate chunks). Written by the chat edge; feeds evals + the MCP telemetry tool.

## Evaluation & telemetry

Every answer logs a **retrieval_events** row — the ground truth for *how* the bot answered (what it retrieved, what it grounded on, whether the draft used the context). Read by the eval harness and the `@meclaw/mcp` telemetry tool.

An offline **Ragas eval harness** (`services/ai/app/eval/`) drives the *real* pipeline — production retriever → triage → gate → draft — over a YAML eval set (`services/ai/eval/interview.yaml`) and scores each case:

- **Custom checks** — required-fact / exact-match presence, reference-free defer-accuracy.
- **Ragas** — Faithfulness, Answer Relevancy, Context Precision (+ Context Recall & Factual Correctness when a reference is present). The judge runs through the same provider seam + Ollama embeddings.

```bash
# from services/ai/
uv run -m app.eval.generate                                          # draft cases from the corpus
uv run -m app.eval.run --set eval/interview.yaml --report out/       # run + write report.json / report.md
uv run -m app.eval.run --set eval/interview.yaml --report out/ --ci  # regression gate (exit ≠0 below thresholds)
```

Thresholds: pass-rate ≥ 0.70, faithfulness ≥ 0.50. `--ci` is an opt-in regression gate (not yet wired into blocking PR CI).

## MCP server (read-only)

`packages/mcp` (`@meclaw/mcp`) is a **standalone, read-only [MCP](https://modelcontextprotocol.io) server** — an out-of-band side-door for an AI client (Claude Desktop, an agent) to inspect how the bot is doing. It is **not** in the chat request path; nothing in the apps imports it. It connects directly to Postgres with a read-only role and exposes:

| Tool | Does |
|------|------|
| `get-telemetry` | Summaries by `kind`: `gaps`, `misses`, `ingestion`, `retrieval` (reads `gap_clusters` / `chat_misses` / `ingestion_jobs` / `retrieval_events`). |
| `describe-schema` | Table/column dictionary for safe self-service querying. |
| `run-read-query` | Arbitrary **read-only** SQL (guarded). |
| `search-corpus` | Semantic search over `rag_chunks`. |

It reports over the **same gaps/telemetry tables** the chat loop writes — it surfaces them, it does not create or resolve gaps (that stays in the admin **Gaps** inbox).

```bash
pnpm --filter @meclaw/mcp mcp:stdio   # local MCP client (e.g. Claude Desktop)
pnpm --filter @meclaw/mcp mcp:http    # HTTP transport (token-auth)
```

Env: `MCP_DATABASE_URL` (read-only role), `MCP_AUTH_TOKEN` (http auth), `MCP_ALLOW_PII` (default `false` → redacts PII).

## Environment variables

**Dev** (`.env.local` for Next, `.env` for Docker):
- `ANTHROPIC_API_KEY` — your LLM provider API key (required)
- `ANTHROPIC_BASE_URL` — Anthropic-compatible endpoint root (the Anthropic API, or a compatible gateway like DashScope). **TS AI SDK needs the `/v1` suffix; the Python sidecar must OMIT it** (it appends `/v1/messages` itself).
- `ANTHROPIC_MODEL` — draft model id (your provider's model name)
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

**First-run ingest folders:**

| Local path | File types | What happens |
|------------|------------|--------------|
| `content/personal.md` | Markdown | Copy from `content/personal.example.md`; seed imports it into Documents, ingest embeds it. |
| `content/knowledge/**` | Markdown, PDF | Main private RAG corpus. Markdown can be seeded into Documents; markdown + PDFs are embedded by `pnpm ingest`. |
| `content/private/**` | Markdown, PDF | Local-only sensitive-but-ingestable notes. Same ingest behavior as `content/knowledge/**`. |
| `data/work_impact_<company>/04_rag_entries.json` | JSON | Optional structured work-impact pack. `pnpm ingest` renders one RAG doc per company. See `data/work_impact_example/04_rag_entries.example.json`. |

**Privacy:** `content/` ships only public-safe templates + samples so a fresh clone chats immediately. Real `content/personal.md`, `content/private/**`, real `content/knowledge/**` files, and `data/**` payloads are gitignored and stay local. The tracked `.gitkeep` and `.example` files exist only to show the expected folder shape. See `content/README.md`.

## Docs

- `docs/ai/HANDOFF.md` — current build state + progress log (read first when resuming)
- `docs/ai/architecture.md` — topology & request flow
- `docs/ai/setup.md` — local dev reference
- `docs/ai/deploy.md` — VPS deploy guide
- `docs/ai/repo-index.md` — where things live
- Internal planning/review notes are intentionally not tracked in the public repo.

## Contributing & security

- [CONTRIBUTING.md](CONTRIBUTING.md) — dev setup, quality gates, commit conventions.
- [SECURITY.md](SECURITY.md) — how to report vulnerabilities (privately, please).

## License

[MIT](LICENSE) © Thet Naing Oo
