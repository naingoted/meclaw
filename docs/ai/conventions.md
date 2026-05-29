# Conventions

## Code style

- TypeScript strict. No `any` without a comment justifying it.
- Path alias `@/*` → repo root (e.g. `@/lib/utils`, `@/components/ui/button`).
- Server code (route handlers, content/db loaders) stays out of client components. Mark client components with `"use client"`.
- Tailwind 4 utility-first. Compose class names with `cn()` from `@/lib/utils`. Use shadcn primitives in `components/ui/*`; app-specific composites go in `components/chat/*`.

## Validation

- Validate all external input (request bodies, env) with **Zod**. Parse env once at module load; fail loud on missing required vars.

## Testing (TDD)

- Vitest. Write a **failing test first** for any logic: persona builder, content loader, tools, route handler.
- Mock the LLM provider in tests — never hit the live gateway.
- Test files live beside source as `*.test.ts(x)` (see `lib/utils.test.ts`).

## Secrets

- Real secrets only in `.env.local` (gitignored). `.env.example` holds empty placeholders.
- Never echo, log, or commit key values.

## Git / PRs

- Conventional-commit style subjects (`feat:`, `fix:`, `docs:`, `chore:`).
- `pnpm verify` must pass before opening a PR. CI runs typecheck + lint + build.
- Keep PRs milestone-scoped; update `docs/ai/HANDOFF.md` status in the same PR that completes a milestone.
