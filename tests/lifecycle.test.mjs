import test from 'node:test'
import assert from 'node:assert/strict'
import { lifecycleOf, caqhCurrent, LIFECYCLE } from '../lib/lifecycle.js'

const ymd = off => { const d = new Date(); d.setDate(d.getDate() + off); const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` }
const prov = (o = {}) => ({ id: 'p1', status: 'Active', npi: '1234567893', licenseExp: ymd(300), malExp: ymd(300), caqh: '123', caqhAttest: ymd(-10), caqhDue: ymd(100), ...o })
const db = (enrollments = [], extra = {}) => ({ enrollments, payers: [{ id: 'y1', name: 'Aetna' }], settings: {}, ...extra })
const enr = (stage, o = {}) => ({ id: 'e' + stage, provId: 'p1', payId: 'y1', stage, submitted: ymd(-5), updated: ymd(-2), followup: '', termDate: '', ...o })

test('the eight stages are in the directive order', () => assert.deepEqual(LIFECYCLE, ['New', 'Intake Pending', 'Documents Collecting', 'CAQH Active', 'Credentialing In Progress', 'Payer Enrollment', 'Active', 'Monitoring']))
test('a bare record is New; missing NPI or license is Intake Pending', () => {
  assert.equal(lifecycleOf(prov({ npi: '', licenseExp: '' }), db()).state, 'New')
  const r = lifecycleOf(prov({ npi: '' }), db()); assert.equal(r.state, 'Intake Pending'); assert.equal(r.next.label, 'Add the NPI')
  assert.equal(lifecycleOf(prov({ licenseExp: '' }), db()).state, 'Intake Pending')
})
test('missing malpractice or stale CAQH keeps the provider in Documents Collecting, with the right next step', () => {
  let r = lifecycleOf(prov({ malExp: '' }), db()); assert.equal(r.state, 'Documents Collecting'); assert.match(r.next.label, /malpractice/i)
  r = lifecycleOf(prov({ caqhAttest: ymd(-200), caqhDue: ymd(-20) }), db()); assert.equal(r.state, 'Documents Collecting'); assert.equal(r.next.target, 'caqh')
  r = lifecycleOf(prov({ licenseExp: ymd(-3) }), db()); assert.equal(r.next.target, 'license')
})
test('everything in place and no applications = CAQH Active, next step is the first application', () => {
  const r = lifecycleOf(prov(), db()); assert.equal(r.state, 'CAQH Active'); assert.equal(r.next.kind, 'enroll')
})
test('enrollment stages decide the middle of the journey; payer-side vs credentialing', () => {
  assert.equal(lifecycleOf(prov(), db([enr('Under Review')])).state, 'Credentialing In Progress')
  assert.equal(lifecycleOf(prov(), db([enr('Application Submitted')])).state, 'Payer Enrollment')
  assert.equal(lifecycleOf(prov(), db([enr('Denied')])).state, 'CAQH Active')   // ended applications do not count
})
test('Active while work remains, Monitoring when everything is quiet and current', () => {
  assert.equal(lifecycleOf(prov(), db([enr('Active'), enr('Under Review', { id: 'e2' })])).state, 'Active')
  const quiet = lifecycleOf(prov(), db([enr('Active')])); assert.equal(quiet.state, 'Monitoring'); assert.equal(quiet.done, true)
  assert.equal(lifecycleOf(prov({ malExp: ymd(20) }), db([enr('Active')])).state, 'Active')   // something expiring soon
})
test('a stalled application becomes the next step; inactive providers need nothing', () => {
  const r = lifecycleOf(prov(), db([enr('Under Review', { updated: ymd(-60) })])); assert.match(r.next.label, /Follow up with Aetna/); assert.equal(r.next.kind, 'enrollment')
  assert.equal(lifecycleOf(prov({ status: 'Inactive' }), db()).state, 'Inactive')
})
test('CAQH is current with a recent attestation or a future due date, not with neither', () => {
  assert.equal(caqhCurrent(prov()), true); assert.equal(caqhCurrent(prov({ caqh: '' })), false)
  assert.equal(caqhCurrent(prov({ caqhAttest: '', caqhDue: ymd(30) })), true)
  assert.equal(caqhCurrent(prov({ caqhAttest: ymd(-130), caqhDue: ymd(-5) })), false)
})
