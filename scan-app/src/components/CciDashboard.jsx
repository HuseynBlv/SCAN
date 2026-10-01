import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ScanApiError, fetchAnalyticsContext, fetchOverview } from '../services/scanApi'
import {
  addInvestigationNote,
  askCopilot,
  closeInvestigation,
  confirmHypothesis,
  createFieldTask,
  fetchFieldTasks,
  fetchInvestigations,
  fetchMeetingBrief,
  fetchMovers,
  openGeneralInvestigation,
  openProductInvestigation,
  recordFieldTaskResult,
  rejectHypothesis,
  reopenInvestigation,
} from '../services/intelligenceApi'
import { compactChartLabel } from './chartLabels'
import ScanBrand from './ScanBrand'
import ScanIcon from './ScanIcon'
import { usePretextLayout } from './usePretextLayout'
import {
  ChartPanel,
  DataFreshness,
  EmptyState,
  LoadingState,
  MetricStrip,
  OpportunityCard,
  PageIntro,
  SegmentedControl,
  StatusBadge,
  WorkspaceHeader,
  WorkspaceShell,
} from './WorkspaceUI'
import './CciDashboard.css'

const NAV_ITEMS = [
  { id: 'my-work', label: 'My Work', icon: 'home' },
  { id: 'investigate', label: 'Investigate', icon: 'explore' },
  { id: 'activations', label: 'Activations', icon: 'pulse' },
  { id: 'network', label: 'Network', icon: 'database' },
  { id: 'copilot', label: 'Copilot', icon: 'ask' },
]

const NETWORK_TABS = [
  { value: 'stores', label: 'Stores' },
  { value: 'basket', label: 'Baskets' },
  { value: 'products', label: 'Products' },
  { value: 'time', label: 'Time' },
  { value: 'signals', label: 'Signals' },
]

const MIN_OPPORTUNITY_SUPPORT = 5
const DEFAULT_PERIOD_DAYS = 14

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

function insightType(insight) {
  const copy = `${insight.fact} ${insight.interpretation} ${insight.recommendedAction}`.toLowerCase()
  if (/daypart|morning|midday|afternoon|evening|night|time-specific/.test(copy)) return 'Time'
  if (/unmapped|unresolved|coverage|mapping (?:rate|quality|gap)/.test(copy)) return 'Data'
  if (/price|value/.test(copy)) return 'Price'
  if (/companion|bundle|placement/.test(copy)) return 'Bundle'
  if (/store|cluster/.test(copy)) return 'Store'
  return 'Assortment'
}

function companionSupport(insight, data) {
  const companion = data.topCompanionProducts.find((item) => insight.fact.startsWith(item.name))
    || data.topCompanionCategories.find((item) => insight.fact.startsWith(item.category))
  return companion?.basketCount ?? null
}

function isActionableInsight(insight, data) {
  const caution = `${insight.interpretation} ${insight.recommendedAction}`.toLowerCase()
  const support = companionSupport(insight, data)
  if (data.totalBaskets < MIN_OPPORTUNITY_SUPPORT) return false
  if (support !== null && support < MIN_OPPORTUNITY_SUPPORT) return false
  return !/too small|currently present but weak|collect more|before acting|needs review|resolve high-volume unmapped|cannot be calculated/.test(caution)
}

function evidenceForInsight(insight, data) {
  const support = companionSupport(insight, data)
  if (support !== null) return `${integer.format(support)} CCI baskets support this relationship`
  if (insightType(insight) === 'Time') return `${integer.format(data.totalBaskets)} validated baskets in the time analysis`
  if (insightType(insight) === 'Data') return `${decimal.format(data.mappedLinePercentage)}% of transaction lines mapped`
  return data.stores.length
    ? `${integer.format(data.cciBaskets)} CCI baskets across ${integer.format(data.stores.length)} reporting stores`
    : `${integer.format(data.cciBaskets)} CCI baskets in the current aggregate`
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

function MetricTable({ columns, rows, empty }) {
  if (!rows.length) return <EmptyState title="Insufficient data">{empty}</EmptyState>
  return (
    <div className="scan-table-wrap">
      <table className="scan-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{rows.map((row, rowIndex) => (
          <tr key={`${row[0]}-${rowIndex}`}>{row.map((cell, cellIndex) => <td key={`${cellIndex}-${cell}`} title={cellIndex === 0 && typeof cell === 'string' ? cell : undefined}>{cell}</td>)}</tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function CompanionChart({ data, dataKey = 'attachmentRatePercentage', nameKey, label }) {
  if (!data.length) return <EmptyState compact title="Insufficient companion data">Mapped CCI and non-CCI products must occur in the same basket.</EmptyState>
  const accessibleSummary = data.slice(0, 8).map((item) => `${item[nameKey]}: ${decimal.format(item[dataKey])}%`).join('; ')
  return (
    <div className="scan-chart" role="img" aria-label={`${label}. ${accessibleSummary}`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280} initialDimension={{ width: 560, height: 320 }}>
        <BarChart data={data.slice(0, 8)} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 16 }}>
          <CartesianGrid horizontal={false} stroke="#e4e2dd" />
          <XAxis axisLine={false} domain={[0, 'dataMax']} tickFormatter={(value) => `${value}%`} tickLine={false} type="number" />
          <YAxis axisLine={false} dataKey={nameKey} tick={{ fill: '#66645f', fontSize: 12 }} tickFormatter={compactChartLabel} tickLine={false} type="category" width={138} />
          <Tooltip formatter={(value) => [`${decimal.format(value)}%`, 'Attachment rate']} />
          <Bar dataKey={dataKey} fill="#e41e2b" radius={[0, 3, 3, 0]} isAnimationActive />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}

function SegmentList({ data }) {
  if (!data.length) return <EmptyState compact title="Insufficient time data">Validated timestamps are required.</EmptyState>
  return (
    <div className="scan-segment-list">
      {data.map((item) => (
        <div className="scan-segment-row" key={item.segment}>
          <div><strong>{humanize(item.segment)}</strong><span>{integer.format(item.basketCount)} baskets</span></div>
          <b>{decimal.format(item.sharePercentage)}%</b>
          <i aria-hidden="true"><span style={{ width: `${Math.min(item.sharePercentage, 100)}%` }} /></i>
        </div>
      ))}
    </div>
  )
}

function DataTrust({ data }) {
  const healthy = data.mappedLinePercentage >= 90
  return (
    <section className="scan-panel scan-data-health">
      <header className="scan-panel-header"><div><h3>Data health</h3><p>Can this analysis be trusted?</p></div><StatusBadge tone={healthy ? 'success' : 'warning'}>{healthy ? 'Analysis ready' : 'Review needed'}</StatusBadge></header>
      <div className="cci-trust-grid">
        <div><span>Receipts processed</span><strong>{integer.format(data.totalBaskets)}</strong></div>
        <div><span>CCI baskets</span><strong>{integer.format(data.cciBaskets)}</strong></div>
        <div><span>Stores reporting</span><strong>{integer.format(data.stores.length)}</strong></div>
        <div><span>Product mapping</span><strong>{decimal.format(data.mappedLinePercentage)}%</strong></div>
      </div>
      <div className="cci-trust-meter" aria-label={`${decimal.format(data.mappedLinePercentage)}% product mapping coverage`}><i style={{ width: `${Math.min(data.mappedLinePercentage, 100)}%` }} /></div>
      <p>{healthy ? 'Coverage supports analysis of normalized products.' : 'Unmapped lines may understate CCI penetration and companion relationships.'}</p>
      <small>{formatRelativeTime(data.generatedAt)} · {formatDateTime(data.generatedAt)}</small>
    </section>
  )
}

function StoreTable({ data }) {
  return <MetricTable columns={['Store', 'Baskets', 'CCI baskets', 'CCI penetration', 'Average basket']} empty="No store-level aggregates are available." rows={data.stores.map((store) => [store.storeId, integer.format(store.basketCount), integer.format(store.cciBasketCount), `${decimal.format(store.cciPenetrationPercentage)}%`, formatMoney(store.averageBasketValue, data.currency)])} />
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

function MyWork({
  credentials, movers, investigations, fieldTasks, intelligenceLoading, intelligenceError,
  onOpenInvestigation, onStartProductInvestigation, onAskAbout, onNavigate, onPrepareBrief,
}) {
  const [busyProduct, setBusyProduct] = useState(null)
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
    <div className="scan-page-stack cci-my-work">
      <section className="cci-discovery-hero">
        <span className="scan-eyebrow">My Work</span>
        <h2>{itemCount > 0 ? `${itemCount} item${itemCount === 1 ? '' : 's'} need your attention` : 'Everything is caught up'}</h2>
        <p>{credentials.retailerCode === 'KAGGLE' ? 'Demo retailer' : ''} {itemCount === 0 ? 'No declines flagged, nothing open, and no field checks waiting.' : 'Review what changed, what is in progress, and what is waiting on the field team.'}</p>
      </section>

      {intelligenceError ? <div className="scan-inline-notice scan-inline-error" role="alert">{intelligenceError}</div> : null}

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

      <div className="scan-two-column cci-my-work-columns">
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
        <section className="cci-home-section">
          <header className="cci-home-section-heading"><div><h3>Waiting on team</h3></div></header>
          {openTasks.length ? (
            <div className="cci-work-list">
              {openTasks.map((item) => {
                const done = item.stores.filter((store) => store.completed).length
                return (
                  <WorkListCard badgeLabel={`${done}/${item.stores.length} done`} badgeTone="warning" key={item.id} meta={`Assigned to ${item.assignedTo}`} onOpen={() => onNavigate('investigate')} title={item.title} />
                )
              })}
            </div>
          ) : <EmptyState compact title="No field checks waiting">Create one from an investigation when you need real-world confirmation.</EmptyState>}
        </section>
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
  investigation, fieldTasks, stores, onBack, onAddNote, onConfirmHypothesis, onRejectHypothesis,
  onClose, onReopen, onCreateFieldTask, onRecordFieldTaskResult, onAskCopilot,
}) {
  const [noteBody, setNoteBody] = useState('')
  const [showFieldTaskForm, setShowFieldTaskForm] = useState(false)
  const [busyHypothesis, setBusyHypothesis] = useState(null)
  const systemNotes = investigation.notes.filter((note) => note.system)
  const humanNotes = investigation.notes.filter((note) => !note.system)
  const linkedTasks = fieldTasks.filter((task) => task.investigationId === investigation.id)

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
  const selected = investigations.find((item) => item.id === selectedInvestigationId)

  if (selected) {
    return (
      <InvestigationDetail
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
      {loading ? <p className="cci-work-loading">Loading investigations…</p> : investigations.length ? (
        <div className="cci-investigation-list">
          {investigations.map((item) => (
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
      {answer.nextSteps.length ? (
        <div className="cci-copilot-next-steps">
          {answer.nextSteps.map((step) => <StatusBadge key={step.label} tone="neutral">{step.label}</StatusBadge>)}
        </div>
      ) : null}
    </section>
  )
}

function Copilot({ context, productOptions, investigations, onAsk }) {
  const [contextType, setContextType] = useState(context?.contextType || 'GENERAL')
  const [subjectName, setSubjectName] = useState(context?.subjectName || '')
  const [investigationId, setInvestigationId] = useState(context?.investigationId || '')
  const [question, setQuestion] = useState('')
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
        question: question.trim() || 'What changed?',
      })
      setAnswer(response)
    } finally {
      setLoading(false)
    }
  }

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
          <label className="sr-only" htmlFor="cci-copilot-question">Question</label>
          <input id="cci-copilot-question" onChange={(event) => setQuestion(event.target.value)} placeholder="What do you want to know?" value={question} />
          <button className="scan-button scan-button-dark" disabled={loading} type="submit">{loading ? 'Thinking…' : 'Ask'}</button>
        </form>
      </section>
      {answer ? <CopilotAnswerView answer={answer} /> : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Activations (Phase 2 placeholder)                                   */
/* ------------------------------------------------------------------ */

function Activations() {
  return (
    <div className="scan-page-stack">
      <PageIntro description="Test stores against control stores, then review results with honest, non-causal language." eyebrow="Activations" title="Coming in a future phase." />
      <EmptyState title="Activations are not built yet">Trade Marketing and Sales will be able to set up test-vs-control activations here, with a during-activation performance view and a post-completion review. This is intentionally not faked — it will appear once the activation workflow is real.</EmptyState>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Network (infrastructure + analytical depth)                         */
/* ------------------------------------------------------------------ */

function BasketDna({ data }) {
  const [mode, setMode] = useState('categories')
  const relationships = mode === 'categories' ? data.topCompanionCategories : data.topCompanionProducts
  const nameKey = mode === 'categories' ? 'category' : 'name'
  const [selectedKey, setSelectedKey] = useState(null)
  const selected = relationships.find((item) => item[nameKey] === selectedKey) || relationships[0]
  const maxStrength = Math.max(...relationships.map((item) => item.attachmentRatePercentage), 1)

  return (
    <section className="cci-basket-dna">
      <header className="cci-home-section-heading">
        <div><span className="scan-eyebrow">Observed together</span><h2>Basket DNA</h2><p>Which products and categories share baskets with mapped CCI products?</p></div>
        <SegmentedControl label="Basket DNA relationship type" onChange={setMode} options={[{ value: 'categories', label: 'Categories' }, { value: 'products', label: 'Products' }]} value={mode} />
      </header>
      {relationships.length ? (
        <div className="cci-dna-layout">
          <div className="cci-dna-map" aria-label={`Basket co-occurrence with companion ${mode}`} role="group">
            <div className="cci-dna-origin"><span>Basket center</span><strong>CCI products</strong><small>{integer.format(data.cciBaskets)} baskets</small></div>
            <div className="cci-dna-connections">
              {relationships.slice(0, 5).map((item) => {
                const strength = item.attachmentRatePercentage / maxStrength
                return (
                  <button
                    aria-pressed={selected?.[nameKey] === item[nameKey]}
                    className={selected?.[nameKey] === item[nameKey] ? 'is-selected' : ''}
                    key={item[nameKey]}
                    onClick={() => setSelectedKey(item[nameKey])}
                    style={{ '--relationship-width': `${32 + (strength * 68)}%` }}
                    title={`${decimal.format(item.attachmentRatePercentage)}% attachment rate; ${integer.format(item.basketCount)} CCI baskets`}
                    type="button"
                  >
                    <i aria-hidden="true" />
                    <span><strong>{item[nameKey]}</strong><small>{decimal.format(item.attachmentRatePercentage)}% observed together</small></span>
                  </button>
                )
              })}
            </div>
          </div>
          <aside className="cci-dna-detail" aria-live="polite">
            <StatusBadge tone="neutral">Basket co-occurrence</StatusBadge>
            <h3>{selected?.[nameKey]}</h3>
            <strong>{selected ? `${decimal.format(selected.attachmentRatePercentage)}%` : '—'}</strong>
            <p>Share of mapped CCI baskets containing this {mode === 'categories' ? 'category' : 'product'}.</p>
            <dl><div><dt>Support</dt><dd>{selected ? `${integer.format(selected.basketCount)} baskets` : 'Insufficient data'}</dd></div><div><dt>Denominator</dt><dd>{integer.format(data.cciBaskets)} CCI baskets</dd></div></dl>
            <small>This is observed co-occurrence, not evidence of causation.</small>
          </aside>
        </div>
      ) : <EmptyState title="Insufficient basket relationships">Mapped CCI and non-CCI products must occur in the same basket.</EmptyState>}
    </section>
  )
}

function NetworkStores({ data }) {
  return (
    <div className="scan-page-stack">
      <MetricStrip label="Store reporting summary" items={[
        { label: 'Reporting stores', value: integer.format(data.stores.length), note: 'Present in this dataset' },
        { label: 'Transaction volume', value: integer.format(data.totalBaskets), note: 'Validated baskets' },
        { label: 'CCI penetration', value: `${decimal.format(data.cciPenetrationPercentage)}%`, note: 'Across reporting stores' },
        { label: 'Data health', value: `${decimal.format(data.mappedLinePercentage)}%`, note: 'Product mapping coverage' },
      ]} />
      <DataTrust data={data} />
      <section className="scan-panel"><header className="scan-panel-header"><div><h3>Store overview</h3><p>{formatRelativeTime(data.generatedAt)}</p></div></header><StoreTable data={data} /></section>
    </div>
  )
}

function NetworkBaskets({ data }) {
  return (
    <div className="scan-page-stack">
      <div className="scan-two-column">
        <ChartPanel title="Which products appear most often with CCI?" description="Share of CCI baskets containing each product · Attachment rate"><CompanionChart data={data.topCompanionProducts} nameKey="name" label="Companion product attachment rates" /></ChartPanel>
        <ChartPanel title="Which categories appear most often with CCI?" description="Share of CCI baskets containing each category · Attachment rate"><CompanionChart data={data.topCompanionCategories} nameKey="category" label="Companion category attachment rates" /></ChartPanel>
      </div>
      <BasketDna data={data} />
    </div>
  )
}

function NetworkProducts({ data }) {
  const revenue = data.cciSkuPerformance.reduce((sum, item) => sum + item.revenue, 0)
  const quantity = data.cciSkuPerformance.reduce((sum, item) => sum + item.quantity, 0)
  return (
    <div className="scan-page-stack">
      <MetricStrip label="CCI product context" items={[
        { label: 'Mapped CCI SKUs', value: integer.format(data.cciSkuPerformance.length) },
        { label: 'CCI units', value: decimal.format(quantity), note: 'Imported line quantity' },
        { label: 'CCI revenue', value: formatMoney(revenue, data.currency), note: 'Sum of mapped CCI line totals' },
      ]} />
      <section className="scan-panel"><header className="scan-panel-header"><div><h3>Which CCI products drive the most baskets?</h3><p>Recorded baskets, units, and revenue</p></div></header><MetricTable columns={['CCI product', 'Baskets', 'Quantity', `Revenue (${data.currency})`]} empty="No mapped CCI products appear in the imported baskets." rows={data.cciSkuPerformance.map((item) => [item.product, integer.format(item.basketCount), decimal.format(item.quantity), formatMoney(item.revenue, data.currency)])} /></section>
    </div>
  )
}

function NetworkTime({ data }) {
  return <div className="scan-two-column"><section className="scan-panel"><header className="scan-panel-header"><div><h3>When does basket activity peak?</h3><p>Daypart share · Retailer profile timezone</p></div></header><SegmentList data={data.dayparts} /></section><section className="scan-panel"><header className="scan-panel-header"><div><h3>How does weekday activity compare?</h3><p>Share of validated baskets</p></div></header><SegmentList data={data.weekdayWeekend} /></section></div>
}

function NetworkSignals({ data }) {
  const opportunities = data.insights.filter((insight) => isActionableInsight(insight, data))
  const signals = data.insights.filter((insight) => !isActionableInsight(insight, data))
  return (
    <div className="scan-page-stack">
      {opportunities.length ? (
        <section className="scan-page-stack">
          <header className="scan-subsection-heading"><div><span className="scan-eyebrow">Action-ready</span><h3>Supported by enough evidence</h3></div></header>
          <div className="scan-opportunity-grid">{opportunities.map((insight, index) => <OpportunityCard evidence={evidenceForInsight(insight, data)} index={index} insight={insight} key={`${insight.fact}-${index}`} />)}</div>
        </section>
      ) : null}
      {signals.length ? (
        <section className="scan-page-stack">
          <header className="scan-subsection-heading"><div><span className="scan-eyebrow">Observed signals</span><h3>Keep watching. Do not act yet.</h3></div><p>These patterns need more evidence or better product mapping.</p></header>
          <div className="scan-opportunity-grid">{signals.map((insight, index) => <OpportunityCard evidence={evidenceForInsight(insight, data)} index={index} insight={insight} key={`${insight.fact}-${index}`} signal />)}</div>
        </section>
      ) : null}
      {!opportunities.length && !signals.length ? <EmptyState title="No signals yet">More mapped baskets are needed before SCAN can surface a signal.</EmptyState> : null}
    </div>
  )
}

function Network({ data }) {
  const [tab, setTab] = useState('stores')
  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="Network" title="Infrastructure and analytical depth." description="Stores reporting, mapping coverage, and the full basket/product/time analysis behind SCAN's findings." aside={<SegmentedControl label="Network views" onChange={setTab} options={NETWORK_TABS} value={tab} />} />
      {tab === 'basket' ? <NetworkBaskets data={data} /> : tab === 'products' ? <NetworkProducts data={data} /> : tab === 'time' ? <NetworkTime data={data} /> : tab === 'signals' ? <NetworkSignals data={data} /> : <NetworkStores data={data} />}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Shell                                                                */
/* ------------------------------------------------------------------ */

function DashboardPage({ activePage, data, intelligence, credentials, actions, onNavigate }) {
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
  if (activePage === 'activations') return <Activations />
  if (activePage === 'network') return <Network data={data} />
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
  return (
    <MyWork
      credentials={credentials}
      fieldTasks={intelligence.fieldTasks}
      intelligenceError={intelligence.error}
      intelligenceLoading={intelligence.loading}
      investigations={intelligence.investigations}
      movers={intelligence.movers}
      onAskAbout={actions.askCopilotAboutProduct}
      onNavigate={onNavigate}
      onOpenInvestigation={(id) => { actions.selectInvestigation(id); onNavigate('investigate') }}
      onPrepareBrief={actions.prepareBrief}
      onStartProductInvestigation={actions.startProductInvestigationFromWork}
    />
  )
}

export default function CciDashboard() {
  const [credentials, setCredentials] = useState(null)
  const [retailerOptions, setRetailerOptions] = useState([])
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [activePage, setActivePage] = useState('my-work')
  const [refreshKey, setRefreshKey] = useState(0)
  const layoutRef = useRef(null)
  const retailerMenuRef = useRef(null)

  const [investigations, setInvestigations] = useState([])
  const [fieldTasks, setFieldTasks] = useState([])
  const [movers, setMovers] = useState([])
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)
  const [intelligenceError, setIntelligenceError] = useState('')
  const [selectedInvestigationId, setSelectedInvestigationId] = useState(null)
  const [copilotContext, setCopilotContext] = useState(null)

  usePretextLayout(layoutRef, `${activePage}:${data?.generatedAt || 'login'}`)

  const loadIntelligence = useCallback(async (creds, signal) => {
    if (!creds) return
    setIntelligenceLoading(true)
    setIntelligenceError('')
    try {
      const [investigationsResponse, fieldTasksResponse, moversResponse] = await Promise.all([
        fetchInvestigations({ ...creds, signal }),
        fetchFieldTasks({ ...creds, signal }),
        fetchMovers({ ...creds, periodDays: DEFAULT_PERIOD_DAYS, limit: 10, signal }),
      ])
      if (signal?.aborted) return
      setInvestigations(investigationsResponse)
      setFieldTasks(fieldTasksResponse)
      setMovers(moversResponse)
    } catch (requestError) {
      if (requestError?.name !== 'AbortError') {
        setIntelligenceError(requestError?.message || 'Unable to load commercial intelligence data.')
      }
    } finally {
      if (!signal?.aborted) setIntelligenceLoading(false)
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

  function refresh() { setLoading(true); setError(''); setRefreshKey((value) => value + 1) }
  async function signIn(accountCredentials) {
    setData(null)
    setError('')
    setLoading(true)
    try {
      const access = await fetchAnalyticsContext(accountCredentials)
      setRetailerOptions(access.retailers)
      setCredentials({ ...accountCredentials, retailerCode: access.retailers[0].code })
      setRefreshKey((value) => value + 1)
    } catch (requestError) {
      setError(requestError?.message || 'Unable to open SCAN analytics.')
      setLoading(false)
    }
  }
  function switchRetailer(retailerCode) {
    if (retailerMenuRef.current) retailerMenuRef.current.open = false
    if (!credentials || retailerCode === credentials.retailerCode) return
    setError('')
    setLoading(true)
    setCredentials((current) => ({ ...current, retailerCode }))
  }
  function signOut() {
    setCredentials(null); setRetailerOptions([]); setData(null); setError(''); setLoading(false)
    setActivePage('my-work'); setInvestigations([]); setFieldTasks([]); setMovers([])
    setSelectedInvestigationId(null); setCopilotContext(null)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [credentials])

  if (!credentials || (!data && error)) return <Login error={error} loading={loading} onSubmit={signIn} />
  if (!data) return <LoadingState title="Reading retailer evidence…" description="Preparing basket and product analysis." />

  const header = (
    <>
      <WorkspaceHeader
        actions={(
          <>
            {retailerOptions.length > 1 ? (
              <details className="cci-dataset-menu cci-retailer-menu" ref={retailerMenuRef}>
                <summary>{data.retailerName}</summary>
                <div>
                  <strong>Switch retailer</strong>
                  <small>Retailers sharing aggregate analytics with CCI HQ.</small>
                  <ul className="cci-retailer-list">
                    {retailerOptions.map((option) => (
                      <li key={option.code}>
                        <button aria-current={option.code === credentials.retailerCode ? 'true' : undefined} aria-label={`${option.name} ${option.code}`} className={`cci-retailer-option${option.code === credentials.retailerCode ? ' is-selected' : ''}`} onClick={() => switchRetailer(option.code)} type="button">
                          <span>{option.name}</span>
                          <small>{option.code}</small>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ) : null}
            {credentials.retailerCode === 'KAGGLE' ? (
              <details className="cci-dataset-menu">
                <summary>Demo data</summary>
                <div><strong>Dataset details</strong><p>Kaggle Supermarket Dataset 2019. These results validate the SCAN workflow and are not current CCI market evidence.</p></div>
              </details>
            ) : null}
            <DataFreshness formatter={formatDateTime} generatedAt={data.generatedAt} />
            <button className="scan-button scan-button-light cci-refresh-button" disabled={loading} onClick={refresh} type="button"><ScanIcon name="refresh" size={17} /><span>{loading ? 'Refreshing…' : 'Refresh'}</span></button>
              <details className="cci-user-menu"><summary aria-label="CCI workspace menu">CCI</summary><div><strong>CCI Sales & Marketing</strong><small>Commercial intelligence workspace</small><button aria-label="Sign out from user menu" onClick={signOut} type="button"><ScanIcon name="signout" size={16} />Sign out</button></div></details>
          </>
        )}
        eyebrow="CCI commercial intelligence"
        meta={<p>{credentials.retailerCode === 'KAGGLE' ? 'Demo retailer' : data.retailerName} · {data.retailerCode}</p>}
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
          credentials={credentials}
          data={data}
          intelligence={{
            investigations, fieldTasks, movers, loading: intelligenceLoading, error: intelligenceError,
            selectedInvestigationId, copilotContext,
          }}
          onNavigate={setActivePage}
        />
      </WorkspaceShell>
    </div>
  )
}
