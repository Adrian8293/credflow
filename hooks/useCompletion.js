import { useState, useCallback, useRef } from 'react'
import { upsertTask } from '../lib/db'
import { followUpTask } from '../lib/completion'

/**
 * Promise-based completion check, same pattern as useConfirm.
 * const c = await requestCompletion({ title, subject, context })
 * c is null when the person cancelled (nothing must be marked done), otherwise { note, followUp }.
 */
export function useCompletion() {
  const [completionDialog, setCompletionDialog] = useState(null)
  const resolver = useRef(null)

  const requestCompletion = useCallback((config) => new Promise(resolve => {
    resolver.current?.(null)               // a second request replaces the first, which counts as cancelled
    resolver.current = resolve
    setCompletionDialog(config)
  }), [])

  const settleCompletion = useCallback((result) => {
    resolver.current?.(result || null)
    resolver.current = null
    setCompletionDialog(null)
  }, [])

  return { completionDialog, requestCompletion, settleCompletion }
}

// Creates the follow-up task when the person said something is still pending. Never throws: the completion
// itself is already saved, so a failure here is reported and the person can add the task by hand.
export async function saveFollowUp(completion, source, { setDb, toast }) {
  if (!completion?.followUp) return null
  try {
    const saved = await upsertTask(followUpTask(completion.followUp, source))
    setDb(prev => prev.tasks.some(x => x.id === saved.id) ? prev : { ...prev, tasks: [...prev.tasks, saved] })
    toast(`Follow-up task created for ${completion.followUp.due}.`, 'success')
    return saved
  } catch (err) {
    toast(`Completed, but the follow-up task could not be saved: ${err.message}. Please add it by hand.`, 'error')
    return null
  }
}
