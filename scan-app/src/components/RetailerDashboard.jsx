import { useEffect, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { ScanApiError } from '../services/scanApi'
import {
  activateRetailerOffer,
  fetchRetailerActions,
  fetchRetailerOffers,
  fetchRetailerOverview,
  fetchRetailerPartnerStatus,
} from '../services/retailerApi'
import ScanBrand from './ScanBrand'
import ScanIcon from './ScanIcon'
import {
  isPresentationCredentials,
  PRESENTATION_PASSWORD,
  PRESENTATION_USERNAME,
  presentationEngagement,
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
  ActionCard as RetailActionCard,
  ActivityItem,
  Badge,
  BenchmarkIndicator,
  Card,
  IntelligenceCard,
  MetricCard,
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
  { id: 'ask', label: 'Ask SCAN', icon: 'ask', featured: true },
]

const PERIODS = [
  { value: 'LAST_7_DAYS', label: '7 days' },
  { value: 'LAST_30_DAYS', label: '30 days' },
  { value: 'LAST_90_DAYS', label: '90 days' },
  { value: 'ALL_TIME', label: 'All time' },
]

const OFFER_TABS = [
  { id: 'available', label: 'Available' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
]

const OFFER_TYPE_META = {
  VOLUME_DISCOUNT: { label: 'Volume offer', accent: 'discount', icon: 'sales' },
  BONUS_PRODUCT: { label: 'Bonus product', accent: 'bonus', icon: 'products' },
  WEEKEND_ACTIVATION: { label: 'Weekend campaign', accent: 'weekend', icon: 'time-store' },
  BASKET_GROWTH: { label: 'Personalized pricing', accent: 'basket', icon: 'basket' },
}

const ACTION_TYPE_META = {
  STOCK_RISK: { label: 'Stock risk', tone: 'warning' },
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

function useCountUp(target, durationMs = 700) {
  const [display, setDisplay] = useState(target)
  const previous = useRef(target)
  useEffect(() => {
    const start = previous.current
    const delta = target - start
    if (!delta) { setDisplay(target); previous.current = target; return undefined }
    const startedAt = performance.now()
    let frame
    function tick(now) {
      const progress = Math.min(1, (now - startedAt) / durationMs)
      setDisplay(start + delta * progress)
      if (progress < 1) frame = requestAnimationFrame(tick)
      else previous.current = target
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])
  return display
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

function ActivateButton({ offer, onActivate, activating, justActivated, label }) {
  if (justActivated) {
    return (
      <button className="scan-button retailer-activate-button is-success" disabled type="button">
        <ScanIcon name="check" size={16} /> Offer activated
      </button>
    )
  }
  return (
    <button
      className="scan-button scan-button-primary retailer-activate-button"
      disabled={activating}
      onClick={() => onActivate(offer.offerKey)}
      type="button"
    >
      {activating ? 'Activating…' : label}
    </button>
  )
}

function Home({ data, engagement, onNavigate }) {
  const { offers, partnerStatus } = engagement
  const heroOffer = offers.available[0]
  const attention = attentionItems(data)
  const benefitsDisplay = useCountUp(partnerStatus.benefits.thisMonth)
  const salesTrend = data.dailySales.slice(-10).map((day) => day.totalSales)
  const basketTrend = data.dailySales.slice(-10).map((day) => day.basketCount)
  const activity = [
    heroOffer ? { icon: 'recommendations', tone: 'red', title: 'New opportunity detected', detail: heroOffer.productName, time: 'Now' } : null,
    engagement.actions[0] ? { icon: 'opportunities', tone: 'warning', title: 'Action created', detail: engagement.actions[0].title, time: 'Today' } : null,
    partnerStatus.benefitHistory[0] ? { icon: 'check', tone: 'positive', title: 'Benefit measured', detail: partnerStatus.benefitHistory[0].title, time: formatDay(partnerStatus.benefitHistory[0].activatedAt) } : null,
    { icon: 'sync', tone: 'positive', title: 'Sales data refreshed', detail: `${integer.format(data.sync.importedReceipts || data.totalBaskets)} receipts analyzed`, time: formatDateTime(data.sync.completedAt) },
  ].filter(Boolean)

  return (
    <div className="scan-page-stack retailer-home retailer-commerce-home">
      <section className="retailer-greeting retailer-compact-intro">
        <div>
          <span className="scan-eyebrow">{greeting()}</span>
          <h1>Your store is connected to SCAN</h1>
          <p>Here is what changed, what needs attention, and where value is building.</p>
        </div>
        <span className="retailer-connected-pill"><i aria-hidden="true" />Connected</span>
      </section>

      <div className="retailer-commerce-grid retailer-overview-grid">
        <MetricCard change="+12.4%" chartValues={salesTrend} icon="sales" label="Sales" note="vs last 30-day pace" value={formatMoney(data.totalSales, data.currency)} />
        <MetricCard chartValues={basketTrend} icon="basket" label="Transactions" note={`${decimal.format(data.productsPerBasket)} products per basket`} tone="dark" value={integer.format(data.totalBaskets)} />
        <MetricCard change={`${offers.available.length} ready`} changeTone="red" icon="recommendations" label="Opportunities" note="Personalized for this store" value={offers.available.length} />
        <MetricCard change="On track" changeTone="positive" icon="time-store" label="Partner level" note={`${partnerStatus.progressPercentage}% to ${humanize(partnerStatus.nextLevel)}`} value={partnerStatus.level} />
      </div>

      <div className="retailer-commerce-grid retailer-intelligence-row">
        {heroOffer ? (
          <IntelligenceCard
            action={<button className="retailer-light-button" onClick={() => onNavigate('opportunities')} type="button">Review opportunity <ScanIcon name="chevron" size={15} /></button>}
            description={heroOffer.reason}
            metric={heroOffer.metricValue}
            title={`${heroOffer.productName} is your strongest next move`}
          >
            <div className="retailer-intelligence-facts">
              <div><span>Recommended</span><strong>{heroOffer.normalCondition}</strong></div>
              <div><span>Partner benefit</span><strong>{heroOffer.partnerCondition}</strong></div>
              <div><span>Estimated value</span><strong>{heroOffer.benefitSummary.replace('Estimated benefit: ', '')}</strong></div>
            </div>
          </IntelligenceCard>
        ) : <EmptyState title="No personalized offers yet">Offers appear once SCAN has enough recorded CCI product sales from your store.</EmptyState>}
        <Card className="retailer-activity-card">
          <SectionHeader action={<button className="scan-text-link" onClick={() => onNavigate('actions')} type="button">View all</button>} title="Workspace activity" />
          <ul>{activity.map((item) => <ActivityItem {...item} key={`${item.title}-${item.detail}`} />)}</ul>
        </Card>
      </div>

      <div className="retailer-commerce-grid retailer-support-row">
        <Card className="retailer-benefit-module">
          <SectionHeader description="Commercial value captured through offers and campaigns." eyebrow="Measured value" title="SCAN benefits" />
          <div className="retailer-benefits-totals">
            <div><span>This month</span><strong>{formatMoney(benefitsDisplay, data.currency)}</strong></div>
            <div><span>Last month</span><strong>{formatMoney(partnerStatus.benefits.lastMonth, data.currency)}</strong></div>
            <div><span>Lifetime</span><strong>{formatMoney(partnerStatus.benefits.lifetime, data.currency)}</strong></div>
          </div>
          <BenchmarkIndicator benchmark={84} label="Monthly benefit target" tone="positive" value="84%" />
        </Card>

        <Card className="retailer-products-module">
          <SectionHeader action={<button className="scan-text-link" onClick={() => onNavigate('insights')} type="button">See insights</button>} description="Ranked by recorded sales" title="Product momentum" />
          <ol>
            {data.topProducts.slice(0, 4).map((product, index) => (
              <li key={product.name}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{product.name}</strong><small>{integer.format(product.quantity)} units</small></div><b>{formatMoney(product.revenue, data.currency)}</b></li>
            ))}
          </ol>
        </Card>

        <Card className="retailer-data-health-module">
          <SectionHeader action={<Badge tone="positive">Healthy</Badge>} description="Latest checkout export" title="Data connection" />
          <div className="retailer-data-health-score"><strong>{decimal.format(data.mappedLinePercentage)}%</strong><span>product mapping</span></div>
          <BenchmarkIndicator benchmark={data.mappedLinePercentage} label="Mapping completeness" tone="positive" value={`${decimal.format(data.mappedLinePercentage)}%`} />
          <button className="scan-text-link" onClick={() => onNavigate('data')} type="button">Open data status <ScanIcon name="chevron" size={14} /></button>
        </Card>
      </div>

      {attention.length ? <AttentionBanner items={attention} onNavigate={onNavigate} /> : null}
    </div>
  )
}

function OfferCard({ offer, onActivate, activating, justActivated }) {
  const [expanded, setExpanded] = useState(false)
  const tone = offer.status === 'ACTIVE' ? 'success' : offer.status === 'COMPLETED' ? 'neutral' : 'red'
  const typeMeta = OFFER_TYPE_META[offer.offerType] || { label: humanize(offer.offerType), accent: 'discount', icon: 'recommendations' }
  return (
    <article className={`retailer-offer-card is-${typeMeta.accent} ${expanded ? 'is-expanded' : ''}`}>
      <header>
        <div className={`retailer-offer-type-chip is-${typeMeta.accent}`}>
          <ScanIcon name={typeMeta.icon} size={14} />
          {typeMeta.label}
        </div>
        <StatusBadge tone={tone}>{humanize(offer.status)}</StatusBadge>
      </header>
      <div className="retailer-offer-identity">
        <h3>{offer.productName}</h3>
        {offer.category ? <small>{offer.category}</small> : null}
      </div>
      <div className="retailer-offer-metric"><strong>{offer.metricValue}</strong><span>{offer.metricLabel}</span></div>
      <p className="retailer-offer-reason">{offer.reason}</p>
      <dl className="retailer-offer-terms">
        <div><dt>Condition</dt><dd>{offer.normalCondition}</dd></div>
        <div><dt>Partner benefit</dt><dd>{offer.partnerCondition}</dd></div>
        <div className="is-payoff"><dt>Benefit</dt><dd>{offer.benefitSummary}</dd></div>
        <div><dt>Valid until</dt><dd>{formatDay(offer.expiresAt)}</dd></div>
      </dl>
      <button className="retailer-offer-why-toggle" onClick={() => setExpanded((value) => !value)} type="button">
        {expanded ? 'Hide details' : "Why you're seeing this"} <ScanIcon name="chevron" size={15} />
      </button>
      {expanded ? <ul className="retailer-offer-why">{offer.whyReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : null}
      {offer.status === 'AVAILABLE' ? (
        <ActivateButton activating={activating} justActivated={justActivated} label="Activate offer" offer={offer} onActivate={onActivate} />
      ) : null}
    </article>
  )
}

function emptyOfferCopy(tab) {
  if (tab === 'available') return 'Offers appear once SCAN has enough recorded CCI product sales from your store.'
  if (tab === 'active') return 'Offers you activate will appear here until they expire.'
  return 'Expired offers will appear here.'
}

function Offers({ offers, onActivate, activatingKey, justActivatedKey }) {
  const [tab, setTab] = useState('available')
  const list = offers[tab]
  return (
    <div className="scan-page-stack">
      <PageIntro description="Commercial opportunities detected from how products actually perform in your store." eyebrow="Opportunities" title="Growth opportunities" />
      <div className="retailer-offer-tabs" role="tablist">
        {OFFER_TABS.map((item) => (
          <button aria-selected={tab === item.id} className={tab === item.id ? 'is-active' : ''} key={item.id} onClick={() => setTab(item.id)} role="tab" type="button">
            {item.label} <span>{offers[item.id].length}</span>
          </button>
        ))}
      </div>
      {list.length ? (
        <div className="retailer-offer-grid">
          {list.map((offer) => (
            <OfferCard
              activating={activatingKey === offer.offerKey}
              justActivated={justActivatedKey === offer.offerKey}
              key={offer.offerKey}
              offer={offer}
              onActivate={onActivate}
            />
          ))}
        </div>
      ) : <EmptyState title={`No ${tab} offers`}>{emptyOfferCopy(tab)}</EmptyState>}
    </div>
  )
}

function ActionModule({ action }) {
  const meta = ACTION_TYPE_META[action.type]
  return (
    <RetailActionCard
      badge={`${meta.label} · ${action.scope === 'CCI' ? 'CCI' : 'Store'}`}
      badgeTone={meta.tone}
      description={action.explanation}
      metricLabel={action.metricLabel}
      metricValue={action.metricValue}
      recommendation={action.recommendation}
      title={action.title}
    />
  )
}

function Actions({ data, actions, onNavigate }) {
  const attention = attentionItems(data)
  return (
    <div className="scan-page-stack">
      <PageIntro description="What happened, why it matters, and what you can do about it." eyebrow="Actions" title="Actions" />
      {attention.length ? <AttentionBanner items={attention} onNavigate={onNavigate} /> : null}
      {actions.length ? (
        <div className="retailer-action-grid">{actions.map((action) => <ActionModule action={action} key={action.id} />)}</div>
      ) : (
        <EmptyState title="No actions right now">SCAN will surface a recommendation as soon as there is a real pattern worth acting on.</EmptyState>
      )}
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

function ProductList({ data, products, search }) {
  if (!products.length) return search
    ? <EmptyState compact title="No matching products">Try another product name.</EmptyState>
    : <EmptyState compact title="No product sales">No products were sold in this period.</EmptyState>
  return (
    <ol className="retailer-product-list">
      {products.map((product, index) => (
        <li key={`${product.name}-${product.category}`}>
          <span className="retailer-product-rank">{String(index + 1).padStart(2, '0')}</span>
          <div><strong title={product.name}>{product.name}</strong><small>{product.category}</small></div>
          <dl><div><dt>Sales</dt><dd>{formatMoney(product.revenue, data.currency)}</dd></div><div><dt>Transactions</dt><dd>{integer.format(product.basketCount)}</dd></div><div><dt>Units</dt><dd>{decimal.format(product.quantity)}</dd></div></dl>
        </li>
      ))}
    </ol>
  )
}

function Insights({ data, loading, onPeriodChange, period }) {
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
        <ProductList data={data} products={products} search={search.trim()} />
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

function Data({ data }) {
  const healthy = data.sync.state === 'COMPLETED' && !data.sync.errors.length
  return (
    <div className="scan-page-stack retailer-data-page">
      <PageIntro description="See exactly what SCAN received, processed, and can use." eyebrow="Data" title="Data connection" />
      <div className="retailer-commerce-grid retailer-data-summary">
        <MetricCard change={healthy ? 'Healthy' : 'Attention'} changeTone={healthy ? 'positive' : 'warning'} icon="sync" label="Connection" note={data.sync.filename || 'No source file'} value={healthy ? 'Active' : humanize(data.sync.state)} />
        <MetricCard icon="basket" label="Receipts processed" note="Lifetime validated transactions" tone="dark" value={integer.format(data.lifetimeTransactionsProcessed)} />
        <MetricCard change="Usable" changeTone="positive" icon="mapping" label="Product mapping" note="Imported lines recognized" value={`${decimal.format(data.mappedLinePercentage)}%`} />
      </div>
      <div className="retailer-commerce-grid retailer-data-detail-row">
        <Card className="retailer-data-timeline">
          <SectionHeader action={<Badge tone={healthy ? 'positive' : 'warning'}>{healthy ? 'Up to date' : 'Needs attention'}</Badge>} description="Latest checkout export" title="Processing status" />
          <ol>
            <ActivityItem detail={data.sync.filename || 'Checkout export'} icon="file" time={formatDateTime(data.sync.receivedAt)} title="File received" />
            <ActivityItem detail={`${integer.format(data.sync.importedReceipts)} receipts · ${integer.format(data.sync.importedLines)} lines`} icon="check" time={formatDateTime(data.sync.completedAt)} title="Validation completed" tone={healthy ? 'positive' : 'warning'} />
            <ActivityItem detail={`${decimal.format(data.mappedLinePercentage)}% mapped to products`} icon="mapping" time="Current" title="Data ready for intelligence" tone="red" />
          </ol>
        </Card>
        <Card className="retailer-data-quality">
          <SectionHeader description="The evidence behind recommendations" title="Coverage" />
          <div className="retailer-data-health-score"><strong>{decimal.format(data.mappedLinePercentage)}%</strong><span>analysis-ready data</span></div>
          <BenchmarkIndicator benchmark={data.mappedLinePercentage} label="Product mapping" tone="positive" value={`${decimal.format(data.mappedLinePercentage)}%`} />
          <BenchmarkIndicator benchmark={Math.min(data.totalBaskets / 30, 100)} label="Transaction depth" value={integer.format(data.totalBaskets)} />
          <p>SCAN uses only validated receipts and recognized products. Missing or unresolved records are excluded from recommendations.</p>
        </Card>
      </div>
    </div>
  )
}

const ASK_SUGGESTIONS = [
  'What changed in my store?',
  'Which product should I focus on?',
  'How much value has SCAN created?',
]

function answerQuestion(question, data, engagement) {
  const normalized = question.toLowerCase()
  if (normalized.includes('value') || normalized.includes('benefit')) {
    return `SCAN has measured ${formatMoney(engagement.partnerStatus.benefits.thisMonth, data.currency)} in commercial value this month and ${formatMoney(engagement.partnerStatus.benefits.lifetime, data.currency)} over the life of the connection.`
  }
  if (normalized.includes('product') || normalized.includes('focus')) {
    const product = data.topProducts[0]
    return product ? `${product.name} is the strongest recorded product in this period, with ${integer.format(product.quantity)} units and ${formatMoney(product.revenue, data.currency)} in sales. Review the related opportunity before changing an order.` : 'There is not enough product evidence to answer that reliably yet.'
  }
  if (normalized.includes('changed') || normalized.includes('store')) {
    const insight = data.insights[0]
    return insight ? `${insight.fact} ${insight.interpretation} Recommended next step: ${insight.recommendedAction}` : `SCAN analyzed ${integer.format(data.totalBaskets)} transactions, but no material change is available for this period.`
  }
  return 'I cannot answer that reliably from the connected store data yet. Try one of the grounded questions below.'
}

function AskScan({ data, engagement }) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  function ask(value) {
    const next = value.trim()
    if (!next) return
    setQuestion(next)
    setAnswer(answerQuestion(next, data, engagement))
  }
  return (
    <div className="scan-page-stack retailer-ask-page">
      <PageIntro description="Ask grounded questions about this store's connected data." eyebrow="Ask SCAN" title="Store intelligence, on demand" />
      <IntelligenceCard description="Answers are calculated from the same validated sales, offers, actions, and benefit records shown throughout the workspace." title={answer ? question : 'What would you like to understand?'}>
        {answer ? <p className="retailer-ask-answer">{answer}</p> : null}
        <form className="retailer-ask-form" onSubmit={(event) => { event.preventDefault(); ask(question) }}>
          <ScanIcon name="ask" size={18} />
          <input aria-label="Ask SCAN a question" onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about sales, products, opportunities, or benefits" value={question} />
          <button type="submit">Ask SCAN</button>
        </form>
      </IntelligenceCard>
      <section className="retailer-question-grid" aria-label="Suggested questions">
        {ASK_SUGGESTIONS.map((suggestion) => <button key={suggestion} onClick={() => ask(suggestion)} type="button"><span>{suggestion}</span><ScanIcon name="chevron" size={16} /></button>)}
      </section>
    </div>
  )
}

function Page({ activePage, data, engagement, engagementLoading, loading, onActivate, onNavigate, onPeriodChange, period, activatingKey, justActivatedKey }) {
  if (loading && data.period !== period) return <LoadingState title="Updating this view…" description="SCAN is reading the selected sales period." />
  if (activePage === 'insights') return <Insights data={data} loading={loading} onPeriodChange={onPeriodChange} period={period} />
  if (activePage === 'data') return <Data data={data} />
  if (engagementLoading || !engagement) return <LoadingState title="Loading your SCAN benefits…" description="Preparing offers, actions, and partner status." />
  if (activePage === 'opportunities') return <Offers activatingKey={activatingKey} justActivatedKey={justActivatedKey} offers={engagement.offers} onActivate={onActivate} />
  if (activePage === 'actions') return <Actions actions={engagement.actions} data={data} onNavigate={onNavigate} />
  if (activePage === 'partner') return <Partner partnerStatus={engagement.partnerStatus} />
  if (activePage === 'ask') return <AskScan data={data} engagement={engagement} />
  return <Home data={data} engagement={engagement} onNavigate={onNavigate} />
}

export default function RetailerDashboard() {
  const [credentials, setCredentials] = useState(null)
  const [period, setPeriod] = useState('LAST_30_DAYS')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [engagement, setEngagement] = useState(null)
  const [engagementLoading, setEngagementLoading] = useState(false)
  const [engagementError, setEngagementError] = useState('')
  const [activatingKey, setActivatingKey] = useState(null)
  const [justActivatedKey, setJustActivatedKey] = useState(null)
  const [activePage, setActivePage] = useState('home')
  const [refreshKey, setRefreshKey] = useState(0)
  const layoutRef = useRef(null)

  usePretextLayout(layoutRef, `${activePage}:${period}:${data?.generatedAt || 'login'}:${engagement ? 'ready' : 'loading'}`)

  useEffect(() => {
    if (!credentials) return undefined
    if (credentials.presentation) return undefined
    const controller = new AbortController()
    fetchRetailerOverview({ ...credentials, period, signal: controller.signal })
      .then((overview) => { if (!controller.signal.aborted) setData(overview) })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError?.name !== 'AbortError') {
          setError(requestError?.message || 'Unable to load retailer analytics.')
          if (requestError instanceof ScanApiError && [401, 403].includes(requestError.status)) setData(null)
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [credentials, period, refreshKey])

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

  async function activateOffer(offerKey) {
    setActivatingKey(offerKey)
    setEngagementError('')
    if (credentials.presentation) {
      const selected = engagement.offers.available.find((offer) => offer.offerKey === offerKey)
      if (selected) {
        setEngagement((current) => ({
          ...current,
          offers: {
            ...current.offers,
            available: current.offers.available.filter((offer) => offer.offerKey !== offerKey),
            active: [{ ...selected, status: 'ACTIVE' }, ...current.offers.active],
          },
          partnerStatus: {
            ...current.partnerStatus,
            benefits: {
              ...current.partnerStatus.benefits,
              thisMonth: current.partnerStatus.benefits.thisMonth + (selected.estimatedBenefitAzn || 0),
              lifetime: current.partnerStatus.benefits.lifetime + (selected.estimatedBenefitAzn || 0),
            },
            benefitHistory: [{ activatedAt: new Date().toISOString(), title: selected.title, benefitSummary: selected.benefitSummary, estimatedBenefitAzn: selected.estimatedBenefitAzn }, ...current.partnerStatus.benefitHistory],
          },
        }))
        setJustActivatedKey(offerKey)
      }
      setActivatingKey(null)
      return
    }
    try {
      await activateRetailerOffer({ ...credentials, offerKey })
      // Show the success checkmark in place before the offer moves to the Active tab, rather
      // than refetching immediately and having the card disappear out from under the click.
      setJustActivatedKey(offerKey)
      setActivatingKey(null)
      setTimeout(async () => {
        try {
          const [refreshedOffers, refreshedActions, refreshedPartnerStatus] = await Promise.all([
            fetchRetailerOffers(credentials),
            fetchRetailerActions(credentials),
            fetchRetailerPartnerStatus(credentials),
          ])
          setEngagement({ offers: refreshedOffers, actions: refreshedActions, partnerStatus: refreshedPartnerStatus })
        } catch (refreshError) {
          setEngagementError(refreshError?.message || 'Unable to refresh SCAN offers and benefits.')
        } finally {
          setJustActivatedKey((current) => (current === offerKey ? null : current))
        }
      }, 2200)
    } catch (activationError) {
      setEngagementError(activationError?.message || 'This offer could not be activated.')
      setActivatingKey(null)
    }
  }

  function refresh() {
    setError(''); setEngagementError('')
    if (credentials.presentation) {
      setData(presentationOverview(period)); setEngagement(presentationEngagement()); setLoading(false); setEngagementLoading(false)
      return
    }
    setLoading(true); setEngagementLoading(true); setRefreshKey((value) => value + 1)
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
  function signOut() {
    setCredentials(null); setData(null); setError(''); setLoading(false); setPeriod('LAST_30_DAYS'); setActivePage('home')
    setEngagement(null); setEngagementLoading(false); setEngagementError(''); setActivatingKey(null); setJustActivatedKey(null)
  }

  if (!credentials || (!data && error)) {
    return <Login error={error} loading={loading} onSubmit={(next) => {
      const presentation = isPresentationCredentials(next)
      setCredentials({ ...next, presentation }); setData(presentation ? presentationOverview(period) : null); setError(''); setLoading(!presentation)
      setEngagement(presentation ? presentationEngagement() : null); setEngagementLoading(!presentation); setRefreshKey((value) => value + 1)
    }} />
  }
  if (!data) return <LoadingState title="Reading your latest sales…" description="Preparing your shop summary." />

  const headerActions = (
    <>
      {credentials.presentation ? <span className="retailer-presentation-badge"><i aria-hidden="true" />Presentation data</span> : null}
      {data.retailerCode === 'KAGGLE' ? <details className="cci-dataset-menu"><summary>Demo data</summary><div><strong>Dataset details</strong><p>Kaggle Supermarket Dataset 2019. This is not current retailer performance.</p></div></details> : null}
      <DataFreshness formatter={formatTime} generatedAt={data.generatedAt} />
      <button className="retailer-ask-header" onClick={() => navigate('ask')} type="button"><ScanIcon name="ask" size={16} />Ask SCAN</button>
      <button aria-label={loading ? 'Refreshing…' : 'Refresh'} className="scan-icon-button" disabled={loading || engagementLoading} onClick={refresh} type="button"><ScanIcon name="refresh" size={18} /></button>
    </>
  )

  return (
    <div ref={layoutRef}>
      <WorkspaceShell activePage={activePage} accountLabel={retailerDisplayName(data)} accountMeta="Retailer account" brandSubtitle="Retailer Workspace" header={<WorkspaceHeader actions={headerActions} eyebrow="Store" meta={<p>Retailer Workspace</p>} title={retailerDisplayName(data)} />} navItems={NAV_ITEMS} onNavigate={navigate} onSignOut={signOut} portal="retailer">
        {error ? <div className="scan-inline-notice scan-inline-error" role="alert"><span>{error}</span><button className="scan-button scan-button-light" onClick={refresh} type="button">Retry</button></div> : null}
        {engagementError ? <div className="scan-inline-notice scan-inline-error" role="alert"><span>{engagementError}</span></div> : null}
        <Page
          activatingKey={activatingKey}
          activePage={activePage}
          data={data}
          engagement={engagement}
          engagementLoading={engagementLoading}
          justActivatedKey={justActivatedKey}
          loading={loading}
          onActivate={activateOffer}
          onNavigate={navigate}
          onPeriodChange={changePeriod}
          period={period}
        />
      </WorkspaceShell>
    </div>
  )
}
