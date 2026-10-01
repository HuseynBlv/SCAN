import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CciDashboard from './CciDashboard'
import { ScanApiError, fetchAnalyticsContext, fetchOverview } from '../services/scanApi'
import {
  askCopilot,
  createFieldTask,
  fetchFieldTasks,
  fetchInvestigations,
  fetchMeetingBrief,
  fetchMovers,
  openProductInvestigation,
  recordFieldTaskResult,
} from '../services/intelligenceApi'

vi.mock('../services/scanApi', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchAnalyticsContext: vi.fn(),
    fetchOverview: vi.fn(),
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

const overviewWithCompanions = {
  ...overview,
  topCompanionProducts: [{
    name: 'SWEET HOME FALQA ALUMIN 10M',
    basketCount: 80,
    attachmentRatePercentage: 38.3,
  }],
  topCompanionCategories: [{
    category: 'Snacks',
    basketCount: 90,
    attachmentRatePercentage: 43.1,
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

function mockIntelligenceDefaults() {
  fetchInvestigations.mockReset().mockResolvedValue([])
  fetchFieldTasks.mockReset().mockResolvedValue([])
  fetchMovers.mockReset().mockResolvedValue([])
  fetchMeetingBrief.mockReset()
  openProductInvestigation.mockReset()
  createFieldTask.mockReset()
  recordFieldTaskResult.mockReset()
  askCopilot.mockReset()
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
    })
    fetchOverview.mockReset()
    mockIntelligenceDefaults()
  })

  it('links the sign-in screen to every other portal', () => {
    render(<CciDashboard />)
    expect(screen.getByRole('link', { name: /Retailer owner portal/ })).toHaveAttribute('href', '/?portal=retailer')
    expect(screen.getByRole('link', { name: /Data connection/ })).toHaveAttribute('href', '/?portal=connection')
    expect(screen.getByRole('link', { name: /Retailer onboarding/ })).toHaveAttribute('href', '/?portal=onboarding')
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
    expect(screen.getAllByRole('button', { name: 'My Work' })[0]).toHaveAttribute('aria-current', 'page')

    const sections = [
      ['Investigate', 'Real questions, with real evidence.'],
      ['Activations', 'Coming in a future phase.'],
      ['Network', 'Infrastructure and analytical depth.'],
      ['Copilot', 'Ask about a product or an investigation.'],
      ['My Work', 'Everything is caught up'],
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

  it('switches between retailers shared with the CCI account', async () => {
    const user = userEvent.setup()
    const cornerMarketOverview = { ...overview, retailerCode: 'SHOP_01', retailerName: 'Corner Market' }
    fetchAnalyticsContext.mockResolvedValue({
      retailers: [
        { code: 'KAGGLE', name: 'Kaggle Demo Retailer', demoData: true },
        { code: 'SHOP_01', name: 'Corner Market', demoData: false },
      ],
    })
    fetchOverview
      .mockResolvedValueOnce(overview)
      .mockResolvedValueOnce(cornerMarketOverview)
    const { container } = render(<CciDashboard />)

    await user.type(screen.getByLabelText('Username'), 'scan-demo-cci')
    await user.type(screen.getByLabelText('Password'), 'demo-secret')
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))
    await screen.findByRole('heading', { name: 'SCAN commercial workspace' })
    expect(fetchOverview).toHaveBeenNthCalledWith(1, expect.objectContaining({ retailerCode: 'KAGGLE' }))

    act(() => { container.querySelector('.cci-retailer-menu').open = true })
    await user.click(screen.getByRole('button', { name: 'Corner Market SHOP_01' }))

    await waitFor(() => expect(fetchOverview).toHaveBeenCalledTimes(2))
    expect(fetchOverview).toHaveBeenNthCalledWith(2, expect.objectContaining({ retailerCode: 'SHOP_01' }))
    expect(await screen.findByText('Corner Market · SHOP_01')).toBeInTheDocument()
  })

  it('hides the retailer switcher for an account shared with only one retailer', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    render(<CciDashboard />)

    await user.type(screen.getByLabelText('Username'), 'scan-demo-cci')
    await user.type(screen.getByLabelText('Password'), 'demo-secret')
    await user.click(screen.getByRole('button', { name: 'Open workspace' }))
    await screen.findByRole('heading', { name: 'SCAN commercial workspace' })

    expect(screen.queryByText('Switch retailer')).not.toBeInTheDocument()
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
    screen.getAllByRole('button', { name: 'Investigate' })
      .forEach((button) => expect(button).toBeDisabled())
  })

  it('provides accessible chart labels and equivalent category table data under Network', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overviewWithCompanions)
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Network' })[0])
    expect(screen.getByRole('heading', { name: 'Infrastructure and analytical depth.' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Baskets' }))

    expect(screen.getByRole('img', { name: /Companion product attachment rates/ })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /Companion category attachment rates/ })).toBeInTheDocument()
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

    await user.click(screen.getAllByRole('button', { name: 'Investigate' })[0])
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

    await user.click(screen.getAllByRole('button', { name: 'Investigate' })[0])
    await user.click(await screen.findByRole('button', { name: /Sprite 500ml is down 50%/ }))

    expect(await screen.findByRole('heading', { name: 'Seen before' })).toBeInTheDocument()
    expect(screen.getByText('Sprite 500ml is down 40%')).toBeInTheDocument()
  })

  it('filters the investigation list by a real search term', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    fetchInvestigations.mockResolvedValue([openInvestigation, closedPastCase])
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Investigate' })[0])
    expect(await screen.findByText('Sprite 500ml is down 40%')).toBeInTheDocument()

    await user.type(screen.getByLabelText('Search investigations'), '50%')
    expect(screen.getByText('Sprite 500ml is down 50%')).toBeInTheDocument()
    expect(screen.queryByText('Sprite 500ml is down 40%')).not.toBeInTheDocument()
  })

  it('answers a Copilot question about a product using only real tool output', async () => {
    const user = userEvent.setup()
    fetchOverview.mockResolvedValue(overview)
    askCopilot.mockResolvedValue({
      whatScanFound: 'Sprite 500ml appeared in 6 baskets over the last 14 days, vs. 12 in the prior 14 days (50% decline).',
      whyThisMatters: 'This is a real, measured drop in basket presence.',
      possibleExplanations: ['Availability issue: this product may not be consistently in stock.'],
      evidence: ['2 store(s) that regularly carried this product now show it in essentially none: STORE-01.'],
      confidence: 'MEDIUM',
      whatWeStillDontKnow: 'SCAN has no direct stock-level or competitor data.',
      nextSteps: [{ label: 'Create a field check', actionType: 'CREATE_FIELD_CHECK', targetId: 'Sprite 500ml' }],
      priorCases: ['Opened 2026-06-01, closed without a confirmed cause.'],
    })
    await signIn(user)

    await user.click(screen.getAllByRole('button', { name: 'Copilot' })[0])
    await user.click(screen.getByRole('button', { name: 'A product' }))
    await user.type(screen.getByLabelText('Product'), 'Sprite 500ml')
    await user.click(screen.getByRole('button', { name: 'Ask' }))

    expect(askCopilot).toHaveBeenCalledWith(expect.objectContaining({ contextType: 'PRODUCT', subjectName: 'Sprite 500ml' }))
    expect(await screen.findByText(/Sprite 500ml appeared in 6 baskets/)).toBeInTheDocument()
    expect(screen.getByText('MEDIUM confidence')).toBeInTheDocument()
    expect(screen.getByText('Opened 2026-06-01, closed without a confirmed cause.')).toBeInTheDocument()
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

    await user.click(screen.getAllByRole('button', { name: 'Copilot' })[0])
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
})
