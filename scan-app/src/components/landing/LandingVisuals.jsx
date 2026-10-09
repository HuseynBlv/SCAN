import { useState } from 'react'

const affinityProducts = [
  { label: 'Coca-Cola 500ml', tone: 'red' },
  { label: 'Salty snacks', tone: 'dark' },
  { label: 'Sandwiches', tone: 'light' },
]

export function HeroDashboardVisual() {
  return (
    <div className="hero-visual" aria-label="Illustrative SCAN enterprise dashboard preview">
      <div className="hero-dashboard">
        <header>
          <div><span className="mock-logo">SCAN</span><small>Network overview</small></div>
          <span className="mock-live"><i /> Data connected</span>
        </header>
        <div className="hero-dashboard-body">
          <aside aria-hidden="true"><i className="active" /><i /><i /><i /><i /></aside>
          <div className="hero-dashboard-main">
            <div className="mock-heading"><div><span>CCI PERFORMANCE</span><strong>Basket intelligence</strong></div><small>Last 30 days</small></div>
            <div className="mock-kpis">
              <div><span>CCI baskets</span><strong>12,842</strong><small>Across connected stores</small></div>
              <div><span>Product mapping</span><strong>96.4%</strong><small>Transaction lines</small></div>
              <div><span>Active stores</span><strong>148</strong><small>Network coverage</small></div>
            </div>
            <div className="mock-chart-panel">
              <div className="mock-panel-title"><strong>Demand pattern</strong><span>Illustrative preview</span></div>
              <div className="mock-chart" aria-hidden="true">
                {[38, 52, 47, 65, 58, 74, 68, 83, 72, 88, 80, 94].map((height, index) => (
                  <i key={index} style={{ '--bar-height': `${height}%`, '--delay': `${index * 45}ms` }} />
                ))}
              </div>
              <div className="mock-axis"><span>08:00</span><span>12:00</span><span>16:00</span><span>20:00</span></div>
            </div>
          </div>
        </div>
      </div>
      <article className="hero-float-card hero-affinity-card">
        <span>Basket relationship</span>
        <strong>Coca-Cola 500ml + Chips</strong>
        <p>Affinity <b>↑ 28%</b></p>
      </article>
      <article className="hero-float-card hero-demand-card">
        <span>Evening demand</span>
        <strong>+17.4%</strong>
        <div className="mini-spark" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
      </article>
      <article className="hero-float-card hero-region-card">
        <span>Top district</span>
        <strong>Nərimanov</strong>
        <small>Highest basket activity</small>
      </article>
      <article className="hero-float-card hero-opportunity-card">
        <i aria-hidden="true">↗</i>
        <div><span>Promotion opportunity</span><strong>Bundle candidate</strong></div>
      </article>
      <p className="visual-disclaimer">Product preview · illustrative data</p>
    </div>
  )
}

export function TransactionFlowVisual() {
  return (
    <div className="transaction-flow" aria-label="An illustrative transaction transformed into retail intelligence">
      <article className="receipt-card">
        <header><span>POS / STORE</span><strong>Receipt #18429</strong></header>
        <div className="receipt-items">
          <p><span>Coca-Cola Zero 500ml</span><b>1</b></p>
          <p><span>Lay&apos;s Paprika</span><b>1</b></p>
          <p><span>Snickers</span><b>1</b></p>
        </div>
        <footer><span>3 products</span><span>18:42</span></footer>
      </article>
      <div className="processing-layer">
        <span className="processing-label">SCAN DATA LAYER</span>
        <div className="processing-line"><i /></div>
        <ol>
          {['Capture', 'Normalize', 'Categorize', 'Analyze'].map((item, index) => <li key={item}><b>{String(index + 1).padStart(2, '0')}</b>{item}</li>)}
        </ol>
      </div>
      <div className="flow-insights">
        <article><span>Basket affinity</span><strong>Coca-Cola + Chips</strong><b>3.2× more likely</b></article>
        <article><span>Occasion</span><strong>Evening snack</strong></article>
        <article><span>Opportunity</span><strong>Bundle candidate</strong></article>
      </div>
      <small className="transaction-disclaimer">Illustrative product preview</small>
    </div>
  )
}

function AffinityView() {
  return (
    <div className="affinity-view showcase-view-content">
      <div className="affinity-map">
        {affinityProducts.map((product, index) => (
          <div className={`affinity-node is-${product.tone} node-${index + 1}`} key={product.label}>
            <small>{index === 0 ? 'ANCHOR SKU' : `${index === 1 ? '3.2×' : '1.8×'} LIKELIHOOD`}</small>
            <strong>{product.label}</strong>
          </div>
        ))}
        <i className="affinity-link link-one" aria-hidden="true" />
        <i className="affinity-link link-two" aria-hidden="true" />
      </div>
      <div className="showcase-note"><span>Observed pattern</span><p>Customers buying Coca-Cola 500ml are more likely to purchase salty snacks.</p></div>
    </div>
  )
}

function ProductView() {
  const products = [
    ['Coca-Cola Zero 500ml', '+12.8%', 94],
    ['Fanta Orange 500ml', '+8.1%', 78],
    ['Sprite 500ml', '+3.6%', 62],
    ['Coca-Cola 330ml', '−2.4%', 48],
  ]
  return (
    <div className="rank-view showcase-view-content">
      <div className="rank-header"><span>Product</span><span>Movement</span></div>
      {products.map(([name, change, width], index) => (
        <div className="rank-row" key={name}>
          <b>{String(index + 1).padStart(2, '0')}</b><div><strong>{name}</strong><i style={{ width: `${width}%` }} /></div><span className={change.startsWith('−') ? 'is-down' : ''}>{change}</span>
        </div>
      ))}
    </div>
  )
}

function RegionalView() {
  const regions = [['Nərimanov', 92], ['Yasamal', 78], ['Nizami', 66], ['Xətai', 54], ['Səbail', 43]]
  return (
    <div className="regional-view showcase-view-content">
      <div className="district-grid" aria-hidden="true">{regions.map(([name, value]) => <i key={name} style={{ '--intensity': value / 100 }} />)}</div>
      <div className="district-list">
        {regions.map(([name, value], index) => <div key={name}><b>{String(index + 1).padStart(2, '0')}</b><span>{name}</span><strong>{value}</strong><small>index</small></div>)}
      </div>
    </div>
  )
}

function PromotionView() {
  const groups = [['Before', 46], ['During', 84], ['After', 62]]
  return (
    <div className="promotion-view showcase-view-content">
      <div className="campaign-bars">
        {groups.map(([label, height]) => <div key={label}><span>{height}</span><i style={{ height: `${height}%` }} /><b>{label}</b></div>)}
      </div>
      <div className="showcase-note"><span>Planned capability</span><p>This concept view would compare basket inclusion before, during, and after a defined promotion period.</p></div>
    </div>
  )
}

function DemandView() {
  const demand = [22, 27, 35, 43, 58, 76, 92, 88, 71, 54, 37, 26]
  return (
    <div className="demand-view showcase-view-content">
      <div className="demand-grid">
        {demand.map((value, index) => <div key={index}><i style={{ height: `${value}%` }} /><span>{index % 3 === 0 ? `${index + 9}:00` : ''}</span></div>)}
      </div>
      <div className="demand-callout"><span>Peak window</span><strong>15:00–18:00</strong><small>Highest observed basket activity</small></div>
    </div>
  )
}

export function IntelligenceShowcase() {
  const tabs = [
    { id: 'basket', label: 'Basket Intelligence', eyebrow: 'Relationship analysis', title: 'Find what belongs together.', view: <AffinityView /> },
    { id: 'product', label: 'Product Performance', eyebrow: 'SKU movement', title: 'See what is gaining attention.', view: <ProductView /> },
    { id: 'regional', label: 'Regional Insights', eyebrow: 'Location intelligence', title: 'Compare behavior by district.', view: <RegionalView /> },
    { id: 'promotion', label: 'Promotion Analytics', eyebrow: 'Planned capability', title: 'Plan what to measure.', view: <PromotionView /> },
    { id: 'demand', label: 'Demand Patterns', eyebrow: 'Time intelligence', title: 'Know when demand builds.', view: <DemandView /> },
  ]
  const [active, setActive] = useState(tabs[0].id)
  const selected = tabs.find((tab) => tab.id === active)

  function moveTabFocus(event, index) {
    const keyOffsets = { ArrowLeft: -1, ArrowRight: 1 }
    let nextIndex
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = tabs.length - 1
    else if (event.key in keyOffsets) nextIndex = (index + keyOffsets[event.key] + tabs.length) % tabs.length
    else return

    event.preventDefault()
    const nextTab = tabs[nextIndex]
    setActive(nextTab.id)
    window.requestAnimationFrame(() => document.getElementById(`showcase-tab-${nextTab.id}`)?.focus())
  }

  return (
    <section className="showcase-section landing-dark landing-section">
      <div className="landing-container">
        <div className="landing-section-heading showcase-heading"><span className="landing-eyebrow">SCAN intelligence</span><h2>From transactions<br /><em>to decisions.</em></h2><p>Explore the same retail data through different decision lenses.</p></div>
        <div className="showcase-shell">
          <div className="showcase-tabs" role="tablist" aria-label="Intelligence views">
            {tabs.map((tab, index) => (
              <button aria-controls={`showcase-panel-${tab.id}`} aria-label={tab.label} aria-selected={active === tab.id} id={`showcase-tab-${tab.id}`} key={tab.id} onClick={() => setActive(tab.id)} onKeyDown={(event) => moveTabFocus(event, index)} role="tab" tabIndex={active === tab.id ? 0 : -1} type="button">
                <span>{String(index + 1).padStart(2, '0')}</span>{tab.label}<i aria-hidden="true">→</i>
              </button>
            ))}
          </div>
          <div aria-labelledby={`showcase-tab-${selected.id}`} className="showcase-panel" id={`showcase-panel-${selected.id}`} key={selected.id} role="tabpanel">
            <header><div><span>{selected.eyebrow}</span><h3>{selected.title}</h3></div><small>Illustrative product preview</small></header>
            {selected.view}
          </div>
        </div>
      </div>
    </section>
  )
}

export function RetailerDashboardMockup() {
  return (
    <div className="retailer-mockup" aria-label="Illustrative SCAN retailer dashboard preview">
      <header><span><i /> SCAN</span><div><small>MY SHOP</small><b>Nərimanov Store</b></div><em>Connected</em></header>
      <div className="retailer-mock-body">
        <div className="retailer-summary">
          <span>GOOD MORNING</span><h3>Your store is connected to SCAN.</h3><p>Sales data was last processed 18 minutes ago.</p>
        </div>
        <div className="retailer-metrics">
          <div><span>Top product</span><strong>Coca-Cola 500ml</strong><small>Today</small></div>
          <div><span>Peak period</span><strong>17:00–19:00</strong><small>Today</small></div>
          <div><span>Needs attention</span><strong>3 products</strong><small>Slowing down</small></div>
        </div>
        <article className="retailer-recommendation"><span>RECOMMENDED ACTION</span><div><i>↗</i><div><strong>Prepare for evening demand</strong><p>Cold drinks and salty snacks rise together after 17:00.</p></div><b>View insight →</b></div></article>
      </div>
      <small className="mock-data-label">Illustrative product preview</small>
    </div>
  )
}
