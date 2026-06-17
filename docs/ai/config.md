# Configuration reference

**Single source of truth for every environment variable the stack reads.** The
`infra/.env*.example` templates are starting points and may lag this table — when
they disagree, **this file wins**. Defaults below are the literal fallbacks in code
(`packages/core/src/settings/settings.ts`, `apps/chat/lib/*`, `services/ai/app/config.py`,
`services/ai/app/runtime_config.py`). If you add a `process.env.*` / `os.getenv(...)`
read, add it here in the same change.

> **Silent-failure trap.** Optional integrations **no-op when unset and never throw**
> (lead alerts, web search). A missing key produces no error in logs — it just
> silently does nothing. If a feature "isn't working" in prod, check this table first.

---

## Required (no safe default — set these or things break / leak)

| Var | Service | Notes |
|-----|---------|-------|
| `ANTHROPIC_API_KEY` | chat, ai | LLM gateway key. Rotate if ever leaked. |
| `ANTHROPIC_BASE_URL` | chat, ai | Anthropic-compatible endpoint root. **TS apps need the `/v1` suffix; the Python sidecar OMITS it** (it appends `/v1/messages`). |
| `DATABASE_URL` | all | Postgres DSN. On the compose network host = `postgres`. |
| `POSTGRES_PASSWORD` | postgres | Mint on-box (`openssl rand -base64 24`); mirror into `DATABASE_URL`. |
| `AUTH_SECRET` | admin | Auth.js secret. `openssl rand -hex 32`. |
| `ADMIN_PASSWORD_HASH` | admin | scrypt `salt:hash`. Mint: `pnpm --filter @meclaw/admin gen:admin-hash <pw>`. |
| `RESUME_TOKEN_SECRET` | chat | HMAC key for embed-widget resume tokens. **Unset → tokens are `.insecure` → `/api/chat/history` 401s** (widget persistence silently breaks). `openssl rand -hex 32`. |

## Branding / persona — ⚠️ default to the **original author's identity**

These have hardcoded personal fallbacks. An unconfigured deploy ships as "Thet /
meclaw / naingoted@gmail.com". **Set all of these for any non-author deploy.**

| Var | Default | Read by |
|-----|---------|---------|
| `BOT_NAME` | `meclaw` | chat layout, core settings |
| `BOT_OWNER_NAME` | `Thet` | chat route, core settings, ai config |
| `BOT_TAGLINE` | `Thet Naing's personal bot` (layout) / `""` (settings) | chat layout, core settings |
| `BOT_CONTACT_EMAIL` | `naingoted@gmail.com` | core settings, ai config |
| `BRAND_ACCENT` | `""` | core settings (UI accent color) |
| `BRAND_LOGO_URL` | `""` | core settings |
| `NEXT_PUBLIC_CAL_URL` | `https://cal.com/tet-nai` (ai) / `""` | chat, ai — scheduling link |
| `NEXT_PUBLIC_GITHUB_URL` | `""` | chat, ai |

## Lead alerts (owner notification on captured contact info) — optional, silent if unset

`apps/chat/lib/notify.ts`. Each channel no-ops when its vars are unset and **never
throws** — a notify failure must not break the chat stream. Leads still persist to DB.

| Var | Notes |
|-----|-------|
| `LEAD_WEBHOOK_URL` | Slack/Discord-compatible `{ text }` webhook. |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token (from @BotFather). **Both** token and chat-id required, or the telegram branch is skipped silently. |
| `TELEGRAM_CHAT_ID` | Destination chat id (DM yourself the bot, then read `getUpdates`). |

Validate creds out-of-band: `curl https://api.telegram.org/bot$TOKEN/getMe` then a
`sendMessage` to `chat_id`.

## Models

| Var | Default | Notes |
|-----|---------|-------|
| `ANTHROPIC_MODEL` | `qwen3.6-plus` | Default draft/answer model. |
| `TRIAGE_MODEL` | `glm-4.7` | Non-streaming intent/triage. |
| `DRAFT_MODEL` | `qwen3.6-plus` | Streaming answer. |
| `MODEL_CONTEXT_WINDOW` | `8192` | Token budget guard. |

## RAG / retrieval tuning (defaults are sane — change only to tune)

DB-backed `settings` row overrides several of these at runtime (`runtime_config.py`).

| Var | Default |
|-----|---------|
| `OLLAMA_BASE_URL` | `http://ollama:11434` (`localhost` host-dev) |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` |
| `RAG_TOP_K` | `3` |
| `RAG_SCORE_FLOOR` | `0.35` |
| `RAG_SCORE_THRESHOLD` | `0.0` |
| `CLUSTER_RADIUS` | `0.15` |
| `GAP_MATCH_THRESHOLD` | `0.15` |
| `ANSWER_USE_THRESHOLD` | `0.3` |
| `TRIAGE_CONFIDENCE_THRESHOLD` | `0.5` |
| `HISTORY_MAX_MESSAGES` | `10` |
| `HISTORY_TOKEN_BUDGET` | `2000` |
| `CONFIG_CACHE_TTL_MS` | in-code default (chat config snapshot cache) |

## Research agent (Spec C) — feature-gated, optional

| Var | Default | Notes |
|-----|---------|-------|
| `TAVILY_API_KEY` | unset | Web search key. **Absent → web subtasks degrade (not fatal).** |
| `RESEARCH_MODEL` | = `TRIAGE_MODEL` | planner / researcher / judge |
| `RESEARCH_SYNTH_MODEL` | = `DRAFT_MODEL` | synthesis |
| `RESEARCH_TOOLCALL_MODE` | `json` | `json` \| `native` |
| `RESEARCH_MAX_SUBTASKS` | `6` | |
| `RESEARCH_RETRY_BUDGET` | `2` | per subtask |
| `RESEARCH_MAX_ITERATIONS` | `24` | |
| `RESEARCH_MAX_TOOL_CALLS` | `30` | |
| `RESEARCH_REACT_MAX_STEPS` | `4` | |
| `RESEARCH_MIN_NOTE_CHARS` | `40` | |
| `RESEARCH_JUDGE_THRESHOLD` | `0.6` | |
| `RESEARCH_CORPUS_SCORE_FLOOR` | = `RAG_SCORE_FLOOR` | |
| `FETCH_TIMEOUT_S` | `10` | web fetch tool |
| `FETCH_MAX_BYTES` | `1000000` (~1 MB) | |
| `FETCH_MAX_REDIRECTS` | `3` | |

## Rate limits (public chat + GET routes + embed)

| Var | Default |
|-----|---------|
| `RATE_LIMIT_MAX_REQUESTS` | `20` (per-IP chat POST) |
| `RATE_LIMIT_WINDOW_MS` | `60000` |
| `CHAT_GLOBAL_LIMIT_PER_MIN` | `120` (stack-wide chat POST ceiling) |
| `PUBLIC_API_RATE_LIMIT_MAX_REQUESTS` | `120` (per-IP cheap GETs) |
| `PUBLIC_API_GLOBAL_RATE_LIMIT_PER_MIN` | `600` |
| `EMBED_RATE_LIMIT_PER_MIN` | `60` (per embed-client; admin per-client override wins) |

## Embed widget / CORS

| Var | Default | Notes |
|-----|---------|-------|
| `CHAT_APP_ORIGIN` | `http://localhost:3000` | The chat app's own browser origin. Used to tell cross-origin API calls from same-origin iframe embed requests. **Set to the prod chat URL.** |

## MCP server (`@meclaw/mcp`, read-only)

| Var | Default | Notes |
|-----|---------|-------|
| `MCP_DATABASE_URL` | — | Read-only DB role DSN. |
| `MCP_AUTH_TOKEN` | — | Bearer for the HTTP transport. |
| `MCP_ALLOW_PII` | `false` | Gate PII exposure. |
| `MCP_HTTP_PORT` | `8787` | |
| `MCP_SCOPE` | `operator`/`public` (per entrypoint) | |
| `MCP_OPERATOR_URL` | `http://localhost:8787/mcp` | ai sidecar → MCP. |
| `MCP_TEST_DATABASE_URL` | — | tests only. |

## Infra / deploy (compose interpolation + build-injected)

| Var | Default | Notes |
|-----|---------|-------|
| `AI_SERVICE_URL` | `http://ai:8000` | chat → Python sidecar. |
| `MECLAW_CONTENT_DIR` | `/app/content` | Set in compose; corpus bind-mount. |
| `DOMAIN` | — | Caddy chat host (A record + LE TLS). |
| `ADMIN_DOMAIN` | — | Caddy admin host. |
| `AUTH_URL` | — | Must equal `https://<ADMIN_DOMAIN>`. |
| `GHCR_OWNER` | — | `ghcr.io/<owner>/meclaw-*` (lowercase). |
| `IMAGE_TAG` | `latest` | **CI-managed** — deploy job pins to released git tag; don't hand-edit. |
| `ADMIN_USERNAME` | `admin` | |
| `MECLAW_VERSION` / `GIT_SHA` | `dev` | Build/deploy-injected; surfaced at `/api/health`. |

---

## Where each layer reads env

- **Docker Compose / prod:** `infra/.env` (gitignored) — `env_file: .env` forwards
  **every** key to chat/admin/ai/migrations. A key present in `.env` reaches the
  container with **no** `environment:` entry needed. Template: `infra/.env.prod.example`.
- **Local Docker dev (`pnpm dev:full`):** `infra/.env`. Template: `infra/.env.example`.
- **Local Next dev (`pnpm dev`):** `.env.local`.
- **Local Python sidecar (`pnpm dev:ai`):** `services/ai/.env`.

Adding a var to prod = append to `/opt/meclaw/infra/.env` on the box, then
`docker compose -f infra/docker-compose.prod.yml up -d --no-deps <service>` to reload.
