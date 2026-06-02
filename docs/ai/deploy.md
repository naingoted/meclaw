# Deployment — VPS via GitHub Actions → GHCR → Docker Compose

Push to `main` → Actions builds four images (chat, admin, ai, ops) → pushes to GHCR →
SSHes to the VPS → pulls images → runs Postgres migrations via the ops image →
runs ingest via the ops image → starts the full stack with Caddy reverse proxy.
See archived deployment spec under `docs/superpowers/specs/`.

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

`GITHUB_TOKEN` is automatic with `packages: write` — no PAT needed for GHCR.

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
#   ANTHROPIC_API_KEY=<rotated key from owner>
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

## Known limitations

**Content directory:** The chat and admin containers' working directory is `/app`. The ingest and retrieval logic loads corpus from `process.cwd() + /content`. In prod, the `ops` service bind-mounts `content/knowledge` for ingest, but the **chat and admin containers do not have `/app/content` mounted**. This means:
- `@meclaw/core`'s content loader and `@meclaw/rag`'s ingest script read from `/app/content` as intended (they run in the ops container during the deployment step).
- But the running chat/admin apps cannot load the corpus at runtime if they try to re-read `content/` (currently they don't — they rely on pre-computed RAG embeddings in Postgres).
- **Workaround (tracked for follow-up):** either bind-mount a read-only `content/` volume into chat + admin containers, or anchor the content path to an environment variable (e.g. `CONTENT_DIR=/opt/meclaw/content` mounted + passed to containers).

This is acceptable for v1 because the chat and admin apps use pre-computed embeddings + full-corpus fallback, not runtime filesystem loads. If future features require real-time corpus reading, mount the volume.

## Notes
- Postgres schema is owned by Drizzle migrations; deploy runs them via the `ops` image before serving.
- `nomic-embed-text` persists in the `ollama_storage` Docker volume (downloaded once, reused across restarts).
- Chat, admin, and ai containers are not directly exposed — only Caddy (80/443) is published.
- The `ops` image is built but only used once (during Actions deploy) to migrate + ingest, then the container is cleaned up.
