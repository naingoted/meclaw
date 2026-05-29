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

Status: **M1 done. Next: M2.** Build sequentially; each must run in the browser before moving on. Use TDD (Vitest) where logic exists. **Browser-verify each milestone with the Playwright MCP via the Docker MCP toolkit** (`MCP_DOCKER` `browser_*` tools, already connected) — see `conventions.md`. Browser runs in Docker, so reach the host at `http://host.docker.internal:3000` (already allow-listed via `allowedDevOrigins` in `next.config.ts`).

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
- **M2 — Persona + knowledge**
  - `content/persona.md`, `content/resume.md`, `content/projects/*.md`. `lib/content.ts` loader. `lib/ai/persona.ts` builds system prompt (persona + stuffed knowledge). Anti-"As an AI" rules (doc 08).
  - Acceptance: bot answers about the owner.
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
- 2026-05-29: **M1 complete.** Installed `ai`@6 / `@ai-sdk/anthropic` / `@ai-sdk/react`@3 / `zod`@4 / `react-markdown`. TDD: `lib/ai/provider.ts` (`parseAiEnv` zod + lazy `getModel`, 3 tests) and `app/api/chat/route.ts` (`streamText` + `convertToModelMessages` → `toUIMessageStreamResponse`, mocked test). `lib/ai/system-prompt.ts` hardcoded persona (M2 replaces). Client `components/chat/chat.tsx` (`useChat` v6 — local input state + `sendMessage({text})`, `message.parts`, markdown, auto-scroll). 7 tests green, `pnpm verify` green. **Base-URL fix:** AI SDK appends `/messages` not `/v1/messages` → added `/v1` to `ANTHROPIC_BASE_URL` (gateway 404'd without it). **Dev-origin fix:** added `allowedDevOrigins:['host.docker.internal']` to `next.config.ts` so the Dockerized Playwright browser can hydrate. Verified streamed reply in-browser. **Next: M2.**
