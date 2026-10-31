import { useState, useRef, useCallback } from 'react'

const MAX_TOASTS = 4
// How long each kind stays: errors stay until dismissed (they usually mean "not saved"), warnings a good while, successes briefly.
const DURATION = { success: 5000, info: 6000, warn: 10000, error: 0 }
const AFTER_HOVER = 4000   // once the mouse/keyboard leaves a toast, give it a few more seconds

function useToast() {
  const [toasts, setToasts] = useState([])
  const counterRef = useRef(0)
  const timers = useRef(new Map())

  // Raw browser errors mean nothing to most people; say what happened and whether it saved.
  const friendly = (m) => (typeof m === 'string' && /failed to fetch|networkerror|load failed|network request failed/i.test(m))
    ? 'Cannot reach the server. Check your internet connection. Your last change was NOT saved, so please try again.'
    : m

  const clearTimer = useCallback(id => {
    const t = timers.current.get(id)
    if (t) { clearTimeout(t); timers.current.delete(id) }
  }, [])

  const dismiss = useCallback(id => {
    clearTimer(id)
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [clearTimer])

  const arm = useCallback((id, ms) => {
    clearTimer(id)
    if (ms > 0) timers.current.set(id, setTimeout(() => dismiss(id), ms))
  }, [clearTimer, dismiss])

  function toast(rawMsg, type = 'success') {
    const msg = friendly(rawMsg)
    // Incrementing counter avoids ID collisions when several toasts fire in the same millisecond.
    const id = `toast-${Date.now()}-${++counterRef.current}`
    setToasts(prev => {
      const next = [...prev, { id, msg, type }]
      // Keep the screen tidy: drop the oldest non-error toasts first if too many pile up.
      while (next.length > MAX_TOASTS) {
        const i = next.findIndex(t => t.type !== 'error')
        const [gone] = next.splice(i === -1 ? 0 : i, 1)
        clearTimer(gone.id)
      }
      return next
    })
    arm(id, DURATION[type] ?? DURATION.success)
  }

  // Hovering or focusing a toast pauses its countdown so it can be read; leaving restarts a short one.
  const pause = useCallback(id => clearTimer(id), [clearTimer])
  const resume = useCallback((id, type) => { if (type !== 'error') arm(id, AFTER_HOVER) }, [arm])

  return { toasts, toast, dismiss, pause, resume }
}

export { useToast }
