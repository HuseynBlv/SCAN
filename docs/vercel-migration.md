# Parallel Vercel migration

SCAN can run its existing Spring Boot container on Vercel's container runtime while the Render
services remain available as rollback targets. This is a staged migration, not an immediate DNS
cutover. The Render blueprint, service settings, and root `Dockerfile` stay unchanged.

Vercel's container runtime is currently beta. It automatically detects the root
`Dockerfile.vercel`, builds it as an OCI image, and routes the project origin to the HTTP server
inside it. SCAN already listens on `${PORT:8080}`, serves the compiled dashboard and API from one
origin, and persists state in Neon rather than the container filesystem.

`Dockerfile.vercel` intentionally matches `Dockerfile` byte for byte. CI rejects drift between the
two files before smoke-testing the Render image. `vercel.json` selects Fluid compute and `fra1`,
keeping application compute close to the Frankfurt Neon database.

## Important compatibility gate

Vercel applies its Function limits to container images. Request and response bodies are limited to
4.5 MB, while SCAN currently accepts transaction and catalog uploads up to 25 MB. Do not retire
Render or point production connector traffic at Vercel until every real export is confirmed below
4.5 MB or uploads are redesigned to go directly to durable object storage and the API consumes
them asynchronously.

Container instances also scale to zero after inactivity. The import payload and job are stored in
PostgreSQL, but processing currently depends on the scheduled worker inside a live application
instance. Verify import completion after cold starts and under concurrent requests before cutover.

## 1. Create a parallel Vercel project

Import the same GitHub repository into a new Vercel project, or reconfigure the existing
frontend-only Vercel project. Use the repository root as the project root. Do not set a Vite preset,
custom build command, output directory, or `VITE_SCAN_API_BASE_URL`; the container packages both
the frontend and Spring Boot API.

Start with Preview deployments. Keep the production domain on Render until all checks below pass.
The repository's Render services have automatic deployment disabled, so adding the Vercel files
does not redeploy or alter them.

## 2. Copy runtime configuration

Create the following Vercel environment variables for Preview first, then Production after the
preview is verified:

| Variable | Parallel demo value |
|---|---|
| `PORT` | `8080` |
| `SPRING_PROFILES_ACTIVE` | `cloud` |
| `SCAN_RUNTIME_ENVIRONMENT` | `demo` |
| `SCAN_DATABASE_ID` | `scan-demo` |
| `SCAN_DB_URL` | The demo database's direct TLS JDBC URL |
| `SCAN_DB_USERNAME` | The demo application role |
| `SCAN_DB_PASSWORD` | The demo database password |
| `SCAN_ADMIN_USERNAME` | `scan-demo-admin` |
| `SCAN_ADMIN_PASSWORD` | The current Render demo value |
| `SCAN_CCI_USERNAME` | `scan-demo-cci` |
| `SCAN_CCI_PASSWORD` | The current Render demo value |
| `SCAN_INGEST_USERNAME` | `scan-demo-connector` |
| `SCAN_INGEST_PASSWORD` | The current Render demo value |
| `SCAN_RETAILER_USERNAME` | `scan-demo-retailer` |
| `SCAN_RETAILER_PASSWORD` | The current Render demo value |
| `SCAN_ONBOARDING_USERNAME` | `scan-demo-onboarding` |
| `SCAN_ONBOARDING_PASSWORD` | The current Render demo value |
| `SCAN_PILOT_RETAILER_CODE` | `KAGGLE` |
| `SCAN_PILOT_PROFILE_CODE` | `KAGGLE_2019` |

Set `PORT=8080` explicitly because Vercel containers otherwise default to port 80, while SCAN runs
as a non-root user. Render continues to inject its own `PORT` value and is unaffected.

Copy the existing application passwords exactly during the parallel phase. Bootstrap accounts are
persisted in PostgreSQL, so changing only the environment values does not rotate existing account
passwords. Never place any secret in Git, a `VITE_*` variable, build arguments, or deployment logs.

Do not initially connect a Vercel preview to the production pilot database. After the demo path is
verified, create a separate Vercel project for the pilot and copy the pilot's `production` /
`scan-production` identity and its own database and account values. Demo and pilot must remain
separate.

## 3. Deploy and verify the preview

Deploy from the Vercel dashboard or, after installing and authenticating the Vercel CLI, from the
repository root:

```bash
vercel
```

Use the assigned preview URL without a trailing slash:

```bash
export SCAN_VERCEL_URL='https://YOUR_PREVIEW.vercel.app'
curl --fail-with-body "$SCAN_VERCEL_URL/health"
curl -i "$SCAN_VERCEL_URL/api/v1/analytics/overview?retailerCode=KAGGLE"
curl --fail-with-body -u scan-demo-cci \
  "$SCAN_VERCEL_URL/api/v1/analytics/overview?retailerCode=KAGGLE"
```

Expected results are `{"status":"UP"}`, HTTP 401, then HTTP 200. Complete the following gates:

1. Verify the public page and each signed-in portal on the Vercel origin.
2. Confirm the expected 10,000 baskets, 54,848 lines, 209 CCI baskets, and 2.1% penetration.
3. Let the deployment go cold, then verify health, sign-in, and analytics again.
4. On a disposable non-Kaggle tenant, preview and import a file smaller than 4.5 MB and confirm the
   job reaches `COMPLETED` without duplicate receipts.
5. Send concurrent read requests and confirm Neon connection usage remains within its limits.
6. Inspect Vercel logs for startup, Flyway, memory, timeout, and termination errors.
7. Re-run the same smoke checks against Render. Both origins must remain healthy.

## 4. Cut over reversibly

Only after the compatibility gate and preview checks pass:

1. Create and verify a Vercel Production deployment from the same reviewed commit.
2. Reduce the public domain's DNS TTL, then attach the domain to Vercel.
3. Keep Render running and unchanged during an observation window.
4. Monitor authenticated analytics, imports, database connections, cold starts, and error rates.
5. If any gate fails, move the domain back to Render; the database and credentials are unchanged.

Retire a Render service only after the observation window and after backups and rollback ownership
are confirmed. Removing Render is a separate, explicit operation; this repository change does not
perform it.
