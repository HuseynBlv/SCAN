import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CciDashboard from './CciDashboard'
import { ScanApiError, fetchOverview } from '../services/scanApi'

vi.mock('../services/scanApi', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    fetchOverview: vi.fn(),
  }
})

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
  cciSkuPerformance: [],
  dayparts: [],
  weekdayWeekend: [],
  stores: [],
  insights: [{
    fact: 'A deterministic fact.',
    interpretation: 'A deterministic interpretation.',
    recommendedAction: 'Test one action.',
  }],
}

describe('CciDashboard', () => {
  beforeEach(() => {
    fetchOverview.mockReset()
  })

  it('signs in, shows loading, navigates all five sections, refreshes, and signs out', async () => {
    const user = userEvent.setup()
    let resolveFirstRequest
    fetchOverview
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveFirstRequest = resolve
      }))
      .mockResolvedValue(overview)
    render(<CciDashboard />)

    await user.type(screen.getByLabelText('Password'), 'demo-secret')
    await user.click(screen.getByRole('button', { name: 'Open analytics' }))

    expect(screen.getByRole('heading', { name: 'Loading retailer analytics…' })).toBeInTheDocument()
    expect(fetchOverview).toHaveBeenCalledWith(expect.objectContaining({
      retailerCode: 'KAGGLE',
      username: 'scan-cci',
      password: 'demo-secret',
    }))

    await act(async () => resolveFirstRequest(overview))
    expect(await screen.findByRole('heading', { name: 'Kaggle Demo Retailer' })).toBeInTheDocument()
    expect(screen.getByText('Technical demo dataset.')).toBeInTheDocument()

    const sections = [
      ['Basket Analysis', 'What appears alongside CCI products?'],
      ['Product Performance', 'Compare mapped CCI SKUs'],
      ['Time & Store', 'When and where baskets occur'],
      ['Recommendations', 'Actions supported by observed basket facts'],
      ['Overview', '1 thing to know'],
    ]
    for (const [buttonName, headingName] of sections) {
      await user.click(screen.getAllByRole('button', { name: buttonName })[0])
      expect(screen.getByRole('heading', { name: headingName })).toBeInTheDocument()
    }

    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    await waitFor(() => expect(fetchOverview).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Refresh' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(screen.getByRole('button', { name: 'Open analytics' })).toBeInTheDocument()
  })

  it('returns to sign-in with the API message after a 401', async () => {
    const user = userEvent.setup()
    fetchOverview.mockRejectedValue(
      new ScanApiError('The username or password is incorrect.', 401),
    )
    render(<CciDashboard />)

    await user.type(screen.getByLabelText('Password'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'Open analytics' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The username or password is incorrect.',
    )
    expect(screen.getByLabelText('Password')).toHaveValue('')
  })

  it('allows a fresh sign-in after signing out during a pending refresh', async () => {
    const user = userEvent.setup()
    let resolveRefresh
    fetchOverview
      .mockResolvedValueOnce(overview)
      .mockReturnValueOnce(new Promise((resolve) => {
        resolveRefresh = resolve
      }))
    render(<CciDashboard />)

    await user.type(screen.getByLabelText('Password'), 'demo-secret')
    await user.click(screen.getByRole('button', { name: 'Open analytics' }))
    await screen.findByRole('heading', { name: 'Kaggle Demo Retailer' })
    await user.click(screen.getByRole('button', { name: 'Refresh' }))
    expect(screen.getByRole('button', { name: 'Refreshing…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Sign out' }))

    expect(screen.getByRole('button', { name: 'Open analytics' })).toBeEnabled()
    expect(fetchOverview.mock.calls[1][0].signal.aborted).toBe(true)
    await act(async () => resolveRefresh(overview))
    expect(screen.queryByRole('heading', { name: 'Kaggle Demo Retailer' })).not.toBeInTheDocument()
  })

  it('clears displayed analytics when retailer permission is revoked', async () => {
    const user = userEvent.setup()
    fetchOverview
      .mockResolvedValueOnce(overview)
      .mockRejectedValueOnce(new ScanApiError('Retailer access denied.', 403))
    render(<CciDashboard />)

    await user.type(screen.getByLabelText('Password'), 'demo-secret')
    await user.click(screen.getByRole('button', { name: 'Open analytics' }))
    await screen.findByRole('heading', { name: 'Kaggle Demo Retailer' })
    await user.click(screen.getByRole('button', { name: 'Refresh' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Retailer access denied.')
    expect(screen.queryByRole('heading', { name: 'Kaggle Demo Retailer' })).not.toBeInTheDocument()
  })
})
