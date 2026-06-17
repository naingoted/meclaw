# Deployment — Caddy on AWS EC2 (SSH CD → GHCR → Docker Compose)

Production runs on a single AWS EC2 box as a bare Docker Compose stack
(`infra/docker-compose.prod.yml`, project `meclaw`) fronted by **Caddy**, which owns
`:80`/`:443` and auto-issues Let's Encrypt certs for the chat + admin hosts. CI builds
`amd64` images on GHCR, then deploys by **SSHing into the box** to check out the released
tag and converge the stack.

This public guide is the deployment source of truth; internal planning notes are not tracked.
**No secrets or environment-specific hostnames/IPs live in this file** — real values go in
`/opt/meclaw/infra/.env` on the box and in GitHub Actions secrets/variables. Rotate any key
ever pasted into chat/logs.

> **Caddy hosts** (A records → the box's public IP; set in `.env`):
> `${DOMAIN}` → chat, `${ADMIN_DOMAIN}` → admin. Caddy reads both from the box `.env` and
> requests certs once each host resolves to the box.
>
> An earlier **Dokploy + Traefik** path (`infra/docker-compose.dokploy.yml`) exists as a
> self-hosted-PaaS alternative; it is no longer the live prod path.

Related runbooks: per-customer (multi-tenant) lifecycle — [customer-ops.md](customer-ops.md);
post-leak rotation checklist — [secrets-rotation.md](secrets-rotation.md).

## CI/CD pipeline

`.github/workflows/deploy.yml` has two modes depending on the git ref:

| Trigger | Jobs |
|---------|------|
| `push to main` | `quality` (lint + typecheck + test + fallow audit) |
| `git tag v*` | `quality → build → deploy` |

**`build`** — builds and pushes four `amd64` images to GHCR: `meclaw-chat`, `meclaw-admin`, `meclaw-ai`, `meclaw-ops`, tagged `latest`, the commit SHA, and the git tag (e.g. `v1.2.3`).

**`deploy`** — SSHes into the EC2 box (no sudo: the deploy user owns `/opt/meclaw` and is in the `docker` group), checks out the released tag at `/opt/meclaw` (picks up compose, Caddyfile, migrations, content), pins `IMAGE_TAG` in `infra/.env`, then `docker compose -f infra/docker-compose.prod.yml pull && up -d --remove-orphans`. The `migrations` service runs `db:migrate` to completion **before** chat/admin/ai start (`depends_on: service_completed_successfully`), so apps never serve against an unmigrated DB. A final step polls `PROD_CHAT_URL/api/health` until the running chat reports the released commit SHA. Every step **fails on non-zero** so a broken deploy can't pass silently.

Set repo variable `SKIP_PROD_DEPLOY=true` to publish images for a tag **without** touching prod (build-only release), then unset to restore.

### GitHub Actions secrets / variables required

| Secret | Purpose |
|--------|---------|
| `SSH_HOST` | The box's public IP the deploy SSHes into |
| `SSH_USER` | SSH user that owns `/opt/meclaw` + is in the `docker` group |
| `SSH_KEY` | Private key whose public half is in the box's `authorized_keys` |
| `SSH_PORT` | SSH port (defaults to `22` if unset) |

| Variable | Purpose |
|----------|---------|
| `PROD_CHAT_URL` | `https://<chat host>` — polled for SHA convergence |
| `SKIP_PROD_DEPLOY` | `true` to build images without deploying |

### Release flow

```bash
git tag v1.2.3
git push origin v1.2.3
# → CI: quality → build (pushes 4 GHCR images) → deploy (SSH → git checkout tag → compose pull && up -d → migrations → health-SHA poll)
```

**Rollback:** re-run the *old* tag's `Deploy` workflow from the GitHub Actions UI (re-pins
`IMAGE_TAG` to that tag and reconverges the box), then verify
`curl -sS https://<chat host>/api/health` reports the expected `sha`.

## Topology

**Stack file:** `infra/docker-compose.prod.yml` (Caddy reverse proxy) + `infra/Caddyfile`.
**Env template:** `infra/.env.prod.example` → copy to `/opt/meclaw/infra/.env` on the box and fill.

**Services (Compose project `meclaw`):**
- `caddy` — reverse proxy on `:80`/`:443`; reads `${DOMAIN}`/`${ADMIN_DOMAIN}` from `.env`, auto-issues Let's Encrypt certs (HTTP-01). Routes chat + admin; everything else is internal.
- `chat` — public chat Next app (`expose: 3000`). Corpus bind-mounted (`../content` → `/app/content`).
- `admin` — admin console Next app behind Auth.js (`expose: 3000`).
- `ai` — Python LLM sidecar (`expose: 8000`). Internal only.
- `ollama` — embedding model host (`expose: 11434`). Internal only.
- `postgres` — pgvector/pg16 (`expose: 5432`). Internal only; `pgdata` volume.
- `migrations` — one-shot DB migrator (`restart: no`, reuses the ops image). Runs `db:migrate`
  after postgres is healthy on every `up`; chat/admin/ai gate on its
  `service_completed_successfully`, so schema is current before the apps boot. Idempotent; a
  failed migrate blocks dependents → the deploy fails loudly instead of serving an unmigrated DB.
- `ops` — one-shot ingest/seed runner (`profiles: ["tools"]`, not started normally).

**Networks:** the Compose default network only — all services talk over it by name; only `caddy`
publishes host ports. **Volumes:** `pgdata`, `ollama_storage`, `caddy_data`, `caddy_config`;
`../content` is bind-mounted read-only into `chat` + `ops`.

**GHCR images** (`ghcr.io/${GHCR_OWNER}/meclaw-*:${IMAGE_TAG}`): `meclaw-chat`, `meclaw-admin`,
`meclaw-ai`, `meclaw-ops` — must be **public** (or configure registry auth on the box).

## Provision a new box (from scratch)

1. **EC2** — Ubuntu 24.04 **amd64**; size for 3 Next apps + Ollama + Postgres (≈t3.small with swap
   is the proven floor; give more headroom if budget allows). Disk: gp3 ≥ 30 GB. Allocate +
   associate an Elastic IP. Security group inbound: `22` (SSH), `80`, `443`.
2. **Docker** — install Docker Engine + the Compose plugin. Create the deploy user, add it to the
   `docker` group, and `chown` `/opt/meclaw` to it (CI SSHes in as this user, no sudo).
3. **Code + env** — clone the repo to `/opt/meclaw`; copy `infra/.env.prod.example` →
   `infra/.env` and fill it (mint secrets on-box, never echo):
   ```bash
   openssl rand -hex 32                                       # AUTH_SECRET
   openssl rand -base64 24                                    # POSTGRES_PASSWORD (mirror into DATABASE_URL)
   openssl rand -hex 32                                       # RESUME_TOKEN_SECRET
   pnpm --filter @meclaw/admin gen:admin-hash '<password>'    # ADMIN_PASSWORD_HASH (scrypt salt:hash)
   ```
   Set `DOMAIN`, `ADMIN_DOMAIN`, `AUTH_URL=https://<ADMIN_DOMAIN>`, `GHCR_OWNER`, `IMAGE_TAG`.
4. **DNS** — at your DNS provider, point A records for the chat + admin hosts at the box's
   Elastic IP **before** the first deploy (Caddy's ACME HTTP-01 challenge needs them resolving, or
   cert issuance fails). Verify: `dig +short <host>` returns the box IP.
5. **GitHub** — set `SSH_HOST`/`SSH_USER`/`SSH_KEY`/`SSH_PORT` and `PROD_CHAT_URL` (see table above).
6. **GHCR visibility** — `gh api /user/packages/container/meclaw-<name> --jq .visibility` should say
   `public` for all four (flip via the GitHub package UI), or configure a registry credential on the box.
7. **First deploy** — `git tag vX.Y.Z && git push origin vX.Y.Z`. CI builds, SSHes in, converges the
   box on the tag, and polls `/api/health` for the SHA.

## Post-deploy one-shots (`ops` profile)

Migrations run **automatically** (the `migrations` service applies pending schema before the apps
start on every deploy). The embed-model pull and corpus seed are manual one-shots — run from
`/opt/meclaw/infra` on the box:

```bash
cd /opt/meclaw/infra
DC="docker compose -f docker-compose.prod.yml"

# 1. migrate schema (normally automatic via the `migrations` service; manual run is idempotent)
$DC --profile tools run --rm ops pnpm --filter @meclaw/core db:migrate
# 2. pull the embed model (CPU embedding is slow on small instances — expect minutes)
$DC exec ollama ollama pull nomic-embed-text
# 3. seed the corpus into `documents` + embed → rag_chunks (one idempotent command)
$DC --profile tools run --rm ops pnpm --filter @meclaw/rag seed
```

Drop the real `.md`/`.pdf` corpus into `/opt/meclaw/content/` before seeding (it's bind-mounted,
not baked into the image). The `seed` one-shot imports it into `documents` (admin-manageable) and
embeds it as `document:<id>` chunks — the same writer the admin Documents console uses, so there is
no second file-slug corpus to drift. (Note: an `ops --rm` run can hang on exit — Node finishes but
holds the postgres handle; `docker rm -f` the lingering container.)

### One-shot: reset dangling resolved gap clusters

Resolved gap clusters whose curated document was deleted before the delete-guard existed silently
no-match in the resolved-gap fast path. Flip them back to `new` so they reappear in `/admin/gaps`:

```sql
UPDATE gap_clusters
SET status = 'new', "resolvedDocumentId" = NULL, "resolvedAt" = NULL, "updatedAt" = now()
WHERE status = 'resolved'
  AND ("resolvedDocumentId" IS NULL
       OR "resolvedDocumentId" NOT IN (SELECT id FROM documents));
```

Run once against each environment's Postgres (local + prod). Idempotent.

## Operations

```bash
cd /opt/meclaw/infra
DC="docker compose -f docker-compose.prod.yml"

$DC ps                                 # status
$DC logs -f chat admin ai              # tail app logs
$DC logs migrations                    # why a deploy gated/failed at migrate
$DC restart chat admin                 # bounce after env/migration changes
```

**`IMAGE_TAG` is CI-managed.** The `deploy` job pins `IMAGE_TAG` in `infra/.env` to the released git
tag before each deploy, then polls `https://<chat host>/api/health` until the running chat container
reports the released commit SHA. Don't hand-edit `IMAGE_TAG` during a normal release.

## Debugging runbook

**`admin` logs `relation ... does not exist`.** Startup race — admin booted before migrations ran.
The `migrations` init-service prevents this on normal deploys (admin gates on its completion). If you
still hit it (e.g. the service was removed or failed), run the migrate one-shot above, then
`$DC restart admin`, and check `$DC logs migrations` for why it didn't apply.

**`chat` throws "Server Action" / stale-client errors.** Usually stale cached clients after a config
or DB change — `$DC restart chat`.

**Caddy serves no cert / ACME keeps failing.** The host must resolve to the box **before** Caddy
tries to issue (HTTP-01 on `:80`). Confirm `dig +short <host>` returns the box IP and ports `80`/`443`
are open in the security group, then `$DC restart caddy` and watch `$DC logs caddy`.

**`exec format error` building images locally.** The host may be arm64; GHCR images are amd64. Don't
pass `--platform linux/amd64` without QEMU — let CI build the real amd64 images and only do native
verify-builds locally.

## Secrets policy
- Never commit `.env`/filled env files — only `*.env.example` placeholders. Set real values in
  `/opt/meclaw/infra/.env` on the box and in GitHub Actions secrets/variables.
- Rotate any key/token ever pasted into chat or logs (gateway/Anthropic key, etc.), then update it
  in the box `.env` and redeploy.
- Mint `AUTH_SECRET` / `POSTGRES_PASSWORD` / `RESUME_TOKEN_SECRET` on-box; don't echo them.
