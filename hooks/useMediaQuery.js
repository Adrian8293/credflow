import { useEffect, useState } from 'react'

/** True while the CSS media query matches (updates live). False on the server and first paint, so markup always matches. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined
    const mq = window.matchMedia(query)
    const on = () => setMatches(mq.matches)
    on()
    mq.addEventListener?.('change', on)
    return () => mq.removeEventListener?.('change', on)
  }, [query])
  return matches
}
