import { StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist/wght.css'
import './index.css'
import App from './AppLoader.jsx'
import AppErrorBoundary from './AppErrorBoundary.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <AppErrorBoundary>
      <Suspense fallback={<LoadingScreen />}>
        <div className="app-reveal"><App /></div>
      </Suspense>
    </AppErrorBoundary>
  </StrictMode>,
)
