import { useEffect, useState } from 'react'

// Fetched once per page load and shared. Until it answers (or if it fails) everything is treated as OFF,
// which is the safe default: the UI then describes the free behavior.
let cache = null
let inflight = null
const OFF = { ai: false, emailDigest: false, opcaStoresPersonal: false }

export function useFeatures() {
  const [f, setF] = useState(cache || OFF)
  useEffect(() => {
    if (cache) return
    inflight = inflight || fetch('/api/features').then(r => (r.ok ? r.json() : OFF)).catch(() => OFF)
    let live = true
    inflight.then(v => { cache = v; if (live) setF(v) })
    return () => { live = false }
  }, [])
  return f
}
