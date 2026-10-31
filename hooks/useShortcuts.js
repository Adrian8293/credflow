import { useEffect, useRef } from 'react'
import { resolveShortcut } from '../lib/shortcuts.js'

const TYPING = /^(INPUT|TEXTAREA|SELECT)$/

/** Global keyboard shortcuts (see lib/shortcuts.js). `handlers`: { search, go(page), newApplication, help } */
export function useShortcuts(handlers) {
  const ref = useRef(handlers)
  useEffect(() => { ref.current = handlers })

  useEffect(() => {
    let pending = false
    let timer = null
    const onKey = e => {
      if (e.defaultPrevented || e.repeat) return
      const t = e.target
      const typing = !!t && (TYPING.test(t.tagName) || t.isContentEditable)
      const dialogOpen = !!document.querySelector('[role="dialog"][aria-modal="true"]')
      const r = resolveShortcut(pending, { key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, typing, dialogOpen })
      pending = r.pendingG
      clearTimeout(timer)
      if (pending) timer = setTimeout(() => { pending = false }, 1200)
      if (r.prevent) e.preventDefault()
      const h = ref.current
      if (r.action?.type === 'search') h.search?.()
      else if (r.action?.type === 'go') h.go?.(r.action.page)
      else if (r.action?.type === 'new-application') h.newApplication?.()
      else if (r.action?.type === 'help') h.help?.()
    }
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('keydown', onKey); clearTimeout(timer) }
  }, [])
}
