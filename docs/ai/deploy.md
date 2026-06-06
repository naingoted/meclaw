# Deployment — VPS via GitHub Actions → GHCR → Docker Compose

Push to `main` → Actions builds four images (chat, admin, ai, ops) → pushes to GHCR →
SSHes to the VPS → pulls images → runs Postgres migrations via the ops image →
runs ingest via the ops image → starts the full stack with Caddy reverse proxy.
This public guide is the deployment source of truth; internal planning notes are not tracked.

## Architecture

**Four GHCR images:**
- `meclaw-chat` — public chat Next app (port 3000), built from `apps/chat/Dockerfile` (target `runner`)
- `meclaw-admin` — admin console Next app behind Auth.js login (port 3000 in container, routed by Caddy), built from `apps/admin/Dockerfile` (target `runner`)
- `meclaw-ai` — Python LLM sidecar (port 8000), built from `services/ai/Dockerfile`
- `meclaw-ops` — one-shot runners for db migrate + ingest, built from `infra/Dockerfile.ops`

**Reverse proxy:** Caddy (`infra/Caddyfile`) routes:
- `yourdomain.com` → chat container
- `admin.yourdomain.com` → admin container
- (ai + postgres + ollama are internal-only, no published ports)

**Data persistence:** PostgreSQL (pgvector extension) + Ollama embed model.

## One-time bootstrap

### 1. GitHub remote
```bash
git remote add origin git@github.com:<owner>/meclaw.git
git push -u origin main
```

### 2. GitHub repo secrets (Settings → Secrets and variables → Actions)
- `SSH_HOST` — VPS IP or hostname
- `SSH_USER` — deploy user (e.g. `deploy`)
- `SSH_KEY` — private key whose public half is in VPS user's `~/.ssh/authorized_keys`
- `SSH_PORT` — SSH port (omit/`22` if default)

`GITHUB_TOKEN` is automatic. The deploy workflow uses it with `packages: write`
to push GHCR images, then with `packages: read` during the SSH deploy to pull
those images on the VPS. No `GHCR_USER` or `GHCR_PAT` repository secret is needed
for the automated workflow.

### 3. DNS
Two A records pointing to VPS IP:
- `yourdomain.com` (apex)
- `admin.yourdomain.com` (subdomain)

Open ports 80 + 443 on the firewall for Caddy.

### 4. VPS prep (as the deploy user)

**Docker Engine + compose plugin:**
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # re-login after this
```

**Clone + config:**
```bash
sudo mkdir -p /opt/meclaw && sudo chown "$USER" /opt/meclaw
git clone git@github.com:<owner>/meclaw.git /opt/meclaw
cd /opt/meclaw

# Copy prod env template and fill in real values
cp infra/.env.prod.example infra/.env

# Edit infra/.env with:
#   DOMAIN=yourdomain.com
#   IMAGE_TAG=<latest git commit SHA from Actions or 'latest'>
#   GHCR_OWNER=<your GitHub username>
#   ANTHROPIC_API_KEY=
#   AUTH_SECRET=openssl rand -hex 32
#   ADMIN_PASSWORD_HASH=$(pnpm --filter @meclaw/admin gen:admin-hash '<password>')
```

**Real knowledge corpus (gitignored):**
```bash
mkdir -p content/knowledge
# ...copy your real .md/.pdf corpus into content/knowledge/ here...
```

**GHCR pull auth (if images are private):**
```bash
echo "<PAT with read:packages>" | docker login ghcr.io -u <owner> --password-stdin
```
This manual login is only for ad hoc pulls outside GitHub Actions. The automated
deploy workflow logs in before `docker compose pull`.

### 5. Mint secrets
```bash
# AUTH_SECRET: random 32-byte hex for Auth.js
AUTH_SECRET=$(openssl rand -hex 32)
echo "AUTH_SECRET=$AUTH_SECRET"  # copy into infra/.env

# ADMIN_PASSWORD_HASH: scrypt salt:hash from admin package
# (First install, then run the gen script)
pnpm install
pnpm --filter @meclaw/admin gen:admin-hash '<your-password>'
# Output: salt:hash — copy into infra/.env as ADMIN_PASSWORD_HASH=salt:hash
```

### 6. First deploy
```bash
git push origin main     # or re-run the latest Actions workflow
```
Watch Actions. On success, GitHub Actions will SSH to the VPS and run the compose up.
Site is live at `https://yourdomain.com` and admin at `https://admin.yourdomain.com`.

## Operations

**Logs:**
```bash
cd /opt/meclaw
docker compose -f infra/docker-compose.prod.yml logs -f chat admin ai caddy
```

**Manual migration (if prod DB schema drifted):**
```bash
docker compose -f infra/docker-compose.prod.yml run --rm ops pnpm --filter @meclaw/core db:migrate
```

**Manual re-ingest (if corpus changed):**
```bash
docker compose -f infra/docker-compose.prod.yml run --rm ops pnpm --filter @meclaw/rag ingest
```

**Rollback (to prior image tag):**
```bash
# Edit infra/.env: set IMAGE_TAG=<prior commit SHA>
docker compose -f infra/docker-compose.prod.yml pull
docker compose -f infra/docker-compose.prod.yml up -d
```

**Restart services:**
```bash
docker compose -f infra/docker-compose.prod.yml restart
```

## Content directory

The corpus is **bind-mounted, not baked into the images** (so editing markdown doesn't require a rebuild). `@meclaw/core`'s `contentDir()` resolves the corpus root, honoring the `MECLAW_CONTENT_DIR` env var (else `<cwd>/content`).

- **chat** mounts `../content` read-only at `/app/content` and sets `MECLAW_CONTENT_DIR=/app/content`. This serves the `/resume` route (reads `content/resume.md`) at runtime. Conversational knowledge itself comes from pre-computed RAG embeddings in Postgres, not filesystem reads.
- **ops** mounts the full `../content` tree (not just `knowledge/`) and sets `MECLAW_CONTENT_DIR=/app/content` so `pnpm ingest` reads markdown + PDFs from the content root. Work-impact packs, if used, live in a sibling `../data` dir — add that mount when present.
- **admin** does not read the corpus at runtime (no mount needed).

On the VPS, `/opt/meclaw/content/` is the source dir (`../content` relative to `infra/`). Drop the real `.md`/`.pdf` corpus there before running ingest.

## Notes
- Postgres schema is owned by Drizzle migrations; deploy runs them via the `ops` image before serving.
- `nomic-embed-text` persists in the `ollama_storage` Docker volume (downloaded once, reused across restarts).
- Chat, admin, and ai containers are not directly exposed — only Caddy (80/443) is published.
- The `ops` image is built but only used once (during Actions deploy) to migrate + ingest, then the container is cleaned up.
