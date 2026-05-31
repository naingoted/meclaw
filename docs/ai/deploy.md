# Deployment — VPS via GitHub Actions → GHCR → Docker Compose

Push to `main` → Actions builds images → pushes to GHCR → SSHes to the VPS →
pulls images → starts Postgres → runs Drizzle migrations via the ingest image →
starts the full stack → pulls the embed model → ingests. See the spec:
archived deployment spec notes under `docs/superpowers/specs/`.

## One-time bootstrap

### 1. GitHub remote
```bash
git remote add origin git@github.com:<owner>/meclaw.git
git push -u origin main
```

### 2. GitHub repo secrets (Settings → Secrets and variables → Actions)
- `SSH_HOST` — VPS IP or hostname
- `SSH_USER` — deploy user (e.g. `deploy`)
- `SSH_KEY`  — private key whose public half is in the VPS user's `~/.ssh/authorized_keys`
- `SSH_PORT` — SSH port (omit/`22` if default)

`GITHUB_TOKEN` is automatic and has `packages: write` — no PAT needed for pushing.

### 3. DNS
A record: `yourdomain.com` → VPS IP. (Open ports 80 + 443 on the firewall.)

### 4. VPS prep (as the deploy user)
```bash
# Docker Engine + compose plugin
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # re-login after this

# Clone + config
sudo mkdir -p /opt/meclaw && sudo chown "$USER" /opt/meclaw
git clone git@github.com:<owner>/meclaw.git /opt/meclaw
cd /opt/meclaw
cp .env.prod.example .env          # then edit .env with real values (rotated key, GHCR_OWNER, DOMAIN)

# Real knowledge corpus (gitignored — bind-mounted into ingest)
mkdir -p content/knowledge
#  ...copy your real .md/.pdf corpus into content/knowledge/ here...

# GHCR pull auth (private images): PAT with read:packages
echo "<PAT>" | docker login ghcr.io -u <owner> --password-stdin
```

### 5. First deploy
```bash
git push origin main     # or re-run the latest Actions workflow
```
Watch Actions; on success the site is live at `https://yourdomain.com`.

## Operations

- **Logs:** `docker compose -f docker-compose.prod.yml logs -f web ai caddy`
- **Manual migration:** `docker compose -f docker-compose.prod.yml run --rm ingest pnpm db:migrate`
- **Manual re-ingest:** `docker compose -f docker-compose.prod.yml run --rm ingest pnpm ingest`
- **Rollback:** set `IMAGE_TAG=<prior-sha>` in `.env`, then `docker compose -f docker-compose.prod.yml pull && up -d`
- **Restart:** `docker compose -f docker-compose.prod.yml restart`

## Notes
- Postgres schema is owned by Drizzle migrations; deploy runs them before serving.
- `nomic-embed-text` persists in the `ollama_storage` volume (real download only once).
- The `ai`/`qdrant`/`ollama`/`postgres` services are never published — only Caddy (80/443).
