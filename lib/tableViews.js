/**
 * lib/tableViews.js — pure helpers for "which columns show" and "saved views" on a table.
 * columns: [{ id, label, locked?, hiddenByDefault? }]   (locked columns can never be hidden)
 * A view: { name, columns?: [ids to show], filters?: {…} }
 */
export const defaultHidden = (columns) => columns.filter(c => c.hiddenByDefault && !c.locked).map(c => c.id)

/** Hide/show one column. Locked and unknown columns are ignored. */
export function toggleHidden(hidden, id, columns) {
  const col = columns.find(c => c.id === id)
  if (!col || col.locked) return hidden
  return hidden.includes(id) ? hidden.filter(h => h !== id) : [...hidden, id]
}

/** Show exactly these columns (plus locked ones); everything else hidden. */
export function hiddenForColumnSet(columns, showIds) {
  return columns.filter(c => !c.locked && !showIds.includes(c.id)).map(c => c.id)
}

export const visibleColumns = (columns, hidden) => columns.filter(c => c.locked || !hidden.includes(c.id))

/** Adds or replaces a saved view by name (names compared ignoring case/space). Empty names are refused. */
export function addView(saved, view) {
  const name = String(view.name || '').trim().slice(0, 40)
  if (!name) return saved
  const same = v => v.name.trim().toLowerCase() === name.toLowerCase()
  return [...saved.filter(v => !same(v)), { ...view, name }].slice(-12)
}

export const removeView = (saved, name) => saved.filter(v => v.name !== name)

/** Stored values can be stale or hand-edited: keep only what is still valid. */
export const isHiddenList = (v) => Array.isArray(v) && v.every(x => typeof x === 'string')
export const isViewList = (v) => Array.isArray(v) && v.every(x => x && typeof x.name === 'string' && (!x.columns || Array.isArray(x.columns)) && (!x.filters || typeof x.filters === 'object'))
