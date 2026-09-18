import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fetchImportContext,
  fetchImportJob,
  fetchUnresolvedProducts,
  previewImport,
  saveProductMapping,
  updateImportMapping,
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

  it('loads the server-bound import context for the signed-in account', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ body: {
      retailerCode: 'SHOP_01', retailerName: 'Corner Market', profileCode: 'CANONICAL',
      profileName: 'Daily sales export', sourceSystem: 'shop-export', importEnabled: true,
      sampleValidated: true, demoData: false,
      delimiter: ',', dateTimePattern: "yyyy-MM-dd'T'HH:mm:ss", currency: 'AZN',
      mapping: {
        storeId: 'store_id', receiptId: 'receipt_id', timestamp: 'transaction_timestamp',
        productCode: 'product_code', barcode: 'barcode', productName: 'product_name',
        quantity: 'quantity', unitPrice: 'unit_price', discountAmount: 'discount_amount',
        lineTotal: 'line_total',
      },
    } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchImportContext({ username: 'shop-admin', password: 'secret' })

    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/imports/context')
    expect(result.retailerCode).toBe('SHOP_01')
    expect(result.importEnabled).toBe(true)
  })

  it('uploads the real file without accepting client-selected tenant context', async () => {
    const fetchMock = vi.fn().mockResolvedValue(response({ status: 201, body: importJob() }))
    vi.stubGlobal('fetch', fetchMock)
    const file = new File(['header\nvalue'], 'sales.csv', { type: 'text/csv' })

    const result = await uploadImport({
      file, previewId: 'preview-1', username: 'scan-admin', password: 'secret',
    })

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/v1/imports')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('previewId')).toBe('preview-1')
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
      file: new File(['bad'], 'bad.csv'), previewId: 'preview-1', username: 'scan-admin', password: 'secret',
    })

    expect(result.status).toBe('FAILED')
    expect(result.errors).toEqual(['row 2: quantity must be greater than zero'])
  })

  it('previews reconciliation totals before importing and saves editable mappings separately', async () => {
    const preview = {
      previewId: 'preview-1', readyForImport: true, mappingRequired: false,
      filename: 'cloudsale.xlsx', adapterCode: 'CLOUDSALE_OBSERVED',
      adapterName: 'CloudSale workbook adapter', rowsChecked: 38, receiptsDetected: 20,
      productLines: 38, distinctProducts: 15, detectedColumns: ['Obyekt_kodu'],
      detectedStoreIds: ['BK-0147'], quantity: 39, grossSales: 50.19, discounts: 0,
      reportedNetSales: 50.19, calculatedNetSales: 50.19, difference: 0, currency: 'AZN',
      firstTransactionAt: '2026-09-10T04:07:14Z', lastTransactionAt: '2026-09-10T16:00:00Z',
      expiresAt: '2026-09-18T10:30:00Z', fields: [], errors: [],
    }
    const contextBody = {
      retailerCode: 'SHOP_01', retailerName: 'Corner Market', profileCode: 'FORMAT_1',
      profileName: 'Daily export', sourceSystem: 'Unknown POS', importEnabled: false,
      sampleValidated: false, demoData: false, delimiter: ';',
      dateTimePattern: 'yyyy-MM-dd HH:mm:ss', currency: 'AZN',
      mapping: {
        storeId: 'Shop', receiptId: 'Receipt', timestamp: 'Date', productCode: null,
        barcode: null, productName: 'Product', quantity: 'Qty', unitPrice: 'Price',
        discountAmount: 'Discount', lineTotal: 'Total',
      },
    }
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ body: preview }))
      .mockResolvedValueOnce(response({ body: contextBody }))
    vi.stubGlobal('fetch', fetchMock)

    const checked = await previewImport({
      file: new File(['sheet'], 'cloudsale.xlsx'), username: 'scan-admin', password: 'secret',
    })
    const updated = await updateImportMapping({
      request: { delimiter: ';', dateTimePattern: 'yyyy-MM-dd HH:mm:ss', columns: contextBody.mapping },
      username: 'scan-admin', password: 'secret',
    })

    expect(checked.receiptsDetected).toBe(20)
    expect(checked.reportedNetSales).toBe(50.19)
    expect(fetchMock.mock.calls[0][0]).toBe('/api/v1/imports/preview')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/v1/imports/profile')
    expect(updated.sampleValidated).toBe(false)
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

    const result = await fetchUnresolvedProducts({ username: 'scan-admin', password: 'secret' })
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
      username: 'scan-retailer', password: 'secret',
    })).rejects.toEqual(expect.objectContaining({
      status: 403,
      message: 'This account does not have data-import administrator access.',
    }))
  })
})
