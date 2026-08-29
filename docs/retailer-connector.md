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
- Credentials can only call the connector upload endpoint and are bound server-side to the
  configured pilot retailer and import profile.
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
SCAN_API_URL=https://scan-demo.onrender.com
SCAN_CONNECTOR_USERNAME=scan-connector
SCAN_CONNECTOR_PASSWORD=the-SCAN_INGEST_PASSWORD-from-Render
SCAN_CONNECTOR_DIRECTORY=/absolute/path/to/scan-data
```

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

Use `--once` for a single scan cycle. Continuous mode is recommended because it retains retry
state and observes files across multiple cycles. On a Windows pilot computer, use Task Scheduler
to start the JAR at user logon or system startup. Configure automatic restart after failure.

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
