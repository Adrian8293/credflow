import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
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
    // A-01/A-02: Track truncation state so the UI can render a persistent warning banner.
    providersMeta: { truncated: false, total: 0 },
  })
  const [loading, setLoading] = useState(true)
  const [settingsForm, setSettingsForm] = useState({})

  // A-03 FIX: Resolve the organization UUID at login time from organization_members.
  // Previously, user.id (auth UUID) was passed as orgId to subscribeToAll(), causing
  // the realtime filter `org_id=eq.{user.id}` to never match any row because org_id
  // columns store organization UUIDs, not user UUIDs. All realtime events were silently
  // dropped as a result.
  const [orgId, setOrgId] = useState(null)

  useEffect(() => {
    if (!user) return
    supabase
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .single()
      .then(({ data, error }) => {
        if (error) {
          // Non-fatal: org_id may not be backfilled yet (pre S-01 activation).
          // Realtime subscriptions will run without an org filter until then.
          console.warn('[useAppData] Could not resolve orgId from organization_members:', error.message)
          return
        }
        if (data?.org_id) setOrgId(data.org_id)
      })
  }, [user])

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

  // Realtime subscription — org-scoped once orgId is resolved (post S-01 activation).
  // A-03 FIX: Pass the resolved org UUID, not user.id.
  // D-03 FIX: claim_denials and payments channels now include orgFilter in db.js.
  useEffect(() => {
    if (!user) return
    const unsub = subscribeToAll((stateKey, mappedRow, eventType, oldId) => {
      setDb(prev => mergeRealtimeChange(prev, stateKey, mappedRow, eventType, oldId))
    }, orgId)   // orgId is null until resolved — subscribeToAll handles null gracefully
    return unsub
  }, [user, orgId])

  return { db, setDb, loading, settingsForm, setSettingsForm }
}
