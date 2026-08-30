# SCAN App

The React frontend for SCAN. It provides separate retailer owner and CCI Sales/Marketing
portals backed by deterministic analytics from `scan-api`.

The original cashier-scanning prototype is preserved for reference but is not part of the
current retailer-export workflow.

## Interface

Both portals use the approved Variant A design system in [`../DESIGN.md`](../DESIGN.md):
a dark operational sidebar, warm neutral canvas, restrained SCAN red, briefing-first
Overviews, shared KPI strips, visible data confidence, keyboard focus states, and responsive
navigation down to mobile widths. The UI never creates comparison metrics or forecasts that
are absent from the API.

Geist is bundled as a pinned self-hosted font package. Pretext measures marked briefing text
after fonts load and recomputes its height on resize; normal CSS remains the fallback if text
measurement is unavailable.

## Local development

Use Node.js 24 (as in CI). Start the Spring Boot API on port `8080`, then run from `scan-app/`:

```bash
npm ci
npm run dev
```

Vite proxies `/api` to `http://localhost:8080`. Open the displayed Vite URL and sign in with:

- Retailer portal: `/?portal=retailer`, username `scan-retailer`, password
  `SCAN_RETAILER_PASSWORD`.
- CCI portal: `/`, retailer code `KAGGLE`, username `scan-cci`, password
  `SCAN_CCI_PASSWORD`.

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

The root `Dockerfile` provides the same-origin option: it builds this frontend, copies
`dist/` into Spring Boot, and serves both from a single container. It explicitly disables
the legacy scanner and uses same-origin API URLs. Runtime passwords are never supplied to
Vite. See the [free Render + Neon deployment guide](../docs/free-demo-deployment.md).

The UI explains temporary hosting failures so users can wait and retry after a free service
wakes up. If the whole service is asleep, Render may show its own loading page before SCAN
can load. Existing frontend-only Vercel hosting is unchanged by the container configuration.
