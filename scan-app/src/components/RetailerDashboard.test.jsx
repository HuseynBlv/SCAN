import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import RetailerDashboard from './RetailerDashboard'
import { ScanApiError } from '../services/scanApi'
import {
  fetchRetailerActions,
  fetchRetailerOffers,
  fetchRetailerOpportunities,
  fetchRetailerOverview,
  fetchRetailerPartnerStatus,
  startRetailerOpportunityTrial,
} from '../services/retailerApi'

vi.mock('../services/retailerApi', () => ({
  fetchRetailerOverview: vi.fn(),
  fetchRetailerOffers: vi.fn(),
  fetchRetailerOpportunities: vi.fn(),
  startRetailerOpportunityTrial: vi.fn(),
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

function opportunity(overrides = {}) {
  return {
    id: 'opp-pair', storeId: 'STORE-01', type: 'CROSS_SELL', title: 'Coca-Cola 500ml + Chips',
    description: 'A recurring product relationship is strong enough to test in-store.',
    subjects: ['Coca-Cola 500ml', 'Chips'], priority: 'HIGH', status: 'DETECTED',
    metrics: { supportPercentage: 12, confidencePercentage: 50, lift: 2.1, productABaskets: 120, productBBaskets: 90, jointBaskets: 60 },
    primaryMetricLabel: 'Lift', primaryMetricValue: '2.1×',
    evidence: { receiptCount: 10000, supportingBasketCount: 60, dateFrom: '2026-08-01', dateTo: '2026-08-29', dataCompletenessPercentage: 100, observation: 'These products appeared together in 60 of 10,000 analyzed baskets.', whyItMatters: 'A lift of 2.1 means the pair occurred 2.1 times as often as expected if purchases were independent.', limitations: null },
    recommendedAction: { title: 'Start placement trial', description: 'Test placing the products closer together while SCAN compares against a baseline.', durationDays: 7 },
    trial: null, detectedAt: '2026-08-29T10:00:00Z', updatedAt: '2026-08-29T10:00:00Z', ...overrides,
  }
}

function opportunityAnalysis(overrides = {}) {
  return { summary: { analyzedAt: '2026-08-29T10:00:00Z', latestImportAt: '2026-08-29T10:00:00Z', datasetKind: 'DEMONSTRATION', coverageStatus: 'READY', receiptCount: 10000, mappingCoveragePercentage: 100, availableCount: 1, activeTrialCount: 0, completedTrialCount: 0 }, opportunities: [opportunity()], ...overrides }
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
    fetchRetailerOpportunities.mockReset()
    startRetailerOpportunityTrial.mockReset()
    fetchRetailerActions.mockReset()
    fetchRetailerPartnerStatus.mockReset()
    fetchRetailerOffers.mockResolvedValue(offers())
    fetchRetailerActions.mockResolvedValue([action()])
    fetchRetailerPartnerStatus.mockResolvedValue(partnerStatus())
    fetchRetailerOpportunities.mockResolvedValue(opportunityAnalysis())
  })

  it('links the sign-in screen to every other portal', () => {
    render(<RetailerDashboard />)
    expect(screen.getByRole('link', { name: 'Back to SCAN home' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: /CCI intelligence workspace/ })).toHaveAttribute('href', '/?portal=cci')
    expect(screen.getByRole('link', { name: /Data connection/ })).toHaveAttribute('href', '/?portal=connection')
    expect(screen.getByRole('link', { name: /Retailer onboarding/ })).toHaveAttribute('href', '/?portal=onboarding')
  })

  it('opens a presentation-ready account without calling the API', async () => {
    render(<RetailerDashboard />)

    fireEvent.click(screen.getByRole('button', { name: /Open presentation account/ }))
    expect(screen.getByRole('status')).toHaveTextContent('Loading presentation intelligence')

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

  it('accepts the presentation credentials and starts a measured placement trial', async () => {
    const user = userEvent.setup()
    render(<RetailerDashboard />)

    const username = screen.getByLabelText('Username')
    await user.clear(username)
    await user.type(username, 'scan-showcase')
    await user.type(screen.getByLabelText('Password'), 'Showcase2026!')
    await user.click(screen.getByRole('button', { name: 'Open my dashboard' }))
    await screen.findByText('4 things deserve attention today.')

    await user.click(screen.getAllByRole('button', { name: 'Opportunities' })[0])
    expect(await screen.findByRole('heading', { name: 'Growth Opportunities' })).toBeInTheDocument()
    expect(screen.getByText('Presentation dataset')).toBeInTheDocument()
    expect(screen.getAllByText('2.3×').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('button', { name: 'Start placement trial' }))
    await user.click(screen.getByRole('button', { name: 'Confirm trial' }))
    expect(await screen.findByRole('heading', { name: 'Active trial' })).toBeInTheDocument()
    expect(screen.getByText(/Presentation-mode trial/)).toBeInTheDocument()
    expect(startRetailerOpportunityTrial).not.toHaveBeenCalled()
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

  it('starts a persistent opportunity trial and shows its baseline', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    let resolveActivation
    startRetailerOpportunityTrial.mockReturnValue(new Promise((resolve) => { resolveActivation = resolve }))
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Opportunities' })[0])
    expect(await screen.findByRole('heading', { name: 'Growth Opportunities' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Start placement trial' }))
    await user.click(screen.getByRole('button', { name: 'Confirm trial' }))
    expect(screen.getByRole('button', { name: 'Starting trial…' })).toBeDisabled()
    const active = opportunity({ status: 'ACTIVE', trial: { id: 'trial-1', status: 'ACTIVE', startDate: '2026-10-23', endDate: '2026-10-29', baselineFrom: '2026-10-16', baselineTo: '2026-10-22', metric: 'JOINT_BASKET_RATE', baselineValue: 12, currentValue: null, currentNumerator: null, currentDenominator: null, measurementNote: 'Measurement starts on the selected date.' } })
    await act(async () => resolveActivation(active))
    expect(startRetailerOpportunityTrial).toHaveBeenCalledWith(expect.objectContaining({ opportunityId: 'opp-pair', durationDays: 7 }))
    expect(await screen.findByRole('heading', { name: 'Active trial' })).toBeInTheDocument()
    expect(screen.getByText('12%')).toBeInTheDocument()
  })

  it('surfaces why an opportunity trial could not be started', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    startRetailerOpportunityTrial.mockRejectedValue(new ScanApiError('This opportunity is no longer available. Refresh the analysis.', 400))
    render(<RetailerDashboard />)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Opportunities' })[0])
    await user.click(await screen.findByRole('button', { name: 'Start placement trial' }))
    await user.click(screen.getByRole('button', { name: 'Confirm trial' }))
    expect(await screen.findByText('This opportunity is no longer available. Refresh the analysis.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Confirm trial' })).toBeEnabled()
  })

  it('shows reproducible opportunity evidence only when asked', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    render(<RetailerDashboard />)
    await signIn(user)
    await user.click(screen.getAllByRole('button', { name: 'Opportunities' })[0])

    expect(screen.queryByText(/A lift of 2.1 means/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Why this?' }))
    expect(screen.getByText(/A lift of 2.1 means/)).toBeInTheDocument()
  })

  it('leaves offers, actions, and benefits empty for a retailer with no CCI sales yet', async () => {
    const user = userEvent.setup()
    fetchRetailerOverview.mockResolvedValue(overview)
    fetchRetailerOffers.mockResolvedValue(offers({ available: [] }))
    fetchRetailerOpportunities.mockResolvedValue(opportunityAnalysis({ summary: { ...opportunityAnalysis().summary, availableCount: 0 }, opportunities: [] }))
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
    expect(screen.getByRole('button', { name: 'Accepted' })).toBeDisabled()
    await user.click(screen.getByRole('tab', { name: /In progress 2/ }))
    expect(await screen.findByRole('heading', { name: 'Weekend checkout placement test' })).toBeInTheDocument()
    expect(screen.getAllByText('In progress').length).toBeGreaterThan(0)
    await user.click(screen.getByRole('tab', { name: /Completed 8/ }))
    expect(await screen.findByRole('heading', { name: 'Doritos checkout placement completed' })).toBeInTheDocument()
    expect(screen.getAllByText('Completed').length).toBeGreaterThan(0)
  })

  it('uses operational motion states for refresh and action completion', async () => {
    const user = userEvent.setup()
    render(<RetailerDashboard />)
    await user.click(screen.getByRole('button', { name: /Open presentation account/ }))
    await screen.findByText('4 things deserve attention today.')

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled()
    expect(await screen.findByText('New', {}, { timeout: 1200 })).toBeInTheDocument()
    expect(document.querySelector('.retailer-motion-state')).toHaveClass('is-updated')

    await user.click(screen.getAllByRole('button', { name: 'Actions' })[0])
    await user.click(screen.getByRole('button', { name: 'Add to order list' }))
    expect(screen.getByRole('button', { name: 'Accepted' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Mark checked' }))
    expect(screen.getByRole('status')).toHaveTextContent('Action completed')
    expect(await screen.findByRole('tab', { name: /Completed 9/, selected: true }, { timeout: 1200 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Coca-Cola Zero velocity is unusually high' })).toBeInTheDocument()
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
    expect(document.body).toHaveStyle({ overflow: 'hidden' })
    expect(document.documentElement).toHaveStyle({ overflow: 'hidden' })
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
    expect(document.body.style.overflow).toBe('')
    expect(document.documentElement.style.overflow).toBe('')
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
