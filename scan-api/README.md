# SCAN API

This Spring Boot service is the first backend for the pivoted SCAN product. It accepts
retailer transaction exports, validates and normalizes them into receipt baskets, maps
retailer products to a canonical catalog, and exposes aggregate-only analytics.

The React dashboard consumes these aggregate results. The original scanner is preserved
behind an explicit legacy flag.

## Requirements

- Java 21 (the version used in CI)
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

Start PostgreSQL first. For a fresh local setup only, create a login and database using a
PostgreSQL administrator account:

```bash
createuser --pwprompt scan
createdb --owner=scan scan
```

The first command prompts for the new database user's password. These commands use your
local PostgreSQL connection defaults; specify the administrator, host, and port if needed.
If the `scan` user and database already exist, skip creation and use their existing password.
Do not recreate a database containing imported data.

From `scan-api/`, configure the following variables in the same terminal used to start Maven:

```bash
export SCAN_DB_URL=jdbc:postgresql://localhost:5432/scan
export SCAN_DB_USERNAME=scan
export SCAN_DB_PASSWORD=replace-me
export SCAN_ADMIN_PASSWORD=replace-admin-password
export SCAN_CCI_PASSWORD=replace-cci-password
mvn spring-boot:run
```

Flyway creates the schema plus a synthetic `DEMO` retailer, `CANONICAL` import profile,
and four-product demo catalog. It also creates the `KAGGLE` retailer and `KAGGLE_2019`
profile. These support testing before a real retailer export is available; migrations do
not load transaction files.

## Exercise the Phase 0 API

Upload the synthetic fixture as the admin user. Run these examples from `scan-api/` in
another terminal while the API is running. Curl prompts for the corresponding password
configured on the backend, so it does not need password variables in this second terminal:

```bash
curl -u scan-admin \
  -F retailerCode=DEMO \
  -F profileCode=CANONICAL \
  -F file=@src/test/resources/fixtures/canonical-transactions.csv \
  http://localhost:8080/api/v1/imports
```

List unresolved retailer products:

```bash
curl -u scan-admin \
  'http://localhost:8080/api/v1/product-mappings/unresolved?retailerCode=DEMO'
```

Read aggregate metrics as the CCI user:

```bash
curl -u scan-cci \
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

## Container and free-demo hosting

The repository-root `Dockerfile` builds the React dashboard into this service, so one
container serves both `/` and `/api`. Follow the
[Render + Neon setup guide](../docs/free-demo-deployment.md); hosted resources are not
created automatically by this repository.

The container activates `cloud`, listens on `${PORT:8080}`, limits its Java heap to 256 MB,
and uses a small database/thread pool. Local `mvn spring-boot:run` retains the normal profile
unless you explicitly enable `cloud`. Set the database URL, role, password, and separate
admin/CCI passwords in the host's environment settings, never the image or source code.

`GET /health` is public and returns only `{"status":"UP"}` with no database query. Page
assets are public, but API role and retailer-sharing restrictions still apply. Check an
authenticated analytics request as well to verify database access after deployment.

From the repository root, `bash scripts/smoke-container.sh scan-demo:local` tests a built
image with disposable PostgreSQL 17 and a 512 MB app limit. This test does not use your
local database; see the hosting guide for the build and optional dataset-test commands.

## Current pilot limitations

- Imports run synchronously and are limited to 25 MB.
- XLS/XLSX parsing loads the first worksheet into memory.
- CSV is UTF-8 and numeric fields must use plain decimal notation.
- Positive sales are supported. Return, void, refund, and cancellation semantics require
  the real retailer export.
- Receipt identity is currently retailer + store + receipt ID + timestamp.
- Analytics currently load one retailer's receipts through JPA. Production volume testing
  will determine which calculations move to native PostgreSQL aggregation queries.
- Pilot identities are configured from environment variables. Persistent accounts or SSO
  are not implemented. CCI access requires the retailer's sharing flag; per-user retailer
  permissions are not implemented.
- Production needs HTTPS and a reachable backend, not just a static frontend deployment.
  The current security configuration does not enable cross-origin browser requests. Prefer
  same-origin frontend/API routing; a separate frontend origin requires an explicit CORS
  implementation and verification.
