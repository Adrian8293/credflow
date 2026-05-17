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
 *         { "crons": [{ "path": "/api/watchdog", "schedule": "0 7 * * *" }] }
 *       Secure it with CRON_SECRET (see bottom of this file).
 *
 *    B) External cron (Railway, Render, cron-job.org)
 *       Hit GET /api/watchdog?secret=YOUR_CRON_SECRET every 24 h.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'
import { enforceRateLimit } from '../../lib/api-middleware'

// Use service-role key so we bypass RLS (this is a server-only route)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // never expose this to the client
)

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
function daysUntil(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86_400_000)
}

function isoToday() {
  return new Date().toISOString().slice(0, 10)
}

// Deduplicate: don't create a task if an open one with this dedup key exists
async function taskExists(dedupKey) {
  const { data } = await supabase
    .from('tasks')
    .select('id')
    .eq('dedup_key', dedupKey)
    .in('status', ['Open', 'In Progress'])
    .limit(1)
  return (data?.length ?? 0) > 0
}

async function createTask({ task, due, priority, cat, provId, payId, dedupKey }) {
  if (await taskExists(dedupKey)) return false
  await supabase.from('tasks').insert([{
    task,
    due,
    priority,
    status: 'Open',
    cat,
    prov_id: provId ?? null,
    pay_id:  payId  ?? null,
    dedup_key: dedupKey,
  }])
  return true
}

async function audit(action, detail, entity) {
  await supabase.from('audit_log').insert([{
    type:   'Watchdog',
    action,
    detail,
    entity: entity ?? 'system',
  }])
}

// ─── Check: Provider credential fields ───────────────────────────────────────
async function checkProviderExpiries(alertDays, alerts) {
  const { data: providers, error } = await supabase
    .from('providers')
    .select('id, fname, lname, cred, ' + Object.keys(PROVIDER_EXP_FIELDS).join(', '))
    .eq('status', 'Active')
    .is('deleted_at', null)   // BUG-003: exclude soft-deleted providers

  if (error) throw error

  for (const prov of providers) {
    const name = `${prov.lname}, ${prov.fname}${prov.cred ? ` ${prov.cred}` : ''}`
    for (const [field, label] of Object.entries(PROVIDER_EXP_FIELDS)) {
      const days = daysUntil(prov[field])
      if (days === null || days > alertDays) continue

      const severity = days <= 0 ? 'EXPIRED' : days <= 14 ? 'CRITICAL' : days <= 30 ? 'HIGH' : 'WARNING'
      const priority = days <= 0 ? 'Urgent' : days <= 14 ? 'High' : days <= 30 ? 'High' : 'Medium'
      const taskText = days <= 0
        ? `⚠️ EXPIRED: ${label} for ${name} expired ${Math.abs(days)}d ago`
        : `🔔 ${label} expiring in ${days}d — ${name}`

      const dedupKey = `watchdog:provider:${prov.id}:${field}:${prov[field]}`
      const created = await createTask({
        task:    taskText,
        due:     prov[field],
        priority,
        cat:     'Credential Expiry',
        provId:  prov.id,
        dedupKey,
      })

      if (created) {
        await audit('Task Created', taskText, prov.id)
      }

      // D-05 FIX: Store the createTask() return value on the alert object.
      // Previously, alerts.filter(a => a.created) always returned [] because
      // the created flag was never set, making tasks_created always report 0.
      alerts.push({ type: 'provider', severity, provId: prov.id, provName: name, label, days, field, created })
    }
  }
}

// ─── Check: Documents table ───────────────────────────────────────────────────
async function checkDocumentExpiries(alertDays, alerts) {
  const today = isoToday()
  // Fetch docs expiring within alertDays (filter in JS to handle timezone edge)
  const { data: docs, error } = await supabase
    .from('documents')
    .select('id, prov_id, type, issuer, number, exp')
    .not('exp', 'is', null)
    .gte('exp', new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)) // include 30d past
    .is('deleted_at', null)   // BUG-003: exclude soft-deleted documents

  if (error) throw error

  // Join provider names — exclude deleted providers
  const { data: providers } = await supabase
    .from('providers')
    .select('id, fname, lname, cred')
    .is('deleted_at', null)   // BUG-003: exclude deleted providers from name map

  const provMap = Object.fromEntries((providers ?? []).map(p => [p.id, p]))

  for (const doc of docs) {
    const days = daysUntil(doc.exp)
    if (days === null || days > alertDays) continue

    const prov = provMap[doc.prov_id]
    const provName = prov ? `${prov.lname}, ${prov.fname}` : 'Unknown Provider'
    const label = [doc.type, doc.issuer].filter(Boolean).join(' — ')
    const priority = days <= 0 ? 'Urgent' : days <= 14 ? 'High' : 'Medium'
    const taskText = days <= 0
      ? `⚠️ EXPIRED Document: ${label} for ${provName}`
      : `📄 Document expiring in ${days}d: ${label} — ${provName}`

    const dedupKey = `watchdog:doc:${doc.id}:${doc.exp}`
    const created = await createTask({
      task: taskText,
      due: doc.exp,
      priority,
      cat: 'Document Expiry',
      provId: doc.prov_id,
      dedupKey,
    })

    if (created) await audit('Task Created', taskText, doc.prov_id)
    // D-05 FIX: include created flag on every alert object
    alerts.push({ type: 'document', days, label, provName, docId: doc.id, created })
  }
}

// ─── Check: Enrollment follow-ups ────────────────────────────────────────────
async function checkEnrollmentFollowups(alerts) {
  const { data: enrollments, error } = await supabase
    .from('enrollments')
    .select('id, prov_id, pay_id, stage, followup')
    .not('followup', 'is', null)
    .lte('followup', isoToday())               // on or before today
    .not('stage', 'in', '(Active,Denied)')     // BUG-002: unquoted CSV — PostgREST format
    .is('deleted_at', null)                    // BUG-003: exclude soft-deleted enrollments

  if (error) throw error

  const { data: providers } = await supabase
    .from('providers')
    .select('id, fname, lname')
    .is('deleted_at', null)   // BUG-003: exclude deleted providers from name map
  const { data: payers }    = await supabase.from('payers').select('id, name')
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
    // D-05 FIX: include created flag on every alert object
    alerts.push({ type: 'followup', days, provName, payerName, enrollmentId: enr.id, created })
  }
}

// ─── Check: CAQH attestation staleness ───────────────────────────────────────
// W-02 FIX: CAQH auto-deactivates a provider profile after 120 days of no attestation.
// The previous watchdog only tracked caqh_due (the deadline), not caqh_attest (the
// date of last actual attestation). A provider could have caqh_due in the future but
// a stale caqh_attest that already triggered auto-deactivation — causing silent
// credentialing verification failures with payers.
const CAQH_ATTEST_WARNING_DAYS = 110  // warn at 110 days — 10-day buffer before 120d cutoff

async function checkCaqhStaleness(alerts) {
  const cutoff = new Date(Date.now() - CAQH_ATTEST_WARNING_DAYS * 86_400_000)
    .toISOString().slice(0, 10)

  const { data: providers, error } = await supabase
    .from('providers')
    .select('id, fname, lname, cred, caqh_attest, caqh_num')
    .eq('status', 'Active')
    .is('deleted_at', null)
    .not('caqh_attest', 'is', null)
    .lte('caqh_attest', cutoff)  // last attestation was more than 110 days ago

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
// W-03 FIX: Payer processing timelines (e.g. "60-90 days") were stored as strings
// with no parsing, age calculation, or escalation. Enrollments could sit in Submitted
// status for 200+ days with no alert. This check parses the timeline string, calculates
// days_pending, and creates an escalation task when the expected processing window has passed.
function parseTimelineMaxDays(timelineStr) {
  if (!timelineStr) return null
  // Match patterns: "60-90 days", "90 days", "3-4 months", "2 months"
  const monthMatch = timelineStr.match(/(\d+)(?:-\d+)?\s*month/i)
  if (monthMatch) return parseInt(monthMatch[1], 10) * 30

  const rangeMatch = timelineStr.match(/\d+\s*-\s*(\d+)\s*day/i)
  if (rangeMatch) return parseInt(rangeMatch[1], 10)

  const singleMatch = timelineStr.match(/(\d+)\s*day/i)
  if (singleMatch) return parseInt(singleMatch[1], 10)

  return null
}

async function checkEnrollmentSlaOverdue(alerts) {
  // Only check enrollments in active processing stages — not terminal stages
  const { data: enrollments, error } = await supabase
    .from('enrollments')
    .select('id, prov_id, pay_id, stage, submitted, timeline')
    .not('submitted', 'is', null)
    .not('stage', 'in', '(Active,Denied,Withdrawn)')
    .is('deleted_at', null)

  if (error) throw error

  const { data: providers } = await supabase
    .from('providers').select('id, fname, lname').is('deleted_at', null)
  const { data: payers } = await supabase
    .from('payers').select('id, name')

  const provMap  = Object.fromEntries((providers ?? []).map(p => [p.id, p]))
  const payerMap = Object.fromEntries((payers    ?? []).map(p => [p.id, p]))

  for (const enr of enrollments) {
    const maxDays = parseTimelineMaxDays(enr.timeline)
    if (!maxDays) continue  // no timeline to compare against

    const daysPending = Math.abs(daysUntil(enr.submitted))
    if (daysPending <= maxDays) continue  // still within expected window

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


export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!enforceRateLimit(req, res, { max: 12, windowMs: 60_000, keyPrefix: 'watchdog:' })) return

  // Security: CRON_SECRET is REQUIRED — fail closed, not open.
  // Without this env var, the endpoint is disabled entirely.
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    console.error('[watchdog] CRON_SECRET not configured — endpoint disabled')
    return res.status(500).json({ error: 'Watchdog not configured. Set CRON_SECRET env var.' })
  }

  const secret = req.headers['x-cron-secret'] ?? req.query.secret
  if (!secret || secret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Fetch alert_days setting from DB (fall back to default)
  const { data: settings } = await supabase
    .from('settings')
    .select('alert_days')
    .eq('id', 1)
    .single()

  const alertDays = settings?.alert_days ?? DEFAULT_ALERT_DAYS

  const alerts = []
  const errors = []

  try { await checkProviderExpiries(alertDays, alerts) }
  catch (e) { errors.push({ check: 'providerExpiries', message: e.message }) }

  try { await checkDocumentExpiries(alertDays, alerts) }
  catch (e) { errors.push({ check: 'documentExpiries', message: e.message }) }

  try { await checkEnrollmentFollowups(alerts) }
  catch (e) { errors.push({ check: 'enrollmentFollowups', message: e.message }) }

  // W-02: CAQH attestation staleness (>110 days = at risk of auto-deactivation)
  try { await checkCaqhStaleness(alerts) }
  catch (e) { errors.push({ check: 'caqhStaleness', message: e.message }) }

  // W-03: Enrollment SLA overdue (pending beyond the payer's stated timeline)
  try { await checkEnrollmentSlaOverdue(alerts) }
  catch (e) { errors.push({ check: 'enrollmentSlaOverdue', message: e.message }) }

  // D-05 FIX: Count tasks where the created flag is explicitly true
  const created = alerts.filter(a => a.created === true).length

  await audit(
    'Watchdog Run Complete',
    `${alerts.length} alerts found, ${created} tasks created. Alert window: ${alertDays}d`,
    'system'
  )

  return res.status(200).json({
    ran_at:     new Date().toISOString(),
    alert_days: alertDays,
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
  COMPANION: useWatchdog() hook
  FILE: lib/useWatchdog.js

  Drop this in lib/ and call it from the main index.js to surface alerts
  in the dashboard header without a full page refresh.
 ──────────────────────────────────────────────────────────────────────────────

import { useState, useEffect, useCallback } from 'react'

const POLL_MS = 60 * 60 * 1000 // re-check every 60 min (client-side)

export function useWatchdog() {
  const [alerts, setAlerts]   = useState([])
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState(null)

  const run = useCallback(async (trigger = false) => {
    setLoading(true)
    try {
      const res = await fetch('/api/watchdog' + (trigger ? '?trigger=1' : ''))
      if (!res.ok) return
      const data = await res.json()
      setAlerts(data.alerts ?? [])
      setLastRun(data.ran_at)
    } finally {
      setLoading(false)
    }
  }, [])

  // Auto-poll
  useEffect(() => {
    run()
    const interval = setInterval(run, POLL_MS)
    return () => clearInterval(interval)
  }, [run])

  const urgentCount = alerts.filter(a => a.days !== null && a.days <= 14).length

  return { alerts, loading, lastRun, urgentCount, runNow: () => run(true) }
}
*/

/*
 ──────────────────────────────────────────────────────────────────────────────
  VERCEL CRON CONFIG (vercel.json)
  Schedule daily at 07:00 UTC (midnight Oregon time approximately)
 ──────────────────────────────────────────────────────────────────────────────

{
  "crons": [
    {
      "path": "/api/watchdog",
      "schedule": "0 7 * * *"
    }
  ]
}

Required environment variables:
  NEXT_PUBLIC_SUPABASE_URL      — your Supabase project URL
  SUPABASE_SERVICE_ROLE_KEY     — service role key (server only, never client)
  CRON_SECRET                   — any random string, set in Vercel + vercel.json header
*/
