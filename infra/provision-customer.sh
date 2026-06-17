#!/usr/bin/env bash
# Provision a per-customer meclaw stack in Dokploy.
#
# Usage: DOKPLOY_API=https://dokploy.example.com/api BASE_DOMAIN=example.com \
#        DOKPLOY_API_TOKEN=... DOKPLOY_PROJECT_ID=... \
#        ./provision-customer.sh <slug> <image-tag> [--dry-run]
#
# Generates per-customer secrets locally, renders .env.customer.example,
# creates + deploys a Dokploy compose app, then health-polls the new stack.
# Prints the admin password ONCE. Writes no secrets to disk or repo.
set -euo pipefail

SLUG="${1:?usage: provision-customer.sh <slug> <image-tag> [--dry-run]}"
TAG="${2:?usage: provision-customer.sh <slug> <image-tag> [--dry-run]}"
DRY_RUN="${3:-}"

[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,29}[a-z0-9]$ ]] || { echo "bad slug: $SLUG" >&2; exit 1; }
: "${DOKPLOY_API:?set DOKPLOY_API}" "${DOKPLOY_API_TOKEN:?set DOKPLOY_API_TOKEN}" "${DOKPLOY_PROJECT_ID:?set DOKPLOY_PROJECT_ID}"
: "${ANTHROPIC_API_KEY:?export the shared gateway key (not stored in repo)}"
: "${BASE_DOMAIN:?set BASE_DOMAIN (your apex domain for routing, e.g. example.com)}"
GHCR_OWNER="${GHCR_OWNER:-naingoted}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

api() { # api <method> <path> [json-body]
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" "${DOKPLOY_API}${path}" -H "x-api-key: ${DOKPLOY_API_TOKEN}" -w '\n%{http_code}')
  [ -n "$body" ] && args+=(-H "Content-Type: application/json" -d "$body")
  local resp code
  resp=$(curl "${args[@]}")
  code=$(printf '%s' "$resp" | tail -n1)
  RESP_BODY=$(printf '%s' "$resp" | sed '$d')
  if [ "$code" != "200" ]; then
    echo "ERROR: ${method} ${path} -> HTTP ${code}" >&2
    exit 1
  fi
}

# 1. Per-customer secrets (local generation; printed once at the end).
POSTGRES_PASSWORD=$(openssl rand -hex 24)
AUTH_SECRET=$(openssl rand -hex 32)
RESUME_TOKEN_SECRET=$(openssl rand -hex 32)
ADMIN_PASSWORD=$(openssl rand -base64 18)
echo "hashing admin password..."
ADMIN_PASSWORD_HASH=$(cd "$REPO_ROOT" && pnpm --silent --filter @meclaw/admin gen:admin-hash "$ADMIN_PASSWORD")

# 2. Render env from the example.
ENV_CONTENT=$(sed \
  -e "s|^CUSTOMER_SLUG=.*|CUSTOMER_SLUG=${SLUG}|" \
  -e "s|^GHCR_OWNER=.*|GHCR_OWNER=${GHCR_OWNER}|" \
  -e "s|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|" \
  -e "s|^ANTHROPIC_API_KEY=.*|ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}|" \
  -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${POSTGRES_PASSWORD}|" \
  -e "s|^DATABASE_URL=.*|DATABASE_URL=postgres://meclaw:${POSTGRES_PASSWORD}@postgres:5432/meclaw|" \
  -e "s|^AUTH_SECRET=.*|AUTH_SECRET=${AUTH_SECRET}|" \
  -e "s|^RESUME_TOKEN_SECRET=.*|RESUME_TOKEN_SECRET=${RESUME_TOKEN_SECRET}|" \
  -e "s|^ADMIN_PASSWORD_HASH=.*|ADMIN_PASSWORD_HASH=${ADMIN_PASSWORD_HASH}|" \
  -e "s|^BASE_DOMAIN=.*|BASE_DOMAIN=${BASE_DOMAIN}|" \
  -e "s|^AUTH_URL=.*|AUTH_URL=https://${SLUG}-admin.${BASE_DOMAIN}|" \
  "$SCRIPT_DIR/.env.customer.example")

COMPOSE_CONTENT=$(cat "$SCRIPT_DIR/docker-compose.customer.yml")

if [ "$DRY_RUN" = "--dry-run" ]; then
  echo "--- DRY RUN: would create compose app meclaw-${SLUG} (project ${DOKPLOY_PROJECT_ID}) ---"
  echo "--- rendered env (secrets masked) ---"
  printf '%s\n' "$ENV_CONTENT" | sed -E \
    -e 's/^([A-Z_]*(KEY|SECRET|PASSWORD|HASH|TOKEN)[A-Z_]*)=.+/\1=********/' \
    -e 's|^(DATABASE_URL)=.+|\1=********|'
  exit 0
fi

# 3. Create the compose app.
api POST /compose.create "$(jq -nc \
  --arg name "meclaw-${SLUG}" --arg pid "$DOKPLOY_PROJECT_ID" \
  '{name: $name, projectId: $pid, composeType: "docker-compose"}')"
COMPOSE_ID=$(printf '%s' "$RESP_BODY" | jq -r '.composeId // .id')
[ -n "$COMPOSE_ID" ] && [ "$COMPOSE_ID" != "null" ] || { echo "ERROR: no composeId in compose.create response" >&2; exit 1; }
echo "created compose app: ${COMPOSE_ID}"

# 4. Upload compose file + env.
api POST /compose.update "$(jq -nc \
  --arg id "$COMPOSE_ID" --arg cf "$COMPOSE_CONTENT" --arg env "$ENV_CONTENT" \
  '{composeId: $id, sourceType: "raw", composeFile: $cf, env: $env}')"
echo "uploaded compose file + env"

# 5. Deploy.
api POST /compose.deploy "$(jq -nc --arg id "$COMPOSE_ID" '{composeId: $id}')"
echo "deploy triggered; polling https://${SLUG}.${BASE_DOMAIN}/api/health ..."

# 6. Health poll (15 min budget).
deadline=$(( $(date +%s) + 900 ))
until curl -sSf "https://${SLUG}.${BASE_DOMAIN}/api/health" >/dev/null 2>&1; do
  [ "$(date +%s)" -lt "$deadline" ] || { echo "ERROR: stack did not become healthy in 15m (composeId=${COMPOSE_ID})" >&2; exit 1; }
  sleep 15
done

cat <<EOF

==================================================================
 Stack ready.
   chat:   https://${SLUG}.${BASE_DOMAIN}
   admin:  https://${SLUG}-admin.${BASE_DOMAIN}  (user: admin)
   composeId: ${COMPOSE_ID}

 Admin password (shown ONCE — store in the password manager now):
   ${ADMIN_PASSWORD}
==================================================================
EOF
