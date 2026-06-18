# Repo index — where things live

Monorepo structure: two Next.js apps (public + admin), shared backend/UI packages, Python AI sidecar, and infra config.

```
meclaw/
├─ apps/
│  ├─ chat/                          # @meclaw/chat — public chat app (port 3000)
│  │  ├─ app/{layout,page,api/chat/route}.tsx
│  │  ├─ app/api/chat/history/       # resume-token-gated transcript rehydration
│  │  ├─ app/widget/                 # embedded-iframe chat surface
│  │  ├─ app/resume/route.ts         # markdown resume download
│  │  ├─ components/chat/*           # host wiring around @naingoted/meclaw-chat-ui
│  │  ├─ lib/{ai,chat,embed}/        # provider proxy · session index/timestamps · embed auth + HMAC resume tokens
│  │  ├─ public/embed.js             # third-party widget loader (bubble + iframe)
│  │  └─ next.config.ts
│  └─ admin/                         # @meclaw/admin — console (port 3001, Auth.js protected)
│     ├─ app/admin/{documents,config,gaps,embed-clients,research,jobs,audit,account,users}/   # console pages
│     ├─ app/{login,api}/            # Auth.js login wall + /api/admin/* mutations
│     ├─ app/api/admin/{account,password,users}/
│     ├─ lib/{admin,research}/       # services (incl. in-process ingest + corpus state) · research SSE hook
│     ├─ lib/admin/{users,authz}.ts  # admin user lifecycle + role/capability guards
│     ├─ scripts/{gen-admin-hash,seed-documents}.ts
│     └─ next.config.ts
├─ packages/
│  ├─ core/                          # @meclaw/core — db, content loader, settings
│  │  ├─ lib/{db/,content.ts}        # Drizzle schema + postgres-js + migration runner
│  │  ├─ drizzle/{migrations}/       # versioned Postgres migration files
│  │  ├─ drizzle.config.ts
│  │  └─ package.json (exports: types, lib, migrations)
│  ├─ rag/                           # @meclaw/rag — seed + ingest + retrieval logic
│  │  ├─ src/{pgvector,seed,ingest-document,chunk,embed,loaders,config,types}.ts
│  │  ├─ scripts/seed.ts             # `pnpm --filter @meclaw/rag seed` — content/ → documents → embed
│  │  └─ package.json
│  ├─ mcp/                           # @meclaw/mcp — unified MCP tool layer (TS-defined, two transports)
│  │  ├─ src/{registry,scope,guard,redact,auth,env,db}.ts   # tool registry + two-scope model (public/operator) + safety
│  │  ├─ src/tools/{describe-schema,run-read-query,get-telemetry,search-corpus,static-tools}.ts
│  │  ├─ src/bin/{stdio,http}.ts     # stdio (local/tokenless) + streamable-HTTP (bearer auth) transports
│  │  └─ package.json
│  ├─ meclaw-chat-ui/                # @naingoted/meclaw-chat-ui — published/shared presentational chat UI
│  │  ├─ src/{chat-conversation,chat-input,history-drawer,live-trace,turns}.tsx
│  │  ├─ REQUIRED-TOKENS.md          # Tailwind token and @source requirements for consumers
│  │  └─ package.json
│  └─ ui/                            # @meclaw/ui — internal shadcn components + cn helper
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
│  ├─ docker-compose.prod.yml        # PROD (live): Caddy stack, SSH-deployed — see docs/ai/deploy.md
│  ├─ Caddyfile                      # PROD reverse proxy: DOMAIN → chat, ADMIN_DOMAIN → admin (auto Let's Encrypt)
│  ├─ Dockerfile.ops                 # one-shot migrate + ingest runner image
│  ├─ .env.prod.example              # PROD env template (real values live in /opt/meclaw/infra/.env on the box)
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
│  └─ ...
├─ .github/workflows/{ci,deploy}.yml
├─ .github/pull_request_template.md
├─ pnpm-workspace.yaml               # monorepo root config
├─ package.json (root scripts)
└─ turbo.json
```

## Key entry points

- **Chat page:** `apps/chat/app/page.tsx` + `useChat` client component.
- **Admin console:** `apps/admin/app/admin/*` pages behind the Auth.js login wall (`app/login`): documents, config, gaps, embed clients, research, jobs, audit, account, users.
- **Chat API (proxy):** `apps/chat/app/api/chat/route.ts` → Python sidecar at `AI_SERVICE_URL` (default `http://localhost:8000`).
- **Shared chat UI package:** `packages/meclaw-chat-ui` (`@naingoted/meclaw-chat-ui`) exports presentational chat components and helpers only. Host apps own API transport, session storage, auth, and rate limiting.
- **External chat consumers:** Leanior and similar host apps import `@naingoted/meclaw-chat-ui`, then call Meclaw's Next routes through `NEXT_PUBLIC_MECLAW_API_BASE` (`/api/embed-config`, `/api/chat`, `/api/chat/history`). They must not define Meclaw API routes or connect to Meclaw Postgres directly.
- **LLM calls (host):** `lib/ai/provider.ts` in each app (Vercel AI SDK config).
- **LLM calls (sidecar):** `services/ai/app/provider.py` + `app/graph/` (glm-4.7 non-stream triage routing, then qwen3.6-plus streaming draft — both thinking-off).
- **Knowledge corpus:** the `documents` table is the source of truth (admin-edited); `content/` is the first-run seed. The `seed` one-shot (`@meclaw/rag` `scripts/seed.ts` for bulk first-run, admin in-process per-doc for edits) imports `content/` into `documents` and embeds into `rag_chunks` (`source = document:<id>`); the sidecar retrieves via `services/ai/app/retriever.py`.
- **Database:** PostgreSQL via `@meclaw/core` (Drizzle ORM + `postgres-js`). Persistence (conversations, messages) + RAG vectors (`rag_chunks`, pgvector, HNSW cosine) in the same store. Migrations live in `packages/core/drizzle/`.
- **RAG infra:** local Ollama (`nomic-embed-text`) + PostgreSQL (pgvector) configured by `infra/docker-compose.yml`. First-run seeding runs on-demand (`pnpm seed` = `pnpm --filter @meclaw/rag seed`); admin per-doc ingest is in-process. Retrieval happens in Python sidecar (`services/ai/app/retriever.py`) via psycopg cosine kNN over `rag_chunks`.
- **Deploy config:** `git tag v*` → CI builds four GHCR images (chat → `apps/chat/Dockerfile`, admin → `apps/admin/Dockerfile`, ai → `services/ai/Dockerfile`, ops → `infra/Dockerfile.ops`) → CI SSHes to the EC2 box and `compose pull && up -d` of `infra/docker-compose.prod.yml` (Caddy host routing, auto-migrations). Guide: `docs/ai/deploy.md`.
- **Environment variables:** Each app reads `.env` / `.env.local` (dev) or `/opt/meclaw/infra/.env` on the box (prod). See `infra/.env.example` (dev) + `infra/.env.prod.example` (Caddy prod) and `docs/ai/setup.md` for details.
