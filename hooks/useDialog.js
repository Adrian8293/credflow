/**
 * useDialog — keyboard behaviour every pop-up (modal or side drawer) should have:
 *   1. When it opens, focus moves inside it (so keyboard and screen-reader users aren't left on the page behind).
 *   2. Tab / Shift+Tab stay inside it.
 *   3. Escape closes it — only the top-most one when pop-ups are stacked, never while a dropdown is open,
 *      and with a "discard what you typed?" check if the person has typed in it.
 *   4. When it closes, focus returns to the button that opened it.
 * Usage: const ref = useRef(null); useDialog(ref, onClose, { active: open })  then  <div ref={ref} role="dialog" aria-modal="true">
 */
import { useEffect, useRef } from 'react'

const stack = []
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])'

export function useDialog(ref, onClose, { active = true, escape = true } = {}) {
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose })   // always call the latest onClose without re-running the main effect

  useEffect(() => {
    const el = ref.current
    if (!active || !el) return undefined
    const opener = document.activeElement
    const token = {}
    stack.push(token)
    let dirty = false
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')

    const items = () => [...el.querySelectorAll(FOCUSABLE)].filter(n => n.getClientRects().length > 0)

    if (!el.contains(document.activeElement)) {
      const list = items()
      const isClose = n => n.classList.contains('modal-close') || n.classList.contains('x-close') || /^close/i.test(n.getAttribute('aria-label') || '')
      // First usable control, except a dropdown (focusing it would swallow Escape) — then focus the pop-up itself.
      const firstUse = list.find(n => !isClose(n))
      const target = firstUse && /^(INPUT|BUTTON|TEXTAREA|A)$/.test(firstUse.tagName) ? firstUse : el
      target.focus({ preventScroll: true })
    }

    const onInput = () => { dirty = true }
    el.addEventListener('input', onInput)

    const onKey = e => {
      if (stack[stack.length - 1] !== token) return          // only the top-most pop-up reacts
      if (e.key === 'Tab') {
        const list = items()
        if (!list.length) { e.preventDefault(); el.focus(); return }
        const first = list[0]; const last = list[list.length - 1]
        if (!el.contains(document.activeElement)) { e.preventDefault(); first.focus(); return }
        if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus() }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
      } else if (e.key === 'Escape' && escape) {
        const t = e.target
        if (e.defaultPrevented || t?.tagName === 'SELECT' || t?.getAttribute?.('aria-expanded') === 'true') return
        if (dirty && !window.confirm('Close without saving? What you typed here will be lost.')) return
        closeRef.current?.()
      }
    }
    document.addEventListener('keydown', onKey)

    return () => {
      document.removeEventListener('keydown', onKey)
      el.removeEventListener('input', onInput)
      const i = stack.indexOf(token); if (i >= 0) stack.splice(i, 1)
      if (opener && opener !== document.body && document.contains(opener)) opener.focus?.({ preventScroll: true })
    }
  }, [active, escape, ref])
}
