import { useMemo, useState } from 'react'
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
import ScanBrand from './ScanBrand'
import ScanIcon from './ScanIcon'
import { EmptyState, StatusBadge, WorkspaceHeader, WorkspaceShell } from './WorkspaceUI'
import './CciDashboard.css'
import './DataConnection.css'
import './Onboarding.css'

const NAV_ITEMS = [{ id: 'retailers', label: 'Retailers', icon: 'stores' }]
const MAX_FILE_BYTES = 25 * 1024 * 1024
const SUPPORTED_FILE = /\.(csv|xls|xlsx)$/i

const DEFAULT_COLUMNS = {
  storeId: 'store_id',
  receiptId: 'receipt_id',
  timestamp: 'transaction_timestamp',
  productCode: 'product_code',
  barcode: 'barcode',
  productName: 'product_name',
  quantity: 'quantity',
  unitPrice: 'unit_price',
  discountAmount: 'discount_amount',
  lineTotal: 'line_total',
}

function Login({ error, loading, onSubmit }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function submit(event) {
    event.preventDefault()
    onSubmit({ username: username.trim(), password })
  }

  return (
    <main className="cci-login-shell connection-login-shell">
      <section className="cci-login-card connection-login-card" aria-labelledby="onboarding-login-title">
        <ScanBrand subtitle="Sales & Consumption Analytics Network" />
        <div className="cci-login-copy">
          <span className="cci-eyebrow">Retailer onboarding</span>
          <h1 id="onboarding-login-title">Prepare a retailer before the first import.</h1>
          <p>Create the tenant, verify its export format, then issue retailer-specific access.</p>
        </div>
        <form className="cci-login-form" onSubmit={submit}>
          <label>Onboarding username<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Password<input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <p className="connection-login-context"><strong>Operator access only.</strong> This account can create isolated retailer tenants, but cannot import or read their sales data.</p>
          {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
          <button className="cci-primary-button" disabled={loading} type="submit">{loading ? 'Checking access…' : 'Open retailer onboarding'}</button>
        </form>
        <div className="portal-switch-links">
          <a className="portal-switch-link" href="/?portal=connection">Data connection <span aria-hidden="true">→</span></a>
          <a className="portal-switch-link" href="/">CCI intelligence <span aria-hidden="true">→</span></a>
        </div>
      </section>
    </main>
  )
}

function Field({ children, hint, label }) {
  return <label className="onboarding-field"><span>{label}</span>{children}{hint ? <small>{hint}</small> : null}</label>
}

function StepRail({ retailer }) {
  const profile = retailer?.importProfiles.at(-1)
  const steps = [
    ['Retailer and stores', Boolean(retailer)],
    ['Import format', Boolean(profile)],
    ['Sample validation', profile?.validationStatus === 'VALIDATED'],
    ['Access issued', Boolean(retailer?.credentialsIssued)],
  ]
  return (
    <ol className="onboarding-step-rail" aria-label="Onboarding progress">
      {steps.map(([label, complete], index) => (
        <li className={complete ? 'is-complete' : ''} key={label}>
          <span>{complete ? <ScanIcon name="check" size={15} /> : index + 1}</span>
          <strong>{label}</strong>
        </li>
      ))}
    </ol>
  )
}

function RetailerForm({ busy, error, onSubmit }) {
  const [name, setName] = useState('')
  const [zoneId, setZoneId] = useState('Asia/Baku')
  const [storeName, setStoreName] = useState('')
  const [storeId, setStoreId] = useState('')

  function submit(event) {
    event.preventDefault()
    onSubmit({ name, zoneId, stores: [{ name: storeName, externalStoreId: storeId }] })
  }

  return (
    <section className="scan-panel onboarding-form-panel">
      <header><span className="scan-eyebrow">Step 1 of 4</span><h2>Create the retailer</h2><p>SCAN generates the internal tenant code. Users never choose or type it during sign-in.</p></header>
      <form onSubmit={submit}>
        <div className="onboarding-form-grid">
          <Field label="Retailer name"><input autoFocus maxLength="255" required value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field hint="Used to interpret local transaction timestamps." label="Time zone"><select value={zoneId} onChange={(event) => setZoneId(event.target.value)}><option value="Asia/Baku">Asia/Baku</option><option value="Europe/Istanbul">Europe/Istanbul</option><option value="UTC">UTC</option></select></Field>
          <Field label="First store name"><input maxLength="255" required value={storeName} onChange={(event) => setStoreName(event.target.value)} /></Field>
          <Field hint="Must match the store value in the POS export." label="Store ID in the POS"><input maxLength="128" required value={storeId} onChange={(event) => setStoreId(event.target.value)} /></Field>
        </div>
        {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
        <div className="onboarding-form-actions"><button className="scan-button scan-button-dark" disabled={busy} type="submit">{busy ? 'Creating retailer…' : 'Create retailer'}</button></div>
      </form>
    </section>
  )
}

function AddStoreForm({ busy, error, onSubmit }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [externalStoreId, setExternalStoreId] = useState('')

  async function submit(event) {
    event.preventDefault()
    const saved = await onSubmit({ name, externalStoreId })
    if (saved) {
      setName('')
      setExternalStoreId('')
      setOpen(false)
    }
  }

  if (!open) return <button className="scan-button scan-button-secondary" onClick={() => setOpen(true)} type="button">Add another store</button>
  return (
    <form className="onboarding-inline-form" onSubmit={submit}>
      <Field label="Store name"><input required value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <Field label="Store ID in the POS"><input required value={externalStoreId} onChange={(event) => setExternalStoreId(event.target.value)} /></Field>
      {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
      <div><button className="scan-button scan-button-dark" disabled={busy} type="submit">Save store</button><button className="scan-button scan-button-secondary" onClick={() => setOpen(false)} type="button">Cancel</button></div>
    </form>
  )
}

function FormatForm({ busy, error, onSubmit }) {
  const [name, setName] = useState('Daily sales export')
  const [sourceSystem, setSourceSystem] = useState('Excel / CSV export')
  const [delimiter, setDelimiter] = useState(',')
  const [dateTimePattern, setDateTimePattern] = useState("yyyy-MM-dd'T'HH:mm:ss")
  const [currency, setCurrency] = useState('AZN')
  const [columns, setColumns] = useState(DEFAULT_COLUMNS)

  function updateColumn(field, value) {
    setColumns((current) => ({ ...current, [field]: value }))
  }

  function submit(event) {
    event.preventDefault()
    onSubmit({ name, sourceSystem, delimiter, dateTimePattern, currency, columns })
  }

  const mappings = [
    ['storeId', 'Store ID', false], ['receiptId', 'Receipt ID', false],
    ['timestamp', 'Transaction time', false], ['productCode', 'Product code', true],
    ['barcode', 'Barcode', true], ['productName', 'Product name', false],
    ['quantity', 'Quantity', false], ['unitPrice', 'Unit price', false],
    ['discountAmount', 'Discount amount', false], ['lineTotal', 'Line total', false],
  ]

  return (
    <section className="scan-panel onboarding-form-panel">
      <header><span className="scan-eyebrow">Step 2 of 4</span><h2>Describe the sales export</h2><p>Use names the retailer will recognize. Internal profile codes are generated automatically.</p></header>
      <form onSubmit={submit}>
        <div className="onboarding-form-grid">
          <Field label="Format name"><input required value={name} onChange={(event) => setName(event.target.value)} /></Field>
          <Field label="Source system"><input required value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value)} /></Field>
          <Field label="CSV separator"><select value={delimiter} onChange={(event) => setDelimiter(event.target.value)}><option value=",">Comma</option><option value=";">Semicolon</option><option value="\t">Tab</option></select></Field>
          <Field label="Currency"><select value={currency} onChange={(event) => setCurrency(event.target.value)}><option value="AZN">AZN — Azerbaijani manat</option><option value="TRY">TRY — Turkish lira</option><option value="USD">USD — US dollar</option><option value="EUR">EUR — Euro</option></select></Field>
          <Field label="Timestamp example"><select value={dateTimePattern} onChange={(event) => setDateTimePattern(event.target.value)}><option value="yyyy-MM-dd'T'HH:mm:ss">2026-09-17T14:30:00</option><option value="yyyy-MM-dd HH:mm:ss">2026-09-17 14:30:00</option><option value="dd.MM.yyyy HH:mm:ss">17.09.2026 14:30:00</option></select></Field>
        </div>
        <div className="onboarding-mapping-heading"><h3>Match source columns</h3><p>Enter the exact header shown in the retailer’s file.</p></div>
        <div className="onboarding-mapping-grid">
          {mappings.map(([field, label, optional]) => (
            <Field hint={optional ? 'Optional' : null} key={field} label={label}>
              <input required={!optional} value={columns[field]} onChange={(event) => updateColumn(field, event.target.value)} />
            </Field>
          ))}
        </div>
        {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
        <div className="onboarding-form-actions"><button className="scan-button scan-button-dark" disabled={busy} type="submit">{busy ? 'Saving format…' : 'Save import format'}</button></div>
      </form>
    </section>
  )
}

function SampleValidation({ busy, error, onContinue, onReplaceFormat, onValidate, result }) {
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')

  function selectFile(event) {
    const next = event.target.files?.[0] || null
    if (!next) return
    if (!SUPPORTED_FILE.test(next.name)) {
      setFileError('Choose a CSV, XLS, or XLSX file.')
      setFile(null)
    } else if (next.size > MAX_FILE_BYTES) {
      setFileError('The sample must be 25 MB or smaller.')
      setFile(null)
    } else {
      setFileError('')
      setFile(next)
    }
  }

  return (
    <section className="scan-panel onboarding-form-panel">
      <header><span className="scan-eyebrow">Step 3 of 4</span><h2>Validate a sample export</h2><p>SCAN reads and validates the sample without saving receipts, products, or sales.</p></header>
      <div className="onboarding-sample-boundary"><ScanIcon name="shield" /><p><strong>No production write</strong><span>This step checks structure, values, baskets, and registered store IDs only.</span></p></div>
      <label className="onboarding-file-picker"><input accept=".csv,.xls,.xlsx" onChange={selectFile} type="file" /><ScanIcon name="upload" size={22} /><span><strong>{file ? file.name : 'Choose a sample export'}</strong><small>CSV, XLS, or XLSX · maximum 25 MB</small></span></label>
      {fileError || error ? <div className="cci-form-error" role="alert">{fileError || error}</div> : null}
      <div className="onboarding-form-actions">
        {!result?.valid ? <button className="scan-button scan-button-secondary" disabled={busy} onClick={onReplaceFormat} type="button">Change import format</button> : null}
        {result?.valid
          ? <button className="scan-button scan-button-dark" onClick={onContinue} type="button">Continue to access</button>
          : <button className="scan-button scan-button-dark" disabled={!file || busy} onClick={() => onValidate(file)} type="button">{busy ? 'Validating sample…' : 'Validate sample'}</button>}
      </div>
      {result ? (
        <div className={`onboarding-validation-result ${result.valid ? 'is-valid' : 'is-invalid'}`} aria-live="polite">
          <header><ScanIcon name={result.valid ? 'check' : 'warning'} /><div><strong>{result.valid ? 'Sample accepted' : 'Sample needs correction'}</strong><span>{result.valid ? 'Production imports are now enabled for this format.' : 'Nothing was imported and production access remains locked.'}</span></div></header>
          <dl><div><dt>Rows checked</dt><dd>{result.rowsChecked.toLocaleString()}</dd></div><div><dt>Receipts detected</dt><dd>{result.receiptsDetected.toLocaleString()}</dd></div><div><dt>Product lines</dt><dd>{result.productLines.toLocaleString()}</dd></div></dl>
          {result.errors.length ? <ul>{result.errors.slice(0, 8).map((item) => <li key={item}>{item}</li>)}</ul> : null}
        </div>
      ) : null}
    </section>
  )
}

function CredentialIssue({ busy, error, issued, onIssue }) {
  async function copy(value) {
    if (navigator.clipboard) await navigator.clipboard.writeText(value)
  }

  return (
    <section className="scan-panel onboarding-form-panel">
      <header><span className="scan-eyebrow">Step 4 of 4</span><h2>Issue retailer access</h2><p>Create separate accounts for the shop owner, data administrator, and unattended connector.</p></header>
      {!issued ? (
        <>
          <div className="onboarding-credential-preview">
            <p><ScanIcon name="stores" /><span><strong>Retailer workspace</strong><small>Reads only this retailer’s operational analytics.</small></span></p>
            <p><ScanIcon name="connection" /><span><strong>Data connection</strong><small>Imports and maps data only for this retailer and format.</small></span></p>
            <p><ScanIcon name="sync" /><span><strong>POS connector</strong><small>Can upload files but cannot read analytics or mappings.</small></span></p>
          </div>
          {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
          <div className="onboarding-form-actions"><button className="scan-button scan-button-dark" disabled={busy} onClick={onIssue} type="button">{busy ? 'Issuing access…' : 'Issue credentials'}</button></div>
        </>
      ) : (
        <div className="onboarding-issued" aria-live="polite">
          <div className="onboarding-once-warning"><ScanIcon name="warning" /><p><strong>Copy these passwords now.</strong><span>SCAN stores only password hashes. These values cannot be displayed again.</span></p></div>
          <div className="onboarding-credential-list">
            {issued.credentials.map((credential) => (
              <article key={credential.purpose}>
                <h3>{credential.purpose}</h3>
                <dl><div><dt>Username</dt><dd>{credential.username}</dd></div><div><dt>Password</dt><dd>{credential.password}</dd></div></dl>
                <button className="scan-button scan-button-secondary" onClick={() => copy(`${credential.username}\n${credential.password}`)} type="button">Copy credentials</button>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}

function ReadyState({ access, busy, error, onRevoke, onRotate, retailer, rotated }) {
  const [confirming, setConfirming] = useState(null)
  return (
    <div className="scan-page-stack">
      <section className="scan-panel onboarding-ready">
        <span className="onboarding-ready-mark"><ScanIcon name="check" size={25} /></span>
        <div><span className="scan-eyebrow">Onboarding complete</span><h2>{retailer.name} is ready</h2><p>Its validated format can accept production imports. All accounts remain bound to retailer <strong>{retailer.code}</strong>.</p></div>
        <a className="scan-button scan-button-secondary" href="/?portal=connection">Open data connection</a>
      </section>
      <section className="scan-panel onboarding-access-panel">
        <header><span className="scan-eyebrow">Access control</span><h2>Retailer credentials</h2><p>Rotate a password after staff or connector changes. Revoke access immediately when it is no longer needed.</p></header>
        {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
        {rotated ? <div className="onboarding-once-warning"><ScanIcon name="warning" /><p><strong>Copy the new password now.</strong><span>{rotated.credential.username} · {rotated.password}</span></p></div> : null}
        <div className="onboarding-access-list">
          {access.map((item) => <article key={item.id}><div><StatusBadge tone={item.enabled ? 'success' : 'critical'}>{item.enabled ? 'Active' : 'Revoked'}</StatusBadge><strong>{item.purpose}</strong><small>{item.username}</small></div><div className="onboarding-access-actions"><button className="scan-button scan-button-secondary" disabled={busy || !item.enabled} onClick={() => onRotate(item.id)} type="button">Rotate password</button>{item.enabled ? <button className="scan-button scan-button-secondary" disabled={busy} onClick={() => confirming === item.id ? onRevoke(item.id) : setConfirming(item.id)} type="button">{confirming === item.id ? 'Confirm revoke' : 'Revoke'}</button> : null}</div></article>)}
        </div>
      </section>
    </div>
  )
}

export default function Onboarding() {
  const [credentials, setCredentials] = useState(null)
  const [operator, setOperator] = useState(null)
  const [retailers, setRetailers] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [creatingFormat, setCreatingFormat] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)
  const [sampleResult, setSampleResult] = useState(null)
  const [issued, setIssued] = useState(null)
  const [access, setAccess] = useState([])
  const [rotated, setRotated] = useState(null)

  const selected = useMemo(() => retailers.find((item) => item.id === selectedId) || null, [retailers, selectedId])
  const profile = selected?.importProfiles.at(-1) || null

  async function signIn(nextCredentials) {
    setLoginLoading(true)
    setLoginError('')
    try {
      const [context, items] = await Promise.all([
        fetchOnboardingContext(nextCredentials),
        fetchOnboardingRetailers(nextCredentials),
      ])
      setCredentials(nextCredentials)
      setOperator(context.operatorUsername)
      setRetailers(items)
      setSelectedId(items[0]?.id || null)
      setCreating(items.length === 0)
      if (items[0]?.credentialsIssued) {
        setAccess(await fetchOnboardingCredentials({ ...nextCredentials, retailerId: items[0].id }))
      }
    } catch (nextError) {
      setLoginError(nextError?.message || 'Unable to open retailer onboarding.')
    } finally {
      setLoginLoading(false)
    }
  }

  async function refresh(preferredId = selectedId) {
    const items = await fetchOnboardingRetailers(credentials)
    setRetailers(items)
    setSelectedId(items.some((item) => item.id === preferredId) ? preferredId : items[0]?.id || null)
    return items.find((item) => item.id === preferredId) || null
  }

  async function perform(action) {
    setBusy(true)
    setError('')
    try {
      return await action()
    } catch (nextError) {
      setError(nextError?.message || 'The onboarding step could not be completed.')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function createRetailer(request) {
    const created = await perform(() => createOnboardingRetailer({ ...credentials, request }))
    if (!created) return
    setRetailers((items) => [created, ...items])
    setSelectedId(created.id)
    setCreating(false)
    setCreatingFormat(false)
  }

  async function addStore(request) {
    const saved = await perform(() => addOnboardingStore({ ...credentials, retailerId: selected.id, request }))
    if (saved) await refresh(selected.id)
    return saved
  }

  async function createProfile(request) {
    const saved = await perform(() => createOnboardingProfile({ ...credentials, retailerId: selected.id, request }))
    if (saved) {
      await refresh(selected.id)
      setCreatingFormat(false)
      setSampleResult(null)
    }
  }

  async function validateSample(file) {
    const result = await perform(() => validateOnboardingSample({ ...credentials, retailerId: selected.id, profileId: profile.id, file }))
    if (!result) return
    setSampleResult(result)
    if (result.valid) await refresh(selected.id)
  }

  async function issueCredentials() {
    const result = await perform(() => issueOnboardingCredentials({ ...credentials, retailerId: selected.id, profileId: profile.id }))
    if (!result) return
    setIssued(result)
    await refresh(selected.id)
    setAccess(await fetchOnboardingCredentials({ ...credentials, retailerId: selected.id }))
  }

  async function loadAccess(retailerId) {
    try { setAccess(await fetchOnboardingCredentials({ ...credentials, retailerId })) }
    catch (nextError) { setError(nextError?.message || 'Unable to load retailer credentials.') }
  }

  async function rotateCredential(accountId) {
    const result = await perform(() => rotateOnboardingCredential({ ...credentials, retailerId: selected.id, accountId }))
    if (!result) return
    setRotated(result)
    await loadAccess(selected.id)
  }

  async function revokeCredential(accountId) {
    const result = await perform(() => revokeOnboardingCredential({ ...credentials, retailerId: selected.id, accountId }))
    if (!result) return
    setRotated(null)
    await loadAccess(selected.id)
  }

  function selectRetailer(id) {
    setSelectedId(id)
    setCreating(false)
    setCreatingFormat(false)
    setError('')
    setSampleResult(null)
    setIssued(null)
    setRotated(null)
    const retailer = retailers.find((item) => item.id === id)
    if (retailer?.credentialsIssued) loadAccess(id)
  }

  function signOut() {
    setCredentials(null)
    setOperator(null)
    setRetailers([])
    setSelectedId(null)
    setCreating(false)
    setCreatingFormat(false)
    setSampleResult(null)
    setIssued(null)
    setAccess([])
    setRotated(null)
  }

  if (!credentials) return <Login error={loginError} loading={loginLoading} onSubmit={signIn} />

  let content
  if (creating) {
    content = <RetailerForm busy={busy} error={error} onSubmit={createRetailer} />
  } else if (!selected) {
    content = <EmptyState title="No retailer selected">Create a retailer to begin onboarding.</EmptyState>
  } else if (!profile || creatingFormat) {
    content = <FormatForm busy={busy} error={error} onSubmit={createProfile} />
  } else if (profile.validationStatus !== 'VALIDATED' || sampleResult?.valid) {
    content = <SampleValidation busy={busy} error={error} onContinue={() => setSampleResult(null)} onReplaceFormat={() => { setCreatingFormat(true); setSampleResult(null); setError('') }} onValidate={validateSample} result={sampleResult} />
  } else if (!selected.credentialsIssued || issued) {
    content = <CredentialIssue busy={busy} error={error} issued={issued} onIssue={issueCredentials} />
  } else {
    content = <ReadyState access={access} busy={busy} error={error} onRevoke={revokeCredential} onRotate={rotateCredential} retailer={selected} rotated={rotated} />
  }

  const header = <WorkspaceHeader eyebrow="SCAN setup" title="Retailer onboarding" meta={<p>Create isolated access before production data arrives.</p>} actions={<button className="scan-button scan-button-dark" onClick={() => { setCreating(true); setCreatingFormat(false); setError(''); setIssued(null) }} type="button">New retailer</button>} />
  return (
    <WorkspaceShell activePage="retailers" accountLabel={operator} accountMeta="Onboarding operator" brandSubtitle="Retailer Setup" header={header} navItems={NAV_ITEMS} onNavigate={() => {}} onSignOut={signOut} portal="connection" privacyLabel="Cannot read retailer sales data">
      <div className="onboarding-layout">
        <aside className="onboarding-retailer-list" aria-label="Retailers">
          <header><span>Retailers</span><strong>{retailers.length}</strong></header>
          {retailers.map((retailer) => (
            <button aria-current={!creating && selectedId === retailer.id ? 'true' : undefined} className={!creating && selectedId === retailer.id ? 'is-active' : ''} key={retailer.id} onClick={() => selectRetailer(retailer.id)} type="button">
              <span>{retailer.name}</span><small>{retailer.code}</small>
              <StatusBadge tone={retailer.credentialsIssued ? 'success' : retailer.importEnabled ? 'warning' : 'neutral'}>{retailer.credentialsIssued ? 'Ready' : retailer.importEnabled ? 'Access pending' : 'Setup'}</StatusBadge>
            </button>
          ))}
        </aside>
        <main className="onboarding-workspace">
          {!creating && selected ? (
            <>
              <section className="onboarding-retailer-heading"><div><span className="scan-eyebrow">Retailer tenant</span><h2>{selected.name}</h2><p>{selected.code} · {selected.zoneId}</p></div><AddStoreForm busy={busy} error={error} onSubmit={addStore} /></section>
              <div className="onboarding-store-strip">{selected.stores.map((store) => <span key={store.id}><strong>{store.name}</strong><small>{store.externalStoreId}</small></span>)}</div>
            </>
          ) : null}
          <StepRail retailer={creating ? null : selected} />
          {content}
        </main>
      </div>
    </WorkspaceShell>
  )
}
