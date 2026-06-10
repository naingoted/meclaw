# Conventions

## Code style

- TypeScript strict. No `any` without a comment justifying it.
- Path alias `@/*` is **app-local** (each app maps it to its own root). Inside `packages/*` (`@meclaw/*`) use relative or package-name imports only — `@/` there breaks the Next build.
- Server code (route handlers, content/db loaders) stays out of client components. Mark client components with `"use client"`.
- Tailwind 4 utility-first. Compose class names with `cn()` from `@meclaw/ui`. Use shadcn primitives from `@meclaw/ui`; app-specific composites live in the app (e.g. `apps/chat/components/chat/*`).

## UI / component rules

- **Cursor:** Tailwind v4 preflight resets `<button>` to `cursor: default`. Every clickable element needs `cursor-pointer` (the shared `@meclaw/ui` `Button` already carries it; raw `<button>`s must add it).
- **Hover contrast:** never set `hover:text-X` equal to (or near) `hover:bg-X` — the label disappears. Pair a background tint with a contrasting text color (e.g. `ghost-danger`: `hover:bg-destructive/10 hover:text-destructive`).
- **Interactive state:** every interactive element needs accessible, visible state — a `focus-visible` ring, `active` feedback, and `aria-busy`/spinner (or `disabled`) during async work. Icon-only controls need an `aria-label`.
- **Tailwind v4 + workspace packages:** Tailwind does not scan workspace deps in `node_modules` by default. `@source "../../../packages/ui/src"` must stay in each app's `globals.css`, or classes used only inside `@meclaw/ui` silently fail to emit (the class is in the DOM but the rule never exists).

## Validation

- Validate all external input (request bodies, env) with **Zod**. Parse env once at module load; fail loud on missing required vars.

## Testing (TDD)

- Vitest. Write a **failing test first** for any logic: persona builder, content loader, tools, route handler.
- Mock the LLM provider in tests — never hit the live gateway.
- Test files live beside source as `*.test.ts(x)`.

## Browser verification (Playwright MCP)

Each milestone must render in the browser before moving on. Verify with the **Playwright MCP via the Docker MCP toolkit** (already connected — `MCP_DOCKER` `browser_*` tools), not a hand-run browser:

1. Start the stack (`pnpm dev:full`, or `pnpm services` + per-app dev servers) → chat at `http://localhost:3000`, admin at `:3001`.
2. `browser_navigate` to the page, `browser_snapshot` for the a11y tree, `browser_take_screenshot` for visual proof.
3. For chat: `browser_type` into the input, submit, `browser_wait_for` the streamed reply, snapshot to confirm.

Prefer this over asserting "it works" — capture real browser evidence per milestone.

## Secrets

- Real secrets only in `.env` / `.env.local` / service-local env files (all gitignored). `infra/.env.example` and `infra/.env.prod.example` hold placeholders.
- Never echo, log, or commit key values.

## Git / PRs

- Conventional-commit style subjects (`feat:`, `fix:`, `docs:`, `chore:`).
- `pnpm verify` must pass before opening a PR. CI also runs tests, `format:check`, fallow checks, secretlint, commitlint range checks, `pnpm audit`, and semgrep.
- Keep PRs milestone-scoped; update `docs/ai/HANDOFF.md` status in the same PR that completes a milestone.

## Formatting & commits

- **Formatter:** Biome (`pnpm format` to fix, `pnpm format:check` to verify). 2-space indent, double quotes, semicolons, organized imports. Do not hand-format or reintroduce Prettier.
- **Linting:** ESLint (`eslint-config-next`) still owns lint rules; Biome's linter is disabled.
- **Commits:** Conventional Commits, enforced by commitlint at `commit-msg`.
- **Pre-commit gate:** staged-content guard + Biome + secretlint + incremental `fallow audit` against the branch base. Fix findings instead of bypassing the hook.
