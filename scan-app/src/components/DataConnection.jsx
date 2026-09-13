import { useRef, useState } from 'react'
import {
  fetchImportJob,
  fetchProductCatalog,
  fetchUnresolvedProducts,
  saveProductMapping,
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
]

const IMPORT_STAGES = [
  { id: 'upload', label: 'Upload', description: 'Send the selected file securely' },
  { id: 'detect', label: 'Detect', description: 'Read CSV or spreadsheet structure' },
  { id: 'map', label: 'Map', description: 'Apply the configured import profile' },
  { id: 'validate', label: 'Validate', description: 'Check every transaction row' },
  { id: 'import', label: 'Import', description: 'Reconstruct and save complete baskets' },
]

const MAX_FILE_BYTES = 25 * 1024 * 1024
const SUPPORTED_FILE = /\.(csv|xls|xlsx)$/i
const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function configuredContext() {
  const search = new URLSearchParams(window.location.search)
  return {
    retailerCode: `${search.get('retailerCode') || import.meta.env.VITE_SCAN_RETAILER_CODE || 'KAGGLE'}`.trim().toUpperCase(),
    profileCode: `${search.get('profileCode') || import.meta.env.VITE_SCAN_IMPORT_PROFILE || 'KAGGLE_2019'}`.trim().toUpperCase(),
  }
}

function formatDateTime(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function fileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function Login({ error, loading, onSubmit }) {
  const defaults = configuredContext()
  const [retailerCode, setRetailerCode] = useState(defaults.retailerCode)
  const [profileCode, setProfileCode] = useState(defaults.profileCode)
  const [username, setUsername] = useState('scan-admin')
  const [password, setPassword] = useState('')

  function submit(event) {
    event.preventDefault()
    onSubmit({
      retailerCode: retailerCode.trim().toUpperCase(),
      profileCode: profileCode.trim().toUpperCase(),
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
          <label>Retailer code<input autoCapitalize="characters" autoComplete="organization" required value={retailerCode} onChange={(event) => setRetailerCode(event.target.value)} /></label>
          <label>Import profile<input autoCapitalize="characters" required value={profileCode} onChange={(event) => setProfileCode(event.target.value)} /></label>
          <label>Administrator username<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Password<input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
          <button className="cci-primary-button" disabled={loading} type="submit">{loading ? 'Checking access…' : 'Open data connection'}</button>
        </form>
        <div className="portal-switch-links">
          <a className="portal-switch-link" href="/">CCI intelligence <span aria-hidden="true">→</span></a>
          <a className="portal-switch-link" href="/?portal=retailer">Retailer workspace <span aria-hidden="true">→</span></a>
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

function Connections({ onNavigate, unresolvedCount }) {
  return (
    <div className="scan-page-stack connection-home">
      <section className="connection-hero">
        <div>
          <span className="scan-eyebrow">Use the POS you already have</span>
          <h2>Connect your sales data</h2>
          <p>SCAN reads transaction data from your existing system and converts it into a standardized basket format.</p>
          <button className="scan-button scan-button-dark" onClick={() => onNavigate('import')} type="button">Import Excel or CSV <ScanIcon name="chevron" size={17} /></button>
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
            action={<button className="connection-card-action" onClick={() => onNavigate('import')} type="button">Choose a file <ScanIcon name="chevron" size={16} /></button>}
            description="Upload CSV, XLS, or XLSX transaction exports directly in SCAN."
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
            description="A pilot adapter is available for one reviewed CASPOS CloudSale workbook format. Other CloudSale exports are not yet supported."
            icon="connection"
            status="Pilot adapter"
            statusTone="warning"
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
        <summary><span><strong>CASPOS CloudSale pilot field map</strong><small>Read-only fields used by the pilot shop connector.</small></span><ScanIcon name="chevron" size={18} /></summary>
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

function ImportProgress({ job, processing, selectedFile }) {
  const failedAt = job?.status === 'FAILED' ? failureStage(job) : -1
  return (
    <ol className="connection-stage-list" aria-label="Import stages">
      {IMPORT_STAGES.map((stage, index) => {
        let state = 'pending'
        if (!job && selectedFile && index === 0) state = processing ? 'active' : 'ready'
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
    return (
      <section className="connection-result is-failed" aria-live="polite">
        <header><span><ScanIcon name="warning" /></span><div><small>Nothing was imported</small><h2>Import stopped safely</h2><p>SCAN found problems that must be corrected before this file can become intelligence.</p></div></header>
        <dl><div><dt>Rows checked</dt><dd>{integer.format(job.totalRows)}</dd></div><div><dt>Import attempt</dt><dd>{integer.format(job.attemptNumber)}</dd></div></dl>
        <div className="connection-error-list"><strong>What needs review</strong><ul>{job.errors.slice(0, 8).map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}</ul>{job.errors.length > 8 ? <small>{integer.format(job.errors.length - 8)} additional errors are retained in the import job.</small> : null}</div>
      </section>
    )
  }

  const title = job.duplicateFile ? 'File already processed' : job.unresolvedProducts ? 'Data ready—with mapping review' : 'Data ready'
  return (
    <section className={`connection-result ${job.unresolvedProducts ? 'has-warning' : 'is-success'}`} aria-live="polite">
      <header><span><ScanIcon name={job.unresolvedProducts ? 'warning' : 'check'} /></span><div><small>{job.duplicateFile ? 'Duplicate-safe result' : 'Import complete'}</small><h2>{title}</h2><p>{job.duplicateFile ? 'SCAN recognized these exact file bytes and returned the existing import job without duplicating receipts.' : 'The file passed structural and transaction validation. Complete baskets are available to the analytics layer.'}</p></div></header>
      <dl>
        <div><dt>Receipts imported</dt><dd>{integer.format(job.importedReceipts)}</dd></div>
        <div><dt>Product lines imported</dt><dd>{integer.format(job.importedLines)}</dd></div>
        <div><dt>Duplicate receipts skipped</dt><dd>{integer.format(job.duplicateReceipts)}</dd></div>
        <div><dt>Source products needing mapping</dt><dd>{integer.format(job.unresolvedProducts)}</dd></div>
      </dl>
      {job.unresolvedProducts ? <div className="connection-result-warning"><ScanIcon name="warning" size={18} /><p><strong>Product mapping is incomplete.</strong> The receipts were imported, but normalized product analysis may be understated until these source products are reviewed.</p></div> : null}
      <footer>
        <a className="scan-button scan-button-dark" href={`/?retailerCode=${encodeURIComponent(job.retailerCode)}`}>Open intelligence <ScanIcon name="chevron" size={17} /></a>
        <button className="scan-button scan-button-light" onClick={() => onNavigate('mapping')} type="button">Review mapping</button>
      </footer>
      <small>Completed {formatDateTime(job.completedAt)} · Job {job.id}</small>
    </section>
  )
}

function ImportData({ context, onImportComplete, onNavigate }) {
  const [selectedFile, setSelectedFile] = useState(null)
  const [job, setJob] = useState(null)
  const [error, setError] = useState('')
  const [processing, setProcessing] = useState(false)
  const [checking, setChecking] = useState(false)
  const [dragging, setDragging] = useState(false)
  const inputRef = useRef(null)

  function selectFile(file) {
    setJob(null)
    setError('')
    if (!file) { setSelectedFile(null); return }
    if (!SUPPORTED_FILE.test(file.name)) { setSelectedFile(null); setError('Choose a CSV, XLS, or XLSX transaction file.'); return }
    if (file.size > MAX_FILE_BYTES) { setSelectedFile(null); setError('This file exceeds the 25 MB import limit.'); return }
    setSelectedFile(file)
  }

  async function submit(event) {
    event.preventDefault()
    if (!selectedFile || processing) return
    setProcessing(true)
    setError('')
    setJob(null)
    try {
      const result = await uploadImport({ ...context, file: selectedFile })
      setJob(result)
      if (result.status === 'COMPLETED') await onImportComplete(result)
    } catch (requestError) {
      setError(requestError?.message || 'The file could not be imported.')
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
      <PageIntro eyebrow="File import" title="Bring transaction data into SCAN" description="Upload an export that matches the selected import profile. SCAN validates every row before saving receipts." />
      <div className="connection-import-layout">
        <form className="connection-upload-panel" onSubmit={submit}>
          <header><div><span className="scan-eyebrow">1 · Select file</span><h2>Excel or CSV export</h2></div><StatusBadge tone="success">Available now</StatusBadge></header>
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
            {selectedFile ? <><strong>{selectedFile.name}</strong><small>{fileSize(selectedFile.size)} · Ready to validate</small></> : <><strong>Drop an export here</strong><small>or choose CSV, XLS, or XLSX · maximum 25 MB</small></>}
          </button>
          {error ? <div className="scan-inline-notice scan-inline-error" role="alert">{error}</div> : null}
          <div className="connection-upload-context"><div><span>Retailer</span><strong>{context.retailerCode}</strong></div><div><span>Import profile</span><strong>{context.profileCode}</strong></div></div>
          <button className="scan-button scan-button-dark connection-import-button" disabled={!selectedFile || processing || checking} type="submit">{processing ? 'Uploading and validating…' : 'Validate and import'} <ScanIcon name="chevron" size={17} /></button>
          {processing ? <p className="connection-processing-copy" role="status"><span />SCAN is reading the file, applying the configured profile, validating transaction rows, and reconstructing baskets. The verified result will appear when processing is complete.</p> : null}
        </form>
        <aside className="connection-stage-panel">
          <header><span className="scan-eyebrow">Import path</span><h2>From file to valid baskets</h2><p>Stages advance only when SCAN confirms the result.</p></header>
          <ImportProgress job={job} processing={processing} selectedFile={selectedFile} />
        </aside>
      </div>
      <ImportResult checking={checking} job={job} onCheckJob={checkJob} onNavigate={onNavigate} />
      <details className="connection-profile-details">
        <summary><span><strong>Column mapping and file requirements</strong><small>This file must match the selected import profile.</small></span><ScanIcon name="chevron" size={18} /></summary>
        <div>
          <p>Column changes cannot be made in this screen yet. The selected profile must already match the export, or validation stops before any receipts are written.</p>
          <div className="connection-column-grid" aria-label="Canonical transaction fields">
            {['Store ID', 'Receipt ID', 'Timestamp', 'Product name', 'Quantity', 'Unit price', 'Discount amount', 'Line total'].map((field) => <span key={field}>{field}</span>)}
          </div>
          <small>Product code and barcode are optional. XLS/XLSX imports read the first worksheet. Returns and non-positive quantities are not accepted by the current transaction contract.</small>
        </div>
      </details>
    </div>
  )
}

function ProductMapping({ catalog, error, loading, mappingItems, onMap }) {
  const [search, setSearch] = useState('')
  const [selections, setSelections] = useState({})
  const [savingId, setSavingId] = useState(null)
  const visible = mappingItems.filter((item) => `${item.originalProductName} ${item.productCode || ''} ${item.barcode || ''}`.toLowerCase().includes(search.toLowerCase().trim()))

  async function map(item) {
    const canonicalProductId = selections[item.id]
    if (!canonicalProductId) return
    setSavingId(item.id)
    try { await onMap(item.id, canonicalProductId) } finally { setSavingId(null) }
  }

  if (loading) return <LoadingState title="Loading product mapping…" description="SCAN is reading unresolved source products and the canonical catalog." />
  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="Product mapping" title="Match source products to SCAN" description="Unresolved means SCAN found no exact barcode or saved match. Choose a reviewed product from the SCAN catalog." aside={<StatusBadge tone={mappingItems.length ? 'warning' : 'success'}>{mappingItems.length ? `${integer.format(mappingItems.length)} unresolved` : 'Complete'}</StatusBadge>} />
      {error ? <div className="scan-inline-notice scan-inline-error" role="alert">{error}</div> : null}
      {!mappingItems.length ? <EmptyState title="Product mapping is complete">No unresolved source products remain for this retailer.</EmptyState> : (
        <section className="connection-mapping-panel">
          <header><div><h2>Review unresolved products</h2><p>Saving a match updates normalized analytics for this retailer.</p></div><label><span className="sr-only">Search unresolved products</span><ScanIcon name="explore" size={18} /><input type="search" placeholder="Search source products" value={search} onChange={(event) => setSearch(event.target.value)} /></label></header>
          {!visible.length ? <EmptyState compact title="No matching source products">Try a different product name, code, or barcode.</EmptyState> : <div className="connection-mapping-list">
            <div className="connection-mapping-head" aria-hidden="true"><span>Source product</span><i /><span>SCAN product</span><span /></div>
            {visible.map((item) => (
              <article key={item.id}>
                <div className="connection-source-product"><StatusBadge tone="warning">Unresolved</StatusBadge><strong>{item.originalProductName}</strong><small>{item.productCode ? `Code ${item.productCode}` : 'No product code'} · {item.barcode ? `Barcode ${item.barcode}` : 'No barcode'}</small></div>
                <ScanIcon name="chevron" size={18} />
                <label><span className="sr-only">SCAN product for {item.originalProductName}</span><select value={selections[item.id] || ''} onChange={(event) => setSelections((current) => ({ ...current, [item.id]: event.target.value }))}><option value="">Choose catalog product</option>{catalog.map((product) => <option key={product.id} value={product.id}>{product.normalizedName}{product.category ? ` · ${product.category}` : ''}</option>)}</select></label>
                <button className="scan-button scan-button-dark" disabled={!selections[item.id] || savingId === item.id} onClick={() => map(item)} type="button">{savingId === item.id ? 'Saving…' : 'Save match'}</button>
              </article>
            ))}
          </div>}
          {!catalog.length ? <div className="scan-inline-notice"><strong>No SCAN catalog products are available.</strong> A SCAN administrator must add a reviewed catalog before mappings can be saved.</div> : null}
        </section>
      )}
    </div>
  )
}

function Page({ activePage, catalog, context, mappingError, mappingItems, mappingLoading, onImportComplete, onMap, onNavigate }) {
  if (activePage === 'import') return <ImportData context={context} onImportComplete={onImportComplete} onNavigate={onNavigate} />
  if (activePage === 'mapping') return <ProductMapping catalog={catalog} error={mappingError} loading={mappingLoading} mappingItems={mappingItems} onMap={onMap} />
  return <Connections onNavigate={onNavigate} unresolvedCount={mappingItems.length} />
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
  const layoutRef = useRef(null)

  usePretextLayout(layoutRef, `${activePage}:${mappingItems.length}:${context?.retailerCode || 'login'}`)

  async function signIn(nextContext) {
    setAuthLoading(true)
    setAuthError('')
    try {
      const unresolved = await fetchUnresolvedProducts(nextContext)
      setContext(nextContext)
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

  function navigate(page) {
    setActivePage(page)
    if (page === 'mapping') loadMapping()
  }

  async function importComplete(result) {
    if (!result.unresolvedProducts) return
    try { setMappingItems(await fetchUnresolvedProducts(context)) } catch { /* Result remains authoritative. */ }
  }

  async function mapProduct(retailerProductId, canonicalProductId) {
    setMappingError('')
    try {
      await saveProductMapping({ ...context, retailerProductId, canonicalProductId })
      setMappingItems((items) => items.filter((item) => item.id !== retailerProductId))
    } catch (error) {
      setMappingError(error?.message || 'The product mapping could not be saved.')
    }
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

  const header = <WorkspaceHeader eyebrow="SCAN setup" title="Data connection" meta={<p>{context.retailerCode} · Profile {context.profileCode}</p>} actions={<StatusBadge tone={mappingItems.length ? 'warning' : 'success'}>{mappingItems.length ? `${integer.format(mappingItems.length)} products to map` : 'Mapping ready'}</StatusBadge>} />
  return (
    <div ref={layoutRef}>
      <WorkspaceShell activePage={activePage} accountLabel={context.retailerCode} accountMeta={`Profile ${context.profileCode}`} brandSubtitle="Data Connection" header={header} navItems={NAV_ITEMS} onNavigate={navigate} onSignOut={signOut} portal="connection" privacyLabel="Admin-only import and mapping access">
        <Page activePage={activePage} catalog={catalog} context={context} mappingError={mappingError} mappingItems={mappingItems} mappingLoading={mappingLoading} onImportComplete={importComplete} onMap={mapProduct} onNavigate={navigate} />
      </WorkspaceShell>
    </div>
  )
}
