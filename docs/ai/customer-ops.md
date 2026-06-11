# Customer operations — per-customer meclaw stacks (multi-tenant)

The owner stack (`docs/ai/deploy.md`) is one meclaw deployment. This guide covers running
**additional, isolated stacks for customers** on the same Dokploy box: one chat + admin +
ai + postgres per customer, provisioned and upgraded one at a time with the scripts in
`infra/`.

This is the customer-lifecycle source of truth; internal planning notes are not tracked.
**No secrets live in this file or in the repo** — `provision-customer.sh` generates each
customer's secrets locally and uploads them to that customer's Dokploy app (which writes the
`.env` the compose file reads). Rotate any key ever pasted into chat/logs.

> Read `docs/ai/deploy.md` first. It explains the box, Dokploy, Traefik→GHCR→Compose, the
> CI/CD pipeline, and the debugging runbook. This doc only adds the per-customer layer.

## What a customer stack is

A customer stack is `infra/docker-compose.customer.yml` deployed as its own Dokploy compose
app named `meclaw-<slug>`. Compose project scoping isolates each customer's volumes and DNS.

| Concern | Customer stack | vs. owner stack (`docker-compose.dokploy.yml`) |
|---------|----------------|-----------------------------------------------|
| `chat`, `admin`, `ai`, `postgres`, `migrations` | yes (one set per customer) | same |
| `ollama` | **none** — reaches the shared instance over the external `meclaw-shared` network at `http://meclaw-ollama-shared:11434` | own `ollama` service on the `internal` network |
| `ops` | **none** (owner-only tooling) | present |
| `content` | **named volume, starts EMPTY by design** — the owner's `content/` must never leak into a customer stack. The `documents` table (admin uploads) is the knowledge source of truth | repo-mounted seed |
| Postgres + `pgdata` volume | per-customer (isolated) | owner's own |
| Routing | Traefik hosts `<slug>.leanior.com` + `<slug>-admin.leanior.com` | `meclaw.leanior.com` + `meclaw-admin.leanior.com` |
| Deploy trigger | **manual only** — tag-push CD never touches customer stacks | tag-push CD |

**Shared across all stacks (owner + customers):**

- **Ollama** — embeddings are stateless, so one `nomic-embed-text` instance serves everyone
  (~0.5–1 GB RAM saved per customer). Joined to the external `meclaw-shared` network with the
  alias `meclaw-ollama-shared`.
- **LLM gateway key** — `ANTHROPIC_API_KEY` is shared in v1. Billing is therefore **not**
  isolated per customer (known risk; revisit before scaling tenants).

## One-time box setup (before the first customer)

Done once on the box, in order:

1. **Create the shared network.** Compose will not create it (`external: true`):
   ```bash
   docker network create meclaw-shared
   ```
2. **Redeploy the owner stack** so its `ollama` joins `meclaw-shared` with the
   `meclaw-ollama-shared` alias. The owner stack's own services keep reaching it at
   `http://ollama:11434` on the `internal` network; customers use the shared alias. Confirm:
   ```bash
   docker network inspect meclaw-shared --format '{{range .Containers}}{{.Name}} {{end}}'
   # expect the owner ollama container to appear
   ```
3. **DNS.** Each customer needs `<slug>.leanior.com` and `<slug>-admin.leanior.com` resolving
   to the box. Either add a wildcard `*.leanior.com` A record once, or add the two records per
   slug. (See `deploy.md` §3 for the DNS provider.)
4. **GHCR images public** — already true for the owner stack (`deploy.md` §4); customer stacks
   pull the same `ghcr.io/<owner>/meclaw-*` images, so nothing extra.

## Provision a customer

```bash
cd infra
DOKPLOY_API=https://<panel-domain>/api \
DOKPLOY_API_TOKEN=<token> \
DOKPLOY_PROJECT_ID=<project-id> \
ANTHROPIC_API_KEY=<shared-gateway-key> \
./provision-customer.sh <slug> <image-tag> [--dry-run]
```

| Var | Source |
|-----|--------|
| `DOKPLOY_API` | `https://<panel-domain>/api` |
| `DOKPLOY_API_TOKEN` | Dokploy panel → Settings → Profile → API/CLI Keys |
| `DOKPLOY_PROJECT_ID` | the Dokploy project the stack belongs to |
| `ANTHROPIC_API_KEY` | the shared gateway key — **never** stored in the repo |
| `GHCR_OWNER` | optional, defaults to `naingoted` |

- **`<slug>`** must match `^[a-z0-9][a-z0-9-]{0,29}[a-z0-9]$` (lowercase, digits, hyphens; 2–31
  chars). It drives the app name, hostnames, and Traefik router names.
- **`<image-tag>`** is a pinned release, e.g. `v1.0.14-alpha` — use a tag CI has already built
  and pushed to GHCR (`deploy.md` release flow).
- **Always `--dry-run` first.** It prints the rendered env with every secret masked and exits
  without touching Dokploy.

**What a real run does** (all via the Dokploy REST API, fails hard on any non-200):

1. Generates per-customer secrets locally: `POSTGRES_PASSWORD`, `AUTH_SECRET`,
   `RESUME_TOKEN_SECRET`, and a random `ADMIN_PASSWORD` (hashed with the admin app's
   `gen:admin-hash`, scrypt — only the hash is uploaded).
2. Renders `infra/.env.customer.example` with those values + the slug/tag/key.
3. `compose.create` → `compose.update` (raw compose file + env) → `compose.deploy`.
4. Health-polls `https://<slug>.leanior.com/api/health` for up to 15 min.
5. Prints the chat/admin URLs, the **`composeId`** (save it — upgrade and teardown need it),
   and the admin password **once**. Store the password in the password manager immediately; it
   is never written to disk.

## Post-provision: customer-specific config

The stack boots generic. Set these in the customer's Dokploy app **Environment** tab (then
redeploy), or pre-fill before provisioning. Names and defaults live in
`infra/.env.customer.example`.

- **Branding / identity:** `BOT_OWNER_NAME`, `BOT_NAME`, `BOT_TAGLINE`, `BOT_CONTACT_EMAIL`,
  `BRAND_LOGO_URL`, `BRAND_ACCENT`.
- **Links:** `NEXT_PUBLIC_CAL_URL`, `NEXT_PUBLIC_GITHUB_URL`.
- **Lead notifications:** `LEAD_WEBHOOK_URL` (Slack/Discord) and/or `TELEGRAM_BOT_TOKEN` +
  `TELEGRAM_CHAT_ID` (both required, or the Telegram channel is skipped).
- **Cost / rate limits:** `HISTORY_MAX_MESSAGES`, `HISTORY_TOKEN_BUDGET`,
  `EMBED_RATE_LIMIT_PER_MIN`, `RATE_LIMIT_MAX_REQUESTS`, `CHAT_GLOBAL_LIMIT_PER_MIN`.

**Load knowledge.** The `content` volume is empty by design — knowledge is the `documents`
table. Log in at `https://<slug>-admin.leanior.com` (user `admin`, the printed password),
upload the customer's markdown, and run ingest from the admin console so `rag_chunks` gets
embeddings (the admin app embeds in-process via the shared Ollama — `OLLAMA_BASE_URL` /
`OLLAMA_EMBED_MODEL` are already set in the template). Until documents are ingested, the chat
has nothing to ground on.

## Upgrade a customer

Customer stacks are **not** touched by the tag-push CD — by design, you upgrade each customer
deliberately:

```bash
cd infra
DOKPLOY_API=https://<panel-domain>/api DOKPLOY_API_TOKEN=<token> \
./upgrade-customer.sh <composeId> <slug> <new-tag>
```

Reads the app's current env, rewrites `IMAGE_TAG` to `<new-tag>`, re-deploys, and health-polls
for up to 10 min. Migrations run automatically via the `migrations` init-service on deploy.

## Tear down a customer

```bash
cd infra
DOKPLOY_API=https://<panel-domain>/api DOKPLOY_API_TOKEN=<token> \
./teardown-customer.sh <composeId> <slug>
```

**DESTRUCTIVE** — deletes the Dokploy app, containers, **and data volumes** (`deleteVolumes:
true`), so the customer's database is gone. **Take a final backup first** (below). The script
requires you to type the slug to confirm, then verifies the chat endpoint stops responding. If
volumes linger: on the box, `docker volume ls | grep meclaw-<slug>`.

## Backup (manual — known gap)

There is no automated per-customer backup yet. Before a teardown or risky upgrade, dump the
customer's database from the box:

```bash
# container name is project-scoped: meclaw-<slug>-postgres-1 (verify with `docker ps`)
docker exec meclaw-<slug>-postgres-1 \
  pg_dump -U meclaw meclaw > meclaw-<slug>-$(date +%F).sql
```

Store the dump off-box. (A scheduled backup story is a readiness follow-up, not yet built.)

## Isolation guarantees & shared surfaces

**Isolated per customer:** compose project (namespaced volumes + DNS), Postgres + `pgdata`
volume, the `content` volume (empty — owner content never leaks), and all auth/resume/admin
secrets.

**Shared (by design):** the Ollama embedding instance (stateless) and the LLM gateway key
(billing not per-customer-isolated in v1 — the main scaling risk).

## Troubleshooting

- **Chat/admin 404/502 after provision:** DNS for `<slug>.leanior.com` not resolving to the
  box, or the deploy still in progress — re-check `https://<slug>.leanior.com/api/health`.
- **Ingest/embeddings fail ("fetch failed", retry loop):** the customer's `ai`/`admin` can't
  reach Ollama. Confirm `meclaw-shared` exists and the owner `ollama` is attached
  (`docker network inspect meclaw-shared`). The customer env must have
  `OLLAMA_BASE_URL=http://meclaw-ollama-shared:11434` (it's in the template).
- **Anything box/Traefik/Dokploy-level:** see the **Debugging runbook** in `docs/ai/deploy.md`
  (container naming, panel TLS, login reset) — it applies to customer stacks too.
