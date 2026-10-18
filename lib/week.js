/**
 * week.js — "Next 7 days": everything with a real due date from today through six days out, grouped by day.
 * Items without a date (license gaps, uploads waiting for review) are left out; they live in "Needs attention".
 */
import { buildInbox } from './inbox.js'
import { addDaysFromToday } from '../constants/followupCadence.js'

const DATED = new Set(['credential', 'task', 'followup', 'enr-recred', 'enr-term'])

export function buildWeek(db, now = new Date()) {
  const items = buildInbox(db).filter(i => DATED.has(i.type) && typeof i.days === 'number' && i.days >= 0 && i.days <= 6)
  const overdue = buildInbox(db).filter(i => DATED.has(i.type) && typeof i.days === 'number' && i.days < 0).length
  const groups = []
  for (let d = 0; d < 7; d++) {
    const date = addDaysFromToday(d, now)
    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
    const label = d === 0 ? 'Today' : d === 1 ? 'Tomorrow'
      : `${dt.toLocaleDateString('en-US', { weekday: 'long' })} ${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}`
    groups.push({ day: d, date, label, items: items.filter(i => i.days === d) })
  }
  return { groups, total: items.length, overdue }
}
