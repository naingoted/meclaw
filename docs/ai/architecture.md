# Architecture

## High level

A monorepo with two Next.js apps (public chat + admin) sharing three packages (core DB, RAG, UI), plus a Python LLM sidecar and Docker infra. Visitors chat with a personal bot; admins ingest + edit knowledge. Everything local-first; VPS deploy via GitHub Actions.

```
User (browser)
  ↓
Next.js apps (chat + admin) @ :3000 + :3001 (dev) / subdomain (prod)
  ├─ @meclaw/chat       — public chat, stateless edge (guards + proxy + persistence)
  ├─ @meclaw/admin      — documents/config/gaps console, Auth.js login
  └─ shared packages
      ├─ @meclaw/core   — DB (Drizzle + postgres-js), content loader, settings
      ├─ @meclaw/rag    — ingest (chunk → embed → store) + retrieval config
      ├─ @meclaw/ui     — shadcn components + design system
      └─ @meclaw/mcp    — standalone read-only MCP server (out of the chat path)
  ↓
Python sidecar (services/ai) @ :8000
  ├─ FastAPI + LangGraph: triage → retrieve → draft, plus the research graph
  ├─ reads: LLM gateway (qwen + glm), Ollama embeddings, Postgres pgvector
  ├─ writes: gap_clusters (miss clustering), agent_runs/agent_steps (research)
  └─ streams UI-message-stream SSE protocol back to Next
  ↓
Postgres (conversation history + RAG vectors)
Ollama (nomic-embed-text embeddings)
```

## Request flow: public chat

1. Visitor loads `/` in `apps/chat/app/page.tsx` → Next hydrates `useChat` client component.
2. User types message → `POST /api/chat` in `apps/chat/app/api/chat/route.ts`.
3. Route handler:
   - IP rate-limit check (in-memory map, 429 on exceed)
   - Injection guard (regex patterns, returns UI stream refusal if flagged)
   - Proxies to Python sidecar at `AI_SERVICE_URL` (default `http://localhost:8000`)
   - Tees the streamed response: streams to browser AND accumulates in memory for persistence
4. Python sidecar (services/ai):
   - Resolved-gap fast path: if the query matches a resolved gap's curated answer, return it verbatim (no triage)
   - Triage intent (glm-4.7 non-stream, routing rules)
   - Retrieves top-K matching chunks from Postgres pgvector (by cosine similarity) — retrieval always runs; there is no full-corpus stuffing path
   - Builds persona prompt (persona config + retrieved chunks)
   - Drafts response with qwen3.6-plus (stream to client)
   - Detects misses (low score / zero chunks / "don't know" answers) and folds them into gap clusters
5. Tokens stream back to browser → UI renders markdown with auto-scroll + live trace checklist.
6. On stream finish → best-effort persist of conversation + messages to Postgres (failures logged, never break stream).
7. The server emits an HMAC-signed resume token (`data-resume-token` SSE event) the client stores in `localStorage`. On reload, the client presents it to `GET /api/chat/history` to re-hydrate the transcript; continuing an existing conversation over POST requires the same token, otherwise the server assigns a fresh conversation id.

## Request flow: admin console

1. Visitor hits `/` in `apps/admin/app/page.tsx` → redirects to Auth.js login.
2. Admin enters scrypt-verified password (salt:hash in env), gets JWT in session.
3. Authenticated pages: **Documents** (knowledge editor), **Config**, **Gaps**, **Embed clients**, **Research**, **Audit log** → `POST/PATCH /api/admin/*` for mutations (all audit-logged).
4. Knowledge lives in the `documents` table — markdown in `content/` is only the first-run seed (`seed:docs`). Edits happen in the Documents page.
5. Per-document "Ingest" enqueues an `ingestion_jobs` row; the admin app chunks + embeds **in-process** (needs `OLLAMA_*` env) and writes `rag_chunks` (replace-on-edit). The `pnpm ingest` CLI covers bulk/first-run ingest of `content/` + PDFs + work-impact packs.

## Decisions

- **Anthropic-compatible gateway** (not real Anthropic) via DashScope. Model: `qwen3.6-plus` (draft, streaming) + `glm-4.7` (triage, non-stream). Vercel AI SDK `@ai-sdk/anthropic` with custom `baseURL` (must include `/v1` suffix for TS, must OMIT `/v1` for Python sidecar).
- **Python sidecar for LLM calls** (Phase 3 cutover). Allows multi-step reasoning (triage → retrieve → draft), tool integration via LangGraph, and easy model swaps without Next rebuild.
- **Postgres pgvector for RAG** (single datastore). Ollama `nomic-embed-text` (768-dim) → embedded locally → stored in `rag_chunks` table with HNSW cosine index. Retrieval always runs (the tiny-corpus full-text stuffing path was removed in v1.0.5); ungroundable turns are answered conservatively and recorded as misses.
- **Drizzle migrations** owned by schema; migrations live in `packages/core/drizzle/` and are applied automatically at deploy time by the one-shot `migrations` init-service (reuses the `ops` image; apps wait on its completion before booting).
- **No multi-tenant auth in v1.** Single admin (scrypt + JWT), single visitor stream per session.
- **Monorepo discipline.** Packages (`@meclaw/*`) use relative or package-name imports (never `@/` from root) to avoid breaking the Next build; `pnpm-workspace.yaml` + turbo for orchestration.

## Data model (PostgreSQL, single store)

All tables live in one `DATABASE_URL` instance; schema is Drizzle-owned (`packages/core/drizzle/`):

- **conversations**, **messages** — transcript persistence (best-effort).
- **leads** — captured visitor contact details.
- **rag_chunks** — embedded knowledge (768-dim pgvector, HNSW cosine). Written by ingest, read by the sidecar retriever.
- **documents**, **ingestion_jobs** — admin-managed knowledge + ingest job tracking.
- **settings** — single-row live config (agents / persona / rag / public).
- **audit_log** — every admin mutation.
- **gap_clusters**, **chat_misses** — gap feedback loop (Python writes capture columns, admin writes resolution columns — disjoint writers).
- **retrieval_events** — per-message retrieval telemetry (feeds evals + MCP).
- **embed_clients** — widget tokens + origin allowlists.
- **agent_runs**, **agent_steps** — research-graph observability.

## Production topology

Production runs on a single EC2 box via **Dokploy** (Traefik reverse proxy, Let's Encrypt). Full guide + debugging runbook: `docs/ai/deploy.md`.

- **Stack file:** `infra/docker-compose.dokploy.yml`. (`infra/docker-compose.prod.yml` + `Caddyfile` are the legacy self-managed-VPS alternative.)
- **Routing (Traefik labels):** `meclaw.leanior.com` → chat, `meclaw-admin.leanior.com` → admin.
- **Services:** `chat`, `admin`, `ai` (internal :8000), `ollama`, `postgres`, plus one-shots: `migrations` (auto-runs Drizzle migrations on every deploy; apps gate on its completion) and `ops` (`tools` profile — manual ingest).
- **Data:** `postgres_data` + `ollama_storage` volumes; `content/` bind-mounted into ops for first-run ingest.
- **Release:** `git tag v*` → CI builds four GHCR images → CI calls the Dokploy API to deploy that tag.

## Scaling assumptions (deliberate, single-instance)

This system is designed for **one owner, one VPS, replicas = 1 per service**. A few pieces of state live in process memory and would break silently behind a load balancer:

- **Rate limits** — the IP limiter (`apps/chat/lib/rate-limit.ts`) and the per-embed-client limiter (`apps/chat/lib/embed/rate-limit.ts`) are in-memory maps. With N chat replicas, each caller gets N× the budget. Upgrade path: move counters to Postgres (`INSERT … ON CONFLICT` token bucket) or Redis.
- **Config caches** — the settings cache (`packages/core`, bounded TTL) and the Edge-runtime embed-client cache (CSP `frame-ancestors`, 5-min TTL) each refresh per process. With replicas, admin saves and embed-client revocations propagate per-process within the TTL, so brief inconsistency across replicas. Upgrade path: Postgres `LISTEN/NOTIFY` invalidation.

What scales without changes: the data plane. pgvector with an HNSW index is comfortable far beyond a personal corpus (≥10⁶ chunks); transcripts and telemetry are append-only rows. The Python sidecar is stateless and can replicate freely — only the Next chat edge holds the in-memory state above.

These are documented constraints, not oversights: at this scale, distributed rate-limiting and cache invalidation buy operational complexity with no user-visible benefit.

## Error handling

- **Rate limiting:** 429 Retry-After before parsing body.
- **Injection guard:** request with high-confidence extraction patterns → UI stream refusal (never reaches sidecar).
- **Retrieval can't ground the answer** (zero chunks / low score / Ollama or Postgres down): the bot answers conservatively or defers, and the turn is recorded as a miss → gap cluster.
- **Gateway error/timeout:** stream error event → UI retry, no crash.
- **DB write failure:** logged, persistence best-effort (never breaks stream).
