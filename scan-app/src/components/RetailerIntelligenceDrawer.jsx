import { useEffect, useRef, useState } from 'react'
import ScanIcon from './ScanIcon'
import { Badge, MiniChart } from './RetailerUI'

const STORE_SUGGESTIONS = [
  'What changed today?',
  'What needs attention?',
  'What should I do before the weekend?',
  'Why is average basket up?',
]

const CONTEXT_SUGGESTIONS = {
  product: ['Why is it growing?', 'What is it bought with?', 'How does it compare?'],
  action: ['Why this action?', 'How urgent is it?', 'What evidence supports it?'],
  opportunity: ['Why this opportunity?', 'What is the expected value?', 'How should I activate it?'],
}

const formatInteger = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

function storeReport(question) {
  const normalized = question.toLowerCase()
  if (normalized.includes('weekend')) {
    return {
      eyebrow: 'Weekend readiness',
      title: 'Three moves before Friday evening',
      summary: 'The strongest gains come from availability and one focused basket test.',
      actionLabel: 'Review priority action',
      actionTarget: 'actions',
      items: [
        { label: 'Coca-Cola Zero', metric: 'Check stock', comparison: 'before 17:00 Friday', explanation: 'Velocity is running 23% above baseline.', tone: 'red', values: [14, 15, 16, 18, 19, 21] },
        { label: 'Coca-Cola + Doritos', metric: 'Test placement', comparison: 'Friday–Sunday', explanation: '184 high-fit baskets are missing one of the pair.', tone: 'dark', values: [18, 21, 20, 25, 27, 31] },
        { label: 'Evening handover', metric: 'Protect cooler', comparison: '18:00–21:00', explanation: 'Evening basket value is outperforming the daily average.', tone: 'red', values: [8, 9, 9, 11, 12, 14] },
      ],
    }
  }
  if (normalized.includes('average basket')) {
    return {
      eyebrow: 'Basket analysis',
      title: 'Average basket is up 5.3%',
      summary: 'The lift is concentrated in evening trips with beverages and snacks.',
      actionLabel: 'Open store insights',
      actionTarget: 'insights',
      items: [
        { label: 'Current average', metric: '₼9.12', comparison: '+5.3% vs last Tuesday', explanation: 'The increase is broad enough to be material.', tone: 'red', values: [8.24, 8.39, 8.36, 8.58, 8.77, 9.12] },
        { label: 'Evening contribution', metric: '+8.4%', comparison: 'after 18:00', explanation: 'Beverage-led baskets explain most of the gain.', tone: 'dark', values: [6, 7, 7, 8, 10, 12] },
      ],
    }
  }
  if (normalized.includes('attention')) {
    return {
      eyebrow: 'Priority review',
      title: 'One action needs attention now',
      summary: 'Coca-Cola Zero availability carries the clearest near-term risk.',
      actionLabel: 'Review priority action',
      actionTarget: 'actions',
      items: [
        { label: 'Stock risk', metric: 'High', comparison: 'before Friday evening', explanation: 'Demand is 23% above its four-week baseline.', tone: 'red', values: [14, 15, 16, 18, 19, 21] },
        { label: 'Basket opportunity', metric: '184', comparison: 'high-fit missed baskets', explanation: 'A weekend checkout test can capture the gap.', tone: 'dark', values: [22, 24, 23, 26, 29, 31] },
      ],
    }
  }
  return {
    eyebrow: 'Today’s change report',
    title: 'Three material changes',
    summary: 'These movements are outside the store’s recent operating baseline.',
    actionLabel: 'Review priority action',
    actionTarget: 'actions',
    items: [
      { label: 'Coca-Cola Zero', metric: '+23%', comparison: 'vs baseline', explanation: 'Most of the increase occurred between 18:00–21:00.', tone: 'red', values: [14, 15, 16, 18, 19, 21] },
      { label: 'Doritos attachment', metric: '31% → 24%', comparison: 'Coca-Cola baskets', explanation: 'The decline is concentrated in Coca-Cola baskets.', tone: 'dark', values: [31, 30, 29, 27, 26, 24] },
      { label: 'Evening basket value', metric: '+8.4%', comparison: 'vs daily average', explanation: 'Larger beverage-led trips are driving the gain.', tone: 'red', values: [5, 6, 7, 7, 8, 9] },
    ],
  }
}

function contextReport(question, context) {
  if (context?.type === 'product') {
    return {
      eyebrow: 'Product intelligence',
      title: context.label,
      summary: 'Growth is real, evening-led, and strongest when the product is cold and available.',
      actionLabel: 'Review related action',
      actionTarget: 'actions',
      items: [
        { label: '30-day growth', metric: '+18%', comparison: 'vs previous period', explanation: 'Most of the increase occurred after 18:00.', tone: 'red', values: [12, 13, 14, 15, 17, 18] },
        { label: 'Basket companion', metric: 'Doritos', comparison: '2.3× affinity', explanation: 'The relationship is strongest on Friday and Saturday.', tone: 'dark', values: [18, 20, 19, 23, 26, 28] },
        { label: 'Store comparison', metric: '+11 pts', comparison: 'vs similar stores', explanation: 'This store converts more zero-sugar beverage baskets.', tone: 'red', values: [7, 8, 9, 9, 11, 12] },
      ],
    }
  }
  if (context?.type === 'action') {
    return {
      eyebrow: 'Action evidence',
      title: context.label,
      summary: 'The action is time-sensitive because velocity has remained elevated for three trading days.',
      actionLabel: 'Open action',
      actionTarget: 'actions',
      items: [
        { label: 'Urgency', metric: 'High', comparison: 'before 17:00 Friday', explanation: 'The projected risk window begins before the evening peak.', tone: 'red', values: [14, 15, 16, 18, 20, 21] },
        { label: 'Observed velocity', metric: '21.3/day', comparison: '+23% vs baseline', explanation: 'The signal is sustained rather than a one-hour spike.', tone: 'dark', values: [15, 16, 16, 18, 19, 21] },
        { label: 'Evidence window', metric: '3 days', comparison: 'consecutive uplift', explanation: 'Validated receipts support the recommendation.', tone: 'red', values: [10, 10, 12, 14, 17, 20] },
      ],
    }
  }
  if (context?.type === 'opportunity') {
    return {
      eyebrow: 'Opportunity evidence',
      title: context.label,
      summary: 'The basket relationship is strong enough for a focused weekend test.',
      actionLabel: 'Open opportunity',
      actionTarget: 'opportunities',
      items: [
        { label: 'Product affinity', metric: '2.3×', comparison: 'more likely together', explanation: 'The relationship holds across recent weekends.', tone: 'red', values: [17, 19, 18, 22, 24, 27] },
        { label: 'Missed baskets', metric: '184', comparison: 'high-fit trips', explanation: 'These baskets included one product but not both.', tone: 'dark', values: [22, 23, 25, 24, 28, 31] },
        { label: 'Expected value', metric: '₼72', comparison: 'estimated benefit', explanation: 'The estimate uses this store’s observed basket behavior.', tone: 'red', values: [8, 9, 10, 12, 13, 15] },
      ],
    }
  }
  return storeReport(question)
}

function IntelligenceReport({ question, context, onNavigate }) {
  const report = context ? contextReport(question, context) : storeReport(question)
  return (
    <section className="retailer-intelligence-report" aria-live="polite">
      <header><span>{report.eyebrow}</span><h2>{question}</h2><p>{report.title}. {report.summary}</p></header>
      <div className="retailer-intelligence-report-items">
        {report.items.map((item) => <article key={item.label}><div><span>{item.label}</span><strong>{item.metric}</strong><small>{item.comparison}</small></div><MiniChart label={`${item.label} evidence trend`} tone={item.tone} values={item.values} /><p>{item.explanation}</p></article>)}
      </div>
      <button className="scan-button scan-button-dark" onClick={() => onNavigate(report.actionTarget)} type="button">{report.actionLabel}<ScanIcon name="chevron" size={15} /></button>
    </section>
  )
}

export default function RetailerIntelligenceDrawer({ context, data, onClose, onNavigate, open }) {
  const [question, setQuestion] = useState('')
  const [answeredQuestion, setAnsweredQuestion] = useState('')
  const inputRef = useRef(null)
  const changes = data.home?.detectedChanges || []
  const suggestions = context ? CONTEXT_SUGGESTIONS[context.type] || STORE_SUGGESTIONS : STORE_SUGGESTIONS
  const updated = new Date(data.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  useEffect(() => {
    if (!open) return undefined
    const previousBodyOverflow = document.body.style.overflow
    const previousRootOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => inputRef.current?.focus(), 180)
    const handleKeyDown = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousRootOverflow
      window.clearTimeout(focusTimer)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [context, onClose, open])

  function ask(value) {
    const next = value.trim()
    if (!next) return
    setQuestion(next)
    setAnsweredQuestion(next)
  }

  if (!open) return null
  return (
    <div className="retailer-intelligence-layer">
      <button aria-label="Close SCAN Intelligence" className="retailer-intelligence-backdrop" onClick={onClose} type="button" />
      <aside aria-label="SCAN Intelligence" aria-modal="true" className="retailer-intelligence-drawer" id="retailer-intelligence-drawer" role="dialog">
        <header className="retailer-intelligence-drawer-header">
          <div className="retailer-intelligence-brand"><i><ScanIcon name="ask" size={17} /></i><div><strong>SCAN Intelligence</strong><span>{data.retailerName}</span></div></div>
          <button aria-label="Close SCAN Intelligence" onClick={onClose} type="button">×</button>
          <div className="retailer-intelligence-live"><span /><strong>Live store model</strong><small>Updated {updated}</small></div>
        </header>

        <div className="retailer-intelligence-body">
          <section className="retailer-intelligence-proactive">
            <header><div><span>Today</span><h2>{changes.length || 3} things stand out</h2></div><Badge tone="red">Live</Badge></header>
            <ol>{(changes.length ? changes : [
              { title: 'Coca-Cola Zero', metric: '+23% velocity' },
              { title: 'Doritos attachment', metric: '31% → 24%' },
              { title: 'Evening basket', metric: '+8.4%' },
            ]).slice(0, 3).map((item, index) => <li key={item.title}><span>{index + 1}</span><div><strong>{item.title.replace(' velocity', '').replace(' value', '')}</strong><small>{item.metric}</small></div></li>)}</ol>
            <button onClick={() => ask('What changed today?')} type="button">Review all <ScanIcon name="chevron" size={14} /></button>
          </section>

          {context ? <section className="retailer-intelligence-context"><span>Current context</span><strong>{context.label}</strong><small>{context.type === 'product' ? 'Product' : context.type === 'action' ? 'Action' : 'Opportunity'} intelligence</small></section> : null}

          <section className="retailer-intelligence-ask">
            <form onSubmit={(event) => { event.preventDefault(); ask(question) }}><ScanIcon name="ask" size={17} /><input aria-label="Ask about this store" onChange={(event) => setQuestion(event.target.value)} placeholder="Ask about this store..." ref={inputRef} value={question} /><button aria-label="Run intelligence report" type="submit"><ScanIcon name="chevron" size={16} /></button></form>
            <div aria-label="Suggested intelligence questions">{suggestions.map((suggestion) => <button key={suggestion} onClick={() => ask(suggestion)} type="button">{suggestion}</button>)}</div>
          </section>

          {answeredQuestion ? <IntelligenceReport context={context} onNavigate={(target) => { onNavigate(target); onClose() }} question={answeredQuestion} /> : <section className="retailer-intelligence-evidence-note"><ScanIcon name="shield" size={16} /><p><strong>Grounded in this store.</strong> Reports use validated receipts, product mappings, actions, and measured outcomes.</p><span>{formatInteger.format(data.totalBaskets)} receipts</span></section>}
        </div>
      </aside>
    </div>
  )
}
