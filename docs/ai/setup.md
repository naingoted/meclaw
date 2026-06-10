# Local setup

> New here? Start with the root [`README.md`](../../README.md) for the
> clone → running quickstart. This file is the deeper reference.

## Prerequisites

- **Node 22.12+** and **pnpm 10+** (`corepack enable` if missing). The workspace
  pins `pnpm@10.32.1`, `.nvmrc` pins Node `22.12.0`, and the Docker images run
  on Node 22.
- **Docker + Docker Compose** — required for `pnpm dev:full` and local RAG infra
  (`pnpm services`).
- **`uv`** (Python package runner) if you run the AI sidecar on the host via
  `pnpm dev:ai`. Not needed when using `pnpm dev:full` (sidecar runs in Docker).
- **PostgreSQL** (via Docker Compose for local dev). Persistence uses `postgres-js`
  (pure JS — no native build). Run `pnpm services` + `pnpm db:migrate` once before
  expecting chat persistence. If DB is down, chat still works (best-effort).

## Quick start

Two paths — **full stack in Docker** (`pnpm dev:full`) or **host dev** (`pnpm services` + `pnpm dev:ai` + per-app dev servers). Both are spelled out step-by-step in the root [`README.md`](../../README.md) Quickstart A/B; this file covers the env vars, scripts, and tooling behind them.

Chat at http://localhost:3000 · Admin at http://localhost:3001 · Sidecar at http://localhost:8000.

## Environment variables

### Dev (`.env.local`, both paths)

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Gateway key. Required. Rotate if exposed. |
| `ANTHROPIC_BASE_URL` | `https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1` |
| `ANTHROPIC_MODEL` | `qwen3.6-plus` |
| `DATABASE_URL` | Postgres connection. Default: `postgres://meclaw:meclaw@localhost:5432/meclaw` |
| `AI_SERVICE_URL` | Sidecar URL. Default (host dev): `http://localhost:8000`; (Docker): `http://ai:8000` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` |
| `RAG_TOP_K` | Retrieval fan-out. Default: `4` |
| `RAG_DEV_SOURCES` | `true` to show sources in dev; `false` to omit. |
| `AUTH_SECRET` | Auth.js secret. Random 32-byte hex. Only needed for admin (next-auth). |
| `ADMIN_PASSWORD_HASH` | scrypt hash in `salt:hash` format. Mint via `pnpm --filter @meclaw/admin gen:admin-hash <password>` |

### Prod (Dokploy Environment tab)

Production env lives in the Dokploy app's Environment tab (never in a committed file). Template: `infra/.env.dokploy.example`. Keys beyond dev:

- `IMAGE_TAG` — GHCR image tag. **CI-managed**: the deploy job pins it to the released git tag; don't hand-edit during a normal release.
- `GHCR_OWNER` — GitHub username for `ghcr.io/<owner>/meclaw-*`
- `AUTH_URL` — admin host (e.g. `https://meclaw-admin.<domain>`)
- `POSTGRES_PASSWORD` — mint on-box (`openssl rand -base64 24`), mirror into `DATABASE_URL`
- `AUTH_SECRET` — mint: `openssl rand -hex 32`
- `ADMIN_PASSWORD_HASH` — mint: `pnpm --filter @meclaw/admin gen:admin-hash <password>`

Full provisioning + debugging runbook: `docs/ai/deploy.md`. (`infra/.env.prod.example` belongs to the legacy self-managed compose path.)

## Key differences: `.env` vs `.env.local`

| | `.env` | `.env.local` |
|---|---|---|
| **Loaded by** | Docker Compose (`pnpm dev:full`) | Next.js (`pnpm dev`) |
| **Git** | Gitignored | Gitignored |
| **Use** | Full Docker stack | Host dev |

Keep both if switching between paths, or symlink one to the other.

## Scripts (root workspace)

| Command | Does |
|---------|------|
| `pnpm dev:full` | Docker Compose: postgres, ollama, ai sidecar, chat (:3000), admin (:3001) — full stack with HMR. |
| `pnpm dev:ai` | Python sidecar on :8000 (host, via `uv`). Requires sidecar `.env` with `ANTHROPIC_*` (no `/v1`), `OLLAMA_BASE_URL`, and `DATABASE_URL`. |
| `pnpm services` | Docker Compose data plane: postgres + ollama only (no app containers). |
| `pnpm --filter @meclaw/chat dev` | Chat Next dev server (:3000 with HMR). |
| `pnpm --filter @meclaw/admin dev` | Admin Next dev server (:3001 with HMR, requires `AUTH_SECRET` + `ADMIN_PASSWORD_HASH`). |
| `pnpm --filter @meclaw/core db:generate` | Regenerate Drizzle migrations from `packages/core/src/db/schema.ts` → `packages/core/drizzle/`. |
| `pnpm --filter @meclaw/core db:migrate` | Apply pending migrations to `DATABASE_URL`. |
| `pnpm --filter @meclaw/rag ingest` | Embed `content/` → Postgres `rag_chunks` table. |
| `pnpm --filter @meclaw/admin gen:admin-hash <password>` | Mint scrypt admin password hash. |
| `pnpm install` | Install all monorepo dependencies (pnpm workspaces). |
| `pnpm verify` | Lint + typecheck + build (pre-merge gate). Runs turbo: `turbo run lint typecheck build`. |
| `pnpm test` | Vitest (all packages). |
| `pnpm fallow` | Full static analysis (dead code, dupes, health). CRAP scores are **estimated** from export refs (fast, no tests). |
| `pnpm fallow:audit` | Manual changed-files audit. The pre-commit hook adds its own base, gate, quiet, and marker flags. |
| `pnpm coverage` | Run all package tests with Istanbul coverage, merge → `coverage/coverage-final.json`. |
| `pnpm fallow:cov` | `pnpm coverage` then `fallow health --coverage` — **exact** per-function CRAP from real test coverage. |
| `docker compose -f infra/docker-compose.yml config -q` | Validate dev compose. |
| `docker compose -f infra/docker-compose.dokploy.yml config -q` | Validate prod (Dokploy) compose. |

## Git hooks (Fallow + Husky)

After `pnpm install`, Husky wires the local hooks:

- `pre-commit`: cheap staged-content guard, Biome format/organize + secretlint
  through lint-staged, then incremental `fallow audit` on files changed since
  the merge-base with your upstream branch (or `main` if none).
- `commit-msg`: commitlint enforces Conventional Commits.
- `pre-push`: whole-repo `turbo run lint typecheck test`.

```bash
pnpm format              # Biome format + organize imports
pnpm format:check        # verify formatting
pnpm fallow              # full-repo scan (optional baseline)
pnpm fallow:audit        # manual fallow audit
```

Config: `.fallowrc.json`. Fix hook findings instead of using `--no-verify`.
Reinstall hook plumbing after Husky edits with `pnpm install`.

## Quality tooling

All hook tooling is npm-native and arrives with `pnpm install` — no extra local
installs: Biome (format), secretlint (secret scan), commitlint (commit messages),
lint-staged, husky, fallow. Heavier security (`pnpm audit`, semgrep) runs in CI
only. If a commit is blocked, fix the finding — do not use `--no-verify`.

### Exact CRAP via coverage

Plain `pnpm fallow` estimates CRAP from export references (assumes untested),
which **overstates** risk on well-tested files. For accurate scores feed real
coverage:

```bash
pnpm fallow:cov          # test --coverage (istanbul) → merge → fallow health --coverage
```

Each package emits Istanbul `coverage/coverage-final.json` (per-package
`vitest.config.ts`, inert without `--coverage`); `scripts/merge-coverage.mjs`
shallow-merges them (Istanbul keys on absolute paths, no collisions) into the
root `coverage/coverage-final.json` that fallow reads.

## MCP read-only role (@meclaw/mcp)

The MCP server connects as a dedicated read-only role, `meclaw_ro`. Migration
`0006_meclaw_ro_grant` creates the role (NOLOGIN) and grants it SELECT on all
public tables — so `pnpm db:migrate` is safe on a fresh database. Enable login and
set a password out-of-band (never committed):

```sql
ALTER ROLE meclaw_ro WITH LOGIN PASSWORD '<choose-a-strong-password>';
```

Then point the server at it:

```
MCP_DATABASE_URL=postgres://meclaw_ro:<password>@localhost:5432/meclaw
MCP_AUTH_TOKEN=<random-token-for-http-transport>
# MCP_ALLOW_PII=true   # operator only; off by default
```

## RAG one-time setup

After `pnpm services` (or `pnpm dev:full`), run once:

```bash
docker compose exec ollama ollama pull nomic-embed-text   # download embed model
pnpm --filter @meclaw/admin seed:docs                     # import content/**/*.md into Documents
pnpm --filter @meclaw/rag ingest                           # embed corpus → Postgres
```

If Ollama or Postgres is down, retrieval can't ground answers — the bot defers conservatively and records misses. App stays usable.

## Knowledge corpus

Folder layout, first-run ingest paths, and privacy rules are documented in the root [`README.md`](../../README.md) ("Knowledge & privacy") and `content/README.md`. Short version: the `documents` table is the source of truth; `content/` is the gitignored local corpus that gets seeded once (`seed:docs`) and embedded (`pnpm ingest`).

## Adding a shadcn component

```bash
pnpm dlx shadcn@latest add <component>
```
