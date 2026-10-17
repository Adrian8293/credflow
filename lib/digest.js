/**
 * lib/digest.js — builds the credentialing digest email from raw database rows (snake_case).
 * Pure functions: no network, no Supabase. Server only (used by pages/api/watchdog.js).
 *
 * Contents are deliberately minimal: provider names, credential types and dates. No patient data,
 * no ID numbers (license/NPI/DEA numbers are never included). Email is not guaranteed encrypted in
 * transit end to end, so the digest points people back to the app for details.
 */

const PROVIDER_FIELDS = [
  ['license_exp', 'State license'], ['mal_exp', 'Malpractice insurance'], ['dea_exp', 'DEA registration'],
  ['caqh_due', 'CAQH re-attestation'], ['sup_exp', 'Supervision agreement'], ['recred', 'Re-credentialing'],
]
export const MILESTONE_DAYS = [30, 14, 7, 3, 1, 0]

export const dayDiff = (dateStr, todayISO) => {
  if (!dateStr) return null
  const d = Date.parse(String(dateStr).slice(0, 10)), t = Date.parse(todayISO)
  return Number.isNaN(d) ? null : Math.round((d - t) / 86_400_000)
}
const sevOf = (days) => (days < 0 ? 'expired' : days <= 14 ? 'urgent' : days <= 30 ? 'soon' : 'upcoming')
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const nameOf = (p) => (p ? `${p.fname || ''} ${p.lname || ''}`.trim() + (p.cred ? `, ${p.cred}` : '') : 'Unknown provider')
const when = (days) => (days < 0 ? `expired ${-days}d ago` : days === 0 ? 'expires today' : `in ${days}d`)

/**
 * mode 'weekly'  → everything within alertDays, plus overdue items.
 * mode 'urgent'  → only items hitting a milestone today (30/14/7/3/1/0 days), follow-ups and tasks due today.
 */
export function buildDigest({ orgName, appUrl, todayISO, alertDays = 90, mode = 'weekly', providers = [], licenses = [], enrollments = [], tasks = [], requests = [], payers = [] }) {
  const items = []
  const provById = Object.fromEntries(providers.map(p => [p.id, p]))
  const keep = (days, limit) => (mode === 'weekly' ? days <= limit : MILESTONE_DAYS.includes(days))

  providers.forEach(p => PROVIDER_FIELDS.forEach(([f, label]) => {
    const days = dayDiff(p[f], todayISO)
    if (days === null || !keep(days, alertDays)) return
    items.push({ kind: 'Credential', sev: sevOf(days), days, who: nameOf(p), what: `${label} ${when(days)}` })
  }))

  licenses.forEach(l => {
    if (l.status === 'Inactive') return
    const days = dayDiff(l.expires, todayISO)
    const p = provById[l.provider_id]
    if (days === null || !p || !keep(days, alertDays)) return
    items.push({ kind: 'Credential', sev: sevOf(days), days, who: nameOf(p), what: `${l.state} license${l.license_type ? ` (${l.license_type})` : ''} ${when(days)}` })
  })

  tasks.forEach(t => {
    if (t.status === 'Done') return
    const days = dayDiff(t.due, todayISO)
    if (days === null) return
    if (mode === 'weekly' ? days > 7 : days !== 0) return
    items.push({ kind: 'Task', sev: days < 0 ? 'expired' : 'urgent', days, who: nameOf(provById[t.prov_id]), what: `${t.task || 'Task'} · ${days < 0 ? `${-days}d overdue` : days === 0 ? 'due today' : `due in ${days}d`}` })
  })

  const payName = Object.fromEntries(payers.map(y => [y.id, y.name]))
  enrollments.forEach(e => {
    if (['Active', 'Denied'].includes(e.stage)) return
    const days = dayDiff(e.followup, todayISO)
    if (days === null) return
    if (mode === 'weekly' ? days > 7 : days !== 0) return
    items.push({ kind: 'Follow-up', sev: days < 0 ? 'expired' : 'urgent', days, who: nameOf(provById[e.prov_id]), what: `${payName[e.pay_id] || 'Payer'} follow-up ${days < 0 ? `${-days}d overdue` : days === 0 ? 'due today' : `in ${days}d`}` })
  })

  if (mode === 'weekly') {
    const waiting = requests.filter(r => r.status === 'submitted')
    if (waiting.length) items.push({ kind: 'Review', sev: 'urgent', days: 0, who: `${waiting.length} upload${waiting.length === 1 ? '' : 's'}`, what: 'submitted by providers, waiting for your review' })
  }

  const order = { expired: 0, urgent: 1, soon: 2, upcoming: 3 }
  items.sort((a, b) => (order[a.sev] - order[b.sev]) || (a.days - b.days))

  const LIMIT = 20
  const shown = items.slice(0, LIMIT), more = items.length - shown.length
  const link = appUrl ? appUrl.replace(/\/$/, '') : ''
  const counts = { expired: items.filter(i => i.sev === 'expired').length, urgent: items.filter(i => i.sev === 'urgent').length, total: items.length }

  const subject = mode === 'weekly'
    ? (items.length ? `${orgName}: weekly credentialing digest (${items.length} item${items.length === 1 ? '' : 's'})` : `${orgName}: weekly credentialing digest, all clear`)
    : `${orgName}: ${items.length} credentialing deadline${items.length === 1 ? '' : 's'} need attention`

  const lines = shown.map(i => `• ${i.who}: ${i.what}${i.sev === 'expired' ? ' [OVERDUE]' : ''}`)
  const text = [
    mode === 'weekly' ? `Weekly credentialing digest for ${orgName}` : `Credentialing alert for ${orgName}`,
    '',
    items.length ? lines.join('\n') : 'Nothing needs attention this week.',
    more > 0 ? `…and ${more} more in the app.` : '',
    '',
    link ? `Open Lacentra: ${link}` : '',
    '',
    'You get this because you are an owner or admin. Turn it off under Settings → Notifications.',
  ].filter(l => l !== undefined).join('\n')

  const color = { expired: '#b42318', urgent: '#b54708', soon: '#8a6d00', upcoming: '#475467' }
  const rows = shown.map(i => `<tr><td style="padding:8px 0;border-bottom:1px solid #eaecf0;font:14px/1.4 Arial,sans-serif"><strong>${esc(i.who)}</strong><br><span style="color:${color[i.sev]}">${esc(i.what)}</span></td></tr>`).join('')
  const html = `<div style="max-width:560px;margin:0 auto;font:14px/1.5 Arial,sans-serif;color:#101828">
<h2 style="margin:0 0 4px;font-size:18px">${mode === 'weekly' ? 'Weekly credentialing digest' : 'Credentialing alert'}</h2>
<div style="color:#667085;margin-bottom:14px">${esc(orgName)}</div>
${items.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>` : '<p>Nothing needs attention this week. ✓</p>'}
${more > 0 ? `<p style="color:#667085">…and ${more} more in the app.</p>` : ''}
${link ? `<p style="margin-top:18px"><a href="${esc(link)}" style="background:#4f46e5;color:#fff;text-decoration:none;padding:9px 16px;border-radius:6px;display:inline-block">Open Lacentra</a></p>` : ''}
<p style="color:#98a2b3;font-size:12px;margin-top:22px">You get this because you are an owner or admin. Turn it off under Settings → Notifications.</p></div>`

  return { subject, text, html, items, counts }
}
