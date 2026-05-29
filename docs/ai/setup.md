# Local setup

## Prerequisites

- Node 22+ (`.nvmrc` not enforced; repo built on Node 22).
- pnpm 10+ (`corepack enable` if missing).
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

## Environment variables

Set in `.env.local` (gitignored — never commit real values):

| Var | Purpose |
|-----|---------|
| `ANTHROPIC_API_KEY` | Gateway key. Required. Owner's earlier key is exposed — rotate it. |
| `ANTHROPIC_BASE_URL` | `https://coding-intl.dashscope.aliyuncs.com/apps/anthropic` |
| `ANTHROPIC_MODEL` | `qwen3.6-plus` |

## Scripts

| Command | Does |
|---------|------|
| `pnpm dev` | Dev server. |
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
