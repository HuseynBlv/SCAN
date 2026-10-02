import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CciDashboard from './CciDashboard'
import { ScanApiError, fetchAnalyticsContext, fetchOverview, setCommercialRole } from '../services/scanApi'
import {
  askCopilot,
  askNetworkCopilot,
  createActivation,
  createFieldTask,
  fetchActivations,
  fetchFieldTasks,
  fetchInvestigations,
  fetchMeetingBrief,
  fetchMovers,
  fetchNetworkBrief,
  fetchNetworkCategoryMovers,
  fetchNetworkOverview,
  fetchNetworkProductMovers,
  fetchNetworkStores,
  fetchNetworkTrend,
  fetchProductDetail,
  fetchStoreDetail,
  fetchWatchlist,
  fetchWatchlistChanges,
  followProduct,
  openProductInvestigation,
  recordFieldTaskResult,
  unfollowProduct,
} from '../services/intelligenceApi'

vi.mock('../services/scanApi', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchAnalyticsContext: vi.fn(),
    fetchOverview: vi.fn(),
    setCommercialRole: vi.fn(),
  }
})

vi.mock('../services/intelligenceApi', () => ({
  fetchInvestigations: vi.fn(),
  fetchInvestigation: vi.fn(),
  fetchFieldTasks: vi.fn(),
  fetchFieldTask: vi.fn(),
  fetchMovers: vi.fn(),
  fetchMeetingBrief: vi.fn(),
  openProductInvestigation: vi.fn(),
  openGeneralInvestigation: vi.fn(),
  addInvestigationNote: vi.fn(),
  addInvestigationHypothesis: vi.fn(),
  confirmHypothesis: vi.fn(),
  rejectHypothesis: vi.fn(),
  closeInvestigation: vi.fn(),
  reopenInvestigation: vi.fn(),
  createFieldTask: vi.fn(),
  recordFieldTaskResult: vi.fn(),
  askCopilot: vi.fn(),
  askNetworkCopilot: vi.fn(),
  fetchWatchlist: vi.fn(),
  followProduct: vi.fn(),
  unfollowProduct: vi.fn(),
  fetchWatchlistChanges: vi.fn(),
  fetchActivations: vi.fn(),
  fetchActivation: vi.fn(),
  createActivation: vi.fn(),
  fetchNetworkOverview: vi.fn(),
  fetchNetworkStores: vi.fn(),
  fetchNetworkProductMovers: vi.fn(),
  fetchNetworkCategoryMovers: vi.fn(),
  fetchNetworkBrief: vi.fn(),
  fetchNetworkTrend: vi.fn(),
  fetchStoreDetail: vi.fn(),
  fetchProductDetail: vi.fn(),
}))

const overview = {
  generatedAt: '2026-08-25T10:00:00Z',
  retailerCode: 'KAGGLE',
  retailerName: 'Kaggle Demo Retailer',
  totalBaskets: 10000,
  cciBaskets: 209,
  cciPenetrationPercentage: 2.1,
  averageBasketValue: 31.52,
  currency: 'AZN',
  mappedLinePercentage: 100,
  topCompanionProducts: [],
  topCompanionCategories: [],
  cciSkuPerformance: [{ product: 'Sprite 500ml', productId: 'p1', basketCount: 40, quantity: 40, revenue: 100 }],
  dayparts: [],
  weekdayWeekend: [],
  stores: [{ storeId: 'STORE-01', basketCount: 100, cciBasketCount: 10, cciPenetrationPercentage: 10, averageBasketValue: 12 }],
  insights: [{
    fact: 'A deterministic fact.',
    interpretation: 'A deterministic interpretation.',
    recommendedAction: 'Test one action.',
  }],
}

const openInvestigation = {
  id: 'inv-1',
  title: 'Sprite 500ml is down 50%',
  question: 'What changed for Sprite 500ml?',
  subjectType: 'PRODUCT',
  subjectName: 'Sprite 500ml',
  periodDays: 14,
  status: 'IN_PROGRESS',
  ownerLabel: 'Commercial Team',
  createdBy: 'scan-demo-cci',
  createdAt: '2026-08-20T10:00:00Z',
  updatedAt: '2026-08-24T10:00:00Z',
  closedAt: null,
  hypotheses: [{
    id: 'hyp-1',
    statement: 'Availability issue: this product may not be consistently in stock.',
    supportingEvidence: 'Basket presence dropped to near zero in Store A.',
    contradictingEvidence: null,
    confidence: 'MEDIUM',
    status: 'OPEN',
    createdAt: '2026-08-20T10:00:00Z',
  }],
  notes: [{ id: 'note-1', authorUsername: 'SCAN', body: 'Sprite 500ml appeared in 6 baskets vs. 12 before.', system: true, createdAt: '2026-08-20T10:00:00Z' }],
}

const closedPastCase = {
  id: 'inv-0',
  title: 'Sprite 500ml is down 40%',
  question: 'What changed for Sprite 500ml?',
  subjectType: 'PRODUCT',
  subjectName: 'Sprite 500ml',
  periodDays: 14,
  status: 'CLOSED',
  ownerLabel: 'Commercial Team',
  createdBy: 'scan-demo-cci',
  createdAt: '2026-06-01T10:00:00Z',
  updatedAt: '2026-06-05T10:00:00Z',
  closedAt: '2026-06-05T10:00:00Z',
  hypotheses: [],
  notes: [],
}

const mover = { productName: 'Sprite 500ml', category: 'Beverages', recentBaskets: 6, priorBaskets: 12, basketChangePct: -50 }

const networkOverview = {
  periodDays: 30, storesReporting: 2, totalBaskets: 200, cciBaskets: 20,
  cciPenetrationPct: 10, priorCciPenetrationPct: 10, penetrationPointChange: 0,
  dataCoveragePct: 95, generatedAt: '2026-08-25T10:00:00Z',
}

function mockIntelligenceDefaults() {
  fetchInvestigations.mockReset().mockResolvedValue([])
  fetchFieldTasks.mockReset().mockResolvedValue([])
  fetchMovers.mockReset().mockResolvedValue([])
  fetchMeetingBrief.mockReset()
  openProductInvestigation.mockReset()
  createFieldTask.mockReset()
  recordFieldTaskResult.mockReset()
  askCopilot.mockReset()
  askNetworkCopilot.mockReset()
  fetchWatchlist.mockReset().mockResolvedValue([])
  fetchWatchlistChanges.mockReset().mockResolvedValue([])
  followProduct.mockReset()
  unfollowProduct.mockReset()
  fetchActivations.mockReset().mockResolvedValue([])
  createActivation.mockReset()
  fetchNetworkOverview.mockReset().mockResolvedValue(networkOverview)
  fetchNetworkStores.mockReset().mockResolvedValue([])
  fetchNetworkProductMovers.mockReset().mockResolvedValue([])
  fetchNetworkCategoryMovers.mockReset().mockResolvedValue([])
  fetchNetworkBrief.mockReset().mockResolvedValue([])
  fetchNetworkTrend.mockReset().mockResolvedValue([])
  fetchStoreDetail.mockReset()
  fetchProductDetail.mockReset()
}

async function signIn(user) {
  render(<CciDashboard />)
  await user.type(screen.getByLabelText('Username'), 'scan-demo-cci')
  await user.type(screen.getByLabelText('Password'), 'demo-secret')
  await user.click(screen.getByRole('button', { name: 'Open workspace' }))
  return screen.findByRole('heading', { name: 'SCAN commercial workspace' })
}

describe('CciDashboard', () => {
  beforeEach(() => {
    fetchAnalyticsContext.mockReset().mockResolvedValue({
      retailers: [{ code: 'KAGGLE', name: 'Kaggle Demo Retailer', demoData: true }],
      commercialRole: 'COMMERCIAL',
    })
    fetchOverview.mockReset()
    setCommercialRole.mockReset().mockResolvedValue('FIELD_SALES')
    mockIntelligenceDefaults()
  })

  it('links the sign-in screen to every other portal', () => {
    render(<CciDashboard />)
    expect(screen.getByRole('link', { name: /Retailer owner portal/ })).toHaveAttribute('href', '/?portal=retailer')
    expect(screen.getByRole('link', { name: /Data connection/ })).toHaveAttribute('href', '/?portal=connection')
    expect(screen.getByRole('link', { name: /Retailer onboarding/ })).toHaveAttribute('href', '/?portal=onboarding')
  })

  it('renders the real daily trend on Overview and switches metric', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    fetchNetworkTrend.mockResolvedValue([
      { date: '2026-08-24', totalBaskets: 10, cciBaskets: 5, cciPenetrationPct: 50 },
      { date: '2026-08-25', totalBaskets: 10, cciBaskets: 2, cciPenetrationPct: 20 },
    ])
    await signIn(user)

    expect(await screen.findByRole('img', { name: /CCI penetration trend/ })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'CCI baskets' }))
    expect(await screen.findByRole('img', { name: /CCI baskets trend/ })).toBeInTheDocument()
  })

  it('signs in, shows loading, navigates every section, refreshes, and signs out', async () => {
    const user = userEvent.setup()
    let resolveFirstRequest
    fetchOverview
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirstRequest = resolve
      }))
      .mockResolvedValue(overview)
    render(<CciDashboard />)

    await user.type(screen.getByLabelText('Username'), 'scan-demo-cci')
    await user.type(screen.getByLabelText('Password'), 'demo-secret')
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))

    expect(screen.getByRole('heading', { name: 'Reading retailer evidence…' })).toBeInTheDocument()
    expect(fetchOverview).toHaveBeenCalledWith(expect.objectContaining({
      retailerCode: 'KAGGLE',
      username: 'scan-demo-cci',
      password: 'demo-secret',
    }))

    await act(async () => resolveFirstRequest(overview))
    expect(await screen.findByRole('heading', { name: 'SCAN commercial workspace' })).toBeInTheDocument()
    expect(screen.getByText('Demo data')).toBeInTheDocument()
    expect(screen.getByText(/not current CCI market evidence/)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Overview' })[0]).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('heading', { name: /Here.s what changed across your retail network/ })).toBeInTheDocument()

    const sections = [
      ['Insights', "What's changing across your network."],
      ['Stores', 'Every store in the network, ranked.'],
      ['Products', 'CCI product performance across the network.'],
      ['AI Assistant', 'Ask about a product or an investigation.'],
      ['Overview', /Here.s what changed across your retail network/],
    ]
    for (const [buttonName, headingName] of sections) {
      await user.click(screen.getAllByRole('button', { name: buttonName })[0])
      expect(screen.getByRole('heading', { name: headingName })).toBeInTheDocument()
    }

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(fetchOverview).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('button', { name: 'Open workspace' })).toBeInTheDocument()
  })

  it('returns to sign-in with the API message after a 401', async () => {
    const user = userEvent.setup()
    fetchOverview.mockRejectedValue(
      new ScanApiError('The username or password is incorrect.', 401),
    )
    render(<CciDashboard />)

    await user.type(screen.getByLabelText('Username'), 'scan-demo-cci')
    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The username or password is incorrect.',
    )
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('drills from the Stores list into a real store detail and back', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    fetchNetworkStores.mockResolvedValue([
      { retailerCode: 'DEMO', externalStoreId: 'STORE-01', recentBaskets: 50, recentCciBaskets: 10, recentPenetrationPct: 20, priorBaskets: 50, priorCciBaskets: 15, priorPenetrationPct: 30, penetrationPointChange: -10, status: 'NEEDS_ATTENTION' },
    ])
    fetchStoreDetail.mockResolvedValue({
      retailerCode: 'DEMO', externalStoreId: 'STORE-01', storeName: 'Corner Market', periodDays: 30,
      recentBaskets: 50, recentCciBaskets: 10, recentPenetrationPct: 20, priorBaskets: 50, priorCciBaskets: 15,
      priorPenetrationPct: 30, penetrationPointChange: -10, status: 'NEEDS_ATTENTION',
      topProducts: [{ product: 'Sprite 500ml', category: 'Beverages', basketCount: 8, quantity: 8, revenue: 20 }],
      biggestChanges: [{ productName: 'Sprite 500ml', category: 'Beverages', recentBaskets: 8, priorBaskets: 15, basketChangePct: -46.7 }],
      topCompanionCategories: [{ label: 'Snacks', basketCount: 5 }],
      dataCoveragePct: 95, similarStores: [],
    })
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Stores' })[0])
    await user.click(await screen.findByRole('button', { name: 'STORE-01' }))

    expect(fetchStoreDetail).toHaveBeenCalledWith(expect.objectContaining({ retailerCode: 'DEMO', externalStoreId: 'STORE-01' }))
    expect(await screen.findByRole('heading', { name: 'Corner Market' })).toBeInTheDocument()
    expect(screen.getAllByText('Sprite 500ml').length).toBeGreaterThan(0)
    expect(screen.getByText('Snacks')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to stores' }))
    expect(await screen.findByRole('heading', { name: 'Every store in the network, ranked.' })).toBeInTheDocument()
  })

  it('compares two real stores side by side', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    fetchNetworkStores.mockResolvedValue([
      { retailerCode: 'DEMO', externalStoreId: 'STORE-01', recentBaskets: 50, recentCciBaskets: 10, recentPenetrationPct: 20, priorBaskets: 50, priorCciBaskets: 15, priorPenetrationPct: 30, penetrationPointChange: -10, status: 'NEEDS_ATTENTION' },
      { retailerCode: 'DEMO', externalStoreId: 'STORE-02', recentBaskets: 40, recentCciBaskets: 16, recentPenetrationPct: 40, priorBaskets: 40, priorCciBaskets: 12, priorPenetrationPct: 30, penetrationPointChange: 10, status: 'IMPROVING' },
    ])
    const storeDetails = {
      'STORE-01': {
        retailerCode: 'DEMO', externalStoreId: 'STORE-01', storeName: 'Corner Market', periodDays: 30,
        recentBaskets: 50, recentCciBaskets: 10, recentPenetrationPct: 20, priorBaskets: 50, priorCciBaskets: 15,
        priorPenetrationPct: 30, penetrationPointChange: -10, status: 'NEEDS_ATTENTION',
        topProducts: [], biggestChanges: [], topCompanionCategories: [], dataCoveragePct: 95, similarStores: [],
      },
      'STORE-02': {
        retailerCode: 'DEMO', externalStoreId: 'STORE-02', storeName: 'Riverside Shop', periodDays: 30,
        recentBaskets: 40, recentCciBaskets: 16, recentPenetrationPct: 40, priorBaskets: 40, priorCciBaskets: 12,
        priorPenetrationPct: 30, penetrationPointChange: 10, status: 'IMPROVING',
        topProducts: [], biggestChanges: [], topCompanionCategories: [], dataCoveragePct: 90, similarStores: [],
      },
    }
    fetchStoreDetail.mockImplementation(({ externalStoreId }) => Promise.resolve(storeDetails[externalStoreId]))
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Stores' })[0])
    await user.click(await screen.findByRole('button', { name: 'STORE-01' }))
    await screen.findByRole('heading', { name: 'Corner Market' })

    await user.click(screen.getByRole('button', { name: 'Compare this store' }))
    expect(await screen.findByRole('heading', { name: 'Choose a store' })).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: /STORE-02/ }))

    expect(fetchStoreDetail).toHaveBeenCalledWith(expect.objectContaining({ externalStoreId: 'STORE-02' }))
    expect(await screen.findByRole('heading', { name: 'Corner Market vs. Riverside Shop' })).toBeInTheDocument()
    expect(screen.getByText('-20pp')).toBeInTheDocument()
  })

  it('drills from the Products list into a real product detail with store distribution', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    fetchNetworkProductMovers.mockResolvedValue([
      { productName: 'Sprite 500ml', category: 'Beverages', recentBaskets: 20, priorBaskets: 30, basketChangePct: -33.3 },
    ])
    fetchProductDetail.mockResolvedValue({
      product: 'Sprite 500ml', category: 'Beverages', brand: 'The Coca-Cola Company', periodDays: 30,
      recentBaskets: 20, priorBaskets: 30, basketChangePct: -33.3, recentRevenue: 50, priorRevenue: 75,
      storeDistribution: [
        { retailerCode: 'DEMO', externalStoreId: 'STORE-01', recentBaskets: 20, priorBaskets: 30, basketChangePct: -33.3 },
      ],
      companionProducts: [], companionCategories: [],
      strongestDaypart: 'EVENING', strongestDaypartSharePct: 62.5,
    })
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Products' })[0])
    await user.click(await screen.findByRole('button', { name: 'Sprite 500ml' }))

    expect(fetchProductDetail).toHaveBeenCalledWith(expect.objectContaining({ product: 'Sprite 500ml' }))
    expect(await screen.findByRole('heading', { name: 'Sprite 500ml' })).toBeInTheDocument()
    expect(screen.getByText('Evening')).toBeInTheDocument()
    expect(screen.getByText('STORE-01')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Back to products' }))
    expect(await screen.findByRole('heading', { name: 'CCI product performance across the network.' })).toBeInTheDocument()
  })

  // The product redesign removes manual retailer switching entirely: the default experience
  // aggregates every retailer a CCI account can see, and a single store is a drill-down, not a
  // workspace-wide selection. This asserts that removal holds even when an account is granted
  // access to more than one retailer - the switcher must not reappear.
  it('never shows a retailer switcher, even for an account with access to multiple retailers', async () => {
    const user = userEvent.setup()
    fetchAnalyticsContext.mockResolvedValue({
      retailers: [
        { code: 'KAGGLE', name: 'Kaggle Demo Retailer', demoData: true },
        { code: 'SHOP_01', name: 'Corner Market', demoData: false },
      ],
      commercialRole: 'COMMERCIAL',
    })
    fetchOverview.mockResolvedValue(overview)
    const { container } = render(<CciDashboard />)

    await user.type(screen.getByLabelText('Username'), 'scan-demo-cci')
    await user.type(screen.getByLabelText('Password'), 'demo-secret')
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))
    await screen.findByRole('heading', { name: 'SCAN commercial workspace' })

    expect(screen.queryByText('Switch retailer')).not.toBeInTheDocument()
    expect(container.querySelector('.cci-retailer-menu')).not.toBeInTheDocument()
  })

  it('clears displayed analytics when retailer permission is revoked', async () => {
    const user = userEvent.setup()
    fetchOverview
      .mockResolvedValueOnce(overview)
      .mockRejectedValueOnce(new ScanApiError('Retailer access denied.', 403))
    render(<CciDashboard />)

    await user.type(screen.getByLabelText('Username'), 'scan-demo-cci')
    await user.type(screen.getByLabelText('Password'), 'demo-secret')
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))
    await screen.findByRole('heading', { name: 'SCAN commercial workspace' })
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Retailer access denied.')
    expect(screen.queryByRole('heading', { name: 'SCAN commercial workspace' })).not.toBeInTheDocument()
  })

  it('shows onboarding instead of derived intelligence when no baskets exist', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue({
      ...overview,
      totalBaskets: 0,
      cciBaskets: 0,
      cciPenetrationPercentage: 0,
      averageBasketValue: 0,
      mappedLinePercentage: 0,
      insights: [],
    })
    render(<CciDashboard />)

    await user.type(screen.getByLabelText('Username'), 'scan-demo-cci')
    await user.type(screen.getByLabelText('Password'), 'demo-secret')
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))

    expect(await screen.findByRole('heading', { name: 'No transaction data imported yet' }))
      .toBeInTheDocument()
    screen.getAllByRole('button', { name: 'Insights' })
      .forEach((button) => expect(button).toBeDisabled())
  })

  it('starts an investigation from a detected change in My Work and shows real evidence', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    fetchMovers.mockResolvedValue([mover])
    openProductInvestigation.mockResolvedValue(openInvestigation)
    fetchInvestigations.mockResolvedValueOnce([]).mockResolvedValue([openInvestigation])
    await signIn(user)

    const needsAttentionHeading = await screen.findByRole('heading', { name: /Sprite 500ml is down 50%/ })
    const card = needsAttentionHeading.closest('article')
    await user.click(within(card).getByRole('button', { name: 'Investigate' }))

    expect(openProductInvestigation).toHaveBeenCalledWith(expect.objectContaining({
      productName: 'Sprite 500ml', retailerCode: 'KAGGLE',
    }))
    expect(await screen.findByRole('heading', { name: 'Sprite 500ml is down 50%' })).toBeInTheDocument()
    expect(screen.getByText(/Availability issue/)).toBeInTheDocument()
    expect(screen.getByText('Basket presence dropped to near zero in Store A.')).toBeInTheDocument()
  })

  it('creates a field check from an investigation and records a real result', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    fetchInvestigations.mockResolvedValue([openInvestigation])
    const createdTask = {
      id: 'task-1', investigationId: 'inv-1', title: 'Check Sprite availability', reason: 'Basket presence dropped',
      assignedTo: 'Field Sales Team', dueAt: null, status: 'OPEN', createdBy: 'scan-demo-cci',
      createdAt: '2026-08-24T10:00:00Z', updatedAt: '2026-08-24T10:00:00Z',
      stores: [{ id: 's1', externalStoreId: 'STORE-01', completed: false }],
    }
    createFieldTask.mockResolvedValue(createdTask)
    fetchFieldTasks.mockResolvedValueOnce([]).mockResolvedValue([createdTask])
    recordFieldTaskResult.mockResolvedValue({ ...createdTask, status: 'COMPLETED', stores: [{ ...createdTask.stores[0], completed: true, hasIssue: true }] })
    await signIn(user)

    await user.click(await screen.findByRole('button', { name: /Sprite 500ml is down 50%/ }))
    await user.click(await screen.findByRole('button', { name: 'Create field check' }))
    await user.type(screen.getByLabelText('What should the field team check?'), 'Check Sprite availability')
    await user.type(screen.getByLabelText(/^Why/), 'Basket presence dropped')
    await user.click(screen.getByLabelText('STORE-01'))
    await user.click(screen.getByRole('button', { name: 'Create field check' }))

    expect(createFieldTask).toHaveBeenCalledWith(expect.objectContaining({
      investigationId: 'inv-1', title: 'Check Sprite availability', storeIds: ['STORE-01'],
    }))
    expect(await screen.findByRole('button', { name: 'Record result' })).toBeInTheDocument()
  })

  it('shows a real prior case for the same product in the Seen before panel', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    fetchInvestigations.mockResolvedValue([openInvestigation, closedPastCase])
    await signIn(user)

    await user.click(await screen.findByRole('button', { name: /Sprite 500ml is down 50%/ }))

    expect(await screen.findByRole('heading', { name: 'Seen before' })).toBeInTheDocument()
    expect(screen.getByText('Sprite 500ml is down 40%')).toBeInTheDocument()
  })

  it('filters the investigation list by a real search term', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    fetchInvestigations.mockResolvedValue([openInvestigation, closedPastCase])
    await signIn(user)

    // Reach the investigation list (with search) the way the redesign intends: investigation is
    // an action/detail, not a nav destination, so go in through a real investigation and back out.
    await user.click(await screen.findByRole('button', { name: /Sprite 500ml is down 50%/ }))
    await user.click(await screen.findByRole('button', { name: 'Back to investigations' }))
    expect(await screen.findByText('Sprite 500ml is down 40%')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Search investigations'), '50%')
    expect(screen.getByText('Sprite 500ml is down 50%')).toBeInTheDocument()
    expect(screen.queryByText('Sprite 500ml is down 40%')).not.toBeInTheDocument()
  })

  it('answers a Copilot question about a product network-wide, using only real tool output', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    askNetworkCopilot.mockResolvedValue({
      whatScanFound: 'Sprite 500ml appeared in 6 baskets over the last 14 days, vs. 12 in the prior 14 days (50% decline).',
      whyThisMatters: 'This is a real, measured drop in basket presence.',
      possibleExplanations: ['Availability issue: this product may not be consistently in stock.'],
      evidence: ['2 store(s) that regularly carried this product now show it in essentially none: DEMO/STORE-01.'],
      confidence: 'MEDIUM',
      whatWeStillDontKnow: 'SCAN has no direct stock-level or competitor data.',
      nextSteps: [{ label: 'Create a field check', actionType: 'CREATE_FIELD_CHECK', targetId: 'Sprite 500ml' }],
      priorCases: [],
    })
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'AI Assistant' })[0])
    await user.click(screen.getByRole('button', { name: 'A product' }))
    await user.type(screen.getByLabelText('Product'), 'Sprite 500ml')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(askNetworkCopilot).toHaveBeenCalledWith(expect.objectContaining({ contextType: 'PRODUCT', subjectName: 'Sprite 500ml' }))
    expect(askCopilot).not.toHaveBeenCalled()
    expect(await screen.findByText(/Sprite 500ml appeared in 6 baskets/)).toBeInTheDocument()
    expect(screen.getByText('MEDIUM confidence')).toBeInTheDocument()
    // Investigation history is not yet searchable network-wide, so a product-wide answer
    // honestly has no "Seen before" section rather than one scoped to a single retailer.
    expect(screen.queryByRole('heading', { name: 'Seen before' })).not.toBeInTheDocument()
  })

  it('shows exactly one input for Copilot and disables Ask until it is filled', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    const { container } = render(<CciDashboard />)
    await user.type(screen.getByLabelText('Username'), 'scan-demo-cci')
    await user.type(screen.getByLabelText('Password'), 'demo-secret')
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))
    await screen.findByRole('heading', { name: 'SCAN commercial workspace' })
    const formControls = () => container.querySelectorAll('.cci-copilot-form input, .cci-copilot-form select')

    await user.click(screen.getAllByRole('button', { name: 'AI Assistant' })[0])
    expect(screen.getByRole('button', { name: 'Ask' })).toBeEnabled()
    expect(formControls()).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'A product' }))
    expect(formControls()).toHaveLength(1)
    expect(screen.getByLabelText('Product')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Ask' })).toBeDisabled()

    await user.click(screen.getByRole('button', { name: 'An investigation' }))
    expect(formControls()).toHaveLength(1)
    expect(screen.getByLabelText('Investigation')).toBeInTheDocument()
  })

  it('prepares a real meeting brief from My Work', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    fetchMeetingBrief.mockResolvedValue({
      template: 'WEEKLY_SALES_REVIEW',
      periodDays: 7,
      networkSummary: 'CCI products appeared in 2.1% of baskets over the last 7 days.',
      issuesRequiringDecision: [],
      fieldExecution: ['No field checks were created or completed in this window.'],
      completedActions: [],
      topOpportunities: [],
      risks: [],
      limitations: 'This prototype does not yet track trade activations.',
    })
    await signIn(user)

    await user.click(screen.getByRole('button', { name: 'Prepare' }))

    expect(fetchMeetingBrief).toHaveBeenCalledWith(expect.objectContaining({ template: 'WEEKLY_SALES_REVIEW' }))
    expect(await screen.findByText(/CCI products appeared in 2.1% of baskets/)).toBeInTheDocument()
  })

  it('follows a product from My Work and shows its real current numbers, regardless of size', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    const watched = { id: 'watch-1', productName: 'Sprite 500ml', addedBy: 'scan-demo-cci', createdAt: '2026-08-20T10:00:00Z' }
    followProduct.mockResolvedValue(watched)
    fetchWatchlist.mockResolvedValueOnce([]).mockResolvedValue([watched])
    fetchWatchlistChanges.mockResolvedValueOnce([]).mockResolvedValue([
      { productName: 'Sprite 500ml', category: null, recentBaskets: 1, priorBaskets: 2, basketChangePct: -50 },
    ])
    await signIn(user)

    expect(await screen.findByText('Not watching anything yet')).toBeInTheDocument()
    await user.type(screen.getByLabelText('Follow a product'), 'Sprite 500ml')
    await user.click(screen.getByRole('button', { name: 'Follow' }))

    expect(followProduct).toHaveBeenCalledWith(expect.objectContaining({ productName: 'Sprite 500ml' }))
    expect(await screen.findByText(/1 baskets recently vs\. 2 before/)).toBeInTheDocument()

    unfollowProduct.mockResolvedValue(null)
    fetchWatchlist.mockResolvedValue([])
    fetchWatchlistChanges.mockResolvedValue([])
    await user.click(screen.getByRole('button', { name: 'Unfollow' }))

    expect(unfollowProduct).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'watch-1' }))
    expect(await screen.findByText('Not watching anything yet')).toBeInTheDocument()
  })

  // Activations has no UI entry point in this redesign on purpose: the nav no longer exposes it,
  // and nothing yet links to it from Overview/Insights/Products. Per the redesign spec, it stays
  // out of the UI until a real end-to-end test-vs-control workflow exists - the component, its
  // actions, and the backend remain in place (and backend-tested) for when that happens.

  it('reorders My Work to show field checks first after switching to the Field Sales role', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    const openTask = {
      id: 'task-1', investigationId: null, title: 'Check Sprite availability', reason: 'Basket presence dropped',
      assignedTo: 'Field Sales Team', dueAt: null, status: 'OPEN', createdBy: 'scan-demo-cci',
      createdAt: '2026-08-24T10:00:00Z', updatedAt: '2026-08-24T10:00:00Z',
      stores: [{ id: 's1', externalStoreId: 'STORE-01', completed: false }],
    }
    fetchFieldTasks.mockResolvedValue([openTask])
    const { container } = render(<CciDashboard />)
    await user.type(screen.getByLabelText('Username'), 'scan-demo-cci')
    await user.type(screen.getByLabelText('Password'), 'demo-secret')
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))
    await screen.findByRole('heading', { name: 'SCAN commercial workspace' })

    expect(screen.queryByRole('heading', { name: 'Field checks waiting on you' })).not.toBeInTheDocument()

    act(() => { container.querySelector('.cci-user-menu').open = true })
    await user.selectOptions(screen.getByLabelText('I am'), 'FIELD_SALES')

    expect(setCommercialRole).toHaveBeenCalledWith(expect.objectContaining({ commercialRole: 'FIELD_SALES' }))
    const heading = await screen.findByRole('heading', { name: 'Field checks waiting on you' })
    expect(heading.compareDocumentPosition(screen.getByRole('heading', { name: 'Needs attention' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
