/**
 * Roster reminders: turns a contract's free-text "roster cadence" ("quarterly", "every 2 months"…) and the date the
 * last roster was sent into "roster due" items for the Today inbox. Pure functions.
 */
import { daysUntil, fmtDate } from './helpers.js'

/** Days between rosters, or null if the text is not a recognisable schedule ("as needed", blank…). */
export function cadenceDays(text) {
  const t = String(text || '').toLowerCase().trim()
  if (!t || /as needed|ad hoc|on request|none|n\/a/.test(t)) return null
  const ev = t.match(/every\s+(\d+)\s*(day|week|month)/)
  if (ev) return +ev[1] * ({ day: 1, week: 7, month: 30 })[ev[2]]
  if (/bi-?week|every other week|fortnight/.test(t)) return 14
  if (/week/.test(t)) return 7
  if (/semi-?annual|bi-?annual|twice a year|6 month|six month/.test(t)) return 182
  if (/quarter|3 month|three month/.test(t)) return 91
  if (/month/.test(t)) return 30
  if (/annual|yearly|once a year|12 month|year/.test(t)) return 365
  return null
}

export function addDays(iso, n) {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Inbox items for rosters that are overdue or due within 14 days (or never recorded as sent). */
export function buildRosterDue(contracts = [], { payers = [], entities = [] } = {}) {
  const today = new Date().toISOString().slice(0, 10)
  const out = []
  contracts.forEach(c => {
    const n = cadenceDays(c.rosterCadence)
    if (!n) return
    if (c.termDate && c.termDate < today) return
    if (c.contractEffective && c.contractEffective > today) return
    const payer = payers.find(p => p.id === c.payerId)?.name || 'Payer'
    const group = entities.find(e => e.id === c.entityId)?.name
    const where = [group, [c.state, c.productLine].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
    const base = { type: 'roster-due', group: 'applications', contractId: c.id, payerId: c.payerId, entityId: c.entityId, title: `${payer} roster` }
    if (!c.lastRosterSent) {
      out.push({ ...base, sev: 'notice', days: 0, sub: `${where ? where + ' · ' : ''}${c.rosterCadence}, no send recorded yet` })
      return
    }
    const due = addDays(c.lastRosterSent, n)
    const d = daysUntil(due)
    if (d === null || d > 14) return
    out.push({
      ...base, sev: d < 0 ? 'warning' : 'notice', days: d,
      sub: `${where ? where + ' · ' : ''}${d < 0 ? `overdue by ${-d} day${d === -1 ? '' : 's'} (was due ${fmtDate(due)})` : d === 0 ? 'due today' : `due ${fmtDate(due)} (${d}d)`}`,
    })
  })
  return out
}
