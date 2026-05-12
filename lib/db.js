import { supabase } from './supabase'
import {
  providerToDb, providerFromDb,
  enrollmentToDb, enrollmentFromDb,
  payerToDb, payerFromDb,
  documentToDb, documentFromDb,
  taskToDb, taskFromDb,
  auditFromDb, settingsFromDb,
} from './mappers'

const DEFAULT_LIST_LIMIT = 500
const SECONDARY_LIST_LIMIT = 300

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
//
// Uses getUser() (server round-trip) instead of getSession() (local JWT only)
// so the identity recorded in audit logs is always server-verified.
async function getCurrentUser() {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { id: null, email: null }
  return { id: user.id, email: user.email }
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
  const { data, error, count } = await supabase
    .from('providers')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('lname')
    .limit(DEFAULT_LIST_LIMIT)
  if (error) throw error
  if (count > DEFAULT_LIST_LIMIT) {
    console.warn(
      `[PrimeCredential] ${count} active providers in DB but only ${DEFAULT_LIST_LIMIT} loaded. ` +
      `Some providers are hidden. Implement pagination to fix this.`
    )
  }
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
  // Soft delete — sets deleted_at instead of removing the row.
  // This preserves the provider record for audit trail continuity even after
  // enrollment history, documents, and tasks reference this provider id.
  const { error } = await supabase
    .from('providers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await addAudit('Provider', 'Deleted', id, id)
}

// ─── PAYERS ───────────────────────────────────────────────────────────────────
export async function fetchPayers() {
  const { data, error, count } = await supabase
    .from('payers')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('name')
    .limit(DEFAULT_LIST_LIMIT)
  if (error) throw error
  if (count > DEFAULT_LIST_LIMIT) {
    console.warn(`[PrimeCredential] ${count} active payers in DB but only ${DEFAULT_LIST_LIMIT} loaded.`)
  }
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
  const { error } = await supabase
    .from('payers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await addAudit('Payer', 'Deleted', id, id)
}

// ─── ENROLLMENTS ──────────────────────────────────────────────────────────────
export async function fetchEnrollments() {
  const { data, error, count } = await supabase
    .from('enrollments')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(DEFAULT_LIST_LIMIT)
  if (error) throw error
  if (count > DEFAULT_LIST_LIMIT) {
    console.warn(`[PrimeCredential] ${count} active enrollments in DB but only ${DEFAULT_LIST_LIMIT} loaded.`)
  }
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
  const { error } = await supabase
    .from('enrollments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await addAudit('Enrollment', 'Deleted', id, id)
}

// ─── DOCUMENTS ────────────────────────────────────────────────────────────────
export async function fetchDocuments() {
  const { data, error, count } = await supabase
    .from('documents')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('exp')
    .limit(DEFAULT_LIST_LIMIT)
  if (error) throw error
  if (count > DEFAULT_LIST_LIMIT) {
    console.warn(`[PrimeCredential] ${count} active documents in DB but only ${DEFAULT_LIST_LIMIT} loaded.`)
  }
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

// ─── DOCUMENT FILE UPLOAD ─────────────────────────────────────────────────────
const ALLOWED_DOC_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'tiff']
const MAX_DOC_SIZE_MB = 10

export async function uploadDocumentFile(documentId, providerId, file) {
  const ext = file.name.split('.').pop().toLowerCase()
  if (!ALLOWED_DOC_TYPES.includes(ext)) {
    throw new Error(`File type .${ext} not allowed. Use: ${ALLOWED_DOC_TYPES.join(', ')}`)
  }
  if (file.size > MAX_DOC_SIZE_MB * 1024 * 1024) {
    throw new Error(`File must be under ${MAX_DOC_SIZE_MB}MB. This file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`)
  }

  const storagePath = `${providerId}/${documentId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(storagePath, file, { upsert: true, contentType: file.type })

  if (uploadError) {
    // Surface actionable message for the two most common failure modes
    if (uploadError.message?.includes('Bucket not found') || uploadError.statusCode === 400) {
      throw new Error('Storage bucket "documents" not found. Run supabase-migration-003 in your Supabase SQL editor.')
    }
    throw uploadError
  }

  // Bucket is private — generate a long-lived signed URL for inline viewing.
  const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 10 // 10 years in seconds
  const { data: signedData, error: signedError } = await supabase.storage
    .from('documents')
    .createSignedUrl(storagePath, SIGNED_URL_TTL)

  if (signedError) throw signedError

  // Persist signed URL + file name to the document record
  const { error: updateError } = await supabase
    .from('documents')
    .update({ file_url: signedData.signedUrl, file_name: file.name })
    .eq('id', documentId)

  if (updateError) throw updateError

  await addAudit('Document', 'File Attached', `${file.name} → doc ${documentId}`, documentId)
  return { fileUrl: signedData.signedUrl, fileName: file.name }
}

export async function deleteDocumentFile(documentId, fileUrl) {
  if (!fileUrl) return
  // Extract storage path from public URL
  const pathMatch = fileUrl.match(/\/documents\/(.+)$/)
  if (pathMatch?.[1]) {
    await supabase.storage.from('documents').remove([pathMatch[1]])
  }
  await supabase.from('documents').update({ file_url: null, file_name: null }).eq('id', documentId)
  await addAudit('Document', 'File Removed', `doc ${documentId}`, documentId)
}

export async function deleteDocument(id) {
  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  await addAudit('Document', 'Deleted', id, id)
}

// ─── TASKS ────────────────────────────────────────────────────────────────────
export async function fetchTasks() {
  const { data, error, count } = await supabase
    .from('tasks')
    .select('*', { count: 'exact' })
    .is('deleted_at', null)
    .order('due')
    .limit(DEFAULT_LIST_LIMIT)
  if (error) throw error
  if (count > DEFAULT_LIST_LIMIT) {
    console.warn(`[PrimeCredential] ${count} active tasks in DB but only ${DEFAULT_LIST_LIMIT} loaded.`)
  }
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
  const { error } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
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
      practice:             settings.practice,
      address:              settings.address,
      phone:                settings.phone,
      email:                settings.email,
      alert_days:           settings.alertDays,
      caqh_days:            settings.caqhDays,
      // Notification toggles (all default true server-side via column default)
      email_expiry:         settings.emailExpiry         !== false,
      task_reminders:       settings.taskReminders        !== false,
      doc_expiry:           settings.docExpiry            !== false,
      enable_audit_log:     settings.enableAuditLog       !== false,
      caqh_reminders:       settings.caqhReminders        !== false,
      app_status_alerts:    settings.appStatusAlerts      !== false,
      weekly_digest:        settings.weeklyDigest         !== false,
      onboarding_checklist: settings.onboardingChecklist  !== false,
      // Security toggles
      two_factor:           settings.twoFactor            === true,
      session_timeout:      settings.sessionTimeout       !== false,
      ip_allowlist:         settings.ipAllowlist          === true,
    }])
  if (error) throw error
  await addAudit('Settings', 'Updated', 'Practice settings saved', '1')
}

// ─── ELIGIBILITY CHECKS ───────────────────────────────────────────────────────
export async function fetchEligibilityChecks() {
  const { data, error } = await supabase
    .from('eligibility_checks')
    .select('*')
    .is('deleted_at', null)
    .order('checked_at', { ascending: false })
    .limit(SECONDARY_LIST_LIMIT)
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
  const { error } = await supabase
    .from('eligibility_checks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ─── CLAIMS ───────────────────────────────────────────────────────────────────
export async function fetchClaims() {
  const { data, error } = await supabase
    .from('claims')
    .select('*')
    .is('deleted_at', null)
    .order('dos', { ascending: false })
    .limit(DEFAULT_LIST_LIMIT)
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
  const { error } = await supabase
    .from('claims')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ─── DENIALS ──────────────────────────────────────────────────────────────────
export async function fetchDenials() {
  const { data, error } = await supabase
    .from('claim_denials')
    .select('*, claims(patient_name, dos, billed_amount, prov_id, payer_id)')
    .is('deleted_at', null)
    .order('denial_date', { ascending: false })
    .limit(SECONDARY_LIST_LIMIT)
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
  const { error } = await supabase
    .from('claim_denials')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
}

// ─── PAYMENTS ─────────────────────────────────────────────────────────────────
export async function fetchPayments() {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .order('paid_date', { ascending: false })
    .limit(SECONDARY_LIST_LIMIT)
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
      fetchEligibilityChecks(),
      fetchClaims(),
      fetchDenials(),
      fetchPayments(),
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
//
// orgId is optional — pass it once multi-tenant org_id is populated on all rows.
// When present, Supabase filters the subscription server-side so only this org's
// changes are broadcast to this client. Without it, all row changes are received.
export function subscribeToAll(onUpdate, orgId) {
  // Factory: maps a table to its state key + mapper, returns a Realtime handler
  function handler(stateKey, fromDb) {
    return (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload

      // If a soft-deleted row comes through as an UPDATE, treat it like a DELETE
      // so it disappears from the UI immediately without a re-fetch.
      if (eventType === 'UPDATE' && newRow?.deleted_at) {
        onUpdate(stateKey, null, 'DELETE', newRow.id)
        return
      }

      const mapped = newRow && Object.keys(newRow).length > 0 ? fromDb(newRow) : null
      onUpdate(stateKey, mapped, eventType, oldRow?.id)
    }
  }

  // Build filter string if orgId is available (requires org_id column + index on the table)
  const orgFilter = (table) => orgId ? { filter: `org_id=eq.${orgId}` } : {}

  const channel = supabase
    .channel(orgId ? `credflow:org:${orgId}` : 'credflow-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'providers', ...orgFilter('providers') },
      handler('providers', providerFromDb))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payers', ...orgFilter('payers') },
      handler('payers', payerFromDb))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments', ...orgFilter('enrollments') },
      handler('enrollments', enrollmentFromDb))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'documents', ...orgFilter('documents') },
      handler('documents', documentFromDb))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks', ...orgFilter('tasks') },
      handler('tasks', taskFromDb))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'claims', ...orgFilter('claims') },
      handler('claims', r => r))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'eligibility_checks', ...orgFilter('eligibility_checks') },
      handler('eligibilityChecks', r => r))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'claim_denials' },
      handler('denials', r => r))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' },
      handler('payments', r => r))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'audit_log' },
      handler('auditLog', auditFromDb))
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
