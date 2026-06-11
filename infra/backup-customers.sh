#!/usr/bin/env bash
# Nightly pg_dump of every meclaw stack (owner + customers) on this box.
# Discovers postgres containers by the explicit `com.meclaw.backup=true` label
# (set on each postgres service in docker-compose.dokploy.yml and
# docker-compose.customer.yml). We can't rely on compose-project label matching
# because Dokploy overrides the compose file's `name:` field with its own
# internal `compose-<id>` naming.
#
# Install on the box:
#   sudo install -m 0755 backup-customers.sh /usr/local/bin/meclaw-backup
#   sudo mkdir -p /var/backups/meclaw
#   echo '15 3 * * * root /usr/local/bin/meclaw-backup >> /var/log/meclaw-backup.log 2>&1' \
#     | sudo tee /etc/cron.d/meclaw-backup
#
# Optional offsite copy: export MECLAW_BACKUP_S3=s3://bucket/path (needs aws cli
# + instance role or credentials on the box).
set -euo pipefail

# Owner-only permissions on newly created dirs and files.
umask 077

BACKUP_DIR="${MECLAW_BACKUP_DIR:-/var/backups/meclaw}"
RETENTION_DAYS="${MECLAW_BACKUP_RETENTION_DAYS:-7}"
S3_TARGET="${MECLAW_BACKUP_S3:-}"
STAMP=$(date +%Y%m%d-%H%M%S)

# Fail fast if docker daemon is unreachable — avoids cryptic errors below.
if ! docker ps > /dev/null 2>&1; then
  echo "ERROR: docker daemon unreachable" >&2
  exit 2
fi

mkdir -p "$BACKUP_DIR"

# Discover postgres containers by the explicit marker label. Both the owner
# compose (docker-compose.dokploy.yml) and customer compose
# (docker-compose.customer.yml) set `com.meclaw.backup=true` on their postgres
# service. This is robust to Dokploy's compose-project name overrides.
mapfile -t containers < <(docker ps \
  --filter "label=com.meclaw.backup=true" \
  --format '{{.ID}} {{.Label "com.docker.compose.project"}}')

if [ "${#containers[@]}" -eq 0 ]; then
  echo "ERROR: no containers with label com.meclaw.backup=true — check compose files" >&2
  exit 1
fi

failed=0
for entry in "${containers[@]}"; do
  cid=${entry%% *}
  project=${entry#* }
  out="${BACKUP_DIR}/${project}-${STAMP}.sql.gz"
  echo "dumping ${project} -> ${out}"
  # Assumes POSTGRES_USER=meclaw and POSTGRES_DB=meclaw (compose file defaults).
  # If a customer overrides these, their DB won't be backed up until this is updated.
  #
  # pg_dump is run via `docker exec` against the running postgres container. The
  # pg_dump client version matches the server (pgvector:pg16 image → pg_dump from
  # pg16) because it's the SAME container. If a stack overrides the postgres
  # image to a different major version, pg_dump may need updating to match.
  if docker exec "$cid" pg_dump -U meclaw meclaw | gzip > "$out"; then
    [ "$(stat -c%s "$out")" -gt 1024 ] || { echo "WARN: ${out} suspiciously small"; failed=1; }
  else
    echo "ERROR: pg_dump failed for ${project}"
    rm -f "$out"
    failed=1
  fi
done

# -mtime +N: files modified more than N*24h ago. With N=7, this keeps ~7 days of dumps.
find "$BACKUP_DIR" -name '*.sql.gz' -mtime "+${RETENTION_DAYS}" -delete

if [ -n "$S3_TARGET" ]; then
  # Sync without --delete: S3 becomes an append-only archive (retention here is
  # independent of local MECLAW_BACKUP_RETENTION_DAYS). Prune S3 separately if
  # you want parity with the local window.
  aws s3 sync "$BACKUP_DIR" "$S3_TARGET" --exclude '*' --include '*.sql.gz' || failed=1
fi

exit "$failed"
