import { useEffect, useRef, useState } from 'react'
import { COUNT_MS, animatable, valueAt } from '../../lib/countUp.js'

// Counts up to `value` on first show and whenever it changes. Screen readers get the final value
// straight away (the moving digits are hidden from them); reduced-motion users see no animation.
export function CountUp({ value }) {
  const ok = animatable(value)
  const [shown, setShown] = useState(ok ? 0 : value)
  const from = useRef(0)
  useEffect(() => {
    if (!ok) { setShown(value); return undefined }
    const reduce = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) { setShown(value); from.current = value; return undefined }
    let raf = 0
    const start = performance.now(), a = from.current
    const tick = now => {
      const v = valueAt(a, value, now - start, COUNT_MS)
      setShown(v); from.current = v
      if (now - start < COUNT_MS) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, ok])
  if (!ok) return <>{value}</>
  return (<><span className="sr-only">{value}</span><span aria-hidden="true">{shown}</span></>)
}
export default CountUp
