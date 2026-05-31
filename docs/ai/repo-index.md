# Repo index — where things live

> Target layout. Items marked _(planned)_ arrive in a later milestone.

```
meclaw/
├─ app/
│  ├─ layout.tsx · page.tsx          # public chat page
│  ├─ globals.css                    # Tailwind 4 + shadcn theme tokens
│  └─ api/chat/route.ts              # POST streaming endpoint
├─ components/
│  ├─ chat/*                         # message list, input, chips, markdown, dev sources
│  └─ ui/*                           # shadcn primitives (button added)
├─ lib/
│  ├─ utils.ts                       # cn() class merge helper
│  ├─ ai/provider.ts                 # anthropic provider: baseURL + model from env
│  ├─ ai/persona.ts                  # build system prompt from full corpus or retrieved chunks
│  ├─ ai/tools.ts                    # agent tools
│  ├─ rag/{ingest,chunk,embed,loaders,config,types,pgvector}.ts  # RAG → Postgres pgvector
│  ├─ db/{schema,index,migrate,env}.ts  # drizzle + postgres (postgres-js)
│  └─ content.ts                     # load /content markdown
├─ content/persona.md · resume.md · projects/*.md   # owner data, editable
├─ drizzle/                          # generated Postgres migrations
├─ drizzle.config.ts                 # drizzle-kit config (postgresql)
├─ scripts/db-migrate.ts             # `pnpm db:migrate` entry
├─ docker-compose.yml                # local ollama + postgres (pgvector image)
├─ docs/ai/                          # HANDOFF + these orientation docs
├─ docs/superpowers/specs/           # design doc
├─ .github/{workflows/ci.yml,pull_request_template.md}
├─ .env.example                      # committed placeholders
└─ components.json                   # shadcn config
```

## Key entry points

- **Chat UI:** `app/page.tsx` renders the `useChat` client component.
- **LLM calls:** everything funnels through `lib/ai/provider.ts`.
- **Knowledge:** markdown in `content/` → loaded by `lib/content.ts` → full-corpus or retrieved prompt via `lib/ai/persona.ts`.
- **RAG infra:** local Ollama + PostgreSQL (pgvector) are configured by `docker-compose.yml`. Ingestion (TS `pnpm ingest` → `lib/rag/pgvector.ts`) writes to `rag_chunks` table in `lib/db/schema.ts` + `drizzle/` migrations. Retrieval happens in the Python sidecar (`services/ai/app/retriever.py`) via psycopg cosine kNN over `rag_chunks`.
- **Config:** env vars in `.env.local` (see `.env.example`).
