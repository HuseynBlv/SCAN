#!/usr/bin/env bash
# Wake a hosted SCAN service and its database before a presentation. Read-only: it only issues GETs.
# Run 10-15 minutes ahead. /health alone wakes Render but not Neon, so this also signs in and reads
# one analytics view per role, which forces the first database query.
#
#   SCAN_RETAILER_PASSWORD=... SCAN_CCI_PASSWORD=... scripts/warm-demo.sh
#   SCAN_BASE_URL=https://scan-caspos-pilot.onrender.com scripts/warm-demo.sh
set -euo pipefail

: "${SCAN_BASE_URL:=https://scan-demo.onrender.com}"
SCAN_BASE_URL="${SCAN_BASE_URL%/}"
: "${SCAN_WARM_MAX_WAIT_SECONDS:=300}"
: "${SCAN_RETAILER_USERNAME:=scan-retailer}"
: "${SCAN_CCI_USERNAME:=scan-cci}"

for dependency in curl jq; do
  command -v "$dependency" >/dev/null || { printf 'Missing command: %s\n' "$dependency" >&2; exit 1; }
done

tmp_response="$(mktemp "${TMPDIR:-/tmp}/scan-warm.XXXXXX")"
trap 'rm -f "$tmp_response"' EXIT

failures=0

# Passwords go to curl through a config on stdin so they never appear in the process list.
authed_get() {
  local user="$1" pass="$2" path="$3"
  user="${user//\\/\\\\}"; user="${user//\"/\\\"}"
  pass="${pass//\\/\\\\}"; pass="${pass//\"/\\\"}"
  printf 'user = "%s:%s"\n' "$user" "$pass" | curl --silent --show-error --max-time 90 --config - \
    --output "$tmp_response" --write-out '%{http_code} %{time_total}' "$SCAN_BASE_URL$path"
}

# Prints "<seconds>s" on success; returns 1 for an unexpected status.
timed_call() {
  local label="$1" user="$2" pass="$3" path="$4" result code seconds
  result="$(authed_get "$user" "$pass" "$path" || true)"
  code="${result%% *}"
  seconds="${result##* }"
  case "$code" in
    200) printf '  %-28s ok    %ss\n' "$label" "$seconds" ;;
    401) printf '  %-28s FAIL  401: wrong username or password\n' "$label" >&2; return 1 ;;
    403) printf '  %-28s FAIL  403: role lacks access or CCI sharing is off\n' "$label" >&2; return 1 ;;
    *)   printf '  %-28s FAIL  HTTP %s\n' "$label" "${code:-none}" >&2; return 1 ;;
  esac
}

printf 'Warming %s\n' "$SCAN_BASE_URL"

printf '1. Waking the web service (a cold start takes 30-60 s)...\n'
deadline=$((SECONDS + SCAN_WARM_MAX_WAIT_SECONDS))
until seconds="$(curl --silent --fail --max-time 30 --output /dev/null --write-out '%{time_total}' \
  "$SCAN_BASE_URL/health")"; do
  if [ "$SECONDS" -ge "$deadline" ]; then
    printf 'FAIL: /health did not answer within %s seconds.\n' "$SCAN_WARM_MAX_WAIT_SECONDS" >&2
    exit 1
  fi
  sleep 5
done
printf '  /health                      ok    %ss\n' "$seconds"

printf '2. Waking the database through authenticated analytics...\n'
ran_authenticated=0

if [ -n "${SCAN_RETAILER_PASSWORD:-}" ]; then
  ran_authenticated=1
  path='/api/v1/retailer/overview?period=ALL_TIME'
  if timed_call 'retailer overview (first)' "$SCAN_RETAILER_USERNAME" "$SCAN_RETAILER_PASSWORD" "$path"; then
    timed_call 'retailer overview (warm)' "$SCAN_RETAILER_USERNAME" "$SCAN_RETAILER_PASSWORD" "$path" || failures=$((failures + 1))
  else
    failures=$((failures + 1))
  fi
fi

if [ -n "${SCAN_CCI_PASSWORD:-}" ]; then
  ran_authenticated=1
  retailer_code="${SCAN_CCI_RETAILER_CODE:-}"
  if [ -z "$retailer_code" ]; then
    if timed_call 'cci context' "$SCAN_CCI_USERNAME" "$SCAN_CCI_PASSWORD" '/api/v1/analytics/context'; then
      retailer_code="$(jq --raw-output '.retailers[0].code // empty' "$tmp_response")"
    else
      failures=$((failures + 1))
    fi
  fi
  if [ -n "$retailer_code" ]; then
    path="/api/v1/analytics/overview?retailerCode=$(jq --null-input --raw-output --arg c "$retailer_code" '$c|@uri')"
    if timed_call 'cci overview (first)' "$SCAN_CCI_USERNAME" "$SCAN_CCI_PASSWORD" "$path"; then
      timed_call 'cci overview (warm)' "$SCAN_CCI_USERNAME" "$SCAN_CCI_PASSWORD" "$path" || failures=$((failures + 1))
    else
      failures=$((failures + 1))
    fi
  elif [ "$failures" -eq 0 ]; then
    printf '  cci overview                 FAIL  no retailer is shared with this account\n' >&2
    failures=$((failures + 1))
  fi
fi

if [ "$ran_authenticated" -eq 0 ]; then
  printf '  skipped: set SCAN_RETAILER_PASSWORD and/or SCAN_CCI_PASSWORD.\n'
  printf '  WARNING: only the web service is awake. The database can still be cold on first sign-in.\n'
  exit 0
fi

if [ "$failures" -gt 0 ]; then
  printf 'Not ready: %s check(s) failed.\n' "$failures" >&2
  exit 1
fi
printf 'Ready. The "(warm)" times are what the audience will see.\n'
