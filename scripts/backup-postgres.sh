#!/usr/bin/env bash
set -euo pipefail

: "${SCAN_DATABASE_URL:?Set SCAN_DATABASE_URL to a PostgreSQL connection URI}"
: "${SCAN_BACKUP_DIR:?Set SCAN_BACKUP_DIR to a protected backup directory}"

command -v pg_dump >/dev/null || { echo "pg_dump is required" >&2; exit 1; }
command -v shasum >/dev/null || { echo "shasum is required" >&2; exit 1; }

mkdir -p "$SCAN_BACKUP_DIR"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_path="$SCAN_BACKUP_DIR/scan-$timestamp.dump"

umask 077
pg_dump --dbname="$SCAN_DATABASE_URL" --format=custom --no-owner --no-acl --file="$backup_path"
shasum -a 256 "$backup_path" > "$backup_path.sha256"
pg_restore --list "$backup_path" >/dev/null

echo "Backup verified: $backup_path"
