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
  period: 'TODAY',
  periodStart: '2026-08-29T00:00:00Z',
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

    expect(await screen.findByRole('heading', { name: 'Demo shop' })).toBeInTheDocument()
    expect(fetchRetailerOverview).toHaveBeenCalledWith(expect.objectContaining({
      period: 'TODAY',
      username: 'scan-retailer',
      password: 'retailer-secret',
    }))
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument()
    expect(screen.getByText('Sales today')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Needs attention' })).toBeInTheDocument()
    expect(screen.getByText('Everything looks normal.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Top sellers today' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Busy hours' })).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Today' })[0]).toHaveAttribute('aria-current', 'page')

    await user.click(screen.getAllByRole('button', { name: 'Products' })[0])
    expect(screen.getByRole('heading', { name: 'Product performance' })).toBeInTheDocument()
    expect(screen.getAllByText('Coca-Cola 500ml')).not.toHaveLength(0)
    expect(screen.getByText('Inventory not connected')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Period'), 'LAST_7_DAYS')
    await waitFor(() => expect(fetchRetailerOverview).toHaveBeenCalledWith(expect.objectContaining({
      period: 'LAST_7_DAYS',
    })))

    await user.click(screen.getAllByRole('button', { name: 'Sales' })[0])
    expect(screen.getByRole('heading', { name: 'Sales history' })).toBeInTheDocument()
    expect(screen.getByLabelText('Sales summary')).toHaveTextContent('Transactions')
    expect(screen.getByRole('img', { name: /Daily retailer sales/ })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Alerts' })[0])
    expect(screen.getByText('Replenish before the evening peak.')).toBeInTheDocument()
    await user.click(screen.getByText('Checkout data details'))
    expect(screen.getByRole('heading', { name: 'Checkout data is connected' })).toBeInTheDocument()
    expect(screen.getByText('transactions.csv')).toBeInTheDocument()
    expect(screen.getByText('54,848')).toBeInTheDocument()

  })

  it('does not turn a tiny sample into an operational alert', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue({
      ...overview,
      totalBaskets: 2,
      totalSales: 8,
      averageBasketValue: 4,
      insights: [{
        fact: 'One product led recorded sales.',
        interpretation: 'It appeared in two transactions.',
        recommendedAction: 'Change the shelf immediately.',
      }],
    })
    render(<RetailerDashboard />)

    await user.type(screen.getByLabelText('Password'), 'retailer-secret')
    await user.click(screen.getByRole('button', { name: 'Open my dashboard' }))
    await screen.findByRole('heading', { name: 'Today' })
    await user.click(screen.getAllByRole('button', { name: 'Alerts' })[0])

    expect(screen.getByText('All clear')).toBeInTheDocument()
    expect(screen.queryByText('Change the shelf immediately.')).not.toBeInTheDocument()
  })

  it('does not treat zero sales as a product-mapping problem', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue({
      ...overview,
      totalBaskets: 0,
      totalSales: 0,
      averageBasketValue: 0,
      mappedLinePercentage: 0,
      topProducts: [],
      dayparts: [],
      insights: [],
    })
    render(<RetailerDashboard />)

    await user.type(screen.getByLabelText('Password'), 'retailer-secret')
    await user.click(screen.getByRole('button', { name: 'Open my dashboard' }))

    expect(await screen.findByText('No sales recorded yet.')).toBeInTheDocument()
    expect(screen.queryByText('Product analysis is unavailable')).not.toBeInTheDocument()
  })

  it('surfaces a failed checkout feed without inventing a sales problem', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue({
      ...overview,
      insights: [],
      sync: {
        ...overview.sync,
        state: 'FAILED',
        errors: ['The latest file could not be imported.'],
        completedAt: null,
      },
    })
    render(<RetailerDashboard />)

    await user.type(screen.getByLabelText('Password'), 'retailer-secret')
    await user.click(screen.getByRole('button', { name: 'Open my dashboard' }))

    expect(await screen.findByText('Checkout data needs attention')).toBeInTheDocument()
    expect(screen.getByText('The latest file could not be imported.')).toBeInTheDocument()
    expect(screen.queryByText(/sales decline/i)).not.toBeInTheDocument()
  })

  it('keeps CCI-wide penetration language out of the retailer alerts feed', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue({
      ...overview,
      insights: [{
        fact: '2.1% of baskets contained a CCI product.',
        interpretation: 'CCI basket penetration is below the technical dataset average.',
        recommendedAction: 'Test a CCI placement campaign.',
      }],
    })
    render(<RetailerDashboard />)

    await user.type(screen.getByLabelText('Password'), 'retailer-secret')
    await user.click(screen.getByRole('button', { name: 'Open my dashboard' }))
    await screen.findByRole('heading', { name: 'Today' })
    await user.click(screen.getAllByRole('button', { name: 'Alerts' })[0])

    expect(screen.getByText('All clear')).toBeInTheDocument()
    expect(screen.queryByText(/CCI basket penetration/i)).not.toBeInTheDocument()
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
    expect(screen.getByRole('heading', { name: 'Reading your latest sales…' })).toBeInTheDocument()

    await act(async () => resolveRequest(overview))
    await screen.findByRole('heading', { name: 'Demo shop' })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('button', { name: 'Open my dashboard' })).toBeInTheDocument()
  })
})
