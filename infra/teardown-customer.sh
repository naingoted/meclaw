#!/usr/bin/env bash
# Tear down a customer stack: Dokploy compose app + containers + volumes.
# DESTRUCTIVE — deletes the customer's database. Take a final backup first.
# Usage: DOKPLOY_API=... DOKPLOY_API_TOKEN=... ./teardown-customer.sh <composeId> <slug>
set -euo pipefail

COMPOSE_ID="${1:?usage: teardown-customer.sh <composeId> <slug>}"
SLUG="${2:?usage: teardown-customer.sh <composeId> <slug>}"
: "${DOKPLOY_API:?set DOKPLOY_API}" "${DOKPLOY_API_TOKEN:?set DOKPLOY_API_TOKEN}"
: "${BASE_DOMAIN:?set BASE_DOMAIN (your apex domain for routing, e.g. example.com)}"
[[ "$SLUG" =~ ^[a-z0-9][a-z0-9-]{0,29}[a-z0-9]$ ]] || { echo "bad slug: $SLUG" >&2; exit 1; }

read -r -p "Delete stack meclaw-${SLUG} AND its data volumes? Type the slug to confirm: " confirm
[ "$confirm" = "$SLUG" ] || { echo "aborted"; exit 1; }

code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "${DOKPLOY_API}/compose.delete" \
  -H "x-api-key: ${DOKPLOY_API_TOKEN}" -H "Content-Type: application/json" \
  -d "$(jq -nc --arg id "$COMPOSE_ID" '{composeId: $id, deleteVolumes: true}')")
[ "$code" = "200" ] || { echo "ERROR: compose.delete HTTP ${code}" >&2; exit 1; }

echo "deleted. verifying endpoints are gone..."
sleep 10
chat_code=$(curl -s -o /dev/null -w '%{http_code}' "https://${SLUG}.${BASE_DOMAIN}/api/health" || true)
echo "chat health now returns: ${chat_code} (expect 404/502/000)"
echo "if volumes linger, on the box: docker volume ls | grep meclaw-${SLUG}"
