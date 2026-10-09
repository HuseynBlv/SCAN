import { useState } from 'react'
import { CCI_AUTH_ROUTE, RETAILER_AUTH_ROUTE } from './LandingNavigation'
import { HeroDashboardVisual, PerspectivePreview, TransactionFlowVisual } from './LandingVisuals'

function Arrow() {
  return <span aria-hidden="true">→</span>
}

export function HeroSection() {
  return (
    <section className="landing-hero landing-container" id="top">
      <div className="landing-hero-copy">
        <span className="landing-eyebrow"><i /> Retail intelligence, resolved</span>
        <h1>See what actually happens <em>inside the basket.</em></h1>
        <p className="landing-hero-lead">SCAN turns retail transactions into actionable intelligence for retailers and FMCG teams.</p>
        <div className="landing-hero-actions">
          <a className="landing-button landing-button-red" href="#transaction-intelligence">See how it works <Arrow /></a>
          <a className="landing-button landing-button-secondary" href={CCI_AUTH_ROUTE}>Sign in</a>
        </div>
        <p className="landing-proof-line">Transaction-level clarity <span /> No customer or payment identifiers</p>
      </div>
      <HeroDashboardVisual />
    </section>
  )
}

export function TransactionFlowSection() {
  return (
    <section className="transaction-section landing-section" id="transaction-intelligence">
      <div className="landing-container transaction-layout">
        <div className="landing-section-heading transaction-heading">
          <span className="landing-eyebrow">Transaction → Intelligence</span>
          <h2>From transactions<br /><em>to decisions.</em></h2>
          <p>Explore the basket to see how ordinary line items become signals a commercial team can act on.</p>
        </div>
        <TransactionFlowVisual />
      </div>
    </section>
  )
}

const perspectives = {
  retailer: {
    kicker: 'Retailer view',
    title: 'Understand your store.',
    copy: 'See what sells together, when demand shifts, and where the next store-level action is hiding.',
  },
  enterprise: {
    kicker: 'Enterprise view',
    title: 'Understand the market.',
    copy: 'Read basket behavior across products, occasions, locations, and connected retail environments.',
  },
}

export function PerspectivesSection() {
  const [active, setActive] = useState('retailer')
  const selected = perspectives[active]
  const ids = Object.keys(perspectives)

  function movePerspective(event, index) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
    event.preventDefault()
    let nextIndex
    if (event.key === 'Home') nextIndex = 0
    else if (event.key === 'End') nextIndex = ids.length - 1
    else nextIndex = (index + (event.key === 'ArrowRight' ? 1 : -1) + ids.length) % ids.length
    const next = ids[nextIndex]
    setActive(next)
    window.requestAnimationFrame(() => document.getElementById(`perspective-tab-${next}`)?.focus())
  }

  return (
    <section className="perspectives-section landing-section landing-dark" id="platform">
      <div className="landing-container perspectives-grid">
        <div className="perspectives-copy">
          <span className="landing-eyebrow">One intelligence layer</span>
          <h2>One platform.<br /><em>Two perspectives.</em></h2>
          <div className="perspective-tabs" role="tablist" aria-label="SCAN perspectives">
            {ids.map((id, index) => (
              <button
                aria-controls="perspective-panel"
                aria-selected={active === id}
                id={`perspective-tab-${id}`}
                key={id}
                onClick={() => setActive(id)}
                onKeyDown={(event) => movePerspective(event, index)}
                role="tab"
                tabIndex={active === id ? 0 : -1}
                type="button"
              >
                {id === 'retailer' ? 'Retailer' : 'Enterprise'}
              </button>
            ))}
          </div>
          <div aria-labelledby={`perspective-tab-${active}`} className="perspective-detail" id="perspective-panel" key={active} role="tabpanel">
            <span>{selected.kicker}</span>
            <h3>{selected.title}</h3>
            <p>{selected.copy}</p>
          </div>
        </div>
        <PerspectivePreview active={active} />
      </div>
    </section>
  )
}

const steps = [
  ['01', 'Connect', 'Bring in transactions from the store or POS.'],
  ['02', 'Analyze', 'SCAN resolves products, baskets, timing, and patterns.'],
  ['03', 'Act', 'Teams receive clear signals for the next decision.'],
]

export function HowItWorksSection() {
  return (
    <section className="how-section landing-section" id="how-it-works">
      <div className="landing-container how-layout">
        <div className="landing-section-heading how-heading">
          <span className="landing-eyebrow">How SCAN works</span>
          <h2>Connect. Analyze. Act.</h2>
        </div>
        <ol className="how-steps">
          {steps.map(([number, title, copy], index) => (
            <li key={number}>
              <span>{number}</span>
              <div><h3>{title}</h3><p>{copy}</p></div>
              {index < steps.length - 1 ? <i aria-hidden="true">→</i> : null}
            </li>
          ))}
        </ol>
        <div className="simple-flow" aria-label="Store or point of sale data flows through SCAN into insights">
          <span>STORE / POS</span><i aria-hidden="true" /><strong>SCAN</strong><i aria-hidden="true" /><span>INSIGHTS</span>
        </div>
      </div>
    </section>
  )
}

export function FinalCTA() {
  return (
    <section className="final-cta landing-dark" id="get-started">
      <div className="landing-container">
        <span className="landing-eyebrow">The signal is already there</span>
        <h2>Every transaction<br /><em>contains intelligence.</em></h2>
        <p>SCAN turns it into decisions.</p>
        <div>
          <a className="landing-button landing-button-red" href={RETAILER_AUTH_ROUTE}>Get started <Arrow /></a>
          <a className="landing-button landing-button-dark-outline" href={CCI_AUTH_ROUTE}>Sign in</a>
        </div>
      </div>
    </section>
  )
}

export function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-container">
        <a className="footer-wordmark" href="#top">SCAN<i><b /><b /><b /></i></a>
        <p>Retail intelligence powered by transaction data.</p>
        <nav aria-label="Footer navigation"><a href="#transaction-intelligence">Intelligence</a><a href="#platform">Perspectives</a><a href="#how-it-works">How it works</a><a href={CCI_AUTH_ROUTE}>Sign in</a></nav>
        <small>© {new Date().getFullYear()} SCAN</small>
      </div>
    </footer>
  )
}
