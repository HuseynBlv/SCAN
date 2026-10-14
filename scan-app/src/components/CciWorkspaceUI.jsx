import ScanIcon from './ScanIcon'
import { StatusBadge } from './WorkspaceUI'
import './CciWorkspaceUI.css'

export { StatusBadge }

export function KpiCard({ label, value, change, tone = 'neutral', children }) {
  return <article className="cci-ui-kpi"><span>{label}</span><div><strong>{value}</strong>{change ? <small className={`is-${tone}`}>{change}</small> : null}</div>{children}</article>
}

export function TrendCard({ title, description, action, children, className = '' }) {
  return <section className={`scan-panel cci-ui-trend ${className}`}><header><div><h3>{title}</h3>{description ? <p>{description}</p> : null}</div>{action}</header>{children}</section>
}

export function RankedListCard({ title, description, action, children, className = '' }) {
  return <section className={`scan-panel cci-ui-ranked ${className}`}><header><div><h3>{title}</h3>{description ? <p>{description}</p> : null}</div>{action}</header>{children}</section>
}

export function SignalCard({ signal, index, onOpen }) {
  const canOpen = onOpen && (signal.actionTarget || signal.actionType === 'STORES')
  return <article className="cci-ui-signal"><div className="cci-ui-signal-rank">{String(index + 1).padStart(2, '0')}</div><div><header><StatusBadge tone={signal.type === 'OPPORTUNITY' ? 'success' : 'warning'}>{signal.severity || signal.type}</StatusBadge>{signal.magnitude ? <strong>{signal.magnitude}</strong> : null}</header><span>{signal.signalCode || 'Commercial signal'}</span><h3>{signal.title}</h3><p>{signal.description}</p>{signal.affectedLabel || signal.productLabel || signal.recommendation ? <dl>{signal.affectedLabel ? <div><dt>Affected</dt><dd>{signal.affectedLabel}</dd></div> : null}{signal.productLabel ? <div><dt>Products</dt><dd>{signal.productLabel}</dd></div> : null}{signal.recommendation ? <div><dt>Recommended next step</dt><dd>{signal.recommendation}</dd></div> : null}</dl> : null}{canOpen ? <button className="scan-button scan-button-light" onClick={() => onOpen(signal)} type="button">{signal.actionLabel || 'Review'} <ScanIcon name="chevron" size={15} /></button> : null}</div></article>
}

export function InvestigationCard({ investigation, onOpen }) {
  return <button className="cci-ui-investigation" onClick={() => onOpen(investigation.id)} type="button"><div><StatusBadge tone={investigation.status === 'CLOSED' ? 'success' : 'warning'}>{investigation.status.replaceAll('_', ' ')}</StatusBadge><h3>{investigation.title}</h3><p>{investigation.question}</p><small>{investigation.hypotheses.length} hypotheses · {investigation.notes.length} notes</small></div><ScanIcon name="chevron" size={18} /></button>
}

export function SearchBar({ query, onChange, results, onSelect }) {
  return <div className="cci-ui-search"><ScanIcon name="explore" size={18} /><input aria-label="Search CCI workspace" onChange={(event) => onChange(event.target.value)} placeholder="Search stores, products, signals…" value={query} /><kbd>⌘ K</kbd>{query.trim() ? <div className="cci-ui-search-results">{results.length ? results.slice(0, 7).map((item) => <button key={`${item.type}-${item.key}`} onClick={() => onSelect(item)} type="button"><ScanIcon name={item.icon} size={16} /><span><strong>{item.label}</strong><small>{item.meta}</small></span><ScanIcon name="chevron" size={15} /></button>) : <p>No matching stores, products, signals, or investigations.</p>}</div> : null}</div>
}

export function ActivityTimeline({ items }) {
  return <ol className="cci-ui-timeline">{items.map((item, index) => <li key={`${item.time}-${item.label}-${index}`}><time>{item.time}</time><i aria-hidden="true" /><span>{item.label}</span></li>)}</ol>
}

export function TableCard({ title, description, action, children }) {
  return <section className="scan-panel cci-ui-table"><header><div><h3>{title}</h3>{description ? <p>{description}</p> : null}</div>{action}</header>{children}</section>
}

export function OpportunityCard({ opportunity, onOpen }) {
  return <article className="cci-ui-opportunity"><header><StatusBadge tone="success">{opportunity.severity || 'Opportunity'}</StatusBadge>{opportunity.magnitude ? <strong>{opportunity.magnitude}</strong> : null}</header><span>{opportunity.signalCode || 'Commercial opportunity'}</span><h3>{opportunity.title}</h3><p>{opportunity.description}</p>{opportunity.recommendation ? <div><small>SCAN recommendation</small><b>{opportunity.recommendation}</b></div> : null}<button className="scan-button scan-button-dark" onClick={() => onOpen(opportunity)} type="button">{opportunity.actionLabel || 'Build test'} <ScanIcon name="chevron" size={15} /></button></article>
}

export function WatchlistCard({ items, changes }) {
  return <section className="scan-panel cci-ui-watchlist"><header><div><h3>Watching</h3><p>Products explicitly followed by the commercial team.</p></div><StatusBadge tone="neutral">{items.length}</StatusBadge></header>{items.length ? <div>{items.map((item) => { const change = changes.find((entry) => entry.productName === item.productName); return <article key={item.id}><span><strong>{item.productName}</strong><small>{change ? `${change.recentBaskets} recent baskets` : 'Awaiting comparison'}</small></span>{change ? <b className={change.basketChangePct >= 0 ? 'is-up' : 'is-down'}>{change.basketChangePct >= 0 ? '+' : ''}{change.basketChangePct}%</b> : null}</article> })}</div> : <p className="cci-ui-empty">No products are being watched.</p>}</section>
}
