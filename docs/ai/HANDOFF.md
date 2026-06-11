# HANDOFF — meclaw build state

> **Read this first when resuming.** Single source of truth for continuing the build after a context clear.
> Internal design notes are not tracked in the public repo; use `docs/ai/*` for public orientation.
> Detailed per-feature build notes live in this file's **git history** — each progress-log entry below was once a full writeup; `git log -p docs/ai/HANDOFF.md` recovers it.

## What this project is

Personal bot (single user). Public chat page; AI answers about the owner (Thet Naing) from markdown knowledge files. Admin console for content/ingest management (Auth.js login). Local-first: no cloud DB. Monorepo (chat + admin apps, shared packages, Python sidecar, Docker infra).

## Locked decisions (do not re-litigate)

- **Monorepo** (pnpm workspaces + turbo): `apps/{chat,admin}`, `packages/{core,rag,ui,mcp}`, `services/ai`, `infra/`.
- **Two Next.js apps** (App Router, React 19, TS). **Next 16** (current latest).
  - `apps/chat` — public chat, stateless edge (guards + proxy + persistence tee).
  - `apps/admin` — knowledge/config/gaps console, Auth.js v5 login (scrypt password). Knowledge lives in the `documents` table (markdown in `content/` is only the first-run seed); admin embeds in-process (needs `OLLAMA_*` env).
- **Python LLM sidecar** (`services/ai`): FastAPI + LangGraph. Handles triage → retrieve → draft, gap/lead detection, research graph. Models swap without Next rebuilds.
- **LLM:** `qwen3.6-plus` (draft, streaming) + `glm-4.7` (triage, non-stream) via DashScope Anthropic-compatible gateway, both thinking-off. Base-URL gotcha: TS AI SDK needs the `/v1` suffix, Python SDK must OMIT it (appends `/v1/messages` itself).
- **Local RAG:** Ollama `nomic-embed-text` (768-dim) → Postgres pgvector (`rag_chunks`, HNSW cosine). Retrieval always runs — the tiny-corpus full-text stuffing path was removed in v1.0.5 (resolved-gap pickup). Qdrant removed 2026-06-01.
- **Persistence:** PostgreSQL + Drizzle ORM (`postgres-js`). Migrations in `packages/core/drizzle/`, applied automatically on every deploy by a one-shot `migrations` init-service (apps gate on `service_completed_successfully`). Migrated from SQLite 2026-05-31.
- **Admin auth:** single admin (scrypt password hash in env), JWT session (Auth.js v5). No multi-tenant, no OAuth in v1.
- **UI:** Tailwind 4 + shadcn/ui (shared design system in `packages/ui`). Validation: Zod. Tests: Vitest (TDD) + pytest.
- **Deploy:** `git tag v*` → GitHub Actions `quality → build` (four GHCR images: chat, admin, ai, ops) → `deploy` job calls the Dokploy REST API `POST /api/compose.deploy`. Stack: `infra/docker-compose.dokploy.yml`, Traefik subdomain routing. No SSH in the pipeline; Dokploy `autoDeploy` OFF by design. See `docs/ai/deploy.md`.

## Environment (names only — NEVER commit values)

`.env.local` or `.env` (gitignored) must contain:

```
ANTHROPIC_API_KEY=
ANTHROPIC_BASE_URL=https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1
ANTHROPIC_MODEL=qwen3.6-plus
```

> The TS AI SDK appends `/messages` → base URL MUST end in `/v1`. The Python sidecar appends `/v1/messages` → its base URL must NOT end in `/v1`. Full reference: `docs/ai/setup.md`.
> ⚠️ Rotate any key that has ever appeared in chat, logs, or a local shell transcript. Never echo key values, never write them into committed files.

## Status

**Everything below is complete and merged to `main` (pushed, HEAD `3d52515`); production runs v1.0.10-alpha at `meclaw.leanior.com`:**

- v1 milestones M0–M6 (chat loop, persona, persistence, UX, tools, guardrails)
- RAG on pgvector + admin console + gap feedback loop + config wiring
- Python sidecar (Phase 3 cutover) with thinking-off latency pass
- Spec B: retrieval telemetry (`retrieval_events`) + Ragas eval harness
- Spec A U1+U2: read-only MCP tool layer (server + operator client)
- Spec C1+C2: multi-agent research graph (headless core + admin UX)
- Embeddable chat widget + resume tokens + main-chat session persistence
- Resolved-gap pickup (curated-answer fast path; stuffing removed)
- Chat UI upgrade (single-bot loading fix, timestamps, New chat, history drawer)
- Mobile-responsive embed (full-screen on mobile/PWA, keyboard handling, safe-area insets)
- Mobile embed UX fixes — close button (postMessage + Escape), keyboard-sticky input, bot avatars removed, overflow/overscroll hardened
- Parent theme sync — embed.js detects host dark/light theme, passes via query param + live postMessage relay
- Pre-commit/CI hardening; auto-migration on deploy (CI-proven)

**Open items:**

- Spec A **U3** (chat-agent graph → MCP-client ReAct node) — deferred.
- Eval set: expand `services/ai/eval/interview.yaml` to ≥50 cases, then run the live smoke (`uv run -m app.eval.run --set eval/interview.yaml --report out/`) on a stack with gateway + Ollama + Postgres.
- Live browser smokes pending: resolved-gap pickup; chat-UI upgrade (timestamps/drawer/New-chat on a real stack); `retrieval_events` row on a real knowledge turn.

## How to resume after /clear

1. Read this file.
2. Check `git log` and the repo tree for current state.
3. Pick up from **Open items** above (or the user's task). Update Status as you finish. Use TDD (Vitest/pytest); browser-verify via Playwright MCP (`MCP_DOCKER` `browser_*` tools) — see `conventions.md`.

## Progress log

One line per landed change, newest last. Full writeups: `git log -p docs/ai/HANDOFF.md`.

- 2026-05-29: Brainstorm + spec; git init.
- 2026-05-29: **M0** scaffold — Next 16 flat, shadcn, Vitest, CI, agentic docs.
- 2026-05-29: **M1** chat core loop — provider + streaming route + `useChat` UI; `/v1` base-URL fix.
- 2026-05-29: **M2** persona + knowledge — content loader, persona prompt, grounding rules.
- 2026-05-29: **M3** persistence — conversations/messages, best-effort save (SQLite then).
- 2026-05-29: **M4** recruiter UX — greeting, chips, avatar, resume route, footer.
- 2026-05-29: **M5** agent tools — contact / schedule / resume / how-it-works, multi-step.
- 2026-05-29: **M6** guardrails — IP rate limit, injection guard, refusal stream.
- 2026-05-30: **V2 P1** local RAG — Ollama + Qdrant, ingest, retrieval, dev sources panel; browser-verified.
- 2026-05-31: **Phase 3** Python sidecar — FastAPI + LangGraph, Next proxies; Python base-URL + thinking-mode gotchas resolved.
- 2026-05-31: Latency pass — thinking-off via constructor flag, ~5–20× faster end-to-end (`c97e06d`).
- 2026-05-31: Legible thinking trace — live `LiveTrace` checklist + persisted "How I answered".
- 2026-06-01: SQLite → **Postgres** (Drizzle migrations, CI postgres service).
- 2026-06-01: Qdrant → **pgvector** single store (`rag_chunks`, HNSW cosine); Qdrant removed.
- 2026-06-03: Admin/chat UI polish — cursor/hover/a11y rules, live ingest pills.
- 2026-06-03: UI refresh — terminal aesthetic, shared design system in `packages/ui`, dark default.
- 2026-06-03: **RAG gap feedback loop** — misses + `gap_clusters` + admin Gaps inbox (migration 0004).
- 2026-06-03: Config wiring — every `/admin/config` field drives chat live via TTL cache (`af2427c`).
- 2026-06-03: Gap doc origin + `answer_gap` miss detection (migration 0005); live-verified.
- 2026-06-06: **Spec B** eval runner CLI — real-pipeline Ragas scoring, JSON/MD reports, `--ci` gate.
- 2026-06-07: Pre-commit/CI hardening — Biome + secretlint + commitlint + fallow + semgrep tiers (`90b15f3`).
- 2026-06-07: **Spec A U1+U2** MCP tool layer — TS server (two scopes, two transports, `meclaw_ro` role) + operator client (`1c91177` → `545caa4`). U3 deferred.
- 2026-06-09: **Embed widget** + browser history — `embed_clients` (migration 0009), CSP `frame-ancestors`, HMAC resume tokens, admin page; live-verified.
- 2026-06-09: **Spec C1** research graph headless core — `services/ai/app/research/`, `agent_runs`/`agent_steps` (`d61f078`).
- 2026-06-09: **Spec C2** research operator UX — `/research` SSE + admin `/admin/research` (`898fba0`).
- 2026-06-10: Main-chat session persistence — resume tokens on the public page (`4470277`).
- 2026-06-10: Auto-migration on deploy — `migrations` init-service; CI deploy path proven live (`1d7aa2b`, v1.0.3-alpha).
- 2026-06-11: **Resolved-gap pickup** — curated-answer fast path before triage; tiny-corpus stuffing removed; `gapMatchThreshold` knob (`5503d8f`, released v1.0.5-alpha). Browser smoke pending.
- 2026-06-11: **Chat UI upgrade** — single-bot loading fix, timestamps + copy + day separators, New chat, history drawer; merged + pushed (`2c5cc1e`). Browser smoke pending.
- 2026-06-11: **Lint → Biome** — enabled Biome linter (`react`+`next` domains) and dropped ESLint entirely (removed `eslint`/`eslint-config-next` + all eslint configs). `pnpm lint`/`verify`, pre-push, and CI now run `biome check`; `noNonNullAssertion`/`noArrayIndexKey` off, `useButtonType` relaxed in tests.
- 2026-06-11: **Mobile-responsive embed** — embed.js now auto-switches to full-screen on mobile (≤768px) and PWA standalone mode. Includes keyboard handling via `visualViewport` API with 200px min-height floor, safe-area insets for notched devices, 75ms debounced resize/orientation listeners, `document.currentScript` for reliable async script detection, and event listener cleanup in `destroy()`. Browser-verified on Chrome (mobile/desktop modes).
- 2026-06-11: **Mobile embed UX fixes** — close button in toolbar (embed mode only, posts `meclaw:close` postMessage + Escape key), keyboard-sticky input via `visualViewport` resize with touch-scroll guards, bot avatars removed (reclaims ~44px/message, `aria-label` a11y preserved on `<section>` wrappers), `overscroll-contain` + `break-words` overflow hardening, min-height floor removed from iframe container. Released v1.0.9-alpha.
- 2026-06-11: **Parent theme sync** — embed.js detects host page's dark/light theme from `.dark` class or `data-meclaw-theme` attribute, passes as `&theme=` query param on iframe URL, and relays live `meclaw:theme` postMessage from parent into the iframe. Widget applies via `useTheme().setTheme()`. Leanior side: `MeclawThemeSync` client component sends `resolvedTheme` via postMessage with MutationObserver for async iframe readiness. Released v1.0.10-alpha.
