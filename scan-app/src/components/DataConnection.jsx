import { useEffect, useRef, useState } from 'react'
import {
  createCanonicalProduct,
  deleteImportJob,
  editCanonicalProduct,
  fetchImportContext,
  fetchImportAudit,
  fetchImportHistory,
  fetchImportOperations,
  fetchImportJob,
  fetchProductCatalog,
  fetchUnresolvedProducts,
  previewImport,
  saveProductMapping,
  updateImportMapping,
  uploadImport,
} from '../services/importApi'
import ScanBrand from './ScanBrand'
import ScanIcon from './ScanIcon'
import { usePretextLayout } from './usePretextLayout'
import {
  EmptyState,
  LoadingState,
  PageIntro,
  StatusBadge,
  WorkspaceHeader,
  WorkspaceShell,
} from './WorkspaceUI'
import './CciDashboard.css'
import './DataConnection.css'

const NAV_ITEMS = [
  { id: 'connections', label: 'Connections', icon: 'connection' },
  { id: 'import', label: 'Import data', icon: 'upload' },
  { id: 'mapping', label: 'Product mapping', icon: 'mapping' },
  { id: 'catalog', label: 'SCAN catalog', icon: 'products' },
  { id: 'history', label: 'Import history', icon: 'sync' },
]

const IMPORT_STAGES = [
  { id: 'upload', label: 'Upload', description: 'Read the selected export without saving sales' },
  { id: 'detect', label: 'Detect', description: 'Recognize a supported POS adapter or its columns' },
  { id: 'map', label: 'Map', description: 'Confirm how source fields become SCAN fields' },
  { id: 'reconcile', label: 'Reconcile', description: 'Compare receipts, lines, quantities, and sales' },
  { id: 'import', label: 'Import', description: 'Save only the approved, unchanged file' },
]

const REQUIRED_TRANSACTION_FIELDS = [
  'store_id',
  'receipt_id',
  'transaction_timestamp',
  'product_name',
  'quantity',
  'unit_price',
  'discount_amount',
  'line_total',
]

const MAX_FILE_BYTES = 25 * 1024 * 1024
const SUPPORTED_FILE = /\.(csv|xls|xlsx)$/i
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const quantity = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 })

function formatDateTime(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function fileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Login({ error, loading, onSubmit }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function submit(event) {
    event.preventDefault()
    onSubmit({
      username: username.trim(),
      password,
    })
  }

  return (
    <main className="cci-login-shell connection-login-shell">
      <section className="cci-login-card connection-login-card" aria-labelledby="connection-login-title">
        <ScanBrand subtitle="Sales & Consumption Analytics Network" />
        <div className="cci-login-copy">
          <span className="cci-eyebrow">Data connection</span>
          <h1 id="connection-login-title">Connect existing sales data.</h1>
          <p>SCAN reads transaction exports without replacing or writing to the shop’s POS.</p>
        </div>
        <form className="cci-login-form" onSubmit={submit}>
          <label>Administrator username<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Password<input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <p className="connection-login-context"><strong>Your account selects the retailer.</strong> SCAN will show the assigned destination and file format after sign-in. They cannot be changed from this screen.</p>
          {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
          <button className="cci-primary-button" disabled={loading} type="submit">{loading ? 'Checking access…' : 'Open data connection'}</button>
        </form>
        <div className="portal-switch-links">
          <a className="portal-switch-link" href="/">CCI intelligence <span aria-hidden="true">→</span></a>
          <a className="portal-switch-link" href="/?portal=retailer">Retailer workspace <span aria-hidden="true">→</span></a>
          <a className="portal-switch-link" href="/?portal=onboarding">Retailer onboarding <span aria-hidden="true">→</span></a>
        </div>
      </section>
    </main>
  )
}

function ConnectionCard({ action, description, icon, status, statusTone = 'neutral', title }) {
  return (
    <article className="connection-option">
      <header><span><ScanIcon name={icon} size={20} /></span><StatusBadge tone={statusTone}>{status}</StatusBadge></header>
      <h3>{title}</h3>
      <p>{description}</p>
      {action || null}
    </article>
  )
}

function Connections({ context, onNavigate, unresolvedCount }) {
  return (
    <div className="scan-page-stack connection-home">
      <section className="connection-hero">
        <div>
          <span className="scan-eyebrow">Use the POS you already have</span>
          <h2>Connect your sales data</h2>
          <p>SCAN reads transaction data from your existing system and converts it into a standardized basket format.</p>
          <button className="scan-button scan-button-dark" disabled={context.demoData} onClick={() => onNavigate('import')} type="button">{context.demoData ? 'Demo dataset locked' : 'Import Excel or CSV'} <ScanIcon name={context.demoData ? 'shield' : 'chevron'} size={17} /></button>
        </div>
        <ol aria-label="How sales data reaches SCAN">
          <li><span>01</span><div><strong>Existing POS</strong><small>Continues running as normal</small></div></li>
          <li><span>02</span><div><strong>Transaction export</strong><small>CSV, XLS, or XLSX</small></div></li>
          <li><span>03</span><div><strong>SCAN validation</strong><small>Rows become complete baskets</small></div></li>
          <li><span>04</span><div><strong>Intelligence</strong><small>Only after the data passes validation</small></div></li>
        </ol>
      </section>

      <section className="connection-options-section">
        <header><div><h2>Connection methods</h2><p>See what works now and what still requires setup.</p></div></header>
        <div className="connection-options-grid">
          <ConnectionCard
            description="Upload CSV, XLS, or XLSX. SCAN recognizes installed adapters and offers editable mapping when the format is unknown."
            icon="file"
            status="Available"
            statusTone="success"
            title="Excel / CSV"
          />
          <ConnectionCard
            description="A shop connector can monitor an export folder and send completed files to SCAN. It must be installed and configured separately."
            icon="sync"
            status="Setup required"
            statusTone="warning"
            title="Scheduled export folder"
          />
          <ConnectionCard
            description="The observed CloudSale sales-receipt workbook is recognized and converted directly. Schema changes stop safely for review."
            icon="connection"
            status="Available"
            statusTone="success"
            title="CASPOS CloudSale"
          />
          <ConnectionCard
            description="A 1C connection is not available in this version of SCAN."
            icon="database"
            status="Coming soon"
            title="1C"
          />
          <ConnectionCard
            description="Other systems require a sample export and a reviewed import profile before they can connect."
            icon="stores"
            status="Assessment required"
            title="Other POS"
          />
        </div>
      </section>

      <section className="scan-panel connection-boundary">
        <header className="scan-panel-header"><div><h3>What SCAN does</h3><p>How data moves between the POS and SCAN</p></div><ScanIcon name="shield" size={22} /></header>
        <div><p><ScanIcon name="check" size={17} /><span><strong>Reads exported transaction files</strong> and sends them to SCAN through authenticated HTTPS.</span></p><p><ScanIcon name="check" size={17} /><span><strong>Does not write to the POS</strong> or require cashiers to change checkout behavior.</span></p><p><ScanIcon name="warning" size={17} /><span><strong>Does not configure POS exports automatically.</strong> The retailer must already support file export or needs a source-specific adapter.</span></p></div>
      </section>

      <details className="connection-profile-details connection-cloudsale-map">
        <summary><span><strong>CloudSale workbook field map</strong><small>Fields used by the installed workbook adapter.</small></span><ScanIcon name="chevron" size={18} /></summary>
        <div>
          <p>This map applies only to the reviewed pilot workbook. Other CloudSale exports may use different fields.</p>
          <dl className="connection-field-map">
            {[
              ['Obyekt_kodu', 'Store ID'],
              ['Kassa_kodu + Çek_nömrəsi', 'Receipt ID'],
              ['Çek_tarixi', 'Timestamp'],
              ['Məhsul_kodu', 'Product code'],
              ['Barkod', 'Barcode'],
              ['Məhsul_adı', 'Product'],
              ['Miqdar', 'Quantity'],
              ['Vahid_qiyməti_AZN', 'Unit price'],
              ['Sətir_endirimi_AZN', 'Discount amount'],
              ['Sətir_məbləği_AZN', 'Line total'],
            ].map(([source, field]) => <div key={source}><dt>{source}</dt><dd><ScanIcon name="chevron" size={15} />{field}</dd></div>)}
          </dl>
        </div>
      </details>

      {unresolvedCount ? <button className="connection-mapping-notice" onClick={() => onNavigate('mapping')} type="button"><span><strong>{integer.format(unresolvedCount)} source products need mapping</strong><small>Review them before relying on normalized product analysis.</small></span><ScanIcon name="chevron" /></button> : null}
    </div>
  )
}

function failureStage(job) {
  const errors = job.errors.join(' ').toLowerCase()
  if (/empty|only \.csv|supported/.test(errors)) return 1
  if (/required column is missing/.test(errors)) return 2
  if (/row |value is required|decimal|timestamp|date|greater than zero|negative/.test(errors)) return 3
  return 4
}

function ImportProgress({ job, preview, processing, selectedFile }) {
  const failedAt = job?.status === 'FAILED' ? failureStage(job) : -1
  return (
    <ol className="connection-stage-list" aria-label="Import stages">
      {IMPORT_STAGES.map((stage, index) => {
        let state = 'pending'
        if (!job && selectedFile && index === 0) state = processing ? 'active' : 'ready'
        if (!job && preview) {
          if (preview.readyForImport) state = index < 4 ? 'complete' : 'ready'
          else if (preview.mappingRequired) state = index < 2 ? 'complete' : index === 2 ? 'active' : 'pending'
          else state = index < 3 ? 'complete' : index === 3 ? 'failed' : 'pending'
        }
        if (job?.status === 'RECEIVED') state = index === 0 ? 'complete' : index === 1 ? 'active' : 'pending'
        if (job?.status === 'VALIDATING') state = index === 0 ? 'complete' : index === 1 ? 'active' : 'pending'
        if (job?.status === 'IMPORTING') state = index < 4 ? 'complete' : 'active'
        if (job?.status === 'COMPLETED') state = 'complete'
        if (job?.status === 'FAILED') state = index < failedAt ? 'complete' : index === failedAt ? 'failed' : 'pending'
        return (
          <li className={`is-${state}`} key={stage.id}>
            <span>{state === 'complete' ? <ScanIcon name="check" size={15} /> : state === 'failed' ? '!' : index + 1}</span>
            <div><strong>{stage.label}</strong><small>{stage.description}</small></div>
          </li>
        )
      })}
    </ol>
  )
}

function amount(value, currency) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(value)
}

function MappingEditor({ context, onSave, preview, saving }) {
  const initial = Object.fromEntries(preview.fields.map((field) => [
    field.field,
    field.suggestedSourceColumn || (preview.detectedColumns.includes(field.sourceColumn) ? field.sourceColumn : ''),
  ]))
  const [columns, setColumns] = useState(initial)
  const [dateTimePattern, setDateTimePattern] = useState(context.dateTimePattern)
  const [delimiter, setDelimiter] = useState(context.delimiter)

  function submit(event) {
    event.preventDefault()
    onSave({ delimiter, dateTimePattern, columns })
  }

  return (
    <section className="scan-panel connection-column-mapping">
      <header>
        <div><span className="scan-eyebrow">Format needs mapping</span><h2>Match this export to SCAN</h2><p>Choose the exact source column for each field. Saving the map does not import the file.</p></div>
        <StatusBadge tone="warning">{integer.format(preview.detectedColumns.length)} columns detected</StatusBadge>
      </header>
      <form onSubmit={submit}>
        <div className="connection-format-settings">
          <label><span>CSV separator</span><select value={delimiter} onChange={(event) => setDelimiter(event.target.value)}><option value=",">Comma</option><option value=";">Semicolon</option><option value="\t">Tab</option></select></label>
          <label><span>Timestamp format</span><select value={dateTimePattern} onChange={(event) => setDateTimePattern(event.target.value)}><option value="yyyy-MM-dd'T'HH:mm:ss">2026-09-18T14:30:00</option><option value="yyyy-MM-dd HH:mm:ss">2026-09-18 14:30:00</option><option value="dd.MM.yyyy HH:mm:ss">18.09.2026 14:30:00</option></select></label>
        </div>
        <div className="connection-mapping-grid">
          {preview.fields.map((field) => (
            <label key={field.field}>
              <span>{field.label}{field.required ? <small>Required</small> : <small>Optional</small>}</span>
              <select required={field.required} value={columns[field.field] || ''} onChange={(event) => setColumns((current) => ({ ...current, [field.field]: event.target.value }))}>
                <option value="">{field.required ? 'Choose source column' : 'Not provided'}</option>
                {preview.detectedColumns.map((column) => <option key={column} value={column}>{column}</option>)}
              </select>
            </label>
          ))}
        </div>
        <footer><button className="scan-button scan-button-dark" disabled={saving} type="submit">{saving ? 'Saving mapping…' : 'Save mapping and validate again'}</button></footer>
      </form>
    </section>
  )
}

function Reconciliation({ importing, onImport, preview }) {
  const balanced = Math.abs(preview.difference) < 0.005
  return (
    <section className="scan-panel connection-reconciliation" aria-live="polite">
      <header>
        <div><span className="scan-eyebrow">Reconciliation</span><h2>{preview.adapterName}</h2><p>SCAN has not saved any receipts yet. Confirm these controls before import.</p></div>
        <StatusBadge tone={balanced ? 'success' : 'critical'}>{balanced ? 'Balanced' : 'Difference found'}</StatusBadge>
      </header>
      <div className="connection-reconciliation-primary">
        <div><span>Receipts</span><strong>{integer.format(preview.receiptsDetected)}</strong></div>
        <div><span>Product lines</span><strong>{integer.format(preview.productLines)}</strong></div>
        <div><span>Quantity</span><strong>{quantity.format(preview.quantity)}</strong></div>
        <div><span>Reported sales</span><strong>{amount(preview.reportedNetSales, preview.currency)}</strong></div>
      </div>
      <dl className="connection-reconciliation-detail">
        <div><dt>Gross before discounts</dt><dd>{amount(preview.grossSales, preview.currency)}</dd></div>
        <div><dt>Line discounts</dt><dd>{amount(preview.discounts, preview.currency)}</dd></div>
        <div><dt>Calculated sales</dt><dd>{amount(preview.calculatedNetSales, preview.currency)}</dd></div>
        <div><dt>Difference</dt><dd>{amount(preview.difference, preview.currency)}</dd></div>
        <div><dt>Distinct products</dt><dd>{integer.format(preview.distinctProducts)}</dd></div>
        <div><dt>Stores in file</dt><dd>{preview.detectedStoreIds.join(', ')}</dd></div>
      </dl>
      <div className="connection-reconciliation-note"><ScanIcon name="shield" size={18} /><p><strong>The approved file is locked by its fingerprint.</strong><span>If the file changes after this check, SCAN requires a new reconciliation.</span></p></div>
      <footer><button className="scan-button scan-button-dark" disabled={importing || !preview.readyForImport || !balanced} onClick={onImport} type="button">{importing ? 'Importing verified data…' : 'Import verified data'} <ScanIcon name="chevron" size={17} /></button></footer>
    </section>
  )
}

function ImportResult({ checking, job, onCheckJob, onNavigate }) {
  if (!job) return null
  if (job.status !== 'COMPLETED' && job.status !== 'FAILED') {
    return (
      <section className="connection-result is-processing" aria-live="polite">
        <header><span><ScanIcon name="sync" /></span><div><small>Import {job.status.toLowerCase()}</small><h2>Processing is still underway</h2><p>This file is already being processed by SCAN. Check its saved status before using the data.</p></div></header>
        <dl><div><dt>Rows reported</dt><dd>{integer.format(job.totalRows)}</dd></div><div><dt>Import attempt</dt><dd>{integer.format(job.attemptNumber)}</dd></div></dl>
        <footer><button className="scan-button scan-button-dark" disabled={checking} onClick={onCheckJob} type="button">{checking ? 'Checking status…' : 'Check actual status'} <ScanIcon name="refresh" size={17} /></button></footer>
      </section>
    )
  }
  const success = job.status === 'COMPLETED'
  if (!success) {
    const profileMismatch = job.errors.some((error) => /required column is missing/i.test(error))
    return (
      <section className="connection-result is-failed" aria-live="polite">
        <header><span><ScanIcon name="warning" /></span><div><small>Nothing was imported · existing data unchanged</small><h2>{profileMismatch ? 'File format does not match' : 'Import stopped safely'}</h2><p>{profileMismatch ? `This file does not contain the columns required by ${job.profileCode}. Choose an export prepared for this profile or configure a separate retailer format.` : 'SCAN found problems that must be corrected before this file can become intelligence.'}</p></div></header>
        <dl><div><dt>Rows checked</dt><dd>{integer.format(job.totalRows)}</dd></div><div><dt>Import attempt</dt><dd>{integer.format(job.attemptNumber)}</dd></div></dl>
        <div className="connection-error-list"><strong>What needs review</strong><ul>{job.errors.slice(0, 8).map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>{job.errors.length > 8 ? <small>{integer.format(job.errors.length - 8)} additional errors are retained in the import job.</small> : null}</div>
      </section>
    )
  }

  const title = job.duplicateFile ? 'File already processed' : job.unresolvedProducts ? 'Data ready—with mapping review' : 'Data ready'
  return (
    <section className={`connection-result ${job.unresolvedProducts ? 'has-warning' : 'is-success'}`} aria-live="polite">
      <header><span><ScanIcon name={job.unresolvedProducts ? 'warning' : 'check'} /></span><div><small>{job.duplicateFile ? 'Duplicate-safe result' : 'Import complete · existing receipts preserved'}</small><h2>{title}</h2><p>{job.duplicateFile ? 'SCAN recognized these exact file bytes and returned the existing import job without duplicating receipts.' : 'The file passed structural and transaction validation. New receipts were added without replacing existing receipts.'}</p></div></header>
      <dl>
        <div><dt>Receipts imported</dt><dd>{integer.format(job.importedReceipts)}</dd></div>
        <div><dt>Product lines imported</dt><dd>{integer.format(job.importedLines)}</dd></div>
        <div><dt>Duplicate receipts skipped</dt><dd>{integer.format(job.duplicateReceipts)}</dd></div>
        <div><dt>Source products needing mapping</dt><dd>{integer.format(job.unresolvedProducts)}</dd></div>
      </dl>
      {job.unresolvedProducts ? <div className="connection-result-warning"><ScanIcon name="warning" size={18} /><p><strong>Product mapping is incomplete.</strong> The receipts were imported, but normalized product analysis may be understated until these source products are reviewed.</p></div> : null}
      <footer>
        <a className="scan-button scan-button-dark" href="/">Open intelligence <ScanIcon name="chevron" size={17} /></a>
        <button className="scan-button scan-button-light" onClick={() => onNavigate('mapping')} type="button">Review mapping</button>
      </footer>
      <small>Completed {formatDateTime(job.completedAt)} · Job {job.id}</small>
    </section>
  )
}

function ImportData({ context, onContextChange, onImportComplete, onNavigate }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [checking, setChecking] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => {
    if (!job || ['COMPLETED', 'FAILED'].includes(job.status)) return undefined
    const timer = window.setInterval(() => { checkJob() }, 1500)
    return () => window.clearInterval(timer)
  }, [job?.id, job?.status]) // eslint-disable-line react-hooks/exhaustive-deps

  if (context.demoData) {
    return (
      <div className="scan-page-stack">
        <PageIntro eyebrow="File import" title="Demo dataset locked" description={`${context.retailerName} is read-only. Transaction and catalog imports are disabled for this tenant.`} />
        <section className="scan-panel connection-boundary">
          <header className="scan-panel-header"><div><h3>Use a separate retailer account for shop data</h3><p>This prevents real receipts from being mixed with the SCAN demonstration dataset.</p></div><ScanIcon name="shield" size={22} /></header>
          <p>Ask a SCAN administrator to provision the retailer and its file-format profile. Then sign in with that retailer’s assigned data-connection account.</p>
        </section>
      </div>
    )
  }

  function selectFile(file) {
    setJob(null)
    setPreview(null)
    setError('')
    if (!file) { setSelectedFile(null); return }
    if (!SUPPORTED_FILE.test(file.name)) { setSelectedFile(null); setError('Choose a CSV, XLS, or XLSX transaction file.'); return }
    if (file.size > MAX_FILE_BYTES) { setSelectedFile(null); setError('This file exceeds the 25 MB import limit.'); return }
    setSelectedFile(file)
  }

  async function validateFile(event) {
    event.preventDefault()
    if (!selectedFile || processing) return
    setProcessing(true)
    setError('')
    setJob(null)
    try {
      const result = await previewImport({ ...context, file: selectedFile })
      setPreview(result)
    } catch (requestError) {
      setError(requestError?.message || 'The file could not be validated.')
    } finally {
      setProcessing(false)
    }
  }

  async function saveMapping(request) {
    setProcessing(true)
    setError('')
    try {
      const nextContext = await updateImportMapping({ ...context, request })
      onContextChange({ ...context, ...nextContext })
      const result = await previewImport({ ...context, file: selectedFile })
      setPreview(result)
    } catch (requestError) {
      setError(requestError?.message || 'The column mapping could not be saved.')
    } finally {
      setProcessing(false)
    }
  }

  async function importFile() {
    if (!selectedFile || !preview?.previewId || processing) return
    setProcessing(true)
    setError('')
    setJob(null)
    try {
      const result = await uploadImport({ ...context, file: selectedFile, previewId: preview.previewId })
      setJob(result)
      if (result.status === 'COMPLETED') await onImportComplete(result)
    } catch (requestError) {
      setError(requestError?.message || 'The reconciled file could not be imported.')
    } finally {
      setProcessing(false)
    }
  }

  async function checkJob() {
    if (!job || checking) return
    setChecking(true)
    setError('')
    try {
      const result = await fetchImportJob({ ...context, jobId: job.id })
      setJob(result)
      if (result.status === 'COMPLETED') await onImportComplete(result)
    } catch (requestError) {
      setError(requestError?.message || 'The import status could not be refreshed.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="File import" title="Validate first. Import second." description="SCAN recognizes supported POS exports, checks their totals, and saves data only after you approve the reconciliation." />
      <section className="connection-preflight" aria-labelledby="connection-preflight-title">
        <div>
          <span className="scan-eyebrow">Before you upload</span>
          <h2 id="connection-preflight-title">Original POS exports are accepted when an adapter exists</h2>
          <p>SCAN will try an installed adapter first. Unknown formats use the editable mapping saved as <strong>{context.profileName}</strong>.</p>
        </div>
        <div className="connection-preflight-fields">
          <span>Required fields</span>
          <div>{REQUIRED_TRANSACTION_FIELDS.map((field) => <code key={field}>{field}</code>)}</div>
          <small><code>product_code</code> and <code>barcode</code> are optional. Supported adapters may combine source fields to create a safe receipt identity.</small>
        </div>
        <div className="connection-preflight-safety">
          <ScanIcon name="shield" size={20} />
          <p><strong>Imports do not replace existing receipts.</strong> New receipts are added, exact overlaps are skipped, and conflicting receipt contents stop the import.</p>
        </div>
        {context.demoData ? <div className="connection-demo-warning"><ScanIcon name="warning" size={19} /><p><strong>{context.retailerCode} is a demo destination.</strong> Use only approved demonstration data. Real shop data requires a separate retailer account.</p></div> : null}
      </section>
      <div className="connection-import-layout">
        <form className="connection-upload-panel" onSubmit={validateFile}>
          <header><div><span className="scan-eyebrow">1 · Select file</span><h2>POS sales export</h2></div><StatusBadge tone="success">No-write check</StatusBadge></header>
          <input ref={inputRef} className="sr-only" type="file" accept=".csv,.xls,.xlsx" onChange={(event) => selectFile(event.target.files?.[0])} />
          <button
            aria-label="Choose a CSV, XLS, or XLSX transaction file"
            className={`connection-dropzone ${dragging ? 'is-dragging' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
            onDragLeave={(event) => { event.preventDefault(); setDragging(false) }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => { event.preventDefault(); setDragging(false); selectFile(event.dataTransfer.files?.[0]) }}
            type="button"
          >
            <span><ScanIcon name="upload" size={25} /></span>
            {selectedFile ? <><strong>{selectedFile.name}</strong><small>{fileSize(selectedFile.size)} · Ready for structure and totals check</small></> : <><strong>Drop an export here</strong><small>or choose CSV, XLS, or XLSX · maximum 25 MB</small></>}
          </button>
          {error ? <div className="scan-inline-notice scan-inline-error" role="alert">{error}</div> : null}
          <div className="connection-upload-context"><div><span>Retailer</span><strong>{context.retailerCode}</strong></div><div><span>Import profile</span><strong>{context.profileCode}</strong></div></div>
          <button className="scan-button scan-button-dark connection-import-button" disabled={!selectedFile || processing || checking} type="submit">{processing && !preview?.readyForImport ? 'Reading and reconciling…' : 'Check file before import'} <ScanIcon name="chevron" size={17} /></button>
          {processing ? <p className="connection-processing-copy" role="status"><span />SCAN is detecting the export, reconstructing receipts, and calculating reconciliation totals from the actual file.</p> : null}
        </form>
        <aside className="connection-stage-panel">
          <header><span className="scan-eyebrow">Import path</span><h2>From file to valid baskets</h2><p>Stages advance only when SCAN confirms the result.</p></header>
          <ImportProgress job={job} preview={preview} processing={processing} selectedFile={selectedFile} />
        </aside>
      </div>
      {preview?.mappingRequired ? <MappingEditor context={context} onSave={saveMapping} preview={preview} saving={processing} /> : null}
      {preview && !preview.readyForImport && !preview.mappingRequired ? (
        <section className="connection-result is-failed" aria-live="polite">
          <header><span><ScanIcon name="warning" /></span><div><small>Nothing imported</small><h2>Reconciliation stopped</h2><p>Correct these issues and validate the export again.</p></div></header>
          <dl><div><dt>Rows checked</dt><dd>{integer.format(preview.rowsChecked)}</dd></div><div><dt>Adapter</dt><dd>{preview.adapterName}</dd></div></dl>
          <div className="connection-error-list"><strong>What needs review</strong><ul>{preview.errors.slice(0, 8).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></div>
        </section>
      ) : null}
      {preview?.readyForImport && !job ? <Reconciliation importing={processing} onImport={importFile} preview={preview} /> : null}
      <ImportResult checking={checking} job={job} onCheckJob={checkJob} onNavigate={onNavigate} />
    </div>
  )
}

const DELETABLE_IMPORT_STATUSES = new Set(['COMPLETED', 'FAILED'])

function ImportHistory({ audit, deletingId, error, history, loading, operations, onDelete, onRefresh }) {
  const [confirmingId, setConfirmingId] = useState(null)

  async function handleDelete(item) {
    if (confirmingId !== item.id) { setConfirmingId(item.id); return }
    try { await onDelete(item.id) } finally { setConfirmingId(null) }
  }

  if (loading) return <LoadingState title="Loading import operations…" description="SCAN is reading this retailer’s job and audit records." />
  return (
    <div className="scan-page-stack connection-history-page">
      <PageIntro eyebrow="Operations" title="Import history" description="Every upload, background job, and credential-sensitive import event stays scoped to this retailer." aside={<button className="scan-button scan-button-secondary" onClick={onRefresh} type="button">Refresh</button>} />
      {error ? <div className="scan-inline-notice scan-inline-error" role="alert">{error}</div> : null}
      {operations ? <section className="connection-operations-strip">
        <div><span>Queued</span><strong>{operations.queued}</strong></div>
        <div><span>Validating</span><strong>{operations.validating}</strong></div>
        <div><span>Importing</span><strong>{operations.importing}</strong></div>
        <div><span>Failed · 24h</span><strong>{operations.failed}</strong></div>
      </section> : null}
      <section className="scan-panel connection-history-panel">
        <header className="scan-panel-header"><div><h3>Files</h3><p>Newest attempts first. File contents and passwords are never shown here. Removing a file deletes its receipts and lines; saved product mappings are kept.</p></div></header>
        {!history.length ? <EmptyState compact title="No imports yet">Validated uploads will appear here.</EmptyState> : <div className="connection-history-list">
          {history.map((item) => <article key={`${item.id}-${item.attemptNumber}`}><div><strong>{item.filename}</strong><small>{formatDateTime(item.createdAt)} · {item.submittedBy}</small></div><div className="connection-history-status"><StatusBadge tone={item.status === 'COMPLETED' ? 'success' : item.status === 'FAILED' ? 'critical' : 'warning'}>{item.status.toLowerCase()}</StatusBadge>{DELETABLE_IMPORT_STATUSES.has(item.status) ? <button className="scan-button scan-button-secondary" disabled={deletingId === item.id} onClick={() => handleDelete(item)} type="button">{deletingId === item.id ? 'Removing…' : confirmingId === item.id ? 'Confirm remove' : 'Remove'}</button> : null}</div><dl><div><dt>Receipts</dt><dd>{integer.format(item.importedReceipts)}</dd></div><div><dt>Lines</dt><dd>{integer.format(item.importedLines)}</dd></div><div><dt>Attempt</dt><dd>{item.attemptNumber}</dd></div></dl></article>)}
        </div>}
      </section>
      <section className="scan-panel connection-history-panel">
        <header className="scan-panel-header"><div><h3>Audit trail</h3><p>Operational events recorded by actor and time.</p></div></header>
        {!audit.length ? <EmptyState compact title="No audit events yet">New import activity will be recorded here.</EmptyState> : <div className="connection-audit-list">
          {audit.map((event) => <article key={event.id}><span><ScanIcon name="shield" size={17} /></span><div><strong>{event.eventType.replaceAll('_', ' ').toLowerCase()}</strong><small>{event.actorUsername} · {formatDateTime(event.occurredAt)}</small>{event.detail ? <p>{event.detail}</p> : null}</div></article>)}
        </div>}
      </section>
    </div>
  )
}

const NEW_CATALOG_PRODUCT = '__new__'

function emptyDraft(item) {
  return { normalizedName: item.originalProductName, barcode: item.barcode || '', brand: '', category: item.originalCategory || '', cci: false }
}

function ProductMapping({ catalog, error, loading, mappingItems, onCreateAndMap, onMap }) {
  const [search, setSearch] = useState('')
  const [selections, setSelections] = useState({})
  const [drafts, setDrafts] = useState({})
  const [savingId, setSavingId] = useState(null)
  const [creatingId, setCreatingId] = useState(null)
  const visible = mappingItems.filter((item) => `${item.originalProductName} ${item.productCode || ''} ${item.barcode || ''}`.toLowerCase().includes(search.toLowerCase().trim()))

  async function map(item) {
    const canonicalProductId = selections[item.id]
    if (!canonicalProductId || canonicalProductId === NEW_CATALOG_PRODUCT) return
    setSavingId(item.id)
    try { await onMap(item.id, canonicalProductId) } finally { setSavingId(null) }
  }

  function updateDraft(item, field, value) {
    setDrafts((current) => ({ ...current, [item.id]: { ...(current[item.id] || emptyDraft(item)), [field]: value } }))
  }

  function cancelNewProduct(itemId) {
    setSelections((current) => { const next = { ...current }; delete next[itemId]; return next })
    setDrafts((current) => { const next = { ...current }; delete next[itemId]; return next })
  }

  async function createAndMap(item) {
    const draft = drafts[item.id] || emptyDraft(item)
    if (!draft.normalizedName.trim()) return
    setCreatingId(item.id)
    try {
      await onCreateAndMap(item.id, {
        normalizedName: draft.normalizedName.trim(),
        barcode: draft.barcode.trim() || null,
        brand: draft.brand.trim() || null,
        category: draft.category.trim() || null,
        cci: draft.cci,
      })
      cancelNewProduct(item.id)
    } finally {
      setCreatingId(null)
    }
  }

  if (loading) return <LoadingState title="Loading product mapping…" description="SCAN is reading unresolved source products and the canonical catalog." />
  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="Product mapping" title="Match source products to SCAN" description="Unresolved means SCAN found no exact barcode or saved match. Choose a reviewed product from the SCAN catalog, or add it as a new one." aside={<StatusBadge tone={mappingItems.length ? 'warning' : 'success'}>{mappingItems.length ? `${integer.format(mappingItems.length)} unresolved` : 'Complete'}</StatusBadge>} />
      {error ? <div className="scan-inline-notice scan-inline-error" role="alert">{error}</div> : null}
      {!mappingItems.length ? <EmptyState title="Product mapping is complete">No unresolved source products remain for this retailer.</EmptyState> : (
        <section className="connection-mapping-panel">
          <header><div><h2>Review unresolved products</h2><p>Saving a match updates normalized analytics for this retailer.</p></div><label><span className="sr-only">Search unresolved products</span><ScanIcon name="explore" size={18} /><input type="search" placeholder="Search source products" value={search} onChange={(event) => setSearch(event.target.value)} /></label></header>
          {!visible.length ? <EmptyState compact title="No matching source products">Try a different product name, code, or barcode.</EmptyState> : <div className="connection-mapping-list">
            <div className="connection-mapping-head" aria-hidden="true"><span>Source product</span><i /><span>SCAN product</span><span /></div>
            {visible.map((item) => {
              const creatingNew = selections[item.id] === NEW_CATALOG_PRODUCT
              const draft = drafts[item.id] || emptyDraft(item)
              return (
              <article key={item.id}>
                <div className="connection-source-product"><StatusBadge tone="warning">Unresolved</StatusBadge><strong>{item.originalProductName}</strong><small>{item.productCode ? `Code ${item.productCode}` : 'No product code'} · {item.barcode ? `Barcode ${item.barcode}` : 'No barcode'}{item.originalCategory ? ` · ${item.originalCategory}` : ''}</small></div>
                <ScanIcon name="chevron" size={18} />
                <label><span className="sr-only">SCAN product for {item.originalProductName}</span><select value={selections[item.id] || ''} onChange={(event) => setSelections((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose catalog product</option><option value={NEW_CATALOG_PRODUCT}>+ Add as new SCAN product</option>{catalog.map((product) => <option key={product.id} value={product.id}>{product.normalizedName}{product.category ? ` · ${product.category}` : ''}</option>)}</select></label>
                {creatingNew ? null : <button className="scan-button scan-button-dark" disabled={!selections[item.id] || savingId === item.id} onClick={() => map(item)} type="button">{savingId === item.id ? 'Saving…' : 'Save match'}</button>}
                {creatingNew ? (
                  <div className="connection-new-product-form">
                    <p>The SCAN catalog has no matching product yet. Add one, and this source product maps to it immediately.</p>
                    <div className="connection-new-product-fields">
                      <label><span>Product name</span><input required value={draft.normalizedName} onChange={(event) => updateDraft(item, 'normalizedName', event.target.value)} /></label>
                      <label><span>Barcode</span><input value={draft.barcode} onChange={(event) => updateDraft(item, 'barcode', event.target.value)} placeholder="Optional" /></label>
                      <label><span>Brand</span><input value={draft.brand} onChange={(event) => updateDraft(item, 'brand', event.target.value)} placeholder="Optional" /></label>
                      <label><span>Category</span><input value={draft.category} onChange={(event) => updateDraft(item, 'category', event.target.value)} placeholder="Optional" /></label>
                    </div>
                    <div className="connection-new-product-actions">
                      <label className="connection-new-product-cci"><input checked={draft.cci} onChange={(event) => updateDraft(item, 'cci', event.target.checked)} type="checkbox" /><span>This is a CCI product</span></label>
                      <div>
                        <button className="scan-button scan-button-secondary" onClick={() => cancelNewProduct(item.id)} type="button">Cancel</button>
                        <button className="scan-button scan-button-dark" disabled={!draft.normalizedName.trim() || creatingId === item.id} onClick={() => createAndMap(item)} type="button">{creatingId === item.id ? 'Adding…' : 'Add & map'}</button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </article>
              )
            })}
          </div>}
          {!catalog.length ? <div className="scan-inline-notice"><strong>No SCAN catalog products are available.</strong> A SCAN administrator must add a reviewed catalog before mappings can be saved.</div> : null}
        </section>
      )}
    </div>
  )
}

function catalogDraft(item) {
  return {
    normalizedName: item.normalizedName, brand: item.brand || '', manufacturer: item.manufacturer || '',
    category: item.category || '', subcategory: item.subcategory || '', packageSize: item.packageSize || '',
    packageType: item.packageType || '', cci: item.cci,
  }
}

function Catalog({ catalog, error, loading, onEdit }) {
  const [search, setSearch] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const visible = catalog.filter((item) => `${item.normalizedName} ${item.category || ''} ${item.brand || ''}`.toLowerCase().includes(search.toLowerCase().trim()))

  function startEdit(item) {
    setEditingId(item.id)
    setDraft(catalogDraft(item))
    setSaveError('')
  }
  function cancelEdit() { setEditingId(null); setDraft(null); setSaveError('') }
  function updateField(field, value) { setDraft((current) => ({ ...current, [field]: value })) }
  async function save(item) {
    setSaving(true)
    setSaveError('')
    try {
      await onEdit(item.id, draft)
      setEditingId(null)
      setDraft(null)
    } catch (saveErrorCaught) {
      setSaveError(saveErrorCaught?.message || 'The catalog product could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <LoadingState title="Loading SCAN catalog…" description="Reading every reviewed product." />
  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="SCAN catalog" title="Review and correct catalog products" description="Fix a name or category that was picked up wrong - by an external barcode lookup, a bulk catalog import, or a typo." aside={<StatusBadge tone="neutral">{integer.format(catalog.length)} products</StatusBadge>} />
      {error ? <div className="scan-inline-notice scan-inline-error" role="alert">{error}</div> : null}
      <section className="connection-mapping-panel">
        <header><div><h2>Catalog products</h2><p>A correction here updates every retailer's analytics immediately - no re-import needed.</p></div><label><span className="sr-only">Search catalog products</span><ScanIcon name="explore" size={18} /><input type="search" placeholder="Search catalog products" value={search} onChange={(event) => setSearch(event.target.value)} /></label></header>
        {!visible.length ? <EmptyState compact title="No matching catalog products">Try a different name, brand, or category.</EmptyState> : <div className="connection-catalog-list">
          {visible.map((item) => (
            <article key={item.id} className={editingId === item.id ? 'is-editing' : ''}>
              {editingId === item.id ? (
                <div className="connection-new-product-form">
                  <div className="connection-new-product-fields">
                    <label><span>Product name</span><input required value={draft.normalizedName} onChange={(event) => updateField('normalizedName', event.target.value)} /></label>
                    <label><span>Brand</span><input value={draft.brand} onChange={(event) => updateField('brand', event.target.value)} placeholder="Optional" /></label>
                    <label><span>Category</span><input value={draft.category} onChange={(event) => updateField('category', event.target.value)} placeholder="Optional" /></label>
                    <label><span>Manufacturer</span><input value={draft.manufacturer} onChange={(event) => updateField('manufacturer', event.target.value)} placeholder="Optional" /></label>
                  </div>
                  {saveError ? <div className="cci-form-error" role="alert">{saveError}</div> : null}
                  <div className="connection-new-product-actions">
                    <label className="connection-new-product-cci"><input checked={draft.cci} onChange={(event) => updateField('cci', event.target.checked)} type="checkbox" /><span>This is a CCI product</span></label>
                    <div>
                      <button className="scan-button scan-button-secondary" disabled={saving} onClick={cancelEdit} type="button">Cancel</button>
                      <button className="scan-button scan-button-dark" disabled={saving || !draft.normalizedName.trim()} onClick={() => save(item)} type="button">{saving ? 'Saving…' : 'Save'}</button>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <div className="connection-source-product"><strong>{item.normalizedName}</strong><small>{item.category || 'No category'}{item.brand ? ` · ${item.brand}` : ''}{item.barcode ? ` · ${item.barcode}` : ''}</small></div>
                  {item.cci ? <StatusBadge tone="success">CCI</StatusBadge> : <span />}
                  <button className="scan-button scan-button-secondary" onClick={() => startEdit(item)} type="button">Edit</button>
                </>
              )}
            </article>
          ))}
        </div>}
      </section>
    </div>
  )
}

function Page({ activePage, audit, catalog, context, deletingJobId, history, historyError, historyLoading, mappingError, mappingItems, mappingLoading, onContextChange, onCreateAndMap, onDeleteJob, onEditCanonical, onHistoryRefresh, onImportComplete, onMap, onNavigate, operations }) {
  if (activePage === 'import') return <ImportData context={context} onContextChange={onContextChange} onImportComplete={onImportComplete} onNavigate={onNavigate} />
  if (activePage === 'mapping') return <ProductMapping catalog={catalog} error={mappingError} loading={mappingLoading} mappingItems={mappingItems} onCreateAndMap={onCreateAndMap} onMap={onMap} />
  if (activePage === 'catalog') return <Catalog catalog={catalog} error={mappingError} loading={mappingLoading} onEdit={onEditCanonical} />
  if (activePage === 'history') return <ImportHistory audit={audit} deletingId={deletingJobId} error={historyError} history={history} loading={historyLoading} onDelete={onDeleteJob} onRefresh={onHistoryRefresh} operations={operations} />
  return <Connections context={context} onNavigate={onNavigate} unresolvedCount={mappingItems.length} />
}

export default function DataConnection() {
  const [context, setContext] = useState(null)
  const [activePage, setActivePage] = useState('connections')
  const [authError, setAuthError] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  const [mappingItems, setMappingItems] = useState([])
  const [catalog, setCatalog] = useState([])
  const [mappingLoading, setMappingLoading] = useState(false)
  const [mappingError, setMappingError] = useState('')
  const [history, setHistory] = useState([])
  const [audit, setAudit] = useState([])
  const [operations, setOperations] = useState(null)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyError, setHistoryError] = useState('')
  const [deletingJobId, setDeletingJobId] = useState(null)
  const layoutRef = useRef(null)

  usePretextLayout(layoutRef, `${activePage}:${mappingItems.length}:${context?.retailerCode || 'login'}`)

  async function signIn(nextContext) {
    setAuthLoading(true)
    setAuthError('')
    try {
      const accountContext = await fetchImportContext(nextContext)
      const authenticatedContext = { ...nextContext, ...accountContext }
      const unresolved = await fetchUnresolvedProducts(authenticatedContext)
      setContext(authenticatedContext)
      setMappingItems(unresolved)
    } catch (error) {
      setAuthError(error?.message || 'Unable to open data connection.')
    } finally {
      setAuthLoading(false)
    }
  }

  async function loadMapping() {
    if (!context) return
    setMappingLoading(true)
    setMappingError('')
    try {
      const [unresolved, products] = await Promise.all([
        fetchUnresolvedProducts(context),
        fetchProductCatalog(context),
      ])
      setMappingItems(unresolved)
      setCatalog(products)
    } catch (error) {
      setMappingError(error?.message || 'Unable to load product mapping.')
    } finally {
      setMappingLoading(false)
    }
  }

  async function loadHistory() {
    if (!context) return
    setHistoryLoading(true)
    setHistoryError('')
    try {
      const [jobs, events, status] = await Promise.all([
        fetchImportHistory(context), fetchImportAudit(context), fetchImportOperations(context),
      ])
      setHistory(jobs)
      setAudit(events)
      setOperations(status)
    } catch (error) {
      setHistoryError(error?.message || 'Unable to load import operations.')
    } finally { setHistoryLoading(false) }
  }

  async function deleteJob(jobId) {
    setDeletingJobId(jobId)
    setHistoryError('')
    try {
      await deleteImportJob({ ...context, jobId })
      await loadHistory()
    } catch (error) {
      setHistoryError(error?.message || 'The import could not be removed.')
    } finally {
      setDeletingJobId(null)
    }
  }

  function navigate(page) {
    setActivePage(page)
    if (page === 'mapping' || page === 'catalog') loadMapping()
    if (page === 'history') loadHistory()
  }

  async function importComplete(result) {
    if (!result.unresolvedProducts) return
    try { setMappingItems(await fetchUnresolvedProducts(context)) } catch { /* Result remains authoritative. */ }
  }

  async function mapProduct(retailerProductId, canonicalProductId) {
    setMappingError('')
    setHistory([])
    setAudit([])
    setOperations(null)
    try {
      await saveProductMapping({ ...context, retailerProductId, canonicalProductId })
      setMappingItems((items) => items.filter((item) => item.id !== retailerProductId))
    } catch (error) {
      setMappingError(error?.message || 'The product mapping could not be saved.')
    }
  }

  async function createAndMapProduct(retailerProductId, draft) {
    setMappingError('')
    setHistory([])
    setAudit([])
    setOperations(null)
    try {
      const canonicalProduct = await createCanonicalProduct({ ...context, ...draft })
      setCatalog((items) => [...items, canonicalProduct])
      await saveProductMapping({ ...context, retailerProductId, canonicalProductId: canonicalProduct.id })
      setMappingItems((items) => items.filter((item) => item.id !== retailerProductId))
    } catch (error) {
      setMappingError(error?.message || 'The product could not be added to the SCAN catalog.')
    }
  }

  async function editCanonical(canonicalProductId, draft) {
    const updated = await editCanonicalProduct({ ...context, canonicalProductId, ...draft })
    setCatalog((items) => items.map((item) => (item.id === canonicalProductId ? updated : item)))
    return updated
  }

  function signOut() {
    setContext(null)
    setActivePage('connections')
    setAuthError('')
    setMappingItems([])
    setCatalog([])
    setMappingError('')
  }

  if (!context) return <Login error={authError} loading={authLoading} onSubmit={signIn} />

  const header = <WorkspaceHeader eyebrow="SCAN setup" title="Data connection" meta={<p>{context.retailerCode} · {context.profileName}</p>} actions={<StatusBadge tone={mappingItems.length ? 'warning' : 'success'}>{mappingItems.length ? `${integer.format(mappingItems.length)} products to map` : 'Mapping ready'}</StatusBadge>} />
  return (
    <div ref={layoutRef}>
      <WorkspaceShell activePage={activePage} accountLabel={context.retailerCode} accountMeta={context.profileName} brandSubtitle="Data Connection" header={header} navItems={NAV_ITEMS} onNavigate={navigate} onSignOut={signOut} portal="connection" privacyLabel="Admin-only import and mapping access">
        <Page activePage={activePage} audit={audit} catalog={catalog} context={context} deletingJobId={deletingJobId} history={history} historyError={historyError} historyLoading={historyLoading} mappingError={mappingError} mappingItems={mappingItems} mappingLoading={mappingLoading} onContextChange={setContext} onCreateAndMap={createAndMapProduct} onDeleteJob={deleteJob} onEditCanonical={editCanonical} onHistoryRefresh={loadHistory} onImportComplete={importComplete} onMap={mapProduct} onNavigate={navigate} operations={operations} />
      </WorkspaceShell>
    </div>
  )
}
