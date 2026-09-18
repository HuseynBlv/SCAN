#!/usr/bin/env bash
set -euo pipefail

: "${SCAN_BASE_URL:?Set SCAN_BASE_URL to the deployed SCAN origin}"
: "${SCAN_ADMIN_USERNAME:?Set SCAN_ADMIN_USERNAME}"
: "${SCAN_ADMIN_PASSWORD:?Set SCAN_ADMIN_PASSWORD}"
: "${SCAN_MAX_QUEUE_AGE_MINUTES:=15}"

command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

curl --fail --silent --show-error --max-time 10 "$SCAN_BASE_URL/health" >/dev/null
operations=$(curl --fail --silent --show-error --max-time 20 \
  --user "$SCAN_ADMIN_USERNAME:$SCAN_ADMIN_PASSWORD" \
  "$SCAN_BASE_URL/api/v1/imports/operations")

printf '%s\n' "$operations"
if [[ $(printf '%s' "$operations" | jq '.failed') -gt 0 ]]; then
  echo "SCAN has import jobs that failed within the last 24 hours." >&2
  exit 2
fi

queue_age_seconds=$(printf '%s' "$operations" | jq --argjson now "$(date +%s)" '
  if .oldestQueuedAt then
    $now - (.oldestQueuedAt | sub("\\.[0-9]+Z$"; "Z") | fromdateiso8601)
  else 0 end | floor
')
if [[ "$queue_age_seconds" -gt $((SCAN_MAX_QUEUE_AGE_MINUTES * 60)) ]]; then
  echo "SCAN has an import queued longer than ${SCAN_MAX_QUEUE_AGE_MINUTES} minutes." >&2
  exit 3
fi
