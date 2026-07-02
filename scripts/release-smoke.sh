#!/usr/bin/env sh
set -eu

BASE_URL="${SMOKE_BASE_URL:-http://localhost:3000}"
OUTPUT_DIR="${SMOKE_OUTPUT_DIR:-release-evidence/smoke}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUTPUT_FILE="${SMOKE_OUTPUT_FILE:-$OUTPUT_DIR/smoke-$TIMESTAMP.txt}"

mkdir -p "$OUTPUT_DIR"

request() {
  label="$1"
  path="$2"
  expected_status="$3"
  url="${BASE_URL%/}$path"

  status="$(curl -sS -o /tmp/ogfi-smoke-body.txt -w '%{http_code}' "$url")"
  printf '%s %s %s expected=%s actual=%s\n' "$TIMESTAMP" "$label" "$path" "$expected_status" "$status" | tee -a "$OUTPUT_FILE"

  case "$expected_status" in
    "$status")
      ;;
    2xx)
      case "$status" in
        2*) ;;
        *)
          echo "Smoke check failed for $label: expected $expected_status, got $status" >&2
          exit 1
          ;;
      esac
      ;;
    3xx)
      case "$status" in
        3*) ;;
        *)
          echo "Smoke check failed for $label: expected $expected_status, got $status" >&2
          exit 1
          ;;
      esac
      ;;
    *)
      echo "Smoke check failed for $label: expected $expected_status, got $status" >&2
      exit 1
      ;;
  esac
}

{
  echo "OGFI ERP smoke evidence"
  echo "base_url=$BASE_URL"
  echo "started_at_utc=$TIMESTAMP"
} > "$OUTPUT_FILE"

request "api-health" "/api/health" "200"
request "api-readiness" "/api/readiness" "200"
request "health" "/health" "200"
request "readiness" "/readiness" "200"
request "sign-in-page" "/sign-in" "2xx"
request "protected-items-route" "/items" "3xx"

echo "Smoke evidence written: $OUTPUT_FILE"
