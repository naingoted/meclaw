# Conventions

## Code style

- TypeScript strict. No `any` without a comment justifying it.
- Path alias `@/*` is **app-local** (each app maps it to its own root). Inside `packages/*` (`@meclaw/*`) use relative or package-name imports only — `@/` there breaks the Next build.
- Server code (route handlers, content/db loaders) stays out of client components. Mark client components with `"use client"`.
- Tailwind 4 utility-first. Compose class names with `cn()` from `@meclaw/ui`. Use shadcn primitives from `@meclaw/ui`; app-specific composites live in the app. Shared chat chrome lives in `@naingoted/meclaw-chat-ui` and must stay presentational.

## UI / component rules

- **Cursor:** Tailwind v4 preflight resets `<button>` to `cursor: default`. Every clickable element needs `cursor-pointer` (the shared `@meclaw/ui` `Button` already carries it; raw `<button>`s must add it).
- **Hover contrast:** never set `hover:text-X` equal to (or near) `hover:bg-X` — the label disappears. Pair a background tint with a contrasting text color (e.g. `ghost-danger`: `hover:bg-destructive/10 hover:text-destructive`).
- **Interactive state:** every interactive element needs accessible, visible state — a `focus-visible` ring, `active` feedback, and `aria-busy`/spinner (or `disabled`) during async work. Icon-only controls need an `aria-label`.
- **Tailwind v4 + workspace packages:** Tailwind does not scan workspace deps in `node_modules` by default. `@source "../../../packages/ui/src"` must stay in apps that consume `@meclaw/ui`, or classes used only inside `@meclaw/ui` silently fail to emit (the class is in the DOM but the rule never exists). Apps or external consumers that use `@naingoted/meclaw-chat-ui` must also scan it: use `@source "../../../packages/meclaw-chat-ui/src"` in the monorepo or `@source "../../node_modules/@naingoted/meclaw-chat-ui/dist"` from a published install.

## Shared chat UI package

- `@naingoted/meclaw-chat-ui` owns presentational chat components, copy/types, timestamps, history drawer UI, live trace UI, and message filtering/formatting helpers.
- It does **not** own API transport, CORS, embed authorization, resume-token signing/verification, localStorage policy, rate limiting, database access, or AI-sidecar calls.
- Host apps own those integration concerns. `apps/chat` wires the package to same-origin `/api/chat`; Leanior wires it to `NEXT_PUBLIC_MECLAW_API_BASE`.
- Consumers must provide React 19 peers, Tailwind theme tokens listed in `packages/meclaw-chat-ui/REQUIRED-TOKENS.md`, and a Tailwind `@source` entry for the package.

## Typography

- **Font size — scale only.** Use the Tailwind scale (`text-xs` `text-sm` `text-base` `text-lg` `text-xl`). **Never** arbitrary px (`text-[11px]`, `text-[10px]`): they drift into one-off micro-sizes that read as inconsistent. The smallest allowed step is `text-xs` (0.75rem). Enforced by `scripts/check-typography.sh` (a grep gate wired into `pnpm verify` / CI and `pre-push`); it hard-fails on `text-[…px]`.
- **Font family — content vs chrome.** The body base is `font-mono` (JetBrains Mono). **Content** the bot or user "says" — chat answers, the live trace/thinking, the greeting, user bubbles — must carry `font-sans` (Hanken Grotesk) so it reads as prose, not terminal. Reserve mono for **chrome**: timestamps, version stamp, day labels, eyebrow labels, chips, badges, status pills. Mono and sans have different metrics, so mixing them in one bubble looks like mismatched sizes even at equal px.

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
- `pnpm verify` must pass before opening a PR (it runs `biome check .` + typecheck + build). CI also runs tests, fallow checks, secretlint, commitlint range checks, `pnpm audit`, and semgrep.
- Keep PRs milestone-scoped; update `docs/ai/HANDOFF.md` status in the same PR that completes a milestone.

## Formatting & commits

- **Formatter + linter:** Biome — one Rust binary for formatting, linting, and import organization (replaces Prettier **and** ESLint). `pnpm format` to fix, `pnpm format:check` to verify, `pnpm lint` to lint-only. 2-space indent, double quotes, semicolons. Do not hand-format or reintroduce Prettier/ESLint.
- **Lint rules:** Biome recommended + the `react` and `next` domains (so `@next/next` checks like `noImgElement` are covered), configured in `biome.json`. `noNonNullAssertion` and `noArrayIndexKey` are off (intentional `!`, composite/static keys); test files relax `useButtonType`. Suppress a one-off finding with `// biome-ignore lint/<rule>: <reason>` — never `--no-verify`.
- **Commits:** Conventional Commits, enforced by commitlint at `commit-msg`.
- **Pre-commit gate:** staged-content guard + Biome (format/lint/organize) + secretlint + incremental `fallow audit` against the branch base. Fix findings instead of bypassing the hook.
