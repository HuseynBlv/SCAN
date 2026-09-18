import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DataConnection from './DataConnection'
import {
  fetchImportContext,
  fetchImportAudit,
  fetchImportHistory,
  fetchImportJob,
  fetchImportOperations,
  fetchProductCatalog,
  fetchUnresolvedProducts,
  previewImport,
  saveProductMapping,
  updateImportMapping,
  uploadImport,
} from '../services/importApi'

vi.mock('../services/importApi', () => ({
  fetchImportContext: vi.fn(),
  fetchImportAudit: vi.fn(),
  fetchImportHistory: vi.fn(),
  fetchImportJob: vi.fn(),
  fetchImportOperations: vi.fn(),
  fetchProductCatalog: vi.fn(),
  fetchUnresolvedProducts: vi.fn(),
  previewImport: vi.fn(),
  saveProductMapping: vi.fn(),
  updateImportMapping: vi.fn(),
  uploadImport: vi.fn(),
}))

const sourceProduct = {
  id: 'source-1', retailerCode: 'SHOP_01', productCode: 'COKE-500', barcode: null,
  originalProductName: 'Coke bottle', matchMethod: 'UNRESOLVED', canonicalProduct: null,
}

const canonicalProduct = {
  id: 'canonical-1', normalizedName: 'Coca-Cola 500ml', barcode: '5449000000996',
  brand: 'Coca-Cola', manufacturer: 'CCI', category: 'Beverages', subcategory: null,
  packageSize: '500ml', packageType: 'Bottle', cci: true,
}

const completedJob = {
  id: 'job-1', retailerCode: 'SHOP_01', profileCode: 'CLOUDSALE_V1',
  filename: 'transactions.xlsx', status: 'COMPLETED', duplicateFile: false,
  attemptNumber: 1, totalRows: 8913, importedReceipts: 3842, importedLines: 8913,
  duplicateReceipts: 3, unresolvedProducts: 14, errors: [],
  createdAt: '2026-09-13T10:00:00Z', completedAt: '2026-09-13T10:00:03Z',
}

const importContext = {
  retailerCode: 'SHOP_01', retailerName: 'Corner Market', profileCode: 'CLOUDSALE_V1',
  profileName: 'CloudSale transaction export', sourceSystem: 'caspos-cloudsale-provisional-v1',
  importEnabled: true, sampleValidated: true, demoData: false,
  delimiter: ',', dateTimePattern: "yyyy-MM-dd'T'HH:mm:ss", currency: 'AZN',
  mapping: {
    storeId: 'store_id', receiptId: 'receipt_id', timestamp: 'transaction_timestamp',
    productCode: 'product_code', barcode: 'barcode', productName: 'product_name',
    quantity: 'quantity', unitPrice: 'unit_price', discountAmount: 'discount_amount',
    lineTotal: 'line_total',
  },
}

const readyPreview = {
  previewId: 'preview-1', readyForImport: true, mappingRequired: false,
  filename: 'transactions.xlsx', adapterCode: 'CLOUDSALE_OBSERVED',
  adapterName: 'CloudSale workbook adapter', rowsChecked: 38, receiptsDetected: 20,
  productLines: 38, distinctProducts: 15, detectedColumns: ['Obyekt_kodu', 'Çek_nömrəsi'],
  detectedStoreIds: ['BK-0147'], quantity: 39, grossSales: 50.19, discounts: 0,
  reportedNetSales: 50.19, calculatedNetSales: 50.19, difference: 0, currency: 'AZN',
  firstTransactionAt: '2026-09-10T04:07:14Z', lastTransactionAt: '2026-09-10T16:00:00Z',
  expiresAt: '2026-09-18T10:30:00Z', fields: [], errors: [],
}

async function signIn(user) {
  await user.type(screen.getByLabelText('Administrator username'), 'shop-admin')
  await user.type(screen.getByLabelText('Password'), 'admin-secret')
  await user.click(screen.getByRole('button', { name: 'Open data connection' }))
  await screen.findByRole('heading', { name: 'Connect your sales data' })
}

describe('DataConnection', () => {
  beforeEach(() => {
    fetchImportContext.mockReset().mockResolvedValue(importContext)
    fetchImportJob.mockReset()
    fetchImportAudit.mockReset().mockResolvedValue([])
    fetchImportHistory.mockReset().mockResolvedValue([])
    fetchImportOperations.mockReset().mockResolvedValue({ queued: 0, validating: 0, importing: 0, failed: 0, oldestQueuedAt: null, lastCompletedAt: null })
    fetchUnresolvedProducts.mockReset().mockResolvedValue([])
    fetchProductCatalog.mockReset().mockResolvedValue([])
    saveProductMapping.mockReset().mockResolvedValue({ ...sourceProduct, matchMethod: 'MANUAL', canonicalProduct })
    previewImport.mockReset().mockResolvedValue(readyPreview)
    updateImportMapping.mockReset().mockResolvedValue(importContext)
    uploadImport.mockReset()
  })

  it('separates working, pilot, and future connection methods', async () => {
    const user = userEvent.setup()
    render(<DataConnection />)
    await signIn(user)

    expect(screen.getByRole('heading', { name: 'Excel / CSV' })).toBeInTheDocument()
    expect(screen.getAllByText('Available')).toHaveLength(2)
    expect(screen.getByRole('heading', { name: 'CASPOS CloudSale' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1C' })).toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
    expect(screen.getByText(/does not write to the POS/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Import Excel or CSV/ })).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /Choose a file/ })).not.toBeInTheDocument()
    expect(screen.getByText(/recognizes installed adapters/i)).toBeInTheDocument()
  })

  it('uploads a supported file and renders only metrics returned by the import job', async () => {
    const user = userEvent.setup()
    uploadImport.mockResolvedValue(completedJob)
    fetchUnresolvedProducts
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([sourceProduct])
    render(<DataConnection />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Import data' })[0])
    const input = document.querySelector('input[type="file"]')
    const file = new File(['spreadsheet'], 'transactions.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    await user.upload(input, file)
    expect(screen.getByText('transactions.xlsx')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Check file before import/ }))

    expect(await screen.findByRole('heading', { name: 'CloudSale workbook adapter' })).toBeInTheDocument()
    expect(screen.getAllByText('50.19', { exact: false })).toHaveLength(3)
    await user.click(screen.getByRole('button', { name: /Import verified data/ }))

    expect(await screen.findByRole('heading', { name: 'Data ready—with mapping review' })).toBeInTheDocument()
    expect(screen.getByText('3,842')).toBeInTheDocument()
    expect(screen.getByText('8,913')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.queryByText(/% products mapped/i)).not.toBeInTheDocument()
    expect(uploadImport).toHaveBeenCalledWith(expect.objectContaining({
      file, username: 'shop-admin', password: 'admin-secret',
      previewId: 'preview-1',
    }))
    expect(screen.getByRole('link', { name: /Open intelligence/ })).toHaveAttribute('href', '/')
  })

  it('stops on backend validation errors and does not offer intelligence as if import succeeded', async () => {
    const user = userEvent.setup()
    previewImport.mockResolvedValue({
      ...readyPreview, previewId: null, readyForImport: false, rowsChecked: 2,
      receiptsDetected: 0, productLines: 0, distinctProducts: 0,
      quantity: 0, grossSales: 0, reportedNetSales: 0, calculatedNetSales: 0,
      errors: ['row 2: quantity must be greater than zero'],
    })
    render(<DataConnection />)
    await signIn(user)
    await user.click(screen.getAllByRole('button', { name: 'Import data' })[0])
    await user.upload(document.querySelector('input[type="file"]'), new File(['bad'], 'bad.csv'))
    await user.click(screen.getByRole('button', { name: /Check file before import/ }))

    expect(await screen.findByRole('heading', { name: 'Reconciliation stopped' })).toBeInTheDocument()
    expect(screen.getByText(/quantity must be greater than zero/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open intelligence/ })).not.toBeInTheDocument()
  })

  it('explains profile mismatches before and after a rejected upload', async () => {
    const user = userEvent.setup()
    previewImport.mockResolvedValue({
      ...readyPreview, previewId: null, readyForImport: false, mappingRequired: true,
      adapterCode: 'COLUMN_MAPPING', adapterName: 'Saved column mapping', rowsChecked: 38,
      receiptsDetected: 0, productLines: 0, distinctProducts: 0, quantity: 0,
      grossSales: 0, reportedNetSales: 0, calculatedNetSales: 0,
      detectedColumns: ['Shop', 'Receipt', 'Date', 'Product', 'Qty', 'Price', 'Discount', 'Total'],
      detectedStoreIds: [], errors: ['store_id: required column is missing'],
      fields: [
        { field: 'storeId', label: 'Store ID', required: true, sourceColumn: 'store_id', suggestedSourceColumn: 'Shop' },
        { field: 'receiptId', label: 'Receipt ID', required: true, sourceColumn: 'receipt_id', suggestedSourceColumn: 'Receipt' },
      ],
    })
    render(<DataConnection />)
    await signIn(user)
    await user.click(screen.getAllByRole('button', { name: 'Import data' })[0])

    expect(screen.getByRole('heading', { name: 'Original POS exports are accepted when an adapter exists' })).toBeInTheDocument()
    expect(screen.getByText(/Imports do not replace existing receipts/i)).toBeInTheDocument()
    expect(screen.getByText('store_id')).toBeInTheDocument()

    await user.upload(document.querySelector('input[type="file"]'), new File(['wrong headers'], 'shop.xlsx'))
    await user.click(screen.getByRole('button', { name: /Check file before import/ }))

    expect(await screen.findByRole('heading', { name: 'Match this export to SCAN' })).toBeInTheDocument()
    expect(screen.getByLabelText(/Store ID/)).toHaveValue('Shop')
    expect(screen.getByText(/does not import the file/i)).toBeInTheDocument()
  })

  it('derives the retailer from the signed-in account and locks Kaggle imports', async () => {
    const user = userEvent.setup()
    fetchImportContext.mockResolvedValue({
      retailerCode: 'KAGGLE', retailerName: 'Kaggle Supermarket Dataset 2019',
      profileCode: 'KAGGLE_2019', sourceSystem: 'kaggle-supermarket-2019',
      profileName: 'Kaggle demo format', importEnabled: false, sampleValidated: true, demoData: true,
      delimiter: ',', dateTimePattern: "yyyy-MM-dd'T'HH:mm:ss", currency: 'AZN',
      mapping: importContext.mapping,
    })
    render(<DataConnection />)

    expect(screen.queryByLabelText('Data destination code')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('File format profile')).not.toBeInTheDocument()
    await signIn(user)

    expect(fetchImportContext).toHaveBeenCalledWith({ username: 'shop-admin', password: 'admin-secret' })
    expect(screen.getByRole('button', { name: /Demo dataset locked/ })).toBeDisabled()
    await user.click(screen.getAllByRole('button', { name: 'Import data' })[0])
    expect(screen.getByRole('heading', { name: 'Demo dataset locked' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/Choose a CSV/)).not.toBeInTheDocument()
  })

  it('checks the stored job state when identical file bytes are already processing', async () => {
    const user = userEvent.setup()
    uploadImport.mockResolvedValue({ ...completedJob, status: 'IMPORTING', completedAt: null })
    fetchImportJob.mockResolvedValue({ ...completedJob, unresolvedProducts: 0 })
    render(<DataConnection />)
    await signIn(user)
    await user.click(screen.getAllByRole('button', { name: 'Import data' })[0])
    await user.upload(document.querySelector('input[type="file"]'), new File(['active'], 'active.csv'))
    await user.click(screen.getByRole('button', { name: /Check file before import/ }))
    await screen.findByRole('heading', { name: 'CloudSale workbook adapter' })
    await user.click(screen.getByRole('button', { name: /Import verified data/ }))

    expect(await screen.findByRole('heading', { name: 'Processing is still underway' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Check actual status/ }))
    expect(await screen.findByRole('heading', { name: 'Data ready' })).toBeInTheDocument()
    expect(fetchImportJob).toHaveBeenCalledWith(expect.objectContaining({ jobId: 'job-1' }))
  })

  it('maps an unresolved source product through the existing catalog endpoint', async () => {
    const user = userEvent.setup()
    fetchUnresolvedProducts.mockResolvedValue([sourceProduct])
    fetchProductCatalog.mockResolvedValue([canonicalProduct])
    render(<DataConnection />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Product mapping' })[0])
    expect(await screen.findByRole('heading', { name: 'Match source products to SCAN' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('SCAN product for Coke bottle'), canonicalProduct.id)
    await user.click(screen.getByRole('button', { name: 'Save match' }))

    await waitFor(() => expect(saveProductMapping).toHaveBeenCalledWith(expect.objectContaining({
      retailerProductId: sourceProduct.id,
      canonicalProductId: canonicalProduct.id,
    })))
    expect(await screen.findByRole('heading', { name: 'Product mapping is complete' })).toBeInTheDocument()
  })
})
