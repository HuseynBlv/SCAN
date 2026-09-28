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
import { usePretextLayout } from './usePretextLayout'
import {
  ChartPanel,
  DataFreshness,
  EmptyState,
  LoadingState,
  MetricStrip,
  PageIntro,
  StatusBadge,
  WorkspaceHeader,
  WorkspaceShell,
} from './WorkspaceUI'
import './CciDashboard.css'
import './RetailerDashboard.css'

// The retailer home page answers "what do I get from SCAN?", not "here is a dashboard to
// interpret". Real analytics (sales trend, best sellers, slow movers) stay one tap away under
// Insights, but they support decisions here - they are not the reason to open the app.
const NAV_ITEMS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'offers', label: 'Offers', icon: 'recommendations' },
  { id: 'actions', label: 'Actions', icon: 'opportunities' },
  { id: 'insights', label: 'Insights', icon: 'chart' },
  { id: 'partner', label: 'Partner', icon: 'time-store' },
]

const PERIODS = [
  { value: 'TODAY', label: 'Today' },
  { value: 'LAST_7_DAYS', label: 'Last 7 days' },
  { value: 'LAST_30_DAYS', label: 'Last 30 days' },
  { value: 'ALL_TIME', label: 'All time' },
]

const OFFER_TABS = [
  { id: 'available', label: 'Available' },
  { id: 'active', label: 'Active' },
  { id: 'completed', label: 'Completed' },
]

const ACTION_TYPE_META = {
  URGENT: { label: 'Urgent', tone: 'warning' },
  OPPORTUNITY: { label: 'Opportunity', tone: 'red' },
  INVENTORY: { label: 'Inventory', tone: 'neutral' },
  PERFORMANCE: { label: 'Performance', tone: 'success' },
}

// SCAN Partner benefits are a uniform commercial policy for every retailer at a given tier, not
// a fact observed from any one retailer's data - so, unlike everything else on this screen, this
// copy is legitimately the same for every account at the same level.
const PARTNER_BENEFITS = {
  SILVER: ['Personalized CCI offers become available once your store meets Gold requirements.'],
  GOLD: [
    'Personalized CCI offers',
    'Partner-only promotions',
    'Promotional bonuses',
    'Early access to selected campaigns',
    'Store recommendations',
    'Performance benchmarking',
  ],
  PLATINUM: [
    'Everything in Gold',
    'Priority promotional campaigns',
    'Enhanced commercial offers',
    'New product trials',
    'Additional merchandising opportunities',
  ],
}

const PLATINUM_PREVIEW = [
  'Priority promotional campaigns',
  'Enhanced commercial offers',
  'New product trials',
  'Additional merchandising opportunities',
]

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })

function formatMoney(value, currency) {
  const amount = Number(value || 0)
  if (!currency || currency === 'N/A') return amount.toFixed(2)
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function formatDateTime(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
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
  if (data.totalBaskets > 0 && data.mappedLinePercentage < 90) {
    const noProductsMapped = data.mappedLinePercentage === 0
    items.push({
      id: 'mapping',
      title: noProductsMapped ? 'Product analysis is unavailable' : 'Product matching needs review',
      description: noProductsMapped
        ? 'No transaction lines are matched to normalized products.'
        : `${decimal.format(data.mappedLinePercentage)}% of transaction lines are matched to normalized products.`,
      action: 'Ask the SCAN administrator to review unmatched products.',
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

  return (
    <main className="cci-login-shell retailer-login-shell">
      <section className="cci-login-card" aria-labelledby="retailer-login-title">
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

function SyncStatus({ data }) {
  const healthy = data.sync.state === 'COMPLETED' && !data.sync.errors.length
  return (
    <section className={`scan-panel retailer-sync-card ${healthy ? 'is-healthy' : 'is-warning'}`}>
      <header className="scan-panel-header"><div><h3>POS Connection</h3><p>{data.sync.filename || 'No source file received'}</p></div><StatusBadge tone={healthy ? 'success' : 'warning'}>{healthy ? 'Connected' : humanize(data.sync.state)}</StatusBadge></header>
      <dl className="retailer-sync-grid">
        <div><dt>Last sync</dt><dd>{formatDateTime(data.sync.completedAt)}</dd></div>
        <div><dt>Transactions processed</dt><dd>{integer.format(data.lifetimeTransactionsProcessed)}</dd></div>
      </dl>
      <p className="retailer-pos-copy">SCAN automatically analyzes your sales data. No manual reporting required.</p>
    </section>
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

function KpiCard({ label, value, note, tone }) {
  return (
    <article className={`retailer-kpi-card ${tone ? `is-${tone}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
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

function RecommendedOfferHero({ offer, onViewOffers }) {
  return (
    <section className="retailer-hero-offer">
      <span className="scan-eyebrow">Recommended for your store</span>
      <h2>{offer.productName}</h2>
      <p className="retailer-hero-reason">{offer.reason}</p>
      <div className="retailer-hero-terms">
        <div><span>SCAN Partner offer</span><strong>{offer.normalCondition}</strong></div>
        <div><span>Partner benefit</span><strong>{offer.partnerCondition}</strong></div>
        <div><span>Estimated benefit</span><strong>{offer.benefitSummary}</strong></div>
      </div>
      <footer>
        <small>Based on your recent sales</small>
        <button className="scan-button scan-button-primary" onClick={onViewOffers} type="button">View offer</button>
      </footer>
    </section>
  )
}

function BenefitsCard({ partnerStatus, currency, benefitsDisplay }) {
  return (
    <section className="scan-panel retailer-benefits-card">
      <header className="scan-panel-header"><div><h3>Your SCAN Benefits</h3><p>Estimated commercial value from accepted offers, discounts, bonuses and promotions</p></div></header>
      <div className="retailer-benefits-totals">
        <div><span>This month</span><strong>{formatMoney(benefitsDisplay ?? partnerStatus.benefits.thisMonth, currency)}</strong></div>
        <div><span>Last month</span><strong>{formatMoney(partnerStatus.benefits.lastMonth, currency)}</strong></div>
        <div><span>Lifetime</span><strong>{formatMoney(partnerStatus.benefits.lifetime, currency)}</strong></div>
      </div>
      {partnerStatus.benefitHistory.length ? (
        <ul className="retailer-benefit-rows">
          {partnerStatus.benefitHistory.slice(0, 4).map((entry) => (
            <li key={entry.title + entry.activatedAt}>
              <span className="retailer-benefit-amount">{entry.estimatedBenefitAzn != null ? `+ ${formatMoney(entry.estimatedBenefitAzn, currency)}` : entry.benefitSummary}</span>
              <small>{entry.title}</small>
            </li>
          ))}
        </ul>
      ) : <p className="retailer-benefit-empty">Activate an offer to start building your SCAN benefit history.</p>}
    </section>
  )
}

function Home({ data, engagement, onNavigate }) {
  const { offers, partnerStatus } = engagement
  const heroOffer = offers.available[0]
  const attention = attentionItems(data)
  const benefitsDisplay = useCountUp(partnerStatus.benefits.thisMonth)

  return (
    <div className="scan-page-stack retailer-home">
      <section className="retailer-greeting">
        <div>
          <span className="scan-eyebrow">{greeting()}, {retailerDisplayName(data)}</span>
          <h1>Your store is connected to SCAN</h1>
        </div>
        <span className="retailer-connected-pill"><i aria-hidden="true" />Connected</span>
      </section>

      <div className="retailer-kpi-grid">
        <KpiCard label="Benefits this month" value={formatMoney(benefitsDisplay, data.currency)} note="Total SCAN benefits" />
        <KpiCard label="Available offers" value={offers.available.length} note="Offers available for your store" />
        <KpiCard label="Partner status" value={partnerStatus.level} note="SCAN Partner" tone="level" />
      </div>

      {heroOffer
        ? <RecommendedOfferHero offer={heroOffer} onViewOffers={() => onNavigate('offers')} />
        : <EmptyState title="No personalized offers yet">Offers appear once SCAN has enough recorded CCI product sales from your store.</EmptyState>}

      <BenefitsCard partnerStatus={partnerStatus} currency={data.currency} />

      <SyncStatus data={data} />

      {attention.length ? <AttentionBanner items={attention} onNavigate={onNavigate} /> : null}
    </div>
  )
}

function OfferCard({ offer, onActivate, activating, justActivated }) {
  const [expanded, setExpanded] = useState(false)
  const tone = offer.status === 'ACTIVE' ? 'success' : offer.status === 'COMPLETED' ? 'neutral' : 'red'
  return (
    <article className={`retailer-offer-card ${expanded ? 'is-expanded' : ''}`}>
      <header>
        <div><h3>{offer.productName}</h3>{offer.category ? <small>{offer.category}</small> : null}</div>
        <StatusBadge tone={tone}>{humanize(offer.status)}</StatusBadge>
      </header>
      <p className="retailer-offer-reason">{offer.reason}</p>
      <dl className="retailer-offer-terms">
        <div><dt>Order</dt><dd>{offer.normalCondition}</dd></div>
        <div><dt>Partner benefit</dt><dd>{offer.partnerCondition}</dd></div>
        <div><dt>Estimated saving</dt><dd>{offer.benefitSummary}</dd></div>
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
      <PageIntro description="Commercial offers computed from your store's own recorded CCI product sales." eyebrow="Offers" title="SCAN Partner offers" />
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

function ActionCard({ action }) {
  const meta = ACTION_TYPE_META[action.type]
  return (
    <article className="retailer-action-card">
      <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
      <h3>{action.title}</h3>
      <p>{action.explanation}</p>
      <div className="retailer-action-metric"><span>{action.metricLabel}</span><strong>{action.metricValue}</strong></div>
      <div className="retailer-action-recommendation"><span>Recommendation</span><p>{action.recommendation}</p></div>
    </article>
  )
}

function Actions({ data, actions, onNavigate }) {
  const attention = attentionItems(data)
  return (
    <div className="scan-page-stack">
      <PageIntro description="What happened, why it matters, and what you can do about it." eyebrow="Actions" title="Actions" />
      {attention.length ? <AttentionBanner items={attention} onNavigate={onNavigate} /> : null}
      {actions.length ? (
        <div className="retailer-action-grid">{actions.map((action) => <ActionCard action={action} key={action.id} />)}</div>
      ) : (
        <EmptyState title="No actions right now">SCAN will surface a recommendation as soon as there is a real pattern worth acting on.</EmptyState>
      )}
    </div>
  )
}

function Partner({ partnerStatus }) {
  return (
    <div className="scan-page-stack">
      <PageIntro description="Your standing is based on healthy participation in SCAN, not purchase volume." eyebrow="Partner" title="SCAN Partner" />
      <section className="scan-panel retailer-partner-card">
        <div className="retailer-partner-level">
          <strong>{humanize(partnerStatus.level)}</strong>
          <span>{partnerStatus.nextLevel ? `${partnerStatus.progressPercentage}% to ${humanize(partnerStatus.nextLevel)}` : 'Highest tier reached'}</span>
        </div>
        {partnerStatus.nextLevel ? <div className="retailer-partner-progress" aria-hidden="true"><i style={{ width: `${partnerStatus.progressPercentage}%` }} /></div> : null}
        {partnerStatus.daysUntilNextLevel != null ? <p className="retailer-partner-eta">{partnerStatus.daysUntilNextLevel} days until {humanize(partnerStatus.nextLevel)} eligibility</p> : null}
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

      {partnerStatus.level !== 'PLATINUM' ? (
        <section className="scan-panel retailer-partner-preview">
          <header className="scan-panel-header"><h3>Platinum unlock preview</h3><StatusBadge tone="neutral">Eligible campaigns only</StatusBadge></header>
          <ul>{PLATINUM_PREVIEW.map((benefit) => <li key={benefit}>{benefit}</li>)}</ul>
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
  const shortPeriod = period === 'TODAY' || period === 'LAST_7_DAYS'
  return (
    <div className="scan-page-stack">
      <PageIntro aside={<PeriodControl loading={loading} onChange={onPeriodChange} value={period} />} description="Supporting detail behind your offers and actions - not the main event." eyebrow="Insights" title="Store Insights" />
      <MetricStrip label="Sales summary" items={[
        { label: 'Sales', value: formatMoney(data.totalSales, data.currency), note: humanize(data.period) },
        { label: 'Transactions', value: integer.format(data.totalBaskets), note: 'Validated receipts' },
        { label: 'Average basket', value: formatMoney(data.averageBasketValue, data.currency), note: 'Sales divided by transactions' },
      ]} />
      <ChartPanel description="Recorded daily sales" title="Sales movement"><SalesTrend data={data} /></ChartPanel>
      <section className="retailer-simple-section retailer-products-section">
        <header><div><h2>Best-selling products</h2><p>Top products by recorded sales</p></div>{data.topProducts.length > 6 ? <label className="retailer-product-search"><span className="sr-only">Search products</span><ScanIcon name="explore" size={18} /><input onChange={(event) => setSearch(event.target.value)} placeholder="Search products" type="search" value={search} /></label> : null}</header>
        <ProductList data={data} products={products} search={search.trim()} />
      </section>
      <div className="retailer-product-secondary">
        <section className="retailer-simple-section retailer-unavailable-section"><header><h2>Slow-moving products</h2><StatusBadge tone="neutral">See Actions</StatusBadge></header><p>Products selling more slowly than usual are now surfaced as Inventory actions, with the specific comparison behind each one.</p></section>
        <section className="retailer-simple-section retailer-stock-check"><header><div><h2>Potential stockouts</h2><p>Products worth checking on the shelf</p></div><StatusBadge tone="neutral">Inventory not connected</StatusBadge></header>
          {shortPeriod && data.topProducts.length ? <ul>{[...data.topProducts].sort((a, b) => b.quantity - a.quantity).slice(0, 3).map((product) => <li key={product.name}><div><strong>{product.name}</strong><small>{decimal.format(product.quantity)} units sold · {humanize(data.period)}</small></div><span>Check stock</span></li>)}</ul> : <p>Choose Today or Last 7 days to see products with the most recorded unit sales. SCAN does not know current stock levels.</p>}
        </section>
      </div>
    </div>
  )
}

function Page({ activePage, data, engagement, engagementLoading, loading, onActivate, onNavigate, onPeriodChange, period, activatingKey, justActivatedKey }) {
  if (loading && data.period !== period) return <LoadingState title="Updating this view…" description="SCAN is reading the selected sales period." />
  if (activePage === 'insights') return <Insights data={data} loading={loading} onPeriodChange={onPeriodChange} period={period} />
  if (engagementLoading || !engagement) return <LoadingState title="Loading your SCAN benefits…" description="Preparing offers, actions, and partner status." />
  if (activePage === 'offers') return <Offers activatingKey={activatingKey} justActivatedKey={justActivatedKey} offers={engagement.offers} onActivate={onActivate} />
  if (activePage === 'actions') return <Actions actions={engagement.actions} data={data} onNavigate={onNavigate} />
  if (activePage === 'partner') return <Partner partnerStatus={engagement.partnerStatus} />
  return <Home data={data} engagement={engagement} onNavigate={onNavigate} />
}

export default function RetailerDashboard() {
  const [credentials, setCredentials] = useState(null)
  const [period, setPeriod] = useState('TODAY')
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

  function refresh() { setLoading(true); setEngagementLoading(true); setError(''); setEngagementError(''); setRefreshKey((value) => value + 1) }
  function changePeriod(nextPeriod) { setLoading(true); setError(''); setPeriod(nextPeriod) }
  function navigate(nextPage) { setActivePage(nextPage) }
  function signOut() {
    setCredentials(null); setData(null); setError(''); setLoading(false); setPeriod('TODAY'); setActivePage('home')
    setEngagement(null); setEngagementLoading(false); setEngagementError(''); setActivatingKey(null); setJustActivatedKey(null)
  }

  if (!credentials || (!data && error)) {
    return <Login error={error} loading={loading} onSubmit={(next) => {
      setCredentials(next); setData(null); setError(''); setLoading(true)
      setEngagement(null); setEngagementLoading(true); setRefreshKey((value) => value + 1)
    }} />
  }
  if (!data) return <LoadingState title="Reading your latest sales…" description="Preparing your shop summary." />

  const headerActions = (
    <>
      {data.retailerCode === 'KAGGLE' ? <details className="cci-dataset-menu"><summary>Demo data</summary><div><strong>Dataset details</strong><p>Kaggle Supermarket Dataset 2019. This is not current retailer performance.</p></div></details> : null}
      <DataFreshness formatter={formatDateTime} generatedAt={data.generatedAt} />
      <button aria-label={loading ? 'Refreshing…' : 'Refresh'} className="scan-icon-button" disabled={loading || engagementLoading} onClick={refresh} type="button"><ScanIcon name="refresh" size={18} /></button>
    </>
  )

  return (
    <div ref={layoutRef}>
      <WorkspaceShell activePage={activePage} accountLabel={retailerDisplayName(data)} accountMeta="Retailer account" brandSubtitle="Retailer Workspace" header={<WorkspaceHeader actions={headerActions} eyebrow="My shop" meta={<p>Private retailer view</p>} title={retailerDisplayName(data)} />} navItems={NAV_ITEMS} onNavigate={navigate} onSignOut={signOut} portal="retailer">
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
