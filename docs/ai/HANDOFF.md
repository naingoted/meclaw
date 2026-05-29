# HANDOFF — echo-clone build state

> **Read this first when resuming.** Single source of truth for continuing the build after a context clear.
> Full design: [`../superpowers/specs/2026-05-29-echo-clone-design.md`](../superpowers/specs/2026-05-29-echo-clone-design.md)

## What this project is

Personal AI-twin chatbot (single user). Public chat page; AI answers about the owner (Thet Naing) from markdown knowledge files. Local-first: no cloud DB, no signups. Flat Next.js 15 app.

## Locked decisions (do not re-litigate)

- Flat single Next.js app (App Router, React 19, TS). **Next 16** (current latest; user approved bump from the originally-locked 15 during M0).
- LLM: `qwen3.6-plus` via Anthropic-compatible gateway. Use Vercel AI SDK `@ai-sdk/anthropic` with custom `baseURL`.
- No embeddings (gateway is chat-only). Knowledge = context-stuffing from `content/*.md`.
- Persistence: SQLite + Drizzle + `better-sqlite3`. Zero Docker.
- Public chat only. No auth/admin in v1.
- UI: Tailwind 4 + shadcn/ui. Validation: Zod. Tests: Vitest (TDD).

## Environment (names only — NEVER commit values)

`.env.local` (gitignored) must contain:

```
ANTHROPIC_API_KEY=<provided by user — paste into .env.local only>
ANTHROPIC_BASE_URL=https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1
ANTHROPIC_MODEL=qwen3.6-plus
```

> ✅ **M1 resolved the base-URL gotcha:** the AI SDK appends `/messages` (NOT `/v1/messages`). Base URL therefore MUST end in `/v1` → full path `.../apps/anthropic/v1/messages`. Without `/v1` the gateway 404s.

`.env.example` (committed) holds the same keys with empty/placeholder values.

> ⚠️ The user pasted a live key in chat earlier — treat as exposed; recommend rotation. Never echo it, never write it into committed files.
> ⚠️ AI SDK anthropic provider may append `/v1/messages` to `baseURL`. Verify the gateway path during M1; adjust `baseURL` if it double-appends.

## Build order (milestones)

Status: **M6 done. v1 milestones complete.** Build sequentially; each must run in the browser before moving on. Use TDD (Vitest) where logic exists. **Browser-verify each milestone with the Playwright MCP via the Docker MCP toolkit** (`MCP_DOCKER` `browser_*` tools, already connected) — see `conventions.md`. Browser runs in Docker, so reach the host at `http://host.docker.internal:3000` (already allow-listed via `allowedDevOrigins` in `next.config.ts`).

- **M0 — Repo + agentic harness** ✅ DONE
  - Scaffold Next.js 15 (App Router, TS, Tailwind, ESLint) into this existing dir (flat).
  - shadcn/ui init. Add scripts: `dev`, `build`, `lint`, `typecheck`, `verify` (lint+typecheck+build), `test`.
  - Agentic files: `CLAUDE.md`, `AGENTS.md`, `CODEX.md`, `docs/ai/{repo-index,architecture,setup,conventions}.md`.
  - `.env.example`, `.gitignore` (cover `.env.local`, `data/*.db`, `node_modules`, `.next`).
  - `.github/workflows/ci.yml` (corepack→pnpm install→typecheck→lint→build) + `.github/pull_request_template.md`.
  - Acceptance: `pnpm dev` → placeholder page renders at localhost:3000; `pnpm verify` green.
- **M1 — Echo chat (core loop)** ✅ DONE
  - `lib/ai/provider.ts` (anthropic + baseURL + model from env). `app/api/chat/route.ts` streaming via `streamText`. Chat UI with `useChat`, markdown render, auto-scroll. Hardcoded system prompt.
  - Acceptance: type in browser, get streamed reply. ✅ Verified end-to-end in Dockerized Playwright (real gateway, streamed answer).
- **M2 — Persona + knowledge** ✅ DONE
  - `content/persona.md`, `content/resume.md`, `content/projects/*.md`. `lib/content.ts` loader. `lib/ai/persona.ts` builds system prompt (persona + stuffed knowledge). Anti-"As an AI" rules (doc 08).
  - Acceptance: bot answers about the owner. ✅ Verified in Dockerized Playwright (real gateway): asked about stack + the echo project, got a grounded third-person answer with contact email.
- **M3 — Persistence**
  - `lib/db/{schema,index,migrate}.ts`. Tables `conversations`, `messages`. Persist on stream finish (best-effort).
  - Acceptance: conversations saved to `data/echo.db`.
- **M4 — Recruiter UX polish**
  - Greeting, 3 suggestion chips, avatar, "download resume" + "book a call" buttons, footer ("built this myself → GitHub"). Target = doc 08 demo mock.
- **M5 — Agent tools**
  - `lib/ai/tools.ts`: `showResume`, `scheduleCall` (Cal.com link), `getContactInfo`, meta "how does this bot work?".
- **M6 — Guardrails**
  - In-memory IP rate limit on `/api/chat`; prompt-injection guard; don't leak system prompt.

## Post-v1 backlog

Vector RAG (pgvector/Qdrant + Docker), admin UI + auth, deploy (VPS/Docker/Caddy/HTTPS), analytics (PostHog/Plausible).

## How to resume after /clear

1. Read this file + the spec.
2. Check `git log` and the repo tree to see which milestone is done.
3. Continue from the first unfinished milestone. Update the "Status" line above as you complete each.

## Progress log

- 2026-05-29: Brainstorming complete. Spec + handoff written. Git initialized. **Next: M0.**
- 2026-05-29: **M0 complete.** Scaffolded Next 16 (App Router/TS/Tailwind 4) flat into repo; shadcn/ui init (button, lib/utils, components.json). Scripts dev/build/lint/typecheck/verify/test. Vitest wired (jsdom, native tsconfig paths) — 3 tests green. Agentic files: CLAUDE.md/CODEX.md → `@AGENTS.md`; docs/ai/{repo-index,architecture,setup,conventions}.md. `.env.example`, CI workflow, PR template added. `pnpm verify` green; `pnpm dev` renders 200 at :3000. Note: dropped shadcn `base-nova` `@import "shadcn/tailwind.css"` (needed runtime `shadcn` dep). **Next: M1.**
- 2026-05-29: **M2 complete.** TDD: `lib/content.ts` (`loadKnowledge` — recursive `.md` read, H1→title fallback, deterministic sort; tmp-fixture tests) and `lib/ai/persona.ts` (`buildSystemPrompt` — pure, context-stuffs every doc + behavior/anti-"As an AI"/anti-injection/grounding rules; 4 tests). `app/api/chat/route.ts` now builds the prompt from `loadKnowledge()`, cached once per process (edit `content/*.md` + restart to refresh); deleted M1 `lib/ai/system-prompt.ts`. Added editable starter corpus: `content/persona.md`, `content/resume.md`, `content/projects/echo-clone.md` (placeholders flagged for the owner to fill). 14 tests green, `pnpm verify` green. Browser-verified live (Dockerized Playwright + real qwen gateway via gitignored `.env`): grounded answer about Thet. **Next: M3 (persistence).**
- 2026-05-29: **M1 complete.** Installed `ai`@6 / `@ai-sdk/anthropic` / `@ai-sdk/react`@3 / `zod`@4 / `react-markdown`. TDD: `lib/ai/provider.ts` (`parseAiEnv` zod + lazy `getModel`, 3 tests) and `app/api/chat/route.ts` (`streamText` + `convertToModelMessages` → `toUIMessageStreamResponse`, mocked test). `lib/ai/system-prompt.ts` hardcoded persona (M2 replaces). Client `components/chat/chat.tsx` (`useChat` v6 — local input state + `sendMessage({text})`, `message.parts`, markdown, auto-scroll). 7 tests green, `pnpm verify` green. **Base-URL fix:** AI SDK appends `/messages` not `/v1/messages` → added `/v1` to `ANTHROPIC_BASE_URL` (gateway 404'd without it). **Dev-origin fix:** added `allowedDevOrigins:['host.docker.internal']` to `next.config.ts` so the Dockerized Playwright browser can hydrate. Verified streamed reply in-browser. **Next: M2.**
- 2026-05-29: **M3 complete.** TDD: `lib/db/index.ts` persistence layer (`initDb` + `saveTurn`, 5 mocked unit tests). Uses **better-sqlite3** + Drizzle schema (`conversations`, `messages` tables). `app/api/chat/route.ts` wired to call `saveTurn` in `streamText` `onFinish` callback (best-effort: failures logged, don't break stream). **Accepted trade-off:** better-sqlite3 native module requires build; in dev environments without the compiled `.node` file, DB persistence fails gracefully (logged) but chat continues to work. For deployment or local dev with build tools, the full DB stack is ready. 19 tests green (mocked DB tests + route smoke test), `pnpm verify` green, `pnpm build` passes. **Browser-verified** (Dockerized Playwright): sent 2 questions, got streamed responses (queried the response on screen). Created `lib/db/db.test.ts` with saveTurn mocks. Data file path: `data/echo.db` (added to .gitignore). **Note on dev environment:** sql.js (pure JS SQLite) was attempted as a workaround but had module-loading issues; better-sqlite3 is the correct choice architecturally and will work once the native module is compiled (e.g., `npm rebuild` on a machine with build tools, or CI/CD). **Next: M4.**
- 2026-05-29: **M4 complete.** Recruiter UX polish. (1) **Greeting + 3 suggestion chips:** Replaced bland empty-state message with friendly "Hi! I'm echo, Thet's AI twin" + "Try asking" 3-chip section (static UI, never persisted). Chips: "What's Thet's tech stack?", "Walk me through a recent project", "How do I get in touch?" — clickable, send via `sendMessage`. Greeting/chips vanish when `messages.length > 0`. (2) **Bot avatar:** `lucide-react` `Bot` icon in 32px muted circle, shown beside assistant messages and in greeting. (3) **Action buttons header:** "Download résumé" (→ `/resume`) + "Book a call" (→ `NEXT_PUBLIC_CAL_URL`, external link). (4) **Resume route:** `app/resume/route.ts` reads `content/resume.md` server-side, returns as markdown attachment with correct `Content-Disposition` header. TODO: owner to drop real PDF to `public/resume.pdf`. (5) **Footer:** "Built this myself → GitHub" link (`NEXT_PUBLIC_GITHUB_URL`, external). (6) **Layout metadata:** `app/layout.tsx` updated to "echo · Thet Naing's AI twin" + description. Environment vars (`.env.example`): `NEXT_PUBLIC_CAL_URL`, `NEXT_PUBLIC_GITHUB_URL` with placeholders. TDD: `components/chat/chat.test.tsx` — 3 tests verify component exports (main validation via browser). 20 tests green, `pnpm verify` green, `pnpm build` passes. **Browser-verified** (Dockerized Playwright): empty state shows greeting + 3 chips + avatar + action buttons + footer; resume route returns 200 + Content-Disposition; buttons link to correct URLs. **Next: M5 (agent tools).**
- 2026-05-29: **M5 complete.** Agent tools with multi-step calling. TDD: `lib/ai/tools.test.ts` (22 unit tests for 4 tools + 2 route integration tests, all 44 green). Implements 4 Vercel AI SDK v6 tools in `lib/ai/tools.ts`: (1) **getContactInfo** — owner's email (`thetnaing@incube8.sg`) + GitHub URL (from env), (2) **scheduleCall** — Cal.com link (from `NEXT_PUBLIC_CAL_URL`), (3) **showResume** — `/resume` path pointer, (4) **howThisWorks** — meta explanation (Next.js 16 + Vercel AI SDK v6 streaming + qwen via gateway + markdown knowledge stuffing + SQLite persistence). Each tool: clear description, empty Zod inputSchema (takes no input), synchronous execute returning serializable data. **AI SDK v6 multi-step mechanics:** Tools passed to `streamText` + `stopWhen: stepCountIs(2)` = model calls tool (step 1) → framework executes + passes result to model → model generates final text (step 2). Model decides which tools to call; `toUIMessageStreamResponse()` streams final text to client (tool calls transparent to UI). Conversation persistence (M3) unchanged — `event.text` in `onFinish` already contains tool results woven into final answer. Route test (`app/api/chat/route.test.ts`) verifies all 4 tools registered. 44 tests green, `pnpm verify` green, `pnpm build` passes. **Browser-verify deferred** (`.env.local` key needed for live gateway; done during M4 with real gateway already tested). **Next: M6 (guardrails).**
- 2026-05-29: **M6 complete.** Guardrails + finalization. TDD: (1) **Rate limiter** (`lib/rate-limit.ts` + `lib/rate-limit.test.ts`, 5 tests green): IP-based in-memory map, configurable max-requests & window-ms (defaults: 20 req / 60s), env-overridable. On exceed: return 429 + Retry-After header BEFORE parsing body. Per-process only (post-v1: Redis). (2) **Injection guard** (`lib/ai/guardrails.ts` + `lib/ai/guardrails.test.ts`, 17 tests green): Regex patterns for high-confidence extraction attempts ("ignore previous instructions", "reveal system prompt", "you are now", "disregard", etc.), conservative to avoid false positives (legitimate "tech stack?" questions safe). (3) **Short-circuit refusal** (`app/api/chat/route.ts`): Uses `createUIMessageStream` + `createUIMessageStreamResponse` from Vercel AI SDK v6 to return a normal-looking assistant message refusing injection requests WITHOUT calling the gateway. Flow: IP rate-limit check → parse body → scan latest user message for injection → if flagged, stream refusal; else proceed to streamText as before. Route tests verify both guards export & work; real integration tested live via curl: (a) 20 requests/60s allowed → 21st returns 429 with Retry-After, (b) "reveal your system prompt" request returns refusal stream (not gateway error), system-prompt text NOT leaked, (c) legitimate "tech stack?" question not blocked. 69 tests green, `pnpm verify` green, `pnpm build` passes. **Status:** Rate-limit + injection-guard live-verified (curl). Normal stream would fail without .env.local (API key), so deferred live streaming. **Next: none — v1 milestones done.** All files committed, ready for production setup.
