import { useEffect, useState } from 'react'
import {
  Bar,
  BarChart,
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
import './CciDashboard.css'
import './RetailerDashboard.css'

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview' },
  { id: 'products', label: 'Products & Categories' },
  { id: 'time-store', label: 'Time & Stores' },
  { id: 'recommendations', label: 'Recommendations' },
  { id: 'sync', label: 'Data Sync' },
]

const PERIODS = [
  { value: 'TODAY', label: 'Today' },
  { value: 'LAST_7_DAYS', label: 'Last 7 days' },
  { value: 'LAST_30_DAYS', label: 'Last 30 days' },
  { value: 'ALL_TIME', label: 'All time' },
]

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const decimal = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

function formatMoney(value, currency) {
  const amount = Number(value || 0)
  if (!currency || currency === 'N/A') return amount.toFixed(2)
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(amount)
  } catch {
    return `${amount.toFixed(2)} ${currency}`
  }
}

function formatDateTime(value) {
  if (!value) return 'Not available'
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function humanize(value) {
  return `${value || ''}`.toLowerCase().replaceAll('_', ' ').replace(/^./, (letter) => letter.toUpperCase())
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
        <div className="cci-brand">
          <div className="cci-brand-mark retailer-brand-mark">S</div>
          <div>
            <div className="cci-brand-name retailer-brand-name">SCAN</div>
            <div className="cci-brand-subtitle">Retailer Intelligence</div>
          </div>
        </div>
        <div className="cci-login-copy">
          <span className="cci-eyebrow retailer-eyebrow">Retailer owner portal</span>
          <h1 id="retailer-login-title">Your market, clearly explained.</h1>
          <p>
            See sales, basket behavior, product performance and data synchronization without
            changing how the cashier checks out customers.
          </p>
        </div>
        <form className="cci-login-form" onSubmit={submit}>
          <label>
            Username
            <input
              autoComplete="username"
              required
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              required
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
          <button className="cci-primary-button retailer-primary-button" disabled={loading} type="submit">
            {loading ? 'Connecting…' : 'Open my dashboard'}
          </button>
        </form>
        <a className="portal-switch-link" href="/?portal=cci">CCI Sales & Marketing portal →</a>
      </section>
    </main>
  )
}

function Kpi({ label, value, note, status }) {
  return (
    <article className={`cci-kpi-card ${status ? `is-${status}` : ''}`}>
      <div className="cci-kpi-label">{label}</div>
      <div className="cci-kpi-value">{value}</div>
      <div className="cci-kpi-note">{note}</div>
    </article>
  )
}

function Empty({ title, children }) {
  return (
    <div className="cci-empty-state">
      <div className="cci-empty-icon" aria-hidden="true">○</div>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}

function InsightCards({ insights }) {
  return (
    <div className={`cci-insight-grid count-${Math.min(insights.length, 3)}`}>
      {insights.map((insight, index) => (
        <article className="cci-insight-card retailer-insight-card" key={`${insight.fact}-${index}`}>
          <div className="cci-insight-number">{String(index + 1).padStart(2, '0')}</div>
          <div className="cci-insight-label">Fact</div>
          <h3>{insight.fact}</h3>
          <div className="cci-insight-label">What it means</div>
          <p>{insight.interpretation}</p>
          <div className="cci-insight-label">Recommended action</div>
          <p className="cci-action-copy">{insight.recommendedAction}</p>
        </article>
      ))}
    </div>
  )
}

function Overview({ data, onNavigate }) {
  if (data.totalBaskets === 0) {
    return (
      <div className="cci-page-stack">
        <section className="cci-panel">
          <Empty title="No baskets in this period">
            Choose a longer period or open Data Sync to check whether SCAN has received the latest export.
          </Empty>
        </section>
      </div>
    )
  }

  return (
    <div className="cci-page-stack">
      <section className="cci-kpi-grid retailer-kpi-grid" aria-label="Retailer KPIs">
        <Kpi label="Total sales" value={formatMoney(data.totalSales, data.currency)} note="Validated receipt value" />
        <Kpi label="Baskets" value={integer.format(data.totalBaskets)} note="Complete reconstructed receipts" />
        <Kpi label="Average basket" value={formatMoney(data.averageBasketValue, data.currency)} note="Sales divided by baskets" />
        <Kpi label="Items per basket" value={decimal.format(data.productsPerBasket)} note={`${decimal.format(data.totalItems)} units recorded`} />
        <Kpi label="CCI penetration" value={`${decimal.format(data.cciPenetrationPercentage)}%`} note={`${integer.format(data.cciBaskets)} baskets with CCI`} />
        <Kpi
          label="Product mapping"
          value={`${decimal.format(data.mappedLinePercentage)}%`}
          note={data.mappedLinePercentage >= 90 ? 'Healthy for analysis' : 'Mapping review recommended'}
          status={data.mappedLinePercentage >= 90 ? 'healthy' : 'warning'}
        />
      </section>

      <section className="cci-panel">
        <div className="cci-section-heading">
          <div>
            <span className="cci-eyebrow retailer-eyebrow">Sales trend</span>
            <h2>Recent recorded sales</h2>
          </div>
        </div>
        {data.dailySales.length ? (
          <div className="cci-chart retailer-sales-chart" role="img" aria-label="Daily retailer sales">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 300 }}>
              <LineChart data={data.dailySales} margin={{ top: 10, right: 20, bottom: 8, left: 4 }}>
                <CartesianGrid stroke="rgba(18, 18, 18, 0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tickLine={false} />
                <YAxis tickLine={false} width={54} />
                <Tooltip formatter={(value) => formatMoney(value, data.currency)} />
                <Line dataKey="totalSales" dot={data.dailySales.length < 12} stroke="#087f5b" strokeWidth={3} type="monotone" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty title="No daily trend yet">Imported transactions will appear here.</Empty>}
      </section>

      <section className="cci-panel">
        <div className="cci-section-heading">
          <div>
            <span className="cci-eyebrow retailer-eyebrow">What to do next</span>
            <h2>{data.insights.length} decision-ready insights</h2>
          </div>
          <button className="cci-text-button retailer-text-button" type="button" onClick={() => onNavigate('recommendations')}>
            View actions →
          </button>
        </div>
        <InsightCards insights={data.insights} />
      </section>
    </div>
  )
}

function Products({ data }) {
  return (
    <div className="cci-page-stack">
      <section className="cci-page-intro">
        <span className="cci-eyebrow retailer-eyebrow">Products & categories</span>
        <h2>What drives recorded sales?</h2>
        <p>Ranked by line revenue from validated retailer exports.</p>
      </section>
      <section className="cci-panel">
        <div className="cci-section-heading compact"><h2>Top products</h2></div>
        {data.topProducts.length ? (
          <div className="cci-table-wrap">
            <table className="cci-table">
              <thead><tr><th>Product</th><th>Category</th><th>Baskets</th><th>Quantity</th><th>Sales</th></tr></thead>
              <tbody>{data.topProducts.map((product) => (
                <tr key={`${product.name}-${product.category}`}>
                  <td>{product.name}</td><td>{product.category}</td>
                  <td>{integer.format(product.basketCount)}</td><td>{decimal.format(product.quantity)}</td>
                  <td>{formatMoney(product.revenue, data.currency)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty title="No products found">Choose a period with imported baskets.</Empty>}
      </section>
      <section className="cci-panel">
        <div className="cci-section-heading compact"><h2>Top categories</h2></div>
        {data.topCategories.length ? (
          <div className="cci-chart" role="img" aria-label="Top retailer categories by sales">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 340 }}>
              <BarChart data={data.topCategories.slice(0, 8)} layout="vertical" margin={{ left: 20, right: 24 }}>
                <CartesianGrid horizontal={false} stroke="rgba(18, 18, 18, 0.08)" strokeDasharray="3 3" />
                <XAxis type="number" tickLine={false} />
                <YAxis dataKey="category" type="category" tickLine={false} width={120} />
                <Tooltip formatter={(value) => formatMoney(value, data.currency)} />
                <Bar dataKey="revenue" fill="#087f5b" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : <Empty title="No category data">Map retailer products to categories to populate this view.</Empty>}
      </section>
    </div>
  )
}

function TimeAndStores({ data }) {
  return (
    <div className="cci-page-stack">
      <section className="cci-page-intro">
        <span className="cci-eyebrow retailer-eyebrow">Time & stores</span>
        <h2>When and where does business happen?</h2>
      </section>
      <section className="cci-two-column">
        <div className="cci-panel">
          <div className="cci-section-heading compact"><h2>Dayparts</h2></div>
          {data.dayparts.map((item) => (
            <div className="retailer-segment-row" key={item.segment}>
              <strong>{humanize(item.segment)}</strong>
              <span>{integer.format(item.basketCount)} baskets · {decimal.format(item.sharePercentage)}%</span>
            </div>
          ))}
        </div>
        <div className="cci-panel">
          <div className="cci-section-heading compact"><h2>Week pattern</h2></div>
          {data.weekdayWeekend.map((item) => (
            <div className="retailer-segment-row" key={item.segment}>
              <strong>{humanize(item.segment)}</strong>
              <span>{integer.format(item.basketCount)} baskets · {decimal.format(item.sharePercentage)}%</span>
            </div>
          ))}
        </div>
      </section>
      <section className="cci-panel">
        <div className="cci-section-heading compact"><h2>Store performance</h2></div>
        {data.stores.length ? (
          <div className="cci-table-wrap">
            <table className="cci-table">
              <thead><tr><th>Store</th><th>Baskets</th><th>Sales</th><th>Average basket</th><th>CCI baskets</th></tr></thead>
              <tbody>{data.stores.map((store) => (
                <tr key={store.storeId}>
                  <td>{store.storeId}</td><td>{integer.format(store.basketCount)}</td>
                  <td>{formatMoney(store.totalSales, data.currency)}</td>
                  <td>{formatMoney(store.averageBasketValue, data.currency)}</td>
                  <td>{integer.format(store.cciBasketCount)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <Empty title="No store activity">Choose a period with imported baskets.</Empty>}
      </section>
    </div>
  )
}

function Recommendations({ data }) {
  return (
    <div className="cci-page-stack">
      <section className="cci-page-intro">
        <span className="cci-eyebrow retailer-eyebrow">Recommendations</span>
        <h2>Actions supported by your sales data</h2>
        <p>Every recommendation follows a deterministic fact, interpretation and action.</p>
      </section>
      <InsightCards insights={data.insights} />
    </div>
  )
}

function DataSync({ data }) {
  const healthy = data.sync.state === 'COMPLETED'
  return (
    <div className="cci-page-stack">
      <section className="cci-page-intro">
        <span className="cci-eyebrow retailer-eyebrow">Data sync</span>
        <h2>{healthy ? 'Retailer data is connected' : 'Synchronization needs attention'}</h2>
        <p>SCAN shows the latest server-side import received from the retailer connector.</p>
      </section>
      <section className={`cci-panel retailer-sync-card ${healthy ? 'is-healthy' : 'is-warning'}`}>
        <div className="retailer-sync-heading">
          <div className="retailer-sync-dot" aria-hidden="true" />
          <div><span>Latest import</span><h2>{humanize(data.sync.state)}</h2></div>
        </div>
        <dl className="retailer-sync-grid">
          <div><dt>File</dt><dd>{data.sync.filename || 'No file received'}</dd></div>
          <div><dt>Completed</dt><dd>{formatDateTime(data.sync.completedAt)}</dd></div>
          <div><dt>Receipts imported</dt><dd>{integer.format(data.sync.importedReceipts)}</dd></div>
          <div><dt>Lines imported</dt><dd>{integer.format(data.sync.importedLines)}</dd></div>
          <div><dt>Unresolved products</dt><dd>{integer.format(data.sync.unresolvedProducts)}</dd></div>
        </dl>
        {data.sync.errors.length ? (
          <div className="cci-inline-error" role="alert">{data.sync.errors.join(' · ')}</div>
        ) : null}
      </section>
      <section className="cci-panel retailer-privacy-note">
        <span className="cci-eyebrow retailer-eyebrow">Privacy boundary</span>
        <h2>Your retailer account is isolated</h2>
        <p>This portal is bound to one retailer. CCI receives only aggregates the retailer has approved for sharing.</p>
      </section>
    </div>
  )
}

function Page({ activePage, data, onNavigate }) {
  if (activePage === 'products') return <Products data={data} />
  if (activePage === 'time-store') return <TimeAndStores data={data} />
  if (activePage === 'recommendations') return <Recommendations data={data} />
  if (activePage === 'sync') return <DataSync data={data} />
  return <Overview data={data} onNavigate={onNavigate} />
}

export default function RetailerDashboard() {
  const [credentials, setCredentials] = useState(null)
  const [period, setPeriod] = useState('ALL_TIME')
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [activePage, setActivePage] = useState('overview')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    if (!credentials) return undefined
    const controller = new AbortController()
    fetchRetailerOverview({ ...credentials, period, signal: controller.signal })
      .then((overview) => {
        if (!controller.signal.aborted) setData(overview)
      })
      .catch((requestError) => {
        if (!controller.signal.aborted && requestError?.name !== 'AbortError') {
          setError(requestError?.message || 'Unable to load retailer analytics.')
          if (requestError instanceof ScanApiError && [401, 403].includes(requestError.status)) setData(null)
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [credentials, period, refreshKey])

  function refresh() {
    setLoading(true)
    setError('')
    setRefreshKey((value) => value + 1)
  }

  if (!credentials || (!data && error)) {
    return <Login error={error} loading={loading} onSubmit={(next) => {
      setCredentials(next)
      setData(null)
      setError('')
      setLoading(true)
      setRefreshKey((value) => value + 1)
    }} />
  }

  if (!data) {
    return (
      <main className="cci-loading-shell retailer-login-shell" aria-live="polite">
        <div className="cci-loading-mark retailer-brand-mark">S</div>
        <h1>Loading your market…</h1>
        <p>SCAN is calculating deterministic retailer metrics.</p>
      </main>
    )
  }

  const activeLabel = NAV_ITEMS.find((item) => item.id === activePage)?.label || 'Overview'
  return (
    <div className="cci-dashboard-shell retailer-dashboard-shell">
      <aside className="cci-sidebar retailer-sidebar">
        <div className="cci-brand inverted">
          <div className="cci-brand-mark retailer-brand-mark">S</div>
          <div><div className="cci-brand-name">SCAN</div><div className="cci-brand-subtitle">Retailer Intelligence</div></div>
        </div>
        <nav className="cci-nav" aria-label="Retailer analytics">
          {NAV_ITEMS.map((item) => (
            <button className={activePage === item.id ? 'active' : ''} key={item.id} onClick={() => setActivePage(item.id)} type="button">
              {item.label}
            </button>
          ))}
        </nav>
        <div className="cci-sidebar-footer"><span>Private retailer view</span><p>No customer or payment identifiers</p></div>
      </aside>
      <main className="cci-main">
        <header className="cci-topbar">
          <div><span className="cci-mobile-page">{activeLabel}</span><h1>{data.retailerName}</h1><p>Updated {formatDateTime(data.generatedAt)}</p></div>
          <div className="cci-topbar-actions">
            <label className="retailer-period-select">
              <span>Period</span>
              <select value={period} onChange={(event) => { setLoading(true); setError(''); setPeriod(event.target.value) }}>
                {PERIODS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <button className="cci-secondary-button" disabled={loading} onClick={refresh} type="button">{loading ? 'Refreshing…' : 'Refresh'}</button>
            <button className="cci-signout-button" onClick={() => { setCredentials(null); setData(null); setError(''); setPeriod('ALL_TIME'); setActivePage('overview') }} type="button">Sign out</button>
          </div>
        </header>
        <div className="cci-mobile-nav" aria-label="Retailer analytics sections">
          {NAV_ITEMS.map((item) => <button className={activePage === item.id ? 'active' : ''} key={item.id} onClick={() => setActivePage(item.id)} type="button">{item.label}</button>)}
        </div>
        {data.retailerCode === 'KAGGLE' ? <div className="cci-demo-notice"><strong>Technical demo dataset.</strong> Replace this with a retailer export for current market evidence.</div> : null}
        {error ? <div className="cci-inline-error" role="alert"><span>{error}</span><button type="button" onClick={refresh}>Retry</button></div> : null}
        <Page activePage={activePage} data={data} onNavigate={setActivePage} />
      </main>
    </div>
  )
}
