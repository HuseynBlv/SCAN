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
    offerType: 'VOLUME_DISCOUNT',
    title: 'Coca-Cola Zero 330ml',
    productName: 'Coca-Cola Zero 330ml',
    category: 'Beverages',
    reason: 'Sales increased 18% compared with the previous 30 days.',
    whyReasons: [
      'Coca-Cola Zero 330ml generated ₼500.00 in recorded sales over the last 30 days.',
      'It was purchased in 80 separate baskets in that period.',
    ],
    metricLabel: 'Growth vs previous 30 days',
    metricValue: '+18%',
    normalCondition: 'Order 3 cases',
    partnerCondition: '10% campaign discount',
    estimatedBenefitAzn: 14.4,
    benefitSummary: 'Estimated benefit: ₼14.40',
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
    id: 'stock-risk-coca-cola-500ml',
    type: 'STOCK_RISK',
    scope: 'CCI',
    title: 'Coca-Cola 500ml is selling 34% faster than usual',
    explanation: 'Coca-Cola 500ml demand is up 34% over the last 14 days, with 340 units sold.',
    recommendation: 'Consider adding stock to your next order and checking shelf availability.',
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
    daysConnected: 45,
    dataReliabilityPercent: 94,
    transactionSyncActive: true,
    dataCompletenessLabel: 'High',
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
  return screen.findByText('Sales today')
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
    expect(screen.getByRole('link', { name: 'Back to SCAN home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /CCI intelligence workspace/ })).toHaveAttribute('href', '/?portal=cci')
    expect(screen.getByRole('link', { name: /Data connection/ })).toHaveAttribute('href', '/?portal=connection')
    expect(screen.getByRole('link', { name: /Retailer onboarding/ })).toHaveAttribute('href', '/?portal=onboarding')
  })

  it('opens a presentation-ready account without calling the API', async () => {
    const user = userEvent.setup()
    render(<RetailerDashboard />)

    await user.click(screen.getByRole('button', { name: /Open presentation account/ }))

    expect(await screen.findByText('4 things deserve attention today.')).toBeInTheDocument()
    expect(screen.getAllByText('Nərgiz Market · Nizami')).toHaveLength(2)
    expect(screen.getByText('Presentation data')).toBeInTheDocument()
    expect(screen.getAllByText('Coca-Cola Zero 330ml').length).toBeGreaterThan(0)
    expect(screen.getByText('₼2,847')).toBeInTheDocument()
    expect(screen.getByText('312')).toBeInTheDocument()
    expect(screen.getByText('₼9.12')).toBeInTheDocument()
    expect(screen.getByText('2.3×')).toBeInTheDocument()
    expect(screen.getByText('184 high-fit baskets without both products.')).toBeInTheDocument()
    expect(fetchRetailerOverview).not.toHaveBeenCalled()
    expect(fetchRetailerOffers).not.toHaveBeenCalled()
  })

  it('accepts the presentation credentials and supports offer activation', async () => {
    const user = userEvent.setup()
    render(<RetailerDashboard />)

    const username = screen.getByLabelText('Username')
    await user.clear(username)
    await user.type(username, 'scan-showcase')
    await user.type(screen.getByLabelText('Password'), 'Showcase2026!')
    await user.click(screen.getByRole('button', { name: 'Open my dashboard' }))
    await screen.findByText('4 things deserve attention today.')

    await user.click(screen.getAllByRole('button', { name: 'Opportunities' })[0])
    expect(await screen.findByRole('heading', { name: 'Opportunities' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Recommended 3/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Basket Growth 1/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Completed 1/ })).toBeInTheDocument()
    expect(screen.getByText('38%')).toBeInTheDocument()
    expect(screen.getByText('184')).toBeInTheDocument()
    expect(screen.getByText('Free display materials')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Activate Opportunity' }))

    expect(screen.getByText('Opportunity activated')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Coca-Cola + Doritos' })).toBeInTheDocument()
    await user.click(screen.getByRole('tab', { name: /Completed 1/ }))
    expect(screen.getByText('Fanta Orange 500ml')).toBeInTheDocument()
    expect(screen.getByText('Measured value: ₼38.40')).toBeInTheDocument()
    expect(activateRetailerOffer).not.toHaveBeenCalled()
  })

  it('leads with the current store operating state in a compact modular grid', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)

    await signIn(user)

    expect(fetchRetailerOverview).toHaveBeenCalledWith(expect.objectContaining({
      username: 'scan-retailer', password: 'retailer-secret',
    }))
    expect(screen.getByText('Sales today')).toBeInTheDocument()
    expect(screen.getByText('Transactions')).toBeInTheDocument()
    expect(screen.getByText('Average basket')).toBeInTheDocument()
    expect(screen.getByText('Store pulse')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Detected changes' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Store activity' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Coca-Cola Zero 330ml' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Sales movement' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Top products' })).toBeInTheDocument()
  })

  it('activates an offer with a loading state then a success checkmark, in place', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    let resolveActivation
    activateRetailerOffer.mockReturnValue(new Promise((resolve) => { resolveActivation = resolve }))
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Opportunities' })[0])
    expect(await screen.findByRole('heading', { name: 'Opportunities' })).toBeInTheDocument()
    expect(screen.getByText(/Order 3 cases/)).toBeInTheDocument()
    expect(screen.getByText('Volume offer')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Activate' }))
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

    await user.click(screen.getAllByRole('button', { name: 'Opportunities' })[0])
    await user.click(await screen.findByRole('button', { name: 'Activate' }))

    expect(await screen.findByText('This offer is no longer available. Refresh to see current offers.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Activate' })).toBeEnabled()
  })

  it('shows why a retailer is seeing an offer only when asked', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)
    await user.click(screen.getAllByRole('button', { name: 'Opportunities' })[0])

    expect(screen.queryByText(/It was purchased in 80 separate baskets/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Why this?' }))
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

    expect(screen.getByText('No opportunity yet')).toBeInTheDocument()
    expect(screen.getByText('0 opportunities')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Actions' })[0])
    expect(await screen.findByText('No open actions')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Partner' })[0])
    expect(await screen.findByText('No benefit history yet')).toBeInTheDocument()
    expect(screen.getByText('Silver')).toBeInTheDocument()
    // Silver already includes personalized offers - there is no contradiction with Offers
    // already showing real offers for this same, Silver-level store.
    expect(screen.getByText('Standard personalized offers')).toBeInTheDocument()
  })

  it('shows recommended actions with their supporting metric', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Actions' })[0])
    expect(await screen.findByText('Coca-Cola 500ml is selling 34% faster than usual')).toBeInTheDocument()
    expect(screen.getByText('24.3 units/day')).toBeInTheDocument()
    expect(screen.getByText('Consider adding stock to your next order and checking shelf availability.')).toBeInTheDocument()
    expect(screen.getByText('Stock risk')).toBeInTheDocument()
    expect(screen.getByText('CCI portfolio')).toBeInTheDocument()
  })

  it('presents actions as a compact operating workflow for the presentation account', async () => {
    const user = userEvent.setup()
    render(<RetailerDashboard />)
    await user.click(screen.getByRole('button', { name: /Open presentation account/ }))
    await screen.findByText('4 things deserve attention today.')
    await user.click(screen.getAllByRole('button', { name: 'Actions' })[0])

    expect(await screen.findByRole('heading', { name: 'Actions' })).toBeInTheDocument()
    expect(screen.getByText('What happened, why it matters, and what you can do.')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Open 3/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: /In progress 2/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Completed 8/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /Dismissed 1/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Coca-Cola Zero velocity is unusually high' })).toBeInTheDocument()
    expect(screen.getByText('+23%')).toBeInTheDocument()
    expect(screen.getByText('184 high-fit baskets purchased Coca-Cola without Doritos.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Action summary' })).toBeInTheDocument()
    expect(screen.getByText('+6 pts attachment')).toBeInTheDocument()
    expect(screen.getByText('Observed after action')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Why this?' })[0])
    expect(screen.getByText(/three consecutive trading days/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add to order list' }))
    expect(screen.getByRole('button', { name: 'Added' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: /In progress 2/ }))
    expect(await screen.findByRole('heading', { name: 'Weekend checkout placement test' })).toBeInTheDocument()
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: /Completed 8/ }))
    expect(await screen.findByRole('heading', { name: 'Doritos checkout placement completed' })).toBeInTheDocument()
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0)
  })

  it('surfaces a failed checkout feed in Store Pulse', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue({
      ...overview,
      sync: { ...overview.sync, state: 'FAILED', errors: ['The latest file could not be imported.'], completedAt: null },
    })
    render(<RetailerDashboard />)
    await signIn(user)

    expect(await screen.findByText('Needs attention')).toBeInTheDocument()
    expect(screen.getByText('1 item needs attention')).toBeInTheDocument()
  })

  it('shows Partner standing based on participation requirements, not purchase volume', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Partner' })[0])
    expect(await screen.findByRole('heading', { name: 'SCAN Partner' })).toBeInTheDocument()
    expect(screen.getByText('72% to Platinum')).toBeInTheDocument()
    expect(screen.getByText(/8 days until Platinum eligibility/)).toBeInTheDocument()
    expect(screen.getByText('30+ days active')).toBeInTheDocument()
    expect(screen.getByText('94%')).toBeInTheDocument()
    // Gold unlocks enhancements - it does not gate offers that Silver already has.
    expect(screen.getByText('Enhanced personalized offers')).toBeInTheDocument()
    expect(screen.getByText('Coca-Cola Zero Partner Offer')).toBeInTheDocument()
  })

  it('keeps the secondary Insights page reachable with the underlying sales and product detail', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Insights' })[0])
    expect(await screen.findByRole('heading', { name: 'Store insights' })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Daily retailer sales/ })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Best-selling products' })).toBeInTheDocument()
    expect(screen.getAllByText('Coca-Cola 500ml').length).toBeGreaterThan(0)

    await user.selectOptions(screen.getByLabelText('Period'), 'LAST_7_DAYS')
    await waitFor(() => expect(fetchRetailerOverview).toHaveBeenCalledWith(expect.objectContaining({ period: 'LAST_7_DAYS' })))
  })

  it('makes connection evidence available in the retailer workspace', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Data' })[0])
    expect(await screen.findByRole('heading', { name: 'Data' })).toBeInTheDocument()
    expect(screen.getAllByText('transactions.csv').length).toBeGreaterThan(0)
    expect(screen.getByRole('heading', { name: 'Import POS data' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Recent Imports' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Open secure import/ })).toHaveAttribute('href', '/?portal=connection')
  })

  it('turns a presentation upload into a compact processing and completion workflow', async () => {
    const user = userEvent.setup()
    render(<RetailerDashboard />)
    await user.click(screen.getByRole('button', { name: /Open presentation account/ }))
    await screen.findByText('4 things deserve attention today.')
    await user.click(screen.getAllByRole('button', { name: 'Data' })[0])

    expect(await screen.findByRole('heading', { name: 'Data' })).toBeInTheDocument()
    expect(screen.getByText('2,768')).toBeInTheDocument()
    expect(screen.getAllByText('97.4%').length).toBeGreaterThan(0)
    expect(screen.getByText('413')).toBeInTheDocument()
    expect(screen.getByText('nargiz_13_oct.xlsx')).toBeInTheDocument()
    expect(screen.getByText('Missing barcodes')).toBeInTheDocument()
    expect(screen.getByText('CCI products')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Upload export/ }))
    expect(screen.getByRole('heading', { name: 'Turning receipts into store intelligence' })).toBeInTheDocument()
    expect(screen.getByText('Build baskets')).toBeInTheDocument()
    expect(await screen.findByText('Import complete', {}, { timeout: 4000 })).toBeInTheDocument()
    expect(screen.getAllByText('1,832').length).toBeGreaterThan(0)
    expect(screen.getByText(/insights updated/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /View new action/ }))
    expect(await screen.findByRole('heading', { name: 'Actions' })).toBeInTheDocument()
  })

  it('opens SCAN Intelligence globally and renders answers as structured reports', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Ask SCAN' })[0])
    expect(await screen.findByRole('dialog', { name: 'SCAN Intelligence' })).toBeInTheDocument()
    expect(screen.getByText('Live store model')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: '3 things stand out' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Ask about this store' })).toHaveFocus())

    await user.click(screen.getByRole('button', { name: 'What changed today?' }))
    expect(screen.getByRole('heading', { name: 'What changed today?' })).toBeInTheDocument()
    expect(screen.getByText(/Three material changes/)).toBeInTheDocument()
    expect(screen.getAllByText('31% → 24%').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: /Review priority action/ })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'SCAN Intelligence' })).not.toBeInTheDocument()
  })

  it('opens context-aware intelligence from an action', async () => {
    const user = userEvent.setup()
    render(<RetailerDashboard />)
    await user.click(screen.getByRole('button', { name: /Open presentation account/ }))
    await screen.findByText('4 things deserve attention today.')
    await user.click(screen.getAllByRole('button', { name: 'Actions' })[0])
    await user.click(screen.getByRole('button', { name: /Ask SCAN about Coca-Cola Zero velocity/ }))

    expect(await screen.findByText('Current context')).toBeInTheDocument()
    expect(screen.getAllByText('Coca-Cola Zero velocity is unusually high').length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Why this action?' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'How urgent is it?' }))
    expect(screen.getByText('Action evidence')).toBeInTheDocument()
    expect(screen.getByText('21.3/day')).toBeInTheDocument()
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
    await screen.findByText('Sales today')
    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('button', { name: 'Open my dashboard' })).toBeInTheDocument()
  })

  it('resets to a still-selectable period after signing out and back in', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    await signIn(user)
    await user.click(screen.getAllByRole('button', { name: 'Insights' })[0])
    expect(await screen.findByRole('heading', { name: 'Store insights' })).toBeInTheDocument()
    // 'TODAY' was removed from the period picker - resetting to it on sign-out would leave the
    // <select> matching no <option>, showing nothing selected while still querying period=TODAY.
    expect(screen.getByLabelText('Period')).toHaveValue('LAST_30_DAYS')
  })
})
