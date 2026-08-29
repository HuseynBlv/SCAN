import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchRetailerOverview } from './retailerApi'

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
    ...overrides,
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
