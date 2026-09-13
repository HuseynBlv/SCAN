import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import DataConnection from './DataConnection'
import {
  fetchImportJob,
  fetchProductCatalog,
  fetchUnresolvedProducts,
  saveProductMapping,
  uploadImport,
} from '../services/importApi'

vi.mock('../services/importApi', () => ({
  fetchImportJob: vi.fn(),
  fetchProductCatalog: vi.fn(),
  fetchUnresolvedProducts: vi.fn(),
  saveProductMapping: vi.fn(),
  uploadImport: vi.fn(),
}))

const sourceProduct = {
  id: 'source-1', retailerCode: 'KAGGLE', productCode: 'COKE-500', barcode: null,
  originalProductName: 'Coke bottle', matchMethod: 'UNRESOLVED', canonicalProduct: null,
}

const canonicalProduct = {
  id: 'canonical-1', normalizedName: 'Coca-Cola 500ml', barcode: '5449000000996',
  brand: 'Coca-Cola', manufacturer: 'CCI', category: 'Beverages', subcategory: null,
  packageSize: '500ml', packageType: 'Bottle', cci: true,
}

const completedJob = {
  id: 'job-1', retailerCode: 'KAGGLE', profileCode: 'KAGGLE_2019',
  filename: 'transactions.xlsx', status: 'COMPLETED', duplicateFile: false,
  attemptNumber: 1, totalRows: 8913, importedReceipts: 3842, importedLines: 8913,
  duplicateReceipts: 3, unresolvedProducts: 14, errors: [],
  createdAt: '2026-09-13T10:00:00Z', completedAt: '2026-09-13T10:00:03Z',
}

async function signIn(user) {
  await user.type(screen.getByLabelText('Password'), 'admin-secret')
  await user.click(screen.getByRole('button', { name: 'Open data connection' }))
  await screen.findByRole('heading', { name: 'Connect your sales data' })
}

describe('DataConnection', () => {
  beforeEach(() => {
    fetchImportJob.mockReset()
    fetchUnresolvedProducts.mockReset().mockResolvedValue([])
    fetchProductCatalog.mockReset().mockResolvedValue([])
    saveProductMapping.mockReset().mockResolvedValue({ ...sourceProduct, matchMethod: 'MANUAL', canonicalProduct })
    uploadImport.mockReset()
  })

  it('separates working, pilot, and future connection methods', async () => {
    const user = userEvent.setup()
    render(<DataConnection />)
    await signIn(user)

    expect(screen.getByRole('heading', { name: 'Excel / CSV' })).toBeInTheDocument()
    expect(screen.getByText('Available')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'CASPOS CloudSale' })).toBeInTheDocument()
    expect(screen.getByText('Pilot adapter')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '1C' })).toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
    expect(screen.getByText(/does not write to the POS/i)).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: /Validate and import/ }))

    expect(await screen.findByRole('heading', { name: 'Data ready—with mapping review' })).toBeInTheDocument()
    expect(screen.getByText('3,842')).toBeInTheDocument()
    expect(screen.getByText('8,913')).toBeInTheDocument()
    expect(screen.getByText('14')).toBeInTheDocument()
    expect(screen.queryByText(/% products mapped/i)).not.toBeInTheDocument()
    expect(uploadImport).toHaveBeenCalledWith(expect.objectContaining({
      retailerCode: 'KAGGLE', profileCode: 'KAGGLE_2019', file,
      username: 'scan-admin', password: 'admin-secret',
    }))
    expect(screen.getByRole('link', { name: /Open intelligence/ })).toHaveAttribute('href', '/?retailerCode=KAGGLE')
  })

  it('stops on backend validation errors and does not offer intelligence as if import succeeded', async () => {
    const user = userEvent.setup()
    uploadImport.mockResolvedValue({
      ...completedJob,
      status: 'FAILED', importedReceipts: 0, importedLines: 0, unresolvedProducts: 0,
      totalRows: 2, errors: ['row 2: quantity must be greater than zero'],
    })
    render(<DataConnection />)
    await signIn(user)
    await user.click(screen.getAllByRole('button', { name: 'Import data' })[0])
    await user.upload(document.querySelector('input[type="file"]'), new File(['bad'], 'bad.csv'))
    await user.click(screen.getByRole('button', { name: /Validate and import/ }))

    expect(await screen.findByRole('heading', { name: 'Import stopped safely' })).toBeInTheDocument()
    expect(screen.getByText(/quantity must be greater than zero/)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Open intelligence/ })).not.toBeInTheDocument()
  })

  it('checks the stored job state when identical file bytes are already processing', async () => {
    const user = userEvent.setup()
    uploadImport.mockResolvedValue({ ...completedJob, status: 'IMPORTING', completedAt: null })
    fetchImportJob.mockResolvedValue({ ...completedJob, unresolvedProducts: 0 })
    render(<DataConnection />)
    await signIn(user)
    await user.click(screen.getAllByRole('button', { name: 'Import data' })[0])
    await user.upload(document.querySelector('input[type="file"]'), new File(['active'], 'active.csv'))
    await user.click(screen.getByRole('button', { name: /Validate and import/ }))

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
