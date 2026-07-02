#!/usr/bin/env sh
set -eu

if [ -z "${DATABASE_URL:-}" ]; then
  echo "DATABASE_URL is required." >&2
  exit 1
fi

PG_DUMP_CMD="${PG_DUMP_BIN:-${POSTGRES_PG_DUMP_BIN:-pg_dump}}"

if ! "$PG_DUMP_CMD" --version >/dev/null 2>&1; then
  echo "pg_dump is required. Install PostgreSQL client tools, add pg_dump to PATH, or set PG_DUMP_BIN to the full executable path before running db:backup." >&2
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_FILE="${BACKUP_FILE:-$BACKUP_DIR/ogfi-erp-$TIMESTAMP.dump}"

mkdir -p "$BACKUP_DIR"

"$PG_DUMP_CMD" "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$BACKUP_FILE"

if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "$BACKUP_FILE" > "$BACKUP_FILE.sha256"
fi

echo "Backup written: $BACKUP_FILE"
