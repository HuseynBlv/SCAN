# SCAN

> Basket Intelligence for Every Store

SCAN is a hackathon prototype for **CCI** that turns barcode scans into live basket intelligence.

The app is designed around two complementary experiences:

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

From the app directory:

```bash
cd scan-app
npm install
npm run dev
```

Then open the local Vite URL in your browser.

## Testing on a Phone

For real barcode scanning on a phone, use an **HTTPS** URL. Mobile browsers often block camera access on plain `http`.

Recommended options:

1. deploy to **Vercel**
2. or run locally and expose the app with a secure tunnel such as **ngrok**

## Deployment Notes

If deploying with Vercel:

- **Framework Preset:** `Vite`
- **Root Directory:** `scan-app`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`

No custom environment variables are required for the current prototype.

## Offline Behavior

The prototype is designed to remain usable even when product lookup is unavailable.

- Barcode scanning works locally in the browser
- Open Food Facts is the only external API dependency
- If lookup fails, SCAN falls back to the built-in demo catalog when possible

## Demo Flow

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

## Credits

Built as a prototype for **CCI** using modern frontend tools and public food-product data from [Open Food Facts](https://world.openfoodfacts.org/).
