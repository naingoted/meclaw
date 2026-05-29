# Architecture

## The loop

1. Visitor loads `/` → `useChat` (`@ai-sdk/react`) renders the chat UI.
2. User sends a message → `POST /api/chat` with `{ messages }`.
3. Route handler loads cached persona + knowledge, builds a system prompt, and calls
   `streamText(anthropic(model), { system, messages, tools })`.
4. Tokens stream back → UI renders incrementally (markdown, auto-scroll).
5. On finish → best-effort persist of conversation + messages to SQLite (failures are logged, never break the stream).
6. _(M5)_ Tools: `showResume`, `scheduleCall`, `getContactInfo`, and a meta "how does this bot work?" tool.

## Decisions that shape the code

- **Anthropic-compatible gateway, not real Anthropic.** Model is `qwen3.6-plus` via DashScope. We use `@ai-sdk/anthropic` with a custom `baseURL`. The provider may append `/v1/messages` — verify the path in M1 and adjust `baseURL` if it double-appends.
- **No embeddings / no vector RAG in v1.** Gateway is chat-only. Knowledge is context-stuffed from the (tiny) markdown corpus. Real RAG is post-v1.
- **SQLite, not a server DB.** `better-sqlite3` + Drizzle, file at `data/echo.db`. Zero Docker; `pnpm dev` just works.
- **Provider-agnostic seam.** `lib/ai/provider.ts` is the only place that knows the model/gateway.

## Data model (SQLite, M3)

- `conversations` — `id, createdAt, visitorMeta(json?)`
- `messages` — `id, conversationId, role(user|assistant|tool), content, toolCalls(json?), createdAt`

No orgs/users/auth/subscriptions/plugins — stripped from the multi-tenant ancestor.

## Error handling

- Missing `ANTHROPIC_API_KEY` / `ANTHROPIC_BASE_URL` → loud boot error + friendly UI message.
- Gateway error/timeout → stream error event → UI retry, no crash.
- DB write failure → log only; persistence is best-effort.
- Rate limiting + prompt-injection guard → **M6**.
