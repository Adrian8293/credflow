import { useEffect, useRef, useState } from 'react'

/**
 * Automatic logoff after a period of inactivity (HIPAA "automatic logoff" safeguard).
 * Activity is shared across tabs via localStorage, so working in one tab keeps the others alive.
 * Shows a warning for the final minute. Client-side: it ends the browser session; it does not
 * shorten the server-side token lifetime.
 */
const KEY = 'lc_last_activity'
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']

const read = () => { try { return Number(localStorage.getItem(KEY)) || 0 } catch { return 0 } }
const write = (t) => { try { localStorage.setItem(KEY, String(t)) } catch { /* storage unavailable */ } }

export function useIdleLogout({ enabled, minutes = 30, onTimeout }) {
  const [secondsLeft, setSecondsLeft] = useState(null)   // null = not in the warning window
  const last = useRef(0)
  const cb = useRef(onTimeout)
  useEffect(() => { cb.current = onTimeout })

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') { setSecondsLeft(null); return }
    const limit = minutes * 60_000
    last.current = Date.now(); write(last.current)

    let lastWrite = 0
    const bump = () => {
      const now = Date.now()
      last.current = now
      if (now - lastWrite > 10_000) { lastWrite = now; write(now) }   // throttle storage writes
    }
    EVENTS.forEach(e => window.addEventListener(e, bump, { passive: true }))

    const timer = setInterval(() => {
      const idle = Date.now() - Math.max(last.current, read())
      if (idle >= limit) { clearInterval(timer); cb.current?.() }
      else if (idle >= limit - 60_000) setSecondsLeft(Math.ceil((limit - idle) / 1000))
      else setSecondsLeft(null)
    }, 5_000)

    return () => { EVENTS.forEach(e => window.removeEventListener(e, bump)); clearInterval(timer) }
  }, [enabled, minutes])

  return { secondsLeft }
}
