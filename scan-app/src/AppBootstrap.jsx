import { Suspense, useCallback, useState } from 'react'
import App from './AppLoader.jsx'
import LoadingScreen, { TimedLoadingScreen } from './components/LoadingScreen.jsx'

export default function AppBootstrap() {
  const [minimumLoadingComplete, setMinimumLoadingComplete] = useState(false)
  const finishLoading = useCallback(() => setMinimumLoadingComplete(true), [])

  if (!minimumLoadingComplete) {
    return <TimedLoadingScreen onComplete={finishLoading} />
  }

  return (
    <Suspense fallback={<LoadingScreen />}>
      <div className="app-reveal"><App /></div>
    </Suspense>
  )
}
