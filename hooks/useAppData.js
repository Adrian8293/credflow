import { useState, useEffect } from 'react'
import { loadAll, subscribeToAll, mergeRealtimeChange } from '../lib/db'

/**
 * Manages the entire application data state.
 * Owns the initial loadAll() fetch and the realtime subscription.
 * All feature hooks receive db + setDb from here.
 */
export function useAppData(user, toast) {
  const [db, setDb] = useState({
    providers: [], payers: [], enrollments: [], documents: [],
    tasks: [], auditLog: [], settings: {},
    eligibilityChecks: [], claims: [], denials: [], payments: [],
  })
  const [loading, setLoading] = useState(true)
  const [settingsForm, setSettingsForm] = useState({})

  // Initial load
  useEffect(() => {
    if (!user) return
    setLoading(true)
    loadAll()
      .then(data => {
        setDb(data)
        setSettingsForm(data.settings)
        setLoading(false)
      })
      .catch(err => {
        toast('Error loading data: ' + err.message, 'error')
        setLoading(false)
      })
  }, [user])

  // Realtime subscription — org-scoped once org_id is backfilled
  useEffect(() => {
    if (!user) return
    const unsub = subscribeToAll((stateKey, mappedRow, eventType, oldId) => {
      setDb(prev => mergeRealtimeChange(prev, stateKey, mappedRow, eventType, oldId))
    }, user.id)
    return unsub
  }, [user])

  return { db, setDb, loading, settingsForm, setSettingsForm }
}
