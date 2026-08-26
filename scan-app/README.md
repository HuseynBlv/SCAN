# SCAN App

The React frontend for SCAN. The default experience is the pivoted CCI Sales and Marketing
dashboard backed by aggregate analytics from `scan-api`.

The original cashier-scanning prototype is preserved for reference but is not part of the
current retailer-export workflow.

## Local development

Use Node.js 24 (as in CI). Start the Spring Boot API on port `8080`, then run from `scan-app/`:

```bash
npm ci
npm run dev
```

Vite proxies `/api` to `http://localhost:8080`. Open the displayed Vite URL and sign in with:

- Retailer code: `KAGGLE` for the prepared demo dataset.
- Username: `scan-cci`.
- Password: the value supplied to the API as `SCAN_CCI_PASSWORD`.

Prepare and import the sample using the [Kaggle demo guide](../docs/kaggle-demo.md) first.
For the smaller synthetic API fixture, use retailer code `DEMO`. No Supabase account or
legacy scanner environment variables are required for the default dashboard.

The password is held only in React memory for the current tab. Do not put it in a `VITE_*`
environment variable because Vite variables are embedded in the browser bundle.

## Frontend configuration

| Variable | Default | Purpose |
|---|---|---|
| `VITE_SCAN_RETAILER_CODE` | `KAGGLE` | Initial retailer code on the sign-in screen |
| `VITE_SCAN_API_BASE_URL` | same origin | API origin for deployments where frontend and API are on different origins |
| `VITE_ENABLE_LEGACY_SCANNER` | `false` | Set to `true` to open the retired cashier-scanning prototype |

If `VITE_SCAN_API_BASE_URL` points to a different production origin, the API must explicitly
allow that frontend origin. This CORS configuration is not currently implemented; setting
the frontend variable alone is insufficient. Same-origin deployment is preferred for the pilot.

## Verification

```bash
npm run lint
npm test
npm run build
```

## Production build

```bash
npm run build
```

The output is written to `dist/`. The Vite `/api` proxy applies only to the development
server; neither `dist/` nor a frontend-only Vercel deployment includes the Spring Boot API.
Production must route `/api` to a deployed API or implement the cross-origin setup above.
