import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Onboarding from './Onboarding'
import {
  addOnboardingStore,
  createOnboardingProfile,
  createOnboardingRetailer,
  fetchOnboardingContext,
  fetchOnboardingCredentials,
  fetchOnboardingRetailers,
  issueOnboardingCredentials,
  revokeOnboardingCredential,
  rotateOnboardingCredential,
  validateOnboardingSample,
} from '../services/onboardingApi'

vi.mock('../services/onboardingApi', () => ({
  addOnboardingStore: vi.fn(),
  createOnboardingProfile: vi.fn(),
  createOnboardingRetailer: vi.fn(),
  fetchOnboardingContext: vi.fn(),
  fetchOnboardingCredentials: vi.fn(),
  fetchOnboardingRetailers: vi.fn(),
  issueOnboardingCredentials: vi.fn(),
  revokeOnboardingCredential: vi.fn(),
  rotateOnboardingCredential: vi.fn(),
  validateOnboardingSample: vi.fn(),
}))

const store = { id: 'store-1', externalStoreId: 'SHOP-01', name: 'Central store' }
const draftProfile = {
  id: 'profile-1', code: 'FORMAT_ABCD1234', name: 'Daily sales export',
  sourceSystem: 'Retailer Excel', validationStatus: 'DRAFT', validatedAt: null,
}
const retailer = {
  id: 'retailer-1', code: 'FRESH_MARKET_A1B2C3', name: 'Fresh Market', zoneId: 'Asia/Baku',
  importEnabled: false, credentialsIssued: false, stores: [store], importProfiles: [draftProfile],
}
const validatedRetailer = {
  ...retailer, importEnabled: true,
  importProfiles: [{ ...draftProfile, validationStatus: 'VALIDATED', validatedAt: '2026-09-17T12:00:00Z' }],
}

async function signIn(user) {
  await user.type(screen.getByLabelText('Onboarding username'), 'scan-onboarding')
  await user.type(screen.getByLabelText('Password'), 'operator-secret')
  await user.click(screen.getByRole('button', { name: 'Open retailer onboarding' }))
}

describe('Onboarding', () => {
  beforeEach(() => {
    fetchOnboardingContext.mockReset().mockResolvedValue({ operatorUsername: 'scan-onboarding' })
    fetchOnboardingRetailers.mockReset()
    createOnboardingRetailer.mockReset()
    createOnboardingProfile.mockReset()
    addOnboardingStore.mockReset()
    validateOnboardingSample.mockReset()
    issueOnboardingCredentials.mockReset()
    fetchOnboardingCredentials.mockReset().mockResolvedValue([])
    revokeOnboardingCredential.mockReset()
    rotateOnboardingCredential.mockReset()
  })

  it('creates an isolated retailer without asking for an internal tenant code', async () => {
    const user = userEvent.setup()
    fetchOnboardingRetailers.mockResolvedValue([])
    createOnboardingRetailer.mockResolvedValue({ ...retailer, importProfiles: [] })
    render(<Onboarding />)
    await signIn(user)

    expect(await screen.findByRole('heading', { name: 'Create the retailer' })).toBeInTheDocument()
    expect(screen.queryByLabelText(/retailer code/i)).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Retailer name'), 'Fresh Market')
    await user.type(screen.getByLabelText('First store name'), 'Central store')
    await user.type(screen.getByLabelText(/Store ID in the POS/), 'SHOP-01')
    await user.click(screen.getByRole('button', { name: 'Create retailer' }))

    expect(createOnboardingRetailer).toHaveBeenCalledWith(expect.objectContaining({
      request: expect.objectContaining({
        name: 'Fresh Market',
        stores: [{ name: 'Central store', externalStoreId: 'SHOP-01' }],
      }),
    }))
    expect(await screen.findByRole('heading', { name: 'Describe the sales export' })).toBeInTheDocument()
    expect(screen.getByText('FRESH_MARKET_A1B2C3 · Asia/Baku')).toBeInTheDocument()
  })

  it('validates a sample before issuing one-time retailer credentials', async () => {
    const user = userEvent.setup()
    fetchOnboardingRetailers
      .mockResolvedValueOnce([retailer])
      .mockResolvedValueOnce([validatedRetailer])
      .mockResolvedValueOnce([{ ...validatedRetailer, credentialsIssued: true }])
    validateOnboardingSample.mockResolvedValue({
      valid: true, filename: 'sample.csv', rowsChecked: 12, receiptsDetected: 5,
      productLines: 12, detectedColumns: Object.values({ store_id: 'store_id' }),
      detectedStoreIds: ['SHOP-01'], errors: [], validatedAt: '2026-09-17T12:00:00Z',
    })
    issueOnboardingCredentials.mockResolvedValue({
      retailerCode: retailer.code, profileName: draftProfile.name, issuedAt: '2026-09-17T12:01:00Z',
      credentials: [
        { purpose: 'Retailer workspace', username: 'fresh-owner', password: 'owner-secret' },
        { purpose: 'Data connection', username: 'fresh-admin', password: 'admin-secret' },
        { purpose: 'POS connector', username: 'fresh-connector', password: 'connector-secret' },
      ],
    })
    render(<Onboarding />)
    await signIn(user)

    expect(await screen.findByRole('heading', { name: 'Validate a sample export' })).toBeInTheDocument()
    const file = new File(['headers\nvalues'], 'sample.csv', { type: 'text/csv' })
    await user.upload(document.querySelector('input[type="file"]'), file)
    await user.click(screen.getByRole('button', { name: 'Validate sample' }))

    expect(await screen.findByText('Sample accepted')).toBeInTheDocument()
    expect(screen.getByText('5', { selector: 'dd' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue to access' }))
    expect(await screen.findByRole('heading', { name: 'Issue retailer access' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Issue credentials' }))

    expect(await screen.findByText('Copy these passwords now.')).toBeInTheDocument()
    expect(screen.getByText('fresh-owner')).toBeInTheDocument()
    expect(screen.getByText('connector-secret')).toBeInTheDocument()
  })

  it('lets the operator replace a draft format after sample validation fails', async () => {
    const user = userEvent.setup()
    fetchOnboardingRetailers.mockResolvedValue([retailer])
    validateOnboardingSample.mockResolvedValue({
      valid: false, filename: 'sample.csv', rowsChecked: 2, receiptsDetected: 0,
      productLines: 0, detectedColumns: ['Receipt No.'], detectedStoreIds: [],
      errors: ['store_id: required column is missing'], validatedAt: null,
    })
    render(<Onboarding />)
    await signIn(user)

    const file = new File(['Receipt No.\n1'], 'sample.csv', { type: 'text/csv' })
    await user.upload(document.querySelector('input[type="file"]'), file)
    await user.click(screen.getByRole('button', { name: 'Validate sample' }))

    expect(await screen.findByText('Sample needs correction')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Change import format' }))
    expect(await screen.findByRole('heading', { name: 'Describe the sales export' })).toBeInTheDocument()
    expect(screen.getByLabelText('Store ID')).toHaveValue('store_id')
  })
})
