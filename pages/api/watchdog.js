/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  Lacentra — Automated Expiration Watchdog
 *  FILE: pages/api/watchdog.js
 *
 *  This API route is the heart of the Watchdog. It:
 *    1. Queries `providers` for expiring credentials
 *    2. Queries `documents` for expiring docs
 *    3. Queries `enrollments` for overdue follow-ups
 *    4. Writes a task for every alert that doesn't already exist
 *    5. Logs every action to `audit_log`
 *    6. Returns a summary JSON so callers can surface alerts in the UI
 *
 *  SCHEDULING — two patterns (choose one):
 *    A) Vercel Cron (recommended for Next.js on Vercel)
 *       Add to vercel.json:
 *         { "crons": [{ "path": "/api/watchdog", "schedule": "0 14 * * *" }] }
 *       0 14 * * * = 2:00 AM UTC = 6:00 AM Pacific Time (Oregon)
 *       Secure it with CRON_SECRET (Vercel sends it as a Bearer token).
 *
 *    B) External cron (Railway, Render, cron-job.org)
 *       Hit GET /api/watchdog with header `x-cron-secret: YOUR_CRON_SECRET` every 24 h.
 *
 *  PHASE 2.4 CHANGES:
 *    - Added _orgId module-level variable, resolved from organization_members
 *      at the start of each handler run
 *    - createTask() now writes org_id on every inserted task
 *    - audit() now writes org_id on every audit_log entry
 *    - New rows are visible to authenticated users under org-scoped RLS
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { enforceRateLimit } from '../../lib/api-middleware'
import { features } from '../../lib/features'
import { sendEmail } from '../../lib/mailer'
import { buildDigest } from '../../lib/digest'
import { todayIn, daysUntilDate } from '../../lib/tzDate'
import { ladderStep, ladderKey, ladderPriority, stalledEnrollment, isInProgress } from '../../lib/alertLadder'

// Use service-role key so we bypass RLS (this is a server-only route)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // never expose this to the client
)

// ─── Phase 2.4: org_id resolved once per handler run ─────────────────────────
// Populated at the start of each request — written to all tasks + audit entries
// so they are visible under org-scoped RLS policies.
let _orgId = null

// Read helper scoped to the organization currently being processed (service role bypasses RLS,
// so every read must filter by org explicitly).
function orgFrom(table) {
  const t = supabase.from(table)
  return { select: (...a) => t.select(...a).eq('org_id', _orgId) }
}

// ─── Configuration ────────────────────────────────────────────────────────────
const DEFAULT_ALERT_DAYS = 90   // warn X days before expiry
const DEFAULT_FOLLOWUP_OVERDUE = 0 // flag follow-ups on or past due date

// Which provider fields represent expiration dates (field → human label)
// NOTE: caqh_attest is intentionally excluded — it is the date of last attestation
// (a trailing indicator). caqh_due is the forward-looking deadline that matters.
// This must stay in sync with ALERT_FIELDS in lib/helpers.js.
const PROVIDER_EXP_FIELDS = {
  license_exp:  'License',
  mal_exp:      'Malpractice Insurance',
  dea_exp:      'DEA Certificate',
  sup_exp:      'Supervisory Agreement',
  caqh_due:     'CAQH Attestation',
  recred:       'Re-credentialing',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function safeEqual(a, b) {
  const ab = Buffer.from(a), bb = Buffer.from(b)
  return ab.length === bb.length && timingSafeEqual(ab, bb)
}

// Dates are counted in the practice's own time zone (not the server's UTC), so a manual run in the
// evening doesn't treat tomorrow as today. See lib/tzDate.js.
function daysUntil(dateStr) {
  return daysUntilDate(dateStr)
}

function isoToday() {
  return todayIn()
}

// Deduplicate: don't create a task if an open one with this dedup key exists
async function taskExists(dedupKey) {
  const { data } = await orgFrom('tasks')
    .select('id')
    .eq('dedup_key', dedupKey)
    .in('status', ['Open', 'In Progress'])
    .limit(1)
  return (data?.length ?? 0) > 0
}

// ─── Phase 2.4: org_id added to every task insert ────────────────────────────
async function createTask({ task, due, priority, cat, provId, payId, dedupKey }) {
  if (await taskExists(dedupKey)) return false
  await supabase.from('tasks').insert([{
    task,
    due,
    priority,
    status:    'Open',
    cat,
    prov_id:   provId    ?? null,
    pay_id:    payId     ?? null,
    dedup_key: dedupKey,
    org_id:    _orgId    ?? null,   // Phase 2.4
  }])
  return true
}

// A reminder that fires once per step of the 90/60/30/7-day ladder.
//  - Same step again tomorrow: nothing (even if the earlier task was finished or deleted), so nobody is re-nagged.
//  - A tighter step: one fresh, more urgent task, and the older still-open reminder for the same item is retired
//    (soft-deleted, so it stays in the audit history). `base` is the old per-item key, which also retires tasks made
//    before the ladder existed.
async function createLadderTask({ base, step, task, due, priority, cat, provId }) {
  const key = ladderKey(base, step)
  const { data: already } = await orgFrom('tasks').select('id').eq('dedup_key', key).limit(1)
  if (already?.length) return false
  let retire = supabase.from('tasks').update({ deleted_at: new Date().toISOString() })
    .or(`dedup_key.eq.${base},dedup_key.like.${base}:s*`).neq('dedup_key', key)
    .in('status', ['Open', 'In Progress']).is('deleted_at', null)
  if (_orgId) retire = retire.eq('org_id', _orgId)
  await retire
  return createTask({ task, due, priority, cat, provId, dedupKey: key })
}

// ─── Phase 2.4: org_id added to every audit_log insert ───────────────────────
async function audit(action, detail, entity) {
  await supabase.from('audit_log').insert([{
    type:   'Watchdog',
    action,
    detail,
    entity: entity ?? 'system',
    org_id: _orgId  ?? null,        // Phase 2.4
  }])
}

// ─── Check: Provider credential fields ───────────────────────────────────────
async function checkProviderExpiries(alertDays, alerts) {
  const { data: providers, error } = await orgFrom('providers')
    .select('id, fname, lname, cred, ' + Object.keys(PROVIDER_EXP_FIELDS).join(', '))
    .eq('status', 'Active')
    .is('deleted_at', null)   // exclude soft-deleted providers

  if (error) throw error

  for (const prov of providers) {
    const name = `${prov.lname}, ${prov.fname}${prov.cred ? ` ${prov.cred}` : ''}`
    for (const [field, label] of Object.entries(PROVIDER_EXP_FIELDS)) {
      const days = daysUntil(prov[field])
      const step = ladderStep(days, alertDays)
      if (step === null) continue

      const severity = days <= 0 ? 'EXPIRED' : days <= 7 ? 'CRITICAL' : days <= 30 ? 'HIGH' : 'WARNING'
      const priority = ladderPriority(step)
      const taskText = days <= 0
        ? `⚠️ EXPIRED: ${label} for ${name} expired ${Math.abs(days)}d ago`
        : `🔔 ${label} expiring in ${days}d — ${name}`

      const created = await createLadderTask({
        base:    `watchdog:provider:${prov.id}:${field}:${prov[field]}`,
        step,
        task:    taskText,
        due:     prov[field],
        priority,
        cat:     'Credential Expiry',
        provId:  prov.id,
      })

      if (created) {
        await audit('Task Created', taskText, prov.id)
      }

      alerts.push({ type: 'provider', severity, provId: prov.id, provName: name, label, days, field, created })
    }
  }
}

// ─── Check: additional state licenses (provider_licenses, migration 016) ────
async function checkStateLicenseExpiries(alertDays, alerts) {
  const { data: rows, error } = await orgFrom('provider_licenses')
    .select('id, provider_id, state, license_type, expires, status')
    .not('expires', 'is', null)
    .neq('status', 'Inactive')
    .is('deleted_at', null)
  if (error) {
    if (/provider_licenses|schema cache|does not exist/i.test(error.message || '')) return   // migration 016 not run yet
    throw error
  }
  if (!rows?.length) return

  const { data: providers } = await orgFrom('providers')
    .select('id, fname, lname, cred').eq('status', 'Active').is('deleted_at', null)
  const provMap = Object.fromEntries((providers ?? []).map(p => [p.id, p]))

  for (const l of rows) {
    const prov = provMap[l.provider_id]
    if (!prov) continue
    const days = daysUntil(l.expires)
    const step = ladderStep(days, alertDays)
    if (step === null) continue
    const name  = `${prov.lname}, ${prov.fname}${prov.cred ? ` ${prov.cred}` : ''}`
    const label = `${l.state} License${l.license_type ? ` (${l.license_type})` : ''}`
    const priority = ladderPriority(step)
    const taskText = days <= 0
      ? `⚠️ EXPIRED: ${label} for ${name} expired ${Math.abs(days)}d ago`
      : `🔔 ${label} expiring in ${days}d — ${name}`
    const created = await createLadderTask({
      base: `watchdog:license:${l.id}:${l.expires}`, step,
      task: taskText, due: l.expires, priority, cat: 'Credential Expiry', provId: prov.id,
    })
    if (created) await audit('Task Created', taskText, prov.id)
    alerts.push({ type: 'license', severity: days <= 0 ? 'EXPIRED' : days <= 7 ? 'CRITICAL' : days <= 30 ? 'HIGH' : 'WARNING', provId: prov.id, provName: name, label, days, created })
  }
}

// ─── Email digest (FEATURE_EMAIL_DIGEST) ─────────────────────────────────────
// Monday: full weekly digest (Settings → "Weekly credentialing digest").
// Other days: only deadlines that hit a milestone today (Settings → "expiration emails"), so nobody gets the
// same overdue item every morning. At most one digest per org per day (audit_log guard); ?digest=now forces one.
async function sendOrgDigest(org, alertDays, settings, force) {
  if (!features.emailDigest()) return { skipped: 'feature off' }
  const today = isoToday()
  const monday = new Date().getUTCDay() === 1
  const weeklyOn = settings?.weekly_digest !== false
  const urgentOn = settings?.email_expiry !== false
  const mode = force || monday ? 'weekly' : 'urgent'
  if (!force && !(monday && weeklyOn) && !(!monday && urgentOn)) return { skipped: 'turned off in settings' }

  if (!force) {
    const { data: already } = await orgFrom('audit_log').select('id').eq('type', 'Digest').gte('ts', `${today}T00:00:00Z`).limit(1)
    if (already?.length) return { skipped: 'already sent today' }
  }

  const soon = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
  const [prov, lic, tasks, enr, reqs, pay] = await Promise.all([
    orgFrom('providers').select('id, fname, lname, cred, ' + Object.keys(PROVIDER_EXP_FIELDS).join(', ')).eq('status', 'Active').is('deleted_at', null),
    orgFrom('provider_licenses').select('provider_id, state, license_type, expires, status').is('deleted_at', null),
    orgFrom('tasks').select('prov_id, task, due, status').neq('status', 'Done').is('deleted_at', null).lte('due', soon),
    orgFrom('enrollments').select('prov_id, pay_id, stage, followup').not('followup', 'is', null).lte('followup', soon).is('deleted_at', null),
    orgFrom('doc_requests').select('status').eq('status', 'submitted').is('deleted_at', null),
    orgFrom('payers').select('id, name').is('deleted_at', null),
  ])
  if (prov.error) throw prov.error
  const digest = buildDigest({
    orgName: org.name, appUrl: process.env.NEXT_PUBLIC_APP_URL, todayISO: today, alertDays, mode,
    providers: prov.data || [], licenses: lic.error ? [] : lic.data || [], tasks: tasks.data || [],
    enrollments: enr.data || [], requests: reqs.error ? [] : reqs.data || [], payers: pay.data || [],
  })
  if (mode === 'urgent' && digest.items.length === 0) return { skipped: 'nothing at a milestone today' }

  const { data: members } = await supabase.from('organization_members').select('user_id').eq('org_id', org.id).in('role', ['owner', 'admin'])
  const emails = new Set()
  for (const m of members || []) {
    const { data } = await supabase.auth.admin.getUserById(m.user_id)
    if (data?.user?.email) emails.add(data.user.email)
  }
  if (!emails.size) return { skipped: 'no owner/admin emails' }

  // One email per recipient so addresses are never exposed to each other.
  let sent = 0
  for (const to of emails) { await sendEmail({ to, subject: digest.subject, html: digest.html, text: digest.text }); sent++ }
  await supabase.from('audit_log').insert([{ type: 'Digest', action: mode === 'weekly' ? 'Weekly digest sent' : 'Milestone alert sent', detail: `${digest.items.length} item(s) to ${sent} recipient(s)`, entity: 'system', org_id: org.id }])
  return { sent, items: digest.items.length, mode }
}

// ─── Check: Documents table ───────────────────────────────────────────────────
async function checkDocumentExpiries(alertDays, alerts) {
  const { data: docs, error } = await orgFrom('documents')
    .select('id, prov_id, type, issuer, number, exp')
    .not('exp', 'is', null)
    .gte('exp', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10))
    .is('deleted_at', null)   // exclude soft-deleted documents

  if (error) throw error

  const { data: providers } = await orgFrom('providers')
    .select('id, fname, lname, cred')
    .is('deleted_at', null)

  const provMap = Object.fromEntries((providers ?? []).map(p => [p.id, p]))

  for (const doc of docs) {
    const days = daysUntil(doc.exp)
    const step = ladderStep(days, alertDays)
    if (step === null) continue

    const prov = provMap[doc.prov_id]
    const provName = prov ? `${prov.lname}, ${prov.fname}` : 'Unknown Provider'
    const label = [doc.type, doc.issuer].filter(Boolean).join(' — ')
    const priority = ladderPriority(step)
    const taskText = days <= 0
      ? `⚠️ EXPIRED Document: ${label} for ${provName}`
      : `📄 Document expiring in ${days}d: ${label} — ${provName}`

    const created = await createLadderTask({
      base: `watchdog:doc:${doc.id}:${doc.exp}`, step,
      task: taskText,
      due: doc.exp,
      priority,
      cat: 'Document Expiry',
      provId: doc.prov_id,
    })

    if (created) await audit('Task Created', taskText, doc.prov_id)
    alerts.push({ type: 'document', days, label, provName, docId: doc.id, created })
  }
}

// ─── Check: Enrollment follow-ups ────────────────────────────────────────────
async function checkEnrollmentFollowups(alerts) {
  const { data: enrollments, error } = await orgFrom('enrollments')
    .select('id, prov_id, pay_id, stage, followup')
    .not('followup', 'is', null)
    .lte('followup', isoToday())
    .not('stage', 'in', '(Active,Denied)')
    .is('deleted_at', null)

  if (error) throw error

  const { data: providers } = await orgFrom('providers')
    .select('id, fname, lname')
    .is('deleted_at', null)
  const { data: payers } = await orgFrom('payers').select('id, name')
  const provMap  = Object.fromEntries((providers ?? []).map(p => [p.id, p]))
  const payerMap = Object.fromEntries((payers    ?? []).map(p => [p.id, p]))

  for (const enr of enrollments) {
    const prov  = provMap[enr.prov_id]
    const payer = payerMap[enr.pay_id]
    const provName  = prov  ? `${prov.lname}, ${prov.fname}` : 'Unknown'
    const payerName = payer?.name ?? 'Unknown Payer'
    const days = daysUntil(enr.followup)
    const taskText = `📞 Follow-up overdue: ${provName} @ ${payerName} (${enr.stage})`
    const dedupKey = `watchdog:enrollment:${enr.id}:followup:${enr.followup}`

    const created = await createTask({
      task: taskText,
      due: enr.followup,
      priority: 'High',
      cat: 'Follow-up',
      provId: enr.prov_id,
      payId: enr.pay_id,
      dedupKey,
    })

    if (created) await audit('Task Created', taskText, enr.id)
    alerts.push({ type: 'followup', days, provName, payerName, enrollmentId: enr.id, created })
  }
}

// ─── Check: CAQH attestation staleness ───────────────────────────────────────
// CAQH auto-deactivates a provider profile after 120 days of no attestation.
const CAQH_ATTEST_WARNING_DAYS = 110  // 10-day buffer before 120d cutoff

async function checkCaqhStaleness(alerts) {
  const cutoff = new Date(Date.now() - CAQH_ATTEST_WARNING_DAYS * 86_400_000)
    .toISOString().slice(0, 10)

  const { data: providers, error } = await orgFrom('providers')
    .select('id, fname, lname, cred, caqh_attest, caqh_num')
    .eq('status', 'Active')
    .is('deleted_at', null)
    .not('caqh_attest', 'is', null)
    .lte('caqh_attest', cutoff)

  if (error) throw error

  for (const prov of providers) {
    const name = `${prov.lname}, ${prov.fname}${prov.cred ? ` ${prov.cred}` : ''}`
    const daysSince = Math.abs(daysUntil(prov.caqh_attest))
    const taskText = daysSince >= 120
      ? `⚠️ CAQH LIKELY DEACTIVATED: ${name} — ${daysSince}d since last attestation (>${CAQH_ATTEST_WARNING_DAYS}d)`
      : `🔔 CAQH At Risk: ${name} — ${daysSince}d since last attestation (deactivates at 120d)`

    const dedupKey = `watchdog:caqh-stale:${prov.id}:${prov.caqh_attest}`
    const priority = daysSince >= 120 ? 'Urgent' : 'High'

    const created = await createTask({
      task: taskText,
      due: isoToday(),
      priority,
      cat: 'CAQH',
      provId: prov.id,
      dedupKey,
    })

    if (created) await audit('Task Created', taskText, prov.id)
    alerts.push({ type: 'caqh_stale', daysSince, provName: name, provId: prov.id, created })
  }
}

// ─── Check: Enrollment SLA overdue ───────────────────────────────────────────
function parseTimelineMaxDays(timelineStr) {
  if (!timelineStr) return null
  const monthMatch = timelineStr.match(/(\d+)(?:-\d+)?\s*month/i)
  if (monthMatch) return parseInt(monthMatch[1], 10) * 30

  const rangeMatch = timelineStr.match(/\d+\s*-\s*(\d+)\s*day/i)
  if (rangeMatch) return parseInt(rangeMatch[1], 10)

  const singleMatch = timelineStr.match(/(\d+)\s*day/i)
  if (singleMatch) return parseInt(singleMatch[1], 10)

  return null
}

async function checkEnrollmentSlaOverdue(alerts) {
  const { data: enrollments, error } = await orgFrom('enrollments')
    .select('id, prov_id, pay_id, stage, submitted, timeline')
    .not('submitted', 'is', null)
    .not('stage', 'in', '(Active,Denied,Withdrawn)')
    .is('deleted_at', null)

  if (error) throw error

  const { data: providers } = await orgFrom('providers').select('id, fname, lname').is('deleted_at', null)
  const { data: payers } = await orgFrom('payers').select('id, name')

  const provMap  = Object.fromEntries((providers ?? []).map(p => [p.id, p]))
  const payerMap = Object.fromEntries((payers    ?? []).map(p => [p.id, p]))

  for (const enr of enrollments) {
    const maxDays = parseTimelineMaxDays(enr.timeline)
    if (!maxDays) continue

    const daysPending = Math.abs(daysUntil(enr.submitted))
    if (daysPending <= maxDays) continue

    const prov  = provMap[enr.prov_id]
    const payer = payerMap[enr.pay_id]
    const provName  = prov  ? `${prov.lname}, ${prov.fname}` : 'Unknown Provider'
    const payerName = payer?.name ?? 'Unknown Payer'

    const overdueDays = daysPending - maxDays
    const taskText = `📋 Enrollment SLA overdue by ${overdueDays}d: ${provName} @ ${payerName} — submitted ${daysPending}d ago (expected ≤${maxDays}d)`

    const dedupKey = `watchdog:sla:${enr.id}:${enr.submitted}`
    const created = await createTask({
      task: taskText,
      due: isoToday(),
      priority: overdueDays > 30 ? 'Urgent' : 'High',
      cat: 'Enrollment',
      provId: enr.prov_id,
      payId: enr.pay_id,
      dedupKey,
    })

    if (created) await audit('Task Created', taskText, enr.id)
    alerts.push({ type: 'sla_overdue', daysPending, maxDays, overdueDays, provName, payerName, enrollmentId: enr.id, created })
  }
}


// ─── Check: applications nobody has touched for weeks ────────────────────────
// One task per idle stretch: the key includes the last-change date, so a new task only appears after the application
// changes again and then goes quiet again. A scheduled follow-up date keeps an application off this list.
async function checkStalledEnrollments(alerts, settings) {
  const cfg = { payer: settings?.stall_days_payer, us: settings?.stall_days_us }
  const { data: enrollments, error } = await orgFrom('enrollments')
    .select('id, prov_id, pay_id, stage, submitted, followup, term_date, updated_at')
    .is('deleted_at', null)
  if (error) throw error
  const today = isoToday()
  const stalledRows = []
  for (const enr of enrollments ?? []) {
    if (!isInProgress(enr.stage)) continue
    const last = enr.updated_at ? todayIn(undefined, new Date(enr.updated_at)) : ''   // the practice's calendar day
    const st = stalledEnrollment({ stage: enr.stage, followup: enr.followup, termDate: enr.term_date, updated: last, submitted: enr.submitted }, today, cfg)
    if (st) stalledRows.push({ enr, st, last })
  }
  if (!stalledRows.length) return
  const { data: providers } = await orgFrom('providers').select('id, fname, lname').is('deleted_at', null)
  const { data: payers } = await orgFrom('payers').select('id, name')
  const provMap  = Object.fromEntries((providers ?? []).map(p => [p.id, p]))
  const payerMap = Object.fromEntries((payers    ?? []).map(p => [p.id, p]))
  for (const { enr, st, last } of stalledRows) {
    const prov = provMap[enr.prov_id]
    if (!prov) continue
    const provName = `${prov.lname}, ${prov.fname}`
    const payerName = payerMap[enr.pay_id]?.name ?? 'Unknown Payer'
    const taskText = `⏳ No movement for ${st.days}d: ${provName} @ ${payerName} (${enr.stage}). Follow up with the payer or set a follow-up date.`
    const dedupKey = `watchdog:stalled:${enr.id}:${last}`
    const { data: seen } = await orgFrom('tasks').select('id').eq('dedup_key', dedupKey).limit(1)   // any status
    let created = false
    if (!seen?.length) {
      created = await createTask({ task: taskText, due: today, priority: st.days >= st.threshold * 2 ? 'High' : 'Medium', cat: 'Follow-up', provId: enr.prov_id, payId: enr.pay_id, dedupKey })
      if (created) await audit('Task Created', taskText, enr.id)
    }
    alerts.push({ type: 'stalled', days: st.days, provName, payerName, enrollmentId: enr.id, created })
  }
}

// One run at a time per server instance: the checks keep the organization being processed in a module-level
// variable, so two overlapping runs on one instance (cron + manual call) could otherwise mix organizations.
let running = false
export default async function handler(req, res) {
  if (running) return res.status(409).json({ error: 'A watchdog run is already in progress. Try again in a minute.' })
  running = true
  try { return await runWatchdog(req, res) }
  finally { running = false; _orgId = null }
}

async function runWatchdog(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!enforceRateLimit(req, res, { max: 12, windowMs: 60_000, keyPrefix: 'watchdog:' })) return

  // Security: CRON_SECRET is REQUIRED — fail closed, not open.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[watchdog] CRON_SECRET not configured — endpoint disabled')
    return res.status(500).json({ error: 'Watchdog not configured. Set CRON_SECRET env var.' })
  }

  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when CRON_SECRET is set.
  // x-cron-secret is kept for GitHub Actions / manual calls. Secrets in the query string are no
  // longer accepted (they end up in logs and browser history).
  const authHeader = req.headers['authorization'] || ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : ''
  const provided = bearer || req.headers['x-cron-secret'] || ''
  if (!provided || !safeEqual(String(provided), cronSecret)) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // ─── Multi-organization: run every check once per organization ───────────
  // The service role bypasses RLS, so each organization is processed on its own and every
  // read/write is filtered by org_id. Alert window comes from that organization's settings.
  const { data: orgRows, error: orgErr } = await supabase.from('organizations').select('id, name')
  let orgList = orgRows || []
  if (orgErr || orgList.length === 0) {
    // Migration 014 not applied (or no orgs yet): fall back to the first membership's org.
    const { data: membership } = await supabase.from('organization_members').select('org_id').limit(1).maybeSingle()
    orgList = [{ id: membership?.org_id ?? null, name: 'default' }]
  }

  const alerts = []
  const errors = []
  const perOrg = []
  const digests = []

  for (const org of orgList) {
    _orgId = org.id
    const orgAlerts = []

    const { data: settings } = await (_orgId
      ? supabase.from('settings').select('*').eq('org_id', _orgId).maybeSingle()
      : supabase.from('settings').select('*').limit(1).maybeSingle())
    const alertDays = settings?.alert_days ?? DEFAULT_ALERT_DAYS

    const checks = [
      ['providerExpiries',    () => checkProviderExpiries(alertDays, orgAlerts)],
      ['stateLicenseExpiries', () => checkStateLicenseExpiries(alertDays, orgAlerts)],
      ['documentExpiries',    () => checkDocumentExpiries(alertDays, orgAlerts)],
      ['enrollmentFollowups', () => checkEnrollmentFollowups(orgAlerts)],
      ['caqhStaleness',       () => checkCaqhStaleness(orgAlerts)],
      ['enrollmentSlaOverdue',() => checkEnrollmentSlaOverdue(orgAlerts)],
      ['stalledEnrollments',  () => checkStalledEnrollments(orgAlerts, settings)],
      ['emailDigest',          async () => { digests.push({ org_id: _orgId, ...(await sendOrgDigest(org, alertDays, settings, req.query.digest === 'now')) }) }],
    ]
    for (const [name, fn] of checks) {
      try { await fn() }
      catch (e) { errors.push({ org_id: _orgId, check: name, message: e.message }) }
    }

    const createdHere = orgAlerts.filter(a => a.created === true).length
    await audit(
      'Watchdog Run Complete',
      `${orgAlerts.length} alerts found, ${createdHere} tasks created. Alert window: ${alertDays}d. org: ${org.name}`,
      'system'
    )
    alerts.push(...orgAlerts.map(a => ({ ...a, org_id: _orgId })))
    perOrg.push({ org_id: _orgId, name: org.name, alerts: orgAlerts.length, tasks_created: createdHere })
  }
  _orgId = null

  const created = alerts.filter(a => a.created === true).length

  return res.status(200).json({
    ran_at:     new Date().toISOString(),
    organizations: perOrg,
    digests,
    alerts,
    errors,
    summary: {
      total_alerts:   alerts.length,
      tasks_created:  created,
      expired:        alerts.filter(a => a.days !== null && a.days <= 0).length,
      critical:       alerts.filter(a => a.days !== null && a.days > 0 && a.days <= 14).length,
      warning:        alerts.filter(a => a.days !== null && a.days > 14).length,
    },
  })
}

/*
 ──────────────────────────────────────────────────────────────────────────────
  VERCEL CRON CONFIG (vercel.json)
  Schedule daily at 14:00 UTC (06:00 AM Pacific Time / Oregon)
 ──────────────────────────────────────────────────────────────────────────────

{
  "crons": [
    {
      "path": "/api/watchdog",
      "schedule": "0 14 * * *"
    }
  ]
}

Required environment variables:
  NEXT_PUBLIC_SUPABASE_URL      — your Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY     — service role key (server only, never client)
  CRON_SECRET                   — any random string, set in Vercel + vercel.json header
*/
