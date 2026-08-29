#!/usr/bin/env bash
set -euo pipefail

SCAN_SIM_REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SCAN_SIM_CONNECTOR_DIR="${1:-$SCAN_SIM_REPO_DIR/scan-data}"
SCAN_SIM_SOURCE="${2:-$SCAN_SIM_REPO_DIR/scan-api/src/test/resources/fixtures/canonical-transactions.csv}"
SCAN_SIM_INBOX="$SCAN_SIM_CONNECTOR_DIR/inbox"
SCAN_SIM_TIMESTAMP="$(date -u +%Y%m%d-%H%M%S)"
SCAN_SIM_TEMP="$SCAN_SIM_INBOX/.retailer-export-$SCAN_SIM_TIMESTAMP.tmp"
SCAN_SIM_DESTINATION="$SCAN_SIM_INBOX/retailer-export-$SCAN_SIM_TIMESTAMP.csv"

test -f "$SCAN_SIM_SOURCE"
mkdir -p "$SCAN_SIM_INBOX"
cp "$SCAN_SIM_SOURCE" "$SCAN_SIM_TEMP"
mv "$SCAN_SIM_TEMP" "$SCAN_SIM_DESTINATION"
printf 'Simulated POS export created: %s\n' "$SCAN_SIM_DESTINATION"
