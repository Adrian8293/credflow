import { useCallback, useEffect, useState } from 'react'
import { THEME_KEY, applyTheme, themeForPath, currentTheme, nextTheme, readStoredTheme, resolveTheme, storeTheme, systemPrefersDark } from '../lib/theme.js'

// Returns { theme, toggle }. `theme` is null until mounted so server and first client render match.
export function useTheme() {
  const [theme, setTheme] = useState(null)

  useEffect(() => {
    // Re-apply on mount: arriving from a sign-in page (always light) must restore the saved theme.
    const start = themeForPath(location.pathname, readStoredTheme(), systemPrefersDark())
    applyTheme(start); setTheme(start)
    // Follow the device setting while the person has not chosen one.
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null
    const onSystem = () => {
      if (readStoredTheme()) return
      const t = resolveTheme(null, systemPrefersDark()); applyTheme(t); setTheme(t)
    }
    // Keep several open tabs in step.
    const onStorage = e => {
      if (e.key !== THEME_KEY) return
      const t = resolveTheme(e.newValue, systemPrefersDark()); applyTheme(t); setTheme(t)
    }
    mq?.addEventListener?.('change', onSystem)
    window.addEventListener('storage', onStorage)
    return () => { mq?.removeEventListener?.('change', onSystem); window.removeEventListener('storage', onStorage) }
  }, [])

  const toggle = useCallback(() => {
    const t = nextTheme(currentTheme())
    storeTheme(t); applyTheme(t); setTheme(t)
  }, [])

  return { theme, toggle }
}
