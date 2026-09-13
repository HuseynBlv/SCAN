import { useEffect } from 'react'
import ScanBrand from './ScanBrand'
import ScanIcon from './ScanIcon'
import './WorkspaceUI.css'

export function EmptyState({ title, children, compact = false }) {
  return (
    <div className={`scan-empty-state ${compact ? 'is-compact' : ''}`}>
      <span className="scan-empty-mark" aria-hidden="true">—</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  )
}

export function LoadingState({ title, description }) {
  return (
    <main className="scan-loading-state" aria-live="polite">
      <ScanBrand subtitle="Sales & Consumption Analytics Network" />
      <div className="scan-loading-lines" aria-hidden="true"><i /><i /><i /></div>
      <h1>{title}</h1>
      <p>{description}</p>
    </main>
  )
}

export function StatusBadge({ tone = 'neutral', children }) {
  return <span className={`scan-status-badge is-${tone}`}>{children}</span>
}

export function MetricStrip({ label, items }) {
  return (
    <section className={`scan-metric-strip count-${items.length}`} aria-label={label}>
      {items.map((item) => (
        <article className="scan-metric" key={item.label}>
          <span>{item.label}</span>
          <strong>{item.value}</strong>
          {item.note ? <small>{item.note}</small> : null}
        </article>
      ))}
    </section>
  )
}

export function EvidenceIndicator({ basketCount, mappingPercentage, basketLabel = 'baskets' }) {
  const mapped = Number(mappingPercentage || 0)
  return (
    <div className="scan-evidence" aria-label="Evidence and data sufficiency">
      <div className="scan-evidence-copy">
        <span>Evidence</span>
        <strong>{Number(basketCount || 0).toLocaleString('en-US')} {basketLabel}</strong>
      </div>
      <div className="scan-evidence-copy">
        <span>Product mapping</span>
        <strong>{mapped.toLocaleString('en-US', { maximumFractionDigits: 1 })}%</strong>
      </div>
      <div className="scan-evidence-meter" aria-hidden="true">
        <i style={{ width: `${Math.min(Math.max(mapped, 0), 100)}%` }} />
      </div>
    </div>
  )
}

export function OpportunityCard({ insight, index, evidence, signal = false, onOpen }) {
  return (
    <article className={`scan-opportunity ${signal ? 'is-signal' : ''}`}>
      <header>
        <StatusBadge tone={signal ? 'neutral' : 'red'}>
          {signal ? 'Observed signal' : `Opportunity ${String(index + 1).padStart(2, '0')}`}
        </StatusBadge>
        {onOpen ? (
          <button className="scan-icon-button" type="button" onClick={onOpen} aria-label={`Open ${insight.recommendedAction}`}>
            <ScanIcon name="chevron" size={18} />
          </button>
        ) : null}
      </header>
      <h3>{signal ? insight.fact : insight.recommendedAction}</h3>
      <dl>
        <div><dt>{signal ? 'Why this is not yet an action' : 'What happened'}</dt><dd>{signal ? insight.interpretation : insight.fact}</dd></div>
        {!signal ? <div><dt>Why it matters</dt><dd>{insight.interpretation}</dd></div> : null}
      </dl>
      {evidence ? <div className="scan-opportunity-evidence">{evidence}</div> : null}
    </article>
  )
}

export function PageIntro({ eyebrow, title, description, aside }) {
  return (
    <header className="scan-page-intro">
      <div>
        <span className="scan-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {aside ? <div className="scan-page-intro-aside">{aside}</div> : null}
    </header>
  )
}

export function ChartPanel({ title, description, action, children, className = '' }) {
  return (
    <section className={`scan-panel scan-chart-panel ${className}`}>
      <header className="scan-panel-header">
        <div><h3>{title}</h3>{description ? <p>{description}</p> : null}</div>
        {action}
      </header>
      {children}
    </section>
  )
}

export function SegmentedControl({ label, value, options, onChange }) {
  return (
    <div className="scan-segmented" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          aria-pressed={value === option.value}
          className={value === option.value ? 'is-active' : ''}
          key={option.value}
          onClick={() => onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function DataFreshness({ generatedAt, formatter, label = 'Data updated' }) {
  return (
    <div className="scan-freshness" title="Time of the latest SCAN analysis">
      <span className="scan-freshness-dot" aria-hidden="true" />
      <span>{label}</span>
      <strong>{formatter(generatedAt)}</strong>
    </div>
  )
}

export function WorkspaceShell({
  activePage,
  children,
  accountLabel,
  accountMeta,
  brandSubtitle,
  header,
  navItems,
  onNavigate,
  onSignOut,
  portal = 'cci',
  privacyLabel,
  disableNavigation = false,
}) {
  useEffect(() => {
    document.documentElement.scrollTop = 0
    document.body.scrollTop = 0
  }, [activePage])

  return (
    <div className={`scan-workspace scan-workspace-${portal}`}>
      <aside className="scan-sidebar">
        <ScanBrand inverted subtitle={brandSubtitle} />
        <nav aria-label={`${brandSubtitle} navigation`}>
          {navItems.map((item) => (
            <button
              aria-current={activePage === item.id ? 'page' : undefined}
              className={activePage === item.id ? 'is-active' : ''}
              disabled={disableNavigation && item.id !== navItems[0].id}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <ScanIcon name={item.icon} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <footer>
          <div className="scan-account">
            <span>{accountLabel.slice(0, 3).toUpperCase()}</span>
            <div><strong>{accountLabel}</strong><small>{accountMeta}</small></div>
          </div>
          {privacyLabel ? <p><ScanIcon name="shield" size={15} />{privacyLabel}</p> : null}
          <button className="scan-signout" type="button" onClick={onSignOut}>
            <ScanIcon name="signout" size={18} />Sign out
          </button>
        </footer>
      </aside>
      <main className="scan-main">
        {header}
        <nav className="scan-mobile-nav" aria-label={`${brandSubtitle} sections`}>
          {navItems.map((item) => (
            <button
              aria-current={activePage === item.id ? 'page' : undefined}
              className={activePage === item.id ? 'is-active' : ''}
              disabled={disableNavigation && item.id !== navItems[0].id}
              key={item.id}
              onClick={() => onNavigate(item.id)}
              type="button"
            >
              <ScanIcon name={item.icon} size={19} />
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="scan-view" key={activePage}>{children}</div>
      </main>
    </div>
  )
}

export function WorkspaceHeader({ eyebrow, title, meta, actions }) {
  return (
    <header className="scan-topbar">
      <div className="scan-topbar-copy">
        <span>{eyebrow}</span>
        <h1>{title}</h1>
        {meta}
      </div>
      <div className="scan-topbar-actions">{actions}</div>
    </header>
  )
}
