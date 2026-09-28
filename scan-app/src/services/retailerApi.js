import {
  ScanApiError,
  apiUrl,
  basicAuthorization,
  errorMessage,
} from './scanApi'

const PERIODS = new Set(['TODAY', 'LAST_7_DAYS', 'LAST_30_DAYS', 'ALL_TIME'])

function invalid(field) {
  throw new ScanApiError(`SCAN API returned an invalid retailer field: ${field}.`)
}

function string(value, field) {
  if (typeof value !== 'string' || !value.trim()) invalid(field)
  return value
}

function nullableString(value, field) {
  if (value == null) return null
  return string(value, field)
}

function number(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) invalid(field)
  return value
}

function count(value, field) {
  const result = number(value, field)
  if (!Number.isSafeInteger(result)) invalid(field)
  return result
}

function percentage(value, field) {
  const result = number(value, field)
  if (result > 100) invalid(field)
  return result
}

function timestamp(value, field, nullable = false) {
  if (nullable && value == null) return null
  const result = string(value, field)
  if (Number.isNaN(Date.parse(result))) invalid(field)
  return result
}

function array(value, field, normalize) {
  if (!Array.isArray(value)) invalid(field)
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) invalid(`${field}[${index}]`)
    return normalize(item, `${field}[${index}]`)
  })
}

function stringArray(value, field) {
  if (!Array.isArray(value)) invalid(field)
  return value.map((item, index) => string(item, `${field}[${index}]`))
}

function normalizeOverview(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ScanApiError('SCAN API returned an unexpected retailer analytics response.')
  }
  if (!PERIODS.has(data.period)) invalid('period')

  const normalized = {
    ...data,
    generatedAt: timestamp(data.generatedAt, 'generatedAt'),
    period: data.period,
    periodStart: timestamp(data.periodStart, 'periodStart', true),
    retailerCode: string(data.retailerCode, 'retailerCode'),
    retailerName: string(data.retailerName, 'retailerName'),
    totalBaskets: count(data.totalBaskets, 'totalBaskets'),
    totalSales: number(data.totalSales, 'totalSales'),
    averageBasketValue: number(data.averageBasketValue, 'averageBasketValue'),
    totalItems: number(data.totalItems, 'totalItems'),
    productsPerBasket: number(data.productsPerBasket, 'productsPerBasket'),
    cciBaskets: count(data.cciBaskets, 'cciBaskets'),
    cciPenetrationPercentage: percentage(data.cciPenetrationPercentage, 'cciPenetrationPercentage'),
    currency: string(data.currency, 'currency'),
    mappedLinePercentage: percentage(data.mappedLinePercentage, 'mappedLinePercentage'),
    topProducts: array(data.topProducts, 'topProducts', (item, field) => ({
      name: string(item.name, `${field}.name`),
      category: string(item.category, `${field}.category`),
      basketCount: count(item.basketCount, `${field}.basketCount`),
      quantity: number(item.quantity, `${field}.quantity`),
      revenue: number(item.revenue, `${field}.revenue`),
    })),
    topCategories: array(data.topCategories, 'topCategories', (item, field) => ({
      category: string(item.category, `${field}.category`),
      basketCount: count(item.basketCount, `${field}.basketCount`),
      quantity: number(item.quantity, `${field}.quantity`),
      revenue: number(item.revenue, `${field}.revenue`),
    })),
    dayparts: array(data.dayparts, 'dayparts', (item, field) => ({
      segment: string(item.segment, `${field}.segment`),
      basketCount: count(item.basketCount, `${field}.basketCount`),
      sharePercentage: percentage(item.sharePercentage, `${field}.sharePercentage`),
    })),
    weekdayWeekend: array(data.weekdayWeekend, 'weekdayWeekend', (item, field) => ({
      segment: string(item.segment, `${field}.segment`),
      basketCount: count(item.basketCount, `${field}.basketCount`),
      sharePercentage: percentage(item.sharePercentage, `${field}.sharePercentage`),
    })),
    stores: array(data.stores, 'stores', (item, field) => ({
      storeId: string(item.storeId, `${field}.storeId`),
      basketCount: count(item.basketCount, `${field}.basketCount`),
      cciBasketCount: count(item.cciBasketCount, `${field}.cciBasketCount`),
      totalSales: number(item.totalSales, `${field}.totalSales`),
      averageBasketValue: number(item.averageBasketValue, `${field}.averageBasketValue`),
    })),
    dailySales: array(data.dailySales, 'dailySales', (item, field) => ({
      date: string(item.date, `${field}.date`),
      basketCount: count(item.basketCount, `${field}.basketCount`),
      totalSales: number(item.totalSales, `${field}.totalSales`),
    })),
    insights: array(data.insights, 'insights', (item, field) => ({
      fact: string(item.fact, `${field}.fact`),
      interpretation: string(item.interpretation, `${field}.interpretation`),
      recommendedAction: string(item.recommendedAction, `${field}.recommendedAction`),
    })),
    lifetimeTransactionsProcessed: count(data.lifetimeTransactionsProcessed, 'lifetimeTransactionsProcessed'),
  }

  if (normalized.cciBaskets > normalized.totalBaskets) invalid('cciBaskets')
  normalized.stores.forEach((store, index) => {
    if (store.cciBasketCount > store.basketCount) invalid(`stores[${index}].cciBasketCount`)
  })

  const sync = data.sync
  if (!sync || typeof sync !== 'object' || Array.isArray(sync)) invalid('sync')
  normalized.sync = {
    state: string(sync.state, 'sync.state'),
    filename: nullableString(sync.filename, 'sync.filename'),
    importedReceipts: count(sync.importedReceipts, 'sync.importedReceipts'),
    importedLines: count(sync.importedLines, 'sync.importedLines'),
    unresolvedProducts: count(sync.unresolvedProducts, 'sync.unresolvedProducts'),
    errors: stringArray(sync.errors, 'sync.errors'),
    receivedAt: timestamp(sync.receivedAt, 'sync.receivedAt', true),
    completedAt: timestamp(sync.completedAt, 'sync.completedAt', true),
  }
  return normalized
}

export async function fetchRetailerOverview({ period, username, password, signal }) {
  let response
  try {
    response = await fetch(
      apiUrl(`/api/v1/retailer/overview?period=${encodeURIComponent(period)}`),
      {
        signal,
        headers: {
          Accept: 'application/json',
          Authorization: basicAuthorization(username, password),
        },
      },
    )
  } catch (error) {
    if (error?.name === 'AbortError' || error instanceof ScanApiError) throw error
    throw new ScanApiError(
      'Cannot reach the SCAN API. A sleeping demo may need a minute before you retry.',
    )
  }

  if (!response.ok) throw new ScanApiError(await errorMessage(response), response.status)

  try {
    return normalizeOverview(await response.json())
  } catch (error) {
    if (error?.name === 'AbortError' || error instanceof ScanApiError) throw error
    throw new ScanApiError('The SCAN API did not return readable retailer analytics.')
  }
}

const OFFER_STATUSES = new Set(['AVAILABLE', 'ACTIVE', 'COMPLETED'])
const ACTION_TYPES = new Set(['URGENT', 'OPPORTUNITY', 'INVENTORY', 'PERFORMANCE'])

function enumValue(value, allowed, field) {
  if (!allowed.has(value)) invalid(field)
  return value
}

function nullableNumber(value, field) {
  if (value == null) return null
  return number(value, field)
}

function normalizeOffer(item, field) {
  return {
    offerKey: string(item.offerKey, `${field}.offerKey`),
    title: string(item.title, `${field}.title`),
    productName: string(item.productName, `${field}.productName`),
    category: nullableString(item.category, `${field}.category`),
    reason: string(item.reason, `${field}.reason`),
    whyReasons: stringArray(item.whyReasons, `${field}.whyReasons`),
    normalCondition: string(item.normalCondition, `${field}.normalCondition`),
    partnerCondition: string(item.partnerCondition, `${field}.partnerCondition`),
    estimatedBenefitAzn: nullableNumber(item.estimatedBenefitAzn, `${field}.estimatedBenefitAzn`),
    benefitSummary: string(item.benefitSummary, `${field}.benefitSummary`),
    expiresAt: timestamp(item.expiresAt, `${field}.expiresAt`),
    status: enumValue(item.status, OFFER_STATUSES, `${field}.status`),
  }
}

function normalizeOffersResponse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ScanApiError('SCAN API returned an unexpected offers response.')
  }
  return {
    generatedAt: timestamp(data.generatedAt, 'generatedAt'),
    available: array(data.available, 'available', normalizeOffer),
    active: array(data.active, 'active', normalizeOffer),
    completed: array(data.completed, 'completed', normalizeOffer),
  }
}

function normalizeAction(item, field) {
  return {
    id: string(item.id, `${field}.id`),
    type: enumValue(item.type, ACTION_TYPES, `${field}.type`),
    title: string(item.title, `${field}.title`),
    explanation: string(item.explanation, `${field}.explanation`),
    recommendation: string(item.recommendation, `${field}.recommendation`),
    metricLabel: string(item.metricLabel, `${field}.metricLabel`),
    metricValue: string(item.metricValue, `${field}.metricValue`),
  }
}

function normalizePartnerStatus(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new ScanApiError('SCAN API returned an unexpected partner status response.')
  }
  return {
    level: string(data.level, 'level'),
    progressPercentage: count(data.progressPercentage, 'progressPercentage'),
    nextLevel: nullableString(data.nextLevel, 'nextLevel'),
    daysUntilNextLevel: data.daysUntilNextLevel == null ? null : count(data.daysUntilNextLevel, 'daysUntilNextLevel'),
    requirements: array(data.requirements, 'requirements', (item, field) => ({
      label: string(item.label, `${field}.label`),
      met: Boolean(item.met),
    })),
    benefits: (() => {
      const benefits = data.benefits
      if (!benefits || typeof benefits !== 'object') invalid('benefits')
      return {
        thisMonth: number(benefits.thisMonth, 'benefits.thisMonth'),
        lastMonth: number(benefits.lastMonth, 'benefits.lastMonth'),
        lifetime: number(benefits.lifetime, 'benefits.lifetime'),
      }
    })(),
    benefitHistory: array(data.benefitHistory, 'benefitHistory', (item, field) => ({
      activatedAt: timestamp(item.activatedAt, `${field}.activatedAt`),
      title: string(item.title, `${field}.title`),
      benefitSummary: string(item.benefitSummary, `${field}.benefitSummary`),
      estimatedBenefitAzn: nullableNumber(item.estimatedBenefitAzn, `${field}.estimatedBenefitAzn`),
    })),
  }
}

async function authorizedRequest(path, { method = 'GET', username, password, signal } = {}) {
  let response
  try {
    response = await fetch(apiUrl(path), {
      method,
      signal,
      headers: {
        Accept: 'application/json',
        Authorization: basicAuthorization(username, password),
      },
    })
  } catch (error) {
    if (error?.name === 'AbortError' || error instanceof ScanApiError) throw error
    throw new ScanApiError('Cannot reach the SCAN API. A sleeping demo may need a minute before you retry.')
  }
  if (!response.ok) throw new ScanApiError(await errorMessage(response), response.status)
  return response.json()
}

export async function fetchRetailerOffers({ username, password, signal }) {
  try {
    return normalizeOffersResponse(await authorizedRequest('/api/v1/retailer/offers', { username, password, signal }))
  } catch (error) {
    if (error?.name === 'AbortError' || error instanceof ScanApiError) throw error
    throw new ScanApiError('The SCAN API did not return readable offers.')
  }
}

export async function activateRetailerOffer({ offerKey, username, password, signal }) {
  try {
    return normalizeOffer(
      await authorizedRequest(`/api/v1/retailer/offers/${encodeURIComponent(offerKey)}/activate`, {
        method: 'POST', username, password, signal,
      }),
      'offer',
    )
  } catch (error) {
    if (error?.name === 'AbortError' || error instanceof ScanApiError) throw error
    throw new ScanApiError('The SCAN API did not return a readable activated offer.')
  }
}

export async function fetchRetailerActions({ username, password, signal }) {
  try {
    const data = await authorizedRequest('/api/v1/retailer/actions', { username, password, signal })
    return array(data, 'actions', normalizeAction)
  } catch (error) {
    if (error?.name === 'AbortError' || error instanceof ScanApiError) throw error
    throw new ScanApiError('The SCAN API did not return readable actions.')
  }
}

export async function fetchRetailerPartnerStatus({ username, password, signal }) {
  try {
    return normalizePartnerStatus(await authorizedRequest('/api/v1/retailer/partner-status', { username, password, signal }))
  } catch (error) {
    if (error?.name === 'AbortError' || error instanceof ScanApiError) throw error
    throw new ScanApiError('The SCAN API did not return a readable partner status.')
  }
}
