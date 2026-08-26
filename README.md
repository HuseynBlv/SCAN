# SCAN

> Sales & Consumption Analytics Network

SCAN is an analytics and data-collaboration layer that turns transaction data already
created by a retailer's checkout system into decision-ready basket intelligence for the
retailer and approved aggregate insights for **CCI Sales and Marketing**.

The product has pivoted away from cashier-operated phone scanning. The Spring Boot analytics
service lives in [`scan-api/`](scan-api/), and [`scan-app/`](scan-app/) now opens an API-backed
CCI Sales and Marketing dashboard by default. The original scanner remains available only
behind an explicit legacy development flag.

## Legacy hackathon prototype

The sections in this legacy area describe the retired scanner and apply only when
`VITE_ENABLE_LEGACY_SCANNER=true`. They do not describe SCAN's default workflow.

The original prototype was designed around two complementary experiences:

- **Cashier View** for a store owner or cashier using a phone at the counter
- **HQ View** for a CCI team member monitoring aggregated trends across stores

It is built as a fast, presentation-friendly React app with real camera scanning, live feedback, analytics screens, and a polished demo flow.

## Why This Exists

SCAN answers a simple business question:

**What are customers actually buying together, and how can CCI use that insight?**

Instead of treating a barcode scan as a checkout-only action, SCAN turns each basket into a small data signal. Over time, those signals power:

- product pair analysis
- store-level performance insights
- restock recommendations
- rewards and gamification for store partners
- HQ visibility into regional trends

## Product Experience

### Cashier View

Mobile-first, optimized for a phone at the point of sale.

Includes:

- live barcode scanning with `@zxing/browser`
- duplicate-scan protection
- Open Food Facts lookup
- graceful offline fallback for key products
- basket building and logging
- `My Store` analytics
- `Rewards` and achievement system
- `Rankings` leaderboard view
- `Demo Mode` for presentation-safe simulated scans

### HQ View

Desktop-oriented analytics view for CCI headquarters.

Includes:

- top KPI cards
- basket pair analysis
- district-level comparison
- peak-hours chart
- live transaction feed
- anonymized store reporting

## Core Features

- **Real camera scanning** with a smoother one-dimensional retail barcode pipeline
- **Fast scan feedback** with processing states, success feedback, and vibration support
- **Hardcoded fallback catalog** for offline resilience:
  - Coca-Cola 330ml
  - Lays Original
  - Azerchay Black Tea
- **Splash screen** and polished transitions for demos
- **Mode switcher** between cashier and HQ experiences
- **Hackathon-ready UI** using CCI red branding: `#E61C24`

## Tech Stack

- **React 19**
- **Vite**
- **Recharts**
- **@zxing/browser**
- **Open Food Facts API**

## Project Structure

```text
SCAN/
├── README.md
├── docs/
├── scan-api/
└── scan-app/
    ├── src/
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css
    ├── public/
    ├── package.json
    └── vite.config.js
```

## Running Locally

Start PostgreSQL and the Spring Boot API as documented in [`scan-api/README.md`](scan-api/README.md).
Then start the frontend:

```bash
cd scan-app
npm install
npm run dev
```

Then open the local Vite URL and sign in to the aggregate analytics dashboard. See
[`scan-app/README.md`](scan-app/README.md) for configuration and verification commands.

## Legacy scanner: testing on a phone

For real barcode scanning on a phone, use an **HTTPS** URL. Mobile browsers often block camera access on plain `http`.

Recommended options:

1. deploy to **Vercel**
2. or run locally and expose the app with a secure tunnel such as **ngrok**

## Legacy scanner: deployment notes

If deploying with Vercel:

- **Framework Preset:** `Vite`
- **Root Directory:** `scan-app`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

That Vercel-only setup applies to the legacy scanner. The current dashboard also requires a
deployed SCAN API. Prefer a same-origin deployment; otherwise set `VITE_SCAN_API_BASE_URL` and
configure the API's allowed frontend origin. Never place SCAN passwords in `VITE_*` variables.

## Legacy scanner: offline behavior

The prototype is designed to remain usable even when product lookup is unavailable.

- Barcode scanning works locally in the browser
- Open Food Facts is the only external API dependency
- If lookup fails, SCAN falls back to the built-in demo catalog when possible

## Legacy scanner: demo flow

For a reliable live presentation:

1. open **Cashier View**
2. use **Demo Mode** if camera conditions are poor
3. log the basket
4. switch to **HQ View**
5. show how the new basket influences the live feed and analytics

## Status

This is a **hackathon prototype**, not a production checkout system.

It is optimized for:

- concept validation
- storytelling
- UI polish
- live demos

## Pivoted retailer-export product

Development of the retailer-export version now lives in [`scan-api/`](scan-api/). The new
Spring Boot service accepts configurable CSV/XLSX transaction exports, creates audited and
idempotent imports, reconstructs receipts, supports explicit product mapping, and exposes
aggregate-only deterministic analytics.

The React application now reads the backend's deterministic aggregate analytics. The original
scanner remains intact for historical reference and can be enabled with
`VITE_ENABLE_LEGACY_SCANNER=true`. See:

- [`scan-api/README.md`](scan-api/README.md)
- [`docs/pilot-data-contract.md`](docs/pilot-data-contract.md)
- [`docs/analytics-definitions.md`](docs/analytics-definitions.md)

## Credits

Built as a prototype for **CCI** using modern frontend tools and public food-product data from [Open Food Facts](https://world.openfoodfacts.org/).
