import { ScanApiError, apiUrl, basicAuthorization, errorMessage } from './scanApi'

function invalid(field) {
  throw new ScanApiError(`SCAN API returned an invalid onboarding field: ${field}.`)
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field)
  return value
}

function string(value, field) {
  if (typeof value !== 'string' || !value.trim()) invalid(field)
  return value
}

function nullableTimestamp(value, field) {
  if (value == null) return null
  const result = string(value, field)
  if (Number.isNaN(Date.parse(result))) invalid(field)
  return result
}

function bool(value, field) {
  if (typeof value !== 'boolean') invalid(field)
  return value
}

function count(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) invalid(field)
  return value
}

function array(value, field, normalize) {
  if (!Array.isArray(value)) invalid(field)
  return value.map((item, index) => normalize(item, `${field}[${index}]`))
}

function normalizeStore(value, field = 'store') {
  const data = object(value, field)
  return {
    id: string(data.id, `${field}.id`),
    externalStoreId: string(data.externalStoreId, `${field}.externalStoreId`),
    name: string(data.name, `${field}.name`),
  }
}

function normalizeProfile(value, field = 'profile') {
  const data = object(value, field)
  if (!['DRAFT', 'VALIDATED'].includes(data.validationStatus)) invalid(`${field}.validationStatus`)
  return {
    id: string(data.id, `${field}.id`),
    code: string(data.code, `${field}.code`),
    name: string(data.name, `${field}.name`),
    sourceSystem: string(data.sourceSystem, `${field}.sourceSystem`),
    validationStatus: data.validationStatus,
    validatedAt: nullableTimestamp(data.validatedAt, `${field}.validatedAt`),
  }
}

function normalizeRetailer(value, field = 'retailer') {
  const data = object(value, field)
  return {
    id: string(data.id, `${field}.id`),
    code: string(data.code, `${field}.code`),
    name: string(data.name, `${field}.name`),
    zoneId: string(data.zoneId, `${field}.zoneId`),
    importEnabled: bool(data.importEnabled, `${field}.importEnabled`),
    credentialsIssued: bool(data.credentialsIssued, `${field}.credentialsIssued`),
    stores: array(data.stores, `${field}.stores`, normalizeStore),
    importProfiles: array(data.importProfiles, `${field}.importProfiles`, normalizeProfile),
  }
}

function normalizeCredential(value, field = 'credential') {
  const data = object(value, field)
  return {
    id: string(data.id, `${field}.id`),
    purpose: string(data.purpose, `${field}.purpose`),
    username: string(data.username, `${field}.username`),
    role: string(data.role, `${field}.role`),
    enabled: bool(data.enabled, `${field}.enabled`),
    createdAt: nullableTimestamp(data.createdAt, `${field}.createdAt`),
    lastRotatedAt: nullableTimestamp(data.lastRotatedAt, `${field}.lastRotatedAt`),
    revokedAt: nullableTimestamp(data.revokedAt, `${field}.revokedAt`),
  }
}

async function request(path, { username, password, signal, ...options }) {
  let response
  try {
    response = await fetch(apiUrl(path), {
      ...options,
      signal,
      headers: {
        Accept: 'application/json',
        Authorization: basicAuthorization(username, password),
        ...options.headers,
      },
    })
  } catch (error) {
    if (error?.name === 'AbortError' || error instanceof ScanApiError) throw error
    throw new ScanApiError('Cannot reach the SCAN onboarding service.')
  }
  if (!response.ok) throw new ScanApiError(await errorMessage(response), response.status)
  return response.json()
}

export async function fetchOnboardingContext(credentials) {
  const data = object(await request('/api/v1/onboarding/context', credentials), 'context')
  return { operatorUsername: string(data.operatorUsername, 'operatorUsername') }
}

export async function fetchOnboardingRetailers(credentials) {
  const data = await request('/api/v1/onboarding/retailers', credentials)
  return array(data, 'retailers', normalizeRetailer)
}

export async function createOnboardingRetailer({ request: body, ...credentials }) {
  return normalizeRetailer(await request('/api/v1/onboarding/retailers', {
    ...credentials,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

export async function addOnboardingStore({ retailerId, request: body, ...credentials }) {
  return normalizeStore(await request(`/api/v1/onboarding/retailers/${encodeURIComponent(retailerId)}/stores`, {
    ...credentials,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

export async function createOnboardingProfile({ retailerId, request: body, ...credentials }) {
  return normalizeProfile(await request(`/api/v1/onboarding/retailers/${encodeURIComponent(retailerId)}/import-formats`, {
    ...credentials,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
}

export async function validateOnboardingSample({ retailerId, profileId, file, ...credentials }) {
  const form = new FormData()
  form.append('file', file)
  const data = object(await request(
    `/api/v1/onboarding/retailers/${encodeURIComponent(retailerId)}/import-formats/${encodeURIComponent(profileId)}/sample-validation`,
    { ...credentials, method: 'POST', body: form },
  ), 'sampleValidation')
  return {
    valid: bool(data.valid, 'valid'),
    filename: string(data.filename, 'filename'),
    rowsChecked: count(data.rowsChecked, 'rowsChecked'),
    receiptsDetected: count(data.receiptsDetected, 'receiptsDetected'),
    productLines: count(data.productLines, 'productLines'),
    detectedColumns: array(data.detectedColumns, 'detectedColumns', string),
    detectedStoreIds: array(data.detectedStoreIds, 'detectedStoreIds', string),
    errors: array(data.errors, 'errors', string),
    validatedAt: nullableTimestamp(data.validatedAt, 'validatedAt'),
  }
}

export async function issueOnboardingCredentials({ retailerId, profileId, ...credentials }) {
  const data = object(await request(
    `/api/v1/onboarding/retailers/${encodeURIComponent(retailerId)}/import-formats/${encodeURIComponent(profileId)}/credentials`,
    { ...credentials, method: 'POST' },
  ), 'credentials')
  return {
    retailerCode: string(data.retailerCode, 'retailerCode'),
    profileName: string(data.profileName, 'profileName'),
    issuedAt: string(data.issuedAt, 'issuedAt'),
    credentials: array(data.credentials, 'credentials', (item, field) => {
      const credential = object(item, field)
      return {
        purpose: string(credential.purpose, `${field}.purpose`),
        username: string(credential.username, `${field}.username`),
        password: string(credential.password, `${field}.password`),
      }
    }),
  }
}

export async function fetchOnboardingCredentials({ retailerId, ...credentials }) {
  return array(await request(
    `/api/v1/onboarding/retailers/${encodeURIComponent(retailerId)}/credentials`, credentials,
  ), 'credentials', normalizeCredential)
}

export async function rotateOnboardingCredential({ retailerId, accountId, ...credentials }) {
  const data = object(await request(
    `/api/v1/onboarding/retailers/${encodeURIComponent(retailerId)}/credentials/${encodeURIComponent(accountId)}/rotate`,
    { ...credentials, method: 'POST' },
  ), 'rotatedCredential')
  return {
    credential: normalizeCredential(data.credential, 'credential'),
    password: string(data.password, 'password'),
  }
}

export async function revokeOnboardingCredential({ retailerId, accountId, ...credentials }) {
  return normalizeCredential(await request(
    `/api/v1/onboarding/retailers/${encodeURIComponent(retailerId)}/credentials/${encodeURIComponent(accountId)}`,
    { ...credentials, method: 'DELETE' },
  ))
}
