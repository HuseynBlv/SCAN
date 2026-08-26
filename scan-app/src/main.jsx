import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './AppLoader.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<div className="app-loading">Loading SCAN…</div>}>
      <App />
    </Suspense>
  </StrictMode>,
)
