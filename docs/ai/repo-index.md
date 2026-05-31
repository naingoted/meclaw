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
│  ├─ rag/*                          # local chunking, embeddings, qdrant, ingest/retrieve
│  ├─ db/{schema,index,migrate,env}.ts  # drizzle + postgres (postgres-js)
│  └─ content.ts                     # load /content markdown
├─ content/persona.md · resume.md · projects/*.md   # owner data, editable
├─ drizzle/                          # generated Postgres migrations
├─ drizzle.config.ts                 # drizzle-kit config (postgresql)
├─ scripts/db-migrate.ts             # `pnpm db:migrate` entry
├─ docker-compose.yml                # local qdrant + ollama + postgres
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
- **RAG infra:** local Ollama + Qdrant are configured by `docker-compose.yml`; ingest and retrieval live under `lib/rag/*`.
- **Config:** env vars in `.env.local` (see `.env.example`).
