import { useState, useRef } from 'react'

function useToast() {
  const [toasts, setToasts] = useState([])
  const counterRef = useRef(0)

  function toast(msg, type = 'success') {
    // Use incrementing counter to prevent ID collisions when multiple
    // toasts fire in the same millisecond (Date.now() is not unique enough)
    const id = `toast-${Date.now()}-${++counterRef.current}`
    setToasts(prev => [...prev, { id, msg, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3500)
  }

  return { toasts, toast }
}

export { useToast }
