import { useEffect, useRef, useState } from 'react'
import { writeSeen } from '../lib/idle'

/**
 * Automatic logoff after a period of inactivity (HIPAA "automatic logoff" safeguard).
 *
 * - While the app is open: a timer ends the session after `minutes` without activity, with a 1-minute warning.
 * - When the app is reopened after being away (closed tab, phone asleep, installed app): the last activity time
 *   saved on this device is checked FIRST, and the person is signed out if the limit has passed. (Before, opening
 *   the app reset the clock, so a login could survive for days.)
 * - The last-activity time is also written to a cookie so the server can refuse stale sessions (proxy.js).
 * Activity is shared across tabs through localStorage. `sessionId` ties the saved time to one sign-in, so a fresh
 * login never inherits an old timestamp. Client-side: it ends the browser session; it does not shorten the
 * server-side token lifetime.
 */
const KEY = 'lc_last_activity'
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click']

const read = () => {
  try {
    const [ts, ...sid] = String(localStorage.getItem(KEY) || '').split('|')
    return { ts: Number(ts) || 0, sid: sid.join('|') }
  } catch { return { ts: 0, sid: '' } }
}
const write = (t, sid) => { try { localStorage.setItem(KEY, `${t}|${sid}`) } catch { /* storage unavailable */ } }

export function useIdleLogout({ enabled, minutes = 30, onTimeout, sessionId = '' }) {
  const [secondsLeft, setSecondsLeft] = useState(null)   // null = not in the warning window
  const last = useRef(0)
  const cb = useRef(onTimeout)
  useEffect(() => { cb.current = onTimeout })

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!sessionId) { setSecondsLeft(null); return }
    if (!enabled) { setSecondsLeft(null); writeSeen(0, minutes); return }   // 0 = no limit

    const limit = minutes * 60_000
    const stored = read()
    const now = Date.now()
    // Same sign-in, but away longer than the limit → end the session now.
    if (stored.ts && stored.sid === sessionId && now - stored.ts >= limit) { cb.current?.(); return }

    last.current = now; write(now, sessionId); writeSeen(now, minutes)

    let lastWrite = now
    const bump = () => {
      const t = Date.now()
      last.current = t
      if (t - lastWrite > 10_000) { lastWrite = t; write(t, sessionId); writeSeen(t, minutes) }   // throttle writes
    }
    EVENTS.forEach(e => window.addEventListener(e, bump, { passive: true }))

    let done = false
    const check = () => {
      if (done) return
      const seen = Math.max(last.current, read().ts)
      const idle = Date.now() - seen
      if (idle >= limit) { done = true; cb.current?.() }
      else if (idle >= limit - 60_000) setSecondsLeft(Math.ceil((limit - idle) / 1000))
      else setSecondsLeft(null)
    }
    const timer = setInterval(check, 5_000)
    // Timers freeze while a phone sleeps or a tab is hidden; check the moment the app is shown again.
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', check)

    return () => {
      EVENTS.forEach(e => window.removeEventListener(e, bump))
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', check)
      clearInterval(timer)
    }
  }, [enabled, minutes, sessionId])

  return { secondsLeft }
}
