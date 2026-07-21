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
require_env ROLLBACK_RELEASE_VERSION

SSH_TARGET="${STAGING_USER}@${STAGING_HOST}"
REMOTE_RELEASE_DIR="${STAGING_APP_DIR}/releases/${ROLLBACK_RELEASE_VERSION}"
REMOTE_CURRENT_LINK="${STAGING_APP_DIR}/current"
STAGING_COMPOSE_ENV_FILE_VALUE="${STAGING_COMPOSE_ENV_FILE:-${STAGING_APP_DIR}/shared/staging.compose.env}"

if [ "${CONFIRM_STAGING_ROLLBACK:-no}" != "yes" ]; then
  echo "Set CONFIRM_STAGING_ROLLBACK=yes after rollback approval is recorded." >&2
  exit 1
fi

ssh "$SSH_TARGET" "
  set -eu
  test -d '$REMOTE_RELEASE_DIR'
  ln -sfn '$REMOTE_RELEASE_DIR' '$REMOTE_CURRENT_LINK'
  cd '$REMOTE_RELEASE_DIR'
  mkdir -p release-evidence/staging-rollback
  test -f '$STAGING_COMPOSE_ENV_FILE_VALUE'
  node --env-file='$STAGING_COMPOSE_ENV_FILE_VALUE' scripts/evidence-hostinger-contract.mjs
  {
    echo 'rollback_release_version=${ROLLBACK_RELEASE_VERSION}'
    date -u +\"rolled_back_at_utc=%Y-%m-%dT%H:%M:%SZ\"
  } > release-evidence/staging-rollback/rollback-command.txt
  docker compose --env-file '$STAGING_COMPOSE_ENV_FILE_VALUE' \
    -f docker-compose.yml \
    -f infra/hostinger/evidence/compose.production.yaml \
    config >release-evidence/staging-rollback/rendered-compose.yml
  docker compose --env-file '$STAGING_COMPOSE_ENV_FILE_VALUE' \
    -f docker-compose.yml \
    -f infra/hostinger/evidence/compose.production.yaml \
    up -d web caddy evidence-broker clamd
"

echo "Staging rollback completed: $ROLLBACK_RELEASE_VERSION"
