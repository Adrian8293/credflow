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
export async function addAudit(type, action, detail, entity) {
  await supabase.from('audit_log').insert([{ type, action, detail, entity }])
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
  const { error } = await supabase.from('audit_log').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  if (error) throw error
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

// ─── LOAD ALL (initial page load) ────────────────────────────────────────────
export async function loadAll() {
  const [providers, payers, enrollments, documents, tasks, auditLog, settings] =
    await Promise.all([
      fetchProviders(),
      fetchPayers(),
      fetchEnrollments(),
      fetchDocuments(),
      fetchTasks(),
      fetchAuditLog(),
      fetchSettings(),
    ])
  return { providers, payers, enrollments, documents, tasks, auditLog, settings }
}

// ─── REALTIME SUBSCRIPTION ───────────────────────────────────────────────────
export function subscribeToAll(onUpdate) {
  const channel = supabase
    .channel('credentialiq-realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'providers' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'payers' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'enrollments' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'documents' }, onUpdate)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, onUpdate)
    .subscribe()
  return () => supabase.removeChannel(channel)
}
