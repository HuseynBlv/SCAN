#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_dir="$(cd -- "$script_dir/.." && pwd)"
env_file="${SCAN_ENV_FILE:-$repo_dir/.env.neon}"

if [[ -f "$env_file" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$env_file"
  set +a
fi

if ! command -v neon >/dev/null 2>&1; then
  echo "Neon CLI is required. Install it and run: neon auth" >&2
  exit 1
fi

if ! command -v mvn >/dev/null 2>&1; then
  echo "Maven is required to start scan-api." >&2
  exit 1
fi

: "${SCAN_ADMIN_PASSWORD:?Set SCAN_ADMIN_PASSWORD in the environment or .env.neon}"
: "${SCAN_CCI_PASSWORD:?Set SCAN_CCI_PASSWORD in the environment or .env.neon}"
: "${SCAN_INGEST_PASSWORD:?Set SCAN_INGEST_PASSWORD in the environment or .env.neon}"
: "${SCAN_RETAILER_PASSWORD:?Set SCAN_RETAILER_PASSWORD in the environment or .env.neon}"

project_id="${SCAN_NEON_PROJECT_ID:-withered-darkness-12839995}"
branch="${SCAN_NEON_BRANCH:-production}"
role="${SCAN_NEON_ROLE:-scan_app}"
database="${SCAN_NEON_DATABASE:-scan}"

# The direct connection is intentional: the same datasource runs Flyway migrations.
# The credential is retrieved from Neon at startup and remains only in this process tree.
neon_uri="$(
  neon connection-string "$branch" \
    --project-id "$project_id" \
    --role-name "$role" \
    --database-name "$database" \
    --ssl require
)"

case "$neon_uri" in
  postgresql://*:*@*/*) ;;
  *)
    echo "Neon CLI returned an unexpected connection string." >&2
    exit 1
    ;;
esac

connection="${neon_uri#postgresql://}"
userinfo="${connection%%@*}"
host_and_path="${connection#*@}"
authority="${host_and_path%%/*}"
database_and_query="${host_and_path#*/}"
resolved_database="${database_and_query%%\?*}"

export SCAN_DB_USERNAME="${userinfo%%:*}"
export SCAN_DB_PASSWORD="${userinfo#*:}"
export SCAN_DB_URL="jdbc:postgresql://${authority}/${resolved_database}?sslmode=verify-full&sslfactory=org.postgresql.ssl.DefaultJavaSSLFactory"
unset neon_uri connection userinfo host_and_path database_and_query authority resolved_database

echo "Starting SCAN API with Neon project $project_id, branch $branch, database $database, role $role."
echo "No database password was written to disk."

cd "$repo_dir/scan-api"
exec mvn spring-boot:run "$@"
