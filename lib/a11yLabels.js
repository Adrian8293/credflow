/**
 * lib/a11yLabels.js — connects every form label to its field.
 * The app's forms are written as <div><label>Name</label><input/></div>, which looks right but gives
 * screen readers (and click-the-label-to-focus) nothing to hold on to. This links each such label to the one field
 * beside it by giving the field an id and the label a matching `for`. It only fills gaps: anything already linked,
 * or already carrying an aria-label, is left alone.
 */
let seq = 0

export function associateLabels(root) {
  if (!root || !root.querySelectorAll) return 0
  let linked = 0
  root.querySelectorAll('label:not([for])').forEach(label => {
    if (label.querySelector('input,select,textarea')) return               // already wrapped
    const group = label.parentElement
    if (!group) return
    const fields = group.querySelectorAll('input:not([type=hidden]),select,textarea')
    if (fields.length !== 1) return                                          // ambiguous (e.g. two inputs): skip
    const field = fields[0]
    if (field.getAttribute('aria-label') || field.getAttribute('aria-labelledby')) return
    if (!field.id) field.id = `lbl-${++seq}`
    label.setAttribute('for', field.id)
    linked++
  })
  return linked
}

/** Runs once now and again whenever the page changes (modals, drawers, tabs). Returns a stop function. */
export function watchLabels(root = typeof document !== 'undefined' ? document.body : null) {
  if (!root || typeof MutationObserver === 'undefined') return () => {}
  let queued = false
  const run = () => { queued = false; associateLabels(root) }
  const mo = new MutationObserver(() => { if (!queued) { queued = true; setTimeout(run, 50) } })
  mo.observe(root, { childList: true, subtree: true })
  run()
  return () => mo.disconnect()
}
