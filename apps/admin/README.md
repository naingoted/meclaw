# Admin Dashboard

Next.js 16 admin panel with Auth.js v5 credentials authentication.

## Environment

The following environment variables are required to run the admin app:

- **`AUTH_SECRET`** — Random 32-byte hex string used to encrypt session tokens. Generate with: `openssl rand -hex 32`. Required.
- **`AUTH_URL`** — The public origin of the admin app. Examples: `http://localhost:3001` (development), `https://admin.example.com` (production). Required.
- **`ADMIN_USERNAME`** — The login username for credentials authentication. Defaults to `admin`. Optional.
- **`ADMIN_PASSWORD_HASH`** — Scrypt hash of the admin password in `salthex:keyhex` format. Mint with: `pnpm --filter @meclaw/admin exec jiti scripts/gen-admin-hash.ts <password>`. Required.

## Running Locally

Set the environment variables above, then:

```bash
pnpm dev
```

The admin app runs on `http://localhost:3001` by default. Unauthenticated requests to `/admin/*` redirect to `/login`.
