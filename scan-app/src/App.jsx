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

function seedMockBaskets() {
  if (typeof window === "undefined") {
    return;
  }

  const existingBaskets = window.localStorage.getItem(BASKETS_STORAGE_KEY);

  if (existingBaskets) {
    return;
  }

  window.localStorage.setItem(
    BASKETS_STORAGE_KEY,
    JSON.stringify(buildMockBaskets())
  );
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

export default function App() {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);
  const recentScansRef = useRef(new Map());
  const pendingBarcodesRef = useRef(new Set());
  const mountedRef = useRef(false);
  const resetTimerRef = useRef(null);

  const [scanStatus, setScanStatus] = useState("Starting camera...");
  const [products, setProducts] = useState([]);
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
    seedMockBaskets();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const recentScans = recentScansRef.current;
    const pendingBarcodes = pendingBarcodesRef.current;
    const resetTimer = resetTimerRef;

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
      window.clearTimeout(resetTimer.current);
      recentScans.clear();
      pendingBarcodes.clear();
    };
  }, []);

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

    const storedBaskets = JSON.parse(
      window.localStorage.getItem(BASKETS_STORAGE_KEY) || "[]"
    );

    window.localStorage.setItem(
      BASKETS_STORAGE_KEY,
      JSON.stringify([basketRecord, ...storedBaskets])
    );

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

  return (
    <div className="app-shell">
      <style>{`
        @import url("https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;700;800&display=swap");

        :root {
          color-scheme: light;
          --scan-red: ${PRIMARY_RED};
          --scan-red-soft: rgba(230, 28, 36, 0.08);
          --scan-red-border: rgba(230, 28, 36, 0.18);
          --scan-green: ${SUCCESS_GREEN};
          --scan-ink: #141414;
          --scan-muted: #666666;
          --scan-panel: #ffffff;
          --scan-bg: #f6f7f9;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          font-family: "Space Grotesk", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          background:
            radial-gradient(circle at top, rgba(230, 28, 36, 0.12), transparent 34%),
            var(--scan-bg);
          color: var(--scan-ink);
        }

        button,
        input {
          font: inherit;
        }

        .app-shell {
          min-height: 100vh;
          width: 100%;
          max-width: 420px;
          margin: 0 auto;
          padding: 20px 16px 28px;
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

        @media (min-width: 640px) {
          .app-shell {
            padding-top: 28px;
          }
        }
      `}</style>

      <main className="cashier-card">
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
            {logMessage ? <div className="log-message">{logMessage}</div> : null}
          </div>
        ) : null}
      </main>
    </div>
  );
}
