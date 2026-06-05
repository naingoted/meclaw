# Repo index — where things live

Monorepo structure: two Next.js apps (public + admin), three shared packages, Python AI sidecar, and infra config.

```
meclaw/
├─ apps/
│  ├─ chat/                          # @meclaw/chat — public chat app (port 3000)
│  │  ├─ app/{layout,page,api/chat/route}.tsx
│  │  ├─ app/resume/route.ts         # markdown resume download
│  │  ├─ components/chat/*           # message list, input, chips, markdown, dev sources, live trace
│  │  ├─ lib/ai/provider.ts          # ai sdk config (proxies to sidecar at AI_SERVICE_URL)
│  │  └─ next.config.ts
│  └─ admin/                         # @meclaw/admin — content/ingest console (port 3001, Auth.js protected)
│     ├─ app/{layout,page,api}/
│     ├─ lib/{auth,actions}/         # Auth.js v5 config, scrypt password verification, JWT
│     ├─ scripts/gen-admin-hash.ts   # mint admin password hash (salt:hash)
│     └─ next.config.ts
├─ packages/
│  ├─ core/                          # @meclaw/core — db, content loader, settings
│  │  ├─ lib/{db/,content.ts}        # Drizzle schema + postgres-js + migration runner
│  │  ├─ drizzle/{migrations}/       # versioned Postgres migration files
│  │  ├─ drizzle.config.ts
│  │  └─ package.json (exports: types, lib, migrations)
│  ├─ rag/                           # @meclaw/rag — ingest + retrieval logic
│  │  ├─ lib/rag/{pgvector,ingest,chunk,embed,loaders,config,types}.ts
│  │  ├─ scripts/ingest.ts           # `pnpm ingest` entry — embeds content/ → Postgres
│  │  └─ package.json
│  └─ ui/                            # @meclaw/ui — shadcn components + cn helper
│     ├─ lib/{cn.ts,components/}     # cn() + re-exported shadcn + custom chat components
│     ├─ components.json
│     └─ package.json
├─ services/
│  └─ ai/                            # Python sidecar (port 8000)
│     ├─ app/{main.py,triage,provider,streaming,retriever}.py
│     ├─ tests/*.py
│     ├─ pyproject.toml
│     └─ Dockerfile (built by docker-compose)
├─ infra/                            # Deploy config & compose files
│  ├─ docker-compose.yml             # dev: postgres + ollama + ai sidecar + chat + admin
│  ├─ docker-compose.prod.yml        # prod: chat + admin + ai + ops (migrate/ingest runner)
│  ├─ Dockerfile.ops                 # one-shot migrate + ingest runner
│  ├─ Caddyfile                      # reverse proxy: apex → chat, admin.* → admin
│  ├─ .env.example                   # dev env placeholders; copy to root .env for compose
│  └─ .env.prod.example              # prod env + secret names (.env/.env.* excluded by root .gitignore)
├─ content/                          # owner's knowledge corpus (markdown + PDF)
│  ├─ personal.example.md · resume.md
│  ├─ projects/*.md
│  └─ knowledge/                     # (gitignored) real corpus for ingest
├─ docs/ai/
│  ├─ HANDOFF.md                     # current build state (read first)
│  ├─ {repo-index,architecture,setup,deploy,conventions}.md
│  └─ ...
├─ .github/workflows/{ci,deploy}.yml
├─ .github/pull_request_template.md
├─ pnpm-workspace.yaml               # monorepo root config
├─ package.json (root scripts)
└─ turbo.json
```

## Key entry points

- **Chat page:** `apps/chat/app/page.tsx` + `useChat` client component.
- **Admin console:** `apps/admin/app/page.tsx` (Auth.js login wall + content form).
- **Chat API (proxy):** `apps/chat/app/api/chat/route.ts` → Python sidecar at `AI_SERVICE_URL` (default `http://localhost:8000`).
- **LLM calls (host):** `lib/ai/provider.ts` in each app (Vercel AI SDK config).
- **LLM calls (sidecar):** `services/ai/app/provider.py` + `triage.py` (glm-4.7 non-stream routing, then qwen3.6-plus streaming draft).
- **Knowledge corpus:** markdown in `content/` → loaded by `@meclaw/core`'s `lib/content.ts` → full-corpus or retrieved prompt via `@meclaw/rag`'s ingestion (`scripts/ingest.ts`) and Python sidecar retrieval (`services/ai/app/retriever.py`).
- **Database:** PostgreSQL via `@meclaw/core` (Drizzle ORM + `postgres-js`). Persistence (conversations, messages) + RAG vectors (`rag_chunks`, pgvector, HNSW cosine) in the same store. Migrations live in `packages/core/drizzle/`.
- **RAG infra:** local Ollama (`nomic-embed-text`) + PostgreSQL (pgvector) configured by `infra/docker-compose.yml`. Ingestion runs on-demand (`pnpm ingest` = `pnpm --filter @meclaw/rag ingest`). Retrieval happens in Python sidecar (`services/ai/app/retriever.py`) via psycopg cosine kNN over `rag_chunks`.
- **Deploy config:** four Docker images → pushed to GHCR → pulled and run by `infra/docker-compose.prod.yml`. Build sources: chat → `apps/chat/Dockerfile` (target `runner`), admin → `apps/admin/Dockerfile` (target `runner`), ai → `services/ai/Dockerfile`, ops → `infra/Dockerfile.ops` (one-shot migrations + ingest). Caddy reverse proxy (`infra/Caddyfile`) routes apex domain → chat, `admin.<domain>` → admin.
- **Environment variables:** Each app reads `.env` / `.env.local` (dev) or env secrets (prod). See `infra/.env.example` (dev) + `infra/.env.prod.example` (prod) and `docs/ai/setup.md` for details.
