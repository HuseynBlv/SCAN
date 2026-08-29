import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScanApiError, fetchOverview } from './scanApi'

function response({ ok, status, body }) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

function validOverview(overrides = {}) {
  return {
    generatedAt: '2026-08-25T10:00:00Z',
    retailerCode: 'DEMO',
    retailerName: 'Demo Retailer',
    totalBaskets: 2,
    cciBaskets: 1,
    cciPenetrationPercentage: 50,
    averageBasketValue: 4.25,
    currency: 'AZN',
    mappedLinePercentage: 100,
    topCompanionProducts: [],
    topCompanionCategories: [],
    cciSkuPerformance: [],
    dayparts: [],
    weekdayWeekend: [],
    stores: [],
    insights: [],
    ...overrides,
  }
}

describe('fetchOverview', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends Basic Auth and normalizes a complete analytics response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      ok: true,
      status: 200,
      body: validOverview(),
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchOverview({
      retailerCode: 'DEMO & CO',
      username: 'scan-cci',
      password: 'secret',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/analytics/overview?retailerCode=DEMO%20%26%20CO',
      expect.objectContaining({
        headers: {
          Accept: 'application/json',
          Authorization: `Basic ${window.btoa('scan-cci:secret')}`,
        },
      }),
    )
    expect(result.totalBaskets).toBe(2)
    expect(result.cciBaskets).toBe(1)
    expect(result.topCompanionProducts).toEqual([])
    expect(result.insights).toEqual([])
  })

  it.each([
    ['missing arrays', validOverview({ stores: undefined }), 'stores'],
    ['malformed numbers', validOverview({ totalBaskets: '2' }), 'totalBaskets'],
    ['invalid timestamps', validOverview({ generatedAt: 'not-a-timestamp' }), 'generatedAt'],
    ['negative metrics', validOverview({ averageBasketValue: -1 }), 'averageBasketValue'],
    ['out-of-range percentages', validOverview({ mappedLinePercentage: 101 }), 'mappedLinePercentage'],
    ['inconsistent basket counts', validOverview({ cciBaskets: 3 }), 'cciBaskets'],
    ['incomplete SKU metrics', validOverview({
      cciSkuPerformance: [{ product: 'Coke', basketCount: 1, quantity: 1, revenue: 1.5 }],
    }), 'productId'],
  ])('fails closed for %s', async (_description, body, invalidField) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      ok: true,
      status: 200,
      body,
    })))

    await expect(fetchOverview({
      retailerCode: 'DEMO',
      username: 'scan-cci',
      password: 'secret',
    })).rejects.toEqual(expect.objectContaining({
      name: 'ScanApiError',
      message: expect.stringContaining(invalidField),
    }))
  })

  it('turns 401 responses into a useful typed error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      ok: false,
      status: 401,
      body: {},
    })))

    await expect(fetchOverview({
      retailerCode: 'DEMO',
      username: 'scan-cci',
      password: 'wrong',
    })).rejects.toEqual(expect.objectContaining({
      name: 'ScanApiError',
      status: 401,
      message: 'The username or password is incorrect.',
    }))
  })

  it('reports an unreachable API without exposing browser errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('connection refused')))

    await expect(fetchOverview({
      retailerCode: 'DEMO',
      username: 'scan-cci',
      password: 'secret',
    })).rejects.toBeInstanceOf(ScanApiError)
  })

  it.each([502, 503, 504])('explains a temporary hosting failure (%s)', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ok: false, status })))

    await expect(fetchOverview({ retailerCode: 'KAGGLE', username: 'scan-cci', password: 'secret' }))
      .rejects.toEqual(expect.objectContaining({
        status,
        message: expect.stringContaining('temporarily unavailable'),
      }))
  })

  it('handles a hosting HTML response without exposing a JSON parser error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(new SyntaxError('Unexpected token <')),
    }))

    await expect(fetchOverview({ retailerCode: 'KAGGLE', username: 'scan-cci', password: 'secret' }))
      .rejects.toEqual(expect.objectContaining({
        name: 'ScanApiError',
        message: expect.stringContaining('did not return readable analytics'),
      }))
  })

  it('distinguishes denied retailer access from invalid credentials', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      ok: false,
      status: 403,
      body: {},
    })))

    await expect(fetchOverview({
      retailerCode: 'PRIVATE',
      username: 'scan-cci',
      password: 'secret',
    })).rejects.toEqual(expect.objectContaining({
      status: 403,
      message: "This account cannot access the selected retailer's analytics.",
    }))
  })

  it('preserves cancellation while reading the response body', async () => {
    const aborted = new DOMException('Request was cancelled', 'AbortError')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockRejectedValue(aborted),
    }))

    await expect(fetchOverview({ retailerCode: 'KAGGLE', username: 'scan-cci', password: 'secret' }))
      .rejects.toBe(aborted)
  })
})
