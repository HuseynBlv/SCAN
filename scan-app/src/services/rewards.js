const DEMO_REWARD_BASELINE = {
  totalPoints: 612,
  dailyPoints: 128,
  streakDays: 4,
  validBasketsToday: 24,
  cciBasketsToday: 19,
  validBasketsWeek: 249,
  dataQualityScore: 84,
};

const DISTRICT_WEEKLY_BASELINES = [
  { store: "Store #12", validBasketsWeek: 114 },
  { store: "Store #31", validBasketsWeek: 92 },
  { store: "Store #8", validBasketsWeek: 78 },
  { store: "Store #22", validBasketsWeek: 70 },
  { store: "Store #19", validBasketsWeek: 58 },
  { store: "Store #4", validBasketsWeek: 51 },
  { store: "Store #27", validBasketsWeek: 47 },
];

const REWARD_MILESTONES = [
  {
    id: "daily-scanner",
    title: "Daily Scanner badge",
    description: "10 valid baskets today",
    type: "badge",
    metric: "validBasketsToday",
    target: 10,
    badge: "Daily Scanner",
  },
  {
    id: "daily-bonus-25",
    title: "+50 reward points",
    description: "25 valid baskets today",
    type: "points",
    metric: "validBasketsToday",
    target: 25,
    points: 50,
  },
  {
    id: "cci-partner",
    title: "CCI Partner badge",
    description: "20 CCI baskets today",
    type: "badge",
    metric: "cciBasketsToday",
    target: 20,
    badge: "CCI Partner",
  },
  {
    id: "streak-3",
    title: "+10 reward points",
    description: "3-day streak",
    type: "points",
    metric: "streakDays",
    target: 3,
    points: 10,
  },
  {
    id: "streak-5",
    title: "+25 reward points",
    description: "5-day streak",
    type: "points",
    metric: "streakDays",
    target: 5,
    points: 25,
  },
  {
    id: "streak-7",
    title: "+50 reward points",
    description: "7-day streak",
    type: "points",
    metric: "streakDays",
    target: 7,
    points: 50,
  },
  {
    id: "discount-3",
    title: "3% discount on next CCI order",
    description: "100 valid baskets this week",
    type: "discount",
    metric: "validBasketsWeek",
    target: 100,
    rewardCode: "SCAN-CCI-3OFF",
  },
  {
    id: "discount-5",
    title: "5% discount on next CCI order",
    description: "250 valid baskets this week",
    type: "discount",
    metric: "validBasketsWeek",
    target: 250,
    rewardCode: "SCAN-CCI-5OFF",
  },
  {
    id: "trusted-store",
    title: "Trusted Store badge",
    description: "Data quality above 85%",
    type: "badge",
    metric: "dataQualityScore",
    target: 85,
    badge: "Trusted Store",
  },
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

function startOfDay(dateValue) {
  const date = toDate(dateValue);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isSameDay(leftValue, rightValue) {
  return startOfDay(leftValue).getTime() === startOfDay(rightValue).getTime();
}

function isWithinMinutes(leftValue, rightValue, minutes) {
  return Math.abs(toDate(leftValue).getTime() - toDate(rightValue).getTime()) <= minutes * 60 * 1000;
}

function getWeekStart(dateValue) {
  const date = startOfDay(dateValue);
  const day = date.getDay() || 7;
  date.setDate(date.getDate() - day + 1);
  return date;
}

function getBasketItemsCount(items) {
  return items.reduce((count, item) => count + (item.quantity || 1), 0);
}

function inferCategory(label = "") {
  const normalized = label.toLowerCase();

  if (
    normalized.includes("coca-cola") ||
    normalized.includes("fanta") ||
    normalized.includes("sprite") ||
    normalized.includes("energy") ||
    normalized.includes("water")
  ) {
    return "Beverages";
  }

  if (normalized.includes("lays") || normalized.includes("chips")) {
    return "Snacks";
  }

  if (normalized.includes("sandwich") || normalized.includes("bread")) {
    return "Food";
  }

  if (normalized.includes("tea") || normalized.includes("azerchay")) {
    return "Tea";
  }

  return "General";
}

function getScannedItemName(item) {
  return item.isUnknown ? item.customName.trim() || item.name : item.name;
}

function normalizeScannedItem(item) {
  const productName = getScannedItemName(item);

  return {
    product_name: productName,
    is_cci_product:
      `${productName} ${item.brand || ""}`.toLowerCase().includes("coca-cola") ||
      `${productName} ${item.brand || ""}`.toLowerCase().includes("fanta") ||
      `${productName} ${item.brand || ""}`.toLowerCase().includes("sprite"),
    category: inferCategory(productName),
    quantity: 1,
    is_manual: Boolean(item.isUnknown),
  };
}

function normalizePersistedItem(item) {
  return {
    product_name: item.product_name,
    is_cci_product: Boolean(item.is_cci_product),
    category: item.category || inferCategory(item.product_name),
    quantity: item.quantity || 1,
    is_manual: Boolean(item.is_manual) || item.category === "Manual Entry",
  };
}

function createBasketSignature(items) {
  return items
    .map((item) => item.product_name)
    .sort((left, right) => left.localeCompare(right))
    .join(" | ");
}

function hasFoodSnackPair(items) {
  const categories = new Set(items.map((item) => item.category));

  return (
    (categories.has("Snacks") && categories.has("Food")) ||
    (categories.has("Snacks") && categories.has("Beverages"))
  );
}

function qualityMultiplier(qualityScore, suspiciousScore) {
  if (suspiciousScore >= 100) {
    return 0;
  }

  if (suspiciousScore >= 70) {
    return 0.3;
  }

  if (qualityScore >= 85) {
    return 1.2;
  }

  if (qualityScore >= 60) {
    return 1.0;
  }

  return 0.7;
}

function buildRecentComparisonData(recentBaskets) {
  const now = new Date();
  const lastTwoMinutes = recentBaskets.filter((basket) =>
    isWithinMinutes(basket.created_at, now, 2)
  );
  const lastTenSeconds = recentBaskets.filter(
    (basket) => Math.abs(toDate(basket.created_at).getTime() - now.getTime()) <= 10000
  );

  return { lastTwoMinutes, lastTenSeconds };
}

export function evaluateBasketReward(scannedItems, recentBaskets) {
  const items = scannedItems.map(normalizeScannedItem);
  const totalItems = getBasketItemsCount(items);
  const manualCount = items.filter((item) => item.is_manual).length;
  const manualRatio = totalItems ? manualCount / totalItems : 0;
  const containsCci = items.some((item) => item.is_cci_product);
  const foodSnackPair = hasFoodSnackPair(items);
  const signature = createBasketSignature(items);
  const { lastTwoMinutes, lastTenSeconds } = buildRecentComparisonData(recentBaskets);
  const sameSignatureRecentCount = lastTwoMinutes.filter(
    (basket) => createBasketSignature(basket.items.map(normalizePersistedItem)) === signature
  ).length;
  const repeatedSingleItemOnly =
    totalItems === 1 &&
    recentBaskets.slice(0, 4).length === 4 &&
    recentBaskets
      .slice(0, 4)
      .every((basket) => basket.total_items === 1);
  const noVariation =
    recentBaskets.slice(0, 4).length === 4 &&
    recentBaskets
      .slice(0, 4)
      .every((basket) => createBasketSignature(basket.items.map(normalizePersistedItem)) === signature);
  const tooManyFastSubmissions = lastTenSeconds.length >= 4;
  const suspiciousReasons = [];

  if (sameSignatureRecentCount >= 4) {
    suspiciousReasons.push("Repeated same basket 5 times in 2 minutes");
  }

  if (tooManyFastSubmissions) {
    suspiciousReasons.push("Too many baskets submitted too quickly");
  }

  if (manualRatio > 0.5) {
    suspiciousReasons.push("More than 50% manual products");
  }

  if (repeatedSingleItemOnly) {
    suspiciousReasons.push("Repeated single-item baskets only");
  }

  if (noVariation) {
    suspiciousReasons.push("No variation in products");
  }

  const suspiciousScore = clamp(suspiciousReasons.length * 30, 0, 100);
  let qualityScore = 58;

  if (containsCci) {
    qualityScore += 12;
  }

  if (totalItems >= 2) {
    qualityScore += 10;
  }

  if (totalItems >= 3) {
    qualityScore += 14;
  }

  if (foodSnackPair) {
    qualityScore += 8;
  }

  if (manualCount > 0) {
    qualityScore -= 12;
  }

  if (manualRatio > 0.5) {
    qualityScore -= 22;
  }

  if (totalItems === 1) {
    qualityScore -= 14;
  }

  qualityScore -= suspiciousScore * 0.4;
  qualityScore = clamp(Math.round(qualityScore), 0, 100);

  const multiplier = qualityMultiplier(qualityScore, suspiciousScore);
  let basePoints = 1;

  if (containsCci) {
    basePoints += 2;
  }

  if (totalItems >= 2) {
    basePoints += 1;
  }

  if (totalItems >= 3) {
    basePoints += 2;
  }

  if (foodSnackPair) {
    basePoints += 1;
  }

  if (manualCount > 0) {
    basePoints -= manualRatio > 0.5 ? 2 : 1;
  }

  const pointsAwarded =
    suspiciousReasons.length > 0
      ? 0
      : Math.max(0, Math.round(Math.max(basePoints, 0) * multiplier));

  return {
    containsCci,
    totalItems,
    manualCount,
    manualRatio,
    foodSnackPair,
    suspiciousReasons,
    suspiciousScore,
    qualityScore,
    pointsAwarded,
    isValid: pointsAwarded > 0,
    qualityLabel:
      pointsAwarded === 0
        ? "Suspicious activity"
        : qualityScore >= 85
          ? "Excellent data quality"
          : qualityScore >= 60
            ? "Normal data quality"
            : "Weak data quality",
  };
}

function buildDailyStats(storeBaskets, dateValue) {
  const targetDay = startOfDay(dateValue);
  const todayBaskets = storeBaskets.filter((basket) => isSameDay(basket.created_at, targetDay));
  const validBasketsToday = todayBaskets.filter((basket) => basket.points_awarded > 0);
  const cciBasketsToday = validBasketsToday.filter((basket) => basket.contains_cci);
  const dailyPoints = validBasketsToday.reduce(
    (sum, basket) => sum + (basket.points_awarded || 0),
    0
  );

  return {
    todayBaskets,
    validBasketsToday: validBasketsToday.length,
    cciBasketsToday: cciBasketsToday.length,
    dailyPoints,
  };
}

function buildWeeklyStats(storeBaskets, dateValue) {
  const weekStart = getWeekStart(dateValue);
  const validWeekly = storeBaskets.filter(
    (basket) => basket.points_awarded > 0 && toDate(basket.created_at) >= weekStart
  );

  return {
    validBasketsWeek: validWeekly.length,
  };
}

function buildStreakDays(storeBaskets, baselineStreakDays, dateValue) {
  const validBasketDays = new Map();

  storeBaskets.forEach((basket) => {
    if (basket.points_awarded <= 0) {
      return;
    }

    const key = startOfDay(basket.created_at).toISOString();
    validBasketDays.set(key, (validBasketDays.get(key) || 0) + 1);
  });

  let streak = baselineStreakDays;
  let cursor = startOfDay(dateValue);
  let firstDay = true;

  while (true) {
    const key = cursor.toISOString();
    const validCount = validBasketDays.get(key) || 0;

    if (validCount >= 5 || (firstDay && validCount > 0)) {
      streak += 1;
      firstDay = false;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }

    break;
  }

  return streak;
}

function buildDistrictRank(validBasketsWeek) {
  const ranked = [...DISTRICT_WEEKLY_BASELINES, { store: "Store #47", validBasketsWeek }]
    .sort((left, right) => right.validBasketsWeek - left.validBasketsWeek);

  return ranked.findIndex((entry) => entry.store === "Store #47") + 1;
}

function buildMilestoneState(metrics) {
  const unlocked = [];
  const locked = [];

  REWARD_MILESTONES.forEach((milestone) => {
    const currentValue = metrics[milestone.metric];
    const isUnlocked = currentValue >= milestone.target;

    if (isUnlocked) {
      unlocked.push({
        ...milestone,
        currentValue,
      });
      return;
    }

    locked.push({
      ...milestone,
      currentValue,
      remaining: Math.max(0, milestone.target - currentValue),
      progressPercent: clamp(Math.round((currentValue / milestone.target) * 100), 0, 100),
    });
  });

  return { unlocked, locked };
}

function buildRewardHistory(unlockedMilestones) {
  return unlockedMilestones
    .filter((milestone) => milestone.type === "discount" || milestone.type === "points")
    .map((milestone) => ({
      id: milestone.id,
      title: milestone.title,
      description: milestone.description,
    }));
}

export function createRewardsSnapshot(baskets, storeName) {
  const storeBaskets = baskets
    .filter((basket) => basket.store_name === storeName)
    .sort((left, right) => toDate(right.created_at) - toDate(left.created_at));
  const totalBasketPoints = storeBaskets.reduce(
    (sum, basket) => sum + (basket.points_awarded || 0),
    0
  );
  const qualityValues = storeBaskets
    .map((basket) => basket.quality_score)
    .filter((score) => typeof score === "number");
  const averageQuality = qualityValues.length
    ? Math.round(
        qualityValues.reduce((sum, score) => sum + score, 0) / qualityValues.length
      )
    : DEMO_REWARD_BASELINE.dataQualityScore;
  const now = new Date();
  const dailyStats = buildDailyStats(storeBaskets, now);
  const weeklyStats = buildWeeklyStats(storeBaskets, now);
  const streakDays = buildStreakDays(storeBaskets, DEMO_REWARD_BASELINE.streakDays, now);
  const metrics = {
    validBasketsToday:
      dailyStats.validBasketsToday + DEMO_REWARD_BASELINE.validBasketsToday,
    cciBasketsToday:
      dailyStats.cciBasketsToday + DEMO_REWARD_BASELINE.cciBasketsToday,
    dailyPoints:
      dailyStats.dailyPoints + DEMO_REWARD_BASELINE.dailyPoints,
    validBasketsWeek:
      weeklyStats.validBasketsWeek + DEMO_REWARD_BASELINE.validBasketsWeek,
    streakDays,
    dataQualityScore: averageQuality,
  };
  const milestoneState = buildMilestoneState(metrics);
  const bonusPoints = milestoneState.unlocked.reduce(
    (sum, milestone) => sum + (milestone.points || 0),
    0
  );
  const totalPoints =
    totalBasketPoints + bonusPoints + DEMO_REWARD_BASELINE.totalPoints;
  const nextReward =
    [...milestoneState.locked].sort((left, right) => {
      if (left.remaining !== right.remaining) {
        return left.remaining - right.remaining;
      }

      return right.target - left.target;
    })[0] || null;
  const nextRewardMessage = nextReward
    ? `Need ${nextReward.remaining} more ${nextReward.metric === "cciBasketsToday" ? "CCI basket" : nextReward.metric === "validBasketsWeek" ? "valid baskets this week" : nextReward.metric === "validBasketsToday" ? "valid basket today" : nextReward.metric === "streakDays" ? "streak day" : "quality points"} to unlock ${nextReward.title}.`
    : "All currently configured rewards are unlocked.";
  const progressTarget = nextReward?.target || 1;
  const progressValue = nextReward ? nextReward.currentValue : progressTarget;
  const districtRank = buildDistrictRank(metrics.validBasketsWeek);
  const activeDiscount = [...milestoneState.unlocked]
    .reverse()
    .find((milestone) => milestone.type === "discount");

  return {
    totalPoints,
    dailyPoints: metrics.dailyPoints,
    streakDays: metrics.streakDays,
    validBasketsToday: metrics.validBasketsToday,
    cciBasketsToday: metrics.cciBasketsToday,
    dataQualityScore: metrics.dataQualityScore,
    currentRank: districtRank,
    unlockedRewards: milestoneState.unlocked,
    nextReward,
    nextRewardMessage,
    progressValue,
    progressTarget,
    progressPercent: clamp(Math.round((progressValue / progressTarget) * 100), 0, 100),
    activeDiscount,
    unlockedBadges: milestoneState.unlocked.filter((milestone) => milestone.type === "badge"),
    rewardHistory: buildRewardHistory(milestoneState.unlocked),
  };
}
