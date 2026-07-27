#!/usr/bin/env sh
set -eu

echo "Staging deployment is disabled: DEC-0248 requires the root-owned ogfi-release request-spool orchestrator, which is not yet installed." >&2
exit 78
