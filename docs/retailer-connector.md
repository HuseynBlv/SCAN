# SCAN Retailer Connector

The SCAN Retailer Connector delivers existing checkout exports to SCAN without cashier work.
It does not replace or write to the retailer's POS. The first pilot expects the POS to create a
CSV, XLS, or XLSX export in a local folder.

```text
POS scheduled export -> scan-data/inbox -> SCAN Connector -> HTTPS -> SCAN import API
                              |                                  |
                              +-> failed/ with reason            +-> Neon + dashboards
                              +-> processed/ on success
```

## Safety properties

- The connector makes outbound HTTPS requests only; the shop does not open an inbound port.
- Credentials can only call the connector upload endpoint and are persisted with one server-side
  retailer and import-profile binding.
- A supported file must be old enough and unchanged across two polling cycles before upload.
- Successful files are archived, never silently deleted.
- Validation failures move to `failed/` with an `.error.txt` explanation.
- Network, authentication, rate-limit, and server failures remain in `inbox/` and retry with
  exponential backoff.
- The API's existing file hash and receipt identity checks make retries idempotent.
- `connector-status.json` records the latest local state without containing the password.

## Build

Requirements: Java 21 and Maven.

```bash
cd scan-connector
mvn verify
```

The executable file is `scan-connector/target/scan-connector.jar`.

## Configure

Copy the example file and restrict it to the OS account running the connector:

```bash
cp scan-connector/connector.example.properties scan-connector/connector.properties
chmod 600 scan-connector/connector.properties
```

Edit these values:

```properties
SCAN_API_URL=https://scan-caspos-pilot.onrender.com
SCAN_CONNECTOR_USERNAME=the-retailer-assigned-connector-username
SCAN_CONNECTOR_PASSWORD=the-SCAN_INGEST_PASSWORD-from-Render
SCAN_CONNECTOR_DIRECTORY=/absolute/path/to/scan-data
```

`SCAN_CONNECTOR_SOURCE_FORMAT` defaults to `CANONICAL`. The opt-in
`CASPOS_CLOUDSALE_PROVISIONAL` mode converts the specifically observed CloudSale-shaped Excel
sample into SCAN's canonical columns before upload. It is not a claim about CASPOS's stable vendor
schema. Follow [the CASPOS pilot guide](caspos-cloudsale-pilot.md) before enabling it for a shop.

Environment variables with the same names override the properties file. Never commit
`connector.properties`; it is ignored by Git.

## Run continuously

```bash
java -jar scan-connector/target/scan-connector.jar \
  --config scan-connector/connector.properties
```

The connector creates:

```text
scan-data/
├── inbox/                 # POS writes new exports here
├── processed/             # accepted or duplicate-safe exports
├── failed/                # permanently rejected exports + error sidecars
└── connector-status.json  # latest local connector state
```

Use `--once` for a supervised single scan cycle; set stable seconds to zero only after independently
confirming that the test file is complete. Continuous mode is recommended because it retains retry
state and observes files across multiple cycles. On a Windows pilot computer, use Task Scheduler
to start the JAR at user logon or system startup. Configure automatic restart after failure.

## Validate a provisional CASPOS workbook offline

This command requires no connector password and performs no upload or file modification:

```bash
java -jar scan-connector/target/scan-connector.jar \
  --validate-caspos /path/to/CloudSale-export.xlsx
```

It checks the observed worksheet and column names, completed-sale status, positive-sale semantics,
receipt-level discounts, line arithmetic, duplicate line numbers, timestamps, and required values.
Passing validation means the workbook fits the provisional adapter. It does not establish that the
file is an authentic CASPOS export or that the business semantics have been confirmed.

## Demonstrate without a real POS

Start the API and connector, then run from the repository root:

```bash
bash scripts/simulate-retailer-export.sh
```

The simulator writes through a temporary filename and atomically renames it, matching how a POS
should publish a completed export. After two stable polling cycles, verify:

1. the file moves from `inbox/` to `processed/`;
2. `connector-status.json` reports `SYNCED`;
3. the retailer portal at `/?portal=retailer` shows the latest completed import;
4. importing the same bytes again does not increase basket totals.

## Real-retailer checklist

Confirm before installation:

- POS name, version, and vendor;
- Windows/macOS/Linux version of the back-office computer;
- scheduled export support and export frequency;
- whether each file is incremental or a full historical snapshot;
- whether filenames are new or overwritten;
- maximum rows/file and files/day;
- outbound HTTPS access to the SCAN URL;
- sample receipt totals reconciled against the POS;
- removal of customer, card, loyalty, cashier, and bank identifiers.

If the POS cannot schedule a file export, transport is automated but extraction is not. A
source-specific read-only database or API adapter is then required; that is intentionally not a
universal connector feature.
