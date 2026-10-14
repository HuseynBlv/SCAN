export const CCI_PRESENTATION_USERNAME = 'scan-showcase-cci'
export const CCI_PRESENTATION_PASSWORD = 'Showcase2026!'

const STORES = [
  ['Nərgiz Market · Nizami', 'NARGIZ', 34.8, 3.4, 418, 1201, 'IMPROVING'],
  ['Bravo · Gənclik', 'BRAVO', 32.1, 1.8, 386, 1203, 'IMPROVING'],
  ['Rahat · 28 May', 'RAHAT', 29.6, -2.7, 331, 1118, 'NEEDS_ATTENTION'],
  ['Araz · Elmlər', 'ARAZ', 28.9, 0.6, 309, 1069, 'STABLE'],
  ['Neptun · Xətai', 'NEPTUN', 27.4, 1.1, 274, 1000, 'STABLE'],
  ['Bazarstore · Yasamal', 'BAZAR', 24.7, -3.2, 231, 935, 'NEEDS_ATTENTION'],
]

const PRODUCTS = [
  ['Coca-Cola Zero 330ml', 'Sparkling', 638, 519, 22.9],
  ['Coca-Cola 500ml', 'Sparkling', 571, 536, 6.5],
  ['Bonaqua Still 500ml', 'Water', 429, 382, 12.3],
  ['Fanta Orange 500ml', 'Sparkling', 406, 438, -7.3],
  ['Sprite 500ml', 'Sparkling', 372, 401, -7.2],
  ['Cappy Pulpy Orange 500ml', 'Juice', 235, 204, 15.2],
  ['Fuse Tea Peach 500ml', 'Iced tea', 217, 196, 10.7],
]

function isoDate(daysAgo = 0) {
  const date = new Date()
  date.setHours(8, 36, 0, 0)
  date.setDate(date.getDate() - daysAgo)
  return date.toISOString()
}

export function isCciPresentationCredentials({ username = '', password = '' }) {
  return username.trim().toLowerCase() === CCI_PRESENTATION_USERNAME && password === CCI_PRESENTATION_PASSWORD
}

export function presentationCciData() {
  return {
    generatedAt: isoDate(), retailerCode: 'NARGIZ', retailerName: 'Nərgiz Market · Nizami',
    totalBaskets: 6526, cciBaskets: 1949, cciPenetrationPercentage: 29.9,
    averageBasketValue: 12.84, currency: 'AZN', mappedLinePercentage: 97.4,
    topCompanionProducts: [], topCompanionCategories: [], dayparts: [], weekdayWeekend: [],
    cciSkuPerformance: PRODUCTS.map(([product, category, basketCount]) => ({ product, category, basketCount, quantity: Math.round(basketCount * 1.14), revenue: Math.round(basketCount * 2.25) })),
    stores: STORES.map(([storeId, retailerCode, , , cciBasketCount, basketCount]) => ({ storeId, retailerCode, basketCount, cciBasketCount })),
    insights: [
      { fact: 'Coca-Cola Zero velocity is 23% above baseline.', interpretation: 'Most of the lift is concentrated between 18:00 and 21:00.', recommendedAction: 'Protect cold availability before Friday evening.' },
      { fact: 'Doritos attachment fell from 31% to 24%.', interpretation: 'The decline is concentrated in Coca-Cola baskets.', recommendedAction: 'Test checkout placement over the weekend.' },
    ],
  }
}

function networkStores() {
  return STORES.map(([externalStoreId, retailerCode, recentPenetrationPct, penetrationPointChange, recentCciBaskets, recentBaskets, status]) => ({
    externalStoreId, retailerCode, recentPenetrationPct, penetrationPointChange,
    recentCciBaskets, recentBaskets, status,
  }))
}

function productMovers() {
  return PRODUCTS.map(([productName, category, recentBaskets, priorBaskets, basketChangePct]) => ({ productName, category, recentBaskets, priorBaskets, basketChangePct }))
}

export function presentationCciNetwork(periodDays = 30) {
  const factor = periodDays / 30
  const stores = networkStores().map((store) => ({ ...store, recentCciBaskets: Math.round(store.recentCciBaskets * factor), recentBaskets: Math.round(store.recentBaskets * factor) }))
  const products = productMovers().map((product) => ({ ...product, recentBaskets: Math.round(product.recentBaskets * factor), priorBaskets: Math.round(product.priorBaskets * factor) }))
  const totalBaskets = stores.reduce((sum, store) => sum + store.recentBaskets, 0)
  const cciBaskets = stores.reduce((sum, store) => sum + store.recentCciBaskets, 0)
  const days = Math.min(periodDays, 30)
  return {
    overview: { periodDays, storesReporting: stores.length, totalBaskets, cciBaskets, cciPenetrationPct: 29.9, priorCciPenetrationPct: 27.8, penetrationPointChange: 2.1, dataCoveragePct: 97.4, generatedAt: isoDate() },
    stores,
    products,
    categories: [
      { category: 'Zero sugar sparkling', recentBaskets: Math.round(812 * factor), priorBaskets: Math.round(674 * factor), basketChangePct: 20.5 },
      { category: 'Water', recentBaskets: Math.round(603 * factor), priorBaskets: Math.round(545 * factor), basketChangePct: 10.6 },
      { category: 'Juice', recentBaskets: Math.round(391 * factor), priorBaskets: Math.round(368 * factor), basketChangePct: 6.3 },
      { category: 'Regular sparkling', recentBaskets: Math.round(1142 * factor), priorBaskets: Math.round(1195 * factor), basketChangePct: -4.4 },
    ],
    brief: [
      { type: 'IMPORTANT', title: 'Zero velocity is outpacing availability', description: 'Coca-Cola Zero is up 23%, led by evening demand in Nizami and Gənclik.', actionType: 'PRODUCT', actionTarget: 'Coca-Cola Zero 330ml', actionLabel: 'Investigate product' },
      { type: 'OPPORTUNITY', title: 'Weekend baskets have an attachment gap', description: '184 high-fit Coca-Cola baskets did not include Doritos despite 2.3× product affinity.', actionType: 'PRODUCT', actionTarget: 'Coca-Cola 500ml', actionLabel: 'Review basket evidence' },
      { type: 'IMPORTANT', title: 'Two stores need attention', description: 'Rahat · 28 May and Bazarstore · Yasamal declined by more than 2.5 penetration points.', actionType: 'STORES', actionLabel: 'Review stores' },
    ],
    trend: Array.from({ length: days }, (_, index) => ({
      date: isoDate(days - index - 1).slice(0, 10),
      totalBaskets: Math.round(190 + index * 1.8 + [8, -4, 5, 12, -2, 18, 24][index % 7]),
      cciBaskets: Math.round(51 + index * .9 + [2, -1, 3, 4, 0, 6, 8][index % 7]),
      cciPenetrationPct: Number((27.2 + index * .09 + [0.2, -0.3, 0.1, 0.4][index % 4]).toFixed(1)),
    })),
  }
}

export function presentationCciStoreDetail({ retailerCode, externalStoreId }, periodDays = 30) {
  const stores = networkStores()
  const store = stores.find((item) => item.retailerCode === retailerCode && item.externalStoreId === externalStoreId) || stores[0]
  const products = productMovers()
  return {
    ...store, storeName: store.externalStoreId, dataCoveragePct: 97.4,
    topProducts: products.slice(0, 5).map((product) => ({ product: product.productName, basketCount: Math.round(product.recentBaskets / 5), quantity: Math.round(product.recentBaskets / 4.4) })),
    biggestChanges: products.slice(0, 5),
    topCompanionCategories: [{ label: 'Salty snacks', basketCount: 184 }, { label: 'Bakery', basketCount: 132 }, { label: 'Ready meals', basketCount: 96 }],
    similarStores: stores.filter((item) => item.externalStoreId !== store.externalStoreId).slice(0, 3),
    periodDays,
  }
}

export function presentationCciProductDetail(productName, periodDays = 30) {
  const products = productMovers()
  const product = products.find((item) => item.productName === productName) || products[0]
  return {
    product: product.productName, category: product.category, brand: 'The Coca-Cola Company',
    recentBaskets: product.recentBaskets, priorBaskets: product.priorBaskets, basketChangePct: product.basketChangePct,
    strongestDaypart: 'EVENING', strongestDaypartSharePct: 42.8,
    storeDistribution: networkStores().slice(0, 5).map((store, index) => ({ ...store, recentBaskets: Math.max(34, Math.round(product.recentBaskets / (index + 2))), priorBaskets: Math.max(30, Math.round(product.priorBaskets / (index + 2))), basketChangePct: product.basketChangePct - index * 1.4 })),
    companionProducts: [{ label: 'Doritos Nacho 90g', basketCount: 184 }, { label: 'Lay’s Classic 90g', basketCount: 143 }, { label: 'Fresh sandwich', basketCount: 91 }],
    companionCategories: [{ label: 'Salty snacks', basketCount: 327 }, { label: 'Bakery', basketCount: 168 }, { label: 'Ready meals', basketCount: 104 }],
    periodDays,
  }
}

export function presentationCciIntelligence() {
  return {
    investigations: [], fieldTasks: [], activations: [],
    movers: productMovers().slice(0, 5),
    watchlist: [{ id: 'watch-zero', productName: 'Coca-Cola Zero 330ml', createdAt: isoDate(8) }],
    watchlistChanges: [{ productName: 'Coca-Cola Zero 330ml', recentBaskets: 638, priorBaskets: 519, basketChangePct: 22.9 }],
  }
}

export function presentationCciAnswer(subjectName = 'the connected retail network') {
  return {
    confidence: 'HIGH',
    whatScanFound: `${subjectName} has a material evening demand signal.`,
    whyThisMatters: 'The change is large enough to affect availability and weekend execution.',
    possibleExplanations: ['Demand increased most between 18:00 and 21:00.', 'The lift is concentrated in the two highest-volume stores.'],
    evidence: ['Velocity is 23% above the four-week baseline.', 'The signal has persisted for three trading days.'],
    whatWeStillDontKnow: 'Shelf and cooler availability still needs a field check.',
    priorCases: [],
    nextSteps: [{ label: 'Check availability' }, { label: 'Review store distribution' }],
  }
}

export function presentationCciMeetingBrief(template) {
  return {
    template, periodDays: 7,
    networkSummary: 'CCI penetration reached 29.9%, up 2.1 points, across six reporting stores.',
    issuesRequiringDecision: ['Protect Coca-Cola Zero availability before Friday evening.', 'Review the two stores with declining penetration.'],
    fieldExecution: ['Nizami availability check is ready for assignment.', 'Weekend checkout placement is ready to activate.'],
    completedActions: ['Doritos checkout placement improved attachment by 6 points.'],
    risks: ['Fanta Orange and Sprite basket presence declined by more than 7%.'],
    topOpportunities: ['Zero-sugar sparkling grew 20.5%.', 'Coca-Cola and Doritos show 2.3× affinity.'],
    limitations: 'Presentation data is synthetic and designed to demonstrate the complete CCI workflow.',
  }
}
