# SCAN API

This Spring Boot service is the first backend for the pivoted SCAN product. It accepts
retailer transaction exports, validates and normalizes them into receipt baskets, maps
retailer products to a canonical catalog, and exposes aggregate-only analytics.

The React dashboard consumes these aggregate results. The original scanner is preserved
behind an explicit legacy flag.

## Requirements

- Java 21+
- Maven 3.6.3+
- PostgreSQL for running the application

The automated tests use an isolated H2 database in PostgreSQL compatibility mode, so a
local PostgreSQL server is not required to run the test suite.

## Run the tests

```bash
cd scan-api
mvn test
```

Generate the coverage report with:

```bash
mvn verify
open target/site/jacoco/index.html
```

`mvn verify` also enforces baseline coverage floors of 80% of lines and 55% of branches.
These are regression guards, not proof that every business rule is correct; focused tests
cover receipt idempotency, mapping consistency, analytics values, and API permissions.

## Run with PostgreSQL

Create an empty database and user, then configure these environment variables:

```bash
export SCAN_DB_URL=jdbc:postgresql://localhost:5432/scan
export SCAN_DB_USERNAME=scan
export SCAN_DB_PASSWORD=replace-me
export SCAN_ADMIN_PASSWORD=replace-admin-password
export SCAN_CCI_PASSWORD=replace-cci-password
mvn spring-boot:run
```

Flyway creates the schema plus a synthetic `DEMO` retailer, `CANONICAL` import profile,
and four-product demo catalog. They exist only to exercise the pipeline before a real
retailer export is available.

## Exercise the Phase 0 API

Upload the synthetic fixture as the admin user:

```bash
curl -u scan-admin:replace-admin-password \
  -F retailerCode=DEMO \
  -F profileCode=CANONICAL \
  -F file=@src/test/resources/fixtures/canonical-transactions.csv \
  http://localhost:8080/api/v1/imports
```

List unresolved retailer products:

```bash
curl -u scan-admin:replace-admin-password \
  'http://localhost:8080/api/v1/product-mappings/unresolved?retailerCode=DEMO'
```

Read aggregate metrics as the CCI user:

```bash
curl -u scan-cci:replace-cci-password \
  'http://localhost:8080/api/v1/analytics/overview?retailerCode=DEMO'
```

## Prepare the Kaggle supermarket demo

The repository includes an isolated preparation tool for the approved Kaggle 2019
supermarket dataset. It creates a deterministic 10,000-receipt sample, a product catalog,
a validation report, and rejected-row details under the ignored `target/` directory.

See [`../docs/kaggle-demo.md`](../docs/kaggle-demo.md) for the exact preparation, catalog
import, transaction import, analytics, and opt-in real-volume smoke-test commands.

Uploading the exact same file again returns the original import job and sets
`duplicateFile: true`. Uploading a different file that reuses an existing receipt identity
with different line contents fails without writing partial receipts.
Identical receipts in different overlapping files are skipped without double-counting.

## Phase 0 limitations

- Imports run synchronously and are limited to 25 MB.
- XLS/XLSX parsing loads the first worksheet into memory.
- CSV is UTF-8 and numeric fields must use plain decimal notation.
- Positive sales are supported. Return, void, refund, and cancellation semantics require
  the real retailer export.
- Receipt identity is currently retailer + store + receipt ID + timestamp.
- Analytics currently load one retailer's receipts through JPA. Production volume testing
  will determine which calculations move to native PostgreSQL aggregation queries.
- Pilot identities are configured from environment variables. Persistent accounts or SSO
  are outside Phase 0.
