import { useEffect, useMemo, useRef, useState } from 'react'
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
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'opportunities', label: 'Opportunities', icon: 'opportunities' },
  { id: 'explore', label: 'Explore', icon: 'explore' },
  { id: 'stores', label: 'Stores', icon: 'stores' },
  { id: 'ask', label: 'Ask SCAN', icon: 'ask' },
]

const EXPLORE_TABS = [
  { value: 'basket', label: 'Baskets' },
  { value: 'products', label: 'Products' },
  { value: 'time', label: 'Time' },
  { value: 'stores', label: 'Stores' },
]

const MIN_OPPORTUNITY_SUPPORT = 5

const integer = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const decimal = decimalFormatter()

function decimalFormatter() {
  return new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 1 })
}

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

function partitionInsights(data) {
  const opportunities = data.insights.filter((insight) => isActionableInsight(insight, data)).slice(0, 3)
  const signals = data.insights.filter((insight) => !isActionableInsight(insight, data))
  return { opportunities, signals }
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
          <span className="cci-eyebrow">CCI intelligence workspace</span>
          <h1 id="cci-login-title">From every basket to the next action.</h1>
          <p>Review retailer-approved aggregate evidence, separate meaningful opportunities from early signals, and decide what to test.</p>
        </div>
        <form className="cci-login-form" onSubmit={submit}>
          <label>Username<input autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} /></label>
          <label>Password<input autoComplete="current-password" required type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <p className="cci-login-context"><strong>Retailer access is assigned to this account.</strong> SCAN opens only approved aggregate data after sign-in.</p>
          {error ? <div className="cci-form-error" role="alert">{error}</div> : null}
          <button className="cci-primary-button" disabled={loading} type="submit">{loading ? 'Connecting…' : 'Open analytics'}</button>
        </form>
        <div className="portal-switch-links">
          <a className="portal-switch-link" href="/?portal=retailer">Retailer owner portal <span aria-hidden="true">→</span></a>
          <a className="portal-switch-link" href="/?portal=connection">Data connection <span aria-hidden="true">→</span></a>
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

function evidenceForInsight(insight, data) {
  const support = companionSupport(insight, data)
  if (support !== null) return `${integer.format(support)} CCI baskets support this relationship`
  if (insightType(insight) === 'Time') return `${integer.format(data.totalBaskets)} validated baskets in the time analysis`
  if (insightType(insight) === 'Data') return `${decimal.format(data.mappedLinePercentage)}% of transaction lines mapped`
  return data.stores.length
    ? `${integer.format(data.cciBaskets)} CCI baskets across ${integer.format(data.stores.length)} reporting stores`
    : `${integer.format(data.cciBaskets)} CCI baskets in the current aggregate`
}

function AskLauncher({ questions, onAsk }) {
  const [query, setQuery] = useState('')

  function submit(event) {
    event.preventDefault()
    onAsk(query)
  }

  return (
    <div className="cci-ask-launcher">
      <form onSubmit={submit}>
        <ScanIcon name="ask" size={21} />
        <label className="sr-only" htmlFor="cci-home-question">Ask about basket behavior</label>
        <input id="cci-home-question" onChange={(event) => setQuery(event.target.value)} placeholder="Ask about basket behavior…" value={query} />
        <button aria-label="Open Ask SCAN" type="submit"><ScanIcon name="chevron" size={18} /></button>
      </form>
      <div className="cci-suggestion-chips" aria-label="Suggested questions">
        {questions.slice(0, 3).map((item) => <button key={item.question} onClick={() => onAsk(item.question)} type="button">{item.question}</button>)}
      </div>
    </div>
  )
}

function TopOpportunities({ data, onNavigate }) {
  const { opportunities } = partitionInsights(data)
  return (
    <section className="cci-home-section">
      <header className="cci-home-section-heading">
        <div><span className="scan-eyebrow">Decision queue</span><h2>Top opportunities</h2></div>
        <button className="scan-text-link" onClick={() => onNavigate('opportunities')} type="button">View all <ScanIcon name="chevron" size={16} /></button>
      </header>
      {opportunities.length ? (
        <div className="cci-top-opportunity-list">
          {opportunities.map((insight, index) => (
              <article className="cci-top-opportunity" key={`${insight.fact}-${index}`}>
                <div className="cci-opportunity-rank">{String(index + 1).padStart(2, '0')}</div>
                <div className="cci-opportunity-summary">
                  <StatusBadge tone="red">{insightType(insight)} opportunity</StatusBadge>
                  <h3>{insight.fact}</h3>
                  <p>{insight.interpretation}</p>
                </div>
                <div className="cci-opportunity-action">
                  <span>Recommended action</span>
                  <strong>{insight.recommendedAction}</strong>
                  <button onClick={() => onNavigate('opportunities')} type="button">View evidence <ScanIcon name="chevron" size={15} /></button>
                </div>
              </article>
          ))}
        </div>
      ) : <EmptyState compact title="No action is supported yet">More mapped baskets are needed before SCAN can recommend a test.</EmptyState>}
    </section>
  )
}

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

function RecommendedActions({ data, onNavigate }) {
  const { opportunities } = partitionInsights(data)
  if (!opportunities.length) return null
  return (
    <section className="cci-home-section cci-next-actions">
      <header className="cci-home-section-heading"><div><span className="scan-eyebrow">Execution</span><h2>Recommended next actions</h2></div></header>
      <ol>{opportunities.map((insight, index) => <li key={`${insight.recommendedAction}-${index}`}><span>{index + 1}</span><div><strong>{insight.recommendedAction}</strong><small>{evidenceForInsight(insight, data)}</small></div><button aria-label={`View evidence for ${insight.recommendedAction}`} onClick={() => onNavigate('opportunities')} type="button"><ScanIcon name="chevron" size={18} /></button></li>)}</ol>
    </section>
  )
}

function Home({ data, onNavigate, onAsk }) {
  const { opportunities } = partitionInsights(data)
  const questions = buildQuestions(data)

  if (data.totalBaskets === 0) {
    return <section className="scan-panel"><EmptyState title="No transaction data imported yet">Import a validated retailer export for {data.retailerCode}. SCAN will not show derived intelligence until complete receipts are available.</EmptyState></section>
  }

  return (
    <div className="scan-page-stack cci-home">
      <section className="cci-discovery-hero">
        <span className="scan-eyebrow">Home</span>
        <h2>{opportunities.length ? `SCAN found ${opportunities.length} ${opportunities.length === 1 ? 'opportunity' : 'opportunities'}` : `SCAN analyzed ${integer.format(data.totalBaskets)} baskets`}</h2>
        <p>{integer.format(data.totalBaskets)} baskets analyzed <i>•</i> {integer.format(data.cciBaskets)} CCI baskets <i>•</i> {formatRelativeTime(data.generatedAt)}</p>
        {!opportunities.length ? <small>No commercial action meets the current evidence threshold.</small> : null}
        <AskLauncher onAsk={onAsk} questions={questions} />
      </section>
      <TopOpportunities data={data} onNavigate={onNavigate} />
      <MetricStrip label="CCI intelligence context" items={[
        { label: 'Baskets analyzed', value: integer.format(data.totalBaskets), note: 'Validated receipts' },
        { label: 'CCI penetration', value: `${decimal.format(data.cciPenetrationPercentage)}%`, note: 'Observed share of validated baskets' },
        { label: 'Average basket', value: formatMoney(data.averageBasketValue, data.currency), note: 'All validated baskets' },
        { label: 'Data health', value: `${decimal.format(data.mappedLinePercentage)}%`, note: 'Product mapping coverage' },
      ]} />
      <BasketDna data={data} />
      <div className="scan-two-column cci-home-bottom"><RecommendedActions data={data} onNavigate={onNavigate} /><DataTrust data={data} /></div>
    </div>
  )
}

function Opportunities({ data }) {
  const { opportunities, signals } = partitionInsights(data)
  const types = [...new Set(opportunities.map(insightType))]
  const [filter, setFilter] = useState('All')
  const filtered = filter === 'All' ? opportunities : opportunities.filter((insight) => insightType(insight) === filter)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selected = filtered[selectedIndex] || filtered[0]

  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="Opportunities" title="Actions worth testing." description="Recommendations are ranked with the evidence behind each one. Results still require a controlled test." aside={<StatusBadge tone="neutral">{opportunities.length} action-ready</StatusBadge>} />
      {opportunities.length ? (
        <>
          <div className="cci-opportunity-filters">
            <span>Filter by type</span>
            {['All', ...types].map((type) => <button aria-pressed={filter === type} className={filter === type ? 'is-active' : ''} key={type} onClick={() => { setFilter(type); setSelectedIndex(0) }} type="button">{type}</button>)}
          </div>
          <div className="cci-opportunity-workbench">
            <section className="cci-ranked-feed" aria-label="Ranked opportunities">
              {filtered.map((insight, index) => (
                <button aria-pressed={selected === insight} className={selected === insight ? 'is-selected' : ''} key={`${insight.fact}-${index}`} onClick={() => setSelectedIndex(index)} type="button">
                  <span className="cci-feed-rank">{String(index + 1).padStart(2, '0')}</span>
                  <span className="cci-feed-copy"><StatusBadge tone="red">{insightType(insight)}</StatusBadge><strong>{insight.fact}</strong><small>{evidenceForInsight(insight, data)}</small></span>
                  <ScanIcon name="chevron" size={18} />
                </button>
              ))}
            </section>
            {selected ? (
              <aside className="cci-evidence-inspector">
                <header><StatusBadge tone="red">{insightType(selected)} opportunity</StatusBadge><span>Rank {String(selectedIndex + 1).padStart(2, '0')}</span></header>
                <h2>{selected.fact}</h2>
                <div><span>Why it matters</span><p>{selected.interpretation}</p></div>
                <div className="cci-inspector-action"><span>Recommended action</span><strong>{selected.recommendedAction}</strong></div>
                <dl><div><dt>Evidence</dt><dd>{evidenceForInsight(selected, data)}</dd></div><div><dt>Product mapping</dt><dd>{decimal.format(data.mappedLinePercentage)}%</dd></div></dl>
                <small>Observed relationship. Validate through a controlled commercial test.</small>
              </aside>
            ) : null}
          </div>
        </>
      ) : <section className="scan-panel"><EmptyState title="No action-ready opportunities">Current analytics do not support a commercial action. Signals remain available below.</EmptyState></section>}
      {signals.length ? (
        <section className="scan-page-stack">
          <header className="scan-subsection-heading"><div><span className="scan-eyebrow">Observed signals</span><h3>Keep watching. Do not act yet.</h3></div><p>These patterns need more evidence or better product mapping.</p></header>
          <div className="scan-opportunity-grid">{signals.map((insight, index) => <OpportunityCard evidence={evidenceForInsight(insight, data)} index={index} insight={insight} key={`${insight.fact}-${index}`} signal />)}</div>
        </section>
      ) : null}
    </div>
  )
}

function BasketExplore({ data }) {
  return (
    <div className="scan-page-stack">
      <div className="scan-two-column">
        <ChartPanel title="Which products appear most often with CCI?" description="Share of CCI baskets containing each product · Attachment rate"><CompanionChart data={data.topCompanionProducts} nameKey="name" label="Companion product attachment rates" /></ChartPanel>
        <ChartPanel title="Which categories appear most often with CCI?" description="Share of CCI baskets containing each category · Attachment rate"><CompanionChart data={data.topCompanionCategories} nameKey="category" label="Companion category attachment rates" /></ChartPanel>
      </div>
      <div className="scan-two-column">
        <section className="scan-panel"><header className="scan-panel-header"><div><h3>Companion product detail</h3><p>Counts and denominators remain visible for validation</p></div></header><MetricTable columns={['Product', 'CCI baskets', 'Attachment rate']} empty="No companion products are available." rows={data.topCompanionProducts.map((item) => [item.name, integer.format(item.basketCount), `${decimal.format(item.attachmentRatePercentage)}%`])} /></section>
        <section className="scan-panel"><header className="scan-panel-header"><div><h3>Companion category detail</h3><p>Category evidence from the same mapped CCI baskets</p></div></header><MetricTable columns={['Category', 'CCI baskets', 'Attachment rate']} empty="No companion categories are available." rows={data.topCompanionCategories.map((item) => [item.category, integer.format(item.basketCount), `${decimal.format(item.attachmentRatePercentage)}%`])} /></section>
      </div>
    </div>
  )
}

function ProductExplore({ data }) {
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

function TimeExplore({ data }) {
  return <div className="scan-two-column"><section className="scan-panel"><header className="scan-panel-header"><div><h3>When does basket activity peak?</h3><p>Daypart share · Retailer profile timezone</p></div></header><SegmentList data={data.dayparts} /></section><section className="scan-panel"><header className="scan-panel-header"><div><h3>How does weekday activity compare?</h3><p>Share of validated baskets</p></div></header><SegmentList data={data.weekdayWeekend} /></section></div>
}

function StoreTable({ data }) {
  return <MetricTable columns={['Store', 'Baskets', 'CCI baskets', 'CCI penetration', 'Average basket']} empty="No store-level aggregates are available." rows={data.stores.map((store) => [store.storeId, integer.format(store.basketCount), integer.format(store.cciBasketCount), `${decimal.format(store.cciPenetrationPercentage)}%`, formatMoney(store.averageBasketValue, data.currency)])} />
}

function StoreExplore({ data }) {
  return <section className="scan-panel"><header className="scan-panel-header"><div><h3>Which stores contribute the most basket evidence?</h3><p>Descriptive store comparison from the current dataset</p></div></header><StoreTable data={data} /></section>
}

function Explore({ data }) {
  const [tab, setTab] = useState('basket')
  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="Explore" title="Explore the evidence." description="Review the basket, product, time, and store patterns behind SCAN's findings." aside={<SegmentedControl label="Explore analytics" onChange={setTab} options={EXPLORE_TABS} value={tab} />} />
      {tab === 'products' ? <ProductExplore data={data} /> : tab === 'time' ? <TimeExplore data={data} /> : tab === 'stores' ? <StoreExplore data={data} /> : <BasketExplore data={data} />}
    </div>
  )
}

function Stores({ data }) {
  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="Stores" title="Where the evidence comes from." description="See which stores contributed to the current analysis." aside={<StatusBadge tone="neutral">{integer.format(data.stores.length)} reporting</StatusBadge>} />
      <MetricStrip label="Store reporting summary" items={[
        { label: 'Reporting stores', value: integer.format(data.stores.length), note: 'Present in this dataset' },
        { label: 'Transaction volume', value: integer.format(data.totalBaskets), note: 'Validated baskets' },
        { label: 'CCI penetration', value: `${decimal.format(data.cciPenetrationPercentage)}%`, note: 'Across reporting stores' },
        { label: 'Data health', value: `${decimal.format(data.mappedLinePercentage)}%`, note: 'Product mapping coverage' },
      ]} />
      <section className="scan-panel"><header className="scan-panel-header"><div><h3>Store overview</h3><p>{formatRelativeTime(data.generatedAt)} · Store-specific update times are not available</p></div></header><StoreTable data={data} /></section>
    </div>
  )
}

function buildQuestions(data) {
  const category = data.topCompanionCategories[0]
  const daypart = [...data.dayparts].sort((a, b) => b.basketCount - a.basketCount)[0]
  const store = [...data.stores].sort((a, b) => b.cciPenetrationPercentage - a.cciPenetrationPercentage)[0]
  const product = [...data.cciSkuPerformance].sort((a, b) => b.basketCount - a.basketCount)[0]
  const bundleInsight = data.insights.find((insight) => insightType(insight) === 'Bundle' && isActionableInsight(insight, data))
  const timeInsight = data.insights.find((insight) => insightType(insight) === 'Time' && isActionableInsight(insight, data))
  const dataInsight = data.insights.find((insight) => insightType(insight) === 'Data')
  return [
    category ? { question: 'What appears most often with CCI products?', answer: `${category.category} is the leading companion category at ${decimal.format(category.attachmentRatePercentage)}%.`, evidence: `${integer.format(category.basketCount)} of ${integer.format(data.cciBaskets)} mapped CCI baskets contain this category.`, action: bundleInsight?.recommendedAction || null, filters: 'All imported baskets · All reporting stores · Companion categories', destination: 'explore' } : null,
    daypart ? { question: 'When is basket activity highest?', answer: `${humanize(daypart.segment)} has the largest observed basket share at ${decimal.format(daypart.sharePercentage)}%.`, evidence: `${integer.format(daypart.basketCount)} of ${integer.format(data.totalBaskets)} validated baskets occurred in this daypart.`, action: timeInsight?.recommendedAction || null, filters: 'All imported baskets · Retailer profile timezone', destination: 'explore' } : null,
    product ? { question: 'Which CCI product drives the most baskets?', answer: `${product.product} appears in the most baskets among mapped CCI products.`, evidence: `${integer.format(product.basketCount)} baskets · ${decimal.format(product.quantity)} units · ${formatMoney(product.revenue, data.currency)} recorded revenue.`, action: null, filters: 'Mapped CCI products · All imported baskets', destination: 'explore' } : null,
    store ? { question: 'Which store has the highest CCI penetration?', answer: `${store.storeId} has the highest observed CCI penetration at ${decimal.format(store.cciPenetrationPercentage)}%.`, evidence: `${integer.format(store.cciBasketCount)} of ${integer.format(store.basketCount)} baskets in this store contained a mapped CCI product.`, action: null, filters: 'All reporting stores · All imported baskets', destination: 'stores' } : null,
    { question: 'Is product mapping sufficient?', answer: `${decimal.format(data.mappedLinePercentage)}% of imported transaction lines are mapped to normalized products.`, evidence: data.mappedLinePercentage >= 90 ? 'Current coverage supports normalized-product analysis.' : 'Unmapped products may understate CCI and companion results.', action: dataInsight?.recommendedAction || null, filters: 'All imported transaction lines', destination: 'home' },
  ].filter(Boolean)
}

function AskScan({ data, initialQuery, onNavigate }) {
  const questions = useMemo(() => buildQuestions(data), [data])
  const [query, setQuery] = useState(initialQuery || '')
  const [answer, setAnswer] = useState(() => questions.find((item) => item.question.toLowerCase() === initialQuery?.trim().toLowerCase()) || null)
  const matches = questions.filter((item) => item.question.toLowerCase().includes(query.toLowerCase()))

  function submit(event) {
    event.preventDefault()
    const exact = questions.find((item) => item.question.toLowerCase() === query.trim().toLowerCase())
    setAnswer(exact || { question: query || 'Question', answer: 'The current data cannot answer this question.', evidence: 'Choose one of the available questions below.', action: null, filters: 'No matching analysis', destination: null })
  }

  return (
    <div className="scan-page-stack">
      <PageIntro eyebrow="Ask SCAN" title="Ask only what the data can answer." description="Answers use the current retailer data and the analysis already available in SCAN." />
      <section className="scan-ask-shell">
        <form onSubmit={submit}><ScanIcon name="ask" /><label className="sr-only" htmlFor="scan-question">Question</label><input id="scan-question" onChange={(event) => setQuery(event.target.value)} placeholder="Search available questions…" value={query} /><button className="scan-button scan-button-dark" type="submit">Ask</button></form>
        <div className="scan-question-list">{matches.map((item) => <button key={item.question} onClick={() => { setQuery(item.question); setAnswer(item) }} type="button"><span>{item.question}</span><ScanIcon name="chevron" size={17} /></button>)}</div>
      </section>
      {answer ? (
        <section className="scan-answer cci-structured-answer" aria-live="polite">
          <StatusBadge tone="neutral">From current data</StatusBadge>
          <div className="cci-answer-block"><span>Answer</span><h3>{answer.answer}</h3></div>
          <div className="cci-answer-grid">
            <div><span>Evidence</span><p>{answer.evidence}</p></div>
            <div><span>Recommended action</span><p>{answer.action || 'No action is supported by this response alone.'}</p></div>
            <div><span>Relevant filters</span><p>{answer.filters}</p></div>
          </div>
          {answer.destination ? <button className="scan-button scan-button-dark" onClick={() => onNavigate(answer.destination)} type="button">Open underlying evidence <ScanIcon name="chevron" size={16} /></button> : null}
        </section>
      ) : null}
    </div>
  )
}

function DashboardPage({ activePage, askQuestion, data, onAsk, onNavigate }) {
  if (data.totalBaskets === 0) return <Home data={data} onAsk={onAsk} onNavigate={onNavigate} />
  if (activePage === 'opportunities') return <Opportunities data={data} />
  if (activePage === 'explore') return <Explore data={data} />
  if (activePage === 'stores') return <Stores data={data} />
  if (activePage === 'ask') return <AskScan data={data} initialQuery={askQuestion} key={askQuestion || 'blank'} onNavigate={onNavigate} />
  return <Home data={data} onAsk={onAsk} onNavigate={onNavigate} />
}

export default function CciDashboard() {
  const [credentials, setCredentials] = useState(null)
  const [retailerOptions, setRetailerOptions] = useState([])
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [activePage, setActivePage] = useState('home')
  const [askQuestion, setAskQuestion] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const layoutRef = useRef(null)
  const retailerMenuRef = useRef(null)

  usePretextLayout(layoutRef, `${activePage}:${data?.generatedAt || 'login'}`)

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
    return () => controller.abort()
  }, [credentials, refreshKey])

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
  function signOut() { setCredentials(null); setRetailerOptions([]); setData(null); setError(''); setLoading(false); setActivePage('home'); setAskQuestion('') }
  function openAsk(question) { setAskQuestion(question.trim()); setActivePage('ask') }

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
              <details className="cci-user-menu"><summary aria-label="CCI workspace menu">CCI</summary><div><strong>CCI Sales & Marketing</strong><small>Aggregate intelligence workspace</small><button aria-label="Sign out from user menu" onClick={signOut} type="button"><ScanIcon name="signout" size={16} />Sign out</button></div></details>
          </>
        )}
        eyebrow="CCI commercial intelligence"
        meta={<p>{credentials.retailerCode === 'KAGGLE' ? 'Demo retailer' : data.retailerName} · {data.retailerCode}</p>}
        title="SCAN intelligence workspace"
      />
      {error ? <div className="scan-inline-notice scan-inline-error" role="alert"><span>{error}</span><button className="scan-button scan-button-light" type="button" onClick={refresh}>Retry</button></div> : null}
    </>
  )

  return (
    <div ref={layoutRef}>
      <WorkspaceShell activePage={activePage} accountLabel="CCI Sales & Marketing" accountMeta="Aggregate intelligence" brandSubtitle="CCI Intelligence" disableNavigation={data.totalBaskets === 0} header={header} navItems={NAV_ITEMS} onNavigate={setActivePage} onSignOut={signOut} privacyLabel="No customer or payment identifiers" portal="cci">
        <DashboardPage activePage={activePage} askQuestion={askQuestion} data={data} onAsk={openAsk} onNavigate={setActivePage} />
      </WorkspaceShell>
    </div>
  )
}
