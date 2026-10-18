import { useEffect, useRef, useState } from 'react'

/**
 * Like useState, but remembers the value in this browser (localStorage) under `key`.
 * Pass key = null to skip persistence. `isValid(v)` rejects stale values (for example a tab that no longer exists). Every storage call is wrapped:
 * private windows / blocked storage just behave like plain useState. Loaded after mount to avoid hydration mismatches.
 */
export function usePersistedState(key, initial, isValid = () => true) {
  const [value, setValue] = useState(initial)
  const loaded = useRef(false)
  const validRef = useRef(isValid)
  useEffect(() => { validRef.current = isValid })

  useEffect(() => {
    if (!key) { loaded.current = false; return }   // key null = do not persist (plain state)
    try {
      const raw = localStorage.getItem(key)
      if (raw !== null) {
        const v = JSON.parse(raw)
        if (validRef.current(v)) setValue(v)
      }
    } catch { /* storage unavailable or corrupt: keep the default */ }
    loaded.current = true
  }, [key])

  useEffect(() => {
    if (!key || !loaded.current) return
    try { localStorage.setItem(key, JSON.stringify(value)) } catch { /* ignore */ }
  }, [key, value])

  return [value, setValue]
}
