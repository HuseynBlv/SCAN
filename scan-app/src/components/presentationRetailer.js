export const PRESENTATION_USERNAME = 'scan-showcase'
export const PRESENTATION_PASSWORD = 'Showcase2026!'

const PERIOD_DAYS = {
  LAST_7_DAYS: 7,
  LAST_30_DAYS: 30,
  LAST_90_DAYS: 90,
  ALL_TIME: 180,
}

const PRODUCTS = [
  ['Coca-Cola Zero 330ml', 'Beverages', 512, 638, 1276],
  ['Coca-Cola 500ml', 'Beverages', 468, 571, 1313],
  ['Fanta Orange 500ml', 'Beverages', 354, 406, 934],
  ['Sprite 500ml', 'Beverages', 319, 372, 856],
  ['Bonaqua Still 500ml', 'Water', 287, 429, 515],
  ['Cappy Pulpy Orange 500ml', 'Juice', 204, 235, 682],
  ['Fuse Tea Peach 500ml', 'Iced tea', 188, 217, 564],
  ['Doritos Nacho 90g', 'Snacks', 175, 193, 675],
]

function isoDay(date) {
  return date.toISOString().slice(0, 10)
}

function dailySales(days) {
  const visibleDays = Math.min(days, 30)
  return Array.from({ length: visibleDays }, (_, index) => {
    const date = new Date()
    date.setUTCHours(0, 0, 0, 0)
    date.setUTCDate(date.getUTCDate() - (visibleDays - index - 1))
    const weekendLift = [0, 6].includes(date.getUTCDay()) ? 310 : 0
    const momentum = index * 13
    const rhythm = [90, -35, 45, 120, -10, 70, 155][index % 7]
    const totalSales = 1980 + weekendLift + momentum + rhythm
    return { date: isoDay(date), basketCount: Math.round(totalSales / 24.7), totalSales }
  })
}

export function isPresentationCredentials({ username, password }) {
  return username.trim().toLowerCase() === PRESENTATION_USERNAME && password === PRESENTATION_PASSWORD
}

export function presentationOverview(period = 'LAST_30_DAYS') {
  const days = PERIOD_DAYS[period] || 30
  const scale = days / 30
  const sales = Math.round(68420 * scale)
  const baskets = Math.round(2768 * scale)
  const refreshedAt = new Date()
  refreshedAt.setHours(8, 36, 0, 0)
  const now = refreshedAt.toISOString()
  const periodStart = new Date(Date.now() - days * 86400000).toISOString()
  const previousImport = new Date(refreshedAt.getTime() - 86400000).toISOString()
  const olderImport = new Date(refreshedAt.getTime() - (2 * 86400000)).toISOString()

  const trend = dailySales(days)
  const homeMovement = trend.slice(-14).map((day, index) => ({
    ...day,
    baseline: Math.round(day.totalSales * (.94 + ((index % 3) * .018))),
    event: index === 5 ? 'Cooler replenished' : index === 10 ? 'Weekend opportunity updated' : null,
  }))

  return {
    generatedAt: now,
    period,
    periodStart,
    retailerCode: 'PRESENTATION',
    retailerName: 'Nərgiz Market · Nizami',
    totalBaskets: baskets,
    totalSales: sales,
    averageBasketValue: sales / baskets,
    totalItems: Math.round(11264 * scale),
    productsPerBasket: 4.07,
    cciBaskets: Math.round(1356 * scale),
    cciPenetrationPercentage: 49,
    currency: 'AZN',
    mappedLinePercentage: 97.4,
    topProducts: PRODUCTS.map(([name, category, basketCount, quantity, revenue]) => ({
      name,
      category,
      basketCount: Math.max(1, Math.round(basketCount * scale)),
      quantity: Math.max(1, Math.round(quantity * scale)),
      revenue: Math.max(1, Math.round(revenue * scale)),
    })),
    topCategories: [
      { category: 'Beverages', basketCount: Math.round(1438 * scale), quantity: Math.round(2812 * scale), revenue: Math.round(6239 * scale) },
      { category: 'Snacks', basketCount: Math.round(792 * scale), quantity: Math.round(1061 * scale), revenue: Math.round(3478 * scale) },
      { category: 'Dairy', basketCount: Math.round(641 * scale), quantity: Math.round(918 * scale), revenue: Math.round(4156 * scale) },
    ],
    dayparts: [
      { segment: 'MORNING', basketCount: Math.round(baskets * .19), sharePercentage: 19 },
      { segment: 'AFTERNOON', basketCount: Math.round(baskets * .34), sharePercentage: 34 },
      { segment: 'EVENING', basketCount: Math.round(baskets * .47), sharePercentage: 47 },
    ],
    weekdayWeekend: [
      { segment: 'WEEKDAY', basketCount: Math.round(baskets * .69), sharePercentage: 69 },
      { segment: 'WEEKEND', basketCount: Math.round(baskets * .31), sharePercentage: 31 },
    ],
    stores: [{ storeId: 'NIZAMI-01', basketCount: baskets, cciBasketCount: Math.round(baskets * .49), totalSales: sales, averageBasketValue: sales / baskets }],
    dailySales: trend,
    home: {
      todaySales: 2847,
      salesChange: 12.4,
      todayTransactions: 312,
      transactionChange: 8.1,
      todayAverageBasket: 9.12,
      averageBasketChange: 5.3,
      salesTrend: [2210, 2360, 2290, 2515, 2640, 2475, 2720, 2847],
      transactionTrend: [268, 281, 274, 293, 301, 289, 306, 312],
      averageBasketTrend: [8.24, 8.39, 8.36, 8.58, 8.77, 8.56, 8.89, 9.12],
      attentionCount: 1,
      operatingItems: 4,
      detectedChanges: [
        { title: 'Coca-Cola Zero velocity', metric: '+23%', explanation: 'Sales velocity is above the four-week baseline.', target: 'actions' },
        { title: 'Doritos attachment', metric: '31% → 24%', explanation: 'Fewer Coca-Cola baskets include Doritos today.', target: 'opportunities' },
        { title: 'Evening basket value', metric: '+8.4%', explanation: 'Baskets after 18:00 are outperforming the daily average.', target: 'insights' },
      ],
      activity: [
        { time: '23:33', title: 'POS data processed', detail: '312 receipts validated' },
        { time: '23:34', title: '3 insights updated', detail: 'Store intelligence refreshed' },
        { time: '23:34', title: 'Stock velocity warning created', detail: 'Coca-Cola Zero 330ml' },
        { time: '23:35', title: 'Weekend opportunity updated', detail: 'Coca-Cola + Doritos' },
      ],
      salesMovement: homeMovement,
    },
    dataWorkspace: {
      receipts: 2768,
      productRecognition: 97.4,
      mappedProducts: 413,
      health: 'Healthy',
      healthItems: [
        { label: 'Duplicate receipts', value: 0, tone: 'positive' },
        { label: 'Missing barcodes', value: 11, tone: 'warning' },
        { label: 'Unknown products', value: 7, tone: 'warning' },
        { label: 'Invalid rows', value: 2, tone: 'red' },
      ],
      recentImports: [
        { date: now, receipts: 946, lines: 1832, mapped: 97.4, status: 'COMPLETED' },
        { date: previousImport, receipts: 918, lines: 1764, mapped: 97.1, status: 'COMPLETED' },
        { date: olderImport, receipts: 904, lines: 1718, mapped: 96.8, status: 'COMPLETED' },
      ],
      recognitionGroups: [
        { label: 'CCI products', value: 100, tone: 'red' },
        { label: 'Local products', value: 94, tone: 'dark' },
        { label: 'Unknown', value: 6, tone: 'neutral' },
      ],
      unmappedProducts: [
        { code: 'LOCAL-4831', name: 'Ayran 200ml' },
        { code: 'LOCAL-2904', name: 'Fresh lavash' },
        { code: 'UNKNOWN-771', name: 'Snack mix 80g' },
      ],
    },
    insights: [
      { fact: 'Zero-sugar beverages grew 18% versus the previous period.', interpretation: 'Demand is shifting toward low-sugar choices.', recommendedAction: 'Keep cold availability high before the evening peak.' },
      { fact: 'Weekend baskets are 12% larger than weekday baskets.', interpretation: 'Shoppers add more snacks and drinks on Friday through Sunday.', recommendedAction: 'Build a weekend bundle near the checkout.' },
    ],
    sync: {
      state: 'COMPLETED',
      filename: 'nargiz-nizami-live-feed.csv',
      importedReceipts: baskets,
      importedLines: Math.round(baskets * 4.07),
      unresolvedProducts: 0,
      errors: [],
      receivedAt: now,
      completedAt: now,
    },
    lifetimeTransactionsProcessed: 184392,
  }
}

export function presentationEngagement() {
  const now = new Date()
  const expires = new Date(now.getTime() + 12 * 86400000).toISOString()
  const completedAt = new Date(now.getTime() - 4 * 86400000).toISOString()
  const generatedAt = now.toISOString()
  return {
    offers: {
      generatedAt,
      available: [
        {
          offerKey: 'SHOWCASE-ZERO-330', offerType: 'VOLUME_DISCOUNT', title: 'Coca-Cola Zero growth offer', productName: 'Coca-Cola Zero 330ml', category: 'Beverages',
          reason: 'Sales increased 18% and evening availability is driving repeat purchases.',
          whyReasons: ['638 units sold in the last 30 days.', 'Zero-sugar beverages now appear in 1 of every 5 CCI baskets.', 'Demand peaks between 18:00 and 21:00.'],
          metricLabel: 'Growth vs previous 30 days', metricValue: '+18%', normalCondition: 'Order 5 cases', partnerCondition: '12% campaign discount', estimatedBenefitAzn: 48.6, benefitSummary: 'Estimated benefit: ₼48.60', expiresAt: expires, status: 'AVAILABLE',
        },
        {
          offerKey: 'SHOWCASE-WEEKEND-BUNDLE', offerType: 'WEEKEND_ACTIVATION', title: 'Weekend refreshment bundle', productName: 'Coca-Cola + Doritos', category: 'Basket growth',
          reason: 'Weekend baskets are 12% larger when beverages and snacks are purchased together.',
          affinityValue: '2.3×', jointPurchaseRate: '38%', fitBaskets: 184, recommendation: 'Test weekend checkout placement.',
          whyReasons: ['Beverages and snacks appeared together in 284 baskets.', 'Friday evening is the strongest conversion window.'],
          metricLabel: 'Expected basket lift', metricValue: '+12%', normalCondition: 'Run Friday–Sunday', partnerCondition: 'Free display materials', estimatedBenefitAzn: 72, benefitSummary: 'Estimated benefit: ₼72.00', expiresAt: expires, status: 'AVAILABLE',
        },
        {
          offerKey: 'SHOWCASE-BONAQUA-BONUS', offerType: 'BONUS_PRODUCT', title: 'Bonaqua volume reward', productName: 'Bonaqua Still 500ml', category: 'Water',
          reason: 'Water velocity is consistently high, with the strongest demand around lunch.',
          whyReasons: ['429 units sold in the last 30 days.', 'Sales were recorded on 29 of 30 days.'],
          metricLabel: 'Units sold', metricValue: '429', normalCondition: 'Order 6 cases', partnerCondition: '1 bonus case', estimatedBenefitAzn: 31.2, benefitSummary: 'Bonus value: ₼31.20', expiresAt: expires, status: 'AVAILABLE',
        },
      ],
      active: [],
      completed: [{
        offerKey: 'SHOWCASE-FANTA-COMPLETED', offerType: 'WEEKEND_ACTIVATION', title: 'Fanta display activation', productName: 'Fanta Orange 500ml', category: 'Beverages',
        reason: 'The checkout display completed its measurement window.', whyReasons: ['Attachment improved throughout the four-day activation.'],
        metricLabel: 'Attachment gain', metricValue: '+5 pts', normalCondition: 'Completed', partnerCondition: 'Display materials supplied', estimatedBenefitAzn: 38.4, benefitSummary: 'Measured value: ₼38.40', expiresAt: completedAt, status: 'COMPLETED',
      }],
    },
    actions: [
      { id: 'showcase-stock', status: 'OPEN', priority: 'HIGH', type: 'STOCK_RISK', scope: 'CCI', title: 'Coca-Cola Zero may sell out before Friday evening', displayTitle: 'Coca-Cola Zero velocity is unusually high', explanation: 'Current sales velocity is 23% above the four-week baseline and demand peaks before the weekend.', evidence: 'Demand is accelerating ahead of the Friday evening peak.', why: 'Velocity has stayed above its four-week baseline for three consecutive trading days.', recommendation: 'Check availability before Friday evening.', metricLabel: 'Recent sales velocity', metricValue: '21.3 units/day', change: '+23%', comparison: 'vs 4-week baseline', primaryAction: 'Add to order list', secondaryAction: 'Mark checked', trend: [14.8, 15.4, 16.1, 17.6, 18.2, 19.7, 21.3] },
      { id: 'showcase-basket', status: 'OPEN', priority: 'MEDIUM', type: 'BASKET_OPPORTUNITY', scope: 'STORE', title: 'A checkout bundle could grow weekend baskets', displayTitle: 'Coca-Cola + Doritos', explanation: 'Coca-Cola and Doritos are already purchased together frequently, but only 38% of qualifying baskets include both.', evidence: '184 high-fit baskets purchased Coca-Cola without Doritos.', why: 'These products show 2.3× affinity, while current attachment still leaves a meaningful number of high-fit baskets unconverted.', recommendation: 'Test weekend checkout placement.', metricLabel: 'Basket affinity', metricValue: '2.3× affinity', primaryAction: 'Create opportunity', secondaryAction: 'Dismiss', trend: [19, 21, 20, 24, 25, 27, 31] },
      { id: 'showcase-performance', status: 'OPEN', priority: 'MEDIUM', type: 'PERFORMANCE', scope: 'STORE', title: 'Evening execution is outperforming the network', explanation: 'This store converts more beverage baskets between 18:00 and 21:00 than similar connected stores.', recommendation: 'Keep the current cooler plan and protect availability during the evening handover.', metricLabel: 'Network advantage', metricValue: '+8.4 pts', primaryAction: 'Keep monitoring', secondaryAction: 'Dismiss', trend: [2.1, 3.8, 4.2, 5.6, 6.9, 7.7, 8.4] },
      { id: 'showcase-display-progress', status: 'IN_PROGRESS', priority: 'MEDIUM', type: 'OPPORTUNITY', scope: 'STORE', title: 'Weekend checkout placement test', explanation: 'The placement test started this morning and will run through Sunday.', recommendation: 'Keep the display in place until the measurement window closes.', metricLabel: 'Current attachment', metricValue: '26%', primaryAction: 'View progress', secondaryAction: 'Mark checked', trend: [22, 23, 23, 24, 25, 26] },
      { id: 'showcase-cooler-progress', status: 'IN_PROGRESS', priority: 'HIGH', type: 'STOCK_RISK', scope: 'CCI', title: 'Evening cooler availability check', explanation: 'A shelf and cooler check is awaiting confirmation from the evening shift.', recommendation: 'Confirm availability before 17:00.', metricLabel: 'Units on hand', metricValue: '18 units', primaryAction: 'Open check', secondaryAction: 'Mark checked', trend: [28, 26, 25, 23, 20, 18] },
      { id: 'showcase-placement-completed', status: 'COMPLETED', priority: 'MEDIUM', type: 'PERFORMANCE', scope: 'STORE', title: 'Doritos checkout placement completed', explanation: 'The weekend placement test completed and attachment increased from 22% to 28%.', evidence: 'The measured attachment gain held through the full observation window.', recommendation: 'Keep the current placement and review again next month.', metricLabel: 'Attachment gain', metricValue: '+6 pts', trend: [22, 23, 24, 26, 27, 28] },
      { id: 'showcase-water-dismissed', status: 'DISMISSED', priority: 'LOW', type: 'OPPORTUNITY', scope: 'STORE', title: 'Bonaqua lunch display prompt', explanation: 'The suggested lunch display was dismissed after the store confirmed there was no available placement space.', recommendation: 'Revisit when the checkout layout changes.', metricLabel: 'Potential lift', metricValue: '+4%', trend: [3, 4, 4, 5, 4, 4] },
    ],
    actionWorkspace: {
      counts: { open: 3, inProgress: 2, completed: 8, dismissed: 1, highPriority: 2 },
      recentResult: { title: 'Doritos checkout placement', before: '22%', after: '28%', change: '+6 pts attachment', detail: 'Observed after action' },
      activity: [
        { date: '12 Oct', title: 'Offer activated' },
        { date: '11 Oct', title: 'Availability checked' },
        { date: '8 Oct', title: 'Placement completed' },
      ],
    },
    partnerStatus: {
      level: 'GOLD', progressPercentage: 84, nextLevel: 'PLATINUM', daysUntilNextLevel: 12,
      requirements: [{ label: 'Store connected', met: true }, { label: '90+ days active', met: true }, { label: 'Reliable POS data', met: true }, { label: 'Activate two more offers', met: false }],
      daysConnected: 126, dataReliabilityPercent: 99.8, transactionSyncActive: true, dataCompletenessLabel: 'Excellent',
      benefits: { thisMonth: 186.4, lastMonth: 142.8, lifetime: 1247.6 },
      benefitHistory: [
        { activatedAt: new Date(now.getTime() - 4 * 86400000).toISOString(), title: 'Fanta display activation', benefitSummary: 'Saved ₼38.40', estimatedBenefitAzn: 38.4 },
        { activatedAt: new Date(now.getTime() - 11 * 86400000).toISOString(), title: 'Coca-Cola volume offer', benefitSummary: 'Saved ₼64.00', estimatedBenefitAzn: 64 },
        { activatedAt: new Date(now.getTime() - 19 * 86400000).toISOString(), title: 'Fuse Tea trial campaign', benefitSummary: 'Bonus value ₼28.80', estimatedBenefitAzn: 28.8 },
      ],
    },
  }
}

export function presentationOpportunities() {
  const analyzedAt = new Date().toISOString()
  const evidence = (supportingBasketCount, observation, whyItMatters, limitations = null) => ({
    receiptCount: 2768, supportingBasketCount, dateFrom: new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
    dateTo: analyzedAt.slice(0, 10), dataCompletenessPercentage: 97.4, observation, whyItMatters, limitations,
  })
  const base = { storeId: 'NIZAMI-01', priority: 'MEDIUM', status: 'DETECTED', trial: null, detectedAt: analyzedAt, updatedAt: analyzedAt }
  return {
    summary: { analyzedAt, latestImportAt: analyzedAt, datasetKind: 'PRESENTATION', coverageStatus: 'READY', receiptCount: 2768, mappingCoveragePercentage: 97.4, availableCount: 3, activeTrialCount: 0, completedTrialCount: 1 },
    opportunities: [
      { ...base, id: 'presentation-pair', type: 'CROSS_SELL', title: 'Coca-Cola Zero 330ml + Doritos Nacho 90g', description: 'A recurring product relationship is strong enough to test in-store.', subjects: ['Coca-Cola Zero 330ml', 'Doritos Nacho 90g'], primaryMetricLabel: 'Lift', primaryMetricValue: '2.3×', metrics: { supportPercentage: 10.3, confidencePercentage: 55.5, lift: 2.3, productABaskets: 512, productBBaskets: 175, jointBaskets: 284 }, evidence: evidence(284, 'These products appeared together in 284 of 2,768 synthetic presentation baskets.', 'A lift of 2.3 means the pair occurred 2.3 times as often as expected if purchases were independent.'), recommendedAction: { title: 'Start placement trial', description: 'Test placing the products closer together while SCAN compares the trial window with an equally long baseline.', durationDays: 7 } },
      { ...base, id: 'presentation-attachment', type: 'BEVERAGE_ATTACHMENT', title: 'Sandwiches beverage attachment', description: 'Beverages appear less often in these baskets than in the store overall.', subjects: ['Sandwiches'], primaryMetricLabel: 'Beverage attachment', primaryMetricValue: '18.4%', metrics: { attachmentPercentage: 18.4, storeBeveragePercentage: 49, categoryBaskets: 304, attachedBaskets: 56 }, evidence: evidence(56, '56 of 304 sandwich baskets included a beverage.', 'The observed attachment rate is 18.4% versus 49.0% across all synthetic store baskets.', 'This is a placement hypothesis, not evidence of lost sales.'), recommendedAction: { title: 'Start attachment trial', description: 'Test a simple beverage prompt or adjacent placement for seven days.', durationDays: 7 } },
      { ...base, id: 'presentation-time', type: 'TIME_PATTERN', title: 'Evening beverage-and-snack window', description: 'Beverage-and-snack baskets are concentrated in one observed daypart.', subjects: ['Beverages', 'Snacks'], primaryMetricLabel: 'Peak-window share', primaryMetricValue: '47.0%', metrics: { peakSharePercentage: 47, supportingBaskets: 216, pairedBaskets: 459 }, evidence: evidence(216, '216 of 459 beverage-and-snack baskets occurred during evening.', 'This concentration identifies when execution matters most; it does not predict incremental sales.'), recommendedAction: { title: 'Plan peak-window check', description: 'Check availability and display execution before the observed peak window.', durationDays: 7 } },
    ],
  }
}
