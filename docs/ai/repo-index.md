# Repo index — where things live

Monorepo structure: two Next.js apps (public + admin), three shared packages, Python AI sidecar, and infra config.

```
meclaw/
├─ apps/
│  ├─ chat/                          # @meclaw/chat — public chat app (port 3000)
│  │  ├─ app/{layout,page,api/chat/route}.tsx
│  │  ├─ app/api/chat/history/       # resume-token-gated transcript rehydration
│  │  ├─ app/widget/                 # embedded-iframe chat surface
│  │  ├─ app/resume/route.ts         # markdown resume download
│  │  ├─ components/chat/*           # message list, input, chips, markdown, live trace, history drawer
│  │  ├─ lib/{ai,chat,embed}/        # provider proxy · session index/timestamps · embed auth + HMAC resume tokens
│  │  ├─ public/embed.js             # third-party widget loader (bubble + iframe)
│  │  └─ next.config.ts
│  └─ admin/                         # @meclaw/admin — console (port 3001, Auth.js protected)
│     ├─ app/admin/{documents,config,gaps,embed-clients,research,jobs,audit}/   # console pages
│     ├─ app/{login,api}/            # Auth.js login wall + /api/admin/* mutations
│     ├─ lib/{admin,research}/       # services (incl. in-process ingest + corpus state) · research SSE hook
│     ├─ scripts/{gen-admin-hash,seed-documents}.ts
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
│  ├─ mcp/                           # @meclaw/mcp — unified MCP tool layer (TS-defined, two transports)
│  │  ├─ src/{registry,scope,guard,redact,auth,env,db}.ts   # tool registry + two-scope model (public/operator) + safety
│  │  ├─ src/tools/{describe-schema,run-read-query,get-telemetry,search-corpus,static-tools}.ts
│  │  ├─ src/bin/{stdio,http}.ts     # stdio (local/tokenless) + streamable-HTTP (bearer auth) transports
│  │  └─ package.json
│  └─ ui/                            # @meclaw/ui — shadcn components + cn helper
│     ├─ lib/{cn.ts,components/}     # cn() + re-exported shadcn + custom chat components
│     ├─ components.json
│     └─ package.json
├─ services/
│  └─ ai/                            # Python sidecar (port 8000)
│     ├─ app/{main,streaming,runner,provider,retriever,runtime_config}.py   # chat pipeline
│     ├─ app/{gaps,gap_match,answer_gap,lead,corpus,tools}.py               # miss/gap/lead detection
│     ├─ app/graph/                  # LangGraph triage graph
│     ├─ app/eval/                   # Ragas eval harness (generate → run → report)
│     ├─ app/research/               # multi-agent research graph (Spec C)
│     ├─ eval/interview.yaml         # eval dataset
│     ├─ tests/*.py
│     ├─ pyproject.toml
│     └─ Dockerfile (built by docker-compose)
├─ infra/                            # Deploy config & compose files
│  ├─ docker-compose.yml             # dev: postgres + ollama + ai sidecar + chat + admin
│  ├─ docker-compose.dokploy.yml     # PROD (live): owner Dokploy/Traefik stack — see docs/ai/deploy.md
│  ├─ docker-compose.customer.yml     # PROD: per-customer (multi-tenant) stack — see docs/ai/customer-ops.md
│  ├─ {provision,upgrade,teardown}-customer.sh # customer lifecycle via Dokploy API
│  ├─ .env.customer.example          # per-customer env template (rendered by provision script)
│  ├─ .env.dokploy.example           # prod env template (real values live in Dokploy's Environment tab)
│  ├─ docker-compose.prod.yml        # legacy self-managed-VPS alternative (+ Caddyfile)
│  ├─ Caddyfile                      # (legacy) reverse proxy: apex → chat, admin.* → admin
│  ├─ Dockerfile.ops                 # one-shot migrate + ingest runner image
│  └─ .env.example                   # dev env placeholders; copy to root .env for compose
├─ content/                          # owner's knowledge corpus (markdown + PDF)
│  ├─ personal.example.md · resume.md
│  ├─ projects/*.md
│  ├─ knowledge/                     # gitignored real corpus for ingest (.md/.pdf)
│  └─ private/                       # gitignored sensitive-but-ingestable local notes
├─ data/
│  └─ work_impact_example/           # tracked schema example for work_impact_<company> packs
├─ docs/ai/
│  ├─ HANDOFF.md                     # current build state (read first)
│  ├─ {repo-index,architecture,setup,deploy,conventions}.md
│  ├─ customer-ops.md                # per-customer (multi-tenant) provision/upgrade/teardown runbook
│  └─ ...
├─ .github/workflows/{ci,deploy}.yml
├─ .github/pull_request_template.md
├─ pnpm-workspace.yaml               # monorepo root config
├─ package.json (root scripts)
└─ turbo.json
```

## Key entry points

- **Chat page:** `apps/chat/app/page.tsx` + `useChat` client component.
- **Admin console:** `apps/admin/app/admin/*` pages behind the Auth.js login wall (`app/login`): documents, config, gaps, embed clients, research, jobs, audit.
- **Chat API (proxy):** `apps/chat/app/api/chat/route.ts` → Python sidecar at `AI_SERVICE_URL` (default `http://localhost:8000`).
- **LLM calls (host):** `lib/ai/provider.ts` in each app (Vercel AI SDK config).
- **LLM calls (sidecar):** `services/ai/app/provider.py` + `app/graph/` (glm-4.7 non-stream triage routing, then qwen3.6-plus streaming draft — both thinking-off).
- **Knowledge corpus:** the `documents` table is the source of truth (admin-edited); `content/` markdown is the first-run seed. Ingest (`@meclaw/rag` `scripts/ingest.ts` for bulk, admin in-process per-doc) embeds into `rag_chunks`; the sidecar retrieves via `services/ai/app/retriever.py`.
- **Database:** PostgreSQL via `@meclaw/core` (Drizzle ORM + `postgres-js`). Persistence (conversations, messages) + RAG vectors (`rag_chunks`, pgvector, HNSW cosine) in the same store. Migrations live in `packages/core/drizzle/`.
- **RAG infra:** local Ollama (`nomic-embed-text`) + PostgreSQL (pgvector) configured by `infra/docker-compose.yml`. Ingestion runs on-demand (`pnpm ingest` = `pnpm --filter @meclaw/rag ingest`). Retrieval happens in Python sidecar (`services/ai/app/retriever.py`) via psycopg cosine kNN over `rag_chunks`.
- **Deploy config:** `git tag v*` → CI builds four GHCR images (chat → `apps/chat/Dockerfile`, admin → `apps/admin/Dockerfile`, ai → `services/ai/Dockerfile`, ops → `infra/Dockerfile.ops`) → Dokploy API deploys `infra/docker-compose.dokploy.yml` (Traefik subdomain routing, auto-migrations). Guide: `docs/ai/deploy.md`.
- **Multi-tenant (customer stacks):** isolated per-customer stacks (`infra/docker-compose.customer.yml`) provisioned/upgraded/torn-down one at a time via `infra/{provision,upgrade,teardown}-customer.sh` (Dokploy API). Not touched by tag-push CD. Shared Ollama + gateway key; isolated Postgres/content. Runbook: `docs/ai/customer-ops.md`.
- **Environment variables:** Each app reads `.env` / `.env.local` (dev) or the Dokploy Environment tab (prod). See `infra/.env.example` (dev) + `infra/.env.dokploy.example` (prod) and `docs/ai/setup.md` for details.
