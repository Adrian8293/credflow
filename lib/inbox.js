import { buildAlertFeed } from './alerts.js'
import { daysUntil, fmtDate, pNameShort, payName } from './helpers.js'
import { buildRosterDue } from './rosterDue.js'

/**
 * Today inbox: ONE prioritized list of everything that needs a person.
 * Built on buildAlertFeed (the same source as the bell and sidebar badge) plus the
 * "coming up soon" items that are not alerts yet (tasks due within 7 days, follow-ups within 14).
 *
 * group: which filter chip an item belongs to.
 */
const GROUP = {
  credential: 'credentials', 'license-gap': 'credentials', 'req-review': 'requests', 'req-overdue': 'requests',
  task: 'tasks', 'caqh-auth': 'applications', 'roster-due': 'applications', followup: 'applications', 'enr-recred': 'applications', 'enr-term': 'applications',
}
const SEV_ORDER = { expired: 0, critical: 1, warning: 2, notice: 3 }

export function buildInbox(db, extra = {}) {
  const items = buildAlertFeed(db).map(a => ({ ...a, group: GROUP[a.type] || 'other' }))

  // Payer rosters that are due (contracts are loaded separately by the Today page).
  if (extra.contracts?.length) items.push(...buildRosterDue(extra.contracts, { payers: db.payers, entities: extra.entities }))

  // Tasks due within 7 days (overdue ones are already in the alert feed).
  ;(db.tasks || []).forEach(t => {
    if (t.status === 'Done' || !t.due) return
    const d = daysUntil(t.due)
    if (d === null || d < 0 || d > 7) return
    const prov = (db.providers || []).find(p => p.id === t.provId)
    items.push({
      type: 'task', group: 'tasks', sev: d <= 1 ? 'warning' : 'notice', days: d, taskId: t.id,
      title: t.task || t.title || 'Task',
      sub: `${prov ? `${prov.fname} ${prov.lname} · ` : ''}${d === 0 ? 'due today' : `due in ${d}d`}`,
      provId: t.provId,
    })
  })

  // Payers still waiting for the provider to authorize them in CAQH (not yet active or denied).
  ;(db.enrollments || []).forEach(e => {
    if (e.caqhStatus !== 'needed' || e.stage === 'Active' || e.stage === 'Denied') return
    items.push({
      type: 'caqh-auth', group: 'applications', sev: 'warning', days: 0, enrId: e.id, provId: e.provId,
      title: pNameShort(db.providers, e.provId),
      sub: `${payName(db.payers, e.payId)} · provider must authorize this payer in CAQH`,
    })
  })

  // Follow-ups 4 to 14 days out (follow-ups due within 3 days are already alerts).
  ;(db.enrollments || []).forEach(e => {
    const d = daysUntil(e.followup)
    if (d === null || d <= 3 || d > 14) return
    items.push({
      type: 'followup', group: 'applications', sev: 'notice', days: d, enrId: e.id, provId: e.provId,
      title: pNameShort(db.providers, e.provId),
      sub: `${payName(db.payers, e.payId)} · follow-up in ${d}d`,
    })
  })

  return items.sort((a, b) => {
    const so = (SEV_ORDER[a.sev] ?? 4) - (SEV_ORDER[b.sev] ?? 4)
    return so !== 0 ? so : (a.days ?? 0) - (b.days ?? 0)
  })
}

export const INBOX_FILTERS = [
  ['all', 'All'], ['urgent', 'Urgent'], ['requests', 'Requests'],
  ['credentials', 'Credentials'], ['applications', 'Applications'], ['tasks', 'Tasks'],
]

export function inboxFilter(items, key) {
  if (key === 'all') return items
  if (key === 'urgent') return items.filter(i => i.sev === 'expired' || i.sev === 'critical')
  return items.filter(i => i.group === key)
}

export { fmtDate }
