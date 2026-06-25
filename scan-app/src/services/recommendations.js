const SEEDED_RECOMMENDATIONS = [
  {
    id: "seed-bundle-yasamal",
    priority: "High",
    type: "Bundle Opportunity",
    title: "Coca-Cola + chips bundle is gaining traction in Yasamal",
    detectedPattern:
      "Coca-Cola 500ml + chips appears in 34% of afternoon baskets in Yasamal.",
    recommendedAction:
      "Test Coca-Cola + chips bundle in 20 Yasamal stores for 14 days with end-cap visibility.",
    expectedBusinessValue:
      "Higher attach rate on CCI beverages and better multi-item basket conversion.",
    confidence: "High",
    supportingData: {
      basketCount: 1246,
      storeCount: 26,
      district: "Yasamal",
      timeWindow: "15:00 - 19:00",
      patternStrength: "34% of qualifying baskets",
    },
    priorityScore: 89,
  },
  {
    id: "seed-daypart-khatai",
    priority: "Medium",
    type: "Daypart Opportunity",
    title: "Fuse Tea demand clusters in the evening",
    detectedPattern:
      "Fuse Tea baskets peak between 17:00 and 20:00, especially with sweet snacks.",
    recommendedAction:
      "Run evening refreshment placement near sweet snacks and chilled ready-to-drink tea doors.",
    expectedBusinessValue:
      "Better conversion during the evening refreshment mission and stronger tea visibility.",
    confidence: "Medium",
    supportingData: {
      basketCount: 462,
      storeCount: 11,
      district: "Khatai",
      timeWindow: "17:00 - 20:00",
      patternStrength: "28% of evening baskets",
    },
    priorityScore: 62,
  },
  {
    id: "seed-district-narimanov",
    priority: "Medium",
    type: "District Pattern",
    title: "Narimanov over-indexes on Coke + snack missions",
    detectedPattern:
      "Narimanov shows stronger Coca-Cola + snack pairing than Sabunchu and Surakhani.",
    recommendedAction:
      "Use a district-specific bundle strategy with snack adjacency and cooler facings in Narimanov.",
    expectedBusinessValue:
      "More targeted in-store execution where pairing propensity is already strong.",
    confidence: "Medium",
    supportingData: {
      basketCount: 688,
      storeCount: 14,
      district: "Narimanov",
      timeWindow: "All day",
      patternStrength: "18-point lift vs other districts",
    },
    priorityScore: 58,
  },
  {
    id: "seed-promo-baku",
    priority: "Low",
    type: "Promotion Effectiveness",
    title: "Single-product discount lifted volume but not basket size",
    detectedPattern:
      "Discounted Coca-Cola baskets increased by 21%, but average basket size remained flat.",
    recommendedAction:
      "Shift from single-product discounting to bundle-based promotion with snack add-ons.",
    expectedBusinessValue:
      "Protects margin while improving total basket value and attachment.",
    confidence: "Low",
    supportingData: {
      basketCount: 284,
      storeCount: 9,
      district: "Baku mixed districts",
      timeWindow: "Last 7 days",
      patternStrength: "+21% promo basket lift",
    },
    priorityScore: 41,
  },
  {
    id: "seed-execution-nizami",
    priority: "Medium",
    type: "Store Execution Alert",
    title: "Evening CCI demand is outpacing scan coverage in Nizami",
    detectedPattern:
      "12 active stores in Nizami show high CCI demand but weak evening scan consistency.",
    recommendedAction:
      "Sales reps should check evening stock, cooler visibility, and cashier scan compliance in Nizami.",
    expectedBusinessValue:
      "Reduces missed CCI capture and improves execution quality in high-potential stores.",
    confidence: "Medium",
    supportingData: {
      basketCount: 398,
      storeCount: 12,
      district: "Nizami",
      timeWindow: "17:00 - 21:00",
      patternStrength: "42% of CCI demand with low scan coverage",
    },
    priorityScore: 57,
  },
];

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function getTimeWindow(dateValue) {
  const hour = toDate(dateValue).getHours();

  if (hour >= 8 && hour < 11) {
    return "08:00 - 11:00";
  }

  if (hour >= 11 && hour < 15) {
    return "11:00 - 15:00";
  }

  if (hour >= 15 && hour < 17) {
    return "15:00 - 17:00";
  }

  return "17:00 - 20:00";
}

function normalizeLabel(label) {
  const value = `${label || ""}`.trim();

  if (value.includes("Coca-Cola")) {
    return "Coca-Cola 500ml";
  }

  if (value.includes("Lays")) {
    return "chips";
  }

  if (value.includes("Sprite")) {
    return "Sprite";
  }

  if (value.includes("Fanta")) {
    return "Fanta 500ml";
  }

  if (value.includes("Azerchay")) {
    return "Azerchay Tea";
  }

  return value;
}

function itemCategory(item) {
  return item.category === "Manual Entry" ? "Manual Entry" : item.category || "General";
}

function basketLabels(basket) {
  return basket.items.map((item) => normalizeLabel(item.product_name));
}

function containsCci(basket) {
  return basket.items.some((item) => item.is_cci_product);
}

function confidenceFromSupport(basketCount, storeCount, dayCount) {
  if (basketCount >= 1000 && storeCount >= 20 && dayCount >= 3) {
    return "High";
  }

  if (basketCount >= 300 && storeCount >= 8) {
    return "Medium";
  }

  return "Low";
}

function confidenceWeight(confidence) {
  if (confidence === "High") {
    return 1;
  }

  if (confidence === "Medium") {
    return 0.72;
  }

  return 0.45;
}

function priorityFromScore(score) {
  if (score >= 70) {
    return "High";
  }

  if (score >= 45) {
    return "Medium";
  }

  return "Low";
}

function priorityScore({ patternStrength, storeCoverage, cciRelevance, confidence }) {
  return Math.round(patternStrength * storeCoverage * cciRelevance * confidence * 100);
}

function uniqueStoreCount(baskets) {
  return new Set(baskets.map((basket) => basket.store_id).filter(Boolean)).size;
}

function uniqueDayCount(baskets) {
  return new Set(
    baskets.map((basket) => toDate(basket.created_at).toISOString().slice(0, 10))
  ).size;
}

function createBundleOpportunity(baskets) {
  const stats = new Map();

  baskets.forEach((basket) => {
    if (!containsCci(basket)) {
      return;
    }

    const labels = basketLabels(basket);
    const cciLabel = labels.find((label) =>
      label.includes("Coca-Cola") || label.includes("Fanta") || label.includes("Sprite")
    );
    const partnerItem = basket.items.find((item) => {
      const category = itemCategory(item);
      return category === "Snacks" || category === "Food" || category === "Bakery";
    });

    if (!cciLabel || !partnerItem) {
      return;
    }

    const key = `${basket.district}|${getTimeWindow(basket.created_at)}|${cciLabel}|${partnerItem.category}`;
    const current = stats.get(key) || {
      district: basket.district,
      timeWindow: getTimeWindow(basket.created_at),
      cciLabel,
      partnerCategory: partnerItem.category,
      baskets: [],
    };

    current.baskets.push(basket);
    stats.set(key, current);
  });

  const best = [...stats.values()]
    .map((entry) => {
      const basketCount = entry.baskets.length;
      const storeCount = uniqueStoreCount(entry.baskets);
      const dayCount = uniqueDayCount(entry.baskets);
      const confidence = confidenceFromSupport(basketCount, storeCount, dayCount);
      const score = priorityScore({
        patternStrength: Math.min(0.95, basketCount / Math.max(baskets.length, 1)),
        storeCoverage: Math.min(1, storeCount / 20),
        cciRelevance: 1,
        confidence: confidenceWeight(confidence),
      });

      return {
        id: `bundle-${entry.district}-${entry.partnerCategory}`,
        priority: priorityFromScore(score),
        type: "Bundle Opportunity",
        title: `${entry.cciLabel} + ${entry.partnerCategory.toLowerCase()} bundle is outperforming`,
        detectedPattern: `${entry.cciLabel} + ${entry.partnerCategory.toLowerCase()} appears frequently in ${entry.timeWindow} baskets in ${entry.district}.`,
        recommendedAction: `Test ${entry.cciLabel} + ${entry.partnerCategory.toLowerCase()} bundle in 20 ${entry.district} stores for 14 days.`,
        expectedBusinessValue: "Improves attach rate and multi-item CCI basket conversion.",
        confidence,
        supportingData: {
          basketCount,
          storeCount,
          district: entry.district,
          timeWindow: entry.timeWindow,
        },
        priorityScore: score,
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore)[0];

  return best || null;
}

function createDaypartOpportunity(baskets) {
  const byProduct = new Map();

  baskets.forEach((basket) => {
    basket.items.forEach((item) => {
      if (!item.is_cci_product) {
        return;
      }

      const label = normalizeLabel(item.product_name);
      const current = byProduct.get(label) || {
        label,
        totals: new Map(),
        baskets: [],
      };
      const timeWindow = getTimeWindow(basket.created_at);
      current.totals.set(timeWindow, (current.totals.get(timeWindow) || 0) + 1);
      current.baskets.push(basket);
      byProduct.set(label, current);
    });
  });

  const best = [...byProduct.values()]
    .map((entry) => {
      const total = [...entry.totals.values()].reduce((sum, count) => sum + count, 0);
      const [timeWindow, count] = [...entry.totals.entries()].sort((left, right) => right[1] - left[1])[0] || [];

      if (!timeWindow || total < 3) {
        return null;
      }

      const basketCount = count;
      const storeCount = uniqueStoreCount(entry.baskets);
      const dayCount = uniqueDayCount(entry.baskets);
      const confidence = confidenceFromSupport(basketCount, storeCount, dayCount);
      const share = count / total;
      const score = priorityScore({
        patternStrength: Math.min(0.95, share),
        storeCoverage: Math.min(1, storeCount / 20),
        cciRelevance: 1,
        confidence: confidenceWeight(confidence),
      });

      return {
        id: `daypart-${entry.label}`,
        priority: priorityFromScore(score),
        type: "Daypart Opportunity",
        title: `${entry.label} is strongest in ${timeWindow}`,
        detectedPattern: `${entry.label} baskets peak in the ${timeWindow} window across active stores.`,
        recommendedAction: `Run ${timeWindow} placement near sweet snacks and ready-to-drink refreshment zones.`,
        expectedBusinessValue: "Improves timing of execution and strengthens daypart conversion.",
        confidence,
        supportingData: {
          basketCount,
          storeCount,
          district: "Baku mixed districts",
          timeWindow,
        },
        priorityScore: score,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.priorityScore - left.priorityScore)[0];

  return best || null;
}

function createDistrictPattern(baskets) {
  const districtPairStats = new Map();

  baskets.forEach((basket) => {
    const labels = basketLabels(basket);
    const hasCciPair = labels.some((label) => label.includes("Coca-Cola") || label.includes("Fanta") || label.includes("Sprite"));

    if (!hasCciPair || labels.length < 2) {
      return;
    }

    const pairLabel = labels.slice(0, 2).sort().join(" + ");
    const key = `${basket.district}|${pairLabel}`;
    const current = districtPairStats.get(key) || {
      district: basket.district,
      pairLabel,
      baskets: [],
    };

    current.baskets.push(basket);
    districtPairStats.set(key, current);
  });

  const rows = [...districtPairStats.values()].map((entry) => {
    const basketCount = entry.baskets.length;
    const storeCount = uniqueStoreCount(entry.baskets);
    const dayCount = uniqueDayCount(entry.baskets);
    const confidence = confidenceFromSupport(basketCount, storeCount, dayCount);
    const score = priorityScore({
      patternStrength: Math.min(0.95, basketCount / Math.max(baskets.length, 1)),
      storeCoverage: Math.min(1, storeCount / 20),
      cciRelevance: 1,
      confidence: confidenceWeight(confidence),
    });

    return {
      id: `district-${entry.district}-${entry.pairLabel}`,
      priority: priorityFromScore(score),
      type: "District Pattern",
      title: `${entry.district} is over-indexing on ${entry.pairLabel.replace(" + ", " + ")}`,
      detectedPattern: `${entry.district} shows a stronger ${entry.pairLabel} pairing than comparable districts.`,
      recommendedAction: `Use a district-specific bundle strategy in ${entry.district} with focused shopper messaging.`,
      expectedBusinessValue: "Directs trade spend to the district with the strongest conversion pattern.",
      confidence,
      supportingData: {
        basketCount,
        storeCount,
        district: entry.district,
        timeWindow: "All day",
      },
      priorityScore: score,
    };
  });

  return rows.sort((left, right) => right.priorityScore - left.priorityScore)[0] || null;
}

function createShelfPlacementSignal(baskets) {
  const candidates = new Map();

  baskets.forEach((basket) => {
    const beverageItem = basket.items.find((item) => item.is_cci_product);
    const adjacentItem = basket.items.find((item) => {
      const category = itemCategory(item);
      return category === "Snacks" || category === "Food" || category === "Bakery";
    });

    if (!beverageItem || !adjacentItem) {
      return;
    }

    const label = normalizeLabel(beverageItem.product_name);
    const key = `${basket.district}|${label}|${adjacentItem.category}`;
    const current = candidates.get(key) || {
      district: basket.district,
      beverage: label,
      adjacentCategory: adjacentItem.category,
      baskets: [],
    };
    current.baskets.push(basket);
    candidates.set(key, current);
  });

  const best = [...candidates.values()]
    .map((entry) => {
      const basketCount = entry.baskets.length;
      const storeCount = uniqueStoreCount(entry.baskets);
      const dayCount = uniqueDayCount(entry.baskets);
      const confidence = confidenceFromSupport(basketCount, storeCount, dayCount);
      const score = priorityScore({
        patternStrength: Math.min(0.95, basketCount / Math.max(baskets.length, 1)),
        storeCoverage: Math.min(1, storeCount / 20),
        cciRelevance: 1,
        confidence: confidenceWeight(confidence),
      });

      return {
        id: `placement-${entry.district}-${entry.beverage}`,
        priority: priorityFromScore(score),
        type: "Shelf Placement Signal",
        title: `${entry.beverage} is frequently paired with ${entry.adjacentCategory.toLowerCase()}`,
        detectedPattern: `${entry.beverage} is repeatedly bought with ${entry.adjacentCategory.toLowerCase()} in ${entry.district}.`,
        recommendedAction: `Place ${entry.beverage} closer to ready-to-eat food and ${entry.adjacentCategory.toLowerCase()} counters.`,
        expectedBusinessValue: "Improves impulse conversion by aligning cooler placement with shopper missions.",
        confidence,
        supportingData: {
          basketCount,
          storeCount,
          district: entry.district,
          timeWindow: "Office and evening missions",
        },
        priorityScore: score,
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore)[0];

  return best || null;
}

function createPromotionEffectiveness(baskets) {
  if (baskets.length < 12) {
    return null;
  }

  const cciBaskets = baskets.filter(containsCci);
  const averageBasketSize = cciBaskets.length
    ? cciBaskets.reduce((sum, basket) => sum + basket.total_items, 0) / cciBaskets.length
    : 0;
  const confidence = confidenceFromSupport(cciBaskets.length, uniqueStoreCount(cciBaskets), uniqueDayCount(cciBaskets));
  const score = priorityScore({
    patternStrength: Math.min(0.95, cciBaskets.length / Math.max(baskets.length, 1)),
    storeCoverage: Math.min(1, uniqueStoreCount(cciBaskets) / 20),
    cciRelevance: 1,
    confidence: confidenceWeight(confidence),
  });

  return {
    id: "promo-effectiveness-live",
    priority: priorityFromScore(score),
    type: "Promotion Effectiveness",
    title: "CCI promo volume is not fully translating into larger baskets",
    detectedPattern: `CCI baskets are up, but average basket size is holding near ${averageBasketSize.toFixed(1)} items.`,
    recommendedAction:
      "Shift from single-product discounting to bundled offers that include snacks or ready-to-eat food.",
    expectedBusinessValue:
      "Improves basket value while preserving promotional efficiency on CCI SKUs.",
    confidence,
    supportingData: {
      basketCount: cciBaskets.length,
      storeCount: uniqueStoreCount(cciBaskets),
      district: "Baku mixed districts",
      timeWindow: "Last 7 days",
    },
    priorityScore: score,
  };
}

function createStoreExecutionAlert(baskets) {
  const byDistrict = new Map();

  baskets.forEach((basket) => {
    const current = byDistrict.get(basket.district) || {
      district: basket.district,
      cciBaskets: [],
      eveningBaskets: [],
    };

    if (containsCci(basket)) {
      current.cciBaskets.push(basket);
    }

    if (getTimeWindow(basket.created_at) === "17:00 - 20:00") {
      current.eveningBaskets.push(basket);
    }

    byDistrict.set(basket.district, current);
  });

  const best = [...byDistrict.values()]
    .filter((entry) => entry.cciBaskets.length >= 3)
    .map((entry) => {
      const basketCount = entry.cciBaskets.length;
      const storeCount = uniqueStoreCount(entry.cciBaskets);
      const eveningCoverage = storeCount
        ? uniqueStoreCount(entry.eveningBaskets) / storeCount
        : 0;
      const confidence = confidenceFromSupport(basketCount, storeCount, uniqueDayCount(entry.cciBaskets));
      const score = priorityScore({
        patternStrength: Math.min(0.95, basketCount / Math.max(baskets.length, 1)),
        storeCoverage: Math.min(1, storeCount / 20),
        cciRelevance: 1,
        confidence: confidenceWeight(confidence),
      }) * (1 - Math.min(eveningCoverage, 0.9));

      return {
        id: `execution-${entry.district}`,
        priority: priorityFromScore(score),
        type: "Store Execution Alert",
        title: `${entry.district} has CCI demand but patchy evening execution`,
        detectedPattern: `${storeCount} active stores show CCI demand, but evening scan coverage remains weak.`,
        recommendedAction:
          `Sales reps should check evening stock, cooler visibility, and cashier scan discipline in ${entry.district}.`,
        expectedBusinessValue:
          "Protects evening conversion and reduces lost visibility in high-demand districts.",
        confidence,
        supportingData: {
          basketCount,
          storeCount,
          district: entry.district,
          timeWindow: "17:00 - 20:00",
        },
        priorityScore: Math.round(score),
      };
    })
    .sort((left, right) => right.priorityScore - left.priorityScore)[0];

  return best || null;
}

export function createRecommendedActions(baskets) {
  const liveRecommendations = [
    createBundleOpportunity(baskets),
    createDaypartOpportunity(baskets),
    createDistrictPattern(baskets),
    createPromotionEffectiveness(baskets),
    createShelfPlacementSignal(baskets),
    createStoreExecutionAlert(baskets),
  ]
    .filter(Boolean)
    .sort((left, right) => right.priorityScore - left.priorityScore);

  const selected = [];
  const usedTypes = new Set();

  liveRecommendations.forEach((recommendation) => {
    if (selected.length >= 5 || usedTypes.has(recommendation.type)) {
      return;
    }

    selected.push(recommendation);
    usedTypes.add(recommendation.type);
  });

  for (const seeded of SEEDED_RECOMMENDATIONS) {
    if (selected.length >= 5) {
      break;
    }

    if (usedTypes.has(seeded.type)) {
      continue;
    }

    selected.push(seeded);
    usedTypes.add(seeded.type);
  }

  return selected
    .sort((left, right) => right.priorityScore - left.priorityScore)
    .slice(0, 5);
}
