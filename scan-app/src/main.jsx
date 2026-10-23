import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/wght.css'
import './index.css'
import AppBootstrap from './AppBootstrap.jsx'
import AppErrorBoundary from './AppErrorBoundary.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <AppBootstrap />
    </AppErrorBoundary>
  </StrictMode>,
)
