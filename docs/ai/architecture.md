# Architecture

## High level

A monorepo with two Next.js apps (public chat + admin) sharing three packages (core DB, RAG, UI), plus a Python LLM sidecar and Docker infra. Visitors chat with a personal bot; admins ingest + edit knowledge. Everything local-first; VPS deploy via GitHub Actions.

```
User (browser)
  ↓
Next.js apps (chat + admin) @ :3000 + :3001 (dev) / subdomain (prod)
  ├─ @meclaw/chat       — public chat, stateless
  ├─ @meclaw/admin      — content/ingest editor, Auth.js login
  └─ shared packages
      ├─ @meclaw/core   — DB (Drizzle + postgres-js), content loader, settings
      ├─ @meclaw/rag    — ingest script, retrieval config (read-only)
      └─ @meclaw/ui     — shadcn components + cn helper
  ↓
Python sidecar (services/ai) @ :8000
  ├─ FastAPI + LangGraph triage agent
  ├─ reads: LLM gateway (qwen + glm), Ollama embeddings, Postgres pgvector
  ├─ writes: nothing (read-only over Postgres + Ollama)
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
   - Triage intent (glm-4.7 non-stream, routing rules)
   - Retrieves top-K matching chunks from Postgres pgvector (by cosine similarity)
   - Builds persona prompt (private `personal.md` when present, public template/sample docs, and retrieved chunks or full corpus fallback)
   - Drafts response with qwen3.6-plus (stream to client)
5. Tokens stream back to browser → UI renders markdown with auto-scroll + live trace checklist.
6. On stream finish → best-effort persist of conversation + messages to Postgres (failures logged, never break stream).

## Request flow: admin console

1. Visitor hits `/` in `apps/admin/app/page.tsx` → redirects to Auth.js login.
2. Admin enters scrypt-verified password (salt:hash in env), gets JWT in session.
3. Authenticated routes show content editor (forms) → `POST /api/actions/*` for mutations.
4. Admin updates persona/knowledge markdown → editor writes to `content/` (local filesystem).
5. Admin clicks "ingest" → calls `pnpm --filter @meclaw/rag ingest` (one-shot, embeds corpus → Postgres).

## Decisions

- **Anthropic-compatible gateway** (not real Anthropic) via DashScope. Model: `qwen3.6-plus` (draft, streaming) + `glm-4.7` (triage, non-stream). Vercel AI SDK `@ai-sdk/anthropic` with custom `baseURL` (must include `/v1` suffix for TS, must OMIT `/v1` for Python sidecar).
- **Python sidecar for LLM calls** (Phase 3 cutover). Allows multi-step reasoning (triage → retrieve → draft), tool integration via LangGraph, and easy model swaps without Next rebuild.
- **Postgres pgvector for RAG** (single datastore). Ollama `nomic-embed-text` (768-dim) → embedded locally → stored in `rag_chunks` table with HNSW cosine index. Retrieval falls back to full-corpus if services are unavailable (graceful degradation).
- **Drizzle migrations** owned by schema; migrations live in `packages/core/drizzle/` and are applied at deploy time via the `ops` Docker image.
- **No multi-tenant auth in v1.** Single admin (scrypt + JWT), single visitor stream per session.
- **Monorepo discipline.** Packages (`@meclaw/*`) use relative or package-name imports (never `@/` from root) to avoid breaking the Next build; `pnpm-workspace.yaml` + turbo for orchestration.

## Data model (PostgreSQL)

Tables:
- **conversations** — `id (uuid), createdAt (timestamp)`
- **messages** — `id (uuid), conversationId (fk), role (user|assistant), content (text), toolCalls (json), createdAt (timestamp)`
- **rag_chunks** — `id (uuid), source (text), title (text), text (text), ordinal (int), embedding (vector, 768-dim, pgvector)` with HNSW cosine index

Both `conversations` + `messages` (transactional) and `rag_chunks` (vectors) live in the same `DATABASE_URL` Postgres instance.

## Production topology

**Reverse proxy** (Caddy, `infra/Caddyfile`):
- `yourdomain.com` → chat container (port 3000)
- `admin.yourdomain.com` → admin container (port 3000)

**Service containers**:
- `meclaw-chat` (port 3000 internal) — public chat, stateless
- `meclaw-admin` (port 3000 internal) — admin console, reads/writes `content/` bind-mount + Postgres
- `meclaw-ai` (port 8000 internal) — Python sidecar, read-only Postgres + Ollama
- `meclaw-ops` (one-shot) — runs migrations + ingest on deploy, then exits

**Data** (persistent volumes):
- Postgres (`postgres_data` volume)
- Ollama (`ollama_storage` volume for model cache)
- `content/knowledge` bind-mounted into ops + admin (for ingest + editing)

Chat + admin containers do NOT have `content/` mounted (they use pre-computed embeddings); see `docs/ai/deploy.md` "Known limitations" for workaround.

## Error handling

- **Rate limiting:** 429 Retry-After before parsing body.
- **Injection guard:** request with high-confidence extraction patterns → UI stream refusal (never reaches sidecar).
- **Tiny corpus:** if `content/**` is < 8000 chars, RAG prompt uses full corpus (no retrieval narrowing needed).
- **Ollama/Postgres unavailable:** chat falls back to full-corpus prompt, stays usable.
- **Gateway error/timeout:** stream error event → UI retry, no crash.
- **DB write failure:** logged, persistence best-effort (never breaks stream).
