import ScanBrand from './ScanBrand'
import './LoadingScreen.css'

const nodes = [
  [44, 58, 4], [116, 35, 3], [184, 74, 4], [256, 38, 3], [326, 68, 4],
  [386, 34, 3], [458, 62, 4], [76, 132, 3], [150, 146, 4], [224, 120, 3],
  [300, 146, 4], [372, 118, 3], [438, 144, 4], [42, 205, 3], [116, 220, 4],
  [194, 196, 3], [266, 224, 4], [342, 196, 3], [412, 218, 4], [474, 188, 3],
]

const paths = [
  'M44 58 L116 35 L184 74 L256 38 L326 68 L386 34 L458 62',
  'M76 132 L150 146 L224 120 L300 146 L372 118 L438 144',
  'M42 205 L116 220 L194 196 L266 224 L342 196 L412 218 L474 188',
  'M44 58 L76 132 L42 205', 'M116 35 L150 146 L116 220',
  'M184 74 L224 120 L194 196', 'M256 38 L300 146 L266 224',
  'M326 68 L372 118 L342 196', 'M386 34 L438 144 L412 218',
  'M458 62 L438 144 L474 188', 'M150 146 L194 196', 'M300 146 L342 196',
]

function IntelligenceNetwork({ active = true }) {
  return (
    <svg aria-hidden="true" className="scan-intelligence-network" viewBox="0 0 520 260">
      <g className="scan-network-lines">
        {paths.map((path, index) => <path d={path} key={path} style={{ '--network-delay': `${index * -240}ms` }} />)}
      </g>
      <g className="scan-network-nodes">
        {nodes.map(([cx, cy, radius], index) => <circle cx={cx} cy={cy} key={`${cx}-${cy}`} r={radius} style={{ '--network-delay': `${index * -170}ms` }} />)}
      </g>
      {active ? <g className="scan-network-pulses">
        <circle r="4"><animateMotion begin="-.4s" dur="3.6s" path={paths[1]} repeatCount="indefinite" /></circle>
        <circle r="3.5"><animateMotion begin="-2.2s" dur="4.4s" path={paths[6]} repeatCount="indefinite" /></circle>
        <circle r="3"><animateMotion begin="-1.1s" dur="3.9s" path={paths[2]} repeatCount="indefinite" /></circle>
      </g> : null}
    </svg>
  )
}

export default function LoadingScreen({
  error = false,
  message = 'Connecting basket signals',
  onRetry,
}) {
  return (
    <main
      aria-busy={!error}
      className={`scan-intelligence-loader ${error ? 'is-error' : ''}`}
      role={error ? 'alert' : undefined}
    >
      <div className="scan-intelligence-stage">
        <IntelligenceNetwork active={!error} />
        <div className="scan-loader-brand">
          <ScanBrand subtitle="Sales & Consumption Analytics Network" />
        </div>
      </div>
      <div aria-live="polite" className="scan-loader-copy" role={error ? undefined : 'status'}>
        <strong>{error ? 'SCAN could not load this page' : 'Preparing SCAN'}</strong>
        <span>{message}</span>
      </div>
      {error ? (
        <button className="scan-loader-retry" onClick={onRetry} type="button">Retry loading SCAN</button>
      ) : (
        <div aria-hidden="true" className="scan-loader-progress"><i /></div>
      )}
    </main>
  )
}
