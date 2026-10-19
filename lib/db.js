import { supabase } from './supabase'
import {
  requestFromDb, licenseFromDb, licenseToDb,
  providerToDb, providerFromDb,
  enrollmentToDb, enrollmentFromDb,
  payerToDb, payerFromDb,
  documentToDb, documentFromDb,
  taskToDb, taskFromDb,
  auditFromDb, settingsFromDb,
} from './mappers'

const DEFAULT_LIST_LIMIT = 2000
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
  // A-01/A-02: Surface truncation — return flag so UI can render a warning banner.
  // Silent console.warn is not sufficient; hidden providers = missed credential alerts.
  const truncated = count > DEFAULT_LIST_LIMIT
  if (truncated) {
    console.warn(
      `[CredFlow] ${count} active providers in DB but only ${DEFAULT_LIST_LIMIT} loaded. ` +
      `Some providers are hidden. Server-side pagination required to fix this.`
    )
  }
  return { data: (data || []).map(providerFromDb), truncated, total: count ?? 0 }
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

/** Bulk-insert already-validated provider drafts (see lib/providerImport.js). org_id is stamped by trigger. */
export async function importProviders(providers) {
  const saved = []
  for (const part of chunked(providers)) {
    const { data, error } = await supabase.from('providers')
      .insert(part.map(p => { const d = providerToDb(p); delete d.id; return d }))
      .select()
    if (error) throw error
    saved.push(...(data || []).map(providerFromDb))
  }
  safeAudit('Provider', 'Imported', `${saved.length} provider(s) imported from CSV`, null)
  return saved
}

export async function deleteProvider(id, label) {
  // A-04 FIX: Use atomic Postgres RPC instead of Promise.allSettled.
  // The previous pattern soft-deleted the provider first, then cascaded children
  // via three separate calls. A network failure after the first call left orphaned
  // enrollments/documents visible in their lists with no owning provider.
  // The soft_delete_provider() function wraps all four UPDATEs in one transaction.
  //
  // Prerequisites: deploy supabase-migration-007.sql which creates this function.
  const { error } = await supabase.rpc('soft_delete_provider', { p_id: id })
  if (error) throw error
  safeAudit('Provider', 'Deleted', `${label || 'Provider ' + id} (enrollments, documents, tasks removed with it)`, id)
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

export async function deletePayer(id, label) {
  const { error } = await supabase
    .from('payers')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  safeAudit('Payer', 'Deleted', label || id, id)
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

// ─── BULK ENROLLMENT OPERATIONS ───────────────────────────────────────────────
// One request per 100 rows (RLS still applies to every row), and one audit entry per enrollment so the
// NCQA/URAC timeline stays reconstructable per record. Audit failures never block the change.
const BULK_CHUNK = 100
function chunked(arr, n = BULK_CHUNK) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

async function auditBatch(entries) {
  if (!entries.length) return
  try {
    const { id: performed_by, email: user_email } = await getCurrentUser()
    for (const part of chunked(entries, 200)) {
      const { error } = await supabase.from('audit_log').insert(
        part.map(e => ({ type: 'Enrollment', action: e.action, detail: e.detail, entity: e.entity, performed_by, user_email }))
      )
      if (error) console.warn('[auditBatch] non-blocking audit write failed:', error.message)
    }
  } catch (err) { console.warn('[auditBatch] dropped:', err?.message) }
}

/** Bulk-insert validated enrollments (see lib/enrollmentImport.js). org_id is stamped by trigger. */
export async function importEnrollments(items) {
  const saved = []
  for (const part of chunked(items)) {
    const { data, error } = await supabase.from('enrollments')
      .insert(part.map(i => { const d = enrollmentToDb(i.enrollment); delete d.id; return d }))
      .select()
    if (error) throw error
    saved.push(...(data || []).map(enrollmentFromDb))
  }
  const names = new Map(items.map(i => [`${i.enrollment.provId}|${i.enrollment.payId}`, `${i.provName} / ${i.payName}`]))
  await auditBatch(saved.map(s => ({ action: 'Created', detail: `${names.get(`${s.provId}|${s.payId}`) || 'Enrollment'} [${s.stage}] (CSV import)`, entity: s.id })))
  return saved
}

/** Apply the same change to many enrollments. `describe(before, after)` builds each audit line. */
async function bulkPatchEnrollments(ids, patch, action, describe, beforeById) {
  const saved = []
  for (const part of chunked(ids)) {
    const { data, error } = await supabase.from('enrollments').update(patch).in('id', part).is('deleted_at', null).select()
    if (error) throw error
    saved.push(...(data || []).map(enrollmentFromDb))
  }
  await auditBatch(saved.map(s => ({ action, detail: describe(beforeById[s.id], s), entity: s.id })))
  return saved
}

export const bulkSetStage = (ids, stage, beforeById, label) =>
  bulkPatchEnrollments(ids, { stage }, 'Stage Changed',
    (b, a) => `${label(a)}: "${b?.stage}" → "${a.stage}" (bulk)`, beforeById)

export const bulkSetFollowup = (ids, date, beforeById, label) =>
  bulkPatchEnrollments(ids, { followup: date || null }, date ? 'Follow-up Set' : 'Follow-up Cleared',
    (b, a) => `${label(a)}: follow-up ${b?.followup || 'none'} → ${a.followup || 'none'} (bulk)`, beforeById)

export async function bulkDeleteEnrollments(ids, beforeById, label) {
  const done = []
  for (const part of chunked(ids)) {
    const { data, error } = await supabase.from('enrollments')
      .update({ deleted_at: new Date().toISOString() }).in('id', part).is('deleted_at', null).select('id')
    if (error) throw error
    done.push(...(data || []).map(r => r.id))
  }
  await auditBatch(done.map(id => ({ action: 'Deleted', detail: `${label(beforeById[id])} (bulk)`, entity: id })))
  return done
}

export async function deleteEnrollment(id, label) {
  const { error } = await supabase
    .from('enrollments')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  safeAudit('Enrollment', 'Deleted', label || id, id)
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

  const { storagePath, fileName } = await res.json()
  // S-02: upload-document now returns storagePath (storage object path) instead of
  // a pre-generated signed URL. Map to filePath for the document state and mapper.
  safeAudit('Document', 'File Attached', `${fileName} -> doc ${documentId}`, documentId)
  return { filePath: storagePath, fileName }
}

export async function deleteDocumentFile(documentId, filePathOrUrl) {
  if (!filePathOrUrl) return

  // S-02: resolve the storage path from either a bare file_path or a legacy signed URL
  let storagePath = null
  if (filePathOrUrl.startsWith('http')) {
    // Legacy: extract path from signed URL (.../documents/PATH?token=...)
    const pathMatch = filePathOrUrl.match(/\/documents\/([^?]+)/)
    if (pathMatch?.[1]) storagePath = decodeURIComponent(pathMatch[1])
  } else {
    // New: filePathOrUrl is already the bare storage path (e.g. "providerId/docId/ts_file.pdf")
    storagePath = filePathOrUrl
  }

  if (storagePath) {
    const { error: removeError } = await supabase.storage.from('documents').remove([storagePath])
    if (removeError) {
      console.warn('[deleteDocumentFile] Storage remove failed:', removeError.message, { storagePath })
    }
  }

  // S-02: clear both columns — file_path for new records, file_url for legacy
  await supabase.from('documents')
    .update({ file_url: null, file_path: null, file_name: null })
    .eq('id', documentId)

  safeAudit('Document', 'File Removed', `doc ${documentId}`, documentId)
}

export async function deleteDocument(id) {
  let storagePath = null
  let fileName = null
  try {
    // S-02: fetch both file_path (new records) and file_url (legacy records)
    const { data: doc } = await supabase
      .from('documents')
      .select('file_path, file_url, file_name')
      .eq('id', id)
      .single()
    // Prefer file_path (new); fall back to file_url (legacy signed URL)
    storagePath = doc?.file_path || doc?.file_url || null
    fileName    = doc?.file_name || null
  } catch (_) {
    console.warn('[deleteDocument] Could not fetch file paths before delete — storage cleanup skipped')
  }

  const { error } = await supabase
    .from('documents')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error

  if (storagePath) {
    deleteDocumentFile(id, storagePath).catch(err =>
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

export async function deleteTask(id, label) {
  const { error } = await supabase
    .from('tasks')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw error
  safeAudit('Task', 'Deleted', label || id, id)
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
    .maybeSingle()   // RLS limits this to the active organization's single row
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
    }], { onConflict: 'org_id' })   // one settings row per organization (migration 014)
  if (error) throw error
  safeAudit('Settings', 'Updated', 'Practice settings saved', '1')
}

// ─── DOCUMENT REQUESTS (provider portal) ───────────────────────────────────────
export async function fetchRequests() {
  const { data, error } = await supabase
    .from('doc_requests')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(1000)
  if (error) {
    // Table missing until migration 015 is run: keep the rest of the app working.
    console.warn('[fetchRequests]', error.message)
    return []
  }
  return (data || []).map(requestFromDb)
}

export async function createRequest({ provId, docType, title, note, due }) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('doc_requests').insert([{
    prov_id: provId, doc_type: docType, title: title.trim(),
    note: note?.trim() || null, due: due || null, requested_by: user?.id ?? null,
  }]).select().single()
  if (error) throw error
  safeAudit('Request', 'Created', `${title} requested`, data.id)
  return requestFromDb(data)
}

export async function reviewRequest(id, approve, reason) {
  const { data: { user } } = await supabase.auth.getUser()
  const { data, error } = await supabase.from('doc_requests').update({
    status: approve ? 'approved' : 'rejected',
    reject_reason: approve ? null : (reason?.trim() || 'Please resubmit'),
    reviewed_at: new Date().toISOString(), reviewed_by: user?.id ?? null,
  }).eq('id', id).select().single()
  if (error) throw error
  safeAudit('Request', approve ? 'Approved' : 'Rejected', `request ${id}`, id)
  return requestFromDb(data)
}

export async function cancelRequest(id) {
  const { error } = await supabase.from('doc_requests')
    .update({ status: 'cancelled', deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  safeAudit('Request', 'Cancelled', `request ${id}`, id)
}

// ─── ADDITIONAL STATE LICENSES ─────────────────────────────────────────────────
export async function fetchLicenses() {
  const { data, error } = await supabase
    .from('provider_licenses').select('*').is('deleted_at', null)
    .order('state', { ascending: true }).limit(2000)
  if (error) {
    // Table missing until migration 016 is run: keep the rest of the app working.
    console.warn('[fetchLicenses]', error.message)
    return []
  }
  return (data || []).map(licenseFromDb)
}

export async function saveLicense(license) {
  const row = licenseToDb(license)
  if (!row.provider_id) throw new Error('Choose a provider.')
  if (!/^[A-Z]{2}$/.test(row.state)) throw new Error('Choose a state.')
  const q = license.id
    ? supabase.from('provider_licenses').update(row).eq('id', license.id)
    : supabase.from('provider_licenses').insert([row])
  const { data, error } = await q.select().single()
  if (error) {
    if (error.code === '23505') throw new Error('That provider already has this license type in that state.')
    throw error
  }
  safeAudit('License', license.id ? 'Updated' : 'Added', `${row.state} ${row.license_type || 'license'}`, row.provider_id)
  return licenseFromDb(data)
}

export async function deleteLicense(id, provId) {
  const { error } = await supabase.from('provider_licenses')
    .update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
  safeAudit('License', 'Removed', `license ${id}`, provId)
}

// ─── ACCESS (members + invites; owner/admin only) ──────────────────────────────
export async function fetchMembers() {
  const { data, error } = await supabase.rpc('org_members_admin')
  if (error) throw error
  return data || []
}
export async function setMemberRole(userId, role, providerId) {
  const { error } = await supabase.rpc('set_member_role', { p_user: userId, p_role: role, p_provider: providerId || null })
  if (error) throw error
}
export async function removeMember(userId) {
  const { error } = await supabase.rpc('remove_member', { p_user: userId })
  if (error) throw error
}
export async function fetchInvites() {
  const { data, error } = await supabase.from('portal_invites')
    .select('id, email, role, provider_id, expires_at, created_at, accepted_at, revoked_at')
    .is('accepted_at', null).is('revoked_at', null)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}
export async function revokeInvite(id) {
  const { error } = await supabase.from('portal_invites').update({ revoked_at: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ─── LOAD ALL (initial page load) ─────────────────────────────────────────────
export async function loadAll() {
  const [providersResult, payers, enrollments, documents, tasks, auditLog, settings, requests, licenses] =
    await Promise.all([
      fetchProviders(),
      fetchPayers(),
      fetchEnrollments(),
      fetchDocuments(),
      fetchTasks(),
      fetchAuditLog(),
      fetchSettings(),
      fetchRequests(),
      fetchLicenses(),
    ])
  // A-01/A-02: fetchProviders now returns { data, truncated, total } — unwrap for state
  return {
    providers:       providersResult.data,
    providersMeta:   { truncated: providersResult.truncated, total: providersResult.total },
    payers, enrollments, documents, tasks, auditLog, settings, requests, licenses,
  }
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'doc_requests', ...orgFilter('doc_requests') },
      handler('requests', requestFromDb))
    .on('postgres_changes', { event: '*', schema: 'public', table: 'provider_licenses', ...orgFilter('provider_licenses') },
      handler('licenses', licenseFromDb))
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

// ─── ENROLLMENT CONTACT LOG ───────────────────────────────────────────────────
export async function fetchContacts(enrollmentId) {
  const { data, error } = await supabase
    .from('enrollment_contacts')
    .select('*')
    .eq('enrollment_id', enrollmentId)
    .order('contacted_at', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data || []
}

export async function addContact(enrollmentId, c) {
  const row = {
    enrollment_id: enrollmentId,
    contacted_at: c.contactedAt,
    method: c.method,
    contact_name: c.contactName || null,
    reference_no: c.referenceNo || null,
    summary: c.summary,
    next_followup: c.nextFollowup || null,
  }
  const { data, error } = await supabase.from('enrollment_contacts').insert([row]).select()
  if (error) throw error
  // Keep the enrollment's follow-up date in sync so dashboards/alerts pick it up.
  if (c.nextFollowup) {
    const { error: e2 } = await supabase.from('enrollments').update({ followup: c.nextFollowup }).eq('id', enrollmentId)
    if (e2) throw e2
  }
  safeAudit('Enrollment', 'Contact logged', `${c.method}${c.referenceNo ? ` ref ${c.referenceNo}` : ''}`, enrollmentId)
  return data[0]
}

export async function deleteContact(id, enrollmentId) {
  const { error } = await supabase.from('enrollment_contacts').delete().eq('id', id)
  if (error) throw error
  safeAudit('Enrollment', 'Contact log entry deleted', 'Contact log entry removed', enrollmentId || id)
}

// ─── ENROLLMENT CHECKLIST (manual tick-offs) ──────────────────────────────────
export async function fetchChecklist(enrollmentId) {
  const { data, error } = await supabase
    .from('enrollment_checklist').select('item_key, done').eq('enrollment_id', enrollmentId)
  if (error) throw error
  return Object.fromEntries((data || []).filter(r => r.done).map(r => [r.item_key, true]))
}

export async function setChecklistItem(enrollmentId, key, done) {
  const { error } = await supabase.from('enrollment_checklist').upsert(
    [{ enrollment_id: enrollmentId, item_key: key, done, updated_at: new Date().toISOString() }],
    { onConflict: 'enrollment_id,item_key' }
  )
  if (error) throw error
}

// ─── LEGAL ENTITIES / LOCATIONS / PAYER CONTRACTS (migration 013) ─────────────
const entityFromDb = (r) => ({
  id: r.id, name: r.name || '', entityType: r.entity_type || 'LLC', stateOfFormation: r.state_of_formation || '',
  einLast4: r.ein_last4 || '', type2Npi: r.type2_npi || '', holdsCoa: !!r.holds_or_coa, notes: r.notes || '',
})
const contractFromDb = (r) => ({
  id: r.id, entityId: r.entity_id, payerId: r.payer_id, state: r.state || '', productLine: r.product_line || '',
  contractNo: r.contract_no || '', contractEffective: r.contract_effective || '', termDate: r.term_date || '',
  delegated: !!r.delegated_credentialing, rosterCadence: r.roster_cadence || '', associatePolicy: r.associate_policy || '', notes: r.notes || '',
})
const locationFromDb = (r) => ({
  id: r.id, entityId: r.entity_id, name: r.name || '', address: r.address || '', city: r.city || '',
  state: r.state || '', zip: r.zip || '', taxonomy: r.taxonomy || '',
})

export async function fetchEntities() {
  const { data, error } = await supabase.from('legal_entities').select('*').order('created_at')
  if (error) throw error
  return (data || []).map(entityFromDb)
}
export async function upsertEntity(e) {
  const row = {
    name: e.name.trim(), entity_type: e.entityType || 'LLC', state_of_formation: e.stateOfFormation || null,
    ein_last4: e.einLast4 || null, type2_npi: e.type2Npi || null, holds_or_coa: !!e.holdsCoa, notes: e.notes || null,
  }
  if (e.id) row.id = e.id
  const { data, error } = await supabase.from('legal_entities').upsert([row]).select()
  if (error) throw error
  safeAudit('Group', e.id ? 'Updated' : 'Created', row.name, data[0].id)
  return entityFromDb(data[0])
}

export async function fetchContracts(entityId) {
  const { data, error } = await supabase.from('payer_contracts').select('*').eq('entity_id', entityId).order('created_at')
  if (error) throw error
  return (data || []).map(contractFromDb)
}
export async function upsertContract(c) {
  const row = {
    entity_id: c.entityId, payer_id: c.payerId, state: c.state || null, product_line: c.productLine || null,
    contract_no: c.contractNo || null, contract_effective: c.contractEffective || null, term_date: c.termDate || null,
    delegated_credentialing: !!c.delegated, roster_cadence: c.rosterCadence || null,
    associate_policy: c.associatePolicy || null, notes: c.notes || null,
  }
  if (c.id) row.id = c.id
  const { data, error } = await supabase.from('payer_contracts').upsert([row]).select()
  if (error) throw error
  safeAudit('Group contract', c.id ? 'Updated' : 'Created', `${row.state || ''} ${row.product_line || ''}`.trim() || 'contract', data[0].id)
  return contractFromDb(data[0])
}
export async function deleteContract(id, label) {
  const { error } = await supabase.from('payer_contracts').delete().eq('id', id)
  if (error) throw error
  safeAudit('Group contract', 'Deleted', label || id, id)
}

export async function fetchLocations(entityId) {
  const { data, error } = await supabase.from('entity_locations').select('*').eq('entity_id', entityId).order('created_at')
  if (error) throw error
  return (data || []).map(locationFromDb)
}
export async function upsertLocation(l) {
  const row = { entity_id: l.entityId, name: l.name.trim(), address: l.address || null, city: l.city || null, state: l.state || null, zip: l.zip || null, taxonomy: l.taxonomy || null }
  if (l.id) row.id = l.id
  const { data, error } = await supabase.from('entity_locations').upsert([row]).select()
  if (error) throw error
  safeAudit('Group location', l.id ? 'Updated' : 'Created', row.name, data[0].id)
  return locationFromDb(data[0])
}
export async function deleteLocation(id, label) {
  const { error } = await supabase.from('entity_locations').delete().eq('id', id)
  if (error) throw error
  safeAudit('Group location', 'Deleted', label || id, id)
}
