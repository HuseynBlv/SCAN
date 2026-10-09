import { CCI_AUTH_ROUTE, RETAILER_AUTH_ROUTE } from './LandingNavigation'
import { HeroDashboardVisual, RetailerDashboardMockup, TransactionFlowVisual } from './LandingVisuals'

function Arrow() {
  return <span aria-hidden="true">→</span>
}

export function HeroSection() {
  return (
    <section className="landing-hero landing-container" id="top">
      <div className="landing-hero-copy">
        <span className="landing-eyebrow"><i /> The retail intelligence layer</span>
        <h1>See what actually happens <em>inside the basket.</em></h1>
        <p className="landing-hero-lead">SCAN turns transaction data into actionable intelligence for retailers and FMCG teams.</p>
        <p className="landing-hero-support">Understand what sells together, when demand changes, where promotion tests may be useful, and how consumer behavior differs across locations — from one intelligence platform.</p>
        <div className="landing-hero-actions">
          <a className="landing-button landing-button-red" href="#platform">Explore SCAN <Arrow /></a>
          <a className="landing-button landing-button-secondary" href={CCI_AUTH_ROUTE}>Sign in</a>
        </div>
        <div className="landing-proof-line"><span>Built for transaction-level clarity</span><span>No customer or payment identifiers</span></div>
      </div>
      <HeroDashboardVisual />
    </section>
  )
}

export function TransactionFlowSection() {
  return (
    <section className="transaction-section landing-section">
      <div className="landing-container">
        <div className="landing-section-heading transaction-heading">
          <span className="landing-eyebrow">Every transaction contains a story.</span>
          <h2>One transaction is data.<br /><em>Thousands become intelligence.</em></h2>
        </div>
        <TransactionFlowVisual />
      </div>
    </section>
  )
}

const audiences = [
  {
    id: 'retailers', label: 'For Retailers', title: 'Run your store with better information.',
    features: ['Sales overview', 'Top products', 'Slow movers', 'Peak hours', 'Store performance', 'Operational insights'],
    href: '#retailers', cta: 'Explore Retailer', index: '01',
  },
  {
    id: 'enterprise', label: 'For CCI & Enterprise', title: 'Understand the market beyond your own sales.',
    features: ['Basket composition', 'Cross-category affinity', 'SKU performance', 'Regional behavior', 'Promotion analysis · Planned', 'Market opportunities'],
    href: '#enterprise', cta: 'Explore Enterprise', index: '02',
  },
]

export function AudienceSection() {
  return (
    <section className="audience-section landing-section" id="platform">
      <div className="landing-container">
        <div className="landing-section-heading audience-heading"><span className="landing-eyebrow">One intelligence layer</span><h2>One platform.<br /><em>Built for every side of retail.</em></h2></div>
        <div className="audience-grid">
          {audiences.map((audience) => (
            <article className={`audience-card audience-${audience.id}`} key={audience.id}>
              <header><span>{audience.label}</span><b>{audience.index}</b></header>
              <h3>{audience.title}</h3>
              <ul>{audience.features.map((feature) => <li key={feature}><i />{feature}</li>)}</ul>
              <a href={audience.href}>{audience.cta} <Arrow /></a>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}

const steps = [
  ['01', 'Connect', 'Connect POS data or capture transactions.'],
  ['02', 'Structure', 'SCAN standardizes products, categories, receipts and stores.'],
  ['03', 'Understand', 'Basket patterns and consumer behavior are analyzed.'],
  ['04', 'Act', 'Retailers and enterprise teams receive actionable insights.'],
]

export function HowItWorksSection() {
  return (
    <section className="how-section landing-section" id="how-it-works">
      <div className="landing-container">
        <div className="landing-section-heading how-heading"><span className="landing-eyebrow">A disciplined data path</span><h2>How SCAN works</h2><p>From existing checkout data to decision-ready intelligence.</p></div>
        <ol className="how-steps">{steps.map(([number, title, copy]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol>
        <div className="architecture-flow" aria-label="SCAN data architecture flow">
          {['POS / STORE', 'SCAN DATA LAYER', 'INTELLIGENCE ENGINE', 'RETAILER / ENTERPRISE'].map((item, index) => <div key={item}><span>{item}</span>{index < 3 ? <i aria-hidden="true"><b /></i> : null}</div>)}
        </div>
      </div>
    </section>
  )
}

const retailerFeatures = [
  ['Know what sells', 'Identify top products and categories.'],
  ['Know when it sells', 'Understand peak hours and demand patterns.'],
  ['Know what is slowing down', 'Spot weak or declining products.'],
  ['Make better decisions', 'Get useful signals instead of raw transaction data.'],
]

export function RetailerSection() {
  return (
    <section className="retailer-section landing-section" id="retailers">
      <div className="landing-container">
        <div className="retailer-intro"><span className="landing-eyebrow">For retailers</span><h2>Your sales.<br /><em>Finally understandable.</em></h2><p>SCAN turns everyday store transactions into a clear view of what is selling, when demand changes, and where action is needed.</p></div>
        <RetailerDashboardMockup />
        <div className="retailer-feature-grid">{retailerFeatures.map(([title, copy], index) => <article key={title}><span>{String(index + 1).padStart(2, '0')}</span><h3>{title}</h3><p>{copy}</p></article>)}</div>
        <a className="landing-button landing-button-dark retailer-cta" href={RETAILER_AUTH_ROUTE}>Get started as a retailer <Arrow /></a>
      </div>
    </section>
  )
}

const enterpriseCapabilities = ['Basket Affinity', 'Trade Marketing', 'SKU Performance', 'Geographic Intelligence', 'Promotion Analysis · Planned', 'Channel Analytics']

export function EnterpriseSection() {
  return (
    <section className="enterprise-section landing-dark landing-section" id="enterprise">
      <div className="landing-container">
        <div className="enterprise-grid">
          <div className="enterprise-copy"><span className="landing-eyebrow">For CCI & Enterprise</span><h2>See beyond<br /><em>sell-in.</em></h2><p>Understand what happens after the product reaches the store.</p><a className="landing-button landing-button-light" href={CCI_AUTH_ROUTE}>Request enterprise access <Arrow /></a></div>
          <div className="enterprise-visual" aria-label="SCAN reveals basket composition after shipment">
            <div className="shipment-row"><span>SHIPMENT DATA</span><div><i>CC</i><b>Coca-Cola</b></div><em>→</em><div><i className="store-icon">▦</i><b>Store</b></div></div>
            <div className="reveal-line"><span>SCAN REVEALS THE BASKET</span><i /></div>
            <div className="basket-reveal"><div><i>CC</i><span>Coca-Cola</span></div><b>+</b><div><i className="chips-icon">CH</i><span>Chips</span></div><b>+</b><div><i className="sandwich-icon">SW</i><span>Sandwich</span></div></div>
          </div>
        </div>
        <div className="enterprise-capabilities">{enterpriseCapabilities.map((item, index) => <div key={item}><span>{String(index + 1).padStart(2, '0')}</span><strong>{item}</strong></div>)}</div>
      </div>
    </section>
  )
}

export function CapabilityStrip() {
  const capabilities = ['Basket-level intelligence', 'Store-level analytics', 'SKU-level insights', 'Cross-category analysis', 'Regional behavior', 'Promotion analysis · Planned']
  return <section className="capability-strip" aria-label="Platform capabilities"><div className="landing-container">{capabilities.map((item) => <span key={item}>{item}</span>)}</div></section>
}

export function FinalCTA() {
  return (
    <section className="final-cta landing-dark">
      <div className="landing-container"><span className="landing-eyebrow">The signal is already there</span><h2>Every transaction<br /><em>contains intelligence.</em></h2><p>SCAN helps retailers understand their stores and helps enterprise teams understand the market.</p><div><a className="landing-button landing-button-red" href={RETAILER_AUTH_ROUTE}>Get started <Arrow /></a><a className="landing-button landing-button-dark-outline" href={CCI_AUTH_ROUTE}>Sign in</a></div></div>
    </section>
  )
}

export function LandingFooter() {
  return (
    <footer className="landing-footer"><div className="landing-container"><div><a className="footer-wordmark" href="#top">SCAN<i><b /><b /><b /></i></a><p>Retail intelligence powered by transaction data.</p></div><nav aria-label="Footer navigation"><a href="#platform">Platform</a><a href="#retailers">Retailers</a><a href="#enterprise">Enterprise</a><a href={CCI_AUTH_ROUTE}>Sign in</a></nav><small>© {new Date().getFullYear()} SCAN</small></div></footer>
  )
}
