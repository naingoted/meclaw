# Admin Dashboard

Next.js 16 admin panel with Auth.js v5 credentials authentication backed by the
`admin_users` table.

## Surface

- Documents, ingest jobs, config, gaps, embed clients, research briefings,
  conversations, audit log, account, and users live under `/admin/*`.
- Admin APIs live under `/api/admin/*`; mutations are audit-logged.
- The conversation dashboard is read-only. It derives list/detail/stats/export
  data from `conversations`, `messages`, `chat_misses`, and `retrieval_events`.

## Environment

The following environment variables are required to run the admin app:

- **`AUTH_SECRET`** — Random 32-byte hex string used to encrypt session tokens. Generate with: `openssl rand -hex 32`. Required.
- **`AUTH_URL`** — The public origin of the admin app. Examples: `http://localhost:3001` (development), `https://admin.example.com` (production). Required.
- **`ADMIN_USERNAME`** — The login username for credentials authentication. Defaults to `admin`. Optional.
- **`ADMIN_PASSWORD_HASH`** — Scrypt hash of the admin password in `salt:hash` format. Mint with: `pnpm --filter @meclaw/admin gen:admin-hash <password>`. Required when bootstrapping/recovering the first admin.

## Running Locally

Set the environment variables above, then:

```bash
pnpm --filter @meclaw/admin dev
```

The admin app runs on `http://localhost:3001` by default. Unauthenticated requests to `/admin/*` redirect to `/login`.
