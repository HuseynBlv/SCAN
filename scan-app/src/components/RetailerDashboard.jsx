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
import { fetchRetailerOverview } from '../services/retailerApi'
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

const NAV_ITEMS = [
  { id: 'today', label: 'Today', icon: 'home' },
  { id: 'sales', label: 'Sales', icon: 'chart' },
  { id: 'products', label: 'Products', icon: 'products' },
  { id: 'alerts', label: 'Alerts', icon: 'alerts' },
]

const PERIODS = [
  { value: 'TODAY', label: 'Today' },
  { value: 'LAST_7_DAYS', label: 'Last 7 days' },
  { value: 'LAST_30_DAYS', label: 'Last 30 days' },
  { value: 'ALL_TIME', label: 'All time' },
]

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
const MIN_PATTERN_BASKETS = 5

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
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(value))
}

function retailerDisplayName(data) {
  return data.retailerCode === 'KAGGLE' ? 'Demo shop' : data.retailerName
}

function isCciOnlyInsight(insight) {
  return /CCI product|CCI basket|CCI penetration|contained a CCI/i.test(`${insight.fact} ${insight.interpretation}`)
}

function isDataInsight(insight) {
  return /mapping|mapped|unmapped|unresolved|data sync|transaction export/i.test(`${insight.fact} ${insight.interpretation} ${insight.recommendedAction}`)
}

function operationalInsights(data) {
  if (data.totalBaskets < MIN_PATTERN_BASKETS) return []
  return data.insights.filter((insight) => !isCciOnlyInsight(insight) && !isDataInsight(insight))
}

function retailerAction(insight) {
  return /\btest\b|promotion|placement|bundle|experiment/i.test(insight.recommendedAction)
    ? null
    : insight.recommendedAction
}

function attentionItems(data) {
  const items = []
  if (data.sync.state !== 'COMPLETED' || data.sync.errors.length) {
    items.push({
      id: 'sync',
      title: 'Checkout data needs attention',
      description: data.sync.errors[0] || `The latest feed is ${humanize(data.sync.state)}.`,
      action: 'Check the latest checkout export or reconnect the feed.',
      timestamp: data.sync.receivedAt || data.generatedAt,
      type: 'Data feed',
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
      timestamp: data.generatedAt,
      type: 'Product data',
    })
  }
  return items
}

function alertFeed(data) {
  const operational = operationalInsights(data).map((insight, index) => ({
    id: `insight-${index}`,
    title: insight.fact,
    description: insight.interpretation,
    action: retailerAction(insight),
    timestamp: data.generatedAt,
    type: /baskets occurred|busiest part of the day/i.test(`${insight.fact} ${insight.interpretation}`) ? 'Busy time' : 'Shop update',
  }))
  return [...attentionItems(data), ...operational]
    .sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
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
          <h1 id="retailer-login-title">Know what needs your attention.</h1>
          <p>See how the shop is doing, what is selling, and whether the latest checkout data arrived.</p>
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

function SyncStatus({ data, detailed = false }) {
  const healthy = data.sync.state === 'COMPLETED' && !data.sync.errors.length
  return (
    <section className={`scan-panel retailer-sync-card ${healthy ? 'is-healthy' : 'is-warning'}`}>
      <header className="scan-panel-header"><div><h3>{healthy ? 'Checkout data is connected' : 'Data sync needs attention'}</h3><p>{data.sync.filename || 'No source file received'}</p></div><StatusBadge tone={healthy ? 'success' : 'warning'}>{healthy ? 'Up to date' : humanize(data.sync.state)}</StatusBadge></header>
      {detailed ? (
        <dl className="retailer-sync-grid">
          <div><dt>Completed</dt><dd>{formatDateTime(data.sync.completedAt)}</dd></div>
          <div><dt>Receipts</dt><dd>{integer.format(data.sync.importedReceipts)}</dd></div>
          <div><dt>Transaction lines</dt><dd>{integer.format(data.sync.importedLines)}</dd></div>
          <div><dt>Unresolved products</dt><dd>{integer.format(data.sync.unresolvedProducts)}</dd></div>
        </dl>
      ) : <p className="retailer-sync-copy">Last completed {formatDateTime(data.sync.completedAt)} · {integer.format(data.sync.importedReceipts)} receipts imported</p>}
      {data.sync.errors.length ? <div className="scan-inline-notice scan-inline-error" role="alert">{data.sync.errors.join(' · ')}</div> : null}
    </section>
  )
}

function TodayHero({ data }) {
  return (
    <section className="retailer-today-hero" aria-labelledby="retailer-today-title">
      <header><div><span className="scan-eyebrow">Shop summary</span><h2 id="retailer-today-title">Today</h2></div><p>{formatDay(data.generatedAt)}</p></header>
      <div className="retailer-today-numbers">
        <div className="is-primary"><span>Sales today</span><strong>{formatMoney(data.totalSales, data.currency)}</strong></div>
        <div><span>Transactions</span><strong>{integer.format(data.totalBaskets)}</strong></div>
        <div><span>Average basket</span><strong>{formatMoney(data.averageBasketValue, data.currency)}</strong></div>
      </div>
    </section>
  )
}

function NeedsAttention({ data, onNavigate }) {
  const items = attentionItems(data)
  return (
    <section className="retailer-simple-section retailer-needs-attention">
      <header><h2>Needs attention</h2>{items.length ? <StatusBadge tone="warning">{items.length} {items.length === 1 ? 'item' : 'items'}</StatusBadge> : null}</header>
      {items.length ? (
        <div className="retailer-attention-list">
          {items.map((item) => <article key={item.id}><ScanIcon name="alerts" size={21} /><div><strong>{item.title}</strong><p>{item.description}</p></div><button onClick={() => onNavigate('alerts')} type="button">View details <ScanIcon name="chevron" size={16} /></button></article>)}
        </div>
      ) : (
        <div className="retailer-normal-state"><span aria-hidden="true">✓</span><div><strong>{data.totalBaskets ? 'Everything looks normal.' : 'No sales recorded yet.'}</strong><p>{data.totalBaskets ? 'The checkout feed has no data issue requiring action.' : 'Sales will appear after today’s first completed transaction.'}</p></div></div>
      )}
    </section>
  )
}

function TopSellers({ data, limit = 3 }) {
  return (
    <section className="retailer-simple-section">
      <header><div><h2>Top sellers today</h2><p>Ranked by recorded sales</p></div></header>
      {data.topProducts.length ? (
        <ol className="retailer-seller-list">
          {data.topProducts.slice(0, limit).map((product, index) => (
            <li key={`${product.name}-${product.category}`}><span>{index + 1}</span><div><strong title={product.name}>{product.name}</strong><small>{product.category} · {integer.format(product.basketCount)} transactions</small></div><b>{formatMoney(product.revenue, data.currency)}</b></li>
          ))}
        </ol>
      ) : <EmptyState compact title="No products sold yet">Today’s sellers will appear after transactions are received.</EmptyState>}
    </section>
  )
}

function BusyHours({ data }) {
  const sufficient = data.totalBaskets >= MIN_PATTERN_BASKETS && data.dayparts.length
  return (
    <section className="retailer-simple-section">
      <header><div><h2>Busy hours</h2><p>Share of today’s transactions</p></div></header>
      {sufficient ? (
        <div className="retailer-busy-hours">
          {data.dayparts.slice(0, 4).map((item) => <div key={item.segment}><span>{humanize(item.segment)}</span><i aria-hidden="true"><b style={{ width: `${Math.min(item.sharePercentage, 100)}%` }} /></i><strong>{decimal.format(item.sharePercentage)}%</strong><small>{integer.format(item.basketCount)} transactions</small></div>)}
        </div>
      ) : <EmptyState compact title="Not enough transactions yet">At least five transactions are needed before showing a time pattern.</EmptyState>}
    </section>
  )
}

function Today({ data, onNavigate }) {
  return (
    <div className="scan-page-stack retailer-today">
      <TodayHero data={data} />
      <NeedsAttention data={data} onNavigate={onNavigate} />
      <div className="retailer-today-grid"><TopSellers data={data} /><BusyHours data={data} /></div>
    </div>
  )
}

function Sales({ data, loading, onPeriodChange, period }) {
  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="Sales" title="Sales history" description="Recorded sales, transactions, and average basket for the selected period." aside={<PeriodControl loading={loading} onChange={onPeriodChange} value={period} />} />
      <MetricStrip label="Sales summary" items={[
        { label: 'Sales', value: formatMoney(data.totalSales, data.currency), note: humanize(data.period) },
        { label: 'Transactions', value: integer.format(data.totalBaskets), note: 'Validated receipts' },
        { label: 'Average basket', value: formatMoney(data.averageBasketValue, data.currency), note: 'Sales divided by transactions' },
      ]} />
      <ChartPanel title="How are sales changing over time?" description="Recorded daily sales"><SalesTrend data={data} /></ChartPanel>
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

function Products({ data, loading, onPeriodChange, period }) {
  const [search, setSearch] = useState('')
  const products = data.topProducts.filter((product) => `${product.name} ${product.category}`.toLowerCase().includes(search.trim().toLowerCase()))
  const shortPeriod = data.period === 'TODAY' || data.period === 'LAST_7_DAYS'
  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="Products" title="Product performance" description="What is selling in this shop, based on recorded transaction lines." aside={<PeriodControl loading={loading} onChange={onPeriodChange} value={period} />} />
      <section className="retailer-simple-section retailer-products-section">
        <header><div><h2>Best sellers</h2><p>Top products by recorded sales</p></div>{data.topProducts.length > 6 ? <label className="retailer-product-search"><span className="sr-only">Search products</span><ScanIcon name="explore" size={18} /><input onChange={(event) => setSearch(event.target.value)} placeholder="Search products" type="search" value={search} /></label> : null}</header>
        <ProductList data={data} products={products} search={search.trim()} />
      </section>
      <div className="retailer-product-secondary">
        <section className="retailer-simple-section retailer-unavailable-section"><header><h2>Slow movers</h2><StatusBadge tone="neutral">Not available</StatusBadge></header><p>A complete product list is needed to identify products selling more slowly than the rest.</p></section>
        <section className="retailer-simple-section retailer-stock-check"><header><div><h2>High sales activity</h2><p>Products worth checking on the shelf</p></div><StatusBadge tone="neutral">Inventory not connected</StatusBadge></header>
          {shortPeriod && data.topProducts.length ? <ul>{[...data.topProducts].sort((a, b) => b.quantity - a.quantity).slice(0, 3).map((product) => <li key={product.name}><div><strong>{product.name}</strong><small>{decimal.format(product.quantity)} units sold · {humanize(data.period)}</small></div><span>Check stock</span></li>)}</ul> : <p>Choose Today or Last 7 days to see products with the most recorded unit sales. SCAN does not know current stock levels.</p>}
        </section>
      </div>
    </div>
  )
}

function Alerts({ data }) {
  const alerts = alertFeed(data)
  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="Alerts" title="Alerts" description="Shop updates that may need attention." aside={<StatusBadge tone={alerts.length ? 'warning' : 'success'}>{alerts.length ? `${alerts.length} ${alerts.length === 1 ? 'item' : 'items'}` : 'All clear'}</StatusBadge>} />
      <section className="retailer-simple-section">
        {alerts.length ? <ol className="retailer-alert-feed">{alerts.map((alert) => <li key={alert.id}><div className="retailer-alert-marker"><ScanIcon name={alert.id === 'sync' || alert.id === 'mapping' ? 'alerts' : 'chart'} size={19} /></div><article><header><StatusBadge tone={alert.id === 'sync' || alert.id === 'mapping' ? 'warning' : 'neutral'}>{alert.type}</StatusBadge><time dateTime={alert.timestamp}>{formatDateTime(alert.timestamp)}</time></header><h2>{alert.title}</h2><p>{alert.description}</p>{alert.action ? <div><span>What to do</span><strong>{alert.action}</strong></div> : null}</article></li>)}</ol> : <div className="retailer-normal-state is-large"><span aria-hidden="true">✓</span><div><strong>Everything looks normal.</strong><p>There are no shop or data-feed alerts for today.</p></div></div>}
      </section>
      <details className="retailer-data-details"><summary>Checkout data details <ScanIcon name="chevron" size={17} /></summary><SyncStatus data={data} detailed /></details>
      <section className="scan-panel retailer-privacy-note"><header className="scan-panel-header"><div><h3>Your sales stay private</h3><p>How SCAN uses this data</p></div><ScanIcon name="shield" /></header><p>SCAN analyzes transaction and product data for this retailer account. No customer identity is shown. CCI receives only aggregates approved for sharing.</p></section>
    </div>
  )
}

function Page({ activePage, data, loading, onNavigate, onPeriodChange, period }) {
  if (loading && data.period !== period) return <LoadingState title="Updating this view…" description="SCAN is reading the selected sales period." />
  if (activePage === 'sales') return <Sales data={data} loading={loading} onPeriodChange={onPeriodChange} period={period} />
  if (activePage === 'products') return <Products data={data} loading={loading} onPeriodChange={onPeriodChange} period={period} />
  if (activePage === 'alerts') return <Alerts data={data} />
  return <Today data={data} onNavigate={onNavigate} />
}

export default function RetailerDashboard() {
  const [credentials, setCredentials] = useState(null)
  const [period, setPeriod] = useState('TODAY')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [activePage, setActivePage] = useState('today')
  const [refreshKey, setRefreshKey] = useState(0)
  const layoutRef = useRef(null)

  usePretextLayout(layoutRef, `${activePage}:${period}:${data?.generatedAt || 'login'}`)

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

  function refresh() { setLoading(true); setError(''); setRefreshKey((value) => value + 1) }
  function changePeriod(nextPeriod) { setLoading(true); setError(''); setPeriod(nextPeriod) }
  function navigate(nextPage) {
    if ((nextPage === 'today' || nextPage === 'alerts') && period !== 'TODAY') changePeriod('TODAY')
    setActivePage(nextPage)
  }
  function signOut() { setCredentials(null); setData(null); setError(''); setLoading(false); setPeriod('TODAY'); setActivePage('today') }

  if (!credentials || (!data && error)) return <Login error={error} loading={loading} onSubmit={(next) => { setCredentials(next); setData(null); setError(''); setLoading(true); setRefreshKey((value) => value + 1) }} />
  if (!data) return <LoadingState title="Reading your latest sales…" description="Preparing your shop summary." />

  const actions = (
    <>
      {data.retailerCode === 'KAGGLE' ? <details className="cci-dataset-menu"><summary>Demo data</summary><div><strong>Dataset details</strong><p>Kaggle Supermarket Dataset 2019. This is not current retailer performance.</p></div></details> : null}
      <DataFreshness formatter={formatDateTime} generatedAt={data.generatedAt} />
      <button className="scan-icon-button" disabled={loading} onClick={refresh} type="button" aria-label={loading ? 'Refreshing…' : 'Refresh'}><ScanIcon name="refresh" size={18} /></button>
    </>
  )

  return (
    <div ref={layoutRef}>
      <WorkspaceShell activePage={activePage} accountLabel={retailerDisplayName(data)} accountMeta="Retailer account" brandSubtitle="Retailer Workspace" header={<WorkspaceHeader actions={actions} eyebrow="My shop" meta={<p>Private retailer view</p>} title={retailerDisplayName(data)} />} navItems={NAV_ITEMS} onNavigate={navigate} onSignOut={signOut} portal="retailer">
        {error ? <div className="scan-inline-notice scan-inline-error" role="alert"><span>{error}</span><button className="scan-button scan-button-light" type="button" onClick={refresh}>Retry</button></div> : null}
        <Page activePage={activePage} data={data} loading={loading} onNavigate={navigate} onPeriodChange={changePeriod} period={period} />
      </WorkspaceShell>
    </div>
  )
}
