#!/usr/bin/env bash
# Test only a new, disposable PostgreSQL container. Never uses SCAN_DB_* from the host.
set -euo pipefail

SCAN_SMOKE_IMAGE="${1:-scan-demo:local}"
SCAN_SMOKE_REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCAN_SMOKE_ID="scan-smoke-$(date +%s)-$$"
SCAN_SMOKE_NETWORK="${SCAN_SMOKE_ID}-net"
SCAN_SMOKE_DB="${SCAN_SMOKE_ID}-db"
SCAN_SMOKE_APP="${SCAN_SMOKE_ID}-app"
SCAN_SMOKE_TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/scan-smoke.XXXXXX")"
SCAN_SMOKE_NETWORK_CREATED=0
SCAN_SMOKE_DB_CREATED=0
SCAN_SMOKE_APP_CREATED=0

cleanup() {
  local exit_code=$?
  trap - EXIT
  if [ "$exit_code" -ne 0 ] && [ "$SCAN_SMOKE_APP_CREATED" -eq 1 ]; then
    docker logs --tail 60 "$SCAN_SMOKE_APP" || true
  fi
  if [ "$SCAN_SMOKE_APP_CREATED" -eq 1 ]; then docker stop "$SCAN_SMOKE_APP" >/dev/null || true; fi
  if [ "$SCAN_SMOKE_DB_CREATED" -eq 1 ]; then docker stop "$SCAN_SMOKE_DB" >/dev/null || true; fi
  if [ "$SCAN_SMOKE_NETWORK_CREATED" -eq 1 ]; then docker network rm "$SCAN_SMOKE_NETWORK" >/dev/null || true; fi
  rm -f "$SCAN_SMOKE_TMP_DIR/response"
  rmdir "$SCAN_SMOKE_TMP_DIR"
  exit "$exit_code"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

for dependency in docker curl jq; do
  command -v "$dependency" >/dev/null || { printf 'Missing command: %s\n' "$dependency" >&2; exit 1; }
done

expect_http() {
  local expected="$1"
  shift
  local actual
  actual="$(curl --silent --show-error --max-time 180 --output "$SCAN_SMOKE_TMP_DIR/response" --write-out '%{http_code}' "$@")"
  if [ "$actual" != "$expected" ]; then
    printf 'Expected HTTP %s; got %s\n' "$expected" "$actual" >&2
    sed -n '1,20p' "$SCAN_SMOKE_TMP_DIR/response" >&2
    return 1
  fi
}

assert_json() {
  jq --exit-status "$1" "$SCAN_SMOKE_TMP_DIR/response" >/dev/null
}

resolve_app_url() {
  # Docker can assign a different ephemeral host port after an app restart.
  SCAN_SMOKE_PORT="$(docker port "$SCAN_SMOKE_APP" 10000/tcp)"
  SCAN_SMOKE_PORT="${SCAN_SMOKE_PORT##*:}"
  [[ "$SCAN_SMOKE_PORT" =~ ^[0-9]+$ ]]
  SCAN_SMOKE_URL="http://127.0.0.1:$SCAN_SMOKE_PORT"
}

wait_for_app() {
  local attempt
  for attempt in {1..90}; do
    if curl --silent --fail --max-time 2 "$SCAN_SMOKE_URL/health" > /dev/null; then return 0; fi
    if [ "$(docker inspect --format '{{.State.Running}}' "$SCAN_SMOKE_APP" 2>/dev/null)" != true ]; then
      printf 'Application container stopped before becoming healthy.\n' >&2
      return 1
    fi
    sleep 2
  done
  printf 'Timed out waiting for application liveness.\n' >&2
  return 1
}

printf 'Starting isolated PostgreSQL and a 512 MB SCAN container...\n'
docker network create "$SCAN_SMOKE_NETWORK" >/dev/null
SCAN_SMOKE_NETWORK_CREATED=1
docker run --detach --rm --name "$SCAN_SMOKE_DB" \
  --network "$SCAN_SMOKE_NETWORK" --network-alias db \
  --tmpfs /var/lib/postgresql/data \
  --env POSTGRES_DB=scan_smoke --env POSTGRES_USER=scan_smoke \
  --env POSTGRES_PASSWORD=smoke-only-db-password postgres:17-bookworm >/dev/null
SCAN_SMOKE_DB_CREATED=1
for attempt in {1..60}; do
  if docker exec "$SCAN_SMOKE_DB" pg_isready -h 127.0.0.1 -U scan_smoke -d scan_smoke >/dev/null; then break; fi
  sleep 1
done
docker exec "$SCAN_SMOKE_DB" pg_isready -h 127.0.0.1 -U scan_smoke -d scan_smoke >/dev/null

docker run --detach --rm --name "$SCAN_SMOKE_APP" \
  --network "$SCAN_SMOKE_NETWORK" --memory=512m --memory-swap=512m \
  --read-only --tmpfs /tmp:rw,nosuid,size=96m \
  --publish 127.0.0.1::10000 --env PORT=10000 \
  --env SCAN_DB_URL=jdbc:postgresql://db:5432/scan_smoke \
  --env SCAN_DB_USERNAME=scan_smoke --env SCAN_DB_PASSWORD=smoke-only-db-password \
  --env SCAN_ADMIN_PASSWORD=smoke-only-admin-password \
  --env SCAN_CCI_PASSWORD=smoke-only-cci-password "$SCAN_SMOKE_IMAGE" >/dev/null
SCAN_SMOKE_APP_CREATED=1
resolve_app_url
wait_for_app

printf 'Checking health, real frontend assets, and API permissions...\n'
expect_http 200 "$SCAN_SMOKE_URL/health"
assert_json '. == {"status":"UP"}'
expect_http 200 "$SCAN_SMOKE_URL/"
grep -q '<title>SCAN | Basket Intelligence</title>' "$SCAN_SMOKE_TMP_DIR/response"
SCAN_SMOKE_ASSET="$(sed -nE 's/.*src="([^"]+\.js)".*/\1/p' "$SCAN_SMOKE_TMP_DIR/response")"
[[ "$SCAN_SMOKE_ASSET" == /assets/* && "$SCAN_SMOKE_ASSET" != *$'\n'* ]]
expect_http 200 "$SCAN_SMOKE_URL$SCAN_SMOKE_ASSET"
expect_http 401 "$SCAN_SMOKE_URL/api/v1/analytics/overview?retailerCode=DEMO"
expect_http 401 --user scan-cci:wrong "$SCAN_SMOKE_URL/api/v1/analytics/overview?retailerCode=DEMO"
expect_http 403 --user scan-cci:smoke-only-cci-password "$SCAN_SMOKE_URL/api/v1/product-mappings/catalog"
expect_http 404 --user scan-cci:smoke-only-cci-password "$SCAN_SMOKE_URL/api/v1/unknown"
expect_http 200 --user scan-cci:smoke-only-cci-password "$SCAN_SMOKE_URL/api/v1/analytics/overview?retailerCode=DEMO"
assert_json '.totalBaskets == 0'

SCAN_SMOKE_FIXTURE="$SCAN_SMOKE_REPO_DIR/scan-api/src/test/resources/fixtures/canonical-transactions.csv"
expect_http 403 --user scan-cci:smoke-only-cci-password \
  -F retailerCode=DEMO -F profileCode=CANONICAL -F "file=@$SCAN_SMOKE_FIXTURE" "$SCAN_SMOKE_URL/api/v1/imports"
expect_http 201 --user scan-admin:smoke-only-admin-password \
  -F retailerCode=DEMO -F profileCode=CANONICAL -F "file=@$SCAN_SMOKE_FIXTURE" "$SCAN_SMOKE_URL/api/v1/imports"
assert_json '.status == "COMPLETED" and .importedReceipts == 6 and .importedLines == 11'
SCAN_SMOKE_JOB_ID="$(jq --raw-output .id "$SCAN_SMOKE_TMP_DIR/response")"
expect_http 403 --user scan-cci:smoke-only-cci-password "$SCAN_SMOKE_URL/api/v1/imports/$SCAN_SMOKE_JOB_ID"
expect_http 200 --user scan-admin:smoke-only-admin-password \
  -F retailerCode=DEMO -F profileCode=CANONICAL -F "file=@$SCAN_SMOKE_FIXTURE" "$SCAN_SMOKE_URL/api/v1/imports"
assert_json '.duplicateFile == true and .status == "COMPLETED"'
expect_http 200 --user scan-cci:smoke-only-cci-password "$SCAN_SMOKE_URL/api/v1/analytics/overview?retailerCode=DEMO"
assert_json '.totalBaskets == 6 and .cciBaskets == 5 and .mappedLinePercentage == 100'

if [ -n "${SCAN_SMOKE_KAGGLE_DIR:-}" ]; then
  printf 'Importing the optional 10,000-receipt Kaggle sample under the same memory limit...\n'
  test -f "$SCAN_SMOKE_KAGGLE_DIR/product-catalog.csv"
  test -f "$SCAN_SMOKE_KAGGLE_DIR/canonical-transactions.csv"
  expect_http 201 --user scan-admin:smoke-only-admin-password \
    -F retailerCode=KAGGLE -F "file=@$SCAN_SMOKE_KAGGLE_DIR/product-catalog.csv" \
    "$SCAN_SMOKE_URL/api/v1/product-mappings/catalog-imports"
  expect_http 201 --user scan-admin:smoke-only-admin-password \
    -F retailerCode=KAGGLE -F profileCode=KAGGLE_2019 \
    -F "file=@$SCAN_SMOKE_KAGGLE_DIR/canonical-transactions.csv" "$SCAN_SMOKE_URL/api/v1/imports"
  assert_json '.status == "COMPLETED" and .importedReceipts == 10000 and .importedLines == 54848'
  expect_http 200 --user scan-cci:smoke-only-cci-password "$SCAN_SMOKE_URL/api/v1/analytics/overview?retailerCode=KAGGLE"
  assert_json '.totalBaskets == 10000 and .cciBaskets == 209 and .mappedLinePercentage == 100'
  jq '{totalBaskets, cciBaskets, cciPenetrationPercentage, mappedLinePercentage}' "$SCAN_SMOKE_TMP_DIR/response"
fi

printf 'Restarting the app to verify that database records survive app restarts...\n'
docker restart "$SCAN_SMOKE_APP" >/dev/null
resolve_app_url
wait_for_app
expect_http 200 --user scan-cci:smoke-only-cci-password "$SCAN_SMOKE_URL/api/v1/analytics/overview?retailerCode=DEMO"
assert_json '.totalBaskets == 6 and .cciBaskets == 5'
if [ -n "${SCAN_SMOKE_KAGGLE_DIR:-}" ]; then
  expect_http 200 --user scan-cci:smoke-only-cci-password "$SCAN_SMOKE_URL/api/v1/analytics/overview?retailerCode=KAGGLE"
  assert_json '.totalBaskets == 10000 and .cciBaskets == 209'
fi
test "$(docker inspect --format '{{.Config.User}}' "$SCAN_SMOKE_APP")" = scan
docker stats --no-stream --format 'Application memory now: {{.MemUsage}} (not peak)' "$SCAN_SMOKE_APP"
printf 'Container smoke test passed. Cleaning up only the temporary test containers and network.\n'
