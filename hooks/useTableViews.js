import { useCallback } from 'react'
import { usePersistedState } from './usePersistedState.js'
import { defaultHidden, toggleHidden, hiddenForColumnSet, visibleColumns, addView, removeView, isHiddenList, isViewList } from '../lib/tableViews.js'

/**
 * Column visibility + saved views for one table, remembered in this browser.
 *   const tv = useTableViews('providers', COLUMNS)   →   tv.isOn('npi'), tv.visibleCount, …
 */
export function useTableViews(tableId, columns) {
  const [hidden, setHidden] = usePersistedState(`lc_cols_${tableId}`, defaultHidden(columns), isHiddenList)
  const [saved, setSaved] = usePersistedState(`lc_views_${tableId}`, [], isViewList)

  const isOn = useCallback(id => { const c = columns.find(x => x.id === id); return !c || c.locked || !hidden.includes(id) }, [columns, hidden])
  const toggle = useCallback(id => setHidden(h => toggleHidden(h, id, columns)), [columns, setHidden])
  const reset = useCallback(() => setHidden(defaultHidden(columns)), [columns, setHidden])
  const showOnly = useCallback(ids => setHidden(hiddenForColumnSet(columns, ids)), [columns, setHidden])
  const saveView = useCallback((name, filters) => setSaved(s => addView(s, { name, columns: visibleColumns(columns, hidden).map(c => c.id), filters })), [columns, hidden, setSaved])
  const deleteView = useCallback(name => setSaved(s => removeView(s, name)), [setSaved])

  return { columns, hidden, saved, isOn, toggle, reset, showOnly, saveView, deleteView, visibleCount: visibleColumns(columns, hidden).length }
}
