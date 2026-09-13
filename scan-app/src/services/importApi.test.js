import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchImportJob,
  fetchUnresolvedProducts,
  saveProductMapping,
  uploadImport,
} from './importApi'

function response({ body, ok = true, status = 200 }) {
  return { ok, status, json: vi.fn().mockResolvedValue(body) }
}

function importJob(overrides = {}) {
  return {
    id: '34ad6f4a-f1c5-4c10-8cff-b48a501021b4',
    retailerCode: 'DEMO',
    profileCode: 'CANONICAL',
    filename: 'sales.csv',
    status: 'COMPLETED',
    duplicateFile: false,
    attemptNumber: 1,
    totalRows: 11,
    importedReceipts: 6,
    importedLines: 11,
    duplicateReceipts: 0,
    unresolvedProducts: 1,
    errors: [],
    createdAt: '2026-09-13T10:00:00Z',
    completedAt: '2026-09-13T10:00:01Z',
    ...overrides,
  }
}

function canonicalProduct() {
  return {
    id: '55d96dd4-e5ee-47bb-bb44-58914cb9df1f',
    normalizedName: 'Coca-Cola 500ml',
    barcode: '5449000000996',
    brand: 'Coca-Cola',
    manufacturer: 'CCI',
    category: 'Beverages',
    subcategory: null,
    packageSize: '500ml',
    packageType: 'Bottle',
    cci: true,
  }
}

function retailerProduct(overrides = {}) {
  return {
    id: '0d565141-c419-4d31-886f-d9040c173d9b',
    retailerCode: 'DEMO',
    productCode: 'COKE-500',
    barcode: null,
    originalProductName: 'Coke bottle',
    matchMethod: 'UNRESOLVED',
    canonicalProduct: null,
    ...overrides,
  }
}

describe('importApi', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uploads the real file with admin authentication and import context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ status: 201, body: importJob() }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['header\nvalue'], 'sales.csv', { type: 'text/csv' })

    const result = await uploadImport({
      retailerCode: 'DEMO', profileCode: 'CANONICAL', file,
      username: 'scan-admin', password: 'secret',
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/imports?retailerCode=DEMO&profileCode=CANONICAL')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.headers.Authorization).toBe(`Basic ${window.btoa('scan-admin:secret')}`)
    expect(result.importedReceipts).toBe(6)
    expect(result.unresolvedProducts).toBe(1)
  })

  it('returns a structured failed import for a 422 validation response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({
      ok: false,
      status: 422,
      body: importJob({
        status: 'FAILED', completedAt: '2026-09-13T10:00:01Z', totalRows: 2,
        importedReceipts: 0, importedLines: 0, unresolvedProducts: 0,
        errors: ['row 2: quantity must be greater than zero'],
      }),
    })))

    const result = await uploadImport({
      retailerCode: 'DEMO', profileCode: 'CANONICAL',
      file: new File(['bad'], 'bad.csv'), username: 'scan-admin', password: 'secret',
    })

    expect(result.status).toBe('FAILED')
    expect(result.errors).toEqual(['row 2: quantity must be greater than zero'])
  })

  it('reads the stored state of an active import job', async () => {
    const active = importJob({ status: 'IMPORTING', completedAt: null })
    const fetchMock = vi.fn().mockResolvedValue(response({ body: active }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchImportJob({
      jobId: active.id, username: 'scan-admin', password: 'secret',
    })

    expect(fetchMock.mock.calls[0][0]).toBe(`/api/v1/imports/${active.id}`)
    expect(result.status).toBe('IMPORTING')
  })

  it('loads unresolved products and saves an explicit catalog match', async () => {
    const unresolved = retailerProduct()
    const mapped = retailerProduct({ matchMethod: 'MANUAL', canonicalProduct: canonicalProduct() })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ body: [unresolved] }))
      .mockResolvedValueOnce(response({ body: mapped }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchUnresolvedProducts({ retailerCode: 'DEMO', username: 'scan-admin', password: 'secret' })
    const saved = await saveProductMapping({
      retailerProductId: unresolved.id,
      canonicalProductId: mapped.canonicalProduct.id,
      username: 'scan-admin', password: 'secret',
    })

    expect(result[0].originalProductName).toBe('Coke bottle')
    expect(fetchMock.mock.calls[1][1]).toEqual(expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ canonicalProductId: mapped.canonicalProduct.id }),
    }))
    expect(saved.matchMethod).toBe('MANUAL')
  })

  it('uses import-specific wording for a denied account', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ok: false, status: 403, body: {} })))

    await expect(fetchUnresolvedProducts({
      retailerCode: 'DEMO', username: 'scan-retailer', password: 'secret',
    })).rejects.toEqual(expect.objectContaining({
      status: 403,
      message: 'This account does not have data-import administrator access.',
    }))
  })
})
