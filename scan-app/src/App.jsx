import { useEffect, useEffectEvent, useRef, useState } from "react";

const ZXING_CDN_URL =
  "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm";
const OPEN_FOOD_FACTS_API = "https://world.openfoodfacts.org/api/v2/product";
const DUPLICATE_SCAN_WINDOW_MS = 3000;
const PRIMARY_RED = "#E61C24";
const SUCCESS_GREEN = "#19A55A";
const BASKETS_STORAGE_KEY = "scan:baskets";
const DEFAULT_STORE = "Store #47 — Narimanov, Baku";

const MOCK_STORES = [
  "Store #47 — Narimanov, Baku",
  "Store #12 — Yasamal, Baku",
  "Store #31 — Khatai, Baku",
  "Store #8 — Sabunchu, Baku",
  "Store #22 — Surakhani, Baku",
];

const MOCK_COMBINATIONS = [
  {
    count: 12,
    items: ["Coca-Cola 330ml", "Lays Original 40g"],
  },
  {
    count: 10,
    items: ["Fanta Orange 500ml", "Chips Mix 50g"],
  },
  {
    count: 8,
    items: ["Sprite 500ml", "Chicken Sandwich"],
  },
  {
    count: 7,
    items: ["Coca-Cola 330ml", "Azerchay Black Tea"],
  },
  {
    count: 6,
    items: ["Hell Energy Drink 250ml"],
  },
  {
    count: 7,
    items: ["Coca-Cola 330ml", "Sirab Water 500ml", "White Bread"],
  },
];

function buildMockBaskets() {
  const now = new Date();
  const mockBaskets = [];
  let sequence = 0;

  MOCK_COMBINATIONS.forEach((combo, comboIndex) => {
    for (let index = 0; index < combo.count; index += 1) {
      const offsetHours = comboIndex * 9 + index * 5;
      const basketDate = new Date(
        now.getTime() - (offsetHours * 60 + (index % 3) * 17) * 60 * 1000
      );

      basketDate.setDate(now.getDate() - ((sequence * 3 + comboIndex) % 12));
      basketDate.setHours(8 + ((comboIndex * 2 + index * 3) % 13));
      basketDate.setMinutes(((index * 11 + comboIndex * 7) % 6) * 10 + 2);

      mockBaskets.push({
        id: basketDate.getTime() + sequence,
        store: MOCK_STORES[(comboIndex + index) % MOCK_STORES.length],
        time: basketDate.toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }),
        day: basketDate.toLocaleDateString([], { weekday: "long" }),
        items: combo.items,
      });

      sequence += 1;
    }
  });

  return mockBaskets.sort((a, b) => b.id - a.id);
}

function readStoredBaskets() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const parsedBaskets = JSON.parse(
      window.localStorage.getItem(BASKETS_STORAGE_KEY) || "[]"
    );

    return Array.isArray(parsedBaskets) ? parsedBaskets : [];
  } catch {
    return [];
  }
}

function writeStoredBaskets(nextBaskets) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(
    BASKETS_STORAGE_KEY,
    JSON.stringify(nextBaskets)
  );
}

function seedMockBaskets() {
  if (typeof window === "undefined") {
    return;
  }

  const existingBaskets = window.localStorage.getItem(BASKETS_STORAGE_KEY);

  if (existingBaskets) {
    return;
  }

  writeStoredBaskets(buildMockBaskets());
}

function buildLoggedItemLabel(product) {
  const itemName = product.isUnknown
    ? product.customName.trim() || "Unknown Product"
    : product.name;

  if (
    !product.quantity ||
    product.quantity === "Quantity unavailable" ||
    itemName.toLowerCase().includes(product.quantity.toLowerCase())
  ) {
    return itemName;
  }

  return `${itemName} ${product.quantity}`;
}

function playSuccessFeedback() {
  if (navigator.vibrate) {
    navigator.vibrate(120);
  }

  const AudioContextClass =
    window.AudioContext || window.webkitAudioContext || null;

  if (!AudioContextClass) {
    return;
  }

  const audioContext = new AudioContextClass();
  const oscillator = audioContext.createOscillator();
  const gainNode = audioContext.createGain();
  const startTime = audioContext.currentTime;

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(740, startTime);
  oscillator.frequency.exponentialRampToValueAtTime(980, startTime + 0.12);
  gainNode.gain.setValueAtTime(0.0001, startTime);
  gainNode.gain.exponentialRampToValueAtTime(0.12, startTime + 0.02);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.2);

  oscillator.connect(gainNode);
  gainNode.connect(audioContext.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + 0.22);
  oscillator.onended = () => {
    void audioContext.close();
  };
}

function normalizeProduct(product = {}) {
  return {
    name: product.product_name?.trim() || "Unknown Product",
    brand: product.brands?.trim() || "Brand unavailable",
    quantity: product.quantity?.trim() || "Quantity unavailable",
  };
}

function isSameCalendarDay(timestamp, comparisonDate) {
  const basketDate = new Date(timestamp);

  return (
    basketDate.getFullYear() === comparisonDate.getFullYear() &&
    basketDate.getMonth() === comparisonDate.getMonth() &&
    basketDate.getDate() === comparisonDate.getDate()
  );
}

function buildPairInsights(baskets) {
  const pairCounts = new Map();

  baskets.forEach((basket) => {
    const uniqueItems = [...new Set(basket.items || [])].sort((left, right) =>
      left.localeCompare(right)
    );

    for (let firstIndex = 0; firstIndex < uniqueItems.length; firstIndex += 1) {
      for (
        let secondIndex = firstIndex + 1;
        secondIndex < uniqueItems.length;
        secondIndex += 1
      ) {
        const label = `${uniqueItems[firstIndex]} + ${uniqueItems[secondIndex]}`;
        pairCounts.set(label, (pairCounts.get(label) || 0) + 1);
      }
    }
  });

  const totalBaskets = Math.max(baskets.length, 1);

  return [...pairCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 5)
    .map(([label, count]) => ({
      label,
      count,
      percentage: Math.round((count / totalBaskets) * 100),
    }));
}

function buildPeakHours(baskets) {
  const hours = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: `${String(hour).padStart(2, "0")}:00`,
    count: 0,
  }));

  baskets.forEach((basket) => {
    const hour = new Date(basket.id).getHours();
    hours[hour].count += 1;
  });

  const maxCount = Math.max(1, ...hours.map((entry) => entry.count));

  return hours.map((entry) => ({
    ...entry,
    height: `${Math.max((entry.count / maxCount) * 100, entry.count ? 10 : 4)}%`,
  }));
}

function buildTopStores(baskets, today) {
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const todayCounts = new Map(MOCK_STORES.map((store) => [store, 0]));
  const yesterdayCounts = new Map(MOCK_STORES.map((store) => [store, 0]));

  baskets.forEach((basket) => {
    if (!todayCounts.has(basket.store)) {
      todayCounts.set(basket.store, 0);
      yesterdayCounts.set(basket.store, 0);
    }

    if (isSameCalendarDay(basket.id, today)) {
      todayCounts.set(basket.store, (todayCounts.get(basket.store) || 0) + 1);
    }

    if (isSameCalendarDay(basket.id, yesterday)) {
      yesterdayCounts.set(
        basket.store,
        (yesterdayCounts.get(basket.store) || 0) + 1
      );
    }
  });

  return [...todayCounts.keys()]
    .map((store) => {
      const basketCount = todayCounts.get(store) || 0;
      const yesterdayCount = yesterdayCounts.get(store) || 0;
      const delta = basketCount - yesterdayCount;

      if (delta > 0) {
        return {
          store,
          basketCount,
          trendArrow: "↑",
          trendLabel: `+${delta} vs yesterday`,
          trendClass: "trend-up",
        };
      }

      if (delta < 0) {
        return {
          store,
          basketCount,
          trendArrow: "↓",
          trendLabel: `${delta} vs yesterday`,
          trendClass: "trend-down",
        };
      }

      return {
        store,
        basketCount,
        trendArrow: "→",
        trendLabel: "Flat vs yesterday",
        trendClass: "trend-flat",
      };
    })
    .sort(
      (left, right) =>
        right.basketCount - left.basketCount || left.store.localeCompare(right.store)
    );
}

function buildRecentTransactions(baskets) {
  return [...baskets].sort((left, right) => right.id - left.id).slice(0, 10);
}

function formatTransactionItems(items = []) {
  return items.join(", ");
}

export default function App() {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);
  const recentScansRef = useRef(new Map());
  const pendingBarcodesRef = useRef(new Set());
  const mountedRef = useRef(false);
  const resetTimerRef = useRef(null);

  const [activeTab, setActiveTab] = useState("cashier");
  const [scanStatus, setScanStatus] = useState("Starting camera...");
  const [products, setProducts] = useState([]);
  const [baskets, setBaskets] = useState(() => {
    if (typeof window === "undefined") {
      return [];
    }

    seedMockBaskets();
    return readStoredBaskets();
  });
  const [isLogging, setIsLogging] = useState(false);
  const [logMessage, setLogMessage] = useState("");
  const [showSuccessState, setShowSuccessState] = useState(false);

  const handleDetectedBarcode = useEffectEvent(async (barcode) => {
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
    setScanStatus(`Detected ${trimmedBarcode}. Looking up product...`);

    try {
      const response = await fetch(
        `${OPEN_FOOD_FACTS_API}/${encodeURIComponent(trimmedBarcode)}`,
        {
          headers: { Accept: "application/json" },
        }
      );
      const data = await response.json();
      const foundProduct = response.ok && data?.status === 1 && data?.product;

      const productDetails = foundProduct
        ? normalizeProduct(data.product)
        : {
            name: "Unknown Product",
            brand: "Manual entry needed",
            quantity: "Unknown quantity",
          };

      setProducts((currentProducts) => [
        {
          id: `${trimmedBarcode}-${Date.now()}`,
          barcode: trimmedBarcode,
          customName:
            productDetails.name === "Unknown Product" ? "" : productDetails.name,
          isUnknown: productDetails.name === "Unknown Product",
          ...productDetails,
        },
        ...currentProducts,
      ]);

      setScanStatus(
        foundProduct
          ? `Added ${productDetails.name}. Keep scanning.`
          : `Barcode ${trimmedBarcode} not found. Add a name manually.`
      );
    } catch {
      setProducts((currentProducts) => [
        {
          id: `${trimmedBarcode}-${Date.now()}`,
          barcode: trimmedBarcode,
          name: "Unknown Product",
          brand: "Lookup failed",
          quantity: "Unknown quantity",
          customName: "",
          isUnknown: true,
        },
        ...currentProducts,
      ]);

      setScanStatus("Lookup failed. You can still add the product manually.");
    } finally {
      pendingBarcodesRef.current.delete(trimmedBarcode);
    }
  });

  useEffect(() => {
    const handleStorageSync = (event) => {
      if (!event.key || event.key === BASKETS_STORAGE_KEY) {
        setBaskets(readStoredBaskets());
      }
    };

    window.addEventListener("storage", handleStorageSync);

    return () => {
      window.clearTimeout(resetTimerRef.current);
      window.removeEventListener("storage", handleStorageSync);
    };
  }, []);

  useEffect(() => {
    const recentScans = recentScansRef.current;
    const pendingBarcodes = pendingBarcodesRef.current;

    if (activeTab !== "cashier") {
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
  }, [activeTab]);

  const updateManualName = (id, value) => {
    setProducts((currentProducts) =>
      currentProducts.map((product) =>
        product.id === id ? { ...product, customName: value } : product
      )
    );
  };

  const handleLogBasket = async () => {
    if (!products.length) {
      return;
    }

    setIsLogging(true);
    setLogMessage("");
    setShowSuccessState(false);

    const now = new Date();
    const basketRecord = {
      id: now.getTime(),
      store: DEFAULT_STORE,
      time: now.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }),
      day: now.toLocaleDateString([], { weekday: "long" }),
      items: products.map(buildLoggedItemLabel),
    };

    const nextBaskets = [basketRecord, ...readStoredBaskets()];
    writeStoredBaskets(nextBaskets);
    setBaskets(nextBaskets);

    playSuccessFeedback();
    setIsLogging(false);
    setShowSuccessState(true);
    setLogMessage("Basket logged!");
    setScanStatus("Basket logged! Ready to scan the next customer.");

    window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => {
      setProducts([]);
      setLogMessage("");
      setShowSuccessState(false);
      setScanStatus("Point the camera at a barcode.");
    }, 1500);
  };

  const today = new Date();
  const todayBaskets = baskets.filter((basket) =>
    isSameCalendarDay(basket.id, today)
  );
  const topPairs = buildPairInsights(baskets);
  const peakHours = buildPeakHours(baskets);
  const topStores = buildTopStores(baskets, today);
  const recentTransactions = buildRecentTransactions(baskets);
  const peakHourMax = Math.max(1, ...peakHours.map((entry) => entry.count));

  return (
    <div className="app-shell">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&display=swap");

        :root {
          color-scheme: light;
          --scan-red: ${PRIMARY_RED};
          --scan-red-soft: rgba(230, 28, 36, 0.08);
          --scan-red-border: rgba(230, 28, 36, 0.18);
          --scan-red-deep: #8f1117;
          --scan-green: ${SUCCESS_GREEN};
          --scan-ink: #141414;
          --scan-muted: #666666;
          --scan-panel: #ffffff;
          --scan-panel-dark: #12161c;
          --scan-panel-dark-2: #1a2028;
          --scan-panel-text: #f7f8fa;
          --scan-panel-muted: #9ba5b4;
          --scan-bg: #f3f5f7;
          --scan-line: rgba(255, 255, 255, 0.08);
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background:
            radial-gradient(circle at top, rgba(230, 28, 36, 0.12), transparent 30%),
            linear-gradient(180deg, #f7f8fa, #eef1f4 70%);
          color: var(--scan-ink);
        }

        button,
        input {
          font: inherit;
        }

        .app-shell {
          min-height: 100vh;
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
          padding: 20px 16px 110px;
        }

        .cashier-view {
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
        }

        .cashier-card {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .brand {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .brand-mark {
          font-size: 1.8rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          color: var(--scan-red);
        }

        .brand-copy {
          font-size: 0.9rem;
          color: var(--scan-muted);
        }

        .badge {
          padding: 8px 12px;
          border-radius: 999px;
          background: var(--scan-red-soft);
          color: var(--scan-red);
          font-size: 0.82rem;
          font-weight: 700;
        }

        .camera-panel,
        .list-panel {
          background: var(--scan-panel);
          border: 1px solid rgba(20, 20, 20, 0.06);
          border-radius: 24px;
          box-shadow: 0 12px 30px rgba(20, 20, 20, 0.06);
          overflow: hidden;
        }

        .camera-frame {
          position: relative;
          aspect-ratio: 3 / 4;
          background:
            linear-gradient(180deg, rgba(20, 20, 20, 0.04), rgba(20, 20, 20, 0.12)),
            #1f1f1f;
        }

        .camera-frame video {
          width: 100%;
          height: 100%;
          object-fit: cover;
          display: block;
        }

        .scanner-overlay {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 18px;
          pointer-events: none;
        }

        .scanner-status {
          align-self: flex-start;
          max-width: 80%;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.88);
          backdrop-filter: blur(8px);
          color: var(--scan-ink);
          font-size: 0.88rem;
          line-height: 1.35;
        }

        .target {
          align-self: center;
          width: 78%;
          height: 120px;
          border-radius: 20px;
          border: 2px solid rgba(255, 255, 255, 0.95);
          box-shadow: 0 0 0 999px rgba(20, 20, 20, 0.24);
          position: relative;
        }

        .target::before,
        .target::after {
          content: "";
          position: absolute;
          left: 12px;
          right: 12px;
          height: 2px;
          background: rgba(230, 28, 36, 0.95);
          animation: pulseLine 2.2s ease-in-out infinite;
        }

        .target::before {
          top: 26px;
        }

        .target::after {
          bottom: 26px;
        }

        @keyframes pulseLine {
          0%, 100% {
            opacity: 0.4;
            transform: scaleX(0.9);
          }
          50% {
            opacity: 1;
            transform: scaleX(1);
          }
        }

        .panel-head {
          padding: 16px 18px 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .panel-title {
          font-size: 0.98rem;
          font-weight: 700;
        }

        .panel-meta {
          font-size: 0.84rem;
          color: var(--scan-muted);
        }

        .product-list {
          list-style: none;
          padding: 0 12px 12px;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .product-item,
        .empty-state {
          border: 1px solid rgba(20, 20, 20, 0.06);
          border-radius: 18px;
          background: #fff;
        }

        .product-item {
          padding: 14px;
          display: flex;
          gap: 12px;
          align-items: flex-start;
        }

        .checkmark {
          width: 28px;
          height: 28px;
          flex: 0 0 28px;
          border-radius: 50%;
          background: rgba(25, 165, 90, 0.12);
          color: var(--scan-green);
          display: grid;
          place-items: center;
          font-size: 1rem;
          font-weight: 800;
          margin-top: 2px;
        }

        .product-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .product-name {
          font-size: 0.98rem;
          font-weight: 700;
          line-height: 1.3;
        }

        .product-meta {
          font-size: 0.9rem;
          color: var(--scan-muted);
          line-height: 1.35;
        }

        .manual-input {
          width: 100%;
          padding: 12px 14px;
          border-radius: 14px;
          border: 1px solid var(--scan-red-border);
          background: #fffafa;
          color: var(--scan-ink);
          outline: none;
        }

        .manual-input:focus {
          border-color: var(--scan-red);
          box-shadow: 0 0 0 4px rgba(230, 28, 36, 0.1);
        }

        .empty-state {
          padding: 18px;
          text-align: center;
          color: var(--scan-muted);
          font-size: 0.92rem;
          line-height: 1.45;
        }

        .log-action {
          position: sticky;
          bottom: 18px;
          margin-top: 4px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .log-button {
          border: none;
          border-radius: 18px;
          padding: 16px;
          width: 100%;
          background: var(--scan-red);
          color: #fff;
          font-size: 0.96rem;
          font-weight: 800;
          letter-spacing: 0.04em;
          box-shadow: 0 12px 24px rgba(230, 28, 36, 0.28);
        }

        .log-button:disabled {
          opacity: 0.7;
        }

        .log-message {
          text-align: center;
          font-size: 0.88rem;
          color: var(--scan-muted);
        }

        .success-banner {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          padding: 15px 16px;
          border-radius: 18px;
          background: linear-gradient(135deg, rgba(25, 165, 90, 0.16), rgba(25, 165, 90, 0.06));
          border: 1px solid rgba(25, 165, 90, 0.22);
          color: #0f7e44;
          animation: successPop 260ms ease-out;
        }

        .success-badge {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          display: grid;
          place-items: center;
          background: var(--scan-green);
          color: #fff;
          font-weight: 800;
          box-shadow: 0 10px 20px rgba(25, 165, 90, 0.2);
        }

        .success-copy {
          font-size: 0.96rem;
          font-weight: 700;
          letter-spacing: 0.01em;
        }

        .dashboard-view {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .dashboard-header {
          display: flex;
          flex-direction: column;
          gap: 16px;
          padding: 22px;
          border-radius: 28px;
          background:
            linear-gradient(135deg, rgba(230, 28, 36, 0.14), rgba(18, 22, 28, 0.04) 42%),
            var(--scan-panel);
          border: 1px solid rgba(230, 28, 36, 0.12);
          box-shadow: 0 18px 45px rgba(20, 20, 20, 0.08);
        }

        .dashboard-eyebrow {
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--scan-red);
        }

        .dashboard-title {
          font-size: clamp(1.8rem, 3vw, 2.7rem);
          font-weight: 800;
          letter-spacing: -0.03em;
          color: #11161b;
        }

        .dashboard-subtitle {
          font-size: 0.98rem;
          color: #5f6976;
        }

        .dashboard-metric {
          align-self: flex-start;
          display: inline-flex;
          flex-direction: column;
          gap: 2px;
          padding: 14px 16px;
          border-radius: 18px;
          background: var(--scan-panel-dark);
          color: var(--scan-panel-text);
          min-width: 170px;
        }

        .dashboard-metric-label {
          font-size: 0.78rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--scan-panel-muted);
        }

        .dashboard-metric-value {
          font-size: 1.75rem;
          font-weight: 800;
          color: #fff;
        }

        .dashboard-grid {
          display: grid;
          grid-template-columns: repeat(12, minmax(0, 1fr));
          gap: 16px;
        }

        .dashboard-card {
          grid-column: span 12;
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 20px;
          border-radius: 24px;
          background:
            linear-gradient(180deg, rgba(255, 255, 255, 0.04), transparent 35%),
            var(--scan-panel-dark);
          color: var(--scan-panel-text);
          border: 1px solid var(--scan-line);
          box-shadow: 0 18px 38px rgba(10, 14, 18, 0.18);
        }

        .dashboard-card-head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .dashboard-card-title {
          font-size: 1rem;
          font-weight: 700;
        }

        .dashboard-card-copy {
          font-size: 0.88rem;
          color: var(--scan-panel-muted);
        }

        .pair-list,
        .store-list,
        .transaction-list {
          list-style: none;
          padding: 0;
          margin: 0;
          display: flex;
          flex-direction: column;
          gap: 14px;
        }

        .pair-row {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .pair-line {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          font-size: 0.92rem;
        }

        .pair-label {
          color: #f5f7fb;
          min-width: 0;
          flex: 1;
        }

        .pair-value {
          color: #ffd9db;
          font-weight: 700;
          white-space: nowrap;
        }

        .pair-bar {
          width: 100%;
          height: 12px;
          border-radius: 999px;
          overflow: hidden;
          background: rgba(255, 255, 255, 0.08);
        }

        .pair-bar-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--scan-red), #ff7d84);
        }

        .peak-chart {
          display: grid;
          grid-template-columns: repeat(24, minmax(20px, 1fr));
          gap: 8px;
          align-items: end;
          min-height: 220px;
          overflow-x: auto;
          padding-bottom: 4px;
        }

        .peak-column {
          min-width: 20px;
          display: flex;
          flex-direction: column;
          justify-content: flex-end;
          gap: 8px;
          text-align: center;
        }

        .peak-value {
          font-size: 0.72rem;
          color: var(--scan-panel-muted);
        }

        .peak-bar-track {
          height: 148px;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }

        .peak-bar {
          width: 100%;
          border-radius: 12px 12px 6px 6px;
          background: linear-gradient(180deg, #ff6b72, var(--scan-red-deep));
          box-shadow: 0 8px 18px rgba(230, 28, 36, 0.25);
        }

        .peak-label {
          font-size: 0.72rem;
          color: #ced4dd;
        }

        .store-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto auto;
          gap: 12px;
          align-items: center;
          padding: 14px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.08);
        }

        .store-row:first-child {
          border-top: none;
          padding-top: 0;
        }

        .store-name {
          font-size: 0.94rem;
          font-weight: 700;
          color: #f7f8fa;
        }

        .store-count {
          font-size: 1rem;
          font-weight: 800;
          color: #ffffff;
        }

        .store-trend {
          justify-self: end;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 0.8rem;
          font-weight: 700;
        }

        .trend-up {
          color: #4ee08f;
        }

        .trend-down {
          color: #ff9c84;
        }

        .trend-flat {
          color: #c7ced8;
        }

        .transaction-feed {
          display: flex;
          flex-direction: column;
          gap: 14px;
          max-height: 520px;
          overflow-y: auto;
          padding-right: 4px;
        }

        .transaction-feed::-webkit-scrollbar,
        .peak-chart::-webkit-scrollbar {
          height: 8px;
          width: 8px;
        }

        .transaction-feed::-webkit-scrollbar-thumb,
        .peak-chart::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.16);
          border-radius: 999px;
        }

        .transaction-item {
          padding: 14px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.05);
          border: 1px solid rgba(255, 255, 255, 0.08);
          animation: transactionSlide 320ms ease-out;
        }

        .transaction-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 8px;
        }

        .transaction-time {
          font-size: 0.82rem;
          font-weight: 800;
          color: #ffffff;
        }

        .transaction-store {
          font-size: 0.84rem;
          color: #ffc6ca;
          text-align: right;
        }

        .transaction-items {
          font-size: 0.9rem;
          line-height: 1.45;
          color: #dce3ec;
        }

        .dashboard-empty {
          padding: 16px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.05);
          color: var(--scan-panel-muted);
          font-size: 0.9rem;
        }

        .bottom-nav {
          position: fixed;
          left: 50%;
          bottom: 18px;
          transform: translateX(-50%);
          z-index: 20;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 10px;
          width: min(92vw, 460px);
          padding: 10px;
          border-radius: 24px;
          background: rgba(18, 22, 28, 0.92);
          backdrop-filter: blur(14px);
          border: 1px solid rgba(255, 255, 255, 0.08);
          box-shadow: 0 18px 40px rgba(10, 14, 18, 0.28);
        }

        .nav-tab {
          border: none;
          border-radius: 18px;
          padding: 12px 14px;
          background: transparent;
          color: #dce3ec;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .nav-tab.active {
          background: linear-gradient(135deg, rgba(230, 28, 36, 0.22), rgba(230, 28, 36, 0.12));
          color: #fff;
          box-shadow: inset 0 0 0 1px rgba(230, 28, 36, 0.28);
        }

        .nav-icon {
          font-size: 1.1rem;
        }

        @keyframes successPop {
          0% {
            opacity: 0;
            transform: scale(0.96) translateY(10px);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        @keyframes transactionSlide {
          0% {
            opacity: 0;
            transform: translateY(-12px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (min-width: 760px) {
          .app-shell {
            padding-top: 28px;
          }

          .dashboard-header {
            flex-direction: row;
            align-items: flex-end;
            justify-content: space-between;
          }

          .dashboard-card.pairs-card,
          .dashboard-card.hours-card {
            grid-column: span 7;
          }

          .dashboard-card.stores-card,
          .dashboard-card.transactions-card {
            grid-column: span 5;
          }
        }
      `}</style>

      {activeTab === "cashier" ? (
        <main className="cashier-view">
          <section className="cashier-card">
            <header className="header">
              <div className="brand">
                <div className="brand-mark">SCAN</div>
                <div className="brand-copy">Cashier View</div>
              </div>
              <div className="badge">Live Scanner</div>
            </header>

            <section className="camera-panel">
              <div className="camera-frame">
                <video ref={videoRef} muted playsInline />
                <div className="scanner-overlay">
                  <div className="scanner-status">{scanStatus}</div>
                  <div className="target" />
                </div>
              </div>
            </section>

            <section className="list-panel">
              <div className="panel-head">
                <div className="panel-title">Scanned Products</div>
                <div className="panel-meta">{products.length} item(s)</div>
              </div>

              {products.length === 0 ? (
                <div className="empty-state">
                  Keep the camera open and aim at a barcode to build the basket.
                </div>
              ) : (
                <ul className="product-list">
                  {products.map((product) => (
                    <li className="product-item" key={product.id}>
                      <div className="checkmark">✓</div>
                      <div className="product-content">
                        <div className="product-name">
                          {product.isUnknown
                            ? product.customName.trim() || "Unknown Product"
                            : product.name}
                        </div>
                        <div className="product-meta">{product.brand}</div>
                        <div className="product-meta">{product.quantity}</div>
                        {product.isUnknown ? (
                          <input
                            className="manual-input"
                            type="text"
                            placeholder="Type product name"
                            value={product.customName}
                            onChange={(event) =>
                              updateManualName(product.id, event.target.value)
                            }
                          />
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {products.length > 0 ? (
              <div className="log-action">
                {showSuccessState ? (
                  <div className="success-banner" role="status" aria-live="polite">
                    <div className="success-badge">✓</div>
                    <div className="success-copy">Basket logged!</div>
                  </div>
                ) : (
                  <button
                    className="log-button"
                    type="button"
                    onClick={handleLogBasket}
                    disabled={isLogging}
                  >
                    {isLogging ? "LOGGING..." : "LOG BASKET"}
                  </button>
                )}
                {logMessage ? (
                  <div className="log-message">{logMessage}</div>
                ) : null}
              </div>
            ) : null}
          </section>
        </main>
      ) : (
        <main className="dashboard-view">
          <header className="dashboard-header">
            <div className="brand">
              <div className="dashboard-eyebrow">CCI RED</div>
              <div className="dashboard-title">CCI SCAN Dashboard</div>
              <div className="dashboard-subtitle">Baku Region — Live Data</div>
            </div>
            <div className="dashboard-metric">
              <div className="dashboard-metric-label">Baskets Logged Today</div>
              <div className="dashboard-metric-value">{todayBaskets.length}</div>
            </div>
          </header>

          <section className="dashboard-grid">
            <article className="dashboard-card pairs-card">
              <div className="dashboard-card-head">
                <div>
                  <div className="dashboard-card-title">Top Basket Pairs</div>
                  <div className="dashboard-card-copy">
                    Most frequent co-purchases across the basket history
                  </div>
                </div>
              </div>

              {topPairs.length > 0 ? (
                <ul className="pair-list">
                  {topPairs.map((pair) => (
                    <li className="pair-row" key={pair.label}>
                      <div className="pair-line">
                        <span className="pair-label">{pair.label}</span>
                        <span className="pair-value">{pair.percentage}%</span>
                      </div>
                      <div className="pair-bar">
                        <div
                          className="pair-bar-fill"
                          style={{ width: `${pair.percentage}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="dashboard-empty">
                  Start logging baskets to surface cross-sell patterns.
                </div>
              )}
            </article>

            <article className="dashboard-card stores-card">
              <div className="dashboard-card-head">
                <div>
                  <div className="dashboard-card-title">Top Stores Today</div>
                  <div className="dashboard-card-copy">
                    Ranked by basket volume with day-over-day trend
                  </div>
                </div>
              </div>

              <ul className="store-list">
                {topStores.map((store) => (
                  <li className="store-row" key={store.store}>
                    <div className="store-name">{store.store}</div>
                    <div className="store-count">{store.basketCount}</div>
                    <div className={`store-trend ${store.trendClass}`}>
                      <span>{store.trendArrow}</span>
                      <span>{store.trendLabel}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </article>

            <article className="dashboard-card hours-card">
              <div className="dashboard-card-head">
                <div>
                  <div className="dashboard-card-title">Peak Hours</div>
                  <div className="dashboard-card-copy">
                    Transaction volume by hour of day from all captured baskets
                  </div>
                </div>
                <div className="dashboard-card-copy">
                  Peak volume: {peakHourMax}
                </div>
              </div>

              <div className="peak-chart" aria-label="Peak hours bar chart">
                {peakHours.map((entry) => (
                  <div className="peak-column" key={entry.hour}>
                    <div className="peak-value">{entry.count}</div>
                    <div className="peak-bar-track">
                      <div
                        className="peak-bar"
                        style={{ height: entry.height }}
                        title={`${entry.label}: ${entry.count} baskets`}
                      />
                    </div>
                    <div className="peak-label">{entry.label.slice(0, 2)}</div>
                  </div>
                ))}
              </div>
            </article>

            <article className="dashboard-card transactions-card">
              <div className="dashboard-card-head">
                <div>
                  <div className="dashboard-card-title">
                    Recent Transactions
                  </div>
                  <div className="dashboard-card-copy">
                    Last 10 baskets logged across the region
                  </div>
                </div>
              </div>

              {recentTransactions.length > 0 ? (
                <div className="transaction-feed">
                  {recentTransactions.map((transaction) => (
                    <div className="transaction-item" key={transaction.id}>
                      <div className="transaction-head">
                        <div className="transaction-time">
                          {transaction.day}, {transaction.time}
                        </div>
                        <div className="transaction-store">
                          {transaction.store}
                        </div>
                      </div>
                      <div className="transaction-items">
                        {formatTransactionItems(transaction.items)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="dashboard-empty">
                  No baskets yet. Logged transactions will appear here live.
                </div>
              )}
            </article>
          </section>
        </main>
      )}

      <nav className="bottom-nav" aria-label="Primary">
        <button
          className={`nav-tab ${activeTab === "cashier" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("cashier")}
          aria-pressed={activeTab === "cashier"}
        >
          <span className="nav-icon">⌁</span>
          <span>Cashier</span>
        </button>
        <button
          className={`nav-tab ${activeTab === "dashboard" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("dashboard")}
          aria-pressed={activeTab === "dashboard"}
        >
          <span className="nav-icon">▥</span>
          <span>Dashboard</span>
        </button>
      </nav>
    </div>
  );
}
