import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScanApiError, fetchOverview } from './scanApi'

function response({ ok, status, body }) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

describe('fetchOverview', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends Basic Auth and normalizes aggregate arrays', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      ok: true,
      status: 200,
      body: {
        retailerCode: 'DEMO',
        totalBaskets: 2,
        topCompanionProducts: null,
      },
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
    expect(result.cciBaskets).toBe(0)
    expect(result.topCompanionProducts).toEqual([])
    expect(result.insights).toEqual([])
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
