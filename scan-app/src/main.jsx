import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './AppLoader.jsx'
import AppErrorBoundary from './AppErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <Suspense fallback={<div className="app-loading">Loading SCAN…</div>}>
        <App />
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>,
)
