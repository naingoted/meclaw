# Secrets rotation — post-incident runbook

**Trigger:** any credential has been pasted into chat, logged, or otherwise exposed. The
2026-06-10 leak (`ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD`, `AUTH_SECRET`, admin password
hash + plaintext admin password — and, at the time, the now-retired Dokploy panel
credentials) is the reference incident.

**Performed by:** the operator, on the box. The engineer walks the checklist and verifies
each step. **No secrets go into chat, logs, commits, or any tracked file.**

Production is a single bare-Caddy EC2 box. All runtime secrets live in
`/opt/meclaw/infra/.env` (gitignored, never committed); `docker-compose.prod.yml` forwards
that file to every service via `env_file: .env`. SSH in as the deploy user (no sudo) to edit
it. Deploy/CD secrets (the SSH key) live in GitHub Actions secrets. See `docs/ai/deploy.md`
for the box topology.

> **Blocking:** do not resume serving traffic until this checklist is complete and each old
> credential is verified dead (Step 4).

## Step 1: Rotate the DashScope gateway key

Alibaba Cloud / DashScope console → create a new API key, delete the leaked one.

**Don't** paste the new key into chat, logs, or any tracked file. Test it from the console
UI or by calling DashScope directly from the box with the key read from an env var (not
echoed to stdout).

## Step 2: Generate replacement app secrets

Run these on the box (each value goes straight into `/opt/meclaw/infra/.env` in Step 3 —
don't paste into chat):

```bash
openssl rand -hex 32     # new AUTH_SECRET
openssl rand -hex 32     # new RESUME_TOKEN_SECRET
openssl rand -base64 24  # new POSTGRES_PASSWORD
openssl rand -base64 18  # new admin password (save to password manager immediately)
pnpm --filter @meclaw/admin gen:admin-hash '<new admin password>'  # new ADMIN_PASSWORD_HASH
```

The admin password is shown to the operator **once**. Store it in the password manager; do
not write it to disk.

## Step 3: Update the box `.env` and redeploy

Edit `/opt/meclaw/infra/.env` on the box. Replace each leaked key with the new value from
Steps 1–2:

| Env var | New value source |
|---------|------------------|
| `ANTHROPIC_API_KEY` | Step 1 |
| `AUTH_SECRET` | Step 2 |
| `RESUME_TOKEN_SECRET` | Step 2 |
| `POSTGRES_PASSWORD` | Step 2 |
| `DATABASE_URL` | mirror new `POSTGRES_PASSWORD` inside the URL |
| `ADMIN_PASSWORD_HASH` | Step 2 (scrypt hash, NOT the plaintext password) |

**Critical ordering for the postgres password:** changing `POSTGRES_PASSWORD` in `.env`
alone won't update the existing DB user — the `pgdata` volume keeps the old password. Run
the in-DB change **before** recreating the stack with the new env:

```bash
# on the box, BEFORE redeploy:
docker exec -it $(docker ps -qf name=postgres -f label=com.docker.compose.project=meclaw) \
  psql -U meclaw -d meclaw -c "ALTER USER meclaw WITH PASSWORD '<new password>';"
```

Then recreate the affected services so they pick up the new `.env`:

```bash
cd /opt/meclaw/infra
docker compose -f docker-compose.prod.yml up -d --force-recreate
```

Wait for the stack to come up healthy (`docker compose -f docker-compose.prod.yml ps`).

## Step 4: Verify old credentials are dead

Run these **after** redeploy — each must fail with the OLD value:

```bash
# 1. Old admin password must fail login at https://<ADMIN_DOMAIN>
#    (try it in a browser, or POST to the login endpoint)

# 2. Old gateway key must be rejected by DashScope — test from the console UI,
#    NOT by pasting the key anywhere that would log it.

# 3. Old postgres password — from the box:
docker exec -it $(docker ps -qf name=postgres -f label=com.docker.compose.project=meclaw) \
  psql "postgresql://meclaw:<OLD password>@localhost:5432/meclaw" -c "select 1;"
# must fail with "authentication failed"

# 4. Old RESUME_TOKEN_SECRET — from a browser on the chat, the existing resume
#    token in localStorage must 401 /api/chat/history (new secret = old tokens
#    invalid). Visitors start fresh; this is expected.
```

If any old credential still works, stop and fix before declaring rotation complete.

## Step 5: Record completion

Update the HANDOFF note (`docs/ai/HANDOFF.md`) with the rotation date and which secrets
were rotated.

## Post-rotation: hardening habits

- **Never paste secrets into chat or logs.** If you need to verify a key, read it from the
  box `.env` over SSH — never `echo` it to a shared terminal.
- **Mask on read.** If you ever need to dump the box `.env` (for debugging), pipe through
  `sed -E 's/^([A-Z_]*(KEY|SECRET|PASSWORD|HASH|TOKEN)[A-Z_]*)=.+/\1=********/'`.
- **Rotate on any doubt.** A leaked key is a dead key; generate a new one and verify the
  old is rejected. Cost of rotation is minutes; cost of a live leaked key is unbounded.
