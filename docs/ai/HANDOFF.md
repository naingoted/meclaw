# HANDOFF — meclaw build state

> **Read this first when resuming.** Single source of truth for continuing the build after a context clear.
> Internal design notes are not tracked in the public repo; use `docs/ai/*` for public orientation.
> Detailed per-feature build notes live in this file's **git history** — each progress-log entry below was once a full writeup; `git log -p docs/ai/HANDOFF.md` recovers it.

## What this project is

Personal bot (single user). Public chat page; AI answers about the owner (Thet Naing) from markdown knowledge files. Admin console for content/ingest management (Auth.js login). Local-first: no cloud DB. Monorepo (chat + admin apps, shared packages, Python sidecar, Docker infra).

## Locked decisions (do not re-litigate)

- **Monorepo** (pnpm workspaces + turbo): `apps/{chat,admin}`, `packages/{core,rag,ui,mcp,meclaw-chat-ui}`, `services/ai`, `infra/`.
- **Two Next.js apps** (App Router, React 19, TS). **Next 16** (current latest).
  - `apps/chat` — public chat, stateless edge (guards + proxy + persistence tee).
  - `apps/admin` — knowledge/config/gaps console, Auth.js v5 login (scrypt password). Knowledge lives in the `documents` table (markdown in `content/` is only the first-run seed); admin embeds in-process (needs `OLLAMA_*` env).
- **Python LLM sidecar** (`services/ai`): FastAPI + LangGraph. Handles triage → retrieve → draft, gap/lead detection, research graph. Models swap without Next rebuilds.
- **LLM:** `qwen3.6-plus` (draft, streaming) + `glm-4.7` (triage, non-stream) via DashScope Anthropic-compatible gateway, both thinking-off. Base-URL gotcha: TS AI SDK needs the `/v1` suffix, Python SDK must OMIT it (appends `/v1/messages` itself).
- **Local RAG:** Ollama `nomic-embed-text` (768-dim) → Postgres pgvector (`rag_chunks`, HNSW cosine). Retrieval always runs — the tiny-corpus full-text stuffing path was removed in v1.0.5 (resolved-gap pickup). Qdrant removed 2026-06-01.
- **Persistence:** PostgreSQL + Drizzle ORM (`postgres-js`). Migrations in `packages/core/drizzle/`, applied automatically on every deploy by a one-shot `migrations` init-service (apps gate on `service_completed_successfully`). Migrated from SQLite 2026-05-31.
- **Admin auth:** DB-backed `admin_users` table with Auth.js JWT sessions. The first admin is bootstrapped as `super_admin` from `ADMIN_USERNAME` + `ADMIN_PASSWORD_HASH` when the table is empty. No multi-tenant, no OAuth in v1.
- **UI:** Tailwind 4 + shadcn/ui (internal design system in `packages/ui`) plus the published/shared presentational chat package `@naingoted/meclaw-chat-ui` in `packages/meclaw-chat-ui`. Validation: Zod. Tests: Vitest (TDD) + pytest.
- **Public API boundary:** `apps/chat/app/api/*` is the only public Meclaw chat API surface. External consumers such as Leanior call it through `NEXT_PUBLIC_MECLAW_API_BASE`; they do not expose Meclaw routes or connect to Meclaw Postgres directly. The Python sidecar is internal behind `AI_SERVICE_URL`.
- **Deploy:** `git tag v*` → GitHub Actions `quality → build` (four GHCR images: chat, admin, ai, ops) → `deploy` job **SSHes to the EC2 box**, checks out the tag at `/opt/meclaw`, pins `IMAGE_TAG` in `infra/.env`, and runs `compose pull && up -d` of `infra/docker-compose.prod.yml` (Caddy subdomain routing + auto Let's Encrypt; one-shot `migrations` service auto-applies Drizzle migrations, apps gate on its completion). Convergence verified by polling `/api/health` for the deployed SHA. The earlier Dokploy/Traefik deploy path was retired (old box terminated 2026-06-17). See `docs/ai/deploy.md`.

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

**Everything below is complete and merged to `main` (pushed); production runs v1.1.5-alpha on the Caddy/EC2 box (real host + IP live in GitHub Actions vars/secrets and the box `.env` — never in git):**

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
- Embed multi-session history — namespaced localStorage index per embedToken, legacy migration, History drawer in embed mode
- Pre-commit/CI hardening; auto-migration on deploy (CI-proven)
- Single seed path (v1.1.4-alpha): `pnpm --filter @meclaw/rag seed` imports `content/` (markdown + PDFs + work-impact) into the `documents` table (origin=seed, admin-manageable) and embeds each as `document:<id>` — the same writer the admin UI uses. File-slug `ingest` CLI + admin `seed:docs` removed; doc CRUD + `contentHash` moved to `@meclaw/core/documents`. Resolves the `rag_chunks` dual-writer collision. New-EC2 one-shot validated on a throwaway box from a clean DB: `ops db:migrate` + `ops seed` → 15 docs / 51 `document:` chunks / 0 orphan, chat grounded.

**Complete on `worktree-conversation-dashboard` (pending merge):**

- Conversation dashboard (admin, read-only): list with outcome filter · debounced message search · cursor "Load more" · 30s poll · stat tiles (total / gap rate / avg turns); thread + retrieval-telemetry detail view (low-score `<0.65` flagged); multi-select JSONL export (≤50, >10 warning); gap-miss rows deep-link into the conversation Retrieval tab. New `apps/admin/lib/admin/conversations.ts` (on-read metrics, no persisted columns) + 4 API routes (`/api/admin/conversations` list/detail/export/stats) + migration `0011` (conversation/message pagination indexes). All unit-tested; `pnpm verify` + `pnpm test` green. Interactive browser smoke (admin login + seeded data) still pending.

**Shelved — instance-per-customer multi-tenancy** (`worktree-first-customer-readiness`):

Paused: prod is the single-owner bare-Caddy box, and the Dokploy control plane this work assumed is gone. The per-customer compose template, provision/upgrade/teardown scripts, and the multi-tenant ops runbook were removed when Dokploy was retired (recoverable from git history). Pieces that landed standalone: sidecar history cap, Telegram lead notify, shared Ollama network, owner-name parameterization. Open if resumed: branding settings + chat UI (D5), global rate ceiling (D7.2), nightly backups (D7.3), final verification drill. The post-leak rotation checklist stays live as `docs/ai/secrets-rotation.md`.

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
- 2026-06-11: **Version footer + typography gate** — main page footer now shows the `meclaw · vX · sha` version stamp (server-read `VERSION_LABEL` passed as prop to dodge the client-bundle env trap), matching the embed. Chat content (live trace/thinking, user bubbles, greeting) unified to `font-sans` so prose stops reading like terminal at equal px (root cause of the perceived size mismatch: mono base vs sans answer). All 23 arbitrary `text-[Npx]` migrated to the Tailwind scale (`text-xs`+); `scripts/check-typography.sh` grep gate wired into `pnpm verify`/CI + pre-push bans them going forward. Conventions doc updated (Typography section). Released v1.0.11-alpha.
- 2026-06-11: **Mobile viewport/a11y + embed closed-on-load + dev docker workspace** (`8c8fb89`, v1.0.12-alpha). Chat: `h-dvh` over `h-screen` so the sticky header/footer + input survive mobile URL-bar collapse and the soft keyboard; transcript marked `role="log"`/`aria-label`, input given `aria-label`/`enterKeyHint="send"`/`autoComplete="off"`; bigger close button (`h-6`). **Font reversal — supersedes v1.0.11's font-sans decision:** dropped per-bubble `font-sans` and shared a `PROSE_BUBBLE` const so chat content now inherits the JetBrains Mono base (one family across the whole widget). embed.js: widget always mounts CLOSED on every device (page load/refresh never force-opens); in fullscreen the bubble reappears only when closed; resize respects open state (no force-reopen); extracted `updateBubble()` to keep `toggle` under the fallow complexity gate. Dockerfile (admin+chat): added `deps-dev` stage installing the full workspace (`--no-frozen-lockfile`) so compose dev mounts get cross-package HMR.
- 2026-06-11: **Embed multi-session history** — namespaced localStorage index per embedToken (`meclaw:sessions:<embedToken>`), options-object API for all session index functions, one-time `migrateEmbedLegacy` migration with verified-write guard, History button/drawer visible in embed mode. Codex adversarial review caught + fixed: embed resume tokens now persist to scoped index (not legacy key), migration preserves legacy key on silent write failure. Released v1.0.13-alpha.
- 2026-06-11: **Dev resume token fallback + production guard** — `verifyResumeToken` accepts unsigned `.insecure` tokens only when `NODE_ENV !== "production"`, so dev works without `RESUME_TOKEN_SECRET`. In production, `signResumeToken` throws and verify rejects all tokens when the secret is missing (fail-closed). Dark mode variant fix for root `<html>` element. Released v1.0.14-alpha.
- 2026-06-13: **Shared chat UI + public API boundary hardening** — chat chrome now lives in `@naingoted/meclaw-chat-ui` for reuse by Meclaw and Leanior. Leanior is a frontend consumer that calls `NEXT_PUBLIC_MECLAW_API_BASE`; public Meclaw API ownership stays in `apps/chat/app/api/*`, Python remains internal behind `AI_SERVICE_URL`, and cheap DB-backed public GET routes now share pre-DB per-IP/global rate limits.
- 2026-06-17: **Prod cutover → bare-Caddy box** (`2101f52`, v1.1.5-alpha). Moved prod off the old Dokploy/Traefik box (since terminated) onto a bare Docker Compose + Caddy box. `deploy.yml` deploy job rewritten Dokploy-API → **SSH** (checkout released tag at `/opt/meclaw`, pin `IMAGE_TAG` in `infra/.env`, `compose pull && up -d` of `docker-compose.prod.yml`, `/api/health` SHA convergence poll); added auto-`migrations` one-shot to `docker-compose.prod.yml`; Caddyfile admin host → `{$ADMIN_DOMAIN}`. Both hosts on valid Let's Encrypt certs; migrations applied; t3.small memory healthy (no OOM). Gotchas (durable): all four `SSH_*` secrets predated the box → `Permission denied (publickey)` until repointed (key via `gh secret set SSH_KEY` stdin, never echoed); `gh run watch --exit-status` can exit 0 on a FAILED run — always re-verify `gh run view --json conclusion`; stale local DNS cache returned the old box SHA post-flip (confirm with `curl -w '%{remote_ip}'` + `--resolve`).
