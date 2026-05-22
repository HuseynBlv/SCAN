import { useEffect, useRef, useState } from "react";

const ZXING_CDN_URL =
  "https://cdn.jsdelivr.net/npm/@zxing/browser@0.1.5/+esm";
const OPEN_FOOD_FACTS_API = "https://world.openfoodfacts.org/api/v2/product";
const DUPLICATE_SCAN_WINDOW_MS = 3000;
const PRIMARY_RED = "#E61C24";
const SUCCESS_GREEN = "#19A55A";
const STORE_NAME = "Store #47 — Narimanov";

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
  const [scanStatus, setScanStatus] = useState("Starting camera...");
  const [scannedItems, setScannedItems] = useState([]);
  const [isLookingUp, setIsLookingUp] = useState(false);

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

    if (activeMode !== "cashier") {
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
  }, [activeMode]);

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
        <button className="nav-item active" type="button">
          Scan
        </button>
        <button className="nav-item" type="button">
          My Store
        </button>
        <button className="nav-item" type="button">
          Rewards
        </button>
        <button className="nav-item" type="button">
          Rankings
        </button>
      </nav>
    </div>
  );
}
