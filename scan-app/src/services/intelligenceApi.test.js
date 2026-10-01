import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScanApiError } from './scanApi'
import {
  askCopilot,
  fetchInvestigations,
  fetchMovers,
  openProductInvestigation,
  recordFieldTaskResult,
} from './intelligenceApi'

function response({ ok, status, body }) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

describe('intelligenceApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('builds a GET request with query params and basic auth', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true, status: 200, body: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchInvestigations({ retailerCode: 'DEMO', openOnly: true, username: 'cci', password: 'secret' })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/investigations?retailerCode=DEMO&openOnly=true')
    expect(options.method).toBe('GET')
    expect(options.headers.Authorization).toBe(`Basic ${window.btoa('cci:secret')}`)
    expect(options.body).toBeUndefined()
  })

  it('sends a JSON body on POST requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      ok: true, status: 201, body: { id: 'inv-1', title: 'Sprite 500ml is down 50%' },
    }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await openProductInvestigation({
      retailerCode: 'DEMO', productName: 'Sprite 500ml', periodDays: 14, username: 'cci', password: 'secret',
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/investigations/product?retailerCode=DEMO')
    expect(options.method).toBe('POST')
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(JSON.parse(options.body)).toEqual({ productName: 'Sprite 500ml', periodDays: 14 })
    expect(result.id).toBe('inv-1')
  })

  it('encodes the external store id in the field-task result URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true, status: 200, body: {} }))
    vi.stubGlobal('fetch', fetchMock)

    await recordFieldTaskResult({
      retailerCode: 'DEMO', taskId: 'task-1', externalStoreId: 'STORE 01/A',
      stockAvailable: false, visibleInCooler: true, correctPlacement: true, competitorPresent: false, note: null,
      username: 'cci', password: 'secret',
    })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/field-tasks/task-1/results/STORE%2001%2FA?retailerCode=DEMO')
  })

  it('omits undefined query parameters', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ ok: true, status: 200, body: [] }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchMovers({ retailerCode: 'DEMO', username: 'cci', password: 'secret' })

    const [url] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/analytics/movers?retailerCode=DEMO')
  })

  it('throws a ScanApiError with the API message on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      ok: false, status: 403, body: {},
    })))

    await expect(askCopilot({
      retailerCode: 'DEMO', contextType: 'GENERAL', question: 'What changed?', username: 'cci', password: 'secret',
    })).rejects.toThrow(ScanApiError)
  })

  it('wraps a network failure in a ScanApiError', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await expect(fetchMovers({ retailerCode: 'DEMO', username: 'cci', password: 'secret' }))
      .rejects.toThrow('Cannot reach the SCAN API')
  })
})
