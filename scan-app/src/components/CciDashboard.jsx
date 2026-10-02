import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ScanApiError, fetchAnalyticsContext, fetchOverview, setCommercialRole as putCommercialRole } from '../services/scanApi'
import {
  addInvestigationNote,
  askCopilot,
  closeInvestigation,
  confirmHypothesis,
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
  fetchProductDetail,
  fetchStoreDetail,
  fetchWatchlist,
  fetchWatchlistChanges,
  followProduct,
  openGeneralInvestigation,
  openProductInvestigation,
  recordFieldTaskResult,
  rejectHypothesis,
  reopenInvestigation,
  unfollowProduct,
} from '../services/intelligenceApi'
import ScanBrand from './ScanBrand'
import ScanIcon from './ScanIcon'
import { usePretextLayout } from './usePretextLayout'
import {
  ChartPanel,
  DataFreshness,
  EmptyState,
  LoadingState,
  MetricStrip,
  PageIntro,
  SegmentedControl,
  StatusBadge,
  WorkspaceHeader,
  WorkspaceShell,
} from './WorkspaceUI'
import './CciDashboard.css'

// "Investigate" and "Activations" are deliberately not primary nav items: investigation is an
// action from an insight/product/store, not a destination you pick first, and Activations has no
// real end-to-end test-track-measure workflow yet. Both stay fully reachable (activePage can be
// set to them programmatically) - they're just not things to browse to.
const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'home' },
  { id: 'insights', label: 'Insights', icon: 'alerts' },
  { id: 'stores', label: 'Stores', icon: 'database' },
  { id: 'products', label: 'Products', icon: 'products' },
  { id: 'copilot', label: 'AI Assistant', icon: 'ask' },
]

const DEFAULT_PERIOD_DAYS = 14

// Network-wide pages (Overview/Insights/Stores/Products) share one period control, independent
// of the per-retailer DEFAULT_PERIOD_DAYS the legacy My Work/Investigate flows still use.
const PERIOD_OPTIONS = [
  { value: 7, label: '7D' },
  { value: 30, label: '30D' },
  { value: 90, label: '90D' },
]
const DEFAULT_NETWORK_PERIOD_DAYS = 30

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

function formatMoney(value, currency) {
  const amount = Number(value || 0)
  if (!currency || currency === 'N/A' || currency === 'MULTI') return `${amount.toFixed(2)} ${currency || ''}`.trim()
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function formatDateTime(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatRelativeTime(value) {
  if (!value) return 'Update time unavailable'
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime())
  const minutes = Math.floor(elapsed / 60000)
  if (minutes < 1) return 'Updated just now'
  if (minutes < 60) return `Updated ${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Updated ${hours} hr ago`
  const days = Math.floor(hours / 24)
  return `Updated ${days} day${days === 1 ? '' : 's'} ago`
}

function humanize(value) {
  return `${value || ''}`.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function statusTone(status) {
  if (status === 'CLOSED' || status === 'COMPLETED' || status === 'CONFIRMED') return 'success'
  if (status === 'IN_PROGRESS' || status === 'OPEN') return 'warning'
  if (status === 'REJECTED') return 'neutral'
  return 'neutral'
}

function confidenceTone(confidence) {
  if (confidence === 'HIGH') return 'red'
  if (confidence === 'MEDIUM') return 'warning'
  return 'neutral'
}

function Login({ error, loading, onSubmit }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  function submit(event) {
    event.preventDefault()
    onSubmit({ username: username.trim(), password })
  }

  return (
    <main className="cci-login-shell">
      <section className="cci-login-card" aria-labelledby="cci-login-title">
        <ScanBrand subtitle="Sales & Consumption Analytics Network" />
        <div className="cci-login-copy">
          <span className="cci-eyebrow">CCI commercial intelligence workspace</span>
          <h1 id="cci-login-title">From every basket to the next decision.</h1>
          <p>Detect what changed, investigate why, and turn it into a field check, an activation, or a decision — without leaving SCAN.</p>
        </div>
        <form className="cci-login-form" onSubmit={submit}>
          <label>Username<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Password<input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <p className="cci-login-context"><strong>Retailer access is assigned to this account.</strong> SCAN opens only approved aggregate data after sign-in.</p>
          {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
          <button className="cci-primary-button" disabled={loading} type="submit">{loading ? 'Connecting…' : 'Open workspace'}</button>
        </form>
        <div className="portal-switch-links">
          <a className="portal-switch-link" href="/?portal=retailer">Retailer owner portal <span aria-hidden="true">→</span></a>
          <a className="portal-switch-link" href="/?portal=connection">Data connection <span aria-hidden="true">→</span></a>
          <a className="portal-switch-link" href="/?portal=onboarding">Retailer onboarding <span aria-hidden="true">→</span></a>
        </div>
      </section>
    </main>
  )
}

/* ------------------------------------------------------------------ */
/* My Work                                                             */
/* ------------------------------------------------------------------ */

function NeedsAttentionCard({ mover, onInvestigate, onAsk, busy }) {
  const declined = mover.basketChangePct < 0
  return (
    <article className="cci-work-card">
      <header>
        <StatusBadge tone={declined ? 'warning' : 'success'}>{declined ? 'Declining' : 'Rising'}</StatusBadge>
      </header>
      <h3>{mover.productName}{declined ? ' is down' : ' is up'} {decimal.format(Math.abs(mover.basketChangePct))}%</h3>
      <p>{integer.format(mover.recentBaskets)} baskets recently vs. {integer.format(mover.priorBaskets)} in the prior period. {mover.category ? `Category: ${mover.category}.` : ''}</p>
      <div className="cci-work-card-actions">
        <button className="scan-button scan-button-dark" disabled={busy} onClick={() => onInvestigate(mover.productName)} type="button">Investigate</button>
        <button className="scan-button scan-button-light" onClick={() => onAsk(mover.productName)} type="button">Ask Copilot</button>
      </div>
    </article>
  )
}

function WorkListCard({ title, meta, badgeLabel, badgeTone, onOpen }) {
  return (
    <button className="cci-work-list-item" onClick={onOpen} type="button">
      <div>
        <strong>{title}</strong>
        <small>{meta}</small>
      </div>
      <StatusBadge tone={badgeTone}>{badgeLabel}</StatusBadge>
    </button>
  )
}

const MEETING_TEMPLATES = [
  { value: 'WEEKLY_SALES_REVIEW', label: 'Weekly Sales Review' },
  { value: 'TRADE_MARKETING_REVIEW', label: 'Trade Marketing Review' },
  { value: 'CATEGORY_REVIEW', label: 'Category Review' },
  { value: 'DISTRIBUTOR_MEETING', label: 'Distributor Meeting' },
  { value: 'MANAGEMENT_UPDATE', label: 'Management Update' },
  { value: 'MONTHLY_COMMERCIAL_REVIEW', label: 'Monthly Commercial Review' },
]

function MeetingBriefPanel({ onPrepare }) {
  const [template, setTemplate] = useState('WEEKLY_SALES_REVIEW')
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(false)

  async function prepare() {
    setLoading(true)
    try {
      setBrief(await onPrepare(template))
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="cci-home-section cci-meeting-brief">
      <header className="cci-home-section-heading">
        <div><span className="scan-eyebrow">Meeting prep</span><h2>Prepare a review</h2></div>
        <div className="cci-meeting-controls">
          <select onChange={(event) => setTemplate(event.target.value)} value={template}>
            {MEETING_TEMPLATES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
          <button className="scan-button scan-button-dark" disabled={loading} onClick={prepare} type="button">{loading ? 'Preparing…' : 'Prepare'}</button>
        </div>
      </header>
      {brief ? (
        <div className="cci-brief-grid">
          <p className="cci-brief-summary">{brief.networkSummary}</p>
          <div><h4>Issues requiring a decision</h4>{brief.issuesRequiringDecision.length ? <ul>{brief.issuesRequiringDecision.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>None open.</p>}</div>
          <div><h4>Field execution</h4><ul>{brief.fieldExecution.map((item, index) => <li key={index}>{item}</li>)}</ul></div>
          <div><h4>Completed since last review</h4>{brief.completedActions.length ? <ul>{brief.completedActions.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>Nothing closed in this window.</p>}</div>
          <div><h4>Risks</h4>{brief.risks.length ? <ul>{brief.risks.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No real declines flagged.</p>}</div>
          <div><h4>Top opportunities</h4>{brief.topOpportunities.length ? <ul>{brief.topOpportunities.map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No real gains flagged.</p>}</div>
          <small>{brief.limitations}</small>
        </div>
      ) : null}
    </section>
  )
}

// Unlike auto-detected movers (which only surface once a change clears a support/magnitude
// floor), a followed product's real current comparison always shows here - the team asked for it
// specifically, so there's no threshold to clear. See WatchlistService on the backend.
function WatchingSection({ watchlist, watchlistChanges, productOptions, onFollow, onUnfollow }) {
  const [productName, setProductName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [busyItemId, setBusyItemId] = useState(null)

  async function submit(event) {
    event.preventDefault()
    if (!productName.trim()) return
    setSubmitting(true)
    try {
      await onFollow(productName.trim())
      setProductName('')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleUnfollow(itemId) {
    setBusyItemId(itemId)
    try {
      await onUnfollow(itemId)
    } finally {
      setBusyItemId(null)
    }
  }

  return (
    <section className="cci-home-section">
      <header className="cci-home-section-heading"><div><span className="scan-eyebrow">Explicitly followed</span><h2>Watching</h2></div></header>
      <form className="cci-watch-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="cci-watch-product">Follow a product</label>
        <input id="cci-watch-product" list="cci-watch-product-options" onChange={(event) => setProductName(event.target.value)} placeholder="Follow a product…" value={productName} />
        <datalist id="cci-watch-product-options">{productOptions.map((name) => <option key={name} value={name} />)}</datalist>
        <button className="scan-button scan-button-dark" disabled={submitting || !productName.trim()} type="submit">Follow</button>
      </form>
      {watchlist.length ? (
        <div className="cci-watch-list">
          {watchlist.map((item) => {
            const change = watchlistChanges.find((entry) => entry.productName === item.productName)
            return (
              <div className="cci-watch-row" key={item.id}>
                <div>
                  <strong>{item.productName}</strong>
                  <small>
                    {change
                      ? `${integer.format(change.recentBaskets)} baskets recently vs. ${integer.format(change.priorBaskets)} before (${change.basketChangePct >= 0 ? '+' : ''}${decimal.format(change.basketChangePct)}%)`
                      : 'No comparison data yet'}
                  </small>
                </div>
                <button className="scan-button scan-button-light" disabled={busyItemId === item.id} onClick={() => handleUnfollow(item.id)} type="button">Unfollow</button>
              </div>
            )
          })}
        </div>
      ) : <EmptyState compact title="Not watching anything yet">Follow a product to always see its real current numbers here, regardless of size.</EmptyState>}
    </section>
  )
}

function FieldChecksList({ openTasks, onNavigate }) {
  return openTasks.length ? (
    <div className="cci-work-list">
      {openTasks.map((item) => {
        const done = item.stores.filter((store) => store.completed).length
        return (
          <WorkListCard badgeLabel={`${done}/${item.stores.length} done`} badgeTone="warning" key={item.id} meta={`Assigned to ${item.assignedTo}`} onOpen={() => onNavigate('investigate')} title={item.title} />
        )
      })}
    </div>
  ) : <EmptyState compact title="No field checks waiting">Create one from an investigation when you need real-world confirmation.</EmptyState>
}

function MyWork({
  credentials, movers, investigations, fieldTasks, watchlist, watchlistChanges, productOptions,
  intelligenceLoading, intelligenceError, onOpenInvestigation, onStartProductInvestigation,
  onAskAbout, onNavigate, onPrepareBrief, onFollow, onUnfollow, commercialRole, embedded = false,
}) {
  const [busyProduct, setBusyProduct] = useState(null)
  const isFieldSales = commercialRole === 'FIELD_SALES'
  const inProgress = investigations.filter((item) => item.status === 'IN_PROGRESS')
  const openTasks = fieldTasks.filter((item) => item.status === 'OPEN')
  const recentlyClosedInvestigations = investigations
    .filter((item) => item.status === 'CLOSED')
    .sort((a, b) => new Date(b.closedAt || 0) - new Date(a.closedAt || 0))
    .slice(0, 5)
  const recentlyCompletedTasks = fieldTasks
    .filter((item) => item.status === 'COMPLETED')
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
    .slice(0, 5)

  const investigatedProductNames = new Set(
    investigations.filter((item) => item.subjectType === 'PRODUCT').map((item) => item.subjectName)
  )
  const needsAttention = movers.filter((mover) => !investigatedProductNames.has(mover.productName)).slice(0, 4)

  async function handleInvestigate(productName) {
    setBusyProduct(productName)
    try {
      await onStartProductInvestigation(productName)
    } finally {
      setBusyProduct(null)
    }
  }

  const itemCount = needsAttention.length + inProgress.length + openTasks.length

  return (
    <div className={embedded ? 'scan-page-stack cci-my-work cci-my-work-embedded' : 'scan-page-stack cci-my-work'}>
      {embedded ? (
        <header className="cci-home-section-heading">
          <div><span className="scan-eyebrow">Your work</span><h2>Investigations, field checks &amp; watchlist</h2></div>
        </header>
      ) : (
        <section className="cci-discovery-hero">
          <span className="scan-eyebrow">My Work</span>
          <h2>{itemCount > 0 ? `${itemCount} item${itemCount === 1 ? '' : 's'} need your attention` : 'Everything is caught up'}</h2>
          <p>{credentials.retailerCode === 'KAGGLE' ? 'Demo retailer' : ''} {itemCount === 0 ? 'No declines flagged, nothing open, and no field checks waiting.' : 'Review what changed, what is in progress, and what is waiting on the field team.'}</p>
        </section>
      )}

      {intelligenceError ? <div className="scan-inline-notice scan-inline-error" role="alert">{intelligenceError}</div> : null}

      {isFieldSales ? (
        <section className="cci-home-section">
          <header className="cci-home-section-heading"><div><span className="scan-eyebrow">Assigned to you</span><h2>Field checks waiting on you</h2></div></header>
          <FieldChecksList onNavigate={onNavigate} openTasks={openTasks} />
        </section>
      ) : null}

      <section className="cci-home-section">
        <header className="cci-home-section-heading"><div><span className="scan-eyebrow">Detected changes</span><h2>Needs attention</h2></div></header>
        {intelligenceLoading ? <p className="cci-work-loading">Scanning for real changes…</p> : needsAttention.length ? (
          <div className="cci-work-grid">
            {needsAttention.map((mover) => (
              <NeedsAttentionCard busy={busyProduct === mover.productName} key={mover.productName} mover={mover} onAsk={onAskAbout} onInvestigate={handleInvestigate} />
            ))}
          </div>
        ) : <EmptyState compact title="No new changes detected">No CCI product moved enough in the last {DEFAULT_PERIOD_DAYS} days to flag, or every real decline already has an open investigation.</EmptyState>}
      </section>

      <WatchingSection onFollow={onFollow} onUnfollow={onUnfollow} productOptions={productOptions} watchlist={watchlist} watchlistChanges={watchlistChanges} />

      <div className={isFieldSales ? 'cci-my-work-columns' : 'scan-two-column cci-my-work-columns'}>
        <section className="cci-home-section">
          <header className="cci-home-section-heading"><div><h3>In progress</h3></div></header>
          {inProgress.length ? (
            <div className="cci-work-list">
              {inProgress.map((item) => (
                <WorkListCard badgeLabel={humanize(item.status)} badgeTone={statusTone(item.status)} key={item.id} meta={`${item.hypotheses.length} hypothesis(es) · ${item.notes.length} note(s)`} onOpen={() => onOpenInvestigation(item.id)} title={item.title} />
              ))}
            </div>
          ) : <EmptyState compact title="Nothing in progress">Open an investigation to start one.</EmptyState>}
        </section>
        {isFieldSales ? null : (
          <section className="cci-home-section">
            <header className="cci-home-section-heading"><div><h3>Waiting on team</h3></div></header>
            <FieldChecksList onNavigate={onNavigate} openTasks={openTasks} />
          </section>
        )}
      </div>

      <section className="cci-home-section">
        <header className="cci-home-section-heading"><div><h3>Recently completed</h3></div></header>
        {recentlyClosedInvestigations.length || recentlyCompletedTasks.length ? (
          <div className="cci-work-list">
            {recentlyClosedInvestigations.map((item) => (
              <WorkListCard badgeLabel="Closed" badgeTone="success" key={item.id} meta={`Closed ${formatRelativeTime(item.closedAt)}`} onOpen={() => onOpenInvestigation(item.id)} title={item.title} />
            ))}
            {recentlyCompletedTasks.map((item) => (
              <WorkListCard badgeLabel="Field check complete" badgeTone="success" key={item.id} meta={`Completed ${formatRelativeTime(item.updatedAt)}`} onOpen={() => onNavigate('investigate')} title={item.title} />
            ))}
          </div>
        ) : <EmptyState compact title="Nothing completed yet">Closed investigations and finished field checks will appear here.</EmptyState>}
      </section>

      <MeetingBriefPanel onPrepare={onPrepareBrief} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Investigate                                                         */
/* ------------------------------------------------------------------ */

function StartInvestigationForm({ productOptions, onStartProduct, onStartGeneral, onCancel }) {
  const [mode, setMode] = useState('product')
  const [productName, setProductName] = useState('')
  const [title, setTitle] = useState('')
  const [question, setQuestion] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      if (mode === 'product') await onStartProduct(productName.trim())
      else await onStartGeneral({ title: title.trim(), question: question.trim() })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="cci-start-investigation" onSubmit={submit}>
      <SegmentedControl label="Start from" onChange={setMode} options={[{ value: 'product', label: 'A product' }, { value: 'general', label: 'A question' }]} value={mode} />
      {mode === 'product' ? (
        <label>Product
          <input list="cci-product-options" onChange={(event) => setProductName(event.target.value)} placeholder="e.g. Sprite 500ml" required value={productName} />
          <datalist id="cci-product-options">{productOptions.map((name) => <option key={name} value={name} />)}</datalist>
        </label>
      ) : (
        <>
          <label>Title<input onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Why is the north region soft?" required value={title} /></label>
          <label>Question<input onChange={(event) => setQuestion(event.target.value)} placeholder="What changed?" required value={question} /></label>
        </>
      )}
      <div className="cci-form-actions">
        <button className="scan-button scan-button-light" onClick={onCancel} type="button">Cancel</button>
        <button className="scan-button scan-button-dark" disabled={submitting} type="submit">{submitting ? 'Starting…' : 'Start investigation'}</button>
      </div>
    </form>
  )
}

function HypothesisCard({ hypothesis, onConfirm, onReject, busy }) {
  return (
    <article className="cci-hypothesis">
      <header>
        <StatusBadge tone={confidenceTone(hypothesis.confidence)}>{hypothesis.confidence} confidence</StatusBadge>
        <StatusBadge tone={statusTone(hypothesis.status)}>{humanize(hypothesis.status)}</StatusBadge>
      </header>
      <p className="cci-hypothesis-statement">{hypothesis.statement}</p>
      <dl>
        <div><dt>Supporting evidence</dt><dd>{hypothesis.supportingEvidence}</dd></div>
        {hypothesis.contradictingEvidence ? <div><dt>What we still don't know</dt><dd>{hypothesis.contradictingEvidence}</dd></div> : null}
      </dl>
      {hypothesis.status === 'OPEN' ? (
        <div className="cci-form-actions">
          <button className="scan-button scan-button-light" disabled={busy} onClick={() => onReject(hypothesis.id)} type="button">Reject</button>
          <button className="scan-button scan-button-dark" disabled={busy} onClick={() => onConfirm(hypothesis.id)} type="button">Confirm</button>
        </div>
      ) : null}
    </article>
  )
}

function CreateFieldTaskForm({ stores, defaultReason, onCreate, onCancel }) {
  const [title, setTitle] = useState('')
  const [reason, setReason] = useState(defaultReason || '')
  const [assignedTo, setAssignedTo] = useState('Field Sales Team')
  const [selectedStores, setSelectedStores] = useState([])
  const [submitting, setSubmitting] = useState(false)

  function toggleStore(storeId) {
    setSelectedStores((current) => current.includes(storeId) ? current.filter((id) => id !== storeId) : [...current, storeId])
  }

  async function submit(event) {
    event.preventDefault()
    if (!selectedStores.length) return
    setSubmitting(true)
    try {
      await onCreate({ title: title.trim(), reason: reason.trim(), assignedTo: assignedTo.trim(), storeIds: selectedStores })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="cci-create-field-task" onSubmit={submit}>
      <label>What should the field team check?<input onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Check Sprite availability" required value={title} /></label>
      <label>Why<input onChange={(event) => setReason(event.target.value)} placeholder="Evidence-linked reason" required value={reason} /></label>
      <label>Assigned to<input onChange={(event) => setAssignedTo(event.target.value)} required value={assignedTo} /></label>
      <fieldset className="cci-store-picker">
        <legend>Target stores</legend>
        {stores.length ? stores.map((store) => (
          <label className="cci-store-checkbox" key={store.storeId}>
            <input checked={selectedStores.includes(store.storeId)} onChange={() => toggleStore(store.storeId)} type="checkbox" />
            {store.storeId}
          </label>
        )) : <p>No reporting stores are available yet.</p>}
      </fieldset>
      <div className="cci-form-actions">
        <button className="scan-button scan-button-light" onClick={onCancel} type="button">Cancel</button>
        <button className="scan-button scan-button-dark" disabled={submitting || !selectedStores.length} type="submit">{submitting ? 'Creating…' : 'Create field check'}</button>
      </div>
    </form>
  )
}

function FieldTaskChecklist({ task, onRecordResult }) {
  return (
    <div className="cci-field-task-card">
      <header>
        <strong>{task.title}</strong>
        <StatusBadge tone={statusTone(task.status)}>{humanize(task.status)}</StatusBadge>
      </header>
      <p>{task.reason}</p>
      <ul className="cci-field-task-stores">
        {task.stores.map((store) => (
          <FieldTaskStoreRow key={store.id} onRecord={(result) => onRecordResult(task.id, store.externalStoreId, result)} store={store} />
        ))}
      </ul>
    </div>
  )
}

function FieldTaskStoreRow({ store, onRecord }) {
  const [editing, setEditing] = useState(false)
  const [stockAvailable, setStockAvailable] = useState(true)
  const [visibleInCooler, setVisibleInCooler] = useState(true)
  const [correctPlacement, setCorrectPlacement] = useState(true)
  const [competitorPresent, setCompetitorPresent] = useState(false)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (store.completed) {
    return (
      <li className="cci-field-task-store is-done">
        <div><strong>{store.externalStoreId}</strong><small>{store.hasIssue ? 'Issue found' : 'No issue found'}{store.note ? ` · ${store.note}` : ''}</small></div>
        <StatusBadge tone="success">Checked</StatusBadge>
      </li>
    )
  }

  if (!editing) {
    return (
      <li className="cci-field-task-store">
        <strong>{store.externalStoreId}</strong>
        <button className="scan-button scan-button-light" onClick={() => setEditing(true)} type="button">Record result</button>
      </li>
    )
  }

  async function submit(event) {
    event.preventDefault()
    setSubmitting(true)
    try {
      await onRecord({ stockAvailable, visibleInCooler, correctPlacement, competitorPresent, note: note.trim() || null })
      setEditing(false)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <li className="cci-field-task-store is-editing">
      <form onSubmit={submit}>
        <strong>{store.externalStoreId}</strong>
        <label><input checked={stockAvailable} onChange={(event) => setStockAvailable(event.target.checked)} type="checkbox" /> In stock</label>
        <label><input checked={visibleInCooler} onChange={(event) => setVisibleInCooler(event.target.checked)} type="checkbox" /> Visible in cooler</label>
        <label><input checked={correctPlacement} onChange={(event) => setCorrectPlacement(event.target.checked)} type="checkbox" /> Correct placement</label>
        <label><input checked={competitorPresent} onChange={(event) => setCompetitorPresent(event.target.checked)} type="checkbox" /> Competitor nearby</label>
        <label className="cci-field-task-note">Note<input onChange={(event) => setNote(event.target.value)} placeholder="Optional" value={note} /></label>
        <div className="cci-form-actions">
          <button className="scan-button scan-button-light" onClick={() => setEditing(false)} type="button">Cancel</button>
          <button className="scan-button scan-button-dark" disabled={submitting} type="submit">{submitting ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </li>
  )
}

function InvestigationDetail({
  investigation, fieldTasks, stores, allInvestigations, onBack, onAddNote, onConfirmHypothesis, onRejectHypothesis,
  onClose, onReopen, onCreateFieldTask, onRecordFieldTaskResult, onAskCopilot,
}) {
  const [noteBody, setNoteBody] = useState('')
  const [showFieldTaskForm, setShowFieldTaskForm] = useState(false)
  const [busyHypothesis, setBusyHypothesis] = useState(null)
  const systemNotes = investigation.notes.filter((note) => note.system)
  const humanNotes = investigation.notes.filter((note) => !note.system)
  const linkedTasks = fieldTasks.filter((task) => task.investigationId === investigation.id)
  // SCAN's "have we seen this before" memory - computed from the same stored records the
  // investigation list already holds, never an invented summary of what probably happened.
  const priorCases = investigation.subjectType === 'PRODUCT'
    ? allInvestigations.filter((item) => item.id !== investigation.id
        && item.subjectType === 'PRODUCT' && item.subjectName === investigation.subjectName)
    : []

  async function submitNote(event) {
    event.preventDefault()
    if (!noteBody.trim()) return
    await onAddNote(noteBody.trim())
    setNoteBody('')
  }

  async function handleConfirm(hypothesisId) {
    setBusyHypothesis(hypothesisId)
    try { await onConfirmHypothesis(hypothesisId) } finally { setBusyHypothesis(null) }
  }
  async function handleReject(hypothesisId) {
    setBusyHypothesis(hypothesisId)
    try { await onRejectHypothesis(hypothesisId) } finally { setBusyHypothesis(null) }
  }

  return (
    <div className="scan-page-stack cci-investigation-detail">
      <button className="scan-text-link cci-back-link" onClick={onBack} type="button"><ScanIcon name="chevron" size={16} />Back to investigations</button>
      <PageIntro
        aside={<StatusBadge tone={statusTone(investigation.status)}>{humanize(investigation.status)}</StatusBadge>}
        description={investigation.question}
        eyebrow={humanize(investigation.subjectType)}
        title={investigation.title}
      />

      <section className="scan-panel">
        <header className="scan-panel-header"><div><h3>What changed</h3></div></header>
        {systemNotes.length ? systemNotes.map((note) => <p className="cci-system-note" key={note.id}>{note.body}</p>) : <EmptyState compact title="No detected change on record">This investigation started from a manual question.</EmptyState>}
      </section>

      <section className="scan-panel">
        <header className="scan-panel-header"><div><h3>Possible explanations</h3><p>Never presented as fact — each needs evidence to confirm or reject.</p></div></header>
        {investigation.hypotheses.length ? (
          <div className="cci-hypothesis-list">
            {investigation.hypotheses.map((hypothesis) => (
              <HypothesisCard busy={busyHypothesis === hypothesis.id} hypothesis={hypothesis} key={hypothesis.id} onConfirm={handleConfirm} onReject={handleReject} />
            ))}
          </div>
        ) : <EmptyState compact title="No hypotheses yet">SCAN did not find a strong enough signal to propose one. Add one manually as evidence comes in.</EmptyState>}
      </section>

      {investigation.subjectType === 'PRODUCT' ? (
        <section className="scan-panel">
          <header className="scan-panel-header"><div><h3>Seen before</h3><p>Only real, stored investigations into this product - never a guess about past results.</p></div></header>
          {priorCases.length ? (
            <ul className="cci-prior-cases">
              {priorCases.map((item) => (
                <li key={item.id}>
                  <StatusBadge tone={statusTone(item.status)}>{humanize(item.status)}</StatusBadge>
                  <span>{item.title}</span>
                  <small>{formatRelativeTime(item.createdAt)}</small>
                </li>
              ))}
            </ul>
          ) : <EmptyState compact title="No prior cases on record">This is the first time SCAN has investigated this product.</EmptyState>}
        </section>
      ) : null}

      <section className="scan-panel">
        <header className="scan-panel-header"><div><h3>Field checks</h3></div></header>
        {linkedTasks.length ? (
          <div className="cci-field-task-list">
            {linkedTasks.map((task) => <FieldTaskChecklist key={task.id} onRecordResult={onRecordFieldTaskResult} task={task} />)}
          </div>
        ) : <EmptyState compact title="No field check created yet">Create one to get real-world confirmation.</EmptyState>}
        {showFieldTaskForm ? (
          <CreateFieldTaskForm
            defaultReason={investigation.hypotheses[0]?.supportingEvidence || ''}
            onCancel={() => setShowFieldTaskForm(false)}
            onCreate={async (payload) => { await onCreateFieldTask(payload); setShowFieldTaskForm(false) }}
            stores={stores}
          />
        ) : (
          <button className="scan-button scan-button-light" onClick={() => setShowFieldTaskForm(true)} type="button">Create field check</button>
        )}
      </section>

      <section className="scan-panel">
        <header className="scan-panel-header"><div><h3>Notes</h3></div></header>
        <div className="cci-notes-thread">
          {humanNotes.length ? humanNotes.map((note) => (
            <div className="cci-note" key={note.id}><strong>{note.authorUsername}</strong><p>{note.body}</p><small>{formatRelativeTime(note.createdAt)}</small></div>
          )) : <p className="cci-work-loading">No notes from the team yet.</p>}
        </div>
        <form className="cci-add-note" onSubmit={submitNote}>
          <label className="sr-only" htmlFor="cci-note-body">Add a note</label>
          <input id="cci-note-body" onChange={(event) => setNoteBody(event.target.value)} placeholder="Add a note…" value={noteBody} />
          <button className="scan-button scan-button-dark" type="submit">Add</button>
        </form>
      </section>

      <section className="cci-next-steps">
        <button className="scan-button scan-button-light" onClick={() => onAskCopilot(investigation.id)} type="button"><ScanIcon name="ask" size={16} />Ask Copilot about this</button>
        {investigation.status === 'CLOSED' ? (
          <button className="scan-button scan-button-light" onClick={onReopen} type="button">Reopen</button>
        ) : (
          <button className="scan-button scan-button-light" onClick={onClose} type="button">Close investigation</button>
        )}
      </section>
    </div>
  )
}

function Investigate({
  investigations, fieldTasks, data, selectedInvestigationId, onSelect, onBack, productOptions,
  onStartProduct, onStartGeneral, onAddNote, onConfirmHypothesis, onRejectHypothesis, onClose, onReopen,
  onCreateFieldTask, onRecordFieldTaskResult, onAskCopilot, loading, loadError,
}) {
  const [showStartForm, setShowStartForm] = useState(false)
  const [searchText, setSearchText] = useState('')
  const selected = investigations.find((item) => item.id === selectedInvestigationId)

  if (selected) {
    return (
      <InvestigationDetail
        allInvestigations={investigations}
        fieldTasks={fieldTasks}
        investigation={selected}
        onAddNote={onAddNote}
        onAskCopilot={onAskCopilot}
        onBack={onBack}
        onClose={() => onClose(selected.id)}
        onConfirmHypothesis={(hypothesisId) => onConfirmHypothesis(selected.id, hypothesisId)}
        onCreateFieldTask={(payload) => onCreateFieldTask({ ...payload, investigationId: selected.id })}
        onRecordFieldTaskResult={onRecordFieldTaskResult}
        onRejectHypothesis={(hypothesisId) => onRejectHypothesis(selected.id, hypothesisId)}
        onReopen={() => onReopen(selected.id)}
        stores={data.stores}
      />
    )
  }

  return (
    <div className="scan-page-stack">
      <PageIntro
        aside={<button className="scan-button scan-button-dark" onClick={() => setShowStartForm((value) => !value)} type="button">{showStartForm ? 'Cancel' : 'Start investigation'}</button>}
        description="A business investigation workspace: what changed, why it might have changed, and what to do next."
        eyebrow="Investigate"
        title="Real questions, with real evidence."
      />
      {loadError ? <div className="scan-inline-notice scan-inline-error" role="alert">{loadError}</div> : null}
      {showStartForm ? (
        <section className="scan-panel">
          <StartInvestigationForm
            onCancel={() => setShowStartForm(false)}
            onStartGeneral={async (payload) => { const created = await onStartGeneral(payload); setShowStartForm(false); onSelect(created.id) }}
            onStartProduct={async (productName) => { const created = await onStartProduct(productName); setShowStartForm(false); onSelect(created.id) }}
            productOptions={productOptions}
          />
        </section>
      ) : null}
      {investigations.length ? (
        <label className="cci-investigation-search">Search investigations
          <input onChange={(event) => setSearchText(event.target.value)} placeholder="Search by title or question…" value={searchText} />
        </label>
      ) : null}
      {loading ? <p className="cci-work-loading">Loading investigations…</p> : investigations.length ? (
        (() => {
          const needle = searchText.trim().toLowerCase()
          const visible = needle
            ? investigations.filter((item) => item.title.toLowerCase().includes(needle) || item.question.toLowerCase().includes(needle))
            : investigations
          return visible.length ? (
            <div className="cci-investigation-list">
              {visible.map((item) => (
                <button className="cci-investigation-row" key={item.id} onClick={() => onSelect(item.id)} type="button">
                  <div>
                    <StatusBadge tone={statusTone(item.status)}>{humanize(item.status)}</StatusBadge>
                    <strong>{item.title}</strong>
                    <small>{item.hypotheses.length} hypothesis(es) · {item.notes.length} note(s) · {formatRelativeTime(item.updatedAt)}</small>
                  </div>
                  <ScanIcon name="chevron" size={18} />
                </button>
              ))}
            </div>
          ) : <EmptyState compact title="No investigations match that search">Try a different word from the title or question.</EmptyState>
        })()
      ) : <EmptyState title="No active investigations">Start from a commercial question, or investigate a detected change from My Work.</EmptyState>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Copilot                                                              */
/* ------------------------------------------------------------------ */

function CopilotAnswerView({ answer }) {
  return (
    <section className="scan-answer cci-structured-answer" aria-live="polite">
      <StatusBadge tone={confidenceTone(answer.confidence)}>{answer.confidence} confidence</StatusBadge>
      <div className="cci-answer-block"><span>What SCAN found</span><h3>{answer.whatScanFound}</h3></div>
      <div className="cci-answer-block"><span>Why this matters</span><p>{answer.whyThisMatters}</p></div>
      {answer.possibleExplanations.length ? (
        <div className="cci-answer-block">
          <span>Possible explanation</span>
          <ul>{answer.possibleExplanations.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      ) : null}
      {answer.evidence.length ? (
        <div className="cci-answer-block">
          <span>Evidence</span>
          <ul>{answer.evidence.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      ) : null}
      <div className="cci-answer-block"><span>What we still don't know</span><p>{answer.whatWeStillDontKnow}</p></div>
      {answer.priorCases?.length ? (
        <div className="cci-answer-block">
          <span>Seen before</span>
          <ul>{answer.priorCases.map((item, index) => <li key={index}>{item}</li>)}</ul>
        </div>
      ) : null}
      {answer.nextSteps.length ? (
        <div className="cci-copilot-next-steps">
          {answer.nextSteps.map((step) => <StatusBadge key={step.label} tone="neutral">{step.label}</StatusBadge>)}
        </div>
      ) : null}
    </section>
  )
}

// Copilot's context (not free text) picks which deterministic tool runs - there is no NLU
// layer parsing a typed question, so a question box next to the product/investigation picker
// would be decorative and misleading. Each mode shows exactly one real input.
function Copilot({ context, productOptions, investigations, onAsk }) {
  const [contextType, setContextType] = useState(context?.contextType || 'GENERAL')
  const [subjectName, setSubjectName] = useState(context?.subjectName || '')
  const [investigationId, setInvestigationId] = useState(context?.investigationId || '')
  const [answer, setAnswer] = useState(null)
  const [loading, setLoading] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setLoading(true)
    try {
      const response = await onAsk({
        contextType,
        subjectName: contextType === 'PRODUCT' ? subjectName : null,
        investigationId: contextType === 'INVESTIGATION' ? investigationId : null,
        periodDays: DEFAULT_PERIOD_DAYS,
        question: 'What changed?',
      })
      setAnswer(response)
    } finally {
      setLoading(false)
    }
  }

  const canSubmit = contextType === 'GENERAL'
    || (contextType === 'PRODUCT' && subjectName.trim())
    || (contextType === 'INVESTIGATION' && investigationId)

  return (
    <div className="scan-page-stack">
      <PageIntro description="Answers use only real SCAN data - never invented numbers, causes, or historical results." eyebrow="Copilot" title="Ask about a product or an investigation." />
      <section className="scan-ask-shell">
        <form className="cci-copilot-form" onSubmit={submit}>
          <SegmentedControl label="What is this about" onChange={setContextType} options={[{ value: 'PRODUCT', label: 'A product' }, { value: 'INVESTIGATION', label: 'An investigation' }, { value: 'GENERAL', label: 'General' }]} value={contextType} />
          {contextType === 'PRODUCT' ? (
            <label>Product
              <input list="cci-copilot-product-options" onChange={(event) => setSubjectName(event.target.value)} placeholder="e.g. Sprite 500ml" value={subjectName} />
              <datalist id="cci-copilot-product-options">{productOptions.map((name) => <option key={name} value={name} />)}</datalist>
            </label>
          ) : null}
          {contextType === 'INVESTIGATION' ? (
            <label>Investigation
              <select onChange={(event) => setInvestigationId(event.target.value)} value={investigationId}>
                <option value="">Choose an investigation…</option>
                {investigations.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
              </select>
            </label>
          ) : null}
          {contextType === 'GENERAL' ? (
            <p className="cci-copilot-general-note">General questions aren't grounded in a specific product or investigation, so SCAN will tell you what it needs instead of guessing.</p>
          ) : null}
          <button className="scan-button scan-button-dark" disabled={loading || !canSubmit} type="submit">{loading ? 'Thinking…' : 'Ask'}</button>
        </form>
      </section>
      {answer ? <CopilotAnswerView answer={answer} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Activations                                                          */
/* ------------------------------------------------------------------ */

const PRIMARY_METRIC_OPTIONS = [
  { value: 'BASKET_PENETRATION', label: 'Basket penetration' },
  { value: 'REVENUE', label: 'Revenue' },
]

function StoreGroupPicker({ stores, assignments, onAssign }) {
  return (
    <fieldset className="cci-store-group-picker">
      <legend>Assign stores to test or control</legend>
      {stores.length ? stores.map((store) => (
        <div className="cci-store-group-row" key={store.storeId}>
          <span>{store.storeId}</span>
          <label><input checked={assignments[store.storeId] === 'TEST'} name={`cci-activation-group-${store.storeId}`} onChange={() => onAssign(store.storeId, 'TEST')} type="radio" />Test</label>
          <label><input checked={assignments[store.storeId] === 'CONTROL'} name={`cci-activation-group-${store.storeId}`} onChange={() => onAssign(store.storeId, 'CONTROL')} type="radio" />Control</label>
          <label><input checked={!assignments[store.storeId]} name={`cci-activation-group-${store.storeId}`} onChange={() => onAssign(store.storeId, null)} type="radio" />Neither</label>
        </div>
      )) : <p>No reporting stores are available yet.</p>}
    </fieldset>
  )
}

function CreateActivationForm({ stores, productOptions, onCreate, onCancel }) {
  const [name, setName] = useState('')
  const [objective, setObjective] = useState('')
  const [hypothesis, setHypothesis] = useState('')
  const [productName, setProductName] = useState('')
  const [primaryMetric, setPrimaryMetric] = useState('BASKET_PENETRATION')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [assignments, setAssignments] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  function assign(storeId, group) {
    setAssignments((current) => {
      const next = { ...current }
      if (group) next[storeId] = group
      else delete next[storeId]
      return next
    })
  }

  const testStoreIds = Object.keys(assignments).filter((id) => assignments[id] === 'TEST')
  const controlStoreIds = Object.keys(assignments).filter((id) => assignments[id] === 'CONTROL')

  async function submit(event) {
    event.preventDefault()
    setError('')
    if (!testStoreIds.length || !controlStoreIds.length) {
      setError('Assign at least one test store and one control store.')
      return
    }
    setSubmitting(true)
    try {
      await onCreate({
        name: name.trim(), objective: objective.trim(), hypothesis: hypothesis.trim(), productName: productName.trim(),
        primaryMetric, startDate, endDate, testStoreIds, controlStoreIds,
      })
    } catch (requestError) {
      setError(requestError?.message || 'Unable to create this activation.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="cci-create-activation" onSubmit={submit}>
      <label>Name<input onChange={(event) => setName(event.target.value)} placeholder="e.g. Sprite cooler push" required value={name} /></label>
      <label>Objective<input onChange={(event) => setObjective(event.target.value)} placeholder="What is this trying to achieve?" required value={objective} /></label>
      <label>Hypothesis<input onChange={(event) => setHypothesis(event.target.value)} placeholder="Why should this work?" required value={hypothesis} /></label>
      <label>Product
        <input list="cci-activation-product-options" onChange={(event) => setProductName(event.target.value)} placeholder="e.g. Sprite 500ml" required value={productName} />
        <datalist id="cci-activation-product-options">{productOptions.map((option) => <option key={option} value={option} />)}</datalist>
      </label>
      <label>Primary metric
        <select onChange={(event) => setPrimaryMetric(event.target.value)} value={primaryMetric}>
          {PRIMARY_METRIC_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <div className="cci-date-range">
        <label>Start date<input onChange={(event) => setStartDate(event.target.value)} required type="date" value={startDate} /></label>
        <label>End date<input onChange={(event) => setEndDate(event.target.value)} required type="date" value={endDate} /></label>
      </div>
      <StoreGroupPicker assignments={assignments} onAssign={assign} stores={stores} />
      {error ? <div className="scan-inline-notice scan-inline-error" role="alert">{error}</div> : null}
      <div className="cci-form-actions">
        <button className="scan-button scan-button-light" onClick={onCancel} type="button">Cancel</button>
        <button className="scan-button scan-button-dark" disabled={submitting} type="submit">{submitting ? 'Creating…' : 'Create activation'}</button>
      </div>
    </form>
  )
}

function GroupPerformanceCard({ title, group, currency }) {
  return (
    <div className="cci-activation-group-card">
      <h4>{title}</h4>
      <small>{group.storeCount} store(s) · {group.reportingStoreCount} reported activity during the window</small>
      <dl>
        <div><dt>Basket penetration</dt><dd>{decimal.format(group.baselinePenetrationPct)}% baseline → {decimal.format(group.duringPenetrationPct)}% during</dd></div>
        <div><dt>Matching baskets</dt><dd>{integer.format(group.baselineMatchingBaskets)} of {integer.format(group.baselineBaskets)} baseline → {integer.format(group.duringMatchingBaskets)} of {integer.format(group.duringBaskets)} during</dd></div>
        <div><dt>Revenue</dt><dd>{formatMoney(group.baselineRevenue, currency)} baseline → {formatMoney(group.duringRevenue, currency)} during</dd></div>
      </dl>
    </div>
  )
}

function ActivationDetail({ activation, currency, onBack }) {
  const { performance } = activation
  return (
    <div className="scan-page-stack">
      <button className="scan-text-link cci-back-link" onClick={onBack} type="button"><ScanIcon name="chevron" size={16} />Back to activations</button>
      <PageIntro
        aside={<StatusBadge tone={statusTone(activation.status)}>{humanize(activation.status)}</StatusBadge>}
        description={activation.objective}
        eyebrow={activation.productName}
        title={activation.name}
      />
      <section className="scan-panel">
        <header className="scan-panel-header"><div><h3>Hypothesis</h3></div></header>
        <p>{activation.hypothesis}</p>
        <small>{activation.startDate} to {activation.endDate} · Primary metric: {humanize(activation.primaryMetric)}</small>
      </section>
      <section className="scan-panel">
        <header className="scan-panel-header"><div><h3>Performance</h3><p>Baseline is the period immediately before this activation started, of equal length.</p></div></header>
        <div className="cci-activation-groups">
          <GroupPerformanceCard currency={currency} group={performance.test} title="Test stores" />
          <GroupPerformanceCard currency={currency} group={performance.control} title="Control stores" />
        </div>
      </section>
      <section className="scan-answer cci-structured-answer">
        <div className="cci-answer-block"><span>Key finding</span><h3>{performance.keyFinding}</h3></div>
        <div className="cci-answer-block"><span>Limitations</span><p>{performance.limitations}</p></div>
        {performance.recommendation ? <div className="cci-answer-block"><span>Recommendation</span><p>{performance.recommendation}</p></div> : null}
      </section>
    </div>
  )
}

function Activations({ activations, data, loading, loadError, selectedActivationId, onSelect, onBack, onCreate }) {
  const [showCreateForm, setShowCreateForm] = useState(false)
  const selected = activations.find((item) => item.id === selectedActivationId)

  if (selected) {
    return <ActivationDetail activation={selected} currency={data.currency} onBack={onBack} />
  }

  return (
    <div className="scan-page-stack">
      <PageIntro
        aside={<button className="scan-button scan-button-dark" onClick={() => setShowCreateForm((value) => !value)} type="button">{showCreateForm ? 'Cancel' : 'Create activation'}</button>}
        description="Test stores against control stores, then review results with honest, non-causal language."
        eyebrow="Activations"
        title="Real test-vs-control trials."
      />
      {loadError ? <div className="scan-inline-notice scan-inline-error" role="alert">{loadError}</div> : null}
      {showCreateForm ? (
        <section className="scan-panel">
          <CreateActivationForm
            onCancel={() => setShowCreateForm(false)}
            onCreate={async (payload) => { const created = await onCreate(payload); setShowCreateForm(false); onSelect(created.id) }}
            productOptions={data.cciSkuPerformance.map((item) => item.product)}
            stores={data.stores}
          />
        </section>
      ) : null}
      {loading ? <p className="cci-work-loading">Loading activations…</p> : activations.length ? (
        <div className="cci-investigation-list">
          {activations.map((item) => (
            <button className="cci-investigation-row" key={item.id} onClick={() => onSelect(item.id)} type="button">
              <div>
                <StatusBadge tone={statusTone(item.status)}>{humanize(item.status)}</StatusBadge>
                <strong>{item.name}</strong>
                <small>{item.productName} · {item.startDate} to {item.endDate}</small>
              </div>
              <ScanIcon name="chevron" size={18} />
            </button>
          ))}
        </div>
      ) : <EmptyState title="No activations yet">Set up a test-vs-control trial to measure a real commercial change with honest, non-causal language.</EmptyState>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Network (Overview / Insights / Stores / Products)                   */
/* ------------------------------------------------------------------ */
/* Every number here comes from /api/v1/network/* - already aggregated across every retailer this
 * CCI account can see, with no retailerCode parameter anywhere. A store is only unique within its
 * own retailer, so a store row always carries retailerCode alongside externalStoreId. */

function timeOfDayGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'morning'
  if (hour < 18) return 'afternoon'
  return 'evening'
}

function changeNote(change, unit) {
  if (change === null || change === undefined || Number.isNaN(change)) return 'No prior-period comparison yet'
  if (Math.abs(change) < 0.05) return 'No change vs previous period'
  return `${change > 0 ? '+' : ''}${decimal.format(change)}${unit} vs previous period`
}

function storeKey(store) {
  return `${store.retailerCode}/${store.externalStoreId}`
}

function storeStatusTone(status) {
  if (status === 'NEEDS_ATTENTION') return 'warning'
  if (status === 'IMPROVING') return 'success'
  return 'neutral'
}

function storeStatusLabel(status) {
  if (status === 'NEEDS_ATTENTION') return 'Needs attention'
  if (status === 'IMPROVING') return 'Improving'
  if (status === 'NOT_REPORTING') return 'Not reporting'
  return 'Stable'
}

function briefTone(type) {
  if (type === 'IMPORTANT') return 'warning'
  if (type === 'OPPORTUNITY') return 'success'
  return 'neutral'
}

function briefTypeLabel(type) {
  if (type === 'IMPORTANT') return 'Important change'
  if (type === 'OPPORTUNITY') return 'Commercial opportunity'
  if (type === 'DATA_QUALITY') return 'Data quality issue'
  return humanize(type)
}

function NetworkKpiRow({ overview }) {
  if (!overview) return null
  const items = [
    { label: 'CCI penetration', value: `${decimal.format(overview.cciPenetrationPct)}%`, note: changeNote(overview.penetrationPointChange, 'pp') },
    { label: 'CCI baskets', value: integer.format(overview.cciBaskets), note: `${integer.format(overview.totalBaskets)} total baskets` },
    { label: 'Stores reporting', value: integer.format(overview.storesReporting), note: `Last ${overview.periodDays} days` },
    { label: 'Product mapping', value: `${decimal.format(overview.dataCoveragePct)}%`, note: overview.dataCoveragePct < 90 ? 'Interpret companion insights cautiously' : 'Coverage supports analysis' },
  ]
  return <MetricStrip items={items} label="Network KPIs" />
}

function CommercialBrief({ brief, loading, onAction }) {
  return (
    <section className="scan-panel cci-commercial-brief">
      <header className="scan-panel-header">
        <div>
          <h3>SCAN Commercial Brief</h3>
          <p>{loading ? 'Scanning the network for real changes…' : brief.length ? `${brief.length} thing${brief.length === 1 ? '' : 's'} deserve attention` : 'Nothing deserves attention right now'}</p>
        </div>
      </header>
      {loading ? null : brief.length ? (
        <ol className="cci-brief-list">
          {brief.map((item, index) => (
            <li key={`${item.type}-${index}`}>
              <StatusBadge tone={briefTone(item.type)}>{briefTypeLabel(item.type)}</StatusBadge>
              <div>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
                {item.actionTarget || item.actionType === 'STORES' ? (
                  <button className="cci-brief-action" onClick={() => onAction(item)} type="button">{item.actionLabel} →</button>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <EmptyState compact title="No significant changes detected">CCI penetration remained stable across the network for this period, and no product moved enough to flag.</EmptyState>
      )}
      <footer className="cci-brief-footer"><button className="scan-button scan-button-light" onClick={() => onAction(null)} type="button">Ask SCAN about these changes →</button></footer>
    </section>
  )
}

const MOVER_TABS = [
  { value: 'products', label: 'Products' },
  { value: 'stores', label: 'Stores' },
  { value: 'categories', label: 'Categories' },
]

function MoverRow({ label, meta, changePct }) {
  const up = changePct >= 0
  return (
    <div className="cci-mover-row">
      <div><strong>{label}</strong>{meta ? <small>{meta}</small> : null}</div>
      <span className={`cci-mover-change ${up ? 'is-up' : 'is-down'}`}>{up ? '↑' : '↓'} {decimal.format(Math.abs(changePct))}%</span>
    </div>
  )
}

function BiggestMovers({ productMovers, storeMovers, categoryMovers, onOpenProduct }) {
  const [tab, setTab] = useState('products')
  const rows = tab === 'products'
    ? productMovers.slice(0, 6).map((item) => ({ key: item.productName, label: item.productName, meta: item.category, changePct: item.basketChangePct, onOpen: () => onOpenProduct(item.productName) }))
    : tab === 'stores'
      ? storeMovers.slice(0, 6).map((item) => ({ key: storeKey(item), label: item.externalStoreId, meta: item.retailerCode, changePct: item.penetrationPointChange, onOpen: null }))
      : categoryMovers.slice(0, 6).map((item) => ({ key: item.category, label: item.category, meta: null, changePct: item.basketChangePct, onOpen: null }))

  return (
    <section className="scan-panel cci-biggest-movers">
      <header className="scan-panel-header">
        <div><h3>Biggest movers</h3><p>Largest real changes vs. the previous period.</p></div>
        <SegmentedControl label="Mover type" onChange={setTab} options={MOVER_TABS} value={tab} />
      </header>
      {rows.length ? (
        <div className="cci-mover-list">
          {rows.map((row) => (row.onOpen ? (
            <button className="cci-mover-row-button" key={row.key} onClick={row.onOpen} type="button">
              <MoverRow changePct={row.changePct} label={row.label} meta={row.meta} />
            </button>
          ) : <div key={row.key}><MoverRow changePct={row.changePct} label={row.label} meta={row.meta} /></div>))}
        </div>
      ) : <EmptyState compact title="No significant movers">Nothing crossed the meaningful-change threshold this period.</EmptyState>}
    </section>
  )
}

function StorePerformancePreview({ stores, onNavigate, onOpenStore }) {
  const top = stores.slice(0, 5)
  return (
    <ChartPanel action={<button className="scan-link-button" onClick={() => onNavigate('stores')} type="button">View all stores →</button>} description="Ranked by CCI penetration across the network." title="Store performance">
      {top.length ? (
        <div className="scan-table-wrap">
          <table className="scan-table">
            <thead><tr><th>Store</th><th>CCI penetration</th><th>Change</th><th>CCI baskets</th><th>Status</th></tr></thead>
            <tbody>
              {top.map((store) => (
                <tr className="cci-clickable-row" key={storeKey(store)} onClick={() => onOpenStore(store)}>
                  <td>{store.externalStoreId} <small>{store.retailerCode}</small></td>
                  <td>{decimal.format(store.recentPenetrationPct)}%</td>
                  <td className={store.penetrationPointChange >= 0 ? 'is-up' : 'is-down'}>{store.penetrationPointChange >= 0 ? '+' : ''}{decimal.format(store.penetrationPointChange)}pp</td>
                  <td>{integer.format(store.recentCciBaskets)}</td>
                  <td><StatusBadge tone={storeStatusTone(store.status)}>{storeStatusLabel(store.status)}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState compact title="No store data yet">No baskets recorded for the selected period.</EmptyState>}
    </ChartPanel>
  )
}

function ProductPerformancePreview({ products, onNavigate, onOpenProduct }) {
  const top = [...products].sort((a, b) => b.recentBaskets - a.recentBaskets).slice(0, 5)
  return (
    <ChartPanel action={<button className="scan-link-button" onClick={() => onNavigate('products')} type="button">View all products →</button>} description="Ranked by current CCI basket volume." title="Product performance">
      {top.length ? (
        <div className="scan-table-wrap">
          <table className="scan-table">
            <thead><tr><th>Product</th><th>CCI baskets</th><th>Change</th></tr></thead>
            <tbody>
              {top.map((product) => (
                <tr className="cci-clickable-row" key={product.productName} onClick={() => onOpenProduct(product.productName)}>
                  <td>{product.productName} <small>{product.category}</small></td>
                  <td>{integer.format(product.recentBaskets)}</td>
                  <td className={product.basketChangePct >= 0 ? 'is-up' : 'is-down'}>{product.basketChangePct >= 0 ? '+' : ''}{decimal.format(product.basketChangePct)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState compact title="No product data yet">No CCI products met the minimum sample size this period.</EmptyState>}
    </ChartPanel>
  )
}

function OverviewPage({
  overview, stores, productMovers, categoryMovers, brief, loading, error,
  periodDays, onPeriodChange, onNavigate, onBriefAction, onAskAboutProduct, onOpenStore, onOpenProduct, myWork,
}) {
  const storeMovers = useMemo(
    () => [...stores].sort((a, b) => Math.abs(b.penetrationPointChange) - Math.abs(a.penetrationPointChange)),
    [stores]
  )

  return (
    <div className="scan-page-stack cci-overview">
      <section className="cci-discovery-hero">
        <span className="scan-eyebrow">Overview</span>
        <h2>Good {timeOfDayGreeting()}. Here&rsquo;s what changed across your retail network.</h2>
        <p>{overview ? `${integer.format(overview.storesReporting)} stores reporting · ${integer.format(overview.cciBaskets)} CCI baskets · ${formatRelativeTime(overview.generatedAt)}` : 'Loading network coverage…'}</p>
        <SegmentedControl label="Period" onChange={onPeriodChange} options={PERIOD_OPTIONS} value={periodDays} />
      </section>

      {error ? <div className="scan-inline-notice scan-inline-error" role="alert">{error}</div> : null}

      <NetworkKpiRow overview={overview} />

      <div className="scan-two-column cci-overview-columns">
        <CommercialBrief brief={brief} loading={loading} onAction={onBriefAction} />
        <BiggestMovers categoryMovers={categoryMovers} onOpenProduct={onAskAboutProduct} productMovers={productMovers} storeMovers={storeMovers} />
      </div>

      <StorePerformancePreview onNavigate={onNavigate} onOpenStore={onOpenStore} stores={stores} />
      <ProductPerformancePreview onNavigate={onNavigate} onOpenProduct={onOpenProduct} products={productMovers} />

      {myWork}
    </div>
  )
}

function InsightsPage({ brief, loading, error, periodDays, onPeriodChange, onAction }) {
  return (
    <div className="scan-page-stack">
      <PageIntro
        aside={<SegmentedControl label="Period" onChange={onPeriodChange} options={PERIOD_OPTIONS} value={periodDays} />}
        description="A continuously generated feed of real, deterministic changes across the network. SCAN explains them - it never invents them."
        eyebrow="Insights"
        title="What's changing across your network."
      />
      {error ? <div className="scan-inline-notice scan-inline-error" role="alert">{error}</div> : null}
      {loading ? <p className="cci-work-loading">Scanning the network for real changes…</p> : brief.length ? (
        <div className="cci-insights-feed">
          {brief.map((item, index) => (
            <article className="scan-panel cci-insight-card" key={`${item.type}-${index}`}>
              <header><StatusBadge tone={briefTone(item.type)}>{briefTypeLabel(item.type)}</StatusBadge></header>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              {item.actionTarget || item.actionType === 'STORES' ? (
                <button className="scan-button scan-button-dark" onClick={() => onAction(item)} type="button">{item.actionLabel} →</button>
              ) : null}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState title="No significant changes detected">CCI penetration remained stable across the network for the selected period, and no product or category moved enough to flag. Stores are reporting normally.</EmptyState>
      )}
    </div>
  )
}

const STORE_SORTS = [
  { value: 'penetration', label: 'CCI penetration' },
  { value: 'change', label: 'Biggest change' },
  { value: 'baskets', label: 'Basket volume' },
]

function sortStores(stores, sortBy) {
  const copy = [...stores]
  if (sortBy === 'change') copy.sort((a, b) => Math.abs(b.penetrationPointChange) - Math.abs(a.penetrationPointChange))
  else if (sortBy === 'baskets') copy.sort((a, b) => b.recentBaskets - a.recentBaskets)
  else copy.sort((a, b) => b.recentPenetrationPct - a.recentPenetrationPct)
  return copy
}

function StoresPage({ stores, overview, loading, error, periodDays, onPeriodChange, onOpenStore }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('ALL')
  const [sortBy, setSortBy] = useState('penetration')

  const needle = search.trim().toLowerCase()
  const filtered = stores.filter((store) => {
    if (statusFilter !== 'ALL' && store.status !== statusFilter) return false
    if (!needle) return true
    return store.externalStoreId.toLowerCase().includes(needle) || store.retailerCode.toLowerCase().includes(needle)
  })
  const sorted = sortStores(filtered, sortBy)

  const needsAttention = stores.filter((store) => store.status === 'NEEDS_ATTENTION').length
  const improving = stores.filter((store) => store.status === 'IMPROVING').length
  const notReporting = stores.filter((store) => store.status === 'NOT_REPORTING').length

  return (
    <div className="scan-page-stack">
      <PageIntro
        aside={<SegmentedControl label="Period" onChange={onPeriodChange} options={PERIOD_OPTIONS} value={periodDays} />}
        description={`${integer.format(stores.length)} stores reporting · ${integer.format(needsAttention)} need attention · ${integer.format(improving)} improving strongly · ${integer.format(notReporting)} missing data`}
        eyebrow="Stores"
        title="Every store in the network, ranked."
      />
      {error ? <div className="scan-inline-notice scan-inline-error" role="alert">{error}</div> : null}
      <section className="scan-panel cci-table-filters">
        <input aria-label="Search stores" onChange={(event) => setSearch(event.target.value)} placeholder="Search by store or retailer code…" value={search} />
        <select aria-label="Filter by status" onChange={(event) => setStatusFilter(event.target.value)} value={statusFilter}>
          <option value="ALL">All statuses</option>
          <option value="NEEDS_ATTENTION">Needs attention</option>
          <option value="IMPROVING">Improving</option>
          <option value="STABLE">Stable</option>
          <option value="NOT_REPORTING">Not reporting</option>
        </select>
        <select aria-label="Sort stores" onChange={(event) => setSortBy(event.target.value)} value={sortBy}>
          {STORE_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </section>
      {loading ? <p className="cci-work-loading">Loading store rankings…</p> : sorted.length ? (
        <div className="scan-table-wrap">
          <table className="scan-table">
            <thead><tr><th>Store</th><th>Retailer</th><th>CCI penetration</th><th>Change</th><th>CCI / total baskets</th><th>Status</th></tr></thead>
            <tbody>
              {sorted.map((store) => (
                <tr className="cci-clickable-row" key={storeKey(store)} onClick={() => onOpenStore(store)}>
                  <td><button className="scan-link-button" onClick={(event) => { event.stopPropagation(); onOpenStore(store) }} type="button">{store.externalStoreId}</button></td>
                  <td>{store.retailerCode}</td>
                  <td>{decimal.format(store.recentPenetrationPct)}%</td>
                  <td className={store.penetrationPointChange >= 0 ? 'is-up' : 'is-down'}>{store.penetrationPointChange >= 0 ? '+' : ''}{decimal.format(store.penetrationPointChange)}pp</td>
                  <td>{integer.format(store.recentCciBaskets)} / {integer.format(store.recentBaskets)}</td>
                  <td><StatusBadge tone={storeStatusTone(store.status)}>{storeStatusLabel(store.status)}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No stores match">Try a different search or status filter.</EmptyState>}
      {overview ? (
        <section className="scan-panel cci-data-health">
          <header className="scan-panel-header"><div><h3>Data health</h3><p>Can store-level analysis be trusted?</p></div><StatusBadge tone={overview.dataCoveragePct >= 90 ? 'success' : 'warning'}>{overview.dataCoveragePct >= 90 ? 'Analysis ready' : 'Review needed'}</StatusBadge></header>
          <p>{decimal.format(overview.dataCoveragePct)}% of transaction lines are mapped to a canonical product.{overview.dataCoveragePct < 90 ? ' Companion-product and category insights should be interpreted cautiously until coverage improves.' : ' Coverage supports confident analysis.'}</p>
        </section>
      ) : null}
    </div>
  )
}

const PRODUCT_SORTS = [
  { value: 'baskets', label: 'CCI baskets' },
  { value: 'change', label: 'Biggest change' },
]

function sortProducts(products, sortBy) {
  const copy = [...products]
  if (sortBy === 'change') copy.sort((a, b) => Math.abs(b.basketChangePct) - Math.abs(a.basketChangePct))
  else copy.sort((a, b) => b.recentBaskets - a.recentBaskets)
  return copy
}

function ProductsPage({ products, loading, error, periodDays, onPeriodChange, onAskAbout, onInvestigate, onOpenProduct }) {
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('baskets')
  const [busyProduct, setBusyProduct] = useState(null)

  const needle = search.trim().toLowerCase()
  const filtered = products.filter((product) => !needle
    || product.productName.toLowerCase().includes(needle)
    || (product.category || '').toLowerCase().includes(needle))
  const sorted = sortProducts(filtered, sortBy)

  async function handleInvestigate(productName) {
    setBusyProduct(productName)
    try {
      await onInvestigate(productName)
    } finally {
      setBusyProduct(null)
    }
  }

  return (
    <div className="scan-page-stack">
      <PageIntro
        aside={<SegmentedControl label="Period" onChange={onPeriodChange} options={PERIOD_OPTIONS} value={periodDays} />}
        description={`${integer.format(products.length)} CCI products with enough basket volume to rank this period.`}
        eyebrow="Products"
        title="CCI product performance across the network."
      />
      {error ? <div className="scan-inline-notice scan-inline-error" role="alert">{error}</div> : null}
      <section className="scan-panel cci-table-filters">
        <input aria-label="Search products" onChange={(event) => setSearch(event.target.value)} placeholder="Search by product or category…" value={search} />
        <select aria-label="Sort products" onChange={(event) => setSortBy(event.target.value)} value={sortBy}>
          {PRODUCT_SORTS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </section>
      {loading ? <p className="cci-work-loading">Loading product rankings…</p> : sorted.length ? (
        <div className="scan-table-wrap">
          <table className="scan-table">
            <thead><tr><th>Product</th><th>Category</th><th>CCI baskets</th><th>Change</th><th /></tr></thead>
            <tbody>
              {sorted.map((product) => (
                <tr key={product.productName}>
                  <td><button className="scan-link-button" onClick={() => onOpenProduct(product.productName)} type="button">{product.productName}</button></td>
                  <td>{product.category || 'Uncategorized'}</td>
                  <td>{integer.format(product.recentBaskets)}</td>
                  <td className={product.basketChangePct >= 0 ? 'is-up' : 'is-down'}>{product.basketChangePct >= 0 ? '+' : ''}{decimal.format(product.basketChangePct)}%</td>
                  <td className="cci-table-actions">
                    <button className="scan-button scan-button-light" disabled={busyProduct === product.productName} onClick={() => handleInvestigate(product.productName)} type="button">Investigate</button>
                    <button className="scan-button scan-button-light" onClick={() => onAskAbout(product.productName)} type="button">Ask SCAN</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <EmptyState title="No products match">Try a different search, or widen the period.</EmptyState>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Store detail / Product detail (drill-down from Stores/Products/Overview) */
/* ------------------------------------------------------------------ */

function DetailBackLink({ onBack, label }) {
  return <button className="scan-text-link cci-back-link" onClick={onBack} type="button"><ScanIcon name="chevron" size={16} />{label}</button>
}

function StoreDetailPage({ detail, loading, error, periodDays, onBack, onOpenStore, onOpenProduct, onInvestigate, onNavigate }) {
  const backLink = <DetailBackLink label="Back to stores" onBack={onBack} />
  if (error) {
    return <div className="scan-page-stack">{backLink}<div className="scan-inline-notice scan-inline-error" role="alert">{error}</div></div>
  }
  if (loading || !detail) {
    return <div className="scan-page-stack">{backLink}<p className="cci-work-loading">Loading store…</p></div>
  }

  const items = [
    { label: 'CCI penetration', value: `${decimal.format(detail.recentPenetrationPct)}%`, note: changeNote(detail.penetrationPointChange, 'pp') },
    { label: 'CCI baskets', value: integer.format(detail.recentCciBaskets), note: `${integer.format(detail.recentBaskets)} total baskets` },
    { label: 'Status', value: storeStatusLabel(detail.status), note: `Last ${periodDays} days` },
    { label: 'Product mapping', value: `${decimal.format(detail.dataCoveragePct)}%`, note: detail.dataCoveragePct < 90 ? 'Interpret companion insights cautiously' : 'Coverage supports analysis' },
  ]
  const topDecline = detail.biggestChanges.find((mover) => mover.basketChangePct < 0)

  return (
    <div className="scan-page-stack">
      <PageIntro aside={backLink} eyebrow={detail.retailerCode} title={detail.storeName} />
      <MetricStrip items={items} label="Store KPIs" />

      <div className="scan-two-column">
        <ChartPanel description="Ranked by current basket volume at this store." title="Top CCI products">
          {detail.topProducts.length ? (
            <div className="scan-table-wrap">
              <table className="scan-table">
                <thead><tr><th>Product</th><th>Baskets</th><th>Quantity</th></tr></thead>
                <tbody>
                  {detail.topProducts.map((product) => (
                    <tr key={product.product}>
                      <td><button className="scan-link-button" onClick={() => onOpenProduct(product.product)} type="button">{product.product}</button></td>
                      <td>{integer.format(product.basketCount)}</td>
                      <td>{decimal.format(product.quantity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState compact title="No CCI products sold here recently">No CCI product appeared in this store&rsquo;s baskets in the last {periodDays} days.</EmptyState>}
        </ChartPanel>
        <ChartPanel description="Real product-level moves at this store vs. the previous period." title="Biggest changes">
          {detail.biggestChanges.length ? (
            <div className="scan-table-wrap">
              <table className="scan-table">
                <thead><tr><th>Product</th><th>Change</th><th /></tr></thead>
                <tbody>
                  {detail.biggestChanges.map((mover) => (
                    <tr key={mover.productName}>
                      <td><button className="scan-link-button" onClick={() => onOpenProduct(mover.productName)} type="button">{mover.productName}</button></td>
                      <td className={mover.basketChangePct >= 0 ? 'is-up' : 'is-down'}>{mover.basketChangePct >= 0 ? '+' : ''}{decimal.format(mover.basketChangePct)}%</td>
                      <td className="cci-table-actions"><button className="scan-button scan-button-light" onClick={() => onInvestigate(mover.productName)} type="button">Investigate</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <EmptyState compact title="No significant changes">No CCI product moved enough at this store to flag.</EmptyState>}
        </ChartPanel>
      </div>

      <ChartPanel description="Non-CCI categories most often bought alongside CCI products here." title="Top companion categories">
        {detail.topCompanionCategories.length ? (
          <div className="cci-mover-list">
            {detail.topCompanionCategories.map((category) => (
              <div className="cci-mover-row" key={category.label}><div><strong>{category.label}</strong></div><span>{integer.format(category.basketCount)} baskets</span></div>
            ))}
          </div>
        ) : <EmptyState compact title="Insufficient companion data">Mapped CCI and non-CCI products must occur in the same basket.</EmptyState>}
      </ChartPanel>

      <section className="scan-panel">
        <header className="scan-panel-header"><div><h3>Compare with similar stores</h3><p>Other real stores with the closest current CCI penetration.</p></div></header>
        {detail.similarStores.length ? (
          <div className="scan-table-wrap">
            <table className="scan-table">
              <thead><tr><th>Store</th><th>Retailer</th><th>CCI penetration</th><th>Change</th></tr></thead>
              <tbody>
                {detail.similarStores.map((store) => (
                  <tr className="cci-clickable-row" key={storeKey(store)} onClick={() => onOpenStore(store)}>
                    <td>{store.externalStoreId}</td>
                    <td>{store.retailerCode}</td>
                    <td>{decimal.format(store.recentPenetrationPct)}%</td>
                    <td className={store.penetrationPointChange >= 0 ? 'is-up' : 'is-down'}>{store.penetrationPointChange >= 0 ? '+' : ''}{decimal.format(store.penetrationPointChange)}pp</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState compact title="No comparable stores yet">At least one other store is needed for a real comparison.</EmptyState>}
      </section>

      <div className="cci-detail-actions">
        {topDecline ? <button className="scan-button scan-button-dark" onClick={() => onInvestigate(topDecline.productName)} type="button">Investigate {topDecline.productName} decline</button> : null}
        <button className="scan-button scan-button-light" onClick={() => onNavigate('products')} type="button">View products →</button>
      </div>
    </div>
  )
}

function ProductDetailPage({ detail, loading, error, periodDays, onBack, onOpenStore, onInvestigate, onAskAbout }) {
  const backLink = <DetailBackLink label="Back to products" onBack={onBack} />
  if (error) {
    return <div className="scan-page-stack">{backLink}<div className="scan-inline-notice scan-inline-error" role="alert">{error}</div></div>
  }
  if (loading || !detail) {
    return <div className="scan-page-stack">{backLink}<p className="cci-work-loading">Loading product…</p></div>
  }

  const items = [
    { label: 'CCI baskets', value: integer.format(detail.recentBaskets), note: changeNote(detail.basketChangePct, '%') },
    { label: 'Prior baskets', value: integer.format(detail.priorBaskets), note: `Last ${periodDays} days vs. previous` },
    { label: 'Category', value: detail.category || 'Unmapped', note: detail.brand },
    {
      label: 'Strongest daypart',
      value: detail.strongestDaypart ? humanize(detail.strongestDaypart) : 'Not enough data',
      note: detail.strongestDaypart ? `${decimal.format(detail.strongestDaypartSharePct)}% of recent baskets` : 'Fewer than 5 receipts in this period',
    },
  ]

  return (
    <div className="scan-page-stack">
      <PageIntro aside={backLink} eyebrow={detail.category || 'Unmapped'} title={detail.product} />
      <MetricStrip items={items} label="Product KPIs" />

      <section className="scan-panel">
        <header className="scan-panel-header">
          <div><h3>Store distribution</h3><p>Every store this product reaches, ranked by current basket volume.</p></div>
        </header>
        {detail.storeDistribution.length ? (
          <div className="scan-table-wrap">
            <table className="scan-table">
              <thead><tr><th>Store</th><th>Retailer</th><th>Recent baskets</th><th>Prior baskets</th><th>Change</th></tr></thead>
              <tbody>
                {detail.storeDistribution.map((store) => (
                  <tr className="cci-clickable-row" key={storeKey(store)} onClick={() => onOpenStore(store)}>
                    <td>{store.externalStoreId}</td>
                    <td>{store.retailerCode}</td>
                    <td>{integer.format(store.recentBaskets)}</td>
                    <td>{integer.format(store.priorBaskets)}</td>
                    <td className={store.basketChangePct >= 0 ? 'is-up' : 'is-down'}>{store.basketChangePct >= 0 ? '+' : ''}{decimal.format(store.basketChangePct)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState compact title="No store data yet">This product has not appeared in any store&rsquo;s baskets in either window.</EmptyState>}
      </section>

      <div className="scan-two-column">
        <ChartPanel description="Other products bought in the same basket as this one." title="Companion products">
          {detail.companionProducts.length ? (
            <div className="cci-mover-list">
              {detail.companionProducts.map((item) => (
                <div className="cci-mover-row" key={item.label}><div><strong>{item.label}</strong></div><span>{integer.format(item.basketCount)} baskets</span></div>
              ))}
            </div>
          ) : <EmptyState compact title="No real companion yet">Each basket containing this product only ever has this one line.</EmptyState>}
        </ChartPanel>
        <ChartPanel description="Non-CCI categories most often bought alongside this product." title="Companion categories">
          {detail.companionCategories.length ? (
            <div className="cci-mover-list">
              {detail.companionCategories.map((item) => (
                <div className="cci-mover-row" key={item.label}><div><strong>{item.label}</strong></div><span>{integer.format(item.basketCount)} baskets</span></div>
              ))}
            </div>
          ) : <EmptyState compact title="No real companion yet">Each basket containing this product only ever has this one line.</EmptyState>}
        </ChartPanel>
      </div>

      <div className="cci-detail-actions">
        <button className="scan-button scan-button-dark" onClick={() => onInvestigate(detail.product)} type="button">Investigate this product</button>
        <button className="scan-button scan-button-light" onClick={() => onAskAbout(detail.product)} type="button">Ask SCAN about this product</button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Shell                                                                */
/* ------------------------------------------------------------------ */

function DashboardPage({ activePage, data, intelligence, credentials, actions, onNavigate, commercialRole, network, periodDays, onPeriodChange }) {
  if (data.totalBaskets === 0) {
    return <section className="scan-panel"><EmptyState title="No transaction data imported yet">Import a validated retailer export for {data.retailerCode}. SCAN will not show derived intelligence until complete receipts are available.</EmptyState></section>
  }
  const productOptions = data.cciSkuPerformance.map((item) => item.product)

  if (activePage === 'investigate') {
    return (
      <Investigate
        data={data}
        fieldTasks={intelligence.fieldTasks}
        investigations={intelligence.investigations}
        loadError={intelligence.error}
        loading={intelligence.loading}
        onAddNote={actions.addNote}
        onAskCopilot={actions.askCopilotAboutInvestigation}
        onBack={() => actions.selectInvestigation(null)}
        onClose={actions.closeInvestigation}
        onConfirmHypothesis={actions.confirmHypothesis}
        onCreateFieldTask={actions.createFieldTask}
        onRecordFieldTaskResult={actions.recordFieldTaskResult}
        onRejectHypothesis={actions.rejectHypothesis}
        onReopen={actions.reopenInvestigation}
        onSelect={actions.selectInvestigation}
        onStartGeneral={actions.startGeneralInvestigation}
        onStartProduct={actions.startProductInvestigation}
        productOptions={productOptions}
        selectedInvestigationId={intelligence.selectedInvestigationId}
      />
    )
  }
  if (activePage === 'activations') {
    return (
      <Activations
        activations={intelligence.activations}
        data={data}
        loadError={intelligence.error}
        loading={intelligence.loading}
        onBack={() => actions.selectActivation(null)}
        onCreate={actions.createActivation}
        onSelect={actions.selectActivation}
        selectedActivationId={intelligence.selectedActivationId}
      />
    )
  }
  if (activePage === 'copilot') {
    return (
      <Copilot
        context={intelligence.copilotContext}
        investigations={intelligence.investigations}
        key={JSON.stringify(intelligence.copilotContext)}
        onAsk={actions.askCopilot}
        productOptions={productOptions}
      />
    )
  }
  if (activePage === 'insights') {
    return (
      <InsightsPage
        brief={network.brief}
        error={network.error}
        loading={network.loading}
        onAction={actions.handleBriefAction}
        onPeriodChange={onPeriodChange}
        periodDays={periodDays}
      />
    )
  }
  if (activePage === 'stores') {
    return (
      <StoresPage
        error={network.error}
        loading={network.loading}
        onOpenStore={actions.openStoreDetail}
        onPeriodChange={onPeriodChange}
        overview={network.overview}
        periodDays={periodDays}
        stores={network.stores}
      />
    )
  }
  if (activePage === 'products') {
    return (
      <ProductsPage
        error={network.error}
        loading={network.loading}
        onAskAbout={actions.askCopilotAboutProduct}
        onInvestigate={actions.startProductInvestigationFromWork}
        onOpenProduct={actions.openProductDetail}
        onPeriodChange={onPeriodChange}
        periodDays={periodDays}
        products={network.productMovers}
      />
    )
  }
  if (activePage === 'store-detail') {
    return (
      <StoreDetailPage
        detail={network.storeDetail}
        error={network.storeDetailError}
        loading={network.storeDetailLoading}
        onBack={() => onNavigate('stores')}
        onInvestigate={actions.startProductInvestigationFromWork}
        onNavigate={onNavigate}
        onOpenProduct={actions.openProductDetail}
        onOpenStore={actions.openStoreDetail}
        periodDays={periodDays}
      />
    )
  }
  if (activePage === 'product-detail') {
    return (
      <ProductDetailPage
        detail={network.productDetail}
        error={network.productDetailError}
        loading={network.productDetailLoading}
        onAskAbout={actions.askCopilotAboutProduct}
        onBack={() => onNavigate('products')}
        onInvestigate={actions.startProductInvestigationFromWork}
        onOpenStore={actions.openStoreDetail}
        periodDays={periodDays}
      />
    )
  }

  const myWork = (
    <MyWork
      commercialRole={commercialRole}
      credentials={credentials}
      embedded
      fieldTasks={intelligence.fieldTasks}
      intelligenceError={intelligence.error}
      intelligenceLoading={intelligence.loading}
      investigations={intelligence.investigations}
      movers={intelligence.movers}
      onAskAbout={actions.askCopilotAboutProduct}
      onFollow={actions.followProduct}
      onNavigate={onNavigate}
      onOpenInvestigation={(id) => { actions.selectInvestigation(id); onNavigate('investigate') }}
      onPrepareBrief={actions.prepareBrief}
      onStartProductInvestigation={actions.startProductInvestigationFromWork}
      onUnfollow={actions.unfollowProduct}
      productOptions={productOptions}
      watchlist={intelligence.watchlist}
      watchlistChanges={intelligence.watchlistChanges}
    />
  )

  return (
    <OverviewPage
      brief={network.brief}
      categoryMovers={network.categoryMovers}
      error={network.error}
      loading={network.loading}
      myWork={myWork}
      onAskAboutProduct={actions.askCopilotAboutProduct}
      onBriefAction={actions.handleBriefAction}
      onNavigate={onNavigate}
      onOpenProduct={actions.openProductDetail}
      onOpenStore={actions.openStoreDetail}
      onPeriodChange={onPeriodChange}
      overview={network.overview}
      periodDays={periodDays}
      productMovers={network.productMovers}
      stores={network.stores}
    />
  )
}

export default function CciDashboard() {
  const [credentials, setCredentials] = useState(null)
  const [commercialRole, setCommercialRole] = useState('COMMERCIAL')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [activePage, setActivePage] = useState('overview')
  const [refreshKey, setRefreshKey] = useState(0)
  const layoutRef = useRef(null)

  const [periodDays, setPeriodDays] = useState(DEFAULT_NETWORK_PERIOD_DAYS)
  const [networkOverview, setNetworkOverview] = useState(null)
  const [networkStores, setNetworkStores] = useState([])
  const [networkProductMovers, setNetworkProductMovers] = useState([])
  const [networkCategoryMovers, setNetworkCategoryMovers] = useState([])
  const [networkBrief, setNetworkBrief] = useState([])
  const [networkLoading, setNetworkLoading] = useState(false)
  const [networkError, setNetworkError] = useState('')

  const [selectedStore, setSelectedStore] = useState(null)
  const [storeDetail, setStoreDetail] = useState(null)
  const [storeDetailLoading, setStoreDetailLoading] = useState(false)
  const [storeDetailError, setStoreDetailError] = useState('')
  const [selectedProductName, setSelectedProductName] = useState(null)
  const [productDetail, setProductDetail] = useState(null)
  const [productDetailLoading, setProductDetailLoading] = useState(false)
  const [productDetailError, setProductDetailError] = useState('')

  const [investigations, setInvestigations] = useState([])
  const [fieldTasks, setFieldTasks] = useState([])
  const [movers, setMovers] = useState([])
  const [watchlist, setWatchlist] = useState([])
  const [watchlistChanges, setWatchlistChanges] = useState([])
  const [activations, setActivations] = useState([])
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)
  const [intelligenceError, setIntelligenceError] = useState('')
  const [selectedInvestigationId, setSelectedInvestigationId] = useState(null)
  const [selectedActivationId, setSelectedActivationId] = useState(null)
  const [copilotContext, setCopilotContext] = useState(null)

  usePretextLayout(layoutRef, `${activePage}:${data?.generatedAt || 'login'}`)

  const loadIntelligence = useCallback(async (creds, signal) => {
    if (!creds) return
    setIntelligenceLoading(true)
    setIntelligenceError('')
    try {
      const [investigationsResponse, fieldTasksResponse, moversResponse, watchlistResponse, watchlistChangesResponse, activationsResponse] = await Promise.all([
        fetchInvestigations({ ...creds, signal }),
        fetchFieldTasks({ ...creds, signal }),
        fetchMovers({ ...creds, periodDays: DEFAULT_PERIOD_DAYS, limit: 10, signal }),
        fetchWatchlist({ ...creds, signal }),
        fetchWatchlistChanges({ ...creds, periodDays: DEFAULT_PERIOD_DAYS, signal }),
        fetchActivations({ ...creds, signal }),
      ])
      if (signal?.aborted) return
      setInvestigations(investigationsResponse)
      setFieldTasks(fieldTasksResponse)
      setMovers(moversResponse)
      setActivations(activationsResponse)
      setWatchlist(watchlistResponse)
      setWatchlistChanges(watchlistChangesResponse)
    } catch (requestError) {
      if (requestError?.name !== 'AbortError') {
        setIntelligenceError(requestError?.message || 'Unable to load commercial intelligence data.')
      }
    } finally {
      if (!signal?.aborted) setIntelligenceLoading(false)
    }
  }, [])

  // Network data (Overview/Insights/Stores/Products) is aggregated across every retailer this
  // account can see - no retailerCode is ever sent. It refetches on its own period control, not
  // on the legacy single-retailer refresh cycle below.
  const loadNetwork = useCallback(async (creds, days, signal) => {
    if (!creds) return
    setNetworkLoading(true)
    setNetworkError('')
    try {
      const [overviewResponse, storesResponse, productMoversResponse, categoryMoversResponse, briefResponse] = await Promise.all([
        fetchNetworkOverview({ periodDays: days, ...creds, signal }),
        fetchNetworkStores({ periodDays: days, ...creds, signal }),
        fetchNetworkProductMovers({ periodDays: days, limit: 200, ...creds, signal }),
        fetchNetworkCategoryMovers({ periodDays: days, limit: 20, ...creds, signal }),
        fetchNetworkBrief({ periodDays: days, ...creds, signal }),
      ])
      if (signal?.aborted) return
      setNetworkOverview(overviewResponse)
      setNetworkStores(storesResponse)
      setNetworkProductMovers(productMoversResponse)
      setNetworkCategoryMovers(categoryMoversResponse)
      setNetworkBrief(briefResponse)
    } catch (requestError) {
      if (requestError?.name !== 'AbortError') {
        setNetworkError(requestError?.message || 'Unable to load network intelligence.')
      }
    } finally {
      if (!signal?.aborted) setNetworkLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!credentials) return undefined
    const controller = new AbortController()
    fetchOverview({ ...credentials, signal: controller.signal })
      .then((overview) => { if (!controller.signal.aborted) setData(overview) })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError?.name !== 'AbortError') {
          setError(requestError?.message || 'Unable to load SCAN analytics.')
          if (requestError instanceof ScanApiError && [401, 403].includes(requestError.status)) setData(null)
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    Promise.resolve().then(() => loadIntelligence(credentials, controller.signal))
    return () => controller.abort()
  }, [credentials, refreshKey, loadIntelligence])

  useEffect(() => {
    if (!credentials) return undefined
    const controller = new AbortController()
    Promise.resolve().then(() => loadNetwork(credentials, periodDays, controller.signal))
    return () => controller.abort()
  }, [credentials, periodDays, refreshKey, loadNetwork])

  // Store/product detail are fetched on demand (not part of the list payloads above) - only while
  // a row is actually open, and aborted/discarded if the user picks a different one before it
  // resolves or signs out.
  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve().then(() => {
      if (!credentials || !selectedStore) { setStoreDetail(null); return }
      setStoreDetailLoading(true)
      setStoreDetailError('')
      fetchStoreDetail({ ...credentials, ...selectedStore, periodDays, signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setStoreDetail(result) })
        .catch((requestError) => {
          if (!controller.signal.aborted && requestError?.name !== 'AbortError') {
            setStoreDetailError(requestError?.message || 'Unable to load this store.')
          }
        })
        .finally(() => { if (!controller.signal.aborted) setStoreDetailLoading(false) })
    })
    return () => controller.abort()
  }, [credentials, selectedStore, periodDays])

  useEffect(() => {
    const controller = new AbortController()
    Promise.resolve().then(() => {
      if (!credentials || !selectedProductName) { setProductDetail(null); return }
      setProductDetailLoading(true)
      setProductDetailError('')
      fetchProductDetail({ product: selectedProductName, periodDays, ...credentials, signal: controller.signal })
        .then((result) => { if (!controller.signal.aborted) setProductDetail(result) })
        .catch((requestError) => {
          if (!controller.signal.aborted && requestError?.name !== 'AbortError') {
            setProductDetailError(requestError?.message || 'Unable to load this product.')
          }
        })
        .finally(() => { if (!controller.signal.aborted) setProductDetailLoading(false) })
    })
    return () => controller.abort()
  }, [credentials, selectedProductName, periodDays])

  function refresh() { setLoading(true); setError(''); setRefreshKey((value) => value + 1) }
  async function signIn(accountCredentials) {
    setData(null)
    setError('')
    setLoading(true)
    try {
      const access = await fetchAnalyticsContext(accountCredentials)
      setCommercialRole(access.commercialRole === 'FIELD_SALES' ? 'FIELD_SALES' : 'COMMERCIAL')
      setCredentials({ ...accountCredentials, retailerCode: access.retailers[0].code })
      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(requestError?.message || 'Unable to open SCAN analytics.')
      setLoading(false)
    }
  }
  function signOut() {
    setCredentials(null); setData(null); setError(''); setLoading(false)
    setActivePage('overview'); setInvestigations([]); setFieldTasks([]); setMovers([])
    setWatchlist([]); setWatchlistChanges([]); setActivations([]); setCommercialRole('COMMERCIAL')
    setSelectedInvestigationId(null); setSelectedActivationId(null); setCopilotContext(null)
    setNetworkOverview(null); setNetworkStores([]); setNetworkProductMovers([])
    setNetworkCategoryMovers([]); setNetworkBrief([]); setNetworkError('')
    setPeriodDays(DEFAULT_NETWORK_PERIOD_DAYS)
    setSelectedStore(null); setStoreDetail(null); setStoreDetailError('')
    setSelectedProductName(null); setProductDetail(null); setProductDetailError('')
  }
  async function changeCommercialRole(nextRole) {
    const previous = commercialRole
    setCommercialRole(nextRole)
    try {
      await putCommercialRole({ ...credentials, commercialRole: nextRole })
    } catch {
      setCommercialRole(previous)
    }
  }

  async function withReload(promiseFactory) {
    const result = await promiseFactory()
    await loadIntelligence(credentials)
    return result
  }

  const actions = useMemo(() => ({
    selectInvestigation: setSelectedInvestigationId,
    startProductInvestigation: (productName) => withReload(() => openProductInvestigation({ ...credentials, productName, periodDays: DEFAULT_PERIOD_DAYS })),
    startProductInvestigationFromWork: async (productName) => {
      const created = await withReload(() => openProductInvestigation({ ...credentials, productName, periodDays: DEFAULT_PERIOD_DAYS }))
      setSelectedInvestigationId(created.id)
      setActivePage('investigate')
    },
    startGeneralInvestigation: ({ title, question }) => withReload(() => openGeneralInvestigation({ ...credentials, title, question })),
    addNote: (investigationId, body) => withReload(() => addInvestigationNote({ ...credentials, investigationId, body })),
    confirmHypothesis: (investigationId, hypothesisId) => withReload(() => confirmHypothesis({ ...credentials, investigationId, hypothesisId })),
    rejectHypothesis: (investigationId, hypothesisId) => withReload(() => rejectHypothesis({ ...credentials, investigationId, hypothesisId })),
    closeInvestigation: (investigationId) => withReload(() => closeInvestigation({ ...credentials, investigationId })),
    reopenInvestigation: (investigationId) => withReload(() => reopenInvestigation({ ...credentials, investigationId })),
    createFieldTask: (payload) => withReload(() => createFieldTask({ ...credentials, ...payload })),
    recordFieldTaskResult: (taskId, externalStoreId, result) => withReload(() => recordFieldTaskResult({ ...credentials, taskId, externalStoreId, ...result })),
    askCopilot: (payload) => askCopilot({ ...credentials, ...payload }),
    askCopilotAboutProduct: (productName) => { setCopilotContext({ contextType: 'PRODUCT', subjectName: productName }); setActivePage('copilot') },
    askCopilotAboutInvestigation: (investigationId) => { setCopilotContext({ contextType: 'INVESTIGATION', investigationId }); setActivePage('copilot') },
    prepareBrief: (template) => fetchMeetingBrief({ ...credentials, template, periodDays: 7 }),
    followProduct: (productName) => withReload(() => followProduct({ ...credentials, productName })),
    unfollowProduct: (itemId) => withReload(() => unfollowProduct({ ...credentials, itemId })),
    selectActivation: setSelectedActivationId,
    createActivation: (payload) => withReload(() => createActivation({ ...credentials, ...payload })),
    // A brief/insight item's action is either "go look at the stores page" (no single product to
    // investigate) or "investigate this product" - reusing the same real investigation flow a
    // product's detail row uses, so the resulting detail view is never a dead end.
    handleBriefAction: async (item) => {
      if (!item) { setCopilotContext({ contextType: 'GENERAL' }); setActivePage('copilot'); return }
      if (item.actionType === 'STORES') { setActivePage('stores'); return }
      if (item.actionType === 'PRODUCT' && item.actionTarget) {
        const created = await withReload(() => openProductInvestigation({ ...credentials, productName: item.actionTarget, periodDays: DEFAULT_PERIOD_DAYS }))
        setSelectedInvestigationId(created.id)
        setActivePage('investigate')
      }
    },
    openStoreDetail: (store) => { setSelectedStore({ retailerCode: store.retailerCode, externalStoreId: store.externalStoreId }); setActivePage('store-detail') },
    openProductDetail: (productName) => { setSelectedProductName(productName); setActivePage('product-detail') },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [credentials])

  if (!credentials || (!data && error)) return <Login error={error} loading={loading} onSubmit={signIn} />
  if (!data) return <LoadingState title="Reading retailer evidence…" description="Preparing basket and product analysis." />

  const header = (
    <>
      <WorkspaceHeader
        actions={(
          <>
            {credentials.retailerCode === 'KAGGLE' ? (
              <details className="cci-dataset-menu">
                <summary>Demo data</summary>
                <div><strong>Dataset details</strong><p>Kaggle Supermarket Dataset 2019. These results validate the SCAN workflow and are not current CCI market evidence.</p></div>
              </details>
            ) : null}
            <DataFreshness formatter={formatDateTime} generatedAt={data.generatedAt} />
            <button className="scan-button scan-button-light cci-refresh-button" disabled={loading} onClick={refresh} type="button"><ScanIcon name="refresh" size={17} /><span>{loading ? 'Refreshing…' : 'Refresh'}</span></button>
              <details className="cci-user-menu">
                <summary aria-label="CCI workspace menu">CCI</summary>
                <div>
                  <strong>CCI Sales & Marketing</strong>
                  <small>Commercial intelligence workspace</small>
                  <label className="cci-role-switch" htmlFor="cci-role-select">I am</label>
                  <select id="cci-role-select" onChange={(event) => changeCommercialRole(event.target.value)} value={commercialRole}>
                    <option value="COMMERCIAL">Commercial team</option>
                    <option value="FIELD_SALES">Field Sales</option>
                  </select>
                  <button aria-label="Sign out from user menu" onClick={signOut} type="button"><ScanIcon name="signout" size={16} />Sign out</button>
                </div>
              </details>
          </>
        )}
        eyebrow="CCI commercial intelligence"
        title="SCAN commercial workspace"
      />
      {error ? <div className="scan-inline-notice scan-inline-error" role="alert"><span>{error}</span><button className="scan-button scan-button-light" type="button" onClick={refresh}>Retry</button></div> : null}
    </>
  )

  return (
    <div ref={layoutRef}>
      <WorkspaceShell activePage={activePage} accountLabel="CCI Sales & Marketing" accountMeta="Commercial intelligence" brandSubtitle="CCI Intelligence" disableNavigation={data.totalBaskets === 0} header={header} navItems={NAV_ITEMS} onNavigate={setActivePage} onSignOut={signOut} privacyLabel="No customer or payment identifiers" portal="cci">
        <DashboardPage
          activePage={activePage}
          actions={actions}
          commercialRole={commercialRole}
          credentials={credentials}
          data={data}
          intelligence={{
            investigations, fieldTasks, movers, watchlist, watchlistChanges, activations,
            loading: intelligenceLoading, error: intelligenceError,
            selectedInvestigationId, selectedActivationId, copilotContext,
          }}
          network={{
            overview: networkOverview, stores: networkStores, productMovers: networkProductMovers,
            categoryMovers: networkCategoryMovers, brief: networkBrief,
            loading: networkLoading, error: networkError,
            storeDetail, storeDetailLoading, storeDetailError,
            productDetail, productDetailLoading, productDetailError,
          }}
          onNavigate={setActivePage}
          onPeriodChange={setPeriodDays}
          periodDays={periodDays}
        />
      </WorkspaceShell>
    </div>
  )
}
