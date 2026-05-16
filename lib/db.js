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

  await supabase.storage.from('provider-photos').remove([path])

  const { error: uploadError } = await supabase.storage
    .from('provider-photos')
    .upload(path, file, { upsert: true, contentType: file.type })

  if (uploadError) throw uploadError

  const { data } = supabase.storage
    .from('provider-photos')
    .getPublicUrl(path)

  const publicUrl = data.publicUrl + '?t=' + Date.now()

  const { error: updateError } = await supabase
    .from('providers')
    .update({ avatar_url: data.publicUrl })
    .eq('id', providerId)

  if (updateError) throw updateError

  safeAudit('Provider', 'Photo Uploaded', `Provider ${providerId}`, providerId)
  return publicUrl
}

export async function deleteProviderPhoto(providerId) {
  const paths = ['jpg','jpeg','png','webp'].map(ext => `${providerId}/avatar.${ext}`)
  await supabase.storage.from('provider-photos').remove(paths)
  await supabase.from('providers').update({ avatar_url: null }).eq('id', providerId)
  safeAudit('Provider', 'Photo Removed', `Provider ${providerId}`, providerId)
}

// ─── AUDIT ────────────────────────────────────────────────────────────────────
// FIX: Use getSession() instead of getUser() — getUser() makes a server
// round-trip that can lose the session context mid-request, causing auth.uid()
// to return null in Postgres RLS functions (current_org_id, is_admin, etc.)
// getSession() reads from the local JWT which is always available client-side.
async function getCurrentUser() {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return { id: null, email: null }
    return { id: session.user.id, email: session.user.email }
  } catch {
    return { id: null, email: null }
  }
}

// FIX: addAudit is now non-blocking — audit failures are logged to console
// but never throw to the caller. An audit write should never block a document
// save, provider update, or any other user-facing operation.
export async function addAudit(type, action, detail, entity) {
  try {
    const { id: performed_by, email: user_email } = await getCurrentUser()
    const { error } = await supabase.from('audit_log').insert([{
      type,
      action,
      detail,
      entity,
      performed_by,
      user_email,
    }])
    if (error) {
      console.warn('[addAudit] non-blocking audit write failed:', error.message, { type, action, detail })
    }
  } catch (err) {
    console.warn('[addAudit] unexpected error (non-blocking):', err?.message)
  }
}

// Convenience alias — fire-and-forget, never awaited by callers who don't care
// about the result. Use this for all audit calls so the pattern is consistent.
function safeAudit(type, action, detail, entity) {
  addAudit(type, action, detail, entity).catch(err =>
    console.warn('[safeAudit] dropped:', err?.message)
  )
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
      `[Lacentra] ${count} active providers in DB but only ${DEFAULT_LIST_LIMIT} loaded. ` +
      `Some providers are hidden. Implement pagination to fix this.`
    )
  }
  return (data || []).map(providerFromDb)
}

export async function upsertProvider(provider) {
  const dbObj = providerToDb(provider)
  if (!provider.id) delete dbObj.id
  const { data, error } = await supabase
    .from('providers')
    .upsert([dbObj])
    .select()
  if (error) throw error
  const saved = providerFromDb(data[0])
  safeAudit('Provider', provider.id ? 'Updated' : 'Added', `${saved.fname} ${saved.lname}, ${saved.cred}`, saved.id)
  return saved
}

export async function deleteProvider(id) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('providers')
    .update({ deleted_at: now })
    .eq('id', id)
  if (error) throw error

  const cascades = await Promise.allSettled([
    supabase.from('enrollments').update({ deleted_at: now }).eq('prov_id', id).is('deleted_at', null),
    supabase.from('documents').update({ deleted_at: now }).eq('prov_id', id).is('deleted_at', null),
    supabase.from('tasks').update({ deleted_at: now }).eq('prov_id', id).is('deleted_at', null),
  ])

  const failures = cascades.filter(r => r.status === 'rejected' || r.value?.error)
  if (failures.length) {
    console.warn('[deleteProvider] Cascade partially failed:', failures.map(r => r.reason?.message || r.value?.error?.message))
  }

  safeAudit('Provider', 'Deleted', `Provider ${id} (enrollments, documents, tasks cascaded)`, id)
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
    console.warn(`[Lacentra] ${count} active payers in DB but only ${DEFAULT_LIST_LIMIT} loaded.`)
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
  safeAudit('Payer', payer.id ? 'Updated' : 'Added', saved.name, saved.id)
  return saved
}

export async function deletePayer(id) {
  const { error } = await supabase
    .from('payers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  safeAudit('Payer', 'Deleted', id, id)
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
    console.warn(`[Lacentra] ${count} active enrollments in DB but only ${DEFAULT_LIST_LIMIT} loaded.`)
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
  safeAudit('Enrollment', enrollment.id ? 'Updated' : 'Created', `${provName} / ${payName} [${saved.stage}]`, saved.id)
  return saved
}

export async function deleteEnrollment(id) {
  const { error } = await supabase
    .from('enrollments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  safeAudit('Enrollment', 'Deleted', id, id)
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
    console.warn(`[Lacentra] ${count} active documents in DB but only ${DEFAULT_LIST_LIMIT} loaded.`)
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

  if (error) {
    // Log the full error object so it shows in Vercel logs with the real code
    console.error('[upsertDocument] failed:', JSON.stringify(error), 'payload:', JSON.stringify(dbObj))
    throw error
  }

  const saved = documentFromDb(data[0])

  // FIX: audit is fire-and-forget — never blocks or throws on the document save
  safeAudit('Document', doc.id ? 'Updated' : 'Added', `${provName} — ${saved.type}`, saved.id)

  return saved
}

// ─── DOCUMENT FILE UPLOAD ─────────────────────────────────────────────────────
const ALLOWED_DOC_TYPES = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'tiff']
const MAX_DOC_SIZE_MB = 10

export async function uploadDocumentFile(documentId, providerId, file) {
  // Client-side validation before sending
  const ext = file.name.split('.').pop().toLowerCase()
  if (!ALLOWED_DOC_TYPES.includes(ext)) {
    throw new Error(`File type .${ext} not allowed. Use: ${ALLOWED_DOC_TYPES.join(', ')}`)
  }
  if (file.size > MAX_DOC_SIZE_MB * 1024 * 1024) {
    throw new Error(`File must be under ${MAX_DOC_SIZE_MB}MB. This file is ${(file.size / 1024 / 1024).toFixed(1)}MB.`)
  }

  // Route through server-side API which uses the service role key.
  // This bypasses all RLS and JWT issues — server handles the upload
  // with elevated credentials. Service key never reaches the browser.
  const formData = new FormData()
  formData.append('file', file)
  formData.append('documentId', documentId)
  formData.append('providerId', providerId)

  const res = await fetch('/api/upload-document', {
    method: 'POST',
    body: formData,
    // Do NOT set Content-Type — browser sets multipart/form-data
    // with the correct boundary automatically when using FormData
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Upload failed' }))
    console.error('[uploadDocumentFile] API route error:', err)
    throw new Error(err.error || `Upload failed with status ${res.status}`)
  }

  const { fileUrl, fileName } = await res.json()
  safeAudit('Document', 'File Attached', `${fileName} -> doc ${documentId}`, documentId)
  return { fileUrl, fileName }
}

export async function deleteDocumentFile(documentId, fileUrl) {
  if (!fileUrl) return

  const pathMatch = fileUrl.match(/\/documents\/([^?]+)/)
  if (pathMatch?.[1]) {
    const storagePath = decodeURIComponent(pathMatch[1])
    const { error: removeError } = await supabase.storage.from('documents').remove([storagePath])
    if (removeError) {
      console.warn('[deleteDocumentFile] Storage remove failed:', removeError.message, { storagePath })
    }
  }
  await supabase.from('documents').update({ file_url: null, file_name: null }).eq('id', documentId)
  safeAudit('Document', 'File Removed', `doc ${documentId}`, documentId)
}

export async function deleteDocument(id) {
  let fileUrl = null
  let fileName = null
  try {
    const { data: doc } = await supabase
      .from('documents')
      .select('file_url, file_name')
      .eq('id', id)
      .single()
    fileUrl  = doc?.file_url  || null
    fileName = doc?.file_name || null
  } catch (_) {
    console.warn('[deleteDocument] Could not fetch file_url before delete — storage cleanup skipped')
  }

  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error

  if (fileUrl) {
    deleteDocumentFile(id, fileUrl).catch(err =>
      console.warn('[deleteDocument] Storage cleanup failed (non-blocking):', err.message)
    )
  }

  safeAudit('Document', 'Deleted', fileName || id, id)
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
    console.warn(`[Lacentra] ${count} active tasks in DB but only ${DEFAULT_LIST_LIMIT} loaded.`)
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
  safeAudit('Task', task.id ? 'Updated' : 'Created', saved.task, saved.id)
  return saved
}

export async function deleteTask(id) {
  const { error } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  safeAudit('Task', 'Deleted', id, id)
}

export async function markTaskDone(id, taskName) {
  const { error } = await supabase
    .from('tasks')
    .update({ status: 'Done' })
    .eq('id', id)
  if (error) throw error
  safeAudit('Task', 'Completed', taskName, id)
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
  // HIPAA §164.312(b): audit logs are append-only. Records the archive request
  // in the audit trail but does not delete rows — that requires a privileged
  // admin operation outside the browser client.
  await addAudit('Audit', 'Archive Requested', 'User requested audit log archive', 'system')
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
      email_expiry:         settings.emailExpiry         !== false,
      task_reminders:       settings.taskReminders        !== false,
      doc_expiry:           settings.docExpiry            !== false,
      enable_audit_log:     settings.enableAuditLog       !== false,
      caqh_reminders:       settings.caqhReminders        !== false,
      app_status_alerts:    settings.appStatusAlerts      !== false,
      weekly_digest:        settings.weeklyDigest         !== false,
      onboarding_checklist: settings.onboardingChecklist  !== false,
      two_factor:           settings.twoFactor            === true,
      session_timeout:      settings.sessionTimeout       !== false,
      ip_allowlist:         settings.ipAllowlist          === true,
    }])
  if (error) throw error
  safeAudit('Settings', 'Updated', 'Practice settings saved', '1')
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
  safeAudit('Eligibility', obj.id ? 'Updated' : 'Added', `${obj.patient_name} — ${obj.status || 'Pending'}`, data[0].id)
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
  if (obj.cpt_codes && typeof obj.cpt_codes === 'string')
    obj.cpt_codes = obj.cpt_codes.split(',').map(s => s.trim()).filter(Boolean)
  if (obj.diagnosis_codes && typeof obj.diagnosis_codes === 'string')
    obj.diagnosis_codes = obj.diagnosis_codes.split(',').map(s => s.trim()).filter(Boolean)
  const { data, error } = await supabase
    .from('claims')
    .upsert([obj])
    .select()
  if (error) throw error
  safeAudit('Claim', obj.id ? 'Updated' : 'Added', `${obj.patient_name} — $${obj.billed_amount || 0}`, data[0].id)
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
  safeAudit('Denial', obj.id ? 'Updated' : 'Logged', `${obj.reason_code || ''} — ${obj.appeal_status || 'Not Started'}`, data[0].id)
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

// ─── LOAD ALL (initial page load) ─────────────────────────────────────────────
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

// ─── REALTIME SUBSCRIPTION ────────────────────────────────────────────────────
export function subscribeToAll(onUpdate, orgId) {
  function handler(stateKey, fromDb) {
    return (payload) => {
      const { eventType, new: newRow, old: oldRow } = payload

      if (eventType === 'UPDATE' && newRow?.deleted_at) {
        onUpdate(stateKey, null, 'DELETE', newRow.id)
        return
      }

      const mapped = newRow && Object.keys(newRow).length > 0 ? fromDb(newRow) : null
      onUpdate(stateKey, mapped, eventType, oldRow?.id)
    }
  }

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

// ─── REALTIME STATE MERGER ────────────────────────────────────────────────────
export function mergeRealtimeChange(prevDb, stateKey, mappedRow, eventType, oldId) {
  const list = prevDb[stateKey] ?? []

  if (eventType === 'DELETE') {
    return { ...prevDb, [stateKey]: list.filter(r => r.id !== oldId) }
  }

  if (eventType === 'INSERT') {
    if (list.some(r => r.id === mappedRow.id)) return prevDb
    return { ...prevDb, [stateKey]: [mappedRow, ...list] }
  }

  if (eventType === 'UPDATE') {
    const found = list.some(r => r.id === mappedRow.id)
    if (found) {
      return { ...prevDb, [stateKey]: list.map(r => r.id === mappedRow.id ? mappedRow : r) }
    }
    return { ...prevDb, [stateKey]: [mappedRow, ...list] }
  }

  return prevDb
}
