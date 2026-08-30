export default function ScanBrand({ subtitle, inverted = false }) {
  return (
    <div className={`cci-brand ${inverted ? 'inverted' : ''}`}>
      <div className="scan-wordmark" aria-label="SCAN">
        <span className="scan-wordmark-text">SCAN</span>
        <span className="scan-wordmark-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="cci-brand-subtitle">{subtitle}</div>
    </div>
  )
}
