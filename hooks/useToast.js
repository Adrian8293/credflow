import { useState, useRef } from 'react'

function useToast() {
  const [toasts, setToasts] = useState([])
  const counterRef = useRef(0)

  // Raw browser errors mean nothing to most people; say what happened and whether it saved.
  const friendly = (m) => (typeof m === 'string' && /failed to fetch|networkerror|load failed|network request failed/i.test(m))
    ? 'Cannot reach the server. Check your internet connection. Your last change was NOT saved, so please try again.'
    : m

  function toast(rawMsg, type = 'success') {
    const msg = friendly(rawMsg)
    // Use incrementing counter to prevent ID collisions when multiple
    // toasts fire in the same millisecond (Date.now() is not unique enough)
    const id = `toast-${Date.now()}-${++counterRef.current}`
    setToasts(prev => [...prev, { id, msg, type }])
    // Errors and warnings stay longer so there is time to read them.
    const ms = type === 'error' ? 9000 : type === 'warn' ? 7000 : 4500
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), ms)
  }

  return { toasts, toast }
}

export { useToast }
