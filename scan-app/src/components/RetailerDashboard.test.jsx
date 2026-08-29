import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RetailerDashboard from './RetailerDashboard'
import { ScanApiError } from '../services/scanApi'
import { fetchRetailerOverview } from '../services/retailerApi'

vi.mock('../services/retailerApi', () => ({
  fetchRetailerOverview: vi.fn(),
}))

const overview = {
  generatedAt: '2026-08-29T10:00:00Z',
  period: 'ALL_TIME',
  periodStart: null,
  retailerCode: 'KAGGLE',
  retailerName: 'Kaggle Demo Retailer',
  totalBaskets: 10000,
  totalSales: 315200,
  averageBasketValue: 31.52,
  totalItems: 54848,
  productsPerBasket: 5.48,
  cciBaskets: 209,
  cciPenetrationPercentage: 2.1,
  currency: 'AZN',
  mappedLinePercentage: 100,
  topProducts: [{
    name: 'Coca-Cola 500ml',
    category: 'Beverages',
    basketCount: 120,
    quantity: 140,
    revenue: 210,
  }],
  topCategories: [{
    category: 'Beverages',
    basketCount: 220,
    quantity: 260,
    revenue: 390,
  }],
  dayparts: [{ segment: 'EVENING', basketCount: 4000, sharePercentage: 40 }],
  weekdayWeekend: [{ segment: 'WEEKDAY', basketCount: 7000, sharePercentage: 70 }],
  stores: [{
    storeId: 'STORE-01',
    basketCount: 10000,
    cciBasketCount: 209,
    totalSales: 315200,
    averageBasketValue: 31.52,
  }],
  dailySales: [{ date: '2026-08-29', basketCount: 100, totalSales: 3152 }],
  insights: [{
    fact: 'Beverages lead recorded sales.',
    interpretation: 'Demand is strongest in the evening.',
    recommendedAction: 'Replenish before the evening peak.',
  }],
  sync: {
    state: 'COMPLETED',
    filename: 'transactions.csv',
    importedReceipts: 10000,
    importedLines: 54848,
    unresolvedProducts: 0,
    errors: [],
    receivedAt: '2026-08-29T09:59:00Z',
    completedAt: '2026-08-29T10:00:00Z',
  },
}

describe('RetailerDashboard', () => {
  beforeEach(() => {
    fetchRetailerOverview.mockReset()
  })

  it('signs in and exposes retailer value, navigation, period filters, and sync evidence', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)

    await user.type(screen.getByLabelText('Password'), 'retailer-secret')
    await user.click(screen.getByRole('button', { name: 'Open my dashboard' }))

    expect(await screen.findByRole('heading', { name: 'Kaggle Demo Retailer' })).toBeInTheDocument()
    expect(fetchRetailerOverview).toHaveBeenCalledWith(expect.objectContaining({
      period: 'ALL_TIME',
      username: 'scan-retailer',
      password: 'retailer-secret',
    }))
    expect(screen.getByLabelText('Retailer KPIs')).toHaveTextContent('Total sales')
    expect(screen.getByLabelText('Retailer KPIs')).toHaveTextContent('Baskets')

    await user.click(screen.getAllByRole('button', { name: 'Products & Categories' })[0])
    expect(screen.getByRole('heading', { name: 'What drives recorded sales?' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'Coca-Cola 500ml' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Time & Stores' })[0])
    expect(screen.getByRole('heading', { name: 'When and where does business happen?' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: 'STORE-01' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Recommendations' })[0])
    expect(screen.getByText('Replenish before the evening peak.')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Data Sync' })[0])
    expect(screen.getByRole('heading', { name: 'Retailer data is connected' })).toBeInTheDocument()
    expect(screen.getByText('transactions.csv')).toBeInTheDocument()
    expect(screen.getByText('54,848')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Period'), 'LAST_7_DAYS')
    await waitFor(() => expect(fetchRetailerOverview).toHaveBeenCalledWith(expect.objectContaining({
      period: 'LAST_7_DAYS',
    })))
  })

  it('returns to a recoverable login when retailer credentials are invalid', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockRejectedValue(
      new ScanApiError('The username or password is incorrect.', 401),
    )
    render(<RetailerDashboard />)

    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Open my dashboard' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('incorrect')
    expect(screen.getByRole('button', { name: 'Open my dashboard' })).toBeEnabled()
  })

  it('does not apply a completed request after sign-out', async () => {
    const user = userEvent.setup()
    let resolveRequest
    fetchRetailerOverview.mockReturnValue(new Promise((resolve) => { resolveRequest = resolve }))
    render(<RetailerDashboard />)

    await user.type(screen.getByLabelText('Password'), 'retailer-secret')
    await user.click(screen.getByRole('button', { name: 'Open my dashboard' }))
    expect(screen.getByRole('heading', { name: 'Loading your market…' })).toBeInTheDocument()

    await act(async () => resolveRequest(overview))
    await screen.findByRole('heading', { name: 'Kaggle Demo Retailer' })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('button', { name: 'Open my dashboard' })).toBeInTheDocument()
  })
})
