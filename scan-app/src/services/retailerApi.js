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
