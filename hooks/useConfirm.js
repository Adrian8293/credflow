import { useState, useCallback, useRef } from 'react'

/**
 * Promise-based confirm dialog.
 * Usage: const confirmed = await requestConfirm({ title, body, confirmText, danger })
 */
export function useConfirm() {
  const [confirmDialog, setConfirmDialog] = useState(null)
  const confirmResolver = useRef(null)

  const requestConfirm = useCallback((config) => new Promise(resolve => {
    confirmResolver.current = resolve
    setConfirmDialog(config)
  }), [])

  const settleConfirm = useCallback((result) => {
    confirmResolver.current?.(result)
    confirmResolver.current = null
    setConfirmDialog(null)
  }, [])

  return { confirmDialog, requestConfirm, settleConfirm }
}
