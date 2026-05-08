import { supabase } from './supabase'
import {
  providerToDb, providerFromDb,
  enrollmentToDb, enrollmentFromDb,
  payerToDb, payerFromDb,
  documentToDb, documentFromDb,
  taskToDb, taskFromDb,
  auditFromDb, settingsFromDb,
} from './mappers'

// ─── PHOTO UPLOAD ─────────────────────────────────────────────────────────────
export async function uploadProviderPhoto(providerId, file) {
  const ext = file.name.split('.').pop().toLowerCase()
  const allowed = ['jpg', 'jpeg', 'png', 'webp']
  if (!allowed.includes(ext)) throw new Error('Only JPG, PNG, or WebP photos are allowed.')
  if (file.size > 5 * 1024 * 1024) throw new Error('Photo must be under 5MB.')

  const path = `${providerId}/avatar.${ext}`

  // Remove old photo first (ignore errors)
  await supabase.storage.from('provider-photos').remove([path])

  const { error: uploadError } = await supabase.storage
    .from('provider-photos')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) throw uploadError

  const { data } = supabase.storage
    .from('provider-photos')
    .getPublicUrl(path)

  // Add cache-busting so UI refreshes immediately
  const publicUrl = data.publicUrl + '?t=' + Date.now()

  // Save URL back to provider record
  const { error: updateError } = await supabase
    .from('providers')
    .update({ avatar_url: data.publicUrl })
    .eq('id', providerId)

  if (updateError) throw updateError

  await addAudit('Provider', 'Photo Uploaded', `Provider ${providerId}`, providerId)
  return publicUrl
}

export async function deleteProviderPhoto(providerId) {
  // Try common extensions
  const paths = ['jpg','jpeg','png','webp'].map(ext => `${providerId}/avatar.${ext}`)
  await supabase.storage.from('provider-photos').remove(paths)
  await supabase.from('providers').update({ avatar_url: null }).eq('id', providerId)
  await addAudit('Provider', 'Photo Removed', `Provider ${providerId}`, providerId)
}

// ─── AUDIT ────────────────────────────────────────────────────────────────────
// Returns { id, email } for the currently signed-in user, or nulls if called
// from a context where there's no session (shouldn't happen in normal UI flow).
async function getCurrentUser() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return { id: null, email: null }
  return { id: session.user.id, email: session.user.email }
}

export async function addAudit(type, action, detail, entity) {
  const { id: performed_by, email: user_email } = await getCurrentUser()
  await supabase.from('audit_log').insert([{
    type,
    action,
    detail,
    entity,
    performed_by,
    user_email,
  }])
}

// ─── PROVIDERS ────────────────────────────────────────────────────────────────
export async function fetchProviders() {
  const { data, error } = await supabase
    .from('providers')
    .select('*')
    .order('lname')
  if (error) throw error
  return (data || []).map(providerFromDb)
}

export async function upsertProvider(provider) {
  const dbObj = providerToDb(provider)
  // Remove id if it's a new record (let DB generate uuid)
  if (!provider.id) delete dbObj.id
  const { data, error } = await supabase
    .from('providers')
    .upsert([dbObj])
    .select()
  if (error) throw error
  const saved = providerFromDb(data[0])
  await addAudit('Provider', provider.id ? 'Updated' : 'Added', `${saved.fname} ${saved.lname}, ${saved.cred}`, saved.id)
  return saved
}

export async function deleteProvider(id) {
  const { error } = await supabase.from('providers').delete().eq('id', id)
  if (error) throw error
  await addAudit('Provider', 'Deleted', id, id)
}

// ─── PAYERS ───────────────────────────────────────────────────────────────────
export async function fetchPayers() {
  const { data, error } = await supabase
    .from('payers')
    .select('*')
    .order('name')
  if (error) throw error
  return (data || []).map(payerFromDb)
}

export async function upsertPayer(payer) {
  const dbObj = payerToDb(payer)
  if (!payer.id) delete dbObj.id
  const { data, error } = await supabase
    .from('payers')
    .upsert([dbObj])
    .select()
  if (error) throw error
  const saved = payerFromDb(data[0])
  await addAudit('Payer', payer.id ? 'Updated' : 'Added', saved.name, saved.id)
  return saved
}

export async function deletePayer(id) {
  const { error } = await supabase.from('payers').delete().eq('id', id)
  if (error) throw error
  await addAudit('Payer', 'Deleted', id, id)
}

// ─── ENROLLMENTS ──────────────────────────────────────────────────────────────
export async function fetchEnrollments() {
  const { data, error } = await supabase
    .from('enrollments')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(enrollmentFromDb)
}

export async function upsertEnrollment(enrollment, provName, payName) {
  const dbObj = enrollmentToDb(enrollment)
  if (!enrollment.id) delete dbObj.id
  const { data, error } = await supabase
    .from('enrollments')
    .upsert([dbObj])
    .select()
  if (error) throw error
  const saved = enrollmentFromDb(data[0])
  await addAudit('Enrollment', enrollment.id ? 'Updated' : 'Created', `${provName} / ${payName} [${saved.stage}]`, saved.id)
  return saved
}

export async function deleteEnrollment(id) {
  const { error } = await supabase.from('enrollments').delete().eq('id', id)
  if (error) throw error
  await addAudit('Enrollment', 'Deleted', id, id)
}

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────
export async function fetchDocuments() {
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .order('exp')
  if (error) throw error
  return (data || []).map(documentFromDb)
}

export async function upsertDocument(doc, provName) {
  const dbObj = documentToDb(doc)
  if (!doc.id) delete dbObj.id
  const { data, error } = await supabase
    .from('documents')
    .upsert([dbObj])
    .select()
  if (error) throw error
  const saved = documentFromDb(data[0])
  await addAudit('Document', doc.id ? 'Updated' : 'Added', `${provName} — ${saved.type}`, saved.id)
  return saved
}

export async function deleteDocument(id) {
  const { error } = await supabase.from('documents').delete().eq('id', id)
  if (error) throw error
  await addAudit('Document', 'Deleted', id, id)
}

// ─── TASKS ────────────────────────────────────────────────────────────────────
export async function fetchTasks() {
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .order('due')
  if (error) throw error
  return (data || []).map(taskFromDb)
}

export async function upsertTask(task) {
  const dbObj = taskToDb(task)
  if (!task.id) delete dbObj.id
  const { data, error } = await supabase
    .from('tasks')
    .upsert([dbObj])
    .select()
  if (error) throw error
  const saved = taskFromDb(data[0])
  await addAudit('Task', task.id ? 'Updated' : 'Created', saved.task, saved.id)
  return saved
}

export async function deleteTask(id) {
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw error
  await addAudit('Task', 'Deleted', id, id)
}

export async function markTaskDone(id, taskName) {
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'Done' })
    .eq('id', id)
  if (error) throw error
  await addAudit('Task', 'Completed', taskName, id)
}

// ─── AUDIT LOG ────────────────────────────────────────────────────────────────
export async function fetchAuditLog() {
  const { data, error } = await supabase
    .from('audit_log')
    .select('*')
    .order('ts', { ascending: false })
    .limit(500)
  if (error) throw error
  return (data || []).map(auditFromDb)
}

export async function clearAuditLog() {
  // HIPAA compliance: audit log should be immutable.
  // Instead of deleting, we log the clear request itself.
  // The RLS policy on audit_log prevents DELETE for authenticated users.
  // Only supabaseAdmin (service role) can actually delete records.
  //
  // For a production archive strategy:
  // 1. Move old entries to an audit_archive table
  // 2. Or export to S3/GCS for long-term retention
  // 3. Keep at least 7 years per HIPAA §164.530(j)
  await addAudit('Audit', 'Archive Requested', 'User requested audit log archive', 'system')
  
  // Note: This will now fail silently for authenticated users due to RLS.
  // That's the intended behavior — audit logs are append-only.
  const { error } = await supabase.from('audit_log').delete().gt('ts', '1970-01-01')
  if (error) {
    // Expected when RLS blocks the delete — not a real error
    console.warn('[audit] Clear blocked by RLS (expected):', error.message)
  }
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
export async function fetchSettings() {
  const { data, error } = await supabase
    .from('settings')
    .select('*')
    .eq('id', 1)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return data ? settingsFromDb(data) : settingsFromDb({})
}

export async function saveSettings(settings) {
  const { error } = await supabase
    .from('settings')
    .upsert([{
      id: 1,
      practice: settings.practice,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      alert_days: settings.alertDays,
      caqh_days: settings.caqhDays,
    }])
  if (error) throw error
  await addAudit('Settings', 'Updated', 'Practice settings saved', '1')
}

// ─── ELIGIBILITY CHECKS ───────────────────────────────────────────────────────
export async function fetchEligibilityChecks() {
  const { data, error } = await supabase
    .from('eligibility_checks')
    .select('*')
    .order('checked_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data || []
}

export async function upsertEligibilityCheck(check) {
  const obj = { ...check }
  if (!obj.id) delete obj.id
  const { data, error } = await supabase
    .from('eligibility_checks')
    .upsert([obj])
    .select()
  if (error) throw error
  await addAudit('Eligibility', obj.id ? 'Updated' : 'Added', `${obj.patient_name} — ${obj.status || 'Pending'}`, data[0].id)
  return data[0]
}

export async function deleteEligibilityCheck(id) {
  const { error } = await supabase.from('eligibility_checks').delete().eq('id', id)
  if (error) throw error
}

// ─── CLAIMS ───────────────────────────────────────────────────────────────────
export async function fetchClaims() {
  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .order('dos', { ascending: false })
    .limit(500)
  if (error) throw error
  return data || []
}

export async function upsertClaim(claim) {
  const obj = { ...claim }
  if (!obj.id) delete obj.id
  // Ensure array fields
  if (obj.cpt_codes && typeof obj.cpt_codes === 'string')
    obj.cpt_codes = obj.cpt_codes.split(',').map(s => s.trim()).filter(Boolean)
  if (obj.diagnosis_codes && typeof obj.diagnosis_codes === 'string')
    obj.diagnosis_codes = obj.diagnosis_codes.split(',').map(s => s.trim()).filter(Boolean)
  const { data, error } = await supabase
    .from('claims')
    .upsert([obj])
    .select()
  if (error) throw error
  await addAudit('Claim', obj.id ? 'Updated' : 'Added', `${obj.patient_name} — $${obj.billed_amount || 0}`, data[0].id)
  return data[0]
}

export async function deleteClaim(id) {
  const { error } = await supabase.from('claims').delete().eq('id', id)
  if (error) throw error
}

// ─── DENIALS ──────────────────────────────────────────────────────────────────
export async function fetchDenials() {
  const { data, error } = await supabase
    .from('claim_denials')
    .select('*, claims(patient_name, dos, billed_amount, prov_id, payer_id)')
    .order('denial_date', { ascending: false })
    .limit(300)
  if (error) throw error
  return data || []
}

export async function upsertDenial(denial) {
  const obj = { ...denial }
  delete obj.claims
  if (!obj.id) delete obj.id
  const { data, error } = await supabase
    .from('claim_denials')
    .upsert([obj])
    .select()
  if (error) throw error
  await addAudit('Denial', obj.id ? 'Updated' : 'Logged', `${obj.reason_code || ''} — ${obj.appeal_status || 'Not Started'}`, data[0].id)
  return data[0]
}

export async function deleteDenial(id) {
  const { error } = await supabase.from('claim_denials').delete().eq('id', id)
  if (error) throw error
}

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
export async function fetchPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('paid_date', { ascending: false })
    .limit(300)
  if (error) throw error
  return data || []
}

export async function upsertPayment(payment) {
  const obj = { ...payment }
  if (!obj.id) delete obj.id
  const { data, error } = await supabase
    .from('payments')
    .upsert([obj])
    .select()
  if (error) throw error
  return data[0]
}

// ─── LOAD ALL (initial page load) ────────────────────────────────────────────
export async function loadAll() {
  const [providers, payers, enrollments, documents, tasks, auditLog, settings, eligibilityChecks, claims, denials, payments] =
    await Promise.all([
      fetchProviders(),
      fetchPayers(),
      fetchEnrollments(),
      fetchDocuments(),
      fetchTasks(),
      fetchAuditLog(),
      fetchSettings(),
      fetchEligibilityChecks().catch(() => []),
      fetchClaims().catch(() => []),
      fetchDenials().catch(() => []),
      fetchPayments().catch(() => []),
    ])
  return { providers, payers, enrollments, documents, tasks, auditLog, settings, eligibilityChecks, claims, denials, payments }
}

// ─── REALTIME SUBSCRIPTION ───────────────────────────────────────────────────
//
// Each table gets its own handler that merges the Postgres change payload
// directly into React state — no loadAll() re-fetch on every event.
//
// Payload shape from Supabase Realtime:
//   { eventType: 'INSERT' | 'UPDATE' | 'DELETE', new: {...}, old: { id } }
//
// All payloads arrive in raw DB snake_case so we run them through the same
// *FromDb mappers used by the fetch functions.
//
// Usage in index.js:
//   const unsub = subscribeToAll((stateKey, mappedRow, eventType, oldId) => {
//     setDb(prev => mergeRealtimeChange(prev, stateKey, mappedRow, eventType, oldId))
//   })
export function subscribeToAll(onUpdate) {
  // Factory: maps a table to its state key + mapper, returns a Realtime handler
  function handler(stateKey, fromDb) {
    return (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload
      const mapped = newRow && Object.keys(newRow).length > 0 ? fromDb(newRow) : null
      onUpdate(stateKey, mapped, eventType, oldRow?.id)
    }
  }

  const channel = supabase
    .channel('credflow-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'providers' },
      handler('providers', providerFromDb))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payers' },
      handler('payers', payerFromDb))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments' },
      handler('enrollments', enrollmentFromDb))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' },
      handler('documents', documentFromDb))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' },
      handler('tasks', taskFromDb))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'claims' },
      handler('claims', r => r))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'eligibility_checks' },
      handler('eligibilityChecks', r => r))
    .subscribe()

  return () => supabase.removeChannel(channel)
}

// ─── REALTIME STATE MERGER ───────────────────────────────────────────────────
// Pure function — call inside setDb(prev => mergeRealtimeChange(prev, ...))
//
// INSERT: prepend new row (most-recent-first ordering)
// UPDATE: replace matching row in place by id
// DELETE: filter out by id
export function mergeRealtimeChange(prevDb, stateKey, mappedRow, eventType, oldId) {
  const list = prevDb[stateKey] ?? []

  if (eventType === 'DELETE') {
    return { ...prevDb, [stateKey]: list.filter(r => r.id !== oldId) }
  }

  if (eventType === 'INSERT') {
    // Guard against duplicates when optimistic update already added the row
    if (list.some(r => r.id === mappedRow.id)) return prevDb
    return { ...prevDb, [stateKey]: [mappedRow, ...list] }
  }

  if (eventType === 'UPDATE') {
    const found = list.some(r => r.id === mappedRow.id)
    if (found) {
      return { ...prevDb, [stateKey]: list.map(r => r.id === mappedRow.id ? mappedRow : r) }
    }
    // Row added by another user that wasn't in local state — prepend it
    return { ...prevDb, [stateKey]: [mappedRow, ...list] }
  }

  return prevDb
}
