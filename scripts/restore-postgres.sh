#!/usr/bin/env bash
set -euo pipefail

: "${SCAN_RESTORE_DATABASE_URL:?Set SCAN_RESTORE_DATABASE_URL to a new empty PostgreSQL database}"
: "${SCAN_RESTORE_FILE:?Set SCAN_RESTORE_FILE to a verified .dump backup}"
: "${SCAN_RESTORE_CONFIRM:?Set SCAN_RESTORE_CONFIRM=RESTORE_TO_EMPTY_DATABASE}"

if [[ "$SCAN_RESTORE_CONFIRM" != "RESTORE_TO_EMPTY_DATABASE" ]]; then
  echo "Restore confirmation does not match." >&2
  exit 1
fi

command -v pg_restore >/dev/null || { echo "pg_restore is required" >&2; exit 1; }
command -v psql >/dev/null || { echo "psql is required" >&2; exit 1; }
command -v shasum >/dev/null || { echo "shasum is required" >&2; exit 1; }
test -f "$SCAN_RESTORE_FILE"
test -f "$SCAN_RESTORE_FILE.sha256"

if [[ -n "${SCAN_DATABASE_URL:-}" && "$SCAN_RESTORE_DATABASE_URL" == "$SCAN_DATABASE_URL" ]]; then
  echo "Refusing to restore to the configured active SCAN database." >&2
  exit 1
fi

existing_tables=$(psql "$SCAN_RESTORE_DATABASE_URL" --no-psqlrc --tuples-only --no-align \
  --command="select count(*) from pg_catalog.pg_tables where schemaname not in ('pg_catalog', 'information_schema')")
if [[ "$existing_tables" != "0" ]]; then
  echo "Restore target is not empty; create a new database and try again." >&2
  exit 1
fi

(cd "$(dirname "$SCAN_RESTORE_FILE")" && shasum -a 256 -c "$(basename "$SCAN_RESTORE_FILE").sha256")
pg_restore --dbname="$SCAN_RESTORE_DATABASE_URL" --exit-on-error --no-owner --no-acl "$SCAN_RESTORE_FILE"

echo "Restore completed. Start SCAN against this database with a new SCAN_DATABASE_ID and verify before cutover."
