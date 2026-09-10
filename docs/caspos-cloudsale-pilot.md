# CASPOS CloudSale provisional pilot

Status: engineering support for an observed generated sample. Not a vendor-confirmed CASPOS data
contract.

## Evidence boundary

The workbook reviewed on 2026-09-10 contains an explicit note that it is a generated receipt sample,
not an actual CASPOS export or evidence of shop sales. It is useful for proving the SCAN conversion
path, but a real unedited export must be collected before unattended operation.

Observed sample facts:

| Check | Observed value |
|---|---:|
| Transaction worksheet | `Satış çekləri` |
| Product lines | 38 |
| Receipts | 20 |
| Computed sales total | 50.19 AZN |
| Sold product codes | 15 |
| Stores / registers | 1 / 1 |
| Receipt payment types | 10 cash / 10 card |
| Nonblank barcodes | 0 |
| Nonzero line or receipt discounts | 0 |
| Fractional quantities | 0 |
| Non-completed statuses | 0 |
| Returns, cancellations, edits, or offline examples | none |

The sample covers only the easiest path. Barcode handling, weighted products, discounts, returns,
cancellations, corrections, receipt-number scope, and delayed offline synchronization remain
unverified.

## What the provisional adapter does

Enable it explicitly:

```properties
SCAN_CONNECTOR_SOURCE_FORMAT=CASPOS_CLOUDSALE_PROVISIONAL
```

For each stable `.xls` or `.xlsx` file in `inbox/`, the connector:

1. Opens the `Satış çekləri` worksheet read-only.
2. Requires the observed Azerbaijani sale and amount columns.
3. Accepts only rows whose `Çek_statusu` is `Tamamlanıb`.
4. Rejects the whole file if `Çek_endirimi_AZN` is nonzero because allocation to lines is unknown.
5. Rejects zero/negative quantities or amounts and verifies each line amount as
   `ROUND(quantity × unit price − line discount, 2)`.
6. Combines register and receipt as `Kassa_kodu:Çek_nömrəsi` to reduce cross-register collisions.
7. Converts Excel/local timestamps to ISO-8601 local text and normalizes offset timestamps to
   `Asia/Baku`, matching the provisional pilot profile.
8. Creates a temporary deterministic canonical CSV containing only SCAN's ten fields.
9. Excludes cashier code, payment type, category, tax rate, and workbook catalog/reference notes from
   the upload.
10. Uploads the canonical CSV, deletes the temporary conversion, and archives the original workbook
    locally on success.

Any local validation failure moves the original workbook to `failed/` and creates an `.error.txt`
sidecar. It never uploads a valid subset of a partly invalid workbook.

## Offline validation at the shop

Build once on the engineering machine:

```bash
cd scan-connector
mvn verify
```

Copy only `target/scan-connector.jar` to the approved back-office or SCAN laptop. Validate a real,
unedited CloudSale export before configuring credentials:

```bat
java -jar C:\SCAN\scan-connector.jar --validate-caspos C:\SCAN\sample\CloudSale-export.xlsx
```

Expected output includes a receipt count, line count, and AZN total. Reconcile those three controls
and at least three individual receipt totals against CloudSale and printed receipts. A failure is
evidence that the export differs from the provisional contract; do not edit the source merely to
make validation pass.

## Pilot server setup

The adapter emits SCAN's canonical column names, so the shop must have its own retailer record and a
canonical import profile with:

- timezone `Asia/Baku`, if confirmed for the shop;
- currency `AZN`, if confirmed;
- canonical column mappings from `docs/pilot-data-contract.md`;
- retailer code `CASPOS_PILOT` and profile code `CLOUDSALE_V1`, bound through
  `SCAN_PILOT_RETAILER_CODE` and `SCAN_PILOT_PROFILE_CODE`;
- a dedicated ingest password and separate retailer portal password.

Migration `V5__seed_caspos_pilot_profile.sql` provisions a separate retailer/profile with timezone
`Asia/Baku`, currency `AZN`, and CCI sharing disabled. The `scan-caspos-pilot` Render service points
at that identity and generates dedicated application passwords. It references the existing demo
service's three Neon connection variables inside Render; their values never enter Git or connector
configuration. The two services share the same Neon database, so this pilot isolates application
credentials and tenant identity, not database infrastructure.

The generic identity is deliberate for the first controlled visit. Replace the display name and
codes with confirmed shop identifiers before treating the environment as a permanent production
tenant. Never use the `DEMO` or `KAGGLE` identities for shop data.

## Supervised upload

Create `C:\SCAN\connector.properties` from `connector.caspos.example.properties`. Keep the data
directory outside all CASPOS installation, database, and fiscal-device directories.

1. Set the real HTTPS API URL and shop-specific connector credentials.
2. Set `SCAN_CONNECTOR_DIRECTORY=C:/SCAN/data`.
3. Leave `SCAN_CONNECTOR_STABLE_SECONDS=10` for normal operation.
4. Copy one approved real export into `C:\SCAN\data\inbox`.
5. Confirm the export is closed and no process is still writing it.
6. For this supervised one-shot test, set `SCAN_CONNECTOR_STABLE_SECONDS=0` and run `--once`. Restore
   the value to `10` before continuous operation. A separate `--once` process cannot retain the two
   observations used by normal stability protection.
7. Confirm the source moves to `processed/` and `connector-status.json` reports `SYNCED`.
8. Reconcile SCAN counts and totals before enabling continuous mode.

Continuous mode retains the two-cycle observation and retry state:

```bat
java -jar C:\SCAN\scan-connector.jar --config C:\SCAN\connector.properties
```

Use Windows Task Scheduler only after the supervised test passes. Prefer a dedicated unprivileged
Windows account, start at boot, automatic restart after failure, and read/write access limited to
`C:\SCAN`.

## Duplicate and failure behavior

- Identical normalized bytes are deduplicated by the API's SHA-256 file identity.
- Overlapping exports skip an existing receipt only when its identity and basket fingerprint match.
- A repeated receipt identity with changed contents rejects the whole import. SCAN does not silently
  rewrite history.
- Network, timeout, rate-limit, authentication, and server failures leave the source in `inbox/` and
  retry with backoff. Checkout never waits for SCAN.
- Local schema/business-rule failures and server validation failures move the source to `failed/`.
- Returns, cancellations, negative quantities, and nonzero receipt-level discounts fail closed in
  provisional mode.
- Retry timing resets after a connector restart, while API idempotency still prevents duplicate data.

## Information still required from a real export

Collect an untouched export plus redacted matching receipt controls and get CASPOS technician answers
for:

- whether these worksheet and header names are native and stable;
- whether exports can be scheduled to a new uniquely named file;
- whether reports are incremental, cumulative, or overlap;
- receipt ID scope and reset rules across registers and business days;
- stable store/register identifiers;
- closed-receipt immutability and correction behavior;
- return, partial-return, cancellation, and void status values;
- receipt-level discount semantics and line allocation;
- tax inclusion and rounding rules;
- barcode and product-code types and stability;
- weighted quantity units;
- offline transaction timestamps and delayed CloudSale synchronization;
- maximum file size and daily line volume;
- official read-only API or reporting interface availability.

After that evidence is collected, rename the adapter from provisional only if CASPOS confirms the
contract, and add fixtures for every observed lifecycle case before unattended operation.
