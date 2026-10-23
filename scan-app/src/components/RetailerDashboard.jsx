import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ScanApiError } from '../services/scanApi'
import {
  fetchRetailerActions,
  fetchRetailerOffers,
  fetchRetailerOpportunities,
  fetchRetailerOverview,
  fetchRetailerPartnerStatus,
  startRetailerOpportunityTrial,
} from '../services/retailerApi'
import ScanBrand from './ScanBrand'
import ScanIcon from './ScanIcon'
import { TimedLoadingScreen } from './LoadingScreen'
import { PRESENTATION_LOADING_DURATION_MS } from './loadingConfig'
import RetailerIntelligenceDrawer from './RetailerIntelligenceDrawer'
import {
  isPresentationCredentials,
  PRESENTATION_PASSWORD,
  PRESENTATION_USERNAME,
  presentationEngagement,
  presentationOpportunities,
  presentationOverview,
} from './presentationRetailer'
import { usePretextLayout } from './usePretextLayout'
import {
  ChartPanel,
  DataFreshness,
  EmptyState,
  LoadingState,
  PageIntro,
  StatusBadge,
  WorkspaceHeader,
  WorkspaceShell,
} from './WorkspaceUI'
import {
  Badge,
  BenchmarkIndicator,
  Card,
  MetricCard,
  MiniChart,
  SectionHeader,
} from './RetailerUI'
import './CciDashboard.css'
import './RetailerDashboard.css'

// The retailer home page answers "what do I get from SCAN?", not "here is a dashboard to
// interpret". Real analytics (sales trend, best sellers, slow movers) stay one tap away under
// Insights, but they support decisions here - they are not the reason to open the app.
const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'actions', label: 'Actions', icon: 'opportunities' },
  { id: 'opportunities', label: 'Opportunities', icon: 'recommendations' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'data', label: 'Data', icon: 'database' },
  { id: 'partner', label: 'Partner', icon: 'time-store' },
]

const PERIODS = [
  { value: 'LAST_7_DAYS', label: '7 days' },
  { value: 'LAST_30_DAYS', label: '30 days' },
  { value: 'LAST_90_DAYS', label: '90 days' },
  { value: 'ALL_TIME', label: 'All time' },
]

const DATA_IMPORT_STEPS = [
  'Read file',
  'Validate receipts',
  'Match products',
  'Build baskets',
  'Calculate insights',
  'Update actions',
]

const ACTION_TYPE_META = {
  STOCK_RISK: { label: 'Stock risk', tone: 'warning' },
  BASKET_OPPORTUNITY: { label: 'Basket opportunity', tone: 'red' },
  OPPORTUNITY: { label: 'Opportunity', tone: 'red' },
  INVENTORY: { label: 'Inventory', tone: 'neutral' },
  PERFORMANCE: { label: 'Performance', tone: 'success' },
}

// SCAN Partner benefits are a uniform commercial policy for every retailer at a given tier, not
// a fact observed from any one retailer's data - so, unlike everything else on this screen, this
// copy is legitimately the same for every account at the same level. Silver already includes
// personalized offers: Gold and Platinum add more, they do not gate offers from existing at all.
const PARTNER_BENEFITS = {
  SILVER: [
    'Standard personalized offers',
    'SCAN recommendations',
    'Store performance insights',
    'Standard promotional campaigns',
  ],
  GOLD: [
    'Enhanced personalized offers',
    'Exclusive promotional campaigns',
    'Bonus-product opportunities',
    'Early campaign access',
    'Additional merchandising opportunities',
  ],
  PLATINUM: [
    'Priority promotional activations',
    'New product trials',
    'Premium partner campaigns',
    'Enhanced merchandising support',
    'Priority access to selected CCI programs',
  ],
}

const NEXT_LEVEL_PREVIEW = {
  GOLD: PARTNER_BENEFITS.GOLD,
  PLATINUM: PARTNER_BENEFITS.PLATINUM,
}

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

function formatMoney(value, currency) {
  const amount = Number(value || 0)
  if (!currency || currency === 'N/A') return amount.toFixed(2)
  // Intl has no manat glyph for AZN in this locale (it renders the literal code, "AZN 14.4",
  // with an inconsistent decimal count) - match the ₼ symbol and fixed 2 decimals the backend
  // already uses in offer and benefit text, so money reads the same everywhere on the page.
  if (currency === 'AZN') return `₼${amount.toFixed(2)}`
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function formatHomeMoney(value, currency, fractionDigits = 2) {
  const amount = Number(value || 0)
  const formatted = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount)
  return currency === 'AZN' ? `₼${formatted}` : formatMoney(amount, currency)
}

function formatDateTime(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

function formatTime(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function humanize(value) {
  return `${value || ''}`.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
}

function formatDay(value) {
  if (!value) return 'Today'
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(value))
}

function formatClock(value) {
  if (!value) return '—'
  return new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function greeting(now = new Date()) {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

function retailerDisplayName(data) {
  return data.retailerCode === 'KAGGLE' ? 'Demo shop' : data.retailerName
}

// Only real, business-facing feed problems belong here. Data-quality/mapping-coverage concerns
// are an internal SCAN/CCI operations matter, not something a retailer needs to see or act on.
function attentionItems(data) {
  const items = []
  if (data.sync.state !== 'COMPLETED' || data.sync.errors.length) {
    items.push({
      id: 'sync',
      title: 'Checkout data needs attention',
      description: data.sync.errors[0] || `The latest feed is ${humanize(data.sync.state)}.`,
      action: 'Check the latest checkout export or reconnect the feed.',
    })
  }
  return items
}

function Login({ error, loading, onSubmit }) {
  const [username, setUsername] = useState('scan-retailer')
  const [password, setPassword] = useState('')

  function submit(event) {
    event.preventDefault()
    onSubmit({ username: username.trim(), password })
  }

  function openPresentation() {
    setUsername(PRESENTATION_USERNAME)
    setPassword(PRESENTATION_PASSWORD)
    onSubmit({ username: PRESENTATION_USERNAME, password: PRESENTATION_PASSWORD })
  }

  return (
    <main className="cci-login-shell retailer-login-shell">
      <section className="cci-login-card" aria-labelledby="retailer-login-title">
        <a className="login-home-link" href="/"><span aria-hidden="true">←</span> Back to SCAN home</a>
        <ScanBrand subtitle="Sales & Consumption Analytics Network" />
        <div className="cci-login-copy">
          <span className="cci-eyebrow">Retailer workspace</span>
          <h1 id="retailer-login-title">Connect once. Operate normally. Get more value.</h1>
          <p>SCAN turns your checkout data into commercial benefits, personalized offers, and simple recommendations - automatically.</p>
        </div>
        <form className="cci-login-form" onSubmit={submit}>
          <label>Username<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Password<input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
          <button className="cci-primary-button" disabled={loading} type="submit">{loading ? 'Connecting…' : 'Open my dashboard'}</button>
          <div className="retailer-presentation-access">
            <span>Presentation mode</span>
            <p>Explore a polished shop account with realistic synthetic data and working interactions.</p>
            <button disabled={loading} onClick={openPresentation} type="button">Open presentation account <span aria-hidden="true">→</span></button>
          </div>
        </form>
        <div className="portal-switch-links">
          <a className="portal-switch-link" href="/?portal=cci">CCI intelligence workspace <span aria-hidden="true">→</span></a>
          <a className="portal-switch-link" href="/?portal=connection">Data connection <span aria-hidden="true">→</span></a>
          <a className="portal-switch-link" href="/?portal=onboarding">Retailer onboarding <span aria-hidden="true">→</span></a>
        </div>
      </section>
    </main>
  )
}

function PeriodControl({ loading, onChange, value }) {
  return (
    <label className="retailer-period-select">
      <span>Period</span>
      <select aria-label="Period" disabled={loading} value={value} onChange={(event) => onChange(event.target.value)}>
        {PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
      </select>
    </label>
  )
}

function SalesTrend({ data }) {
  if (!data.dailySales.length) return <EmptyState compact title="No daily sales trend">Imported transactions will appear here.</EmptyState>
  const accessibleSummary = data.dailySales
    .map((day) => `${formatDay(day.date)}: ${formatMoney(day.totalSales, data.currency)}`)
    .join('; ')
  return (
    <div className="scan-chart retailer-sales-chart" role="img" aria-label={`Daily retailer sales. ${accessibleSummary}`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260} initialDimension={{ width: 600, height: 300 }}>
        <LineChart data={data.dailySales} margin={{ top: 10, right: 20, bottom: 8, left: 4 }}>
          <CartesianGrid vertical={false} stroke="#e4e2dd" />
          <XAxis axisLine={false} dataKey="date" tickFormatter={(value) => `${value}`.slice(5)} tickLine={false} />
          <YAxis axisLine={false} tickLine={false} width={54} />
          <Tooltip formatter={(value) => formatMoney(value, data.currency)} />
          <Line dataKey="totalSales" dot={data.dailySales.length < 12} stroke="#e41e2b" strokeWidth={2.5} type="monotone" isAnimationActive />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function AttentionBanner({ items, onNavigate }) {
  return (
    <section className="retailer-simple-section retailer-needs-attention">
      <header><h2>Needs attention</h2><StatusBadge tone="warning">{items.length} {items.length === 1 ? 'item' : 'items'}</StatusBadge></header>
      <div className="retailer-attention-list">
        {items.map((item) => <article key={item.id}><ScanIcon name="alerts" size={21} /><div><strong>{item.title}</strong><p>{item.description}</p></div><button onClick={() => onNavigate('actions')} type="button">View in Actions <ScanIcon name="chevron" size={16} /></button></article>)}
      </div>
    </section>
  )
}

function percentageChange(current, comparison) {
  if (!comparison) return null
  return ((current - comparison) / comparison) * 100
}

function signedPercent(value) {
  if (value == null || !Number.isFinite(value)) return 'No comparison'
  return `${value >= 0 ? '+' : ''}${decimal.format(value)}%`
}

function homeState(data, engagement) {
  const daily = data.dailySales || []
  const latest = daily.at(-1) || { totalSales: data.totalSales, basketCount: data.totalBaskets }
  const priorWeek = daily.at(-8)
  const presentation = data.home
  const sales = presentation?.todaySales ?? latest.totalSales
  const transactions = presentation?.todayTransactions ?? latest.basketCount
  const averageBasket = presentation?.todayAverageBasket ?? (transactions ? sales / transactions : 0)
  const priorAverage = priorWeek?.basketCount ? priorWeek.totalSales / priorWeek.basketCount : null
  const attention = attentionItems(data)
  const changes = presentation?.detectedChanges || [
    ...engagement.actions.slice(0, 2).map((action) => ({ title: action.title, metric: action.metricValue, explanation: action.explanation, target: 'actions' })),
    ...data.insights.slice(0, 3).map((insight) => ({ title: insight.fact, metric: 'Detected', explanation: insight.interpretation, target: 'insights' })),
  ].slice(0, 3)
  const activity = presentation?.activity || [
    { time: formatClock(data.sync.completedAt), title: 'POS data processed', detail: `${integer.format(data.sync.importedReceipts || data.totalBaskets)} receipts validated` },
    { time: formatClock(data.generatedAt), title: `${changes.length} insights updated`, detail: 'Store intelligence refreshed' },
    engagement.actions[0] ? { time: formatClock(data.generatedAt), title: 'Priority action created', detail: engagement.actions[0].title } : null,
    engagement.offers.available[0] ? { time: formatClock(data.generatedAt), title: 'Opportunity updated', detail: engagement.offers.available[0].productName } : null,
  ].filter(Boolean)
  return {
    sales,
    transactions,
    averageBasket,
    salesChange: presentation?.salesChange ?? percentageChange(sales, priorWeek?.totalSales),
    transactionChange: presentation?.transactionChange ?? percentageChange(transactions, priorWeek?.basketCount),
    averageBasketChange: presentation?.averageBasketChange ?? percentageChange(averageBasket, priorAverage),
    salesTrend: presentation?.salesTrend || daily.slice(-10).map((day) => day.totalSales),
    transactionTrend: presentation?.transactionTrend || daily.slice(-10).map((day) => day.basketCount),
    averageBasketTrend: presentation?.averageBasketTrend || daily.slice(-10).map((day) => day.basketCount ? day.totalSales / day.basketCount : 0),
    changes,
    activity,
    attention,
    attentionCount: presentation?.attentionCount ?? attention.length,
    operatingItems: presentation?.operatingItems ?? Math.max(changes.length + attention.length, 1),
  }
}

function HomeSalesMovement({ data }) {
  const chartData = (data.home?.salesMovement || data.dailySales.slice(-14)).map((day, index, values) => ({
    ...day,
    baseline: day.baseline ?? values.slice(Math.max(0, index - 4), index + 1).reduce((sum, item) => sum + Number(item.totalSales || 0), 0) / Math.min(index + 1, 5),
  }))
  if (!chartData.length) return <EmptyState compact title="No sales movement yet">Daily sales appear after the first checkout export.</EmptyState>
  return (
    <div className="retailer-home-chart" role="img" aria-label="Sales movement with a comparison baseline and detected event markers">
      <ResponsiveContainer height="100%" initialDimension={{ width: 700, height: 250 }} minHeight={230} minWidth={0} width="100%">
        <LineChart data={chartData} margin={{ top: 18, right: 18, bottom: 2, left: 0 }}>
          <CartesianGrid stroke="#ebe9e4" vertical={false} />
          <XAxis axisLine={false} dataKey="date" tickFormatter={(value) => formatDay(value)} tickLine={false} />
          <YAxis axisLine={false} tickLine={false} width={48} />
          <Tooltip formatter={(value, name) => [formatMoney(value, data.currency), name === 'totalSales' ? 'Sales' : 'Baseline']} labelFormatter={formatDay} />
          <Line dataKey="baseline" dot={false} isAnimationActive stroke="#b9bab6" strokeDasharray="5 5" strokeWidth={1.5} type="monotone" />
          <Line dataKey="totalSales" dot={false} isAnimationActive stroke="#f40009" strokeWidth={2.5} type="monotone" />
          {chartData.filter((day) => day.event).map((day) => <ReferenceDot fill="#f40009" key={`${day.date}-${day.event}`} r={4} stroke="#fff" strokeWidth={2} x={day.date} y={day.totalSales} />)}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function Home({ data, engagement, motionState, motionTick, onNavigate, onOpenIntelligence }) {
  const state = homeState(data, engagement)
  const opportunity = engagement.offers.available[1] || engagement.offers.available[0]
  const action = engagement.actions[0]
  const healthy = data.sync.state === 'COMPLETED' && !data.sync.errors.length
  const topProducts = [...data.topProducts].sort((a, b) => b.quantity - a.quantity).slice(0, 4)

  return (
    <div className="scan-page-stack retailer-home retailer-commerce-home retailer-ops-home">
      <section className="retailer-ops-brief">
        <div><span>{greeting()}</span><strong>{state.operatingItems} things deserve attention today.</strong></div>
        <small>SCAN refreshed the store operating picture from the latest validated checkout data.</small>
      </section>

      <div className="retailer-commerce-grid retailer-ops-kpis">
        <MetricCard change={signedPercent(state.salesChange)} changeTone={state.salesChange >= 0 ? 'positive' : 'warning'} chartValues={state.salesTrend} icon="sales" key={`sales-${motionTick}`} label="Sales today" note="vs last Tuesday" value={formatHomeMoney(state.sales, data.currency, 0)} />
        <MetricCard change={signedPercent(state.transactionChange)} changeTone={state.transactionChange >= 0 ? 'positive' : 'warning'} chartValues={state.transactionTrend} icon="basket" key={`transactions-${motionTick}`} label="Transactions" note="vs last Tuesday" value={integer.format(state.transactions)} />
        <MetricCard change={signedPercent(state.averageBasketChange)} changeTone={state.averageBasketChange >= 0 ? 'positive' : 'warning'} chartValues={state.averageBasketTrend} icon="chart" key={`basket-${motionTick}`} label="Average basket" note="vs last Tuesday" value={formatHomeMoney(state.averageBasket, data.currency)} />
        <Card className="retailer-store-pulse">
          <header><span>Store pulse</span><div className={`retailer-pulse-orbit ${healthy ? 'is-healthy' : 'is-warning'}`}><ScanIcon name={healthy ? 'pulse' : 'warning'} size={18} /></div></header>
          <strong>{healthy ? 'Healthy' : 'Needs attention'}</strong>
          <ul><li><i className="is-red" />{engagement.offers.available.length} opportunities</li><li><i className={state.attentionCount ? 'is-warning' : 'is-positive'} />{state.attentionCount} {state.attentionCount === 1 ? 'item needs' : 'items need'} attention</li></ul>
        </Card>
      </div>

      <div className="retailer-commerce-grid retailer-ops-intelligence-row">
        <Card className={`retailer-detected-changes ${motionState === 'updated' ? 'is-new' : ''}`}>
          <SectionHeader action={<div className="retailer-insight-status">{motionState === 'updated' ? <Badge tone="positive">New</Badge> : null}<Badge tone="red">Live</Badge></div>} description="What changed today" eyebrow="SCAN Intelligence" title="Detected changes" />
          <ol>
            {state.changes.map((change, index) => (
              <li key={`${change.title}-${index}`}>
                <span>{String(index + 1).padStart(2, '0')}</span>
                <i className={index === 1 ? 'is-warning' : 'is-red'} />
                <div><strong>{change.title}</strong><small>{change.explanation}</small></div>
                <b>{change.metric}</b>
                <button aria-label={`Open ${change.title}`} onClick={() => onNavigate(change.target || 'insights')} type="button"><ScanIcon name="chevron" size={16} /></button>
              </li>
            ))}
          </ol>
          <footer><button className="scan-button scan-button-primary" onClick={(event) => onOpenIntelligence(null, event.currentTarget)} type="button"><ScanIcon name="ask" size={16} />Ask SCAN</button></footer>
        </Card>

        <Card className="retailer-store-activity">
          <SectionHeader title="Store activity" />
          <ol>{state.activity.slice(0, 4).map((item, index) => <li key={`${item.time}-${item.title}-${index}`}><time>{item.time}</time><i /><div><strong>{item.title}</strong><small>{item.detail}</small></div></li>)}</ol>
        </Card>
      </div>

      <div className="retailer-commerce-grid retailer-ops-decision-row">
        {opportunity ? (
          <Card className="retailer-opportunity-focus">
            <SectionHeader action={<Badge tone="red">Top opportunity</Badge>} title={opportunity.productName} />
            {opportunity.affinityValue ? (
              <div className="retailer-affinity-visual" aria-label="Basket affinity relationship"><span>Coca-Cola</span><i><b>{opportunity.affinityValue}</b><small>affinity</small></i><span>Doritos</span></div>
            ) : (
              <div className="retailer-opportunity-metric"><strong>{opportunity.metricValue}</strong><span>{opportunity.metricLabel}</span></div>
            )}
            <p>{opportunity.fitBaskets ? `${integer.format(opportunity.fitBaskets)} high-fit baskets without both products.` : opportunity.whyReasons?.[0] || opportunity.reason}</p>
            <button className="scan-button scan-button-light" onClick={() => onNavigate('opportunities')} type="button">View opportunity <ScanIcon name="chevron" size={15} /></button>
          </Card>
        ) : <EmptyState compact title="No opportunity yet">SCAN will surface one when store evidence is sufficient.</EmptyState>}
        {action ? (
          <Card className="retailer-priority-action">
            <SectionHeader action={<Badge tone="warning">Priority action</Badge>} title={action.title.split(' may ')[0].split(' is ')[0]} />
            <h3>{action.recommendation}</h3>
            <div><strong>{action.metricValue}</strong>{action.change ? <Badge tone="red">{action.change}</Badge> : null}<span>{action.metricLabel}</span></div>
            <button className="scan-button scan-button-light" onClick={() => onNavigate('actions')} type="button">Review action <ScanIcon name="chevron" size={15} /></button>
          </Card>
        ) : <EmptyState compact title="No priority action">No action requires review right now.</EmptyState>}
      </div>

      <div className="retailer-commerce-grid retailer-ops-performance-row">
        <Card className="retailer-sales-movement-card">
          <SectionHeader action={<div className="retailer-chart-legend"><span><i className="is-sales" />Sales</span><span><i />Baseline</span></div>} description="Today against the recent operating baseline" title="Sales movement" />
          <HomeSalesMovement data={data} key={motionTick} />
        </Card>
        <Card className="retailer-top-products-card">
          <SectionHeader action={<button className="scan-text-link" onClick={() => onNavigate('insights')} type="button">View all</button>} title="Top products" />
          <ol>{topProducts.map((product, index) => <li key={product.name}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{product.name}</strong><small>{product.category}</small></div><b>{integer.format(product.quantity)}<small> units</small></b></li>)}</ol>
        </Card>
      </div>
    </div>
  )
}

const OPPORTUNITY_TYPE_LABELS = { CROSS_SELL: 'Cross-sell', BEVERAGE_ATTACHMENT: 'Beverage attachment', PRODUCT_TREND: 'Product performance', TIME_PATTERN: 'Time pattern' }

function OpportunityVisual({ opportunity }) {
  const metrics = opportunity.metrics
  if (opportunity.type === 'CROSS_SELL') {
    const max = Math.max(metrics.productABaskets, metrics.productBBaskets, 1)
    return <div className="retailer-opportunity-bars" role="img" aria-label={`${opportunity.subjects[0]} in ${metrics.productABaskets} baskets, ${opportunity.subjects[1]} in ${metrics.productBBaskets}, together in ${metrics.jointBaskets}`}>
      {[['Product A', metrics.productABaskets], ['Product B', metrics.productBBaskets], ['Together', metrics.jointBaskets]].map(([label, value]) => <div key={label}><span>{label}</span><i><b style={{ width: `${Math.max(4, value / max * 100)}%` }} /></i><strong>{integer.format(value)}</strong></div>)}
    </div>
  }
  if (opportunity.type === 'PRODUCT_TREND') return <div className="retailer-opportunity-compare" role="img" aria-label={`Prior ${metrics.priorBasketPercentage} percent, current ${metrics.currentBasketPercentage} percent`}><div><i style={{ height: `${Math.max(8, metrics.priorBasketPercentage)}%` }} /><span>Prior 14 days</span><strong>{metrics.priorBasketPercentage}%</strong></div><div><i className="is-current" style={{ height: `${Math.max(8, metrics.currentBasketPercentage)}%` }} /><span>Recent 14 days</span><strong>{metrics.currentBasketPercentage}%</strong></div></div>
  const value = opportunity.type === 'BEVERAGE_ATTACHMENT' ? metrics.attachmentPercentage : metrics.peakSharePercentage
  const comparison = opportunity.type === 'BEVERAGE_ATTACHMENT' ? metrics.storeBeveragePercentage : 100 - value
  return <div className="retailer-opportunity-share" role="img" aria-label={`${opportunity.primaryMetricLabel}: ${value} percent`}><div><i style={{ width: `${value}%` }} /></div><strong>{value}%</strong><span>{opportunity.type === 'BEVERAGE_ATTACHMENT' ? `Store beverage rate: ${comparison}%` : `${comparison}% in other dayparts`}</span></div>
}

function TrialPanel({ opportunity }) {
  const trial = opportunity.trial
  if (!trial) return null
  return <section className="retailer-trial-panel"><header><div><span>Measurement plan</span><h3>{humanize(trial.status)} trial</h3></div><Badge tone={trial.status === 'COMPLETED' ? 'success' : 'warning'}>{humanize(trial.status)}</Badge></header><dl><div><dt>Baseline</dt><dd>{trial.baselineValue}%</dd><small>{trial.baselineFrom} – {trial.baselineTo}</small></div><div><dt>Trial period</dt><dd>{trial.currentValue == null ? 'Pending' : `${trial.currentValue}%`}</dd><small>{trial.startDate} – {trial.endDate}</small></div></dl><p>{trial.measurementNote}</p></section>
}

function OpportunityDetails({ opportunity, onStartTrial, starting }) {
  const [whyOpen, setWhyOpen] = useState(false)
  const [planning, setPlanning] = useState(false)
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [duration, setDuration] = useState(opportunity.recommendedAction.durationDays)
  return <Card className="retailer-opportunity-detail">
    <header className="retailer-opportunity-detail-header"><div><div><Badge tone={opportunity.priority === 'HIGH' ? 'red' : 'neutral'}>{humanize(opportunity.priority)} priority</Badge><StatusBadge tone={opportunity.status === 'ACTIVE' ? 'warning' : opportunity.status === 'COMPLETED' ? 'success' : 'neutral'}>{humanize(opportunity.status)}</StatusBadge></div><span>{OPPORTUNITY_TYPE_LABELS[opportunity.type]} · {opportunity.storeId}</span><h2>{opportunity.title}</h2><p>{opportunity.description}</p></div><div><strong>{opportunity.primaryMetricValue}</strong><span>{opportunity.primaryMetricLabel}</span></div></header>
    <OpportunityVisual opportunity={opportunity} />
    <section className="retailer-opportunity-evidence"><h3>Observed pattern</h3><p>{opportunity.evidence.observation}</p><div><span>{integer.format(opportunity.evidence.receiptCount)} receipts</span><span>{opportunity.evidence.dateFrom} – {opportunity.evidence.dateTo}</span><span>{opportunity.evidence.dataCompletenessPercentage}% mapped</span></div></section>
    <section className="retailer-opportunity-recommendation"><span>Recommended action</span><h3>{opportunity.recommendedAction.title}</h3><p>{opportunity.recommendedAction.description}</p></section>
    <TrialPanel opportunity={opportunity} />
    {whyOpen ? <section className="retailer-why-panel" aria-label="Why this opportunity"><article><span>What SCAN observed</span><p>{opportunity.evidence.observation}</p></article><article><span>Why it matters</span><p>{opportunity.evidence.whyItMatters}</p></article><article><span>What SCAN recommends</span><p>{opportunity.recommendedAction.description}</p></article><article><span>How reliable is this?</span><p>{integer.format(opportunity.evidence.supportingBasketCount)} supporting baskets from {integer.format(opportunity.evidence.receiptCount)} receipts; {opportunity.evidence.dataCompletenessPercentage}% product mapping coverage.</p>{opportunity.evidence.limitations ? <small>{opportunity.evidence.limitations}</small> : null}</article></section> : null}
    {planning && !opportunity.trial ? <form className="retailer-trial-form" onSubmit={(event) => { event.preventDefault(); onStartTrial(opportunity.id, startDate, Number(duration)) }}><label>Start date<input min={new Date().toISOString().slice(0, 10)} onChange={(event) => setStartDate(event.target.value)} required type="date" value={startDate} /></label><label>Duration<select onChange={(event) => setDuration(event.target.value)} value={duration}><option value="7">7 days</option><option value="14">14 days</option><option value="28">28 days</option></select></label><button className="scan-button scan-button-primary" disabled={starting} type="submit">{starting ? 'Starting trial…' : 'Confirm trial'}</button></form> : null}
    <footer><button className="scan-button scan-button-light" onClick={() => setWhyOpen((value) => !value)} type="button">{whyOpen ? 'Hide explanation' : 'Why this?'}</button>{!opportunity.trial && ['CROSS_SELL', 'BEVERAGE_ATTACHMENT'].includes(opportunity.type) ? <button className="scan-button scan-button-primary" onClick={() => setPlanning((value) => !value)} type="button">{opportunity.recommendedAction.title}</button> : null}</footer>
  </Card>
}

function Offers({ analysis, loading, notice, onStartTrial, startingId }) {
  const [selectedId, setSelectedId] = useState(null)
  const opportunities = analysis?.opportunities || []
  const selected = opportunities.find((item) => item.id === selectedId) || opportunities[0]
  if (loading && !analysis) return <LoadingState title="Analyzing basket evidence…" description="Reconstructing receipts and validating opportunity thresholds." />
  const summary = analysis?.summary
  return <div className="scan-page-stack retailer-opportunities-workspace">
    <PageIntro description="Data-backed recommendations to grow your store." eyebrow="Growth intelligence" title="Growth Opportunities" />
    {notice ? <div className="scan-inline-notice retailer-analysis-notice" role="status"><ScanIcon name="check" size={16} /><span>{notice}</span></div> : null}
    {summary?.datasetKind !== 'OPERATIONAL' ? <div className="scan-inline-notice retailer-dataset-notice"><strong>{humanize(summary.datasetKind)} dataset</strong><span>These insights are isolated from operational retailer data.</span></div> : null}
    <section className="retailer-opportunity-summary" aria-label="Opportunity analysis summary"><div><span>Last analysis</span><strong>{formatDateTime(summary?.analyzedAt)}</strong></div><div><span>Available</span><strong>{summary?.availableCount || 0}</strong></div><div><span>Active trials</span><strong>{summary?.activeTrialCount || 0}</strong></div><div><span>Completed</span><strong>{summary?.completedTrialCount || 0}</strong></div><div><span>Data coverage</span><strong>{summary?.coverageStatus === 'READY' ? `${summary.mappingCoveragePercentage}%` : humanize(summary?.coverageStatus)}</strong><small>{integer.format(summary?.receiptCount || 0)} receipts</small></div></section>
    {!opportunities.length ? <EmptyState title={summary?.coverageStatus === 'INSUFFICIENT_DATA' ? 'More basket data is needed' : 'No opportunity clears the evidence threshold'}>{summary?.coverageStatus === 'INSUFFICIENT_DATA' ? `SCAN needs at least 30 complete baskets; ${integer.format(summary?.receiptCount || 0)} are currently available.` : 'SCAN will show a recommendation when a relationship is sufficiently supported and actionable.'}</EmptyState> : <div className="retailer-opportunity-master-detail"><section className="retailer-opportunity-list" aria-label="Detected opportunities">{opportunities.map((opportunity) => <button aria-pressed={selected?.id === opportunity.id} className={selected?.id === opportunity.id ? 'is-selected' : ''} key={opportunity.id} onClick={() => setSelectedId(opportunity.id)} type="button"><div><span>{OPPORTUNITY_TYPE_LABELS[opportunity.type]}</span><StatusBadge tone={opportunity.status === 'ACTIVE' ? 'warning' : opportunity.status === 'COMPLETED' ? 'success' : 'neutral'}>{humanize(opportunity.status)}</StatusBadge></div><strong>{opportunity.title}</strong><p>{opportunity.description}</p><footer><b>{opportunity.primaryMetricValue}</b><span>{opportunity.primaryMetricLabel}</span><i className={`is-${opportunity.priority.toLowerCase()}`}>{humanize(opportunity.priority)}</i></footer></button>)}</section>{selected ? <OpportunityDetails key={selected.id} onStartTrial={onStartTrial} opportunity={selected} starting={startingId === selected.id} /> : null}</div>}
  </div>
}

function ActionFeedCard({ action, motionPhase, onAccept, onComplete, onDismiss, onOpenIntelligence }) {
  const [expanded, setExpanded] = useState(false)
  const meta = ACTION_TYPE_META[action.type] || { label: humanize(action.type), tone: 'neutral' }
  const highPriority = action.priority === 'HIGH' || action.type === 'STOCK_RISK'
  const activeAction = ['OPEN', 'IN_PROGRESS'].includes(action.status || 'OPEN')
  const stateBadge = action.status === 'COMPLETED'
    ? <Badge tone="success">Completed</Badge>
    : action.status === 'IN_PROGRESS'
      ? <Badge tone="warning">In progress</Badge>
      : action.status === 'DISMISSED'
        ? <Badge tone="neutral">Dismissed</Badge>
        : highPriority ? <Badge tone="red">High priority</Badge> : <Badge tone="neutral">Review</Badge>
  const primaryAction = action.primaryAction || (action.type === 'STOCK_RISK' ? 'Add to order list' : 'Create opportunity')
  const secondaryAction = action.secondaryAction || (action.type === 'STOCK_RISK' ? 'Mark checked' : 'Dismiss')
  return (
    <Card as="article" className={`retailer-workflow-action ${highPriority ? 'is-high-priority' : ''} ${motionPhase ? `is-${motionPhase}` : ''}`}>
      <header>
        <div><Badge tone={meta.tone}>{meta.label}</Badge><span>{action.scope === 'CCI' ? 'CCI portfolio' : 'Your store'}</span></div>
        {stateBadge}
      </header>
      <div className="retailer-workflow-action-body">
        <div className="retailer-workflow-action-copy">
          <h2>{action.displayTitle || action.title}</h2>
          <div className="retailer-workflow-metric">
            <strong>{action.metricValue}</strong>
            {action.change ? <Badge tone={action.change.startsWith('+') ? 'red' : 'neutral'}>{action.change}</Badge> : null}
            <span>{action.comparison || action.metricLabel}</span>
          </div>
          <p>{action.evidence || action.explanation}</p>
        </div>
        <MiniChart label={`${action.displayTitle || action.title} trend`} values={action.trend || [12, 14, 13, 16, 17, 19, 21]} />
      </div>
      <div className="retailer-workflow-recommendation"><span>SCAN recommends</span><p>{action.recommendation}</p></div>
      {expanded ? <div className="retailer-workflow-why"><strong>Why this action?</strong><p>{action.why || action.explanation}</p></div> : null}
      {motionPhase === 'completing' ? <div className="retailer-action-confirmation" role="status"><ScanIcon name="check" size={15} /> Action completed. Moving to Completed…</div> : null}
      <footer>
        {activeAction ? <button className={`scan-button scan-button-primary ${['accepted', 'completing'].includes(motionPhase) ? 'is-accepted' : ''}`} disabled={motionPhase === 'accepted' || motionPhase === 'completing'} onClick={() => onAccept(action.id)} type="button">{motionPhase === 'accepted' || motionPhase === 'completing' ? <><ScanIcon name="check" size={15} /> Accepted</> : primaryAction}</button> : null}
        {activeAction ? <button className="scan-button scan-button-light" disabled={motionPhase === 'completing'} onClick={() => secondaryAction === 'Dismiss' ? onDismiss(action.id) : onComplete(action.id)} type="button">{motionPhase === 'completing' ? <><ScanIcon name="check" size={15} /> Completed</> : secondaryAction}</button> : null}
        <button className="scan-text-link" onClick={() => setExpanded((value) => !value)} type="button">{expanded ? 'Hide reason' : 'Why this?'}</button>
        <button aria-label={`Ask SCAN about ${action.displayTitle || action.title}`} className="scan-text-link retailer-action-intelligence-link" onClick={(event) => onOpenIntelligence({ type: 'action', label: action.displayTitle || action.title }, event.currentTarget)} type="button"><ScanIcon name="ask" size={14} />Ask SCAN</button>
      </footer>
    </Card>
  )
}

const ACTION_FILTERS = [
  { id: 'OPEN', label: 'Open' },
  { id: 'IN_PROGRESS', label: 'In progress' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'DISMISSED', label: 'Dismissed' },
]

function Actions({ data, actions, onNavigate, onOpenIntelligence, workspace }) {
  const [filter, setFilter] = useState('OPEN')
  const [workflowStates, setWorkflowStates] = useState({})
  const transitionTimers = useRef([])
  useEffect(() => () => transitionTimers.current.forEach((timer) => window.clearTimeout(timer)), [])
  const attention = attentionItems(data)
  const resolvedActions = actions.map((action) => ({ ...action, status: workflowStates[action.id]?.status || action.status }))
  const baseCounts = workspace?.counts || { open: actions.length, inProgress: 0, completed: 0, dismissed: 0, highPriority: actions.filter((action) => action.type === 'STOCK_RISK').length }
  const completedHere = actions.filter((action) => workflowStates[action.id]?.status === 'COMPLETED' && (action.status || 'OPEN') !== 'COMPLETED').length
  const dismissedHere = actions.filter((action) => workflowStates[action.id]?.status === 'DISMISSED' && (action.status || 'OPEN') !== 'DISMISSED').length
  const counts = { ...baseCounts, open: Math.max(0, baseCounts.open - completedHere - dismissedHere), completed: baseCounts.completed + completedHere, dismissed: baseCounts.dismissed + dismissedHere }
  const countFor = (id) => counts[id === 'IN_PROGRESS' ? 'inProgress' : id.toLowerCase()] || 0
  const visibleActions = resolvedActions.filter((action) => (action.status || 'OPEN') === filter)
  const recentResult = workspace?.recentResult
  const activity = workspace?.activity || []
  const updateAction = (id, next) => setWorkflowStates((current) => ({ ...current, [id]: { ...current[id], ...next } }))
  const completeAction = (id) => {
    updateAction(id, { phase: 'completing' })
    transitionTimers.current.push(window.setTimeout(() => {
      updateAction(id, { phase: 'completed', status: 'COMPLETED' })
      setFilter('COMPLETED')
    }, 650))
  }
  const dismissAction = (id) => {
    updateAction(id, { phase: 'dismissed' })
    transitionTimers.current.push(window.setTimeout(() => updateAction(id, { status: 'DISMISSED' }), 420))
  }
  return (
    <div className="scan-page-stack retailer-actions-workflow">
      <PageIntro description="What happened, why it matters, and what you can do." eyebrow="Operating workflow" title="Actions" />
      <div className="retailer-action-filters" role="tablist" aria-label="Action status">
        {ACTION_FILTERS.map((item) => <button aria-selected={filter === item.id} className={filter === item.id ? 'is-active' : ''} key={item.id} onClick={() => setFilter(item.id)} role="tab" type="button">{item.label} <span>{countFor(item.id)}</span></button>)}
      </div>
      {attention.length ? <AttentionBanner items={attention} onNavigate={onNavigate} /> : null}
      <div className="retailer-actions-layout">
        <section className="retailer-action-feed" aria-label={`${humanize(filter)} action feed`}>
          <SectionHeader description="Prioritized from the latest store signals" title={filter === 'OPEN' ? 'Action feed' : humanize(filter)} />
          {visibleActions.length ? visibleActions.map((action) => <ActionFeedCard action={action} key={action.id} motionPhase={workflowStates[action.id]?.phase} onAccept={(id) => updateAction(id, { phase: 'accepted' })} onComplete={completeAction} onDismiss={dismissAction} onOpenIntelligence={onOpenIntelligence} />) : <EmptyState compact title={`No ${humanize(filter).toLowerCase()} actions`}>Nothing is in this workflow state right now.</EmptyState>}
        </section>
        <aside className="retailer-action-rail">
          <Card className="retailer-action-summary-card">
            <SectionHeader title="Action summary" />
            <dl><div><dt>Open</dt><dd>{counts.open}</dd></div><div><dt>High priority</dt><dd>{counts.highPriority}</dd></div><div><dt>Completed this month</dt><dd>{counts.completed}</dd></div></dl>
          </Card>
          <Card className="retailer-action-result-card">
            <SectionHeader action={<Badge tone="success">Observed</Badge>} title="Recent result" />
            {recentResult ? <><h3>{recentResult.title}</h3><div><span>{recentResult.before}</span><ScanIcon name="chevron" size={16} /><strong>{recentResult.after}</strong></div><b>{recentResult.change}</b><p>{recentResult.detail}</p></> : <EmptyState compact title="No measured result yet">Completed actions will be measured here.</EmptyState>}
          </Card>
          <Card className="retailer-action-activity-card">
            <SectionHeader title="Action activity" />
            {activity.length ? <ol>{activity.map((item) => <li key={`${item.date}-${item.title}`}><time>{item.date}</time><i /><strong>{item.title}</strong></li>)}</ol> : <p>No action activity yet.</p>}
          </Card>
        </aside>
      </div>
    </div>
  )
}

function Partner({ partnerStatus }) {
  const nextPreview = partnerStatus.nextLevel ? NEXT_LEVEL_PREVIEW[partnerStatus.nextLevel] : null
  return (
    <div className="scan-page-stack">
      <PageIntro description="Your Partner level grows as your store stays connected and consistently shares reliable sales data." eyebrow="Partner" title="SCAN Partner" />
      <section className="scan-panel retailer-partner-card">
        <div className="retailer-partner-level">
          <strong className={`is-${partnerStatus.level.toLowerCase()}`}>{humanize(partnerStatus.level)}</strong>
          <span>{partnerStatus.nextLevel ? `${partnerStatus.progressPercentage}% to ${humanize(partnerStatus.nextLevel)}` : 'Highest tier reached'}</span>
        </div>
        <p className="retailer-partner-headline">This store has an active commercial relationship with SCAN and CCI.</p>
        {partnerStatus.nextLevel ? <div className="retailer-partner-progress" aria-hidden="true"><i style={{ width: `${partnerStatus.progressPercentage}%` }} /></div> : null}
        {partnerStatus.daysUntilNextLevel != null ? (
          <p className="retailer-partner-eta">{partnerStatus.daysUntilNextLevel} days until {humanize(partnerStatus.nextLevel)} eligibility, if the connection remains active and data quality stays reliable.</p>
        ) : null}

        <dl className="retailer-partner-metrics">
          <div><dt>Connected for</dt><dd>{integer.format(partnerStatus.daysConnected)} {partnerStatus.daysConnected === 1 ? 'day' : 'days'}</dd></div>
          <div><dt>Data reliability</dt><dd>{decimal.format(partnerStatus.dataReliabilityPercent)}%</dd></div>
          <div><dt>Transaction sync</dt><dd>{partnerStatus.transactionSyncActive ? 'Active' : 'Inactive'}</dd></div>
          <div><dt>Data completeness</dt><dd>{partnerStatus.dataCompletenessLabel}</dd></div>
          <div><dt>Next level</dt><dd>{partnerStatus.nextLevel ? humanize(partnerStatus.nextLevel) : 'Highest tier reached'}</dd></div>
        </dl>

        <ul className="retailer-partner-requirements">
          {partnerStatus.requirements.map((requirement) => (
            <li className={requirement.met ? 'is-met' : ''} key={requirement.label}>
              {requirement.met ? <ScanIcon name="check" size={16} /> : <span className="retailer-requirement-dot" aria-hidden="true" />}
              {requirement.label}
            </li>
          ))}
        </ul>
      </section>

      <section className="scan-panel retailer-partner-benefits">
        <header className="scan-panel-header"><h3>{humanize(partnerStatus.level)} benefits</h3></header>
        <ul>{(PARTNER_BENEFITS[partnerStatus.level] || []).map((benefit) => <li key={benefit}><ScanIcon name="check" size={15} />{benefit}</li>)}</ul>
      </section>

      {nextPreview ? (
        <section className="scan-panel retailer-partner-preview">
          <header className="scan-panel-header"><h3>{humanize(partnerStatus.nextLevel)} unlock preview</h3><StatusBadge tone="neutral">Eligible campaigns only</StatusBadge></header>
          <ul>{nextPreview.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
        </section>
      ) : null}

      <section className="scan-panel retailer-benefits-card">
        <header className="scan-panel-header"><h3>Benefit history</h3></header>
        {partnerStatus.benefitHistory.length ? (
          <ul className="retailer-benefit-history">
            {partnerStatus.benefitHistory.map((entry) => (
              <li key={entry.title + entry.activatedAt}>
                <time dateTime={entry.activatedAt}>{formatDay(entry.activatedAt)}</time>
                <div><strong>{entry.title}</strong><small>{entry.benefitSummary}</small></div>
              </li>
            ))}
          </ul>
        ) : <EmptyState compact title="No benefit history yet">Activate an offer to start your SCAN Partner benefit history.</EmptyState>}
      </section>
    </div>
  )
}

function ProductList({ data, onOpenIntelligence, products, search }) {
  if (!products.length) return search
    ? <EmptyState compact title="No matching products">Try another product name.</EmptyState>
    : <EmptyState compact title="No product sales">No products were sold in this period.</EmptyState>
  return (
    <ol className="retailer-product-list">
      {products.map((product, index) => (
        <li key={`${product.name}-${product.category}`}>
          <span className="retailer-product-rank">{String(index + 1).padStart(2, '0')}</span>
          <div><strong title={product.name}>{product.name}</strong><small>{product.category}</small><button aria-label={`Ask SCAN about ${product.name}`} className="retailer-product-intelligence-link" onClick={(event) => onOpenIntelligence({ type: 'product', label: product.name }, event.currentTarget)} type="button"><ScanIcon name="ask" size={13} />Ask SCAN</button></div>
          <dl><div><dt>Sales</dt><dd>{formatMoney(product.revenue, data.currency)}</dd></div><div><dt>Transactions</dt><dd>{integer.format(product.basketCount)}</dd></div><div><dt>Units</dt><dd>{decimal.format(product.quantity)}</dd></div></dl>
        </li>
      ))}
    </ol>
  )
}

function Insights({ data, loading, onOpenIntelligence, onPeriodChange, period }) {
  const [search, setSearch] = useState('')
  const products = data.topProducts.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(search.trim().toLowerCase()))
  const shortPeriod = period === 'LAST_7_DAYS'
  return (
    <div className="scan-page-stack">
      <PageIntro aside={<PeriodControl loading={loading} onChange={onPeriodChange} value={period} />} description="Understand what changed and why." eyebrow="Insights" title="Store insights" />
      <div className="retailer-commerce-grid retailer-insight-metrics">
        <MetricCard chartValues={data.dailySales.slice(-10).map((day) => day.totalSales)} label="Sales" note={humanize(data.period)} value={formatMoney(data.totalSales, data.currency)} />
        <MetricCard chartValues={data.dailySales.slice(-10).map((day) => day.basketCount)} label="Transactions" note="Validated receipts" tone="dark" value={integer.format(data.totalBaskets)} />
        <MetricCard change="Healthy" changeTone="positive" label="Average basket" note="Sales per transaction" value={formatMoney(data.averageBasketValue, data.currency)} />
      </div>
      <div className="retailer-commerce-grid retailer-analytics-row">
        <ChartPanel description="Recorded daily sales" title="Sales movement"><SalesTrend data={data} /></ChartPanel>
        <Card className="retailer-daypart-card">
          <SectionHeader description="Share of transactions" title="Trading rhythm" />
          <div>{data.dayparts.map((item) => <BenchmarkIndicator benchmark={item.sharePercentage} key={item.segment} label={humanize(item.segment)} value={`${decimal.format(item.sharePercentage)}%`} />)}</div>
        </Card>
      </div>
      <section className="retailer-simple-section retailer-products-section">
        <header><div><h2>Best-selling products</h2><p>Top products by recorded sales</p></div>{data.topProducts.length > 6 ? <label className="retailer-product-search"><span className="sr-only">Search products</span><ScanIcon name="explore" size={18} /><input onChange={(event) => setSearch(event.target.value)} placeholder="Search products" type="search" value={search} /></label> : null}</header>
        <ProductList data={data} onOpenIntelligence={onOpenIntelligence} products={products} search={search.trim()} />
      </section>
      <div className="retailer-product-secondary">
        <section className="retailer-simple-section retailer-unavailable-section"><header><h2>Slow-moving products</h2><StatusBadge tone="neutral">See Actions</StatusBadge></header><p>Products selling more slowly than usual are now surfaced as Inventory actions, with the specific comparison behind each one.</p></section>
        <section className="retailer-simple-section retailer-stock-check"><header><div><h2>Potential stockouts</h2><p>Products worth checking on the shelf</p></div><StatusBadge tone="neutral">Inventory not connected</StatusBadge></header>
          {shortPeriod && data.topProducts.length ? <ul>{[...data.topProducts].sort((a, b) => b.quantity - a.quantity).slice(0, 3).map((product) => <li key={product.name}><div><strong>{product.name}</strong><small>{decimal.format(product.quantity)} units sold · {humanize(data.period)}</small></div><span>Check stock</span></li>)}</ul> : <p>Choose 7 days to see products with the most recorded unit sales. SCAN does not know current stock levels.</p>}
        </section>
      </div>
    </div>
  )
}

function Data({ data, onNavigate, presentation }) {
  const healthy = data.sync.state === 'COMPLETED' && !data.sync.errors.length
  const workspace = data.dataWorkspace || {}
  const [selectedFile, setSelectedFile] = useState(presentation ? { name: 'nargiz_13_oct.xlsx' } : null)
  const [importState, setImportState] = useState('idle')
  const [activeStep, setActiveStep] = useState(-1)
  const inputRef = useRef(null)
  const receipts = workspace.receipts ?? data.totalBaskets
  const recognition = workspace.productRecognition ?? data.mappedLinePercentage
  const mappedProducts = workspace.mappedProducts
  const health = workspace.health || (healthy ? 'Healthy' : 'Needs attention')
  const healthItems = workspace.healthItems || [
    { label: 'Duplicate receipts', value: 0, tone: 'positive' },
    { label: 'Missing barcodes', value: data.sync.unresolvedProducts, tone: data.sync.unresolvedProducts ? 'warning' : 'positive' },
    { label: 'Unknown products', value: data.sync.unresolvedProducts, tone: data.sync.unresolvedProducts ? 'warning' : 'positive' },
    { label: 'Invalid rows', value: data.sync.errors.length, tone: data.sync.errors.length ? 'red' : 'positive' },
  ]
  const recentImports = workspace.recentImports || [{ date: data.sync.completedAt, receipts: data.sync.importedReceipts, lines: data.sync.importedLines, mapped: data.mappedLinePercentage, status: data.sync.state }]
  const recognitionGroups = workspace.recognitionGroups || [
    { label: 'Recognized products', value: data.mappedLinePercentage, tone: 'red' },
    { label: 'Unrecognized', value: 100 - data.mappedLinePercentage, tone: 'neutral' },
  ]

  useEffect(() => {
    if (importState !== 'processing') return undefined
    if (activeStep >= DATA_IMPORT_STEPS.length - 1) {
      const completed = window.setTimeout(() => setImportState('complete'), 360)
      return () => window.clearTimeout(completed)
    }
    const nextStep = window.setTimeout(() => setActiveStep((current) => current + 1), 360)
    return () => window.clearTimeout(nextStep)
  }, [activeStep, importState])

  function chooseFile(file) {
    if (!file || !/\.(csv|xlsx?)$/i.test(file.name)) return
    setSelectedFile(file)
    setImportState('idle')
    setActiveStep(-1)
  }

  function startImport() {
    if (!selectedFile || !presentation) return
    setImportState('processing')
    setActiveStep(0)
  }

  return (
    <div className="scan-page-stack retailer-data-page">
      <PageIntro description="The transaction data powering this store’s intelligence." eyebrow="Data operations" title="Data" />
      <div className="retailer-data-kpis">
        <Card as="article" className="retailer-data-kpi"><header><span>Receipts</span><i><ScanIcon name="basket" size={16} /></i></header><strong>{integer.format(receipts)}</strong><div className="retailer-data-ticks" aria-hidden="true">{[42, 58, 51, 74, 68, 86, 92].map((height, index) => <span key={index} style={{ height: `${height}%` }} />)}</div><small>Validated transactions</small></Card>
        <Card as="article" className="retailer-data-kpi"><header><span>Product recognition</span><i><ScanIcon name="mapping" size={16} /></i></header><strong>{decimal.format(recognition)}%</strong><div className="retailer-data-meter" aria-hidden="true"><span style={{ width: `${recognition}%` }} /></div><small>Lines ready for analysis</small></Card>
        <Card as="article" className="retailer-data-kpi"><header><span>Mapped products</span><i><ScanIcon name="products" size={16} /></i></header><strong>{mappedProducts == null ? '—' : integer.format(mappedProducts)}</strong><div className="retailer-data-dotline" aria-hidden="true"><span /><span /><span /><span /><span /></div><small>Recognized catalog items</small></Card>
        <Card as="article" className="retailer-data-kpi is-health"><header><span>Data health</span><i><ScanIcon name="shield" size={16} /></i></header><strong>{health}</strong><div className="retailer-data-healthline"><span /><small>{healthy ? 'Ready for intelligence' : 'Review required'}</small></div></Card>
      </div>

      <div className="retailer-data-import-row">
        <Card className={`retailer-data-import is-${importState}`}>
          {importState === 'idle' ? <>
            <SectionHeader action={<Badge tone="neutral">CSV · XLSX</Badge>} description={presentation ? 'Add a checkout export without leaving the workspace' : 'Transaction files are validated in the secure import workspace'} title="Import POS data" />
            {presentation ? <>
              <input accept=".csv,.xls,.xlsx" className="sr-only" onChange={(event) => chooseFile(event.target.files?.[0])} ref={inputRef} type="file" />
              <button className="retailer-data-dropzone" onClick={() => inputRef.current?.click()} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); chooseFile(event.dataTransfer.files?.[0]) }} type="button">
                <i><ScanIcon name="upload" size={22} /></i><span><strong>Drop a POS export here</strong><small>CSV or XLSX · maximum 25 MB</small></span><b>Choose file</b>
              </button>
            </> : <a className="retailer-data-dropzone" href="/?portal=connection"><i><ScanIcon name="shield" size={22} /></i><span><strong>Open secure POS import</strong><small>Validate structure and totals before saving receipts</small></span><b>Continue</b></a>}
            <div className="retailer-data-recent-file"><span><ScanIcon name="file" size={17} /><span><small>Recent file</small><strong>{selectedFile?.name || data.sync.filename || 'No file selected'}</strong></span></span><Badge tone={selectedFile ? 'positive' : 'neutral'}>{selectedFile ? 'Ready' : 'Waiting'}</Badge></div>
            {presentation ? <button className="scan-button scan-button-dark retailer-data-upload-button" disabled={!selectedFile} onClick={startImport} type="button">Upload export <ScanIcon name="chevron" size={16} /></button> : <a className="scan-button scan-button-dark retailer-data-upload-button" href="/?portal=connection">Open secure import <ScanIcon name="chevron" size={16} /></a>}
          </> : null}
          {importState === 'processing' ? <div className="retailer-data-processing" aria-live="polite">
            <header><div><span>Processing {selectedFile?.name}</span><h2>Turning receipts into store intelligence</h2></div><i aria-hidden="true" /></header>
            <ol>{DATA_IMPORT_STEPS.map((step, index) => { const state = index < activeStep ? 'complete' : index === activeStep ? 'active' : 'pending'; return <li className={`is-${state}`} key={step}><span>{state === 'complete' ? <ScanIcon name="check" size={14} /> : state === 'active' ? <i /> : '○'}</span><strong>{step}</strong></li> })}</ol>
          </div> : null}
          {importState === 'complete' ? <div className="retailer-data-complete" aria-live="polite">
            <header><i><ScanIcon name="check" size={20} /></i><div><span>Import complete</span><h2>{selectedFile?.name}</h2></div></header>
            <dl><div><dd>946</dd><dt>Receipts</dt></div><div><dd>1,832</dd><dt>Product lines</dt></div><div><dd>97.4%</dd><dt>Mapped</dt></div></dl>
            <div className="retailer-data-results"><span><b>3</b> insights updated</span><span><b>1</b> new action created</span></div>
            <button className="scan-button scan-button-dark" onClick={() => onNavigate('actions')} type="button">View new action <ScanIcon name="chevron" size={16} /></button>
          </div> : null}
        </Card>
        <Card className="retailer-data-health-card">
          <SectionHeader action={<Badge tone={healthy ? 'positive' : 'warning'}>{health}</Badge>} description="Checks from the latest validated export" title="Data Health" />
          <ul>{healthItems.map((item) => <li key={item.label}><span><i className={`is-${item.tone}`} />{item.label}</span><strong>{integer.format(item.value)}</strong></li>)}</ul>
          <p><ScanIcon name="shield" size={16} />Only validated receipts and recognized products power recommendations.</p>
        </Card>
      </div>

      <Card className="retailer-data-imports-card">
        <SectionHeader action={<button className="scan-text-link" type="button">View all</button>} description="Validated files added to this store" title="Recent Imports" />
        <div className="retailer-data-table-wrap"><table><thead><tr><th>Date</th><th>Receipts</th><th>Lines</th><th>Mapped</th><th>Status</th></tr></thead><tbody>{recentImports.map((item, index) => <tr key={`${item.date}-${index}`}><td data-label="Date">{formatDateTime(item.date)}</td><td data-label="Receipts">{integer.format(item.receipts)}</td><td data-label="Lines">{integer.format(item.lines)}</td><td data-label="Mapped">{decimal.format(item.mapped)}%</td><td data-label="Status"><Badge tone={item.status === 'COMPLETED' ? 'positive' : 'warning'}>{humanize(item.status)}</Badge></td></tr>)}</tbody></table></div>
      </Card>

      <div className="retailer-data-recognition-row">
        <Card className="retailer-data-recognition-card"><SectionHeader description="Recognition across imported product lines" title="Product Recognition" /><div>{recognitionGroups.map((item) => <div className="retailer-data-recognition-bar" key={item.label}><header><span>{item.label}</span><strong>{decimal.format(item.value)}%</strong></header><div><span className={`is-${item.tone}`} style={{ width: `${item.value}%` }} /></div></div>)}</div></Card>
        <Card className="retailer-data-unmapped-card"><SectionHeader action={<Badge tone="warning">{workspace.unmappedProducts?.length || data.sync.unresolvedProducts}</Badge>} description="Source items that still need a catalog match" title="Unmapped products" />{workspace.unmappedProducts?.length ? <ul>{workspace.unmappedProducts.map((product) => <li key={product.code}><span><strong>{product.name}</strong><small>{product.code}</small></span><button aria-label={`Review ${product.name}`} type="button"><ScanIcon name="chevron" size={15} /></button></li>)}</ul> : <EmptyState compact title="Everything is mapped">No unresolved products in the latest export.</EmptyState>}</Card>
      </div>
    </div>
  )
}

function Page({ activePage, analysisNotice, data, engagement, engagementLoading, loading, motionState, motionTick, onNavigate, onOpenIntelligence, onPeriodChange, opportunities, opportunitiesLoading, onStartTrial, period, presentation, startingTrialId }) {
  if (loading && data.period !== period) return <LoadingState title="Updating this view…" description="SCAN is reading the selected sales period." />
  if (activePage === 'insights') return <Insights data={data} loading={loading} onOpenIntelligence={onOpenIntelligence} onPeriodChange={onPeriodChange} period={period} />
  if (activePage === 'data') return <Data data={data} onNavigate={onNavigate} presentation={presentation} />
  if (engagementLoading || !engagement) return <LoadingState title="Loading your SCAN benefits…" description="Preparing offers, actions, and partner status." />
  if (activePage === 'opportunities') return <Offers analysis={opportunities} loading={opportunitiesLoading} notice={analysisNotice} onStartTrial={onStartTrial} startingId={startingTrialId} />
  if (activePage === 'actions') return <Actions actions={engagement.actions} data={data} onNavigate={onNavigate} onOpenIntelligence={onOpenIntelligence} workspace={engagement.actionWorkspace} />
  if (activePage === 'partner') return <Partner partnerStatus={engagement.partnerStatus} />
  return <Home data={data} engagement={engagement} motionState={motionState} motionTick={motionTick} onNavigate={onNavigate} onOpenIntelligence={onOpenIntelligence} />
}

function intelligenceContextForPage(activePage, data, engagement, opportunities) {
  if (activePage === 'actions' && engagement?.actions?.length) {
    const action = engagement.actions.find((item) => (item.status || 'OPEN') === 'OPEN') || engagement.actions[0]
    return { type: 'action', label: action.displayTitle || action.title }
  }
  if (activePage === 'opportunities' && opportunities?.opportunities?.length) {
    return { type: 'opportunity', label: opportunities.opportunities[0].title }
  }
  if (activePage === 'insights' && data.topProducts?.length) return { type: 'product', label: data.topProducts[0].name }
  return null
}

export default function RetailerDashboard() {
  const [credentials, setCredentials] = useState(null)
  const [period, setPeriod] = useState('LAST_30_DAYS')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [presentationLoading, setPresentationLoading] = useState(false)
  const [engagement, setEngagement] = useState(null)
  const [engagementLoading, setEngagementLoading] = useState(false)
  const [engagementError, setEngagementError] = useState('')
  const [opportunities, setOpportunities] = useState(null)
  const [opportunitiesLoading, setOpportunitiesLoading] = useState(false)
  const [startingTrialId, setStartingTrialId] = useState(null)
  const [analysisNotice, setAnalysisNotice] = useState('')
  const [activePage, setActivePage] = useState('home')
  const [intelligenceOpen, setIntelligenceOpen] = useState(false)
  const [intelligenceContext, setIntelligenceContext] = useState(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [motionState, setMotionState] = useState('idle')
  const [motionTick, setMotionTick] = useState(0)
  const layoutRef = useRef(null)
  const intelligenceReturnFocus = useRef(null)
  const refreshRequested = useRef(false)
  const refreshTimer = useRef(null)
  const opportunitySnapshot = useRef(null)

  const finishRefreshMotion = useCallback(() => {
    if (!refreshRequested.current) return
    refreshRequested.current = false
    setMotionTick((value) => value + 1)
    setMotionState('updated')
    window.clearTimeout(refreshTimer.current)
    refreshTimer.current = window.setTimeout(() => setMotionState('idle'), 2200)
  }, [])
  const finishPresentationLoading = useCallback(() => setPresentationLoading(false), [])

  useEffect(() => () => window.clearTimeout(refreshTimer.current), [])

  usePretextLayout(layoutRef, `${activePage}:${period}:${data?.generatedAt || 'login'}:${engagement ? 'ready' : 'loading'}`)

  useEffect(() => {
    if (!credentials) return undefined
    if (credentials.presentation) return undefined
    const controller = new AbortController()
    fetchRetailerOverview({ ...credentials, period, signal: controller.signal })
      .then((overview) => { if (!controller.signal.aborted) { setData(overview); finishRefreshMotion() } })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError?.name !== 'AbortError') {
          setError(requestError?.message || 'Unable to load retailer analytics.')
          if (requestError instanceof ScanApiError && [401, 403].includes(requestError.status)) setData(null)
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [credentials, finishRefreshMotion, period, refreshKey])

  useEffect(() => {
    if (!credentials) return undefined
    if (credentials.presentation) return undefined
    const controller = new AbortController()
    Promise.all([
      fetchRetailerOffers({ ...credentials, signal: controller.signal }),
      fetchRetailerActions({ ...credentials, signal: controller.signal }),
      fetchRetailerPartnerStatus({ ...credentials, signal: controller.signal }),
    ])
      .then(([offers, actions, partnerStatus]) => {
        if (!controller.signal.aborted) setEngagement({ offers, actions, partnerStatus })
      })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError?.name !== 'AbortError') {
          setEngagementError(requestError?.message || 'Unable to load SCAN offers and benefits.')
        }
      })
      .finally(() => { if (!controller.signal.aborted) setEngagementLoading(false) })
    return () => controller.abort()
  }, [credentials, refreshKey])

  useEffect(() => {
    if (!credentials || credentials.presentation) return undefined
    const controller = new AbortController()
    fetchRetailerOpportunities({ ...credentials, signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return
        const next = new Map(result.opportunities.map((item) => [item.id, JSON.stringify(item.metrics)]))
        if (opportunitySnapshot.current) {
          const added = [...next.keys()].filter((id) => !opportunitySnapshot.current.has(id)).length
          const changed = [...next.entries()].filter(([id, metrics]) => opportunitySnapshot.current.has(id) && opportunitySnapshot.current.get(id) !== metrics).length
          setAnalysisNotice(added ? `Analysis updated. ${added} new ${added === 1 ? 'opportunity' : 'opportunities'} detected.` : changed ? `Analysis updated. ${changed} ${changed === 1 ? 'opportunity changed' : 'opportunities changed'}.` : '')
        }
        opportunitySnapshot.current = next
        setOpportunities(result)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError?.name !== 'AbortError') setEngagementError(requestError?.message || 'Unable to analyze growth opportunities.')
      })
      .finally(() => { if (!controller.signal.aborted) setOpportunitiesLoading(false) })
    return () => controller.abort()
  }, [credentials, refreshKey])

  async function startTrial(opportunityId, startDate, durationDays) {
    setStartingTrialId(opportunityId)
    setEngagementError('')
    if (credentials.presentation) {
      const end = new Date(`${startDate}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + durationDays - 1)
      const baselineEnd = new Date(`${startDate}T00:00:00Z`); baselineEnd.setUTCDate(baselineEnd.getUTCDate() - 1)
      const baselineStart = new Date(baselineEnd); baselineStart.setUTCDate(baselineStart.getUTCDate() - durationDays + 1)
      setOpportunities((current) => ({ ...current, summary: { ...current.summary, availableCount: current.summary.availableCount - 1, activeTrialCount: current.summary.activeTrialCount + 1 }, opportunities: current.opportunities.map((item) => item.id === opportunityId ? { ...item, status: 'ACTIVE', trial: { id: `demo-${item.id}`, status: 'ACTIVE', startDate, endDate: end.toISOString().slice(0, 10), baselineFrom: baselineStart.toISOString().slice(0, 10), baselineTo: baselineEnd.toISOString().slice(0, 10), metric: 'PRESENTATION_RATE', baselineValue: item.metrics.supportPercentage || item.metrics.attachmentPercentage, currentValue: null, currentNumerator: null, currentDenominator: null, measurementNote: 'Presentation-mode trial. It resets when this browser session reloads.' } } : item) }))
      setStartingTrialId(null)
      return
    }
    try {
      const activated = await startRetailerOpportunityTrial({ ...credentials, opportunityId, startDate, durationDays })
      setOpportunities((current) => ({ ...current, summary: { ...current.summary, availableCount: Math.max(0, current.summary.availableCount - 1), activeTrialCount: current.summary.activeTrialCount + 1 }, opportunities: current.opportunities.map((item) => item.id === opportunityId ? activated : item) }))
    } catch (activationError) {
      setEngagementError(activationError?.message || 'This trial could not be started.')
    } finally {
      setStartingTrialId(null)
    }
  }

  function refresh() {
    setError(''); setEngagementError('')
    refreshRequested.current = true
    setMotionState('refreshing')
    if (credentials.presentation) {
      setLoading(true); setEngagementLoading(true); setOpportunitiesLoading(true)
      window.clearTimeout(refreshTimer.current)
      refreshTimer.current = window.setTimeout(() => {
        setData(presentationOverview(period)); setEngagement(presentationEngagement()); setOpportunities(presentationOpportunities()); setLoading(false); setEngagementLoading(false); setOpportunitiesLoading(false); finishRefreshMotion()
      }, 420)
      return
    }
    setLoading(true); setEngagementLoading(true); setOpportunitiesLoading(true); setRefreshKey((value) => value + 1)
  }
  function changePeriod(nextPeriod) {
    setError(''); setPeriod(nextPeriod)
    if (credentials.presentation) {
      setData(presentationOverview(nextPeriod)); setLoading(false)
      return
    }
    setLoading(true)
  }
  function navigate(nextPage) { setActivePage(nextPage) }
  const openIntelligence = useCallback((context, source) => {
    intelligenceReturnFocus.current = source || document.activeElement
    setIntelligenceContext(context || null)
    setIntelligenceOpen(true)
  }, [])
  const closeIntelligence = useCallback(() => {
    setIntelligenceOpen(false)
    window.requestAnimationFrame(() => intelligenceReturnFocus.current?.focus?.())
  }, [])
  function signOut() {
    setCredentials(null); setData(null); setError(''); setLoading(false); setPresentationLoading(false); setPeriod('LAST_30_DAYS'); setActivePage('home')
    setEngagement(null); setEngagementLoading(false); setEngagementError(''); setOpportunities(null); setOpportunitiesLoading(false); setStartingTrialId(null); setAnalysisNotice(''); opportunitySnapshot.current = null
    setIntelligenceOpen(false); setIntelligenceContext(null)
  }

  function signIn(next) {
    const presentation = isPresentationCredentials(next)
    setCredentials({ ...next, presentation }); setData(presentation ? presentationOverview(period) : null); setError(''); setLoading(!presentation)
    setEngagement(presentation ? presentationEngagement() : null); setEngagementLoading(!presentation); setOpportunities(presentation ? presentationOpportunities() : null); setOpportunitiesLoading(!presentation); setRefreshKey((value) => value + 1)
    setPresentationLoading(presentation)
  }

  if (!credentials || (!data && error)) {
    return <Login error={error} loading={loading} onSubmit={signIn} />
  }
  if (presentationLoading) return <TimedLoadingScreen duration={PRESENTATION_LOADING_DURATION_MS} message="Loading presentation intelligence" onComplete={finishPresentationLoading} />
  if (!data) return <LoadingState title="Reading your latest sales…" description="Preparing your shop summary." />

  const headerActions = (
    <>
      <DataFreshness formatter={formatTime} generatedAt={data.generatedAt} />
      {credentials.presentation ? <span className="retailer-presentation-badge"><i aria-hidden="true" />Presentation data</span> : null}
      {data.retailerCode === 'KAGGLE' ? <details className="cci-dataset-menu"><summary>Demo data</summary><div><strong>Dataset details</strong><p>Kaggle Supermarket Dataset 2019. This is not current retailer performance.</p></div></details> : null}
      <button aria-controls="retailer-intelligence-drawer" aria-expanded={intelligenceOpen} aria-label="Ask SCAN" className="retailer-intelligence-trigger" onClick={(event) => openIntelligence(intelligenceContextForPage(activePage, data, engagement, opportunities), event.currentTarget)} type="button"><ScanIcon name="ask" size={16} /><span>Ask SCAN</span></button>
      <button aria-label={loading ? 'Refreshing…' : 'Refresh'} className="scan-icon-button" disabled={loading || engagementLoading} onClick={refresh} type="button"><ScanIcon name="refresh" size={18} /></button>
    </>
  )

  return (
    <div className={`retailer-motion-state is-${motionState}`} ref={layoutRef}>
      <WorkspaceShell activePage={activePage} accountLabel={retailerDisplayName(data)} accountMeta="Retailer account" brandSubtitle="Retailer Workspace" header={<WorkspaceHeader actions={headerActions} eyebrow="My shop" meta={<p>Retailer Workspace</p>} title={retailerDisplayName(data)} />} navItems={NAV_ITEMS} onNavigate={navigate} onSignOut={signOut} portal="retailer">
        {error ? <div className="scan-inline-notice scan-inline-error" role="alert"><span>{error}</span><button className="scan-button scan-button-light" onClick={refresh} type="button">Retry</button></div> : null}
        {engagementError ? <div className="scan-inline-notice scan-inline-error" role="alert"><span>{engagementError}</span></div> : null}
        <Page
          analysisNotice={analysisNotice}
          activePage={activePage}
          data={data}
          engagement={engagement}
          engagementLoading={engagementLoading}
          loading={loading}
          motionState={motionState}
          motionTick={motionTick}
          onNavigate={navigate}
          onOpenIntelligence={openIntelligence}
          onPeriodChange={changePeriod}
          onStartTrial={startTrial}
          opportunities={opportunities}
          opportunitiesLoading={opportunitiesLoading}
          period={period}
          presentation={credentials.presentation}
          startingTrialId={startingTrialId}
        />
      </WorkspaceShell>
      {intelligenceOpen ? <RetailerIntelligenceDrawer context={intelligenceContext} data={data} onClose={closeIntelligence} onNavigate={navigate} open /> : null}
    </div>
  )
}
