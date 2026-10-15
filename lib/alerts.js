import { getProviderAlerts, daysUntil, fmtDate, pNameShort, payName } from './helpers.js'

// Single source of truth for alerts: the topbar bell, flyout and sidebar badge all use this.
export function buildAlertFeed(db) {
  const settings   = db.settings || {}
  const alertDays  = settings.alertDays ?? 90
  const items      = []

  // Credential expiry alerts per provider
  db.providers.forEach(prov => {
    getProviderAlerts(prov, settings).forEach(a => {
      items.push({
        type:    'credential',
        sev:     a.days < 0 ? 'expired' : a.days <= 14 ? 'critical' : a.days <= 30 ? 'warning' : 'notice',
        days:    a.days,
        title:   `${prov.fname} ${prov.lname}${prov.cred ? `, ${prov.cred}` : ''}`,
        sub:     `${a.label} · ${a.days < 0 ? `expired ${Math.abs(a.days)}d ago` : `expires in ${a.days}d`}`,
        date:    fmtDate(prov[a.field]),
        provId:  prov.id,
      })
    })
  })

  // Overdue tasks
  db.tasks.filter(t => t.status !== 'Done' && t.due && daysUntil(t.due) < 0).forEach(t => {
    const prov  = db.providers.find(p => p.id === t.provId)
    const overdue = Math.abs(daysUntil(t.due))
    items.push({
      type:   'task',
      sev:    'critical',
      days:   daysUntil(t.due),
      title:  t.task || t.title || 'Task overdue',
      sub:    `${prov ? `${prov.fname} ${prov.lname} · ` : ''}${overdue}d overdue`,
      provId: t.provId,
    })
  })

  // Enrollment follow-ups due in ≤3 days
  db.enrollments.filter(e => {
    const d = daysUntil(e.followup || e.followUp)
    return d !== null && d <= 3
  }).forEach(e => {
    const d = daysUntil(e.followup || e.followUp)
    items.push({
      type:   'followup',
      sev:    d < 0 ? 'critical' : 'notice',
      days:   d,
      title:  pNameShort(db.providers, e.provId),
      sub:    `${payName(db.payers, e.payId || e.payerId)} · follow-up ${d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? 'due today' : `in ${d}d`}`,
      provId: e.provId,
      enrId:  e.id,
    })
  })

  // Enrollment dates: payer recredentialing due and upcoming terminations.
  db.enrollments.forEach(e => {
    if ((e.stage || '') === 'Denied') return
    const who = pNameShort(db.providers, e.provId)
    const pay = payName(db.payers, e.payId || e.payerId)
    const rd = daysUntil(e.recred)
    if (rd !== null && rd <= alertDays) {
      items.push({
        type: 'enr-recred', sev: rd < 0 ? 'expired' : rd <= 14 ? 'critical' : rd <= 30 ? 'warning' : 'notice', days: rd,
        title: `${who} · ${pay}`,
        sub: `Payer recredentialing ${rd < 0 ? `overdue ${Math.abs(rd)}d` : `due in ${rd}d`}`,
        date: fmtDate(e.recred), provId: e.provId, enrId: e.id,
      })
    }
    const td = daysUntil(e.termDate)
    if (td !== null && td <= 60 && td >= -30) {
      items.push({
        type: 'enr-term', sev: td < 0 ? 'critical' : td <= 14 ? 'warning' : 'notice', days: td,
        title: `${who} · ${pay}`,
        sub: td < 0 ? `Terminated ${Math.abs(td)}d ago, confirm roster removal` : `Termination date in ${td}d`,
        date: fmtDate(e.termDate), provId: e.provId, enrId: e.id,
      })
    }
  })

  // Sort: expired/critical first, then by urgency (most overdue / fewest days)
  return items.sort((a, b) => {
    const sevOrder = { expired: 0, critical: 1, warning: 2, notice: 3 }
    const so = (sevOrder[a.sev] ?? 4) - (sevOrder[b.sev] ?? 4)
    return so !== 0 ? so : a.days - b.days
  })
}

