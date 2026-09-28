import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RetailerDashboard from './RetailerDashboard'
import { ScanApiError } from '../services/scanApi'
import {
  activateRetailerOffer,
  fetchRetailerActions,
  fetchRetailerOffers,
  fetchRetailerOverview,
  fetchRetailerPartnerStatus,
} from '../services/retailerApi'

vi.mock('../services/retailerApi', () => ({
  fetchRetailerOverview: vi.fn(),
  fetchRetailerOffers: vi.fn(),
  activateRetailerOffer: vi.fn(),
  fetchRetailerActions: vi.fn(),
  fetchRetailerPartnerStatus: vi.fn(),
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
  lifetimeTransactionsProcessed: 54321,
}

function offer(overrides = {}) {
  return {
    offerKey: 'CCI-COCA-COLA-ZERO-330ML',
    title: 'Coca-Cola Zero 330ml',
    productName: 'Coca-Cola Zero 330ml',
    category: 'Beverages',
    reason: 'Coca-Cola Zero 330ml is your top CCI seller by recorded revenue, with ₼500.00 over the last 30 days.',
    whyReasons: [
      'Coca-Cola Zero 330ml generated ₼500.00 in recorded sales over the last 30 days.',
      'It was purchased in 80 separate baskets in that period.',
    ],
    normalCondition: 'Order 2 cases',
    partnerCondition: '8% partner discount',
    estimatedBenefitAzn: 11.2,
    benefitSummary: 'Save ₼11.20',
    expiresAt: '2026-09-05T10:00:00Z',
    status: 'AVAILABLE',
    ...overrides,
  }
}

function offers(overrides = {}) {
  return { generatedAt: '2026-08-29T10:00:00Z', available: [offer()], active: [], completed: [], ...overrides }
}

function action(overrides = {}) {
  return {
    id: 'urgent-coca-cola-500ml',
    type: 'URGENT',
    title: 'Coca-Cola 500ml demand is accelerating',
    explanation: 'Coca-Cola 500ml demand is up 34% over the last 14 days, with 340 units sold.',
    recommendation: 'Consider checking shelf stock and adding to your next order.',
    metricLabel: 'Sales velocity (last 14 days)',
    metricValue: '24.3 units/day',
    ...overrides,
  }
}

function partnerStatus(overrides = {}) {
  return {
    level: 'GOLD',
    progressPercentage: 72,
    nextLevel: 'PLATINUM',
    daysUntilNextLevel: 8,
    requirements: [
      { label: 'Store connected', met: true },
      { label: '30+ days active', met: true },
      { label: 'Reliable POS data', met: true },
      { label: 'Regular transaction sync', met: true },
    ],
    benefits: { thisMonth: 84.5, lastMonth: 61.2, lifetime: 247.8 },
    benefitHistory: [{
      activatedAt: '2026-08-26T10:00:00Z',
      title: 'Coca-Cola Zero Partner Offer',
      benefitSummary: 'Save ₼11.20',
      estimatedBenefitAzn: 11.2,
    }],
    ...overrides,
  }
}

async function signIn(user) {
  await user.type(screen.getByLabelText('Password'), 'retailer-secret')
  await user.click(screen.getByRole('button', { name: 'Open my dashboard' }))
  return screen.findByRole('heading', { name: 'Your store is connected to SCAN' })
}

describe('RetailerDashboard', () => {
  beforeEach(() => {
    fetchRetailerOverview.mockReset()
    fetchRetailerOffers.mockReset()
    activateRetailerOffer.mockReset()
    fetchRetailerActions.mockReset()
    fetchRetailerPartnerStatus.mockReset()
    fetchRetailerOffers.mockResolvedValue(offers())
    fetchRetailerActions.mockResolvedValue([action()])
    fetchRetailerPartnerStatus.mockResolvedValue(partnerStatus())
  })

  it('links the sign-in screen to every other portal', () => {
    render(<RetailerDashboard />)
    expect(screen.getByRole('link', { name: /CCI intelligence workspace/ })).toHaveAttribute('href', '/?portal=cci')
    expect(screen.getByRole('link', { name: /Data connection/ })).toHaveAttribute('href', '/?portal=connection')
    expect(screen.getByRole('link', { name: /Retailer onboarding/ })).toHaveAttribute('href', '/?portal=onboarding')
  })

  it('leads with connection, benefits, and commercial offers rather than a sales dashboard', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)

    await signIn(user)

    expect(fetchRetailerOverview).toHaveBeenCalledWith(expect.objectContaining({
      username: 'scan-retailer', password: 'retailer-secret',
    }))
    expect(screen.getAllByText('Connected').length).toBeGreaterThan(0)
    expect(screen.getByText('Benefits this month')).toBeInTheDocument()
    expect(screen.getByText('Available offers')).toBeInTheDocument()
    expect(screen.getByText('Partner status')).toBeInTheDocument()
    expect(screen.getByText('GOLD')).toBeInTheDocument()
    // The hero recommendation, not total sales, is the headline commercial moment.
    expect(screen.getByText('Recommended for your store')).toBeInTheDocument()
    expect(screen.getByText('Coca-Cola Zero 330ml')).toBeInTheDocument()
    expect(screen.getByText('Save ₼11.20')).toBeInTheDocument()
    expect(screen.getByText('Your SCAN Benefits')).toBeInTheDocument()
    expect(screen.getByText('POS Connection')).toBeInTheDocument()
    expect(screen.getByText('54,321')).toBeInTheDocument()
    expect(screen.queryByText('Sales today')).not.toBeInTheDocument()
  })

  it('activates an offer with a loading state then a success checkmark, in place', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    let resolveActivation
    activateRetailerOffer.mockReturnValue(new Promise((resolve) => { resolveActivation = resolve }))
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Offers' })[0])
    expect(await screen.findByRole('heading', { name: 'SCAN Partner offers' })).toBeInTheDocument()
    expect(screen.getByText('Order 2 cases')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Activate offer' }))
    expect(screen.getByRole('button', { name: 'Activating…' })).toBeDisabled()

    await act(async () => resolveActivation(offer({ status: 'ACTIVE' })))

    expect(activateRetailerOffer).toHaveBeenCalledWith(expect.objectContaining({ offerKey: 'CCI-COCA-COLA-ZERO-330ML' }))
    // The just-activated card stays visible with a checkmark rather than vanishing the instant
    // it is accepted, so the retailer sees the confirmation before it moves to the Active tab.
    expect(await screen.findByText('Offer activated')).toBeInTheDocument()
    expect(screen.getByText('Coca-Cola Zero 330ml')).toBeInTheDocument()
  })

  it('surfaces why an offer could not be activated', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    activateRetailerOffer.mockRejectedValue(new ScanApiError('This offer is no longer available. Refresh to see current offers.', 400))
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Offers' })[0])
    await user.click(await screen.findByRole('button', { name: 'Activate offer' }))

    expect(await screen.findByText('This offer is no longer available. Refresh to see current offers.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activate offer' })).toBeEnabled()
  })

  it('shows why a retailer is seeing an offer only when asked', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)
    await user.click(screen.getAllByRole('button', { name: 'Offers' })[0])

    expect(screen.queryByText(/It was purchased in 80 separate baskets/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Why you're seeing this/ }))
    expect(screen.getByText(/It was purchased in 80 separate baskets/)).toBeInTheDocument()
  })

  it('leaves offers, actions, and benefits empty for a retailer with no CCI sales yet', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    fetchRetailerOffers.mockResolvedValue(offers({ available: [] }))
    fetchRetailerActions.mockResolvedValue([])
    fetchRetailerPartnerStatus.mockResolvedValue(partnerStatus({
      level: 'SILVER', progressPercentage: 25, nextLevel: 'GOLD', daysUntilNextLevel: null,
      requirements: [
        { label: 'Store connected', met: true },
        { label: '30+ days active', met: false },
        { label: 'Reliable POS data', met: false },
        { label: 'Regular transaction sync', met: false },
      ],
      benefits: { thisMonth: 0, lastMonth: 0, lifetime: 0 },
      benefitHistory: [],
    }))
    render(<RetailerDashboard />)
    await signIn(user)

    expect(screen.getByText('No personalized offers yet')).toBeInTheDocument()
    expect(screen.getByText('SILVER')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Actions' })[0])
    expect(await screen.findByText('No actions right now')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Partner' })[0])
    expect(await screen.findByText('No benefit history yet')).toBeInTheDocument()
  })

  it('shows recommended actions with their supporting metric', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Actions' })[0])
    expect(await screen.findByText('Coca-Cola 500ml demand is accelerating')).toBeInTheDocument()
    expect(screen.getByText('24.3 units/day')).toBeInTheDocument()
    expect(screen.getByText('Consider checking shelf stock and adding to your next order.')).toBeInTheDocument()
  })

  it('surfaces a failed checkout feed as a Needs attention item on Home and Actions', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue({
      ...overview,
      sync: { ...overview.sync, state: 'FAILED', errors: ['The latest file could not be imported.'], completedAt: null },
    })
    render(<RetailerDashboard />)
    await signIn(user)

    expect(await screen.findByRole('heading', { name: 'Needs attention' })).toBeInTheDocument()
    expect(screen.getByText('The latest file could not be imported.')).toBeInTheDocument()
  })

  it('shows Partner standing based on participation requirements, not purchase volume', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Partner' })[0])
    expect(await screen.findByRole('heading', { name: 'SCAN Partner' })).toBeInTheDocument()
    expect(screen.getByText('72% to Platinum')).toBeInTheDocument()
    expect(screen.getByText('8 days until Platinum eligibility')).toBeInTheDocument()
    expect(screen.getByText('30+ days active')).toBeInTheDocument()
    expect(screen.getByText('Personalized CCI offers')).toBeInTheDocument()
    expect(screen.getByText('Coca-Cola Zero Partner Offer')).toBeInTheDocument()
  })

  it('keeps the secondary Insights page reachable with the underlying sales and product detail', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Insights' })[0])
    expect(await screen.findByRole('heading', { name: 'Store Insights' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Daily retailer sales/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Best-selling products' })).toBeInTheDocument()
    expect(screen.getAllByText('Coca-Cola 500ml').length).toBeGreaterThan(0)

    await user.selectOptions(screen.getByLabelText('Period'), 'LAST_7_DAYS')
    await waitFor(() => expect(fetchRetailerOverview).toHaveBeenCalledWith(expect.objectContaining({ period: 'LAST_7_DAYS' })))
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
    await screen.findByRole('heading', { name: 'Your store is connected to SCAN' })
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('button', { name: 'Open my dashboard' })).toBeInTheDocument()
  })
})
