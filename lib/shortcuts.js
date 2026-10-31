/**
 * lib/shortcuts.js — the app's keyboard shortcuts, kept as plain data + one pure function so they can be tested.
 *   ⌘K / Ctrl+K  open search & actions        /  open search        ?  show this list        N  new application
 *   G then a letter  go to a page (see GO_KEYS)
 * Shortcuts are ignored while typing in a field, when a pop-up is open, or when Ctrl/⌘/Alt is held (except ⌘K).
 */
export const GO_KEYS = [
  { key: 'd', page: 'dashboard',   label: 'Today' },
  { key: 'a', page: 'enrollments', label: 'Applications' },
  { key: 'q', page: 'requests',    label: 'Requests' },
  { key: 't', page: 'tasks',       label: 'Tasks' },
  { key: 'l', page: 'alerts',      label: 'Alerts' },
  { key: 'x', page: 'screening',   label: 'Screening' },
  { key: 'p', page: 'providers',   label: 'Providers' },
  { key: 'y', page: 'payers',      label: 'Payers' },
  { key: 'o', page: 'groups',      label: 'Groups' },
  { key: 'm', page: 'matrix',      label: 'Billing Matrix' },
  { key: 'c', page: 'documents',   label: 'Documents' },
  { key: 'r', page: 'reports',     label: 'Reports' },
  { key: 'u', page: 'audit',       label: 'Audit Trail' },
  { key: 's', page: 'settings',    label: 'Settings' },
]
export const GO_KEY_FOR_PAGE = Object.fromEntries(GO_KEYS.map(g => [g.page, g.key.toUpperCase()]))

/**
 * Decide what a key press means.
 * @param {boolean} pendingG  true if "G" was pressed a moment ago
 * @param {{key:string, metaKey?:boolean, ctrlKey?:boolean, altKey?:boolean, typing?:boolean, dialogOpen?:boolean}} ev
 * @returns {{ pendingG:boolean, action:null|{type:string,page?:string}, prevent:boolean }}
 */
export function resolveShortcut(pendingG, ev) {
  const none = { pendingG: false, action: null, prevent: false }
  const key = (ev.key || '').toLowerCase()
  if ((ev.metaKey || ev.ctrlKey) && key === 'k') return { pendingG: false, action: { type: 'search' }, prevent: true }
  if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.typing || ev.dialogOpen) return none
  if (pendingG) {
    const hit = GO_KEYS.find(g => g.key === key)
    return hit ? { pendingG: false, action: { type: 'go', page: hit.page }, prevent: true } : none
  }
  if (key === 'g') return { pendingG: true, action: null, prevent: false }
  if (ev.key === '/') return { pendingG: false, action: { type: 'search' }, prevent: true }
  if (ev.key === '?') return { pendingG: false, action: { type: 'help' }, prevent: true }
  if (key === 'n') return { pendingG: false, action: { type: 'new-application' }, prevent: true }
  return none
}
