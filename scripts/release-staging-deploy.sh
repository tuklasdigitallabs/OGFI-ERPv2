#!/usr/bin/env sh
set -eu

require_env() {
  if [ -z "$(eval "printf '%s' \"\${$1:-}\"")" ]; then
    echo "$1 is required." >&2
    exit 1
  fi
}

require_env STAGING_HOST
require_env STAGING_USER
require_env STAGING_APP_DIR
require_env RELEASE_VERSION

SSH_TARGET="${STAGING_USER}@${STAGING_HOST}"
REMOTE_RELEASE_DIR="${STAGING_APP_DIR}/releases/${RELEASE_VERSION}"
REMOTE_CURRENT_LINK="${STAGING_APP_DIR}/current"
STAGING_CAPTURE_DATA_SNAPSHOTS_VALUE="${STAGING_CAPTURE_DATA_SNAPSHOTS:-yes}"
STAGING_COMPOSE_ENV_FILE_VALUE="${STAGING_COMPOSE_ENV_FILE:-${STAGING_APP_DIR}/shared/staging.compose.env}"

if [ "${CONFIRM_STAGING_DEPLOY:-no}" != "yes" ]; then
  echo "Set CONFIRM_STAGING_DEPLOY=yes after backup and release approval are recorded." >&2
  exit 1
fi

ssh "$SSH_TARGET" "mkdir -p '$REMOTE_RELEASE_DIR'"
tar \
  --exclude='.git' \
  --exclude='node_modules' \
  --exclude='apps/web/.next*' \
  --exclude='backups' \
  --exclude='logs' \
  -czf - . | ssh "$SSH_TARGET" "tar -xzf - -C '$REMOTE_RELEASE_DIR'"

ssh "$SSH_TARGET" "
  set -eu
  cd '$REMOTE_RELEASE_DIR'
  pnpm install --frozen-lockfile
  pnpm db:generate
  mkdir -p release-evidence/staging-deploy
  test -f '$STAGING_COMPOSE_ENV_FILE_VALUE'
  node --env-file='$STAGING_COMPOSE_ENV_FILE_VALUE' scripts/evidence-hostinger-contract.mjs
  PSQL_CMD=\"\${PSQL_BIN:-\${POSTGRES_PSQL_BIN:-psql}}\"
  RELEASE_DATA_SNAPSHOT_LABEL=pre-migration-${RELEASE_VERSION} \
  RELEASE_DATA_SNAPSHOT_OUTPUT_DIR=release-evidence/staging-deploy/data-snapshots \
  RELEASE_DATA_SNAPSHOT_ALLOW_MISSING_TABLES=yes \
  pnpm release:data-snapshot-preflight
  if [ '$STAGING_CAPTURE_DATA_SNAPSHOTS_VALUE' = 'yes' ] && \"\$PSQL_CMD\" --version >/dev/null 2>&1; then
    RELEASE_DATA_SNAPSHOT_LABEL=pre-migration-${RELEASE_VERSION} \
    RELEASE_DATA_SNAPSHOT_OUTPUT_DIR=release-evidence/staging-deploy/data-snapshots \
    RELEASE_DATA_SNAPSHOT_ALLOW_MISSING_TABLES=yes \
    pnpm release:data-snapshot
  else
    echo 'Skipping pre-migration data snapshot because STAGING_CAPTURE_DATA_SNAPSHOTS is not yes or psql/PSQL_BIN is not available.'
  fi
  pnpm db:migrate:deploy
  if [ '$STAGING_CAPTURE_DATA_SNAPSHOTS_VALUE' = 'yes' ] && \"\$PSQL_CMD\" --version >/dev/null 2>&1; then
    RELEASE_DATA_SNAPSHOT_LABEL=post-migration-${RELEASE_VERSION} \
    RELEASE_DATA_SNAPSHOT_OUTPUT_DIR=release-evidence/staging-deploy/data-snapshots \
    pnpm release:data-snapshot
  else
    echo 'Skipping post-migration data snapshot because STAGING_CAPTURE_DATA_SNAPSHOTS is not yes or psql/PSQL_BIN is not available.'
  fi
  docker compose --env-file '$STAGING_COMPOSE_ENV_FILE_VALUE' \
    -f docker-compose.yml \
    -f infra/hostinger/evidence/compose.production.yaml \
    config >release-evidence/staging-deploy/rendered-compose.yml
  docker compose --env-file '$STAGING_COMPOSE_ENV_FILE_VALUE' \
    -f docker-compose.yml \
    -f infra/hostinger/evidence/compose.production.yaml \
    up -d web caddy evidence-broker clamd
  ln -sfn '$REMOTE_RELEASE_DIR' '$REMOTE_CURRENT_LINK'
"

echo "Staging deploy completed: $RELEASE_VERSION"
