/**
 * ─────────────────────────────────────────────────────────────────────────────
 *  CredFlow — Automated Expiration Watchdog
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

// Use service-role key so we bypass RLS (this is a server-only route)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // never expose this to the client
)

// ─── Configuration ────────────────────────────────────────────────────────────
const DEFAULT_ALERT_DAYS = 90   // warn X days before expiry
const DEFAULT_FOLLOWUP_OVERDUE = 0 // flag follow-ups on or past due date

// Which provider fields represent expiration dates (field → human label)
const PROVIDER_EXP_FIELDS = {
  license_exp:  'License',
  mal_exp:      'Malpractice Insurance',
  dea_exp:      'DEA Certificate',
  sup_exp:      'Supervisory Agreement',
  caqh_due:     'CAQH Attestation',
  recred:       'Re-credentialing',
  caqh_attest:  'CAQH Profile',
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

      alerts.push({ type: 'provider', severity, provId: prov.id, provName: name, label, days, field })
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

  if (error) throw error

  // Join provider names
  const { data: providers } = await supabase
    .from('providers')
    .select('id, fname, lname, cred')

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
    alerts.push({ type: 'document', days, label, provName, docId: doc.id })
  }
}

// ─── Check: Enrollment follow-ups ────────────────────────────────────────────
async function checkEnrollmentFollowups(alerts) {
  const { data: enrollments, error } = await supabase
    .from('enrollments')
    .select('id, prov_id, pay_id, stage, followup')
    .not('followup', 'is', null)
    .lte('followup', isoToday())  // on or before today
    .not('stage', 'in', '("Active","Denied")')

  if (error) throw error

  const { data: providers } = await supabase.from('providers').select('id, fname, lname')
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
    alerts.push({ type: 'followup', days, provName, payerName, enrollmentId: enr.id })
  }
}

// ─── Route handler ────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  // Security: require a secret to prevent unauthorized triggers
  const secret = req.headers['x-cron-secret'] ?? req.query.secret
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
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

  const created = alerts.filter(a => a.created).length

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
