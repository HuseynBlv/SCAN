import { useEffect } from 'react'
import { layout, prepare } from '@chenglou/pretext'

function cssNumber(value) {
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export function usePretextLayout(rootRef, layoutKey) {
  useEffect(() => {
    const root = rootRef.current
    if (!root || window.navigator.userAgent.includes('jsdom')) return undefined

    let disposed = false
    let observer
    let animationFrame
    const prepared = new Map()

    async function initialize() {
      await (document.fonts?.ready || Promise.resolve())
      if (disposed) return

      const elements = root.querySelectorAll('[data-pretext]')
      for (const element of elements) {
        const styles = window.getComputedStyle(element)
        const font = `${styles.fontWeight} ${styles.fontSize} ${styles.fontFamily}`
        prepared.set(element, prepare(element.textContent || '', font, {
          letterSpacing: cssNumber(styles.letterSpacing),
        }))
      }

      const relayout = () => {
        animationFrame = undefined
        for (const [element, handle] of prepared) {
          const lineHeight = cssNumber(window.getComputedStyle(element).lineHeight)
          if (!element.clientWidth || !lineHeight) continue
          const measured = layout(handle, element.clientWidth, lineHeight)
          element.style.height = `${Math.ceil(measured.height)}px`
        }
      }

      const scheduleRelayout = () => {
        if (animationFrame) window.cancelAnimationFrame(animationFrame)
        animationFrame = window.requestAnimationFrame(relayout)
      }

      observer = new ResizeObserver(scheduleRelayout)
      observer.observe(root)
      scheduleRelayout()
    }

    initialize().catch(() => {
      // CSS remains the safe fallback if browser text measurement is unavailable.
    })

    return () => {
      disposed = true
      observer?.disconnect()
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      prepared.clear()
    }
  }, [layoutKey, rootRef])
}
