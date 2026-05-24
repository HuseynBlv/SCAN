import { startTransition, useEffect, useEffectEvent, useRef, useState } from "react";
import { BarcodeFormat, BrowserMultiFormatOneDReader } from "@zxing/browser";
import { DecodeHintType } from "@zxing/library";
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

const OPEN_FOOD_FACTS_API = "https://world.openfoodfacts.org/api/v2/product";
const DUPLICATE_SCAN_WINDOW_MS = 3000;
const SPLASH_DURATION_MS = 2000;
const SPLASH_FADE_MS = 420;
const DEMO_STEP_DELAY_MS = 1500;
const LOG_RESET_DELAY_MS = 1200;
const ACHIEVEMENT_DURATION_MS = 3000;
const HQ_FEED_INTERVAL_MS = 6000;
const SCAN_FEEDBACK_DURATION_MS = 950;

const PRIMARY_RED = "#E61C24";
const SUCCESS_GREEN = "#19A55A";
const STORE_NAME = "Store #47 — Narimanov";
const HQ_REGION_NAME = "CCI HQ — Baku Region";

const DEMO_SEQUENCE = [
  {
    barcode: "5449000000996",
    product: {
      name: "Coca-Cola",
      brand: "The Coca-Cola Company",
      quantity: "330ml",
    },
  },
  {
    barcode: "5053990109332",
    product: {
      name: "Lays Original",
      brand: "Lay's",
      quantity: "40g",
    },
  },
  {
    barcode: "4760062100018",
    product: {
      name: "Azerchay",
      brand: "Azerchay",
      quantity: "Black Tea",
    },
  },
];

const INITIAL_STORE_STATS = {
  today: 47,
  week: 284,
  month: 1203,
};

const INITIAL_TOP_PRODUCTS = [
  { name: "Coca-Cola 330ml", scans: 38 },
  { name: "Lays Original", scans: 31 },
  { name: "Azerchay", scans: 24 },
  { name: "Fanta 500ml", scans: 19 },
  { name: "Sprite 330ml", scans: 14 },
];

const INITIAL_MY_STORE_PEAK_HOURS = [
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

const DISTRICT_RANKINGS = {
  week: [
    { rank: 1, store: "Store #12", baskets: 211, delta: 7, medal: "🥇" },
    { rank: 2, store: "Store #47", baskets: 189, delta: 5, medal: "🥈", isYou: true },
    { rank: 3, store: "Store #31", baskets: 162, delta: 3, medal: "🥉" },
    { rank: 4, store: "Store #8", baskets: 138, delta: 2 },
    { rank: 5, store: "Store #22", baskets: 129, delta: 4 },
    { rank: 6, store: "Store #19", baskets: 112, delta: 1, muted: true },
    { rank: 7, store: "Store #4", baskets: 95, delta: 2, muted: true },
    { rank: 8, store: "Store #27", baskets: 84, delta: 1, muted: true },
  ],
  month: [
    { rank: 1, store: "Store #12", baskets: 847, delta: 23, medal: "🥇" },
    { rank: 2, store: "Store #47", baskets: 683, delta: 0, medal: "🥈", isYou: true },
    { rank: 3, store: "Store #31", baskets: 541, delta: 8, medal: "🥉" },
    { rank: 4, store: "Store #8", baskets: 423, delta: 5 },
    { rank: 5, store: "Store #22", baskets: 387, delta: 11 },
    { rank: 6, store: "Store #19", baskets: 314, delta: 3, muted: true },
    { rank: 7, store: "Store #4", baskets: 276, delta: 2, muted: true },
    { rank: 8, store: "Store #27", baskets: 241, delta: 4, muted: true },
  ],
  allTime: [
    { rank: 1, store: "Store #12", baskets: 5821, delta: 23, medal: "🥇" },
    { rank: 2, store: "Store #47", baskets: 5314, delta: 0, medal: "🥈", isYou: true },
    { rank: 3, store: "Store #31", baskets: 4872, delta: 8, medal: "🥉" },
    { rank: 4, store: "Store #8", baskets: 4317, delta: 5 },
    { rank: 5, store: "Store #22", baskets: 4026, delta: 11 },
    { rank: 6, store: "Store #19", baskets: 3614, delta: 3, muted: true },
    { rank: 7, store: "Store #4", baskets: 3492, delta: 2, muted: true },
    { rank: 8, store: "Store #27", baskets: 3276, delta: 4, muted: true },
  ],
};

const CITY_LEADERBOARD = {
  week: [
    { rank: 1, store: "Store #3 — Nizami", baskets: 318, delta: 10 },
    { rank: 2, store: "Store #15 — Yasamal", baskets: 302, delta: 7 },
    { rank: 3, store: "Store #12 — Narimanov", baskets: 296, delta: 7 },
    { rank: 4, store: "Store #28 — Khatai", baskets: 281, delta: 6 },
    { rank: 5, store: "Store #6 — Sabail", baskets: 267, delta: 5 },
    { rank: 6, store: "Store #44 — Binagadi", baskets: 259, delta: 4 },
    { rank: 7, store: "Store #18 — Narimanov", baskets: 248, delta: 3 },
    { rank: 8, store: "Store #31 — Khatai", baskets: 243, delta: 3 },
    { rank: 9, store: "Store #9 — Yasamal", baskets: 231, delta: 2 },
    { rank: 10, store: "Store #22 — Surakhani", baskets: 226, delta: 4 },
  ],
  month: [
    { rank: 1, store: "Store #3 — Nizami", baskets: 1298, delta: 31 },
    { rank: 2, store: "Store #15 — Yasamal", baskets: 1212, delta: 24 },
    { rank: 3, store: "Store #12 — Narimanov", baskets: 1187, delta: 23 },
    { rank: 4, store: "Store #28 — Khatai", baskets: 1108, delta: 19 },
    { rank: 5, store: "Store #6 — Sabail", baskets: 1051, delta: 16 },
    { rank: 6, store: "Store #44 — Binagadi", baskets: 996, delta: 12 },
    { rank: 7, store: "Store #18 — Narimanov", baskets: 954, delta: 14 },
    { rank: 8, store: "Store #31 — Khatai", baskets: 911, delta: 8 },
    { rank: 9, store: "Store #9 — Yasamal", baskets: 886, delta: 10 },
    { rank: 10, store: "Store #22 — Surakhani", baskets: 861, delta: 11 },
  ],
  allTime: [
    { rank: 1, store: "Store #3 — Nizami", baskets: 9834, delta: 31 },
    { rank: 2, store: "Store #15 — Yasamal", baskets: 9520, delta: 24 },
    { rank: 3, store: "Store #12 — Narimanov", baskets: 9413, delta: 23 },
    { rank: 4, store: "Store #28 — Khatai", baskets: 9118, delta: 19 },
    { rank: 5, store: "Store #6 — Sabail", baskets: 8872, delta: 16 },
    { rank: 6, store: "Store #44 — Binagadi", baskets: 8631, delta: 12 },
    { rank: 7, store: "Store #18 — Narimanov", baskets: 8440, delta: 14 },
    { rank: 8, store: "Store #31 — Khatai", baskets: 8234, delta: 8 },
    { rank: 9, store: "Store #9 — Yasamal", baskets: 8012, delta: 10 },
    { rank: 10, store: "Store #22 — Surakhani", baskets: 7827, delta: 11 },
  ],
};

const CURRENT_STORE_CITY_RANK = {
  week: { rank: 53, baskets: 189, delta: 5 },
  month: { rank: 47, baskets: 683, delta: 0 },
  allTime: { rank: 49, baskets: 5314, delta: 0 },
};

const HQ_METRICS = [
  { label: "Total baskets today", value: "2,847" },
  { label: "Active stores today", value: "134" },
  { label: "Most common basket pair", value: "Coke + Lays (68%)" },
  { label: "Fastest growing district", value: "Yasamal (+34%)" },
];

const HQ_PAIR_ANALYSIS = [
  { label: "Coca-Cola 330ml + Lays Original", percentage: 68 },
  { label: "Fanta 500ml + Chips", percentage: 57 },
  { label: "Coca-Cola + Azerchay Tea", percentage: 41 },
  { label: "Sprite + Sandwich", percentage: 38 },
  { label: "Coca-Cola 2L + Bread", percentage: 35 },
  { label: "Energy Drink (alone)", percentage: 89, suffix: "alone" },
  { label: "Fanta + Azerchay", percentage: 28 },
  { label: "Sprite + Lays", percentage: 24 },
];

const HQ_DISTRICT_BREAKDOWN = [
  { district: "Narimanov", baskets: 847, topPair: "Coke + Lays", trend: "↑" },
  { district: "Yasamal", baskets: 634, topPair: "Fanta + Chips", trend: "↑↑" },
  { district: "Khatai", baskets: 521, topPair: "Coke + Tea", trend: "→" },
  { district: "Sabunchu", baskets: 423, topPair: "Sprite + Sandwich", trend: "↓" },
  { district: "Surakhani", baskets: 387, topPair: "Coke + Bread", trend: "↑" },
];

const HQ_PEAK_HOURS = [
  { hour: "08:00", baskets: 112 },
  { hour: "09:00", baskets: 164 },
  { hour: "10:00", baskets: 208 },
  { hour: "11:00", baskets: 257 },
  { hour: "12:00", baskets: 391 },
  { hour: "13:00", baskets: 428 },
  { hour: "14:00", baskets: 316 },
  { hour: "15:00", baskets: 272 },
  { hour: "16:00", baskets: 301 },
  { hour: "17:00", baskets: 412 },
  { hour: "18:00", baskets: 447 },
  { hour: "19:00", baskets: 433 },
  { hour: "20:00", baskets: 288 },
  { hour: "21:00", baskets: 196 },
];

const HQ_LIVE_TRANSACTIONS = [
  { district: "Narimanov", items: "Coke + Lays + Tea" },
  { district: "Yasamal", items: "Fanta + Chips" },
  { district: "Khatai", items: "Sprite + Sandwich" },
  { district: "Sabunchu", items: "Coke + Bread" },
  { district: "Surakhani", items: "Energy Drink" },
  { district: "Narimanov", items: "Coke + Azerchay Tea" },
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

const RETAIL_BARCODE_FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.ITF,
  BarcodeFormat.CODABAR,
];

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

function getProductLabel(name, quantity) {
  if (name.includes("Coca-Cola")) {
    return "Coca-Cola 330ml";
  }

  if (name.includes("Lays")) {
    return "Lays Original";
  }

  if (name.includes("Azerchay")) {
    return "Azerchay";
  }

  if (name.includes("Fanta")) {
    return "Fanta 500ml";
  }

  if (name.includes("Sprite")) {
    return "Sprite 330ml";
  }

  if (quantity && quantity !== "Quantity unavailable") {
    return `${name} ${quantity}`;
  }

  return name;
}

function getBasketSummaryLabels(items) {
  return items.map((item) => {
    const name = item.isUnknown
      ? item.customName.trim() || "Unknown Product"
      : item.name;

    if (name.includes("Coca-Cola")) {
      return "Coke";
    }

    if (name.includes("Lays")) {
      return "Lays";
    }

    if (name.includes("Azerchay")) {
      return "Tea";
    }

    if (name.includes("Fanta")) {
      return "Fanta";
    }

    if (name.includes("Sprite")) {
      return "Sprite";
    }

    return name;
  });
}

function formatHqFeedEntry(time, district, summary) {
  return `${time} — District: ${district} — ${summary}`;
}

function AchievementOverlay({ achievement }) {
  const confettiPieces = Array.from({ length: 18 }, (_, index) => ({
    id: index,
    left: `${(index * 11) % 100}%`,
    delay: `${(index % 6) * 0.08}s`,
    rotate: `${index * 19}deg`,
    color: index % 3 === 0 ? "#ffffff" : index % 3 === 1 ? "#ffd166" : "#ff6b6b",
  }));

  return (
    <div className="achievement-overlay" role="status" aria-live="assertive">
      <div className="achievement-confetti" aria-hidden="true">
        {confettiPieces.map((piece) => (
          <span
            className="confetti-piece"
            key={piece.id}
            style={{
              left: piece.left,
              animationDelay: piece.delay,
              transform: `rotate(${piece.rotate})`,
              background: piece.color,
            }}
          />
        ))}
      </div>
      <div className="achievement-card-pop">
        <div className="achievement-pop-kicker">Achievement Unlocked! 🏆</div>
        <div className="achievement-pop-title">{achievement.title}</div>
        <div className="achievement-pop-copy">{achievement.description}</div>
      </div>
    </div>
  );
}

export default function App() {
  const videoRef = useRef(null);
  const readerRef = useRef(null);
  const controlsRef = useRef(null);
  const recentScansRef = useRef(new Map());
  const pendingBarcodesRef = useRef(new Set());
  const mountedRef = useRef(false);
  const isLookingUpRef = useRef(false);
  const splashFadeTimerRef = useRef(null);
  const splashHideTimerRef = useRef(null);
  const logResetTimerRef = useRef(null);
  const achievementTimerRef = useRef(null);
  const hqFeedIntervalRef = useRef(null);
  const hqFeedIndexRef = useRef(0);
  const demoTimersRef = useRef([]);
  const sessionLoggedBasketsRef = useRef(0);
  const scanFeedbackTimerRef = useRef(null);

  const [activeMode, setActiveMode] = useState("cashier");
  const [activeCashierTab, setActiveCashierTab] = useState("scan");
  const [rankingsRange, setRankingsRange] = useState("month");
  const [rankingsScope, setRankingsScope] = useState("district");
  const [showSplash, setShowSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [scanStatus, setScanStatus] = useState("Starting camera...");
  const [scannedItems, setScannedItems] = useState([]);
  const [isLookingUp, setIsLookingUp] = useState(false);
  const [scanFeedbackState, setScanFeedbackState] = useState("idle");
  const [hasClaimedReward, setHasClaimedReward] = useState(false);
  const [demoModeRunning, setDemoModeRunning] = useState(false);
  const [pulseLogButton, setPulseLogButton] = useState(false);
  const [storeStats, setStoreStats] = useState(INITIAL_STORE_STATS);
  const [topProductsToday, setTopProductsToday] = useState(INITIAL_TOP_PRODUCTS);
  const [myStorePeakHours, setMyStorePeakHours] = useState(INITIAL_MY_STORE_PEAK_HOURS);
  const [streakDays, setStreakDays] = useState(7);
  const [basketsRemainingForStreak, setBasketsRemainingForStreak] = useState(14);
  const [rewardProgress, setRewardProgress] = useState(683);
  const [achievementPopup, setAchievementPopup] = useState(null);
  const [hqLiveFeed, setHqLiveFeed] = useState(() =>
    HQ_LIVE_TRANSACTIONS.slice(0, 4).map((entry, index) => ({
      id: `seed-${index}`,
      time: `14:3${index}`,
      district: entry.district,
      items: entry.items,
      line: formatHqFeedEntry(`14:3${index}`, entry.district, entry.items),
    }))
  );

  const showAchievement = (achievement) => {
    window.clearTimeout(achievementTimerRef.current);
    setAchievementPopup(achievement);
    achievementTimerRef.current = window.setTimeout(() => {
      setAchievementPopup(null);
    }, ACHIEVEMENT_DURATION_MS);
  };

  const pushHqFeedEntry = (district, summary) => {
    const now = new Date();
    const time = now.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      time,
      district,
      items: summary,
      line: formatHqFeedEntry(time, district, summary),
    };

    setHqLiveFeed((currentFeed) => [entry, ...currentFeed].slice(0, 10));
  };

  const appendScannedItem = (barcode, productDetails) => {
    setScannedItems((currentItems) => [
      buildScannedItem(barcode, productDetails),
      ...currentItems,
    ]);
  };

  const flashScanFeedback = (nextState, duration = SCAN_FEEDBACK_DURATION_MS) => {
    window.clearTimeout(scanFeedbackTimerRef.current);
    setScanFeedbackState(nextState);

    if (duration) {
      scanFeedbackTimerRef.current = window.setTimeout(() => {
        setScanFeedbackState("idle");
      }, duration);
    }
  };

  const vibrateOnScan = () => {
    window.navigator?.vibrate?.(24);
  };

  const processBarcode = useEffectEvent(async (barcode) => {
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
    flashScanFeedback("processing", 0);
    setScanStatus("Barcode detected. Looking up product...");

    try {
      const response = await fetch(
        `${OPEN_FOOD_FACTS_API}/${encodeURIComponent(trimmedBarcode)}`,
        {
          headers: { Accept: "application/json" },
        }
      );
      const data = await response.json();
      const fallbackProduct = FALLBACK_PRODUCTS[trimmedBarcode];
      const productDetails =
        response.ok && data?.status === 1 && data?.product
          ? normalizeProduct(data.product)
          : fallbackProduct || {
              name: "Unknown Product",
              brand: "Manual entry needed",
              quantity: "Unknown quantity",
            };

      appendScannedItem(trimmedBarcode, productDetails);
      vibrateOnScan();
      flashScanFeedback("success");

      setScanStatus(
        productDetails.name === "Unknown Product"
          ? `We couldn't match that barcode. Add a name manually.`
          : `Added ${productDetails.name}. Ready for the next item.`
      );
    } catch {
      const fallbackProduct = FALLBACK_PRODUCTS[trimmedBarcode] || {
        name: "Unknown Product",
        brand: "Lookup failed",
        quantity: "Unknown quantity",
      };

      appendScannedItem(trimmedBarcode, fallbackProduct);
      vibrateOnScan();
      flashScanFeedback("success");
      setScanStatus(
        fallbackProduct.name === "Unknown Product"
          ? "Lookup failed. You can still add the product manually."
          : `Added ${fallbackProduct.name} from the offline catalog.`
      );
    } finally {
      pendingBarcodesRef.current.delete(trimmedBarcode);
      setIsLookingUp(false);
    }
  });

  const runDemoScanStep = (entry, isLast) => {
    setIsLookingUp(true);
    flashScanFeedback("processing", 0);
    setScanStatus("Barcode detected. Looking up product...");

    const resolveTimer = window.setTimeout(() => {
      appendScannedItem(entry.barcode, entry.product);
      setIsLookingUp(false);
      vibrateOnScan();
      flashScanFeedback("success");
      setScanStatus(
        isLast
          ? `Added ${entry.product.name}. Demo basket ready to log.`
          : `Added ${entry.product.name}. Continuing demo scan...`
      );

      if (isLast) {
        setDemoModeRunning(false);
        setPulseLogButton(true);
      }
    }, 450);

    demoTimersRef.current.push(resolveTimer);
  };

  useEffect(() => {
    splashFadeTimerRef.current = window.setTimeout(() => {
      setSplashFading(true);
    }, SPLASH_DURATION_MS - SPLASH_FADE_MS);

    splashHideTimerRef.current = window.setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_DURATION_MS);

    return () => {
      window.clearTimeout(splashFadeTimerRef.current);
      window.clearTimeout(splashHideTimerRef.current);
      window.clearTimeout(logResetTimerRef.current);
      window.clearTimeout(achievementTimerRef.current);
      window.clearTimeout(scanFeedbackTimerRef.current);
      demoTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
      window.clearInterval(hqFeedIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    isLookingUpRef.current = isLookingUp;
  }, [isLookingUp]);

  useEffect(() => {
    const recentScans = recentScansRef.current;
    const pendingBarcodes = pendingBarcodesRef.current;

    if (showSplash || activeMode !== "cashier" || activeCashierTab !== "scan") {
      mountedRef.current = false;
      controlsRef.current?.stop?.();
      readerRef.current?.reset?.();
      return undefined;
    }

    mountedRef.current = true;

    const startScanner = async () => {
      try {
        setScanStatus("Loading barcode scanner...");
        const reader = new BrowserMultiFormatOneDReader(
          new Map([[DecodeHintType.POSSIBLE_FORMATS, RETAIL_BARCODE_FORMATS]]),
          {
            delayBetweenScanAttempts: 70,
            delayBetweenScanSuccess: 350,
            tryPlayVideoTimeout: 3000,
          }
        );
        readerRef.current = reader;

        if (!mountedRef.current || !videoRef.current) {
          return;
        }

        setScanFeedbackState("idle");
        setScanStatus("Center the barcode in the frame.");

        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
              frameRate: { ideal: 24, max: 30 },
            },
          },
          videoRef.current,
          (result, error) => {
            if (result) {
              void processBarcode(result.getText());
              return;
            }

            if (error?.name === "NotFoundException") {
              return;
            }

            if (error && mountedRef.current && !isLookingUpRef.current) {
              setScanStatus("Align the barcode and hold steady.");
            }
          }
        );

        controlsRef.current = controls;

        try {
          const selectVideoTrack = (track) => track.kind === "video";
          const capabilities = controls.streamVideoCapabilitiesGet?.(selectVideoTrack);
          const advancedConstraints = {};

          if (
            Array.isArray(capabilities?.focusMode) &&
            capabilities.focusMode.includes("continuous")
          ) {
            advancedConstraints.focusMode = "continuous";
          }

          if (
            Array.isArray(capabilities?.exposureMode) &&
            capabilities.exposureMode.includes("continuous")
          ) {
            advancedConstraints.exposureMode = "continuous";
          }

          if (Object.keys(advancedConstraints).length > 0) {
            await controls.streamVideoConstraintsApply?.(
              { advanced: [advancedConstraints] },
              selectVideoTrack
            );
          }
        } catch {
          // Ignore unsupported camera capabilities and continue with defaults.
        }
      } catch (error) {
        if (mountedRef.current) {
          setScanFeedbackState("idle");
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
  }, [activeMode, activeCashierTab, showSplash]);

  useEffect(() => {
    if (activeMode !== "hq") {
      window.clearInterval(hqFeedIntervalRef.current);
      return undefined;
    }

    hqFeedIntervalRef.current = window.setInterval(() => {
      const nextIndex = hqFeedIndexRef.current % HQ_LIVE_TRANSACTIONS.length;
      const nextTemplate = HQ_LIVE_TRANSACTIONS[nextIndex];
      hqFeedIndexRef.current += 1;
      pushHqFeedEntry(nextTemplate.district, nextTemplate.items);
    }, HQ_FEED_INTERVAL_MS);

    return () => {
      window.clearInterval(hqFeedIntervalRef.current);
    };
  }, [activeMode]);

  const updateUnknownProductName = (id, nextName) => {
    setScannedItems((currentItems) =>
      currentItems.map((item) =>
        item.id === id ? { ...item, customName: nextName } : item
      )
    );
  };

  const handleModeToggle = (mode) => {
    startTransition(() => {
      setActiveMode(mode);
    });
  };

  const handleDemoMode = () => {
    if (demoModeRunning) {
      return;
    }

    demoTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    demoTimersRef.current = [];
    setScannedItems([]);
    setPulseLogButton(false);
    setDemoModeRunning(true);
    flashScanFeedback("idle");
    setScanStatus("Demo mode: simulating cashier flow...");

    DEMO_SEQUENCE.forEach((entry, index) => {
      const timerId = window.setTimeout(() => {
        runDemoScanStep(entry, index === DEMO_SEQUENCE.length - 1);
      }, DEMO_STEP_DELAY_MS * index);

      demoTimersRef.current.push(timerId);
    });
  };

  const handleLogBasket = () => {
    if (!scannedItems.length) {
      return;
    }

    const basketSummary = getBasketSummaryLabels(scannedItems).join(" + ");
    pushHqFeedEntry("Narimanov", basketSummary);
    setPulseLogButton(false);
    setStreakDays((currentDays) => currentDays + 1);
    setStoreStats((currentStats) => ({
      today: currentStats.today + 1,
      week: currentStats.week + 1,
      month: currentStats.month + 1,
    }));
    setRewardProgress((currentProgress) => Math.min(1000, currentProgress + 1));
    setBasketsRemainingForStreak((currentValue) => Math.max(0, currentValue - 1));
    setTopProductsToday((currentProducts) => {
      const nextProducts = currentProducts.map((product) => ({ ...product }));

      scannedItems.forEach((item) => {
        const label = getProductLabel(
          item.isUnknown ? item.customName.trim() || item.name : item.name,
          item.quantity
        );
        const productMatch = nextProducts.find(
          (product) => product.name === label
        );

        if (productMatch) {
          productMatch.scans += 1;
        }
      });

      return nextProducts;
    });
    setMyStorePeakHours((currentHours) =>
      currentHours.map((entry) => {
        const hour = new Date().getHours();
        const targetLabel = String(hour).padStart(2, "0");

        return entry.hour === targetLabel
          ? { ...entry, baskets: entry.baskets + 1 }
          : entry;
      })
    );
    sessionLoggedBasketsRef.current += 1;

    if (sessionLoggedBasketsRef.current === 1) {
      showAchievement({
        title: "Basket Builder",
        description:
          "First basket logged today. Keep scanning to accelerate reward progress.",
      });
    }

    setScanStatus("Basket logged. Ready for next customer.");
    window.clearTimeout(logResetTimerRef.current);
    logResetTimerRef.current = window.setTimeout(() => {
      setScannedItems([]);
      setScanStatus("Center the barcode in the frame.");
      setScanFeedbackState("idle");
    }, LOG_RESET_DELAY_MS);
  };

  const currentDistrictRows = DISTRICT_RANKINGS[rankingsRange];
  const currentCityRows = CITY_LEADERBOARD[rankingsRange];
  const currentCityRank = CURRENT_STORE_CITY_RANK[rankingsRange];
  const rankingsRangeLabel =
    rankingsRange === "week"
      ? "This Week"
      : rankingsRange === "month"
        ? "This Month"
        : "All Time";
  const rewardProgressPercent = (rewardProgress / 1000) * 100;

  return (
    <div className="app-shell">
      <style>{`
        :root {
          color-scheme: light;
          --scan-red: ${PRIMARY_RED};
          --scan-red-soft: rgba(230, 28, 36, 0.08);
          --scan-red-border: rgba(230, 28, 36, 0.18);
          --scan-red-dark: #a01118;
          --scan-ink: #121212;
          --scan-muted: #6b6b6b;
          --scan-panel: #ffffff;
          --scan-bg: #f5f6f8;
          --scan-line: rgba(18, 18, 18, 0.07);
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

        .screen.hq-screen {
          max-width: 1320px;
        }

        .mode-scene {
          animation: modeSwap 320ms ease;
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
          width: 40px;
          height: 40px;
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

        .store-pill.hq-pill {
          max-width: none;
          color: var(--scan-red);
          font-weight: 700;
        }

        .mode-switcher {
          padding: 10px;
          border-radius: 22px;
          background: rgba(255, 255, 255, 0.88);
          border: 1px solid var(--scan-line);
          box-shadow: 0 12px 28px rgba(17, 17, 17, 0.06);
        }

        .mode-switcher-label {
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          color: var(--scan-red);
          margin-bottom: 10px;
        }

        .mode-track {
          position: relative;
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 6px;
          padding: 6px;
          border-radius: 18px;
          background: #f4f6f8;
        }

        .mode-thumb {
          position: absolute;
          top: 6px;
          left: 6px;
          width: calc(50% - 6px);
          height: calc(100% - 12px);
          border-radius: 14px;
          background: linear-gradient(135deg, rgba(230, 28, 36, 0.2), rgba(230, 28, 36, 0.08));
          box-shadow: inset 0 0 0 1px rgba(230, 28, 36, 0.12);
          transform: translateX(0);
          transition: transform 260ms ease;
          pointer-events: none;
        }

        .mode-thumb.hq {
          transform: translateX(100%);
        }

        .mode-button {
          position: relative;
          z-index: 1;
          border: none;
          border-radius: 14px;
          padding: 12px 10px;
          background: transparent;
          color: var(--scan-muted);
          font-size: 0.82rem;
          font-weight: 800;
          letter-spacing: 0.03em;
          transition: color 180ms ease;
        }

        .mode-button.active {
          color: var(--scan-red-dark);
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

        .screen-stack,
        .rewards-stack,
        .rankings-stack {
          display: flex;
          flex-direction: column;
          gap: 16px;
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
          transition: transform 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }

        .status-badge.processing {
          background: rgba(255, 245, 245, 0.94);
          box-shadow: 0 10px 24px rgba(230, 28, 36, 0.14);
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
          width: min(88%, 360px);
          height: 142px;
          border-radius: 22px;
          border: 2px solid rgba(255, 255, 255, 0.96);
          box-shadow: 0 0 0 999px rgba(17, 17, 17, 0.25);
          position: relative;
          transition: transform 200ms ease, border-color 180ms ease, box-shadow 180ms ease;
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

        .scan-window.processing {
          transform: scale(1.01);
          border-color: rgba(255, 226, 228, 0.98);
        }

        .scan-window.success {
          border-color: rgba(25, 165, 90, 0.98);
          box-shadow:
            0 0 0 999px rgba(17, 17, 17, 0.22),
            0 0 0 6px rgba(25, 165, 90, 0.16);
        }

        .scan-window.success::after {
          background: rgba(25, 165, 90, 0.95);
          box-shadow: 0 0 18px rgba(25, 165, 90, 0.45);
        }

        .scan-corners {
          position: absolute;
          inset: 0;
          pointer-events: none;
        }

        .scan-corners span {
          position: absolute;
          width: 24px;
          height: 24px;
          border-color: rgba(255, 255, 255, 0.96);
          border-style: solid;
          border-width: 0;
        }

        .scan-corners span:nth-child(1) {
          top: 10px;
          left: 10px;
          border-top-width: 4px;
          border-left-width: 4px;
          border-top-left-radius: 10px;
        }

        .scan-corners span:nth-child(2) {
          top: 10px;
          right: 10px;
          border-top-width: 4px;
          border-right-width: 4px;
          border-top-right-radius: 10px;
        }

        .scan-corners span:nth-child(3) {
          right: 10px;
          bottom: 10px;
          border-right-width: 4px;
          border-bottom-width: 4px;
          border-bottom-right-radius: 10px;
        }

        .scan-corners span:nth-child(4) {
          left: 10px;
          bottom: 10px;
          border-bottom-width: 4px;
          border-left-width: 4px;
          border-bottom-left-radius: 10px;
        }

        .camera-guidance {
          align-self: center;
          max-width: 88%;
          padding: 10px 12px;
          border-radius: 14px;
          background: rgba(17, 17, 17, 0.36);
          color: rgba(255, 255, 255, 0.96);
          font-size: 0.8rem;
          line-height: 1.35;
          text-align: center;
        }

        .section-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 18px 18px 10px;
        }

        .section-title,
        .leaderboard-title {
          font-size: 1rem;
          font-weight: 800;
        }

        .section-meta {
          font-size: 0.82rem;
          color: var(--scan-muted);
        }

        .items-list,
        .history-list,
        .leaderboard-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .item-card,
        .empty-card,
        .pair-card,
        .history-item,
        .leaderboard-row {
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

        .item-meta,
        .hq-copy,
        .pairs-copy,
        .pair-subtitle,
        .reward-progress-copy,
        .reward-preview-copy,
        .history-date,
        .champion-copy,
        .city-rank-copy {
          font-size: 0.9rem;
          line-height: 1.45;
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
          transition: transform 180ms ease, box-shadow 180ms ease;
        }

        .cta-button.pulsing {
          animation: pulseButton 1.2s ease-in-out infinite;
        }

        .demo-button {
          position: fixed;
          right: 18px;
          bottom: 102px;
          z-index: 18;
          border: none;
          border-radius: 999px;
          padding: 11px 14px;
          background: rgba(18, 20, 24, 0.95);
          color: #fff;
          font-size: 0.76rem;
          font-weight: 800;
          letter-spacing: 0.05em;
          box-shadow: 0 14px 28px rgba(17, 17, 17, 0.24);
        }

        .demo-button:disabled {
          opacity: 0.72;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .stat-card,
        .hq-metric-card {
          padding: 14px 12px;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(230, 28, 36, 0.08), rgba(230, 28, 36, 0.02));
          border: 1px solid rgba(230, 28, 36, 0.12);
        }

        .stat-label,
        .hq-metric-label {
          font-size: 0.72rem;
          line-height: 1.3;
          color: var(--scan-muted);
          margin-bottom: 10px;
        }

        .stat-value,
        .hq-metric-value {
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

        .pair-card {
          padding: 14px;
        }

        .pair-topline,
        .reward-level,
        .topbar-row,
        .history-item,
        .leaderboard-row,
        .transaction-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .pair-title,
        .history-title,
        .achievement-title,
        .hq-card-title {
          font-size: 0.96rem;
          font-weight: 800;
        }

        .pair-percent,
        .city-rank-title {
          font-size: 0.88rem;
          font-weight: 800;
          color: var(--scan-red);
        }

        .pair-progress,
        .reward-progress-track {
          width: 100%;
          height: 10px;
          border-radius: 999px;
          background: rgba(17, 17, 17, 0.08);
          overflow: hidden;
        }

        .pair-progress-fill,
        .reward-progress-fill {
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--scan-red), #ff6c74);
          transition: width 480ms ease;
        }

        .streak-banner,
        .rank-card {
          padding: 20px 18px;
          border-radius: 24px;
          background: linear-gradient(135deg, #ff5a63, var(--scan-red));
          color: #fff;
          box-shadow: 0 18px 38px rgba(230, 28, 36, 0.24);
        }

        .rank-card {
          background: linear-gradient(135deg, rgba(230, 28, 36, 0.16), rgba(230, 28, 36, 0.05));
          color: var(--scan-ink);
        }

        .streak-emoji,
        .rank-medal {
          font-size: 2rem;
          line-height: 1;
          margin-bottom: 8px;
        }

        .streak-title,
        .rank-title {
          font-size: 1.5rem;
          font-weight: 800;
          margin-bottom: 6px;
          line-height: 1.2;
        }

        .streak-copy,
        .streak-countdown,
        .rank-subtitle,
        .rank-trend,
        .hq-subcopy {
          font-size: 0.94rem;
          line-height: 1.45;
        }

        .streak-countdown,
        .rank-trend {
          font-weight: 700;
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

        .reward-preview {
          padding: 14px;
          border-radius: 18px;
          background: #f6f8fb;
          border: 1px solid rgba(17, 17, 17, 0.06);
        }

        .reward-preview-title,
        .claim-code-label,
        .champion-title,
        .hq-label,
        .mode-switcher-label {
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--scan-red);
          margin-bottom: 8px;
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

        .achievement-subtitle {
          font-size: 0.82rem;
          line-height: 1.4;
          color: inherit;
        }

        .history-item {
          padding: 14px;
        }

        .rank-card {
          border: 1px solid rgba(230, 28, 36, 0.14);
          box-shadow: 0 18px 36px rgba(230, 28, 36, 0.08);
        }

        .champion-preview {
          padding: 14px;
          border-radius: 18px;
          background: #fff7f7;
          border: 1px dashed rgba(230, 28, 36, 0.24);
        }

        .switch-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 8px;
        }

        .switch-row.scope-row {
          grid-template-columns: repeat(2, minmax(0, 1fr));
        }

        .mini-switch {
          border: 1px solid rgba(17, 17, 17, 0.08);
          background: #fff;
          color: var(--scan-muted);
          border-radius: 14px;
          padding: 11px 8px;
          font-size: 0.78rem;
          font-weight: 800;
        }

        .mini-switch.active {
          background: linear-gradient(135deg, rgba(230, 28, 36, 0.14), rgba(230, 28, 36, 0.06));
          color: var(--scan-red);
          border-color: rgba(230, 28, 36, 0.16);
        }

        .leaderboard-row {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr) auto;
          align-items: center;
          padding: 14px;
        }

        .leaderboard-row.you {
          background: linear-gradient(135deg, rgba(230, 28, 36, 0.12), rgba(230, 28, 36, 0.04));
          border-color: rgba(230, 28, 36, 0.22);
          box-shadow: inset 0 0 0 1px rgba(230, 28, 36, 0.08);
        }

        .leaderboard-row.muted {
          opacity: 0.5;
          background: #f4f5f7;
        }

        .leaderboard-rank {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.95rem;
          font-weight: 800;
          min-width: 64px;
        }

        .leaderboard-store-name {
          font-size: 0.92rem;
          font-weight: 800;
          line-height: 1.3;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .you-tag {
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--scan-red);
          background: rgba(230, 28, 36, 0.1);
          border-radius: 999px;
          padding: 4px 6px;
        }

        .leaderboard-delta,
        .leaderboard-score-label {
          margin-top: 4px;
          font-size: 0.8rem;
          color: var(--scan-muted);
        }

        .leaderboard-score {
          text-align: right;
        }

        .leaderboard-score-value {
          font-size: 1rem;
          font-weight: 800;
          white-space: nowrap;
        }

        .city-rank-card {
          padding: 14px;
          border-radius: 18px;
          background: #f7f8fb;
          border: 1px solid rgba(17, 17, 17, 0.06);
          margin-top: 12px;
        }

        .hq-shell {
          display: grid;
          grid-template-columns: minmax(0, 1fr);
          gap: 18px;
        }

        .hq-main {
          display: flex;
          flex-direction: column;
          gap: 18px;
          background: #ffffff;
          border: 1px solid rgba(17, 17, 17, 0.06);
          border-radius: 28px;
          padding: 22px;
          box-shadow: 0 18px 40px rgba(17, 17, 17, 0.08);
        }

        .hq-sidebar {
          display: flex;
          flex-direction: column;
          gap: 16px;
          background: linear-gradient(180deg, #14181f, #1c222b);
          color: #fff;
          border-radius: 28px;
          padding: 22px;
          box-shadow: 0 18px 40px rgba(17, 17, 17, 0.16);
        }

        .hq-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }

        .hq-header-copy {
          max-width: 700px;
        }

        .hq-heading {
          font-size: 2rem;
          font-weight: 800;
          line-height: 1.1;
          margin-bottom: 8px;
        }

        .hq-metrics {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 12px;
        }

        .hq-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
          gap: 18px;
        }

        .hq-card {
          border-radius: 22px;
          border: 1px solid rgba(17, 17, 17, 0.06);
          background: #fff;
          padding: 18px;
        }

        .hq-card-copy {
          font-size: 0.9rem;
          line-height: 1.45;
          color: #666c76;
          margin-bottom: 16px;
        }

        .hq-chart-shell {
          width: 100%;
          height: 330px;
        }

        .hq-table {
          width: 100%;
          border-collapse: collapse;
        }

        .hq-table th,
        .hq-table td {
          padding: 12px 10px;
          text-align: left;
          border-bottom: 1px solid rgba(17, 17, 17, 0.06);
          font-size: 0.9rem;
        }

        .hq-table th {
          font-size: 0.78rem;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: #7b818d;
        }

        .hq-trend-up {
          color: #1d8e53;
          font-weight: 800;
        }

        .hq-trend-neutral {
          color: #75808f;
          font-weight: 800;
        }

        .hq-trend-down {
          color: #b85a46;
          font-weight: 800;
        }

        .hq-sidebar-title {
          font-size: 1rem;
          font-weight: 800;
          margin-bottom: 4px;
        }

        .hq-sidebar-copy {
          font-size: 0.88rem;
          line-height: 1.45;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 14px;
        }

        .hq-feed {
          display: flex;
          flex-direction: column;
          gap: 10px;
        }

        .hq-feed-item {
          padding: 14px;
          border-radius: 18px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.08);
          animation: feedSlide 320ms ease-out;
        }

        .hq-feed-time {
          font-size: 0.78rem;
          font-weight: 800;
          color: #ffb6bb;
          margin-bottom: 6px;
        }

        .hq-feed-line {
          font-size: 0.9rem;
          line-height: 1.45;
          color: #f5f7fa;
        }

        .hq-sidebar-note {
          margin-top: auto;
          padding-top: 6px;
          font-size: 0.8rem;
          line-height: 1.45;
          color: rgba(255, 255, 255, 0.56);
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

        .achievement-overlay {
          position: fixed;
          inset: 0;
          z-index: 40;
          background: rgba(17, 17, 17, 0.44);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          backdrop-filter: blur(6px);
        }

        .achievement-confetti {
          position: absolute;
          inset: 0;
          overflow: hidden;
          pointer-events: none;
        }

        .confetti-piece {
          position: absolute;
          top: -30px;
          width: 10px;
          height: 22px;
          border-radius: 4px;
          animation: confettiFall 2.8s linear forwards;
        }

        .achievement-card-pop {
          position: relative;
          z-index: 1;
          width: min(92vw, 420px);
          padding: 28px 24px;
          border-radius: 28px;
          background: linear-gradient(180deg, rgba(230, 28, 36, 0.96), #c9151d);
          color: #fff;
          text-align: center;
          box-shadow: 0 26px 56px rgba(17, 17, 17, 0.28);
        }

        .achievement-pop-kicker {
          font-size: 0.84rem;
          font-weight: 800;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 10px;
        }

        .achievement-pop-title {
          font-size: 1.6rem;
          font-weight: 800;
          margin-bottom: 10px;
        }

        .achievement-pop-copy {
          font-size: 0.98rem;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.92);
        }

        .splash-screen {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: var(--scan-red);
          color: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: opacity ${SPLASH_FADE_MS}ms ease;
        }

        .splash-screen.fade-out {
          opacity: 0;
          pointer-events: none;
        }

        .splash-inner {
          text-align: center;
          padding: 24px;
        }

        .splash-title {
          font-size: clamp(2.6rem, 6vw, 4.2rem);
          font-weight: 800;
          letter-spacing: 0.08em;
          margin-bottom: 12px;
        }

        .splash-tagline {
          font-size: 1rem;
          line-height: 1.5;
          color: rgba(255, 255, 255, 0.92);
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

        @keyframes pulseButton {
          0%, 100% {
            transform: scale(1);
            box-shadow: 0 14px 28px rgba(230, 28, 36, 0.3);
          }
          50% {
            transform: scale(1.02);
            box-shadow: 0 18px 34px rgba(230, 28, 36, 0.42);
          }
        }

        @keyframes feedSlide {
          0% {
            opacity: 0;
            transform: translateY(-10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes confettiFall {
          0% {
            opacity: 0;
            transform: translateY(0) rotate(0deg);
          }
          10% {
            opacity: 1;
          }
          100% {
            opacity: 0;
            transform: translateY(110vh) rotate(420deg);
          }
        }

        @keyframes modeSwap {
          0% {
            opacity: 0;
            transform: translateY(10px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 1120px) {
          .hq-metrics {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .hq-grid,
          .hq-shell {
            grid-template-columns: minmax(0, 1fr);
          }
        }
      `}</style>

      {achievementPopup ? <AchievementOverlay achievement={achievementPopup} /> : null}

      {showSplash ? (
        <div className={`splash-screen ${splashFading ? "fade-out" : ""}`}>
          <div className="splash-inner">
            <div className="splash-title">SCAN</div>
            <div className="splash-tagline">
              Basket Intelligence for Every Store
            </div>
          </div>
        </div>
      ) : null}

      <main className={`screen ${activeMode === "hq" ? "hq-screen" : ""}`}>
        <header className="topbar">
          <div className="topbar-row">
            <div className="logo">
              <div className="logo-mark">S</div>
              <div className="logo-copy">SCAN</div>
            </div>
            <div className={`store-pill ${activeMode === "hq" ? "hq-pill" : ""}`}>
              {activeMode === "hq" ? HQ_REGION_NAME : STORE_NAME}
            </div>
          </div>

          <div className="mode-switcher">
            <div className="mode-switcher-label">CASHIER VIEW ↔ HQ VIEW</div>
            <div className="mode-track">
              <div className={`mode-thumb ${activeMode === "hq" ? "hq" : ""}`} />
              <button
                className={`mode-button ${activeMode === "cashier" ? "active" : ""}`}
                type="button"
                onClick={() => handleModeToggle("cashier")}
              >
                CASHIER VIEW
              </button>
              <button
                className={`mode-button ${activeMode === "hq" ? "active" : ""}`}
                type="button"
                onClick={() => handleModeToggle("hq")}
              >
                HQ VIEW
              </button>
            </div>
          </div>
        </header>

        <div className="mode-scene" key={activeMode}>
          {activeMode === "cashier" ? (
            <div className="screen-stack">
              {activeCashierTab === "scan" ? (
                <>
                  <section className="panel">
                    <div className="camera-frame">
                      <video ref={videoRef} muted playsInline />
                      <div className="camera-overlay">
                        <div
                          className={`status-badge ${
                            scanFeedbackState === "processing" ? "processing" : ""
                          }`}
                        >
                          {isLookingUp ? (
                            <span className="spinner" aria-hidden="true" />
                          ) : null}
                          <span>{scanStatus}</span>
                        </div>
                        <div className={`scan-window ${scanFeedbackState}`}>
                          <div className="scan-corners" aria-hidden="true">
                            <span />
                            <span />
                            <span />
                            <span />
                          </div>
                        </div>
                        <div className="camera-guidance">
                          Keep the code flat, fill the frame, and move closer for
                          small items.
                        </div>
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
                      <ul className="items-list" style={{ padding: "0 12px 12px" }}>
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
                      <button
                        className={`cta-button ${pulseLogButton ? "pulsing" : ""}`}
                        type="button"
                        onClick={handleLogBasket}
                      >
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
                        <div className="stat-card">
                          <div className="stat-label">Today's baskets</div>
                          <div className="stat-value">{storeStats.today}</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">This week</div>
                          <div className="stat-value">{storeStats.week}</div>
                        </div>
                        <div className="stat-card">
                          <div className="stat-label">This month</div>
                          <div className="stat-value">{storeStats.month}</div>
                        </div>
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
                            data={topProductsToday}
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
                            data={myStorePeakHours}
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
                            <YAxis
                              tickLine={false}
                              axisLine={false}
                              tick={{ fontSize: 12, fill: "#5b5b5b" }}
                            />
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
                        Lunch and evening traffic stand out as the busiest periods in
                        this store today.
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

                  <section className="panel">
                    <div className="panel-body" style={{ border: "2px solid rgba(230, 28, 36, 0.3)", borderRadius: "24px" }}>
                      <div className="champion-title">Restock Alert</div>
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
                    <div className="streak-title">{streakDays} Day Streak!</div>
                    <div className="streak-copy">
                      Scan at least 5 baskets today to keep it alive
                    </div>
                    <div className="streak-countdown">
                      {basketsRemainingForStreak} more baskets today to maintain streak
                    </div>
                  </section>

                  <section className="panel">
                    <div className="section-head">
                      <div className="section-title">Progress To Next Reward</div>
                    </div>
                    <div className="panel-body">
                      <div className="reward-level">
                        <div className="reward-level-title">Current level: SILVER 🥈</div>
                        <div className="reward-level-chip">{rewardProgress}/1000 baskets</div>
                      </div>
                      <div className="reward-progress-track">
                        <div
                          className="reward-progress-fill"
                          style={{ width: `${rewardProgressPercent}%` }}
                        />
                      </div>
                      <div className="reward-progress-copy">
                        {1000 - rewardProgress} baskets until GOLD 🥇
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
                        {CURRENT_REWARD.title}
                      </div>
                      <div className="hq-copy">
                        Current unlocked reward for {STORE_NAME}. Claim it when you are
                        ready to place the next order.
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
                <div className="rankings-stack">
                  <section className="rank-card">
                    <div className="rank-medal">🥈</div>
                    <div className="rank-title">You are #2 in Narimanov District</div>
                    <div className="rank-subtitle">164 baskets behind #1</div>
                    <div className="rank-trend">You moved up 2 places this week ↑</div>
                  </section>

                  <section className="panel">
                    <div className="panel-body">
                      <div className="champion-preview">
                        <div className="champion-title">District Champion Preview</div>
                        <div className="champion-copy">
                          Reach #1 to unlock District Champion badge + free case of
                          Coca-Cola.
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="panel">
                    <div className="section-head">
                      <div className="section-title">Leaderboard Range</div>
                    </div>
                    <div className="panel-body">
                      <div className="switch-row">
                        <button
                          className={`mini-switch ${rankingsRange === "week" ? "active" : ""}`}
                          type="button"
                          onClick={() => setRankingsRange("week")}
                        >
                          This Week
                        </button>
                        <button
                          className={`mini-switch ${rankingsRange === "month" ? "active" : ""}`}
                          type="button"
                          onClick={() => setRankingsRange("month")}
                        >
                          This Month
                        </button>
                        <button
                          className={`mini-switch ${rankingsRange === "allTime" ? "active" : ""}`}
                          type="button"
                          onClick={() => setRankingsRange("allTime")}
                        >
                          All Time
                        </button>
                      </div>
                    </div>
                  </section>

                  <section className="panel">
                    <div className="section-head">
                      <div className="leaderboard-title">
                        {rankingsScope === "district"
                          ? `🏆 Narimanov District — ${rankingsRangeLabel}`
                          : "🏙️ Baku City Leaderboard"}
                      </div>
                    </div>
                    <div className="panel-body">
                      <div className="switch-row scope-row">
                        <button
                          className={`mini-switch ${rankingsScope === "district" ? "active" : ""}`}
                          type="button"
                          onClick={() => setRankingsScope("district")}
                        >
                          District
                        </button>
                        <button
                          className={`mini-switch ${rankingsScope === "city" ? "active" : ""}`}
                          type="button"
                          onClick={() => setRankingsScope("city")}
                        >
                          City
                        </button>
                      </div>

                      {rankingsScope === "district" ? (
                        <ul className="leaderboard-list" style={{ marginTop: "14px" }}>
                          {currentDistrictRows.map((row) => (
                            <li
                              className={`leaderboard-row ${row.isYou ? "you" : ""} ${
                                row.muted ? "muted" : ""
                              }`}
                              key={`${rankingsRange}-${row.store}`}
                            >
                              <div className="leaderboard-rank">
                                <span>#{row.rank}</span>
                                <span>{row.medal || ""}</span>
                              </div>
                              <div className="leaderboard-store">
                                <div className="leaderboard-store-name">
                                  <span>{row.store}</span>
                                  {row.isYou ? <span className="you-tag">YOU</span> : null}
                                </div>
                                <div className="leaderboard-delta">(+{row.delta} today)</div>
                              </div>
                              <div className="leaderboard-score">
                                <div className="leaderboard-score-value">{row.baskets}</div>
                                <div className="leaderboard-score-label">baskets</div>
                              </div>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <>
                          <ul className="leaderboard-list" style={{ marginTop: "14px" }}>
                            {currentCityRows.map((row) => (
                              <li className="leaderboard-row" key={`${rankingsRange}-${row.store}`}>
                                <div className="leaderboard-rank">
                                  <span>#{row.rank}</span>
                                </div>
                                <div className="leaderboard-store">
                                  <div className="leaderboard-store-name">
                                    <span>{row.store}</span>
                                  </div>
                                  <div className="leaderboard-delta">(+{row.delta} today)</div>
                                </div>
                                <div className="leaderboard-score">
                                  <div className="leaderboard-score-value">{row.baskets}</div>
                                  <div className="leaderboard-score-label">baskets</div>
                                </div>
                              </li>
                            ))}
                          </ul>

                          <div className="city-rank-card">
                            <div className="city-rank-title">
                              You are #{currentCityRank.rank} in Baku overall
                            </div>
                            <div className="city-rank-copy">
                              {STORE_NAME} currently has {currentCityRank.baskets} baskets
                              in this view, even though it is outside the top 10 city
                              leaderboard.
                            </div>
                          </div>

                          <ul className="leaderboard-list" style={{ marginTop: "12px" }}>
                            <li className="leaderboard-row you">
                              <div className="leaderboard-rank">
                                <span>#{currentCityRank.rank}</span>
                              </div>
                              <div className="leaderboard-store">
                                <div className="leaderboard-store-name">
                                  <span>Store #47 — Narimanov</span>
                                  <span className="you-tag">YOU</span>
                                </div>
                                <div className="leaderboard-delta">
                                  (+{currentCityRank.delta} today)
                                </div>
                              </div>
                              <div className="leaderboard-score">
                                <div className="leaderboard-score-value">
                                  {currentCityRank.baskets}
                                </div>
                                <div className="leaderboard-score-label">baskets</div>
                              </div>
                            </li>
                          </ul>
                        </>
                      )}
                    </div>
                  </section>
                </div>
              ) : null}
            </div>
          ) : (
            <section className="hq-shell">
              <div className="hq-main">
                <div className="hq-header">
                  <div className="hq-header-copy">
                    <div className="hq-label">CCI Headquarters Intelligence</div>
                    <div className="hq-heading">SCAN Network Dashboard</div>
                    <div className="hq-subcopy">
                      Live basket intelligence across all active stores in Baku,
                      focused on what customers buy with CCI products.
                    </div>
                  </div>
                </div>

                <div className="hq-metrics">
                  {HQ_METRICS.map((metric) => (
                    <div className="hq-metric-card" key={metric.label}>
                      <div className="hq-metric-label">{metric.label}</div>
                      <div className="hq-metric-value">{metric.value}</div>
                    </div>
                  ))}
                </div>

                <div className="hq-grid">
                  <div className="hq-card">
                    <div className="hq-card-title">
                      What do customers buy with CCI products?
                    </div>
                    <div className="hq-card-copy">
                      Basket pair analysis across the full network of anonymized
                      stores.
                    </div>
                    <div className="hq-chart-shell">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={HQ_PAIR_ANALYSIS}
                          layout="vertical"
                          margin={{ top: 6, right: 18, left: 28, bottom: 6 }}
                        >
                          <CartesianGrid
                            strokeDasharray="3 3"
                            stroke="rgba(17,17,17,0.08)"
                          />
                          <XAxis
                            type="number"
                            tickLine={false}
                            axisLine={false}
                            domain={[0, 100]}
                            tickFormatter={(value) => `${value}%`}
                          />
                          <YAxis
                            type="category"
                            dataKey="label"
                            width={170}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fontSize: 12, fill: "#4d545f" }}
                          />
                          <Tooltip
                            formatter={(value, _name, item) => {
                              const suffix = item.payload.suffix
                                ? ` ${item.payload.suffix}`
                                : "";
                              return [`${value}%${suffix}`, "Share"];
                            }}
                            contentStyle={{
                              borderRadius: "14px",
                              border: "1px solid rgba(17,17,17,0.08)",
                              boxShadow: "0 12px 24px rgba(17,17,17,0.08)",
                            }}
                          />
                          <Bar
                            dataKey="percentage"
                            radius={[0, 10, 10, 0]}
                            fill={PRIMARY_RED}
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="hq-card">
                    <div className="hq-card-title">Geographic Breakdown</div>
                    <div className="hq-card-copy">
                      District comparison across all anonymized stores.
                    </div>
                    <table className="hq-table">
                      <thead>
                        <tr>
                          <th>District</th>
                          <th>Baskets</th>
                          <th>Top Pair</th>
                          <th>Trend</th>
                        </tr>
                      </thead>
                      <tbody>
                        {HQ_DISTRICT_BREAKDOWN.map((row) => (
                          <tr key={row.district}>
                            <td>{row.district}</td>
                            <td>{row.baskets}</td>
                            <td>{row.topPair}</td>
                            <td
                              className={
                                row.trend === "↓"
                                  ? "hq-trend-down"
                                  : row.trend === "→"
                                    ? "hq-trend-neutral"
                                    : "hq-trend-up"
                              }
                            >
                              {row.trend}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="hq-card">
                  <div className="hq-card-title">Peak Hours</div>
                  <div className="hq-card-copy">
                    Aggregated basket volume across all stores combined, with clear
                    lunch and evening surges.
                  </div>
                  <div className="hq-chart-shell" style={{ height: "280px" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart
                        data={HQ_PEAK_HOURS}
                        margin={{ top: 8, right: 18, left: 2, bottom: 6 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="rgba(17,17,17,0.08)"
                        />
                        <XAxis
                          dataKey="hour"
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 12, fill: "#5c6370" }}
                        />
                        <YAxis
                          tickLine={false}
                          axisLine={false}
                          tick={{ fontSize: 12, fill: "#5c6370" }}
                        />
                        <Tooltip
                          formatter={(value) => [`${value} baskets`, "Volume"]}
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
                </div>
              </div>

              <aside className="hq-sidebar">
                <div>
                  <div className="hq-sidebar-title">Live Transaction Feed</div>
                  <div className="hq-sidebar-copy">
                    New anonymized baskets stream in every few seconds from the
                    active network.
                  </div>
                </div>

                <div className="hq-feed">
                  {hqLiveFeed.map((entry) => (
                    <div className="hq-feed-item" key={entry.id}>
                      <div className="hq-feed-time">{entry.time}</div>
                      <div className="hq-feed-line">
                        District: {entry.district} — {entry.items}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="hq-sidebar-note">
                  Privacy mode is enabled. Headquarters sees district-level
                  activity and anonymized store performance only.
                </div>
              </aside>
            </section>
          )}
        </div>
      </main>

      {activeMode === "cashier" ? (
        <>
          {activeCashierTab === "scan" ? (
            <button
              className="demo-button"
              type="button"
              disabled={demoModeRunning}
              onClick={handleDemoMode}
            >
              {demoModeRunning ? "RUNNING DEMO..." : "DEMO MODE"}
            </button>
          ) : null}
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
        </>
      ) : null}
    </div>
  );
}
