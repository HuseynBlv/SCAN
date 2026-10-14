import ScanIcon from './ScanIcon'
import './RetailerUI.css'

export function Card({ as: Element = 'section', className = '', children, ...props }) {
  return <Element className={`retail-card ${className}`.trim()} {...props}>{children}</Element>
}

export function Badge({ tone = 'neutral', children }) {
  return <span className={`retail-badge is-${tone}`}>{children}</span>
}

export function MiniChart({ values = [], tone = 'red', label = 'Trend' }) {
  const safe = values.length > 1 ? values.map(Number) : [0, 0]
  const low = Math.min(...safe)
  const high = Math.max(...safe)
  const range = high - low || 1
  const points = safe.map((value, index) => {
    const x = (index / (safe.length - 1)) * 100
    const y = 34 - ((value - low) / range) * 28
    return `${x},${y}`
  }).join(' ')
  const area = `0,40 ${points} 100,40`
  return (
    <svg aria-label={label} className={`retail-mini-chart is-${tone}`} preserveAspectRatio="none" role="img" viewBox="0 0 100 40">
      <polygon points={area} />
      <polyline points={points} />
    </svg>
  )
}

export function MetricCard({ label, value, note, change, changeTone = 'positive', icon, chartValues, tone = 'default' }) {
  return (
    <Card as="article" className={`retail-metric-card is-${tone}`}>
      <header>
        <span>{label}</span>
        {icon ? <i><ScanIcon name={icon} size={17} /></i> : null}
      </header>
      <div className="retail-metric-value">
        <strong>{value}</strong>
        {change ? <Badge tone={changeTone}>{change}</Badge> : null}
      </div>
      {chartValues ? <MiniChart label={`${label} trend`} tone={tone === 'dark' ? 'light' : 'red'} values={chartValues} /> : null}
      {note ? <small>{note}</small> : null}
    </Card>
  )
}

export function SectionHeader({ eyebrow, title, description, action }) {
  return (
    <header className="retail-section-header">
      <div>
        {eyebrow ? <span>{eyebrow}</span> : null}
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {action ? <div>{action}</div> : null}
    </header>
  )
}

export function BenchmarkIndicator({ label, value, benchmark, tone = 'positive' }) {
  return (
    <div className="retail-benchmark">
      <div><span>{label}</span><strong>{value}</strong></div>
      <div className="retail-benchmark-track" aria-hidden="true"><i className={`is-${tone}`} style={{ width: `${Math.min(Math.max(benchmark, 0), 100)}%` }} /></div>
    </div>
  )
}

export function InsightCard({ eyebrow = 'SCAN detected', title, description, metric, action, tone = 'red' }) {
  return (
    <Card as="article" className={`retail-insight-card is-${tone}`}>
      <header><Badge tone={tone}>{eyebrow}</Badge>{metric ? <strong>{metric}</strong> : null}</header>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <footer>{action}</footer> : null}
    </Card>
  )
}

export function ActionCard({ badge, badgeTone = 'neutral', title, description, metricLabel, metricValue, recommendation, action }) {
  return (
    <Card as="article" className="retail-action-module">
      <header><Badge tone={badgeTone}>{badge}</Badge>{metricValue ? <strong>{metricValue}</strong> : null}</header>
      <h3>{title}</h3>
      <p>{description}</p>
      {metricLabel ? <small>{metricLabel}</small> : null}
      {recommendation ? <div className="retail-action-next"><span>Next best action</span><p>{recommendation}</p></div> : null}
      {action ? <footer>{action}</footer> : null}
    </Card>
  )
}

export function ActivityItem({ icon = 'pulse', title, detail, time, tone = 'neutral' }) {
  return (
    <li className="retail-activity-item">
      <i className={`is-${tone}`}><ScanIcon name={icon} size={16} /></i>
      <div><strong>{title}</strong><span>{detail}</span></div>
      <time>{time}</time>
    </li>
  )
}

export function IntelligenceCard({ title, description, metric, children, action }) {
  return (
    <Card className="retail-intelligence-card">
      <header>
        <div className="retail-intelligence-mark"><ScanIcon name="ask" size={18} /></div>
        <span>SCAN Intelligence</span>
        {metric ? <strong>{metric}</strong> : null}
      </header>
      <h2>{title}</h2>
      <p>{description}</p>
      {children}
      {action ? <footer>{action}</footer> : null}
    </Card>
  )
}
