import { getProviderAlerts, daysUntil, fmtDate, pNameShort, payName } from './helpers.js'
import { licenseGaps } from './licenses.js'

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

  // Additional state licenses (primary license is already covered above)
  ;(db.licenses || []).forEach(l => {
    if (l.status === 'Inactive') return
    const prov = db.providers.find(p => p.id === l.provId)
    const d = daysUntil(l.expires)
    if (!prov || prov.status === 'Inactive' || d === null || d > alertDays) return
    items.push({
      type: 'credential',
      sev:  d < 0 ? 'expired' : d <= 14 ? 'critical' : d <= 30 ? 'warning' : 'notice',
      days: d,
      title: `${prov.fname} ${prov.lname}${prov.cred ? `, ${prov.cred}` : ''}`,
      sub:  `${l.state} license${l.licenseType ? ` (${l.licenseType})` : ''} · ${d < 0 ? `expired ${Math.abs(d)}d ago` : `expires in ${d}d`}`,
      date: fmtDate(l.expires),
      provId: prov.id,
    })
  })

  // Enrollments in a state where the provider holds no current license
  licenseGaps(db).forEach(g => {
    items.push({
      type: 'license-gap', sev: 'warning', days: 0,
      title: `${g.prov.fname} ${g.prov.lname}${g.prov.cred ? `, ${g.prov.cred}` : ''}`,
      sub:  `No current ${g.state} license on file · ${g.enrollments.length} enrollment${g.enrollments.length === 1 ? '' : 's'} in ${g.state}`,
      provId: g.prov.id,
    })
  })

  // Overdue tasks
  db.tasks.filter(t => t.status !== 'Done' && t.due && daysUntil(t.due) < 0).forEach(t => {
    const prov  = db.providers.find(p => p.id === t.provId)
    const overdue = Math.abs(daysUntil(t.due))
    items.push({
      type:   'task',
      taskId: t.id,
      sev:    'critical',
      days:   daysUntil(t.due),
      title:  t.task || t.title || 'Task overdue',
      sub:    `${prov ? `${prov.fname} ${prov.lname} · ` : ''}${overdue}d overdue`,
      provId: t.provId,
    })
  })

  // Enrollment follow-ups due in ≤3 days
  db.enrollments.filter(e => {
    if ((e.stage || '') === 'Denied') return false
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
    const ended = daysUntil(e.termDate) !== null && daysUntil(e.termDate) < 0   // terminated: no recredentialing to chase
    if (rd !== null && rd <= alertDays && !ended) {
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

  // Provider-portal document requests: submitted ones wait for staff review; open ones can be overdue.
  ;(db.requests || []).forEach(r => {
    const who = pNameShort(db.providers, r.provId)
    if (r.status === 'submitted') {
      items.push({
        type: 'req-review', sev: 'warning', days: 0,
        title: `${who} · ${r.title}`,
        sub: 'Uploaded, waiting for your review',
        provId: r.provId, reqId: r.id,
      })
    } else if (r.status === 'requested' && r.due) {
      const d = daysUntil(r.due)
      if (d !== null && d < 0) {
        items.push({
          type: 'req-overdue', sev: 'warning', days: d,
          title: `${who} · ${r.title}`,
          sub: `Requested document ${Math.abs(d)}d overdue`,
          date: fmtDate(r.due), provId: r.provId, reqId: r.id,
        })
      }
    }
  })

  // Sort: expired/critical first, then by urgency (most overdue / fewest days)
  return items.sort((a, b) => {
    const sevOrder = { expired: 0, critical: 1, warning: 2, notice: 3 }
    const so = (sevOrder[a.sev] ?? 4) - (sevOrder[b.sev] ?? 4)
    return so !== 0 ? so : a.days - b.days
  })
}

