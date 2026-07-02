#!/usr/bin/env sh
set -eu

if [ -z "${RESTORE_DATABASE_URL:-}" ]; then
  echo "RESTORE_DATABASE_URL is required and must point to an isolated non-production database." >&2
  exit 1
fi

PG_RESTORE_CMD="${PG_RESTORE_BIN:-${POSTGRES_PG_RESTORE_BIN:-pg_restore}}"
PSQL_CMD="${PSQL_BIN:-${POSTGRES_PSQL_BIN:-psql}}"

if ! "$PG_RESTORE_CMD" --version >/dev/null 2>&1; then
  echo "pg_restore is required. Install PostgreSQL client tools, add pg_restore to PATH, or set PG_RESTORE_BIN to the full executable path before running db:restore-check." >&2
  exit 1
fi

if ! "$PSQL_CMD" --version >/dev/null 2>&1; then
  echo "psql is required. Install PostgreSQL client tools, add psql to PATH, or set PSQL_BIN to the full executable path before running db:restore-check." >&2
  exit 1
fi

if [ -z "${BACKUP_FILE:-}" ]; then
  echo "BACKUP_FILE is required." >&2
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

if [ "${ALLOW_RESTORE_TO_PRODUCTION:-no}" != "yes" ]; then
  RESTORE_TARGET_LOWER=$(printf '%s' "$RESTORE_DATABASE_URL" | tr '[:upper:]' '[:lower:]')
  case "$RESTORE_TARGET_LOWER" in
    *prod*|*production*|*live*)
      echo "Refusing restore check against a database URL that looks production-like." >&2
      exit 1
      ;;
  esac

  case "$RESTORE_TARGET_LOWER" in
    *restore*|*rehearsal*|*sandbox*|*staging*|*stage*|*test*|*testing*|*dev*|*development*|*local*|*isolated*)
      ;;
    *)
      echo "Refusing restore check because RESTORE_DATABASE_URL does not include an isolated restore/rehearsal/staging/test/dev/local marker." >&2
      exit 1
      ;;
  esac

  if [ -n "${DATABASE_URL:-}" ] && [ "$DATABASE_URL" = "$RESTORE_DATABASE_URL" ]; then
    echo "Refusing restore check because RESTORE_DATABASE_URL matches DATABASE_URL exactly." >&2
    exit 1
  fi
fi

"$PG_RESTORE_CMD" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$RESTORE_DATABASE_URL" \
  "$BACKUP_FILE"

"$PSQL_CMD" "$RESTORE_DATABASE_URL" \
  --set=ON_ERROR_STOP=1 \
  --command="select current_database() as restored_database, now() as verified_at;"

echo "Restore check completed from: $BACKUP_FILE"
