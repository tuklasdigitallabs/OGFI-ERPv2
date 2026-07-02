#!/usr/bin/env sh
set -eu

fail() {
  echo "Secret review failed: $1" >&2
  exit 1
}

tracked_files="$(git ls-files)"

echo "$tracked_files" | while IFS= read -r file; do
  case "$file" in
    .env.example|.env.staging.example|.env.production.example)
      ;;
    .env|.env.*)
      fail "tracked environment file is not allowed: $file"
      ;;
    *.pem|*.key|*.p12|*.pfx)
      fail "tracked private key/certificate artifact is not allowed: $file"
      ;;
  esac
done

if git grep -n -I -E '(BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]+)' -- . ':!pnpm-lock.yaml' >/tmp/ogfi-secret-review.txt; then
  cat /tmp/ogfi-secret-review.txt >&2
  fail "high-risk secret pattern found in tracked files"
fi

if git grep -n -I -E '(DATABASE_URL|DIRECT_DATABASE_URL|S3_SECRET_ACCESS_KEY|AUTH_SECRET|APP_ENCRYPTION_KEY|ERROR_MONITORING_DSN)=([^[:space:]]+)' -- ':!.env.example' ':!.env.staging.example' ':!.env.production.example' ':!pnpm-lock.yaml' >/tmp/ogfi-secret-review.txt; then
  cat /tmp/ogfi-secret-review.txt >&2
  fail "environment-style secret assignment found outside approved templates"
fi

echo "Secret review passed: no tracked env files, key artifacts, or high-risk secret patterns found."
