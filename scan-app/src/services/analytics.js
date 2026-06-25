const DEFAULT_TOP_PRODUCTS = [
  { name: "Coca-Cola 330ml", scans: 38 },
  { name: "Lays Original", scans: 31 },
  { name: "Azerchay", scans: 24 },
  { name: "Fanta 500ml", scans: 19 },
  { name: "Sprite 330ml", scans: 14 },
];

const DEFAULT_STORE_PEAK_HOURS = [
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

const DEFAULT_HQ_PEAK_HOURS = [
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

const DEFAULT_HQ_METRICS = [
  { label: "Total baskets today", value: "2,847" },
  { label: "Active stores today", value: "134" },
  { label: "Most common basket pair", value: "Coke + Lays (68%)" },
  { label: "Fastest growing district", value: "Yasamal (+34%)" },
];

const DEFAULT_HQ_PAIR_ANALYSIS = [
  { label: "Coca-Cola 330ml + Lays Original", percentage: 68 },
  { label: "Fanta 500ml + Chips", percentage: 57 },
  { label: "Coca-Cola + Azerchay Tea", percentage: 41 },
  { label: "Sprite + Sandwich", percentage: 38 },
  { label: "Coca-Cola 2L + Bread", percentage: 35 },
  { label: "Energy Drink (alone)", percentage: 89, suffix: "alone" },
  { label: "Fanta + Azerchay", percentage: 28 },
  { label: "Sprite + Lays", percentage: 24 },
];

const DEFAULT_DISTRICT_BREAKDOWN = [
  { district: "Narimanov", baskets: 847, topPair: "Coke + Lays", trend: "↑" },
  { district: "Yasamal", baskets: 634, topPair: "Fanta + Chips", trend: "↑↑" },
  { district: "Khatai", baskets: 521, topPair: "Coke + Tea", trend: "→" },
  { district: "Sabunchu", baskets: 423, topPair: "Sprite + Sandwich", trend: "↓" },
  { district: "Surakhani", baskets: 387, topPair: "Coke + Bread", trend: "↑" },
];

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function isSameDay(date, targetDate) {
  return (
    date.getFullYear() === targetDate.getFullYear() &&
    date.getMonth() === targetDate.getMonth() &&
    date.getDate() === targetDate.getDate()
  );
}

function formatProductName(name, quantity) {
  const normalizedName = `${name || ""}`.trim();
  const normalizedQuantity = `${quantity || ""}`.trim();

  if (normalizedName.includes("Coca-Cola")) {
    return normalizedQuantity ? `Coca-Cola ${normalizedQuantity}` : "Coca-Cola 330ml";
  }

  if (normalizedName.includes("Lays")) {
    return "Lays Original";
  }

  if (normalizedName.includes("Azerchay")) {
    return normalizedQuantity || normalizedName.includes("Tea")
      ? "Azerchay Black Tea"
      : "Azerchay";
  }

  if (normalizedName.includes("Fanta")) {
    return normalizedQuantity ? `Fanta ${normalizedQuantity}` : "Fanta 500ml";
  }

  if (normalizedName.includes("Sprite")) {
    return normalizedQuantity ? `Sprite ${normalizedQuantity}` : "Sprite 330ml";
  }

  if (normalizedQuantity && normalizedQuantity !== "Unknown quantity") {
    return `${normalizedName} ${normalizedQuantity}`.trim();
  }

  return normalizedName || "Unknown Product";
}

function shortLabel(value) {
  if (value.includes("Coca-Cola")) {
    return "Coke";
  }

  if (value.includes("Lays")) {
    return "Lays";
  }

  if (value.includes("Azerchay")) {
    return "Tea";
  }

  if (value.includes("Fanta")) {
    return "Fanta";
  }

  if (value.includes("Sprite")) {
    return "Sprite";
  }

  return value;
}

function basketItemsToLabels(items) {
  return items.map((item) =>
    formatProductName(item.product_name, item.quantity)
  );
}

function formatFeedEntry(basket) {
  const time = toDate(basket.created_at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const items = basketItemsToLabels(basket.items).map(shortLabel).join(" + ");

  return {
    id: basket.id,
    time,
    district: basket.district,
    items,
    line: `${time} — District: ${basket.district} — ${items}`,
  };
}

function countPairs(baskets) {
  const pairCounts = new Map();
  const singleCounts = new Map();

  baskets.forEach((basket) => {
    const uniqueLabels = [...new Set(basketItemsToLabels(basket.items))];

    if (uniqueLabels.length === 1) {
      const singleKey = `${uniqueLabels[0]} (alone)`;
      singleCounts.set(singleKey, (singleCounts.get(singleKey) || 0) + 1);
      return;
    }

    for (let index = 0; index < uniqueLabels.length; index += 1) {
      for (let nextIndex = index + 1; nextIndex < uniqueLabels.length; nextIndex += 1) {
        const pairKey = [uniqueLabels[index], uniqueLabels[nextIndex]].sort().join(" + ");
        pairCounts.set(pairKey, (pairCounts.get(pairKey) || 0) + 1);
      }
    }
  });

  return { pairCounts, singleCounts };
}

function buildPairAnalysis(baskets) {
  if (!baskets.length) {
    return DEFAULT_HQ_PAIR_ANALYSIS;
  }

  const totalBaskets = baskets.length;
  const { pairCounts, singleCounts } = countPairs(baskets);
  const combined = [
    ...Array.from(pairCounts.entries()).map(([label, count]) => ({
      label,
      percentage: Math.max(1, Math.round((count / totalBaskets) * 100)),
    })),
    ...Array.from(singleCounts.entries()).map(([label, count]) => ({
      label,
      percentage: Math.max(1, Math.round((count / totalBaskets) * 100)),
      suffix: "alone",
    })),
  ]
    .sort((left, right) => right.percentage - left.percentage || right.label.localeCompare(left.label))
    .slice(0, 8);

  return combined.length ? combined : DEFAULT_HQ_PAIR_ANALYSIS;
}

function buildPeakHours(baskets, formatter) {
  const hours = new Map();

  for (let hour = 8; hour <= 21; hour += 1) {
    hours.set(hour, 0);
  }

  baskets.forEach((basket) => {
    const hour = toDate(basket.created_at).getHours();

    if (hours.has(hour)) {
      hours.set(hour, hours.get(hour) + 1);
    }
  });

  const rows = Array.from(hours.entries()).map(([hour, basketsCount]) =>
    formatter(hour, basketsCount)
  );

  return rows.some((row) => row.baskets > 0) ? rows : null;
}

function buildTopProductsToday(baskets) {
  const today = new Date();
  const counts = new Map();

  baskets.forEach((basket) => {
    const createdAt = toDate(basket.created_at);

    if (!isSameDay(createdAt, today)) {
      return;
    }

    basket.items.forEach((item) => {
      const label = formatProductName(item.product_name, item.quantity);
      counts.set(label, (counts.get(label) || 0) + 1);
    });
  });

  const rows = Array.from(counts.entries())
    .map(([name, scans]) => ({ name, scans }))
    .sort((left, right) => right.scans - left.scans)
    .slice(0, 5);

  return rows.length ? rows : DEFAULT_TOP_PRODUCTS;
}

function buildStoreTopPairs(baskets) {
  const { pairCounts } = countPairs(baskets);

  const rows = Array.from(pairCounts.entries())
    .map(([label, count]) => ({
      label,
      count,
      percentage: Math.max(1, Math.round((count / Math.max(baskets.length, 1)) * 100)),
    }))
    .sort((left, right) => right.count - left.count)
    .slice(0, 2)
    .map((row) => ({
      title: row.label.replace("Coca-Cola", "Coke"),
      subtitle: `${row.percentage}% of baskets in this store`,
      percentage: row.percentage,
    }));

  return rows.length
    ? rows
    : [
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
}

function buildDistrictBreakdown(baskets) {
  if (!baskets.length) {
    return DEFAULT_DISTRICT_BREAKDOWN;
  }

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const districtMap = new Map();

  baskets.forEach((basket) => {
    const districtKey = basket.district || "Unknown";
    const createdAt = toDate(basket.created_at);
    const current = districtMap.get(districtKey) || {
      district: districtKey,
      baskets: 0,
      today: 0,
      yesterday: 0,
      basketsForPairs: [],
    };

    current.baskets += 1;
    current.basketsForPairs.push(basket);

    if (isSameDay(createdAt, today)) {
      current.today += 1;
    } else if (isSameDay(createdAt, yesterday)) {
      current.yesterday += 1;
    }

    districtMap.set(districtKey, current);
  });

  const rows = Array.from(districtMap.values())
    .map((row) => {
      const pairAnalysis = buildPairAnalysis(row.basketsForPairs);
      const topPair = pairAnalysis[0]?.label || "No pair data";
      const delta = row.today - row.yesterday;
      const trend = delta > 1 ? "↑↑" : delta > 0 ? "↑" : delta < 0 ? "↓" : "→";

      return {
        district: row.district,
        baskets: row.baskets,
        topPair,
        trend,
        delta,
      };
    })
    .sort((left, right) => right.baskets - left.baskets)
    .slice(0, 5);

  return rows.length ? rows : DEFAULT_DISTRICT_BREAKDOWN;
}

function buildFastestGrowingDistrict(baskets) {
  const rows = buildDistrictBreakdown(baskets);

  if (!rows.length || rows === DEFAULT_DISTRICT_BREAKDOWN) {
    return "Yasamal (+34%)";
  }

  const best = [...rows].sort((left, right) => right.delta - left.delta)[0];
  const formattedDelta = best.delta > 0 ? `+${best.delta}` : `${best.delta}`;

  return `${best.district} (${formattedDelta})`;
}

function buildStoreStats(baskets) {
  const now = new Date();
  const weekStart = new Date(now);
  const dayOfWeek = weekStart.getDay() || 7;
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - dayOfWeek + 1);

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  return baskets.reduce(
    (stats, basket) => {
      const createdAt = toDate(basket.created_at);

      if (isSameDay(createdAt, now)) {
        stats.today += 1;
      }

      if (createdAt >= weekStart) {
        stats.week += 1;
      }

      if (createdAt >= monthStart) {
        stats.month += 1;
      }

      return stats;
    },
    { today: 0, week: 0, month: 0 }
  );
}

function buildMostCommonPairLabel(baskets) {
  const topPair = buildPairAnalysis(baskets)[0];

  if (!topPair) {
    return "Coke + Lays (68%)";
  }

  return `${topPair.label.replace("Coca-Cola", "Coke")} (${topPair.percentage}%)`;
}

export function createDashboardSnapshot(allBaskets, storeName) {
  const sortedBaskets = [...allBaskets].sort(
    (left, right) => toDate(right.created_at) - toDate(left.created_at)
  );
  const storeBaskets = sortedBaskets.filter((basket) => basket.store_name === storeName);
  const today = new Date();
  const todayBaskets = sortedBaskets.filter((basket) =>
    isSameDay(toDate(basket.created_at), today)
  );
  const storePeakHours =
    buildPeakHours(storeBaskets, (hour, baskets) => ({
      hour: String(hour).padStart(2, "0"),
      baskets,
    })) || DEFAULT_STORE_PEAK_HOURS;
  const hqPeakHours =
    buildPeakHours(sortedBaskets, (hour, baskets) => ({
      hour: `${String(hour).padStart(2, "0")}:00`,
      baskets,
    })) || DEFAULT_HQ_PEAK_HOURS;
  const topProductsToday = buildTopProductsToday(storeBaskets);
  const myStoreTopPairs = buildStoreTopPairs(storeBaskets);
  const hqPairAnalysis = buildPairAnalysis(sortedBaskets);
  const hqDistrictBreakdown = buildDistrictBreakdown(sortedBaskets);
  const hqMetrics = [
    {
      label: "Total baskets today",
      value: todayBaskets.length ? todayBaskets.length.toLocaleString() : DEFAULT_HQ_METRICS[0].value,
    },
    {
      label: "Active stores today",
      value: new Set(todayBaskets.map((basket) => basket.store_id)).size
        ? new Set(todayBaskets.map((basket) => basket.store_id)).size.toLocaleString()
        : DEFAULT_HQ_METRICS[1].value,
    },
    {
      label: "Most common basket pair",
      value: buildMostCommonPairLabel(sortedBaskets),
    },
    {
      label: "Fastest growing district",
      value: buildFastestGrowingDistrict(sortedBaskets),
    },
  ];

  return {
    baskets: sortedBaskets,
    storeStats: storeBaskets.length ? buildStoreStats(storeBaskets) : { today: 47, week: 284, month: 1203 },
    topProductsToday,
    myStorePeakHours: storePeakHours,
    myStoreTopPairs,
    hqMetrics,
    hqPairAnalysis: hqPairAnalysis.length ? hqPairAnalysis : DEFAULT_HQ_PAIR_ANALYSIS,
    hqDistrictBreakdown,
    hqPeakHours,
    hqLiveFeed: sortedBaskets.slice(0, 10).map(formatFeedEntry),
  };
}
