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
  const now = new Date().toISOString()
  const periodStart = new Date(Date.now() - days * 86400000).toISOString()

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
    mappedLinePercentage: 99.8,
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
    dailySales: dailySales(days),
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
          offerKey: 'SHOWCASE-WEEKEND-BUNDLE', offerType: 'WEEKEND_ACTIVATION', title: 'Weekend refreshment bundle', productName: 'Coca-Cola + Doritos bundle', category: 'Basket growth',
          reason: 'Weekend baskets are 12% larger when beverages and snacks are purchased together.',
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
      completed: [],
    },
    actions: [
      { id: 'showcase-stock', type: 'STOCK_RISK', scope: 'CCI', title: 'Coca-Cola Zero may sell out before Friday evening', explanation: 'Current sales velocity is 23% above the four-week baseline and demand peaks before the weekend.', recommendation: 'Add two cases to the next order and check cooler availability by 17:00 Friday.', metricLabel: 'Recent sales velocity', metricValue: '21.3 units/day' },
      { id: 'showcase-basket', type: 'OPPORTUNITY', scope: 'STORE', title: 'A checkout bundle could grow weekend baskets', explanation: 'Coca-Cola and Doritos are already purchased together frequently, but only 38% of qualifying baskets include both.', recommendation: 'Place a weekend bundle message at the checkout and track conversion for two weeks.', metricLabel: 'Estimated basket lift', metricValue: '+12%' },
      { id: 'showcase-performance', type: 'PERFORMANCE', scope: 'STORE', title: 'Evening execution is outperforming the network', explanation: 'This store converts more beverage baskets between 18:00 and 21:00 than similar connected stores.', recommendation: 'Keep the current cooler plan and protect availability during the evening handover.', metricLabel: 'Network advantage', metricValue: '+8.4 pts' },
    ],
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
