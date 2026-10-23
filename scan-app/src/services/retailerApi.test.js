import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  activateRetailerOffer,
  fetchRetailerActions,
  fetchRetailerOffers,
  fetchRetailerOpportunities,
  fetchRetailerOverview,
  fetchRetailerPartnerStatus,
  startRetailerOpportunityTrial,
} from './retailerApi'

function validOffer(overrides = {}) {
  return {
    offerKey: 'CCI-COCA-COLA-ZERO-330ML',
    offerType: 'VOLUME_DISCOUNT',
    title: 'Coca-Cola Zero 330ml',
    productName: 'Coca-Cola Zero 330ml',
    category: 'Beverages',
    reason: 'Sales increased 18% compared with the previous 30 days.',
    whyReasons: ['Coca-Cola Zero 330ml generated ₼500.00 in recorded sales over the last 30 days.'],
    metricLabel: 'Growth vs previous 30 days',
    metricValue: '+18%',
    normalCondition: 'Order 3 cases',
    partnerCondition: '10% campaign discount',
    estimatedBenefitAzn: 14.4,
    benefitSummary: 'Estimated benefit: ₼14.40',
    expiresAt: '2026-09-05T10:00:00Z',
    status: 'AVAILABLE',
    ...overrides,
  }
}

function validOverview(overrides = {}) {
  return {
    generatedAt: '2026-08-29T10:00:00Z',
    period: 'ALL_TIME',
    periodStart: null,
    retailerCode: 'DEMO',
    retailerName: 'Demo Retailer',
    totalBaskets: 1,
    totalSales: 10,
    averageBasketValue: 10,
    totalItems: 2,
    productsPerBasket: 2,
    cciBaskets: 1,
    cciPenetrationPercentage: 100,
    currency: 'AZN',
    mappedLinePercentage: 100,
    topProducts: [],
    topCategories: [],
    dayparts: [],
    weekdayWeekend: [],
    stores: [],
    dailySales: [],
    insights: [],
    sync: {
      state: 'COMPLETED',
      filename: 'export.csv',
      importedReceipts: 1,
      importedLines: 2,
      unresolvedProducts: 0,
      errors: [],
      receivedAt: '2026-08-29T09:00:00Z',
      completedAt: '2026-08-29T09:01:00Z',
    },
    lifetimeTransactionsProcessed: 1,
    ...overrides,
  }
}

function validOpportunity(overrides = {}) {
  return {
    id: 'opp-1', storeId: 'STORE-1', type: 'CROSS_SELL', title: 'Cola + Chips', description: 'Observed pair.',
    subjects: ['Cola', 'Chips'], priority: 'HIGH', status: 'DETECTED',
    metrics: { supportPercentage: 10, confidencePercentage: 50, lift: 2, productABaskets: 20, productBBaskets: 15, jointBaskets: 10 },
    primaryMetricLabel: 'Lift', primaryMetricValue: '2.0×',
    evidence: { receiptCount: 100, supportingBasketCount: 10, dateFrom: '2026-08-01', dateTo: '2026-08-30', dataCompletenessPercentage: 98, observation: 'Together in 10 baskets.', whyItMatters: 'Twice the independent expectation.', limitations: null },
    recommendedAction: { title: 'Start placement trial', description: 'Test adjacent placement.', durationDays: 7 },
    trial: null, detectedAt: '2026-08-30T10:00:00Z', updatedAt: '2026-08-30T10:00:00Z', ...overrides,
  }
}

describe('fetchRetailerOverview', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses the server-bound retailer endpoint with retailer credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(validOverview()),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRetailerOverview({
      period: 'LAST_30_DAYS',
      username: 'scan-retailer',
      password: 'secret',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/retailer/overview?period=LAST_30_DAYS',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Basic ${window.btoa('scan-retailer:secret')}`,
        }),
      }),
    )
    expect(result.totalSales).toBe(10)
    expect(result.sync.state).toBe('COMPLETED')
  })

  it.each([
    [validOverview({ totalSales: -1 }), 'totalSales'],
    [validOverview({ period: 'UNKNOWN' }), 'period'],
    [validOverview({ sync: { state: 'COMPLETED' } }), 'sync.importedReceipts'],
    [validOverview({ cciBaskets: 2 }), 'cciBaskets'],
    [validOverview({ lifetimeTransactionsProcessed: -1 }), 'lifetimeTransactionsProcessed'],
  ])('fails closed when the retailer contract is invalid', async (body, field) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(body),
    }))

    await expect(fetchRetailerOverview({
      period: 'ALL_TIME',
      username: 'scan-retailer',
      password: 'secret',
    })).rejects.toEqual(expect.objectContaining({
      message: expect.stringContaining(field),
    }))
  })
})

describe('fetchRetailerOffers', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads the bucketed offers for the signed-in retailer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        generatedAt: '2026-08-29T10:00:00Z',
        available: [validOffer()],
        active: [],
        completed: [],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRetailerOffers({ username: 'scan-retailer', password: 'secret' })

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/retailer/offers', expect.objectContaining({ method: 'GET' }))
    expect(result.available).toHaveLength(1)
    expect(result.available[0].productName).toBe('Coca-Cola Zero 330ml')
  })

  it('fails closed when an offer is missing a required field', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        generatedAt: '2026-08-29T10:00:00Z',
        available: [validOffer({ estimatedBenefitAzn: undefined, benefitSummary: undefined })],
        active: [],
        completed: [],
      }),
    }))

    await expect(fetchRetailerOffers({ username: 'scan-retailer', password: 'secret' }))
      .rejects.toEqual(expect.objectContaining({ message: expect.stringContaining('benefitSummary') }))
  })
})

describe('activateRetailerOffer', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('activates an offer by key and returns the activated offer', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(validOffer({ status: 'ACTIVE' })),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await activateRetailerOffer({
      offerKey: 'CCI-COCA-COLA-ZERO-330ML', username: 'scan-retailer', password: 'secret',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/retailer/offers/CCI-COCA-COLA-ZERO-330ML/activate',
      expect.objectContaining({ method: 'POST' }),
    )
    expect(result.status).toBe('ACTIVE')
  })

  it('surfaces the server message when an offer cannot be activated', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: vi.fn().mockResolvedValue({ message: 'This offer has already been activated.' }),
    }))

    await expect(activateRetailerOffer({
      offerKey: 'CCI-COCA-COLA-ZERO-330ML', username: 'scan-retailer', password: 'secret',
    })).rejects.toEqual(expect.objectContaining({ message: 'This offer has already been activated.' }))
  })
})

describe('fetchRetailerActions', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads the retailer action list', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue([{
        id: 'stock-risk-coca-cola-500ml',
        type: 'STOCK_RISK',
        scope: 'CCI',
        title: 'Coca-Cola 500ml is selling 34% faster than usual',
        explanation: 'Coca-Cola 500ml demand is up 34% over the last 14 days.',
        recommendation: 'Consider adding stock to your next order and checking shelf availability.',
        metricLabel: 'Sales velocity (last 14 days)',
        metricValue: '24.3 units/day',
      }]),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRetailerActions({ username: 'scan-retailer', password: 'secret' })

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/retailer/actions', expect.objectContaining({ method: 'GET' }))
    expect(result).toHaveLength(1)
    expect(result[0].type).toBe('STOCK_RISK')
    expect(result[0].scope).toBe('CCI')
  })
})

describe('fetchRetailerPartnerStatus', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads partner status, benefits, and benefit history', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({
        level: 'GOLD',
        progressPercentage: 72,
        nextLevel: 'PLATINUM',
        daysUntilNextLevel: 8,
        requirements: [{ label: 'Store connected', met: true }],
        daysConnected: 45,
        dataReliabilityPercent: 94,
        transactionSyncActive: true,
        dataCompletenessLabel: 'High',
        benefits: { thisMonth: 84.5, lastMonth: 61.2, lifetime: 247.8 },
        benefitHistory: [{
          activatedAt: '2026-08-26T10:00:00Z',
          title: 'Coca-Cola Zero Partner Offer',
          benefitSummary: 'Save ₼11.20',
          estimatedBenefitAzn: 11.2,
        }],
      }),
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchRetailerPartnerStatus({ username: 'scan-retailer', password: 'secret' })

    expect(fetchMock).toHaveBeenCalledWith('/api/v1/retailer/partner-status', expect.objectContaining({ method: 'GET' }))
    expect(result.level).toBe('GOLD')
    expect(result.benefits.thisMonth).toBe(84.5)
    expect(result.benefitHistory).toHaveLength(1)
  })
})

describe('retailer opportunity API', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads reproducible evidence and starts a dated trial', async () => {
    const body = { summary: { analyzedAt: '2026-08-30T10:00:00Z', latestImportAt: '2026-08-30T09:59:00Z', datasetKind: 'OPERATIONAL', coverageStatus: 'READY', receiptCount: 100, mappingCoveragePercentage: 98, availableCount: 1, activeTrialCount: 0, completedTrialCount: 0 }, opportunities: [validOpportunity()] }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, status: 200, json: vi.fn().mockResolvedValue(body) })
      .mockResolvedValueOnce({ ok: true, status: 201, json: vi.fn().mockResolvedValue(validOpportunity({ status: 'ACTIVE', trial: { id: 'trial-1', status: 'ACTIVE', startDate: '2026-10-24', endDate: '2026-10-30', baselineFrom: '2026-10-17', baselineTo: '2026-10-23', metric: 'JOINT_BASKET_RATE', baselineValue: 10, currentValue: null, currentNumerator: null, currentDenominator: null, measurementNote: 'Starts tomorrow.' } })) })
    vi.stubGlobal('fetch', fetchMock)

    const analysis = await fetchRetailerOpportunities({ username: 'retailer', password: 'secret' })
    expect(analysis.opportunities[0].metrics.lift).toBe(2)
    const trial = await startRetailerOpportunityTrial({ opportunityId: 'opp-1', startDate: '2026-10-24', durationDays: 7, username: 'retailer', password: 'secret' })
    expect(trial.status).toBe('ACTIVE')
    expect(fetchMock).toHaveBeenLastCalledWith('/api/v1/retailer/opportunities/opp-1/trials', expect.objectContaining({ method: 'POST', body: JSON.stringify({ startDate: '2026-10-24', durationDays: 7 }) }))
  })

  it('rejects invented or malformed opportunity metrics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: vi.fn().mockResolvedValue({ summary: { analyzedAt: '2026-08-30T10:00:00Z', latestImportAt: null, datasetKind: 'OPERATIONAL', coverageStatus: 'READY', receiptCount: 100, mappingCoveragePercentage: 98, availableCount: 1, activeTrialCount: 0, completedTrialCount: 0 }, opportunities: [validOpportunity({ metrics: { lift: -2 } })] }) }))
    await expect(fetchRetailerOpportunities({ username: 'retailer', password: 'secret' })).rejects.toEqual(expect.objectContaining({ message: expect.stringContaining('metrics.lift') }))
  })
})
