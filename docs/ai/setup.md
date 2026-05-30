# Local setup

## Prerequisites

- Node 22+ (`.nvmrc` not enforced; repo built on Node 22).
- pnpm 10+ (`corepack enable` if missing).
- Docker Compose for local RAG services if you want to run Phase 1 retrieval locally.
- **Build tools required for native modules:** SQLite persistence uses `better-sqlite3`, which includes a native module (`.node` binary). pnpm (v9+) blocks build scripts by default; the repo's `package.json` explicitly allows `better-sqlite3` via `pnpm.onlyBuiltDependencies`. On first install, run:
  ```bash
  pnpm rebuild better-sqlite3
  ```
  **If `pnpm rebuild better-sqlite3` fails** (missing C compiler, Python, or build tools), persistence degrades gracefully: chat continues to work, DB errors are logged with a rebuild hint, and no data is lost (each turn is still processed). The module auto-builds in CI/CD environments and on machines with standard build toolchains available. **By design**, this ensures the chatbot works everywhere, with optional persistence.

## Steps

```bash
pnpm install
cp .env.example .env.local   # then fill ANTHROPIC_API_KEY
pnpm dev                     # http://localhost:3000
```

## Phase 1 RAG services

Start the local vector and embedding services before ingesting (`pnpm services` is shorthand for the compose line):

```bash
docker compose up -d qdrant ollama   # or: pnpm services
docker compose exec ollama ollama pull nomic-embed-text
pnpm ingest
```

`pnpm dev` runs only the Next server — the data plane is intentionally separate (stateful, slow to boot, survives Next restarts). Use `pnpm dev:full` to bring qdrant + ollama up (idempotent) and then start the dev server in one command. Neither stops the containers on exit; tear down with `docker compose down`.

If Qdrant or Ollama is down, the chat path falls back to the existing full-corpus prompt. The app stays usable, but retrieval is disabled until the services come back.
When the markdown corpus is still small enough to fit comfortably in the prompt, the app also keeps using the full-corpus prompt instead of narrowing context to retrieved chunks.

## Knowledge corpus

A fresh clone ships with starter content (`content/persona.md`, `content/resume.md`, `content/projects/`) plus a couple of `*_sample_*` docs in `content/knowledge/`, so `pnpm ingest` and chat work immediately. See `content/README.md` for the layout and privacy model. Your own `content/knowledge/**` and `data/**` are git-ignored — they stay local and never reach a public remote.

## Environment variables

Set in `.env.local` (gitignored — never commit real values):

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Gateway key. Required. Owner's earlier key is exposed — rotate it. |
| `ANTHROPIC_BASE_URL` | `https://coding-intl.dashscope.aliyuncs.com/apps/anthropic/v1` |
| `ANTHROPIC_MODEL` | `qwen3.6-plus` |
| `OLLAMA_BASE_URL` | `http://localhost:11434` |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` |
| `QDRANT_URL` | `http://localhost:6333` |
| `QDRANT_COLLECTION` | `echo_clone_knowledge` |
| `RAG_TOP_K` | `4` |
| `RAG_DEV_SOURCES` | `true` to include retrieved source metadata in development streams; `false` to omit it. |

## Scripts

| Command | Does |
|---------|------|
| `pnpm dev` | Dev server (Next only). |
| `pnpm dev:full` | Start qdrant + ollama, then the dev server. |
| `pnpm services` | Start qdrant + ollama (data plane only). |
| `pnpm build` | Production build. |
| `pnpm start` | Serve the production build. |
| `pnpm lint` | ESLint (next config). |
| `pnpm typecheck` | `tsc --noEmit`. |
| `pnpm verify` | lint + typecheck + build — the pre-merge gate. |
| `pnpm test` | Vitest (run once). |
| `pnpm test:watch` | Vitest watch mode. |

## Adding a shadcn component

```bash
pnpm dlx shadcn@latest add <component>
```
