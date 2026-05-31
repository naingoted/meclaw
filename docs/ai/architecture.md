# Architecture

## The loop

1. Visitor loads `/` → `useChat` (`@ai-sdk/react`) renders the chat UI.
2. User sends a message → `POST /api/chat` with `{ messages }`.
3. Route handler applies guards, proxies to the Python AI sidecar, and tees the
   streamed response for persistence.
4. Tokens stream back → UI renders incrementally (markdown, auto-scroll).
5. On finish → best-effort persist of conversation + messages to PostgreSQL
   (failures are logged, never break the stream).
6. Tools: `showResume`, `scheduleCall`, `getContactInfo`, and a meta "how does
   this bot work?" tool.

## Decisions that shape the code

- **Anthropic-compatible gateway, not real Anthropic.** Model is `qwen3.6-plus` via DashScope. We use `@ai-sdk/anthropic` with a custom `baseURL`. The provider may append `/v1/messages` — verify the path in M1 and adjust `baseURL` if it double-appends.
- **Local RAG with graceful fallback.** Markdown is embedded locally through Ollama and retrieved from PostgreSQL via the `pgvector` extension; if retrieval is unavailable or unnecessary, the app falls back to the full corpus.
- **PostgreSQL persistence.** `postgres-js` + Drizzle, configured by `DATABASE_URL`; schema is owned by Drizzle migrations (`pnpm db:migrate`). Both conversation history (`conversations`, `messages`) and knowledge vectors (`rag_chunks` with 768-dim vectors and HNSW cosine index) live in one datastore.
- **Provider-agnostic seam.** `lib/ai/provider.ts` is the only place that knows the model/gateway.

## V2 Phase 1 RAG (Postgres pgvector)

Phase 1 keeps the existing chat route and persona builder, but swaps the knowledge path from blanket stuffing to retrieval over `content/**`.

- **Embeddings:** Ollama runs locally and serves `nomic-embed-text` on `http://localhost:11434` (768-dim vectors).
- **Vector store:** PostgreSQL via the `pgvector` extension, in the `rag_chunks` table with HNSW cosine index. Same `DATABASE_URL` datastore that holds conversation history.
- **Top K:** default retrieval fan-out is `4`.
- **Dev sources:** when enabled, the chat UI can surface retrieved sources in development.

Request flow (TS write path, Python read path):

1. User sends a message.
2. The Python sidecar embeds the query with Ollama and searches PostgreSQL for the best matching chunks from `content/**` using cosine kNN.
3. If retrieval succeeds and the corpus is large enough to need narrowing, the prompt is built from the retrieved chunks plus the existing persona rules.
4. If the corpus is tiny, Ollama is unavailable, or PostgreSQL is unavailable, retrieval falls back to the old full-corpus prompt so chat still works.
5. Ingestion (TS `pnpm ingest` → `lib/rag/pgvector.ts` `PgVectorStore`) writes embeddings to `rag_chunks`; no separate ingest service.

This keeps Phase 1 additive: local infra improves relevance, but a service outage does not block the owner from using the app. Single datastore (`DATABASE_URL`) now owns both transactional (conversations/messages) and vector (rag_chunks) data.

## Data model (PostgreSQL)

- `conversations` — `id, createdAt, visitorMeta(json?)`
- `messages` — `id, conversationId, role(user|assistant|tool), content, toolCalls(json?), createdAt`
- `rag_chunks` — `id, source, title, text, ordinal, embedding(vector, 768-dim)` with HNSW cosine index

No orgs/users/auth/subscriptions/plugins — stripped from the multi-tenant ancestor.

## Error handling

- Missing `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` → loud boot error + friendly UI message.
- Gateway error/timeout → stream error event → UI retry, no crash.
- DB write failure → log only; persistence is best-effort.
- Rate limiting + prompt-injection guard → **M6**.
- Tiny corpus, RAG service outage, or empty results → fall back to the full `content/**` prompt and keep chatting.
