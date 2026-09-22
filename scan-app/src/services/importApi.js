import {
  ScanApiError,
  apiUrl,
  basicAuthorization,
  errorMessage,
} from './scanApi'

const IMPORT_STATUSES = new Set(['RECEIVED', 'VALIDATING', 'IMPORTING', 'COMPLETED', 'FAILED'])

function invalid(field) {
  throw new ScanApiError(`SCAN API returned an invalid import field: ${field}.`)
}

function string(value, field) {
  if (typeof value !== 'string' || !value.trim()) invalid(field)
  return value
}

function nullableString(value, field) {
  if (value == null) return null
  return string(value, field)
}

function count(value, field) {
  if (!Number.isSafeInteger(value) || value < 0) invalid(field)
  return value
}

function number(value, field) {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(field)
  return value
}

function bool(value, field) {
  if (typeof value !== 'boolean') invalid(field)
  return value
}

function timestamp(value, field, nullable = false) {
  if (nullable && value == null) return null
  const result = string(value, field)
  if (Number.isNaN(Date.parse(result))) invalid(field)
  return result
}

function array(value, field, normalize) {
  if (!Array.isArray(value)) invalid(field)
  return value.map((item, index) => normalize(item, `${field}[${index}]`))
}

function object(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field)
  return value
}

export function normalizeImportJob(value) {
  const data = object(value, 'response')
  if (!IMPORT_STATUSES.has(data.status)) invalid('status')
  const createdAt = timestamp(data.createdAt, 'createdAt')
  return {
    id: string(data.id, 'id'),
    retailerCode: string(data.retailerCode, 'retailerCode'),
    profileCode: string(data.profileCode, 'profileCode'),
    filename: string(data.filename, 'filename'),
    status: data.status,
    duplicateFile: typeof data.duplicateFile === 'boolean' ? data.duplicateFile : invalid('duplicateFile'),
    attemptNumber: count(data.attemptNumber, 'attemptNumber'),
    totalRows: count(data.totalRows, 'totalRows'),
    importedReceipts: count(data.importedReceipts, 'importedReceipts'),
    importedLines: count(data.importedLines, 'importedLines'),
    duplicateReceipts: count(data.duplicateReceipts, 'duplicateReceipts'),
    unresolvedProducts: count(data.unresolvedProducts, 'unresolvedProducts'),
    errors: array(data.errors, 'errors', (item, field) => string(item, field)),
    submittedBy: data.submittedBy == null ? 'system' : string(data.submittedBy, 'submittedBy'),
    createdAt,
    startedAt: timestamp(data.startedAt, 'startedAt', true),
    updatedAt: data.updatedAt == null ? createdAt : timestamp(data.updatedAt, 'updatedAt'),
    completedAt: timestamp(data.completedAt, 'completedAt', true),
  }
}

export function normalizeImportContext(value) {
  const data = object(value, 'response')
  const mapping = object(data.mapping, 'mapping')
  return {
    retailerCode: string(data.retailerCode, 'retailerCode'),
    retailerName: string(data.retailerName, 'retailerName'),
    profileCode: string(data.profileCode, 'profileCode'),
    profileName: string(data.profileName, 'profileName'),
    sourceSystem: string(data.sourceSystem, 'sourceSystem'),
    importEnabled: bool(data.importEnabled, 'importEnabled'),
    sampleValidated: bool(data.sampleValidated, 'sampleValidated'),
    demoData: bool(data.demoData, 'demoData'),
    delimiter: string(data.delimiter, 'delimiter'),
    dateTimePattern: string(data.dateTimePattern, 'dateTimePattern'),
    currency: string(data.currency, 'currency'),
    mapping: {
      storeId: string(mapping.storeId, 'mapping.storeId'),
      receiptId: string(mapping.receiptId, 'mapping.receiptId'),
      timestamp: string(mapping.timestamp, 'mapping.timestamp'),
      productCode: nullableString(mapping.productCode, 'mapping.productCode'),
      barcode: nullableString(mapping.barcode, 'mapping.barcode'),
      productName: string(mapping.productName, 'mapping.productName'),
      quantity: string(mapping.quantity, 'mapping.quantity'),
      unitPrice: string(mapping.unitPrice, 'mapping.unitPrice'),
      discountAmount: string(mapping.discountAmount, 'mapping.discountAmount'),
      lineTotal: string(mapping.lineTotal, 'mapping.lineTotal'),
    },
  }
}

function normalizePreviewField(value, field) {
  const data = object(value, field)
  return {
    field: string(data.field, `${field}.field`),
    label: string(data.label, `${field}.label`),
    required: bool(data.required, `${field}.required`),
    sourceColumn: nullableString(data.sourceColumn, `${field}.sourceColumn`),
    suggestedSourceColumn: nullableString(data.suggestedSourceColumn, `${field}.suggestedSourceColumn`),
  }
}

export function normalizeImportPreview(value) {
  const data = object(value, 'preview')
  return {
    previewId: nullableString(data.previewId, 'previewId'),
    readyForImport: bool(data.readyForImport, 'readyForImport'),
    mappingRequired: bool(data.mappingRequired, 'mappingRequired'),
    filename: string(data.filename, 'filename'),
    adapterCode: string(data.adapterCode, 'adapterCode'),
    adapterName: string(data.adapterName, 'adapterName'),
    rowsChecked: count(data.rowsChecked, 'rowsChecked'),
    receiptsDetected: count(data.receiptsDetected, 'receiptsDetected'),
    productLines: count(data.productLines, 'productLines'),
    distinctProducts: count(data.distinctProducts, 'distinctProducts'),
    detectedColumns: array(data.detectedColumns, 'detectedColumns', string),
    detectedStoreIds: array(data.detectedStoreIds, 'detectedStoreIds', string),
    quantity: number(data.quantity, 'quantity'),
    grossSales: number(data.grossSales, 'grossSales'),
    discounts: number(data.discounts, 'discounts'),
    reportedNetSales: number(data.reportedNetSales, 'reportedNetSales'),
    calculatedNetSales: number(data.calculatedNetSales, 'calculatedNetSales'),
    difference: number(data.difference, 'difference'),
    currency: string(data.currency, 'currency'),
    firstTransactionAt: timestamp(data.firstTransactionAt, 'firstTransactionAt', true),
    lastTransactionAt: timestamp(data.lastTransactionAt, 'lastTransactionAt', true),
    expiresAt: timestamp(data.expiresAt, 'expiresAt', true),
    fields: array(data.fields, 'fields', normalizePreviewField),
    errors: array(data.errors, 'errors', string),
  }
}

function normalizeCanonicalProduct(value, field = 'canonicalProduct') {
  const data = object(value, field)
  return {
    id: string(data.id, `${field}.id`),
    normalizedName: string(data.normalizedName, `${field}.normalizedName`),
    barcode: nullableString(data.barcode, `${field}.barcode`),
    brand: nullableString(data.brand, `${field}.brand`),
    manufacturer: nullableString(data.manufacturer, `${field}.manufacturer`),
    category: nullableString(data.category, `${field}.category`),
    subcategory: nullableString(data.subcategory, `${field}.subcategory`),
    packageSize: nullableString(data.packageSize, `${field}.packageSize`),
    packageType: nullableString(data.packageType, `${field}.packageType`),
    cci: typeof data.cci === 'boolean' ? data.cci : invalid(`${field}.cci`),
  }
}

function normalizeRetailerProduct(value, field = 'retailerProduct') {
  const data = object(value, field)
  return {
    id: string(data.id, `${field}.id`),
    retailerCode: string(data.retailerCode, `${field}.retailerCode`),
    productCode: nullableString(data.productCode, `${field}.productCode`),
    barcode: nullableString(data.barcode, `${field}.barcode`),
    originalProductName: string(data.originalProductName, `${field}.originalProductName`),
    matchMethod: string(data.matchMethod, `${field}.matchMethod`),
    canonicalProduct: data.canonicalProduct == null
      ? null
      : normalizeCanonicalProduct(data.canonicalProduct, `${field}.canonicalProduct`),
  }
}

async function connectionError(response) {
  if (response.status === 403) return 'This account does not have data-import administrator access.'
  if (response.status === 413) return 'This file exceeds the 25 MB import limit.'
  return errorMessage(response)
}

async function fetchJson(path, { username, password, signal, ...options } = {}) {
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
    throw new ScanApiError('Cannot reach the SCAN import service. Check the connection and try again.')
  }
  return response
}

export async function fetchImportContext({ username, password, signal }) {
  const response = await fetchJson('/api/v1/imports/context', { username, password, signal })
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  return normalizeImportContext(await response.json())
}

export async function previewImport({ file, username, password, signal }) {
  const form = new FormData()
  form.append('file', file)
  const response = await fetchJson('/api/v1/imports/preview', {
    method: 'POST', body: form, username, password, signal,
  })
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  return normalizeImportPreview(await response.json())
}

export async function updateImportMapping({ request, username, password, signal }) {
  const response = await fetchJson('/api/v1/imports/profile', {
    method: 'PUT', username, password, signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  return normalizeImportContext(await response.json())
}

export async function uploadImport({ file, previewId, username, password, signal }) {
  const form = new FormData()
  form.append('file', file)
  form.append('previewId', previewId)
  const response = await fetchJson('/api/v1/imports', {
    method: 'POST', body: form, username, password, signal,
  })
  if (response.status === 422) return normalizeImportJob(await response.json())
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  return normalizeImportJob(await response.json())
}

export async function fetchImportJob({ jobId, username, password, signal }) {
  const response = await fetchJson(`/api/v1/imports/${encodeURIComponent(jobId)}`, {
    username, password, signal,
  })
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  return normalizeImportJob(await response.json())
}

export async function fetchImportHistory({ username, password, signal }) {
  const response = await fetchJson('/api/v1/imports/history?limit=50', { username, password, signal })
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  return array(await response.json(), 'history', normalizeImportJob)
}

export function normalizeImportJobDeletion(value) {
  const data = object(value, 'response')
  return {
    id: string(data.id, 'id'),
    filename: string(data.filename, 'filename'),
    deletedReceipts: count(data.deletedReceipts, 'deletedReceipts'),
    deletedLines: count(data.deletedLines, 'deletedLines'),
  }
}

export async function deleteImportJob({ jobId, username, password, signal }) {
  const response = await fetchJson(`/api/v1/imports/${encodeURIComponent(jobId)}`, {
    method: 'DELETE', username, password, signal,
  })
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  return normalizeImportJobDeletion(await response.json())
}

export async function fetchImportAudit({ username, password, signal }) {
  const response = await fetchJson('/api/v1/imports/audit?limit=50', { username, password, signal })
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  return array(await response.json(), 'audit', (value, field) => {
    const data = object(value, field)
    return {
      id: string(data.id, `${field}.id`),
      actorUsername: string(data.actorUsername, `${field}.actorUsername`),
      eventType: string(data.eventType, `${field}.eventType`),
      subjectType: string(data.subjectType, `${field}.subjectType`),
      subjectId: nullableString(data.subjectId, `${field}.subjectId`),
      detail: nullableString(data.detail, `${field}.detail`),
      occurredAt: timestamp(data.occurredAt, `${field}.occurredAt`),
    }
  })
}

export async function fetchImportOperations({ username, password, signal }) {
  const response = await fetchJson('/api/v1/imports/operations', { username, password, signal })
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  const data = object(await response.json(), 'operations')
  return {
    queued: count(data.queued, 'queued'),
    validating: count(data.validating, 'validating'),
    importing: count(data.importing, 'importing'),
    failed: count(data.failed, 'failed'),
    oldestQueuedAt: timestamp(data.oldestQueuedAt, 'oldestQueuedAt', true),
    lastCompletedAt: timestamp(data.lastCompletedAt, 'lastCompletedAt', true),
  }
}

export async function fetchUnresolvedProducts({ username, password, signal }) {
  const response = await fetchJson('/api/v1/product-mappings/unresolved', {
    username, password, signal,
  })
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  const data = await response.json()
  return array(data, 'unresolvedProducts', normalizeRetailerProduct)
}

export async function fetchProductCatalog({ username, password, signal }) {
  const response = await fetchJson('/api/v1/product-mappings/catalog', {
    username, password, signal,
  })
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  const data = await response.json()
  return array(data, 'catalog', normalizeCanonicalProduct)
}

export async function saveProductMapping({ retailerProductId, canonicalProductId, username, password, signal }) {
  const response = await fetchJson(`/api/v1/product-mappings/${encodeURIComponent(retailerProductId)}`, {
    method: 'PUT',
    username,
    password,
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ canonicalProductId }),
  })
  if (!response.ok) throw new ScanApiError(await connectionError(response), response.status)
  return normalizeRetailerProduct(await response.json())
}

export async function createCanonicalProduct({
  normalizedName, barcode, brand, manufacturer, category, subcategory, packageSize, packageType, cci,
  username, password, signal,
}) {
  const response = await fetchJson('/api/v1/product-mappings/catalog', {
    method: 'POST',
    username,
    password,
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      normalizedName, barcode: barcode || null, brand: brand || null, manufacturer: manufacturer || null,
      category: category || null, subcategory: subcategory || null, packageSize: packageSize || null,
      packageType: packageType || null, cci,
    }),
  })
  if (!response.ok) {
    if (response.status === 409) throw new ScanApiError('That barcode is already used by another SCAN product.', 409)
    throw new ScanApiError(await connectionError(response), response.status)
  }
  return normalizeCanonicalProduct(await response.json())
}
