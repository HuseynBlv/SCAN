import { useEffect, useRef, useState } from 'react'
import ScanBrand from '../ScanBrand'

export const CCI_AUTH_ROUTE = '/?portal=cci'
export const RETAILER_AUTH_ROUTE = '/?portal=retailer'

const navigation = [
  { href: '#transaction-intelligence', label: 'Intelligence' },
  { href: '#platform', label: 'Perspectives' },
  { href: '#how-it-works', label: 'How It Works' },
]

export default function LandingNavigation() {
  const [open, setOpen] = useState(false)
  const menuButtonRef = useRef(null)

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape' && open) {
        setOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [open])

  return (
    <header className="landing-nav-wrap">
      <nav className="landing-nav landing-container" aria-label="Main navigation">
        <a className="landing-brand-link" href="#top" aria-label="SCAN home">
          <ScanBrand subtitle="Retail Intelligence" />
        </a>
        <div className="landing-nav-links">
          {navigation.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}
        </div>
        <div className="landing-nav-actions">
          <a className="landing-text-link" href={CCI_AUTH_ROUTE}>Sign in</a>
          <a className="landing-button landing-button-red landing-button-compact" href={RETAILER_AUTH_ROUTE}>Get started</a>
        </div>
        <button
          aria-controls="landing-mobile-menu"
          aria-expanded={open}
          aria-label={open ? 'Close navigation menu' : 'Open navigation menu'}
          className={`landing-menu-button ${open ? 'is-open' : ''}`}
          onClick={() => setOpen((current) => !current)}
          ref={menuButtonRef}
          type="button"
        >
          <span /><span />
        </button>
      </nav>
      <div aria-hidden={!open} className={`landing-mobile-menu ${open ? 'is-open' : ''}`} id="landing-mobile-menu" inert={!open}>
        <div className="landing-container">
          {navigation.map((item) => <a href={item.href} key={item.href} onClick={() => setOpen(false)}>{item.label}</a>)}
          <div className="landing-mobile-actions">
            <a className="landing-button landing-button-secondary" href={CCI_AUTH_ROUTE}>Sign in</a>
            <a className="landing-button landing-button-red" href={RETAILER_AUTH_ROUTE}>Get started</a>
          </div>
        </div>
      </div>
    </header>
  )
}
