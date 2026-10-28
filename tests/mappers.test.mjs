import test from 'node:test'
import assert from 'node:assert/strict'
import { providerFromDb, providerToDb } from '../lib/mappers.js'

const NEW = ['gender', 'languages', 'accepts_new_patients', 'telehealth']

test('before migration 023 the new columns are never sent, so saving a provider still works', () => {
  const p = providerFromDb({ id: '1', fname: 'A', lname: 'B' })
  assert.ok(!('gender' in p))
  assert.deepEqual(Object.keys(providerToDb(p)).filter(k => NEW.includes(k)), [])
})

test('after migration 023 the answers round-trip, and clearing one really clears it', () => {
  const p = providerFromDb({ id: '1', fname: 'A', lname: 'B', gender: 'Female', languages: 'English', accepts_new_patients: true, telehealth: false })
  assert.deepEqual([p.gender, p.languages, p.acceptsNew, p.telehealth], ['Female', 'English', 'Yes', 'No'])
  const db = providerToDb({ ...p, gender: '', acceptsNew: '' })
  assert.equal(db.gender, null); assert.equal(db.accepts_new_patients, null); assert.equal(db.telehealth, false)
})

test('enrollment date source: only sent once the row carries it, and round-trips', async () => {
  const { enrollmentToDb, enrollmentFromDb } = await import('../lib/mappers.js')
  assert.equal('dates_source' in enrollmentToDb({ id: '1', stage: 'Active' }), false)
  const row = enrollmentToDb({ id: '1', stage: 'Active', datesSource: 'Phone call', datesVerified: '2026-10-24' })
  assert.equal(row.dates_source, 'Phone call'); assert.equal(row.dates_verified_on, '2026-10-24')
  assert.equal(enrollmentFromDb({ id: '1', dates_source: 'Phone call', dates_verified_on: '2026-10-24' }).datesSource, 'Phone call')
  assert.equal('datesSource' in enrollmentFromDb({ id: '1' }), false)
})

test('task owner is carried only when the column exists (safe before migration 030)', async () => {
  const { taskFromDb, taskToDb } = await import('../lib/mappers.js')
  assert.equal('assigneeId' in taskFromDb({ id: 't1', task: 'x' }), false)
  assert.equal(taskFromDb({ id: 't1', task: 'x', assignee_id: null }).assigneeId, '')
  assert.equal(taskFromDb({ id: 't1', task: 'x', assignee_id: 'u1' }).assigneeId, 'u1')
  assert.equal('assignee_id' in taskToDb({ id: 't1', task: 'x' }), false)
  assert.equal(taskToDb({ id: 't1', task: 'x', assigneeId: '' }).assignee_id, null)
  assert.equal(taskToDb({ id: 't1', task: 'x', assigneeId: 'u1' }).assignee_id, 'u1')
})

test('provider owner and stall settings are safe before migration 032', async () => {
  const { providerFromDb, providerToDb, settingsFromDb } = await import('../lib/mappers.js')
  assert.equal('assigneeId' in providerFromDb({ id: '1' }), false)
  assert.equal(providerFromDb({ id: '1', assignee_id: 'u1' }).assigneeId, 'u1')
  assert.equal('assignee_id' in providerToDb({ id: '1', fname: 'A' }), false)
  assert.equal(providerToDb({ id: '1', assigneeId: '' }).assignee_id, null)
  const before = settingsFromDb({})
  assert.equal(before.stallSaved, false); assert.equal(before.stallDaysPayer, 30); assert.equal(before.stallDaysUs, 14)
  assert.equal(settingsFromDb({ stall_days_payer: 45, stall_days_us: 10 }).stallSaved, true)
})
