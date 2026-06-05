<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# meclaw

Personal AI-twin chatbot (single user). Public chat page; an AI answers about the owner from markdown in `content/`. Local-first: no cloud DB, no auth in v1.

## Resume / orientation

- **Build state + next milestone:** `docs/ai/HANDOFF.md` — read first when resuming.
- **Design context:** public-facing architecture/setup docs live under `docs/ai/`. Internal planning/review notes are not tracked in the public repo.
- **Where things live:** `docs/ai/repo-index.md`.
- **How it fits together:** `docs/ai/architecture.md`.
- **Local setup:** `docs/ai/setup.md`.
- **Code style / rules:** `docs/ai/conventions.md`.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 + shadcn/ui · Vercel AI SDK (`ai`, `@ai-sdk/anthropic`, `@ai-sdk/react`) · Drizzle ORM + PostgreSQL (`postgres-js`) · Zod · Vitest.

## Commands

```bash
pnpm dev        # dev server at http://localhost:3000
pnpm verify     # lint + typecheck + build — run before claiming done
pnpm test       # vitest run
```

## Rules

- **Secrets:** never commit `.env.local` or filled env files. Only placeholder examples are tracked. Rotate any key that has ever been pasted into chat or logs.
- **TDD:** write a failing Vitest test before feature logic (persona builder, content loader, tools, route). Mock the provider in tests — no live gateway calls.
- **Provider-agnostic:** all LLM wiring goes through `lib/ai/provider.ts`. Swapping models (qwen → OpenAI/Ollama) = edit that file only.
- **Milestones are sequential**; each must render in the browser before moving on. Update the Status line in `docs/ai/HANDOFF.md` as you finish each.
