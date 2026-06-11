#!/usr/bin/env bash
# Deliberate per-customer upgrade (customer stacks are NOT touched by tag-push CD).
# Usage: DOKPLOY_API=... DOKPLOY_API_TOKEN=... ./upgrade-customer.sh <composeId> <slug> <tag>
set -euo pipefail

COMPOSE_ID="${1:?usage: upgrade-customer.sh <composeId> <slug> <tag>}"
SLUG="${2:?usage: upgrade-customer.sh <composeId> <slug> <tag>}"
TAG="${3:?usage: upgrade-customer.sh <composeId> <slug> <tag>}"
: "${DOKPLOY_API:?set DOKPLOY_API}" "${DOKPLOY_API_TOKEN:?set DOKPLOY_API_TOKEN}"
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,29}[a-z0-9]$ ]] || { echo "bad slug: $SLUG" >&2; exit 1; }

resp=$(curl -sS "${DOKPLOY_API}/compose.one?composeId=${COMPOSE_ID}" \
  -H "x-api-key: ${DOKPLOY_API_TOKEN}" -w '\n%{http_code}')
code=$(printf '%s' "$resp" | tail -n1)
body=$(printf '%s' "$resp" | sed '$d')
[ "$code" = "200" ] || { echo "ERROR: compose.one HTTP ${code}" >&2; exit 1; }
env_text=$(printf '%s' "$body" | jq -r '.env // ""')

if printf '%s\n' "$env_text" | grep -q '^IMAGE_TAG='; then
  new_env=$(printf '%s\n' "$env_text" | sed "s|^IMAGE_TAG=.*|IMAGE_TAG=${TAG}|")
else
  new_env=$(printf '%s\nIMAGE_TAG=%s\n' "$env_text" "$TAG")
fi

payload=$(jq -nc --arg id "$COMPOSE_ID" --arg env "$new_env" '{composeId: $id, env: $env}')
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${DOKPLOY_API}/compose.update" \
  -H "x-api-key: ${DOKPLOY_API_TOKEN}" -H "Content-Type: application/json" -d "$payload")
[ "$code" = "200" ] || { echo "ERROR: compose.update HTTP ${code}" >&2; exit 1; }

code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${DOKPLOY_API}/compose.deploy" \
  -H "x-api-key: ${DOKPLOY_API_TOKEN}" -H "Content-Type: application/json" \
  -d "{\"composeId\":\"${COMPOSE_ID}\"}")
[ "$code" = "200" ] || { echo "ERROR: compose.deploy HTTP ${code}" >&2; exit 1; }

echo "deploy triggered for ${SLUG} -> ${TAG}; polling health..."
deadline=$(( $(date +%s) + 600 ))
until curl -sSf "https://${SLUG}.leanior.com/api/health" >/dev/null 2>&1; do
  [ "$(date +%s)" -lt "$deadline" ] || { echo "ERROR: ${SLUG} unhealthy after upgrade" >&2; exit 1; }
  sleep 10
done
echo "upgraded ${SLUG} to ${TAG}"
