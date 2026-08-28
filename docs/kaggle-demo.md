# Kaggle supermarket demo

This workflow adapts the public
[Kaggle supermarket dataset](https://www.kaggle.com/datasets/mexwell/supermarket-dataset)
to SCAN's canonical transaction contract. The source is licensed CC BY 4.0 and is for
technical demonstration only. Its metrics are not current CCI or retailer market evidence.

## Approved assumptions

- Currency: AZN.
- Timestamp zone: `Asia/Baku`.
- Each source row represents quantity `1`.
- `line_total` equals `unit_price`.
- `discount_amount` is `0`; campaign labels are not treated as monetary discounts.
- Source product codes are omitted because thousands map to unrelated product names.
- Exact normalized product names are used as saved retailer mappings.
- Approved demo CCI brands: Coca-Cola, Fanta, Sprite, Cappy, Fuse Tea, Burn, and Bonaqua.
- Customer/bonus-card and store-coordinate fields are excluded.

The adapter quarantines an entire receipt when any of its lines is malformed. This prevents
incomplete baskets from entering analytics.

## 1. Prepare a bounded sample

From `scan-api/`, run:

```bash
mvn -DskipTests spring-boot:run \
  -Dspring-boot.run.main-class=az.cci.scan.tools.kaggle.KaggleDatasetPreparationCli \
  -Dspring-boot.run.arguments="--input=/absolute/path/supermarket-data.zip --output=target/kaggle-demo --receipt-limit=10000"
```

The supported demo path is intentionally bounded to 10,000 receipts so the generated upload
stays below the API's validated 25 MB limit. Sampling is deterministic: the tool selects
complete eligible receipts using the lowest SHA-256 hashes of store ID plus receipt ID.
Do not use `--receipt-limit=0` with the current importer. A future full-volume run must first
add receipt-safe file splitting or validate a higher upload and in-memory processing limit.

Generated files:

| File | Purpose |
|---|---|
| `target/kaggle-demo/canonical-transactions.csv` | Upload to the SCAN transaction importer |
| `target/kaggle-demo/product-catalog.csv` | Exact-name canonical products and saved mappings |
| `target/kaggle-demo/rejected-rows.csv` | Malformed source rows and reasons |
| `target/kaggle-demo/validation-report.json` | Assumptions, hashes, counts, and quarantine totals |

The generated files remain under Maven's ignored `target/` directory and must not be
committed.

## 2. Start SCAN

Configure PostgreSQL and the required passwords, then start the API:

```bash
export SCAN_DB_URL=jdbc:postgresql://localhost:5432/scan
export SCAN_DB_USERNAME=scan
export SCAN_DB_PASSWORD=replace-me
export SCAN_ADMIN_PASSWORD=replace-admin-password
export SCAN_CCI_PASSWORD=replace-cci-password
mvn spring-boot:run
```

Flyway creates retailer `KAGGLE` and import profile `KAGGLE_2019`.

## 3. Import the exact-name catalog

Do this before importing transactions so every sample product is mapped deterministically.
Keep the API running and use a second terminal in `scan-api/` for the following curl commands.
Curl prompts for the backend's admin or CCI password; no password variables are needed in
that second terminal:

```bash
curl -u scan-admin \
  -F retailerCode=KAGGLE \
  -F file=@target/kaggle-demo/product-catalog.csv \
  http://localhost:8080/api/v1/product-mappings/catalog-imports
```

Catalog import is idempotent. Repeating the same catalog reuses the existing canonical
products and saved mappings. If a barcode or normalized name already exists with different
CCI, category, brand, package, or other canonical metadata, the entire catalog import is
rejected instead of silently changing analytics truth.

## 4. Import transactions

```bash
curl -u scan-admin \
  -F retailerCode=KAGGLE \
  -F profileCode=KAGGLE_2019 \
  -F file=@target/kaggle-demo/canonical-transactions.csv \
  http://localhost:8080/api/v1/imports
```

## 5. Read analytics

```bash
curl -u scan-cci \
  'http://localhost:8080/api/v1/analytics/overview?retailerCode=KAGGLE'
```

To view the same results in the browser, follow the
[frontend setup guide](../scan-app/README.md) and sign in with retailer `KAGGLE`.
Re-uploading the exact transaction file should return `duplicateFile: true` without changing
the basket count. Failed uploads remain in history and the same bytes can be retried as a new
numbered attempt. If this retailer already contains other imports, its aggregate totals can
exceed the sample-only values below.

## Verified 10,000-receipt sample

For source ZIP SHA-256
`48054d2d1fb6e06156eba3ebd004be925892be1ab4f1d435d36d6eacc5526820`, the adapter produced:

- 10,000 complete receipts and 54,848 transaction lines.
- 13,913 exact-name catalog products.
- 54 CCI catalog products and 209 CCI baskets.
- 100% mapped transaction lines after catalog import.
- All 21 stores represented.
- 771 malformed source rows across 767 quarantined receipts (4,946 quarantined lines).

## Optional real-volume smoke test

The normal test suite uses small repository fixtures. To run the generated sample through an
isolated H2 database without touching local PostgreSQL:

```bash
mvn -Dtest=KagglePreparedDatasetSmokeTest \
  -Dscan.kaggle.output="$PWD/target/kaggle-demo" \
  test
```
