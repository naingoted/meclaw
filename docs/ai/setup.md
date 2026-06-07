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

**Full stack in Docker (recommended):**
```bash
cp infra/.env.example .env        # compose reads .env; fill ANTHROPIC_API_KEY
pnpm dev:full                     # builds + boots postgres, ollama, ai sidecar, chat, admin
```
Chat at http://localhost:3000 · Admin at http://localhost:3001.

**Host dev (fast UI loop):**
```bash
pnpm install
cp infra/.env.example .env.local              # Next reads .env.local
cp services/ai/.env.example services/ai/.env  # sidecar reads this; fill ANTHROPIC_API_KEY
pnpm services                     # postgres + ollama (data plane)
pnpm db:migrate                   # create tables
pnpm dev:ai                       # Python sidecar :8000 (needs uv)

# In another terminal:
pnpm --filter @meclaw/chat dev    # chat :3000
pnpm --filter @meclaw/admin dev   # admin :3001
```

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

### Prod (VPS `infra/.env`)

See `infra/.env.prod.example`. Keys:
- `DOMAIN` — apex domain (e.g., `yourdomain.com`)
- `IMAGE_TAG` — GHCR image tag (git commit SHA or `latest`)
- `GHCR_OWNER` — GitHub username for `ghcr.io/<owner>/meclaw-*`
- `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `ANTHROPIC_MODEL` — same as dev
- `AUTH_SECRET` — mint: `openssl rand -hex 32`
- `ADMIN_PASSWORD_HASH` — mint: `pnpm --filter @meclaw/admin gen:admin-hash <password>`
- `OLLAMA_EMBED_MODEL` — `nomic-embed-text`

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
| `docker compose -f infra/docker-compose.prod.yml config -q` | Validate prod compose. |

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

If Ollama or Postgres is down, chat falls back to full-corpus prompt. App stays usable.

## Knowledge corpus

`content/` ships with public-safe starter files (`personal.example.md`, `resume.md`, `projects/`) + samples
in `content/knowledge/` so chat works immediately. Your own `content/personal.md`,
real `content/knowledge/**`, `content/private/**`, and `data/**` payloads are
gitignored (local-only). See `content/README.md` for details.

First-run ingest folders:

- `content/personal.md` — copy from `content/personal.example.md`; markdown profile/contact details.
- `content/knowledge/**` — main private markdown/PDF corpus.
- `content/private/**` — local-only sensitive markdown/PDF notes that are still ingestable.
- `data/work_impact_<company>/04_rag_entries.json` — optional structured employer-impact pack; start from `data/work_impact_example/04_rag_entries.example.json`.

Then run:

```bash
pnpm --filter @meclaw/admin seed:docs  # imports content/**/*.md into Documents
pnpm --filter @meclaw/rag ingest       # embeds markdown, PDFs, and work-impact packs
```

## Adding a shadcn component

```bash
pnpm dlx shadcn@latest add <component>
```
