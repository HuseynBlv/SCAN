import { afterEach, describe, expect, it, vi } from 'vitest'
import { createOnboardingRetailer, validateOnboardingSample } from './onboardingApi'

function response(body, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: vi.fn().mockResolvedValue(body) }
}

describe('onboardingApi', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('creates a retailer without accepting a client-selected retailer code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      id: 'retailer-1', code: 'FRESH_MARKET_A1B2C3', name: 'Fresh Market', zoneId: 'Asia/Baku',
      importEnabled: false, credentialsIssued: false, cciSharingEnabled: false,
      stores: [{ id: 'store-1', externalStoreId: 'SHOP-01', name: 'Central store' }],
      importProfiles: [],
    }, 201))
    vi.stubGlobal('fetch', fetchMock)

    await createOnboardingRetailer({
      username: 'operator', password: 'secret',
      request: { name: 'Fresh Market', zoneId: 'Asia/Baku', stores: [{ name: 'Central store', externalStoreId: 'SHOP-01' }] },
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/onboarding/retailers')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).not.toHaveProperty('code')
  })

  it('sends sample files to the no-write validation endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({
      valid: false, filename: 'sample.csv', rowsChecked: 1, receiptsDetected: 0,
      productLines: 1, detectedColumns: ['store_id'], detectedStoreIds: ['UNKNOWN'],
      errors: ['store_id: UNKNOWN is not registered for this retailer'], validatedAt: null,
    }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['sample'], 'sample.csv')

    const result = await validateOnboardingSample({
      retailerId: 'retailer-1', profileId: 'profile-1', file,
      username: 'operator', password: 'secret',
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toContain('/sample-validation')
    expect(options.body).toBeInstanceOf(FormData)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toContain('not registered')
  })
})
