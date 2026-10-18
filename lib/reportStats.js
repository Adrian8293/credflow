/**
 * reportStats.js — real report numbers computed from the data (no placeholders).
 * Pure functions so they can be unit-tested.
 */
import { daysUntil } from './helpers.js'

export const PERIODS = [
  { id: '90', label: 'Last 90 days', days: 90 },
  { id: '365', label: 'Last 12 months', days: 365 },
  { id: 'all', label: 'All time', days: null },
]

/** Days ago the application was submitted (0 = today); null when it has no submitted date. */
const daysAgo = (e) => { const d = daysUntil(e.submitted); return d === null ? null : -d }

export function inPeriod(e, days) {
  if (days === null) return true
  const a = daysAgo(e)
  return a !== null && a >= 0 && a < days
}
export function inPreviousPeriod(e, days) {
  if (days === null) return false
  const a = daysAgo(e)
  return a !== null && a >= days && a < days * 2
}

/** Whole days from submission to the first effective date we have; null when not computable. */
export function turnaroundDays(e) {
  const end = e.credentialingEffective || e.effective
  if (!e.submitted || !end) return null
  const d = Math.round((new Date(end + 'T00:00:00') - new Date(e.submitted + 'T00:00:00')) / 86400000)
  return Number.isFinite(d) && d >= 0 ? d : null
}

const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null)

export function turnaroundStats(enrollments, payers) {
  const all = enrollments.map(e => ({ e, d: turnaroundDays(e) })).filter(x => x.d !== null)
  const byPayer = {}
  all.forEach(({ e, d }) => {
    const name = payers.find(p => p.id === e.payId)?.name || 'Unknown'
    ;(byPayer[name] = byPayer[name] || []).push(d)
  })
  const rows = Object.entries(byPayer).map(([name, ds]) => ({ name, days: avg(ds), n: ds.length })).sort((a, b) => b.days - a.days)
  const fastest = all.length ? all.reduce((m, x) => (x.d < m.d ? x : m)) : null
  return {
    avgDays: avg(all.map(x => x.d)), n: all.length, byPayer: rows,
    fastest: fastest ? { days: fastest.d, payer: payers.find(p => p.id === fastest.e.payId)?.name || 'Unknown' } : null,
  }
}

/** Submissions per month for the last `months` months, oldest first. */
export function monthlySubmissions(enrollments, months = 6, now = new Date()) {
  const out = []
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: d.toLocaleDateString('en-US', { month: 'short' }), val: 0 })
  }
  enrollments.forEach(e => { const m = out.find(x => e.submitted && e.submitted.startsWith(x.key)); if (m) m.val++ })
  return out
}

/**
 * A provider is compliant when license AND malpractice are on file and not expired, and CAQH (if tracked) is not overdue.
 * Missing license/malpractice counts as NOT compliant (previously it counted as compliant). Inactive providers are excluded.
 */
export function complianceStats(providers) {
  const live = providers.filter(p => p.status !== 'Inactive')
  const ok = (d) => d !== null && d >= 0
  const compliant = live.filter(p => ok(daysUntil(p.licenseExp)) && ok(daysUntil(p.malExp)) && (daysUntil(p.caqhDue) === null || daysUntil(p.caqhDue) >= 0))
  return { compliant: compliant.length, total: live.length, pct: live.length ? Math.round((compliant.length / live.length) * 100) : null }
}

/** CAQH re-attestations: share of providers with a due date that is not overdue. */
export function caqhOnTime(providers) {
  const tracked = providers.filter(p => p.status !== 'Inactive' && p.caqhDue)
  const good = tracked.filter(p => daysUntil(p.caqhDue) >= 0).length
  return { good, total: tracked.length, pct: tracked.length ? Math.round((good / tracked.length) * 100) : null }
}

/** Open (not Active/Denied) enrollments that have a follow-up date set. */
export function followupCoverage(enrollments) {
  const open = enrollments.filter(e => !['Active', 'Denied'].includes(e.stage))
  const withDate = open.filter(e => e.followup).length
  return { withDate, total: open.length, pct: open.length ? Math.round((withDate / open.length) * 100) : null }
}

export function toCsv(rows) {
  if (!rows.length) return ''
  const cols = Object.keys(rows[0])
  const cell = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  return [cols.map(cell).join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n')
}
