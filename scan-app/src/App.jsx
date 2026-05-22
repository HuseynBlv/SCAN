import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const ZXING_CDN_URL =
  "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm";
const OPEN_FOOD_FACTS_API = "https://world.openfoodfacts.org/api/v2/product";
const DUPLICATE_SCAN_WINDOW_MS = 3000;
const PRIMARY_RED = "#E61C24";
const SUCCESS_GREEN = "#19A55A";
const STORE_NAME = "Store #47 — Narimanov";

const MY_STORE_STATS = [
  { label: "Today's baskets", value: "47" },
  { label: "This week", value: "284" },
  { label: "This month", value: "1,203" },
];

const MY_STORE_TOP_PRODUCTS = [
  { name: "Coca-Cola 330ml", scans: 38 },
  { name: "Lays Original", scans: 31 },
  { name: "Azerchay", scans: 24 },
  { name: "Fanta 500ml", scans: 19 },
  { name: "Sprite 330ml", scans: 14 },
];

const MY_STORE_PEAK_HOURS = [
  { hour: "08", baskets: 2 },
  { hour: "09", baskets: 4 },
  { hour: "10", baskets: 5 },
  { hour: "11", baskets: 6 },
  { hour: "12", baskets: 10 },
  { hour: "13", baskets: 13 },
  { hour: "14", baskets: 11 },
  { hour: "15", baskets: 7 },
  { hour: "16", baskets: 6 },
  { hour: "17", baskets: 8 },
  { hour: "18", baskets: 12 },
  { hour: "19", baskets: 14 },
  { hour: "20", baskets: 11 },
  { hour: "21", baskets: 7 },
];

const MY_STORE_TOP_PAIRS = [
  {
    title: "Coke + Lays",
    subtitle: "68% of Coke transactions",
    percentage: 68,
  },
  {
    title: "Fanta + chips",
    subtitle: "54% of Fanta transactions",
    percentage: 54,
  },
];

const CURRENT_REWARD = {
  title: "5% discount on next CCI order",
  code: "SCAN-2024-NK47",
  validUntil: "Valid until 30 June 2026",
};

const REWARD_HISTORY = [
  {
    title: "3% discount on beverage restock",
    date: "12 May 2026",
  },
  {
    title: "Free priority slot booking",
    date: "28 April 2026",
  },
  {
    title: "2% district performance bonus",
    date: "09 April 2026",
  },
];

const ACHIEVEMENTS = [
  {
    title: "First Scan",
    subtitle: "scanned your first basket",
    unlocked: true,
    icon: "✅",
  },
  {
    title: "Getting Started",
    subtitle: "20 baskets",
    unlocked: true,
    icon: "✅",
  },
  {
    title: "On Fire",
    subtitle: "7 day streak",
    unlocked: true,
    icon: "✅",
  },
  {
    title: "Consistent",
    subtitle: "50 baskets",
    unlocked: true,
    icon: "✅",
  },
  {
    title: "Silver Scanner",
    subtitle: "100 baskets",
    unlocked: true,
    icon: "✅",
  },
  {
    title: "Century Club",
    subtitle: "500 baskets this month",
    unlocked: false,
    icon: "🔒",
  },
  {
    title: "Gold Scanner",
    subtitle: "1000 total baskets",
    unlocked: false,
    icon: "🔒",
  },
  {
    title: "Streak Master",
    subtitle: "30 day streak",
    unlocked: false,
    icon: "🔒",
  },
  {
    title: "District Legend",
    subtitle: "reach #1 in district",
    unlocked: false,
    icon: "🔒",
  },
  {
    title: "Platinum Partner",
    subtitle: "maintain gold for 3 months",
    unlocked: false,
    icon: "🔒",
  },
];

const FALLBACK_PRODUCTS = {
  "5449000000996": {
    name: "Coca-Cola",
    brand: "The Coca-Cola Company",
    quantity: "330ml",
  },
  "5053990109332": {
    name: "Lays Original",
    brand: "Lay's",
    quantity: "40g",
  },
  "4760062100018": {
    name: "Azerchay",
    brand: "Azerchay",
    quantity: "Black Tea",
  },
};

function normalizeProduct(product = {}) {
  return {
    name: product.product_name?.trim() || "Unknown Product",
    brand: product.brands?.trim() || "Brand unavailable",
    quantity: product.quantity?.trim() || "Quantity unavailable",
  };
}

function buildScannedItem(barcode, productDetails) {
  return {
    id: `${barcode}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    barcode,
    name: productDetails.name,
    brand: productDetails.brand,
    quantity: productDetails.quantity,
    customName: productDetails.name === "Unknown Product" ? "" : productDetails.name,
    isUnknown: productDetails.name === "Unknown Product",
  };
}

export default function App() {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);
  const recentScansRef = useRef(new Map());
  const pendingBarcodesRef = useRef(new Set());
  const mountedRef = useRef(false);

  const [activeMode, setActiveMode] = useState("cashier");
  const [activeCashierTab, setActiveCashierTab] = useState("scan");
  const [scanStatus, setScanStatus] = useState("Starting camera...");
  const [scannedItems, setScannedItems] = useState([]);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [hasClaimedReward, setHasClaimedReward] = useState(false);

  const handleDetectedBarcode = async (barcode) => {
    const trimmedBarcode = barcode?.trim();

    if (!trimmedBarcode || pendingBarcodesRef.current.has(trimmedBarcode)) {
      return;
    }

    const now = Date.now();
    const lastSeenAt = recentScansRef.current.get(trimmedBarcode);

    if (lastSeenAt && now - lastSeenAt < DUPLICATE_SCAN_WINDOW_MS) {
      return;
    }

    recentScansRef.current.set(trimmedBarcode, now);
    pendingBarcodesRef.current.add(trimmedBarcode);
    setIsLookingUp(true);
    setScanStatus(`Detected ${trimmedBarcode}. Looking up product...`);

    try {
      const response = await fetch(
        `${OPEN_FOOD_FACTS_API}/${encodeURIComponent(trimmedBarcode)}`,
        {
          headers: { Accept: "application/json" },
        }
      );
      const data = await response.json();
      const fallbackProduct = FALLBACK_PRODUCTS[trimmedBarcode];
      const foundProduct =
        response.ok && data?.status === 1 && data?.product
          ? normalizeProduct(data.product)
          : fallbackProduct || {
              name: "Unknown Product",
              brand: "Manual entry needed",
              quantity: "Unknown quantity",
            };

      setScannedItems((currentItems) => [
        buildScannedItem(trimmedBarcode, foundProduct),
        ...currentItems,
      ]);

      setScanStatus(
        foundProduct.name === "Unknown Product"
          ? `Barcode ${trimmedBarcode} not found. Add a name manually.`
          : `Added ${foundProduct.name}. Keep scanning.`
      );
    } catch {
      const fallbackProduct = FALLBACK_PRODUCTS[trimmedBarcode] || {
        name: "Unknown Product",
        brand: "Lookup failed",
        quantity: "Unknown quantity",
      };

      setScannedItems((currentItems) => [
        buildScannedItem(trimmedBarcode, fallbackProduct),
        ...currentItems,
      ]);

      setScanStatus(
        fallbackProduct.name === "Unknown Product"
          ? "Lookup failed. You can still add the product manually."
          : `Added ${fallbackProduct.name} from fallback catalog.`
      );
    } finally {
      pendingBarcodesRef.current.delete(trimmedBarcode);
      setIsLookingUp(false);
    }
  };

  useEffect(() => {
    const recentScans = recentScansRef.current;
    const pendingBarcodes = pendingBarcodesRef.current;

    if (activeMode !== "cashier" || activeCashierTab !== "scan") {
      mountedRef.current = false;
      controlsRef.current?.stop?.();
      readerRef.current?.reset?.();
      return undefined;
    }

    mountedRef.current = true;

    const startScanner = async () => {
      try {
        setScanStatus("Loading barcode scanner...");
        const zxing = await import(/* @vite-ignore */ ZXING_CDN_URL);

        if (!mountedRef.current || !videoRef.current) {
          return;
        }

        const BrowserMultiFormatReader =
          zxing.BrowserMultiFormatReader ||
          zxing.default?.BrowserMultiFormatReader;

        if (!BrowserMultiFormatReader) {
          throw new Error("Scanner library failed to load.");
        }

        const reader = new BrowserMultiFormatReader();
        readerRef.current = reader;

        setScanStatus("Point the camera at a barcode.");

        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
            },
          },
          videoRef.current,
          (result, error) => {
            if (result) {
              void handleDetectedBarcode(result.getText());
              return;
            }

            if (error?.name === "NotFoundException") {
              return;
            }

            if (error && mountedRef.current) {
              setScanStatus("Scanning... hold steady over the barcode.");
            }
          }
        );

        controlsRef.current = controls;
      } catch (error) {
        if (mountedRef.current) {
          setScanStatus(
            error?.message ||
              "Camera unavailable. Please allow camera access and refresh."
          );
        }
      }
    };

    startScanner();

    return () => {
      mountedRef.current = false;
      controlsRef.current?.stop?.();
      readerRef.current?.reset?.();
      recentScans.clear();
      pendingBarcodes.clear();
    };
  }, [activeMode, activeCashierTab]);

  const updateUnknownProductName = (id, nextName) => {
    setScannedItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, customName: nextName } : item
      )
    );
  };

  return (
    <div className="app-shell">
      <style>{`
        :root {
          color-scheme: light;
          --scan-red: ${PRIMARY_RED};
          --scan-red-soft: rgba(230, 28, 36, 0.08);
          --scan-red-border: rgba(230, 28, 36, 0.18);
          --scan-ink: #111111;
          --scan-muted: #6b6b6b;
          --scan-panel: #ffffff;
          --scan-bg: #f5f6f8;
          --scan-line: rgba(17, 17, 17, 0.07);
          --scan-green: ${SUCCESS_GREEN};
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background:
            radial-gradient(circle at top, rgba(230, 28, 36, 0.14), transparent 28%),
            linear-gradient(180deg, #fcfcfd, #eff2f5 72%);
          color: var(--scan-ink);
        }

        button,
        input {
          font: inherit;
        }

        .app-shell {
          min-height: 100vh;
          padding: 20px 16px 120px;
        }

        .screen {
          width: 100%;
          max-width: 430px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .topbar {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .topbar-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .logo {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .logo-mark {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          background: linear-gradient(180deg, #ff4d57, var(--scan-red));
          color: #fff;
          display: grid;
          place-items: center;
          font-weight: 800;
          letter-spacing: 0.06em;
          box-shadow: 0 10px 18px rgba(230, 28, 36, 0.24);
        }

        .logo-copy {
          font-size: 1.25rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: var(--scan-red);
        }

        .store-pill {
          max-width: 56%;
          padding: 10px 12px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid var(--scan-red-border);
          box-shadow: 0 10px 24px rgba(17, 17, 17, 0.06);
          font-size: 0.8rem;
          font-weight: 600;
          color: #4c4c4c;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .mode-switch {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          padding: 6px;
          background: rgba(255, 255, 255, 0.82);
          border: 1px solid var(--scan-line);
          border-radius: 18px;
          box-shadow: 0 12px 28px rgba(17, 17, 17, 0.06);
        }

        .mode-button {
          border: none;
          border-radius: 12px;
          padding: 12px 10px;
          background: transparent;
          color: var(--scan-muted);
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.03em;
          transition: background 180ms ease, color 180ms ease, transform 180ms ease;
        }

        .mode-button.active {
          background: linear-gradient(135deg, rgba(230, 28, 36, 0.15), rgba(230, 28, 36, 0.08));
          color: var(--scan-red);
          box-shadow: inset 0 0 0 1px rgba(230, 28, 36, 0.15);
        }

        .panel {
          background: var(--scan-panel);
          border: 1px solid var(--scan-line);
          border-radius: 24px;
          box-shadow: 0 16px 36px rgba(17, 17, 17, 0.08);
          overflow: hidden;
        }

        .panel-body {
          padding: 18px;
        }

        .camera-frame {
          position: relative;
          aspect-ratio: 3 / 4;
          background:
            linear-gradient(180deg, rgba(17, 17, 17, 0.02), rgba(17, 17, 17, 0.12)),
            #1b1b1b;
        }

        .camera-frame video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .camera-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 18px;
          pointer-events: none;
        }

        .status-badge {
          align-self: flex-start;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          max-width: 82%;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.9);
          backdrop-filter: blur(10px);
          font-size: 0.86rem;
          line-height: 1.35;
          color: #242424;
        }

        .spinner {
          width: 16px;
          height: 16px;
          flex: 0 0 16px;
          border-radius: 50%;
          border: 2px solid rgba(230, 28, 36, 0.16);
          border-top-color: var(--scan-red);
          animation: spin 850ms linear infinite;
        }

        .scan-window {
          align-self: center;
          width: 80%;
          height: 126px;
          border-radius: 22px;
          border: 2px solid rgba(255, 255, 255, 0.96);
          box-shadow: 0 0 0 999px rgba(17, 17, 17, 0.25);
          position: relative;
        }

        .scan-window::after {
          content: "";
          position: absolute;
          left: 12px;
          right: 12px;
          top: 50%;
          height: 2px;
          background: rgba(230, 28, 36, 0.95);
          box-shadow: 0 0 18px rgba(230, 28, 36, 0.5);
          animation: pulse 1.9s ease-in-out infinite;
        }

        .section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 18px 10px;
        }

        .section-title {
          font-size: 1rem;
          font-weight: 800;
        }

        .section-meta {
          font-size: 0.82rem;
          color: var(--scan-muted);
        }

        .screen-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .items-list {
          list-style: none;
          margin: 0;
          padding: 0 12px 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .item-card,
        .empty-card {
          border-radius: 18px;
          border: 1px solid rgba(17, 17, 17, 0.06);
          background: #fff;
        }

        .item-card {
          padding: 14px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .checkmark {
          width: 30px;
          height: 30px;
          flex: 0 0 30px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: rgba(25, 165, 90, 0.12);
          color: var(--scan-green);
          font-size: 1rem;
          font-weight: 800;
        }

        .item-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .item-name {
          font-size: 0.98rem;
          font-weight: 800;
          line-height: 1.28;
        }

        .item-meta {
          font-size: 0.9rem;
          line-height: 1.35;
          color: var(--scan-muted);
        }

        .unknown-input {
          width: 100%;
          border: 1px solid var(--scan-red-border);
          border-radius: 14px;
          padding: 12px 14px;
          background: #fff9f9;
          outline: none;
        }

        .unknown-input:focus {
          border-color: var(--scan-red);
          box-shadow: 0 0 0 4px rgba(230, 28, 36, 0.1);
        }

        .empty-card {
          padding: 18px;
          text-align: center;
          color: var(--scan-muted);
          font-size: 0.92rem;
          line-height: 1.45;
        }

        .cta-wrap {
          position: sticky;
          bottom: 20px;
        }

        .cta-button {
          width: 100%;
          border: none;
          border-radius: 18px;
          padding: 16px;
          background: var(--scan-red);
          color: #fff;
          font-size: 0.96rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          box-shadow: 0 14px 28px rgba(230, 28, 36, 0.3);
        }

        .hq-panel {
          padding: 22px;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .hq-kicker {
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--scan-red);
        }

        .hq-title {
          font-size: 1.45rem;
          font-weight: 800;
          line-height: 1.2;
        }

        .hq-copy {
          color: var(--scan-muted);
          line-height: 1.55;
        }

        .hq-mock {
          display: grid;
          gap: 12px;
          margin-top: 6px;
        }

        .hq-mock-card {
          border-radius: 18px;
          padding: 16px;
          background: linear-gradient(180deg, #15191f, #1f252d);
          color: #fff;
          box-shadow: 0 14px 30px rgba(17, 17, 17, 0.18);
        }

        .hq-mock-label {
          font-size: 0.78rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: rgba(255, 255, 255, 0.6);
          margin-bottom: 8px;
        }

        .hq-mock-value {
          font-size: 1.5rem;
          font-weight: 800;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .stat-card {
          padding: 14px 12px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(230, 28, 36, 0.08), rgba(230, 28, 36, 0.02));
          border: 1px solid rgba(230, 28, 36, 0.12);
        }

        .stat-label {
          font-size: 0.72rem;
          line-height: 1.3;
          color: var(--scan-muted);
          margin-bottom: 10px;
        }

        .stat-value {
          font-size: 1.3rem;
          font-weight: 800;
          color: var(--scan-red);
        }

        .chart-shell {
          width: 100%;
          height: 260px;
        }

        .chart-shell.line-shell {
          height: 240px;
        }

        .chart-footnote {
          margin-top: 10px;
          font-size: 0.82rem;
          color: var(--scan-muted);
          line-height: 1.4;
        }

        .pairs-wrap {
          display: flex;
          flex-direction: column;
          gap: 12px;
        }

        .pairs-copy {
          font-size: 0.9rem;
          color: var(--scan-muted);
        }

        .pair-card {
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(17, 17, 17, 0.06);
          background: #fff;
        }

        .pair-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }

        .pair-title {
          font-size: 0.96rem;
          font-weight: 800;
        }

        .pair-percent {
          font-size: 0.88rem;
          font-weight: 800;
          color: var(--scan-red);
        }

        .pair-subtitle {
          font-size: 0.88rem;
          color: var(--scan-muted);
          margin-bottom: 10px;
        }

        .pair-progress {
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: rgba(17, 17, 17, 0.08);
          overflow: hidden;
        }

        .pair-progress-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--scan-red), #ff6c74);
        }

        .alert-card {
          border: 2px solid rgba(230, 28, 36, 0.3);
          box-shadow: 0 16px 34px rgba(230, 28, 36, 0.08);
        }

        .alert-title {
          font-size: 0.8rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--scan-red);
          margin-bottom: 8px;
        }

        .alert-copy {
          font-size: 0.96rem;
          line-height: 1.45;
        }

        .rewards-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .streak-banner {
          padding: 20px 18px;
          border-radius: 24px;
          background: linear-gradient(135deg, #ff5a63, var(--scan-red));
          color: #fff;
          box-shadow: 0 18px 38px rgba(230, 28, 36, 0.24);
        }

        .streak-emoji {
          font-size: 2rem;
          line-height: 1;
          margin-bottom: 8px;
        }

        .streak-title {
          font-size: 1.5rem;
          font-weight: 800;
          margin-bottom: 6px;
        }

        .streak-copy,
        .streak-countdown {
          font-size: 0.94rem;
          line-height: 1.45;
        }

        .streak-countdown {
          margin-top: 10px;
          font-weight: 700;
          color: rgba(255, 255, 255, 0.92);
        }

        .reward-level {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 12px;
        }

        .reward-level-title {
          font-size: 1.05rem;
          font-weight: 800;
        }

        .reward-level-chip {
          font-size: 0.82rem;
          font-weight: 800;
          color: var(--scan-red);
          background: rgba(230, 28, 36, 0.08);
          border: 1px solid rgba(230, 28, 36, 0.12);
          border-radius: 999px;
          padding: 8px 10px;
        }

        .reward-progress-track {
          width: 100%;
          height: 12px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(17, 17, 17, 0.08);
          margin-bottom: 10px;
        }

        .reward-progress-fill {
          width: 68.3%;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #c6cbd3, #8e96a4);
        }

        .reward-progress-copy {
          font-size: 0.9rem;
          color: var(--scan-muted);
          margin-bottom: 10px;
        }

        .reward-preview {
          padding: 14px;
          border-radius: 18px;
          background: #f6f8fb;
          border: 1px solid rgba(17, 17, 17, 0.06);
        }

        .reward-preview-title {
          font-size: 0.82rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--scan-red);
          margin-bottom: 8px;
        }

        .reward-preview-copy {
          font-size: 0.92rem;
          line-height: 1.45;
          color: #424242;
        }

        .claim-card {
          background: linear-gradient(180deg, rgba(25, 165, 90, 0.1), rgba(25, 165, 90, 0.03));
          border: 1px solid rgba(25, 165, 90, 0.2);
        }

        .claim-card-title {
          font-size: 1rem;
          font-weight: 800;
          color: #0d7d42;
          margin-bottom: 8px;
        }

        .claim-button {
          border: none;
          border-radius: 14px;
          padding: 12px 14px;
          background: #0f9c53;
          color: #fff;
          font-size: 0.86rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          margin-top: 14px;
        }

        .claim-code {
          margin-top: 14px;
          padding: 12px 14px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.86);
          border: 1px dashed rgba(15, 156, 83, 0.4);
        }

        .claim-code-label {
          font-size: 0.76rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #0d7d42;
          margin-bottom: 6px;
        }

        .claim-code-value {
          font-size: 1.05rem;
          font-weight: 800;
          color: #16663e;
          letter-spacing: 0.05em;
        }

        .claim-validity {
          margin-top: 8px;
          font-size: 0.84rem;
          color: #397254;
        }

        .achievements-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
        }

        .achievement-card {
          padding: 14px;
          border-radius: 18px;
          border: 1px solid rgba(17, 17, 17, 0.06);
          background: #fff;
          min-height: 120px;
        }

        .achievement-card.locked {
          background: #f3f4f6;
          color: #8b8f95;
        }

        .achievement-icon {
          font-size: 1.15rem;
          margin-bottom: 10px;
        }

        .achievement-title {
          font-size: 0.92rem;
          font-weight: 800;
          margin-bottom: 6px;
        }

        .achievement-subtitle {
          font-size: 0.82rem;
          line-height: 1.4;
          color: inherit;
        }

        .history-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .history-item {
          padding: 14px;
          border-radius: 16px;
          border: 1px solid rgba(17, 17, 17, 0.06);
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .history-title {
          font-size: 0.9rem;
          font-weight: 700;
        }

        .history-date {
          font-size: 0.82rem;
          color: var(--scan-muted);
          white-space: nowrap;
        }

        .bottom-nav {
          position: fixed;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          width: min(92vw, 430px);
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 6px;
          padding: 8px;
          border-radius: 22px;
          background: rgba(18, 20, 24, 0.95);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 18px 40px rgba(17, 17, 17, 0.22);
        }

        .nav-item {
          border: none;
          background: transparent;
          color: rgba(255, 255, 255, 0.7);
          border-radius: 16px;
          padding: 11px 8px;
          font-size: 0.75rem;
          font-weight: 700;
        }

        .nav-item.active {
          background: linear-gradient(135deg, rgba(230, 28, 36, 0.26), rgba(230, 28, 36, 0.14));
          color: #fff;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        @keyframes pulse {
          0%, 100% {
            opacity: 0.4;
            transform: translateY(-1px);
          }
          50% {
            opacity: 1;
            transform: translateY(1px);
          }
        }
      `}</style>

      <main className="screen">
        <header className="topbar">
          <div className="topbar-row">
            <div className="logo">
              <div className="logo-mark">S</div>
              <div className="logo-copy">SCAN</div>
            </div>
            <div className="store-pill">{STORE_NAME}</div>
          </div>

          <div className="mode-switch">
            <button
              className={`mode-button ${activeMode === "cashier" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveMode("cashier")}
            >
              CASHIER MODE
            </button>
            <button
              className={`mode-button ${activeMode === "hq" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveMode("hq")}
            >
              HQ MODE
            </button>
          </div>
        </header>

        {activeMode === "cashier" ? (
          <div className="screen-stack">
            {activeCashierTab === "scan" ? (
              <>
            <section className="panel">
              <div className="camera-frame">
                <video ref={videoRef} muted playsInline />
                <div className="camera-overlay">
                  <div className="status-badge">
                    {isLookingUp ? <span className="spinner" aria-hidden="true" /> : null}
                    <span>{scanStatus}</span>
                  </div>
                  <div className="scan-window" />
                </div>
              </div>
            </section>

            <section className="panel">
              <div className="section-head">
                <div className="section-title">Scanned Basket</div>
                <div className="section-meta">{scannedItems.length} item(s)</div>
              </div>

              {scannedItems.length === 0 ? (
                <div className="empty-card">
                  Open the camera and scan a product barcode to start building the
                  basket.
                </div>
              ) : (
                <ul className="items-list">
                  {scannedItems.map((item) => (
                    <li className="item-card" key={item.id}>
                      <div className="checkmark">✓</div>
                      <div className="item-body">
                        <div className="item-name">
                          {item.isUnknown
                            ? item.customName.trim() || "Unknown Product"
                            : item.name}
                        </div>
                        <div className="item-meta">{item.brand}</div>
                        <div className="item-meta">{item.quantity}</div>
                        {item.isUnknown ? (
                          <input
                            className="unknown-input"
                            type="text"
                            placeholder="Type product name manually"
                            value={item.customName}
                            onChange={(event) =>
                              updateUnknownProductName(item.id, event.target.value)
                            }
                          />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {scannedItems.length > 0 ? (
              <div className="cta-wrap">
                <button className="cta-button" type="button">
                  LOG BASKET
                </button>
              </div>
            ) : null}
              </>
            ) : null}

            {activeCashierTab === "store" ? (
              <>
                <section className="panel">
                  <div className="section-head">
                    <div className="section-title">My Store Snapshot</div>
                    <div className="section-meta">Only {STORE_NAME} data</div>
                  </div>
                  <div className="panel-body">
                    <div className="stats-grid">
                      {MY_STORE_STATS.map((stat) => (
                        <div className="stat-card" key={stat.label}>
                          <div className="stat-label">{stat.label}</div>
                          <div className="stat-value">{stat.value}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="panel">
                  <div className="section-head">
                    <div className="section-title">Top Products Today</div>
                    <div className="section-meta">Most scanned in this store</div>
                  </div>
                  <div className="panel-body">
                    <div className="chart-shell">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={MY_STORE_TOP_PRODUCTS}
                          layout="vertical"
                          margin={{ top: 4, right: 12, left: 18, bottom: 4 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,17,17,0.08)" />
                          <XAxis type="number" tickLine={false} axisLine={false} />
                          <YAxis
                            type="category"
                            dataKey="name"
                            width={110}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 12, fill: "#4f4f4f" }}
                          />
                          <Tooltip
                            cursor={{ fill: "rgba(230, 28, 36, 0.06)" }}
                            contentStyle={{
                              borderRadius: "14px",
                              border: "1px solid rgba(17,17,17,0.08)",
                              boxShadow: "0 12px 24px rgba(17,17,17,0.08)",
                            }}
                          />
                          <Bar
                            dataKey="scans"
                            radius={[0, 10, 10, 0]}
                            fill={PRIMARY_RED}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </section>

                <section className="panel">
                  <div className="section-head">
                    <div className="section-title">Peak Hours Today</div>
                    <div className="section-meta">08:00 - 21:00</div>
                  </div>
                  <div className="panel-body">
                    <div className="chart-shell line-shell">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={MY_STORE_PEAK_HOURS}
                          margin={{ top: 8, right: 12, left: -8, bottom: 2 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(17,17,17,0.08)" />
                          <XAxis
                            dataKey="hour"
                            tickFormatter={(value) => `${value}:00`}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 12, fill: "#5b5b5b" }}
                          />
                          <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: "#5b5b5b" }} />
                          <Tooltip
                            formatter={(value) => [`${value} baskets`, "Volume"]}
                            labelFormatter={(value) => `${value}:00`}
                            contentStyle={{
                              borderRadius: "14px",
                              border: "1px solid rgba(17,17,17,0.08)",
                              boxShadow: "0 12px 24px rgba(17,17,17,0.08)",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="baskets"
                            stroke={PRIMARY_RED}
                            strokeWidth={3}
                            dot={{ r: 4, fill: PRIMARY_RED }}
                            activeDot={{ r: 6 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="chart-footnote">
                      Lunch and evening traffic stand out as the busiest periods
                      in this store today.
                    </div>
                  </div>
                </section>

                <section className="panel">
                  <div className="section-head">
                    <div className="section-title">Top Pairs In My Store</div>
                  </div>
                  <div className="panel-body">
                    <div className="pairs-wrap">
                      <div className="pairs-copy">
                        Your customers most often buy together:
                      </div>
                      {MY_STORE_TOP_PAIRS.map((pair) => (
                        <div className="pair-card" key={pair.title}>
                          <div className="pair-topline">
                            <div className="pair-title">{pair.title}</div>
                            <div className="pair-percent">{pair.percentage}%</div>
                          </div>
                          <div className="pair-subtitle">{pair.subtitle}</div>
                          <div className="pair-progress">
                            <div
                              className="pair-progress-fill"
                              style={{ width: `${pair.percentage}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="panel alert-card">
                  <div className="panel-body">
                    <div className="alert-title">Restock Alert</div>
                    <div className="alert-copy">
                      Coca-Cola 330ml selling fast — consider restocking soon
                    </div>
                  </div>
                </section>
              </>
            ) : null}

            {activeCashierTab === "rewards" ? (
              <div className="rewards-stack">
                <section className="streak-banner">
                  <div className="streak-emoji">🔥</div>
                  <div className="streak-title">7 Day Streak!</div>
                  <div className="streak-copy">
                    Scan at least 5 baskets today to keep it alive
                  </div>
                  <div className="streak-countdown">
                    14 more baskets today to maintain streak
                  </div>
                </section>

                <section className="panel">
                  <div className="section-head">
                    <div className="section-title">Progress To Next Reward</div>
                  </div>
                  <div className="panel-body">
                    <div className="reward-level">
                      <div className="reward-level-title">Current level: SILVER 🥈</div>
                      <div className="reward-level-chip">683/1000 baskets</div>
                    </div>
                    <div className="reward-progress-track">
                      <div className="reward-progress-fill" />
                    </div>
                    <div className="reward-progress-copy">
                      317 baskets until GOLD 🥇
                    </div>
                    <div className="reward-preview">
                      <div className="reward-preview-title">Gold reward preview</div>
                      <div className="reward-preview-copy">
                        10% discount on next CCI order + Priority delivery scheduling
                      </div>
                    </div>
                  </div>
                </section>

                <section className="panel claim-card">
                  <div className="panel-body">
                    <div className="claim-card-title">
                      5% discount on next CCI order
                    </div>
                    <div className="hq-copy">
                      Current unlocked reward for {STORE_NAME}. Claim it when
                      you are ready to place the next order.
                    </div>
                    {hasClaimedReward ? (
                      <div className="claim-code">
                        <div className="claim-code-label">Claim code</div>
                        <div className="claim-code-value">{CURRENT_REWARD.code}</div>
                        <div className="claim-validity">
                          {CURRENT_REWARD.validUntil}
                        </div>
                      </div>
                    ) : (
                      <button
                        className="claim-button"
                        type="button"
                        onClick={() => setHasClaimedReward(true)}
                      >
                        CLAIM DISCOUNT
                      </button>
                    )}
                  </div>
                </section>

                <section className="panel">
                  <div className="section-head">
                    <div className="section-title">Achievements</div>
                    <div className="section-meta">Store progress only</div>
                  </div>
                  <div className="panel-body">
                    <div className="achievements-grid">
                      {ACHIEVEMENTS.map((achievement) => (
                        <div
                          className={`achievement-card ${
                            achievement.unlocked ? "" : "locked"
                          }`}
                          key={achievement.title}
                        >
                          <div className="achievement-icon">{achievement.icon}</div>
                          <div className="achievement-title">
                            {achievement.title}
                          </div>
                          <div className="achievement-subtitle">
                            {achievement.subtitle}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="panel">
                  <div className="section-head">
                    <div className="section-title">Reward History</div>
                  </div>
                  <div className="panel-body">
                    <ul className="history-list">
                      {REWARD_HISTORY.map((reward) => (
                        <li className="history-item" key={`${reward.title}-${reward.date}`}>
                          <div className="history-title">{reward.title}</div>
                          <div className="history-date">{reward.date}</div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              </div>
            ) : null}

            {activeCashierTab === "rankings" ? (
              <section className="panel hq-panel">
                <div className="hq-kicker">Cashier Feature</div>
                <div className="hq-title">Rankings screen comes next</div>
                <div className="hq-copy">
                  This tab is reserved for comparative gamification later. No
                  external store data is shown in My Store.
                </div>
              </section>
            ) : null}
          </div>
        ) : (
          <section className="panel hq-panel">
            <div className="hq-kicker">CCI Headquarters View</div>
            <div className="hq-title">HQ Mode ready for the next step</div>
            <div className="hq-copy">
              The app shell now supports two separate modes behind a header switch.
              Cashier Mode is fully wired first, and HQ Mode is reserved for the
              laptop dashboard we can build next.
            </div>

            <div className="hq-mock">
              <div className="hq-mock-card">
                <div className="hq-mock-label">Region</div>
                <div className="hq-mock-value">Baku Live Network</div>
              </div>
              <div className="hq-mock-card">
                <div className="hq-mock-label">Next Build Step</div>
                <div className="hq-mock-value">Analytics Dashboard</div>
              </div>
            </div>
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="Primary">
        <button
          className={`nav-item ${activeCashierTab === "scan" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveCashierTab("scan")}
        >
          Scan
        </button>
        <button
          className={`nav-item ${activeCashierTab === "store" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveCashierTab("store")}
        >
          My Store
        </button>
        <button
          className={`nav-item ${activeCashierTab === "rewards" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveCashierTab("rewards")}
        >
          Rewards
        </button>
        <button
          className={`nav-item ${activeCashierTab === "rankings" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveCashierTab("rankings")}
        >
          Rankings
        </button>
      </nav>
    </div>
  );
}
