#!/usr/bin/env sh
set -eu

echo "Staging rollback is disabled: DEC-0248 requires rollback through the same root-owned release fence and recovery journal." >&2
exit 78
