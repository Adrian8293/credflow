import { daysUntil } from './helpers.js'
import { stalledEnrollment, stallConfig } from './alertLadder.js'
import { todayStr } from './matrix.js'

/**
 * Where a provider is in the credentialing journey, worked out from the data already on file, plus the ONE thing to
 * do next. Nothing is stored, so it can never be out of date or need a backfill, and it changes the moment the
 * records do.
 */
export const LIFECYCLE = ['New', 'Intake Pending', 'Documents Collecting', 'CAQH Active', 'Credentialing In Progress', 'Payer Enrollment', 'Active', 'Monitoring']

// Enrollment stages, grouped by who is holding the application.
const CREDENTIALING = ['Awaiting CAQH', 'Pending Verification', 'Under Review', 'Additional Info Requested', 'Returned']
const PAYER_SIDE = ['Application Submitted', 'Approved – Awaiting Contract', 'Contracted – Pending Effective Date']
const ENDED = ['Denied', 'Withdrawn', 'Terminated']

/** CAQH counts as current when the profile exists and was attested within 120 days (or its due date is still ahead). */
export function caqhCurrent(prov) {
  if (!prov.caqh) return false
  const since = daysUntil(prov.caqhAttest)
  if (since !== null && since >= -120) return true
  const due = daysUntil(prov.caqhDue)
  return due !== null && due >= 0
}

const live = e => !ENDED.includes(e.stage) && !(e.termDate && daysUntil(e.termDate) !== null && daysUntil(e.termDate) < 0)

export function lifecycleOf(prov, db, today = todayStr()) {
  const enrs = (db.enrollments || []).filter(e => e.provId === prov.id && live(e))
  const payerName = e => (db.payers || []).find(p => p.id === e.payId)?.name || 'the payer'
  const alertDays = db.settings?.alertDays ?? 90

  const licD = daysUntil(prov.licenseExp), malD = daysUntil(prov.malExp)
  const hasNpi = !!prov.npi
  const hasLicense = licD !== null
  const licenseOk = licD !== null && licD >= 0, malOk = malD !== null && malD >= 0
  const hasActive = enrs.some(e => e.stage === 'Active')
  const credentialing = enrs.filter(e => CREDENTIALING.includes(e.stage))
  const payerSide = enrs.filter(e => PAYER_SIDE.includes(e.stage))
  const started = enrs.filter(e => e.stage !== 'Not Started')

  // Soonest credential inside the reminder window (for the "Monitoring" test and the last next-step).
  const expiring = [
    { label: 'License', d: licD, kind: 'license' }, { label: 'Malpractice', d: malD, kind: 'malpractice' },
    { label: 'DEA', d: daysUntil(prov.deaExp), kind: 'dea' }, { label: 'CAQH attestation', d: daysUntil(prov.caqhDue), kind: 'caqh' },
  ].filter(x => x.d !== null && x.d <= alertDays).sort((a, b) => a.d - b.d)

  // ── Which stage ──
  let state
  if (prov.status === 'Inactive') state = 'Inactive'
  else if (hasActive) state = (credentialing.length || payerSide.length || expiring.length) ? 'Active' : 'Monitoring'
  else if (credentialing.length) state = 'Credentialing In Progress'
  else if (payerSide.length) state = 'Payer Enrollment'
  else if (!hasNpi && !hasLicense) state = 'New'
  else if (!hasNpi || !hasLicense) state = 'Intake Pending'
  else if (!malOk || !caqhCurrent(prov) || !licenseOk) state = 'Documents Collecting'
  else state = 'CAQH Active'

  // ── The one next step, most important gap first ──
  let next
  if (state === 'Inactive') next = { label: 'No action: provider is inactive', kind: 'none' }
  else if (!hasNpi) next = { label: 'Add the NPI', detail: 'Needed on every application.', kind: 'edit' }
  else if (!hasLicense) next = { label: 'Add the license and its expiry date', kind: 'edit' }
  else if (!licenseOk) next = { label: 'Renew the expired license', detail: `Expired ${Math.abs(licD)} days ago.`, kind: 'renew', target: 'license' }
  else if (malD === null) next = { label: 'Add malpractice insurance and its expiry date', kind: 'edit' }
  else if (!malOk) next = { label: 'Renew the expired malpractice policy', detail: `Expired ${Math.abs(malD)} days ago.`, kind: 'renew', target: 'malpractice' }
  else if (!prov.caqh) next = { label: 'Add the CAQH ID', detail: 'Most payers pull credentials from CAQH.', kind: 'edit' }
  else if (!caqhCurrent(prov)) next = { label: 'Re-attest CAQH', detail: 'The last attestation is more than 120 days old, so payers may reject it.', kind: 'renew', target: 'caqh' }
  else if (!started.length && !enrs.length) next = { label: 'Start the first payer application', kind: 'enroll' }
  else {
    const stalled = enrs.map(e => ({ e, st: stalledEnrollment(e, today, stallConfig(db.settings)) })).find(x => x.st)
    if (stalled) next = { label: `Follow up with ${payerName(stalled.e)}`, detail: `No change in ${stalled.st.days} days.`, kind: 'enrollment', enrId: stalled.e.id }
    else if (expiring.length) next = { label: `Renew ${expiring[0].label}`, detail: expiring[0].d < 0 ? `Expired ${Math.abs(expiring[0].d)} days ago.` : `Due in ${expiring[0].d} days.`, kind: 'renew', target: expiring[0].kind }
    else if (credentialing.length || payerSide.length) { const e = credentialing[0] || payerSide[0]; next = { label: `Check on ${payerName(e)}: ${e.stage}`, kind: 'enrollment', enrId: e.id } }
    else if (!hasActive) next = { label: 'Start the first payer application', kind: 'enroll' }
    else next = { label: 'Nothing needed right now', detail: 'Everything is current. Reminders start before anything expires.', kind: 'none' }
  }

  return { state, index: LIFECYCLE.indexOf(state), steps: LIFECYCLE, next, done: next.kind === 'none' }
}
