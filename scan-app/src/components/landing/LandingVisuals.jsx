import { useState } from 'react'

export function HeroDashboardVisual() {
  return (
    <div className="hero-visual" aria-label="Illustrative SCAN dashboard preview">
      <div className="hero-dashboard">
        <header>
          <div><span className="mock-logo">SCAN</span><small>Intelligence overview</small></div>
          <span className="mock-live"><i /> Live network</span>
        </header>
        <div className="hero-dashboard-body">
          <aside aria-hidden="true"><i className="active" /><i /><i /><i /></aside>
          <div className="hero-dashboard-main">
            <div className="mock-heading"><div><span>BASKET SIGNAL</span><strong>Evening occasion</strong></div><small>Last 30 days</small></div>
            <div className="mock-kpis">
              <div><span>Affinity lift</span><strong>3.2×</strong><small>Coke + salty snacks</small></div>
              <div><span>Peak window</span><strong>18–21</strong><small>Highest basket activity</small></div>
              <div><span>Coverage</span><strong>148</strong><small>Connected stores</small></div>
            </div>
            <div className="mock-chart-panel">
              <div className="mock-panel-title"><strong>Basket activity</strong><span>Illustrative</span></div>
              <svg aria-hidden="true" className="mock-line-chart" preserveAspectRatio="none" viewBox="0 0 600 150">
                <path className="chart-grid" d="M0 30H600M0 75H600M0 120H600" />
                <path className="chart-area" d="M0 128 C55 121 82 106 125 110 S204 91 250 96 S330 62 376 70 S447 38 492 48 S555 19 600 25 V150 H0Z" />
                <path className="chart-line" d="M0 128 C55 121 82 106 125 110 S204 91 250 96 S330 62 376 70 S447 38 492 48 S555 19 600 25" />
              </svg>
              <div className="mock-axis"><span>09:00</span><span>13:00</span><span>17:00</span><span>21:00</span></div>
            </div>
          </div>
        </div>
      </div>
      <article className="hero-float-card hero-affinity-card"><span>Basket relationship</span><strong>Coca-Cola + Chips</strong><p>Affinity <b>↑ 28%</b></p></article>
      <article className="hero-float-card hero-opportunity-card"><i aria-hidden="true">↗</i><div><span>Opportunity detected</span><strong>Evening bundle</strong></div></article>
      <article className="hero-float-card hero-region-card"><span>Strongest signal</span><strong>Nərimanov</strong><small>Highest basket activity</small></article>
      <p className="visual-disclaimer">Illustrative product preview</p>
    </div>
  )
}

const basketItems = [
  { id: 'affinity', short: 'CC', name: 'Coca-Cola', detail: '500 ml' },
  { id: 'bundle', short: 'CH', name: 'Chips', detail: 'Paprika' },
  { id: 'occasion', short: 'SW', name: 'Sandwich', detail: 'Chicken' },
]

const insights = [
  { id: 'affinity', label: 'Basket affinity', value: 'Coke + Chips', meta: '3.2× more likely' },
  { id: 'occasion', label: 'Peak occasion', value: 'Evening meal', meta: '18:00–21:00' },
  { id: 'bundle', label: 'Bundle opportunity', value: 'Drink + snack', meta: 'Candidate signal' },
]

export function TransactionFlowVisual() {
  const [active, setActive] = useState(null)

  return (
    <div className={`transaction-flow ${active ? 'has-active-flow' : ''}`} aria-label="An illustrative transaction transformed into retail intelligence" onMouseLeave={() => setActive(null)}>
      <article className="receipt-card">
        <header><span>RECEIPT / POS</span><strong>#18429</strong></header>
        <div className="receipt-items">
          {basketItems.map((item) => (
            <button
              aria-label={`${item.name}, ${item.detail}; highlight related insight`}
              aria-pressed={active === item.id}
              className={active === item.id ? 'is-active' : ''}
              key={item.id}
              onBlur={() => setActive(null)}
              onFocus={() => setActive(item.id)}
              onMouseEnter={() => setActive(item.id)}
              type="button"
            >
              <i>{item.short}</i><span><strong>{item.name}</strong><small>{item.detail}</small></span><b>1</b>
            </button>
          ))}
        </div>
        <footer><span>3 products</span><span>18:42</span></footer>
      </article>

      <div className="scan-processor" aria-label="SCAN processes the transaction">
        <span>Normalize</span><div><i /><strong>SCAN</strong><i /></div><span>Analyze</span>
      </div>

      <div className="flow-insights">
        {insights.map((insight) => (
          <button
            aria-label={`${insight.label}: ${insight.value}; highlight related basket item`}
            aria-pressed={active === insight.id}
            className={active === insight.id ? 'is-active' : ''}
            key={insight.id}
            onBlur={() => setActive(null)}
            onFocus={() => setActive(insight.id)}
            onMouseEnter={() => setActive(insight.id)}
            type="button"
          >
            <span>{insight.label}</span><strong>{insight.value}</strong><small>{insight.meta}</small>
          </button>
        ))}
      </div>
      <small className="transaction-disclaimer">Hover or focus an item to trace its signal · illustrative data</small>
    </div>
  )
}

export function PerspectivePreview({ active }) {
  const retailer = active === 'retailer'
  return (
    <div className="perspective-preview" key={active} aria-label={`${retailer ? 'Retailer' : 'Enterprise'} intelligence preview`}>
      <header><span>{retailer ? 'STORE 014' : 'MARKET NETWORK'}</span><small>Illustrative</small></header>
      <div className="preview-focus">
        <span>{retailer ? 'Today’s signal' : 'Cross-market signal'}</span>
        <strong>{retailer ? 'Lunch baskets are shifting later.' : 'Convenience occasions lead growth.'}</strong>
      </div>
      <div className="preview-rows">
        {(retailer
          ? [['Peak window', '13:00–15:00'], ['Fastest mover', 'Cold drinks'], ['Action', 'Rebalance display']]
          : [['Top occasion', 'On-the-go'], ['Strongest affinity', 'Drink + snack'], ['Opportunity', 'Regional bundle']]
        ).map(([label, value], index) => <div key={label}><i style={{ '--row-delay': `${index * 70}ms` }} /><span>{label}</span><strong>{value}</strong></div>)}
      </div>
    </div>
  )
}
