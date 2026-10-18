/**
 * packet.js — builds a printable one-page-style credentialing packet for a provider.
 * Credentialing data only (no patient data). Opened in its own window so the browser's print / "Save as PDF"
 * prints exactly the packet. Everything interpolated into HTML goes through esc().
 */
import { allLicenses } from './licenses.js'
import { daysUntil, fmtDate } from './helpers.js'

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const val = (v) => (v ? esc(v) : '<span class="muted">—</span>')

function expiryCell(date) {
  if (!date) return '<span class="muted">—</span>'
  const d = daysUntil(date)
  const label = fmtDate(date)
  if (d === null) return esc(label)
  if (d < 0) return `${esc(label)} <span class="tag bad">Expired ${Math.abs(d)}d ago</span>`
  if (d <= 60) return `${esc(label)} <span class="tag warn">${d}d left</span>`
  return esc(label)
}

/** Items a reviewer would flag. Pure function — also usable for a future "ready to submit" check. */
export function packetGaps(prov, db) {
  const gaps = []
  if (!prov.npi) gaps.push('No NPI on file')
  if (!prov.caqh) gaps.push('No CAQH ID on file')
  else if (prov.caqhDue && daysUntil(prov.caqhDue) < 0) gaps.push('CAQH attestation is overdue')
  const lic = allLicenses(db, prov)
  if (!lic.length) gaps.push('No license on file')
  lic.forEach(l => { if (l.expires && daysUntil(l.expires) < 0 && l.status !== 'Inactive') gaps.push(`${l.state || 'Primary'} license expired ${fmtDate(l.expires)}`) })
  if (!prov.malPolicy && !prov.malCarrier) gaps.push('No malpractice insurance on file')
  else if (prov.malExp && daysUntil(prov.malExp) < 0) gaps.push(`Malpractice coverage expired ${fmtDate(prov.malExp)}`)
  if (prov.dea && prov.deaExp && daysUntil(prov.deaExp) < 0) gaps.push(`DEA expired ${fmtDate(prov.deaExp)}`)
  return gaps
}

export function buildPacketHtml(prov, db, practice = '') {
  const name = `${prov.fname || ''} ${prov.lname || ''}`.trim()
  const licenses = allLicenses(db, prov)
  const docs = (db.documents || []).filter(d => d.provId === prov.id)
  const enrolls = (db.enrollments || []).filter(e => e.provId === prov.id)
  const payerName = (id) => (db.payers || []).find(p => p.id === id)?.name || '—'
  const gaps = packetGaps(prov, db)
  const today = new Date().toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })

  const row = (cells) => `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`
  const table = (head, rows, empty) => rows.length
    ? `<table><thead><tr>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`
    : `<p class="muted">${empty}</p>`

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Credentialing Packet — ${esc(name)}</title>
<style>
  *{box-sizing:border-box} body{font:12px/1.45 Inter,Arial,sans-serif;color:#111827;margin:32px auto;max-width:820px;padding:0 20px}
  h1{font-size:20px;margin:0} h2{font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#374151;border-bottom:1.5px solid #D1D5DB;padding-bottom:4px;margin:22px 0 8px}
  .sub{color:#4B5563;margin-top:2px} .muted{color:#9CA3AF}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 24px} .grid div span{color:#6B7280;display:inline-block;min-width:118px}
  table{width:100%;border-collapse:collapse;margin-top:4px} th{text-align:left;font-size:10.5px;color:#6B7280;border-bottom:1px solid #D1D5DB;padding:4px 6px} td{padding:5px 6px;border-bottom:1px solid #F3F4F6;vertical-align:top}
  .tag{font-size:10px;font-weight:700;border-radius:99px;padding:1px 7px;margin-left:4px} .tag.bad{background:#FEE4E2;color:#B42318} .tag.warn{background:#FEF0C7;color:#B54708}
  .gaps{background:#FFFAEB;border:1px solid #FEDF89;border-radius:8px;padding:8px 14px;margin-top:14px} .gaps ul{margin:4px 0 0 16px;padding:0}
  .ok{background:#ECFDF3;border:1px solid #ABEFC6;border-radius:8px;padding:8px 14px;margin-top:14px;color:#067647}
  footer{margin-top:28px;border-top:1px solid #E5E7EB;padding-top:8px;color:#6B7280;font-size:10.5px}
  .bar{position:sticky;top:0;background:#fff;padding:8px 0;margin-bottom:8px;display:flex;gap:8px} button{font:inherit;padding:6px 14px;border-radius:6px;border:1px solid #D1D5DB;background:#1565C0;color:#fff;cursor:pointer}
  @media print{.bar{display:none} body{margin:0;max-width:none} h2{break-after:avoid} table,.gaps{break-inside:avoid}}
</style></head><body>
<div class="bar"><button onclick="window.print()">Print / Save as PDF</button></div>
<h1>${esc(name)}${prov.cred ? ', ' + esc(prov.cred) : ''}</h1>
<div class="sub">${esc(prov.spec || '')}${prov.spec && practice ? ' · ' : ''}${esc(practice)} · Credentialing packet generated ${today}</div>
${gaps.length ? `<div class="gaps"><strong>Needs attention (${gaps.length})</strong><ul>${gaps.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>` : '<div class="ok">✓ No gaps found in the items checked below.</div>'}
<h2>Identifiers</h2>
<div class="grid">
  <div><span>NPI</span>${val(prov.npi)}</div><div><span>Taxonomy</span>${val([prov.taxonomyCode, prov.taxonomyDesc].filter(Boolean).join(' — '))}</div>
  <div><span>CAQH ID</span>${val(prov.caqh)}</div><div><span>CAQH attested</span>${prov.caqhAttest ? esc(fmtDate(prov.caqhAttest)) : '<span class="muted">—</span>'}</div>
  <div><span>Medicaid ID</span>${val(prov.medicaid)}</div><div><span>CAQH re-attest due</span>${expiryCell(prov.caqhDue)}</div>
  <div><span>PTAN</span>${val(prov.ptan)}</div><div><span>Email / phone</span>${val([prov.email, prov.phone].filter(Boolean).join(' · '))}</div>
</div>
<h2>Licenses</h2>
${table(['State', 'Type', 'Number', 'Expires'], licenses.map(l => row([esc(l.state || '—') + (l.primary ? ' <span class="muted">(primary)</span>' : ''), val(l.licenseType), val(l.number), expiryCell(l.expires)])), 'No licenses on file.')}
<h2>DEA &amp; supervision</h2>
<div class="grid"><div><span>DEA number</span>${val(prov.dea)}</div><div><span>DEA expires</span>${expiryCell(prov.deaExp)}</div>
<div><span>Supervisor</span>${val(prov.supervisor)}</div><div><span>Supervision expires</span>${expiryCell(prov.supExp)}</div></div>
<h2>Malpractice insurance</h2>
<div class="grid"><div><span>Carrier</span>${val(prov.malCarrier)}</div><div><span>Policy number</span>${val(prov.malPolicy)}</div><div><span>Expires</span>${expiryCell(prov.malExp)}</div></div>
<h2>Documents on file</h2>
${table(['Type', 'Issuer', 'Expires', 'File'], docs.map(d => row([val(d.type), val(d.issuer), expiryCell(d.exp), d.filePath || d.fileUrl ? 'Attached' : '<span class="muted">No file</span>'])), 'No documents on file.')}
<h2>Payer enrollments</h2>
${table(['Payer', 'Type', 'Stage', 'Submitted', 'Effective'], enrolls.map(e => row([esc(payerName(e.payId)), esc(e.level === 'Group' ? 'Group' + (e.groupName ? ': ' + e.groupName : '') : 'Individual'), esc(e.stage), e.submitted ? esc(fmtDate(e.submitted)) : '<span class="muted">—</span>', e.effective ? esc(fmtDate(e.effective)) : '<span class="muted">—</span>'])), 'No enrollments yet.')}
<footer>Confidential — credentialing information for authorized use only. Printed from Lacentra on ${today}. Verify against primary sources before submission.</footer>
</body></html>`
}

/** Opens the packet in a new window. Returns false if the browser blocked the pop-up. */
export function openPacketWindow(prov, db, practice) {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open(); w.document.write(buildPacketHtml(prov, db, practice)); w.document.close()
  return true
}
