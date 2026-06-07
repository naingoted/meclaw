# Deployment — Dokploy on AWS (Traefik → GHCR → Docker Compose)

Production runs on a single AWS EC2 box via **Dokploy** (self-hosted PaaS). Dokploy's
bundled **Traefik** owns `:80`/`:443` and issues Let's Encrypt certs. The app stack is a
Dokploy "Docker Compose" application pulling CI-built `amd64` images from GHCR.

This public guide is the deployment source of truth; internal planning notes are not tracked.
**No secrets live in this file** — real values go in the Dokploy app's Environment tab (which
writes the `.env` the compose file reads). Rotate any key ever pasted into chat/logs.

> Older flow (Caddy + GitHub-Actions SSH deploy) is retired. `.github/workflows/deploy.yml`
> still builds the four GHCR images; its SSH-deploy job is dead and pending a Dokploy rewire.

## Topology

**Stack file:** `infra/docker-compose.dokploy.yml` (env template: `infra/.env.dokploy.example`).

**Five services:**
- `chat` — public chat Next app (:3000). Public via Traefik.
- `admin` — admin console Next app behind Auth.js (:3000). Public via Traefik.
- `ai` — Python LLM sidecar (:8000). Internal only.
- `ollama` — embed model host (:11434). Internal only.
- `postgres` — pgvector/pg16 (:5432). Internal only.
- `ops` — one-shot migrate + ingest runner (`profiles: ["tools"]`, not started normally).

**Networks:** `chat`+`admin` join `internal` **and** the external `dokploy-network` (so Traefik
can reach them); everything else is `internal` only. Traefik discovers routers from each
public service's top-level `labels:` (docker provider, `network=dokploy-network`).

**Public hosts (A records → the EC2 Elastic IP):**
- `meclaw.leanior.com` → chat
- `meclaw-admin.leanior.com` → admin
- `dokploy.leanior.com` → Dokploy panel itself

**GHCR images** (`ghcr.io/${GHCR_OWNER}/meclaw-*:${IMAGE_TAG}`, owner `naingoted`, must be **public**
or add a registry in Dokploy): `meclaw-chat`, `meclaw-admin`, `meclaw-ai`, `meclaw-ops`.

## Provision from scratch

### 1. EC2 (AWS profile `leanior`, region `ap-southeast-1`)
- Instance: **t3.large** (Dokploy + 3 Next apps + Ollama need the headroom), Ubuntu 24.04 **amd64**.
- Disk: gp3 ≥ 50 GB. Allocate + associate an **Elastic IP**.
- Security group inbound: `22` (SSH), `80`, `443`. (Dokploy panel is served over `443` via its
  own domain — no need to expose `3000` publicly once the panel domain is set.)
- Import your key pair; SSH as `ubuntu` (key path used here: `~/.ssh/meclaw-deploy`).

### 2. Install Dokploy
```bash
ssh -i ~/.ssh/meclaw-deploy ubuntu@<EIP>
curl -sSL https://dokploy.com/install.sh | sudo bash
```
Installs Docker + Swarm, the `dokploy`, `dokploy-postgres`, `dokploy-redis` services, and the
standalone `dokploy-traefik` container. Panel first reachable on `http://<EIP>:3000` — register
the first (admin) user there, or tunnel: `ssh -i ~/.ssh/meclaw-deploy -L 3000:localhost:3000 ubuntu@<EIP>`.

### 3. DNS (Namecheap)
A records for all three hosts above → the Elastic IP. No extra records needed for the panel —
the ACME challenge is HTTP-01 on `:80`. Verify: `dig +short <host>` returns the EIP.

### 4. Make GHCR packages public
`gh api /user/packages/container/meclaw-<name> --jq .visibility` should say `public` for all four.
Flip via the GitHub package UI (no REST endpoint for user-package visibility). Otherwise add a
GHCR registry credential in Dokploy.

### 5. Create the Compose app (Dokploy API or UI)
API uses header `x-api-key: <token>` (generate under user settings). Known endpoints:
`/api/project.create`, `/api/compose.create`, `/api/compose.update`, `/api/compose.one?composeId=`,
`/api/compose.deploy`. No OpenAPI is exposed.

1. Create a project, then a Compose app in it. Dokploy assigns its own **appName** (e.g.
   `compose-parse-solid-state-interface-shk6l5`) — this **overrides** the `name:` in the compose
   file and becomes the `docker compose -p` project prefix. Note it; you need it for every
   manual `docker compose` call (see Debugging).
2. Set the **compose path** to `infra/docker-compose.dokploy.yml` and source to the git repo
   (or paste the file).
3. **Environment tab:** paste `infra/.env.dokploy.example` filled in. Mint on-box, never print:
   ```bash
   openssl rand -hex 32                       # AUTH_SECRET
   openssl rand -base64 24                     # POSTGRES_PASSWORD (mirror into DATABASE_URL)
   pnpm --filter @meclaw/admin gen:admin-hash '<password>'   # ADMIN_PASSWORD_HASH (scrypt salt:hash)
   ```
   `AUTH_URL=https://meclaw-admin.leanior.com`, `GHCR_OWNER=naingoted`, `IMAGE_TAG=latest`.
   Domains are hardcoded in the compose Traefik labels (not env).
4. **Deploy.** Traefik picks up the labels and issues LE certs for both app hosts.

### 6. Post-deploy (one-shots via the `ops` profile)
Run from the deployed code dir on the box (`/etc/dokploy/compose/<appName>/code/infra/`), using the
Dokploy project prefix:
```bash
APP=<appName>; cd /etc/dokploy/compose/$APP/code/infra
DC="sudo docker compose -p $APP -f docker-compose.dokploy.yml"

# 1. migrate schema
$DC --profile tools run --rm ops pnpm --filter @meclaw/core db:migrate
# 2. pull embed model (CPU embedding is slow on t3.large — expect minutes)
$DC exec ollama ollama pull nomic-embed-text
# 3. ingest the corpus into rag_chunks
$DC --profile tools run --rm ops pnpm --filter @meclaw/rag ingest
```
The corpus is bind-mounted (`../content` → `/app/content`, `MECLAW_CONTENT_DIR=/app/content`), not
baked in. Drop the real `.md`/`.pdf` corpus into `<code>/content/` before ingest.

### 7. Set the Dokploy panel domain (HTTPS for the panel itself)
Dokploy ships routing `dokploy.docker.localhost` on plain `web` only — the panel has **no real
domain or TLS** until you set one. Settings → Web Server → Domain (enter `dokploy.leanior.com` +
a real ACME email + enable HTTPS) writes it canonically. If the UI path is unavailable, see the
manual Traefik fix under Debugging.

## Operations

```bash
APP=<appName>; cd /etc/dokploy/compose/$APP/code/infra
DC="sudo docker compose -p $APP -f docker-compose.dokploy.yml"

$DC ps                                 # status (note Dokploy's container names)
$DC logs -f chat admin ai              # tail app logs
$DC restart chat admin                 # bounce after env/migration changes
```
Redeploy / rollback: change `IMAGE_TAG` in the Dokploy env, redeploy the Compose app from the
panel (it re-pulls). Verify live: `curl -sS -o /dev/null -w "%{http_code} ssl=%{ssl_verify_result}\n" https://meclaw.leanior.com/`
(expect `200 ssl=0`; admin returns `302` to login).

## Debugging runbook (hard-won)

**"No containers found" / filtering by `name=meclaw` misses everything.**
Dokploy renames the project to its **appName**, so containers are `<appName>_chat_1`, etc., not
`meclaw_*`. Find the real prefix: `sudo docker ps --format '{{.Names}}'` or read it from
`/etc/dokploy/compose/`. Always pass `-p <appName>` to `docker compose`.

**Panel domain has no cert / "Not Secure" / `dig` resolves but HTTPS is self-signed.**
Traefik's dynamic config for the panel is `/etc/dokploy/traefik/dynamic/dokploy.yml`. Default routes
only `dokploy.docker.localhost` on `web`. Rewrite it to the real host on `websecure` + a `web`→`https`
redirect (file provider hot-reloads, no restart, app certs untouched):
```yaml
http:
  routers:
    dokploy-router-app:
      rule: Host(`dokploy.leanior.com`) && PathPrefix(`/`)
      service: dokploy-service-app
      entryPoints: [websecure]
      tls: { certResolver: letsencrypt }
    dokploy-router-app-redirect:
      rule: Host(`dokploy.leanior.com`) && PathPrefix(`/`)
      service: dokploy-service-app
      entryPoints: [web]
      middlewares: [redirect-to-https]
  services:
    dokploy-service-app:
      loadBalancer:
        servers: [{ url: http://dokploy:3000 }]
        passHostHeader: true
```
The `letsencrypt` resolver (HTTP-01 on `web`) and the `redirect-to-https` middleware already exist
in `/etc/dokploy/traefik/traefik.yml` + `dynamic/middlewares.yml`. Cert issues in ~30s.

**ACME email is `test@localhost.com`.** Only affects LE expiry notices (certs issue regardless).
To change: edit `email:` in static `/etc/dokploy/traefik/traefik.yml`, then `sudo docker restart
dokploy-traefik` (brief `:80`/`:443` blip on the live sites).

**"Not Secure / active content with certificate errors" on a valid-cert page.** Browser-side stale
state from when you bypassed the earlier self-signed cert (per Chrome profile). Cert is fine — open
in a fresh Incognito window.

**Can't log into the Dokploy panel.** First confirm the backend, not the browser, is at fault — reproduce
the login against better-auth directly:
```bash
curl -sS -i -X POST https://dokploy.leanior.com/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -d '{"email":"<email>","password":"<pw>"}'
```
`200` + a `better-auth.session_token` cookie = creds good, problem is the browser (wrong/old password,
or stale cert-error tab → use Incognito). To **reset** the password (bcrypt `$2b$`, stored in the
`account` table of the `dokploy-postgres` DB):
```bash
PG=$(sudo docker ps -q -f name=dokploy-postgres | head -1)
HASH=$(python3 -c "import bcrypt;print(bcrypt.hashpw(b'<newpw>',bcrypt.gensalt(10)).decode())")
sudo docker exec "$PG" psql -U dokploy -d dokploy \
  -c "update account set password='$HASH' where provider_id='credential'; update \"user\" set \"isRegistered\"=true;"
```

**admin logs "relation ... does not exist".** Startup race — admin booted before migrations ran. Run
the migrate one-shot (step 6.1) then `$DC restart admin`.

**chat throws "Server Action" / stale-client errors.** Usually stale cached clients after a config or
DB change — `$DC restart chat`.

**`exec format error` building images locally.** The host is arm64; GHCR images are amd64. Don't pass
`--platform linux/amd64` without QEMU — let CI build the real amd64 images and only do native
verify-builds locally.

## Secrets policy
- Never commit `.env`/filled env files — only `*.env.example` placeholders. Set real values in the
  Dokploy Environment tab.
- Rotate any key/token ever pasted into chat or logs (Anthropic key, Dokploy API token), then update
  it in the Dokploy env and redeploy.
- Mint `AUTH_SECRET` / `POSTGRES_PASSWORD` on-box; don't echo them.
