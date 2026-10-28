import test from 'node:test'
import assert from 'node:assert/strict'
import { ladderStep, ladderSeverity, ladderPriority, ladderKey, ladderLabel, stalledEnrollment, dayDiff, isInProgress } from '../lib/alertLadder.js'
import { buildAlertFeed } from '../lib/alerts.js'

test('ladder steps: 90 / 60 / 30 / 7, then due-or-expired', () => {
  assert.deepEqual([120, 91, 90, 61, 60, 31, 30, 8, 7, 1, 0, -5].map(d => ladderStep(d)), [null, null, 90, 90, 60, 60, 30, 30, 7, 7, 0, 0])
  assert.equal(ladderStep(null), null)
})
test('a shorter lookahead setting cuts the ladder off, a longer one still gets one early reminder', () => {
  assert.equal(ladderStep(45, 30), null)
  assert.equal(ladderStep(25, 30), 30)
  assert.equal(ladderStep(150, 180), 90)
  assert.equal(ladderStep(150, 90), null)
})
test('severity and priority follow the step', () => {
  assert.deepEqual([-1, 0, 7, 8, 30, 31].map(ladderSeverity), ['expired', 'critical', 'critical', 'warning', 'warning', 'notice'])
  assert.deepEqual([0, 7, 30, 60, 90].map(ladderPriority), ['Urgent', 'High', 'High', 'Medium', 'Medium'])
  assert.equal(ladderLabel(7), 'Within 7 days')
})
test('each step gets its own key, so a step fires once and a tighter step fires again', () => {
  assert.notEqual(ladderKey('b', 60), ladderKey('b', 30))
  assert.equal(ladderKey('b', 30), ladderKey('b', 30))
})

const E = o => ({ stage: 'Under Review', submitted: '2026-08-01', updated: '', followup: '', termDate: '', ...o })
test('stalled: quiet for 30+ days while the payer has it; sooner when we owe them something', () => {
  assert.equal(stalledEnrollment(E({ updated: '2026-10-10' }), '2026-10-26'), null)
  assert.equal(stalledEnrollment(E({ updated: '2026-09-26' }), '2026-10-26').days, 30)
  assert.equal(stalledEnrollment(E({ stage: 'Additional Info Requested', updated: '2026-10-12' }), '2026-10-26').onUs, true)
})
test('stalled: falls back to the submitted date, ignores finished stages and scheduled follow-ups', () => {
  assert.equal(stalledEnrollment(E(), '2026-10-26').days, dayDiff('2026-08-01', '2026-10-26'))
  for (const stage of ['Active', 'Denied', 'Not Started']) assert.equal(stalledEnrollment(E({ stage }), '2026-10-26'), null)
  assert.equal(isInProgress('Approved – Awaiting Contract'), true)
  assert.equal(stalledEnrollment(E({ followup: '2026-10-28' }), '2026-10-26'), null)   // follow-up scheduled
  assert.equal(stalledEnrollment(E({ followup: '2026-10-20' }), '2026-10-26').days > 0, true) // follow-up passed: stalled again
  assert.equal(stalledEnrollment(E({ termDate: '2026-09-01' }), '2026-10-26'), null)
})
test('the alert feed lists a stalled application and gives it an enrollment to open', () => {
  const d = new Date(); d.setDate(d.getDate() - 45); const p = n => String(n).padStart(2, '0')
  const old = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
  const feed = buildAlertFeed({ settings: {}, providers: [{ id: 'p1', fname: 'A', lname: 'B', status: 'Active' }], payers: [{ id: 'y1', name: 'Aetna' }],
    enrollments: [{ id: 'e1', provId: 'p1', payId: 'y1', stage: 'Under Review', submitted: old, updated: old }], tasks: [], licenses: [], requests: [] })
  const st = feed.find(i => i.type === 'stalled')
  assert.ok(st); assert.equal(st.enrId, 'e1'); assert.match(st.sub, /no change in 45 days/)
})

test('stall thresholds come from Settings, and bad values fall back to the defaults', async () => {
  const { stalledEnrollment: se, stallThreshold, stallConfig } = await import('../lib/alertLadder.js')
  const e = { stage: 'Under Review', submitted: '2026-08-01', updated: '2026-10-01', followup: '', termDate: '' }
  assert.equal(se(e, '2026-10-26'), null)                              // 25 quiet days, default 30
  assert.equal(se(e, '2026-10-26', { payer: 21 }).threshold, 21)       // stricter practice setting
  assert.equal(stallThreshold('Returned', { us: 3 }), 14)              // out of range: default
  assert.equal(stallThreshold('Returned', { us: '10' }), 14)           // not a whole number: default
  assert.deepEqual(stallConfig({ stallDaysPayer: 45, stallDaysUs: 10 }), { payer: 45, us: 10 })
})
