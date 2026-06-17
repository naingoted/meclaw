# Secrets rotation — post-incident runbook

**Trigger:** any credential has been pasted into chat, logged, or otherwise exposed. The
2026-06-10 leak (Dokploy API token + panel password, `ANTHROPIC_API_KEY`,
`POSTGRES_PASSWORD`, `AUTH_SECRET`, admin password hash + plaintext admin password) is the
reference incident.

**Performed by:** the operator, on the box. The engineer walks the checklist and verifies
each step. **No secrets go into chat, logs, commits, or any tracked file.**

> **Blocking:** no customer data may touch the box until this checklist is complete and
> each old credential is verified dead (Step 5). Acceptance criterion 9 of the
> first-customer readiness spec.

## Step 1: Rotate the DashScope gateway key

Alibaba Cloud / DashScope console → create a new API key, delete the leaked one.

**Don't** paste the new key into chat, logs, or any tracked file. Test it from the console
UI or by calling DashScope directly from the box with the key read from an env var (not
echoed to stdout).

## Step 2: Rotate the Dokploy panel password and API token

1. Dokploy panel → profile → change password.
2. Settings → API/CLI → revoke the old token, generate a new one.
3. Update the GitHub Actions secret:

```bash
gh secret set DOKPLOY_API_TOKEN --repo <owner>/<repo>
# paste the new token at the prompt — never as a CLI arg (shell history)
```

4. If the CD pipeline reads the token from anywhere else (env file on a runner, etc.),
   update that source too.

## Step 3: Generate replacement app secrets

Run these on the box (output goes straight into the Dokploy env tab in Step 4 — don't
paste into chat):

```bash
openssl rand -hex 32   # new AUTH_SECRET
openssl rand -hex 32   # new RESUME_TOKEN_SECRET
openssl rand -hex 24   # new POSTGRES_PASSWORD
openssl rand -base64 18  # new admin password (save to password manager immediately)
pnpm --filter @meclaw/admin gen:admin-hash '<new admin password>'  # new ADMIN_PASSWORD_HASH
```

The admin password is shown to the operator **once**. Store it in the password manager; do
not write it to disk.

## Step 4: Update the owner stack env in Dokploy

Dokploy panel → meclaw compose → Environment tab. Replace each leaked key with the new
value from Step 3:

| Env var | New value source |
|---------|------------------|
| `ANTHROPIC_API_KEY` | Step 1 |
| `AUTH_SECRET` | Step 3 |
| `RESUME_TOKEN_SECRET` | Step 3 |
| `POSTGRES_PASSWORD` | Step 3 |
| `DATABASE_URL` | mirror new `POSTGRES_PASSWORD` inside the URL |
| `ADMIN_PASSWORD_HASH` | Step 3 (scrypt hash, NOT the plaintext password) |

**Critical ordering for the postgres password:** changing `POSTGRES_PASSWORD` in the env
alone won't update the existing DB user — the pgdata volume keeps the old password. Run
the in-DB change **before** redeploying with the new env:

```bash
# on the box, BEFORE redeploy:
docker exec -it $(docker ps -qf name=postgres -f label=com.docker.compose.project=meclaw) \
  psql -U meclaw -d meclaw -c "ALTER USER meclaw WITH PASSWORD '<new password>';"
```

Then redeploy from the panel (or push a tag) and wait for the stack to come up healthy.

For customer stacks, repeat the same update in each customer's Dokploy app Environment
tab — customer stacks have their own `POSTGRES_PASSWORD`, `AUTH_SECRET`,
`RESUME_TOKEN_SECRET`, and admin hash (generated at provision). `ANTHROPIC_API_KEY` is
shared in v1, so rotating the gateway key once covers every stack.

## Step 5: Verify old credentials are dead

Run these **after** redeploy — each must fail with the OLD value:

```bash
# 1. Old Dokploy token must 401/403:
curl -s -o /dev/null -w '%{http_code}\n' \
  "https://dokploy.example.com/api/compose.one?composeId=x" \
  -H "x-api-key: <OLD token>"

# 2. Old admin password must fail login at https://admin.example.com
#    (try it in a browser, or POST to the login endpoint)

# 3. Old gateway key must be rejected by DashScope — test from the console UI,
#    NOT by pasting the key anywhere that would log it.

# 4. Old postgres password — from the box:
docker exec -it $(docker ps -qf name=postgres -f label=com.docker.compose.project=meclaw) \
  psql "postgresql://meclaw:<OLD password>@localhost:5432/meclaw" -c "select 1;"
# must fail with "authentication failed"

# 5. Old RESUME_TOKEN_SECRET — from a browser on the chat, the existing resume
#    token in localStorage must 401 /api/chat/history (new secret = old tokens
#    invalid). Visitors start fresh; this is expected.
```

If any old credential still works, stop and fix before declaring rotation complete.

## Step 6: Record completion

Update the HANDOFF note (`docs/ai/HANDOFF.md`) with the rotation date and which secrets
were rotated. This satisfies acceptance criterion 9 of the first-customer readiness spec.

## Post-rotation: hardening habits

- **Never paste secrets into chat or logs.** If you need to verify a key, read it from
  the Dokploy env tab in the panel UI — never `echo` it.
- **Mask on read.** If you ever need to dump the Dokploy env (for debugging), pipe
  through `sed -E 's/^([A-Z_]*(KEY|SECRET|PASSWORD|HASH|TOKEN)[A-Z_]*)=.+/\1=********/'`.
- **Rotate on any doubt.** A leaked key is a dead key; generate a new one and verify
  the old is rejected. Cost of rotation is minutes; cost of a live leaked key is
  unbounded.
